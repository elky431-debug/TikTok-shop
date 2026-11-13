import { z } from 'zod';
import { isClean } from './guard';
import { askStructured, type StructuredResult } from './structured';
import type { StyleProfile } from './types';

/**
 * Style personnel : l'utilisateur colle 3 à 5 textes de ses propres vidéos (ce qu'il dit) ; l'IA en tire un profil
 * (ton, longueur des phrases, expressions, façons de commencer et de finir) réutilisé à chaque génération.
 * Sans clé d'IA : une analyse simple et honnête du texte (comptages, expressions répétées), marquée « simulée ».
 */

export const STYLE_MIN_SAMPLES = 3;
export const STYLE_MAX_SAMPLES = 5;
export const STYLE_MIN_CHARS = 40;
export const STYLE_MAX_CHARS = 2000;

export const StyleProfileSchema = z.object({
  summary: z.string().describe('Le style en deux phrases, au tutoiement (« Tu parles… »).'),
  tone: z.string().describe('Le ton en quelques mots (ex. « direct et complice »).'),
  sentence_length: z.enum(['courtes', 'moyennes', 'longues']),
  address: z.enum(['tutoiement', 'vouvoiement', 'mixte']).describe('Comment le créateur s’adresse au spectateur.'),
  expressions: z.array(z.string()).describe('2 à 6 expressions qui reviennent, recopiées des textes.'),
  openings: z.array(z.string()).describe('1 à 3 façons de commencer une vidéo, tirées des textes.'),
  closings: z.array(z.string()).describe('1 à 3 façons de conclure, tirées des textes.'),
  do: z.array(z.string()).describe('2 à 4 choses à garder dans ses scripts.'),
  avoid: z.array(z.string()).describe('0 à 3 choses à éviter (tics, longueurs).'),
});

const SYSTEM = `Tu analyses le style oral d'un créateur TikTok Shop français à partir des textes de ses propres vidéos.
Tu décris sa façon de parler pour qu'un autre rédacteur puisse écrire comme lui : ton, longueur des phrases, tutoiement ou
vouvoiement, expressions qui reviennent (recopiées telles quelles depuis les textes, sans les inventer), façons de commencer
et de conclure. Tu écris en français, au tutoiement. Tu ne juges pas, tu ne promets rien, tu ne parles ni d'argent ni de
résultats. N'ajoute aucune expression qui n'apparaît pas dans les textes.`;

/** Nettoie les textes collés : espaces, longueur, doublons ; garde au plus 5 textes. */
export function cleanSamples(samples: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of samples) {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, STYLE_MAX_CHARS);
    const key = text.toLowerCase();
    if (text.length < STYLE_MIN_CHARS || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= STYLE_MAX_SAMPLES) break;
  }
  return out;
}

/** Garde ce qui est propre et utilisable dans un script : pas d'interdit, pas trop long, sans doublon. */
export function sanitizeProfile(profile: StyleProfile): StyleProfile {
  const list = (items: string[], max: number, maxLength = 80) =>
    [...new Set(items.map((x) => x.replace(/\s+/g, ' ').trim().replace(/^[«"“]\s*|\s*[»"”]$/g, '')))]
      .filter((x) => x && x.length <= maxLength && isClean(x))
      .slice(0, max);
  return {
    summary: isClean(profile.summary) ? profile.summary.trim().slice(0, 400) : 'Style direct et naturel.',
    tone: profile.tone.trim().slice(0, 80) || 'naturel',
    sentence_length: profile.sentence_length,
    address: profile.address,
    expressions: list(profile.expressions, 6, 60),
    openings: list(profile.openings, 3),
    closings: list(profile.closings, 3),
    do: list(profile.do, 4, 140),
    avoid: list(profile.avoid, 3, 140),
  };
}

export async function analyzeStyle(samples: string[]): Promise<StructuredResult<StyleProfile>> {
  const result = await askStructured({
    name: 'style_perso',
    schema: StyleProfileSchema,
    system: SYSTEM,
    prompt: [
      ...samples.map((s, i) => `## Vidéo ${i + 1}\n${s}`),
      'Décris le style de ce créateur. Les expressions, débuts et fins sont recopiés des textes ci-dessus.',
    ].join('\n\n'),
    maxTokens: 2000,
    simulate: () => simulateStyle(samples),
  });
  return { ...result, data: sanitizeProfile(result.data) };
}

// ---------------------------------------------------------------------------
// Analyse simulée : de vrais comptages sur le texte, rien d'inventé.
// ---------------------------------------------------------------------------

const STOP = new Set(
  'le la les un une des de du d l et ou à a au aux en dans sur pour par avec ce cet cette ces c est ça ca que qui quoi ne pas plus je j tu te t il elle on nous vous ils elles me m se s mon ma mes ton ta tes son sa ses y'.split(' '),
);

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .split(/[^a-zà-öø-ÿœ0-9-]+/)
    .filter(Boolean);
}

/** Expressions de 2 à 4 mots présentes dans au moins deux textes différents (les plus longues d'abord). */
export function recurringExpressions(samples: string[], max = 6): string[] {
  const counts = new Map<string, Set<number>>();
  samples.forEach((sample, index) => {
    const w = words(sample);
    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i + n <= w.length; i++) {
        const gram = w.slice(i, i + n);
        if (STOP.has(gram[0]) && STOP.has(gram[n - 1])) continue;
        if (gram.every((x) => STOP.has(x))) continue;
        const key = gram.join(' ');
        if (!counts.has(key)) counts.set(key, new Set());
        counts.get(key)!.add(index);
      }
    }
  });
  const found: string[] = [];
  for (const [key] of [...counts.entries()]
    .filter(([, set]) => set.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || b[0].split(' ').length - a[0].split(' ').length || a[0].localeCompare(b[0]))) {
    if (found.some((f) => f.includes(key))) continue;
    found.push(key);
    if (found.length >= max) break;
  }
  return found;
}

export function simulateStyle(samples: string[]): StyleProfile {
  const all = samples.join(' ');
  const sents = samples.flatMap(sentences);
  const avg = sents.length ? sents.reduce((n, s) => n + words(s).length, 0) / sents.length : 10;
  const w = words(all);
  const tu = w.filter((x) => ['tu', 'te', 't', 'ton', 'ta', 'tes', 'toi'].includes(x)).length;
  const vous = w.filter((x) => ['vous', 'votre', 'vos'].includes(x)).length;
  const address: StyleProfile['address'] = tu && vous ? (tu >= vous * 3 ? 'tutoiement' : vous >= tu * 3 ? 'vouvoiement' : 'mixte') : vous ? 'vouvoiement' : 'tutoiement';
  const exclamations = (all.match(/!/g) ?? []).length / Math.max(1, sents.length);
  const questions = (all.match(/\?/g) ?? []).length / Math.max(1, sents.length);
  const tone = exclamations >= 0.3 ? 'énergique et enthousiaste' : questions >= 0.25 ? 'complice, avec beaucoup de questions' : 'posé et direct';
  const sentence_length: StyleProfile['sentence_length'] = avg <= 9 ? 'courtes' : avg <= 16 ? 'moyennes' : 'longues';
  const firstOf = (s: string) => sentences(s)[0] ?? '';
  const lastOf = (s: string) => sentences(s).at(-1) ?? '';
  const trim = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(' ');
  const expressions = recurringExpressions(samples);
  return {
    summary: `Tu parles avec des phrases ${sentence_length} (${Math.round(avg)} mots en moyenne), sur un ton ${tone}. Analyse simple du texte, sans IA : relis-la et ajuste-la.`,
    tone,
    sentence_length,
    address,
    expressions,
    openings: [...new Set(samples.map((s) => trim(firstOf(s), 8)).filter(Boolean))].slice(0, 3),
    closings: [...new Set(samples.map((s) => trim(lastOf(s), 10)).filter(Boolean))].slice(0, 3),
    do: [
      sentence_length === 'courtes' ? 'Garder des phrases très courtes, une idée par phrase.' : 'Garder ton rythme, mais couper les phrases de plus de 15 mots.',
      address === 'vouvoiement' ? 'Tu vouvoies dans tes vidéos : le studio garde le tutoiement, à toi de l’adapter.' : 'Parler au spectateur comme à un ami.',
      ...(expressions.length ? ['Reprendre une de tes expressions par vidéo, pas plus.'] : []),
    ],
    avoid: avg > 16 ? ['Les phrases trop longues à l’oral.'] : [],
  };
}

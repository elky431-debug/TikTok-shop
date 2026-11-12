import { z } from 'zod';
import { askStructured } from '@/lib/ai/structured';
import type { VideoFacts } from '@/lib/data/nexscope';
import { videoStyleLabel } from '@/lib/profile-rules';
import type { Product, Profile } from '@/lib/db/types';

/**
 * Analyse d'une vidéo virale : à partir du texte de la vidéo (collé par l'utilisateur, ou description lue chez
 * Nexscope par son lien), l'IA découpe la vidéo, dit ce qui marche, et écrit une version adaptée à un produit de
 * l'utilisateur. Aucun téléchargement ni visionnage de la vidéo : seulement des données documentées et le texte fourni.
 */
export const SEGMENT_ROLES = ['accroche', 'probleme', 'demonstration', 'preuve', 'appel_action'] as const;
export const SEGMENT_LABELS: Record<(typeof SEGMENT_ROLES)[number], string> = {
  accroche: 'Accroche',
  probleme: 'Problème',
  demonstration: 'Démonstration',
  preuve: 'Preuve',
  appel_action: 'Appel à l’action',
};

export const AnalysisSchema = z.object({
  summary: z.string(),
  hook_type: z.string(),
  segments: z
    .array(z.object({ from_s: z.number().int().min(0), to_s: z.number().int().min(1), role: z.enum(SEGMENT_ROLES), text: z.string() }))
    .min(3)
    .max(8),
  strengths: z.array(z.string()).min(2).max(5),
  adapted: z.object({ title: z.string(), lines: z.array(z.string()).min(3).max(10) }),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export interface AnalysisData {
  url: string | null;
  text: string;
  facts: VideoFacts | null;
  product_id: string | null;
  product_name: string | null;
  analysis: Analysis;
  simulated: boolean;
}

/** Identifiant d'une vidéo dans un lien TikTok (…/video/1234…), null sinon. */
export function tiktokVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!/(^|\.)tiktok\.com$/.test(parsed.hostname)) return null;
    return /\/video\/(\d{8,25})/.exec(parsed.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

const SYSTEM = `Tu analyses des vidéos TikTok Shop françaises pour un créateur affilié. Tu écris en français simple, au
tutoiement. Tu ne promets aucun résultat ni aucun gain. Tu t'appuies uniquement sur le texte et les chiffres fournis ; si
la durée est inconnue, tu supposes 30 secondes et tu le dis dans le résumé. La version adaptée doit être originale (pas
une copie), au style du créateur, et finir par la mention « collaboration commerciale ».`;

export async function analyzeVideo(input: {
  text: string;
  facts: VideoFacts | null;
  product: Pick<Product, 'name' | 'description' | 'price_cents'> | null;
  profile: Pick<Profile, 'video_style' | 'example_phrase' | 'first_name'>;
}) {
  const duration = input.facts?.duration_s ?? null;
  const facts = input.facts
    ? [
        duration !== null ? `durée ${duration} s` : null,
        input.facts.views !== null ? `${input.facts.views} vues` : null,
        input.facts.sales !== null ? `${input.facts.sales} ventes estimées` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : 'aucun chiffre disponible';
  return askStructured({
    name: 'analyse_video',
    schema: AnalysisSchema,
    system: SYSTEM,
    prompt: [
      `## Texte de la vidéo\n${input.text.slice(0, 5000)}`,
      `## Chiffres\n${facts}`,
      `## Produit du créateur\n${input.product ? `${input.product.name} — ${input.product.description || 'pas de description'}` : 'aucun : adapte à un produit générique de la même catégorie'}`,
      `## Style du créateur\n${videoStyleLabel(input.profile.video_style)}${input.profile.example_phrase ? `, phrase type : « ${input.profile.example_phrase} »` : ''}`,
      'Découpe la vidéo seconde par seconde (accroche, problème, démonstration, preuve, appel à l’action), dis ce qui fonctionne et pourquoi, puis écris la version adaptée.',
    ].join('\n\n'),
    maxTokens: 4000,
    simulate: () => simulateAnalysis(input.text, duration, input.product?.name ?? null),
  });
}

/** Analyse simulée (sans clé d'IA) : découpe le texte en phrases, honnêtement marquée comme simulée à l'écran. */
export function simulateAnalysis(text: string, duration: number | null, productName: string | null): Analysis {
  const total = duration ?? 30;
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = SEGMENT_ROLES.map((role, i) => ({
    role,
    from_s: Math.round((total * i) / SEGMENT_ROLES.length),
    to_s: Math.max(1, Math.round((total * (i + 1)) / SEGMENT_ROLES.length)),
    text: sentences[i] ?? '(rien de clair dans le texte fourni)',
  }));
  const product = productName ?? 'ton produit';
  return {
    summary: `Découpage approximatif sur ${total} secondes${duration === null ? ' (durée inconnue, 30 secondes supposées)' : ''}, à partir du texte fourni.`,
    hook_type: sentences[0]?.endsWith('?') ? 'Question directe' : 'Affirmation forte',
    segments: parts,
    strengths: ['L’accroche arrive dès la première seconde.', 'Le produit est montré en action avant l’appel à l’action.'],
    adapted: {
      title: `Version pour ${product}`,
      lines: [
        sentences[0] ? `Accroche dans le même esprit : « ${sentences[0].slice(0, 80)} »` : 'Commence par le problème que règle le produit.',
        `Montre ${product} en action, en gros plan.`,
        'Donne une preuve simple : avant / après, ou ton ressenti honnête.',
        'Termine par : « Le lien est dans le panier orange. » Collaboration commerciale.',
      ],
    },
  };
}

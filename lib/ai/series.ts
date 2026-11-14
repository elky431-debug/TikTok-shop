import { z } from 'zod';
import { Rng } from '@/lib/data/random';
import { nicheLabel } from '@/lib/niches';
import type { Product } from '@/lib/db/types';
import { formatEuros } from '@/lib/utils';
import { angleLabel, FIXED_ANGLES, formatLabel, SCRIPT_FORMATS, type FixedAngle, type StudioFormat } from './formats';
import { isClean } from './guard';
import { describeStyle, EDIT_SYSTEM_PROMPT } from './prompt';
import { askStructured } from './structured';
import type { StyleProfile } from './types';
import { displayName } from '@/lib/product-name';

/**
 * Série de 20 vidéos sur un produit : 20 angles différents (un affilié gagne au volume, à partir de 20 vidéos sur un
 * même produit). L'IA propose ; le code contrôle les doublons (entre eux et avec les séries déjà faites sur ce
 * produit), demande une fois des remplaçants, puis complète avec des angles simulés si besoin.
 */
export const SERIES_SIZE = 20;

export interface SeriesAngle {
  title: string;
  hook: string;
  format: StudioFormat;
  angle: FixedAngle;
  pitch: string;
}

const FORMAT_IDS = SCRIPT_FORMATS.map((f) => f.id) as [StudioFormat, ...StudioFormat[]];
const ANGLE_IDS = FIXED_ANGLES as [FixedAngle, ...FixedAngle[]];

const AngleItemSchema = z.object({
  title: z.string().describe('Titre court de l’angle, 6 mots au plus.'),
  hook: z.string().describe('Accroche parlée, 8 mots au plus.'),
  format: z.enum(FORMAT_IDS),
  angle: z.enum(ANGLE_IDS),
  pitch: z.string().describe('Ce que montre la vidéo, en une phrase.'),
});
export const SeriesSchema = z.object({ angles: z.array(AngleItemSchema) });

// ---------------------------------------------------------------------------
// Contrôle des doublons (côté code, quel que soit le fournisseur)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  'le la les l un une des de du d et ou a à au aux en dans sur pour par avec ce cet cette ces c ça ca que qui quoi ne n pas plus je j tu te t il elle on nous vous mon ma mes ton ta tes son sa ses y est sont tout tous toute toutes comme mais donc si se s qu'.split(' '),
);

/** Mots significatifs d'un texte : minuscules, sans accents ni ponctuation, sans mots vides, pluriel simple retiré. */
export function keywords(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’']/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOPWORDS.has(w))
      .map((w) => (w.length > 3 ? w.replace(/(s|x)$/, '') : w)),
  );
}

/** Indice de Jaccard entre deux textes (0 = rien en commun, 1 = mêmes mots). */
export function similarity(a: string, b: string): number {
  const x = keywords(a);
  const y = keywords(b);
  if (!x.size && !y.size) return 1;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / (x.size + y.size - common);
}

/** Deux angles font doublon : même titre ou même accroche (à peu de mots près), ou même format, même type et même idée. */
export function isDuplicateAngle(a: SeriesAngle, b: Pick<SeriesAngle, 'title' | 'hook'> & Partial<SeriesAngle>): boolean {
  if (similarity(a.title, b.title) >= 0.6) return true;
  if (similarity(a.hook, b.hook) >= 0.7) return true;
  if (b.format && b.angle && b.pitch && a.format === b.format && a.angle === b.angle && similarity(`${a.title} ${a.pitch}`, `${b.title} ${b.pitch}`) >= 0.6) {
    return true;
  }
  return false;
}

/** Garde les angles propres et sans doublon (entre eux et avec `previous`), dans l'ordre. */
export function dedupeAngles(candidates: SeriesAngle[], previous: Array<Pick<SeriesAngle, 'title' | 'hook'>> = []): { kept: SeriesAngle[]; rejected: number } {
  const kept: SeriesAngle[] = [];
  let rejected = 0;
  for (const raw of candidates) {
    const angle = {
      ...raw,
      title: raw.title.replace(/\s+/g, ' ').trim(),
      hook: raw.hook.replace(/\s+/g, ' ').trim(),
      pitch: raw.pitch.replace(/\s+/g, ' ').trim(),
    };
    const clean = angle.title && angle.hook && [angle.title, angle.hook, angle.pitch].every(isClean) && angle.hook.split(/\s+/).length <= 12;
    if (!clean || kept.some((k) => isDuplicateAngle(angle, k)) || previous.some((p) => isDuplicateAngle(angle, p))) {
      rejected++;
      continue;
    }
    kept.push(angle);
  }
  return { kept, rejected };
}

// ---------------------------------------------------------------------------
// Série simulée : 20 combinaisons format × type d'angle toutes différentes
// ---------------------------------------------------------------------------

const SERIES_TITLES: Record<StudioFormat, string> = {
  demo: 'Démo',
  avant_apres: 'Avant-après',
  histoire: 'Mon histoire',
  reponse_commentaire: 'Je réponds',
  unboxing: 'Déballage',
  comparaison: 'Le match',
  routine: 'Dans ma routine',
  top3: 'Top 3',
};

const ANGLE_TITLES: Record<FixedAngle, string> = {
  probleme: 'le souci réglé',
  transformation: 'la différence',
  objection: 'la question qui fâche',
  prix: 'ce que vaut ce prix',
};

const FORMAT_PITCH: Record<StudioFormat, string> = {
  demo: 'Tu montres le produit en action, en une prise.',
  avant_apres: 'Tu filmes l’avant et l’après au même cadrage.',
  histoire: 'Tu racontes ta situation, puis ta découverte.',
  reponse_commentaire: 'Tu réponds à un commentaire affiché à l’écran.',
  unboxing: 'Tu ouvres le colis et tu testes à chaud.',
  comparaison: 'Tu compares avec ce que tu utilisais avant, côte à côte.',
  routine: 'Tu places le produit dans ta routine, étape par étape.',
  top3: 'Tu donnes trois raisons ou trois usages, numérotés.',
};

const ANGLE_PITCH: Record<FixedAngle, string> = {
  probleme: 'Point de départ : un souci concret du quotidien.',
  transformation: 'Ce qui compte : le changement qu’on voit.',
  objection: 'Fil rouge : la question qui fait hésiter, et la réponse en images.',
  prix: 'Fil rouge : ce qu’on a concrètement pour ce prix.',
};

const SERIES_HOOKS: Record<FixedAngle, string[]> = {
  probleme: ['Ce petit souci, tu le connais ?', 'J’en avais marre de galérer avec ça.', 'Le problème que personne ne règle.', 'Ça t’arrive aussi tous les jours ?', 'Voilà comment je m’en sors maintenant.'],
  transformation: ['Regarde la différence, sans filtre.', 'Le début, puis maintenant.', 'Même cadrage, même lumière : regarde.', 'Avant, je faisais comme ça.', 'Le changement se voit tout de suite.'],
  objection: ['« C’est trop cher » ? Regarde d’abord.', 'Tu doutes ? Moi aussi, au début.', '« Ça sert à rien » ? On vérifie.', 'La question qu’on me pose le plus.', 'Je teste ce qui me faisait douter.'],
  prix: ['Voilà ce que tu as pour ce prix.', 'Petit prix, je te montre en vrai.', 'Ce que contient vraiment la boîte.', 'Pour ce prix, je regarde chaque détail.', 'Ce prix-là, ça donne quoi ?'],
};

/** 20 angles simulés, tous différents (format × type d'angle uniques, accroches uniques), stables pour un produit. */
export function simulateSeries(product: Pick<Product, 'id' | 'name'>, seed = ''): SeriesAngle[] {
  const rng = new Rng(`${product.id}|serie|${seed}`);
  const formats = rng.shuffle(FORMAT_IDS);
  const angles = rng.shuffle(FIXED_ANGLES);
  const hooks = Object.fromEntries(FIXED_ANGLES.map((a) => [a, rng.shuffle(SERIES_HOOKS[a])])) as Record<FixedAngle, string[]>;
  const name = displayName(product);
  const out: SeriesAngle[] = [];
  for (let k = 0; k < SERIES_SIZE; k++) {
    const angle = angles[k % 4];
    const format = formats[(k + Math.floor(k / 8)) % 8];
    out.push({
      title: `${SERIES_TITLES[format]} : ${ANGLE_TITLES[angle]}`,
      hook: hooks[angle][Math.floor(k / 4) % 5],
      format,
      angle,
      pitch: `${FORMAT_PITCH[format]} ${ANGLE_PITCH[angle]} Produit : ${name}.`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

export interface SeriesResult {
  angles: SeriesAngle[];
  simulated: boolean;
  /** Angles écartés par le contrôle des doublons (ou par le garde-fou). */
  duplicatesRemoved: number;
  /** Angles ajoutés par le générateur simulé pour arriver à 20. */
  filled: number;
}

function seriesPrompt(product: Pick<Product, 'name' | 'niche' | 'description' | 'price_cents'>, count: number, avoid: string[], style?: StyleProfile | null): string {
  return [
    `## Produit : ${product.name} (${formatEuros(product.price_cents)}, niche ${nicheLabel(product.niche)})`,
    `Description : ${product.description || 'non fournie'}`,
    ...(style ? ['', ...describeStyle(style)] : []),
    '',
    `## Formats possibles : ${SCRIPT_FORMATS.map((f) => `${f.id} (${f.label})`).join(', ')}`,
    `## Types d’angle : ${FIXED_ANGLES.map((a) => `${a} (${angleLabel(a)})`).join(', ')}`,
    ...(avoid.length ? ['', '## Déjà proposés (à ne pas refaire, même reformulés)', ...avoid.slice(0, 60).map((t) => `- ${t}`)] : []),
    '',
    `Propose ${count} angles de vidéo TikTok Shop différents pour vendre ce produit. Chacun : un titre de 6 mots au plus, une accroche parlée de 8 mots au plus, un format, un type d’angle, et une phrase qui dit ce que montre la vidéo. Aucun angle ne doit ressembler à un autre : varie les formats (au moins 6 différents), les types d’angle, les situations, les moments de la journée, les publics et les objections. Uniquement des informations de la fiche produit.`,
  ].join('\n');
}

export async function generateSeries(
  product: Pick<Product, 'id' | 'name' | 'niche' | 'description' | 'price_cents'>,
  options: { previous?: Array<Pick<SeriesAngle, 'title' | 'hook'>>; style?: StyleProfile | null; seed?: string } = {},
): Promise<SeriesResult> {
  const previous = options.previous ?? [];
  const first = await askStructured({
    name: 'serie_angles',
    schema: SeriesSchema,
    system: EDIT_SYSTEM_PROMPT,
    prompt: seriesPrompt(product, SERIES_SIZE, previous.map((p) => p.title), options.style),
    maxTokens: 5000,
    simulate: () => ({ angles: simulateSeries(product, options.seed) }),
  });
  // En simulé, les angles viennent d'un jeu fixe de combinaisons : on ne compare qu'à l'intérieur de la série.
  const against = first.simulated ? [] : previous;
  let { kept, rejected } = dedupeAngles(first.data.angles, against);
  if (!first.simulated && kept.length < SERIES_SIZE) {
    // Un seul tour de remplacement : on redonne la liste de ce qui est gardé pour ne pas retomber dessus.
    const missing = SERIES_SIZE - kept.length;
    const more = await askStructured({
      name: 'serie_angles_remplacement',
      schema: SeriesSchema,
      system: EDIT_SYSTEM_PROMPT,
      prompt: seriesPrompt(product, missing + 2, [...previous.map((p) => p.title), ...kept.map((k) => `${k.title} (${formatLabel(k.format)})`)], options.style),
      maxTokens: 3000,
      simulate: () => ({ angles: [] }),
    });
    const second = dedupeAngles(more.data.angles, [...previous, ...kept]);
    kept = [...kept, ...second.kept].slice(0, SERIES_SIZE);
    rejected += second.rejected;
  }
  let filled = 0;
  if (kept.length < SERIES_SIZE) {
    for (let round = 0; round < 4 && kept.length < SERIES_SIZE; round++) {
      // Les deux derniers tours ne comparent plus qu'à la série en cours : 20 angles, toujours.
      const extra = dedupeAngles(simulateSeries(product, `${options.seed ?? ''}|complement|${round}`), round < 2 ? [...against, ...kept] : kept).kept;
      for (const angle of extra) {
        if (kept.length >= SERIES_SIZE) break;
        kept.push(angle);
        filled++;
      }
    }
  }
  return { angles: kept, simulated: first.simulated, duplicatesRemoved: first.simulated ? 0 : rejected, filled };
}

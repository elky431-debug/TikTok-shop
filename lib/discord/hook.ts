import { z } from 'zod';
import { findIssues, isClean } from '@/lib/ai/guard';
import { askStructured } from '@/lib/ai/structured';
import { hashString } from '@/lib/data/random';
import type { Product, Profile } from '@/lib/db/types';
import { nicheLabel } from '@/lib/niches';
import { TREND_LABELS } from '@/lib/score';
import { formatEuros, formatGrowth } from '@/lib/utils';
import { displayName } from '@/lib/product-name';

/**
 * /script : une accroche rapide (les 3 premières secondes) et une idée de plan, par l'IA structurée commune
 * (lib/ai/structured.ts). Mêmes interdits que le studio (lib/ai/guard.ts) : promesse médicale, superlatif non prouvé,
 * mention de gains. Un second essai si la sortie enfreint une règle ; sinon une accroche sûre, écrite par le code.
 */
export const QuickHookSchema = z.object({
  accroche: z.string().min(8).max(180),
  idee: z.string().min(8).max(240),
});
export type QuickHook = z.infer<typeof QuickHookSchema>;

const SYSTEM = [
  'Tu écris des accroches de vidéos TikTok Shop pour des créateurs français. Tutoiement, ton direct, phrases courtes.',
  'L’accroche se dit en 3 secondes au plus. L’idée décrit en une phrase ce qu’on montre ensuite.',
  'Interdits : promesse de résultat médical ou de perte de poids, superlatifs non prouvés (miracle, le meilleur, n°1,',
  '100 % efficace), toute mention d’argent à gagner ou de commission. Mots français (« échantillon », pas « sample »).',
].join(' ');

function simulate(product: Pick<Product, 'id' | 'name' | 'niche'>): QuickHook {
  const short = displayName(product);
  const hooks = [
    `Je teste ${short} depuis une semaine : voilà ce que personne ne te montre.`,
    `Avant d’acheter ${short}, regarde ça.`,
    `On m’a demandé si ${short} valait le coup. Je te montre.`,
    `Trois choses que j’aurais aimé savoir avant ${short}.`,
  ];
  const ideas = [
    'Montre le produit en main dès la première seconde, puis un vrai usage du quotidien, sans couper.',
    'Commence par le problème que tu avais, enchaîne sur la démonstration, termine par le lien du panier.',
    'Filme un avant / après honnête, en lumière naturelle, et dis ce qui t’a surpris.',
  ];
  const h = hashString(product.id);
  return { accroche: hooks[h % hooks.length], idee: ideas[h % ideas.length] };
}

function prompt(product: Product, profile: Pick<Profile, 'video_style' | 'example_phrase'>): string {
  const hooks = product.top_videos
    .map((v) => v.hook ?? v.title)
    .filter(Boolean)
    .slice(0, 3);
  return [
    `Produit : ${product.name}`,
    `Niche : ${nicheLabel(product.niche)}`,
    `Prix : ${formatEuros(product.price_cents)}`,
    `Tendance : ${TREND_LABELS[product.trend]} (${formatGrowth(product.growth_7d)} sur 7 jours)`,
    product.description ? `Description : ${product.description.slice(0, 600)}` : null,
    hooks.length ? `Accroches de vidéos qui vendent ce produit : ${hooks.map((h) => `« ${h} »`).join(' ; ')}` : null,
    profile.video_style ? `Style du créateur : ${profile.video_style}` : null,
    profile.example_phrase ? `Une phrase qu’il dirait : « ${profile.example_phrase.slice(0, 200)} »` : null,
    'Écris une accroche neuve (pas une copie) et une idée de plan.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function quickHook(product: Product, profile: Pick<Profile, 'video_style' | 'example_phrase'>): Promise<QuickHook & { simulated: boolean }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await askStructured({
      name: 'accroche_discord',
      schema: QuickHookSchema,
      system: attempt === 0 ? SYSTEM : `${SYSTEM} Ta réponse précédente enfreignait une règle : reformule sans aucun interdit.`,
      prompt: prompt(product, profile),
      maxTokens: 1200,
      simulate: () => simulate(product),
    });
    if (isClean(result.data.accroche) && isClean(result.data.idee)) return { ...result.data, simulated: result.simulated };
    console.warn('[discord] accroche refusée par le garde-fou :', findIssues(`${result.data.accroche} ${result.data.idee}`).map((i) => i.reason).join(', '));
    if (result.simulated) break;
  }
  return { ...simulate(product), simulated: true };
}

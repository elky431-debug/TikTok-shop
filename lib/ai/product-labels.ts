import { z } from 'zod';
import type { NicheId } from '@/lib/niches';
import { NICHES, NICHE_IDS } from '@/lib/niches';
import { heuristicShortName } from '@/lib/product-name';
import { askStructured } from './structured';

/**
 * Nom court et niche vérifiée de chaque produit, en un appel pour un lot de produits (une seule fois par produit : le
 * résultat est gardé en base, voir lib/jobs/refresh.ts). Le nom court fait 3 à 6 mots, en français, sans marque
 * inventée ni promesse ; la niche est choisie d'après le titre et la vraie catégorie TikTok Shop (la niche de départ
 * vient de la catégorie demandée à la source, parfois fausse : un calendrier de l'Avent n'est pas de la tech).
 */
export interface ProductLabelInput {
  id: string;
  name: string;
  /** « Catégorie TikTok Shop : A › B › C » quand la source la donne. */
  description: string;
  niche: NicheId;
}

export interface ProductLabel {
  id: string;
  short_name: string;
  niche: NicheId;
}

const BATCH = 25;

const schema = z.object({
  produits: z.array(
    z.object({
      id: z.string(),
      nom_court: z.string(),
      niche: z.enum(NICHE_IDS as [NicheId, ...NicheId[]]),
    }),
  ),
});

const SYSTEM = [
  'Tu nommes des produits TikTok Shop pour des créateurs français.',
  'Pour chaque produit, donne :',
  '- nom_court : 3 à 6 mots en français, 40 caractères au plus, ce qu’est le produit et son trait distinctif (ex. « Solution aspirateur fleur de coton », « Sérum éclat vitamine C »). Garde la marque seulement si elle est courte et connue. Pas de majuscules à chaque mot, pas de promesse, pas de chiffre de quantité sauf s’il distingue le produit (« Parfum 50 ml »), pas de guillemets ;',
  `- niche : la plus juste parmi ${NICHES.map((n) => `${n.id} (${n.label})`).join(', ')}, d’après le titre et la catégorie TikTok Shop. Un calendrier de l’Avent ou une décoration de Noël va dans « maison », un jouet pour enfant dans « bebe », un accessoire de téléphone dans « tech ».`,
  'Réponds pour chaque identifiant reçu, sans en oublier ni en ajouter.',
].join('\n');

function normalize(name: string, fallback: string): string {
  const clean = name.replace(/["«»“”]/g, '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').trim();
  const words = clean.split(' ');
  if (clean.length < 3 || clean.length > 60 || words.length > 8) return heuristicShortName(fallback);
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Noms courts et niches pour une liste de produits, par lots. Un lot en échec garde la règle simple et la niche d'origine. */
export async function labelProducts(products: ProductLabelInput[]): Promise<{ labels: ProductLabel[]; simulated: boolean }> {
  const labels: ProductLabel[] = [];
  let simulated = false;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const byId = new Map(batch.map((p) => [p.id, p]));
    try {
      const result = await askStructured({
        name: 'noms_courts',
        schema,
        system: SYSTEM,
        prompt: batch
          .map((p) => `id: ${p.id}\ntitre: ${p.name.slice(0, 300)}\n${p.description ? `${p.description.slice(0, 200)}\n` : ''}niche actuelle: ${p.niche}`)
          .join('\n\n'),
        maxTokens: 4000,
        quick: true,
        simulate: () => ({ produits: batch.map((p) => ({ id: p.id, nom_court: heuristicShortName(p.name), niche: p.niche })) }),
      });
      simulated ||= result.simulated;
      for (const item of result.data.produits) {
        const source = byId.get(item.id);
        if (!source) continue;
        labels.push({ id: item.id, short_name: normalize(item.nom_court, source.name), niche: item.niche });
        byId.delete(item.id);
      }
    } catch (error) {
      console.warn('[noms courts] lot ignoré', error instanceof Error ? error.message : error);
    }
    // Produits oubliés par la réponse : règle simple, niche d'origine (ils seront repris au prochain passage).
    for (const p of byId.values()) labels.push({ id: p.id, short_name: heuristicShortName(p.name), niche: p.niche });
  }
  return { labels, simulated };
}

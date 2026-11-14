import { z } from 'zod';
import type { ComparableProduct, Comparison } from '@/lib/radar/compare';
import { findIssues } from './guard';
import { askStructured } from './structured';

/**
 * Verdict du comparateur en une phrase : quel produit choisir pour ses prochaines vidéos, et pourquoi, à partir des
 * seuls chiffres comparés (jamais de chiffre inventé, aucune promesse de gains). Sans clé d'IA : phrase simple,
 * construite à partir des lignes gagnées.
 */
const schema = z.object({ verdict: z.string() });

const SYSTEM = [
  'Tu conseilles un créateur affilié TikTok Shop français qui hésite entre plusieurs produits pour ses prochaines vidéos.',
  'Réponds par une seule phrase de 30 mots au plus, au tutoiement, qui nomme le produit à choisir et donne une ou deux raisons tirées des chiffres fournis.',
  'N’invente aucun chiffre, ne promets aucun gain ni résultat, n’emploie pas « meilleur ».',
].join(' ');

function describe(products: ComparableProduct[], comparison: Comparison): string {
  const lines = comparison.rows.map((row) => {
    const cells = row.values.map((v, i) => `${products[i].name} : ${v === null ? 'inconnu' : formatValue(row.id, v)}`).join(' | ');
    return `- ${row.label}${row.lowerIsBetter ? ' (moins = mieux)' : ''} : ${cells}`;
  });
  return lines.join('\n');
}

export function formatValue(id: string, v: number): string {
  if (id === 'per_sale') return `${(v / 100).toFixed(2).replace('.', ',')} €`;
  if (id === 'commission') return `${Math.round(v * 100)} %`;
  if (id === 'growth') return `${v >= 0 ? '+' : ''}${Math.round(v * 100)} %`;
  if (id === 'rating') return String(v).replace('.', ',');
  return String(Math.round(v));
}

export function simpleVerdict(products: ComparableProduct[], comparison: Comparison): string {
  const w = comparison.winner;
  const won = comparison.rows.filter((r) => r.winners.includes(w)).map((r) => r.label.toLowerCase());
  const total = comparison.rows.filter((r) => r.winners.length).length;
  if (!won.length) return `${products[w].name} et ses concurrents se tiennent : choisis celui dont tu te sens le plus proche pour tourner.`;
  const reasons = won.slice(0, 2).join(' et ');
  return `Pars sur ${products[w].name} : il l’emporte sur ${won.length} critère${won.length > 1 ? 's' : ''} sur ${total}, dont ${reasons}.`;
}

export async function compareVerdict(products: ComparableProduct[], comparison: Comparison): Promise<{ sentence: string; simulated: boolean }> {
  const fallback = simpleVerdict(products, comparison);
  const result = await askStructured({
    name: 'verdict_comparaison',
    schema,
    system: SYSTEM,
    prompt: `Produits : ${products.map((p) => p.name).join(', ')}\nChiffres :\n${describe(products, comparison)}`,
    maxTokens: 300,
    quick: true,
    simulate: () => ({ verdict: fallback }),
  });
  const sentence = result.data.verdict.replace(/\s+/g, ' ').trim();
  // Garde-fou : promesse, superlatif ou phrase trop longue ⇒ phrase simple.
  // Le mot « commission » est permis ici (conseil, pas texte de vidéo) ; les promesses de gains, non.
  const issues = findIssues(sentence.replace(/commissions?/gi, 'part'));
  if (!sentence || sentence.length > 260 || issues.length || /\bmeilleur/i.test(sentence)) return { sentence: fallback, simulated: result.simulated };
  return { sentence, simulated: result.simulated };
}

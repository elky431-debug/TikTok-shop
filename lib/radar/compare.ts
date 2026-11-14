/** Comparateur : 2 produits face à face, ou 3 à 4 en cartes. Module pur. */
export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;

/** Identifiants demandés (« ids=a,b » ou « ids=a&ids=b »), nettoyés, sans doublon, dans l'ordre. */
export function parseCompareIds(value: string | string[] | undefined): string[] {
  const list = (Array.isArray(value) ? value : [value ?? '']).flatMap((v) => v.split(','));
  return [...new Set(list.map((v) => v.trim()).filter((v) => /^[\w-]{1,80}$/.test(v)))];
}

/**
 * Meilleure valeur d'une ligne (la plus grande, ou la plus petite pour les affiliés : moins de concurrence). null s'il
 * y a moins de deux valeurs connues : rien à départager.
 */
export function bestValue(values: Array<number | null>, lowerIsBetter = false): number | null {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length < MIN_COMPARE) return null;
  return lowerIsBetter ? Math.min(...known) : Math.max(...known);
}

/** Ce qu'il faut d'un produit pour le comparer (sous-ensemble de ProductView). */
export interface ComparableProduct {
  id: string;
  name: string;
  score: number | null;
  personal_score: number | null;
  price_cents: number;
  commission_rate: number;
  commission_cents: number;
  active_affiliates: number | null;
  growth_known: boolean;
  figures: { sales_7d: number | null; sales_30d: number | null; growth_7d: number | null; rating: number | null };
}

export type CriterionId = 'score' | 'personal' | 'per_sale' | 'commission' | 'sales_7d' | 'sales_30d' | 'growth' | 'affiliates' | 'rating';

interface CriterionDef {
  id: CriterionId;
  label: string;
  value: (p: ComparableProduct) => number | null;
  /** Affiliés : moins de concurrence = mieux. */
  lowerIsBetter?: boolean;
}

const CRITERIA: CriterionDef[] = [
  { id: 'score', label: 'Score', value: (p) => p.score },
  { id: 'personal', label: 'Score pour toi', value: (p) => p.personal_score },
  { id: 'per_sale', label: 'Gain par vente', value: (p) => p.commission_cents },
  { id: 'commission', label: 'Commission', value: (p) => p.commission_rate },
  { id: 'sales_7d', label: 'Ventes 7 jours', value: (p) => p.figures.sales_7d },
  { id: 'sales_30d', label: 'Ventes 30 jours', value: (p) => p.figures.sales_30d },
  { id: 'growth', label: 'Croissance 7 jours', value: (p) => (p.growth_known ? p.figures.growth_7d : null) },
  { id: 'affiliates', label: 'Affiliés', value: (p) => p.active_affiliates, lowerIsBetter: true },
  { id: 'rating', label: 'Note', value: (p) => p.figures.rating },
];

export interface CriterionResult {
  id: CriterionId;
  label: string;
  lowerIsBetter: boolean;
  /** Valeur brute de chaque produit (null = la source ne la donne pas). */
  values: Array<number | null>;
  /** Longueur de la barre de chaque produit, de 0 à 1 (la valeur gagnante remplit la barre). */
  bars: number[];
  /** Index des produits qui gagnent la ligne ; vide en cas d'égalité ou s'il manque des valeurs. */
  winners: number[];
}

export interface Comparison {
  rows: CriterionResult[];
  /** Lignes gagnées (seul ou à plusieurs) par chaque produit. */
  wins: number[];
  /** Index du produit qui gagne le plus de lignes (à égalité : le score, puis le premier). */
  winner: number;
}

function bar(value: number | null, values: number[], lowerIsBetter: boolean): number {
  if (value === null || !values.length) return 0;
  if (lowerIsBetter) {
    const min = Math.min(...values);
    return value <= 0 ? 1 : Math.max(0.06, min / value);
  }
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  if (max <= min) return value === max ? 1 : 0;
  // Valeurs négatives possibles (croissance) : la barre part du plus bas.
  return Math.max(0.06, (value - min) / (max - min));
}

export function compareProducts(products: ComparableProduct[]): Comparison {
  const rows: CriterionResult[] = [];
  for (const def of CRITERIA) {
    const values = products.map(def.value).map((v) => (v === null || !Number.isFinite(v) ? null : v));
    const known = values.filter((v): v is number => v !== null);
    if (!known.length) continue;
    const best = bestValue(values, def.lowerIsBetter);
    const winnersAll = best === null ? [] : values.flatMap((v, i) => (v === best ? [i] : []));
    rows.push({
      id: def.id,
      label: def.label,
      lowerIsBetter: Boolean(def.lowerIsBetter),
      values,
      bars: values.map((v) => bar(v, known, Boolean(def.lowerIsBetter))),
      // Égalité parfaite : personne ne gagne la ligne.
      winners: winnersAll.length === products.length ? [] : winnersAll,
    });
  }
  // Une ligne gagnée à plusieurs (3 produits sur 4 au même score) compte pour chacun : c'est ce que montrent les couronnes.
  const wins = products.map((_, i) => rows.filter((r) => r.winners.includes(i)).length);
  let winner = 0;
  for (let i = 1; i < products.length; i++) {
    const better = wins[i] > wins[winner] || (wins[i] === wins[winner] && (products[i].score ?? -1) > (products[winner].score ?? -1));
    if (better) winner = i;
  }
  return { rows, wins, winner };
}

/** Clé de cache du verdict : la même paire, le même jour de données, donne la même phrase. */
export function verdictKey(ids: string[], dataDate: string | null): string {
  return `verdict-comparaison|${[...ids].sort().join(',')}|${dataDate ?? 'sans-date'}`;
}

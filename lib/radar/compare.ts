/** Comparateur (bloc 1) : 2 à 4 produits côte à côte. Module pur. */
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

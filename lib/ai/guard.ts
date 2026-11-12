/**
 * Garde-fou sur les textes générés : promesses médicales, superlatifs non prouvés,
 * mention de gains. Utilisé sur la sortie de Claude (et testé sur le générateur simulé).
 */
const RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgu[ée]ri(r|t|s|ssent|son)?\b|\bsoign(e|er|ent)\b|\bth[ée]rapeutique\b|\bm[ée]dicament\b/i, reason: 'promesse médicale' },
  { pattern: /\b(acn[ée]|ecz[ée]ma|psoriasis|cellulite|chute de cheveux|insomnie|douleurs?)\b.{0,30}\b(dispara[iî]t|fini|stopp|élimin|supprim)/i, reason: 'promesse médicale' },
  { pattern: /\b(maigri[rst]?|perdre \d+\s?kg|perd(s|u)? \d+\s?kg|br[uû]le[rs]? les graisses)\b/i, reason: 'promesse médicale' },
  { pattern: /\bmiracle\b|\br[ée]volutionnaire\b|\bmagique\b|\binfaillible\b/i, reason: 'superlatif non prouvé' },
  { pattern: /\ble meilleur\b(?! moment)|\bla meilleure\b|\bn[°o]\s?1\b|\bnum[ée]ro un\b|\bincroyablement efficace\b/i, reason: 'superlatif non prouvé' },
  { pattern: /\b100\s?%\s?(efficace|garanti|naturel|résultat)|\brésultats? garantis?\b|\bgaranti à vie\b/i, reason: 'superlatif non prouvé' },
  { pattern: /\b(gagne[rsz]?|gagné) (de l'argent|de l’argent|\d+)|€\s?(par|\/)\s?(mois|jour|semaine)|\brevenus? (passifs?|faciles?)\b|\bargent facile\b|\bdevenir riche\b/i, reason: 'mention de gains' },
  { pattern: /\bcommission\b/i, reason: 'mention de gains' },
];

export interface GuardIssue {
  text: string;
  reason: string;
}

export function findIssues(text: string): GuardIssue[] {
  return RULES.filter((r) => r.pattern.test(text)).map((r) => ({ text, reason: r.reason }));
}

export function isClean(text: string): boolean {
  return findIssues(text).length === 0;
}

/** Retire les phrases problématiques d'un texte (dernier recours après un nouvel essai). */
export function stripIssues(text: string): string {
  const sentences = text.split(/(?<=[.!?…])\s+/);
  const kept = sentences.filter(isClean);
  return kept.join(' ').trim();
}

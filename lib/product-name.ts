import type { Product } from '@/lib/db/types';

/**
 * Noms de produits. Les titres TikTok Shop sont interminables (« Solution Aspirateur Laveur Fleur de Coton - Compatible
 * Toutes Marques - Nettoie, Parfume… ») : partout, on affiche un nom court de 3 à 6 mots, généré une fois par l'IA
 * (`short_name`, lib/ai/product-labels.ts). Tant qu'il n'existe pas, un nom court est tiré du titre par une règle
 * simple (avant le premier séparateur, sans les crochets, 5 mots au plus). Le titre complet ne se lit que dans la fiche.
 */
export function heuristicShortName(name: string): string {
  let s = name.replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, ' ');
  s = s.split(/\s[|–—-]\s|\||,|:|;|\s\/\s/)[0] ?? s;
  s = s.replace(/\s+/g, ' ').trim();
  const words = s.split(' ');
  if (words.length > 5) s = words.slice(0, 5).join(' ');
  if (s.length > 40) s = s.slice(0, 40).replace(/\s+\S*$/, '');
  // Titres tout en majuscules : casse normale.
  if (s === s.toUpperCase() && /\p{L}{3}/u.test(s)) s = s.toLowerCase().replace(/^\p{L}/u, (m) => m.toUpperCase());
  return s.length >= 3 ? s : name.slice(0, 40).trim();
}

/** Nom à afficher : le nom court de l'IA, sinon la règle simple. */
export function displayName(product: Pick<Product, 'name'> & { short_name?: string | null }): string {
  const short = product.short_name?.trim();
  return short && short.length >= 2 ? short : heuristicShortName(product.name);
}

/** Nom déjà enregistré ailleurs (script, plan, analyse…) : raccourci s'il vient d'un ancien titre complet. */
export function shortLabel(name: string | null | undefined): string {
  if (!name) return '';
  return name.length > 42 ? heuristicShortName(name) : name;
}

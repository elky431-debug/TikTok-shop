/**
 * Fiche produit (bloc 3) : boutons d'action et sections montrées. Module pur.
 */

/** Liens des boutons de la fiche. */
export function productActionLinks(productId: string) {
  const id = encodeURIComponent(productId);
  return {
    scripts: `/app/studio?produit=${id}`,
    plan: `/app/plan?produit=${id}`,
    alert: `/app/alertes?produit=${id}`,
    compare: '/app/comparer',
  };
}

/**
 * « Créateurs qui vendent ce produit » : section masquée. La seule route Nexscope qui liste les créateurs d'un produit
 * (chuhaijiang-tiktok-product-related-creators, POST https://api.nexscope.ai/cj/products/related-creators) ne documente
 * que des identifiants et un e-mail public éventuel : ni nom affiché, ni ventes, ni audience. Elle ne dit donc pas qui
 * vend le produit le mieux, et ramènerait des données personnelles sans utilité. Voir docs/session5/blocs1-2-3.md (B23).
 */
export const CREATORS_SECTION = {
  shown: false,
  reason: 'Aucune route documentée ne donne les ventes ou le nom public des créateurs d’un produit.',
  checkedRoute: 'chuhaijiang-tiktok-product-related-creators',
} as const;

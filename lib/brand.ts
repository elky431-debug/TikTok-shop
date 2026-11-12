/**
 * Nom de travail du produit. Change-le ici, il change partout.
 */
export const BRAND = 'TikTrend';

/** Phrase d'accroche courte, réutilisée dans les métadonnées. */
export const BRAND_TAGLINE = 'Sache chaque matin quoi vendre sur TikTok Shop';

/** Identifiant technique (cookies, clés de stockage) dérivé du nom, sans accents. */
export const BRAND_SLUG = BRAND.normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-');

/**
 * Nom en deux tons dans le logo, comme « Ets » + « mart » sur EtSmart :
 * « Tik » en blanc, « Trend » en dégradé. Ajuste la coupe si le nom change.
 */
export const BRAND_SPLIT: [string, string] = [BRAND.slice(0, 3), BRAND.slice(3)];

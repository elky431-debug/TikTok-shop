// @ts-check
/**
 * Domaines d'images produits autorisés (next.config.mjs → images.remotePatterns, et filtrage à l'import).
 * Seulement des domaines vus dans la documentation officielle des fournisseurs :
 *  - TikTok Shop Partner Center, exemples de `main_image_url` : p16-oec-va.ibyteimg.com,
 *    p16-oec-sg.ibyteimg.com, p19-oec-sg.ibyteimg.com, p16-oec-ttp.tiktokcdn-us.com ;
 *  - Nexscope : ses exemples utilisent example.com, aucun domaine réel n'est documenté.
 * Un domaine réel absent d'ici est listé dans l'écran admin après la tâche nocturne (« images refusées ») :
 * l'ajouter alors dans IMAGE_HOSTS (séparés par des virgules, « *. » accepté en tête), puis redéployer.
 */
export const DEFAULT_IMAGE_HOSTS = ['*.ibyteimg.com', '*.tiktokcdn-us.com'];

/** @returns {string[]} */
export function imageHostPatterns() {
  const extra = (process.env.IMAGE_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$/.test(h));
  return [...new Set([...DEFAULT_IMAGE_HOSTS, ...extra])];
}

/**
 * @param {string} host
 * @param {string[]} [patterns]
 */
export function isAllowedImageHost(host, patterns = imageHostPatterns()) {
  const h = host.toLowerCase();
  return patterns.some((p) => (p.startsWith('*.') ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}

/** Format attendu par next.config (`**.domaine` couvre tous les sous-domaines). */
export function remotePatterns() {
  return imageHostPatterns().map((p) => ({
    protocol: /** @type {const} */ ('https'),
    hostname: p.startsWith('*.') ? `**.${p.slice(2)}` : p,
  }));
}

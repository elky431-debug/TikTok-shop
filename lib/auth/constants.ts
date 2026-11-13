import { BRAND_SLUG } from '@/lib/brand';

/** Cookie de session du mode local (signé HMAC). */
export const LOCAL_SESSION_COOKIE = `${BRAND_SLUG}_session`;
/** Code de parrainage ou code formateur mémorisé avant l'inscription (30 jours). */
export const REFERRAL_COOKIE = `${BRAND_SLUG}_ref`;
/** Thème forcé (clair / sombre), lu avant l'affichage pour éviter le flash. */
export const THEME_COOKIE = `${BRAND_SLUG}_theme`;
/** Page demandée avant un lien de connexion par e-mail (le lien lui-même ne la transporte pas). */
export const NEXT_PATH_COOKIE = `${BRAND_SLUG}_suite`;

export const PROTECTED_PREFIXES = ['/app', '/formateur', '/admin', '/bienvenue'];

/** Palette de couleurs choisie pour la comparaison (« a » ou « b ») : préférence d'affichage, cookie technique. */
export const PALETTE_COOKIE = 'tracktout_palette';

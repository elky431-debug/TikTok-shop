import { BRAND_SLUG } from '@/lib/brand';

/** Cookie de session du mode local (signé HMAC). */
export const LOCAL_SESSION_COOKIE = `${BRAND_SLUG}_session`;
/** Code de parrainage ou code formateur mémorisé avant l'inscription (30 jours). */
export const REFERRAL_COOKIE = `${BRAND_SLUG}_ref`;
/** Thème forcé (clair / sombre), lu avant l'affichage pour éviter le flash. */
export const THEME_COOKIE = `${BRAND_SLUG}_theme`;

export const PROTECTED_PREFIXES = ['/app', '/formateur', '/admin', '/bienvenue'];

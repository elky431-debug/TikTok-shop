/**
 * Préparation (interfaces seulement) de deux briques prévues plus tard avec l'API officielle TikTok Shop :
 *  1. l'autorisation OAuth d'un compte créateur (l'utilisateur clique « Autoriser » chez TikTok, jamais de mot de
 *     passe saisi chez nous) ;
 *  2. le suivi des commandes affiliées de ce créateur (ce qu'il vend vraiment, pour « Mes produits »).
 *
 * Rien n'est branché : aucune route n'appelle ces interfaces. Les adresses ci-dessous viennent de la documentation
 * officielle (« Authorization overview » et « Creator authorization guide », copies datées de 2026) et doivent être
 * revérifiées au moment de l'implémentation, avec l'accord de TikTok pour la France (voir DECISIONS.md).
 *
 * TODO(tiktok-oauth) : route /api/tiktok/autorisation (redirection + `state` signé), route de retour qui échange
 * le code (valable 30 min, usage unique), stockage chiffré des jetons par utilisateur, renouvellement avant
 * expiration, vérification `user_type === 1` (créateur) et région de sélection France.
 * TODO(tiktok-commandes) : point d'accès des commandes affiliées côté créateur, à confirmer dans la doc à ce moment.
 */

/** Page d'autorisation pour les créateurs (même adresse aux États-Unis et ailleurs), `state` obligatoire. */
export const TIKTOK_CREATOR_AUTHORIZE_URL = 'https://shop.tiktok.com/alliance/creator/auth';
/** Échange du code (grant_type=authorized_code) et renouvellement (grant_type=refresh_token). */
export const TIKTOK_TOKEN_URLS = {
  get: 'https://auth.tiktok-shops.com/api/v2/token/get',
  refresh: 'https://auth.tiktok-shops.com/api/v2/token/refresh',
} as const;

export interface CreatorToken {
  accessToken: string;
  /** Horodatage Unix (secondes) d'expiration du jeton d'accès. */
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  /** Identifiant du compte autorisé chez TikTok. */
  openId: string;
  /** 1 = créateur. */
  userType: number;
  grantedScopes: string[];
}

export interface CreatorAuthorization {
  /** Adresse vers laquelle rediriger l'utilisateur pour qu'il autorise l'appli. */
  authorizeUrl(state: string): string;
  /** Échange le code reçu au retour contre des jetons. */
  exchangeCode(code: string): Promise<CreatorToken>;
  /** Renouvelle un jeton d'accès avant son expiration. */
  refresh(refreshToken: string): Promise<CreatorToken>;
}

export interface AffiliateOrder {
  orderId: string;
  productId: string;
  /** Commission estimée en centimes d'euro. */
  commissionCents: number;
  createdAt: string;
  status: 'en_attente' | 'validee' | 'annulee';
}

export interface AffiliateOrdersSource {
  /** Commandes affiliées du créateur sur une période, du plus récent au plus ancien. */
  listOrders(token: CreatorToken, range: { from: string; to: string }): Promise<AffiliateOrder[]>;
}

import type {
  Coach,
  CoachApplication,
  CoachStudent,
  Commission,
  CronRun,
  Digest,
  LocalEmail,
  Product,
  ProductSnapshot,
  Profile,
  ProfileSystemUpdate,
  Referral,
  SavedProduct,
  ScriptRecord,
  Subscription,
} from './types';
import type { NicheId } from '@/lib/niches';

/**
 * Accès aux données, indépendant du stockage (Supabase ou fichier local).
 * Le serveur est la seule porte d'entrée : chaque méthode reçoit l'identifiant
 * de l'utilisateur déjà authentifié et filtre explicitement dessus.
 */
export interface Repo {
  readonly kind: 'supabase' | 'local';

  // Profils
  getProfile(userId: string): Promise<Profile | null>;
  ensureProfile(user: { id: string; email: string }): Promise<Profile>;
  updateProfile(userId: string, patch: ProfileSystemUpdate): Promise<Profile>;
  getProfileByReferralCode(code: string): Promise<Profile | null>;
  getProfileByStripeCustomer(customerId: string): Promise<Profile | null>;
  getProfileByDiscordId(discordUserId: string): Promise<Profile | null>;
  listProfiles(opts?: { limit?: number }): Promise<Profile[]>;
  listOnboardedProfiles(): Promise<Profile[]>;
  listDiscordLinkedProfiles(): Promise<Profile[]>;
  deleteUser(userId: string): Promise<void>;

  // Catalogue
  upsertProducts(products: Product[]): Promise<void>;
  listProducts(opts?: { niches?: NicheId[] }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  getProducts(ids: string[]): Promise<Product[]>;
  upsertSnapshots(snapshots: ProductSnapshot[]): Promise<void>;
  getProductSnapshots(productId: string, days: number): Promise<ProductSnapshot[]>;
  countProducts(): Promise<number>;

  // Scripts
  insertScript(script: Omit<ScriptRecord, 'id' | 'created_at'>): Promise<ScriptRecord>;
  getScript(userId: string, id: string): Promise<ScriptRecord | null>;
  updateScript(userId: string, id: string, patch: Partial<Pick<ScriptRecord, 'hooks' | 'saved' | 'regen_count' | 'full_text'>>): Promise<ScriptRecord>;
  listScripts(userId: string, opts?: { limit?: number; savedOnly?: boolean }): Promise<ScriptRecord[]>;
  deleteScript(userId: string, id: string): Promise<void>;
  countScripts(userId?: string): Promise<number>;

  // Usage
  getUsage(userId: string, day: string): Promise<number>;
  /** Incrémente si la limite n'est pas atteinte. Renvoie le nouveau total ou -1. limit < 0 = illimité. */
  incrementUsage(userId: string, day: string, limit: number): Promise<number>;
  /** Rend un crédit (génération échouée). */
  decrementUsage(userId: string, day: string): Promise<void>;

  // Mes produits
  listSavedProducts(userId: string): Promise<SavedProduct[]>;
  getSavedProduct(userId: string, productId: string): Promise<SavedProduct | null>;
  saveProduct(userId: string, productId: string, goal?: number): Promise<SavedProduct>;
  updateSavedProduct(userId: string, productId: string, patch: Partial<Pick<SavedProduct, 'video_goal' | 'videos_posted'>>): Promise<SavedProduct>;
  removeSavedProduct(userId: string, productId: string): Promise<void>;

  // Abonnements
  upsertSubscription(sub: Subscription): Promise<void>;
  getSubscription(id: string): Promise<Subscription | null>;
  getActiveSubscription(userId: string): Promise<Subscription | null>;
  listSubscriptions(opts?: { provider?: Subscription['provider'] }): Promise<Subscription[]>;

  // Idempotence des événements de paiement
  /** Enregistre l'événement ; renvoie false s'il avait déjà été traité. */
  markBillingEvent(id: string, type: string): Promise<boolean>;

  // Formateurs
  getCoachByUserId(userId: string): Promise<Coach | null>;
  getCoachById(id: string): Promise<Coach | null>;
  getCoachByPromoCode(code: string): Promise<Coach | null>;
  createCoach(input: Omit<Coach, 'id' | 'created_at'>): Promise<Coach>;
  listCoaches(): Promise<Coach[]>;
  listCoachStudents(coachId: string): Promise<CoachStudent[]>;

  // Parrainage
  createReferral(input: Pick<Referral, 'referrer_id' | 'referred_id' | 'coach_id'>): Promise<Referral | null>;
  getReferralByReferred(referredId: string): Promise<Referral | null>;
  updateReferral(id: string, patch: Partial<Pick<Referral, 'status' | 'commission_due_cents' | 'commission_paid_cents'>>): Promise<void>;
  listReferralsByReferrer(referrerId: string): Promise<Array<Referral & { referred_first_name: string | null; referred_plan: Profile['plan'] }>>;
  /** Insère la commission si la facture n'a pas encore été comptée. */
  addCommission(input: Omit<Commission, 'id' | 'created_at' | 'status' | 'canceled_cents'>): Promise<boolean>;
  /**
   * Remboursement d'une facture : la part `refundedShare` (0 à 1, cumulée) de la commission est annulée. Rejouable :
   * seule la différence avec ce qui était déjà annulé est retirée du dû du parrainage. Null si la facture n'a pas de
   * commission.
   */
  refundCommission(invoiceId: string, refundedShare: number): Promise<{ canceledCents: number; remainingCents: number } | null>;
  listCommissions(referrerId: string): Promise<Commission[]>;

  // Récap du matin
  upsertDigest(digest: Omit<Digest, 'created_at'>): Promise<void>;
  getDigest(userId: string, day: string): Promise<Digest | null>;
  listDigests(day: string): Promise<Digest[]>;
  updateDigestStatus(userId: string, day: string, patch: Partial<Pick<Digest, 'email_status' | 'discord_status'>>): Promise<void>;

  // Discord
  createDiscordLinkCode(userId: string, code: string, expiresAt: string): Promise<void>;
  /** Consomme le code et renvoie l'utilisateur lié, ou null si invalide/expiré. */
  consumeDiscordLinkCode(code: string): Promise<string | null>;

  // Demandes de partenariat
  insertCoachApplication(input: Omit<CoachApplication, 'id' | 'created_at' | 'status'>): Promise<CoachApplication>;
  listCoachApplications(): Promise<CoachApplication[]>;
  updateCoachApplication(id: string, status: CoachApplication['status']): Promise<void>;

  // Cache des réponses du fournisseur de données (évite de repayer un appel identique le même jour)
  getProviderCache(key: string): Promise<unknown | null>;
  setProviderCache(key: string, value: unknown, expiresAt: string): Promise<void>;
  /** Supprime les entrées expirées ; renvoie le nombre supprimé. */
  purgeProviderCache(): Promise<number>;

  // Tâches planifiées
  startCronRun(job: string, trigger: CronRun['trigger']): Promise<CronRun>;
  finishCronRun(id: string, status: 'ok' | 'error', details: Record<string, unknown>): Promise<void>;
  listCronRuns(limit?: number): Promise<CronRun[]>;

  // E-mails (mode local uniquement : boîte de réception de développement)
  logLocalEmail?(email: Omit<LocalEmail, 'id' | 'created_at'>): Promise<void>;
  listLocalEmails?(limit?: number): Promise<LocalEmail[]>;
}

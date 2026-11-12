import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Repo } from './repo';
import type {
  Coach,
  CoachApplication,
  CoachStudent,
  Commission,
  CronRun,
  Digest,
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
import { env } from '@/lib/env';
import { randomCode } from '@/lib/utils';

/**
 * Implémentation Supabase. Utilise la clé service côté serveur uniquement ;
 * chaque requête filtre explicitement sur l'utilisateur authentifié.
 * La RLS (voir supabase/migrations) protège tout accès direct depuis le navigateur.
 */

// Le client est volontairement peu typé : les lignes sont converties vers les types métier.
type Client = SupabaseClient<any>;

let serviceClient: Client | null = null;

export function getServiceClient(): Client {
  if (!serviceClient) {
    serviceClient = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as Client;
  }
  return serviceClient;
}

class DbError extends Error {
  constructor(context: string, message: string) {
    super(`${context} : ${message}`);
    this.name = 'DbError';
  }
}

/**
 * Lève une erreur lisible si la requête a échoué. Sans erreur, une liste n'est jamais null ;
 * pour maybeSingle(), l'appelant teste lui-même l'absence de ligne.
 */
function check<R extends { data: unknown; error: { message: string } | null }>(
  context: string,
  result: R,
): NonNullable<R['data']> {
  if (result.error) throw new DbError(context, result.error.message);
  return result.data as NonNullable<R['data']>;
}

type Row = Record<string, any>;

const toProfile = (r: Row): Profile => ({ ...(r as Profile), niches: (r.niches ?? []) as NicheId[] });
const toProduct = (r: Row): Product => ({
  ...(r as Product),
  commission_rate: Number(r.commission_rate),
  growth_7d: Number(r.growth_7d),
  top_videos: (r.top_videos ?? []) as Product['top_videos'],
  latest_breakdown: r.latest_breakdown && Object.keys(r.latest_breakdown).length ? r.latest_breakdown : null,
  sales_30d: (r.sales_30d ?? []) as number[],
});
const toSnapshot = (r: Row): ProductSnapshot => ({
  ...(r as ProductSnapshot),
  score_breakdown: r.score_breakdown && Object.keys(r.score_breakdown).length ? r.score_breakdown : null,
});
const toCoach = (r: Row): Coach => ({ ...(r as Coach), commission_rate: Number(r.commission_rate) });

// Colonnes NOT NULL côté base : un détail de score absent s'écrit {} ; les ventes estimées d'un fournisseur
// réel peuvent être décimales, les colonnes sont entières.
const productRow = (p: Product) => ({
  ...p,
  latest_breakdown: p.latest_breakdown ?? {},
  sales_30d: p.sales_30d.map((n) => Math.round(n)),
});
const snapshotRow = (s: ProductSnapshot) => ({
  ...s,
  estimated_sales: Math.round(s.estimated_sales),
  score_breakdown: s.score_breakdown ?? {},
});

export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;
  constructor(private readonly db: Client = getServiceClient()) {}

  // ------------------------------------------------------------------
  // Profils
  // ------------------------------------------------------------------
  async getProfile(userId: string) {
    const data = check('profil', await this.db.from('profiles').select('*').eq('id', userId).maybeSingle());
    return data ? toProfile(data) : null;
  }

  async ensureProfile(user: { id: string; email: string }) {
    const existing = await this.getProfile(user.id);
    if (existing) return existing;
    // Normalement créé par le déclencheur on_auth_user_created ; filet de sécurité.
    const data = check(
      'création du profil',
      await this.db
        .from('profiles')
        .upsert({ id: user.id, email: user.email, referral_code: randomCode(7) }, { onConflict: 'id', ignoreDuplicates: true })
        .select('*')
        .maybeSingle(),
    );
    return data ? toProfile(data) : ((await this.getProfile(user.id)) as Profile);
  }

  async updateProfile(userId: string, patch: ProfileSystemUpdate) {
    const data = check(
      'mise à jour du profil',
      await this.db.from('profiles').update(patch).eq('id', userId).select('*').single(),
    );
    return toProfile(data);
  }

  async getProfileByReferralCode(code: string) {
    const data = check(
      'code de parrainage',
      await this.db.from('profiles').select('*').eq('referral_code', code.trim().toUpperCase()).maybeSingle(),
    );
    return data ? toProfile(data) : null;
  }

  async getProfileByStripeCustomer(customerId: string) {
    const data = check(
      'client de paiement',
      await this.db.from('profiles').select('*').eq('stripe_customer_id', customerId).maybeSingle(),
    );
    return data ? toProfile(data) : null;
  }

  async getProfileByDiscordId(discordUserId: string) {
    const data = check(
      'compte Discord',
      await this.db.from('profiles').select('*').eq('discord_user_id', discordUserId).maybeSingle(),
    );
    return data ? toProfile(data) : null;
  }

  async listProfiles(opts: { limit?: number } = {}) {
    const data = check(
      'liste des profils',
      await this.db.from('profiles').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 500),
    );
    return data.map(toProfile);
  }

  async listOnboardedProfiles() {
    const all: Profile[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const data = check(
        'profils actifs',
        await this.db
          .from('profiles')
          .select('*')
          .not('onboarded_at', 'is', null)
          .order('created_at')
          .range(from, from + page - 1),
      );
      all.push(...data.map(toProfile));
      if (data.length < page) break;
    }
    return all;
  }

  async listDiscordLinkedProfiles() {
    const all: Profile[] = [];
    for (let from = 0; ; from += 1000) {
      const data = check(
        'comptes Discord',
        await this.db.from('profiles').select('*').not('discord_user_id', 'is', null).order('created_at').range(from, from + 999),
      );
      all.push(...data.map(toProfile));
      if (data.length < 1000) break;
    }
    return all;
  }

  async deleteUser(userId: string) {
    // Supprime l'utilisateur d'auth : les tables liées sont nettoyées en cascade.
    const { error } = await this.db.auth.admin.deleteUser(userId);
    if (error) throw new DbError('suppression du compte', error.message);
  }

  // ------------------------------------------------------------------
  // Catalogue
  // ------------------------------------------------------------------
  async upsertProducts(products: Product[]) {
    for (let i = 0; i < products.length; i += 200) {
      check('produits', await this.db.from('products').upsert(products.slice(i, i + 200).map(productRow), { onConflict: 'id' }));
    }
  }

  async listProducts(opts: { niches?: NicheId[] } = {}) {
    let query = this.db.from('products').select('*').order('latest_score', { ascending: false }).limit(1000);
    if (opts.niches?.length) query = query.in('niche', opts.niches);
    return check('catalogue', await query).map(toProduct);
  }

  async getProduct(id: string) {
    const data = check('produit', await this.db.from('products').select('*').eq('id', id).maybeSingle());
    return data ? toProduct(data) : null;
  }

  async getProducts(ids: string[]) {
    if (!ids.length) return [];
    return check('produits', await this.db.from('products').select('*').in('id', ids)).map(toProduct);
  }

  async upsertSnapshots(snapshots: ProductSnapshot[]) {
    for (let i = 0; i < snapshots.length; i += 500) {
      check(
        'instantanés',
        await this.db
          .from('product_snapshots')
          .upsert(snapshots.slice(i, i + 500).map(snapshotRow), { onConflict: 'product_id,date' }),
      );
    }
  }

  async getProductSnapshots(productId: string, days: number) {
    const data = check(
      'historique produit',
      await this.db
        .from('product_snapshots')
        .select('*')
        .eq('product_id', productId)
        .order('date', { ascending: false })
        .limit(days),
    );
    return data.map(toSnapshot).reverse();
  }

  async countProducts() {
    const { count, error } = await this.db.from('products').select('id', { count: 'exact', head: true });
    if (error) throw new DbError('comptage produits', error.message);
    return count ?? 0;
  }

  // ------------------------------------------------------------------
  // Scripts
  // ------------------------------------------------------------------
  async insertScript(script: Omit<ScriptRecord, 'id' | 'created_at'>) {
    return check('script', await this.db.from('scripts').insert(script).select('*').single()) as ScriptRecord;
  }

  async getScript(userId: string, id: string) {
    const data = check(
      'script',
      await this.db.from('scripts').select('*').eq('id', id).eq('user_id', userId).maybeSingle(),
    );
    return (data as ScriptRecord) ?? null;
  }

  async updateScript(
    userId: string,
    id: string,
    patch: Partial<Pick<ScriptRecord, 'hooks' | 'saved' | 'regen_count' | 'full_text'>>,
  ) {
    return check(
      'script',
      await this.db.from('scripts').update(patch).eq('id', id).eq('user_id', userId).select('*').single(),
    ) as ScriptRecord;
  }

  async listScripts(userId: string, opts: { limit?: number; savedOnly?: boolean } = {}) {
    let query = this.db
      .from('scripts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 50);
    if (opts.savedOnly) query = query.eq('saved', true);
    return check('historique des scripts', await query) as ScriptRecord[];
  }

  async deleteScript(userId: string, id: string) {
    check('suppression du script', await this.db.from('scripts').delete().eq('id', id).eq('user_id', userId));
  }

  async countScripts(userId?: string) {
    let query = this.db.from('scripts').select('id', { count: 'exact', head: true });
    if (userId) query = query.eq('user_id', userId);
    const { count, error } = await query;
    if (error) throw new DbError('comptage scripts', error.message);
    return count ?? 0;
  }

  // ------------------------------------------------------------------
  // Usage
  // ------------------------------------------------------------------
  async getUsage(userId: string, day: string) {
    const data = check(
      'usage',
      await this.db.from('usage').select('scripts_generated').eq('user_id', userId).eq('day', day).maybeSingle(),
    );
    return data?.scripts_generated ?? 0;
  }

  async incrementUsage(userId: string, day: string, limit: number) {
    const data = check('usage', await this.db.rpc('increment_usage', { p_user: userId, p_day: day, p_limit: limit }));
    return Number(data);
  }

  async decrementUsage(userId: string, day: string) {
    const current = await this.getUsage(userId, day);
    if (current <= 0) return;
    check(
      'usage',
      await this.db
        .from('usage')
        .update({ scripts_generated: current - 1 })
        .eq('user_id', userId)
        .eq('day', day)
        .eq('scripts_generated', current),
    );
  }

  // ------------------------------------------------------------------
  // Mes produits
  // ------------------------------------------------------------------
  async listSavedProducts(userId: string) {
    return check(
      'mes produits',
      await this.db.from('saved_products').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ) as SavedProduct[];
  }

  async getSavedProduct(userId: string, productId: string) {
    const data = check(
      'mes produits',
      await this.db.from('saved_products').select('*').eq('user_id', userId).eq('product_id', productId).maybeSingle(),
    );
    return (data as SavedProduct) ?? null;
  }

  async saveProduct(userId: string, productId: string, goal = 20) {
    const existing = await this.getSavedProduct(userId, productId);
    if (existing) return existing;
    return check(
      'ajout à mes produits',
      await this.db
        .from('saved_products')
        .insert({ user_id: userId, product_id: productId, video_goal: goal })
        .select('*')
        .single(),
    ) as SavedProduct;
  }

  async updateSavedProduct(
    userId: string,
    productId: string,
    patch: Partial<Pick<SavedProduct, 'video_goal' | 'videos_posted'>>,
  ) {
    return check(
      'mes produits',
      await this.db
        .from('saved_products')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('product_id', productId)
        .select('*')
        .single(),
    ) as SavedProduct;
  }

  async removeSavedProduct(userId: string, productId: string) {
    check(
      'retrait de mes produits',
      await this.db.from('saved_products').delete().eq('user_id', userId).eq('product_id', productId),
    );
  }

  // ------------------------------------------------------------------
  // Abonnements
  // ------------------------------------------------------------------
  async upsertSubscription(sub: Subscription) {
    check('abonnement', await this.db.from('subscriptions').upsert(sub, { onConflict: 'id' }));
  }

  async getSubscription(id: string) {
    const data = check('abonnement', await this.db.from('subscriptions').select('*').eq('id', id).maybeSingle());
    return (data as Subscription) ?? null;
  }

  async getActiveSubscription(userId: string) {
    const data = check(
      'abonnement',
      await this.db
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('updated_at', { ascending: false })
        .limit(1),
    );
    return (data[0] as Subscription) ?? null;
  }

  async listSubscriptions(opts: { provider?: Subscription['provider'] } = {}) {
    let query = this.db.from('subscriptions').select('*');
    if (opts.provider) query = query.eq('provider', opts.provider);
    return check('abonnements', await query) as Subscription[];
  }

  async markBillingEvent(id: string, type: string) {
    const { error } = await this.db.from('billing_events').insert({ id, type });
    if (!error) return true;
    if (error.code === '23505') return false; // déjà traité
    throw new DbError('événement de paiement', error.message);
  }

  // ------------------------------------------------------------------
  // Formateurs
  // ------------------------------------------------------------------
  async getCoachByUserId(userId: string) {
    const data = check('formateur', await this.db.from('coaches').select('*').eq('user_id', userId).maybeSingle());
    return data ? toCoach(data) : null;
  }

  async getCoachById(id: string) {
    const data = check('formateur', await this.db.from('coaches').select('*').eq('id', id).maybeSingle());
    return data ? toCoach(data) : null;
  }

  async getCoachByPromoCode(code: string) {
    const data = check(
      'code formateur',
      await this.db.from('coaches').select('*').eq('promo_code', code.trim().toUpperCase()).maybeSingle(),
    );
    return data ? toCoach(data) : null;
  }

  async createCoach(input: Omit<Coach, 'id' | 'created_at'>) {
    const { data, error } = await this.db.from('coaches').insert(input).select('*').single();
    if (error) {
      if (error.code === '23505') throw new Error('Ce compte est déjà formateur ou ce code promo est déjà pris.');
      throw new DbError('création du formateur', error.message);
    }
    return toCoach(data);
  }

  async listCoaches() {
    return check('formateurs', await this.db.from('coaches').select('*').order('created_at', { ascending: false })).map(
      toCoach,
    );
  }

  async listCoachStudents(coachId: string) {
    const data = check('élèves', await this.db.rpc('coach_student_stats', { p_coach_id: coachId }));
    return (data as Row[]).map(
      (r): CoachStudent => ({
        ...(r as CoachStudent),
        scripts_generated: Number(r.scripts_generated),
        products_followed: Number(r.products_followed),
      }),
    );
  }

  // ------------------------------------------------------------------
  // Parrainage
  // ------------------------------------------------------------------
  async createReferral(input: Pick<Referral, 'referrer_id' | 'referred_id' | 'coach_id'>) {
    if (input.referrer_id === input.referred_id) return null;
    const { data, error } = await this.db.from('referrals').insert(input).select('*').single();
    if (error) {
      if (error.code === '23505') return null;
      throw new DbError('parrainage', error.message);
    }
    return data as Referral;
  }

  async getReferralByReferred(referredId: string) {
    const data = check(
      'parrainage',
      await this.db.from('referrals').select('*').eq('referred_id', referredId).maybeSingle(),
    );
    return (data as Referral) ?? null;
  }

  async updateReferral(
    id: string,
    patch: Partial<Pick<Referral, 'status' | 'commission_due_cents' | 'commission_paid_cents'>>,
  ) {
    check('parrainage', await this.db.from('referrals').update(patch).eq('id', id));
  }

  async listReferralsByReferrer(referrerId: string) {
    const data = check(
      'filleuls',
      await this.db
        .from('referrals')
        .select('*, referred:profiles!referrals_referred_id_fkey(first_name, plan)')
        .eq('referrer_id', referrerId)
        .order('created_at', { ascending: false }),
    );
    return (data as Row[]).map((r) => {
      const { referred, ...rest } = r;
      return {
        ...(rest as Referral),
        referred_first_name: (referred?.first_name as string | null) ?? null,
        referred_plan: (referred?.plan as Profile['plan']) ?? 'free',
      };
    });
  }

  async addCommission(input: Omit<Commission, 'id' | 'created_at' | 'status'>) {
    const { error } = await this.db.from('commissions').insert(input);
    if (error) {
      if (error.code === '23505') return false;
      throw new DbError('commission', error.message);
    }
    const referral = check(
      'parrainage',
      await this.db.from('referrals').select('commission_due_cents').eq('id', input.referral_id).maybeSingle(),
    );
    if (referral) {
      await this.updateReferral(input.referral_id, {
        commission_due_cents: Number(referral.commission_due_cents) + input.amount_cents,
      });
    }
    return true;
  }

  async listCommissions(referrerId: string) {
    return check(
      'commissions',
      await this.db
        .from('commissions')
        .select('*')
        .eq('referrer_id', referrerId)
        .order('created_at', { ascending: false }),
    ) as Commission[];
  }

  // ------------------------------------------------------------------
  // Récap du matin
  // ------------------------------------------------------------------
  async upsertDigest(digest: Omit<Digest, 'created_at'>) {
    check('récap', await this.db.from('digests').upsert(digest, { onConflict: 'user_id,day' }));
  }

  async getDigest(userId: string, day: string) {
    const data = check(
      'récap',
      await this.db.from('digests').select('*').eq('user_id', userId).eq('day', day).maybeSingle(),
    );
    return (data as Digest) ?? null;
  }

  async listDigests(day: string) {
    const all: Digest[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const data = check(
        'récaps',
        await this.db.from('digests').select('*').eq('day', day).range(from, from + page - 1),
      ) as Digest[];
      all.push(...data);
      if (data.length < page) break;
    }
    return all;
  }

  async updateDigestStatus(
    userId: string,
    day: string,
    patch: Partial<Pick<Digest, 'email_status' | 'discord_status'>>,
  ) {
    check('récap', await this.db.from('digests').update(patch).eq('user_id', userId).eq('day', day));
  }

  // ------------------------------------------------------------------
  // Discord
  // ------------------------------------------------------------------
  async createDiscordLinkCode(userId: string, code: string, expiresAt: string) {
    check('code Discord', await this.db.from('discord_link_codes').delete().eq('user_id', userId).is('used_at', null));
    check(
      'code Discord',
      await this.db.from('discord_link_codes').insert({ code, user_id: userId, expires_at: expiresAt }),
    );
  }

  async consumeDiscordLinkCode(code: string) {
    const data = check(
      'code Discord',
      await this.db
        .from('discord_link_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('code', code.trim().toUpperCase())
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .select('user_id')
        .maybeSingle(),
    );
    return (data?.user_id as string | undefined) ?? null;
  }

  // ------------------------------------------------------------------
  // Demandes de partenariat
  // ------------------------------------------------------------------
  async insertCoachApplication(input: Omit<CoachApplication, 'id' | 'created_at' | 'status'>) {
    return check(
      'demande de partenariat',
      await this.db.from('coach_applications').insert(input).select('*').single(),
    ) as CoachApplication;
  }

  async listCoachApplications() {
    return check(
      'demandes de partenariat',
      await this.db.from('coach_applications').select('*').order('created_at', { ascending: false }).limit(200),
    ) as CoachApplication[];
  }

  async updateCoachApplication(id: string, status: CoachApplication['status']) {
    check('demande de partenariat', await this.db.from('coach_applications').update({ status }).eq('id', id));
  }

  // ------------------------------------------------------------------
  // Tâches planifiées
  // ------------------------------------------------------------------
  async startCronRun(job: string, trigger: CronRun['trigger']) {
    return check('tâche', await this.db.from('cron_runs').insert({ job, trigger }).select('*').single()) as CronRun;
  }

  async finishCronRun(id: string, status: 'ok' | 'error', details: Record<string, unknown>) {
    check(
      'tâche',
      await this.db
        .from('cron_runs')
        .update({ status, details, finished_at: new Date().toISOString() })
        .eq('id', id),
    );
  }

  async listCronRuns(limit = 10) {
    return check(
      'tâches',
      await this.db.from('cron_runs').select('*').order('started_at', { ascending: false }).limit(limit),
    ) as CronRun[];
  }
}

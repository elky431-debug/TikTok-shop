import fs from 'node:fs';
import path from 'node:path';
import type { Repo } from './repo';
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
  TopVideo,
  RecordKind,
  UserDataExport,
  UserRecord,
} from './types';
import type { NicheId } from '@/lib/niches';
import { eligibilityFor } from '@/lib/profile-rules';
import { randomCode, randomId } from '@/lib/utils';
import { commissionRefund } from './commission';

/**
 * Base de données locale (fichier JSON) utilisée quand Supabase n'est pas configuré.
 * Pensée pour le développement et les tests : un seul processus, écritures atomiques.
 */

interface LocalUser {
  id: string;
  email: string;
  created_at: string;
  /** Mot de passe haché (scrypt), si le compte a été créé avec un mot de passe. */
  password_hash?: string;
}

interface MagicToken {
  token: string;
  email: string;
  expires_at: string;
  used: boolean;
}

interface DiscordCode {
  code: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
}

export interface LocalData {
  version: 1;
  users: LocalUser[];
  magic_tokens: MagicToken[];
  profiles: Profile[];
  products: Product[];
  snapshots: ProductSnapshot[];
  scripts: ScriptRecord[];
  saved_products: SavedProduct[];
  subscriptions: Subscription[];
  usage: Array<{ user_id: string; day: string; scripts_generated: number }>;
  coaches: Coach[];
  referrals: Referral[];
  commissions: Commission[];
  digests: Digest[];
  coach_applications: CoachApplication[];
  discord_link_codes: DiscordCode[];
  billing_events: Array<{ id: string; type: string; processed_at: string }>;
  cron_runs: CronRun[];
  emails: LocalEmail[];
  provider_cache: Array<{ key: string; value: unknown; expires_at: string }>;
  daily_tasks: Array<{ task: string; day: string; claimed_at: string }>;
  user_records: UserRecord[];
}

export function emptyLocalData(): LocalData {
  return {
    version: 1,
    users: [],
    magic_tokens: [],
    profiles: [],
    products: [],
    snapshots: [],
    scripts: [],
    saved_products: [],
    subscriptions: [],
    usage: [],
    coaches: [],
    referrals: [],
    commissions: [],
    digests: [],
    coach_applications: [],
    discord_link_codes: [],
    billing_events: [],
    cron_runs: [],
    emails: [],
    provider_cache: [],
    daily_tasks: [],
    user_records: [],
  };
}

const now = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);

function defaultProfile(user: { id: string; email: string }, referralCode: string): Profile {
  return {
    id: user.id,
    email: user.email,
    first_name: null,
    tiktok_handle: null,
    follower_range: null,
    niches: [],
    video_style: null,
    example_phrase: null,
    plan: 'free',
    eligibility: 'preparation',
    referral_code: referralCode,
    coach_id: null,
    referred_by: null,
    digest_email: true,
    digest_discord: false,
    digest_hour: 8,
    region: 'FR',
    discord_user_id: null,
    theme: 'system',
    share_email_with_coach: false,
    stripe_customer_id: null,
    trial_used: false,
    onboarded_at: null,
    last_seen_at: null,
    created_at: now(),
  };
}

type Store = { data: LocalData; mtimeMs: number };

declare global {
  // Partagé entre les couches de modules de Next en développement.
  var __tracktoutLocalStores: Map<string, Store> | undefined;
}

export class LocalRepo implements Repo {
  readonly kind = 'local' as const;
  private readonly file: string | null;
  private memory: Store | null = null;

  /** `file` = null : base purement en mémoire (tests). */
  constructor(file: string | null) {
    this.file = file ? path.resolve(file) : null;
  }

  // ------------------------------------------------------------------
  // Persistance
  // ------------------------------------------------------------------
  private get stores(): Map<string, Store> {
    globalThis.__tracktoutLocalStores ??= new Map();
    return globalThis.__tracktoutLocalStores;
  }

  private load(): LocalData {
    if (!this.file) {
      this.memory ??= { data: emptyLocalData(), mtimeMs: 0 };
      return this.memory.data;
    }
    const cached = this.stores.get(this.file);
    let mtimeMs = -1;
    try {
      mtimeMs = fs.statSync(this.file).mtimeMs;
    } catch {
      mtimeMs = -1;
    }
    if (cached && cached.mtimeMs === mtimeMs) return cached.data;
    let data = emptyLocalData();
    if (mtimeMs >= 0) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<LocalData>;
        data = { ...emptyLocalData(), ...parsed, version: 1 };
      } catch {
        data = emptyLocalData();
      }
    }
    this.stores.set(this.file, { data, mtimeMs });
    return data;
  }

  private save(data: LocalData): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.file);
    const mtimeMs = fs.statSync(this.file).mtimeMs;
    this.stores.set(this.file, { data, mtimeMs });
  }

  private read<T>(fn: (data: LocalData) => T): T {
    return clone(fn(this.load()));
  }

  private write<T>(fn: (data: LocalData) => T): T {
    const data = this.load();
    const result = fn(data);
    this.save(data);
    return clone(result);
  }

  /** Remplace tout le contenu (utilisé par le seed et les tests). */
  async reset(data: LocalData = emptyLocalData()): Promise<void> {
    if (!this.file) {
      this.memory = { data, mtimeMs: 0 };
      return;
    }
    this.save(data);
  }

  // ------------------------------------------------------------------
  // Authentification locale (lien magique simulé)
  // ------------------------------------------------------------------
  async createMagicToken(email: string, ttlMinutes = 15): Promise<string> {
    const token = `${randomId()}${randomId()}`.replace(/-/g, '');
    this.write((d) => {
      d.magic_tokens = d.magic_tokens.filter((t) => !t.used && t.expires_at > now());
      d.magic_tokens.push({
        token,
        email: email.toLowerCase(),
        expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
        used: false,
      });
    });
    return token;
  }

  async consumeMagicToken(token: string): Promise<LocalUser | null> {
    return this.write((d) => {
      const entry = d.magic_tokens.find((t) => t.token === token);
      if (!entry || entry.used || entry.expires_at < now()) return null;
      entry.used = true;
      let user = d.users.find((u) => u.email === entry.email);
      if (!user) {
        user = { id: randomId(), email: entry.email, created_at: now() };
        d.users.push(user);
      }
      return user;
    });
  }

  /** Inscription par mot de passe (mode local). Une adresse déjà inscrite n'est jamais écrasée. */
  async createPasswordUser(email: string, passwordHash: string): Promise<LocalUser | null> {
    return this.write((d) => {
      const address = email.toLowerCase();
      if (d.users.some((u) => u.email === address)) return null;
      const user: LocalUser = { id: randomId(), email: address, created_at: now(), password_hash: passwordHash };
      d.users.push(user);
      return clone(user);
    });
  }

  async findLocalUserByEmail(email: string): Promise<LocalUser | null> {
    return this.read((d) => d.users.find((u) => u.email === email.toLowerCase()) ?? null);
  }

  async getLocalUser(id: string): Promise<LocalUser | null> {
    return this.read((d) => d.users.find((u) => u.id === id) ?? null);
  }

  // ------------------------------------------------------------------
  // Profils
  // ------------------------------------------------------------------
  async getProfile(userId: string) {
    return this.read((d) => d.profiles.find((p) => p.id === userId) ?? null);
  }

  async ensureProfile(user: { id: string; email: string }) {
    return this.write((d) => {
      const existing = d.profiles.find((p) => p.id === user.id);
      if (existing) return existing;
      let code = randomCode(7);
      while (d.profiles.some((p) => p.referral_code === code)) code = randomCode(7);
      const profile = defaultProfile(user, code);
      d.profiles.push(profile);
      if (!d.users.some((u) => u.id === user.id)) d.users.push({ id: user.id, email: user.email, created_at: now() });
      return profile;
    });
  }

  async updateProfile(userId: string, patch: ProfileSystemUpdate) {
    return this.write((d) => {
      const profile = d.profiles.find((p) => p.id === userId);
      if (!profile) throw new Error('Profil introuvable');
      Object.assign(profile, patch);
      if (patch.follower_range !== undefined) profile.eligibility = eligibilityFor(profile.follower_range);
      return profile;
    });
  }

  async getProfileByReferralCode(code: string) {
    const normalized = code.trim().toUpperCase();
    return this.read((d) => d.profiles.find((p) => p.referral_code === normalized) ?? null);
  }

  async getProfileByStripeCustomer(customerId: string) {
    return this.read((d) => d.profiles.find((p) => p.stripe_customer_id === customerId) ?? null);
  }

  async getProfileByDiscordId(discordUserId: string) {
    return this.read((d) => d.profiles.find((p) => p.discord_user_id === discordUserId) ?? null);
  }

  async listProfiles(opts: { limit?: number } = {}) {
    return this.read((d) =>
      [...d.profiles].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, opts.limit ?? 500),
    );
  }

  async listOnboardedProfiles() {
    return this.read((d) => d.profiles.filter((p) => p.onboarded_at));
  }

  async listDiscordLinkedProfiles() {
    return this.read((d) => d.profiles.filter((p) => p.discord_user_id));
  }

  async deleteUser(userId: string) {
    this.write((d) => {
      const removedEmail = d.users.find((u) => u.id === userId)?.email ?? d.profiles.find((p) => p.id === userId)?.email ?? null;
      d.users = d.users.filter((u) => u.id !== userId);
      d.profiles = d.profiles.filter((p) => p.id !== userId);
      d.scripts = d.scripts.filter((s) => s.user_id !== userId);
      d.saved_products = d.saved_products.filter((s) => s.user_id !== userId);
      d.subscriptions = d.subscriptions.filter((s) => s.user_id !== userId);
      d.usage = d.usage.filter((u) => u.user_id !== userId);
      d.digests = d.digests.filter((x) => x.user_id !== userId);
      d.discord_link_codes = d.discord_link_codes.filter((c) => c.user_id !== userId);
      const coachIds = d.coaches.filter((c) => c.user_id === userId).map((c) => c.id);
      d.coaches = d.coaches.filter((c) => c.user_id !== userId);
      for (const p of d.profiles) {
        if (p.referred_by === userId) p.referred_by = null;
        if (p.coach_id && coachIds.includes(p.coach_id)) p.coach_id = null;
      }
      const referralIds = d.referrals
        .filter((r) => r.referrer_id === userId || r.referred_id === userId)
        .map((r) => r.id);
      d.referrals = d.referrals.filter((r) => !referralIds.includes(r.id));
      d.commissions = d.commissions.filter((c) => !referralIds.includes(c.referral_id) && c.referrer_id !== userId);
      // Fiches de tous les types (gains, plans, notifications, abonnements push…) et tâches du jour à son nom.
      d.user_records = d.user_records.filter((r) => r.user_id !== userId);
      d.daily_tasks = d.daily_tasks.filter((t) => !t.task.includes(userId));
      // Demande de partenariat et boîte de test (mode local) à son adresse.
      if (removedEmail) {
        const email = removedEmail.toLowerCase();
        d.coach_applications = d.coach_applications.filter((a) => a.email.toLowerCase() !== email);
        d.emails = d.emails.filter((e) => e.to.toLowerCase() !== email);
      }
    });
  }

  async exportUserData(userId: string): Promise<UserDataExport> {
    return this.read((d) => {
      const profile = d.profiles.find((p) => p.id === userId) ?? null;
      const email = profile?.email.toLowerCase() ?? null;
      const received = d.referrals.find((r) => r.referred_id === userId);
      return clone({
        profile,
        scripts: d.scripts.filter((s) => s.user_id === userId),
        saved_products: d.saved_products.filter((s) => s.user_id === userId),
        subscriptions: d.subscriptions.filter((s) => s.user_id === userId),
        usage: d.usage.filter((u) => u.user_id === userId).map((u) => ({ day: u.day, scripts_generated: u.scripts_generated })),
        digests: d.digests.filter((x) => x.user_id === userId),
        records: d.user_records.filter((r) => r.user_id === userId),
        referrals_made: d.referrals
          .filter((r) => r.referrer_id === userId)
          .map((r) => ({ id: r.id, status: r.status, commission_due_cents: r.commission_due_cents, commission_paid_cents: r.commission_paid_cents, created_at: r.created_at })),
        referral_received: received ? { id: received.id, status: received.status, created_at: received.created_at } : null,
        commissions: d.commissions.filter((c) => c.referrer_id === userId),
        coach: d.coaches.find((c) => c.user_id === userId) ?? null,
        coach_applications: email ? d.coach_applications.filter((a) => a.email.toLowerCase() === email) : [],
      });
    });
  }

  // ------------------------------------------------------------------
  // Catalogue
  // ------------------------------------------------------------------
  async upsertProducts(products: Product[]) {
    this.write((d) => {
      const index = new Map(d.products.map((p, i) => [p.id, i]));
      for (const product of products) {
        const i = index.get(product.id);
        if (i === undefined) {
          index.set(product.id, d.products.length);
          d.products.push(product);
        } else {
          d.products[i] = product;
        }
      }
    });
  }

  async listProducts(opts: { niches?: NicheId[] } = {}) {
    return this.read((d) =>
      d.products
        .filter((p) => !opts.niches?.length || opts.niches.includes(p.niche))
        .sort((a, b) => b.latest_score - a.latest_score),
    );
  }

  async getProduct(id: string) {
    return this.read((d) => d.products.find((p) => p.id === id) ?? null);
  }

  async getProducts(ids: string[]) {
    const wanted = new Set(ids);
    return this.read((d) => d.products.filter((p) => wanted.has(p.id)));
  }


  async updateProductVideos(id: string, videos: TopVideo[], fetchedAt: string) {
    this.write((d) => {
      const product = d.products.find((p) => p.id === id);
      if (product) Object.assign(product, { top_videos: videos, videos_fetched_at: fetchedAt });
    });
  }
  async upsertSnapshots(snapshots: ProductSnapshot[]) {
    this.write((d) => {
      const key = (s: ProductSnapshot) => `${s.product_id}|${s.date}`;
      const index = new Map(d.snapshots.map((s, i) => [key(s), i]));
      for (const snap of snapshots) {
        const i = index.get(key(snap));
        if (i === undefined) {
          index.set(key(snap), d.snapshots.length);
          d.snapshots.push(snap);
        } else {
          d.snapshots[i] = snap;
        }
      }
      // Garde la base locale légère : le détail du score n'est conservé que sur 2 jours.
      const dates = [...new Set(d.snapshots.map((s) => s.date))].sort();
      const keepDetail = new Set(dates.slice(-2));
      for (const s of d.snapshots) if (!keepDetail.has(s.date)) s.score_breakdown = null;
    });
  }

  async getProductSnapshots(productId: string, days: number) {
    return this.read((d) =>
      d.snapshots
        .filter((s) => s.product_id === productId)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-days),
    );
  }

  async countProducts() {
    return this.read((d) => d.products.length);
  }

  // ------------------------------------------------------------------
  // Scripts
  // ------------------------------------------------------------------
  async insertScript(script: Omit<ScriptRecord, 'id' | 'created_at'>) {
    return this.write((d) => {
      const record: ScriptRecord = { ...script, id: randomId(), created_at: now() };
      d.scripts.push(record);
      return record;
    });
  }

  async getScript(userId: string, id: string) {
    return this.read((d) => d.scripts.find((s) => s.id === id && s.user_id === userId) ?? null);
  }

  async updateScript(
    userId: string,
    id: string,
    patch: Partial<Pick<ScriptRecord, 'hooks' | 'saved' | 'regen_count' | 'full_text'>>,
  ) {
    return this.write((d) => {
      const script = d.scripts.find((s) => s.id === id && s.user_id === userId);
      if (!script) throw new Error('Script introuvable');
      Object.assign(script, patch);
      return script;
    });
  }

  async listScripts(userId: string, opts: { limit?: number; savedOnly?: boolean } = {}) {
    return this.read((d) =>
      d.scripts
        .filter((s) => s.user_id === userId && (!opts.savedOnly || s.saved))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, opts.limit ?? 50),
    );
  }

  async deleteScript(userId: string, id: string) {
    this.write((d) => {
      d.scripts = d.scripts.filter((s) => !(s.id === id && s.user_id === userId));
    });
  }

  async countScripts(userId?: string) {
    return this.read((d) => d.scripts.filter((s) => !userId || s.user_id === userId).length);
  }

  // ------------------------------------------------------------------
  // Usage
  // ------------------------------------------------------------------
  async getUsage(userId: string, day: string) {
    return this.read((d) => d.usage.find((u) => u.user_id === userId && u.day === day)?.scripts_generated ?? 0);
  }

  async incrementUsage(userId: string, day: string, limit: number) {
    return this.write((d) => {
      let row = d.usage.find((u) => u.user_id === userId && u.day === day);
      if (!row) {
        row = { user_id: userId, day, scripts_generated: 0 };
        d.usage.push(row);
      }
      if (limit >= 0 && row.scripts_generated >= limit) return -1;
      row.scripts_generated += 1;
      return row.scripts_generated;
    });
  }

  async decrementUsage(userId: string, day: string) {
    this.write((d) => {
      const row = d.usage.find((u) => u.user_id === userId && u.day === day);
      if (row) row.scripts_generated = Math.max(0, row.scripts_generated - 1);
    });
  }

  // ------------------------------------------------------------------
  // Mes produits
  // ------------------------------------------------------------------
  async listSavedProducts(userId: string) {
    return this.read((d) =>
      d.saved_products.filter((s) => s.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    );
  }

  async getSavedProduct(userId: string, productId: string) {
    return this.read((d) => d.saved_products.find((s) => s.user_id === userId && s.product_id === productId) ?? null);
  }

  async saveProduct(userId: string, productId: string, goal = 20) {
    return this.write((d) => {
      const existing = d.saved_products.find((s) => s.user_id === userId && s.product_id === productId);
      if (existing) return existing;
      const row: SavedProduct = {
        id: randomId(),
        user_id: userId,
        product_id: productId,
        video_goal: goal,
        videos_posted: 0,
        created_at: now(),
        updated_at: now(),
      };
      d.saved_products.push(row);
      return row;
    });
  }

  async updateSavedProduct(
    userId: string,
    productId: string,
    patch: Partial<Pick<SavedProduct, 'video_goal' | 'videos_posted'>>,
  ) {
    return this.write((d) => {
      const row = d.saved_products.find((s) => s.user_id === userId && s.product_id === productId);
      if (!row) throw new Error('Produit non suivi');
      Object.assign(row, patch, { updated_at: now() });
      return row;
    });
  }

  async removeSavedProduct(userId: string, productId: string) {
    this.write((d) => {
      d.saved_products = d.saved_products.filter((s) => !(s.user_id === userId && s.product_id === productId));
    });
  }

  // ------------------------------------------------------------------
  // Abonnements
  // ------------------------------------------------------------------
  async upsertSubscription(sub: Subscription) {
    this.write((d) => {
      const i = d.subscriptions.findIndex((s) => s.id === sub.id);
      if (i === -1) d.subscriptions.push(sub);
      else d.subscriptions[i] = sub;
    });
  }

  async getSubscription(id: string) {
    return this.read((d) => d.subscriptions.find((s) => s.id === id) ?? null);
  }

  async getActiveSubscription(userId: string) {
    return this.read(
      (d) =>
        d.subscriptions
          .filter((s) => s.user_id === userId && ['active', 'trialing', 'past_due'].includes(s.status))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null,
    );
  }

  async listSubscriptions(opts: { provider?: Subscription['provider'] } = {}) {
    return this.read((d) => d.subscriptions.filter((s) => !opts.provider || s.provider === opts.provider));
  }

  async markBillingEvent(id: string, type: string) {
    return this.write((d) => {
      if (d.billing_events.some((e) => e.id === id)) return false;
      d.billing_events.push({ id, type, processed_at: now() });
      return true;
    });
  }

  // ------------------------------------------------------------------
  // Formateurs
  // ------------------------------------------------------------------
  async getCoachByUserId(userId: string) {
    return this.read((d) => d.coaches.find((c) => c.user_id === userId) ?? null);
  }

  async getCoachById(id: string) {
    return this.read((d) => d.coaches.find((c) => c.id === id) ?? null);
  }

  async getCoachByPromoCode(code: string) {
    const normalized = code.trim().toUpperCase();
    return this.read((d) => d.coaches.find((c) => c.promo_code === normalized) ?? null);
  }

  async createCoach(input: Omit<Coach, 'id' | 'created_at'>) {
    return this.write((d) => {
      if (d.coaches.some((c) => c.user_id === input.user_id)) throw new Error('Ce compte est déjà formateur.');
      if (d.coaches.some((c) => c.promo_code === input.promo_code)) throw new Error('Ce code promo est déjà pris.');
      const coach: Coach = { ...input, id: randomId(), created_at: now() };
      d.coaches.push(coach);
      return coach;
    });
  }

  async listCoaches() {
    return this.read((d) => [...d.coaches].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async listCoachStudents(coachId: string): Promise<CoachStudent[]> {
    return this.read((d) =>
      d.profiles
        .filter((p) => p.coach_id === coachId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => ({
          student_id: p.id,
          first_name: p.first_name,
          plan: p.plan,
          eligibility: p.eligibility,
          scripts_generated: d.scripts.filter((s) => s.user_id === p.id).length,
          products_followed: d.saved_products.filter((s) => s.user_id === p.id).length,
          last_seen_at: p.last_seen_at,
          joined_at: p.created_at,
          email: p.share_email_with_coach ? p.email : null,
        })),
    );
  }

  // ------------------------------------------------------------------
  // Parrainage
  // ------------------------------------------------------------------
  async createReferral(input: Pick<Referral, 'referrer_id' | 'referred_id' | 'coach_id'>) {
    return this.write((d) => {
      if (input.referrer_id === input.referred_id) return null;
      if (d.referrals.some((r) => r.referred_id === input.referred_id)) return null;
      const referral: Referral = {
        ...input,
        id: randomId(),
        status: 'inscrit',
        commission_due_cents: 0,
        commission_paid_cents: 0,
        created_at: now(),
      };
      d.referrals.push(referral);
      return referral;
    });
  }

  async getReferralByReferred(referredId: string) {
    return this.read((d) => d.referrals.find((r) => r.referred_id === referredId) ?? null);
  }

  async updateReferral(
    id: string,
    patch: Partial<Pick<Referral, 'status' | 'commission_due_cents' | 'commission_paid_cents'>>,
  ) {
    this.write((d) => {
      const referral = d.referrals.find((r) => r.id === id);
      if (referral) Object.assign(referral, patch);
    });
  }

  async listReferralsByReferrer(referrerId: string) {
    return this.read((d) =>
      d.referrals
        .filter((r) => r.referrer_id === referrerId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((r) => {
          const referred = d.profiles.find((p) => p.id === r.referred_id);
          return {
            ...r,
            referred_first_name: referred?.first_name ?? null,
            referred_plan: referred?.plan ?? ('free' as const),
          };
        }),
    );
  }

  async addCommission(input: Omit<Commission, 'id' | 'created_at' | 'status' | 'canceled_cents'>) {
    return this.write((d) => {
      if (d.commissions.some((c) => c.invoice_id === input.invoice_id)) return false;
      d.commissions.push({ ...input, canceled_cents: 0, id: randomId(), status: 'due', created_at: now() });
      const referral = d.referrals.find((r) => r.id === input.referral_id);
      if (referral) referral.commission_due_cents += input.amount_cents;
      return true;
    });
  }

  async refundCommission(invoiceId: string, refundedShare: number) {
    return this.write((d) => {
      const commission = d.commissions.find((c) => c.invoice_id === invoiceId);
      if (!commission) return null;
      const change = commissionRefund(commission, refundedShare);
      Object.assign(commission, change.patch);
      const referral = d.referrals.find((r) => r.id === commission.referral_id);
      if (referral) referral.commission_due_cents -= change.deltaCents;
      return { canceledCents: commission.canceled_cents, remainingCents: commission.amount_cents };
    });
  }

  async listCommissions(referrerId: string) {
    return this.read((d) =>
      d.commissions.filter((c) => c.referrer_id === referrerId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    );
  }

  // ------------------------------------------------------------------
  // Récap du matin
  // ------------------------------------------------------------------
  async upsertDigest(digest: Omit<Digest, 'created_at'>) {
    this.write((d) => {
      const i = d.digests.findIndex((x) => x.user_id === digest.user_id && x.day === digest.day);
      const row: Digest = { ...digest, created_at: i === -1 ? now() : d.digests[i].created_at };
      if (i === -1) d.digests.push(row);
      else d.digests[i] = row;
      // On ne garde que 14 jours de récaps en local.
      const days = [...new Set(d.digests.map((x) => x.day))].sort();
      const keep = new Set(days.slice(-14));
      d.digests = d.digests.filter((x) => keep.has(x.day));
    });
  }

  async getDigest(userId: string, day: string) {
    return this.read((d) => d.digests.find((x) => x.user_id === userId && x.day === day) ?? null);
  }

  async listDigests(day: string) {
    return this.read((d) => d.digests.filter((x) => x.day === day));
  }

  async updateDigestStatus(
    userId: string,
    day: string,
    patch: Partial<Pick<Digest, 'email_status' | 'discord_status'>>,
  ) {
    this.write((d) => {
      const digest = d.digests.find((x) => x.user_id === userId && x.day === day);
      if (digest) Object.assign(digest, patch);
    });
  }

  // ------------------------------------------------------------------
  // Discord
  // ------------------------------------------------------------------
  async createDiscordLinkCode(userId: string, code: string, expiresAt: string) {
    this.write((d) => {
      d.discord_link_codes = d.discord_link_codes.filter((c) => c.user_id !== userId || c.used_at);
      d.discord_link_codes.push({ code, user_id: userId, expires_at: expiresAt, used_at: null });
    });
  }

  async consumeDiscordLinkCode(code: string) {
    return this.write((d) => {
      const entry = d.discord_link_codes.find((c) => c.code === code.trim().toUpperCase());
      if (!entry || entry.used_at || entry.expires_at < now()) return null;
      entry.used_at = now();
      return entry.user_id;
    });
  }

  // ------------------------------------------------------------------
  // Demandes de partenariat
  // ------------------------------------------------------------------
  async insertCoachApplication(input: Omit<CoachApplication, 'id' | 'created_at' | 'status'>) {
    return this.write((d) => {
      const row: CoachApplication = { ...input, id: randomId(), status: 'nouvelle', created_at: now() };
      d.coach_applications.push(row);
      return row;
    });
  }

  async listCoachApplications() {
    return this.read((d) => [...d.coach_applications].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }

  async updateCoachApplication(id: string, status: CoachApplication['status']) {
    this.write((d) => {
      const row = d.coach_applications.find((a) => a.id === id);
      if (row) row.status = status;
    });
  }

  // ------------------------------------------------------------------
  // Tâches planifiées
  // ------------------------------------------------------------------
  async getProviderCache(key: string) {
    const nowIso = now();
    return this.read((d) => d.provider_cache.find((e) => e.key === key && e.expires_at > nowIso)?.value ?? null);
  }

  async setProviderCache(key: string, value: unknown, expiresAt: string) {
    this.write((d) => {
      d.provider_cache = d.provider_cache.filter((e) => e.key !== key);
      d.provider_cache.push({ key, value, expires_at: expiresAt });
    });
  }

  async purgeProviderCache() {
    const nowIso = now();
    return this.write((d) => {
      const before = d.provider_cache.length;
      d.provider_cache = d.provider_cache.filter((e) => e.expires_at > nowIso);
      return before - d.provider_cache.length;
    });
  }

  async listRecords<T>(userId: string, kind: RecordKind) {
    return this.read((d) =>
      d.user_records
        .filter((r) => r.user_id === userId && r.kind === kind)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)) as Array<UserRecord<T>>,
    );
  }

  async getRecord<T>(userId: string, id: string) {
    return this.read((d) => (d.user_records.find((r) => r.id === id && r.user_id === userId) as UserRecord<T> | undefined) ?? null);
  }

  async saveRecord<T>(userId: string, kind: RecordKind, data: T, id?: string) {
    return this.write((d) => {
      const at = now();
      const existing = id ? d.user_records.find((r) => r.id === id && r.user_id === userId) : undefined;
      if (existing) {
        Object.assign(existing, { data, updated_at: at });
        return clone(existing) as UserRecord<T>;
      }
      const record = { id: randomId(), user_id: userId, kind, data, created_at: at, updated_at: at } as UserRecord;
      d.user_records.push(record);
      return clone(record) as UserRecord<T>;
    });
  }

  async deleteRecord(userId: string, id: string) {
    this.write((d) => {
      d.user_records = d.user_records.filter((r) => !(r.id === id && r.user_id === userId));
    });
  }

  async countRecordsSince(userId: string, kind: RecordKind, sinceIso: string) {
    return this.read((d) => d.user_records.filter((r) => r.user_id === userId && r.kind === kind && r.created_at >= sinceIso).length);
  }

  async listAllRecords<T>(kind: RecordKind) {
    return this.read((d) => d.user_records.filter((r) => r.kind === kind) as Array<UserRecord<T>>);
  }

  async claimDailyTask(task: string, day: string) {
    return this.write((d) => {
      if (d.daily_tasks.some((t) => t.task === task && t.day === day)) return false;
      d.daily_tasks.push({ task, day, claimed_at: now() });
      // On ne garde que 30 jours.
      d.daily_tasks = d.daily_tasks.filter((t) => t.day >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
      return true;
    });
  }

  async releaseDailyTask(task: string, day: string) {
    this.write((d) => {
      d.daily_tasks = d.daily_tasks.filter((t) => !(t.task === task && t.day === day));
    });
  }

  async startCronRun(job: string, trigger: CronRun['trigger']) {
    return this.write((d) => {
      const run: CronRun = {
        id: randomId(),
        job,
        trigger,
        status: 'running',
        details: {},
        started_at: now(),
        finished_at: null,
      };
      d.cron_runs.push(run);
      d.cron_runs = d.cron_runs.slice(-50);
      return run;
    });
  }

  async finishCronRun(id: string, status: 'ok' | 'error', details: Record<string, unknown>) {
    this.write((d) => {
      const run = d.cron_runs.find((r) => r.id === id);
      if (run) Object.assign(run, { status, details, finished_at: now() });
    });
  }

  async listCronRuns(limit = 10) {
    return this.read((d) => [...d.cron_runs].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit));
  }

  // ------------------------------------------------------------------
  // Boîte de réception locale
  // ------------------------------------------------------------------
  async logLocalEmail(email: Omit<LocalEmail, 'id' | 'created_at'>) {
    this.write((d) => {
      d.emails.push({ ...email, id: randomId(), created_at: now() });
      d.emails = d.emails.slice(-30);
    });
  }

  async listLocalEmails(limit = 20) {
    return this.read((d) => [...d.emails].reverse().slice(0, limit));
  }
}

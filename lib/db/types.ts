import type { NicheId } from '@/lib/niches';

export type PlanId = 'free' | 'pro' | 'proplus';
export type Eligibility = 'preparation' | 'affilie';
export type FollowerRange = '0-500' | '500-1500' | '1500-5000' | '5000-20000' | '20000+';
export type Theme = 'system' | 'light' | 'dark';
export type Trend = 'explose' | 'monte' | 'stable' | 'baisse';
export type ScriptFormat = 'demo' | 'avant_apres' | 'histoire' | 'reponse_commentaire' | 'unboxing';
export type BillingInterval = 'month' | 'year';

export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  tiktok_handle: string | null;
  follower_range: FollowerRange | null;
  niches: NicheId[];
  video_style: string | null;
  example_phrase: string | null;
  plan: PlanId;
  eligibility: Eligibility;
  referral_code: string;
  coach_id: string | null;
  referred_by: string | null;
  digest_email: boolean;
  digest_discord: boolean;
  digest_hour: number;
  discord_user_id: string | null;
  theme: Theme;
  share_email_with_coach: boolean;
  stripe_customer_id: string | null;
  trial_used: boolean;
  onboarded_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface TopVideo {
  title: string;
  views: number;
  estimated_sales: number;
  hook: string | null;
  format: string;
}

export type ScorePartKey = 'croissance' | 'commission' | 'saturation' | 'prix' | 'echantillon';

export interface ScorePart {
  key: ScorePartKey;
  label: string;
  weight: number; // poids nominal (35, 25, 20, 10, 10)
  /** false = la source ne fournit pas la donnée : critère ignoré, son poids est réparti sur les autres. */
  available?: boolean;
  /** Poids réellement appliqué après répartition (égal à `weight` quand tout est disponible). */
  applied_weight?: number;
  value: number; // 0..1
  points: number; // value × poids appliqué, arrondi à 0,1
  sentence: string;
}

export interface ScoreBreakdown {
  /** Score affiché (15 à 90 : points placés sur l'échelle du jour). */
  total: number;
  /** Total des points des critères (0 à 100), avant mise à l'échelle. */
  raw?: number;
  parts: ScorePart[];
  /** Croissance sur 7 jours ; null = pas encore mesurable (historique trop court). */
  growth_7d: number | null;
  /** Ventes moyennes par jour sur 7 jours ; null = inconnues. */
  daily_sales_7d: number | null;
  summary: string;
}

export interface Product {
  id: string;
  provider: string;
  name: string;
  niche: NicheId;
  description: string;
  shop_name: string;
  price_cents: number;
  commission_rate: number;
  /** null = la source ne le dit pas. */
  free_sample: boolean | null;
  /** null = la source ne le dit pas. */
  active_affiliates: number | null;
  image_url: string;
  top_videos: TopVideo[];
  snapshot_date: string | null;
  latest_score: number;
  latest_breakdown: ScoreBreakdown | null;
  trend: Trend;
  growth_7d: number;
  sales_30d: number[];
  updated_at: string;
}

export interface ProductSnapshot {
  product_id: string;
  date: string;
  /** null = ventes du jour inconnues (premier relevé d'une source qui ne donne qu'un cumul). */
  estimated_sales: number | null;
  affiliates: number | null;
  /** Cumul des ventes renvoyé par la source, pour déduire les ventes du jour suivant. */
  units_sold_total?: number | null;
  score: number;
  score_breakdown: ScoreBreakdown | null;
  trend: Trend;
}

export interface Hook {
  text: string;
  seconds: number;
}

export interface Shot {
  time: string;
  visual: string;
  voice: string;
  on_screen_text: string;
}

export interface VideoScript {
  title: string;
  angle: string;
  duration_seconds: number;
  shots: Shot[];
  call_to_action: string;
  caption: string;
  hashtags: string[];
  disclosure: string;
}

export interface ScriptRecord {
  id: string;
  user_id: string;
  product_id: string;
  format: ScriptFormat;
  hooks: Hook[];
  script: VideoScript[];
  full_text: string;
  source: 'claude' | 'openai' | 'simulation';
  saved: boolean;
  regen_count: number;
  created_at: string;
}

export interface SavedProduct {
  id: string;
  user_id: string;
  product_id: string;
  video_goal: number;
  videos_posted: number;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  provider: 'stripe' | 'simulation';
  customer_id: string | null;
  status: string;
  plan: PlanId;
  billing_interval: BillingInterval | null;
  price_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
}

export interface Coach {
  id: string;
  user_id: string;
  training_name: string;
  promo_code: string;
  commission_rate: number;
  created_at: string;
}

export type ReferralStatus = 'inscrit' | 'essai' | 'abonne' | 'resilie';

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  coach_id: string | null;
  status: ReferralStatus;
  commission_due_cents: number;
  commission_paid_cents: number;
  created_at: string;
}

export interface Commission {
  id: string;
  referral_id: string;
  referrer_id: string;
  invoice_id: string;
  /** Commission restante (montant d'origine moins la part annulée par des remboursements). */
  amount_cents: number;
  /** Part annulée par des remboursements, cumulée. */
  canceled_cents: number;
  month: string;
  status: 'due' | 'paid' | 'annulee';
  created_at: string;
}

export interface DigestProduct {
  id: string;
  name: string;
  niche: NicheId;
  price_cents: number;
  commission_cents: number;
  score: number | null;
  trend: Trend;
  growth_7d: number;
  free_sample: boolean | null;
  reason: string;
}

export interface DigestContent {
  date: string;
  first_name: string | null;
  plan: PlanId;
  products: DigestProduct[];
  hook: { product_id: string; product_name: string; text: string } | null;
  script: { product_id: string; product_name: string; title: string; lines: string[] } | null;
  locked_count: number;
  /** Produits fictifs (démonstration) : le récap le dit clairement. */
  demo?: boolean;
}

export interface Digest {
  user_id: string;
  day: string;
  content: DigestContent;
  email_status: 'pending' | 'scheduled' | 'sent' | 'skipped' | 'failed';
  discord_status: 'pending' | 'sent' | 'skipped' | 'failed';
  created_at: string;
}

export interface CoachApplication {
  id: string;
  name: string;
  email: string;
  training_name: string;
  audience_size: string;
  message: string;
  status: 'nouvelle' | 'acceptee' | 'refusee';
  created_at: string;
}

export interface CronRun {
  id: string;
  job: string;
  trigger: 'cron' | 'manuel' | 'seed';
  status: 'running' | 'ok' | 'error';
  details: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface CoachStudent {
  student_id: string;
  first_name: string | null;
  plan: PlanId;
  eligibility: Eligibility;
  scripts_generated: number;
  products_followed: number;
  last_seen_at: string | null;
  joined_at: string;
  email: string | null;
}

/** Champs qu'un utilisateur peut modifier lui-même. */
export type ProfileSelfUpdate = Partial<
  Pick<
    Profile,
    | 'first_name'
    | 'tiktok_handle'
    | 'follower_range'
    | 'niches'
    | 'video_style'
    | 'example_phrase'
    | 'digest_email'
    | 'digest_discord'
    | 'digest_hour'
    | 'theme'
    | 'share_email_with_coach'
    | 'onboarded_at'
    | 'last_seen_at'
  >
>;

/** Champs modifiables uniquement par le serveur (paiement, parrainage…). */
export type ProfileSystemUpdate = ProfileSelfUpdate &
  Partial<Pick<Profile, 'plan' | 'coach_id' | 'referred_by' | 'stripe_customer_id' | 'trial_used' | 'discord_user_id'>>;

export interface LocalEmail {
  id: string;
  to: string;
  subject: string;
  html: string;
  scheduled_at: string | null;
  created_at: string;
}

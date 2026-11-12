/**
 * Types de la base Supabase.
 *
 * Écrits à la main pour correspondre exactement à `supabase/migrations/`. Une fois le projet
 * Supabase créé, tu peux les régénérer avec :
 *   npx supabase gen types typescript --project-id <id> --schema public > lib/db/database.types.ts
 * (le code de `lib/db/supabase.ts` reste compatible : il convertit les lignes vers les types métier).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type PlanId = 'free' | 'pro' | 'proplus';
type Eligibility = 'preparation' | 'affilie';
type Trend = 'explose' | 'monte' | 'stable' | 'baisse';

export interface Database {
  public: {
    Tables: {
      coaches: Table<
        {
          id: string;
          user_id: string;
          training_name: string;
          promo_code: string;
          commission_rate: number;
          created_at: string;
        },
        'user_id' | 'training_name' | 'promo_code'
      >;
      profiles: Table<
        {
          id: string;
          email: string;
          first_name: string | null;
          tiktok_handle: string | null;
          follower_range: string | null;
          niches: string[];
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
          theme: string;
          share_email_with_coach: boolean;
          stripe_customer_id: string | null;
          trial_used: boolean;
          onboarded_at: string | null;
          last_seen_at: string | null;
          created_at: string;
        },
        'id' | 'email' | 'referral_code'
      >;
      products: Table<
        {
          id: string;
          provider: string;
          name: string;
          niche: string;
          description: string;
          shop_name: string;
          price_cents: number;
          commission_rate: number;
          free_sample: boolean;
          active_affiliates: number;
          image_url: string;
          top_videos: Json;
          snapshot_date: string | null;
          latest_score: number;
          latest_breakdown: Json;
          trend: Trend;
          growth_7d: number;
          sales_30d: number[];
          updated_at: string;
        },
        'id' | 'name' | 'niche' | 'price_cents' | 'commission_rate'
      >;
      product_snapshots: Table<
        {
          product_id: string;
          date: string;
          estimated_sales: number;
          affiliates: number;
          score: number;
          score_breakdown: Json;
          trend: Trend;
        },
        'product_id' | 'date'
      >;
      scripts: Table<
        {
          id: string;
          user_id: string;
          product_id: string;
          format: string;
          hooks: Json;
          script: Json;
          full_text: string;
          source: 'claude' | 'openai' | 'simulation';
          saved: boolean;
          regen_count: number;
          created_at: string;
        },
        'user_id' | 'product_id' | 'format'
      >;
      saved_products: Table<
        {
          id: string;
          user_id: string;
          product_id: string;
          video_goal: number;
          videos_posted: number;
          created_at: string;
          updated_at: string;
        },
        'user_id' | 'product_id'
      >;
      subscriptions: Table<
        {
          id: string;
          user_id: string;
          provider: 'stripe' | 'simulation';
          customer_id: string | null;
          status: string;
          plan: PlanId;
          billing_interval: 'month' | 'year' | null;
          price_id: string | null;
          current_period_end: string | null;
          trial_end: string | null;
          cancel_at_period_end: boolean;
          updated_at: string;
        },
        'id' | 'user_id' | 'status' | 'plan'
      >;
      usage: Table<{ user_id: string; day: string; scripts_generated: number }, 'user_id' | 'day'>;
      referrals: Table<
        {
          id: string;
          referrer_id: string;
          referred_id: string;
          coach_id: string | null;
          status: 'inscrit' | 'essai' | 'abonne' | 'resilie';
          commission_due_cents: number;
          commission_paid_cents: number;
          created_at: string;
        },
        'referrer_id' | 'referred_id'
      >;
      commissions: Table<
        {
          id: string;
          referral_id: string;
          referrer_id: string;
          invoice_id: string;
          amount_cents: number;
          month: string;
          status: 'due' | 'paid';
          created_at: string;
        },
        'referral_id' | 'referrer_id' | 'invoice_id' | 'amount_cents' | 'month'
      >;
      digests: Table<
        {
          user_id: string;
          day: string;
          content: Json;
          email_status: 'pending' | 'scheduled' | 'sent' | 'skipped' | 'failed';
          discord_status: 'pending' | 'sent' | 'skipped' | 'failed';
          created_at: string;
        },
        'user_id' | 'day' | 'content'
      >;
      coach_applications: Table<
        {
          id: string;
          name: string;
          email: string;
          training_name: string;
          audience_size: string;
          message: string;
          status: 'nouvelle' | 'acceptee' | 'refusee';
          created_at: string;
        },
        'name' | 'email' | 'training_name'
      >;
      discord_link_codes: Table<
        { code: string; user_id: string; expires_at: string; used_at: string | null },
        'code' | 'user_id' | 'expires_at'
      >;
      billing_events: Table<{ id: string; type: string; processed_at: string }, 'id' | 'type'>;
      cron_runs: Table<
        {
          id: string;
          job: string;
          trigger: 'cron' | 'manuel' | 'seed';
          status: 'running' | 'ok' | 'error';
          details: Json;
          started_at: string;
          finished_at: string | null;
        },
        'job'
      >;
    };
    Views: Record<string, never>;
    Functions: {
      increment_usage: {
        Args: { p_user: string; p_day: string; p_limit: number };
        Returns: number;
      };
      coach_student_stats: {
        Args: { p_coach_id: string };
        Returns: Array<{
          student_id: string;
          first_name: string | null;
          plan: PlanId;
          eligibility: Eligibility;
          scripts_generated: number;
          products_followed: number;
          last_seen_at: string | null;
          joined_at: string;
          email: string | null;
        }>;
      };
    };
    Enums: {
      plan_id: PlanId;
      eligibility: Eligibility;
      product_trend: Trend;
    };
    CompositeTypes: Record<string, never>;
  };
}

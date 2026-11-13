// Généré par « npm run db:setup » (types du projet Supabase).
// Ne pas modifier à la main : relancer la commande après chaque migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      billing_events: {
        Row: {
          id: string
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      coach_applications: {
        Row: {
          audience_size: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          training_name: string
        }
        Insert: {
          audience_size?: string
          created_at?: string
          email: string
          id?: string
          message?: string
          name: string
          status?: string
          training_name: string
        }
        Update: {
          audience_size?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          training_name?: string
        }
        Relationships: []
      }
      coaches: {
        Row: {
          commission_rate: number
          created_at: string
          id: string
          promo_code: string
          training_name: string
          user_id: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          id?: string
          promo_code: string
          training_name: string
          user_id: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          id?: string
          promo_code?: string
          training_name?: string
          user_id?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          amount_cents: number
          canceled_cents: number
          created_at: string
          id: string
          invoice_id: string
          month: string
          referral_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          amount_cents: number
          canceled_cents?: number
          created_at?: string
          id?: string
          invoice_id: string
          month: string
          referral_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          canceled_cents?: number
          created_at?: string
          id?: string
          invoice_id?: string
          month?: string
          referral_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_runs: {
        Row: {
          details: Json
          finished_at: string | null
          id: string
          job: string
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          details?: Json
          finished_at?: string | null
          id?: string
          job: string
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          details?: Json
          finished_at?: string | null
          id?: string
          job?: string
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      daily_tasks: {
        Row: {
          claimed_at: string
          day: string
          task: string
        }
        Insert: {
          claimed_at?: string
          day: string
          task: string
        }
        Update: {
          claimed_at?: string
          day?: string
          task?: string
        }
        Relationships: []
      }
      digests: {
        Row: {
          content: Json
          created_at: string
          day: string
          discord_status: string
          email_status: string
          user_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          day: string
          discord_status?: string
          email_status?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          day?: string
          discord_status?: string
          email_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_link_codes: {
        Row: {
          code: string
          expires_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          expires_at: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          expires_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_link_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_snapshots: {
        Row: {
          affiliates: number | null
          date: string
          estimated_sales: number | null
          product_id: string
          score: number
          score_breakdown: Json
          trend: Database["public"]["Enums"]["product_trend"]
          units_sold_total: number | null
        }
        Insert: {
          affiliates?: number | null
          date: string
          estimated_sales?: number | null
          product_id: string
          score?: number
          score_breakdown?: Json
          trend?: Database["public"]["Enums"]["product_trend"]
          units_sold_total?: number | null
        }
        Update: {
          affiliates?: number | null
          date?: string
          estimated_sales?: number | null
          product_id?: string
          score?: number
          score_breakdown?: Json
          trend?: Database["public"]["Enums"]["product_trend"]
          units_sold_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active_affiliates: number | null
          commission_rate: number
          description: string
          details: Json | null
          growth_7d: number
          id: string
          image_url: string
          latest_breakdown: Json
          latest_score: number
          name: string
          niche: string
          price_cents: number
          provider: string
          region: string
          sales_30d: number[]
          shop_name: string
          snapshot_date: string | null
          top_videos: Json
          trend: Database["public"]["Enums"]["product_trend"]
          updated_at: string
          videos_fetched_at: string | null
        }
        Insert: {
          active_affiliates?: number | null
          commission_rate: number
          description?: string
          details?: Json | null
          growth_7d?: number
          id: string
          image_url?: string
          latest_breakdown?: Json
          latest_score?: number
          name: string
          niche: string
          price_cents: number
          provider?: string
          region?: string
          sales_30d?: number[]
          shop_name?: string
          snapshot_date?: string | null
          top_videos?: Json
          trend?: Database["public"]["Enums"]["product_trend"]
          updated_at?: string
          videos_fetched_at?: string | null
        }
        Update: {
          active_affiliates?: number | null
          commission_rate?: number
          description?: string
          details?: Json | null
          growth_7d?: number
          id?: string
          image_url?: string
          latest_breakdown?: Json
          latest_score?: number
          name?: string
          niche?: string
          price_cents?: number
          provider?: string
          region?: string
          sales_30d?: number[]
          shop_name?: string
          snapshot_date?: string | null
          top_videos?: Json
          trend?: Database["public"]["Enums"]["product_trend"]
          updated_at?: string
          videos_fetched_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          affiliate_status: string | null
          coach_id: string | null
          created_at: string
          digest_discord: boolean
          digest_email: boolean
          digest_hour: number
          discord_user_id: string | null
          eligibility: Database["public"]["Enums"]["eligibility"]
          email: string
          example_phrase: string | null
          experience_level: string | null
          first_name: string | null
          follower_range: string | null
          id: string
          last_seen_at: string | null
          niches: string[]
          onboarded_at: string | null
          onboarding_version: number
          plan: Database["public"]["Enums"]["plan_id"]
          referral_code: string
          referred_by: string | null
          region: string
          share_email_with_coach: boolean
          stripe_customer_id: string | null
          theme: string
          tiktok_handle: string | null
          trial_used: boolean
          video_style: string | null
          video_styles: string[]
          videos_per_week: string | null
        }
        Insert: {
          affiliate_status?: string | null
          coach_id?: string | null
          created_at?: string
          digest_discord?: boolean
          digest_email?: boolean
          digest_hour?: number
          discord_user_id?: string | null
          eligibility?: Database["public"]["Enums"]["eligibility"]
          email: string
          example_phrase?: string | null
          experience_level?: string | null
          first_name?: string | null
          follower_range?: string | null
          id: string
          last_seen_at?: string | null
          niches?: string[]
          onboarded_at?: string | null
          onboarding_version?: number
          plan?: Database["public"]["Enums"]["plan_id"]
          referral_code: string
          referred_by?: string | null
          region?: string
          share_email_with_coach?: boolean
          stripe_customer_id?: string | null
          theme?: string
          tiktok_handle?: string | null
          trial_used?: boolean
          video_style?: string | null
          video_styles?: string[]
          videos_per_week?: string | null
        }
        Update: {
          affiliate_status?: string | null
          coach_id?: string | null
          created_at?: string
          digest_discord?: boolean
          digest_email?: boolean
          digest_hour?: number
          discord_user_id?: string | null
          eligibility?: Database["public"]["Enums"]["eligibility"]
          email?: string
          example_phrase?: string | null
          experience_level?: string | null
          first_name?: string | null
          follower_range?: string | null
          id?: string
          last_seen_at?: string | null
          niches?: string[]
          onboarded_at?: string | null
          onboarding_version?: number
          plan?: Database["public"]["Enums"]["plan_id"]
          referral_code?: string
          referred_by?: string | null
          region?: string
          share_email_with_coach?: boolean
          stripe_customer_id?: string | null
          theme?: string
          tiktok_handle?: string | null
          trial_used?: boolean
          video_style?: string | null
          video_styles?: string[]
          videos_per_week?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_cache: {
        Row: {
          expires_at: string
          key: string
          value: Json
        }
        Insert: {
          expires_at: string
          key: string
          value: Json
        }
        Update: {
          expires_at?: string
          key?: string
          value?: Json
        }
        Relationships: []
      }
      referrals: {
        Row: {
          coach_id: string | null
          commission_due_cents: number
          commission_paid_cents: number
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          coach_id?: string | null
          commission_due_cents?: number
          commission_paid_cents?: number
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          coach_id?: string | null
          commission_due_cents?: number
          commission_paid_cents?: number
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_products: {
        Row: {
          created_at: string
          id: string
          product_id: string
          updated_at: string
          user_id: string
          video_goal: number
          videos_posted: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
          user_id: string
          video_goal?: number
          videos_posted?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
          user_id?: string
          video_goal?: number
          videos_posted?: number
        }
        Relationships: [
          {
            foreignKeyName: "saved_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          created_at: string
          format: string
          full_text: string
          hooks: Json
          id: string
          product_id: string
          regen_count: number
          saved: boolean
          script: Json
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          format: string
          full_text?: string
          hooks?: Json
          id?: string
          product_id: string
          regen_count?: number
          saved?: boolean
          script?: Json
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          format?: string
          full_text?: string
          hooks?: Json
          id?: string
          product_id?: string
          regen_count?: number
          saved?: boolean
          script?: Json
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean
          current_period_end: string | null
          customer_id: string | null
          id: string
          plan: Database["public"]["Enums"]["plan_id"]
          price_id: string | null
          provider: string
          status: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          customer_id?: string | null
          id: string
          plan: Database["public"]["Enums"]["plan_id"]
          price_id?: string | null
          provider?: string
          status: string
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          customer_id?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_id"]
          price_id?: string | null
          provider?: string
          status?: string
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage: {
        Row: {
          day: string
          scripts_generated: number
          user_id: string
        }
        Insert: {
          day: string
          scripts_generated?: number
          user_id: string
        }
        Update: {
          day?: string
          scripts_generated?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_records: {
        Row: {
          created_at: string
          data: Json
          id: string
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      coach_student_stats: {
        Args: { p_coach_id: string }
        Returns: {
          eligibility: Database["public"]["Enums"]["eligibility"]
          email: string
          first_name: string
          joined_at: string
          last_seen_at: string
          plan: Database["public"]["Enums"]["plan_id"]
          products_followed: number
          scripts_generated: number
          student_id: string
        }[]
      }
      coach_students: {
        Args: never
        Returns: {
          eligibility: Database["public"]["Enums"]["eligibility"]
          email: string
          first_name: string
          joined_at: string
          last_seen_at: string
          plan: Database["public"]["Enums"]["plan_id"]
          products_followed: number
          scripts_generated: number
          student_id: string
        }[]
      }
      generate_referral_code: { Args: never; Returns: string }
      increment_usage: {
        Args: { p_day: string; p_limit: number; p_user: string }
        Returns: number
      }
      is_server_record_kind: { Args: { k: string }; Returns: boolean }
    }
    Enums: {
      eligibility: "preparation" | "affilie"
      plan_id: "aucun" | "starter" | "pro" | "elite"
      product_trend: "explose" | "monte" | "stable" | "baisse"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      eligibility: ["preparation", "affilie"],
      plan_id: ["aucun", "starter", "pro", "elite"],
      product_trend: ["explose", "monte", "stable", "baisse"],
    },
  },
} as const

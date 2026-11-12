-- =====================================================================
-- Tracktout — schéma initial
-- Toutes les tables ont la RLS activée (voir 20261112000200_rls.sql).
-- Le serveur Next.js utilise la clé service (jamais exposée au navigateur) ;
-- la RLS protège tout accès direct avec la clé anon.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------
do $$ begin
  create type public.plan_id as enum ('free', 'pro', 'proplus');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.eligibility as enum ('preparation', 'affilie');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_trend as enum ('explose', 'monte', 'stable', 'baisse');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Formateurs (créés avant profiles, référencés par profiles.coach_id)
-- ---------------------------------------------------------------------
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  training_name text not null,
  promo_code text not null unique check (promo_code ~ '^[A-Z0-9-]{3,24}$'),
  commission_rate numeric(4, 3) not null default 0.300 check (commission_rate between 0 and 1),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profils (1-1 avec auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text check (char_length(first_name) <= 60),
  tiktok_handle text check (char_length(tiktok_handle) <= 40),
  follower_range text check (follower_range in ('0-500', '500-1500', '1500-5000', '5000-20000', '20000+')),
  niches text[] not null default '{}' check (cardinality(niches) <= 3),
  video_style text check (char_length(video_style) <= 40),
  example_phrase text check (char_length(example_phrase) <= 240),
  plan public.plan_id not null default 'free',
  eligibility public.eligibility not null default 'preparation',
  referral_code text not null unique,
  coach_id uuid references public.coaches (id) on delete set null,
  referred_by uuid references public.profiles (id) on delete set null,
  digest_email boolean not null default true,
  digest_discord boolean not null default false,
  digest_hour smallint not null default 8 check (digest_hour between 5 and 12),
  discord_user_id text unique,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  share_email_with_coach boolean not null default false,
  stripe_customer_id text unique,
  trial_used boolean not null default false,
  onboarded_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_coach_idx on public.profiles (coach_id);
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

-- ---------------------------------------------------------------------
-- Catalogue produits (données courantes, dénormalisées pour le radar)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id text primary key,
  provider text not null default 'mock',
  name text not null,
  niche text not null,
  description text not null default '',
  shop_name text not null default '',
  price_cents integer not null check (price_cents > 0),
  commission_rate numeric(4, 3) not null check (commission_rate between 0 and 1),
  free_sample boolean not null default false,
  active_affiliates integer not null default 0,
  image_url text not null default '',
  top_videos jsonb not null default '[]'::jsonb,
  -- Données du dernier instantané, copiées ici pour un radar en une requête
  snapshot_date date,
  latest_score smallint not null default 0 check (latest_score between 0 and 100),
  latest_breakdown jsonb not null default '{}'::jsonb,
  trend public.product_trend not null default 'stable',
  growth_7d numeric not null default 0,
  sales_30d integer[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists products_niche_score_idx on public.products (niche, latest_score desc);

create table if not exists public.product_snapshots (
  product_id text not null references public.products (id) on delete cascade,
  date date not null,
  estimated_sales integer not null default 0,
  affiliates integer not null default 0,
  score smallint not null default 0 check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  trend public.product_trend not null default 'stable',
  primary key (product_id, date)
);

create index if not exists product_snapshots_date_idx on public.product_snapshots (date);

-- ---------------------------------------------------------------------
-- Scripts générés
-- ---------------------------------------------------------------------
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  format text not null check (format in ('demo', 'avant_apres', 'histoire', 'reponse_commentaire', 'unboxing')),
  hooks jsonb not null default '[]'::jsonb,
  script jsonb not null default '[]'::jsonb,
  full_text text not null default '',
  source text not null default 'simulation' check (source in ('claude', 'simulation')),
  saved boolean not null default false,
  regen_count smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists scripts_user_created_idx on public.scripts (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- « Mes produits »
-- ---------------------------------------------------------------------
create table if not exists public.saved_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  video_goal smallint not null default 20 check (video_goal between 1 and 200),
  videos_posted smallint not null default 0 check (videos_posted between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ---------------------------------------------------------------------
-- Abonnements (miroir du prestataire de paiement)
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id text primary key, -- identifiant chez le prestataire (sub_…) ou sim_…
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe', 'simulation')),
  customer_id text,
  status text not null,
  plan public.plan_id not null,
  billing_interval text check (billing_interval in ('month', 'year')),
  price_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

-- ---------------------------------------------------------------------
-- Compteur quotidien d'usage (scripts générés)
-- ---------------------------------------------------------------------
create table if not exists public.usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  scripts_generated integer not null default 0 check (scripts_generated >= 0),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------
-- Parrainage et commissions
-- ---------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid not null unique references public.profiles (id) on delete cascade,
  coach_id uuid references public.coaches (id) on delete set null,
  status text not null default 'inscrit' check (status in ('inscrit', 'essai', 'abonne', 'resilie')),
  commission_due_cents integer not null default 0,
  commission_paid_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  invoice_id text not null unique,
  amount_cents integer not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  status text not null default 'due' check (status in ('due', 'paid')),
  created_at timestamptz not null default now()
);

create index if not exists commissions_referrer_month_idx on public.commissions (referrer_id, month);

-- ---------------------------------------------------------------------
-- Récap du matin
-- ---------------------------------------------------------------------
create table if not exists public.digests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  content jsonb not null,
  email_status text not null default 'pending' check (email_status in ('pending', 'scheduled', 'sent', 'skipped', 'failed')),
  discord_status text not null default 'pending' check (discord_status in ('pending', 'sent', 'skipped', 'failed')),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------
-- Demandes de partenariat formateur (formulaire public)
-- ---------------------------------------------------------------------
create table if not exists public.coach_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 160),
  training_name text not null check (char_length(training_name) <= 120),
  audience_size text not null default '',
  message text not null default '' check (char_length(message) <= 2000),
  status text not null default 'nouvelle' check (status in ('nouvelle', 'acceptee', 'refusee')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Liaison Discord par code à usage unique
-- ---------------------------------------------------------------------
create table if not exists public.discord_link_codes (
  code text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- ---------------------------------------------------------------------
-- Idempotence des webhooks de paiement
-- ---------------------------------------------------------------------
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Historique des tâches planifiées
-- ---------------------------------------------------------------------
create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  trigger text not null default 'cron' check (trigger in ('cron', 'manuel', 'seed')),
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists cron_runs_started_idx on public.cron_runs (started_at desc);

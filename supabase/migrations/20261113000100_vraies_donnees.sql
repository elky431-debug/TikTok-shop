-- =====================================================================
-- TikTrend — session 3 : vraies sources de données
-- Rejouable. Un fournisseur réel ne donne pas tout : un champ inconnu
-- reste vide (null) au lieu d'une valeur inventée.
-- =====================================================================

-- Nombre d'affiliés et échantillon gratuit : inconnus chez certains fournisseurs.
alter table public.products alter column active_affiliates drop not null;
alter table public.products alter column active_affiliates drop default;
alter table public.products alter column free_sample drop not null;
alter table public.products alter column free_sample drop default;

alter table public.product_snapshots alter column affiliates drop not null;
alter table public.product_snapshots alter column affiliates drop default;
-- Ventes du jour inconnues le premier jour quand la source ne donne qu'un cumul.
alter table public.product_snapshots alter column estimated_sales drop not null;
alter table public.product_snapshots alter column estimated_sales drop default;
-- Cumul des ventes renvoyé par la source : la différence d'une nuit à l'autre donne les ventes du jour.
alter table public.product_snapshots add column if not exists units_sold_total bigint;

-- Le radar ne lit que le dernier instantané de chaque source.
create index if not exists products_provider_snapshot_idx on public.products (provider, snapshot_date);

-- ---------------------------------------------------------------------
-- Cache des réponses du fournisseur (serveur uniquement) : relancer la
-- tâche le même jour ne refait pas payer les mêmes appels.
-- ---------------------------------------------------------------------
create table if not exists public.provider_cache (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);

create index if not exists provider_cache_expires_idx on public.provider_cache (expires_at);

alter table public.provider_cache enable row level security;
revoke all on public.provider_cache from anon, authenticated;

-- Session 4 · fonctionnalités V2 (gains, propositions de marques, plan de publication, analyses de vidéos) :
-- une table générique de fiches par utilisateur, `kind` + `data` (jsonb), sous RLS : chacun ne voit que les siennes.
-- Plus la région du catalogue (FR par défaut ; DE, IT, ES pour Pro+ quand ENABLED_REGIONS les active).

create table if not exists public.user_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('gain', 'offre', 'publication', 'analyse', 'import_csv')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_records_user_kind_idx on public.user_records (user_id, kind, created_at desc);

alter table public.user_records enable row level security;

drop policy if exists user_records_select_own on public.user_records;
create policy user_records_select_own on public.user_records for select using (auth.uid() = user_id);
drop policy if exists user_records_insert_own on public.user_records;
create policy user_records_insert_own on public.user_records for insert with check (auth.uid() = user_id);
drop policy if exists user_records_update_own on public.user_records;
create policy user_records_update_own on public.user_records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_records_delete_own on public.user_records;
create policy user_records_delete_own on public.user_records for delete using (auth.uid() = user_id);

alter table public.profiles add column if not exists region text not null default 'FR';
alter table public.profiles drop constraint if exists profiles_region_check;
alter table public.profiles add constraint profiles_region_check check (region in ('FR', 'DE', 'IT', 'ES'));

alter table public.products add column if not exists region text not null default 'FR';
create index if not exists products_region_idx on public.products (region);

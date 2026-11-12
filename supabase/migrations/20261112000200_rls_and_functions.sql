-- =====================================================================
-- Pépite — Row Level Security, droits par colonne et fonctions
-- Règle : chaque utilisateur ne voit que ses données. Le catalogue n'est
-- lisible que côté serveur (clé service) pour que les limites du plan
-- gratuit ne soient pas contournables depuis le navigateur.
-- =====================================================================

alter table public.coaches enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_snapshots enable row level security;
alter table public.scripts enable row level security;
alter table public.saved_products enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage enable row level security;
alter table public.referrals enable row level security;
alter table public.commissions enable row level security;
alter table public.digests enable row level security;
alter table public.coach_applications enable row level security;
alter table public.discord_link_codes enable row level security;
alter table public.billing_events enable row level security;
alter table public.cron_runs enable row level security;

-- ---------------------------------------------------------------------
-- profiles : lecture de sa ligne, modification de quelques colonnes seulement
-- (le plan, le formateur, l'identifiant de paiement… ne bougent que côté serveur)
-- ---------------------------------------------------------------------
drop policy if exists "profil : lecture de soi" on public.profiles;
create policy "profil : lecture de soi" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profil : modification de soi" on public.profiles;
create policy "profil : modification de soi" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  first_name, tiktok_handle, follower_range, niches, video_style, example_phrase,
  digest_email, digest_discord, digest_hour, theme, share_email_with_coach, last_seen_at
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- coaches : un formateur voit sa propre fiche
-- ---------------------------------------------------------------------
drop policy if exists "formateur : lecture de soi" on public.coaches;
create policy "formateur : lecture de soi" on public.coaches
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.coaches from anon, authenticated;

-- ---------------------------------------------------------------------
-- products / product_snapshots : aucune politique ⇒ serveur uniquement
-- ---------------------------------------------------------------------
revoke all on public.products, public.product_snapshots from anon, authenticated;

-- ---------------------------------------------------------------------
-- scripts : lecture, marquage « gardé » et suppression de ses scripts.
-- L'insertion passe par le serveur (comptage de l'usage et limites du plan).
-- ---------------------------------------------------------------------
drop policy if exists "scripts : lecture de soi" on public.scripts;
create policy "scripts : lecture de soi" on public.scripts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "scripts : modification de soi" on public.scripts;
create policy "scripts : modification de soi" on public.scripts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "scripts : suppression de soi" on public.scripts;
create policy "scripts : suppression de soi" on public.scripts
  for delete to authenticated using (user_id = auth.uid());

revoke insert, update on public.scripts from anon, authenticated;
grant update (saved) on public.scripts to authenticated;

-- ---------------------------------------------------------------------
-- saved_products : gestion complète de sa liste
-- ---------------------------------------------------------------------
drop policy if exists "mes produits : lecture" on public.saved_products;
create policy "mes produits : lecture" on public.saved_products
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "mes produits : ajout" on public.saved_products;
create policy "mes produits : ajout" on public.saved_products
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "mes produits : modification" on public.saved_products;
create policy "mes produits : modification" on public.saved_products
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "mes produits : suppression" on public.saved_products;
create policy "mes produits : suppression" on public.saved_products
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Lecture seule de ses propres lignes
-- ---------------------------------------------------------------------
drop policy if exists "abonnement : lecture de soi" on public.subscriptions;
create policy "abonnement : lecture de soi" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.subscriptions from anon, authenticated;

drop policy if exists "usage : lecture de soi" on public.usage;
create policy "usage : lecture de soi" on public.usage
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.usage from anon, authenticated;

drop policy if exists "parrainage : mes filleuls" on public.referrals;
create policy "parrainage : mes filleuls" on public.referrals
  for select to authenticated using (referrer_id = auth.uid());
revoke insert, update, delete on public.referrals from anon, authenticated;

drop policy if exists "commissions : les miennes" on public.commissions;
create policy "commissions : les miennes" on public.commissions
  for select to authenticated using (referrer_id = auth.uid());
revoke insert, update, delete on public.commissions from anon, authenticated;

drop policy if exists "récap : le mien" on public.digests;
create policy "récap : le mien" on public.digests
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.digests from anon, authenticated;

drop policy if exists "discord : mes codes" on public.discord_link_codes;
create policy "discord : mes codes" on public.discord_link_codes
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.discord_link_codes from anon, authenticated;

-- Serveur uniquement
revoke all on public.coach_applications, public.billing_events, public.cron_runs from anon, authenticated;

-- ---------------------------------------------------------------------
-- Statut d'éligibilité calculé depuis la tranche d'abonnés
-- ---------------------------------------------------------------------
create or replace function public.sync_eligibility()
returns trigger
language plpgsql
as $$
begin
  if new.follower_range in ('1500-5000', '5000-20000', '20000+') then
    new.eligibility := 'affilie';
  else
    new.eligibility := 'preparation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_eligibility on public.profiles;
create trigger profiles_sync_eligibility
  before insert or update of follower_range on public.profiles
  for each row execute function public.sync_eligibility();

-- ---------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, referral_code)
  values (new.id, coalesce(new.email, ''), public.generate_referral_code())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Compteur d'usage atomique : renvoie le nouveau total, ou -1 si la limite
-- est atteinte. p_limit < 0 = illimité. Appelé par le serveur uniquement.
-- ---------------------------------------------------------------------
create or replace function public.increment_usage(p_user uuid, p_day date, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.usage (user_id, day, scripts_generated)
  values (p_user, p_day, 0)
  on conflict (user_id, day) do nothing;

  update public.usage
     set scripts_generated = scripts_generated + 1
   where user_id = p_user
     and day = p_day
     and (p_limit < 0 or scripts_generated < p_limit)
  returning scripts_generated into new_count;

  return coalesce(new_count, -1);
end;
$$;

revoke all on function public.increment_usage(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.increment_usage(uuid, date, integer) to service_role;

-- ---------------------------------------------------------------------
-- Vue formateur : données agrégées des élèves, jamais l'e-mail sans consentement
-- ---------------------------------------------------------------------
create or replace function public.coach_student_stats(p_coach_id uuid)
returns table (
  student_id uuid,
  first_name text,
  plan public.plan_id,
  eligibility public.eligibility,
  scripts_generated bigint,
  products_followed bigint,
  last_seen_at timestamptz,
  joined_at timestamptz,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.first_name,
    p.plan,
    p.eligibility,
    (select count(*) from public.scripts s where s.user_id = p.id),
    (select count(*) from public.saved_products sp where sp.user_id = p.id),
    p.last_seen_at,
    p.created_at,
    case when p.share_email_with_coach then p.email else null end
  from public.profiles p
  where p.coach_id = p_coach_id
  order by p.created_at desc;
$$;

revoke all on function public.coach_student_stats(uuid) from public, anon, authenticated;
grant execute on function public.coach_student_stats(uuid) to service_role;

-- Variante appelable par un formateur connecté : il ne peut viser que ses élèves.
create or replace function public.coach_students()
returns table (
  student_id uuid,
  first_name text,
  plan public.plan_id,
  eligibility public.eligibility,
  scripts_generated bigint,
  products_followed bigint,
  last_seen_at timestamptz,
  joined_at timestamptz,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.coaches c
  cross join lateral public.coach_student_stats(c.id) s
  where c.user_id = auth.uid();
$$;

revoke all on function public.coach_students() from public, anon;
grant execute on function public.coach_students() to authenticated;

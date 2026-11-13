-- Nouvel onboarding (refonte de l'appli, 13 novembre 2026) : une question par écran.
-- Nouvelles réponses du profil, nouvelles tranches d'abonnés, règle d'éligibilité qui tient compte de la réponse
-- « déjà affilié ? ». Les comptes existants gardent leurs données ; onboarding_version = 1 leur fait voir les nouvelles
-- questions une fois. Rejouable sans erreur.

alter table public.profiles
  add column if not exists affiliate_status text,
  add column if not exists experience_level text,
  add column if not exists videos_per_week text,
  add column if not exists video_styles text[] not null default '{}',
  add column if not exists onboarding_version smallint not null default 1;

do $$
begin
  alter table public.profiles drop constraint if exists profiles_affiliate_status_check;
  alter table public.profiles add constraint profiles_affiliate_status_check
    check (affiliate_status is null or affiliate_status in ('oui', 'pas_encore', 'ne_sait_pas'));
  alter table public.profiles drop constraint if exists profiles_experience_level_check;
  alter table public.profiles add constraint profiles_experience_level_check
    check (experience_level is null or experience_level in ('debute', 'quelques_ventes', 'regulier'));
  alter table public.profiles drop constraint if exists profiles_videos_per_week_check;
  alter table public.profiles add constraint profiles_videos_per_week_check
    check (videos_per_week is null or videos_per_week in ('1-3', '4-7', '7+'));
  alter table public.profiles drop constraint if exists profiles_video_styles_check;
  alter table public.profiles add constraint profiles_video_styles_check
    check (cardinality(video_styles) <= 4 and video_styles <@ array['face_camera', 'voix_off', 'mains', 'avant_apres']::text[]);
  -- Tranches : les 5 nouvelles, plus les anciennes (comptes existants, jusqu'à leur nouvelle réponse).
  alter table public.profiles drop constraint if exists profiles_follower_range_check;
  alter table public.profiles add constraint profiles_follower_range_check
    check (follower_range is null or follower_range in (
      '0-1000', '1000-5000', '5000-20000', '20000-100000', '100000+',
      '0-500', '500-1500', '1500-5000', '20000+'
    ));
end
$$;

-- Le style unique d'avant devient le premier des styles.
update public.profiles
   set video_styles = array[video_style]
 where video_style in ('face_camera', 'voix_off', 'mains', 'avant_apres') and cardinality(video_styles) = 0;

-- Éligibilité : « pas encore » affilié ⇒ préparation ; sous 1 500 abonnés ⇒ préparation ; 1 000–5 000 : affilié
-- seulement si la personne dit l'être déjà (la tranche chevauche le seuil).
create or replace function public.sync_eligibility()
returns trigger
language plpgsql
as $$
begin
  if new.affiliate_status = 'pas_encore' then
    new.eligibility := 'preparation';
  elsif new.follower_range in ('1500-5000', '5000-20000', '20000+', '20000-100000', '100000+') then
    new.eligibility := 'affilie';
  elsif new.follower_range = '1000-5000' and new.affiliate_status = 'oui' then
    new.eligibility := 'affilie';
  else
    new.eligibility := 'preparation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_eligibility on public.profiles;
create trigger profiles_sync_eligibility
  before insert or update of follower_range, affiliate_status on public.profiles
  for each row execute function public.sync_eligibility();

grant update (affiliate_status, experience_level, videos_per_week, video_styles) on public.profiles to authenticated;

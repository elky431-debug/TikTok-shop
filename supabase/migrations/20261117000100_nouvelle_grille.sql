-- Nouvelle grille de prix (13 novembre 2026) : tout est payant, plus de plan gratuit ni d'essai.
--   free    → aucun   (compte sans abonnement : il choisit un abonnement avant d'entrer dans l'appli)
--   proplus → elite
--   + starter (avant pro)
-- Renommer une valeur d'enum met à jour toutes les lignes et la valeur par défaut de profiles.plan.
-- Rejouable sans erreur : chaque étape vérifie l'état de l'enum.

do $$
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'plan_id' and e.enumlabel = 'free') then
    alter type public.plan_id rename value 'free' to 'aucun';
  end if;
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
             where t.typname = 'plan_id' and e.enumlabel = 'proplus') then
    alter type public.plan_id rename value 'proplus' to 'elite';
  end if;
end
$$;

alter type public.plan_id add value if not exists 'starter' before 'pro';

-- Consentement au démarrage immédiat (délai de rétractation de 14 jours) : enregistré par le serveur au moment du
-- paiement, lisible par son propriétaire, jamais modifiable ni supprimable depuis le navigateur (preuve).
create or replace function public.is_server_record_kind(k text)
returns boolean
language sql
immutable
as $$
  select k = any (array['versement', 'code_formateur', 'rattachement_formateur', 'commande_discord', 'annonce_formateur',
                        'consentement_paiement']);
$$;

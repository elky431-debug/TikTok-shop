-- Session 5 · bloc 4 (studio) : la table scripts accepte les 8 formats (comparaison, routine et top 3 en plus).
-- Rejouable : la contrainte est retirée puis recréée.

alter table public.scripts drop constraint if exists scripts_format_check;
alter table public.scripts
  add constraint scripts_format_check
  check (format in ('demo', 'avant_apres', 'histoire', 'reponse_commentaire', 'unboxing', 'comparaison', 'routine', 'top3'));

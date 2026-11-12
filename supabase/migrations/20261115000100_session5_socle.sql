-- Session 5 · socle : la table générique des fiches accepte de nouveaux types (alertes, réglages, séries, annonces…),
-- toujours sous RLS « chacun les siennes ». Un type = un mot en minuscules.

alter table public.user_records drop constraint if exists user_records_kind_check;
alter table public.user_records add constraint user_records_kind_check check (kind ~ '^[a-z_]{2,40}$');

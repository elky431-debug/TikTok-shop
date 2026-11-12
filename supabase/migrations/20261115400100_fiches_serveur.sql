-- Session 5 · blocs 10, 12, 13 : certaines fiches de `user_records` sont écrites par le serveur seul (clé service,
-- qui ignore la RLS). Leur propriétaire peut les lire, mais ni les créer, ni les modifier, ni les supprimer depuis le
-- navigateur, sinon il pourrait effacer un versement déjà fait, remettre à zéro un quota ou s'attribuer un code :
--   versement              : virement de commissions marqué par l'admin (historique des versements) ;
--   code_formateur         : code promo supplémentaire d'un formateur (créé depuis son espace, vérifié par le serveur) ;
--   rattachement_formateur : code utilisé par un élève à l'inscription ;
--   commande_discord       : commandes /score et /script (quota quotidien du plan) ;
--   annonce_formateur      : annonces publiées par un formateur (limite quotidienne).
-- Rejouable : la fonction est remplacée, les règles supprimées puis recréées.

create or replace function public.is_server_record_kind(k text)
returns boolean
language sql
immutable
as $$
  select k = any (array['versement', 'code_formateur', 'rattachement_formateur', 'commande_discord', 'annonce_formateur']);
$$;

drop policy if exists user_records_insert_own on public.user_records;
create policy user_records_insert_own on public.user_records for insert
  with check (auth.uid() = user_id and not public.is_server_record_kind(kind));

drop policy if exists user_records_update_own on public.user_records;
create policy user_records_update_own on public.user_records for update
  using (auth.uid() = user_id and not public.is_server_record_kind(kind))
  with check (auth.uid() = user_id and not public.is_server_record_kind(kind));

drop policy if exists user_records_delete_own on public.user_records;
create policy user_records_delete_own on public.user_records for delete
  using (auth.uid() = user_id and not public.is_server_record_kind(kind));

-- Recherche d'un code promo supplémentaire par sa valeur (inscription avec un code) sans parcourir toutes les fiches.
create index if not exists user_records_code_formateur_idx on public.user_records ((data ->> 'code')) where kind = 'code_formateur';

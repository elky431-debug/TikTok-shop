-- Vérifications RLS : deux utilisateurs, un formateur, un élève.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.fr'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.fr'),
  ('00000000-0000-0000-0000-00000000000c', 'coach@test.fr');

-- Le déclencheur a créé les profils
do $$ begin
  if (select count(*) from public.profiles) <> 3 then raise exception 'profils non créés'; end if;
end $$;

insert into public.coaches (id, user_id, training_name, promo_code)
values ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-00000000000c', 'Formation Test', 'TEST30');
update public.profiles set coach_id = '00000000-0000-0000-0000-0000000000cc', first_name = 'Alice', follower_range = '1500-5000'
where id = '00000000-0000-0000-0000-00000000000a';

do $$ begin
  if (select eligibility from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'affilie' then
    raise exception 'éligibilité non synchronisée';
  end if;
end $$;

insert into public.products (id, name, niche, price_cents, commission_rate) values ('p1', 'Produit', 'beaute', 1990, 0.2);
insert into public.scripts (user_id, product_id, format) values ('00000000-0000-0000-0000-00000000000a', 'p1', 'demo');
insert into public.scripts (user_id, product_id, format) values ('00000000-0000-0000-0000-00000000000b', 'p1', 'demo');

-- Usage atomique
do $$ begin
  if public.increment_usage('00000000-0000-0000-0000-00000000000a', current_date, 2) <> 1 then raise exception 'usage 1'; end if;
  if public.increment_usage('00000000-0000-0000-0000-00000000000a', current_date, 2) <> 2 then raise exception 'usage 2'; end if;
  if public.increment_usage('00000000-0000-0000-0000-00000000000a', current_date, 2) <> -1 then raise exception 'limite non appliquée'; end if;
  if public.increment_usage('00000000-0000-0000-0000-00000000000a', current_date, -1) <> 3 then raise exception 'illimité'; end if;
end $$;

-- En tant qu'Alice
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true) \g /dev/null

do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Alice voit d''autres profils'; end if;
  if (select count(*) from public.scripts) <> 1 then raise exception 'Alice voit les scripts des autres'; end if;
  if (select count(*) from public.coach_students()) <> 0 then raise exception 'Alice n''est pas formatrice'; end if;
end $$;

-- Alice ne peut pas lire le catalogue directement
do $$ begin
  perform 1 from public.products;
  raise exception 'catalogue lisible par un client';
exception when insufficient_privilege then null;
end $$;

-- Alice ne peut pas changer son plan
do $$ begin
  update public.profiles set plan = 'proplus' where id = auth.uid();
  raise exception 'plan modifiable par le client';
exception when insufficient_privilege then null;
end $$;

-- Alice peut changer son prénom
update public.profiles set first_name = 'Alice B.' where id = auth.uid();

-- Le cache du fournisseur de données reste côté serveur
do $$ begin
  perform 1 from public.provider_cache limit 1;
  raise exception 'provider_cache lisible par un client';
exception when insufficient_privilege then null;
end $$;

-- Alice ne peut pas s'offrir des scripts
do $$ begin
  perform public.increment_usage(auth.uid(), current_date, -1);
  raise exception 'increment_usage appelable par un client';
exception when insufficient_privilege then null;
end $$;

-- En tant que formateur
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true) \g /dev/null
do $$
declare r record;
begin
  if (select count(*) from public.coach_students()) <> 1 then raise exception 'le formateur doit voir 1 élève'; end if;
  select * into r from public.coach_students() limit 1;
  if r.email is not null then raise exception 'e-mail visible sans consentement'; end if;
  if r.scripts_generated <> 1 then raise exception 'mauvais compte de scripts'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'le formateur voit des profils bruts'; end if;
end $$;

reset role;
update public.profiles set share_email_with_coach = true where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true) \g /dev/null
do $$ begin
  if (select email from public.coach_students() limit 1) <> 'alice@test.fr' then raise exception 'consentement ignoré'; end if;
end $$;

reset role;
rollback;
\echo 'RLS : toutes les vérifications passent.'

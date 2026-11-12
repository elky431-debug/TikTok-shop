-- Session 4 · fiche produit complète.
--  - Ventes par période (1, 7, 15, 30, 60, 90 jours), note et avis, lus chez Nexscope (tiktok-batch-product-detail)
--    tant que nos relevés quotidiens sont trop courts ;
--  - date du dernier chargement des vidéos (cache de 3 jours) ;
--  - plus d'échantillon gratuit : aucune source ne fournit cette donnée.

alter table public.products add column if not exists details jsonb;
alter table public.products add column if not exists videos_fetched_at timestamptz;
alter table public.products drop column if exists free_sample;

comment on column public.products.details is
  'Données complémentaires de la source (ventes par période, note, avis, premier relevé), null si inconnues.';
comment on column public.products.videos_fetched_at is
  'Dernier chargement des vidéos chez la source : rien n''est redemandé pendant 3 jours.';

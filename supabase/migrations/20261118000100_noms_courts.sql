-- Noms courts des produits et niche vérifiée par l'IA (14 novembre 2026). Les titres TikTok sont interminables : un nom
-- court de 3 à 6 mots est généré une seule fois par produit et gardé ici ; la niche, déduite de la catégorie demandée
-- à la source, est vérifiée en même temps (un calendrier de l'Avent n'est pas de la tech). Le relevé de nuit garde ces
-- deux valeurs quand il remet le produit à jour. Rejouable sans erreur.

alter table public.products
  add column if not exists short_name text,
  add column if not exists niche_checked boolean not null default false;

do $$
begin
  alter table public.products drop constraint if exists products_short_name_check;
  alter table public.products add constraint products_short_name_check
    check (short_name is null or char_length(short_name) between 2 and 60);
end
$$;

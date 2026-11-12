# CLAUDE.md — Pépite (nom de travail)

Référence de travail pour tout le projet. À relire avant chaque jalon.

## Le produit

Outil **en français** qui dit chaque matin aux affiliés TikTok Shop quels produits vont exploser,
leur écrit les scripts vidéo pour les vendre, et que les formateurs TikTok Shop français proposent à
leurs élèves (commission de 30 % récurrente, 3 mois de Pro offerts aux élèves).

- Le nom « Pépite » vit dans **une seule constante** : `lib/brand.ts`.
- Marché : TikTok Shop France ≈ 133 M€ / trimestre (T2 2026), ≈ 70 % via les affiliés, beauté n°1.
- Un affilié gagne au volume : à partir de 20 vidéos sur un produit, chaque vidéo rapporte en
  moyenne 10× plus. Le produit pousse à produire beaucoup, sur les bons produits (objectif 20 vidéos).
- Il faut ~1 500 abonnés pour être affilié : statut `preparation` sous ce seuil, `affilie` au-dessus.

## Règles absolues

1. **Jamais de scraping TikTok**, jamais de connexion au compte TikTok par mot de passe, jamais de
   publication automatique. Seulement API officielles ou fournisseur payant, derrière
   `ProductDataProvider` (`lib/data/provider.ts`).
2. **Aucune promesse de gains**, pas de faux témoignages, pas de faux chiffres d'utilisateurs. Chiffres
   de marché réels et sourcés, ou absents.
3. **Tout en français, au tutoiement**, ton direct. Mots français (« échantillon », pas « sample »).
4. RGPD : mentions légales, CGV, confidentialité avec `[À COMPLÉTER]`. Pas d'analytique ⇒ pas de
   bannière cookies (seuls cookies techniques de session).
5. Limites de plan **toujours appliquées côté serveur** (`lib/plans.ts`).

## Stack

- Next.js 14 App Router, TypeScript strict, Server Actions. Déploiement Vercel.
- Supabase (Postgres, Auth lien magique + Google, RLS partout). Migrations : `supabase/migrations/`.
- **Mode local sans clés** : si `NEXT_PUBLIC_SUPABASE_URL` est vide, la base est un fichier JSON
  (`.data/local-db.json`) et l'auth est un lien magique simulé (affiché à l'écran). Voir `lib/env.ts`.
- Accès aux données uniquement via `lib/db` (`getRepo()`), qui choisit Supabase ou local.
- Tailwind + composants maison (`components/ui`). Recharts pour les graphiques détaillés,
  sparklines en SVG maison.
- Stripe isolé dans `lib/billing/` (interface `BillingProvider`). Sans clé : paiement désactivé avec
  message clair ; en mode local uniquement, paiement **simulé** qui passe par le même code de webhook.
- Claude : `lib/ai/scripts.ts`, SDK `@anthropic-ai/sdk`, modèle `ANTHROPIC_MODEL`
  (défaut `claude-sonnet-5-5`), sortie JSON validée par Zod, 1 nouvel essai si invalide. Sans clé :
  générateur simulé déterministe.
- E-mails : Resend + React Email (`emails/`). Sans clé : journalisés en console + boîte locale.
- Bot Discord : `bot/` (package séparé, discord.js), parle à l'appli via `/api/bot/*` + `BOT_API_SECRET`.
- Tests : Vitest (`tests/unit`), Playwright (`tests/e2e`, 3 parcours).

## Schéma (résumé)

`profiles`, `products`, `product_snapshots`, `scripts`, `saved_products`, `subscriptions`, `usage`,
`coaches`, `referrals`, `commissions`, `digests`, `coach_applications`, `discord_link_codes`,
`billing_events`, `cron_runs`. Catalogue (`products`, `product_snapshots`) lisible seulement côté
serveur (service role) pour que les limites de plan ne soient pas contournables. Un formateur ne voit
ses élèves qu'à travers la fonction `coach_students()` (données agrégées, jamais l'e-mail sans
consentement).

## Score d'opportunité (`lib/score.ts`)

35 % croissance 7 j (percentile dans la niche) · 25 % commission · 20 % faible saturation ·
10 % prix dans 15–60 € · 10 % échantillon gratuit. Toujours expliqué en phrases.

## Plans (`lib/plans.ts`)

| Plan | Prix | Limites |
| --- | --- | --- |
| free | 0 € | 3 produits du jour, score masqué, 3 scripts/jour, pas de récap Discord |
| pro | 19,90 €/mois · 167 €/an | radar complet, 30 scripts/jour, récap Discord + e-mail |
| proplus | 39,90 €/mois · 335 €/an | illimité, export, priorité nouveautés |

## Design

- Tokens CSS sur `:root` (clair) et sombre via `prefers-color-scheme` ou `data-theme`.
- Encre `#161823`, papier `#FFFFFF`, rose `#FE2C55` (actions), cyan `#25F4EE` (données ;
  texte en variante foncée sur clair), gris `#F1F1F2` / `#8A8B91`, vert gains lisible sur les deux fonds.
- Police : TikTok Sans (auto-hébergée via fontsource). Chiffres tabulaires pour les données.
- Signature : **seul** le score (et le logo) a le décalage cyan/rose.
- Interdits : cartes toutes identiques, étiquettes en capitales espacées, flèches sur chaque bouton,
  dégradés décoratifs, animations d'entrée partout (une seule orchestrée sur l'accueil).
- Mobile d'abord, barre du bas dans `/app`, focus visible, `prefers-reduced-motion`, états vides
  utiles, erreurs précises, squelettes. Boutons = verbe exact, réutilisé dans la confirmation.

## Façon de travailler

- Jalons : 1 fondations · 2 données · 3 radar · 4 studio · 5 paiement · 6 mes produits/récap/
  parrainage · 7 formateur/admin · 8 site public · 9 finitions.
- Fin de jalon : `npm run build` + `npm run lint` (+ `npm test`) passent, puis commit.
- Décisions techniques/design ⇒ `DECISIONS.md`. Choix business supposés ⇒ `RAPPORT.md`.
- Clé manquante ⇒ on continue avec le mock.

## Commandes

```bash
npm run dev        # appli en local (mode local sans clés)
npm run seed       # 30 jours d'historique fictif
npm run build && npm run lint && npm test
npm run test:e2e   # Playwright
npm run check:sql  # applique les migrations sur un Postgres jetable (si dispo)
```

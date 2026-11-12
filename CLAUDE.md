# CLAUDE.md — TikTrend (nom de travail)

Référence de travail pour tout le projet. À relire avant chaque jalon.

## Le produit

Outil **en français** qui dit chaque matin aux affiliés TikTok Shop quels produits vont exploser,
leur écrit les scripts vidéo pour les vendre, et que les formateurs TikTok Shop français proposent à
leurs élèves (commission de 30 % récurrente, 3 mois de Pro offerts aux élèves).

- Le nom « TikTrend » vit dans **une seule constante** : `lib/brand.ts`.
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

- Next.js 14 App Router, TypeScript strict, Server Actions. Déploiement Netlify.
- Supabase (Postgres, Auth lien magique + Google, RLS partout). Migrations : `supabase/migrations/`.
- **Mode local sans clés** : si `NEXT_PUBLIC_SUPABASE_URL` est vide, la base est un fichier JSON
  (`.data/local-db.json`) et l'auth est un lien magique simulé (affiché à l'écran). Voir `lib/env.ts`.
- **Données produits** (`lib/data/`) : `DATA_PROVIDER=auto` → API officielle TikTok Shop (pas encore ouverte
  dans l'UE), sinon Nexscope, sinon fictif. Client commun `lib/data/http.ts` (débit, reprises, quota, cache).
  Champ inconnu = `null`, jamais inventé. Ce que voient les utilisateurs passe par `lib/catalog.ts` : jamais de
  fictif présenté comme réel, « Données du [date] » au-delà de 36 h.
- Accès aux données uniquement via `lib/db` (`getRepo()`), qui choisit Supabase ou local.
- Tailwind + composants maison (`components/ui`), Motion (`motion/react`) pour les animations.
  Recharts pour les graphiques détaillés, sparklines en SVG maison.
- Stripe isolé dans `lib/billing/` (interface `BillingProvider`). Sans clé : paiement désactivé avec
  message clair ; en mode local uniquement, paiement **simulé** qui passe par le même code de webhook.
- IA des scripts : `lib/ai/scripts.ts` (commun : validation Zod, 1 nouvel essai si invalide, interdits de
  `lib/ai/guard.ts`) + un adaptateur par fournisseur dans `lib/ai/providers/` : `AI_PROVIDER=openai` (SDK `openai`,
  Responses API, `OPENAI_MODEL`, défaut `gpt-6-luna`, le moins cher avec sorties structurées) ou `anthropic` (SDK `@anthropic-ai/sdk`, `ANTHROPIC_MODEL`,
  défaut `claude-sonnet-5-5`). Sans clé : générateur simulé déterministe. `npm run ai:sample` = 3 scripts de test.
- E-mails : Resend + React Email (`emails/`). Sans clé : journalisés en console + boîte locale. Lien de connexion
  par Supabase via le SMTP de Resend ; lien affiché à l'écran en local seulement (`isLocalLoginAllowed`). Récap :
  désinscription en un clic (`lib/unsubscribe.ts`, RFC 8058), clé d'idempotence par personne et par jour.
- Discord sans serveur à héberger (`lib/discord/`) : interactions HTTP signées (Ed25519) sur `/api/discord/interactions`
  pour `/lier` et `/delier`, API REST depuis la fonction Netlify horaire `discord-hourly` (récaps privés à l'heure de
  chacun, salons du jour, rôle Pro). `npm run discord:setup` enregistre les commandes et l'adresse des interactions.
- Tests : Vitest (`tests/unit`), Playwright (`tests/e2e`, 3 parcours), intégration Supabase (`tests/integration`).
- Déploiement : Netlify (`netlify.toml`, fonction planifiée `netlify/functions/nightly-refresh.mts` à 3 h UTC qui
  appelle `/api/cron/refresh`, travail dans `nightly-refresh-background`), `/api/health`, liste de vérification
  dans le README.

## Schéma (résumé)

`profiles`, `products`, `product_snapshots`, `scripts`, `saved_products`, `subscriptions`, `usage`,
`coaches`, `referrals`, `commissions`, `digests`, `coach_applications`, `discord_link_codes`,
`billing_events`, `cron_runs`, `provider_cache`, `daily_tasks`. Catalogue (`products`, `product_snapshots`) lisible seulement côté
serveur (service role) pour que les limites de plan ne soient pas contournables. Un formateur ne voit
ses élèves qu'à travers la fonction `coach_students()` (données agrégées, jamais l'e-mail sans
consentement).

## Score d'opportunité (`lib/score.ts`)

35 % croissance 7 j (percentile dans la niche) · 25 % commission · 20 % faible saturation ·
10 % prix dans 15–60 € · 10 % échantillon gratuit. Toujours expliqué en phrases. Critère non fourni par la
source : ignoré, poids réparti au prorata. Score affiché = points étalés chaque jour entre 15 et 90.
Tendances : explose ≥ +40 % (et ≥ 5 ventes/j), monte ≥ +10 %, baisse ≤ −20 %.

## Plans (`lib/plans.ts`)

| Plan | Prix | Limites |
| --- | --- | --- |
| free | 0 € | 3 produits du jour, score masqué, 3 scripts/jour, pas de récap Discord |
| pro | 19,90 €/mois · 167 €/an | radar complet, 30 scripts/jour, récap Discord + e-mail |
| proplus | 39,90 €/mois · 335 €/an | illimité, export, priorité nouveautés |

## Design (refonte : style EtSmart, couleurs TikTok)

Référence : le design d'EtSmart (etsmart.app, même fondateur), reproduit fidèlement — structure,
espacements, typographie, effets — avec les couleurs TikTok et le contenu de TikTrend. Quand une mesure
du brief diverge du code EtSmart, la mesure d'EtSmart l'emporte (voir `DECISIONS.md`, refonte).

- **Thème** : noir par défaut partout (site et appli). Le clair n'existe qu'en option dans le compte
  (`data-theme="light"`), jamais selon le système.
- **Tokens** (`app/globals.css`) : `--bg-page` #000, `--bg-elevated` #0A0A0B (cartes), `--bg-subtle`
  #111114 (champs, pastilles), `--border` blanc 8 %, `--border-strong` blanc 14 %, `--text` #FFF,
  `--text-muted` #8A8B91, `--text-faint` #7E7F85, `--cyan-hex` #25F4EE, `--pink-hex` #FE2C55,
  `--gradient` cyan → rose, `--glow-cyan`, `--glow-pink`. Boutons roses : fond `#E3174D` (AA avec
  texte blanc). Classes Tailwind : `bg-bg`, `bg-raised`, `bg-surface`, `border-line`, `text-muted`,
  `text-subtle`, `rose-*`, `cyan-*`, `gain-*`, `warn-*`.
- **Correspondance EtSmart** : son dégradé bleu-cyan → turquoise devient `--gradient` (cyan → rose) ;
  son cyan seul (étiquettes, icônes, liens) devient `--cyan-hex` ; le bouton principal est rose.
- **Police** : Sora (celle d'EtSmart), auto-hébergée (`app/fonts`). Chiffres tabulaires partout.
- **Typo** : grand titre de l'accueil en gras serré (`tracking-tight`), centré, partie finale en
  italique et en dégradé (`.text-gradient-live`) ; titres de section sur deux lignes, la seconde en
  dégradé ; étiquettes en majuscules espacées (`.eyebrow`, `.eyebrow-category`) — voulues.
- **Composants** : en-tête fixe noir flouté, logo à halo + nom en deux tons (« Tik » blanc, « Trend »
  en dégradé) ; bouton principal rose arrondi 12 px avec flèche → (monte de 2 px, halo rose, flèche
  qui glisse au survol) ; bouton secondaire bordé ; pastille d'annonce avec point cyan qui pulse ;
  bandeau de chiffres en dégradé (faits vrais uniquement) ; cartes `.feature-card` (bordure dégradée au
  survol) avec `.icon-chip`.
- **Héros** : constellation animée sur canvas (lignes, points, losanges, cercles, « + », halos cyan et
  rose), dérive lente, parallaxe à la souris, pause hors onglet, arrêt si `prefers-reduced-motion`.
- **Animations** (Motion, `motion/react`) : chargement du héros en séquence, dégradé vivant, comptage
  des chiffres, apparitions au défilement (une fois), aperçu du radar qui fait défiler les produits.
  Toujours une version sans mouvement si `prefers-reduced-motion`.
- **Signature** : le décalage cyan / rose façon logo TikTok reste réservé au logo et au score.
- **Appli** : mêmes tokens, pas de constellation, seulement un halo très léger en haut ; cartes du
  radar au style des cartes de fonctionnalités ; barre du bas noire floutée, icône active cyan ;
  courbes Recharts cyan avec remplissage dégradé.
- **Qualité** : mobile d'abord, focus visible, contraste AA vérifié à l'audit axe, états vides utiles,
  erreurs précises, squelettes. Boutons = verbe exact, réutilisé dans la confirmation.

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
npm run check:sql  # applique les migrations sur un Postgres jetable (si dispo), deux fois
npm run db:setup   # Supabase réel : migrations, types, seed (SUPABASE_ACCESS_TOKEN ou SUPABASE_DB_URL)
npm run auth:setup # Supabase réel : retours, modèle du lien magique, SMTP Resend, Google (API de gestion)
npm run test:integration  # tests contre les vrais services dont les clés sont là (rien sans clés)
npm run score:distribution  # distribution des scores sur la base actuelle
npm run ai:sample  # 3 scripts de test avec le vrai fournisseur d'IA (docs/exemples-scripts/)
npm run stripe:setup  # produits, prix, portail client (et webhook avec -- --webhook)
npm run discord:setup # commandes /lier /delier et adresse des interactions Discord
npm run screenshots   # captures (voir scripts/screenshots.mjs)
```

## Où trouver quoi

- Décisions : `DECISIONS.md` · État et suite : `RAPPORT.md` · Installation : `README.md`
- Comptes de démo en local (après `npm run seed`) : `admin@tiktrend.local`, `formateur@tiktrend.local` (code DEMO30)
- E-mails : `emails/*.tsx` (pragma `@jsxRuntime automatic` en tête, nécessaire pour tsx et Vitest)
- Code de référence du design : dépôt `elky431-debug/Etsmart` (`src/app/page.tsx`, `src/components/ui/Logo.tsx`)
- Vitest transforme le JSX via `oxc` (Vite 8) : voir `vitest.config.ts`

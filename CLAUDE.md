# CLAUDE.md — Tracktout (nom de travail)

Référence de travail pour tout le projet. À relire avant chaque jalon.

## Le produit

Outil **en français** qui dit chaque matin aux affiliés TikTok Shop quels produits vont exploser,
leur écrit les scripts vidéo pour les vendre, et que les formateurs TikTok Shop français proposent à
leurs élèves (commission de 30 % récurrente, −20 % sur le premier mois des élèves).

- Le nom « Tracktout » vit dans **une seule constante** : `lib/brand.ts`.
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
- Fiche produit : vidéos (`/et/listProductVideo`, 10 produits par nuit au plus, cache 3 jours, à la demande en Pro)
  et ventes par période (`/et/batchProductDetail`, tant qu'il y a moins de 7 jours de relevés). `npm run data:enrich`.
- Accès aux données uniquement via `lib/db` (`getRepo()`), qui choisit Supabase ou local.
- Tailwind + composants maison (`components/ui`), Motion (`motion/react`) pour les animations.
  Recharts pour les graphiques détaillés, sparklines en SVG maison.
- Stripe isolé dans `lib/billing/` (interface `BillingProvider`). Sans clé : paiement désactivé avec
  message clair ; en mode local uniquement, paiement **simulé** qui passe par le même code de webhook. Plan offert à la
  main par l'admin (`lib/billing/grant.ts`, abonnement `admin_…` sans facture ni commission).
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
10 % prix dans 15–60 €. Le critère « échantillon gratuit » est retiré partout (aucune source ne le fournit) : ses
10 points sont répartis au prorata, comme pour tout critère non fourni. Toujours expliqué en phrases. Score affiché = points étalés chaque jour entre 15 et 90.
Tendances : explose ≥ +40 % (et ≥ 5 ventes/j), monte ≥ +10 %, baisse ≤ −20 %.

## Plans (`lib/plans.ts`)

Tout est payant, sans plan gratuit ni essai (grille du 13 novembre, `DECISIONS.md` 188-194). Sans abonnement (`aucun`),
l'appli renvoie à `/abonnement` (`requireOnboardedViewer`, `{ abonnement: false }` pour compte et paiement). Pro est
« Recommandé ». « Illimité » = plafond de sécurité invisible côté serveur (`SAFETY_CAPS`, `isUnlimited`, jamais affiché).

| Plan | Prix | Contenu |
| --- | --- | --- |
| starter | 34,99 €/mois · 349,90 €/an | radar France complet, score expliqué, fiche produit, 10 scripts/jour en 5 formats, téléprompteur, 10 produits suivis, plan de publication, récap du matin, 3 alertes, 3 recherches/jour, mode préparation, parrainage |
| pro | 59,99 €/mois · 599,90 €/an | Starter + 40 scripts/jour en 8 formats, style personnel, série de 20 vidéos, score « pour toi », produits suivis illimités, gains et import CSV, 20 analyses de vidéo et 20 propositions de marques par mois, comparateur, 15 alertes, 15 recherches/jour, récap de la semaine |
| elite | 99,99 €/mois · 999,90 €/an | tout le Pro en illimité + Allemagne, Italie, Espagne, traduction des scripts, poids du score réglables, export CSV, 50 recherches/jour |

Code formateur : −20 % sur le premier mois d'un abonnement mensuel, une fois par compte (`lib/billing/coach-discount.ts`,
coupon Stripe `tracktout_formateur_20`). Au paiement, case obligatoire de démarrage immédiat (rétractation de 14 jours,
`lib/billing/consent.ts`), enregistrée côté serveur et confirmée par e-mail. Prix Stripe retrouvés par `lookup_key`.

## Design (refonte : style EtSmart, couleurs TikTok, fond blanc)

Référence : le design d'EtSmart (etsmart.app, même fondateur), reproduit fidèlement — structure,
espacements, typographie, effets — avec les couleurs TikTok (cyan et rose) **sur fond blanc** (choix du 13 novembre,
`DECISIONS.md` 184) et le contenu de Tracktout. Quand une mesure du brief diverge du code EtSmart, la mesure
d'EtSmart l'emporte (voir `DECISIONS.md`, refonte).

- **Thème** : blanc par défaut partout (site et appli). Le noir n'existe qu'en option dans le compte
  (`data-theme="dark"`, cookie `tracktout_theme=dark`), jamais selon le système.
- **Tokens** (`app/globals.css`, `:root` = blanc, `:root[data-theme='dark']` = noir) : fond #FFF, cartes #FFF bordées,
  `--bg-subtle` #F1F1F2, `--border` encre 12 %, texte #161823, `--text-muted` #5F6068. Cyan foncé #00777A et rose
  foncé #C8103F (AA sur blanc) pour les textes ; `--gradient` #00777A → #C8103F (texte blanc dessus, `on-gradient`) ;
  boutons roses #E0144A à texte blanc (`bg-rose-fill text-on-primary`). En noir : cyan #25F4EE, rose #FE2C55, boutons
  #E3174D. Courbes : couleur `--cyan-hex` lue par `useChartColors` (`components/charts/colors.ts`), jamais en dur.
  Classes Tailwind : `bg-bg`, `bg-raised`, `bg-surface`, `border-line`, `text-muted`, `text-subtle`, `rose-*`, `cyan-*`,
  `gain-*`, `warn-*`, `positive`, `on-primary`, `on-gradient`.
- **Correspondance EtSmart** : son dégradé bleu-cyan → turquoise devient `--gradient` (cyan → rose) ;
  son cyan seul (étiquettes, icônes, liens) devient `cyan-ink` ; le bouton principal est rose.
- **Police** : Sora (celle d'EtSmart), auto-hébergée (`app/fonts`). Chiffres tabulaires partout.
- **Typo** : grand titre de l'accueil en gras serré (`tracking-tight`), centré, partie finale en
  italique et en dégradé (`.text-gradient-live`) ; titres de section sur deux lignes, la seconde en
  dégradé ; étiquettes en majuscules espacées (`.eyebrow`, `.eyebrow-category`) — voulues.
- **Composants** : en-tête fixe flouté, logo à halo + nom en deux tons (« Track » blanc, « tout »
  en dégradé) ; bouton principal rose arrondi 12 px avec flèche → (monte de 2 px, halo rose, flèche
  qui glisse au survol) ; bouton secondaire bordé ; pastille d'annonce avec point cyan qui pulse ;
  bandeau de chiffres en dégradé (faits vrais uniquement) ; cartes `.feature-card` (bordure dégradée au
  survol) avec `.icon-chip`.
- **Héros** : titre « Automatise ton business TikTok Shop de A à Z. » (« de A à Z. » en italique et en dégradé
  vivant) ; constellation animée sur canvas (traits à la couleur d'encre du thème, halos cyan et rose), dérive lente, parallaxe à la souris, pause hors onglet, arrêt si `prefers-reduced-motion`.
- **Animations** (Motion, `motion/react`) : chargement du héros en séquence, dégradé vivant, comptage
  des chiffres, apparitions au défilement (une fois), défilé de captures sous le titre (`components/public/screenshot-marquee.tsx`,
  images de `npm run screenshots:landing`).
  Toujours une version sans mouvement si `prefers-reduced-motion`.
- **Signature** : le décalage cyan / rose façon logo TikTok reste réservé au logo et au score.
- **Appli** (refonte du 13 novembre, `DECISIONS.md` 164-176) : coque copiée d'EtSmart
  (`components/app/shell.tsx` : barre latérale 64 → 256 px en sections Accueil / Trouver / Créer / Suivre / Compte,
  en-tête et barre du bas sur téléphone), conteneur `max-w-7xl`, `PageHeader` à étiquette de section, cartes
  bordées, onglets à trait dégradé. **Dashboard sur `/app`** (`lib/dashboard.ts`, chiffres saisis ou mesurés
  uniquement), **radar sur `/app/radar`**. Onboarding : 10 questions, une par écran (`app/bienvenue`,
  `lib/onboarding-steps.ts`) ; `onboarding_version` < 2 ⇒ nouvelles questions une fois. Courbes Recharts cyan avec
  remplissage dégradé. `MotionConfig reducedMotion="user"` dans la coque.
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
npm run screenshots:landing  # captures du défilé de l'accueil (public/landing/, compte de démo local)
```

## Où trouver quoi

- Décisions : `DECISIONS.md` · État et suite : `RAPPORT.md` · Installation : `README.md`
- Comptes de démo en local (après `npm run seed`) : `admin@tracktout.local`, `formateur@tracktout.local` (code DEMO30)
- E-mails : `emails/*.tsx` (pragma `@jsxRuntime automatic` en tête, nécessaire pour tsx et Vitest)
- Code de référence du design : dépôt `elky431-debug/Etsmart` (`src/app/page.tsx`, `src/components/ui/Logo.tsx`)
- Vitest transforme le JSX via `oxc` (Vite 8) : voir `vitest.config.ts`

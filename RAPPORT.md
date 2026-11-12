# Rapport — Pépite

Date : 12 novembre 2026. Branche : `claude/kind-galileo-ardtih` (V1 en 9 jalons, refonte du design en 6 étapes,
session 3 « brancher au réel » en 5 étapes). La section « Session 3 » ci-dessous est la plus récente.

## En bref

La V1 est complète et **utilisable de bout en bout en local, sans aucune clé** : inscription par lien magique,
onboarding en 4 écrans, radar quotidien avec score expliqué, fiche produit, studio de scripts, « mes produits »,
récap du matin (e-mail + bot Discord), paiement (simulé en local, Stripe dès que les clés sont là), parrainage,
espace formateur, administration, site public et pages légales.

Vérifications au moment du rapport :

| Vérification | Résultat |
| --- | --- |
| `npm run build` | ✅ passe |
| `npm run lint` (ESLint + TypeScript strict) | ✅ 0 erreur, 0 avertissement |
| `npm test` (Vitest) | ✅ 60 tests (score, limites de plan, webhooks Stripe, studio, Claude simulé, récap, bot, formateur) |
| `npm run test:e2e` (Playwright) | ✅ 3 parcours (4 tests) : inscription (+ lien formateur), génération de scripts, paiement |
| `npm run check:sql` | ✅ migrations appliquées sur un vrai Postgres 16 + tests RLS |
| Audit d’accessibilité automatique (axe, WCAG 2.1 AA) | ✅ 0 violation sur 19 pages (dont onboarding, formateur, admin), en clair et en sombre |
| Bot Discord (`bot/`) | ✅ compile (TypeScript strict) ; non testé contre Discord (pas de jeton) |

Captures d’écran (mobile et desktop, clair et sombre) : `docs/captures/`.

---

## Session 3 — Brancher Pépite au réel

Cinq commits (« Session 3 · étape 1 » à « étape 5 »), décisions 71 à 102 dans `DECISIONS.md`.

**À savoir d’abord : aucune clé n’était disponible dans cet environnement** (ni Supabase, ni TikTok, ni Nexscope,
ni Stripe, Resend ou Claude). Rien n’a donc tourné contre un service réel. Tout est écrit, testé autant que
possible sans clé, et prêt : poser les clés suffit, dans l’ordre de la liste de vérification du README.

### Mise à jour : premières vraies clés (même jour, décisions 103 à 114)

- **Nexscope : vrai relevé fait.** 12 appels (une page par niche, plus les vidéos de 2 produits), puis 62 vrais
  produits France sur les 7 niches, sans repli ni image refusée. Le radar les affiche, sans la mention « produits
  fictifs ». Six écarts entre la doc et la vraie réponse sont corrigés, et une vraie réponse sert de test.
  Détail : décisions 111 et 112.
- **OpenAI : 3 vraies générations** avec `gpt-5.5` (`npm run ai:sample`). Le français est naturel, au tutoiement,
  sans interdit. Deux défauts du premier passage sont corrigés dans la consigne (hashtags anglais, « le lien ») ;
  il reste une accroche au vouvoiement sur 30. Exemples complets dans `docs/exemples-scripts/`.
- **Supabase : en service pour de vrai** (décisions 117 à 121) :
  - les 4 migrations sont appliquées par l’API de gestion, en HTTPS : le port 5432 n’est pas joignable d’ici ;
  - les types TypeScript sont générés depuis la vraie base ;
  - **31 tests d’intégration et 3 parcours de connexion passent contre la vraie base**. Seul Google reste à tester
    (`E2E_GOOGLE=1`) ;
  - le seed a mis 62 vrais produits Nexscope dans Supabase, sans aucun produit fictif ;
  - un défaut est corrigé au passage : une boucle de redirections quand Supabase est injoignable.
- **Modèle OpenAI** : `gpt-6-luna` par défaut (environ 0,002 $ la génération), après comparaison avec `gpt-5.5`
  (décisions 115 et 116).
- **Ici seulement** : les images de Nexscope (`agent-files.linkfox.com`) ne passent pas le réseau de cet
  environnement, donc le visuel générique s’affiche à leur place. Sur Vercel, elles chargeront.
- **Tendances** : 56 % des produits sont « explose » sur ce premier relevé, orienté meilleures ventes avant Noël.
  À recalibrer après une à deux semaines de relevés (décision 113).

### Ce qui tourne sur du réel

- **Base de données** : les trois migrations passent sur un vrai Postgres 16, **deux fois de suite** (elles sont
  rejouables), avec les tests RLS en SQL (`npm run check:sql`), dont la nouvelle table `provider_cache`.
- **Signature de l’API TikTok Shop** : vérifiée sur l’exemple chiffré de la documentation officielle.
- **Chiffres de marché** : section « Le marché » sur l’accueil, trois chiffres avec lien et date (Lengow au
  9 juillet 2026, Digiday au 14 octobre 2026), contrôlés par recherche web (voir plus bas).
- **Déploiement** : `vercel.json` (tâche à 3 h UTC), `/api/health`, liste de vérification ; testés en local.

### Ce qui est prêt mais n’a pas encore tourné (faute de clé)

- **Supabase** : `npm run db:setup` (migrations, types, seed) et `npm run test:integration` : chaque méthode de
  `SupabaseRepo`, la RLS avec deux utilisateurs et un formateur, le lien magique, le lien réutilisé, la
  déconnexion, et le parcours de connexion complet dans le navigateur (Google avec `E2E_GOOGLE=1`). Deux défauts
  trouvés à la relecture sont corrigés (détail de score vide, ventes décimales).
- **Nexscope** (`tiktok-product-discovery`, France) : la source réaliste aujourd’hui. Nombre de créateurs,
  boutique, commission, ventes à 1, 7 et 28 jours ; vidéos des 10 meilleurs produits.
- **API officielle TikTok Shop** (recherche des produits ouverts à l’affiliation) : écrite selon la doc, mais
  **la doc dit que les API affiliés ne sont pas encore ouvertes dans l’UE** (décision 78). L’OAuth des
  créateurs et le suivi des commandes affiliées sont seulement préparés (interfaces).
- **Garde-fous** : file d’attente, reprises avec attente progressive, quota par nuit, cache en base ; repli
  automatique si la source échoue (écrit dans l’admin) ; images limitées aux domaines des fournisseurs avec repli
  sur le visuel SVG ; champs inconnus laissés vides et affichage adapté.
- **Score recalibré** : échelle du jour de 15 à 90, nouveaux seuils de tendance, critères manquants expliqués.
  Mesuré sur les données fictives et trois scénarios qui imitent les vraies sources, faute de vraies données.

### Ce qui reste simulé

Les produits (fictifs, toujours signalés « produits fictifs » dans le radar, la fiche, le récap, Discord et
l’aperçu de l’accueil), la base et la connexion (fichier local), les scripts, le paiement et les e-mails : comme
avant, chaque brique bascule seule dès que ses clés sont là.

### Ce qui manque, précisément

| Pour | Il faut | Où |
| --- | --- | --- |
| Supabase réel (étape 1) | ✅ clés reçues, migrations appliquées, tests d’intégration au vert | — |
| Connexion Google | activer Google dans Supabase, puis `E2E_GOOGLE=1 npm run test:integration` | Supabase → Authentication → Providers |
| Vrais produits (étape 2) | ✅ `NEXSCOPE_API_KEY` reçue, relevé réel fait | — |
| Scripts avec OpenAI | ✅ `AI_PROVIDER=openai`, `OPENAI_API_KEY` reçus, 3 générations faites | — |
| API officielle TikTok | ouverture des API affiliés pour la France par TikTok, puis `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_ACCESS_TOKEN` (compte créateur) et `TIKTOK_CATEGORY_MAP` | Partner Center TikTok Shop, responsable de compte |
| Images réelles | les domaines d’images vus au premier relevé, dans `IMAGE_HOSTS` (l’admin les liste) | Vercel |
| Mise en ligne (étape 5) | `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `ADMIN_EMAILS` et les clés Stripe, Resend, Claude | Vercel |

**À vérifier au premier appel réel** (marqué `TODO(nexscope)` / `TODO(tiktok)` dans le code) :
- la forme exacte de l’enveloppe des réponses Nexscope : sa doc prévient que les exemples sont anciens ;
- les noms de catégories reconnus pour la France, et l’endroit où se trouve la liste des vidéos ;
- l’unité de la commission ;
- les domaines d’images.

**Sites non joignables d’ici** :
- les documentations (supabase.com, partner.tiktokshop.com, nexscope.ai) ont été lues dans leurs dépôts officiels
  ou des copies datées sur GitHub ;
- lengow.com et digiday.com n’ont pas pu être ouverts. Les chiffres Lengow sont confirmés par recherche web. Ceux
  de Digiday et sa date le sont par un article qui le cite : à relire sur la page de Digiday avant la mise en ligne.

**À trancher** : avec de vraies données, l’aperçu animé de l’accueil montre publiquement 5 vrais produits du jour
avec leur score. C’est un bon argument, mais c’est plus que le plan gratuit (3 produits) : garder, décaler d’un
jour, ou masquer les noms ?

### Vérifications

| Vérification | Résultat |
| --- | --- |
| `npm run build` | ✅ passe |
| `npm run lint` (ESLint + TypeScript strict) | ✅ 0 erreur, 0 avertissement |
| `npm test` (Vitest) | ✅ 96 tests (dont 23 pour les fournisseurs et le repli, 21 pour le score, 7 pour le déploiement) |
| `npm run test:e2e` (Playwright) | ✅ 3 parcours (4 tests) |
| `npm run check:sql` | ✅ migrations appliquées deux fois sur Postgres 16 + tests RLS |
| `npm run test:integration` | ✅ 31 tests + 3 parcours de connexion contre la vraie base (Google ignoré, non configuré) |
| Audit axe de la section « Le marché » | ✅ 0 violation, mobile et desktop |

### Les 5 prochaines étapes

1. **Créer le projet Supabase** (région UE), poser les clés, lancer `npm run db:setup` puis `npm run test:integration`
   jusqu’au vert ; corriger ce qui casse contre la vraie base.
2. **Brancher Nexscope** : clé, puis « Lancer le rafraîchissement » dans `/admin`. Vérifier les points ci-dessus,
   ajouter les domaines d’images, et comparer 20 produits du radar à ce qu’on voit dans l’appli TikTok Shop.
3. **Après 7 à 14 nuits de vraies données** : `npm run score:distribution`, puis ajuster l’échelle et les seuils de
   tendance si les scores se tassent ou si « explose » devient trop fréquent.
4. **Mettre en ligne sur Vercel** en suivant la liste de vérification du README (domaine, Supabase, Stripe en
   production, Resend vérifié, tâche nocturne testée), et brancher `/api/health` sur un outil de surveillance.
5. **Demander à TikTok l’ouverture des API affiliés pour la France** (Partner Center, responsable de compte). Ensuite :
   OAuth des créateurs et suivi des commandes affiliées (interfaces prêtes), échantillons gratuits par créateur.

---

## Ce qui marche

- **Connexion** : lien magique et Google via Supabase ; en local, lien magique affiché à l’écran. Codes formateur
  et parrainage par lien `/r/CODE` (mémorisés 30 jours) ou saisis à l’onboarding.
- **Onboarding** : prénom et pseudo, tranche d’abonnés avec explication du **mode préparation** (< 1 500),
  1 à 3 niches, style de vidéo et phrase d’exemple, code formateur facultatif.
- **Radar** : produits du jour de ses niches, triés par score, filtres (niche, prix, commission minimum,
  échantillon, tendance), carte « n°1 » mise en avant, commission en euros par vente, mini-courbe 7 jours,
  affiliés. **Plan gratuit limité côté serveur** : 3 produits fixes pour la journée, score masqué, produits
  verrouillés sans aucune donnée envoyée au navigateur.
- **Score d’opportunité** (`lib/score.ts`) : 35/25/20/10/10 exactement comme demandé, toujours expliqué en phrases.
- **Fiche produit** : courbe 30 jours (ventes + affiliés), « pourquoi ce score », vidéos qui vendent, « Écrire mes
  scripts », « Ajouter à mes produits », encart échantillon gratuit en 3 étapes avec message prêt à copier.
- **Studio** : 5 formats, 10 accroches de moins de 3 s, 3 scripts de 20 à 40 s plan par plan (on voit / voix /
  texte à l’écran), copier, régénérer une accroche, garder, historique, export (Pro+). Claude avec sortie JSON
  validée par Zod et un nouvel essai si invalide ; garde-fou (médical, superlatifs, gains) ; ligne #publicité
  ajoutée par le serveur. Limites du plan consommées de façon atomique, crédit rendu si échec.
- **Paiement** : Stripe Checkout, portail client, webhooks signés et idempotents, essai Pro de 3 mois sans carte
  pour les élèves d’un formateur, commissions de 30 % hors taxes à chaque facture. Code isolé dans `lib/billing/`.
- **Mes produits** : objectif 20 vidéos, compteur manuel, barre de progression, alerte quand un produit baisse.
- **Récap du matin** : préparé chaque nuit, e-mail React Email programmé à l’heure choisie (Resend), aperçu dans
  l’appli, réglages. **Bot Discord** : `/lier`, `/delier`, message privé quotidien, salon public masqué,
  salon Pro, rôle Pro synchronisé.
- **Parrainage** : lien personnel, filleuls, gains du mois et à verser.
- **Espace formateur** : code et lien, inscriptions sur 8 semaines, actifs de la semaine, plans, scripts écrits,
  commission du mois, tableau des élèves agrégé (e-mail seulement avec consentement).
- **Admin** : état des services, dernière tâche nocturne et lancement manuel, demandes de partenariat, formateurs,
  passage d’un compte en formateur, boîte de réception locale.
- **Site public** : accueil au style EtSmart (voir « Refonte design »), avec aperçu du radar dès le premier écran
  (mobile compris), chiffres, fonctionnalités, étapes, prix, formateurs, FAQ ; pages Prix et Formateurs
  (formulaire → base + e-mail).
- **RGPD** : mentions légales, CGV, confidentialité (champs `[À COMPLÉTER]` surlignés), suppression de compte en
  libre-service (résiliation puis effacement), aucun cookie non essentiel donc pas de bannière.
- **Design** : style EtSmart en couleurs TikTok, noir par défaut, police Sora auto-hébergée, contrastes AA
  vérifiés, signature cyan/rose réservée au score et au logo, mobile d’abord avec barre du bas, focus visible,
  `prefers-reduced-motion`, squelettes de chargement, états vides utiles, erreurs précises.

## Refonte design (style EtSmart, couleurs TikTok)

Le site et l’appli reprennent le design d’EtSmart (etsmart.app), copié à partir de son code source
(`elky431-debug/Etsmart`) et des deux captures fournies, avec les couleurs de TikTok et le contenu de Pépite.
Six commits (« Refonte 1 » à « Refonte 6 »), décisions détaillées dans `DECISIONS.md` (R1 à R31).

- **Thème** : noir pur par défaut partout ; le clair reste disponible, uniquement en option dans le compte.
- **Couleurs** : dégradé cyan → rose à la place du dégradé bleu-turquoise d’EtSmart, cyan pour les étiquettes,
  icônes et liens, boutons d’action roses.
- **Police** : Sora, celle d’EtSmart, auto-hébergée (aucun appel à Google).
- **Accueil** : en-tête fixe flouté, pastille d’annonce, titre « Sache quoi vendre sur TikTok Shop » avec
  « chaque matin. » en italique et en dégradé vivant, constellation animée sur canvas (dérive, parallaxe,
  pause hors écran), aperçu du radar qui fait défiler 5 produits, chiffres vrais comptés à l’écran, sections
  TOUT-EN-UN / Comment ça marche / Tarifs / Formateurs / FAQ qui apparaissent au défilement.
- **Fidélité** : à 1 440 px, la pastille, les boutons et la mention tombent à moins de 5 px des positions de la
  capture EtSmart ; comparaisons côte à côte dans `docs/captures/refonte-comparaison-haut.jpg` et
  `docs/captures/refonte-comparaison-tout-en-un.jpg`. En mobile 390 px, le titre ne déborde pas et le premier
  écran montre le titre, les boutons et le début de l’aperçu du radar.
- **Écarts volontaires avec le brief** (détails dans `DECISIONS.md`) :
  - quand une mesure du brief différait du code EtSmart (taille du titre, padding des cartes…), la mesure
    d’EtSmart a été retenue, puisque le brief demande une copie au pixel près ;
  - deux couleurs du brief échouaient à l’audit d’accessibilité qu’il exige : texte discret #7E7F85 au lieu de
    #5C5D63, fond des boutons roses #E3174D au lieu de #FE2C55 (le rose reste #FE2C55 partout ailleurs) ;
  - le plan Pro porte « Recommandé » et non « Le plus choisi » : sans abonnés, ce serait une fausse affirmation
    (règle n° 2 du projet). C’est une ligne à changer dans `components/pricing/pricing-cards.tsx`.
- **Vérifications** : audit axe sans erreur (thème noir et clair, mobile et desktop, site, appli, onboarding,
  espaces formateur et admin), build, lint, 60 tests unitaires et les 3 parcours Playwright au vert.
- **Poids** : Motion ajoute environ 60 ko à l’accueil ; à alléger plus tard avec `LazyMotion` si besoin.

## Ce qui est simulé (et comment le rendre réel)

| Élément | Aujourd’hui | Pour le rendre réel |
| --- | --- | --- |
| Données produits | 200 produits fictifs déterministes, signalés « produits fictifs » | `NEXSCOPE_API_KEY` (adaptateur prêt) ; API TikTok quand elle sera ouverte en France (voir « Session 3 ») |
| Base et connexion | fichier local `.data/` | Clés Supabase, `npm run db:setup`, `npm run test:integration` (README §2) |
| Scripts | générateur simulé | `ANTHROPIC_API_KEY` |
| Paiement | simulé en local, désactivé sinon | Clés Stripe + `npm run stripe:setup` + webhook |
| E-mails | boîte locale (`/admin`) | `RESEND_API_KEY` + `EMAIL_FROM` |
| Bot Discord | code prêt, non lancé | `bot/README.md` |
| Vidéos qui vendent | fictives | Fournisseur de données payant (pas d’API officielle publique) |
| Vidéos postées | saisies à la main | Prévu ainsi en V1 |

**Pas encore testé contre un vrai Supabase** : `lib/db/supabase.ts` n’a pas pu tourner contre une API Supabase
(aucune clé ici). Les tests d’intégration qui couvrent chaque méthode, la RLS et la connexion sont prêts
(`npm run test:integration`, session 3). Le SQL, la RLS et les fonctions sont validés sur Postgres 16.

## Clés à renseigner

| Variable | Où la trouver | Indispensable pour |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | Production |
| `SUPABASE_DB_URL` (+ `SUPABASE_ACCESS_TOKEN`) | Supabase → Connect → Session pooler (jeton : Account → Access Tokens) | `npm run db:setup` uniquement, jamais sur Vercel |
| `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`) | console.anthropic.com | Vrais scripts |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (×4) | Stripe Dashboard + `npm run stripe:setup` | Paiement |
| `RESEND_API_KEY`, `EMAIL_FROM`, `FOUNDER_EMAIL` | resend.com | E-mails |
| `CRON_SECRET` | à générer (long, aléatoire) | Tâche nocturne en production |
| `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS` | ton domaine, ton e-mail | Production |
| `BOT_API_SECRET`, `NEXT_PUBLIC_DISCORD_INVITE_URL` (+ `bot/.env`) | à générer / Discord | Bot Discord |
| `NEXSCOPE_API_KEY` (ou `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_CATEGORY_MAP`) | nexscope.ai / Partner Center TikTok Shop | Vraies données |
| `DATA_PROVIDER`, `DATA_MAX_CALLS_PER_NIGHT`, `DATA_RATE_PER_SECOND`, `DATA_CACHE_HOURS`, `DATA_PAGES_PER_NICHE`, `DATA_VIDEO_PRODUCTS`, `IMAGE_HOSTS` | réglages (valeurs par défaut dans `.env.example`) | Coût et débit des appels, images |

## Commandes

```bash
npm install && npm run seed && npm run dev      # tout en local, sans clé
npm run build && npm run lint && npm test        # vérifications
npm run test:e2e                                 # 3 parcours Playwright
npm run check:sql                                # migrations (deux fois) + RLS sur un Postgres jetable
npm run db:setup                                 # Supabase réel : migrations, types, seed
npm run test:integration                         # tests contre le vrai Supabase (rien sans clés)
npm run score:distribution                       # distribution des scores sur la base actuelle
npm run stripe:setup                             # produits et prix Stripe
cd bot && npm install && npm run dev             # bot Discord
```

## Hypothèses business prises (à confirmer)

1. **Le plan Gratuit reçoit le récap par e-mail** (3 produits, sans score). La consigne ne retirait que Discord.
2. **Commissions versées par virement mensuel dès 50 € cumulés**, calculées sur le montant **hors taxes**, au taux
   du formateur (30 % par défaut). Le versement reste manuel en V1 (les montants « à verser » sont dans l’appli).
3. **Un seul essai offert par personne**, sans carte, qui repasse en Gratuit sans frais à la fin.
4. **Pro+ « illimité »** dans le cadre d’un usage personnel raisonnable (mentionné dans les CGV).
5. **Gratuit = les 3 meilleurs produits du jour** de ses niches (pas 3 au hasard) : c’est l’argument pour revenir.
6. **Heures du récap** proposées de 6 h à 12 h.
7. **Chiffres de marché affichés depuis la session 3**, avec leur source et leur date (section « Le marché ») :
   uniquement les trois chiffres fournis, rien d’autre.
8. **Pas de « 10× plus à partir de 20 vidéos »** : les deux montants de l’étude américaine (7,19 $ et 74,07 $ par
   vidéo) sont affichés avec leur source, sans en tirer de multiplicateur ni de promesse.
9. **Régime de TVA inconnu** : prix affichés « en euros », mention TTC ou franchise à compléter dans les CGV.
10. **Nom « Pépite »** : nom de travail, à changer dans `lib/brand.ts` (et le texte du README).

## Limites connues

- Remboursements et litiges Stripe : pas encore d’annulation automatique de la commission correspondante.
- Le radar Pro affiche tout le catalogue de ses niches sur une page (≈ 80 produits) : pagination à prévoir avec
  un vrai catalogue.
- La tâche nocturne traite les utilisateurs un par un : au-delà de quelques milliers, découper en lots
  (durée maximale des fonctions Vercel) et utiliser l’envoi groupé de Resend.
- Le mode local est fait pour le développement (un seul processus, fichier JSON), pas pour la production.
- Les e-mails de connexion Supabase utilisent le modèle du tableau de bord (texte français fourni dans le README).

## Les 10 prochaines choses à faire

(Liste de fin de V1. Pour la suite immédiate, voir « Les 5 prochaines étapes » de la section « Session 3 ».)

1. **Créer le projet Supabase**, appliquer les migrations, configurer Auth (modèle d’e-mail FR, Google, SMTP
   Resend) et faire tourner les vérifications listées plus haut sur `lib/db/supabase.ts`.
2. **Brancher une vraie source de données** : demander l’accès Partner Center TikTok Shop (API affiliés) et/ou
   un fournisseur payant, finir les `TODO` de `lib/data/`, comparer les scores au terrain pendant 2 semaines.
3. **Compléter les pages légales** (`[À COMPLÉTER]`) et les faire relire par un juriste (CGV, rétractation, TVA,
   influence commerciale), choisir un médiateur de la consommation.
4. **Stripe en production** : `npm run stripe:setup` en live, portail configuré (changement de plan), webhook,
   Stripe Tax si besoin ; tester un vrai paiement et une résiliation (`E2E_STRIPE=1 npm run test:e2e`).
5. **Signer les premiers formateurs** : 3 à 5 partenaires, créer leurs codes dans `/admin`, recueillir leurs retours
   sur l’espace formateur.
6. **Lancer le bot Discord** (serveur, rôle Pro, salons) et l’héberger (Railway ou Fly.io).
7. **Versement des commissions** : export mensuel des montants à verser, statut « versé », collecte de l’IBAN et
   annulation sur remboursement (`charge.refunded`).
8. **Mesurer sans pister** : une analytique respectueuse (ex. Plausible, sans cookie) pour suivre l’activation
   (onboarding terminé, premier script, premier produit suivi) et la rétention du récap.
9. **Suivi automatique des vidéos postées** si une API officielle le permet (sinon garder la saisie manuelle),
   et rappels « il te reste N vidéos sur ce produit » dans le récap.
10. **Qualité des scripts** : constituer un jeu d’évaluation (20 produits × 5 formats), le relire avec des affiliés,
    ajuster le prompt système, et proposer des scripts « suite » (vidéo 2, 3… sur le même produit).

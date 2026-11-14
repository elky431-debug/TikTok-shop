# Rapport — TikTrend

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

## Session 3 — Brancher TikTrend au réel

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
(`elky431-debug/Etsmart`) et des deux captures fournies, avec les couleurs de TikTok et le contenu de TikTrend.
Six commits (« Refonte 1 » à « Refonte 6 »), décisions détaillées dans `DECISIONS.md` (R1 à R31).

- **Thème** : noir pur par défaut partout ; le clair reste disponible, uniquement en option dans le compte.
- **Couleurs** : dégradé cyan → rose à la place du dégradé bleu-turquoise d’EtSmart, cyan pour les étiquettes,
  icônes et liens, boutons d’action roses.
- **Police** : Sora, celle d’EtSmart, auto-hébergée (aucun appel à Google).
- **Accueil** : en-tête fixe flouté, pastille d’annonce, titre « Sache quoi vendre sur TikTok Shop » avec
  « chaque matin. » en italique et en dégradé vivant, constellation animée sur canvas (dérive, parallaxe,
  pause hors écran), défilé de captures de l’appli sous le titre (remplace l’aperçu du radar), chiffres vrais comptés à l’écran, sections
  TOUT-EN-UN / Comment ça marche / Tarifs / Formateurs / FAQ qui apparaissent au défilement.
- **Fidélité** : à 1 440 px, la pastille, les boutons et la mention tombent à moins de 5 px des positions de la
  capture EtSmart ; comparaisons côte à côte dans `docs/captures/refonte-comparaison-haut.jpg` et
  `docs/captures/refonte-comparaison-tout-en-un.jpg`. En mobile 390 px, le titre ne déborde pas et le premier
  écran montre le titre et les boutons ; le défilé de captures suit.
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
10. **Nom « TikTrend »** : nom de travail, à changer dans `lib/brand.ts` (et le texte du README).

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

---

## Session 4 : tout rendre fonctionnel

Branche `claude/kind-galileo-ardtih`, un commit par étape. Tests : 162 tests unitaires, intégration Supabase réelle
(dépôt, RLS, connexion, remboursement de commission), Playwright local.

| Fonctionnalité | État | Ce qui manque pour le réel |
| --- | --- | --- |
| Nom TikTrend partout (`lib/brand.ts`, logo deux tons) | marche en réel | — |
| Dépendances déclarées, `npm ci` + build dans un dossier vierge (`check:deps` avant chaque build) | marche en réel | — |
| Netlify : `netlify.toml`, tâche nocturne planifiée 3 h UTC + fonction d'arrière-plan, `/api/health` | marche en simulé | un site Netlify (étapes du README, section 3) |
| Lien magique en français, adresses de retour (`npm run auth:setup`) | marche en réel | — (appliqué au projet Supabase) |
| Lien magique envoyé par le SMTP de Resend | marche en simulé | `RESEND_API_KEY`, `EMAIL_FROM` (domaine vérifié), puis `npm run auth:setup` |
| Lien affiché à l'écran : local seulement, refusé sur un site déployé | marche en réel | — |
| Récap e-mail à l'heure choisie, une fois par jour, désinscription en un clic (RFC 8058) | marche en simulé | `RESEND_API_KEY`, `EMAIL_FROM` |
| E-mail de partenariat formateur au fondateur | marche en simulé | `RESEND_API_KEY`, `EMAIL_FROM`, `FOUNDER_EMAIL` |
| E-mail de test réel à `ADMIN_EMAILS` (`npm run test:integration`) | bloqué | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAILS` |
| Stripe : produits, prix, portail, webhook (`npm run stripe:setup`) | marche en simulé | `STRIPE_SECRET_KEY` (sk_test_), puis la commande ; ID de prix à reporter ici |
| Mensuel / annuel, Gratuit → Pro → Pro+ (confirmation du portail), résiliation | marche en simulé | idem ; parcours réels prêts dans `tests/integration/stripe.test.ts` |
| Échec de paiement : accès gardé, e-mail, bandeau « Mettre à jour ma carte » | marche en simulé | idem |
| Essai formateur de 3 mois sans carte | marche en simulé | idem |
| Commission créée par un paiement, annulée par un remboursement (au prorata) | marche en simulé (base réelle) | idem ; la colonne et la logique tournent déjà sur le vrai Supabase |
| Discord : `/lier`, `/delier` (interactions HTTP signées), récap privé, salons du jour, rôle Pro | marche en simulé | `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, salons, rôle ; `npm run discord:setup` |
| Hébergement du bot | marche (rien à héberger) | — : fonctions Netlify, 0 € de plus |
| Fiche produit : ventes par période (< 7 jours de relevés), puis courbe | marche en réel | — (20 vrais produits enrichis) |
| Vidéos qui vendent (10 produits par nuit, cache 3 jours, à la demande en Pro) | marche en réel | — (3 × 5 vraies vidéos) |
| Échantillon gratuit | retiré partout | aucune source ne le fournit (ni Nexscope, ni l'API TikTok) |
| Vidéos dans le studio (texte et vrais chiffres dans le prompt) | marche en réel | — |
| Connexion Google | bloqué | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (procédure dans le README), puis `npm run auth:setup` |
| Suivi des gains : saisie, import CSV, par produit / vidéo / semaine, produit le plus rentable (Pro) | marche en réel | — |
| Propositions de marques : lecture IA, note 0–100 face au radar, 3 réponses, historique (Pro+) | marche en réel | — (OpenAI branché) |
| Plan de publication : 20 vidéos, rappels e-mail et Discord, export .ics (Pro) | marche en simulé (e-mail, Discord) | clés Resend et Discord pour les rappels réels ; le plan et l'.ics marchent en réel |
| Analyse de vidéo virale : lien (Nexscope) ou texte, découpage, version adaptée (Pro+) | marche en réel | — |
| Europe DE / IT / ES (Pro+), FR par défaut | marche en simulé | `ENABLED_REGIONS=DE,IT,ES` pour collecter ces pays (crédits Nexscope en plus) |

**Budget Nexscope de la session : 9 appels sur 30.**
- 2 appels de vérification (forme réelle des réponses) : `et/batchProductDetail` (10 produits), champ `cost` = 96 136 ;
  `et/listProductVideo`, `cost` = 11 621. Le champ `costToken` annoncé par la doc n'est pas dans les vraies réponses ;
  `cost` correspond, à 1 000 près, aux crédits annoncés (~96 et ~11) : à confirmer dans l'historique d'usage Nexscope.
- 1 appel `et/batchProductDetail` d'une centaine de produits, sans réponse en 30 s (d'où les lots de 20, délai 60 s).
- 6 appels par `npm run data:enrich` : ventes par période de 20 produits et vidéos de 3 produits.

**Identifiants de prix Stripe** : pas encore créés (pas de clé). Après `npm run stripe:setup`, les reporter ici.

**Échantillon gratuit** : retiré du score (poids réparti au prorata), du filtre, de la fiche, des cartes, des récaps,
de l'accueil et de la base. Aucune route TikTok de Nexscope n'a ce champ ; `freeShipping` est la livraison offerte.

### Correctif prioritaire : inscription (avant la fin de la session 5)

**Cause.** L'inscription ne passait que par le lien magique. Sans SMTP configuré (Resend absent), Supabase utilise son
service d'e-mail intégré, limité à 2 e-mails par heure et réservé aux adresses de l'équipe du projet : les nouveaux
comptes ne recevaient jamais leur lien. De plus, la « Site URL » et la seule adresse de retour autorisée étaient
`http://localhost:3000` : depuis le site en ligne, un lien de connexion retombait sur une adresse non autorisée, donc
sur la page d'accueil, sans ouvrir de session.

**Correctifs.**
- Inscription et connexion par **e-mail et mot de passe** (Supabase Auth `signUp` / `signInWithPassword`), en plus du
  lien magique (gardé en option, et pour le mot de passe oublié une fois Resend branché). En mode local, mots de passe
  hachés en scrypt.
- Liens de retour calculés depuis l'adresse réellement utilisée (local, Netlify, domaine), parmi les adresses connues
  seulement ; un lien qui retombe quand même sur l'accueil (`?code=` ou `?token_hash=`) est renvoyé à `/auth/callback`.
- Supabase réglé par l'API de gestion (`npm run auth:setup`) : Site URL `https://tracktout.com`, retours autorisés
  `https://tracktout.com/auth/callback**`, `https://www.tracktout.com/auth/callback**`,
  `http://localhost:3000/auth/callback**` (+ l'adresse Netlify dès qu'elle est connue : `AUTH_REDIRECT_ORIGINS`).
- Vérifié dans le navigateur contre le vrai Supabase (version de production) : accueil → « Commencer » → « Créer mon
  compte » → onboarding → radar « Inès, voici tes produits du jour », puis reconnexion par mot de passe
  (`tests/integration/e2e/auth.spec.ts`, comptes de test supprimés).

**Vérifié en ligne** (13 novembre 2026, https://splendorous-kleicha-5d07d3.netlify.app, branche
`claude/kind-galileo-ardtih`, navigateur réel) : accueil → « Commencer » → « Créer mon compte » (e-mail et mot de
passe) → onboarding → radar « Inès, voici tes produits du jour » (3 fiches ouvertes) → déconnexion (`/app` renvoie à
la connexion) → reconnexion par mot de passe → radar. Comptes de test supprimés ensuite (ainsi que 4 comptes
`itest-…@example.com` laissés par d'anciens tests d'intégration).

Adresses de retour autorisées chez Supabase : `https://tracktout.com`, `https://www.tracktout.com`,
`https://splendorous-kleicha-5d07d3.netlify.app` et `http://localhost:3000` (`/auth/callback**` pour chacune) ;
Site URL : `https://tracktout.com` (domaine définitif).

> ⚠ **À corriger dans Netlify** : `NEXT_PUBLIC_SITE_URL` vaut `https://tracktout.netlify.app`, une adresse qui
> n'existe pas (vu dans `/api/health`). L'inscription n'en dépend plus, mais les liens des e-mails (récap,
> désinscription), les retours de Stripe et les boutons Discord l'utilisent : mets
> `https://splendorous-kleicha-5d07d3.netlify.app` en attendant que `tracktout.com` pointe vers le site, puis redéploie.

> ⚠ **À réactiver quand Resend sera branché : la confirmation d'e-mail est désactivée** (`mailer_autoconfirm = true`,
> réglé le 12 novembre 2026 par l'API de gestion de Supabase). Pour la remettre, une fois `RESEND_API_KEY` et
> `EMAIL_FROM` en place :
> `AUTH_SITE_URL=https://tracktout.com AUTH_REDIRECT_ORIGINS=<adresse Netlify>,https://www.tracktout.com AUTH_EMAIL_CONFIRMATION=on npm run auth:setup`
> (la même commande branche aussi le SMTP de Resend). Les modèles d'e-mail de confirmation et de lien magique sont
> déjà en français et ramènent à l'adresse d'où vient la demande.

## Refonte de l'appli : identique à EtSmart, avec un vrai dashboard (13 novembre 2026)

| Étape | État | Où |
| --- | --- | --- |
| 0. Studio en panne en production | **Cause trouvée, action de ta part requise** (voir ci-dessous) | `lib/ai/providers/openai.ts`, `lib/env.ts`, `/api/health` |
| 1. Coque et composants d'EtSmart | Fait | `components/app/shell.tsx`, `components/ui/surface.tsx`, `field.tsx`, `app/app/template.tsx` |
| 2. Dashboard sur `/app`, radar sur `/app/radar` | Fait | `app/app/page.tsx`, `lib/dashboard.ts`, `lib/creator-profile.ts`, `components/dashboard/widgets.tsx` |
| 3. Onboarding en 10 écrans | Fait, migration appliquée sur Supabase | `app/bienvenue/`, `lib/onboarding-steps.ts`, `supabase/migrations/20261116000100_onboarding_v2.sql` |
| 4. Toutes les pages + vérifications | Fait (sauf comparaison en images avec EtSmart, voir plus bas) | `docs/captures/refonte-app/` |

### Étape 0 : pourquoi le studio échouait en ligne

Ce n'était ni le modèle ni un paramètre : la variable **`OPENAI_API_KEY` de Netlify contient un texte d'exemple de
15 caractères** (il commence par « [ta clé »), pas une clé OpenAI. OpenAI répond alors 400 « Bad Request » sans détail.
L'appel est conforme à la doc de `gpt-6-luna` (sorties structurées, `max_output_tokens`, `store`) et fonctionne en
local avec une vraie clé : le modèle est gardé.

**À faire :** Netlify → Site configuration → Environment variables → `OPENAI_API_KEY` = ta vraie clé OpenAI (sans
crochets, sans espace), puis « Trigger deploy ». `/api/health` passe alors de `degraded` à `ok` (champ
`ai.keyOk: true`). Tant que la clé est mauvaise, le studio l'écrit clairement au lieu d'un « Bad Request ».
Profites-en pour corriger `NEXT_PUBLIC_SITE_URL` (il doit valoir l'adresse Netlify actuelle ou `https://tracktout.com`).

### Ce qui a changé pour l'utilisateur

- **Barre latérale d'EtSmart** en 5 sections (Accueil ; Trouver : Radar, Recherche, Alertes, Comparer ; Créer : Studio,
  Analyse de vidéo, Plan de publication ; Suivre : Mes produits, Mes gains, Propositions de marques ; Compte : Récap,
  Parrainage, Préparation en mode préparation, Compte). Espace formateur et admin dans la même coque.
- **Dashboard** : profil (initiale, prénom, @pseudo, plan, statut, série), chiffres publics du compte TikTok
  (Nexscope, un relevé par jour au plus) ou tranche déclarée, 5 indicateurs avec variation (gains et ventes du mois,
  vidéos de la semaine face à l'objectif, produits suivis, alertes du jour), courbe gains + ventes sur 7/30/90 jours,
  produit du jour (score qui compte, commission, « Écrire mes scripts »), produits suivis (mini-courbe, baisse en
  tête), objectif du mois (anneau), 3 vidéos à tourner (à cocher), activité récente, raccourcis. Que des chiffres
  saisis ou mesurés ; un état vide utile partout.
- **Onboarding** : 10 questions, une par écran, ≈ 1 minute ; comptes existants : 6 nouvelles questions, une fois.
- **Toutes les pages** : en-tête d'EtSmart (section, titre, une phrase d'utilité), cartes et champs d'EtSmart, pages
  de formulaire centrées comme les réglages d'EtSmart, onglets à trait dégradé.

### Coût ajouté

- Profil TikTok (Nexscope `social/tiktok/profile`) : 10 crédits par relevé, 0 si Nexscope répond depuis son cache.
  **Une fois par semaine** par utilisateur actif qui a un pseudo (≈ 43 crédits par mois au plus), plus le bouton
  « Actualiser » des abonnés Pro et Pro+ (une fois par jour au plus, jamais deux relevés le même jour). Avant ce
  changement : jusqu'à un relevé par jour pour tout le monde (≈ 300 crédits par mois et par utilisateur actif).
- OpenAI : inchangé.

### Vérifications

- `npm run build`, `npm run lint`, tests unitaires (390), Playwright (4 parcours) : verts.
- Audit axe WCAG 2.1 AA : 0 erreur sur les 17 pages de l'appli, l'admin, l'espace formateur et l'onboarding, à 390 et
  1440 px.
- Onboarding : tient dans 390 × 844 sans défiler, vérifié écran par écran.
- Migration `onboarding_v2` rejouée deux fois sur un Postgres jetable, puis appliquée sur Supabase (API de gestion).
- Captures 390 / 1440 px : `docs/captures/refonte-app/` (comparaison avec le code d'EtSmart dans son README).
- **En ligne** (https://splendorous-kleicha-5d07d3.netlify.app, 13 novembre) : inscription par mot de passe → 10
  questions → « On prépare ton radar » → dashboard avec un vrai produit du jour (Nexscope) → studio → déconnexion vers
  l'accueil, sans erreur JavaScript. La génération affiche le message de clé invalide (attendu tant que
  `OPENAI_API_KEY` n'est pas corrigée). Corrigé au passage : la déconnexion et le retour des liens de connexion
  renvoyaient vers l'adresse interne du déploiement de branche. Comptes de test supprimés.

### Ce qui reste

- **Comparaison en images avec EtSmart** : son appli exige un compte connecté à son Supabase. Avec un compte de
  démonstration EtSmart, les mêmes pages se capturent en une commande. En attendant, la correspondance a été faite
  classe par classe dans le code (`docs/captures/refonte-app/README.md`).
- **Génération réelle en ligne** : dès que `OPENAI_API_KEY` est corrigée sur Netlify.
- Reprise de la session 5 sur la refonte : section « Session 5 » du rapport, captures, coûts par utilisateur.

## Session 5 : chaque fonctionnalité au maximum (bilan, 13 novembre 2026)

Travail fait par 5 agents en parallèle puis fusionné et branché (détail par bloc dans `docs/session5/*.md`, décisions
146 à 160 de `DECISIONS.md`), revérifié après la refonte de l'appli. Tout passe par un quota par plan appliqué côté
serveur ; rien n'est inventé : une donnée absente masque la fonctionnalité qui en dépend.

| Bloc | État | Plan |
| --- | --- | --- |
| 1. Radar : filtres avancés, badges, « pourquoi maintenant », recherche par mot-clé, favoris, comparateur, alertes, vues, export | Réel (filtre masqué sans donnée) ; alertes vérifiées chaque nuit | Recherche, comparateur, alertes : Pro ; export : Pro+ |
| 2. Score : « pour toi » (niches, taille, niveau, styles), évolution 30 j, poids réglables, phrases | Réel | « Pour toi », évolution : Pro ; poids : Pro+ |
| 3. Fiche produit : courbe et périodes, simulation, accroches analysées, similaires, actions | Réel ; CA et prix min/max masqués (pas fiables en euros) ; créateurs du produit masqués (pas de route utile) | Accroches : Pro |
| 4. Studio : 8 formats, réglages, style perso, série de 20, retouches, traduction, téléprompteur, notes, export | Réel (génération en arrière-plan, voir décision 179) | Style, série : Pro ; traduction, export : Pro+ |
| 5. Mes produits et plan de publication : tableau à tourner/tourné/posté, calendrier, rappels, `.ics`, série, baisse | Réel ; rappels toutes les heures, baisses chaque nuit | Calendrier : Pro |
| 6. Gains : saisie, import CSV, tableaux, objectif, export | Réel | Pro |
| 7. Propositions de marques : lecture, note, points d'attention, 3 réponses, relance | Réel (IA en arrière-plan) ; relances chaque nuit | Pro+ |
| 8. Analyse de vidéo : lien ou texte, découpage, version adaptée, envoi au studio, bibliothèque | Réel (Nexscope pour le lien, IA en arrière-plan) ; le studio lit le brouillon | Pro+ |
| 9. Récaps du matin et du dimanche : 5 produits, script, alertes, baisses, défi ; e-mail, Discord, push | Réel ; e-mails réels dès que Resend est branché | Tous (Discord : Pro) |
| 10. Discord : `/lier`, `/produits`, `/score`, `/script`, `/alerte`, `/classement`, salons, rôle Pro | Prêt ; `npm run discord:setup` à lancer avec les clés Discord | Quotas par plan |
| 11. Mode préparation : niche, plan de 30 jours, liste de vérification, courbe d'abonnés, passage au mode affilié | Réel (plan en arrière-plan) | Tous |
| 12. Formateurs : tableau agrégé, détail avec consentement révocable, plusieurs codes, page `/f/[code]`, annonces, versements | Réel (versement manuel) | Formateurs |
| 13. Parrainage : lien, code, filleuls, gains, kit de partage | Réel | Tous |
| 14. Premier contact, e-mails de cycle de vie, changement de plan, codes de réduction | Réel ; onboarding refait en 10 questions (refonte) | Tous |
| 15. Appli installable, push, centre de notifications | Réel ; push actif dès les clés VAPID | Tous |
| 16. Admin : MRR, conversion, résiliations, actifs par jour, coûts, marge, relances | Réel ; euros de Nexscope dès `NEXSCOPE_EUR_PER_1000_CREDITS` | Admin |
| 17. Pages `/tendances/[niche]`, plan du site, métadonnées | Réel avec les données Nexscope (masqué sous 5 produits) | Public |
| RGPD : export et suppression de toutes les données, consentement formateur | Réel | Tous |

### Budget Nexscope de la session

**0 appel réel sur les 40 autorisés** : chaque route a été lue dans sa documentation et testée sur la réponse
documentée (fixtures). La tâche de nuit du site continue, elle, de consommer normalement (catalogue partagé par tous).

### Coût par utilisateur et par mois (estimations, hypothèses visibles)

Prix publics : OpenAI `gpt-6-luna` 0,10 $ / 1 M de jetons en entrée, 0,50 $ en sortie ; Nexscope ≈ 0,75 $ les
1 000 crédits (formules mensuelles 24 000 à 140 000 crédits pour 19 à 99 $, page « Pricing » du 13 novembre).

| Poste | Hypothèse | Pro, usage courant | Pro, plafond |
| --- | --- | --- | --- |
| Scripts (OpenAI, raisonnement « low ») | ≈ 4 000 jetons en entrée et 2 300 en sortie par génération ≈ 0,0015 $ | 3 par jour ≈ 0,14 $ | 30 par jour ≈ 1,40 $ |
| Autres IA (retouches, série, analyses, plan) | quelques centièmes de cent par appel | ≈ 0,10 $ | ≈ 0,50 $ |
| Profil TikTok (Nexscope) | 10 crédits, une fois par semaine ; « Actualiser » une fois par jour | ≈ 0,03 $ | ≈ 0,25 $ |
| Recherche par mot-clé (Nexscope) | 11 à 22 crédits, cache 24 h | 2 par jour ≈ 0,70 $ | 5 par jour ≈ 2,50 $ |
| **Total** | | **≈ 1 $ par mois** | **≈ 4,70 $ par mois** |

En Gratuit : 3 scripts par jour au plus (≈ 0,14 $ par mois), profil hebdomadaire, pas de recherche. Le catalogue de la
nuit (découverte, vidéos, détails) est un coût fixe partagé, suivi dans l'admin. Frais Stripe à part (1,5 % + 0,25 €).

### Les 10 prochaines améliorations

1. Brancher Resend (domaine vérifié) puis remettre la confirmation d'e-mail (`npm run auth:setup`).
2. Clés VAPID pour les notifications push, et clés Discord + `npm run discord:setup`.
3. Prévenir par notification quand une tâche longue (scripts, analyse) se termine et que la page d'attente a été quittée.
4. Fixer le prix des crédits Nexscope (`NEXSCOPE_EUR_PER_1000_CREDITS`) pour voir la marge réelle dans l'admin.
5. Choisir la palette (A ou B) et retirer l'autre.
6. Demander à TikTok l'accès à l'API officielle des affiliés (commandes réelles, sans saisie).
7. Comparer en images avec l'appli EtSmart (compte de démonstration EtSmart).
8. Mesurer la qualité des scripts en « low » et en « medium » sur 20 produits réels (notes des utilisateurs).
9. Remplir les `[À COMPLÉTER]` des mentions légales, CGV et confidentialité, puis passer sur tracktout.com.
10. Ajouter un test de bout en bout en ligne régulier (inscription → script) déclenché après chaque déploiement.

### Mise à jour du 13 novembre, 16 h 35 : déploiement débloqué et vérifié en ligne

- Les déploiements Netlify échouaient depuis 14 h 37 au scan des secrets (une fausse clé au format exact d'une clé
  OpenAI dans un test). Corrigé sans couper le scan (décision 186) ; déploiement publié 2 minutes après le push.
- En ligne : titre « Automatise ton business TikTok Shop de A à Z », description et aperçu de partage à jour, fond blanc,
  `/api/health` à `ok` (clé OpenAI acceptée).
- **Génération réelle vérifiée** : inscription → 10 questions → dashboard → « Écrire mes scripts » → page d'attente
  (environ 25 s, tâche en arrière-plan) → 10 accroches et 3 scripts écrits par OpenAI. Déconnexion vers l'accueil.
  Comptes de test supprimés.

## Nouvelle grille de prix : tout est payant (13 novembre 2026, décisions 188 à 194)

**Ce qui change pour l'utilisateur**
- Trois plans, sans plan gratuit ni essai : **Starter** 34,99 €/mois (279,90 €/an), **Pro** 59,99 € (479,90 €/an),
  **Elite** 97,99 € (779,90 €/an) — grille ajustée le 14 novembre. L'annuel vaut 8 mois (« 4 mois offerts », prix mensuel
  équivalent affiché : 23,33 €, 39,99 €, 64,99 €). Pro est marqué « Recommandé ».
- Parcours : inscription → onboarding (10 questions) → **choix de l'abonnement** (`/abonnement`) → paiement → appli.
  Sans abonnement, toute page de l'appli renvoie au choix du plan ; le compte (suppression, export) reste ouvert.
- Au paiement, une **case obligatoire** : « Je demande que mon abonnement démarre tout de suite, avant la fin du délai
  de rétractation de 14 jours. J'ai bien noté que si je me rétracte pendant ce délai, je paierai le service fourni
  jusqu'à ma rétractation, au prorata du prix (article L221-25 du Code de la consommation). » Elle est enregistrée
  côté serveur et confirmée par e-mail avec le récapitulatif de l'abonnement.
- **Formateurs** : plus de 3 mois offerts ; leur code donne **−20 % sur le premier mois** (abonnement mensuel, une fois
  par compte) et ils gardent **30 % de commission récurrente** sur ce qui est payé.
- « Illimité » (Elite, produits suivis en Pro) : un plafond de sécurité invisible protège les coûts Nexscope et OpenAI.

**⚠️ À faire relire par un juriste avant d'encaisser**
- les CGV (`/cgv`) : sections 2 (« ni plan gratuit ni essai »), 3 (plans, « illimité » et sa limite de sécurité), 5
  (droit de rétractation, démarrage immédiat, montant proportionnel, formulaire type de l'annexe R221-1, modalités de
  remboursement) et 6 (remise du code formateur, qui ne vaut pas pour l'annuel) ;
- le texte exact de la case (`lib/billing/consent.ts`) et sa qualification : l'abonnement est traité comme une
  **prestation de services** (art. L221-25 : paiement au prorata en cas de rétractation), pas comme un contenu numérique
  (L221-28 13°, qui ferait perdre le droit) ;
- l'e-mail de confirmation (`emails/subscription-confirmed.tsx`, support durable de l'art. L221-13) ;
- la politique de confidentialité (conservation de la preuve du consentement : durée à compléter) ;
- les `[À COMPLÉTER]` restants : raison sociale, adresses postale et e-mail de rétractation, régime de TVA.

**Choix business supposés (à confirmer)**
1. ✅ **Validé** : la remise formateur ne vaut que pour le **premier mois de l'abonnement mensuel**, une seule fois par
   compte.
2. **Plafonds de sécurité** (jamais affichés) : 150 scripts/jour, 500 produits suivis, 50 alertes, 300 analyses de vidéo
   et 300 propositions par mois, 50 analyses d'accroches et 150 commandes Discord par jour, 20 séries par jour.
3. Fonctions absentes de la grille : ✅ **validé** : export des scripts en PDF et texte → Elite (avec l'export CSV),
   analyse des accroches d'un produit → Pro (10/jour), Elite illimité. Encore supposé : commandes Discord /score et
   /script → 10, 40, illimité ; retouches de script → 10, 20, illimité ; plans de contenu du mode préparation → 3 par
   jour pour tous.
4. Les 5 formats de Starter : démo face caméra, avant-après, histoire perso, réponse à un commentaire, déballage.
5. Prix affichés **TTC** (le régime de TVA reste à compléter dans les CGV).
6. Le récap du matin (e-mail et Discord) est inclus dès Starter ; le récap de la semaine à partir de Pro.

**Coût maximal par abonné et par mois** (mêmes hypothèses que la section « Coût par utilisateur ») : Starter ≈ 2 $
(10 scripts et 3 recherches par jour), Pro ≈ 8 $ (40 scripts, 15 recherches), Elite au plafond ≈ 25 à 30 $ (150
scripts, 50 recherches par jour). Usage courant : bien en dessous.

**À faire de ton côté**
0. ✅ **Migration de la base appliquée** en production le 13 novembre, après le push (autorisée) :
   `20261117000100_nouvelle_grille.sql` (`free` → `aucun`, `proplus` → `elite`, `starter` ajouté, preuve du
   consentement protégée). Types régénérés, identiques à ceux du code.
1. **Stripe** : mettre `STRIPE_SECRET_KEY` (test d'abord), lancer `npm run stripe:setup` (3 produits, 6 prix retrouvés
   par `lookup_key`, coupon formateur, portail), puis `npm run stripe:setup -- --webhook` une fois en ligne. Plus aucune
   variable `STRIPE_PRICE_…` à recopier ; tu peux retirer les anciennes de Netlify.
2. **En attendant Stripe**, le site en ligne affiche « Paiement bientôt disponible » sur le choix de l'abonnement :
   personne ne peut entrer dans l'appli. Pour tester ou ouvrir un compte : `/admin/utilisateurs` → « Changer le plan »
   (plan offert, sans facture ni commission, exclu du MRR).
3. Relire les textes juridiques ci-dessus.

**Vérifications** (avant le push) : 430 tests unitaires ✅ (dont 5 corrections de code trouvées par la mise à jour des
tests : plan offert sans e-mail de confirmation ni statut « abonné », plafonds de sécurité jamais chiffrés dans les
messages des séries, du style et des retouches, pas de récap du matin sans abonnement), 4 parcours Playwright ✅
(inscription → choix de l'abonnement → paiement simulé, code formateur à −20 %, paiement annuel puis résiliation,
studio Starter avec 5 formats), build ✅, lint ✅, migrations rejouées deux fois + tests RLS ✅, audit axe ✅ sur
`/abonnement`, `/prix` et `/app/passer-pro`.

## Stripe : prix créés dans le tableau de bord (14 novembre)

- L'appli retrouve les prix par les clés que tu as créées (`starter_mensuel` … `elite_annuel`) ; rien n'est plus créé par
  le script. Le paiement affiche toujours le champ « code promotionnel » : crée un code par formateur dans Stripe
  (coupon −20 % « une fois » + code promo à son nom). Plus aucune remise appliquée d'office.
- **Pas fait par la session** (clé Stripe non fournie) : vérification des 6 prix, portail client, webhook, secret sur
  Netlify, paiements de test en ligne. Depuis ton poste, avec `STRIPE_SECRET_KEY` (sk_test_), `NETLIFY_AUTH_TOKEN` et
  `NETLIFY_SITE_ID` dans `.env.local` : `npm run stripe:setup -- --webhook --site=https://tracktout.com --netlify`, puis
  redéploie. Le script vérifie les prix, crée le portail et le webhook, et enregistre le secret sur Netlify sans
  l'afficher.
- `/api/health` signale « dernier relevé de plus de 36 heures » (relevé du 12 novembre) : la tâche de nuit n'a pas
  tourné depuis ; à regarder (journal de la fonction `nightly-refresh` sur Netlify).

## Interface plus simple, plus belle (14 novembre, décisions 198 à 203)

Six étapes, un commit chacune, poussées sur `main` (Netlify) et `claude/kind-galileo-ardtih`. Captures à 390 et
1440 px de chaque page modifiée : `docs/captures/interface/` (55 images, dont 5 du site en ligne).

1. **Noms courts** : 62 produits nommés en 3 à 6 mots par l'IA en production, 10 niches corrigées (le calendrier de
   l'Avent n'est plus en tech). Titre complet seulement dans la fiche, replié. Les nouveaux produits sont nommés la nuit.
2. **Studio** : choix en cartes (produit avec image, 8 formats illustrés, réglages repliés) ; résultat avec image, prix
   et commission en tête, 10 accroches copiables d'un clic, 3 scripts en onglets avec le texte parlé en grand, détails
   du tournage repliés, deux boutons (Téléprompteur, Copier le script), étoile pour garder, limites affichées au clic.
3. **Analyse de vidéo** : elle ne bloque plus jamais. Ce que dit la doc officielle TikTok (vérifié par un vrai appel) :
   l'oEmbed ne donne plus ni titre, ni auteur, ni miniature depuis octobre 2026, seulement le lecteur intégrable.
   L'aperçu est donc le lecteur officiel TikTok (vidéo, auteur, légende), et la légende, l'auteur, la couverture et les
   chiffres viennent de Nexscope (route documentée, en cache). **Testé en ligne sur tracktout.com** avec 5 vraies vidéos
   TikTok Shop France récentes (beauté, mode, animaux, maison, tech) : aperçu, analyse et version adaptée à chaque fois ;
   4 sur la légende seule, 1 sans texte (vidéo sans légende), chacune marquée comme telle avec un champ pour ajouter le
   texte. Résultat en blocs de couleur, 3 points, « Ouvrir dans le studio » ; inspirations en cartes à couverture.
4. **Gestionnaire** (remplace « Mes gains ») : copie du gestionnaire de boutique d'EtSmart, adapté à l'affilié :
   produits en cours avec statuts, échantillons (demandes, relances, réceptions), vidéos (lien, vues, ventes), commissions
   (saisie, import CSV, objectif, graphique), calendrier. Aucune donnée déplacée : les commissions et les vidéos restent
   dans les mêmes fiches, donc rien n'a pu se perdre. Les commissions restent dans Pro et Elite.
5. **Comparateur** : face-à-face avec « VS » animé, barres, couronnes, verdict de l'IA en une phrase et « Écrire mes
   scripts » sur le gagnant ; cartes à 3 ou 4 produits.
6. **Autres pages** : en-têtes à une phrase, explications retirées ou en info-bulle, images produit, états vides
   illustrés, apparitions légères.

| Vérification | Résultat |
| --- | --- |
| `npm run build`, `npm run lint` | ✅ |
| `npm test` | ✅ 448 tests (dont gestionnaire, comparateur, liens TikTok, analyse sans texte) |
| Playwright | ✅ 4 tests (inscription, lien formateur, paiement, studio) |
| axe (WCAG 2.1 AA), 390 et 1440 px | ✅ 0 violation sur 26 pages, plus les fenêtres et menus ouverts |
| Analyse en ligne (tracktout.com) | ✅ 5 vraies vidéos, compte de test supprimé ensuite |

À savoir :
- Domaines ouverts dans l'environnement de la session : `www.tiktok.com` (oEmbed) et `developers.tiktok.com` (doc).
  Netlify n'a pas de filtre sortant : rien à faire côté site.
- Le lecteur officiel TikTok et les couvertures n'ont pas pu s'afficher dans le navigateur de la session (domaines des
  serveurs d'images de TikTok non ouverts ici) ; en ligne, les couvertures se chargent (vérifié), et le lecteur est
  celui que TikTok fournit pour l'intégration.
- Nexscope ne connaît pas toutes les vidéos : sans légende ni chiffres, l'analyse se fait quand même, marquée « Sans
  texte ». Les liens courts (vm.tiktok.com) sont résolus par leur redirection ; pas de vrai lien court sous la main pour
  le tester en ligne (testé avec une redirection simulée).
- Le défilé de captures de l'accueil montre encore l'ancien « Mes gains » : relancer `npm run screenshots:landing` pour
  le mettre à jour.
- Stripe : toujours en attente de ta clé (voir la section précédente).

## Corrections : recherche, dashboard, récap, parrainage, accueil (14 novembre, décisions 205 à 210)

Six étapes, un commit chacune, toutes en ligne sur https://tracktout.com.

1. **Recherche** : chaque résultat ouvre une vraie fiche produit (créée à la volée à partir du résultat déjà reçu,
   sans nouvel appel payant), avec score et « pourquoi maintenant ». Sur chaque carte : « Écrire mes scripts »,
   l'étoile pour suivre, « Comparer » (au survol sur ordinateur, toujours visibles sur téléphone). Nom court et niche
   en français ; score sur chaque carte ; plus de ligne technique sur la source.
2. **Dashboard** : dashboard et gestionnaire ne font plus qu'un sur `/app` (onglet « Dashboard » ;
   `/app/gestionnaire` y renvoie). Profil et période en haut, une ligne de chiffres, produit du jour à côté de la
   courbe, onglets Produits en cours / Échantillons / Vidéos / Commissions / Calendrier, puis l'activité récente.
3. **Pleine largeur** : plus de largeur maximale dans l'appli, marges de 16 px (téléphone) et 32 px (ordinateur),
   colonnes en plus sur grand écran, textes longs à largeur de lecture. Vérifié à 390, 1 440 et 1 920 px.
4. **Récap** : « Ton récap du matin », l'aperçu de l'e-mail réel dans une boîte de réception à gauche, quatre
   réglages à droite (récap du matin, heure, bilan du dimanche, « M'envoyer un exemple maintenant »). Discord et
   notifications cachés tant qu'ils ne marchent pas ; plus de mention technique. E-mail refait : défi du jour, puis
   5 cartes produits (photo, nom court, score, commission par vente, tendance). Noms courts partout.
5. **Parrainage retiré côté utilisateur** (page, menus, accueil, CGV, compte, connexion, inscription) ; système
   formateur intact (codes, 30 %, espace formateur). Tables gardées, plus rien d'affiché ; un ancien code personnel ne
   rattache plus personne et ne crée plus de commission.
6. **Accueil** : captures du défilé refaites sur la nouvelle interface (« Récap du matin » à la place de « Mes
   gains », badge « Exemple » sur le dashboard).

| Vérification | Résultat |
| --- | --- |
| `npm run build`, `npm run lint` | ✅ |
| `npm test` | ✅ 456 tests (dont e-mail du récap, retrait du parrainage, fiches créées depuis une recherche) |
| Playwright | ✅ 4 tests (inscription, lien formateur, paiement, studio) |
| axe (WCAG 2.1 AA), 390 et 1 440 px | ✅ 0 violation : 11 pages de l'appli, 6 pages publiques, onglets et fenêtre du dashboard |
| Captures 390 / 1 440 / 1 920 px | ✅ `docs/captures/corrections/` (dashboard, recherche, récap), relues avant l'envoi |
| Recherche en ligne, 3 mots-clés (« parfum », « brosse », « calendrier ») | ✅ 10 fiches sur 10 ouvertes, 3 scripts écrits (10 accroches et 3 scripts chacun), suivi et comparateur OK ; compte de test supprimé |
| Aucune trace de « parrainage » | ✅ site en ligne (7 pages) et appli (16 pages) ; reste seulement dans le code interne et l'admin (« ancien lien d'invitation ») |
| Clés secrètes dans le code du navigateur | ✅ aucune (OpenAI, Stripe, Supabase) |

À savoir :
- **Capture de l'analyse de vidéo** : la pièce jointe n'est pas arrivée dans la session. La carte garde une capture
  de l'appli. Pour mettre la tienne : la poser dans `docs/landing/analyse.png` puis lancer
  `npm run screenshots:landing -- --sources` (recadrage et WebP 640 et 320 px automatiques), ou me la renvoyer.
- **Crédits Nexscope épuisés** (code 13011) : la recherche cherche alors dans le radar du jour et l'indique en une
  ligne. Le dernier relevé de nuit réussi date du 12 novembre : `/api/health` est « down » à cause de ces données de plus
  de 36 h (et de Stripe pas encore configuré sur Netlify). Recharger les crédits relance le relevé de nuit.
- Les photos des produits ne s'affichent pas dans les captures de l'accueil (leur hébergeur n'est pas joignable depuis
  l'environnement de capture) : visuels de repli à la place, comme avant. En ligne, les photos s'affichent.
- **Stripe** : les 4 variables (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET,
  STRIPE_PORTAL_CONFIGURATION) sont toujours à poser dans Netlify ; les paiements de test en ligne attendent ça. Après
  les tests, régénérer la clé secrète de test (elle est passée dans la conversation).

# Rapport de fin de V1 — Pépite

Date : 12 novembre 2026. Branche : `claude/kind-galileo-ardtih` (un commit par jalon, 9 jalons).

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
- **Récap du matin** : préparé à 4 h, e-mail React Email programmé à l’heure choisie (Resend), aperçu dans
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
| Données produits | 200 produits fictifs déterministes (`DATA_PROVIDER=mock`) | Brancher `lib/data/tiktok.ts` (API affiliés officielle) et/ou `lib/data/nexscope.ts` : les `TODO` disent quoi vérifier |
| Base et connexion | fichier local `.data/` | Clés Supabase + migrations (README §2) |
| Scripts | générateur simulé | `ANTHROPIC_API_KEY` |
| Paiement | simulé en local, désactivé sinon | Clés Stripe + `npm run stripe:setup` + webhook |
| E-mails | boîte locale (`/admin`) | `RESEND_API_KEY` + `EMAIL_FROM` |
| Bot Discord | code prêt, non lancé | `bot/README.md` |
| Vidéos qui vendent | fictives | Fournisseur de données payant (pas d’API officielle publique) |
| Vidéos postées | saisies à la main | Prévu ainsi en V1 |

**Non testé contre un vrai Supabase** : l’implémentation `lib/db/supabase.ts` n’a pas pu tourner contre une API
Supabase (pas de projet ni de Docker ici ; le téléchargement de PostgREST pour la tester a été refusé par
l’environnement). Le SQL, la RLS et les fonctions sont, eux, validés sur Postgres 16. À vérifier en premier
après branchement : inscription, onboarding, génération de script (fonction `increment_usage`), page parrainage
(jointure `referrals → profiles`), espace formateur (fonction `coach_student_stats`), suppression de compte.

## Clés à renseigner

| Variable | Où la trouver | Indispensable pour |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | Production |
| `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`) | console.anthropic.com | Vrais scripts |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (×4) | Stripe Dashboard + `npm run stripe:setup` | Paiement |
| `RESEND_API_KEY`, `EMAIL_FROM`, `FOUNDER_EMAIL` | resend.com | E-mails |
| `CRON_SECRET` | à générer (long, aléatoire) | Tâche nocturne en production |
| `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAILS` | ton domaine, ton e-mail | Production |
| `BOT_API_SECRET`, `NEXT_PUBLIC_DISCORD_INVITE_URL` (+ `bot/.env`) | à générer / Discord | Bot Discord |
| `DATA_PROVIDER`, `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_ACCESS_TOKEN`, `NEXSCOPE_API_KEY` | Partner Center TikTok Shop / fournisseur | Vraies données |

## Commandes

```bash
npm install && npm run seed && npm run dev      # tout en local, sans clé
npm run build && npm run lint && npm test        # vérifications
npm run test:e2e                                 # 3 parcours Playwright
npm run check:sql                                # migrations + RLS sur un Postgres jetable
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
7. **Aucun chiffre de marché affiché** (133 M€/trimestre, 70 % via les affiliés) faute de source citable ;
   à ajouter sur l’accueil avec leur source si tu en as une.
8. **Pas de statistique « 10× plus à partir de 20 vidéos »** affichée (non sourcée) : l’objectif de 20 vidéos est
   conservé sans promesse de multiplicateur.
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

# Décisions techniques et de design

Chaque décision prise sans pouvoir demander au fondateur, avec sa raison. Les plus récentes en bas.

## Jalon 1 — Fondations

1. **Next.js 14.2 (App Router) + React 18.3**, comme demandé. TypeScript strict. Node ≥ 20.19
   (exigé par Stripe, Resend et React Email dans leurs versions actuelles).
2. **Mode local sans aucune clé.** Si les trois clés Supabase ne sont pas toutes présentes, l'appli
   bascule automatiquement en mode local :
   - base de données = fichier JSON `.data/local-db.json` (implémentation `LocalRepo`) ;
   - connexion = lien magique simulé, affiché à l'écran (aucun e-mail ne part) ;
   - session = cookie signé HMAC-SHA256 (`lib/auth/local-session.ts`).
   Raison : la consigne exige que tout le parcours soit utilisable sans clé. Une seule interface
   (`Repo`, dans `lib/db/repo.ts`) sert les deux stockages, donc le reste du code ignore le mode.
3. **Le serveur accède à Supabase avec la clé service** et filtre explicitement sur l'utilisateur
   authentifié ; la **RLS protège tout accès direct** avec la clé anon (le navigateur ne lit jamais les
   tables). Raison : un seul chemin de code, testable en local, et les limites de plan sont
   appliquées côté serveur. La RLS reste une vraie barrière : un client ne peut lire que ses lignes,
   ne peut pas modifier son plan (droits par colonne), ne peut pas s'offrir des scripts
   (`increment_usage` réservée au rôle service) et ne peut pas lire le catalogue.
4. **Catalogue (`products`, `product_snapshots`) illisible côté client.** Sinon un compte gratuit
   pourrait lire tous les scores avec la clé anon et contourner la limite des 3 produits.
5. **Formateurs : vue agrégée par fonction SQL** (`coach_student_stats`, `coach_students`) en
   `security definer`. Le formateur n'a aucun droit de lecture sur `profiles` ; l'e-mail d'un élève
   n'apparaît que si l'élève a coché le consentement (`share_email_with_coach`).
6. **Types Supabase écrits à la main** (`lib/db/database.types.ts`) au format du générateur, faute
   de projet Supabase pour lancer `supabase gen types`. Commande de régénération dans le fichier.
7. **Migrations validées sur un vrai Postgres 16** avec un bouchon du schéma `auth`
   (`npm run check:sql`), y compris des tests RLS (un utilisateur, un formateur, un élève).
8. **Police : TikTok Sans**, disponible sur Google Fonts (licence OFL), auto-hébergée via
   `next/font/local` à partir du paquet fontsource (sous-ensemble latin, qui couvre le français,
   « œ » et « € »). Pas d'appel à Google au chargement, donc rien à déclarer côté RGPD.
9. **Couleurs et contraste AA.** Mesures faites (voir `app/globals.css`) :
   - `#8A8B91` sur blanc = 3,4:1, insuffisant pour du texte : il sert aux icônes et éléments
     décoratifs ; le texte secondaire utilise `#5F6068` (6,2:1).
   - `#FE2C55` avec du texte blanc = 3,7:1 : les boutons pleins utilisent `#E0144A` (4,8:1), le rose
     texte sur fond clair `#C8103F` (5,8:1). En sombre, `#FE2C55` passe (4,8:1 sur `#161823`).
   - Cyan `#25F4EE` illisible sur blanc (1,3:1) : variante texte `#00777A` (5,4:1) en clair, cyan pur
     en sombre (12,8:1).
   - Vert des gains : **aucune couleur unique ne peut dépasser 4,5:1 à la fois sur blanc et sur
     `#161823`** (c'est mathématiquement impossible). On garde donc la même teinte en deux
     luminosités : `#0E7A43` en clair (5,4:1), `#4ADE80` en sombre (10:1).
10. **Mode sombre** : suit `prefers-color-scheme`, forçable dans le compte. Le choix forcé est
    stocké dans un cookie lu par un petit script en tête de page (pas de flash, pages statiques
    conservées) et dans le profil.
11. **Onboarding rendu côté serveur, étape par étape** (`/bienvenue?etape=n`) : chaque étape est
    enregistrée immédiatement, rien n'est perdu si on ferme l'onglet, et ça marche sans JavaScript.
    L'explication du mode préparation s'affiche dès qu'une tranche < 1 500 est cochée (CSS `:has`).
12. **Codes de parrainage et codes formateurs partagent un seul lien** `/r/CODE` : le code est
    mémorisé 30 jours dans un cookie et appliqué à la création du compte, uniquement avant la fin de
    l'onboarding (un compte existant ne peut pas se faire « rattacher » plus tard).
13. **Pas de bannière cookies** : aucun outil d'analytique n'est ajouté ; seuls des cookies
    strictement nécessaires (session, code d'invitation, thème) sont posés.

## Jalon 2 — Données

14. **Fournisseur fictif déterministe** : 200 produits (beauté 46, maison 34, mode 30, tech 28, sport 26,
    animaux 20, bébé 16 — la beauté en tête comme en France). Chaque produit suit un cycle de vie
    calculé sur le **jour absolu** (montée, plateau, déclin, ou produit « de fond » stable), donc
    l'historique d'hier est exactement ce qu'on voyait hier. Les affiliés arrivent avec 3 à 14 jours
    de retard sur les ventes : un produit qui explose a peu de concurrence au début, comme en vrai.
15. **Croissance plafonnée pour un produit en baisse** : la consigne demande un percentile dans la
    niche, mais un produit en baisse pourrait alors prendre les 35 points s'il est « le moins pire ».
    Son point de croissance est donc plafonné à 50 % (17,5 pts). Testé.
16. **Saturation** mesurée en affiliés par vente quotidienne, sur une échelle logarithmique
    (≤ 0,1 affilié par vente/jour = 100 %, ≥ 10 = 0 %). **Prix** : 100 % dans 15–60 €, dégressif
    jusqu'à 8 € et 120 €. **Commission** : linéaire de 5 % (0) à 30 % (100 %).
17. **Tendance** : explose ≥ +50 % sur 7 jours, monte ≥ +12 %, stable au-dessus de −15 %, sinon baisse.
18. **Colonnes dénormalisées dans `products`** (dernier score, détail, tendance, 30 jours de ventes) :
    le radar se charge en une requête. `product_snapshots` garde l'historique jour par jour.
19. **Cron Vercel à 2 h et 3 h UTC** : Vercel ignore les fuseaux horaires ; seule l'exécution qui tombe
    à 4 h, heure de Paris, travaille (été comme hiver). Double exécution le même jour ignorée.
    Les deux tâches sont quotidiennes, donc compatibles avec le plan gratuit de Vercel.
20. **Mode local sans cron** : à l'ouverture du radar, base vide ⇒ seed automatique de 30 jours ;
    nouveau jour ⇒ rafraîchissement du jour. `npm run seed` ajoute des comptes de démonstration
    (formateur, 2 élèves, admin) en local uniquement.
21. **Récap du matin préparé sans appel d'API** : accroche et script du récap viennent du générateur
    simulé, mis en cache par produit et par nuit. Raison : maîtriser le coût (un appel Claude par
    utilisateur et par nuit n'est pas tenable en V1). Le studio, lui, utilise Claude.
22. **TikTok et Nexscope** : squelettes avec `TODO` précis (chemins d'API datés à vérifier, mapping
    des champs, identifiants de catégories). L'API affiliés TikTok ne donne ni historique par
    produit ni vidéos : la croissance retombe alors sur nos propres instantanés quotidiens.
23. **Visuels produits** : SVG générés par niche (pictogramme + fond doux), aucune image externe.

## Jalon 3 — Radar et fiche produit

24. **Les 3 produits du plan gratuit sont fixés pour la journée** (les 3 meilleurs scores de ses
    niches). Les filtres agissent sur ces 3 produits et ne débloquent rien d'autre. Les cartes
    verrouillées ne contiennent ni nom, ni identifiant, ni chiffre (vérifié par un test).
25. **Score masqué en gratuit, explication conservée** : la consigne demande à la fois de masquer
    le score et de toujours expliquer « pourquoi ce score ». Le gratuit voit les phrases, pas les
    nombres ni les points.
26. **Mini-courbes en SVG rendu côté serveur** ; Recharts uniquement pour la courbe 30 jours de la
    fiche (une seule instance par page). La couleur de la mini-courbe suit la tendance sur 7 jours
    (et non la pente du dernier point) pour ne jamais contredire le badge « Monte / Explose ».
27. **Pas de chiffre non sourcé** : la statistique « 10× plus à partir de 20 vidéos » n'est pas
    affichée (pas de source publique). L'appli pousse l'objectif de 20 vidéos sans promettre de
    multiplicateur.
28. **Message de demande d'échantillon** sans promesse de ventes : il s'engage sur un nombre de
    vidéos (3 en 10 jours), ce que l'affilié contrôle.

## Jalon 4 — Studio de scripts

29. **Sortie structurée** via `client.messages.parse` + `zodOutputFormat` (SDK officiel) :
    le schéma ne porte pas de contraintes numériques (toutes ne sont pas garanties par l'API) ;
    les règles métier (10 accroches, 3 scripts, 20–40 s, interdits) sont vérifiées ensuite et
    déclenchent **un seul** nouvel essai, avec la liste des problèmes dans le message. Après ce
    nouvel essai, les phrases encore fautives sont retirées et les manques complétés.
30. **Modèle** : `ANTHROPIC_MODEL`, `claude-sonnet-5-5` par défaut (consigne du fondateur),
    effort `medium` pour les scripts et `low` pour une accroche seule. Pas de bascule automatique
    vers un autre modèle en cas de refus : les catégories que ce mécanisme rattrape (cyber, IA)
    ne concernent pas des scripts marketing ; un refus renvoie un message clair.
31. **Le crédit est pris avant l'appel à Claude, de façon atomique** (fonction SQL
    `increment_usage`) et **rendu si la génération échoue**. Deux onglets ne peuvent donc pas
    dépasser la limite.
32. **Régénérer une accroche ne consomme pas de crédit**, mais c'est limité à 5 par script.
33. **Chaque génération est enregistrée** (c'est l'historique et le compteur visible par le
    formateur) ; « Garder ce script » la marque comme favorite. L'export texte est réservé au
    plan Pro+ et vérifié côté serveur.
34. **Garde-fou commun** (`lib/ai/guard.ts`) : promesses médicales, superlatifs non prouvés,
    gains et commissions. Le générateur simulé est testé contre ce garde-fou sur les 200 produits
    et les 5 formats. La ligne « #publicité » est ajoutée par le serveur, jamais laissée au modèle.
35. **« Déballage »** plutôt qu'« unboxing » dans l'interface (règle : mot français si possible).

## Jalon 5 — Paiement

36. **`lib/billing/` isole le prestataire** : interface `BillingProvider` (paiement, portail, essai,
    résiliation) + **événements normalisés** (`subscription`, `invoice_paid`, `checkout_completed`).
    `handleBillingEvent` ne connaît que ces événements. Passer à Lemon Squeezy ou Paddle =
    une nouvelle implémentation + sa fonction de normalisation, rien d'autre.
37. **Trois modes** : Stripe (clé présente) ; **simulation** (mode local uniquement, sans carte,
    via les mêmes événements normalisés, donc plan, essai et commissions se comportent comme en
    vrai) ; **désactivé** (Supabase configuré sans Stripe : message clair, aucun prélèvement).
    La simulation n'est jamais disponible en production.
38. **Webhooks robustes** : signature vérifiée ; pour les événements d'abonnement, l'état est
    relu chez Stripe (les webhooks peuvent arriver dans le désordre) ; traitement idempotent
    (upsert par identifiant, commission unique par facture) et événement marqué traité à la fin,
    pour qu'un échec soit réessayé par Stripe.
39. **Champs Stripe lus de façon défensive** : la période de facturation est lue sur la ligne
    d'abonnement (API récente) ou sur l'abonnement (ancienne API) ; l'abonnement d'une facture
    dans `parent.subscription_details` ou `subscription`.
40. **Essai formateur de 3 mois sans carte** : créé directement par l'API (`trial_period_days`,
    `missing_payment_method: cancel`) à la fin de l'onboarding, sans passer par une page de
    paiement. L'élève ajoute une carte quand il veut via le portail ; sinon il repasse en Gratuit,
    sans frais. Un seul essai par compte (`trial_used`).
41. **Commission calculée hors taxes** sur chaque facture payée (montant payé − taxes Stripe),
    au taux du formateur (30 % par défaut) ou 30 % pour un parrain classique. Les commissions
    sont « dues » ; leur versement reste manuel en V1 (voir RAPPORT).
42. **Plan effectif = meilleur abonnement actif** (`active`, `trialing`, `past_due`) : un
    impayé en cours de relance garde l'accès, comme le fait Stripe pendant ses relances.
43. **Changement de plan d'un abonné** : renvoyé vers le portail Stripe (à configurer pour
    autoriser le changement Pro ↔ Pro+), pour éviter deux abonnements en parallèle.
44. **Suppression du compte** : l'abonnement est résilié d'abord ; si la résiliation échoue, le
    compte n'est pas supprimé (sinon on continuerait à prélever un compte effacé).
45. **Pas de badge « le plus choisi »** (affirmation invérifiable) : « Recommandé ». Pas de
    mention « TTC » tant que le régime de TVA n'est pas connu (champ `[À COMPLÉTER]` des CGV).

## Jalon 6 — Mes produits, récap, Discord, parrainage

46. **Récap e-mail programmé par Resend (`scheduledAt`)** à l'heure choisie (heure de Paris, été
    comme hiver), pendant la tâche nocturne de 4 h. Aucun cron horaire n'est nécessaire, donc
    compatible avec le plan gratuit de Vercel. Rejouer la tâche ne renvoie pas un e-mail déjà
    programmé (statut par récap).
47. **Récap e-mail aussi pour le plan Gratuit** (avec ses 3 produits, sans score) : la consigne ne
    retire que Discord au Gratuit, et l'e-mail est le meilleur canal pour faire revenir chaque matin.
    En-tête `List-Unsubscribe` et lien vers les réglages dans chaque e-mail.
48. **Bot Discord découplé** : il n'a pas d'accès à la base, seulement aux routes `/api/bot/*`
    protégées par `BOT_API_SECRET`. Il interroge l'appli toutes les 5 minutes (récaps dus) et
    synchronise le rôle Pro toutes les 10 minutes. Seule l'intention `Guilds` est demandée
    (pas d'intention privilégiée) : les membres sont lus un par un par l'API.
49. **« 3 produits flous » dans le salon public** : une balise spoiler Discord se dévoile d'un clic,
    elle ne protège rien. Le salon public reçoit donc des noms **masqués côté serveur**
    (« Sérum ██████ », catégorie et tendance seulement) ; la liste complète va dans un salon
    réservé au rôle Pro.
50. **Code de liaison Discord** : 6 caractères, 15 minutes, usage unique, consommé de façon atomique ;
    un même compte Discord ne peut être lié qu'à un seul compte de l'appli.
51. **« Commence à baisser »** = tendance « baisse » ou −15 % sur 7 jours ; signalé sur la carte du
    produit suivi et en tête de « Mes produits ».
52. **Versement des commissions** : calculées automatiquement, versées par virement mensuel dès
    50 € cumulés (hypothèse business notée dans RAPPORT.md, à confirmer).

## Jalon 7 — Espace formateur et admin

53. **Espace formateur et admin hors de `/app`**, dans une coquille légère : ce sont des outils de
    pilotage, pas l'expérience quotidienne de l'affilié. Le formateur garde l'accès à l'appli.
54. **Le formateur ne voit que la vue agrégée** (prénom, plan, statut, nombre de scripts, produits
    suivis, dernière connexion, e-mail seulement avec consentement), y compris en mode local
    (même règle que la fonction SQL). Testé.
55. **Rôle formateur attribué à la main par l'admin**, avec code promo choisi (unicité vérifiée
    contre les codes formateurs **et** les codes de parrainage, qui partagent le lien `/r/CODE`).
56. **Admin désigné par `ADMIN_EMAILS`** ; en mode local sans valeur, `admin@tiktrend.local`. L'admin
    et les formateurs peuvent se connecter directement à leur espace sans passer par l'onboarding.
57. **État des services visible dans l'admin** (base, données, scripts, paiement, e-mails) pour savoir
    d'un coup d'œil ce qui est encore simulé.

## Jalon 8 — Site public

58. **Premier écran = le produit** : un aperçu du radar avec le vrai produit n°1 du jour (beauté qui
    monte, la catégorie n°1 en France), son score, sa courbe 14 jours et une accroche. Sur mobile,
    l'aperçu passe juste après le titre pour être visible sans défiler ; le bouton suit.
    C'est la seule animation d'entrée du site (courbe qui se trace, score qui monte, accroche qui
    s'écrit) ; avec « réduire les animations », tout s'affiche directement.
59. **Accueil régénéré toutes les heures (ISR)** : rapide et statique, il reprend le produit du jour
    du catalogue, ou calcule l'exemple à partir des données fictives si la base est vide. Mention
    « Produit fictif, données de démonstration » tant que `DATA_PROVIDER=mock`.
60. **Aucun chiffre de marché affiché** : les chiffres du brief (133 M€ par trimestre, 70 % via les
    affiliés) n'ont pas de source publique à citer ici. Règle appliquée : sourcé ou absent.
    À ajouter avec leur source si le fondateur en a une (voir RAPPORT).
61. **Pas de témoignages, pas de compteur d'utilisateurs, pas de logos clients**. La FAQ répond
    honnêtement à « Est-ce que je vais gagner de l'argent ? » : on ne promet rien.
62. **Mention d'indépendance vis-à-vis de TikTok** dans le pied de page et les mentions légales.
63. **Formulaire formateur** : validation Zod, champ piège anti-robot, enregistrement en base puis
    e-mail au fondateur (`FOUNDER_EMAIL`, sinon le premier `ADMIN_EMAILS`). Si l'e-mail échoue,
    la demande reste enregistrée et visible dans l'admin.
64. **Pages légales** avec des champs `[À COMPLÉTER : …]` surlignés (raison sociale, SIREN, TVA,
    médiateur, région Supabase, durées de conservation, versement des commissions). La plateforme
    européenne de règlement en ligne des litiges n'est pas citée (fermée en 2025).

## Jalon 9 — Finitions

65. **Audit d'accessibilité automatisé** (axe-core, WCAG 2.1 AA) sur 19 pages en clair et en sombre :
    corrigés une opacité qui faisait passer un chiffre sous 4,5:1, un lien image sans nom accessible
    (doublon retiré de l'ordre de tabulation) et un tableau défilant non focalisable. 0 violation.
66. **Mode sombre** vérifié page par page ; le bandeau « formateurs » de l'accueil (fond encre) prend la
    couleur de surface en sombre pour rester visible.
67. **Playwright** : un projet mobile (Pixel 7, Chromium), base dédiée remise à zéro à chaque run, serveur
    de production construit pour l'occasion. Le paiement passe par la simulation ; avec `E2E_STRIPE=1` et
    des clés de test, le même test passe par le vrai Stripe Checkout (carte 4242).
68. **Captures** : `npm run screenshots` (barres fixes remises dans le flux pour les captures pleine page) ;
    un jeu en JPEG est versionné dans `docs/captures/` pour le fondateur.
69. **`npm run stripe:setup`** crée les produits et les 4 prix (idempotent grâce aux `lookup_key`) et affiche
    les variables à copier, pour éviter les erreurs de saisie.
70. **Pages 404 et erreur en français**, sans excuses, avec une action ; `robots.txt` exclut l'appli,
    `sitemap.xml` liste les pages publiques.

## Refonte design — style EtSmart, couleurs TikTok

### Étape 1 — Tokens et typographie

R1. **Référence = le code d'EtSmart**, pas seulement les captures : le dépôt `elky431-debug/Etsmart` a
    été lu (`src/app/page.tsx`, `Logo.tsx`, `LanguageToggle.tsx`, `layout.tsx`). Les captures
    jointes ont été prises à environ 1 470 px de large (échelle 1,354 vérifiée sur l'en-tête de 64 px
    et le conteneur de 1 280 px) : on peut donc comparer au pixel près.
R2. **Quand une mesure du brief diverge du code EtSmart, la mesure d'EtSmart l'emporte**, parce que le
    brief demande une copie « au pixel près » et une comparaison visuelle aux captures. Écarts assumés :
    grand titre à 96 px en desktop (le brief disait jusqu'à 120 px, la capture mesure 96 px) ;
    graisse 700 (Sora s'arrête à 800, et EtSmart utilise 700) ; étiquettes en 12 px, interlettrage
    0,1 em ; cartes arrondies à 16 px, padding 20 px, carré d'icône de 40 px ; chiffres en 36 px.
R3. **Police Sora**, celle d'EtSmart (chargée chez eux par Google Fonts), **auto-hébergée** depuis le
    paquet fontsource (variable 100–800, sous-ensemble latin) : aucun appel à Google, rien à
    déclarer au RGPD. Sora n'a pas d'italique : comme sur EtSmart, l'italique de « chaque matin. »
    est synthétisé par le navigateur.
R4. **Noir par défaut partout**. Le thème clair existait et fonctionnait : il reste, en option dans le
    compte (« Sombre (par défaut) » / « Clair »), et ne suit plus le réglage du système.
R5. **Deux couleurs ajustées pour l'accessibilité**, que le brief exige aussi (« axe sans erreur ») :
    `--text-faint` passe de #5C5D63 (3,2:1 sur noir) à #7E7F85 (5,3:1) ; le fond des boutons roses est
    #E3174D (4,7:1 avec du blanc) au lieu de #FE2C55 (3,7:1). Visuellement, le rose reste le même ;
    #FE2C55 sert toujours aux accents, au dégradé et au halo.
R6. **Tokens du brief tels quels** (`--bg-elevated`, `--text-muted`, `--gradient`…) **plus des triplets
    RGB** pour Tailwind (`bg-raised`, `text-muted`…), afin que toute l'appli bascule sans réécrire
    chaque page. Les bordures (`border-line`, `border-line-strong`) utilisent directement
    `--border` / `--border-strong` (blanc à 8 % / 14 %).
R7. **Échelle typographique et arrondis Tailwind par défaut**, comme EtSmart (text-sm 14 px,
    text-8xl 96 px, rounded-xl 12 px…), au lieu de l'échelle maison précédente.

### Étape 2 — Composants

R8. **En-tête** copié d'EtSmart : fixe, 64 px, noir à 60 % flouté, bordure basse très fine,
    conteneur de 1 280 px, liens centrés en gris (blancs au survol), pastille de langue (globe cyan,
    « FR », chevron), « Se connecter » en texte, bouton « Commencer » rose. Menu mobile identique
    (bouton 36 px bordé, panneau flottant). La pastille de langue ouvre un petit menu « Français »
    (seule langue en V1) plutôt qu'un faux sélecteur inerte.
R9. **Logo** : le losange avec le décalage cyan / rose posée sur un halo radial flou, comme le « e »
    d'EtSmart, qui grossit et pivote légèrement au survol ; nom en deux tons (« Pé » blanc, « pite » en
    dégradé), coupe définie par `BRAND_SPLIT` dans `lib/brand.ts`.
R10. **Boutons** : tous arrondis à 12 px (8 px pour la petite taille de l'en-tête, comme EtSmart).
     Principal rose : monte de 2 px et allume `--glow-pink` au survol, flèche qui glisse de 4 px.
     Secondaire : transparent, bordure `--border-strong`, fond `--bg-subtle` au survol.
R11. **Cases et champs** : accent cyan (case cochée cyan, bordure cyan au focus) au lieu du noir.

### Étape 3 — Constellation et animations

R12. **Constellation sur `<canvas>`** : EtSmart pose ses formes en `div` fixes ; on garde exactement sa
     composition (positions en %, tailles) mais dessinée sur un canvas pour pouvoir l'animer sans coût :
     dérive sinusoïdale de 3 à 8 px sur 20 à 40 s par forme, parallaxe lissée à la souris (pointeur
     précis et ≥ 1 024 px), pause quand l'onglet est caché **et** quand le héros sort de l'écran
     (IntersectionObserver), dessin fixe si « réduire les animations ». Formes en blanc à 7–15 %,
     halos cyan et rose en CSS (flou très large) derrière le titre.
R13. **Motion** (`motion/react`, successeur de Framer Motion qu'utilise EtSmart). Séquence du héros
     en 1,4 s : pastille 400 ms, mots décalés de 60 ms, « chaque matin. » qui glisse avec un flou qui se
     dissipe, sous-titre, boutons, mention. Le titre complet est aussi présent en texte masqué pour
     les lecteurs d'écran (les mots animés sont `aria-hidden`), pour éviter une lecture hachée.
R14. **Comptage des chiffres** : rendu serveur avec la valeur finale (lisible sans JavaScript), remis à
     0 au chargement puis compté en 1,2 s à l'entrée à l'écran, une seule fois.
R15. **Aperçu du radar qui défile** : 5 produits (le meilleur produit qui monte dans 5 niches, beauté
     en premier), un toutes les 3 s, effet de décalage du score à chaque changement. Comme le contenu
     change tout seul et en continu, il se met en pause au survol et au focus, et un bouton
     « Pause / Lecture » est fourni (critère WCAG 2.2.2). Pas de défilement automatique si « réduire
     les animations ». Courbe cyan avec remplissage en dégradé cyan → transparent.

### Étape 4 — Accueil

R16. **Structure du brief** : héros (pastille, titre, sous-titre, deux boutons, mention, aperçu du
     radar), bandeau de chiffres, « TOUT-EN-UN » (TROUVER / VENDRE, 4 cartes chacun), « Comment ça
     marche » (01, 02, 03 en grand et en dégradé, reliés par une ligne en dégradé comme EtSmart),
     tarifs, bloc formateurs à halo rose, FAQ en accordéon, pied de page. La section « studio en
     démonstration » de la V1 disparaît (absente du brief).
R17. **Titre sur trois lignes à 96 px** : le texte de TikTrend est plus long que celui d'EtSmart ; le
     conteneur du héros passe de 896 à 1 024 px pour garder trois lignes comme sur la capture.
     Mesures à 1 440 px : pastille à 100 px du haut (101 sur la référence), boutons à 632 px (637),
     mention à 712 px (712).
R18. **Interlignes corrigés** : EtSmart est en Tailwind 4, où `leading-tight` l'emporte sur la taille
     responsive ; en Tailwind 3, `md:text-5xl` l'écrasait. On écrit taille et interligne ensemble
     (`md:text-8xl/[1.05]`, `md:text-5xl/tight`) pour retrouver les interlignes de la capture.
R19. **« Recommandé » et non « Le plus choisi »** sur le plan Pro : TikTrend n'a pas encore
     d'abonnés, l'affirmation serait fausse, et la règle n° 2 de `CLAUDE.md` (aucun faux chiffre ni
     fausse preuve sociale) n'a pas été levée par le brief. À changer en une ligne
     (`components/pricing/pricing-cards.tsx`) quand ce sera vrai.
R20. **« Un seul outil pour tout automatiser. »** est conservé (texte du brief), avec un sous-titre
     qui précise ce qui est automatisé (« tout le travail avant de filmer ») : TikTrend ne publie jamais
     à la place de l'affilié.
R21. **Repli sans JavaScript** : les éléments qui apparaissent au défilement sont rendus côté serveur
     avec une opacité nulle ; une règle `<noscript>` les rend visibles si JavaScript est désactivé.
R22. **Espaces insécables avant « : » et « ? »** dans les textes de l'accueil (typographie française).

### Étape 5 — Appli et autres pages

R23. **Mêmes tokens partout**, sans réécrire chaque page : fond noir, cartes `--bg-elevated`, bordures
     fines, boutons roses, accents cyan (navigation active, cases cochées, focus, graphiques).
R24. **Pas de constellation dans l'appli** : seulement un halo très léger (cyan à gauche, rose à droite)
     en haut de page, aussi sur la connexion, l'onboarding et les espaces formateur et admin.
R25. **Cartes du radar** au style des cartes de fonctionnalités (bordure dégradée et montée au
     survol) ; le produit n°1 a une bordure dégradée permanente et un halo cyan.
R26. **Barre du bas mobile** noire à 80 % floutée, icône active en cyan (et non plus rose).
R27. **Recharts** : ventes en cyan avec remplissage dégradé cyan → transparent, affiliés en pointillés
     gris, grille blanche à 6 % ; barres d'inscriptions de l'espace formateur en dégradé cyan.
     Barres de progression (objectif 20 vidéos, onboarding) en dégradé cyan → rose.
R28. **Pages Prix et Formateurs** : en-têtes EtSmart (étiquette + titre sur deux lignes en dégradé),
     cartes de fonctionnalités pour les avantages formateur, halo rose.

### Étape 6 — Vérifications

R29. **Audit axe** (WCAG 2.1 AA) sur le site, l'appli, l'onboarding, les espaces formateur et admin,
     en mobile et desktop, en thème noir et en thème clair, après défilement complet (pour que les
     éléments animés soient visibles). Deux corrections : le sélecteur de langue avait un nom
     accessible qui ne contenait pas « FR » ; en thème clair, l'étiquette de catégorie à 70 % d'opacité
     tombait à 3,05:1 (pleine opacité dans ce thème). 0 erreur ensuite.
R30. **Captures** : le script défile désormais toute la page avant la capture et remet les barres fixes
     dans le flux ; le noir est le thème par défaut, `--theme light` pose le cookie du thème clair.
     `docs/captures/` est entièrement régénéré au nouveau design.
R31. **Comparaison aux références** : deux images côte à côte (capture EtSmart ramenée à l'échelle
     CSS, TikTrend à 1 440 px) pour le haut de page et la section « TOUT-EN-UN ».

## Session 3 — Brancher TikTrend au réel

### Étape 1 — Supabase pour de vrai

71. **Aucune clé Supabase dans cet environnement** : rien n'a pu tourner contre une vraie base. Tout est
    prêt pour que deux commandes suffisent une fois les clés posées : `npm run db:setup` puis
    `npm run test:integration`. La documentation de Supabase (site non joignable d'ici) a été lue dans son
    dépôt officiel (`supabase/supabase`, spécification de la CLI) et dans les types de `@supabase/supabase-js`.
72. **Migrations par `npm run db:setup`** avec une variable dédiée, `SUPABASE_DB_URL` : la clé `service_role`
    passe par l'API REST et ne permet pas de créer des tables. La chaîne de connexion n'est lue que par ce
    script, jamais par l'appli, et ne va pas dans Vercel. Avec `psql`, le mot de passe passe par les variables
    libpq (`PGPASSWORD`…), jamais en argument de commande ; sans `psql`, la CLI `supabase@3`
    (`db push --remote=<url> --include-all --yes` : `--db-url` est déprécié en v3). Les migrations sont
    écrites pour être rejouables, donc relancer la commande ne casse rien.
73. **Types générés** par `supabase gen types --remote=<ref>` quand `SUPABASE_ACCESS_TOKEN` est là (API de
    gestion, sans Docker), sinon depuis l'URL de la base. Un échec n'arrête pas la mise en place : les types
    écrits à la main restent, et le client est volontairement peu typé (les lignes sont converties en types
    métier dans `lib/db/supabase.ts`).
74. **Tests d'intégration séparés** des tests unitaires (`vitest.integration.config.ts`,
    `playwright.integration.config.ts`, lancés par `scripts/test-integration.mjs`). Sans clés, la commande dit
    lesquelles manquent et ne lance rien (sortie 0) ; `INTEGRATION_REQUIRED=1` la fait échouer, pour une CI.
    Les tests écrivent dans la vraie base : comptes `itest-<aléa>-…@example.com` (domaine réservé), produits
    `itest-<aléa>-…`, tout est supprimé à la fin. **Aucun e-mail n'est envoyé** : le lien magique est généré
    côté admin (`auth.admin.generateLink`) puis validé par `token_hash`, exactement le chemin du modèle
    d'e-mail du README.
75. **RLS testée avec de vrais comptes** connectés par la clé anon (comme un navigateur qui contournerait
    l'appli) : deux utilisateurs et un formateur. On vérifie les lectures croisées, les colonnes interdites
    (plan, formateur), le catalogue fermé, le compteur d'usage réservé au serveur, et la vue formateur
    agrégée (e-mail seulement avec consentement).
76. **Corrections de `SupabaseRepo` trouvées à la relecture** : un détail de score absent s'écrit `{}` (colonne
    `jsonb not null`) et les ventes estimées sont arrondies avant d'aller dans des colonnes entières (un vrai
    fournisseur renvoie des décimales). Le reste (jointure `referrals → profiles`, fonctions
    `increment_usage` et `coach_student_stats`, suppression en cascade) est couvert par les tests.
77. **`npm run seed` avec un fournisseur réel** fait un vrai rafraîchissement et ne charge jamais les 30 jours
    fictifs : une base de production ne doit pas contenir de produits inventés. `-- --fictif` force l'ancien
    comportement pour une base de démonstration.

### Étape 2 — La vraie source de données

78. **API côté créateur de TikTok Shop : pas ouverte en France à ce jour.** La page officielle « Affiliate Creator
    API overview » (mise à jour le 2026-09-21) dit : « Affiliate APIs are currently not available in the UK and EU
    markets. » La même note figure sur les pages des API affiliés côté vendeur et partenaire (TAP). Le guide
    d'autorisation des créateurs ne liste pas la France, l'API est « inactive par défaut » et s'active avec un
    responsable de compte TikTok. L'adaptateur est quand même écrit selon la doc, prêt si TikTok ouvre l'accès ;
    pour la France, **Nexscope est la source réaliste aujourd'hui**. Le site du Partner Center n'étant pas
    joignable d'ici, la doc a été lue dans des copies datées des pages officielles (dépôts GitHub publics) ; la
    signature a été vérifiée sur l'exemple chiffré officiel (test unitaire).
79. **TikTok : `POST /affiliate_creator/202405/open_collaborations/products/search`**, 20 produits par page (le
    maximum), tri `units_sold` décroissant, jeton du créateur dans `x-tts-access-token`. Le filtre `category.id`
    n'accepte que le premier niveau et aucun point d'accès côté créateur ne liste les catégories : la
    correspondance niche → catégorie se règle par `TIKTOK_CATEGORY_MAP` ; sans elle, recherche générale puis
    classement par le nom de catégorie renvoyé (`category_chains`). Correspondance : `title` → nom, plus bas
    `sales_price.minimum_amount` → prix (euros seulement), `commission.rate` en centièmes de pour cent → taux,
    `shop.name`, `main_image_url`, catégories → description, `units_sold` (cumul, absent si le créateur n'a pas
    autorisé le partage précis) → ventes du jour par différence d'une nuit à l'autre. Produits hors France, hors
    stock, sans prix, sans commission ou hors de nos niches : écartés et comptés.
80. **Ce que TikTok ne fournit pas reste vide** : nombre d'affiliés, échantillon gratuit (seulement par créateur,
    via un autre point d'accès qui demande son jeton : prévu plus tard), historique, vidéos qui vendent.
    L'autorisation OAuth des créateurs et le suivi des commandes affiliées sont seulement préparés
    (`lib/data/tiktok-creator.ts` : interfaces et adresses officielles, rien de branché).
81. **Nexscope : `tiktok-product-discovery`** (données FastMoss) plutôt que `tiktok-product-search` : c'est le seul
    des deux qui documente le nombre de créateurs (`totalIflCnt`), le nom de la boutique et une commission en
    décimal ; `tiktok-product-search` n'a ni boutique ni nombre de créateurs, et ne dit pas l'unité de sa
    commission. Une recherche par niche (nom anglais de la catégorie TikTok de premier niveau, que Nexscope
    convertit), région FR, tri `day7_units_sold`, 10 produits par page. Doc lue dans le dépôt officiel
    `nexscope-ai/nexscope-ecommerce-api` (copie du 2026-09-10 ; nexscope.ai n'est pas joignable d'ici).
82. **Lecture prudente de Nexscope**, parce que sa doc prévient que les exemples de réponse ne sont « pas encore
    réconciliés » avec l'enveloppe actuelle : on cherche `products` sous `data`/`result` comme le fait son propre
    client ; succès seulement si `code === 0` ; une devise absente vaut l'euro (région FR demandée), une autre est
    écartée ; une commission supérieure à 1 est lue comme un pourcentage (les unités varient d'un point d'accès
    Nexscope à l'autre). Pas d'historique jour par jour : croissance = 7 derniers jours contre la moyenne
    hebdomadaire des jours 8 à 28 (`totalSale28dCnt`), jusqu'à ce que nos propres relevés suffisent (10 jours).
    Les vidéos (`tiktok-video-search`, 10 meilleurs produits) ne gardent que la description, les vues et les
    ventes : jamais le pseudo ni l'avatar du créateur.
83. **Choix du fournisseur** : `DATA_PROVIDER=auto` par défaut (TikTok si ses clés sont là, sinon Nexscope, sinon
    fictif) ; une valeur explicite l'emporte. La nuit, l'ordre d'essai est : le fournisseur choisi, Nexscope en
    repli s'il a sa clé, puis les données fictives.
84. **Limites de requêtes** (`lib/data/http.ts`, commun aux deux) : file d'attente avec débit maximum
    (`DATA_RATE_PER_SECOND`, 1 par défaut, Nexscope disant de ne pas supposer plus) ; reprise sur 429, 5xx et
    codes « trop de requêtes » (TikTok 36009002, Nexscope 13012 et 13013) en respectant `Retry-After`, sinon
    1 s, 2 s, 4 s, 4 essais au plus ; un délai dépassé n'est pas rejoué (issue incertaine, appel peut-être
    facturé). Quota par nuit `DATA_MAX_CALLS_PER_NIGHT` (60 par défaut) : au-delà, on garde ce qui est lu. Cache
    des réponses en base (`provider_cache`, 20 h) : relancer la tâche le même jour ne repaie rien. Les clés de
    cache et les messages d'erreur ne contiennent jamais de secret (testé).
85. **Champs inconnus = vides, et l'affichage s'adapte** : affiliés, échantillon, ventes du jour et cumul sont
    nullables en base (migration rejouable `20261113000100_vraies_donnees.sql`). Sans affiliés : la ligne et la
    courbe pointillée disparaissent. Échantillon inconnu : pas de badge, filtre masqué, et la fiche dit de vérifier
    dans l'appli TikTok Shop. Croissance pas encore mesurable : badge « Tendance en mesure ». Courbe : tracée à
    partir de deux relevés. Boutique ou description absentes : rien d'inventé.
86. **Score avec des critères manquants** : un critère indisponible est ignoré et son poids réparti au prorata
    sur les autres (le total reste sur 100), avec une phrase qui le dit. Fait dès cette étape parce que les vraies
    sources en ont besoin pour fonctionner ; la calibration vient à l'étape 3.
87. **Images** : `next/image` n'accepte que les domaines de `config/image-hosts.mjs`, c'est-à-dire ceux vus dans
    la doc officielle (`*.ibyteimg.com`, `*.tiktokcdn-us.com` ; Nexscope n'en documente aucun), plus
    `IMAGE_HOSTS`. Une image d'un autre domaine est retirée dès l'import et son domaine listé dans l'admin ; une
    image qui ne charge pas est remplacée par le visuel SVG de la niche.
88. **Repli nocturne et jamais de fictif présenté comme réel** (`lib/catalog.ts`) : si la source réelle échoue,
    la tâche passe à la suivante, l'écrit dans les journaux (`console.error`, sans secret) et dans l'historique
    (`repli`, encadré rouge dans l'admin). Le radar montre toujours les derniers vrais relevés s'il en existe,
    jamais les fictifs écrits en repli ; au-delà de 36 heures il affiche « Données du [date] », les récaps ne sont
    pas préparés et le bot ne publie pas les salons du jour. Les produits fictifs ne sont montrés qu'en l'absence
    de tout vrai relevé, avec la mention « produits fictifs » (radar, fiche, récap, Discord, aperçu de l'accueil).
89. **Réponses d'exemple pour les tests** (`tests/fixtures/`) : construites à partir des exemples officiels
    (adaptés à la France et à l'euro), faute de clé pour enregistrer une vraie réponse ; chaque fichier le dit dans
    un champ `_source`. Noms fictifs, aucune donnée personnelle.
90. **Mode local avec une source réelle** : le premier remplissage fait un vrai relevé (pas 30 jours fictifs), et
    une seule tentative par jour, pour ne pas rappeler une source en panne à chaque page affichée.

### Étape 3 — Recalibrer le score

91. **Pas de données réelles ici** : la distribution a été mesurée sur 7 jours × 200 produits fictifs, et sur trois
    scénarios qui imitent les vraies sources : Nexscope (sans échantillon), TikTok le premier jour (prix et
    commission seulement), TikTok après dix jours (sans affiliés ni échantillon). **Avant** : scores de 15 à 95,
    médiane 52 et moitié centrale tassée entre 41 et 64 ; jusqu'à 100 quand des critères manquent ; tendances
    « explose » 9 %, « monte » 14 %, « stable » 41 %, « baisse » 36 %. `npm run score:distribution` refait la mesure
    sur la vraie base (7 jours par défaut) : à relancer après deux semaines de vraies données.
92. **Échelle du jour, de 15 à 90** : chaque nuit, les points (0 à 100) sont étalés entre le 2e et le 98e centile
    du catalogue, de 15 à 90 ; sur moins de 20 produits ou des points trop resserrés (moins de 10 d'écart), échelle
    fixe 15 + 0,75 × points. Une échelle relative au jour ne dépend ni de la source ni des critères disponibles,
    et garde l'ordre des produits. **Après** : 100 % des scores entre 15 et 90 dans les quatre scénarios, médiane de
    48 à 57, 5e centile de 19 à 21, 95e de 84 à 87. Les points de chaque critère ne changent pas : la fiche montre
    le total des points à côté du score et explique l'échelle.
93. **Seuils de tendance** : « explose » à partir de +40 % sur 7 jours **et** au moins 5 ventes par jour (sinon
    « monte » : deux ventes qui passent à cinq ne sont pas une explosion), « monte » à partir de +10 %, « stable »
    au-dessus de −20 %, « baisse » en dessous. Sur les fictifs, 10 % des fenêtres dépassent +42 %. Résultat :
    « explose » 9,5 %, « monte » 14 %, « stable » 46 %, « baisse » 30 %.
94. **Critères manquants expliqués dans la fiche** : encadré « Calculé sans l’échantillon gratuit et le nombre
    d’affiliés, faute de donnée pour l’instant », mention « non fourni » sur la ligne, phrase qui dit quoi vérifier,
    et le poids réellement appliqué (par exemple commission sur 35,7 au lieu de 25).
95. **Paliers d'étiquette gardés** (« Très forte opportunité » à partir de 75, etc.) : sur la nouvelle échelle,
    environ 14 % des produits sont « très forte », ce qui garde l'étiquette rare.

### Étape 4 — Les chiffres de marché, sourcés

96. **Trois chiffres, rien d'autre** (`lib/market.ts`, section « Le marché » de l'accueil, juste après le bandeau) :
    132,8 M€ de ventes en France sur 90 jours au 9 juillet 2026 et 69,9 % de ventes affiliées (France, Allemagne,
    Espagne et Italie réunies), source Lengow ; 7,19 $ puis 74,07 $ de ventes moyennes par vidéo, étude américaine
    de Flywheel et Reacher sur 1,5 million d'échantillons, source Digiday. Chaque carte porte le périmètre, le lien
    et la date. Aucune phrase de gain autour, et pas de « 10 fois plus » calculé à partir des deux montants.
97. **Vérification des sources** : lengow.com et digiday.com ne sont pas joignables d'ici. Par la recherche web,
    Lengow confirme les deux chiffres (estimations Kalodata, 90 jours jusqu'au 9 juillet 2026, 69,9 % pour les
    quatre pays réunis). Les montants de Digiday et la date de l'article (14 octobre 2026) sont confirmés par un
    article qui le cite (Parasocial Magazine), pas par la page de Digiday elle-même : à relire avant la mise en
    ligne.
98. **Titre « TikTok Shop, en trois chiffres. »** et non « en France » : deux chiffres sur trois portent sur
    l'Europe ou les États-Unis. Liens externes dans un nouvel onglet, annoncé aux lecteurs d'écran.

### Étape 5 — Prêt pour Vercel

99. **Une seule tâche planifiée, à 3 h UTC** (`vercel.json`) : 4 h à Paris l'hiver, 5 h l'été. La route ne vérifie
    plus l'heure de Paris (elle aurait sauté l'été) ; elle ne refait pas le travail si une tâche a déjà réussi le
    jour même, sauf avec `?force=1`. Vercel envoie `Authorization: Bearer <CRON_SECRET>` tout seul. Les textes
    « à 4 h » de l'interface deviennent « chaque nuit » ou « ce matin », vrais en toute saison. La réponse de la
    route ne renvoie plus le détail brut d'une erreur (il reste dans l'historique de `/admin`).
100. **`NEXT_PUBLIC_SITE_URL` partout où une adresse sort de l'appli**, vérifié : redirection du lien magique et
     de Google vers Supabase (`emailRedirectTo`, `redirectTo`), retours de Stripe Checkout et du portail, adresse du
     webhook (affichée par `npm run stripe:setup`), liens des e-mails (récap, désinscription, candidature
     formateur), liens envoyés au bot Discord, plan du site, métadonnées. Seule exception volontaire : après la
     connexion, `/auth/callback` redirige sur l'hôte de la requête, parce que les cookies de session viennent d'y
     être posés (rediriger vers un autre domaine les perdrait).
101. **`/api/health`** : base (requête réelle, 8 s au plus), fournisseur choisi et présence de ses clés (sans dire
     lesquelles), dernière tâche, date du relevé affiché. « down » (503) si la base ne répond pas ou si le relevé a
     plus de 36 heures ; « degraded » (200) pour un repli, une tâche en erreur, des produits fictifs en production
     ou une adresse du site restée sur localhost. Ni secret, ni message d'erreur brut (testé avec de fausses clés et
     une erreur de connexion qui contient un nom d'hôte).
102. **Liste de vérification de mise en ligne** dans le README, dans l'ordre demandé : variables Vercel, domaine,
     Supabase, Stripe, Resend, tâche nocturne testée. `SUPABASE_DB_URL` ne va jamais sur Vercel : elle ne sert
     qu'aux migrations, depuis un poste.

## Générateur de scripts indépendant du fournisseur d'IA

103. **`AI_PROVIDER=openai` ou `anthropic`**, un adaptateur par fournisseur (`lib/ai/providers/`) derrière une
     interface `ScriptModel` (générer, régénérer une accroche, traduire une erreur). Tout le reste est commun
     (`lib/ai/scripts.ts`) : schéma Zod, nouvel essai unique si le JSON est invalide ou enfreint les règles, liste
     des interdits, mise en forme, ligne #publicité. Sans `AI_PROVIDER`, Claude si sa clé est là, sinon OpenAI ; la
     clé du fournisseur choisi absente ⇒ générateur simulé (jamais l'autre fournisseur en douce).
104. **OpenAI d'après sa documentation officielle actuelle** : paquet `openai` 7.55.0 (README, exemple officiel
     `examples/responses/structured-outputs.ts`, types du paquet ; platform.openai.com n'est pas joignable d'ici).
     Responses API : `client.responses.parse({ model, instructions, input, text: { format: zodTextFormat(…) } })`,
     JSON Schema strict tiré du même schéma Zod que pour Claude, résultat dans `output_parsed`. Le SDK lève
     l'erreur de Zod si le JSON ne passe pas le schéma : traitée comme une sortie invalide (nouvel essai), pas comme
     une panne. Réponse coupée (`status: 'incomplete'`) : `output_parsed` vaut null, nouvel essai. Refus (contenu
     `type: 'refusal'`) : message clair, sans nouvel essai. `store: false` : la demande (prénom, phrase d'exemple)
     n'est pas gardée dans l'historique d'OpenAI. Pas de paramètre `reasoning` : il n'existe pas sur tous les
     modèles, et `OPENAI_MODEL` peut en désigner n'importe lequel.
105. **Modèle par défaut `gpt-5.5`** (remplacé par `gpt-6-luna`, décision 115) : celui des exemples du SDK officiel. Rien d'autre n'est supposé ; il se
     change par `OPENAI_MODEL`, et une erreur « modèle introuvable » ou « paramètre refusé » le dit en français.
106. **`scripts.source` accepte `openai`** (migration rejouable `20261113000200_scripts_openai.sql`), pour savoir
     quel fournisseur a écrit chaque script.
107. **Qualité du français vérifiée sur 3 vraies générations** (`npm run ai:sample`, `gpt-5.5`, un vrai produit
     Nexscope et deux fictifs, trois formats et trois styles). Premier passage
     (`docs/exemples-scripts/2026-11-12-openai-avant-reglage.md`) : français naturel, tutoiement, phrases courtes,
     accroches de 8 mots au plus, aucun interdit, caractéristiques tirées des fiches seulement ; deux défauts à la
     relecture humaine : hashtags anglais (#skincarefr, #airfryer, #kbeauty) et « le lien dans le panier orange ».
     **La consigne a été précisée** (hashtags en mots français, « c'est le produit qui est dans le panier
     orange ») et la relecture automatique les repère désormais. Second passage
     (`docs/exemples-scripts/2026-11-12-openai.md`) : les deux défauts ont disparu ; reste une accroche au
     vouvoiement sur 30 (« Je vous montre sans blabla »), signalée par la relecture automatique, volontairement
     non bloquante (un nouvel essai complet pour une accroche coûterait trop cher ; l'utilisateur la régénère).
108. **Proxy de cet environnement** : le `fetch` de Node n'y passe par le proxy qu'avec `NODE_USE_ENV_PROXY=1`
     (lancer `npm run ai:sample` ainsi ici). Rien à faire sur Vercel.

## Premières vraies clés (12 novembre 2026, même jour)

109. **Clés gardées dans `.env.local` uniquement** (ignoré par git, droits 600), jamais dans un commit ni dans un
     journal. Un environnement cloud dédié, « TikTrend », n'ouvre que les trois hôtes utiles :
     `sxulrykxovyfdzgywoah.supabase.co`, `api.nexscope.ai`, `api.openai.com`. Les tests unitaires et les parcours
     Playwright forcent le mode local (clés vidées dans `vitest.config.ts` et `playwright.config.ts`) : ils ne
     touchent jamais la vraie base et ne font aucun appel payant.
110. **Supabase joignable, tables absentes** : les migrations n'ont pas encore été appliquées au projet, et
     `SUPABASE_DB_URL` (mot de passe de la base) n'a pas été fourni. Rien n'est écrit dans la base en attendant.
111. **Nexscope, écarts entre la doc et la vraie réponse**, corrigés et couverts par une réponse réelle enregistrée
     (`tests/fixtures/nexscope-tiktok-product-discovery.reel.json`, noms de boutiques remplacés) : devise « € » et
     non « EUR » (tous les produits étaient écartés) ; catégorie en chemin (« Beauty & Personal Care -> Skincare ->
     Toners\t ») ; `totalSale1dCnt` à 0 pour des produits qui vendent des centaines d'unités par jour, donc ventes du
     jour = moyenne des 7 derniers jours ; images servies par `agent-files.linkfox.com` (prestataire de Nexscope),
     ajouté aux domaines autorisés ; l'enveloppe `{ code, msg, data: { products } }` et les noms de catégories
     anglais sont confirmés (`matchedCategoryNamePath`).
112. **Garde-fous tirés du premier vrai relevé** (70 produits, une page par niche) : commission 0 = pas de commission
     affiliée, écarté ; commission entre 0,8 et 1 inclus = ambiguë (1 = 100 % est impossible, TikTok plafonne à
     80 %), écarté plutôt qu'inventé ; aucun créateur **et** aucune vidéo = écarté (fiches anormales : titre anglais,
     catégorie incohérente, et elles prenaient tous les points de concurrence). Un produit arrivé dans la semaine
     (aucune vente avant) n'a plus de « +100 % » : sa croissance attend nos relevés. Une croissance au plafond
     s'affiche « +500 % et plus ». Une relance le même jour ne laisse plus traîner les produits qu'elle a écartés
     (le radar ne garde que la dernière exécution). Reste : 62 vrais produits sur les 7 niches, scores de 15 à 90
     (médiane 53).
113. **Tendances sur ce premier relevé : 56 % « explose »**, parce que la recherche prend les meilleures ventes sur
     7 jours, à six semaines de Noël (croissance médiane +66 %). Les seuils ne sont pas changés sur un seul relevé
     aussi orienté : à recalibrer avec `npm run score:distribution` après une à deux semaines de relevés (3 pages par
     niche).
114. **Affichage des vrais titres** (souvent 150 à 250 caractères) : image produit toujours carrée (un long titre
     l'étirait), titre de la carte n°1 limité à 3 lignes, titre de la fiche plus petit au-delà de 80 caractères ;
     « Ventes par jour » quand il n'y a qu'un relevé, et la légende de la courbe n'apparaît qu'avec la courbe.

115. **`OPENAI_MODEL` par défaut : `gpt-6-luna`** au lieu de `gpt-5.5` (qui avait été pris dans les exemples du SDK,
     et non comme le moins cher, ainsi que demandé). Documentation officielle lue sur developers.openai.com le
     12 novembre 2026 (pages des prix et de chaque modèle) ; prix par million de jetons, entrée puis sortie, des
     modèles qui gèrent les sorties structurées :

     | Modèle | Entrée | Sortie | Statut |
     | --- | --- | --- | --- |
     | `gpt-5-nano` | 0,05 $ | 0,40 $ | déprécié |
     | `gpt-4.1-nano` | 0,10 $ | 0,40 $ | arrêté (« Shut down ») |
     | **`gpt-6-luna`** | **0,10 $** | **0,50 $** | **en service, le moins cher** |
     | `gpt-5.4-nano` | 0,20 $ | 1,25 $ | déprécié |
     | `gpt-5.6-luna` | 0,20 $ | 1,20 $ | en service |
     | `gpt-5.5` | 5 $ | 30 $ | en service |

     Un modèle déprécié ou arrêté ne peut pas servir de défaut (il cessera de répondre). `gpt-6-luna` raisonne par
     défaut à l'effort « medium » : ses jetons de raisonnement sont facturés en sortie et inclus dans la mesure.
116. **Comparaison du français, `npm run ai:sample`** (mêmes 3 produits, formats et styles) :
     - **coût mesuré** de `gpt-6-luna` : environ 1 300 jetons en entrée et 3 700 à 3 950 en sortie (dont environ
       2 000 de raisonnement), soit **0,002 $ par génération** ; `gpt-5.5`, avec des volumes semblables, coûterait
       environ **0,12 $** (estimation : ses jetons n'avaient pas été mesurés), soit environ 55 fois plus ;
     - **`gpt-5.5`** (`docs/exemples-scripts/2026-11-12-openai-gpt-5.5.md`) : vraie voix de créateur, accroches
       percutantes et variées (« Regarde cette texture, elle fond direct. », « Marre de surveiller la poêle ? »),
       ressentis concrets à faire valider par le créateur ; une accroche au vouvoiement sur 30 ;
     - **`gpt-6-luna`, même consigne**
       (`docs/exemples-scripts/2026-11-12-openai-gpt-6-luna-avant-reglage.md`) : français correct, tutoiement,
       aucun interdit, hashtags en français, mais ton de fiche produit (« La fiche mentionne… », « Il est présenté
       comme… »), 7 accroches sur 10 en questions, quelques tournures peu naturelles (« Tu regardes l'apparence
       des ridules ? »), une accroche de 9 mots. Pour le format histoire, il laisse des passages entre crochets à
       remplir avec du vécu réel au lieu d'en inventer : plus prudent, moins prêt à tourner ;
     - **consigne précisée** (pour les deux fournisseurs) : le créateur ne cite jamais « la fiche », et au plus
       3 accroches sur 10 sont des questions. **`gpt-6-luna` après réglage**
       (`docs/exemples-scripts/2026-11-12-openai-gpt-6-luna.md`) : plus de mention de la fiche, questions limitées,
       français correct et simple ; reste plus descriptif que `gpt-5.5` (« La composition, en trois noms. ») et une
       accroche de 9 mots sur 30.
     **Verdict** : la différence porte sur le punch et la spontanéité, pas sur la qualité du français, et elle ne
     justifie pas un coût environ 55 fois plus élevé. `gpt-6-luna` devient le défaut ; `gpt-5.5` reste disponible
     par `OPENAI_MODEL`. Piste à tester si le ton paraît trop sage aux premiers utilisateurs : `gpt-6.1-terra`
     (1 $ puis 5 $, décrit par OpenAI comme « clear, natural writing »), environ 10 fois le coût de `gpt-6-luna`
     et 6 fois moins que `gpt-5.5`.

## Supabase réel (12 novembre 2026, même jour)

117. **Migrations par l'API de gestion de Supabase, en HTTPS** : depuis cet environnement, le serveur Postgres
     (`aws-1-eu-west-1.pooler.supabase.com:5432`) n'est pas joignable (seul le HTTPS sort ; le nom ne se résout même
     pas), donc ni `psql` ni la CLI. `npm run db:setup` utilise désormais, dès que `SUPABASE_ACCESS_TOKEN` est là,
     les routes documentées dans la spécification officielle (`supabase/supabase`,
     `apps/docs/spec/api_v1_openapi.json`) : `GET`/`POST /v1/projects/{ref}/database/migrations` (chaque fichier
     appliqué sous son nom, une relance n'applique que les nouveaux, clé d'idempotence = nom + empreinte du SQL) et
     `GET /v1/projects/{ref}/types/typescript`. Le jeton est enregistré comme secret de l'environnement et injecté
     par le proxy ; il n'apparaît ni dans le code, ni dans `.env.local`, ni dans les journaux. Résultat : les
     4 migrations appliquées, une relance les voit « déjà appliquées », et `lib/db/database.types.ts` est
     maintenant généré depuis la vraie base.
118. **Tests d'intégration au vert contre la vraie base** : 31 tests Vitest (chaque méthode de `SupabaseRepo`,
     RLS avec deux utilisateurs et un formateur, lien magique, lien réutilisé, déconnexion) et 3 parcours Playwright
     (lien magique → onboarding → page demandée → déconnexion ; lien forgé ; redirection vers un autre site refusée).
     Google reste à vérifier (`E2E_GOOGLE=1`) une fois le fournisseur activé dans Supabase. Les données de test sont
     bien supprimées à la fin (aucun produit ni compte `itest-` restant).
119. **`.env.local` pour les tests d'intégration** : `@next/env` ne charge jamais `.env.local` quand `NODE_ENV=test`
     (cas de Vitest), et les processus de test n'héritent pas des variables chargées par la configuration.
     `tests/integration/load-env.ts` lit le fichier avec `util.parseEnv` de Node et le passe par `test.env` ; une
     variable déjà définie dans l'environnement l'emporte.
120. **Défaut corrigé : boucle de redirections si Supabase est injoignable.** Le middleware (runtime Edge) prenait
     une erreur réseau (`AuthRetryableFetchError`) pour « pas de session » et renvoyait vers `/connexion`, qui, côté
     serveur, voyait l'utilisateur connecté et le renvoyait vers la page demandée : boucle sans fin. Trouvé par le
     parcours Playwright (ici, le `fetch` du runtime Edge ne passe pas par le proxy ; en production, la même boucle
     arriverait pendant une panne de Supabase). Désormais, une erreur réseau ne déclenche pas de redirection :
     chaque page protégée revérifie la session côté serveur (`requireViewer`, `requireAdmin`…), qui reste la vraie
     barrière (vérifié : toutes les pages des zones protégées l'appellent).
121. **Seed réel** (`npm run seed` avec `DATA_PROVIDER=nexscope`, budget réduit à une page par niche et 2 produits
     pour les vidéos, 13 appels) : 62 vrais produits France dans Supabase, aucun produit fictif, tâche « ok » dans
     l'historique. Scores lus dans la base : 15 à 90, médiane 53.

## Session 4 — Tout rendre fonctionnel

### Étape 1 — Nom du produit

122. **TikTrend remplace l'ancien nom partout** : `lib/brand.ts` (`BRAND = 'TikTrend'`), donc site, appli,
     e-mails et métadonnées ; plus le reste, en dur : bot Discord, pages et textes, `package.json` et les deux
     `package-lock.json`, README, `CLAUDE.md`, `DECISIONS.md`, `RAPPORT.md`, commentaires des migrations,
     identifiants techniques (cookies `tiktrend_…`, comptes de démo `@tiktrend.local`, clés de recherche des prix
     Stripe `tiktrend_…`, graine des données fictives). Aucune occurrence de l'ancien nom ne reste hors de
     l'historique git. Les migrations déjà appliquées chez Supabase sont repérées par leur nom de fichier, qui ne
     change pas : seuls leurs commentaires changent. Les cookies renommés déconnectent les sessions locales
     existantes, sans autre effet.
123. **Logo en deux tons « Tik » + « Trend »** (`BRAND_SPLIT = ['Tik', 'Trend']`) : « Tik » en blanc, « Trend » en
     dégradé cyan → rose, comme « Ets » + « mart » chez EtSmart. Le losange ne change pas.

### Étape 2 — Dépendances et build propre

124. **Installation neuve vérifiée** : clone vierge, `npm ci` (544 paquets, 23 s) puis `npm run build` sans aucune
     variable, avec Node 22.23 et npm 10.9 : tout passe, `lucide-react` 1.72.0 compris (déclaré et verrouillé
     depuis le début). L'échec « Can't resolve 'lucide-react' » ne se reproduit pas ici ; les causes les plus
     probables d'un côté poste local sont une installation interrompue, une commande lancée hors de la racine ou un
     Node trop ancien. D'où trois garde-fous :
     - `scripts/check-deps.mjs`, lancé tout seul avant chaque build (`prebuild`, aussi `npm run check:deps`) :
       chaque paquet importé par le code doit être déclaré dans `package.json` et présent dans `node_modules`,
       sinon un message dit lequel et quoi lancer (`npm ci`) ;
     - `.nvmrc` (22) et `.npmrc` avec `engine-strict=true` : npm refuse d'installer avec un Node plus ancien que
       20.19 au lieu d'échouer plus loin ;
     - `@next/env` et `playwright`, importés par des scripts mais seulement arrivés par `next` et
       `@playwright/test`, sont maintenant déclarés ; `@fontsource-variable/tiktok-sans`, inutilisé, est retiré.

### Étape 3 — Mise en ligne sur Netlify

125. **Netlify au lieu de Vercel** : `vercel.json` supprimé ; `netlify.toml` minimal (commande `npm run build`,
     dossier `.next`, fonctions dans `netlify/functions`). D'après la doc Netlify (lue sur docs.netlify.com) :
     Next.js 14 est pris en charge par l'adaptateur OpenNext de Netlify, à ne pas épingler (il se met à jour à chaque
     build) ; le middleware tourne en Edge Function ; Node vient de `.nvmrc` ; les variables écrites dans
     `netlify.toml` ne sont pas visibles des fonctions, donc toutes se règlent dans l'interface.
126. **Tâche nocturne en deux fonctions**, à cause de deux limites documentées : une fonction planifiée a
     **30 secondes**, une fonction d'arrière-plan **15 minutes** (réponse 202 immédiate). La nuit réelle (21 appels
     Nexscope au débit d'un par seconde, vidéos, récaps) dépasse 30 s : le seed réel a déjà pris 21 s avec une seule
     page par niche.
     - `netlify/functions/nightly-refresh.mts` : `config = { schedule: '0 3 * * *' }` (cron en UTC), appelle
       `/api/cron/refresh` avec `Authorization: Bearer <CRON_SECRET>`, comme demandé ;
     - la route, quand elle tourne sur Netlify (`SITE_ID` et `URL` fournis à l'exécution, d'après la doc), passe le
       travail à `netlify/functions/nightly-refresh-background.mts` et répond 202 ; ailleurs (local, tests), elle le
       fait elle-même ; le bouton de l'admin suit la même règle (« lancé en arrière-plan ») ;
     - une fonction d'arrière-plan peut être appelée par une URL publique : elle ne fait rien sans le bon
       `CRON_SECRET`.
     Le paquet de la fonction d'arrière-plan a été construit avec esbuild (l'outil de Netlify pour les fonctions
     TypeScript), alias `@/` compris, puis exécuté en local : refus avec un faux secret, tâche complète avec le bon.
127. **Adresse publique** : `NEXT_PUBLIC_SITE_URL` reste la référence (redirections de connexion Supabase, retours
     et webhook Stripe, liens des e-mails, bot) ; à défaut, `URL` fourni par Netlify ; à défaut, le local.
     L'hébergeur des mentions légales devient Netlify (adresse laissée `[À COMPLÉTER]`, à reprendre sur netlify.com).
128. **Liste de vérification de mise en ligne réécrite pour Netlify**, pas à pas pour un premier déploiement :
     création du site, variables (portées Builds et Functions, redéploiement après chaque changement), domaine,
     Supabase, Stripe, Resend, puis test de la tâche planifiée (badge « Scheduled », bouton « Run now », journaux
     de la fonction d'arrière-plan, `/api/health`).

### Étape 4 — E-mails réels (Resend)

129. **Lien de connexion par le SMTP de Resend, réglé par l'API de gestion de Supabase** (pas de hook d'envoi) :
     d'après la doc Supabase, le SMTP personnalisé garde l'envoi, les limites et les modèles chez Supabase, alors
     qu'un hook d'envoi demanderait une route publique de plus, signée, à maintenir. `npm run auth:setup` fait un
     `PATCH /v1/projects/{ref}/config/auth` (champs de la spécification officielle : `site_url`, `uri_allow_list`,
     `mailer_subjects_magic_link`, `mailer_templates_magic_link_content`, `smtp_host`, `smtp_port` en texte,
     `smtp_user`, `smtp_pass`, `smtp_admin_email`, `smtp_sender_name`, `external_google_*`). Valeurs SMTP de la
     doc Resend : `smtp.resend.com`, port 465, utilisateur `resend`, mot de passe = clé d'API. Lancé pour de vrai :
     adresse du site, retours autorisés et modèle français appliqués au projet ; SMTP et Google attendent leurs clés.
130. **Modèle du lien magique en `token_hash`** vers `/auth/callback` (la route le gérait déjà) : il marche même si
     l'e-mail est ouvert sur un autre appareil, contrairement au lien PKCE qui exige le cookie du navigateur de départ.
     Le paramètre `suite` est perdu dans ce cas (retour sur `/app`) : `{{ .RedirectTo }}` le garderait, mais retombe
     sur l'adresse du site sans paramètres si l'adresse n'est pas autorisée, ce qui casserait le lien.
131. **Lien affiché à l'écran : jamais sur un site public.** `isLocalLoginAllowed()` = mode local et pas de
     déploiement public (`SITE_ID` de Netlify, ou adresse https hors localhost). Sinon la demande de lien et la route
     de retour refusent : sans Supabase, n'importe qui pourrait ouvrir le compte de n'importe qui.
132. **Récap : désinscription en un clic** comme le demande la doc Resend (RFC 8058) : en-têtes `List-Unsubscribe`
     (adresse qui accepte un POST, `/api/recap/desinscription`, corps vide, 200) et `List-Unsubscribe-Post:
     List-Unsubscribe=One-Click`, plus un lien visible vers `/desinscription` (page avec un bouton, pas de
     désinscription sur un simple GET : les antivirus de messagerie ouvrent les liens). Jeton HMAC-SHA256 de
     l'identifiant (clé dérivée de `APP_SIGNING_SECRET`, sinon `CRON_SECRET`), comparé en temps constant, sans
     connexion requise.
133. **Un seul récap par personne et par jour**, même si la tâche est relancée : en plus du statut du récap en base,
     clé d'idempotence Resend `recap-<id>-<jour>` (doc Resend : 24 h, second argument de `emails.send`).
134. **E-mail de test réel** : `tests/integration/email.test.ts` envoie `emails/test-email.tsx` au premier de
     `ADMIN_EMAILS` quand `RESEND_API_KEY`, `EMAIL_FROM` et `ADMIN_EMAILS` sont là. `npm run test:integration` lance
     désormais les tests de chaque service dont les clés sont présentes, et dit lesquels il ignore.

### Étape 5 — Stripe en mode test

135. **Source des noms de l'API Stripe** : docs.stripe.com n'est pas joignable depuis cette session ; les routes,
     paramètres et champs viennent des types officiels du SDK `stripe` 23.1 (générés depuis la spécification OpenAPI
     de Stripe, version d'API `2026-10-28.endive`). `STRIPE_WEBHOOK_EVENTS` est vérifié contre ces types à la
     compilation (`satisfies … EnabledEvent`).
136. **Remboursement → commission annulée au prorata** (`charge.refunded`). Depuis l'API 2025 (« basil »), une charge
     ne porte plus sa facture : elle est retrouvée par `GET /v1/invoice_payments?payment[type]=payment_intent&
     payment[payment_intent]=…`. Part annulée = montant remboursé cumulé ÷ montant payé, appliquée à la commission
     d'origine : rejouer l'événement ou recevoir un second remboursement partiel ne retire que la différence. Nouvelle
     colonne `commissions.canceled_cents`, statut `annulee` quand tout est remboursé ; `amount_cents` reste « ce qui
     est dû ». Une commission déjà versée puis remboursée fait baisser le dû du parrainage (il peut passer sous zéro :
     à retenir sur le versement suivant). Erreur réseau pendant cette recherche : 500, Stripe réessaie.
137. **Échec de paiement** (`invoice.payment_failed`) : l'accès reste ouvert pendant les nouveaux essais de Stripe
     (statut `past_due`, déjà compté comme actif), l'abonné reçoit un e-mail en français (une fois par tentative :
     l'événement est marqué avant l'envoi, et clé d'idempotence Resend), et son compte affiche un bandeau avec
     « Mettre à jour ma carte », qui ouvre le portail directement sur l'étape `payment_method_update`. Après le
     dernier essai, Stripe annule (réglage conseillé) ou passe en `unpaid` : dans les deux cas, retour en Gratuit.
138. **Changement de plan sans second abonnement** : un abonné (même en essai formateur) qui choisit un autre plan
     ou une autre période arrive sur l'écran de confirmation du portail (`flow_data.type =
     subscription_update_confirm`, l'article de l'abonnement et le nouveau prix), avec le prorata calculé par Stripe.
     La configuration du portail est créée ou mise à jour par `npm run stripe:setup` (marquée `metadata.app`), et
     passée aux sessions par `STRIPE_PORTAL_CONFIGURATION` ; sans elle, la configuration par défaut du compte.
139. **Webhook créé par le script** (`--webhook`), seulement vers une adresse https publique ; son secret, donné une
     seule fois par Stripe, est écrit dans `.env.local` sans être affiché.
140. **Tests sans clé, au plus près du réel** : de vrais webhooks signés (`generateTestHeaderString`) passent par la
     vraie route, et le SDK officiel parle à un faux serveur Stripe local (`setStripeForTests`, options `host`/`port`
     du SDK) qui enregistre les requêtes HTTP réelles : on vérifie ce qui partirait chez Stripe (paramètres de
     Checkout, du portail, de l'essai, recherche de facture). Le parcours a révélé un défaut corrigé : l'identifiant
     utilisateur relu chez Stripe était écrasé par celui, vide, de l'événement. `tests/integration/stripe.test.ts`
     refait les mêmes parcours contre le vrai mode test dès qu'une clé `sk_test_` et les prix sont là (les
     événements sont relus par `GET /v1/events`, faute d'adresse publique pour le webhook).

### Étape 6 — Récap et Discord sans serveur

141. **Le bot n'a plus de processus permanent** (dossier `bot/` et routes `/api/bot/*` supprimés, `BOT_API_SECRET`
     inutile). D'après la doc officielle de Discord (dépôt `discord/discord-api-docs`, discord.com n'étant pas
     joignable depuis la session) : les commandes peuvent arriver par **interactions HTTP** sur une adresse du site
     (« Interactions Endpoint URL »), et tout le reste (message privé, salons, rôles) passe par l'API REST avec le
     jeton du bot. Plus besoin de Railway, Fly.io ou d'un VPS : c'est l'hébergement le plus simple et le moins cher
     (rien en plus du site). Un bot à connexion permanente (gateway) n'apporterait rien ici : on n'écoute aucun
     événement du serveur.
142. **Signature des interactions** : Ed25519 de `X-Signature-Timestamp + corps brut` avec la clé publique de
     l'application, vérifiée par `node:crypto` (clé brute passée en JWK), 401 sinon ; PING (type 1) → PONG. Réponse
     immédiate (type 4, drapeau 64 « éphémère ») : Discord exige une réponse en 3 secondes, d'où un délai court
     (1,5 s) pour l'ajout du rôle pendant `/lier`, rattrapé au besoin par la vérification quotidienne.
143. **Tâche horaire** (`netlify/functions/discord-hourly.mts`, `0 * * * *`) qui appelle `/api/cron/discord`, puis le
     travail dans `discord-hourly-background` (même schéma que la tâche nocturne, 15 minutes au plus) :
     - récap privé quand l'heure de Paris atteint l'heure choisie (`POST /users/@me/channels` puis
       `POST /channels/{id}/messages`), une seule fois (statut `discord_status` du récap ; 50007 = messages privés
       fermés → `failed`, pas de nouvel essai) ; le récap e-mail reste programmé la nuit chez Resend à la même heure ;
     - salons du jour une fois par jour, réservés dans la nouvelle table `daily_tasks` (insertion unique (tâche, jour),
       libérée en cas d'échec pour réessayer l'heure suivante) ; rien si les données ont plus de 36 h ;
     - rôle Pro : à la liaison, à chaque changement de plan (traitement des paiements) et une vérification complète
       par jour (`PUT`/`DELETE /guilds/{guild}/members/{user}/roles/{role}`) ; 10007 « membre inconnu » ignoré.
144. **Limites de débit** : sur 429, attente de `retry_after` (corps JSON) ou de `Retry-After`, deux nouveaux essais au
     plus, comme le décrit la doc (`topics/rate-limits`).
145. `npm run discord:setup` enregistre `/lier` et `/delier` sur le serveur
     (`PUT /applications/{app}/guilds/{guild}/commands`, prise en compte immédiate contrairement aux commandes
     globales) et règle `interactions_endpoint_url` (`PATCH /applications/@me`) quand l'adresse du site est publique.

### Étape 7 — Fiche produit complète

146. **Sources lues** : pages officielles www.nexscope.ai/api-docs (`data-et-list-product-video`,
     `tiktok-batch-product-detail`, `tiktok-product-discovery`, `data-et-batch-video-detail`, `data-et-list-seller-product`).
     Les deux routes utilisées ont une adresse REST documentée (`POST https://api.nexscope.ai/et/listProductVideo`,
     `…/et/batchProductDetail`, même clé Bearer, même enveloppe `{ code, msg, data }`) : pas besoin du protocole MCP.
     Deux vrais appels ont confirmé la forme exacte avant d'écrire les correspondances (réponses anonymisées gardées
     dans `tests/fixtures/*.reel.json`).
147. **Champs non listés par la page, mais décrits par la réponse** : la vraie réponse vidéo contient vues, likes,
     partages, commentaires, durée, couverture ; la page n'en parle pas, mais chaque réponse les décrit elle-même dans
     `columns` (titre de chaque champ). Ils sont lus, et chacun reste `null` s'il manque. Rien n'est déduit d'autre chose.
148. **Graphique par période tant que l'historique est court** : moins de 7 jours de relevés → barres « ventes moyennes
     par jour » sur 24 h, 7, 15, 30, 60, 90 jours (une moyenne par jour se compare d'une barre à l'autre ; un cumul
     non). Une période plus longue que l'historique de la source (`firstCrawlDt`) est **masquée** : un produit vu
     depuis 3 jours affichait 203 ventes sur 24 h comme sur 90 jours, ce qui aurait laissé croire à une moyenne de
     2 ventes par jour. À 7 jours de relevés, la courbe jour par jour reprend la main et l'appel n'est plus fait.
149. **Coûts maîtrisés** : vidéos des `NEXSCOPE_MAX_VIDEO_CALLS_PER_NIGHT` (10) meilleurs produits de la nuit, sauf
     ceux chargés il y a moins de 3 jours (`products.videos_fetched_at`) ; ventes par période pour
     `NEXSCOPE_MAX_DETAIL_PRODUCTS_PER_NIGHT` (40) produits au plus, les mieux notés, en lots de 20 (la vraie route a
     dépassé 30 s pour une centaine d'identifiants : délai porté à 60 s pour elle seule). Bouton « Charger les vidéos »
     de la fiche réservé à Pro et Pro+, soumis au même cache de 3 jours : un produit coûte au plus un appel tous les
     3 jours, quel que soit le nombre de visiteurs. Tri des vidéos : ventes de la vidéo (`productVideoSortField` 4).
150. **Échantillon gratuit retiré partout** (score, filtre du radar, fiche, carte, récap e-mail et Discord, accueil,
     consignes de l'IA, base : colonne `products.free_sample` supprimée). Aucune route TikTok de Nexscope n'a de champ
     pour cela (`freeShipping` est la livraison offerte, autre chose) ; l'API officielle TikTok non plus. Ses 10 points
     sont répartis au prorata sur les 4 autres critères (38,9 / 27,8 / 22,2 / 11,1). Les scores déjà enregistrés qui
     contiennent encore ce critère l'ignorent à l'affichage jusqu'au relevé suivant. Le tirage aléatoire du catalogue
     fictif est gardé pour que ses produits restent les mêmes.
151. **Les vidéos nourrissent le studio** : chaque vidéo de référence entre dans le prompt avec son texte et ses vrais
     chiffres (ventes, vues, durée) ; une vidéo sans description n'est citée que par ses chiffres.
152. **`npm run data:enrich`** complète les produits réels déjà en base (ventes par période, vidéos des N meilleurs)
     sans refaire le relevé du jour : utilisé ici pour vérifier les deux routes en réel (20 produits, 3 × 5 vidéos).

### Étape 8 — Connexion Google

153. Clés Google absentes : le fournisseur n'est pas activé, la procédure Google Cloud exacte est dans le README
     (client « Web application », adresse de retour `https://<ref>.supabase.co/auth/v1/callback`, champs d'accès
     `openid`, e-mail, profil). Dès que `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont dans `.env.local`,
     `npm run auth:setup` l'active par l'API de gestion (`external_google_enabled`, `external_google_client_id`,
     `external_google_secret`, champs de la spécification officielle), et `E2E_GOOGLE=1 npm run test:integration`
     vérifie le bouton. Les deux clés ne vont pas sur Netlify : seul Supabase s'en sert.

### Étape 9 — Fonctionnalités V2 (sans l'API affiliés de TikTok)

154. **Une table générique `user_records`** (`kind` + `data` jsonb, RLS « chacun ses fiches ») pour les gains, les
     propositions, les plans de publication, les analyses : 5 fonctions sans 5 tables ni 30 méthodes de dépôt. Toutes
     les méthodes filtrent par utilisateur (une fiche d'un autre est introuvable, même par son identifiant).
155. **Plans** : gains et plan de publication en Pro ; propositions de marques (20/jour), analyses de vidéo (20/jour)
     et Europe en Pro+. Quotas comptés côté serveur sur les fiches créées depuis minuit (heure de Paris).
156. **IA structurée générique** (`lib/ai/structured.ts`) : mêmes mécanismes que le studio (OpenAI `responses.parse` +
     `zodTextFormat`, `store: false` ; Claude `messages.parse` + `output_config.format`), un nouvel essai si la sortie
     est hors schéma, réponse simulée et signalée comme telle sans clé.
157. **Propositions** : l'IA lit le message ; la note sur 100 et la contre-proposition sont **calculées par le code**
     (commission comparée aux produits du radar de la même niche, 60 points ; échantillon offert +15 ; fixe +15 ;
     exclusivité −15 ; délai < 7 jours −10 ; échantillon remboursable −10), jamais par l'IA. Les 3 réponses reprennent
     le chiffre exact de la contre-proposition (médiane de la niche, ou offre + 5 points).
158. **Plan de publication** : 20 vidéos, rythme 3 (lun., mer., ven.), 5 (jours ouvrés) ou 7 par semaine, à partir du
     lendemain. Rappel le jour J par e-mail (programmé à l'heure du récap, une fois par jour) et par message privé
     Discord (tâche horaire). Export `.ics` conforme à la RFC 5545 (CRLF, lignes de 75 octets, texte échappé, journée
     entière). Marquer « postée » met à jour le compteur de Mes produits. Aucune publication automatique.
159. **Analyse de vidéo** : avec un lien TikTok et la clé Nexscope, description, durée et chiffres de la vidéo par
     `POST /et/batchVideoDetail` (`videoUrls`, doc officielle, ~10 crédits, mis en cache) ; sinon le texte collé.
     Découpage accroche / problème / démonstration / preuve / appel à l'action avec les secondes, ce qui marche,
     version adaptée au produit et au style de l'utilisateur, envoyable au studio. Pas de téléchargement de la vidéo.
160. **Europe** : `profiles.region` et `products.region` ; identifiants France inchangés (`nx-<id>`), autres pays
     `nx-de-<id>` ; la tâche nocturne collecte la France, puis les pays de `ENABLED_REGIONS` avec une vraie source
     seulement (jamais de fictif hors de France) ; chaque pays a son propre relevé dans le catalogue. Le récap suit le
     pays choisi s'il a un relevé frais, sinon la France. Mots-clés des niches traduits (DE, IT, ES) dans
     `lib/regions.ts`. L'interface reste en français.

### Correctif : inscription

161. **Mot de passe en plus du lien magique** : sans SMTP, le service d'e-mail intégré de Supabase n'envoie qu'aux
     membres de l'équipe et à 2 e-mails par heure ; le lien magique seul rendait l'inscription impossible. Onglets
     « Créer mon compte » (par défaut) / « Me connecter », lien magique en option. Messages d'erreur tirés des codes
     documentés de `AuthApiError.code` (SDK `@supabase/auth-js`). Une adresse déjà inscrite n'est jamais révélée par
     Supabase (utilisateur sans identité) : on le détecte et on propose de se connecter.
162. **Adresse de retour = adresse de la demande** (`lib/auth/origin.ts`), parmi les adresses connues seulement
     (`NEXT_PUBLIC_SITE_URL`, `URL` et `DEPLOY_PRIME_URL` de Netlify, `AUTH_REDIRECT_ORIGINS`, localhost) : un en-tête
     Host trafiqué ne peut pas détourner le lien. Les modèles d'e-mail utilisent `{{ .RedirectTo }}` ; la page demandée
     voyage dans un cookie. Filet de sécurité dans le middleware pour les liens qui retombent sur l'accueil.
163. **Confirmation d'e-mail coupée temporairement** (`mailer_autoconfirm`), à la demande, tant que Resend n'est pas
     branché ; procédure de réactivation dans RAPPORT.md.

## Refonte de l'appli au modèle d'EtSmart (13 novembre 2026)

164. **Bug du studio en production : la clé, pas le modèle.** En ligne, `gpt-6-luna` répondait 400 « Bad Request »
     sans paramètre ni code, alors que le même appel passait en local. Les indices ajoutés (hôte `api.openai.com`,
     identifiant de requête OpenAI présent) ont montré que la demande atteignait bien OpenAI et que la variable
     `OPENAI_API_KEY` de Netlify contenait un texte d'exemple de 15 caractères au lieu d'une clé. Aucun paramètre de
     l'appel n'est en cause (doc du modèle : sorties structurées, `max_output_tokens`, `store` pris en charge) : on
     garde `gpt-6-luna`. Désormais `env.aiKeyProblem` repère une clé mal formée (texte d'exemple : espace, crochet,
     accent, guillemet, moins de 20 caractères), le studio l'écrit en clair sans jamais montrer la clé, et `/api/health` la liste dans
     `problems` (statut « degraded ») avec `ai: { provider, model, keyOk }`.
165. **Coque copiée d'EtSmart** (`components/app/shell.tsx`, d'après `src/app/dashboard/page.tsx` d'EtSmart) : barre
     latérale fixe de 64 px qui s'ouvre à 256 px au survol ou au focus clavier (`transition-[width] 300 ms ease-out`),
     sections Accueil / Trouver / Créer / Suivre / Compte (étiquettes 12 px en capitales révélées à l'ouverture), entrée
     active en dégradé cyan → rose, bloc utilisateur et « Passer Pro » en bas ; sur téléphone, en-tête de 64 px, menu
     déroulant animé (200 ms) et barre du bas noire floutée à 5 entrées, onglet actif cyan. Contenu décalé de 64 px,
     barre haute de 44 px (notifications, plan). Conteneur de page d'EtSmart : `max-w-7xl`, marges 12 → 40 px.
     Préparation n'apparaît qu'en mode préparation ; Espace formateur et Admin seulement pour qui y a droit.
166. **Composants d'EtSmart, couleurs TikTok** : cartes noires bordées (`rounded-2xl`, halo cyan au survol), en-tête de
     page (étiquette 10 px, titre 32 px gras serré, une phrase d'utilité, trait bas), titre de section avec trait qui
     s'efface, pastilles d'icône 36 px, pastilles de variation, badges bordés, champs noirs (focus cyan), squelettes à
     pulsation d'opacité (1,5 s), onglets à trait dégradé qui glisse (ressort 500 / 30), entrée de page en 300 ms
     (montée de 20 px). Écarts gardés pour l'accessibilité : textes secondaires en `--text-muted` (#8A8B91, 6:1) au lieu
     du blanc à 45-50 % d'EtSmart (4,4:1, sous le seuil AA pour 10-12 px) ; axes des graphiques en #8A8B91 au lieu de
     #666. `MotionConfig reducedMotion="user"` : avec « moins d'animations », plus aucun déplacement, seulement des fondus,
     et le même rendu côté serveur et navigateur (pas d'erreur d'hydratation).
167. **Dashboard sur `/app`, radar sur `/app/radar`** : la première page après connexion est le tableau de bord ; tous
     les liens « radar » (fiche produit, filtres, alertes, états vides, 404) pointent vers `/app/radar`. Les messages
     de bienvenue et d'accès refusé (`?bienvenue`, `?acces`) s'affichent sur le dashboard.
168. **Chiffres du dashboard, tous saisis ou mesurés** (`lib/dashboard.ts`) : gains et ventes du mois = fiches de
     gains saisies ou importées (Pro), comparées au mois dernier à la même date ; vidéos de la semaine = vidéos cochées
     « posté » dans les tableaux, face à la semaine dernière et à l'objectif hebdomadaire ; produits suivis (ajoutés
     ces 7 jours) ; alertes du jour = notifications « alerte » et « baisse », face à hier. Variation en % seulement
     si la période précédente n'est pas nulle (sinon en valeur). Le bloc « favoris » du brief montre les **produits
     suivis** (vocabulaire de l'appli ; les favoris du radar servent à comparer) : mini-courbe des 7 derniers jours,
     score (Pro), ceux qui baissent en tête. L'objectif du mois est la fiche `objectif_gains` existante (une seule
     source, que l'onboarding remplit aussi). « À tourner » : en retard, puis par date jusqu'à dimanche, puis une vidéo
     sans date par produit ; cocher la passe en « Posté » (action serveur, session revérifiée).
169. **Profil TikTok par Nexscope** (`lib/creator-profile.ts`) : route documentée `POST /social/tiktok/profile`
     (`handle`, `cache_max_age: '1d'`), 10 crédits, 0 si Nexscope répond depuis son cache. Un essai par personne et par
     jour au plus (compté avant l'appel, même en cas d'échec), lancé après l'affichage de la page (pas d'attente) ou
     par « Mettre à jour ». On garde abonnés, j'aime, vidéos et pseudo : ni photo (adresse signée qui expire), ni bio.
     Sans clé ou sans pseudo : la tranche déclarée dans le compte, avec un lien pour la changer.
170. **Onboarding en 10 écrans, une question chacun** (`app/bienvenue/onboarding-flow.tsx`, règles communes dans
     `lib/onboarding-steps.ts`) : prénom, pseudo (facultatif, aperçu Nexscope), taille du compte, déjà affilié ?,
     niveau, niches (3 au plus, les autres grisées avec un message), vidéos par semaine, styles (plusieurs), objectif de
     gains (facultatif, « un repère, pas une promesse »), code formateur (facultatif). Grandes cartes cliquables (un
     choix unique au doigt passe à la question suivante après 220 ms ; au clavier, « Continuer »), barre de progression
     animée, glissement de 24 px en 200 ms, « Retour », « Passer » sur les questions facultatives, tout tient dans un
     écran de 390 × 844 sans défiler (vérifié). Réponses gardées dans l'onglet en cas de rechargement, revérifiées
     côté serveur à la fin. Écran « On prépare ton radar » (2,4 s au moins), puis le dashboard, produit du jour en
     avant. Les anciennes étapes (3 produits, premier script, offre Pro) sont retirées : le dashboard les remplace
     (produit du jour, « Écrire mes scripts », « Passer Pro » dans la barre latérale).
171. **Nouvelles réponses du profil** (migration `20261116000100_onboarding_v2.sql`, appliquée par l'API de gestion) :
     `affiliate_status`, `experience_level`, `videos_per_week`, `video_styles[]`, `onboarding_version`. Tranches
     <1 000, 1 000–5 000, 5 000–20 000, 20 000–100 000, >100 000 ; les anciennes restent valides en base jusqu'à la
     nouvelle réponse. Un nombre exact connu (préparation, Nexscope) donne la tranche précise « 1 500–5 000 » au-dessus du
     seuil. Éligibilité (code et déclencheur `sync_eligibility`) : « pas encore » ⇒ préparation ; sous 1 500 ⇒
     préparation ; 1 000–5 000 ⇒ affilié seulement si « oui ». Franchir le seuil dans « Préparation » efface le
     « pas encore ». Vidéos par semaine ⇒ objectif hebdomadaire (3, 5 ou 7) et rythme proposé du plan ; objectif de
     gains ⇒ la fiche `objectif_gains` du suivi des gains. Tout se modifie dans Compte.
172. **Comptes existants** : `onboarding_version = 1` ⇒ `requireOnboardedViewer` les envoie une fois sur les 6 nouvelles
     questions (taille, affilié, niveau, rythme, styles, objectif), réponses connues déjà cochées ; puis version 2.
173. **Score « pour toi »** : facteurs par nouvelle tranche (les petits comptes privilégient faible concurrence et petit
     prix, les gros la commission), facteur de niveau (débute : concurrence ×1,2 et prix ×1,15 ; vend régulièrement :
     commission ×1,15), bonus de style si **un** des styles choisis se prête à la niche. Expliqué en phrases.
174. **Toutes les pages au format EtSmart** : chaque en-tête porte la section de la barre latérale (Trouver, Créer,
     Suivre, Compte, Formateur, Administration), un titre et une phrase d'utilité, y compris les pages verrouillées.
     Pages de formulaire centrées en `max-w-3xl` (comme les réglages d'EtSmart), pages à tableaux et graphiques en
     `max-w-5xl`, radar et dashboard sur toute la largeur du conteneur (`max-w-7xl`). Onglets du studio et de l'admin au
     style d'EtSmart (trait dégradé sous l'onglet ouvert).
175. **Espaces formateur et admin dans la coque de l'appli** (`SimpleShell` réécrit) : mêmes barre latérale, en-tête et
     barre du bas, avec leurs propres sections (Appli, Formateur, Administration) ; les droits restent vérifiés par
     chaque page.
176. **Captures** : `npm run screenshots` suit la nouvelle connexion (lien magique en option) et l'onboarding en 10
     questions ; sur téléphone, la barre du bas est masquée dans les captures pleine page. L'appli EtSmart ne peut pas
     être capturée ici (compte et Supabase à elle) : comparaison faite dans le code.
177. **Redirections relatives** (`lib/http/redirect.ts`) pour la déconnexion, le retour des liens de connexion et les
     exports : sur Netlify, `request.url` est l'adresse interne du déploiement de branche, ce qui envoyait la personne
     sur un autre domaine (vu au test en ligne de la déconnexion). Un « Location: /chemin » garde l'adresse du
     navigateur. Onboarding : un passage automatique en attente (choix au doigt) est annulé dès qu'on navigue autrement.
178. **Profil TikTok : une fois par semaine** (à la demande, pour le coût en crédits Nexscope) : `creatorRefreshPolicy`
     (`lib/creator-profile.ts`) — relevé automatique tous les 7 jours (ou pour un nouveau pseudo), bouton « Actualiser »
     une fois par jour en Pro et Pro+ (plan relu côté serveur), jamais deux essais le même jour. En Gratuit, le
     dashboard affiche la date du prochain relevé. Remplace la règle « un relevé par jour » de la décision 169.
     `/api/health` donne aussi des indices non secrets sur la forme de la clé d'IA (`ai.keyHints` : préfixe, espaces,
     guillemets, longueur).
179. **Tâches d'IA en arrière-plan** (`lib/tasks/`, fonction `netlify/functions/taches-background.mts`) : mesuré le
     13 novembre, une génération complète prend 41 s (16 s même sans raisonnement), or Netlify coupe une fonction
     synchrone à 10 s par défaut (26 s au plus sur demande ; forum Netlify, la doc n'étant pas joignable d'ici). Les
     actions longues (scripts, angle de série, série de 20, mon style, analyse de vidéo, propositions, plan de
     préparation, accroches de la fiche) gardent leurs vérifications rapides (session, plan, quota), enregistrent une
     fiche `tache_ia` et la confient à la fonction d'arrière-plan (jusqu'à 15 min), appelée avec un jeton HMAC propre à
     la tâche et à la personne. La page `/app/attente/<id>` se rafraîchit toutes les 2,5 s puis ouvre le résultat (ou la
     page de départ avec son message d'erreur, comme avant) ; on peut la quitter. Une tâche jamais démarrée au bout
     d'une minute est déclarée en échec (rien n'est décompté : le quota l'est dans le travail lui-même). En local et dans
     les tests, la tâche tourne directement (même code). Les retouches courtes (accroche, ligne, raccourcir, plus
     percutant, traduire) restent instantanées, sans raisonnement.
180. **Raisonnement OpenAI « low » par défaut** (`OPENAI_REASONING_EFFORT`, valeurs none, low, medium, high) : génération
     complète 20 s au lieu de 41 s, moins de jetons facturés ; même qualité de forme (schéma, interdits vérifiés).
181. **Deux palettes à comparer en ligne** (`?palette=a` / `?palette=b`, retenu par le cookie technique
     `tracktout_palette`, appliqué avant l'affichage par un petit script comme le thème) : A = cyan et rose TikTok
     (inchangée) ; B = orange vif du panier TikTok Shop pour les boutons (#FF6A1F, texte foncé #140A04 : 7,1:1), les
     accents (#FF8A3D : 8,6:1), le logo et le dégradé (orange → ambre), le cyan restant aux courbes et aux chiffres
     positifs (variations à la hausse, gains, tendances « monte » et « explose »), erreurs en rouge #FF5C5C (6,9:1).
     Seules les variables changent (`:root[data-palette='b']`), le design et le fond noir sont identiques ; les couleurs
     écrites en dur (barre latérale, logo, téléprompteur, cases à cocher, halos) passent par les variables. Nouveaux
     jetons : `--on-primary` (texte des boutons), `--positive`, `--chart-2`, `--logo-halo`. Audit axe : 0 erreur en A
     et en B. Le thème clair garde la palette A.
182. **Dix palettes à comparer** (`?palette=a` à `?palette=j`, même mécanisme que la décision 181) : A TikTok cyan + rose,
     B orange TikTok Shop, C violet électrique, D vert émeraude, E bleu électrique, F jaune or, G fuchsia, H rouge corail,
     I citron vert, J blanc pur. Pour B à J : couleur de la palette sur les boutons, les accents, le logo et le dégradé ;
     cyan aux courbes et aux chiffres positifs ; erreurs en rouge. Contrastes calculés puis vérifiés à l'audit axe
     (0 erreur sur l'accueil, le dashboard et le studio, 390 et 1440 px). Captures et planches :
     `docs/captures/palettes/`. Les palettes non retenues seront retirées une fois le choix fait.
183. **Palette retenue : J « blanc pur »** (choix de l'utilisateur parmi les 10). Elle devient la palette par défaut et les
     neuf autres sont retirées avec le sélecteur `?palette=` et son cookie : boutons blancs à texte noir (21:1), accents
     #F4F4F5, dégradé blanc → #A1A1AA (texte noir dessus ≥ 8,2:1), logo et score en gris clair / gris, erreurs #FF5C5C ;
     cyan gardé aux courbes et aux chiffres positifs. Thème clair : même logique en noir et gris (#161823, #52525B).
     Suivent aussi : images de partage (`lib/og.tsx`), icône et icônes de l'appli installable (`scripts/pwa-icons.py`),
     e-mails (boutons noirs, chiffres positifs en cyan foncé). Captures de comparaison gardées dans `docs/captures/palettes/`.
184. **Retour à la palette TikTok (A), sur fond blanc** (à la demande, après la J) : le thème clair, qui existait en
     option, devient le thème par défaut partout ; le noir passe en option du compte (cookie `tracktout_theme=dark`,
     appliqué avant l'affichage). Sur blanc, cyan et rose foncés (#00777A, #C8103F) pour rester AA ; dégradé à texte
     blanc (`--on-gradient`) ; boutons #E0144A. Les graphiques lisent leurs couleurs dans le thème (`useChartColors`),
     la constellation dessine à la couleur d'encre du thème, le téléprompteur reste noir (cyan vif en dur). Icônes et
     images de partage reprennent le cyan et le rose ; écrans de démarrage de l'appli installable sur fond blanc ;
     manifeste en blanc. Pastille cyan éclaircie (fond 7 %) : la page Notifications tombait à 4,44:1. Audit axe :
     0 erreur sur 22 pages en blanc et 6 pages en noir.
185. **Nouveau titre de l'accueil** : « Automatise ton business TikTok Shop de A à Z. » (« de A à Z. » en italique et
     en dégradé vivant, même composant animé qu'avant) ; sous-titre « Tracktout trouve les produits qui vont exploser,
     écrit tes scripts, planifie tes vidéos et suit tes gains. Toi, tu tournes. ». Balise title « Automatise ton
     business TikTok Shop de A à Z · Tracktout » (accroche d'abord, le nom ensuite, pour la recherche) et description
     de 150 caractères sans promesse de gains (`BRAND_TAGLINE`, `BRAND_DESCRIPTION` dans `lib/brand.ts`), reprises
     par Open Graph, Twitter, l'image de partage et le manifeste ; adresse canonique « / ». Vérifié à 360, 390 et
     1440 px : aucun débordement.
186. **Scan des secrets de Netlify** : le build échouait depuis le commit qui ajoutait, dans un test, une fausse clé au
     format exact d'une clé OpenAI (« likely secret »). Plus aucune chaîne de clé dans le dépôt : tests et exemples
     utilisent « fausse-cle-openai-pour-test » / « fausse-cle-anthropic-pour-test », le contrôle de forme de la clé ne
     cite plus de préfixe (il repère un texte d'exemple : espace, crochet, accent, guillemet, moins de 20 caractères),
     et le masquage des messages d'erreur cache toute suite de 20 caractères de clé ou plus. Le scan reste actif.
     Vérifié sur un build de production local avec le vrai fichier d'environnement : la vraie clé n'apparaît dans aucun
     fichier du build (navigateur comme serveur) ; seule reste la propriété CSS `mask-composite`.
187. **Défilé de captures sous le titre de l'accueil** (repris d'EtSmart, à la place de l'aperçu du radar) : deux
     rangées de 12 cartes 320 × 208 qui défilent en sens inverse (65 s par tour, deux copies, translation de −50 %),
     bords en fondu (`mask-image`), nom de la fonction dans une pastille encre en bas à gauche, badge « Exemple » sur
     « Mes gains ». Pause au survol ; avec « réduire les animations », rangées fixes qu'on fait défiler à la main
     (copie de boucle retirée) ; une seule rangée sous 640 px (cartes 270 × 176). Les images viennent de vraies pages :
     `npm run screenshots:landing` lit le catalogue de la veille (lecture seule), le copie avec des noms courts dans une
     base locale jetable (`.data/landing-db.json`), crée un compte de démo rempli (plan, alertes, favoris, contenus
     écrits par la vraie IA si la clé est là) avec des gains modestes (≈ 40 € sur le mois, objectif 150 €), puis
     capture chaque page avec Playwright et écrit deux tailles en WebP (640 et 320 px de large, 288 Ko pour les 24
     fichiers). Le navigateur choisit la taille par `srcset`. `RadarShowcase` et `lib/public-demo.ts` sont supprimés.
188. **Nouvelle grille : tout est payant** (13 novembre). Starter 34,99 €/mois · 349,90 €/an, Pro 59,99 € · 599,90 €,
     Elite 99,99 € · 999,90 € (l'annuel vaut 10 mois : « 2 mois offerts », calculé depuis les prix). Plus de plan
     gratuit ni d'essai. Identifiants : `free` → `aucun` (compte sans abonnement, toutes limites à 0), `proplus` →
     `elite`, `starter` ajouté ; la migration `nouvelle_grille` renomme les valeurs de l'enum (lignes et valeur par
     défaut suivent) et la base locale fait le même renommage à la lecture. Pro est « Recommandé » partout.
189. **Abonnement obligatoire avant l'appli** : après l'onboarding, `/abonnement` (hors coque, avec « Me déconnecter » et
     « Mon compte »). `requireOnboardedViewer` renvoie tout compte sans abonnement vers cette page ; seules les pages
     compte, paiement simulé et consentement formateur, et la coque (réduite au compte), passent `{ abonnement: false }`.
     Les limites restent la vraie barrière : avec le plan `aucun`, chaque action serveur refuse. Un abonné qui ouvre
     `/abonnement` est envoyé sur `/app/passer-pro` (changement de plan).
190. **« Illimité » = plafond de sécurité invisible** (`SAFETY_CAPS` dans `lib/plans.ts`) : 150 écritures de scripts par
     jour, 500 produits suivis, 50 alertes, 20 séries et 20 analyses de style par jour, 300 analyses de vidéo et 300
     propositions par mois, 50 analyses d'accroches et 150 commandes Discord par jour, 60 retouches par génération.
     `isUnlimited()` : l'interface affiche « Illimité » sans plafond ni reste ; si le plafond est atteint, « Limite de
     sécurité du jour atteinte » (jamais de chiffre). Les recherches Elite (50 par jour) restent un vrai quota affiché.
191. **Répartition des fonctions** (grille de l'utilisateur, appliquée côté serveur) : formats 5 en Starter (démo,
     avant-après, histoire, réponse à un commentaire, déballage), les 8 ensuite, contrôlés dans `createScripts` ; score
     « pour toi » retiré dès `toProductView` en Starter ; analyses de vidéo et propositions passent à un quota **mensuel**
     (`remainingThisMonth`) ; récap de la semaine à partir de Pro ; export des scripts (PDF, texte) rangé avec l'export
     CSV en Elite. Non cités par la grille, donc choisis : analyse des accroches d'un produit (Pro 10/jour, Elite
     illimité), commandes Discord (10, 40, illimité), retouches (10, 20, illimité), plans de contenu de préparation
     (3/jour pour tous les abonnés). Voir RAPPORT.
192. **Code formateur : −20 % sur le premier mois** (plus de 3 mois offerts). Un « premier mois » n'existe que dans
     l'abonnement mensuel : la remise vaut pour le premier paiement mensuel, une fois par compte (aucun abonnement
     avant). Stripe : coupon `tracktout_formateur_20` (20 %, `duration: once`) mis d'office dans la session Checkout,
     qui retire alors le champ « code promotionnel » (Stripe n'accepte pas les deux). Simulation : même montant
     facturé. Le formateur garde 30 % de ce qui est vraiment payé. Les essais ouverts avant la grille vont à leur terme.
193. **Démarrage immédiat et rétractation** : case obligatoire au-dessus des cartes de prix, avec le texte de
     `WITHDRAWAL_CONSENT_TEXT` (art. L221-25 : montant proportionnel au service fourni en cas de rétractation). Sans
     elle, le formulaire est bloqué dans le navigateur et refusé par l'action serveur. La demande est enregistrée par le
     serveur (fiche `consentement_paiement`, non modifiable depuis le navigateur, ajoutée à `is_server_record_kind` et
     vérifiée par le test RLS), recopiée dans les métadonnées Stripe de la session et de l'abonnement, rappelée sous le
     bouton de Stripe Checkout, puis confirmée par e-mail au premier abonnement actif (support durable, L221-13). CGV :
     section « Droit de rétractation » avec le texte exact et le formulaire type de l'annexe R221-1.
194. **Prix Stripe par `lookup_key`** (`tracktout_<plan>_<month|year>`) au lieu des 4 variables `STRIPE_PRICE_…` : plus
     rien à recopier sur Netlify pour une nouvelle grille. `stripe:setup` crée produits, 6 prix et coupon ; si un
     montant change, un nouveau prix reprend la clé (`transfer_lookup_key`) et l'ancien est archivé. Un abonnement est
     relié à son plan par la clé, sinon par `metadata.plan` du prix (les anciens `proplus` deviennent `elite`).
     L'admin peut aussi offrir un plan (`grantPlan` : abonnement `admin_…` sans facture, exclu du MRR), ce qui permet
     d'ouvrir l'appli en production tant que Stripe n'a pas de clé.
195. **Prix ajustés (14 novembre)** : Elite passe à 97,99 €/mois ; l'annuel vaut 8 mois (« 4 mois offerts ») : Starter
     279,90 €, Pro 479,90 €, Elite 779,90 € par an. Les libellés (« 4 mois offerts », économies, FAQ, description de la
     page Tarifs, sous-titre de l'accueil) sont calculés depuis `lib/plans.ts` (`annualOffer`, `yearlyBadge`) : Elite
     économise 4,04 mois, arrondi à « 4 mois offerts » par la règle existante (moins de 0,05 mois d'écart). En annuel,
     chaque carte affiche le prix mensuel équivalent (23,33 €, 39,99 €, 64,99 €), comme les CGV et l'e-mail de
     confirmation. Stripe : `npm run stripe:setup` crée les nouveaux prix et leur transfère les clés de recherche (les
     anciens sont archivés).

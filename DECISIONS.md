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
56. **Admin désigné par `ADMIN_EMAILS`** ; en mode local sans valeur, `admin@pepite.local`. L'admin
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
R9. **Logo** : la pépite avec le décalage cyan / rose posée sur un halo radial flou, comme le « e »
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
R17. **Titre sur trois lignes à 96 px** : le texte de Pépite est plus long que celui d'EtSmart ; le
     conteneur du héros passe de 896 à 1 024 px pour garder trois lignes comme sur la capture.
     Mesures à 1 440 px : pastille à 100 px du haut (101 sur la référence), boutons à 632 px (637),
     mention à 712 px (712).
R18. **Interlignes corrigés** : EtSmart est en Tailwind 4, où `leading-tight` l'emporte sur la taille
     responsive ; en Tailwind 3, `md:text-5xl` l'écrasait. On écrit taille et interligne ensemble
     (`md:text-8xl/[1.05]`, `md:text-5xl/tight`) pour retrouver les interlignes de la capture.
R19. **« Recommandé » et non « Le plus choisi »** sur le plan Pro : Pépite n'a pas encore
     d'abonnés, l'affirmation serait fausse, et la règle n° 2 de `CLAUDE.md` (aucun faux chiffre ni
     fausse preuve sociale) n'a pas été levée par le brief. À changer en une ligne
     (`components/pricing/pricing-cards.tsx`) quand ce sera vrai.
R20. **« Un seul outil pour tout automatiser. »** est conservé (texte du brief), avec un sous-titre
     qui précise ce qui est automatisé (« tout le travail avant de filmer ») : Pépite ne publie jamais
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
     CSS, Pépite à 1 440 px) pour le haut de page et la section « TOUT-EN-UN ».

## Session 3 — Brancher Pépite au réel

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

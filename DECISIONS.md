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

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

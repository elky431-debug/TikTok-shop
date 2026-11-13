# Session 5 · blocs 1 (radar), 2 (score) et 3 (fiche produit)

Code : `lib/radar/**` (nouveau), `lib/radar.ts`, `lib/radar-filters.ts`, `lib/data/nexscope.ts` (ajouts),
`lib/db/types.ts` (`ProductDetails` étendu, champs facultatifs), `app/app/page.tsx`, `app/app/actions.ts`,
`app/app/produit/[id]/*`, `app/app/comparer`, `app/app/alertes`, `app/app/recherche`, `app/api/radar/export`,
`components/product/*`. Tests : `tests/unit/radar-bloc1.test.ts`, `score-perso.test.ts`, `produit-fiche.test.ts`
(un `describe` par point). Aucune migration : tout passe par `user_records` (fiches) et `provider_cache` (cache serveur).

## Décisions

**B1. Documentation lue** (www.nexscope.ai/api-docs, 12 novembre 2026, liste tirée de `sitemap.xml`) :
`tiktok-product-discovery`, `tiktok-product-search`, `tiktok-batch-product-detail`, `chuhaijiang-tiktok-product-search`,
`chuhaijiang-tiktok-product-related-creators`, `chuhaijiang-tiktok-product-detail`, `tiktok-product-analytics`,
`data-et-list-seller-product`. Aucune route ni aucun champ hors de ces pages ; aucun appel réel payant pendant ce travail.

**B2. Recherche par mot-clé : `tiktok-product-discovery` avec `keyword`**
(https://www.nexscope.ai/api-docs/tiktok-product-discovery, paramètre « Search keywords (fuzzy matching of product
titles) »), `region: FR`, tri `day7_units_sold`, une page de 10 (11 à 22 crédits). Écartée : `tiktok-product-search`
(`POST /et/listProduct`), qui accepte aussi `keyword` mais ne documente ni boutique ni nombre d'affiliés, et dont
l'exemple publié donne « $ » pour la Thaïlande. Discovery est la route du relevé de nuit : devise « € » confirmée par
une vraie réponse, mêmes garde-fous (`mapNexscopeProduct` : pays, devise, commission, fiche anormale). Adresse appelée :
celle déjà vérifiée en réel la nuit (`…/skill-api/v1/skills/tiktok-product-discovery/run`) ; la page affiche
aujourd'hui l'adresse REST `POST https://api.nexscope.ai/fm/productSearch` (mêmes paramètres) : changer les deux
ensemble si Nexscope retire l'ancienne. Quota côté serveur (`keywordSearchesPerDay` 0 / 5 / 30) compté sur les fiches
`recherche` du jour ; relancer le même mot-clé le même jour ne compte pas. Cache serveur partagé de 24 h par pays et
mot-clé. Sans clé Nexscope : recherche dans le catalogue du jour, dite à l'écran. Testée avec une réponse au format
documenté (`tests/fixtures/nexscope-keyword-search.json`). Résultats montrés sur `/app/recherche` ; fiche ouverte
seulement si le produit est dans le radar du jour (sinon ni score ni historique).

**B3. Chiffres d'un produit** (`lib/radar/metrics.ts`) : ventes 7 jours = nos relevés (7 jours ou plus), sinon la
moyenne quotidienne du score × 7, sinon la période de la source ; ventes 30 jours = nos relevés (30 jours), sinon la
source. Si deux sources se contredisent (30 j < 7 j : observé entre discovery et batchProductDetail, 5 001 contre
10 855 ventes sur 7 jours pour le même produit), le chiffre 30 jours est masqué. Sous-catégorie = deuxième niveau de
« Catégorie TikTok Shop : A › B › C » (noms anglais de TikTok, non traduits).

**B4. Badges** (`lib/radar/badges.ts`, règle affichée au survol) — jamais sur une donnée absente :
- « Nouveau » : premier relevé de la source (`details.first_seen`) il y a moins de 30 jours (c'est la date où la
  source a vu le produit, pas forcément sa mise en vente) ;
- « En accélération » : ventes/jour des derniers jours ≥ 1,25 × celles de 7 jours, elles-mêmes ≥ 1,25 × celles de
  30 jours, avec au moins 5 ventes/jour ; rythmes tirés de nos relevés (14 jours ou plus) sinon des ventes par période
  de la source (30 jours ramenés aux jours couverts, 14 au moins) ; jamais en même temps que « En baisse » ;
- « Sous-exploité » : ≥ 20 ventes/jour et ≤ 1 affilié pour 2 ventes quotidiennes (seuil « peu d'affiliés » du score) ;
- « Saturé » : ≥ 30 affiliés et ≥ 5 affiliés par vente quotidienne ;
- « En baisse » : croissance 7 jours ≤ −20 % (seuil du score) ; tant qu'elle n'est pas mesurable, rythme de la
  semaine < 70 % de celui du mois. Pas répété quand le badge de tendance dit déjà « Baisse ».

**B5. Filtres avancés** : niche, sous-catégorie, prix (tranches ou min/max), commission %, commission € par vente,
ventes 7 et 30 jours, croissance, affiliés min/max, note, avis, « lancés depuis moins de 30 jours », signal (badge).
Un produit sans la donnée filtrée est écarté ; un filtre (ou une option de tri, une colonne) sans aucune donnée
aujourd'hui n'est pas proposé (`filterAvailability`). En Gratuit, les filtres ne débloquent rien (inchangé).

**B6. « Pourquoi maintenant »** (`lib/radar/why-now.ts`) : une entrée de cache par pays et par jour (48 h), une phrase
par produit, partagée par tous. Avec l'IA : générée par lots de 15 la nuit (`prepareWhyNow`), ou à l'ouverture d'une
fiche (8 s au plus, sinon phrase calculée affichée et la phrase de l'IA arrive en cache) ; chaque produit est réservé
pour la journée (`claimDailyTask`) avant l'appel ; le radar n'appelle jamais l'IA. Phrase refusée si elle dépasse
220 caractères, touche le garde-fou (promesses, gains, superlatifs) ou cite un nombre absent des chiffres fournis : la
phrase calculée la remplace (source « calcul »). Sans clé : phrase calculée, marquée simulation.

**B7. Vues et tri** : fiche `radar_reglages` (vue, tri, sens, poids). Modifiés seulement par une action serveur
(bouton, liste, en-tête de colonne), jamais pendant l'affichage d'une page. Tri sur toute colonne, valeur inconnue
toujours en bas. En Gratuit, le tri ne touche que les 3 produits visibles (les verrouillés gardent leur place) et
le tri par score n'est pas proposé (« Classement du jour »).

**B8. Score pour toi** (`lib/radar/personal.ts`) : mêmes valeurs de critères que le score, poids multipliés selon la
tranche d'abonnés — moins de 500 : concurrence ×1,5, prix ×1,3, commission ×0,8 ; 500 à 1 500 : ×1,4 / ×1,2 / ×0,9 ;
1 500 à 5 000 : inchangés ; 5 000 à 20 000 : commission ×1,25, concurrence ×0,8 ; plus de 20 000 : ×1,4 / ×0,7. Puis
+5 points si le style vidéo colle à la niche, −10 hors des niches choisies, et mise sur l'échelle du jour (15 à 90)
calculée sur tout le catalogue. Expliqué en phrases sur la fiche ; masqué en Gratuit avec le score.

**B9. Styles × niches (hypothèse business, à valider)** : face caméra → beauté, mode, bébé ; voix off → tech,
maison, animaux ; mains → maison, tech, beauté ; avant-après → beauté, maison, sport.

**B10. Poids réglables (Pro+, vérifié côté serveur)** : 4 curseurs (0 à 100, ramenés sur 100), deux réglages tout
prêts (« Plus de commission » 25/45/20/10, « Plus de croissance » 55/15/20/10) et « Revenir au réglage par défaut ».
Avec des poids réglés, le score du radar, des fiches, du comparateur et de l'export est recalculé puis remis sur
l'échelle du jour ; sans réglage, c'est le score enregistré. La fiche le dit et garde les phrases et les points par
défaut de chaque critère. Ignorés hors Pro+, même s'ils sont enregistrés.

**B11. Évolution du score** : instantanés `product_snapshots.score` des 30 derniers jours, courbe Recharts sur 15–90
(score général, poids par défaut), dès deux relevés ; masquée en Gratuit.

**B12. Favoris et comparateur** : fiche `favoris` (50 au plus), étoile dans la vue liste et sur la fiche. `/app/comparer`
(Pro et Pro+) : 2 à 4 produits parmi favoris et Mes produits, une ligne par critère, meilleure valeur marquée (moins
d'affiliés = meilleur), lignes sans donnée masquées.

**B13. Alertes** (`lib/radar/alerts.ts`, `/app/alertes`) : une règle = critères du radar (au moins un). Limite d'alertes
actives côté serveur (Gratuit 0, Pro 3, Pro+ sans limite) ; après un changement de plan, seules les plus anciennes dans
la limite sont vérifiées. À la création, les produits qui remplissent déjà la règle sont « connus ». Chaque nuit
(`checkAlerts`) : une notification `notify` (canaux choisis : push, e-mail, Discord) par alerte et par jour au plus,
pour les seuls nouveaux produits ; un produit n'est marqué connu qu'une fois annoncé. Rien sans relevé du jour ; sur
le catalogue fictif, la notification le dit. Bouton « Créer une alerte » de la fiche = formulaire pré-rempli (niche,
sous-catégorie, palier de commission).

**B14. Export CSV (Pro+)** : `GET /api/radar/export?<filtres>`, passe par `getRadar` (mêmes filtres, tri mémorisé,
jamais un produit verrouillé). `;`, virgule décimale, UTF-8 avec BOM, CRLF ; texte commençant par `= + - @` préfixé
d'une apostrophe ; donnée inconnue = cellule vide.

**B15. Simulation** : vidéos × vues × clic × conversion × commission par vente du jour. Valeurs de départ : 500 vues
(volontairement basses, « mets la moyenne de tes vidéos »), 1 % de clic et 2 % de conversion (hypothèses prudentes,
pas des moyennes mesurées), 20 vidéos (objectif du produit). Résultat en fourchette (×0,5 à ×1,5), avec la mention
« Simulation, pas une promesse… peuvent être nuls ». Calcul dans le navigateur, rien n'est enregistré.

**B16. Accroches** (`lib/radar/hook-analysis.ts`) : à partir de la description et des chiffres des 5 vidéos (aucune vidéo
téléchargée ni regardée) : type d'accroche, durée lue dans la source (court < 20 s, moyen ≤ 45 s, long), structure,
pourquoi ça accroche, résumé. Une accroche que l'IA ne recopie pas du texte est remplacée par les premiers mots ;
champs passés au garde-fou. Cache serveur 7 jours par produit et liste de vidéos, partagé ; seule une nouvelle analyse
compte dans `hookAnalysesPerDay` (Pro 10, Pro+ 50).

**B17. Créateurs qui vendent ce produit : section masquée.** La seule route trouvée,
`chuhaijiang-tiktok-product-related-creators` (`POST https://api.nexscope.ai/cj/products/related-creators`, 38 crédits),
ne documente que des identifiants et un e-mail public éventuel : ni nom affiché, ni ventes, ni audience
(`tiktok-product-analytics` filtre par créateur mais n'en liste pas). Elle ne dit pas qui vend le mieux et ramènerait
des données personnelles inutiles (règle déjà suivie pour les vidéos : jamais le pseudo du créateur).

**B18. Produits proches** : même sous-catégorie TikTok Shop dans le catalogue du jour (sinon même niche), et même
boutique (nom identique à la casse près), triés par score, 4 au plus, limités à ce que le compte peut ouvrir.

**B19. Chiffre d'affaires, prix minimum et maximum : masqués.** `tiktok-batch-product-detail` les annonce en dollars
(« Minimum SKU price (USD) ») sans champ de devise, et la vraie réponse du 12 novembre donne 0,01 pour un produit vendu
2,90 € (discovery) avec un chiffre d'affaires sans rapport avec ventes × prix. `ProductDetails` accepte
`price_min_cents`, `price_max_cents`, `revenue_cents`, remplis seulement si la réponse déclare « € » ou « EUR » (fiche
prête, rien d'affiché aujourd'hui). La recherche par mot-clé montre la fourchette `minPrice`–`maxPrice` de discovery,
dont la devise « € » est vérifiée.

**B20. Boutons de la fiche** : « Écrire mes scripts » (studio), « Ajouter à mes produits », « Planifier 20 vidéos »
(`/app/plan?produit=<id>` : la page du plan ne pré-sélectionne pas encore ce paramètre, à faire par son propriétaire),
« Créer une alerte », « Mettre en favori », « Comparer mes favoris ».

**B21. Lint dans cette copie** : `next lint` signale un conflit de greffon parce que la copie de travail est rangée
dans le dépôt principal (deux `.eslintrc.json` empilés, sans `root: true`) ; vérifié avec
`npx eslint --no-eslintrc -c .eslintrc.json` (aucune erreur) et `tsc --noEmit`. Rien à changer dans le dépôt lui-même.

## État des points

| Point | État | Plan | Quota |
| --- | --- | --- | --- |
| 1.1 Filtres avancés | Marche en réel ; filtre masqué sans donnée (sous-catégorie, note, nouveauté absentes du catalogue fictif) | Tous (Gratuit : sur ses 3 produits) | — |
| 1.2 Badges | Marche en réel, règles B4 ; masqué sans donnée | Tous | — |
| 1.3 Pourquoi maintenant | Réel avec clé d'IA, simulé sans | Tous (produits visibles) | 1 génération / produit / jour, partagée |
| 1.4 Recherche par mot-clé | Réel avec clé Nexscope (non appelé ici), sinon catalogue du jour | Pro, Pro+ | 0 / 5 / 30 par jour, cache 24 h |
| 1.5 Favoris, comparateur | Marche | Favoris : tous ; comparateur : Pro, Pro+ | 50 favoris, 2 à 4 produits |
| 1.6 Alertes | Marche (`checkAlerts` à brancher la nuit) ; push sans effet tant que le push n'est pas branché | Pro, Pro+ | 0 / 3 / illimité actives |
| 1.7 Vues et tri mémorisés | Marche | Tous (tri par score : Pro, Pro+) | — |
| 1.8 Export CSV | Marche | Pro+ | — |
| 2.1 Score pour toi | Marche (B8, B9) | Pro, Pro+ | — |
| 2.2 Évolution du score 30 j | Marche (instantanés) | Pro, Pro+ | — |
| 2.3 Poids réglables | Marche | Pro+ | — |
| 2.4 Explication en phrases | Marche, toujours visible | Tous | — |
| 3.1 Courbe / périodes, note, avis | Réel ; CA et prix min/max masqués faute de données fiables en euros (B19) | Tous | — |
| 3.2 Simulation | Marche (hypothèses B15) | Tous | — |
| 3.3 Accroches analysées | Réel avec clé d'IA, simulé sans | Pro, Pro+ | 0 / 10 / 50 par jour, cache 7 j |
| 3.4 Créateurs du produit | Masqué faute de route documentée utile (B17) | — | — |
| 3.5 Similaires, même boutique | Marche (similaires par niche sans catégorie) | Tous (limité aux fiches ouvertes) | — |
| 3.6 Boutons d'action | Marche (B20) | Tous (alertes, comparateur : Pro) | — |

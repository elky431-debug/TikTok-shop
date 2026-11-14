# Tracktout

Le radar du matin des affiliés TikTok Shop, en français : chaque matin, les produits qui montent dans tes niches,
un score d’opportunité expliqué, et des scripts vidéo prêts à tourner. Proposé aussi aux formateurs TikTok Shop
pour leurs élèves.

> « Tracktout » est un nom de travail : il vit dans une seule constante, `lib/brand.ts`.

- `CLAUDE.md` : résumé du projet, de la stack et des règles.
- `DECISIONS.md` : toutes les décisions techniques et de design, avec leur raison.
- `RAPPORT.md` : ce qui marche, ce qui est simulé, les clés à renseigner, les prochaines étapes.
- `docs/captures/` : captures d’écran des pages principales (mobile et desktop).

---

## 1. Lancer en local, sans aucune clé

Il te faut **Node.js 20.19 ou plus récent** (`node -v` ; le fichier `.nvmrc` indique 22). Installe toujours depuis
la racine du projet, avec `npm ci` (il suit exactement `package-lock.json`). Avant chaque build, une vérification
dit quel paquet manque et quoi lancer, au lieu de l'erreur « Module not found » de Next.

```bash
npm ci
```

```bash
npm run seed
```

```bash
npm run dev
```

Ouvre http://localhost:3000. Sans clé, l’appli tourne en **mode local** :

| Brique | En mode local |
| --- | --- |
| Base de données | fichier `.data/local-db.json` (créé et rempli tout seul) |
| Connexion | lien magique affiché à l’écran, pas d’e-mail |
| Produits | 200 produits fictifs réalistes, 30 jours d’historique |
| Scripts | générateur simulé (pas d’appel à Claude) |
| Paiement | simulé, sans carte (même traitement que Stripe) |
| E-mails | rangés dans la boîte locale, visible dans `/admin` |

Comptes utiles (créés par `npm run seed`) — connecte-toi avec ces adresses, le lien s’affiche à l’écran :

- `admin@tracktout.local` → `/admin` (plan Elite offert : passer un compte en formateur, donner un plan à la main,
  lancer la tâche nocturne, voir les e-mails) ;
- `formateur@tracktout.local` → `/formateur` (plan Elite offert, code `DEMO30`, deux élèves de démonstration) ;
- n’importe quelle autre adresse → nouveau compte, onboarding, choix de l’abonnement (paiement simulé en local) puis
  radar. Tout est payant : sans abonnement, l’appli renvoie au choix du plan.

Pour tester le code formateur (−20 % sur le premier mois) : ouvre http://localhost:3000/r/DEMO30 puis inscris-toi avec
une nouvelle adresse.

### Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` puis `npm start` | version de production |
| `npm run lint` | ESLint + vérification TypeScript |
| `npm test` | tests unitaires (Vitest) : score, limites de plan, webhooks, studio… |
| `npm run test:e2e` | 3 parcours Playwright (inscription, scripts, paiement) |
| `npm run seed` | 30 jours d’historique fictif (+ comptes de démo en local) ; vrai rafraîchissement si un fournisseur réel est configuré |
| `npm run db:setup` | Supabase réel : migrations, types TypeScript, seed |
| `npm run auth:setup` | Supabase réel : adresses de retour, modèle français du lien magique, SMTP Resend, Google |
| `npm run test:integration` | tests contre les vrais services présents (Supabase, Resend…) ; ne lance rien sans clés |
| `npm run ai:sample` | 3 scripts de test avec le vrai fournisseur d’IA, français relu, dans `docs/exemples-scripts/` |
| `npm run score:distribution` | distribution des scores sur la base actuelle |
| `npm run data:enrich -- --videos 3` | complète les produits réels en base : ventes par période, vidéos des N meilleurs (appels payants) |
| `npm run check:sql` | applique les migrations sur un Postgres jetable et teste la RLS (si PostgreSQL est installé) |
| `npm run stripe:setup` | crée les produits et prix Stripe, affiche les identifiants à copier |
| `npm run screenshots` | captures d’écran des pages principales (voir l’en-tête de `scripts/screenshots.mjs`) |

Pour Playwright, la première fois : `npx playwright install chromium`.

---

## 2. Renseigner les clés

Copie `.env.example` en `.env.local` et remplis ce que tu as. **Chaque brique s’active seule** dès que ses clés
sont présentes ; les autres restent simulées. Le détail de chaque variable est commenté dans `.env.example`.

### Supabase (base + connexion)

1. Crée un projet sur https://supabase.com, dans une **région européenne** (Paris ou Francfort).
2. **Project Settings → API** : copie l’URL, la clé `anon` (ou « publishable ») et la clé `service_role` (ou
   « secret ») dans `.env.local`. Pour les migrations, au choix :
   - **conseillé** : un jeton personnel (**Account → Access Tokens**) dans `SUPABASE_ACCESS_TOKEN`. Tout passe par
     l’API de gestion de Supabase en HTTPS, même là où le port 5432 de Postgres est fermé ;
   - ou **Connect → Session pooler** : la chaîne de connexion (avec le mot de passe de la base) dans
     `SUPABASE_DB_URL`.
   Ni l’un ni l’autre ne sert à l’appli : ne les mets pas sur Netlify.
3. **Réglage de la connexion, en une commande** (avec `SUPABASE_ACCESS_TOKEN`) :

   ```bash
   npm run auth:setup
   ```

   Elle règle par l’API de gestion de Supabase :
   - *Site URL* = `NEXT_PUBLIC_SITE_URL`, et les adresses de retour `…/auth/callback**` du site et de
     `http://localhost:3000` (les `**` laissent passer le paramètre `?suite=` qui ramène à la page demandée) ;
   - le sujet et le modèle **en français** du lien magique, avec un lien `token_hash` vers `/auth/callback` (il marche
     même si l’e-mail est ouvert sur un autre appareil) ;
   - si `RESEND_API_KEY` et `EMAIL_FROM` sont là : l’envoi des e-mails de connexion par le **SMTP de Resend**
     (`smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = la clé). Sans SMTP, Supabase n’envoie que
     quelques e-mails de connexion par heure : indispensable avant d’ouvrir le site ;
   - si `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont là : la connexion Google (voir « Connexion Google »).

   Relance-la après chaque changement de domaine ou de clé. Sans jeton, les mêmes réglages se font à la main :
   **Authentication → URL Configuration**, **Email Templates → Magic Link** (modèle dans `scripts/auth-setup.ts`),
   **Sign In / Providers → Google** et **Project Settings → Authentication → SMTP**.
4. Mets la base en place, en une commande :

   ```bash
   npm run db:setup
   ```

   Elle applique les migrations, régénère les types TypeScript (`lib/db/database.types.ts`), puis lance
   `npm run seed`. Avec `SUPABASE_ACCESS_TOKEN`, chaque migration est enregistrée sous son nom de fichier chez
   Supabase : une relance n’applique que les nouvelles. Avec `SUPABASE_DB_URL` : `psql` s’il est installé, sinon
   la CLI Supabase (les migrations sont rejouables). Options : `-- --sans-types`, `-- --sans-seed`.
5. Vérifie tout contre les vrais services :

   ```bash
   npm run test:integration
   ```

   Chaque méthode de `SupabaseRepo`, la RLS avec deux utilisateurs et un formateur, l’authentification (lien
   magique, lien réutilisé, déconnexion) puis le parcours de connexion dans le navigateur (Playwright, port 3300).
   Les tests créent des comptes `itest-…@example.com` et les suppriment à la fin. Chaque autre service est testé
   pour de vrai quand ses clés sont là (Resend : un e-mail de test à `ADMIN_EMAILS` ; Stripe, Discord : voir leurs
   sections) ; la commande dit lesquels sont ignorés. Ajoute `E2E_GOOGLE=1` une fois Google activé pour vérifier
   aussi le bouton Google. Sans aucune clé, elle ne lance rien (`INTEGRATION_REQUIRED=1` la fait échouer dans ce
   cas, pour la CI).

**Avec un fournisseur de données réel** (clés TikTok ou Nexscope présentes), `npm run seed` fait un vrai
rafraîchissement au lieu de charger 30 jours fictifs : aucun produit fictif n’arrive dans une base de production.

### Connexion Google

1. https://console.cloud.google.com → crée un projet (ou choisis-en un) → **APIs & Services → OAuth consent screen**
   (« Google Auth Platform » → *Branding*) : type **External**, nom de l’appli, e-mail d’assistance, logo facultatif,
   domaine autorisé = ton domaine (ex. `tracktout.com`) et `supabase.co`, liens vers `/confidentialite` et `/cgv`.
   Champs d’accès (*Data access*) : `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, rien d’autre.
2. **Clients → Create client** : type **Web application**.
   - *Authorized JavaScript origins* : `https://tracktout.com` (ton `NEXT_PUBLIC_SITE_URL`) et `http://localhost:3000` ;
   - *Authorized redirect URIs* : **`https://<ref>.supabase.co/auth/v1/callback`** (`<ref>` = la référence de ton projet,
     visible dans `NEXT_PUBLIC_SUPABASE_URL`). C’est Supabase qui reçoit le retour de Google, puis renvoie vers
     `/auth/callback` du site (déjà autorisé par `npm run auth:setup`).
3. Copie l’identifiant dans `GOOGLE_CLIENT_ID` et le secret dans `GOOGLE_CLIENT_SECRET` (`.env.local` seulement : ces
   deux clés ne servent pas au site, inutile de les mettre sur Netlify).
4. `npm run auth:setup` : active le fournisseur Google dans Supabase avec ces clés (API de gestion).
5. Publie l’écran de consentement (*Audience → Publish app*) ; tant qu’il est en test, seuls les comptes de test ajoutés
   peuvent se connecter.
6. Vérifie : `E2E_GOOGLE=1 npm run test:integration` (le bouton « Continuer avec Google » doit mener à
   `accounts.google.com` avec la bonne adresse de retour).

### IA (scripts)

Le studio marche avec **OpenAI ou Claude**, au choix : `AI_PROVIDER=openai` (`OPENAI_API_KEY`, modèle
`OPENAI_MODEL`, `gpt-6-luna` par défaut, le moins cher qui gère les sorties JSON structurées) ou `AI_PROVIDER=anthropic` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`). Les deux
passent par la même chaîne : sortie JSON imposée par le schéma Zod, nouvel essai si le JSON est invalide ou enfreint
les règles, liste des interdits (promesses médicales, superlatifs, gains), ligne #publicité ajoutée par le serveur.
Sans clé, le générateur simulé prend le relais.

Pour juger la qualité du français avant de lancer :

```bash
npm run ai:sample
```

3 générations réelles (un vrai produit, deux fictifs, formats et styles différents), relues automatiquement
(vouvoiement, anglicismes, hashtags anglais, longueur des accroches, interdits), écrites dans
`docs/exemples-scripts/<date>-<fournisseur>.md`. Coûte 3 générations chez le fournisseur.

### Stripe (abonnements)

1. Mets ta clé `STRIPE_SECRET_KEY` (commence par `sk_test_` en test : tout ce qui suit se fait d’abord en test).
2. Crée dans Stripe (*Product catalog*) les produits Starter, Pro et Elite et leurs 6 prix récurrents en euros, avec
   ces clés de recherche (*lookup key*) : `starter_mensuel`, `starter_annuel`, `pro_mensuel`, `pro_annuel`,
   `elite_mensuel`, `elite_annuel`, aux montants de `lib/plans.ts` (34,99 €/mois, 279,90 €/an ; 59,99 €/mois,
   479,90 €/an ; 97,99 €/mois, 779,90 €/an). Puis lance `npm run stripe:setup` : il vérifie ces 6 prix (un écart de
   montant, de devise ou de période arrête le script), crée ou met à jour la **configuration du portail client**
   (changement de plan et de période au prorata, résiliation en fin de période avec un motif, carte, factures) et écrit
   `STRIPE_PORTAL_CONFIGURATION` dans `.env.local`. Il ne crée ni produit, ni prix, ni coupon.
   Codes formateurs : crée un code promo par formateur dans Stripe (*Coupons* → coupon −20 % « une fois », puis un
   *promotion code* à son nom) ; le paiement affiche toujours le champ « code promotionnel ».
   Image de marque de Stripe (*Settings → Branding*) : icône `public/brand/tracktout-icone-512.png` (le T fléché, carré),
   logo `public/brand/tracktout-logo.png` ; couleur d'accent `#E0144A`. Stripe ne permet pas de les régler par l'API
   pour son propre compte : à faire une fois dans le tableau de bord.
3. **Webhook**, une fois le site en ligne : `npm run stripe:setup -- --webhook --site=https://tracktout.com` crée le
   point de terminaison `https://tracktout.com/api/stripe/webhook` avec ses 9 événements et écrit son secret dans
   `.env.local` (`STRIPE_WEBHOOK_SECRET`, jamais affiché). Ajoute `--netlify` (avec `NETLIFY_AUTH_TOKEN` et
   `NETLIFY_SITE_ID` dans `.env.local`) pour enregistrer aussi `STRIPE_WEBHOOK_SECRET` et `STRIPE_PORTAL_CONFIGURATION`
   dans les variables du site Netlify, puis redéploie. À la main : *Developers → Webhooks → Add endpoint* avec
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`,
   `invoice.payment_failed`, `charge.refunded`. En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. **Relances de paiement** (*Settings → Billing → Subscriptions and emails*) : garde les nouveaux essais
   automatiques (« Smart Retries ») et choisis d’annuler l’abonnement si tous échouent. Pendant les essais, l’abonné
   garde son accès (statut « past_due »), reçoit notre e-mail « Ton paiement n’est pas passé » et voit un bandeau avec
   le bouton « Mettre à jour ma carte » dans son compte.
5. Vérifie tout en mode test : `npm run test:integration` (avec `STRIPE_SECRET_KEY` en `sk_test_`, après
   `npm run stripe:setup`) crée de vrais abonnements de test (changement de plan, remboursement, résiliation, carte
   refusée), vérifie le plan et les commissions, puis supprime ses clients de test.
6. (Facultatif) Stripe Tax si tu factures la TVA.

Ce que font les webhooks : le plan suit l’abonnement (le meilleur des abonnements actifs), chaque facture payée par
un filleul crée la commission du parrain ou du formateur (30 %, une seule fois par facture), un remboursement annule
cette commission au prorata du montant remboursé, et une résiliation ferme l’appli (retour au choix de l’abonnement)
à la fin de la période payée. Un nouvel abonnement actif déclenche l’e-mail de confirmation (support durable : plan,
prix, demande de démarrage immédiat, rétractation).

### Resend (e-mails)

`RESEND_API_KEY` et `EMAIL_FROM` (un expéditeur d’un domaine vérifié dans Resend, ex.
`Tracktout <bonjour@tracktout.com>`). `FOUNDER_EMAIL` reçoit les demandes de partenariat des formateurs (à défaut, le
premier de `ADMIN_EMAILS`).

- **Lien de connexion** : envoyé par Supabase à travers le SMTP de Resend (`npm run auth:setup`). Sans Supabase, le
  lien s’affiche à l’écran, **en local seulement** : sur un site déployé (Netlify ou adresse https publique), la
  connexion est refusée tant que Supabase n’est pas branché.
- **Récap du matin** : programmé à l’heure choisie par chacun (`scheduledAt`), une seule fois par jour (clé
  d’idempotence par personne et par jour), avec la désinscription en un clic des messageries (en-têtes
  `List-Unsubscribe` et `List-Unsubscribe-Post`) et un lien visible vers `/desinscription`.
- **Vérifier** : avec `ADMIN_EMAILS` renseigné, `npm run test:integration` envoie un vrai e-mail de test au premier
  administrateur.

### Données produits

**Jamais de scraping de TikTok** : uniquement l’API officielle TikTok Shop ou un fournisseur sous contrat.
`DATA_PROVIDER=auto` (par défaut) prend TikTok si ses clés sont là, sinon Nexscope, sinon les données fictives.

- **Nexscope** (la voie réaliste aujourd’hui pour la France) : crée une clé sur
  https://www.nexscope.ai/seller/api-access et mets-la dans `NEXSCOPE_API_KEY`. Chaque nuit : 7 niches ×
  `DATA_PAGES_PER_NICHE` pages de 10 produits, plus les vidéos des `NEXSCOPE_MAX_VIDEO_CALLS_PER_NIGHT` meilleurs produits (10 par défaut, sauf ceux chargés
  il y a moins de 3 jours) et les ventes par période des produits qui ont moins de 7 jours de relevés.
  Chaque appel coûte des crédits Nexscope : règle `DATA_MAX_CALLS_PER_NIGHT` en conséquence.
- **API officielle TikTok Shop** (`TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET`, `TIKTOK_ACCESS_TOKEN`) : application
  créée sur le Partner Center, API « Affiliate Creator » activée par TikTok, et jeton d’un compte créateur qui a
  autorisé l’appli. **La documentation indique que ces API ne sont pas encore ouvertes dans l’UE** : voir
  `DECISIONS.md` (décision 78) avant d’engager quoi que ce soit.

Ensuite, depuis `/admin`, clique **Lancer le rafraîchissement** : le radar affiche les vrais produits France.
L’écran admin dit quelle source a servi, combien d’appels ont été faits, et liste les domaines d’images refusés
(à ajouter dans `IMAGE_HOSTS` s’ils sont légitimes, puis redéployer). Si la source réelle échoue une nuit, la tâche
bascule en repli et l’écrit dans l’admin ; les utilisateurs gardent les derniers vrais relevés, datés au-delà de
36 heures (« Données du … »). Les produits fictifs ne sont montrés que s’il n’existe aucun vrai relevé, toujours avec
la mention « produits fictifs ».

## 3. Mettre en ligne sur Netlify

Tracktout tourne sur Netlify sans configuration spéciale : Netlify reconnaît Next.js 14 tout seul (son adaptateur
OpenNext), lit `netlify.toml` (commande de build, dossier des fonctions) et `.nvmrc` (Node 22).

**La tâche nocturne.** Netlify lance `netlify/functions/nightly-refresh.mts` chaque jour à **3 h UTC**, soit 4 h à
Paris l’hiver et 5 h l’été. Cette fonction appelle `/api/cron/refresh` avec `CRON_SECRET`. Une fonction planifiée ne
dispose que de 30 secondes : la route passe donc le travail à `nightly-refresh-background`, une fonction
d’arrière-plan qui a 15 minutes, puis répond tout de suite. Les deux refusent tout appel sans le bon `CRON_SECRET`.

**Surveillance.** `GET /api/health` répond `ok`, `degraded` (avec la liste des problèmes) ou `down` (HTTP 503 : base
injoignable ou relevé de plus de 36 heures), sans aucun secret. Branche-la sur un outil de surveillance gratuit
(UptimeRobot, Better Stack…).

### Liste de vérification de mise en ligne

Suis les étapes dans l’ordre : chacune dépend des précédentes. Compte une heure la première fois.

**1. Créer le site sur Netlify**
1. Crée un compte sur https://app.netlify.com (connexion avec GitHub, c’est le plus simple).
2. **Add new project → Import an existing project → GitHub**, autorise Netlify, choisis le dépôt.
3. Sur l’écran de configuration, ne change rien : la commande (`npm run build`) et le dossier (`.next`) viennent de
   `netlify.toml`. **N’appuie pas encore sur Deploy** si l’écran le permet : ajoute d’abord les variables (étape 2).
   Si le premier déploiement part quand même, il échouera ou tournera en mode local : ce n’est pas grave.

**2. Ajouter les variables** (*Project configuration → Environment variables → Add a variable*). Pour chacune,
laisse les portées (*scopes*) par défaut : elles doivent inclure **Builds** et **Functions**. Ne mets rien dans
`netlify.toml` : les fonctions ne voient pas les variables écrites dans ce fichier.

| Variable | Valeur |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | l’adresse définitive, en `https://`, sans `/` final : celle du domaine de l’étape 3, ou `https://<nom>.netlify.app` en attendant |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `CRON_SECRET` | une longue suite aléatoire (`openssl rand -hex 32`) |
| `ADMIN_EMAILS` | ton adresse (plusieurs : séparées par des virgules) |
| `AI_PROVIDER` + `OPENAI_API_KEY` (ou `ANTHROPIC_API_KEY`) | ta clé du fournisseur d’IA |
| `NEXSCOPE_API_KEY` | ta clé Nexscope (sinon, produits fictifs signalés comme tels) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION` | étape 5 |
| `RESEND_API_KEY`, `EMAIL_FROM`, `FOUNDER_EMAIL` | étape 6 |
| `DISCORD_…`, `NEXT_PUBLIC_DISCORD_INVITE_URL` | section 4 (Discord) |

Ne mets **jamais** `SUPABASE_DB_URL` ni `SUPABASE_ACCESS_TOKEN` sur Netlify : ils ne servent qu’à `npm run db:setup`,
depuis ton poste. Après chaque changement de variable, il faut **redéployer** (*Deploys → Trigger deploy → Deploy
project*) : chaque déploiement garde les valeurs du moment où il a été construit.

**3. Le domaine** (*Domain management → Add a domain*) : saisis ton domaine et suis les instructions DNS de Netlify
(chez ton registraire). Attends que le certificat HTTPS soit actif (quelques minutes à quelques heures). Vérifie que
`NEXT_PUBLIC_SITE_URL` est exactement cette adresse, puis redéploie.

**4. Supabase** (*Authentication → URL Configuration*)
- *Site URL* = `NEXT_PUBLIC_SITE_URL` ;
- *Redirect URLs* : ajoute `<NEXT_PUBLIC_SITE_URL>/auth/callback**` ;
- depuis ton poste : `npm run db:setup` (migrations, une seule fois par mise à jour), puis `npm run test:integration`.

**5. Stripe en production**
- en local, mets ta clé `sk_live_…` et `NEXT_PUBLIC_SITE_URL` = l’adresse publique, puis
  `npm run stripe:setup -- --webhook` : produits, prix, portail client et webhook sont créés ;
- copie dans les variables Netlify `STRIPE_PORTAL_CONFIGURATION` (affiché) et `STRIPE_WEBHOOK_SECRET` (écrit dans
  `.env.local`), puis redéploie (les anciennes variables `STRIPE_PRICE_…` ne servent plus : tu peux les retirer) ;
- règle les relances de paiement (section 2, Stripe, point 4), puis fais un vrai paiement, un remboursement depuis
  le tableau de bord Stripe et une résiliation, et vérifie le plan dans `/app/compte`.

**6. Resend**
- *Domains → Add domain* sur resend.com, ajoute les enregistrements DNS demandés (SPF, DKIM), attends « Verified » ;
- `EMAIL_FROM` = une adresse de ce domaine (ex. `Tracktout <bonjour@ton-domaine.fr>`), puis redéploie ;
- branche Resend comme SMTP de Supabase : `npm run auth:setup` en local avec les clés de production (section 2,
  Supabase, étape 3) ;
- `npm run test:integration` doit envoyer un e-mail de test à `ADMIN_EMAILS`.

**7. Tester la tâche nocturne**
1. *Logs & metrics → Functions* : `nightly-refresh` doit porter le badge **Scheduled** et afficher sa prochaine
   exécution. Clique dessus, puis **Run now**.
2. Ouvre `nightly-refresh-background` dans la même liste : ses journaux doivent finir par « tâche nocturne
   terminée ». Dans `/admin`, la dernière tâche doit être verte, sans encadré « Repli ».
3. Le radar doit montrer les vrais produits France, sans la mention « produits fictifs ».
4. `curl -sS "<NEXT_PUBLIC_SITE_URL>/api/health"` doit répondre `"status":"ok"`.
5. Le lendemain matin, `/admin` doit montrer une tâche « Planifiée » réussie.

## 4. Brancher Discord (rien à héberger à part)

Le bot n’a **pas de processus permanent** : Discord appelle le site pour les commandes (« interactions HTTP »,
route `/api/discord/interactions`), et une fonction planifiée Netlify, toutes les heures, envoie les messages par
l’API de Discord. Pas de serveur à louer, pas de second hébergeur : c’est la solution la plus simple et la moins
chère (0 € de plus que le site).

Ce qu’il fait :
- `/lier CODE` : lie un compte Discord à un compte de l’appli (code obtenu sur la page **Récap**, valable 15 minutes,
  une seule fois) ; `/delier` retire la liaison ;
- chaque matin, à l’heure choisie par chacun : le récap en **message privé** (tous les abonnés, si « Discord » est coché
  dans les réglages du récap), une seule fois par jour ;
- chaque jour à `DISCORD_PUBLIC_POST_HOUR` (8 h, heure de Paris, par défaut) : 3 produits **masqués** dans le salon
  public, le radar complet dans le salon Pro ;
- le rôle Pro suit le plan : tout de suite à la liaison et à chaque changement d’abonnement, et une vérification
  complète par jour.

**Pas à pas**
1. https://discord.com/developers/applications → **New Application** → nomme-la.
2. **General Information** : copie l’*Application ID* dans `DISCORD_APPLICATION_ID` et la *Public Key* dans
   `DISCORD_PUBLIC_KEY`.
3. Onglet **Bot** → **Reset Token** → copie le jeton dans `DISCORD_BOT_TOKEN` (secret : seulement dans `.env.local`
   et sur Netlify).
4. **OAuth2 → URL Generator** : coche `bot` et `applications.commands`, puis les permissions *Manage Roles*,
   *Send Messages*, *Embed Links*. Ouvre l’URL générée et invite le bot sur ton serveur.
5. Dans ton serveur (Paramètres → Avancés → mode développeur, puis clic droit → *Copier l’identifiant*) :
   - copie l’identifiant du serveur dans `DISCORD_GUILD_ID` ;
   - crée un rôle **Pro**, place le rôle du bot **au-dessus**, copie son identifiant dans `DISCORD_PRO_ROLE_ID` ;
   - crée `#produits-du-jour` (visible par tous) et `#radar-pro` (visible seulement par le rôle Pro), copie leurs
     identifiants dans `DISCORD_PUBLIC_CHANNEL_ID` et `DISCORD_PRO_CHANNEL_ID` ;
   - crée un lien d’invitation permanent et mets-le dans `NEXT_PUBLIC_DISCORD_INVITE_URL` (affiché dans l’appli).
6. Mets toutes ces variables sur Netlify (portées *Builds* et *Functions*), redéploie, puis, en local avec les mêmes
   valeurs et `NEXT_PUBLIC_SITE_URL` = l’adresse publique :

   ```bash
   npm run discord:setup
   ```

   Il enregistre `/lier` et `/delier` sur ton serveur et règle l’adresse des interactions de l’application
   (`<NEXT_PUBLIC_SITE_URL>/api/discord/interactions`) ; Discord la vérifie aussitôt en envoyant un message signé.
7. Vérifie : `npm run test:integration` (jeton, adresse, commandes, salons et rôle, en lecture seule), puis tape
   `/lier` avec un code de la page Récap. Dans Netlify, *Logs & metrics → Functions* : `discord-hourly` porte le badge
   **Scheduled** ; `discord-hourly-background` journalise chaque heure les récaps envoyés.

Sans `DISCORD_BOT_TOKEN`, rien n’est envoyé et l’appli marche normalement ; chaque partie manquante (salons, rôle) est
simplement sautée.

---

## 5. Architecture en bref

```
app/(public)/       accueil, prix, formateurs, pages légales
app/app/            l'appli : radar, fiche produit, studio, mes produits, récap, parrainage, compte
app/formateur/      espace formateur        app/admin/   administration
app/api/            cron, webhook Stripe, interactions Discord, désinscription, visuels produits
lib/db/             accès aux données (Supabase ou fichier local), une seule interface
lib/data/           fournisseurs de données produits (mock, TikTok, Nexscope)
lib/score.ts        score d'opportunité          lib/plans.ts   plans et limites
lib/ai/             génération des scripts (OpenAI, Claude, simulé), garde-fou
lib/billing/        paiement (Stripe, simulation), indépendant du reste
emails/             e-mails React Email          lib/discord/  Discord (interactions + API REST)
supabase/           migrations SQL + tests RLS   tests/        Vitest et Playwright
```

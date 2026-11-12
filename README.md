# TikTrend

Le radar du matin des affiliés TikTok Shop, en français : chaque matin, les produits qui montent dans tes niches,
un score d’opportunité expliqué, et des scripts vidéo prêts à tourner. Proposé aussi aux formateurs TikTok Shop
pour leurs élèves.

> « TikTrend » est un nom de travail : il vit dans une seule constante, `lib/brand.ts`.

- `CLAUDE.md` : résumé du projet, de la stack et des règles.
- `DECISIONS.md` : toutes les décisions techniques et de design, avec leur raison.
- `RAPPORT.md` : ce qui marche, ce qui est simulé, les clés à renseigner, les prochaines étapes.
- `docs/captures/` : captures d’écran des pages principales (mobile et desktop).

---

## 1. Lancer en local, sans aucune clé

Il te faut **Node.js 20.19 ou plus récent** (`node -v`).

```bash
npm install
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

- `admin@tiktrend.local` → `/admin` (passer un compte en formateur, lancer la tâche nocturne, voir les e-mails) ;
- `formateur@tiktrend.local` → `/formateur` (code `DEMO30`, deux élèves de démonstration) ;
- n’importe quelle autre adresse → nouveau compte, onboarding puis radar.

Pour tester l’essai formateur : ouvre http://localhost:3000/r/DEMO30 puis inscris-toi avec une nouvelle adresse.

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
| `npm run test:integration` | tests contre le vrai Supabase (repo, RLS, connexion) ; ne lance rien sans clés |
| `npm run ai:sample` | 3 scripts de test avec le vrai fournisseur d’IA, français relu, dans `docs/exemples-scripts/` |
| `npm run score:distribution` | distribution des scores sur la base actuelle |
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
   Ni l’un ni l’autre ne sert à l’appli : ne les mets pas sur Vercel.
3. **Authentication → URL Configuration** :
   - *Site URL* : la valeur de `NEXT_PUBLIC_SITE_URL` (ex. `https://tiktrend.fr`) ;
   - *Redirect URLs* : ajoute `https://tiktrend.fr/auth/callback**` et `http://localhost:3000/auth/callback**`
     (les `**` laissent passer le paramètre `?suite=` qui ramène à la page demandée).
4. **Authentication → Email Templates → Magic Link** : remplace le contenu par un texte en français, avec ce lien
   (il marche même si l’e-mail est ouvert sur un autre appareil) :

   ```html
   <h2>Ton lien de connexion</h2>
   <p>Appuie sur le bouton pour te connecter. Le lien expire dans une heure.</p>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Me connecter</a></p>
   <p>Tu n’as rien demandé ? Ignore cet e-mail.</p>
   ```

   Sujet conseillé : `Ton lien de connexion`.
5. **Authentication → Sign In / Providers → Google** : active-le avec un identifiant OAuth créé dans Google Cloud
   (type « Application Web », URI de redirection autorisée : `https://<ref>.supabase.co/auth/v1/callback`).
6. **Project Settings → Authentication → SMTP** : branche Resend (hôte `smtp.resend.com`, port `465`, utilisateur
   `resend`, mot de passe = ta clé Resend). Sans SMTP, Supabase limite fortement les e-mails de connexion.
7. Mets la base en place, en une commande :

   ```bash
   npm run db:setup
   ```

   Elle applique les migrations, régénère les types TypeScript (`lib/db/database.types.ts`), puis lance
   `npm run seed`. Avec `SUPABASE_ACCESS_TOKEN`, chaque migration est enregistrée sous son nom de fichier chez
   Supabase : une relance n’applique que les nouvelles. Avec `SUPABASE_DB_URL` : `psql` s’il est installé, sinon
   la CLI Supabase (les migrations sont rejouables). Options : `-- --sans-types`, `-- --sans-seed`.
8. Vérifie tout contre la vraie base :

   ```bash
   npm run test:integration
   ```

   Chaque méthode de `SupabaseRepo`, la RLS avec deux utilisateurs et un formateur, l’authentification (lien
   magique, lien réutilisé, déconnexion) puis le parcours de connexion dans le navigateur (Playwright, port 3300).
   Les tests créent des comptes `itest-…@example.com` et les suppriment à la fin ; aucun e-mail n’est envoyé.
   Ajoute `E2E_GOOGLE=1` une fois Google activé pour vérifier aussi le bouton Google. Sans clés, la commande
   dit lesquelles manquent et ne lance rien (`INTEGRATION_REQUIRED=1` la fait échouer dans ce cas, pour la CI).

**Avec un fournisseur de données réel** (clés TikTok ou Nexscope présentes), `npm run seed` fait un vrai
rafraîchissement au lieu de charger 30 jours fictifs : aucun produit fictif n’arrive dans une base de production.

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

1. Mets ta clé `STRIPE_SECRET_KEY` (commence par `sk_test_` en test).
2. Lance `npm run stripe:setup` : il crée les produits « Pro » et « Pro+ » et leurs 4 prix
   (19,90 €/mois, 167 €/an, 39,90 €/mois, 335 €/an) et affiche les 4 `STRIPE_PRICE_…` à copier.
3. **Webhook** : Developers → Webhooks → *Add endpoint* → `<NEXT_PUBLIC_SITE_URL>/api/stripe/webhook` (l’adresse
   exacte est affichée par `npm run stripe:setup`), avec les événements `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`. Copie le secret de signature
   dans `STRIPE_WEBHOOK_SECRET`.
   En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook` (le secret affiché va dans `.env.local`).
4. **Portail client** : Settings → Billing → Customer portal → active la résiliation, la mise à jour du moyen de
   paiement, l’historique des factures et le **changement de plan** entre les 4 prix.
5. (Facultatif) Stripe Tax si tu factures la TVA.

### Resend (e-mails)

`RESEND_API_KEY` et `EMAIL_FROM` (un expéditeur d’un domaine vérifié dans Resend, ex.
`TikTrend <bonjour@tiktrend.fr>`). `FOUNDER_EMAIL` reçoit les demandes de partenariat des formateurs.

### Données produits

**Jamais de scraping de TikTok** : uniquement l’API officielle TikTok Shop ou un fournisseur sous contrat.
`DATA_PROVIDER=auto` (par défaut) prend TikTok si ses clés sont là, sinon Nexscope, sinon les données fictives.

- **Nexscope** (la voie réaliste aujourd’hui pour la France) : crée une clé sur
  https://www.nexscope.ai/seller/api-access et mets-la dans `NEXSCOPE_API_KEY`. Chaque nuit : 7 niches ×
  `DATA_PAGES_PER_NICHE` pages de 10 produits, plus les vidéos des `DATA_VIDEO_PRODUCTS` meilleurs produits.
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

## 3. Déployer sur Vercel

1. Pousse le dépôt sur GitHub, puis **Import Project** dans Vercel (framework Next.js détecté tout seul,
   Node 20 ou plus).
2. Suis la liste de vérification ci-dessous, **dans l’ordre**.
3. La tâche nocturne est déclarée dans `vercel.json` : `/api/cron/refresh` une fois par jour à **3 h UTC**
   (4 h à Paris l’hiver, 5 h l’été). Vercel envoie tout seul `Authorization: Bearer <CRON_SECRET>` ; un second
   appel le même jour ne refait pas le travail. La fonction peut durer jusqu’à 300 s (`maxDuration`).
4. Surveillance : `GET /api/health` répond `ok`, `degraded` (avec la liste des problèmes) ou `down` (HTTP 503 :
   base injoignable ou relevé de plus de 36 heures). Aucun secret dans la réponse ; branche-la sur un outil
   de surveillance (UptimeRobot, Better Stack…).

### Liste de vérification de mise en ligne

Coche chaque ligne dans cet ordre : chacune dépend des précédentes.

1. **Variables Vercel** (*Settings → Environment Variables*, environnement *Production*) :
   - [ ] `NEXT_PUBLIC_SITE_URL` = l’adresse définitive, en `https://`, sans `/` final (elle sert aux redirections
         de connexion, aux retours de paiement Stripe et à tous les liens des e-mails) ;
   - [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ;
   - [ ] `CRON_SECRET` (long et aléatoire, par exemple `openssl rand -hex 32`) et `ADMIN_EMAILS` ;
   - [ ] `AI_PROVIDER` et la clé correspondante : `OPENAI_API_KEY` (+ `OPENAI_MODEL`) ou `ANTHROPIC_API_KEY`
         (+ `ANTHROPIC_MODEL`) ;
   - [ ] `STRIPE_SECRET_KEY` (`sk_live_…`), les 4 `STRIPE_PRICE_…` du mode production, `STRIPE_WEBHOOK_SECRET`
         (rempli à l’étape 4) ;
   - [ ] `RESEND_API_KEY`, `EMAIL_FROM`, `FOUNDER_EMAIL` ;
   - [ ] source de données : `NEXSCOPE_API_KEY` (ou les clés TikTok), et si besoin `DATA_MAX_CALLS_PER_NIGHT`,
         `IMAGE_HOSTS` ;
   - [ ] `BOT_API_SECRET`, `NEXT_PUBLIC_DISCORD_INVITE_URL` si le bot Discord est lancé ;
   - [ ] **pas** de `SUPABASE_DB_URL` ni de `LOCAL_…` sur Vercel : ils ne servent qu’en local.
2. **Domaine** : *Settings → Domains* → ajoute le domaine, règle les DNS demandés, attends le certificat, puis
   vérifie que `NEXT_PUBLIC_SITE_URL` est exactement ce domaine et **redéploie** (la valeur est figée au build).
3. **Supabase** (*Authentication → URL Configuration*) :
   - [ ] *Site URL* = `NEXT_PUBLIC_SITE_URL` ;
   - [ ] *Redirect URLs* : `<NEXT_PUBLIC_SITE_URL>/auth/callback**` ;
   - [ ] modèle d’e-mail « Magic Link » en français (section 2) et Google réglé si utilisé ;
   - [ ] `npm run db:setup` lancé sur le projet de production, puis `npm run test:integration` au vert.
4. **Stripe en production** :
   - [ ] `npm run stripe:setup` avec la clé `sk_live_…` (prix de production) ;
   - [ ] webhook *Add endpoint* → `<NEXT_PUBLIC_SITE_URL>/api/stripe/webhook` avec les 7 événements de la section 2,
         secret copié dans `STRIPE_WEBHOOK_SECRET`, puis redéploiement ;
   - [ ] portail client configuré ; un vrai paiement puis une résiliation testés.
5. **Resend** : *Domains → Add domain* → ajoute les enregistrements DNS (SPF, DKIM), attends « Verified », puis
   `EMAIL_FROM` sur ce domaine (ex. `TikTrend <bonjour@ton-domaine.fr>`). Envoie-toi un récap depuis `/app/recap`.
   Branche aussi le SMTP de Resend dans Supabase pour les e-mails de connexion.
6. **Tâche nocturne testée** :
   - [ ] dans `/admin`, **Lancer le rafraîchissement** : le message doit être vert (pas « repli »), le radar doit
         montrer les vrais produits France (pas la mention « produits fictifs ») ;
   - [ ] l’appel planifié lui-même :

     ```bash
     curl -sS -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_SITE_URL/api/cron/refresh?force=1"
     ```

   - [ ] `curl -sS "$NEXT_PUBLIC_SITE_URL/api/health"` répond `"status":"ok"` ;
   - [ ] le lendemain, *Vercel → Cron Jobs* montre une exécution réussie à 3 h UTC et `/admin` la tâche « Planifiée ».

## 4. Lancer le bot Discord

Le bot est un service à part, dans `bot/` (il parle à l’appli par HTTP, jamais à la base). Toutes les étapes
(création du bot, rôle Pro, salons, hébergement) sont dans **`bot/README.md`**. En résumé :

```bash
cd bot
cp .env.example .env
npm install
npm run dev
```

Côté appli : `BOT_API_SECRET` (même valeur que dans `bot/.env`) et `NEXT_PUBLIC_DISCORD_INVITE_URL`.
Héberge-le sur un service qui garde un processus allumé (Railway, Fly.io, Render, VPS) : pas sur Vercel.

---

## 5. Architecture en bref

```
app/(public)/       accueil, prix, formateurs, pages légales
app/app/            l'appli : radar, fiche produit, studio, mes produits, récap, parrainage, compte
app/formateur/      espace formateur        app/admin/   administration
app/api/            cron, webhook Stripe, routes du bot, visuels produits
lib/db/             accès aux données (Supabase ou fichier local), une seule interface
lib/data/           fournisseurs de données produits (mock, TikTok, Nexscope)
lib/score.ts        score d'opportunité          lib/plans.ts   plans et limites
lib/ai/             génération des scripts (Claude + simulé), garde-fou
lib/billing/        paiement (Stripe, simulation), indépendant du reste
emails/             e-mails React Email          bot/          bot Discord
supabase/           migrations SQL + tests RLS   tests/        Vitest et Playwright
```

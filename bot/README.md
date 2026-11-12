# Bot Discord de Pépite

Petit service à part, qui parle à l’appli par HTTP (`/api/bot/*`). Il n’a jamais accès à la base.

## Ce qu’il fait

- `/lier CODE` : lie un compte Discord à un compte de l’appli (le code s’obtient sur la page **Récap** de l’appli, valable 15 minutes, une seule fois).
- `/delier` : retire la liaison.
- Chaque matin, à l’heure choisie par l’utilisateur : son récap en **message privé** (plans Pro et Pro+).
- Chaque jour à `PUBLIC_POST_HOUR` (8 h par défaut, heure de Paris) :
  - salon public « produits-du-jour » : 3 produits **masqués** (catégorie et tendance seulement) ;
  - salon Pro : le radar complet du jour.
- Toutes les 10 minutes : le rôle Pro est ajouté ou retiré selon le plan de chaque compte lié.

## Créer le bot dans Discord

1. https://discord.com/developers/applications → **New Application** → nomme-la.
2. Onglet **Bot** → **Reset Token** → copie le jeton dans `DISCORD_BOT_TOKEN`.
3. **General Information** → copie l’**Application ID** dans `DISCORD_CLIENT_ID`.
4. **OAuth2 → URL Generator** : coche `bot` et `applications.commands`, puis les permissions
   *Manage Roles*, *Send Messages*, *Embed Links*. Ouvre l’URL générée et invite le bot sur ton serveur.
5. Dans ton serveur :
   - crée un rôle **Pro** et place le rôle du bot **au-dessus** (sinon il ne peut pas l’attribuer) ;
   - crée `#produits-du-jour` (visible par tous) et `#radar-pro` (visible seulement par le rôle Pro) ;
   - active le mode développeur (Paramètres → Avancés) pour copier les identifiants (clic droit → *Copier l’identifiant*).

## Lancer

```bash
cd bot
cp .env.example .env   # puis remplis les valeurs
npm install
npm run dev            # en local (rechargement automatique)
```

En production :

```bash
npm run build
npm start
```

Côté appli, mets la **même** valeur de `BOT_API_SECRET` et `APP_URL` = l’URL publique de l’appli.

## Héberger

N’importe quel hébergeur de processus Node qui tourne en continu (Railway, Fly.io, Render « background worker », un VPS).
Vercel ne convient pas (pas de processus permanent). Variables d’environnement : celles de `.env.example`.

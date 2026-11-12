/**
 * Prépare le bot Discord, sans rien à héberger (interactions HTTP + API REST, doc officielle discord/discord-api-docs) :
 *  1. enregistre /lier et /delier sur ton serveur : PUT /applications/{application.id}/guilds/{guild.id}/commands ;
 *  2. si NEXT_PUBLIC_SITE_URL est une adresse publique https : règle l'adresse des interactions de l'application
 *     (PATCH /applications/@me, champ interactions_endpoint_url). Discord vérifie l'adresse en y envoyant un PING
 *     signé : le site doit déjà être en ligne avec DISCORD_PUBLIC_KEY.
 * Usage : npm run discord:setup   (DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID ; jamais affichés)
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  const { env } = await import('@/lib/env');
  const { discordApi } = await import('@/lib/discord/rest');
  const { DISCORD_COMMANDS } = await import('@/lib/discord/interactions');
  const { discordStatus } = await import('@/lib/discord/config');
  const missing = [
    ['DISCORD_BOT_TOKEN', env.discordBotToken],
    ['DISCORD_APPLICATION_ID', env.discordApplicationId],
    ['DISCORD_GUILD_ID', env.discordGuildId],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) fail(`variables manquantes : ${missing.join(', ')} (voir README, section Discord).`);

  const commands = await discordApi<Array<{ name: string }>>(
    'PUT',
    `/applications/${env.discordApplicationId}/guilds/${env.discordGuildId}/commands`,
    DISCORD_COMMANDS,
  );
  console.log(`✓ Commandes enregistrées sur le serveur : ${commands.map((c) => `/${c.name}`).join(', ')}`);

  const site = env.siteUrl.replace(/\/$/, '');
  const endpoint = `${site}/api/discord/interactions`;
  if (/^https:\/\//.test(site) && !/localhost|127\.0\.0\.1/.test(site)) {
    await discordApi('PATCH', '/applications/@me', { interactions_endpoint_url: endpoint });
    console.log(`✓ Adresse des interactions : ${endpoint}`);
  } else {
    console.log(
      `· Adresse des interactions non réglée : NEXT_PUBLIC_SITE_URL n’est pas une adresse publique https.\n` +
        '  Relance la commande une fois le site en ligne (avec DISCORD_PUBLIC_KEY sur Netlify).',
    );
  }
  const status = discordStatus();
  console.log(status.channels ? '✓ Salons du jour configurés' : '· Salons du jour : DISCORD_PUBLIC_CHANNEL_ID ou DISCORD_PRO_CHANNEL_ID absent');
  console.log(status.roles ? '✓ Rôle Pro configuré' : '· Rôle Pro : DISCORD_PRO_ROLE_ID absent');
  console.log(env.discordPublicKey ? '✓ Clé publique présente' : '· DISCORD_PUBLIC_KEY absente : /lier ne marchera pas');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

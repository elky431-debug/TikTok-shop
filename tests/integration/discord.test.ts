import { describe, expect, it } from 'vitest';
import { discordStatus } from '@/lib/discord/config';
import { discordApi } from '@/lib/discord/rest';
import { env } from '@/lib/env';

/**
 * Discord réel (jeton du bot) : lecture seule, rien n'est envoyé aux membres. Vérifie que le jeton est valable, que
 * l'application pointe vers notre adresse d'interactions, que /lier et /delier sont enregistrées sur le serveur, que le
 * bot y est présent et voit les salons et le rôle configurés.
 */
const ready = Boolean(env.discordBotToken && env.discordApplicationId && env.discordGuildId);

describe.skipIf(!ready)('Discord (API réelle)', () => {
  it('le jeton est celui de l’application configurée', async () => {
    const app = await discordApi<{ id: string; interactions_endpoint_url?: string | null }>('GET', '/applications/@me');
    expect(app.id).toBe(env.discordApplicationId);
    if (/^https:\/\//.test(env.siteUrl) && !/localhost/.test(env.siteUrl)) {
      expect(app.interactions_endpoint_url).toBe(`${env.siteUrl.replace(/\/$/, '')}/api/discord/interactions`);
    }
  });

  it('/lier et /delier sont enregistrées sur le serveur (npm run discord:setup)', async () => {
    const commands = await discordApi<Array<{ name: string }>>('GET', `/applications/${env.discordApplicationId}/guilds/${env.discordGuildId}/commands`);
    expect(commands.map((c) => c.name).sort()).toEqual(['delier', 'lier']);
  });

  it('le bot est sur le serveur et voit les salons et le rôle configurés', async () => {
    const guild = await discordApi<{ id: string; roles: Array<{ id: string }> }>('GET', `/guilds/${env.discordGuildId}`);
    expect(guild.id).toBe(env.discordGuildId);
    if (discordStatus().roles) expect(guild.roles.map((r) => r.id)).toContain(env.discordProRoleId);
    for (const channel of [env.discordPublicChannelId, env.discordProChannelId].filter(Boolean)) {
      const found = await discordApi<{ id: string; guild_id: string }>('GET', `/channels/${channel}`);
      expect(found.guild_id).toBe(env.discordGuildId);
    }
  });
});

import { env } from '@/lib/env';

function read(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Variables propres au bot (session 5), lues ici plutôt que dans lib/env.ts. Toutes facultatives.
 * - DISCORD_LEADERBOARD_CHANNEL_ID : salon du classement hebdomadaire des séries (membres inscrits seulement) ;
 * - DISCORD_LEADERBOARD_HOUR : heure de Paris de la publication du lundi (10 h par défaut).
 */
export const discordExtra = {
  get leaderboardChannelId() {
    return read('DISCORD_LEADERBOARD_CHANNEL_ID');
  },
  get leaderboardHour() {
    const hour = Number(read('DISCORD_LEADERBOARD_HOUR') || 10);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 10;
  },
};

/** Ce qu'il faut pour chaque partie de Discord. Rien n'est obligatoire : chaque partie manquante est sautée. */
export function discordStatus() {
  const bot = Boolean(env.discordBotToken);
  return {
    /** Commandes (interactions HTTP) : /lier, /delier, /produits, /score, /script, /alerte, /classement. */
    interactions: Boolean(env.discordPublicKey && env.discordApplicationId),
    /** Récaps en message privé. */
    digests: bot,
    /** Salons « produits d'hier » (public) et « produits du jour » (Pro). */
    channels: bot && Boolean(env.discordPublicChannelId || env.discordProChannelId),
    /** Rôle Pro synchronisé avec le plan. */
    roles: bot && Boolean(env.discordGuildId && env.discordProRoleId),
    /** Classement hebdomadaire des séries de jours. */
    leaderboard: bot && Boolean(discordExtra.leaderboardChannelId),
  };
}

export function isDiscordConfigured(): boolean {
  return Object.values(discordStatus()).some(Boolean);
}

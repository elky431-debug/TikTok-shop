import { env } from '@/lib/env';

/** Ce qu'il faut pour chaque partie de Discord. Rien n'est obligatoire : chaque partie manquante est sautée. */
export function discordStatus() {
  const bot = Boolean(env.discordBotToken);
  return {
    /** Commandes /lier et /delier (interactions HTTP). */
    interactions: Boolean(env.discordPublicKey && env.discordApplicationId),
    /** Récaps en message privé. */
    digests: bot,
    /** Salons « produits du jour » (public) et Pro. */
    channels: bot && Boolean(env.discordPublicChannelId || env.discordProChannelId),
    /** Rôle Pro synchronisé avec le plan. */
    roles: bot && Boolean(env.discordGuildId && env.discordProRoleId),
  };
}

export function isDiscordConfigured(): boolean {
  return Object.values(discordStatus()).some(Boolean);
}

import { BRAND } from '@/lib/brand';
import { linkDiscordAccount, unlinkDiscordAccount } from './link';

/**
 * Commandes du serveur et réponses aux interactions (doc Discord : interactions/application-commands et
 * interactions/receiving-and-responding). Types utilisés : interaction 1 PING / 2 APPLICATION_COMMAND ; réponse
 * 1 PONG / 4 CHANNEL_MESSAGE_WITH_SOURCE ; option 3 STRING ; drapeau 64 EPHEMERAL (visible de l'auteur seul).
 */
export const DISCORD_COMMANDS = [
  {
    name: 'lier',
    type: 1,
    description: `Lie ton compte Discord à ton compte ${BRAND}`,
    options: [{ type: 3, name: 'code', description: 'Le code affiché dans l’appli (page Récap)', required: true }],
  },
  { name: 'delier', type: 1, description: `Retire la liaison avec ton compte ${BRAND}` },
];

const EPHEMERAL = 64;

interface Interaction {
  type: number;
  data?: { name?: string; options?: Array<{ name: string; value?: unknown }> };
  member?: { user?: { id?: string } };
  user?: { id?: string };
}

const reply = (content: string) => ({ type: 4, data: { content, flags: EPHEMERAL } });

export async function handleDiscordInteraction(interaction: Interaction): Promise<Record<string, unknown>> {
  if (interaction.type === 1) return { type: 1 };
  if (interaction.type !== 2) return reply('Action non prise en charge.');
  // Dans un serveur, l'auteur est dans member.user ; en message privé, dans user.
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
  try {
    if (interaction.data?.name === 'lier') {
      const code = String(interaction.data.options?.find((o) => o.name === 'code')?.value ?? '');
      const result = await linkDiscordAccount(code, discordUserId);
      if (!result.ok) return reply(`❌ ${result.error}`);
      const name = result.firstName ?? 'bienvenue';
      return reply(
        result.pro
          ? `✅ C’est lié, ${name} ! Plan ${result.planName} : ton récap arrive en message privé chaque matin, à l’heure choisie dans l’appli.`
          : `✅ C’est lié, ${name} ! Le récap en message privé et le salon Pro arrivent avec le plan Pro.`,
      );
    }
    if (interaction.data?.name === 'delier') {
      return reply((await unlinkDiscordAccount(discordUserId)) ? '✅ Liaison retirée. Tu ne recevras plus de récap ici.' : '❌ Aucun compte lié à ce Discord.');
    }
    return reply('Commande inconnue.');
  } catch (error) {
    console.error('[discord] commande', error);
    return reply('❌ Le service ne répond pas. Réessaie dans un instant.');
  }
}

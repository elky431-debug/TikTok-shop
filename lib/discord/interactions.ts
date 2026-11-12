import { getRepo, type Repo } from '@/lib/db';
import type { Profile } from '@/lib/db/types';
import { env } from '@/lib/env';
import { isNicheId, nicheLabel } from '@/lib/niches';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { rankForUser, visibleProductIds } from '@/lib/radar-rules';
import { regionFor } from '@/lib/regions';
import { parisDate } from '@/lib/utils';
import { linkedProfile, NOT_LINKED, releaseCommand, reserveCommand } from './account';
import { createAlerte, describeAlerte, type AlerteData } from './alerte';
import { accessibleProducts, autocompleteChoices, discordCatalog, findProduct, searchProducts } from './catalog';
import { dispatchFollowup } from './followup';
import { currentStreak, getDiscordSettings, setLeaderboardOptIn } from './leaderboard';
import { linkDiscordAccount, unlinkDiscordAccount } from './link';
import { produitsMessage, scoreMessage, type DiscordMessage } from './messages';

export { DISCORD_COMMANDS } from './commands';

/**
 * Réponses aux interactions (doc Discord : interactions/receiving-and-responding). Interaction : 1 PING,
 * 2 APPLICATION_COMMAND, 4 APPLICATION_COMMAND_AUTOCOMPLETE. Réponse : 1 PONG, 4 CHANNEL_MESSAGE_WITH_SOURCE,
 * 5 DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (l'IA, plus longue que les 3 secondes permises), 8 AUTOCOMPLETE_RESULT.
 * Toutes les réponses sont éphémères (drapeau 64) : visibles de l'auteur seul, pour que les produits du jour d'un
 * membre Pro ne s'affichent jamais dans un salon ouvert à tous.
 */
const EPHEMERAL = 64;

interface Option {
  name: string;
  type?: number;
  value?: unknown;
  focused?: boolean;
}

export interface Interaction {
  id?: string;
  application_id?: string;
  token?: string;
  type: number;
  data?: { name?: string; options?: Option[] };
  member?: { user?: { id?: string } };
  user?: { id?: string };
}

const reply = (content: string) => ({ type: 4, data: { content, flags: EPHEMERAL } });
const replyMessage = (message: DiscordMessage) => ({ type: 4, data: { ...message, flags: EPHEMERAL } });
const option = (interaction: Interaction, name: string) => interaction.data?.options?.find((o) => o.name === name)?.value;

async function withProfile(interaction: Interaction, repo: Repo, fn: (profile: Profile) => Promise<Record<string, unknown>>) {
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
  const profile = await linkedProfile(discordUserId, repo);
  if (!profile) return reply(NOT_LINKED);
  return fn(profile);
}

/** /produits niche : même visibilité que le radar de l'appli. */
async function produits(interaction: Interaction, profile: Profile, repo: Repo, now: Date) {
  const niche = String(option(interaction, 'niche') ?? '');
  if (!isNicheId(niche)) return reply('Choisis une niche dans la liste.');
  const catalog = await discordCatalog(repo, regionFor(profile), now);
  if (!catalog.products.length) return reply('Le radar du jour n’est pas encore prêt. Réessaie dans un moment.');
  const inNiche = catalog.products.filter((p) => p.niche === niche).sort((a, b) => b.latest_score - a.latest_score || a.id.localeCompare(b.id));
  let shown = inNiche;
  if (!isPaidPlan(profile.plan)) {
    const visible = visibleProductIds(rankForUser(catalog.products, profile.niches), profile.plan);
    shown = inNiche.filter((p) => visible.has(p.id));
    if (!shown.length) {
      return reply(
        `En Gratuit, tu vois tes ${getPlan('free').visibleProducts} produits du jour, choisis dans tes niches : aucun n’est en ${nicheLabel(niche)} aujourd’hui. ` +
          `Ajoute cette niche dans ton compte, ou passe Pro pour voir les ${inNiche.length} produits du jour de ${nicheLabel(niche)} : ${env.siteUrl}/prix`,
      );
    }
  }
  return replyMessage(
    produitsMessage({
      niche,
      products: shown,
      plan: profile.plan,
      lockedCount: inNiche.length - shown.length,
      demo: catalog.demo,
      stale: catalog.stale,
      dataDate: catalog.dataDate,
      siteUrl: env.siteUrl,
    }),
  );
}

async function pickProduct(interaction: Interaction, profile: Profile, repo: Repo, now: Date) {
  const value = String(option(interaction, 'produit') ?? '').trim();
  const { catalog, products } = await accessibleProducts(profile, repo, now);
  const product = value ? findProduct(products, value) : null;
  return { catalog, product, value };
}

const notFound = (profile: Profile, value: string) =>
  reply(
    isPaidPlan(profile.plan)
      ? `Aucun produit du jour ne correspond à « ${value.slice(0, 80)} ». Choisis-le dans la liste qui s’affiche quand tu tapes.`
      : `« ${value.slice(0, 80)} » n’est pas dans tes produits du jour. En Gratuit, /score et /script marchent sur tes 3 produits du jour et ceux que tu suis.`,
  );

/** /score produit : compte dans le quota quotidien, score masqué en Gratuit (comme dans l'appli). */
async function score(interaction: Interaction, profile: Profile, repo: Repo, now: Date) {
  const { catalog, product, value } = await pickProduct(interaction, profile, repo, now);
  if (!product) return notFound(profile, value);
  const reserved = await reserveCommand(profile, { command: 'score', product_id: product.id, ia: false }, repo, now);
  if (!reserved.ok) return reply(reserved.message);
  return replyMessage(scoreMessage({ product, plan: profile.plan, demo: catalog.demo, stale: catalog.stale, dataDate: catalog.dataDate, siteUrl: env.siteUrl }));
}

/** /script produit : réponse différée (type 5), l'accroche arrive par modification de la réponse. */
async function script(interaction: Interaction, profile: Profile, repo: Repo, now: Date) {
  const { product, value } = await pickProduct(interaction, profile, repo, now);
  if (!product) return notFound(profile, value);
  const applicationId = interaction.application_id ?? env.discordApplicationId;
  if (!interaction.token || !applicationId) return reply('❌ Interaction incomplète : réessaie.');
  const reserved = await reserveCommand(profile, { command: 'script', product_id: product.id, ia: true }, repo, now);
  if (!reserved.ok) return reply(reserved.message);
  const queued = await dispatchFollowup(
    { kind: 'script', applicationId, token: interaction.token, userId: profile.id, productId: product.id, recordId: reserved.recordId },
    repo,
  );
  if (!queued) {
    await releaseCommand(profile.id, reserved.recordId, repo);
    return reply('❌ Le service d’écriture ne répond pas. Réessaie dans un instant : cette commande ne compte pas.');
  }
  return { type: 5, data: { flags: EPHEMERAL } };
}

/** /alerte niche commission [ventes_7j] [croissance] : fiche `alerte`, limite d'alertes actives du plan. */
async function alerte(interaction: Interaction, profile: Profile, repo: Repo) {
  const nicheValue = String(option(interaction, 'niche') ?? '');
  const sales = option(interaction, 'ventes_7j');
  const growth = option(interaction, 'croissance');
  const input: AlerteData = {
    niche: isNicheId(nicheValue) ? nicheValue : null,
    minCommissionPercent: Number(option(interaction, 'commission') ?? 0),
    minSales7d: sales === undefined || sales === null ? null : Number(sales),
    minGrowth: growth === undefined || growth === null ? null : Number(growth) / 100,
    active: true,
  };
  const created = await createAlerte(profile, input, repo);
  if (!created.ok) return reply(`❌ ${created.message}`);
  const limit = Number.isFinite(created.limit) ? ` (${created.active} sur ${created.limit})` : '';
  return reply(
    `✅ Alerte créée${limit} : ${describeAlerte(input)}.\nElle est enregistrée avec tes alertes de l’appli, où tu peux la mettre en pause : ${env.siteUrl}/app`,
  );
}

/** /classement voir|rejoindre|quitter : réglage opt-in (fiche `reglages_discord`). */
async function classement(interaction: Interaction, profile: Profile, repo: Repo, now: Date) {
  const choice = String(option(interaction, 'choix') ?? 'voir');
  if (choice === 'rejoindre' || choice === 'quitter') {
    await setLeaderboardOptIn(profile.id, choice === 'rejoindre', repo);
    return reply(
      choice === 'rejoindre'
        ? '✅ Tu apparais dans le classement des séries publié chaque lundi (ta mention Discord et ton nombre de jours, rien d’autre). /classement quitter pour en sortir.'
        : '✅ Tu n’apparais plus dans le classement des séries.',
    );
  }
  const [days, settings] = await Promise.all([currentStreak(profile.id, parisDate(now), repo), getDiscordSettings(profile.id, repo)]);
  return reply(
    `${days >= 1 ? `🔥 Ta série : ${days} jour${days > 1 ? 's' : ''} d’affilée.` : 'Pas de série en cours : écris un script aujourd’hui pour en démarrer une.'}\n` +
      (settings.data.classement ? 'Tu es inscrit au classement du lundi.' : 'Tu n’es pas dans le classement du lundi : /classement rejoindre pour y apparaître.'),
  );
}

/** Autocomplétion de /score et /script : uniquement les produits que ce compte peut ouvrir. */
async function autocomplete(interaction: Interaction, repo: Repo, now: Date) {
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
  const profile = await linkedProfile(discordUserId, repo);
  if (!profile) return { type: 8, data: { choices: [] } };
  const focused = interaction.data?.options?.find((o) => o.focused);
  const { products } = await accessibleProducts(profile, repo, now);
  return { type: 8, data: { choices: autocompleteChoices(searchProducts(products, String(focused?.value ?? ''))) } };
}

export async function handleDiscordInteraction(
  interaction: Interaction,
  opts: { repo?: Repo; now?: Date } = {},
): Promise<Record<string, unknown>> {
  if (interaction.type === 1) return { type: 1 };
  const repo = opts.repo ?? getRepo();
  const now = opts.now ?? new Date();
  if (interaction.type === 4) {
    try {
      return await autocomplete(interaction, repo, now);
    } catch (error) {
      console.error('[discord] autocomplétion', error);
      return { type: 8, data: { choices: [] } };
    }
  }
  if (interaction.type !== 2) return reply('Action non prise en charge.');
  // Dans un serveur, l'auteur est dans member.user ; en message privé, dans user.
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
  try {
    switch (interaction.data?.name) {
      case 'lier': {
        const code = String(option(interaction, 'code') ?? '');
        const result = await linkDiscordAccount(code, discordUserId);
        if (!result.ok) return reply(`❌ ${result.error}`);
        const name = result.firstName ?? 'bienvenue';
        return reply(
          result.pro
            ? `✅ C’est lié, ${name} ! Plan ${result.planName} : ton récap arrive en message privé chaque matin, à l’heure choisie dans l’appli.`
            : `✅ C’est lié, ${name} ! Le récap en message privé et le salon Pro arrivent avec le plan Pro.`,
        );
      }
      case 'delier':
        return reply((await unlinkDiscordAccount(discordUserId)) ? '✅ Liaison retirée. Tu ne recevras plus de récap ici.' : '❌ Aucun compte lié à ce Discord.');
      case 'produits':
        return await withProfile(interaction, repo, (p) => produits(interaction, p, repo, now));
      case 'score':
        return await withProfile(interaction, repo, (p) => score(interaction, p, repo, now));
      case 'script':
        return await withProfile(interaction, repo, (p) => script(interaction, p, repo, now));
      case 'alerte':
        return await withProfile(interaction, repo, (p) => alerte(interaction, p, repo));
      case 'classement':
        return await withProfile(interaction, repo, (p) => classement(interaction, p, repo, now));
      default:
        return reply('Commande inconnue.');
    }
  } catch (error) {
    console.error('[discord] commande', error);
    return reply('❌ Le service ne répond pas. Réessaie dans un instant.');
  }
}

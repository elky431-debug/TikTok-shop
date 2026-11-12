/**
 * Bot Discord de Pépite (déployable à part : Railway, Fly.io, un petit VPS…).
 *
 * - /lier CODE : associe ton compte Discord à ton compte (code à usage unique affiché dans l'appli)
 * - /delier : retire la liaison
 * - Message privé chaque matin à l'heure choisie (abonnés Pro et Pro+)
 * - Salon public « produits-du-jour » : 3 produits masqués ; salon Pro : la liste complète
 * - Rôle Pro synchronisé avec le plan toutes les 10 minutes
 *
 * Le bot ne touche jamais à la base : il parle à l'appli via /api/bot/* (BOT_API_SECRET).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  type TextChannel,
} from 'discord.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const config = {
  token: process.env.DISCORD_BOT_TOKEN ?? '',
  guildId: process.env.DISCORD_GUILD_ID ?? '',
  clientId: process.env.DISCORD_CLIENT_ID ?? '',
  publicChannelId: process.env.DISCORD_PUBLIC_CHANNEL_ID ?? '',
  proChannelId: process.env.DISCORD_PRO_CHANNEL_ID ?? '',
  proRoleId: process.env.DISCORD_PRO_ROLE_ID ?? '',
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  secret: process.env.BOT_API_SECRET ?? '',
  publicHour: Number(process.env.PUBLIC_POST_HOUR ?? 8),
};

const missing = (['token', 'guildId', 'clientId', 'secret'] as const).filter((k) => !config[k]);
if (missing.length) {
  console.error(
    `Configuration incomplète : ${missing
      .map((k) => ({ token: 'DISCORD_BOT_TOKEN', guildId: 'DISCORD_GUILD_ID', clientId: 'DISCORD_CLIENT_ID', secret: 'BOT_API_SECRET' })[k])
      .join(', ')}. Voir bot/.env.example.`,
  );
  process.exit(1);
}

const BRAND = 'Pépite';
const ROSE = 0xfe2c55;
const STATE_FILE = new URL('../.state.json', import.meta.url);

// ---------------------------------------------------------------------------
// Appels à l'appli
// ---------------------------------------------------------------------------
async function api<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const response = await fetch(`${config.appUrl}/api/bot${path}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  // Les routes /link et /unlink répondent { ok: false, error } : on laisse l'appelant afficher l'erreur.
  if (!response.ok && !(typeof json === 'object' && json !== null && 'ok' in json)) {
    throw new Error(`${path} : HTTP ${response.status} ${json.error ?? ''}`);
  }
  return json;
}

interface DigestProduct {
  id: string;
  name: string;
  niche: string;
  price_cents: number;
  commission_cents: number;
  score: number | null;
  trend: string;
  growth_7d: number;
  free_sample: boolean;
  reason: string;
}
interface DigestContent {
  date: string;
  first_name: string | null;
  products: DigestProduct[];
  hook: { product_name: string; text: string } | null;
  script: { title: string; lines: string[] } | null;
}

const euros = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/ /g, ' ');
const growth = (g: number) => `${g >= 0 ? '+' : '−'}${Math.abs(Math.round(g * 100))} %`;
const parisNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
};

function readState(): { lastPublicDay?: string } {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { lastPublicDay?: string };
  } catch {
    return {};
  }
}
function writeState(state: { lastPublicDay?: string }) {
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('lier')
    .setDescription(`Lie ton compte Discord à ton compte ${BRAND}`)
    .addStringOption((o) => o.setName('code').setDescription('Le code affiché dans l’appli (page Récap)').setRequired(true)),
  new SlashCommandBuilder().setName('delier').setDescription(`Retire la liaison avec ton compte ${BRAND}`),
].map((c) => c.toJSON());

async function onLier(interaction: ChatInputCommandInteraction) {
  const code = interaction.options.getString('code', true).trim().toUpperCase();
  const result = await api<{ ok: boolean; error?: string; first_name?: string; plan_name?: string; pro?: boolean }>('/link', {
    method: 'POST',
    body: { code, discord_user_id: interaction.user.id },
  });
  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.error ?? 'Liaison impossible.'}`, flags: MessageFlags.Ephemeral });
    return;
  }
  await syncMember(interaction.user.id, Boolean(result.pro));
  await interaction.reply({
    content: result.pro
      ? `✅ C’est lié, ${result.first_name ?? 'bienvenue'} ! Plan ${result.plan_name} : tu recevras ton récap en message privé chaque matin.`
      : `✅ C’est lié, ${result.first_name ?? 'bienvenue'} ! Le récap en message privé et le salon Pro arrivent avec le plan Pro.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function onDelier(interaction: ChatInputCommandInteraction) {
  const result = await api<{ ok: boolean; error?: string }>('/unlink', {
    method: 'POST',
    body: { discord_user_id: interaction.user.id },
  });
  if (result.ok) await syncMember(interaction.user.id, false);
  await interaction.reply({
    content: result.ok ? '✅ Liaison retirée. Tu ne recevras plus de récap ici.' : `❌ ${result.error ?? 'Aucun compte lié.'}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------------------------------------------------------------
// Récap en message privé
// ---------------------------------------------------------------------------
function digestEmbed(content: DigestContent, siteUrl: string) {
  const embed = new EmbedBuilder()
    .setColor(ROSE)
    .setTitle(`${content.first_name ? `${content.first_name}, voici` : 'Voici'} tes produits du jour`)
    .setURL(`${siteUrl}/app`)
    .setFooter({ text: `${BRAND} · signale toujours la collaboration commerciale (#publicité)` });
  for (const [i, p] of content.products.entries()) {
    embed.addFields({
      name: `${i + 1}. ${p.name}${p.score !== null ? ` · ${p.score}/100` : ''}`,
      value: `${euros(p.price_cents)} · **${euros(p.commission_cents)} par vente** · ${p.trend === 'baisse' ? '↘' : '↗'} ${growth(p.growth_7d)}${p.free_sample ? ' · échantillon gratuit' : ''}\n[Voir la fiche](${siteUrl}/app/produit/${p.id})`,
    });
  }
  if (content.hook) embed.addFields({ name: `Accroche du jour (${content.hook.product_name})`, value: `« ${content.hook.text} »` });
  if (content.script) {
    embed.addFields({ name: `Script prêt : ${content.script.title}`, value: content.script.lines.map((l, i) => `${i + 1}. ${l}`).join('\n').slice(0, 1000) });
  }
  return embed;
}

async function deliverDueDigests(client: Client) {
  const { due, site_url } = await api<{ due: Array<{ user_id: string; discord_user_id: string; day: string; content: DigestContent }>; site_url: string }>(
    '/digests',
  );
  for (const item of due) {
    let status: 'sent' | 'failed' = 'sent';
    try {
      const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir mon radar').setURL(`${site_url}/app`);
      await client.users.send(item.discord_user_id, {
        embeds: [digestEmbed(item.content, site_url)],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      });
    } catch (error) {
      // Messages privés fermés, utilisateur parti du serveur…
      console.warn(`Récap non envoyé à ${item.discord_user_id} :`, (error as Error).message);
      status = 'failed';
    }
    await api('/digests/ack', { method: 'POST', body: { user_id: item.user_id, day: item.day, status } });
  }
  if (due.length) console.log(`Récaps privés traités : ${due.length}`);
}

// ---------------------------------------------------------------------------
// Salon public et salon Pro
// ---------------------------------------------------------------------------
async function postDailyChannels(client: Client) {
  const { day, hour } = parisNow();
  const state = readState();
  if (hour < config.publicHour || state.lastPublicDay === day) return;
  const data = await api<{
    site_url: string;
    teaser: Array<{ masked_name: string; niche: string; trend: string; growth_7d: number }>;
    full: Array<{ name: string; niche: string; score: number; price_cents: number; commission_cents: number; trend: string; growth_7d: number; url: string }>;
  }>('/daily');

  if (config.publicChannelId) {
    const channel = (await client.channels.fetch(config.publicChannelId)) as TextChannel | null;
    const embed = new EmbedBuilder()
      .setColor(ROSE)
      .setTitle('Les produits du jour')
      .setDescription(
        data.teaser.map((p, i) => `**${i + 1}. ${p.masked_name}** · ${p.niche} · ${p.trend} ${growth(p.growth_7d)}`).join('\n') +
          `\n\nNoms, scores et la suite du classement : réservés aux membres Pro. [Voir les plans](${data.site_url}/prix)`,
      );
    await channel?.send({ embeds: [embed] });
  }
  if (config.proChannelId) {
    const channel = (await client.channels.fetch(config.proChannelId)) as TextChannel | null;
    const embed = new EmbedBuilder()
      .setColor(0x25f4ee)
      .setTitle('Radar complet du jour')
      .setDescription(
        data.full
          .map((p, i) => `**${i + 1}. [${p.name}](${p.url})** · ${p.score}/100\n${p.niche} · ${euros(p.price_cents)} · ${euros(p.commission_cents)} par vente · ${p.trend} ${growth(p.growth_7d)}`)
          .join('\n')
          .slice(0, 4000),
      );
    await channel?.send({ embeds: [embed] });
  }
  writeState({ ...state, lastPublicDay: day });
  console.log(`Salons du ${day} publiés.`);
}

// ---------------------------------------------------------------------------
// Rôle Pro synchronisé avec le plan
// ---------------------------------------------------------------------------
let clientRef: Client | null = null;

async function syncMember(discordUserId: string, pro: boolean) {
  if (!config.proRoleId || !clientRef) return;
  try {
    const guild = await clientRef.guilds.fetch(config.guildId);
    const member = await guild.members.fetch(discordUserId);
    const has = member.roles.cache.has(config.proRoleId);
    if (pro && !has) await member.roles.add(config.proRoleId, `Abonné ${BRAND}`);
    if (!pro && has) await member.roles.remove(config.proRoleId, `Plus abonné ${BRAND}`);
  } catch {
    // Membre absent du serveur : rien à faire.
  }
}

async function syncRoles() {
  if (!config.proRoleId || !clientRef) return;
  const { members } = await api<{ members: Array<{ discord_user_id: string; pro: boolean }> }>('/members');
  for (const m of members) await syncMember(m.discord_user_id, m.pro);
  // Retire le rôle à ceux qui l'ont encore sans être (ou sans être restés) abonnés.
  const guild = await clientRef.guilds.fetch(config.guildId);
  const role = await guild.roles.fetch(config.proRoleId);
  const proIds = new Set(members.filter((m) => m.pro).map((m) => m.discord_user_id));
  for (const [id, member] of role?.members ?? []) {
    if (!proIds.has(id)) await member.roles.remove(config.proRoleId, `Plus abonné ${BRAND}`).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function safely(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    console.error(`[${label}]`, (error as Error).message);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
clientRef = client;

client.once(Events.ClientReady, async (ready) => {
  console.log(`Connecté en tant que ${ready.user.tag}`);
  await new REST().setToken(config.token).put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log('Commandes /lier et /delier enregistrées.');

  const tick = async () => {
    await safely('récaps', () => deliverDueDigests(client));
    await safely('salons', () => postDailyChannels(client));
  };
  await tick();
  setInterval(tick, 5 * 60_000);
  await safely('rôles', syncRoles);
  setInterval(() => safely('rôles', syncRoles), 10 * 60_000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'lier') await onLier(interaction);
    else if (interaction.commandName === 'delier') await onDelier(interaction);
  } catch (error) {
    console.error('[commande]', error);
    const reply = { content: '❌ Le service ne répond pas. Réessaie dans un instant.', flags: MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => undefined);
    else await interaction.reply(reply).catch(() => undefined);
  }
});

process.on('SIGTERM', () => {
  void client.destroy();
  process.exit(0);
});

void client.login(config.token);

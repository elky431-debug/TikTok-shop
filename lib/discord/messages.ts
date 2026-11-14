import { BRAND } from '@/lib/brand';
import type { DigestContent, PlanId, Product } from '@/lib/db/types';
import { nicheLabel, nicheShort, type NicheId } from '@/lib/niches';
import { getPlan } from '@/lib/plans';
import { commissionPerSale, TREND_LABELS } from '@/lib/score';
import type { TrendEntry } from '@/lib/tendances';
import { formatDayMonth, formatEuros, formatGrowth } from '@/lib/utils';
import type { QuickHook } from './hook';
import { displayName, shortLabel } from '@/lib/product-name';

/**
 * Messages envoyés par le bot (objets « embed » et boutons de la doc Discord : resources/message, components/reference).
 * Limites respectées : titre 256, description 4096, nom de champ 256, valeur de champ 1024 caractères, 25 champs.
 */
const ROSE = 0xfe2c55;
const CYAN = 0x25f4ee;
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export interface DiscordMessage {
  content?: string;
  embeds?: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
  flags?: number;
  /** Mentions autorisées : `{ parse: [] }` affiche les pseudos sans notifier personne. */
  allowed_mentions?: { parse: string[] };
}

/** Rangée avec un bouton lien (composant 1 « Action Row » contenant un bouton 2, style 5 « Link »). */
export function linkButton(label: string, url: string) {
  return { type: 1, components: [{ type: 2, style: 5, label, url }] };
}

/** Mentions des données : produits fictifs, ou relevé de plus de 36 heures (« Données du [date] »). */
function dataNote(input: { demo: boolean; stale: boolean; dataDate: string | null }): string | null {
  if (input.demo) return 'Produits fictifs : démonstration en attendant le branchement des vraies données.';
  if (input.stale && input.dataDate) return `Données du ${formatDayMonth(input.dataDate)}.`;
  return null;
}

export function digestMessage(content: DigestContent, siteUrl: string): DiscordMessage {
  const fields = content.products.slice(0, 10).map((p, i) => ({
    name: cut(`${i + 1}. ${shortLabel(p.name)}${p.score !== null ? ` · ${p.score}/100` : ''}`, 256),
    value: cut(
      `${formatEuros(p.price_cents)} · **${formatEuros(p.commission_cents)} par vente** · ${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}\n` +
        `[Voir la fiche](${siteUrl}/app/produit/${p.id})`,
      1024,
    ),
  }));
  if (content.hook) fields.push({ name: cut(`Accroche du jour (${shortLabel(content.hook.product_name)})`, 256), value: cut(`« ${content.hook.text} »`, 1024) });
  if (content.script) {
    fields.push({
      name: cut(`Script prêt : ${content.script.title}`, 256),
      value: cut(content.script.lines.map((l, i) => `${i + 1}. ${l}`).join('\n'), 1024),
    });
  }
  return {
    embeds: [
      {
        title: cut(`${content.first_name ? `${content.first_name}, voici` : 'Voici'} tes produits du jour`, 256),
        url: `${siteUrl}/app`,
        color: ROSE,
        ...(content.demo ? { description: 'Produits fictifs : démonstration en attendant le branchement des vraies données.' } : {}),
        fields,
        footer: { text: `${BRAND} · signale toujours la collaboration commerciale (#publicité)` },
      },
    ],
    components: [linkButton('Ouvrir mon radar', `${siteUrl}/app`)],
  };
}

/** Masque un nom : « Sérum ██████ ». */
export function maskName(name: string): string {
  const [first, ...rest] = name.split(' ');
  return `${first} ${rest.map((w) => '█'.repeat(Math.min(6, w.length))).join(' ')}`.trim();
}

/**
 * Salon public : les produits d'hier (relevé de la veille), en clair mais sans score, avec le lien des pages
 * publiques. Le classement du jour reste réservé aux membres Pro (salon Pro).
 */
export function veilleMessage(input: { entries: TrendEntry[]; date: string; demo: boolean; siteUrl: string }): DiscordMessage {
  const suffix = input.demo ? ' (produits fictifs, démonstration)' : '';
  const lines = input.entries
    .slice(0, 5)
    .map(
      (p, i) =>
        `**${i + 1}. ${cut(displayName(p), 120)}** · ${nicheShort(p.niche)} · ${formatEuros(p.price_cents)} · ${TREND_LABELS[p.trend]}${p.growth_known ? ` ${formatGrowth(p.growth_7d)}` : ''}`,
    );
  return {
    embeds: [
      {
        title: `Les produits d’hier${suffix}`,
        color: ROSE,
        description: cut(
          `${lines.join('\n')}\n\nRelevé du ${formatDayMonth(input.date)}. Ceux d’aujourd’hui, avec leur score et le classement complet, ` +
            'sont dans le salon Pro.',
          4096,
        ),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: 'Voir les tendances', url: `${input.siteUrl}/tendances` },
          { type: 2, style: 5, label: 'Voir les plans', url: `${input.siteUrl}/prix` },
        ],
      },
    ],
  };
}

/** Salon Pro : les 10 premiers du jour, en clair, avec leur score. */
export function proChannelMessage(input: { products: Product[]; demo: boolean; siteUrl: string }): DiscordMessage {
  const top = [...input.products].sort((a, b) => b.latest_score - a.latest_score).slice(0, 10);
  const suffix = input.demo ? ' (produits fictifs, démonstration)' : '';
  return {
    embeds: [
      {
        title: `Radar complet du jour${suffix}`,
        color: CYAN,
        description: cut(
          top
            .map(
              (p, i) =>
                `**${i + 1}. [${cut(displayName(p), 120)}](${input.siteUrl}/app/produit/${p.id})** · ${p.latest_score}/100\n` +
                `${nicheShort(p.niche)} · ${formatEuros(p.price_cents)} · ${formatEuros(commissionPerSale(p.price_cents, p.commission_rate))} par vente · ${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}`,
            )
            .join('\n'),
          4096,
        ),
      },
    ],
  };
}

/** /produits : le top du jour d'une niche, avec ou sans score selon le plan. */
export function produitsMessage(input: {
  niche: NicheId;
  products: Product[];
  plan: PlanId;
  lockedCount: number;
  demo: boolean;
  stale: boolean;
  dataDate: string | null;
  siteUrl: string;
}): DiscordMessage {
  const plan = getPlan(input.plan);
  const lines = input.products.slice(0, 10).map(
    (p, i) =>
      `**${i + 1}. [${cut(displayName(p), 120)}](${input.siteUrl}/app/produit/${p.id})**${plan.showScore ? ` · ${p.latest_score}/100` : ''}\n` +
      `${formatEuros(p.price_cents)} · ${formatEuros(commissionPerSale(p.price_cents, p.commission_rate))} par vente · ${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}`,
  );
  const notes = [
    dataNote(input),
    input.lockedCount > 0
      ? `${input.lockedCount} autre${input.lockedCount > 1 ? 's' : ''} produit${input.lockedCount > 1 ? 's' : ''} de cette niche ${input.lockedCount > 1 ? 'sont réservés' : 'est réservé'} aux abonnés, avec les scores.`
      : null,
  ].filter(Boolean);
  return {
    embeds: [
      {
        title: cut(`${nicheLabel(input.niche)} : ${plan.showScore ? 'le top du jour' : 'tes produits du jour'}`, 256),
        color: plan.showScore ? CYAN : ROSE,
        description: cut([lines.join('\n'), ...notes].filter(Boolean).join('\n\n'), 4096),
      },
    ],
    components: [linkButton(plan.showScore ? 'Ouvrir le radar' : 'Voir les plans', `${input.siteUrl}${plan.showScore ? '/app' : '/prix'}`)],
  };
}

/** /score : le score d'un produit expliqué en phrases (masqué sans abonnement, comme dans l'appli). */
export function scoreMessage(input: { product: Product; plan: PlanId; demo: boolean; stale: boolean; dataDate: string | null; siteUrl: string }): DiscordMessage {
  const { product } = input;
  const plan = getPlan(input.plan);
  const breakdown = product.latest_breakdown;
  const reasons = (breakdown?.parts ?? [])
    .filter((p) => p.available !== false)
    .map((p) => `• ${p.label}${plan.showScore ? ` (${String(p.points).replace('.', ',')} pts)` : ''} : ${p.sentence}`)
    .join('\n');
  const growthKnown = breakdown ? breakdown.growth_7d !== null : true;
  const fields = [
    { name: 'Score', value: plan.showScore ? `**${product.latest_score}/100**` : 'Réservé aux abonnés', inline: true },
    { name: 'Prix', value: formatEuros(product.price_cents), inline: true },
    { name: 'Par vente', value: formatEuros(commissionPerSale(product.price_cents, product.commission_rate)), inline: true },
    {
      name: 'Tendance sur 7 jours',
      value: growthKnown ? `${TREND_LABELS[product.trend]} ${formatGrowth(product.growth_7d)}` : 'En mesure (historique trop court)',
      inline: true,
    },
    { name: 'Niche', value: nicheLabel(product.niche), inline: true },
  ];
  if (reasons) fields.push({ name: 'Pourquoi', value: cut(reasons, 1024), inline: false });
  const note = dataNote(input);
  return {
    embeds: [
      {
        title: cut(displayName(product), 256),
        url: `${input.siteUrl}/app/produit/${product.id}`,
        color: CYAN,
        description: cut([breakdown?.summary, note].filter(Boolean).join('\n\n'), 4096) || undefined,
        fields,
      },
    ],
    components: [linkButton('Voir la fiche', `${input.siteUrl}/app/produit/${product.id}`)],
  };
}

/** /script : l'accroche rapide, avec le lien du studio pour le script complet. */
export function hookMessage(product: Pick<Product, 'id' | 'name'>, hook: QuickHook & { simulated: boolean }, siteUrl: string): DiscordMessage {
  return {
    content: '',
    embeds: [
      {
        title: cut(`Accroche pour ${displayName(product)}`, 256),
        color: ROSE,
        description: cut(
          `**« ${hook.accroche} »**\n\n${hook.idee}${hook.simulated ? '\n\n_Accroche d’exemple : le service d’écriture n’est pas branché._' : ''}`,
          4096,
        ),
        footer: { text: 'Signale toujours la collaboration commerciale (#publicité).' },
      },
    ],
    components: [linkButton('Écrire le script complet', `${siteUrl}/app/studio?produit=${encodeURIComponent(product.id)}`)],
  };
}

/** Classement hebdomadaire des séries (membres inscrits seulement), sans notifier personne. */
export function leaderboardMessage(entries: Array<{ discordUserId: string; days: number }>, siteUrl: string): DiscordMessage {
  const medals = ['🥇', '🥈', '🥉'];
  return {
    embeds: [
      {
        title: 'Classement des séries de la semaine',
        color: CYAN,
        description: cut(
          entries.map((e, i) => `${medals[i] ?? `**${i + 1}.**`} <@${e.discordUserId}> · ${e.days} jour${e.days > 1 ? 's' : ''} d’affilée`).join('\n') +
            '\n\nUn jour compte dès que tu écris un script, utilises /score ou /script, ou marques une vidéo postée. ' +
            'Seuls les membres inscrits avec /classement apparaissent ici.',
          4096,
        ),
      },
    ],
    components: [linkButton('Ouvrir mon radar', `${siteUrl}/app`)],
    allowed_mentions: { parse: [] },
  };
}

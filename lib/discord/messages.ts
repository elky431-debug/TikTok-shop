import { BRAND } from '@/lib/brand';
import type { DigestContent, Product } from '@/lib/db/types';
import { nicheShort } from '@/lib/niches';
import { commissionPerSale, TREND_LABELS } from '@/lib/score';
import { formatEuros, formatGrowth } from '@/lib/utils';

/**
 * Messages envoyés par le bot (objets « embed » et boutons de la doc Discord : resources/message, components/reference).
 * Limites respectées : titre 256, description 4096, valeur de champ 1024 caractères.
 */
const ROSE = 0xfe2c55;
const CYAN = 0x25f4ee;
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export interface DiscordMessage {
  content?: string;
  embeds?: Array<Record<string, unknown>>;
  components?: Array<Record<string, unknown>>;
  flags?: number;
}

/** Rangée avec un bouton lien (composant 1 « Action Row » contenant un bouton 2, style 5 « Link »). */
export function linkButton(label: string, url: string) {
  return { type: 1, components: [{ type: 2, style: 5, label, url }] };
}

export function digestMessage(content: DigestContent, siteUrl: string): DiscordMessage {
  const fields = content.products.slice(0, 10).map((p, i) => ({
    name: cut(`${i + 1}. ${p.name}${p.score !== null ? ` · ${p.score}/100` : ''}`, 256),
    value: cut(
      `${formatEuros(p.price_cents)} · **${formatEuros(p.commission_cents)} par vente** · ${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}\n` +
        `[Voir la fiche](${siteUrl}/app/produit/${p.id})`,
      1024,
    ),
  }));
  if (content.hook) fields.push({ name: cut(`Accroche du jour (${content.hook.product_name})`, 256), value: cut(`« ${content.hook.text} »`, 1024) });
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

/** Masque un nom : « Sérum ██████ ». Aucune information exploitable pour les non-abonnés. */
export function maskName(name: string): string {
  const [first, ...rest] = name.split(' ');
  return `${first} ${rest.map((w) => '█'.repeat(Math.min(6, w.length))).join(' ')}`.trim();
}

/** Salon public : 3 produits masqués. Salon Pro : les 10 premiers, en clair. */
export function channelMessages(input: { products: Product[]; demo: boolean; siteUrl: string }) {
  const top = [...input.products].sort((a, b) => b.latest_score - a.latest_score).slice(0, 10);
  const suffix = input.demo ? ' (produits fictifs, démonstration)' : '';
  const teaser: DiscordMessage = {
    embeds: [
      {
        title: `Les produits du jour${suffix}`,
        color: ROSE,
        description: cut(
          top
            .slice(0, 3)
            .map((p, i) => `**${i + 1}. ${maskName(p.name)}** · ${nicheShort(p.niche)} · ${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}`)
            .join('\n') + '\n\nNoms, scores et la suite du classement : réservés aux membres Pro.',
          4096,
        ),
      },
    ],
    components: [linkButton('Voir les plans', `${input.siteUrl}/prix`)],
  };
  const full: DiscordMessage = {
    embeds: [
      {
        title: `Radar complet du jour${suffix}`,
        color: CYAN,
        description: cut(
          top
            .map(
              (p, i) =>
                `**${i + 1}. [${p.name}](${input.siteUrl}/app/produit/${p.id})** · ${p.latest_score}/100\n` +
                `${nicheShort(p.niche)} · ${formatEuros(p.price_cents)} · ${formatEuros(commissionPerSale(p.price_cents, p.commission_rate))} par vente · ${TREND_LABELS[p.trend]} ${formatGrowth(p.growth_7d)}`,
            )
            .join('\n'),
          4096,
        ),
      },
    ],
  };
  return { teaser, full };
}

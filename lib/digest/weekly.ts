import { createElement } from 'react';
import { WeeklyRecapEmail } from '@/emails/weekly-recap';
import { getRepo, type Repo } from '@/lib/db';
import type { PlanId, Profile } from '@/lib/db/types';
import { discordStatus } from '@/lib/discord/config';
import { linkButton } from '@/lib/discord/messages';
import { discordApi } from '@/lib/discord/rest';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { notify } from '@/lib/notify';
import { getPlan } from '@/lib/plans';
import { unsubscribeHeaders, unsubscribeUrls } from '@/lib/unsubscribe';
import { addDays, formatEuros, parisDate, plural } from '@/lib/utils';
import { weekStart, type EarningData } from '@/lib/v2/earnings';
import type { PublicationPlan } from '@/lib/v2/planning';
import { bestStreak, currentStreak, observePostedVideos, totalsByDay } from './history';
import type { RecapChannels } from './settings';
import { displayName, shortLabel } from '@/lib/product-name';

/**
 * Récap du dimanche : la semaine du lundi au dimanche. Vidéos postées (relevé de « Mes produits » et des plans), gains
 * saisis (fiches `gain`), série de jours, progression vers l'objectif, meilleur produit de la semaine. Que des chiffres
 * saisis ou mesurés : rien n'est estimé, aucune promesse.
 */
export const WEEKLY_RECAP_KIND = 'recap_dimanche';

export interface WeeklyRecapContent {
  week_start: string;
  week_end: string;
  /** Jour de calcul (AAAA-MM-JJ, Paris). */
  date: string;
  first_name: string | null;
  plan: PlanId;
  videos: { total: number; previous_week: number; by_day: Array<{ date: string; count: number }> };
  streak: { current: number; best: number };
  goals: Array<{ product_id: string; name: string; posted: number; goal: number }>;
  /** null = suivi des gains pas inclus dans le plan. */
  gains: { cents: number; entries: number } | null;
  best_product: { product_id: string | null; name: string; reason: 'gains' | 'videos' | 'score'; detail: string } | null;
  /** Vidéos prévues la semaine prochaine dans les plans de publication ; null = pas de plan (ou plan non inclus). */
  next_week_planned: number | null;
}

export function isSunday(day: string): boolean {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
}

/** Construit le récap de la semaine qui contient `today` (relève d'abord les vidéos postées). */
export async function buildWeeklyRecap(profile: Profile, repo: Repo = getRepo(), at = new Date()): Promise<WeeklyRecapContent> {
  const today = parisDate(at);
  const start = weekStart(today);
  const end = addDays(start, 6);
  const plan = getPlan(profile.plan);
  const history = await observePostedVideos(profile.id, repo, at);
  const [saved, gains, plans] = await Promise.all([
    repo.listSavedProducts(profile.id),
    plan.earnings ? repo.listRecords<EarningData>(profile.id, 'gain') : Promise.resolve([]),
    plan.planning ? repo.listRecords<PublicationPlan>(profile.id, 'publication') : Promise.resolve([]),
  ]);
  const productIds = [...new Set([...saved.map((s) => s.product_id), ...Object.values(history.days).flatMap((d) => Object.keys(d))])];
  const products = productIds.length ? await repo.getProducts(productIds) : [];
  const names = new Map(products.map((p) => [p.id, displayName(p)]));

  const byDay = totalsByDay(history);
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const total = week.reduce((s, d) => s + (byDay[d] ?? 0), 0);
  const previous = week.reduce((s, d) => s + (byDay[addDays(d, -7)] ?? 0), 0);

  const weekGains = gains.map((g) => g.data).filter((g) => g.date >= start && g.date <= end);
  const gainsByProduct = new Map<string, { name: string; id: string | null; cents: number }>();
  for (const g of weekGains) {
    const key = g.product_name.toLowerCase();
    const row = gainsByProduct.get(key) ?? { name: shortLabel(g.product_name), id: g.product_id, cents: 0 };
    row.cents += g.amount_cents;
    gainsByProduct.set(key, row);
  }

  const videosByProduct = new Map<string, number>();
  for (const d of week) for (const [id, n] of Object.entries(history.days[d] ?? {})) videosByProduct.set(id, (videosByProduct.get(id) ?? 0) + n);

  let best: WeeklyRecapContent['best_product'] = null;
  const topGain = [...gainsByProduct.values()].sort((a, b) => b.cents - a.cents)[0];
  const topVideos = [...videosByProduct.entries()].filter(([id]) => names.has(id)).sort((a, b) => b[1] - a[1])[0];
  const followed = products.filter((p) => saved.some((s) => s.product_id === p.id)).sort((a, b) => b.latest_score - a.latest_score)[0];
  if (topGain && topGain.cents > 0) {
    best = { product_id: topGain.id, name: topGain.name, reason: 'gains', detail: `${formatEuros(topGain.cents)} de gains saisis cette semaine` };
  } else if (topVideos && topVideos[1] > 0) {
    best = { product_id: topVideos[0], name: names.get(topVideos[0])!, reason: 'videos', detail: `${plural(topVideos[1], 'vidéo postée', 'vidéos postées')} cette semaine` };
  } else if (followed) {
    best = {
      product_id: followed.id,
      name: followed.name,
      reason: 'score',
      detail: plan.showScore ? `Le mieux noté de tes produits suivis (score ${followed.latest_score}/100)` : 'Le mieux classé de tes produits suivis',
    };
  }

  const nextStart = addDays(start, 7);
  const nextEnd = addDays(start, 13);
  const nextWeek = plans
    .flatMap((p) => p.data.items)
    .filter((i) => i.date !== null && i.date >= nextStart && i.date <= nextEnd && i.status !== 'poste').length;

  return {
    week_start: start,
    week_end: end,
    date: today,
    first_name: profile.first_name,
    plan: profile.plan,
    videos: { total, previous_week: previous, by_day: week.map((date) => ({ date, count: byDay[date] ?? 0 })) },
    streak: { current: currentStreak(byDay, today), best: bestStreak(byDay) },
    goals: saved
      .filter((s) => names.has(s.product_id))
      .sort((a, b) => b.videos_posted - a.videos_posted || b.updated_at.localeCompare(a.updated_at))
      .slice(0, 3)
      .map((s) => ({ product_id: s.product_id, name: names.get(s.product_id)!, posted: s.videos_posted, goal: s.video_goal })),
    gains: plan.earnings ? { cents: weekGains.reduce((s, g) => s + g.amount_cents, 0), entries: weekGains.length } : null,
    best_product: best,
    next_week_planned: plan.planning && plans.length ? nextWeek : null,
  };
}

/** Résumé en une phrase (notification, aperçu de l'e-mail). */
export function weeklySummary(content: WeeklyRecapContent): string {
  const parts = [`${plural(content.videos.total, 'vidéo postée', 'vidéos postées')} cette semaine`];
  if (content.streak.current > 1) parts.push(`série de ${content.streak.current} jours`);
  if (content.gains && content.gains.cents > 0) parts.push(`${formatEuros(content.gains.cents)} de gains saisis`);
  return parts.join(' · ');
}

function discordWeeklyText(content: WeeklyRecapContent): string {
  const lines = [`📅 **Ta semaine** (${weeklySummary(content)})`];
  if (content.best_product) lines.push(`🏆 ${content.best_product.name} : ${content.best_product.detail}`);
  for (const g of content.goals) lines.push(`🎯 ${g.name} : ${g.posted}/${g.goal} vidéos`);
  if (content.next_week_planned) lines.push(`🗓️ ${plural(content.next_week_planned, 'vidéo prévue', 'vidéos prévues')} la semaine prochaine`);
  return lines.join('\n').slice(0, 1900);
}

export interface WeeklySendResult {
  email: boolean;
  discord: boolean;
  push: boolean;
}

/**
 * Envoie le récap du dimanche sur les canaux choisis. Une fois par semaine (fiche `recap_dimanche` de la semaine et clé
 * d'idempotence Resend). Une notification est toujours rangée dans le centre de notifications ; le push n'est envoyé que
 * si l'utilisateur l'a choisi. Un canal en panne n'empêche pas les autres.
 */
export async function sendWeeklyRecap(
  profile: Profile,
  channels: Pick<RecapChannels, 'email' | 'discord' | 'push'>,
  repo: Repo = getRepo(),
  at = new Date(),
  options: { test?: boolean } = {},
): Promise<{ content: WeeklyRecapContent; sent: WeeklySendResult }> {
  const content = await buildWeeklyRecap(profile, repo, at);
  const sent: WeeklySendResult = { email: false, discord: false, push: false };
  // Récap de la semaine : à partir de Pro (vérifié ici, pour la tâche du dimanche comme pour l'envoi de test).
  if (!getPlan(profile.plan).weeklyDigest) return { content, sent };
  const url = `${env.siteUrl}/app`;

  if (channels.email && profile.email) {
    try {
      await sendEmail({
        to: profile.email,
        subject: `Ta semaine : ${weeklySummary(content)}`,
        react: createElement(WeeklyRecapEmail, {
          content,
          siteUrl: env.siteUrl,
          unsubscribeUrl: unsubscribeUrls(profile.id, env.siteUrl, 'dimanche').page,
        }),
        headers: unsubscribeHeaders(profile.id, 'dimanche'),
        // Un envoi de test (bouton de la page Récap) ne doit pas bloquer le vrai récap du dimanche.
        idempotencyKey: options.test ? undefined : `recap-dimanche-${profile.id}-${content.week_start}`,
      });
      sent.email = true;
    } catch (error) {
      console.warn('[récap du dimanche] e-mail', profile.id, error instanceof Error ? error.message : error);
    }
  }
  if (channels.discord && profile.discord_user_id && getPlan(profile.plan).discordDigest && discordStatus().digests) {
    try {
      const channel = await discordApi<{ id: string }>('POST', '/users/@me/channels', { recipient_id: profile.discord_user_id });
      await discordApi('POST', `/channels/${channel.id}/messages`, {
        content: discordWeeklyText(content),
        components: [linkButton('Ouvrir mon récap', url)],
      });
      sent.discord = true;
    } catch (error) {
      console.warn('[récap du dimanche] Discord', profile.id, error instanceof Error ? error.message : error);
    }
  }
  if (options.test) return { content, sent };

  const notification = await notify(
    profile.id,
    { type: 'recap', title: 'Ton récap de la semaine', body: weeklySummary(content), path: '/app', channels: { push: channels.push } },
    repo,
  );
  sent.push = Boolean(notification?.channels.push);

  const previous = await repo.listRecords<{ week_start: string }>(profile.id, WEEKLY_RECAP_KIND);
  const same = previous.find((r) => r.data.week_start === content.week_start);
  await repo.saveRecord(profile.id, WEEKLY_RECAP_KIND, { week_start: content.week_start, content, sent, sent_at: at.toISOString() }, same?.id);
  // On garde les 12 dernières semaines.
  for (const old of previous.filter((r) => r.id !== same?.id).slice(11)) await repo.deleteRecord(profile.id, old.id);
  return { content, sent };
}

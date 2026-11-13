import type { Metadata } from 'next';
import { SimpleShell } from '@/components/app/simple-shell';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState, Panel, PageHeader } from '@/components/ui/surface';
import { aiPrice, aiCostUsd, estimateMargin, nexscopeByDay, NEXSCOPE_CREDITS, TOKENS } from '@/lib/admin/costs';
import { getBusinessMetrics, latestSubscriptions, listDailyMetrics } from '@/lib/admin/metrics';
import { adminSettings } from '@/lib/admin/settings';
import { requireAdmin } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { getLiveCatalog } from '@/lib/catalog';
import type { ProviderRunStats } from '@/lib/data';
import { getRepo } from '@/lib/db';
import { discordStatus } from '@/lib/discord/config';
import { env, isAiConfigured, isLocalMode, isResendConfigured } from '@/lib/env';
import { addDays, cn, formatDayMonth, formatEuros, formatInt, formatPercent, formatRelative, formatShortDate, parisDate } from '@/lib/utils';
import { recordMetricsAction, runDiscordAction, runRefreshAction, setApplicationStatusAction } from './actions';
import { AdminNav, DayBars, Section, Stat } from './admin-ui';

export const metadata: Metadata = { title: 'Administration' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=rafraichissement': { tone: 'gain', text: 'Rafraîchissement terminé : le radar affiche les produits du jour.' },
  'ok=lance': { tone: 'gain', text: 'Rafraîchissement lancé en arrière-plan : le résultat apparaît ici dans quelques minutes.' },
  'ok=repli': { tone: 'rose', text: 'La source réelle a échoué : rafraîchissement fait en repli (voir le détail ci-dessous).' },
  'ok=discord': { tone: 'gain', text: 'Tâche Discord relancée : seul ce qui n’a pas encore été envoyé aujourd’hui part.' },
  'ok=releve': { tone: 'gain', text: 'Chiffres de la veille relevés.' },
  'erreur=rafraichissement': { tone: 'rose', text: 'Le rafraîchissement a échoué : voir le détail dans la dernière tâche.' },
  'erreur=discord': { tone: 'rose', text: 'La tâche Discord n’a pas pu être lancée. Vérifie CRON_SECRET et les journaux.' },
};

const usd = (value: number) => `${value.toFixed(value < 1 ? 3 : 2).replace('.', ',')} $`;

export default async function AdminPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  await requireAdmin();
  const repo = getRepo();
  const now = new Date();
  const [metrics, daily, runs, applications, products, catalog, profiles, allSubs, coaches] = await Promise.all([
    getBusinessMetrics(repo, now),
    listDailyMetrics(30, repo, now),
    repo.listCronRuns(60),
    repo.listCoachApplications(),
    repo.countProducts(),
    getLiveCatalog(repo),
    repo.listProfiles({ limit: 1000 }),
    repo.listSubscriptions(),
    repo.listCoaches(),
  ]);
  const emails = isLocalMode() && repo.listLocalEmails ? await repo.listLocalEmails(10) : [];
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`] ?? (k === 'erreur' && v ? { tone: 'rose' as const, text: v } : undefined))
    .find(Boolean);

  const refreshRuns = runs.filter((r) => r.job === 'refresh');
  const lastRun = refreshRuns[0];
  const fallbacks = (lastRun?.details.repli as Array<{ provider: string; error: string }> | undefined) ?? [];
  const stats = lastRun?.details.stats as ProviderRunStats | undefined;

  const today = parisDate(now);
  const since30 = addDays(today, -30);
  const nexscope = nexscopeByDay(refreshRuns);
  const dailyByDay = new Map(daily.map((d) => [d.day, d]));
  const price = aiPrice();
  const costDays = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).map((day) => ({
    day,
    nexscope: nexscope.find((n) => n.day === day) ?? null,
    ai: dailyByDay.get(day) ?? null,
  }));
  const margin = estimateMargin({
    mrr: metrics.mrr,
    subscriptions: latestSubscriptions(allSubs).subscriptions,
    profiles,
    coachRates: new Map(coaches.map((c) => [c.id, c.commission_rate])),
    nexscope30: nexscope.filter((n) => n.day > since30),
    ai30: daily.filter((d) => d.day > since30),
  });
  const discord = discordStatus();

  const services = [
    { name: 'Base de données', value: isLocalMode() ? 'Fichier local' : 'Supabase', ok: !isLocalMode() },
    { name: 'Données produits', value: env.dataProvider === 'mock' ? 'Fictives (mock)' : env.dataProvider, ok: env.dataProvider !== 'mock' },
    {
      name: 'Radar affiché',
      value: catalog.demo
        ? 'produits fictifs'
        : `${catalog.provider ?? '—'}${catalog.dataDate ? `, relevé du ${formatDayMonth(catalog.dataDate)}` : ''}${catalog.stale ? ' (plus de 36 h)' : ''}`,
      ok: !catalog.demo && !catalog.stale,
    },
    { name: 'Scripts', value: env.aiModelLabel, ok: isAiConfigured() },
    { name: 'Paiement', value: billingMode() === 'stripe' ? 'Stripe' : billingMode() === 'simulation' ? 'Simulé' : 'Désactivé', ok: billingMode() === 'stripe' },
    { name: 'E-mails', value: isResendConfigured() ? 'Resend' : 'Boîte locale', ok: isResendConfigured() },
    { name: 'Discord', value: discord.interactions ? 'Commandes actives' : 'Non configuré', ok: discord.interactions },
  ];

  return (
    <SimpleShell title="Administration">
      <PageHeader eyebrow="Administration" title="Aperçu" description="Inscriptions, abonnements, données et tâches de la nuit : l’état de Tracktout en un coup d’œil." className="mb-6" />
      <div className="mt-4">
        <AdminNav current="apercu" />
      </div>
      {message ? <Callout tone={message.tone} className="mb-4" title={message.text} /> : null}

      <ul className="flex flex-wrap gap-2">
        {services.map((s) => (
          <li key={s.name}>
            <Badge tone={s.ok ? 'gain' : 'warn'}>
              {s.name} : {s.value}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="mt-10 space-y-12">
        <Section
          id="indicateurs"
          title="Indicateurs"
          aside={<span className="text-sm text-muted">Abonnements : {metrics.source === 'stripe' ? 'Stripe' : metrics.source === 'simulation' ? 'simulés (mode local)' : 'aucun'}</span>}
        >
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
            <Stat label="MRR (TTC)" value={formatEuros(metrics.mrr.ttcCents)} hint={`${formatEuros(metrics.mrr.htCents)} hors taxes`} gain />
            <Stat label="Abonnés payants" value={formatInt(metrics.mrr.paying)} hint={`${formatInt(metrics.mrr.trialing)} en essai`} />
            <Stat label="Inscriptions" value={formatInt(metrics.signups.last7)} hint={`7 jours · ${formatInt(metrics.signups.last30)} sur 30 jours`} />
            <Stat
              label="Conversion inscrits → abonnés"
              value={metrics.conversion.rate === null ? '—' : formatPercent(metrics.conversion.rate, 1)}
              hint={`${metrics.conversion.paying} sur ${metrics.conversion.onboarded} inscrits`}
            />
            <Stat
              label="Résiliations (30 jours)"
              value={formatInt(metrics.churn.ended30)}
              hint={`${metrics.churn.scheduled} programmée${metrics.churn.scheduled > 1 ? 's' : ''}${metrics.churn.rate === null ? '' : ` · ${formatPercent(metrics.churn.rate, 1)}`}`}
            />
            <Stat label="Actifs aujourd’hui" value={formatInt(metrics.active.today)} hint={`${formatInt(metrics.active.last7)} sur 7 jours · ${formatInt(metrics.active.last30)} sur 30`} />
          </dl>
          <p className="mt-2 text-xs text-muted">
            MRR : abonnements actifs ou en nouvel essai de paiement × prix du plan, l’annuel divisé par 12 ; hors taxes avec une TVA de{' '}
            {formatPercent(adminSettings.vatRate)}. Starter : {metrics.mrr.byPlan.starter.month} mensuel, {metrics.mrr.byPlan.starter.year} annuel · Pro :{' '}
            {metrics.mrr.byPlan.pro.month} mensuel, {metrics.mrr.byPlan.pro.year} annuel · Elite : {metrics.mrr.byPlan.elite.month} mensuel,{' '}
            {metrics.mrr.byPlan.elite.year} annuel. Conversion sur les 30 derniers jours :{' '}
            {metrics.conversion.cohort30.paying} sur {metrics.conversion.cohort30.signups} inscrits.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <p className="text-sm font-semibold">Inscriptions par jour (14 jours)</p>
              <div className="mt-3">
                <DayBars data={metrics.signups.byDay.map((d) => ({ day: d.day, value: d.count }))} label="Inscriptions par jour" />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Utilisateurs actifs par jour</p>
                <form action={recordMetricsAction}>
                  <SubmitButton size="sm" variant="ghost" pendingLabel="Relevé…">
                    Relever la veille
                  </SubmitButton>
                </form>
              </div>
              {daily.length ? (
                <div className="mt-3">
                  <DayBars data={daily.map((d) => ({ day: d.day, value: d.active }))} label="Utilisateurs actifs par jour" />
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  Pas encore de relevé : il se fait chaque nuit (fonction recordDailyMetrics), ou avec le bouton ci-dessus pour la veille.
                </p>
              )}
              <p className="mt-2 text-xs text-muted">Actif = venu dans l’appli ce jour-là, ou a écrit un script. Relevé la nuit suivante.</p>
            </Card>
          </div>
        </Section>

        <Section id="couts" title="Coûts par jour">
          <div className="overflow-x-auto rounded-2xl border border-line" tabIndex={0} role="region" aria-label="Coûts par jour">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Jour</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Appels Nexscope</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Crédits (estimés)</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Nexscope en €</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Générations IA</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">IA (estimé)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {costDays.map(({ day, nexscope: n, ai }) => {
                  const aiUsd = ai ? aiCostUsd(ai, price) : null;
                  return (
                    <tr key={day}>
                      <td className="px-4 py-2.5">{formatShortDate(day)}</td>
                      <td className="num px-4 py-2.5 text-right">{n ? `${formatInt(n.calls)}${n.cacheHits ? ` (+${n.cacheHits} cache)` : ''}` : '—'}</td>
                      <td className="num px-4 py-2.5 text-right">{n ? formatInt(n.credits) : '—'}</td>
                      <td className="num px-4 py-2.5 text-right">{n?.eur != null ? formatEuros(Math.round(n.eur * 100)) : n ? 'prix inconnu' : '—'}</td>
                      <td className="num px-4 py-2.5 text-right">{ai ? `${formatInt(ai.scripts)} + ${formatInt(ai.otherAi)}` : 'pas de relevé'}</td>
                      <td className="num px-4 py-2.5 text-right">{aiUsd === null ? (ai ? 'prix inconnu' : '—') : usd(aiUsd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Card className="mt-4">
            <p className="text-sm font-semibold">Marge mensuelle estimée</p>
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {(
                [
                  ['MRR hors taxes', margin.revenueHtCents],
                  ['Commissions des parrains et formateurs', -margin.commissionsCents],
                  ['Frais Stripe', -margin.stripeFeesCents],
                  ['Nexscope (30 derniers jours)', margin.nexscopeCents === null ? null : -margin.nexscopeCents],
                  ['IA (30 derniers jours)', margin.aiCents === null ? null : -margin.aiCents],
                  ['Coûts fixes', -margin.fixedCents],
                ] as Array<[string, number | null]>
              ).map(([label, cents]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-line py-1.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="num">{cents === null ? 'non chiffré' : formatEuros(cents)}</dd>
                </div>
              ))}
            </dl>
            <p className={cn('num mt-3 text-lg font-semibold', margin.marginCents >= 0 ? 'text-gain' : 'text-rose-ink')}>
              {formatEuros(margin.marginCents)} par mois
              {margin.perPayingCents !== null ? ` · ${formatEuros(margin.perPayingCents)} par abonné payant (${margin.paying})` : ' · aucun abonné payant'}
            </p>
            {margin.missing.length ? <p className="mt-1 text-xs text-warn">Incomplet : il manque {margin.missing.join(', ')}.</p> : null}
            <details className="mt-3 text-xs leading-relaxed text-muted">
              <summary className="cursor-pointer font-semibold text-fg">Hypothèses du calcul</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Crédits Nexscope par appel : recherche {NEXSCOPE_CREDITS.discovery}, vidéos {NEXSCOPE_CREDITS.video}, ventes par période{' '}
                  {NEXSCOPE_CREDITS.detailBatch} par lot de 20 (doc et appels mesurés le 12 novembre 2026). Compteurs de la tâche nocturne
                  seulement : les appels à la demande ne sont pas comptés.
                  {adminSettings.nexscopeEurPer1000Credits === null
                    ? ' Prix du crédit inconnu : NEXSCOPE_EUR_PER_1000_CREDITS.'
                    : ` ${String(adminSettings.nexscopeEurPer1000Credits).replace('.', ',')} € les 1 000 crédits.`}
                </li>
                <li>
                  IA ({price ? price.model : 'modèle inconnu'}) : jetons non enregistrés par appel ; script = {formatInt(TOKENS.script.input)} jetons en
                  entrée et {formatInt(TOKENS.script.output)} en sortie (mesuré avec gpt-6-luna) ; autre appel = {formatInt(TOKENS.other.input)} +{' '}
                  {formatInt(TOKENS.other.output)} (hypothèse).{' '}
                  {price ? `Prix : ${price.input} $ et ${price.output} $ par million de jetons.` : 'Prix inconnu : AI_PRICE_INPUT_PER_MTOK et AI_PRICE_OUTPUT_PER_MTOK.'}{' '}
                  1 $ = {String(adminSettings.usdToEur).replace('.', ',')} € (ADMIN_USD_EUR_RATE).
                </li>
                <li>
                  Frais Stripe : {String(adminSettings.stripeFeePercent).replace('.', ',')} % + {formatEuros(adminSettings.stripeFeeFixedCents)} par
                  paiement (tarif standard des cartes européennes, à vérifier sur ton compte) ; l’annuel est payé une fois, frais ramenés au mois.
                </li>
                <li>Commissions : 30 % hors taxes (ou le taux du formateur) des abonnés venus par un lien de parrainage ou un code formateur.</li>
                <li>Coûts fixes : ADMIN_FIXED_COSTS_EUR_MONTH ({formatEuros(margin.fixedCents)} par mois).</li>
              </ul>
            </details>
          </Card>
        </Section>

        <Section
          id="taches"
          title="Tâches planifiées"
          aside={
            <div className="flex flex-wrap gap-2">
              <form action={runRefreshAction}>
                <SubmitButton size="sm" variant="ink" pendingLabel="Rafraîchissement en cours…">
                  Lancer le rafraîchissement
                </SubmitButton>
              </form>
              <form action={runDiscordAction}>
                <SubmitButton size="sm" variant="outline" pendingLabel="Relance…">
                  Relancer la tâche Discord
                </SubmitButton>
              </form>
            </div>
          }
        >
          {lastRun ? (
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={lastRun.status === 'ok' ? 'gain' : lastRun.status === 'error' ? 'rose' : 'warn'}>
                  {lastRun.status === 'ok' ? 'Réussie' : lastRun.status === 'error' ? 'En erreur' : 'En cours'}
                </Badge>
                <span className="text-sm text-muted">
                  Tâche nocturne {lastRun.trigger === 'manuel' ? 'lancée à la main' : lastRun.trigger === 'seed' ? '(seed)' : 'planifiée'}{' '}
                  {formatRelative(lastRun.started_at)} · {formatInt(products)} produits au catalogue
                </span>
              </div>
              {fallbacks.length ? (
                <Callout tone="rose" className="mt-3" title={`Repli sur « ${String(lastRun.details.provider)} » : la source réelle a échoué`}>
                  <ul className="space-y-1">
                    {fallbacks.map((f) => (
                      <li key={f.provider}>
                        <strong>{f.provider}</strong> : {f.error}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    Les utilisateurs voient toujours les derniers vrais relevés (avec leur date au-delà de 36 heures), jamais les produits fictifs
                    présentés comme réels.
                  </p>
                </Callout>
              ) : null}
              {stats ? (
                <p className="mt-3 text-sm text-muted">
                  Fournisseur : {formatInt(stats.calls)} appel{stats.calls > 1 ? 's' : ''} sur {formatInt(stats.budget)} autorisés
                  {stats.budgetReached ? ' (quota atteint)' : ''} · {formatInt(stats.cacheHits)} depuis le cache · {formatInt(stats.retries)} reprise
                  {stats.retries > 1 ? 's' : ''} · {formatInt(stats.skipped)} produit{stats.skipped > 1 ? 's' : ''} écarté{stats.skipped > 1 ? 's' : ''}
                  {stats.rejectedImageHosts.length
                    ? ` · images refusées (domaine à ajouter dans IMAGE_HOSTS s’il est légitime) : ${stats.rejectedImageHosts.join(', ')}`
                    : ''}
                </p>
              ) : null}
              <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-surface p-3 text-xs leading-relaxed" tabIndex={0} aria-label="Détail de la dernière exécution">
                {JSON.stringify(lastRun.details, null, 2)}
              </pre>
              {refreshRuns.length > 1 ? (
                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted" aria-label="Exécutions précédentes">
                  {refreshRuns.slice(1, 10).map((r) => (
                    <li key={r.id}>
                      {r.status === 'ok' ? (r.details.repli ? '⚠' : '✓') : '✗'} {formatRelative(r.started_at)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : (
            <EmptyState title="Aucune exécution pour l’instant">Lance un rafraîchissement pour remplir le radar.</EmptyState>
          )}
          <Panel className="mt-3 text-sm text-muted">
            Discord (toutes les heures) : récaps privés {discord.digests ? 'actifs' : 'non configurés'} · salons {discord.channels ? 'actifs' : 'non configurés'} ·
            rôle Pro {discord.roles ? 'actif' : 'non configuré'} · classement du lundi {discord.leaderboard ? 'actif' : 'non configuré'}. La relance n’envoie
            jamais deux fois la même chose le même jour.
          </Panel>
        </Section>

        <Section id="demandes" title={`Demandes de partenariat (${applications.filter((a) => a.status === 'nouvelle').length} nouvelles)`}>
          {applications.length === 0 ? (
            <EmptyState title="Aucune demande">Les demandes du formulaire /formateurs arrivent ici et par e-mail.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {applications.map((a) => {
                const existing = profiles.find((p) => p.email.toLowerCase() === a.email.toLowerCase());
                return (
                  <li key={a.id}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {a.name} · {a.training_name}
                          </p>
                          <p className="text-sm text-muted">
                            {a.email} · {a.audience_size || 'audience non précisée'} · {formatRelative(a.created_at)}
                          </p>
                          {a.message ? <p className="mt-2 max-w-prose whitespace-pre-line text-sm">{a.message}</p> : null}
                          <p className="mt-2 text-xs text-muted">
                            {existing
                              ? 'Compte trouvé avec cet e-mail : passe-le en formateur depuis l’onglet Utilisateurs.'
                              : 'Pas encore de compte avec cet e-mail : demande-lui de s’inscrire, puis passe-le en formateur.'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={a.status === 'acceptee' ? 'gain' : a.status === 'refusee' ? 'neutral' : 'rose'}>
                            {a.status === 'acceptee' ? 'Acceptée' : a.status === 'refusee' ? 'Refusée' : 'Nouvelle'}
                          </Badge>
                          {a.status === 'nouvelle'
                            ? (['acceptee', 'refusee'] as const).map((status) => (
                                <form key={status} action={setApplicationStatusAction}>
                                  <input type="hidden" name="demande" value={a.id} />
                                  <input type="hidden" name="statut" value={status} />
                                  <SubmitButton size="sm" variant={status === 'acceptee' ? 'ink' : 'outline'}>
                                    {status === 'acceptee' ? 'Accepter' : 'Refuser'}
                                  </SubmitButton>
                                </form>
                              ))
                            : null}
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {isLocalMode() ? (
          <Section id="boite" title="Boîte de réception locale">
            {emails.length === 0 ? (
              <EmptyState title="Aucun e-mail">Les e-mails envoyés sans clé Resend apparaissent ici.</EmptyState>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {emails.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{e.subject}</span>
                      <span className="text-muted"> · {e.to}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {e.scheduled_at ? `programmé ${new Date(e.scheduled_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` : formatRelative(e.created_at)}
                    </span>
                    <a href={`/admin/emails/${e.id}`} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
                      Ouvrir
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}
      </div>
    </SimpleShell>
  );
}

import type { Metadata } from 'next';
import { BellRing } from 'lucide-react';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState, PageHeader } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo } from '@/lib/db';
import { NICHES } from '@/lib/niches';
import { cheapestPlanWith, getPlan, isUnlimited } from '@/lib/plans';
import { COMMISSION_STEPS, filterAvailability, filterTarget, RATING_STEPS, type RadarFilters } from '@/lib/radar-filters';
import { ALERT_KIND, activeAlertsWithinPlan, alertSummary, type AlertData } from '@/lib/radar/alerts';
import { BADGES } from '@/lib/radar/badges';
import { productMetrics } from '@/lib/radar/metrics';
import { regionFor } from '@/lib/regions';
import { formatRelative, plural } from '@/lib/utils';
import { createAlertAction, deleteAlertAction, toggleAlertAction } from './actions';

export const metadata: Metadata = { title: 'Alertes' };

const ERRORS: Record<string, string> = {
  limite: 'Tu as atteint le nombre d’alertes actives de ton plan. Mets-en une en pause ou supprime-la.',
  criteres: 'Choisis au moins un critère : sans critère, l’alerte se déclencherait pour tous les produits.',
};

export default async function AlertsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/alertes');
  const plan = getPlan(profile.plan);
  const nextAlerts = cheapestPlanWith((p) => p.alerts > plan.alerts);
  if (!plan.alerts) {
    return (
      <div>
        <PageHeader eyebrow="Trouver" title="Alertes"  description="Tu es prévenu dès qu’un nouveau produit remplit ta règle." />
        <PlanGate plan="starter" title="Sois prévenu quand un produit remplit tes critères">
          Niche, commission minimum, ventes sur 7 jours, croissance, prix : chaque nuit, dès qu’un nouveau produit remplit ta règle,
          tu reçois une notification, un e-mail et un message Discord.
        </PlanGate>
      </div>
    );
  }

  const repo = getRepo();
  const [alerts, catalog] = await Promise.all([
    repo.listRecords<AlertData>(profile.id, ALERT_KIND),
    getLiveCatalog(repo, new Date(), regionFor(profile)),
  ]);
  const checked = new Set(activeAlertsWithinPlan(alerts, profile.plan).map((a) => a.id));
  const activeCount = alerts.filter((a) => a.data.active).length;
  const limitLabel = isUnlimited(profile.plan, 'alerts') ? `${activeCount}, sans limite` : `${activeCount} sur ${plan.alerts}`;
  const canCreate = activeCount < plan.alerts;
  const availability = filterAvailability(catalog.products.map(filterTarget));

  // Pré-remplissage depuis une fiche produit : même niche, même sous-catégorie, commission au palier inférieur.
  const source = searchParams.produit ? await repo.getProduct(searchParams.produit) : null;
  const preset: RadarFilters = {};
  if (source) {
    preset.niche = source.niche;
    const sub = productMetrics(source).subcategory;
    if (sub) preset.souscat = sub;
    const step = [...COMMISSION_STEPS].reverse().find((c) => c <= Math.round(source.commission_rate * 100));
    if (step) preset.commission = step;
  }

  return (
    <div>
      <PageHeader eyebrow="Trouver"
        title="Alertes"
        description="Tu es prévenu dès qu’un nouveau produit remplit ta règle."
      />
      {searchParams.ok === 'cree' ? (
        <Callout tone="gain" className="mb-6" title="Alerte créée">
          {Number(searchParams.n) > 0
            ? `${plural(Number(searchParams.n), 'produit la remplit', 'produits la remplissent')} déjà aujourd’hui : tu seras prévenu pour les suivants.`
            : 'Aucun produit ne la remplit aujourd’hui : tu seras prévenu dès qu’il y en a un.'}
        </Callout>
      ) : null}
      {searchParams.ok === 'supprimee' ? <Callout tone="neutral" className="mb-6" title="Alerte supprimée." /> : null}
      {searchParams.erreur && ERRORS[searchParams.erreur] ? <Callout tone="rose" className="mb-6" title={ERRORS[searchParams.erreur]} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="mes-alertes" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="mes-alertes" className="text-lg">
              Mes alertes
            </h2>
            <p className="num text-sm text-muted">Actives : {limitLabel}</p>
          </div>
          {alerts.length ? (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{alert.data.name}</p>
                        <p className="mt-0.5 text-sm text-muted">{alertSummary(alert.data.criteria)}</p>
                        <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                          {alert.data.active ? (
                            checked.has(alert.id) ? (
                              <Badge tone="gain">Active</Badge>
                            ) : (
                              <Badge tone="warn">Hors de la limite du plan</Badge>
                            )
                          ) : (
                            <Badge>En pause</Badge>
                          )}
                          <span>{plural(alert.data.last_count, 'produit', 'produits')} aujourd’hui</span>
                          {alert.data.last_sent ? <span>dernière notification {formatRelative(alert.data.last_sent)}</span> : null}
                          <span>
                            {[alert.data.channels.push && 'push', alert.data.channels.email && 'e-mail', alert.data.channels.discord && 'Discord'].filter(Boolean).join(', ') ||
                              'aucun canal'}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <form action={toggleAlertAction}>
                          <input type="hidden" name="id" value={alert.id} />
                          <input type="hidden" name="actif" value={alert.data.active ? '0' : '1'} />
                          <SubmitButton size="sm" variant="outline" pendingLabel="…">
                            {alert.data.active ? 'Mettre en pause' : 'Réactiver'}
                          </SubmitButton>
                        </form>
                        <form action={deleteAlertAction}>
                          <input type="hidden" name="id" value={alert.id} />
                          <SubmitButton size="sm" variant="danger" pendingLabel="…">
                            Supprimer
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<BellRing className="h-5 w-5" />} title="Aucune alerte pour l’instant">
              Crée ta première règle à côté.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="nouvelle">
          <Card>
            <h2 id="nouvelle" className="flex items-center gap-2 text-lg">
              <BellRing className="h-5 w-5 text-cyan-ink" aria-hidden="true" />
              Nouvelle alerte
            </h2>
            {source ? <p className="mt-1 text-sm text-muted">Pré-remplie d’après « {source.name.slice(0, 60)} ».</p> : null}
            {canCreate ? (
              <form action={createAlertAction} className="mt-4 space-y-3">
                <Field label="Nom (facultatif)" htmlFor="alerte-nom">
                  <Input id="alerte-nom" name="nom" maxLength={60} placeholder="ex. Beauté qui décolle" />
                </Field>
                <Field label="Niche" htmlFor="alerte-niche">
                  <Select id="alerte-niche" name="niche" defaultValue={preset.niche ?? ''}>
                    <option value="">Toutes</option>
                    {NICHES.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {availability.subcategories.length ? (
                  <Field label="Sous-catégorie" htmlFor="alerte-souscat">
                    <Select id="alerte-souscat" name="souscat" defaultValue={preset.souscat ?? ''}>
                      <option value="">Toutes</option>
                      {availability.subcategories.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Commission" htmlFor="alerte-commission">
                    <Select id="alerte-commission" name="commission" defaultValue={preset.commission ?? ''}>
                      <option value="">Toute</option>
                      {COMMISSION_STEPS.map((c) => (
                        <option key={c} value={c}>
                          {c} % et plus
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Par vente, au moins (€)" htmlFor="alerte-comeur">
                    <Input id="alerte-comeur" name="comeur" type="number" min={0} step="0.01" inputMode="decimal" />
                  </Field>
                  {availability.sales7 ? (
                    <Field label="Ventes 7 j, au moins" htmlFor="alerte-v7">
                      <Input id="alerte-v7" name="v7" type="number" min={0} inputMode="numeric" />
                    </Field>
                  ) : null}
                  {availability.growth ? (
                    <Field label="Croissance, au moins (%)" htmlFor="alerte-croissance">
                      <Input id="alerte-croissance" name="croissance" type="number" min={-100} max={500} inputMode="numeric" />
                    </Field>
                  ) : null}
                  <Field label="Prix minimum (€)" htmlFor="alerte-prixmin">
                    <Input id="alerte-prixmin" name="prixmin" type="number" min={0} step="0.01" inputMode="decimal" />
                  </Field>
                  <Field label="Prix maximum (€)" htmlFor="alerte-prixmax">
                    <Input id="alerte-prixmax" name="prixmax" type="number" min={0} step="0.01" inputMode="decimal" />
                  </Field>
                  {availability.affiliates ? (
                    <Field label="Affiliés, au plus" htmlFor="alerte-affmax">
                      <Input id="alerte-affmax" name="affmax" type="number" min={0} inputMode="numeric" />
                    </Field>
                  ) : null}
                  {availability.rating ? (
                    <Field label="Note" htmlFor="alerte-note">
                      <Select id="alerte-note" name="note" defaultValue="">
                        <option value="">Toutes</option>
                        {RATING_STEPS.map((n) => (
                          <option key={n} value={n}>
                            {String(n).replace('.', ',')} et plus
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                </div>
                <Field label="Signal" htmlFor="alerte-badge">
                  <Select id="alerte-badge" name="badge" defaultValue="">
                    <option value="">Peu importe</option>
                    {(Object.keys(BADGES) as Array<keyof typeof BADGES>).map((b) => (
                      <option key={b} value={b}>
                        {BADGES[b].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {availability.newProducts ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="nouveau" value="1" className="h-4 w-4 accent-[color:var(--cyan-hex)]" />
                    Seulement les produits lancés depuis moins de 30 jours
                  </label>
                ) : null}
                <fieldset className="pt-1">
                  <legend className="text-sm font-semibold">Me prévenir par</legend>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    {[
                      ['push', 'Notification'],
                      ['email', 'E-mail'],
                      ['discord', 'Discord'],
                    ].map(([name, label]) => (
                      <label key={name} className="flex items-center gap-2">
                        <input type="checkbox" name={name} value="1" defaultChecked className="h-4 w-4 accent-[color:var(--cyan-hex)]" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    Discord seulement si ton compte est lié (
                    <Link href="/app/compte" className="underline">
                      compte
                    </Link>
                    ).
                  </p>
                </fieldset>
                <SubmitButton className="w-full" pendingLabel="Création…">
                  Créer l’alerte
                </SubmitButton>
              </form>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-muted">
                <p>
                  {isUnlimited(profile.plan, 'alerts')
                    ? `Tu as ${plural(activeCount, 'alerte active', 'alertes actives')} : c’est la limite de sécurité.`
                    : `Tu as ${plural(activeCount, 'alerte active', 'alertes actives')} : c’est la limite du plan ${plan.name}.`}
                </p>
                <Button variant="outline" size="sm" disabled>
                  Créer l’alerte
                </Button>
                {isUnlimited(profile.plan, 'alerts') ? (
                  <p>Mets-en une en pause pour en créer une autre.</p>
                ) : (
                  <p>
                    Mets-en une en pause, ou{' '}
                    <Link href="/app/passer-pro" className="font-semibold text-rose-ink hover:underline">
                      passe à {nextAlerts.name}
                    </Link>{' '}
                    pour {isUnlimited(nextAlerts.id, 'alerts') ? 'des alertes sans limite' : `${nextAlerts.alerts} alertes`}.
                  </p>
                )}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

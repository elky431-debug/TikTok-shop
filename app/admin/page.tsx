import type { Metadata } from 'next';
import { SimpleShell } from '@/components/app/simple-shell';
import { Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState } from '@/components/ui/surface';
import { requireAdmin } from '@/lib/auth/session';
import { billingMode } from '@/lib/billing';
import { getRepo } from '@/lib/db';
import { env, isAiConfigured, isLocalMode, isResendConfigured } from '@/lib/env';
import { getPlan, isPaidPlan } from '@/lib/plans';
import { cn, formatInt, formatRelative } from '@/lib/utils';
import { makeCoachAction, runRefreshAction, setApplicationStatusAction } from './actions';

export const metadata: Metadata = { title: 'Administration' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=formateur': { tone: 'gain', text: 'Compte passé en formateur.' },
  'ok=rafraichissement': { tone: 'gain', text: 'Rafraîchissement terminé.' },
  'erreur=formation': { tone: 'rose', text: 'Indique le nom de la formation.' },
  'erreur=code': { tone: 'rose', text: 'Le code promo doit faire 3 à 24 caractères (lettres, chiffres, tirets).' },
  'erreur=code-pris': { tone: 'rose', text: 'Ce code est déjà utilisé (formateur ou parrainage).' },
  'erreur=rafraichissement': { tone: 'rose', text: 'Le rafraîchissement a échoué : voir le détail dans la dernière tâche.' },
};

function Section({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-titre`} className="text-xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  await requireAdmin();
  const repo = getRepo();
  const [profiles, coaches, applications, runs, products] = await Promise.all([
    repo.listProfiles({ limit: 200 }),
    repo.listCoaches(),
    repo.listCoachApplications(),
    repo.listCronRuns(5),
    repo.countProducts(),
  ]);
  const emails = isLocalMode() && repo.listLocalEmails ? await repo.listLocalEmails(10) : [];
  const coachByUser = new Map(coaches.map((c) => [c.user_id, c]));
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));
  const studentsByCoach = new Map<string, number>();
  for (const p of profiles) if (p.coach_id) studentsByCoach.set(p.coach_id, (studentsByCoach.get(p.coach_id) ?? 0) + 1);
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`] ?? (k === 'erreur' && v ? { tone: 'rose' as const, text: v } : undefined))
    .find(Boolean);
  const lastRun = runs[0];

  const services = [
    { name: 'Base de données', value: isLocalMode() ? 'Fichier local' : 'Supabase', ok: !isLocalMode() },
    { name: 'Données produits', value: env.dataProvider === 'mock' ? 'Fictives (mock)' : env.dataProvider, ok: env.dataProvider !== 'mock' },
    { name: 'Scripts', value: isAiConfigured() ? `Claude (${env.anthropicModel})` : 'Simulés', ok: isAiConfigured() },
    { name: 'Paiement', value: billingMode() === 'stripe' ? 'Stripe' : billingMode() === 'simulation' ? 'Simulé' : 'Désactivé', ok: billingMode() === 'stripe' },
    { name: 'E-mails', value: isResendConfigured() ? 'Resend' : 'Boîte locale', ok: isResendConfigured() },
  ];

  return (
    <SimpleShell title="Administration">
      <h1 className="text-2xl sm:text-3xl">Administration</h1>
      {message ? <Callout tone={message.tone} className="mt-4" title={message.text} /> : null}

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-5">
        {[
          ['Comptes', profiles.length],
          ['Onboardés', profiles.filter((p) => p.onboarded_at).length],
          ['Payants ou en essai', profiles.filter((p) => isPaidPlan(p.plan)).length],
          ['Formateurs', coaches.length],
          ['Produits au catalogue', products],
        ].map(([label, value]) => (
          <div key={label} className="bg-raised p-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="num mt-1 text-2xl font-semibold">{formatInt(Number(value))}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-3 flex flex-wrap gap-2">
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
          id="taches"
          title="Tâche nocturne"
          aside={
            <form action={runRefreshAction}>
              <SubmitButton size="sm" variant="ink" pendingLabel="Rafraîchissement en cours…">
                Lancer le rafraîchissement
              </SubmitButton>
            </form>
          }
        >
          {lastRun ? (
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={lastRun.status === 'ok' ? 'gain' : lastRun.status === 'error' ? 'rose' : 'warn'}>
                  {lastRun.status === 'ok' ? 'Réussie' : lastRun.status === 'error' ? 'En erreur' : 'En cours'}
                </Badge>
                <span className="text-sm text-muted">
                  {lastRun.trigger === 'manuel' ? 'Lancée à la main' : lastRun.trigger === 'seed' ? 'Seed' : 'Planifiée'}{' '}
                  {formatRelative(lastRun.started_at)}
                </span>
              </div>
              <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-surface p-3 text-xs leading-relaxed" tabIndex={0} aria-label="Détail de la dernière exécution">
                {JSON.stringify(lastRun.details, null, 2)}
              </pre>
              {runs.length > 1 ? (
                <p className="mt-3 text-sm text-muted">
                  Précédentes :{' '}
                  {runs
                    .slice(1)
                    .map((r) => `${r.status === 'ok' ? '✓' : '✗'} ${formatRelative(r.started_at)}`)
                    .join(' · ')}
                </p>
              ) : null}
            </Card>
          ) : (
            <EmptyState title="Aucune exécution pour l’instant">Lance un rafraîchissement pour remplir le radar.</EmptyState>
          )}
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
                              ? 'Compte trouvé avec cet e-mail : passe-le en formateur dans la liste des comptes.'
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

        <Section id="formateurs" title="Formateurs">
          {coaches.length === 0 ? (
            <EmptyState title="Aucun formateur">Passe un compte en formateur depuis la liste ci-dessous.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line" tabIndex={0} role="region" aria-label="Tableau des formateurs">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-surface text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Formation</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Compte</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Élèves</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {coaches.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-semibold">{c.training_name}</td>
                      <td className="num px-4 py-3">{c.promo_code}</td>
                      <td className="px-4 py-3 text-muted">{emailById.get(c.user_id) ?? c.user_id}</td>
                      <td className="num px-4 py-3 text-right">{studentsByCoach.get(c.id) ?? 0}</td>
                      <td className="num px-4 py-3 text-right">{Math.round(c.commission_rate * 100)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section id="utilisateurs" title={`Comptes (${profiles.length} derniers)`}>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {profiles.map((p) => {
              const coach = coachByUser.get(p.id);
              return (
                <li key={p.id} className="px-4 py-3">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {p.email}
                        {p.first_name ? <span className="font-normal text-muted"> · {p.first_name}</span> : null}
                      </span>
                      <Badge tone={isPaidPlan(p.plan) ? 'ink' : 'neutral'}>{getPlan(p.plan).name}</Badge>
                      {coach ? <Badge tone="cyan">Formateur {coach.promo_code}</Badge> : null}
                      {!p.onboarded_at ? <Badge tone="warn">Onboarding</Badge> : null}
                      <span className="text-xs text-muted">{formatRelative(p.created_at)}</span>
                    </summary>
                    {!coach ? (
                      <form action={makeCoachAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input type="hidden" name="utilisateur" value={p.id} />
                        <Input name="formation" placeholder="Nom de la formation" aria-label="Nom de la formation" className="sm:max-w-xs" required />
                        <Input
                          name="code"
                          placeholder="CODE30"
                          aria-label="Code promo"
                          defaultValue={(p.first_name ?? p.email.split('@')[0]).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) + '30'}
                          className="uppercase sm:max-w-[10rem]"
                          required
                        />
                        <SubmitButton size="sm" variant="ink" pendingLabel="Activation…">
                          Passer en formateur
                        </SubmitButton>
                      </form>
                    ) : null}
                  </details>
                </li>
              );
            })}
          </ul>
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
                    <span className={cn('text-xs text-muted')}>
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

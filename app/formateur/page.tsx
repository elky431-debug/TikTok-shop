import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { SignupsChart } from '@/components/app/signups-chart';
import { SimpleShell } from '@/components/app/simple-shell';
import { CopyButton } from '@/components/ui/copy-button';
import { Badge, Card, EmptyState, Panel } from '@/components/ui/surface';
import { requireCoach } from '@/lib/auth/session';
import { getCoachDashboard } from '@/lib/coach';
import { env } from '@/lib/env';
import { COACH_TRIAL_DAYS, getPlan } from '@/lib/plans';
import { referralLink } from '@/lib/referral';
import { cn, formatEuros, formatInt, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Espace formateur' };
export const dynamic = 'force-dynamic';

export default async function FormateurPage() {
  const { coach } = await requireCoach();
  const data = await getCoachDashboard(coach);
  const link = referralLink(env.siteUrl, coach.promo_code);
  const rate = Math.round(coach.commission_rate * 100);
  const message = `Pour choisir tes produits TikTok Shop chaque matin et écrire tes scripts, utilise ${link} : avec mon code ${coach.promo_code}, tu as ${Math.round(COACH_TRIAL_DAYS / 30)} mois de Pro offerts.`;

  return (
    <SimpleShell title="Espace formateur">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted">{coach.training_name}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl">Tes élèves</h1>
        <p className="mt-1.5 max-w-prose text-muted">
          Tes élèves ont {Math.round(COACH_TRIAL_DAYS / 30)} mois de Pro offerts avec ton code. Tu touches {rate} % de ce qu’ils paient
          ensuite, chaque mois.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="border-fg/15">
          <p className="text-sm font-semibold">Ton code et ton lien</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="num rounded-xl bg-surface px-3.5 py-2 text-xl font-bold tracking-wide">{coach.promo_code}</span>
            <CopyButton text={coach.promo_code} label="Copier le code" copiedLabel="Code copié" />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3.5 py-2.5 text-sm">{link}</code>
            <CopyButton text={link} label="Copier le lien" copiedLabel="Lien copié" />
          </div>
          <CopyButton text={message} label="Copier un message pour tes élèves" copiedLabel="Message copié" className="mt-3" />
        </Card>
        <Card>
          <p className="text-sm font-semibold">Inscriptions sur 8 semaines</p>
          <div className="mt-3">
            <SignupsChart data={data.signupsByWeek} />
          </div>
        </Card>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Élèves inscrits', value: formatInt(data.total) },
          { label: 'Actifs cette semaine', value: formatInt(data.activeThisWeek) },
          { label: 'En Pro ou Pro+', value: formatInt(data.plans.pro + data.plans.proplus) },
          { label: 'Scripts écrits au total', value: formatInt(data.scriptsTotal) },
          { label: 'Commission du mois', value: formatEuros(data.commissionThisMonthCents), gain: true },
          { label: 'À verser', value: formatEuros(data.commissionDueCents), gain: true },
        ].map((item) => (
          <div key={item.label} className="bg-raised p-4">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className={cn('num mt-1 text-2xl font-semibold', item.gain && 'text-gain')}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-muted">
        Plans : {data.plans.free} en Gratuit, {data.plans.pro} en Pro, {data.plans.proplus} en Pro+ · {data.eligible} élève
        {data.eligible > 1 ? 's' : ''} affilié{data.eligible > 1 ? 's' : ''} (1 500 abonnés et plus), les autres en mode préparation.
      </p>

      <section className="mt-8" aria-labelledby="eleves">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="eleves" className="text-xl">
            Progression des élèves
          </h2>
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Données agrégées. L’e-mail n’apparaît que si l’élève l’a accepté.
          </p>
        </div>

        {data.students.length === 0 ? (
          <EmptyState title="Aucun élève pour l’instant">
            Partage ton lien ou ton code {coach.promo_code} à tes élèves : ils apparaîtront ici dès leur inscription.
          </EmptyState>
        ) : (
          <>
            {/* Mobile : cartes */}
            <ul className="space-y-2 md:hidden">
              {data.students.map((s) => (
                <li key={s.student_id}>
                  <Panel className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{s.first_name ?? 'Sans prénom'}</p>
                      <Badge tone={s.plan === 'free' ? 'neutral' : 'ink'}>{getPlan(s.plan).name}</Badge>
                    </div>
                    <p className="num mt-1 text-sm text-muted">
                      {s.scripts_generated} scripts · {s.products_followed} produits suivis · vu {formatRelative(s.last_seen_at)}
                    </p>
                    {s.email ? <p className="mt-1 truncate text-sm">{s.email}</p> : null}
                  </Panel>
                </li>
              ))}
            </ul>
            {/* Desktop : tableau */}
            <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Élève</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Scripts</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Produits suivis</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Dernière connexion</th>
                    <th scope="col" className="px-4 py-3 font-semibold">E-mail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.students.map((s) => (
                    <tr key={s.student_id}>
                      <td className="px-4 py-3 font-semibold">{s.first_name ?? 'Sans prénom'}</td>
                      <td className="px-4 py-3">
                        <Badge tone={s.plan === 'free' ? 'neutral' : 'ink'}>{getPlan(s.plan).name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">{s.eligibility === 'affilie' ? 'Affilié' : 'Préparation'}</td>
                      <td className="num px-4 py-3 text-right">{formatInt(s.scripts_generated)}</td>
                      <td className="num px-4 py-3 text-right">{formatInt(s.products_followed)}</td>
                      <td className="px-4 py-3 text-muted">{formatRelative(s.last_seen_at)}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-muted">{s.email ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </SimpleShell>
  );
}

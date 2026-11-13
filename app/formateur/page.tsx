import type { Metadata } from 'next';
import { Lock, Megaphone, ShieldCheck } from 'lucide-react';
import { SignupsChart } from '@/components/app/signups-chart';
import { SimpleShell } from '@/components/app/simple-shell';
import { CopyButton } from '@/components/ui/copy-button';
import { Input, Label, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState, Panel, PageHeader } from '@/components/ui/surface';
import { requireCoach } from '@/lib/auth/session';
import { ANNOUNCES_PER_DAY, getCoachDashboard, listAnnouncements } from '@/lib/coach';
import type { ReferralStatus } from '@/lib/db/types';
import { env } from '@/lib/env';
import { COACH_FIRST_MONTH_DISCOUNT, getPlan, isPaidPlan } from '@/lib/plans';
import { coachLandingLink, MAX_EXTRA_CODES, monthName, PAYOUT_THRESHOLD_CENTS, referralLink, shareTexts } from '@/lib/referral';
import { cn, formatEuros, formatInt, formatRelative } from '@/lib/utils';
import { addCodeAction, announceAction, toggleCodeAction } from './actions';

export const metadata: Metadata = { title: 'Espace formateur' };
export const dynamic = 'force-dynamic';

const STATUS: Record<ReferralStatus, { label: string; tone: 'neutral' | 'cyan' | 'gain' | 'warn' }> = {
  inscrit: { label: 'Inscrit', tone: 'neutral' },
  essai: { label: 'En essai', tone: 'cyan' },
  abonne: { label: 'Abonné', tone: 'gain' },
  resilie: { label: 'Résilié', tone: 'warn' },
};

function message(searchParams: Record<string, string | undefined>): { tone: 'gain' | 'rose'; text: string } | null {
  if (searchParams.ok === 'code') return { tone: 'gain', text: `Code ${searchParams.code ?? ''} créé : il marche tout de suite.` };
  if (searchParams.ok === 'code-pause') return { tone: 'gain', text: 'Code mis en pause. Les élèves déjà inscrits restent rattachés.' };
  if (searchParams.ok === 'code-actif') return { tone: 'gain', text: 'Code réactivé.' };
  if (searchParams.ok === 'annonce') return { tone: 'gain', text: `Annonce publiée à ${searchParams.n ?? 'tes'} élève(s).` };
  const errors: Record<string, string> = {
    'code-format': 'Le code doit faire 3 à 24 caractères : lettres, chiffres, tirets.',
    'code-pris': 'Ce code est déjà utilisé (par toi, un autre formateur ou un parrain). Choisis-en un autre.',
    'code-limite': `Tu as déjà ${MAX_EXTRA_CODES} codes supplémentaires : mets-en un en pause ou écris-nous.`,
    'annonce-vide': 'Écris un titre et un message (3 caractères au moins).',
    'annonce-limite': `Tu as déjà publié ${ANNOUNCES_PER_DAY} annonces aujourd’hui. Réessaie demain.`,
    'annonce-aucun': 'Tu n’as pas encore d’élève : l’annonce partira dès qu’ils seront inscrits.',
  };
  const error = searchParams.erreur ? errors[searchParams.erreur] : undefined;
  return error ? { tone: 'rose', text: error } : null;
}

function Stat({ label, value, gain }: { label: string; value: string; gain?: boolean }) {
  return (
    <div className="bg-raised p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('num mt-1 text-2xl font-semibold', gain && 'text-gain')}>{value}</dd>
    </div>
  );
}

export default async function FormateurPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { coach } = await requireCoach();
  const [data, announcements] = await Promise.all([getCoachDashboard(coach), listAnnouncements(coach)]);
  const percent = Math.round(COACH_FIRST_MONTH_DISCOUNT * 100);
  const rate = Math.round(coach.commission_rate * 100);
  const landing = coachLandingLink(env.siteUrl, coach.promo_code);
  const [studentsMessage] = shareTexts({ link: landing, code: coach.promo_code, coach: true });
  const consentPage = `${env.siteUrl}/app/consentement-formateur`;
  const notice = message(searchParams);
  const { earnings } = data;

  return (
    <SimpleShell title="Espace formateur">
      <PageHeader
        eyebrow={<>Formateur · {coach.training_name}</>}
        title="Tes élèves"
        description={`Avec tes codes, tes élèves ont −${percent} % sur leur premier mois. Tu touches ${rate} % de ce qu’ils paient, chaque mois, tant qu’ils restent abonnés.`}
      />
      {notice ? <Callout tone={notice.tone} className="mb-6" title={notice.text} /> : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        <Stat label="Élèves inscrits" value={formatInt(data.total)} />
        <Stat label="Actifs cette semaine" value={formatInt(data.activeThisWeek)} />
        <Stat label="Abonnés (payants)" value={formatInt(data.subscribed)} />
        {data.trial ? <Stat label="En essai (ancienne offre)" value={formatInt(data.trial)} /> : null}
        <Stat label="Vidéos postées" value={formatInt(data.videosPosted)} />
        <Stat label="Scripts écrits" value={formatInt(data.scriptsTotal)} />
        <Stat label="Commission du mois" value={formatEuros(earnings.thisMonthCents)} gain />
        <Stat label="Solde à verser" value={formatEuros(earnings.balanceCents)} gain />
      </dl>
      <p className="mt-2 text-sm text-muted">
        Plans : {data.plans.starter} en Starter, {data.plans.pro} en Pro, {data.plans.elite} en Elite, {data.plans.aucun} sans abonnement ·{' '}
        {data.canceled} résiliation
        {data.canceled > 1 ? 's' : ''} · {data.eligible} élève{data.eligible > 1 ? 's' : ''} affilié{data.eligible > 1 ? 's' : ''} (1 500
        abonnés et plus), les autres en préparation · {formatInt(data.productsFollowed)} produits suivis au total. Vidéos postées : celles que
        tes élèves marquent comme postées dans l’appli.
      </p>

      <div className="mt-10 space-y-12">
        <section id="codes" aria-labelledby="codes-titre" className="scroll-mt-20">
          <h2 id="codes-titre" className="text-xl">
            Tes codes et tes liens
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Un code par promo ou par formation, pour savoir d’où viennent tes élèves. Quel que soit le code, l’élève t’est rattaché, avec
            −{percent} % sur son premier mois.
          </p>
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {data.byCode.map((c) => {
              const link = coachLandingLink(env.siteUrl, c.code);
              return (
                <li key={c.code}>
                  <Card className={cn('h-full', !c.active && 'opacity-70')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num rounded-xl bg-surface px-3 py-1.5 text-lg font-bold tracking-wide">{c.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.label}</span>
                      {c.main ? <Badge tone="cyan">Principal</Badge> : !c.active ? <Badge tone="warn">En pause</Badge> : null}
                    </div>
                    <p className="num mt-2 text-sm text-muted">
                      {c.students} élève{c.students > 1 ? 's' : ''} · {c.subscribed} abonné{c.subscribed > 1 ? 's' : ''}
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3 py-2 text-sm">{link}</code>
                      <CopyButton text={link} label="Copier la page" copiedLabel="Page copiée" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CopyButton text={c.code} label="Copier le code" copiedLabel="Code copié" />
                      <CopyButton text={referralLink(env.siteUrl, c.code)} label="Copier le lien direct" copiedLabel="Lien copié" />
                      {!c.main && c.id ? (
                        <form action={toggleCodeAction} className="ml-auto">
                          <input type="hidden" name="fiche" value={c.id} />
                          <input type="hidden" name="actif" value={c.active ? '0' : '1'} />
                          <SubmitButton size="sm" variant="ghost">
                            {c.active ? 'Mettre en pause' : 'Réactiver'}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <Card className="mt-3">
            <form action={addCodeAction} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
              <div>
                <Label htmlFor="code">Nouveau code</Label>
                <Input id="code" name="code" placeholder="PROMOJANVIER" className="uppercase" maxLength={24} required />
              </div>
              <div>
                <Label htmlFor="libelle">Pour quelle promo ?</Label>
                <Input id="libelle" name="libelle" placeholder="Promo de janvier" maxLength={60} />
              </div>
              <SubmitButton pendingLabel="Création…">Créer le code</SubmitButton>
            </form>
          </Card>
          <Panel className="mt-3">
            <p className="text-sm font-semibold">Message prêt pour tes élèves</p>
            <p className="mt-1 text-sm text-muted">{studentsMessage.text}</p>
            <CopyButton text={studentsMessage.text} label="Copier le message" copiedLabel="Message copié" className="mt-3" />
          </Panel>
        </section>

        <section aria-labelledby="inscriptions-titre">
          <h2 id="inscriptions-titre" className="text-xl">
            Inscriptions sur 8 semaines
          </h2>
          <Card className="mt-3">
            <SignupsChart data={data.signupsByWeek} />
          </Card>
        </section>

        <section id="annonces" aria-labelledby="annonces-titre" className="scroll-mt-20">
          <h2 id="annonces-titre" className="text-xl">
            Annonces à tes élèves
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Ton message arrive dans leurs notifications, dans l’appli. {ANNOUNCES_PER_DAY} annonces par jour au plus.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1fr]">
            <Card>
              <form action={announceAction} className="space-y-3">
                <div>
                  <Label htmlFor="titre">Titre</Label>
                  <Input id="titre" name="titre" maxLength={80} placeholder="Live de jeudi" required />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" name="message" maxLength={1000} placeholder="On analyse vos premières vidéos jeudi à 19 h." required />
                </div>
                <SubmitButton pendingLabel="Publication…">
                  <Megaphone className="h-4 w-4" aria-hidden="true" />
                  Publier l’annonce
                </SubmitButton>
              </form>
            </Card>
            {announcements.length === 0 ? (
              <EmptyState title="Aucune annonce publiée">Tes annonces apparaîtront ici, avec le nombre d’élèves qui les ont reçues.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {announcements.map((a) => (
                  <li key={a.id}>
                    <Panel className="p-3.5">
                      <p className="font-semibold">{a.data.title}</p>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{a.data.body}</p>
                      <p className="num mt-1 text-xs text-muted">
                        {formatRelative(a.created_at)} · {a.data.recipients} élève{a.data.recipients > 1 ? 's' : ''}
                      </p>
                    </Panel>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section id="eleves" aria-labelledby="eleves-titre" className="scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="eleves-titre" className="text-xl">
              Progression détaillée
            </h2>
            <p className="inline-flex items-center gap-1.5 text-sm text-muted">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {data.consented.length} élève{data.consented.length > 1 ? 's' : ''} sur {data.total} l’ont accepté
            </p>
          </div>
          <Panel className="mt-3 text-sm text-muted">
            <p className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Tu vois le détail d’un élève (prénom, plan, progression) seulement s’il l’a accepté, et il peut le retirer quand il veut.
                Les autres comptent dans les chiffres ci-dessus, sans rien d’individuel. Ils donnent leur accord ici :{' '}
                <span className="font-semibold text-fg">{consentPage}</span>
              </span>
            </p>
            <CopyButton text={consentPage} label="Copier la page de consentement" copiedLabel="Page copiée" className="mt-3" />
          </Panel>

          {data.consented.length === 0 ? (
            <EmptyState title="Aucun détail partagé pour l’instant" className="mt-3">
              Quand un élève accepte de te montrer sa progression, il apparaît ici. Son e-mail n’apparaît que s’il l’a aussi accepté.
            </EmptyState>
          ) : (
            <>
              <ul className="mt-3 space-y-2 md:hidden">
                {data.consented.map((s) => (
                  <li key={s.student_id}>
                    <Panel className="p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{s.first_name ?? 'Sans prénom'}</p>
                        <Badge tone={isPaidPlan(s.plan) ? 'ink' : 'neutral'}>{getPlan(s.plan).name}</Badge>
                      </div>
                      <p className="num mt-1 text-sm text-muted">
                        {s.videos_posted} vidéos postées · {s.scripts_generated} scripts · {s.products_followed} produits suivis · vu{' '}
                        {formatRelative(s.last_seen_at)} · code {s.code}
                      </p>
                      {s.email ? <p className="mt-1 truncate text-sm">{s.email}</p> : null}
                    </Panel>
                  </li>
                ))}
              </ul>
              <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-line md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Élève</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Vidéos postées</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Scripts</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Dernière visite</th>
                      <th scope="col" className="px-4 py-3 font-semibold">E-mail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.consented.map((s) => (
                      <tr key={s.student_id}>
                        <td className="px-4 py-3 font-semibold">{s.first_name ?? 'Sans prénom'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={isPaidPlan(s.plan) ? 'ink' : 'neutral'}>{getPlan(s.plan).name}</Badge>
                        </td>
                        <td className="px-4 py-3">{s.status ? <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge> : '—'}</td>
                        <td className="num px-4 py-3 text-right">{formatInt(s.videos_posted)}</td>
                        <td className="num px-4 py-3 text-right">{formatInt(s.scripts_generated)}</td>
                        <td className="num px-4 py-3">{s.code}</td>
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

        <section id="commissions" aria-labelledby="commissions-titre" className="scroll-mt-20">
          <h2 id="commissions-titre" className="text-xl">
            Commissions et versements
          </h2>
          <Callout
            tone={earnings.next.eligible ? 'gain' : 'neutral'}
            className="mt-3"
            title={
              earnings.next.eligible
                ? `Prochain versement : ${formatEuros(earnings.balanceCents)}, début ${monthName(earnings.next.date)}`
                : `Versement dès ${formatEuros(PAYOUT_THRESHOLD_CENTS)} de solde : il manque ${formatEuros(earnings.next.missingCents)}`
            }
          >
            Versements par virement, une fois par mois, dès {formatEuros(PAYOUT_THRESHOLD_CENTS)} cumulés. Une commission remboursée au
            filleul est retirée du solde (au prorata), même après un versement.
          </Callout>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            <Stat label="Gagné au total" value={formatEuros(earnings.earnedCents)} />
            <Stat label="Déjà versé" value={formatEuros(earnings.paidCents)} />
            <Stat label="Solde" value={formatEuros(earnings.balanceCents)} gain />
            <Stat label="Annulé (remboursements)" value={formatEuros(earnings.canceledCents)} />
          </dl>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Commissions</h3>
              {earnings.commissions.length === 0 ? (
                <EmptyState title="Aucune commission">Elles apparaissent ici à chaque paiement d’un de tes élèves.</EmptyState>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {earnings.commissions.slice(0, 24).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="num w-16 text-muted">{c.month}</span>
                      <span className="min-w-0 flex-1 text-muted">
                        {c.status === 'annulee' ? 'Annulée (remboursement)' : c.canceled_cents > 0 ? `Dont ${formatEuros(c.canceled_cents)} annulés` : 'Paiement d’un élève'}
                      </span>
                      <span className="num font-semibold text-gain">{formatEuros(c.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Versements</h3>
              {earnings.payouts.length === 0 ? (
                <EmptyState title="Aucun versement">Chaque virement apparaît ici avec sa date et sa référence.</EmptyState>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {earnings.payouts.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="num w-24 text-muted">{p.data.paid_on}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{p.data.reference ?? 'Virement'}</span>
                      <span className="num font-semibold">{formatEuros(p.data.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </SimpleShell>
  );
}

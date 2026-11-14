import type { Metadata } from 'next';
import { Download, Gift } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { Badge, Callout, Card, EmptyState, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import type { ReferralStatus } from '@/lib/db/types';
import { env } from '@/lib/env';
import { SHARE_FORMATS, type ShareFormat } from '@/lib/og';
import { getPlan, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { getEarnings, monthName, PAYOUT_THRESHOLD_CENTS, referralLink, shareTexts } from '@/lib/referral';
import { cn, formatEuros, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Parrainage' };
export const dynamic = 'force-dynamic';

const STATUS: Record<ReferralStatus, { label: string; tone: 'neutral' | 'cyan' | 'gain' | 'warn' }> = {
  inscrit: { label: 'Inscrit', tone: 'neutral' },
  essai: { label: 'En essai', tone: 'cyan' },
  abonne: { label: 'Abonné', tone: 'gain' },
  resilie: { label: 'Résilié', tone: 'warn' },
};

const VISUALS: Array<{ format: ShareFormat; label: string; use: string }> = [
  { format: 'carre', label: 'Carré', use: 'post Instagram ou TikTok' },
  { format: 'story', label: 'Story', use: 'story ou statut' },
  { format: 'lien', label: 'Bannière', use: 'Discord, X, groupe Facebook' },
];

function Stat({ label, value, gain }: { label: string; value: string; gain?: boolean }) {
  return (
    <div className="bg-raised p-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('num mt-1 text-xl font-semibold', gain && 'text-gain')}>{value}</dd>
    </div>
  );
}

export default async function ParrainagePage() {
  const { profile } = await requireOnboardedViewer('/app/parrainage');
  const repo = getRepo();
  const [referrals, earnings] = await Promise.all([repo.listReferralsByReferrer(profile.id), getEarnings(profile.id, repo)]);
  const link = referralLink(env.siteUrl, profile.referral_code);
  const subscribed = referrals.filter((r) => r.status === 'abonne' || r.status === 'essai').length;
  const rate = Math.round(REFERRAL_COMMISSION_RATE * 100);
  const texts = shareTexts({ link, code: profile.referral_code });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Compte"
        title="Parrainage"
        description={`Invite d’autres créateurs : tu touches ${rate} % de ce qu’ils paient (hors taxes), chaque mois, tant qu’ils restent abonnés.`}
      />

      <Card className="border-fg/15 sm:p-6">
        <p className="text-sm font-semibold">Ton lien personnel</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3.5 py-2.5 text-[0.95rem]">{link}</code>
          <CopyButton text={link} label="Copier mon lien" copiedLabel="Lien copié" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          Ton code : <span className="num font-semibold text-fg">{profile.referral_code}</span>
          <CopyButton text={profile.referral_code} label="Copier mon code" copiedLabel="Code copié" className="ml-auto" />
        </div>
      </Card>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat label="Filleuls" value={String(referrals.length)} />
        <Stat label="Abonnés ou en essai" value={String(subscribed)} />
        <Stat label="Gains ce mois-ci" value={formatEuros(earnings.thisMonthCents)} gain />
        <Stat label="Solde à verser" value={formatEuros(earnings.balanceCents)} gain />
      </dl>

      <Callout
        tone={earnings.next.eligible ? 'gain' : 'neutral'}
        className="mt-3"
        title={
          earnings.next.eligible
            ? `Prochain versement : ${formatEuros(earnings.balanceCents)}, début ${monthName(earnings.next.date)}`
            : earnings.earnedCents > 0
              ? `Prochain versement dès ${formatEuros(PAYOUT_THRESHOLD_CENTS)} de solde (il manque ${formatEuros(earnings.next.missingCents)})`
              : `Les versements commencent dès ${formatEuros(PAYOUT_THRESHOLD_CENTS)} de solde`
        }
      >
        Virement une fois par mois. Déjà versé : {formatEuros(earnings.paidCents)}.
        {earnings.canceledCents > 0 ? ` ${formatEuros(earnings.canceledCents)} de commissions annulées : des paiements de tes filleuls ont été remboursés.` : ''}
      </Callout>

      <section className="mt-8" aria-labelledby="filleuls">
        <h2 id="filleuls" className="mb-3 text-lg">
          Tes filleuls
        </h2>
        {referrals.length === 0 ? (
          <EmptyState icon={<Gift className="h-5 w-5" />} title="Pas encore de filleul">
            Partage ton lien ci-dessus.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {referrals.map((r, i) => {
              const earned = earnings.commissions.filter((c) => c.referral_id === r.id).reduce((s, c) => s + c.amount_cents, 0);
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.referred_first_name ?? `Filleul n°${referrals.length - i}`}</p>
                    <p className="text-sm text-muted">
                      Plan {getPlan(r.referred_plan).name} · inscrit {formatRelative(r.created_at)}
                    </p>
                  </div>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  <span className="num w-20 text-right font-semibold text-gain">{formatEuros(earned)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="historique">
        <h2 id="historique" className="mb-3 text-lg">
          Historique
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Commissions</h3>
            {earnings.commissions.length === 0 ? (
              <Panel className="text-sm text-muted">Chaque paiement d’un filleul ajoute une ligne ici.</Panel>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {earnings.commissions.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="num text-muted">{c.month}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{c.status === 'annulee' ? 'Annulée' : c.canceled_cents > 0 ? 'En partie annulée' : 'Due'}</span>
                    <span className="num font-semibold">{formatEuros(c.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Versements</h3>
            {earnings.payouts.length === 0 ? (
              <Panel className="text-sm text-muted">Aucun versement pour l’instant.</Panel>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {earnings.payouts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="num text-muted">{p.data.paid_on}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{p.data.reference ?? 'Virement'}</span>
                    <span className="num font-semibold">{formatEuros(p.data.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="kit">
        <h2 id="kit" className="text-lg">
          Kit de partage
        </h2>
        <p className="mt-1 text-sm text-muted">Des textes et des visuels prêts à poster, avec ton lien.</p>
        <ul className="mt-4 space-y-2">
          {texts.map((t) => (
            <li key={t.id}>
              <Panel className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <CopyButton text={t.text} label="Copier le texte" copiedLabel="Texte copié" />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.text}</p>
              </Panel>
            </li>
          ))}
        </ul>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {VISUALS.map((v) => {
            const src = `/app/parrainage/visuel/${v.format}`;
            const { width, height } = SHARE_FORMATS[v.format];
            return (
              <li key={v.format} className={cn(v.format === 'lien' && 'col-span-2 sm:col-span-1')}>
                <Card className="flex h-full flex-col gap-3 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- PNG généré à la demande, déjà à la bonne taille */}
                  <img
                    src={src}
                    alt={`Visuel ${v.label.toLowerCase()} avec ton code ${profile.referral_code}`}
                    width={width}
                    height={height}
                    loading="lazy"
                    className="h-auto w-full rounded-xl border border-line bg-surface"
                  />
                  <div className="mt-auto">
                    <p className="text-sm font-semibold">{v.label}</p>
                    <p className="text-xs text-muted">
                      {width} × {height} · {v.use}
                    </p>
                    <a
                      href={`${src}?telecharger=1`}
                      download
                      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold hover:bg-surface"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Télécharger
                    </a>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <Panel className="mt-8 text-sm leading-relaxed text-muted">
        <p className="font-semibold text-fg">Comment ça marche</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Ton filleul s’inscrit avec ton lien (il reste mémorisé 30 jours) ou ton code.</li>
          <li>Chaque fois qu’il paie son abonnement, {rate} % du montant hors taxes est ajouté à ton solde.</li>
          <li>
            Le solde est versé par virement une fois par mois, dès {formatEuros(PAYOUT_THRESHOLD_CENTS)} cumulés. Un paiement remboursé annule
            la commission au prorata.
          </li>
          <li>Signale toujours que c’est un lien de parrainage quand tu le partages.</li>
        </ol>
      </Panel>
    </div>
  );
}

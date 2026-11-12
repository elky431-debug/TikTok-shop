import type { Metadata } from 'next';
import { CopyButton } from '@/components/ui/copy-button';
import { Badge, Card, EmptyState, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import type { ReferralStatus } from '@/lib/db/types';
import { env } from '@/lib/env';
import { getPlan, REFERRAL_COMMISSION_RATE } from '@/lib/plans';
import { referralLink } from '@/lib/referral';
import { formatEuros, formatRelative, parisDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Parrainage' };

const STATUS: Record<ReferralStatus, { label: string; tone: 'neutral' | 'cyan' | 'gain' | 'warn' }> = {
  inscrit: { label: 'Inscrit', tone: 'neutral' },
  essai: { label: 'En essai', tone: 'cyan' },
  abonne: { label: 'Abonné', tone: 'gain' },
  resilie: { label: 'Résilié', tone: 'warn' },
};

export default async function ParrainagePage() {
  const { profile } = await requireOnboardedViewer('/app/parrainage');
  const repo = getRepo();
  const [referrals, commissions] = await Promise.all([repo.listReferralsByReferrer(profile.id), repo.listCommissions(profile.id)]);
  const link = referralLink(env.siteUrl, profile.referral_code);
  const month = parisDate().slice(0, 7);
  const thisMonth = commissions.filter((c) => c.month === month).reduce((s, c) => s + c.amount_cents, 0);
  const due = commissions.filter((c) => c.status === 'due').reduce((s, c) => s + c.amount_cents, 0);
  const paid = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount_cents, 0);
  const subscribed = referrals.filter((r) => r.status === 'abonne' || r.status === 'essai').length;
  const shareText = `Je repère mes produits TikTok Shop avec cet outil, en français. Voici mon lien : ${link}`;
  const rate = Math.round(REFERRAL_COMMISSION_RATE * 100);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Parrainage"
        description={`Invite d’autres créateurs : tu touches ${rate} % de ce qu’ils paient, chaque mois, tant qu’ils restent abonnés.`}
      />

      <Card className="border-fg/15 sm:p-6">
        <p className="text-sm font-semibold">Ton lien personnel</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3.5 py-2.5 text-[0.95rem]">{link}</code>
          <CopyButton text={link} label="Copier mon lien" copiedLabel="Lien copié" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          Ton code : <span className="num font-semibold text-fg">{profile.referral_code}</span>
          <CopyButton text={shareText} label="Copier un message à partager" copiedLabel="Message copié" className="ml-auto" />
        </div>
      </Card>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          { label: 'Filleuls', value: String(referrals.length) },
          { label: 'Abonnés ou en essai', value: String(subscribed) },
          { label: 'Gains ce mois-ci', value: formatEuros(thisMonth), gain: true },
          { label: 'À verser', value: formatEuros(due), gain: true },
        ].map((item) => (
          <div key={item.label} className="bg-raised p-3.5">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className={`num mt-1 text-xl font-semibold ${item.gain ? 'text-gain' : ''}`}>{item.value}</dd>
          </div>
        ))}
      </dl>
      {paid > 0 ? <p className="mt-2 text-sm text-muted">Déjà versé : {formatEuros(paid)}.</p> : null}

      <section className="mt-8" aria-labelledby="filleuls">
        <h2 id="filleuls" className="mb-3 text-lg">
          Tes filleuls
        </h2>
        {referrals.length === 0 ? (
          <EmptyState title="Pas encore de filleul">
            Partage ton lien à des créateurs qui veulent se lancer sur TikTok Shop. Ils s’inscrivent gratuitement ; tu touches{' '}
            {rate} % s’ils passent Pro.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {referrals.map((r, i) => {
              const earned = commissions.filter((c) => c.referral_id === r.id).reduce((s, c) => s + c.amount_cents, 0);
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

      <Panel className="mt-8 text-sm leading-relaxed text-muted">
        <p className="font-semibold text-fg">Comment ça marche</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Ton filleul s’inscrit avec ton lien (il reste mémorisé 30 jours).</li>
          <li>Chaque fois qu’il paie son abonnement, {rate} % du montant hors taxes est ajouté à tes gains.</li>
          <li>Les gains sont calculés automatiquement à chaque paiement et versés par virement une fois par mois, dès 50 € cumulés.</li>
        </ol>
      </Panel>
    </div>
  );
}

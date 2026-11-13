import type { Metadata } from 'next';
import { SimpleShell } from '@/components/app/simple-shell';
import { Input } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState, PageHeader } from '@/components/ui/surface';
import { listBeneficiaries, listCoachRows } from '@/lib/admin/people';
import { requireAdmin } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { MAX_EXTRA_CODES, PAYOUT_THRESHOLD_CENTS } from '@/lib/referral';
import { cn, formatEuros, parisDate } from '@/lib/utils';
import { addCoachCodeAction, markPayoutAction } from '../actions';
import { AdminNav, Section } from '../admin-ui';

export const metadata: Metadata = { title: 'Formateurs · Administration' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, { tone: 'gain' | 'rose'; text: string }> = {
  'ok=formateur': { tone: 'gain', text: 'Compte passé en formateur.' },
  'ok=code': { tone: 'gain', text: 'Code ajouté : il marche tout de suite.' },
  'ok=versement': { tone: 'gain', text: 'Versement enregistré : il apparaît dans l’historique du bénéficiaire.' },
  'erreur=formateur': { tone: 'rose', text: 'Formateur introuvable.' },
  'erreur=code-format': { tone: 'rose', text: 'Le code doit faire 3 à 24 caractères (lettres, chiffres, tirets).' },
  'erreur=code-pris': { tone: 'rose', text: 'Ce code est déjà utilisé.' },
  'erreur=code-limite': { tone: 'rose', text: `Ce formateur a déjà ${MAX_EXTRA_CODES} codes supplémentaires.` },
  'erreur=versement-montant': { tone: 'rose', text: 'Indique un montant positif, en euros.' },
  'erreur=versement-date': { tone: 'rose', text: 'Indique la date du virement.' },
  'erreur=versement-solde': { tone: 'rose', text: 'Le montant dépasse le solde dû : rien n’a été enregistré.' },
};

export default async function AdminCoachesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  await requireAdmin();
  const repo = getRepo();
  const [rows, beneficiaries] = await Promise.all([listCoachRows(repo), listBeneficiaries(repo)]);
  const message = Object.entries(searchParams)
    .map(([k, v]) => MESSAGES[`${k}=${v}`])
    .find(Boolean);
  const today = parisDate();

  return (
    <SimpleShell title="Administration">
      <PageHeader eyebrow="Administration" title="Formateurs et versements" description="Les candidatures, les codes et les commissions à verser aux formateurs." className="mb-6" />
      <div className="mt-4">
        <AdminNav current="formateurs" />
      </div>
      {message ? <Callout tone={message.tone} className="mb-4" title={message.text} /> : null}

      <div className="space-y-12">
        <Section id="formateurs" title={`Formateurs (${rows.length})`}>
          {rows.length === 0 ? (
            <EmptyState title="Aucun formateur">Passe un compte en formateur depuis l’onglet Utilisateurs.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {rows.map(({ coach, email, students, codes }) => (
                <li key={coach.id}>
                  <Card>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{coach.training_name}</p>
                      <p className="num text-sm text-muted">
                        {email ?? coach.user_id} · {students} élève{students > 1 ? 's' : ''} · {Math.round(coach.commission_rate * 100)} %
                      </p>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {codes.map((c) => (
                        <li key={c.code}>
                          <Badge tone={c.main ? 'cyan' : c.active ? 'neutral' : 'warn'}>
                            {c.code}
                            {c.main ? ' · principal' : c.active ? ` · ${c.label}` : ' · en pause'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    <form action={addCoachCodeAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input type="hidden" name="formateur" value={coach.id} />
                      <Input name="code" placeholder="NOUVEAUCODE" aria-label="Nouveau code" className="uppercase sm:max-w-[12rem]" required />
                      <Input name="libelle" placeholder="Promo ou formation" aria-label="Promo ou formation" className="sm:max-w-xs" />
                      <SubmitButton size="sm" variant="outline" pendingLabel="Ajout…">
                        Ajouter le code
                      </SubmitButton>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="versements" title="Versements à faire">
          <p className="-mt-1 mb-3 max-w-prose text-sm text-muted">
            Versements manuels : fais le virement, puis note-le ici (montant, date, référence). Il apparaît aussitôt dans l’historique du
            bénéficiaire. Seuil : {formatEuros(PAYOUT_THRESHOLD_CENTS)} de solde. Un solde négatif vient d’un remboursement après versement : il
            est retenu sur le suivant.
          </p>
          {beneficiaries.length === 0 ? (
            <EmptyState title="Personne à payer">Les parrains et formateurs apparaissent ici dès leur première commission.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {beneficiaries.map((b) => (
                <li key={b.userId}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold">
                        {b.profile?.email ?? b.userId}
                        {b.coach ? <span className="font-normal text-muted"> · formateur {b.coach.training_name}</span> : <span className="font-normal text-muted"> · parrain</span>}
                      </p>
                      {b.earnings.next.eligible ? <Badge tone="gain">À verser</Badge> : null}
                    </div>
                    <p className="num mt-1 text-sm text-muted">
                      Gagné {formatEuros(b.earnings.earnedCents)} · versé {formatEuros(b.earnings.paidCents)} ·{' '}
                      <span className={cn('font-semibold', b.earnings.balanceCents < 0 ? 'text-rose-ink' : 'text-fg')}>
                        solde {formatEuros(b.earnings.balanceCents)}
                      </span>
                    </p>
                    {b.earnings.payouts.length ? (
                      <p className="mt-1 text-xs text-muted">
                        Derniers versements :{' '}
                        {b.earnings.payouts
                          .slice(0, 3)
                          .map((p) => `${p.data.paid_on} ${formatEuros(p.data.amount_cents)}${p.data.reference ? ` (${p.data.reference})` : ''}`)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {b.earnings.balanceCents > 0 ? (
                      <form action={markPayoutAction} className="mt-3 grid gap-2 sm:grid-cols-[8rem_10rem_1fr_auto] sm:items-center">
                        <input type="hidden" name="beneficiaire" value={b.userId} />
                        <Input
                          name="montant"
                          inputMode="decimal"
                          defaultValue={(b.earnings.balanceCents / 100).toFixed(2).replace('.', ',')}
                          aria-label="Montant versé, en euros"
                          required
                        />
                        <Input name="date" type="date" defaultValue={today} aria-label="Date du virement" required />
                        <Input name="reference" placeholder="Référence du virement" aria-label="Référence du virement" maxLength={80} />
                        <SubmitButton size="sm" variant="ink" pendingLabel="Enregistrement…">
                          Marquer comme versé
                        </SubmitButton>
                      </form>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </SimpleShell>
  );
}

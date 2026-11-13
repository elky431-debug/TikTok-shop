import type { Metadata } from 'next';
import Link from 'next/link';
import { SimpleShell } from '@/components/app/simple-shell';
import { Input, Label, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, EmptyState, PageHeader } from '@/components/ui/surface';
import { filterProfiles } from '@/lib/admin/people';
import { requireAdmin } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan, isPaidPlan, isPlanId } from '@/lib/plans';
import { formatRelative } from '@/lib/utils';
import { grantPlanAction, makeCoachAction } from '../actions';
import { AdminNav } from '../admin-ui';

export const metadata: Metadata = { title: 'Utilisateurs · Administration' };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  formation: 'Indique le nom de la formation.',
  code: 'Le code promo doit faire 3 à 24 caractères (lettres, chiffres, tirets).',
  'code-pris': 'Ce code est déjà utilisé (formateur, code supplémentaire ou parrainage).',
  plan: 'Ce plan n’existe pas, ou le compte est introuvable.',
  base: 'La base n’a pas encore la nouvelle grille de prix : lance « npm run db:setup » (migration nouvelle_grille), puis réessaie.',
};
const SHOWN = 100;

export default async function AdminUsersPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  await requireAdmin();
  const repo = getRepo();
  const [profiles, coaches] = await Promise.all([repo.listProfiles({ limit: 1000 }), repo.listCoaches()]);
  const coachByUser = new Map(coaches.map((c) => [c.user_id, c]));
  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));
  const query = searchParams.q ?? '';
  const plan = isPlanId(searchParams.plan) ? searchParams.plan : 'tous';
  const found = filterProfiles(profiles, query, plan);
  const error = searchParams.erreur ? ERRORS[searchParams.erreur] ?? searchParams.erreur : null;

  return (
    <SimpleShell title="Administration">
      <PageHeader eyebrow="Administration" title="Utilisateurs" description="Retrouve un compte, son plan et son activité ; change un plan à la main si besoin." className="mb-6" />
      <div className="mt-4">
        <AdminNav current="utilisateurs" />
      </div>
      {error ? <Callout tone="rose" className="mb-4" title={error} /> : null}
      {searchParams.ok === 'plan' ? <Callout tone="gain" className="mb-4" title="Plan changé. Un plan offert ne crée ni facture ni commission." /> : null}

      <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" role="search">
        <div>
          <Label htmlFor="q">Rechercher</Label>
          <Input id="q" name="q" type="search" defaultValue={query} placeholder="E-mail, prénom, pseudo TikTok ou code" />
        </div>
        <div>
          <Label htmlFor="plan">Plan</Label>
          <Select id="plan" name="plan" defaultValue={plan}>
            <option value="tous">Tous les plans</option>
            <option value="aucun">Sans abonnement</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
          </Select>
        </div>
        <SubmitButton variant="outline">Rechercher</SubmitButton>
      </form>
      <p className="mt-3 text-sm text-muted">
        {found.length} compte{found.length > 1 ? 's' : ''} sur {profiles.length}
        {found.length > SHOWN ? ` · ${SHOWN} premiers affichés, affine la recherche` : ''}.
      </p>

      {found.length === 0 ? (
        <EmptyState title="Aucun compte ne correspond" className="mt-4" action={<Link href="/admin/utilisateurs" className="font-semibold underline">Tout afficher</Link>}>
          Essaie une partie de l’e-mail ou du prénom.
        </EmptyState>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {found.slice(0, SHOWN).map((p) => {
            const coach = coachByUser.get(p.id);
            const studentOf = p.coach_id ? coachById.get(p.coach_id) : null;
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
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-muted">Dernière visite</dt>
                      <dd>{formatRelative(p.last_seen_at)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Code de parrainage</dt>
                      <dd className="num">{p.referral_code}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Venu par</dt>
                      <dd>
                        {studentOf ? `formateur ${studentOf.training_name}` : p.referred_by ? `parrain ${emailById.get(p.referred_by) ?? p.referred_by}` : '—'}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Discord</dt>
                      <dd>{p.discord_user_id ? 'lié' : 'non lié'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Niches</dt>
                      <dd>{p.niches.join(', ') || '—'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted">Abonnés TikTok</dt>
                      <dd>{p.follower_range ?? '—'}</dd>
                    </div>
                  </dl>
                  <form action={grantPlanAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input type="hidden" name="utilisateur" value={p.id} />
                    <Select name="plan" aria-label={`Plan offert à ${p.email}`} defaultValue={p.plan} className="sm:max-w-[14rem]">
                      <option value="aucun">Sans abonnement</option>
                      <option value="starter">Starter offert</option>
                      <option value="pro">Pro offert</option>
                      <option value="elite">Elite offert</option>
                    </Select>
                    <SubmitButton size="sm" variant="outline" pendingLabel="Changement…">
                      Changer le plan
                    </SubmitButton>
                  </form>
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
                  ) : (
                    <p className="mt-3 text-sm">
                      <Link href="/admin/formateurs" className="font-semibold underline underline-offset-2">
                        Voir ses codes et ses versements
                      </Link>
                    </p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </SimpleShell>
  );
}

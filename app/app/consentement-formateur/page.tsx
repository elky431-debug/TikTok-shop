import type { Metadata } from 'next';
import { Eye, EyeOff, Megaphone } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { ChoiceChip } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Callout, Card, EmptyState, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getStudentConsent, listAnnouncements } from '@/lib/coach';
import { getRepo } from '@/lib/db';
import { formatLongDate, formatRelative } from '@/lib/utils';
import { saveConsentAction } from './actions';

export const metadata: Metadata = { title: 'Mon formateur' };
export const dynamic = 'force-dynamic';

/**
 * Côté élève : ce que voit son formateur, ses deux accords (révocables), et les annonces du formateur.
 * Sans accord, le formateur ne voit que des chiffres d'ensemble sur tous ses élèves, jamais rien d'individuel.
 */
export default async function ConsentementFormateurPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/consentement-formateur');
  const coach = profile.coach_id ? await getRepo().getCoachById(profile.coach_id) : null;

  if (!coach) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Mon formateur" />
        <EmptyState title="Tu n’es rattaché à aucun formateur" action={<LinkButton href="/app">Retour au radar</LinkButton>}>
          Si ton formateur t’a donné un code, il s’applique à l’inscription. Rien n’est partagé avec personne.
        </EmptyState>
      </div>
    );
  }

  const [consent, announcements] = await Promise.all([getStudentConsent(profile), listAnnouncements(coach, getRepo(), 10)]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Mon formateur" description={`Tu es inscrit avec ${coach.training_name}. Tu décides de ce qu’il voit.`} />
      {searchParams.ok ? <Callout tone="gain" className="mb-4" title="Tes choix sont enregistrés. Tu peux les changer quand tu veux." /> : null}

      <Card className="sm:p-6">
        <h2 className="text-lg">Ce que voit {coach.training_name}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex gap-2">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span>
              <strong>Toujours :</strong> des chiffres d’ensemble sur tous ses élèves (nombre d’inscrits, d’actifs, d’abonnés, vidéos postées
              et scripts écrits au total). Rien qui permette de te reconnaître.
            </span>
          </li>
          <li className="flex gap-2">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-cyan-ink" aria-hidden="true" />
            <span>
              <strong>Seulement si tu l’acceptes :</strong> ton prénom, ton plan, tes vidéos postées, tes scripts écrits, tes produits suivis et
              ta dernière visite. Et, à part, ton e-mail.
            </span>
          </li>
        </ul>

        <form action={saveConsentAction} className="mt-5 space-y-3">
          <ChoiceChip
            name="detail"
            value="1"
            defaultChecked={consent.detail}
            description="Pour qu’il suive ta progression et t’aide. Tu peux le retirer à tout moment : il ne voit plus rien d’individuel."
          >
            Montrer ma progression à mon formateur
          </ChoiceChip>
          <ChoiceChip name="email" value="1" defaultChecked={consent.email} description="Pour qu’il puisse t’écrire en dehors de l’appli.">
            Partager mon e-mail avec mon formateur
          </ChoiceChip>
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer mes choix</SubmitButton>
          {consent.updatedAt ? (
            <p className="text-xs text-muted">Dernier changement : {formatLongDate(consent.updatedAt.slice(0, 10))}.</p>
          ) : null}
        </form>
      </Card>

      <section className="mt-8" aria-labelledby="annonces">
        <h2 id="annonces" className="mb-3 flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5 text-cyan-ink" aria-hidden="true" />
          Annonces de {coach.training_name}
        </h2>
        {announcements.length === 0 ? (
          <EmptyState title="Aucune annonce pour l’instant">Les messages de ton formateur arrivent ici et dans tes notifications.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {announcements.map((a) => (
              <li key={a.id}>
                <Panel>
                  <p className="font-semibold">{a.data.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{a.data.body}</p>
                  <p className="mt-2 text-xs text-muted">{formatRelative(a.created_at)}</p>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

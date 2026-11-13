import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LinkButton } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Callout, Card, Panel } from '@/components/ui/surface';
import { requireViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { quote } from '@/lib/utils';
import { WelcomeShell } from '../../welcome-shell';

export const metadata: Metadata = { title: 'Ton premier script' };
export const dynamic = 'force-dynamic';

/** Moment waouh, étape 5 : la meilleure accroche et le premier script, prêts à tourner. */
export default async function PremierScriptPage({ params }: { params: { id: string } }) {
  const { profile } = await requireViewer('/bienvenue/produits');
  if (!profile.onboarded_at) redirect('/bienvenue');
  const repo = getRepo();
  const record = await repo.getScript(profile.id, params.id);
  if (!record) notFound();
  const product = await repo.getProduct(record.product_id);
  const [hook] = record.hooks;
  const [script] = record.script;
  const text = script ? [hook ? `Accroche : ${hook.text}` : null, ...script.shots.map((s) => `${s.time} · ${s.voice}`), script.call_to_action].filter(Boolean).join('\n') : '';

  return (
    <WelcomeShell step={5} wide>
      <p className="eyebrow">Ton premier script</p>
      <h1 className="mt-2 text-3xl">{product ? `Prêt à tourner sur ${quote(product.name)}` : 'Prêt à tourner'}</h1>
      {record.source === 'simulation' ? (
        <Callout tone="neutral" className="mt-4" title="Script d’exemple">
          L’écriture par IA n’est pas encore branchée sur ce site : ce script est un modèle, construit à partir du produit et de ton
          style.
        </Callout>
      ) : null}

      {hook ? (
        <Panel className="mt-6">
          <p className="text-sm text-muted">L’accroche (les {hook.seconds} premières secondes)</p>
          <p className="mt-1 text-xl font-semibold leading-snug">{quote(hook.text)}</p>
        </Panel>
      ) : null}

      {script ? (
        <Card className="mt-4">
          <h2 className="text-lg">{script.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {script.angle} · {script.duration_seconds} secondes
          </p>
          <ol className="mt-4 space-y-3">
            {script.shots.map((shot, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="num w-12 shrink-0 font-semibold text-muted">{shot.time}</span>
                <span>
                  <span className="block">{shot.voice}</span>
                  {shot.visual ? <span className="mt-0.5 block text-muted">À l’image : {shot.visual}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm">
            <span className="font-semibold">Pour finir : </span>
            {script.call_to_action}
          </p>
          {script.disclosure ? <p className="mt-2 text-xs text-muted">{script.disclosure}</p> : null}
          <CopyButton text={text} label="Copier le script" copiedLabel="Script copié" className="mt-4" />
        </Card>
      ) : null}

      <p className="mt-4 text-sm text-muted">
        Et ce n’est qu’un début : {record.hooks.length} accroches et {record.script.length} scripts t’attendent dans{' '}
        <Link href={`/app/studio/${record.id}`} className="font-semibold text-fg underline underline-offset-2">
          le studio
        </Link>
        .
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <LinkButton href="/bienvenue/pro" size="lg" arrow className="flex-1">
          Continuer
        </LinkButton>
      </div>
    </WelcomeShell>
  );
}

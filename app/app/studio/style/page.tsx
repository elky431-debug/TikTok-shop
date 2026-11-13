import type { Metadata } from 'next';
import { Fingerprint } from 'lucide-react';
import { PlanGate } from '@/components/app/plan-gate';
import { StudioNav } from '@/components/studio/studio-nav';
import { Field, Input, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { STYLE_MAX_CHARS, STYLE_MAX_SAMPLES, STYLE_MIN_CHARS, STYLE_MIN_SAMPLES } from '@/lib/ai/style';
import { studioRights } from '@/lib/studio';
import { getStyle, styleAnalysesLeft } from '@/lib/studio/style';
import { formatRelative } from '@/lib/utils';
import { analyzeStyleAction, deleteStyleAction, toggleStyleAction, updateStyleAction } from './actions';

export const metadata: Metadata = { title: 'Mon style' };

const OK: Record<string, string> = {
  analyse: 'Ton style est prêt : il sera utilisé dans tes prochains scripts.',
  modifie: 'Tes modifications sont enregistrées.',
  supprime: 'Ton style et tes textes sont supprimés.',
};

export default async function StylePage({ searchParams }: { searchParams: { ok?: string; erreur?: string } }) {
  const { profile } = await requireOnboardedViewer('/app/studio/style');
  const rights = studioRights(profile.plan);
  const header = (
    <>
      <PageHeader eyebrow="Créer" title="Mon style" description="Colle les textes de 3 à 5 de tes vidéos : on en tire ta façon de parler, et chaque script l’imite." />
      <StudioNav active="style" />
    </>
  );
  if (!rights.personalStyle) {
    return (
      <div>
        {header}
        <PlanGate plan="Pro" title="Des scripts qui parlent comme toi">
          Tes expressions, ta longueur de phrase, ta façon de commencer et de conclure : tirées de tes propres vidéos, réutilisées dans chaque script.
        </PlanGate>
      </div>
    );
  }

  const [style, left] = await Promise.all([getStyle(profile.id), styleAnalysesLeft(profile)]);
  const data = style?.data ?? null;
  const samples = data?.samples ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      {header}
      {searchParams.ok && OK[searchParams.ok] ? (
        <Callout tone="gain" className="mb-6">
          {OK[searchParams.ok]}
        </Callout>
      ) : null}
      {searchParams.erreur ? (
        <Callout tone="rose" className="mb-6" title="Rien n’a changé">
          {searchParams.erreur}
        </Callout>
      ) : null}

      {data ? (
        <Card className="mb-6 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="icon-chip h-10 w-10 shrink-0">
                <Fingerprint className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg">Ton style</h2>
                <p className="text-sm text-muted">
                  Analysé {formatRelative(data.analyzed_at)}
                  {data.edited_at ? ` · modifié ${formatRelative(data.edited_at)}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.simulated ? <Badge tone="warn">Analyse simple, sans IA</Badge> : null}
              <Badge tone={data.enabled ? 'gain' : 'neutral'}>{data.enabled ? 'Utilisé dans tes scripts' : 'En pause'}</Badge>
            </div>
          </div>

          <p className="mt-4">{data.profile.summary}</p>
          <p className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="neutral">Ton : {data.profile.tone}</Badge>
            <Badge tone="neutral">Phrases {data.profile.sentence_length}</Badge>
            <Badge tone="neutral">{data.profile.address.charAt(0).toUpperCase() + data.profile.address.slice(1)}</Badge>
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <StyleList title="Tes expressions" items={data.profile.expressions} empty="Aucune expression qui revient d’un texte à l’autre." quote />
            <StyleList title="Tes débuts" items={data.profile.openings} empty="—" quote />
            <StyleList title="Tes fins" items={data.profile.closings} empty="—" quote />
            <StyleList title="À garder" items={data.profile.do} empty="—" />
            {data.profile.avoid.length ? <StyleList title="À éviter" items={data.profile.avoid} empty="—" /> : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            <form action={toggleStyleAction}>
              <input type="hidden" name="actif" value={data.enabled ? '0' : '1'} />
              <SubmitButton size="sm" variant="outline" pendingLabel={data.enabled ? 'Mise en pause…' : 'Activation…'}>
                {data.enabled ? 'Mettre en pause' : 'Utiliser mon style'}
              </SubmitButton>
            </form>
            <form action={deleteStyleAction}>
              <SubmitButton size="sm" variant="danger" pendingLabel="Suppression…">
                Supprimer mon style
              </SubmitButton>
            </form>
          </div>

          <details className="mt-5 rounded-2xl border border-line">
            <summary className="cursor-pointer px-4 py-3 font-semibold">Modifier à la main</summary>
            <form action={updateStyleAction} className="grid gap-4 border-t border-line p-4">
              <Field label="En bref" htmlFor="resume">
                <Textarea id="resume" name="resume" rows={3} maxLength={400} defaultValue={data.profile.summary} />
              </Field>
              <Field label="Ton" htmlFor="ton">
                <Input id="ton" name="ton" maxLength={80} defaultValue={data.profile.tone} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Expressions" htmlFor="expressions" hint="Une par ligne, 6 au plus.">
                  <Textarea id="expressions" name="expressions" rows={4} defaultValue={data.profile.expressions.join('\n')} />
                </Field>
                <Field label="Débuts" htmlFor="debuts" hint="Une par ligne, 3 au plus.">
                  <Textarea id="debuts" name="debuts" rows={4} defaultValue={data.profile.openings.join('\n')} />
                </Field>
                <Field label="Fins" htmlFor="fins" hint="Une par ligne, 3 au plus.">
                  <Textarea id="fins" name="fins" rows={4} defaultValue={data.profile.closings.join('\n')} />
                </Field>
                <Field label="À garder" htmlFor="a_faire" hint="Une par ligne, 4 au plus.">
                  <Textarea id="a_faire" name="a_faire" rows={4} defaultValue={data.profile.do.join('\n')} />
                </Field>
                <Field label="À éviter" htmlFor="a_eviter" hint="Une par ligne, 3 au plus.">
                  <Textarea id="a_eviter" name="a_eviter" rows={3} defaultValue={data.profile.avoid.join('\n')} />
                </Field>
              </div>
              <p className="text-xs text-muted">Les phrases avec une promesse (santé, gains, « le meilleur »…) sont retirées automatiquement.</p>
              <div>
                <SubmitButton pendingLabel="Enregistrement…">Enregistrer mes modifications</SubmitButton>
              </div>
            </form>
          </details>
        </Card>
      ) : null}

      <Card className="sm:p-6">
        <h2 className="text-lg">{data ? 'Analyser à nouveau' : 'Colle tes textes'}</h2>
        <p className="mt-1 text-sm text-muted">
          Ce que tu dis dans {STYLE_MIN_SAMPLES} à {STYLE_MAX_SAMPLES} de tes vidéos (tu peux copier les sous-titres). Tes textes restent privés : ils servent
          seulement à décrire ton style, et tu peux les supprimer quand tu veux.
        </p>
        <form action={analyzeStyleAction} className="mt-5 grid gap-4">
          {Array.from({ length: STYLE_MAX_SAMPLES }, (_, i) => (
            <Field
              key={i}
              label={`Vidéo ${i + 1}${i >= STYLE_MIN_SAMPLES ? ' (facultatif)' : ''}`}
              htmlFor={`texte-${i + 1}`}
            >
              <Textarea
                id={`texte-${i + 1}`}
                name="texte"
                rows={3}
                minLength={i < STYLE_MIN_SAMPLES ? STYLE_MIN_CHARS : undefined}
                maxLength={STYLE_MAX_CHARS}
                required={i < STYLE_MIN_SAMPLES}
                defaultValue={samples[i] ?? ''}
                placeholder={i === 0 ? 'Ex. : « Les filles, faut que je vous montre un truc… »' : undefined}
              />
            </Field>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <SubmitButton pendingLabel="Analyse de ton style…" disabled={left <= 0}>
              {data ? 'Analyser à nouveau' : 'Analyser mon style'}
            </SubmitButton>
            <p className="text-sm text-muted">
              {left > 0 ? `Il te reste ${left} analyse${left > 1 ? 's' : ''} aujourd’hui.` : 'Plus d’analyse aujourd’hui : tu peux encore modifier ton style à la main.'}
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}

function StyleList({ title, items, empty, quote }: { title: string; items: string[]; empty: string; quote?: boolean }) {
  return (
    <Panel>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((item, i) => (
            <li key={i}>{quote ? `« ${item} »` : item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </Panel>
  );
}

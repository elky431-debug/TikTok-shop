import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { LinkButton } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, PageHeader, Panel } from '@/components/ui/surface';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { cn, formatCompact, formatInt, formatShortDate } from '@/lib/utils';
import { SEGMENT_LABELS, type AnalysisData } from '@/lib/v2/analysis';
import { remainingToday } from '@/lib/v2/quota';
import { analyzeVideoAction, deleteAnalysisAction } from './actions';

export const metadata: Metadata = { title: 'Analyse de vidéo' };

const ERRORS: Record<string, string> = {
  quota: 'Tu as atteint le nombre d’analyses du jour. Reviens demain.',
  lien: 'Ce lien n’est pas celui d’une vidéo TikTok (il doit contenir /video/ suivi de chiffres).',
  texte: 'Colle le texte de la vidéo (ce qui est dit ou écrit à l’écran), 20 caractères au moins.',
  'sans-texte': 'Aucune description trouvée pour ce lien : colle le texte de la vidéo.',
  ia: 'L’analyse n’a pas pu être faite. Réessaie dans un instant.',
};

export default async function AnalysePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/analyse');
  const plan = getPlan(profile.plan);
  if (!plan.analysesPerDay) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="Analyse de vidéo" />
        <PlanGate plan="Pro+" title="Comprends pourquoi une vidéo cartonne">
          Colle le lien et le texte d’une vidéo virale : découpage seconde par seconde, ce qui marche, et une version adaptée à
          ton produit et à ton style.
        </PlanGate>
      </div>
    );
  }
  const repo = getRepo();
  const [records, saved, left] = await Promise.all([
    repo.listRecords<AnalysisData>(profile.id, 'analyse'),
    repo.listSavedProducts(profile.id),
    remainingToday(profile.id, 'analyse', plan.analysesPerDay),
  ]);
  const products = await repo.getProducts(saved.map((s) => s.product_id));
  const current = records.find((r) => r.id === searchParams.analyse) ?? null;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Analyse de vidéo" description="Le lien d’une vidéo qui marche, son texte, et ton produit : on la décortique et on l’adapte pour toi." />
      {searchParams.erreur ? <Callout tone="rose" className="mb-6" title={ERRORS[searchParams.erreur] ?? ERRORS.ia} /> : null}

      <Card>
        <form action={analyzeVideoAction} className="grid gap-3">
          <Field label="Lien de la vidéo TikTok (facultatif)" htmlFor="lien" hint="Avec un lien, on récupère sa description, sa durée et ses vues quand la source les a.">
            <Input id="lien" name="lien" type="url" placeholder="https://www.tiktok.com/@compte/video/…" />
          </Field>
          <Field label="Texte de la vidéo" htmlFor="texte" hint="Ce qui est dit et écrit à l’écran. Facultatif si le lien suffit.">
            <Textarea id="texte" name="texte" rows={5} maxLength={5000} />
          </Field>
          <Field label="Adapter pour" htmlFor="produit">
            <Select id="produit" name="produit" defaultValue="">
              <option value="">Un produit de la même catégorie</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.slice(0, 80)}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton pendingLabel="Analyse…" disabled={left <= 0}>
            Analyser la vidéo
          </SubmitButton>
          <p className="text-xs text-muted">
            {left} analyse{left > 1 ? 's' : ''} restante{left > 1 ? 's' : ''} aujourd’hui.
          </p>
        </form>
      </Card>

      {current ? <AnalysisResult id={current.id} data={current.data} /> : null}

      {records.length ? (
        <section className="mt-8" aria-labelledby="inspirations">
          <h2 id="inspirations" className="mb-3 text-lg">
            Mes inspirations
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {records.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/analyse?analyse=${r.id}`}
                  className={cn('block rounded-2xl border p-3.5 text-sm hover:border-line-strong', r.id === current?.id ? 'border-cyan-ink/40' : 'border-line')}
                >
                  <span className="line-clamp-2 font-medium">{r.data.analysis.hook_type} · {r.data.text.slice(0, 90)}</span>
                  <span className="text-xs text-muted">
                    {formatShortDate(r.created_at.slice(0, 10))}
                    {r.data.product_name ? ` · pour ${r.data.product_name.slice(0, 40)}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function AnalysisResult({ id, data }: { id: string; data: AnalysisData }) {
  const a = data.analysis;
  const facts = data.facts;
  return (
    <div className="mt-6 space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">Découpage</h2>
            <p className="mt-1 text-sm text-muted">{a.summary}</p>
          </div>
          <div className="flex gap-2">
            {data.simulated ? <Badge tone="neutral">Analyse simulée</Badge> : null}
            <Badge tone="ink">{a.hook_type}</Badge>
          </div>
        </div>
        {facts ? (
          <p className="num mt-3 flex flex-wrap gap-x-4 text-xs text-muted">
            {facts.duration_s !== null ? <span>{facts.duration_s} s</span> : null}
            {facts.views !== null ? <span>{formatCompact(facts.views)} vues</span> : null}
            {facts.sales !== null ? <span>{formatInt(facts.sales)} ventes estimées</span> : null}
          </p>
        ) : null}
        <ol className="mt-4 space-y-2">
          {a.segments.map((s) => (
            <li key={`${s.from_s}-${s.role}`} className="grid grid-cols-[5.5rem_1fr] gap-3 rounded-xl border border-line p-3 text-sm">
              <span className="num font-semibold text-cyan-ink">
                {s.from_s}–{s.to_s} s
              </span>
              <span>
                <span className="font-semibold">{SEGMENT_LABELS[s.role]}</span>
                <span className="text-muted"> · {s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
      <Panel>
        <h2 className="text-lg">Ce qui fonctionne</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {a.strengths.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Panel>
      <Card className="border-fg/15">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">{a.adapted.title}</h2>
          <CopyButton text={a.adapted.lines.join('\n')} label="Copier la version" copiedLabel="Version copiée" />
        </div>
        <ol className="mt-3 space-y-2 text-sm">
          {a.adapted.lines.map((line, i) => (
            <li key={`${i}-${line.slice(0, 20)}`} className="flex gap-3">
              <span className="num w-5 shrink-0 font-bold text-muted">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.product_id ? (
            <LinkButton href={`/app/studio?produit=${data.product_id}`} size="sm">
              Écrire mes scripts dans le studio
            </LinkButton>
          ) : null}
          <form action={deleteAnalysisAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="ghost" size="sm" pendingLabel="…">
              Supprimer l’analyse
            </SubmitButton>
          </form>
        </div>
      </Card>
    </div>
  );
}

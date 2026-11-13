import type { Metadata } from 'next';
import { Send } from 'lucide-react';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { CopyButton } from '@/components/ui/copy-button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState, PageHeader, Panel } from '@/components/ui/surface';
import { formatLabel, isScriptFormat, SCRIPT_FORMATS } from '@/lib/ai/formats';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import type { Product } from '@/lib/db/types';
import { isNicheId, NICHES, nicheShort } from '@/lib/niches';
import { getPlan, quotaReachedMessage, remainingLabel } from '@/lib/plans';
import { cn, formatCompact, formatInt, formatShortDate } from '@/lib/utils';
import { clock, filterLibrary, libraryFacets, normalizeAnalysis, roleAt, SEGMENT_LABELS, type AnalysisData, type SegmentRole } from '@/lib/v2/analysis';
import { remainingThisMonth } from '@/lib/v2/quota';
import { analyzeVideoAction, classifyAnalysisAction, deleteAnalysisAction, sendToStudioAction } from './actions';

export const metadata: Metadata = { title: 'Analyse de vidéo' };

const ERRORS: Record<string, string> = {
  lien: 'Ce lien n’est pas celui d’une vidéo TikTok (il doit contenir /video/ suivi de chiffres).',
  texte: 'Colle le texte de la vidéo (ce qui est dit ou écrit à l’écran), 20 caractères au moins.',
  'sans-texte': 'Aucune description trouvée pour ce lien : colle le texte de la vidéo.',
  produit: 'Choisis un de tes produits suivis pour envoyer la version au studio.',
  ia: 'L’analyse n’a pas pu être faite. Réessaie dans un instant.',
};

const ROLE_TONE: Record<SegmentRole, string> = {
  accroche: 'text-rose-ink',
  probleme: 'text-warn',
  demonstration: 'text-cyan-ink',
  preuve: 'text-gain',
  appel_action: 'text-fg',
};

export default async function AnalysePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/analyse');
  const plan = getPlan(profile.plan);
  if (!plan.analysesPerMonth) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="Créer" title="Analyse de vidéo"  description="Le lien d’une vidéo qui marche, son texte, et ton produit : on la décortique et on l’adapte pour toi." />
        <PlanGate plan="pro" title="Comprends pourquoi une vidéo cartonne">
          Colle le lien et le texte d’une vidéo virale : découpage seconde par seconde, ce qui marche et pourquoi, une version
          adaptée à ton produit et à ton style à envoyer au studio, et ta bibliothèque d’inspirations.
        </PlanGate>
      </div>
    );
  }
  const repo = getRepo();
  const [records, saved, left] = await Promise.all([
    repo.listRecords<AnalysisData>(profile.id, 'analyse'),
    repo.listSavedProducts(profile.id),
    remainingThisMonth(profile.id, 'analyse', plan.analysesPerMonth),
  ]);
  const products = await repo.getProducts(saved.map((s) => s.product_id));
  const current = records.find((r) => r.id === searchParams.analyse) ?? null;
  const filters = {
    format: isScriptFormat(searchParams.format) ? searchParams.format : null,
    niche: isNicheId(searchParams.niche) ? searchParams.niche : null,
  };
  const library = filterLibrary(records, filters);
  const facets = libraryFacets(records);
  const filterHref = (patch: Partial<Record<'format' | 'niche', string | null>>) => {
    const params = new URLSearchParams();
    const next = { format: filters.format, niche: filters.niche, ...patch };
    if (next.format) params.set('format', next.format);
    if (next.niche) params.set('niche', next.niche);
    return `/app/analyse${params.size ? `?${params}` : ''}#bibliotheque`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Créer" title="Analyse de vidéo" description="Le lien d’une vidéo qui marche, son texte, et ton produit : on la décortique et on l’adapte pour toi." />
      {searchParams.erreur ? (
        <Callout
          tone="rose"
          className="mb-6"
          title={searchParams.erreur === 'quota' ? quotaReachedMessage(profile.plan, 'analysesPerMonth', 'analyses de vidéo', 'du mois') : (ERRORS[searchParams.erreur] ?? ERRORS.ia)}
        />
      ) : null}
      {searchParams.ok === 'classement' ? <Callout tone="gain" className="mb-6" title="Classement enregistré." /> : null}

      <Card>
        <form action={analyzeVideoAction} className="grid gap-3">
          <Field label="Lien de la vidéo TikTok (facultatif)" htmlFor="lien" hint="Avec un lien, on récupère sa description, sa durée et ses vues quand la source les a.">
            <Input id="lien" name="lien" type="url" inputMode="url" placeholder="https://www.tiktok.com/@compte/video/…" />
          </Field>
          <Field label="Texte ou description de la vidéo" htmlFor="texte" hint="Ce qui est dit et écrit à l’écran. Facultatif si le lien suffit.">
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
            {remainingLabel(profile.plan, 'analysesPerMonth', left, { one: 'analyse', many: 'analyses', feminine: true }, 'ce mois-ci')} La vidéo n’est ni téléchargée ni regardée : seuls son texte et ses
            chiffres publics servent.
          </p>
        </form>
      </Card>

      {current ? <AnalysisResult id={current.id} data={current.data} products={products} /> : null}

      <section className="mt-10" aria-labelledby="bibliotheque-titre" id="bibliotheque">
        <h2 id="bibliotheque-titre" className="mb-1 text-xl">
          Mes inspirations
        </h2>
        <p className="mb-3 text-sm text-muted">Toutes tes analyses, classées par format et par niche.</p>
        {records.length ? (
          <>
            <div className="space-y-2">
              <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Filtrer par format">
                <FilterChip href={filterHref({ format: null })} active={!filters.format}>
                  Tous les formats
                </FilterChip>
                {facets.formats.map((f) => (
                  <FilterChip key={f.id} href={filterHref({ format: f.id })} active={filters.format === f.id}>
                    {f.label} <span className="num text-muted">{f.count}</span>
                  </FilterChip>
                ))}
              </nav>
              {facets.niches.length ? (
                <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Filtrer par niche">
                  <FilterChip href={filterHref({ niche: null })} active={!filters.niche}>
                    Toutes les niches
                  </FilterChip>
                  {facets.niches.map((n) => (
                    <FilterChip key={n.id} href={filterHref({ niche: n.id })} active={filters.niche === n.id}>
                      {n.label} <span className="num text-muted">{n.count}</span>
                    </FilterChip>
                  ))}
                </nav>
              ) : null}
            </div>
            {library.length ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {library.map((r) => {
                  const view = normalizeAnalysis(r.data);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/app/analyse?analyse=${r.id}`}
                        className={cn('block h-full rounded-2xl border p-3.5 text-sm hover:border-line-strong', r.id === current?.id ? 'border-cyan-ink/40' : 'border-line')}
                      >
                        <span className="flex flex-wrap gap-1.5">
                          {view.format ? <Badge tone="cyan">{formatLabel(view.format)}</Badge> : null}
                          {view.niche ? <Badge>{nicheShort(view.niche)}</Badge> : null}
                          <Badge>{view.hook_type}</Badge>
                        </span>
                        <span className="mt-2 line-clamp-2 font-medium">{r.data.text.slice(0, 140)}</span>
                        <span className="mt-1 block text-xs text-muted">
                          {formatShortDate(r.created_at.slice(0, 10))}
                          {r.data.product_name ? ` · pour ${r.data.product_name.slice(0, 40)}` : ''}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Aucune analyse avec ces filtres.</p>
            )}
          </>
        ) : (
          <EmptyState title="Ta bibliothèque est vide">Analyse une première vidéo : elle rejoint tes inspirations, classée par format et par niche.</EmptyState>
        )}
      </section>
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={cn('rounded-full border px-3 py-1.5 font-semibold', active ? 'border-cyan-ink/50 bg-cyan-ink/[0.08] text-fg' : 'border-line text-muted hover:text-fg')}
    >
      {children}
    </Link>
  );
}

function AnalysisResult({ id, data, products }: { id: string; data: AnalysisData; products: Product[] }) {
  const a = normalizeAnalysis(data);
  const facts = data.facts;
  const canSend = products.length > 0;
  return (
    <div className="mt-6 space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">Découpage</h2>
            <p className="mt-1 text-sm text-muted">{a.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.simulated ? <Badge tone="neutral">Analyse simulée</Badge> : null}
            {a.format ? <Badge tone="cyan">{formatLabel(a.format)}</Badge> : null}
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
                <span className={cn('font-semibold', ROLE_TONE[s.role])}>{SEGMENT_LABELS[s.role]}</span>
                <span className="text-muted"> · {s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="text-lg">Seconde par seconde</h2>
        <ol className="mt-3 divide-y divide-line text-sm">
          {a.timeline.map((line, i) => {
            const role = roleAt(a.segments, line.second);
            return (
              <li key={`${line.second}-${i}`} className="grid grid-cols-[3rem_1fr] gap-3 py-2">
                <span className="num font-semibold text-muted">{clock(line.second)}</span>
                <span>
                  {role ? <span className={cn('mr-2 text-xs font-semibold uppercase tracking-wider', ROLE_TONE[role])}>{SEGMENT_LABELS[role]}</span> : null}
                  {line.text}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <Panel>
        <h2 className="text-lg">Ce qui fonctionne, et pourquoi</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {a.strengths.map((s) => (
            <li key={s.point}>
              <p className="font-semibold">{s.point}</p>
              {s.why ? <p className="mt-0.5 text-muted">{s.why}</p> : null}
            </li>
          ))}
        </ul>
      </Panel>

      <Card className="border-fg/15" id="version">
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
        {canSend ? (
          <form action={sendToStudioAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={id} />
            {data.product_id ? (
              <input type="hidden" name="produit" value={data.product_id} />
            ) : (
              <Field label="Produit pour le studio" htmlFor="produit-studio" className="min-w-[14rem] flex-1">
                <Select id="produit-studio" name="produit" required defaultValue="">
                  <option value="" disabled>
                    Choisis un produit suivi
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name.slice(0, 80)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <SubmitButton pendingLabel="Envoi…">
              <Send className="h-4 w-4" aria-hidden="true" />
              Envoyer au studio
            </SubmitButton>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Ajoute un produit à{' '}
            <Link href="/app/mes-produits" className="font-semibold text-fg underline">
              Mes produits
            </Link>{' '}
            pour envoyer cette version au studio.
          </p>
        )}
      </Card>

      <Panel>
        <h2 className="text-base">Classement dans ta bibliothèque</h2>
        <form action={classifyAnalysisAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="id" value={id} />
          <Field label="Format" htmlFor="classement-format">
            <Select id="classement-format" name="format" defaultValue={a.format ?? ''}>
              <option value="">Non classé</option>
              {SCRIPT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Niche" htmlFor="classement-niche">
            <Select id="classement-niche" name="niche" defaultValue={a.niche ?? ''}>
              <option value="">Non classée</option>
              {NICHES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </Select>
          </Field>
          <SubmitButton variant="outline" size="sm" className="h-11" pendingLabel="Enregistrement…">
            Enregistrer le classement
          </SubmitButton>
        </form>
        <form action={deleteAnalysisAction} className="mt-3">
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="Suppression…">
            Supprimer l’analyse
          </SubmitButton>
        </form>
      </Panel>
    </div>
  );
}

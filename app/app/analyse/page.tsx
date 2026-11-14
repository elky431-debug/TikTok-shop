import type { Metadata } from 'next';
import { Check, ChevronDown, Clapperboard, FileText, Sparkles, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { PlanGate } from '@/components/app/plan-gate';
import { FormatIcon } from '@/components/studio/format-icon';
import { ButtonArrow } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Select, Textarea } from '@/components/ui/field';
import { InfoTip } from '@/components/ui/info-tip';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, EmptyState, PageHeader, SectionTitle } from '@/components/ui/surface';
import { formatLabel, isScriptFormat, SCRIPT_FORMATS } from '@/lib/ai/formats';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import type { Product } from '@/lib/db/types';
import { isNicheId, NICHES, nicheShort } from '@/lib/niches';
import { getPlan, quotaReachedMessage, remainingLabel } from '@/lib/plans';
import { displayName, shortLabel } from '@/lib/product-name';
import { playerUrl } from '@/lib/tiktok/video';
import { cn, formatCompact, formatInt, formatShortDate } from '@/lib/utils';
import {
  BASIS_LABELS,
  clock,
  filterLibrary,
  libraryFacets,
  normalizeAnalysis,
  roleAt,
  SEGMENT_LABELS,
  type AnalysisData,
  type SegmentRole,
} from '@/lib/v2/analysis';
import { remainingThisMonth } from '@/lib/v2/quota';
import { analyzeVideoAction, classifyAnalysisAction, deleteAnalysisAction, sendToStudioAction } from './actions';
import { VideoLinkField } from './video-link-field';

export const metadata: Metadata = { title: 'Analyse de vidéo' };

const ERRORS: Record<string, string> = {
  lien: 'Ce lien n’est pas celui d’une vidéo TikTok.',
  'lien-court': 'Ce lien court ne s’ouvre pas : ouvre la vidéo dans TikTok et copie son lien complet.',
  texte: 'Colle un lien TikTok, ou le texte de la vidéo (20 caractères au moins) dans les options.',
  'sans-texte': 'Colle un lien TikTok, ou le texte de la vidéo dans les options.',
  produit: 'Choisis un de tes produits suivis pour ouvrir le studio.',
  ia: 'L’analyse n’a pas pu être faite. Réessaie dans un instant.',
};

/** Une couleur par partie de la vidéo (chronologie et cartes). */
const ROLE_STYLE: Record<SegmentRole, { bar: string; soft: string; text: string }> = {
  accroche: { bar: 'bg-rose-fill', soft: 'bg-rose-soft', text: 'text-rose-ink' },
  probleme: { bar: 'bg-warn', soft: 'bg-warn-soft', text: 'text-warn' },
  demonstration: { bar: 'bg-cyan-ink', soft: 'bg-cyan-soft', text: 'text-cyan-ink' },
  preuve: { bar: 'bg-gain', soft: 'bg-gain-soft', text: 'text-gain' },
  appel_action: { bar: 'bg-fg', soft: 'bg-surface', text: 'text-fg' },
};

export default async function AnalysePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/analyse');
  const plan = getPlan(profile.plan);
  if (!plan.analysesPerMonth) {
    return (
      <div>
        <PageHeader
          eyebrow="Créer"
          title="Analyse de vidéo"
          description="Colle le lien d’une vidéo qui vend : on la décortique et on l’adapte à ton produit."
        />
        <PlanGate plan="pro" title="Comprends pourquoi une vidéo cartonne">
          Découpage, ce qui marche, et ta version prête pour le studio.
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
    <div>
      <PageHeader eyebrow="Créer" title="Analyse de vidéo" description="Colle le lien d’une vidéo qui vend : on la décortique et on l’adapte à ton produit." />
      {searchParams.erreur ? (
        <Callout
          tone="rose"
          className="mb-6"
          title={
            searchParams.erreur === 'quota'
              ? quotaReachedMessage(profile.plan, 'analysesPerMonth', 'analyses de vidéo', 'du mois')
              : (ERRORS[searchParams.erreur] ?? ERRORS.ia)
          }
        />
      ) : null}
      {searchParams.ok === 'classement' ? <Callout tone="gain" className="mb-6" title="Classement enregistré." /> : null}

      <Card className="sm:p-8">
        <form action={analyzeVideoAction}>
          {/* Next ajoute des champs cachés en tête de formulaire : l'espacement se fait dans ce bloc. */}
          <div className="space-y-5">
            <VideoLinkField key={current?.id ?? 'nouvelle'} />
            <details className="group/options rounded-2xl border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Options
                <span className="flex items-center gap-2 text-xs font-normal text-muted">
                  Texte de la vidéo, produit
                  <ChevronDown className="h-4 w-4 transition-transform group-open/options:rotate-180" aria-hidden="true" />
                </span>
              </summary>
              <div className="grid gap-4 border-t border-line px-4 pb-4 pt-4">
                <div>
                  <label htmlFor="texte" className="mb-1.5 block text-sm font-semibold">
                    Texte de la vidéo
                  </label>
                  <Textarea id="texte" name="texte" rows={4} maxLength={5000} placeholder="Ce qui est dit ou écrit à l’écran : l’analyse sera plus précise." />
                </div>
                <div>
                  <label htmlFor="produit" className="mb-1.5 block text-sm font-semibold">
                    Adapter pour
                  </label>
                  <Select id="produit" name="produit" defaultValue="">
                    <option value="">Un produit de la même catégorie</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {displayName(p)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </details>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <SubmitButton size="lg" pendingLabel="Analyse…" disabled={left <= 0} className="sm:min-w-56">
                Analyser la vidéo
              </SubmitButton>
              <p className="text-sm text-muted">
                {remainingLabel(profile.plan, 'analysesPerMonth', left, { one: 'analyse', many: 'analyses', feminine: true }, 'ce mois-ci')}
              </p>
            </div>
          </div>
        </form>
      </Card>

      {current ? <AnalysisResult id={current.id} data={current.data} products={products} /> : null}

      <section className="mt-14" aria-labelledby="bibliotheque-titre" id="bibliotheque">
        <SectionTitle id="bibliotheque-titre">Mes inspirations</SectionTitle>
        {records.length ? (
          <>
            <div className="space-y-2">
              <nav className="scrollbar-none -mx-3 flex gap-1.5 overflow-x-auto px-3 text-sm sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filtrer par format">
                <FilterChip href={filterHref({ format: null })} active={!filters.format}>
                  Tous
                </FilterChip>
                {facets.formats.map((f) => (
                  <FilterChip key={f.id} href={filterHref({ format: f.id })} active={filters.format === f.id}>
                    {f.label} <span className="num text-muted">{f.count}</span>
                  </FilterChip>
                ))}
              </nav>
              {facets.niches.length > 1 ? (
                <nav className="scrollbar-none -mx-3 flex gap-1.5 overflow-x-auto px-3 text-sm sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filtrer par niche">
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
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {library.map((r, i) => (
                  <InspirationCard key={r.id} id={r.id} data={r.data} createdAt={r.created_at} active={r.id === current?.id} index={i} />
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-muted">Aucune analyse avec ces filtres.</p>
            )}
          </>
        ) : (
          <EmptyState icon={<Clapperboard className="h-5 w-5" />} title="Ta bibliothèque est vide">
            Chaque analyse vient s’y ranger.
          </EmptyState>
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
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 font-semibold transition-colors',
        active ? 'border-cyan-ink/50 bg-cyan-ink/[0.08] text-fg' : 'border-line text-muted hover:text-fg',
      )}
    >
      {children}
    </Link>
  );
}

/** Carte de la bibliothèque : couverture de la vidéo (ou format illustré), format, accroche. */
function InspirationCard({ id, data, createdAt, active, index }: { id: string; data: AnalysisData; createdAt: string; active: boolean; index: number }) {
  const view = normalizeAnalysis(data);
  const cover = data.facts?.cover_url ?? null;
  const hook = view.segments.find((s) => s.role === 'accroche')?.text ?? data.text.slice(0, 120);
  return (
    <li className="animate-fade-up motion-reduce:animate-none" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <Link
        href={`/app/analyse?analyse=${id}#resultat`}
        className={cn(
          'group block h-full overflow-hidden rounded-2xl border bg-raised transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_0_40px_-16px_rgb(var(--cyan)/0.35)]',
          active ? 'border-cyan-ink/50' : 'border-line',
        )}
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-[image:var(--gradient)]">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="(min-width: 1024px) 240px, 45vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-on-gradient">
              <FormatIcon format={view.format ?? 'demo'} className="h-10 w-10 opacity-90" />
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" aria-hidden="true" />
          <span className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap gap-1">
            {view.format ? <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink">{formatLabel(view.format)}</span> : null}
            {view.niche ? <span className="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white">{nicheShort(view.niche)}</span> : null}
          </span>
        </div>
        <div className="p-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{hook}</p>
          <p className="mt-1 truncate text-xs text-muted">
            {data.facts?.author ?? formatShortDate(createdAt.slice(0, 10))}
            {data.product_name ? ` · ${shortLabel(data.product_name)}` : ''}
          </p>
        </div>
      </Link>
    </li>
  );
}

function AnalysisResult({ id, data, products }: { id: string; data: AnalysisData; products: Product[] }) {
  const a = normalizeAnalysis(data);
  const facts = data.facts;
  const basis = data.basis ?? 'texte';
  const segments = [...a.segments].sort((x, y) => x.from_s - y.from_s);
  const total = Math.max(1, ...segments.map((s) => s.to_s));
  const strengths = a.strengths.slice(0, 3);

  return (
    <section id="resultat" aria-label="Résultat de l’analyse" className="mt-10 scroll-mt-20 space-y-10">
      <div className={cn('grid gap-6', data.video_id && 'lg:grid-cols-[1fr_15rem]')}>
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {a.format ? (
                <Badge tone="cyan">
                  <FormatIcon format={a.format} className="h-3 w-3" />
                  {formatLabel(a.format)}
                </Badge>
              ) : null}
              <Badge tone="ink">{a.hook_type}</Badge>
              <Badge tone={basis === 'texte' ? 'neutral' : 'warn'}>
                <FileText className="h-3 w-3" aria-hidden="true" />
                {BASIS_LABELS[basis]}
              </Badge>
              {data.simulated ? <Badge tone="neutral">Analyse simulée</Badge> : null}
            </div>
            {facts ? (
              <p className="num mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                {facts.author ? <span className="text-sm font-semibold">{facts.author}</span> : null}
                {facts.views !== null ? (
                  <span>
                    <span className="text-xl font-bold">{formatCompact(facts.views)}</span> <span className="text-xs text-muted">vues</span>
                  </span>
                ) : null}
                {facts.sales !== null ? (
                  <span>
                    <span className="text-xl font-bold text-gain">{formatInt(facts.sales)}</span> <span className="text-xs text-muted">ventes</span>
                  </span>
                ) : null}
                {facts.duration_s ? (
                  <span>
                    <span className="text-xl font-bold">{facts.duration_s} s</span>
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          {basis !== 'texte' ? (
            <Callout tone="warn" title={basis === 'legende' ? 'Analyse faite sur la légende seule.' : 'Analyse faite sans le texte de la vidéo.'}>
              <form action={analyzeVideoAction} className="mt-3 space-y-2">
                <input type="hidden" name="lien" value={data.url ?? ''} />
                <input type="hidden" name="produit" value={data.product_id ?? ''} />
                <label htmlFor="texte-plus" className="sr-only">
                  Texte de la vidéo
                </label>
                <Textarea
                  id="texte-plus"
                  name="texte"
                  rows={3}
                  maxLength={5000}
                  required
                  minLength={20}
                  placeholder="Colle ce qui est dit dans la vidéo pour une analyse plus précise."
                />
                <SubmitButton size="sm" variant="outline" pendingLabel="Analyse…">
                  Relancer avec ce texte
                </SubmitButton>
              </form>
            </Callout>
          ) : null}

          {/* Chronologie : une barre par partie, à la taille de sa durée. */}
          <div>
            <SectionTitle as="h2">Découpage</SectionTitle>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
              {segments.map((s, i) => (
                <span
                  key={`${s.from_s}-${s.role}`}
                  className={cn('h-full origin-left animate-grow-x border-r-2 border-bg last:border-r-0 motion-reduce:animate-none', ROLE_STYLE[s.role].bar)}
                  style={{ width: `${Math.max(6, ((s.to_s - s.from_s) / total) * 100)}%`, animationDelay: `${i * 90}ms` }}
                />
              ))}
            </div>
            <ol
              className="mt-4 grid gap-2 sm:grid-cols-2 lg:[grid-template-columns:var(--cols)]"
              style={{ '--cols': `repeat(${Math.min(segments.length, 5)}, minmax(0, 1fr))` } as React.CSSProperties}
            >
              {segments.map((s, i) => (
                <li
                  key={`${s.from_s}-${s.role}-carte`}
                  className={cn('animate-fade-up overflow-hidden rounded-xl motion-reduce:animate-none', ROLE_STYLE[s.role].soft)}
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <span className={cn('block h-1', ROLE_STYLE[s.role].bar)} aria-hidden="true" />
                  <div className="p-3.5">
                    <p className={cn('text-xs font-bold uppercase tracking-wider', ROLE_STYLE[s.role].text)}>{SEGMENT_LABELS[s.role]}</p>
                    <p className="num mt-0.5 whitespace-nowrap text-xs text-muted">
                      {s.from_s}–{s.to_s} s
                    </p>
                    <p className="mt-1.5 text-sm font-medium leading-snug">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {data.video_id ? (
          <div className="order-first w-40 sm:w-48 lg:order-none lg:w-full">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <iframe
                src={playerUrl(data.video_id)}
                title="Vidéo analysée"
                className="aspect-[9/16] w-full"
                allow="encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <SectionTitle as="h2">Ce qui marche</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-3">
          {strengths.map((s, i) => (
            <li
              key={s.point}
              className="flex animate-fade-up items-start gap-3 rounded-2xl border border-line bg-raised p-4 motion-reduce:animate-none"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient)] text-on-gradient">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
                {s.point}
                {s.why ? (
                  <InfoTip label={`Pourquoi : ${s.point}`} className="ml-1">
                    {s.why}
                  </InfoTip>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <Card id="version" className="scroll-mt-20 sm:p-8">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          <Sparkles className="h-3.5 w-3.5 text-cyan-ink" aria-hidden="true" />
          Ta version
        </p>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{a.adapted.title}</h2>
        <ol className="mt-5 space-y-3">
          {a.adapted.lines.map((line, i) => (
            <li key={`${i}-${line.slice(0, 20)}`} className="flex gap-3 text-base leading-relaxed">
              <span className="num mt-0.5 w-5 shrink-0 text-sm font-bold text-subtle">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:flex-wrap sm:items-center">
          {products.length ? (
            <form action={sendToStudioAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="id" value={id} />
              {data.product_id ? (
                <input type="hidden" name="produit" value={data.product_id} />
              ) : (
                <>
                  <label htmlFor="produit-studio" className="sr-only">
                    Produit pour le studio
                  </label>
                  <Select id="produit-studio" name="produit" required defaultValue="" className="sm:w-60">
                    <option value="" disabled>
                      Choisis un produit
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {displayName(p)}
                      </option>
                    ))}
                  </Select>
                </>
              )}
              <SubmitButton size="lg" pendingLabel="Ouverture…">
                Ouvrir dans le studio
                <ButtonArrow />
              </SubmitButton>
            </form>
          ) : (
            <Link href="/app/mes-produits" className="text-sm font-semibold text-cyan-ink underline underline-offset-2">
              Suis un produit pour ouvrir le studio
            </Link>
          )}
          <CopyButton text={a.adapted.lines.join('\n')} label="Copier" copiedLabel="Copié" size="md" />
        </div>
      </Card>

      <div className="space-y-2">
        <details className="group/details rounded-2xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Seconde par seconde
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open/details:rotate-180" aria-hidden="true" />
          </summary>
          <ol className="divide-y divide-line border-t border-line px-4 text-sm">
            {a.timeline.map((line, i) => {
              const role = roleAt(a.segments, line.second);
              return (
                <li key={`${line.second}-${i}`} className="grid grid-cols-[3rem_1fr] gap-3 py-2.5">
                  <span className="num font-semibold text-muted">{clock(line.second)}</span>
                  <span>
                    {role ? (
                      <span className={cn('mr-2 inline-block h-2 w-2 rounded-full align-middle', ROLE_STYLE[role].bar)} aria-label={SEGMENT_LABELS[role]} />
                    ) : null}
                    {line.text}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
        <details className="group/details rounded-2xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Classer ou supprimer
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open/details:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-line p-4">
            <form action={classifyAnalysisAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={id} />
              <div>
                <label htmlFor="classement-format" className="mb-1.5 block text-xs font-semibold text-muted">
                  Format
                </label>
                <Select id="classement-format" name="format" defaultValue={a.format ?? ''}>
                  <option value="">Non classé</option>
                  {SCRIPT_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="classement-niche" className="mb-1.5 block text-xs font-semibold text-muted">
                  Niche
                </label>
                <Select id="classement-niche" name="niche" defaultValue={a.niche ?? ''}>
                  <option value="">Non classée</option>
                  {NICHES.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </Select>
              </div>
              <SubmitButton variant="outline" size="sm" className="h-11" pendingLabel="Enregistrement…">
                Enregistrer
              </SubmitButton>
            </form>
            <form action={deleteAnalysisAction} className="mt-3">
              <input type="hidden" name="id" value={id} />
              <SubmitButton variant="ghost" size="sm" pendingLabel="Suppression…" className="text-rose-ink">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Supprimer l’analyse
              </SubmitButton>
            </form>
          </div>
        </details>
      </div>
    </section>
  );
}

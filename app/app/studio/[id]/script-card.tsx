import { ChevronDown, FileDown, FileText, Languages, RefreshCw, Scissors, ShieldCheck, Undo2, Zap } from 'lucide-react';
import { IconSubmit } from '@/components/studio/icon-submit';
import { RatingForm } from '@/components/studio/rating-form';
import { Teleprompter } from '@/components/studio/teleprompter';
import { prompterLines } from '@/components/studio/teleprompter-model';
import { CopyButton } from '@/components/ui/copy-button';
import { LockedButton } from '@/components/ui/locked-button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout } from '@/components/ui/surface';
import { COMMERCIAL_TAG, LANG_LABELS, LANG_MARKETS, ON_SCREEN_MENTION, TRANSLATION_LANGS, type ScriptLang, type TranslationLang } from '@/lib/ai/formats';
import type { StudioScript } from '@/lib/ai/types';
import { scriptBlockText } from '@/lib/studio/export';
import type { StudioDocView, StudioTranslation } from '@/lib/studio/types';
import { editLineAction, rateAction, rewriteAction, translateAction, undoAction } from '../actions';

export interface CardRights {
  editsLeft: number;
  translation: boolean;
  export: boolean;
}

function Hidden({ doc, index }: { doc: StudioDocView; index: number }) {
  return (
    <>
      <input type="hidden" name="id" value={doc.id} />
      <input type="hidden" name="script" value={index} />
    </>
  );
}

function exportHref(doc: StudioDocView, index: number, format: 'pdf' | 'txt', lang?: TranslationLang) {
  return `/app/studio/${doc.id}/export?format=${format}&script=${index}${lang ? `&langue=${lang}` : ''}`;
}

const toolClass = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface hover:text-fg';

function ExportLinks({ doc, index, lang }: { doc: StudioDocView; index: number; lang?: TranslationLang }) {
  return (
    <>
      <a href={exportHref(doc, index, 'pdf', lang)} className={toolClass}>
        <FileDown className="h-4 w-4" aria-hidden="true" />
        PDF
      </a>
      <a href={exportHref(doc, index, 'txt', lang)} className={toolClass}>
        <FileText className="h-4 w-4" aria-hidden="true" />
        Texte
      </a>
    </>
  );
}

/** Ce qui se dit, en grand, moment par moment. Le reste (ce qu'on voit, texte à l'écran) est dans « Détails du tournage ». */
function Voice({ doc, index, script, editable }: { doc: StudioDocView; index: number; script: StudioScript; editable: boolean }) {
  return (
    <ol className="space-y-5">
      {script.shots.map((shot, j) => (
        <li key={j} className="group grid items-start gap-1.5 sm:grid-cols-[4.5rem_1fr] sm:gap-4">
          <span className="num w-fit whitespace-nowrap rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-muted sm:mt-1.5">{shot.time}</span>
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 text-lg font-medium leading-relaxed sm:text-xl">{shot.voice}</p>
            {editable ? (
              <form action={editLineAction} className="opacity-100 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
                <Hidden doc={doc} index={index} />
                <input type="hidden" name="plan" value={j} />
                <IconSubmit label={`Réécrire la ligne ${j + 1} du script ${index + 1}`}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </IconSubmit>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Mention({ lang }: { lang: ScriptLang }) {
  return (
    <p className="mt-6 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
      <ShieldCheck className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
      <span>
        À l’écran : <span className="font-semibold text-fg">{ON_SCREEN_MENTION[lang]}</span>
      </span>
      <span aria-hidden="true">·</span>
      <span>
        En légende : <span className="font-semibold text-fg">{COMMERCIAL_TAG[lang]}</span>
      </span>
    </p>
  );
}

/** Détails du tournage, repliés : ce qu'on voit, texte à l'écran, plans de coupe, légende et hashtags. */
function ShootingDetails({ script }: { script: StudioScript }) {
  const caption = `${script.caption} ${script.hashtags.join(' ')}`.trim();
  return (
    <details className="group/details mt-6 rounded-2xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        Détails du tournage
        <ChevronDown className="h-4 w-4 text-muted transition-transform group-open/details:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-5 border-t border-line px-4 pb-5 pt-4 text-sm">
        <ol className="space-y-3">
          {script.shots.map((shot, j) => (
            <li key={j} className="grid gap-1 sm:grid-cols-[4.5rem_1fr] sm:gap-3">
              <span className="num whitespace-nowrap text-xs font-bold text-muted">{shot.time}</span>
              <div className="min-w-0 space-y-1">
                <p>
                  <span className="text-muted">On voit : </span>
                  {shot.visual}
                </p>
                {shot.on_screen_text ? (
                  <p>
                    <span className="text-muted">Texte à l’écran : </span>
                    <span className="rounded-md bg-surface px-1.5 py-0.5 font-semibold">{shot.on_screen_text}</span>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {script.broll?.length ? (
          <div>
            <p className="font-semibold">Plans de coupe</p>
            <ul className="mt-2 grid gap-1.5 text-muted sm:grid-cols-2">
              {script.broll.map((b, k) => (
                <li key={k} className="rounded-lg bg-surface px-3 py-2">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <p className="font-semibold">Appel à l’action</p>
          <p className="mt-1 text-muted">{script.call_to_action}</p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Légende</p>
            <CopyButton text={caption} size="icon" label="Copier la légende" copiedLabel="Légende copiée" />
          </div>
          <p className="mt-1 text-muted">
            {script.caption} <span className="text-cyan-ink">{script.hashtags.join(' ')}</span>
          </p>
        </div>
        <p className="text-xs text-muted">{script.disclosure}</p>
      </div>
    </details>
  );
}

function Translation({
  doc,
  index,
  lang,
  t,
  stale,
  rights,
}: {
  doc: StudioDocView;
  index: number;
  lang: TranslationLang;
  t: StudioTranslation;
  stale: boolean;
  rights: CardRights;
}) {
  return (
    <details className="group/details rounded-2xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>Version {LANG_LABELS[lang].toLowerCase()}</span>
        <span className="flex items-center gap-2">
          {t.simulated ? <Badge tone="warn">Simulée</Badge> : null}
          {stale ? <Badge tone="warn">À refaire</Badge> : null}
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open/details:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-4">
        {stale ? (
          <form action={translateAction} className="mb-4">
            <Hidden doc={doc} index={index} />
            <input type="hidden" name="langue" value={lang} />
            <SubmitButton size="sm" variant="outline" pendingLabel="Traduction…" disabled={rights.editsLeft <= 0}>
              Traduire à nouveau
            </SubmitButton>
          </form>
        ) : null}
        <p className="mb-4 text-xs text-muted">{LANG_MARKETS[lang]}</p>
        <Voice doc={doc} index={index} script={t.script} editable={false} />
        <Mention lang={lang} />
        <div className="mt-5 flex flex-wrap gap-2">
          <Teleprompter title={`${t.script.title} (${LANG_LABELS[lang].toLowerCase()})`} lines={prompterLines(t.script.shots)} variant="outline" />
          <CopyButton text={scriptBlockText(t.script, index, lang)} label="Copier" copiedLabel="Copié" />
          {rights.export ? <ExportLinks doc={doc} index={index} lang={lang} /> : null}
        </div>
        <ShootingDetails script={t.script} />
      </div>
    </details>
  );
}

/** Un script dans son onglet : le texte parlé en grand, deux boutons en évidence, le reste replié ou discret. */
export function ScriptCard({ doc, index, rights, error }: { doc: StudioDocView; index: number; rights: CardRights; error?: string }) {
  const script = doc.scripts[index];
  const rating = doc.ratings[index];
  const version = doc.versions[index] ?? 1;
  const translations = doc.translations[index] ?? {};
  const editable = rights.editsLeft > 0;
  const missingLangs = TRANSLATION_LANGS.filter((lang) => !translations[lang]);

  return (
    <div>
      {error ? (
        <Callout tone="rose" className="mb-5" title="Retouche non faite">
          {error}
        </Callout>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{script.title}</h2>
        {version > 1 ? <Badge tone="cyan">Retouché</Badge> : null}
      </div>

      <Voice doc={doc} index={index} script={script} editable={editable} />
      <Mention lang="fr" />

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Teleprompter title={script.title} lines={prompterLines(script.shots)} size="md" />
        <CopyButton text={scriptBlockText(script, index)} label="Copier le script" copiedLabel="Script copié" size="md" />
      </div>

      <ShootingDetails script={script} />

      <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-line pt-4">
        <form action={rewriteAction}>
          <Hidden doc={doc} index={index} />
          <input type="hidden" name="mode" value="raccourcir" />
          <SubmitButton
            size="sm"
            variant="ghost"
            pendingLabel="Raccourcissement…"
            disabled={!editable || (script.duration_seconds <= 15 && script.shots.length <= 3)}
            className="px-3"
          >
            <Scissors className="h-4 w-4" aria-hidden="true" />
            Raccourcir
          </SubmitButton>
        </form>
        <form action={rewriteAction}>
          <Hidden doc={doc} index={index} />
          <input type="hidden" name="mode" value="percutant" />
          <SubmitButton size="sm" variant="ghost" pendingLabel="Réécriture…" disabled={!editable} className="px-3">
            <Zap className="h-4 w-4" aria-hidden="true" />
            Plus percutant
          </SubmitButton>
        </form>
        {doc.previous[index] ? (
          <form action={undoAction}>
            <Hidden doc={doc} index={index} />
            <SubmitButton size="sm" variant="ghost" pendingLabel="Retour…" className="px-3">
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Annuler la retouche
            </SubmitButton>
          </form>
        ) : null}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
        {rights.export ? (
          <ExportLinks doc={doc} index={index} />
        ) : (
          <LockedButton plan="Elite" feature="L’export PDF" icon={<FileDown className="h-4 w-4" aria-hidden="true" />} className="border-0">
            PDF
          </LockedButton>
        )}
        {rights.translation ? (
          missingLangs.map((lang) => (
            <form key={lang} action={translateAction}>
              <Hidden doc={doc} index={index} />
              <input type="hidden" name="langue" value={lang} />
              <SubmitButton size="sm" variant="ghost" pendingLabel="Traduction…" disabled={!editable} className="px-3">
                <Languages className="h-4 w-4" aria-hidden="true" />
                {LANG_LABELS[lang]}
              </SubmitButton>
            </form>
          ))
        ) : (
          <LockedButton
            plan="Elite"
            feature="La traduction (Allemagne, Italie, Espagne)"
            icon={<Languages className="h-4 w-4" aria-hidden="true" />}
            className="border-0"
          >
            Traduire
          </LockedButton>
        )}
      </div>

      {rights.translation && missingLangs.length < TRANSLATION_LANGS.length ? (
        <div className="mt-4 space-y-2">
          {TRANSLATION_LANGS.map((lang) => {
            const t = translations[lang];
            return t ? <Translation key={lang} doc={doc} index={index} lang={lang} t={t} stale={t.version !== version} rights={rights} /> : null;
          })}
        </div>
      ) : null}

      <div className="mt-4 border-t border-line pt-4">
        <RatingForm action={rateAction} docId={doc.id} index={index} stars={rating?.stars ?? null} sold={rating?.sold ?? null} />
      </div>
    </div>
  );
}

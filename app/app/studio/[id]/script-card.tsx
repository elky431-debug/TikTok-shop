import { FileDown, FileText, Languages, RefreshCw, Scissors, ShieldCheck, Undo2, Zap } from 'lucide-react';
import { IconSubmit } from '@/components/studio/icon-submit';
import { RatingForm } from '@/components/studio/rating-form';
import { Teleprompter } from '@/components/studio/teleprompter';
import { prompterLines } from '@/components/studio/teleprompter-model';
import { CopyButton } from '@/components/ui/copy-button';
import { SubmitButton } from '@/components/ui/submit-button';
import { Badge, Callout, Card, Panel } from '@/components/ui/surface';
import { LANG_LABELS, LANG_MARKETS, ON_SCREEN_MENTION, TRANSLATION_LANGS, type TranslationLang } from '@/lib/ai/formats';
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

function ExportLinks({ doc, index, lang }: { doc: StudioDocView; index: number; lang?: TranslationLang }) {
  const link = 'inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold hover:bg-surface';
  return (
    <>
      <a href={exportHref(doc, index, 'pdf', lang)} className={link}>
        <FileDown className="h-4 w-4" aria-hidden="true" />
        PDF
      </a>
      <a href={exportHref(doc, index, 'txt', lang)} className={link}>
        <FileText className="h-4 w-4" aria-hidden="true" />
        Texte
      </a>
    </>
  );
}

/** Plans d'un script (version française ou traduite). */
function Shots({ doc, index, script, editable }: { doc: StudioDocView; index: number; script: StudioScript; editable: boolean }) {
  return (
    <ol className="mt-5 space-y-4">
      {script.shots.map((shot, j) => (
        <li key={j} className="grid gap-2 sm:grid-cols-[4.5rem_1fr]">
          <span className="num h-fit w-fit rounded-full bg-fg px-2.5 py-0.5 text-xs font-bold text-bg">{shot.time}</span>
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm text-muted">
              <span className="font-semibold text-fg">On voit : </span>
              {shot.visual}
            </p>
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-[1.05rem] font-medium leading-relaxed">«&nbsp;{shot.voice}&nbsp;»</p>
              {editable ? (
                <form action={editLineAction}>
                  <Hidden doc={doc} index={index} />
                  <input type="hidden" name="plan" value={j} />
                  <IconSubmit label={`Réécrire la ligne ${j + 1} du script ${index + 1}`}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </IconSubmit>
                </form>
              ) : null}
            </div>
            {shot.on_screen_text ? (
              <p className="text-sm">
                <span className="text-muted">Texte à l’écran : </span>
                <span className="rounded-md bg-surface px-1.5 py-0.5 font-semibold">{shot.on_screen_text}</span>
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Details({ script, lang }: { script: StudioScript; lang: 'fr' | TranslationLang }) {
  return (
    <>
      {script.broll?.length ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">Plans de coupe à filmer en plus</h3>
          <ul className="mt-2 grid gap-1.5 text-sm text-muted sm:grid-cols-2">
            {script.broll.map((b, k) => (
              <li key={k} className="flex gap-2 rounded-xl bg-surface px-3 py-2">
                <span className="text-cyan-ink" aria-hidden="true">
                  ▸
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Panel className="mt-5 space-y-2 text-sm">
        <p>
          <span className="font-semibold">Appel à l’action : </span>
          {script.call_to_action}
        </p>
        <p>
          <span className="font-semibold">Légende : </span>
          {script.caption} <span className="text-cyan-ink">{script.hashtags.join(' ')}</span>
        </p>
      </Panel>
      <div className="mt-3 flex gap-3 rounded-2xl border border-line p-3.5 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-ink" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">
            Collaboration commerciale :{' '}
            <span className="rounded-md bg-surface px-1.5 py-0.5">{ON_SCREEN_MENTION[lang]}</span> à l’écran
          </p>
          <p className="mt-1 text-muted">{script.disclosure}</p>
        </div>
      </div>
    </>
  );
}

function Translation({ doc, index, lang, t, stale, rights }: { doc: StudioDocView; index: number; lang: TranslationLang; t: StudioTranslation; stale: boolean; rights: CardRights }) {
  return (
    <details className="group rounded-2xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold">
        <span>
          Version {LANG_LABELS[lang].toLowerCase()} <span className="text-sm font-normal text-muted">· {LANG_MARKETS[lang]}</span>
        </span>
        <span className="flex items-center gap-2">
          {t.simulated ? <Badge tone="warn">Simulée</Badge> : null}
          {stale ? <Badge tone="warn">À refaire</Badge> : <Badge tone="gain">À jour</Badge>}
        </span>
      </summary>
      <div className="border-t border-line px-4 pb-4">
        {t.simulated ? (
          <Callout tone="warn" className="mt-4">
            Traduction simulée : sans clé d’IA, le texte reste en français, marqué [{lang.toUpperCase()}]. La vraie traduction arrive dès qu’un fournisseur d’IA est branché.
          </Callout>
        ) : null}
        {stale ? (
          <Callout tone="warn" className="mt-4" title="Le script a changé depuis cette traduction">
            <form action={translateAction} className="mt-2">
              <Hidden doc={doc} index={index} />
              <input type="hidden" name="langue" value={lang} />
              <SubmitButton size="sm" variant="outline" pendingLabel="Traduction…" disabled={rights.editsLeft <= 0}>
                Traduire à nouveau
              </SubmitButton>
            </form>
          </Callout>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Teleprompter title={`${t.script.title} (${LANG_LABELS[lang].toLowerCase()})`} lines={prompterLines(t.script.shots)} variant="outline" />
          <CopyButton text={scriptBlockText(t.script, index, lang)} label="Copier" copiedLabel="Copié" />
          {rights.export ? <ExportLinks doc={doc} index={index} lang={lang} /> : null}
        </div>
        <p className="mt-4 font-semibold">{t.script.title}</p>
        <Shots doc={doc} index={index} script={t.script} editable={false} />
        <Details script={t.script} lang={lang} />
      </div>
    </details>
  );
}

export function ScriptCard({
  doc,
  index,
  rights,
  error,
}: {
  doc: StudioDocView;
  index: number;
  rights: CardRights;
  error?: string;
}) {
  const script = doc.scripts[index];
  const rating = doc.ratings[index];
  const version = doc.versions[index] ?? 1;
  const translations = doc.translations[index] ?? {};
  const editable = rights.editsLeft > 0;

  return (
    <Card id={`script-${index + 1}`} className="scroll-mt-20 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">
            Script {index + 1} · <span className="num">{script.duration_seconds} s</span>
          </p>
          <h2 className="mt-0.5 text-xl">{script.title}</h2>
          <p className="mt-1 text-sm text-muted">{script.angle}</p>
        </div>
        {version > 1 ? <Badge tone="cyan">Retouché</Badge> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Teleprompter title={script.title} lines={prompterLines(script.shots)} />
        <CopyButton text={scriptBlockText(script, index)} label="Copier ce script" copiedLabel="Script copié" />
        {rights.export ? <ExportLinks doc={doc} index={index} /> : null}
      </div>

      {error ? (
        <Callout tone="rose" className="mt-4" title="Retouche non faite">
          {error}
        </Callout>
      ) : null}

      <Shots doc={doc} index={index} script={script} editable={editable} />
      <Details script={script} lang="fr" />

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Retoucher</h3>
          <p className="num text-xs text-muted">
            {rights.editsLeft > 0 ? `${rights.editsLeft} retouche${rights.editsLeft > 1 ? 's' : ''} possible${rights.editsLeft > 1 ? 's' : ''} sur cette génération` : 'Plus de retouche possible sur cette génération'}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={rewriteAction}>
            <Hidden doc={doc} index={index} />
            <input type="hidden" name="mode" value="raccourcir" />
            <SubmitButton size="sm" variant="outline" pendingLabel="Raccourcissement…" disabled={!editable || (script.duration_seconds <= 15 && script.shots.length <= 3)}>
              <Scissors className="h-4 w-4" aria-hidden="true" />
              Raccourcir
            </SubmitButton>
          </form>
          <form action={rewriteAction}>
            <Hidden doc={doc} index={index} />
            <input type="hidden" name="mode" value="percutant" />
            <SubmitButton size="sm" variant="outline" pendingLabel="Réécriture…" disabled={!editable}>
              <Zap className="h-4 w-4" aria-hidden="true" />
              Rendre plus percutant
            </SubmitButton>
          </form>
          {doc.previous[index] ? (
            <form action={undoAction}>
              <Hidden doc={doc} index={index} />
              <SubmitButton size="sm" variant="ghost" pendingLabel="Retour…">
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Revenir à la version précédente
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {editable ? <p className="mt-2 text-xs text-muted">Pour changer une seule phrase, appuie sur la flèche à côté de la ligne.</p> : null}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Languages className="h-4 w-4 text-cyan-ink" aria-hidden="true" />
          Marchés européens
        </h3>
        {rights.translation ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {TRANSLATION_LANGS.filter((lang) => !translations[lang]).map((lang) => (
                <form key={lang} action={translateAction}>
                  <Hidden doc={doc} index={index} />
                  <input type="hidden" name="langue" value={lang} />
                  <SubmitButton size="sm" variant="outline" pendingLabel="Traduction…" disabled={!editable}>
                    Traduire en {LANG_LABELS[lang].toLowerCase()}
                  </SubmitButton>
                </form>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {TRANSLATION_LANGS.map((lang) => {
                const t = translations[lang];
                return t ? <Translation key={lang} doc={doc} index={index} lang={lang} t={t} stale={t.version !== version} rights={rights} /> : null;
              })}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Adapte ce script pour TikTok Shop en Allemagne, en Italie et en Espagne (texte, légende, hashtags, mention locale) avec{' '}
            <a href="/app/passer-pro" className="font-semibold text-fg underline underline-offset-2">
              le plan Pro+
            </a>
            .
          </p>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <RatingForm action={rateAction} docId={doc.id} index={index} stars={rating?.stars ?? null} sold={rating?.sold ?? null} />
        <p className="mt-2 text-xs text-muted">Tes notes servent d’exemple aux prochains scripts : ceux qui ont vendu d’abord, puis les mieux notés.</p>
      </div>
    </Card>
  );
}

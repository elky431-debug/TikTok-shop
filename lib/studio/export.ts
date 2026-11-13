import { angleLabel, formatLabel, LANG_LABELS, toneLabel, type TranslationLang } from '@/lib/ai/formats';
import type { StudioScript } from '@/lib/ai/types';
import { BRAND } from '@/lib/brand';
import { buildPdf, type PdfBlock } from './pdf';
import type { StudioDoc } from './types';

/**
 * Exports d'une génération : texte brut (copier, .txt) et PDF (fichier généré côté serveur, sans dépendance).
 * Même contenu dans les deux : réglages, accroches, scripts plan par plan, plans de coupe, légende, mention obligatoire.
 */

export function settingsLine(doc: Pick<StudioDoc, 'format' | 'settings'>): string {
  return `${formatLabel(doc.format)} · ${doc.settings.duration} s · ton ${toneLabel(doc.settings.tone).toLowerCase()} · angle ${angleLabel(doc.settings.angle).toLowerCase()}`;
}

/** Le script à exporter : la version française, ou sa traduction si elle existe. */
export function pickScript(doc: StudioDoc, index: number, lang?: TranslationLang | null): { script: StudioScript; lang: TranslationLang | null } | null {
  const script = doc.scripts[index];
  if (!script) return null;
  if (lang) {
    const t = doc.translations[index]?.[lang];
    return t ? { script: t.script, lang } : null;
  }
  return { script, lang: null };
}

export function scriptBlockText(script: StudioScript, index: number, lang: TranslationLang | null = null): string {
  const out = [`SCRIPT ${index + 1}${lang ? ` (${LANG_LABELS[lang].toLowerCase()})` : ''} : ${script.title} (${script.duration_seconds} s)`];
  if (script.angle) out.push(`Angle : ${script.angle}`);
  out.push('');
  for (const shot of script.shots) {
    out.push(`[${shot.time}] On voit : ${shot.visual}`, `  Dis : « ${shot.voice} »`);
    if (shot.on_screen_text) out.push(`  À l’écran : ${shot.on_screen_text}`);
  }
  out.push('');
  if (script.broll?.length) out.push(`Plans de coupe : ${script.broll.join(' · ')}`);
  out.push(`Appel à l’action : ${script.call_to_action}`, `Légende : ${script.caption} ${script.hashtags.join(' ')}`.trim(), script.disclosure);
  return out.join('\n');
}

/** Tout le texte d'une génération (aussi gardé dans la table `scripts` pour l'export de l'historique). */
export function docToText(doc: StudioDoc): string {
  const out = [`${doc.product_name} · ${settingsLine(doc)}`, '', 'ACCROCHES'];
  doc.hooks.forEach((h, i) => out.push(`${i + 1}. ${h.text}`));
  doc.scripts.forEach((s, i) => out.push('', scriptBlockText(s, i)));
  return out.join('\n');
}

/** Texte d'un seul script (éventuellement traduit), pour l'export .txt. */
export function docScriptText(doc: StudioDoc, index: number, lang: TranslationLang | null = null): string | null {
  const picked = pickScript(doc, index, lang);
  if (!picked) return null;
  return [`${doc.product_name} · ${settingsLine(doc)}`, '', scriptBlockText(picked.script, index, picked.lang)].join('\n');
}

function scriptBlocks(script: StudioScript, index: number, lang: TranslationLang | null): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { text: `Script ${index + 1}${lang ? ` (${LANG_LABELS[lang].toLowerCase()})` : ''} : ${script.title}`, size: 15, bold: true, gapBefore: 18 },
    { text: `${script.duration_seconds} s${script.angle ? ` · ${script.angle}` : ''}`, size: 10, color: 'muted', gapBefore: 2 },
  ];
  for (const shot of script.shots) {
    blocks.push(
      { text: `${shot.time}  ·  On voit : ${shot.visual}`, size: 9.5, color: 'muted', gapBefore: 10 },
      { text: `« ${shot.voice} »`, size: 12, bold: true, gapBefore: 2 },
    );
    if (shot.on_screen_text) blocks.push({ text: `À l’écran : ${shot.on_screen_text}`, size: 10, gapBefore: 2 });
  }
  if (script.broll?.length) {
    blocks.push({ text: 'Plans de coupe', size: 11, bold: true, color: 'accent', gapBefore: 12 });
    for (const b of script.broll) blocks.push({ text: `•  ${b}`, size: 10, gapBefore: 2, indent: 8 });
  }
  blocks.push(
    { text: 'Appel à l’action', size: 11, bold: true, color: 'accent', gapBefore: 12 },
    { text: script.call_to_action, size: 10.5, gapBefore: 2 },
    { text: 'Légende', size: 11, bold: true, color: 'accent', gapBefore: 10 },
    { text: `${script.caption} ${script.hashtags.join(' ')}`.trim(), size: 10.5, gapBefore: 2 },
    { text: script.disclosure, size: 9.5, color: 'muted', gapBefore: 10 },
  );
  return blocks;
}

/** PDF d'une génération entière (accroches + 3 scripts) ou d'un seul script (éventuellement traduit). */
export function docToPdf(doc: StudioDoc, options: { index?: number | null; lang?: TranslationLang | null } = {}): Uint8Array | null {
  const header: PdfBlock[] = [
    { text: doc.product_name, size: 20, bold: true },
    { text: settingsLine(doc), size: 10, color: 'muted', gapBefore: 4 },
  ];
  const blocks: PdfBlock[] = [...header];
  if (options.index === null || options.index === undefined) {
    blocks.push({ text: '10 accroches', size: 15, bold: true, gapBefore: 18 });
    doc.hooks.forEach((h, i) => blocks.push({ text: `${i + 1}.  ${h.text}`, size: 11, gapBefore: 3, indent: 4 }));
    doc.scripts.forEach((s, i) => blocks.push(...scriptBlocks(s, i, null)));
  } else {
    const picked = pickScript(doc, options.index, options.lang ?? null);
    if (!picked) return null;
    blocks.push(...scriptBlocks(picked.script, options.index, picked.lang));
  }
  return buildPdf(blocks, { title: `${doc.product_name} · scripts`, footer: `${BRAND} · studio de scripts` });
}

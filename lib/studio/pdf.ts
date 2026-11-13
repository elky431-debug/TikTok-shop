/**
 * Petit générateur de PDF (texte seul), sans dépendance : A4, polices standard Helvetica et Helvetica-Bold
 * (présentes dans toutes les visionneuses, rien à embarquer), encodage WinAnsi (accents français, allemands, italiens et
 * espagnols, guillemets, tirets, €), retour à la ligne calculé avec les largeurs officielles des polices, pages
 * numérotées. Fichier 100 % ASCII (caractères accentués en octal), donc table des positions (xref) exacte.
 *
 * Choisi plutôt que `window.print()` : un vrai fichier .pdf, identique sur téléphone et ordinateur (Safari sur iPhone
 * cache l'enregistrement en PDF), sans dépendre de la mise en page de l'appli ; et plutôt qu'une bibliothèque (pdf-lib,
 * pdfkit) : 250 lignes testées suffisent pour du texte.
 */

export interface PdfBlock {
  text: string;
  size?: number;
  bold?: boolean;
  color?: 'text' | 'muted' | 'accent';
  /** Espace avant le bloc, en points (ignoré en haut de page). */
  gapBefore?: number;
  indent?: number;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 70;
const MARGIN_BOTTOM = 64;

const COLORS = {
  text: '0.067 0.067 0.078',
  muted: '0.333 0.337 0.361',
  accent: '0.890 0.090 0.302',
};

// Largeurs (unités de 1/1000 de corps) des caractères 32 à 126, puis 128 à 255 (encodage WinAnsi), d'après les
// métriques AFM d'Adobe pour Helvetica et Helvetica-Bold.
const HELV_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
const HELV_BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];
// 128 à 159 (0 = non défini dans WinAnsi), puis 160 à 255.
const HELV_HIGH = [
  556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834,
  834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722,
  722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556,
  556, 556, 556, 500, 556, 500,
];
const HELV_BOLD_HIGH = [
  556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834,
  834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722,
  722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611,
  611, 611, 611, 556, 611, 556,
];

/** Caractères Unicode placés entre 128 et 159 par WinAnsi. */
const WIN_ANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

const SUBSTITUTES: Record<string, string> = { '→': '->', '←': '<-', '≈': '~', '★': '*', '✓': '', '⬇': '', '↓': '' };

/** Texte → octets WinAnsi. Espaces fines → espace insécable ; lettres hors WinAnsi → sans accent ; reste (émojis) retiré. */
export function toWinAnsi(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code === 0x202f || code === 0x2009 || code === 0x00a0) bytes.push(0xa0);
    else if (code === 0x09 || code === 0x0a || code === 0x0d) bytes.push(0x20);
    else if (code >= 0x20 && code < 0x7f) bytes.push(code);
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
    else if (WIN_ANSI_EXTRA[code]) bytes.push(WIN_ANSI_EXTRA[code]);
    else if (ch in SUBSTITUTES) bytes.push(...[...SUBSTITUTES[ch]].map((c) => c.charCodeAt(0)));
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (base && base !== ch && [...base].every((c) => c.charCodeAt(0) < 0x7f)) bytes.push(...[...base].map((c) => c.charCodeAt(0)));
      // Autres caractères (émojis, symboles) : retirés.
    }
  }
  return bytes;
}

function charWidth(byte: number, bold: boolean): number {
  if (byte >= 32 && byte <= 126) return (bold ? HELV_BOLD_ASCII : HELV_ASCII)[byte - 32];
  if (byte >= 128) return (bold ? HELV_BOLD_HIGH : HELV_HIGH)[byte - 128] || 556;
  return 556;
}

export function textWidth(bytes: number[], size: number, bold = false): number {
  return (bytes.reduce((sum, b) => sum + charWidth(b, bold), 0) * size) / 1000;
}

/** Coupe un texte en lignes qui tiennent dans `maxWidth` (mots entiers ; un mot trop long est coupé). */
export function wrapText(text: string, size: number, bold: boolean, maxWidth: number): number[][] {
  const lines: number[][] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/ +/).filter(Boolean).map(toWinAnsi);
    let line: number[] = [];
    for (let word of words) {
      const candidate = line.length ? [...line, 0x20, ...word] : word;
      if (textWidth(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.length) lines.push(line);
      line = [];
      while (textWidth(word, size, bold) > maxWidth) {
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), size, bold) > maxWidth) cut--;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      line = word;
    }
    lines.push(line);
  }
  return lines;
}

/** Chaîne PDF littérale : parenthèses et barres obliques échappées, octets hors ASCII en octal. */
export function pdfString(bytes: number[]): string {
  let out = '(';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else out += `\\${b.toString(8).padStart(3, '0')}`;
  }
  return `${out})`;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function buildPdf(blocks: PdfBlock[], meta: { title: string; footer: string; date?: Date }): Uint8Array {
  // 1. Mise en page : des lignes positionnées, page par page.
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN_TOP;
  let atTop = true;
  for (const block of blocks) {
    const size = block.size ?? 11;
    const bold = Boolean(block.bold);
    const indent = block.indent ?? 0;
    const leading = size * 1.32;
    const lines = wrapText(block.text, size, bold, PAGE_W - 2 * MARGIN_X - indent);
    lines.forEach((line, i) => {
      const gap = i === 0 && !atTop ? (block.gapBefore ?? 0) : 0;
      if (y - gap - leading < MARGIN_BOTTOM) {
        pages.push([]);
        y = PAGE_H - MARGIN_TOP;
        atTop = true;
      }
      y -= (atTop ? 0 : gap) + leading;
      atTop = false;
      if (line.length) {
        pages[pages.length - 1].push(
          `BT /${bold ? 'F2' : 'F1'} ${fmt(size)} Tf ${COLORS[block.color ?? 'text']} rg ${fmt(MARGIN_X + indent)} ${fmt(y)} Td ${pdfString(line)} Tj ET`,
        );
      }
    });
  }

  // 2. Bandeau (filet cyan puis rose, comme le logo) et pied de page numéroté.
  const total = pages.length;
  const streams = pages.map((ops, i) =>
    [
      `0.145 0.957 0.933 rg ${fmt(MARGIN_X)} ${fmt(PAGE_H - 44)} 48 2.5 re f`,
      `0.890 0.090 0.302 rg ${fmt(MARGIN_X + 48)} ${fmt(PAGE_H - 44)} 48 2.5 re f`,
      ...ops,
      `BT /F1 8 Tf ${COLORS.muted} rg ${fmt(MARGIN_X)} 36 Td ${pdfString(toWinAnsi(`${meta.footer} · page ${i + 1}/${total}`))} Tj ET`,
    ].join('\n'),
  );

  // 3. Objets PDF et table des positions.
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${total} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const d = meta.date ?? new Date();
  const stamp = d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  objects[5] = `<< /Title ${pdfString(toWinAnsi(meta.title))} /Producer ${pdfString(toWinAnsi(meta.footer))} /CreationDate (D:${stamp}Z) >>`;
  streams.forEach((stream, i) => {
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(PAGE_W)} ${fmt(PAGE_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Tous les caractères sont < 256 : en latin1, un caractère = un octet, donc les positions calculées sont exactes.
  return Uint8Array.from(Buffer.from(out, 'latin1'));
}

/**
 * Accents abîmés par la source : dans certaines descriptions, « à » arrive en « ￠ » (U+00E0 devenu U+FFE0), « é » en
 * « ￩ »… On remet U+FFA0–U+FFFC à leur place latine (U+00A0–U+00FC), ce qui ne touche aucun texte français correct.
 */
export function repairAccents(text: string): string {
  return text.replace(/[\uFFA0-\uFFFC]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff00));
}

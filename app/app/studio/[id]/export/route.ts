import { relativeRedirect } from '@/lib/http/redirect';
import { NextResponse } from 'next/server';
import { isTranslationLang } from '@/lib/ai/formats';
import { getViewer } from '@/lib/auth/session';
import { BRAND_SLUG } from '@/lib/brand';
import { studioRights } from '@/lib/studio';
import { docScriptText, docToPdf, docToText } from '@/lib/studio/export';
import { getDoc } from '@/lib/studio/store';

/**
 * Export d'une génération : `format=pdf` (défaut) ou `txt`, `script=0..2` pour un seul script (sinon tout),
 * `langue=de|it|es` pour sa traduction. Plan Pro+ (droit `export`), vérifié côté serveur.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer) return relativeRedirect(`/connexion?suite=/app/studio/${params.id}`);
  if (!studioRights(viewer.profile.plan).export) {
    return NextResponse.json({ error: 'L’export en PDF et en texte est réservé au plan Pro+.' }, { status: 403 });
  }
  const doc = await getDoc(viewer.profile.id, params.id);
  if (!doc) return NextResponse.json({ error: 'Script introuvable.' }, { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'txt' ? 'txt' : 'pdf';
  const rawScript = url.searchParams.get('script');
  const index = rawScript === null ? null : Number(rawScript);
  if (index !== null && !(Number.isInteger(index) && index >= 0 && index < doc.scripts.length)) {
    return NextResponse.json({ error: 'Script introuvable dans cette génération.' }, { status: 404 });
  }
  const langParam = url.searchParams.get('langue');
  const lang = isTranslationLang(langParam) ? langParam : null;
  if (lang && (index === null || !doc.translations[index]?.[lang])) {
    return NextResponse.json({ error: 'Cette traduction n’existe pas encore.' }, { status: 404 });
  }

  const slug = doc.product_name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const name = `${BRAND_SLUG}-${slug || 'scripts'}${index !== null ? `-script-${index + 1}` : ''}${lang ? `-${lang}` : ''}`;

  if (format === 'txt') {
    const text = index === null ? docToText(doc) : docScriptText(doc, index, lang);
    return new NextResponse(text ?? '', {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${name}.txt"`,
        'cache-control': 'private, no-store',
      },
    });
  }
  const pdf = docToPdf(doc, { index, lang });
  if (!pdf) return NextResponse.json({ error: 'Script introuvable.' }, { status: 404 });
  return new NextResponse(pdf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${name}.pdf"`,
      'content-length': String(pdf.byteLength),
      'cache-control': 'private, no-store',
    },
  });
}

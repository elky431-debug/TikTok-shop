import { NextResponse } from 'next/server';
import { healthReport } from '@/lib/health';

export const dynamic = 'force-dynamic';

/** Santé du service : base, fournisseur de données, dernier rafraîchissement. Aucun secret dans la réponse. */
export async function GET() {
  const report = await healthReport();
  return NextResponse.json(report, {
    status: report.status === 'down' ? 503 : 200,
    headers: { 'cache-control': 'no-store' },
  });
}

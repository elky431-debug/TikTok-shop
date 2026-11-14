import { NextResponse } from 'next/server';
import { compareVerdict } from '@/lib/ai/compare-verdict';
import { getViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import { compareProducts, MIN_COMPARE, parseCompareIds, verdictKey } from '@/lib/radar/compare';
import { loadCompare } from '@/lib/radar/compare-data';
import { parisDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Verdicts écrits par compte et par jour (les verdicts déjà en cache ne comptent pas). */
const DAILY_VERDICTS = 30;

function reply(body: { sentence: string; simulated: boolean } | { error: string }, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
}

/** Verdict en une phrase pour les produits comparés : écrit une fois par groupe de produits et par jour de données. */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return reply({ error: 'Connecte-toi.' }, 401);
  if (!getPlan(viewer.profile.plan).compare) return reply({ error: 'Le comparateur est inclus dans Pro.' }, 403);
  const ids = parseCompareIds(new URL(request.url).searchParams.get('ids') ?? '');
  if (ids.length < MIN_COMPARE) return reply({ error: 'Choisis au moins 2 produits.' }, 400);

  const repo = getRepo();
  const { chosen, dataDate } = await loadCompare(repo, viewer.profile, ids);
  if (chosen.length < MIN_COMPARE) return reply({ error: 'Produits introuvables.' }, 404);
  const key = verdictKey(
    chosen.map((p) => p.id),
    dataDate,
  );
  const cached = (await repo.getProviderCache(key).catch(() => null)) as { sentence: string; simulated: boolean } | null;
  if (cached?.sentence) return reply(cached);

  const counter = `verdicts|${viewer.profile.id}|${parisDate()}`;
  const used = Number((await repo.getProviderCache(counter).catch(() => 0)) ?? 0) || 0;
  const comparison = compareProducts(chosen);
  if (used >= DAILY_VERDICTS) {
    const { simpleVerdict } = await import('@/lib/ai/compare-verdict');
    return reply({ sentence: simpleVerdict(chosen, comparison), simulated: true });
  }
  await repo.setProviderCache(counter, used + 1, new Date(Date.now() + 36 * 3_600_000).toISOString()).catch(() => undefined);
  const verdict = await compareVerdict(chosen, comparison).catch(() => null);
  if (!verdict) return reply({ error: 'Verdict indisponible pour le moment.' }, 503);
  if (!verdict.simulated) await repo.setProviderCache(key, verdict, new Date(Date.now() + 24 * 3_600_000).toISOString()).catch(() => undefined);
  return reply(verdict);
}

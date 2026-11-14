import type { Metadata } from 'next';
import { Radar, Star } from 'lucide-react';
import { PlanGate } from '@/components/app/plan-gate';
import { FaceOff, type FaceProduct, type FaceRow } from '@/components/compare/face-off';
import { LinkButton } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/surface';
import { formatValue } from '@/lib/ai/compare-verdict';
import { requireOnboardedViewer } from '@/lib/auth/session';
import { getRepo } from '@/lib/db';
import { getPlan } from '@/lib/plans';
import type { ProductView } from '@/lib/radar';
import { compareProducts, parseCompareIds, type CriterionResult } from '@/lib/radar/compare';
import { loadCompare } from '@/lib/radar/compare-data';
import { formatCompact, formatEuros, formatGrowth } from '@/lib/utils';

export const metadata: Metadata = { title: 'Comparer' };

function display(row: CriterionResult, value: number | null): string {
  if (value === null) return '—';
  switch (row.id) {
    case 'per_sale':
      return formatEuros(value);
    case 'growth':
      return formatGrowth(value);
    case 'sales_7d':
    case 'sales_30d':
    case 'affiliates':
      return formatCompact(value);
    case 'rating':
      return `★ ${String(value).replace('.', ',')}`;
    default:
      return formatValue(row.id, value);
  }
}

const toFace = (p: ProductView): FaceProduct => ({
  id: p.id,
  name: p.name,
  image: p.image_url,
  fallback: p.image_fallback,
  score: p.score,
  scoreLocked: p.score === null,
  priceCents: p.price_cents,
  favorite: Boolean(p.favorite),
});

export default async function ComparePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { profile } = await requireOnboardedViewer('/app/comparer');
  if (!getPlan(profile.plan).compare) {
    return (
      <div>
        <PageHeader eyebrow="Trouver" title="Comparer" description="Deux produits face à face, pour choisir celui de tes prochaines vidéos." />
        <PlanGate plan="pro" title="Deux produits face à face">
          Score, gain par vente, ventes, concurrence : le gagnant de chaque critère, et un verdict.
        </PlanGate>
      </div>
    );
  }

  const requested = parseCompareIds(searchParams.ids);
  const { chosen, candidates } = await loadCompare(getRepo(), profile, requested);
  const comparison = compareProducts(chosen);
  const rows: FaceRow[] = comparison.rows.map((row) => ({ ...row, display: row.values.map((v) => display(row, v)) }));

  return (
    <div>
      <PageHeader eyebrow="Trouver" title="Comparer" description="Deux produits face à face, pour choisir celui de tes prochaines vidéos." />
      {candidates.length < 2 ? (
        <EmptyState
          icon={<Star className="h-5 w-5" />}
          title="Mets au moins 2 produits en favori"
          action={
            <LinkButton href="/app/radar" arrow>
              <Radar className="h-4 w-4" aria-hidden="true" />
              Ouvrir le radar
            </LinkButton>
          }
        />
      ) : (
        <FaceOff products={chosen.map(toFace)} rows={rows} winner={comparison.winner} wins={comparison.wins} candidates={candidates.map(toFace)} />
      )}
    </div>
  );
}

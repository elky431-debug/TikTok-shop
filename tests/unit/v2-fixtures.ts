import type { LocalRepo } from '@/lib/db/local';
import type { PlanId, Product } from '@/lib/db/types';

/** Produit complet pour les tests des blocs V2 (catalogue du jour : même relevé, même heure). */
export function makeProduct(overrides: Partial<Product> & Pick<Product, 'id'>): Product {
  return {
    provider: 'nexscope',
    name: `Produit ${overrides.id}`,
    niche: 'beaute',
    description: '',
    shop_name: 'Boutique',
    price_cents: 2500,
    commission_rate: 0.15,
    active_affiliates: 40,
    image_url: '',
    top_videos: [],
    videos_fetched_at: null,
    details: null,
    region: 'FR',
    snapshot_date: '2026-11-12',
    latest_score: 50,
    latest_breakdown: { total: 50, parts: [], growth_7d: 0.1, daily_sales_7d: 10, summary: '' },
    trend: 'monte',
    growth_7d: 0.1,
    sales_30d: [],
    updated_at: '2026-11-12T03:00:00.000Z',
    ...overrides,
  };
}

/** Profil prêt (inscription terminée) avec le plan voulu. */
export async function makeUser(repo: LocalRepo, id: string, plan: PlanId = 'pro', extra: Parameters<LocalRepo['updateProfile']>[1] = {}) {
  await repo.ensureProfile({ id, email: `${id}@test.fr` });
  return repo.updateProfile(id, { plan, onboarded_at: '2026-11-01T10:00:00.000Z', ...extra });
}

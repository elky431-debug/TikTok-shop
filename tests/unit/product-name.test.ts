import { afterEach, describe, expect, it } from 'vitest';
import { labelProducts } from '@/lib/ai/product-labels';
import { setStructuredRunnerForTests } from '@/lib/ai/structured';
import { LocalRepo } from '@/lib/db/local';
import { displayName, heuristicShortName, shortLabel } from '@/lib/product-name';

afterEach(() => setStructuredRunnerForTests(null));

describe('noms courts des produits', () => {
  it('règle simple tant que l’IA n’a pas nommé le produit : avant le premier séparateur, 5 mots au plus', () => {
    expect(heuristicShortName('Solution Aspirateur Laveur Fleur de Coton - Compatible Toutes Marques - Nettoie, Parfume')).toBe(
      'Solution Aspirateur Laveur Fleur de',
    );
    expect(heuristicShortName('[PROMO] SÉRUM ÉCLAT VITAMINE C | 30 ml')).toBe('Sérum éclat vitamine c');
    expect(heuristicShortName('Ayat 50ml')).toBe('Ayat 50ml');
  });

  it('le nom court de l’IA passe avant la règle ; les anciens noms enregistrés longs sont raccourcis', () => {
    expect(displayName({ name: 'Solution Aspirateur Laveur Fleur de Coton - Compatible', short_name: 'Solution aspirateur fleur de coton' })).toBe(
      'Solution aspirateur fleur de coton',
    );
    expect(displayName({ name: 'Calendrier de l’Avent beauté 24 surprises - Coffret cadeau Noël', short_name: null })).toBe(
      'Calendrier de l’Avent beauté 24',
    );
    expect(shortLabel('Gourde isotherme')).toBe('Gourde isotherme');
    expect(shortLabel('Solution Aspirateur Laveur Fleur de Coton - Compatible Toutes Marques - Nettoie')).toBe('Solution Aspirateur Laveur Fleur de');
  });

  it('l’IA nomme par lots et corrige la niche ; un produit oublié garde la règle simple et sa niche', async () => {
    setStructuredRunnerForTests(async () => ({
      produits: [{ id: 'a', nom_court: '« Calendrier de l’Avent beauté ».', niche: 'maison' }],
    }) as never);
    const { labels } = await labelProducts([
      { id: 'a', name: 'Calendrier de l’Avent 24 jours - Coffret', description: 'Catégorie TikTok Shop : Phones & Electronics', niche: 'tech' },
      { id: 'b', name: 'Coque iPhone 15 transparente - antichoc', description: '', niche: 'tech' },
    ]);
    expect(labels).toEqual([
      { id: 'a', short_name: 'Calendrier de l’Avent beauté', niche: 'maison' },
      { id: 'b', short_name: 'Coque iPhone 15 transparente', niche: 'tech' },
    ]);
  });

  it('en base locale : nom court et niche vérifiée enregistrés, gardés par le relevé suivant', async () => {
    const repo = new LocalRepo(null);
    const base = {
      provider: 'mock', description: '', shop_name: '', price_cents: 1999, commission_rate: 0.1, active_affiliates: 1, image_url: '',
      top_videos: [], videos_fetched_at: null, details: null, snapshot_date: null, latest_score: 50, latest_breakdown: null,
      trend: 'stable' as const, growth_7d: 0, sales_30d: [], updated_at: new Date().toISOString(),
    };
    await repo.upsertProducts([{ ...base, id: 'p1', name: 'Calendrier de l’Avent 24 jours - Coffret', niche: 'tech' }]);
    await repo.updateProductLabels([{ id: 'p1', short_name: 'Calendrier de l’Avent', niche: 'maison' }]);
    const [p] = await repo.getProducts(['p1']);
    expect(p).toMatchObject({ short_name: 'Calendrier de l’Avent', niche: 'maison', niche_checked: true });
    expect(displayName(p)).toBe('Calendrier de l’Avent');
  });
});

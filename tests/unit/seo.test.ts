import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import TendancesNichePage, { generateMetadata } from '@/app/(public)/tendances/[niche]/page';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { MockProvider } from '@/lib/data/mock';
import { setRepoForTests } from '@/lib/db';
import { LocalRepo } from '@/lib/db/local';
import { refreshCatalog } from '@/lib/jobs/refresh';
import {
  getVeilleSelection,
  itemListJsonLd,
  jsonLdScript,
  MIN_PRODUCTS_PER_NICHE,
  nicheEntries,
  publishedNiches,
  veilleCacheKey,
} from '@/lib/tendances';

/**
 * Pages publiques /tendances : relevé de la veille, seulement de vrais produits, seuil par catégorie, plan du site,
 * métadonnées et données structurées. Les produits fictifs sont « rendus réels » ici en changeant leur source.
 */
const DAY = '2026-11-12';
let repo: LocalRepo;

async function makeReal(opts: { keepInBebe?: number } = {}) {
  const products = await repo.listProducts();
  let bebe = 0;
  const real = products.filter((p) => p.niche !== 'bebe' || bebe++ < (opts.keepInBebe ?? Infinity));
  await repo.upsertProducts(real.map((p) => ({ ...p, provider: 'nexscope' })));
}

beforeEach(async () => {
  repo = new LocalRepo(null);
  setRepoForTests(repo);
  await refreshCatalog({ repo, provider: new MockProvider(), date: DAY, backfillDays: 2 });
});
afterAll(() => setRepoForTests(null));

describe('sélection de la veille', () => {
  it('jamais de produits fictifs présentés comme réels : base fictive ⇒ rien de publié', async () => {
    const selection = await getVeilleSelection(repo, new Date(`${DAY}T10:00:00Z`));
    expect(selection).toMatchObject({ demo: true, products: [] });
    expect(publishedNiches(selection)).toEqual([]);
    const demo = await getVeilleSelection(repo, new Date(`${DAY}T10:00:00Z`), { includeDemo: true });
    expect(demo.date).toBe('2026-11-11');
    expect(publishedNiches(demo)).toEqual([]);
  });

  it('relevé du jour fait : classe les produits par le score de la veille (instantanés), une fois par jour', async () => {
    await makeReal();
    const now = new Date(`${DAY}T10:00:00Z`);
    const selection = await getVeilleSelection(repo, now);
    expect(selection.date).toBe('2026-11-11');
    expect(selection.demo).toBe(false);
    const first = selection.products[0];
    const [snapshot] = (await repo.getProductSnapshots(first.id, 8)).filter((s) => s.date === '2026-11-11');
    expect(first.rank_value).toBe(snapshot.score);
    expect(selection.products.map((p) => p.rank_value)).toEqual([...selection.products.map((p) => p.rank_value)].sort((a, b) => b - a));
    expect(await repo.getProviderCache(veilleCacheKey(DAY, false))).toEqual(selection);
  });

  it('relevé du jour pas encore fait : le catalogue affiché est déjà celui de la veille', async () => {
    await makeReal();
    const selection = await getVeilleSelection(repo, new Date('2026-11-13T05:00:00Z'));
    expect(selection.date).toBe(DAY);
  });

  it(`une catégorie sous ${MIN_PRODUCTS_PER_NICHE} vrais produits n’est ni publiée ni dans le plan du site`, async () => {
    await makeReal({ keepInBebe: MIN_PRODUCTS_PER_NICHE - 1 });
    const selection = await getVeilleSelection(repo, new Date(`${DAY}T10:00:00Z`));
    const niches = publishedNiches(selection).map((n) => n.id);
    expect(niches).not.toContain('bebe');
    expect(niches).toContain('beaute');
    expect(nicheEntries(selection, 'beaute').length).toBeLessThanOrEqual(12);
  });
});

describe('plan du site et robots', () => {
  it('liste /tendances et les seules catégories publiées ; rien en base fictive', async () => {
    const before = (await sitemap()).map((e) => e.url);
    expect(before.some((u) => u.includes('/tendances'))).toBe(false);
    await makeReal({ keepInBebe: 2 });
    const urls = (await sitemap()).map((e) => e.url.replace(/^https?:\/\/[^/]+/, ''));
    expect(urls).toContain('/tendances');
    expect(urls).toContain('/tendances/beaute');
    expect(urls).not.toContain('/tendances/bebe');
    expect(urls.filter((u) => u.startsWith('/f/'))).toEqual([]);
    expect(new Set(urls).size).toBe(urls.length);
    const rules = robots().rules as { disallow: string[] };
    expect(rules.disallow).toEqual(expect.arrayContaining(['/app', '/admin', '/r/']));
  });
});

describe('page de catégorie', () => {
  it('sans score ni script, avec un appel à s’inscrire, des métadonnées et une ItemList schema.org', async () => {
    await makeReal({ keepInBebe: 2 });
    const html = renderToStaticMarkup(await TendancesNichePage({ params: { niche: 'beaute' } }));
    expect(html).toContain('Produits tendance');
    expect(html).toContain('href="/connexion"');
    expect(html).not.toContain('/100');
    expect(html).not.toContain('/app/produit/');
    const json = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]);
    expect(json).toMatchObject({ '@context': 'https://schema.org', '@type': 'ItemList' });
    expect(json.itemListElement[0]).toMatchObject({ '@type': 'ListItem', position: 1 });
    const meta = await generateMetadata({ params: { niche: 'beaute' } });
    expect(meta.title).toBe('Produits tendance TikTok Shop France : Beauté et soins');
    expect(meta.alternates?.canonical).toBe('/tendances/beaute');
    for (const niche of ['bebe', 'inconnue']) {
      await expect(TendancesNichePage({ params: { niche } })).rejects.toThrow(/NEXT_NOT_FOUND/);
    }
  });

  it('les données structurées ne peuvent pas fermer la balise script', () => {
    const data = itemListJsonLd({ name: 'x', url: 'https://x', entries: [{ name: '</script><b>' } as never] });
    expect(jsonLdScript(data)).not.toContain('</script>');
    expect(JSON.parse(jsonLdScript(data)).itemListElement[0].name).toBe('</script><b>');
  });
});

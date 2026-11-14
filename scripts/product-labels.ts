/**
 * Noms courts et niches vérifiées pour les produits déjà en base (une seule fois par produit ; le relevé de nuit fait
 * ensuite les nouveaux). Utilise la base et le fournisseur d'IA configurés (.env.local).
 *
 * Usage : npm run data:noms-courts             (produits sans nom court)
 *         npm run data:noms-courts -- --tous   (tous, pour refaire les noms)
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { getRepo } = await import('@/lib/db');
  const { isAiConfigured } = await import('@/lib/env');
  const { labelProducts } = await import('@/lib/ai/product-labels');
  if (!isAiConfigured()) throw new Error('Aucune clé d’IA : les noms courts resteraient simulés.');
  const repo = getRepo();
  const all = await repo.listProducts();
  const todo = process.argv.includes('--tous') ? all : all.filter((p) => !p.short_name);
  console.log(`${todo.length} produits à nommer sur ${all.length} (${repo.kind}).`);
  let changedNiche = 0;
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100);
    const { labels } = await labelProducts(batch.map((p) => ({ id: p.id, name: p.name, description: p.description, niche: p.niche })));
    await repo.updateProductLabels(labels);
    for (const l of labels) {
      const before = batch.find((p) => p.id === l.id);
      if (before && before.niche !== l.niche) {
        changedNiche++;
        console.log(`  niche : « ${l.short_name} » ${before.niche} → ${l.niche}`);
      }
    }
    console.log(`  ${Math.min(i + 100, todo.length)}/${todo.length}, ex. « ${labels[0]?.short_name ?? '—'} »`);
  }
  console.log(`✓ Terminé : ${todo.length} noms courts, ${changedNiche} niches corrigées.`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

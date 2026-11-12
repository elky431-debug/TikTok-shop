/**
 * Distribution des scores d'opportunité (pour recalibrer le score sur de vraies données).
 * Usage : npm run score:distribution            (base actuelle : locale ou Supabase)
 *         npm run score:distribution -- --jours 14
 * Lit les produits et les instantanés des N derniers jours (7 par défaut) ; n'écrit rien.
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { getRepo } = await import('@/lib/db');
  const { summarize } = await import('@/lib/analysis/score-distribution');
  const index = process.argv.indexOf('--jours');
  const days = index > 0 ? Number(process.argv[index + 1]) || 7 : 7;
  const repo = getRepo();
  const products = await repo.listProducts();
  const snapshots = (await Promise.all(products.map((p) => repo.getProductSnapshots(p.id, days)))).flat();
  console.log(JSON.stringify(summarize(products, snapshots), null, 2));
}

main().catch((error) => {
  console.error('Échec :', error instanceof Error ? error.message : error);
  process.exit(1);
});

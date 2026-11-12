/**
 * Remplit le catalogue, puis prépare les récaps.
 * - Fournisseur fictif (DATA_PROVIDER=mock, par défaut) : 30 jours d'historique fictif.
 * - Fournisseur réel (tiktok ou nexscope) : un vrai rafraîchissement du jour, sans aucune donnée fictive,
 *   pour qu'une base de production ne contienne jamais de produits inventés.
 * Usage : npm run seed                 (base locale ou Supabase selon .env.local)
 *         npm run seed -- --sans-demo  (en local : sans les comptes de démonstration)
 *         npm run seed -- --fictif     (force les données fictives, même avec un fournisseur réel)
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { getRepo } = await import('@/lib/db');
  const { runNightly } = await import('@/lib/jobs/nightly');
  const { MockProvider } = await import('@/lib/data/mock');
  const { seedDemoAccounts } = await import('@/lib/jobs/demo');
  const repo = getRepo();
  console.log(`Base : ${repo.kind === 'local' ? 'fichier local (.data/)' : 'Supabase'}`);

  if (repo.kind === 'local' && !process.argv.includes('--sans-demo')) {
    const demo = await seedDemoAccounts(repo);
    console.log(`✓ Comptes de démonstration : ${demo.join(', ')}`);
  }

  const { env } = await import('@/lib/env');
  const started = Date.now();
  const real = env.dataProvider !== 'mock' && !process.argv.includes('--fictif');
  console.log(`Fournisseur : ${real ? env.dataProvider : 'données fictives (mock)'}`);
  const result = real
    ? await runNightly({ trigger: 'seed', repo })
    : await runNightly({ trigger: 'seed', repo, backfillDays: 30, provider: new MockProvider() });
  console.log(
    `✓ ${result.refresh.products} produits, ${result.refresh.snapshots} instantanés sur 30 jours, ` +
      `${result.digests.prepared} récaps préparés (${Date.now() - started} ms)`,
  );
}

main().catch((error) => {
  console.error('Échec du seed :', error instanceof Error ? error.message : error);
  process.exit(1);
});

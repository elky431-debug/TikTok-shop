/**
 * Remplit la base avec 30 jours d'historique fictif (fournisseur mock), puis prépare les récaps.
 * Usage : npm run seed                 (base locale ou Supabase selon .env.local)
 *         npm run seed -- --sans-demo  (en local : sans les comptes de démonstration)
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

  const started = Date.now();
  // Le seed utilise toujours les données fictives, quel que soit DATA_PROVIDER.
  const result = await runNightly({ trigger: 'seed', repo, backfillDays: 30, provider: new MockProvider() });
  console.log(
    `✓ ${result.refresh.products} produits, ${result.refresh.snapshots} instantanés sur 30 jours, ` +
      `${result.digests.prepared} récaps préparés (${Date.now() - started} ms)`,
  );
}

main().catch((error) => {
  console.error('Échec du seed :', error instanceof Error ? error.message : error);
  process.exit(1);
});

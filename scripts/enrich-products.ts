/**
 * Complète les produits réels déjà en base, sans refaire le relevé du jour (utile après un déploiement, ou pour
 * vérifier la source) : ventes par période des produits à l'historique court (un appel par 100 produits), puis vidéos
 * des N meilleurs produits qui n'en ont pas de moins de 3 jours. Chaque appel compte dans le budget de la source.
 * Usage : npm run data:enrich -- --videos 3
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { getRepo } = await import('@/lib/db');
  const { createProvider } = await import('@/lib/data');
  const { MIN_DAYS_FOR_CURVE, videosAreFresh } = await import('@/lib/jobs/refresh');
  const { parisDate } = await import('@/lib/utils');
  const arg = process.argv.indexOf('--videos');
  const videoCount = arg > -1 ? Math.max(0, Number(process.argv[arg + 1]) || 0) : 3;
  const repo = getRepo();
  const products = (await repo.listProducts()).filter((p) => p.provider === 'nexscope');
  if (!products.length) throw new Error('aucun produit Nexscope en base : lance d’abord « npm run seed » avec la vraie source.');
  const provider = createProvider('nexscope');
  const today = parisDate();

  const { env } = await import('@/lib/env');
  const short = [];
  // listProducts est trié par score : les mieux notés d'abord, dans la limite de la nuit.
  for (const p of products.slice(0, env.nexscopeMaxDetailProductsPerNight)) {
    const snapshots = await repo.getProductSnapshots(p.id, 30);
    if (snapshots.filter((s) => s.estimated_sales !== null).length < MIN_DAYS_FOR_CURVE) short.push(p);
  }
  const details = short.length && provider.fetchProductDetails ? await provider.fetchProductDetails(short.map((p) => p.id), today) : new Map();
  await repo.upsertProducts(short.filter((p) => details.has(p.id)).map((p) => ({ ...p, details: details.get(p.id)! })));
  console.log(`✓ Ventes par période : ${details.size} produits sur ${short.length} à l’historique court`);

  const targets = products.filter((p) => !videosAreFresh(p.videos_fetched_at)).slice(0, videoCount);
  for (const p of targets) {
    const videos = await provider.fetchTopVideos(p.id);
    await repo.updateProductVideos(p.id, videos, new Date().toISOString());
    console.log(`✓ ${videos.length} vidéos pour « ${p.name.slice(0, 60)} »`);
  }
  const stats = provider.stats?.();
  if (stats) console.log(`Appels à la source : ${stats.calls} (cache : ${stats.cacheHits})`);
}

main().catch((error) => {
  console.error('✗', error instanceof Error ? error.message : error);
  process.exit(1);
});

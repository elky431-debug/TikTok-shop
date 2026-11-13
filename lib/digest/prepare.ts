import { generateMockScripts, quickHook } from '@/lib/ai/mock-scripts';
import { getLiveCatalog } from '@/lib/catalog';
import { getRepo, type Repo } from '@/lib/db';
import type { Product, Profile, RegionId } from '@/lib/db/types';
import { regionFor } from '@/lib/regions';
import { parisDate } from '@/lib/utils';
import { buildDigestContent, type DigestExtras } from './build';
import { buildPersonal, type PersonalDigestContent } from './personal';
import { getPlan } from '@/lib/plans';

/** Accroche et script du récap, générés une fois par produit et par nuit (cache), sans coût d'API. */
export function defaultDigestExtras(day: string): DigestExtras {
  const scripts = new Map<string, { title: string; lines: string[] }>();
  return {
    hookFor: async (product) => quickHook(product, day),
    scriptFor: async (product: Product, profile: Profile) => {
      const key = `${product.id}|${profile.video_style ?? ''}`;
      if (!scripts.has(key)) {
        const out = generateMockScripts({
          product,
          format: 'demo',
          style: profile.video_style,
          examplePhrase: null,
          firstName: null,
          topVideos: product.top_videos,
        });
        const script = out.scripts[0];
        scripts.set(key, { title: script.title, lines: script.shots.map((s) => s.voice) });
      }
      return scripts.get(key)!;
    },
  };
}

/** Étape 4 de la tâche nocturne : prépare le récap du matin de chaque utilisateur. */
export async function prepareDigests(
  day: string = parisDate(),
  repo: Repo = getRepo(),
  extras: DigestExtras = defaultDigestExtras(day),
): Promise<{ prepared: number; skipped?: string }> {
  const [profiles, catalog] = await Promise.all([repo.listOnboardedProfiles(), getLiveCatalog(repo)]);
  // Pas de récap « du matin » avec des données de plus de 36 heures : mieux vaut rien qu'un récap trompeur.
  if (catalog.stale) return { prepared: 0, skipped: 'données de plus de 36 heures' };
  // Chacun reçoit les produits de son pays (Elite hors France), si ce pays a un relevé frais ; sinon la France.
  const byRegion = new Map<RegionId, Product[]>([['FR', catalog.products]]);
  let prepared = 0;
  for (const profile of profiles) {
    // Sans abonnement, pas de récap du matin : rien à préparer.
    if (!getPlan(profile.plan).access) continue;
    const region = regionFor(profile);
    if (!byRegion.has(region)) {
      const other = await getLiveCatalog(repo, new Date(), region);
      byRegion.set(region, other.stale || !other.products.length ? catalog.products : other.products);
    }
    const base = await buildDigestContent(profile, byRegion.get(region)!, day, extras);
    // Alertes et baisses depuis la veille, défi du jour (plans de publication, produits suivis).
    const content: PersonalDigestContent = { ...base, personal: await buildPersonal(profile, base, day, repo) };
    const existing = await repo.getDigest(profile.id, day);
    await repo.upsertDigest({
      user_id: profile.id,
      day,
      content,
      email_status: existing?.email_status ?? (profile.digest_email ? 'pending' : 'skipped'),
      discord_status: existing?.discord_status ?? 'pending',
    });
    prepared++;
  }
  return { prepared };
}

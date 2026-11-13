import { generateSeries } from '@/lib/ai/series';
import { getRepo } from '@/lib/db';
import type { Profile, UserRecord } from '@/lib/db/types';
import { canAccessProduct } from '@/lib/radar';
import { createScripts, latestSettings } from '@/lib/studio';
import { aiFailure, StudioError } from './errors';
import { studioRights } from './limits';
import { leftToday, reserveToday } from './quota';
import { getDoc, listDocs } from './store';
import { activeStyle } from './style';
import { KIND_SERIES, type SeriesData, type StudioDocView } from './types';

/**
 * Séries de 20 vidéos (Pro : 3 par jour, Pro+ : 20). Le quota compte les séries créées depuis minuit ; une série
 * ne se supprime pas (sinon le quota se contournerait), elle reste dans la liste. Chaque angle s'écrit en un clic
 * (une génération du studio, comptée dans les scripts du jour).
 */

export async function seriesLeft(profile: Profile): Promise<number> {
  return leftToday(profile.id, KIND_SERIES, studioRights(profile.plan).seriesPerDay);
}

export async function listSeries(profile: Profile): Promise<Array<UserRecord<SeriesData>>> {
  return (await getRepo().listRecords<SeriesData>(profile.id, KIND_SERIES)).filter((r) => r.data.angles.length > 0);
}

export async function getSeries(profile: Profile, id: string): Promise<UserRecord<SeriesData> | null> {
  const record = await getRepo().getRecord<SeriesData>(profile.id, id);
  return record?.kind === KIND_SERIES && record.data.angles.length ? record : null;
}

export async function createSeries(profile: Profile, productId: string): Promise<UserRecord<SeriesData>> {
  const rights = studioRights(profile.plan);
  if (rights.seriesPerDay <= 0) throw new StudioError('plan', 'La série de 20 vidéos est disponible avec les plans Pro et Pro+.');
  const repo = getRepo();
  const product = await repo.getProduct(productId);
  if (!product) throw new StudioError('produit', 'Ce produit n’existe plus. Choisis-en un autre.');
  if (!(await canAccessProduct(profile, productId))) throw new StudioError('acces', 'Ce produit ne fait pas partie de ton catalogue.');

  const previousSeries = (await repo.listRecords<SeriesData>(profile.id, KIND_SERIES)).filter((r) => r.data.product_id === productId);
  const placeholder: SeriesData = { product_id: product.id, product_name: product.name, angles: [], simulated: false, duplicates_removed: 0, filled: 0 };
  const reserved = await reserveToday(profile.id, KIND_SERIES, rights.seriesPerDay, placeholder);
  if (!reserved) {
    throw new StudioError('quota', `Tu as créé tes ${rights.seriesPerDay} séries du jour. Ton compteur repart à zéro demain matin.`);
  }
  try {
    const result = await generateSeries(product, {
      previous: previousSeries.flatMap((s) => s.data.angles.map((a) => ({ title: a.title, hook: a.hook }))),
      style: await activeStyle(profile),
      seed: String(previousSeries.length),
    });
    return await repo.saveRecord<SeriesData>(
      profile.id,
      KIND_SERIES,
      {
        ...placeholder,
        angles: result.angles.map((a) => ({ ...a, doc_id: null })),
        simulated: result.simulated,
        duplicates_removed: result.duplicatesRemoved,
        filled: result.filled,
      },
      reserved.id,
    );
  } catch (error) {
    await repo.deleteRecord(profile.id, reserved.id);
    throw aiFailure(error, 'La série');
  }
}

/** Générations déjà écrites pour chaque angle d'une série (index → génération), d'après les fiches du studio. */
export async function writtenAngles(profile: Profile, seriesId: string): Promise<Map<number, StudioDocView>> {
  const docs = await listDocs(profile.id);
  const map = new Map<number, StudioDocView>();
  for (const doc of docs) if (doc.series?.id === seriesId && !map.has(doc.series.index)) map.set(doc.series.index, doc);
  return map;
}

/** Écrit les scripts d'un angle en un clic (ou rouvre ceux déjà écrits, sans reprendre de crédit). */
export async function writeFromAngle(profile: Profile, seriesId: string, index: number): Promise<StudioDocView> {
  const series = await getSeries(profile, seriesId);
  if (!series) throw new StudioError('produit', 'Cette série est introuvable.');
  const angle = series.data.angles[index];
  if (!angle) throw new StudioError('invalide', 'Cet angle n’existe pas.');
  const already = (await writtenAngles(profile, seriesId)).get(index) ?? (angle.doc_id ? await getDoc(profile.id, angle.doc_id) : null);
  if (already) return already;

  const base = await latestSettings(profile);
  const doc = await createScripts(profile, series.data.product_id, angle.format, {
    settings: { ...base, angle: angle.angle },
    series: { id: seriesId, index, angle },
  });
  // Relu juste avant d'écrire : un autre angle a pu être écrit entre-temps.
  const fresh = (await getSeries(profile, seriesId)) ?? series;
  await getRepo().saveRecord<SeriesData>(
    profile.id,
    KIND_SERIES,
    { ...fresh.data, angles: fresh.data.angles.map((a, i) => (i === index ? { ...a, doc_id: doc.id } : a)) },
    seriesId,
  );
  return doc;
}

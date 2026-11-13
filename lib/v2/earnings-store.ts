import type { Repo } from '@/lib/db';
import {
  attachProducts,
  CSV_MAPPING_KIND,
  earningKey,
  EARNINGS_GOAL_KIND,
  EARNINGS_KIND,
  MAX_IMPORT_ROWS,
  type CsvMapping,
  type EarningData,
  type EarningsGoal,
  type MappingSettings,
} from './earnings';

/** Accès serveur aux gains : import sans doublon, correspondance des colonnes mémorisée, objectif mensuel. */

export async function getMapping(repo: Repo, userId: string) {
  const [record] = await repo.listRecords<MappingSettings>(userId, CSV_MAPPING_KIND);
  return record ?? null;
}

export async function saveMapping(repo: Repo, userId: string, mapping: CsvMapping, headers: string[]) {
  const current = await getMapping(repo, userId);
  const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)) as CsvMapping;
  return repo.saveRecord<MappingSettings>(userId, CSV_MAPPING_KIND, { mapping: clean, headers: headers.slice(0, 50), updated_at: new Date().toISOString() }, current?.id);
}

export async function forgetMapping(repo: Repo, userId: string) {
  for (const record of await repo.listRecords(userId, CSV_MAPPING_KIND)) await repo.deleteRecord(userId, record.id);
}

/**
 * Enregistre les lignes importées, rattachées aux produits suivis reconnus par leur nom. Une ligne déjà importée
 * (même date, produit, vidéo et montant) n'est pas ajoutée une deuxième fois.
 */
export async function importEarnings(repo: Repo, userId: string, rows: EarningData[]): Promise<{ added: number; duplicates: number }> {
  const saved = await repo.listSavedProducts(userId);
  const products = await repo.getProducts(saved.map((s) => s.product_id));
  const existing = new Set(
    (await repo.listRecords<EarningData>(userId, EARNINGS_KIND)).filter((r) => r.data.source === 'import').map((r) => earningKey(r.data)),
  );
  let added = 0;
  let duplicates = 0;
  for (const row of attachProducts(rows.slice(0, MAX_IMPORT_ROWS), products)) {
    const key = earningKey(row);
    if (existing.has(key)) {
      duplicates++;
      continue;
    }
    existing.add(key);
    await repo.saveRecord(userId, EARNINGS_KIND, row);
    added++;
  }
  return { added, duplicates };
}

export async function getEarningsGoal(repo: Repo, userId: string): Promise<{ id: string | null; cents: number | null }> {
  const [record] = await repo.listRecords<EarningsGoal>(userId, EARNINGS_GOAL_KIND);
  return { id: record?.id ?? null, cents: record && record.data.monthly_cents > 0 ? record.data.monthly_cents : null };
}

/** Objectif mensuel (0 ou vide : objectif retiré). */
export async function setEarningsGoal(repo: Repo, userId: string, cents: number | null) {
  const current = await getEarningsGoal(repo, userId);
  if (!cents || cents <= 0) {
    if (current.id) await repo.deleteRecord(userId, current.id);
    return;
  }
  await repo.saveRecord<EarningsGoal>(userId, EARNINGS_GOAL_KIND, { monthly_cents: Math.min(cents, 100_000_000) }, current.id ?? undefined);
}

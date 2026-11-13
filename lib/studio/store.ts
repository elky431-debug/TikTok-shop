import { DEFAULT_SETTINGS, DURATIONS, isScriptFormat, type Duration } from '@/lib/ai/formats';
import { ensureCommercialMention } from '@/lib/ai/guard';
import { defaultBroll } from '@/lib/ai/mock-scripts';
import type { StudioScript } from '@/lib/ai/types';
import { getRepo, type Repo } from '@/lib/db';
import type { ScriptFormat, ScriptRecord, UserRecord } from '@/lib/db/types';
import { docToText } from './export';
import { KIND_DOC, type StudioDoc, type StudioDocView } from './types';

/**
 * Stockage des générations du studio : une fiche `studio_script` (source de vérité : retouches, traductions, notes)
 * + la ligne `scripts` d'origine (compteur de l'espace formateur, export de l'historique), dont le texte, les
 * accroches et le favori sont tenus à jour. Les générations d'avant la session 5 (ligne seule) sont reprises en fiche
 * à la première ouverture.
 */

export function toView(record: UserRecord<StudioDoc>): StudioDocView {
  return { ...record.data, id: record.id, created_at: record.created_at, updated_at: record.updated_at };
}

function nearestDuration(seconds: number): Duration {
  return DURATIONS.reduce((best, d) => (Math.abs(d - seconds) < Math.abs(best - seconds) ? d : best), DEFAULT_SETTINGS.duration);
}

/** Fiche reprise d'une ancienne ligne `scripts` (réglages inconnus : durée la plus proche, ton et angle par défaut). */
export function docFromLegacy(row: ScriptRecord, productName: string): StudioDoc {
  const scripts: StudioScript[] = row.script.map((s) => ensureCommercialMention({ ...s, broll: (s as Partial<StudioScript>).broll ?? defaultBroll(row.format) }));
  return {
    script_id: row.id,
    product_id: row.product_id,
    product_name: productName,
    format: isScriptFormat(row.format) ? row.format : 'demo',
    settings: { ...DEFAULT_SETTINGS, duration: nearestDuration(row.script[0]?.duration_seconds ?? 30) },
    hooks: row.hooks,
    scripts,
    previous: scripts.map(() => null),
    versions: scripts.map(() => 1),
    translations: scripts.map(() => ({})),
    ratings: scripts.map(() => null),
    saved: row.saved,
    source: row.source,
    personal_style: false,
    feedback_used: 0,
    series: null,
    regen_count: row.regen_count,
    edit_count: 0,
    simulated_edits: 0,
    generated_at: row.created_at,
    legacy: true,
  };
}

/** Enregistre une nouvelle génération : la ligne `scripts` (trace) puis la fiche. */
export async function insertDoc(userId: string, doc: Omit<StudioDoc, 'script_id'>, repo: Repo = getRepo()): Promise<StudioDocView> {
  const row = await repo.insertScript({
    user_id: userId,
    product_id: doc.product_id,
    // La base accepte les 8 formats (migration 20261115000410) ; le type ScriptFormat de lib/db/types.ts n'en liste que 5.
    format: doc.format,
    hooks: doc.hooks,
    script: doc.scripts,
    full_text: docToText({ ...doc, script_id: null }),
    source: doc.source,
    saved: doc.saved,
    regen_count: doc.regen_count,
  });
  try {
    return toView(await repo.saveRecord<StudioDoc>(userId, KIND_DOC, { ...doc, script_id: row.id }));
  } catch (error) {
    await repo.deleteScript(userId, row.id).catch(() => undefined);
    throw error;
  }
}

async function findDocByScriptId(userId: string, scriptId: string, repo: Repo): Promise<StudioDocView | null> {
  const records = await repo.listRecords<StudioDoc>(userId, KIND_DOC);
  const found = records.filter((r) => r.data.script_id === scriptId).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return found ? toView(found) : null;
}

/**
 * Une génération par son identifiant de fiche, ou par celui de son ancienne ligne `scripts` (liens d'avant la
 * session 5) : la fiche est alors retrouvée, ou créée. L'appelant redirige si `id` diffère.
 */
export async function getDoc(userId: string, id: string, repo: Repo = getRepo()): Promise<StudioDocView | null> {
  const record = await repo.getRecord<StudioDoc>(userId, id);
  if (record) return record.kind === KIND_DOC ? toView(record) : null;
  const row = await repo.getScript(userId, id);
  if (!row) return null;
  const existing = await findDocByScriptId(userId, row.id, repo);
  if (existing) return existing;
  const product = await repo.getProduct(row.product_id);
  return toView(await repo.saveRecord<StudioDoc>(userId, KIND_DOC, docFromLegacy(row, product?.name ?? 'Produit retiré')));
}

/** Enregistre les changements d'une génération et tient la ligne `scripts` à jour (texte, accroches, favori). */
export async function updateDoc(userId: string, view: StudioDocView, patch: Partial<StudioDoc>, repo: Repo = getRepo()): Promise<StudioDocView> {
  const { id, created_at: _c, updated_at: _u, ...current } = view;
  const next: StudioDoc = { ...current, ...patch };
  const saved = toView(await repo.saveRecord<StudioDoc>(userId, KIND_DOC, next, id));
  if (next.script_id) {
    try {
      await repo.updateScript(userId, next.script_id, {
        hooks: next.hooks,
        saved: next.saved,
        regen_count: next.regen_count,
        full_text: docToText(next),
      });
    } catch (error) {
      // La ligne a pu être supprimée à part : la fiche reste la référence.
      console.warn('[studio] ligne scripts non mise à jour', error instanceof Error ? error.message : error);
    }
  }
  return saved;
}

export async function deleteDoc(userId: string, view: StudioDocView, repo: Repo = getRepo()): Promise<void> {
  await repo.deleteRecord(userId, view.id);
  if (view.script_id) await repo.deleteScript(userId, view.script_id);
}

export interface HistoryItem {
  id: string;
  product_id: string;
  product_name: string;
  format: StudioDoc['format'];
  settings: StudioDoc['settings'] | null;
  saved: boolean;
  sold: boolean;
  /** Meilleure note donnée à un des 3 scripts. */
  stars: number | null;
  series: boolean;
  generated_at: string;
}

/**
 * Historique : les fiches, plus les anciennes lignes `scripts` pas encore reprises (leur lien mène à la reprise).
 * Trié de la plus récente à la plus ancienne génération.
 */
export async function listHistory(userId: string, repo: Repo = getRepo()): Promise<HistoryItem[]> {
  const [records, rows] = await Promise.all([repo.listRecords<StudioDoc>(userId, KIND_DOC), repo.listScripts(userId, { limit: 500 })]);
  const seen = new Set<string>();
  const items: HistoryItem[] = [];
  for (const r of [...records].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const d = r.data;
    if (d.script_id && seen.has(d.script_id)) continue;
    if (d.script_id) seen.add(d.script_id);
    const stars = d.ratings.reduce<number | null>((best, x) => (x?.stars && (best === null || x.stars > best) ? x.stars : best), null);
    items.push({
      id: r.id,
      product_id: d.product_id,
      product_name: d.product_name,
      format: d.format,
      settings: d.settings,
      saved: d.saved,
      sold: d.ratings.some((x) => x?.sold === 'oui'),
      stars,
      series: Boolean(d.series),
      generated_at: d.generated_at,
    });
  }
  const legacy = rows.filter((row) => !seen.has(row.id));
  if (legacy.length) {
    const names = new Map((await repo.getProducts([...new Set(legacy.map((l) => l.product_id))])).map((p) => [p.id, p.name]));
    for (const row of legacy) {
      items.push({
        id: row.id,
        product_id: row.product_id,
        product_name: names.get(row.product_id) ?? 'Produit retiré',
        format: isScriptFormat(row.format) ? row.format : 'demo',
        settings: null,
        saved: row.saved,
        sold: false,
        stars: null,
        series: false,
        generated_at: row.created_at,
      });
    }
  }
  return items.sort((a, b) => b.generated_at.localeCompare(a.generated_at));
}

/** Toutes les générations (fiches) d'un utilisateur, la plus récente d'abord. */
export async function listDocs(userId: string, repo: Repo = getRepo()): Promise<StudioDocView[]> {
  const records = await repo.listRecords<StudioDoc>(userId, KIND_DOC);
  return records.map(toView).sort((a, b) => b.generated_at.localeCompare(a.generated_at));
}

import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedRecords } from "./seed";
import { gameContentSchema, publishIssues } from "./validation";
import { summarizeRecord, type CatalogRecord, type CatalogSummary, type GameContent, type PublishedGame, type SourceIdentity } from "./types";
import { serverEnvironment } from "@/lib/server-environment";

export class RepositoryError extends Error {
  constructor(message: string, public readonly code: "configuration" | "conflict" | "not_found" | "validation" | "storage") { super(message); this.name = "RepositoryError"; }
}

export function storageMode(): "sqlite" | "supabase" {
  // Read server configuration at runtime, including in isolated production-build tests.
  const url = serverEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key = serverEnvironment("SUPABASE_SECRET_KEY");
  if (Boolean(url) !== Boolean(key)) throw new RepositoryError("Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY juntos; no se usará almacenamiento local como sustituto.", "configuration");
  if (url && key) {
    try { if (new URL(url).protocol !== "https:") throw new Error(); } catch { throw new RepositoryError("NEXT_PUBLIC_SUPABASE_URL debe ser una URL HTTPS válida.", "configuration"); }
    return "supabase";
  }
  if (process.env.NODE_ENV === "production" && process.env.GAMEZONE_LOCAL_MODE !== "1") throw new RepositoryError("Configura Supabase antes de publicar. SQLite en producción requiere GAMEZONE_LOCAL_MODE=1 para uso local.", "configuration");
  return "sqlite";
}

const databases = new Map<string, DatabaseSync>();
/** Close durable local connections for a clean shutdown or isolated test cleanup. */
export function closeCatalogConnections(): void { for (const db of databases.values()) db.close(); databases.clear(); }
function database(): DatabaseSync {
  const path = resolve(/* turbopackIgnore: true */ process.env.GAMEZONE_DATABASE_PATH || ".data/gamezone.db");
  const cached = databases.get(path);
  if (cached) return cached;
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS catalog_records (
      id TEXT PRIMARY KEY, record TEXT NOT NULL CHECK(json_valid(record)),
      draft_slug TEXT NOT NULL UNIQUE, source_key TEXT UNIQUE, locked_slug TEXT
    );
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    db.exec("BEGIN IMMEDIATE");
    if (!db.prepare("SELECT value FROM app_meta WHERE key='catalog_seeded'").get()) {
      const insert = db.prepare("INSERT OR IGNORE INTO catalog_records(id, record, draft_slug, source_key, locked_slug) VALUES(?,?,?,?,?)");
      for (const record of seedRecords) insert.run(record.id, JSON.stringify(record), record.draft.slug, sourceKey(record.source), record.published?.slug ?? null);
      db.prepare("INSERT INTO app_meta(key,value) VALUES('catalog_seeded','1')").run();
    }
    db.exec("COMMIT");
  } catch (error) { try { db.exec("ROLLBACK"); } catch { /* SQLite can automatically roll back I/O errors. */ } db.close(); throw error; }
  databases.set(path, db);
  return db;
}

function sourceKey(source: SourceIdentity | null | undefined): string | null { return source ? `${source.provider}:${source.id}` : null; }
function validateSource(source: SourceIdentity | null): void {
  if (!source) return;
  let sourceUrl: URL;
  try { sourceUrl = new URL(source.url); } catch { throw new RepositoryError("La URL de origen no es válida.", "validation"); }
  if (source.provider !== "pivigames" || !/^[a-zA-Z0-9_-]{1,160}$/.test(source.id) || source.url.length > 2048 || sourceUrl.origin !== "https://pivigames.blog" || sourceUrl.username || sourceUrl.password) throw new RepositoryError("La identidad de la fuente no es válida.", "validation");
}
function withLockedSlug(record: CatalogRecord, lockedSlug?: string | null): CatalogRecord { return { ...record, lockedSlug: lockedSlug === undefined ? record.lockedSlug ?? record.published?.slug ?? null : lockedSlug }; }
function decodeRow(row: unknown): CatalogRecord | null {
  if (!row) return null;
  const stored = row as { record: string; locked_slug?: string | null };
  return withLockedSlug(JSON.parse(stored.record) as CatalogRecord, stored.locked_slug);
}
type RemoteRow = { record: CatalogRecord; locked_slug?: string | null };
function sqliteError(error: unknown): never {
  if (error instanceof RepositoryError) throw error;
  if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new RepositoryError("Ya existe una publicación con ese slug o enlace de origen.", "conflict");
  throw new RepositoryError("No se pudo guardar el catálogo. Comprueba el almacenamiento del servidor.", "storage");
}

async function remote(path: string, init?: RequestInit): Promise<unknown> {
  const url = serverEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key = serverEnvironment("SUPABASE_SECRET_KEY")!;
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, ...(!key.startsWith("sb_secret_") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", ...init?.headers },
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
  } catch { throw new RepositoryError("No se pudo conectar con Supabase. Comprueba la conexión y la URL del proyecto.", "storage"); }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = data as { code?: string; message?: string } | null;
    if (failure?.message?.includes("revision_conflict")) throw new RepositoryError("Este borrador ha cambiado. Recarga antes de guardar para no sobrescribir cambios.", "conflict");
    if (failure?.message?.includes("record_not_found")) throw new RepositoryError("No se encontró la publicación.", "not_found");
    if (failure?.message?.includes("slug_locked")) throw new RepositoryError("El slug no puede cambiar después de publicar.", "validation");
    if (failure?.message?.includes("source_locked")) throw new RepositoryError("Esta publicación ya está vinculada a otro juego de origen.", "validation");
    if (failure?.code === "23505") throw new RepositoryError("Ya existe una publicación con ese slug o enlace de origen.", "conflict");
    throw new RepositoryError("No se pudo acceder al catálogo de Supabase. Comprueba las credenciales y aplica la migración editorial.", "storage");
  }
  return data;
}

export async function listRecords(): Promise<CatalogRecord[]> {
  if (storageMode() === "sqlite") return database().prepare("SELECT record, locked_slug FROM catalog_records ORDER BY json_extract(record,'$.updatedAt') DESC, id").all().map((row) => decodeRow(row)!);
  // PostgREST caps an unpaginated response at 1000 rows by default. Stable IDs
  // keep editorial updates from moving records between pages while reading.
  const pageSize = 200;
  const records: CatalogRecord[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ select: "record,locked_slug", order: "id.asc", limit: String(pageSize), offset: String(offset) });
    const rows = await remote(`catalog_records?${query}`);
    if (!Array.isArray(rows) || rows.length > pageSize) throw new RepositoryError("Supabase devolvió un catálogo no válido.", "storage");
    for (const value of rows) {
      const row = value as RemoteRow | null;
      if (!row || !row.record || typeof row.record.id !== "string" || typeof row.record.updatedAt !== "string" || !row.record.draft || seen.has(row.record.id)) throw new RepositoryError("Supabase devolvió un catálogo no válido.", "storage");
      seen.add(row.record.id);
      records.push(withLockedSlug(row.record, row.locked_slug));
    }
    if (rows.length < pageSize) break;
  }
  return records.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt) || first.id.localeCompare(second.id));
}

export async function listRecordSummaries(): Promise<CatalogSummary[]> { return (await listRecords()).map(summarizeRecord); }

export async function getRecord(id: string): Promise<CatalogRecord | null> {
  if (storageMode() === "sqlite") return decodeRow(database().prepare("SELECT record, locked_slug FROM catalog_records WHERE id=?").get(id));
  const query = new URLSearchParams({ select: "record,locked_slug", id: `eq.${id}`, limit: "1" });
  const rows = await remote(`catalog_records?${query}`) as RemoteRow[];
  return rows[0] ? withLockedSlug(rows[0].record, rows[0].locked_slug) : null;
}

export async function findBySource(provider: string, id: string): Promise<CatalogRecord | null> {
  if (storageMode() === "sqlite") return decodeRow(database().prepare("SELECT record, locked_slug FROM catalog_records WHERE source_key=?").get(`${provider}:${id}`));
  const query = new URLSearchParams({ select: "record,locked_slug", source_key: `eq.${provider}:${id}`, limit: "1" });
  const rows = await remote(`catalog_records?${query}`) as RemoteRow[];
  return rows[0] ? withLockedSlug(rows[0].record, rows[0].locked_slug) : null;
}

function publishedGame(record: CatalogRecord): PublishedGame | null {
  return record.published && record.publishedAt ? { ...record.published, id: record.id, publishedAt: record.publishedAt, updatedAt: record.publishedAt } : null;
}
export async function listPublishedGames(): Promise<PublishedGame[]> { return (await listRecords()).flatMap((record) => { const game = publishedGame(record); return game ? [game] : []; }); }
export async function getPublishedGame(slug: string): Promise<PublishedGame | null> { return (await listPublishedGames()).find((game) => game.slug === slug) ?? null; }

export async function createRecord(content: GameContent, source: SourceIdentity | null = null, lastImported: GameContent | null = null): Promise<CatalogRecord> {
  const draft = gameContentSchema.parse(content);
  const baseline = lastImported ? gameContentSchema.parse(lastImported) : null;
  validateSource(source);
  const now = new Date().toISOString();
  const record: CatalogRecord = { id: randomUUID(), draft, published: null, publishedAt: null, lockedSlug: null, source, lastImported: baseline, revision: 1, createdAt: now, updatedAt: now };
  if (storageMode() === "supabase") return await remote("rpc/catalog_create_record", { method: "POST", body: JSON.stringify({ p_record: record }) }) as CatalogRecord;
  try { database().prepare("INSERT INTO catalog_records(id,record,draft_slug,source_key,locked_slug) VALUES(?,?,?,?,NULL)").run(record.id, JSON.stringify(record), draft.slug, sourceKey(source)); } catch (error) { sqliteError(error); }
  return record;
}

export type RecordAction = "save" | "publish" | "unpublish";
async function mutateRecord(id: string, content: GameContent, expectedRevision: number, action: RecordAction, lastImported?: GameContent, source?: SourceIdentity | null): Promise<CatalogRecord> {
  const draft = gameContentSchema.parse(content);
  if (!["save", "publish", "unpublish"].includes(action)) throw new RepositoryError("La acción editorial no es válida.", "validation");
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new RepositoryError("La revisión del borrador no es válida.", "validation");
  if (action === "publish") {
    const issues = publishIssues(draft);
    if (issues.length) throw new RepositoryError(issues.join(" "), "validation");
  }
  const baseline = lastImported === undefined ? undefined : gameContentSchema.parse(lastImported);
  if (source !== undefined) validateSource(source);
  if (storageMode() === "supabase") return await remote("rpc/catalog_update_record", { method: "POST", body: JSON.stringify({ p_id: id, p_content: draft, p_expected_revision: expectedRevision, p_action: action, p_last_imported: baseline ?? null, p_update_baseline: baseline !== undefined, p_source: source ?? null, p_update_source: source !== undefined }) }) as CatalogRecord;
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT record, locked_slug FROM catalog_records WHERE id=?").get(id) as { record: string; locked_slug: string | null } | undefined;
    const previous = decodeRow(row);
    if (!previous) throw new RepositoryError("No se encontró la publicación.", "not_found");
    if (previous.revision !== expectedRevision) throw new RepositoryError("Este borrador ha cambiado. Recarga antes de guardar para no sobrescribir cambios.", "conflict");
    if (row?.locked_slug && draft.slug !== row.locked_slug) throw new RepositoryError("El slug no puede cambiar después de publicar.", "validation");
    if (previous.source && source !== undefined && sourceKey(previous.source) !== sourceKey(source)) throw new RepositoryError("Esta publicación ya está vinculada a otro juego de origen.", "validation");
    const nextSource = source === undefined ? previous.source : source;
    const lockedSlug = row?.locked_slug ?? (action === "publish" ? draft.slug : null);
    const now = new Date().toISOString();
    const record: CatalogRecord = { ...previous, draft, revision: previous.revision + 1, updatedAt: now,
      published: action === "publish" ? draft : action === "unpublish" ? null : previous.published,
      publishedAt: action === "publish" ? now : action === "unpublish" ? null : previous.publishedAt,
      lastImported: baseline ?? previous.lastImported, source: nextSource, lockedSlug };
    db.prepare("UPDATE catalog_records SET record=?,draft_slug=?,locked_slug=?,source_key=? WHERE id=?").run(JSON.stringify(record), draft.slug, lockedSlug, sourceKey(nextSource), id);
    db.exec("COMMIT");
    return record;
  } catch (error) { try { db.exec("ROLLBACK"); } catch { /* Preserve the original error after automatic rollback. */ } sqliteError(error); }
}
export async function updateRecord(id: string, content: GameContent, expectedRevision: number, action: RecordAction, lastImported?: GameContent, source?: SourceIdentity | null): Promise<CatalogRecord> { return mutateRecord(id, content, expectedRevision, action, lastImported, source); }
/** Update the importer baseline separately so three-way imports can preserve editorial changes. */
export async function updateImportedRecord(id: string, content: GameContent, lastImported: GameContent, expectedRevision: number): Promise<CatalogRecord> { return mutateRecord(id, content, expectedRevision, "save", lastImported); }

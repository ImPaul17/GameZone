import { createHash, randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { gameContentSchema } from "../../src/modules/catalog/validation.ts";

const MAX_ROWS = 500;
const MAX_PAYLOAD = 8 * 1024 * 1024;
const iso = z.string().datetime({ offset: true });
const uuid = z.string().uuid().regex(/^[a-f0-9-]{36}$/);
const nullableSlug = z.string().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable();
const sourceSchema = z.object({
  provider: z.literal("pivigames"), id: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
  url: z.string().max(2048).refine((value) => {
    try { const url = new URL(value); return url.origin === "https://pivigames.blog" && !url.username && !url.password; } catch { return false; }
  }),
}).strict().nullable();
const recordSchema = z.object({
  id: uuid, lockedSlug: nullableSlug, draft: gameContentSchema, published: gameContentSchema.nullable(),
  publishedAt: iso.nullable(), source: sourceSchema, lastImported: gameContentSchema.nullable(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), createdAt: iso, updatedAt: iso,
}).strict();

export class MigrationError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = "MigrationError"; }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function snapshotHash(rows) { return createHash("sha256").update(canonicalJson(rows)).digest("hex"); }

/** Validate both storage columns and the complete editorial snapshot without normalizing its text. */
export function validateSnapshotRows(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new MigrationError("validation", `La migración admite como máximo ${MAX_ROWS} fichas por operación.`);
  const ids = new Set(), slugs = new Set(), sources = new Set();
  for (const row of rows) {
    const result = recordSchema.safeParse(row.record);
    if (!result.success || canonicalJson(result.data) !== canonicalJson(row.record)) throw new MigrationError("validation", "Una ficha no cumple el esquema editorial. Corrige el origen antes de migrar; no se han normalizado ni descartado campos.");
    const record = row.record;
    const source = record.source ? `${record.source.provider}:${record.source.id}` : null;
    if (row.id !== record.id || row.draft_slug !== record.draft.slug || row.revision !== record.revision
      || row.source_key !== source || row.locked_slug !== record.lockedSlug || row.updated_at !== record.updatedAt
      || (row.locked_slug !== null && row.locked_slug !== row.draft_slug)
      || Boolean(record.published) !== Boolean(record.publishedAt)
      || (record.published && (record.published.slug !== row.locked_slug || row.locked_slug === null))
      || Date.parse(record.createdAt) > Date.parse(record.updatedAt)
      || (record.publishedAt && Date.parse(record.publishedAt) > Date.parse(record.updatedAt))) {
      throw new MigrationError("validation", "Las columnas de una ficha no coinciden con su identidad, revisión, publicación u origen.");
    }
    if (ids.has(row.id) || slugs.has(row.draft_slug) || (source !== null && sources.has(source))) throw new MigrationError("validation", "El origen contiene identidades, slugs o publicaciones de fuente duplicados.");
    ids.add(row.id); slugs.add(row.draft_slug); if (source !== null) sources.add(source);
  }
  if (Buffer.byteLength(JSON.stringify({ p_rows: rows }), "utf8") > MAX_PAYLOAD) throw new MigrationError("validation", "El snapshot supera el límite de 8 MiB. No se enviará una importación parcial.");
  return rows;
}

/** Opens an existing SQLite file read-only and reads one consistent WAL-aware snapshot. */
export async function captureSqliteSnapshot(filename) {
  const databasePath = resolve(filename);
  try { if (!(await stat(databasePath)).isFile()) throw new Error(); }
  catch { throw new MigrationError("configuration", "La base SQLite de origen no existe o no es un archivo. No se ha creado ni inicializado otra base."); }
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    database.exec("BEGIN");
    const rows = database.prepare("SELECT id, record, draft_slug, source_key, locked_slug FROM catalog_records ORDER BY id").all().map((row) => {
      const record = JSON.parse(row.record);
      // The durable column also preserves slug reservations after unpublishing an older record.
      record.lockedSlug = row.locked_slug;
      return { id: row.id, record, draft_slug: row.draft_slug, source_key: row.source_key,
        locked_slug: row.locked_slug, revision: record.revision, updated_at: record.updatedAt };
    });
    database.exec("COMMIT");
    validateSnapshotRows(rows);
    return { version: 1, databasePath, capturedAt: new Date().toISOString(), hash: snapshotHash(rows), rows };
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError("validation", "No se pudo leer un catálogo SQLite válido. El origen permanece intacto.");
  } finally { database?.close(); }
}

function sameRow(local, remote) {
  return local.id === remote.id && canonicalJson(local.record) === canonicalJson(remote.record)
    && local.draft_slug === remote.draft_slug && local.source_key === remote.source_key
    && local.locked_slug === remote.locked_slug && local.revision === remote.revision
    && Date.parse(local.updated_at) === Date.parse(remote.updated_at);
}

export function buildMigrationPlan(localRows, remoteRows) {
  validateSnapshotRows(localRows);
  const ids = new Map(remoteRows.map((row) => [row.id, row]));
  const slugs = new Map(remoteRows.map((row) => [row.draft_slug, row]));
  const sources = new Map(remoteRows.filter((row) => row.source_key !== null).map((row) => [row.source_key, row]));
  const insert = [], identical = [], conflicts = [];
  for (const row of localRows) {
    const existing = ids.get(row.id);
    const collision = slugs.get(row.draft_slug) ?? (row.source_key !== null ? sources.get(row.source_key) : undefined);
    if (existing) {
      if (sameRow(row, existing)) identical.push(row.id);
      else conflicts.push({ id: row.id, slug: row.draft_slug, reason: "same_id_different_snapshot" });
    } else if (collision) conflicts.push({ id: row.id, slug: row.draft_slug, reason: "slug_or_source_owned_by_another_id" });
    else insert.push(row.id);
  }
  return { insert, identical, conflicts };
}

export function createSupabaseMigrationClient({ url, key, fetchImpl = globalThis.fetch }) {
  let base;
  try {
    base = new URL(url);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/" || base.port) throw new Error();
  } catch { throw new MigrationError("configuration", "Configura una NEXT_PUBLIC_SUPABASE_URL HTTPS válida con la raíz del proyecto."); }
  if (typeof key !== "string" || !key || key.startsWith("sb_publishable_")) throw new MigrationError("configuration", "Falta una SUPABASE_SECRET_KEY privada con permisos service_role.");
  const headers = { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }), "Content-Type": "application/json" };
  async function request(path, body) {
    let response;
    try {
      response = await fetchImpl(`${base.origin}/rest/v1/${path}`, {
        method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
      });
    } catch { throw new MigrationError("remote", "No se ha podido confirmar la conexión con Supabase. Si se estaba aplicando, repite primero el dry-run antes de activar el almacenamiento remoto."); }
    let text = "";
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let size = 0;
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
      text = Buffer.concat(chunks).toString("utf8");
    } catch { throw new MigrationError("remote", "Supabase devolvió una respuesta incompleta o demasiado grande. No actives todavía el almacenamiento remoto."); }
    if (!response.ok) {
      if (text.includes("migration_conflict") || text.includes("23505")) throw new MigrationError("conflict", "Supabase detectó un conflicto concurrente. La RPC ha cancelado toda la importación sin sobrescribir registros.");
      if (response.status === 401 || response.status === 403) throw new MigrationError("configuration", "Supabase rechazó las credenciales o los permisos service_role.");
      throw new MigrationError("remote", "Supabase rechazó la operación. Aplica las dos migraciones SQL y comprueba el proyecto y sus permisos; no se muestra el cuerpo privado de la respuesta.");
    }
    try { return JSON.parse(text); } catch { throw new MigrationError("remote", "Supabase no devolvió JSON válido; no actives el almacenamiento remoto."); }
  }
  return {
    async listRows() {
      const rows = [];
      for (;;) {
        const query = new URLSearchParams({ select: "id,record,draft_slug,source_key,locked_slug,revision,updated_at", order: "id.asc", limit: "500", offset: String(rows.length) });
        const page = await request(`catalog_records?${query}`);
        if (!Array.isArray(page) || page.length > 500 || page.some((row) => !row || typeof row.id !== "string" || typeof row.draft_slug !== "string" || !row.record)) throw new MigrationError("remote", "El catálogo remoto tiene una estructura incompatible.");
        if (!page.length) return rows;
        rows.push(...page);
        if (rows.length > 10_000) throw new MigrationError("remote", "El catálogo remoto requiere una migración de mayor volumen. No se realizará una comparación parcial.");
      }
    },
    async importRows(rows) {
      validateSnapshotRows(rows);
      const result = await request("rpc/catalog_import_snapshots", { p_rows: rows });
      if (!result || !Number.isSafeInteger(result.inserted) || !Number.isSafeInteger(result.identical)
        || result.inserted < 0 || result.identical < 0 || result.total !== rows.length || result.inserted + result.identical !== result.total) throw new MigrationError("verification", "La respuesta de importación no permite confirmar el resultado. Repite el dry-run antes de activar Supabase.");
      return result;
    },
  };
}

/** Dry-run is the default. Apply calls exactly one all-or-nothing RPC and verifies the snapshots again. */
export async function migrateCatalog({ databasePath, client, apply = false, snapshotDirectory = ".data/migrations" }) {
  const snapshot = await captureSqliteSnapshot(databasePath);
  const remote = await client.listRows();
  const plan = buildMigrationPlan(snapshot.rows, remote);
  const summary = { mode: apply ? "apply" : "dry-run", total: snapshot.rows.length,
    insert: plan.insert.length, identical: plan.identical.length, conflicts: plan.conflicts,
    published: snapshot.rows.filter((row) => row.record.published !== null).length, hash: snapshot.hash };
  if (plan.conflicts.length) return { ...summary, blocked: true };
  if (!apply || !snapshot.rows.length) return { ...summary, blocked: false };

  const current = await captureSqliteSnapshot(databasePath);
  if (current.hash !== snapshot.hash) throw new MigrationError("source_changed", "SQLite cambió durante la preparación. Detén las escrituras locales y repite el dry-run; no se ha enviado la importación.");
  const directory = resolve(snapshotDirectory);
  const backupPath = join(directory, `${snapshot.capturedAt.replace(/[:.]/g, "-")}-${snapshot.hash.slice(0, 12)}-${randomUUID().slice(0, 8)}.json`);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(backupPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch { throw new MigrationError("backup", "No se pudo guardar la copia privada del snapshot. No se ha enviado la importación."); }
  const applied = await client.importRows(snapshot.rows);
  const verified = buildMigrationPlan(snapshot.rows, await client.listRows());
  if (verified.conflicts.length || verified.insert.length) throw new MigrationError("verification", "La RPC respondió, pero la lectura posterior no coincide con el snapshot. Conserva SQLite y la copia privada y no actives Supabase.");
  if ((await captureSqliteSnapshot(databasePath)).hash !== snapshot.hash) throw new MigrationError("source_changed", "SQLite cambió durante la transferencia. La copia remota puede haber quedado anterior a esos cambios; conserva el origen y no actives Supabase.");
  return { ...summary, blocked: false, applied, verified: true, backupPath };
}

import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { RepositoryError, storageMode } from "@/modules/catalog/repository";
import { serverEnvironment } from "@/lib/server-environment";
import { validateSourceUrl } from "./pivigames";
import type { BatchDetail, BatchItem, BatchSummary } from "./batch-types";

const itemSchema = z.object({ id: z.uuid(), url: z.string().max(2048), status: z.enum(["pending", "processing", "imported", "skipped", "failed"]), attempts: z.number().int().min(0).max(3), recordId: z.uuid().optional(), title: z.string().max(200).optional(), message: z.string().max(500).optional(), warnings: z.array(z.string().max(500)).max(20).optional() }).strict();
const batchSchema = z.object({ id: z.uuid(), status: z.enum(["queued", "running", "paused", "completed"]), total: z.number().int().min(1).max(1000), done: z.number().int().min(0).max(1000), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), retryAt: z.iso.datetime().optional(), items: z.array(itemSchema).min(1).max(1000) }).strict();
interface StoredBatch { revision: number; document: BatchDetail }
interface Lease { token?: string; retryAt: string }
const databases = new Map<string, DatabaseSync>();
const cooldown = 2000;
const leaseDuration = 120_000;

export function closeBatchConnections() { for (const db of databases.values()) db.close(); databases.clear(); }
function database(): DatabaseSync {
  const path = resolve(/* turbopackIgnore: true */ process.env.GAMEZONE_DATABASE_PATH || ".data/gamezone.db");
  const cached = databases.get(path); if (cached) return cached;
  mkdirSync(dirname(path), { recursive: true }); const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS import_batches(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)));
    CREATE TABLE IF NOT EXISTS import_batch_control(id INTEGER PRIMARY KEY CHECK(id=1), token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO import_batch_control(id) VALUES(1);`);
  databases.set(path, db); return db;
}

async function remote(path: string, init?: RequestInit): Promise<unknown> {
  const key = serverEnvironment("SUPABASE_SECRET_KEY")!;
  let response: Response;
  try {
    response = await fetch(`${serverEnvironment("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/${path}`, { ...init,
      headers: { apikey: key, ...(!key.startsWith("sb_secret_") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", ...init?.headers },
      cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch { throw new RepositoryError("No se pudo conectar con la cola de importación. El progreso guardado se conserva.", "storage"); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new RepositoryError("No se pudo acceder a la cola. Comprueba Supabase y aplica la migración import_batches.", "storage");
  return body;
}
function stored(value: unknown): StoredBatch {
  const row = z.object({ revision: z.number().int().positive(), document: batchSchema }).parse(value);
  if (row.document.total !== row.document.items.length) throw new RepositoryError("El lote guardado no es válido.", "storage");
  return row;
}
async function read(id: string): Promise<StoredBatch> {
  let row: unknown;
  if (storageMode() === "sqlite") {
    const result = database().prepare("SELECT revision, document FROM import_batches WHERE id=?").get(id) as { revision: number; document: string } | undefined;
    row = result ? { revision: result.revision, document: JSON.parse(result.document) } : undefined;
  } else {
    const rows = await remote(`import_batches?${new URLSearchParams({ id: `eq.${id}`, select: "revision,document", limit: "1" })}`) as unknown[]; row = rows[0];
  }
  if (!row) throw new RepositoryError("No se encontró el lote de importación.", "not_found");
  return stored(row);
}
function summarize(batch: BatchDetail): BatchSummary { const { id, status, total, done, createdAt, updatedAt } = batch; return { id, status, total, done, createdAt, updatedAt }; }
function updateCounts(batch: BatchDetail): BatchDetail {
  batch.done = batch.items.filter(item => ["imported", "skipped", "failed"].includes(item.status)).length;
  if (batch.retryAt && Date.parse(batch.retryAt) <= Date.now()) delete batch.retryAt;
  if (batch.done === batch.total && !batch.retryAt) batch.status = "completed";
  batch.updatedAt = new Date().toISOString(); return batch;
}
async function change(id: string, mutate: (batch: BatchDetail) => void): Promise<BatchDetail> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const previous = await read(id); const next = structuredClone(previous.document); mutate(next); updateCounts(next); batchSchema.parse(next);
    let changed = false;
    if (storageMode() === "sqlite") {
      changed = database().prepare("UPDATE import_batches SET revision=revision+1,document=? WHERE id=? AND revision=?").run(JSON.stringify(next), id, previous.revision).changes === 1;
    } else {
      const rows = await remote(`import_batches?${new URLSearchParams({ id: `eq.${id}`, revision: `eq.${previous.revision}`, select: "revision" })}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ revision: previous.revision + 1, document: next, updated_at: next.updatedAt }) }) as unknown[]; changed = rows.length === 1;
    }
    if (changed) return next;
  }
  throw new RepositoryError("El lote cambió en otra pestaña. Actualiza su estado y vuelve a intentarlo.", "conflict");
}

export function normalizedBatchURLs(values: string[]): string[] {
  if (!values.length || values.length > 1000) throw new RepositoryError("Introduce entre 1 y 1000 enlaces por lote.", "validation");
  return [...new Set(values.map(value => {
    try { return validateSourceUrl(value.trim()).href.replace(/\/$/, ""); }
    catch { throw new RepositoryError("Cada línea debe ser una publicación HTTPS de pivigames.blog, sin consultas ni fragmentos.", "validation"); }
  }))];
}
export async function createBatch(urls: string[]): Promise<BatchDetail> {
  const normalized = normalizedBatchURLs(urls); const now = new Date().toISOString();
  const batch: BatchDetail = { id: randomUUID(), status: "queued", total: normalized.length, done: 0, createdAt: now, updatedAt: now,
    items: normalized.map(url => ({ id: randomUUID(), url, status: "pending", attempts: 0 })) };
  if (storageMode() === "sqlite") database().prepare("INSERT INTO import_batches(id,revision,document) VALUES(?,1,?)").run(batch.id, JSON.stringify(batch));
  else await remote("import_batches", { method: "POST", body: JSON.stringify({ id: batch.id, revision: 1, document: batch, created_at: now, updated_at: now }) });
  return batch;
}
export async function getBatch(id: string): Promise<BatchDetail> { return (await read(id)).document; }
export async function listBatches(): Promise<BatchSummary[]> {
  if (storageMode() === "sqlite") return database().prepare("SELECT revision, document FROM import_batches ORDER BY json_extract(document,'$.createdAt') DESC LIMIT 50").all().map(row => summarize(stored({ ...row, document: JSON.parse((row as { document: string }).document) }).document));
  const rows = await remote("import_batches?select=id,status,total,done,created_at,updated_at&order=created_at.desc,id.asc&limit=50") as { id: string; status: BatchSummary["status"]; total: number; done: number; created_at: string; updated_at: string }[];
  return rows.map(row => ({ id: row.id, status: row.status, total: row.total, done: row.done, createdAt: row.created_at, updatedAt: row.updated_at }));
}
export async function changeBatchState(id: string, action: "pause" | "resume" | "retry"): Promise<BatchDetail> {
  return change(id, batch => {
    if (action === "pause") { if (batch.status !== "completed") batch.status = "paused"; return; }
    if (batch.retryAt && Date.parse(batch.retryAt) > Date.now()) throw new RepositoryError("La fuente ha pedido una pausa. Espera hasta la hora indicada antes de continuar o reintentar.", "conflict");
    if (action === "retry") {
      const retryable = batch.items.filter(item => item.status === "failed" && item.attempts < 3);
      if (!retryable.length) throw new RepositoryError("No quedan errores reintentables; cada enlace admite tres intentos.", "validation");
      for (const item of retryable) { item.status = "pending"; delete item.message; }
    }
    if (batch.items.some(item => item.status === "pending" || item.status === "processing")) batch.status = "queued";
  });
}
export async function pauseBatchForSource(id: string, waitMilliseconds: number): Promise<BatchDetail> {
  return change(id, batch => { batch.status = "paused"; batch.retryAt = new Date(Date.now() + Math.max(2000, Math.min(3600000, waitMilliseconds))).toISOString(); });
}

async function acquire(): Promise<Lease> {
  if (storageMode() === "supabase") return await remote("rpc/import_batch_acquire", { method: "POST", body: "{}" }) as Lease;
  const db = database(); db.exec("BEGIN IMMEDIATE");
  try {
    const now = Date.now(); const row = db.prepare("SELECT token, lease_until, next_at FROM import_batch_control WHERE id=1").get() as { token: string | null; lease_until: number; next_at: number };
    const retryAt = new Date(Math.max(row.lease_until, row.next_at, now + cooldown)).toISOString();
    if (row.lease_until > now || row.next_at > now) { db.exec("COMMIT"); return { retryAt }; }
    const token = randomUUID(); db.prepare("UPDATE import_batch_control SET token=?, lease_until=?, next_at=? WHERE id=1").run(token, now + leaseDuration, now + cooldown); db.exec("COMMIT"); return { token, retryAt: new Date(now + leaseDuration).toISOString() };
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
}
async function release(token: string, waitMilliseconds = cooldown): Promise<void> {
  const wait = Math.max(cooldown, Math.min(3600000, waitMilliseconds));
  if (storageMode() === "supabase") { await remote("rpc/import_batch_release", { method: "POST", body: JSON.stringify({ p_token: token, p_wait_seconds: Math.ceil(wait / 1000) }) }); return; }
  const now = Date.now(); database().prepare("UPDATE import_batch_control SET token=NULL,lease_until=0,next_at=? WHERE id=1 AND token=?").run(now + wait, token);
}
export interface BatchClaim { batch: BatchDetail; item?: BatchItem; token?: string }
export async function claimBatchItem(id: string): Promise<BatchClaim> {
  const initial = await getBatch(id);
  if (initial.status === "paused" || initial.status === "completed") return { batch: initial };
  const lease = await acquire(); if (!lease.token) return { batch: { ...initial, retryAt: lease.retryAt } };
  let item: BatchItem | undefined;
  try {
    const batch = await change(id, current => {
      item = undefined;
      if (current.status === "paused" || current.status === "completed") return;
      // An interrupted processing item is recovered only after its global lease expired.
      const pending = current.items.find(candidate => candidate.status === "processing") ?? current.items.find(candidate => candidate.status === "pending");
      if (!pending) return;
      if (pending.attempts >= 3) { pending.status = "failed"; pending.message = "Se alcanzó el máximo de tres intentos para esta publicación."; return; }
      pending.status = "processing"; pending.attempts++; current.status = "running"; item = structuredClone(pending);
    });
    if (!item) { await release(lease.token); return { batch }; }
    return { batch, item, token: lease.token };
  } catch (error) { await release(lease.token).catch(() => undefined); throw error; }
}
export async function finishBatchItem(id: string, itemId: string, token: string, expectedAttempt: number, result: Pick<BatchItem, "status" | "recordId" | "title" | "message" | "warnings">, waitMilliseconds = cooldown): Promise<BatchDetail> {
  try {
    const batch = await change(id, current => {
      const item = current.items.find(candidate => candidate.id === itemId);
      if (!item || item.status !== "processing" || item.attempts !== expectedAttempt) throw new RepositoryError("Este paso ya cambió. Actualiza el lote.", "conflict");
      Object.assign(item, result); if (current.status !== "paused") current.status = "queued";
    });
    return { ...batch, retryAt: batch.retryAt ?? new Date(Date.now() + waitMilliseconds).toISOString() };
  } finally { await release(token, waitMilliseconds).catch(() => undefined); }
}

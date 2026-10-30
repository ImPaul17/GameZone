import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serverEnvironment } from "@/lib/server-environment";
import { RepositoryError, storageMode } from "../catalog/repository";
import { newsContentSchema, newsPublishIssues } from "./validation";
import type { NewsContent, NewsRecord, PublishedNews } from "./types";

const databases = new Map<string, DatabaseSync>();
export function closeNewsConnections() { for (const database of databases.values()) database.close(); databases.clear(); }
function database() {
  const filename = resolve(/* turbopackIgnore: true */ process.env.GAMEZONE_DATABASE_PATH || ".data/gamezone.db");
  const previous = databases.get(filename);
  if (previous) return previous;
  mkdirSync(dirname(filename), { recursive: true });
  const connection = new DatabaseSync(filename);
  connection.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS news_records (
      id TEXT PRIMARY KEY, record TEXT NOT NULL CHECK(json_valid(record)),
      draft_slug TEXT NOT NULL UNIQUE, locked_slug TEXT
    );`);
  databases.set(filename, connection);
  return connection;
}
function decode(row: unknown): NewsRecord | null {
  if (!row) return null;
  const value = row as { record: string; locked_slug: string | null };
  return { ...JSON.parse(value.record) as NewsRecord, lockedSlug: value.locked_slug };
}
function sqliteError(error: unknown): never {
  if (error instanceof RepositoryError) throw error;
  if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new RepositoryError("Ya existe una noticia con ese slug.", "conflict");
  throw new RepositoryError("No se pudieron guardar las noticias. Comprueba el almacenamiento del servidor.", "storage");
}
async function remote(path: string, body?: unknown): Promise<unknown> {
  const key = serverEnvironment("SUPABASE_SECRET_KEY")!;
  let response: Response;
  try {
    response = await fetch(`${serverEnvironment("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/${path}`, {
      method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: key, ...(!key.startsWith("sb_secret_") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
  } catch { throw new RepositoryError("No se pudo conectar con las noticias de Supabase. El contenido guardado se conserva.", "storage"); }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = data as { code?: string; message?: string } | null;
    if (failure?.message?.includes("revision_conflict")) throw new RepositoryError("La noticia ha cambiado. Recarga antes de guardar para no sobrescribir cambios.", "conflict");
    if (failure?.message?.includes("record_not_found")) throw new RepositoryError("No se encontró la noticia.", "not_found");
    if (failure?.message?.includes("slug_locked")) throw new RepositoryError("El slug de una noticia publicada no puede cambiar.", "validation");
    if (failure?.code === "23505") throw new RepositoryError("Ya existe una noticia con ese slug.", "conflict");
    throw new RepositoryError("No se pudo acceder a las noticias de Supabase. Comprueba los permisos y aplica la migración 202610300003.", "storage");
  }
  return data;
}
function remoteRecord(value: NewsRecord & { locked_slug?: string | null }) { return { ...value, lockedSlug: value.lockedSlug ?? value.locked_slug ?? value.published?.slug ?? null }; }

export async function listNewsRecords(): Promise<NewsRecord[]> {
  if (storageMode() === "sqlite") return database().prepare("SELECT record,locked_slug FROM news_records ORDER BY json_extract(record,'$.updatedAt') DESC,id").all().map((row) => decode(row)!);
  const all: NewsRecord[] = [];
  for (;;) {
    const query = new URLSearchParams({ select: "record,locked_slug", order: "id.asc", limit: "100", offset: String(all.length) });
    const rows = await remote(`news_records?${query}`) as { record: NewsRecord; locked_slug: string | null }[];
    if (!Array.isArray(rows)) throw new RepositoryError("Supabase devolvió un catálogo de noticias incompatible.", "storage");
    if (!rows.length) return all.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
    all.push(...rows.map((row) => ({ ...row.record, lockedSlug: row.locked_slug })));
    if (all.length > 10_000) throw new RepositoryError("El catálogo de noticias supera el volumen de este panel. Configura paginación antes de continuar.", "storage");
  }
}
export async function getNewsRecord(id: string): Promise<NewsRecord | null> {
  if (storageMode() === "sqlite") return decode(database().prepare("SELECT record,locked_slug FROM news_records WHERE id=?").get(id));
  const query = new URLSearchParams({ select: "record,locked_slug", id: `eq.${id}`, limit: "1" });
  const rows = await remote(`news_records?${query}`) as { record: NewsRecord; locked_slug: string | null }[];
  return rows[0] ? { ...rows[0].record, lockedSlug: rows[0].locked_slug } : null;
}
export async function createNewsRecord(content: NewsContent): Promise<NewsRecord> {
  const draft = newsContentSchema.parse(content);
  const now = new Date().toISOString();
  const record: NewsRecord = { id: randomUUID(), draft, published: null, publishedAt: null, lockedSlug: null, revision: 1, createdAt: now, updatedAt: now };
  if (storageMode() === "supabase") return remoteRecord(await remote("rpc/news_create_record", { p_record: record }) as NewsRecord);
  try { database().prepare("INSERT INTO news_records(id,record,draft_slug,locked_slug) VALUES(?,?,?,NULL)").run(record.id, JSON.stringify(record), draft.slug); }
  catch (error) { sqliteError(error); }
  return record;
}
export async function updateNewsRecord(id: string, content: NewsContent, expectedRevision: number, action: "save" | "publish" | "unpublish"): Promise<NewsRecord> {
  const draft = newsContentSchema.parse(content);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new RepositoryError("La revisión de la noticia no es válida.", "validation");
  if (!["save", "publish", "unpublish"].includes(action)) throw new RepositoryError("La acción editorial no es válida.", "validation");
  if (action === "publish") {
    const issues = newsPublishIssues(draft);
    if (issues.length) throw new RepositoryError(issues.join(" "), "validation");
  }
  if (storageMode() === "supabase") return remoteRecord(await remote("rpc/news_update_record", { p_id: id, p_content: draft, p_expected_revision: expectedRevision, p_action: action }) as NewsRecord);
  const connection = database();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const previous = decode(connection.prepare("SELECT record,locked_slug FROM news_records WHERE id=?").get(id));
    if (!previous) throw new RepositoryError("No se encontró la noticia.", "not_found");
    if (previous.revision !== expectedRevision) throw new RepositoryError("La noticia ha cambiado. Recarga antes de guardar para no sobrescribir cambios.", "conflict");
    if (previous.lockedSlug && previous.lockedSlug !== draft.slug) throw new RepositoryError("El slug de una noticia publicada no puede cambiar.", "validation");
    const now = new Date().toISOString();
    const next: NewsRecord = { ...previous, draft, revision: previous.revision + 1, updatedAt: now,
      lockedSlug: previous.lockedSlug ?? (action === "publish" ? draft.slug : null),
      published: action === "publish" ? draft : action === "unpublish" ? null : previous.published,
      publishedAt: action === "publish" ? now : action === "unpublish" ? null : previous.publishedAt };
    connection.prepare("UPDATE news_records SET record=?,draft_slug=?,locked_slug=? WHERE id=?").run(JSON.stringify(next), draft.slug, next.lockedSlug, id);
    connection.exec("COMMIT");
    return next;
  } catch (error) { try { connection.exec("ROLLBACK"); } catch { /* Keep the original storage error. */ } sqliteError(error); }
}
export async function listPublishedNews(): Promise<PublishedNews[]> {
  return (await listNewsRecords()).flatMap((record) => record.published && record.publishedAt
    ? [{ ...record.published, id: record.id, publishedAt: record.publishedAt, updatedAt: record.publishedAt }] : [])
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id));
}
export async function getPublishedNews(slug: string): Promise<PublishedNews | null> { return (await listPublishedNews()).find((news) => news.slug === slug) ?? null; }

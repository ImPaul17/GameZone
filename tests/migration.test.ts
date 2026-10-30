import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { emptyGame, type CatalogRecord } from "../src/modules/catalog/types";

// Exercise the same native .mjs entry points as the Node CLI, without a second implementation.
const { captureSqliteSnapshot, buildMigrationPlan, migrateCatalog, createSupabaseMigrationClient, validateSnapshotRows, snapshotHash } = await import(new URL("../scripts/lib/migrate-catalog.mjs", import.meta.url).href);
const { parseMigrationArguments, loadMigrationEnvironment } = await import(new URL("../scripts/migrate-to-supabase.mjs", import.meta.url).href);
const stamp = "2026-10-30T10:00:00.000Z";
let directory: string;
let databasePath: string;
type SnapshotRow = { id: string; record: CatalogRecord; draft_slug: string; source_key: string | null; locked_slug: string | null; revision: number; updated_at: string };

function record(id = "11111111-1111-4111-a111-111111111111", slug = "synthetic-game"): CatalogRecord {
  const content = { ...emptyGame(), title: "Synthetic game", slug, summary: "Un resumen editorial propio de prueba para la migración.",
    description: ["Una descripción que permite comprobar la preservación de contenido editorial sin recurrir a fuentes externas."],
    coverImage: "https://images.example.com/cover.jpg", coverAlt: "Portada de prueba" };
  return { id, draft: content, published: content, publishedAt: stamp, source: null, lastImported: null,
    revision: 7, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: stamp };
}
function row(snapshot = record()): SnapshotRow {
  const lockedSlug = snapshot.lockedSlug ?? snapshot.published?.slug ?? null;
  const normalized = { ...snapshot, lockedSlug };
  return { id: snapshot.id, record: normalized, draft_slug: snapshot.draft.slug, source_key: snapshot.source ? `pivigames:${snapshot.source.id}` : null,
    locked_slug: lockedSlug, revision: snapshot.revision, updated_at: snapshot.updatedAt };
}
function createDatabase(records: { record: CatalogRecord; lockedSlug: string | null }[] = [{ record: record(), lockedSlug: "synthetic-game" }]) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE catalog_records(id TEXT PRIMARY KEY, record TEXT NOT NULL, draft_slug TEXT NOT NULL UNIQUE, source_key TEXT UNIQUE, locked_slug TEXT)");
  for (const item of records) db.prepare("INSERT INTO catalog_records VALUES(?,?,?,?,?)").run(item.record.id, JSON.stringify(item.record), item.record.draft.slug,
    item.record.source ? `pivigames:${item.record.source.id}` : null, item.lockedSlug);
  db.close();
}
function modifySource(title = "Cambio local posterior") {
  const db = new DatabaseSync(databasePath);
  const stored = db.prepare("SELECT id,record FROM catalog_records LIMIT 1").get() as { id: string; record: string };
  const value = JSON.parse(stored.record) as CatalogRecord;
  value.draft = { ...value.draft, title };
  db.prepare("UPDATE catalog_records SET record=? WHERE id=?").run(JSON.stringify(value), stored.id);
  db.close();
}
beforeEach(() => {
  const root = resolve(".data"); mkdirSync(root, { recursive: true });
  directory = mkdtempSync(join(root, "migration-tests-"));
  databasePath = join(directory, "catalog.db");
});
afterEach(() => {
  vi.restoreAllMocks();
  if (!resolve(directory).startsWith(`${resolve(".data")}${sep}`) || !basename(directory).startsWith("migration-tests-")) throw new Error("Unsafe temporary directory");
  rmSync(directory, { recursive: true, force: true });
});

describe("read-only SQLite migration snapshot", () => {
  it("does not create an absent database or silently initialize seeds", async () => {
    await expect(captureSqliteSnapshot(databasePath)).rejects.toMatchObject({ code: "configuration" });
    expect(existsSync(databasePath)).toBe(false);
  });
  it("preserves the draft, published snapshot, baseline, revision, source and historical slug lock", async () => {
    const original = record();
    original.draft = { ...original.draft, title: "Edición privada conservada" };
    original.source = { provider: "pivigames", id: "42", url: "https://pivigames.blog/synthetic/" };
    original.lastImported = { ...original.draft, title: "Versión de la fuente" };
    const withdrawn = record("22222222-2222-4222-a222-222222222222", "retirado");
    withdrawn.published = null; withdrawn.publishedAt = null;
    createDatabase([{ record: original, lockedSlug: original.draft.slug }, { record: withdrawn, lockedSlug: "retirado" }]);
    const before = readFileSync(databasePath);
    const captured = await captureSqliteSnapshot(databasePath);
    expect(captured.rows).toEqual([row(original), { ...row(withdrawn), record: { ...withdrawn, lockedSlug: "retirado" }, locked_slug: "retirado" }]);
    expect(captured.rows[0].record.draft.title).toBe("Edición privada conservada");
    expect(captured.rows[0].record.published.title).toBe("Synthetic game");
    expect(captured.rows[0].revision).toBe(7);
    expect(captured.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(databasePath)).toEqual(before);
  });
  it("rejects corrupt storage metadata and invalid data without normalizing or losing fields", () => {
    expect(() => validateSnapshotRows([{ ...row(), source_key: "pivigames:wrong" }])).toThrow(/columnas/);
    const invalid = row(); invalid.record.draft.releaseDate = "2026-02-30";
    expect(() => validateSnapshotRows([invalid])).toThrow(/esquema editorial/);
    const whitespace = row(); whitespace.record.draft.title = " Alteración silenciosa ";
    expect(() => validateSnapshotRows([whitespace])).toThrow(/normalizado/);
    expect(() => validateSnapshotRows([row(), row()])).toThrow(/duplicados/);
  });
});

describe("no-overwrite migration plan", () => {
  it("plans insertion into an empty remote and an idempotent repeat for identical rows", () => {
    const local = [row()];
    expect(buildMigrationPlan(local, []).insert).toEqual([local[0].id]);
    const same = structuredClone(local);
    same[0].updated_at = "2026-10-30T10:00:00+00:00";
    expect(buildMigrationPlan(local, same)).toEqual({ insert: [], identical: [local[0].id], conflicts: [] });
    expect(snapshotHash(local)).toBe(snapshotHash(JSON.parse(JSON.stringify(local))));
  });
  it("blocks a different snapshot under the same ID, even when the remote revision is lower", () => {
    const remote = row(); remote.record.draft.title = "Otra versión remota"; remote.record.revision = 2; remote.revision = 2;
    expect(buildMigrationPlan([row()], [remote]).conflicts[0].reason).toBe("same_id_different_snapshot");
  });
  it("blocks slug and source collisions owned by different IDs", () => {
    const local = row();
    const slugCollision = row(record("33333333-3333-4333-a333-333333333333"));
    expect(buildMigrationPlan([local], [slugCollision]).conflicts).toHaveLength(1);
    local.record.source = { provider: "pivigames", id: "42", url: "https://pivigames.blog/source/" }; local.source_key = "pivigames:42";
    const other = row(record("44444444-4444-4444-a444-444444444444", "otro")); other.source_key = "pivigames:42";
    expect(buildMigrationPlan([local], [other]).conflicts).toHaveLength(1);
  });
});

describe("dry-run, atomic application and verification", () => {
  it("defaults to dry-run without a backup, remote write or local mutation", async () => {
    createDatabase();
    const client = { listRows: vi.fn().mockResolvedValue([]), importRows: vi.fn() };
    const result = await migrateCatalog({ databasePath, client, snapshotDirectory: join(directory, "backups") });
    expect(result).toMatchObject({ mode: "dry-run", total: 1, insert: 1, published: 1, blocked: false });
    expect(client.importRows).not.toHaveBeenCalled();
    expect(existsSync(join(directory, "backups"))).toBe(false);
  });
  it("writes one private snapshot and one bulk RPC, verifies exact content, then repeats idempotently", async () => {
    createDatabase();
    let remote: SnapshotRow[] = [];
    const client = { listRows: vi.fn(async () => structuredClone(remote)), importRows: vi.fn(async (rows: SnapshotRow[]) => {
      const inserted = remote.length ? 0 : rows.length;
      remote = structuredClone(rows);
      return { inserted, identical: rows.length - inserted, total: rows.length };
    }) };
    const options = { databasePath, client, apply: true, snapshotDirectory: join(directory, "backups") };
    const result = await migrateCatalog(options);
    expect(result).toMatchObject({ verified: true, total: 1, applied: { inserted: 1, identical: 0 } });
    expect(client.importRows).toHaveBeenCalledTimes(1);
    const backup = JSON.parse(readFileSync(result.backupPath, "utf8"));
    expect(backup.rows).toEqual(remote);
    expect(backup.hash).toBe(snapshotHash(remote));
    expect(remote[0].record.revision).toBe(7);
    expect(remote[0].record.publishedAt).toBe(stamp);
    const repeated = await migrateCatalog(options);
    expect(repeated).toMatchObject({ verified: true, insert: 0, identical: 1, applied: { inserted: 0, identical: 1 } });
    expect(readdirSync(join(directory, "backups"))).toHaveLength(2);
  });
  it("aborts the whole plan if any remote record conflicts", async () => {
    createDatabase();
    const remote = row(); remote.record.draft.title = "Edición remota legítima";
    const client = { listRows: vi.fn().mockResolvedValue([remote]), importRows: vi.fn() };
    const result = await migrateCatalog({ databasePath, client, apply: true, snapshotDirectory: join(directory, "backups") });
    expect(result.blocked).toBe(true);
    expect(client.importRows).not.toHaveBeenCalled();
    expect(existsSync(join(directory, "backups"))).toBe(false);
  });
  it("detects SQLite edits during preflight before sending any remote writes", async () => {
    createDatabase();
    const client = { listRows: vi.fn(async () => { modifySource(); return []; }), importRows: vi.fn() };
    await expect(migrateCatalog({ databasePath, client, apply: true, snapshotDirectory: join(directory, "backups") })).rejects.toMatchObject({ code: "source_changed" });
    expect(client.importRows).not.toHaveBeenCalled();
  });
  it("fails verification when remote data differs after the RPC instead of declaring migration successful", async () => {
    createDatabase();
    const client = { listRows: vi.fn().mockResolvedValue([]), importRows: vi.fn().mockResolvedValue({ inserted: 1, identical: 0, total: 1 }) };
    await expect(migrateCatalog({ databasePath, client, apply: true, snapshotDirectory: join(directory, "backups") })).rejects.toMatchObject({ code: "verification" });
    expect(client.importRows).toHaveBeenCalledTimes(1);
  });
});

describe("bounded private Supabase client", () => {
  it("paginates until an empty page, including projects with smaller per-page limits, without exposing secret keys", async () => {
    const secret = "sb_secret_synthetic-never-log";
    const rows = [row(), row(record("22222222-2222-4222-a222-222222222222", "segundo"))];
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([rows[0]])).mockResolvedValueOnce(Response.json([rows[1]])).mockResolvedValueOnce(Response.json([]));
    const client = createSupabaseMigrationClient({ url: "https://example.supabase.co", key: secret, fetchImpl: fetchMock });
    expect(await client.listRows()).toEqual(rows);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error", headers: { apikey: secret } });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(fetchMock.mock.calls[1][0]).toContain("offset=1");
  });
  it("uses a single fixed RPC with exact snapshots and recognizes transactional concurrency conflicts", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ inserted: 1, identical: 0, total: 1 })).mockResolvedValueOnce(Response.json({ message: "migration_conflict PRIVATE_DOWNLOAD_TOKEN" }, { status: 409 }));
    const client = createSupabaseMigrationClient({ url: "https://example.supabase.co", key: "legacy-service-role-test", fetchImpl: fetchMock });
    expect(await client.importRows([row()])).toEqual({ inserted: 1, identical: 0, total: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.supabase.co/rest/v1/rpc/catalog_import_snapshots");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).p_rows).toEqual([row()]);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer legacy-service-role-test");
    await expect(client.importRows([row()])).rejects.toMatchObject({ code: "conflict" });
    await expect(client.importRows([row()])).rejects.not.toThrow(/PRIVATE_DOWNLOAD_TOKEN/);
  });
  it("does not reflect provider error bodies, passwords or keys in the CLI-facing error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: "server-secret-example-sensitive-value" }, { status: 500 }));
    const client = createSupabaseMigrationClient({ url: "https://example.supabase.co", key: "sb_secret_sensitive-value", fetchImpl: fetchMock });
    await expect(client.listRows()).rejects.not.toThrow(/sensitive-value|server-secret/);
  });
  it.each(["http://example.supabase.co", "https://secret@example.supabase.co", "https://example.supabase.co/path", "https://example.supabase.co/?key=secret"])("rejects an unsafe credential destination %s", (url) => {
    expect(() => createSupabaseMigrationClient({ url, key: "sb_secret_synthetic" })).toThrow();
  });
});

describe("CLI and SQL contract", () => {
  it("does not mix an explicit project's credentials with inherited environment variables or print their values", () => {
    const filename = join(directory, "private.env");
    writeFileSync(filename, 'NEXT_PUBLIC_SUPABASE_URL=https://correct.supabase.co\nSUPABASE_SECRET_KEY="sb_secret_right"\n');
    const configuration = loadMigrationEnvironment(filename, true, { NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_wrong" });
    expect(configuration).toMatchObject({ url: "https://correct.supabase.co", key: "sb_secret_right" });
    writeFileSync(filename, "SUPABASE_SECRET_KEY=sb_secret_right\n");
    expect(() => loadMigrationEnvironment(filename, true, { NEXT_PUBLIC_SUPABASE_URL: "https://wrong.supabase.co" })).toThrow(/mismo proyecto/);
  });
  it("requires explicit apply and does not accept secrets on the command line", () => {
    expect(parseMigrationArguments([])).toMatchObject({ apply: false });
    expect(parseMigrationArguments(["--database", "private.db", "--env-file", "private.env", "--apply"])).toMatchObject({ apply: true, databasePath: "private.db", envFile: "private.env" });
    expect(() => parseMigrationArguments(["--apply", "--dry-run"])).toThrow();
    expect(() => parseMigrationArguments(["--key", "secret"])).toThrow();
  });
  it("restricts the bulk RPC to service_role, validates all rows under a write-excluding lock and never performs update/upsert", () => {
    const sql = readFileSync("supabase/migrations/202610300002_import_catalog_snapshots.sql", "utf8");
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/lock table public\.catalog_records in share row exclusive mode/);
    expect(sql.indexOf("migration_conflict")).toBeLessThan(sql.indexOf("insert into public.catalog_records"));
    expect(sql).toMatch(/on conflict do nothing/);
    expect(sql).not.toMatch(/on conflict[\s\S]*do update/);
    expect(sql).toMatch(/v_inserted \+ v_identical <> jsonb_array_length\(p_rows\)/);
    expect(sql).toMatch(/revoke all on function public\.catalog_import_snapshots\(jsonb\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.catalog_import_snapshots\(jsonb\) to service_role/);
  });
});

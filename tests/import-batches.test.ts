import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { emptyGame, type ImportResult } from "../src/modules/catalog/types";
import { closeCatalogConnections, createRecord, getRecord, listPublishedGames, updateRecord } from "../src/modules/catalog/repository";
import { claimBatchItem, changeBatchState, closeBatchConnections, createBatch, finishBatchItem, getBatch, listBatches, normalizedBatchURLs } from "../src/modules/imports/batch-repository";
import { stepBatch } from "../src/modules/imports/batch-worker";
import { discoverBatchURLs, validateSitemap } from "../src/modules/imports/batch-discovery";
import { SourceHttpError } from "../src/modules/imports/safe-http";

const network = vi.hoisted(() => ({ importGame: vi.fn(), sitemap: vi.fn() }));
vi.mock("../src/modules/imports/pivigames", async importOriginal => ({ ...await importOriginal<typeof import("../src/modules/imports/pivigames")>(), importFromPiviGames: network.importGame }));
vi.mock("../src/modules/imports/safe-http", async importOriginal => ({ ...await importOriginal<typeof import("../src/modules/imports/safe-http")>(), safeHttps: network.sitemap }));

let directory: string;
const url = "https://pivigames.blog/test-batch-game/";
function imported(id = "991234", slug = "test-batch-game"): ImportResult {
  return { source: { provider: "pivigames", id, url }, fetchedAt: new Date().toISOString(), warnings: ["Revisa identidad y edición antes de publicar."], content: {
    ...emptyGame(), title: "Juego importado", slug,
    summary: "Una descripción editorial suficientemente extensa para comprobar la publicación.",
    description: ["La descripción original aporta contexto del juego y se mantiene separada del borrador editorial hasta su revisión."],
    coverImage: "https://pivigames.blog/wp-content/uploads/test.jpg", coverAlt: "Portada de prueba" } };
}
beforeEach(() => {
  const root = join(process.cwd(), ".data"); mkdirSync(root, { recursive: true }); directory = mkdtempSync(join(root, "batch-test-"));
  vi.stubEnv("GAMEZONE_DATABASE_PATH", join(directory, "batch.db")); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SECRET_KEY", ""); vi.stubEnv("NODE_ENV", "test");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
  network.importGame.mockReset().mockImplementation(async () => imported()); network.sitemap.mockReset();
});
afterEach(() => {
  closeBatchConnections(); closeCatalogConnections(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  for (const file of readdirSync(directory)) unlinkSync(join(directory, file)); rmdirSync(directory);
});
function nextStep() { vi.setSystemTime(Date.now() + 2001); }

describe("durable draft-only batch import", () => {
  it("validates the whole URL list, removes duplicate slash forms, and caps one batch at 1000", () => {
    expect(normalizedBatchURLs([url, url.slice(0, -1), ` ${url} `])).toEqual([url.slice(0, -1)]);
    expect(normalizedBatchURLs(Array.from({ length: 1000 }, (_, index) => `https://pivigames.blog/game-${index}/`))).toHaveLength(1000);
    expect(() => normalizedBatchURLs([...Array(1001)].map(() => url))).toThrow(/1000/);
    expect(() => normalizedBatchURLs([url, "https://127.0.0.1/admin"])).toThrow(/HTTPS/);
    expect(() => normalizedBatchURLs([url + "?page=2"])).toThrow();
    expect(() => normalizedBatchURLs([])).toThrow();
  });

  it("persists the queue across connections and does not query PiviGames while creating or listing", async () => {
    const batch = await createBatch([url, "https://pivigames.blog/second-game/"]);
    closeBatchConnections();
    expect(await getBatch(batch.id)).toEqual(batch);
    expect(await listBatches()).toEqual([{ id: batch.id, status: "queued", total: 2, done: 0, createdAt: batch.createdAt, updatedAt: batch.updatedAt }]);
    expect(network.importGame).not.toHaveBeenCalled();
  });

  it("imports one item into an unpublished draft with its baseline, warnings, and source identity", async () => {
    const batch = await createBatch([url, "https://pivigames.blog/second-game/"]);
    const finished = await stepBatch(batch.id);
    expect(network.importGame).toHaveBeenCalledTimes(1);
    expect(finished.done).toBe(1); expect(finished.status).toBe("queued");
    expect(finished.items[0]).toMatchObject({ status: "imported", title: "Juego importado", attempts: 1, warnings: ["Revisa identidad y edición antes de publicar."] });
    expect(finished.items[1].status).toBe("pending");
    const draft = await getRecord(finished.items[0].recordId!);
    expect(draft).toMatchObject({ source: imported().source, lastImported: imported().content, published: null, publishedAt: null });
    expect((await listPublishedGames()).some(game => game.slug === "test-batch-game")).toBe(false);
    expect((await stepBatch(batch.id)).done).toBe(1); // Persisted rate gate, without a second remote read.
    expect(network.importGame).toHaveBeenCalledTimes(1);
  });

  it("shares a single lease across batches and duplicate calls while a remote import is in flight", async () => {
    const first = await createBatch([url]); const second = await createBatch(["https://pivigames.blog/other/"]);
    let complete!: (value: ImportResult) => void;
    network.importGame.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const running = stepBatch(first.id);
    while (!complete) await Promise.resolve();
    const blocked = await stepBatch(second.id);
    expect(blocked.done).toBe(0); expect(blocked.retryAt).toBeDefined();
    expect((await stepBatch(first.id)).items[0].status).toBe("processing");
    expect(network.importGame).toHaveBeenCalledTimes(1);
    complete(imported()); expect((await running).status).toBe("completed");
  });

  it("pauses durably, resumes after a reload and retains a pause requested during processing", async () => {
    const batch = await createBatch([url, "https://pivigames.blog/another/"]);
    await changeBatchState(batch.id, "pause"); closeBatchConnections();
    expect((await stepBatch(batch.id)).status).toBe("paused"); expect(network.importGame).not.toHaveBeenCalled();
    await changeBatchState(batch.id, "resume");
    const claim = await claimBatchItem(batch.id); await changeBatchState(batch.id, "pause");
    const finished = await finishBatchItem(batch.id, claim.item!.id, claim.token!, claim.item!.attempts, { status: "failed", message: "Prueba interrumpida" });
    expect(finished.status).toBe("paused"); expect(finished.done).toBe(1);
  });

  it("skips an existing source without changing its manual draft or published snapshot", async () => {
    const original = imported(); const created = await createRecord(original.content, original.source, original.content);
    const published = await updateRecord(created.id, created.draft, 1, "publish");
    const edited = await updateRecord(created.id, { ...created.draft, title: "Título del editor" }, published.revision, "save");
    const batch = await createBatch([url]); const result = await stepBatch(batch.id);
    expect(result.items[0]).toMatchObject({ status: "skipped", recordId: created.id });
    expect(await getRecord(created.id)).toEqual(edited);
  });

  it("marks a slug collision for manual review and never links or overwrites the other record", async () => {
    const created = await createRecord(imported().content);
    const batch = await createBatch([url]); const result = await stepBatch(batch.id);
    expect(result.items[0]).toMatchObject({ status: "skipped", recordId: created.id });
    expect((await getRecord(created.id))?.source).toBeNull(); expect((await getRecord(created.id))?.revision).toBe(1);
  });

  it("recovers an expired lease and deduplicates a draft saved before an interrupted checkpoint", async () => {
    const batch = await createBatch([url]); await claimBatchItem(batch.id);
    const original = imported(); const created = await createRecord(original.content, original.source, original.content);
    vi.setSystemTime(Date.now() + 120001); closeBatchConnections();
    const result = await stepBatch(batch.id);
    expect(result.status).toBe("completed"); expect(result.items[0]).toMatchObject({ status: "skipped", recordId: created.id, attempts: 2 });
    expect((await getRecord(created.id))?.revision).toBe(1);
  });

  it("rejects an old worker's checkpoint after a lease has been recovered", async () => {
    const batch = await createBatch([url]); const first = await claimBatchItem(batch.id);
    vi.setSystemTime(Date.now() + 120001); const second = await claimBatchItem(batch.id);
    await expect(finishBatchItem(batch.id, first.item!.id, first.token!, first.item!.attempts, { status: "failed", message: "Stale result" })).rejects.toMatchObject({ code: "conflict" });
    const other = await createBatch(["https://pivigames.blog/other/"]);
    expect((await claimBatchItem(other.id)).token).toBeUndefined(); // The stale release cannot clear the new lease.
    const finished = await finishBatchItem(batch.id, second.item!.id, second.token!, second.item!.attempts, { status: "failed", message: "Current result" });
    expect(finished.items[0].message).toBe("Current result");
  });

  it("persists errors, retries explicitly and stops after three attempts", async () => {
    network.importGame.mockRejectedValue(new Error("La fuente devolvió HTTP 429. Inténtalo más tarde."));
    const batch = await createBatch([url]);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await stepBatch(batch.id); expect(result.items[0]).toMatchObject({ status: "failed", attempts: attempt });
      if (attempt < 3) { await changeBatchState(batch.id, "retry"); nextStep(); }
    }
    closeBatchConnections();
    expect((await getBatch(batch.id)).items[0].message).toContain("429");
    await expect(changeBatchState(batch.id, "retry")).rejects.toMatchObject({ code: "validation" });
  });

  it("pauses the whole queue when the source rate limits requests", async () => {
    network.importGame.mockRejectedValue(new SourceHttpError(429, 120000));
    const batch = await createBatch([url, "https://pivigames.blog/second-game/"]);
    const result = await stepBatch(batch.id);
    expect(result.status).toBe("paused");
    expect(result.items.map(item => item.status)).toEqual(["failed", "pending"]);
    await expect(changeBatchState(batch.id, "resume")).rejects.toMatchObject({ code: "conflict" });
    expect((await stepBatch(batch.id)).status).toBe("paused");
    expect(network.importGame).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 120001);
    expect((await changeBatchState(batch.id, "retry")).status).toBe("queued");
  });

  it("reports an unapplied remote migration without silently creating a local queue", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test-only");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "PGRST205" }), { status: 404 })); vi.stubGlobal("fetch", fetcher);
    await expect(listBatches()).rejects.toMatchObject({ code: "storage" });
    expect(readdirSync(directory)).toHaveLength(0);
    const headers = fetcher.mock.calls[0][1].headers; expect(headers.apikey).toBe("sb_secret_test-only"); expect(headers.Authorization).toBeUndefined();
  });
});

describe("bounded sitemap discovery", () => {
  it.each(["https://evil.test/post-sitemap.xml", "https://pivigames.blog/wp-json/wp/v2/posts?page=2", "https://pivigames.blog/post-sitemap.xml?x=1", "https://pivigames.blog/category-sitemap.xml", "http://pivigames.blog/post-sitemap.xml", "https://pivigames.blog/post-sitemap.xml#x"])("rejects a non-approved discovery destination %s", input => {
    expect(() => validateSitemap(input)).toThrow(); expect(network.sitemap).not.toHaveBeenCalled();
  });

  it("returns post maps from one index request without crawling them or querying REST", async () => {
    network.sitemap.mockResolvedValue({ body: '<sitemapindex><sitemap><loc>https://pivigames.blog/post-sitemap.xml</loc></sitemap><sitemap><loc>https://pivigames.blog/post-sitemap2.xml</loc></sitemap><sitemap><loc>https://pivigames.blog/category-sitemap.xml</loc></sitemap></sitemapindex>', contentType: "application/xml" });
    const result = await discoverBatchURLs();
    expect(result.sitemaps).toEqual(["https://pivigames.blog/post-sitemap.xml", "https://pivigames.blog/post-sitemap2.xml"]); expect(result.urls).toEqual([]);
    expect(network.sitemap).toHaveBeenCalledTimes(1); expect(network.sitemap).toHaveBeenCalledWith("https://pivigames.blog/sitemap_index.xml", expect.objectContaining({ redirects: 0, maxBytes: 2097152 }));
  });

  it("extracts only direct publication loc nodes, excluding media, offsite URLs and duplicates", async () => {
    network.sitemap.mockResolvedValue({ body: `<urlset xmlns:image="https://example.com/image"><url><loc>${url}</loc><image:image><image:loc>https://pivigames.blog/looks-like-a-post-but-is-an-image/</image:loc></image:image></url><url><loc>${url}</loc></url><url><loc>https://evil.test/game</loc></url></urlset>`, contentType: "text/xml; charset=UTF-8" });
    const result = await discoverBatchURLs("https://pivigames.blog/post-sitemap.xml"); expect(result.urls).toEqual([url]); expect(result.message).toContain("borradores");
  });

  it("rejects HTML block pages and XML entity declarations without following anything", async () => {
    network.sitemap.mockResolvedValueOnce({ body: "<html>Verify you are human</html>", contentType: "text/html" });
    await expect(discoverBatchURLs()).rejects.toThrow(/XML/);
    network.sitemap.mockResolvedValueOnce({ body: '<!DOCTYPE x [<!ENTITY data SYSTEM "file:///etc/passwd">]><urlset/>', contentType: "application/xml" });
    await expect(discoverBatchURLs()).rejects.toThrow(/XML/);
  });
});

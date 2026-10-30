import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { closeNewsConnections, createNewsRecord, getNewsRecord, getPublishedNews, listNewsRecords, listPublishedNews, updateNewsRecord } from "../src/modules/news/repository";
import { emptyNews, type NewsContent } from "../src/modules/news/types";
import { newsContentSchema, newsPublishIssues } from "../src/modules/news/validation";

let directory: string;
const article = (slug = "noticia-de-prueba"): NewsContent => ({ ...emptyNews(), title: "Una noticia de prueba", slug,
  summary: "Un resumen editorial con suficiente contexto para presentar esta noticia.",
  body: ["Un párrafo editorial de prueba que permite verificar la publicación de noticias y la conservación de sus borradores."],
  coverImage: "/assets/images/news.jpg", coverAlt: "Imagen de la noticia", tags: ["Actualidad"], sourceUrl: "https://example.com/news" });
beforeEach(() => {
  mkdirSync(resolve(".data"), { recursive: true });
  directory = mkdtempSync(join(resolve(".data"), "news-test-"));
  vi.stubEnv("GAMEZONE_DATABASE_PATH", join(directory, "news.db"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SECRET_KEY", ""); vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  closeNewsConnections(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  if (!resolve(directory).startsWith(`${resolve(".data")}${sep}`) || !basename(directory).startsWith("news-test-")) throw new Error("Unsafe test directory");
  rmSync(directory, { recursive: true, force: true });
});

describe("durable news editorial snapshots", () => {
  it("starts empty without inventing public news and keeps drafts private after reopening SQLite", async () => {
    expect(await listNewsRecords()).toEqual([]);
    expect(await listPublishedNews()).toEqual([]);
    const created = await createNewsRecord(article());
    expect(created).toMatchObject({ revision: 1, lockedSlug: null, published: null, publishedAt: null });
    closeNewsConnections();
    expect((await getNewsRecord(created.id))?.draft).toEqual(article());
    expect(await getPublishedNews(created.draft.slug)).toBeNull();
  });
  it("publishes one snapshot while subsequent drafts remain private until republished", async () => {
    const created = await createNewsRecord(article());
    const published = await updateNewsRecord(created.id, created.draft, 1, "publish");
    const edited = { ...published.draft, title: "Título privado editado", body: ["Otro cuerpo privado suficientemente extenso que no debe aparecer en la publicación hasta su aprobación editorial."] };
    const draft = await updateNewsRecord(created.id, edited, 2, "save");
    closeNewsConnections();
    expect((await getNewsRecord(created.id))?.draft.title).toBe(edited.title);
    const publicNews = await getPublishedNews(created.draft.slug);
    expect(publicNews?.title).toBe(created.draft.title);
    expect(publicNews?.updatedAt).toBe(published.publishedAt);
    expect(draft.revision).toBe(3);
    await updateNewsRecord(created.id, draft.draft, 3, "publish");
    expect((await getPublishedNews(created.draft.slug))?.title).toBe(edited.title);
  });
  it("keeps the published slug reserved after withdrawal and rejects duplicate slugs", async () => {
    const created = await createNewsRecord(article());
    await expect(createNewsRecord(article())).rejects.toMatchObject({ code: "conflict" });
    await updateNewsRecord(created.id, created.draft, 1, "publish");
    const withdrawn = await updateNewsRecord(created.id, created.draft, 2, "unpublish");
    closeNewsConnections();
    expect(withdrawn).toMatchObject({ lockedSlug: created.draft.slug, published: null, publishedAt: null });
    expect(await listPublishedNews()).toEqual([]);
    await expect(updateNewsRecord(created.id, { ...created.draft, slug: "otro-slug" }, 3, "save")).rejects.toMatchObject({ code: "validation" });
    expect((await getNewsRecord(created.id))?.revision).toBe(3);
  });
  it("allows exactly one concurrent update to an expected revision and preserves the winning content", async () => {
    const created = await createNewsRecord(article());
    const results = await Promise.allSettled([
      updateNewsRecord(created.id, { ...created.draft, title: "Editor uno" }, 1, "save"),
      updateNewsRecord(created.id, { ...created.draft, title: "Editor dos" }, 1, "save"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await getNewsRecord(created.id))?.revision).toBe(2);
  });
  it("refuses publication until summary, body, cover and alternative text are complete", async () => {
    const incomplete = { ...article(), summary: "", body: [], coverImage: "", coverAlt: "" };
    const created = await createNewsRecord(incomplete);
    expect(newsPublishIssues(incomplete)).toHaveLength(4);
    await expect(updateNewsRecord(created.id, incomplete, 1, "publish")).rejects.toMatchObject({ code: "validation" });
    expect((await getNewsRecord(created.id))?.revision).toBe(1);
    expect(await listPublishedNews()).toEqual([]);
  });
});

describe("news remote persistence and validation", () => {
  it("uses a service-only RPC with private credentials and does not fall back to SQLite on failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://news-test.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_synthetic-news");
    const fetchMock = vi.fn().mockImplementationOnce(async (_url: string, init: RequestInit) => Response.json(JSON.parse(init.body as string).p_record));
    vi.stubGlobal("fetch", fetchMock);
    const created = await createNewsRecord(article());
    expect(fetchMock.mock.calls[0][0]).toBe("https://news-test.supabase.co/rest/v1/rpc/news_create_record");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ apikey: "sb_secret_synthetic-news" });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    fetchMock.mockResolvedValueOnce(Response.json({ message: "revision_conflict" }, { status: 409 }));
    await expect(updateNewsRecord(created.id, created.draft, 1, "publish")).rejects.toMatchObject({ code: "conflict" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ p_id: created.id, p_expected_revision: 1, p_action: "publish" });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(await getNewsRecord(created.id)).toBeNull();
  });
  it("fails closed on partial remote configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://news-test.supabase.co");
    await expect(listNewsRecords()).rejects.toMatchObject({ code: "configuration" });
  });
  it.each(["javascript:alert(1)", "data:image/svg+xml,test", "http://example.com/x", "https://user:pass@example.com/x"])("rejects active or unsafe news URLs %s", (sourceUrl) => {
    expect(newsContentSchema.safeParse({ ...article(), sourceUrl }).success).toBe(false);
    expect(newsContentSchema.safeParse({ ...article(), coverImage: sourceUrl }).success).toBe(false);
  });
  it("rejects local asset traversal while accepting plain text as inert article data", () => {
    expect(newsContentSchema.safeParse({ ...article(), coverImage: "/assets/%2e%2e/private" }).success).toBe(false);
    expect(newsContentSchema.safeParse({ ...article(), body: ["<script>this remains text</script>"] }).success).toBe(true);
    expect(newsPublishIssues(article())).toEqual([]);
  });
});

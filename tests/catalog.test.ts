import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { closeCatalogConnections, createRecord, findBySource, getRecord, getPublishedGame, storageMode, updateImportedRecord, updateRecord } from "../src/modules/catalog/repository";
import { emptyGame, type GameContent } from "../src/modules/catalog/types";
import { gameContentSchema, publishIssues } from "../src/modules/catalog/validation";

let testDirectory: string;
function game(slug: string): GameContent {
  return { ...emptyGame(), title: "Un juego de prueba", slug, summary: "Un resumen editorial suficientemente largo para publicar la ficha.", description: ["Una descripción editorial con información útil sobre este juego y su experiencia, revisada antes de publicar."], coverImage: "/assets/images/test.jpg", coverAlt: "Portada del juego de prueba" };
}
beforeAll(() => {
  const testRoot = join(process.cwd(), ".data"); mkdirSync(testRoot, { recursive: true });
  testDirectory = mkdtempSync(join(testRoot, "catalog-test-"));
  vi.stubEnv("GAMEZONE_DATABASE_PATH", join(testDirectory, "catalog.db"));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SECRET_KEY", ""); vi.stubEnv("NODE_ENV", "test");
});
afterAll(() => {
  closeCatalogConnections();
  for (const file of readdirSync(testDirectory)) unlinkSync(join(testDirectory, file));
  rmdirSync(testDirectory); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

describe("durable editorial catalog", () => {
  it("keeps unpublished changes separate and persists them across connections", async () => {
    const created = await createRecord(game("snapshot-test"));
    expect(created.lockedSlug).toBeNull();
    expect(await getPublishedGame("snapshot-test")).toBeNull();
    const published = await updateRecord(created.id, created.draft, 1, "publish");
    expect(published.lockedSlug).toBe("snapshot-test");
    const edited = { ...published.draft, title: "Nueva edición sin publicar" };
    const saved = await updateRecord(created.id, edited, 2, "save");
    closeCatalogConnections();
    expect((await getRecord(created.id))?.draft.title).toBe(edited.title);
    expect((await getPublishedGame("snapshot-test"))?.title).toBe(created.draft.title);
    expect((await getPublishedGame("snapshot-test"))?.updatedAt).toBe(published.publishedAt);
    const republished = await updateRecord(created.id, saved.draft, 3, "publish");
    expect((await getPublishedGame("snapshot-test"))?.title).toBe(edited.title);
    const withdrawn = await updateRecord(created.id, republished.draft, 4, "unpublish");
    expect(withdrawn.lockedSlug).toBe("snapshot-test");
    closeCatalogConnections();
    expect((await getRecord(created.id))?.lockedSlug).toBe("snapshot-test");
    expect(await getPublishedGame("snapshot-test")).toBeNull();
    await expect(updateRecord(created.id, { ...edited, slug: "changed-after-unpublish" }, 5, "save")).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects duplicate slugs, duplicate source identities and stale writes", async () => {
    const source = { provider: "pivigames" as const, id: "12345", url: "https://pivigames.blog/un-juego/" };
    const created = await createRecord(game("source-test"), source, game("source-test"));
    await expect(createRecord(game("source-test"))).rejects.toMatchObject({ code: "conflict" });
    await expect(createRecord(game("other-source-test"), source)).rejects.toMatchObject({ code: "conflict" });
    expect((await findBySource("pivigames", "12345"))?.id).toBe(created.id);
    const concurrent = await Promise.allSettled([
      updateRecord(created.id, { ...created.draft, summary: "Primer editor" }, 1, "save"),
      updateRecord(created.id, { ...created.draft, summary: "Segundo editor" }, 1, "save"),
    ]);
    expect(concurrent.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    expect((await getRecord(created.id))?.revision).toBe(2);
  });

  it("updates the import baseline without altering the published snapshot", async () => {
    const created = await createRecord(game("baseline-test"));
    const published = await updateRecord(created.id, created.draft, 1, "publish");
    const imported = { ...created.draft, developer: "Nueva fuente" };
    const saved = await updateImportedRecord(created.id, { ...imported, title: "Título editorial conservado" }, imported, published.revision);
    expect(saved.lastImported?.developer).toBe("Nueva fuente");
    expect(saved.draft.title).toBe("Título editorial conservado");
    expect(saved.published?.developer).toBe("");
    await expect(updateRecord(created.id, { ...saved.draft, evidence: [{ field: "developer", label: "Estudio", value: "Dudoso", provider: "official", sourceUrl: "https://example.com/", retrievedAt: new Date().toISOString(), status: "conflict" }] }, saved.revision, "publish")).rejects.toMatchObject({ code: "validation" });
  });

  it("links imported sources to existing records without changing identity and rejects source races", async () => {
    const first = await createRecord(game("link-existing-first"));
    const second = await createRecord(game("link-existing-second"));
    const source = { provider: "pivigames" as const, id: "link-existing-id", url: "https://pivigames.blog/link-existing/" };
    const linked = await updateRecord(first.id, first.draft, 1, "publish", first.draft, source);
    expect(linked.id).toBe(first.id);
    expect(linked.source).toEqual(source);
    expect(linked.lastImported).toEqual(first.draft);
    await expect(updateRecord(second.id, second.draft, 1, "save", second.draft, source)).rejects.toMatchObject({ code: "conflict" });
    expect((await getRecord(second.id))?.revision).toBe(1);
    await expect(updateRecord(first.id, first.draft, 2, "save", undefined, { ...source, id: "a-different-game" })).rejects.toMatchObject({ code: "validation" });
    await expect(updateRecord(first.id, first.draft, 2, "save", undefined, null)).rejects.toMatchObject({ code: "validation" });
    const sameSource = await updateRecord(first.id, first.draft, 2, "save", undefined, source);
    expect(sameSource.revision).toBe(3);
    expect((await findBySource(source.provider, source.id))?.id).toBe(first.id);
  });
});

describe("content and storage guardrails", () => {
  it("rejects unsafe URLs and impossible dates while accepting partial dates", () => {
    expect(gameContentSchema.safeParse({ ...game("validation"), coverImage: "//attacker.test/image.png" }).success).toBe(false);
    expect(gameContentSchema.safeParse({ ...game("validation"), coverImage: "/assets/%2e%2e/secret" }).success).toBe(false);
    expect(gameContentSchema.safeParse({ ...game("validation"), trailerUrl: "javascript:alert(1)" }).success).toBe(false);
    for (const releaseDate of ["2026-02-30", "2026-02-99", "2026-13", "not-a-date"]) expect(gameContentSchema.safeParse({ ...game("validation"), releaseDate }).success).toBe(false);
    expect(gameContentSchema.safeParse({ ...game("validation"), releaseDate: "2026-02" }).success).toBe(true);
    expect(publishIssues(game("valid-publish"))).toEqual([]);
  });

  it("fails closed for partial remote credentials and unconfigured public production", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(() => storageMode()).toThrow(/juntos/);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("GAMEZONE_LOCAL_MODE", "");
    expect(() => storageMode()).toThrow(/antes de publicar/);
    vi.stubEnv("NODE_ENV", "test");
  });

  it("uses secret apikey headers and transactional remote writes without a local fallback", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://gamezone-test.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_server-test");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => Response.json(JSON.parse(init!.body as string).p_record));
    vi.stubGlobal("fetch", fetchMock);
    const created = await createRecord(game("remote-only-test"));
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/rpc\/catalog_create_record$/);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ apikey: "sb_secret_server-test" });
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
    fetchMock.mockImplementationOnce(async () => Response.json({ message: "revision_conflict", code: "P0001" }, { status: 409 }));
    await expect(updateRecord(created.id, created.draft, 1, "publish", created.draft)).rejects.toMatchObject({ code: "conflict" });
    const requestBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(requestBody).toMatchObject({ p_id: created.id, p_action: "publish", p_update_baseline: true, p_expected_revision: 1 });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SECRET_KEY", ""); vi.unstubAllGlobals();
    expect(await getRecord(created.id)).toBeNull();
  });
});

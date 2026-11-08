import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listRecords, listRecordSummaries } from "../src/modules/catalog/repository";
import { emptyGame, summarizeRecord, type CatalogRecord } from "../src/modules/catalog/types";
import { GET } from "../src/app/api/admin/games/route";

const remoteOrigin = "https://gamezone-test.supabase.co";
const baseTime = Date.UTC(2026, 10, 8);
function record(index: number): CatalogRecord {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    draft: { ...emptyGame(), title: `Juego ${index}`, slug: `juego-${index}` },
    published: null, publishedAt: null, source: null, lastImported: null, lockedSlug: null,
    revision: 1, createdAt: new Date(baseTime).toISOString(), updatedAt: new Date(baseTime + index * 1000).toISOString(),
  };
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", remoteOrigin);
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_catalog-test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("remote catalog pagination", () => {
  it("reads beyond the default 1000-row REST cap without losing records", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ record: record(index), locked_slug: null }));
    const fetchMock = vi.fn(async (input: string) => {
      const query = new URL(input).searchParams;
      const offset = Number(query.get("offset") ?? 0);
      const limit = Math.min(Number(query.get("limit") ?? 1000), 1000);
      return Response.json(rows.slice(offset, offset + limit));
    });
    vi.stubGlobal("fetch", fetchMock);

    const records = await listRecords();

    expect(records).toHaveLength(1001);
    expect(new Set(records.map(item => item.id)).size).toBe(1001);
    expect(records[0].id).toBe(rows[1000].record.id);
    expect(records.at(-1)?.id).toBe(rows[0].record.id);
    expect(fetchMock.mock.calls.map(([input]) => {
      const query = new URL(input).searchParams;
      return { offset: query.get("offset"), limit: query.get("limit"), order: query.get("order") };
    })).toEqual([0, 200, 400, 600, 800, 1000].map(offset => ({ offset: String(offset), limit: "200", order: "id.asc" })));
  });

  it.each([null, { record: record(1) }, [{}]])("rejects malformed pages without returning a partial catalog: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(listRecords()).rejects.toMatchObject({ code: "storage" });
  });

  it("fails rather than looping or duplicating records if the upstream ignores the offset", async () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({ record: record(index) }));
    const fetchMock = vi.fn(async () => Response.json(rows));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listRecords()).rejects.toMatchObject({ code: "storage" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("catalog list summaries", () => {
  it("keeps list metadata and pending state without serializing editorial snapshots", async () => {
    const draft = record(1);
    draft.source = { provider: "pivigames", id: "123", url: "https://pivigames.blog/juego/" };
    draft.draft.description = ["A long editorial description that belongs in the individual editor only."];
    draft.lastImported = { ...draft.draft, description: ["IMPORT_BASELINE_BODY"] };
    const published = record(2);
    published.published = structuredClone(published.draft);
    published.publishedAt = published.updatedAt;
    const changed = record(3);
    changed.published = { ...changed.draft, title: "Título público anterior" };
    changed.publishedAt = changed.updatedAt;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([draft, published, changed].map(item => ({ record: item })))));

    const summaries = await listRecordSummaries();

    expect(summaries.map(item => ({ id: item.id, published: item.published, pending: item.hasPendingChanges }))).toEqual([
      { id: changed.id, published: true, pending: true },
      { id: published.id, published: true, pending: false },
      { id: draft.id, published: false, pending: true },
    ]);
    expect(summaries[2]).toMatchObject({ title: draft.draft.title, slug: draft.draft.slug, coverImage: draft.draft.coverImage, source: draft.source, updatedAt: draft.updatedAt });
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty("draft");
      expect(summary).not.toHaveProperty("lastImported");
      expect(summary).not.toHaveProperty("revision");
    }
    expect(JSON.stringify(summaries)).not.toContain("IMPORT_BASELINE_BODY");
    expect(summarizeRecord(changed)).toEqual(summaries[0]);
  });

  it("serves summaries on demand while preserving full-record API compatibility and editor authorization", async () => {
    const stored = record(1);
    const editorId = "21c3a809-ffbf-4810-a92d-86bec57049cf";
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/auth/v1/user") return Response.json({ id: editorId });
      if (url.pathname === "/rest/v1/editor_roles") return Response.json([{ role: "editor" }]);
      if (url.pathname === "/rest/v1/catalog_records") return Response.json([{ record: stored }]);
      throw new Error("Unexpected request in catalog API test.");
    });
    vi.stubGlobal("fetch", fetchMock);
    const authenticated = (query = "") => new Request(`https://gamezone.example/api/admin/games${query}`, { headers: { authorization: "Bearer a-user-access-token" } });

    const summaryResponse = await GET(authenticated("?summary=1"));
    expect(summaryResponse.status).toBe(200);
    expect(await summaryResponse.json()).toEqual({ records: [summarizeRecord(stored)] });
    const fullResponse = await GET(authenticated());
    expect(fullResponse.status).toBe(200);
    expect((await fullResponse.json()).records[0]).toMatchObject({ id: stored.id, draft: stored.draft, published: null, lastImported: null });
    fetchMock.mockClear();
    const denied = await GET(new Request("https://gamezone.example/api/admin/games?summary=1"));
    expect(denied.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { seedRecords } from "../src/modules/catalog/seed";
import { emptyGame, type PublishedGame } from "../src/modules/catalog/types";
import { LegacyPageNotFoundError, renderLegacyPage } from "../src/modules/legacy/renderer";

const games = seedRecords.map((record) => ({ ...record.draft, id: record.id, publishedAt: record.publishedAt!, updatedAt: record.updatedAt })) as PublishedGame[];
const published = (slug = "nuevo-juego"): PublishedGame => ({ ...emptyGame(), slug, title: "Nuevo juego", summary: "Una descripción editorial propia para esta publicación de prueba.", description: ["Un párrafo para comprobar la plantilla original sin alterar el diseño existente."], coverImage: "https://images.example.com/cover.jpg", coverAlt: "Portada", genres: ["Aventura"], platforms: ["Windows"], id: slug, publishedAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T00:00:00.000Z" });
function jsonbKeyOrder<T>(value: T): T {
  if (Array.isArray(value)) return value.map(jsonbKeyOrder) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, jsonbKeyOrder(item)])) as T;
  return value;
}

describe("literal original public website", () => {
  it.each(["index.html", "games.html", "hall-of-fame.html", "about.html", "noticias.html", "dmca.html", "secret.html"])("preserves %s byte for byte when original records are unedited", async (file) => {
    expect(await renderLegacyPage(`/${file}`, games)).toBe(await readFile(file, "utf8"));
  });
  it.each(games.map((game) => game.slug))("preserves the exact original detail page %s", async (slug) => {
    expect(await renderLegacyPage(`/games/${slug}/${slug}.html`, games)).toBe(await readFile(`games/${slug}/${slug}.html`, "utf8"));
  });
  it.each(["index.html", "games.html", "hall-of-fame.html", ...games.map((game) => `games/${game.slug}/${game.slug}.html`)])("preserves %s byte for byte after JSONB recursively reorders object keys", async (file) => {
    const reordered = jsonbKeyOrder(games);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(games));
    expect(await renderLegacyPage(`/${file}`, reordered)).toBe(await readFile(file, "utf8"));
  });
  it("still recognizes edited nested values and ordered arrays after JSONB reorders object keys", async () => {
    const reordered = jsonbKeyOrder(games);
    const peak = reordered.find((game) => game.slug === "peak")!;
    peak.requirements[0].minimum = [...peak.requirements[0].minimum].reverse();
    peak.distributions[0].version = "v999-editorial";
    const html = await renderLegacyPage("/games/peak/peak.html", reordered);
    expect(html).not.toBe(await readFile("games/peak/peak.html", "utf8"));
    expect(load(html)(".game-info-sidebar .specs-list").text()).toContain("v999-editorial");
  });
  it.each(["/../.env", "/%2e%2e/.env", "/games/peak/../../.env", "/games/peak/undertale.html", "/src/modules/catalog/seed.json", "/index.html?x=1"])("rejects local path traversal and non-page paths %s", async (path) => {
    await expect(renderLegacyPage(path, games)).rejects.toBeInstanceOf(LegacyPageNotFoundError);
  });
  it("never serves an unpublished original detail page", async () => {
    await expect(renderLegacyPage("/games/peak/peak.html", games.filter((game) => game.slug !== "peak"))).rejects.toBeInstanceOf(LegacyPageNotFoundError);
  });
});

describe("original cards with published editorial data", () => {
  it("adds a published game using the original card and leaves promotional news and all CSS untouched", async () => {
    const source = await readFile("index.html", "utf8");
    const before = load(source);
    const added = published();
    added.title = '<img src=x onerror="pwned()">';
    const html = await renderLegacyPage("/index.html", [...games, added]);
    const $ = load(html);
    expect($("#news").html()).toBe(before("#news").html());
    expect($("style").html()).toBe(before("style").html());
    expect($("header").html()).toBe(before("header").html());
    expect($("footer").html()).toBe(before("footer").html());
    expect($("#games .game-card")).toHaveLength(10);
    const card = $("#games .game-card").last();
    expect(card.find(".game-title").text()).toBe(added.title);
    expect(card.find(".game-title img")).toHaveLength(0);
    expect(card.find(".game-actions a").attr("href")).toBe("/games/nuevo-juego/nuevo-juego.html");
  });
  it("removes unpublished games from catalogue cards while leaving Hall selection unchanged", async () => {
    const visible = games.filter((game) => game.slug !== "peak");
    const $ = load(await renderLegacyPage("/games.html", visible));
    expect($(".game-card")).toHaveLength(8);
    expect($("a[href='games/peak/peak.html']")).toHaveLength(0);
    const hall = load(await renderLegacyPage("/hall-of-fame.html", [...games, published()]));
    expect(hall(".hall-game-card")).toHaveLength(3);
  });
});

describe("new detail page and script-free editorial preview", () => {
  it("uses the original template classes and separates operating systems, versions and links as escaped data", async () => {
    const game = published();
    game.title = '</script><script>pwned()</script> $& $\'';
    game.description = ["<img src=x onerror=alert(1)>"];
    game.coverImage = "https://images.example.com/a'</style><script>pwned()</script>.jpg";
    game.requirements = [{ platform: "Windows", minimum: ["SO: Windows 11"], recommended: [] }, { platform: "Linux", minimum: ["SO: Ubuntu"], recommended: [] }];
    game.screenshots = ["https://images.example.com/screenshot.jpg", "javascript:alert(1)"];
    game.trailerUrl = "javascript:alert(1)";
    game.distributions = [{ label: "Base", version: "v1.2", size: "3 GB", format: "ISO", links: [{ label: "<img onerror=alert(1)>", url: "https://files.example.com/download?token=a#key", type: "base" }, { label: "Unsafe", url: "javascript:alert(1)", type: "extra" }], installation: ["<script>no()</script>"] }];
    const html = await renderLegacyPage("/games/nuevo-juego/nuevo-juego.html", [game]);
    const $ = load(html);
    expect($("h1.game-title").text()).toBe(game.title);
    expect($(".game-content img")).toHaveLength(0);
    expect($(".game-content").text()).toBe(game.description[0]);
    expect($(".requirement-card h4").map((_, node) => $(node).text()).get().join(" ")).toMatch(/Windows.*Linux/);
    expect($(".screenshots-grid .screenshot")).toHaveLength(1);
    expect($(".trailer-container iframe")).toHaveLength(0);
    expect($(".download-links a")).toHaveLength(1);
    expect($(".download-links a").attr("href")).toBe("https://files.example.com/download?token=a#key");
    expect($(".metacritic-card")).toHaveLength(0);
    expect($("script").toArray().some((node) => $(node).text() === "pwned()")).toBe(false);
    for (const node of $("script:not([src])").toArray()) expect(() => new vm.Script($(node).html() ?? "")).not.toThrow();
  });
  it("renders a draft only as preview, strips scripts and handlers, and resolves assets from its original route", async () => {
    const game = published();
    const $ = load(await renderLegacyPage("/games/nuevo-juego/nuevo-juego.html", [], { preview: true, content: game, origin: "http://127.0.0.1:3000" }));
    expect($("script,form,object,embed")).toHaveLength(0);
    expect($("[onclick],[onerror],[onload]")).toHaveLength(0);
    expect($(".loading:not(.loaded)")).toHaveLength(0);
    expect($("base").attr("href")).toBe("http://127.0.0.1:3000/games/nuevo-juego/nuevo-juego.html");
    expect($("h1.game-title").text()).toBe(game.title);
  });
});

describe("original search with the authoritative published catalogue", () => {
  it("keeps the original styles and static DOM, injects safe JSON, and removes HEAD discovery/fallback", async () => {
    const game = published();
    game.title = '</script><script>pwned()</script> "quote';
    const html = await renderLegacyPage("/buscar.html", [game]);
    const $ = load(html);
    const original = load(await readFile("buscar.html", "utf8"));
    expect($("style").html()).toBe(original("style").html());
    expect($("main").html()).toBe(original("main").html());
    const script = $("script:not([src])").map((_, node) => $(node).html()).get().find((value) => value.includes("async function initializeGamesDatabase"))!;
    expect(script).not.toContain("async function discoverGames()");
    expect(script).not.toContain("gamesDatabase = [\n");
    expect(script).toContain("\\u003c/script\\u003e");
    expect(script).toContain('data-search-term="${escapeLegacy(suggestion)}"');
    expect(script).not.toContain('onclick="searchFor(\'${suggestion}\')"');
    expect(() => new vm.Script(script)).not.toThrow();
    const context = { document: { addEventListener() {} }, console };
    const sandbox = vm.createContext(context);
    new vm.Script(script + "; initializeGamesDatabase(); globalThis.result = gamesDatabase; globalThis.card = createGameCard(gamesDatabase[0], 0);").runInContext(sandbox);
    const result = sandbox.result as { title: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(game.title);
    expect(String(sandbox.card)).not.toContain("<script>pwned()");
  });
  it("retains the original nine search records and keywords when no editorial field changed", async () => {
    const $ = load(await renderLegacyPage("/buscar.html", games));
    const script = $("script:not([src])").map((_, node) => $(node).html()).get().find((value) => value.includes("async function initializeGamesDatabase"))!;
    const sandbox = vm.createContext({ document: { addEventListener() {} }, console });
    new vm.Script(script + "; initializeGamesDatabase(); globalThis.result = gamesDatabase;").runInContext(sandbox);
    const data = sandbox.result as { title: string; keywords: string[] }[];
    expect(data).toHaveLength(9);
    expect(data.find((game) => game.title === "Deltarune")?.keywords).toContain("kris");
    expect(data.find((game) => game.title === "Undertale")?.keywords).toContain("toby fox");
  });
});

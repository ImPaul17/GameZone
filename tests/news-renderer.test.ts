import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { seedRecords } from "../src/modules/catalog/seed";
import { emptyNews, type NewsContent, type PublishedNews } from "../src/modules/news/types";
import type { PublishedGame } from "../src/modules/catalog/types";
import { LegacyPageNotFoundError, renderLegacyPage } from "../src/modules/legacy/renderer";

const games = seedRecords.map((record) => ({ ...record.draft, id: record.id, publishedAt: record.publishedAt!, updatedAt: record.updatedAt })) as PublishedGame[];
const content: NewsContent = { ...emptyNews(), title: "Nueva publicación editorial", slug: "noticia-editorial", summary: "Una noticia escrita para comprobar que se mantiene la apariencia original.",
  body: ["Un párrafo del artículo con información propia y suficiente contexto para explicar una novedad del catálogo de GameZone."],
  coverImage: "https://images.example.com/news.jpg", coverAlt: "Portada de la noticia", tags: ["Novedades"], sourceUrl: "https://example.com/reference" };
const article: PublishedNews = { ...content, id: "news-test", publishedAt: "2026-10-30T12:00:00.000Z", updatedAt: "2026-10-30T12:00:00.000Z" };

describe("news projections preserve the original public site", () => {
  it.each(["index.html", "noticias.html"])("keeps %s byte-identical when no articles are published", async (file) => {
    expect(await renderLegacyPage(`/${file}`, games, { news: [] })).toBe(await readFile(file, "utf8"));
  });
  it("appends a news card while retaining both pinned promotions, game cards, CSS and navigation", async () => {
    const original = load(await readFile("index.html", "utf8"));
    const $ = load(await renderLegacyPage("/index.html", games, { news: [article] }));
    expect($("#news .news-grid > .game-card")).toHaveLength(3);
    expect($("#news .news-grid > .game-card").eq(0).prop("outerHTML")).toBe(original("#news .news-grid > .game-card").eq(0).prop("outerHTML"));
    expect($("#news .news-grid > .game-card").eq(1).prop("outerHTML")).toBe(original("#news .news-grid > .game-card").eq(1).prop("outerHTML"));
    expect($("#games").html()).toBe(original("#games").html());
    expect($("style").html()).toBe(original("style").html());
    expect($("header").html()).toBe(original("header").html());
    expect($("footer").html()).toBe(original("footer").html());
    expect($(".news-card .game-actions a").attr("href")).toBe("/noticias/noticia-editorial.html");
  });
  it("fills the existing news feature-card grid and preserves CSS, header and footer", async () => {
    const original = load(await readFile("noticias.html", "utf8"));
    const $ = load(await renderLegacyPage("/noticias.html", games, { news: [article] }));
    expect($(".coming-soon-features .news-card")).toHaveLength(1);
    expect($(".news-card .feature-title").text()).toBe(article.title);
    expect($(".news-card .news-cover").attr("alt")).toBe(article.coverAlt);
    expect($("style").html()).toBe(original("style").html());
    expect($("header").html()).toBe(original("header").html());
    expect($("footer").html()).toBe(original("footer").html());
  });
  it("never opens a draft detail page through the public renderer", async () => {
    await expect(renderLegacyPage("/noticias/noticia-editorial.html", games, { news: [] })).rejects.toBeInstanceOf(LegacyPageNotFoundError);
  });
  it("renders article fields as inert text, validates source links and keeps assets rooted", async () => {
    const dangerous = { ...article, title: '</title><script>pwned()</script>', summary: '<img src=x onerror="pwned()">',
      body: ['<script>pwned()</script>', "Una segunda línea del artículo."], tags: ['<svg onload="pwned()">'], sourceUrl: "javascript:pwned()" };
    const html = await renderLegacyPage("/noticias/noticia-editorial.html", games, { news: [dangerous] });
    const $ = load(html);
    expect($(".news-hero-title").text()).toBe(dangerous.title);
    expect($(".news-hero-title script,.news-article script,.news-article svg,.news-hero-text img")).toHaveLength(0);
    expect($(".news-article .coming-soon-text").first().text()).toBe(dangerous.body[0]);
    expect($("a[href^='javascript:']")).toHaveLength(0);
    expect($("base").attr("href")).toBe("/");
    const original = load(await readFile("noticias.html", "utf8"));
    expect($("style").html()).toBe(original("style").html());
    expect($("header").html()).toBe(original("header").html());
    expect($("footer").html()).toBe(original("footer").html());
  });
  it("provides a script-free private preview through the shared legacy options contract", async () => {
    const $ = load(await renderLegacyPage("/noticias/noticia-editorial.html", [], { preview: true, newsContent: content, origin: "http://127.0.0.1:3000" }));
    expect($("script,form,object,embed,[onclick],[onerror]")).toHaveLength(0);
    expect($(".news-hero-title").text()).toBe(content.title);
    expect($(".loading:not(.loaded)")).toHaveLength(0);
    expect($("base").attr("href")).toBe("http://127.0.0.1:3000/");
    expect($("time")).toHaveLength(0);
  });
  it.each(["/noticias.html", "/noticias/noticia-editorial.html"])("keeps original initialization working on %s when the optional EmailJS CDN is blocked", async (path) => {
    const $ = load(await renderLegacyPage(path, games, { news: [article] }));
    const script = $("script:not([src])").map((_, node) => $(node).html()).get().find((text) => text.includes("class NotificationSystem"))!;
    const events: string[] = [];
    const context = {
      document: { addEventListener(name: string) { events.push(name); }, createElement() { return { textContent: "" }; }, head: { appendChild() {} } },
      window: { addEventListener() {} }, console,
    };
    expect(() => new vm.Script(script).runInNewContext(context)).not.toThrow();
    expect(events).toContain("DOMContentLoaded");
    expect(script).toContain('typeof emailjs !== "undefined"');
  });
});

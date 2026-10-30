import { load } from "cheerio";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const compact = (text) => text.replace(/\s+/g, " ").trim();
const unique = (items) => [...new Set(items.filter(Boolean))];
const stamp = "2025-09-25T00:00:00.000Z";
const records = [];
for (const slug of await readdir("games")) {
  const filename = path.join("games", slug, `${slug}.html`);
  const html = await readFile(filename, "utf8");
  const $ = load(html);
  const specs = new Map();
  $(".game-info-sidebar .info-card").first().find(".specs-list li").each((_, el) => {
    specs.set(compact($(el).find(".specs-label").text()).replace(/:$/, ""), compact($(el).find(".specs-value").text()));
  });
  const spec = (key) => specs.get(key) || "";
  const coverImage = html.match(/url\(['"]?(https:\/\/i\.imgur\.com\/[^'"\s)]+)['"]?\)\s*center\/cover/)?.[1] || $(".screenshot img").first().attr("src") || "";
  const steamUrl = $("a[href*='store.steampowered.com/app/']").first().attr("href") || "";
  const requirements = [];
  const cards = $(".requirements-grid .requirement-card");
  const requirementItems = (index) => cards.eq(index).find(".specs-list li").toArray().map((el) => compact($(el).text()));
  if (cards.length) requirements.push({ platform: "Windows", minimum: requirementItems(0), recommended: requirementItems(1) });
  const links = $(".download-links a[href]").toArray().map((el) => ({
    label: compact($(el).text()) || "Enlace externo", url: $(el).attr("href") || "", type: /update|actualiz/i.test($(el).text()) ? "update" : "base",
  })).filter((link) => link.url.startsWith("https://"));
  const content = {
    title: compact($("h1.game-title").first().text()), slug,
    summary: compact($(".game-hero .game-description").first().text()),
    description: $(".game-content").first().find("p").toArray().map((el) => compact($(el).text())),
    coverImage, coverAlt: compact($("h1.game-title").first().text()),
    genres: unique($(".game-hero .game-category").toArray().map((el) => compact($(el).text()))),
    platforms: ["Windows"], developer: spec("Desarrollador"), publisher: spec("Editor"),
    releaseDate: "", steamAppId: steamUrl.match(/\/app\/(\d+)/)?.[1] || "",
    languages: spec("Idiomas").split(/,\s*/).filter(Boolean), requirements,
    screenshots: unique($(".screenshot img").toArray().map((el) => $(el).attr("src") || "")),
    trailerUrl: $("iframe[src*='youtube']").first().attr("src") || "",
    distributions: links.length ? [{ label: "Enlaces del archivo original", version: spec("Versión"), size: spec("Tamaño"), format: spec("Formato"), links, installation: [] }] : [],
    evidence: [{
      field: "archive", label: "Migrado del archivo de GameZone; datos pendientes de revisión", value: "Archivo del 25 de septiembre de 2025", provider: "editorial",
      sourceUrl: `https://impaul17.github.io/GameZone/games/${slug}/${slug}.html`, retrievedAt: stamp, status: "reported",
    }],
  };
  const digest = createHash("sha256").update(`gamezone:${slug}`).digest("hex");
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  records.push({ id, draft: content, published: content, publishedAt: stamp, source: null, lastImported: null, revision: 1, createdAt: stamp, updatedAt: stamp });
}
await writeFile("src/modules/catalog/seed.json", `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(`Migradas ${records.length} fichas del archivo local. No se han visitado enlaces externos.`);

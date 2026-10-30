import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { load, type CheerioAPI } from "cheerio";
import { isTag, type AnyNode } from "domhandler";
import { seedRecords } from "../catalog/seed";
import type { GameContent, PublishedGame } from "../catalog/types";
import type { NewsContent, PublishedNews } from "../news/types";

export class LegacyPageNotFoundError extends Error {}
export interface LegacyRenderOptions { preview?: boolean; origin?: string; content?: GameContent; news?: PublishedNews[]; newsContent?: NewsContent }
const staticPages = new Set(["index.html", "games.html", "buscar.html", "hall-of-fame.html", "about.html", "noticias.html", "dmca.html", "secret.html"]);
const originals = new Map(seedRecords.map((record) => [record.draft.slug, record.draft]));
const hallSlugs = new Set(["red-dead-redemption-2", "grand-theft-auto-v-enhanced", "hollow-knight-silksong"]);
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const gameLink = (slug: string) => `/games/${slug}/${slug}.html`;
const newsLink = (slug: string) => `/noticias/${slug}.html`;
const slugFromLink = (href: string | undefined) => href?.match(/(?:^|\/)games\/([a-z0-9-]+)\/\1\.html$/)?.[1] ?? "";
function originalContent(game: GameContent) {
  const original = originals.get(game.slug);
  // JSONB may reorder object keys at every depth. Array order and every value still matter.
  return original && Object.keys(original).every((key) => isDeepStrictEqual(original[key as keyof GameContent], game[key as keyof GameContent]));
}
async function readOriginal(file: string) { return readFile(join(/* turbopackIgnore: true */ process.cwd(), file), "utf8"); }

/** No fetched HTML, arbitrary local paths or data URLs reach the legacy document. */
function safeAsset(value: string): string {
  if (/^\/(?:assets|images|logos)\/[a-zA-Z0-9_./% -]+$/.test(value)) {
    try { const decoded = decodeURIComponent(value); return decoded.includes("..") || decoded.includes("\\") || decoded.includes("//") ? "" : value; } catch { return ""; }
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") ? url.href : "";
  } catch { return ""; }
}

interface Location { startOffset: number; endOffset: number; startTag?: Location; endTag?: Location }
class DocumentEdits {
  readonly $: CheerioAPI;
  private readonly patches: { start: number; end: number; text: string }[] = [];
  constructor(private readonly source: string) { this.$ = load(source, { sourceCodeLocationInfo: true }); }
  replace(node: AnyNode | undefined, text: string, inner = false) {
    if (!node) return;
    const location = (node as AnyNode & { sourceCodeLocation?: Location }).sourceCodeLocation;
    if (!location) return;
    const start = inner ? location.startTag?.endOffset : location.startOffset;
    const end = inner ? location.endTag?.startOffset : location.endOffset;
    if (start !== undefined && end !== undefined) this.patches.push({ start, end, text });
  }
  inside(selector: string, text: string) { this.replace(this.$(selector).first()[0], text, true); }
  finish() {
    let result = this.source;
    let boundary = this.source.length + 1;
    for (const patch of this.patches.sort((a, b) => b.start - a.start)) {
      if (patch.end > boundary) throw new Error("Se han solapado cambios de la plantilla original.");
      result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
      boundary = patch.start;
    }
    return result;
  }
}

function renderCard(template: string, game: GameContent, hall = false) {
  const $ = load(template, {}, false);
  const prefix = hall ? "hall-game" : "game";
  $(`.${prefix}-title`).text(game.title);
  $(`.${prefix}-description`).text(game.summary);
  $(`.${prefix}-image img`).attr("src", safeAsset(game.coverImage)).attr("alt", game.coverAlt || game.title);
  $(`.${prefix}-categories`).html(game.genres.map((genre) => `<span class="${prefix}-category">${esc(genre)}</span>`).join("\n"));
  $(`.${prefix}-actions a`).first().attr("href", gameLink(game.slug));
  if ($("[data-categories]").length) $("[data-categories]").attr("data-categories", game.genres.map((genre) => genre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()).join(" "));
  return $.html();
}

function renderCatalogue(source: string, games: PublishedGame[], file: string) {
  const edits = new DocumentEdits(source);
  const $ = edits.$;
  const hall = file === "hall-of-fame.html";
  const selector = hall ? ".hall-game-card" : file === "index.html" ? "#games .game-card" : ".game-card";
  const bySlug = new Map(games.map((game) => [game.slug, game]));
  const seen = new Set<string>();
  const cards = $(selector).toArray();
  for (const node of cards) {
    const slug = slugFromLink($(node).find("a[href]").last().attr("href"));
    if (!slug) continue;
    seen.add(slug);
    const game = bySlug.get(slug);
    if (!game) edits.replace(node, "");
    else if (!originalContent(game)) edits.replace(node, renderCard($.html(node), game, hall));
  }
  if (!hall) {
    const template = cards.find((node) => !$(node).hasClass("hall-of-fame")) ?? cards[0];
    const fresh = games.filter((game) => !seen.has(game.slug));
    if (template && fresh.length) {
      const grid = $(template).parent()[0];
      const location = (grid as AnyNode & { sourceCodeLocation?: Location }).sourceCodeLocation;
      // Appending at the original closing tag preserves the rest of the page byte for byte.
      if (location?.endTag) edits.replace({ sourceCodeLocation: { startOffset: location.endTag.startOffset, endOffset: location.endTag.startOffset } } as unknown as AnyNode,
        fresh.map((game) => renderCard($.html(template), game)).join("\n"));
    }
  }
  return edits.finish();
}

function youtubeEmbed(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    const id = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)
      ? url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/embed\/([^/]+)$/)?.[1]
      : url.hostname === "youtu.be" ? url.pathname.slice(1) : "";
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}` : "";
  } catch { return ""; }
}
function specsRow(label: string, value: string) { return value ? `<li><span class="specs-label">${esc(label)}:</span><span class="specs-value">${esc(value)}</span></li>` : ""; }

function renderGame(source: string, game: GameContent, existing: boolean) {
  const edits = new DocumentEdits(source);
  const $ = edits.$;
  edits.inside("title", `${esc(game.title)} - GameZone`);
  edits.inside("h1.game-title", esc(game.title));
  edits.inside(".game-hero .game-categories", game.genres.map((genre) => `<span class="game-category">${esc(genre)}</span>`).join("\n"));
  edits.inside(".game-hero .game-description", esc(game.summary));
  edits.inside(".game-content", game.description.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("\n"));
  const distribution = game.distributions[0];
  edits.inside(".game-info-sidebar .specs-list", [
    specsRow("Desarrollador", game.developer), specsRow("Editor", game.publisher), specsRow("Fecha de Lanzamiento", game.releaseDate),
    specsRow("Género", game.genres.join(", ")), specsRow("Plataforma", game.platforms.join(", ")), specsRow("Idiomas", game.languages.join(", ")),
    specsRow("Tamaño", distribution?.size ?? ""), specsRow("Formato", distribution?.format ?? ""), specsRow("Versión", distribution?.version ?? ""),
  ].join("\n"));
  const requirements = game.requirements.flatMap((group) => (["minimum", "recommended"] as const).flatMap((kind) => {
    if (!group[kind].length) return [];
    const heading = kind === "minimum" ? "Requisitos Mínimos" : "Requisitos Recomendados";
    const icon = kind === "minimum" ? "desktop" : "rocket";
    return [`<div class="requirement-card loading"><h4><i class="fas fa-${icon}"></i> ${heading} · ${esc(group.platform)}</h4><ul class="specs-list">${group[kind].map((line) => {
      const colon = line.indexOf(":");
      return colon > 0 ? specsRow(line.slice(0, colon), line.slice(colon + 1).trim()) : `<li><span class="specs-value">${esc(line)}</span></li>`;
    }).join("\n")}</ul></div>`];
  })).join("\n");
  edits.inside(".requirements-grid", requirements);
  const images = game.screenshots.map(safeAsset).filter(Boolean);
  edits.inside(".screenshots-grid", images.map((image, index) => `<div class="screenshot" onclick="openImageModal(${index})"><img src="${esc(image)}" alt="${esc(game.title)} - Gameplay Screenshot ${index + 1}" style="width: 100%; height: 100%; object-fit: cover;"></div>`).join("\n"));
  const trailer = youtubeEmbed(game.trailerUrl);
  edits.inside(".trailer-container", trailer ? `<iframe width="100%" height="100%" src="${trailer}" title="${esc(game.title)} Trailer" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="border-radius: 15px;"></iframe>` : "");
  const links = game.distributions.map((item) => {
    const anchors = item.links.flatMap((link) => {
      const url = safeAsset(link.url);
      return url ? [`<a href="${esc(url)}" class="download-link" target="_blank" rel="noopener noreferrer"><i class="fas fa-cloud"></i> ${esc(link.label)}</a>`] : [];
    }).join("\n");
    return anchors ? `${game.distributions.length > 1 ? `<h4>${esc(item.label)}${item.version ? ` · ${esc(item.version)}` : ""}</h4>` : ""}${anchors}` : "";
  }).join("\n");
  edits.inside("#downloadModal .download-links", links);
  edits.inside("#download .steps-list", game.distributions.flatMap((item) => item.installation).map((line, index) => `<li class="step-item"><span class="step-number">${index + 1}</span><span class="step-text">${esc(line)}</span></li>`).join("\n"));
  edits.inside("#download .download-content > p", `Descarga ${esc(game.title)} de forma gratuita y segura`);
  const steamAnchor = $(".download-options a[href*='store.steampowered.com']").first();
  if (steamAnchor.length) {
    if (/^\d{1,12}$/.test(game.steamAppId)) {
      const clone = steamAnchor.clone().attr("href", `https://store.steampowered.com/app/${game.steamAppId}/`).attr("rel", "noopener noreferrer");
      edits.replace(steamAnchor[0], $.html(clone));
    } else edits.replace(steamAnchor.closest("section")[0], "");
  }
  // These notes describe the template's package, rather than fields available in the new record.
  $("#download .installation-note").each((_, element) => edits.replace(element, ""));
  if (steamAnchor.length && /^\d{1,12}$/.test(game.steamAppId)) steamAnchor.closest("section").find(".installation-note").each((_, element) => edits.replace(element, ""));
  if (!existing) $(".metacritic-card").each((_, element) => edits.replace($(element).closest(".info-card")[0], ""));
  const image = safeAsset(game.coverImage);
  const cssImage = image.replace(/[\\'"<>\r\n]/g, (character) => `\\${character.charCodeAt(0).toString(16)} `);
  $("style").each((_, node) => {
    const css = $(node).html() ?? "";
    const updated = css.replace(/(\.game-hero\s*\{[\s\S]*?url\(')[^']*('\))/, (_match, prefix: string, suffix: string) => `${prefix}${cssImage}${suffix}`);
    if (updated !== css) edits.replace(node, updated, true);
  });
  $("script:not([src])").each((_, node) => {
    const script = $(node).html() ?? "";
    const updated = script.replace(/const images = \[[\s\S]*?\];/, () => `const images = ${scriptJson(images.map((src, index) => ({ src, alt: `${game.title} - Gameplay Screenshot ${index + 1}` })))};`);
    if (updated !== script) edits.replace(node, updated, true);
  });
  return edits.finish();
}

interface SearchGame { id: number | string; title: string; categories: string[]; description: string; image: string; link: string; keywords: string[]; hallOfFame?: boolean; developer?: string; year?: string }
function searchData(source: string, games: PublishedGame[]): SearchGame[] {
  const start = source.indexOf("gamesDatabase = [", source.indexOf("async function initializeGamesDatabase"));
  let baseline: SearchGame[] = [];
  if (start >= 0) {
    const array = source.slice(start + "gamesDatabase = ".length, source.indexOf("];", start) + 1);
    try { baseline = JSON.parse(array.replace(/^(\s*)([a-zA-Z][a-zA-Z0-9_]*):/gm, '$1"$2":')) as SearchGame[]; } catch { /* A changed local template still uses the authoritative published records. */ }
  }
  return games.map((game) => {
    const original = originalContent(game) ? baseline.find((item) => slugFromLink(item.link) === game.slug) : undefined;
    if (original) return { ...original, image: safeAsset(original.image), link: gameLink(game.slug) };
    return { id: game.id, title: game.title, categories: game.genres, description: game.summary, image: safeAsset(game.coverImage), link: gameLink(game.slug),
      keywords: [game.title, game.developer, ...game.genres, ...game.title.toLowerCase().split(/\W+/)].filter(Boolean), hallOfFame: hallSlugs.has(game.slug), developer: game.developer, year: game.releaseDate.slice(0, 4) };
  });
}

function renderSearch(source: string, games: PublishedGame[]) {
  const data = searchData(source, games);
  const edits = new DocumentEdits(source);
  edits.$("script:not([src])").each((_, node) => {
    let script = edits.$(node).html() ?? "";
    if (!script.includes("async function initializeGamesDatabase")) return;
    const discovery = script.indexOf("async function discoverGames()");
    const initialize = script.indexOf("async function initializeGamesDatabase()");
    if (discovery >= 0) script = script.slice(0, discovery) + script.slice(initialize);
    const initStart = script.indexOf("async function initializeGamesDatabase()");
    const initEnd = script.indexOf("// Initialize Fuse.js", initStart);
    if (initStart < 0 || initEnd < 0) throw new Error("La plantilla local del buscador ha cambiado.");
    script = script.slice(0, initStart) + `async function initializeGamesDatabase() { gamesDatabase = ${scriptJson(data)}; }\n\n` + script.slice(initEnd);
    const cardStart = script.indexOf("function createGameCard(");
    const cardEnd = script.indexOf("// Function to perform search", cardStart);
    let card = script.slice(cardStart, cardEnd);
    for (const value of ["game.image", "game.title", "category", "game.description", "game.developer", "game.year", "game.link"]) card = card.split(`\${${value}}`).join(`\${escapeLegacy(${value})}`);
    script = script.slice(0, cardStart) + card + script.slice(cardEnd);
    script = script.replaceAll('onclick="searchFor(\'${suggestion}\')"', 'data-search-term="${escapeLegacy(suggestion)}"')
      .replaceAll("${suggestion}", "${escapeLegacy(suggestion)}");
    const helper = `\nfunction escapeLegacy(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }\ndocument.addEventListener('click', function(event) { const target = event.target.closest('[data-search-term]'); if (target) searchFor(target.dataset.searchTerm); });\n`;
    edits.replace(node, helper + script, true);
  });
  return edits.finish();
}

function previewDocument(source: string, basePath: string, origin?: string) {
  const $ = load(source);
  $("script,object,embed,form,base").remove();
  $("*").each((_, node) => { if (isTag(node)) for (const name of Object.keys(node.attribs)) if (/^on/i.test(name)) $(node).removeAttr(name); });
  $(".loading").addClass("loaded").css({ opacity: "1", transform: "none" });
  $(".modal-overlay,.image-modal").remove();
  const parsed = new URL(origin || "http://localhost");
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Origen de vista previa no permitido.");
  $("head").prepend(`<base href="${esc(`${parsed.origin}${basePath}`)}">`);
  return $.html();
}

function newsDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "long", day: "numeric" });
}
function newsCover(content: NewsContent) {
  const source = safeAsset(content.coverImage);
  return source ? `<img class="news-cover" src="${esc(source)}" alt="${esc(content.coverAlt)}" loading="lazy" style="width:100%;height:200px;object-fit:cover;border-radius:15px;">` : "";
}
function orderedNews(news: PublishedNews[]) { return [...news].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id)); }

function guardOptionalNewsEmailSdk(edits: DocumentEdits) {
  edits.$("script:not([src])").each((_, node) => {
    const script = edits.$(node).html() ?? "";
    if (!script.includes("class NotificationSystem")) return;
    const guarded = script.replace(/emailjs\.init\(([^\n;]*)\);/, (_match, arguments_: string) =>
      `if (typeof emailjs !== "undefined" && typeof emailjs.init === "function") { emailjs.init(${arguments_}); }`);
    if (guarded !== script) edits.replace(node, guarded, true);
  });
}

function renderNewsHome(source: string, news: PublishedNews[]) {
  if (!news.length) return source;
  const edits = new DocumentEdits(source);
  const $ = edits.$;
  const grid = $("#news .news-grid").first()[0];
  const location = (grid as AnyNode & { sourceCodeLocation?: Location } | undefined)?.sourceCodeLocation;
  const template = $("#games .game-card").first();
  if (!location?.endTag || !template.length) return source;
  const cards = orderedNews(news).slice(0, 6).map((article) => {
    const card = template.clone().addClass("news-card");
    card.find(".game-title").text(article.title);
    card.find(".game-description").text(article.summary);
    card.find(".game-image img").attr("src", safeAsset(article.coverImage)).attr("alt", article.coverAlt);
    card.find(".game-categories").html(article.tags.map((tag) => `<span class="game-category">${esc(tag)}</span>`).join("\n"));
    card.find(".game-actions a").attr("href", newsLink(article.slug)).html('<i class="fas fa-newspaper"></i> Leer noticia');
    return $.html(card);
  }).join("\n");
  edits.replace({ sourceCodeLocation: { startOffset: location.endTag.startOffset, endOffset: location.endTag.startOffset } } as unknown as AnyNode, cards);
  return edits.finish();
}

/** The empty news page remains literal. Published articles occupy its original feature-card grid. */
function renderNewsListing(source: string, news: PublishedNews[]) {
  if (!news.length) return source;
  const edits = new DocumentEdits(source);
  guardOptionalNewsEmailSdk(edits);
  edits.inside(".news-hero-text", "Mantente al día con las últimas noticias, reseñas y actualizaciones del mundo gaming.");
  edits.inside(".coming-soon-title", "Últimas noticias");
  edits.inside(".coming-soon-text", "Noticias, novedades y actualidad del mundo gaming");
  edits.inside(".coming-soon-features", orderedNews(news).map((article) => `<article class="feature-card news-card loading">
    ${newsCover(article)}<div class="feature-icon"><i class="fas fa-newspaper"></i></div>
    <h3 class="feature-title">${esc(article.title)}</h3><p class="feature-text">${esc(article.summary)}</p>
    <p class="feature-text"><time datetime="${esc(article.publishedAt)}">${esc(newsDate(article.publishedAt))}</time></p>
    <p class="feature-text">${article.tags.map(esc).join(" · ")}</p>
    <a href="${newsLink(article.slug)}" class="btn btn-primary"><i class="fas fa-newspaper"></i> Leer noticia</a>
  </article>`).join("\n"));
  return edits.finish();
}

function renderNewsDetail(source: string, content: NewsContent, publishedAt?: string) {
  const edits = new DocumentEdits(source);
  guardOptionalNewsEmailSdk(edits);
  edits.inside("title", `${esc(content.title)} - GameZone`);
  edits.inside(".news-hero-title", esc(content.title));
  edits.inside(".news-hero-text", esc(content.summary));
  const $ = edits.$;
  const mainArticle = $(".coming-soon").first();
  const article = `<div class="container"><article class="news-article">
    ${newsCover(content)}
    ${publishedAt ? `<p class="feature-text"><time datetime="${esc(publishedAt)}">${esc(newsDate(publishedAt))}</time></p>` : ""}
    ${content.tags.length ? `<p class="feature-text">${content.tags.map(esc).join(" · ")}</p>` : ""}
    ${content.body.map((paragraph) => `<p class="coming-soon-text">${esc(paragraph)}</p>`).join("\n")}
    ${safeAsset(content.sourceUrl) ? `<a href="${esc(safeAsset(content.sourceUrl))}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> Consultar fuente</a>` : ""}
    <a href="/noticias.html" class="btn btn-primary"><i class="fas fa-newspaper"></i> Todas las noticias</a>
  </article></div>`;
  edits.replace(mainArticle[0], article, true);
  // All source assets and navigation were authored for a root-level HTML page.
  const head = $("head").first()[0];
  const location = (head as AnyNode & { sourceCodeLocation?: Location } | undefined)?.sourceCodeLocation;
  if (location?.startTag) edits.replace({ sourceCodeLocation: { startOffset: location.startTag.endOffset, endOffset: location.startTag.endOffset } } as unknown as AnyNode, '<base href="/">');
  return edits.finish();
}

export async function renderLegacyNewsPreview(content: NewsContent, origin?: string): Promise<string> {
  return renderLegacyPage(newsLink(content.slug), [], { preview: true, newsContent: content, origin });
}

/** Reads only whitelisted, trusted repository templates and projects published structured data into them. */
export async function renderLegacyPage(path: string, games: PublishedGame[], options: LegacyRenderOptions = {}): Promise<string> {
  if (typeof path !== "string" || !path.startsWith("/") || /[\\%?#\u0000]/.test(path)) throw new LegacyPageNotFoundError("Página no encontrada.");
  const file = path === "/" ? "index.html" : path.slice(1);
  if (staticPages.has(file)) {
    const source = await readOriginal(file);
    if (options.preview) throw new LegacyPageNotFoundError("La vista previa requiere una ficha de juego.");
    if (file === "buscar.html") return renderSearch(source, games);
    if (file === "noticias.html") return renderNewsListing(source, options.news ?? []);
    if (["index.html", "games.html", "hall-of-fame.html"].includes(file)) {
      const catalogue = renderCatalogue(source, games, file);
      return file === "index.html" ? renderNewsHome(catalogue, options.news ?? []) : catalogue;
    }
    return source;
  }
  const articleSlug = path.match(/^\/noticias\/([a-z0-9]+(?:-[a-z0-9]+)*)\.html$/)?.[1];
  if (articleSlug) {
    const content = options.preview && options.newsContent ? options.newsContent : options.news?.find((article) => article.slug === articleSlug);
    if (!content || content.slug !== articleSlug) throw new LegacyPageNotFoundError("Noticia no encontrada.");
    const publishedAt = !options.preview && "publishedAt" in content && typeof content.publishedAt === "string" ? content.publishedAt : undefined;
    const rendered = renderNewsDetail(await readOriginal("noticias.html"), content, publishedAt);
    return options.preview ? previewDocument(rendered, "/", options.origin) : rendered;
  }
  const slug = path.match(/^\/games\/([a-z0-9]+(?:-[a-z0-9]+)*)\/\1\.html$/)?.[1];
  if (!slug) throw new LegacyPageNotFoundError("Página no encontrada.");
  const game = options.preview && options.content ? options.content : games.find((item) => item.slug === slug);
  if (!game || game.slug !== slug) throw new LegacyPageNotFoundError("Juego no encontrado.");
  const existing = originals.has(slug);
  const source = await readOriginal(existing ? `games/${slug}/${slug}.html` : "games/peak/peak.html");
  const rendered = originalContent(game) ? source : renderGame(source, game, existing);
  return options.preview ? previewDocument(rendered, gameLink(game.slug), options.origin) : rendered;
}

import { load } from "cheerio";
import { z } from "zod";
import { emptyGame, slugify, type FieldEvidence, type GameDistribution, type GameRequirements, type ImportResult } from "../catalog/types";
import { isPublicAddress, safeHttps } from "./safe-http";
import ipaddr from "ipaddr.js";

const HOST = "pivigames.blog";
const GENRES = ["Acción", "Aventura", "Rol", "Estrategia", "Simulación", "Deportes", "Carreras", "Terror", "Supervivencia", "Plataformas", "Puzles", "Casual", "Indie"];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();

/** Source URL input deliberately excludes queries, fragments, userinfo and alternate hosts. */
export function validateSourceUrl(value: string): URL {
  if (typeof value !== "string" || value.length > 2048 || !/^https:\/\/pivigames\.blog(?::443)?\//i.test(value)
    || /[\\\s\u0000-\u001f\u007f]/.test(value)) throw new Error("Introduce un enlace HTTPS de una publicación de pivigames.blog.");
  const url = new URL(value);
  if (url.hostname !== HOST || url.protocol !== "https:" || url.username || url.password
    || (url.port && url.port !== "443") || url.search || url.hash
    || /%(?:2f|5c|00|0a|0d)/i.test(url.pathname)
    || url.pathname === "/" || /^\/(?:wp-json|wp-admin|wp-content|wp-login\.php)(?:\/|$)/i.test(url.pathname)) {
    throw new Error("La URL no identifica una publicación admitida de PiviGames.");
  }
  return url;
}

/** Links remain data only: the importer never requests images or download destinations. */
export function safeDataUrl(value: string | undefined): string {
  if (!value || value.length > 2048 || /[\\\s\u0000-\u001f\u007f]/.test(value)) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return "";
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || !host.includes(".") || /\.(?:localhost|local|internal|test|invalid)$/i.test(host)) return "";
    if (ipaddr.isValid(host) && !isPublicAddress(host)) return "";
    return url.href;
  } catch { return ""; }
}

const postSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  link: z.string().max(2048),
  title: z.object({ rendered: z.string().max(2000) }),
  content: z.object({ rendered: z.string().max(2 * 1024 * 1024) }),
  jetpack_featured_media_url: z.string().optional(),
  yoast_head_json: z.object({ og_image: z.array(z.object({ url: z.string() })).max(20).optional() }).optional(),
});

function titleAndVersion(original: string) {
  const version = original.match(/(?:^|\s)(v(?:ersi[oó]n)?\.?\s*\d[\w.+-]*(?:\s*\([^)]{0,40}\))?)\s*$/i)?.[1] ?? "";
  let title = version ? original.slice(0, original.lastIndexOf(version)).trim() : original;
  title = title.replace(/^descargar\s+/i, "").replace(/\s+(?:PARA\s+)?PC(?:\s+(?:EN\s+)?(?:ESPAÑOL|ENGLISH|INGLÉS|MULTI(?:IDIOMA)?\d*|FULL))*\s*$/i, "").trim();
  return { title, version: clean(version) };
}

function getPlatform(text: string) {
  const value = normalize(text);
  if (/windows|win\s*(?:7|8|10|11|xp)/.test(value)) return "Windows";
  if (/linux|ubuntu|steamos/.test(value)) return "Linux";
  if (/macos|mac os|os x|\bmac\b/.test(value)) return "macOS";
  return "";
}

/** Pure adapter for a WordPress REST post; remote HTML is always converted to plain strings. */
export function parsePiviPost(raw: unknown, sourceUrl: string, fetchedAt = new Date().toISOString()): ImportResult {
  const requested = validateSourceUrl(sourceUrl);
  const post = postSchema.parse(raw);
  const canonical = validateSourceUrl(post.link);
  if (canonical.href.replace(/\/$/, "") !== requested.href.replace(/\/$/, "")) {
    throw new Error("La identidad canónica de la publicación no coincide con el enlace solicitado.");
  }
  const $title = load(post.title.rendered);
  $title("script,style,iframe,object,embed,template,noscript,svg,form").remove();
  const originalTitle = clean($title.root().text());
  const { title, version } = titleAndVersion(originalTitle);
  if (!title) throw new Error("La publicación no contiene un título utilizable.");
  const $ = load(post.content.rendered);
  const trailerFrame = $("iframe[src]").map((_, element) => $(element).attr("src")).get()
    .find((src) => /^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{11}(?:[?/#]|$)/.test(src));
  const steamFrame = $("iframe[src]").map((_, element) => $(element).attr("src")).get()
    .find((src) => /^https:\/\/store\.steampowered\.com\/widget\/\d+(?:\/|$)/.test(src));
  $("script,style,iframe,object,embed,template,noscript,svg,form,button,nav,footer,aside,[class*='advert'],[class*='adsbygoogle'],[id*='advert'],.sharedaddy,.wp-block-embed").remove();
  const content = emptyGame();
  content.platforms = [];
  content.title = title.slice(0, 200);
  content.slug = slugify(title).slice(0, 160).replace(/-$/, "");
  if (!content.slug) throw new Error("El título no permite proponer un identificador. Crea la ficha manualmente.");
  content.coverImage = safeDataUrl(post.jetpack_featured_media_url)
    || safeDataUrl(post.yoast_head_json?.og_image?.[0]?.url);
  content.coverAlt = ""; // Editorially authored alt text is required before publication.
  content.steamAppId = steamFrame?.match(/\/widget\/(\d+)/)?.[1] ?? "";
  content.trailerUrl = trailerFrame ? `https://www.youtube.com/watch?v=${trailerFrame.match(/\/embed\/([A-Za-z0-9_-]{11})/)?.[1]}` : "";
  const warnings: string[] = ["Propuesta importada: revisa y adapta los textos, la procedencia de los medios y todos los enlaces antes de publicar."];
  const evidence = (field: string, label: string, value: string): FieldEvidence => ({ field, label, value: value.slice(0, 20000),
    provider: "pivigames", sourceUrl: canonical.href, retrievedAt: fetchedAt, status: "reported" });
  content.evidence.push(evidence("title", "Título declarado en la publicación", originalTitle));
  let section = "description";
  let requirementsMode: "minimum" | "recommended" = "minimum";
  let requirementLines: string[] = [];
  let requirementPlatform = "";
  let size = "";
  let format = "";
  let distribution: GameDistribution | undefined;
  const installation: string[] = [];
  const flushRequirements = () => {
    if (!requirementLines.length) return;
    const platform = requirementPlatform || "Sistema sin identificar";
    let group = content.requirements.find((item) => item.platform === platform);
    if (!group) {
      group = { platform, minimum: [], recommended: [] } satisfies GameRequirements;
      if (content.requirements.length < 10) content.requirements.push(group);
    }
    group[requirementsMode].push(...requirementLines.slice(0, 30 - group[requirementsMode].length));
    requirementLines = [];
  };
  const newDistribution = (label: string) => {
    const item: GameDistribution = { label: label || "Distribución de PiviGames", version: (label.match(/\bv\d[\w.+-]*/i)?.[0] ?? version).slice(0, 120),
      size, format, links: [], installation: [] };
    if (content.distributions.length < 20) content.distributions.push(item);
    distribution = item;
    return item;
  };
  $("h1,h2,h3,h4,h5,p,li").each((_, element) => {
    const node = $(element);
    if (node.parents("blockquote").length) return; // Commercial widgets are not editorial copy.
    const text = clean(node.text());
    if (!text && !(section === "downloads" && node.find("a[href]").length)) return;
    const comparable = normalize(text);
    const heading = /^h[1-5]$/.test(element.tagName);
    if (heading) {
      if (/ficha tecnica|informacion tecnica/.test(comparable)) { flushRequirements(); section = "specs"; return; }
      if (/requisitos/.test(comparable)) { flushRequirements(); section = "requirements"; requirementPlatform = getPlatform(text); return; }
      if (/instrucciones|instalacion/.test(comparable)) { flushRequirements(); section = "installation"; return; }
      if (/enlaces? de descarga|descargas/.test(comparable)) { flushRequirements(); section = "downloads"; return; }
      if (/capturas|screenshots|trailer/.test(comparable)) { flushRequirements(); section = "media"; return; }
      if (section === "requirements") {
        flushRequirements();
        requirementPlatform = getPlatform(text) || requirementPlatform;
        if (/recomendad/.test(comparable)) requirementsMode = "recommended";
        else if (/minim/.test(comparable)) requirementsMode = "minimum";
        return;
      }
      if (section === "downloads") { newDistribution(text.slice(0, 200)); return; }
      return;
    }
    if (section === "requirements" && element.tagName === "li") {
      const detectedPlatform = getPlatform(text);
      if (/^(?:so|sistema operativo|os)\s*:/i.test(text) && detectedPlatform && requirementPlatform && detectedPlatform !== requirementPlatform) flushRequirements();
      requirementPlatform = detectedPlatform || requirementPlatform;
      if (requirementLines.length < 30) requirementLines.push(text.slice(0, 500));
    } else if (section === "installation" && element.tagName === "li") {
      if (installation.length < 20) installation.push(text.slice(0, 500));
    } else if (section === "specs" && element.tagName === "li") {
      const match = text.match(/^([^:]{2,50}):\s*(.+)$/);
      if (!match) return;
      const [, label, value] = match;
      const key = normalize(label);
      if (/plataforma/.test(key)) content.platforms = getPlatform(value) ? [getPlatform(value)] : /\bpc\b/i.test(value) ? ["PC"] : [];
      else if (/peso|tamano/.test(key)) size = value.slice(0, 120);
      else if (/formato/.test(key)) format = value.slice(0, 120);
      else if (/idioma|textos/.test(key)) {
        const languageValue = value.split(/dubbing|audio\s*:|voces\s*:/i)[0].trim();
        content.languages = [...new Set(languageValue.split(/[,;]/).map((language) => clean(language).slice(0, 120)).filter(Boolean))].slice(0, 30);
        content.evidence.push(evidence("languages", "Idiomas/textos declarados para la distribución; audio sin verificar", value));
      } else if (/genero|categoria/.test(key)) {
        content.genres = GENRES.filter((genre) => normalize(value).split(/[,;/]/).map(clean).includes(normalize(genre)));
      }
    } else if (section === "description" && element.tagName === "p" && content.description.length < 3) {
      if (node.find("a,img").length || text.length < 80 || /comprar|oferta|promocion|suscrib|patrocin|publicidad|descomprimir|setup\.exe|hacer clic/i.test(comparable)) return;
      const paragraph = text.replace(/^descargar\s+[^.!?]{0,100}?\s+(?:el juego|es un juego)\s+/i, "El juego ");
      content.description.push(paragraph.slice(0, 1500));
    }
    if (section === "downloads" && (element.tagName === "p" || element.tagName === "li")) {
      node.find("a[href]").each((__, link) => {
        const url = safeDataUrl($(link).attr("href"));
        if (!url || url.startsWith(`https://${HOST}/`)) return;
        const current = distribution ?? newDistribution("Distribución de PiviGames");
        if (current.links.length >= 20 || current.links.some((item) => item.url === url)) return;
        const label = clean($(link).text()) || new URL(url).hostname;
        current.links.push({ label: label.slice(0, 120), url,
          type: /actualiz|update|parche/i.test(current.label) ? "update" : /dlc|extra/i.test(current.label) ? "extra" : "base" });
      });
    }
  });
  flushRequirements();
  if (content.distributions.length === 0 && (version || size || format)) newDistribution("Distribución de PiviGames");
  content.distributions.forEach((item) => { item.size = size; item.format = format; item.installation = [...installation]; });
  const firstParagraph = content.description[0] ?? "";
  content.summary = firstParagraph.length > 320 ? `${firstParagraph.slice(0, 317).replace(/\s+\S*$/, "")}…` : firstParagraph;
  $(".tiled-gallery img,.gallery img,figure.wp-block-gallery img").each((_, element) => {
    const image = safeDataUrl($(element).attr("data-orig-file")) || safeDataUrl($(element).attr("src"));
    if (image && !content.screenshots.includes(image) && content.screenshots.length < 12) content.screenshots.push(image);
  });
  for (const field of ["summary", "coverImage", "steamAppId"] as const) {
    if (content[field]) content.evidence.push(evidence(field, field === "steamAppId" ? "Referencia Steam del artículo; confirmar edición" : field, content[field]));
  }
  for (const [index, requirements] of content.requirements.entries()) {
    content.evidence.push(evidence(`requirements.${index}`, `Requisitos reportados: ${requirements.platform}`,
      JSON.stringify(requirements)));
  }
  for (const [index, item] of content.distributions.entries()) content.evidence.push(evidence(`distributions.${index}`, "Datos del archivo de origen, sin verificar", JSON.stringify(item)));
  if (/regal|gratis|oferta|promocion/.test(normalize(originalTitle)) && !size && !content.requirements.length) warnings.push("Posible noticia promocional, no ficha de juego. No se ha comprobado la vigencia de la promoción.");
  if (!content.summary) warnings.push("No se ha identificado un resumen útil. Redacta un resumen editorial.");
  if (!content.coverImage) warnings.push("Falta una portada verificable; no se han elegido imágenes del artículo al azar.");
  if (!content.genres.length) warnings.push("Clasificación pendiente: las categorías de origen no se interpretan como géneros automáticamente.");
  if (!content.requirements.length) warnings.push("No se han identificado requisitos. Contrástalos con la tienda o el desarrollador.");
  warnings.push("Desarrollador, editor y lanzamiento pendientes de una fuente complementaria. Las fechas del artículo no son fechas del juego.");
  if (content.distributions.length) warnings.push("Los enlaces y las instrucciones se conservan como datos sin abrirlos ni ejecutarlos. Los enlaces HTTP o inseguros se han omitido.");
  return { content, source: { provider: "pivigames", id: String(post.id), url: canonical.href }, warnings, fetchedAt };
}

/** Resolve immutable WordPress identity from HTML, never from a guessed slug. */
export async function importFromPiviGames(value: string): Promise<ImportResult> {
  const source = validateSourceUrl(value);
  const html = await safeHttps(source.href, { allowedHosts: [HOST] });
  if (!/text\/html/i.test(html.contentType)) throw new Error("La fuente no devolvió una página HTML pública.");
  const finalUrl = validateSourceUrl(html.url);
  const $ = load(html.body);
  const canonicalValue = $("link[rel='canonical']").attr("href");
  if (canonicalValue && validateSourceUrl(canonicalValue).href.replace(/\/$/, "") !== finalUrl.href.replace(/\/$/, "")) {
    throw new Error("El enlace canónico no coincide con la publicación solicitada.");
  }
  let postId = "";
  $("link[rel='shortlink'],link[rel='alternate']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const link = new URL(href, finalUrl);
      if (link.origin !== finalUrl.origin || link.username || link.password || link.hash) return;
      if ($(element).attr("rel") === "shortlink" && link.pathname === "/" && /^\?p=\d+$/.test(link.search)) postId ||= link.searchParams.get("p") ?? "";
      else if ($(element).attr("type") === "application/json" && !link.search) postId ||= link.pathname.match(/^\/wp-json\/wp\/v2\/posts\/(\d+)\/?$/)?.[1] ?? "";
    } catch { /* Ignore unrelated metadata; never follow it. */ }
  });
  if (!/^[1-9]\d{0,14}$/.test(postId)) throw new Error("No se ha encontrado una identidad WordPress fiable. Puedes crear la ficha manualmente.");
  const rest = await safeHttps(`https://${HOST}/wp-json/wp/v2/posts/${postId}`, { allowedHosts: [HOST], redirects: 0 });
  if (!/application\/json/i.test(rest.contentType)) throw new Error("La fuente REST no devolvió JSON; importación detenida.");
  const result = parsePiviPost(JSON.parse(rest.body), finalUrl.href);
  if (result.source.id !== postId) throw new Error("El identificador devuelto por WordPress no coincide con la publicación.");
  return result;
}

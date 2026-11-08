import "server-only";
import { load } from "cheerio";
import { safeHttps } from "./safe-http";
import { validateSourceUrl } from "./pivigames";
import type { BatchDiscovery } from "./batch-types";

const index = "https://pivigames.blog/sitemap_index.xml";
export function validateSitemap(value: string): URL {
  if (!/^https:\/\/pivigames\.blog\/(?:sitemap_index\.xml|post-sitemap(?:[2-9]|[1-9]\d{1,3})?\.xml)$/.test(value)) throw new Error("Elige un sitemap público de entradas de pivigames.blog, sin consultas ni otros destinos.");
  return new URL(value);
}
export async function discoverBatchURLs(value = index): Promise<BatchDiscovery> {
  const url = validateSitemap(value);
  const response = await safeHttps(url.href, { allowedHosts: ["pivigames.blog"], redirects: 0, maxBytes: 2 * 1024 * 1024 });
  if (!/(?:application|text)\/(?:[\w.+-]*\+)?xml\b/i.test(response.contentType) || /<!DOCTYPE|<!ENTITY/i.test(response.body)) throw new Error("La fuente no devolvió un sitemap XML admitido.");
  const $ = load(response.body, { xmlMode: true });
  if ($("sitemapindex").length) {
    const sitemaps = [...new Set($("sitemapindex > sitemap > loc").toArray().flatMap(node => {
      const target = $(node).text().trim(); try { return [validateSitemap(target).href]; } catch { return []; }
    }))].filter(target => target !== index).slice(0, 100);
    return { source: url.href, urls: [], sitemaps, message: "Elige un sitemap de entradas para cargar hasta 1000 enlaces. No se han importado publicaciones." };
  }
  if (!$("urlset").length) throw new Error("El documento no contiene un índice o listado de publicaciones.");
  // Direct-child loc excludes image:loc and all media/download destinations.
  const urls = [...new Set($("urlset > url > loc").toArray().flatMap(node => {
    const target = $(node).text().trim(); try { return [validateSourceUrl(target).href]; } catch { return []; }
  }))].slice(0, 1000);
  return { source: url.href, urls, sitemaps: [], message: "Los enlaces pueden incluir juegos, noticias, promociones o Android. Revísalos antes de crear el lote; solo se guardarán borradores, sin publicar." };
}

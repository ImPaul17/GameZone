import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";
import ipaddr from "ipaddr.js";

const MAX_BODY = 2 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

/** Structured upstream failures let batch workers pause instead of hammering a blocked source. */
export class SourceHttpError extends Error {
  constructor(public readonly status: number, public readonly retryAfterMs?: number) {
    super(status === 429 ? "La fuente ha limitado las consultas; inténtalo más tarde."
      : `La fuente devolvió HTTP ${status}. La publicación no se ha modificado.`);
    this.name = "SourceHttpError";
  }
}
function retryAfter(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value; if (!raw) return undefined;
  const milliseconds = /^\d+$/.test(raw.trim()) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.min(3600000, Math.max(2000, milliseconds)) : undefined;
}
function sourceChallenge(body: string, contentType: string): boolean {
  return /text\/html/i.test(contentType) && (/<title[^>]*>\s*(?:Just a moment|Attention Required|Verifica que eres humano)/i.test(body)
    || /<(?:form|div)[^>]+id=["'](?:challenge-form|cf-challenge-running)["']/i.test(body));
}

/** Reject special-use, private, loopback and IPv4-mapped private addresses. */
export function isPublicAddress(value: string): boolean {
  try {
    return ipaddr.process(value).range() === "unicast";
  } catch {
    return false;
  }
}

export interface HttpResult {
  body: string;
  url: string;
  contentType: string;
}

interface RequestOptions {
  allowedHosts: readonly string[];
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
  redirects?: number;
  deadline?: number;
}

function checkDestination(url: URL, hosts: readonly string[]) {
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.username || url.password
    || (url.port && url.port !== "443") || url.hash) {
    throw new Error("Destino HTTPS no autorizado.");
  }
}

/** Node-only transport: DNS answers are checked and the selected IP is pinned to this TLS connection. */
export async function safeHttps(urlValue: string, options: RequestOptions): Promise<HttpResult> {
  if (typeof window !== "undefined") throw new Error("El importador solo puede ejecutarse en servidor.");
  const url = new URL(urlValue);
  checkDestination(url, options.allowedHosts);
  const deadline = options.deadline ?? Date.now() + TIMEOUT_MS;
  if (deadline <= Date.now()) throw new Error("Tiempo de consulta a la fuente agotado.");
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const results = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("Tiempo de resolución DNS agotado.")), deadline - Date.now());
      dnsTimer.unref();
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!results.length || results.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("La fuente resolvió a una dirección privada o reservada.");
  }
  const address = results.find((item) => item.family === 4) ?? results[0];
  const result = await new Promise<HttpResult | { redirect: string }>((resolve, reject) => {
    const maxBytes = options.maxBytes ?? MAX_BODY;
    const req = request(url, {
      method: options.method ?? "GET",
      agent: false,
      servername: url.hostname,
      family: address.family,
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      headers: {
        "User-Agent": "GameZone-Editorial/0.1 (+manual editorial import)",
        Accept: "application/json,text/html;q=0.9",
        "Accept-Encoding": "gzip, br, deflate",
        ...options.headers,
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        if (!response.headers.location) { reject(new Error("Redirección sin destino.")); return; }
        resolve({ redirect: new URL(response.headers.location, url).href });
        return;
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        reject(new SourceHttpError(status, retryAfter(response.headers["retry-after"])));
        return;
      }
      if (Number(response.headers["content-length"] ?? 0) > maxBytes) {
        response.destroy(); reject(new Error("La respuesta de la fuente supera el límite permitido.")); return;
      }
      let rawBytes = 0;
      response.on("data", (chunk: Buffer) => {
        rawBytes += chunk.length;
        if (rawBytes > maxBytes) req.destroy(new Error("La respuesta comprimida supera el límite permitido."));
      });
      const encoding = (response.headers["content-encoding"] ?? "identity").toLowerCase();
      let stream: Readable = response;
      if (encoding === "gzip") stream = response.pipe(createGunzip());
      else if (encoding === "br") stream = response.pipe(createBrotliDecompress());
      else if (encoding === "deflate") stream = response.pipe(createInflate());
      else if (encoding !== "identity") {
        response.destroy(); reject(new Error("Compresión remota no compatible.")); return;
      }
      response.on("error", reject);
      stream.on("error", (error) => { req.destroy(); reject(error); });
      void (async () => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of stream) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > maxBytes) {
            req.destroy(); stream.destroy();
            throw new Error("La respuesta descomprimida supera el límite permitido.");
          }
          chunks.push(buffer);
        }
        const body = Buffer.concat(chunks).toString("utf8"); const contentType = response.headers["content-type"] ?? "";
        if (sourceChallenge(body, contentType)) throw new SourceHttpError(403, retryAfter(response.headers["retry-after"]));
        resolve({ body, url: url.href, contentType });
      })().catch(reject);
    });
    const timer = setTimeout(() => req.destroy(new Error("Tiempo de consulta a la fuente agotado.")),
      Math.max(1, deadline - Date.now()));
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end(options.body);
  });
  if ("redirect" in result) {
    const remaining = options.redirects ?? 2;
    if (!remaining || options.method === "POST") throw new Error("Redirección de la fuente no permitida.");
    const next = new URL(result.redirect);
    checkDestination(next, options.allowedHosts);
    // A redirect may never expand the host or introduce credentials or queries.
    if (next.hostname !== url.hostname || next.search) throw new Error("Redirección fuera de la fuente permitida.");
    return safeHttps(next.href, { ...options, redirects: remaining - 1, deadline });
  }
  return result;
}

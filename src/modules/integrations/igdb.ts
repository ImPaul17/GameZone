import { z } from "zod";
import type { FieldEvidence, GameContent } from "../catalog/types";
import { safeHttps } from "../imports/safe-http";
import { safeDataUrl } from "../imports/pivigames";

export interface IgdbCandidate {
  id: number;
  title: string;
  url: string;
  platforms: string[];
  gameType: string;
  evidence: FieldEvidence[];
}

export interface IgdbResult {
  evidence: FieldEvidence[];
  warnings: string[];
  candidates?: IgdbCandidate[];
}

const named = z.object({ name: z.string().max(400) });
const gameSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(400),
  url: z.string().optional(),
  game_type: named.optional(),
  platforms: z.array(named).max(100).optional(),
  genres: z.array(named).max(100).optional(),
  involved_companies: z.array(z.object({ company: named, developer: z.boolean().optional(), publisher: z.boolean().optional() })).max(100).optional(),
  cover: z.object({ url: z.string().max(2048) }).optional(),
  release_dates: z.array(z.object({ human: z.string().max(100).optional(), platform: named.optional(),
    date_format: z.object({ format: z.string().max(100) }).optional(),
    release_region: z.object({ region: z.string().max(100) }).optional() })).max(100).optional(),
  external_games: z.array(z.object({ uid: z.string().max(100), url: z.string().optional(), external_game_source: named.optional() })).max(100).optional(),
  language_supports: z.array(z.object({ language: named, language_support_type: named })).max(150).optional(),
});

let appToken: { value: string; expiresAt: number; clientId: string } | undefined;
let tokenRequest: Promise<string> | undefined;
let running = 0;
let nextRequestAt = 0;
let quotaQueue = Promise.resolve();
const cache = new Map<string, { expiresAt: number; candidates: IgdbCandidate[] }>();
const MAX_CACHE = 100;

async function pace() {
  // In-process quota gate; shared/deployed instances need the external rate limiter too.
  const turn = quotaQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 300;
  });
  quotaQueue = turn.catch(() => undefined);
  return turn;
}

async function getAppToken(clientId: string, secret: string) {
  if (appToken?.clientId === clientId && appToken.expiresAt > Date.now()) return appToken.value;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    const body = new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: "client_credentials" }).toString();
    const response = await safeHttps("https://id.twitch.tv/oauth2/token", {
      allowedHosts: ["id.twitch.tv"], method: "POST", redirects: 0,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, maxBytes: 32_768,
    });
    const token = z.object({ access_token: z.string().min(1).max(4096), expires_in: z.number().positive().max(10_000_000) })
      .parse(JSON.parse(response.body));
    appToken = { value: token.access_token, expiresAt: Date.now() + Math.max(0, token.expires_in - 90) * 1000, clientId };
    return appToken.value;
  })();
  try { return await tokenRequest; } finally { tokenRequest = undefined; }
}

async function queryIgdb(endpoint: "games" | "external_games", body: string, clientId: string, token: string): Promise<unknown> {
  await pace();
  const response = await safeHttps(`https://api.igdb.com/v4/${endpoint}`, {
    allowedHosts: ["api.igdb.com"], method: "POST", redirects: 0, maxBytes: 256_000,
    headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" }, body,
  });
  if (!/application\/json/i.test(response.contentType)) throw new Error("Respuesta IGDB incompatible.");
  return JSON.parse(response.body);
}

/** Pure conversion. Candidate identity and every field still require the editor's decision. */
export function parseIgdbCandidates(raw: unknown, retrievedAt = new Date().toISOString()): IgdbCandidate[] {
  return z.array(gameSchema).max(5).parse(raw).map((game) => {
    const suppliedUrl = safeDataUrl(game.url);
    const url = suppliedUrl && new URL(suppliedUrl).hostname === "www.igdb.com" ? suppliedUrl : `https://www.igdb.com/games/${game.id}`;
    const evidence: FieldEvidence[] = [];
    const add = (field: string, label: string, value: string) => {
      if (value && evidence.length < 130) evidence.push({ field, label: label.slice(0, 200), value: value.slice(0, 20000), provider: "igdb", sourceUrl: url, retrievedAt, status: "pending" });
    };
    add("title", "Título del candidato; confirmar juego y edición", game.name);
    add("genres", "Géneros propuestos por IGDB", game.genres?.map((genre) => genre.name).join(", ") ?? "");
    add("platforms", "Plataformas del candidato; revisar el alcance de la ficha", game.platforms?.map((platform) => platform.name).join(", ") ?? "");
    add("developer", "Desarrolladores del candidato", game.involved_companies?.filter((company) => company.developer).map((company) => company.company.name).join(", ") ?? "");
    add("publisher", "Editores del candidato", game.involved_companies?.filter((company) => company.publisher).map((company) => company.company.name).join(", ") ?? "");
    const cover = safeDataUrl(game.cover?.url?.startsWith("//") ? `https:${game.cover.url}` : game.cover?.url);
    add("coverImage", "Portada de IGDB; revisar condiciones de uso y texto alternativo", cover);
    // Keep the provider's precision and platform; a global Unix timestamp is not a PC release date.
    for (const date of game.release_dates ?? []) {
      if (date.human) add("releaseDate", `Lanzamiento: ${date.platform?.name ?? "plataforma sin identificar"}; ${date.date_format?.format ?? "precisión declarada por IGDB"}; ${date.release_region?.region ?? "región sin identificar"}`.slice(0, 200), date.human);
    }
    for (const external of game.external_games ?? []) {
      if (external.external_game_source?.name.toLowerCase() === "steam" && /^\d{1,12}$/.test(external.uid)) add("steamAppId", "Steam App ID del candidato; confirmar edición", external.uid);
    }
    const supports = game.language_supports?.map((support) => `${support.language.name}: ${support.language_support_type.name}`).join("; ") ?? "";
    add("languages", "Soporte por tipo (interfaz, audio o subtítulos) reportado por IGDB", supports.slice(0, 20000));
    return { id: game.id, title: game.name, url, platforms: game.platforms?.map((platform) => platform.name) ?? [],
      gameType: game.game_type?.name ?? "Tipo sin identificar", evidence };
  });
}

/** Server-only, fixed endpoints and bounded search. No candidate is applied to the caller's content. */
export async function enrichWithIgdb(content: GameContent): Promise<IgdbResult> {
  if (typeof window !== "undefined") throw new Error("IGDB solo está disponible en el servidor.");
  const clientId = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !secret) return { evidence: [], warnings: ["IGDB no está configurado. Añade TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET al servidor; puedes continuar con fuentes oficiales manuales."] };
  const search = content.title.trim().slice(0, 160);
  if (search.length < 2) return { evidence: [], warnings: ["Completa el título antes de buscar candidatos en IGDB."] };
  const steamAppId = /^\d{1,12}$/.test(content.steamAppId) ? content.steamAppId : "";
  const cacheKey = `${steamAppId}:${search.toLocaleLowerCase()}`;
  const previous = cache.get(cacheKey);
  if (previous && previous.expiresAt > Date.now()) return { evidence: [], candidates: structuredClone(previous.candidates),
    warnings: ["Candidatos de IGDB en caché. Selecciona la identidad y revisa cada dato antes de aceptarlo."] };
  if (running >= 2) return { evidence: [], warnings: ["IGDB tiene consultas en curso. Vuelve a intentarlo en unos segundos."] };
  running += 1;
  try {
    const token = await getAppToken(clientId, secret);
    let matchedIds: number[] = [];
    if (steamAppId) {
      const external = await queryIgdb("external_games", `fields game; where uid = ${JSON.stringify(steamAppId)} & external_game_source.name = "Steam"; limit 5;`, clientId, token);
      matchedIds = [...new Set(z.array(z.object({ game: z.number().int().positive() })).max(5).parse(external).map((entry) => entry.game))];
    }
    const identity = matchedIds.length ? `where id = (${matchedIds.join(",")});` : `search ${JSON.stringify(search)};`;
    const query = `${identity} fields name,url,game_type.name,platforms.name,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.url,release_dates.human,release_dates.platform.name,release_dates.date_format.format,release_dates.release_region.region,external_games.uid,external_games.external_game_source.name,language_supports.language.name,language_supports.language_support_type.name; limit 5;`;
    const candidates = parseIgdbCandidates(await queryIgdb("games", query, clientId, token));
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { candidates: structuredClone(candidates), expiresAt: Date.now() + 10 * 60_000 });
    return { evidence: [], candidates, warnings: candidates.length
      ? [matchedIds.length ? "Candidatos encontrados por Steam App ID. Confirma juego, plataforma y edición antes de aceptar datos."
        : steamAppId ? "No se ha encontrado coincidencia por Steam App ID; estos candidatos se basan solo en el título."
          : "Candidatos encontrados por título. Confirma juego, plataforma y edición.",
        "Los datos son propuestas pendientes: no se ha sustituido ningún campo ni verificado ningún archivo externo."]
      : ["IGDB no devolvió candidatos. Revisa el nombre o utiliza referencias oficiales manuales."] };
  } catch {
    // Do not expose provider bodies, credentials or internal connection details in the admin UI.
    return { evidence: [], warnings: ["No se ha podido consultar IGDB. Revisa la configuración o inténtalo más tarde; el contenido editorial se conserva."] };
  } finally { running -= 1; }
}

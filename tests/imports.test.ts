import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { emptyGame } from "../src/modules/catalog/types";
import { importFromPiviGames, parsePiviPost, safeDataUrl, validateSourceUrl } from "../src/modules/imports/pivigames";
import { isPublicAddress, safeHttps } from "../src/modules/imports/safe-http";
import { enrichWithIgdb, parseIgdbCandidates } from "../src/modules/integrations/igdb";

const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn(), endBody: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ request: network.request }));

function respond(body: string | Buffer, status = 200, headers: Record<string, string> = {}) {
  network.request.mockImplementationOnce((_url: URL, _options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const req = new EventEmitter();
    return Object.assign(req, {
      destroy(error?: Error) { if (error) req.emit("error", error); req.emit("close"); return this; },
      end(bodyValue?: string) {
        network.endBody(bodyValue);
        queueMicrotask(() => {
          const response = Object.assign(new PassThrough(), { statusCode: status,
            headers: { "content-type": "application/json", ...headers } });
          response.once("close", () => req.emit("close"));
          callback(response as unknown as IncomingMessage);
          response.end(body);
        });
      },
    }) as unknown as ClientRequest;
  });
}

beforeEach(() => {
  network.lookup.mockReset().mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
  network.request.mockReset();
  network.endBody.mockReset();
});

const sourceUrl = "https://pivigames.blog/a-stale-slug-v1/";
const post = (html: string, title = "Example Game PC ESPAÑOL v2.3.1") => ({
  id: 42, link: sourceUrl, title: { rendered: title }, content: { rendered: html },
  date: "2020-01-01", jetpack_featured_media_url: "https://pivigames.blog/wp-content/uploads/cover.jpg",
});

describe("PiviGames source boundaries", () => {
  it.each([
    "http://pivigames.blog/game/", "https://pibigames.blog/game/", "https://pivigames.blog.evil.test/game/",
    "https://pivigames.blog@127.0.0.1/game/", "https://evil.test@pivigames.blog/game/",
    "https://pivigames.blog:444/game/", "https://pivigames.blog/game/?next=http://127.0.0.1", "https://pivigames.blog/game/#fragment",
    "https://pivigames.blog\\@127.0.0.1/", "https://pivigames.blog/%2f%2f127.0.0.1/", "https://%70ivigames.blog/game/",
    "https://127.1/game/", "https://2130706433/game/", "https://[::ffff:127.0.0.1]/game/",
    "https://pivigames.blog/", "https://pivigames.blog/wp-json/wp/v2/posts/42",
  ])("rejects unauthorized or obscured URL %s", (url) => expect(() => validateSourceUrl(url)).toThrow());

  it("accepts the exact source and leaves stale slugs as provenance, never guessing identity", () => {
    expect(validateSourceUrl(sourceUrl).href).toBe(sourceUrl);
    expect(parsePiviPost(post(""), sourceUrl).source.id).toBe("42");
    expect(() => parsePiviPost({ ...post(""), link: "https://pivigames.blog/another-game/" }, sourceUrl)).toThrow(/canónica/);
  });

  it.each(["127.0.0.1", "10.0.0.1", "192.168.1.2", "172.16.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "192.0.2.2", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "not-an-ip"])("blocks special DNS answer %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
  it("permits global DNS addresses", () => {
    expect(isPublicAddress("1.1.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("retains necessary download query and fragment while rejecting active/unsafe schemes", () => {
    expect(safeDataUrl("https://files.example.com/game?token=abc#decrypt-key")).toBe("https://files.example.com/game?token=abc#decrypt-key");
    for (const url of ["javascript:alert(1)", "data:text/html,test", "http://files.example.com/game", "https://user:pass@example.com/", "https://127.0.0.1/download", "https://2130706433/file", "https://example.local/file"]) expect(safeDataUrl(url)).toBe("");
  });
});

describe("deterministic PiviGames conversion", () => {
  const body = `<h2>Example Game para PC en Español</h2>
    <script>window.pwned=true</script><style>.advert{}</style>
    <p>Una aventura sintética en la que exploramos un bosque lleno de criaturas, buscamos recursos y descubrimos nuevas historias con cada expedición.</p>
    <p><a href="javascript:alert(1)">Compra una oferta aquí</a> Suscríbete a nuestro patrocinador para obtener descuentos especiales.</p>
    <h3>Ficha técnica</h3><ul><li>PLATAFORMA: PC</li><li>PESO TOTAL: 6 GB</li><li>FORMATO: ISO</li><li>IDIOMAS: Español, Inglés</li><li>GÉNERO: Aventura, Supervivencia</li><li>FECHA DE ACTUALIZACIÓN: 30/10/26</li></ul>
    <iframe src="https://store.steampowered.com/widget/620/"></iframe>
    <h3>Capturas</h3><div class="tiled-gallery"><img src="https://images.example.com/shot.jpg"><img src="javascript:alert(1)"></div>
    <h3>Requisitos del sistema Windows</h3><h4>Mínimos</h4><ul><li>SO: Windows 10</li><li>Memoria: 4 GB RAM</li><li>Almacenamiento: 12 GB</li></ul>
    <h4>Recomendados</h4><ul><li>SO: Windows 11</li><li>Memoria: 8 GB RAM</li></ul>
    <h3>Requisitos Linux</h3><h4>Mínimos</h4><ul><li>SO: Ubuntu 22</li><li>Memoria: 6 GB RAM</li></ul>
    <h3>Instrucciones</h3><ol><li>Revisar las instrucciones del proveedor.</li></ol>
    <h3>Enlaces de descarga</h3><h4>Juego v2.3.1</h4><p><a href="https://files.example.com/base?token=key#hash">Proveedor base</a></p>
    <h4>Actualización v2.4</h4><p><a href="https://files.example.com/update">Parche</a><a href="javascript:alert(1)">Malo</a></p>`;

  it("keeps game facts, requirements and distribution versions separate, without executing remote HTML", () => {
    const result = parsePiviPost(post(body), sourceUrl, "2026-10-30T10:00:00.000Z");
    expect(result.content.title).toBe("Example Game");
    expect(result.content.slug).toBe("example-game");
    expect(result.content.releaseDate).toBe("");
    expect(result.content.developer).toBe("");
    expect(result.content.steamAppId).toBe("620");
    expect(result.content.summary).toContain("Una aventura sintética");
    expect(JSON.stringify(result.content)).not.toContain("window.pwned");
    expect(result.content.description.join(" ")).not.toMatch(/patrocinador|oferta/);
    expect(result.content.genres).toEqual(["Aventura", "Supervivencia"]);
    expect(result.content.requirements).toEqual([
      { platform: "Windows", minimum: ["SO: Windows 10", "Memoria: 4 GB RAM", "Almacenamiento: 12 GB"], recommended: ["SO: Windows 11", "Memoria: 8 GB RAM"] },
      { platform: "Linux", minimum: ["SO: Ubuntu 22", "Memoria: 6 GB RAM"], recommended: [] },
    ]);
    expect(result.content.distributions.map((item) => item.version)).toEqual(["v2.3.1", "v2.4"]);
    expect(result.content.distributions[0].size).toBe("6 GB");
    expect(result.content.distributions[1].links[0].type).toBe("update");
    expect(result.content.distributions.flatMap((item) => item.links)).toHaveLength(2);
    expect(result.content.screenshots).toEqual(["https://images.example.com/shot.jpg"]);
    expect(result.content.evidence.every((item) => item.status === "reported" && item.retrievedAt === result.fetchedAt)).toBe(true);
  });

  it.each(["F1 2024", "Alpha Protocol", "Example Game Enhanced Edition", "Resident Evil 4"])("preserves meaningful title and edition %s", (title) => {
    expect(parsePiviPost(post("", title), sourceUrl).content.title).toBe(title);
  });

  it("does not use full excerpt, editorial dates or promotional claims as verified game data", () => {
    const result = parsePiviPost({ ...post("<p>Ahora están regalando este juego, pero la vigencia de la promoción requiere confirmación independiente.</p>", "Están regalando Example Game"), excerpt: { rendered: "<script>evil</script>Ficha, anuncios y descargas" } }, sourceUrl);
    expect(result.warnings.join(" ")).toMatch(/promocional/);
    expect(result.content.requirements).toEqual([]);
    expect(result.content.summary).toBe("");
    expect(result.content.releaseDate).toBe("");
  });

  it("fails explicitly on incompatible provider data instead of returning an apparently valid empty game", () => {
    expect(() => parsePiviPost({ message: "Blocked" }, sourceUrl)).toThrow();
    expect(() => parsePiviPost({ ...post(""), id: "42" }, sourceUrl)).toThrow();
  });

  it("retains HTTPS image-button links as data, without losing their token or visiting the target", () => {
    const result = parsePiviPost(post(`<h3>Enlaces de descarga</h3><h4>Juego v2</h4>
      <p><a href="https://files.example.com/?v=token#key"><img src="https://pivigames.blog/button.png"></a></p>
      <p><a href="http://files.example.com/?v=other"><img src="https://pivigames.blog/button.png"></a></p>`), sourceUrl);
    expect(result.content.distributions[0].links).toEqual([{ label: "files.example.com", url: "https://files.example.com/?v=token#key", type: "base" }]);
    expect(network.request).not.toHaveBeenCalled();
  });
});

describe("IGDB candidate evidence", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("offers edition-specific candidates and pending evidence without inventing a precise release date", () => {
    const [candidate] = parseIgdbCandidates([{ id: 5, name: "Example Enhanced", game_type: { name: "Remaster" },
      platforms: [{ name: "PC (Microsoft Windows)" }], genres: [{ name: "Adventure" }],
      involved_companies: [{ developer: true, company: { name: "Example Studio" } }],
      release_dates: [{ human: "2027", platform: { name: "PC (Microsoft Windows)" } }],
      cover: { url: "//images.igdb.com/igdb/image/upload/t_cover_big/test.jpg" } }], "2026-10-30T00:00:00.000Z");
    expect(candidate.gameType).toBe("Remaster");
    expect(candidate.evidence.find((item) => item.field === "releaseDate")?.value).toBe("2027");
    expect(candidate.evidence.every((item) => item.status === "pending")).toBe(true);
    expect(candidate.evidence.find((item) => item.field === "coverImage")?.value).toMatch(/^https:/);
    expect(candidate.evidence.some((item) => item.field.startsWith("distributions"))).toBe(false);
  });

  it("works without credentials and never mutates the editorial game", async () => {
    vi.stubEnv("TWITCH_CLIENT_ID", "");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "");
    const content = emptyGame();
    content.title = "Editorial title";
    const before = structuredClone(content);
    const result = await enrichWithIgdb(content);
    expect(result.evidence).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/no está configurado/);
    expect(content).toEqual(before);
  });

  it("uses the source's exact Steam ID before title search while keeping the edition decision pending", async () => {
    vi.stubEnv("TWITCH_CLIENT_ID", "synthetic-client");
    vi.stubEnv("TWITCH_CLIENT_SECRET", "synthetic-secret");
    respond(JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }));
    respond(JSON.stringify([{ game: 9001 }]));
    respond(JSON.stringify([{ id: 9001, name: "Synthetic game", game_type: { name: "Remaster" },
      external_games: [{ uid: "620", external_game_source: { name: "Steam" } }],
      language_supports: [{ language: { name: "Spanish" }, language_support_type: { name: "Subtitles" } }] }]));
    const content = { ...emptyGame(), title: "Synthetic unique Steam title", steamAppId: "620" };
    const original = structuredClone(content);
    const result = await enrichWithIgdb(content);
    expect(network.request.mock.calls.map((call) => call[0].href)).toEqual([
      "https://id.twitch.tv/oauth2/token", "https://api.igdb.com/v4/external_games", "https://api.igdb.com/v4/games",
    ]);
    expect(network.endBody.mock.calls[1][0]).toContain('uid = "620" & external_game_source.name = "Steam"');
    expect(network.endBody.mock.calls[2][0]).toContain("where id = (9001)");
    expect(network.endBody.mock.calls[2][0]).not.toContain("search ");
    expect(result.candidates?.[0].evidence.find((item) => item.field === "languages")?.value).toBe("Spanish: Subtitles");
    expect(result.evidence).toEqual([]);
    expect(content).toEqual(original);
  });
});

describe("pinned server transport and WordPress identity", () => {
  it("pins the validated DNS answer for the TLS connection, including Node's all-address callback", async () => {
    respond("{}");
    await safeHttps("https://pivigames.blog/article/", { allowedHosts: ["pivigames.blog"] });
    const options = network.request.mock.calls[0][1] as RequestOptions;
    const callback = vi.fn();
    options.lookup?.("pivigames.blog", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "1.1.1.1", family: 4 }]);
    expect(options.servername).toBe("pivigames.blog");
    expect(options.agent).toBe(false);
    expect(network.lookup).toHaveBeenCalledTimes(1);
  });

  it("never connects when any DNS answer is private", async () => {
    network.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(safeHttps("https://pivigames.blog/article/", { allowedHosts: ["pivigames.blog"] })).rejects.toThrow(/privada o reservada/);
    expect(network.request).not.toHaveBeenCalled();
  });

  it("rejects redirection to a different host before resolving or connecting to it", async () => {
    respond("", 302, { location: "https://127.0.0.1/private" });
    await expect(safeHttps("https://pivigames.blog/article/", { allowedHosts: ["pivigames.blog"] })).rejects.toThrow(/autorizado/);
    expect(network.lookup).toHaveBeenCalledTimes(1);
    expect(network.request).toHaveBeenCalledTimes(1);
  });

  it("bounds same-host redirects and revalidates DNS for each connection", async () => {
    respond("", 302, { location: "/second/" });
    respond("", 302, { location: "/third/" });
    await expect(safeHttps("https://pivigames.blog/article/", { allowedHosts: ["pivigames.blog"], redirects: 1 })).rejects.toThrow(/Redirección/);
    expect(network.lookup).toHaveBeenCalledTimes(2);
    expect(network.request).toHaveBeenCalledTimes(2);
  });

  it("bounds decompressed content rather than trusting the compressed payload size", async () => {
    const body = gzipSync("A".repeat(4000));
    expect(body.length).toBeLessThan(64);
    respond(body, 200, { "content-encoding": "gzip" });
    await expect(safeHttps("https://pivigames.blog/article/", { allowedHosts: ["pivigames.blog"], maxBytes: 64 })).rejects.toThrow(/descomprimida/);
  });

  it("resolves WordPress post identity from shortlink and verifies canonical response instead of using a stale slug", async () => {
    respond(`<link rel="canonical" href="${sourceUrl}"><link rel="shortlink" href="https://pivigames.blog/?p=42">`, 200, { "content-type": "text/html" });
    respond(JSON.stringify(post("")));
    const result = await importFromPiviGames(sourceUrl);
    expect(result.source.id).toBe("42");
    expect(network.request.mock.calls[1][0].href).toBe("https://pivigames.blog/wp-json/wp/v2/posts/42");
    expect(network.request).toHaveBeenCalledTimes(2);
  });

  it("stops when HTML has no trusted ID, and never queries a guessed slug", async () => {
    respond(`<link rel="alternate" type="application/json" href="https://evil.example/wp-json/wp/v2/posts/42">`, 200, { "content-type": "text/html" });
    await expect(importFromPiviGames(sourceUrl)).rejects.toThrow(/identidad WordPress fiable/);
    expect(network.request).toHaveBeenCalledTimes(1);
  });
});

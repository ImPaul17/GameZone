import { readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

// Public requests only: no credentials, saved cookies or private environment files.
const origin = "https://gamezone-impaul17.netlify.app";
const supabaseOrigin = "https://gcykxpjuuujtpkoftmwl.supabase.co";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const pages = [];

async function request(path, init = {}) {
  return fetch(`${origin}${path}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(20000) });
}
function check(condition, label) { if (!condition) failures.push(label); }

const originals = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith(".html"))
  .map(entry => `/${entry.name}`);
for (const entry of await readdir(resolve(root, "games"), { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".html")) {
    originals.push(`/${relative(root, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/")}`);
  }
}

let navigationPages = 0;
let gameCount = 0;
for (const path of ["/", ...originals.sort(), "/cuenta.html", "/admin"]) {
  const response = await request(path);
  const html = await response.text();
  const $ = load(html);
  check(response.status === 200 && response.headers.get("content-type")?.includes("text/html"), `Página: ${path}`);
  if ($("ul.nav-menu").length) {
    navigationPages++;
    check($('a[data-gamezone-account="true"][href="/cuenta.html"]').length === 1, `Mi cuenta: ${path}`);
  }
  if (path === "/games.html") {
    gameCount = $(".game-card").length;
    check(gameCount > 0, "El catálogo público está vacío.");
  }
  pages.push({ path, status: response.status });
}

const oauth = [];
for (let attempt = 1; attempt <= 3; attempt++) {
  const response = await request("/api/account/discord", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: "{}",
  });
  const data = await response.json();
  const cookies = response.headers.getSetCookie();
  let validTarget = false;
  try {
    const target = new URL(data.url);
    validTarget = target.origin === supabaseOrigin && target.pathname === "/auth/v1/authorize" &&
      target.searchParams.get("provider") === "discord" &&
      target.searchParams.get("redirect_to") === `${origin}/api/account/discord/callback` &&
      Boolean(target.searchParams.get("code_challenge")) && target.searchParams.get("code_challenge_method") === "s256";
  } catch { /* A missing or invalid authorization target fails the check below. */ }
  const secureCookies = cookies.length > 0 && cookies.every(cookie => /;\s*Secure(?:;|$)/i.test(cookie) &&
    /;\s*HttpOnly(?:;|$)/i.test(cookie) && /;\s*SameSite=lax(?:;|$)/i.test(cookie));
  check(response.status === 200 && validTarget && secureCookies, `Inicio Discord: intento ${attempt}`);
  check(/private/i.test(response.headers.get("cache-control") ?? "") && /no-store/i.test(response.headers.get("cache-control") ?? ""), "Caché de acceso Discord.");
  oauth.push({ attempt, status: response.status, validTarget, secureCookies, cookieCount: cookies.length });
}

for (const suppliedOrigin of ["https://example.org", null]) {
  const response = await request("/api/account/discord", {
    method: "POST", headers: { ...(suppliedOrigin ? { Origin: suppliedOrigin } : {}), "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: "{}",
  });
  check(response.status === 403, suppliedOrigin ? "Debe rechazar un origen ajeno." : "Debe rechazar una mutación sin Origin.");
  await response.body?.cancel();
}

for (const path of ["/api/account/profile", "/api/admin/news"]) {
  const response = await request(path);
  check(response.status === 401, `Ruta privada sin sesión: ${path}`);
  check(/private/i.test(response.headers.get("cache-control") ?? "") && /no-store/i.test(response.headers.get("cache-control") ?? ""), `Caché privada: ${path}`);
  await response.body?.cancel();
}

console.log(JSON.stringify({ origin, originalPageCount: originals.length, pages, navigationPages, gameCount, oauth, passed: failures.length === 0, failures }, null, 2));
if (failures.length) process.exitCode = 1;

import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { editorEmailMethod, editorSiteOrigin, hasSupabaseAuthConfiguration, supabaseAuthConfiguration } from "./configuration";
import { getSupabaseCookieEditor, getVerifiedSupabaseUser, readEditorRole } from "./supabase";
import { serverEnvironment } from "@/lib/server-environment";

export interface Editor { id: string; role: "editor" | "admin" }
export interface Member { id: string; email: string | null }
export type EditorAuthMode = "local" | "supabase" | "unavailable";
export { editorEmailMethod } from "./configuration";
export const sessionCookieName = "gamezone_editor_session";
const sessionSeconds = 8 * 60 * 60;
const knownPublicDeployment = () => Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.CF_PAGES || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT);

export function localAuthConfigurationIssue(): string | null {
  if (process.env.GAMEZONE_LOCAL_MODE !== "1") return "El acceso local requiere GAMEZONE_LOCAL_MODE=1.";
  if (knownPublicDeployment()) return "El acceso local está desactivado en plataformas públicas. Configura autenticación de Supabase.";
  if ((process.env.GAMEZONE_ADMIN_PASSWORD ?? "").length < 12) return "Configura GAMEZONE_ADMIN_PASSWORD con al menos 12 caracteres.";
  if ((process.env.GAMEZONE_SESSION_SECRET ?? "").length < 32) return "Configura GAMEZONE_SESSION_SECRET con al menos 32 caracteres aleatorios.";
  return null;
}

function loopback(hostname: string): boolean { return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname.toLowerCase()); }
/** NextRequest normalizes loopback URLs to localhost; retain the browser's exact Host for CSRF. */
export function requestOrigin(request: Request): string | null {
  try {
    const url = new URL(request.url);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = request.headers.get("host");
    if (!host) return url.origin;
    const browserUrl = new URL(`${url.protocol}//${host}`);
    if (browserUrl.username || browserUrl.password || browserUrl.pathname !== "/" || browserUrl.search || browserUrl.hash) return null;
    if (browserUrl.host !== url.host && !(loopback(browserUrl.hostname) && loopback(url.hostname) && browserUrl.port === url.port)) return null;
    return browserUrl.origin;
  } catch { return null; }
}
/** Local login is only available on the loopback-bound server, with same-origin browser writes. */
export function localModeAvailable(request: Request): boolean {
  if (localAuthConfigurationIssue()) return false;
  try {
    const url = new URL(request.url);
    if (!loopback(url.hostname)) return false;
    const browserOrigin = requestOrigin(request);
    if (!browserOrigin || !loopback(new URL(browserOrigin).hostname)) return false;
    const origin = request.headers.get("origin");
    if (origin && origin !== browserOrigin) return false;
    if (!["GET", "HEAD"].includes(request.method) && !origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
    return true;
  } catch { return false; }
}

export function editorAuthMode(request: Request): EditorAuthMode {
  if (hasSupabaseAuthConfiguration()) {
    if (!supabaseAuthConfiguration()) return "unavailable";
    if (editorEmailMethod() === "link" && (!editorSiteOrigin() || requestOrigin(request) !== editorSiteOrigin())) return "unavailable";
    return "supabase";
  }
  return localModeAvailable(request) ? "local" : "unavailable";
}

export function sessionCookieOptions(request: Request) {
  return { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "strict" as const, path: "/", maxAge: sessionSeconds };
}

function sessionKey(): Buffer {
  // A password change revokes previously signed local sessions.
  return createHmac("sha256", process.env.GAMEZONE_SESSION_SECRET!).update(`gamezone-session-v1:${process.env.GAMEZONE_ADMIN_PASSWORD}`).digest();
}
function signature(value: string): string { return createHmac("sha256", sessionKey()).update(value).digest("base64url"); }

export async function createLocalSession(password: string): Promise<string | null> {
  if (localAuthConfigurationIssue() || typeof password !== "string" || password.length > 1024) return null;
  const salt = createHmac("sha256", process.env.GAMEZONE_SESSION_SECRET!).update("gamezone-password-v1").digest();
  const candidate = scryptSync(password, salt, 32);
  const expected = scryptSync(process.env.GAMEZONE_ADMIN_PASSWORD!, salt, 32);
  if (!timingSafeEqual(candidate, expected)) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: "local-editor", role: "admin", iat: issuedAt, exp: issuedAt + sessionSeconds, nonce: randomBytes(16).toString("base64url") })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function readLocalSession(token: string): Editor | null {
  if (token.length > 2048) return null;
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra !== undefined) return null;
  const expected = Buffer.from(signature(payload));
  const candidate = Buffer.from(supplied);
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (data.sub !== "local-editor" || data.role !== "admin" || typeof data.iat !== "number" || typeof data.exp !== "number" || !Number.isInteger(data.iat) || !Number.isInteger(data.exp) || data.iat > now + 30 || data.exp <= now || data.exp <= data.iat || data.exp - data.iat > sessionSeconds) return null;
    return { id: "local-editor", role: "admin" };
  } catch { return null; }
}

function readCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const cookie = cookies.find((entry) => entry.trim().startsWith(`${name}=`));
  if (!cookie) return null;
  try { return decodeURIComponent(cookie.trim().slice(name.length + 1)); } catch { return null; }
}

async function supabaseEditor(accessToken: string): Promise<Editor | null> {
  const url = serverEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key = serverEnvironment("SUPABASE_SECRET_KEY");
  if (!url || !key || accessToken.length > 8192) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
    const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!userResponse.ok) return null;
    const user = await userResponse.json() as { id?: string };
    if (!user.id || !/^[a-f0-9-]{36}$/i.test(user.id)) return null;
    return await readEditorRole(user.id);
  } catch { return null; }
}

export async function getEditor(request: Request): Promise<Editor | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (bearer) return supabaseEditor(bearer);
  const mode = editorAuthMode(request);
  if (mode === "supabase") return getSupabaseCookieEditor(request);
  if (mode !== "local") return null;
  const token = readCookie(request, sessionCookieName);
  return token ? readLocalSession(token) : null;
}

export async function getMember(request: Request): Promise<Member | null> {
  try {
    const user = await getVerifiedSupabaseUser(request);
    return user ? { id: user.id, email: user.email ?? null } : null;
  } catch { return null; }
}

export function discordLoginAvailable(request: Request): boolean {
  return serverEnvironment("GAMEZONE_DISCORD_LOGIN_ENABLED") === "1" && Boolean(supabaseAuthConfiguration()) && Boolean(editorSiteOrigin()) && requestOrigin(request) === editorSiteOrigin();
}

import "server-only";
import { createServerClient, parseCookieHeader, type CookieOptions } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { editorSiteOrigin, supabaseAuthConfiguration } from "./configuration";
import type { Editor } from "./auth";
import { serverEnvironment } from "@/lib/server-environment";

export const supabaseSessionCookieName = "gamezone_supabase_editor";
const privateCache = "private, no-cache, no-store, must-revalidate, max-age=0";
type CookieChange = { name: string; value: string; options: CookieOptions };
function isSessionCookie(name: string) { return name === supabaseSessionCookieName || name.startsWith(`${supabaseSessionCookieName}.`) || name.startsWith(`${supabaseSessionCookieName}-`); }

/** Each request owns a client and its cookie mutations; no session is shared across requests. */
export function supabaseSessionTransport(request: Request) {
  const config = supabaseAuthConfiguration();
  if (!config) throw new Error("Supabase authentication is not configured.");
  const cookies = new Map(parseCookieHeader(request.headers.get("cookie") || "").map(({ name, value }) => [name, value ?? ""]));
  const changes = new Map<string, CookieChange>();
  const cacheHeaders = new Map<string, string>();
  const secure = new URL(editorSiteOrigin() || request.url).protocol === "https:";
  const policy = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  const client = createServerClient(config.url, config.publishableKey, {
    cookieOptions: { name: supabaseSessionCookieName, ...policy },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) }) },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (updates, headers) => {
        for (const update of updates) {
          cookies.set(update.name, update.value);
          changes.set(update.name, { ...update, options: { ...update.options, ...policy } });
          if (request instanceof NextRequest) request.cookies.set(update.name, update.value);
        }
        for (const [name, value] of Object.entries(headers)) cacheHeaders.set(name, value);
      },
    },
  });
  function finish(response: NextResponse): NextResponse {
    for (const { name, value, options } of changes.values()) response.cookies.set(name, value, options);
    for (const [name, value] of cacheHeaders) response.headers.set(name, value);
    response.headers.set("Cache-Control", privateCache);
    return response;
  }
  function clear() {
    for (const name of cookies.keys()) if (isSessionCookie(name)) changes.set(name, { name, value: "", options: { ...policy, maxAge: 0, expires: new Date(0) } });
  }
  return { client, finish, clear };
}

export function clearSupabaseSessionCookies(request: Request, response: NextResponse): NextResponse {
  for (const { name } of parseCookieHeader(request.headers.get("cookie") || "")) if (isSessionCookie(name)) response.cookies.set(name, "", { httpOnly: true, secure: new URL(editorSiteOrigin() || request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 0, expires: new Date(0) });
  response.headers.set("Cache-Control", privateCache);
  return response;
}

/** Email-code requests do not need a PKCE redirect or a browser session. */
export function supabaseCodeClient() {
  const config = supabaseAuthConfiguration();
  if (!config) throw new Error("Supabase authentication is not configured.");
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10000) }) },
  });
}

export async function readEditorRole(userId: string): Promise<Editor | null> {
  const url = serverEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key = serverEnvironment("SUPABASE_SECRET_KEY");
  if (!url || !key || !/^[a-f0-9-]{36}$/i.test(userId)) return null;
  const query = new URLSearchParams({ select: "role", user_id: `eq.${userId}`, limit: "1" });
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/editor_roles?${query}`, {
    headers: { apikey: key, ...(!key.startsWith("sb_secret_") ? { Authorization: `Bearer ${key}` } : {}) },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Editorial permissions could not be checked.");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid editorial permissions response.");
  const role = (rows[0] as { role?: unknown } | undefined)?.role;
  return role === "editor" || role === "admin" ? { id: userId, role } : null;
}

export async function getSupabaseCookieEditor(request: Request): Promise<Editor | null> {
  try {
    const user = await getVerifiedSupabaseUser(request);
    return user ? await readEditorRole(user.id) : null;
  } catch { return null; }
}

/** Authentication is independent of editorial authorization. Never trust cookie metadata. */
export async function getVerifiedSupabaseUser(request: Request): Promise<User | null> {
  if (!supabaseAuthConfiguration()) return null;
  const { client } = supabaseSessionTransport(request);
  const { data, error } = await client.auth.getUser();
  if (error && (!error.status || error.status >= 500)) throw new Error("The account provider could not be reached.");
  return error || !data.user || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.user.id) ? null : data.user;
}

/** Refresh only. Pages and route handlers still verify the user and current database role. */
export async function refreshEditorSession(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAuthConfiguration()) {
    const response = NextResponse.next({ request }); response.headers.set("Cache-Control", privateCache); return response;
  }
  const transport = supabaseSessionTransport(request);
  try { await transport.client.auth.getClaims(); } catch { /* Authorization fails closed in getEditor. */ }
  return transport.finish(NextResponse.next({ request }));
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireEditor } from "../src/lib/api";
import { createLocalSession, getEditor, localModeAvailable, requestOrigin, sessionCookieName, sessionCookieOptions } from "../src/modules/accounts/auth";

const password = "editorial-local-password-123";
function request(token?: string, url = "http://127.0.0.1:3000/api/admin/games"): Request {
  return new Request(url, { headers: token ? { cookie: `${sessionCookieName}=${token}` } : {} });
}
beforeEach(() => {
  vi.stubEnv("GAMEZONE_LOCAL_MODE", "1"); vi.stubEnv("GAMEZONE_ADMIN_PASSWORD", password);
  vi.stubEnv("GAMEZONE_SESSION_SECRET", "a-local-testing-secret-with-at-least-32-characters");
  for (const key of ["VERCEL", "NETLIFY", "CF_PAGES", "RENDER", "RAILWAY_ENVIRONMENT"]) vi.stubEnv(key, "");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("local editorial sessions", () => {
  it("requires a configured password and verifies an expiring signed cookie", async () => {
    expect(await createLocalSession("wrong-password")).toBeNull();
    const token = await createLocalSession(password);
    expect(token).toBeTypeOf("string");
    expect(await getEditor(request(token!))).toEqual({ id: "local-editor", role: "admin" });
    expect(await getEditor(request(`${token!.slice(0, -1)}!`))).toBeNull();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
    expect(await getEditor(request(token!))).toBeNull();
  });

  it("revokes sessions when the password changes and never enables default credentials", async () => {
    const token = await createLocalSession(password);
    vi.stubEnv("GAMEZONE_ADMIN_PASSWORD", "another-long-editorial-password");
    expect(await getEditor(request(token!))).toBeNull();
    vi.stubEnv("GAMEZONE_ADMIN_PASSWORD", "");
    expect(await createLocalSession("")).toBeNull();
    expect(localModeAvailable(request())).toBe(false);
  });

  it("restricts local access to loopback, explicit opt-in and same-origin writes", async () => {
    const token = await createLocalSession(password);
    expect(await getEditor(request(token!, "https://gamezone.example/api/admin/games"))).toBeNull();
    expect(localModeAvailable(new Request("http://127.0.0.1:3000/api/admin/login", { method: "POST", headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(localModeAvailable(new Request("http://127.0.0.1:3000/api/admin/login", { method: "POST" }))).toBe(false);
    expect(localModeAvailable(new Request("http://127.0.0.1:3000/api/admin/login", { method: "POST", headers: { origin: "http://127.0.0.1:3000" } }))).toBe(true);
    expect(localModeAvailable(new Request("http://127.0.0.1:3000/", { headers: { host: "public.example" } }))).toBe(false);
    vi.stubEnv("GAMEZONE_LOCAL_MODE", "0"); expect(await getEditor(request(token!))).toBeNull();
    vi.stubEnv("GAMEZONE_LOCAL_MODE", "1"); vi.stubEnv("VERCEL", "1"); expect(await getEditor(request(token!))).toBeNull();
  });

  it("sets bounded HttpOnly SameSite cookies", () => {
    expect(sessionCookieOptions(request())).toMatchObject({ httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 28800 });
    expect(sessionCookieOptions(request(undefined, "https://localhost:3000/"))).toMatchObject({ secure: true });
  });

  it("accepts real NextRequest loopback normalization while keeping the exact browser origin", async () => {
    const token = await createLocalSession(password);
    const normalized = (origin = "http://127.0.0.1:3000", host = "127.0.0.1:3000") => new NextRequest("http://127.0.0.1:3000/api/admin/games", { method: "POST", headers: { host, origin, "sec-fetch-site": "same-origin", cookie: `${sessionCookieName}=${token}` } });
    expect(new URL(normalized().url).hostname).toBe("localhost");
    expect(requestOrigin(normalized())).toBe("http://127.0.0.1:3000");
    expect(localModeAvailable(normalized())).toBe(true);
    expect(await requireEditor(normalized())).toEqual({ id: "local-editor", role: "admin" });
    expect(localModeAvailable(normalized("http://localhost:3000"))).toBe(false);
    expect(localModeAvailable(normalized("http://127.0.0.1:3001"))).toBe(false);
    expect(localModeAvailable(normalized("https://evil.example", "evil.example"))).toBe(false);
    expect(localModeAvailable(normalized("http://127.0.0.1:3001", "127.0.0.1:3001"))).toBe(false);
  });
});

describe("Supabase editorial authorization", () => {
  it("recognizes the configured HTTPS host behind a reverse proxy without accepting an arbitrary host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gamezone.example");
    const proxied = new Request("http://localhost:3000/api/account/discord", { headers: { host: "gamezone.example", "x-forwarded-proto": "https" } });
    expect(requestOrigin(proxied)).toBe("https://gamezone.example");
    const other = new Request("http://localhost:3000/api/account/discord", { headers: { host: "evil.example", "x-forwarded-proto": "https" } });
    expect(requestOrigin(other)).toBeNull();
  });
  const userId = "21c3a809-ffbf-4810-a92d-86bec57049cf";
  function bearerRequest() { return new Request("https://gamezone.example/api/admin/games", { headers: { authorization: "Bearer a-user-access-token" } }); }
  it("verifies the token remotely and requires an explicit editorial database role", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://gamezone-test.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_server-test");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: userId, user_metadata: { role: "admin" } })).mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getEditor(bearerRequest())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer a-user-access-token");
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
    fetchMock.mockResolvedValueOnce(Response.json({ id: userId })).mockResolvedValueOnce(Response.json([{ role: "editor" }]));
    expect(await getEditor(bearerRequest())).toEqual({ id: userId, role: "editor" });
  });

  it("fails closed before querying roles when the remote access token is invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://gamezone-test.supabase.co"); vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret-test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 })); vi.stubGlobal("fetch", fetchMock);
    expect(await getEditor(bearerRequest())).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { POST as requestCode, DELETE as logout } from "../src/app/api/admin/session/route";
import { POST as verifyCode } from "../src/app/api/admin/session/code/route";
import { GET as completeLink } from "../src/app/api/admin/session/callback/route";
import { editorAuthMode, editorEmailMethod, getEditor, sessionCookieName } from "../src/modules/accounts/auth";
import { readEditorRole, supabaseSessionCookieName } from "../src/modules/accounts/supabase";
import { proxy, config as proxyConfig } from "../src/proxy";

const userId = "21c3a809-ffbf-4810-a92d-86bec57049cf";
const origin = "https://gamezone.example";
let clock = Date.now();
function user() { return { id: userId, aud: "authenticated", role: "authenticated", email: "editor@example.test", app_metadata: { provider: "email" }, user_metadata: { role: "admin" }, created_at: "2026-10-30T00:00:00Z" }; }
function session(expiresAt = Math.floor(Date.now() / 1000) + 3600, refreshToken = "test-refresh-token") {
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: userId, aud: "authenticated", exp: expiresAt, iat: Math.floor(Date.now() / 1000), session_id: "test-session-id" })}.dGVzdC1zaWduYXR1cmU`;
  return { access_token: accessToken, refresh_token: refreshToken, expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user: user() };
}
function request(path = "/api/admin/session", body?: unknown, cookie = "", extra: Record<string, string> = {}, method = body === undefined ? "GET" : "POST") {
  return new NextRequest(`${origin}${path}`, { method, headers: { host: "gamezone.example", origin, "content-type": "application/json", cookie, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function cookieHeader(response: NextResponse) { return response.cookies.getAll().filter((cookie) => cookie.value).map(({ name, value }) => `${name}=${value}`).join("; "); }
function incomingCookie(value: ReturnType<typeof session>) { return `${supabaseSessionCookieName}=base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}`; }
type MockOptions = { otpStatus?: number; verifyStatus?: number; roleStatus?: number; pkceStatus?: number; role?: "editor" | "admin" | null; refresh?: ReturnType<typeof session> };
function mockApi(options: MockOptions = {}) {
  const calls: { path: string; method: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    calls.push({ path: url.pathname + url.search, method: init?.method || "GET", body, headers: new Headers(init?.headers) });
    if (url.pathname === "/auth/v1/otp") return options.otpStatus ? Response.json({ code: "otp_disabled", msg: "Internal upstream account detail" }, { status: options.otpStatus }) : Response.json({});
    if (url.pathname === "/auth/v1/verify") return options.verifyStatus ? Response.json({ code: "otp_expired", msg: "Internal token detail" }, { status: options.verifyStatus }) : Response.json(session());
    if (url.pathname === "/auth/v1/user") return Response.json(user());
    if (url.pathname === "/auth/v1/token") return options.pkceStatus && url.searchParams.get("grant_type") === "pkce" ? Response.json({ code: "bad_code_verifier", msg: "Internal exchange detail" }, { status: options.pkceStatus }) : Response.json(options.refresh || session());
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname === "/rest/v1/editor_roles") return options.roleStatus ? Response.json({ message: "Internal database detail" }, { status: options.roleStatus }) : Response.json(options.role === null ? [] : [{ role: options.role || "editor" }]);
    throw new Error(`Unexpected mocked request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  clock += 24 * 60 * 60 * 1000; vi.spyOn(Date, "now").mockReturnValue(clock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth-test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test-only");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test-only");
  vi.stubEnv("GAMEZONE_EDITOR_EMAIL_METHOD", "code"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  vi.stubEnv("GAMEZONE_LOCAL_MODE", "1"); vi.stubEnv("GAMEZONE_ADMIN_PASSWORD", "a-local-password-for-tests"); vi.stubEnv("GAMEZONE_SESSION_SECRET", "a-local-secret-for-tests-with-32-characters");
  for (const key of ["VERCEL", "NETLIFY", "CF_PAGES", "RENDER", "RAILWAY_ENVIRONMENT"]) vi.stubEnv(key, "");
});

describe("email-link PKCE login through the real SDK and mocked HTTP", () => {
  function useLinks() { vi.stubEnv("GAMEZONE_EDITOR_EMAIL_METHOD", "link"); }
  function callback(query: string, cookie = "") {
    const incoming = request(`/api/admin/session/callback${query}`, undefined, cookie, { "sec-fetch-site": "cross-site" });
    incoming.headers.delete("origin"); return incoming;
  }

  it("stores an HttpOnly verifier and exchanges only its matching code before a fixed redirect", async () => {
    expect(editorEmailMethod()).toBe("code"); useLinks(); expect(editorEmailMethod()).toBe("link");
    const { calls } = mockApi();
    const response = await requestCode(request(undefined, { email: "editor@example.test" }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, method: "link" });
    const otp = calls.find((call) => call.path.startsWith("/auth/v1/otp"))!;
    expect(new URL(otp.path, "https://auth-test.supabase.co").searchParams.get("redirect_to")).toBe(`${origin}/api/admin/session/callback`);
    expect(otp.body).toMatchObject({ email: "editor@example.test", create_user: false, code_challenge_method: "s256" });
    const verifierCookie = response.cookies.get(`${supabaseSessionCookieName}-code-verifier`)!;
    expect(verifierCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    const verifier = JSON.parse(Buffer.from(verifierCookie.value.slice("base64-".length), "base64url").toString("utf8")) as string;
    expect(otp.body.code_challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    const completed = await completeLink(callback("?code=one-time-auth-code&next=https%3A%2F%2Fevil.example%2F", cookieHeader(response)));
    expect(completed.status).toBe(303); expect(completed.headers.get("location")).toBe(`${origin}/admin`);
    expect(completed.headers.get("referrer-policy")).toBe("no-referrer"); expect(completed.headers.get("cache-control")).toContain("no-store");
    expect(calls.find((call) => call.path === "/auth/v1/token?grant_type=pkce")?.body).toMatchObject({ auth_code: "one-time-auth-code", code_verifier: verifier });
    expect(completed.cookies.getAll().some((cookie) => cookie.name === supabaseSessionCookieName && cookie.value)).toBe(true);
    expect(await completed.text()).toBe("");
  });

  it("rejects a callback without the browser verifier before any upstream exchange", async () => {
    useLinks(); const { fetchMock } = mockApi();
    const response = await completeLink(callback("?code=unbound-code&next=https://evil.example"));
    expect(response.headers.get("location")).toBe(`${origin}/admin?login=expired`); expect(fetchMock).not.toHaveBeenCalled();
    expect(response.cookies.getAll().every((cookie) => !cookie.value)).toBe(true);
  });

  it("rejects a wrong flow slot instead of borrowing another pending verifier", async () => {
    useLinks(); const { calls } = mockApi();
    const started = await requestCode(request(undefined, { email: "editor@example.test" }));
    const response = await completeLink(callback("?code=one-time-code&sb_flow_id=missing-flow-slot", cookieHeader(started)));
    expect(response.headers.get("location")).toBe(`${origin}/admin?login=expired`);
    expect(calls.filter((call) => call.path.startsWith("/auth/v1/token"))).toEqual([]);
  });

  it.each([[null, undefined, "denied"], ["editor", 503, "unavailable"], ["editor", 404, "unavailable"]] as const)("maps role %s / HTTP %s to a fixed %s redirect and deletes the rejected session", async (role, roleStatus, expected) => {
    useLinks(); const { calls } = mockApi({ role, roleStatus });
    const started = await requestCode(request(undefined, { email: "editor@example.test" }));
    const response = await completeLink(callback("?code=one-time-code&next=//evil.example", cookieHeader(started)));
    expect(response.headers.get("location")).toBe(`${origin}/admin?login=${expected}`);
    expect(response.cookies.getAll().every((cookie) => cookie.value === "" && cookie.maxAge === 0)).toBe(true);
    expect(calls.some((call) => call.path === "/auth/v1/logout?scope=local")).toBe(true);
  });

  it("maps an expired exchange to expired and an unavailable provider to unavailable", async () => {
    useLinks(); mockApi(); const started = await requestCode(request(undefined, { email: "editor@example.test" }));
    mockApi({ pkceStatus: 400 });
    expect((await completeLink(callback("?code=expired-code", cookieHeader(started)))).headers.get("location")).toBe(`${origin}/admin?login=expired`);
    mockApi({ pkceStatus: 503 });
    expect((await completeLink(callback("?code=unavailable-code", cookieHeader(started)))).headers.get("location")).toBe(`${origin}/admin?login=unavailable`);
  });

  it("requires a canonical matching origin and refuses non-loopback HTTP configuration", async () => {
    useLinks(); const { fetchMock } = mockApi();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://different.example");
    expect(editorAuthMode(request())).toBe("unavailable");
    expect((await requestCode(request(undefined, { email: "editor@example.test" }))).status).toBe(503);
    expect((await completeLink(callback("?code=any-code"))).headers.get("location")).toBe("https://different.example/admin?login=unavailable");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://public.example");
    expect((await completeLink(callback("?code=any-code"))).headers.get("location")).toBe("/admin?login=unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds callback parameters and never accepts a token hash or an arbitrary redirect", async () => {
    useLinks(); const { fetchMock } = mockApi();
    for (const query of ["?code=" + "a".repeat(4097), "?code=first&code=second", "?token_hash=external-token&type=email", "?error=provider_error&error_description=internal-detail&next=https://evil.example"]) {
      expect((await completeLink(callback(query))).headers.get("location")).toBe(`${origin}/admin?login=expired`);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the exact loopback canonical origin despite NextRequest URL normalization", async () => {
    useLinks(); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000"); const { calls } = mockApi();
    const incoming = new NextRequest("http://127.0.0.1:3000/api/admin/session", { method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify({ email: "editor@example.test" }) });
    expect((await requestCode(incoming)).status).toBe(200);
    expect(new URL(calls[0].path, "https://auth-test.supabase.co").searchParams.get("redirect_to")).toBe("http://127.0.0.1:3000/api/admin/session/callback");
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("email-code editorial login through the real SDK and mocked HTTP", () => {
  it("requests codes without creating accounts and hides unknown-user details", async () => {
    const { calls } = mockApi();
    const success = await requestCode(request(undefined, { email: " Editor@Example.Test " }));
    expect(success.status).toBe(200);
    expect(calls[0]).toMatchObject({ path: "/auth/v1/otp", body: { email: "editor@example.test", create_user: false } });
    expect(calls[0].headers.get("apikey")).toBe("sb_publishable_test-only");
    expect(success.headers.get("set-cookie")).toBeNull();
    mockApi({ otpStatus: 422 });
    const unknown = await requestCode(request(undefined, { email: "unknown@example.test" }));
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(await success.json());
  });

  it("creates only HttpOnly secure cookies after verification and rechecks the current role", async () => {
    const { calls } = mockApi();
    const response = await verifyCode(request("/api/admin/session/code", { email: "editor@example.test", token: "123456" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true });
    expect(calls.find((call) => call.path === "/auth/v1/verify")?.body).toMatchObject({ email: "editor@example.test", token: "123456", type: "email" });
    const cookies = response.cookies.getAll(); expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(response.headers.get("cache-control")).toContain("private"); expect(response.headers.get("cache-control")).toContain("no-store");
    const authenticated = request("/api/admin/games", undefined, cookieHeader(response));
    expect(await getEditor(authenticated)).toEqual({ id: userId, role: "editor" });
    mockApi({ role: null });
    expect(await getEditor(authenticated)).toBeNull();
  });

  it("rejects an expired code without exposing provider details or a session", async () => {
    const { calls } = mockApi({ verifyStatus: 403 });
    const response = await verifyCode(request("/api/admin/session/code", { email: "editor@example.test", token: "123456" }));
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: "El código no es válido o ha caducado." });
    expect(response.cookies.getAll()).toEqual([]); expect(calls).toHaveLength(1);
  });

  it.each([500, 503])("reports verification-provider HTTP %s as temporary infrastructure failure", async (verifyStatus) => {
    const { calls } = mockApi({ verifyStatus });
    const response = await verifyCode(request("/api/admin/session/code", { email: "editor@example.test", token: "123456" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "No se pudo verificar el acceso editorial. Inténtalo de nuevo más tarde." });
    expect(response.cookies.getAll()).toEqual([]); expect(calls).toHaveLength(1);
  });

  it("reports a verification network failure as unavailable rather than an invalid code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Synthetic network failure")));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await verifyCode(request("/api/admin/session/code", { email: "editor@example.test", token: "123456" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/No se pudo verificar/);
    expect(response.cookies.getAll()).toEqual([]);
    consoleError.mockRestore();
  });

  it("keeps provider rate limits as HTTP 429", async () => {
    mockApi({ verifyStatus: 429 });
    const response = await verifyCode(request("/api/admin/session/code", { email: "editor@example.test", token: "123456" }));
    expect(response.status).toBe(429); expect((await response.json()).error).toMatch(/Demasiados intentos/);
  });

  it("denies authenticated users without a role and deletes every newly issued session cookie", async () => {
    const { calls } = mockApi({ role: null });
    const response = await verifyCode(request("/api/admin/session/code", { email: "visitor@example.test", token: "123456" }));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "Esta cuenta no tiene acceso editorial." });
    expect(calls.some((call) => call.path === "/auth/v1/logout?scope=local")).toBe(true);
    expect(response.cookies.getAll().every((cookie) => cookie.value === "" && cookie.maxAge === 0)).toBe(true);
  });

  it.each([404, 503])("reports role-store HTTP %s as infrastructure failure, not a denied account", async (roleStatus) => {
    mockApi({ roleStatus });
    const response = await verifyCode(request("/api/admin/session/code", { email: "editor@example.test", token: "123456" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/No se pudo verificar/);
    expect(response.cookies.getAll().every((cookie) => cookie.value === "" && cookie.maxAge === 0)).toBe(true);
    await expect(readEditorRole(userId)).rejects.toThrow(/permissions/);
  });

  it("rejects cross-origin requests before the upstream request and fails closed on partial configuration", async () => {
    const { fetchMock } = mockApi();
    expect((await requestCode(request(undefined, { email: "editor@example.test" }, "", { origin: "https://evil.example" }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const localRequest = new Request("http://127.0.0.1:3000/admin");
    expect(editorAuthMode(localRequest)).toBe("unavailable");
    expect((await requestCode(request(undefined, { email: "editor@example.test" }))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits code requests per email without making extra upstream requests", async () => {
    const { fetchMock } = mockApi();
    for (let attempt = 0; attempt < 6; attempt++) expect((await requestCode(request(undefined, { email: "rate-limit@example.test" }))).status).toBe(200);
    expect((await requestCode(request(undefined, { email: "rate-limit@example.test" }))).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe("SSR session refresh and logout", () => {
  it("refreshes the request and response cookies together and carries all cache headers", async () => {
    const fresh = session(Math.floor(Date.now() / 1000) + 3600, "rotated-refresh-token");
    const { calls } = mockApi({ refresh: fresh });
    const expired = session(Math.floor(Date.now() / 1000) - 60, "expired-refresh-token");
    const incoming = request("/admin", undefined, incomingCookie(expired));
    const response = await proxy(incoming);
    expect(calls.find((call) => call.path === "/auth/v1/token?grant_type=refresh_token")?.body).toMatchObject({ refresh_token: "expired-refresh-token" });
    expect(response.cookies.getAll().some((cookie) => cookie.name.startsWith(supabaseSessionCookieName))).toBe(true);
    expect(incoming.headers.get("cookie")).not.toContain("expired-refresh-token");
    expect(response.headers.get("x-middleware-request-cookie")).toBe(incoming.headers.get("cookie"));
    expect(response.headers.get("cache-control")).toContain("private"); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache"); expect(response.headers.get("expires")).toBe("0");
    expect(await getEditor(incoming)).toEqual({ id: userId, role: "editor" });
    expect(calls.filter((call) => call.path.startsWith("/auth/v1/token"))).toHaveLength(1);
    expect(proxyConfig.matcher).toEqual(["/admin/:path*", "/api/admin/:path*"]);
  });

  it("clears chunked and local cookies on logout and revokes only the current Supabase session", async () => {
    const { calls } = mockApi();
    const encoded = incomingCookie(session()).split("=")[1];
    const cookie = `${supabaseSessionCookieName}.0=${encoded.slice(0, 80)}; ${supabaseSessionCookieName}.1=${encoded.slice(80)}; ${sessionCookieName}=local-cookie; unrelated=keep`;
    const response = await logout(request(undefined, undefined, cookie, {}, "DELETE"));
    expect(response.status).toBe(200);
    expect(calls.some((call) => call.path === "/auth/v1/logout?scope=local")).toBe(true);
    expect(response.cookies.get(supabaseSessionCookieName + ".0")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.cookies.get(supabaseSessionCookieName + ".1")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.cookies.get(sessionCookieName)).toMatchObject({ value: "", maxAge: 0 });
    expect(response.cookies.get("unrelated")).toBeUndefined();
  });
});

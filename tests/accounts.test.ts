import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import sharp from "sharp";
import { GET as getProfile, PATCH as patchProfile } from "../src/app/api/account/profile/route";
import { GET as getAvatar, POST as uploadAvatar, DELETE as resetAvatar } from "../src/app/api/account/avatar/route";
import { POST as startDiscord } from "../src/app/api/account/discord/route";
import { GET as completeDiscord } from "../src/app/api/account/discord/callback/route";
import { DELETE as logout } from "../src/app/api/account/session/route";
import { discordLoginAvailable, getEditor, getMember, sessionCookieName } from "../src/modules/accounts/auth";
import { discordAvatarURL } from "../src/modules/accounts/members";
import { supabaseSessionCookieName } from "../src/modules/accounts/supabase";

const origin = "https://gamezone.example";
const first = "21c3a809-ffbf-4810-a92d-86bec57049cf";
const second = "30f7ae68-e2cf-44cf-8a9e-7e47d1cd12af";
const avatarId = "a9bf5431-a660-4cb8-95c6-b3cb7a5d61eb";
const discordImage = "https://cdn.discordapp.com/avatars/123456789012345678/0123456789abcdef0123456789abcdef.webp?size=256";
let clock = Date.now();
function user(id = first) { return { id, aud: "authenticated", role: "authenticated", email: `${id === first ? "first" : "second"}@example.test`, app_metadata: { provider: "discord" }, user_metadata: { full_name: "Discord Player", avatar_url: discordImage, role: "admin" }, created_at: "2026-10-30T00:00:00Z" }; }
function session(id = first, cookieUserId = id) {
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return { access_token: `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })}.dGVzdC1zaWduYXR1cmU`, refresh_token: `refresh-${id}`, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: user(cookieUserId) };
}
function cookie(id = first, cookieUserId = id) { return `${supabaseSessionCookieName}=base64-${Buffer.from(JSON.stringify(session(id, cookieUserId))).toString("base64url")}`; }
function responseCookie(response: NextResponse) { return response.cookies.getAll().filter((item) => item.value).map(({ name, value }) => `${name}=${value}`).join("; "); }
function request(path: string, body?: unknown, cookies = cookie(), method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) {
  const form = body instanceof FormData;
  return new NextRequest(`${origin}${path}`, { method, headers: { host: "gamezone.example", origin, cookie: cookies, ...(form ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) });
}
function profile(id = first) { return { id, display_name: id === first ? "First player" : "Second player", bio: "Private biography", discord_avatar_url: discordImage, avatar_path: null as string | null, updated_at: "2026-10-30T00:00:00.000Z" }; }
function mockProvider(options: { empty?: boolean; profileStatus?: number; conflict?: boolean; corruptPath?: boolean } = {}) {
  const profiles = new Map(options.empty ? [] : [[first, profile(first)], [second, profile(second)]]);
  if (options.corruptPath) profiles.get(first)!.avatar_path = `${second}/${avatarId}.webp`;
  const objects = new Map<string, Buffer>();
  const calls: { path: string; method: string; body: unknown; headers: Headers }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    expect(url.origin).toBe("https://accounts-test.supabase.co");
    const headers = new Headers(init?.headers); const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : init?.body instanceof Uint8Array ? Buffer.from(init.body) : null;
    calls.push({ path: url.pathname + url.search, method, body, headers });
    if (url.pathname === "/auth/v1/user") {
      const token = headers.get("authorization")?.replace(/^Bearer /, "") || "";
      try { const id = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string; return Response.json(user(id)); } catch { return Response.json({ msg: "No session" }, { status: 401 }); }
    }
    if (url.pathname === "/auth/v1/token") return Response.json(session());
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname === "/rest/v1/editor_roles") return Response.json([]);
    if (url.pathname === "/rest/v1/profiles") {
      if (options.profileStatus) return Response.json({ message: "Internal private database detail" }, { status: options.profileStatus });
      if (method === "POST") {
        const data = body as ReturnType<typeof profile>;
        if (!profiles.has(data.id)) profiles.set(data.id, { ...data, updated_at: "2026-10-30T00:00:00.000Z" });
        return new Response(null, { status: 201 });
      }
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      if (!id) throw new Error("Unscoped profile access.");
      const current = profiles.get(id);
      if (method === "GET") return Response.json(current ? [current] : []);
      if (method === "PATCH") {
        if (!current || options.conflict || (url.searchParams.has("updated_at") && url.searchParams.get("updated_at") !== `eq.${current.updated_at}`)) return Response.json([]);
        Object.assign(current, body); return Response.json([current]);
      }
    }
    const storage = "/storage/v1/object/profile-avatars/";
    const download = "/storage/v1/object/authenticated/profile-avatars/";
    if (url.pathname.startsWith(storage) && method === "POST") { objects.set(url.pathname.slice(storage.length), body as Buffer); return Response.json({ Key: url.pathname.slice("/storage/v1/object/".length) }); }
    if (url.pathname === "/storage/v1/object/profile-avatars" && method === "DELETE") { for (const path of (body as { prefixes: string[] }).prefixes) objects.delete(path); return Response.json([]); }
    if (url.pathname.startsWith(download) && method === "GET") { const value = objects.get(url.pathname.slice(download.length)); return value ? new Response(new Uint8Array(value), { headers: { "Content-Type": "image/webp" } }) : new Response(null, { status: 404 }); }
    throw new Error(`Unexpected mocked account request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock); return { calls, profiles, objects, fetchMock };
}
function multipart(bytes: Buffer, name = "portrait.jpg", type = "image/jpeg") { const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], name, { type })); return form; }

beforeEach(() => {
  clock += 24 * 60 * 60 * 1000; vi.spyOn(Date, "now").mockReturnValue(clock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://accounts-test.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test-only"); vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test-only");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin); vi.stubEnv("GAMEZONE_EDITOR_EMAIL_METHOD", "code"); vi.stubEnv("GAMEZONE_DISCORD_LOGIN_ENABLED", "1");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("member authentication and private profiles", () => {
  it("authenticates an ordinary member without granting editorial access", async () => {
    const { calls } = mockProvider(); const incoming = request("/api/account/profile");
    expect(await getMember(incoming)).toEqual({ id: first, email: "first@example.test" });
    expect(await getEditor(incoming)).toBeNull();
    expect(calls.filter((call) => call.path.startsWith("/rest/v1/editor_roles"))).toHaveLength(1);
  });

  it("trusts the verified user instead of the cookie user and only returns their own email", async () => {
    const { calls } = mockProvider();
    const response = await getProfile(request("/api/account/profile?userId=" + second, undefined, cookie(first, second)));
    expect(response.status).toBe(200);
    expect((await response.json()).profile).toMatchObject({ id: first, displayName: "First player", email: "first@example.test", avatarURL: discordImage, avatarSource: "discord" });
    const reads = calls.filter((call) => call.path.startsWith("/rest/v1/profiles"));
    expect(reads).toHaveLength(1); expect(new URL(reads[0].path, origin).searchParams.get("id")).toBe(`eq.${first}`);
    expect(reads[0].headers.get("apikey")).toBe("sb_secret_test-only"); expect(reads[0].headers.has("authorization")).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("creates an initial own profile with no stored email and no role mutation", async () => {
    const { calls } = mockProvider({ empty: true });
    const response = await getProfile(request("/api/account/profile"));
    expect(response.status).toBe(200); expect((await response.json()).profile.displayName).toBe("Discord Player");
    const insert = calls.find((call) => call.path.startsWith("/rest/v1/profiles") && call.method === "POST")!;
    expect(insert.body).toMatchObject({ id: first, display_name: "Discord Player", discord_avatar_url: discordImage });
    expect(insert.body).not.toHaveProperty("email"); expect(calls.some((call) => call.path.includes("editor_roles"))).toBe(false);
  });

  it("rejects anonymous requests, forged fields and cross-origin writes", async () => {
    const { calls, profiles } = mockProvider();
    expect((await getProfile(request("/api/account/profile", undefined, ""))).status).toBe(401);
    expect((await patchProfile(request("/api/account/profile", { displayName: "Attacker", id: second }, cookie(), "PATCH"))).status).toBe(422);
    expect((await patchProfile(request("/api/account/profile", { bio: "Changed" }, cookie(), "PATCH", { origin: "https://evil.example" }))).status).toBe(403);
    expect(calls.some((call) => call.method === "PATCH")).toBe(false); expect(profiles.get(second)!.bio).toBe("Private biography");
  });

  it("updates only the authenticated member's selected fields", async () => {
    const { profiles } = mockProvider();
    const response = await patchProfile(request("/api/account/profile", { displayName: "Updated player", bio: "My revised biography" }, cookie(), "PATCH"));
    expect(response.status).toBe(200); expect((await response.json()).profile).toMatchObject({ id: first, displayName: "Updated player", bio: "My revised biography" });
    expect(profiles.get(second)!.display_name).toBe("Second player");
  });

  it("reports profile storage failure without exposing database details", async () => {
    mockProvider({ profileStatus: 503 }); const response = await getProfile(request("/api/account/profile"));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("Internal private");
  });

  it("accepts only Discord CDN avatars and normalizes their image URL", () => {
    expect(discordAvatarURL(discordImage.replace(".webp?size=256", ".png?size=1024"))).toBe(discordImage);
    for (const value of ["https://evil.example/avatar.png", "https://cdn.discordapp.com.evil.example/embed/avatars/0.png", "https://user@cdn.discordapp.com/embed/avatars/0.png", "javascript:alert(1)", "https://cdn.discordapp.com/../private.png"]) expect(discordAvatarURL(value)).toBeNull();
  });
});

describe("Discord OAuth PKCE", () => {
  it("requests only identify/email and accepts its browser-bound callback without adding any role", async () => {
    const { calls } = mockProvider();
    const started = await startDiscord(request("/api/account/discord", {}, ""));
    expect(started.status).toBe(200); const body = await started.json(); const target = new URL(body.url);
    expect(target.origin).toBe("https://accounts-test.supabase.co"); expect(target.pathname).toBe("/auth/v1/authorize");
    expect(target.searchParams.get("provider")).toBe("discord"); expect(target.searchParams.get("scopes")).toBe("identify email");
    expect(target.searchParams.get("redirect_to")).toBe(`${origin}/api/account/discord/callback`);
    expect(started.cookies.getAll().some((item) => item.name.endsWith("-code-verifier") && item.httpOnly)).toBe(true);
    const incoming = request("/api/account/discord/callback?code=discord-code&next=https://evil.example", undefined, responseCookie(started));
    incoming.headers.delete("origin"); const completed = await completeDiscord(incoming);
    expect(completed.status).toBe(303); expect(completed.headers.get("location")).toBe(`${origin}/cuenta.html`);
    expect(calls.find((call) => call.path === "/auth/v1/token?grant_type=pkce")?.body).toMatchObject({ auth_code: "discord-code" });
    expect(calls.some((call) => call.path.includes("editor_roles"))).toBe(false);
    expect(await getEditor(request("/admin", undefined, responseCookie(completed)))).toBeNull();
  });

  it("fails honestly when disabled and rejects an unbound callback without exchanging tokens", async () => {
    const { fetchMock } = mockProvider(); vi.stubEnv("GAMEZONE_DISCORD_LOGIN_ENABLED", "0");
    expect(discordLoginAvailable(request("/cuenta.html"))).toBe(false);
    expect((await startDiscord(request("/api/account/discord", {}, ""))).status).toBe(503);
    vi.stubEnv("GAMEZONE_DISCORD_LOGIN_ENABLED", "1");
    const response = await completeDiscord(request("/api/account/discord/callback?code=unbound", undefined, ""));
    expect(response.headers.get("location")).toBe(`${origin}/cuenta.html?login=expired`); expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes only this browser's session, clearing both member and local editorial cookies", async () => {
    const { calls } = mockProvider();
    const response = await logout(request("/api/account/session", undefined, `${cookie()}; ${sessionCookieName}=local-session`, "DELETE"));
    expect(response.status).toBe(200);
    expect(calls.some((call) => call.path === "/auth/v1/logout?scope=local")).toBe(true);
    expect(response.cookies.get(supabaseSessionCookieName)).toMatchObject({ value: "", maxAge: 0 });
    expect(response.cookies.get(sessionCookieName)).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("private normalized profile photos", () => {
  it("normalizes JPEG into a 256px metadata-free WebP and replaces only the owner's old file", async () => {
    const { objects, profiles, calls } = mockProvider(); const old = `${first}/${avatarId}.webp`; const foreign = `${second}/${avatarId}.webp`;
    profiles.get(first)!.avatar_path = old; objects.set(old, Buffer.from("old")); objects.set(foreign, Buffer.from("foreign"));
    const image = await sharp({ create: { width: 512, height: 384, channels: 3, background: "red" } }).jpeg().withMetadata({ exif: { IFD0: { Artist: "Private EXIF value" } } }).toBuffer();
    const response = await uploadAvatar(request("/api/account/avatar", multipart(image)));
    expect(response.status).toBe(200); const dto = (await response.json()).profile;
    expect(dto.avatarSource).toBe("custom"); expect(dto.avatarURL).toMatch(/^\/api\/account\/avatar\?v=/);
    const path = profiles.get(first)!.avatar_path!; expect(path).toMatch(new RegExp(`^${first}/[a-f0-9-]{36}\\.webp$`));
    const metadata = await sharp(objects.get(path)!).metadata(); expect(metadata).toMatchObject({ width: 256, height: 256, format: "webp" }); expect(metadata.exif).toBeUndefined();
    expect(objects.has(old)).toBe(false); expect(objects.has(foreign)).toBe(true);
    const downloaded = await getAvatar(request(`/api/account/avatar?userId=${second}&path=${foreign}`));
    expect(downloaded.status).toBe(200); expect(downloaded.headers.get("content-type")).toBe("image/webp"); expect(downloaded.headers.get("cache-control")).toContain("private");
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(objects.get(path));
    expect(calls.filter((call) => call.path.includes("/storage/")).every((call) => !call.path.includes(second))).toBe(true);
    const reset = await resetAvatar(request("/api/account/avatar", undefined, cookie(), "DELETE"));
    expect((await reset.json()).profile).toMatchObject({ avatarSource: "discord", avatarURL: discordImage }); expect(objects.has(path)).toBe(false);
  });

  it("rejects oversized bodies, SVG disguised as JPEG and images over twenty megapixels", async () => {
    const { calls } = mockProvider();
    const oversized = request("/api/account/avatar", {}, cookie(), "POST", { "content-type": "multipart/form-data; boundary=test", "content-length": String(4 * 1024 * 1024 + 64 * 1024 + 1) });
    expect((await uploadAvatar(oversized)).status).toBe(413);
    const oversizedFile = multipart(Buffer.alloc(4 * 1024 * 1024 + 1));
    const oversizedFileResponse = await uploadAvatar(request("/api/account/avatar", oversizedFile));
    expect(oversizedFileResponse.status).toBe(413); expect((await oversizedFileResponse.json()).error).toMatch(/4 MiB/);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>');
    expect((await uploadAvatar(request("/api/account/avatar", multipart(svg)))).status).toBe(422);
    const huge = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "red" } }).png().toBuffer();
    expect((await uploadAvatar(request("/api/account/avatar", multipart(huge, "large.png", "image/png")))).status).toBe(422);
    expect(calls.some((call) => call.path.includes("/storage/"))).toBe(false);
  });

  it("refuses a foreign avatar path even if a malformed profile row returns it", async () => {
    const { calls } = mockProvider({ corruptPath: true });
    const response = await getAvatar(request("/api/account/avatar"));
    expect(response.status).toBe(503); expect(calls.some((call) => call.path.includes("/storage/"))).toBe(false);
  });

  it("removes an uncommitted upload when a concurrent profile edit wins", async () => {
    const { objects, calls } = mockProvider({ conflict: true });
    const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: "blue" } }).png().toBuffer();
    const response = await uploadAvatar(request("/api/account/avatar", multipart(bytes, "photo.png", "image/png")));
    expect(response.status).toBe(409); expect(objects.size).toBe(0);
    expect(calls.filter((call) => call.path === "/storage/v1/object/profile-avatars" && call.method === "DELETE")).toHaveLength(1);
  });
});

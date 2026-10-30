import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { apiError, HttpError, json, limitRequests, readJson } from "@/lib/api";
import { discordLoginAvailable, requestOrigin } from "./auth";
import { editorSiteOrigin, supabaseAuthConfiguration } from "./configuration";
import { getVerifiedSupabaseUser, supabaseSessionTransport } from "./supabase";
import { logoutEditor as logoutBrowserSession } from "./sessions";
import type { MemberProfileDTO } from "./profile-types";
export type { MemberProfileDTO } from "./profile-types";

interface ProfileRow { id: string; display_name: string; bio: string; discord_avatar_url: string | null; avatar_path: string | null; updated_at: string }
const bucket = "profile-avatars";
const maxAvatarBytes = 4 * 1024 * 1024;
const maxUploadBodyBytes = maxAvatarBytes + 64 * 1024;
const maxPixels = 20_000_000;
const columns = "id,display_name,bio,discord_avatar_url,avatar_path,updated_at";
const patchSchema = z.object({ displayName: z.string().trim().min(1).max(80).optional(), bio: z.string().trim().max(500).optional() }).strict().refine((value) => value.displayName !== undefined || value.bio !== undefined, "No hay cambios de perfil.");

function ownMutation(request: Request) {
  const origin = requestOrigin(request); const site = request.headers.get("sec-fetch-site");
  if (!origin || request.headers.get("origin") !== origin || (site && !["same-origin", "none"].includes(site))) throw new HttpError("El origen de la solicitud no está permitido.", 403);
}
async function requireUser(request: Request) {
  if (!supabaseAuthConfiguration()) throw new HttpError("Las cuentas todavía no están configuradas.", 503);
  const user = await getVerifiedSupabaseUser(request);
  if (!user) throw new HttpError("Inicia sesión para acceder a tu cuenta.", 401);
  return user;
}
function accountError(error: unknown) { return error instanceof HttpError || error instanceof z.ZodError ? apiError(error) : json({ error: "No se pudo completar la operación de tu cuenta. Inténtalo de nuevo más tarde." }, 503); }

/** Provider avatars are used as image URLs only; arbitrary URLs are never fetched or stored. */
export function discordAvatarURL(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "cdn.discordapp.com" || url.port || url.username || url.password) return null;
    const avatar = url.pathname.match(/^\/avatars\/(\d{17,20})\/((?:a_)?[a-f0-9]{32})\.(?:png|jpg|jpeg|webp|gif)$/);
    if (avatar) return `https://cdn.discordapp.com/avatars/${avatar[1]}/${avatar[2]}.webp?size=256`;
    return /^\/embed\/avatars\/[0-5]\.png$/.test(url.pathname) ? `https://cdn.discordapp.com${url.pathname}` : null;
  } catch { return null; }
}
function providerAvatar(user: User) {
  const discord = user.identities?.find((identity) => identity.provider === "discord")?.identity_data;
  return discordAvatarURL(discord?.avatar_url ?? discord?.picture) ?? (user.app_metadata.provider === "discord" ? discordAvatarURL(user.user_metadata.avatar_url ?? user.user_metadata.picture) : null);
}
function defaultName(user: User) {
  for (const key of ["full_name", "name", "user_name", "preferred_username"]) {
    const value: unknown = user.user_metadata[key];
    if (typeof value === "string" && value.trim()) return [...value.trim()].slice(0, 80).join("");
  }
  return "Jugador";
}
function ownAvatarPath(userId: string, path: string | null): path is string {
  return typeof path === "string" && new RegExp(`^${userId}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.webp$`, "i").test(path);
}
async function serverRequest(path: string, init?: RequestInit): Promise<Response> {
  const config = supabaseAuthConfiguration();
  if (!config) throw new HttpError("Las cuentas todavía no están configuradas.", 503);
  const response = await fetch(`${config.url}/${path}`, {
    ...init, headers: { apikey: config.secretKey, ...(!config.secretKey.startsWith("sb_secret_") ? { Authorization: `Bearer ${config.secretKey}` } : {}), ...init?.headers },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError("No se pudo acceder al almacenamiento de tu cuenta.", 503);
  return response;
}
async function readRow(user: User): Promise<ProfileRow | null> {
  const query = new URLSearchParams({ select: columns, id: `eq.${user.id}`, limit: "1" });
  const rows: unknown = await (await serverRequest(`rest/v1/profiles?${query}`)).json();
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("Invalid own-profile response.");
  const row = rows[0] as ProfileRow | undefined;
  if (row && (row.id !== user.id || typeof row.display_name !== "string" || typeof row.bio !== "string" || typeof row.updated_at !== "string" || (row.avatar_path !== null && !ownAvatarPath(user.id, row.avatar_path)))) throw new Error("Invalid own-profile identity.");
  return row ?? null;
}
async function ensureProfile(user: User): Promise<ProfileRow> {
  const existing = await readRow(user);
  if (existing) return existing;
  await serverRequest("rest/v1/profiles?on_conflict=id", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: user.id, display_name: defaultName(user), bio: "", discord_avatar_url: providerAvatar(user), avatar_path: null }) });
  const created = await readRow(user);
  if (!created) throw new Error("Own profile was not created.");
  return created;
}
function profileDTO(user: User, row: ProfileRow): MemberProfileDTO {
  const discord = discordAvatarURL(row.discord_avatar_url);
  const custom = ownAvatarPath(user.id, row.avatar_path);
  return { id: user.id, displayName: row.display_name, bio: row.bio,
    avatarURL: custom ? `/api/account/avatar?v=${encodeURIComponent(row.updated_at)}` : discord,
    avatarSource: custom ? "custom" : discord ? "discord" : "none", email: user.email ?? null };
}
async function updateProfile(user: User, values: Partial<Pick<ProfileRow, "display_name" | "bio" | "avatar_path" | "discord_avatar_url">>, expected?: ProfileRow): Promise<ProfileRow> {
  const query = new URLSearchParams({ id: `eq.${user.id}`, select: columns });
  if (expected) query.set("updated_at", `eq.${expected.updated_at}`);
  const rows: unknown = await (await serverRequest(`rest/v1/profiles?${query}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }) })).json();
  if (!Array.isArray(rows)) throw new Error("Invalid profile update response.");
  if (!rows.length) throw new HttpError("Tu perfil cambió en otra pestaña. Recarga y vuelve a intentarlo.", 409);
  if (rows.length !== 1 || (rows[0] as ProfileRow).id !== user.id) throw new Error("Invalid profile update identity.");
  return rows[0] as ProfileRow;
}

export async function getMemberProfile(request: Request): Promise<MemberProfileDTO | null> {
  const user = await getVerifiedSupabaseUser(request);
  return user ? profileDTO(user, await ensureProfile(user)) : null;
}
export async function readOwnProfile(request: Request) {
  try { const user = await requireUser(request); return json({ profile: profileDTO(user, await ensureProfile(user)) }); } catch (error) { return accountError(error); }
}
export async function patchOwnProfile(request: Request) {
  try {
    ownMutation(request); const user = await requireUser(request); limitRequests(`profile-edit:${user.id}`, 20);
    const patch = patchSchema.parse(await readJson(request, 8192)); const previous = await ensureProfile(user);
    const row = await updateProfile(user, { ...(patch.displayName === undefined ? {} : { display_name: patch.displayName }), ...(patch.bio === undefined ? {} : { bio: patch.bio }) }, previous);
    return json({ profile: profileDTO(user, row) });
  } catch (error) { return accountError(error); }
}

function accountRedirect(origin: string | null, failure?: "expired" | "unavailable") {
  const path = `/cuenta.html${failure ? `?login=${failure}` : ""}`;
  const response = origin ? NextResponse.redirect(new URL(path, origin), 303) : new NextResponse(null, { status: 303, headers: { Location: path } });
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer"); return response;
}
export async function startDiscordLogin(request: Request) {
  try {
    ownMutation(request);
    if (!discordLoginAvailable(request)) throw new HttpError("El acceso con Discord todavía no está disponible.", 503);
    z.object({}).strict().parse(await readJson(request, 1024)); limitRequests("discord-login-start", 30);
    const transport = supabaseSessionTransport(request); const config = supabaseAuthConfiguration()!;
    const { data, error } = await transport.client.auth.signInWithOAuth({ provider: "discord", options: { scopes: "identify email", redirectTo: `${editorSiteOrigin()}/api/account/discord/callback`, skipBrowserRedirect: true } });
    if (error || !data.url) throw new HttpError("No se pudo iniciar el acceso con Discord.", 503);
    const target = new URL(data.url);
    if (target.origin !== config.url || target.pathname !== "/auth/v1/authorize" || target.searchParams.get("provider") !== "discord") throw new Error("Invalid Discord authorization target.");
    return transport.finish(json({ url: target.href }));
  } catch (error) { return accountError(error); }
}
export async function completeDiscordLogin(request: Request) {
  const origin = editorSiteOrigin();
  if (!discordLoginAvailable(request) || !origin) return accountRedirect(origin, "unavailable");
  const query = new URL(request.url).searchParams; const codes = query.getAll("code"); const code = codes[0]; const flows = query.getAll("sb_flow_id"); const flow = flows[0];
  if (query.has("error") || codes.length !== 1 || !code || code.length > 4096 || /[\u0000-\u0020\u007f]/.test(code) || flows.length > 1 || (flow !== undefined && !/^[a-zA-Z0-9_-]{8,64}$/.test(flow))) return accountRedirect(origin, "expired");
  const transport = supabaseSessionTransport(request);
  try {
    const { error } = await transport.client.auth.exchangeCodeForSession(code, flow ? { flowId: flow } : undefined);
    if (error) return transport.finish(accountRedirect(origin, !error.status || error.status >= 500 ? "unavailable" : "expired"));
    const { data, error: userError } = await transport.client.auth.getUser();
    if (userError || !data.user) throw new Error("The account could not be verified.");
    const row = await ensureProfile(data.user); const avatar = providerAvatar(data.user);
    if (avatar !== row.discord_avatar_url) await updateProfile(data.user, { discord_avatar_url: avatar }, row);
    return transport.finish(accountRedirect(origin));
  } catch {
    await transport.client.auth.signOut({ scope: "local" }).catch(() => undefined);
    transport.clear(); return transport.finish(accountRedirect(origin, "unavailable"));
  }
}
export async function logoutMember(request: Request) {
  return logoutBrowserSession(request);
}

async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > maxUploadBodyBytes) throw new HttpError("La solicitud supera el límite permitido para una foto de 4 MiB.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new HttpError("Selecciona una imagen.", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxUploadBodyBytes) { await reader.cancel(); throw new HttpError("La solicitud supera el límite permitido para una foto de 4 MiB.", 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return bytes;
}
async function normalizedAvatar(request: Request): Promise<Buffer> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new HttpError("Envía una imagen con el campo file.", 415);
  const body = await boundedBody(request); let form: FormData;
  try { form = await new Response(body, { headers: { "Content-Type": contentType } }).formData(); } catch { throw new HttpError("El archivo no es válido.", 400); }
  const entries = [...form.entries()]; const file = form.get("file");
  if (entries.length !== 1 || !(file instanceof File) || !/\.(?:jpe?g|png|webp)$/i.test(file.name) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size) throw new HttpError("Selecciona un archivo JPG, PNG o WebP.", 422);
  if (file.size > maxAvatarBytes) throw new HttpError("La foto supera el límite de 4 MiB.", 413);
  const input = Buffer.from(await file.arrayBuffer());
  const signatureMatches = file.type === "image/jpeg" ? input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : file.type === "image/png" ? input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : input.subarray(0, 4).toString("ascii") === "RIFF" && input.subarray(8, 12).toString("ascii") === "WEBP";
  if (!signatureMatches) throw new HttpError("El contenido del archivo no es una imagen JPG, PNG o WebP válida.", 422);
  try {
    const decoder = sharp(input, { limitInputPixels: maxPixels, failOn: "warning", animated: false });
    const metadata = await decoder.metadata();
    const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (!metadata.format || formats[metadata.format] !== file.type || !metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image.");
    return await decoder.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
  } catch { throw new HttpError("La imagen no es válida o supera el límite de 20 megapíxeles.", 422); }
}
async function removeAvatarObject(user: User, path: string | null) {
  if (!ownAvatarPath(user.id, path)) return;
  await serverRequest(`storage/v1/object/${bucket}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] }) });
}
export async function uploadOwnAvatar(request: Request) {
  try {
    ownMutation(request); const user = await requireUser(request); limitRequests(`avatar-upload:${user.id}`, 6);
    const bytes = await normalizedAvatar(request); const previous = await ensureProfile(user); const path = `${user.id}/${randomUUID()}.webp`;
    await serverRequest(`storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { "Content-Type": "image/webp", "x-upsert": "false", "Cache-Control": "private, no-store" }, body: new Uint8Array(bytes) });
    let row: ProfileRow;
    try { row = await updateProfile(user, { avatar_path: path }, previous); } catch (error) { await removeAvatarObject(user, path).catch(() => undefined); throw error; }
    await removeAvatarObject(user, previous.avatar_path).catch(() => undefined);
    return json({ profile: profileDTO(user, row) });
  } catch (error) { return accountError(error); }
}
export async function resetOwnAvatar(request: Request) {
  try {
    ownMutation(request); const user = await requireUser(request); limitRequests(`avatar-reset:${user.id}`, 10);
    const previous = await ensureProfile(user); const row = await updateProfile(user, { avatar_path: null }, previous);
    await removeAvatarObject(user, previous.avatar_path).catch(() => undefined); return json({ profile: profileDTO(user, row) });
  } catch (error) { return accountError(error); }
}
export async function readOwnAvatar(request: Request) {
  try {
    const user = await requireUser(request); const row = await readRow(user);
    if (!row || !ownAvatarPath(user.id, row.avatar_path)) throw new HttpError("No hay una foto de perfil personalizada.", 404);
    const stored = await serverRequest(`storage/v1/object/authenticated/${bucket}/${row.avatar_path}`);
    const bytes = await stored.arrayBuffer(); if (bytes.byteLength > maxAvatarBytes) throw new Error("Invalid stored avatar.");
    return new Response(bytes, { headers: { "Content-Type": "image/webp", "Content-Length": String(bytes.byteLength), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return accountError(error); }
}

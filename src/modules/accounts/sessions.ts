import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { apiError, HttpError, json, limitRequests, readJson } from "@/lib/api";
import { createLocalSession, editorAuthMode, requestOrigin, sessionCookieName, sessionCookieOptions } from "./auth";
import { clearSupabaseSessionCookies, readEditorRole, supabaseCodeClient, supabaseSessionTransport } from "./supabase";
import { editorEmailMethod, editorSiteOrigin, supabaseAuthConfiguration } from "./configuration";

const emailSchema = z.string().trim().toLowerCase().max(254).email();
const requestCodeSchema = z.object({ email: emailSchema }).strict();
const verifyCodeSchema = z.object({ email: emailSchema, token: z.string().trim().regex(/^\d{6,10}$/, "Introduce el código numérico del correo.") }).strict();
const codeRequested = "Si tu cuenta tiene acceso, recibirás un código.";

function requireSameOrigin(request: Request) {
  const origin = requestOrigin(request);
  const site = request.headers.get("sec-fetch-site");
  if (!origin || request.headers.get("origin") !== origin || (site && !["same-origin", "none"].includes(site))) throw new HttpError("El origen de la solicitud no está permitido.", 403);
}
function emailKey(email: string) { return createHash("sha256").update(email).digest("hex"); }
function codeError(status: number, message: string) { return json({ error: message }, status); }

export async function requestEditorLogin(request: Request) {
  try {
    requireSameOrigin(request);
    const mode = editorAuthMode(request);
    if (mode === "unavailable") throw new HttpError("El acceso editorial no está configurado para este entorno.", 503);
    const body = await readJson(request, 4096);
    if (mode === "local") {
      limitRequests("local-login", 10);
      const { password } = z.object({ password: z.string().min(1).max(1024) }).strict().parse(body);
      const session = await createLocalSession(password);
      if (!session) throw new HttpError("La contraseña no es correcta.", 401);
      const response = json({ ok: true }); response.cookies.set(sessionCookieName, session, sessionCookieOptions(request)); return response;
    }
    const { email } = requestCodeSchema.parse(body);
    limitRequests("editor-code-request-global", 30);
    limitRequests(`editor-code-request:${emailKey(email)}`, 6, 15 * 60_000);
    const method = editorEmailMethod();
    const transport = method === "link" ? supabaseSessionTransport(request) : null;
    const client = transport?.client ?? supabaseCodeClient();
    const emailRedirectTo = method === "link" ? `${editorSiteOrigin()}/api/admin/session/callback` : undefined;
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, ...(emailRedirectTo ? { emailRedirectTo } : {}) } });
    if (error?.status === 429) throw new HttpError("Espera un minuto antes de solicitar otro código.", 429);
    // Keep the response identical for existing and unknown accounts; never relay provider errors.
    if (error && ![400, 401, 403, 404, 422].includes(error.status || 0)) throw new HttpError("No se pudo solicitar el código. Inténtalo de nuevo más tarde.", 503);
    const response = json({ ok: true, method, message: method === "link" ? "Si tu cuenta tiene acceso, recibirás un enlace para entrar." : codeRequested });
    response.headers.set("Cache-Control", "private, no-store"); return transport ? transport.finish(response) : response;
  } catch (error) { return apiError(error); }
}

type LoginFailure = "expired" | "denied" | "unavailable";
function adminRedirect(origin: string | null, failure?: LoginFailure) {
  const path = `/admin${failure ? `?login=${failure}` : ""}`;
  const response = origin ? NextResponse.redirect(new URL(path, origin), 303) : new NextResponse(null, { status: 303, headers: { Location: path } });
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer"); return response;
}

/** Only an authorization code bound to this browser's PKCE cookie can establish a session. */
export async function completeEditorEmailLogin(request: Request) {
  const origin = editorSiteOrigin();
  if (!origin || requestOrigin(request) !== origin || !supabaseAuthConfiguration()) return adminRedirect(origin, "unavailable");
  const query = new URL(request.url).searchParams;
  const codes = query.getAll("code");
  const code = codes[0];
  const flowIds = query.getAll("sb_flow_id");
  const flowId = flowIds[0];
  if (query.has("error") || codes.length !== 1 || !code || code.length > 4096 || /[\u0000-\u0020\u007f]/.test(code) || flowIds.length > 1 || (flowId !== undefined && !/^[a-zA-Z0-9_-]{8,64}$/.test(flowId))) return adminRedirect(origin, "expired");
  const transport = supabaseSessionTransport(request);
  try {
    const { error } = await transport.client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) return transport.finish(adminRedirect(origin, !error.status || error.status >= 500 ? "unavailable" : "expired"));
    const { data, error: userError } = await transport.client.auth.getUser();
    if (userError || !data.user) throw new Error("The authenticated user could not be verified.");
    const editor = await readEditorRole(data.user.id);
    if (!editor) {
      await transport.client.auth.signOut({ scope: "local" }).catch(() => undefined);
      transport.clear(); return transport.finish(adminRedirect(origin, "denied"));
    }
    return transport.finish(adminRedirect(origin));
  } catch {
    await transport.client.auth.signOut({ scope: "local" }).catch(() => undefined);
    transport.clear(); return transport.finish(adminRedirect(origin, "unavailable"));
  }
}

export async function verifyEditorLogin(request: Request) {
  try {
    requireSameOrigin(request);
    if (editorAuthMode(request) !== "supabase") throw new HttpError("El acceso editorial por correo no está configurado para este entorno.", 503);
    const { email, token } = verifyCodeSchema.parse(await readJson(request, 4096));
    limitRequests("editor-code-verify-global", 60);
    limitRequests(`editor-code-verify:${emailKey(email)}`, 6, 10 * 60_000);
    const transport = supabaseSessionTransport(request);
    try {
      const { error } = await transport.client.auth.verifyOtp({ email, token, type: "email" });
      if (error) {
        if (!error.status || error.status >= 500) return transport.finish(codeError(503, "No se pudo verificar el acceso editorial. Inténtalo de nuevo más tarde."));
        return transport.finish(codeError(error.status === 429 ? 429 : 401, error.status === 429 ? "Demasiados intentos. Espera antes de volver a probar." : "El código no es válido o ha caducado."));
      }
      const { data, error: userError } = await transport.client.auth.getUser();
      if (userError || !data.user) throw new Error("The authenticated user could not be verified.");
      const editor = await readEditorRole(data.user.id);
      if (!editor) {
        await transport.client.auth.signOut({ scope: "local" }).catch(() => undefined);
        transport.clear();
        return transport.finish(codeError(403, "Esta cuenta no tiene acceso editorial."));
      }
      return transport.finish(json({ ok: true }));
    } catch {
      await transport.client.auth.signOut({ scope: "local" }).catch(() => undefined);
      transport.clear();
      return transport.finish(codeError(503, "No se pudo verificar el acceso editorial. Inténtalo de nuevo más tarde."));
    }
  } catch (error) { return apiError(error); }
}

export async function logoutEditor(request: Request) {
  try {
    requireSameOrigin(request);
    let response = json({ ok: true });
    if (supabaseAuthConfiguration()) {
      const transport = supabaseSessionTransport(request);
      try { await transport.client.auth.signOut({ scope: "local" }); } catch { /* Always clear this browser's cookies, including when the provider is unavailable. */ }
      transport.clear(); response = transport.finish(response);
    }
    clearSupabaseSessionCookies(request, response);
    response.cookies.set(sessionCookieName, "", { ...sessionCookieOptions(request), maxAge: 0 });
    return response;
  } catch (error) { return apiError(error); }
}

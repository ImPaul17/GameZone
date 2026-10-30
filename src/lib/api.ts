import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getEditor, requestOrigin } from "@/modules/accounts/auth";
import { RepositoryError } from "@/modules/catalog/repository";

export class HttpError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function requireEditor(request: Request) {
  const editor = await getEditor(request);
  if (!editor) throw new HttpError("Inicia sesión con una cuenta editorial para continuar.", 401);
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = requestOrigin(request);
    if (!origin || request.headers.get("origin") !== origin) throw new HttpError("El origen de la solicitud no está permitido.", 403);
    const site = request.headers.get("sec-fetch-site");
    if (site && !["same-origin", "none"].includes(site)) throw new HttpError("El origen de la solicitud no está permitido.", 403);
  }
  return editor;
}

export async function readJson(request: Request, limit = 256_000): Promise<unknown> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) throw new HttpError("Envía los datos en formato JSON.", 415);
  if (Number(request.headers.get("content-length") || 0) > limit) throw new HttpError("La solicitud supera el tamaño permitido.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("Faltan los datos de la solicitud.", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError("La solicitud supera el tamaño permitido.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError("Los datos JSON no son válidos.", 400); }
}

const counters = new Map<string, { count: number; until: number }>();
export function limitRequests(key: string, max: number, interval = 60_000) {
  const now = Date.now();
  for (const [oldKey, counter] of counters) if (counter.until < now) counters.delete(oldKey);
  const existing = counters.get(key);
  if (existing && existing.until > now) {
    if (existing.count >= max) throw new HttpError("Has alcanzado el límite temporal. Espera un minuto y vuelve a intentarlo.", 429);
    existing.count++;
  } else counters.set(key, { count: 1, until: now + interval });
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: error.issues.slice(0, 4).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ") }, 422);
  if (error instanceof RepositoryError) {
    const status = { conflict: 409, not_found: 404, validation: 422, configuration: 503, storage: 503 }[error.code];
    return json({ error: error.message }, status);
  }
  // Do not return stack traces, upstream responses or credentials to the browser.
  return json({ error: "No se pudo completar la operación. El borrador guardado permanece intacto." }, 500);
}

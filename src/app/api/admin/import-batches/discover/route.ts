import { z } from "zod";
import { apiError, HttpError, json, limitRequests, readJson, requireEditor } from "@/lib/api";
import { discoverBatchURLs } from "@/modules/imports/batch-discovery";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    const editor = await requireEditor(request); limitRequests(`batch-discovery:${editor.id}`, 4);
    const { sitemap } = z.object({ sitemap: z.string().max(2048).optional() }).strict().parse(await readJson(request, 4096));
    try { return json(await discoverBatchURLs(sitemap)); }
    catch (error) { throw new HttpError(error instanceof Error ? error.message.slice(0, 500) : "No se pudo consultar el sitemap de PiviGames.", 422); }
  } catch (error) { return apiError(error); }
}

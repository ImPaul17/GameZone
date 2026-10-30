import { z } from "zod";
import { getRecord, updateRecord } from "@/modules/catalog/repository";
import { gameContentSchema } from "@/modules/catalog/validation";
import { apiError, HttpError, json, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
const updateSchema = z.object({
  content: gameContentSchema, expectedRevision: z.number().int().positive(),
  action: z.enum(["save", "publish", "unpublish"]), lastImported: gameContentSchema.optional(),
  source: z.object({ provider: z.literal("pivigames"), id: z.string().min(1).max(160), url: z.string().url().max(2048) }).strict().nullable().optional(),
}).strict();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    await requireEditor(request);
    const { id } = await params;
    const record = await getRecord(id);
    if (!record) throw new HttpError("No se encontró la publicación.", 404);
    return json({ record });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    await requireEditor(request);
    const { id } = await params;
    const input = updateSchema.parse(await readJson(request));
    const record = await updateRecord(id, input.content, input.expectedRevision, input.action, input.lastImported, input.source);
    return json({ record });
  } catch (error) { return apiError(error); }
}

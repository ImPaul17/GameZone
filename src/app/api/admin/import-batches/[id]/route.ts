import { z } from "zod";
import { apiError, json, readJson, requireEditor } from "@/lib/api";
import { changeBatchState, getBatch } from "@/modules/imports/batch-repository";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try { await requireEditor(request); const { id } = await context.params; return json({ batch: await getBatch(z.uuid().parse(id)) }); } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    await requireEditor(request); const { id } = await context.params;
    const { action } = z.object({ action: z.enum(["pause", "resume", "retry"]) }).strict().parse(await readJson(request, 1024));
    return json({ batch: await changeBatchState(z.uuid().parse(id), action) });
  } catch (error) { return apiError(error); }
}

import { z } from "zod";
import { apiError, json, readJson, requireEditor } from "@/lib/api";
import { stepBatch } from "@/modules/imports/batch-worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireEditor(request); z.object({}).strict().parse(await readJson(request, 1024));
    const { id } = await context.params; return json({ batch: await stepBatch(z.uuid().parse(id)) });
  } catch (error) { return apiError(error); }
}

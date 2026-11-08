import { z } from "zod";
import { apiError, json, limitRequests, readJson, requireEditor } from "@/lib/api";
import { createBatch, listBatches } from "@/modules/imports/batch-repository";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { await requireEditor(request); return json({ batches: await listBatches() }); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const editor = await requireEditor(request); limitRequests(`batch-create:${editor.id}`, 5);
    const body = z.object({ urls: z.array(z.string().max(2048)).min(1).max(1000) }).strict().parse(await readJson(request, 2_100_000));
    return json({ batch: await createBatch(body.urls) }, 201);
  } catch (error) { return apiError(error); }
}

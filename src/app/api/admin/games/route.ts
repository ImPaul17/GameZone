import { z } from "zod";
import { createRecord, listRecords, listRecordSummaries } from "@/modules/catalog/repository";
import { gameContentSchema } from "@/modules/catalog/validation";
import { apiError, json, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
const createSchema = z.object({
  content: gameContentSchema,
  source: z.object({ provider: z.literal("pivigames"), id: z.string().min(1).max(160), url: z.string().url().max(2048) }).strict().nullable().optional(),
  lastImported: gameContentSchema.nullable().optional(),
}).strict();

export async function GET(request: Request) {
  try {
    await requireEditor(request);
    return json({ records: new URL(request.url).searchParams.get("summary") === "1" ? await listRecordSummaries() : await listRecords() });
  }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireEditor(request);
    const input = createSchema.parse(await readJson(request));
    return json({ record: await createRecord(input.content, input.source, input.lastImported) }, 201);
  } catch (error) { return apiError(error); }
}

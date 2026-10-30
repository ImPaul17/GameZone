import { z } from "zod";
import { createNewsRecord, listNewsRecords } from "@/modules/news/repository";
import { newsContentSchema } from "@/modules/news/validation";
import { apiError, json, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
const createSchema = z.object({ content: newsContentSchema }).strict();

export async function GET(request: Request) {
  try { await requireEditor(request); return json({ records: await listNewsRecords() }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireEditor(request);
    const { content } = createSchema.parse(await readJson(request));
    return json({ record: await createNewsRecord(content) }, 201);
  } catch (error) { return apiError(error); }
}

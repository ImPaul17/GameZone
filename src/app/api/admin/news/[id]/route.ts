import { z } from "zod";
import { getNewsRecord, updateNewsRecord } from "@/modules/news/repository";
import { newsContentSchema } from "@/modules/news/validation";
import { apiError, HttpError, json, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
const updateSchema = z.object({ content: newsContentSchema, expectedRevision: z.number().int().positive(), action: z.enum(["save", "publish", "unpublish"]) }).strict();
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    await requireEditor(request);
    const id = z.string().uuid().parse((await params).id);
    const record = await getNewsRecord(id);
    if (!record) throw new HttpError("No se encontró la noticia.", 404);
    return json({ record });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    await requireEditor(request);
    const id = z.string().uuid().parse((await params).id);
    const { content, expectedRevision, action } = updateSchema.parse(await readJson(request));
    return json({ record: await updateNewsRecord(id, content, expectedRevision, action) });
  } catch (error) { return apiError(error); }
}

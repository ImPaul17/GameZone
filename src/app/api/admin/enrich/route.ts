import { z } from "zod";
import { gameContentSchema } from "@/modules/catalog/validation";
import { enrichWithIgdb } from "@/modules/integrations/igdb";
import { apiError, json, limitRequests, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const editor = await requireEditor(request);
    limitRequests(`enrich:${editor.id}`, 10);
    const { content } = z.object({ content: gameContentSchema }).strict().parse(await readJson(request));
    return json(await enrichWithIgdb(content));
  } catch (error) { return apiError(error); }
}

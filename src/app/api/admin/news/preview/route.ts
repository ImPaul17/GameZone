import { z } from "zod";
import { newsContentSchema } from "@/modules/news/validation";
import { renderLegacyPage } from "@/modules/legacy/renderer";
import { requestOrigin } from "@/modules/accounts/auth";
import { apiError, json, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireEditor(request);
    const { content } = z.object({ content: newsContentSchema }).strict().parse(await readJson(request));
    const html = await renderLegacyPage(`/noticias/${content.slug}.html`, [], { preview: true, newsContent: content, origin: requestOrigin(request) || new URL(request.url).origin });
    return json({ html });
  } catch (error) { return apiError(error); }
}

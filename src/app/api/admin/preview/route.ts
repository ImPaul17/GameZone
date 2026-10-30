import { z } from "zod";
import { gameContentSchema } from "@/modules/catalog/validation";
import { renderLegacyPage } from "@/modules/legacy/renderer";
import { requestOrigin } from "@/modules/accounts/auth";
import { apiError, json, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireEditor(request);
    const { content } = z.object({ content: gameContentSchema }).strict().parse(await readJson(request));
    const html = await renderLegacyPage(`/games/${content.slug}/${content.slug}.html`, [], { preview: true, origin: requestOrigin(request) || new URL(request.url).origin, content });
    return json({ html });
  } catch (error) { return apiError(error); }
}

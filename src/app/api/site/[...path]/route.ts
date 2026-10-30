import { listPublishedGames } from "@/modules/catalog/repository";
import { LegacyPageNotFoundError, renderLegacyPage } from "@/modules/legacy/renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const html = await renderLegacyPage(`/${path.join("/")}`, await listPublishedGames());
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof LegacyPageNotFoundError ? 404 : 503;
    return new Response(status === 404 ? "Publicación no encontrada." : "No se ha podido cargar la página. Inténtalo de nuevo en un momento.", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}

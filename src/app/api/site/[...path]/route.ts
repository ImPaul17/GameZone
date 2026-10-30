import { listPublishedGames } from "@/modules/catalog/repository";
import { listPublishedNews } from "@/modules/news/repository";
import { LegacyPageNotFoundError, renderLegacyPage } from "@/modules/legacy/renderer";
import { withAccountLink } from "@/modules/legacy/account-link";
import { discordLoginAvailable } from "@/modules/accounts/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const [games, news] = await Promise.all([listPublishedGames(), listPublishedNews()]);
    const html = withAccountLink(await renderLegacyPage(`/${path.join("/")}`, games, { news }), discordLoginAvailable(_request));
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof LegacyPageNotFoundError ? 404 : 503;
    return new Response(status === 404 ? "Publicación no encontrada." : "No se ha podido cargar la página. Inténtalo de nuevo en un momento.", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}

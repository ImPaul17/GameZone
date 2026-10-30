import type { MetadataRoute } from "next";
import { listPublishedGames } from "@/modules/catalog/repository";
import { listPublishedNews } from "@/modules/news/repository";
import { serverEnvironment } from "@/lib/server-environment";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = serverEnvironment("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
  const [games, news] = await Promise.all([listPublishedGames(), listPublishedNews()]);
  return [
    ...["", "/games.html", "/noticias.html", "/hall-of-fame.html", "/about.html"].map((path) => ({ url: `${url}${path}` })),
    ...games.map((game) => ({ url: `${url}/games/${game.slug}/${game.slug}.html`, lastModified: new Date(game.updatedAt) })),
    ...news.map((article) => ({ url: `${url}/noticias/${article.slug}.html`, lastModified: new Date(article.updatedAt) })),
  ];
}

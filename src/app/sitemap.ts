import type { MetadataRoute } from "next";
import { listPublishedGames } from "@/modules/catalog/repository";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const games = await listPublishedGames();
  return [
    ...["", "/games.html", "/noticias.html", "/hall-of-fame.html", "/about.html"].map((path) => ({ url: `${url}${path}` })),
    ...games.map((game) => ({ url: `${url}/games/${game.slug}/${game.slug}.html`, lastModified: new Date(game.updatedAt) })),
  ];
}

import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const url = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/buscar.html", "/secret.html"] }, sitemap: `${url}/sitemap.xml` };
}

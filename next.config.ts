import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingExcludes: { "*": ["./.data/**", "./.env*", "./GameZone-main.zip", "./logos/logo.psd"] },
  outputFileTracingIncludes: {
    // A wildcard also matches the catch-all route in Turbopack's tracing matcher.
    "/api/site/*": ["./*.html", "./games/**/*.html"],
    "/api/admin/preview": ["./games/**/*.html"],
    "/api/admin/news/preview": ["./noticias.html", "./index.html"],
  },
  async redirects() {
    return [
      { source: "/juegos", destination: "/games.html", permanent: false },
      { source: "/juegos/:slug", destination: "/games/:slug/:slug.html", permanent: false },
      { source: "/buscar", destination: "/buscar.html", permanent: false },
      { source: "/noticias", destination: "/noticias.html", permanent: false },
      { source: "/hall-of-fame", destination: "/hall-of-fame.html", permanent: false },
      { source: "/acerca", destination: "/about.html", permanent: false },
      { source: "/legacy/secret.html", destination: "/secret.html", permanent: false },
    ];
  },
  async rewrites() {
    return { beforeFiles: [
      ...["index.html", "games.html", "buscar.html", "noticias.html", "hall-of-fame.html", "about.html", "dmca.html", "secret.html"].map((path) => ({ source: `/${path}`, destination: `/api/site/${path}` })),
      { source: "/", destination: "/api/site/index.html" },
      { source: "/games/:slug/:file.html", destination: "/api/site/games/:slug/:file.html" },
      { source: "/noticias/:slug.html", destination: "/api/site/noticias/:slug.html" },
    ] };
  },
  async headers() {
    return [{ source: "/fonts/:path*", headers: [
      { key: "Access-Control-Allow-Origin", value: "*" },
    ] }, { source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;

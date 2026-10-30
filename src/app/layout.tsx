/* eslint-disable @next/next/no-page-custom-font -- This App Router root shares the original runtime font stylesheet across every React page. */
import type { Metadata } from "next";
import "./globals.css";

const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(configuredUrl),
  title: { default: "GameZone — Tu próxima partida empieza aquí", template: "%s | GameZone" },
  description: "Descubre juegos para PC, consulta sus requisitos y encuentra tu próxima aventura en GameZone.",
  openGraph: { siteName: "GameZone", locale: "es_ES", type: "website" },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  </head><body>{children}</body></html>;
}

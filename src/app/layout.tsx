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
  return <html lang="es"><body>{children}</body></html>;
}

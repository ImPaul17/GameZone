import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

mkdirSync(".data/tmp", { recursive: true });
if (existsSync(".env.local")) {
  console.log(".env.local ya existe y se conserva. Revisa .env.example si necesitas completar la configuración.");
} else {
  const lines = [
    "GAMEZONE_LOCAL_MODE=1",
    `GAMEZONE_ADMIN_PASSWORD=${randomBytes(24).toString("base64url")}`,
    `GAMEZONE_SESSION_SECRET=${randomBytes(48).toString("base64url")}`,
    "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
    "NEXT_TELEMETRY_DISABLED=1", "",
  ];
  writeFileSync(".env.local", lines.join("\n"), { flag: "wx", mode: 0o600 });
  console.log("Configuración privada creada en .env.local. La contraseña del panel está en GAMEZONE_ADMIN_PASSWORD; no se muestra ni se sube a Git.");
}

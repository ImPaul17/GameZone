import { defineConfig } from "@playwright/test";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const temporaryDirectory = resolve(".data/tmp");
mkdirSync(temporaryDirectory, { recursive: true });
process.env.TEMP = temporaryDirectory;
process.env.TMP = temporaryDirectory;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(".data/browsers");
const localEnv = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const localValue = (key: string) => localEnv.split(/\r?\n/).find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1) || "";
process.env.GAMEZONE_E2E_PASSWORD ||= localValue("GAMEZONE_ADMIN_PASSWORD") || randomBytes(24).toString("base64url");
const password = process.env.GAMEZONE_E2E_PASSWORD;

export default defineConfig({
  testDir: "tests/e2e", timeout: 45_000, workers: 1, fullyParallel: false,
  reporter: "list", use: { baseURL: "http://127.0.0.1:3100", trace: "off", screenshot: "off" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 60_000,
    env: { GAMEZONE_LOCAL_MODE: "1", GAMEZONE_ADMIN_PASSWORD: password,
      NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SECRET_KEY: "",
      GAMEZONE_EDITOR_EMAIL_METHOD: "code", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      GAMEZONE_SESSION_SECRET: localValue("GAMEZONE_SESSION_SECRET") || randomBytes(48).toString("base64url"),
      GAMEZONE_DATABASE_PATH: resolve(`.data/e2e-${Date.now()}.db`),
      NEXT_TELEMETRY_DISABLED: "1", TEMP: temporaryDirectory, TMP: temporaryDirectory },
  },
});

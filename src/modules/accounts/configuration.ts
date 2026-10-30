import "server-only";
import { serverEnvironment } from "@/lib/server-environment";

export interface SupabaseAuthConfiguration { url: string; publishableKey: string; secretKey: string }

export function editorEmailMethod(): "link" | "code" { return serverEnvironment("GAMEZONE_EDITOR_EMAIL_METHOD") === "link" ? "link" : "code"; }

/** A configured origin is the only allowed target for email links and their final redirect. */
export function editorSiteOrigin(): string | null {
  try {
    const parsed = new URL(serverEnvironment("NEXT_PUBLIC_SITE_URL") || "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch { return null; }
}

export function hasSupabaseAuthConfiguration(): boolean {
  return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"].some((name) => Boolean(serverEnvironment(name)?.trim()));
}

export function supabaseAuthConfiguration(): SupabaseAuthConfiguration | null {
  const url = serverEnvironment("NEXT_PUBLIC_SUPABASE_URL")?.trim();
  const publishableKey = serverEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")?.trim();
  const secretKey = serverEnvironment("SUPABASE_SECRET_KEY")?.trim();
  if (!url || !publishableKey || !secretKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null;
    return { url: parsed.origin, publishableKey, secretKey };
  } catch { return null; }
}

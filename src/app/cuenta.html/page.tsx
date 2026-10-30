import type { Metadata } from "next";
import { headers } from "next/headers";
import { AccountClient } from "@/components/account";
import { discordLoginAvailable } from "@/modules/accounts/auth";
import { getMemberProfile } from "@/modules/accounts/members";
import type { MemberProfileDTO } from "@/modules/accounts/profile-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ login?: string | string[] }> }) {
  const incoming = await headers();
  const host = incoming.get("host") || "127.0.0.1:3000";
  const protocol = incoming.get("x-forwarded-proto") === "https" ? "https" : "http";
  const request = new Request(`${protocol}://${host}/cuenta.html`, { headers: incoming });
  const { login } = await searchParams;
  const loginError = login === "expired" || login === "unavailable" ? login : undefined;
  let profile: MemberProfileDTO | null = null;
  let loadError = false;
  try { profile = await getMemberProfile(request); }
  catch { loadError = true; }
  return <AccountClient initialProfile={profile} discordAvailable={discordLoginAvailable(request)} loginError={loginError} loadError={loadError} />;
}

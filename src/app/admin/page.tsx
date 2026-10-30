import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminDashboard, AdminLogin } from "@/components/admin";
import { editorAuthMode, getEditor } from "@/modules/accounts/auth";
import { editorEmailMethod } from "@/modules/accounts/configuration";
import { listRecords, storageMode } from "@/modules/catalog/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administración", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ login?: string | string[] }> }) {
  const incoming = await headers();
  const host = incoming.get("host") || "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") === "https" ? "https" : "http";
  const request = new Request(`${protocol}://${host}/admin`, { headers: incoming });
  if (!await getEditor(request)) {
    const { login } = await searchParams;
    const loginError = login === "expired" || login === "denied" || login === "unavailable" ? login : undefined;
    return <AdminLogin mode={editorAuthMode(request)} emailMethod={editorEmailMethod()} loginError={loginError} />;
  }
  return <AdminDashboard initialRecords={await listRecords()} storageMode={storageMode()} />;
}

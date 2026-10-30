import type { NextRequest } from "next/server";
import { refreshEditorSession } from "@/modules/accounts/supabase";

export async function proxy(request: NextRequest) { return refreshEditorSession(request); }

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*", "/cuenta.html", "/api/account/:path*"] };

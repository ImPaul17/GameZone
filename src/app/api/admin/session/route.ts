import { logoutEditor, requestEditorLogin } from "@/modules/accounts/sessions";

export const runtime = "nodejs";

export const POST = requestEditorLogin;
export const DELETE = logoutEditor;

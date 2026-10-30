"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";

export type Notice = { text: string; kind?: "error" | "warning" };

export async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/admin/session" && path !== "/api/admin/session/code") {
      throw new Error("La sesión ha caducado. Abre el acceso editorial en otra pestaña, vuelve a identificarte y reintenta; tu borrador sigue aquí.");
    }
    if (response.status === 409) {
      throw new Error("Hay una versión más reciente en el servidor. El contenido que estás editando se conserva. Abre el panel en otra pestaña para comparar antes de continuar.");
    }
    throw new Error(data.error || "No se ha podido completar la operación. Tu borrador se conserva.");
  }
  return data as T;
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : "Se ha producido un error. Vuelve a intentarlo.";
}

export function Notification({ notice, onDismiss }: { notice: Notice | null; onDismiss?: () => void }) {
  if (!notice) return null;
  return <div className={`notice ${notice.kind || ""}`} role={notice.kind === "error" ? "alert" : "status"}>
    {notice.kind ? <CircleAlert size={17} /> : <CircleCheck size={17} />}
    <p>{notice.text}</p>
    {onDismiss && <button type="button" className="icon-button" aria-label="Cerrar aviso" onClick={onDismiss}><X size={14} /></button>}
  </div>;
}

export function Field({ label, help, children, full = false }: { label: string; help?: string; children: React.ReactNode; full?: boolean }) {
  return <div className={`admin-field ${full ? "full-width" : ""}`}>
    <span className="field-label">{label}</span>
    {children}
    {help && <span className="field-help">{help}</span>}
  </div>;
}

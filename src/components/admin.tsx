"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleAlert, CircleCheck, ExternalLink, Eye, FileInput, FilePenLine, Gamepad2, ImageIcon, LayoutDashboard, LoaderCircle, LogOut, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, Newspaper } from "lucide-react";
import { emptyGame, slugify } from "@/modules/catalog/types";
import type { CatalogRecord, FieldEvidence, GameContent, ImportResult, SourceIdentity } from "@/modules/catalog/types";
import type { NewsRecord } from "@/modules/news/types";
import { NewsDashboard } from "./news-editor";
import { Field, message, Notification, request, type Notice } from "./admin-shared";

type Candidate = { id: number; title: string; url: string; platforms: string[]; gameType: string; evidence: FieldEvidence[] };
type ContentKey = keyof GameContent;
const fieldNames: Record<ContentKey, string> = { title: "Título", slug: "Dirección (slug)", summary: "Resumen", description: "Descripción", coverImage: "Portada", coverAlt: "Texto alternativo", genres: "Géneros", platforms: "Plataformas", developer: "Desarrollador", publisher: "Distribuidor", releaseDate: "Lanzamiento", steamAppId: "ID de Steam", languages: "Idiomas", requirements: "Requisitos", screenshots: "Capturas", trailerUrl: "Tráiler", distributions: "Distribuciones", evidence: "Fuentes y referencias" };
const contentKeys = Object.keys(fieldNames) as ContentKey[];
const providerNames = { pivigames: "PiviGames", igdb: "IGDB", official: "Fuente oficial", editorial: "GameZone" };
const statusNames = { reported: "Dato de origen", documented: "Contrastado", conflict: "Discrepancia", pending: "Pendiente de revisión" };
function equal(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function valueDisplay(value: unknown): string {
  if (typeof value === "string") return value || "Sin dato";
  if (Array.isArray(value)) {
    if (!value.length) return "Sin datos";
    if (typeof value[0] === "string") return value.join("\n");
    return value.map((item: Record<string, unknown>) => {
      if ("minimum" in item) return `${item.platform}\nMínimos: ${(item.minimum as string[]).join(" · ")}\nRecomendados: ${(item.recommended as string[]).join(" · ")}`;
      if ("links" in item) return `${item.label} · ${item.version || "Sin versión"} · ${item.size || "Sin tamaño"}\n${(item.links as { label: string; url: string }[]).map(link => `${link.label}: ${link.url}`).join("\n")}\n${(item.installation as string[]).join("\n")}`;
      return `${item.label}: ${item.value}`;
    }).join("\n\n");
  }
  return "Sin dato";
}
function cleanContent(content: GameContent): GameContent {
  const lines = (values: string[]) => values.map(value => value.trim()).filter(Boolean);
  return { ...content, description: lines(content.description), genres: lines(content.genres), platforms: lines(content.platforms), languages: lines(content.languages), screenshots: lines(content.screenshots), requirements: content.requirements.map(req => ({ ...req, minimum: lines(req.minimum), recommended: lines(req.recommended) })), distributions: content.distributions.map(distribution => ({ ...distribution, installation: lines(distribution.installation) })) };
}
function Brand({ beforeNavigate }: { beforeNavigate?: () => boolean }) {
  return <Link href="/" className="brand" onNavigate={event => {
    // Next calls this only for an uncancelled, same-tab internal navigation.
    // Keep new tabs, modified clicks and native browser behavior untouched.
    if (beforeNavigate && !beforeNavigate()) event.preventDefault();
  }}><span className="logo-text">GameZone</span></Link>;
}
export function AdminLogin({ mode = "local", emailMethod = "code", loginError }: {
  mode?: "local" | "supabase" | "unavailable";
  emailMethod?: "link" | "code";
  loginError?: "expired" | "denied" | "unavailable";
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "code" | "link">("email");
  const [busy, setBusy] = useState<"local" | "email" | "code" | "resend" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(() => loginError ? {
    kind: "error",
    text: {
      expired: "El enlace de acceso ha caducado o ya no es válido. Solicita uno nuevo y ábrelo en este mismo navegador.",
      denied: "Esta cuenta no tiene acceso al panel editorial. Utiliza el correo de una cuenta autorizada.",
      unavailable: "No se ha podido completar el acceso. Inténtalo de nuevo en unos minutos.",
    }[loginError],
  } : null);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const isLink = step === "link" || (step === "email" && emailMethod === "link");
  const accessLabel = isLink ? "enlace" : "código";
  useEffect(() => {
    if (!resendAvailableAt) return;
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setCooldown(remaining);
      if (!remaining) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [resendAvailableAt]);

  function reportLoginError(error: unknown) {
    setNotice({ text: error instanceof TypeError ? "No se ha podido conectar. Comprueba tu conexión y vuelve a intentarlo." : message(error), kind: "error" });
    setBusy(null);
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy("local"); setNotice(null);
    try { await request("/api/admin/session", "POST", { password }); router.refresh(); }
    catch (error) { reportLoginError(error); }
  }
  async function requestAccess(resend = false) {
    if (busy || cooldown > 0) return;
    const address = resend ? sentEmail : email.trim();
    setBusy(resend ? "resend" : "email"); setNotice(null);
    try {
      const result = await request<{ method?: "link" | "code" }>("/api/admin/session", "POST", { email: address });
      const method = result.method ?? emailMethod;
      setSentEmail(address);
      setEmail(address);
      setToken("");
      setStep(method);
      setResendAvailableAt(Date.now() + 60_000);
      setCooldown(60);
      setNotice({ text: method === "link" ? "Si tu cuenta tiene acceso editorial, recibirás un enlace de acceso. Revisa tu correo y la carpeta de correo no deseado." : "Si tu cuenta tiene acceso editorial, recibirás un código. Revisa tu correo y la carpeta de correo no deseado." });
      setBusy(null);
    } catch (error) { reportLoginError(error); }
  }
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault(); setBusy("code"); setNotice(null);
    try { await request("/api/admin/session/code", "POST", { email: sentEmail, token }); router.refresh(); }
    catch (error) { reportLoginError(error); }
  }
  function changeEmail() {
    setStep("email"); setToken(""); setNotice(null);
  }
  return <main className="admin-login-page"><div className="admin-login"><Brand /><div className="login-card">
    <span className="login-icon"><ShieldCheck size={24} /></span><div className="eyebrow">PANEL EDITORIAL</div>
    <h1>{mode === "unavailable" ? "Acceso no disponible." : mode === "supabase" && step !== "email" ? isLink ? "Revisa tu correo." : "Comprueba tu correo." : "Bienvenido de nuevo."}</h1>
    <p>{mode === "supabase" ? "Acceso reservado al equipo editorial de GameZone. Utiliza el correo de tu cuenta autorizada." : mode === "local" ? "Accede para preparar, revisar y publicar el catálogo de GameZone." : "El acceso editorial necesita completar su configuración en este servidor."}</p>
    {mode === "unavailable" ? <Notification notice={{ text: "El panel no puede iniciar una sesión en este entorno. La persona responsable debe revisar la configuración de autenticación antes de habilitar el acceso.", kind: "error" }} /> : <Notification notice={notice} />}
    {mode === "local" && <form onSubmit={login}>
      <div className="admin-field"><label htmlFor="admin-password">Contraseña editorial</label><input autoFocus className="admin-input" id="admin-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" disabled={Boolean(busy)} required /></div>
      <button className="button" disabled={Boolean(busy)} type="submit">{busy ? <LoaderCircle size={16} className="saving-spinner" /> : <ArrowRight size={16} />} {busy ? "Accediendo…" : "Entrar al panel"}</button>
    </form>}
    {mode === "supabase" && step === "email" && <form onSubmit={event => { event.preventDefault(); void requestAccess(); }}>
      <div className="admin-field"><label htmlFor="editor-email">Correo editorial</label><input autoFocus className="admin-input" id="editor-email" type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={Boolean(busy)} required /></div>
      <button className="button" disabled={Boolean(busy) || cooldown > 0} type="submit">{busy ? <LoaderCircle size={16} className="saving-spinner" /> : <ArrowRight size={16} />}{busy ? `Solicitando ${accessLabel}…` : isLink ? "Enviar enlace de acceso" : "Enviar código de acceso"}</button>
      {cooldown > 0 && <span className="field-help">Podrás solicitar otro {accessLabel} en {cooldown} s.</span>}
    </form>}
    {mode === "supabase" && step !== "email" && <>
      <p style={{ fontSize: 12, overflowWrap: "anywhere" }}>Correo: <strong>{sentEmail}</strong></p>
      {step === "link" ? <p className="field-help" style={{ marginBottom: 20 }}>Abre el enlace de acceso desde este mismo navegador para continuar. Su validez es limitada; si ha caducado, solicita uno nuevo.</p> : <form onSubmit={verifyCode}>
        <div className="admin-field"><label htmlFor="editor-code">Código de acceso</label><input autoFocus className="admin-input" id="editor-code" name="token" type="text" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={10} pattern="[0-9]{6,10}" aria-describedby="editor-code-help" value={token} onChange={event => setToken(event.target.value.replace(/\D/g, "").slice(0, 10))} disabled={Boolean(busy)} required /><span id="editor-code-help" className="field-help">Introduce los 6 a 10 dígitos del correo. El código tiene una validez limitada.</span></div>
        <button className="button" disabled={Boolean(busy)} type="submit">{busy === "code" ? <LoaderCircle size={16} className="saving-spinner" /> : <ArrowRight size={16} />}{busy === "code" ? "Verificando…" : "Verificar código"}</button>
      </form>}
      <button className="button secondary" type="button" disabled={Boolean(busy) || cooldown > 0} onClick={() => void requestAccess(true)}>{busy === "resend" ? <LoaderCircle size={15} className="saving-spinner" /> : <RefreshCw size={15} />}{busy === "resend" ? `Solicitando ${accessLabel}…` : cooldown > 0 ? `Reenviar ${accessLabel} (${cooldown} s)` : `Reenviar ${accessLabel}`}</button>
      <button className="text-link" style={{ marginTop: 20 }} type="button" disabled={Boolean(busy)} onClick={changeEmail}><ArrowLeft size={14} /> Cambiar correo</button>
    </>}
  </div><div className="login-footer"><Link href="/" className="text-link"><ArrowLeft size={14} /> Volver a GameZone</Link></div></div></main>;
}

export function AdminDashboard({ initialRecords, initialNewsRecords = [], storageMode }: { initialRecords: CatalogRecord[]; initialNewsRecords?: NewsRecord[]; storageMode: string }) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [newsRecords, setNewsRecords] = useState(initialNewsRecords);
  const [section, setSection] = useState<"games" | "news">("games");
  const [newsViewKey, setNewsViewKey] = useState(0);
  const [editor, setEditor] = useState<{ record?: CatalogRecord; imported?: ImportResult; key: number } | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const published = records.filter(record => record.published);
  const drafts = records.filter(record => !record.published || !equal(record.draft, record.published));
  const filtered = records.filter(record => record.draft.title.toLowerCase().includes(q.toLowerCase()) && (filter === "all" || (filter === "published" ? Boolean(record.published) : !record.published || !equal(record.draft, record.published))));
  async function importGame(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try { const result = await request<{ imported: ImportResult; existing: CatalogRecord | null }>("/api/admin/import", "POST", { url }); setEditor({ record: result.existing || undefined, imported: result.imported, key: Date.now() }); }
    catch (error) { setNotice({ text: message(error), kind: "error" }); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (editorDirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres cerrar la sesión y descartarlos?")) return;
    try { await request("/api/admin/session", "DELETE"); router.refresh(); }
    catch (error) { setNotice({ text: message(error), kind: "error" }); }
  }
  function switchSection(next: "games" | "news") {
    if (editorDirty && !window.confirm("Tienes cambios sin guardar. \u00bfQuieres cambiar de secci\u00f3n y descartarlos?")) return;
    setEditor(null); setEditorDirty(false); setSection(next); setNewsViewKey(current => current + 1); setNotice(null);
  }
  function savedNews(record: NewsRecord) { setNewsRecords(current => [record, ...current.filter(item => item.id !== record.id)]); }
  function saved(record: CatalogRecord) { setRecords(current => [record, ...current.filter(item => item.id !== record.id)]); }
  return <div className="admin-layout"><aside className="admin-sidebar"><div><Brand beforeNavigate={() => !editorDirty || window.confirm("Tienes cambios sin guardar. ¿Quieres salir del panel y descartarlos?")} /><p className="admin-label">ESPACIO EDITORIAL</p></div><nav aria-label="Panel editorial"><button type="button" className={section === "games" ? "active" : ""} aria-pressed={section === "games"} onClick={() => switchSection("games")}><LayoutDashboard size={16} /> Catálogo de juegos</button><button type="button" className={section === "news" ? "active" : ""} aria-pressed={section === "news"} onClick={() => switchSection("news")}><Newspaper size={16} /> Noticias</button><Link href="/" target="_blank"><ExternalLink size={15} /> Ver sitio público</Link></nav><div className="admin-sidebar-bottom"><p>Publicaciones con fuentes.<br />Un catálogo que sigue creciendo.</p><button className="text-link" type="button" onClick={logout}><LogOut size={14} /> Cerrar sesión</button></div></aside><div className="admin-workspace"><div className="admin-topbar"><div className="admin-breadcrumb">GameZone <ChevronRight size={12} /> Editorial <ChevronRight size={12} /><strong>{section === "news" ? "Noticias" : editor ? "Editor de juego" : "Catálogo"}</strong></div><span className="admin-status"><span className="status-dot" /> SESIÓN EDITORIAL</span></div><nav className="admin-mobile-nav" aria-label="Secciones editoriales"><button type="button" className={section === "games" ? "active" : ""} aria-pressed={section === "games"} onClick={() => switchSection("games")}><LayoutDashboard size={15} /> Catálogo de juegos</button><button type="button" className={section === "news" ? "active" : ""} aria-pressed={section === "news"} onClick={() => switchSection("news")}><Newspaper size={15} /> Noticias</button></nav><main className="admin-content"><Notification notice={notice} onDismiss={() => setNotice(null)} />{section === "news" ? <NewsDashboard key={newsViewKey} records={newsRecords} onSaved={savedNews} onDirtyChange={setEditorDirty} /> : editor ? <GameEditor key={editor.key} record={editor.record} initialImport={editor.imported} onSaved={saved} onDirtyChange={setEditorDirty} onCancel={() => { setEditorDirty(false); setEditor(null); }} /> : <><div className="admin-page-header"><div><div className="eyebrow">TU CENTRO DE PUBLICACIONES</div><h1>Catálogo de juegos<span className="accent">.</span></h1><p>De una fuente a una ficha GameZone. Tú decides qué se publica.</p></div><button className="button" type="button" onClick={() => setEditor({ key: Date.now() })}><Plus size={17} /> Crear publicación</button></div><div className="admin-stats"><div className="admin-stat"><div><p>Publicaciones totales</p><strong>{records.length}</strong><span>En tu catálogo editorial</span></div><Gamepad2 size={20} /></div><div className="admin-stat"><div><p>Visibles en la web</p><strong>{published.length}</strong><span>Publicadas y accesibles</span></div><CircleCheck size={20} /></div><div className="admin-stat"><div><p>Borradores y cambios</p><strong>{drafts.length}</strong><span>Pendientes de publicar</span></div><FilePenLine size={20} /></div></div><section className="admin-panel admin-import"><div className="panel-title"><div><h2>Una URL. El comienzo de tu publicación.</h2><p>Importa desde PiviGames, compara los datos y dales el estilo de GameZone.</p></div><FileInput size={23} /></div><form className="panel-body" onSubmit={importGame}><label htmlFor="import-game-url">Enlace de la publicación de PiviGames</label><div className="import-input-row"><input className="admin-input" id="import-game-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://pivigames.blog/nombre-del-juego/" required /><button type="submit" className="button" disabled={busy}>{busy ? <LoaderCircle size={16} className="saving-spinner" /> : <FileInput size={16} />}{busy ? "Consultando fuente…" : "Importar y revisar"}</button></div><span className="field-help">Se prepara una propuesta para revisión. La importación no guarda ni publica automáticamente.</span></form></section><section className="admin-panel"><div className="panel-title"><h2>Tus publicaciones</h2><span className="muted" style={{ fontSize: 10 }}>{records.length} juegos</span></div><div className="table-toolbar"><div className="search-field"><Search size={16} /><input type="search" aria-label="Buscar en las publicaciones" placeholder="Buscar publicación…" value={q} onChange={event => setQ(event.target.value)} /></div><div className="table-tabs" aria-label="Filtrar por estado">{[["all", "Todas"], ["published", "Publicadas"], ["draft", "Borradores"]].map(([value, label]) => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>{filtered.length ? <table className="records-table"><thead><tr><th>Juego</th><th>Estado</th><th>Última edición</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{filtered.map(record => <tr key={record.id}><td><div className="record-title">{record.draft.coverImage ? <img src={record.draft.coverImage} alt="" width={58} height={40} referrerPolicy="no-referrer" /> : <span className="record-cover-empty"><Gamepad2 size={19} /></span>}<div><strong>{record.draft.title || "Sin título"}</strong><small>{record.source ? "Importado de PiviGames" : "Publicación GameZone"}</small></div></div></td><td><span className={`badge ${!record.published ? "draft" : !equal(record.draft, record.published) ? "changed" : ""}`}>{record.published ? !equal(record.draft, record.published) ? "Cambios pendientes" : "Publicada" : "Borrador"}</span></td><td><time className="record-date" dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })}</time></td><td><button type="button" className="icon-button" aria-label={`Editar ${record.draft.title}`} onClick={() => setEditor({ record, key: Date.now() })}><FilePenLine size={17} /></button></td></tr>)}</tbody></table> : <div className="empty-admin">{q || filter !== "all" ? "No hay publicaciones con estos filtros." : "Crea tu primera publicación o importa un enlace para empezar."}</div>}</section>{storageMode !== "supabase" && <div className="storage-note"><ShieldCheck size={19} /><p><strong>Almacenamiento local activo.</strong> Los cambios se guardan en el servidor de desarrollo. Para publicar en producción hay que configurar la base de datos y las credenciales del panel; el entorno de despliegue debe conservar los datos.</p></div>}</>}</main></div></div>;
}

export function GameEditor({ record: initialRecord, initialImport, onSaved, onCancel, onDirtyChange }: { record?: CatalogRecord; initialImport?: ImportResult; onSaved?: (record: CatalogRecord) => void; onCancel?: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [record, setRecord] = useState(initialRecord);
  const lockedSlug = record?.lockedSlug || record?.published?.slug || null;
  const [content, setContent] = useState<GameContent>(initialRecord?.draft || emptyGame());
  const [source, setSource] = useState<SourceIdentity | null>(initialRecord?.source || null);
  const [lastImported, setLastImported] = useState<GameContent | null>(initialRecord?.lastImported || null);
  const [proposal, setProposal] = useState<ImportResult | null>(initialImport || null);
  const [selected, setSelected] = useState<Set<ContentKey>>(() => new Set(initialImport ? contentKeys.filter(key => !(key === "slug" && lockedSlug) && !equal((initialRecord?.draft || emptyGame())[key], initialImport.content[key]) && (!initialRecord || equal(initialRecord.draft[key], emptyGame()[key]) || (initialRecord.lastImported && equal(initialRecord.draft[key], initialRecord.lastImported[key])))) : []));
  const [tab, setTab] = useState("content");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [importUrl, setImportUrl] = useState(initialRecord?.source?.url || "");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [manualSlug, setManualSlug] = useState(Boolean(initialRecord));
  const [newEvidence, setNewEvidence] = useState<FieldEvidence>({ field: "title", label: "", value: "", provider: "official", sourceUrl: "", retrievedAt: new Date().toISOString(), status: "pending" });
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  function setField<K extends ContentKey>(key: K, value: GameContent[K]) {
    setContent(current => ({ ...current, [key]: value })); setDirty(true);
    if (proposal) setSelected(current => { const next = new Set(current); next.delete(key); return next; });
  }
  function titleChanged(value: string) {
    setContent(current => ({ ...current, title: value, ...(!manualSlug && !lockedSlug ? { slug: slugify(value) } : {}) }));
    setDirty(true);
    if (proposal) setSelected(current => {
      const next = new Set(current);
      next.delete("title");
      next.delete("slug");
      return next;
    });
  }
  function back() { if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres salir del editor y descartarlos?")) return; onCancel?.(); }
  async function loadPreview() {
    const requestId = ++previewRequest.current;
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewHtml("");
    setBusy("preview");
    try {
      const result = await request<{ html: string }>("/api/admin/preview", "POST", { content: cleanContent(content) });
      if (requestId === previewRequest.current) setPreviewHtml(result.html);
    } catch (error) {
      if (requestId === previewRequest.current) setPreviewError(message(error));
    } finally {
      if (requestId === previewRequest.current) {
        setPreviewLoading(false);
        setBusy("");
      }
    }
  }
  function selectTab(nextTab: string) {
    setTab(nextTab);
    if (nextTab === "preview") void loadPreview();
  }
  async function save(action: "save" | "publish" | "unpublish") {
    setBusy(action); setNotice(null);
    try {
      const cleaned = cleanContent(content);
      let next: CatalogRecord;
      if (!record) {
        const created = await request<{ record: CatalogRecord }>("/api/admin/games", "POST", { content: cleaned, source, lastImported });
        next = created.record;
        // Preserve the saved revision even if the following publication fails.
        setRecord(next); setContent(next.draft); setDirty(false); onSaved?.(next);
        if (action === "publish") next = (await request<{ record: CatalogRecord }>(`/api/admin/games/${next.id}`, "PATCH", { content: next.draft, expectedRevision: next.revision, action })).record;
      } else {
        next = (await request<{ record: CatalogRecord }>(`/api/admin/games/${record.id}`, "PATCH", { content: cleaned, expectedRevision: record.revision, action, source, ...(lastImported ? { lastImported } : {}) })).record;
      }
      setRecord(next); setContent(next.draft); setDirty(false); onSaved?.(next);
      setNotice({ text: action === "publish" ? "Publicación actualizada. La ficha ya está visible en GameZone." : action === "unpublish" ? "Publicación retirada. El contenido se conserva como borrador." : "Borrador guardado. La versión pública solo cambia al publicar." });
    } catch (error) { setNotice({ text: message(error), kind: "error" }); }
    finally { setBusy(""); }
  }
  async function importAgain(event: React.FormEvent) {
    event.preventDefault(); setBusy("import"); setNotice(null);
    try {
      const result = await request<{ imported: ImportResult; existing: CatalogRecord | null }>("/api/admin/import", "POST", { url: importUrl });
      if (result.existing && result.existing.id !== record?.id) throw new Error("Este origen ya corresponde a otra publicación. Abre esa ficha desde el catálogo para revisarla sin crear duplicados.");
      if (source && source.id !== result.imported.source.id) throw new Error("El enlace corresponde a otra publicación de PiviGames. Crea una nueva ficha desde el catálogo para importarla.");
      setProposal(result.imported); setSelected(new Set(contentKeys.filter(key => !(key === "slug" && lockedSlug) && !equal(content[key], result.imported.content[key]) && (!record || equal(content[key], emptyGame()[key]) || (lastImported && equal(content[key], lastImported[key]))))));
    } catch (error) { setNotice({ text: message(error), kind: "error" }); }
    finally { setBusy(""); }
  }
  function applyImport() {
    if (!proposal) return;
    const chosen = [...selected].filter(key => !(key === "slug" && lockedSlug));
    setContent(current => { const next = { ...current }; for (const key of chosen) Object.assign(next, { [key]: proposal.content[key] }); return next; });
    setTab("content"); setSource(proposal.source); setLastImported(proposal.content); setImportUrl(proposal.source.url); setDirty(true); setManualSlug(true); setProposal(null); setNotice({ text: `${chosen.length} campos aplicados al borrador. Revisa las fuentes y guarda cuando esté listo.` });
  }
  async function enrich() {
    setBusy("enrich"); setNotice(null); setCandidates([]);
    try {
      const result = await request<{ evidence: FieldEvidence[]; warnings: string[]; candidates?: Candidate[] }>("/api/admin/enrich", "POST", { content: cleanContent(content) });
      setCandidates(result.candidates || []);
      if (result.evidence.length) { setField("evidence", [...content.evidence, ...result.evidence]); }
      setNotice({ text: result.warnings.join(" ") || "Consulta completada. Revisa las propuestas antes de aplicar datos.", kind: "warning" });
    } catch (error) { setNotice({ text: message(error), kind: "error" }); }
    finally { setBusy(""); }
  }
  function selectCandidate(candidate: Candidate) {
    const keys = new Set(content.evidence.map(item => `${item.field}|${item.sourceUrl}|${item.value}`));
    setField("evidence", [...content.evidence, ...candidate.evidence.filter(item => !keys.has(`${item.field}|${item.sourceUrl}|${item.value}`))]);
    setCandidates([]); setNotice({ text: `Referencias de «${candidate.title}» añadidas. Revisa cada dato y pulsa «Usar este dato» para incorporarlo; la ficha todavía no ha cambiado.` });
  }
  function applyEvidence(evidence: FieldEvidence, index: number) {
    const field = evidence.field as ContentKey;
    const value = ["genres", "platforms", "languages"].includes(field) ? evidence.value.split(",").map(item => item.trim()).filter(Boolean) : evidence.value;
    if (field === "title") { titleChanged(evidence.value); } else setField(field, value as never);
    setContent(current => ({ ...current, evidence: current.evidence.map((item, i) => i === index ? { ...item, status: "reported" } : item) }));
    setNotice({ text: `«${fieldNames[field]}» actualizado con el dato de ${providerNames[evidence.provider]}. Revisa su alcance y guarda el borrador.` });
  }
  function canApply(evidence: FieldEvidence) { return ["title", "summary", "coverImage", "developer", "publisher", "genres", "platforms", "languages", "releaseDate"].includes(evidence.field) && (evidence.field !== "releaseDate" || /^\d{4}(-\d{2}(-\d{2})?)?$/.test(evidence.value)); }
  const textField = (key: "title" | "slug" | "summary" | "coverImage" | "coverAlt" | "developer" | "publisher" | "releaseDate" | "steamAppId" | "trailerUrl", help?: string, full = false) => <Field label={fieldNames[key]} help={help} full={full}><input className="admin-input" aria-label={fieldNames[key]} value={content[key]} disabled={key === "slug" && Boolean(lockedSlug)} onChange={event => { if (key === "title") titleChanged(event.target.value); else { if (key === "slug") setManualSlug(true); setField(key, event.target.value); } }} /></Field>;
  const listField = (key: "genres" | "platforms" | "languages", help?: string) => <Field label={fieldNames[key]} help={help}><input className="admin-input" aria-label={fieldNames[key]} value={content[key].join(", ")} onChange={event => setField(key, event.target.value.split(",").map((item, index) => index ? item.replace(/^ /, "") : item))} /></Field>;
  const changedKeys = proposal ? contentKeys.filter(key => !equal(content[key], proposal.content[key]) && !(key === "slug" && lockedSlug)) : [];
  const tabs = [["content", "Publicación"], ["technical", "Datos y requisitos"], ["links", "Distribuciones"], ["sources", `Fuentes (${content.evidence.length})`], ["preview", "Vista previa"]];
  return <><button id="editor-back" className="editor-back" type="button" onClick={back}><ArrowLeft size={15} /> Volver al catálogo</button><div className="admin-page-header"><div><div className="eyebrow">{record ? "EDITAR PUBLICACIÓN" : "NUEVA PUBLICACIÓN"}</div><h1>{content.title || "Tu próximo juego"}<span className="accent">.</span></h1><p>{record ? "Edita el borrador y publica los cambios cuando estén listos." : "Prepara una ficha con información clara y fuentes revisadas."}</p></div><div className="admin-header-actions">{dirty && <span className="dirty-indicator"><span>●</span> Cambios sin guardar</span>}<button className="button secondary" type="button" onClick={() => selectTab(tab === "preview" ? "content" : "preview")}><Eye size={16} /> {tab === "preview" ? "Editar ficha" : "Vista previa"}</button><button className="button" type="button" disabled={Boolean(busy)} onClick={() => save("save")}>{busy === "save" ? <LoaderCircle className="saving-spinner" size={16} /> : <Save size={16} />} Guardar borrador</button></div></div><Notification notice={notice} onDismiss={() => setNotice(null)} />
    {proposal && <section className="import-review"><div className="import-review-title"><div className="eyebrow">REVISIÓN DE LA IMPORTACIÓN</div><h2>{record ? "Compara antes de actualizar." : "Dale forma a la publicación."}</h2><p>Selecciona los datos que quieres incorporar. Los cambios manuales se mantienen salvo que elijas sustituirlos.</p>{record && <p style={{ marginTop: 8 }}>Origen ya identificado en el catálogo. Se actualizará esta ficha.</p>}</div>{proposal.warnings.length > 0 && <div className="notice warning" style={{ margin: 15 }}><CircleAlert size={16} /><ul>{proposal.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}<div className="comparison-scroll"><table className="comparison-table"><thead><tr><th>Campo</th><th>Importación anterior</th><th>Tu borrador actual</th><th>Nueva propuesta</th><th>Usar</th></tr></thead><tbody>{changedKeys.map(key => <tr key={key}><td>{fieldNames[key]}</td><td><div className="comparison-value">{lastImported ? valueDisplay(lastImported[key]) : "Primera importación"}</div></td><td><div className="comparison-value">{valueDisplay(content[key])}</div>{lastImported && !equal(lastImported[key], content[key]) && <span className="badge changed">Edición manual</span>}</td><td><div className="comparison-value comparison-new">{valueDisplay(proposal.content[key])}</div></td><td><input type="checkbox" className="comparison-check" disabled={Boolean(busy)} aria-label={`Usar propuesta de ${fieldNames[key]}`} checked={selected.has(key)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} /></td></tr>)}</tbody></table>{!changedKeys.length && <p className="empty-admin">La propuesta coincide con el borrador actual.</p>}</div><div className="comparison-actions"><button type="button" className="button" disabled={Boolean(busy)} onClick={applyImport}><Check size={16} /> Aplicar {selected.size} campos</button><button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setProposal(null)}>Descartar propuesta</button><p>Aplicar cambios no publica ni guarda la ficha.</p></div></section>}
    <div className="editor-tabs" role="tablist" aria-label="Secciones de la ficha" onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const current = tabs.findIndex(([id]) => id === tab); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; selectTab(tabs[next][0]); document.getElementById(`tab-${tabs[next][0]}`)?.focus(); }}>{tabs.map(([id, label]) => <button key={id} type="button" role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} className={tab === id ? "active" : ""} onClick={() => selectTab(id)}>{label}</button>)}</div><div className={tab === "preview" ? "" : "editor-columns"}><div className="editor-main" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} aria-busy={Boolean(busy)}><fieldset className="editor-fields" disabled={Boolean(busy)}>
    {tab === "content" && <><section className="admin-panel"><div className="panel-title"><h2>La historia empieza aquí</h2><FilePenLine size={18} /></div><div className="panel-body"><div className="form-grid">{textField("title", undefined, true)}{textField("slug", lockedSlug ? "La dirección se conserva para mantener los enlaces de la publicación." : "Se genera desde el título. Usa letras minúsculas, números y guiones.", true)}<Field label="Resumen" help="Una presentación breve para las tarjetas y la cabecera. Mínimo 30 caracteres al publicar." full><textarea className="admin-input" aria-label="Resumen" value={content.summary} onChange={event => setField("summary", event.target.value)} rows={3} /></Field><Field label="Descripción" help="Separa los párrafos con una línea en blanco. Mínimo un párrafo de 50 caracteres al publicar." full><textarea className="admin-input" aria-label="Descripción" rows={9} value={content.description.join("\n\n")} onChange={event => setField("description", event.target.value.split("\n\n"))} /></Field></div></div></section><section className="admin-panel"><div className="panel-title"><h2>Una imagen para descubrirlo</h2><ImageIcon size={18} /></div><div className="panel-body">{textField("coverImage", "URL HTTPS de la portada o ruta de un recurso local /assets/.")}{textField("coverAlt", "Describe la imagen para quienes usan lectores de pantalla.")}<Field label="Capturas de pantalla" help="Una URL HTTPS por línea. No incluyas imágenes ajenas a esta edición."><textarea className="admin-input" rows={4} aria-label="Capturas de pantalla" value={content.screenshots.join("\n")} onChange={event => setField("screenshots", event.target.value.split("\n"))} /></Field>{textField("trailerUrl", "Enlace al tráiler. Se abrirá al solicitarlo; no carga un reproductor automáticamente.")}</div></section></>}
    {tab === "technical" && <><section className="admin-panel"><div className="panel-title"><h2>Identidad del juego</h2><Gamepad2 size={18} /></div><div className="panel-body"><div className="form-grid">{listField("genres", "Separa los géneros con comas.")}{listField("platforms", "Plataformas de la edición de esta ficha; separadas por comas.")}{textField("developer")}{textField("publisher")}{textField("releaseDate", "Precisión real: AAAA, AAAA-MM o AAAA-MM-DD.")}{textField("steamAppId", "Solo el identificador numérico de la tienda.")}{listField("languages", "Idiomas confirmados; separados por comas.")}</div></div></section><section className="admin-panel"><div className="panel-title"><div><h2>Requisitos del sistema</h2><p>Separa los requisitos por sistema operativo.</p></div><button className="button secondary small" type="button" onClick={() => setField("requirements", [...content.requirements, { platform: "Windows", minimum: [], recommended: [] }])}><Plus size={14} /> Añadir</button></div><div className="panel-body">{!content.requirements.length && <p className="muted" style={{ fontSize: 11 }}>Todavía no hay requisitos. Añade solo datos que correspondan a la plataforma y edición correctas.</p>}{content.requirements.map((req, index) => <div className="subform" key={index}><div className="subform-header"><h3>Sistema {index + 1}</h3><button type="button" className="icon-button" aria-label={`Eliminar requisitos del sistema ${index + 1}`} onClick={() => setField("requirements", content.requirements.filter((_, i) => i !== index))}><Trash2 size={15} /></button></div><Field label="Sistema operativo"><input className="admin-input" aria-label={`Sistema operativo ${index + 1}`} value={req.platform} onChange={event => setField("requirements", content.requirements.map((item, i) => i === index ? { ...item, platform: event.target.value } : item))} /></Field><div className="form-grid">{(["minimum", "recommended"] as const).map(key => <Field key={key} label={key === "minimum" ? "Mínimos" : "Recomendados"} help="Un requisito por línea."><textarea className="admin-input" rows={6} aria-label={`${key === "minimum" ? "Mínimos" : "Recomendados"}, sistema ${index + 1}`} value={req[key].join("\n")} onChange={event => setField("requirements", content.requirements.map((item, i) => i === index ? { ...item, [key]: event.target.value.split("\n") } : item))} /></Field>)}</div></div>)}</div></section></>}
    {tab === "links" && <section className="admin-panel"><div className="panel-title"><div><h2>Distribuciones y enlaces</h2><p>Los datos del archivo son distintos de los datos oficiales del juego.</p></div><button type="button" className="button secondary small" onClick={() => setField("distributions", [...content.distributions, { label: "Distribución", version: "", size: "", format: "", links: [], installation: [] }])}><Plus size={14} /> Añadir</button></div><div className="panel-body">{!content.distributions.length && <p style={{ fontSize: 11 }}>Sin distribuciones. Puedes publicar una ficha informativa y añadir enlaces después.</p>}{content.distributions.map((distribution, index) => { const update = (patch: Partial<typeof distribution>) => setField("distributions", content.distributions.map((item, i) => i === index ? { ...item, ...patch } : item)); return <div className="subform" key={index}><div className="subform-header"><h3>Distribución {index + 1}</h3><button type="button" className="icon-button" aria-label={`Eliminar distribución ${index + 1}`} onClick={() => setField("distributions", content.distributions.filter((_, i) => i !== index))}><Trash2 size={15} /></button></div><div className="form-grid">{(["label", "version", "size", "format"] as const).map(key => <Field key={key} label={{ label: "Nombre de la distribución", version: "Versión declarada", size: "Peso del archivo", format: "Formato" }[key]}><input className="admin-input" aria-label={`${{ label: "Nombre de la distribución", version: "Versión declarada", size: "Peso del archivo", format: "Formato" }[key]} ${index + 1}`} value={distribution[key]} onChange={event => update({ [key]: event.target.value })} /></Field>)}</div><div className="field-label">Enlaces</div>{distribution.links.map((link, linkIndex) => <div className="link-edit-row" key={linkIndex}><input className="admin-input" aria-label={`Nombre del enlace ${linkIndex + 1}, distribución ${index + 1}`} placeholder="Nombre del enlace" value={link.label} onChange={event => update({ links: distribution.links.map((item, i) => i === linkIndex ? { ...item, label: event.target.value } : item) })} /><input className="admin-input" aria-label={`URL del enlace ${linkIndex + 1}, distribución ${index + 1}`} placeholder="https://…" value={link.url} onChange={event => update({ links: distribution.links.map((item, i) => i === linkIndex ? { ...item, url: event.target.value } : item) })} /><select className="admin-input" aria-label={`Tipo del enlace ${linkIndex + 1}, distribución ${index + 1}`} value={link.type} onChange={event => update({ links: distribution.links.map((item, i) => i === linkIndex ? { ...item, type: event.target.value as "base" | "update" | "extra" } : item) })}><option value="base">Juego base</option><option value="update">Actualización</option><option value="extra">Extra</option></select><button type="button" className="icon-button" aria-label={`Eliminar enlace ${linkIndex + 1}, distribución ${index + 1}`} onClick={() => update({ links: distribution.links.filter((_, i) => i !== linkIndex) })}><Trash2 size={14} /></button></div>)}<button className="button secondary small" type="button" onClick={() => update({ links: [...distribution.links, { label: "", url: "", type: "base" }] })}><Plus size={13} /> Añadir enlace</button><span className="field-help">Las URL conservan sus fragmentos, incluidos los que necesitan algunos proveedores. Usa HTTPS.</span><div className="form-divider" /><Field label="Instrucciones de instalación" help="Un paso por línea."><textarea className="admin-input" aria-label={`Instrucciones de instalación, distribución ${index + 1}`} rows={5} value={distribution.installation.join("\n")} onChange={event => update({ installation: event.target.value.split("\n") })} /></Field></div>; })}</div></section>}
    {tab === "sources" && <section className="admin-panel"><div className="panel-title"><h2>Fuentes y contraste</h2><ShieldCheck size={18} /></div><div className="panel-body"><div className="evidence-enrich"><div><h3>Completar con IGDB</h3><p>Busca candidatos, confirma el juego y la edición y revisa las propuestas una a una. No se sustituyen campos automáticamente.</p></div><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={enrich}>{busy === "enrich" ? <LoaderCircle className="saving-spinner" size={15} /> : <Search size={15} />} Buscar candidatos</button></div>{candidates.length > 0 && <div className="subform"><div className="editor-section-title"><div><h2>¿Qué edición estás preparando?</h2><p>Seleccionar un candidato añade sus referencias para revisarlas.</p></div></div>{candidates.map(candidate => <div className="evidence-item" key={candidate.id} style={{ marginBottom: 10 }}><h3>{candidate.title}</h3><p>{candidate.gameType} · {candidate.platforms.join(", ") || "Plataformas sin identificar"}</p><div className="inline-actions"><button type="button" className="button secondary small" onClick={() => selectCandidate(candidate)}>Seleccionar candidato</button><a href={candidate.url} target="_blank" rel="noopener noreferrer">Consultar IGDB <ArrowUpRight size={12} /></a></div></div>)}</div>}<div className="evidence-list">{content.evidence.map((evidence, index) => <article className="evidence-item" key={index}><div className="evidence-item-header"><h3>{evidence.label || fieldNames[evidence.field as ContentKey] || evidence.field}</h3><span className={`badge ${evidence.status === "pending" || evidence.status === "conflict" ? "changed" : ""}`}>{providerNames[evidence.provider]}</span></div><p>{evidence.value || "Sin valor registrado"}</p><div className="form-grid"><Field label="Estado de revisión"><select className="admin-input" aria-label={`Estado de la fuente ${index + 1}`} value={evidence.status} onChange={event => setField("evidence", content.evidence.map((item, i) => i === index ? { ...item, status: event.target.value as FieldEvidence["status"] } : item))}>{Object.entries(statusNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="Dato de referencia"><input className="admin-input" aria-label={`Dato de la fuente ${index + 1}`} value={evidence.value} onChange={event => setField("evidence", content.evidence.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} /></Field></div><div className="inline-actions">{evidence.sourceUrl && <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Consultar origen <ArrowUpRight size={12} /></a>}{canApply(evidence) && <button type="button" className="button secondary small" onClick={() => applyEvidence(evidence, index)}>Usar este dato</button>}<button type="button" className="icon-button" aria-label={`Eliminar fuente ${index + 1}`} onClick={() => setField("evidence", content.evidence.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div><footer>Consultado: {new Date(evidence.retrievedAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}{evidence.field === "releaseDate" && !canApply(evidence) && " · Convierte manualmente la fecha al formato y la plataforma correctos."}</footer></article>)}</div>{!content.evidence.length && <p style={{ fontSize: 11 }}>Todavía no hay referencias. Añade una fuente oficial o busca el juego en IGDB.</p>}<div className="form-divider" /><div className="editor-section-title"><div><h2>Añadir referencia</h2><p>Conserva el dato, su origen y el alcance de lo que has comprobado.</p></div></div><div className="form-grid"><Field label="Campo"><select className="admin-input" aria-label="Campo de la nueva referencia" value={newEvidence.field} onChange={event => setNewEvidence(current => ({ ...current, field: event.target.value }))}>{contentKeys.filter(key => key !== "evidence").map(key => <option key={key} value={key}>{fieldNames[key]}</option>)}</select></Field><Field label="Tipo de fuente"><select className="admin-input" aria-label="Tipo de la nueva fuente" value={newEvidence.provider} onChange={event => setNewEvidence(current => ({ ...current, provider: event.target.value as FieldEvidence["provider"] }))}><option value="official">Oficial (tienda o desarrollador)</option><option value="editorial">Comprobación editorial</option><option value="pivigames">PiviGames</option><option value="igdb">IGDB</option></select></Field><Field label="Nombre o alcance" full><input className="admin-input" aria-label="Nombre de la nueva referencia" placeholder="Por ejemplo: requisitos de Windows en la tienda oficial" value={newEvidence.label} onChange={event => setNewEvidence(current => ({ ...current, label: event.target.value }))} /></Field><Field label="URL de la fuente" full><input className="admin-input" aria-label="URL de la nueva fuente" placeholder="https://…" value={newEvidence.sourceUrl} onChange={event => setNewEvidence(current => ({ ...current, sourceUrl: event.target.value }))} /></Field><Field label="Dato consultado" full><textarea className="admin-input" aria-label="Dato de la nueva referencia" value={newEvidence.value} onChange={event => setNewEvidence(current => ({ ...current, value: event.target.value }))} /></Field></div><button type="button" className="button secondary" onClick={() => { if (!newEvidence.value.trim()) { setNotice({ text: "Añade el dato consultado antes de guardar la referencia.", kind: "error" }); return; } setField("evidence", [...content.evidence, { ...newEvidence, retrievedAt: new Date().toISOString() }]); setNewEvidence(current => ({ ...current, label: "", value: "", sourceUrl: "" })); }}><Plus size={15} /> Añadir referencia al borrador</button></div></section>}
    {tab === "preview" && <section className="editor-preview">
      <div className="preview-label"><Eye size={14} /> Vista previa del borrador · los cambios aún no publicados no son visibles en la web</div>
      {previewLoading && <div className="notice" role="status"><LoaderCircle size={17} className="saving-spinner" /><p>Preparando la vista previa de GameZone…</p></div>}
      {previewError && <><Notification notice={{ text: previewError, kind: "error" }} /><button type="button" className="button secondary" onClick={() => void loadPreview()}><RefreshCw size={15} /> Volver a intentar</button></>}
      {previewHtml && <iframe title="Vista previa de GameZone" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" style={{ width: "100%", height: 1000, border: 0, display: "block", background: "#121212" }} />}
    </section>}
    </fieldset></div>{tab !== "preview" && <aside className="editor-aside"><section className="admin-panel"><div className="panel-title"><h2>Publicación</h2><span className={`badge ${record?.published ? "" : "draft"}`}>{record?.published ? "Publicada" : "Borrador"}</span></div><div className="panel-body">{content.coverImage && <img className="editor-cover-preview" src={content.coverImage} alt={content.coverAlt || "Vista de portada"} width={400} height={225} referrerPolicy="no-referrer" />}<dl><div><dt>Plataformas</dt><dd>{content.platforms.filter(Boolean).join(", ") || "Por completar"}</dd></div><div><dt>Fuentes</dt><dd>{content.evidence.length} referencias</dd></div><div><dt>Revisión</dt><dd>{record?.revision || "Nueva ficha"}</dd></div></dl>{content.evidence.some(item => item.status === "conflict") && <p className="pending-changes"><CircleAlert size={14} /> Hay discrepancias por resolver.</p>}<button type="button" className="button" disabled={Boolean(busy) || Boolean(proposal)} onClick={() => save("publish")}>{busy === "publish" ? <LoaderCircle className="saving-spinner" size={15} /> : <ArrowUpRight size={15} />}{record?.published ? "Publicar cambios" : "Publicar en GameZone"}</button>{record?.published && <><Link className="button secondary" href={`/games/${record.published.slug}/${record.published.slug}.html`} target="_blank">Ver ficha pública <ExternalLink size={13} /></Link><button type="button" className="button danger" disabled={Boolean(busy)} onClick={() => { if (window.confirm("¿Retirar esta ficha de la web? Su contenido se conservará como borrador.")) save("unpublish"); }}>Retirar publicación</button></>}<span className="field-help">Guardar conserva el borrador. Publicar actualiza la ficha que pueden ver los visitantes.</span></div></section><section className="admin-panel"><div className="panel-title"><h2>Origen e importación</h2><FileInput size={16} /></div><div className="panel-body"><p>{source ? "Esta ficha está vinculada a una publicación de PiviGames. Puedes volver a consultar su origen y revisar los cambios." : "Importa una publicación de PiviGames o prepara la ficha manualmente."}</p>{source && <a href={source.url} className="text-link" target="_blank" rel="noopener noreferrer">Abrir publicación original <ArrowUpRight size={13} /></a>}<form onSubmit={importAgain}><label className="sr-only" htmlFor="editor-import-url">URL de PiviGames para revisar</label><div className="reimport-row"><input id="editor-import-url" type="url" className="admin-input" value={importUrl} onChange={event => setImportUrl(event.target.value)} placeholder="https://pivigames.blog/…" required /><button type="submit" className="button secondary" disabled={Boolean(busy)} aria-label="Consultar e importar enlace">{busy === "import" ? <LoaderCircle className="saving-spinner" size={15} /> : <RefreshCw size={15} />}</button></div></form><span className="field-help">Tus ediciones manuales se conservan hasta que aceptes una propuesta.</span></div></section></aside>}</div></>;
}

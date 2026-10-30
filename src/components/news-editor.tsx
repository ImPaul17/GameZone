"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, CircleCheck, ExternalLink, Eye, FilePenLine, ImageIcon, LoaderCircle, Newspaper, Plus, RefreshCw, Save, Search } from "lucide-react";
import { emptyNews, type NewsContent, type NewsRecord } from "@/modules/news/types";
import { slugify } from "@/modules/catalog/types";
import { Field, message, Notification, request, type Notice } from "./admin-shared";

type NewsDashboardProps = {
  records: NewsRecord[];
  onSaved: (record: NewsRecord) => void;
  onDirtyChange: (dirty: boolean) => void;
};

function hasChanges(record: NewsRecord) {
  return !record.published || JSON.stringify(record.draft) !== JSON.stringify(record.published);
}

function cleanNews(content: NewsContent): NewsContent {
  return {
    ...content,
    body: content.body.map(paragraph => paragraph.trim()).filter(Boolean),
    tags: content.tags.map(tag => tag.trim()).filter(Boolean),
  };
}

export function NewsDashboard({ records, onSaved, onDirtyChange }: NewsDashboardProps) {
  const [editor, setEditor] = useState<{ record?: NewsRecord; key: number } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = records.filter(record => {
    const matchesText = `${record.draft.title} ${record.draft.tags.join(" ")}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"));
    return matchesText && (filter === "all" || (filter === "published" ? Boolean(record.published) : hasChanges(record)));
  });

  if (editor) return <NewsEditor
    key={editor.key}
    record={editor.record}
    onSaved={onSaved}
    onDirtyChange={onDirtyChange}
    onCancel={() => { onDirtyChange(false); setEditor(null); }}
  />;

  return <>
    <div className="admin-page-header">
      <div><div className="eyebrow">ACTUALIDAD GAMEZONE</div><h1>Noticias<span className="accent">.</span></h1><p>Prepara artículos, revisa su presentación y publica cuando estén listos.</p></div>
      <button className="button" type="button" onClick={() => setEditor({ key: Date.now() })}><Plus size={17} /> Crear noticia</button>
    </div>
    <div className="admin-stats">
      <div className="admin-stat"><div><p>Noticias totales</p><strong>{records.length}</strong><span>En el espacio editorial</span></div><Newspaper size={20} /></div>
      <div className="admin-stat"><div><p>Visibles en la web</p><strong>{records.filter(record => record.published).length}</strong><span>Publicadas y accesibles</span></div><CircleCheck size={20} /></div>
      <div className="admin-stat"><div><p>Borradores y cambios</p><strong>{records.filter(hasChanges).length}</strong><span>Pendientes de publicar</span></div><FilePenLine size={20} /></div>
    </div>
    <section className="admin-panel">
      <div className="panel-title"><h2>Tus noticias</h2><Link className="text-link" href="/noticias.html" target="_blank">Ver sección pública <ExternalLink size={13} /></Link></div>
      <div className="table-toolbar">
        <div className="search-field"><Search size={16} /><input type="search" aria-label="Buscar noticias" placeholder="Buscar por título o etiqueta…" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="table-tabs" aria-label="Filtrar noticias por estado">
          {[["all", "Todas"], ["published", "Publicadas"], ["draft", "Borradores"]].map(([value, label]) => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
      </div>
      {filtered.length ? <table className="records-table news-records-table">
        <thead><tr><th>Noticia</th><th>Estado</th><th>Última edición</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{filtered.map(record => <tr key={record.id}>
          <td><div className="record-title">
            {record.draft.coverImage ? <img src={record.draft.coverImage} alt="" width={58} height={40} referrerPolicy="no-referrer" /> : <span className="record-cover-empty"><Newspaper size={18} /></span>}
            <div><strong>{record.draft.title}</strong><small>{record.draft.tags.join(" · ") || "Sin etiquetas"}</small></div>
          </div></td>
          <td><span className={`badge ${!record.published ? "draft" : hasChanges(record) ? "changed" : ""}`}>{!record.published ? "Borrador" : hasChanges(record) ? "Cambios pendientes" : "Publicada"}</span></td>
          <td><time className="record-date" dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" })}</time></td>
          <td><button type="button" className="icon-button" aria-label={`Editar noticia ${record.draft.title}`} onClick={() => setEditor({ record, key: Date.now() })}><FilePenLine size={17} /></button></td>
        </tr>)}</tbody>
      </table> : <div className="empty-admin">
        <Newspaper size={27} aria-hidden="true" />
        <p>{query || filter !== "all" ? "No hay noticias con estos filtros." : "Todavía no hay noticias. Crea el primer borrador para empezar."}</p>
      </div>}
    </section>
  </>;
}

export function NewsEditor({ record: initialRecord, onSaved, onCancel, onDirtyChange }: {
  record?: NewsRecord;
  onSaved: (record: NewsRecord) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [content, setContent] = useState<NewsContent>(initialRecord?.draft || emptyNews());
  const [manualSlug, setManualSlug] = useState(Boolean(initialRecord));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tab, setTab] = useState<"content" | "preview">("content");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState("");
  const previewRequest = useRef(0);
  const lockedSlug = record?.lockedSlug || record?.published?.slug || null;

  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  function change<K extends keyof NewsContent>(key: K, value: NewsContent[K]) {
    setContent(current => ({ ...current, [key]: value }));
    setDirty(true);
  }
  function changeTitle(value: string) {
    setContent(current => ({ ...current, title: value, ...(!manualSlug && !lockedSlug ? { slug: slugify(value) } : {}) }));
    setDirty(true);
  }
  function close() {
    if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Quieres salir de la noticia y descartarlos?")) return;
    onCancel();
  }
  async function save(action: "save" | "publish" | "unpublish") {
    setBusy(action); setNotice(null);
    try {
      const cleaned = cleanNews(content);
      let next: NewsRecord;
      if (!record) {
        next = (await request<{ record: NewsRecord }>("/api/admin/news", "POST", { content: cleaned })).record;
        setRecord(next); setContent(next.draft); setDirty(false); onSaved(next);
        if (action === "publish") next = (await request<{ record: NewsRecord }>(`/api/admin/news/${next.id}`, "PATCH", { content: next.draft, expectedRevision: next.revision, action })).record;
      } else {
        next = (await request<{ record: NewsRecord }>(`/api/admin/news/${record.id}`, "PATCH", { content: cleaned, expectedRevision: record.revision, action })).record;
      }
      setRecord(next); setContent(next.draft); setDirty(false); onSaved(next);
      setNotice({ text: action === "publish" ? "Noticia publicada. Ya está visible en GameZone." : action === "unpublish" ? "Noticia retirada. El contenido se conserva como borrador." : "Borrador de noticia guardado. La versión pública solo cambia al publicar." });
    } catch (error) { setNotice({ text: message(error), kind: "error" }); }
    finally { setBusy(""); }
  }
  async function preview() {
    const requestId = ++previewRequest.current;
    setTab("preview"); setBusy("preview"); setPreviewHtml(""); setPreviewError("");
    try {
      const result = await request<{ html: string }>("/api/admin/news/preview", "POST", { content: cleanNews(content) });
      if (requestId === previewRequest.current) setPreviewHtml(result.html);
    } catch (error) {
      if (requestId === previewRequest.current) setPreviewError(message(error));
    } finally {
      if (requestId === previewRequest.current) setBusy("");
    }
  }
  function selectTab(next: "content" | "preview") {
    if (next === "preview") void preview();
    else setTab("content");
  }

  return <>
    <button className="editor-back" type="button" onClick={close}><ArrowLeft size={15} /> Volver a noticias</button>
    <div className="admin-page-header">
      <div><div className="eyebrow">{record ? "EDITAR NOTICIA" : "NUEVA NOTICIA"}</div><h1>{content.title || "La próxima historia"}<span className="accent">.</span></h1><p>Prepara el artículo y revisa cómo aparecerá en la GameZone original.</p></div>
      <div className="admin-header-actions">
        {dirty && <span className="dirty-indicator"><span>●</span> Cambios sin guardar</span>}
        <button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => selectTab(tab === "preview" ? "content" : "preview")}><Eye size={16} />{tab === "preview" ? "Editar noticia" : "Vista previa de noticia"}</button>
        <button className="button" type="button" disabled={Boolean(busy)} onClick={() => save("save")}>{busy === "save" ? <LoaderCircle className="saving-spinner" size={16} /> : <Save size={16} />}Guardar borrador</button>
      </div>
    </div>
    <Notification notice={notice} onDismiss={() => setNotice(null)} />
    <div className="editor-tabs" role="tablist" aria-label="Secciones de la noticia" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "content" : event.key === "End" ? "preview" : tab === "content" ? "preview" : "content";
      selectTab(next); document.getElementById(`news-tab-${next}`)?.focus();
    }}>
      {(["content", "preview"] as const).map(id => <button type="button" role="tab" id={`news-tab-${id}`} key={id} aria-selected={tab === id} aria-controls={`news-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? "active" : ""} disabled={Boolean(busy)} onClick={() => selectTab(id)}>{id === "content" ? "Publicación" : "Vista previa"}</button>)}
    </div>
    <div className={tab === "preview" ? "" : "editor-columns"}>
      <div className="editor-main" role="tabpanel" id={`news-panel-${tab}`} aria-labelledby={`news-tab-${tab}`} aria-busy={Boolean(busy)} tabIndex={0}>
        {tab === "content" ? <fieldset className="editor-fields" disabled={Boolean(busy)}>
          <section className="admin-panel">
            <div className="panel-title"><h2>Contenido de la noticia</h2><Newspaper size={18} /></div>
            <div className="panel-body"><div className="form-grid">
              <Field label="Título" full><input className="admin-input" aria-label="Título" value={content.title} onChange={event => changeTitle(event.target.value)} /></Field>
              <Field label="Dirección (slug)" full help={lockedSlug ? "La dirección se conserva después de publicar para mantener los enlaces." : "Se genera desde el título. Usa letras minúsculas, números y guiones."}><input className="admin-input" aria-label="Dirección (slug)" value={content.slug} disabled={Boolean(lockedSlug)} onChange={event => { setManualSlug(true); change("slug", event.target.value); }} /></Field>
              <Field label="Resumen" full help="La presentación breve que aparecerá en el listado de noticias."><textarea className="admin-input" aria-label="Resumen" rows={3} value={content.summary} onChange={event => change("summary", event.target.value)} /></Field>
              <Field label="Texto de la noticia" full help="Separa los párrafos con una línea en blanco. El contenido se publica como texto, sin insertar HTML."><textarea className="admin-input" aria-label="Texto de la noticia" rows={12} value={content.body.join("\n\n")} onChange={event => change("body", event.target.value.split("\n\n"))} /></Field>
              <Field label="Etiquetas" full help="Separa las etiquetas con comas."><input className="admin-input" aria-label="Etiquetas" value={content.tags.join(", ")} onChange={event => change("tags", event.target.value.split(",").map((tag, index) => index ? tag.replace(/^ /, "") : tag))} /></Field>
              <Field label="Fuente de la noticia" full help="Enlace HTTPS a la fuente original, si utilizas una referencia externa."><input className="admin-input" aria-label="Fuente de la noticia" placeholder="https://…" value={content.sourceUrl} onChange={event => change("sourceUrl", event.target.value)} /></Field>
            </div></div>
          </section>
          <section className="admin-panel">
            <div className="panel-title"><h2>Imagen de portada</h2><ImageIcon size={18} /></div>
            <div className="panel-body">
              <Field label="Portada" help="URL HTTPS de una imagen o ruta local /assets/."><input className="admin-input" aria-label="Portada" value={content.coverImage} onChange={event => change("coverImage", event.target.value)} /></Field>
              <Field label="Texto alternativo" help="Describe la imagen para quienes utilizan lectores de pantalla."><input className="admin-input" aria-label="Texto alternativo" value={content.coverAlt} onChange={event => change("coverAlt", event.target.value)} /></Field>
            </div>
          </section>
        </fieldset> : <section className="editor-preview">
          <div className="preview-label"><Eye size={14} /> Vista previa del borrador de noticia · los cambios todavía no están publicados</div>
          {busy === "preview" && <div className="notice" role="status"><LoaderCircle className="saving-spinner" size={17} /><p>Preparando la vista previa de la noticia…</p></div>}
          {previewError && <><Notification notice={{ text: previewError, kind: "error" }} /><button type="button" className="button secondary" onClick={() => void preview()}><RefreshCw size={15} /> Volver a intentar</button></>}
          {previewHtml && <iframe title="Vista previa de noticia de GameZone" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" style={{ width: "100%", height: 1000, border: 0, display: "block", background: "#121212" }} />}
        </section>}
      </div>
      {tab === "content" && <aside className="editor-aside"><section className="admin-panel">
        <div className="panel-title"><h2>Publicación</h2><span className={`badge ${record?.published ? "" : "draft"}`}>{record?.published ? "Publicada" : "Borrador"}</span></div>
        <div className="panel-body">
          {content.coverImage && <img className="editor-cover-preview" src={content.coverImage} alt={content.coverAlt || "Vista de la portada de la noticia"} width={400} height={225} referrerPolicy="no-referrer" />}
          <dl><div><dt>Párrafos</dt><dd>{content.body.filter(paragraph => paragraph.trim()).length}</dd></div><div><dt>Revisión</dt><dd>{record?.revision || "Nueva noticia"}</dd></div></dl>
          <button className="button" type="button" disabled={Boolean(busy)} onClick={() => save("publish")}>{busy === "publish" ? <LoaderCircle className="saving-spinner" size={15} /> : <ArrowUpRight size={15} />}{record?.published ? "Publicar cambios" : "Publicar noticia"}</button>
          {record?.published && <>
            <Link className="button secondary" href={`/noticias/${record.published.slug}.html`} target="_blank">Ver noticia pública <ExternalLink size={13} /></Link>
            <button className="button danger" type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("¿Retirar esta noticia de la web? El contenido se conservará como borrador.")) void save("unpublish"); }}>Retirar noticia</button>
          </>}
          <span className="field-help">Guardar conserva el borrador. Publicar actualiza el artículo público; los cambios posteriores permanecen privados hasta publicarlos.</span>
        </div>
      </section></aside>}
    </div>
  </>;
}

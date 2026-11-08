"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileInput, FilePenLine, Layers, LoaderCircle, Pause, Play, RefreshCw, Search } from "lucide-react";
import type { BatchDetail, BatchSummary } from "@/modules/imports/batch-types";
import { message, Notification, request, type Notice } from "./admin-shared";
import styles from "./import-batches.module.css";

const batchLabels = { queued: "Preparado", running: "En curso", paused: "En pausa", completed: "Terminado" };
const itemLabels = { pending: "Pendiente", processing: "Consultando", imported: "Borrador creado", skipped: "Omitida", failed: "Error" };
const lines = (text: string) => [...new Set(text.split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
type Discovery = { urls: string[]; sitemaps?: string[]; warnings?: string[]; message?: string };

export function ImportBatches({ onOpenRecord, onCatalogChanged }: { onOpenRecord: (id: string) => Promise<void>; onCatalogChanged: () => Promise<void> }) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [urls, setUrls] = useState("");
  const [maps, setMaps] = useState<string[]>([]);
  const [map, setMap] = useState("");
  const [busy, setBusy] = useState("");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const active = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const inputUrls = lines(urls);

  const remember = useCallback((next: BatchDetail) => {
    setBatch(next);
    setBatches(current => [next, ...current.filter(item => item.id !== next.id)]);
  }, []);
  useEffect(() => {
    let cancelled = false;
    request<{ batches: BatchSummary[] }>("/api/admin/import-batches", "GET").then(result => {
      if (!cancelled) setBatches(result.batches);
    }).catch(error => { if (!cancelled) setNotice({ kind: "error", text: message(error) }); });
    return () => { cancelled = true; active.current = false; };
  }, []);

  const batchId = batch?.id;
  useEffect(() => {
    if (!running || !batchId) return;
    active.current = true;
    const token = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    async function step() {
      if (!active.current || token !== generation.current) return;
      if (inFlight.current) { timer = setTimeout(step, 1000); return; }
      inFlight.current = true;
      try {
        const result = await request<{ batch: BatchDetail }>(`/api/admin/import-batches/${batchId}/step`, "POST", {});
        if (!active.current || token !== generation.current) return;
        remember(result.batch);
        if (result.batch.status === "completed" || result.batch.status === "paused") {
          active.current = false; setRunning(false);
          await onCatalogChanged();
          return;
        }
        const delay = result.batch.retryAt ? Math.max(3000, Math.min(60_000, Date.parse(result.batch.retryAt) - Date.now())) : 3000;
        timer = setTimeout(step, Number.isFinite(delay) ? delay : 3000);
      } catch (error) {
        if (token === generation.current) {
          active.current = false; setRunning(false);
          setNotice({ kind: "error", text: `${message(error)} El avance del lote queda guardado; puedes continuar después.` });
        }
      } finally { inFlight.current = false; }
    }
    void step();
    return () => { active.current = false; generation.current = token + 1; clearTimeout(timer); };
  }, [running, batchId, onCatalogChanged, remember]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!inputUrls.length || inputUrls.length > 1000) {
      setNotice({ kind: "error", text: "Añade entre 1 y 1.000 enlaces, uno por línea." }); return;
    }
    setBusy("create"); setNotice(null);
    try {
      const result = await request<{ batch: BatchDetail }>("/api/admin/import-batches", "POST", { urls: inputUrls });
      remember(result.batch); setPage(0); setFilter("all"); setUrls("");
      setNotice({ text: "Lote guardado. Pulsa Iniciar importación para crear los borradores." });
    } catch (error) { setNotice({ kind: "error", text: message(error) }); }
    finally { setBusy(""); }
  }
  async function discover(sitemap?: string) {
    setBusy("discover"); setNotice(null);
    try {
      const result = await request<Discovery>("/api/admin/import-batches/discover", "POST", sitemap ? { sitemap } : {});
      if (result.sitemaps?.length) { setMaps(result.sitemaps); setMap(result.sitemaps[0]); }
      if (result.urls.length) {
        setUrls(result.urls.join("\n"));
        setNotice({ text: `${result.urls.length} enlaces preparados. Revisa la lista y retira las publicaciones que no quieras importar.` });
      } else setNotice({ text: result.message || "Elige una parte del catálogo para preparar su lista de enlaces." });
      if (result.warnings?.length) setNotice({ kind: "warning", text: result.warnings.join(" ") });
    } catch (error) { setNotice({ kind: "error", text: message(error) }); }
    finally { setBusy(""); }
  }
  async function open(id: string) {
    active.current = false; generation.current++; setRunning(false); setBusy("open"); setNotice(null);
    try { const result = await request<{ batch: BatchDetail }>(`/api/admin/import-batches/${id}`, "GET"); remember(result.batch); setPage(0); setFilter("all"); }
    catch (error) { setNotice({ kind: "error", text: message(error) }); }
    finally { setBusy(""); }
  }
  async function control(action: "pause" | "resume" | "retry") {
    if (!batch) return;
    active.current = false; generation.current++; setRunning(false); setBusy(action); setNotice(null);
    try {
      const result = await request<{ batch: BatchDetail }>(`/api/admin/import-batches/${batch.id}`, "PATCH", { action });
      remember(result.batch);
      if (action !== "pause" && result.batch.status !== "completed") setRunning(true);
      else await onCatalogChanged();
    } catch (error) { setNotice({ kind: "error", text: message(error) }); }
    finally { setBusy(""); }
  }
  async function review(id: string) {
    if (running) await control("pause");
    setBusy("review");
    try { await onOpenRecord(id); }
    catch (error) { setNotice({ kind: "error", text: message(error) }); }
    finally { setBusy(""); }
  }

  const filtered = batch?.items.filter(item => filter === "all" || item.status === filter) ?? [];
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const shown = filtered.slice(page * 50, page * 50 + 50);
  const stats = batch ? { imported: batch.items.filter(item => item.status === "imported").length, failed: batch.items.filter(item => item.status === "failed").length, skipped: batch.items.filter(item => item.status === "skipped").length } : null;

  return <div className={styles.root}>
    <div className="admin-page-header"><div><div className="eyebrow">PIVIGAMES · IMPORTACIÓN EDITORIAL</div><h1>Importar en lote<span className="accent">.</span></h1><p>Prepara muchos juegos a la vez, conservando el formato de GameZone.</p></div><Layers size={30} className="accent" /></div>
    <Notification notice={notice} onDismiss={() => setNotice(null)} />
    <section className="admin-panel"><div className="panel-title"><div><h2>Prepara tu lista</h2><p>Hasta 1.000 publicaciones por lote, sin repetir enlaces.</p></div><FileInput size={20} /></div><div className="panel-body">
      <div className={styles.discovery}><div><strong>Explorar PiviGames</strong><p>Consulta una parte de su catálogo público y elige qué enlaces traer. Puede incluir promociones o juegos móviles.</p></div><button type="button" className="button secondary" disabled={Boolean(busy) || running} onClick={() => void discover()}>{busy === "discover" ? <LoaderCircle size={16} className="saving-spinner" /> : <Search size={16} />} Explorar catálogo</button></div>
      {maps.length > 0 && <div className={styles.mapPicker}><label htmlFor="pivi-map">Parte del catálogo</label><select id="pivi-map" className="admin-input" value={map} disabled={Boolean(busy) || running} onChange={event => setMap(event.target.value)}>{maps.map((value, index) => <option key={value} value={value}>Catálogo {index + 1} · {new URL(value).pathname}</option>)}</select><button type="button" className="button secondary" disabled={Boolean(busy) || running || !map} onClick={() => void discover(map)}>Preparar enlaces</button></div>}
      <form onSubmit={create}><div className="admin-field"><label htmlFor="batch-urls">Enlaces de PiviGames, uno por línea</label><textarea id="batch-urls" className={`admin-input ${styles.urls}`} rows={7} maxLength={2_050_000} value={urls} placeholder={"https://pivigames.blog/nombre-del-juego/\nhttps://pivigames.blog/otro-juego/"} disabled={Boolean(busy) || running} onChange={event => setUrls(event.target.value)} /><span className="field-help">{inputUrls.length.toLocaleString("es-ES")} enlaces únicos · Los resultados se guardarán como borradores privados para revisar.</span></div><button type="submit" className="button" disabled={Boolean(busy) || running || !inputUrls.length || inputUrls.length > 1000}>{busy === "create" ? <LoaderCircle size={16} className="saving-spinner" /> : <Layers size={16} />} Crear lote de borradores</button></form>
    </div></section>

    {batch && <section className="admin-panel" aria-label="Progreso del lote"><div className="panel-title"><div><h2>Tu lote</h2><p>{batch.total.toLocaleString("es-ES")} publicaciones · {batchLabels[batch.status]}</p></div><span className={`badge ${batch.status === "completed" ? "" : "draft"}`}>{running ? "Procesando" : batchLabels[batch.status]}</span></div><div className="panel-body">
      <div className={styles.progressLabel} aria-live="polite"><strong>{batch.done} de {batch.total} procesadas</strong><span>{stats?.imported} borradores · {stats?.skipped} omitidas · {stats?.failed} errores</span></div><progress className={styles.progress} value={batch.done} max={batch.total} aria-label="Publicaciones procesadas" />
      <div className={styles.controls}>{running ? <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void control("pause")}><Pause size={16} /> Pausar lote</button> : batch.status !== "completed" && <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void control("resume")}><Play size={16} /> {batch.done ? "Continuar importación" : "Iniciar importación"}</button>}{Boolean(stats?.failed) && !running && <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void control("retry")}><RefreshCw size={16} /> Reintentar errores</button>}<button type="button" className="text-link" disabled={Boolean(busy) || running} onClick={() => void open(batch.id)}><RefreshCw size={14} /> Actualizar estado</button></div>
      <p className={styles.help}>{running ? "Mantén este panel abierto mientras se procesa el lote. Puedes pausarlo en cualquier momento; una consulta ya iniciada puede terminar." : "El avance queda guardado. Si cierras el panel, vuelve a abrir este lote para continuar."} Las fichas existentes se omiten y conservan sus ediciones. Cada juego nuevo necesita revisión antes de publicarse.</p>
      {batch.status === "paused" && batch.retryAt && <p className={styles.help}>PiviGames ha solicitado una pausa. Puedes continuar a partir de las {new Date(batch.retryAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.</p>}
      <div className={styles.filters}><label htmlFor="batch-filter">Mostrar</label><select id="batch-filter" className="admin-input" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="all">Todas las publicaciones</option>{Object.entries(itemLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <ol className={styles.items} start={page * 50 + 1}>{shown.map(item => <li key={item.id}><div className={styles.itemMain}><strong>{item.title || new URL(item.url).pathname}</strong><a href={item.url} target="_blank" rel="noopener noreferrer">Ver origen en PiviGames</a><span className="field-help">{item.message || itemLabels[item.status]}</span>{Boolean(item.warnings?.length) && <details><summary>Avisos para la revisión ({item.warnings!.length})</summary><ul>{item.warnings!.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}</div><div className={styles.itemActions}><span className={`badge ${item.status === "failed" ? "changed" : item.status === "imported" ? "" : "draft"}`}>{item.status === "imported" && <Check size={12} />} {itemLabels[item.status]}</span>{item.recordId && <button type="button" className="button secondary small" disabled={Boolean(busy)} onClick={() => void review(item.recordId!)}><FilePenLine size={14} /> Revisar ficha</button>}</div></li>)}</ol>
      {pageCount > 1 && <div className={styles.pagination}><button type="button" className="button secondary small" disabled={page <= 0} onClick={() => setPage(current => current - 1)}><ArrowLeft size={14} /> Anterior</button><span>Página {page + 1} de {pageCount}</span><button type="button" className="button secondary small" disabled={page >= pageCount - 1} onClick={() => setPage(current => current + 1)}>Siguiente</button></div>}
    </div></section>}

    <section className="admin-panel"><div className="panel-title"><h2>Lotes guardados</h2><span className="muted">{batches.length}</span></div><div className="panel-body">{!batches.length ? <p className={styles.help}>Todavía no hay lotes. Prepara una lista para crear el primero.</p> : <ul className={styles.history}>{batches.map(item => <li key={item.id}><div><strong>{item.total} publicaciones</strong><span>{item.done} procesadas · {batchLabels[item.status]} · {new Date(item.createdAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}</span></div><button type="button" className="button secondary small" disabled={Boolean(busy) || running} onClick={() => void open(item.id)}>{batch?.id === item.id ? "Actualizar lote" : "Abrir lote"}</button></li>)}</ul>}</div></section>
  </div>;
}

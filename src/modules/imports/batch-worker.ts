import "server-only";
import { createRecord, findBySource, getRecord, RepositoryError, storageMode } from "@/modules/catalog/repository";
import type { CatalogRecord } from "@/modules/catalog/types";
import { serverEnvironment } from "@/lib/server-environment";
import { importFromPiviGames } from "./pivigames";
import { claimBatchItem, finishBatchItem, pauseBatchForSource } from "./batch-repository";
import { SourceHttpError } from "./safe-http";
import type { BatchDetail, BatchItem } from "./batch-types";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

/** Point lookup deliberately avoids PostgREST's default 1000-row list limit. */
async function collision(slug: string): Promise<CatalogRecord | null> {
  if (storageMode() === "sqlite") {
    const db = new DatabaseSync(resolve(/* turbopackIgnore: true */ process.env.GAMEZONE_DATABASE_PATH || ".data/gamezone.db"), { readOnly: true });
    try {
      const row = db.prepare("SELECT id FROM catalog_records WHERE draft_slug=? OR locked_slug=? LIMIT 1").get(slug, slug) as { id: string } | undefined;
      return row ? await getRecord(row.id) : null;
    } finally { db.close(); }
  }
  const key = serverEnvironment("SUPABASE_SECRET_KEY")!;
  const query = new URLSearchParams({ select: "id", or: `(draft_slug.eq.${slug},locked_slug.eq.${slug})`, limit: "1" });
  const response = await fetch(`${serverEnvironment("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/catalog_records?${query}`, { headers: { apikey: key, ...(!key.startsWith("sb_secret_") ? { Authorization: `Bearer ${key}` } : {}) }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new RepositoryError("No se pudo comprobar si la ficha ya existe.", "storage");
  const rows = await response.json() as { id: string }[];
  return rows[0] ? await getRecord(rows[0].id) : null;
}

function skipped(record: CatalogRecord, message: string): Pick<BatchItem, "status" | "recordId" | "title" | "message"> {
  return { status: "skipped", recordId: record.id, title: record.draft.title, message };
}

/** A request processes one item. Persisted leases let a later request safely resume an interrupted one. */
export async function stepBatch(id: string): Promise<BatchDetail> {
  const claim = await claimBatchItem(id);
  if (!claim.item || !claim.token) return claim.batch;
  const { item, token } = claim;
  let waitMilliseconds = 2000;
  let result: Pick<BatchItem, "status" | "recordId" | "title" | "message" | "warnings">;
  try {
    const imported = await importFromPiviGames(item.url);
    const existing = await findBySource(imported.source.provider, imported.source.id);
    if (existing) result = skipped(existing, "Este origen ya está en el catálogo. Se conservan sus textos, borrador y versión pública.");
    else {
      const duplicate = await collision(imported.content.slug);
      if (duplicate) result = skipped(duplicate, "Hay una ficha con este slug. Revisa juego y edición manualmente; no se ha vinculado ni sobrescrito.");
      else {
        try {
          const draft = await createRecord(imported.content, imported.source, imported.content);
          result = { status: "imported", recordId: draft.id, title: draft.draft.title, message: "Borrador creado. Revisa los datos y sus fuentes antes de publicar.", warnings: imported.warnings.slice(0, 20).map(value => value.slice(0, 500)) };
        } catch (error) {
          // Another editor or a recovered request may have saved the same identity first.
          if (!(error instanceof RepositoryError) || error.code !== "conflict") throw error;
          const concurrent = await findBySource(imported.source.provider, imported.source.id) ?? await collision(imported.content.slug);
          if (!concurrent) throw error;
          result = skipped(concurrent, "La ficha ya fue guardada por otra operación. Se conserva sin cambios.");
        }
      }
    }
  } catch (error) {
    if (error instanceof SourceHttpError && [403, 429].includes(error.status)) {
      waitMilliseconds = Math.max(60000, error.retryAfterMs ?? 300000);
      await pauseBatchForSource(id, waitMilliseconds);
    }
    const safeMessage = error instanceof RepositoryError ? error.message : error instanceof Error && /(?:fuente|publicación|identidad|canónic|WordPress|HTTP|JSON|DNS|Tiempo|límite|conexión|HTTPS|Destino|Redirección)/i.test(error.message) ? error.message : "No se pudo importar esta publicación. Comprueba el enlace y reintenta más tarde.";
    result = { status: "failed", message: safeMessage.slice(0, 500) };
  }
  return finishBatchItem(id, item.id, token, item.attempts, result, waitMilliseconds);
}

import { z } from "zod";
import { importFromPiviGames, validateSourceUrl } from "@/modules/imports/pivigames";
import { findBySource, listRecords } from "@/modules/catalog/repository";
import { apiError, HttpError, json, limitRequests, readJson, requireEditor } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 30;
const activeEditors = new Set<string>();

export async function POST(request: Request) {
  try {
    const editor = await requireEditor(request);
    limitRequests(`import:${editor.id}`, 6);
    const { url } = z.object({ url: z.string().max(2048) }).strict().parse(await readJson(request, 8192));
    try { validateSourceUrl(url); } catch { throw new HttpError("Introduce la URL HTTPS de una publicación de pivigames.blog.", 422); }
    if (activeEditors.has(editor.id) || activeEditors.size >= 2) throw new HttpError("Hay otra importación en curso. Espera a que termine antes de continuar.", 429);
    let imported;
    activeEditors.add(editor.id);
    try { imported = await importFromPiviGames(url); }
    catch (error) {
      throw new HttpError(error instanceof Error ? error.message.slice(0, 300) : "No se pudo leer la publicación de PiviGames.", 422);
    }
    finally { activeEditors.delete(editor.id); }
    let existing = await findBySource(imported.source.provider, imported.source.id);
    if (!existing) {
      // This is only a proposal. Linking and changing fields require an explicit save.
      const collision = (await listRecords()).find((record) => record.draft.slug === imported.content.slug);
      if (collision?.source && (collision.source.provider !== imported.source.provider || collision.source.id !== imported.source.id)) {
        imported.warnings.push("Otra publicación ya utiliza ese slug y tiene un origen diferente. Confirma la edición y elige un slug distinto antes de guardar esta ficha nueva.");
      } else if (collision) {
        existing = collision;
        imported.warnings.push("Ya existe una ficha con este slug. Comprueba juego y edición antes de aceptar cambios o vincular el origen.");
      }
    }
    return json({ imported, existing });
  } catch (error) { return apiError(error); }
}

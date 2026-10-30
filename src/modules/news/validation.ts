import { z } from "zod";
import type { NewsContent } from "./types";

const text = (max: number) => z.string().trim().max(max);
const https = text(2048).refine((value) => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443"); } catch { return false; }
}, "Usa una URL HTTPS válida sin credenciales ni puertos personalizados.");
const image = text(2048).refine((value) => {
  if (!value) return true;
  if (/^\/assets\/[a-zA-Z0-9_./% -]+$/.test(value)) {
    try { const decoded = decodeURIComponent(value); return !decoded.includes("..") && !decoded.includes("\\") && !decoded.includes("//"); } catch { return false; }
  }
  return https.safeParse(value).success;
}, "La portada debe usar HTTPS o una ruta local /assets/ válida.");

export const newsContentSchema = z.object({
  title: text(200).min(1, "El título de la noticia es obligatorio."),
  slug: text(160).min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug debe usar letras minúsculas, números y guiones."),
  summary: text(1000), body: z.array(text(10000)).max(80), coverImage: image, coverAlt: text(300),
  tags: z.array(text(80).min(1)).max(20), sourceUrl: https,
}).strict();

export function newsPublishIssues(content: NewsContent): string[] {
  const parsed = newsContentSchema.safeParse(content);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const issues: string[] = [];
  if (content.summary.trim().length < 30) issues.push("Añade un resumen de al menos 30 caracteres.");
  if (!content.body.some((paragraph) => paragraph.trim().length >= 50)) issues.push("Añade un cuerpo editorial con al menos un párrafo de 50 caracteres.");
  if (!content.coverImage) issues.push("Selecciona una portada para la noticia.");
  if (!content.coverAlt.trim()) issues.push("Describe la portada para lectores de pantalla.");
  return issues;
}

import { z } from "zod";
import type { GameContent } from "./types";

const text = (max: number) => z.string().trim().max(max);
const optionalHttps = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Usa una URL HTTPS válida, sin credenciales.");
const imageUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (/^\/assets\/[a-zA-Z0-9_./% -]+$/.test(value)) {
    try { const decoded = decodeURIComponent(value); return !decoded.includes("..") && !decoded.includes("\\") && !decoded.includes("//"); } catch { return false; }
  }
  return optionalHttps.safeParse(value).success;
}, "La imagen debe usar HTTPS o una ruta local /assets/.");
const date = text(10).refine((value) => {
  if (!value) return true;
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  if (parts[0] < 1950 || parts[0] > 2199) return false;
  if (parts.length > 1 && (parts[1] < 1 || parts[1] > 12)) return false;
  if (parts.length === 3) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  return true;
}, "Usa una fecha real: AAAA, AAAA-MM o AAAA-MM-DD.");
const labels = z.array(text(120).min(1)).max(40);

export const gameContentSchema = z.object({
  title: text(200).min(1, "El título es obligatorio."),
  slug: text(160).min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug debe usar letras minúsculas, números y guiones."),
  summary: text(1000), description: z.array(text(10000)).max(50),
  coverImage: imageUrl, coverAlt: text(300), genres: labels, platforms: labels,
  developer: text(200), publisher: text(200), releaseDate: date,
  steamAppId: text(12).regex(/^\d*$/, "El identificador de Steam debe ser numérico."),
  languages: labels,
  requirements: z.array(z.object({ platform: text(80).min(1), minimum: z.array(text(1000)).max(30), recommended: z.array(text(1000)).max(30) }).strict()).max(10),
  screenshots: z.array(imageUrl.refine(Boolean, "La imagen no puede estar vacía.")).max(30),
  trailerUrl: optionalHttps,
  distributions: z.array(z.object({
    label: text(200).min(1), version: text(120), size: text(120), format: text(120),
    links: z.array(z.object({ label: text(160).min(1), url: optionalHttps.refine(Boolean, "El enlace es obligatorio."), type: z.enum(["base", "update", "extra"]) }).strict()).max(50),
    installation: z.array(text(3000)).max(30),
  }).strict()).max(20),
  evidence: z.array(z.object({
    field: text(100).min(1), label: text(200), value: text(20000),
    provider: z.enum(["pivigames", "igdb", "official", "editorial"]), sourceUrl: optionalHttps,
    retrievedAt: z.string().datetime({ offset: true }), status: z.enum(["reported", "documented", "conflict", "pending"]),
  }).strict()).max(150),
}).strict();

export function publishIssues(content: GameContent): string[] {
  const issues: string[] = [];
  const parsed = gameContentSchema.safeParse(content);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  if (content.summary.trim().length < 30) issues.push("Añade un resumen de al menos 30 caracteres.");
  if (!content.description.some((paragraph) => paragraph.trim().length >= 50)) issues.push("Añade una descripción de al menos 50 caracteres.");
  if (!content.coverImage) issues.push("Selecciona una portada.");
  if (!content.coverAlt.trim()) issues.push("Describe la portada para lectores de pantalla.");
  if (!content.platforms.length) issues.push("Indica al menos una plataforma.");
  if (content.evidence.some((evidence) => evidence.status === "conflict")) issues.push("Resuelve las discrepancias entre fuentes antes de publicar.");
  return issues;
}

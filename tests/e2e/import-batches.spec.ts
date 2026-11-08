import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { BatchDetail } from "../../src/modules/imports/batch-types";

test("lote persistente, pausa y resultados revisables con el estilo original", async ({ page }) => {
  const origin = "http://127.0.0.1:3100";
  await page.goto("/admin");
  await page.getByLabel("Contraseña editorial").fill(process.env.GAMEZONE_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.getByRole("button", { name: "Importar en lote", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Importar en lote." })).toBeVisible();
  const suffix = Date.now().toString(36);
  const first = `https://pivigames.blog/prueba-lote-${suffix}/`;
  const second = `https://pivigames.blog/otra-prueba-${suffix}/`;
  await page.getByLabel("Enlaces de PiviGames, uno por línea").fill(`${first}\n${first}\n${second}`);
  await expect(page.getByText("2 enlaces únicos", { exact: false })).toBeVisible();
  const created = page.waitForResponse(response => response.url().endsWith("/api/admin/import-batches") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Crear lote de borradores" }).click();
  const { batch } = await (await created).json() as { batch: BatchDetail };
  expect(batch.total).toBe(2);
  expect(batch.items.every(item => item.status === "pending")).toBe(true);

  // Real SQLite persistence and authorization; no source request has been made.
  const paused = await page.request.patch(`/api/admin/import-batches/${batch.id}`, { headers: { Origin: origin }, data: { action: "pause" } });
  expect(paused.status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "Importar en lote", exact: true }).click();
  await page.getByRole("button", { name: "Abrir lote", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Progreso del lote" })).toContainText("En pausa");
  const saved = await page.request.get(`/api/admin/import-batches/${batch.id}`);
  expect((await saved.json()).batch.items.map((item: { url: string }) => item.url)).toEqual([first.slice(0, -1), second.slice(0, -1)]);
  expect([401, 403]).toContain((await page.request.post(`/api/admin/import-batches/${batch.id}/step`, { headers: { Origin: "https://otro.example" }, data: {} })).status());

  // Deterministic UI outcome. Worker/parser/lease persistence have separate integration tests.
  await page.route(`**/api/admin/import-batches/${batch.id}/step`, route => route.fulfill({ json: { batch: {
    ...batch, status: "completed", done: 2, items: batch.items.map((item, index) => ({ ...item, status: index ? "failed" : "skipped", title: index ? "Ficha por revisar" : "Juego ya existente", message: index ? "La fuente no está disponible. Puedes reintentarlo." : "Se conserva la ficha existente." })),
  } } }));
  await page.getByRole("button", { name: "Iniciar importación" }).click();
  await expect(page.getByText("2 de 2 procesadas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar errores" })).toBeVisible();
  await expect(page.getByText("Se conserva la ficha existente.")).toBeVisible();
  const region = page.getByRole("region", { name: "Progreso del lote" });
  await expect(region).toContainText("1 omitidas");
  await expect(region).toContainText("1 errores");
  await expect(page.getByRole("heading", { name: "Importar en lote." })).toHaveCSS("color", "rgb(110, 185, 43)");
  mkdirSync(".data/qa", { recursive: true });
  await page.screenshot({ path: ".data/qa/import-batches-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".data/qa/import-batches-mobile.png", fullPage: true });
});

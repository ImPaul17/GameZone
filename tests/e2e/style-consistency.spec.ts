import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function originalTheme(page: Page) {
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(10, 10, 10)");
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toHaveCSS("color", "rgb(110, 185, 43)");
  expect(await title.evaluate(element => getComputedStyle(element).fontFamily)).toContain("SnesItalic");
  expect(await page.locator("body").evaluate(element => getComputedStyle(element).fontFamily)).toContain("Inter");
  await page.evaluate(async () => { await document.fonts.load('italic 40px "SnesItalic"'); await document.fonts.ready; });
}

test("acceso, panel y editores comparten los colores y la tipografía originales", async ({ page }) => {
  mkdirSync(".data/qa", { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin");
  await originalTheme(page);
  await expect(page.locator(".login-card")).toHaveCSS("background-color", "rgb(26, 26, 26)");
  await page.screenshot({ path: ".data/qa/login-original-style.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".data/qa/login-original-mobile.png", fullPage: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel("Contraseña editorial").fill(process.env.GAMEZONE_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar al panel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo de juegos." })).toBeVisible();
  await originalTheme(page);
  await expect(page.getByText("EDITORIAL WORKSPACE", { exact: true })).toHaveCount(0);
  await expect(page.locator(".admin-panel").first()).toHaveCSS("background-color", "rgb(26, 26, 26)");
  await page.screenshot({ path: ".data/qa/admin-original-style.png", fullPage: false });
  await page.getByRole("button", { name: "Editar PEAK", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({ ratio: 1 });
  await originalTheme(page);
  await page.screenshot({ path: ".data/qa/game-editor-original-style.png", fullPage: false });
  await page.getByRole("button", { name: "Volver al catálogo", exact: true }).click();
  await page.getByRole("button", { name: "Noticias", exact: true }).click();
  await originalTheme(page);
  await page.screenshot({ path: ".data/qa/news-admin-original-style.png", fullPage: false });
  await page.getByRole("button", { name: "Crear noticia", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({ ratio: 1 });
  await originalTheme(page);
  await page.screenshot({ path: ".data/qa/news-editor-original-style.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".data/qa/news-editor-original-mobile.png", fullPage: false });
});

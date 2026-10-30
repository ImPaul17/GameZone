import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("mi cuenta conserva la identidad original y muestra Discord deshabilitado en local", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/cuenta.html");
  await expect(page).toHaveURL(/\/cuenta\.html$/);
  const logo = page.getByRole("link", { name: "GameZone, inicio", exact: true });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("href", "/index.html");
  await expect(logo).toHaveCSS("color", "rgb(255, 255, 255)");
  const heading = page.getByRole("heading", { name: "Mi cuenta", exact: true, level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS("color", "rgb(110, 185, 43)");
  await expect(page.locator("header").locator("..")).toHaveCSS("background-color", "rgb(10, 10, 10)");
  expect(await logo.evaluate(element => getComputedStyle(element).fontFamily)).toContain("SnesItalic");
  const fontFamily = await logo.evaluate(element => getComputedStyle(element).fontFamily.split(",")[0].trim());
  const fontLoaded = await page.evaluate(async family => {
    const faces = await document.fonts.load(`italic 20px ${family}`);
    return faces.length > 0 && faces.every(face => face.status === "loaded");
  }, fontFamily);
  expect(fontLoaded).toBe(true);

  const navigation = page.getByRole("navigation", { name: "Navegación principal" });
  for (const [label, href] of [["Inicio", "/index.html"], ["Juegos", "/games.html"], ["Noticias", "/noticias.html"], ["Mi cuenta", "/cuenta.html"]]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("button", { name: "Continuar con Discord", exact: true })).toBeDisabled();
  await expect(page.getByText("El acceso con Discord aún no está configurado. Vuelve a intentarlo más adelante.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Alias", { exact: true })).toHaveCount(0);
  await expect(page.locator(".admin-sidebar")).toHaveCount(0);

  mkdirSync(".data/qa", { recursive: true });
  await page.screenshot({ path: ".data/qa/account-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator('button[aria-controls="account-navigation"]');
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#account-navigation")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".data/qa/account-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("perfil y avatar privados no son accesibles sin autenticación y las escrituras comprueban el origen", async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  for (const path of ["/api/account/profile", "/api/account/avatar"]) {
    const response = await request.get(path);
    expect([401, 503]).toContain(response.status());
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.json()).profile).toBeUndefined();
  }

  const wrongOrigin = { Origin: "https://otro-sitio.example" };
  expect((await request.patch("/api/account/profile", { headers: wrongOrigin, data: { displayName: "No guardar", bio: "" } })).status()).toBe(403);
  expect((await request.post("/api/account/avatar", {
    headers: wrongOrigin,
    multipart: { file: { name: "foto.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) } },
  })).status()).toBe(403);
  expect((await request.delete("/api/account/avatar", { headers: wrongOrigin })).status()).toBe(403);
  expect((await request.post("/api/account/discord", { headers: wrongOrigin, data: {} })).status()).toBe(403);
  expect((await request.delete("/api/account/session", { headers: wrongOrigin })).status()).toBe(403);

  const sameOrigin = { Origin: origin };
  expect([401, 503]).toContain((await request.patch("/api/account/profile", { headers: sameOrigin, data: { displayName: "No guardar", bio: "" } })).status());
  expect([401, 503]).toContain((await request.post("/api/account/avatar", {
    headers: sameOrigin,
    multipart: { file: { name: "foto.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) } },
  })).status());
  expect([401, 503]).toContain((await request.delete("/api/account/avatar", { headers: sameOrigin })).status());
  const discord = await request.post("/api/account/discord", { headers: sameOrigin, data: {} });
  expect(discord.status()).toBe(503);
  expect((await discord.json()).url).toBeUndefined();
});

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { emptyGame, type GameContent } from "../../src/modules/catalog/types";

const unique = Date.now().toString(36);
const fixture: GameContent = {
  ...emptyGame(), title: `Prueba editorial ${unique}`, slug: `prueba-editorial-${unique}`,
  summary: "Una aventura de prueba para verificar el recorrido editorial de GameZone.",
  description: ["Esta ficha sintética comprueba que el borrador se guarda y se publica solo después de la decisión del editor. No representa un videojuego real."],
  coverImage: "https://i.imgur.com/IpXmPIi.jpeg", coverAlt: "Paisaje de la ficha de prueba",
  genres: ["Aventura"], platforms: ["Windows"], developer: "GameZone",
};

async function signIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Contraseña editorial").fill(process.env.GAMEZONE_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await expect(page.getByRole("heading", { name: "Catálogo de juegos." })).toBeVisible();
}

async function waitForOriginalAnimations(page: Page) {
  const lastAnimatedElement = page.locator(".loading").last();
  await expect(lastAnimatedElement).toHaveClass(/\bloaded\b/);
  await expect(lastAnimatedElement).toHaveCSS("opacity", "1");
  await expect(page.locator(".game-card.loading").first()).toHaveCSS("opacity", "1");
}

test("se conserva la página original, sus rutas y la búsqueda segura", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".hero-logo-img")).toBeVisible();
  await expect(page).toHaveTitle("GameZone - Tu portal de juegos para PC");
  const original = readFileSync("index.html", "utf8");
  expect(await (await page.request.get("/")).text()).toBe(original);
  mkdirSync(".data/qa", { recursive: true });
  await waitForOriginalAnimations(page);
  await expect(page.locator(".hero-logo")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: ".data/qa/home-desktop.png", fullPage: true });
  await page.goto("/games/peak/peak.html");
  await expect(page).toHaveURL(/\/games\/peak\/peak\.html$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PEAK");
  const payload = '<img src=x onerror="alert(1)">';
  await page.goto(`/buscar.html?q=${encodeURIComponent(payload)}`);
  await expect(page.locator("#noResultsQuery")).toHaveText(payload);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games.html");
  await expect(page.locator(".mobile-menu-toggle")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await waitForOriginalAnimations(page);
  await page.screenshot({ path: ".data/qa/catalog-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("los borradores son privados y las escrituras exigen sesión y mismo origen", async ({ request }) => {
  expect((await request.get("/api/admin/games")).status()).toBe(401);
  expect((await request.post("/api/admin/games", { data: { content: fixture }, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(401);
  expect((await request.post("/api/admin/session", { data: { password: process.env.GAMEZONE_E2E_PASSWORD }, headers: { Origin: "https://otro-sitio.example" } })).status()).toBe(403);
  expect((await request.get(`/juegos/${fixture.slug}`)).status()).toBe(404);
});

test("importación revisada → borrador durable → publicación → búsqueda", async ({ page }) => {
  const publishedFixture = { ...fixture, title: `${fixture.title} revisada`, slug: `${fixture.slug}-revisada` };
  await signIn(page);
  await page.screenshot({ path: ".data/qa/admin-desktop.png", fullPage: true });
  // Deterministic UI integration: source transport/parser have separate tests and live smoke checks.
  await page.route("**/api/admin/import", (route) => route.fulfill({ json: {
    imported: { content: fixture, source: { provider: "pivigames", id: `test-${unique}`, url: `https://pivigames.blog/prueba-${unique}/` }, warnings: ["Ejemplo sintético de prueba."], fetchedAt: new Date().toISOString() }, existing: null,
  } }));
  await page.getByLabel("Enlace de la publicación de PiviGames").fill(`https://pivigames.blog/prueba-${unique}/`);
  await page.getByRole("button", { name: "Importar y revisar" }).click();
  await expect(page.getByRole("button", { name: /Aplicar \d+ campos/ })).toBeVisible();
  await page.getByLabel("Título", { exact: true }).fill(publishedFixture.title);
  let navigationWasConfirmed = false;
  page.once("dialog", async (dialog) => { navigationWasConfirmed = true; await dialog.dismiss(); });
  await page.locator(".admin-sidebar .brand").click();
  expect(navigationWasConfirmed).toBe(true);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: /Aplicar \d+ campos/ }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(publishedFixture.title);
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/guardad/i);
  expect((await page.request.get(`/games/${publishedFixture.slug}/${publishedFixture.slug}.html`)).status()).toBe(404);
  await page.reload();
  await page.getByRole("button", { name: `Editar ${publishedFixture.title}` }).click();
  await page.getByRole("button", { name: "Publicar en GameZone", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("La ficha ya está visible en GameZone.");
  await page.goto(`/games/${publishedFixture.slug}/${publishedFixture.slug}.html`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(publishedFixture.title);
  await page.goto(`/buscar.html?q=${encodeURIComponent(publishedFixture.title)}`);
  await expect(page.getByRole("heading", { name: publishedFixture.title, exact: true })).toBeVisible();
  // New draft changes must not leak into the published snapshot.
  const { records } = await (await page.request.get("/api/admin/games")).json();
  const record = records.find((item: { draft: GameContent }) => item.draft.slug === publishedFixture.slug);
  const response = await page.request.patch(`/api/admin/games/${record.id}`, {
    headers: { Origin: "http://127.0.0.1:3100" }, data: { content: { ...record.draft, summary: "Un borrador privado que todavía no se ha publicado y debe quedar oculto." }, expectedRevision: record.revision, action: "save" },
  });
  expect(response.ok()).toBe(true);
  await page.goto(`/games/${publishedFixture.slug}/${publishedFixture.slug}.html`);
  await expect(page.getByText(fixture.summary, { exact: true })).toBeVisible();
  await expect(page.getByText("Un borrador privado", { exact: false })).toHaveCount(0);
});

test("la vista previa del admin usa la ficha original sin publicar el borrador", async ({ page }) => {
  const previewTitle = `Vista previa editorial ${unique}`;
  const previewSlug = `vista-previa-editorial-${unique}`;
  await signIn(page);
  await page.getByRole("button", { name: "Crear publicación", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill(previewTitle);
  await page.getByLabel("Resumen", { exact: true }).fill(fixture.summary);
  await page.getByLabel("Descripción", { exact: true }).fill(fixture.description[0]);
  await page.getByLabel("Portada", { exact: true }).fill(fixture.coverImage);
  await page.getByLabel("Texto alternativo", { exact: true }).fill(fixture.coverAlt);

  const previewResponse = page.waitForResponse(response => response.url().endsWith("/api/admin/preview") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Vista previa", exact: true }).click();
  const response = await previewResponse;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().content.title).toBe(previewTitle);

  const iframe = page.locator('iframe[title="Vista previa de GameZone"]');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute("sandbox", "");
  await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  const preview = page.frameLocator('iframe[title="Vista previa de GameZone"]');
  await expect(preview.locator("title")).toHaveJSProperty("textContent", `${previewTitle} - GameZone`);
  await expect(preview.locator("h1.game-title")).toHaveText(previewTitle);
  await expect(preview.locator("h1.game-title")).toBeVisible();
  await expect(preview.locator(".game-hero .game-description")).toHaveText(fixture.summary);
  await expect(preview.locator(".game-hero .game-actions .btn-primary")).toBeVisible();
  await expect(preview.locator(".game-hero-content")).toHaveCSS("opacity", "1");
  await expect(preview.locator("script")).toHaveCount(0);
  await expect(preview.locator("base")).toHaveAttribute("href", `${new URL(page.url()).origin}/games/${previewSlug}/${previewSlug}.html`);
  const originalFont = await preview.locator("html").evaluate(async () => {
    try {
      const faces = await document.fonts.load('italic 20px "SnesItalic"');
      return { error: "", loaded: faces.some(face => face.family.includes("SnesItalic") && face.status === "loaded") };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), loaded: false };
    }
  });
  expect(originalFont.error, "La fuente original debe poder cargarse dentro de la vista previa aislada.").toBe("");
  expect(originalFont.loaded, "La vista previa debe utilizar la fuente SnesItalic original.").toBe(true);
  await page.screenshot({ path: ".data/qa/admin-preview.png", fullPage: true });

  expect((await page.request.get(`/games/${previewSlug}/${previewSlug}.html`)).status()).toBe(404);
  await page.getByRole("button", { name: "Editar ficha", exact: true }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(previewTitle);
});

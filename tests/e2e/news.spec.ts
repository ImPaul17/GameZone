import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { load } from "cheerio";
import { emptyNews, type NewsContent, type NewsRecord } from "../../src/modules/news/types";

const unique = Date.now().toString(36);
const fixture: NewsContent = {
  ...emptyNews(), title: `Noticia editorial ${unique}`, slug: `noticia-editorial-${unique}`,
  summary: "Una noticia sintética para comprobar la publicación editorial conservando el diseño original de GameZone.",
  body: [
    "Este artículo sintético verifica que el texto editorial se guarda de forma duradera y permanece privado hasta que el editor decide publicarlo.",
    '<img src="news-injection-probe" onerror="window.newsProbe=true"> Este bloque debe mostrarse como texto.',
  ],
  coverImage: "https://i.imgur.com/IpXmPIi.jpeg", coverAlt: "Paisaje de la noticia de prueba", tags: ["Actualidad", "Prueba editorial"],
};

async function openNewsDashboard(page: Page) {
  await page.locator(".admin-sidebar nav").getByRole("button", { name: "Noticias", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Noticias." })).toBeVisible();
}
async function signIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Contraseña editorial").fill(process.env.GAMEZONE_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar al panel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo de juegos." })).toBeVisible();
  await openNewsDashboard(page);
}
async function fillArticle(page: Page, content: NewsContent) {
  await page.getByLabel("Título", { exact: true }).fill(content.title);
  await page.getByLabel("Dirección (slug)", { exact: true }).fill(content.slug);
  await page.getByLabel("Resumen", { exact: true }).fill(content.summary);
  await page.getByLabel("Texto de la noticia", { exact: true }).fill(content.body.join("\n\n"));
  await page.getByLabel("Portada", { exact: true }).fill(content.coverImage);
  await page.getByLabel("Texto alternativo", { exact: true }).fill(content.coverAlt);
  await page.getByLabel("Etiquetas", { exact: true }).fill(content.tags.join(", "));
}
async function savedRecord(page: Page, slug: string): Promise<NewsRecord> {
  const response = await page.request.get("/api/admin/news");
  expect(response.status()).toBe(200);
  const { records } = await response.json() as { records: NewsRecord[] };
  const record = records.find((item) => item.draft.slug === slug);
  expect(record, "La noticia debe seguir guardada en la base aislada de las pruebas.").toBeDefined();
  return record!;
}
async function waitForNewsVisuals(page: Page) {
  const fontLoaded = await page.evaluate(async () => {
    const faces = await document.fonts.load('20px "SnesItalic"');
    return faces.some((face) => face.family.includes("SnesItalic") && face.status === "loaded");
  });
  expect(fontLoaded, "Las capturas deben utilizar la fuente original de GameZone.").toBe(true);
  await expect(page.locator(".loading").last()).toHaveClass(/\bloaded\b/);
  await expect(page.locator(".loading").last()).toHaveCSS("opacity", "1");
  const covers = page.locator(".news-cover");
  for (let index = 0; index < await covers.count(); index++) {
    await expect(covers.nth(index)).toHaveJSProperty("complete", true);
    await expect.poll(() => covers.nth(index).evaluate((image: HTMLImageElement) => image.naturalWidth), {
      message: "La portada de la noticia debe estar cargada antes de capturarla.",
    }).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "La noticia no debe desbordar horizontalmente.").toBe(true);
}

test("las noticias y su vista previa exigen autorización editorial", async ({ request }) => {
  expect((await request.get("/api/admin/news")).status()).toBe(401);
  expect((await request.get("/api/admin/news/11111111-1111-4111-a111-111111111111")).status()).toBe(401);
  expect((await request.post("/api/admin/news", { data: { content: fixture }, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(401);
  expect((await request.post("/api/admin/news/preview", { data: { content: fixture }, headers: { Origin: "http://127.0.0.1:3100" } })).status()).toBe(401);
  expect((await request.get(`/noticias/${fixture.slug}.html`)).status()).toBe(404);
});

test("noticia durable → vista previa original → publicación → cambios privados → retirada", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Crear noticia", exact: true }).click();
  await fillArticle(page, fixture);
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Borrador de noticia guardado." })).toBeVisible();
  const draft = await savedRecord(page, fixture.slug);
  expect(draft.published).toBeNull();
  expect(draft.draft).toEqual(fixture);
  expect((await page.request.get(`/noticias/${fixture.slug}.html`)).status()).toBe(404);

  await page.reload();
  await openNewsDashboard(page);
  await page.getByRole("button", { name: `Editar noticia ${fixture.title}`, exact: true }).click();
  await expect(page.getByLabel("Texto de la noticia", { exact: true })).toHaveValue(fixture.body.join("\n\n"));
  const previewResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/news/preview") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Vista previa de noticia", exact: true }).click();
  expect((await previewResponse).status()).toBe(200);
  const iframe = page.locator('iframe[title="Vista previa de noticia de GameZone"]');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute("sandbox", "");
  await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  const preview = page.frameLocator('iframe[title="Vista previa de noticia de GameZone"]');
  await expect(preview.locator("title")).toHaveJSProperty("textContent", `${fixture.title} - GameZone`);
  await expect(preview.locator("h1.news-hero-title")).toHaveText(fixture.title);
  await expect(preview.locator("h1.news-hero-title")).toBeVisible();
  await expect(preview.locator(".news-article .coming-soon-text").nth(1)).toHaveText(fixture.body[1]);
  await expect(preview.locator('img[src="news-injection-probe"],script')).toHaveCount(0);
  await expect(preview.locator(".news-hero-title")).toHaveCSS("font-family", /SnesItalic/);
  expect((await page.request.get(`/noticias/${fixture.slug}.html`)).status()).toBe(404);
  await page.getByRole("button", { name: "Editar noticia", exact: true }).click();
  await page.getByRole("button", { name: "Publicar noticia", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Noticia publicada. Ya está visible en GameZone." })).toBeVisible();
  const published = await savedRecord(page, fixture.slug);
  expect(published.published).toEqual(fixture);

  // Read public pages in a separate tab, preserving the editor's saved state.
  const publicPage = await page.context().newPage();
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await publicPage.goto(`/noticias/${fixture.slug}.html`, { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator("h1.news-hero-title")).toHaveText(fixture.title);
  await expect(publicPage.locator(".news-article .coming-soon-text").first()).toHaveText(fixture.body[0]);
  await expect(publicPage.locator('img[src="news-injection-probe"]')).toHaveCount(0);
  mkdirSync(".data/qa", { recursive: true });
  await waitForNewsVisuals(publicPage);
  await publicPage.screenshot({ path: ".data/qa/news-article.png", fullPage: true });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await waitForNewsVisuals(publicPage);
  await publicPage.screenshot({ path: ".data/qa/news-mobile.png", fullPage: true });
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await publicPage.goto("/noticias.html", { waitUntil: "domcontentloaded" });
  await expect(publicPage.locator(".news-card .feature-title").filter({ hasText: fixture.title })).toHaveText(fixture.title);
  await waitForNewsVisuals(publicPage);
  await publicPage.screenshot({ path: ".data/qa/news-listing.png", fullPage: true });
  const homepage = await (await page.request.get("/")).text();
  const $ = load(homepage);
  expect($("#news .news-card .game-title").toArray().map((node) => $(node).text())).toContain(fixture.title);
  const original = load(readFileSync("index.html", "utf8"));
  for (let index = 0; index < 2; index++) {
    expect($("#news .news-grid > .game-card").eq(index).prop("outerHTML")).toBe(original("#news .news-grid > .game-card").eq(index).prop("outerHTML"));
  }

  const privateSummary = `Borrador privado de noticia ${unique} que no debe filtrarse al sitio público.`;
  const save = await page.request.patch(`/api/admin/news/${published.id}`, {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { content: { ...published.draft, summary: privateSummary }, expectedRevision: published.revision, action: "save" },
  });
  expect(save.status()).toBe(200);
  const stale = await page.request.patch(`/api/admin/news/${published.id}`, {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { content: { ...published.draft, title: "No debe sobrescribir la revisión actual" }, expectedRevision: published.revision, action: "save" },
  });
  expect(stale.status()).toBe(409);
  expect((await savedRecord(page, fixture.slug)).draft.summary).toBe(privateSummary);
  for (const path of [`/noticias/${fixture.slug}.html`, "/noticias.html", "/"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(privateSummary);
    expect(text).toContain(fixture.summary);
  }

  await page.reload();
  await openNewsDashboard(page);
  await page.getByRole("button", { name: `Editar noticia ${fixture.title}`, exact: true }).click();
  await expect(page.getByLabel("Resumen", { exact: true })).toHaveValue(privateSummary);
  page.once("dialog", async (dialog) => { await dialog.accept(); });
  await page.getByRole("button", { name: "Retirar noticia", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Noticia retirada. El contenido se conserva como borrador." })).toBeVisible();
  expect((await page.request.get(`/noticias/${fixture.slug}.html`)).status()).toBe(404);
  expect((await savedRecord(page, fixture.slug)).published).toBeNull();
  expect(await (await page.request.get("/noticias.html")).text()).not.toContain(fixture.title);
  expect(await (await page.request.get("/")).text()).not.toContain(fixture.title);
  await publicPage.close();
});

test("la vista previa de noticias muestra títulos y párrafos maliciosos como texto inerte", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Crear noticia", exact: true }).click();
  const dangerous: NewsContent = { ...fixture, slug: `preview-noticia-${unique}`,
    title: `Noticia <img src=x onerror="window.newsProbe=true"> ${unique}`,
    body: ["<script>window.newsProbe=true</script> Este contenido debe conservarse como texto dentro de la vista previa original."],
  };
  await fillArticle(page, dangerous);
  await page.getByRole("button", { name: "Vista previa de noticia", exact: true }).click();
  const preview = page.frameLocator('iframe[title="Vista previa de noticia de GameZone"]');
  await expect(preview.locator("h1.news-hero-title")).toHaveText(dangerous.title);
  await expect(preview.locator(".news-article .coming-soon-text").first()).toHaveText(dangerous.body[0]);
  await expect(preview.locator('script,img[src="x"],[onerror],[onload],[onclick]')).toHaveCount(0);
  expect((await page.request.get(`/noticias/${dangerous.slug}.html`)).status()).toBe(404);
});

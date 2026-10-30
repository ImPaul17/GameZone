import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { withAccountLink } from "../../src/modules/legacy/account-link";

async function measureHeader(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element | null) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || !box.width || !box.height) return null;
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const header = document.querySelector("header.header")!;
    const slots = [
      { name: "logo", box: rect(header.querySelector(".logo")), dropdown: false },
      { name: "search", box: rect(header.querySelector(".search-container")), dropdown: false },
      { name: "navigation", box: rect(header.querySelector(".nav")), dropdown: false },
    ];
    const controls = [...header.querySelectorAll(".nav-menu > .nav-item > .nav-link, .mobile-menu-toggle, a.discord-btn, #kofi-widget-container")].map(element => ({
      name: element.id || element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || element.className,
      box: rect(element),
      dropdown: innerWidth <= 1200 && Boolean(element.closest(".nav-menu")),
    }));
    return { width: innerWidth, height: innerHeight, header: rect(header), slots, controls, documentWidth: document.documentElement.scrollWidth };
  });
}

function assertHeaderGeometry(geometry: Awaited<ReturnType<typeof measureHeader>>) {
  const diagnostic = JSON.stringify(geometry, null, 2);
  expect(geometry.documentWidth, diagnostic).toBeLessThanOrEqual(geometry.width);
  for (const item of [...geometry.slots, ...geometry.controls]) {
    if (!item.box) continue;
    expect(item.box.left, `${item.name} crosses the left viewport edge. ${diagnostic}`).toBeGreaterThanOrEqual(-1);
    expect(item.box.right, `${item.name} crosses the right viewport edge. ${diagnostic}`).toBeLessThanOrEqual(geometry.width + 1);
    expect(item.box.top, `${item.name} is above the header. ${diagnostic}`).toBeGreaterThanOrEqual((geometry.header?.top || 0) - 1);
    const bottom = item.dropdown ? geometry.height : geometry.header?.bottom || 0;
    expect(item.box.bottom, `${item.name} is outside the header or dropdown viewport. ${diagnostic}`).toBeLessThanOrEqual(bottom + 1);
  }
  for (const group of [geometry.slots, geometry.controls]) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i].box; const b = group[j].box;
      if (!a || !b) continue;
      const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(overlapWidth > 1 && overlapHeight > 1, `${group[i].name} overlaps ${group[j].name}. ${diagnostic}`).toBe(false);
    }
  }
}

for (const source of [{ file: "index.html", path: "/", name: "home" }, { file: "noticias.html", path: "/noticias.html", name: "news" }]) {
  for (const viewport of [{ width: 1440, height: 900, suffix: "wide" }, { width: 1280, height: 800, suffix: "enabled" }, { width: 1024, height: 768, suffix: "tablet" }, { width: 390, height: 844, suffix: "mobile" }]) {
    test(`account entry preserves header controls: ${source.name} ${viewport.width}px`, async ({ page, baseURL }) => {
      const origin = new URL(baseURL!).origin;
      const html = withAccountLink(readFileSync(source.file, "utf8"), true);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // Only project the main HTML; original fonts, images and scripts load normally.
      await page.route(url => url.origin === origin && url.pathname === source.path, async route => {
        const request = route.request();
        if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return route.continue();
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      });
      await page.goto(source.path, { waitUntil: "domcontentloaded" });
      const account = page.locator('header [data-gamezone-account="true"]');
      await expect(account).toHaveCount(1);
      await expect(account).toHaveAttribute("href", "/cuenta.html");
      if (viewport.width > 1200) {
        await expect(account).toBeVisible();
        expect((await page.locator("header .search-container").boundingBox())!.width).toBeGreaterThanOrEqual(140);
      }
      else await expect(account).toBeHidden();
      await page.evaluate(async () => { await document.fonts.load('italic 42px "SnesItalic"'); await document.fonts.ready; });
      const animated = page.locator(".loading");
      if (await animated.count()) {
        await expect(animated.last()).toHaveClass(/\bloaded\b/);
        await expect(animated.last()).toHaveCSS("opacity", "1");
      }
      if (source.name === "home") await expect(page.locator(".hero-logo")).toHaveCSS("opacity", "1");
      if (viewport.width >= 1440) {
        for (const selector of ["header .header-content", "header .nav", "header .nav-menu"]) await expect(page.locator(selector)).toHaveCSS("column-gap", "32px");
      }
      const closed = await measureHeader(page);
      const toggle = page.locator("header .mobile-menu-toggle");
      if (viewport.width <= 1200) {
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await expect(account).toBeVisible();
        await expect(page.locator("header .nav-menu a").first()).toBeFocused();
      }
      const opened = await measureHeader(page);
      mkdirSync(".data/qa", { recursive: true });
      await page.screenshot({ path: `.data/qa/${source.name}-account-${viewport.suffix}.png`, fullPage: false });
      await test.info().attach("header-geometry", { body: JSON.stringify({ closed, opened }, null, 2), contentType: "application/json" });
      assertHeaderGeometry(closed);
      assertHeaderGeometry(opened);
      if (viewport.width <= 1200) {
        await page.keyboard.press("Escape");
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(toggle).toBeFocused();
        await expect(account).toBeHidden();
        await toggle.click();
        await page.mouse.click(2, viewport.height - 2);
        await expect(account).toBeHidden();
        await toggle.click();
        await page.setViewportSize({ width: 1280, height: 800 });
        await expect(account).toBeVisible();
        await expect(toggle).toBeHidden();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator("header .nav-menu")).not.toHaveCSS("position", "fixed");
        expect(await page.locator("#kofi-widget-container").evaluate(element => element.parentElement?.classList.contains("nav"))).toBe(true);
        assertHeaderGeometry(await measureHeader(page));
      }
    });
  }
}

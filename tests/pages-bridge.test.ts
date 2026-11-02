import { runInNewContext } from "node:vm";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { pagesBridgeDestination, pagesBridgeOrigin, renderPagesBridge, validatePagesBridgeOrigin } from "../src/modules/legacy/pages-bridge";

describe("optional GitHub Pages bridge", () => {
  it.each([
    ["/GameZone/", "", "", "/"],
    ["/GameZone", "", "", "/"],
    ["/GameZone/index.html", "", "", "/index.html"],
    ["/GameZone/games/peak/peak.html", "?from=home&tag=co-op", "#requisitos", "/games/peak/peak.html?from=home&tag=co-op#requisitos"],
    ["/GameZone/buscar.html", "?q=Metal%20Gear%20%26%20Snake", "#resultados", "/buscar.html?q=Metal%20Gear%20%26%20Snake#resultados"],
    ["/GameZoneX/games.html", "", "", "/GameZoneX/games.html"],
    ["/games/peak/peak.html", "", "", "/games/peak/peak.html"],
  ])("preserves the route, query and fragment for %s", (pathname, search, hash, suffix) => {
    expect(pagesBridgeDestination(pathname, search, hash)).toBe(`${pagesBridgeOrigin}${suffix}`);
    const $ = load(renderPagesBridge("/"));
    let destination = "";
    const link = { href: "" };
    runInNewContext($("script").text(), {
      URL, document: { getElementById: () => link },
      window: { location: { pathname, search, hash, replace: (href: string) => { destination = href; } } },
    });
    expect(destination).toBe(`${pagesBridgeOrigin}${suffix}`);
    expect(link.href).toBe(destination);
  });

  it.each(["//evil.example/x", "/GameZone//evil.example/x", "/GameZone/\\evil.example/x", "/GameZone/%2f%2fevil.example/x", "https://evil.example/x"])("keeps an attacker-controlled path on the production origin: %s", pathname => {
    expect(new URL(pagesBridgeDestination(pathname, "?next=https://evil.example", "#https://evil.example")).origin).toBe(pagesBridgeOrigin);
  });

  it.each(["https://evil.example", "//gamezone-impaul17.netlify.app", "http://gamezone-impaul17.netlify.app", "https://gamezone-impaul17.netlify.app/", "https://user@gamezone-impaul17.netlify.app", "https://gamezone-impaul17.netlify.app/path"])("rejects an unreviewed deployment destination: %s", target => {
    expect(() => validatePagesBridgeOrigin(target)).toThrow();
    expect(() => renderPagesBridge("/", target)).toThrow();
  });

  it("provides an accessible original-style fallback and matching canonical", () => {
    const $ = load(renderPagesBridge("/games/peak/peak.html"));
    expect($("html").attr("lang")).toBe("es");
    expect($("title").text()).toContain("GameZone");
    expect($("#continue").attr("href")).toBe(`${pagesBridgeOrigin}/games/peak/peak.html`);
    expect($('link[rel="canonical"]').attr("href")).toBe($("#continue").attr("href"));
    expect($("style").text()).toContain("#6eb92b");
    expect($("style").text()).toContain("SnesItalic");
    expect($("noscript").length).toBeGreaterThan(0);
  });

  it("lets unknown old routes preserve their path instead of refreshing to home before JavaScript", () => {
    const $ = load(renderPagesBridge("/", pagesBridgeOrigin, true));
    expect($('meta[http-equiv="refresh"]')).toHaveLength(0);
    expect($('link[rel="canonical"]')).toHaveLength(0);
    expect($("#continue").attr("href")).toBe(`${pagesBridgeOrigin}/`);
    expect($("script").text()).toContain("current.pathname");
  });
});

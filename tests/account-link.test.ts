import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { withAccountLink } from "../src/modules/legacy/account-link";

describe("optional account entry preserves the original public HTML", () => {
  it.each(["index.html", "games.html", "noticias.html", "hall-of-fame.html", "games/peak/peak.html"])("keeps %s byte-identical when account access is disabled", async (file) => {
    const source = await readFile(file, "utf8");
    expect(withAccountLink(source, false)).toBe(source);
  });

  it.each(["index.html", "games.html", "noticias.html", "hall-of-fame.html", "games/peak/peak.html"])("adds only the marked account entry and mobile helper to %s", async (file) => {
    const source = await readFile(file, "utf8");
    const rendered = withAccountLink(source, true);
    const $ = load(rendered);
    const account = $('[data-gamezone-account="true"]');
    expect(account).toHaveLength(1);
    expect(account.attr("href")).toBe("/cuenta.html");
    expect(account.attr("aria-label")).toBe("Mi cuenta");
    expect(account.hasClass("nav-link")).toBe(true);
    expect(account.closest("ul.nav-menu")).toHaveLength(1);
    expect(account.closest("li").next()).toHaveLength(0);
    expect($('script[data-gamezone-account-navigation="true"]')).toHaveLength(1);
    expect($("a.discord-btn").first().attr("href")).toBe(load(source)("a.discord-btn").first().attr("href"));
    const start = rendered.lastIndexOf("<li", rendered.indexOf('data-gamezone-account="true"'));
    const end = rendered.indexOf("</li>", start) + "</li>\n".length;
    const withoutEntry = rendered.slice(0, start) + rendered.slice(end);
    expect(withoutEntry.replace(/<script data-gamezone-account-navigation="true">[\s\S]*?<\/script>\n/, "")).toBe(source);
  });

  it("is idempotent when the same page passes through the account adapter twice", async () => {
    const source = await readFile("noticias.html", "utf8");
    const once = withAccountLink(source, true);
    expect(withAccountLink(once, true)).toBe(once);
    expect(load(once)('[data-gamezone-account="true"]')).toHaveLength(1);
    expect(load(once)('script[data-gamezone-account-navigation="true"]')).toHaveLength(1);
    expect(withAccountLink(once, false)).toBe(once);
  });

  it("leaves pages without the original Discord entry untouched", async () => {
    const source = await readFile("secret.html", "utf8");
    expect(withAccountLink(source, true)).toBe(source);
  });
});

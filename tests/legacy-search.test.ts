import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("buscador HTML conservado", () => {
  it("muestra la consulta desconocida como texto, sin interpolarla en HTML", () => {
    const html = readFileSync("buscar.html", "utf8");
    const displayFunction = html.slice(html.indexOf("function displayResults("), html.indexOf("function createGameCard("));
    const elements = new Map<string, { innerHTML: string; textContent: string }>();
    const getElementById = (id: string) => {
      if (!elements.has(id)) elements.set(id, { innerHTML: "", textContent: "" });
      return elements.get(id)!;
    };
    const payload = '<img src=x onerror="alert(1)">';
    runInNewContext(`${displayFunction}; displayResults([], query);`, {
      document: { getElementById }, query: payload,
      getSearchSuggestions: () => [], gamesDatabase: [], createGameCard: () => "",
    });
    expect(getElementById("resultsContainer").innerHTML).not.toContain(payload);
    expect(getElementById("noResultsQuery").textContent).toBe(payload);
  });
});

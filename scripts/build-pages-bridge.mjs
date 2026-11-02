import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pagesBridgeOrigin, renderPagesBridge, validatePagesBridgeOrigin } from "../src/modules/legacy/pages-bridge.ts";

const root = process.cwd();
const output = resolve(root, ".data/pages-bridge");
const target = validatePagesBridgeOrigin(process.env.PAGES_BRIDGE_TARGET ?? pagesBridgeOrigin);
const originals = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith(".html")).map(entry => entry.name);

async function gamePages(directory, relative) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await gamePages(join(directory, entry.name), `${relative}/${entry.name}`));
    else if (entry.isFile() && entry.name.endsWith(".html")) result.push(`${relative}/${entry.name}`);
  }
  return result;
}

originals.push(...await gamePages(join(root, "games"), "games"));
const routes = [...new Set([...originals, "cuenta.html", "admin/index.html", "404.html"])].sort();
for (const route of routes) {
  const file = resolve(output, route);
  if (!file.startsWith(`${output}\\`) && !file.startsWith(`${output}/`)) throw new Error("Ruta de salida fuera del directorio del puente.");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, renderPagesBridge(route === "404.html" ? "/" : `/${route}`, target, route === "404.html"), "utf8");
}
await mkdir(join(output, "fonts"), { recursive: true });
await copyFile(join(root, "public/fonts/SnesItalic.ttf"), join(output, "fonts/SnesItalic.ttf"));
await writeFile(join(output, ".nojekyll"), "");
console.log(`Puente preparado: ${originals.length} páginas originales, ${routes.length} páginas en total → ${target}`);

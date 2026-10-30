import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createSupabaseMigrationClient, migrateCatalog, MigrationError } from "./lib/migrate-catalog.mjs";

const usage = `Migrar el catálogo SQLite a Supabase sin sobrescribir datos.

node --experimental-strip-types scripts/migrate-to-supabase.mjs [opciones]

  --dry-run                 Comprobar origen y destino sin escribir (predeterminado).
  --apply                   Aplicar una única RPC transaccional y verificar el resultado.
  --database <archivo>      SQLite existente; por defecto GAMEZONE_DATABASE_PATH o .data/gamezone.db.
  --env-file <archivo>      Archivo privado de entorno; por defecto .env.local si existe.
  --help                    Mostrar esta ayuda.

Aplica primero las migraciones SQL 202610300001 y 202610300002.
Detén las escrituras editoriales locales durante la transferencia.
Las credenciales se leen del entorno y no se muestran. Esta herramienta no activa Supabase en la web.`;

export function parseMigrationArguments(arguments_) {
  const options = { apply: false, databasePath: undefined, envFile: undefined, help: false };
  let explicitDryRun = false;
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (argument === "--dry-run") explicitDryRun = true;
    else if (argument === "--database" || argument === "--env-file") {
      const value = arguments_[++index];
      if (!value || value.startsWith("--")) throw new MigrationError("arguments", "Falta el archivo de una opción. Consulta --help.");
      options[argument === "--database" ? "databasePath" : "envFile"] = value;
    } else throw new MigrationError("arguments", "Opción desconocida. Consulta --help; no pases claves ni contraseñas como argumentos.");
  }
  if (options.apply && explicitDryRun) throw new MigrationError("arguments", "Elige --dry-run o --apply, no ambos.");
  return options;
}

/** An explicitly named private file is authoritative; never mix its key with another project's URL. */
export function loadMigrationEnvironment(filename = ".env.local", explicit = false, inherited = process.env) {
  let values = {};
  if (existsSync(filename)) {
    try { values = parseEnv(readFileSync(filename, "utf8")); }
    catch { throw new MigrationError("configuration", "No se pudo leer el archivo privado de entorno."); }
  } else if (explicit) throw new MigrationError("configuration", "El archivo privado de entorno solicitado no existe.");
  if (explicit && (!values.NEXT_PUBLIC_SUPABASE_URL || !values.SUPABASE_SECRET_KEY)) throw new MigrationError("configuration", "El archivo privado solicitado debe incluir NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY del mismo proyecto.");
  return {
    url: explicit ? values.NEXT_PUBLIC_SUPABASE_URL : inherited.NEXT_PUBLIC_SUPABASE_URL ?? values.NEXT_PUBLIC_SUPABASE_URL,
    key: explicit ? values.SUPABASE_SECRET_KEY : inherited.SUPABASE_SECRET_KEY ?? values.SUPABASE_SECRET_KEY,
    databasePath: values.GAMEZONE_DATABASE_PATH || inherited.GAMEZONE_DATABASE_PATH || ".data/gamezone.db",
  };
}

async function main() {
  try {
    const options = parseMigrationArguments(process.argv.slice(2));
    if (options.help) { console.log(usage); return; }
    const environment = loadMigrationEnvironment(options.envFile || ".env.local", Boolean(options.envFile));
    const client = createSupabaseMigrationClient(environment);
    console.log(`Destino: ${new URL(environment.url).hostname}. Credenciales privadas ocultas.`);
    const result = await migrateCatalog({ databasePath: options.databasePath || environment.databasePath, client, apply: options.apply });
    console.log(`${result.mode === "apply" ? "Aplicación" : "Dry-run"}: ${result.total} fichas (${result.published} publicadas), ${result.insert} nuevas, ${result.identical} idénticas, ${result.conflicts.length} conflictos.`);
    console.log(`SHA-256 del snapshot: ${result.hash}`);
    if (result.blocked) {
      for (const conflict of result.conflicts) console.error(`Conflicto ${conflict.id} (${conflict.slug}): ${conflict.reason}`);
      console.error("No se ha escrito ni sobrescrito ningún registro. Resuelve los conflictos antes de migrar.");
      process.exitCode = 2;
    } else if (result.verified) {
      console.log("Transferencia verificada por contenido, identidad, revisión, publicación, origen y reserva de slug.");
      console.log("La copia privada está en .data/migrations/. Conserva SQLite y completa las comprobaciones de acceso antes del cambio de entorno.");
    } else if (result.mode === "dry-run") console.log("No se han escrito datos locales ni remotos. Usa --apply después de revisar el resultado.");
  } catch (error) {
    console.error(error instanceof MigrationError ? error.message : "No se pudo completar la migración. Se ha omitido el detalle interno para no exponer información privada.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

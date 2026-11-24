/**
 * tests/ranuraUnificada.test.ts — LA RANURA SIN MARCAS AJENAS (v1.80.0)
 * =====================================================================
 * Congela el pedido de Mario 27/10: «no quiero que aparezca [la app externa] en
 * CerebroNico, pero sí su funcionamiento». Dos mitades:
 *   · LA CARA: ni la ranura ni el selector nombran productos terceros;
 *   · EL FUNCIONAMIENTO: el export {keys:[{platform,key}]} sigue entrando y se
 *     reparte por las ranuras equivalentes, con avisos honestos (comando ≠
 *     clave; plataforma sin ranura se nombra, no se ignora en silencio).
 */
import * as fs from "node:fs";
import * as assert from "node:assert";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NOMBRE_RANURA,
  ETIQUETA_CARPETA_MODELOS,
  leerExportDeClaves,
  esComandoDeArranque,
} from "../src/engine/ranuraUnificada";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });
const lee = (r: string) => fs.readFileSync(new URL("../" + r, import.meta.url), "utf8");

prueba("el export estándar se reparte por las ranuras de la IDE", () => {
  const r = leerExportDeClaves({ version: 1, source: "cualquiera", keys: [
    { platform: "google", key: "AQ.un-valor-largo-simulado" },
    { platform: "mistral", key: "mstrl_un-valor-largo-simulado" },
    { platform: "openrouter", key: "sk-or-un-valor-largo-simulado" },
  ] });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.claves.map((c) => c.proveedor).sort(), ["gemini", "mistral", "openrouter"]);
});

prueba("guarda honesta: un comando de arranque no es una clave (caso real ollama)", () => {
  assert.strictEqual(esComandoDeArranque("set OLLAMA_ORIGINS=* && ollama serve"), true);
  const r = leerExportDeClaves({ keys: [{ platform: "ollama", key: "set OLLAMA_ORIGINS=* && ollama serve" }] });
  const e = r.entradas[0];
  assert.strictEqual(e.estado, "ignorada");
  assert.ok(e.aviso.includes("no es una clave"), e.aviso);
});

prueba("plataforma sin ranura: se AVISA por su nombre, nunca se pierde en silencio", () => {
  const r = leerExportDeClaves({ keys: [{ platform: "xiaomi", key: "sk-un-valor-largo-de-frente" }] });
  assert.strictEqual(r.entradas[0].estado, "sin-ranura");
  assert.ok(r.entradas[0].aviso.includes("xiaomi"), r.entradas[0].aviso);
});

// v1.97.3 · LA BARRA COMPLETA: la marca externa no puede renacer en NINGÚN
// archivo de la superficie de código (UI, motor, servidor, scripts), no solo en
// los dos componentes donde nació la queja. Se recorre el árbol; se excluyen los
// directorios que no son nuestra cara (deps, artefactos, y el espejo de
// documentación exportada, que es una foto de un turno, no el producto).
const MARCA_EXTERNA = "freellm";
const EXTENSIÓN_CODIGO = /\.(ts|tsx|js|mjs|cjs|json|html)$/i;
const SIN_CARA = new Set(["node_modules", ".git", "dist", "build", "out", "__pycache__", "vendor", "skills", "memoria_history", "espejos_servidor", "extensions", ".revisiones"]);
function barrerMarca(raiz: string, acc: string[] = []): string[] {
  for (const it of fs.readdirSync(raiz, { withFileTypes: true })) {
    if (it.name.startsWith(".") || SIN_CARA.has(it.name)) continue;
    const abs = raiz + "/" + it.name;
    if (it.isDirectory()) barrerMarca(abs, acc);
    else if (EXTENSIÓN_CODIGO.test(it.name) && !/EXPORT-CONTEXTO/.test(it.name)) acc.push(abs);
  }
  return acc;
}

prueba("LA CARA: la marca externa no aparece en toda la superficie de código", () => {
  assert.ok(NOMBRE_RANURA === "API Unificada" && ETIQUETA_CARPETA_MODELOS.includes("Unificada"));
  // v1.97.4 · fileURLToPath, NO `.pathname`: en Windows pathname entrega la ruta
  // percent-encoded y con separadores ajenos (ENOENT scandir 'C:\C:\Users\…' —
  // el rojo real de la sesión del 31/10). fileURLToPath decodifica y usa los
  // separadores del sistema; `join` hace la concatenación portátil.
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const ficheros = [...barrerMarca(join(raiz, "src")), ...barrerMarca(join(raiz, "server")), ...barrerMarca(join(raiz, "scripts"))];
  assert.ok(ficheros.length >= 40, `la barrida no puede leerse con el árbol vacío: ${ficheros.length}`);
  const manchados = ficheros.filter((f) => fs.readFileSync(f, "utf8").toLowerCase().includes(MARCA_EXTERNA));
  assert.deepStrictEqual(manchados, [], "la marca externa renació en: " + manchados.join(", "));
  // Los dos componentes del selector se nombran igual que antes (la queja original).
  for (const f of ["src/components/ApiKeyModal.tsx", "src/components/ModelSelectorModal.tsx"]) {
    assert.ok(!fs.readFileSync(new URL("../" + f, import.meta.url), "utf8").toLowerCase().includes(MARCA_EXTERNA), `${f} todavía nombra la marca externa`);
  }
  const ejemplo = lee("ejemplos/api-unificada-claves.EJEMPLO.json");
  assert.ok(!/sk-or-v1-[0-9a-f]{20,}|AQ\.Ab8|mstrl_[A-Za-z0-9]{20,}/.test(ejemplo), "el ejemplo trae una clave real: NO EMPAQUETAR");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nranuraUnificada: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);

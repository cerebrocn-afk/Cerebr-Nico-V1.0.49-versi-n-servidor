#!/usr/bin/env node
/**
 * inventario-herramientas.mjs — QUÉ PUEDE HACER EL IDE DE VERDAD (v1.96.0)
 * ========================================================================
 * Lista cerrada de herramientas LLAMABLES, leída de las cuatro bocas reales:
 *   · `src/engine/toolRegistry.ts`  → `name: "..."`
 *   · `server.ts`                   → `case "...":`
 *   · `scripts/creador_daemon.py`   → MANIFIESTO
 *   · `scripts/hindsight_daemon.py` → MANIFIESTO
 *
 * Por qué existe: las skills nuevas prometen recetas con herramientas. Si una skill
 * menciona una herramienta que no está en ninguna de estas cuatro listas, la receta es
 * humo y la puerta tiene que decirlo. Mejor una valla que 100 disculpas.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Nombres de proveedores de modelo: son enrutado interno del server, NO herramientas que el modelo llame. */
export const NO_SON_HERRAMIENTAS = new Set([
  "openai", "gemini", "groq", "mistral", "deepseek", "cerebras", "openrouter", "together", "fireworks", "zai",
]);

function leer(raiz, relativa) {
  return readFileSync(path.join(raiz, relativa), "utf8");
}

/** Recorta el bloque `MANIFIESTO = [ ... ]` del daemon para no pescar `"name"` de cualquier lado. */
function bloqueManifiesto(codigo) {
  const inicio = codigo.indexOf("MANIFIESTO = [");
  if (inicio < 0) return "";
  let nivel = 0, fin = -1;
  for (let i = codigo.indexOf("[", inicio); i < codigo.length; i++) {
    if (codigo[i] === "[") nivel++;
    else if (codigo[i] === "]") { nivel--; if (nivel === 0) { fin = i; break; } }
  }
  return fin < 0 ? codigo.slice(inicio) : codigo.slice(inicio, fin + 1);
}

/** Devuelve `{ todas: Set, origen: Record<nombre, string[]> }`. */
export function inventarioHerramientas(raiz = process.cwd()) {
  const origen = {};
  const anotar = (nombre, de) => {
    if (!nombre || NO_SON_HERRAMIENTAS.has(nombre)) return;
    (origen[nombre] = origen[nombre] || []).push(de);
  };

  // v1.97.0 · las maquinas nuevas viven en modulos propios (`herramientaPdf/Docx/Zip/Puente.ts`)
  // y al monolito se montan como `SPEC_… as any`. Si el inventario no las lee, una receta cierta
  // queda fuera del mapa y las skills que la citan fallan por culpa de la valla, no del contrato.
  for (const modulo of ["herramientaPdf", "herramientaDocx", "herramientaZip", "herramientaPuente"]) {
    const ruta = path.join("src", "engine", `${modulo}.ts`);
    if (!existsSync(path.join(raiz, ruta))) continue;
    for (const m of leer(raiz, ruta).matchAll(/name:\s*"([a-z_0-9]+)"/g)) anotar(m[1], ruta);
  }
  for (const m of leer(raiz, "src/engine/toolRegistry.ts").matchAll(/name:\s*"([a-z_0-9]+)"/g)) anotar(m[1], "toolRegistry");
  for (const m of leer(raiz, "server.ts").matchAll(/case\s*"([a-z_0-9]+)"\s*:/g)) anotar(m[1], "server.ts");
  for (const archivo of ["scripts/creador_daemon.py", "scripts/hindsight_daemon.py"]) {
    const bloque = bloqueManifiesto(leer(raiz, archivo));
    for (const m of bloque.matchAll(/"name":\s*"([a-z_0-9]+)"/g)) anotar(m[1], path.basename(archivo));
  }
  return { todas: new Set(Object.keys(origen)), origen };
}

if (process.argv[1] && process.argv[1].endsWith("inventario-herramientas.mjs")) {
  const { todas, origen } = inventarioHerramientas();
  const porOrigen = {};
  for (const n of Object.keys(origen)) for (const o of origen[n]) (porOrigen[o] = porOrigen[o] || []).push(n);
  console.log("herramientas llamadas:", todas.size);
  for (const o of Object.keys(porOrigen).sort()) console.log(`  ${o}: ${porOrigen[o].length}`);
  console.log([...todas].sort().join(" "));
}

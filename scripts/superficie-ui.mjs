#!/usr/bin/env node
/**
 * superficie-ui.mjs — EL INVENTARIO DE LA INTERFAZ (v1.0.13)
 * ===========================================================
 * Pedido de Mario (09/11): «quiero seguir limpiando la interfaz, ej botones o
 * funciones que ya son por defecto quitarlas, ej funciones dobles». La cultura
 * de la casa no permite cortar por sensación: PRIMERO el número, DESPUÉS la
 * tijera. Este script recorre `src/components/*.tsx` + `App.tsx` y produce
 * `SUPERFICIE_UI.md` con:
 *
 *   1. el inventario de acciones de UI (componente · handler · endpoint · rótulo)
 *   2. los GRUPOS DUPLICADOS: el mismo endpoint invocado desde varios sitios
 *   3. los candidatos a «ya es por defecto»: endpoints que el motor ejecuta
 *      SOLO desde v1.0.10+ (diccionario AUTO, con la evidencia versionada) —
 *      el botón sigue vivo hasta que Mario lo borre con la planilla en mano.
 *
 * Uso:  node scripts/superficie-ui.mjs            → genera SUPERFICIE_UI.md
 *       node scripts/superficie-ui.mjs --verificar→ existe y no está vago (para CI)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
const RAIZ = (() => { try { return decodeURIComponent(new URL(import.meta.url).pathname); } catch { return String(process.argv[1] || "."); } })().replace(/^\/([A-Za-z]:)/, "$1").replace(/[/\\]scripts[/\\]superficie-ui\.mjs$/, "");

/**
 * Lo que el motor YA hace solo (con la versión que lo trajo como evidencia).
 * Un botón que llama esto sigue teniendo derecho a existir (escape del humano),
 * pero la planilla lo marca: si molesta, es el primero de la lista.
 */
const AUTO = {
  "/api/sandbox/start": "v1.87+ `prepararArranque` levanta y reinicia el :3500 solo al pedir preview («ya corre ≠ corre lo tuyo»)",
  "/api/sandbox/stop": "el apagado del IDE limpia el puerto (killPortListeners en arranque)",
  "/api/bridge/restart": "v1.0.1 «Expulsar» + mataporto limpió el ciclo reiniciar-a-mano; el puente caído ahora se DECLARA con camino correcto (v1.0.10)",
  "/api/sandbox/verify-preview": "v1.0.10 el balise de estado muestra qué se sirve sin pedir permiso",
  "/api/sandbox/flatten-root": "v1.0.12 obraCurso abre la carpeta de obra sola en la piedra fundacional",
  "/api/quirofano/estado": "v1.0.10 write_file ya pega el último cierre en su propia respuesta",
  "/api/ollama/expulsar": "el relevo local elige solo qué modelo local tentar (v1.56+)",
};

const SKIP = new Set(["AppBackground.tsx", "BootSplash.tsx", "BrainThinkingIcon.tsx", "FondoLayer.tsx", "GlobalErrorBoundary.tsx"]);

const archivos = [];
for (const carp of ["src/components", "src"]) {
  const dir = path.join(RAIZ, carp);
  if (!existsSync(dir)) continue;
  if (carp === "src") {
    for (const f of ["App.tsx"]) if (existsSync(path.join(dir, f))) archivos.push(path.join(dir, f));
  } else for (const f of readdirSync(dir)) if (f.endsWith(".tsx") && !SKIP.has(f)) archivos.push(path.join(dir, f));
}

const filas = [];
const reFetch = /["'`](\/api\/[A-Za-z0-9_\-./]+)["'`]/g;
for (const abs of archivos) {
  const texto = readFileSync(abs, "utf8");
  const lineas = texto.split(/\r?\n/);
  const rel = path.relative(RAIZ, abs).replace(/\\/g, "/");
  for (let i = 0; i < lineas.length; i++) {
    reFetch.lastIndex = 0;
    let m;
    while ((m = reFetch.exec(lineas[i]))) {
      const endpoint = m[1].split("?")[0].replace(/\$\{[^}]*\}/g, ":var");
      // ventana de contexto: handler (handle*/const X =) y rótulos cercanos
      const ven = lineas.slice(Math.max ? 0 : Math.max(0, i - 14), i + 8).join("\n");
      const h = ven.match(/(?:const|function)\s+(handle[A-Za-z0-9_]+|[A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g);
      const handler = h && h.length ? h[h.length - 1].replace(/.*?(?:const|function)\s+/, "").replace(/\s*=.*$/, "") : "?";
      const rot = ven.match(/title=[{"']([^"'{}]+)[}"']|>([A-ZÁÉÍÓÚÑ][^<>{}]{2,44})</g);
      const rotulo = rot && rot.length ? (rot[rot.length - 1].match(/title=["']([^"']+)/) || rot[rot.length - 1].match(/>([^<]+)/) || [])[1] : "";
      filas.push({ comp: path.basename(rel), rel, linea: i + 1, endpoint, handler, rotulo: (rotulo || "").trim().slice(0, 44) });
    }
  }
}

const porEndpoint = new Map();
for (const f of filas) {
  if (!porEndpoint.has(f.endpoint)) porEndpoint.set(f.endpoint, []);
  porEndpoint.get(f.endpoint).push(f);
}
const duplicados = [...porEndpoint.entries()].filter(([, v]) => new Set(v.map((x) => x.comp)).size > 1).sort((a, b) => b[1].length - a[1].length);

const hoy = new Date().toISOString().slice(0, 10);
const l = [];
l.push("# SUPERFICIE UI — inventario de la interfaz (GENERADO: no editar a mano)");
l.push("");
l.push(`> Generado por \`scripts/superficie-ui.mjs\` el ${hoy}. Ventana de contexto ±14 líneas: el rótulo y el handler son la mejor lectura cercana;`);
l.push("> la verdad dura es componente · línea · endpoint. Pedir un botón concreto: `grep -n` en el archivo que figura acá.");
l.push("");
l.push(`## Cifras`);
l.push(`- componentes analizados: ${archivos.length}`);
l.push(`- llamadas a /api encontradas: ${filas.length}`);
l.push(`- endpoints distintos: ${porEndpoint.size}`);
l.push(`- endpoints con DOBLE/SIMPLE instancia de UI (mismo endpoint desde ≥2 componentes): ${duplicados.length}`);
l.push("");
l.push(`## Los duplicados (primer objetivo de la limpieza de Mario)`);
l.push("");
l.push(`| endpoint | sitios | desde | ya es automático desde… |`);
l.push(`|---|---|---|---|`);
for (const [ep, v] of duplicados) {
  const comps = [...new Set(v.map((x) => x.comp))].join(", ");
  l.push(`| \`${ep}\` | ${v.length} | ${comps} | ${AUTO[ep] ? `**${AUTO[ep]}**` : "— (manual puro: preguntar a Mario antes de tocar)"} |`);
}
l.push("");
l.push(`## Inventario completo (componente · línea · endpoint · handler · rótulo)`);
l.push("");
l.push(`| componente:línea | endpoint | handler | rótulo |`);
l.push(`|---|---|---|---|`);
for (const f of filas.sort((a, b) => a.endpoint.localeCompare(b.endpoint) || a.comp.localeCompare(b.comp))) {
  l.push(`| ${f.comp}:${f.linea} | \`${f.endpoint}\` | ${f.handler} | ${f.rotulo.replace(/\|/g, "/") || "—"} |`);
}
l.push("");
l.push(`## Regla de uso`);
l.push(`1. Antes de BORRAR un botón: su fila debe estar marcada por Mario en la columna de decisión (esta planilla es oferta, no sentencia).`);
l.push(`2. Antes de MOVER uno «a otro lado»: el atajo que salve clics en la barra de tareas vale más que la pureza visual.`);
l.push(`3. Regenerar tras cualquier cambio de UI: \`node scripts/superficie-ui.mjs\`.`);
const destino = path.join(RAIZ, "SUPERFICIE_UI.md");
writeFileSync(destino, l.join(os.EOL) + os.EOL, "utf8");
console.log(`[superficie-ui] ${filas.length} llamadas · ${porEndpoint.size} endpoints · ${duplicados.length} grupos duplicados → ${path.basename(destino)}`);

if (process.argv.includes("--verificar")) {
  if (!existsSync(destino) || statSync(destino).size < 500) {
    console.log("superficie-ui: FALTA el inventario o está vago. Ejecutar: node scripts/superficie-ui.mjs");
    process.exit(1);
  }
  const mtime = statSync(destino).mtimeMs;
  let desactualizado = false;
  for (const abs of archivos) if (statSync(abs).mtimeMs > mtime + 1000) { desactualizado = true; break; }
  if (desactualizado) { console.log("superficie-ui: DESACTUALIZADO (algún componente cambió después del inventario). Regenerar."); process.exit(1); }
  console.log("superficie-ui: inventario presente y fresco.");
  process.exit(0);
}

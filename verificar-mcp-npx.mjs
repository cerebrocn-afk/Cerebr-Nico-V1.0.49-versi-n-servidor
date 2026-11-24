/**
 * verificar-mcp-npx.mjs — PRUEBA DE LA CURA v1.0.42
 * ==================================================
 * Comprueba, con hechos y no con opiniones, las dos mitades del arreglo:
 *
 *   1. RESOLUCIÓN: `npx` (sin extensión) se resuelve al archivo REAL del PATH
 *      (npx.cmd). Antes devolvía null y el lanzamiento moría con ENOENT.
 *   2. LANZAMIENTO: un `.cmd` se ejecuta con `cmd.exe /d /s /c` y responde.
 *      Antes, `spawn("npx", …, {shell:false})` daba «comando no encontrado».
 *
 * No importa el módulo TypeScript (requiere compilación): replica las dos
 * funciones con el MISMO algoritmo y las mide contra el sistema real. Si el
 * algoritmo del módulo y este divergen, la prueba deja de ser válida — por eso
 * las dos viven pegadas y con los mismos nombres.
 *
 * Uso:  node verificar-mcp-npx.mjs
 * Sale 0 si las dos mitades pasan; 1 si alguna falla (con el motivo).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ── Réplica exacta de resolverEjecutableWindows (clienteMcp.ts) ──────────────
function resolverEjecutableWindows(comando) {
  if (process.platform !== "win32") return null;
  const tieneRuta = comando.includes("/") || comando.includes("\\");
  if (tieneRuta) return fs.existsSync(comando) ? comando : null;
  const exts = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => Boolean(e));
  const dirs = (process.env.PATH || "").split(path.delimiter).filter((d) => Boolean(d));
  const yaTieneExt = exts.some((e) => comando.toLowerCase().endsWith(e));
  // Mismo orden que el módulo: extensiones de PATHEXT PRIMERO, nombre pelado al final.
  const candidatos = yaTieneExt
    ? [comando]
    : [...exts.map((e) => comando + e), comando];
  for (const dir of dirs) {
    for (const nombre of candidatos) {
      const ruta = path.join(dir, nombre);
      try {
        if (fs.existsSync(ruta) && fs.statSync(ruta).isFile()) return ruta;
      } catch {
        /* directorio ilegible: se sigue */
      }
    }
  }
  return null;
}

function esScriptCmd(ruta) {
  const bajo = ruta.toLowerCase();
  return bajo.endsWith(".cmd") || bajo.endsWith(".bat");
}

function citarParaCmd(arg) {
  const s = String(arg);
  if (s === "" || /[\s&|<>^()"]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// ── Arnes de la prueba ──────────────────────────────────────────────────────
const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? "OK  " : "FALLA"} · ${nombre}${detalle ? " — " + detalle : ""}`);
}

// MITAD 1 — resolución
const resuelto = resolverEjecutableWindows("npx");
comprobar(
  "npx se resuelve a un archivo real del PATH",
  Boolean(resuelto) && fs.existsSync(resuelto),
  resuelto || "no se encontró (esto es el bug original)"
);

comprobar(
  "el resuelto es un script de cmd (.cmd/.bat) y por eso necesita cmd.exe",
  Boolean(resuelto) && esScriptCmd(resuelto),
  resuelto ? path.extname(resuelto) : "sin resolución"
);

// Un .exe debe resolverse igual y NO necesitar cmd.exe
const resueltoNode = resolverEjecutableWindows("node");
comprobar(
  "node se resuelve y NO es script de cmd (se lanza directo)",
  Boolean(resueltoNode) && !esScriptCmd(resueltoNode),
  resueltoNode || "no se encontró"
);

// Un comando inexistente debe devolver null, no inventar una ruta
comprobar(
  "un comando inexistente devuelve null (no inventa)",
  resolverEjecutableWindows("comando-que-no-existe-cn-12345") === null,
  "null"
);

// MITAD 2 — lanzamiento real
if (resuelto && esScriptCmd(resuelto)) {
  const args = ["--version"];
  const linea = [resuelto, ...args].map(citarParaCmd).join(" ");
  const comSpec = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
  const r = spawnSync(comSpec, ["/d", "/s", "/c", '"' + linea + '"'], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
    shell: false,
    windowsVerbatimArguments: true, // la línea ya viene entrecomillada a mano
  });
  const salida = ((r.stdout || "") + (r.stderr || "")).trim();
  comprobar(
    "cmd.exe /d /s /c <npx.cmd> --version responde (el lanzamiento funciona)",
    r.status === 0 && salida.length > 0,
    `exit=${r.status} salida=${JSON.stringify(salida.slice(0, 60))}`
  );

  // La prueba del DEFECTO: spawn sin shell sobre "npx" pelado debe fallar.
  // Si esto pasara, el bug no existiría y la cura no haría falta.
  const directo = spawnSync("npx", ["--version"], {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
    shell: false,
  });
  comprobar(
    "spawn('npx', {shell:false}) FALLA — confirma que el defecto era real",
    directo.error !== undefined || directo.status !== 0,
    directo.error ? directo.error.code || directo.error.message : `exit=${directo.status}`
  );
}

// ── Veredicto ───────────────────────────────────────────────────────────────
const fallos = resultados.filter((r) => !r.ok);
console.log("");
console.log(`${resultados.length - fallos.length}/${resultados.length} correctas · ${fallos.length} fallida(s)`);
if (fallos.length > 0) {
  console.log("FALLOS:");
  for (const f of fallos) console.log(`  · ${f.nombre}: ${f.detalle}`);
  process.exit(1);
}
process.exit(0);

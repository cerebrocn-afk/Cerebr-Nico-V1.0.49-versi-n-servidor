#!/usr/bin/env node
/**
 * scripts/preparar-sdk.mjs — materializa el SDK vendor en node_modules
 *
 * Reporte de Mario (22/11, v1.0.47): electron-builder aborta con
 *   ENOENT: no such file or directory, stat
 *     '...\node_modules\@vectorize-io\hindsight-agent-sdk'
 *
 * Causa: la dependencia es `file:vendor/hindsight-agent-sdk`, así que npm la
 * instala como ENLACE (junction en Windows). Al mover o copiar la carpeta del
 * proyecto —o al recrear node_modules desde otra ruta— el enlace apunta a una
 * ruta que ya no existe. electron-builder recorre las dependencias, hace stat
 * del enlace roto y muere. Node, en cambio, no se queja hasta que importa.
 *
 * Arreglo: dejar una COPIA REAL en node_modules, que sobrevive a cualquier
 * mudanza. Es idempotente: si ya es una carpeta real, no toca nada.
 *
 * Uso:  npm run prep:sdk   (y `npm run dist` lo llama solo)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = path.join(RAIZ, "vendor", "hindsight-agent-sdk");
const DESTINO = path.join(RAIZ, "node_modules", "@vectorize-io", "hindsight-agent-sdk");
const ENTRADA = path.join(DESTINO, "package.json");

if (!fs.existsSync(path.join(ORIGEN, "package.json"))) {
  console.error("[prep:sdk] falta vendor/hindsight-agent-sdk/package.json");
  console.error("  El SDK vendor viaja en el paquete; si no está, el ZIP llegó incompleto.");
  process.exit(1);
}

let estado = "ausente";
try {
  const st = fs.lstatSync(DESTINO);
  estado = st.isSymbolicLink() ? "enlace" : "carpeta";
} catch { estado = "ausente"; }

if (estado === "carpeta" && fs.existsSync(ENTRADA)) {
  console.log("[prep:sdk] ya es una carpeta real: node_modules/@vectorize-io/hindsight-agent-sdk");
  process.exit(0);
}

if (estado !== "ausente") {
  // Quitar el enlace (junction en Windows) sin tocar el original.
  try {
    fs.unlinkSync(DESTINO);
  } catch {
    try { fs.rmdirSync(DESTINO); } catch { fs.rmSync(DESTINO, { recursive: true, force: true }); }
  }
  console.log(`[prep:sdk] enlace ${estado === "enlace" ? "roto" : "incompleto"} retirado de node_modules`);
}

fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.cpSync(ORIGEN, DESTINO, {
  recursive: true,
  dereference: true,
  filter: (src) => {
    const rel = path.relative(ORIGEN, src).split(path.sep).join("/");
    if (rel === "node_modules" || rel.startsWith("node_modules/")) return false;
    if (rel === ".git" || rel.startsWith(".git/")) return false;
    return true;
  },
});

if (!fs.existsSync(ENTRADA)) {
  console.error("[prep:sdk] la copia terminó pero no hay package.json en node_modules");
  process.exit(1);
}
console.log("[prep:sdk] copia real lista: node_modules/@vectorize-io/hindsight-agent-sdk");

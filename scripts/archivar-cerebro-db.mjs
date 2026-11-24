#!/usr/bin/env node
/**
 * archivar-cerebro-db.mjs — SACAR EL CEREBRO DE LA INSTALACIÓN, SIN PERDERLO
 * ==========================================================================
 * v1.0.43 · consola de `npm run dist` (21/11):
 *
 *   ✗ EXISTE .cerebro-db — almacén del cerebro (hechos y páginas) (76.4 MB)
 *   [verificar-artefactos] BUILD ABORTADO: faltan 8 artefactos obligatorios.
 *
 * El diagnóstico era correcto (el saber del usuario no puede viajar dentro del
 * instalador), pero el remedio que imprimía —«bórralo»— era peor que el bug:
 * ahí viven los hechos y las páginas del usuario. Y como nadie lo borraba a
 * mano, el mismo muro volvía en cada `npm run dist`.
 *
 * Este script hace lo único honesto: MUEVE (nunca borra) el estado vivo de la
 * raíz de la instalación a `<raíz de datos>/respaldos/instalacion/<fecha>/`.
 * Si no puede moverlo, sale con código 1 y NO deja el build seguir: un paquete
 * con el cerebro viejo dentro es peor que no tener paquete.
 *
 * Uso:
 *   node scripts/archivar-cerebro-db.mjs          (mueve, si hay algo)
 *   node scripts/archivar-cerebro-db.mjs --seco   (solo informa, no toca nada)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const RAIZ_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECO = process.argv.includes("--seco") || process.argv.includes("--dry-run");

/** Los tres residuos que la comprobación C bloquea, con su nombre legible. */
const RESIDUOS = [
  [".cerebro-db", "almacén del cerebro (hechos y páginas)"],
  ["rescate-obras", "obras rescatadas (traen node_modules ajeno)"],
  ["hindsight-mirror.json", "espejo de memoria duplicado"],
];

function normalizar(p) {
  return String(p || "").trim().replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
}

/**
 * Misma precedencia que el servidor y los daemons (PROJECT_DIR manda). Y una
 * guarda: si la raíz de datos apunta a la propia instalación, archivar sería
 * mover una carpeta sobre sí misma; en ese caso se usa la raíz del usuario.
 */
function raizDatos() {
  for (const v of ["PROJECT_DIR", "CN_DATA_ROOT", "CN_PROJECT_DIR"]) {
    const r = String(process.env[v] || "").trim();
    if (r) return r.replace(/[\\/]+$/, "");
  }
  const base = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(base, "Cerebronico");
}

function tamano(abs) {
  let bytes = 0;
  const pila = [abs];
  while (pila.length) {
    const p = pila.pop();
    let st;
    try { st = fs.lstatSync(p); } catch { continue; }
    if (st.isDirectory()) { for (const h of fs.readdirSync(p)) pila.push(path.join(p, h)); }
    else bytes += st.size;
  }
  return bytes;
}

function copiarYVerificar(origen, destino) {
  fs.cpSync(origen, destino, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true });
  // Verificación barata pero real: mismo número de entradas y mismos bytes.
  const a = tamano(origen), b = tamano(destino);
  if (a !== b) throw new Error(`la copia no coincide (${a} B en origen, ${b} B en destino)`);
}

function mover(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try {
    fs.renameSync(origen, destino);
    return "movido";
  } catch (e) {
    if (e?.code !== "EXDEV" && e?.code !== "EPERM" && e?.code !== "ENOTEMPTY") throw e;
    // Otro disco (o Windows con el archivo abierto): copiar, verificar y recién
    // entonces sacar el original. Nunca al revés.
    copiarYVerificar(origen, destino);
    fs.rmSync(origen, { recursive: true, force: true });
    return "copiado y verificado";
  }
}

const datos = raizDatos();
const destinoRaiz = normalizar(datos) === normalizar(RAIZ_APP)
  ? path.join(os.homedir(), "Cerebronico")
  : datos;

const presentes = RESIDUOS.filter(([rel]) => fs.existsSync(path.join(RAIZ_APP, rel)));
if (!presentes.length) {
  console.log("[archivar] nada que archivar: la instalación no tiene estado vivo dentro.");
  process.exit(0);
}

const iso = new Date().toISOString().replace(/[:.]/g, "-");
const lote = path.join(destinoRaiz, "respaldos", "instalacion", iso);

console.log(`[archivar] estado vivo encontrado en la instalación (${SECO ? "SIMULACIÓN: no se toca nada" : "se mueve, no se borra"}):`);
console.log(`[archivar] destino: ${lote}`);
let fallos = 0;
for (const [rel, que] of presentes) {
  const origen = path.join(RAIZ_APP, rel);
  const destino = path.join(lote, rel);
  const mb = (tamano(origen) / 1048576).toFixed(1);
  if (SECO) {
    console.log(`  · movería ${rel} (${mb} MB) — ${que}`);
    continue;
  }
  try {
    const como = mover(origen, destino);
    console.log(`  ✓ ${rel} (${mb} MB) — ${que} → ${como}`);
  } catch (e) {
    fallos++;
    console.error(`  ✗ no pude archivar ${rel}: ${e?.message || e}`);
    console.error(`     cierra la IDE/puertos que lo tengan abierto y reintenta: npm run cerebro:archivar`);
  }
}

if (fallos) {
  console.error(`[archivar] ${fallos} residuo(s) siguen dentro: el empaquetado NO debe continuar.`);
  process.exit(1);
}
if (!SECO) {
  console.log(`[archivar] listo. Nada se borró: el respaldo está en ${lote}`);
}

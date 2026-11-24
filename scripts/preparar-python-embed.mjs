#!/usr/bin/env node
/**
 * preparar-python-embed.mjs — v1.20.1 (EMPAQUETADO)
 * =============================================================================
 * Garantiza `runtime/python-embed/` con el Python EMPOTRADO oficial de Windows
 * x64 (CPython 3.12.10 embeddable). Ese intérprete viaja dentro del instalador
 * (electron-builder → `resources/python-embed/`) y es el que levanta el puente
 * :5000 y los daemons :5100 / :5102 cuando el equipo del usuario NO tiene
 * Python instalado. El usuario final no instala Python, ni pip, ni venv, ni
 * toca PyPI: el runtime ya viene dentro del paquete.
 *
 * Reproducible y a prueba de red:
 *  · El ZIP descargado queda CACHEADO en `runtime/python-embed.zip` con su
 *    SHA-256 fijado aquí abajo. Si la caché existe y cuadra, NO hay red.
 *  · Si falta la caché y no hay internet, el script falla con mensaje claro
 *    (y `npm run dist` aborta antes de generar un instalador cojo).
 *
 * Uso:
 *   node scripts/preparar-python-embed.mjs            → prepara si hace falta
 *   node scripts/preparar-python-embed.mjs --fuerza   → re-descarga y re-extrae
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");

const VERSION = "3.12.10";
const ARCHIVO = `python-${VERSION}-embed-amd64.zip`;
const URL_OFICIAL = `https://www.python.org/ftp/python/${VERSION}/${ARCHIVO}`;
// SHA-256 del ZIP oficial (python.org). Si Python sube de versión, se actualiza
// aquí y nada más: el resto del empaquetado no cambia.
const SHA256_OFICIAL = "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3";

const CACHE = path.join(RAIZ, "runtime", ARCHIVO);
const DESTINO = path.join(RAIZ, "runtime", "python-embed");
const MARCA = path.join(DESTINO, ".cerebronico-marca");
const ESPERADO = `${VERSION}-amd64`;

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function marcaActual() {
  try {
    return fs.readFileSync(MARCA, "utf8").trim();
  } catch {
    return null;
  }
}

async function descargar() {
  console.log(`[python-embed] Descargando ${ARCHIVO} desde python.org…`);
  const res = await fetch(URL_OFICIAL, { redirect: "follow" });
  if (!res.ok) throw new Error(`descarga fallida: HTTP ${res.status} — ${URL_OFICIAL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const suma = sha256(buf);
  if (suma !== SHA256_OFICIAL) {
    throw new Error(
      `SHA-256 NO coincide (ZIP corrupto o versión movida):\n  esperaba ${SHA256_OFICIAL}\n  recibí  ${suma}`
    );
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, buf);
  console.log(`[python-embed] Cacheado runtime/${ARCHIVO} (${(buf.length / 1048576).toFixed(1)} MB, SHA-256 OK).`);
  return buf;
}

async function extraer(buf) {
  const zip = await JSZip.loadAsync(buf);
  fs.rmSync(DESTINO, { recursive: true, force: true });
  fs.mkdirSync(DESTINO, { recursive: true });
  let contados = 0;
  for (const [nombre, entrada] of Object.entries(zip.files)) {
    if (entrada.dir) continue;
    // Cinturón y tirantes contra zip-slip: nada puede salir de DESTINO.
    const destino = path.resolve(DESTINO, nombre);
    if (destino !== DESTINO && !destino.startsWith(DESTINO + path.sep)) {
      throw new Error(`ruta inválida dentro del ZIP: ${nombre}`);
    }
    const datos = await entrada.async("nodebuffer");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, datos, { mode: 0o755 });
    contados++;
  }
  if (!fs.existsSync(path.join(DESTINO, "python.exe"))) {
    throw new Error("el ZIP no contenía python.exe — artifact inesperado, no sigo.");
  }
  fs.writeFileSync(MARCA, ESPERADO);
  console.log(`[python-embed] Extraídos ${contados} archivos → runtime/python-embed/ (${ESPERADO}, verificado).`);
}

async function main() {
  const forzado = process.argv.includes("--fuerza");
  if (
    !forzado &&
    marcaActual() === ESPERADO &&
    fs.existsSync(path.join(DESTINO, "python.exe"))
  ) {
    console.log(`[python-embed] runtime/python-embed ya está listo (${ESPERADO}). Nada que hacer.`);
    return;
  }

  let buf = null;
  if (fs.existsSync(CACHE)) {
    const candidato = fs.readFileSync(CACHE);
    const suma = sha256(candidato);
    if (suma === SHA256_OFICIAL) {
      console.log(`[python-embed] Usando caché local runtime/${ARCHIVO} (SHA-256 OK, sin red).`);
      buf = candidato;
    } else {
      console.warn(`[python-embed] La caché local tiene SHA-256 ${suma} — se descarta y re-descarga.`);
    }
  }
  if (!buf) buf = await descargar();

  await extraer(buf);
  console.log(
    "[python-embed] Listo: el instalador llevará este intérprete en resources/python-embed/.\n" +
    "               El usuario final NO necesita Python para :5000, :5100 ni :5102."
  );
}

main().catch((e) => {
  console.error(`[python-embed] ERROR: ${e.message}`);
  process.exit(1);
});

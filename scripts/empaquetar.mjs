#!/usr/bin/env node
/**
 * empaquetar.mjs — la RECETA de empaquetado, versionada en el repo.
 *
 * Nace de la v2.1.2: hasta la v2.1.1 la receta vivía en la instalación
 * (CerebroNico-IDE-v2.0.0/app/scripts/) y NO en el árbol que se empaqueta.
 * Consecuencia medida: dos pipelines firmando el mismo número de versión con
 * recetas distintas (5a266196… 2176 entradas vs 49c0530e… 2161 entradas).
 *
 * Uso:
 *   node scripts/empaquetar.mjs --salida <ruta.zip> [--raiz <dir>] [--partes N]
 *
 * Reglas de exclusión (v2.1.2):
 *   - artefactos: node_modules, dist, build, out, coverage, .venv, __pycache__,
 *     target, .cache, .git
 *   - secretos: .env, .pem, .key, .p12, id_rsa, .npmrc, .netrc, credentials.json
 *   - efímeros: .log, .tmp, .bak-*, .swp, .DS_Store, .pid
 *   - basura de sesión: _probe*, _prueba*, _verif*, _recall*, _ingesta*, _diag*,
 *     _sonda*, _parche*, *.patch-*, *.p.ts
 *   - espejo del sandbox: .proyectos/, proyectos/
 *
 * Las exclusiones de basura de sesión y de respaldos son GLOBALES (cualquier
 * profundidad), no solo en la raíz: un .bak-* dentro de src/ es basura igual.
 * Esa fue la fuga de 34 archivos que la v2.1.1 dejó pasar.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeflateRaw } from "node:zlib";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_POR_DEFECTO = resolve(AQUI, "..");

/**
 * Carpetas que nunca viajan, a cualquier profundidad.
 *
 * v2.3.12 — FUGAS MEDIDAS, no teóricas. La receta viajó 2.446 archivos mientras el
 * empaquetado a mano llevaba 2.262: la diferencia eran estado y basura, no código.
 *   · `.cerebro-papelera` (154 archivos) — la papelera del motor: son borrados y
 *     versiones viejas. Entregarla es repartir basura propia con nombre de obra.
 *   · `.tmp-parches` / `.tmp-test` (19) — temporales de parcheo. Efímeros por definición.
 *   · `_respaldo-*` (15) — copia del propio árbol. Duplica peso y confunde al restaurar.
 *   · `.creador` / `exportaciones` — sitios generados y sus ZIP: son SALIDA, no fuente.
 * Se listan por NOMBRE DE CARPETA; el barrido de temporales atrapa además cualquier
 * `.tmp-*` futura sin tener que volver a tocar esta lista.
 */
const DIRS_EXCLUIDOS = new Set([
  "node_modules", ".venv", "__pycache__", ".cache", ".git", ".proyectos",
  "proyectos", ".cerebro-db", ".cerebronico", "cerebro",
  ".cerebro-papelera", ".creador", "exportaciones",
]);

/** Prefijos de CARPETA que nunca viajan (evaluados a cualquier profundidad). */
const PREFIJOS_DIR_EXCLUIDOS = ["_respaldo", ".tmp"];

/**
 * Nombres de SALIDA DE BUILD. v2.1.3 — no se excluyen por nombre suelto.
 *
 * Excluir `dist` por nombre se comió `vendor/hindsight-agent-sdk/dist/index.js`
 * en v1.57.14 (el SDK viaja CON su build) y es la regla que `verificar-empaque.mjs`
 * dejó escrita: las exclusiones se nombran por RUTA, nunca por nombre suelto.
 * Se excluyen en la raíz y en el código del proyecto; dentro de `vendor/`,
 * `extensions/` y `skills/` un `dist/` es obra de un tercero y VIAJA.
 */
const DIRS_BUILD = new Set(["dist", "build", "out", "coverage", "target"]);
/** Raíces donde un `dist/` es de un tercero y viaja. */
const RAICES_CON_BUILD_AJENO = new Set(["vendor", "extensions", "skills"]);

/** Nombres exactos que nunca viajan. */
const NOMBRES_EXCLUIDOS = new Set([
  ".DS_Store", ".pid", "Thumbs.db", "desktop.ini",
  ".npmrc", ".netrc", "credentials.json", "id_rsa", "id_rsa.pub",
]);

/**
 * Archivos de entorno (v2.1.3). `.env` es el único sitio donde un `.pem` y una
 * API key viajan juntos y sin ruido: en la v2.1.2 la lista de nombres NO lo
 * cubría y `.env` entraba al ZIP firmado. `.env.example` sí viaja: es la
 * plantilla sin secretos y es la que documenta las variables.
 */
const esArchivoDeEntorno = (nombre) =>
  nombre === ".env" || (nombre.startsWith(".env.") && nombre !== ".env.example");

/** Sufijos que nunca viajan (se evalúan a cualquier profundidad). */
const SUFIJOS_EXCLUIDOS = [
  ".log", ".tmp", ".swp", ".swo", ".pem", ".key", ".p12", ".patch-", ".p.ts",
];

/** Prefijos de basura de sesión (se evalúan a cualquier profundidad). */
const PREFIJOS_BASURA = [
  "_probe", "_prueba", "_verif", "_recall", "_ingesta", "_diag", "_sonda", "_parche",
  "_retirar",
  // v2.3.12 — medidos en el árbol real: `_ver.cjs`, `_ver2.cjs`, `_ev2.py`, `_tc_out.txt`.
  // Son sondas de un turno de trabajo que quedaron en disco. Van a cualquier profundidad.
  "_ver", "_ev", "_tc_",
];

/** Patrones de respaldo (a cualquier profundidad). v2.1.3: cubre .bak2-/.bak3-/.bak.json */
const RESPALDO_RE = /\.bak\d*-[^/\\]*$|\.bak\d*\.json$|\.bak$/;

/**
 * Estado de sesión del IDE (v2.3.12). `cerebronico-ide-sesion-<epoch>.json` se
 * reescribe en cada arranque y puede llevar rutas del equipo de quien lo generó:
 * es estado, no fuente. Antes viajaba dentro del paquete firmado.
 */
const SESION_RE = /^cerebronico-ide-sesion-.*\.json$/;

/**
 * Parches a mano (v2.1.3). `.patch-` como SUFIJO no casaba nada: el archivo real
 * es `ApiKeyModal.tsx.patch-zai.txt`, que termina en `.txt`. Se busca en el
 * nombre completo, no al final.
 */
const PATCH_RE = /\.patch-[^/\\]*$/;

/**
 * Artefactos de la HERRAMIENTA DE TRANSPORTE (v2.1.3).
 * `unir-partes.mjs` escribe las particiones y su manifiesto DENTRO del árbol
 * versionado cuando el flag de salida no se reconoce (pasó: `--salida` en vez
 * de `--salir`, y soltó 4 `.bin` + `MANIFIESTO-PARTES.json` en la raíz). Un
 * `.bin` no está en SUFIJOS_EXCLUIDOS, así que la corrida siguiente se los
 * llevaba puestos y la identidad del paquete cambiaba sin que nadie tocara
 * código. Se excluyen a cualquier profundidad: el transporte nunca es obra.
 */
const TRANSPORTE_RE = /^parte\d+\.bin$|^MANIFIESTO-PARTES\.json$/;

/**
 * v1.0.10 · UN SOLO MANIFIESTO (pedido de Mario 09/11: «¿no se puede hacer un
 * solo manifiesto incluyendo todo?» — y la captura mostraba 46 TXT llenando la
 * raíz del ZIP). `MANIFIESTO_SHA256_v<X.Y.Z>.txt` es firma de UNA versión: la
 * que se está entregando. Las firmas viejas no verifican nada en un paquete
 * nuevo (el árbol cambió entero) y cada una pesa 200-400 KB de ruido. Viaja
 * UNO: `MANIFIESTO_SHA256.txt` (rolling, versión dentro de la cabecera), que
 * genera scripts/manifiesto.mjs. Los históricos viven en
 * documentacion/_archivo-consolidado/MANIFIESTOS-HISTORICOS/ (también excluido:
 * son locales del desarrollador, no obra del paquete).
 */
const MANIFIESTO_VIEJO_RE = /^MANIFIESTO_SHA256_v.+\.txt$/i;

/**
 * Decide si una ruta relativa (con separadores nativos) viaja o no.
 * @param {string} relativa ruta relativa a la raíz, con separadores nativos
 * @returns {{viaja: boolean, motivo?: string}}
 */
export function decideViaje(relativa) {
  const partes = relativa.split(sep);
  const nombre = partes[partes.length - 1];

  const directorios = partes.slice(0, -1);
  for (const dir of directorios) {
    if (DIRS_EXCLUIDOS.has(dir)) return { viaja: false, motivo: `carpeta excluida: ${dir}` };
    for (const prefijo of PREFIJOS_DIR_EXCLUIDOS) {
      if (dir.startsWith(prefijo)) return { viaja: false, motivo: `carpeta efímera: ${dir}` };
    }
  }
  // Estado de sesión en la raíz: cambia en cada arranque, no es fuente.
  if (SESION_RE.test(nombre)) return { viaja: false, motivo: "estado de sesión del IDE" };
  // v1.0.10 · un paquete, UNA firma: los manifiestos por versión no viajan.
  if (MANIFIESTO_VIEJO_RE.test(nombre)) return { viaja: false, motivo: "manifiesto de otra versión (viaja MANIFIESTO_SHA256.txt)" };
  if (directorios.includes("MANIFIESTOS-HISTORICOS")) return { viaja: false, motivo: "archivo local de manifiestos viejos" };
  for (let i = 0; i < directorios.length; i++) {
    const dir = directorios[i];
    if (!DIRS_BUILD.has(dir)) continue;
    const buildAjeno = i > 0 && RAICES_CON_BUILD_AJENO.has(directorios[0]);
    if (!buildAjeno) return { viaja: false, motivo: `build del proyecto: ${directorios.slice(0, i + 1).join("/")}` };
  }
  if (NOMBRES_EXCLUIDOS.has(nombre)) return { viaja: false, motivo: `nombre excluido: ${nombre}` };
  if (esArchivoDeEntorno(nombre)) return { viaja: false, motivo: `archivo de entorno: ${nombre}` };

  for (const sufijo of SUFIJOS_EXCLUIDOS) {
    if (nombre.endsWith(sufijo)) return { viaja: false, motivo: `sufijo excluido: ${sufijo}` };
  }
  for (const prefijo of PREFIJOS_BASURA) {
    if (nombre.startsWith(prefijo)) return { viaja: false, motivo: `basura de sesión: ${prefijo}` };
  }
  if (RESPALDO_RE.test(nombre)) return { viaja: false, motivo: "respaldo .bak-*" };
  if (PATCH_RE.test(nombre)) return { viaja: false, motivo: "parche a mano .patch-*" };
  if (TRANSPORTE_RE.test(nombre)) return { viaja: false, motivo: "artefacto de transporte (partes .bin)" };

  return { viaja: true };
}

/**
 * `debeViajar` — la API canónica booleana, la que importa `manifiesto.mjs`.
 *
 * v2.1.3 — `manifiesto.mjs` importaba `debeViajar` de este archivo y este archivo
 * sólo exportaba `decideViaje`: el manifiesto no arrancaba (ERR: no matching
 * export). Una sola receta, dos voces: la booleana para firmar y la detallada
 * para explicar.
 * @param {string} relativa ruta relativa, con separadores nativos
 * @returns {boolean}
 */
export function debeViajar(relativa) {
  return decideViaje(relativa).viaja;
}

/** Recorre el árbol y devuelve las rutas relativas que viajan, ordenadas. */
export function listarArchivos(raiz) {
  const salida = [];
  const pila = [raiz];
  while (pila.length > 0) {
    const actual = pila.pop();
    let entradas;
    try {
      entradas = readdirSync(actual, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas) {
      const absoluta = join(actual, entrada.name);
      const relativa = relative(raiz, absoluta);
      if (entrada.isDirectory()) {
        if (DIRS_EXCLUIDOS.has(entrada.name)) continue;
        // v2.3.12 — el corte por NOMBRE DE CARPETA no pasa por decideViaje: si no
        // se comprueba aquí, `_respaldo-*` y `.tmp-*` se recorren enteras (y sus
        // archivos se descartan uno a uno, desperdiciando el recorrido).
        if (PREFIJOS_DIR_EXCLUIDOS.some((p) => entrada.name.startsWith(p))) continue;
        pila.push(absoluta);
      } else if (entrada.isFile()) {
        if (decideViaje(relativa).viaja) salida.push(relativa);
      }
    }
  }
  salida.sort();
  return salida;
}

/** sha256 de un archivo, en streaming. */
export function sha256DeArchivo(ruta) {
  return new Promise((ok, mal) => {
    const h = createHash("sha256");
    const flujo = createReadStream(ruta);
    flujo.on("data", (trozo) => h.update(trozo));
    flujo.on("end", () => ok(h.digest("hex")));
    flujo.on("error", mal);
  });
}

/** CRC32 de un buffer (tabla estándar). */
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[i] = c >>> 0;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = TABLA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Construye un ZIP determinista: mismo contenido → mismo sha256.
 * Sin fechas variables, sin orden variable, deflate fijo.
 */
export async function construirZip(raiz, rutas) {
  const trozos = [];
  const central = [];
  let offset = 0;

  for (const relativa of rutas) {
    const absoluta = join(raiz, relativa);
    const datos = await leerBinario(absoluta);
    const comprimido = await deflateFijo(datos);
    const nombre = Buffer.from(relativa.split(sep).join("/"), "utf8");
    const crc = crc32(datos);

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(0x04034b50, 0);
    cabecera.writeUInt16LE(20, 4);
    cabecera.writeUInt16LE(0x0800, 6);
    cabecera.writeUInt16LE(8, 8);
    cabecera.writeUInt16LE(0, 10);
    cabecera.writeUInt16LE(0x21, 12);
    cabecera.writeUInt32LE(crc, 14);
    cabecera.writeUInt32LE(comprimido.length, 18);
    cabecera.writeUInt32LE(datos.length, 22);
    cabecera.writeUInt16LE(nombre.length, 26);
    cabecera.writeUInt16LE(0, 28);

    trozos.push(cabecera, nombre, comprimido);

    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt16LE(20, 4);
    entrada.writeUInt16LE(20, 6);
    entrada.writeUInt16LE(0x0800, 8);
    entrada.writeUInt16LE(8, 10);
    entrada.writeUInt16LE(0, 12);
    entrada.writeUInt16LE(0x21, 14);
    entrada.writeUInt32LE(crc, 16);
    entrada.writeUInt32LE(comprimido.length, 20);
    entrada.writeUInt32LE(datos.length, 24);
    entrada.writeUInt16LE(nombre.length, 28);
    entrada.writeUInt16LE(0, 30);
    entrada.writeUInt16LE(0, 32);
    entrada.writeUInt16LE(0, 34);
    entrada.writeUInt16LE(0, 36);
    entrada.writeUInt32LE(0, 38);
    entrada.writeUInt32LE(offset, 42);
    central.push(entrada, nombre);

    offset += cabecera.length + nombre.length + comprimido.length;
  }

  const directorio = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(rutas.length, 8);
  fin.writeUInt16LE(rutas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(offset, 16);
  fin.writeUInt16LE(0, 20);

  return Buffer.concat([...trozos, directorio, fin]);
}

function leerBinario(ruta) {
  return new Promise((ok, mal) => {
    const trozos = [];
    const flujo = createReadStream(ruta);
    flujo.on("data", (t) => trozos.push(t));
    flujo.on("end", () => ok(Buffer.concat(trozos)));
    flujo.on("error", mal);
  });
}

function deflateFijo(datos) {
  return new Promise((ok, mal) => {
    const trozos = [];
    const z = createDeflateRaw({ level: 9 });
    z.on("data", (t) => trozos.push(t));
    z.on("end", () => ok(Buffer.concat(trozos)));
    z.on("error", mal);
    z.end(datos);
  });
}

/** Parte un buffer en N trozos iguales (el último lleva el resto). */
export function partir(buffer, partes) {
  const tam = Math.ceil(buffer.length / partes);
  const trozos = [];
  for (let i = 0; i < partes; i++) {
    const desde = i * tam;
    const hasta = Math.min(desde + tam, buffer.length);
    if (desde < buffer.length) trozos.push(buffer.subarray(desde, hasta));
  }
  return trozos;
}

async function main() {
  const args = process.argv.slice(2);
  const opcion = (nombre, def) => {
    const i = args.indexOf(`--${nombre}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };

  const raiz = resolve(opcion("raiz", RAIZ_POR_DEFECTO));
  const salida = resolve(opcion("salida", join(raiz, "CerebroNico-IDE.zip")));
  const partes = Number(opcion("partes", "1"));

  if (!existsSync(raiz)) {
    console.error(`[empaquetar] raíz inexistente: ${raiz}`);
    process.exit(1);
  }

  const rutas = listarArchivos(raiz);
  console.log(`[empaquetar] raíz: ${raiz}`);
  console.log(`[empaquetar] archivos que viajan: ${rutas.length}`);

  const zip = await construirZip(raiz, rutas);
  const hashZip = createHash("sha256").update(zip).digest("hex");

  const base = salida.replace(/\.zip$/i, "");
  const trozos = partir(zip, partes);
  const manifiesto = {
    version: 1,
    generado: new Date().toISOString(),
    raiz,
    archivos: rutas.length,
    bytes: zip.length,
    sha256: hashZip,
    partes: [],
  };

  if (partes === 1) {
    writeFileSync(salida, zip);
    console.log(`[empaquetar] ${salida}`);
  } else {
    for (let i = 0; i < trozos.length; i++) {
      const nombre = `${base}-parte${String(i + 1).padStart(2, "0")}-de-${String(trozos.length).padStart(2, "0")}.bin`;
      writeFileSync(nombre, trozos[i]);
      const hash = createHash("sha256").update(trozos[i]).digest("hex");
      manifiesto.partes.push({ archivo: nombre, bytes: trozos[i].length, sha256: hash });
      console.log(`[empaquetar] ${nombre}  ${trozos[i].length} B  ${hash.slice(0, 16)}…`);
    }
  }

  const rutaManifiesto = `${base}-MANIFIESTO-PARTES.json`;
  writeFileSync(rutaManifiesto, JSON.stringify(manifiesto, null, 2), "utf8");
  console.log(`[empaquetar] manifiesto: ${rutaManifiesto}`);
  console.log(`[empaquetar] sha256 del ZIP: ${hashZip}`);
}

const esMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esMain) {
  main().catch((e) => {
    console.error(`[empaquetar] fallo: ${e?.message ?? e}`);
    process.exit(1);
  });
}
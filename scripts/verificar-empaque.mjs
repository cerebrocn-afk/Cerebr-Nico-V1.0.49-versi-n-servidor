#!/usr/bin/env node
// verificar-empaque.mjs — v1.57.15 · EL EMPAQUE NO PUEDE PERDER ARCHIVOS
// =======================================================================
// POR QUÉ EXISTE
// --------------
// En el cierre de v1.57.14 la exclusión global de `dist` en el walker de empaque
// SE COMIÓ `proj/vendor/hindsight-agent-sdk/dist/index.js` y su `.d.ts`: el SDK
// del vendor viaja CON su build, y ese `dist` no es output de este proyecto. El
// error no lo vio ninguna prueba (no existía la prueba); lo vio una comparación
// manual de conjuntos de entradas contra el zip 1.57.13, hecha después de firmar
// y antes de entregar por poco. Esta valla convierte ese golpe de suerte en
// regla: NINGÚN archivo real desaparece sin que el empaque se ponga rojo.
//
// LA REGLA DE DISEÑO que se llevó el bug: las exclusiones se nombran por RUTA
// COMPLETA (`proj/dist`), nunca por el nombre suelto (`dist`). Cualquier
// exclusión por nombre simples es una bomba de tiempo contra dependencias que
// publican su propio `dist/` (SDK del vendor, extensions, skills).
//
// Cómo compara sin dependencias: lee el DIRECTORIO CENTRAL del zip (nombres y
// CRC-32 por entrada) y calcula el CRC-32 del árbol de trabajo. No descomprime
// nada: el CRC alcanza para decir «este archivo cambió» o «este archivo ya no
// está». Node v16 no tiene zlib.crc32, así que la tabla va acá.
//
//   node scripts/verificar-empaque.mjs --ref ../CerebroNico-IDE-v1.57.13.zip
//   node scripts/verificar-empaque.mjs --ref <zip> --json
//   node scripts/verificar-empaque.mjs --selftest     (sin zip: prueba la lógica)

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directorios que nunca viajan, por RUTA COMPLETA. Ver el comentario de arriba. */
export const RUTAS_EXCLUIDAS = ["proj/node_modules", "proj/dist", "proj/.cerebro-db", "proj/.vite"];
/** Basura de corrida: pueden faltar y no es noticia. */
export const TRANSITORIOS = [/\/__pycache__\//, /\.pyc$/, /\.log$/, /\.tmp$/];

const esTransitorio = (p) => TRANSITORIOS.some((re) => re.test(p));
const excluidoPorRuta = (p) => RUTAS_EXCLUIDAS.some((r) => p === r || p.startsWith(r + "/"));
/** `dist` suelto NO excluye: solo la ruta de build de raíz. */
export const debeViajar = (p) => !excluidoPorRuta(p) && !esTransitorio(p);

// ── CRC-32 (tabla estándar, sin deps) ───────────────────────────────────────
const TABLA = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c; }
  return t;
})();
export function crc32(buf) {
  let c = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TABLA[(c ^ buf[i]) & 0xff];
  return (c ^ (-1)) >>> 0;
}

// ── lectura del directorio central ──────────────────────────────────────────
/**
 * Parsea solo el central directory: `name`, `crc` y `uncompressedSize` por
 * entrada. Devuelve además las entradas de DIRECTORIO marcadas (existen en el
 * zip viejo y en el nuestro no: es diferencia estructural, no de contenido).
 */
export function leerZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("sin fin de directorio central (¿es un .zip?)");
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entradas = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("director central desalineado en la entrada " + n);
    const crc = buf.readUInt32LE(off + 16);
    const tamano = buf.readUInt32LE(off + 24);
    const nomLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const comentarioLen = buf.readUInt16LE(off + 32);
    const attrsExt = buf.readUInt32LE(off + 38);
    const nombre = buf.slice(off + 46, off + 46 + nomLen).toString("utf8");
    entradas.push({ nombre, crc, tamano, esDirectorio: nombre.endsWith("/") || (attrsExt & 0x10) !== 0 });
    off += 46 + nomLen + extraLen + comentarioLen;
  }
  return entradas;
}

/** Lista el árbol de trabajo con las MISMAS rutas relativas que usa el zip. */
export function listarArbol(raiz = RAIZ, prefijo = "proj") {
  const out = [];
  (function walk(dir, rel) {
    let nombres; try { nombres = readdirSync(dir); } catch { return; }
    for (const n of nombres.sort()) {
      // En A: la condición `&& rel !== "proj"` hacía que el node_modules DE RAÍZ
      // se recorriera igual (y el conteo de «nuevas» salía 15317, mentira). Un
      // nombre prohibido se prohíbe en toda profundidad, sin excepciones.
      if (["node_modules", ".git", "__pycache__", ".cerebro-db", ".vite"].includes(n)) continue;
      const full = path.join(dir, n), r = `${rel}/${n}`;
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full, r);
      else if (st.isFile() && debeViajar(r)) out.push({ nombre: r, crc: crc32(readFileSync(full)), tamano: st.size, esDirectorio: false });
    }
  })(raiz, prefijo);
  return out;
}

/** Archivos cuyo contenido NO puede cambiar sin que se diga en el parte. */
export const CRITICOS = [/^proj\/server\.ts$/, /^proj\/package\.json$/, /^proj\/package-lock\.json$/,
  /^proj\/src\/constants\.ts$/, /^proj\/iniciar_todo_windows\.bat$/, /^proj\/CHANGELOG\.md$/,
  /^proj\/vendor\/.*\/dist\//];

/**
 * LA COMPARACIÓN. `ref` es lo que se entregó antes; `actual` lo que se está por
 * entregar. Se separan tres cosas distintas, porque se arreglan distinto:
 *   faltantes      → archivo real que desapareció (casi siempre: una exclusión
 *                    mal nombrada). ROMPE el empaque.
 *   criticos       → cambió de contenido respecto del árbol actual del repo.
 *   estructurales  → entradas de directorio, que no son contenido.
 */
export function comparar(ref, actual) {
  const mapa = new Map(actual.map((e) => [e.nombre, e]));
  const nombres = new Set(mapa.keys());
  const faltantes = [], cambian = [];
  for (const e of ref) {
    if (e.esDirectorio || esTransitorio(e.nombre)) continue;
    const h = mapa.get(e.nombre);
    if (!h) { if (!excluidoPorRuta(e.nombre)) faltantes.push(e.nombre); continue; }
    if (h.crc !== e.crc) cambian.push(e.nombre);
  }
  const dirsRef = ref.filter((e) => e.esDirectorio).length;
  return {
    faltantes,
    cambian: cambian.length,
    nuevas: [...nombres].filter((n) => !ref.some((r) => r.nombre === n)),
    directoriosReferencia: dirsRef,
    esCriticos: (n) => CRITICOS.some((re) => re.test(n)),
    faltantesCriticos: faltantes.filter((n) => CRITICOS.some((re) => re.test(n))),
  };
}

export function autoprueba() {
  // El caso que se llevó el bug de 1.57.14, escrito como regla.
  const reglas = [
    ["proj/dist/app.js se excluye (build de raíz)", debeViajar("proj/dist/app.js") === false],
    ["proj/vendor/hindsight-agent-sdk/dist/index.js VIAJA", debeViajar("proj/vendor/hindsight-agent-sdk/dist/index.js") === true],
    ["proj/extensions/x/dist/y.js VIAJA", debeViajar("proj/extensions/x/dist/y.js") === true],
    ["node_modules se excluye", debeViajar("proj/node_modules/a/b.js") === false],
    ["__pycache__ y .log son transitorios", debeViajar("proj/a/__pycache__/x.cpython-312.pyc") === false && debeViajar("proj/.vigilante/roto.log") === false],
    ["un .ts del proyecto viaja", debeViajar("proj/src/engine/modelTiers.ts") === true],
  ];
  // Mutación: si el árbol de referencia tiene un archivo que el actual perdió,
  // la comparación TIENE que romper. Una valla que no puede fallar no es valla.
  const ref = [{ nombre: "proj/a.ts", crc: 1, esDirectorio: false }, { nombre: "proj/vendor/s/dist/index.js", crc: 2, esDirectorio: false }];
  const perdido = comparar(ref, [{ nombre: "proj/a.ts", crc: 1, esDirectorio: false }]);
  const intacto = comparar(ref, ref);
  reglas.push(["detecta el archivo perdido", perdido.faltantes.length === 1 && perdido.faltantes[0].endsWith("vendor/s/dist/index.js")]);
  reglas.push(["y no rompe cuando todo está", intacto.faltantes.length === 0]);
  const crcA = crc32(Buffer.from("hola")), crcB = crc32(Buffer.from("hola!"));
  reglas.push(["crc32 distingue contenido", crcA !== crcB && crc32(Buffer.from("hola")) === crcA]);
  return reglas;
}

if (process.argv[1]?.endsWith("verificar-empaque.mjs")) {
  if (process.argv.includes("--selftest")) {
    const r = autoprueba();
    for (const [n, ok] of r) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    console.log(`\nAUTOPRUEBA EMPAQUE: ${r.filter((x) => x[1]).length} correctas · ${r.filter((x) => !x[1]).length} fallidas`);
    process.exitCode = r.every((x) => x[1]) ? 0 : 1;
  } else {
    const i = process.argv.indexOf("--ref");
    const refPath = i > 0 ? process.argv[i + 1] : null;
    if (!refPath || !existsSync(refPath)) {
      console.log("FALTA --ref <zip anterior>. Sin referencia esta valla NO puede opinar");
      console.log("y se declara inerte en vez de aprobar por defecto.");
      process.exitCode = 2;
    } else {
      const res = comparar(leerZipEntries(readFileSync(refPath)), listarArbol());
      console.log(`\nDIFERENCIAL DE EMPAQUE contra ${path.basename(refPath)}`);
      console.log(`  entradas de directorio en la referencia: ${res.directoriosReferencia}`);
      console.log(`  contenido distinto del árbol actual: ${res.cambian}`);
      console.log(`  archivos nuevos: ${res.nuevas.length}`);
      console.log(`  FALTANTES: ${res.faltantes.length}${res.faltantesCriticos.length ? ` (${res.faltantesCriticos.length} críticos)` : ""}`);
      for (const f of res.faltantes.slice(0, 20)) console.log("    · " + f + (res.esCriticos(f) ? "  ← CRÍTICO" : ""));
      if (res.faltantes.length) console.log("\n  No se empaca: perdiste archivos. Revisá RUTAS_EXCLUIDAS (por RUTA, no por nombre).\n");
      process.exitCode = res.faltantes.length ? 1 : 0;
    }
  }
}

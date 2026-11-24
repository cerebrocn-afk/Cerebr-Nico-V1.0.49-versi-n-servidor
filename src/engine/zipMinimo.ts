/**
 * zipMinimo.ts — ESCRITOR DE ZIP SIN DEPENDENCIAS (v1.96.0)
 * ========================================================
 * Por qué existe: el foco que pidió Mario (30/10) es «producción certera de código, app,
 * web y archivos varios: word, pdf, etc.». Para Word (y para Excel, y para cualquier
 * `.pptx`) hace falta un contenedor ZIP, y el arnés solo tenía `jszip` del lado del
 * servidor y `pdfjs-dist` —que lee, no escribe—. La consecuencia ya la vivimos con el
 * PDF: sin máquina, el modelo escribe bytes a mano y el archivo sale roto.
 *
 * Este módulo escribe ZIP 2.0 con entradas **almacenadas** (sin comprimir). Es una
 * decisión, no una flojera:
 *   · uncompressed es 100 % legal en el formato y Word/Excel/LibreOffice lo abren igual;
 *   · no requiere deflate, así que el archivo es **determinista byte a byte** — mismo
 *     contenido, mismo sha256 — que es exactamente la propiedad que `entregaFuncional`
 *     exige y que la primera versión de la clave del service worker rompió;
 *   · y se puede auditar sin librerías: el lector de abajo reabre el contenedor y
 *     verifica CRC de cada entrada, que es lo que el arnés necesita para afirmar
 *     «el .docx existe y está íntegro» en vez de «escribí algo que se llama .docx».
 *
 * Los enteros van en little-endian, como exige el formato. Un byte de más en un campo de
 * desplazamiento produce un ZIP que `unzip -t` rechaza, así que las longitudes se calculan
 * sobre el buffer ya emitido, no sobre la teoría.
 */

export interface EntradaZip {
  /** Ruta DENTRO del archivo, con `/` siempre (nunca `\`). */
  nombre: string;
  /** Contenido. Un string se codifica como UTF-8. */
  datos: Uint8Array | string;
}

/* ── CRC-32 (IEEE 802.3), la tabla se construye una sola vez ─────────────────── */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function aBytes(datos: Uint8Array | string): Uint8Array {
  if (typeof datos !== "string") return datos;
  return new TextEncoder().encode(datos);
}


/* v1.96.0 · antes había una clase `TextEncoder` local que ensombrecía la global:
   hacía lo mismo, con `unescape` deprecado adentro. Fuera. `aBytes` usa la global. */

/** Un tiempo DOS-style fijo: nada de `Date.now()` dentro del archivo, porque un ZIP
 *  reproducible es un ZIP auditable (y `entregaFuncional` mide sha256 entre dos forjas). */
const FECHA_FIXA = { hora: 0, minuto: 0, segundo: 0, dia: 1, mes: 1, anio: 2026 };

function dosFecha(): number {
  return ((FECHA_FIXA.anio - 1980) << 9) | (FECHA_FIXA.mes << 5) | FECHA_FIXA.dia;
}
function dosHora(): number {
  return (FECHA_FIXA.hora << 11) | (FECHA_FIXA.minuto << 5) | (FECHA_FIXA.segundo >> 1);
}

class Escritor {
  private pedazos: Uint8Array[] = [];
  private largo = 0;
  push(...b: Uint8Array[]) { for (const x of b) { this.pedazos.push(x); this.largo += x.length; } }
  u16(v: number) { const n = v & 0xffff; this.push(Uint8Array.from([n & 0xff, (n >>> 8) & 0xff])); }
  u32(v: number) { const n = v >>> 0; this.push(Uint8Array.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])); }
  get longitud() { return this.largo; }
  toBuffer(): Uint8Array {
    const out = new Uint8Array(this.largo);
    let p = 0;
    for (const b of this.pedazos) { out.set(b, p); p += b.length; }
    return out;
  }
}

/**
 * v1.0.22 · UN NOMBRE DE ENTRADA NUNCA SALE DE LA CARPETA DEL PAQUETE.
 * ===================================================================
 * INCIDENTE DEL 16/11: «descargué el entregable, lo descomprimí y explotó toda la
 * carpeta C:\Cerebronico». Antes acá solo había `replace(/^\/+/, "")`: un nombre
 * `../x` o `C:\x` viajaba TAL CUAL (medido con `unzip -l`: la entrada se llamaba
 * `../Cerebronico/politicas.md`). Al descomprimir, `..` sube un nivel y escribe
 * FUERA de la carpeta elegida — o sea, encima de la raíz de datos del usuario.
 *
 * La sanitización es del ESCRITOR y no del llamador a propósito: un escritor que
 * confía en que todos sus llamadores limpien no es un escritor, es una promesa.
 * Se neutraliza en vez de lanzar, porque perder un archivo es mejor que abortar
 * un paquete entero — pero si después de limpiar no queda nombre, sí se lanza.
 */
export function nombreSeguroParaZip(crudo: string): string {
  const tramos = String(crudo ?? "")
    .replace(/\\/g, "/")
    .split("/")
    // `..`, `.` y el primer tramo de una ruta absoluta de Windows (`C:`) fuera.
    .filter((t) => t && t !== "." && t !== ".." && !/^[a-zA-Z]:/.test(t))
    .map((t) => t.replace(/[\x00-\x1f]/g, ""))
    .filter((t) => t && t !== ".");
  return tramos.join("/");
}

/** Escribe el ZIP completo. */
export function crearZip(entradas: EntradaZip[]): Uint8Array {
  const lista = (entradas || []).map((e) => ({
    nombre: nombreSeguroParaZip(String(e.nombre)),
    datos: aBytes(e.datos),
  }));
  if (!lista.length) throw new Error("crearZip recibió 0 entradas");
  for (const e of lista) if (!e.nombre) throw new Error("crearZip: un nombre quedó vacío después de saneado (ruta fuera del paquete)");

  const w = new Escritor();
  const índice: { nombre: string; crc: number; largo: number; desplazamiento: number }[] = [];

  for (const e of lista) {
    const nombreB = aBytes(e.nombre);
    const crc = crc32(e.datos);
    const desplazamiento = w.longitud;
    w.u32(0x04034b50); // firma de archivo local
    w.u16(20);         // versión mínima
    w.u16(0x0800);     // flags: UTF-8 en el nombre
    w.u16(0);          // método: almacenado (sin comprimir)
    w.u16(dosHora());
    w.u16(dosFecha());
    w.u32(crc);
    w.u32(e.datos.length); // comprimido = sin comprimir
    w.u32(e.datos.length);
    w.u16(nombreB.length);
    w.u16(0);              // extra
    w.push(nombreB, e.datos);
    índice.push({ nombre: e.nombre, crc, largo: e.datos.length, desplazamiento });
  }

  const inicioCD = w.longitud;
  for (const it of índice) {
    const nombreB = aBytes(it.nombre);
    w.u32(0x02014b50); // firma de entrada de directorio central
    w.u16(20);         // versión creada por
    w.u16(20);         // versión necesaria
    w.u16(0x0800);
    w.u16(0);
    w.u16(dosHora());
    w.u16(dosFecha());
    w.u32(it.crc);
    w.u32(it.largo);
    w.u32(it.largo);
    w.u16(nombreB.length);
    w.u16(0); w.u16(0);           // extra / comentario
    w.u16(0); w.u16(0);           // disco / atributos internos
    w.u32(0);                     // atributos externos
    w.u32(it.desplazamiento);
    w.push(nombreB);
  }
  const finCD = w.longitud;
  w.u32(0x06054b50); // EOCD
  w.u16(0); w.u16(0);
  w.u16(índice.length); w.u16(índice.length);
  w.u32(finCD - inicioCD);
  w.u32(inicioCD);
  w.u16(0);
  return w.toBuffer();
}

export interface EntradaLeida { nombre: string; datos: Uint8Array; crcOk: boolean }

/**
 * Lector mínimo de entradas almacenadas, para AUDITAR lo que se escribió: recorre el
 * directorio central, reabre cada archivo local y comprueba el CRC. Devuelve `ok:false`
 * con un motivo legible — que es lo que el arnés necesita para no decir «listo» sobre un
 * archivo roto.
 */
export function abrirZip(bytes: Uint8Array): { ok: boolean; motivo?: string; entradas: EntradaLeida[]; total: number } {
  // Un auditor que LANZA es peor que uno que dice «no»: quien llama (la herramienta
  // `crear_docx`, la valla, el chat) vería un stack trace donde tiene que ver un motivo.
  // El defecto real que lo demostró: corromper un byte del directorio central hacía que
  // un desplazamiento apuntara fuera del buffer y `getUint32` tirara RangeError.
  try {
    return inspeccionarZip(bytes);
  } catch (e: any) {
    return { ok: false, motivo: `el archivo no se puede leer: ${String(e?.message || e)}`, entradas: [], total: 0 };
  }
}

function inspeccionarZip(bytes: Uint8Array): { ok: boolean; motivo?: string; entradas: EntradaLeida[]; total: number } {
  const u = new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let eocd = -1;
  for (let i = u.length - 22; i >= 0 && i > u.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return { ok: false, motivo: "sin firma de fin de archivo (EOCD): el ZIP está truncado", entradas: [], total: 0 };
  const total = dv.getUint16(eocd + 10, true);
  const tamCD = dv.getUint32(eocd + 12, true);
  const inicioCD = dv.getUint32(eocd + 16, true);
  if (inicioCD + tamCD > eocd) return { ok: false, motivo: "el directorio central apunta fuera del archivo", entradas: [], total };

  const entradas: EntradaLeida[] = [];
  let p = inicioCD;
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) return { ok: false, motivo: `entrada ${n + 1} del directorio central tiene firma inválida`, entradas, total };
    const metodo = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const largo = dv.getUint32(p + 20, true);
    const nombreL = dv.getUint16(p + 28, true);
    const extraL = dv.getUint16(p + 30, true);
    const comentL = dv.getUint16(p + 32, true);
    const desplazamiento = dv.getUint32(p + 42, true);
    const nombre = new TextDecoder("utf-8").decode(u.subarray(p + 46, p + 46 + nombreL));
    p += 46 + nombreL + extraL + comentL;

    // Cabecera local de esa entrada: 30 bytes fijos + nombre + extra.
    if (dv.getUint32(desplazamiento, true) !== 0x04034b50) return { ok: false, motivo: `«${nombre}»: su cabecera local no está donde dice el directorio`, entradas, total };
    const nl = dv.getUint16(desplazamiento + 26, true);
    const el = dv.getUint16(desplazamiento + 28, true);
    const inicioDatos = desplazamiento + 30 + nl + el;
    if (inicioDatos + largo > u.length) return { ok: false, motivo: `«${nombre}»: los datos se salen del archivo`, entradas, total };
    const datos = u.subarray(inicioDatos, inicioDatos + largo);
    if (metodo !== 0) return { ok: false, motivo: `«${nombre}»: método ${metodo} no soportado por el auditor (solo almacenado)`, entradas, total };
    entradas.push({ nombre, datos, crcOk: crc32(datos) === crc });
  }
  const malos = entradas.filter((e) => !e.crcOk).map((e) => e.nombre);
  if (malos.length) return { ok: false, motivo: `CRC incorrecto en: ${malos.join(", ")}`, entradas, total };
  return { ok: true, entradas, total };
}

export const VERSION_ZIP_MINIMO = "1.96.0";

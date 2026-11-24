/**
 * generadorDocumentos.ts — EL MOTOR POR FIN ESCRIBE DOCUMENTOS REALES (v1.0.0)
 * =============================================================================
 * QUÉ AÑADE Y POR QUÉ (honestidad técnica):
 *
 * Hasta v1.70.x el motor sabía leer PDF y Word (attachmentProcessor los convierte
 * a .md) y escribir TEXTO (write_file con codificación "utf-8": meter bytes
 * binarios por ahí corrompe cualquier archivo). Cuando el usuario pedía
 * «generame el informe en PDF» o «pasalo a Word», el agente no tenía herramienta:
 * escribía un .txt disfrazado o prometía y no entregaba. Esta entrega le da las
 * manos: generar_pdf, generar_docx y generar_xlsx producen bytes válidos, sin
 * ninguna dependencia de terceros (cero paquetes nuevos — la regla de la casa).
 *
 * POR QUÉ A MANO Y NO jspdf/pdfkit/docx:
 *   - La raíz del proyecto está deliberadamente en cero paquetes de runtime del
 *     motor (1.57.13) y cada dependencia es superficie de riesgo en el .exe.
 *   - Un PDF de texto con las 14 fuentes base pesa ~200 líneas de escritor; un
 *     DOCX/XLSX es un ZIP con XML adentro, y el ZIP lo sabemos escribir: ya
 *     existe un crc32 calibrado en la casa (verificar-empaque.mjs, vector
 *     123456789 → 0xCBF43926). Aquí viaja la misma calibración, propia.
 *   - Determinismo: sin marcas de tiempo ni aleatoriedad — mismo input, mismos
 *     bytes (igual que el ZIP determinista del creador web).
 *
 * HONESTIDADES DECLARADAS (para que el parte de la herramienta no mienta):
 *   - PDF usa las fuentes base Helvetica/Courier con WinAnsiEncoding: latín-1 sí,
 *     emoji y CJK se sustituyen por "?" y el resultado DECLARA cuántos caracteres
 *     sustituyó (caracteresSustituidos). No es un defecto oculto: es un límite dicho.
 *   - DOCX representa listas con viñetas/índices literales («• », «1. ») con sangría:
 *     se ven como listas y Word no pide reparación; no son <w:numPr> reales.
 *   - XLSX NUNCA escribe fórmulas: todo string es texto inline (t="inlineStr"),
 *     incluso si empieza con "=". Un valor hostil "=cmd" es texto, no ejecución.
 *
 * Es lógica PURA: entra texto, sale Uint8Array. El que toca disco es packDocumentos.
 * Se prueba con tests/packDocumentos.test.ts.
 */

// ────────────────────────────────────────────────────────────────────────────
// 1 · EL ZIP ALMACENADO (STORE): la caja de DOCX y XLSX
// ────────────────────────────────────────────────────────────────────────────

/** Tabla CRC32 (polinomio reflejado 0xEDB88320) — la misma del verificador de empaque. */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntradaZip {
  /** Ruta dentro del zip, con / como separador. */
  nombre: string;
  datos: Uint8Array;
}

const DOS_FECHA = 33; // 1980-01-01 · fecha FIJA: determinismo, como el ZIP del creador web
const DOS_HORA = 0;

function u16(v: number): number[] { return [v & 0xff, (v >>> 8) & 0xff]; }
function u32(v: number): number[] { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }

/**
 * Escribe un ZIP por STORE (sin comprimir). Es 100 % legal: DOCX/XLSX son ZIP y
 * cualquier lector (Word, Excel, JSZip, zipfile de Python) los abre igual; el
 * ahorro de deflate no vale un segundo writer. Determinista: orden dado, sin
 * marcas de tiempo.
 */
export function zipStore(entradas: EntradaZip[]): Uint8Array {
  const trozos: Uint8Array[] = []; // cuerpo, en orden
  const centralTrozos: Uint8Array[] = []; // directorio central, en orden
  const coder = new TextEncoderCompat();
  let offset = 0; // donde empieza el header local de la próxima entrada
  for (const e of entradas) {
    const nombreBytes = Uint8Array.from(coder.encode(e.nombre));
    const crc = crc32(e.datos);
    const tam = e.datos.length;
    const cab = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0),
      ...u16(DOS_HORA), ...u16(DOS_FECHA),
      ...u32(crc), ...u32(tam), ...u32(tam),
      ...u16(nombreBytes.length), ...u16(0),
    ]);
    trozos.push(cab, nombreBytes, e.datos); // nada de push(...datos): un informe grande reventaría el stack
    const reg = Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(DOS_HORA), ...u16(DOS_FECHA),
      ...u32(crc), ...u32(tam), ...u32(tam),
      ...u16(nombreBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]);
    centralTrozos.push(reg, nombreBytes);
    offset += cab.length + nombreBytes.length + tam;
  }
  const tamCentral = centralTrozos.reduce((n, t) => n + t.length, 0);
  const eocd = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entradas.length), ...u16(entradas.length),
    ...u32(tamCentral), ...u32(offset), ...u16(0),
  ]);
  const total = trozos.reduce((n, t) => n + t.length, 0) + tamCentral + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const t of trozos) { out.set(t, p); p += t.length; }
  for (const t of centralTrozos) { out.set(t, p); p += t.length; }
  out.set(eocd, p);
  return out;
}

/** UTF-8 sin sorpresas: el nombre de archivo en ZIP debe ser UTF-8. */
class TextEncoderCompat {
  encode(s: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.codePointAt(i)!;
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2 · EL LENGUAJE DE ENTRADA: un subconjunto de markdown, y nada más
// ────────────────────────────────────────────────────────────────────────────
// El documento que dicta el modelo es texto con forma: títulos, párrafos,
// listas, bloques de código y tablas. Se parsea lo JUSTO y se DECLARA lo que no
// se soporta (img, links con ancla, citas): un parser que finge entender el
// resto escribe basura con aire de verdad.

export type Run = { texto: string; negrita?: boolean; cursiva?: boolean; codigo?: boolean };
export type Bloque =
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "parrafo"; runs: Run[] }
  | { tipo: "lista"; ordenada: boolean; items: Run[][] }
  | { tipo: "codigo"; lineas: string[] }
  | { tipo: "tabla"; cabecera: string[]; filas: string[][] };

const RE_INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/;

/** Parte `texto **negra** *cursiva* `code`` en runs con estilo. */
export function parsearRuns(texto: string): Run[] {
  const runs: Run[] = [];
  let resto = texto;
  while (resto.length > 0) {
    const m = resto.split(RE_INLINE);
    // split con grupo captorador: [antes, match, despues, ...]
    if (m.length === 1) {
      runs.push({ texto: resto });
      break;
    }
    if (m[0]) runs.push({ texto: m[0] });
    if (m[1]) {
      if (m[1].startsWith("**")) runs.push({ texto: m[1].slice(2, -2), negrita: true });
      else if (m[1].startsWith("`")) runs.push({ texto: m[1].slice(1, -1), codigo: true });
      else runs.push({ texto: m[1].slice(1, -1), cursiva: true });
    }
    resto = m.slice(2).join("");
  }
  return runs.filter((r) => r.texto.length > 0);
}

function partirCelda(linea: string): string[] {
  let c = linea.trim();
  if (c.startsWith("|")) c = c.slice(1);
  if (c.endsWith("|")) c = c.slice(0, -1);
  return c.split("|").map((x) => x.trim());
}

const RE_SEPARADOR = /^\|?[\s:-]*-[\s:|-]*\|?$/;

/** Markdown (subconjunto declarado) → bloques. No lanza nunca: entrada basura → párrafos. */
export function parsearDocumento(markdown: string): Bloque[] {
  const lineas = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const bloques: Bloque[] = [];
  let i = 0;
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length) {
      bloques.push({ tipo: "parrafo", runs: parsearRuns(parrafo.join(" ")) });
      parrafo = [];
    }
  };
  while (i < lineas.length) {
    const l = lineas[i];
    if (l.trim() === "") { cerrarParrafo(); i++; continue; }
    if (/^```/.test(l.trim())) {
      cerrarParrafo();
      const code: string[] = [];
      i++;
      while (i < lineas.length && !/^```/.test(lineas[i].trim())) { code.push(lineas[i]); i++; }
      i++; // cierra el ``` (si no cerró, se comió el resto: honesto, el bloque terminó)
      bloques.push({ tipo: "codigo", lineas: code });
      continue;
    }
    const mTitulo = /^(#{1,6})\s+(.*)$/.exec(l);
    if (mTitulo) {
      cerrarParrafo();
      bloques.push({ tipo: "titulo", nivel: mTitulo[1].length, texto: mTitulo[2].trim() });
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[-*_\s]*$/.test(l)) {
      cerrarParrafo();
      i++;
      continue; // regla horizontal: hoy no dibuja nada (declarado)
    }
    if (l.trim().startsWith("|") && i + 1 < lineas.length && RE_SEPARADOR.test(lineas[i + 1])) {
      cerrarParrafo();
      const cabecera = partirCelda(l);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trim().startsWith("|")) { filas.push(partirCelda(lineas[i])); i++; }
      bloques.push({ tipo: "tabla", cabecera, filas });
      continue;
    }
    const mBullet = /^\s*[-*+]\s+(.*)$/.exec(l);
    if (mBullet) {
      cerrarParrafo();
      const items: Run[][] = [parsearRuns(mBullet[1])];
      i++;
      while (i < lineas.length) {
        const m2 = /^\s*[-*+]\s+(.*)$/.exec(lineas[i]);
        if (!m2) break;
        items.push(parsearRuns(m2[1]));
        i++;
      }
      bloques.push({ tipo: "lista", ordenada: false, items });
      continue;
    }
    const mNumero = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    if (mNumero) {
      cerrarParrafo();
      const items: Run[][] = [parsearRuns(mNumero[1])];
      i++;
      while (i < lineas.length) {
        const m2 = /^\s*\d+[.)]\s+(.*)$/.exec(lineas[i]);
        if (!m2) break;
        items.push(parsearRuns(m2[1]));
        i++;
      }
      bloques.push({ tipo: "lista", ordenada: true, items });
      continue;
    }
    parrafo.push(l.trim());
    i++;
  }
  cerrarParrafo();
  return bloques;
}

// ────────────────────────────────────────────────────────────────────────────
// 3 · DOCX — la caja ZIP con XML de WordprocessingML dentro
// ────────────────────────────────────────────────────────────────────────────

/** Escape XML + limpieza de caracteres que XML 1.0 NO permite. */
export function xmlEsc(texto: unknown): string {
  return String(texto ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function docxRunInterno(r: Run): string {
  const extras: string[] = [];
  if (r.codigo) extras.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
  if (r.negrita) extras.push("<w:b/>");
  if (r.cursiva) extras.push("<w:i/>");
  const rPr = extras.length ? `<w:rPr>${extras.join("")}</w:rPr>` : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(r.texto)}</w:t></w:r>`;
}

function docxParrafo(contenido: string, pPr = ""): string {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${contenido}</w:p>`;
}

const DOCX_BORDES_TABLA =
  '<w:tblBorders>' +
  ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((lado) => `<w:${lado} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
    .join("") +
  "</w:tblBorders>";

/** Bloques → cuerpo de document.xml. Listas con viñetas/índices literales (declarado arriba). */
export function docxCuerpo(bloques: Bloque[]): string {
  const partes: string[] = [];
  for (const b of bloques) {
    if (b.tipo === "titulo") {
      const estilo = `Heading${Math.min(Math.max(1, b.nivel) || 1, 4)}`;
      partes.push(docxParrafo(docxRunInterno({ texto: b.texto }), `<w:pStyle w:val="${estilo}"/>`));
    } else if (b.tipo === "parrafo") {
      partes.push(docxParrafo(b.runs.map(docxRunInterno).join("")));
    } else if (b.tipo === "lista") {
      b.items.forEach((runs, idx) => {
        const prefijo = b.ordenada ? `${idx + 1}. ` : "• ";
        partes.push(
          docxParrafo(
            docxRunInterno({ texto: prefijo }) + runs.map(docxRunInterno).join(""),
            '<w:ind w:left="425" w:hanging="0"/>',
          ),
        );
      });
    } else if (b.tipo === "codigo") {
      for (const l of b.lineas.length ? b.lineas : [""]) {
        partes.push(
          docxParrafo(
            docxRunInterno({ texto: l, codigo: true }),
            '<w:pStyle w:val="Codigo"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>',
          ),
        );
      }
    } else if (b.tipo === "tabla") {
      const nCol = Math.max(1, b.cabecera.length, ...b.filas.map((f) => f.length));
      const fila = (celdas: string[], negrita: boolean) =>
        "<w:tr>" +
        Array.from({ length: nCol }, (_, i) =>
          `<w:tc><w:p>${docxRunInterno({ texto: celdas[i] ?? "", negrita })}</w:p></w:tc>`).join("") +
        "</w:tr>";
      const filas = [fila(b.cabecera, true), ...b.filas.map((f) => fila(f, false))].join("");
      partes.push(
        `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${DOCX_BORDES_TABLA}</w:tblPr>` +
          `<w:tblGrid>${Array.from({ length: nCol }, () => '<w:gridCol w:w="2000"/>').join("")}</w:tblGrid>${filas}</w:tbl>`,
      );
      partes.push(docxParrafo("")); // Word exige un párrafo entre tablas pegadas
    }
  }
  return partes.join("");
}

const DOCX_STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  [
    ["Heading1", "heading 1", 32, 1],
    ["Heading2", "heading 2", 28, 2],
    ["Heading3", "heading 3", 25, 3],
    ["Heading4", "heading 4", 23, 4],
  ]
    .map(([id, nombre, sz, nivel]) =>
      `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nombre}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>` +
      `<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="${Number(nivel) - 1}"/></w:pPr>` +
      `<w:rPr><w:b/><w:color w:val="1F3863"/><w:sz w:val="${sz}"/></w:rPr></w:style>`)
    .join("") +
  '<w:style w:type="paragraph" w:styleId="Codigo"><w:name w:val="Codigo"/><w:basedOn w:val="Normal"/>' +
  '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>' +
  "</w:styles>";

function docxContenidoTipos(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    "</Types>";
}

const relsRaiz = (destino: string) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${destino}"/>` +
  "</Relationships>";

const DOCX_RELS_DOCUMENTO =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

const DOCX_SECTPR =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>';

/** markdown → bytes DOCX. Puro, determinista. */
export function construirDocx(markdown: string, opts: { titulo?: string } = {}): Uint8Array {
  const bloques = parsearDocumento(markdown);
  let cuerpo = "";
  if (opts.titulo) {
    cuerpo += docxParrafo(docxRunInterno({ texto: opts.titulo, negrita: true }), '<w:pStyle w:val="Heading1"/>');
  }
  cuerpo += docxCuerpo(bloques) || docxParrafo(docxRunInterno({ texto: "(vacío)" }));
  const documento =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${cuerpo}${DOCX_SECTPR}</w:body></w:document>`;
  const utf8 = new TextEncoderCompat();
  const txt = (s: string) => Uint8Array.from(utf8.encode(s));
  return zipStore([
    { nombre: "[Content_Types].xml", datos: txt(docxContenidoTipos()) },
    { nombre: "_rels/.rels", datos: txt(relsRaiz("word/document.xml")) },
    { nombre: "word/_rels/document.xml.rels", datos: txt(DOCX_RELS_DOCUMENTO) },
    { nombre: "word/document.xml", datos: txt(documento) },
    { nombre: "word/styles.xml", datos: txt(DOCX_STYLES) },
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// 4 · XLSX — libros, hojas, celdas. SIN FÓRMULAS JAMÁS (defensa declarada).
// ────────────────────────────────────────────────────────────────────────────

export interface HojaDatos {
  nombre?: string;
  cabeceras?: string[];
  filas?: unknown[][];
}
export interface ResultadoXlsx {
  bytes: Uint8Array;
  hojas: string[];
  celdas: number;
}

export const LIMITES_XLSX = { MAX_CELDAS: 100_000, MAX_COLUMNAS: 1_000 };

/** "A".."Z","AA".. — columna base-26. */
export function letraColumna(i0: number): string {
  let n = i0 + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Nombre de hoja legal: sin []:*?/\, ≤31, no vacío, sin duplicados. */
export function sanearNombreHoja(bruto: unknown, indice: number, usadas: Set<string>): string {
  let n = String(bruto ?? "").replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31);
  if (!n || /^(historia|history)$/i.test(n)) n = `Hoja${indice + 1}`;
  let base = n; let k = 2;
  while (usadas.has(n.toLowerCase())) n = `${base.slice(0, 28)} (${k++})`;
  usadas.add(n.toLowerCase());
  return n;
}

function esNumeroExacto(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function celdaXlsx(coord: string, valor: unknown, estilo: number): { xml: string; contada: boolean } {
  if (valor === null || valor === undefined || valor === "") return { xml: "", contada: false };
  const s = estilo ? ` s="${estilo}"` : "";
  if (esNumeroExacto(valor)) return { xml: `<c r="${coord}"${s}><v>${valor}</v></c>`, contada: true };
  if (typeof valor === "boolean") return { xml: `<c r="${coord}"${s} t="b"><v>${valor ? 1 : 0}</v></c>`, contada: true };
  // TODO lo demás es TEXTO INLINE: aunque empiece con "=", "≠" o "@". Nunca <f>.
  return { xml: `<c r="${coord}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(valor))}</t></is></c>`, contada: true };
}

/** hojas (estructura JSON) → bytes XLSX + recuento honesto. */
export function construirXlsx(hojas: HojaDatos[]): ResultadoXlsx {
  const lista = Array.isArray(hojas) ? hojas : [];
  if (lista.length === 0) throw new Error("XLSX necesita al menos una hoja (filas: [[...]]).");
  const usadas = new Set<string>();
  const nombres: string[] = [];
  const utf8 = new TextEncoderCompat();
  const txt = (s: string) => Uint8Array.from(utf8.encode(s));
  let celdas = 0;

  const entradasSheets: EntradaZip[] = [];
  const overrides: string[] = [];
  const relsHojas: string[] = [];
  lista.forEach((hoja, idx) => {
    const nombre = sanearNombreHoja(hoja.nombre, idx, usadas);
    nombres.push(nombre);
    const filas: unknown[][] = [];
    if (Array.isArray(hoja.cabeceras) && hoja.cabeceras.length) filas.push(hoja.cabeceras.map((c) => String(c ?? "")));
    if (Array.isArray(hoja.filas)) for (const f of hoja.filas) filas.push(Array.isArray(f) ? f : [f]);
    const nCols = Math.min(LIMITES_XLSX.MAX_COLUMNAS, Math.max(1, ...filas.map((f) => f.length)));
    const anchos: number[] = [];
    for (let c = 0; c < nCols; c++) {
      let max = 8;
      for (const f of filas) max = Math.max(max, Math.min(40, String(f[c] ?? "").length + 2));
      anchos.push(max);
    }
    let data = "";
    filas.forEach((f, ri) => {
      let celdasXml = "";
      for (let c = 0; c < nCols; c++) {
        const estilo = hoja.cabeceras && hoja.cabeceras.length && ri === 0 ? 1 : 0;
        const r = celdaXlsx(`${letraColumna(c)}${ri + 1}`, f[c], estilo);
        celdasXml += r.xml;
        if (r.contada) celdas++;
      }
      data += `<row r="${ri + 1}">${celdasXml}</row>`;
    });
    if (celdas > LIMITES_XLSX.MAX_CELDAS) {
      throw new Error(`XLSX excede el tope de ${LIMITES_XLSX.MAX_CELDAS} celdas (${celdas} hasta la hoja «${nombre}»). Partí en varios archivos.`);
    }
    const congelar = hoja.cabeceras && hoja.cabeceras.length
      ? '<sheetViews><sheetView><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : "";
    const xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      congelar +
      `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
      `<sheetData>${data}</sheetData></worksheet>`;
    entradasSheets.push({ nombre: `xl/worksheets/sheet${idx + 1}.xml`, datos: txt(xml) });
    overrides.push(`<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    relsHojas.push(`<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`);
  });

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${nombres.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const relsWorkbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relsHojas.join("") +
    `<Relationship Id="rId${lista.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides.join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>";
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    "</styleSheet>";
  const bytes = zipStore([
    { nombre: "[Content_Types].xml", datos: txt(contentTypes) },
    { nombre: "_rels/.rels", datos: txt(relsRaiz("xl/workbook.xml")) },
    { nombre: "xl/workbook.xml", datos: txt(workbook) },
    { nombre: "xl/_rels/workbook.xml.rels", datos: txt(relsWorkbook) },
    { nombre: "xl/styles.xml", datos: txt(styles) },
    ...entradasSheets,
  ]);
  return { bytes, hojas: nombres, celdas };
}

// ────────────────────────────────────────────────────────────────────────────
// 5 · PDF — escrito a mano sobre las 14 fuentes base (sin embeber nada)
// ────────────────────────────────────────────────────────────────────────────
// Formato: PDF 1.4. Catálogo → Pages → N páginas con su Content stream. Fuentes
// /standard 14 (Helvetica, Helvetica-Bold, Courier) referenciadas sin embeber:
// TODO lector PDF las tiene. Codificación WinAnsiEncoding: el latín-1 completo
// entra byte a byte; lo demás se sustituye y se DECLARA.
//
// El ancho de línea se calcula con las tablas AFM reales de las 14 base: el
// word-wrap es de verdad, no un corte a N caracteres (que era lo que salía mal
// en los «informes» de otros intentos). La negrita usa la misma tabla con
// factor conservador 1.08: nunca desborda el margen, a veces respira de más.

/** Anchos Helvetica por centésima de em, códigos 32..126 (AFM estándar). */
const ANCHOS_HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

type FuentePdf = "F1" | "F2" | "F3"; // F1 Helvetica · F2 Helvetica-Bold · F3 Courier

function anchoCaracter(cp: number, fuente: FuentePdf): number {
  if (fuente === "F3") return 600;
  if (cp >= 32 && cp <= 126) {
    const base = ANCHOS_HELV[cp - 32];
    return fuente === "F2" ? Math.round(base * 1.08) : base;
  }
  if (cp === 32) return 278;
  return 556; // latín-1 con acentos: aproximación conservadora
}

/** Medida en puntos de una cadena YA en WinAnsi (bytes ≤255 por carácter). */
function anchoTexto(gancho: string, fuente: FuentePdf, tamano: number): number {
  let n = 0;
  for (let i = 0; i < gancho.length; i++) n += anchoCaracter(gancho.charCodeAt(i) & 0xff, fuente);
  return (n * tamano) / 1000;
}

/** Sustituciones tipográficas honestas (curvas→rectas, etc.) ANTES del recorte. */
const GLIFOS_AMIGOS: Record<number, number> = {
  0x2018: 0x27, 0x2019: 0x27, 0x201b: 0x27, // ‘ ’ ‚ → '
  0x201c: 0x22, 0x201d: 0x22, 0x201e: 0x22, // “ ” „ → "
  0x2013: 0x2d, 0x2014: 0x2d, 0x2011: 0x2d, // – — ‑ → -
  0x2026: 0x7e, // … → ~ (no "..." para no agrandar)
  0x00a0: 0x20, 0x2007: 0x20, 0x200a: 0x20, 0x202f: 0x20, // espacios raros → espacio
  0x2022: 0x2d, // • → - (en párrafos; las viñetas propias ya son "-"->"•" WinAnsi 0x95 no: se dibuja con "-")
};

export interface WinAnsiResultado { gancho: string; sustituidos: number }

/** UTF-16 → cadena de bytes WinAnsi (latin1) contando lo que hubo que cambiar. */
export function aWinAnsi(texto: string): WinAnsiResultado {
  let sustituidos = 0;
  let out = "";
  for (const ch of String(texto ?? "")) {
    let cp = ch.codePointAt(0)!;
    if (GLIFOS_AMIGOS[cp] !== undefined) cp = GLIFOS_AMIGOS[cp];
    if (cp === 0x95) cp = 0x2d; // por si alguien pasó viñeta directa: mejor "-" en PDF
    if (cp >= 0x20 && cp <= 0x7e) { out += String.fromCharCode(cp); continue; }
    if (cp >= 0xa1 && cp <= 0xff) { out += String.fromCharCode(cp); continue; } // latín-1 derecho (¡ ¢ ñ ¿ ü ü...)
    if (cp === 0xa0) cp = 0x20;
    if (cp === 0) continue; // nulos: fuera sin más
    sustituidos++;
    out += "?";
  }
  return { gancho: out, sustituidos };
}

function escSPdf(gancho: string): string {
  return gancho.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

interface OpTexto { x: number; y: number; fuente: FuentePdf; tam: number; gancho: string }
interface OpLinea { x1: number; y1: number; x2: number; y2: number; ancho: number }
type Op = OpTexto | OpLinea;
const esLinea = (o: Op): o is OpLinea => (o as OpLinea).x1 !== undefined;

const PDF = {
  ANCHO: 595.28, ALTO: 841.89,
  IZQ: 56.7, DER: 595.28 - 56.7,
  ARRIBA: 841.89 - 62.4, ABAJO: 62.4,
};
const TAMANO_BASE = 11;
const ALTURA_MIN = 14; // salto mínimo entre líneas

export interface ResultadoPdf {
  bytes: Uint8Array;
  paginas: number;
  /** Cuántos caracteres NO latín-1 (emoji, CJK…) se sustituyeron por "?" (no se esconde). */
  caracteresSustituidos: number;
}

/**
 * markdown → PDF. Dos pasadas: maquetar (líneas con estilo, tablas, saltos) y
 * escribir objetos con offsets exactos para el xref. Sin fechas ni aleatoriedad:
 * mismo texto, mismos bytes.
 */
export function construirPdf(markdown: string, opts: { titulo?: string } = {}): ResultadoPdf {
  const paginas: Op[][] = [[]];
  let ops = paginas[0];
  let y = PDF.ARRIBA;
  let sustituidos = 0;

  const escribir = (s: string, fuente: FuentePdf, tam: number, x: number, yy: number): void => {
    const w = aWinAnsi(s);
    sustituidos += w.sustituidos;
    ops.push({ x, y: yy, fuente, tam, gancho: w.gancho });
  };
  const bajar = (salto: number): void => {
    y -= salto;
    if (y < PDF.ABAJO + salto) { paginas.push([]); ops = paginas[paginas.length - 1]; y = PDF.ARRIBA; }
  };

  /** Word-wrap REAL con anchos de fuente. Alinea cada línea en x0; el resto sangra a sangria. */
  const parrafo = (runs: { t: string; f: FuentePdf; s: number }[], sangria = 0): void => {
    const sangriaContinuacion = sangria;
    let x = PDF.IZQ + sangria;
    let linea: { x: number; fuente: FuentePdf; tam: number; gancho: string }[] = [];
    const volcar = (): void => {
      if (!linea.length) return;
      ops.push(...linea.map((r) => ({ ...r, y })));
      linea = [];
      bajar(TAMANO_BASE * 1.45);
      x = PDF.IZQ + sangriaContinuacion;
    };
    for (const r of runs) {
      const tokens = r.t.match(/\s+|\S+/g) || [];
      let pendiente = "";
      for (const tokRaw of tokens) {
        const tok = pendiente + tokRaw;
        pendiente = "";
        let wTok = anchoTexto(aWinAnsi(tok).gancho, r.f, r.s);
        if (x + wTok > PDF.DER && x > PDF.IZQ + sangriaContinuacion) { volcar(); }
        wTok = anchoTexto(aWinAnsi(tok).gancho, r.f, r.s);
        if (wTok > PDF.DER - (PDF.IZQ + sangriaContinuacion) && /\S/.test(tok)) {
          // palabra más ancha que la línea: corte duro por caracteres
          let chunk = "";
          for (const chr of tok) {
            const wC = anchoTexto(aWinAnsi(chunk + chr).gancho, r.f, r.s);
            if (x + wC > PDF.DER && chunk) {
              linea.push({ x, fuente: r.f, tam: r.s, gancho: aWinAnsi(chunk).gancho });
              volcar();
              chunk = chr;
            } else chunk += chr;
          }
          pendiente = chunk;
          continue;
        }
        linea.push({ x, fuente: r.f, tam: r.s, gancho: aWinAnsi(tok).gancho });
        x += wTok;
        if (/\s/.test(tok) && x > PDF.DER - 4) volcar();
      }
    }
    volcar();
  };

  // Título del documento (si lo hay)
  if (opts.titulo) {
    const w = aWinAnsi(opts.titulo); sustituidos += w.sustituidos;
    ops.push({ x: PDF.IZQ, y, fuente: "F2", tam: 19, gancho: w.gancho });
    bajar(26);
  }

  for (const b of parsearDocumento(markdown)) {
    if (b.tipo === "titulo") {
      bajar(6);
      const tam = [0, 16, 13.5, 12, 11.5, 11, 11][b.nivel] || 11.5;
      parrafo([{ t: b.texto, f: "F2", s: tam }]);
      bajar(3);
    } else if (b.tipo === "parrafo") {
      parrafo(b.runs.map((r) => ({ t: r.texto, f: (r.negrita || r.codigo ? "F2" : "F1") as FuentePdf, s: TAMANO_BASE })));
      bajar(5);
    } else if (b.tipo === "lista") {
      b.items.forEach((runs, idx) => {
        const pref = b.ordenada ? `${idx + 1}.` : "-";
        parrafo([{ t: pref + "  ", f: "F1", s: TAMANO_BASE }, ...runs.map((r) => ({ t: r.texto, f: (r.negrita ? "F2" : "F1") as FuentePdf, s: TAMANO_BASE }))], 14);
      });
      bajar(4);
    } else if (b.tipo === "codigo") {
      for (const l of (b.lineas.length ? b.lineas : [""])) {
        const chunk = aWinAnsi(l.replace(/\t/g, "  ")); sustituidos += chunk.sustituidos;
        while (anchoTexto(chunk.gancho, "F3", 9) > PDF.DER - PDF.IZQ - 14) {
          // corte duro de líneas larguísimas de código
          ops.push({ x: PDF.IZQ + 14, y, fuente: "F3", tam: 9, gancho: chunk.gancho.slice(0, Math.floor(((PDF.DER - PDF.IZQ - 14) * 1000) / 600)) });
          bajar(11.5);
          chunk.gancho = chunk.gancho.slice(Math.floor(((PDF.DER - PDF.IZQ - 14) * 1000) / 600));
        }
        ops.push({ x: PDF.IZQ + 14, y, fuente: "F3", tam: 9, gancho: chunk.gancho });
        bajar(11.5);
      }
      bajar(4);
    } else if (b.tipo === "tabla") {
      const nCol = Math.max(1, b.cabecera.length, ...b.filas.map((f) => f.length));
      const tam = 9;
      const disponible = PDF.DER - PDF.IZQ;
      const anchosCol: number[] = [];
      const medir = (s: string) => anchoTexto(aWinAnsi(s).gancho, "F1", tam);
      for (let c = 0; c < nCol; c++) {
        let wAncho = medir("0000");
        for (const f of [b.cabecera, ...b.filas]) wAncho = Math.max(wAncho, medir(String(f[c] ?? "")) + 8);
        anchosCol.push(wAncho);
      }
      const total = anchosCol.reduce((a, v) => a + v, 0) || 1;
      for (let c = 0; c < nCol; c++) anchosCol[c] = Math.max(40, (anchosCol[c] / total) * disponible);
      const escala = disponible / anchosCol.reduce((a, v) => a + v, 0);
      for (let c = 0; c < nCol; c++) anchosCol[c] *= escala;
      const filasTodas = [b.cabecera.map(String), ...b.filas.map((f) => f.map(String))];
      const altoFila = tam * 1.8;
      filasTodas.forEach((fila, ri) => {
        if (y - altoFila < PDF.ABAJO) { paginas.push([]); ops = paginas[paginas.length - 1]; y = PDF.ARRIBA; }
        let x = PDF.IZQ;
        for (let c = 0; c < nCol; c++) {
          let textoC = aWinAnsi(fila[c] ?? "").gancho;
          while (anchoTexto(textoC, ri === 0 ? "F2" : "F1", tam) > anchosCol[c] - 8 && textoC.length > 1) textoC = textoC.slice(0, -2);
          ops.push({ x: x + 4, y, fuente: ri === 0 ? "F2" : "F1", tam, gancho: textoC });
          x += anchosCol[c];
        }
        // rejilla: línea inferior de la fila
        ops.push({ x1: PDF.IZQ, y1: y - tam * 0.9, x2: PDF.DER, y2: y - tam * 0.9, ancho: ri === 0 ? 0.9 : 0.4 });
        y -= altoFila;
      });
      // Rejilla: sólo horizontales por fila (una tabla que parte página no puede
      // pagar verticales de una sola pasada: se dibujan donde nace cada fila).
      y -= 6;
    }
  }
  if (!paginas.length) paginas.push([]);

  // ── Escritura de objetos e xref exacto ──────────────────────────────────
  // ids: 1 catálogo · 2 Pages · 3..(2+n) páginas · (3+n) F1 · (4+n) F2 · (5+n) F3 ·
  // streams (6+n)..(5+2n). El xref lleva el offset de bytes REAL de cada objeto:
  // una coma de más y el PDF queda ilegible. Sin fechas ni aleatoriedad: mismo
  // texto, mismos bytes.
  const nPag = paginas.length;
  const fuenteId: Record<FuentePdf, number> = { F1: 3 + nPag, F2: 4 + nPag, F3: 5 + nPag };

  const cuerpoPagina = (i: number): string => {
    const pie = `Página ${i + 1} de ${nPag}`;
    const pieOp: OpTexto = { x: (PDF.ANCHO - anchoTexto(pie, "F1", 8)) / 2, y: 40, fuente: "F1", tam: 8, gancho: pie };
    let flujo = "";
    for (const o of [...paginas[i], pieOp]) {
      if (esLinea(o)) flujo += `${o.ancho} w ${o.x1.toFixed(1)} ${o.y1.toFixed(1)} m ${o.x2.toFixed(1)} ${o.y2.toFixed(1)} l S\n`;
      else flujo += `BT /${o.fuente} ${o.tam} Tf 1 0 0 1 ${o.x.toFixed(1)} ${o.y.toFixed(1)} Tm (${escSPdf(o.gancho)}) Tj ET\n`;
    }
    return flujo;
  };

  const cuerpos: string[] = []; // índice = id - 1
  cuerpos[0] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  cuerpos[1] = `2 0 obj\n<< /Type /Pages /Kids [${paginas.map((_, i) => `${3 + i} 0 R`).join(" ")}] /Count ${nPag} >>\nendobj\n`;
  for (let i = 0; i < nPag; i++) {
    const streamId = 6 + nPag + i;
    cuerpos[2 + i] =
      `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF.ANCHO.toFixed(2)} ${PDF.ALTO.toFixed(2)}] ` +
      `/Resources << /Font << /F1 ${fuenteId.F1} 0 R /F2 ${fuenteId.F2} 0 R /F3 ${fuenteId.F3} 0 R >> >> ` +
      `/Contents ${streamId} 0 R >>\nendobj\n`;
  }
  const fuente = (id: number, base: string): string =>
    `${id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>\nendobj\n`;
  cuerpos[fuenteId.F1 - 1] = fuente(fuenteId.F1, "Helvetica");
  cuerpos[fuenteId.F2 - 1] = fuente(fuenteId.F2, "Helvetica-Bold");
  cuerpos[fuenteId.F3 - 1] = fuente(fuenteId.F3, "Courier");
  for (let i = 0; i < nPag; i++) {
    const id = 6 + nPag + i;
    const flujo = Buffer.from(cuerpoPagina(i), "latin1");
    cuerpos[id - 1] = `${id} 0 obj\n<< /Length ${flujo.length} >>\nstream\n${flujo.toString("latin1")}\nendstream\nendobj\n`;
  }

  const totalObjs = 5 + 2 * nPag;
  const cabecera = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const trozos: Buffer[] = [cabecera];
  const offsets: number[] = new Array(totalObjs + 1).fill(0);
  let cursor = cabecera.length;
  for (let id = 1; id <= totalObjs; id++) {
    offsets[id] = cursor;
    const b = Buffer.from(cuerpos[id - 1] ?? "", "latin1");
    trozos.push(b);
    cursor += b.length;
  }
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjs; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  trozos.push(Buffer.from(xref, "latin1"));
  return { bytes: new Uint8Array(Buffer.concat(trozos)), paginas: nPag, caracteresSustituidos: sustituidos };
}

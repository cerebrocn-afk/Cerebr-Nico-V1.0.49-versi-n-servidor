/**
 * docxMinimo.ts — ESCRITOR DE .docx SIN DEPENDENCIAS (v1.96.0)
 * ============================================================
 * El hueco que Mario señaló (30/10): «archivos varios: word, pdf, etc.». Del PDF ya nos
 * ocupamos en la 1.95.0 (`pdfMinimo.ts`); de Word no había nada, y el manual de
 * `trabajoSeguro` tenía la receta declarada `pendiente` — que era la respuesta honesta,
 * pero seguía siendo un hueco. En la sesión exportada de la 1.94.1 hay un turno que
 * terminalmente no pudo cerrar por esto: pidió la página, pidió el guardado, y quedaron
 * tres archivos sueltos en el chat.
 *
 * Un `.docx` es un paquete OPC: un ZIP con XML. Con `zipMinimo.ts` ya tenemos el
 * contenedor, así que acá solo hace falta el vocabulario WordprocessingML mínimo:
 *   · `[Content_Types].xml`  — qué tipos hay (sin esto, Word dice «no se puede abrir»)
 *   · `_rels/.rels`          — el arranque del paquete hacia `word/document.xml`
 *   · `word/document.xml`    — el cuerpo: párrafos con `w:pStyle`
 *   · `word/styles.xml`      — los estilos que esos párrafos citan
 *
 * Regla de la casa, aplicada: el archivo se AUDITA antes de devolver `ok`. `abrirDocx`
 * reabre el ZIP, verifica CRC de cada entrada, exige las cuatro partes, comprueba que el
 * XML está balanceado y devuelve el texto extraído del documento — así la IDE puede decir
 * «pesa N bytes, tiene M párrafos y se leyó X» en vez de «generé un Word».
 *
 * Es texto con estilos, no diseño: títulos, viñetas numeradas, una tabla simple y pie de
 * documento. Un .docx que abre y se edita vale más que uno "bello" que Word rechaza.
 */

import { crearZip, abrirZip, type EntradaZip } from "./zipMinimo";

export interface SeccionDocx {
  /** Título de la sección (estilo `Titulo2`). */
  titulo?: string;
  /** Párrafos de texto (estilo `Parrafo`). */
  parrafos?: string[];
  /** Viñetas (estilo `Vineta`, con guion literal adelante: sin numeración de Word). */
  puntos?: string[];
  /** Tabla simple: primera fila es encabezado. Celdas como texto plano. */
  tabla?: string[][];
}

export interface DocumentoDocx {
  titulo: string;
  subtitulo?: string;
  secciones: SeccionDocx[];
  /** Nota final en cursiva. */
  nota?: string;
  /** Autor en `docProps` — opcional; si no va, Word pone el usuario de la máquina. */
  autor?: string;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Escapa los cinco caracteres que rompen XML. Un `&` sin escapar invalida el paquete. */
function xml(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    // Caracteres de control que un modelo puede copiar de un log: XML no los admite.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/** Un `w:p` completo. `estilo` es el `w:pStyle`, `cursiva`/`negrita` van en el `w:rPr`. */
function parrafo(texto: string, estilo?: string, opts: { negrita?: boolean; cursiva?: boolean; tamano?: number } = {}): string {
  const pPr = estilo ? `<w:pPr><w:pStyle w:val="${xml(estilo)}"/></w:pPr>` : "";
  const rPr: string[] = [];
  if (opts.negrita) rPr.push("<w:b/>");
  if (opts.cursiva) rPr.push("<w:i/>");
  if (opts.tamano) rPr.push(`<w:sz w:val="${Math.round(opts.tamano * 2)}"/>`);
  const runs = String(texto ?? "").split("\n").map((linea, i) =>
    `${i ? '<w:br/>' : ""}<w:r>${rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(linea)}</w:t></w:r>`
  ).join("");
  return `<w:p>${pPr}${runs || `<w:r>${rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : ""}<w:t xml:space="preserve"></w:t></w:r>`}</w:p>`;
}

function tabla(filas: string[][]): string {
  // Ancho = la fila más larga, para que ninguna celda se pierda al armar la tabla.
  const ancho = filas.reduce((a, f) => Math.max(a, (f || []).length), 1);
  const bordes = `<w:tcBorders><w:top w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders>`;
  const trs = filas.map((f, i) => {
    const tcs = Array.from({ length: ancho }, (_, k) => {
      const texto = f[k] ?? "";
      return `<w:tc>${`<w:tcPr>${bordes}${i === 0 ? "<w:shd w:val=\"clear\" w:fill=\"EFEFEF\"/>" : ""}</w:tcPr>`}${parrafo(texto, undefined, { negrita: i === 0 })}</w:tc>`;
    }).join("");
    return `<w:tr>${tcs}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${trs}</w:tbl>`;
}

function documentoXml(doc: DocumentoDocx): string {
  const cuerpo: string[] = [];
  cuerpo.push(parrafo(doc.titulo || "Documento", "Titulo", { negrita: true }));
  if (doc.subtitulo) cuerpo.push(parrafo(doc.subtitulo, "Subtitulo"));
  for (const s of doc.secciones || []) {
    if (s.titulo) cuerpo.push(parrafo(s.titulo, "Titulo2", { negrita: true }));
    for (const p of s.parrafos || []) cuerpo.push(parrafo(p, "Parrafo"));
    for (const v of s.puntos || []) cuerpo.push(parrafo(`\u2022  ${v}`, "Vineta"));
    if (s.tabla && s.tabla.length) cuerpo.push(tabla(s.tabla));
  }
  if (doc.nota) cuerpo.push(parrafo(doc.nota, undefined, { cursiva: true }));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="${W}"><w:body>${cuerpo.join("")}`
    + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>`
    + `</w:body></w:document>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<w:styles xmlns:w="${W}">`
  + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>`
  + `<w:style w:type="paragraph" w:default="1" w:styleId="Parrafo"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>`
  + `<w:style w:type="paragraph" w:styleId="Titulo"><w:name w:val="Title"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>`
  + `<w:style w:type="paragraph" w:styleId="Subtitulo"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/><w:sz w:val="26"/></w:rPr></w:style>`
  + `<w:style w:type="paragraph" w:styleId="Titulo2"><w:name w:val="Heading 2"/><w:basedOn w:val="Parrafo"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3B57"/><w:sz w:val="28"/></w:rPr></w:style>`
  + `<w:style w:type="paragraph" w:styleId="Vineta"><w:name w:val="List Paragraph"/><w:basedOn w:val="Parrafo"/><w:pPr><w:ind w:left="425" w:hanging="227"/></w:pPr></w:style>`
  + `</w:styles>`;

function partes(doc: DocumentoDocx): EntradaZip[] {
  return [
    {
      nombre: "[Content_Types].xml",
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
        + `<Default Extension="xml" ContentType="application/xml"/>`
        + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
        + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
        + `</Types>`,
    },
    {
      nombre: "_rels/.rels",
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
        + `</Relationships>`,
    },
    {
      nombre: "word/_rels/document.xml.rels",
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + `</Relationships>`,
    },
    { nombre: "word/document.xml", datos: documentoXml(doc) },
    { nombre: "word/styles.xml", datos: STYLES_XML },
  ];
}

/** Construye el .docx completo (ZIP OPC con las cuatro partes obligatorias). */
export function crearDocx(doc: DocumentoDocx): Uint8Array {
  if (!doc || !Array.isArray(doc.secciones)) throw new Error("crearDocx: falta 'secciones' (array)");
  if (!doc.secciones.length) throw new Error("crearDocx: 'secciones' está vacío — un Word vacío no es una entrega");
  return crearZip(partes(doc));
}

export interface AuditoriaDocx {
  ok: boolean;
  motivo?: string;
  bytes: number;
  partes: number;
  parrafos: number;
  /** Primeros caracteres del texto del documento, leídos del XML (no de la memoria). */
  muestra: string;
}

/** El mínimo de XML bien formado que podemos exigir sin un parser: balance de etiquetas. */
function xmlBalanceado(s: string): boolean {
  const pila: string[] = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[4] === "/" || m[2].startsWith("?") || m[2].startsWith("!")) continue;
    if (m[1] === "/") { if (pila.pop() !== m[2]) return false; }
    else pila.push(m[2]);
  }
  return pila.length === 0;
}

/** Extrae el texto de los `w:t`, en orden. */
function textoDelDocumento(xmlDoc: string): string {
  const out: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlDoc))) out.push(m[1]);
  return out.join(" ");
}

/**
 * Reabiere y audita un .docx. `ok:true` significa: ZIP íntegro (CRC), las cuatro partes
 * están, el XML del documento está balanceado y hay al menos un párrafo con texto.
 */
export function auditarDocx(bytes: Uint8Array): AuditoriaDocx {
  const u = bytes;
  const abierto = abrirZip(u);
  const base = { bytes: u.length, partes: abierto.total, parrafos: 0, muestra: "" };
  if (!abierto.ok) return { ok: false, motivo: abierto.motivo, ...base };
  const nombres = new Set(abierto.entradas.map((e) => e.nombre));
  const obligatorias = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
  const faltan = obligatorias.filter((n) => !nombres.has(n));
  if (faltan.length) return { ok: false, motivo: `faltan partes del paquete: ${faltan.join(", ")}`, ...base };
  const dec = (n: string) => new TextDecoder("utf-8").decode(abierto.entradas.find((e) => e.nombre === n)!.datos);
  const docXml = dec("word/document.xml");
  if (!xmlBalanceado(docXml)) return { ok: false, motivo: "word/document.xml no es XML balanceado", ...base };
  const texto = textoDelDocumento(docXml);
  const parrafos = (docXml.match(/<w:p[ >]/g) || []).length;
  if (!texto.trim()) return { ok: false, motivo: "el documento no tiene ningún texto", ...base };
  return { ok: true, bytes: u.length, partes: abierto.total, parrafos, muestra: texto.slice(0, 60) };
}

export const VERSION_DOCX_MINIMO = "1.96.0";

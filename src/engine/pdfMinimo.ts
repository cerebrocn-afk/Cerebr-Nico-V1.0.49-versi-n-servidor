/**
 * pdfMinimo.ts — LA MÁQUINA DE PDF DEL ARNÉS (v1.95.0)
 * ====================================================
 * POR QUÉ EXISTE. Mario (30/10): «si pido un PDF no se puede estar 15 mensajes para
 * hacerlo; con una llamada a herramienta basta». La causa no es el modelo: medida en
 * `package.json`, las dependencias son `@google/genai, esbuild, express, jszip,
 * pdfjs-dist…` — `pdfjs-dist` es un LECTOR, no un escritor — y no hay `pdfkit`, ni
 * `jspdf`, ni `docx`. El Python embebido trae 0 paquetes de pip (lo dice el propio
 * arranque), así que el `reportlab` que el modelo intenta invocar no está. El resultado
 * de siempre: el modelo se pone a ESCIBIR bytes de PDF como texto, el archivo sale con
 * extensión `.pdf` y contenido roto, y Edge dice «No podemos abrir este archivo».
 *
 * Un trabajo que el arnés no puede sostener no se promete: se construye. Este módulo
 * escribe PDF 1.4 válidos SIN ninguna dependencia nueva — tabla xref con corrimientos
 * de bytes calculados, fuentes base Helvetica (no se incrustan), streams sin comprimir
 * — y lo que produce lo valida el propio puente (`_op_fs_write_b64` relee `%PDF-`,
 * `%%EOF` y cuenta las páginas).
 *
 * Es texto, no diseño: títulos, párrafos, viñetas y una línea de pie. Un PDF de texto
 * que abre a la primera vale infinitamente más que un volante "diseñado" que no abre.
 */

/** Codifica texto para un literal de PDF: `\\`, `(` y `)` van escapados. */
function literalPdf(texto: string): string {
  return String(texto)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Los acentos viven en Latin-1 en las fuentes base; lo que Latin-1 no cubre se
    // translitera en vez de soltar bytes crudos que rompen el texto renderizado.
    .normalize("NFC");
}

const LATIN1 = /* @__PURE__ */ new Map<string, string>([
  ["—", "-"], ["–", "-"], ["“", '"'], ["”", '"'], ["‘", "'"], ["’", "'"],
  ["…", "..."], ["•", "-"], ["\u00a0", " "],
]);

function aLatin1(texto: string): string {
  let salida = "";
  for (const caracter of texto) salida += LATIN1.get(caracter) ?? caracter;
  return salida;
}

/** Corta en palabras, con tabulados a espacios. `ancho` es en caracteres aproximados. */
function envolver(texto: string, ancho: number, sangria = ""): string[] {
  const palabras = aLatin1(texto).replace(/\t/g, "  ").split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidato = actual ? `${actual} ${palabra}` : palabra;
    if (candidato.length > ancho && actual) { lineas.push(sangria + actual); actual = palabra; }
    else actual = candidato;
    if (candidato.length > ancho * 3) { lineas.push(sangria + actual); actual = ""; } // tope anti-palabra-infinita
  }
  if (actual) lineas.push(sangria + actual);
  return lineas.length ? lineas : [""];
}

export interface SeccionPdf {
  /** Título de la sección (va en Helvetica-Bold 12). */
  titulo: string;
  /** Párrafos de la sección (Helvetica 10.5, envueltos a la página). */
  parrafos?: string[];
  /** Viñetas cortas (prefijo "— "). */
  puntos?: string[];
}

export interface DocumentoPdf {
  titulo: string;
  subtitulo?: string;
  /** Fecha/línea de contexto bajo el título (texto libre, opcional). */
  fecha?: string;
  secciones: SeccionPdf[];
  /** Pie en todas las páginas (p. ej. "CerebroNico · generado 30/10/2026"). */
  pie?: string;
}

const ANCHO_PAGINA = 595.28; // A4 en puntos
const ALTO_PAGINA = 841.89;
const MARGEN = 56;
const ANCHO_TEXTO = ANCHO_PAGINA - MARGEN * 2;
const CARACTERES_POR_LINEA = 96;
const INTERLINEA = 14;

type Linea = { texto: string; fuente: "F1" | "F2"; tamano: number; saltoAntes: number };

/** Parte el documento en páginas, midiendo alturas. Devuelve una página por array. */
function paginar(doc: DocumentoPdf): Linea[][] {
  const lineas: Linea[] = [];
  const empujar = (texto: string, fuente: "F1" | "F2", tamano: number, saltoAntes = 0) => {
    for (const [i, l] of envolver(texto, fuente === "F2" ? tamano >= 16 ? 62 : 80 : CARACTERES_POR_LINEA).entries())
      lineas.push({ texto: l, fuente, tamano, saltoAntes: i === 0 ? saltoAntes : 0 });
  };

  empujar(doc.titulo || "Documento", "F2", 18, 0);
  if (doc.subtitulo) empujar(doc.subtitulo, "F1", 11, 6);
  if (doc.fecha) empujar(doc.fecha, "F1", 9, 2);
  lineas.push({ texto: "", fuente: "F1", tamano: 8, saltoAntes: 8 });

  for (const seccion of doc.secciones || []) {
    if (seccion.titulo) empujar(seccion.titulo, "F2", 12, 10);
    for (const parrafo of seccion.parrafos || []) empujar(parrafo, "F1", 10.5, 4);
    for (const punto of seccion.puntos || []) empujar(`-  ${punto}`, "F1", 10.5, 2);
  }

  const paginas: Linea[][] = [];
  let actual: Linea[] = [];
  let y = ALTO_PAGINA - MARGEN;
  for (const linea of lineas) {
    const altura = linea.saltoAntes + INTERLINEA;
    if (y - altura < MARGEN + 18) { paginas.push(actual); actual = []; y = ALTO_PAGINA - MARGEN; }
    y -= altura;
    actual.push(linea);
  }
  if (actual.length) paginas.push(actual);
  return paginas.length ? paginas : [[{ texto: "(vacio)", fuente: "F1", tamano: 11, saltoAntes: 0 }]];
}

function streamDePagina(lineas: Linea[], pie: string | undefined, indice: number, total: number): string {
  const ops: string[] = ["BT"];
  let y = ALTO_PAGINA - MARGEN;
  for (const linea of lineas) {
    y -= linea.saltoAntes;
    ops.push(`/${linea.fuente} ${linea.tamano} Tf`);
    ops.push(`1 0 0 1 ${MARGEN.toFixed(2)} ${y.toFixed(2)} Tm`);
    ops.push(`(${literalPdf(linea.texto)}) Tj`);
    y -= INTERLINEA;
  }
  ops.push("ET");
  const pieLinea = pie ? `${pie}` : "";
  const numerada = total > 1 ? `${pieLinea ? pieLinea + "  ·  " : ""}pagina ${indice + 1} de ${total}` : pieLinea;
  if (numerada) {
    ops.push("BT", `/F1 8 Tf`, `1 0 0 1 ${MARGEN.toFixed(2)} ${(MARGEN - 8).toFixed(2)} Tm`, `(${literalPdf(aLatin1(numerada))}) Tj`, "ET");
  }
  // Ancho de línea bajo el título, solo en la primera página: señal visual sin librerías.
  if (indice === 0) {
    ops.push(`0.55 0.62 0.78 RG`, `0.8 w`, `${MARGEN.toFixed(2)} ${(ALTO_PAGINA - MARGEN + 10).toFixed(2)} m`,
      `${(MARGEN + ANCHO_TEXTO).toFixed(2)} ${(ALTO_PAGINA - MARGEN + 10).toFixed(2)} l`, "S");
  }
  return ops.join("\n");
}

/**
 * Construye el PDF completo. `Uint8Array` (no string): un PDF es binario y el arnés lo
 * escribe con `fs_write_b64` / `writeFileSafe` en modo binario.
 */
export function construirPdf(doc: DocumentoPdf): Uint8Array {
  const paginas = paginar(doc);
  const total = paginas.length;
  // 1 Catalog · 2 Pages · 3 F1 · 4 F2 · luego por página: Page y Contents.
  const objetos: string[] = ["", /* 1 */
    `<< /Type /Catalog /Pages 2 0 R >>`,
    ``,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  ];
  const idsHojas: number[] = [];
  for (let i = 0; i < total; i++) idsHojas.push(5 + i * 2);
  objetos[2] = `<< /Type /Pages /Kids [${idsHojas.map((id) => `${id} 0 R`).join(" ")}] /Count ${total} >>`;

  const flujos: string[] = [];
  for (let i = 0; i < total; i++) {
    const idHoja = 5 + i * 2;
    const idFlujo = idHoja + 1;
    while (objetos.length < idHoja) objetos.push("");
    objetos[idHoja] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PAGINA.toFixed(2)} ${ALTO_PAGINA.toFixed(2)}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idFlujo} 0 R >>`;
    const flujo = streamDePagina(paginas[i], doc.pie, i, total);
    while (objetos.length < idFlujo) objetos.push("");
    objetos[idFlujo] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
    flujos.push(flujo);
  }

  const cabecera = "%PDF-1.4\n%\xE2\xE3\xCF\xD3 binario\n";
  let cuerpo = cabecera;
  const corrimientos: number[] = [];
  for (let id = 1; id < objetos.length; id++) {
    corrimientos[id] = cuerpo.length;
    cuerpo += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
  }
  const inicioXref = cuerpo.length;
  let xref = `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objetos.length; id++) xref += `${String(corrimientos[id]).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  // Latin-1: los bytes del PDF se escriben tal cual (WinAnsiEncoding), sin UTF-8 por
  // encima — que es justamente el error que producía el `.pdf` ilegible.
  const textoCompleto = cuerpo + xref + trailer;
  const bytes = new Uint8Array(textoCompleto.length);
  for (let i = 0; i < textoCompleto.length; i++) bytes[i] = textoCompleto.charCodeAt(i) & 0xff;
  return bytes;
}

/** Lo que el arnés debe poder afirmar sin adivinar: tamaño y páginas LEÍDAS. */
export function auditarPdf(bytes: Uint8Array | string): { ok: boolean; motivo?: string; bytes: number; paginas: number } {
  const buf = typeof bytes === "string" ? Uint8Array.from(bytes, (c) => c.charCodeAt(0) & 0xff) : bytes;
  const bin = Array.from(buf).map((b) => String.fromCharCode(b)).join("");
  const tam = buf.length;
  if (tam === 0) return { ok: false, motivo: "vacio", bytes: 0, paginas: 0 };
  if (!bin.startsWith("%PDF-")) return { ok: false, motivo: "no empieza con %PDF-", bytes: tam, paginas: 0 };
  if (!bin.slice(-1024).includes("%%EOF")) return { ok: false, motivo: "sin %%EOF al final (truncado)", bytes: tam, paginas: 0 };
  const count = /\/Count\s+(\d+)/.exec(bin);
  const paginas = count ? Number(count[1]) : (bin.match(/\/Type\s*\/Page(?![s])/g) || []).length;
  if (!paginas) return { ok: false, motivo: "el árbol de páginas no declara hojas", bytes: tam, paginas: 0 };
  return { ok: true, bytes: tam, paginas };
}

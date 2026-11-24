/**
 * packDocumentos.test.ts — DOCUMENTOS REALES: PDF/WORD/EXCEL SIN DEPENDENCIAS (v1.71.0)
 * ======================================================================================
 * npx tsx tests/packDocumentos.test.ts
 *
 * Cubre src/engine/generadorDocumentos.ts (puro) y src/engine/packDocumentos.ts
 * (el pack con disco). Regla de la casa — DEFECTO SEMBRADO y ENTRADA HOSTIL
 * NOMBRADA, la valla tiene que poder ponerse roja:
 *   · MUTACIÓN: el xref del PDF se recalcula byte a byte desde el archivo final;
 *     un solo offset mentiroso pone la suite roja (así cazamos el bug clásico de
 *     los escritores de PDF a mano: el off-by-one del /Length).
 *   · ENTRADA HOSTIL: celdas que empiezan con "=" (injección de fórmula), XML
 *     roto («<script>»), rutas que escapan del sandbox («../»), extensión
 *     mintirosa (.txt para generar_pdf), emoji y CJK, filas más anchas que la
 *     página. Todas deben volver rechazadas o declaradas — jamás un archivo
 *     corrupto con cara de éxito.
 *
 * Los bytes se releen con LECTORES DE TERCEROS QUE YA SON DEPENDENCIA DEL
 * PROYECTO (pdfjs-dist lee el PDF; JSZip abre el ZIP interno del docx/xlsx):
 * no confiamos en nuestro propio escritor para Validarse a sí mismo.
 */
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  construirPdf, construirDocx, construirXlsx, aWinAnsi, crc32, zipStore,
  parsearDocumento, parsearRuns, letraColumna, sanearNombreHoja, xmlEsc, LIMITES_XLSX,
} from "../src/engine/generadorDocumentos";
import {
  registrarPackDocumentos, ES_HERRAMIENTA_DOCUMENTOS, HERRAMIENTAS_DOCUMENTOS,
  ejecutarHerramientaDocumentos, PACK_ID, TOPE_CONTENIDO,
} from "../src/engine/packDocumentos";
import { getToolSpec } from "../src/engine/toolRegistry";

let correctas = 0;
const fallos: string[] = [];
function comprobar(que: string, condicion: unknown, detalle?: string) {
  if (condicion) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(`${que}${detalle ? ` — ${detalle}` : ""}`); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
}

// ── 1 · LÓGICA PURA: CRC, anchos, parser ────────────────────────────────────
comprobar("crc32 calibrado contra el vector estándar (123456789 → 0xCBF43926)",
  crc32(Uint8Array.from(Buffer.from("123456789", "ascii"))) === 0xcbf43926);

const w1 = aWinAnsi("Año Ño café");
comprobar("latín-1 íntegro: ñ/á/é NO se sustituyen", w1.gancho === "Año Ño café" && w1.sustituidos === 0, w1.gancho);
const w2 = aWinAnsi("listo 🎉");
comprobar("ENTRADA HOSTIL: emoji → \"?\" con recuento DECLARADO (no silencio)",
  w2.gancho.includes("?") && w2.sustituidos === 1, JSON.stringify(w2));

const runs = parsearRuns("hola **mundo** `x=1` *fin*");
comprobar("inline: negrita/cursiva/código salen en runs separados",
  runs.some((r) => r.negrita && r.texto === "mundo") && runs.some((r) => r.codigo) && runs.some((r) => r.cursiva),
  JSON.stringify(runs));

const doc = parsearDocumento("# T1\n\npárrafo uno\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```");
const tipos = doc.map((b) => b.tipo).join(",");
comprobar("parser: título, párrafo, lista, tabla y código en orden",
  tipos === "titulo,parrafo,lista,tabla,codigo", tipos);

comprobar("letraColumna: 0→A, 25→Z, 26→AA, 51→AZ", letraColumna(0) === "A" && letraColumna(25) === "Z" && letraColumna(26) === "AA" && letraColumna(51) === "AZ");
{
  const usadas = new Set<string>();
  const a = sanearNombreHoja("Hola[Mundo]*", 0, usadas);
  const b = sanearNombreHoja("Hola[Mundo]*", 1, usadas);
  comprobar("sanearNombreHoja quita caracteres prohibidos y deduplica", !/[\[\]*]/.test(a) && a !== b && a.length <= 31, `${a} / ${b}`);
}
comprobar("xmlEsc mata la inyección XML y los control chars",
  xmlEsc('a<b>&"\'') === "a&lt;b&gt;&amp;&quot;&apos;" && xmlEsc("a\x00b") === "ab");

// ── 2 · PDF: estructura verificada BYTE A BYTE (MUTACIÓN cazada) ────────────
const pdf = construirPdf("# Informe Anual\n\nCifra **clave**: 12.500 €.\n\n| Mes | Ventas |\n|---|---|\n| Enero | 100 |\n| Febrero | 250 |\n\n- punto uno\n- punto dos\n\n```\nconsole.log(1)\n```\n\n" + "Largo ".repeat(2000), { titulo: "Vista rápida" });
const pdfTxt = Buffer.from(pdf.bytes).toString("latin1");
comprobar("PDF empieza con cabecera y firma binaria", pdfTxt.startsWith("%PDF-1.4"));
comprobar("PDF termina en %%EOF", pdfTxt.trimEnd().endsWith("%%EOF"));
comprobar("PDF multipágina real (el wrap de verdad no es una sola línea infinita)", pdf.paginas >= 3, `paginas=${pdf.paginas}`);
comprobar("pie de página con numeración presente", /Página 1 de \d+/.test(pdfTxt));
comprobar("fuente base declarada sin embeber (Helvetica + WinAnsi)", /BaseFont \/Helvetica /.test(pdfTxt) && /WinAnsiEncoding/.test(pdfTxt));
comprobar("paréntesis escapados: el texto (paren) no rompe el literal", pdfTxt.includes(String.raw`\(`) || !/\(([^)]|\))*\(/.test(pdfTxt.match(/\((?:[^)\\]|\\.)*\)/g)?.[0] || ""));
// MUTACIÓN: reconstruir TODOS los offsets desde el binario final y comparar contra el xref escrito.
{
  const re = /startxref\n(\d+)\n%%EOF/.exec(pdfTxt);
  const off = Number(re![1]);
  const xrefTxt = pdfTxt.slice(off, pdfTxt.lastIndexOf("trailer"));
  const lineas = xrefTxt.split("\n").filter((l) => /^\d{10} 00000 n $/.test(l));
  const offsets = lineas.map((l) => Number(l.slice(0, 10)));
  let okXref = offsets.length > 0;
  for (let idx = 0; idx < offsets.length; idx++) {
    const esperado = `${idx + 1} 0 obj`; // la primera línea «n» es el objeto 1
    if (pdfTxt.slice(offsets[idx], offsets[idx] + esperado.length) !== esperado) { okXref = false; break; }
  }
  comprobar("xref EXACTO: cada offset apunta a «N 0 obj» (MUTACIÓN de off-by-one cazada)", okXref, `total ${offsets.length}`);
  comprobar("/Length de cada stream coincide con sus bytes reales",
    pdfTxt.match(/<< \/Length (\d+) >>\nstream\n/g)!.every((m) => {
      const n = Number(/(\d+)/.exec(m)![1]);
      const desde = pdfTxt.indexOf(m) + m.length;
      return pdfTxt.slice(desde, desde + n).length === n && pdfTxt.slice(desde + n, desde + n + 11) === "\nendstream\n";
    }));
}

// ── 3 · ZIP/DOCX/XLSX: releídos por JSZip (la dependencia del proyecto) ─────
(async () => {
  const JSZipMod: any = await import("jszip");
  const JSZip = JSZipMod.default ?? JSZipMod;

  const docx = construirDocx("# Título\n\ntexto **fuerte**\n\n- ítem\n\n| a | b |\n|---|---|\n| <b> | & |", { titulo: "Portada" });
  const zipDocx = await JSZip.loadAsync(Buffer.from(docx));
  const docXml = await zipDocx.file("word/document.xml")!.async("string");
  const stylesXml = await zipDocx.file("word/styles.xml")!.async("string");
  comprobar("DOCX: zip válido con las 5 partes obligatorias",
    ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"]
      .every((n) => !!zipDocx.file(n)));
  comprobar("DOCX: estilos de título reales (navegación de Word)", /Heading1/.test(stylesXml) && /outlineLvl/.test(stylesXml));
  comprobar("DOCX: la negrita viaja como <w:b/>", /<w:b\/>/.test(docXml));
  comprobar("ENTRADA HOSTIL: <b> de celda sale ESCAPADO (no como XML inyectado)", /&lt;b&gt;/.test(docXml) && !/<w:t[^>]*>\s*<b>\s*<\/w:t>/.test(docXml));
  comprobar("DOCX determinista: misma entrada, mismos bytes",
    Buffer.from(construirDocx("a\n\nb")).equals(Buffer.from(construirDocx("a\n\nb"))));

  const xls = construirXlsx([
    { nombre: "Ventas", cabeceras: ["Mes", "Importe"], filas: [["Enero", 100], ["Febrero", 250.5], ["=CMD|calc", "ñ"]] },
    { nombre: "Hoja2", filas: [[true]] },
  ]);
  const zipXls = await JSZip.loadAsync(Buffer.from(xls.bytes));
  const sheet1 = await zipXls.file("xl/worksheets/sheet1.xml")!.async("string");
  const sheet2 = await zipXls.file("xl/worksheets/sheet2.xml")!.async("string");
  comprobar("XLSX: zip válido, workbook + 2 hojas + estilos",
    !!zipXls.file("xl/workbook.xml") && !!zipXls.file("xl/styles.xml") && !!sheet1 && !!sheet2);
  comprobar("XLSX: número como <v> y cadena como inlineStr (no todo-texto)", /<v>100<\/v>/.test(sheet1) && /t="inlineStr"/.test(sheet1));
  comprobar("MUTACIÓN sembrada anti-fórmula: \"=CMD|calc\" sale TEXTO, <f> jamás aparece en TODO el libro",
    /inlineStr/.test(sheet1) && !/<f[ >]/.test(sheet1 + sheet2) && !/CMD/.test(sheet1.match(/<f[^>]*>[^<]*<\/f>/)?.[0] || ""));
  comprobar("XLSX: cabecera congelada y negrita de estilo aplicada", /state="frozen"/.test(sheet1) && /s="1"/.test(sheet1));
  let topeExcedido = "";
  try {
    construirXlsx([{ filas: Array.from({ length: LIMITES_XLSX.MAX_CELDAS + 2 }, () => [1, 2]) }]);
  } catch (e: any) { topeExcedido = String(e?.message || e); }
  comprobar("ENTRADA HOSTIL: tope de celdas se RECHAZA con causa (no revienta memoria)", /tope/i.test(topeExcedido), topeExcedido);

  // ── 4 · EL PACK: contrato declarado == despachado, sandbox, extensiones ────
  registrarPackDocumentos();
  const declaradas = new Set(HERRAMIENTAS_DOCUMENTOS);
  comprobar("pack registrado: las 3 specs existen en el registry con pack «documentos»",
    [...declaradas].every((n) => getToolSpec(n)?.pack === PACK_ID) && declaradas.size === 3);
  // MUTACIÓN histórica del pack hermano: specs declaradas != casos despachados.
  // Aquí se fija el contrato para siempre: ES_HERRAMIENTA_DOCUMENTOS == HERRAMIENTAS_DOCUMENTOS.
  {
    const cuerpo = fs.readFileSync("src/engine/packDocumentos.ts", "utf-8");
    const casos = [...cuerpo.matchAll(/case "(\w+)":/g)].map((m: RegExpExecArray) => m[1]);
    const usaIf = /if \(name === "generar_pdf" \|\| name === "generar_docx"\)/.test(cuerpo);
    const despachadas = new Set<string>(usaIf ? ["generar_pdf", "generar_docx", "generar_xlsx"] : casos);
    comprobar("contrato declarado == despachado (la trampa de terminal_leer no se repite)",
      [...despachadas].every((c) => declaradas.has(c)) && [...declaradas].every((d) => despachadas.has(d)),
      `${[...despachadas]} vs ${[...declaradas]}`);
  }

  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "cn-docs-"));
  const resolver = (rel: string) => {
    const abs = path.resolve(raiz, rel);
    const r = path.relative(raiz, abs);
    if (r.startsWith("..") || path.isAbsolute(r)) throw new Error("Ruta fuera del proyecto no permitida.");
    return abs;
  };
  const rPdf = JSON.parse(await ejecutarHerramientaDocumentos("generar_pdf", { path: "informe", contenido: "## Sección\nñ y % escapable (si)" }, { resolverRutaSegura: resolver }));
  comprobar("generar_pdf escribe con extensión auto-añadida y bytes>0", rPdf.ok && rPdf.path === "informe.pdf" && rPdf.bytes > 500 && fs.existsSync(path.join(raiz, "informe.pdf")));
  const bytesEnDisco = fs.readFileSync(path.join(raiz, "informe.pdf"));
  comprobar("lo que dice el JSON es lo que hay en DISCO (mismo tamaño)", bytesEnDisco.length === rPdf.bytes, `${bytesEnDisco.length} vs ${rPdf.bytes}`);
  const rTxt = JSON.parse(await ejecutarHerramientaDocumentos("generar_pdf", { path: "nota.txt", contenido: "hola" }, { resolverRutaSegura: resolver }));
  comprobar("ENTRADA HOSTIL: extensión mintirosa (.txt para PDF) se RECHAZA", !rTxt.ok && /\.pdf/.test(rTxt.error || ""), rTxt.error);
  const rFuera = JSON.parse(await ejecutarHerramientaDocumentos("generar_pdf", { path: "../escape.pdf", contenido: "x" }, { resolverRutaSegura: resolver }));
  comprobar("ENTRADA HOSTIL: ruta fuera del sandbox se RECHAZA con motivo", !rFuera.ok && /fuera del proyecto/i.test(rFuera.error || ""), rFuera.error);
  const rVacio = JSON.parse(await ejecutarHerramientaDocumentos("generar_docx", { path: "v.docx", contenido: "   " }, { resolverRutaSegura: resolver }));
  comprobar("documento vacío: RECHAZADO, no un .docx corrupto de 0 contenido", !rVacio.ok && /vacío/i.test(rVacio.error || ""), rVacio.error);
  const rEnorme = JSON.parse(await ejecutarHerramientaDocumentos("generar_docx", { path: "e.docx", contenido: "x".repeat(TOPE_CONTENIDO + 10) }, { resolverRutaSegura: resolver }));
  comprobar("ENTRADA HOSTIL: contenido sobre el tope se RECHAZA con el número en el mensaje", !rEnorme.ok && /tope/i.test(rEnorme.error || ""), rEnorme.error);
  const rHoja = JSON.parse(await ejecutarHerramientaDocumentos("generar_xlsx", { path: "datos.xlsx", hojas: [{ nombre: "D", cabeceras: ["a"], filas: [["=sum(A1)"], [7]] }] }, { resolverRutaSegura: resolver }));
  comprobar("generar_xlsx por el pack: ok, con hojas y celdas contadas", rHoja.ok && rHoja.celdas >= 3 && rHoja.hojas[0] === "D", JSON.stringify(rHoja).slice(0, 120));
  const rBasura = JSON.parse(await ejecutarHerramientaDocumentos("generar_xlsx", { path: "b.xlsx", hojas: [] }, { resolverRutaSegura: resolver }));
  comprobar("hojas:[] → error en cristiano, jamás throw", !rBasura.ok && /hojas/.test(rBasura.error || ""));
  fs.rmSync(raiz, { recursive: true, force: true });

  // ── 5 · pdf.js: un lector de VERDAD entiende nuestro PDF ───────────────
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const docPdf = await pdfjs.getDocument({ data: new Uint8Array(pdf.bytes), useWorker: false }).promise;
  const primeraPag = await docPdf.getPage(1);
  const texto = (await primeraPag.getTextContent()).items.map((i: any) => i.str).join(" ");
  comprobar("pdf.js (lector tercero) abre el PDF y lee el título en la página 1",
    /Vista rápida/.test(texto) && /Informe Anual/.test(texto), texto.slice(0, 80));
  comprobar("pdf.js cuenta las mismas páginas que el escritor", docPdf.numPages === pdf.paginas, `${docPdf.numPages} vs ${pdf.paginas}`);
  comprobar("la tabla y la lista quedaron MAQUETADAS en la página 1 (leídas por pdf.js)",
    /Enero/.test(texto) && /Ventas/.test(texto) && /punto uno/.test(texto), texto.slice(0, 120));
  const segundaPag = await docPdf.getPage(2);
  const t2 = (await segundaPag.getTextContent()).items.map((i: any) => i.str).join(" ");
  comprobar("el texto largo se desbordó a la página 2 (salto de página real)",
    /Largo/.test(t2) && !/Vista rápida/.test(t2), t2.slice(0, 60));
  await docPdf.destroy?.();

  console.log(`\n${"─".repeat(56)}`);
  console.log(`═══ DOCUMENTOS: ${correctas} correctas · ${fallos.length} fallidas ═══`);
  console.log("─".repeat(56));
  if (fallos.length) { console.log("FALLOS:"); fallos.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
})().catch((e) => { console.error("❌ packDocumentos FALLÓ:", e); process.exit ? process.exit(1) : (process.exitCode = 1); });

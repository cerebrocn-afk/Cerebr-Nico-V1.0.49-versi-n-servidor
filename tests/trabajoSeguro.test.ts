/**
 * trabajoSeguro.test.ts — v1.95.0 · EL MANUAL NO PUEDE PROMETER NOMBRES FALSOS
 * ===========================================================================
 * `trabajoSeguro.ts` es el texto que el modelo va a obedecer cuando le pidan un PDF,
 * un Word, una web o una app. Si ese manual nombra una herramienta que no existe, el
 * modelo va a intentar llamarla, va a fallar, y volvemos a los 15 mensajes por otra
 * vía. Así que la valla principal NO es de redacción: cruza cada nombre que el manual
 * pronuncia contra los catálogos REALES del arnés.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRABAJO_LISTA, RUTAS_TRABAJO, RECETAS, manualDeTrabajo, planDeTrabajo,
  inventarioEsperado, auditarInventario,
} from "../src/engine/trabajoSeguro";
import { construirPdf, auditarPdf } from "../src/engine/pdfMinimo";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
let correctas = 0;
let fallidas = 0;
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  ✓ " + que); }
  else { fallidas++; console.log("  ✗ " + que + (detalle ? " — " + detalle : "")); }
};
const seccion = (t: string) => console.log("\n── " + t);

// ── Catálogos reales (leídos de la fuente, no de la memoria) ──────────────────────
const registro = leer("src/engine/toolRegistry.ts");
const puente = leer("agent_bridge_5000.py");
const creador = leer("scripts/creador_daemon.py");
const servidor = leer("server.ts");
const reales = new Set<string>([
  ...[...registro.matchAll(/name:\s*"([a-z_0-9]+)"/g)].map((m) => m[1]),
  ...[...puente.matchAll(/^[ ]{4}"([a-z_0-9]+)":\s*\{"description"/gm)].map((m) => m[1]),
  ...[...creador.matchAll(/\{"name":\s*"([a-z_0-9]+)"/g)].map((m) => m[1]),
  // `exportar_apk` vive en server.ts (declarada en 1512, ejecutada en 2823): omitir el
  // monolito del catálogo habría hecho fallar una receta que es cierta.
  ...[...servidor.matchAll(/^\s*name:\s*"([a-z_0-9]+)"/gm)].map((m) => m[1]),
  // v1.96.0 · las máquinas de artefactos (PDF, Word, ZIP) viven en `src/engine/herramienta*.ts`
  // y al monolito se montan como `SPEC_… as any`. Si el catálogo no las lee, una receta cierta
  // (`crear_pdf`, `crear_docx`, `crear_zip`) queda marcada como fantasma — y la valla que
  // persigue herramientas fantasmas se convierte en la que fabrica el fantasma.
  ...[..."herramientaPdf herramientaDocx herramientaZip".split(" ")]
    .flatMap((m) => [...leer(`src/engine/${m}.ts`).matchAll(/name:\s*"([a-z_0-9]+)"/g)].map((x) => x[1])),
  // y el dispatch real del monolito son los `case`: ahí viven crear_pdf/crear_docx/crear_zip.
  ...[...servidor.matchAll(/^\s*case\s*"([a-z_0-9]+)"\s*:/gm)].map((m) => m[1]),
]);
// Segundo nivel de verdad: claves de argumento del pack (`hero_imagen`, `galeria`,
// `logos`…). No son herramientas, son campos; el manual las cita como campos y tienen
// que existir igual, o el modelo manda un parámetro que el pack ignora.
const clavesDelPack = new Set<string>([...creador.matchAll(/"([a-z_0-9]{4,})"/g)].map((m) => m[1]));

seccion(`§1 · LOS CATÁLOGOS EXISTEN ANTES DE CITARLOS (${reales.size} herramientas)`);
c("el registro del arnés aporta herramientas", [...reales].includes("write_file") && [...reales].includes("edit_file"));
c("el puente aporta fs_write_b64 (la salida binaria real)", reales.has("fs_write_b64"));
c("el pack creador aporta insertar_imagen y forjar_desde_brief", reales.has("insertar_imagen") && reales.has("forjar_desde_brief"));

seccion("§2 · EL MANUAL NO NOMBRA HERRAMIENTAS FANTASMA");
const menciones = new Set<string>();
for (const t of TRABAJO_LISTA) {
  const r = RECETAS[t];
  const texto = [r.una_llamada, ...r.pasos, ...r.prohibido, r.verificacion, r.pendiente || ""].join(" ");
  for (const m of texto.matchAll(/\b([a-z][a-z0-9_]{3,})\b/g)) {
    const nombre = m[1];
    // Solo interesan los que PARECEN herramientas del arnés (snake_case con guion bajo).
    if (nombre.includes("_")) menciones.add(nombre);
  }
}
// Vocabulario que es prosa o es un campo de otro lado, no una herramienta del arnés.
const prosa = new Set<string>([
  "node_modules", "data_b64", "generador_informe", "pdf_minimo", "npm_run", "index_html",
]);
const fantasma = [...menciones].filter((n) => !reales.has(n) && !clavesDelPack.has(n) && !prosa.has(n));
c("toda herramienta snake_case que el manual pronuncia existe en algún catálogo", fantasma.length === 0, fantasma.join(", "));
c("y lo que cita como campo del pack existe como clave del pack", clavesDelPack.has("hero_imagen") && RECETAS.web.pasos.some((p) => p.includes("hero_imagen")));

seccion("§3 · LAS RUTAS SON RELATIVAS Y SIN BARRAS INVERTIDAS");
c("ninguna ruta contractual es absoluta ni usa backslash", RUTAS_TRABAJO.every((r) => !r.ruta.startsWith("/") && !r.ruta.includes("\\")));
c("todas terminan en / (son carpetas, no archivos sueltos)", RUTAS_TRABAJO.every((r) => r.ruta.endsWith("/")));
c("cada ruta dice con qué se escribe y qué está prohibido", RUTAS_TRABAJO.every((r) => r.se_escribe_con.length > 8 && r.nunca.length > 8));

seccion("§4 · LA RECETA DEL PDF NO MIENTE SOBRE LA MÁQUINA");
const pdf = RECETAS.pdf;
c("dice cómo se escribe el binario (fs_write_b64) y prohíbe fs_write", pdf.una_llamada.includes("fs_write_b64") && pdf.prohibido.some((p) => p.includes("fs_write")));
c("advierte del Python sin paquetes (la causa real del informe roto)", pdf.prohibido.some((p) => /pip|reportlab/.test(p)));
const documentoChico = construirPdf({
  titulo: "Prueba de informe con acento ñ",
  secciones: [{ titulo: "Sección", parrafos: ["texto ".repeat(400)], puntos: ["a", "b"] }],
});
const auditChico = auditarPdf(documentoChico);
c("el generador produce un PDF que se autoaudita (bytes leídos = bytes escritos)", auditChico.ok && auditChico.bytes === documentoChico.length, JSON.stringify(auditChico));
c("una hoja entra en una página: la hoja no se inventa", auditChico.paginas === 1, `paginas=${auditChico.paginas}`);
const largo = "Palabra tras palabra el texto se envuelve solo y la pagina corta cuando se acaba el alto. ";
const documentoGrande = construirPdf({ titulo: "Informe largo", secciones: [{ titulo: "S", parrafos: [largo.repeat(400)] }] });
const auditGrande = auditarPdf(documentoGrande);
c("★ y un informe largo se pagina solo, contando hojas reales", auditGrande.ok && auditGrande.paginas >= 2, `paginas=${auditGrande.paginas}`);

seccion("§5 · EL MANIFIESTO: «NUNCA FALTAN ARCHIVOS» SE DIFIERE, NO SE REZA");
const esperado = inventarioEsperado("web");
c("el trabajo web espera su carpeta", esperado.includes(".creador/"));
c("con el archivo presente, el inventario cierra", auditarInventario([".creador/sitio/index.html"], esperado).ok);
const roto = auditarInventario(["README.md"], esperado);
c("★ si falta, dice CUAÁL falta en vez de decir «listo»", !roto.ok && roto.faltan.length === 1 && roto.faltan[0] === ".creador/", JSON.stringify(roto));
const etapas = planDeTrabajo("pdf", "Informe anual");
c("el plan termina en una verificación que LEE disco", /Verificar leyendo disco/.test(etapas[etapas.length - 2]?.titulo || etapas[etapas.length - 1].titulo));

seccion("§6 · EL TEXTO QUE VE EL MODELO CABE EN EL PRESUPUESTO");
const manual = manualDeTrabajo();
c("es un bloque único, etiquetado y acotado", manual.startsWith("RUTAS Y FORMAS DE TRABAJO") && manual.length < 6000, `${manual.length} chars`);
c("no deja una receta sin prohibición", TRABAJO_LISTA.every((t) => RECETAS[t].prohibido.length > 0));
c("y no esconde lo que todavía no se puede hacer (word: ahora falta el resto, no la máquina)",
  !!RECETAS.word.pendiente && /im\u00e1genes/.test(RECETAS.word.pendiente!) && /crear_docx/.test(RECETAS.word.una_llamada));

console.log(`\n═══ trabajoSeguro: ${correctas} correctas · ${fallidas} fallidas ═══`);
process.exit(fallidas > 0 ? 1 : 0);

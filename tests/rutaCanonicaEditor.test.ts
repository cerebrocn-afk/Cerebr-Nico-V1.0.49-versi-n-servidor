/**
 * rutaCanonicaEditor.test.ts — v1.60.8 · EL EDITOR HABLA EL MISMO IDIOMA DE RUTA
 * QUE EL SYNC A DISCO
 * =============================================================================
 * Demuestra las DOS fallas que Mario temía del botón del editor y que ahora
 * quedan cerradas al canonizar la ruta (misma regla que `espejoSync`):
 *
 *   1) «el modelo se tranca por no saber dónde está el archivo»
 *      → `./index.html`, `index.html`, `/index.html` y `.\index.html` (Windows)
 *        colapsan en UNA sola entrada del árbol. No hay fantasmas ni duplicados.
 *
 *   2) «al renderizar no están todos los archivos»
 *      → dos escrituras con distinta ortografía de la MISMA ruta no se pisan en
 *        el preview :3500: son el mismo archivo, cuentan como actualización y la
 *        última versión gana; el resto de archivos distintos SIEMPRE siguen ahí.
 *
 * Corre con:  npx tsx tests/rutaCanonicaEditor.test.ts
 */
import {
  extractCodeBlocksFromMessage,
  extractToolCallFileBlocks,
  mergeExtractedFiles,
} from "../src/utils/codeParser";
import { normalizarRuta } from "../src/engine/espejoSync";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}
const F = "```";

// ── 1. vallas con ruta: toda ortografía sale canonizada ──────────────────
const v1 = extractCodeBlocksFromMessage(`${F}html file="./index.html"\n<h1>hola</h1>\n${F}`);
comprobar("valla: ./index.html → index.html", v1.length === 1 && v1[0].filePath === "index.html", JSON.stringify(v1));

const v2 = extractCodeBlocksFromMessage(`${F}ts file="/src/app.ts"\nconst a=1;\n${F}`);
comprobar("valla: /src/app.ts → src/app.ts", v2.length === 1 && v2[0].filePath === "src/app.ts", JSON.stringify(v2));

// ── 2. tool-call en TEXTO (modelo free): barras de Windows y `./` ──────────
// Formato medido en sesión real: valla `cerebronico:write_file` con JSON dentro.
const t1 = extractToolCallFileBlocks(`${F}cerebronico:write_file\n{"ruta":".\\\\src\\\\pages\\\\home.tsx","contenido":"x"}\n${F}`);
comprobar("texto: .\\src\\pages\\home.tsx → src/pages/home.tsx", t1.length === 1 && t1[0].filePath === "src/pages/home.tsx", JSON.stringify(t1));

const t2 = extractToolCallFileBlocks(`${F}cerebronico:write_file\n{"path":"./estilos//app.css","content":"body{}"}\n${F}`);
comprobar("texto: ./estilos//app.css → estilos/app.css", t2.length === 1 && t2[0].filePath === "estilos/app.css", JSON.stringify(t2));

// ── 3. FALLA 1 — el modelo cambia de ortografía → UNA sola entrada ────────
const r3 = mergeExtractedFiles([], [
  { language: "html", filePath: "./index.html", content: "<h1>v1</h1>" },
  { language: "html", filePath: "index.html", content: "<h1>v2</h1>" },
  { language: "html", filePath: "/index.html", content: "<h1>v3</h1>" },
]);
const indices = r3.updatedFiles.filter((f) => normalizarRuta(f.path) === "index.html");
comprobar("sin fantasmas: index.html aparece UNA sola vez", indices.length === 1, JSON.stringify(r3.updatedFiles.map((f) => f.path)));
comprobar("sin fantasmas: todas las rutas del árbol están canonizadas", r3.updatedFiles.every((f) => f.path === normalizarRuta(f.path)));
comprobar("sin fantasmas: gana la última versión (v3)", indices[0]?.content === "<h1>v3</h1>", indices[0]?.content);

// ── 4. FALLA 2 — renderizar NO pierde archivos distintos ─────────────────
const proyecto: any[] = [
  { id: "a", name: "index.html", path: "./index.html", content: "viejo", language: "html", size: 5 },
  { id: "b", name: "app.js", path: "src/app.js", content: "js", language: "js", size: 2 },
  { id: "c", name: "app.css", path: "/estilos/app.css", content: "css", language: "css", size: 3 },
];
const r4 = mergeExtractedFiles(proyecto as any, [
  { language: "html", filePath: "index.html", content: "nuevo" }, // misma ruta, otra ortografía
]);
comprobar("preview: index.html se actualiza (no se duplica)", r4.createdCount === 0 && r4.updatedCount === 1, `c=${r4.createdCount} u=${r4.updatedCount}`);
const rutasFinales = new Set(r4.updatedFiles.map((f) => f.path));
comprobar("preview: siguen los 3 archivos (ninguno se pierde)", r4.updatedFiles.length === 3, JSON.stringify([...rutasFinales]));
comprobar("preview: index.html quedó con la versión nueva", r4.updatedFiles.find((f) => f.path === "index.html")?.content === "nuevo");
comprobar("preview: app.js intacto", rutasFinales.has("src/app.js"));
comprobar("preview: app.css canonizado e intacto", rutasFinales.has("estilos/app.css"));

// ── cierre ────────────────────────────────────────────
console.log(`\nrutaCanonicaEditor: ${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log("  · " + f);
  process.exit(1);
}
console.log("✅ v1.60.8 — el botón del editor no se traba: una ruta = un archivo, y el preview no pierde archivos.");

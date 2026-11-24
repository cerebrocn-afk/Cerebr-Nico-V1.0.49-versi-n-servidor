/**
 * codeParser.test.ts — FASE 2 (v1.57.3) · EL CÓDIGO VA AL EDITOR, NO AL CHAT
 * =============================================================================
 * Bloquea la garantía de que, cuando la IA pega un bloque de código, el cliente
 * sepa a qué archivo pertenece para materializarlo en el editor/sandbox:
 *   · valla con `file="…"` / `path=` / `:ruta`
 *   · ruta en comentario de la PRIMERA línea (// src/x.ts)
 *   · NUEVO: la IA nombra el archivo JUSTO ANTES de la valla (sin rótulo)
 *   · una valla SIN pista de ruta NO se materializa (no se adivina)
 *   · mergeExtractedFiles cuenta creados vs. actualizados y respeta rutas
 *
 * Corre con:  npx tsx tests/codeParser.test.ts
 */
import { extractCodeBlocksFromMessage, mergeExtractedFiles } from "../src/utils/codeParser";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}
const F = "```"; // valla, para no romper esta propia valla al escribir el test

// ── 1. rótulo file= en la valla ─────────────────────────────────────────
const m1 = `Aquí tienes:\n${F}ts file="src/app.ts"\nexport const x = 1;\n${F}\nlisto`;
const b1 = extractCodeBlocksFromMessage(m1);
comprobar("file= captura la ruta", b1.length === 1 && b1[0].filePath === "src/app.ts");
comprobar("file= captura el contenido", b1[0]?.content === "export const x = 1;");

// ── 1b. NUEVO v1.57.3 — formatos de valla que antes NO se reconocían ────────
// atributo file= SIN lenguaje delante (```file="…")
const b1b = extractCodeBlocksFromMessage(`${F}file="src/sinlang.ts"
const a = 1;
${F}`);
comprobar("file= sin lenguaje delante captura", b1b.length === 1 && b1b[0].filePath === "src/sinlang.ts", JSON.stringify(b1b));

// ruta pelada como único token (```src/pelado.ts)
const b1c = extractCodeBlocksFromMessage(`${F}src/pelado.ts
const b = 2;
${F}`);
comprobar("ruta pelada en la valla captura", b1c.length === 1 && b1c[0].filePath === "src/pelado.ts", JSON.stringify(b1c));

// path='…' con comillas simples, con lenguaje delante
const b1d = extractCodeBlocksFromMessage(`${F}tsx path='src/comi.tsx'
const c = 3;
${F}`);
comprobar("path='…' captura y lenguaje=tsx", b1d.length === 1 && b1d[0].filePath === "src/comi.tsx" && b1d[0].language === "tsx", JSON.stringify(b1d));

// filepath= sin comillas
const b1e = extractCodeBlocksFromMessage(`${F}filepath=src/fp.ts
const d = 4;
${F}`);
comprobar("filepath= sin comillas captura", b1e.length === 1 && b1e[0].filePath === "src/fp.ts", JSON.stringify(b1e));

// ── 2. :ruta en la valla ────────────────────────────────────────────
const b2 = extractCodeBlocksFromMessage(`${F}js:lib/util.js\nmodule.exports = 1;\n${F}`);
comprobar(":ruta captura", b2.length === 1 && b2[0].filePath === "lib/util.js");

// ── 3. ruta en comentario de la primera línea ────────────────────────────
const b3 = extractCodeBlocksFromMessage(`${F}ts\n// src/comentario.ts\nconst y = 2;\n${F}`);
comprobar("comentario de primera línea captura", b3.length === 1 && /comentario\.ts/.test(b3[0]?.filePath || ""));

// ── 4. NUEVO — la IA nombra el archivo justo antes de la valla ───────────────
const b4a = extractCodeBlocksFromMessage(`Crea **src/antes.ts**:\n${F}ts\nconst z = 3;\n${F}`);
comprobar("nombre en negrita antes de la valla", b4a.length === 1 && b4a[0].filePath === "src/antes.ts");

const b4b = extractCodeBlocksFromMessage(`src/dos.ts:\n${F}ts\nconst w = 4;\n${F}`);
comprobar("nombre con dos puntos antes de la valla", b4b.length === 1 && b4b[0].filePath === "src/dos.ts");

const b4c = extractCodeBlocksFromMessage("Archivo: config.json\n" + `${F}json\n{\"a\":1}\n${F}`);
comprobar("«Archivo: ...» antes de la valla", b4c.length === 1 && b4c[0].filePath === "config.json");

// ── 5. sin pista de ruta: NO se materializa (no se adivina) ─────────────────
const b5 = extractCodeBlocksFromMessage(`Mira este ejemplo general:\n${F}ts\nconst nada = 0;\n${F}`);
comprobar("valla sin ruta no se materializa", b5.length === 0, JSON.stringify(b5));

// una frase normal (sin aspecto de ruta) antes de la valla tampoco cuela
const b5b = extractCodeBlocksFromMessage(`Esto es importante.\n${F}ts\nconst nada2 = 0;\n${F}`);
comprobar("frase normal no se confunde con ruta", b5b.length === 0, JSON.stringify(b5b));

// ── 6. mergeExtractedFiles: crea y actualiza ─────────────────────────────
const inicial: any[] = [{ id: "f1", name: "app.ts", path: "src/app.ts", content: "viejo", language: "ts", size: 5 }];
const r6 = mergeExtractedFiles(inicial as any, [
  { language: "ts", filePath: "src/app.ts", content: "nuevo" },
  { language: "ts", filePath: "src/otro.ts", content: "otro" },
]);
comprobar("merge: 1 creado", r6.createdCount === 1, String(r6.createdCount));
comprobar("merge: 1 actualizado", r6.updatedCount === 1, String(r6.updatedCount));
comprobar("merge: app.ts quedó con contenido nuevo", r6.updatedFiles.find((f) => f.path === "src/app.ts")?.content === "nuevo");
comprobar("merge: otro.ts existe", !!r6.updatedFiles.find((f) => f.path === "src/otro.ts"));

// contenido idéntico no cuenta como actualización
const r6b = mergeExtractedFiles(inicial as any, [{ language: "ts", filePath: "src/app.ts", content: "viejo" }]);
comprobar("merge: contenido igual no actualiza", r6b.updatedCount === 0 && r6b.createdCount === 0);

// ── cierre ─────────────────────────────────────────────────
const total = correctas + fallos.length;
console.log(`\ncodeParser: ${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) {
  console.log("FALLOS:");
  for (const f of fallos) console.log("  · " + f);
  process.exit(1);
}
console.log("✅ FASE 2 — el código con pista de ruta va al editor; sin pista no se adivina.");

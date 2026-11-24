/**
 * escrituraArchivo.test.ts — FASE 1 (v1.57.3) · LA MANO DE ESCRITURA
 * ==================================================================
 * Demuestra el tipo de tarea `escribir_archivo` (alias `crear_archivo`), que
 * es lo que cierra el salto "plan verde ≠ app existe":
 *   · escribe texto REAL en un tmp del disco y lo VERIFICA (puerta de evidencia)
 *   · el alias `crear_archivo` hace lo mismo
 *   · rechaza FATAL rutas que escapan (`..`, absolutas, carpeta) — sin reintento
 *   · FALLA FATAL si falta `contenido` o si no se inyecta la escritura
 *   · PUERTA DE EVIDENCIA: si la escritura "miente" (no deja el archivo) y el
 *     disco no lo confirma, la tarea FALLA aunque la escritura dijera "ok"
 *   · el chat (normalizarPlanDesdeOrden) acepta el plan válido y rechaza el
 *     que no trae ruta/contenido ANTES de ejecutarlo
 *
 * Corre con:  npx tsx tests/escrituraArchivo.test.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { crearEjecutorDePlanes, TIPOS_SOPORTADOS, validarRutaProyecto } from "../src/engine/planExecutors";
import { normalizarPlanDesdeOrden } from "../src/engine/chatOrders";

let correctas = 0;
const fallos: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(nombre + (detalle ? " :: " + detalle : ""));
}

// raíz tmp real para escribir de verdad (el proyecto nunca se toca)
const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), "cn-escritura-"));

/** Escritura real confinada a RAIZ (como la implementaría el servidor). */
async function escribirReal(rutaRel: string, contenido: string): Promise<string> {
  const abs = path.resolve(RAIZ, rutaRel);
  if (abs !== RAIZ && !abs.startsWith(RAIZ + path.sep)) throw new Error("ruta fuera de la raíz");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contenido, "utf8");
  return rutaRel;
}
/** Verificación real: pregunta al DISCO. */
async function verificarReal(rutaRel: string): Promise<{ existe: boolean; bytes: number }> {
  const abs = path.resolve(RAIZ, rutaRel);
  try {
    const st = fs.statSync(abs);
    return { existe: st.isFile(), bytes: st.size };
  } catch {
    return { existe: false, bytes: 0 };
  }
}

const senal = () => new AbortController().signal;
const tarea = (datos: any, tipo = "escribir_archivo"): any => ({ id: "1", titulo: "escribir", tipo, peso: "io", dependeDe: [], estado: "pendiente", intentos: 0, datos });

async function main() {
  // ── 0. catálogo ───────────────────────────────────────────────────────
  comprobar("TIPOS_SOPORTADOS incluye escribir_archivo", (TIPOS_SOPORTADOS as readonly string[]).includes("escribir_archivo"));
  comprobar("TIPOS_SOPORTADOS incluye crear_archivo (alias)", (TIPOS_SOPORTADOS as readonly string[]).includes("crear_archivo"));

  // ── 1. confinamiento de ruta ─────────────────────────────────────────
  comprobar("ruta buena pasa", validarRutaProyecto("src/app.ts").ok === true);
  comprobar("ruta con .. rechazada", validarRutaProyecto("../fuera.ts").ok === false);
  comprobar("ruta absoluta rechazada", validarRutaProyecto("/etc/passwd").ok === false);
  comprobar("ruta con unidad rechazada", validarRutaProyecto("C:/win.ts").ok === false);
  comprobar("ruta vacía rechazada", validarRutaProyecto("").ok === false);
  comprobar("carpeta (termina en /) rechazada", validarRutaProyecto("src/").ok === false);

  // ── 2. escritura + verificación en disco ───────────────────────────────
  const ejec = crearEjecutorDePlanes({
    pedirModelo: async () => "",
    leerArchivo: async () => "",
    escribirArchivo: escribirReal,
    verificarArchivo: verificarReal,
  });

  const CONT = "export const hola = () => 'mundo';\n";
  const r1 = await ejec(tarea({ ruta: "src/app.ts", contenido: CONT }), senal());
  comprobar("escritura devuelve artefacto", (r1.artefactos || [])[0] === "src/app.ts");
  comprobar("resumen dice VERIFICADO", /VERIFICADO/.test(r1.resumen));
  comprobar("el archivo EXISTE en disco", fs.existsSync(path.join(RAIZ, "src/app.ts")));
  comprobar("el contenido en disco coincide", fs.readFileSync(path.join(RAIZ, "src/app.ts"), "utf8") === CONT);

  // alias crear_archivo
  const r2 = await ejec(tarea({ ruta: "nested/deep/x.txt", contenido: "ok" }, "crear_archivo"), senal());
  comprobar("alias crear_archivo escribe", fs.existsSync(path.join(RAIZ, "nested/deep/x.txt")) && /VERIFICADO/.test(r2.resumen));

  // ── 3. fallos FATALES (sin reintento) ────────────────────────────────
  let fatalSinContenido = false;
  try { await ejec(tarea({ ruta: "src/b.ts" }), senal()); } catch (e: any) { fatalSinContenido = e?.fatal === true; }
  comprobar("sin contenido falla FATAL", fatalSinContenido);

  let fatalEscape = false;
  try { await ejec(tarea({ ruta: "../escape.ts", contenido: "x" }), senal()); } catch (e: any) { fatalEscape = e?.fatal === true; }
  comprobar("ruta .. falla FATAL", fatalEscape);
  comprobar("nada se escribió fuera de la raíz", !fs.existsSync(path.join(RAIZ, "../escape.ts")));

  // sin primitiva de escritura → honesto, no finge
  const ejecMudo = crearEjecutorDePlanes({ pedirModelo: async () => "", leerArchivo: async () => "" });
  let fatalSinManos = false;
  try { await ejecMudo(tarea({ ruta: "src/c.ts", contenido: "x" }), senal()); } catch (e: any) { fatalSinManos = e?.fatal === true; }
  comprobar("sin escribirArchivo inyectado falla FATAL (honesto)", fatalSinManos);

  // ── 4. PUERTA DE EVIDENCIA: la escritura "miente" ─────────────────────────
  const ejecMentiroso = crearEjecutorDePlanes({
    pedirModelo: async () => "",
    leerArchivo: async () => "",
    escribirArchivo: async (rutaRel) => rutaRel, // dice ok PERO no escribe nada
    verificarArchivo: verificarReal,             // el disco dirá la verdad
  });
  let fatalMentira = false;
  let mensaje = "";
  try { await ejecMentiroso(tarea({ ruta: "fantasma.ts", contenido: "x" }), senal()); }
  catch (e: any) { fatalMentira = e?.fatal === true; mensaje = e?.message || ""; }
  comprobar("escritura que miente → la puerta de evidencia FALLA", fatalMentira);
  comprobar("el fallo lo explica (disco no confirma)", /disco NO lo confirma|no está hecha/i.test(mensaje));

  // ── 5. el chat valida el plan ANTES de ejecutarlo ───────────────────────
  const bueno = normalizarPlanDesdeOrden({ objetivo: "crear", tareas: [{ id: "1", titulo: "a", tipo: "escribir_archivo", datos: { ruta: "src/x.ts", contenido: "y" } }] });
  comprobar("chat acepta escribir_archivo válido", bueno.ok === true);

  const sinContenido = normalizarPlanDesdeOrden({ objetivo: "crear", tareas: [{ id: "1", titulo: "a", tipo: "escribir_archivo", datos: { ruta: "src/x.ts" } }] });
  comprobar("chat rechaza escribir_archivo sin contenido", sinContenido.ok === false);

  const rutaMala = normalizarPlanDesdeOrden({ objetivo: "crear", tareas: [{ id: "1", titulo: "a", tipo: "crear_archivo", datos: { ruta: "../x.ts", contenido: "y" } }] });
  comprobar("chat rechaza crear_archivo con ruta ..", rutaMala.ok === false);

  // ── cierre ─────────────────────────────────────────────────
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch {}

  const total = correctas + fallos.length;
  console.log(`\nescrituraArchivo: ${correctas} correctas · ${fallos.length} fallidas`);
  if (fallos.length) {
    console.log("FALLOS:");
    for (const f of fallos) console.log("  · " + f);
    process.exit(1);
  }
  console.log("✅ FASE 1 — la mano de escritura con evidencia en disco: todo verde.");
}

main().catch((e) => { console.error(e); process.exit(1); });

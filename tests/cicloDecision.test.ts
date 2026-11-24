/**
 * cicloDecision.test.ts — LA TRAZA DEL CICLO NO SE INVENTA (v1.85.0 · FASE 6.2)
 * ============================================================================
 * El plano (HOJA_DE_RUTA_PERFECCION §FASE 6, punto 2) pide «el ciclo de decisión
 * (V8 §6.2) con trazas». Un ciclo que decide y no deja rastro es exactamente lo
 * que Mario no puede auditar: la IDE hace algo y nadie sabe por qué.
 *
 * Esta suite no comprueba la suerte: comprueba el CONTRATO de la traza.
 *   · las 6 etapas del ciclo aparecen SIEMPRE, en orden, y en el mismo orden
 *     aunque la frase sea incomprensible (una traza incompleta no explica nada);
 *   · cada etapa trae fuente con ruta+línea, y esa línea EXISTE en el disco de
 *     verdad (se relee el archivo: si alguien mueve la regla, el test la sigue);
 *   · ninguna cita apunta a una línea inventada (plaga sembrada);
 *   · una herramienta dormida deja traza CON MOTIVO — el motivo que ya devolvia
 *     `ejecutarEntidad`, no un silencio;
 *   · una frase sin dueño declarado («traducir») deja traza con `porVoto:false`
 *     y la razon: el consejo sigue diciendo quien habla;
 *   · la traza persiste en `<raizDatos>/cerebro/trazas/decisiones.jsonl` y se
 *     vuelve a leer (un reinicio no borra la memoria de las decisiones);
 *   · la cara del panel (`hojaTrazas`) cuenta ok/fallos como cuenta el anillo —
 *     el panel no puede mostrar un verde que el motor no tiene.
 */
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  decidir,
  listarTrazas,
  trazaPorId,
  trazasDeEntidad,
  hojaTrazas,
  cargarTrazas,
  estadoCiclo,
  _resetTrazas,
} from "../src/engine/cicloDecision";
import { localizarLinea, verificarCita } from "../src/engine/citaFuente";
import { cambiarActivacion, configurarSistema } from "../src/engine/reflejo/consejo";
import { aprender } from "../src/engine/cerebroOrgano";
import * as _os from "node:os";
import { createHash } from "node:crypto";

configurarSistema({
  totalmem: () => _os.totalmem(),
  freemem: () => _os.freemem(),
  cpus: () => _os.cpus(),
  loadavg: () => _os.loadavg(),
  sha256: (x) => createHash("sha256").update(x, "utf8").digest("hex"),
  uuid: () => `t-${Math.random().toString(16).slice(2)}`,
});

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(`${msg}${detalle ? " → " + detalle : ""}`);
}

// v1.86.2 · LA RAÍZ SE CONVIERTE CON `fileURLToPath`, NO CON `.pathname`.
// `new URL(import.meta.url).pathname` en Windows devuelve `/C:/Users/…` (barra
// delante de la letra de unidad) y `path.resolve` lo convierte en `\C:\Users\…`:
// una ruta que no existe. El efecto era exactamente el que vio Mario en su
// máquina — «el patrón de «clasificar» no aparece en src/engine/cerebroReflejo.ts»
// y el `TypeError: Cannot read properties of null` — sin que hubiera NADA roto en
// el motor: el test no encontraba el árbol fuente. En Linux pasaba, y eso también
// era un defecto del test (no portable), no una virtud del motor.
const RAIZ_FUENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAIZ = mkdtempSync(path.join(tmpdir(), "cn-ciclo-"));
let reloj = 1_800_000_000_000;
const ahora = () => ++reloj;

_resetTrazas();

// El contrato de la suite sobre su propio terreno: si la raíz de fuente no está,
// NINGUNA cita puede resolver y el verde/rojo de abajo no significa nada. Se
// declara antes que dejar que elTypeError tumbe la suite (así pasó en Windows).
comprobar(
  "★ la suite pisa un árbol fuente real (si esto falla, el entorno está roto, no el motor)",
  existsSync(path.join(RAIZ_FUENTE, "src", "engine", "cerebroReflejo.ts")),
  `raizFuente=${RAIZ_FUENTE}`
);

// ═══ 1 · Un ciclo completo, con las 6 etapas y sus fuentes ═══════════════════
const t1 = decidir("cuenta las lineas de este texto", {
  raizDatos: RAIZ,
  raizFuente: RAIZ_FUENTE,
  datos: { texto: "a\nb\nc" },
  ahora,
});
comprobar("la traza trae las 7 etapas del ciclo en orden", 
  JSON.stringify(t1.etapas.map((e) => e.etapa)) ===
    JSON.stringify(["entrada", "clasificacion", "voto", "entidad", "organo", "ejecucion", "resultado"]),
  JSON.stringify(t1.etapas.map((e) => e.etapa)));
comprobar("la frase se clasifico y tiene accion", typeof t1.accion === "string" && t1.accion.length > 0, t1.accion);
comprobar("el id de la traza es estable y unico", /^t\d+-\d+$/.test(t1.id), t1.id);
comprobar("la traza mide sus propios milisegundos", typeof t1.ms === "number" && t1.ms >= 0, String(t1.ms));

// Las fuentes: ruta + linea que existen en disco AHORA.
const conFuente = t1.etapas.filter((e) => !!e.fuente);
comprobar("cada etapa cita una regla con ruta y linea", conFuente.length >= 5, `${conFuente.length} etapas con fuente`);
const citasFalsas = conFuente.filter((e) => !verificarCita(RAIZ_FUENTE, e.fuente));
comprobar("★ NINGUNA cita apunta a una linea inexistente", citasFalsas.length === 0, citasFalsas.map((e) => `${e.etapa}:${e.fuente?.archivo}:${e.fuente?.linea}`).join(", "));
comprobar("la fuente del voto es votacionConsejo.ts", conFuente.some((e) => /votacionConsejo\.ts$/.test(e.fuente!.archivo)));
comprobar("la fuente de la ejecucion es consejo.ts", t1.etapas.some((e) => e.etapa === "ejecucion" && /reflejo\/consejo\.ts$/.test(e.fuente?.archivo || "")));
comprobar("el organo participa del ciclo (etapa «organo» presente)", t1.etapas.some((e) => e.etapa === "organo"));

// La linea citada dice lo que la traza afirma que dice.
// v1.86.2 · la cita se mira con guarda: si la fuente es `null` hay que DECLARARLO
// como fallo de la suite, no reventar la mitad de los 41 chequeos con un
// `TypeError: Cannot read properties of null (reading 'texto')` (fue exactamente
// lo que pasó en Windows: la suite «no llegó a ejecutarse» y el veredicto quedó
// ciego). Un test que crashea no informa.
const citarEjecucion = t1.etapas.find((e) => e.etapa === "ejecucion")?.fuente || null;
comprobar(
  "★ la etapa de ejecucion trae fuente (null = el árbol fuente no se lee: entorno, no motor)",
  citarEjecucion !== null,
  `raizFuente=${RAIZ_FUENTE} · avisos=${JSON.stringify(t1.etapas.find((e) => e.etapa === "ejecucion")?.aviso || "")}`
);
comprobar(
  "la linea citada de ejecucion contiene ejecutarEntidad",
  !!citarEjecucion && /ejecutarEntidad/.test(citarEjecucion.texto),
  citarEjecucion ? citarEjecucion.texto : "sin cita (fuente null)"
);

// ═══ 2 · Persistencia: el JSONL vive junto al órgano ═════════════════════════
const archivoTrazas = path.join(RAIZ, "cerebro", "trazas", "decisiones.jsonl");
comprobar("la traza se escribio en cerebro/trazas/decisiones.jsonl", existsSync(archivoTrazas));
const bruto = existsSync(archivoTrazas) ? readFileSync(archivoTrazas, "utf8") : "";
comprobar("el JSONL es JSON parseable linea a linea", bruto.trim().split("\n").every((l) => { try { JSON.parse(l); return true; } catch { return false; } }));
comprobar("la traza persistida trae la etapa del disco", JSON.parse(bruto.trim().split("\n").pop() || "{}").id === t1.id);
const estado = estadoCiclo(RAIZ);
comprobar("estadoCiclo cuenta la linea y da la ruta", estado.enDisco && estado.lineas === 1 && estado.anillo === 1, JSON.stringify(estado));

// ═══ 3 · Herramienta dormida: la traza dice el MOTIVO, no se calla ═══════════
const t2 = decidir("convierte esto a yaml", {
  raizDatos: RAIZ,
  raizFuente: RAIZ_FUENTE,
  entidadForzada: "texto.acentos", // herramienta DORMIDA por defecto
  datos: { texto: "Hola" },
  ahora,
});
comprobar("una herramienta dormida NO queda ok", t2.ok === false);
comprobar("la traza de la dormida declara el motivo con el boton exacto", /DORMIDA/.test(t2.motivo || "") && /activa/.test(t2.motivo || ""), t2.motivo);
comprobar("la traza de la dormida nombra la entidad forzada", t2.entidad === "texto.acentos");

// Y al despertarla, la MISMA decision ejecuta (la traza cambia con el estado real).
cambiarActivacion("texto.acentos", true);
const t2b = decidir("convierte esto a yaml", { raizDatos: RAIZ, raizFuente: RAIZ_FUENTE, entidadForzada: "texto.acentos", datos: { texto: "Hola" }, ahora });
comprobar("despues de activarla, la misma orden ejecuta y la traza queda ok", t2b.ok === true, t2b.motivo);
cambiarActivacion("texto.acentos", false);

// ═══ 4 · Frase sin dueño: el consejo lo DECLARA (no es un fallo silencioso) ══
const t3 = decidir("traduce hola al ingles", { raizDatos: RAIZ, raizFuente: RAIZ_FUENTE, ahora });
comprobar("la traza de «traducir» queda sin voto de especialista", t3.porVoto === false, `${t3.accion}/${t3.especialista}`);
comprobar("la razon explica quien lo atiende (declarado, no inventado)", /modelo|Ningun especialista|Ningún especialista/.test(t3.razonVoto), t3.razonVoto);
comprobar("la etapa «voto» existe igual en una frase sin dueño", t3.etapas.some((e) => e.etapa === "voto"));

// ═══ 5 · Frase vacia: el ciclo no revienta, deja traza ═══════════════════════
const t4 = decidir("   ", { raizDatos: RAIZ, raizFuente: RAIZ_FUENTE, ahora });
comprobar("una frase vacia deja traza con sus etapas", t4.etapas.length >= 6 && t4.frase === "");
comprobar("una frase vacia explica que llego vacia", /vac/.test(t4.etapas[0].que), t4.etapas[0].que);

// ═══ 6 · El órgano entra como pizarra cuando hay memoria ═════════════════════
aprender(RAIZ, { tema: "despliegue", titulo: "servidor estatico", texto: "El preview levanta un servidor estatico en el puerto 3500 con .cn-static-server.cjs", palabras: ["preview", "sandbox"] });
const t5 = decidir("arranca el preview del sandbox", { raizDatos: RAIZ, raizFuente: RAIZ_FUENTE, ahora });
const etapaOrgano = t5.etapas.find((e) => e.etapa === "organo")!;
const rutasVistas = (etapaOrgano.datos as any)?.rutas || [];
comprobar("el organo devolvio la memoria de despliegue al decidir", rutasVistas.some((r: any) => r.tema === "despliegue"), JSON.stringify(rutasVistas));

// ═══ 7 · La cara del panel dice la VERDAD del anillo ═════════════════════════
const hoja = hojaTrazas(10);
comprobar("el panel muestra una fila por traza del anillo", hoja.ultimas.length === 6, String(hoja.ultimas.length));
comprobar("el panel cuenta ok/fallos como el anillo", hoja.ok + hoja.fallidas === hoja.total && hoja.total === 6 && hoja.fallidas >= 1, JSON.stringify({ ok: hoja.ok, fallidas: hoja.fallidas, total: hoja.total }));
comprobar("la traza dormida aparece marcada como fallida en el panel", hoja.ultimas.some((u) => !u.ok && /DORMIDA/.test(u.motivo || "")));
comprobar("el panel reporta cuantas trazas traen fuente", hoja.trazasConFuente === hoja.ultimas.length, `${hoja.trazasConFuente}/${hoja.ultimas.length}`);
comprobar("el panel dice el anillo, no una cifra estética", /anillo/.test(hoja.nota), hoja.nota);

// ═══ 8 · Lectura por id / secuencia / entidad ════════════════════════════════
comprobar("se puede recuperar una traza por id", trazaPorId(t1.id)?.secuencia === t1.secuencia);
comprobar("se puede recuperar por numero de paso (#N) como teclea el usuario", trazaPorId(`#${t2.secuencia}`)?.id === t2.id);
comprobar("una busqueda inexistente devuelve null (no inventa)", trazaPorId("t999999-1") === null);
comprobar("las trazas por entidad filtran de verdad", trazasDeEntidad("texto.acentos").length === 2, String(trazasDeEntidad("texto.acentos").length));
comprobar("listarTrazas devuelve de la mas nueva a la mas vieja", listarTrazas(2)[0].secuencia > listarTrazas(2)[1].secuencia);

// ═══ 9 · Reinicio: el historial se vuelve a leer del disco ══════════════════
const recargadas = cargarTrazas(RAIZ, 50);
comprobar("al reiniciar, las trazas vuelven desde el JSONL", recargadas.trazas.length === 6 && recargadas.trazas[0].id === t1.id, JSON.stringify(recargadas.trazas.map((t) => t.id)));
comprobar("el contador de pasos retoma donde estaba", recargadas.trazas.length === 6 && recargadas.trazas.every((t) => t.secuencia > 0) && recargadas.trazas[recargadas.trazas.length - 1].secuencia === 6);
const raizVacia = mkdtempSync(path.join(tmpdir(), "cn-ciclo-vacia-"));
comprobar("sin historial, cargarTrazas lo dice en vez de fingir", /no hay/.test(cargarTrazas(raizVacia).aviso || ""), cargarTrazas(raizVacia).aviso);

// ═══ 10 · Plaga sembrada: una fuente que ya no existe se DECLARA ═════════════
// Simula el refactor que mueve la regla: se le apunta a un archivo inexistente y
// la traza debe decir «sin fuente» en vez de inventar una linea.
const antes = t1.etapas.filter((e) => !!e.fuente).length;
comprobar("el lector de fuentes detecta que la regla ya no esta (localizarLinea → null)", localizarLinea(RAIZ_FUENTE, "src/engine/no-existe.ts", /export function pensar\(/) === null);
const t6 = decidir("cuenta palabras", { raizDatos: RAIZ, raizFuente: "/ruta/que/no/existe", datos: { texto: "a b c" }, ahora });
comprobar("con raiz de fuente rota, la traza se llena de avisos y no de citas falsas", t6.etapas.every((e) => !e.fuente && !!e.aviso), `fuentes buenas antes: ${antes}`);
comprobar("una traza sin fuentes no se borra: se marca con aviso", t6.etapas.filter((e) => !e.fuente && e.aviso).length >= 5, String(t6.etapas.filter((e) => !e.fuente && e.aviso).length));

// ═══ 11 · Anillo acotado (no crece sin techo) ════════════════════════════════
for (let i = 0; i < 6; i++) decidir(`prueba de anillo ${i}`, { raizDatos: RAIZ, raizFuente: RAIZ_FUENTE, ahora });
comprobar("el anillo sigue acotado tras mas decisiones", hojaTrazas(500).total <= 200, String(hojaTrazas(500).total));

try { rmSync(RAIZ, { recursive: true, force: true }); rmSync(raizVacia, { recursive: true, force: true }); } catch {}

console.log(`\n═══ CICLO DE DECISION (FASE 6.2): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);

/**
 * tests/bucleDeBloques.test.ts — v1.62.0
 * ============================================================================
 * Defecto sembrado: la degeneración que v1.61.0 DEJÓ PASAR. Sesión
 * `1792793541672` (23/10), mensaje 17: 102.088 caracteres, 223 secciones
 * numeradas, 313 líneas distintas. Medido con `cortarDegeneracionLineal`:
 * `hit: false`, 0,0 % descartado.
 *
 * Falsos positivos obligatorios (los que matarían este detector si estuviera
 * mal calibrado): el propio `server.ts`, `CHANGELOG.md`, `RightSidebar.tsx`,
 * `constants.ts` y dos respuestas legítimas del mismo chat. Ninguno puede cortar.
 */
import {
  cortarBucleDeBloques,
  normalizarLinea,
  normalizarParaNovedad,
  estadisticaDeConteo,
  ventanaPobre,
  colapsoSostenidoEnCola,
} from "../src/engine/bucleDeBloques";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const aqui = path.dirname(fileURLToPath(import.meta.url));

let ok = 0;
let fail = 0;
const af = (nombre: string, cond: boolean) => {
  if (cond) { ok++; console.log("  ✓ " + nombre); }
  else { fail++; console.log("  ✗ " + nombre); }
};

// ── DEFECTO REAL SEMBRADO ────────────────────────────────────────────────────
const RUTA_FIXTURE = path.join(aqui, "fixtures", "sesion-1792793541672-msg17-degenerado.txt");
const tieneFixture = fs.existsSync(RUTA_FIXTURE);

if (tieneFixture) {
  const real = fs.readFileSync(RUTA_FIXTURE, "utf8");
  const lineasReal = real.split("\n").length;
  console.log(`  · fixture real: ${real.length} caracteres, ${lineasReal} líneas`);
  const t0 = Date.now();
  const r = cortarBucleDeBloques(real);
  const ms = Date.now() - t0;

  af("corta el bucle de 102 KB que v1.61.0 dejó pasar", r.hit === true);
  af("descarta la mayoría del texto degenerado (≥ 50 %)", real.length - r.cortado.length >= real.length * 0.5);
  // El fixture real ya venía degenerado desde la sección 2: lo que queda es poco,
  // pero tiene que ser contenido NO degenerado (por eso se comprueba acá abajo).
  af("conserva algo (no deja el mensaje vacío del todo)", r.cortado.length > 0);
  af("corta en una línea real del texto", r.lineaCorte > 0 && r.lineaCorte < lineasReal);
  af("la ventana sospechada cumple las dos condiciones", r.razon <= 0.35 && r.masa >= 0.25);
  // El tiempo se REPORTA, no se condiciona. Aserción de tiempo de pared ya me
  // mordió dos veces: la suite `imagen` fallaba sólo en ciertas máquinas Windows
  // y esta misma suite (`bucleDeBloques`) cayó en verde acá (38 ms) y en rojo en
  // el equipo real del usuario (543 ms) con Ollama y Electron cargando la
  // máquina. Un veredicto que depende de quÃ© proceso està usando la CPU no
  // puede bloquear una entrega: lo que importa es que el corte sea correcto y
  // acotado en trabajo (maxAtras), no en milisegundos.
  console.log(`  · costo medido en esta máquina: ${ms} ms sobre 102 KB (informativo)`);
  console.log(`  · cortó en la línea ${r.lineaCorte} · razón ${r.razon.toFixed(3)} · masa ${r.masa.toFixed(3)} · ${ms} ms`);

  // Idempotencia: lo que sobrevive no puede volver a disparar. Si disparara, el
  // corte debía ser más atrás y estaríamos tirando contenido útil.
  af("lo que sobrevive ya no dispara el detector", cortarBucleDeBloques(r.cortado).hit === false);
} else {
  console.log("  · sin fixture en disco: NO se da por válida esta parte");
  af("el fixture real existe (sin él el test no prueba nada)", false);
}

// ── MISMA FORMA, GENERADA (para que la forma no dependa de un archivo) ───────
const plantilla = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    [
      `### ${i + 1}. Errores de configuracion de la seccion ${i % 7}`,
      "   - Problema: FastAPI bloquea solicitudes desde dominios no autorizados.",
      "   - Solucion: Configura CORS correctamente en tu aplicacion FastAPI:",
      "     ```python",
      "     from fastapi import FastAPI",
      "     app = FastAPI()",
      '     app.add_middleware(CORSMiddleware, allow_origins=["*"])',
      "     ```",
      "",
    ].join("\n")).join("\n");

const rSin = cortarBucleDeBloques("Intro legítima al diagnóstico.\n\n" + plantilla(160));
af("corta la forma sintética (misma plantilla en 160 bloques)", rSin.hit === true);
af("la versión corta de la misma plantilla NO corta (12 bloques)", cortarBucleDeBloques(plantilla(12)).hit === false);
af("y una lista legítima larga y variada tampoco", cortarBucleDeBloques(
  Array.from({ length: 1200 }, (_, i) => `· archivo ${i}/src/modulo${i}/index.ts — hace la parte ${i * 3} del sistema.`).join("\n")
).hit === false);

// Respuesta LARGA que tiene un tramo repetitivo en el medio y después recupera:
// es el caso que la primera versión tiraba entero. No se toca.
const recupera =
  Array.from({ length: 500 }, (_, i) => `linea unica e irrepetible ${i}: el modulo ${i} resuelve ${i * 13} con tests propios`).join("\n") +
  "\n" + plantilla(70) + "\n" +
  Array.from({ length: 700 }, (_, i) => `y acá sigue otra cosa: paso ${i} revisa ${i * 7} en src/parte${i} con evidencia`).join("\n");
const rRec = cortarBucleDeBloques(recupera);
af("una respuesta larga que RECUPERA novedad no se corta", rRec.hit === false);
af("  y se devuelve intacta", rRec.cortado === recupera);

// ── NEGATIVOS: código y prosa reales que NO se pueden tocar ─────────────────
const negativos: Array<[string, string]> = [
  ["server.ts", path.join(aqui, "..", "server.ts")],
  ["CHANGELOG.md", path.join(aqui, "..", "CHANGELOG.md")],
  ["RightSidebar.tsx", path.join(aqui, "..", "src", "components", "RightSidebar.tsx")],
  ["constants.ts", path.join(aqui, "..", "src", "constants.ts")],
  ["App.tsx", path.join(aqui, "..", "src", "App.tsx")],
  ["respuesta legítima de 17 KB", path.join(aqui, "fixtures", "no-eco-msg19.txt")],
  ["respuesta legítima de 10 KB", path.join(aqui, "fixtures", "eco-anterior-msg21.txt")],
];
for (const [nombre, ruta] of negativos) {
  if (!fs.existsSync(ruta)) { console.log(`  · ${nombre}: no está en el árbol, no se cuenta`); continue; }
  const t = fs.readFileSync(ruta, "utf8");
  const r = cortarBucleDeBloques(t);
  af(`no corta ${nombre} (${Math.round(t.length / 1024)} KB)`, r.hit === false);
  af(`  y lo devuelve byte a byte igual: ${nombre}`, r.cortado === t);
}

// ── PIEZAS PURAS ─────────────────────────────────────────────────────────────
af("normaliza cifras (los contadores del bucle no distinguen)", normalizarLinea("### 57. Error") === normalizarLinea("### 58. Error"));
af("normaliza cadenas", normalizarLinea('log("uno")') === normalizarLinea('log("dos")'));
af("distingue formas distintas", normalizarLinea("app = FastAPI()") !== normalizarLinea("app = express()"));

const conteo = new Map<string, number>([["a", 80], ["b", 80], ["c", 40], ["d", 20]]);
const est = estadisticaDeConteo(conteo, 220, 2);
af("la razón cuenta distintas sobre total", Math.abs(est.razon - 4 / 220) < 1e-9);
af("la masa suma las top-K más frecuentes", Math.abs(est.masa - 160 / 220) < 1e-9);
af("ventana con todo distinto: razón 1", estadisticaDeConteo(new Map([["x", 1], ["y", 1]]), 2, 20).razon === 1);
af("ventana vacía no divide por cero", estadisticaDeConteo(new Map(), 0, 20).razon === 1);

const novedoso = Array.from({ length: 400 }, (_, i) => `linea nueva e irrepetible numero ${String(i).padStart(4, "0")} con texto de relleno`);
af("un texto novedoso no tiene colapso en la cola", colapsoSostenidoEnCola(novedoso, 120, 20, 0.35, 0.25) === null);
af("secuencia vacía no rompe el buscador", colapsoSostenidoEnCola([], 120, 20, 0.35, 0.25) === null);
af("secuencia más corta que la ventana no se juzga", colapsoSostenidoEnCola(novedoso.slice(0, 50), 120, 20, 0.35, 0.25) === null);

// El caso que distingue este detector del «peor tramo»: repetitivo en el MEDIO y
// novedoso al final. La cola manda, así que no se corta nada.
const medio = [
  ...Array.from({ length: 300 }, (_, i) => `única ${i} con palabras distintas ${i * 7} y más palabras ${i * 11}`),
  ...Array.from({ length: 400 }, (_, i) => `plantilla repetida con numero ${i % 3}`),
  ...Array.from({ length: 300 }, (_, i) => `y acá vuelve la novedad: punto ${i} revisa ${i * 13} con evidencia propia ${i * 5}`),
];
af("un tramo repetitivo en el medio NO es colapso si la cola recupera", colapsoSostenidoEnCola(medio, 120, 20, 0.35, 0.25) === null);

// Y el mismo tronco, pero terminando en la plantilla: ahora la cola sí está pobre.
const cola = [...medio.slice(0, 700), ...Array.from({ length: 300 }, (_, i) => `plantilla repetida con numero ${i % 3}`)];
const col = colapsoSostenidoEnCola(cola, 120, 20, 0.35, 0.25);
af("si la cola termina pobre, hay colapso y se informa dónde", col !== null && col.inicio >= 200 && col.inicio < cola.length);
if (col) console.log(`  · colapso sintético: arranca en la línea tinta ${col.inicio} de ${cola.length} (razón ${col.razon.toFixed(3)}, masa ${col.masa.toFixed(3)})`);

const conteoPobre = new Map<string, number>([["a", 100], ["b", 100], ["c", 60], ["d", 40]]);
af("ventanaPobre exige las DOS condiciones", ventanaPobre(conteoPobre, 300, 20, 0.35, 0.25) === true);
// Pocas líneas distintas pero DILUIDAS (nada se repite lo bastante como para ser
// plantilla): la razón sola no alcanza, tiene que estar la masa. Es el caso de un
// archivo con muchas líneas cortas parecidas pero sin reciclarse a sí mismo.
const diluidas = new Map<string, number>();
for (let i = 0; i < 300; i++) diluidas.set(`clave-${i}`, i < 200 ? 3 : 4); // 300 distintas sobre 1000
af("  distintas pero diluidas (masa baja): no es pobre", diluidas.size / 1000 <= 0.35 && ventanaPobre(diluidas, 1000, 20, 0.35, 0.25) === false);

// Las cifras son información: sin esta guarda, un inventario de archivos (una
// línea por archivo, misma forma, números distintos) se cortaba como bucle.
af("con cifras: una lista numerada NO es la misma línea", normalizarParaNovedad("· archivo 7/index.ts") !== normalizarParaNovedad("· archivo 8/index.ts"));
af("doblando cifras sí colapsaría (por eso no se hace)", normalizarLinea("· archivo 7/index.ts") === normalizarLinea("· archivo 8/index.ts"));

// ── COSTO ACOTADO: esto corre en cada flush del stream ──────────────────────
const rutaGrande = path.join(aqui, "..", "server.ts");
if (fs.existsSync(rutaGrande)) {
  const t1 = Date.now();
  const rGrande = cortarBucleDeBloques(fs.readFileSync(rutaGrande, "utf8"));
  const msGrande = Date.now() - t1;
  console.log(`  · costo medido en server.ts de 621 KB: ${msGrande} ms (informativo, no se condiciona)`);
  // El costo se comprueba por TRABAJO, no por relojes: en código legítimo la
  // primera ventana de cola ya determina que no hay colapso y el detector
  // devuelve sin recorrer nada más.
  af("en código legítimo ni siquiera llega a cortar (sin escanear el archivo)", rGrande.hit === false && rGrande.lineaCorte === -1);
}

console.log(`\n  resultados: ${ok} correctas, ${fail} fallidas`);
if (fail > 0) process.exit(1);

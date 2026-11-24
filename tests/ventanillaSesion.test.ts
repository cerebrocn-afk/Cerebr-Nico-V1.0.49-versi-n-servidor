/**
 * tests/ventanillaSesion.test.ts — v1.62.0
 * ============================================================================
 * EL CABLEADO DE SESIÓN (no el módulo puro, sino cómo lo usa el handler).
 *
 * 🐞 DEFECTO SEMBRADO: hasta v1.61.0 el handler hacía `crearVentanilla(...)`
 * DENTRO de cada turno (server.ts:3353 y :10410). Una ventanilla «entre
 * turnos» recreada en cada turno nace sin historial SIEMPRE, así que el corte
 * entre-turnos nunca puede dispararse —exactamente el log de los 34 rechazos
 * agrupados turno a turno—. Aquí reproduzco ese defecto (una ventanilla NUEVA
 * por turno) y demuestro que el corte NO llega.
 *
 * ✅ LA CORRECCIÓN (v1.62.0): una sola ventanilla de SESIÓN que sobrevive a
 * los turnos, rotada con `abrirTurno()` al arrancar cada turno. Con ella la
 * misma secuencia SÍ corta.
 *
 * 🛡️ CONTROL DE FALSO POSITIVO: turnoA con rechazos → turnoB LIMPIO → turnoC.
 * El turno limpio drena la ventana y rompe la racha: turnoC no debe heredar la
 * sospecha del turnoA. Un usuario que cambia de tema no arrastra la vieja.
 *
 * Se ejecuta con:  npx tsx tests/ventanillaSesion.test.ts
 */
import {
  crearVentanilla,
  abrirTurno,
  registrarRechazo,
  type VentanillaReescritura,
} from "../src/engine/reescrituraEntreTurnos";

let ok = 0;
let fail = 0;
const af = (nombre: string, cond: boolean) => {
  if (cond) { ok++; console.log("  \u2713 " + nombre); }
  else { fail++; console.log("  \u2717 " + nombre); }
};

/**
 * Simula UN turno del handler: rota la ventana al arrancar (abrirTurno) y
 * registra `rechazos` reescrituras idénticas. Devuelve si algún rechazo cortó.
 * Es el contrato nuevo de server.ts: la ventanilla entra desde fuera, el turno
 * no la crea.
 */
function turnoDeSesion(v: VentanillaReescritura, turnoId: number, rechazos: number): boolean {
  abrirTurno(v, turnoId); // v1.62.0 — lo que ahora hace el handler al arrancar
  let corto = false;
  for (let i = 0; i < rechazos; i++) {
    if (registrarRechazo(v, turnoId).cortar) { corto = true; break; }
  }
  return corto;
}

// ── DEFECTO SEMBRADO: ventanilla recreada en cada turno (v1.61.0) ──────────────
const secuenciaBug = [2, 2, 2, 2]; // cuatro turnos, 2 reescrituras idénticas cada uno
let cortoConBug = false;
for (let t = 0; t < secuenciaBug.length; t++) {
  // EL BUG: cada turno nace con su PROPIA ventanilla → historial vacío siempre.
  const vEfimera = crearVentanilla(1000 + t);
  for (let i = 0; i < secuenciaBug[t]; i++) {
    if (registrarRechazo(vEfimera, 1000 + t).cortar) { cortoConBug = true; }
  }
}
af("DEFECTO: con ventanilla recreada por turno, 2+2+2+2 NUNCA corta", cortoConBug === false);

// ── CORRECCIÓN: una ventanilla de sesión que sobrevive a los turnos ────────────
const vSesion: VentanillaReescritura = crearVentanilla(0);
const turnoA = turnoDeSesion(vSesion, 2001, 2); // turnoA: 2 rechazos
const turnoB = turnoDeSesion(vSesion, 2002, 2); // turnoB: 2 rechazos
const turnoC = turnoDeSesion(vSesion, 2003, 2); // turnoC: 2 → ventana 6 → corta
af("CORRECCIÓN: turnoA (2 rechazos) no corta", turnoA === false);
af("CORRECCIÓN: turnoB (2 rechazos) no corta", turnoB === false);
af("CORRECCIÓN: turnoC hereda la ventana de sesión y SÍ corta", turnoC === true);

// ── PERSISTENCIA: 1 rechazo por turno, 3 turnos seguidos → corta ──────────────
const vPersist: VentanillaReescritura = crearVentanilla(0);
af("persistencia: turnoA (1) no corta", turnoDeSesion(vPersist, 3001, 1) === false);
af("persistencia: turnoB (1) no corta", turnoDeSesion(vPersist, 3002, 1) === false);
af("persistencia: turnoC (1) corta por 3 turnos seguidos", turnoDeSesion(vPersist, 3003, 1) === true);

// ── FALSO POSITIVO: turnoA rechazos → turnoB LIMPIO → turnoC, la racha no hereda ─
const vLimpio: VentanillaReescritura = crearVentanilla(0);
const fpA = turnoDeSesion(vLimpio, 4001, 2); // turnoA: 2 rechazos
const fpB = turnoDeSesion(vLimpio, 4002, 0); // turnoB: LIMPIO (0 rechazos)
const fpC = turnoDeSesion(vLimpio, 4003, 2); // turnoC: 2 rechazos
af("falso positivo: turnoA (2) no corta", fpA === false);
af("falso positivo: turnoB limpio no corta", fpB === false);
af("falso positivo: turnoC NO hereda la racha del turnoA (no corta)", fpC === false);

// ── FALSO POSITIVO 2: dos turnos limpios drenan del todo la ventana ───────────
const vDrena: VentanillaReescritura = crearVentanilla(0);
turnoDeSesion(vDrena, 5001, 2);
turnoDeSesion(vDrena, 5002, 2);
turnoDeSesion(vDrena, 5003, 0); // limpio
turnoDeSesion(vDrena, 5004, 0); // limpio
af("tras dos turnos limpios, un turno con 2 rechazos no corta", turnoDeSesion(vDrena, 5005, 2) === false);

// ── abrirTurno al arrancar NO borra el conteo si el id no cambia ─────────────
const vMismo: VentanillaReescritura = crearVentanilla(6001);
abrirTurno(vMismo, 6001); // mismo id: no rota
registrarRechazo(vMismo, 6001);
abrirTurno(vMismo, 6001); // mismo id otra vez: no debe rotar ni perder el conteo
af("abrirTurno con el mismo id no pierde el conteo del turno", vMismo.enTurno === 1 && vMismo.historial.length === 0);

console.log(`\nResultado: ${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);

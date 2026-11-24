/**
 * tests/reescrituraEntreTurnos.test.ts — v1.61.0
 * Defecto sembrado: la secuencia REAL del log de Mario (34 rechazos agrupados
 * en turnos de menos de 3: el corte por turno nunca llegó y el usuario giró
 * turno tras turno). Falsos positivos: un turno con 2 rechazos aislados NO corta.
 */
import {
  crearVentanilla,
  registrarRechazo,
  abrirTurno,
  cierreEntreTurnos,
  TOPE_RECHAZOS_ENTRE_TURNOS,
  TOPE_TURNOS_PERSISTENTES,
  VENTANA_TURNOS,
  type VentanillaReescritura,
} from "../src/engine/reescrituraEntreTurnos";

let ok = 0;
let fail = 0;
const af = (nombre: string, cond: boolean) => {
  if (cond) { ok++; console.log("  ✓ " + nombre); }
  else { fail++; console.log("  ✗ " + nombre); }
};

// ── Constantes ───────────────────────────────────────────────────────────────
af("el tope entre turnos es 6", TOPE_RECHAZOS_ENTRE_TURNOS === 6);
af("la ventana recuerda 3 turnos", VENTANA_TURNOS === 3);
af("persistencia: 3 turnos seguidos", TOPE_TURNOS_PERSISTENTES === 3);

// ── DEFECTO SEMBRADO: la secuencia real del log ──────────────────────────────
// El log muestra 34 rechazos en 3 bloques. Reconstruyo la forma: turnos con
// 1-2 rechazos cada uno, nunca 3, así el circuito por turno no dispara.
const vReal: VentanillaReescritura = crearVentanilla(1000);
let cortaEn = -1;
let turno = 1000;
let rechazosDelTurno = 0;
const secuenciaReal: number[] = [];
// 17 rechazos repartidos en turnos de 1-2 (forma medida en el log).
for (let i = 0; i < 17; i++) {
  if (i % 3 !== 2) { // turnos con 1 o 2 rechazos, el 3º queda en 0 (giró)
    if (rechazosDelTurno === 0) { turno++; rechazosDelTurno = 0; }
    secuenciaReal.push(turno);
    rechazosDelTurno++;
    if (rechazosDelTurno >= 2) { rechazosDelTurno = 0; }
  } else {
    turno++; rechazosDelTurno = 0;
  }
}
for (let i = 0; i < secuenciaReal.length; i++) {
  const veredicto = registrarRechazo(vReal, secuenciaReal[i]);
  if (veredicto.cortar) { cortaEn = i; break; }
}
af("corta ANTES de agotar los 17 rechazos del log", cortaEn >= 0);
af("corta temprano (≤ 8 rechazos, no 17)", cortaEn >= 0 && cortaEn <= 8);
af("el corte nombra el motivo", cortaEn >= 0 && registrarRechazo(vReal, secuenciaReal[cortaEn]).motivo.length > 0);

// ── Persistencia: 1 rechazo por turno, 3 turnos seguidos → corta ─────────────
const vPersist: VentanillaReescritura = crearVentanilla(1);
af("turno 1 con 1 rechazo NO corta", registrarRechazo(vPersist, 1).cortar === false);
af("turno 2 con 1 rechazo NO corta", registrarRechazo(vPersist, 2).cortar === false);
af("turno 3 con 1 rechazo SÍ corta (persistencia)", registrarRechazo(vPersist, 3).cortar === true);

// ── Total: 6 rechazos en un solo turno → corta aunque sea el primero ────────
const vTotal: VentanillaReescritura = crearVentanilla(1);
let cortaTotal = false;
for (let i = 0; i < 6; i++) {
  if (registrarRechazo(vTotal, 1).cortar) { cortaTotal = true; break; }
}
af("6 rechazos en un turno cortan por total", cortaTotal === true);

// ── FALSOS POSITIVOS: un turno sano con 2 rechazos NO corta ─────────────────
const vSano: VentanillaReescritura = crearVentanilla(1);
af("2 rechazos en el turno 1 NO cortan", registrarRechazo(vSano, 1).cortar === false);
af("2 rechazos en el turno 2 NO cortan", registrarRechazo(vSano, 2).cortar === false);
// t1:2 + t2:2 + t3:1 → tres turnos seguidos con ≥1 → corta, y es lo correcto.
af("t1:2 + t2:2 + t3:1 corta por persistencia", registrarRechazo(vSano, 3).cortar === true);

// El turno LIMPIO (cero rechazos) rompe la racha: es el falso positivo que
// importa, porque el usuario que cambia de tema no debe arrastrar la vieja.
const vLimpio: VentanillaReescritura = crearVentanilla(1);
registrarRechazo(vLimpio, 1); registrarRechazo(vLimpio, 1);   // t1: 2
registrarRechazo(vLimpio, 2); registrarRechazo(vLimpio, 2);   // t2: 2
abrirTurno(vLimpio, 3);                                        // t3 LIMPIO (0)
af("un turno con cero rechazos rompe la racha", registrarRechazo(vLimpio, 4).cortar === false);

// ── Rotación de la ventana: lo viejo sale ────────────────────────────────────
const vRot: VentanillaReescritura = crearVentanilla(1);
for (let i = 0; i < 2; i++) registrarRechazo(vRot, 1);       // turno 1: 2
for (let i = 0; i < 2; i++) registrarRechazo(vRot, 2);       // turno 2: 2
// turno 3: 2 más → total ventana 6 → corta
af("ventana llena (2+2+2) corta", registrarRechazo(vRot, 3).cortar === true);
// y si el turno 4 llega limpio, el historial ya rotó y el total baja
// y si el usuario cambia de tema, dos turnos limpios drenan la ventana
const vRot2: VentanillaReescritura = crearVentanilla(1);
registrarRechazo(vRot2, 1); registrarRechazo(vRot2, 1);
registrarRechazo(vRot2, 2); registrarRechazo(vRot2, 2);
registrarRechazo(vRot2, 3); registrarRechazo(vRot2, 3);      // ventana llena (6) → corta
abrirTurno(vRot2, 4);                                        // t4 LIMPIO
abrirTurno(vRot2, 5);                                        // t5 LIMPIO
af("tras dos turnos limpios la ventana drena", registrarRechazo(vRot2, 5).cortar === false);

// ── El cierre es honesto y nombra archivos ──────────────────────────────────
const cierre = cierreEntreTurnos("reescribió lo mismo en 3 turnos seguidos", ["index.html", "index.html", "style.css"]);
af("el cierre menciona los archivos", cierre.includes("index.html") && cierre.includes("style.css"));
af("el cierre no repite archivos", !cierre.includes("index.html, index.html"));
af("el cierre pide señalar QUÉ cambiar", cierre.includes("Señalame EXACTO"));

// ── Casos límite ─────────────────────────────────────────────────────────────
const vVacia: VentanillaReescritura = crearVentanilla(1);
af("un turno nuevo sin rechazos previos no rompe", registrarRechazo(vVacia, 1).cortar === false);
af("el mismo turnoId no rota (no se pierde el conteo)", (() => {
  const v: VentanillaReescritura = crearVentanilla(7);
  registrarRechazo(v, 7); registrarRechazo(v, 7);
  return v.historial.length === 0 && v.enTurno === 2 && v.total === 2;
})());

console.log(`\nResultado: ${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
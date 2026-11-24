/**
 * turnoLargo.test.ts — v1.0.20
 * «trabajan bien pero a los 20 o 30 minutos se corta y se pierde todo»:
 * el silencio de un turno largo no puede leerse como muerte del turno, y el
 * corte (cuando de verdad toca) tiene que decir qué pasó y no borrar lo hecho.
 */
import { vigilarTurnoLargo, SILENCIO_TOLERADO_MS, MUERTO_MS, AVISO_CADA_MS } from "../src/engine/turnoLargo";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

const T0 = 1_000_000;
const min = 60_000;

// El caso normal: el modelo va escribiendo.
const normal = vigilarTurnoLargo({ inicio: T0, ultimoAliento: T0 + 10 * min }, T0 + 10 * min + 500);
c("con texto llegando no dice nada ni corta", normal.accion === "seguir" && normal.dicho === "");
c("y lleva bien la cuenta de minutos", normal.minutos === 10, String(normal.minutos));

// El caso de Mario: 20 minutos de trabajo, y un silencio de 3 minutos (el modelo piensa).
const pensando = vigilarTurnoLargo({ inicio: T0, ultimoAliento: T0 + 17 * min }, T0 + 20 * min);
c("3 min de silencio a los 20 min NO corta el turno", pensando.accion === "mantener");
c("y avisa que sigue trabajando, con el minuto", /minuto 20/.test(pensando.dicho), pensando.dicho);
c("dice explícitamente que no se corta solo", /NO se corta solo/.test(pensando.dicho), pensando.dicho);

// Silencio corto: ni se menciona.
c("1 min de silencio es invisible", vigilarTurnoLargo({ inicio: T0, ultimoAliento: T0 + 5 * min }, T0 + 6 * min).dicho === "");
c("el umbral de aviso es el declarado", SILENCIO_TOLERADO_MS === 120_000);

// Silencio largo de verdad: se corta, pero con resumen y con número.
const muerto = vigilarTurnoLargo({ inicio: T0, ultimoAliento: T0 + 2 * min }, T0 + 2 * min + MUERTO_MS);
c("20 min sin un byte sí se da por caído", /se corta el turno/.test(muerto.dicho), muerto.dicho);
c("y aclara que lo escrito queda guardado", /queda guardado/.test(muerto.dicho), muerto.dicho);
c("y dice cuánto llevaba", /llevaba 22 min/.test(muerto.dicho), muerto.dicho);

// Cancelación a mano: no se confunde con caída.
const aMano = vigilarTurnoLargo({ inicio: T0, ultimoAliento: T0 + min, cancelado: true }, T0 + 3 * min);
c("detener a mano dice «detenido», no «se cayó»", /detenido a mano/.test(aMano.dicho) && !/se corta/.test(aMano.dicho), aMano.dicho);

// Bordes que no pueden romper la vigilancia.
c("sin aliento previo se mide desde el inicio", vigilarTurnoLargo({ inicio: T0, ultimoAliento: 0 }, T0 + 30_000).accion === "seguir");
c("basura no rompe", vigilarTurnoLargo({} as any, NaN).accion === "seguir");
c("el aviso se repite cada 5 min, no en cada vuelta", AVISO_CADA_MS === 300_000);

console.log(`\n${"─".repeat(56)}\nTURNO LARGO (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }

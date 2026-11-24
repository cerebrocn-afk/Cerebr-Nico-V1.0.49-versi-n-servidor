/**
 * tests/ecoRespuestas.test.ts — v1.62.0
 * ============================================================================
 * Defecto sembrado: la sesión `1792793541672` (23/10), mensajes 20→21 y 22→23.
 * Preguntas distintas («¿los 19 archivos son del proyecto?» / «el sandbox no
 * arranca»), y el modelo volcó la MISMA respuesta de 10,6 KB las dos veces.
 * La ventanilla de sesión contó 0 rechazos, porque sólo escucha escrituras de
 * archivo: esto era texto de chat.
 *
 * El umbral no es un número redondo elegido a ojo: está medido contra los pares
 * reales de esa misma sesión (ver `UMBRAL_ECO` en el módulo).
 */
import {
  semejanzaDeRespuestas,
  esEcoDeRespuesta,
  ultimoTextoAsistentePrevio,
  lineasDistintasDeRespuesta,
  cierrePorEcoEntreTurnos,
  UMBRAL_ECO,
  LARGO_MINIMO_ECO,
} from "../src/engine/ecoRespuestas";
import { crearVentanilla, abrirTurno, registrarRechazo } from "../src/engine/reescrituraEntreTurnos";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fix = (n: string) => path.join(aqui, "fixtures", n);
const leer = (n: string): string | null => (fs.existsSync(fix(n)) ? fs.readFileSync(fix(n), "utf8") : null);

let ok = 0;
let fail = 0;
const af = (nombre: string, cond: boolean) => {
  if (cond) { ok++; console.log("  ✓ " + nombre); }
  else { fail++; console.log("  ✗ " + nombre); }
};

// ── EL PAR REAL ──────────────────────────────────────────────────────────────
const m21 = leer("eco-anterior-msg21.txt");
const m23 = leer("eco-actual-msg23.txt");
if (m21 && m23) {
  const s = semejanzaDeRespuestas(m21, m23);
  console.log(`  · par real: ${m21.length} vs ${m23.length} caracteres · semejanza ${s.toFixed(4)}`);
  af("reconoce el eco real de la sesión (≥ umbral)", s >= UMBRAL_ECO);
  af("  y lo declara eco con las funciones de decisión", esEcoDeRespuesta(m21, m23) === true);
  af("  es simétrico (da lo igual cuál fue antes)", esEcoDeRespuesta(m23, m21) === true);
  // Con igualdad de prefijo no alcanzaba: por eso el circuito viejo no lo vio.
  let prefijo = 0;
  while (prefijo < Math.min(m21.length, m23.length) && m21[prefijo] === m23[prefijo]) prefijo++;
  af("  un test de igualdad por prefijo NO lo cazaba (< 60 %)", prefijo / Math.min(m21.length, m23.length) < 0.6);
  console.log(`  · prefijo idéntico: sólo ${prefijo} caracteres (${(prefijo / Math.min(m21.length, m23.length) * 100).toFixed(0)} %)`);
  af("  las líneas distintas de cada respuesta son casi las mismas", Math.abs(lineasDistintasDeRespuesta(m21).length - lineasDistintasDeRespuesta(m23).length) < 20);
} else {
  af("existen los fixtures del par real", false);
}

const m19 = leer("no-eco-msg19.txt");
const m9 = leer("no-eco-msg9.txt");
if (m21 && m19) {
  const s = semejanzaDeRespuestas(m19, m21);
  af(`un par del mismo tema NO es eco (${s.toFixed(3)} < ${UMBRAL_ECO})`, s < UMBRAL_ECO && esEcoDeRespuesta(m19, m21) === false);
}
if (m21 && m9) {
  af("respuestas sin relación dan 0", semejanzaDeRespuestas(m9, m21) === 0);
}

// ── EL LARGO MÍNIMO: coincidir en corto es normal, no es bucle ───────────────
const corta = "Sí, las 97 herramientas están registradas y operativas.";
af("dos respuestas cortas idénticas NO son eco", esEcoDeRespuesta(corta, corta) === false);
af("  el largo mínimo existe y es explícito", LARGO_MINIMO_ECO >= 500);
const largaDistinta = "x ".repeat(500) + "\n" + "y ".repeat(500);
af("  y con largo de sobra pero contenido distinto, tampoco", esEcoDeRespuesta(largaDistinta, largaDistinta.replace(/x /g, "z ")) === false);

const vacia = "";
af("texto vacío no rompe la semejanza", semejanzaDeRespuestas(vacia, m21 || "hola") === 0);
af("null/undefined no rompen nada", semejanzaDeRespuestas(undefined as any, null as any) === 0);

// ── EL HISTORIAL: las dos formas que usa el motor ────────────────────────────
const historial = [
  { role: "system", content: "sos un agente" },
  { role: "user", content: "primera pregunta" },
  { role: "assistant", content: "primera respuesta larga del asistente" },
  { role: "user", content: "segunda pregunta" },
];
af("toma la última respuesta previa (OpenAI-compat)", ultimoTextoAsistentePrevio(historial) === "primera respuesta larga del asistente");
af("también entiende `parts` de Gemini", ultimoTextoAsistentePrevio([{ role: "assistant", parts: [{ text: "hola desde gemini" }] }]) === "hola desde gemini");
af("con content en array de partes", ultimoTextoAsistentePrevio([{ role: "assistant", content: [{ type: "text", text: "partido" }, { type: "text", text: "en dos" }] }]) === "partido\nen dos");
af("sin respuestas previas devuelve null", ultimoTextoAsistentePrevio([{ role: "user", content: "hola" }]) === null);
af("historial vacío no rompe", ultimoTextoAsistentePrevio([] as any) === null);

// ── LA VENTANILLA DE SESIÓN (diseño de v1.62.0: un objeto a nivel de módulo) ──
// Acá se prueba el contrato que el eco necesita: el MISMO objeto atraviesa
// turnos, `abrirTurno` rota la ventana, y tres turnos con rechazo cortan.
const v = crearVentanilla(1);
af("la ventanilla arranca en cero", v.enTurno === 0 && v.historial.length === 0);
registrarRechazo(v, 1);
abrirTurno(v, 2);
af("el turno cerrado quedó en la ventana", v.historial[v.historial.length - 1] === 1 && v.enTurno === 0);
registrarRechazo(v, 2);
abrirTurno(v, 3);
const veredicto = registrarRechazo(v, 3);
af("tres turnos seguidos con rechazo cortan", veredicto.cortar === true);
af("  el aviso del eco cita el motivo y no inventa archivos", cierrePorEcoEntreTurnos(veredicto.motivo).includes(veredicto.motivo));

// Un turno limpio tiene que drenar: si no, el corte quedaría pegado para siempre.
const w = crearVentanilla(10);
registrarRechazo(w, 10);
abrirTurno(w, 11);          // turno limpio: no registra nada
abrirTurno(w, 12);
const veredW = registrarRechazo(w, 12);
af("un turno limpio entra a la ventana y corta la racha", w.historial.includes(0) && veredW.cortar === false);

console.log(`\n  resultados: ${ok} correctas, ${fail} fallidas`);
if (fail > 0) process.exit(1);

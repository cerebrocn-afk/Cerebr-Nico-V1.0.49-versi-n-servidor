/**
 * falloVisible.test.ts — v1.88.1 · EL ✗ EXPLICA, EL BUCLE SE CORTA, LA UI RESPIRA
 * ==============================================================================
 * Tres quejas medidas (sesión 1793231473406 y capturas del 28/10):
 *  1. «¿por qué pone una X en rojo si el modelo hizo la tarea?» → el ✗ carga el
 *     motivo que la herramienta ya decía.
 *  2. «a veces se queda trancado pensando sin hacer nada» → cinco fallos
 *     seguidos de la MISMA herramienta cortan el turno.
 *  3. «a esa altura de mensajes ya estaba el IDE lento» → las dos colas de la
 *     interfaz (bitácora y acciones) tienen tope.
 */
import { readFileSync } from "node:fs";
import {
  motivoDeResultado, SIN_MOTIVO, TOPE_MOTIVO,
  nuevoVigilanteFallos, vigilarFallo,
  UMBRAL_AVISO_FALLOS, UMBRAL_CORTE_FALLOS,
  directivaPorFallos, cierrePorFallos,
} from "../src/engine/vigilanteDeFallos";
import { conTope, podar, TOPE_BITACORA, TOPE_ACCIONES } from "../src/engine/colaConTope";

let ok = 0;
const fallos: string[] = [];
function c(t: string, o: boolean, d = "") { if (o) ok++; else fallos.push(t + (d ? ` [${d}]` : "")); }
const leer = (p: string) => readFileSync(p, "utf8");

console.log("· motivoDeResultado");
c("saca `error` del JSON", motivoDeResultado(JSON.stringify({ ok: false, error: "Ruta no encontrada: /api/fs/list" })) === "Ruta no encontrada: /api/fs/list");
c("saca `motivo`", motivoDeResultado(JSON.stringify({ ok: false, motivo: "ruta protegida" })) === "ruta protegida");
c("saca `message`", motivoDeResultado(JSON.stringify({ message: "sin permiso" })) === "sin permiso");
c("texto plano: la salida ES el motivo", motivoDeResultado("❌ No pude listar: sin permiso") === "❌ No pude listar: sin permiso");
c("un JSON sin campo de motivo NO se muestra crudo", motivoDeResultado(JSON.stringify({ ok: false })) === SIN_MOTIVO);
c("vacío → sin motivo declarado", motivoDeResultado("   ") === SIN_MOTIVO);
c("una línea: los saltos se colapsan", !motivoDeResultado("a\n  b\t c").includes("\n"));
c(`tope de ${TOPE_MOTIVO} caracteres`, motivoDeResultado("x".repeat(500)).length === TOPE_MOTIVO);
c("el número de ruta llega intacto", motivoDeResultado(JSON.stringify({ error: "no existe app/src/main/java/com/finance/app/ui/Main.kt" })).endsWith("Main.kt"));

console.log("· vigilante de fallos repetidos");
const v = nuevoVigilanteFallos();
c("arranca limpio", v.seguidos === 0);
c("1.º fallo: cuenta 1, no avisa", (() => { const r = vigilarFallo(v, "write_file", false, "ruta muerta"); return r.seguidos === 1 && !r.justoAviso && !r.corto; })());
c("2.º fallo: cuenta 2", vigilarFallo(v, "write_file", false, "ruta muerta").seguidos === 2);
c("3.º fallo: avisa en el instante exacto", (() => { const r = vigilarFallo(v, "write_file", false, "ruta muerta"); return r.seguidos === UMBRAL_AVISO_FALLOS && r.justoAviso && !r.corto; })());
c("4.º: no vuelve a avisar (una directiva, no un sermón)", (() => { const r = vigilarFallo(v, "write_file", false, "ruta muerta"); return !r.justoAviso && !r.corto; })());
c("5.º: corta", (() => { const r = vigilarFallo(v, "write_file", false, "ruta muerta"); return r.seguidos === UMBRAL_CORTE_FALLOS && r.corto; })());
const v2 = nuevoVigilanteFallos();
vigilarFallo(v2, "write_file", false, "x");
vigilarFallo(v2, "write_file", false, "x");
c("un ÉXITO reinicia la cuenta", (() => { const r = vigilarFallo(v2, "write_file", true); return r.seguidos === 0 && !r.corto; })());
vigilarFallo(v2, "read_file", false, "y");
c("otra herramienta no suma a la cuenta ajena", vigilarFallo(v2, "fs_list", false, "z").seguidos === 1);
const v3 = nuevoVigilanteFallos();
vigilarFallo(v3, "write_file", false, "motivo viejo");
vigilarFallo(v3, "write_file", false, "motivo nuevo");
c("el motivo que se muestra es el último", v3.ultimoMotivo === "motivo nuevo");

console.log("· la directiva y el corte nombran el hecho");
{
  const d = directivaPorFallos("write_file", 3, "Ruta no encontrada: /api/fs/list");
  c("nombra la herramienta", d.includes("write_file"));
  c("dice cuántos fallos", d.includes("3 fallos"));
  c("pega el motivo tal cual", d.includes("Ruta no encontrada: /api/fs/list"));
  c("ordena cambiar de estrategia, no repetir", /OTRA herramienta/.test(d));
  const ci = cierrePorFallos("write_file", 5, "ruta muerta");
  c("el corte dice que la tarea quedó ABIERTA", /abierta, no hecha/.test(ci));
  c("el corte nombra herramienta, cuenta y motivo", ci.includes("write_file") && ci.includes("5") && ci.includes("ruta muerta"));
}

console.log = console.log;
console.log("· las colas de la interfaz tienen techo");
{
  const larga = Array.from({ length: 1200 }, (_, i) => `l${i}`);
  c("podar deja TOPE_BITACORA líneas", podar(larga, TOPE_BITACORA).length === TOPE_BITACORA);
  c("podar conserva las MÁS RECIENTES", podar(larga, TOPE_BITACORA)[TOPE_BITACORA - 1] === "l1199" && podar(larga, TOPE_BITACORA)[0] === `l${1200 - TOPE_BITACORA}`);
  c("por debajo del tope devuelve la MISMA referencia", (() => { const a = ["x", "y"]; return podar(a, 400) === a; })());
  const col: string[] = [];
  for (let i = 0; i < 900; i++) { const nueva = conTope(col, `a${i}`, TOPE_ACCIONES); col.length = 0; col.push(...nueva); }
  c("conTope nunca pasa del tope", col.length === TOPE_ACCIONES);
  c("conTope conserva el orden", col[col.length - 1] === "a899" && col[0] === `a${900 - TOPE_ACCIONES}`);
  c("tope 1 no revienta", conTope(["a"], "b", 1).join() === "b");
  c("el array nuevo NO muta el anterior", (() => { const a = ["1"]; conTope(a, "2", 5); return a.length === 1; })());
}

console.log("· cableado: la promesa llega al usuario");
{
  const ciclo = leer("server/cicloOpenAICompat.ts");
  c("el lazo importa el vigilante nuevo", /from "\.\.\/src\/engine\/vigilanteDeFallos"/.test(ciclo));
  c("las DOS ramas de herramienta lo llaman", (ciclo.match(/vigilarFallo\(vigilanteFallos/g) || []).length === 2);
  c("el evento de acción lleva el motivo", /action: \{ tool: n, detail: detalle, ok, motivo: motivoVisible \}/.test(ciclo));
  c("a los 3 se inyecta la directiva", /directivaPorFallos\(vig\.herramienta/.test(ciclo));
  c("a los 5 se corta el bucle", /if \(cortePorFallos\) break;/.test(ciclo));
  c("el corte se cuenta al usuario con su motivo", /cierrePorFallos\(cortePorFallos, UMBRAL_CORTE_FALLOS, motivoCorteFallos\)/.test(ciclo));
  c("★ el ✗ ya no dice el síntoma genérico", !ciclo.includes('terminarPasoVivo(ok, ok ? null : "la herramienta devolvió fallo")'));

  const panel = leer("src/components/PlanificationPanel.tsx");
  // v1.0.20 · la TANDA de filas ✓/✗ se fue de la cara (poda pedida por Mario),
  // pero el MOTIVO del fallo no puede desaparecer: la hoja pinta UNA línea con
  // el último ✗ que trajo motivo. Se blinda eso (y que no vuelva el feed).
  c("el panel muestra el motivo del ✗ (una línea, con su herramienta)",
    panel.includes("ultimoFallo") && /\{ultimoFallo\.motivo\}/.test(panel) && /ultimoFallo\.tool/.test(panel) &&
    /\.ok === false && a\.motivo/.test(panel));
  c("★ el contador dice INTENTOS, no «tarea fallida»", /intento\(s\) fallido\(s\)/.test(panel));
  c("el tipo del panel admite el motivo", /motivo\?: string \| null/.test(panel));
  c("y el tipo compartido también", /motivo\?: string \| null/.test(leer("src/types.ts")));

  const app = leer("src/App.tsx");
  c("actionLog entra por conTope", /setActionLog\(\(prev\) => conTope\(prev,[\s\S]{0,90}TOPE_ACCIONES\)/.test(app));
  c("terminalLogs se poda al tope", /setTerminalLogs\(\(l\) => podar\(l, TOPE_BITACORA\)\)/.test(app));
  c("★ ninguna de las dos sigue creciendo suelta", !/setActionLog\(\(prev\) => \[\.\.\.prev/.test(app));
}

console.log("═".repeat(66));
if (fallos.length) {
  console.log(`falloVisible: ${ok} correctas · ${fallos.length} FALLIDAS`);
  fallos.forEach((f) => console.log ? console.log(`   ✗ ${f}`) : null);
  process.exit(1);
}
console.log(`═══ falloVisible: ${ok} correctas · 0 fallidas ═══`);

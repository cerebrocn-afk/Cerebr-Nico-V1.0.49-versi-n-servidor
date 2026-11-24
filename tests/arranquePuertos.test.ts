/**
 * arranquePuertos.test.ts — v1.0.20
 * «Arranque en segundo plano con la pantalla de los 7 puertos y sin un 2.º CMD»:
 * la regla de apertura (TS) y su copia ejecutable (.cjs) no pueden divergir, y el
 * .bat no puede volver a abrir una consola para Ollama.
 */
import { decidirApertura as decidirTS } from "../src/engine/arranquePuertos";
import { decidirApertura as decidirCJS } from "../scripts/arranquePuertos.cjs";
import { readFileSync } from "node:fs";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

const plano = [
  { puerto: 3000, vivo: false, quien: "ide", critico: true },
  { puerto: 3500, vivo: false, quien: "sandbox", critico: false },
  { puerto: 5000, vivo: false, quien: "puente", critico: true },
  { puerto: 5100, vivo: false, quien: "memoria", critico: true },
  { puerto: 5102, vivo: false, quien: "creador", critico: true },
  { puerto: 5103, vivo: false, quien: "motor", critico: true },
  { puerto: 11434, vivo: false, quien: "ollama", critico: false },
];
const conVivos = (vivos: number[]) => plano.map((p) => ({ ...p, vivo: vivos.includes(p.puerto) }));
const TODOS = [3000, 3500, 5000, 5100, 5102, 5103, 11434];
const CRITICOS = [3000, 5000, 5100, 5102, 5103];

c("con los críticos arriba se entra ya", decidirTS(conVivos(CRITICOS), 1200, 45000).abrir === true);
c("y se dice que está listo", decidirTS(conVivos(CRITICOS), 1200, 45000).estado === "listo");
c("un opcional fuera no secuestra el arranque", decidirTS(conVivos(CRITICOS), 1200, 45000).motivo.includes("opcional"), decidirTS(conVivos(CRITICOS), 1200, 45000).motivo);

const temprano = decidirTS(conVivos([3000]), 3000, 45000);
c("con críticos apagados y paciencia, NO se abre todavía", temprano.abrir === false && temprano.estado === "esperando");
c("y se nombra quién falta, no solo cuántos", /puente:5000/.test(temprano.motivo), temprano.motivo);
c("los que faltan son los críticos de verdad", temprano.faltan.join(",") === "5000,5100,5102,5103", temprano.faltan.join(","));

const tarde = decidirTS(conVivos([3000]), 46000, 45000);
c("se acabó la paciencia: se entra igual (no hay blanco permanente)", tarde.abrir === true && tarde.estado === "parcial");
c("y se dice en español qué falta y que se reintenta", /falta/.test(tarde.motivo) && /reintenta/.test(tarde.motivo), tarde.motivo);

c("sin inventario no hay nada que esperar: se entra", decidirTS([], 0, 45000).abrir === true);
c("un inventario basura no rompe el arranque", decidirTS(null as any, 0, 45000).abrir === true);
c("paciencia 0 = inmediato", decidirTS(conVivos(TODOS), 0, 0).abrir === true);

// ── TS y su copia ejecutable dicen lo mismo (la que usa el .exe) ─────────────
const casos = [
  { vivos: TODOS, t: 1000, p: 45000 },
  { vivos: CRITICOS, t: 1000, p: 45000 },
  { vivos: [3000], t: 3000, p: 45000 },
  { vivos: [3000], t: 60000, p: 45000 },
  { vivos: [], t: 60000, p: 45000 },
  { vivos: [], t: 10, p: 45000 },
];
let iguales = 0;
const discrepancias: string[] = [];
for (const k of casos) {
  const foto = conVivos(k.vivos).map((p) => ({ puerto: p.puerto, vivo: p.vivo, quien: p.quien, critico: !!p.critico }));
  const a = decidirTS(conVivos(k.vivos), k.t, k.p);
  const b = decidirCJS({ vivos: k.vivos, inventory: foto, total: foto.length, transcurridoMs: k.t, pacienciaMs: k.p });
  if (a.abrir === b.abrir) iguales++;
  else discrepancias.push(`${k.vivos.join("/")}@${k.t}: TS=${a.abrir} CJS=${b.abrir}`);
}
c("el .cjs del .exe decide EXACTAMENTE lo mismo que la fuente TS", iguales === casos.length, `${iguales}/${casos.length} ${discrepancias.join(" ")}`);

// ── v1.0.20 · LA MISMA PUERTA, NO SÓLO LA MISMA RESPUESTA ───────────────────
// Electron llama al .cjs con { vivos, inventory, total, transcurridoMs, pacienciaMs }.
// Si la fuente única sólo aceptara el arreglo, el respaldo del .exe estaría
// decidiendo con UNA forma y la fuente con OTRA: mismos booleanos hoy, deriva
// mañana. Acá se compara la foto entera, campo por campo.
let fotoIguales = 0;
const fotoDisc: string[] = [];
for (const k of casos) {
  const foto = conVivos(k.vivos).map((p) => ({ puerto: p.puerto, vivo: p.vivo, quien: p.quien, critico: !!p.critico }));
  const entrada = { vivos: k.vivos, inventory: foto, total: foto.length, transcurridoMs: k.t, pacienciaMs: k.p };
  const a = (decidirTS as any)(entrada);
  const b = decidirCJS(entrada);
  const igual = a.abrir === b.abrir && a.estado === b.estado && a.motivo === b.motivo && a.faltan.join(",") === b.faltan.join(",");
  if (igual) fotoIguales++;
  else fotoDisc.push(`${k.vivos.join("/")}@${k.t}: TS[${a.estado}|${a.motivo}] CJS[${b.estado}|${b.motivo}]`);
}
c("la fuente TS acepta la FOTO del .exe y da lo mismo que el .cjs (estado, motivo y faltan)", fotoIguales === casos.length, `${fotoIguales}/${casos.length} ${fotoDisc.join(" ")}`);

// El total lo manda la foto, no una constante escondida: con 6 servicios y los
// 5 críticos arriba, «1 opcional fuera» sería una mentira (no hay sexto crítico,
// pero sí hay 1 opcional y es verdad) — lo que se blinda es que el total NO sea 7 fijo.
const foto6 = conVivos([3000, 5000, 5100, 5102, 5103]);
const conTotalPropio = decidirCJS({ vivos: [3000, 5000, 5100, 5102, 5103], inventory: foto6, total: foto6.length, transcurridoMs: 1000, pacienciaMs: 45000 });
c("el total es el de la foto, no un 7 fijo (7 servicios, 5 vivos → 2 fuera)", /2 opcional/.test(conTotalPropio.motivo) && !/3 opcional/.test(conTotalPropio.motivo), conTotalPropio.motivo);
const fotoCorta = conVivos([3000, 5000, 5100, 5102, 5103]).slice(0, 5);
const con5 = decidirCJS({ vivos: [3000, 5000, 5100, 5102, 5103], inventory: fotoCorta, total: fotoCorta.length, transcurridoMs: 1000, pacienciaMs: 45000 });
c("con 5 servicios y todos arriba no inventa opcionales fuera", !/opcional/.test(con5.motivo), con5.motivo);

// ── cero segundas ventanas ───────────────────────────────────────────────────
const bat = readFileSync(new URL("../iniciar_todo_windows.bat", import.meta.url), "utf-8");
const lineaOllama = bat.split(/\r?\n/).filter((l) => /ollama serve/i.test(l) && /^\s*start/.test(l)).join("\n");
c("el .bat conserva UNA línea que arranca ollama serve", lineaOllama.trim().split(/\r?\n/).length === 1, lineaOllama);
// v1.0.36 · EL MOTOR VUELVE A TENER VENTANA PROPIA. La valla anterior pedía
// `start /b` y así selló el defecto: `/b` no despega al hijo de esta consola, y
// al cerrarla Windows manda CTRL_CLOSE a todos los hijos /b. Ollama moría con
// el lanzador: sin motor no hay modelos y el puente al :11434 da ECONNREFUSED.
// La forma que el usuario confirma que funciona (v1.0.9) es ventana propia,
// minimizada y `cmd /k` (sobrevive). Eso es lo que se exige ahora.
c("y esa línea abre SU PROPIA ventana minimizada (cmd /k, sin /b)",
  /^start "Ollama Engine - Puerto 11434" \/min /.test(lineaOllama) && /cmd \/k/i.test(lineaOllama) && !/\/b(\s|$)/.test(lineaOllama),
  lineaOllama.slice(0, 110));
// v1.0.20 · lo que importaba nunca fue el entrecomillado: es que las variables
// se fijen EN LA MISMA ORDEN del start (con &&) para que el hijo las herede.
// v1.0.36 · ahora van DENTRO de la cadena de `cmd /k` (las lee el nieto al
// nacer). Se exige que las seis estén en esa misma línea, no antes de ella.
c("las seis variables de Ollama van dentro del hijo (misma línea, con &&)",
  ["OLLAMA_ORIGINS=*", "OLLAMA_HOST=0.0.0.0:11434", "OLLAMA_KEEP_ALIVE=5m", "OLLAMA_NUM_PARALLEL=1", "OLLAMA_MAX_LOADED_MODELS=1", "OLLAMA_CONTEXT_LENGTH=4096"]
    .every((v) => lineaOllama.includes(`set ${v} &&`)),
  lineaOllama.slice(0, 160));
c("la salida de ollama va al log de la casa (dentro del hijo)", /1>> "%CN_LOGS%\\ollama\.log" 2>&1/.test(lineaOllama), lineaOllama.slice(-90));
const electron = readFileSync(new URL("../electron-main.cjs", import.meta.url), "utf-8");
c("la ventana del .exe nace oculta", /show:\s*process\.env\.CN_MOSTRAR_AL_INSTANTE === "1"/.test(electron));
// El primer loadURL de la IDE vive en el handler de did-fail-load (reintentos);
// el de la carga normal es el ÚLTIMO. Se compara contra ese, no contra el primero.
const cargaFinal = electron.lastIndexOf("loadURL(`http://127.0.0.1:${IDE_PORT}`)");
c("y espera a la casa ANTES de cargar la IDE", electron.indexOf("esperarLaCasa(mainWindow)") > 0 && electron.indexOf("esperarLaCasa(mainWindow)") < cargaFinal, "orden invertido");

console.log(`\n${"─".repeat(56)}\nARRANQUE EN SEGUNDO PLANO (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }

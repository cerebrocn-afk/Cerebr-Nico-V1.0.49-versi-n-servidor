/**
 * avisoVentanaCableado.test.ts — v1.0.20
 * El aviso de ventana no puede quedarse en una función bonita: tiene que salir
 * con `prompt_eval_count` del `done` del servidor y llegar al chat. Esta suite
 * lee el cableado (server/streamContext.ts, server.ts, src/utils/engine.ts,
 * src/App.tsx) porque el defecto de la sesión 1794621531453 fue exactamente ese:
 * capa nueva, nadie la llama.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }
const leer = (rel: string) => { try { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf-8"); } catch { return ""; } };

const sc = leer("server/streamContext.ts");
const srv = leer("server.ts");
const eng = leer("src/utils/engine.ts");
const app = leer("src/App.tsx");

c("streamContext importa el aviso de ventana", /from "\.\.\/src\/engine\/avisoVentana"/.test(sc));
c("el turno declara la ventana con la que salió", /declararVentana\s*\(/.test(sc));
c("el aviso se calcula con la métrica REAL del motor", /avisoDeVentana\(/.test(sc) && /tokensEntrada: metricas\.tokensEntrada/.test(sc));
c("y viaja en el evento done como dato", /avisoVentana\s*:?\s*ventana|avisoVentana:\s*\{|\.\.\.\(ventana \? \{ avisoVentana/.test(sc));
c("sin medida no se avisa (callar es verdad)", /if \(this\.ventanaTurno && metricas\)/.test(sc));
c("server.ts declara la ventana justo después de sanear el prompt", /saneados[\s\S]{0,400}declararVentana\?\.\(/.test(srv));
c("server.ts pasa la ventana EFECTIVA (num_ctx ya saneado)", /num_ctx\) \|\| profile\.numCtx/.test(srv));
c("engine.ts lee avisoVentana del done", /avisoVentanaTurno = data\.avisoVentana/.test(eng));
c("engine.ts lo devuelve en el meta de onDone", /avisoVentana: avisoVentanaTurno/.test(eng));
c("App.tsx escribe el aviso en el registro del turno", /avisoVentana/.test(app) && /setTerminalLogs\(\(l\) => \[\.\.\.l, `\[\$\{new Date\(\)\.toLocaleTimeString\(\)\}\] \$\{icono\}/.test(app));
c("App.tsx distingue desborde de ajustado (dos iconos)", /desborda" \? "⛔"/.test(app));
c("el aviso no puede romper el cierre del turno", /un aviso nunca puede romper el cierre del turno/.test(app));

console.log(`\n${"─".repeat(56)}\nAVISO DE VENTANA CABLEADO (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }

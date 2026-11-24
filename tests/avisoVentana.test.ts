/**
 * avisoVentana.test.ts — v1.0.20
 * «Se corta» decía una cosa y eran dos: desborde de ventana vs prefill lento.
 */
import { avisoDeVentana, avisoDeEspera, UMBRAL_AJUSTADO } from "../src/engine/avisoVentana";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

const mudo = avisoDeVentana(null, 8192, "qwen3.5:4b");
c("sin medida no se avisa nada (no se inventa un diagnóstico)", !mudo.avisa && mudo.texto === "" && mudo.ocupacion === null);
const sinCtx = avisoDeVentana({ tokensEntrada: 900 }, 0, "m");
c("sin ventana conocida no se divide por cero", !sinCtx.avisa);

const holgado = avisoDeVentana({ tokensEntrada: 2000 }, 8192, "m");
c("un prompt holgado no avisa", !holgado.avisa && holgado.nivel === "ok", String(holgado.ocupacion));

const ajuste = avisoDeVentana({ tokensEntrada: Math.ceil(8192 * (UMBRAL_AJUSTADO / 100)) }, 8192, "m");
c("al umbral ya avisa «ajustado»", ajuste.avisa && ajuste.nivel === "ajustado", ajuste.texto);
c("el aviso «ajustado» dice que el próximo turno puede no entrar", /próximo turno/.test(ajuste.texto));

const desborde = avisoDeVentana({ tokensEntrada: 17929 }, 8192, "qwen3.5:4b");
c("17929 > 8192 es «desborda», el 400 real de la sesión", desborde.nivel === "desborda" && desborde.avisa);
c("y dice que NO es que el modelo se corte", /no es que el modelo/i.test(desborde.texto), desborde.texto);
c("y da las tres salidas (ventana / historia / modelo)", /panel Pro/.test(desborde.texto) && /historia/.test(desborde.texto) && /modelo/.test(desborde.texto));
c("la ocupación se calcula en %", desborde.ocupacion === 219, String(desborde.ocupacion));

// ── espera: carga vs prefill ────────────────────────────────────────────────
const carga = avisoDeEspera({ msCarga: 120000, tokensEntrada: 100 }, "m");
c("120 s de CARGA se atribuyen a RAM/disco", /CARGAR/.test(carga) && !/prompt es GRANDE/.test(carga), carga);
const prefill = avisoDeEspera({ msCarga: 3000, tokensEntrada: 4400 }, "m");
c("prompt grande sin primera palabra se atribuye al prefill", /prompt es GRANDE/.test(prefill), prefill);
c("el aviso de prefill dice que no es que se cayó", /no es que el modelo/i.test(prefill), prefill);
const neutro = avisoDeEspera({}, "m");
c("sin medidas el consejo es no culpar al modelo", /antes de culpar al modelo/.test(neutro), neutro);

console.log(`\n${"─".repeat(56)}\nAVISO DE VENTANA (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }

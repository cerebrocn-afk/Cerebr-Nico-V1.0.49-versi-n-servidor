/**
 * brechaArranque.test.ts — v1.0.20
 * «se cae el servidor local» no siempre es una caída: nunca estar ≠ caerse ≠
 * volver. Y el aviso de :11434 tiene que decir la verdad sobre los modelos de pago.
 */
import { clasificarBrecha, avisoDeInferenciaLocal, PUERTO_INFERENCIA_LOCAL } from "../src/engine/brechaArranque";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

c("nunca visto arriba y abajo = «nunca estuvo» (no es una caída)", clasificarBrecha(11434, [], []).hecho === "nunca-estuvo");
c("estuvo arriba y ya no = «se cayó»", clasificarBrecha(11434, [true, true], []).hecho === "se-cayo");
c("abajo y volvió = «volvió», se cuenta una vez", clasificarBrecha(11434, [true, false], [11434]).hecho === "volvio");
c("arriba desde siempre no dice nada", clasificarBrecha(11434, [true], [11434]).dicho === "");
c("sin historia y arriba tampoco inventa", clasificarBrecha(11434, [], [11434]).hecho === "caido-siempre");
c("el texto nombra el puerto", /:11434/.test(clasificarBrecha(11434, [true], []).dicho));

c("el puerto de la inferencia local es :11434", PUERTO_INFERENCIA_LOCAL === 11434);
c("con el puerto vivo no hay aviso", avisoDeInferenciaLocal(true, "se-cayo", "deepseek-4.1-flash") === "");

const caido = avisoDeInferenciaLocal(false, "se-cayo", "deepseek-4.1-flash");
c("el aviso nombra el modelo de pago del giro", /deepseek-4\.1-flash/.test(caido), caido);
c("y dice la verdad: el de pago sigue porque corre en la nube", /corre en la nube/.test(caido), caido);
c("y dice qué SÍ queda degradado (memoria vectorial / pre-chequeo)", /memoria vectorial/.test(caido) && /pre-chequeo/.test(caido), caido);
c("y da la salida concreta", /supervisor|ollama serve/.test(caido), caido);

const nunca = avisoDeInferenciaLocal(false, "nunca-estuvo", "");
c("si nunca arrancó, lo dice con esa palabra y dónde mirar", /no llegó a abrir/.test(nunca) && /ollama\.log/.test(nunca), nunca);
c("sin modelo de giro igual se entiende", /el modelo de pago/.test(nunca), nunca);

console.log(`\n${"─".repeat(56)}\nBRECHA DE ARRANQUE (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }

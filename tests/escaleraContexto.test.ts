/**
 * escaleraContexto.test.ts — v1.0.20
 * El 400 «17929 tokens exceeds 8192» de qwen3.5:4b: el dial no puede fijar la
 * ventana por debajo de lo que el prompt ya usa, y lo DECLARADO manda.
 */
import { decidirVentana, redondearVentana, contextoDeclaradoDeShow, parteDeVentana } from "../src/engine/escaleraContexto";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

c("redondea a bloques de 1024", redondearVentana(4200) === 5120 && redondearVentana(8192) === 8192);
c("nunca baja del suelo de 512", redondearVentana(10) === 512);

const solo = decidirVentana({ numCtxEscalera: 8192, costoPromptTokens: 1000, reservaSalidaTokens: 512 });
c("sin dial se respeta la escalera (un valor de fábrica no es techo)", solo.numCtx === 8192, String(solo.numCtx));

const bajo = decidirVentana({ numCtxEscalera: 8192, dialUsuario: 4096, costoPromptTokens: 1000 });
c("un dial POR DEBAJO de la escalera no manda", bajo.numCtx >= 8192 && !bajo.mandoElUsuario, String(bajo.numCtx));
c("y se explica por qué", /valor de fábrica/.test(bajo.motivo), bajo.motivo);

const alto = decidirVentana({ numCtxEscalera: 8192, dialUsuario: 32768, costoPromptTokens: 1000 });
c("un dial POR ENCIMA de la escalera sí manda", alto.numCtx >= 32768 && alto.mandoElUsuario, String(alto.numCtx));

const grande = decidirVentana({ numCtxEscalera: 4096, costoPromptTokens: 17929 });
c("un prompt de 17.9K ya no cabe en 4096: la ventana crece", grande.numCtx >= 17929, String(grande.numCtx));

const declarado = decidirVentana({ numCtxEscalera: 8192, dialUsuario: 32768, costoPromptTokens: 1000, contextoDeclarado: 8192 });
c("lo que el modelo DECLARA clampa el deseo", declarado.numCtx === 8192, String(declarado.numCtx));
c("y se dice que pedirle más es el 400 garantizado", /400/.test(declarado.motivo), declarado.motivo);
c("si se clampeó, no se afirma que mandó el usuario", declarado.mandoElUsuario === false);

const ram = decidirVentana({ numCtxEscalera: 8192, dialUsuario: 65536, costoPromptTokens: 500, topeRam: 16384 });
c("el techo de RAM también clampa", ram.numCtx === 16384, String(ram.numCtx));

const liv = decidirVentana({ numCtxEscalera: 4096, costoPromptTokens: 9000, liviano: true });
c("en liviano la ventana no crece por encima de la escalera", liv.numCtx === 4096, String(liv.numCtx));
c("y se explica que el prefill se paga por token", /prefill/.test(liv.motivo), liv.motivo);

c("num_ctx nunca por debajo de 512", Math.min(solo.numCtx, bajo.numCtx, alto.numCtx, grande.numCtx, liv.numCtx) >= 512);

// ── /api/show ────────────────────────────────────────────────────────────────
c("lee model_info.<arq>.context_length", contextoDeclaradoDeShow({ model_info: { "qwen3.architecture.context_length": 8192 } }) === 8192);
c("lee cualquier arquitectura sin fijar una", contextoDeclaradoDeShow({ model_info: { "llama.context_length": 131072 } }) === 131072);
c("acepta context_length plano", contextoDeclaradoDeShow({ context_length: 4096 }) === 4096);
c("sin dato devuelve null (no se inventa)", contextoDeclaradoDeShow({ model_info: { "x.embedding_length": 3584 } }) === null);
c("basura devuelve null", contextoDeclaradoDeShow(null) === null && contextoDeclaradoDeShow("x" as any) === null);

c("parteDeVentana calla si no hubo nada que corregir", parteDeVentana(solo, "qwen3.5:4b") === "");
c("parteDeVentana nombra el modelo y el número", /qwen3\.5:4b/.test(parteDeVentana(declarado, "qwen3.5:4b")) && /8192/.test(parteDeVentana(declarado, "qwen3.5:4b")));

console.log(`\n${"─".repeat(56)}\nESCALERA DE CONTEXTO (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }

/**
 * idPedidoProveedor.test.ts — v1.0.20
 * El 404 de los modelos de pago: «zai-glm-5-2» y «deepseek-v4-1-flash-1017» son
 * nombres de la carpeta del usuario, no ids del catálogo. Antes se mandaban tal
 * cual y el proveedor contestaba 404 con el turno sin empezar.
 */
import { resolverIdDePago, IDS_CONOCIDOS } from "../src/utils/idPedidoProveedor";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

// ── el caso textual de la captura ────────────────────────────────────────────
const glm = resolverIdDePago("zai", "zai-glm-5-2", "glm-4.5-flash");
c("«zai-glm-5-2» deja de irse tal cual al proveedor", glm.efectivo !== "zai-glm-5-2" && glm.efectivo !== "glm-5-2", glm.efectivo);
c("y se manda un id del catálogo real", IDS_CONOCIDOS.zai.includes(glm.efectivo), glm.efectivo);
c("y se avisa qué se envió (no 404 mudo)", glm.corregido && /glm-4\.6/.test(glm.aviso), glm.aviso);

const ds = resolverIdDePago("deepseek", "deepseek-v4-1-flash-1017", "deepseek-chat");
c("un «deepseek-v4-1-flash-1017» inventado no se manda", ds.efectivo === "deepseek-chat", ds.efectivo);
c("y el aviso explica que no está en el catálogo", !ds.efectivo.startsWith("deepseek-v4") && /catálogo|nombre de la carpeta/.test(ds.aviso), ds.aviso);

// ── lo que SÍ hay que respetar ───────────────────────────────────────────────
const real = resolverIdDePago("deepseek", "deepseek-chat", "deepseek-chat");
c("un id real se respeta sin tocar nada", real.efectivo === "deepseek-chat" && real.corregido === false && real.aviso === "");
const glm46 = resolverIdDePago("zai", "glm-4.6", "glm-4.5-flash");
c("«glm-4.6» (id real) se respeta tal cual", glm46.efectivo === "glm-4.6", glm46.efectivo);
const pref = resolverIdDePago("zai", "zai-glm-4.6", "glm-4.5-flash");
c("«zai-glm-4.6» pierde solo el prefijo de la carpeta", pref.efectivo === "glm-4.6", pref.efectivo);

// ── nombres de otro fabricante en el proveedor equivocado ────────────────────
const cruzado = resolverIdDePago("mistral", "gpt-4o", "mistral-small-latest");
c("un id de OpenAI en Mistral va con el modelo real de Mistral", cruzado.efectivo === "mistral-small-latest" && cruzado.corregido, cruzado.efectivo);

// ── bordes ───────────────────────────────────────────────────────────────────
c("sin id se usa el del proveedor sin avisar", resolverIdDePago("zai", "   ", "glm-4.5-flash").efectivo === "glm-4.5-flash");
c("un proveedor desconocido no rompe y deja pasar el id", resolverIdDePago("groq", "llama-3.3-70b", "x").efectivo === "llama-3.3-70b");

console.log(`\n${"─".repeat(56)}\nID DE PROVEEDOR (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }

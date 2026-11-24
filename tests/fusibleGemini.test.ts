/**
 * fusibleGemini.test.ts — v1.57.12 · SUITE DE CERTEZA: LA CADENA NO TIENTA MUERTOS
 * =================================================================================
 * Cierra el barrido de 9 modelos Gemini fallando EN SERIE en cada turno (medido
 * en consola el 15/10: tres barridos completos, 404/429/503, cuota de 20 pedidos
 * por día quemándose en modelos que no iban a responder). El fusible obedece lo
 * que Google MISMO dice: «no longer available» = no lo tentar más; «retry in
 * 17m42s» = respetarle el reloj; «high demand» = enfriar 5 minutos. Reloj
 * inyectable: los 17 minutos no se esperan de verdad.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clasificarErrorGemini, registrarFalloGemini, registrarExitoGemini,
  fusibleRechazaGemini, estadoFusibleGemini, informeFusiblesGemini,
  reiniciarFusiblesGemini, MODELOS_GEMINI_VIGENTES, ALIAS_GEMINI_INTERNOS,
} from "../src/engine/fusibleGemini";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let correctas = 0, fallidas = 0;
function comprobar(t: string, c: boolean) {
  if (c) { correctas++; console.log("  ✓ " + t); }
  else { fallidas++; console.log("  ✗ " + t); }
}
function seccion(t: string) { console.log("\n· " + t); }

const T0 = 1_000_000; // reloj inyectable: nada duerme de verdad

// ─────────────────────────────────────────────────────────────────────────────
seccion("1) clasificación: leer el veredicto de Google, no adivinarlo");
{
  const e404 = clasificarErrorGemini(new Error('{"code":404,"message":"This model models/gemini-2.5-flash is no longer available to new users","status":"NOT_FOUND"}'));
  comprobar("404 con «no longer available» → MUERTO", e404.clase === "muerto");
  comprobar("el muerto trae la causa leída de la respuesta", /baja/i.test(e404.senal));
  const e429 = clasificarErrorGemini(new Error("Quota exceeded... Please retry in 17m42.080283981s."));
  comprobar("429 con retry → AGOTADO", e429.clase === "agotado");
  comprobar("respeta el reloj de Google (17m42s ≈ 1062s)", Math.abs(e429.retryMs - 1062080) < 1500);
  const e429cero = clasificarErrorGemini(new Error("Quota exceeded for metric... limit: 0, model: gemini-omni-flash"));
  comprobar("429 con «limit: 0» es agotado LARGO (el plan nunca tiene acceso)", e429cero.clase === "agotado" && e429cero.retryMs >= 25 * 60 * 1000);
  const e503 = clasificarErrorGemini(new Error('{"code":503,"message":"high demand","status":"UNAVAILABLE"}'));
  comprobar("503 → SATURADO con enfriamiento corto", e503.clase === "saturado" && e503.retryMs <= 5 * 60 * 1000);
  comprobar("error de red NO sentencia (otro)", clasificarErrorGemini(new Error("fetch failed")).clase === "otro");
  comprobar("aborto propio NO sentencia", clasificarErrorGemini(new Error("signal is aborted without reason")).clase === "otro");
}

// ─────────────────────────────────────────────────────────────────────────────
seccion("2) el fusible en acción: quien muere no resucita, quien enfría vuelve");
{
  reiniciarFusiblesGemini();
  registrarFalloGemini("gemini-2.5-flash", new Error("404 NOT_FOUND: no longer available"), T0);
  comprobar("el 404 queda rechazado para siempre", fusibleRechazaGemini("gemini-2.5-flash", T0 + 9999 * 1e9));
  registrarFalloGemini("gemini-3-flash-preview", new Error("429 RESOURCE_EXHAUSTED Please retry in 673s."), T0);
  comprobar("a los 600 s sigue enfriado", fusibleRechazaGemini("gemini-3-flash-preview", T0 + 600_000));
  comprobar("pasado su retryDelay (673 s) vuelve a la lista", !fusibleRechazaGemini("gemini-3-flash-preview", T0 + 680_000));
  registrarFalloGemini("gemini-3.6-flash", new Error("503 high demand"), T0);
  comprobar("503 enfría 5 minutos", fusibleRechazaGemini("gemini-3.6-flash", T0 + 4 * 60_000) && !fusibleRechazaGemini("gemini-3.6-flash", T0 + 6 * 60_000));
  registrarFalloGemini("gemini-3.5-flash", new Error("fetch failed"), T0);
  comprobar("un corte de red no apaga el modelo", !fusibleRechazaGemini("gemini-3.5-flash", T0 + 1));
  registrarExitoGemini("gemini-3.6-flash");
  comprobar("responder bien limpia el fusible", !fusibleRechazaGemini("gemini-3.6-flash", T0));
  comprobar("estado legible para el informe", estadoFusibleGemini("gemini-2.5-flash", T0)?.clase === "muerto");
  comprobar("desconocido pasa (el fusible no castiga lo que no conoce)", !fusibleRechazaGemini("gemini-nadie", T0));
}

// ─────────────────────────────────────────────────────────────────────────────
seccion("3) el informe honesto: cuántos saltó la cadena y por qué");
{
  reiniciarFusiblesGemini();
  registrarFalloGemini("gemini-2.5-flash", new Error("404"), T0);
  registrarFalloGemini("gemini-omni-flash", new Error("429 limit: 0"), T0);
  const inf = informeFusiblesGemini(["gemini-2.5-flash", "gemini-omni-flash", "gemini-3.8-flash"], T0);
  comprobar("dice cuántos saltó", /2 modelo/.test(inf));
  comprobar("nombra a cada saltado con su causa", inf.includes("gemini-2.5-flash") && inf.includes("gemini-omni-flash"));
  comprobar("NO incluye al sano", !inf.includes("gemini-3.8-flash"));
  comprobar("sin saltados, silencio (no se inventa informe)", informeFusiblesGemini(["gemini-3.8-flash"], T0) === "");
}

// ─────────────────────────────────────────────────────────────────────────────
seccion("4) la lista fija viaja con el fusible (el monolito ya no la lleva)");
{
  comprobar("MODELOS_GEMINI_VIGENTES exportada y sin el 2.5 muerto", MODELOS_GEMINI_VIGENTES.includes("gemini-3.8-flash") && !MODELOS_GEMINI_VIGENTES.includes("gemini-2.5-flash"));
  comprobar("ALIAS_GEMINI_INTERNOS exportado", ALIAS_GEMINI_INTERNOS.has("gemini-free"));
  const server = readFileSync(path.join(__dirname, "..", "server.ts"), "utf8");
  comprobar("★ EL CABLE: los candidatos se filtran por el fusible", /Array\.from\(new Set\(candidateModels\)\)\.filter\(\(m\) => !fusibleRechazaGemini\(m, Date\.now\(\)\)\)/.test(server));
  comprobar("★ EL CABLE: cada catch de la cadena registra su clase de fallo", /registrarFalloGemini\(targetModel, lastGeminiErr, Date\.now\(\)\)/.test(server));
  comprobar("★ EL CABLE: el éxito limpia el fusible", /registrarExitoGemini\(targetModel\)/.test(server));
  comprobar("★ EL CABLE: el error final informa a cuántos se saltó", /informeFusiblesGemini\(uniqueModels\)/.test(server));
  comprobar("la lista fija YA NO está duplicada en el monolito", (server.match(/gemini-3\.8-flash/g) || []).length <= 2);
}

console.log(`\n═══ FUSIBLE GEMINI: ${correctas} correctas · ${fallidas} fallidas ═══`);
if (fallidas > 0) process.exit(1);

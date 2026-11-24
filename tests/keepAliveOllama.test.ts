/**
 * tests/keepAliveOllama.test.ts — v1.0.17
 * =======================================
 * El error literal que reportó Mario (2026-11-14) desde el chat local:
 *
 *   HTTP 400: time: missing unit in duration "-1"
 *
 * Causa: el panel Pro ofrece «Mantener modelo en RAM → Siempre» y guarda "-1"
 * (que es válido como variable de entorno `OLLAMA_KEEP_ALIVE=-1`, pero NO como
 * campo `keep_alive` del JSON: ahí Ollama exige unidad y contesta 400).
 *
 * Esta suite fija las dos mitades del arreglo:
 *   1. `traducirKeepAlive` manda "-1" como "-1m" y deja intacto lo que ya viene
 *      bien ("5m", "30m", "0", "600").
 *   2. El punto ÚNICO de salida (`aplicarPreferenciaMotor`) ya no devuelve un
 *      keep_alive sin unidad, así que ninguna puerta (chat, agente, warmup,
 *      navegador directo) puede volver a mandar el "-1" que rompe.
 *
 * Correr: npx tsx tests/keepAliveOllama.test.ts
 */
import {
  traducirKeepAlive,
  aplicarPreferenciaMotor,
  getModelProfile,
  fijarPreferenciaMotor,
  resetearPreferenciaMotor,
  keepAliveBajoConsumo,
} from "../src/engine/modelTiers";

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = "") {
  if (condicion) { correctas++; console.log(`  ✓ ${titulo}`); }
  else { fallos.push(`${titulo}${detalle ? ` :: ${detalle}` : ""}`); console.log(`  ✗ ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

// ═══ 1. traducirKeepAlive ══════════════════════════════════════
seccion("1) «Siempre» del panel sale como -1m, no como -1");
{
  comprobar("★ \"-1\" → \"-1m\" (el 400 literal del reporte)", traducirKeepAlive("-1") === "-1m", traducirKeepAlive("-1"));
  comprobar("\"-1.0\" también se traduce", traducirKeepAlive("-1.0") === "-1m", traducirKeepAlive("-1.0"));
  comprobar("con espacios alrededor igual", traducirKeepAlive("  -1  ") === "-1m", JSON.stringify(traducirKeepAlive("  -1  ")));
  comprobar("\"5m\" pasa intacto", traducirKeepAlive("5m") === "5m");
  comprobar("\"30m\" pasa intacto", traducirKeepAlive("30m") === "30m");
  comprobar("\"0\" (descargar al terminar) pasa intacto", traducirKeepAlive("0") === "0");
  comprobar("segundos \"600\" pasan intactos", traducirKeepAlive("600") === "600");
  comprobar("número -1 (por si llega sin comillas) → \"-1m\"", traducirKeepAlive(-1) === "-1m", traducirKeepAlive(-1));
  comprobar("vacío se queda vacío (no inventa duración)", traducirKeepAlive("") === "");
  comprobar("undefined no revienta", traducirKeepAlive(undefined) === "");
}

// ═══ 2. El punto único de salida cura la preferencia ═══════════
seccion("2) aplicarPreferenciaMotor: el dial «Siempre» ya no produce \"-1\"");
{
  resetearPreferenciaMotor();
  fijarPreferenciaMotor({ keepAlive: "-1" });
  const r = aplicarPreferenciaMotor(4096, "3m", false, 16);
  comprobar("★ devuelve \"-1m\", no \"-1\"", r.keepAlive === "-1m", r.keepAlive);
  comprobar("el cambio se declara (no recorta en silencio)", r.cambio === true);
  comprobar("el motivo nombra el dial", r.motivo.includes("-1m"), r.motivo);
  const otro = aplicarPreferenciaMotor(4096, "3m", false, 16);
  comprobar("es idempotente (segunda pasada igual)", otro.keepAlive === "-1m", otro.keepAlive);
}

// ═══ 3. Sin dial, manda la escalera MR y no se toca ════════════
seccion("3) Sin dial: la escalera MR manda y no se reescribe");
{
  resetearPreferenciaMotor();
  const r = aplicarPreferenciaMotor(4096, "3m", false, 16);
  comprobar("escalera \"3m\" pasa tal cual", r.keepAlive === "3m", r.keepAlive);
  comprobar("sin dial, cambio = false (nada que anunciar)", r.cambio === false);
  for (const kg of [4, 8, 16, 32]) {
    for (const [params, remote] of [[0.27, false], [1.3, false], [4, false], [8, false], [32, false], [120, true]] as Array<[number, boolean]>) {
      const v = keepAliveBajoConsumo(params, remote, kg);
      comprobar(`escalera ${params}B/${kg}GB → tiene unidad`, /^(-?\d+(\.\d+)?[smh]|\d+|0)$/.test(v) && !/^-1$/.test(v), `"${v}"`);
    }
  }
}

// ═══ 4. El perfil del modelo real que falló ════════════════════
seccion("4) Perfil real de llama3.2:1b con el dial en «Siempre»");
{
  resetearPreferenciaMotor();
  fijarPreferenciaMotor({ keepAlive: "-1" });
  const p = getModelProfile("llama3.2:1b", 16);
  comprobar("★ el perfil que viaja a /api/chat dice \"-1m\"", p.keepAlive === "-1m", p.keepAlive);
  comprobar("la escalera queda registrada aparte (para el parte honesto)", p.keepAliveEscalera === "5m", String(p.keepAliveEscalera));
  comprobar("num_ctx sigue siendo del tier, no se contamina", typeof p.numCtx === "number" && p.numCtx >= 2048, String(p.numCtx));
  resetearPreferenciaMotor();
  const limpio = getModelProfile("llama3.2:1b", 16);
  comprobar("sin dial vuelve a 5m (1.3B ≤ 1.7B, v1.0.19)", limpio.keepAlive === "5m", limpio.keepAlive);
  // Un valor raro guardado a mano no debe llegar jamás a la red sin unidad.
  fijarPreferenciaMotor({ keepAlive: "-1" });
  const q = getModelProfile("qwen3.5:4b", 8);
  comprobar("modelo 4B en 8 GB también sale con unidad", !/^-1$/.test(q.keepAlive), q.keepAlive);
  resetearPreferenciaMotor();
}

// ═══ 5. Caso de regresión del mensaje del IDE ══════════════════
seccion("5) El texto que veía el usuario ya no describe un fallo real");
{
  const mensajeVeijo = 'HTTP 400: time: missing unit in duration "-1"';
  resetearPreferenciaMotor();
  fijarPreferenciaMotor({ keepAlive: "-1" });
  const enviado = getModelProfile("llama3.2:1b", 16).keepAlive;
  const volveriaAFallar = /^-1$/.test(enviado) || mensajeVeijo.includes(`"${enviado}"`);
  comprobar("★ con el arreglo, el cuerpo enviado NO dispara ese 400", !volveriaAFallar, enviado);
  resetearPreferenciaMotor();
}

// ═══ Resumen ═══════════════════════════════════════════
console.log(`\n═══ ${correctas} correctas, ${fallos.length} fallos ═══`);
if (fallos.length) { for (const f of fallos) console.log(`  ✗ ${f}`); process.exit(1); }
console.log("TODO VERDE ✓");

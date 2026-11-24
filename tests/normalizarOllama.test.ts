/**
 * tests/normalizarOllama.test.ts — v1.0.15
 * ========================================
 * Cada caso sale del LOG_OLLAMA real de Mario (2026-11-10):
 *   · «System message must be at the beginning» → consolidarSystemAlInicio
 *   · «request (16547 tokens) exceeds the available context size (8192)»
 *     → recortarMensajesAVentana
 * Correr: npx tsx tests/normalizarOllama.test.ts
 */
import {
  consolidarSystemAlInicio,
  recortarMensajesAVentana,
  tokensAprox,
  ventanaParaCaber,
} from "../server/normalizarOllama";

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = "") {
  if (condicion) { correctas++; console.log(`  ✓ ${titulo}`); }
  else { fallos.push(`${titulo}${detalle ? ` :: ${detalle}` : ""}`); console.log(`  ✗ ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

// ═══ 1. consolidarSystemAlInicio ════════════════════════════════
seccion("1) El system va PRIMERO y uno solo (plantilla qwen3.5)");
{
  // Reproduce lo que arma cuerpoBucleAgente: user/assistant y LUEGO systems.
  const entrada = [
    { role: "user", content: "holá" },
    { role: "assistant", content: "ok" },
    { role: "system", content: "nota de continuidad" },
    { role: "system", content: "orden de obra" },
    { role: "user", content: "seguí" },
  ];
  const out = consolidarSystemAlInicio(entrada);
  comprobar("★ el primer mensaje es system", out[0].role === "system", out[0].role);
  comprobar("★ queda UN solo system en todo el array", out.filter((m) => m.role === "system").length === 1);
  comprobar("funde el texto de los dos systems",
    typeof out[0].content === "string" && out[0].content.includes("continuidad") && out[0].content.includes("orden de obra"));
  comprobar("conserva user/assistant en su orden",
    out[1].role === "user" && out[2].role === "assistant" && out[3].role === "user");
  comprobar("no hay system después de un no-system",
    out.findIndex((m) => m.role === "system") === 0);

  // No muta la entrada.
  comprobar("no muta el array de entrada", entrada[0].role === "user" && entrada.length === 5);

  // Sin system: devuelve tal cual.
  const soloUser = [{ role: "user", content: "x" }];
  comprobar("sin system, no cambia nada", consolidarSystemAlInicio(soloUser) === soloUser);
}

// ═══ 2. recortarMensajesAVentana ══════════════════════════════
seccion("2) El prompt cabe en num_ctx (evita el 500 por contexto)");
{
  const grande = "x".repeat(12000); // ≈ 3000 tokens cada uno
  const entrada = [
    { role: "system", content: "manual " + grande },
    { role: "user", content: "viejo 1 " + grande },
    { role: "assistant", content: "viejo 2 " + grande },
    { role: "user", content: "viejo 3 " + grande },
    { role: "user", content: "pedido actual" },
  ];
  const tokensEntrada = entrada.reduce((s, m) => s + tokensAprox(m.content) + 4, 0);
  comprobar("el caso de prueba SÍ desborda 8192", tokensEntrada > 8192, String(tokensEntrada));

  const out = recortarMensajesAVentana(entrada, 8192, 512);
  const tokensSalida = out.reduce((s, m) => s + tokensAprox(typeof m.content === "string" ? m.content : "") + 4, 0);
  comprobar("★ la salida cabe en 8192 - 512", tokensSalida <= 8192 - 512, String(tokensSalida));
  comprobar("★ conserva el system al frente", out[0].role === "system");
  comprobar("★ conserva el último pedido del usuario",
    out[out.length - 1].content === "pedido actual");
  comprobar("tiró mensajes del medio", out.length < entrada.length, `${out.length} de ${entrada.length}`);

  // Lo que ya cabe no se toca.
  const chico = [
    { role: "system", content: "corto" },
    { role: "user", content: "hola" },
  ];
  comprobar("lo que ya cabe no se recorta", recortarMensajesAVentana(chico, 8192, 512) === chico);
}

// ═══ 3. Juntos: como se usa en server.ts ═════════════════════════
seccion("3) Cadena real: consolidar → recortar");
{
  const grande = "y".repeat(12000);
  const bruto = [
    { role: "user", content: "viejo " + grande },
    { role: "assistant", content: "resp " + grande },
    { role: "system", content: "manual " + grande },
    { role: "system", content: "orden de obra" },
    { role: "user", content: "pedido final" },
  ];
  const out = recortarMensajesAVentana(consolidarSystemAlInicio(bruto), 8192, 512);
  comprobar("system primero y único tras la cadena",
    out[0].role === "system" && out.filter((m) => m.role === "system").length === 1);
  comprobar("cabe en la ventana",
    out.reduce((s, m) => s + tokensAprox(typeof m.content === "string" ? m.content : "") + 4, 0) <= 8192 - 512);
  comprobar("el último sigue siendo el pedido final", out[out.length - 1].content === "pedido final");
}

// ═══ 4. ventanaParaCaber (v1.0.16: la ventana CRECE antes de amputar) ════
seccion("4) En 16 GB la ventana crece para que el prompt entre entero");
{
  // Reproduce a Mario: prompt de 16547 tok, dial num_ctx=8192, techo de RAM=36864.
  const grande = "x".repeat(16547 * 4 - 400); // ≈ 16547 tokens en un solo system
  const prompt = [
    { role: "system", content: grande },
    { role: "user", content: "seguí" },
  ];
  const base = 8192, resv = 512, topeRam = 36864;
  const v = ventanaParaCaber(prompt, base, resv, topeRam);
  comprobar("★ la ventana sube por encima del 8192 del dial", v > base, String(v));
  comprobar("★ la ventana basta para el prompt + reserva", v >= 16547 + resv, String(v));
  comprobar("redondea a múltiplo de 1024", v % 1024 === 0, String(v));
  comprobar("nunca pasa del techo de RAM", v <= topeRam, String(v));

  const chico = [
    { role: "system", content: "corto" },
    { role: "user", content: "hola" },
  ];
  comprobar("lo que ya cabe deja el num_ctx base", ventanaParaCaber(chico, 8192, 512, 36864) === 8192);
  comprobar("sin techo, jamás sube del base", ventanaParaCaber(prompt, 8192, 512) === 8192);
  const topeBajo = 10240;
  comprobar("el techo de RAM acota la subida", ventanaParaCaber(prompt, 8192, 512, topeBajo) === topeBajo, String(ventanaParaCaber(prompt, 8192, 512, topeBajo)));
}

// ═══ 5. Cadena v1.0.16: crecer la ventana y DESPUÉS recortar ════
seccion("5) Crecer la ventana salva el manual que antes se amputaba");
{
  const manual = "M".repeat(16547 * 4 - 400); // el manual del agente, ~16547 tok
  const prompt = [
    { role: "system", content: manual },
    { role: "user", content: "pedido" },
  ];
  const amputado = recortarMensajesAVentana(consolidarSystemAlInicio(prompt), 8192, 512);
  comprobar("con 8192 el manual se trunca (daño viejo)",
    typeof amputado[0].content === "string" && amputado[0].content.length < manual.length);
  const v = ventanaParaCaber(consolidarSystemAlInicio(prompt), 8192, 512, 36864);
  const salvado = recortarMensajesAVentana(consolidarSystemAlInicio(prompt), v, 512);
  comprobar("★ con la ventana crecida el manual queda ENTERO",
    typeof salvado[0].content === "string" && salvado[0].content.length === manual.length, String(v));
}

// ═══ Resumen ═══════════════════════════════════════════
console.log(`\n═══ ${correctas} correctas, ${fallos.length} fallos ═══`);
if (fallos.length) { for (const f of fallos) console.log(`  ✗ ${f}`); process.exit(1); }
console.log("TODO VERDE ✓");

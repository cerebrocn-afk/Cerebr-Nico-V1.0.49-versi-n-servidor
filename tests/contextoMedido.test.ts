/**
 * contextoMedido.test.ts · FASE 9 — suite de la telemetría de contexto.
 *
 * Qué se prueba (y por qué cada cosa importa):
 *   1. INVARIANTE ARITMÉTICO — sistema + herramientas + mensajes === total,
 *      sin tolerancia. Es la única forma de que el desglose no mienta.
 *   2. REPARTO HONESTO — un prompt con muchos mensajes da mensajes >> sistema.
 *   3. VACÍO SIN EXCEPCIÓN — prompt vacío devuelve ceros, no `NaN`.
 *   4. UMBRALES EXACTOS — disparan en el token declarado, no en uno aproximado.
 *   5. PROCEDENCIA — sin uso del proveedor es `estimado`; con uso es `medido`.
 *   6. LATENCIA — TTFT separado de decode; sin datos queda `null`, no cero.
 *
 * Ejecutable con: node --test dist-ts/contextoMedido.test.js, o incluida en
 * `npm run validar` (patrón de la casa: mismo runner que el resto).
 */
import { CARACTERES_POR_TOKEN_ESTIMADO, UMBRAL_AVISO, UMBRAL_FORZAR_COMPACTAR, UMBRAL_SUGERIR_COMPACTAR, VENTANA_TOKENS_DEFECTO, calcularPresion, desglosarContexto, familiaDeCapa, lineaDeLatencia, medirHuellaContexto, medirLatencia, nivelDePresion, segundos, tokensDesdeCaracteres, } from "../src/engine/contextoMedido.js";
let pasadas = 0;
let fallidas = 0;
function comprobar(nombre, condicion, detalle) {
    if (condicion) {
        pasadas++;
        return;
    }
    fallidas++;
    console.error(`  ✗ ${nombre}${detalle ? ` → ${detalle}` : ""}`);
}
function igual(nombre, real, esperado) {
    comprobar(nombre, real === esperado, `esperado ${JSON.stringify(esperado)}, recibido ${JSON.stringify(real)}`);
}
/** Capa mínima con la forma que produce `ensamblarContexto`. */
function capa(nivel, etiqueta, texto) {
    return { nivel, etiqueta, texto };
}
console.log("FASE 9 · contextoMedido");
// --- 1 · Invariante aritmético ------------------------------------------------
{
    const capas = [
        capa(0, "L0 · OBJETIVO", "a".repeat(100)),
        capa(1, "L1 · ARCHIVOS AFECTADOS", "b".repeat(250)),
        capa(2, "L2 · DEPENDENCIAS E IMPACTO", "c".repeat(50)),
        capa(3, "L3 · ARQUITECTURA", "d".repeat(30)),
        capa(4, "L4 · MEMORIA", "e".repeat(400)),
        capa(5, "L5 · CONOCIMIENTO GENERAL", "f".repeat(20)),
    ];
    const suma = 100 + 250 + 50 + 30 + 400 + 20;
    const d = desglosarContexto({ ensamblado: { capas, caracteres: suma } });
    igual("desglose: total es la suma de partes", d.sistema + d.herramientas + d.mensajes, d.total);
    igual("desglose: total coincide con lo escrito", d.total, suma);
    igual("desglose: procedencia medido cuando cuadra", d.procedencia, "medido");
    igual("desglose: una entrada por capa", d.porCapa.length, 6);
}
// --- 2 · Reparto honesto: mensajes dominan el historial ----------------------
{
    const mensajesLargos = Array.from({ length: 100 }, () => "x".repeat(20)).join("");
    const capas = [
        capa(0, "L0 · OBJETIVO", "tarea corta"),
        capa(3, "L3 · ARQUITECTURA", "modelo del proyecto breve"),
        capa(4, "L4 · MEMORIA", mensajesLargos),
    ];
    const d = desglosarContexto({ ensamblado: { capas } });
    comprobar("reparto: mensajes >> sistema", d.mensajes > d.sistema * 5, `mensajes=${d.mensajes} sistema=${d.sistema}`);
    igual("reparto: invariante se mantiene", d.sistema + d.herramientas + d.mensajes, d.total);
}
// --- 3 · Vacío sin excepción -------------------------------------------------
{
    const d = desglosarContexto({ ensamblado: { capas: [] } });
    igual("vacío: total 0", d.total, 0);
    igual("vacío: sistema 0", d.sistema, 0);
    comprobar("vacío: sin NaN", Number.isFinite(d.total) && Number.isFinite(d.sistema));
    const rotas = desglosarContexto({ ensamblado: { capas: [{ nivel: 0, etiqueta: "L0", texto: undefined }] } });
    igual("vacío/roto: total 0 sin excepción", rotas.total, 0);
}
// --- 4 · Umbrales exactos ----------------------------------------------------
{
    const ventana = 1000;
    // Justo por debajo del aviso (44,9 %): holgado.
    igual("umbral: 44,9 % → holgado", calcularPresion({ tokens: 449, ventana }).nivel, "holgado");
    // Exactamente en el aviso (45 %).
    igual("umbral: 45 % exacto → aviso", calcularPresion({ tokens: 450, ventana }).nivel, "aviso");
    comprobar("umbral: aviso 45 % tiene frase", calcularPresion({ tokens: 450, ventana }).aviso.length > 0);
    // Exactamente en sugerir compactar (65 %).
    igual("umbral: 65 % exacto → sugerir_compactar", calcularPresion({ tokens: 650, ventana }).nivel, "sugerir_compactar");
    // Exactamente en forzar (80 %).
    igual("umbral: 80 % exacto → forzar_compactar", calcularPresion({ tokens: 800, ventana }).nivel, "forzar_compactar");
    comprobar("umbral: forzar dice OBLIGATORIO", /OBLIGATORIO/.test(calcularPresion({ tokens: 800, ventana }).aviso));
    // Las constantes son las publicadas, no otras.
    igual("constantes: aviso 0.45", UMBRAL_AVISO, 0.45);
    igual("constantes: sugerir 0.65", UMBRAL_SUGERIR_COMPACTAR, 0.65);
    igual("constantes: forzar 0.80", UMBRAL_FORZAR_COMPACTAR, 0.8);
    igual("constantes: ventana 128k", VENTANA_TOKENS_DEFECTO, 128000);
    igual("constantes: 4 caracteres por token", CARACTERES_POR_TOKEN_ESTIMADO, 4);
    // Fronteras de la función pura.
    igual("nivel: 0 → holgado", nivelDePresion(0), "holgado");
    igual("nivel: 1 → forzar", nivelDePresion(1), "forzar_compactar");
    igual("nivel: NaN → forzar (conservador)", nivelDePresion(Number.NaN), "forzar_compactar");
}
// --- 5 · Procedencia: estimado vs medido -------------------------------------
{
    const capas = [capa(0, "L0 · OBJETIVO", "y".repeat(400))];
    const estimada = medirHuellaContexto({ ensamblado: { capas }, ventana: 1000 });
    igual("huella: sin uso del proveedor → estimado", estimada.presion.procedencia, "estimado");
    comprobar("huella: la línea avisa que es estimado", /\[estimado\]/.test(estimada.linea) || estimada.presion.aviso === "");
    const medida = medirHuellaContexto({ ensamblado: { capas }, ventana: 1000, tokensMedidos: 900 });
    igual("huella: con uso del proveedor → medido", medida.presion.procedencia, "medido");
    igual("huella: el número del proveedor manda", medida.presion.tokens, 900);
    comprobar("huella: token medido no se sobrescribe con la estimación", medida.presion.tokens !== tokensDesdeCaracteres(400));
    // VENTANA ausente → usa la constante, no cero.
    const sinVentana = calcularPresion({ tokens: 1000 });
    igual("huella: sin ventana usa 128k", sinVentana.ventana, VENTANA_TOKENS_DEFECTO);
    // Discrepancia declarada: si las partes no cuadran con lo declarado, estimado.
    const incoherente = desglosarContexto({ ensamblado: { capas, caracteres: 9999 } });
    igual("huella: discrepancia → estimado", incoherente.procedencia, "estimado");
    igual("huella: discrepancia no rompe el invariante", incoherente.sistema + incoherente.herramientas + incoherente.mensajes, incoherente.total);
    // Estimador: redondeo hacia arriba y cero seguro.
    igual("estimador: 0 caracteres → 0 tokens", tokensDesdeCaracteres(0), 0);
    igual("estimador: 5 caracteres → 2 tokens", tokensDesdeCaracteres(5), 2);
    igual("estimador: negativo → 0", tokensDesdeCaracteres(-100), 0);
}
// --- 6 · Latencia desdoblada -------------------------------------------------
{
    const lat = medirLatencia({ ttftMs: 4200, totalMs: 22200, pasos: 3, proveedor: "mistral" });
    igual("latencia: ttft separado", lat.ttftMs, 4200);
    igual("latencia: decode = total - ttft", lat.decodeMs, 18000);
    comprobar("latencia: la línea nombra TTFT y decode", /TTFT/.test(lineaDeLatencia(lat)) && /decode/.test(lineaDeLatencia(lat)));
    comprobar("latencia: la línea nombra el proveedor", /mistral/.test(lineaDeLatencia(lat)));
    const sinTtft = medirLatencia({ totalMs: 5000, pasos: 1 });
    igual("latencia: sin ttft queda null (no cero)", sinTtft.ttftMs, null);
    igual("latencia: sin ttft no se inventa decode", sinTtft.decodeMs, null);
    const incoherente = medirLatencia({ ttftMs: 9000, totalMs: 3000 });
    igual("latencia: total < ttft → decode null", incoherente.decodeMs, null);
    const vacia = medirLatencia({});
    igual("latencia: vacía no rompe", vacia.pasos, 0);
    igual("segundos: null → —", segundos(null), "—");
    igual("segundos: 4200 ms → 4,2 s", segundos(4200), "4,2 s");
    comprobar("latencias: el pie para 1 paso es singular", /1 paso\b/.test(lineaDeLatencia(medirLatencia({ pasos: 1 }))));
    comprobar("latencias: 2 pasos es plural", /2 pasos\b/.test(lineaDeLatencia(medirLatencia({ pasos: 2 }))));
}
// --- 7 · Familia de capa: el clasificador nunca lanza -----------------------
{
    igual("familia: L2 → sistema", familiaDeCapa(capa(2, "L2 · DEPENDENCIAS E IMPACTO", "")), "sistema");
    igual("familia: L3 → sistema", familiaDeCapa(capa(3, "L3 · ARQUITECTURA", "")), "sistema");
    igual("familia: L5 → herramientas", familiaDeCapa(capa(5, "L5 · CONOCIMIENTO GENERAL", "")), "herramientas");
    igual("familia: L0 → mensajes", familiaDeCapa(capa(0, "L0 · OBJETIVO", "")), "mensajes");
    igual("familia: L1 → mensajes", familiaDeCapa(capa(1, "L1 · ARCHIVOS AFECTADOS", "")), "mensajes");
    igual("familia: L4 → mensajes", familiaDeCapa(capa(4, "L4 · MEMORIA", "")), "mensajes");
    igual("familia: etiqueta desconocida cae en mensajes", familiaDeCapa({ nivel: 9, etiqueta: "OTRA COSA" }), "mensajes");
}
// --- Cierre ------------------------------------------------------------------
console.log(`\n${pasadas} comprobaciones OK · ${fallidas} fallidas`);
if (fallidas > 0) {
    process.exitCode = 1;
}

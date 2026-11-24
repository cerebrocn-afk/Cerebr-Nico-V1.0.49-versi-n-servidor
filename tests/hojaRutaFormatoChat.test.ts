/**
 * hojaRutaFormatoChat.test.ts — v2.3.26 · LA HOJA DE RUTA TIENE TRES COSAS
 * ============================================================================
 * Historia de esta suite, para no repetir el error:
 *
 *   v2.0.1 blindaba el pedido del 1/11 («la barra con el formato del chat»):
 *   burbujas del chat, solo español, los CINCO grupos con nombre y peso
 *   (Código / Avisos / Descripciones / Datos / Entregables) y descarga por
 *   archivo. Ese formato se cumplió.
 *
 *   v2.3.26 — Mario, con la hoja en capturas delante: «Código 48 · 283 KB /
 *   Avisos 2 · 11 KB / Descripciones 6514 · 41,8 MB / Datos 5 · 1,4 MB /
 *   Entregables 1 · 540 KB → TODO ESO QUITARLO. La hoja está llena de cosas
 *   innecesarias. QUÉ DEJAR: 1) la reconexión de puertos, 2) los pasos de la
 *   tarea del agente, 3) el entregable final. NADA MÁS EN LA HOJA DE RUTA.»
 *
 * O sea: el pedido del 1/11 quedó SUPERSEDIDO en la cara. El inventario sigue
 * existiendo en el motor (`agruparEntregables`, `zip-info` con sus cinco grupos)
 * y se ve en el PANEL COMPLETO; lo que ya no aparece es en la hoja. Esta suite
 * comprueba las dos mitades: que la hoja quedó en tres bloques, y que no se
 * borró ni una capacidad del motor para lograrlo.
 *
 * Como todas las de la casa: lee archivos y comprueba cables. No levanta
 * servidor, no toca la red, no inventa números.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(HERE, "..");
const leer = (p: string) => readFileSync(path.join(BACKEND, p), "utf-8");

let correctas = 0;
const fallidas: string[] = [];
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✓ ${nombre}`); }
  else { fallidas.push(nombre); console.log(`  ✗ ${nombre} ${detalle ? `→ ${detalle}` : ""}`); }
}

console.log("\n═══ HOJA DE RUTA: TRES COSAS (v2.3.26) ═══");

const panel = leer("src/components/PlanificationPanel.tsx");
const viva = leer("src/components/HojaDeRutaViva.tsx");
const hoja = leer("src/engine/hojaDeRuta.ts");
const motor = leer("src/engine/entregable.ts");
const servidor = leer("server/sandboxEntregable.ts");

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const panelLimpio = sinComentarios(panel);
const vivaLimpia = sinComentarios(viva);

// ── 1) TRES BLOQUES, EN ESE ORDEN Y NADA MÁS ───────────────────────────────
console.log("\n1) tres bloques, en el orden pedido");
comprobar("el motor declara las tres secciones en orden: reconexión → paso → entregable",
  /SECCIONES_DE_LA_HOJA[^=]*=\s*\[\s*"reconexion"\s*,\s*"paso"\s*,\s*"entregable"\s*\]/.test(hoja));
comprobar("la cara monta HojaDeRutaViva (una sola fuente de composición)",
  /import\s*\{\s*HojaDeRutaViva\s*\}/.test(panel) && /<HojaDeRutaViva/.test(panel));
const posRecon = vivaLimpia.indexOf("Reconexión de puertos");
const posPaso = vivaLimpia.indexOf("Pasos de la tarea");
const posEnt = vivaLimpia.indexOf("Entregable final");
comprobar("los tres rótulos existen en la cara", posRecon > 0 && posPaso > 0 && posEnt > 0);
comprobar("y aparecen en ese orden (reconexión · pasos · entregable)",
  posRecon < posPaso && posPaso < posEnt, `${posRecon}/${posPaso}/${posEnt}`);

// ── 2) LO QUE SALIÓ DE LA CARA (y sigue vivo en el motor) ──────────────────
console.log("\n2) el inventario salió de la hoja");
for (const titulo of ["Código", "Avisos", "Descripciones", "Datos", "Entregables"]) {
  comprobar(`el grupo «${titulo}» ya NO se pinta en la hoja`, !vivaLimpia.includes(`"${titulo}"`));
}
comprobar("la hoja no llama a agruparEntregables ni pinta los cinco baldes",
  !/agruparEntregables/.test(panelLimpio) && !/agruparEntregables/.test(vivaLimpia));
comprobar("la hoja no pinta el repartidor (hilos / pesadas / ligeras)",
  !/hilos/.test(vivaLimpia) && !/pesadas/.test(vivaLimpia) && !/ligeras/.test(vivaLimpia));
// v1.0.27 · la regla no se afloja, se hace precisa. Lo que Mario quitó de la
// hoja es la TABLA de interruptores (los botones de encender/apagar y su
// rótulo): eso sigue prohibido. Lo que se admite ahora es LEER la posición que
// llega en cada línea para no pintar «está abajo» un puerto que el usuario
// apagó a mano — que era justamente el defecto del 17/11
// («indicador de servicios apagados»). Cero botones, cero rótulo de tabla.
comprobar("la hoja no pinta la tabla de interruptores (ni encender ni apagar)",
  !/encender|apagar/i.test(vivaLimpia) && !/Interruptores/i.test(vivaLimpia) &&
  !/onClick=\{\{?[^}]*[Ss]ervicio/.test(vivaLimpia));
comprobar("★ pero sí lee la posición de cada línea para no llamar «caído» a lo apagado a mano",
  /p\.interruptor !== "apagado"/.test(vivaLimpia) && /apagados a mano/.test(vivaLimpia));
comprobar("la hoja no pinta las acciones de la PC con sus tandas de ✓",
  !/actionLog|accionesFueradeLaHoja\b[^=]/.test(vivaLimpia) && !/Acciones en la PC/.test(vivaLimpia));
comprobar("la hoja no pinta planes viejos ni barra de progreso por plan",
  !/planes viejos|anteriores/i.test(vivaLimpia));
comprobar("la hoja no ofrece descarga por archivo suelto (un solo entregable final)",
  !/zip\?archivo=/.test(vivaLimpia) && vivaLimpia.includes("/api/sandbox/zip"));

// ── 3) NO SE BORRÓ CAPACIDAD DEL MOTOR ────────────────────────────────────
console.log("\n3) el motor quedó intacto");
comprobar("clasificarArchivo() sigue clasificando en los cinco grupos",
  /export function clasificarArchivo/.test(motor));
comprobar("agruparEntregables() sigue armando los grupos con nombre + bytes + peso",
  /export function agruparEntregables/.test(motor) && /bytes:/.test(motor) && /peso:/.test(motor));
comprobar("pesoLegible() sigue formateando en español", /export function pesoLegible/.test(motor));
comprobar("zip-info sigue mandando los grupos al panel completo",
  /grupos:/.test(servidor) && /peso: pesoLegible/.test(servidor));
comprobar("la descarga por archivo suelto sigue atendida en el servidor",
  /req\.query\.archivo/.test(servidor));
comprobar("sin aduana no hay lista: la autorización sigue siendo lo primero",
  /if \(!ctx\.autorizado\(req\)\)/.test(servidor));

// ── 4) LA RECONEXIÓN DE PUERTOS ───────────────────────────────────────────
console.log("\n4) reconexión de puertos");
comprobar("la hoja consume la reconexión que ya existe (no duplica el gesto)",
  /onReconnectAll/.test(panel) && /onReconnectAll/.test(viva));
comprobar("el botón «Reconectar» sólo aparece si hay puertos abajo",
  /caidos\.length > 0 && onReconnectAll/.test(vivaLimpia));
comprobar("cada puerto abajo dice qué se pierde", /sePierde/.test(viva) && /Se pierde:/.test(viva));
comprobar("un puerto arriba no se anuncia (la hoja dice una sola línea en verde)",
  /Todos los puertos contestan/.test(viva));
comprobar("los seis puertos de la casa están declarados con su para y su sePierde",
  ["3000", "3500", "5000", "5100", "5102", "11434"].every((p) => panel.includes(`puerto: ${p}`)));
comprobar("reconexionDePuertos() vive en el motor puro", /export function reconexionDePuertos/.test(hoja));

// ── 5) LOS PASOS DE LA TAREA ──────────────────────────────────────────────
console.log("\n5) pasos de la tarea del agente");
comprobar("los pasos salen del plan VIVO, desde el primero", /export function pasosDeLaTarea/.test(hoja));
comprobar("hay cuatro clases de paso (hecho, en curso, roto, pendiente)",
  /"hecho" \| "en-curso" \| "roto" \| "pendiente"/.test(hoja));
comprobar("las marcas son ✓ ▶ ✗ · (una por clase)",
  /hecho: "✓"/.test(hoja) && /"en-curso": "▶"/.test(hoja) && /roto: "✗"/.test(hoja) && /pendiente: "·"/.test(hoja));
comprobar("una tarea en espera muestra su motivo, no una caja negra",
  /motivoEspera/.test(hoja) && /motivo/.test(hoja));
comprobar("sin plan hubo texto honesto en lugar de una lista vacía",
  /Sin tarea en marcha/.test(viva));

// ── 6) EL ENTREGABLE FINAL ────────────────────────────────────────────────
console.log("\n6) entregable final");
comprobar("entregableFinal() sólo entrega cuando la obra cerró",
  /export function entregableFinal/.test(hoja) && /obraCerrada/.test(hoja));
comprobar("a medias se dice «todavía no hay entregable final»",
  /todavía no hay entregable final/.test(hoja));
comprobar("el botón de descarga exige nombre, obra cerrada y listo",
  /obraCerrada && entregable\.listo/.test(vivaLimpia));
comprobar("la descarga lleva el nombre real en el atributo download",
  /download=\{entregable\.nombre\}/.test(viva));

// ── 7) SOLO ESPAÑOL EN LA CARA ────────────────────────────────────────────
console.log("\n7) solo español");
comprobar("ningún rótulo en inglés en la hoja (Sandbox / workers / cpu · io)",
  !/\bSandbox\b/.test(vivaLimpia) && !/workers"/.test(vivaLimpia) && !/\bok · ver/.test(vivaLimpia));
comprobar("ningún texto de JSX arranca con backtick (literal sin evaluar)",
  !/>\s*`/.test(vivaLimpia));
comprobar("ningún escape \\u00b7 suelto en el texto", !/["'`][^"'`]*\\u00b7/.test(viva));

// ── 8) CABLES HEREDADOS ───────────────────────────────────────────────────
console.log("\n8) cables heredados");
comprobar("sigue preguntando a la MISMA API del panel completo", panel.includes("/api/brain/plans"));
comprobar("sigue publicando el gutter para no tapar el chat", panel.includes('--cn-tareas-gutter"'));
comprobar("el ancho sale de una sola cifra", /const ANCHOSTO_PANEL = \d+;/.test(panel));
comprobar("el early-return de `oculto` va DESPUÉS de los hooks (no rompe el orden)",
  panel.indexOf("if (oculto) return null;") > panel.lastIndexOf("useEffect("));
comprobar("esta suite entra en npm run validar", leer("scripts/validar.mjs").includes("hojaRutaFormatoChat.test.ts"));

console.log(`\n${fallidas.length === 0 ? "VEREDICTO: TODO CORRECTO" : "VEREDICTO: HAY FALLAS"}`);
console.log(`${correctas} correctas · ${fallidas.length} fallidas`);
if (fallidas.length) process.exitCode = 1;

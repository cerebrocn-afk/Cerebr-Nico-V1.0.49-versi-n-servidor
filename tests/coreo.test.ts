/**
 * coreo.test.ts — COREO v1: el clasificador, el anillo y la hoja de movimiento
 * =============================================================================
 * Cada muestra de detalle es una línea de aviso REAL salida de
 * planExecutors/pluginForja/aduana (las copié del código, no del aire):
 * si mañana la narración cambia de forma, este test lo denuncia.
 */
import { ACCIONES, notificar, clasificarAviso, narrarDesdeAviso, accionDesdeTarea, coreoEstado, hojaCoreoCss } from "../src/engine/coreo";
import {
  CADUCIA_LATIDO,
  INTERVALO_LATIDO_MS,
  PLAZO_LATIDO_MS,
  PUERTO_IDE,
  RUTA_LATIDO,
  clasificarFalloLatido,
  consejoFalloDeRed,
  etiquetaPuertoLocal,
  estadoLatido,
  latidoConocido,
  PATRON_FALLO_DE_RED,
  registrarLatido,
  suscribirLatido,
  textoCabecera,
} from "../src/engine/latido";
import { PORTS } from "../src/constants";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };

// ── 1 · vocabulario: toda acción tiene icono, verbo, color y movimiento válido
const ANIMS = ["latido", "orbita", "escaneo", "tecleo", "chispa", "sacudida", "brillo", "quieto"];
for (const a of Object.values(ACCIONES)) {
  comprobar(`acción ${a.id}: coreografiada completa`, !!a.verbo && !!a.icono && /^#[0-9a-f]{3,8}$/i.test(a.color) && ANIMS.includes(a.anim), JSON.stringify(a));
}
comprobar("el gerundio manda: todo verbo en español", Object.values(ACCIONES).every((a) => /[a-záéíóúñ]/i.test(a.verbo)));

// ── 2 · el bus: validar antes de bailar ────────────────────────────────────
const mala = notificar("bailar-salsa");
comprobar("acción inexistente → motivo con las conocidas", !mala.ok && /conocidas:/.test(mala.motivos.join(" ")), JSON.stringify(mala));
notificar("pensar", "llamando a llama-3.2");
comprobar("notificar ok sube el anillo", coreoEstado().actual?.accion === "pensar" && coreoEstado().emitidos >= 1);
for (let i = 0; i < 20; i++) notificar("escribir", "línea " + i);
const est = coreoEstado();
comprobar("anillo acotado a 14 (ocho viajan al cliente)", est.anillo.length === 8 && est.actual?.accion === "escribir" && /línea 19/.test(est.actual.detalle));
comprobar("orden newest-first con n creciente", est.anillo.every((e, i, arr) => i === 0 || arr[i - 1].n > e.n));

// ── 3 · el clasificador, con líneas LITERALES del código real ─────────────
const MUESTRAS: Array<[string, string]> = [
  ["#2 → modelo llama-3.2:1b: escribe index.html con el contexto del pliego", "pensar"],
  ["No se pudo guardar la conversión de #3 (sin permiso); el texto convertido se pierde, el informe no.", "bloqueado"],
  ["#4 pidió guardar en «ok.png» pero este contexto no tiene escritura binaria; la imagen queda en la URL, no en el proyecto.", "bloqueado"],
  ["#3 imagen revelada y se guardó como «banner.png» — la extensión se corrigió al formato real de los bytes", "escribir"],
  ["se guardó como «README.md»", "escribir"],
  ["convirtiendo notas.txt a markdown", "convertir"],
  ["generar_imagen de la portada lista", "imagen"],
  ["reflejo · espejo.matematicos · confianza 100%", "espejo"],
  ["entidad espejo.planificadores devolvió lotes", "espejo"],
  ["[plan p-77] el gobernador fijó presupuesto io≤16 cpu≤3", "planificar"],
  ["forjado e instalado cn.palabras: pestaña, slash y 1 herramienta", "forjar"],
  ["aduana: manifiesto ENTREGA/MANIFIESTO_SHA256.txt firmado", "entregar"],
  ["crítico: web limpia → ENTREGABLE", "verificar"],
  ["el usuario dijo hola", "actividad"],
];
for (const [linea, esperada] of MUESTRAS) {
  const c = clasificarAviso(linea);
  comprobar(`clasifica «${linea.slice(0, 36)}…» → ${esperada}`, c.accion === esperada, c.accion);
}
comprobar("el prefijo [plan x] no ensucia el detalle", !clasificarAviso("[plan p-1] reflejo · mate").detalle.startsWith("[plan"));

// ── 4 · narrarDesdeAviso alimenta el bus (la puerta del servidor) ─────────
const antes = coreoEstado().emitidos;
narrarDesdeAviso("#9 → modelo test: coreografía");
comprobar("narrar sube el bus y mantiene la consola", coreoEstado().emitidos === antes + 1 && coreoEstado().actual?.accion === "pensar");

// ── 5 · lectura client-side del estado de tareas ──────────────────────────
comprobar("tarea modelo ejecutando = pensar", accionDesdeTarea("modelo", "ejecutando") === "pensar");
comprobar("tarea reflejo ejecutando = espejo", accionDesdeTarea("reflejo", "ejecutando") === "espejo");
comprobar("cualquier tarea fallida = bloqueado", accionDesdeTarea("convertir", "fallida") === "bloqueado");
comprobar("imagen hecha = imagen", accionDesdeTarea("generar_imagen", "hecha") === "imagen");
comprobar("pendiente no baila", accionDesdeTarea("modelo", "pendiente") === "actividad");

// ── 6 · la hoja de movimiento ─────────────────────────────────────────────
const css = hojaCoreoCss();
const ANIMS_CON_MOVIMIENTO = ANIMS.filter((a) => a !== "quieto"); // «quieto» ES la ausencia de animación: no tiene keyframe ni clase
for (const a of ANIMS_CON_MOVIMIENTO) comprobar(`keyframe cn-${a} existe`, css.includes("@keyframes cn-" + a));
comprobar("todas las clases .cn-anim-* de movimiento declaradas", ANIMS_CON_MOVIMIENTO.every((a) => css.includes(".cn-anim-" + a)));
comprobar("respeta prefers-reduced-motion (quien no quiere movimiento, no lo sufre)", css.includes("prefers-reduced-motion"));
comprobar("chip vivo se diferencia del historial", css.includes(".cn-coreo-live"));

// ── 7 · el estado viaja serializable ──────────────────────────────────────
const json = JSON.parse(JSON.stringify(coreoEstado()));
comprobar("coreoEstado es JSON de ida y vuelta", json.ok === true && Array.isArray(json.anillo) && json.vocabulario.includes("forjar"));

// ── 8 · EL LATIDO: la salud se mide y se nombra bien (v1.86.4) ───────────
//
// El 28/10/2026 la pantalla dijo «el motor no contesta» mientras la cabecera
// decía «motor listo» y el panel «3000 ACTIVO». Dos de las tres eran literales.
// Estos candados existen para que ninguna de las tres pueda volver a mentir.

// 8a · de dónde sale la medida
comprobar("el fonendo es /api/coreo", RUTA_LATIDO === "/api/coreo", RUTA_LATIDO);
comprobar("el puerto del latido viene de PORTS, no copiado a mano", PUERTO_IDE === PORTS.IDE, `${PUERTO_IDE} vs ${PORTS.IDE}`);
comprobar("los 700 ms tienen nombre y valor", INTERVALO_LATIDO_MS === 700);
comprobar("la lectura caduca (2,8 s) para no acumular fetch y ahogar el origen", PLAZO_LATIDO_MS === INTERVALO_LATIDO_MS * CADUCIA_LATIDO && PLAZO_LATIDO_MS === 2800, String(PLAZO_LATIDO_MS));
comprobar("CADUCIA_LATIDO es un multiplicador, no un plazo", CADUCIA_LATIDO === 4);

// 8b · el motivo: se conserva, no se tira
comprobar("un status se dice como HTTP <n>", clasificarFalloLatido({ status: 503 }) === "HTTP 503", clasificarFalloLatido({ status: 503 }));
comprobar("«Failed to fetch» conserva su nombre", /TypeError: Failed to fetch/.test(clasificarFalloLatido(new TypeError("Failed to fetch"))), clasificarFalloLatido(new TypeError("Failed to fetch")));
comprobar("sin datos no se inventa motivo", clasificarFalloLatido(undefined) === "sin respuesta", clasificarFalloLatido(undefined));
comprobar("un error sin mensaje no corta el chip", clasificarFalloLatido(new Error("")) === "sin respuesta");
comprobar("el motivo largo se recorta (la espina mide 290px)", clasificarFalloLatido("x".repeat(400)).length <= 90, String(clasificarFalloLatido("x".repeat(400)).length));

// 8c · el chip dice QUÉ caiu — y no vuelve a decir «el motor»
const caido = estadoLatido({ vivo: false, motivo: "TypeError: Failed to fetch" });
comprobar("la lectura sana no alarma", estadoLatido({ vivo: true }).chip === "" && estadoLatido({ vivo: true }).vivo === true);
comprobar("el chip nombra al servidor local, no al modelo", /SERVIDOR LOCAL/.test(caido.chip) && /:3000/.test(caido.chip) && caido.chip.includes(RUTA_LATIDO), caido.chip);
comprobar("el chip arrastra el motivo medido", caido.chip.includes("TypeError: Failed to fetch"), caido.chip);
comprobar("PROHIBIDO el literal mentiroso de antes", !/el motor no contesta/i.test(caido.chip), caido.chip);
comprobar("la consecuencia descarta la nube", /no es un fallo del modelo/.test(caido.consecuencia) && caido.consecuencia.includes("POST /api/ai/stream") && /NING(?:U|Ú)N proveedor/.test(caido.consecuencia), caido.consecuencia);
comprobar("la consecuencia dice cada cuánto reintenta", caido.consecuencia.includes(`${INTERVALO_LATIDO_MS} ms`), caido.consecuencia);

// 8d · la cabecera: «listo» solo después de un 200
comprobar("midiendo vivo = motor listo", textoCabecera(true, false) === "motor listo");
comprobar("sin medir NUNCA dice listo", !/listo/i.test(textoCabecera(null, false)) && /comprobando/i.test(textoCabecera(null, false)), textoCabecera(null, false));
comprobar("caído no se disfraza de sano", textoCabecera(false, false) !== "motor listo" && /ca[ií]do/i.test(textoCabecera(false, false)), textoCabecera(false, false));
comprobar("streaming manda sobre el estado", textoCabecera(false, true) === "🧠 pensando...", textoCabecera(false, true));

// 8e · el puerto 3000 del panel: tres estados, no uno por decreto
comprobar("puerto 3000 sin medir ≠ ACTIVO", etiquetaPuertoLocal(null) === "SIN MEDIR", etiquetaPuertoLocal(null));
comprobar("puerto 3000 medido vivo = ACTIVO", etiquetaPuertoLocal(true) === "ACTIVO");
comprobar("puerto 3000 caído = SIN RESPUESTA", etiquetaPuertoLocal(false) === "SIN RESPUESTA", etiquetaPuertoLocal(false));

// 8f · el bus: quien llega tarde lee la última medida, y en node no hay window
comprobar("en node suscribir no revienta y devuelve limpieza", typeof suscribirLatido(() => {}) === "function");
comprobar("el latido arranca en «no lo sé»", latidoConocido().vivo === null, JSON.stringify(latidoConocido()));
const difundido = registrarLatido(false, caido.chip);
comprobar("registrar deja constancia con marca de tiempo", latidoConocido().vivo === false && latidoConocido().chip === caido.chip && difundido.ts > 0);

// 8g · el consejo ante un fallo de red NO señala al proveedor
comprobar("«Failed to fetch» es fallo de red del navegador", PATRON_FALLO_DE_RED.test("Error de comunicación con gemini-3.5-flash: Failed to fetch"));
comprobar("«fetch failed» de Node NO es fallo local (es el proveedor)", !PATRON_FALLO_DE_RED.test("❌ Gemini no pudo responder: TypeError: fetch failed"));
comprobar("la recomendación quita la culpa a la clave", /no es la clave del modelo/.test(consejoFalloDeRed()), consejoFalloDeRed().slice(0, 60));
comprobar("la recomendación da la prueba de diez segundos", consejoFalloDeRed().includes(`localhost:${PUERTO_IDE}${RUTA_LATIDO}`) && /Ctrl\+Shift\+R/.test(consejoFalloDeRed()));
comprobar("la recomendación nombra al culpable correcto", /proceso local del IDE/.test(consejoFalloDeRed()) && /NING(?:U|Ú)N proveedor/.test(consejoFalloDeRed()));

console.log(`\n═══ COREO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);

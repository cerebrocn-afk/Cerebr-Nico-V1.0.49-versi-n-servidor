/**
 * tests/enjambreEclectico.test.ts — LA RESPUESTA ECLÉCTICA (v1.80.0)
 * ===================================================================
 * Congela el criterio pedido por Mario 27/10: «el mismo prompt a varios
 * proveedores, contestan todos, y al final un resumen/consenso con veredicto
 * final de la tarea». Controles:
 *   · SIEMPRE HAY VOZ (regla «siempre una va a contestar»): sin favoritos nube
 *     entra la voz de respaldo Y SE DECLARA — nunca silencio, nunca eco falso;
 *   · EL VEREDICTO ESCALA («si muchos contestan, mejor será el veredicto»):
 *     la confianza es monótona con la cantidad de voces que respondieron;
 *   · el consenso MIDE: coincidencias solo cuando varias voces las sostienen;
 *   · el juez se lee tolerante; si no contestó, manda el consenso MEDIDO;
 *   · DEFECTO SEMBRADO por lectura de fuente: `cerebro/auto` tiene que estar
 *     cableado (selector, App, router y server.ts) o la suite se pone roja.
 */
import * as assert from "node:assert";
import * as fs from "node:fs";
import {
  armarEnjambre,
  evaluarRespuesta,
  medirConsenso,
  parsearVeredictoJuez,
  promptDelJuez,
  veredictoMedido,
  revisarVeredictoDelEnjambre,
  informeEclectico,
  confianzaEclectica,
  esCerebroAuto,
  MODELO_CEREBRO_AUTO,
  detectarBucleRepeticion,
  medirBucleRepeticion,
  similitud,
  sustanciaDeInforme,
  esInformeEclectico,
  digerirTurnoAsistente,
  MEMORIA_ASISTENTE_MAX_CHARS,
  NOTA_RECORTE_ANTI_BUCLE,
  BUCLE_UMBRAL_SIMILITUD,
} from "../src/engine/enjambreEclectico";
// v1.84.1 · contrato motor↔vista: el chat limpio se alimenta de ESTE informe.
import { dividirEclectica } from "../src/utils/chatResultados";
// v1.84.5 · la memoria que el chat mete en la mochila del enjambre.
import {
  armarPromptConMemoria,
  modeloConVisionEsperable,
  MEMORIA_MAX_TURNOS,
  MEMORIA_CHARS_POR_TURNO,
  ADJUNTOS_MAX_IMAGENES,
  SISTEMA_VOCES,
  HERRAMIENTAS_DEL_PUENTE,
} from "../src/engine/enjambreEclectico";
import { historialParaEnjambre, imagenesParaEnjambre, turnoParaMemoria } from "../src/utils/enjambreCliente";
import { PORTS } from "../src/constants";
// v1.97.3 · la capa de llamadas también se prueba: el fallo se explica y el
// reintento transitorio se mide (llamada real contra loopback cerrado: sin red).
import { explicarFalloProvedor, llamarJuez } from "../server/enjambreLlamadas";

const casos: Array<{ nombre: string; fn: () => void | Promise<void> }> = [];
const prueba = (nombre: string, fn: () => void | Promise<void>) => casos.push({ nombre, fn });
const lee = (r: string) => fs.readFileSync(new URL("../" + r, import.meta.url), "utf8");

const clave = { gemini: true, zai: true, groq: true, custom: true, openrouter: true };

prueba("dos proveedores distintos, una voz cada uno (dos ecos del mismo motor no suman)", () => {
  const a = armarEnjambre(
    [
      { provider: "zai", modelId: "glm-4.7-flash" },
      { provider: "zai", modelId: "glm-4.5-air" },
      { provider: "groq", modelId: "llama-3.3-70b" },
    ],
    clave
  );
  assert.strictEqual(a.voces.length, 2);
  assert.ok(a.descartes.some((d) => d.razon.includes("dos ecos")), "el descarte se declara: " + JSON.stringify(a.descartes));
});

prueba("aduana: embedders, fantasmas y sin-clave jamás son voces", () => {
  const a = armarEnjambre(
    [
      { provider: "ollama", modelId: "embeddinggemma-2-240m" },
      { provider: "zai", modelId: "fav-model-1792-abc" },
      { provider: "mistral", modelId: "mistral-small-latest" },
      { provider: "ollama", modelId: "qwen2.5:0.5b" },
    ],
    { zai: true }
  );
  // embedder, fantasma y mistral-sin-clave NUNCA son voces (así quede el local
  // de respaldo, que es la regla del punto anterior y se DECLARA).
  assert.ok(a.voces.every((v) => !/embedding|fav-model/.test(v.modelId) && v.provider !== "mistral"), JSON.stringify(a.voces));
  assert.ok(a.respaldo, "sin nube utilizable queda la voz de respaldo declarada");
  assert.ok(a.motivo.includes("MÍNIMOS"));
});

prueba("REGLA DE MARIO: sin voces nube queda la voz de respaldo, y se DECLARA", () => {
  const a = armarEnjambre([], {}, { actual: { provider: "ollama", modelId: "qwen2.5:0.5b" } });
  assert.strictEqual(a.voces.length, 1, "el enjambre nunca queda mudo");
  assert.strictEqual(a.respaldo, true);
  assert.ok(a.motivo.includes("MÍNIMOS"), a.motivo);
});

prueba("VEREDICTO QUE ESCALA: más voces que contestan, más confianza", () => {
  const una = confianzaEclectica({ acuerdo: 0.8, respondieron: 1, convocadas: 4 });
  const dos = confianzaEclectica({ acuerdo: 0.8, respondieron: 2, convocadas: 4 });
  const tres = confianzaEclectica({ acuerdo: 0.8, respondieron: 3, convocadas: 4 });
  const cinco = confianzaEclectica({ acuerdo: 0.8, respondieron: 5, convocadas: 5 });
  assert.ok(una < dos && dos < tres && tres <= cinco, `${una} < ${dos} < ${tres} <= ${cinco}`);
  assert.ok(una <= 0.35, "una sola voz no puede pasar el piso de duda: " + una);
  assert.strictEqual(confianzaEclectica({ acuerdo: 0.9, respondieron: 0, convocadas: 3 }), 0);
});

prueba("evaluar: rechazo, vacío y placeholder quedan etiquetados (no es consenso la excusa)", () => {
  const vacia = evaluarRespuesta({ provider: "zai", model: "m", ok: true, texto: "   ", ms: 10 });
  assert.ok(vacia.etiquetas.includes("vacia"));
  const rechazo = evaluarRespuesta({ provider: "zai", model: "m", ok: true, texto: "Lo siento, pero como modelo de lenguaje no puedo ayudarte con eso.", ms: 10 });
  assert.ok(rechazo.etiquetas.includes("rechazo") && rechazo.puntaje <= 15);
  const ph = evaluarRespuesta({ provider: "zai", model: "m", ok: true, texto: "function f() { // ... resto del código igual \n  return 1; } y explicación suficiente para pasar el piso de longitud del motor.", ms: 10 });
  assert.ok(ph.etiquetas.includes("placeholder"), ph.etiquetas.join(","));
});

const r = (provider: string, model: string, texto: string) => ({ provider, model, ok: true, texto, ms: 100 });
prueba("consenso MEDIDO: lo que dicen todos es coincidencia; lo de uno, divergencia", () => {
  const base = "Para levantar el preview hace falta npm install y despues arrancar el servidor en el puerto 3500 con el sandbox activo.";
  const respuestas = [r("zai", "glm", base), r("groq", "llama", base), r("openrouter", "ds", "Yo en cambio recomiendo usar pnpm y abrir el puerto 8080 que esta libre en mi maquina.")];
  const evals = respuestas.map((x) => evaluarRespuesta(x));
  const c = medirConsenso(evals, respuestas as any);
  assert.ok(c.coincidencias.length > 0 && c.coincidencias[0].voces >= 2, JSON.stringify(c.coincidencias));
  assert.ok(c.divergencias.length > 0, "la recomendación solitaria queda como divergencia");
  assert.strictEqual(c.respondieron, 3);
});

prueba("sin juez no se finge integración: el veredicto dice que fue consenso medido", () => {
  const respuestas = [r("zai", "glm", "Instala las dependencias y levanta el servidor en el puerto 3500 del sandbox."), r("groq", "llama", "Instala las dependencias y levanta el servidor en el puerto 3500 del sandbox.")];
  const v = veredictoMedido(respuestas.map((x) => evaluarRespuesta(x)), respuestas as any);
  assert.strictEqual(v.origen, "medido");
  const informe = informeEclectico({ tarea: "x", respuestas: respuestas as any, evaluadas: respuestas.map((x) => evaluarRespuesta(x)), veredicto: v });
  assert.ok(informe.includes("2/2 voces contestaron"), informe.slice(0, 200));
  assert.ok(informe.includes("sin juez"), informe);
});

prueba("v1.84.1 · CHAT LIMPIO (Mario 27/10): el informe se parte en resolución + detalle sin perder un byte", () => {
  // Contrato entre `informeEclectico` (motor) y `dividirEclectica` (vista): si
  // el motor cambia el molde, la vista deja de plegar ANTES de censurar — y
  // esta prueba avisa el cambio poniéndose roja, no con un chat mudo.
  const respuestas = [r("zai", "glm", "Instala las dependencias y levanta el servidor en el puerto 3500 del sandbox."), r("groq", "llama", "Instala las dependencias y levanta el servidor en el puerto 3500 del sandbox.")];
  const v = veredictoMedido(respuestas.map((x) => evaluarRespuesta(x)), respuestas as any);
  const informe = informeEclectico({ tarea: "¿cómo veo el preview?", respuestas: respuestas as any, evaluadas: respuestas.map((x) => evaluarRespuesta(x)), veredicto: v });
  const ecl = dividirEclectica(informe);
  assert.ok(ecl, "el informe del propio motor debe partirse");
  assert.strictEqual(ecl!.detalle, informe, "el detalle es el informe íntegro");
  assert.ok(ecl!.resolucion.length > 0 && informe.includes(ecl!.resolucion), "la resolución es literal del informe");
  assert.ok(!ecl!.resolucion.includes("RESPUESTA ECLÉCTICA") && !ecl!.resolucion.includes("Tarea consultada"), "la resolución no arrastra rótulos ni la tarea");
  assert.strictEqual(ecl!.voces, "2/2");
});

prueba("juez tolerante: JSON con texto alrededor se parsea; basura no se firma como veredicto", () => {
  const bueno = parsearVeredictoJuez('Aca va mi analisis. {"resumen":"todas coinciden","veredicto":"usar npm","confianza":0.9,"coincidencias":["npm"],"divergencias":[],"riesgos":[],"mejor_voz":"zai/glm"} listo.');
  assert.ok(bueno && bueno.veredicto === "usar npm" && bueno.origen === "juez");
  assert.strictEqual(parsearVeredictoJuez("no hay json acá"), null);
});

// ─── DEFECTO SEMBRADO: `cerebro/auto` tiene que estar cableado de punta a punta ──
prueba("cable completo: selector ofrece cerebro/auto, App enruta, router existe, server lo monta", () => {
  assert.ok(esCerebroAuto("cerebro", MODELO_CEREBRO_AUTO));
  const sel = lee("src/components/ModelSelectorModal.tsx");
  assert.ok(sel.includes("MODELO_CEREBRO_AUTO"), "el selector ofrece el modelo virtual");
  const app = lee("src/App.tsx");
  assert.ok(/esCerebroAuto\(provider, modelName\)[\s\S]{0,200}enviarTurnoAlEnjambre\(/.test(app), "el sender intercepta cerebro/auto y lo manda al enjambre");
  assert.ok(lee("server.ts").includes("registrarEnjambre"), "el monolito registra el router");
  assert.ok(lee("server/routers/enjambre.ts").includes("/api/enjambre/evaluar"), "el orquestador puede evaluar respuestas sin volver a llamar");
});

prueba("v1.84.3 · cerebro/auto también desencola al terminar el turno (Mario 27/10: «el mensaje de cola no salta luego que el modelo termina el turno»)", () => {
  // El bug: las dos rutas normales del turno (streaming y chat) vacían la cola
  // al acabar, pero cerebro/auto se desvía antes por `enviarTurnoAlEnjambre`,
  // que NO tocaba `messageQueueRef`. Un mensaje encolado durante un turno del
  // enjambre se quedaba huérfano (el «⏳ en cola» de la captura). Ahora la boca
  // única de la cola (`handleSendMessageWithRAGRef`) se invoca al cerrar el turno.
  const app = lee("src/App.tsx");
  const cuerpo = app.slice(app.indexOf("const enviarTurnoAlEnjambre"));
  const hastaCierre = cuerpo.slice(0, cuerpo.indexOf("handleSendMessageWithRAGRef.current = async"));
  assert.ok(hastaCierre.length > 200, "se localiza el cuerpo de enviarTurnoAlEnjambre");
  // v1.0.20: el desencolado dejó de estar copiado en cada andén. Ahora el
  // enjambre llama a la puerta única `desencolarSiguiente()`, que es la que
  // revisa la cola y saca el mensaje por `handleSendMessageWithRAGRef`.
  assert.ok(/desencolarSiguiente\(/.test(hastaCierre),
    "el turno del enjambre desencola al terminar");
  const puerta = app.slice(app.indexOf("const desencolarSiguiente"));
  const cuerpoPuerta = puerta.slice(0, puerta.indexOf("const isStreamingRef"));
  assert.ok(/messageQueueRef\.current/.test(cuerpoPuerta),
    "la puerta única revisa la cola");
  assert.ok(/handleSendMessageWithRAGRef\.current\(/.test(cuerpoPuerta),
    "el encolado sale por la boca única (rinde en el turno normal o en otro enjambre)");
  assert.ok(hastaCierre.indexOf("setIsStreaming(false)") < hastaCierre.indexOf("desencolarSiguiente("),
    "desencola DESPUÉS de liberar el turno, nunca en paralelo");
});

// ═══════════════════════════════════════════════════════════════════════
// v1.84.5 · EL ENJAMBRE CON MEMORIA (sesión 1793074563435: «los modelos se
// olvidan de lo de 2 o 3 mensajes atrás; di que le suba las fotos al chat y a
// los 2 mensajes se olvidan» — y el veredicto de las propias voces lo confesó
// en pantalla: «solo puedo ver los mensajes de esta conversación activa»,
// porque cada voz recibía UN solo turno sin historial ni adjuntos).
// ═══════════════════════════════════════════════════════════════════════
prueba("v1.84.5 · sin memoria ni adjuntos, el prompt llega INTACTO (compatibilidad con clientes viejos)", () => {
  const { prompt, turnos, nota } = armarPromptConMemoria({ tarea: "hazme la web" });
  assert.strictEqual(prompt, "hazme la web", "sin historial no se toca ni una coma");
  assert.strictEqual(turnos, 0);
  assert.strictEqual(nota, "");
});

prueba("v1.84.5 · la memoria viaja dentro del turno: antes de la tarea, con rótulos y presupuesto", () => {
  const { prompt, turnos, nota } = armarPromptConMemoria({
    tarea: "usa las imagenes que te pase",
    historial: [
      { rol: "user", texto: "crea la web de cerebronico" },
      { rol: "assistant", texto: "LISTO, ya está creada la página web en index.html con todas las funciones de la app y sus fotos" },
      { rol: "user", texto: "las imagenes están en la carpeta" },
    ],
  });
  assert.ok(prompt.includes("CONVERSACIÓN PREVIA"), "la memoria se anuncia como tal");
  assert.ok(prompt.indexOf("Usuario: crea la web") < prompt.indexOf("usa las imagenes que te pase"), "la memoria ANTES de la tarea");
  assert.strictEqual(turnos, 3);
  assert.ok(/Memoria del turno: 3 mensajes previos/.test(nota), nota);
});

prueba("v1.84.5 · el ruido del chat no reeduca a las voces: marcadores y errores quedan fuera", () => {
  const { prompt, turnos } = armarPromptConMemoria({
    tarea: "sigamos",
    historial: [
      { rol: "assistant", texto: "⊕⊕ ⚠ MARCADOR AUTOMÁTICO: «llama-3.3-70b» no contestó (❌ Groq no pudo responder)" },
      { rol: "assistant", texto: "⚠️ Error de comunicación con llama-3.3-70b-versatile: HTTP 400" },
      { rol: "assistant", texto: "veredicto real útil para la web del cerebro" },
    ],
  });
  assert.strictEqual(turnos, 1, "solo el turno sano entra a la memoria");
  assert.ok(!prompt.includes("MARCADOR AUTOMÁTICO"), "los marcadores no viajan");
  assert.ok(!prompt.includes("Error de comunicación"), "los avisos de error no viajan");
});

prueba("v1.84.5 · presupuesto: turnos cortados por el frente y por chars (lo reciente manda)", () => {
  const muchos = Array.from({ length: MEMORIA_MAX_TURNOS + 6 } as any, (_: any, i: number) => ({
    rol: i % 2 ? "assistant" : "user",
    texto: `turno ${i} ${"x".repeat(MEMORIA_CHARS_POR_TURNO)}`,
  }));
  const { prompt, turnos } = armarPromptConMemoria({ tarea: "final", historial: muchos as any });
  assert.ok(turnos <= MEMORIA_MAX_TURNOS, `tope de ${MEMORIA_MAX_TURNOS} turnos`);
  assert.ok(!prompt.includes("turno 0 "), "el más viejo se cayó");
  assert.ok(prompt.includes("turno " + (muchos.length - 1)), "el más reciente sobrevive");
});

prueba("v1.84.5 · adjuntos: lista nominal siempre; píxeles solo a quien se le espera visión", () => {
  const { prompt, imagenes } = armarPromptConMemoria({
    tarea: "puse las fotos",
    adjuntos: [
      { nombre: "menu.png", tipo: "image/png", esImagen: true, base64: "A".repeat(64) },
      { nombre: "cerebro fotos.zip", tipo: "application/zip", esImagen: false },
    ],
  });
  assert.ok(prompt.includes("· menu.png (image/png)") && prompt.includes("· cerebro fotos.zip (application/zip)"), "ambos nombrados");
  assert.strictEqual(imagenes, 1, "una imagen con datos en línea");
  assert.ok(modeloConVisionEsperable("qwen2.5vl:7b") && modeloConVisionEsperable("glm-4v-plus"), "visión esperada");
  assert.ok(!modeloConVisionEsperable("llama-3.3-70b-versatile") && !modeloConVisionEsperable("deepseek-chat"), "sin visión no se arriesga el 400");
});

prueba("v1.84.5 · LA MOCHILA DEL CHAT: informes eclécticos comprimidos a lo que el usuario vio, ruido fuera, nombres de adjuntos dentro", () => {
  const informeReal = [
    "🎭 RESPUESTA ECLÉCTICA — 2/5 voces contestaron, un solo prompt",
    "| # | voz | estado | puntaje | ms |",
    "|---|-----|--------|---------|----|",
    "**Divergencias importantes:**\n- Una dice npm, otra pnpm",
    "**Resumen del enjambre:**\nLas voces coinciden en el enfoque.",
    "**Veredicto final de la tarea:**\nUsá capturas reales desde ./public/img.",
    "> Tarea consultada: usa las imagenes",
  ].join("\n");
  const msgs = [
    { id: "a", role: "user", content: "crea la web", attachments: [{ name: "menu.png", type: "image/png" }] },
    { id: "b", role: "assistant", content: informeReal, status: "done" },
    { id: "c", role: "assistant", content: "⊕⊕ ⚠⚠ MARCADOR AUTOMÁTICO: no contestó", status: "done" },
    { id: "d", role: "assistant", content: "respuesta normal del asistente", status: "done" },
  ];
  const his = historialParaEnjambre(msgs as any);
  assert.strictEqual(his.length, 3, "el MARCADOR queda fuera; usuario + asistente sí viajan");
  assert.ok(his[0].texto.includes("[el usuario adjuntó: menu.png]"), "los adjuntos de turnos pasados viajan como nombres");
  // El informe ecléctico del propio enjambre viaja como lo leyó el usuario:
  // resumen + veredicto, SIN la tabla ni las divergencias.
  const informeEnMemoria = his[1].texto;
  assert.ok(informeEnMemoria.startsWith("**Resumen del enjambre:**") && informeEnMemoria.includes("Usá capturas reales") && !informeEnMemoria.includes("| # |"), informeEnMemoria.slice(0, 80));
  // Un mensaje con status error jamás entra.
  assert.strictEqual(turnoParaMemoria({ role: "assistant", content: "x", status: "error" }), null);
  // Imágenes del turno actual: base64 puro, solo imágenes.
  const imgs = imagenesParaEnjambre([
    { name: "menu.png", type: "image/png", isImage: true, base64Data: "data:image/png;base64," + "B".repeat(80) },
    { name: "leame.md", type: "text/markdown", extractedText: "hola" },
  ] as any);
  assert.strictEqual(imgs.length, 1);
  assert.ok(imgs[0].base64 && !imgs[0].base64.startsWith("data:") && imgs[0].tipo === "image/png", "lenguaje de proveedor: puro + mime limpio");
});

prueba("v1.84.5 · cableado real: App carga la mochila y el router la usa para voces, juez e informe", () => {
  const app = lee("src/App.tsx");
  const router = lee("server/routers/enjambre.ts");
  assert.ok(/historial: memoriaTurno/.test(app) && /memoriaTurno = historialParaEnjambre\(messagesRef\.current\)/.test(app), "el turno ecléctico saca la memoria ANTES de agregar su mensaje");
  assert.ok(/adjuntos: imagenesParaEnjambre\(attachments \|\| \[\]\)/.test(app), "las imágenes del mensaje actual suben con la mochila");
  assert.ok(/cuerpo\.historial/.test(router) && /cuerpo\.adjuntos/.test(router), "el router lee memoria y adjuntos del cuerpo");
  const cuerpo = router.slice(router.indexOf("/api/enjambre/consultar"));
  assert.ok(/armarPromptConMemoria/.test(cuerpo) && /llamarVoces\([\s\S]{0,400}conMemoria\.prompt/.test(cuerpo), "las voces reciben el prompt CON memoria");
  assert.ok(/promptDelJuez\(conMemoria\.prompt/.test(cuerpo), "el juez también lee la memoria");
  assert.ok(/notaMemoria: conMemoria\.nota/.test(cuerpo), "el informe declara cuánta memoria se inyectó");
  const ll = lee("server/enjambreLlamadas.ts");
  assert.ok(/modeloConVisionEsperable\(voz\.model\)/.test(ll) && /image_url/.test(ll) && /inline_data/.test(ll) && /images: \(imagenes/.test(ll), "los tres idiomas de imagen, puerta de visión incluida");
  // Las dos redes anti-ruido (cliente y motor) se nombran la una a la otra: si
  // alguien cambia una y olvida la otra, el historial vuelve a ensuciarse rojo.
  const eng = lee("src/engine/enjambreEclectico.ts");
  const cli = lee("src/utils/enjambreCliente.ts");
  assert.ok(/const TURNO_RUIDO = /.test(eng) && /const TURNO_RUIDO_CLIENTE = /.test(cli), "doble red declarada en ambos lados");
  assert.ok(/⊕⊕/.test(eng) && /⊕⊕/.test(cli), "el prefijo MARCADOR está en las dos redes");
});

// ═══════════════════════════════════════════════════════════════════════
// v1.86.1 · BUCLE DE REPETICIÓN (sesión 1793125918256: «¿te trancastes?
// ESTÁS REPITIENDO» → el enjambre re-entregó el MISMO veredicto del turno
// anterior). El bucle ahora se MIDE, se DECLARA en el informe visible, y
// las voces y el juez reciben la regla anti-bucle.
// ═══════════════════════════════════════════════════════════════════════
prueba("v1.86.1 · detector: repetición exacta es bucle medido (similitud 1)", () => {
  const anterior = "Veredicto: usar pygame con un tick de 60 fps y la máquina de estados en un arreglo.";
  const d = detectarBucleRepeticion(anterior, anterior);
  assert.strictEqual(d.bucle, true);
  assert.strictEqual(d.motivo, "repeticion-exacta");
  assert.strictEqual(d.similitud, 1);
});

prueba("v1.86.1 · detector: paráfrasis casi idéntica también es bucle (umbral 0.8)", () => {
  const anterior = "usar pygame con un tick de 60 fps y la máquina de estados en un arreglo, sprites en la carpeta de imagenes";
  const casi = "usar pygame con un tick de 60 fps y la máquina de estados en un arreglo, los sprites van en la carpeta de imagenes";
  const d = detectarBucleRepeticion(anterior, casi);
  assert.strictEqual(d.bucle, true, "la repetición casi idéntica se declara");
  assert.strictEqual(d.motivo, "repeticion-casi-exacta");
  assert.ok(d.similitud >= BUCLE_UMBRAL_SIMILITUD && d.similitud < 1, String(d.similitud));
});

prueba("v1.86.1 · detector: tarea distinta / respuesta distinta no dispara falso positivo", () => {
  const d = detectarBucleRepeticion(
    "usar pygame con un tick de 60 fps y la máquina de estados en un arreglo",
    "para ver el preview hay que hacer npm install y despues npm run build con el sandbox activo en el puerto 3500"
  );
  assert.strictEqual(d.bucle, false, JSON.stringify(d));
  assert.strictEqual(d.motivo, null);
});

prueba("v1.86.1 · detector: sin memoria (primer turno) jamás es bucle", () => {
  assert.deepStrictEqual(detectarBucleRepeticion(undefined, "cualquier veredicto"), { bucle: false, motivo: null, similitud: 0, comparados: 0, turnoRepetido: 0, racha: 0 });
  assert.deepStrictEqual(detectarBucleRepeticion("veredicto anterior", ""), { bucle: false, motivo: null, similitud: 0, comparados: 0, turnoRepetido: 0, racha: 0 }, "sin respuesta actual no hay nada medido (comparados 0, no 1)");
  assert.deepStrictEqual(medirBucleRepeticion([], "primer veredicto de la sesión"), { bucle: false, motivo: null, similitud: 0, comparados: 0, turnoRepetido: 0, racha: 0 });
});

// ═══════════════════════════════════════════════════════════════════════
// v1.86.2 · EL BUCLE QUE MARIO SIGUE VIENDO (sesión 1793133418292): cuatro
// turnos seguidos firmando el MISMO «Crear el archivo components/Preview.js…».
// v1.86.1 no lo cazaba por dos defectos medidos con SUS datos:
//   (a) comparaba el veredicto CRUDO del juez contra el informe ENVOLTORIO del
//       turno anterior — los seis tokens de los rótulos bajaban un 1.000 real
//       a 0.793/0.786 y el umbral de 0.8 no disparaba;
//   (b) miraba nomás al vecino inmediato: si el turno N-1 reformulaba, el
//       informe no decía que se estaba repitiendo EL PRIMERO de la sesión.
// Aquí se congela la corrección con los datos reales de esa sesión.
// ═══════════════════════════════════════════════════════════════════════
const INFORME_9 = [
  "🎭 RESPUESTA ECLÉCTICA — 2/3 voces contestaron, un solo prompt",
  "",
  "| # | voz | estado | puntaje | ms |",
  "|---|-----|--------|---------|----|",
  "| 1 | custom/codestral-2508 | ✓ | 65 | 4211 |",
  "| 2 | zai/glm-4.5-flash | ✓ | 65 | 3980 |",
  "| 3 | google/gemini-3.8-flash | ✗ HTTP 503 | 0 | 120016 |",
  "",
  "**Acuerdo medido:** ████████░░ 78 % · integrado por custom/codestral-2508",
  "",
  "**Resumen del enjambre:**",
  "Se requiere crear el componente Preview.js para el previsualizador. El código de Preview.js está disponible en la respuesta de la voz 3.",
  "",
  "**Veredicto final de la tarea:**",
  "Crear el archivo components/Preview.js con el código proporcionado por la voz 3 y verificar que esté correctamente enlazado en la aplicación principal.",
  "",
  "> Tarea consultada: crealo",
].join("\n");
// El turno siguiente: OTRA tabla de voces (tiempos distintos, un 503 de por
// medio) y la MISMA sustancia. Así pasó en la sesión real.
const INFORME_11 = INFORME_9.replace("| 1 | custom/codestral-2508 | ✓ | 65 | 4211 |", "| 1 | custom/codestral-2508 | ✓ | 65 | 9133 |");

prueba("v1.86.2 · la SUSTANCIA desnuda el informe: rótulos, tabla y tarea fuera", () => {
  assert.strictEqual(esInformeEclectico(INFORME_9), true);
  assert.strictEqual(esInformeEclectico("leí el archivo y no existe"), false);
  const s = sustanciaDeInforme(INFORME_9);
  assert.ok(s.includes("Se requiere crear el componente Preview.js"), s.slice(0, 120));
  assert.ok(s.includes("Crear el archivo components/Preview.js con el código proporcionado por la voz 3"), s.slice(-200));
  assert.ok(!s.includes("RESPUESTA ECLÉCTICA") && !s.includes("codestral") && !s.includes("Tarea consultada") && !s.includes("Resumen del enjambre"), s);
  // Un texto sin rótulos se devuelve tal cual: la función no inventa ni recorta.
  assert.strictEqual(sustanciaDeInforme("veredicto pelado"), "veredicto pelado");
});

prueba("v1.86.2 · DEFECTO CAZADO: dos informes con envoltorios distintos y la misma sustancia miden 1.000 (v1.86.1 medía 0.79)", () => {
  // Como lo medía v1.86.1: envoltorio del anterior contra la firma cruda.
  const comoV1861 = similitud(INFORME_9, "Crear el archivo components/Preview.js con el código proporcionado por la voz 3 y verificar que esté correctamente enlazado en la aplicación principal.");
  assert.ok(comoV1861 < BUCLE_UMBRAL_SIMILITUD, `v1.86.1 se quedaba debajo del umbral: ${comoV1861}`);
  // Como lo mide v1.86.2: sustancia contra sustancia.
  const d = medirBucleRepeticion([sustanciaDeInforme(INFORME_9)], `${sustanciaDeInforme(INFORME_11)}`);
  assert.strictEqual(d.bucle, true, JSON.stringify(d));
  assert.strictEqual(d.similitud, 1, "misma sustancia = repetición exacta medida, no casi-exacta");
  assert.strictEqual(d.motivo, "repeticion-exacta");
});

prueba("v1.86.2 · el detector nombra QUÉ turno repitió: «EL PRIMERO» es denunciable", () => {
  const primero = "Crear el archivo components/Preview.js con el código proporcionado por la voz 3 y verificar que esté correctamente enlazado en la aplicación principal.";
  const reformulado = "El componente Preview.js debe crearse con el código proporcionado por la voz 3 y luego verificar el enlace en la aplicación principal.";
  // Memoria real de la sesión: el 1º repite, el 2º reformula, este vuelve al 1º.
  const d = medirBucleRepeticion([primero, reformulado, primero], `${primero}`);
  assert.strictEqual(d.bucle, true);
  assert.strictEqual(d.comparados, 3);
  assert.strictEqual(d.turnoRepetido, 1, "señala el PRIMER turno recordado, no el vecino");
  assert.ok(d.racha >= 1, String(d.racha));
  // Y cuando repite el vecino, lo dice también (no siempre es el primero).
  const d2 = medirBucleRepeticion([reformulado, primero], `${primero}`);
  assert.strictEqual(d2.turnoRepetido, 2);
  // Tarea distinta: ni bucle ni turno señalado.
  const d3 = medirBucleRepeticion([primero], "montar el servidor de la web en el puerto 3500 con el sandbox activo y la clave de ollama local");
  assert.strictEqual(d3.bucle, false, JSON.stringify(d3));
  assert.strictEqual(d3.turnoRepetido, 0);
});

prueba("v1.86.2 · DIGERIR, NO COPIAR: la memoria asistente sale recortada y marcada", () => {
  const digerido = digerirTurnoAsistente(INFORME_9);
  assert.ok(digerido.length <= MEMORIA_ASISTENTE_MAX_CHARS + NOTA_RECORTE_ANTI_BUCLE.length + 1, String(digerido.length));
  assert.ok(digerido.includes(NOTA_RECORTE_ANTI_BUCLE), "la marca de «no copies» viaja con el recorte");
  assert.ok(!digerido.includes("codestral") && !digerido.includes("Tarea consultada"), "el envoltorio ya no es materia copiable");
  // El turno del usuario NO se toca: es la tarea, no es copia.
  assert.strictEqual(digerirTurnoAsistente("ya te dije crealo en el editor"), "ya te dije crealo en el editor");
  // Y en la memoria real del prompt: el informe largo entra digerido, la tarea intacta.
  const { prompt } = armarPromptConMemoria({
    tarea: "ya te dije crealo en el editor",
    historial: [
      { rol: "user", texto: "crealo" },
      { rol: "assistant", texto: INFORME_9 },
    ],
  });
  assert.ok(prompt.includes(NOTA_RECORTE_ANTI_BUCLE), prompt.slice(0, 600));
  assert.ok(!prompt.includes("| # | voz | estado | puntaje | ms |"), "la tabla de voces de otro turno no reeduca a nadie");
  assert.ok(prompt.indexOf("REGLA ANTI-BUCLE") < prompt.indexOf("ya te dije crealo en el editor"), "la regla va antes de la tarea");
});

prueba("v1.86.2 · el juez recibe TAREA y MEMORIA en bloques separados (y el re-empuje nombra la repetición)", () => {
  const conMemoria = armarPromptConMemoria({
    tarea: "crealo en el editor",
    historial: [{ rol: "assistant", texto: INFORME_9 }],
  });
  const p = promptDelJuez(conMemoria.prompt, [r("zai", "glm", "crear el archivo")], {
    anteriorVeredicto: sustanciaDeInforme(INFORME_9),
    memoria: conMemoria.memoria,
  });
  assert.ok(p.sistema.includes("(8) TAREA ≠ MEMORIA"), "la regla (8) está en el sistema del juez");
  assert.ok(p.usuario.includes("MEMORIA DE LA SESIÓN"), "la memoria viaja en su propio rótulo");
  assert.ok(p.usuario.indexOf("CONVERSACIÓN PREVIA") > p.usuario.indexOf("RESPUESTAS DEL ENJAMBRE"), "la memoria va AL FINAL: el bloque de la tarea ya no la lleva pegada");
  const antesDeLaMemoria = p.usuario.slice(0, p.usuario.indexOf("MEMORIA DE LA SESIÓN"));
  assert.ok(!antesDeLaMemoria.includes("| # | voz |"), "el envoltorio del prompt no se cuela en la tarea del juez");
  const despues = p.usuario.indexOf("MEMORIA DE LA SESIÓN");
  assert.ok(p.usuario.indexOf("crealo en el editor") < despues, "la tarea se lee ANTES que la memoria");
  assert.ok(!antesDeLaMemoria.includes("veredicto anterior"), "la tarea llega sin el texto del turno previo delante");
  const re = promptDelJuez(conMemoria.prompt, [r("zai", "glm", "crear el archivo")], {
    anteriorVeredicto: "x",
    memoria: conMemoria.memoria,
    correccionBucle: "Tu firma anterior repitió el turno 1 de 3 recordados (similitud 100 %). Esto ya está dicho:\n«Crear el archivo components/Preview.js…»",
  });
  assert.ok(re.usuario.includes("RE-EMPUJE: TU FIRMA ANTERIOR REPITIÓ LA MEMORIA"), "el re-empuje se anuncia como tal");
  assert.ok(/rehacé|rehace/i.test(re.usuario) && re.usuario.includes("qué FALTA"), "y exige avanzar, no repetir");
});

prueba("v1.86.2 · el informe DICE «EL PRIMERO» y declara el re-empuje (no se esconde)", () => {
  const texto = sustanciaDeInforme(INFORME_9);
  const respuestas = [r("zai", "glm", texto), r("custom", "codestral", texto)] as any;
  const evaluadas = respuestas.map((x) => evaluarRespuesta(x));
  const v = veredictoMedido(evaluadas, respuestas);
  const base: any = {
    tarea: "crealo",
    respuestas,
    evaluadas,
    veredicto: v,
    recordadosVeredictos: [INFORME_9, "El componente Preview.js debe crearse y luego verificar el enlace en la aplicacion principal con el sandbox en 3500", INFORME_11],
  };
  const informe = informeEclectico(base);
  assert.ok(informe.includes("BUCLE DE REPETICIÓN DETECTADO"), informe.slice(0, 400));
  assert.ok(informe.includes("— EL PRIMERO de la sesión"), "el informe nombra el turno repetido: " + informe.slice(0, 400));
  // La similitud impresa es la MEDIDA (el envoltorio del consenso suma un token
  // o dos): tiene que estar muy por encima del umbral que v1.86.1 no veía.
  const impresa = Number(informe.match(/similitud (\d+) %/)?.[1]);
  assert.ok(impresa >= 90, `similitud impresa ${impresa} % — la repetición se mide, no se redondea hacia abajo`);
  assert.ok(!informe.includes("RE-EMPUJE DEL JUEZ"), "sin re-empuje la línea no aparece");
  const reempujado = informeEclectico({ ...base, reempuje: 1 });
  assert.ok(reempujado.includes("RE-EMPUJE DEL JUEZ (1)"), reempujado.slice(0, 500));
  assert.ok(reempujado.includes("tampoco lo rompió"), "si el re-empuje no alcanzó, se dice");
  assert.notStrictEqual(reempujado, informe, "el re-empuje cambia el informe");
  // El plegado del chat sigue intacto con la advertencia puesta.
  const ecl = dividirEclectica(reempujado);
  assert.ok(ecl && ecl.detalle === reempujado);
});

prueba("v1.86.2 · cableado: el router mide TODA la memoria, separa tarea/memoria y re-empuja", () => {
  const router = lee("server/routers/enjambre.ts");
  assert.ok(/const recordadosVeredictos = historialPlano/.test(router), "viaja la lista completa de veredictos recordados");
  assert.ok(/anteriorVeredicto,\s*memoria: memoriaJuez/.test(router), "el juez recibe la memoria en su propio bloque");
  assert.ok(/medirBucleRepeticion\(recordadosVeredictos/.test(router), "la medición usa la memoria completa, no el vecino");
  assert.ok(/reempuje = 1/.test(router) && /correccionBucle:/.test(router), "hay un re-empuje real del juez");
  assert.ok(/!medir\(corregido\)\.bucle/.test(router), "solo se cambia la firma si deja de repetir");
  assert.ok(/recordadosVeredictos,\s*\n?\s*reempuje/.test(router) || /recordadosVeredictos, reempuje/.test(router), "el informe recibe la memoria y el re-empuje");
  assert.ok(/bucle: \{/.test(router), "la respuesta JSON declara el diagnóstico");
});

prueba("v1.86.1 · el informe DECLARA el bucle cuando existe y queda callado cuando no", () => {
  const texto = "se recomienda usar pygame con un tick de 60 fps y la máquina de estados en un arreglo";
  const respuestas = [r("zai", "glm", texto), r("groq", "llama", texto)] as any;
  const v = veredictoMedido(respuestas.map((x) => evaluarRespuesta(x)), respuestas);
  const base: any = {
    tarea: "¿sigo con lo de pygame?",
    respuestas,
    evaluadas: respuestas.map((x) => evaluarRespuesta(x)),
    veredicto: v,
    anteriorVeredicto: texto,
  };
  const conBucle = informeEclectico(base);
  assert.ok(conBucle.includes("BUCLE DE REPETICIÓN DETECTADO"), conBucle.slice(0, 300));
  assert.ok(/similitud \d+ %/.test(conBucle), "la similitud se mide, no se inventa");
  assert.ok(conBucle.includes("NO avanzó"), "el informe declara que el enjambre no avanzó");
  assert.ok(conBucle.includes("Bucle de repetición"), "el riesgo queda registrado en la sección de riesgos");
  const sinBucle = informeEclectico({ ...base, anteriorVeredicto: "montar el servidor de la web en el puerto 3500 con el sandbox activo y la clave de ollama local" });
  assert.ok(!sinBucle.includes("BUCLE DE REPETICIÓN"), "sin bucle no hay alarma");
  const sinMemoria = informeEclectico({ ...base, anteriorVeredicto: undefined });
  assert.ok(!sinMemoria.includes("BUCLE DE REPETICIÓN"), "el primer turno de la sesión jamás es bucle");
  assert.strictEqual(informeEclectico(base), conBucle, "determinista: mismos datos → mismos bytes");
  // La advertencia no rompe el plegado del chat (contrato por etiquetas).
  const ecl = dividirEclectica(conBucle);
  assert.ok(ecl, "el informe con advertencia de bucle sigue partiéndose");
  assert.strictEqual(ecl!.detalle, conBucle);
});

prueba("v1.86.1 · el juez recibe la regla anti-bucle (siempre) y el veredicto anterior (con memoria)", () => {
  const con = promptDelJuez("¿sigo con pygame?", [r("zai", "glm", "usá pygame")], { anteriorVeredicto: "usá pygame con tick de 60 fps" });
  assert.ok(con.sistema.includes("ANTI-BUCLE"), "la regla (7) está en el sistema del juez");
  assert.ok(con.usuario.includes("VEREDICTO DEL TURNO ANTERIOR"), "el veredicto anterior viaja rotulado como memoria");
  const sin = promptDelJuez("¿sigo con pygame?", [r("zai", "glm", "usá pygame")]);
  assert.ok(sin.sistema.includes("ANTI-BUCLE"), "la regla también está sin memoria");
  assert.ok(!sin.usuario.includes("VEREDICTO DEL TURNO ANTERIOR"), "sin memoria no viaja el bloque anterior");
});

prueba("v1.86.1 · la cabecera de memoria lleva la regla anti-bucle (contexto no es tarea)", () => {
  const { prompt } = armarPromptConMemoria({
    tarea: "avanzá con la web",
    historial: [{ rol: "assistant", texto: "veredicto anterior sobre la web" }],
  });
  assert.ok(prompt.includes("CONVERSACIÓN PREVIA"), "sigue anunciándose como memoria");
  assert.ok(prompt.includes("REGLA ANTI-BUCLE"), "la regla viaja con la memoria");
  assert.ok(prompt.indexOf("REGLA ANTI-BUCLE") < prompt.indexOf("avanzá con la web"), "la regla va ANTES de la tarea");
});

let fallos = 0;

// ══════════════════════════════════════════════════════════════════════════
// v1.86.4 · LA VERDAD DEL MCP EN EL ENJAMBRE (sesión 1793147384797).
// El pack cargaba 6 herramientas y aun así las voces decían «no tengo acceso
// a archivos»: la llamada del enjambre viaja SIN tools. Estos candados evitan
// que el prompt vuelva a callar el alcance.
// ══════════════════════════════════════════════════════════════════════════
prueba("v1.86.4 · SISTEMA_VOCES existe y mantiene la voz de la casa", () => {
  assert.ok(SISTEMA_VOCES.includes("español técnico, directo y sin relleno"));
  assert.ok(SISTEMA_VOCES.includes("como si dependiera de vos"));
});

prueba("v1.86.4 · declara SIN tools y PROHÍBE el «no tengo acceso»", () => {
  assert.ok(/sin tools/i.test(SISTEMA_VOCES), SISTEMA_VOCES);
  assert.ok(/tool_choice/i.test(SISTEMA_VOCES), SISTEMA_VOCES);
  assert.ok(SISTEMA_VOCES.includes("NUNCA respondas «no tengo acceso a archivos»"), SISTEMA_VOCES);
});

prueba("v1.86.4 · deriva a los órganos correctos: chat con tools, puente y sandbox medidos de PORTS", () => {
  assert.ok(SISTEMA_VOCES.includes(`puente :${PORTS.BRIDGE}`), SISTEMA_VOCES);
  assert.ok(SISTEMA_VOCES.includes(`sandbox :${PORTS.SANDBOX}`), SISTEMA_VOCES);
  assert.ok(SISTEMA_VOCES.includes("Modo Agente PC"), SISTEMA_VOCES);
  for (const h of HERRAMIENTAS_DEL_PUENTE) assert.ok(SISTEMA_VOCES.includes(h), h);
});

prueba("v1.86.4 · las 6 herramientas congeladas igual que agent_bridge_5000.py", () => {
  assert.deepStrictEqual([...HERRAMIENTAS_DEL_PUENTE], ["fs_read", "fs_write", "fs_list", "fs_delete", "fs_mkdir", "exec"]);
});

prueba("v1.86.4 · cableado: llamarVoces usa SISTEMA_VOCES como default (el literal viejo está fuera)", () => {
  const src = lee("server/enjambreLlamadas.ts");
  assert.ok(src.includes("sistema = opts?.sistema || SISTEMA_VOCES"), "el default debe venir de SISTEMA_VOCES");
  assert.ok(!src.includes("Respondés UNICAMENTE en español técnico"), "el literal viejo no debe quedar en la capa de llamadas");
});

// ══════════════════════════════════════════════════════════════════════════
// v1.86.5 · LA CERTEZA LLEGA AL ENJAMBRE («perfección de certeza»).
// El enjambre genera texto y NUNCA ejecuta ni lee: toda afirmación de resultado
// en el resumen/veredicto se reescribe a su alternativa honesta ANTES de firmar
// el informe. Las citas (coincidencias/divergencias) no se tocan.
// ══════════════════════════════════════════════════════════════════════════
const veredictoDe = (resumen: string, veredicto: string) =>
  revisarVeredictoDelEnjambre({
    resumen,
    veredicto,
    confianza: 0.5,
    coincidencias: [],
    divergencias: [],
    mejorVoz: null,
    riesgos: [],
    origen: "medido",
  });

prueba("v1.86.5 · el revisor reescribe «funciona» y «verificado» a su alternativa honesta", () => {
  const r = veredictoDe("La API funciona y devuelve datos.", "El fix quedó verificado y completo.");
  assert.strictEqual(r.certeza, "sin_verificar", "el enjambre no ejecuta ni lee");
  assert.ok(!/funciona/i.test(r.veredicto.resumen), "«funciona» no puede quedar sin ejecución");
  assert.ok(!/verificado/i.test(r.veredicto.veredicto), "«verificado» no puede quedar sin ejecución");
  assert.ok(/pendiente de ejecutar/i.test(r.veredicto.resumen), r.veredicto.resumen);
  assert.ok(/pendiente de ejecutar/i.test(r.veredicto.veredicto), r.veredicto.veredicto);
  assert.ok(r.avisos.length >= 2, `avisos esperados ≥ 2, llegaron ${r.avisos.length}`);
});

prueba("v1.86.5 · sin palabras de afirmación no se reescribe nada y no hay avisos", () => {
  const texto = "Revisá el archivo server.ts y ajustá la constante.";
  const r = veredictoDe(texto, "Sumá una prueba a la suite.");
  assert.strictEqual(r.veredicto.resumen, texto, "texto intacto");
  assert.strictEqual(r.veredicto.veredicto, "Sumá una prueba a la suite.", "veredicto intacto");
  assert.strictEqual(r.avisos.length, 0);
  assert.strictEqual(r.certeza, "sin_verificar");
});

prueba("v1.86.5 · el infinitivo «verificar» y las citas NO se tocan (son evidencia, no firma)", () => {
  const r = revisarVeredictoDelEnjambre({
    resumen: "Hay que verificar antes de confiar.",
    veredicto: "Sin evidencia de ejecución.",
    confianza: 0.5,
    coincidencias: ["El puerto 3000 funciona según una voz"],
    divergencias: ["La ruta quedó comprobada por una sola voz"],
    mejorVoz: "openrouter/x",
    riesgos: [],
    origen: "medido",
  });
  assert.ok(r.veredicto.resumen.includes("verificar antes de confiar"), "el infinitivo no es una afirmación");
  assert.ok(r.veredicto.coincidencias[0].includes("funciona"), "la cita de la voz se preserva tal cual");
  assert.ok(r.veredicto.divergencias[0].includes("comprobada"), "la divergencia se preserva tal cual");
});

prueba("v1.86.5 · el informe firmado con el veredicto corregido conserva sus marcadores", () => {
  const r = veredictoDe("El servidor funciona.", "La tarea está completa.");
  const respuesta = { provider: "openrouter", model: "x", ok: true, texto: "sí", ms: 10 };
  const informe = informeEclectico({
    tarea: "levantar el servidor",
    respuestas: [respuesta],
    evaluadas: [evaluarRespuesta(respuesta)],
    veredicto: r.veredicto,
  });
  assert.ok(informe.includes("**Veredicto final de la tarea:**"), "el marcador de veredicto sigue");
  assert.ok(informe.includes("**Resumen del enjambre:**"), "el marcador de resumen sigue");
  assert.ok(informe.includes("> Tarea consultada:"), "el pie de tarea sigue");
  assert.ok(!/funciona/.test(informe), "el informe no firma «funciona» sin ejecución");
  assert.ok(esInformeEclectico(informe), "sigue siendo un informe ecléctico válido");
});

prueba("v1.86.5 · cableado: las dos rutas pasan el veredicto por el revisor y exponen la certeza", () => {
  const src = lee("server/routers/enjambre.ts");
  assert.ok((src.match(/revisarVeredictoDelEnjambre/g) || []).length >= 2, "se llama en /consultar y en /evaluar");
  assert.ok(src.includes("certeza: certezaDelTurno.certeza"), "la certeza viaja como dato en la respuesta");
  assert.ok(src.includes("afirmacionesSinEvidencia: certezaDelTurno.avisos.length > 0"), "el aviso viaja como dato");
});

// ══════════════════════════════════════════════════════════════════════════
// v1.97.3 · EL FALLO DICE POR QUÉ, Y EL REINTENTO SE GASTA UNA VEZ.
// El escenario real del usuario (31/10): créditos agotados (402), free clouds
// muriendo de 429, y un local que nunca contesta. Una voz muerta es un voto
// menos, así que el enjambre reintenta UNA vez solo el fallo transitorio y
// deja un mensaje accionable en la tabla del informe, no `HTTP 402: {"error"}
// ══════════════════════════════════════════════════════════════════════════
prueba("v1.97.3 · explicarFalloProvedor: el informe habla en humano, no en códigos", () => {
  assert.ok(/créditos agotados/.test(explicarFalloProvedor('HTTP 402: {"error":"insufficient"}')), "402 dice créditos");
  assert.ok(/límite de uso/.test(explicarFalloProvedor("HTTP 429: rate limit reached")), "429 dice límite de uso");
  assert.ok(/no existe en ese proveedor/.test(explicarFalloProvedor("HTTP 404: model not found")), "404 dice modelo inexistente");
  assert.ok(/no contestó a tiempo/.test(explicarFalloProvedor("tiempo de espera agotado")), "timeout dice a tiempo");
  assert.ok(/cuarentena/.test(explicarFalloProvedor("EN CUARENTENA: proveedor groq")), "cuarentena se declara");
  assert.ok(/rechazó la conexión/.test(explicarFalloProvedor("fetch failed · causa real: ECONNREFUSED")), "ECONNREFUSED se explica");
  // Lo que NO es un fallo conocido se deja intacto: nunca se inventa un motivo.
  assert.strictEqual(explicarFalloProvedor("sin clave en la ranura de groq"), "sin clave en la ranura de groq");
});

prueba("v1.97.3 · reintento único ante fallo transitorio y se DECLARA (llamada real, loopback cerrado)", async () => {
  const r = await llamarJuez({ provider: "custom", model: "x" }, { sistema: "s", usuario: "u" }, { customUrl: "http://127.0.0.1:1" });
  assert.strictEqual(r.ok, false, "un endpoint cerrado no puede votar");
  assert.strictEqual(r.reintentada, true, "la segunda chance se declara en la respuesta");
  assert.ok(r.ms >= 1_400, `falta la pausa de 1,5 s antes del reintento: ${r.ms} ms`);
  assert.ok(r.error && !/^HTTP \d{3}/.test(r.error), "el error no se parece a un código HTTP crudo: " + String(r.error));
});

for (const c of casos) {
  try { await c.fn(); console.log("  ✓ " + c.nombre); }
  catch (e: any) { fallos++; console.log("  ✗ " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nenjambreEclectico: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);

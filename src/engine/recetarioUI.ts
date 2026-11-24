/**
 * recetarioUI.ts — RECETARIO PROFESIONAL DE COMPONENTES WEB (v1.47.1)
 * ==================================================================
 * Mario pedía que el agente dejara de hacer SIEMPRE la misma plantilla y supiera
 * construir de verdad: botones con funciones distintas, perillas/sliders de
 * volumen, ventanas (modales, drawers, popovers), vídeo incrustado, etc. — y que
 * ANALICE antes de ponerse a escribir, para no «hacer cagadas».
 *
 * Esto NO es texto decorativo: es conocimiento que viaja en el MOTOR. Cualquier
 * conductor (un modelo pequeño, GLM, Gemini) recibe el mismo recetario y por eso
 * puede variar los componentes aunque el modelo por sí solo no se los supiera.
 *
 * Dos piezas:
 *   1) RECETARIO_UI_ENTRIES — entradas de KB (consultables y re-sembrables).
 *   2) buildRecetarioUISection(prompt) — bloque COMPACTO que se inyecta en el
 *      prompt SOLO cuando la tarea es de interfaz/web (se activa por palabras
 *      clave), para no gastar contexto en tareas que no lo necesitan.
 *
 * Convención técnica de las recetas (profesional, no de juguete):
 *   - La lógica va con addEventListener, NUNCA con on* en línea (más limpio,
 *     separa estructura de comportamiento y evita XSS por inyección de texto).
 *   - Accesibilidad mínima: aria-label, foco visible, roles correctos.
 *   - Nada de `javascript:` en href ni de inyectar HTML de usuario sin escapar.
 */

import type { KbEntry } from "./knowledgeBase";

const R = (id: string, title: string, body: string, keys: string[], weight = 0.85): KbEntry => ({
  id,
  table: "recetario-ui",
  title,
  body,
  keys,
  tags: ["recetario", "ui", "web", "frontend"],
  weight,
  lang: "es",
});

// ============================================================
// PROTOCOLO DE ANÁLISIS PREVIO — «analiza antes de hacer cagadas»
// Se inyecta en tareas de proyecto para modelos con capacidad real.
// ============================================================
export const PROTOCOLO_ANALISIS =
  "[PROTOCOLO DE ANÁLISIS PREVIO — PIENSA ANTES DE TOCAR NADA]\n" +
  "Antes de escribir o modificar un solo archivo, haz este análisis (breve, pero HAZLO):\n" +
  "1) MIRA lo que ya hay: list_files y lee (read_file / read_file_range) los archivos que vas a tocar. No supongas su contenido.\n" +
  "2) ENTIENDE el pedido: ¿qué quiere EXACTAMENTE el usuario y qué NO? Si hay ambigüedad real, pregunta en una línea; si no, elige la opción razonable y dilo.\n" +
  "3) PLAN corto: di en 1-3 frases qué archivos vas a crear/editar y por qué. Si son >2 pasos, usa set_plan.\n" +
  "4) RIESGOS: ¿vas a pisar algo que funciona? ¿borrar? ¿reescribir entero? Prefiere edit_file sobre reescribir. Lo destructivo se avisa y se confirma.\n" +
  "5) HAZLO por partes y 6) VERIFICA (relee / compila / abre el preview). Si no pudiste verificar, dilo: «aplicado, sin verificar».\n" +
  "Regla de oro: variar el resultado. No entregues siempre la misma plantilla; adapta estructura, componentes y estilo a lo que pide el usuario.";

// ============================================================
// RECETAS — cada una concreta y copiable
// ============================================================
export const RECETARIO_UI_ENTRIES: KbEntry[] = [
  R(
    "ui-botones-tipos",
    "Botones: tipos y funciones distintas",
    [
      "Elige el elemento por su FUNCIÓN, no por su aspecto:",
      "• Redirección (ir a otra página/URL): usa un enlace, no un botón JS. <a class=\"btn\" href=\"/destino.html\">Ir</a>. Externo: añade target=\"_blank\" rel=\"noopener\". Nunca uses href=\"javascript:...\".",
      "• Acción JS (hace algo en la página): <button type=\"button\" id=\"bAcc\">Hacer</button> + document.getElementById('bAcc').addEventListener('click', () => { /* ... */ });",
      "• Enviar formulario: <button type=\"submit\"> dentro de <form>; valida en el evento submit con e.preventDefault() si hace falta.",
      "• Alternar (toggle on/off): <button type=\"button\" aria-pressed=\"false\"> y en el click invierte aria-pressed; estila con [aria-pressed=\"true\"].",
      "• Con confirmación (peligroso): en el click muestra un diálogo de confirmación antes de ejecutar; no borres directo.",
      "• Icono/FAB: <button type=\"button\" aria-label=\"Añadir\"> con un <svg> dentro; SIEMPRE aria-label si no hay texto.",
      "Base CSS: .btn{display:inline-flex;gap:.5rem;align-items:center;padding:.6rem 1rem;border-radius:.6rem;border:1px solid #334;cursor:pointer} .btn:focus-visible{outline:2px solid #6cf}.",
    ].join("\n"),
    ["boton", "button", "redireccion", "enlace", "toggle", "submit", "fab", "icono", "accion"]
  ),
  R(
    "ui-slider-volumen",
    "Slider / control de volumen (desplazador)",
    [
      "Desplazador horizontal (lo más usable para volumen): <input type=\"range\" id=\"vol\" min=\"0\" max=\"100\" value=\"50\" aria-label=\"Volumen\">.",
      "Leer el valor: document.getElementById('vol').addEventListener('input', e => { const v = +e.target.value; /* 0..100 */ });",
      "Conectar a un <audio>/<video>: medios.volume = v/100; (volume va de 0 a 1).",
      "Rellenar la pista hasta el valor (barato, sin JS extra): accent-color:#6cf en el input, o un fondo con linear-gradient recalculado en 'input'.",
      "Vertical: envuelve el range y aplica transform:rotate(-90deg) al contenedor, o writing-mode:vertical-lr; en el input (soporte variable: prueba en preview).",
    ].join("\n"),
    ["slider", "range", "volumen", "desplazador", "audio", "video", "control"]
  ),
  R(
    "ui-perilla-knob",
    "Perilla / knob redondo giratorio",
    [
      "Una perilla es, por dentro, un valor 0..100 que se DIBUJA como círculo que gira. Hazla accesible con un range real debajo.",
      "HTML: <div class=\"knob\" role=\"slider\" aria-label=\"Volumen\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"50\" tabindex=\"0\"><div class=\"knob-indicador\"></div></div>.",
      "CSS: .knob{width:72px;height:72px;border-radius:50%;background:radial-gradient(#2a2f3a,#161a22);position:relative} .knob-indicador{position:absolute;top:6px;left:50%;width:3px;height:28px;background:#6cf;transform-origin:bottom center;transform:translateX(-50%)}.",
      "JS (girar): mapea el valor 0..100 a un ángulo -135°..+135° y aplica rotate al contenedor o al indicador: const ang = -135 + (v/100)*270; knob.querySelector('.knob-indicador').style.transform = `translateX(-50%) rotate(${ang}deg)`;",
      "Interacción: con la rueda del ratón (wheel) sube/baja, con flechas del teclado (keydown ArrowUp/Down) ±1, o arrastrando (pointermove) convierte el ángulo del cursor respecto al centro en valor. Actualiza aria-valuenow en cada cambio.",
    ].join("\n"),
    ["perilla", "knob", "redondo", "giratorio", "volumen", "dial", "rotar"]
  ),
  R(
    "ui-ventanas-modales",
    "Ventanas: modal, drawer, popover, toast",
    [
      "• Modal nativo (lo más simple y accesible): <dialog id=\"m\">...<button data-cerrar>Cerrar</button></dialog>. Abrir: m.showModal(); Cerrar: m.close(); el fondo oscuro y el foco los gestiona el navegador. Estila ::backdrop.",
      "• Drawer / panel lateral: un <aside> fijo con transform:translateX(-100%); al abrir, translateX(0) y una transición. Añade un overlay para cerrar al clicar fuera.",
      "• Popover (menú/tooltip anclado): atributo nativo popover: <button popovertarget=\"p\">Menú</button> <div id=\"p\" popover>...</div> (si no hay soporte, un div posicionado con position:absolute).",
      "• Toast / notificación: un contenedor fijo abajo-derecha; añade el aviso con JS y quítalo con setTimeout(() => el.remove(), 4000). Usa role=\"status\" para que lo lea el lector de pantalla.",
      "Regla: no bloquees con alert() en productos reales; usa <dialog> o toast. Cierra siempre con Escape y con clic en el fondo.",
    ].join("\n"),
    ["ventana", "modal", "dialog", "drawer", "popover", "popup", "toast", "notificacion", "menu"]
  ),
  R(
    "ui-pestanas-acordeon",
    "Pestañas (tabs) y acordeón — que FUNCIONEN",
    [
      "Fallo típico (el de las capturas de Mario): las pestañas 'no hacen nada' porque el JS no encuentra el botón o se carga antes que el DOM. Solución:",
      "1) Pon el <script> antes de </body> o envuelve en DOMContentLoaded.",
      "2) Marca cada botón con data-tab=\"panel1\" y cada panel con id=\"panel1\".",
      "3) Delega el evento: document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.panel').forEach(p=>p.hidden=true); document.getElementById(b.dataset.tab).hidden=false; }));",
      "4) Verifica en el preview que el id del data-tab EXISTE; un id mal escrito es la causa nº1 de 'no anda'.",
      "Acordeón: usa <details><summary>Título</summary>contenido</details> — nativo, sin JS, abre y cierra solo.",
    ].join("\n"),
    ["pestañas", "tabs", "acordeon", "details", "navegacion", "no anda", "no hace nada"]
  ),
  R(
    "ui-video",
    "Insertar vídeo en una página web",
    [
      "• Vídeo propio (archivo en el proyecto): <video src=\"assets/clip.mp4\" controls playsinline width=\"640\"></video>. Para autoplay el navegador EXIGE muted: <video src=\"...\" autoplay muted loop playsinline></video>.",
      "• Varios formatos: <video controls><source src=\"v.webm\" type=\"video/webm\"><source src=\"v.mp4\" type=\"video/mp4\">Tu navegador no soporta vídeo.</video>.",
      "• YouTube: <iframe width=\"560\" height=\"315\" src=\"https://www.youtube.com/embed/ID\" title=\"...\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture\" allowfullscreen></iframe> (usa la URL /embed/, NO la de watch?v=).",
      "• Responsive 16:9: envuelve el iframe en .ratio{position:relative;padding-top:56.25%} y el iframe en position:absolute;inset:0;width:100%;height:100%.",
      "Comprueba que la ruta del vídeo propio existe (list_files); si sale negro, casi siempre es ruta mal puesta o falta el codec.",
    ].join("\n"),
    ["video", "iframe", "youtube", "mp4", "webm", "autoplay", "responsive", "incrustar"]
  ),
  R(
    "ui-imagenes-subidas",
    "Mostrar imágenes que subió el usuario",
    [
      "Las imágenes que sube el usuario se guardan solas en el proyecto, en assets/subidas/<nombre>. El motor te da la ruta EXACTA en el contexto del turno.",
      "v1.72.0 — PRIORIZA RUTAS LOCALES sobre URLs externas. Para insertar una imagen en el HTML del sandbox:",
      "1) Si la imagen ya está en assets/subidas/: usa EXACTAMENTE esa ruta en el src — <img src=\"assets/subidas/foto.png\">. El sandbox la sirve desde la raíz del proyecto; NO la renombres ni la muevas a img/.",
      "2) Si necesitas una imagen nueva en el proyecto: usa cerebronico:imagen (el IDE la genera y la guarda en img/). Esas sí viven en img/, y son otra cosa que las subidas.",
      "3) NUNCA uses URLs externas (Unsplash, etc.) como <img src=\"https://images.unsplash.com/...\"> — fallan por CORS, red lenta o bloqueo del navegador.",
      "4) Usa rutas relativas locales (assets/subidas/, img/) SIEMPRE antes que URLs externas.",
      "Ejemplo: <img src=\"assets/subidas/foto.png\" alt=\"descripción\" loading=\"lazy\">.",
      "NO uses base64 en el HTML ni inventes otra ruta ni la copies a otra carpeta: ya existe en disco. Si tu HTML está en una subcarpeta, ajusta la ruta relativa.",
      "Si sale recuadro blanco: la ruta no coincide con el archivo real. Verifica con list_files y copia la ruta literal. Desde v1.72.0 el sandbox responde 404 de verdad a un recurso inexistente en lugar de devolver el HTML: abre la consola de red y lee la ruta exacta que falló.",
    ].join("\n"),
    ["imagen", "img", "subida", "assets", "foto", "recuadro blanco", "galeria", "inyectar", "sandbox"]
  ),
];

// Palabras clave que delatan una tarea de interfaz/web. Si NINGUNA aparece, no
// se inyecta el recetario (ahorra contexto en tareas que no son de UI).
const RE_UI =
  /\b(bot[oó]n|botones|button|perilla|knob|slider|desliza|volumen|modal|modales|ventana|ventanas|dialog|diálogo|popup|popover|drawer|cajon|men[uú]|v[ií]deo|video|iframe|youtube|galer[ií]a|carrusel|p[aá]gina web|p[aá]ginas|html|css|interfaz|ui|ux|formulario|input|pesta[nñ]a|pestañas|tab|tabs|acorde[oó]n|tooltip|notificaci[oó]n|toast|front-?end|maqueta|dise[nñ]o web|componente)\b/i;

/** ¿La tarea parece de interfaz/web? */
export function esTareaUI(prompt: string): boolean {
  return RE_UI.test(String(prompt || ""));
}

/**
 * Bloque compacto para el prompt. Devuelve "" si la tarea no es de UI. Mete solo
 * las recetas cuyos keys casan con el pedido (si no casa ninguna, mete el
 * catálogo completo en forma de índice), y recorta al presupuesto dado.
 */
export function buildRecetarioUISection(prompt: string, budgetChars = 2200): string {
  const texto = String(prompt || "");
  if (budgetChars <= 0) return "";
  if (!esTareaUI(texto)) return "";
  const low = texto.toLowerCase();

  // Recetas relevantes primero (por coincidencia de keys), luego el resto.
  const casa = (e: KbEntry) => (e.keys || []).some((k) => low.includes(k.toLowerCase()));
  const relevantes = RECETARIO_UI_ENTRIES.filter(casa);
  const elegidas = relevantes.length > 0 ? relevantes : RECETARIO_UI_ENTRIES;

  const partes: string[] = [
    "[RECETARIO DE COMPONENTES WEB — patrones profesionales listos para usar]",
    "Elige el componente por su FUNCIÓN y varía el resultado según lo que pide el usuario (no repitas siempre la misma plantilla):",
  ];
  for (const e of elegidas) {
    partes.push(`■ ${e.title}\n${e.body}`);
  }
  let text = partes.join("\n\n");
  if (text.length > budgetChars) {
    // Si no cabe, deja el índice de títulos + la primera receta relevante entera.
    const indice = elegidas.map((e) => `• ${e.title}`).join("\n");
    const primera = elegidas[0] ? `\n\n■ ${elegidas[0].title}\n${elegidas[0].body}` : "";
    text = `[RECETARIO DE COMPONENTES WEB — índice]\n${indice}${primera}`;
    if (text.length > budgetChars) text = text.slice(0, budgetChars) + "\n[…recetario recortado: pide la receta por su título…]";
  }
  return text;
}

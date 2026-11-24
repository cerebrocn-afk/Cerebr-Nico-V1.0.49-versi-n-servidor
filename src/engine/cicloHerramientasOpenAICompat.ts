// ============================================================
// v1.45.0 — CICLO DE HERRAMIENTAS PARA PROVEEDORES OpenAI-compat
// ------------------------------------------------------------
// Módulo PURO (sin red, sin fs, sin estado global): sólo transforma datos.
// Aquí vive la parte verificable del bucle de herramientas de los proveedores
// con endpoint OpenAI-compatible (Z.ai/GLM, Groq, OpenRouter, Custom…):
//   1) ensamblar las `tool_calls` que llegan FRAGMENTADAS por el stream SSE,
//   2) construir los mensajes del transcript (assistant con tool_calls + las
//      respuestas role:"tool"),
//   3) parsear argumentos de forma tolerante.
//
// La parte NO pura (abrir el stream, llamar a executeToolCall, re-postear) vive
// en server.ts y sólo ORQUESTA llamando a estas funciones. Así se respeta el
// trinquete (server.ts casi no crece) y esta lógica queda testeable sin API.
//
// Formato de streaming OpenAI de tool_calls (lo que ensamblamos):
//   choices[0].delta.tool_calls = [
//     { index: 0, id: "call_x", type: "function",
//       function: { name: "write_file", arguments: "{\"path\":" } }, …
//   ]
// El `name` llega en el primer fragmento del índice; los `arguments` llegan
// trozo a trozo y hay que CONCATENARLOS por índice.
// ============================================================

// v1.58.4 — el guardián de sintaxis es PURO (CPU, sin red ni fs): se usa en el
// gate de auto-revisión del cierre (B4) para no cantar «hecho» sobre un archivo
// que quedó a medias.
import { guardFile, problemasBloqueantes } from "./syntaxGuard";
// v1.67.0 · FUSIÓN (HOJA DE RUTA-HUERFANOS, Prioridad 3 «enganche obvio y barato»).
// `jsonParcial.ts` llevaba desde v1.53.3 con su test en verde y ningún import:
// el ciclo tenía `parsearArgsConEstado` + `pareceTruncado` para Diagnosticar el
// JSON roto, pero ante un argumento COMPLETO y sólo mal formado (coma colgante,
// clave a medias, string sin cerrar) devolvía `{}` y el motor contestaba «faltan
// argumentos» mientras el modelo tenía la llamada casi entera delante. No se
// cablea aparte: se funde aquí, que es donde ya se tomaba la decisión.
import { repararJsonParcial } from "./jsonParcial";
// v1.67.0 · ÍTEM 1.2 — LA WEB ENTREGADA DE MOLDE. El defecto que el usuario
// reportó en v1.66.0 («deja las plantillas por defaut») tenía detector escrito y
// probado y NINGÚN llamador. Ver `revisarPlantillaWeb` más abajo.
import { detectarPlantillaPorDefecto, informePlantilla } from "./plantillaDefecto";

export interface AcumuladorToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Acumula (in-place) los fragmentos de tool_calls de UN delta SSE sobre un
 * mapa indexado. Idempotente respecto al orden de llegada de los trozos.
 */
export function acumularToolCallsDelta(
  acc: Map<number, AcumuladorToolCall>,
  deltaToolCalls: any[] | undefined | null
): void {
  if (!Array.isArray(deltaToolCalls)) return;
  for (const tc of deltaToolCalls) {
    const idx = typeof tc?.index === "number" ? tc.index : 0;
    const prev = acc.get(idx) || { id: "", name: "", arguments: "" };
    if (tc?.id) prev.id = tc.id;
    if (tc?.function?.name) prev.name = tc.function.name;
    if (typeof tc?.function?.arguments === "string") {
      prev.arguments += tc.function.arguments;
    }
    acc.set(idx, prev);
  }
}

/**
 * Cierra el acumulador: devuelve las llamadas en orden de índice, descartando
 * entradas sin nombre (fragmentos huérfanos).
 */
export function finalizarToolCalls(
  acc: Map<number, AcumuladorToolCall>
): AcumuladorToolCall[] {
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
    .filter((v) => v.name && v.name.trim().length > 0);
}

/**
 * Parseo tolerante de los argumentos (string JSON) de una herramienta.
 * Un modelo pequeño puede mandar "" o JSON roto: nunca debe tumbar el bucle.
 */
export function parsearArgsHerramienta(argStr: string | any): any {
  // v1.57.10 — mismo objeto-ya-parseado que arriba: si llega un objeto, es EL.
  if (argStr && typeof argStr === "object") return argStr;
  if (!argStr || !String(argStr).trim()) return {};
  try {
    return JSON.parse(argStr);
  } catch {
    return {};
  }
}

/**
 * Mensaje de transcript del turno del asistente que pidió herramientas
 * (formato OpenAI chat.completions).
 */
export function construirMensajeAsistenteConTools(
  content: string,
  toolCalls: AcumuladorToolCall[]
): any {
  return {
    role: "assistant",
    content: content || "",
    tool_calls: toolCalls.map((t, i) => ({
      id: t.id || `call_${i}`,
      type: "function",
      function: { name: t.name, arguments: t.arguments || "{}" },
    })),
  };
}

/**
 * Mensaje de respuesta de UNA herramienta (role:"tool"), enlazado por
 * tool_call_id al id de la llamada del asistente.
 */
export function construirMensajeRespuestaTool(
  toolCallId: string,
  nombre: string,
  contenido: string
): any {
  return {
    role: "tool",
    tool_call_id: toolCallId || `call_${nombre}`,
    name: nombre,
    content: typeof contenido === "string" ? contenido : String(contenido),
  };
}

/**
 * Extrae el objeto JSON de una línea SSE `data: {…}`. Devuelve null para
 * líneas vacías, comentarios, el centinela [DONE] o JSON ilegible.
 */
export function extraerDatosDeLineaSSE(linea: string): any | null {
  const t = (linea || "").trim();
  if (!t.startsWith("data:") || t.includes("[DONE]")) return null;
  try {
    return JSON.parse(t.slice(5).trim());
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.57.9 — LAZO DEL BUCLÉ Y ARGUMENTOS TRUNCADOS (el defecto de la sesión
// exportada del 14/10: «se quedó a mitad de la escritura» y «Detenido: se
// detectó un bucle» en CADA mensaje siguiente).
// ───────────────────────────────────────────────────────────────────────────
// Dos daños medidos en sesión real:
//  1) TRUNCAMIENTO: cuando el proveedor corta la respuesta por su tope de
//     tokens de salida, los `arguments` de la herramienta llegan a medias.
//     `parsearArgsHerramienta` devolvía `{}` y `write_file` se ejecutaba con
//     path vacío: el archivo NO se escribía (o se escribía roto), el modelo no
//     se enteraba y el turno moría «a mitad de la escritura». Ahora el corte
//     se DETECTA (JSON incompleto: llaves sin cerrar o texto sin terminar),
//     la llamada NO se ejecuta, y el modelo recibe la orden concreta de
//     dividir el archivo en partes (write_file + append_file).
//  2) LAZO CRUEL: tres llamadas idénticas mataban el turno ENTERO con un
//     mensaje de error, sin obra y sin explicación útil. El lazo nuevo es
//     firme pero NO letal: la 3ª repetición no ejecuta, devuelve al modelo el
//     resultado YA obtenido + directiva de cambiar de enfoque, y solo tras 3
//     intervenciones fallidas se cierra el turno — con informe honesto, no
//     con un «Detenido» seco.
// Toda esta lógica es PURA (sin red, sin fs): vive aquí para ser testeable.
// ═══════════════════════════════════════════════════════════════════════════

/** Estado mínimo de la guardia anti-repetición (clave consecutiva + veces). */
export interface EstadoRepeticion {
  clave: string;
  veces: number;
}

export const REPETICION_SIN_VER: EstadoRepeticion = { clave: "", veces: 0 };

/** A la misma clave consecutiva le suma 1; una clave distinta reinicia a 1. */
export function anotarRepeticion(prev: EstadoRepeticion, clave: string): EstadoRepeticion {
  return prev.clave === clave ? { clave, veces: prev.veces + 1 } : { clave, veces: 1 };
}

/** ¿En cuántas repeticiones idénticas empieza la intervención? */
export const UMBRAL_REPETICION = 3;
/** ¿Cuántas intervenciones anti-bucle se aguantan antes de cerrar honesto? */
export const TOPE_INTERVENCIONES = 3;

/** Resultado del parseo con estado: distingue JSON roto de JSON CORTADO. */
export interface ArgsConEstado {
  args: any;
  /** true si el JSON parseó entero (aunque el objeto venga vacío). */
  ok: boolean;
  /** true si todo apunta a que el stream se cortó a mitad de los argumentos. */
  truncado: boolean;
  crudo: string;
  /**
   * v1.67.0 · true si hubo que REPARAR el JSON para parsearlo. Se declara y no se
   * esconde: el motor ejecuta la llamada, pero el acta puede decir que el modelo
   * mandó un JSON mal formado (que es información de calidad del proveedor).
   */
  reparado?: boolean;
}

/**
 * `pareceTruncado` cuenta la profundidad de llaves/corchetes respetando
 * cadenas y escapes. Un documento CORTADO por el tope de tokens del proveedor
 * deja llaves sin cerrar o una cadena a medias; un JSON simply roto (basura
 * del modelo) suele cerrar llaves y fallar por otra cosa. No es una prueba
 * absoluta — es la mejor señal disponible sin preguntar al proveedor.
 */
export function pareceTruncado(s: string): boolean {
  let prof = 0;
  let enTexto = false;
  let escapado = false;
  for (const ch of s) {
    if (enTexto) {
      if (escapado) escapado = false;
      else if (ch === "\\") escapado = true;
      else if (ch === '"') enTexto = false;
      continue;
    }
    if (ch === '"') enTexto = true;
    else if (ch === "{" || ch === "[") prof++;
    else if (ch === "}" || ch === "]") prof--;
  }
  return enTexto || prof > 0;
}

/** Parseo con estado: lo que `parsearArgsHerramienta` no miraba: el POR QUÉ. */
export function parsearArgsConEstado(argStr: string | any): ArgsConEstado {
  // v1.57.10 — RAÍZ DEL «FALTAN ARGUMENTOS» de gemma4:31b-cloud (sesión 14/10,
  // mensajes 31-37): Ollama devuelve los arguments de algunos modelos YA COMO
  // OBJETO, no como string JSON. El parseador los trataba como string ilegible,
  // devolvía {} y el motor rechazaba TODAS las llamadas con «faltan campos»
  // mientras el modelo juraba —con razón— que su JSON estaba bien. Estaba bien:
  // nos lo pasaban traducido y lo estábamos tirando a la basura.
  if (argStr && typeof argStr === "object") {
    return { args: argStr, ok: true, truncado: false, crudo: JSON.stringify(argStr) };
  }
  const crudo = typeof argStr === "string" ? argStr : "";
  if (!crudo.trim()) return { args: {}, ok: true, truncado: false, crudo };
  try {
    return { args: JSON.parse(crudo), ok: true, truncado: false, crudo };
  } catch {
    const truncado = pareceTruncado(crudo);
    // v1.67.0 · FUSIÓN CON `jsonParcial` — sólo cuando NO está truncado.
    // Un argumento CORTADO por el techo de tokens del proveedor no se repara ni
    // se ejecuta: reconstruir el `}` final de un `write_file` a medias es escribir
    // un archivo truncado y cantarlo como «hecho». Eso ya lo cubre la directiva
    // de truncamiento, y se respeta intacta.
    // Lo que SÍ se recupera acá es el otro caso, el que no tenía arreglo: JSON
    // COMPLETO pero mal formado (coma colgante, clave a medias, string sin
    // cerrar). Hasta ahora devolvía `{}` → «faltan argumentos» → el modelo
    // insistía → bucle. Ahora la llamada sale adelante y se declara reparada.
    if (!truncado) {
      const rp = repararJsonParcial(crudo);
      if (rp.ok && rp.reparado && rp.valor && typeof rp.valor === "object") {
        console.log(`[bucle] args JSON mal formado REPARADO (${rp.texto.length}/${crudo.length} chars aprovechados)`);
        return { args: rp.valor, ok: true, truncado: false, crudo, reparado: true };
      }
    }
    return { args: {}, ok: false, truncado, crudo };
  }
}

/** Herramientas que ESCRIBEN obra: cada una que sale bien gana presupuesto. */
export function esHerramientaDeObra(nombre: string): boolean {
  return /^(write_file|edit_file|append_file|create_file|crear_archivo)$/i.test(String(nombre));
}

/**
 * Pasos con obra: la base (12) crece +2 por cada escritura que salió bien,
 * topada en 36. Así una tarea de 15 archivos no muere al paso 8 — que era
 * EXACTAMENTE el «se queda a mitad» de la sesión del 14/10 — mientras un
 * modelo que no escribe nada sigue cortándose barato.
 */
// v1.0.14 · REGRESIÓN DEL CORTE A 3-4 MIN (Mario, 10/11: «antes el modelo
// trabajaba más de 20 minutos»). Con base 12 y cada vuelta de LLM+herramienta
// costando ~15 s, el turno moría a los ~3 minutos JUSTO cuando la v1.66.x
// prometía tandas largas: el tope de 36 no cubría una sesión de test-and-fix
// (12 ejecuciones de suite + 12 lecturas + 12 escrituras = 36 y ni un paso de
// margen). La casa vuelve al presupuesto histórico (≥40) y lo deja CRECER con
// el progreso real hasta 96; las guardas anti-bucle (repetición, relectura
// estéril, ciclo A-B-A-B, fallos seguidos) siguen siendo la frontera real, no
// el reloj.
export function techoPasosConObra(escriturasOk: number, base = 24, tope = 96): number {
  const b = Math.max(2, Math.floor(base) || 24);
  const t = Math.max(b, Math.floor(tope) || 96);
  return Math.min(t, b + 2 * Math.max(0, Math.floor(escriturasOk) || 0));
}

/**
 * v1.66.1 · PASOS COMPRADOS POR PROGRESO — el arreglo del «me traba en la mitad».
 * ==============================================================================
 * RAÍZ (sesión exportada 1792723545252, 23/10, cinco turnos seguidos): el pedido
 * era «reporte de sistemas de versión». El motor ejecutaba `pc_exec` y
 * `pc_list_dir` de VERDAD, y a la vuelta 12 cortaba con
 * «⏳ Quedaban acciones pendientes (…) cuando se agotó el presupuesto de pasos».
 * El usuario escribía «sigue», el turno volvía a arrancar desde cero, y vuelta a
 * pasar. Cinco veces. «no te tranques», «porque te cortas», «te quedastes
 * trancado hace rato».
 *
 * La guarda de presupuesto existía PARA el bucle, pero estaba atada a una sola
 * señal: `esHerramientaDeObra()` — escritura. Un REPORTE, un diagnóstico o una
 * revisión leen quince archivos y no escriben ninguno. Esos quince pasos son
 * progreso real (cada lectura devolvió algo distinto), pero para el motor eran
 * metros cuadrados de nada: el techo seguía en 12 y la tarea moría a mitad.
 *
 * `techoPasosConProgreso` paga también la LECTURA, con dos condiciones para que
 * no se convierta en el bucle que pretendía cortar:
 *   · sólo cuentan las llamadas SANAS y DISTINTAS (quien llama dos veces a lo
 *     mismo no avanza, y la guardia de repetición ya lo está cazando);
 *   · su aporte está topado (`PASOS_MAX_POR_LECTURA`) y el techo duro del turno
 *     sigue siendo el mismo de siempre. Así un explorador empedernido tampoco
 *     puede quedarse leyendo para siempre.
 */
export const PASOS_MAX_POR_LECTURA = 24;

// v1.0.14 · LA EJECUCIÓN SANATA TAMBIÉN ES OBRA. La sesión 1794293050619 lo
// mostró cinco veces: el agente corre `pc_exec` (validar, lint, node test) y
// cada vuelta es trabajo real, pero para el presupuesto era tan invisible
// como una lectura. Con contador propio y tope propio, una tanda de test-and-
// fix compra sus pasos sin abrir la puerta a un bucle de comandos idénticos
// (la clave única es la condición de siempre).
export const HERRAMIENTAS_DE_EJECUCION = new Set([
  "exec", "pc_exec", "run_command", "ejecutar", "shell",
]);
export function esHerramientaDeEjecucion(nombre: string): boolean {
  return HERRAMIENTAS_DE_EJECUCION.has(String(nombre || "").trim().toLowerCase());
}
export const PASOS_MAX_POR_EJECUCION = 24;

export function techoPasosConProgreso(
  escriturasOk: number,
  lecturasNuevasOk: number,
  ejecucionesOk = 0,
  base = 24,
  tope = 96,
): number {
  const b = Math.max(2, Math.floor(base) || 24);
  const t = Math.max(b, Math.floor(tope) || 96);
  const porObra = 2 * Math.max(0, Math.floor(escriturasOk) || 0);
  const porLectura = Math.min(PASOS_MAX_POR_LECTURA, Math.max(0, Math.floor(lecturasNuevasOk) || 0));
  const porEjecucion = Math.min(PASOS_MAX_POR_EJECUCION, Math.max(0, Math.floor(ejecucionesOk) || 0));
  return Math.min(t, b + porObra + porLectura + porEjecucion);
}

/** La orden que recibe el modelo cuando sus argumentos llegaron cortados. */
export const DIRECTIVA_TRUNCAMIENTO =
  "⛔ TUS ARGUMENTOS LLEGARON TRUNCADOS (se acabaron los tokens de salida a mitad de la llamada). " +
  "La herramienta NO se ejecutó y el archivo NO cambió. No reintentes el archivo entero: " +
  "escribe la PRIMERA PARTE con write_file (contenido más corto) y añade el resto con append_file, " +
  "una parte por turno, o aplica cambios puntuales con edit_file. Si el pedido no cabe, dime qué parte dejo para el siguiente turno.";

// ═══════════════════════════════════════════════════════════════════════════
// v1.58.4 — B3: PROTOCOLO DE ENTREGA INCREMENTAL PARA CONTENIDO (no solo args).
// ───────────────────────────────────────────────────────────────────────────
// RAÍZ (queja de Mario, «se corta y se pierde todo»): ante una tarea grande
// (muchos archivos o una respuesta larga) el modelo intenta volcar TODO de una
// sola vez; si el proveedor corta por tope de tokens a mitad, la obra en curso
// se pierde entera. `DIRECTIVA_TRUNCAMIENTO` ya cubría el caso de ARGUMENTOS a
// medias; esto extiende la misma idea al CONTENIDO: entregar por partes
// explícitas y CERRAR cada parte de forma completa, de modo que un corte sólo
// pierda la parte en curso y nunca lo ya escrito.
//
// Es una DIRECTIVA (no cambia la lógica del bucle): se inyecta UNA vez, cuando
// la tarea YA dio señales de ser grande, para no gravar las tareas pequeñas.
// ═══════════════════════════════════════════════════════════════════════════
export const DIRECTIVA_ENTREGA_INCREMENTAL =
  "📦 ENTREGA POR PARTES — esta tarea es grande (varios archivos / respuesta larga). " +
  "NO intentes volcar todo en una sola respuesta: el proveedor puede cortar por tokens y perderías la obra en curso. " +
  "Trabaja en PARTES pequeñas y COMPLETAS: 1) un archivo (o un bloque) por vez con write_file/append_file; " +
  "2) cierra cada archivo entero y sintácticamente válido antes de pasar al siguiente — nada de «…resto igual» ni TODO/FIXME; " +
  "3) tras cada parte, en UNA línea di qué queda y sigue tú mismo con la parte siguiente, sin pedir permiso. " +
  "Así, si algo se corta, lo ya escrito queda guardado y sólo se reanuda la parte en curso.";

/**
 * Señal, puramente determinista, de que la tarea del turno es GRANDE y conviene
 * activar el protocolo de entrega incremental: ya hubo ≥ 2 escrituras sanas, o
 * el proveedor ya cortó por tokens al menos una vez. Pura y testeable.
 */
export function tareaPareceGrande(escriturasOk: number, continuacionesCorte: number): boolean {
  return (Math.floor(escriturasOk) || 0) >= 2 || (Math.floor(continuacionesCorte) || 0) >= 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.58.4 — B4: GATE DE AUTO-REVISIÓN ANTES DE CERRAR EL TURNO.
// ───────────────────────────────────────────────────────────────────────────
// Antes de cantar «hecho» cuando SE EJECUTARON herramientas, el turno se revisa
// a sí mismo: ¿algún archivo escrito este turno quedó incompleto / truncado /
// con marcadores de relleno? Reutiliza `guardFile` + `problemasBloqueantes`
// (syntaxGuard) — defensa en profundidad: aunque la ruta de escritura ya
// valide, aquí se vuelve a comprobar el estado FINAL de cada archivo del turno.
// Si hay obra sospechosa, el bucle empuja UNA continuación dirigida («termina
// ese archivo») en vez de cerrar; es acotado (`MAX_AUTORREVISION`), nunca bucle.
// ═══════════════════════════════════════════════════════════════════════════
/** Tope de auto-revisiones por turno (empujar «termina lo que falta»). */
export const MAX_AUTORREVISION = 2;

export interface ObraSospechosa {
  path: string;
  motivo: string;
}

/**
 * Revisa el estado FINAL de cada archivo escrito en el turno y devuelve los que
 * el guardián de sintaxis marca como bloqueantes (incompletos/truncados). Un
 * fallo del propio guard NO cuenta como obra sospechosa (no bloquea de más).
 */
export function revisarObraEscrita(
  escritos: Array<{ path: string; content: string }>
): ObraSospechosa[] {
  const out: ObraSospechosa[] = [];
  const vistos = new Set<string>();
  for (const e of escritos) {
    if (!e || typeof e.path !== "string" || !e.path.trim()) continue;
    if (typeof e.content !== "string") continue;
    if (vistos.has(e.path)) continue;
    vistos.add(e.path);
    try {
      // v1.66.0 — un archivo que arranca con el VOLCADO CRUDO de una tool-call
      // (`edit_file path="…" …`) no es código válido aunque el guard de sintaxis
      // no lo marque: se bloquea aquí, antes de que se quede como obra final.
      if (pareceVolcadoDeLlamada(e.content)) {
        out.push({
          path: e.path,
          motivo: "el contenido es el VOLCADO CRUDO de una tool-call en estilo atributo (edit_file/write_file …) — el parser no la reconoció y la escribió literal",
        });
        continue;
      }
      const r = guardFile(e.path, e.content);
      const bloq = problemasBloqueantes(r);
      if (bloq.length > 0) {
        out.push({
          path: e.path,
          motivo: bloq.slice(0, 2).map((i) => i.message).join("; "),
        });
      }
    } catch {
      /* el guard reventó: no acusamos obra sospechosa por eso. */
    }
  }
  return out;
}

/** La orden de auto-revisión: terminar los archivos que quedaron a medias. */
export function directivaAutorrevision(sospechosas: ObraSospechosa[]): string {
  const lista = sospechosas
    .slice(0, 4)
    .map((s) => `  • ${s.path}: ${s.motivo}`)
    .join("\n");
  return (
    "🔎 AUTO-REVISIÓN — antes de cerrar detecté archivo(s) que quedaron INCOMPLETOS este turno:\n" +
    lista +
    "\nNo cierres aún: vuelve a escribir ESE archivo COMPLETO con write_file (o complétalo con append_file / edit_file), " +
    "sin marcadores de relleno («…», «resto igual», TODO/FIXME) y cerrando toda llave/paréntesis/etiqueta. Luego sí, cierra."
  );
}

/**
 * v1.67.0 · ÍTEM 1.2 DE LA HOJA DE RUTA-HUERFANOS — LA WEB QUE LLEGA DE MOLDE.
 * ==========================================================================
 * RAÍZ (reportada por el usuario en v1.66.0, chat `futuristic.web`): el motor
 * genera una web y la entrega en plantilla — «Descripción de …», lorem ipsum,
 * secciones sólo con el título, imágenes a `via.placeholder.com`. `plantillaDefecto.ts`
 * se escribió ESE MISMO día con su detector y su test… y sin una sola llamada.
 *
 * POR QUÍ NO LO VEÍA EL GATE DE SIEMPRE: `revisarObraEscrita` juzga INTEGRIDAD
 * (¿el archivo está truncado? ¿es el volcado de una tool-call? ¿compila?). Un
 * HTML que SÍ existe, SÍ cierra y SÍ enlaza pasa entero — lo que está incompleto
 * no es el archivo, es su CONTENIDO. Son ejes distintos y por eso van sueltos.
 *
 * CONDICIÓN DE LA HOJA DE RUTA, respetada: sólo obra del creador web. Un `.html`
 * suelto con un `<!-- TODO -->` legítimo (una hoja de estilos, un snippet) NO es
 * una plantilla sin llenar, y no se le echa encima una revisión que no pidió.
 */
export function esObraWeb(path: string, content: string): boolean {
  if (!/\.x?html?$/i.test(String(path || ""))) return false;
  const cab = String(content || "").slice(0, 4096).toLowerCase();
  return cab.includes("<!doctype html") || cab.includes("<html");
}

/**
 * Los HTML del turno cuyo contenido sigue siendo andamio. Devuelve el acta lista
 * para inyectar (no un booleano: el modelo necesita saber QUÉ quedó de molde, que
 * es justo lo que `informePlantilla` enumera).
 */
export function revisarPlantillaWeb(
  escritos: Array<{ path: string; content: string }>,
  nombreProyecto?: string,
): Array<{ path: string; informe: string }> {
  const out: Array<{ path: string; informe: string }> = [];
  const vistos = new Set<string>();
  for (const e of escritos || []) {
    if (!e || typeof e.path !== "string" || !e.path.trim()) continue;
    if (typeof e.content !== "string" || vistos.has(e.path)) continue;
    vistos.add(e.path);
    if (!esObraWeb(e.path, e.content)) continue;
    const v = detectarPlantillaPorDefecto(e.content, nombreProyecto);
    if (!v.ok) out.push({ path: e.path, informe: informePlantilla(v) });
  }
  return out;
}

/** La orden que recibe el modelo cuando repitió la misma llamada ≥ umbral. */
export function directivaRepeticion(nombre: string, veces: number, salidaPrevia: string): string {  const eco = salidaPrevia ? `\nResultado que YA obtuviste:\n${salidaPrevia.slice(0, 700)}` : "";
  return (
    `⚠️ Llamada REPETIDA ${veces} veces idéntica (${nombre}). No se volvió a ejecutar. ` +
    "Repetir lo mismo no cambia el resultado: cambia de enfoque (otra herramienta, otros argumentos, " +
    "o responde ya con lo que sepas)." + eco
  );
}

/** El cierre honesto cuando la guardia agotó sus intervenciones. */
export function cierrePorLazoAgotado(nombre: string): string {
  return (
    `\n\n⚠️ **El modelo se insistió en la misma llamada (${nombre}) y cerré el turno para no dar vueltas.** ` +
    "Lo escrito hasta ahora quedó en el proyecto. Reintenta con un pedido más concreto " +
    "(un archivo o un paso cada vez) o cambia de modelo: algunos se enganchan repitiendo la misma herramienta."
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.60.17 — CIRCUITO DE REESCRITURA IDÉNTICA (sesión pacman del 20/10).
// ───────────────────────────────────────────────────────────────────────────
// RAÍZ medida: el Quirófano rechaza con «REESCRITURA IDÉNTICA» cuando el modelo
// reescribe un archivo byte-a-byte igual al de disco. El lazo suave
// (anotarRepeticion) NO lo caza cuando el modelo ROTA entre varios archivos
// (index.html → style.css → script.js → index.html …): cada clave es distinta,
// nunca llega al umbral CONSECUTIVO, y el turno gira hasta agotar los pasos
// mientras el Quirófano rechaza cientos de veces. Consecuencias reales en el
// log de Mario: el watchdog cerró a los 180 s, los mensajes se apilaron (chat
// «no me deja escribir más») y el audio de ambiente sonó en bucle sin parar.
// Este contador es por TURNO y cuenta los rechazos idénticos en CUALQUIER
// archivo: en cuanto el modelo demuestra que está dando vueltas reescribiendo
// igual, se corta el turno con un informe honesto en vez de seguir girando.
// Puro/testeable: sin red ni fs.
// ═══════════════════════════════════════════════════════════════════════════

/** Rechazos «REESCRITURA IDÉNTICA» (en cualquier archivo) que se toleran por turno. */
export const TOPE_REESCRITURA_IDENTICA = 3;

/** ¿La salida de una herramienta es el rechazo «REESCRITURA IDÉNTICA» del Quirófano? */
export function esRechazoReescrituraIdentica(salida: string): boolean {
  return typeof salida === "string" && /REESCRITURA ID[EÉ]NTICA/i.test(salida);
}

/** El cierre honesto cuando el modelo insiste en reescribir archivos sin cambiarlos. */
export function cierrePorReescrituraIdentica(rutas: string[]): string {
  const lista = Array.from(new Set((rutas || []).filter(Boolean))).slice(0, 5).join(", ");
  return (
    `\n\n⚠️ **Corté el turno: el modelo reescribió ${lista || "los mismos archivos"} con un contenido byte-a-byte IDÉNTICO al que ya estaba en disco, una y otra vez, sin cambiar nada.** ` +
    "Repetir la misma escritura no arregla el error. Pídemelo otra vez señalando EXACTO qué debe cambiar (el síntoma concreto), " +
    "o cambia a un modelo más capaz: algunos se enganchan reescribiendo igual y no leen el archivo antes de tocarlo."
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.57.10 — VIGILANTE DE FALLOS DE ARGUMENTOS (sesión gemma4 del 14/10,
// mensajes 31-37: el modelo EMITÍA las llamadas pero los argumentos llegaban
// vacíos; el motor las rechazaba una y otra vez con «faltan campos
// obligatorios» y el modelo, ciego, las reintentaba para siempre. El lazo
// suave de v1.57.9 no lo cazaba porque cada intento traía una clave
// ligeramente distinta. La salida real: cuando 3 llamadas seguidas mueren por
// problemas de ARGUMENTOS, el problema es del modelo con el formato de
// herramientas — y seguir pasándole las definiciones es alimentar el bucle.)
// ═══════════════════════════════════════════════════════════════════════════

export interface VigilanteArgs {
  /** Fallos CONSECUTIVOS cuya causa son los argumentos (cualquier éxito lo pone a 0). */
  seguidos: number;
}

export const nuevoVigilanteArgs = (): VigilanteArgs => ({ seguidos: 0 });

/** Umbral a partir del cual se retiran las herramientas del request. */
export const UMBRAL_SIN_HERRAMIENTAS = 3;

// Un fallo de herramienta normal («no existe el archivo», «puerto ocupado»)
// NO cuenta: solo los que gritan que faltan/son inválidos los ARGUMENTOS.
const PATRON_FALLO_ARGS =
  /faltan?\b|missing\b|required\b|invalid (arguments|params)|argumentos|sin (?:el )?argumento|no se (?:recibió|recibio)/i;

/**
 * Registra el resultado de una llamada. Devuelve `cortaHerramientas` cuando
 * hay que dejar de ofrecer herramientas al modelo (3 fallos de argumentos
 * seguidos). La directiva se inyecta UNA vez, en el instante exacto en que se
 * cruza el umbral (`justoAlCruzarlo`).
 */
export function registrarFalloArgs(
  v: VigilanteArgs,
  isError: boolean,
  salida: string
): { seguidos: number; cortoHerramientas: boolean; justoAlCruzarlo: boolean } {
  if (!isError) {
    v.seguidos = 0;
    return { seguidos: 0, cortoHerramientas: false, justoAlCruzarlo: false };
  }
  if (!PATRON_FALLO_ARGS.test(String(salida || ""))) {
    return { seguidos: v.seguidos, cortoHerramientas: false, justoAlCruzarlo: false };
  }
  v.seguidos++;
  return {
    seguidos: v.seguidos,
    cortoHerramientas: v.seguidos >= UMBRAL_SIN_HERRAMIENTAS,
    justoAlCruzarlo: v.seguidos === UMBRAL_SIN_HERRAMIENTAS,
  };
}

export const DIRECTIVA_SIN_HERRAMIENTAS =
  "⚠️ Tus últimas 3 llamadas a herramientas llegaron SIN ARGUMENTOS UTILIZABLES. " +
  "No reintentes ninguna herramienta más en este turno: responde SOLO EN TEXTO. " +
  "Di en 3 líneas qué intentabas, qué conseguiste y qué falta. El usuario puede " +
  "elegir otro modelo (los hay que fallan el formato de herramientas) o pedirte " +
  "el trabajo en pasos de un solo archivo.";

// ═══════════════════════════════════════════════════════════════════════════
// v1.58.2 — HERRAMIENTAS EMITIDAS COMO TEXTO (sesión openrouter/free del
// 16/10, mensajes 5/9/23/37/41/43/45: «no tienes acceso al editor y al
// sandbox», «los mcp no deben de estar funcionando correctamente»).
// ───────────────────────────────────────────────────────────────────────────
// RAÍZ MEDIDA EN SESIÓN REAL: con `openrouter/free` (y, en general, con
// modelos que NO hacen function-calling nativo por el canal OpenAI
// `delta.tool_calls`) el modelo QUIERE llamar herramientas pero las ESCRIBE
// EN EL TEXTO del chat, en formatos variados:
//   1) Bloque cercado con el nombre en la info-string:
//        ```cerebronico:write_file
//        {"ruta":"index.html","contenido":"…"}
//        ```
//   2) Pseudo-XML que escupen algunos modelos free:
//        <dots_function_call>
//        <list_files>
//        </invoke>
//        </dots_function_call>
//   3) Nombre pelado + JSON en la línea siguiente:
//        list_dir
//        { "path": "" }
// El parser nativo (`acumularToolCallsDelta`) NUNCA ve estas llamadas: viajan
// por `delta.content`, no por `delta.tool_calls`. Resultado: la herramienta
// jamás corre, el sandbox nunca cambia, y el usuario ve al modelo jurar que
// "escribió el archivo" mientras la pantalla sigue igual. El modelo tiene
// razón —emitió la llamada—; lo que faltaba era CAPTURARLA desde el texto y
// ejecutarla de verdad. Toda esta lógica es PURA (sin red, sin fs): vive aquí
// para ser testeable sin API.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alias de NOMBRE de herramienta que los modelos free inventan hacia el
 * nombre canónico del registro. `list_dir`/`ls` no existen: la herramienta de
 * verdad es `list_files`; `create_file` es `write_file`; etc. Un alias que no
 * esté aquí NO se traduce (si tampoco es un nombre válido, la llamada textual
 * se descarta — mejor ignorar que ejecutar basura).
 */
export const ALIAS_NOMBRE_HERRAMIENTA: Record<string, string> = {
  list_dir: "list_files",
  listdir: "list_files",
  ls: "list_files",
  list_directory: "list_files",
  dir: "list_files",
  create_file: "write_file",
  crear_archivo: "write_file",
  escribir_archivo: "write_file",
  writefile: "write_file",
  borrar_archivo: "delete_file",
  eliminar_archivo: "delete_file",
  deletefile: "delete_file",
  leer_archivo: "read_file",
  readfile: "read_file",
  ejecutar: "run_command",
  shell: "run_command",
  bash: "run_command",
  terminal: "run_command",
};

/**
 * Alias de CAMPO de argumento (los modelos en español mandan `ruta`,
 * `contenido`, `comando`…) hacia la clave que exige el esquema del motor
 * (`path`, `content`, `command`…). Las claves ya canónicas se dejan intactas.
 */
export function normalizarArgsAlias(args: any): any {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const mapa: Record<string, string> = {
    ruta: "path",
    archivo: "path",
    fichero: "path",
    ruta_archivo: "path",
    contenido: "content",
    texto: "content",
    cuerpo: "content",
    comando: "command",
    cmd: "command",
    instruccion: "command",
    buscar: "find",
    reemplazar: "replace",
    consulta: "query",
  };
  const out: any = {};
  for (const [k, v] of Object.entries(args)) {
    const canon = mapa[k.toLowerCase()] || k;
    // No pisar una clave canónica ya presente con su alias (gana la canónica).
    if (!(canon in out) || out[canon] === undefined || out[canon] === "") out[canon] = v;
  }
  return out;
}

/** Resuelve un nombre textual al canónico si es válido (vía alias). */
export function normalizarNombreHerramienta(
  nombre: string,
  nombresValidos: Set<string>
): string | null {
  const n = String(nombre || "").trim().toLowerCase();
  if (!n) return null;
  if (nombresValidos.has(n)) return n;
  const alias = ALIAS_NOMBRE_HERRAMIENTA[n];
  if (alias && nombresValidos.has(alias)) return alias;
  return null;
}

/**
 * Extrae el PRIMER objeto JSON balanceado de un texto (respetando cadenas y
 * escapes). Devuelve la subcadena `{…}` o null si no hay uno completo.
 */
export function extraerPrimerJSON(s: string): string | null {
  const txt = String(s || "");
  const ini = txt.indexOf("{");
  if (ini < 0) return null;
  let prof = 0;
  let enTexto = false;
  let escapado = false;
  for (let i = ini; i < txt.length; i++) {
    const ch = txt[i];
    if (enTexto) {
      if (escapado) escapado = false;
      else if (ch === "\\") escapado = true;
      else if (ch === '"') enTexto = false;
      continue;
    }
    if (ch === '"') enTexto = true;
    else if (ch === "{") prof++;
    else if (ch === "}") {
      prof--;
      if (prof === 0) return txt.slice(ini, i + 1);
    }
  }
  return null; // llave sin cerrar → JSON cortado/incompleto
}

/**
 * Parsea las llamadas a herramientas que un modelo escribió EN EL TEXTO
 * (porque no usa el canal nativo `tool_calls`). Reconoce los tres formatos
 * medidos en sesión real. Solo devuelve llamadas cuyo nombre resuelve a una
 * herramienta VÁLIDA (vía `nombresValidos` + alias): así un bloque ```html o
 * un fragmento de prosa no se confunden con una llamada.
 *
 * Devuelve las `llamadas` listas para ejecutar (con args ya normalizados y
 * serializados a string JSON, igual que las nativas) y el `textoLimpio` sin
 * los bloques de llamada (para no re-mostrar al usuario el pseudo-código).
 */
// ═══════════════════════════════════════════════════════════════════════════
// v1.60.11 — DOS FORMATOS NUEVOS medidos en la sesión openrouter/free del
// 19/10 («arranco así, atascado y no reconoce las herramientas»). El modelo
// QUERÍA llamar herramientas pero las escribía en formatos que el fallback de
// v1.58.x no reconocía, así que la herramienta jamás corría y el turno moría en
// «las herramientas no están disponibles para mí»:
//   4) ENVOLTURA DE TOKENS ESPECIALES — varios tunes free (Qwen/Hermes/
//      DeepSeek) envuelven la llamada entre marcadores de token:
//        <|tool_call_start|>[/check-ports()]<|tool_call_end|>
//      Por dentro usan sintaxis de PARÉNTESIS o JSON-nombre.
//   5) SINTAXIS DE PARÉNTESIS suelta (con o sin corchetes/barra inicial):
//        write_file({"path":"x","content":"y"})   [list_files()]   /read_file({…})
// Ambos son PUROS/testeables: viven aquí, sin red ni fs.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Marcadores de envoltura de tool-calls (el contenido REAL va por dentro).
 * Solo hay que reconocerlos para extraer la llamada y no re-mostrar el ruido.
 */
export const RE_ENVOLTURAS_TOKENS: RegExp[] = [
  /<\|tool_call_start\|>([\s\S]*?)<\|tool_call_end\|>/g,
  /<\|tool_calls_begin\|>([\s\S]*?)<\|tool_calls_end\|>/g,
  /<tool_call>([\s\S]*?)<\/tool_call>/g,
];

/**
 * Extrae llamadas escritas con SINTAXIS DE PARÉNTESIS: `nombre({json})`,
 * `[nombre({json})]`, `/nombre()`… El nombre puede venir entre corchetes y/o
 * con una barra inicial (estilo slash-command). Los argumentos entre paréntesis
 * son un objeto JSON balanceado (o vacío). Devuelve también los `spans`
 * consumidos para poder limpiarlos del texto visible. Solo cuaja si el nombre
 * resuelve a una herramienta VÁLIDA (vía alias): así `revisar(algo)` en prosa
 * no se confunde con una llamada.
 */
export function extraerLlamadasParen(
  texto: string,
  nombresValidos: Set<string>
): { llamadas: AcumuladorToolCall[]; spans: Array<[number, number]> } {
  const llamadas: AcumuladorToolCall[] = [];
  const spans: Array<[number, number]> = [];
  const txt = String(texto || "");
  let seq = 0;
  const reAbre = /\[?[ \t]*\/?[ \t]*([a-zA-Z_][\w-]*)[ \t]*\(/g;
  let m: RegExpExecArray | null;
  while ((m = reAbre.exec(txt)) !== null) {
    const nombre = normalizarNombreHerramienta(m[1], nombresValidos);
    if (!nombre) continue;
    const parenPos = m.index + m[0].length - 1; // índice del '('
    const resto = txt.slice(parenPos + 1);
    const trimmed = resto.replace(/^\s*/, "");
    let args: any = {};
    let finSpan: number;
    if (trimmed.startsWith("{")) {
      const js = extraerPrimerJSON(resto);
      if (!js) continue; // JSON cortado: no inventamos la llamada
      try { args = normalizarArgsAlias(JSON.parse(js)); } catch { args = {}; }
      let k = parenPos + 1 + resto.indexOf(js) + js.length;
      while (k < txt.length && " \t\n\r)]".includes(txt[k])) k++;
      finSpan = k;
    } else {
      const cierre = txt.indexOf(")", parenPos);
      if (cierre < 0) continue; // paréntesis sin cerrar → llamada incompleta
      let k = cierre + 1;
      while (k < txt.length && " \t]".includes(txt[k])) k++;
      finSpan = k;
    }
    llamadas.push({ id: `par_${seq++}`, name: nombre, arguments: JSON.stringify(args) });
    spans.push([m.index, finSpan]);
    reAbre.lastIndex = finSpan;
  }
  return { llamadas, spans };
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.66.0 — FORMATO 6: TOOL-CALL EN ESTILO ATRIBUTO  (`name clave="valor" …`).
// ───────────────────────────────────────────────────────────────────────────
// RAÍZ (sesión mistral-code-fim del 22/10 — consola + export del chat): el
// modelo NO emitía sus llamadas en ninguno de los cinco formatos anteriores
// (cercado, pseudo-XML, nombre+JSON, envoltura de tokens, paréntesis), sino
// como ATRIBUTOS tipo HTML en UNA sola pieza de texto:
//     edit_file path="web/css/sections.css" find="body" replace="…css…"
//     write_file path="web/css/animations.css" content="…css…"
// Como el parser no lo reconocía, la llamada NUNCA se ejecutaba y —peor— el
// VOLCADO CRUDO terminaba escrito como contenido del archivo: `css/sections.css`
// arrancaba con el literal `edit_file path="…" find="body" replace="` y el sitio
// salía roto (las letras del hero por detrás de la imagen de la captura).
//
// El valor se lee tolerando comillas internas (CSS/HTML/SVG van LLENOS de `"`):
// una comilla SOLO cierra el valor si lo que sigue es fin de texto, la siguiente
// CLAVE CANÓNICA conocida (`content=`, `replace=`…) o un cierre de code-fence.
// Así `width="100"`, `viewBox="0 0 100 100"` o `fill="white"` de un SVG dentro
// del contenido NO parten el valor. Puro y testeable: sin red ni fs.
// ═══════════════════════════════════════════════════════════════════════════

/** Claves de argumento que una tool-call en estilo atributo puede traer
 *  (canónicas + alias en español, los mismos que entiende `normalizarArgsAlias`). */
export const CLAVES_ATRIBUTO_HERRAMIENTA = new Set<string>([
  "path", "content", "find", "replace", "command", "query",
  "ruta", "archivo", "fichero", "ruta_archivo",
  "contenido", "texto", "cuerpo",
  "comando", "cmd", "instruccion",
  "buscar", "reemplazar", "consulta",
]);

/** Desescapa `\"` y `\\` dentro de un valor entre comillas. */
function desescaparValorAtributo(s: string): string {
  return s.replace(/\\(["\\])/g, "$1");
}

/** ¿`resto` arranca con una clave de atributo CANÓNICA (`algo="`)? */
function siguienteEsClaveAtributo(resto: string): string | null {
  const m = resto.match(/^([a-zA-Z_]+)[ \t]*=[ \t]*"/);
  if (m && CLAVES_ATRIBUTO_HERRAMIENTA.has(m[1].toLowerCase())) return m[1].toLowerCase();
  return null;
}

/**
 * Lee el valor de un atributo entre comillas a partir de `i` (primer carácter
 * del valor, justo tras la comilla de apertura). Tolera comillas internas: solo
 * CIERRA ante fin de texto, la siguiente clave canónica, o un cierre de
 * code-fence (```). Devuelve el valor desescapado y `fin` = índice tras la
 * comilla de cierre (o `txt.length` si el valor quedó abierto al final).
 */
export function leerValorAtributo(txt: string, i: number): { valor: string; fin: number } {
  for (let p = i; p < txt.length; p++) {
    const ch = txt[p];
    if (ch === "\\") { p++; continue; } // respeta el escape \" o \\
    if (ch !== '"') continue;
    let k = p + 1;
    while (k < txt.length && " \t\r\n".includes(txt[k])) k++;
    const resto = txt.slice(k);
    const esCierre =
      k >= txt.length ||
      !!siguienteEsClaveAtributo(resto) ||
      resto.startsWith("```");
    if (esCierre) return { valor: desescaparValorAtributo(txt.slice(i, p)), fin: p + 1 };
  }
  return { valor: desescaparValorAtributo(txt.slice(i)), fin: txt.length };
}

/**
 * FORMATO 6 — extrae tool-calls en estilo atributo del texto. Devuelve las
 * llamadas y los tramos [ini,fin) que ocupan (para borrarlas del texto visible).
 */
export function extraerLlamadasAtributos(
  texto: string,
  nombresValidos: Set<string>
): { llamadas: AcumuladorToolCall[]; spans: Array<[number, number]> } {
  const llamadas: AcumuladorToolCall[] = [];
  const spans: Array<[number, number]> = [];
  const txt = String(texto || "");
  // nombre de herramienta  +  primera clave ="  (precedido de inicio/espacio/cercos)
  const reInicio = /(^|[\s`>\[\](){}\/])([a-zA-Z_][\w-]*)[ \t]+([a-zA-Z_]+)[ \t]*=[ \t]*"/g;
  let m: RegExpExecArray | null;
  while ((m = reInicio.exec(txt)) !== null) {
    const nombre = normalizarNombreHerramienta(m[2], nombresValidos);
    if (!nombre) { reInicio.lastIndex = m.index + m[0].length; continue; }
    const clave0 = m[3].toLowerCase();
    if (!CLAVES_ATRIBUTO_HERRAMIENTA.has(clave0)) { reInicio.lastIndex = m.index + m[0].length; continue; }
    const iniSpan = m.index + m[1].length;
    let i = m.index + m[0].length; // tras la comilla de apertura del 1er valor
    const args: Record<string, string> = {};
    let clave = clave0;
    let finSpan = i;
    while (true) {
      const { valor, fin } = leerValorAtributo(txt, i);
      args[clave] = valor;
      finSpan = fin;
      let k = fin;
      while (k < txt.length && " \t\r\n".includes(txt[k])) k++;
      const sig = siguienteEsClaveAtributo(txt.slice(k));
      if (sig) {
        clave = sig;
        i = k + txt.slice(k).match(/^[a-zA-Z_]+[ \t]*=[ \t]*"/)![0].length;
        continue;
      }
      // consumir un cierre de code-fence pegado, si lo hay
      if (txt.slice(k, k + 3) === "```") k += 3;
      finSpan = Math.max(finSpan, k);
      break;
    }
    if (!Object.keys(args).length) { reInicio.lastIndex = finSpan; continue; }
    const norm = normalizarArgsAlias(args);
    llamadas.push({ id: `atr_${llamadas.length}`, name: nombre, arguments: JSON.stringify(norm) });
    spans.push([iniSpan, finSpan]);
    reInicio.lastIndex = finSpan;
  }
  return { llamadas, spans };
}

/**
 * ¿Este contenido es en realidad el VOLCADO CRUDO de una tool-call en estilo
 * atributo (p. ej. un archivo que arranca con `edit_file path="…" replace="`)?
 * Defensa en profundidad: aunque el parseo fallara, el gate de auto-revisión
 * NO deja que semejante basura se quede como contenido final de un archivo.
 */
export function pareceVolcadoDeLlamada(contenido: string): boolean {
  const s = String(contenido || "").replace(/^[\s`]+/, "");
  return /^(write_file|edit_file|append_file|create_file|read_file|delete_file|make_dir|run_command|crear_archivo|escribir_archivo)[ \t]+(path|ruta|archivo|fichero|ruta_archivo|content|contenido|texto|cuerpo|find|buscar|replace|reemplazar|command|comando|cmd|query|consulta)[ \t]*=[ \t]*"/i.test(s);
}

export function extraerLlamadasEnTexto(
  texto: string,
  nombresValidos: Set<string>
): { llamadas: AcumuladorToolCall[]; textoLimpio: string } {
  const llamadas: AcumuladorToolCall[] = [];
  let restante = String(texto || "");
  let limpio = restante;
  let seq = 0;
  const nuevaId = () => `txt_${seq++}`;

  const empujar = (nombreCrudo: string, cuerpo: string): boolean => {
    const nombre = normalizarNombreHerramienta(nombreCrudo, nombresValidos);
    if (!nombre) return false;
    const jsonStr = extraerPrimerJSON(cuerpo);
    let args: any = {};
    if (jsonStr) {
      try { args = normalizarArgsAlias(JSON.parse(jsonStr)); } catch { args = {}; }
    }
    llamadas.push({ id: nuevaId(), name: nombre, arguments: JSON.stringify(args) });
    return true;
  };

  // Helpers de la envoltura de tokens (formato 4).
  const primerToken = (s: string): string => {
    const mm = String(s || "").match(/[a-zA-Z_][\w-]*/);
    return mm ? mm[0] : "";
  };
  // JSON-nombre: {"name":"write_file","arguments":{…}} (y alias name/tool/function).
  const empujarPayloadJSON = (payload: string): boolean => {
    const js = extraerPrimerJSON(payload);
    if (!js) return false;
    let o: any;
    try { o = JSON.parse(js); } catch { return false; }
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    const crudoNombre = o.name || o.tool || o.tool_name || o.function || o.recipient_name;
    if (!crudoNombre) return false;
    const nombre = normalizarNombreHerramienta(String(crudoNombre), nombresValidos);
    if (!nombre) return false;
    let rawArgs = o.arguments ?? o.parameters ?? o.args ?? o.params ?? {};
    if (typeof rawArgs === "string") { try { rawArgs = JSON.parse(rawArgs || "{}"); } catch { rawArgs = {}; } }
    if (!rawArgs || typeof rawArgs !== "object") rawArgs = {};
    llamadas.push({ id: nuevaId(), name: nombre, arguments: JSON.stringify(normalizarArgsAlias(rawArgs)) });
    return true;
  };

  let m: RegExpExecArray | null;

  // 0) v1.60.11 — ENVOLTURA DE TOKENS ESPECIALES (`<|tool_call_start|>…
  //    <|tool_call_end|>`, `<tool_call>…</tool_call>`). El contenido interno se
  //    parsea con la sintaxis de paréntesis y, si no, con JSON-nombre o
  //    nombre+JSON pelado. La envoltura entera se retira del texto visible.
  const spansEnv: Array<[number, number]> = [];
  for (const reEnv of RE_ENVOLTURAS_TOKENS) {
    reEnv.lastIndex = 0;
    while ((m = reEnv.exec(restante)) !== null) {
      const dentro = m[1] || "";
      const previas = llamadas.length;
      for (const c of extraerLlamadasParen(dentro, nombresValidos).llamadas) {
        llamadas.push({ id: nuevaId(), name: c.name, arguments: c.arguments });
      }
      if (llamadas.length === previas) {
        if (!empujarPayloadJSON(dentro)) empujar(primerToken(dentro), dentro);
      }
      spansEnv.push([m.index, m.index + m[0].length]);
    }
  }
  spansEnv.sort((a, b) => b[0] - a[0]);
  for (const [ini, fin] of spansEnv) {
    limpio = limpio.slice(0, ini) + limpio.slice(fin);
  }
  restante = limpio;

  // 1) Bloques cercados: ```[prefijo:]nombre\n cuerpo ```
  //    (cubre ```cerebronico:write_file y ```tool_code list_dir).
  const reFence = /```[ \t]*(?:[a-zA-Z0-9_]+:)?([a-zA-Z_]+)[ \t]*\r?\n([\s\S]*?)```/g;
  const spansFence: Array<[number, number]> = [];
  while ((m = reFence.exec(restante)) !== null) {
    if (empujar(m[1], m[2])) spansFence.push([m.index, m.index + m[0].length]);
  }
  for (let i = spansFence.length - 1; i >= 0; i--) {
    limpio = limpio.slice(0, spansFence[i][0]) + limpio.slice(spansFence[i][1]);
  }
  restante = limpio;

  // 2) Pseudo-XML <dots_function_call><nombre>…</…>…</dots_function_call>.
  const reDots = /<dots_function_call>\s*<([a-zA-Z_]+)[^>]*>([\s\S]*?)<\/dots_function_call>/g;
  const spansDots: Array<[number, number]> = [];
  while ((m = reDots.exec(restante)) !== null) {
    if (empujar(m[1], m[2])) spansDots.push([m.index, m.index + m[0].length]);
  }
  for (let i = spansDots.length - 1; i >= 0; i--) {
    limpio = limpio.slice(0, spansDots[i][0]) + limpio.slice(spansDots[i][1]);
  }
  restante = limpio;

  // 3) Nombre pelado en su propia línea + JSON a continuación.
  //    Solo cuaja si el nombre resuelve a herramienta válida (evita falsos
  //    positivos con prosa normal).
  const reBare = /(?:^|\n)[ \t]*([a-zA-Z_]{2,})[ \t]*\r?\n[ \t]*(\{[\s\S]*?\})/g;
  const spansBare: Array<[number, number]> = [];
  while ((m = reBare.exec(restante)) !== null) {
    if (!normalizarNombreHerramienta(m[1], nombresValidos)) continue;
    if (empujar(m[1], m[2])) {
      const ini = m.index + (restante[m.index] === "\n" ? 1 : 0);
      spansBare.push([ini, m.index + m[0].length]);
    }
  }
  for (let i = spansBare.length - 1; i >= 0; i--) {
    limpio = limpio.slice(0, spansBare[i][0]) + limpio.slice(spansBare[i][1]);
  }
  restante = limpio;

  // 5) v1.60.11 — SINTAXIS DE PARÉNTESIS suelta en el texto (sin envoltura):
  //    write_file({"path":"x","content":"y"}), [list_files()], /read_file({…}).
  const paren = extraerLlamadasParen(restante, nombresValidos);
  for (const c of paren.llamadas) {
    llamadas.push({ id: nuevaId(), name: c.name, arguments: c.arguments });
  }
  const spansParen = [...paren.spans].sort((a, b) => b[0] - a[0]);
  for (const [ini, fin] of spansParen) {
    limpio = limpio.slice(0, ini) + limpio.slice(fin);
  }

  // 6) v1.66.0 — ESTILO ATRIBUTO: `name clave="valor" …` (mistral-code-fim 22/10).
  //    Va EL ÚLTIMO a propósito: solo captura lo que ningún formato estructurado
  //    reconoció, así no le roba llamadas a los bloques cercados/JSON de arriba.
  const atr = extraerLlamadasAtributos(limpio, nombresValidos);
  for (const c of atr.llamadas) {
    llamadas.push({ id: nuevaId(), name: c.name, arguments: c.arguments });
  }
  const spansAtr = [...atr.spans].sort((a, b) => b[0] - a[0]);
  for (const [ini, fin] of spansAtr) {
    limpio = limpio.slice(0, ini) + limpio.slice(fin);
  }

  return { llamadas, textoLimpio: limpio.trim() };
}

/**
 * Mensaje de resultados para un modelo que habla SOLO TEXTO: le devolvemos lo
 * que produjeron sus llamadas textuales en prosa legible (no por el protocolo
 * role:"tool", que no entiende) y le enseñamos UNA vez el formato correcto
 * para que la próxima vez emita menos ruido.
 */
export function construirDirectivaResultadosTextuales(
  resultados: Array<{ nombre: string; salida: string }>
): string {
  const bloques = resultados
    .map((r) => `• ${r.nombre} →\n${String(r.salida || "").slice(0, 1200)}`)
    .join("\n\n");
  return (
    "✅ EJECUTÉ DE VERDAD las herramientas que escribiste en el texto. " +
    "Resultados reales (el sandbox YA cambió donde correspondía):\n\n" +
    bloques +
    "\n\nContinúa con estos datos reales. Si necesitas otra herramienta, " +
    "escríbela en un bloque cercado con el nombre exacto, por ejemplo:\n" +
    "```write_file\n{\"path\":\"index.html\",\"content\":\"…\"}\n```\n" +
    "Usa SIEMPRE los nombres y campos canónicos (path, content, command)."
  );
}

/**
 * v1.67.1 · FILTRO DE VALLAS PARA EL STREAM — el chat deja de ser la mesa de trabajo.
 * ============================================================================
 * LA QUEJA (Mario, con captura): «contaminan todo el chat de código y comandos,
 * y en el editor no escriben nada».
 *
 * LA RAÍZ, dos líneas medidas de `server/cicloOpenAICompat.ts`:
 *   · 388 — `ctx.sendChunk(contenido)`: cada carácter del modelo se mandaba al
 *     chat EN VIVO, vallas de herramienta incluidas;
 *   · 410 — de `extraerLlamadasEnTexto(...)` se tomaba `extra.llamadas` y se
 *     tiraba `extra.textoLimpio`, o sea la misma salida ya limpia de vallas.
 *
 * Por qué no alcanza con `textoLimpio`: lo que el SSE ya escupió está escrito en
 * la pantalla; no se des-escribe un chorro que corrió. La única manera honesta
 * es RETENER el bloque mientras se forma y decidir al cerrarlo.
 *
 * REGLA: la prosa sale al instante. Al abrir ``` se guarda lo que sigue hasta el
 * cierre, y AHÍ se pregunta al parser oficial: si eso es una llamada que el motor
 * va a ejecutar, no pisa el chat; si no lo es, se suelta tal cual. Un bloque
 * ```html del sitio pedido NO es una llamada y tiene que seguir viéndose —
 * esconder código que el usuario pidió ver es peor que el defecto que se cura.
 *
 * ALCANCE deliberado (menos es más): sólo vallas ``` — que son las del log
 * reportado y las que enseña el CONTRATO_DE_ACCIÓN. Las formas pseudo-XML
 * (`<|tool_call|>`, `<function=>`) las sigue cubriendo `textoLimpio` en el
 * mensaje final; no se les añade un segundo camino de limpieza aquí.
 *
 * POR CONSTRUCCIÓN NO PUEDE TRAGARSE UNA RESPUESTA: al cerrar el turno, si NO
 * salió ninguna llamada se libera todo lo pendiente. La valla se esconde sólo
 * cuando ya se convirtió en acción ejecutada.
 */
export interface FiltroDeVallas {
  /** Recibe el pedacito que llegó y devuelve lo que ya es seguro mostrar. */
  escribir(chunk: string): string;
  /** Fin del turno: libera lo pendiente si no salió llamada; si salió, la esconde. */
  cerrar(llamadasSaliaron: boolean): string;
  /** Caracteres escondidos (para el acta: esconder no es basura silenciosa). */
  retenido(): number;
}

export function crearFiltroDeVallas(nombresValidos: Set<string>): FiltroDeVallas {
  let buf = "";            // texto todavía sin resolver
  let enValla = false;
  let oculto = 0;

  /** Se decide con el parser OFICIAL, nunca por apariencia del bloque. */
  const esLlamada = (bloque: string): boolean =>
    extraerLlamadasEnTexto(bloque, nombresValidos).llamadas.length > 0;

  /**
   * Drena todo lo que se pueda resolver AHORA. BUCLE, no una pasada: la primera
   * versión procesaba una sola transición por llamada y, en un stream que llega
   * entero, se comía la prosa que venía después de la valla. Ese bug lo agarró
   * el test, no la lectura del código.
   */
  const drenar = (): string => {
    const sal: string[] = [];
    for (;;) {
      if (!enValla) {
        const i = buf.indexOf("```");
        if (i === -1) {
          // El peor caso del SSE real: el opener llega PICADO entre dos pedacitos
          // («`», luego «`», luego «`cerebronico:write_file»). Soltar el ` suelto
          // dejaba el resto de la valla a la vista y el filtro no servía nada. Se
          // retiene la cola de backticks que podría estar formando un opener.
          let cola = 0;
          while (cola < buf.length && cola < 2 && buf.endsWith("`".repeat(cola + 1))) cola++;
          if (cola > 0) {
            if (buf.length > cola) sal.push(buf.slice(0, buf.length - cola));
            buf = buf.slice(buf.length - cola);
          } else { sal.push(buf); buf = ""; }
          break;
        }
        if (i > 0) { sal.push(buf.slice(0, i)); buf = buf.slice(i); }
        enValla = true;
      }
      // Dentro de la valla: hay que ver el cierre para poder decidir.
      const fin = buf.indexOf("```", 3);
      if (fin === -1) break;                     // espera más stream
      const bloque = buf.slice(0, fin + 3);
      buf = buf.slice(fin + 3);
      enValla = false;
      if (esLlamada(bloque)) oculto += bloque.length;
      else sal.push(bloque);
    }
    return sal.join("");
  };

  return {
    escribir(chunk: string): string {
      buf += chunk;
      return drenar();
    },
    cerrar(llamadasSaliaron: boolean): string {
      const suelto = drenar();
      if (!buf) return suelto;
      // Una cola que NO es una valla abierta (p. ej. dos backticks sueltos al final
      // de una frase) se devuelve siempre: no hay nada escondible ahí.
      if (!buf.startsWith("```")) { const todo = suelto + buf; buf = ""; enValla = false; return todo; }
      if (!llamadasSaliaron) { const todo = suelto + buf; buf = ""; enValla = false; return todo; }
      oculto += buf.length;
      buf = ""; enValla = false;
      return suelto;
    },
    retenido(): number { return oculto; },
  };
}

// ═══════════════════════════════════════════════════════════════════════════

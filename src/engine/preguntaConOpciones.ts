/**
 * preguntaConOpciones.ts — EL AGENTE PREGUNTA CON OPCIONES EN VEZ DE SUPONER (v1.0.14)
 * ===================================================================================
 * PEDIDO DE MARIO (09/11): cuando al agente le quedan varias tareas abiertas o hay
 * ambigüedad de prioridad, hoy se "pregunta y contesta solo" (inventa la próxima
 * tarea y sigue haciéndola). La idea de Mario: que el motor tenga un CUESTIONARIO
 * de opciones para decidir qué hacer primero — igual que este asistente consulta
 * al humano con preguntas de opciones en vez de suponer.
 *
 * ESTE MÓDULO es el CONTRATO puro de esa pregunta-con-opciones:
 *   · `DIRECTIVA_OPCIONES` ordena al modelo, ante varias tareas abiertas o
 *     ambigüedad, QUE PREGUNTE al usuario con opciones enumeradas en lugar de
 *     elegir y seguir por su cuenta.
 *   · `parsearOpciones()` extrae pregunta + opciones de la respuesta del modelo
 *     con un formato fijo y tolerante, para que la UI pueda pintarlas como
 *     botones elegibles.
 *   · `esPreguntaDeOpciones()` permite que `motivoDeParada` distinga esta
 *     consulta legítima de una parada por "pidió permiso": una pregunta con
 *     opciones concretas NO es un corte prematuro ni un "seguí vos, que no hago".
 *
 * PURO: sin red, sin fs, sin estado. Quien inyecta la directiva y quien pinta
 * las opciones es el cable (server → UI).
 */

/** Cuántas opciones como máximo se aceptan en una pregunta (UI de botones no se desborda). */
export const MAX_OPCIONES = 6;

/**
 * Directiva que se inyecta al modelo cuando el turno tiene varias tareas abiertas
 * y el próximo paso es ambiguo (no hay una única continuación obvia): en vez de
 * auto-elegir y seguir inventando, debe PREGUNTAR al usuario con opciones.
 */
export const DIRECTIVA_OPCIONES = (
  `📋 CUESTIONARIO DE OPCIONES — hay varias tareas abiertas (o el siguiente paso no es obvio) y NO debes ` +
  `elegir por el usuario ni seguir por tu cuenta inventando trabajo. Preguntá SIEMPRE con opciones concretas ` +
  `usando EXACTAMENTE este formato, sin nada después:\n\n` +
  `PREGUNTA: <pregunta breve al usuario>\n` +
  `OPCIÓN 1: <qué harías primero>\n` +
  `OPCIÓN 2: <alternativa>\n` +
  `OPCIÓN 3: <otra alternativa o "nada más por ahora">\n\n` +
  `Reglas: no inventes opciones que no estén dentro del pedido original; usa a lo sumo ${MAX_OPCIONES}; ` +
  `no actúes hasta que el usuario elija (elección = su respuesta empieza con el número o repite una opción).`
);

/**
 * Extrae pregunta + opciones de la respuesta del modelo.
 * Formato esperado (tolerante a minúsculas/acentos/variantes):
 *   PREGUNTA: <texto>
 *   OPCIÓN 1: <a>      (puede ser opc1/op. 1/1) 
 *   OPCIÓN 2: <b>
 * Devuelve null si no hay al menos una pregunta y una opción.
 */
export interface PreguntaConOpciones {
  pregunta: string;
  opciones: string[];
}

export function parsearOpciones(texto: string): PreguntaConOpciones | null {
  const src = String(texto || "");
  const lineas = src.split(/\r?\n/);
  const pregunta: string[] = [];
  const opciones: string[] = [];
  let enPregunta = false;
  // acepta: "OPCIÓN 1: a", "opción 1 a", "opc1: a", "op 1- a", "1) a", "2- b"
  const RE_OPCION = /^\s*(?:opc(?:i[oó]n|\.?)?\s*[:.\-]?\s*(?:\d+|uno|dos|tres|cuatro|cinco|seis)?\s*|(\d+)\s*[.)\-]\s*)(.+)$/i;
  for (const cruda of lineas) {
    const linea = cruda.trim();
    if (!linea) continue;
    const mPregunta = /^\s*pregunta\s*[:\.\-]\s*(.+)$/i.exec(linea);
    if (mPregunta) { pregunta.push(mPregunta[1].trim()); enPregunta = true; continue; }
    const mOpcion = RE_OPCION.exec(linea);
    if (mOpcion && mOpcion[2] && mOpcion[2].trim()) { opciones.push(mOpcion[2].trim()); enPregunta = false; continue; }
    if (enPregunta && pregunta.length && pregunta[pregunta.length - 1].length < 200) {
      pregunta[pregunta.length - 1] += " " + linea;
    }
  }
  if (pregunta.length === 0 || opciones.length === 0) return null;
  return { pregunta: pregunta.join(" ").replace(/\s+/g, " ").trim(), opciones: opciones.slice(0, MAX_OPCIONES) };
}

/** ¿El texto es una pregunta-con-opciones (diálogo legítimo, no una parada)? */
export function esPreguntaDeOpciones(texto: string): boolean {
  return parsearOpciones(texto) !== null;
}

/** Receta para la UI: de una pregunta parseada, el mensaje que muestra-botones. */
export function etiquetaDeOpcion(i: number, opcion: string): string {
  return `[${i + 1}] ${opcion}`;
}

/** La directiva exacta que se le da al modelo cuando hay 1 sola tarea abierta también se
 *  puede forzar a consultar si `forzar` es true (se usa en ambigüedad de prioridad). */
export function directivaDeOpciones(maxOpciones = MAX_OPCIONES): string {
  return DIRECTIVA_OPCIONES.replace(String(MAX_OPCIONES), String(maxOpciones));
}
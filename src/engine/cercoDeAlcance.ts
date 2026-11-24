/**
 * cercoDeAlcance.ts — EL MODELO YA NO INVENTA TAREAS FUERA DEL PEDIDO (v1.0.14)
 * =================================================================================
 * PEDIDO DE MARIO (09/11, see el chat): «en otras ocasiones viene escribiendo y se
 * pregunta y contesta solo continfndo haciendo tareas que no le pedí, solo las
 * supuso y comienza a hacerlas».
 *
 * RAÍZ que atacamos: el bucle (`decidirBucle` + `directivaDeContinuacion`) obliga
 * al modelo a cerrar TODAS las tareas abiertas del plan antes de termin ar. Si el
 * plan lo inventó el propio modelo —y en modelos débiles se infla—, "cerrar el
 * plan" significa ejecutar subtareas que el usuario JAMÁS pidió. El motor no tiene
 * forma de distinguir la etapa pedida de la etapa inventada porque nunca compara
 * el plan contra el OBJETIVO ORIGINAL.
 *
 * ESTE MÓDULO ES ESE FALTANTE: una clase pura que, dado el objetivo del usuario
 * y las tareas abiertas del plan, decide cuáles están DENTRO del alcance (solapan
 * léxicamente con el objetivo) y cuáles parecen INVENTADAS (no comparten nada).
 * Cuando hay inventadas, devuelve una DIRECTIVA para inyectar: el motor le dice
 * al modelo "esas etapas no están en lo que te pedí: cerralas, NO las ejecutes",
 * y seguir con SOLO lo que era parte del pedido.
 *
 * CONSERVADOR A PROPÓSITO (anti falso positivo — la peor falla aquí sería CORTAR
 * trabajo legítimo): el umbral de "inventada" exige que la tarea NO comparta NINGÚN
 * término significativo con el objetivo (espera de 2+ tokens en común para dar por
 * alineada). Si hay duda, se trata como DENTRO de alcance: el cerco no castiga.
 *
 * PURO: sin red, sin fs, sin estado. Quien arma la señal (`objetivo`) y quien
 * inyecta la directiva es el cable. Se prueba en seco.
 */

export interface TareaCerco {
  id: string;
  description: string;
}

export interface EntradaCerco {
  /** El pedido original del usuario. Vacío = no hay cerco (se conserva la conducta). */
  objetivo: string;
  /** Tareas abiertas (pending/running) del plan del turno. */
  tareas: TareaCerco[];
}

/** Términos en común para declarar "alineada". Basta UNO: nunca castigar trabajo legítimo. */
export const MIN_TOKENS_EN_COMUN = 1;
/** Términos demasiado genéricos que no aportan ("hacer", "crear", "código"…). */
const STOPWORDS = new Set([
  "hacer", "haz", "crear", "crea", "generar", "genera", "escribir", "escribe",
  "archivo", "código", "codigo", "proyecto", "tarea", "tareas", "paso", "pasos",
  "carpeta", "modulo", "módulo", "app", "aplicacion", "aplicación", "irse", "luego",
  "deber", "poder", "utilizar", "usar", "agregar", "añadir", "sistema", "completar",
  "terminar", "una", "uno", "el", "la", "los", "las", "de", "del", "para", "con",
  "que", "se", "no", "y", "o", "en", "a", "al", "un", "esta", "este", "esto", "que",
]);

/** Separa el texto en términos significativos, normalizados (minúsculas, sin acentos). */
export function terminosDe(texto: string): string[] {
  const sinAcentos = String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const salida = new Set<string>();
  for (const palabra of sinAcentos.split(/[^a-z0-9]+/)) {
    if (!palabra || palabra.length < 3) continue;
    if (STOPWORDS.has(palabra)) continue;
    salida.add(palabra);
  }
  return [...salida];
}

export interface VeredictoCerco {
  /** Cuántas tareas abiertas parecen fuera del alcance del pedido. */
  desviadas: TareaCerco[];
  /** ¿Hay desvío que amerite la directiva? */
  hayDesvio: boolean;
  /** Directiva lista para inyectar (vacío si hayDesvio es false). */
  directiva: string;
}

/**
 * Decide si la tarea está dentro del alcance del objetivo.
 * Alineada si comparte >= MIN_TOKENS_EN_COMUN términos significativos.
 */
export function tareaDentroDeAlcance(objetivo: string, tarea: string, min = MIN_TOKENS_EN_COMUN): boolean {
  const t = terminosDe(objetivo);
  if (t.length === 0) return true; // sin objetivo no hay cerco: se conserva la conducta histórica
  const d = new Set(terminosDe(tarea));
  let enComun = 0;
  for (const token of t) {
    if (d.has(token)) {
      enComun++;
      if (enComun >= min) return true;
    }
  }
  return false;
}

/**
 * Evalúa el desvío de alcance. Nunca castiga: si no hay objetivo o no hay
 * tareas abiertas, devuelve un veredicto inócuo (hayDesvio = false).
 */
export function evaluarCercoDeAlcance(entrada: EntradaCerco): VeredictoCerco {
  const objetivo = String(entrada?.objetivo ?? "").trim();
  const tareas = (entrada?.tareas ?? []).filter((t) => t && t.description);
  if (!objetivo || tareas.length === 0) {
    return { desviadas: [], hayDesvio: false, directiva: "" };
  }
  const desviadas = tareas.filter((t) => !tareaDentroDeAlcance(objetivo, t.description));
  if (desviadas.length === 0) {
    return { desviadas: [], hayDesvio: false, directiva: "" };
  }
  return {
    desviadas,
    hayDesvio: true,
    directiva: directivaDeCerco(objetivo, desviadas),
  };
}

/** El texto que se inyecta: re-ancla al pedido y prohíbe ejecutar las inventadas. */
export function directivaDeCerco(objetivo: string, desviadas: TareaCerco[]): string {
  const nombres = desviadas.map((t) => `«${t.id} ${t.description}»`).join(", ");
  return (
    `🚫 CERCEDERO DE ALCANCE — el usuario te pidió SOLO esto:\n` +
    `· OBJETIVO: «${String(objetivo).slice(0, 300)}»\n` +
    `Las siguientes tareas del plan NO aparecen en ese pedido y parecen inventadas: ${nombres}. ` +
    `NO las ejecutes. Ocúpalas solo si de verdad son un paso necesario del objetivo que pediste arriba, ` +
    `y si no lo son, márcalas como hechas con un nota «fuera de alcance» en vez de hacer trabajo que nadie te pidió. ` +
    `Volvé a ponerte sobre el objetivo literal del usuario y no des por sentado trabajo nuevo.`
  );
}
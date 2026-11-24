/**
 * recalceHibrido.ts — REORDENADO HÍBRIDO (palabra + vector) — v1.76.0
 * ====================================================================
 * LA DEUDA QUE PAGA: la capacidad `hybrid_rerank` del laboratorio tenía
 * interruptor sin motor desde su creación. Su motivo pendiente decía: «falta
 * la función de fusión calibrada con datos reales; la calibración no se puede
 * inventar». Es cierto — y por eso esta fusión NO calibra pesos con números
 * escritos a mano: usa **Reciprocal Rank Fusion (RRF)** (Cormack et al. 2009),
 * que combina listas por su POSICIÓN y no por sus puntuaciones crudas. Las dos
 * fuentes de acá (coseno vectorial y recubrimiento léxico) no son comparables
 * entre sí; comparar puestos es la única aritmética honesta disponible.
 *
 *     RRF(d) = Σ_listas  w_lista · 1 / (K + puesto_lista(d))      K = 60
 *
 * Nada que calibrar: K=60 es la constante pública y fija del método — amortigua
 * el puesto 1 sin inventar. Los pesos son iguales (1 y 1) porque ninguna fuente
 * demostró ser mejor en ESTA casa; si algún día se mide, se cambia acá y solo
 * acá (y el test correspondiente lo exigirá con evidencia).
 *
 * CONTROL DE FALSO POSITIVO (regla de la casa — toda mejora nace con él):
 *   · consulta sin tokens o lista léxica vacía → RRF con una sola lista
 *     replica EXACTAMENTE el orden vectorial de entrada (no "mejora" nada que
 *     no puede medir, no reordena ruido);
 *   · candidato que ninguna lista trajo → fuera (fusion > 0 obligatorio);
 *   · desempate estable: score vectorial y luego source — mismo input, mismo
 *     output, siempre.
 *
 * Puro: sin red, sin fs, sin estado, sin dependencias de terceros.
 */

export interface CandidatoRecalce {
  id: string;
  source: string;
  text: string;
}

export interface ResultadoFusionado<T extends CandidatoRecalce = CandidatoRecalce> {
  candidato: T;
  fusion: number;
  puestoVector: number;
  puestoLexico: number;
  scoreVector: number;
  scoreLexico: number;
}

/** Constante canónica de RRF — pública y fija, no un dial inventado. */
export const K_RRF = 60;

// Stopwords SOLO partículas que jamás son el asunto de una consulta. Ojo con
// «como», «como» interrogativo y «dónde»: en consultas reales son contenido
// («cómo se configura…») y vetarlos dejó de recuperar justo lo que se preguntaba.
const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "lo", "un", "una", "unos", "unas",
  "que", "con", "para", "por", "en", "y", "o", "u", "a", "al", "es", "son",
  "ser", "este", "esta", "esto", "these", "those", "pero", "si", "no", "su",
  "sus", "le", "les", "me", "te", "se", "muy", "the", "and", "for", "not",
  "you", "your", "with", "from", "have", "has", "was", "are", "its", "that",
  "this",
]);

/** Normaliza (minúsculas, sin acentos) y tokeniza; descarta vacíos y stopwords. */
export function tokenizarRecalce(texto: string): string[] {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Puntuación léxica determinista (0..1+): fracción de tokens de la consulta
 * presentes en el texto (recubrimiento) + bonus 0,25 si la frase completa de la
 * consulta aparece textual. Sin modelo, sin red, sin estado.
 */
export function puntajeLexico(query: string, texto: string): number {
  const qt = tokenizarRecalce(query);
  const tt = new Set(tokenizarRecalce(texto));
  if (qt.length === 0 || tt.size === 0) return 0;
  let vistos = 0;
  for (const q of qt) if (tt.has(q)) vistos++;
  let score = vistos / qt.length;
  const qNorm = String(query || "").toLowerCase().trim();
  const tNorm = String(texto || "").toLowerCase();
  if (qNorm.length > 8 && tNorm.includes(qNorm)) score += 0.25;
  return score;
}

/**
 * Fusiona dos listas de recuperación por puesto (RRF puro).
 * `listaVector` y `listaLexica` llegan ya ordenadas (mejor primero); solo
 * cuentan sus posiciones. Devuelve TODOS los candidatos con fusion > 0,
 * ordenados DESC. El desempate usa `scoreVector` si viene, estable siempre.
 */
export function fusionarPorPuesto<T extends CandidatoRecalce>(
  listaVector: Array<T & { score?: number }>,
  listaLexica: Array<T & { score?: number }>,
  pesos: [number, number] = [1, 1]
): Array<ResultadoFusionado<T>> {
  const puestoV = new Map<string, number>();
  const puestoL = new Map<string, number>();
  const crudoV = new Map<string, number>();
  const lexCrudo = new Map<string, number>();
  listaVector.forEach((c, i) => {
    if (!puestoV.has(c.id)) puestoV.set(c.id, i + 1);
    crudoV.set(c.id, Number(c.score) || 0);
  });
  listaLexica.forEach((c, i) => {
    if (!puestoL.has(c.id)) { puestoL.set(c.id, i + 1); lexCrudo.set(c.id, Number(c.score) || 0); }
  });

  const universo = new Map<string, T>();
  for (const c of listaVector) if (!universo.has(c.id)) universo.set(c.id, c);
  for (const c of listaLexica) if (!universo.has(c.id)) universo.set(c.id, c);

  const out: Array<ResultadoFusionado<T>> = [];
  for (const [id, candidato] of universo) {
    const pv = puestoV.get(id) || 0;
    const pl = puestoL.get(id) || 0;
    let fusion = 0;
    if (pv > 0) fusion += pesos[0] * (1 / (K_RRF + pv));
    if (pl > 0) fusion += pesos[1] * (1 / (K_RRF + pl));
    if (fusion <= 0) continue;
    out.push({
      candidato,
      fusion,
      puestoVector: pv,
      puestoLexico: pl,
      scoreVector: crudoV.get(id) || 0,
      scoreLexico: lexCrudo.get(id) || 0,
    });
  }
  // desempate: orden canónico por id — determinista y NEUTRAL. Desempatar por
  // score vectorial (primer intento) sometía el consenso léxico a la magnitud
  // bruta del coseno: un fragmento con todas las palabras exactas perdía el
  // puesto 1 contra un vecino semántico por 0,15 de similitud, que es justo
  // el defecto que esta fusión viene a curar.
  out.sort((a, b) => {
    if (b.fusion !== a.fusion) return b.fusion - a.fusion;
    return String(a.candidato.id).localeCompare(String(b.candidato.id));
  });
  return out;
}

/**
 * API de un paso para LocalRAG: recibe la lista vectorial ya ordenada (con su
 * score), calcula la léxica en casa sobre ESA lista y devuelve el top-k
 * fusionado. Decisión honesta y declarada: la fuente léxica reordena lo que
 * el vector recuperó — no rescata fragmentos fuera del candidateo (para eso
 * habría que escanear todo el índice en cada consulta, y la regla de la casa
 * es no agrandar el coste en reposo).
 */
export function fusionarListas<T extends CandidatoRecalce & { score: number }>(
  query: string,
  vector: Array<T>,
  k: number
): Array<ResultadoFusionado<T>> {
  const lexica = vector
    .map((h) => ({ id: h.id, source: h.source, text: h.text, score: puntajeLexico(query, h.text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const fusionada = fusionarPorPuesto(vector, lexica, [1, 1]);
  const porId = new Map(vector.map((h) => [h.id, h] as const));
  return fusionada
    .slice(0, Math.max(1, k))
    .map((r) => ({ ...r, candidato: (porId.get(r.candidato.id) || r.candidato) as T }));
}

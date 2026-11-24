/**
 * capasSkills.ts · FASE 16 — TRES CAPAS CON CRITERIO DE USO (v2.3.19)
 * ================================================================
 * EL ORIGEN MEDIDO del plano (`HOJA_DE_RUTA_EVOLUCION_v2.3.8.md`, FASE 16): el
 * `office/SKILL.md` de `dsh` — catorce líneas que dicen **qué** skill cargar según
 * la tarea, y siete skills de formato que llevan el contenido. La bajada al nivel 2
 * es explícita y viene con una frase que dice **cuándo NO bajar** («editar datos no
 * exige renderizar sólo porque haya formato incidental»).
 *
 * APLICADO A CASA. Un solo nivel de decisión tiene un costo que no aparece en
 * ningún log: o el modelo recibe todo siempre —y entonces el presupuesto de
 * contexto se gasta en prosa que no aplicaba al turno—, o recibe lo que pesque el
 * indexador por similitud, que es otra forma de lo mismo. Las tres capas de acá:
 *
 *   1 · `indice`    ruteo delgado: «si es X, cargá el pack Y». Vive en el prompt.
 *   2 · `cuerpo`    la instrucción completa. Entra **cuando el índice la nombra**.
 *   3 · `detalle`   el anexo largo. Bajo demanda, se busca, nunca se inyecta.
 *
 * LA INVARIANTE QUE JUSTIFICA EL TRABAJO — y es literal del plano: «una entrada del
 * nivel 1 **nunca** contiene el cuerpo del nivel 3». Si el índice crece hasta
 * cargarse el contenido adentro, se vuelve el nivel 1 de antes con nombre nuevo:
 * cuatro capas decorativas sobre un prompt inflado. `violaLasCapas()` la corta.
 *
 * Y la segunda evidencia que el plano exige —«lectura de prompt final medida ANTES
 * y DESPUÉS con FASE 13»— no se puede cumplir con una opinión: `superficieInyectada`
 * suma caracteres y `presionDeTexto` (el medidor de la F13) traduce eso a la
 * fracción de la ventana del modelo. Acá se compara, no se promete.
 */

import { presionDeTexto } from "./contextoMedido";

/** Las tres capas, con el nombre con el que se las nombra en el acta y en el YAML. */
export const CAPAS = ["indice", "cuerpo", "detalle"] as const;
export type Capa = (typeof CAPAS)[number];

/** Nombre propio de cada capa, para el usuario: qué es y para qué sirve. */
export const NOMBRE_DE_CAPA: Record<Capa, { etiqueta: string; paraQue: string }> = {
  indice: { etiqueta: "Índice de ruteo", paraQue: "dice qué pack cargar; siempre va en el prompt" },
  cuerpo: { etiqueta: "Cuerpo del pack", paraQue: "la instrucción completa; entra cuando el índice la nombra" },
  detalle: { etiqueta: "Detalle bajo demanda", paraQue: "el anexo largo; se busca, nunca se inyecta solo" },
};

/** Un índice que no cabe en estos caracteres ya no es un índice: es un cuerpo. */
export const TOPE_INDICE_CARACTERES = 260;
/** Coincidencia de más de este tamaño entre índice y cuerpo = el índice se comió el cuerpo. */
export const UMBRAL_INVASION_CARACTERES = 60;

export interface EntradaEnCapas {
  id: string;
  capa: Capa;
  title: string;
  /** El texto que se inyecta cuando la entrada entra. */
  body: string;
  /** Cuándo conviene cargarla. Nivel 2 y 3. */
  cuandoConsultar?: string;
  /**
   * Cuándo consultarla sería desperdicio. **Obligatoria en el nivel 1**: es la
   * frase que el plano admira de `dsh` («editar datos no exige renderizar sólo
   * porque haya formato incidental»), y es la que evita que el índice se lea como
   * «cargá todo, por las dudas».
   */
  cuandoNoConsultar?: string;
  /** Nivel 3: se busca, no se inyecta. Debe ser `true` en `detalle`. */
  bajoDemanda?: boolean;
}

/**
 * Longest common substring entre dos textos, en caracteres. Dos filas, O(|a|·|b|)
 * sobre textos de unos cientos de caracteres: sobra de presupuesto y es obvia de
 * leer.
 *
 * Vale la pena la anotación: la primera versión de esta función era un DP de una
 * sola fila «optimizada» que **siempre devolvía 0**, así que la invariante estrella
 * de la fase —el índice no se come el cuerpo— estaba escrita, registrada y muda. La
 * cazó la propia suite al armar el caso que debía romperla. Una valla que no tiene
 * un caso que la haga fallar no es una valla: es decorado.
 */
function coincidenciaContiguaMasLarga(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let mejor = 0;
  let prev: number[] = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur: number[] = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] !== y[j - 1]) continue;
      cur[j] = prev[j - 1] + 1;
      if (cur[j] > mejor) mejor = cur[j];
    }
    prev = cur;
  }
  return mejor;
}

/**
 * LA VALLA DEL PLANO, hecha función: «una entrada del nivel 1 nunca contiene el
 * cuerpo del nivel 3». Devuelve los motivos (vacío = correcta). No lanza: el acta
 * tiene que poder listar las malas sin reventar el arranque.
 */
export function violaLasCapas(entrada: EntradaEnCapas, hermanas: readonly EntradaEnCapas[] = []): string[] {
  const motivos: string[] = [];
  if (!CAPAS.includes(entrada.capa)) motivos.push(`capa desconocida: ${String(entrada.capa)}`);
  if (!entrada.id.trim()) motivos.push("id vacío");
  if (!entrada.body.trim()) motivos.push("body vacío");

  if (entrada.capa === "indice") {
    if (entrada.body.length > TOPE_INDICE_CARACTERES) {
      motivos.push(`indice de ${entrada.body.length} caracteres, tope ${TOPE_INDICE_CARACTERES}`);
    }
    // Sin «cuándo NO consultarla», el índice se lee como «cargá todo por las dudas».
    if (!(entrada.cuandoNoConsultar || "").trim()) motivos.push("indice sin cuandoNoConsultar");
    for (const h of hermanas) {
      if (h.capa === "indice" || h.id === entrada.id) continue;
      const compartida = coincidenciaContiguaMasLarga(entrada.body, h.body);
      if (compartida > UMBRAL_INVASION_CARACTERES) {
        motivos.push(`indice se comio ${compartida} caracteres del cuerpo de ${h.id}`);
      }
    }
  }
  if (entrada.capa === "detalle" && entrada.bajoDemanda !== true) {
    motivos.push("detalle sin bajoDemanda: terminaria inyectandose en el prompt");
  }
  if (entrada.capa === "cuerpo" && !(entrada.cuandoConsultar || "").trim()) {
    motivos.push("cuerpo sin cuandoConsultar: nadie sabe cuando bajar a el");
  }
  return motivos;
}

export interface ActaCapas {
  total: number;
  porCapa: Record<Capa, number>;
  malas: { id: string; motivos: string[] }[];
  /** Caracteres que el índice deja de inyectar frente a meter los cuerpos always. */
  superficieInyectada: number;
  superficieSiTodoFueraIndice: number;
}

/** Audita un set de entradas. Puro: recibe el set, devuelve el acta. */
export function auditarCapas(entradas: readonly EntradaEnCapas[]): ActaCapas {
  const porCapa: Record<Capa, number> = { indice: 0, cuerpo: 0, detalle: 0 };
  const malas: { id: string; motivos: string[] }[] = [];
  for (const e of entradas) {
    if (porCapa[e.capa] !== undefined) porCapa[e.capa]++;
    const motivos = violaLasCapas(e, entradas);
    if (motivos.length) malas.push({ id: e.id, motivos });
  }
  return {
    total: entradas.length,
    porCapa,
    malas,
    superficieInyectada: superficieInyectada(entradas),
    superficieSiTodoFueraIndice: entradas.reduce((n, e) => n + e.body.length, 0),
  };
}

/**
 * Lo que pesa de verdad en el prompt: el índice siempre, el cuerpo sólo si el índice
 * lo nombra, y el detalle nunca. Se mide, no se estima — es la diferencia entre
 * «el índice reduce superficie» y decirlo.
 */
export function superficieInyectada(entradas: readonly EntradaEnCapas[]): number {
  // Un cuerpo **no** viaja si algún índice lo nombra: ahí está la reducción de
  // superficie que la FASE 16 promete. Contar igual los cuerpos ruteados era la
  // primera versión de esta función y daba 2388 caracteres «siempre inyectados»
  // sobre un motor que inyecta 245: el número salía caro, cómodo y falso.
  const nombrados = new Set<string>();
  for (const i of entradas) {
    if (i.capa !== "indice") continue;
    for (const e of entradas) if (e.capa !== "indice" && i.body.includes(e.id)) nombrados.add(e.id);
  }
  let n = 0;
  for (const e of entradas) {
    if (e.capa === "indice") n += e.body.length;
    else if (e.capa === "cuerpo" && e.bajoDemanda !== true && !nombrados.has(e.id)) n += e.body.length;
  }
  return n;
}

/** Comparación ANTES/DESPUÉS en caracteres y en presión de la ventana (F13). */
export function compararSuperficie(textoAntes: string, textoDespues: string, ventanaTokens?: number) {
  const antes = presionDeTexto({ texto: textoAntes, ventanaTokens });
  const despues = presionDeTexto({ texto: textoDespues, ventanaTokens });
  const ahorradas = textoAntes.length - textoDespues.length;
  return {
    caracteresAntes: textoAntes.length,
    caracteresDespues: textoDespues.length,
    ahorradas,
    porcentajeAntes: antes.porcentaje,
    porcentajeDespues: despues.porcentaje,
    puntosGanados: antes.porcentaje - despues.porcentaje,
    gano: ahorradas > 0,
  };
}

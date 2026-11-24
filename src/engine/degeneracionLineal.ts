/**
 * src/engine/degeneracionLineal.ts — v1.61.0
 * ============================================================================
 * DEGENERACIÓN POR LÍNEAS CASI IDÉNTICAS (el bucle REAL de la sesión FIM)
 *
 * 🐞 Sesión `1792619044991` (21/10), modelo `mistral-code-fim-latest`. El modelo
 * degeneró y devolvió 262.849 caracteres: 1467 líneas, de las cuales 1447 eran
 * variaciones de SOLO 33 plantillas (la más repetida, 104 veces):
 *
 *   **C:\Cerebronico\graphql** — carpeta de GraphQL. Aquí se guardan los archivos…
 *   **C:\Cerebronico\store** — carpeta de store. …
 *
 * NINGUNA línea es idéntica a otra (cambia el nombre de la carpeta), así que:
 *
 *   · `sanitizeRepetitiveLoop` NO la cazaba: exige 8 repeticiones EXACTAS.
 *   · `repeticionAnidada` (v1.60.19) TAMPOCO: mide una unidad repetida DENTRO
 *     de una línea (sufijo creciente tipo `_DATOS_SCHEMA_DATOS_SCHEMA…`), que es
 *     otra forma de degeneración.
 *
 * Medido sobre los 262.849 caracteres reales: `cortarDegeneracionLineal` de
 * v1.60.19 daba `hit: false` y dejaba pasar los 262.849 (0,0 % descartado).
 *
 * LA FORMA QUE SÍ FALLA es la más común de los modelos-chat degradados: repetir
 * la MISMA oración cambiando una sola palabra. Se mide por SIMILITUD entre
 * líneas vecinas, no por igualdad:
 *
 *   · sufijo (o prefijo) común ≥ 40 caracteres, o
 *   · ≥ 70 % de palabras en común (Jaccard sobre palabras distintas).
 *
 * Cuando se encadenan 6 líneas así, es degeneración: se corta desde la primera
 * de la racha, conservando todo lo bueno anterior.
 *
 * POR QUÉ NO HAY TECHO DE TOKENS: un `num_predict` global cortaría respuestas
 * largas legítimas. Este corte es POR FORMA, no por longitud.
 *
 * MÓDULO PURO: sin red, sin fs, sin estado global. Se prueba en
 * `tests/degeneracionLineal.test.ts` con el defecto REAL sembrado.
 */

export interface OpcionesLineal {
  /** Cuántas líneas casi idénticas seguidas constitutes degeneración. */
  minRacha?: number;
  /** Longitud de sufijo/prefijo común que ya considera «la misma frase». */
  minComun?: number;
  /** Fracción de palabras compartidas que ya considera «la misma frase». */
  minSimilitud?: number;
  /** Ignorar líneas más cortas que esto (falsos positivos de sangría). */
  minLinea?: number;
}

export interface ResultadoLineal {
  hit: boolean;
  /** Texto recortado justo antes de la racha degenerada. */
  cortado: string;
  /** Índice de la línea donde arrancó la racha (para el aviso al modelo). */
  lineaCorte: number;
  /** Cuántas líneas tenía la racha detectada. */
  largoRacha: number;
}

const SIN_HIT: ResultadoLineal = { hit: false, cortado: "", lineaCorte: -1, largoRacha: 0 };

/** Caracteres iniciales que ambas cadenas comparten. */
export function prefijoComun(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Caracteres finales que ambas cadenas comparten. */
export function sufijoComun(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/** Palabras en común / palabras distintas de la más corta (Jaccard acotado). */
export function similitudPalabras(a: string, b: string): number {
  const A = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / Math.min(A.size, B.size);
}

/** ¿Estas dos líneas son «casi la misma frase»? */
export function lineasParecidas(
  a: string,
  b: string,
  minComun = 40,
  minSimilitud = 0.7
): boolean {
  if (!a || !b) return false;
  if (Math.max(sufijoComun(a, b), prefijoComun(a, b)) >= minComun) return true;
  return similitudPalabras(a, b) >= minSimilitud;
}

/**
 * Detecta la racha de líneas casi idénticas y devuelve el texto recortado.
 *
 * Se escanea de adelante hacia atrás el FINAL del texto acumulado (que es como
 * llega al loop-breaker durante el streaming) buscando la primera racha que
 * llega al umbral, y se devuelve el corte en la línea donde arrancó.
 */
export function cortarDegeneracionLineal(
  texto: string,
  opciones?: OpcionesLineal
): ResultadoLineal {
  const minRacha = Math.max(3, opciones?.minRacha ?? 6);
  const minComun = Math.max(8, opciones?.minComun ?? 40);
  const minSimilitud = Math.min(1, Math.max(0, opciones?.minSimilitud ?? 0.7));
  const minLinea = Math.max(8, opciones?.minLinea ?? 20);

  const t = String(texto || "");
  if (t.length < minComun * 2) return { ...SIN_HIT, cortado: t };

  const lineas = t.split("\n");

  // La degeneración real viene con líneas EN BLANCO intercaladas: sin filtrar,
  // cada comparación cae contra una línea vacía y la racha nunca llega a armar.
  // Se avanza sobre las líneas CON TINTA conservando su índice real, para poder
  // cortar sobre el texto original.
  const conTinta: { i: number; s: string }[] = [];
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].trim().length >= minLinea) conTinta.push({ i, s: lineas[i] });
  }
  if (conTinta.length < minRacha) return { ...SIN_HIT, cortado: t };

  let racha = 1;
  let inicioRacha = conTinta[0].i;
  for (let k = 1; k < conTinta.length; k++) {
    const a = conTinta[k].s;
    const b = conTinta[k - 1].s;
    if (lineasParecidas(a, b, minComun, minSimilitud)) {
      if (racha === 1) inicioRacha = conTinta[k - 1].i;
      racha++;
      if (racha >= minRacha) {
        return {
          hit: true,
          cortado: lineas.slice(0, inicioRacha).join("\n"),
          lineaCorte: inicioRacha,
          largoRacha: racha,
        };
      }
    } else {
      racha = 1;
    }
  }
  return { ...SIN_HIT, cortado: t };
}
/**
 * src/utils/repeticionAnidada.ts — v1.60.19
 *
 * DEGENERACIÓN DE SUFIJO CRECIENTE (el «bucle» real de la sesión FIM del 21/10).
 * Con `mistral-code-fim-latest` (modelo de autocompletado, no de chat), el
 * motor empezó a emitir constantes válidas y luego entró en barrena:
 *
 *   export const CN_CREADOR_MARCADOR_INICIO_AUTOMIGRACION_DATOS = "...";
 *   export const CN_CREADOR_MARCADOR_INICIO_AUTOMIGRACION_DATOS_SCHEMA = "...";
 *   export const CN_CREADOR_..._DATOS_SCHEMA_DATOS_SCHEMA_DATOS_SCHEMA = "...";
 *   ...  (cada línea AÑADE otro `_DATOS_SCHEMA`)
 *
 * El loop-breaker viejo (`sanitizeRepetitiveLoop`) solo cazaba repeticiones
 * EXACTAS — trozo idéntico o línea idéntica repetidos 8 veces. Aquí NINGUNA
 * línea es idéntica a otra (el sufijo CRECE), así que no saltaba hasta que el
 * sufijo repetido dentro de un único identificador era tan largo que el trozo
 * exacto sí se repetía — para entonces ya se habían emitido ~20 KB de basura.
 *
 * Este detector mira UNA línea: si una unidad corta no trivial (p. ej.
 * `_DATOS_SCHEMA`) se repite consecutivamente muchas veces DENTRO de la misma
 * línea, es degeneración — ningún identificador o cadena real de código repite
 * un bloque de ≥ 3 caracteres seis veces seguidas. Salta en la línea ~7 (~1 KB)
 * en vez de a los 20 KB.
 */

export interface RepeticionUnidad {
  hit: boolean;
  /** índice donde ARRANCA la corrida repetida dentro de la línea */
  inicio: number;
  /** la unidad que se repite */
  unidad: string;
  /** cuántas veces consecutivas aparece */
  veces: number;
}

const SIN_HIT: RepeticionUnidad = { hit: false, inicio: -1, unidad: "", veces: 0 };

export interface OpcionesRepeticion {
  /** tamaño mínimo de la unidad que cuenta como «bloque» (evita ruido de 1-2 chars) */
  minUnidad?: number;
  /** tamaño máximo de la unidad a probar */
  maxUnidad?: number;
  /** cuántas repeticiones consecutivas disparan la alarma */
  minVeces?: number;
}

/**
 * ¿Hay una unidad de `minUnidad..maxUnidad` caracteres que se repite
 * CONSECUTIVAMENTE `>= minVeces` veces en algún punto de la línea?
 * La unidad debe tener ≥ 2 caracteres «con tinta» (tras `trim`) para no cazar
 * sangrías (`"    "`) ni rellenos de un solo signo (`"----"`, `"...."`).
 */
export function unidadRepetidaEnTexto(
  linea: string,
  opciones?: OpcionesRepeticion
): RepeticionUnidad {
  const minUnidad = Math.max(2, opciones?.minUnidad ?? 3);
  const maxUnidad = Math.max(minUnidad, opciones?.maxUnidad ?? 40);
  const minVeces = Math.max(3, opciones?.minVeces ?? 6);
  const s = linea;
  if (s.length < minUnidad * minVeces) return SIN_HIT;

  for (let u = minUnidad; u <= maxUnidad; u++) {
    if (s.length < u * minVeces) break;
    let i = 0;
    while (i + u * minVeces <= s.length) {
      const unidad = s.substr(i, u);
      let veces = 1;
      let j = i + u;
      while (j + u <= s.length && s.substr(j, u) === unidad) {
        veces++;
        j += u;
      }
      if (veces >= minVeces && unidad.trim().length >= 2) {
        // una unidad formada por un único carácter repetido (p. ej. "===") es
        // relleno decorativo, no degeneración del modelo: se ignora.
        const distintos = new Set(unidad.replace(/\s/g, "").split("")).size;
        if (distintos >= 2) return { hit: true, inicio: i, unidad, veces };
      }
      i = veces > 1 ? j - u + 1 : i + 1;
    }
  }
  return SIN_HIT;
}

/**
 * Longitud del prefijo común entre dos cadenas (en caracteres).
 */
function prefijoComun(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Dado el texto acumulado, ¿la cola (últimas `ventana` líneas) trae una línea
 * degenerada por sufijo creciente? Si sí, devuelve el texto RECORTADO justo
 * antes de esa línea (conservando todo lo bueno emitido hasta ahí).
 *
 * Al confirmar una línea degenerada se SUBE por las anteriores mientras
 * compartan un prefijo largo con ella (el bloque que iba creciendo línea a
 * línea), para tirar TODO el tramo degenerado de una vez — no solo la última.
 */
export function cortarDegeneracionSufijo(
  texto: string,
  opciones?: OpcionesRepeticion & { ventana?: number; minLineaLarga?: number; prefijoMin?: number }
): { hit: boolean; cortado: string } {
  const ventana = Math.max(1, opciones?.ventana ?? 3);
  const minLineaLarga = Math.max(16, opciones?.minLineaLarga ?? 24);
  const prefijoMin = Math.max(24, opciones?.prefijoMin ?? 40);
  const lineas = texto.split("\n");
  const tope = Math.max(0, lineas.length - ventana);
  for (let i = lineas.length - 1; i >= tope; i--) {
    const ln = lineas[i];
    if (ln.trim().length < minLineaLarga) continue;
    if (unidadRepetidaEnTexto(ln, opciones).hit) {
      // sube por el tramo que compartía el prefijo creciente con esta línea.
      let corte = i;
      while (corte - 1 >= 0 && prefijoComun(lineas[corte - 1], ln) >= prefijoMin) corte--;
      return { hit: true, cortado: lineas.slice(0, corte).join("\n") };
    }
  }
  return { hit: false, cortado: texto };
}

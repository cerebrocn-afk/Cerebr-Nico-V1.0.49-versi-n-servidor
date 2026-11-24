/**
 * src/engine/bucleDeBloques.ts — v1.62.0
 * ============================================================================
 * BUCLE POR POBREZA DE NOVEDAD (la forma que `degeneracionLineal` NO ve)
 *
 * 🐞 Sesión `1792793541672` (23/10), modelo `mistral-code-latest` (id de chat, sin
 * `fim`, así que el filtro de v1.60.20 tampoco lo excluía). Pregunta: «detalla
 * todos los errores». Respuesta: **102.088 caracteres**, 3.258 líneas, de las
 * cuales sólo **313 son distintas**. El modelo escribió **223 secciones**
 * numeradas (`### 1.` → `### 223.`) con el mismo esqueleto:
 *
 *   ### N. **Errores de X**
 *      - **Problema:** …
 *      - **Solución:** …
 *        ```python
 *        from fastapi import FastAPI
 *        app = FastAPI()          ← 85 veces en la misma respuesta
 *        …
 *        ```
 *
 * Medido con el detector de v1.61.0 sobre ese texto exacto:
 *   `cortarDegeneracionLineal` → hit: false, 0,0 % descartado.
 *
 * POR QUÉ LOS OTROS TRES DETECTORES NO ALCANZAN
 *   · `sanitizeRepetitiveLoop`  → exige repeticiones EXACTAS de una línea/trozo.
 *   · `cortarDegeneracionSufijo` → mide DENTRO de una línea (sufijo creciente).
 *   · `cortarDegeneracionLineal` → compara líneas VECINAS y pide racha de 6.
 *     Acá cada bloque trae un encabezado distinto, así que la comparación vecina
 *     corta la racha siempre. La repetición está ESTACIONADA: el intervalo entre
 *     dos apariciones de la misma línea es de 4 líneas en el mejor caso y de
 *     **340 (mediana)** en general. Nunca llega a 6 vecinas.
 *
 * LA MEDIDA QUE SÍ SEPARA: novedad
 * El bucle no repite líneas pegadas: **deja de aportar información nueva** y
 * recicla un puñado de plantillas a lo largo. Se mide sobre una ventana de cola:
 *
 *     distintas / total   y   masa de las TOP-K líneas más frecuentes
 *
 * Medido en el repo y en la sesión (ventana de 900 líneas con tinta, ≥ 8 chars):
 *
 *   | cuerpo                    | distintas/total | masa top-20 |
 *   |---------------------------|-----------------|-------------|
 *   | msg17 (DEGENERADO, 102 KB)|     0,236       |    0,293    |
 *   | server.ts (12.189 líneas) |     0,728       |    0,100    |
 *   | RightSidebar.tsx          |     0,676       |    0,170    |
 *   | CHANGELOG.md (5.293 tintas)|    0,973       |    0,022    |
 *
 * La regla exige las DOS condiciones a la vez (`razón ≤ 0,35` Y `masa ≥ 0,25`).
 * Por qué las dos: un archivo legítimo puede ser repetitivo (el CSS de
 * `RightSidebar` llega a 0,676 de novedad) pero nunca concentra un 25 % de su
 * ventana en veinte líneas clónicas; y un texto con mucho boilerplate disperso
 * (server.ts: masa 0,100) tampoco. Falso positivo con una sola de las dos señales
 * fue exactamente el error que se evitó acá.
 *
 * NO ES UN TECHO DE LONGITUD. La ventana pide 900 líneas *sin novedad*, no 900
 * líneas: `CHANGELOG.md` tiene 5.293 líneas con tinta y pasa limpio (0,973). Una
 * respuesta larga Y distinta nunca corta; una respuesta larga que sólo se repite
 * a sí misma corta temprano.
 *
 * MÓDULO PURO: sin red, sin fs, sin estado global. Tests con el defecto REAL
 * sembrado en `tests/fixtures/sesion-1792793541672-msg17-degenerado.txt`.
 */

export interface OpcionesBloques {
  /** Líneas con tinta mínimas antes de juzgar nada (evita cortar respuestas chicas). */
  minTinta?: number;
  /** Tamaño de la ventana de novedad, en líneas con tinta. */
  ventana?: number;
  /** Bajo esta razón de líneas distintas/total hay pobreza de novedad. */
  maxRazon?: number;
  /** Masa mínima de las `topK` líneas más frecuentes para confirmar. */
  minMasa?: number;
  /** Cuántas líneas cuentan como «las más frecuentes». */
  topK?: number;
  /** Líneas más cortas que esto no cuentan (sangrías, llaves, `​```). */
  minLinea?: number;
  /** Hasta cuántas ventanas se retrocede buscando el inicio del colapso (costo acotado). */
  maxAtras?: number;
}

export interface ResultadoBloques {
  hit: boolean;
  /** Texto conservado (todo lo anterior al colapso de novedad). */
  cortado: string;
  /** Línea del texto original donde se cortó. */
  lineaCorte: number;
  /** Razón distintas/total de la ventana sospechada. */
  razon: number;
  /** Masa de las topK líneas en esa ventana. */
  masa: number;
}

export interface EstadisticaVentana {
  razon: number;
  masa: number;
}

const SIN_HIT: ResultadoBloques = { hit: false, cortado: "", lineaCorte: -1, razon: 1, masa: 0 };

/**
 * Normaliza una línea para comparar formas y no contenido: recorta, pasa a
 * minúsculas y cambia las cadenas por `S` (el nombre del error cambia, la forma
 * del `console.log("…")` no). Las CIFRAS SE CONSERVAN a propósito.
 *
 * 🐞 Medido contra un falso positivo que la primera versión tenía: una lista
 * legítima de 1200 archivos (`· archivo 7/src/modulo7/index.ts — hace la parte
 * 21 del sistema.`) se vuelve LA MISMA LÍNEA 1200 veces si se doblan las cifras
 * a `#`. Razón de novedad 0,001 → el detector la cortaba. Conservando las cifras
 * esa misma lista da 1,000 de novedad y pasa limpia, mientras el bucle real de la
 * sesión sigue dando 0,296 (contra umbral 0,35). Es decir: doblar cifras no
 * ayudaba a detectar nada y rompía un caso legítimo.
 */
export function normalizarParaNovedad(linea: string): string {
  const s = String(linea || "").trim().toLowerCase();
  return s.replace(/(["'`]).*?\1/g, "S");
}

/**
 * Normalización que sí dobla cifras: para comparar RESPUESTAS enteras donde el
 * renumberado es parte del bucle (ver `ecoRespuestas`). No usar para novedad.
 */
export function normalizarLinea(linea: string): string {
  return normalizarParaNovedad(linea).replace(/\d+/g, "#");
}

/** Distintas/total y masa de las `topK` líneas más frecuentes, sobre un conteo. */
export function estadisticaDeConteo(conteo: Map<string, number>, total: number, topK: number): EstadisticaVentana {
  if (total <= 0 || conteo.size === 0) return { razon: 1, masa: 0 };
  const frecuencias = Array.from(conteo.values()).sort((a, b) => b - a);
  let masaLineas = 0;
  for (let i = 0; i < Math.min(topK, frecuencias.length); i++) masaLineas += frecuencias[i];
  return { razon: conteo.size / total, masa: masaLineas / total };
}

/**
 * Estadísticas de una ventana de cola: si está pobre de novedad.
 * Pobre = pocas líneas distintas Y mucha concentración en las top-K.
 */
export function ventanaPobre(conteo: Map<string, number>, total: number, topK: number, maxRazon: number, minMasa: number): boolean {
  const est = estadisticaDeConteo(conteo, total, topK);
  return est.razon <= maxRazon && est.masa >= minMasa;
}

export interface Colapso {
  /** Índice (en la secuencia con tinta) donde arranca el colapso sostenido. */
  inicio: number;
  razon: number;
  masa: number;
}

/**
 * COLAPSO SOSTENIDO EN LA COLA. Devuelve dónde empezó el último tramo en el que
 * ninguna ventana recuperó novedad, o `null` si la última ventana sí es novedosa.
 *
 * Por qué anclado en la cola y no «buscar el tramo peor»: medido con ventana de
 * 900 líneas y las dos condiciones, la únima señal que separa sin margen dudoso es
 * si LO ÚltIMO GENERADO sigue siendo nuevo.
 *
 *   | corpus                       | última ventana pobre | corta en |
 *   |------------------------------|-----------------------|----------|
 *   | msg17 (DEGENERADO real)      | SÍ                   | 1 % del texto |
 *   | FIM 262 KB                   | SÍ                   | 0 % |
 *   | 160 bloques sintéticos       | SÍ                   | 0 % |
 *   | larga que RECUPERA novedad   | NO                    | no corta |
 *   | lista numerada de 1200 ítems | NO                    | no corta |
 *   | server.ts / CHANGELOG / App  | NO                    | no corta |
 *
 * Un detector que buscaba «el peor tramo» cortaba la respuesta legítima que tenía
 * 70 bloques repetitivos en el medio y dejaba pasar la degeneración real: la
 * degeneración verdadera no tiene un pico, tiene una cola que no para de reciclarse.
 */
export function colapsoSostenidoEnCola(
  secuencia: string[],
  ventana: number,
  topK: number,
  maxRazon: number,
  minMasa: number,
  maxAtras = 2500
): Colapso | null {
  const n = secuencia.length;
  if (n < ventana) return null;
  const conteo = new Map<string, number>();
  const agregar = (s: string) => conteo.set(s, (conteo.get(s) ?? 0) + 1);
  const quitar = (s: string) => {
    const v = (conteo.get(s) ?? 1) - 1;
    if (v <= 0) conteo.delete(s);
    else conteo.set(s, v);
  };
  // Se posiciona la ventana en el FINAL: es el juicio que decide.
  for (let i = n - ventana; i < n; i++) agregar(secuencia[i]);
  const estUltima = estadisticaDeConteo(conteo, ventana, topK);
  if (!(estUltima.razon <= maxRazon && estUltima.masa >= minMasa)) return null;

  let inicio = n - ventana;
  let pasos = 0;
  while (inicio > 0 && pasos < maxAtras) {
    // Correr la ventana una línea hacia atrás: entra la de la izquierda, sale la de la derecha.
    agregar(secuencia[inicio - 1]);
    quitar(secuencia[inicio + ventana - 1]);
    if (!ventanaPobre(conteo, ventana, topK, maxRazon, minMasa)) break;
    inicio--;
    pasos++;
  }
  return { inicio, razon: estUltima.razon, masa: estUltima.masa };
}

/**
 * Detecta el bucle por pobreza de novedad y devuelve el texto recortado.
 * Escanea sólo la cola (`ventana * 3` líneas), porque en streaming lo que importa
 * es si LO QUE VIENE SALIENDO sigue aportando algo nuevo.
 */
export function cortarBucleDeBloques(texto: string, opciones?: OpcionesBloques): ResultadoBloques {
  const minTinta = Math.max(200, opciones?.minTinta ?? 900);
  const ventana = Math.max(50, opciones?.ventana ?? 900);
  const maxRazon = Math.min(1, Math.max(0, opciones?.maxRazon ?? 0.35));
  const minMasa = Math.min(1, Math.max(0, opciones?.minMasa ?? 0.25));
  const topK = Math.max(2, opciones?.topK ?? 20);
  const minLinea = Math.max(4, opciones?.minLinea ?? 8);

  const t = String(texto || "");
  // Costo acotado: sin 900 líneas de al menos 8 caracteres no hay nada que juzgar.
  if (t.length < minTinta * minLinea) return { ...SIN_HIT, cortado: t };

  const lineas = t.split("\n");
  const indices: number[] = [];
  const seq: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const n = normalizarParaNovedad(lineas[i]);
    if (n.length >= minLinea) {
      indices.push(i);
      seq.push(n);
    }
  }
  if (seq.length < minTinta || seq.length < ventana) return { ...SIN_HIT, cortado: t };

  const colapso = colapsoSostenidoEnCola(seq, Math.min(ventana, seq.length), topK, maxRazon, minMasa, opciones?.maxAtras ?? 2500);
  if (!colapso) return { ...SIN_HIT, cortado: t };

  const lineaCorte = indices[colapso.inicio];
  return {
    hit: true,
    cortado: lineas.slice(0, lineaCorte).join("\n"),
    lineaCorte,
    razon: colapso.razon,
    masa: colapso.masa,
  };
}

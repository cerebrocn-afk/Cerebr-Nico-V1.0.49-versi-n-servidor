/**
 * prosaLegible.ts — EL CHAT SE LLE, NO SE DECODIFICA (v1.92.0)
 * =============================================================
 * POR QUÉ EXISTE. El chat dibujaba el texto del modelo con `whitespace-pre-wrap`
 * a secas. Los modelos hablan en Markdown — y Mario pidió «mejor estética para
 * mejor comprensión del chat» — así que el usuario leía los HUESOS del formato en
 * vez de la idea: `**negrita**`, `### título`, `- viñeta`, `| celda | celda |`,
 * `` `código` ``. En un informe de 20.000 caracteres eso no es estética: es
 * fricción en cada línea, y el que paga el peaje es el que lee.
 *
 * QUÉ HACE. Convierte texto Markdown en una lista de BLOQUES planos (título,
 * párrafo, lista, cita, tabla, separador) y cada línea en TRAMOS con su marca
 * (negrita, énfasis, código, enlace). No produce HTML: entrega datos, y la vista
 * (`ProsaLegible` en ChatCenter.tsx) decide cómo pintarlos.
 *
 * LO QUE NO HACE, Y ES A PROPÓSITO:
 *  · No toca el crudo. `msg.content` sigue intacto; copiar, voz (TTS) y export
 *    leen el original, como en v1.70.6. Esto solo reordena la PRESENTACIÓN.
 *  · No ejecuta HTML ni interpreta `<script>`: devuelve tramos de texto. Un
 *    modelo que escriba HTML en su respuesta lo ve como texto, nunca como nodo.
 *  · No inventa estructura. Si una línea no calza con un patrón conocido es
 *    párrafo, y un bloque de tabla incompleto (sin línea de separación) sigue
 *    siendo párrafo: es mejor Markdown sin renderizar que una tabla inventada.
 *  · No abre vallas de código: eso lo hace `segmentarMensaje` (fichas plegables).
 *    Aquí se recibe PROSA ya separada; si un bloque cercado llega igual (el
 *    mensaje no es denso), se preserva como bloque de código literal.
 *
 * CRITERIO PURO: sin React, sin `fs`, sin red, sin dependencias. Es lo que
 * permiten los tests (`tests/prosaLegible.test.ts`) y lo que impide que la vista
 * se convierta en la dueña de la interpretación.
 */

export type Tramo =
  | { t: "s"; texto: string }   // sin marca
  | { t: "b"; texto: string }   // negrita
  | { t: "i"; texto: string }   // énfasis
  | { t: "c"; texto: string }   // código inline
  | { t: "a"; texto: string; href: string }; // enlace

export type BloqueProsa =
  | { tipo: "titulo"; nivel: number; tramos: Tramo[] }
  | { tipo: "parrafo"; tramos: Tramo[] }
  | { tipo: "lista"; ordenada: boolean; items: { tramos: Tramo[]; nivel: number; hecho: boolean | null }[] }
  | { tipo: "cita"; tramos: Tramo[]; origen?: string }
  | { tipo: "tabla"; cabecera: Tramo[][]; filas: Tramo[][][] }
  | { tipo: "separador" }
  | { tipo: "codigo"; lenguaje: string; contenido: string };

// ─────────────────────────────────────────────────────────────────────────────
// TRAMOS EN LÍNEA
// ─────────────────────────────────────────────────────────────────────────────

/** Enlace Markdown con destino razonable: http(s), mailto o ruta relativa. */
const RE_ENLACE = /\[([^\]\n]{1,200})\]\(([^)\s]{1,400})\)/g;
const HREF_SEGURO = /^(https?:\/\/|mailto:|\.?\/|#)/i;

/** Código inline: `x` o ``x``. Se resuelve primero para que la negrita no se
 *  coma los asteriscos de adentro de un comando. */
const RE_CODIGO = /(`+)([^`\n]+?)\1/g;

/** Negrita (`**x**` o `__x__`) antes que el énfasis, con el interior corto a
 *  propósito: un `**` perdido en medio de un párrafo no debe tragarse el resto. */
const RE_NEGRITA = /(?:\*\*|__)(?=\S)([\s\S]{1,300}?\S)(?:\*\*|__)/g;
const RE_ENFASIS = /(?:^|[^*])\*(?=\S)([^*\n]{1,200}?\S)\*(?!\*)/g;

type Marca = "b" | "i" | "c" | "a";

interface hallazgo {
  desde: number;
  hasta: number;
  marca: Marca;
  texto: string;
  href?: string;
}

/** Une los hallazgos de los cuatro patrones sin solaparse: gana el de más
 *  arriba en la cadena y, a igualdad, el más específico (código > enlace >
 *  negrita > énfasis). */
function juntar(src: string, patrones: [RegExp, Marca][]): hallazgo[] {
  const marcas: hallazgo[] = [];
  for (const [re, marca] of patrones) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m.index === undefined) break;
      if (marca === "a") {
        const href = String(m[2] || "");
        if (!HREF_SEGURO.test(href)) continue;
        marcas.push({ desde: m.index, hasta: m.index + m[0].length, marca, texto: m[1], href });
      } else if (marca === "c") {
        marcas.push({ desde: m.index, hasta: m.index + m[0].length, marca, texto: m[2] });
      } else if (marca === "b") {
        marcas.push({ desde: m.index, hasta: m.index + m[0].length, marca, texto: m[1] });
      } else {
        // El énfasis captura el carácter previo para no comerse una negrita: el
        // tramo empieza DESPUÉS de ese carácter.
        const previo = m[0].length - m[1].length - 2;
        marcas.push({ desde: m.index + previo, hasta: m.index + m[0].length, marca, texto: m[1] });
      }
    }
  }
  marcas.sort((a, b) => a.desde - b.desde || prioridad(b.marca) - prioridad(a.marca));
  const out: hallazgo[] = [];
  let cursor = -1;
  for (const h of marcas) {
    if (h.desde >= cursor) {
      out.push(h);
      cursor = h.hasta;
    }
  }
  return out;
}

const prioridad = (m: Marca): number => (m === "c" ? 4 : m === "a" ? 3 : m === "b" ? 2 : 1);

/** Una línea → tramos. La concatenación de los `texto` más los marcadores que
 *  se comió es la línea original: nunca se pierde contenido, solo marcas. */
export function parsearTramos(linea: string): Tramo[] {
  const src = String(linea ?? "");
  if (!src) return [];
  const hallazgos = juntar(src, [
    [RE_CODIGO, "c"],
    [RE_ENLACE, "a"],
    [RE_NEGRITA, "b"],
    [RE_ENFASIS, "i"],
  ]);
  const tramos: Tramo[] = [];
  let i = 0;
  for (const h of hallazgos) {
    if (h.desde > i) tramos.push({ t: "s", texto: src.slice(i, h.desde) });
    tramos.push(h.marca === "a" ? { t: "a", texto: h.texto, href: h.href! } : { t: h.marca, texto: h.texto });
    i = h.hasta;
  }
  if (i < src.length) tramos.push({ t: "s", texto: src.slice(i) });
  return tramos;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUES
// ─────────────────────────────────────────────────────────────────────────────

const RE_TITULO = /^(#{1,6})\s+(\S.*)$/;
const RE_SEPARADOR = /^\s*(?:[-*_]\s*){3,}$/;
const RE_VIÑETA = /^(\s*)([-*+•])\s+(\S.*)$/;
const RE_NUMERADA = /^(\s*)(\d{1,3})[.)]\s+(\S.*)$/;
const RE_CITA = /^\s*>\s?(.*)$/;
const RE_CASILLA = /^\[( |x|X)\]\s+(.*)$/;
const RE_BLOQUE_CERCADO = /^\s*```([^`\n]*)$/;

/** `| a | b |` → ["a","b"]. Devuelve null si la línea no es de tabla. */
function partirFila(linea: string): string[] | null {
  const s = String(linea).trim();
  if (!s.startsWith("|")) return null;
  const cuerpo = s.replace(/^\|/, "").replace(/\|$/, "");
  if (!cuerpo.trim()) return null;
  return cuerpo.split("|").map((c) => c.trim());
}

/** `|---|:--:|` — la línea que convierte dos filas en tabla. */
const ES_SEPARADOR_TABLA = (celdas: string[] | null): boolean =>
  !!celdas && celdas.length > 0 && celdas.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));

/**
 * Texto Markdown → bloques. Vacío ⇒ lista vacía (la vista decide el hueco).
 * Ninguna entrada puede lanzar: lo que no se reconoce es párrafo.
 */
export function parsearProsa(texto: string): BloqueProsa[] {
  const src = String(texto ?? "");
  if (!src.trim()) return [];
  const lineas = src.split("\n");
  const bloques: BloqueProsa[] = [];

  let parrafo: string[] = [];
  let lista: { tramos: Tramo[]; nivel: number; hecho: boolean | null }[] = [];
  let listaOrdenada = false;
  let cita: string[] = [];
  let cercado: { lenguaje: string; lineas: string[] } | null = null;

  const cerrarParrafo = () => {
    if (!parrafo.length) return;
    bloques.push({ tipo: "parrafo", tramos: parsearTramos(parrafo.join(" ").trim()) });
    parrafo = [];
  };
  const cerrarLista = () => {
    if (!lista.length) return;
    bloques.push({ tipo: "lista", ordenada: listaOrdenada, items: lista });
    lista = [];
  };
  const cerrarCita = () => {
    if (!cita.length) return;
    bloques.push({ tipo: "cita", tramos: parsearTramos(cita.join(" ").trim()) });
    cita = [];
  };
  const cerrarTodo = () => {
    cerrarParrafo();
    cerrarLista();
    cerrarCita();
  };

  for (let idx = 0; idx < lineas.length; idx++) {
    const linea = lineas[idx];

    // Bloque cercado dentro de la prosa (mensaje NO denso, o una valla suelta):
    // se conserva literal, sin interpretar marcas adentro.
    if (cercado) {
      if (/^\s*```\s*$/.test(linea)) {
        bloques.push({ tipo: "codigo", lenguaje: cercado.lenguaje, contenido: cercado.lineas.join("\n") });
        cercado = null;
      } else cercado.lineas.push(linea);
      continue;
    }
    const mCercado = RE_BLOQUE_CERCADO.exec(linea);
    if (mCercado) {
      cerrarTodo();
      cercado = { lenguaje: String(mCercado[1] || "").trim().slice(0, 24), lineas: [] };
      continue;
    }

    if (!linea.trim()) {
      cerrarParrafo();
      cerrarLista();
      cerrarCita();
      continue;
    }

    if (RE_SEPARADOR.test(linea)) {
      cerrarTodo();
      bloques.push({ tipo: "separador" });
      continue;
    }

    // Tabla: fila + línea de separación + al menos una fila de datos.
    const fila = partirFila(linea);
    if (fila) {
      const sig = lineas[idx + 1] !== undefined ? partirFila(lineas[idx + 1]) : null;
      if (ES_SEPARADOR_TABLA(sig)) {
        cerrarTodo();
        const cabecera = fila.map((c) => parsearTramos(c));
        const filas: Tramo[][][] = [];
        let j = idx + 2;
        for (; j < lineas.length; j++) {
          const f = partirFila(lineas[j]);
          if (!f || ES_SEPARADOR_TABLA(f)) break;
          filas.push(fila.map((_, k) => parsearTramos(f[k] ?? "")));
        }
        bloques.push({ tipo: "tabla", cabecera, filas });
        idx = j - 1;
        continue;
      }
    }

    const mTitulo = RE_TITULO.exec(linea);
    if (mTitulo) {
      cerrarTodo();
      bloques.push({ tipo: "titulo", nivel: mTitulo[1].length, tramos: parsearTramos(mTitulo[2].trim()) });
      continue;
    }

    const mCita = RE_CITA.exec(linea);
    if (mCita) {
      cerrarParrafo();
      cerrarLista();
      cita.push(mCita[1].trim());
      continue;
    }

    const mV = RE_VIÑETA.exec(linea);
    const mN = mV ? null : RE_NUMERADA.exec(linea);
    if (mV || mN) {
      cerrarParrafo();
      cerrarCita();
      const ordenada = Boolean(mN);
      const bruto = (mV ? mV[3] : mN![3]).trim();
      const indent = ((mV ? mV[1] : mN![1]).length / 2) | 0;
      if (lista.length && ordenada !== listaOrdenada) cerrarLista();
      listaOrdenada = ordenada;
      const mCasilla = RE_CASILLA.exec(bruto);
      lista.push({
        tramos: parsearTramos(mCasilla ? mCasilla[2] : bruto),
        nivel: Math.max(0, Math.min(indent, 3)),
        hecho: mCasilla ? mCasilla[1].toLowerCase() === "x" : null,
      });
      continue;
    }

    if (lista.length) cerrarLista();
    if (cita.length) cerrarCita();
    parrafo.push(linea.trim());
  }

  if (cercado) {
    // Valla abierta (streaming): se muestra lo que hay, marcado como código.
    bloques.push({ tipo: "codigo", lenguaje: cercado.lenguaje, contenido: cercado.lineas.join("\n") });
  }
  cerrarTodo();
  return bloques;
}

/** ¿El texto trae marcas de formato que justifican renderizar? Se usa para no
 *  montar estructura de más sobre charla plana («sí, listo») y para que el test
 *  pueda exigir: si hay marcas, hay bloques con marca. */
export function tieneMarcasDeFormato(texto: string): boolean {
  const s = String(texto ?? "");
  return /(\*\*|__|`|^\s*[-*+•]\s|^\s*\d+[.)]\s|^\s*#{1,6}\s|^\s*>\s|^\|.*\||^\s*(?:[-*_]\s*){3,}$)/m.test(s);
}

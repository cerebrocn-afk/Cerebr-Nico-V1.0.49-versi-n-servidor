/**
 * concienciaArtista.ts — LA CONCIENCIA DE ARTISTA, HECHA MEDIBLE (v1.26.0)
 * ========================================================================
 * QUÉ ES: el juez determinista del BUCLE CREADOR/MODIFICADOR. Decide, SIN
 * llamar al modelo, si un artefacto (HTML / JSX / CSS / página de app) está
 * «terminado de artista» o si todavía hay que volver a la mesa a modificarlo — y
 * en ese caso, con qué directiva EXACTA se empuja la siguiente iteración.
 *
 * POR QUÉ EXISTE (evolución x5 de v1.25.0): en v1.25.0 la conciencia de artista
 * eran TRES preguntas retóricas dentro del prompt (¿es lo mejor?, ¿se ve
 * terminado?, ¿entendí la intención?). Una pregunta retórica en el prompt es
 * FE: el modelo pequeño la lee y la ignora. Aquí se convierte en MECÁNICA: cinco
 * ejes de oficio, cada uno con señales detectables en el texto del artefacto,
 * un puntaje 0-10 y un umbral de entrega. El compilador dice si el código
 * *corre*; esta pieza dice si *merece entregarse*.
 *
 * DIFERENCIA CON bucleAutonomo.ts: aquel juzga la TAREA (¿queda plan abierto?);
 * este juzga la OBRA (¿está bien hecha?). Uno cierra el turno, el otro cierra
 * el oficio. Se complementan: el bucle no se detiene a mitad, y cuando ya no se
 * detiene, la conciencia decide si lo hecho es digno o hay que pulirlo.
 *
 * REGLAS DE LA CASA que respeta:
 *   · PURA FUNCIÓN — sin estado, sin red, sin modelo; vive fuera de server.ts.
 *   · HONESTIDAD (§2.1) — mide señales, no promete gusto; un 10/10 dice
 *     «pasó las cinco puertas», no «es bonito». El gusto no se automatiza; el
 *     OFICIO sí se audita.
 *   · CERO RELLENO (§2.3) — la directiva de la próxima iteración es una orden
 *     corta y accionable, no un discurso.
 */

import type { FaseBucle } from "./bucleAutonomo";

/** Los cinco ejes del oficio. El nombre es el que ve el modelo en la directiva. */
export type EjeArtista =
  | "terminacion_visual"
  | "estados_completos"
  | "accesibilidad_oficio"
  | "coherencia_sistema"
  | "intencion_cumplida";

export interface HallazgoEje {
  eje: EjeArtista;
  /** 0 = crudo · 1 = a medias · 2 = de oficio. */
  puntos: 0 | 1 | 2;
  /** Qué se detectó (para el informe honesto). */
  senales: string[];
  /** Qué falta para subir de escalón (la materia de la próxima iteración). */
  faltan: string[];
}

export interface Artefacto {
  /** Ruta del archivo principal (define el tipo: .html / .tsx / .jsx / .vue). */
  ruta: string;
  /** Código fuente del artefacto principal. */
  fuente: string;
  /** CSS asociado (inline o de archivos enlazados), concatenado. Opcional. */
  css?: string;
  /** Lo que el usuario pidió, en crudo. Sirve para el eje intencion_cumplida. */
  brief?: string;
}

export type VeredictoArtista =
  | "entregar"        // pasó el umbral: es digno de mostrar
  | "pulir"           // corre y casi está; una iteración más de modificación
  | "rehacer_pieza";  // crudo: falta oficio de fondo, no un retoque

export interface DictamenArtista {
  veredicto: VeredictoArtista;
  /** 0-10. Suma de los cinco ejes (cada uno 0-2). */
  puntaje: number;
  ejes: HallazgoEje[];
  /** Directiva corta y accionable para la SIGUIENTE iteración del bucle. */
  directiva: string;
  /** Fase sugerida del bucle creador/modificador para el próximo paso. */
  faseSiguiente: FaseBucle;
  /** Informe honesto de una línea por eje, para la voz del agente. */
  informe: string;
}

// ── Umbrales del bucle ───────────────────────────────────────────────────────
// Se entrega con 9-10 (a lo sumo un eje a medias). Se pule con 6-8. Debajo de 6
// es crudo: no es un retoque, falta oficio de base y hay que rehacer la pieza.
export const UMBRAL_ENTREGA = 9;
export const UMBRAL_PULIR = 6;
/** Tope de vueltas del bucle: pulir sin fin no es oficio, es indecisión. */
export const MAX_ITERACIONES_ARTISTA = 4;

// ── Utilidades de detección (deterministas, sin modelo) ──────────────────────
function esFrontend(ruta: string): boolean {
  return /\.(html?|tsx|jsx|vue|svelte)$/i.test(ruta);
}
function cuenta(re: RegExp, s: string): number {
  const m = s.match(re);
  return m ? m.length : 0;
}
function tiene(re: RegExp, s: string): boolean {
  return re.test(s);
}

// ── EJE 1 · Terminación visual ───────────────────────────────────────────────
// Jerarquía (h1..h3), sistema de espaciado, y CERO placeholders de relleno.
export function ejeTerminacionVisual(a: Artefacto): HallazgoEje {
  const s = a.fuente;
  const css = a.css ?? s;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;

  const placeholders = cuenta(/\[(?:Personaliza este texto|placeholder|TODO)\]|Lorem ipsum/gi, s);
  const hayJerarquia = tiene(/<h1[\s>]/i, s) && tiene(/<h2[\s>]|<h3[\s>]/i, s);
  const hayEspaciado = tiene(/(margin|padding|gap|space-y|space-x)\b/i, css) || tiene(/gap-\d|p-\d|m-\d/i, s);

  if (placeholders > 0) {
    faltan.push(`quitar ${placeholders} placeholder(s) de relleno y poner contenido real`);
  } else {
    senales.push("sin placeholders de relleno");
    p++;
  }
  if (hayJerarquia && hayEspaciado) {
    senales.push("jerarquía tipográfica + sistema de espaciado");
    p = Math.min(2, p + 1);
  } else {
    if (!hayJerarquia) faltan.push("dar jerarquía (h1 + h2/h3, no todo del mismo tamaño)");
    if (!hayEspaciado) faltan.push("aplicar un sistema de espaciado (margin/padding/gap coherentes)");
  }
  return { eje: "terminacion_visual", puntos: p as 0 | 1 | 2, senales, faltan };
}

// ── EJE 2 · Estados completos ────────────────────────────────────────────────
// Una UI real tiene más de un estado: vacío, carga, error, éxito. Un solo
// estado «todo lleno y perfecto» es una maqueta, no un producto.
export function ejeEstadosCompletos(a: Artefacto): HallazgoEje {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];

  const carga = tiene(/loading|cargando|spinner|skeleton|isLoading|aria-busy/i, s);
  const error = tiene(/error|catch\s*\(|onError|try\s*\{|\.catch\(/i, s);
  const vacio = tiene(/empty|vac[ií]o|no hay|sin resultados|length\s*===\s*0|\.length\s*\?/i, s);

  let cubiertos = 0;
  if (carga) { senales.push("estado de carga"); cubiertos++; } else faltan.push("estado de carga (spinner/skeleton)");
  if (error) { senales.push("manejo de error"); cubiertos++; } else faltan.push("estado de error (qué ve el usuario si falla)");
  if (vacio) { senales.push("estado vacío"); cubiertos++; } else faltan.push("estado vacío (lista sin datos)");

  const p = cubiertos >= 3 ? 2 : cubiertos >= 1 ? 1 : 0;
  return { eje: "estados_completos", puntos: p as 0 | 1 | 2, senales, faltan };
}

// ── EJE 3 · Accesibilidad y oficio ───────────────────────────────────────────
// Lo que separa un maquetado de un trabajo con oficio: alt en imágenes, labels
// en inputs, semántica (no todo <div>), foco de teclado.
export function ejeAccesibilidadOficio(a: Artefacto): HallazgoEje {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;

  const imgs = cuenta(/<img\b/gi, s);
  const imgsSinAlt = imgs > 0 && cuenta(/<img\b(?![^>]*\balt=)/gi, s) > 0;
  const inputs = cuenta(/<input\b|<textarea\b|<select\b/gi, s);
  const hayLabels = tiene(/<label\b|aria-label|aria-labelledby|placeholder=/i, s);
  const semantica = tiene(/<(header|nav|main|section|article|footer|button)\b/i, s);

  if (imgs === 0 || !imgsSinAlt) {
    if (imgs > 0) { senales.push("imágenes con alt"); p++; }
  } else {
    faltan.push("añadir alt a todas las imágenes");
  }
  if (inputs === 0 || hayLabels) {
    if (inputs > 0) { senales.push("campos con label/aria"); }
    if (semantica) { senales.push("HTML semántico"); }
    if (semantica || (inputs > 0 && hayLabels)) p = Math.min(2, p + 1);
  } else {
    faltan.push("etiquetar los campos (label o aria-label)");
  }
  if (!semantica) faltan.push("usar etiquetas semánticas (header/nav/main/button, no sólo div)");
  return { eje: "accesibilidad_oficio", puntos: p as 0 | 1 | 2, senales, faltan };
}

// ── EJE 4 · Coherencia de sistema ────────────────────────────────────────────
// Un artista trabaja con un sistema, no con números sueltos: variables/tokens de
// color, sin un arcoíris de hex distintos, sin «magic numbers» repetidos.
export function ejeCoherenciaSistema(a: Artefacto): HallazgoEje {
  const css = a.css ?? a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;

  const usaVariables = tiene(/var\(--|:root|--[a-z-]+\s*:|theme\(|@apply|tokens?/i, css);
  const hexDistintos = new Set((css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((h) => h.toLowerCase()));
  const arcoiris = hexDistintos.size > 8;

  if (usaVariables) { senales.push("tokens/variables de diseño"); p++; }
  else faltan.push("centralizar color y espaciado en variables/tokens (:root o theme)");

  if (!arcoiris) { senales.push(`paleta contenida (${hexDistintos.size} colores)`); p = Math.min(2, p + 1); }
  else faltan.push(`reducir la paleta: ${hexDistintos.size} colores sueltos es un arcoíris, no un sistema`);

  return { eje: "coherencia_sistema", puntos: p as 0 | 1 | 2, senales, faltan };
}

// ── EJE 5 · Intención cumplida ───────────────────────────────────────────────
// ¿Entregó lo pedido o sólo lo que compiló? Sin marcadores perezosos, y las
// palabras clave del brief aparecen en la obra.
export function ejeIntencionCumplida(a: Artefacto): HallazgoEje {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;

  const perezosos = cuenta(/\/\/\s*resto\s+igual|\.\.\.\s*\(truncad|TODO\b|FIXME\b|<!--\s*resto/gi, s);
  if (perezosos === 0) { senales.push("sin marcadores perezosos"); p++; }
  else faltan.push(`eliminar ${perezosos} marcador(es) perezoso(s) y escribir el código entero`);

  const brief = (a.brief ?? "").toLowerCase();
  const claves = Array.from(new Set(
    brief.split(/[^a-záéíóúñ]+/i).filter((w) => w.length >= 5)
  )).slice(0, 8);
  if (claves.length === 0) {
    // Sin brief no se puede medir la intención: no se premia ni se castiga.
    if (perezosos === 0) p = Math.min(2, p + 1);
    senales.push("sin brief que contrastar (intención asumida estándar)");
  } else {
    const cubiertas = claves.filter((k) => s.toLowerCase().includes(k));
    const ratio = cubiertas.length / claves.length;
    if (ratio >= 0.6) { senales.push(`intención cubierta (${cubiertas.length}/${claves.length} claves)`); p = Math.min(2, p + 1); }
    else faltan.push(`faltan claves del pedido en la obra: ${claves.filter((k) => !cubiertas.includes(k)).join(", ")}`);
  }
  return { eje: "intencion_cumplida", puntos: p as 0 | 1 | 2, senales, faltan };
}

// ── EL JUEZ ──────────────────────────────────────────────────────────────────
const NOMBRE_EJE: Record<EjeArtista, string> = {
  terminacion_visual: "Terminación visual",
  estados_completos: "Estados completos",
  accesibilidad_oficio: "Accesibilidad y oficio",
  coherencia_sistema: "Coherencia de sistema",
  intencion_cumplida: "Intención cumplida",
};

/**
 * Evalúa un artefacto por los cinco ejes y decide si se entrega o se sigue
 * puliendo. Pura y determinista: la misma entrada da el mismo dictamen.
 */
export function evaluarObra(a: Artefacto): DictamenArtista {
  // Artefactos que no son de interfaz no pasan por la vara visual: se juzgan
  // sólo por intención cumplida, y con eso basta para no bloquear un script.
  const ejes: HallazgoEje[] = esFrontend(a.ruta)
    ? [
        ejeTerminacionVisual(a),
        ejeEstadosCompletos(a),
        ejeAccesibilidadOficio(a),
        ejeCoherenciaSistema(a),
        ejeIntencionCumplida(a),
      ]
    : [ejeIntencionCumplida(a)];

  const maxPosible = ejes.length * 2;
  const crudo = ejes.reduce((s, e) => s + e.puntos, 0);
  // Normaliza a escala 0-10 para que un no-frontend (1 eje) sea comparable.
  const puntaje = Math.round((crudo / maxPosible) * 10);

  let veredicto: VeredictoArtista;
  if (puntaje >= UMBRAL_ENTREGA) veredicto = "entregar";
  else if (puntaje >= UMBRAL_PULIR) veredicto = "pulir";
  else veredicto = "rehacer_pieza";

  const pendientes = ejes
    .filter((e) => e.puntos < 2)
    .sort((x, y) => x.puntos - y.puntos)
    .flatMap((e) => e.faltan);

  const directiva = construirDirectiva(veredicto, pendientes);
  const faseSiguiente: FaseBucle =
    veredicto === "entregar" ? "modificar" : veredicto === "pulir" ? "modificar" : "crear";

  const informe = ejes
    .map((e) => `${NOMBRE_EJE[e.eje]}: ${e.puntos}/2` + (e.faltan.length ? ` — falta: ${e.faltan[0]}` : " — ok"))
    .join("\n");

  return { veredicto, puntaje, ejes, directiva, faseSiguiente, informe };
}

function construirDirectiva(veredicto: VeredictoArtista, pendientes: string[]): string {
  if (veredicto === "entregar") {
    return "Obra digna de entregar (>=9/10). Enciénde el sandbox para la confirmación final; no la pules más sin motivo.";
  }
  const top = pendientes.slice(0, 3);
  if (veredicto === "pulir") {
    return (
      "Corre pero aún no está de oficio. Una iteración de MODIFICACIÓN, sin reescribir de cero: " +
      top.map((x, i) => `${i + 1}) ${x}`).join("; ") + "."
    );
  }
  return (
    "Crudo: falta oficio de base, no un retoque. Rehacé la pieza atendiendo primero: " +
    top.map((x, i) => `${i + 1}) ${x}`).join("; ") + "."
  );
}

/**
 * El BUCLE completo, como función pura: decide si seguir iterando y qué hacer.
 * `iteracion` es 0-based (como el `for` del motor). Corta por umbral o por tope,
 * y —regla de la casa— nunca dice «listo» con obra cruda: informa el motivo.
 */
export type ParadaArtista = "objetivo_alcanzado" | "max_iteraciones" | "seguir";

export interface PasoBucleArtista {
  parada: ParadaArtista;
  dictamen: DictamenArtista;
  /** Qué hacer ahora, ya redactado para el modelo. */
  siguiente: string;
}

export function pasoBucleCreadorModificador(
  a: Artefacto,
  iteracion: number,
  maxIteraciones = MAX_ITERACIONES_ARTISTA,
): PasoBucleArtista {
  const dictamen = evaluarObra(a);

  if (dictamen.veredicto === "entregar") {
    return { parada: "objetivo_alcanzado", dictamen, siguiente: dictamen.directiva };
  }
  if (iteracion + 1 >= maxIteraciones) {
    // Se agotó el tope: honestidad, no mentira. Se entrega lo que hay diciendo
    // qué quedó pendiente — nunca un «listo» con puntaje por debajo del umbral.
    return {
      parada: "max_iteraciones",
      dictamen,
      siguiente:
        `Tope de ${maxIteraciones} iteraciones de oficio alcanzado con ${dictamen.puntaje}/10. ` +
        "Se entrega declarando lo pendiente como decisión del usuario: " +
        dictamen.ejes.filter((e) => e.puntos < 2).flatMap((e) => e.faltan).slice(0, 3).join("; ") + ".",
    };
  }
  return { parada: "seguir", dictamen, siguiente: dictamen.directiva };
}

// ══════════════════════════════════════════════════════════════════════════
// CONCIENCIA DE ARTISTA x10 (v1.27.0) — de 5 ejes a 10, con PESO y SEVERIDAD
// ══════════════════════════════════════════════════════════════════════════
// Se conservan los 5 ejes de v1.26.0 (compatibilidad: `evaluarObra` intacto) y se
// suman 5 ejes más + un motor de auditoría PONDERADO con severidad. Un juez que
// trata igual «falta un hover» que «hay una API key hardcodeada» no es un artista:
// es un checklist tonto. El peso y la severidad hacen que la próxima iteración
// ataque lo que MÁS duele, no lo primero de la lista.
//
// v1.28.0 — la auditoría crece de 10 a 14 ejes: se añaden contraste/legibilidad,
// jerarquía de acción, internacionalización y resiliencia de red. Los tres ejes
// «condicionales» (jerarquía sin botones, i18n en fragmento, red sin fetch) se
// autoconceden 2/2 para no penalizar a la obra por algo que no le aplica. El
// no-frontend ahora también audita resiliencia de red además de robustez de datos.

export type EjeX10 =
  | EjeArtista
  | "responsive_fit"
  | "feedback_interaccion"
  | "consistencia_copy"
  | "robustez_datos"
  | "rendimiento_percibido"
  // v1.28.0 — cuatro ejes más (de 10 a 14): legibilidad, jerarquía de acción,
  // internacionalización y resiliencia de red. El nombre «X10» se queda por
  // compatibilidad de API — es el tipo de la auditoría ampliada, no un conteo.
  | "contraste_legibilidad"
  | "jerarquia_accion"
  | "internacionalizacion"
  | "resiliencia_red";

export type Severidad = "critico" | "alto" | "medio" | "bajo";

/**
 * v1.31.0 — ARREGLO DE UN ERROR DE TIPOS HEREDADO (TS2430): esta interfaz
 * «extendía» HallazgoEje re-estrechando `eje` a EjeX10, y un `extends` que
 * no es asignable es ilegal — `tsc` lo venía protestando desde v1.28.0 y el
 * paquete viajó rojo de fábrica. Se convierte a alias con Omit: mismos
 * campos, API idéntica para las 10 funciones de eje, cero behavior change.
 */
export type HallazgoX10 = Omit<HallazgoEje, "eje"> & {
  eje: EjeX10;
  /** Peso del eje en el puntaje ponderado (1-3). */
  peso: 1 | 2 | 3;
  /** Gravedad del déficit mayor de este eje. */
  severidad: Severidad;
};

// ── EJE 6 · Responsive / encaje en móvil ──────────────────────────────────
// El propio usuario reportó «en móvil se ve todo estirado y no encaja»: casi
// siempre es un ancho fijo grande sin viewport ni media queries. Este eje lo caza.
export function ejeResponsiveFit(a: Artefacto): HallazgoX10 {
  const s = a.fuente;
  const css = (a.css ?? "") + "\n" + s;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;

  const viewport = tiene(/<meta[^>]+name=["']viewport["']/i, s);
  const mediaQ = tiene(/@media|@container/i, css);
  // OJO: no confundir `max-width:640px` (un breakpoint sano) con `width:1200px`
// (un ancho fijo que rompe el móvil). Exigimos que ANTES de `width` no haya
// guion ni letra — así `max-width`/`min-width` quedan fuera.
  const anchosFijosGrandes = (css.match(/(?:^|[^-\w])width\s*:\s*(\d{3,})px/gi) ?? [])
    .filter((m) => Number((m.match(/(\d{3,})/) ?? [])[1]) >= 600).length;
  const fluido = tiene(/max-width|min-width|%|\bvw\b|\brem\b|flex|grid|clamp\(|minmax\(/i, css);

  if (viewport) { senales.push("meta viewport"); p++; } else faltan.push('añadir <meta name="viewport" content="width=device-width, initial-scale=1">');
  if ((mediaQ || fluido) && anchosFijosGrandes === 0) { senales.push("layout fluido/responsive"); p = Math.min(2, p + 1); }
  else {
    if (anchosFijosGrandes > 0) faltan.push(`sustituir ${anchosFijosGrandes} ancho(s) fijo(s) >=600px por max-width/%/flex (causa del «se ve estirado» en móvil)`);
    if (!mediaQ && !fluido) faltan.push("añadir media queries o unidades fluidas (%, rem, vw, flex/grid)");
  }
  const severidad: Severidad = anchosFijosGrandes > 0 || !viewport ? "alto" : p === 2 ? "bajo" : "medio";
  return { eje: "responsive_fit", puntos: p as 0 | 1 | 2, senales, faltan, peso: 3, severidad };
}

// ── EJE 7 · Feedback de interacción ────────────────────────────────────────
export function ejeFeedbackInteraccion(a: Artefacto): HallazgoX10 {
  const css = (a.css ?? "") + "\n" + a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  const hover = tiene(/:hover|:focus|:active|focus-visible|hover:|focus:/i, css);
  const transicion = tiene(/transition|@keyframes|animation\s*:|animate-/i, css);
  const deshabilitado = tiene(/:disabled|\bdisabled\b|aria-disabled/i, a.fuente + css);
  if (hover) { senales.push("estados hover/focus"); p++; } else faltan.push("añadir estados :hover/:focus a lo interactivo");
  if (transicion || deshabilitado) { senales.push(transicion ? "transiciones" : "estado disabled"); p = Math.min(2, p + 1); }
  else faltan.push("añadir transiciones y estado disabled (el clic debe sentirse)");
  return { eje: "feedback_interaccion", puntos: p as 0 | 1 | 2, senales, faltan, peso: 2, severidad: p === 2 ? "bajo" : "medio" };
}

// ── EJE 8 · Consistencia de copy ─────────────────────────────────────────
export function ejeConsistenciaCopy(a: Artefacto): HallazgoX10 {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  const lorem = tiene(/lorem ipsum/i, s);
  const fugas = cuenta(/>\s*(undefined|null|NaN|\[object Object\])\s*</gi, s);
  const dobleEspacio = cuenta(/[A-Za-záéíóúñ]  +[A-Za-z]/g, s);
  if (!lorem && fugas === 0) { senales.push("copy real sin fugas de datos"); p++; }
  else { if (lorem) faltan.push("reemplazar Lorem ipsum por copy real"); if (fugas > 0) faltan.push(`ocultar ${fugas} fuga(s) de undefined/null en el texto visible`); }
  if (dobleEspacio === 0) { senales.push("espaciado de texto limpio"); p = Math.min(2, p + 1); }
  else faltan.push(`limpiar ${dobleEspacio} doble(s) espacio(s) en el copy`);
  return { eje: "consistencia_copy", puntos: p as 0 | 1 | 2, senales, faltan, peso: 1, severidad: fugas > 0 ? "alto" : "bajo" };
}

// ── EJE 9 · Robustez de datos y seguridad de frontend ─────────────────────────
export function ejeRobustezDatos(a: Artefacto): HallazgoX10 {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  // Secreto hardcodeado en frontend: CRÍTICO, tira el eje a 0 pase lo que pase.
  const secreto = tiene(/sk-[a-z0-9]{16,}|AKIA[0-9A-Z]{12,}|api[_-]?key\s*[:=]\s*["'][^"']{12,}/i, s);
  const mapSinKey = cuenta(/\.map\((?:[^)]*)=>(?:(?!key=)[^;])*<[A-Za-z]/g, s);
  const validacion = tiene(/required\b|pattern=|type=["'](email|number|tel|url)|zod|yup|validate|min=|max=/i, s);
  if (secreto) {
    faltan.push("CRÍTICO: quitar la clave/secreto hardcodeado del frontend (va en el backend)");
    return { eje: "robustez_datos", puntos: 0, senales, faltan, peso: 3, severidad: "critico" };
  }
  if (mapSinKey === 0) { senales.push("listas con key"); p++; } else faltan.push(`añadir prop key a ${mapSinKey} lista(s) renderizada(s)`);
  if (validacion) { senales.push("validación de entrada"); p = Math.min(2, p + 1); }
  else faltan.push("validar las entradas (required/pattern/type o esquema)");
  return { eje: "robustez_datos", puntos: p as 0 | 1 | 2, senales, faltan, peso: 2, severidad: p === 2 ? "bajo" : "medio" };
}

// ── EJE 10 · Rendimiento percibido ───────────────────────────────────────
export function ejeRendimientoPercibido(a: Artefacto): HallazgoX10 {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  const base64Gordo = (s.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{2000,}/gi) ?? []).length;
  const lazy = tiene(/loading=["']lazy["']|\bdefer\b|\basync\b|import\(/i, s);
  const imgs = cuenta(/<img\b/gi, s);
  const imgsSinDim = imgs > 0 && cuenta(/<img\b(?![^>]*(width|height|aspect))/gi, s) > 0;
  if (base64Gordo === 0) { senales.push("sin imágenes base64 gigantes en línea"); p++; }
  else faltan.push(`mover ${base64Gordo} imagen(es) base64 pesada(s) a archivos (no incrustadas)`);
  if (lazy && !imgsSinDim) { senales.push("carga diferida / dimensiones de imagen"); p = Math.min(2, p + 1); }
  else { if (!lazy) faltan.push("diferir lo no crítico (loading=lazy / defer / import dinámico)"); if (imgsSinDim) faltan.push("dar width/height a las imágenes (evita saltos de layout)"); }
  return { eje: "rendimiento_percibido", puntos: p as 0 | 1 | 2, senales, faltan, peso: 1, severidad: base64Gordo > 0 ? "medio" : "bajo" };
}

// ── EJE 11 · Contraste y legibilidad ─────────────────────────────────────
// Que se LEA: interlineado definido, sin tipografías minúsculas (<12px) y con un
// par color/fondo declarado (el gris claro sobre blanco es el pecado clásico).
export function ejeContrasteLegibilidad(a: Artefacto): HallazgoX10 {
  const css = (a.css ?? "") + "\n" + a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  const interlineado = tiene(/line-height\s*:|leading-/i, css);
  const fuenteMinuscula = (css.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi) ?? [])
    .some((m) => Number((m.match(/(\d+(?:\.\d+)?)/) ?? [])[1]) < 12);
  const parColorFondo = tiene(/background(-color)?\s*:/i, css) && tiene(/(^|[^-])color\s*:/i, css);
  if (interlineado) { senales.push("interlineado definido"); p++; } else faltan.push("definir line-height (el texto pegado cansa la vista)");
  if (!fuenteMinuscula && parColorFondo) { senales.push("tamaño legible + par color/fondo"); p = Math.min(2, p + 1); }
  else { if (fuenteMinuscula) faltan.push("subir las tipografías por debajo de 12px (ilegibles en pantalla)"); if (!parColorFondo) faltan.push("declarar color Y fondo juntos (asegura contraste, no gris-sobre-blanco)"); }
  return { eje: "contraste_legibilidad", puntos: p as 0 | 1 | 2, senales, faltan, peso: 2, severidad: fuenteMinuscula ? "alto" : p === 2 ? "bajo" : "medio" };
}

// ── EJE 12 · Jerarquía de acción ──────────────────────────────────────
// UNA acción principal clara, no un muro de botones idénticos. El usuario tiene
// que saber «qué hago aquí» de un vistazo.
export function ejeJerarquiaAccion(a: Artefacto): HallazgoX10 {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  const botones = cuenta(/<button\b|role=["']button["']|type=["']submit["']/gi, s);
  const hayPrimaria = tiene(/primary|cta\b|btn-primary|principal|destacad/i, s);
  const haySecundaria = tiene(/secondary|ghost|outline|link\b|btn-secondary|texto\b/i, s);
  if (botones === 0) {
    // Sin acciones no hay jerarquía que juzgar: no se premia ni se castiga.
    senales.push("sin acciones que jerarquizar");
    return { eje: "jerarquia_accion", puntos: 2, senales, faltan, peso: 2, severidad: "bajo" };
  }
  if (hayPrimaria || botones === 1) { senales.push(botones === 1 ? "acción única inequívoca" : "acción primaria marcada"); p++; }
  else faltan.push("marcar la acción principal (una CTA primaria, no botones idénticos)");
  if (botones <= 3 || (hayPrimaria && haySecundaria)) { senales.push("acciones diferenciadas"); p = Math.min(2, p + 1); }
  else faltan.push(`diferenciar ${botones} botones por peso (primaria vs secundaria), no todos iguales`);
  return { eje: "jerarquia_accion", puntos: p as 0 | 1 | 2, senales, faltan, peso: 2, severidad: p === 2 ? "bajo" : "medio" };
}

// ── EJE 13 · Internacionalización ────────────────────────────────────
// Lo mínimo para que el navegador y los lectores no adivinen: `lang` en <html> y
// `charset=utf-8` (sin él, los acentos del español salen como «Ã©»).
export function ejeInternacionalizacion(a: Artefacto): HallazgoX10 {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  const esHtml = /<html\b|<!doctype html/i.test(s);
  if (!esHtml) {
    // Un fragmento (JSX/vue) no declara <html>: no se le exige el documento.
    senales.push("fragmento sin documento propio (i18n no aplica)");
    return { eje: "internacionalizacion", puntos: 2, senales, faltan, peso: 1, severidad: "bajo" };
  }
  const lang = tiene(/<html[^>]+\blang=/i, s);
  const charset = tiene(/<meta[^>]+charset=["']?utf-8/i, s);
  if (lang) { senales.push("idioma declarado (lang)"); p++; } else faltan.push('declarar el idioma: <html lang="es">');
  if (charset) { senales.push("charset utf-8"); p = Math.min(2, p + 1); } else faltan.push('añadir <meta charset="utf-8"> (o los acentos se rompen)');
  return { eje: "internacionalizacion", puntos: p as 0 | 1 | 2, senales, faltan, peso: 1, severidad: "bajo" };
}

// ── EJE 14 · Resiliencia de red ──────────────────────────────────────
// Si la obra habla con la red (fetch/axios/XHR), la red FALLA: hay que capturar el
// error y poder abortar (timeout/AbortController). Sin eso, un wifi flojo la cuelga.
export function ejeResilienciaRed(a: Artefacto): HallazgoX10 {
  const s = a.fuente;
  const senales: string[] = [];
  const faltan: string[] = [];
  let p = 0;
  const hayRed = tiene(/\bfetch\s*\(|axios|XMLHttpRequest|\.ajax\(|new WebSocket/i, s);
  if (!hayRed) {
    // Sin llamadas de red no hay nada que se caiga: nada que reprochar.
    senales.push("sin llamadas de red (nada que resistir)");
    return { eje: "resiliencia_red", puntos: 2, senales, faltan, peso: 2, severidad: "bajo" };
  }
  const captura = tiene(/\.catch\(|try\s*\{|onError|catch\s*\(/i, s);
  const aborta = tiene(/AbortController|\bsignal\b|timeout|setTimeout\([^)]*abort/i, s);
  if (captura) { senales.push("errores de red capturados"); p++; } else faltan.push("capturar el fallo de red (.catch / try-catch): la red SIEMPRE puede fallar");
  if (aborta) { senales.push("aborto/timeout de la petición"); p = Math.min(2, p + 1); }
  else faltan.push("poder abortar la petición (AbortController/timeout): un wifi flojo no debe colgar la app");
  return { eje: "resiliencia_red", puntos: p as 0 | 1 | 2, senales, faltan, peso: 2, severidad: !captura ? "alto" : p === 2 ? "bajo" : "medio" };
}

const NOMBRE_X10: Record<EjeX10, string> = {
  ...NOMBRE_EJE,
  responsive_fit: "Responsive / encaje móvil",
  feedback_interaccion: "Feedback de interacción",
  consistencia_copy: "Consistencia de copy",
  robustez_datos: "Robustez de datos",
  rendimiento_percibido: "Rendimiento percibido",
  contraste_legibilidad: "Contraste y legibilidad",
  jerarquia_accion: "Jerarquía de acción",
  internacionalizacion: "Internacionalización",
  resiliencia_red: "Resiliencia de red",
};

/** Peso base de los 5 ejes originales para la auditoría ponderada. */
const PESO_CORE: Record<EjeArtista, 1 | 2 | 3> = {
  terminacion_visual: 3,
  estados_completos: 2,
  accesibilidad_oficio: 2,
  coherencia_sistema: 2,
  intencion_cumplida: 3,
};
const SEV_ORDEN: Record<Severidad, number> = { critico: 3, alto: 2, medio: 1, bajo: 0 };

export interface DictamenX10 {
  veredicto: VeredictoArtista;
  /** 0-10 PONDERADO por peso de eje (no un promedio plano). */
  puntaje: number;
  ejes: HallazgoX10[];
  /** ¿Hay un déficit crítico? (p. ej. secreto hardcodeado) — bloquea «entregar». */
  bloqueoCritico: boolean;
  directiva: string;
  faseSiguiente: FaseBucle;
  informe: string;
}

/**
 * AUDITORÍA x10: los diez ejes, ponderados por peso, con la directiva de la
 * próxima iteración ordenada por (peso × déficit × severidad). Pura y determinista.
 */
export function auditarObraX10(a: Artefacto): DictamenX10 {
  const frontend = /\.(html?|tsx|jsx|vue|svelte)$/i.test(a.ruta);
  const core = [
    ejeTerminacionVisual(a), ejeEstadosCompletos(a), ejeAccesibilidadOficio(a),
    ejeCoherenciaSistema(a), ejeIntencionCumplida(a),
  ].map((e) => ({ ...e, peso: PESO_CORE[e.eje as EjeArtista], severidad: (e.puntos === 2 ? "bajo" : e.puntos === 1 ? "medio" : "alto") as Severidad } as HallazgoX10));
  const extra = frontend
    ? [ejeResponsiveFit(a), ejeFeedbackInteraccion(a), ejeConsistenciaCopy(a), ejeRobustezDatos(a), ejeRendimientoPercibido(a),
       ejeContrasteLegibilidad(a), ejeJerarquiaAccion(a), ejeInternacionalizacion(a), ejeResilienciaRed(a)]
    : [ejeRobustezDatos(a), ejeResilienciaRed(a)];
  const ejes: HallazgoX10[] = frontend ? [...core, ...extra] : [core[4], ...extra];

  const pesoTotal = ejes.reduce((s, e) => s + e.peso, 0);
  const logrado = ejes.reduce((s, e) => s + (e.puntos / 2) * e.peso, 0);
  const puntaje = Math.round((logrado / pesoTotal) * 10);
  const bloqueoCritico = ejes.some((e) => e.severidad === "critico");

  let veredicto: VeredictoArtista;
  if (bloqueoCritico) veredicto = "rehacer_pieza";
  else if (puntaje >= UMBRAL_ENTREGA) veredicto = "entregar";
  else if (puntaje >= UMBRAL_PULIR) veredicto = "pulir";
  else veredicto = "rehacer_pieza";

  const prioridad = ejes
    .filter((e) => e.puntos < 2)
    .sort((x, y) => (y.peso * (2 - y.puntos) + SEV_ORDEN[y.severidad]) - (x.peso * (2 - x.puntos) + SEV_ORDEN[x.severidad]))
    .flatMap((e) => e.faltan);

  const directiva = bloqueoCritico
    ? "BLOQUEO CRÍTICO antes de entregar: " + ejes.filter((e) => e.severidad === "critico").flatMap((e) => e.faltan).join("; ") + "."
    : construirDirectiva(veredicto, prioridad);
  const faseSiguiente: FaseBucle = veredicto === "rehacer_pieza" ? "crear" : "modificar";
  const informe = ejes.map((e) => `${NOMBRE_X10[e.eje]} (×${e.peso}): ${e.puntos}/2` + (e.faltan.length ? ` — ${e.faltan[0]}` : " — ok")).join("\n");

  return { veredicto, puntaje, ejes, bloqueoCritico, directiva, faseSiguiente, informe };
}

export interface PasoBucleX10 {
  parada: ParadaArtista;
  dictamen: DictamenX10;
  siguiente: string;
  /** Ejes ya en 2/2 (para que el bucle celebre progreso y no repita lo resuelto). */
  resueltos: EjeX10[];
}

/**
 * El BUCLE x10: corta por umbral, por bloqueo crítico persistente o por tope, y
 * lleva la cuenta de qué ejes ya quedaron perfectos para no volver sobre ellos.
 */
export function pasoBucleArtistaX10(
  a: Artefacto,
  iteracion: number,
  maxIteraciones = MAX_ITERACIONES_ARTISTA,
): PasoBucleX10 {
  const dictamen = auditarObraX10(a);
  const resueltos = dictamen.ejes.filter((e) => e.puntos === 2).map((e) => e.eje);

  if (dictamen.veredicto === "entregar") {
    return { parada: "objetivo_alcanzado", dictamen, siguiente: dictamen.directiva, resueltos };
  }
  if (iteracion + 1 >= maxIteraciones) {
    return {
      parada: "max_iteraciones",
      dictamen,
      resueltos,
      siguiente:
        `Tope de ${maxIteraciones} iteraciones con ${dictamen.puntaje}/10` +
        (dictamen.bloqueoCritico ? " y un BLOQUEO CRÍTICO sin resolver" : "") +
        ". Pendiente como decisión del usuario: " +
        dictamen.ejes.filter((e) => e.puntos < 2).flatMap((e) => e.faltan).slice(0, 3).join("; ") + ".",
    };
  }
  return { parada: "seguir", dictamen, siguiente: dictamen.directiva, resueltos };
}

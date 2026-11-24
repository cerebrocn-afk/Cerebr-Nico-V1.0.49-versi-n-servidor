/**
 * cerebroSemilla.ts · EL EJE DE TODO Y LA NADA DE ALGO (v1.99.0)
 * ==============================================================
 * Mario lo pidió con una frase que es técnicamente exacta: «diferenciar entre el eje
 * de todo y la nada de algo». Acá está la diferencia, y es la que un índice vectorial
 * suele perder:
 *
 *   · LUZ   — la pieza existe Y tiene vector. Refleja.
 *   · DEUDA — la pieza existe pero todavía no fue vectorizada. No refleja TODAVÍA: es
 *             trabajo pendiente, medible, con nombre.
 *   · NADA  — la pieza no existe en el hemisferio derecho. Eso NO es distancia cero al
 *             eje: es ausencia. Confundirlas es la mentira que hace que un panel diga
 *             «cobertura 100 %» con el cerebro vacío (y así encontramos `cerebro/`
 *             vacío y sin `vectores.json` mientras el tablero estaba «sano»).
 *
 * El EJE es una entrada distinguida: la definición del sistema, vectorizada una vez al
 * arraigar. Le da ORIGIN al espacio — sin origen, dos textos cualesquiera están «igual
 * de cerca» y los espejos no tienen qué reflejar. No es un vector de ceros (eso sería
 * justamente la nada disfrazada de eje): es un punto real del espacio, medible, y todo
 * lo demás se mide contra él.
 *
 * Puro: no toca disco ni red. Las entradas que produce viajan con el formato que ya
 * dueña `cerebroOrgano` (tema/archivo/texto), así que el índice NO se duplica.
 */

export type ClaseSemilla = "eje" | "hemisferio" | "leccion" | "ruta";
export type Presencia = "luz" | "deuda" | "nada";

export interface SemillaEntrada {
  id: string;
  clase: ClaseSemilla;
  /** El `tema` del sidecar: agrupa, y es lo que el híbrido devuelve en `coincidencias`. */
  tema: string;
  /** Archivo ancla (ruta real si la hay; `cerebro.md` para el eje). */
  archivo: string;
  /** Texto que se vectoriza. Determinista: misma entrada, misma huella, no re-vectoriza. */
  texto: string;
  /**
   * v1.99.5 · EN QUÉ MITAD se busca el ancla. No es un detalle de presentación: `cerebro.md` existe
   * en las DOS (en la instalación son las leyes; en la raíz de datos, el espejo). Preguntarle por la
   * mitad equivocada convierte en `nada` una pieza que está adelante del usuario.
   */
  raiz?: "app" | "datos";
  /**
   * v1.99.5 · el asiento REAL dentro del índice (`temas/<id>.md`) cuando la pieza ya fue enraigada.
   * El ancla dice dónde vive el archivo; el asiento dice dónde busca el vector. Son distintos y la
   * valla del reflejo tiene que mirar el asiento, si no toda pieza enraigada seguiría siendo deuda.
   */
  asiento?: string;
}

export const TEMA_EJE = "eje-0";

/** EL EJE DE TODO: la definición, no un vector vacío. Una sola, siempre la primera. */
export function ejeDeTodo(version: string): SemillaEntrada {
  return {
    id: "eje-0",
    clase: "eje",
    tema: TEMA_EJE,
    // v1.99.5 · el ancla del eje NO es `cerebro.md` (esa es la de la instalación): es la cara
    // humana del índice, `cerebro/CEREBRO.md`, que `guardarIndice` escribe al enraizar. Así el
    // eje pasa de `nada` a `deuda` por el solo hecho de plantarlo — y de ahí a `luz` con el
    // calentador. Medirlo contra un archivo que nadie escribe lo dejaría en nada para siempre.
    archivo: "cerebro/CEREBRO.md",
    texto:
      `CerebroNico IDE v${version}: agente local con dos hemisferios. ` +
      "Hemisferio izquierdo: la instalacion, las leyes del agente, los manuales y el codigo. " +
      "Hemisferio derecho: la raiz de datos, los organos, la memoria, los espejos y el indice vectorial. " +
      "La interfaz esta en el medio. Nada se borra a sangre: se papeliza. " +
      "Nada se afirma sin evidencia: se mide y se nombra.",
  };
}

/** Piezas del mapa de hemisferios → semilla (una línea por pieza, con su porqué). */
export function semillaDeHemisferios(
  nombre: string,
  piezas: Array<{ rel: string; que: string }>,
): SemillaEntrada[] {
  return (piezas || []).map((p) => ({
    id: `hemi:${nombre}:${p.rel}`,
    clase: "hemisferio" as ClaseSemilla,
    tema: `hemisferio-${nombre}`,
    archivo: p.rel,
    texto: `Hemisferio ${nombre} · ${p.rel} · ${p.que}`,
  }));
}

/** Las L del disco (`LECCIONES.md`) → semilla. La autoaprendizabilidad se vuelve vectorizable. */
export function semillaDeLecciones(lecciones: string[]): SemillaEntrada[] {
  return (lecciones || [])
    .map((l, i) => ({ l: String(l || "").trim(), i }))
    .filter((x) => /^L\d+/.test(x.l))
    .map((x) => ({
      id: `leccion:${x.i}`,
      clase: "leccion" as ClaseSemilla,
      tema: "lecciones",
      archivo: "LECCIONES.md",
      texto: x.l.slice(0, 400),
    }));
}

/** Rutas verificadas (`RUTAS-DEL-SISTEMA.md`) → semilla: el mapa también es conocimiento. */
export function semillaDeRutas(rutas: string[]): SemillaEntrada[] {
  return (rutas || [])
    .map((r, i) => ({ r: String(r || "").trim(), i }))
    .filter((x) => x.r.length > 3)
    .map((x) => ({
      id: `ruta:${x.i}`,
      clase: "ruta" as ClaseSemilla,
      tema: "rutas",
      archivo: "RUTAS-DEL-SISTEMA.md",
      texto: x.r.slice(0, 240),
    }));
}

/**
 * LA DISTINCIÓN PEDIDA. `existe` viene del disco; `vectorizada` del sidecar.
 * Nada → "nada" aunque el sidecar diga 0 deudas: la ausencia no es cero.
 */
export function presencia(existe: boolean, vectorizada: boolean): Presencia {
  if (!existe) return "nada";
  return vectorizada ? "luz" : "deuda";
}

export interface ResumenSemilla {
  entradas: number;
  eje: boolean;
  luz: number;
  deuda: number;
  nada: number;
  /** Cobertura honesta: luz sobre lo que EXISTE. Sin eje lo dice sin eje. */
  cobertura: string;
  /** Lo que el espejo refleja: "18 de 19 piezas tienen luz; 1 es nada (no existe en el disco)". */
  reflejo: string;
}

/** Consolida semilla + presencia. `nada` nunca entra al denominador de la cobertura. */
export function resumenSemilla(entradas: SemillaEntrada[], estados: Map<string, Presencia>): ResumenSemilla {
  let luz = 0, deuda = 0, nada = 0, eje = false;
  for (const e of entradas || []) {
    if (e.clase === "eje") eje = true;
    const p = estados.get(e.id) || presencia(false, false);
    if (p === "luz") luz++;
    else if (p === "deuda") deuda++;
    else nada++;
  }
  const existen = luz + deuda;
  const cobertura = existen ? `${Math.round((luz / existen) * 100)}%` : "sin semilla";
  const reflejo = existen
    ? `${luz} de ${existen} piezas tienen luz${deuda ? `, ${deuda} deben vector` : ""}${nada ? `, ${nada} son nada (no existen en el disco)` : ""}`
    : "el hemisferio derecho esta vacio: no hay nada que reflejar";
  return { entradas: (entradas || []).length, eje, luz, deuda, nada, cobertura, reflejo };
}


/** El reflejo completo: el resumen y, por pieza, qué es (para poder nombrarla en la UI). */
export interface ReflejoSemilla extends ResumenSemilla {
  detalle: Array<{ id: string; clase: ClaseSemilla; archivo: string; presencia: Presencia }>;
}

/**
 * `reflejoDeSemilla` · el puente entre el mapa de hemisferios y el sidecar REAL.
 *
 * Reglas, en el orden que importan:
 *   1. si la pieza **no existe en disco**, es `nada` — aunque el sidecar tenga una clave
 *      suelta con su nombre (un residuo de índice no hace que un órgano exista);
 *   2. si existe y hay alguna clave `tema|archivo|…` **con vector**, es `luz`;
 *   3. si existe pero ninguna clave tiene vector, es `deuda`: trabajo pendiente, con nombre.
 *
 * Compara por PREFIJO de clave, no por huella: la huella la dueña el índice y cambiar de texto no
 * debería convertir una pieza en "otra cosa". Y por eso mismo no se necesita exportar el hash de
 * `cerebroOrgano`.
 *
 * v1.99.5 · dos precisiones que el arraigo trajo:
 *   · el prefijo se arma con `asiento` cuando la pieza ya está plantada — su vector vive en
 *     `temas/<...>.md`, no en el archivo ancla, y medir el ancla dejaría en `deuda` eterna a una
 *     pieza luminoso (dos dueños para una verdad, otra vez);
 *   · `existe` recibe la entrada además del nombre: `cerebro.md` está declarado en las DOS
 *     mitades, así que la pregunta «¿existe?» no tiene respuesta sin saber en qué raíz mirar.
 */
export function reflejoDeSemilla(
  entradas: SemillaEntrada[],
  claves: { con: string[] },
  existe: (archivo: string, entrada: SemillaEntrada) => boolean,
): ReflejoSemilla {
  const con = claves && Array.isArray(claves.con) ? claves.con : [];
  const detalle: ReflejoSemilla["detalle"] = [];
  const estados = new Map<string, Presencia>();
  for (const e of entradas || []) {
    let p: Presencia;
    if (!existe(e.archivo, e)) p = "nada";
    else {
      const prefijo = `${e.tema}|${e.asiento || e.archivo}|`;
      p = con.some((k) => String(k).startsWith(prefijo)) ? "luz" : "deuda";
    }
    estados.set(e.id, p);
    detalle.push({ id: e.id, clase: e.clase, archivo: e.archivo, presencia: p });
  }
  return { ...resumenSemilla(entradas || [], estados), detalle };
}

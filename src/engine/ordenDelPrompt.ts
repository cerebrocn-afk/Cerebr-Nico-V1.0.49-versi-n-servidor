/**
 * ordenDelPrompt.ts · v1.0.29 — EL PREFIJO QUE NO CAMBIA (caché KV) + CUÁNDO COMPACTAR
 * ========================================================================================
 * POR QUÉ EXISTE
 * Los dos proveedores de nube rápidos (Groq, Cloudflare Workers AI) y los motores
 * locales con `llama.cpp` cobran menos por lo que ya vieron: si las primeras N
 * fichas de la petición son IDÉNTICAS al turno anterior, el prellenado se salta y
 * la primera palabra llega antes. Eso no se consigue «optimizando»: se consigue
 * con ORDEN. Hoy el prompt de sistema se arma añadiendo bloques con `+=` en orden
 * de código (ley, lecciones, cerebro, RAG, manual, conocimiento, recetario,
 * conciencia, memoria vectorial…), y basta que un bloque dinámico caiga en medio
 * —una fecha, el estado de un archivo, una métrica— para que TODO lo que viene
 * detrás deje de coincidir y el prefijo se pague entero otra vez.
 *
 * LA REGLA, en una frase
 *   Lo que no cambia entre turnos va DELANTE y en el mismo orden; lo que cambia
 *   va DETRÁS. Un bloque dinámico es una fuga: si entra en el prefijo, invalida
 *   a todos los que le siguen.
 *
 * QUÉ NO HACE ESTE MÓDULO
 *   · No parte ni reordena bloques por su cuenta: recibe cada bloque CON su
 *     estabilidad declarada y devuelve el texto ordenado. Quien sabe si un texto
 *     es fijo o variable es quien lo produce, no este módulo adivinando.
 *   · No mide tokens (el motor mide CARACTERES, `LIMITE_CONTEXTO_CARACTERES`).
 *     La compactación se decide por PRESIÓN medida en `contextoMedido.ts`, no por
 *     un 6.000 inventado: aquí solo se traduce presión → decisión.
 *
 * Módulo PURO: cero fs, cero red, cero estado global. Por eso tiene suite.
 */

/** Cuánto sobrevive un bloque a lo largo de los turnos. */
export type Estabilidad =
  /** Igual en TODOS los turnos de la sesión (ley del motor, manual de herramientas, protocolo). Va al principio. */
  | "fija"
  /** Cambia por sesión o por modelo, no por turno (memoria del proyecto, cerebro, lecciones). */
  | "sesion"
  /** Cambia en cada turno pero es pequeña y debe ir pegada al final del sistema (presión, avisos). */
  | "turno"
  /** Cambia SIEMPRE y no aporta si se cachea mal (fecha, hora, métricas vivas). Va DESPUÉS de todo lo anterior. */
  | "volatil";

/** Orden de precedencia: menor primero. Un bloque más estable NUNCA va detrás de uno menos estable. */
export const PESO_ESTABILIDAD: Record<Estabilidad, number> = {
  fija: 0,
  sesion: 1,
  turno: 2,
  volatil: 3,
};

export interface BloqueDePrompt {
  /** Nombre corto para el diagnóstico (no se imprime al modelo). */
  id: string;
  /** El texto que se inyecta. Vacío o solo espacios = el bloque no existe. */
  texto: string;
  estabilidad: Estabilidad;
  /**
   * Orden DENTRO del mismo nivel de estabilidad. Sirve para que dos bloques
   * «fijos» no se intercambien entre turnos por azar del orden de llamada.
   * Sin valor, se conserva el orden de llegada.
   */
  orden?: number;
}

export interface PromptOrdenado {
  /** El texto final, con dos saltos entre bloques. */
  texto: string;
  /** Qué bloques entraron, en el orden final (para el diagnóstico y la suite). */
  incluidos: Array<{ id: string; estabilidad: Estabilidad; caracteres: number }>;
  /**
   * El prefijo que se espera REUTILIZADO por la caché del proveedor: todo lo
   * estable hasta el primer bloque volátil. Es lo que hay que mirar si un turno
   * vuelve a tardar lo mismo que el primero.
   */
  prefijoEstable: number;
  /** Caracteres totales del prompt de sistema. */
  caracteres: number;
}

/**
 * Ordena los bloques por estabilidad (y por `orden` dentro de cada nivel) y
 * devuelve el texto. Los bloques vacíos se descartan: un encabezado sin cuerpo
 * también gasta y además no coincide entre turnos.
 */
export function ordenarBloques(bloques: BloqueDePrompt[]): PromptOrdenado {
  const vivos = (bloques || []).filter(
    (b) => b && typeof b.texto === "string" && b.texto.trim().length > 0
  );
  // Orden estable: primero por estabilidad, luego por `orden` declarado, y a
  // igualdad (o sin `orden`) se respeta el orden de llegada — `map` conserva el
  // índice original, que es el desempate.
  const conIndice = vivos.map((b, i) => ({ b, i }));
  conIndice.sort((x, y) => {
    const px = PESO_ESTABILIDAD[x.b.estabilidad];
    const py = PESO_ESTABILIDAD[y.b.estabilidad];
    if (px !== py) return px - py;
    const ox = typeof x.b.orden === "number" ? x.b.orden : Number.MAX_SAFE_INTEGER;
    const oy = typeof y.b.orden === "number" ? y.b.orden : Number.MAX_SAFE_INTEGER;
    if (ox !== oy) return ox - oy;
    return x.i - y.i;
  });
  const ordenados = conIndice.map((x) => x.b);

  const texto = ordenados.map((b) => b.texto).join("\n\n");
  const incluidos = ordenados.map((b) => ({
    id: b.id,
    estabilidad: b.estabilidad,
    caracteres: b.texto.length,
  }));

  // El prefijo estable es todo lo anterior al PRIMER bloque volátil (y, si no
  // hay ninguno, el prompt entero). Se cuenta con los dos saltos de unión.
  let prefijoEstable = 0;
  for (let i = 0; i < ordenados.length; i++) {
    if (ordenados[i].estabilidad === "volatil") break;
    prefijoEstable += ordenados[i].texto.length + (i > 0 ? 2 : 0);
  }

  return { texto, incluidos, prefijoEstable, caracteres: texto.length };
}

// ---------------------------------------------------------------------------
// 2 · CUÁNDO COMPACTAR (presión medida → decisión, sin números inventados)
// ---------------------------------------------------------------------------

/**
 * Decisión de compactación. `no` es el caso normal y no debe costar nada: por
 * debajo del umbral de aviso no se resumen turnos ni se recorta nada.
 */
export type DecisionCompactacion = "no" | "sugerir" | "forzar";

export interface EntradaDecision {
  /** Presión medida: `total / ventana`, de 0 a 1 (la da `contextoMedido.ts`). */
  presion: number;
  /** Cuántos turnos hay disponibles para resumir. Sin turnos viejos no hay nada que compactar. */
  turnosDisponibles: number;
  /** Turnos que se conservan íntegros. Por defecto 3. */
  turnosAConservar?: number;
  /** Umbrales; por defecto los de la casa (constants.ts) vía quien llama. */
  umbralSugerir?: number;
  umbralForzar?: number;
}

export interface SalidaDecision {
  decision: DecisionCompactacion;
  /** Cuántos turnos se mandarían a resumir (0 si no se compacta). */
  turnosAResumir: number;
  /** Motivo en una línea, para la consola. Vacío cuando no se compacta. */
  motivo: string;
}

/** Umbrales por defecto, ALINEADOS con los de `contextoMedido.ts` (45 % / 80 %). */
export const UMBRAL_SUGERIR_POR_DEFECTO = 0.65;
export const UMBRAL_FORZAR_POR_DEFECTO = 0.8;

/**
 * Traduce presión a decisión. Respeta el mínimo de turnos que no se tocan: si
 * hay 3 turnos o menos, no hay nada viejo que resumir y compactar borraría
 * justo lo que el usuario acaba de decir — se declara «no» aunque la presión
 * esté alta, porque el problema no está en el historial.
 */
export function decidirCompactacion(entrada: EntradaDecision): SalidaDecision {
  const conservar = Math.max(1, entrada.turnosAConservar ?? 3);
  const sugerir = entrada.umbralSugerir ?? UMBRAL_SUGERIR_POR_DEFECTO;
  const forzar = entrada.umbralForzar ?? UMBRAL_FORZAR_POR_DEFECTO;
  const turnos = Math.max(0, entrada.turnosDisponibles | 0);
  const viejos = Math.max(0, turnos - conservar);
  const presion = Number.isFinite(entrada.presion) ? entrada.presion : 0;

  if (viejos === 0) {
    return {
      decision: "no",
      turnosAResumir: 0,
      motivo:
        presion >= forzar
          ? `presión ${(presion * 100).toFixed(0)} % pero solo ${turnos} turno(s): el problema no es el historial, es el bloque fijo (manuales, ley, archivos) — ahí no se compacta`
          : "",
    };
  }
  if (presion >= forzar) {
    return { decision: "forzar", turnosAResumir: viejos, motivo: `presión ${(presion * 100).toFixed(0)} % ≥ ${(forzar * 100).toFixed(0)} %: se resumen ${viejos} turno(s) y se conservan los últimos ${conservar}` };
  }
  if (presion >= sugerir) {
    return { decision: "sugerir", turnosAResumir: viejos, motivo: `presión ${(presion * 100).toFixed(0)} % ≥ ${(sugerir * 100).toFixed(0)} %: se resumen ${viejos} turno(s) y se conservan los últimos ${conservar}` };
  }
  return { decision: "no", turnosAResumir: 0, motivo: "" };
}

// ---------------------------------------------------------------------------
// 3 · DIAGNÓSTICO: ¿el prefijo se está reutilizando?
// ---------------------------------------------------------------------------

export interface ComparacionDePrefijos {
  /** Caracteres idénticos al principio respecto del turno anterior. */
  comunes: number;
  /** Porcentaje del prefijo estable del turno anterior que se reutilizó (0-1). */
  reutilizado: number;
  /** Dónde dejó de coincidir (id del bloque aproximado o null si coincide entero). */
  roturaEn: string | null;
}

/**
 * Compara dos prompts consecutivos y dice cuánto prefijo se reutilizó y, si se
 * rompió, qué bloque quedó fuera de la zona cacheable. Con esto, «va lento» pasa
 * a ser «el bloque X se metió delante del prefijo estable».
 */
export function compararPrefijos(anterior: PromptOrdenado, actual: PromptOrdenado): ComparacionDePrefijos {
  const a = anterior.texto;
  const b = actual.texto;
  const limite = Math.min(a.length, b.length);
  let comunes = 0;
  while (comunes < limite && a.charCodeAt(comunes) === b.charCodeAt(comunes)) comunes++;
  const denominador = anterior.prefijoEstable || anterior.caracteres || 1;
  const reutilizado = Math.min(1, comunes / denominador);

  // La rotura solo cuenta si cae DENTRO del prefijo estable. Si quedó atrás, la
  // caché del proveedor no llegó a mirar ahí: reportarla como «rotura» convertiría
  // el caso sano (cambió la fecha) en un rojo todos los días.
  let roturaEn: string | null = null;
  if (comunes < limite && comunes < anterior.prefijoEstable) {
    // Se busca qué bloque del anterior contiene la posición de la rotura.
    let cursor = 0;
    for (const inc of anterior.incluidos) {
      if (comunes < cursor + inc.caracteres) {
        roturaEn = inc.id;
        break;
      }
      cursor += inc.caracteres + 2;
    }
  }
  return { comunes, reutilizado, roturaEn };
}

// ---------------------------------------------------------------------------
// 5 · LA OPERACIÓN COMPLETA, EN UNA LLAMADA (para que `server.ts` no crezca)
// ---------------------------------------------------------------------------

/** Cómo arranca el bloque de fecha/hora que el servidor añade al sistema. */
export const MARCA_DATO_SISTEMA = "\n\n[DATO REAL DEL SISTEMA — fecha y hora]";

export interface SistemaReordenado {
  /** El bloque de sistema listo para mandar, con lo volátil detrás. */
  texto: string;
  /** true si se encontró y movió la línea de fecha/hora. */
  fechaMovida: boolean;
  /** Decisión de compactación tomada con la presión medida. */
  compactar: boolean;
  /** Nota para el modelo (o "" si no hay nada que decir). */
  aviso: string;
}

/**
 * Toma el bloque de sistema tal como lo armó el servidor y devuelve el mismo
 * contenido con dos correcciones:
 *
 *   1. La línea `[DATO REAL DEL SISTEMA — fecha y hora]` sale del principio (donde
 *      rompe la caché de prefijo todos los días) y va AL FINAL, como volátil.
 *   2. Si la presión medida pasa el umbral y hay historial suficiente, se añade
 *      el aviso de compactación, también al final.
 *
 * Se hace aquí y no en el servidor por una razón concreta: es lógica pura y con
 * trampas (el corte del bloque, el caso sin marca, el caso de 3 turnos), y cada
 * línea que se queda en el monolito hay que pagarla contra su trinquete. La
 * función NUNCA lanza hacia afuera: si algo no cuadra, devuelve el texto igual.
 */
export function prepararSistemaParaCache(entrada: {
  sistema: string;
  presion: number;
  turnosDisponibles: number;
  marca?: string;
}): SistemaReordenado {
  const original = String(entrada.sistema || "");
  const marca = entrada.marca || MARCA_DATO_SISTEMA;
  let base = original;
  let fecha = "";
  const i = base.indexOf(marca);
  if (i >= 0) {
    // El bloque de fecha termina en el siguiente separador de bloque; si no hay,
    // se queda con la primera línea (que es donde vive la fecha).
    const resto = base.slice(i);
    const dobleCorte = resto.indexOf("\n\n[");
    fecha = (dobleCorte > 0 ? resto.slice(0, dobleCorte) : resto.split("\n").slice(0, 3).join("\n")).trim();
    base = base.slice(0, i);
  }

  let texto = base;
  if (fecha) {
    const orden = ordenarBloques([
      { id: "fijo-del-sistema", texto: base, estabilidad: "sesion", orden: 1 },
      { id: "dato-real-fecha-hora", texto: fecha, estabilidad: "volatil", orden: 99 },
    ]);
    texto = orden.texto;
  }

  const dec = decidirCompactacion({ presion: entrada.presion, turnosDisponibles: entrada.turnosDisponibles });
  const aviso = dec.decision !== "no" && dec.motivo ? `\n\n${dec.motivo}` : "";
  if (aviso) texto += aviso;

  return { texto, fechaMovida: !!fecha, compactar: dec.decision !== "no", aviso };
}

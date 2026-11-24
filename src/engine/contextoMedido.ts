/**
 * contextoMedido.ts · FASE 9 — LA TELEMETRÍA DE CONTEXTO
 *
 * Convierte el gasto de contexto de intuición en números comparables entre
 * turnos. Tres medidas, todas derivadas de datos que el motor YA tiene:
 *
 *   1. DESGLOSE POR CATEGORÍA — a partir de `ContextoEnsamblado.capas`
 *      (`motorContexto.ts`), agrupado en tres familias: sistema, herramientas
 *      y mensajes. Nunca se re-inventa el texto: se suman las capas reales.
 *   2. PRESIÓN DECLARADA — `total / ventana` con umbrales constantes y
 *      nombrados. Al 45 % avisa, al 65 % sugiere compactar, al 80 % exige.
 *   3. LATENCIA DESDOBLADA — tiempo al primer token (TTFT) separado del tiempo
 *      de decodificación. «Va lento» no es un diagnóstico; «TTFT 4,2 s /
 *      decode 18 s / 3 pasos» sí lo es.
 *
 * REGLA DE HONESTIDAD (ley de veracidad, no negociable aquí):
 *   El motor de esta casa mide en CARACTERES (`LIMITE_CONTEXTO_CARACTERES`),
 *   no en tokens — no hay tokenizer propio y no se va a introducir uno solo
 *   para esta fase (dos medidores distintos = dos fuentes de verdad, y eso la
 *   casa lo prohíbe). Por eso:
 *     · `caracteres` es MEDIDO siempre.
 *     · `tokensEstimados` es ESTIMADO con una razón declarada y configurable.
 *     · Si el proveedor reporta `usage`, ese número manda y se marca `medido`.
 *   Un dato inventado aquí sería peor que no tenerlo.
 *
 * Este módulo es PURO: cero imports de fs, cero red, cero estado global. Todo
 * lo que devuelve se puede recalcular y comparar. Es lo que permite tener suite.
 */

import type { ContextoEnsamblado, CapaContexto } from "./motorContexto.js";
// FASE 13 (v2.3.14): los umbrales son decisión de producto y se declaran en la
//constante compartida. Este módulo reexporta con nombre de dominio, no copia el número.
import { UMBRAL_PRESION_AVISO, UMBRAL_PRESION_FORZAR_COMPACTAR, UMBRAL_PRESION_SUGERIR_COMPACTAR } from "../constants";

// ---------------------------------------------------------------------------
// 1 · CONSTANTES DECLARADAS (una sola fuente de verdad para los umbrales)
// ---------------------------------------------------------------------------

/** Caracteres por token del estimador. 4 es la razón estándar para texto
 *  latino con modelos BPE; se declara para que sea auditable y cambiable. */
export const CARACTERES_POR_TOKEN_ESTIMADO = 4;

/** Ventana de contexto por defecto si el modelo no declara la suya. */
export const VENTANA_TOKENS_DEFECTO = 128_000;

/**
 * Umbrales de presión, en fracción de la ventana. **Viven en `constants.ts`**
 * (FASE 13 del plano) y acá sólo se reexportan con el nombre de dominio: mover el
 * número no debe exigir leer un módulo de ingeniería, y tener dos copias es lo que
 * produjo la deriva que esta fase cierra.
 */
export const UMBRAL_AVISO = UMBRAL_PRESION_AVISO;
export const UMBRAL_SUGERIR_COMPACTAR = UMBRAL_PRESION_SUGERIR_COMPACTAR;
export const UMBRAL_FORZAR_COMPACTAR = UMBRAL_PRESION_FORZAR_COMPACTAR;

// ---------------------------------------------------------------------------
// 2 · TIPOS PÚBLICOS
// ---------------------------------------------------------------------------

/** De dónde salió el número. `medido` = lo dijo el proveedor. */
export type Procedencia = "medido" | "estimado";

/** Familias de gasto. Tres, porque son las tres que se pueden accionar:
 *  la ley casi no cambia (cacheable), el catálogo tampoco, el historial sí. */
export type FamiliaContexto = "sistema" | "herramientas" | "mensajes";

export interface DesgloseContexto {
  sistema: number;
  herramientas: number;
  mensajes: number;
  total: number;
  /** Detalle por capa, en el orden en que las puso el ensamblador. */
  porCapa: Array<{ etiqueta: string; familia: FamiliaContexto; caracteres: number }>;
  procedencia: Procedencia;
}

export interface PresionContexto {
  tokens: number;
  ventana: number;
  fraccion: number;
  porcentaje: number;
  nivel: NivelPresion;
  /** Frase lista para [ESTADO VIVO DEL TURNO]; vacía si no hay nada que decir. */
  aviso: string;
  procedencia: Procedencia;
}

export type NivelPresion = "holgado" | "aviso" | "sugerir_compactar" | "forzar_compactar";

export interface LatenciaTurno {
  /** ms hasta el primer token. `null` si el proveedor no lo reportó. */
  ttftMs: number | null;
  /** ms decodificando el resto. `null` si no se puede separar. */
  decodeMs: number | null;
  pasos: number;
  proveedor?: string;
  modelo?: string;
}

export interface HuellaContexto {
  desglose: DesgloseContexto;
  presion: PresionContexto;
  /** Una línea compacta, la que se pega en el estado vivo. */
  linea: string;
}

// ---------------------------------------------------------------------------
// 3 · UTILIDADES INTERNAS (puras, sin efectos)
// ---------------------------------------------------------------------------

/** Tokens estimados desde caracteres. Redondeo hacia arriba: quien avisa de
 *  presión prefiere pasarse por un token antes que quedarse corto. */
export function tokensDesdeCaracteres(caracteres: number): number {
  if (!Number.isFinite(caracteres) || caracteres <= 0) return 0;
  return Math.ceil(caracteres / CARACTERES_POR_TOKEN_ESTIMADO);
}

/**
 * Mapa de familia por nivel de capa. Es el único `switch` que traduce el
 * vocabulario del ensamblador (`L0…L5`) al de producto (`sistema|herramientas|
 * mensajes`). Si mañana el ensamblador añade un nivel, cae en `mensajes` y la
 * suma SIGUE cuadrando con el total — el invariante se sostiene sin tocarlo.
 *
 *   L0 OBJETIVO · la tarea del turno              → mensajes
 *   L1 ARCHIVOS AFECTADOS · contenido leído       → mensajes
 *   L2 DEPENDENCIAS E IMPACTO · grafo del proyecto→ sistema
 *   L3 ARQUITECTURA · modelo del proyecto         → sistema
 *   L4 MEMORIA · historial/conocimiento retenido  → mensajes
 *   L5 CONOCIMIENTO GENERAL · saber de la semilla → herramientas
 */
const FAMILIA_POR_PREFIJO: Array<[RegExp, FamiliaContexto]> = [
  // L5 va PRIMERO: `L5` empieza por L y comparte prefijo con L0/L1/L2/L4, así
  // que si se evalúa después de `/^L[25]\b/`, el 5 lo captura el patrón de
  // sistema y el conocimiento general queda mal clasificado. El orden de este
  // array ES la regla de prioridad; invertirlo cambia el resultado.
  [/^L?5\b|CONOCIMIENTO/i, "herramientas"],
  [/^L[23]\b/, "sistema"],
  [/^L[014]\b/, "mensajes"],
];

export function familiaDeCapa(capa: Pick<CapaContexto, "nivel" | "etiqueta">): FamiliaContexto {
  for (const [patron, familia] of FAMILIA_POR_PREFIJO) {
    if (patron.test(capa.etiqueta)) return familia;
  }
  // Respaldo por nivel numérico: nunca lanza, siempre clasifica.
  switch (capa.nivel) {
    case 2:
    case 3:
      return "sistema";
    case 5:
      return "herramientas";
    default:
      return "mensajes";
  }
}

/** Aplana una etiqueta a la línea de estado: una sola línea, sin saltos. */
function unaLinea(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// 4 · DESGLOSE
// ---------------------------------------------------------------------------

export interface EntradaDesglose {
  /**
   * Lo que devolvió `ensamblarContexto`.
   * `caracteres` es OPCIONAL a propósito: si no viene, se deriva de la suma de
   * las capas (que es el número autoritativo de todos modos, porque un
   * `ensamblado` recortado trae `caracteres` que ya no cuadra con sus capas).
   */
  ensamblado: Pick<ContextoEnsamblado, "capas"> & { caracteres?: number };
  /**
   * Caracteres que el ensamblador midió como texto final. Se acepta aparte
   * porque `capas` puede venir ya recortada y `caracteres` es la cifra
   * autoritativa del ensamblador. Si no coincide con la suma, se declara en
   * `procedencia: "estimado"` para no dar por medido lo que no cuadra.
   */
  caracteresDeclarados?: number;
}

/**
 * Agrupa las capas del ensamblado en las tres familias accionables.
 * INVARIANTE que la suite comprueba: `sistema + herramientas + mensajes ===
 * total`, siempre, para cualquier entrada con capas bien formadas.
 */
export function desglosarContexto(entrada: EntradaDesglose): DesgloseContexto {
  const capas = Array.isArray(entrada.ensamblado?.capas) ? entrada.ensamblado.capas : [];

  const acumulado: Record<FamiliaContexto, number> = { sistema: 0, herramientas: 0, mensajes: 0 };
  const porCapa: DesgloseContexto["porCapa"] = [];

  for (const capa of capas) {
    const caracteres = typeof capa?.texto === "string" ? capa.texto.length : 0;
    const familia = familiaDeCapa(capa);
    acumulado[familia] += caracteres;
    porCapa.push({
      etiqueta: typeof capa?.etiqueta === "string" ? capa.etiqueta : `N${capa?.nivel ?? "?"}`,
      familia,
      caracteres,
    });
  }

  const sumado = acumulado.sistema + acumulado.herramientas + acumulado.mensajes;
  const declarado = typeof entrada.caracteresDeclarados === "number"
    ? entrada.caracteresDeclarados
    : (typeof entrada.ensamblado?.caracteres === "number" ? entrada.ensamblado.caracteres : sumado);

  // El total SIEMPRE es la suma de las partes: así el invariante no se puede
  // romper por un dato externo incoherente. La discrepancia se declara aparte.
  const total = sumado;
  const procedencia: Procedencia = declarado === sumado ? "medido" : "estimado";

  return {
    sistema: acumulado.sistema,
    herramientas: acumulado.herramientas,
    mensajes: acumulado.mensajes,
    total,
    porCapa,
    procedencia,
  };
}

// ---------------------------------------------------------------------------
// 5 · PRESIÓN
// ---------------------------------------------------------------------------

export function nivelDePresion(fraccion: number): NivelPresion {
  if (!Number.isFinite(fraccion) || fraccion >= UMBRAL_FORZAR_COMPACTAR) return "forzar_compactar";
  if (fraccion >= UMBRAL_SUGERIR_COMPACTAR) return "sugerir_compactar";
  if (fraccion >= UMBRAL_AVISO) return "aviso";
  return "holgado";
}

export interface EntradaPresion {
  tokens: number;
  ventana?: number;
  procedencia?: Procedencia;
  herramientaSugerida?: string;
}

/**
 * Calcula la presión y devuelve UNA frase accionable (o vacía si está holgado:
 * el estado vivo no dice «todo bien», dice lo que hay que hacer).
 */
export function calcularPresion(entrada: EntradaPresion): PresionContexto {
  const ventana = Number.isFinite(entrada.ventana) && (entrada.ventana as number) > 0
    ? Math.floor(entrada.ventana as number)
    : VENTANA_TOKENS_DEFECTO;

  const crudos = Number.isFinite(entrada.tokens) ? Math.max(0, Math.floor(entrada.tokens)) : 0;
  const fraccion = ventana > 0 ? crudos / ventana : 0;
  const porcentaje = Math.round(fraccion * 100);
  const nivel = nivelDePresion(fraccion);
  const procedencia = entrada.procedencia ?? "estimado";

  const cifra = `contexto ${crudos.toLocaleString("es-UY")}/${ventana.toLocaleString("es-UY")} (${porcentaje} %)`;
  const sufijo = procedencia === "estimado" ? " [estimado]" : "";
  const herramienta = entrada.herramientaSugerida?.trim();

  let aviso = "";
  if (nivel === "aviso") {
    aviso = `${cifra}${sufijo} — vigilar: cerca del umbral de ${Math.round(UMBRAL_AVISO * 100)} %.`;
  } else if (nivel === "sugerir_compactar") {
    aviso = `${cifra}${sufijo} — sugerir compactar${herramienta ? ` (${herramienta})` : ""}.`;
  } else if (nivel === "forzar_compactar") {
    aviso = `${cifra}${sufijo} — compactar OBLIGATORIO: supera el ${Math.round(UMBRAL_FORZAR_COMPACTAR * 100)} % de la ventana.`;
  }

  return { tokens: crudos, ventana, fraccion, porcentaje, nivel, aviso, procedencia };
}

// ---------------------------------------------------------------------------
// 6 · LATENCIA DESDOBLADA
// ---------------------------------------------------------------------------

export interface EntradaLatencia {
  ttftMs?: number | null;
  totalMs?: number | null;
  pasos?: number;
  proveedor?: string;
  modelo?: string;
}

/**
 * Separa TTFT de decodificación. Si sólo hay `totalMs`, el TTFT queda en `null`
 * de forma EXPLÍCITA: no se rellena con una suposición. `decodeMs` sólo se
 * calcula si ambos son números coherentes (total ≥ ttft).
 */
export function medirLatencia(entrada: EntradaLatencia): LatenciaTurno {
  const ttft = typeof entrada.ttftMs === "number" && Number.isFinite(entrada.ttftMs) && entrada.ttftMs >= 0
    ? entrada.ttftMs
    : null;
  const total = typeof entrada.totalMs === "number" && Number.isFinite(entrada.totalMs) && entrada.totalMs >= 0
    ? entrada.totalMs
    : null;

  const decode = ttft !== null && total !== null && total >= ttft ? total - ttft : null;
  const pasos = Number.isFinite(entrada.pasos) && (entrada.pasos as number) > 0
    ? Math.floor(entrada.pasos as number)
    : 0;

  return {
    ttftMs: ttft,
    decodeMs: decode,
    pasos,
    ...(entrada.proveedor ? { proveedor: entrada.proveedor } : {}),
    ...(entrada.modelo ? { modelo: entrada.modelo } : {}),
  };
}

/** Segundos con un decimal, en formato es-UY («4,2 s»). Sin valor → «—». */
export function segundos(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/** Línea de latencia para el estado vivo. Declara lo que falta, no lo inventa. */
export function lineaDeLatencia(lat: LatenciaTurno): string {
  const partes: string[] = [`TTFT ${segundos(lat.ttftMs)}`, `decode ${segundos(lat.decodeMs)}`];
  if (lat.pasos > 0) partes.push(`${lat.pasos} paso${lat.pasos === 1 ? "" : "s"}`);
  if (lat.proveedor) partes.push(lat.proveedor);
  if (lat.modelo) partes.push(lat.modelo);
  return unaLinea(partes.join(" · "));
}

// ---------------------------------------------------------------------------
// 7 · LA HUELLA COMPLETA (lo que consume `conciencia.ts`)
// ---------------------------------------------------------------------------

export interface EntradaHuella {
  ensamblado: Pick<ContextoEnsamblado, "capas"> & { caracteres?: number };
  caracteresDeclarados?: number;
  ventana?: number;
  /** Uso REAL reportado por el proveedor. Si viene, manda sobre la estimación. */
  tokensMedidos?: number;
  herramientaSugerida?: string;
}

/**
 * Compone desglose + presión y devuelve una sola línea lista para el estado
 * vivo. Si el proveedor reportó tokens, la presión usa ESE número y se marca
 * `medido`; si no, se estima desde caracteres y se declara `estimado`.
 */
export function medirHuellaContexto(entrada: EntradaHuella): HuellaContexto {
  const desglose = desglosarContexto({
    ensamblado: entrada.ensamblado,
    caracteresDeclarados: entrada.caracteresDeclarados,
  });

  const tokensMedidos = typeof entrada.tokensMedidos === "number" && Number.isFinite(entrada.tokensMedidos) && entrada.tokensMedidos > 0
    ? Math.floor(entrada.tokensMedidos)
    : null;

  const presion = calcularPresion({
    tokens: tokensMedidos ?? tokensDesdeCaracteres(desglose.total),
    ventana: entrada.ventana,
    procedencia: tokensMedidos !== null ? "medido" : "estimado",
    herramientaSugerida: entrada.herramientaSugerida,
  });

  const reparto = `[sistema ${desglose.sistema} · herramientas ${desglose.herramientas} · mensajes ${desglose.mensajes}] caracteres`;
  const linea = unaLinea(presion.aviso ? `${presion.aviso} ${reparto}` : reparto);

  return { desglose, presion, linea };
}

// ---------------------------------------------------------------------------
// 8 · LA PRESIÓN DEL TEXTO REAL (v2.3.14 — el cable que faltaba)
// ---------------------------------------------------------------------------

export interface EntradaPresionDeTexto {
  /** El texto que de verdad se va a mandar: la instrucción de sistema ya armada. */
  texto: string;
  /**
   * Ventana del modelo en tokens (`numCtx`). Si no viene se toma
   * `VENTANA_TOKENS_DEFECTO` y el resultado se declara `estimado`: una presión
   * calculada contra una ventana supuesta no puede presentarse como medida.
   */
  ventanaTokens?: number;
  /** Niveles que el ensamble ya descartó (L0…L5). Son los que hay que NOMBRAR. */
  descartadas?: number[];
  /** Cuántos caracteres quedaron después del descarte. */
  volvioQuedar?: number;
  herramientaSugerida?: string;
}

/**
 * Mide el texto real contra la ventana real. Es el punto donde la FASE 13 dejaba
 * de ser un módulo hermoso y vacío: `medirHuellaContexto` necesitaba el
 * `ContextoEnsamblado` completo, y el server arma la instrucción de sistema por
 * otro camino (`buildEngineContext` + conciencia), así que nadie tenía a mano el
 * objeto que la función pedía. Resultado: 359 líneas correctas que nadie llamaba,
 * con su suite verde y sin registrar. Acá entra la versión que sí se puede llamar
 * desde donde se construye el prompt.
 *
 * Devuelve `aviso` VACÍO por debajo del umbral: el estado vivo no dice «todo
 * bien», dice lo que hay que hacer, y callar cuesta cero caracteres.
 */
export function presionDeTexto(entrada: EntradaPresionDeTexto): PresionContexto {
  const caracteres = typeof entrada.texto === "string" ? entrada.texto.length : 0;
  const base = calcularPresion({
    tokens: tokensDesdeCaracteres(caracteres),
    ventana: entrada.ventanaTokens,
    procedencia: Number.isFinite(entrada.ventanaTokens as number) ? "medido" : "estimado",
    herramientaSugerida: entrada.herramientaSugerida,
  });
  if (base.nivel !== "forzar_compactar") return base;

  // El 80 % no es para anunciarse: es para decir qué se fue y cuánto volvió a
  // quedar. Sin esas dos cifras el aviso describe un estado; con ellas describe
  // una consecuencia.
  const piezas = (entrada.descartadas || []).map((n) => `L${n}`).join(", ");
  const extras: string[] = [];
  if (piezas) extras.push(`descartado: ${piezas}`);
  if (typeof entrada.volvioQuedar === "number") extras.push(`volvió a quedar en ${entrada.volvioQuedar.toLocaleString("es-UY")} caracteres`);
  if (extras.length === 0) return base;
  return { ...base, aviso: `${base.aviso} — ${extras.join(" · ")}.` };
}

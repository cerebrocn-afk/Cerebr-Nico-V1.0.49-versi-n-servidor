/**
 * contextoBucle.ts — FASE 3: EL BUCLE, VISIBLE PARA EL MODELO (v1.64.0)
 * ======================================================================
 * QUÉ FALTABA (hoja de ruta, Fase 3 original, aplazada por el override v1.63):
 *   Hasta ahora el motor DETECTABA los bucles y los CORTABA (lazo suave,
 *   reescritura idéntica, guarda de relectura v1.63), pero el modelo nunca
 *   SABÍA que estaba en bucle: se le cortaba el turno de golpe. Un modelo que no
 *   ve su propio patrón no puede corregirlo — vuelve a caer en la siguiente.
 *
 * QUÉ HACE ESTA FASE:
 *   Antes de cortar, se le hace VISIBLE el bucle. Este módulo mira la secuencia
 *   de pasos del turno y detecta un CICLO que se repite — no solo una
 *   herramienta repetida (periodo 1), sino un patrón rotado de hasta 6 pasos
 *   (p. ej. memory_estado → memory_listar_pages → read_file → read_file ×N).
 *   Cuando el ciclo reaparece, devuelve un MENSAJE explicativo para inyectar en
 *   la conversación: «llevas N vueltas repitiendo A→B→C→D; eso no avanza; haz
 *   esto otro». El modelo lo lee y tiene la oportunidad de romper el bucle por
 *   sí mismo ANTES de que las guardas duras cierren el turno.
 *
 * CONTROL DE FALSO POSITIVO (progreso real NO es bucle):
 *   Un turno que AVANZA — una escritura/edición exitosa — no está en bucle
 *   aunque haya repetido lecturas mientras tanto. Toda obra exitosa REINICIA la
 *   secuencia: el detector solo acumula pasos estériles. Así, «editar A → probar
 *   → editar A → probar» mientras se corrige de verdad (cada edición cambia el
 *   archivo) nunca se marca como bucle.
 *
 * Capa PURA: sin red, sin disco, sin estado global. El llamador pasa y guarda
 * el estado. Testeable en aislado.
 */

/** Estado del detector de bucles (v1.65.0: SOBREVIVE a los turnos — ver `abrirTurnoBucle`). */
export interface EstadoContextoBucle {
  /** tokens de los pasos estériles del turno (acotada por `MAX_SECUENCIA`). */
  secuencia: string[];
  /** repeticiones ya avisadas, para no repetir el MISMO aviso cada paso. */
  avisadoEn: number;
  /** v1.65.0 — ¿este turno registró alguna OBRA exitosa? (progreso real). */
  huboProgresoTurno: boolean;
  /** v1.65.0 — racha de turnos SEGUIDOS atrapados en el MISMO bucle. */
  turnosEnBucle: number;
}

/** Cuántos pasos se recuerdan como máximo (ventana deslizante). */
export const MAX_SECUENCIA = 48;
/** Periodo máximo de ciclo que se busca (A→B→C→D→E→F). */
export const CICLO_MAX_PERIODO = 6;
/** A la Nª repetición del ciclo se hace VISIBLE el aviso al modelo. */
export const REPES_AVISO = 2;
/** A la Nª repetición se recomienda CORTAR (respaldo de las guardas duras). */
export const REPES_CORTE = 4;
/**
 * v1.65.0 — cuántos turnos SEGUIDOS atrapados en el mismo bucle bastan para
 * cortar aunque la repetición DENTRO de cada turno no llegue a `REPES_CORTE`.
 * El caso real: el modelo gira el ciclo, se le corta el turno, el usuario dice
 * «sigue» y vuelve a girar EL MISMO ciclo. Un detector que nace vacío en cada
 * turno nunca lo escala (mismo defecto que la ventanilla de v1.61 → v1.62).
 */
export const TOPE_TURNOS_EN_BUCLE = 2;

export function nuevoContextoBucle(): EstadoContextoBucle {
  return { secuencia: [], avisadoEn: 0, huboProgresoTurno: false, turnosEnBucle: 0 };
}

/**
 * Registra un paso del turno. `esProgreso=true` (una obra exitosa) REINICIA la
 * secuencia: el turno avanzó, no está en bucle — control de falso positivo.
 */
export function registrarPaso(
  estado: EstadoContextoBucle,
  token: string,
  esProgreso = false,
): void {
  if (esProgreso) {
    estado.secuencia = [];
    estado.avisadoEn = 0;
    estado.huboProgresoTurno = true; // v1.65.0 — el turno AVANZÓ: rompe la racha entre turnos
    return;
  }
  estado.secuencia.push(token);
  if (estado.secuencia.length > MAX_SECUENCIA) estado.secuencia.shift();
}

/**
 * v1.65.0 — ABRE UN TURNO sobre un estado que SOBREVIVE a los turnos.
 * ======================================================================
 * El backend de la IDE es de UNA sesión (el proceso ES la sesión), así que el
 * estado correcto es un singleton de módulo — igual que la ventanilla de
 * reescritura de v1.62. Esta función rota la ventana al ARRANCAR cada turno:
 *
 *   - Si el turno ANTERIOR AVANZÓ (hubo obra) o NO estaba en bucle, se empieza
 *     en limpio: se vacía la secuencia y se corta la racha. ← CONTROL DE FALSO
 *     POSITIVO: tres turnos de preguntas legítimas, o un turno que de verdad
 *     hizo obra, NUNCA arrastran sospecha al siguiente.
 *   - Si el turno anterior estaba EN BUCLE y NO avanzó, se CONSERVA la
 *     secuencia (para que el ciclo repetido entre turnos siga acumulando) y se
 *     incrementa la racha `turnosEnBucle`. Así el 2º/3er turno con el mismo
 *     ciclo escala hasta el corte aunque dentro de cada turno no se repita 4×.
 */
export function abrirTurnoBucle(estado: EstadoContextoBucle): void {
  const cicloPrev = detectarCiclo(estado.secuencia);
  const turnoPrevioEnBucle =
    !estado.huboProgresoTurno && !!cicloPrev && estado.secuencia.length > 0;
  if (turnoPrevioEnBucle) {
    estado.turnosEnBucle += 1; // sigue atrapado en el MISMO bucle entre turnos
    // la secuencia se conserva (ya acotada por MAX_SECUENCIA) para seguir contando
  } else {
    estado.turnosEnBucle = 0;
    estado.secuencia = [];
    estado.avisadoEn = 0;
  }
  estado.huboProgresoTurno = false; // empieza el turno nuevo sin progreso anótado
}

export interface CicloDetectado {
  /** longitud del patrón que se repite. */
  periodo: number;
  /** cuántas veces seguidas aparece el patrón (incluida la última). */
  repeticiones: number;
  /** el patrón en sí (los últimos `periodo` tokens). */
  patron: string[];
}

/**
 * Detecta el ciclo que TERMINA en el último paso: para cada periodo L, cuenta
 * cuántas veces el bloque final de L tokens se repite hacia atrás sin romperse.
 * Se queda con el que cubre MÁS pasos (y, a igualdad, el periodo más corto):
 * así «AAAA» se lee como periodo 1 ×4 y «ABCD ABCD ABCD» como periodo 4 ×3.
 */
export function detectarCiclo(
  seq: string[],
  maxPeriodo = CICLO_MAX_PERIODO,
  minRepes = REPES_AVISO,
): CicloDetectado | null {
  const n = seq.length;
  let mejor: CicloDetectado | null = null;
  const topeL = Math.min(maxPeriodo, Math.floor(n / minRepes));
  for (let L = 1; L <= topeL; L++) {
    const patron = seq.slice(n - L);
    let repes = 1;
    for (let i = n - 2 * L; i >= 0; i -= L) {
      let igual = true;
      for (let j = 0; j < L; j++) {
        if (seq[i + j] !== patron[j]) { igual = false; break; }
      }
      if (!igual) break;
      repes++;
    }
    if (repes < minRepes) continue;
    const cobertura = repes * L;
    const mejorCobertura = mejor ? mejor.repeticiones * mejor.periodo : -1;
    if (cobertura > mejorCobertura || (cobertura === mejorCobertura && L < (mejor as CicloDetectado).periodo)) {
      mejor = { periodo: L, repeticiones: repes, patron };
    }
  }
  return mejor;
}

export interface VeredictoContextoBucle {
  /** ¿se detectó un ciclo repetido? */
  enBucle: boolean;
  /** mensaje para INYECTAR en la conversación (solo si es un aviso nuevo). */
  mensaje?: string;
  /** escalón duro: el ciclo persistió hasta el tope → conviene cerrar. */
  debeCortar: boolean;
  ciclo?: CicloDetectado;
}

/** Nombre legible del token (quita el hash de argumentos para el mensaje). */
function etiqueta(token: string): string {
  const i = token.indexOf("\u0000");
  return i >= 0 ? token.slice(0, i) : token;
}

/** El texto que ve el modelo: le decimos EXACTAMENTE qué ciclo está repitiendo. */
export function mensajeContextoBucle(ciclo: CicloDetectado, turnosEnBucle = 0): string {
  const pasos = ciclo.patron.map(etiqueta);
  const cadena = pasos.length === 1 ? `«${pasos[0]}»` : pasos.map((p) => `«${p}»`).join(" → ");
  // v1.65.0 — si el bucle viene ARRASTRADO de turnos anteriores, el modelo debe
  // saber que insistir tras «sigue» no reinicia nada: es el MISMO bucle.
  const entreTurnos = turnosEnBucle > 0
    ? `⚠️ Esto NO es nuevo: llevas ${turnosEnBucle + 1} turno(s) seguidos atrapado en el MISMO ciclo — volver a intentarlo tras un «sigue» no lo reinicia. `
    : "";
  return (
    `🔁 CONTEXTO DE BUCLE (te lo hago visible a propósito). ${entreTurnos}Llevas ${ciclo.repeticiones} ` +
    `vueltas repitiendo EXACTAMENTE esta secuencia de pasos: ${cadena}. ` +
    `Repetir el mismo ciclo no está avanzando la tarea y está llenando tu ventana de contexto. ` +
    `ANTES de volver a llamar a ninguna de esas herramientas, haz una de estas tres cosas:\n` +
    `  1) Resume en UNA frase qué conclusión sacas de lo que ya leíste y RESPONDE/ESCRIBE el resultado ya.\n` +
    `  2) Si te falta un dato concreto, pídelo con OTRA herramienta o con argumentos DISTINTOS.\n` +
    `  3) Si no sabes cómo seguir, dilo con honestidad en vez de repetir el ciclo.\n` +
    `No vuelvas a ejecutar ${cadena} tal cual.`
  );
}

/**
 * Evalúa el estado actual. Devuelve un aviso VISIBLE solo cuando el ciclo
 * CRECIÓ respecto al último aviso (no spamea el mismo texto cada paso).
 * v1.65.0 — también corta cuando el MISMO bucle arrastra demasiados turnos
 * seguidos (`turnosEnBucle >= TOPE_TURNOS_EN_BUCLE`), aunque la repetición
 * DENTRO de este turno aún no llegue a `REPES_CORTE`.
 */
export function evaluarContextoBucle(estado: EstadoContextoBucle): VeredictoContextoBucle {
  const ciclo = detectarCiclo(estado.secuencia);
  if (!ciclo) return { enBucle: false, debeCortar: false };
  const esNuevo = ciclo.repeticiones > estado.avisadoEn;
  if (esNuevo) estado.avisadoEn = ciclo.repeticiones;
  const cortePorTurnos = estado.turnosEnBucle >= TOPE_TURNOS_EN_BUCLE; // v1.65.0
  return {
    enBucle: true,
    mensaje: esNuevo ? mensajeContextoBucle(ciclo, estado.turnosEnBucle) : undefined,
    debeCortar: ciclo.repeticiones >= REPES_CORTE || cortePorTurnos,
    ciclo,
  };
}

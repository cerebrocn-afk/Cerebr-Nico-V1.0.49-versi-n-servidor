/**
 * seguidorHilo.ts — LA PANTALLA VA MÁS LENTA QUE EL TEXTO (v2.3.2)
 * ================================================================
 * Lo pidió el usuario el 4/11, con la formulación más útil que leí de él:
 * «estabiliza más el movimiento automático del chat con la escritura, **la pantalla
 * se mueve más lenta que el texto**».
 *
 * LO QUE HABÍA (`ChatCenter.tsx`, desde v1.98.0)
 * ---------------------------------------------
 * Un effect que, en cada cambio de `messages` / `currentStreamingText`, hacía:
 *
 *   messagesEndRef.current?.scrollIntoView({ behavior: currentStreamingText ? "auto" : "smooth" })
 *
 * O sea: **mientras llega texto — justo cuando más gotas hay — el salto era `auto`,
 * un teletransporte al píxel final por cada gota**. `smooth` estaba al revés: se
 * reservaba para cuando NO hay streaming, que es el caso tranquilo. El resultado
 * que él describe es exactamente ese: el hilo va a sacudones por delante de lo que
 * se puede leer.
 *
 * LA REGLA DE ESTE MÓDULO
 * -----------------------
 * La vista nunca adelanta al texto ni salta a él: **persigue un objetivo a una
 * velocidad finita**. Con eso se obtiene lo que el usuario pidió sin tener que
 * tocar la velocidad del texto (que ya es mérito de `goteo`, v1.99.3): la pantalla
 * se desliza por detrás y llega al fondo cuando el chorro se corta.
 *
 * Igual que en `goteo`, el paso sale de un **reloj absoluto**, no de los deltas de
 * los frames: medido ahí que a 60 fps los deltas enteros daban 0 (`1000/60` a mano
 * = 16) y la animación se moría. Acá el mismo error daría un hilo que no sigue.
 *
 * Puro: ni DOM, ni `requestAnimationFrame`, ni `Date`. Entran las medidas del
 * elemento y el reloj por parámetro, así la suite puede exigir la MISMA curva de
 * desplazamiento para los tres patrones de llegada (pantallazo, gotas, parches)
 * sin montar un navegador.
 */

/** Qué tan rápido persigue la vista al fondo, en píxeles por segundo. */
export const VELOCIDAD_SEGUIMIENTO_PX_S = 780;

/** Techo por cuadro. Sin esto, un cuadro de 500 ms (pestaña en segundo plano, GC)
 *  se cobra la ventana entera de un salto: el teletransporte que veníamos a curar. */
export const PASO_MAXIMO_PX = 52;

/** Distancia al fondo con la que aún se considera "el usuario está abajo". */
export const UMBRAL_PEGADO_PX = 120;

/** Menos que esto ya no vale la pena mover la barra: se declara llegado. */
export const TOLERANCIA_PX = 0.75;

/**
 * v2.3.18 · EL ATRASO QUE YA NO SE PERSIGUE: SE ALCANZA.
 * ------------------------------------------------------
 * El defecto real del 8/11 («siguen escribiendo hacia abajo sin que el chat suba»)
 * NO estaba en la fórmula del objetivo: estaba en que la vista caminaba a
 * 780 px/s mientras el texto crecía a 40 px por cuadro (≈2500 px/s). La vista
 * perdía 27 px por cuadro y **nunca alcanzaba**: en 3 s de chorro quedaba 6000 px
 * atrás, con el texto naciendo fuera de la pantalla.
 *
 * Perseguir a velocidad finita es lo correcto para un texto que gotea; es un
 * error para un texto que corre más rápido que la vista. La regla que usan las
 * terminales desde siempre: si el atraso supera una pantalla, se salta al fondo.
 * No es un teletransporte por gota (eso era el defecto viejo de v1.98.0): es un
 * único salto cuando la distancia ya es irrelevante para la lectura.
 *
 * Se expresa en PANTALLAS, no en píxeles: así vale igual en una ventana de 600 px
 * que en un monitor de 1400.
 */
export const ATRASO_CRITICO_PANTALLAS = 1;

/** ¿El atraso ya es tan grande que perseguir no tiene sentido? */
export function atrasoCritico(falta: number, clientHeight: number): boolean {
  if (!(clientHeight > 0)) return false;
  return falta > clientHeight * ATRASO_CRITICO_PANTALLAS;
}

/** El fondo alcanzable del hilo (mismo cero que usa el navegador). */
export function objetivoDelHilo(scrollHeight: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight);
}

/**
 * v1.61.0 · EL OBJETIVO DE LECTURA (lo pidió el usuario el 4/11)
 * -------------------------------------------------------------
 * «la barra del chat déjala donde está, bien abajo; tu contestación es la que
 *  tiene que estar a esa altura y que el movimiento de la pantalla acompañe el
 *  texto».
 *
 * El compositor no se toca: sigue clavado al fondo. Lo que cambia es a dónde
 * lleva la vista el seguidor. Antes perseguía `scrollHeight - clientHeight`
 * (el fondo absoluto del hilo), y con una respuesta larga eso deja el texto
 * recién escrito pegado al borde inferior, por debajo de la mitad de la
 * pantalla. Ahora persigue el punto en el que **el centro de la respuesta
 * coincide con el centro de la ventana**:
 *
 *     objetivo = fondo - altoRespuesta/2 + clientHeight/2
 *
 * Acotado a [0, fondo]: si la respuesta es más corta que la ventana, el
 * objetivo es el fondo (no se puede centrar lo que ya cabe entero) y si el
 * cálculo se pasa del fondo, se recorta. Puro: entra por parámetro, sale un
 * número, la suite lo puede exigir sin DOM.
 *
 * v2.3.18 — una respuesta MÁS ALTA que la ventana no se puede centrar: su centro
 * queda por encima del texto que acaba de nacer. En ese caso se persigue el fondo.
 * (Medido: con la fórmula sola el objetivo no retrocedía, porque el historial
 * crece junto con la respuesta. La guarda es correcta y se queda, pero el defecto
 * del 8/11 era la VELOCIDAD, no esta cuenta — ver `atrasoCritico`.)
 */
export function objetivoLectura(
  scrollHeight: number,
  clientHeight: number,
  altoRespuesta: number
): number {
  const fondo = objetivoDelHilo(scrollHeight, clientHeight);
  if (!(altoRespuesta > 0)) return fondo;
  if (altoRespuesta > clientHeight) return fondo;
  const centrado = fondo - altoRespuesta / 2 + clientHeight / 2;
  return Math.max(0, Math.min(fondo, centrado));
}

/** ¿Está el usuario pegado abajo? (el guard que impide robarle el scroll). */
export function estaPegadoAlFondo(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  umbral: number = UMBRAL_PEGADO_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight < umbral;
}

export interface PasoSeguidor {
  /** Dónde hay que poner la barra en este cuadro. */
  pos: number;
  /** Reloj del cuadro: se re-inyecta en la próxima llamada (reloj absoluto). */
  en: number;
  /** Ya no hay nada que perseguir: el conductor puede soltar el rAF. */
  llego: boolean;
}

/**
 * Un cuadro de persecución.
 *
 * `anterior = 0` (o ausente) es el PRIMER cuadro: no se conoce el dt, así que no
 * se puede prometer una velocidad — se da un paso chico y se ancla el reloj. Dar
 * el salto completo ahí sería volver al `scrollIntoView` viejo.
 *
 * v2.3.18 — EL ATRASO CRÍTICO CORTA LA PERSECUCIÓN. Si la vista quedó más de una
 * pantalla por detrás (el texto corrió más rápido que la velocidad finita), se
 * salta al objetivo en este cuadro. Sin esto, un chorro rápido deja la vista
 * atrás para siempre: es el defecto que el usuario reportó el 8/11.
 */
export function siguientePosicion(op: {
  actual: number;
  objetivo: number;
  ahora: number;
  anterior?: number;
  velocidad?: number;
  clientHeight?: number;
}): PasoSeguidor {
  const v = Math.max(1, op.velocidad === undefined ? VELOCIDAD_SEGUIMIENTO_PX_S : op.velocidad);
  const dt = op.anterior === undefined || op.anterior <= 0 ? 0 : Math.max(0, op.ahora - op.anterior);
  const falta = op.objetivo - op.actual;
  if (Math.abs(falta) <= TOLERANCIA_PX) return { pos: op.objetivo, en: op.ahora, llego: true };
  // v2.3.19 — EL ATRASO CRÍTICO ACELERA HASTA EL TECHO, NO SALTA.
  // v2.3.18 saltaba al objetivo de un golpe y rompió el contrato de suavidad
  // (ningún cuadro mueve la barra más de PASO_MAXIMO_PX). El teletransporte es
  // el defecto viejo de v1.98.0, no la cura. La cura es gastar el techo entero
  // por cuadro: 52 px x 62,5 cuadros/s = 3250 px/s, más rápido que los ~2500 px/s
  // a los que corre el texto. Alcanza sin sacudir.
  const critico = falta > 0 && atrasoCritico(falta, op.clientHeight ?? 0);
  // Cuadro nuevo: paso de arranque acotado (nunca el salto entero).
  const paso = dt === 0 || critico ? Math.min(PASO_MAXIMO_PX, Math.abs(falta)) : Math.min(PASO_MAXIMO_PX, (v * dt) / 1000);
  const pos = op.actual + Math.sign(falta) * Math.min(paso, Math.abs(falta));
  return { pos, en: op.ahora, llego: Math.abs(op.objetivo - pos) <= TOLERANCIA_PX };
}

/**
 * LA PRUEBA DE LA CALMA: tres patrones de llegada del mismo texto producen la
 * misma posición de barra al mismo tiempo. `llegadas` son los tamaños de
 * `scrollHeight` en cada paint del navegador (un pantallazo = una entrada grande;
 * goteo = muchas chicas; parches = medianas). Si el conductor dependiera de la
 * forma en que llega el texto, la curva sería distinta por patrón — que es la
 * queja del usuario.
 */
export function curvaDeSeguimiento(
  llegadas: number[],
  clientHeight: number,
  opts: { velocidad?: number; pasoMs?: number; desde?: number; altoRespuesta?: number } = {}
): number[] {
  const pasoMs = opts.pasoMs === undefined ? 16 : Math.max(1, opts.pasoMs);
  let actual = opts.desde === undefined ? 0 : opts.desde;
  let anterior = 0;
  const out: number[] = [];
  for (let i = 0; i < llegadas.length; i++) {
    const objetivo = objetivoLectura(llegadas[i], clientHeight, opts.altoRespuesta ?? 0);
    for (let cuadro = 0; cuadro < 400; cuadro++) {
      const ahora = (i * 400 + cuadro) * pasoMs;
      const r = siguientePosicion({
        actual,
        objetivo,
        ahora,
        anterior: anterior || undefined,
        velocidad: opts.velocidad,
        clientHeight,
      });
      actual = r.pos;
      anterior = r.en;
      out.push(Math.round(actual * 100) / 100);
      if (r.llego) break;
    }
  }
  return out;
}

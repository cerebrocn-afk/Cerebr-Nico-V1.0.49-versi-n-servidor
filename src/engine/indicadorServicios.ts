/**
 * indicadorServicios.ts — UN PUERTO, UN CRITERIO, UNA SONDA
 * ========================================================
 * 🐞 LO QUE DIJO EL USUARIO (4/11): «en la interfaz existe un cuatriplicado de
 * función, los puertos, y todos dicen indicativos distintos».
 *
 * Medido en el árbol, sin metáforas. El estado de los puertos lo calculan CUATRO
 * sitios con TRES criterios distintos y dos valores por defecto mentira:
 *
 *   1. `src/components/Header.tsx:788`  → `telemetry.port5000 ? "OK" : "OFF"`
 *      La semilla de `telemetry` está en `src/App.tsx:2182` y dice
 *      `port3000: true, port11434: true` y `false` en el resto: la cabecera
 *      AFIRMA algo de seis puertos antes de la primera lectura. Miente en los
 *      dos sentidos, y mienta distinto por puerto.
 *   2. `src/components/LeftSidebar.tsx:58` → consume el MISMO objeto, con su
 *      propio condicional de color.
 *   3. `src/components/EspinaActividad.tsx` → `GET /api/coreo` cada 700 ms y lo
 *      declara muerto a los 2800 ms (otro criterio, otro reloj).
 *   4. `server/routers/supervisorArranque.ts:365` →
 *      `vivo: vivos.get(s.id) !== false`: un mapa vacío devuelve `undefined`, y
 *      `undefined !== false` es `true`. O sea: **lo que no se midió se pinta de
 *      vivo**. En la misma pantalla donde el chip de al lado dice OFF.
 *
 * Cuatro superficies no son cuatro funciones: son cuatro oportunidades de
 * contradecirse, y —peor— cuatro sondeos del mismo dato comiéndose las seis
 * conexiones que Chrome da por origen. Ese es el mismo ahogo que hace que la
 * cabecera grite «servidor local caído» con el server sano (`presupuestoConn.ts`
 * lo documenta con números).
 *
 * LA REGLA DE ESTE MÓDULO
 * -----------------------
 *   · UN criterio: `decidirIndicador` — `arriba` / `abajo` / `sin-medir`. No hay
 *     un cuarto estado, y `sin-medir` NO se puede pintar de verde ni de rojo.
 *   · UNA sonda: `crearSondaCompartida` hace un solo request por intervalo por
 *     más componentes que la escuchen (single-flight + TTL + suscriptores).
 *   · LO QUE NO SE MIDIÓ SE DICE: el texto de `sin-medir` existe para que la UI
 *     no tenga que elegir entre dos mentiras.
 *
 * Puro: ni `fetch`, ni DOM, ni `Date`. Entran `pedir` y `ahora` por parámetro, así
 * la suite puede afirmar «cuatro consumidores, un request» sin abrir un socket.
 */

export type Indicador = "arriba" | "abajo" | "sin-medir";

/** Lo que el usuario lee. Corto, monoespaciado, accionable. */
export const TEXTO_INDICADOR: Record<Indicador, string> = {
  arriba: "OK",
  abajo: "OFF",
  "sin-medir": "—",
};

/** Frase larga para los `title` y para el registro. */
export const FRASE_INDICADOR: Record<Indicador, string> = {
  arriba: "respondiendo ahora",
  abajo: "no responde",
  "sin-medir": "todavía sin medir",
};

export interface LecturaPuerto {
  /** ¿Llegó una medición real? `false` ⇒ el valor de `vivo` no vale nada. */
  medido: boolean;
  /** Lo que dijo la medición. Ignorado si `medido` es `false`. */
  vivo: boolean;
}

/**
 * EL CRITERIO. Toda la verdad en tres líneas: sin medición no hay afirmación.
 * `vivo: true` sin `medido` es `sin-medir` — es exactamente el `!== false` del
 * supervisor, que pintaba de verde el mapa vacío.
 */
export function decidirIndicador(lectura: LecturaPuerto | null | undefined): Indicador {
  if (!lectura || lectura.medido !== true) return "sin-medir";
  return lectura.vivo ? "arriba" : "abajo";
}

/** Traducción directa a la etiqueta que va en el chip. */
export function etiqueta(lectura: LecturaPuerto | null | undefined): string {
  return TEXTO_INDICADOR[decidirIndicador(lectura)];
}

/**
 * ¿Se contradicen dos superficies? Sirve al test y sirve a la consola: si dos
 * lecturas del mismo puerto dicen cosas distintas con datos medidos, hay dos
 * criterios vivos y esto tiene que gritar.
 */
export function enContradiccion(a: LecturaPuerto | null | undefined, b: LecturaPuerto | null | undefined): boolean {
  const ia = decidirIndicador(a);
  const ib = decidirIndicador(b);
  if (ia === "sin-medir" || ib === "sin-medir") return false; // sin dato no hay contradicción: hay vacío
  return ia !== ib;
}

/* ─────────────────────── LA SONDA COMPARTIDA ─────────────────────── */

export interface Muestra<T> {
  en: number;
  datos: T;
  /** Fallo del sondeo: NO es «todo abajo», es «no sé». */
  fallo: boolean;
  motivo?: string;
}

export interface OpcionesSonda<T> {
  /** De dónde salen los datos. Inyectable: la prueba no abre sockets. */
  pedir: () => Promise<T>;
  ahora?: () => number;
  /** Vida útil de la muestra. Dentro de ella, `leer()` no vuelve a pedir. */
  ttlMs?: number;
  /** Cuánto tarda un pedido colgado antes de declararse fallo. 0 = sin plazo. */
  plazoMs?: number;
}

export interface SondaCompartida<T> {
  /** La muestra vigente, pidiendo una sola si hace falta. N consumidores = 1 request. */
  leer(): Promise<Muestra<T>>;
  /** La última muestra en memoria, sin provocar nada (para el render síncrono). */
  enMemoria(): Muestra<T> | null;
  /** Escucha los cambios. Devuelve la función para dejar de escuchar. */
  suscribir(fn: (m: Muestra<T>) => void): () => void;
  /** Cuántos pedidos REALES se hicieron. La métrica por la que existe este archivo. */
  pedidos(): number;
  /** Cuántos consumidores hay dados de alta (diagnóstico en pantalla). */
  oyentes(): number;
  /** Fuerza la próxima lectura a volver a pedir. */
  invalidar(): void;
}

export const TTL_SONDA_MS = 4000;

/**
 * Una sola ida a la API por ventana de tiempo, aunque la escuchen seis componentes.
 *
 * El detalle que hace que esto no sea un caché cualquiera: `enVuelo` guarda la
 * PROMESA, no el resultado. Si dos componentes llaman a `leer()` en el mismo tick,
 * los dos esperan la MISMA promesa; si se guardara el resultado, el segundo vería
 * el dato viejo mientras el primero viaja, y ver dato viejo es justamente pintar
 * «OFF» con el server sano.
 */
export function crearSondaCompartida<T>(op: OpcionesSonda<T>): SondaCompartida<T> {
  const ahora = op.ahora || (() => Date.now());
  const ttl = Math.max(0, op.ttlMs === undefined ? TTL_SONDA_MS : op.ttlMs);
  const plazo = Math.max(0, op.plazoMs === undefined ? 0 : op.plazoMs);
  let ultima: Muestra<T> | null = null;
  let enVuelo: Promise<Muestra<T>> | null = null;
  let contador = 0;
  const oyentes = new Set<(m: Muestra<T>) => void>();

  const ir = async (): Promise<Muestra<T>> => {
    contador++;
    const en = ahora();
    try {
      const p = Promise.resolve(op.pedir());
      const datos = plazo > 0 ? await Promise.race([
        p,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`sondeo sin respuesta en ${plazo} ms`)), plazo)),
      ]) : await p;
      ultima = { en, datos, fallo: false };
    } catch (e: any) {
      // Un fallo de red NO invierte la última verdad medida: se conserva el dato y
      // se marca el fallo aparte. Borrarla sería pintar «OFF» por un tropiezo.
      ultima = { en, datos: (ultima?.datos ?? (undefined as unknown as T)), fallo: true, motivo: e?.message || String(e) };
    } finally {
      enVuelo = null;
    }
    for (const fn of [...oyentes]) { try { fn(ultima!); } catch { /* un panel roto no corta los demás */ } }
    return ultima!;
  };

  return {
    leer() {
      const fresca = ultima && ahora() - ultima.en < ttl;
      if (fresca) return Promise.resolve(ultima!);
      if (enVuelo) return enVuelo;
      enVuelo = ir();
      return enVuelo;
    },
    enMemoria: () => ultima,
    suscribir(fn) {
      oyentes.add(fn);
      return () => { oyentes.delete(fn); };
    },
    pedidos: () => contador,
    oyentes: () => oyentes.size,
    invalidar() { ultima = null; },
  };
}

/* ─────────────── EL CRUCE: plano del lanzador × medición ─────────────── */

export interface ServicioCruzado {
  id: string;
  puerto: number;
  /** Lo que midió el supervisor (mapa `vivos`). `undefined` = nunca sondeado. */
  medido: boolean;
  vivo: boolean;
  /** Lo que pidió el usuario: auto / encendido / apagado. */
  interruptor: string;
  aviso?: string;
}

/**
 * La línea que ve el usuario en «Servicios». Sale de acá y no de un condicional
 * suelto en cada panel, para que la cabecera y la lista no puedan inventar
 * criterios distintos. La precedencia es la de la casa: una orden de «apagado»
 * es una orden, no una caída.
 */
export function describirServicio(s: ServicioCruzado): { indicador: Indicador; texto: string; apagadoAMano?: boolean } {
  const indicador = decidirIndicador({ medido: s.medido, vivo: s.vivo });
  // v1.0.27 · EL ARREGLO. Hasta acá, `interruptor === "apagado"` devolvía
  // `indicador: "abajo"`, y «abajo» es el texto «OFF» con el tono de falla: los
  // servicios que Mario apagó a mano se pintaban como si se hubieran caído. La
  // orden se sigue respetando (manda sobre la medición: un :5100 apagado a mano
  // está, a propósito, sin escuchar), pero deja de decir «caído»: dice
  // «apagado a mano» con el mismo tono neutro que `sin-medir`, que es el único
  // tono honesto para «esto no es un problema, es una decisión». El criterio de
  // medición NO se toca: sigue siendo el único, `decidirIndicador`.
  const texto = indicador === "arriba"
    ? FRASE_INDICADOR.arriba
    : indicador === "sin-medir"
      ? FRASE_INDICADOR[indicador] + (s.aviso ? ` · ${s.aviso}` : "")
      : FRASE_INDICADOR.abajo;
  if (s.interruptor !== "apagado") return { indicador, texto };
  return { indicador, texto: "apagado a mano", apagadoAMano: true };
}

/**
 * v1.0.27 · LO QUE LA HOJA Y EL CHIP TIENEN QUE PREGUNTAR ANTES DE PINTAR ROJO.
 * Un puerto que no escucha por dos motivos distintos —se cayó / lo apagué— no
 * puede pintarse igual. Dos superficies ya lo hacían bien por su cuenta
 * (`razonLegible` dice «apagado a mano: no se prende ni se reaviva»); esto lo
 * pone en UN solo lugar para que la tercera (`HojaDeRutaViva`) no invente otro.
 */
export function estaApagadoAMano(interruptor: string | null | undefined): boolean {
  return interruptor === "apagado";
}

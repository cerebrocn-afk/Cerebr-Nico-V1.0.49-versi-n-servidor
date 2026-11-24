/**
 * ecoLog.ts — EL ECO: LO MISMO, UNA VEZ (v1.98.0)
 * ===============================================
 * El log de Mario (31/10) tiene 25 líneas IGUALES por turno:
 *   [aduana de salida] cuerpo saliente: ruta_usuario×17 (avisado, baja, C:\Use…dBox)
 * y debajo `[bucle] ciclo visible`, `Historial recortado`, `Capacidad SIN
 * VERIFICAR`… Cada una es cierta, pero repetida veinte veces deja de informar y
 * empieza a tapar: el log es el tablero del usuario y un tablero saturado no
 * muestra la alarma nueva que sí importa.
 *
 * La regla de la casa NO es «callarse»: es decirlo una vez y CONTAR el resto.
 * `eco()` devuelve la línea la primera vez, después la devuelve sólo cuando pasa
 * algo distinto (ventana cumplida o umbral de repeticiones) y le pega el
 * contador — así se ve la magnitud sin pagar la repetición.
 *
 * Pura: el reloj entra por parámetro (por default `Date.now`), así la suite la
 * prueba en segundos sin dormir nada. El estado es en memoria a propósito: es
 * telemetría de presentación, no verdad de disco; si el server reinicia, el
 * tablero se resetea y la primera línea de cada cosa vuelve a aparecer (que es
 * exactamente la conducta que uno quiere después de un reinicio).
 */

/** Ventana de silencio: dentro de ella, la misma línea se cuenta, no se imprime. */
export const VENTANA_ECO_MS = 60_000;
/** Y aunque la ventana no venza, cada N repeticiones se reafirma (no es callarse para siempre). */
export const REAFIRMAR_CADA = 20;

export interface OpcionesEco {
  ventanaMs?: number;
  reafirmarCada?: number;
  ahora?: () => number;
}

export interface RegistroEco {
  clave: string;
  primeraVez: number;
  ultimaImpresa: number;
  veces: number;
  suprimidas: number;
}

export interface RespuestaEco {
  /** La línea que hay que imprimir, o `null` si va al silencio (contada igual). */
  linea: string | null;
  veces: number;
  suprimidas: number;
}

interface Eco extends OpcionesEco {
  registros: Map<string, RegistroEco>;
}

/** Crea un tablero. Se usa uno por dominio (aduana, capacidad, historial). */
export function crearEco(opciones: OpcionesEco = {}): Eco {
  return {
    ...opciones,
    registros: new Map<string, RegistroEco>(),
  };
}

const ventanaDe = (e: Eco) => Math.max(0, Number(e.ventanaMs ?? VENTANA_ECO_MS));
const reafirmarDe = (e: Eco) => Math.max(1, Math.floor(Number(e.reafirmarCada ?? REAFIRMAR_CADA)));

/**
 * El contrato, en una frase: la primera vez se habla; después se habla cuando
 * pasa `ventanaMs` o cada `reafirmarCada` gritos, y la línea sale CON el
 * contador para que la magnitud no se pierda.
 *
 * `clave` es lo que identifica EL HECHO (no la frase): si el hecho cambia de
 * contenido —otra cantidad de hallazgos, otro modelo— cambia la clave y vuelve a
 * hablarse de inmediato. Eso es lo que impide que el eco esconda una novedad.
 */
export function eco(e: Eco, clave: string, linea: string, ahoraMs?: number): RespuestaEco {
  const t = Number.isFinite(ahoraMs as number) ? (ahoraMs as number) : (e.ahora ? e.ahora() : Date.now());
  const vieja = e.registros.get(clave);
  if (!vieja) {
    e.registros.set(clave, { clave, primeraVez: t, ultimaImpresa: t, veces: 1, suprimidas: 0 });
    return { linea, veces: 1, suprimidas: 0 };
  }
  vieja.veces++;
  const pasaronVentana = t - vieja.ultimaImpresa >= ventanaDe(e);
  const topeUmbral = vieja.veces % reafirmarDe(e) === 0;
  if (!pasaronVentana && !topeUmbral) {
    vieja.suprimidas++;
    return { linea: null, veces: vieja.veces, suprimidas: vieja.suprimidas };
  }
  // Se habla otra vez: se lleva el acumulado DENTRO de la línea y se resetea el
  // contador de silencio. La magnitud nunca se pierde, sólo deja de pisar el tablero.
  const sufijo = vieja.suprimidas > 0 ? ` · ×${vieja.suprimidas} repetida(s) en silencio` : "";
  vieja.ultimaImpresa = t;
  vieja.suprimidas = 0;
  return { linea: `${linea}${sufijo}`, veces: vieja.veces, suprimidas: 0 };
}

/** Lo que sabe el tablero (para el panel de estado y para la suite). */
export function estadoEcos(e: Eco): { claves: number; suprimidasTotales: number; top: Array<{ clave: string; veces: number; suprimidas: number }> } {
  const lista = Array.from(e.registros.values());
  return {
    claves: lista.length,
    suprimidasTotales: lista.reduce((n, r) => n + r.suprimidas, 0),
    top: [...lista].sort((a, b) => b.veces - a.veces).slice(0, 5).map((r) => ({ clave: r.clave, veces: r.veces, suprimidas: r.suprimidas })),
  };
}

/** Olvida todo (lo usa el arranque y la suite; un tablero viejo no debe mentir). */
export function limpiarEco(e: Eco): void {
  e.registros.clear();
}

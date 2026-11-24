/**
 * cuotaProveedor.ts — v1.87.0 · ESPERAR LO QUE EL PROVEEDOR PIDE, NO LO QUE NOSOTROS SUPONEMOS
 * =========================================================================================
 * QUÉ PROBLEMA RESUELVE. Hoy un 429 se trata de tres maneras distintas y ninguna
 * mira lo que el proveedor dijo: `fusibleGemini` extrae el `retryDelay` del
 * cuerpo (solo Gemini), `fusibleProveedores` abre 15 minutos fijos para todo lo
 * clasificado como cuota, y `resilience` reintenta con su propio backoff. Groq,
 * OpenRouter, Mistral y DeepSeek —que sí mandan `Retry-After` y
 * `x-ratelimit-reset-*`— se quedan fuera del primero y sufren el segundo.
 *
 * QUÉ HACE ESTE MÓDULO, Y SOLO ESTO: leer la espera que el proveedor declara y
 * recordarla por ANFITRIÓN. Ni reintenta, ni decide el modelo, ni sustituye a los
 * fusibles: les da el dato que les faltaba. Si el proveedor no declara nada, se
 * espera 60 s (no 15 min: una espera inventada y larga es la que hace que el
 * usuario lea «no funciona ningún modelo»).
 *
 * MEDIDO, NO SUPUESTO. `Retry-After` admite segundos o fecha HTTP. Los
 * `x-ratelimit-reset-*` de OpenRouter/Groq vienen como duración («6m0s»,
 * «1h2m3s», «120ms») o como epoch. Acá se aceptan las cuatro formas y se
 * distingue epoch-segundos de epoch-milisegundos por magnitud (≥ 1e12 es ms).
 * Techo: 24 h — más que eso es un dato roto, no una cuota.
 *
 * Puro: el reloj entra por parámetro (`ahora`) y el estado es un Map del proceso.
 */

export type FuenteEspera = "retry-after" | "x-ratelimit-reset" | "cuerpo" | "sin-dato";

export interface EsperaCuota {
  hasta: number;
  fuente: FuenteEspera;
  motivo: string;
}

export interface EstadoCuota {
  permitido: boolean;
  restanteMs: number;
  hasta?: number;
  motivo?: string;
}

/** Un proveedor no puede pedir más de un día de espera: si lo «pide», el dato está roto. */
export const TOPE_ESPERA_MS = 24 * 60 * 60 * 1000;
/** Sin dato del proveedor se espera un minuto, no quince. */
export const ESPERA_POR_DEFECTO_MS = 60_000;
const ESPERA_MINIMA_MS = 1_000;

/** `4 min 12 s` — la misma unidad que el usuario leería en un reloj. */
export function humanizarDuracion(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  if (minutos < 60) return segundos ? `${minutos} min ${segundos} s` : `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/**
 * Duración con unidad → milisegundos. Acepta `120ms`, `1.5s`, `30s`, `6m0s`,
 * `1h2m3s` y `1d`. Devuelve `null` si no hay unidad: un número pelado no dice
 * si son segundos o milisegundos, y adivinarlo es cómo se inventan las esperas.
 */
export function duracionAMS(valor: string): number | null {
  const s = String(valor ?? "").trim().toLowerCase();
  if (!s) return null;

  const soloMs = s.match(/^(\d+(?:\.\d+)?)ms$/);
  if (soloMs) return Math.round(parseFloat(soloMs[1]));

  const compuesta = s.match(/^(?:(\d+(?:\.\d+)?)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!compuesta) return null;
  const [, d, h, m, seg] = compuesta;
  if (!d && !h && !m && !seg) return null;

  const ms =
    (d ? parseFloat(d) * 86_400_000 : 0) +
    (h ? parseInt(h, 10) * 3_600_000 : 0) +
    (m ? parseInt(m, 10) * 60_000 : 0) +
    (seg ? parseFloat(seg) * 1_000 : 0);
  return Math.round(ms);
}

/**
 * Interpreta un valor de cabecera/cuerpo como «espera desde `ahora`».
 * Devuelve `null` si no se puede leer o si el instante ya pasó (no hay nada que esperar).
 */
export function interpretarEspera(valor: string | null | undefined, ahora: number): number | null {
  if (valor === null || valor === undefined) return null;
  const bruto = String(valor).trim();
  if (!bruto) return null;

  // 1) Epoch, segundos o milisegundos. La magnitud decide: 1e12 en adelante es ms
  //    (1e12 ms ≈ año 2001; 1e12 s ≈ año 33.000, imposible en una cabecera).
  if (/^\d{10,13}$/.test(bruto)) {
    const n = Number(bruto);
    const hasta = n >= 1e12 ? n : n * 1000;
    const espera = hasta - ahora;
    return espera > 0 ? Math.min(espera, TOPE_ESPERA_MS) : null;
  }

  // 2) Fecha HTTP (`Wed, 21 Oct 2015 07:28:00 GMT`). Se exige que tenga letras:
  //    un número pelado ya lo cubrió el paso 1 y el 3.
  if (/[A-Za-z]/.test(bruto) && /GMT|UTC|[A-Za-z]{3},/.test(bruto)) {
    const hasta = Date.parse(bruto);
    if (Number.isFinite(hasta)) {
      const espera = hasta - ahora;
      return espera > 0 ? Math.min(espera, TOPE_ESPERA_MS) : null;
    }
  }

  // 3) Duración con unidad.
  const ms = duracionAMS(bruto);
  if (ms !== null) {
    if (ms <= 0) return null;
    return Math.min(Math.max(ms, ESPERA_MINIMA_MS), TOPE_ESPERA_MS);
  }

  // 4) `Retry-After: 30` — el único caso donde un número pelado significa
  //    segundos, porque la RFC 9110 lo define así para esa cabecera.
  if (/^\d+$/.test(bruto)) {
    const segundos = Number(bruto);
    if (segundos <= 0) return null;
    return Math.min(Math.max(segundos * 1000, ESPERA_MINIMA_MS), TOPE_ESPERA_MS);
  }

  return null;
}

/** El estado vive en el proceso: se pierde al reiniciar, como todo lo que se puede volver a medir. */
const ESPERAS = new Map<string, EsperaCuota>();

function clave(proveedor: string): string {
  return String(proveedor ?? "").trim().toLowerCase();
}

function cabecera(cabeceras: Record<string, string> | undefined, nombre: string): string | undefined {
  if (!cabeceras) return undefined;
  const buscado = nombre.toLowerCase();
  for (const k of Object.keys(cabeceras)) {
    if (k.toLowerCase() === buscado) return cabeceras[k];
  }
  return undefined;
}

/** Del cuerpo de error, cuando el proveedor no usa cabeceras. */
export function esperaDelCuerpo(cuerpo: string | undefined, ahora: number): number | null {
  if (!cuerpo) return null;
  const json = cuerpo.match(/"retryDelay"\s*:\s*"([^"]+)"/i) || cuerpo.match(/"retry_after"\s*:\s*"?([0-9.]+s?)"?/i);
  if (json) return interpretarEspera(json[1], ahora);
  const texto = cuerpo.match(/retry in ([\d.]+)\s*s/i);
  if (texto) return interpretarEspera(`${texto[1]}s`, ahora);
  return null;
}

/**
 * Registra la respuesta de un proveedor. Solo abre espera con 429 (o 503 que
 * declare `Retry-After`: es la forma educada de decir «estoy saturado»).
 * Devuelve `null` cuando no hay nada que esperar.
 */
export function registrarCuota(
  proveedor: string,
  estado: number,
  cabeceras: Record<string, string> | undefined,
  ahora: number,
  cuerpo?: string
): EsperaCuota | null {
  const p = clave(proveedor);
  if (!p) return null;
  const retryAfter = cabecera(cabeceras, "retry-after");
  if (estado !== 429 && !(estado === 503 && retryAfter)) return null;

  const candidatos: Array<{ valor: string | undefined; fuente: FuenteEspera }> = [
    { valor: retryAfter, fuente: "retry-after" },
    { valor: cabecera(cabeceras, "x-ratelimit-reset-tokens"), fuente: "x-ratelimit-reset" },
    { valor: cabecera(cabeceras, "x-ratelimit-reset-requests"), fuente: "x-ratelimit-reset" },
    { valor: cabecera(cabeceras, "x-ratelimit-reset"), fuente: "x-ratelimit-reset" },
  ];

  for (const c of candidatos) {
    const ms = interpretarEspera(c.valor, ahora);
    if (ms !== null) {
      const espera = { hasta: ahora + ms, fuente: c.fuente, motivo: `${p}: el proveedor pide ${humanizarDuracion(ms)} (${c.fuente})` };
      ESPERAS.set(p, espera);
      return espera;
    }
  }

  const delCuerpo = esperaDelCuerpo(cuerpo, ahora);
  if (delCuerpo !== null) {
    const espera = { hasta: ahora + delCuerpo, fuente: "cuerpo" as FuenteEspera, motivo: `${p}: el proveedor pide ${humanizarDuracion(delCuerpo)} (cuerpo)` };
    ESPERAS.set(p, espera);
    return espera;
  }

  const espera = {
    hasta: ahora + ESPERA_POR_DEFECTO_MS,
    fuente: "sin-dato" as FuenteEspera,
    motivo: `${p}: cuota agotada sin dato de espera — se esperan ${humanizarDuracion(ESPERA_POR_DEFECTO_MS)} por precaución`,
  };
  ESPERAS.set(p, espera);
  return espera;
}

/** ¿Se puede llamar a este anfitrión ahora? Una espera vencida se borra sola. */
export function puedeLlamar(proveedor: string, ahora: number): EstadoCuota {
  const p = clave(proveedor);
  const espera = ESPERAS.get(p);
  if (!espera) return { permitido: true, restanteMs: 0 };
  if (ahora >= espera.hasta) {
    ESPERAS.delete(p);
    return { permitido: true, restanteMs: 0 };
  }
  return { permitido: false, restanteMs: espera.hasta - ahora, hasta: espera.hasta, motivo: espera.motivo };
}

/** El texto que ve el usuario cuando la aduana de cuota corta. Dice cuándo vuelve. */
export function notaEspera(proveedor: string, estado: EstadoCuota): string {
  if (estado.permitido) return "";
  const cuando = new Date(estado.hasta ?? Date.now() + estado.restanteMs);
  const hora = `${String(cuando.getHours()).padStart(2, "0")}:${String(cuando.getMinutes()).padStart(2, "0")}`;
  return `${proveedor} en espera de cuota: vuelve en ${humanizarDuracion(estado.restanteMs)} (≈${hora}). ${estado.motivo ?? ""}`.trim();
}

/** Foto de todas las esperas vivas, la que vence antes primero. */
export function estadoCuotas(ahora: number): Array<{ proveedor: string; restanteMs: number; hasta: number; fuente: FuenteEspera }> {
  const vivas: Array<{ proveedor: string; restanteMs: number; hasta: number; fuente: FuenteEspera }> = [];
  for (const [proveedor, espera] of ESPERAS) {
    if (ahora >= espera.hasta) {
      ESPERAS.delete(proveedor);
      continue;
    }
    vivas.push({ proveedor, restanteMs: espera.hasta - ahora, hasta: espera.hasta, fuente: espera.fuente });
  }
  return vivas.sort((a, b) => a.hasta - b.hasta);
}

/** Solo para pruebas: el estado es del proceso y las suites no pueden heredarlo. */
export function reiniciarCuotasParaPruebas(): void {
  ESPERAS.clear();
}

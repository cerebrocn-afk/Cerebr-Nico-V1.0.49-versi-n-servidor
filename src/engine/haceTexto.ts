/**
 * src/engine/haceTexto.ts — LA EDAD DE UNA LECTURA, EN TEXTO QUE SE LEE (v2.2.4)
 * ==============================================================================
 * Por qué vive en `src/engine` y no dentro del servidor: lo necesitan los DOS
 * lados. `server/estado/telemetria.ts` lo usa para escribir el `motivo` de cada
 * puerto, y los paneles de la interfaz lo usan para decir hace cuánto se leyó.
 * Dos implementaciones de «hace 1 h 20 min» es exactamente la deriva que esta
 * casa ya pagó con las rutas.
 *
 * «hace 4800 s» obliga a hacer una cuenta para responder la única pregunta que
 * importa cuando un panel muestra un verde: ¿esta lectura es de ahora?
 */

/** Menos de dos minutos en segundos; menos de una hora en minutos; después, horas. */
export function haceTexto(ms: number): string {
  const seg = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  if (seg < 120) return `hace ${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `hace ${horas} h ${resto} min` : `hace ${horas} h`;
}

/** `undefined`/`null` no son «hace 0 s»: son «nunca se leyó». Se dice distinto. */
export function edadLectura(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "sin leer todavía";
  return haceTexto(ms);
}

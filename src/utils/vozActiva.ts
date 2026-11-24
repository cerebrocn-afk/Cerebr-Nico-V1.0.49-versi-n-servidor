// src/utils/vozActiva.ts
// v1.57.9 — «LA VOZ NO SE OYE POR ENCIMA DEL FONDO» (pedido de Mario: «el
// volumen de la voz está bajo para lo alto que está la frecuencia ambiente»).
//
// Por qué no es un problema de volumen:
// · La voz del navegador (Microsoft Pablo y compañía) sale por
//   `SpeechSynthesisUtterance.volume`, y 1 YA es el máximo de la especificación:
//   no existe un 2. La ruta Gemini sí se refuerza sobre la onda (`reforzarWav`),
//   pero la ruta del navegador no pasa por ningún nodo que podamos tocar.
// · El fondo ambiente, en cambio, SÍ vive en la Web Audio API (GainNode). La
//   forma honesta de que la voz se entienda no es subir lo que no puede subir:
//   es BAJAR lo que sí puede bajar mientras la voz habla, y devolverlo a su
//   sitio al terminar. Eso es exactamente lo que hace cualquier mesa de sonido:
//   ducking.
//
// Cómo se conectan dos componentes que no se conocen (ChatCenter habla,
// AudioAmbiente suena): un evento en `window`, sin dependencias ni contexto de
// React. Si nadie escucha, anunciar no hace nada.

export const EVENTO_VOZ_ACTIVA = "cn-voz-activa";

let activa = false;

/** Dice a toda la app que la voz empezó (true) o terminó (false). Idempotente. */
export function anunciarVozActiva(on: boolean): void {
  if (on === activa) return;
  activa = on;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_VOZ_ACTIVA, { detail: { on } }));
  } catch {
    /* entorno sin DOM (tests puros): anunciar es gratis. */
  }
}

/** Estado actual (por si alguien se sube tarde al carro). */
export function vozActiva(): boolean {
  return activa;
}

/**
 * Suscripción para quien deba agacharse (AudioAmbiente). Devuelve el retiro.
 * Entrega también el estado presente: el suscriptor nuevo tiene que saber si
 * ya está hablando alguien (React puede montar el fondo DESPUÉS de arrancar la voz).
 */
export function suscribirVozActiva(cb: (on: boolean) => void): () => void {
  const manejo = (e: Event) => cb(Boolean((e as CustomEvent).detail?.on));
  window.addEventListener(EVENTO_VOZ_ACTIVA, manejo);
  cb(activa);
  return () => window.removeEventListener(EVENTO_VOZ_ACTIVA, manejo);
}

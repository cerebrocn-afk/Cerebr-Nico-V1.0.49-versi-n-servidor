/**
 * contextoBucleSesion.ts — v1.66.1 · LA MEMORIA DEL CICLO, EN UN SOLO SITIO
 * ============================================================================
 * `contextoBucle.ts` es PURO (recibe el estado, no lo guarda). Alguien tiene que
 * ser dueño del estado que sobrevive a los turnos, y ese alguien no puede ser
 * `server.ts`: por acá pasan los TRES bucles del motor (el de Ollama, el de
 * Gemini y el OpenAI-compat) y el monolito tiene un trinquete de líneas que ya
 * estaba roto cuando llegó esta tanda.
 *
 * El backend de la IDE es de UNA sesión —el proceso ES la sesión—, así que un
 * singleton de módulo es el depósito correcto (misma decisión que la `ventanillaSesion`
 * de v1.62). Antes vivía declarado en server.ts y se lo pasaban a mano los dos
 * bucles locales; el tercero, que vive en su propio módulo, nunca lo recibió.
 */
import { nuevoContextoBucle, type EstadoContextoBucle } from "./contextoBucle";

/** El estado único del detector de ciclos para toda la sesión. */
export const contextoBucleSesion: EstadoContextoBucle = nuevoContextoBucle();

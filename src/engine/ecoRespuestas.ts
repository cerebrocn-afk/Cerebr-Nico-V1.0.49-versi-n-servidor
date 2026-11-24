/**
 * src/engine/ecoRespuestas.ts — v1.62.0
 * ============================================================================
 * ECO DE RESPUESTA: el modelo contesta LO MISMO a dos preguntas distintas
 *
 * 🐞 Sesión `1792793541672` (23/10). Dos turnos seguidos, dos preguntas distintas:
 *
 *   · msj 20 → «En el editor hay 19 archivos, ¿son del proyecto?»
 *   · msj 22 → «el sandbox no arranca»
 *
 * Respuestas: 10.646 y 10.619 caracteres. Mismo contenido (volcó otra vez el
 * README y el HTML completo). Medido:
 *
 *   · semejanza de secuencia (`difflib`)        → 0,9987
 *   · prefijo idéntico                          → 5.676 caracteres (53 %)
 *   · Jaccard sobre líneas normalizadas         → **1,000**
 *
 * El circuito de reescritura idéntica (v1.60.17) y la ventanilla de sesión
 * (v1.61.0) miran **escrituras de archivo**. Acá no se escribió nada: fue texto
 * de chat, así que la ventanilla registró 0 rechazos y no cortó nada, aunque el
 * modelo había vacado 10 KB de la misma prosa en dos turnos.
 *
 * POR QUÉ JACCARD DE LÍNEAS Y NO IGUALDAD: con 53 % de prefijo común un test de
 * igualdad (o un hash) no ve nada. Las líneas normalizadas, en cambio, dan 1,000:
 * el conjunto de líneas es idéntico, sólo cambió el orden y dos renglones.
 *
 * EL UMBRAL, MEDIDO (no elegido a ojo). Jaccard sobre líneas normalizadas:
 *
 *   | par de mensajes                 | semejanza | qué es                       |
 *   |---------------------------------|-----------|------------------------------|
 *   | 21 ↔ 23 (ECO real)              |  1,000    | misma volcadura, otra pregunta|
 *   | 19 ↔ 21 (mismo tema, otra obra) |  0,731    | NO es eco                    |
 *   | 19 ↔ 27 (mismo archivo, parcial)|  0,515    | NO es eco                    |
 *   | 9 ↔ 21, 17 ↔ 21, 25 ↔ 23        |  0,000    | NO es eco                    |
 *
 * `UMBRAL_ECO = 0,85` queda a 0,15 del eco real y a 0,12 del falso más cercano.
 * Además exige largo mínimo en ambas respuestas: dos «sí» o dos mensajes cortos
 * pueden coincidir al 100 % sin ser un bucle.
 *
 * MÓDULO PURO: sin red, sin fs, sin estado. La memoria la trae el llamador (las
 * propias instrucciones del turno). Tests: `tests/ecoRespuestas.test.ts`.
 */

import { normalizarLinea } from "./bucleDeBloques";

/** Semejanza a partir de la cual dos respuestas son la misma respuesta. */
export const UMBRAL_ECO = 0.85;
/** Respuestas más cortas que esto no se comparan (coincidir en corto es normal). */
export const LARGO_MINIMO_ECO = 800;
/** Líneas de menos de estos caracteres no cuentan para el conjunto. */
export const LARGO_MINIMO_LINEA = 8;

/** El conjunto de líneas normalizadas de una respuesta (ordenadas y sin duplicar). */
export function lineasDistintasDeRespuesta(texto: string): string[] {
  const set = new Set<string>();
  for (const l of String(texto || "").split("\n")) {
    const n = normalizarLinea(l);
    if (n.length >= LARGO_MINIMO_LINEA) set.add(n);
  }
  return Array.from ? Array.from(set) : Array.prototype.slice.call(set);
}

/**
 * Semejanza entre dos respuestas: Jaccard (intersección / unión) sobre sus
 * líneas normalizadas. 1 = mismo contenido; 0 = nada que ver.
 */
export function semejanzaDeRespuestas(anterior: string, actual: string): number {
  const A = new Set(lineasDistintasDeRespuesta(anterior));
  const B = new Set(lineasDistintasDeRespuesta(actual));
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const x of A) if (B.has(x)) comunes++;
  return comunes / (A.size + B.size - comunes);
}

/** ¿La respuesta actual es un eco de la anterior? */
export function esEcoDeRespuesta(
  anterior: string,
  actual: string,
  umbral = UMBRAL_ECO,
  largoMinimo = LARGO_MINIMO_ECO
): boolean {
  const a = String(anterior || "");
  const b = String(actual || "");
  if (a.length < largoMinimo || b.length < largoMinimo) return false;
  return semejanzaDeRespuestas(a, b) >= umbral;
}

/** Saca texto plano de un mensaje en cualquiera de las dos formas del motor. */
function textoDelMensaje(m: { role?: string; content?: unknown; parts?: unknown }): string {
  for (const crudo of [m?.content, m?.parts]) {
    if (typeof crudo === "string" && crudo.trim()) return crudo;
    if (Array.isArray(crudo)) {
      const unido = crudo.map((p: any) => (typeof p === "string" ? p : p?.text || "")).join("\n").trim();
      if (unido) return unido;
    }
  }
  return "";
}

/**
 * Saca el último texto del asistente de las instrucciones del turno. Acepta las
 * dos formas que usa el motor: `{role, content}` (OpenAI-compat / Ollama) y
 * `{role, parts}` (Gemini). Devuelve `null` si el historial no trae respuestas.
 */
export function ultimoTextoAsistentePrevio(
  mensajes: Array<{ role?: string; content?: unknown; parts?: unknown }>
): string | null {
  const textos: string[] = [];
  for (const m of mensajes || []) {
    if (!m || m.role !== "assistant") continue;
    const t = textoDelMensaje(m);
    if (t) textos.push(t);
  }
  return textos.length ? textos[textos.length - 1] : null;
}

/** Aviso honesto al usuario cuando la ventanilla corta por eco entre turnos. */
export function cierrePorEcoEntreTurnos(motivo: string): string {
  return (
    `\n\n⚠️ **Corté el turno: volviste a preguntar otra cosa y la respuesta es la misma** ` +
    `(${motivo}). Repetir el mismo texto no avanza la tarea. Decime el síntoma concreto ` +
    `(qué ves y qué esperabas ver) o cambiá de modelo: el actual está reciclando.`
  );
}

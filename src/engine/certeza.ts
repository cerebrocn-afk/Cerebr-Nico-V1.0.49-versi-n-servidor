/**
 * certeza.ts — LOS TRES NIVELES DE CERTEZA (v1.8.0)
 * =================================================
 * QUÉ ES: el tipo `Certeza` y las dos operaciones que se hacen con él (deducirlo
 * de la evidencia, y quedarse con el más débil cuando se juntan dos).
 * PARA QUÉ SIRVE: para que la honestidad del motor no dependa de la memoria de
 * quien escribe. Vive en su propio fichero y no dentro de `vocabulario.ts`
 * porque lo usan tres módulos (vocabulario, explicaciones y voz) y meterlo en
 * cualquiera de ellos habría creado una dependencia circular entre iguales — de
 * esas que se resuelven «importando» y acaban en un ciclo que nadie entiende.
 *
 * REGLA ÚNICA: `ejecutado` NO se deduce nunca de una lectura. Solo lo concede
 * quien tiene la salida de una ejecución delante. Todo lo demás baja un escalón.
 */

export type Certeza = "ejecutado" | "leido" | "sin_verificar";

/** El nombre corto de cada nivel, para texto de interfaz. */
export const NOMBRE_CERTEZA: Record<Certeza, string> = {
  ejecutado: "ejecutado",
  leido: "leído",
  sin_verificar: "sin verificar",
};

/**
 * Deduce la certeza de la evidencia disponible.
 * - `ejecutado: true` solo si QUIEN LLAMA ha visto la salida de una ejecución.
 * - `leido: true` si se ha leído el código o su documentación.
 * - Sin nada: "sin_verificar".
 */
export function certezaDe(evidencia: { ejecutado?: boolean; leido?: boolean } = {}): Certeza {
  if (evidencia.ejecutado === true) return "ejecutado";
  if (evidencia.leido === true) return "leido";
  return "sin_verificar";
}

/** Al juntar dos evidencias manda la MÁS DÉBIL: es la única opción que no miente. */
export function masDebil(a: Certeza, b: Certeza): Certeza {
  const fuerza: Record<Certeza, number> = { sin_verificar: 0, leido: 1, ejecutado: 2 };
  return fuerza[a] <= fuerza[b] ? a : b;
}

/** ¿Se puede afirmar un resultado con esta certeza? Solo si está ejecutado. */
export function esAfirmable(certeza: Certeza): boolean {
  return certeza === "ejecutado";
}

/**
 * CERTEZA CONJUNTA SOBRE N EVIDENCIAS (v1.58.5 · C1).
 * `masDebil` solo junta DE A DOS; cuando un turno toca varios archivos o hace
 * varias afirmaciones, la certeza del conjunto es la de la pieza MÁS DÉBIL, no
 * la del promedio ni la de la última. Hasta ahora cada quien reducía la lista a
 * mano (y una lista vacía se tropezaba). Esto lo centraliza: pliega con
 * `masDebil` y, sin evidencia alguna, el conjunto es `sin_verificar` — nunca
 * sube de nivel por el hecho de estar vacío.
 */
export function certezaConjunta(certezas: readonly Certeza[]): Certeza {
  if (!Array.isArray(certezas) || certezas.length === 0) return "sin_verificar";
  return certezas.reduce((acc, c) => masDebil(acc, c), "ejecutado" as Certeza);
}

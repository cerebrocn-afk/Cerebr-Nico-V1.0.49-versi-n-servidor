/**
 * cadenaSegura.ts — LA LISTA SEGURA DE RELEVOS DE MARIO (v1.0.11)
 * ================================================================
 * Mario, 09/11, textual: «en los relevos la lista segura es: GLM 4.5 flash
 * Z.ai, open router /free o auto — gemma gratis, gemini 3.5 flash en adelante
 * hasta 3.8 flash; deepseek v4 flash en mistral lo uso pero no sé si es gratis
 * — ese a veces se corta y no contesta, pero NUNCA se corta a mitad de tarea
 * como gemini y zai, que están un par de minutos haciendo la tarea y de golpe
 * se cortan y se pierde lo que venían haciendo».
 *
 * Este módulo guarda esa verdad de usuario como DATO DEL MOTOR (no como
 * consejo suelto en un string): cuando un proveedor de nube falla, la ayuda
 * que recibe el usuario y la orientación del modelo listan ESTOS eslabones,
 * en ESTE orden, con la nota de carácter de cada uno (el que corta a mitad vs
 * el que corta antes de empezar). La rotación automática entre nubes sigue en
 * el plan (v1.0.12, atada al plan reanudable F16: relevar SIN perder el hilo
 * exige reanudar, y eso es el mismo mecanismo).
 */

export interface EslabonSeguro {
  /** id del proveedor en el motor. */
  proveedor: "zai" | "openrouter" | "gemini" | "mistral" | "local";
  /** modelo concreto recomendado (con su variante free si la tiene). */
  modelo: string;
  /** qué le duele a este eslabón, en español, medido por Mario en campo. */
  caracter: string;
}

export const CADENA_SEGURA: EslabonSeguro[] = [
  { proveedor: "zai", modelo: "glm-4.5-flash", caracter: "gratis con clave; puede cortarse A MITAD de la tarea — el corte que más duele" },
  { proveedor: "openrouter", modelo: "auto o gemma (/:free)", caracter: "gratis; enruta solo, buen colchón cuando el titular cayó" },
  { proveedor: "gemini", modelo: "gemini-3.5-flash → 3.8-flash", caracter: "cuota diaria gratis; como Z.ai: corta a mitad y se pierde el hilo" },
  { proveedor: "mistral", modelo: "deepseek-v4-flash", caracter: "ojo: puede ser de saldo (Mario cargó créditos y no hay certeza de que sea gratis); NO corta a mitad: si cae, cae antes de empezar" },
  { proveedor: "local", modelo: "ollama (qwen/relé)", caracter: "sin cuota jamás; lento en CPU — es el piso, no la vía rápida" },
];

/** La lista en una línea, para mensajes de error y ayuda del turno. */
export function lineaDeRelevos(excluirProveedor?: string): string {
  const vivos = CADENA_SEGURA.filter((e) => !excluirProveedor || e.proveedor !== excluirProveedor);
  return vivos.map((e) => `${e.modelo} (${e.proveedor})`).join(" → ");
}

/** ¿El proveedor ya está en la lista? (evita advice contradictorio). */
export function eslabonDe(proveedor: string): EslabonSeguro | undefined {
  const p = String(proveedor || "").toLowerCase();
  return CADENA_SEGURA.find((e) => p.includes(e.proveedor));
}

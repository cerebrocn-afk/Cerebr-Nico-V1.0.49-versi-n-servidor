/**
 * respaldoNube.ts — v1.0.16 · FAILOVER ENTRE NUBES GRATIS INESTABLES
 * ==================================================================
 * Mario: «clouds gratis inestables». Los proveedores gratuitos (Z.ai, Groq,
 * OpenRouter, Cerebras, Together, DeepSeek, Mistral, Fireworks) tiran 429 de
 * cuota, 5xx de capacidad o cortan la conexión sin aviso. Cuando el elegido está
 * caído, no tiene sentido insistir contra la pared: se rota al primero que SÍ
 * tenga clave y no esté enfriado por un fallo reciente.
 *
 * LÓGICA PURA, sin `os`, sin red, sin estado global: recibe los hechos (qué
 * claves hay, qué proveedores están enfriados, qué hora es) y devuelve la cadena
 * de intentos o el mapa de enfriamiento nuevo. El estado (ENFRIADOS_NUBE) y las
 * llamadas viven en server.ts; así esto se prueba aislado
 * (tests/respaldoNube.test.ts) y no toca el monolito.
 *
 * NO incluye gemini/openai/custom: esas son claves PROPIAS del usuario (de pago
 * o proxy local), no el pool gratuito preconfigurado — rotarlas sin permiso sería
 * gastarle plata o cambiarle el backend a sus espaldas.
 */

export type ProveedorNube =
  | "zai" | "groq" | "openrouter" | "cerebras"
  | "together" | "deepseek" | "mistral" | "fireworks";

/** Orden de preferencia del pool gratuito (el más estable/rápido primero). */
export const PREFERENCIA_NUBE_GRATIS: ProveedorNube[] = [
  "zai", "groq", "openrouter", "cerebras", "together", "deepseek", "mistral", "fireworks",
];

/** Enfriamiento por defecto tras un fallo de proveedor (1 minuto). */
export const ENFRIAMIENTO_MS = 60_000;

/**
 * ¿El fallo es DEL PROVEEDOR (transitorio, vale rotar) y no del pedido? Sí para
 * 408/425/429/5xx y para los mensajes típicos de cuota/capacidad/red/timeout.
 * NO para 400/401/403/404 — eso es clave mala o modelo inexistente: rotar no
 * arregla nada y el usuario tiene que verlo.
 */
export function esFalloDeProveedor(status: number | null | undefined, mensaje?: string): boolean {
  const s = Number(status) || 0;
  if ([408, 425, 429, 500, 502, 503, 504].includes(s)) return true;
  if (s >= 400 && s < 500) return false; // 400/401/403/404… culpa del pedido, no del proveedor
  const m = String(mensaje || "").toLowerCase();
  return /rate.?limit|too many requests|\b429\b|quota|exceeded|resource_exhausted|timeout|timed out|fetch failed|econnreset|econnrefused|etimedout|socket hang up|network|unavailable|overloaded|capacity|temporar/.test(m);
}

/**
 * Cadena de intentos: el proveedor ACTUAL primero (si está vivo), luego el resto
 * del pool que tenga clave y no esté enfriado, en orden de preferencia. «Vivo» =
 * tiene clave Y su enfriamiento ya venció. Si NINGUNO está vivo, devuelve igual
 * el actual para que intente y falle con un mensaje claro (nunca cadena vacía).
 */
export function cadenaDeRespaldo(
  actual: ProveedorNube,
  clavesDisponibles: Partial<Record<ProveedorNube, boolean>>,
  enfriados: Partial<Record<ProveedorNube, number>> = {},
  ahora: number = Date.now(),
  preferencia: ProveedorNube[] = PREFERENCIA_NUBE_GRATIS,
): ProveedorNube[] {
  const vivo = (p: ProveedorNube): boolean =>
    !!clavesDisponibles[p] && !((enfriados[p] ?? 0) > ahora);
  const orden: ProveedorNube[] = [];
  if (vivo(actual)) orden.push(actual);
  for (const p of preferencia) {
    if (p !== actual && vivo(p) && !orden.includes(p)) orden.push(p);
  }
  if (orden.length === 0) orden.push(actual);
  return orden;
}

/**
 * Marca un proveedor como enfriado hasta `ahora + ms`. NO muta el mapa de
 * entrada: devuelve uno nuevo (el llamador reasigna su estado).
 */
export function enfriarProveedor(
  enfriados: Partial<Record<ProveedorNube, number>>,
  proveedor: ProveedorNube,
  ahora: number = Date.now(),
  ms: number = ENFRIAMIENTO_MS,
): Partial<Record<ProveedorNube, number>> {
  return { ...enfriados, [proveedor]: ahora + Math.max(1000, ms) };
}

/** Pool gratuito preconfigurado sobre el que SÍ rotamos (gemini/openai = claves
 * de pago del usuario; custom = proxy local: no se rotan sin permiso). */
export const PROVEEDORES_RESPALDO_NUBE = new Set<string>(PREFERENCIA_NUBE_GRATIS);

export interface DecisionFailover {
  /** Proveedor con el que seguir el turno (el mismo si no hubo rotación). */
  provider: ProveedorNube;
  /** true si se rotó a otro proveedor del pool. */
  cambio: boolean;
  /** "enfriado por un fallo reciente" | "sin clave configurada" | "" (si no hubo cambio). */
  motivo: string;
}

/**
 * v1.0.16 · Decide el failover en UN paso (envoltorio de cadenaDeRespaldo): si el
 * proveedor actual no tiene clave o quedó enfriado, devuelve el primero del pool
 * con clave y sin enfriar. El llamador, si `cambio`, pone modeloBaseTurno="" para
 * que resolverModeloEfectivo caiga en el modelo por defecto del nuevo proveedor.
 */
export function resolverFailoverNube(
  actual: ProveedorNube,
  clavesDisponibles: Partial<Record<ProveedorNube, boolean>>,
  enfriados: Partial<Record<ProveedorNube, number>> = {},
  ahora: number = Date.now(),
): DecisionFailover {
  const elegido = cadenaDeRespaldo(actual, clavesDisponibles, enfriados, ahora)[0];
  if (elegido && elegido !== actual) {
    const motivo = clavesDisponibles[actual] ? "enfriado por un fallo reciente" : "sin clave configurada";
    return { provider: elegido, cambio: true, motivo };
  }
  return { provider: actual, cambio: false, motivo: "" };
}

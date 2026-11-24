/**
 * src/engine/hashArgs.ts — HUELLA CANÓNICA DE ARGUMENTOS
 * ============================================================================
 * El cortafuegos de bucle (auditoriaBucle) compara «misma herramienta + mismos
 * argumentos». Para que «mismos» sea estable necesita una huella CANÓNICA:
 * orden de claves fijo, sin espacios irrelevantes, determinista y sin deps.
 *
 * Este era un HUECO: el ciclo comparaba `name:arguments` como string crudo, que
 * da falsos negativos si el modelo reordena las claves o cambia el espaciado.
 *
 * PURO: sin red, sin fs, sin estado global.
 */

/** djb2 → hex. Estable y corto, sin dependencias. */
function djb2Hex(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Serializa un valor con las CLAVES ORDENADAS en todos los niveles. */
function canonizar(valor: unknown): string {
  if (valor === null || typeof valor !== "object") {
    return JSON.stringify(valor) ?? "null";
  }
  if (Array.isArray(valor)) {
    return "[" + valor.map(canonizar).join(",") + "]";
  }
  const obj = valor as Record<string, unknown>;
  const claves = Object.keys(obj).sort();
  return (
    "{" +
    claves.map((k) => JSON.stringify(k) + ":" + canonizar(obj[k])).join(",") +
    "}"
  );
}

/**
 * Huella estable de los argumentos de una tool-call. Acepta el string crudo
 * (lo intenta parsear) o un objeto ya parseado. Si no es JSON v\u00e1lido, cae a la
 * huella del texto normalizado (trim) — nunca lanza.
 */
export function hashArgsCanonico(args: unknown): string {
  let base: string;
  if (typeof args === "string") {
    try {
      base = canonizar(JSON.parse(args));
    } catch {
      base = args.trim();
    }
  } else {
    try {
      base = canonizar(args);
    } catch {
      base = String(args);
    }
  }
  return djb2Hex(base);
}

/** Clave estable `tool\u2502hash` para la matriz de trazabilidad del bucle. */
export function claveInvocacion(toolName: string, args: unknown): string {
  return `${toolName}\u2502${hashArgsCanonico(args)}`;
}

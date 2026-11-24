// v1.60.4 — PERFECCIÓN: humanizar errores de proveedores en la nube.
//
// Contexto real (sesión de Mario): OpenRouter devolvía `401 "User not found"`
// / `No auth credentials found` y el IDE lo propagaba crudo:
//   "❌ OpenRouter no pudo responder para el modelo \"x\": 401 User not found"
// Eso NO es un bug del IDE —es la clave de API inválida/revocada en la config—
// pero el mensaje crudo confunde y no dice QUÉ hacer. Este helper traduce los
// fallos de autenticación/cuota más comunes a un mensaje en español accionable,
// sin cambiar la lógica de red. Es una función PURA (fácil de testear con tsx).

export type ProveedorNube =
  | "openrouter"
  | "openai"
  | "groq"
  | "zai"
  | "gemini"
  | "cerebras"
  | "mistral"
  | "together"
  | "deepseek"
  | "fireworks"
  | "custom";

const ETIQUETA_PROVEEDOR: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  groq: "Groq",
  zai: "Z.ai",
  gemini: "Gemini",
  cerebras: "Cerebras",
  mistral: "Mistral",
  together: "Together",
  deepseek: "DeepSeek",
  fireworks: "Fireworks",
  custom: "Servidor personalizado",
};

export interface ErrorHumanizado {
  /** Mensaje listo para mostrar al usuario (incluye el ❌ inicial). */
  mensaje: string;
  /** Categoría detectada: útil para tests y para decidir iconos aguas arriba. */
  categoria: "auth" | "cuota" | "saldo" | "modelo" | "desconocido";
  /** true si el fallo es de configuración del usuario (clave/cuota), no un bug. */
  esConfigUsuario: boolean;
}

/**
 * Traduce el motivo crudo de un fallo de proveedor en la nube a un mensaje
 * accionable en español. Nunca lanza; ante texto vacío/desconocido devuelve el
 * motivo original envuelto para no perder información de diagnóstico.
 */
export function humanizarErrorProveedor(
  proveedor: string,
  modelo: string,
  motivoCrudo: string
): ErrorHumanizado {
  const nombre = ETIQUETA_PROVEEDOR[proveedor] || proveedor || "El proveedor";
  const crudo = (motivoCrudo || "").trim();
  const low = crudo.toLowerCase();

  const incluye = (...claves: string[]) => claves.some((k) => low.includes(k));

  // —— AUTENTICACIÓN (clave inválida / revocada / ausente) ——
  // Casos vistos: 401, "user not found", "no auth credentials",
  // "invalid api key", "unauthorized".
  if (
    incluye(
      "user not found",
      "no auth credentials",
      "invalid api key",
      "invalid_api_key",
      "unauthorized",
      "authentication",
      "missing bearer",
      "invalid token"
    ) ||
    /\b401\b/.test(low)
  ) {
    return {
      categoria: "auth",
      esConfigUsuario: true,
      mensaje:
        `🔑 ${nombre} rechazó la credencial (no es un fallo del IDE): la clave de ` +
        `API es inválida, está revocada o vacía. Revisa tu clave de ${nombre} en ` +
        `«Ranuras de API Keys», pégala de nuevo sin espacios y vuelve a intentarlo. ` +
        `(detalle técnico: ${crudo || "401"})`,
    };
  }

  // —— SALDO / CRÉDITOS AGOTADOS ——
  if (incluye("insufficient", "no credits", "payment required", "billing", "quota exceeded for your plan") || /\b402\b/.test(low)) {
    return {
      categoria: "saldo",
      esConfigUsuario: true,
      mensaje:
        `💳 ${nombre} indica que no hay saldo/créditos suficientes para "${modelo}". ` +
        `Recarga créditos o usa un modelo gratuito (:free). ` +
        `(detalle técnico: ${crudo})`,
    };
  }

  // —— LÍMITE DE PETICIONES (rate limit / cuota temporal) ——
  if (incluye("rate limit", "rate-limit", "too many requests", "resource_exhausted", "exhausted") || /\b429\b/.test(low)) {
    return {
      categoria: "cuota",
      esConfigUsuario: true,
      mensaje:
        `⏳ ${nombre} aplicó un límite de peticiones (cuota momentánea) para "${modelo}". ` +
        `Espera unos segundos y reintenta, o cambia a otro modelo/proveedor. ` +
        `(detalle técnico: ${crudo})`,
    };
  }

  // —— MODELO INEXISTENTE / NO DISPONIBLE ——
  if (incluye("model not found", "no such model", "model_not_found", "not a valid model", "does not exist") || /\b404\b/.test(low)) {
    return {
      categoria: "modelo",
      esConfigUsuario: true,
      mensaje:
        `🔎 ${nombre} no reconoce el modelo "${modelo}" (puede haberse retirado o ` +
        `escrito mal). Vuelve a autodetectar modelos o elige otro del catálogo. ` +
        `(detalle técnico: ${crudo})`,
    };
  }

  // —— DESCONOCIDO: no perder el detalle original ——
  return {
    categoria: "desconocido",
    esConfigUsuario: false,
    mensaje: `❌ ${nombre} no pudo responder para el modelo "${modelo}": ${crudo || "error desconocido"}`,
  };
}

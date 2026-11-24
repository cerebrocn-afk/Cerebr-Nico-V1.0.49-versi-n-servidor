/**
 * catalogoNube.ts — v1.0.34 · EL CATÁLOGO QUE CAE EN SILENCIO
 * ============================================================
 * Sesión de Mario (20/11): «puse la clave de un modelo pago y ni cargaron los
 * modelos, DeepSeek». El backend, cuando la clave NO era aceptada, devolvía
 * `source: "static-fallback"` con los 3 modelos estáticos y **HTTP 200**, sin
 * decir una palabra: la interfaz escribía «3 modelos detectados» y el usuario
 * no tenía forma de saber que su clave acababa de ser rechazada. Y si la clave
 * se pegaba con un salto de línea o comillas —lo normal al copiar de la web
 * del proveedor— viajaba tal cual dentro del `Authorization: Bearer …`.
 *
 * Módulo puro: no toca la red, no conoce Express. Solo traduce lo que el
 * proveedor contestó a una frase que se pueda leer y accionar.
 */

export type CausaCatalogo =
  | "clave-rechazada"   // 401 / 403 · la clave viajó, no la aceptaron
  | "sin-saldo"         // 402 · la clave es válida y no hay crédito
  | "cuota"             // 429 · límite de peticiones
  | "proveedor-caido"   // 5xx
  | "sin-respuesta"     // no llegó nada (plazo / red)
  | "formato"           // 200 y el cuerpo no traía lista
  | "desconocida";

export interface DiagnosticoCatalogo {
  causa: CausaCatalogo;
  /** Una línea para la consola del panel, en español y con el número delante. */
  linea: string;
  /** ¿Es culpa de la clave? Solo entonces conviene pedirle que la revise. */
  revisarClave: boolean;
}

/**
 * La clave tal como debe viajar: sin `Bearer`, sin espacios, sin saltos de
 * línea ni comillas. Copiar-pegar de la web del proveedor mete las tres cosas y
 * un 401 por un `\n` al final se lee como «clave inválida» cuando la clave está
 * perfecta.
 */
export function limpiarClave(bruta: unknown): string {
  if (typeof bruta !== "string") return "";
  return bruta
    .replace(/^\s*bearer\s+/i, "")
    .replace(/[\r\n\t]/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Recorta el cuerpo del proveedor para que la línea no se coma la consola. */
function recorte(cuerpo: unknown, max = 160): string {
  const t = typeof cuerpo === "string" ? cuerpo : cuerpo == null ? "" : JSON.stringify(cuerpo);
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

/**
 * Traduce el resultado de pedir `/models` a una frase accionable. NUNCA incluye
 * la clave (solo el estado y un recorte del cuerpo del proveedor).
 */
export function diagnosticoCatalogo(entrada: {
  provider: string;
  status?: number;
  cuerpo?: unknown;
  conClave?: boolean;
  plazoMs?: number;
  errorRed?: string;
  cantidadEnVivo?: number;
}): DiagnosticoCatalogo {
  const p = String(entrada.provider || "proveedor");
  const conClave = entrada.conClave !== false;
  const cola = recorte(entrada.cuerpo);

  if (entrada.errorRed) {
    const seg = Math.round((entrada.plazoMs || 8000) / 1000);
    return {
      causa: "sin-respuesta",
      linea: `${p}: no respondió en ${seg} s (${recorte(entrada.errorRed, 90)}). Se muestran los modelos del catálogo guardado.`,
      revisarClave: false,
    };
  }

  const status = Number(entrada.status || 0);
  if (status === 401 || status === 403) {
    return {
      causa: "clave-rechazada",
      linea: `${p}: la clave no fue aceptada (HTTP ${status}${cola ? ` · ${cola}` : ""}). Revisá que sea de ${p} y que esté completa.`,
      revisarClave: true,
    };
  }
  if (status === 402) {
    return {
      causa: "sin-saldo",
      linea: `${p}: la clave es válida y la cuenta no tiene saldo (HTTP 402${cola ? ` · ${cola}` : ""}).`,
      revisarClave: false,
    };
  }
  if (status === 429) {
    return {
      causa: "cuota",
      linea: `${p}: límite de peticiones alcanzado (HTTP 429). Esperá un minuto y volvé a cargar.`,
      revisarClave: false,
    };
  }
  if (status >= 500) {
    return {
      causa: "proveedor-caido",
      linea: `${p}: el proveedor contestó HTTP ${status}${cola ? ` · ${cola}` : ""}. No es tu clave.`,
      revisarClave: false,
    };
  }
  if (status >= 400) {
    return {
      causa: "desconocida",
      linea: `${p}: HTTP ${status}${cola ? ` · ${cola}` : ""}${conClave ? "" : " (sin clave)"}.`,
      revisarClave: true,
    };
  }
  return {
    causa: "formato",
    linea: `${p}: contestó HTTP ${status || 200} pero no trajo una lista de modelos${cola ? ` · ${cola}` : ""}.`,
    revisarClave: false,
  };
}

/**
 * El sobre que devuelve `/api/cloud/models`. Existe como función para que la
 * suite fije DOS cosas que el silencio rompía: que el catálogo guardado siga
 * viajando (nunca una lista vacía) y que el motivo viaje CON él.
 */
export function respuestaCatalogo(entrada: {
  provider: string;
  estaticos: any[];
  enVivo?: any[];
  diagnostico?: DiagnosticoCatalogo | null;
}): { models: any[]; total: number; source: string; motivo?: string } {
  const estaticos = Array.isArray(entrada.estaticos) ? entrada.estaticos : [];
  const vivos = Array.isArray(entrada.enVivo) ? entrada.enVivo : [];
  if (vivos.length > 0) {
    const vistos = new Set(estaticos.map((m: any) => String(m?.id || "")));
    const merged = [...estaticos, ...vivos.filter((m: any) => !vistos.has(String(m?.id || "")))];
    return { models: merged, total: merged.length, source: "live+static" };
  }
  if (entrada.diagnostico) {
    return {
      models: estaticos,
      total: estaticos.length,
      source: "static-fallback",
      motivo: entrada.diagnostico.linea,
    };
  }
  return { models: estaticos, total: estaticos.length, source: "static" };
}

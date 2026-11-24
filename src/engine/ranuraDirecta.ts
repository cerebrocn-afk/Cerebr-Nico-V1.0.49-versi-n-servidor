/**
 * ranuraDirecta.ts — PROVEEDORES DIRECTOS SIN PREFIJO + CLOUDFLARE WORKERS AI (v1.0.28)
 * ==================================================================================
 *
 * EL DEFECTO QUE CURA (medido sobre v1.0.27, no supuesto):
 *   `modelTiers.isRemote()` reconoce la nube por PREFIJO de proveedor
 *   (`groq/llama-3.3-70b`, `openrouter/…`) o por familia conocida. Pero varios
 *   proveedores se llaman por su id PELADO, sin prefijo: `llama-3.3-70b-versatile`
 *   (Groq), `gpt-oss-120b` (Cerebras), o cualquiera de Workers AI
 *   (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Esos ids caían en `small`
 *   LOCAL: ventana e historial de Ollama, sin hueco para herramientas de nube.
 *   Con `@cf/` el daño es mayor: ningún patrón de la casa nombra Cloudflare, así
 *   que ni `remote`, ni `toolCapable`, ni la búsqueda web por defecto se activan.
 *
 * LO QUE ESTE MÓDULO SÍ HACE:
 *   · Reconoce el prefijo de Workers AI (`@cf/<familia>/<modelo>`) y el de
 *     Workers AI para terceros (`@<org>/<modelo>`), y dice que es NUBE y que
 *     habla el protocolo de OpenAI.
 *   · Reconoce una LISTA CERRADA de prefijos de id pelado de proveedores
 *     directos (Groq y Cerebras primero: son los que Mario usa) y devuelve la
 *     familia, para que `modelTiers` decida `toolCapable` sin adivinar por
 *     subcadena suelta.
 *   · Reconoce los modelos de Workers AI por familia de nombre (`llama-3.3`,
 *     `qwen3`, `mistral-small`, `gemma-3`, `deepseek-r1`, `gpt-oss`) para que la
 *     lista de tool-capable no tenga que conocer a Cloudflare.
 *
 * LO QUE ESTE MÓDULO NO HACE (y se dice, porque el silencio es lo que engaña):
 *   · No forma parte del ENRUTADOR VIRTUAL. `openrouter/auto` sigue siendo
 *     incógnita a propósito (ver `modelTiers`): acá solo se nombran proveedores
 *     con id estable y documentado.
 *   · No llama a la red ni lee claves. Es puro: nombres entran, hechos salen.
 *     La ranura de la clave (Workers AI) se declara en `ranuraUnificada`.
 */

/** Proveedor directo reconocido por el ID del modelo. */
export type ProveedorDirecto = "cloudflare-workers-ai" | "groq" | "cerebras";

export interface RanuraDirecta {
  proveedor: ProveedorDirecto;
  /** Familia declarada por el proveedor (para decidir tool-capable sin regex suelta). */
  familia: string;
  /** true = el proveedor habla el protocolo de OpenAI («chat/completions» compatible). */
  compatibleOpenAI: true;
  motivo: string;
}

/** Prefijo de los modelos de Workers AI: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. */
export const PREFIJO_WORKERS_AI = "@cf/";

/** Plantilla de endpoint de Workers AI (cuenta + token, sin claves acá). */
export const URL_WORKERS_AI =
  "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1";

/**
 * Familias que Cloudflare publica en Workers AI y que la casa ya sabe leer por
 * nombre. Se listan EXPLÍCITAS: una regex `/llama/` suelta convertiría en nube a
 * un modelo local llamado «llamativo», que es el mismo error que la casa ya
 * pagó con `/embed/` en `aduanaModelos`.
 */
const FAMILIAS_WORKERS_AI: Array<{ re: RegExp; familia: string }> = [
  { re: /^@cf\/[a-z0-9.-]+\/llama-?[3-9]/i, familia: "llama" },
  { re: /^@cf\/[a-z0-9.-]+\/qwen/i, familia: "qwen" },
  { re: /^@cf\/[a-z0-9.-]+\/mistral/i, familia: "mistral" },
  { re: /^@cf\/[a-z0-9.-]+\/gemma/i, familia: "gemma" },
  { re: /^@cf\/[a-z0-9.-]+\/deepseek-(?:r1|v[2-9])/i, familia: "deepseek" },
  { re: /^@cf\/[a-z0-9.-]+\/gpt-oss/i, familia: "gpt-oss" },
  { re: /^@cf\//i, familia: "workers-ai" },
];

/**
 * IDs PELADOS de proveedores directos. Lista cerrada y reconocible: si un id no
 * casa aquí, NO se inventa proveedor (se devuelve null y la casa sigue con su
 * criterio de siempre).
 */
const IDS_DIRECTOS: Array<{ re: RegExp; proveedor: ProveedorDirecto; familia: string }> = [
  // Groq — los ids que la consola de Groq publica hoy (sin prefijo de proveedor).
  { re: /^(?:llama-?[3-9][\w.-]*-versatile|llama-?[3-9][\w.-]*-instant|llama3-[\w.-]+|mixtral-[\w.-]+|gemma[2-9]-[\w.-]+|qwen[2-9][\w.-]*|deepseek-r1-distill[\w.-]*|openai\/gpt-oss[\w.-]*|moonshotai\/kimi[\w.-]*)$/i, proveedor: "groq", familia: "groq" },
  // Cerebras — familia llama/gpt-oss/qwen por id pelado, con sufijo de tamaño.
  { re: /^(?:llama-?[3-9](?:\.\d)?-[0-9]+b|gpt-oss-[0-9]+b|qwen-3-[0-9]+b|qwen3-[0-9]+b)$/i, proveedor: "cerebras", familia: "cerebras" },
];

/**
 * ¿Este id de modelo es de un proveedor DIRECTO (nube, protocolo OpenAI)?
 * Devuelve null cuando no se reconoce: desconocido NO es «local».
 */
export function ranuraDirectaDe(modelo: string): RanuraDirecta | null {
  const id = String(modelo ?? "").trim();
  if (!id) return null;
  if (id.startsWith(PREFIJO_WORKERS_AI)) {
    for (const f of FAMILIAS_WORKERS_AI) {
      if (f.re.test(id)) {
        return {
          proveedor: "cloudflare-workers-ai",
          familia: f.familia,
          compatibleOpenAI: true,
          motivo: `Workers AI (Cloudflare): el prefijo ${PREFIJO_WORKERS_AI} lo declara; habla chat/completions.`,
        };
      }
    }
  }
  for (const d of IDS_DIRECTOS) {
    if (d.re.test(id)) {
      return {
        proveedor: d.proveedor,
        familia: d.familia,
        compatibleOpenAI: true,
        motivo: `id directo de ${d.proveedor} (la consola del proveedor lo publica sin prefijo de proveedor).`,
      };
    }
  }
  return null;
}

/** ¿La familia del modelo admite bucle de herramientas? (hechos, no adivinanza) */
export function familiaConHerramientas(familia: string): boolean {
  return /^(?:llama|qwen|mistral|gemma|deepseek|gpt-oss|groq|cerebras|workers-ai)$/i.test(
    String(familia ?? "")
  );
}

/**
 * Cómo se llama la ranura de la clave en la interfaz. Es UNA sola ranura para
 * Workers AI: cuenta + token; la cuenta viaja en la URL plantilla.
 */
export interface RanuraDeClave {
  ranura: string;
  proveedor: string;
  urlPlantilla: string;
  necesitaCuenta: boolean;
  nota: string;
}

export const RANURA_WORKERS_AI: RanuraDeClave = {
  ranura: "Cloudflare Workers AI",
  proveedor: "cloudflare",
  urlPlantilla: URL_WORKERS_AI,
  necesitaCuenta: true,
  nota:
    "Un solo token sirve para todos los modelos @cf/*. La cuenta (ACCOUNT_ID) va en la URL: sin ella el endpoint no existe.",
};

/**
 * Dirección final del endpoint, con la cuenta ya puesta. Sin cuenta devuelve
 * null — y NO una URL rota: un endpoint que no existe se lee como «el modelo
 * falló», que es justo el diagnóstico equivocado.
 */
export function endpointWorkersAI(accountId: string): string | null {
  const id = String(accountId ?? "").trim();
  // Un ACCOUNT_ID de Cloudflare es hex de 32. Se acepta cualquier id alfanumérico
  // de 32+ por si cambia el formato, pero NO se acepta vacío ni basura con espacios.
  if (!/^[A-Za-z0-9]{16,64}$/.test(id)) return null;
  return URL_WORKERS_AI.replace("{ACCOUNT_ID}", id);
}

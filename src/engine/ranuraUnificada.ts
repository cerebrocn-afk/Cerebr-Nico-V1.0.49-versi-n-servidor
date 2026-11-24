/**
 * ranuraUnificada.ts — LA RANURA DE LA API UNIFICADA, SIN MARCAS AJENAS (v1.80.0)
 * ===============================================================================
 * QUÉ ES: la cara visible y el reparto de claves de la ranura que recibe UN
 * solo endpoint OpenAI-compatible por el que hablan MUCHOS proveedores (la
 * «API unificada» de Mario). Acá vive el nombre, las plantillas de URL y la
 * traducción del archivo de claves exportado a las ranuras de esta IDE.
 *
 * POR QUÉ EXISTE (pedido de Mario 27/10): «no quiero que aparezca [la app
 * externa] en CerebroNico, pero sí su funcionamiento». Traducción técnica:
 *   · la marca y los enlaces de un producto tercero NO tienen lugar en la IDE;
 *   · la CAPACIDAD — un endpoint, muchos proveedores, y el enjambre que habla a
 *     todos con el mismo prompt — es de CerebroNico y se llama como tal;
 *   · el formato de export que Mario ya usa sigue entrando: se acepta
 *     CUALQUIER `{keys:[{platform,key}]}` sin importar qué lo escribió. Tolerar
 *     el archivo propio del usuario no es nombrarlo en la interfaz.
 *
 * PUREZA: sin React, sin DOM, sin disco, sin red. `ApiKeyModal` solo enchufa
 * los setters; la decisión está acá y se prueba en
 * `tests/ranuraUnificada.test.ts`.
 */

/** Nombre visible de la ranura en «Ranuras de API Keys». */
export const NOMBRE_RANURA = "API Unificada";

/** Etiqueta de la carpeta en el selector de modelos (pestaña + contador). */
export const ETIQUETA_CARPETA_MODELOS = "🧩 Unificada";

/** Qué dice la IDE cuando la carpeta está vacía y por qué. */
export const DESCRIPCION_CARPETA =
  "Modelos que responde tu API unificada (la ranura «URL» de Ranuras de API Keys): un solo endpoint, muchos proveedores.";

/** Plantillas de URL: la IDE no instala nada, solo escribe la dirección. */
export const PLANTILLAS_ENDPOINT: Array<{ etiqueta: string; url: string; ayuda: string }> = [
  { etiqueta: "Servidor local → :3001/v1", url: "http://127.0.0.1:3001/v1", ayuda: "El endpoint unificado escuchando en el puerto 3001 de esta máquina." },
  { etiqueta: "App de escritorio → :31415/v1", url: "http://127.0.0.1:31415/v1", ayuda: "La app de escritorio que trae dashboard y API en el puerto 31415." },
];

/**
 * Plataforma del export → ranura de la IDE. `proveedor` es el id que usa el
 * enrutado (`providerRouting`) y `clave` la propiedad del estado en App.
 * Un export puede traer plataformas que acá no tienen ranura: se AVISA, no se
 * ignora en silencio (regla de la casa: lo que no se hace, se nombra).
 */
export interface RanuraDestino {
  ranura: string;
  proveedor: string;
}

export const RANURA_POR_PLATAFORMA: Record<string, RanuraDestino> = {
  google: { ranura: "Google Gemini", proveedor: "gemini" },
  gemini: { ranura: "Google Gemini", proveedor: "gemini" },
  openrouter: { ranura: "OpenRouter", proveedor: "openrouter" },
  zhipu: { ranura: "Z.ai (Zhipu)", proveedor: "zai" },
  zai: { ranura: "Z.ai (Zhipu)", proveedor: "zai" },
  glm: { ranura: "Z.ai (Zhipu)", proveedor: "zai" },
  openai: { ranura: "OpenAI", proveedor: "openai" },
  groq: { ranura: "Groq", proveedor: "groq" },
  cerebras: { ranura: "Cerebras", proveedor: "cerebras" },
  together: { ranura: "Together", proveedor: "together" },
  mistral: { ranura: "Mistral", proveedor: "mistral" },
  deepseek: { ranura: "DeepSeek", proveedor: "deepseek" },
  fireworks: { ranura: "Fireworks", proveedor: "fireworks" },
  // v1.0.28 — Cloudflare Workers AI: sus modelos se llaman `@cf/...` y un solo
  // token cubre toda la familia. Sin esta ranura, un export con `cloudflare`
  // caía en «sin-ranura» y la clave se perdía en silencio (lo que el propio
  // módulo dice que nunca debe pasar).
  cloudflare: { ranura: "Cloudflare Workers AI", proveedor: "cloudflare" },
  "workers-ai": { ranura: "Cloudflare Workers AI", proveedor: "cloudflare" },
};

/** ¿El valor parece un comando de arranque y no una clave? (caso real: ollama) */
export function esComandoDeArranque(valor: string): boolean {
  const v = String(valor || "").trim();
  if (!v) return true;
  if (/\s&&\s|(^|\s)(serve|export)\s|set\s+\w+=/i.test(v)) return true;
  return v.length < 12;
}

export interface EntradaClaveExport {
  plataforma: string;
  /** Ranura destino legible; null = la IDE no tiene dónde ponerla. */
  ranura: string | null;
  proveedor: string | null;
  estado: "carga" | "ignorada" | "sin-ranura";
  aviso: string;
}

export interface ResultadoExport {
  ok: boolean;
  entradas: EntradaClaveExport[];
  /** El valor SECRETO nunca sale de acá: `ApiKeyModal` lo usa y lo tira. */
  claves: Array<{ proveedor: string; valor: string }>;
  error?: string;
}

/**
 * Lee un export de claves —`{version, source, keys:[{platform,key,label}]}`—
 * y dice qué va en cada ranura. Tolerante a propósito:
 *  · no exige un `source` concreto (el usuario ya tiene su archivo; la IDE no
 *    le pide permiso a una marca para leerle un JSON);
 *  · un comando de arranque en `key` se descarta y se avisa;
 *  · una plataforma sin ranura equivalente se AVISA con su nombre.
 */
export function leerExportDeClaves(bruto: unknown): ResultadoExport {
  const data: any = bruto;
  const clavesBrutas: any[] = Array.isArray(data?.keys) ? data.keys : [];
  if (clavesBrutas.length === 0) {
    return {
      ok: false,
      entradas: [],
      claves: [],
      error: "El archivo no trajo ninguna clave (se espera «keys»: [{platform, key}]).",
    };
  }
  const entradas: EntradaClaveExport[] = [];
  const claves: Array<{ proveedor: string; valor: string }> = [];
  for (const k of clavesBrutas) {
    const plataforma = String(k?.platform || "").toLowerCase().trim();
    const valor = String(k?.key || "").trim();
    if (!plataforma) continue;
    if (!valor) {
      entradas.push({ plataforma, ranura: null, proveedor: null, estado: "ignorada", aviso: `${plataforma}: entrada sin valor — se ignora.` });
      continue;
    }
    if (esComandoDeArranque(valor)) {
      entradas.push({
        plataforma,
        ranura: null,
        proveedor: null,
        estado: "ignorada",
        aviso: `${plataforma}: «${valor.slice(0, 40)}» no es una clave (parece comando de arranque) — se ignora.`,
      });
      continue;
    }
    const destino = RANURA_POR_PLATAFORMA[plataforma];
    if (!destino) {
      entradas.push({
        plataforma,
        ranura: null,
        proveedor: null,
        estado: "sin-ranura",
        aviso: `${plataforma}: sin ranura equivalente en la IDE — se ignora (dentro de tu endpoint unificado sí sirve).`,
      });
      continue;
    }
    entradas.push({ plataforma, ranura: destino.ranura, proveedor: destino.proveedor, estado: "carga", aviso: `✓ ${plataforma} → ranura ${destino.ranura}` });
    claves.push({ proveedor: destino.proveedor, valor });
  }
  return { ok: entradas.some((e) => e.estado === "carga"), entradas, claves };
}

/** El endpoint unificado es un proveedor más del enrutado: `custom`. */
export const PROVEEDOR_UNIFICADO = "custom";

/**
 * Nombre corto para el informe/selector: la carpeta se llama «Unificada», no
 * lleva el nombre de ningún producto tercero.
 */
export function nombreCarpetaUnificada(): string {
  return ETIQUETA_CARPETA_MODELOS;
}

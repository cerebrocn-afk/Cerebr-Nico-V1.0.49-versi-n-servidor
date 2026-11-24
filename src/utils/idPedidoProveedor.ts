export type AliasDePago = { proveedor: string; modelo: string; nota: string };

export interface VeredictoId {
  /** El id tal cual llegó (recortado). */
  pedido: string;
  /** El que hay que mandar al proveedor. */
  efectivo: string;
  /** true si se cambió el id. */
  corregido: boolean;
  /** "" si no hay nada que contar; si no, una línea en español. */
  aviso: string;
}

/**
 * LOS IDS QUE SE PUEDEN MANDAR SIN MIEDO.
 *
 * Sale de la documentación de cada proveedor, no de la carpeta del usuario: un id
 * que no figure aquí (y que no tenga alias) NO se inventa. Es la diferencia entre
 * «el proveedor decidió» y «la IDE mandó un nombre que solo existía en tu equipo y
 * se comió un 404».
 */
export const IDS_CONOCIDOS: Record<string, string[]> = {
  zai: ["glm-4.6", "glm-4.5", "glm-4.5-air", "glm-4.5-flash", "glm-4-plus", "glm-4-air", "glm-4-flash"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  mistral: [
    "mistral-small-latest", "mistral-medium-latest", "mistral-large-latest",
    "codestral-latest", "devstral-medium-latest", "ministral-8b-latest", "ministral-3b-latest",
  ],
  fireworks: ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
};

/**
 * ALIAS DE UN NOMBRE QUE YA NO EXISTE → EL ID REAL DEL MISMO PROVEEDOR.
 *
 * `zai-glm-5-2` y `deepseek 4.1-flash` son nombres de la carpeta de favoritos, no
 * del catálogo: los proveedores cobran por un id EXACTO y contestan 404 «model not
 * found» con cualquier otro. Se mapea al modelo real del MISMO proveedor (el más
 * capaz, no el más barato): el pedido era «los que mejor funcionan, tareas de 20 o
 * 30 minutos».
 */
export const ALIAS_DE_PAGO: AliasDePago[] = [
  { proveedor: "zai", modelo: "glm-5-2", nota: "glm-4.6" },
  { proveedor: "zai", modelo: "glm-5", nota: "glm-4.6" },
  { proveedor: "zai", modelo: "glm-4.7", nota: "glm-4.6" },
  { proveedor: "deepseek", modelo: "deepseek-4.1-flash", nota: "deepseek-chat" },
  { proveedor: "deepseek", modelo: "4.1-flash", nota: "deepseek-chat" },
  { proveedor: "deepseek", modelo: "deepseek-v4", nota: "deepseek-chat" },
];

/** El prefijo con el que la interfaz precede al nombre bonito («zai-glm-5-2»). */
const PREFIJOS: Record<string, string[]> = {
  zai: ["zai-", "zai/"],
  deepseek: ["deepseek-", "deepseek/"],
  mistral: ["mistral-", "mistral/"],
};

function normalizar(s: string): string {
  return String(s || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

const esConocido = (prov: string, id: string) =>
  (IDS_CONOCIDOS[prov] || []).some((x) => normalizar(x) === normalizar(id));

/**
 * QUÉ ID MANDAR A UN PROVEEDOR DE PAGO.
 *
 * Orden de decisión (cada paso dice qué hizo, nunca en silencio):
 *   1. Es un id del catálogo → se manda tal cual.
 *   2. Es un alias declarado (con o sin el prefijo del proveedor) → el id real, avisando.
 *   3. Tiene pinta de nombre de la carpeta y no es del catálogo → el modelo del
 *      proveedor, avisando. NUNCA se inventa un id incompleto.
 *   4. Id con forma de id y proveedor sin catálogo cargado → se respeta (ahí el único
 *      que puede decidir es el proveedor).
 *
 * PURA: sin red, sin estado.
 */
export function resolverIdDePago(proveedor: string, id: string, porDefecto: string): VeredictoId {
  const prov = normalizar(proveedor);
  const pedido = String(id || "").trim();
  if (!pedido) return { pedido, efectivo: porDefecto, corregido: false, aviso: "" };
  const n = normalizar(pedido);

  // 1) Id del catálogo: se respeta
  if (esConocido(prov, pedido)) return { pedido, efectivo: pedido, corregido: false, aviso: "" };

  // 2) Alias declarado, exacto o con el prefijo de la carpeta delante
  const desnudo = (() => {
    for (const pre of PREFIJOS[prov] || []) if (n.startsWith(pre)) return n.slice(pre.length);
    return n;
  })();
  const alias = ALIAS_DE_PAGO.find((a) => a.proveedor === prov && normalizar(a.modelo) === desnudo);
  if (alias) {
    return {
      pedido,
      efectivo: alias.nota,
      corregido: true,
      aviso:
        desnudo === n
          ? `«${pedido}» es un nombre de la carpeta, no un id del catálogo: el turno va con «${alias.nota}» (${prov}).`
          : `«${pedido}» no es un id de ${prov}: se envía «${alias.nota}» (el modelo real del mismo proveedor).`,
    };
  }

  // 2b) El desnudo sí es del catálogo («zai-glm-4.6» → «glm-4.6»)
  if (desnudo !== n && esConocido(prov, desnudo)) {
    return { pedido, efectivo: desnudo, corregido: true, aviso: `«${pedido}» se envía como «${desnudo}» a ${prov}.` };
  }

  // 3) Proveedor con catálogo cargado y el id no está: no se inventa
  if ((IDS_CONOCIDOS[prov] || []).length > 0) {
    return {
      pedido,
      efectivo: porDefecto,
      corregido: true,
      aviso:
        `«${pedido}» no está en el catálogo de ${prov}: el turno va con «${porDefecto}» ` +
        `para no morir en un 404. Cambialo en el selector si querés otro.`,
    };
  }

  // 4) Sin catálogo propio (openrouter, custom…): el id tiene la última palabra
  return { pedido, efectivo: pedido, corregido: false, aviso: "" };
}

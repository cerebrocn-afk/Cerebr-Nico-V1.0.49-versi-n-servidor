/**
 * busquedaWebNube.ts — BÚSQUEDA WEB POR DEFECTO EN MODELOS DE NUBE (PASO 6 · v1.54.0)
 * ================================================================================
 * PASO 6 de la HOJA DE RUTA v1.54 (ver documentacion/HOJA_DE_RUTA_BUSQUEDA_WEB_v1.54.0.md).
 *
 * EL ENCARGO (Mario): por DEFECTO, cuando el turno usa un modelo de NUBE, activar la
 * BÚSQUEDA WEB para que el modelo CONFIRME en internet si lo que va a validar/escribir/
 * ejecutar ESE turno es correcto; ejecutar SOLO sobre lo confirmado; y CITAR fuentes.
 *
 * HONESTIDAD RADICAL (límite de este módulo):
 *   - En el proyecto NO existe hoy una herramienta de búsqueda web real cableada
 *     (ni serper/tavily/grounding). Este módulo NO llama a internet: es PURO. Decide
 *     la POLÍTICA, ensambla el PAYLOAD de grounding por proveedor y redacta la
 *     DIRECTIVA de sistema. La llamada REAL a la web queda SIN VERIFICAR en dev
 *     (entorno sin red) y la corre Mario en su máquina al cablear.
 *   - Soporte por proveedor, sin maquillaje:
 *       · gemini     → grounding NATIVO: añadir `{ googleSearch: {} }` al array `tools`.
 *       · openrouter → sufijo `:online` en el id del modelo (habilita su búsqueda web).
 *       · openai / compat de chat/completions → SOLO-DIRECTIVA (su `web_search` vive en
 *         la Responses API, que este motor NO usa) → SIN VERIFICAR el camino nativo.
 *
 * FUENTE ÚNICA: la clasificación de «es de nube» se delega en `modelTiers.ts`
 * (`getModelProfile` / `esFamiliaNubeConHerramientas`). NO se reimplementa aquí.
 *
 * CABLE MÍNIMO, DOCUMENTADO y NO insertado (módulo HUÉRFANO a propósito — el trinquete
 * de `server.ts` queda intacto). Para engancharlo en vivo (v1.54.x):
 *   // una vez por turno:
 *   const dec = decidirBusquedaWeb({ modelo: model, proveedor,
 *                                    config: cargarConfigBusqueda(RAIZ),
 *                                    anuladoPorUsuario });
 *   // rama Gemini (server.ts ~10256):
 *   toolsGemini = aplicarGroundingATools(toolsGemini ?? [], dec);
 *   consolidatedSystemInstruction += "\n\n" + directivaBusquedaWeb(dec, {});
 *   // rama OpenAI/compat: anteponer la directiva al mensaje de sistema;
 *   //   para OpenRouter: usar modeloConSufijoOnline(model) como id.
 */

import * as fs from "fs";
import * as path from "path";
import { getModelProfile, esFamiliaNubeConHerramientas } from "./modelTiers";

/** Cómo soporta la búsqueda web el proveedor del turno. */
export type SoporteGrounding =
  | "gemini-nativo"
  | "openrouter-online"
  | "solo-directiva"
  | "ninguno";

/** Config persistida en `.cerebro-db/busquedaWeb.json` (el usuario manda). */
export interface ConfigBusquedaWeb {
  /** Por defecto, ¿se activa en modelos de nube sin que nadie la pida? */
  porDefectoEnNube: boolean;
  /** Interruptor global del usuario: si está en true, NUNCA se activa. */
  desactivadaGlobal: boolean;
  /** Modelos concretos que NO deben disparar búsqueda (coincidencia por substring). */
  modelosExcluidos: string[];
  /** Tope de citas a exigir/mostrar por respuesta. */
  maxCitas: number;
}

export const CONFIG_BUSQUEDA_DEFECTO: ConfigBusquedaWeb = {
  porDefectoEnNube: true,
  desactivadaGlobal: false,
  modelosExcluidos: [],
  maxCitas: 5,
};

/** Entrada de la decisión (todo explícito; la función es PURA). */
export interface EntradaDecision {
  modelo: string;
  /** Proveedor resuelto si se conoce (gemini/openrouter/openai/…). null = desconocido. */
  proveedor?: string | null;
  config?: ConfigBusquedaWeb;
  /**
   * Anulación EXPLÍCITA del usuario para ESTE turno:
   *   true  = fuerza ON, false = fuerza OFF, null/undefined = sin anular (usa el defecto).
   * El usuario SIEMPRE gana al valor por defecto.
   */
  anuladoPorUsuario?: boolean | null;
}

export interface DecisionBusqueda {
  /** ¿La búsqueda web entra activa este turno? */
  activa: boolean;
  /** ¿El modelo del turno es de nube? */
  esNube: boolean;
  /** Cómo lo soporta el proveedor (relevante sólo si `activa`). */
  soporte: SoporteGrounding;
  /** Explicación legible de por qué se decidió así (para el log honesto). */
  motivo: string;
}

/** Mapea el proveedor del turno al tipo de soporte de búsqueda web. */
export function resolverSoporteGrounding(proveedor?: string | null): SoporteGrounding {
  const p = (proveedor || "").toLowerCase().trim();
  if (!p) return "ninguno";
  if (p === "gemini") return "gemini-nativo";
  if (p === "openrouter") return "openrouter-online";
  // El resto de compatibles-OpenAI (openai, groq, deepseek, mistral, together,
  // cerebras, fireworks, zai, custom) usan chat/completions: sin web_search
  // nativo por esa vía → queda la directiva de prudencia.
  return "solo-directiva";
}

/** ¿El modelo pedido está excluido por el usuario (substring)? */
export function modeloExcluido(modelo: string, excluidos: string[]): boolean {
  const m = (modelo || "").toLowerCase();
  for (const e of excluidos) {
    const t = (e || "").toLowerCase().trim();
    if (t && m.includes(t)) return true;
  }
  return false;
}

/**
 * CORAZÓN. Decide si la búsqueda web entra activa este turno.
 * Prioridad: anulación del usuario > apagado global > exclusión por modelo >
 * (es nube Y por-defecto-ON). Un modelo LOCAL nunca dispara búsqueda.
 */
export function decidirBusquedaWeb(entrada: EntradaDecision): DecisionBusqueda {
  const cfg: ConfigBusquedaWeb = { ...CONFIG_BUSQUEDA_DEFECTO, ...(entrada.config || {}) };
  const modelo = entrada.modelo || "";
  const perfil = getModelProfile(modelo);
  const esNube = perfil.tier === "cloud" || perfil.remote === true || esFamiliaNubeConHerramientas(modelo);
  const soporte = esNube ? resolverSoporteGrounding(entrada.proveedor) : "ninguno";
  const anulado = entrada.anuladoPorUsuario;

  // 1) Anulación explícita del usuario: GANA siempre.
  if (anulado === true) {
    return { activa: true, esNube, soporte: esNube ? soporte : "solo-directiva",
      motivo: "el usuario forzó la búsqueda web ON para este turno" };
  }
  if (anulado === false) {
    return { activa: false, esNube, soporte: "ninguno",
      motivo: "el usuario forzó la búsqueda web OFF para este turno" };
  }

  // 2) Apagado global del usuario.
  if (cfg.desactivadaGlobal) {
    return { activa: false, esNube, soporte: "ninguno",
      motivo: "búsqueda web desactivada globalmente en la config" };
  }

  // 3) Modelo local: no hay cliente de nube ni cuota; no se dispara.
  if (!esNube) {
    return { activa: false, esNube, soporte: "ninguno",
      motivo: "modelo LOCAL: la búsqueda web por defecto solo aplica a modelos de nube" };
  }

  // 4) Excluido por modelo.
  if (modeloExcluido(modelo, cfg.modelosExcluidos)) {
    return { activa: false, esNube, soporte: "ninguno",
      motivo: "modelo de nube EXCLUIDO por el usuario de la búsqueda por defecto" };
  }

  // 5) Nube + por-defecto-ON (o apagado por defecto en config).
  if (!cfg.porDefectoEnNube) {
    return { activa: false, esNube, soporte: "ninguno",
      motivo: "búsqueda por defecto en nube deshabilitada en la config" };
  }
  return { activa: true, esNube, soporte,
    motivo: "modelo de NUBE: búsqueda web ACTIVADA por defecto" };
}

/** Fragmento de grounding nativo de Gemini para el array `tools`. */
export function payloadGeminiGrounding(): { googleSearch: Record<string, never> } {
  return { googleSearch: {} };
}

/**
 * Devuelve un array NUEVO de tools con el grounding añadido si procede.
 * Solo añade el fragmento cuando el soporte es `gemini-nativo` y no estaba ya.
 * NO muta la entrada. Para OpenRouter el grounding va por el id (`:online`), no
 * por tools; para `solo-directiva` no hay fragmento que añadir.
 */
export function aplicarGroundingATools(tools: any[], decision: DecisionBusqueda): any[] {
  const base = Array.isArray(tools) ? tools.slice() : [];
  if (!decision.activa || decision.soporte !== "gemini-nativo") return base;
  const yaEsta = base.some((t) => t && typeof t === "object" && "googleSearch" in t);
  if (yaEsta) return base;
  base.push(payloadGeminiGrounding());
  return base;
}

/** Añade `:online` a un id de OpenRouter si no lo tiene ya (habilita su web search). */
export function modeloConSufijoOnline(modelo: string): string {
  const m = (modelo || "").trim();
  if (!m) return m;
  if (m.endsWith(":online")) return m;
  return `${m}:online`;
}

export interface OpcionesDirectiva {
  /** Idioma de la directiva (por ahora solo "es"; se declara para no mentir). */
  idioma?: string;
  /** Tope de citas a pedir (hereda de la config si no se pasa). */
  maxCitas?: number;
}

/**
 * Redacta la directiva de sistema. Ordena el ciclo «confirma → ejecuta sobre lo
 * seguro → cita». Si la búsqueda NO está activa, devuelve cadena vacía (no se
 * inyecta ruido). El texto se CONCATENA al systemInstruction del turno.
 */
export function directivaBusquedaWeb(decision: DecisionBusqueda, opts?: OpcionesDirectiva): string {
  if (!decision.activa) return "";
  const max = opts && typeof opts.maxCitas === "number" ? opts.maxCitas : CONFIG_BUSQUEDA_DEFECTO.maxCitas;
  const comoBusca =
    decision.soporte === "gemini-nativo"
      ? "Tienes búsqueda web (grounding de Google) disponible: ÚSALA."
      : decision.soporte === "openrouter-online"
        ? "Tienes búsqueda web en línea disponible: ÚSALA."
        : "Si dispones de alguna herramienta de búsqueda o navegación, ÚSALA; si no, sé EXPLÍCITO sobre lo que no puedes confirmar.";
  return [
    "=== BÚSQUEDA WEB POR DEFECTO (modelo en nube) ===",
    comoBusca,
    "ANTES de dar por válido, escribir o ejecutar algo este turno, CONSULTA la web",
    "para confirmar que es correcto y está VIGENTE (APIs, versiones, firmas, flags,",
    "nombres de paquetes, rutas y comandos cambian con el tiempo).",
    "Ejecuta/escribe SOLO sobre lo que quede CONFIRMADO. Lo que no puedas confirmar,",
    "decláralo «SIN VERIFICAR» y NO lo ejecutes a ciegas.",
    `CITA las fuentes (URL + por qué) cuando una afirmación dependa de datos externos o`,
    `volátiles. Máximo ${max} citas, las más relevantes primero.`,
  ].join("\n");
}

/**
 * Política de citas: hay que citar cuando la búsqueda está activa Y la afirmación
 * depende de datos externos/volátiles. El código propio del proyecto no necesita cita.
 */
export function requiereCitas(decision: DecisionBusqueda, afirmacionDependeDeExterno: boolean): boolean {
  return decision.activa === true && afirmacionDependeDeExterno === true;
}

export interface FuenteCitada {
  url: string;
  motivo: string;
}

/** Formatea las fuentes citadas (URL + por qué), recortadas al tope. */
export function formatearCitas(fuentes: FuenteCitada[], maxCitas: number = CONFIG_BUSQUEDA_DEFECTO.maxCitas): string {
  const lista = Array.isArray(fuentes) ? fuentes : [];
  const validas = lista.filter((f) => f && typeof f.url === "string" && f.url.trim().length > 0);
  if (validas.length === 0) return "";
  const tope = maxCitas > 0 ? maxCitas : validas.length;
  const recortadas = validas.slice(0, tope);
  const lineas = recortadas.map((f, i) => `[${i + 1}] ${f.url.trim()}${f.motivo && f.motivo.trim() ? ` — ${f.motivo.trim()}` : ""}`);
  return ["Fuentes:", ...lineas].join("\n");
}

/** Línea de parte legible para el log de la IDE. */
export function parteBusqueda(decision: DecisionBusqueda): string {
  const estado = decision.activa ? "ACTIVADA" : "desactivada";
  return `[CerebroNico] Búsqueda web ${estado} · ${decision.esNube ? "nube" : "local"} · soporte: ${decision.soporte} · ${decision.motivo}`;
}

/**
 * Capa fina de disco: lee `.cerebro-db/busquedaWeb.json` fusionando con el defecto.
 * Nunca lanza: ante cualquier problema devuelve el defecto. SIN VERIFICAR pesado
 * (depende del fs real; la lógica pura ya está cubierta por harness/tests).
 */
export function cargarConfigBusqueda(raiz: string): ConfigBusquedaWeb {
  try {
    const ruta = path.join(raiz, ".cerebro-db", "busquedaWeb.json");
    if (fs.existsSync(ruta)) {
      const j = JSON.parse(fs.readFileSync(ruta, "utf-8"));
      return { ...CONFIG_BUSQUEDA_DEFECTO, ...(j || {}) };
    }
  } catch {
    /* ante duda, el defecto */
  }
  return { ...CONFIG_BUSQUEDA_DEFECTO };
}

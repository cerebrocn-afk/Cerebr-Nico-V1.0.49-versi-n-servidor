/**
 * toolRegistry.ts — REGISTRO DE HERRAMIENTAS EXTENSIBLE (v2.0)
 * ============================================================
 * Objetivo: que añadir una herramienta nueva a CerebroNico sea escribir UN
 * objeto, sin tocar el bucle del agente, ni el prompt, ni el cliente.
 *
 * Antes (v1.1) las herramientas eran dos arrays constantes en server.ts
 * (`AGENT_TOOLS` y `PC_TOOLS`) y un `switch (name)` de 90 líneas en
 * `executeToolCall()`. Añadir una capacidad obligaba a editar 3 sitios y
 * reiniciar; no había forma de cargar herramientas "de fuera" (un servidor
 * MCP, un pack comunitario, un plugin futuro).
 *
 * Ahora:
 *   1. Cada herramienta declara su esquema + sus REQUISITOS (`requires`).
 *      El registro las filtra por contexto: si no hay Modo PC, las pc_* no
 *      se envían al modelo (menos tokens = más rápido y menos confusión).
 *   2. Los packs se registran con `registerToolPack()`. Los pesados pueden
 *      usar `load()` para cargarse bajo demanda.
 *   3. `registerExternalPack()` permite enchufar herramientas servidas por
 *      OTRO proceso (futuro: servidores MCP, plugins, herramientas remotas):
 *      basta con un endpoint GET /tools que devuelva la lista.
 *   4. `selectToolsForModel()` ajusta cuántas herramientas se ofrecen según
 *      el tamaño del modelo: a un modelo diminuto no se le ofrecen NINGUNA
 *      (no sabe usarlas y se cuelga), y a uno pequeño se le dan solo las
 *      baratas e imprescindibles.
 */

export interface ToolRequirements {
  /** Necesita el Modo Agente PC (puente :5000) */
  pcMode?: boolean;
  /** Necesita un modelo con visión */
  vision?: boolean;
  /** Necesita acceso a red desde el servidor */
  network?: boolean;
  /** Necesita git instalado en el sandbox */
  git?: boolean;
  /** Necesita el sandbox activo (por defecto true) */
  sandbox?: boolean;
}

export interface ToolSpec {
  name: string;
  /** Pack al que pertenece (core, pc, web, git, files, vision, …) */
  pack: string;
  description: string;
  /** JSON Schema de parámetros, formato Ollama/OpenAI */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  requires?: ToolRequirements;
  /** Marca de peligro: la UI debe pedir confirmación (borrados, sobrescrituras) */
  destructive?: boolean;
  /** Herramientas baratas: pocos tokens de entrada y salida (ideales para modelos pequeños) */
  cheap?: boolean;
}

export interface ToolPack {
  id: string;
  label: string;
  description: string;
  tools: ToolSpec[];
  /** Carga perezosa opcional (packs grandes o remotos) */
  load?: () => Promise<ToolSpec[]>;
}

export interface ToolContext {
  pcMode?: boolean;
  vision?: boolean;
  network?: boolean;
  git?: boolean;
  sandbox?: boolean;
}

// ------------------------------------------------------------
// Registro
// ------------------------------------------------------------
const PACKS = new Map<string, ToolPack>();
/** Índice nombre → spec para búsquedas rápidas y validación de duplicados */
const SPEC_INDEX = new Map<string, ToolSpec>();

/** Quién registró cada herramienta: distingue «reemplazo real» de «el mismo pack». */
const PROPIETARIO = new Map<string, string>();

export function registerToolPack(pack: ToolPack): void {
  if (!pack || !pack.id) throw new Error("Pack de herramientas sin id");
  // Un pack con el mismo id se REEMPLAZA (permite hot-reload de packs futuros)
  PACKS.set(pack.id, pack);
  // v1.46.0 — UN REEMPLAZO, UNA LÍNEA. Antes cada herramienta pisada escribía
  // su propio `console.warn`: el arranque tenía 31 líneas seguidas
  // («"crear_sitio" ya existía y fue sobrescrita…») por UNA sola causa. Un
  // registro que grita 31 veces por un hecho se aprende a ignorar, y con él los
  // avisos que sí importan. Ahora se agrupa en una línea con el recuento y los
  // packs implicados. Y si el «reemplazo» viene del MISMO pack (recarga propia,
  // o el pack remoto y el local con el mismo id), no se avisa: no hubo
  // conflicto con nadie.
  const reemplazos: string[] = [];
  const duenos = new Set<string>();
  for (const t of pack.tools || []) {
    if (!t?.name) continue;
    const anterior = PROPIETARIO.get(t.name);
    if (anterior && anterior !== pack.id) {
      reemplazos.push(t.name);
      duenos.add(anterior);
    }
    PROPIETARIO.set(t.name, pack.id);
    SPEC_INDEX.set(t.name, t);
  }
  if (reemplazos.length > 0) {
    console.warn(
      `[tools] pack "${pack.id}": ${reemplazos.length} herramienta(s) reemplazan a ` +
      `[${[...duenos].join(", ")}] (${reemplazos.slice(0, 4).join(", ")}${reemplazos.length > 4 ? "…" : ""})`
    );
  }
}

export function listToolPacks(): Array<Omit<ToolPack, "load"> & { toolCount: number }> {
  return [...PACKS.values()].map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    tools: p.tools,
    toolCount: p.tools.length,
  }));
}

export function getAllToolNames(): string[] {
  return [...SPEC_INDEX.keys()];
}

/** Spec concreta (para saber si una llamada del modelo es de una extensión). */
export function getToolSpec(name: string): ToolSpec | undefined {
  return SPEC_INDEX.get(name);
}

/** Quita un pack y sus herramientas (p. ej. cuando se cierra una extensión). */
export function unregisterToolPack(id: string): void {
  const pack = PACKS.get(id);
  if (!pack) return;
  for (const t of pack.tools || []) {
    if (SPEC_INDEX.get(t.name) === t) SPEC_INDEX.delete(t.name);
  }
  PACKS.delete(id);
}

/** Herramientas cuyo `requires` se cumple con el contexto dado. */
export function getActiveToolSpecs(ctx: ToolContext): ToolSpec[] {
  const out: ToolSpec[] = [];
  for (const spec of SPEC_INDEX.values()) {
    const r = spec.requires || {};
    if (r.pcMode && !ctx.pcMode) continue;
    if (r.vision && !ctx.vision) continue;
    if (r.network && ctx.network === false) continue;
    if (r.git && !ctx.git) continue;
    if (r.sandbox === true && ctx.sandbox === false) continue;
    out.push(spec);
  }
  return out;
}

/**
 * Convierte las specs al formato que espera Ollama/OpenAI.
 * Nota: `deleteToolSpecs`-like helpers viven aquí para que un pack futuro no
 * tenga que conocer el formato de ninguna API concreta.
 */
export function toOllamaTools(specs: ToolSpec[]): unknown[] {
  return specs.map((s) => ({
    type: "function",
    function: {
      name: s.name,
      description: s.description,
      parameters: s.parameters,
    },
  }));
}

/**
 * v1.23.0 · HUESO DE OBRA — las herramientas con las que el agente PUEDE
 * construir, y por lo tanto las que NUNCA se recortan, ni en el modelo más
 * chico que sea tool-capable.
 *
 * El defecto que esto cura (medido con sonda sobre el registro real, v1.22.2):
 * un deepseek-r1:7b tool-capable recibía 8 herramientas elegidas por `cheap`,
 * y entre ellas NO estaban `write_file` ni `run_command` ni `run_tests` ni
 * `deshacer_cambios`. El modelo podía leer y prometer, pero no podía escribir
 * un archivo nuevo ni ejecutar nada: de ahí «siempre le faltan archivos»,
 * «nunca compila» y «no puede volver atrás». Un recorte que deja al agente sin
 * manos no es una optimización: es una amputación.
 */
export const HUESO_DE_OBRA: ReadonlySet<string> = new Set([
  "set_plan",
  "update_task",
  "list_files",
  "read_file",
  "search_in_files",
  "write_file",
  "edit_file",
  "run_command",
  "run_tests",
  "revisar_cambios",
  "deshacer_cambios",
]);

/** Tope de herramientas para un modelo local pequeño (antes: 8). */
export const TOPE_MODELO_PEQUENO = 14;
/** Huecos garantizados para packs EXTERNOS (MCP, plugins): llegan los últimos
 *  al registro y con el recorte viejo nunca llegaban al modelo. El MCP estaba
 *  cargado y funcionando; nadie se lo nombraba. */
export const HUECOS_RESERVADOS_EXTERNO = 4;

/** Packs integrados: todo lo que no sea uno de estos es externo (MCP/plugin). */
// v1.48.0 — "cerebro" es un pack BUILTIN (órgano de redirección local), no un
// MCP/plugin externo. Sin esto, sus herramientas se clasificaban como externas,
// gastaban los 4 huecos reservados a MCP y empujaban la selección del modelo
// pequeño a 15 (> tope 14), dejando fuera herramientas MCP de verdad.
// v1.71.0 · "documentos" es BUILTIN como "cerebro": si faltara, sus tres tools
// gastarían los huecos MCP y desaparecerían del modelo pequeño.
const PACKS_INTEGRADOS = new Set(["core", "pc", "git", "web", "data", "sistema", "cerebro", "documentos"]);
export function esPackExterno(pack: string): boolean {
  return !PACKS_INTEGRADOS.has(pack) && !String(pack || "").startsWith("ext:");
}

/**
 * Ajuste por tamaño de modelo:
 *   - sin tool-calling → 0 herramientas (el bucle de agente se desactiva fuera)
 *   - modelos grandes/nube → todas las disponibles para el contexto actual
 *   - modelo pequeño (≤8B) → HUESO_DE_OBRA completo + hasta 4 externas (MCP) +
 *     las baratas que falten para llegar al tope 14. El hueso se sirve ENTERO
 *     aunque exceda el tope: manos completas antes que prompt corto.
 */
export function selectToolsForModel(
  specs: ToolSpec[],
  profile: { toolCapable: boolean; paramsB: number | null; remote: boolean },
  maxToolsForSmall = TOPE_MODELO_PEQUENO
): ToolSpec[] {
  if (!profile.toolCapable) return [];
  if (profile.remote || profile.paramsB === null || profile.paramsB > 8) return specs;
  const hueso = specs.filter((s) => HUESO_DE_OBRA.has(s.name));
  const externas = specs.filter((s) => !HUESO_DE_OBRA.has(s.name) && esPackExterno(s.pack));
  const baratas = specs.filter((s) => !HUESO_DE_OBRA.has(s.name) && !esPackExterno(s.pack) && s.cheap);
  const resto = specs.filter((s) => !HUESO_DE_OBRA.has(s.name) && !esPackExterno(s.pack) && !s.cheap);
  const out: ToolSpec[] = [...hueso, ...externas.slice(0, HUECOS_RESERVADOS_EXTERNO)];
  const presupuesto = Math.max(0, maxToolsForSmall - out.length);
  const llenado = [...baratas, ...resto].slice(0, presupuesto);
  out.push(...llenado);
  return out;
}

/**
 * v1.23.0 · El recorte NUNCA es silencioso. Devuelve la lista de herramientas
 * que quedaron FUERA del recorte (o [] si no sobró ninguna); quien llama la
 * vuelca a log y al panel. Un modelo al que le esconden herramientas tiene
 * que poder nombrarse a sí mismo con honestidad.
 */
export function explicarRecorte(selected: ToolSpec[], specs: ToolSpec[]): string[] {
  const dentro = new Set(selected.map((s) => s.name));
  return specs.filter((s) => !dentro.has(s.name)).map((s) => s.name);
}

/**
 * Registra un pack EXTERNO servido por otro proceso (plugin, servidor MCP,
 * microservicio propio). Se espera un GET <baseUrl>/tools que devuelva:
 *   { tools: [{ name, description, parameters, destructive?, cheap? }] }
 * El ejecutor real se resuelve en el servidor con `registerExternalHandler`.
 *
 * CONTRATO REAL Y DOBLE (v1.97.1): el puente Python (`agent_bridge_5000.py`) emite
 * `input` como mapa plano `{path: "string", content: "string"}` y NO `parameters`.
 * `normalizarParametrosRemotos` acepta ambos formatos. Sin esto, las 7 herramientas del
 * puente se registraban con `properties:{}` y los argumentos jamás viajaban (H-16/H-17,
 * hallado por DeepSeek-v4-pro sobre v1.95.0 y quedado huérfano en el disco del usuario).
 */

/**
 * Convierte la forma del pack remoto a un JSON Schema utilizable. Acepta:
 *   · `parameters` ya en schema (contrato documentado);
 *   · `input` como mapa plano {nombre: "string"|"number"|"boolean"|...} (el puente);
 *   · `input` que ya sea un schema completo (trae `type` + `properties`).
 * Devuelve SIEMPRE un objeto: el caller lo mete tal cual al manual del modelo.
 */
export function normalizarParametrosRemotos(t: any): { type: "object"; properties: Record<string, any>; required: string[] } {
  if (t && typeof t === "object" && t.parameters && typeof t.parameters === "object") return t.parameters;
  const plano = t && typeof t === "object" ? t.input : undefined;
  if (plano && typeof plano === "object" && !Array.isArray(plano)) {
    if (plano.type || plano.properties) return plano; // ya era un schema completo
    const propiedades: Record<string, any> = {};
    for (const [k, v] of Object.entries(plano)) propiedades[k] = typeof v === "string" ? { type: v } : (v as any);
    return { type: "object", properties: propiedades, required: Object.keys(propiedades) };
  }
  return { type: "object", properties: {}, required: [] };
}

export async function registerExternalPack(
  id: string,
  label: string,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  // v1.43.0 lote 2 — 🐞 PERMISOS MCP: el GET /tools del puente :5000 (y de
  // cualquier pack MCP en loopback) EXIGE autenticación igual que /tools/call.
  // Antes se listó SIN cabeceras → 401/403 → el pack nunca se registraba y las
  // herramientas MCP del agente 5000 jamás aparecían. Ahora se le pasan las
  // mismas cabeceras (X-Cerebro-Token incluido) que luego usará /tools/call.
  authHeaders: Record<string, string> = {},
  /**
   * v1.46.2 — QUIEN REPORTA ES QUIEN SABE SI HAY REINTENTO.
   * El `console.warn` de abajo decía «No se pudo cargar el pack remoto» y se leía
   * como un fallo definitivo… cuando el puente :5000 aún estaba arrancando y el
   * reintento automático (hasta 12 cada 5 s) lo resolvía dos segundos después. Un
   * aviso alarmante sobre algo que se cura solo es ruido, y el ruido enseña a
   * ignorar los avisos que sí importan. Con `silenciarFallo`, el llamador —único
   * que sabe si va a reintentar— se encarga del mensaje y lo cuenta como es.
   */
  opciones: { silenciarFallo?: boolean } = {}
): Promise<ToolPack | null> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/tools`, {
      headers: { Accept: "application/json", ...authHeaders },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    const remoteTools: any[] = Array.isArray(data?.tools) ? data.tools : [];
    if (remoteTools.length === 0) return null;

    const tools: ToolSpec[] = remoteTools
      .filter((t) => t && typeof t.name === "string")
      .map((t) => ({
        name: t.name,
        pack: id,
        description: String(t.description || `Herramienta remota ${t.name}`),
        parameters: normalizarParametrosRemotos(t),
        destructive: !!t.destructive,
        cheap: !!t.cheap,
        requires: { network: true },
      }));

    const pack: ToolPack = { id, label, description: `Pack remoto desde ${baseUrl}`, tools };
    registerToolPack(pack);
    return pack;
  } catch (err: any) {
    if (!opciones.silenciarFallo) {
      console.warn(`[tools] No se pudo cargar el pack remoto "${id}" (${baseUrl}): ${err?.message || err}`);
    }
    return null;
  }
}

/**
 * v1.46.2 — EL INVENTARIO DE UN PACK, EN UNA LÍNEA.
 * Al agrupar los avisos de reemplazo (v1.46.0) desaparecieron del arranque los
 * NOMBRES de las herramientas: antes había 50 líneas que las enumeraban una a
 * una («"crear_sitio" ya existía y fue sobrescrita…») y con ellas se veía el
 * inventario. El usuario lo notó de inmediato —«noto menos herramientas que
 * antes»— y tenía razón en lo que veía, aunque el inventario no había cambiado.
 * Devuelve `null` si el pack no trae nombres, para que el llamador use su propio
 * mensaje en vez de imprimir una línea vacía.
 */
export function inventarioDelPack(pack: { tools?: ToolSpec[] } | null | undefined): string | null {
  const nombres = (pack?.tools || []).map((t) => t.name).filter(Boolean).sort();
  if (nombres.length === 0) return null;
  return nombres.join(", ");
}

// ============================================================
// PACKS INTEGRADOS
// ============================================================

/** Núcleo: todo lo que funciona dentro del sandbox del proyecto (.proyectos) */
const CORE_PACK: ToolPack = {
  id: "core",
  label: "Núcleo (sandbox)",
  description: "Planificación, lectura/escritura de archivos y ejecución dentro del sandbox.",
  tools: [
    {
      name: "set_plan",
      pack: "core",
      cheap: true,
      description: "Definir el plan de trabajo como lista de tareas accionables. Úsala ANTES de empezar.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "identificador corto, ej t1" },
                description: { type: "string", description: "descripción de la tarea" },
                // v1.32.0 · CONTRATO DE ACEPTACIÓN (§3 hoja de ruta): los criterios
                // se DECLARAN ANTES de escribir código y el motor no deja cerrar sin evidencia.
                tipo: { type: "string", enum: ["crear", "modificar", "reparar", "investigar"], description: "tipo de tarea (opcional; default crear)" },
                archivos: { type: "array", items: { type: "string" }, description: "rutas que la tarea toca (opcional)" },
                criterios_aceptacion: { type: "array", items: { type: "string" }, description: "checks verificables de 'terminado' (opcional pero FUERTEMENTE recomendado: ej 'valida email', 'compila', 'test pasa')" },
                presupuesto_iteraciones: { type: "number", description: "cuántos intentos antes de pedir replan (opcional)" },
              },
              required: ["id", "description"],
            },
          },
        },
        required: ["tasks"],
      },
    },
    {
      name: "update_task",
      pack: "core",
      cheap: true,
      description: "Actualizar el estado de una tarea del plan.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "identificador de la tarea" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          evidencia: { type: "string", description: "v1.32.0 · prueba objetiva al cerrar la tarea: salida del build/test/lectura que confirma los criterios" },
        },
        required: ["task_id", "status"],
      },
    },
    {
      name: "list_files",
      pack: "core",
      cheap: true,
      description: "Listar los archivos del proyecto en el sandbox.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_file",
      pack: "core",
      cheap: true,
      description: "Leer el contenido completo de un archivo del proyecto (ruta relativa).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta relativa del archivo" } },
        required: ["path"],
      },
    },
    {
      name: "read_file_range",
      pack: "core",
      cheap: true,
      description:
        "Leer solo un rango de líneas de un archivo (mucho más rápido y barato que leer todo). Úsala para archivos grandes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          start: { type: "number", description: "línea inicial (1-based)" },
          end: { type: "number", description: "línea final (inclusive)" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      pack: "core",
      description: "Escribir o crear un archivo completo en el proyecto (ruta relativa).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          content: { type: "string", description: "contenido completo del archivo" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "edit_file",
      pack: "core",
      cheap: true,
      description:
        "Reemplazar un fragmento exacto dentro de un archivo existente (find & replace). MUCHO más rápido que reescribir el archivo entero: úsala siempre que puedas.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          find: { type: "string", description: "texto exacto a buscar (una sola aparición)" },
          replace: { type: "string", description: "texto de reemplazo" },
        },
        required: ["path", "find", "replace"],
      },
    },
    {
      name: "append_file",
      pack: "core",
      cheap: true,
      description: "Añadir contenido al final de un archivo sin reescribirlo.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          content: { type: "string", description: "contenido a añadir" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "search_in_files",
      pack: "core",
      cheap: true,
      description: "Buscar un texto en todos los archivos del proyecto y devolver ruta:línea. Ideal para orientarse sin leer todo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "texto o expresión regular a buscar" },
          glob: { type: "string", description: "filtro opcional de extensión, ej: .tsx" },
          max_results: { type: "number", description: "máximo de coincidencias (por defecto 40)" },
        },
        required: ["query"],
      },
    },
    {
      name: "make_dir",
      pack: "core",
      cheap: true,
      description: "Crear una carpeta dentro del proyecto.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta de la carpeta" } },
        required: ["path"],
      },
    },
    {
      name: "delete_file",
      pack: "core",
      destructive: true,
      description: "Borrar un archivo del proyecto. Operación destructiva: úsala solo si el usuario lo pidió.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta relativa del archivo" } },
        required: ["path"],
      },
    },
    {
      name: "run_command",
      pack: "core",
      description: "Ejecutar un comando de terminal en el sandbox (npm, node, python, git, ls…).",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando a ejecutar" } },
        required: ["command"],
      },
    },
    {
      name: "run_tests",
      pack: "core",
      description: "Ejecutar las pruebas del proyecto (npm test por defecto).",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando de test opcional" } },
        required: [],
      },
    },
    {
      // FASE 2 — El motor tiene indexadas las firmas REALES del proyecto, así que
      // esta herramienta pregunta al motor en vez de obligar al modelo a leer
      // archivos enteros. Respuesta típica: ~400 caracteres frente a ~12.000.
      name: "find_symbol",
      pack: "core",
      cheap: true,
      description:
        "Busca funciones, clases, interfaces o componentes que YA existen en el proyecto y devuelve archivo, línea y firma real. Úsala antes de escribir código que llame a algo del proyecto, para no inventar nombres ni firmas.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "nombre (o parte del nombre) del símbolo a buscar" },
          limit: { type: "number", description: "máximo de resultados (por defecto 8)" },
        },
        required: ["name"],
      },
    },
    {
      name: "revisar_cambios",
      pack: "core",
      cheap: true,
      description:
        "Juzga la tanda de cambios que acabas de hacer: sintaxis en disco, API pública perdida e imports rotos. Si algo está rojo, el Quirófano REVIERTE la tanda y te devuelve el informe con el motivo. Úsala SIEMPRE antes de decir que has terminado una mejora sobre una app que funcionaba.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "deshacer_cambios",
      pack: "core",
      cheap: true,
      description:
        "Deshace la última tanda de cambios (restaura los archivos a como estaban antes, y retira los que no existían). Úsala cuando sospeches que has roto algo y no quieras esperar al cierre automático.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "ingresar_archivo_workspace",
      pack: "core",
      cheap: true,
      description:
        "Registra un archivo en el ÁRBOL DE ENTRADA (ingesta). El archivo queda disponible pero FUERA del sandbox que ve el motor: no se lee ni se escribe como obra hasta que lo promuevas. Úsala para dejar constancia de material que el usuario arrojó por chat o subió por el explorador. Si de verdad vas a trabajar sobre él, marca origen='sandbox_target' para que entre ya al sandbox.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          content: { type: "string", description: "contenido completo del archivo" },
          origen: {
            type: "string",
            enum: ["chat_drop", "explorador_manual", "sandbox_target"],
            description: "de dónde viene; 'sandbox_target' lo auto-promueve al sandbox",
          },
        },
        required: ["path", "content", "origen"],
      },
    },
    {
      name: "promover_archivo_sandbox",
      pack: "core",
      cheap: true,
      description:
        "Promueve al SANDBOX (runtime) un archivo que ya está en el árbol de entrada. Es el paso OBLIGATORIO antes de escribir sobre un archivo que el usuario aportó: el guardían del sandbox rechaza escrituras sobre material de entrada no promovido para no pisar contexto del usuario. No afecta a archivos nuevos que tú creas (esos nacen en el sandbox).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo a promover" },
        },
        required: ["path"],
      },
    },
  ],
}; /*QF-TOOLS*/

/** Acceso real a la PC del usuario a través del puente Python :5000 */
const PC_PACK: ToolPack = {
  id: "pc",
  label: "Modo Agente PC",
  description: "Ejecuta comandos y manipula archivos REALES de tu PC vía el puente :5000.",
  tools: [
    {
      name: "pc_info",
      pack: "pc",
      cheap: true,
      requires: { pcMode: true },
      description:
        "Información de la PC: sistema operativo, usuario, ruta del Escritorio, home y arquitectura. Úsala ANTES de tocar archivos reales.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "pc_exec",
      pack: "pc",
      requires: { pcMode: true },
      description:
        "Ejecutar un comando REAL en la PC (CMD en Windows, bash en Linux/Mac). Para crear archivos usa pc_write_file (más fiable que echo).",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "comando a ejecutar" },
          timeout: { type: "number", description: "segundos máximos (por defecto 120)" },
        },
        required: ["command"],
      },
    },
    {
      name: "pc_write_file",
      pack: "pc",
      requires: { pcMode: true },
      description:
        "Crear o sobrescribir un archivo REAL en la PC. Acepta rutas absolutas o atajos: 'Desktop/x.txt', 'Documents/…', 'Downloads/…', '~'.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta del archivo" },
          content: { type: "string", description: "contenido completo" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "pc_read_file",
      pack: "pc",
      cheap: true,
      requires: { pcMode: true },
      description: "Leer un archivo REAL de la PC (ruta absoluta o atajo).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo" } },
        required: ["path"],
      },
    },
    {
      name: "pc_list_dir",
      pack: "pc",
      cheap: true,
      requires: { pcMode: true },
      description: "Listar una carpeta REAL de la PC.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "carpeta a listar" } },
        required: ["path"],
      },
    },
    {
      name: "pc_delete",
      pack: "pc",
      destructive: true,
      requires: { pcMode: true },
      description: "Borrar un archivo REAL de la PC. DESTRUCTIVA: solo si el usuario lo pidió explícitamente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo" } },
        required: ["path"],
      },
    },
  ],
};

/** Git dentro del sandbox (red de seguridad antes de cambios grandes) */
const GIT_PACK: ToolPack = {
  id: "git",
  label: "Git (sandbox)",
  description: "Control de versiones del proyecto: estado, diff y commit de seguridad.",
  tools: [
    {
      name: "git_status",
      pack: "git",
      cheap: true,
      requires: { git: true },
      description: "Estado del repositorio git del proyecto (archivos modificados).",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "git_diff",
      pack: "git",
      requires: { git: true },
      description: "Diff de los cambios sin commitear (opcionalmente de un archivo concreto).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "archivo concreto (opcional)" } },
        required: [],
      },
    },
    {
      name: "git_commit",
      pack: "git",
      requires: { git: true },
      description: "Guardar un punto de restauración: añade todo al índice y hace commit con el mensaje indicado.",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "mensaje del commit" } },
        required: ["message"],
      },
    },
  ],
};

/** Red desde el servidor (read-only). Desactivada si el usuario está en modo offline. */
const WEB_PACK: ToolPack = {
  id: "web",
  label: "Web (read-only)",
  description: "Consultar documentación o APIs públicas desde el servidor.",
  tools: [
    {
      name: "fetch_url",
      pack: "web",
      requires: { network: true },
      description:
        "Descargar el texto de una URL pública (documentación, API JSON). Devuelve texto plano recortado. No ejecuta scripts.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL http/https pública" },
          max_chars: { type: "number", description: "máximo de caracteres a devolver (por defecto 6000)" },
        },
        required: ["url"],
      },
    },
    {
      // v1.0.28 — UNA PETICIÓN, N PREGUNTAS. La pregunta de Mario («¿se puede
      // reformular en el sandbox y mandar UNA sola petición?») hecha herramienta.
      // El plegado/orden/recorte es determinista (`reformuladorConsultas`): no
      // gasta una llamada al modelo para reformular, que sería más lento que la
      // búsqueda misma en un equipo de 8 GB.
      name: "abrir_red",
      pack: "web",
      requires: { network: true },
      description:
        "Buscar en la red VARIAS cosas con UNA sola petición: recibe las preguntas (2-6), las pliega (las repetidas no se pagan dos veces), las ordena y compone una única consulta. Úsala en vez de llamar a buscar_web varias veces seguidas. Exige confirmar:true.",
      parameters: {
        type: "object",
        properties: {
          preguntas: {
            type: "array",
            items: { type: "string" },
            description: "Las preguntas a cubrir, en tus palabras (2-6). Se aceptan también URLs: se leen aparte, en la MISMA petición.",
          },
          confirmar: { type: "boolean", description: "true cuando el usuario autorizó salir a la red. Sin esto devuelve REQUIRE_CONFIRMACION." },
          motor: { type: "string", description: "duckduckgo (por defecto, sin clave) — devuelve la consulta reformulada y los resultados." },
        },
        required: ["preguntas"],
      },
    },
    {
      name: "forjar_complemento",
      pack: "core",
      cheap: true,
      description: "Crea un complemento (extensión) NUEVO a partir de una receta y lo deja instalado y listo: el IDE escribe el manifest y el panel; tú solo pasas la receta. Usar cuando pidan un plugin/complemento para X. Si la receta tiene tachas recibes la lista completa de motivos: corrígela y reenvíala. NUNCA escribas manifest.json a mano.",
      parameters: {
        type: "object",
        properties: {
          receta: { type: "string", description: 'JSON de receta: {"id":"cn.<slug>","nombre":"...","descripcion":"...","proposito":"...","permisos":["workspace.read"],"herramientas":[{"nombre":"<verbo>","descripcion":"...","params":[{"nombre":"...","descripcion":"...","tipo":"string|number|boolean","requerido":true}]}]}. Máximo 3 herramientas; 6 parámetros por herramienta.' },
        },
        required: ["receta"],
      },
    },
    {
      name: "consultar_espejo",
      pack: "core",
      cheap: true,
      description: "Pide trabajo duro y determinista a los agentes espejo y en LOTE (hasta 8 llamadas por golpe): espejo.codigos (inventario de código con nombres de símbolos), lenguajes (idioma + perfil/Flesch), artes (armonías HSL), disenios (grillas/escalas), creadores (variantes por semilla), planificadores (descomposición), cientificos (diseño experimental), fisicos (unidades/constantes), matematicos (aritmética EXACTA), cuantico (registro H/CNOT). NUNCA calcules de cabeza lo que un espejo calcula exacto en ~1 ms; sus números son hechos, no opiniones. PODERES (v1.0.3): añade \"accion\" a «datos» — matematicos: estadistica|resolver|matrices|bases|mcd_mcm|interes; artes: contraste (WCAG)|daltonismo|gradiente; codigos: dependencias|firmas|duplicados; lenguajes: frecuencias|convertir|diff; planificadores: ordenar (topológico, detecta ciclos)|lotes (paralelizables); disenios: escala|breakpoints; cientificos: tam_amostral|ic; cuantico: entrelazamiento. Sin «accion», el espejo hace su orden clásica.",
      parameters: {
        type: "object",
        properties: {
          llamadas: {
            type: "array",
            description: '1-8 llamadas: [{"espejo":"espejo.matematicos","datos":{"expresion":"2*(3+4)"}}]. «datos» según la ficha del espejo (panel Consejo).',
            items: {
              type: "object",
              properties: {
                espejo: { type: "string", description: "id exacto «espejo.*»" },
                datos: { type: "object", description: "entrada del espejo (JSON libre)" },
              },
              required: ["espejo"],
            },
          },
        },
        required: ["llamadas"],
      },
    },
  ],
};

/** Datos: conversión determinista de formatos (módulo ya probado con roundtrip). */
const DATA_PACK: ToolPack = {
  id: "data",
  label: "Datos (formatos)",
  description: "Conversión entre JSON, YAML, TOML y CSV con informe honesto de pérdidas.",
  tools: [
    {
      name: "convertir_formato",
      pack: "data",
      cheap: true,
      description:
        "Convierte un texto entre JSON/YAML/TOML/CSV y devuelve el resultado CON un informe de pérdidas (comentarios, nulos, anidados). Úsala en vez de escribir conversiones a mano: es exacta y declara lo que se pierde.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "contenido de entrada" },
          desde: { type: "string", enum: ["json", "yaml", "toml", "csv"], description: "formato de origen" },
          hacia: { type: "string", enum: ["json", "yaml", "toml", "csv"], description: "formato de destino" },
          ordenar_claves: { type: "boolean", description: "ordena las claves alfabéticamente (por defecto false)" },
          separador_csv: { type: "string", description: "',' o ';' (por defecto ',')" },
          inferir_tipos_csv: { type: "boolean", description: "interpreta 1/true al leer CSV (por defecto false)" },
        },
        required: ["texto", "desde", "hacia"],
      },
    },
  ],
};

/**
 * v1.16.3.1 · MODO BAJO CONSUMO — el agente también mira y libera RECURSOS.
 * Tres herramientas deterministas que reutilizan el mismo módulo que la UI de
 * Puertos (server/ollamaBajoConsumo.ts): una verdad, dos puertas. Son `cheap`
 * a propósito: un modelo pequeño también merece saber por qué se calienta la
 * máquina y cómo descargar el modelo sin que el usuario abra una consola.
 */
const SISTEMA_PACK: ToolPack = {
  id: "sistema",
  label: "Sistema (recursos y Ollama)",
  description: "Residencia de modelos en RAM, expulsión bajo demanda y medidas reales del equipo.",
  tools: [
    {
      name: "ollama_estado",
      pack: "sistema",
      cheap: true,
      description:
        "Dice qué modelos están RESIDENTES en RAM/VRAM ahora mismo y cuántos MB ocupa cada uno (GET Ollama /api/ps). Usala antes de expulsar, para explicar por qué la máquina se calienta o se apaga, y para confirmar que la expulsión funcionó.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "ollama_expulsar",
      pack: "sistema",
      cheap: true,
      description:
        "Descarga YA el modelo de RAM (keep_alive 0, la orden de expulsión de Ollama). Sin argumentos expulsa TODOS los residentes. No borra nada del disco: la próxima respuesta recarga el modelo sola. Usala cuando el usuario pida liberar memoria, al cerrar una sesión pesada, o si un modelo grande quedó clavado en un equipo limitado.",
      parameters: {
        type: "object",
        properties: {
          model: { type: "string", description: "nombre exacto con tag (de ollama_estado); vacío = todos" },
        },
        required: [],
      },
    },
    {
      name: "recursos_maquina",
      pack: "sistema",
      cheap: true,
      description:
        "Medida real del equipo: núcleos de CPU, RAM total, RAM libre y MB residentes de Ollama. Usala para decidir si conviene bajar al escalón MR de modelos (más chico) o para explicar con números un apagón o una lentitud.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ],
};

// ============================================================
// v1.48.0 — CEREBRO (.con-ciencia) + PREVISUALIZADOR A VOLUNTAD (pedido Mario)
// ============================================================
const CEREBRO_PACK: ToolPack = {
  id: "cerebro",
  label: "Cerebro y previsualizador",
  description:
    "Memoria de largo plazo enrutada por tema/título/contexto (no se lee entera) y apertura del previsualizador a voluntad del agente.",
  tools: [
    {
      name: "cerebro_recordar",
      pack: "cerebro",
      cheap: true,
      description:
        "Guarda en el CEREBRO (memoria de largo plazo) algo útil que acabas de aprender o decidir: una decisión de diseño, un patrón del proyecto, una receta que funcionó, una preferencia del usuario. Se indexa solo por tema/título/contexto para poder reencontrarlo después SIN releer todo. Úsala cuando algo valga la pena recordar entre turnos o entre sesiones.",
      parameters: {
        type: "object",
        properties: {
          tema: { type: "string", description: "categoría corta, ej: arranque, proveedores, ui, sandbox, preferencias" },
          titulo: { type: "string", description: "título humano de lo que se recuerda" },
          texto: { type: "string", description: "el conocimiento en sí (lo que hay que recordar), puede ser varias líneas" },
          palabras: { type: "array", items: { type: "string" }, description: "palabras clave extra opcionales para el ruteo" },
          resumen: { type: "string", description: "resumen de una línea (opcional; si falta se toma la primera línea)" },
        },
        required: ["tema", "titulo", "texto"],
      },
    },
    {
      name: "cerebro_consultar",
      pack: "cerebro",
      cheap: true,
      description:
        "Consulta el CEREBRO: enruta tu pregunta por tema/título/contexto y devuelve SOLO las entradas pertinentes (no todo el cerebro). Úsala antes de ponerte a trabajar para recuperar decisiones o patrones ya aprendidos sobre este proyecto o este usuario.",
      parameters: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "qué quieres recordar / sobre qué tema" },
          max: { type: "number", description: "máximo de entradas a traer (por defecto 4)" },
        },
        required: ["consulta"],
      },
    },
    {
      name: "abrir_previsualizador",
      pack: "cerebro",
      cheap: true,
      description:
        "Abre el PREVISUALIZADOR/sandbox de la IDE y lo deja a la vista con la web/app ya cargada y funcionando. Úsala cuando acabes de entregar o modificar una web/app y quieras que el usuario la vea de inmediato, sin que tenga que abrir el editor web a mano. Arranca el sandbox si hace falta y refresca la vista.",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string", description: "por qué se abre (opcional, ej: 'web lista para revisar')" },
        },
        required: [],
      },
    },
  ],
};

/** Registra todos los packs integrados. Idempotente. */
export function registerBuiltinPacks(): void {
  registerToolPack(CORE_PACK);
  registerToolPack(PC_PACK);
  registerToolPack(GIT_PACK);
  registerToolPack(WEB_PACK);
  registerToolPack(DATA_PACK);
  registerToolPack(SISTEMA_PACK);
  registerToolPack(CEREBRO_PACK);
}

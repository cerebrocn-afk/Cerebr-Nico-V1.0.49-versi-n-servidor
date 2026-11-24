/**
 * aduanaModelos.ts — LA ADUANA ÚNICA DE MODELOS — v1.77.0
 * ========================================================
 * EL DEFECTO QUE CURA (medido por Mario sobre v1.76.0, 26/10): «muchos modelos
 * de Ollama no aparecen» — su `ollama ls` marca 47 y el selector muestra 42.
 * La causa no es un misterio: el filtro anti-chat estaba DUPLICADO en dos
 * lugares que ya HABÍAN DIVERGIDO — `server/routers/diagnostico.ts` (proxy)
 * incluye la regla FIM de v1.60.20 y el filtro inline de `src/App.tsx` no; y
 * peor, ambos filtros eran un CALLEJÓN SIN SALIDA: los modelos filtrados
 * desaparecían sin dejar rastro (ni rol, ni motivo, ni forma de usarlos).
 *
 * LA SOLUCIÓN (la receta de la casa, v1.70.6): una sola capa pura con criterio
 * y auditoría, y UI honesta:
 *   · `clasificarModeloOllama` decide el ROL con patrones anclados a
 *     separadores — nunca substring suelto: «embeddinggemma» SÍ es embedding
 *     (separa '-' antes de 'gemma'… vía prefijo) pero «combine», «member» o
 *     «Ambient» NO lo son (falso positivo medido de la regex `/embed/i` suelta).
 *   · `auditarListaOllama` particiona la lista COMPLETA conservando el orden
 *     de Ollama y confesando el motivo por nombre excluido — «lista honesta
 *     de lo excluido», el mismo principio de exportarContexto v1.57.19.
 *   · `validarUrlServidorCustom` traduce «no hay carpeta de la API unificada» a un hecho
 *     accionable: una carpeta no es un endpoint; se necesita http(s)://host[:puerto][/ruta].
 *
 * Pura: sin red, sin fs, sin estado global.
 */

export type RolModeloOllama = "chat" | "embeddings" | "fim";

export interface ClasificacionModelo {
  rol: RolModeloOllama;
  motivo: string;
}

// Patrones ANCLADOS a separadores (^ $ - _ : .). La lista vieja usaba
// /embed/i a secas: cualquier palabra que contuviera «embed» (un futuro
// «embedder-70b» de chat) moría filtrada. Acá cada señal es un TOKEN o un
// prefijo/sufijo morfológico real del nombre de modelo.
const SENAL_EMBEDDINGS: RegExp[] = [
  /(^|[-_.:])embed/i,        // embeddinggemma-2, qwen3-embedding, snowflake-arctic-embed
  /(^|[-_.:])e5([-.:]|$|b|small|large)/i,
  /nomic-embed/i,
  /(^|[-_.:])bge([-_.:]|$|m|large)/i,
  /(^|[-_.:])minilm/i,       // all-minilm:22m/33m
  /sentence/i,
  /similarity/i,
  /mxbai-embed|nvl-embed|jina-embed|cosmos-embed/i,
];
const SENAL_FIM: RegExp[] = [
  /(^|[-_.:])fim([-_.:]|$)/i, // la regla de v1.60.20, ahora en UN solo lugar
  /fill.?in.?the.?middle/i,
  /code.?completion/i,
];

/** Rol de un modelo de Ollama por nombre. Desconocido = chat (presuntiva
 *  honesta: Ollama no anuncia el rol en /api/tags; si un chat se parece a un
 *  embed, mejor dejarlo vivo y fallar explícito que esconderlo). */
export function clasificarModeloOllama(nombre: string): ClasificacionModelo {
  const n = String(nombre || "").trim();
  for (const re of SENAL_EMBEDDINGS) if (re.test(n)) return { rol: "embeddings", motivo: "embedding (no responde chat; útil para memoria vectorial)" };
  for (const re of SENAL_FIM) if (re.test(n)) return { rol: "fim", motivo: "autocompletado FIM (no responde chat)" };
  return { rol: "chat", motivo: "" };
}

/* ══════════════════════════════════════════════════════════════════════════
   v2.3.2 · LA DECLARACIÓN EXPLÍCITA DEL USUARIO (pedido 4/11)
   ══════════════════════════════════════════════════════════════════════════
   El usuario tiene, entre otros:

     L1_arctic:latest        45 MB   ← es un snowflake-arctic-embed:22m copiado
     L1_arctic22m:latest     45 MB   ← y renombrado por él, hace semanas
     bonsai-2:2b / :4b               ← familia que ninguna señal pisa

   Ninguno lleva la palabra `embed` ni `minilm` en el nombre, así que esta aduana
   —que clasifica **por nombre porque Ollama no anuncia el rol en /api/tags**— los
   devuelve `chat`. De ahí el «algunos no los reconoce» literal: no es que la lista
   se lea mal, es que un alias renombrado **no tiene forma de reconocerse**. Nadie
   puede adivinar que adentro de `L1_arctic` hay un vectorizador, y adivinarlo
   sería peor: el día que `L1_arctic` sea un chat, la aduana miente sola.

   LA SALIDA: que el dueño del árbol lo declare. `CN_EMBEDS_EXTRA` lista los
   nombres que EL USUARIO afirma que son embeddings; `CN_CHAT_EXTRA` los que
   afirma que responden chat. La precedencia es la de la casa: **la palabra del
   usuario le gana a la conjetura del regex**, y el `motivo` nombra la variable
   para que en el panel se pueda leer por qué ese modelo quedó de cada lado
   (mismo criterio con el que `resolverEmbedder` ya dice por qué eligió un
   embedder u otro). Sin variable declarada, comportamiento idéntico al de hoy.

   Por qué vive ACÁ y no en `embedderResidencia` como decía el plan: esta función
   es la dueña única del rol — la consume el selector de chat
   (`ModelSelectorModal:585`), el ensambchado (`aduanaForja:159`), el diagnóstico
   (`diagnostico.ts:392`) y el resolutor del cerebro (`embedderResidencia:155`).
   Poner la allowlist en el resolutor crearía el defecto que la casa persigue:
   dos dueños para una misma verdad, con la lista de chat y la de embeddings
   contradiciéndose en la misma pantalla.
   */

export interface Declarados {
  /** Nombres que el usuario declara embeddings (`CN_EMBEDS_EXTRA`). */
  embeddings?: string[];
  /** Nombres que el usuario declara chat (`CN_CHAT_EXTRA`): deshacen un falso positivo. */
  chat?: string[];
}

/** `embeddings` / `chat` ya normalizados. Tolera `,`, `;`, espacios y saltos. */
export function parsearDeclarados(bruto?: string | null): { embeddings: string[]; chat: string[] } {
  const partes = (s?: string | null) =>
    String(s || "")
      .split(/[,;\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length > 0);
  return { embeddings: partes(bruto), chat: [] };
}

/** Los dos lados de la declaración, leídos de una vez (para el que arma el entorno). */
export function declaradosDesde(cnEmbedsExtra?: string | null, cnChatExtra?: string | null): Declarados {
  const e = parsearDeclarados(cnEmbedsExtra).embeddings;
  const c = String(cnChatExtra || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { embeddings: e, chat: c };
}

/** Comparación tolerante: `L1_arctic` ataja a `L1_arctic:latest` (raíz sin etiqueta). */
function estaDeclarado(nombre: string, lista: string[]): boolean {
  const n = String(nombre || "").trim().toLowerCase();
  if (!n || lista.length === 0) return false;
  const raiz = n.replace(/:[^:]+$/, "");
  return lista.some((d) => d === n || d === raiz || d.replace(/:[^:]+$/, "") === raiz || d.replace(/:[^:]+$/, "") === n);
}

/**
 * Un clasificador con la declaración del usuario por delante del regex.
 * Sin `declarados` vacíos devuelve EXACTAMENTE lo mismo que `clasificarModeloOllama`,
 * así que los cuatro consumidores viejos no cambian de comportamiento por arte de
 * magia: cambian solo cuando alguien declaró algo.
 */
export function crearClasificador(declarados?: Declarados | null): (nombre: string) => ClasificacionModelo {
  const emb = (declarados?.embeddings || []).map((x) => String(x).toLowerCase());
  const chat = (declarados?.chat || []).map((x) => String(x).toLowerCase());
  return (nombre: string): ClasificacionModelo => {
    // El orden importa: si el usuario declaró las dos cosas (config roto), gana
    // «chat» — es la presuntiva honesta de arriba llevada a la declaración: un
    // modelo de chat colado como embedder devuelve basura al cerebro vectorial.
    if (estaDeclarado(nombre, chat)) return { rol: "chat", motivo: "declarado por el usuario en CN_CHAT_EXTRA" };
    if (estaDeclarado(nombre, emb)) return { rol: "embeddings", motivo: "declarado por el usuario en CN_EMBEDS_EXTRA" };
    return clasificarModeloOllama(nombre);
  };
}

export interface AuditoriaListaOllama {
  /** Todos, con su rol — el orden de `ollama ls` se conserva. */
  todos: Array<{ name: string; rol: RolModeloOllama; motivo: string }>;
  /** Subconjunto usable en el selector de chat (orden conservado). */
  chat: string[];
  /** Lo excluido, NOMBRADO con su motivo — cero desapariciones silenciosas. */
  excluidos: Array<{ name: string; rol: RolModeloOllama; motivo: string }>;
  conteo: { total: number; chat: number; embeddings: number; fim: number };
}

/** Partición auditable de la lista de `/api/tags`. Nombres vacíos se cuentan
 *  igual (entrada hostil: `["", null, "x"]` no revienta ni desaparece). */
export function auditarListaOllama(
  nombres: Array<string | null | undefined>,
  /** v2.3.2 · la declaración del usuario (`CN_EMBEDS_EXTRA` / `CN_CHAT_EXTRA`).
   *  Opcional y vacía por default: sin declaración, la partición es la de siempre. */
  declarados?: Declarados | null,
): AuditoriaListaOllama {
  const todos: AuditoriaListaOllama["todos"] = [];
  const chat: string[] = [];
  const excluidos: AuditoriaListaOllama["excluidos"] = [];
  let emb = 0, fim = 0;
  for (const bruto of nombres || []) {
    const name = String(bruto || "").trim();
    if (!name) continue; // no hay forma honesta de listar un nombre vacío: se ignora, no se inventa
    const c = crearClasificador(declarados)(name);
    todos.push({ name, rol: c.rol, motivo: c.motivo });
    if (c.rol === "chat") chat.push(name);
    else {
      excluidos.push({ name, rol: c.rol, motivo: c.motivo });
      if (c.rol === "embeddings") emb++; else fim++;
    }
  }
  return { todos, chat, excluidos, conteo: { total: todos.length, chat: chat.length, embeddings: emb, fim } };
}

export interface ValidacionUrlCustom {
  ok: boolean;
  /** URL lista para fetch (sin /final) o texto de por qué no. */
  url?: string;
  error?: string;
}

/**
 * Aduana de la ranura Custom: un endpoint OpenAI-compatible es `http(s)://…`;
 * una carpeta de Windows/UNIX NO (el error crudo de fetch llegaba sin decir
 * qué revisar — queja de Mario 26/10: «no hay ninguna carpeta de modelos»).
 */
export function validarUrlServidorCustom(valor: unknown): ValidacionUrlCustom {
  const s = String(valor ?? "").trim();
  if (!s) return { ok: false, error: "La ranura «Servidor personalizado» está vacía. Escribí la URL del endpoint, no una carpeta." };
  const esRutaWindows = /^[a-zA-Z]:[\\/]/.test(s);
  const esRutaUnix = s.startsWith("\\\\") || (s.startsWith("/") && !/^\/\//.test(s) && !s.startsWith("//"));
  const sinProtocolo = /^[^:/]+:[^/]/.test(s) && !/^https?:\/\//i.test(s) && !s.includes("://");
  if (esRutaWindows || esRutaUnix || /(^|[\\/])(users|program files)[\\/]/i.test(s)) {
    return {
      ok: false,
      error: `«${s.slice(0, 120)}» es una RUTA de carpeta, y una carpeta no es un endpoint: no hay nada para abrir. La API unificada se configura con la URL de su API OpenAI-compatible (algo como http://127.0.0.1:8000/v1 o https://…/v1), que va en la ranura «URL» de Ranuras de API Keys.`,
    };
  }
  if (!/^https?:\/\//i.test(s)) {
    if (sinProtocolo) return { ok: false, error: `«${s.slice(0, 120)}» no es una URL: falta el prefijo http:// o https://.` };
    return { ok: false, error: `«${s.slice(0, 120)}» no es una URL http(s). Ejemplo: https://api.groq.com/openai/v1` };
  }
  try {
    const u = new URL(s);
    if (!u.hostname) return { ok: false, error: `«${s.slice(0, 120)}» no tiene host.` };
    return { ok: true, url: s.replace(/\/+$/, "") };
  } catch {
    return { ok: false, error: `«${s.slice(0, 120)}» no parsea como URL.` };
  }
}

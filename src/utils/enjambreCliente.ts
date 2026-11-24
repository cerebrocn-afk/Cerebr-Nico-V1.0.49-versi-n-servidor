/**
 * enjambreCliente.ts — EL CHAT LE HABLA AL ENJAMBRE (v1.80.0)
 * ==========================================================
 * QUÉ ES: la mano del navegador cuando el modelo elegido es `cerebro/auto`.
 * Arma la lista de voces con lo que el usuario REALMENTE tiene cargado (⭐
 * Favoritos + los modelos de la API unificada + el proveedor con clave), pide el
 * informe a `POST /api/enjambre/consultar` y lo devuelve listo para el chat.
 *
 * POR QUÉ LAS VOCES SE ARMAN ACÁ Y NO EN EL SERVIDOR: el servidor no tiene las
 * claves —viajan desde el navegador en cada pedido, igual que `/api/ai/stream`—.
 * Tampoco conoce los favoritos: viven en este navegador. Decidir «a quién llamo»
 * sin esos datos sería adivinar, y adivinar en el enjambre cuesta N cuotas.
 *
 * HONESTIDAD: si no hay voces, no se finge un consenso. Se devuelve el motivo y
 * el usuario ve por qué (`error` + `descartes`), igual que en el resto de la IDE.
 */
import { MODELO_CEREBRO_AUTO, type VozPlana } from "../engine/enjambreEclectico";
// v1.84.5 · la memoria que sube al enjambre comprime sus propios informes con
// la MISMA regla que la pantalla (resumen + veredicto): una verdad, una función.
import { dividirEclectica } from "./chatResultados";

// ───────────────────────────────────────────────────────────────────────────
// v1.84.5 · LA MEMORIA QUE LA MOCHILA CARGA (Mario: «los modelos se olvidan de
// qué estaban haciendo unos mensajes atrás; no pueden usar las imágenes»).
// El enjambre recibía SOLO el mensaje de ahora. Estas dos funciones preparan
// la mochila desde el estado vivo del chat, con las mismas reglas que la ruta
// normal (engine.ts manda historial e imágenes al modelo elegido):
//   · los INFORMES ECLÉCTICOS previos viajan comprimidos a lo que el usuario
//     vio (resumen + veredicto, vía `dividirEclectica`): mandarle a una voz la
//     tabla de voces de otro turno es ruido caro;
//   · el ruido del chat (marcadores «⊕⊕ …no contestó», avisos de error) queda
//     FUERA: reeducar a las voces con mensajes de sistema es justo lo que hacía
//     parecer al historial «alterado»;
//   · las imágenes del MENSAJE ACTUAL viajan en base64 puro (los píxeles de
//     turnos pasados no: pesan y la voz no los pidió; sus nombres quedan en el
//     texto del turno).
// ───────────────────────────────────────────────────────────────────────────

/** Comprime un mensaje guardado al turno de memoria que verá el enjambre. */
const TURNO_RUIDO_CLIENTE = /^\s*(⊕⊕|⚠️?\s*Error de comunicaci|⚠️?\s*.*no pudo consensuar|⚠️?\s*.*no llegó a un consens|⏹)/;

export function turnoParaMemoria(m: {
  role?: string;
  content?: string;
  status?: string;
  attachments?: Array<{ name?: string; type?: string }>;
}): { rol: string; texto: string } | null {
  const rol = String(m.role || "");
  if (rol !== "user" && rol !== "assistant") return null;
  if (m.status === "error") return null;
  let texto = String(m.content || "").trim();
  if (!texto) return null;
  // Misma regla que el motor (TURNO_RUIDO en enjambreEclectico): marcadores y
  // avisos de error NO reeducan a las voces. Doble red a propósito: el motor
  // también filtra, para que un orquestador directo no traiga la basura.
  if (TURNO_RUIDO_CLIENTE.test(texto)) return null;
  if (rol === "assistant" && /^\s*🎭\s*RESPUESTA ECLÉCTICA/i.test(texto)) {
    // Informe del propio enjambre: las voces leen lo que leyó el usuario.
    texto = dividirEclectica(texto)?.resolucion || texto.slice(0, 900);
  }
  const atts = (m.attachments || []).map((a) => String(a?.name || "").trim()).filter(Boolean);
  if (rol === "user" && atts.length) {
    texto = `${texto}\n[el usuario adjuntó: ${atts.slice(0, 12).join(", ")}]`;
  }
  return { rol, texto };
}

/** Los turnos previos al actual, ya aptos para la mochila. */
export function historialParaEnjambre(
  mensajes: Array<{ role?: string; content?: string; status?: string; attachments?: any[] }>,
  hastaId?: string
): Array<{ rol: string; texto: string }> {
  const antes = hastaId ? mensajes.filter((m: any) => m?.id !== hastaId) : mensajes;
  return antes.map(turnoParaMemoria).filter((t): t is { rol: string; texto: string } => t !== null);
}

/** Imágenes del mensaje actual, en el idioma del proveedor (base64 puro). */
export function imagenesParaEnjambre(attachments: Array<{ name?: string; type?: string; base64Data?: string; isImage?: boolean }>): Array<{ nombre: string; tipo: string; esImagen: boolean; base64?: string }> {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((a) => a && (a.isImage || /^image\//i.test(String(a.type || ""))) && typeof a.base64Data === "string" && a.base64Data.startsWith("data:"))
    .slice(0, 4)
    .map((a) => {
      const m = /^data:([^;]+);base64,(.*)$/.exec(a.base64Data as string);
      return {
        nombre: String(a.name || "imagen"),
        tipo: m ? m[1] : String(a.type || "image/png"),
        esImagen: true,
        base64: m ? m[2] : undefined,
      };
    });
}

export interface MochilaEnjambre {
  /** v2.3.6 · ranura de voz del ecléctico (lo que el usuario elige que conteste). */
  vocesFijas?: Array<{ provider: string; modelId: string; name?: string }>;
  tarea: string;
  /** v1.84.5 · memoria de la sesión (turnos previos comprimidos). */
  historial?: Array<{ rol: string; texto: string }>;
  /** v1.84.5 · archivos del mensaje actual (imágenes en base64 puro). */
  adjuntos?: Array<{ nombre: string; tipo: string; esImagen: boolean; base64?: string }>;
  favoritos: Array<{ provider: string; modelId: string; name?: string; enabled?: boolean }>;
  /** Modelos detectados en la ranura de la API unificada (proveedor `custom`). */
  unificados?: string[];
  tieneClave: Record<string, boolean>;
  claves: Record<string, string | undefined>;
  customUrl?: string;
  customKey?: string;
  ollamaUrl?: string;
  /** El modelo elegido: si es `cerebro/auto`, la voz real se busca aparte. */
  actual?: { provider: string; model: string } | null;
  /** Quién integra: se prefiere un cloud con clave; si no, manda la voz más sólida. */
  juez?: { provider: string; modelId: string } | null;
  incluirLocales?: boolean;
  maximas?: number;
}

export interface ResultadoEnjambre {
  ok: boolean;
  informe?: string;
  error?: string;
  voces?: any[];
  veredicto?: any;
  acuerdo?: number;
  /** Cuántas voces contestaron con materia utilizable (el veredicto escala con esto). */
  respondieron?: number;
  /** true si el enjambre tuvo que contestar con una sola voz de respaldo. */
  respaldo?: boolean;
  descartes?: Array<{ modelId: string; razon: string }>;
  motivo?: string;
  porDebajoDelMinimo?: boolean;
}

/**
 * Las voces que entran al enjambre. Reglas (las mismas del criterio puro, acá
 * solo se alimentan con datos del navegador):
 *  · el orden manda: primero lo que el usuario puso en ⭐ Favoritos;
 *  · después los modelos de la API unificada, que por diseño traen varios
 *    proveedores detrás;
 *  · `cerebro/auto` nunca es voz de sí mismo (sería un eco de espejo: se descarta).
 */
/**
 * v2.3.6 · LA RANURA DE VOZ VIAJA POR EL MISMO FILTRO.
 * Reusa `vocesDelUsuario` cambiándole la fuente: así el filtro de basura (sin
 * provider, sin modelo, `cerebro/…`, duplicados) tiene UN solo dueño. Duplicar el
 * filtro para la ranura nueva es la receta para que un día los dos caminos
 * discrepen sobre qué modelo existe.
 */
export function vocesFijasDelUsuario(m: MochilaEnjambre): VozPlana[] {
  return vocesDelUsuario({ ...m, favoritos: (m.vocesFijas || []) as any });
}

export function vocesDelUsuario(m: MochilaEnjambre): VozPlana[] {
  const out: VozPlana[] = [];
  const empuja = (v: VozPlana | null | undefined) => {
    if (!v || !v.provider || !v.modelId) return;
    const id = String(v.modelId).trim().toLowerCase();
    if (!id || id.startsWith("cerebro/")) return;
    if (out.some((x) => x.provider === v.provider && x.modelId.toLowerCase() === id)) return;
    out.push({ provider: v.provider, modelId: String(v.modelId).trim(), name: v.name });
  };
  for (const f of m.favoritos || []) {
    if (f && f.enabled !== false) empuja({ provider: f.provider, modelId: f.modelId, name: f.name });
  }
  for (const id of m.unificados || []) empuja({ provider: "custom", modelId: id });
  if (m.actual && !String(m.actual.model).startsWith("cerebro/")) {
    empuja({ provider: m.actual.provider, modelId: m.actual.model });
  }
  return out;
}

/** Un juez razonable: el cloud con clave más barato de mantener despierto. */
export function sugerirJuez(m: MochilaEnjambre): { provider: string; modelId: string } | null {
  const preferidos: Array<[string, string]> = [
    ["custom", (m.unificados || [])[0] || ""],
    ["zai", "glm-4.7-flash"],
    ["groq", "llama-3.3-70b-versatile"],
    ["openrouter", "deepseek/deepseek-r1-0528:free"],
    ["gemini", "gemini-2.5-flash"],
  ];
  for (const [provider, model] of preferidos) {
    if (!model) continue;
    if (provider === "custom" ? m.tieneClave.custom === true : m.tieneClave[provider] === true) {
      return { provider, modelId: model };
    }
  }
  return null;
}

/**
 * Consulta el enjambre. Nunca lanza: si algo falla devuelve `ok:false` con el
 * motivo para que el chat lo muestre tal cual.
 */
export async function consultarEnjambre(m: MochilaEnjambre, senal?: AbortSignal): Promise<ResultadoEnjambre> {
  const voces = vocesDelUsuario(m);
  const elegidoUsable = m.actual && !String(m.actual.model || "").startsWith("cerebro/") && String(m.actual.model || "").trim();
  if (voces.length === 0 && !elegidoUsable) {
    return {
      ok: false,
      error:
        "El enjambre no tiene a quién hablarle: no hay modelos en ⭐ Favoritos, ni en la API unificada, ni un modelo elegido. Marcá uno con ⭐ en el selector o cargá la URL de tu endpoint en «Ranuras de API Keys».",
    };
  }
  try {
    const r = await fetch("/api/enjambre/consultar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: senal,
      body: JSON.stringify({
        tarea: m.tarea,
        // v1.84.5 · memoria e imágenes del turno (el router decide qué hace
        // con ellas; aquí solo se cargan en la mochila).
        historial: m.historial || [],
        adjuntos: m.adjuntos || [],
        voces,
        // v2.3.6 · la ranura de voz del usuario (los que él elige que hablen).
        vocesFijas: vocesFijasDelUsuario(m),
        tieneClave: m.tieneClave,
        actual: m.actual && !String(m.actual.model).startsWith("cerebro/") ? m.actual : null,
        juez: m.juez ?? sugerirJuez(m),
        incluirLocales: m.incluirLocales === true,
        maximas: m.maximas,
        credenciales: {
          ollamaUrl: m.ollamaUrl,
          keys: m.claves,
          customUrl: m.customUrl || "",
          customKey: m.customKey || "",
        },
      }),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) {
      const desc = Array.isArray(j?.descartes) && j.descartes.length ? ` Descartes: ${j.descartes.slice(0, 3).map((d: any) => `${d.modelId} (${d.razon})`).join(" · ")}.` : "";
      return { ok: false, error: `${String(j?.error || `HTTP ${r.status}`)}${desc}`, descartes: j?.descartes };
    }
    return {
      ok: true,
      informe: String(j.informe || ""),
      voces: j.voces,
      veredicto: j.veredicto,
      acuerdo: Number(j.acuerdo) || 0,
      respondieron: Number(j.respondieron) || 0,
      respaldo: j.respaldo === true,
      descartes: j.descartes,
      motivo: j.motivo,
      porDebajoDelMinimo: j.porDebajoDelMinimo === true,
    };
  } catch (e: any) {
    return { ok: false, error: `No se pudo hablar con el enjambre: ${String(e?.message || e).slice(0, 160)}` };
  }
}

export { MODELO_CEREBRO_AUTO };

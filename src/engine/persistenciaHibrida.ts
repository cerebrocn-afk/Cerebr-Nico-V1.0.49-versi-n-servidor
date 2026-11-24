/**
 * persistenciaHibrida.ts — FUSIÓN Y SANEAMIENTO DE SESIÓN HÍBRIDA (v1.0.41)
 * =========================================================================
 * Módulo PURO (sin Node builtins ni DOM): define la estructura compartida
 * entre el navegador (`localStorage`/IndexedDB) y el servidor
 * (`<raizDatos>/.cerebro-db/persistencia-sesion.json`), además de las reglas
 * deterministas de fusión para que chats guardados, lecciones aprendidas,
 * métricas y el workspace previo nunca se pierdan ni se dupliquen entre
 * recargas o sesiones remotas.
 *
 * REGLA DE SEGURIDAD: este módulo JAMÁS guarda ni propaga claves API ni
 * credenciales (`GEMINI_API_KEY`, tokens, etc.). Cualquier campo sospechoso
 * se descarta en `sanearSnapshotPersistencia`.
 */

import type { ChatMessage, SavedChat, WorkspaceFile } from "../types";

export interface LeccionPersistida {
  id: string;
  kind: string;
  text: string;
  tags: string[];
  used: number;
  helped: number;
  createdAt: number;
  lastUsedAt?: number;
  weight: number;
}

export interface MetricaPersistida {
  at: number;
  provider: string;
  model: string;
  firstTokenMs?: number;
  totalMs: number;
  tokensOut?: number;
  tokensIn?: number;
  tokPorSegundo?: number;
  medidaExacta?: boolean;
  ok: boolean;
  failureKind?: string;
  tier?: string;
  attempts?: number;
}

/**
 * v1.0.44 · LA LÁPIDA DE UN CHAT BORRADO.
 * Una unión por `id` no sabe distinguir «no lo tengo» de «lo borré»: por eso el
 * chat volvía en cada arranque (regla del 21/11 de Mario: «los borro y siguen
 * estando, y se van acumulando»). La lápida dice cuándo se borró; cualquier
 * copia con `updatedAt` ANTERIOR a esa fecha se descarta. Una copia más nueva
 * (por ejemplo, el mismo hilo re-archivado después) sí sobrevive: borrar no es
 * una condena eterna, es una decisión con fecha.
 */
export interface EliminacionChat {
  id: string;
  at: number;
}

export interface SnapshotPersistencia {
  version: number;
  updatedAt: number;
  modoArranque?: "vacio" | "restaurar";
  activeChatTitle?: string;
  savedChats: SavedChat[];
  /** v1.0.44 · chats borrados por el usuario, con la fecha del borrado. */
  chatsEliminados: EliminacionChat[];
  lessons: LeccionPersistida[];
  turnMetrics: MetricaPersistida[];
  workspacePrevio: WorkspaceFile[];
}

export type EstadoSincronizacion = "pendiente" | "sincronizando" | "hibrido" | "solo-local";

export const LIMITES_PERSISTENCIA = {
  maxChats: 60,
  maxMensajesPorChat: 200,
  maxLecciones: 120,
  maxMetricas: 400,
  maxArchivosPrevios: 150,
  maxBytesArchivo: 400_000,
} as const;

export function crearSnapshotVacio(): SnapshotPersistencia {
  return {
    version: 1,
    updatedAt: 0,
    savedChats: [],
    chatsEliminados: [],
    lessons: [],
    turnMetrics: [],
    workspacePrevio: [],
  };
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

function sanearMensaje(raw: unknown): ChatMessage | null {
  if (!esObjeto(raw)) return null;
  const role = raw.role === "user" || raw.role === "assistant" || raw.role === "system" ? raw.role : null;
  if (!role || typeof raw.content !== "string") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.slice(0, 120) : `msg-${Number(raw.timestamp) || Date.now()}`;
  return {
    id,
    role,
    content: raw.content.slice(0, 200_000),
    timestamp: Number(raw.timestamp) || Date.now(),
    ...(typeof raw.modelUsed === "string" ? { modelUsed: raw.modelUsed.slice(0, 120) } : {}),
    ...(typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) ? { durationMs: raw.durationMs } : {}),
    ...(typeof raw.tokensPerSecond === "number" && Number.isFinite(raw.tokensPerSecond) ? { tokensPerSecond: raw.tokensPerSecond } : {}),
    ...(raw.status === "streaming" || raw.status === "done" || raw.status === "error" ? { status: raw.status } : {}),
  };
}

function sanearChat(raw: unknown): SavedChat | null {
  if (!esObjeto(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 120) : "";
  if (!id) return null;
  const crudos = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = crudos
    .slice(-LIMITES_PERSISTENCIA.maxMensajesPorChat)
    .map(sanearMensaje)
    .filter((m): m is ChatMessage => m !== null);
  if (messages.length === 0) return null;
  return {
    id,
    title: (typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Chat guardado").slice(0, 160),
    createdAt: Number(raw.createdAt) || messages[0].timestamp || Date.now(),
    updatedAt: Number(raw.updatedAt) || messages[messages.length - 1].timestamp || Date.now(),
    messages,
  };
}

function sanearLeccion(raw: unknown): LeccionPersistida | null {
  if (!esObjeto(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 120) : "";
  const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 240) : "";
  if (!id || text.length < 4) return null;
  const kind = typeof raw.kind === "string" && raw.kind.trim() ? raw.kind.trim().slice(0, 60) : "entorno";
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, 20)
    : [];
  const weight = typeof raw.weight === "number" && Number.isFinite(raw.weight) ? Math.min(1, Math.max(0, raw.weight)) : 0.6;
  return {
    id,
    kind,
    text,
    tags,
    used: Math.max(0, Number(raw.used) || 0),
    helped: Math.max(0, Number(raw.helped) || 0),
    createdAt: Number(raw.createdAt) || Date.now(),
    ...(typeof raw.lastUsedAt === "number" && Number.isFinite(raw.lastUsedAt) ? { lastUsedAt: raw.lastUsedAt } : {}),
    weight,
  };
}

function sanearMetrica(raw: unknown): MetricaPersistida | null {
  if (!esObjeto(raw)) return null;
  const at = Number(raw.at);
  const totalMs = Number(raw.totalMs);
  if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(totalMs) || totalMs < 0) return null;
  const provider = typeof raw.provider === "string" ? raw.provider.slice(0, 60) : "gemini";
  const model = typeof raw.model === "string" ? raw.model.slice(0, 120) : "";
  if (!model) return null;
  return {
    at,
    provider,
    model,
    totalMs,
    ok: raw.ok === true,
    ...(typeof raw.firstTokenMs === "number" && Number.isFinite(raw.firstTokenMs) ? { firstTokenMs: raw.firstTokenMs } : {}),
    ...(typeof raw.tokensOut === "number" && Number.isFinite(raw.tokensOut) ? { tokensOut: raw.tokensOut } : {}),
    ...(typeof raw.tokensIn === "number" && Number.isFinite(raw.tokensIn) ? { tokensIn: raw.tokensIn } : {}),
    ...(typeof raw.tokPorSegundo === "number" && Number.isFinite(raw.tokPorSegundo) ? { tokPorSegundo: raw.tokPorSegundo } : {}),
    ...(typeof raw.medidaExacta === "boolean" ? { medidaExacta: raw.medidaExacta } : {}),
    ...(typeof raw.failureKind === "string" ? { failureKind: raw.failureKind.slice(0, 40) } : {}),
    ...(typeof raw.tier === "string" ? { tier: raw.tier.slice(0, 40) } : {}),
    ...(typeof raw.attempts === "number" && Number.isFinite(raw.attempts) ? { attempts: raw.attempts } : {}),
  };
}

function sanearArchivoWorkspace(raw: unknown): WorkspaceFile | null {
  if (!esObjeto(raw)) return null;
  const filePath = typeof raw.path === "string" ? raw.path.trim().slice(0, 240) : "";
  const content = typeof raw.content === "string" ? raw.content : null;
  if (!filePath || content === null || content.length > LIMITES_PERSISTENCIA.maxBytesArchivo) return null;
  // Nunca persistir archivos de secretos ni .env reales
  const base = filePath.split("/").pop()?.toLowerCase() || "";
  if (base === ".env" || base === ".env.local" || base.endsWith(".key") || base.endsWith(".pem")) return null;
  const name = (typeof raw.name === "string" && raw.name.trim()) ? raw.name.trim().slice(0, 120) : (filePath.split("/").pop() || filePath);
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.slice(0, 120) : `wf-${filePath}`,
    name,
    path: filePath,
    content,
    language: typeof raw.language === "string" ? raw.language.slice(0, 40) : "text",
    size: content.length,
    modified: Boolean(raw.modified),
  };
}

/**
 * Sanea una entrada arbitraria (disco, HTTP o localStorage) y descarta campos
 * extraños, secretos o estructuras dañadas. Nunca lanza excepción.
 */
export function sanearSnapshotPersistencia(raw: unknown): SnapshotPersistencia {
  if (!esObjeto(raw)) return crearSnapshotVacio();
  const modoArranque = raw.modoArranque === "restaurar" || raw.modoArranque === "vacio" ? raw.modoArranque : undefined;
  const activeChatTitle = typeof raw.activeChatTitle === "string" ? raw.activeChatTitle.slice(0, 160) : undefined;

  const chatsCrudos = Array.isArray(raw.savedChats) ? raw.savedChats : [];
  const savedChats = chatsCrudos
    .map(sanearChat)
    .filter((c): c is SavedChat => c !== null)
    .slice(0, LIMITES_PERSISTENCIA.maxChats);

  const eliminadosCrudos = Array.isArray(raw.chatsEliminados) ? raw.chatsEliminados : [];
  const chatsEliminados: EliminacionChat[] = [];
  for (const e of eliminadosCrudos) {
    if (!esObjeto(e)) continue;
    const id = typeof e.id === "string" ? e.id.trim().slice(0, 120) : "";
    const at = Number(e.at);
    if (!id || !Number.isFinite(at) || at <= 0) continue;
    chatsEliminados.push({ id, at });
  }

  const leccionesCrudas = Array.isArray(raw.lessons) ? raw.lessons : [];
  const lessons = leccionesCrudas
    .map(sanearLeccion)
    .filter((l): l is LeccionPersistida => l !== null)
    .slice(0, LIMITES_PERSISTENCIA.maxLecciones);

  const metricasCrudas = Array.isArray(raw.turnMetrics) ? raw.turnMetrics : [];
  const turnMetrics = metricasCrudas
    .map(sanearMetrica)
    .filter((m): m is MetricaPersistida => m !== null)
    .slice(-LIMITES_PERSISTENCIA.maxMetricas);

  const archivosCrudos = Array.isArray(raw.workspacePrevio) ? raw.workspacePrevio : [];
  const workspacePrevio = archivosCrudos
    .map(sanearArchivoWorkspace)
    .filter((f): f is WorkspaceFile => f !== null)
    .slice(0, LIMITES_PERSISTENCIA.maxArchivosPrevios);

  const updatedAt = typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0
    ? raw.updatedAt
    : 0;

  return {
    version: 1,
    updatedAt,
    ...(modoArranque ? { modoArranque } : {}),
    ...(activeChatTitle !== undefined ? { activeChatTitle } : {}),
    savedChats,
    chatsEliminados: fusionarEliminaciones(chatsEliminados, []),
    lessons,
    turnMetrics,
    workspacePrevio,
  };
}

/** Une dos listas de lápidas: por `id` manda la fecha de borrado MÁS RECIENTE. */
export function fusionarEliminaciones(
  local: EliminacionChat[],
  remoto: EliminacionChat[]
): EliminacionChat[] {
  const mapa = new Map<string, number>();
  for (const e of [...remoto, ...local]) {
    if (!e?.id) continue;
    mapa.set(e.id, Math.max(mapa.get(e.id) || 0, Number(e.at) || 0));
  }
  return [...mapa.entries()]
    .map(([id, at]) => ({ id, at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, LIMITES_PERSISTENCIA.maxChats * 4);
}

/**
 * Fusiona dos listas de chats guardados por `id`, conservando la versión con mayor `updatedAt` (o más mensajes en empate).
 *
 * v1.0.44 · Y DESPUÉS APLICA LAS LÁPIDAS. Sin esto la fusión era una unión y el
 * chat borrado volvía desde el disco (o desde IndexedDB) en cada arranque. Se
 * descarta solo la copia anterior al borrado: si el hilo se vuelve a archivar
 * después, tiene `updatedAt` mayor y se queda.
 */
export function fusionarChatsGuardados(
  local: SavedChat[],
  remoto: SavedChat[],
  eliminados: EliminacionChat[] = []
): SavedChat[] {
  const mapa = new Map<string, SavedChat>();
  const insertar = (c: SavedChat) => {
    const prev = mapa.get(c.id);
    if (!prev) {
      mapa.set(c.id, c);
      return;
    }
    const diffAt = (c.updatedAt || 0) - (prev.updatedAt || 0);
    if (diffAt > 0 || (diffAt === 0 && c.messages.length > prev.messages.length)) {
      mapa.set(c.id, c);
    }
  };
  for (const c of remoto) insertar(c);
  for (const c of local) insertar(c);
  const lapida = new Map(eliminados.filter((e) => e?.id).map((e) => [e.id, Number(e.at) || 0]));
  return [...mapa.values()]
    .filter((c) => (c.updatedAt || 0) > (lapida.get(c.id) || 0))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, LIMITES_PERSISTENCIA.maxChats);
}

/** Fusiona lecciones por `id` (y evita duplicar texto idéntico), conservando los contadores y fechas más altos. */
export function fusionarLecciones(
  local: LeccionPersistida[],
  remoto: LeccionPersistida[]
): LeccionPersistida[] {
  const porId = new Map<string, LeccionPersistida>();
  const porTexto = new Set<string>();
  const insertar = (l: LeccionPersistida) => {
    const claveTexto = `${l.kind}:${l.text.toLowerCase()}`;
    const prev = porId.get(l.id);
    if (prev) {
      porId.set(l.id, {
        ...prev,
        used: Math.max(prev.used, l.used),
        helped: Math.max(prev.helped, l.helped),
        weight: Math.max(prev.weight, l.weight),
        lastUsedAt: Math.max(prev.lastUsedAt || 0, l.lastUsedAt || 0) || undefined,
        tags: [...new Set([...prev.tags, ...l.tags])].slice(0, 20),
      });
      return;
    }
    if (porTexto.has(claveTexto)) return;
    porTexto.add(claveTexto);
    porId.set(l.id, l);
  };
  for (const l of local) insertar(l);
  for (const l of remoto) insertar(l);
  return [...porId.values()]
    .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt))
    .slice(0, LIMITES_PERSISTENCIA.maxLecciones);
}

/** Deduplica métricas de turno por clave `(at|provider|model)`. */
export function fusionarMetricas(
  local: MetricaPersistida[],
  remoto: MetricaPersistida[]
): MetricaPersistida[] {
  const mapa = new Map<string, MetricaPersistida>();
  for (const m of [...remoto, ...local]) {
    const k = `${m.at}|${m.provider}|${m.model}`;
    if (!mapa.has(k)) mapa.set(k, m);
  }
  return [...mapa.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-LIMITES_PERSISTENCIA.maxMetricas);
}

/** Combina el snapshot local y el remoto de forma determinista y sin pérdidas. */
export function combinarInstantaneaPersistencia(
  localRaw: unknown,
  remotoRaw: unknown
): SnapshotPersistencia {
  const local = sanearSnapshotPersistencia(localRaw);
  const remoto = sanearSnapshotPersistencia(remotoRaw);
  const localEsMasReciente = local.updatedAt >= remoto.updatedAt;
  const workspacePrevio = localEsMasReciente
    ? (local.workspacePrevio.length > 0 ? local.workspacePrevio : remoto.workspacePrevio)
    : (remoto.workspacePrevio.length > 0 ? remoto.workspacePrevio : local.workspacePrevio);
  const modoArranque = local.modoArranque ?? remoto.modoArranque;
  const activeChatTitle = localEsMasReciente
    ? (local.activeChatTitle ?? remoto.activeChatTitle)
    : (remoto.activeChatTitle ?? local.activeChatTitle);

  const chatsEliminados = fusionarEliminaciones(local.chatsEliminados, remoto.chatsEliminados);

  return {
    version: 1,
    updatedAt: Math.max(local.updatedAt, remoto.updatedAt, Date.now()),
    ...(modoArranque ? { modoArranque } : {}),
    ...(activeChatTitle !== undefined ? { activeChatTitle } : {}),
    savedChats: fusionarChatsGuardados(local.savedChats, remoto.savedChats, chatsEliminados),
    chatsEliminados,
    lessons: fusionarLecciones(local.lessons, remoto.lessons),
    turnMetrics: fusionarMetricas(local.turnMetrics, remoto.turnMetrics),
    workspacePrevio,
  };
}

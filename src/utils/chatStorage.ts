/**
 * CerebroNico IDE - Carpeta de chats guardados (v3.3)
 * ============================================================
 * Lógica pura de la carpeta de chats (sin React): generación de IDs,
 * títulos derivados y archivado. Extraída de App.tsx para que el
 * componente sólo orqueste estado y estos helpers puedan probarse solos.
 */

import type { ChatMessage, SavedChat } from "../types";

/** Título legible a partir del primer mensaje del usuario. */
export function deriveChatTitle(msgs: ChatMessage[]): string {
  const firstUser = msgs.find((m) => m.role === "user");
  if (!firstUser) return "Chat sin título";
  const clean = firstUser.content.replace(/\s+/g, " ").trim();
  if (!clean) return "Adjuntos sin texto";
  return clean.length > 46 ? clean.slice(0, 46) + "…" : clean;
}

/** ID único para un chat guardado. */
export function makeChatId(): string {
  return "chat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
}

/**
 * Construye el SavedChat listo para archivar.
 * Devuelve null si la conversación está vacía (nada que guardar).
 */
export function buildArchivedChat(
  messages: ChatMessage[],
  title?: string
): SavedChat | null {
  if (messages.length === 0) return null;
  return {
    id: makeChatId(),
    title: (title && title.trim()) || deriveChatTitle(messages),
    createdAt: messages[0]?.timestamp || Date.now(),
    updatedAt: messages[messages.length - 1]?.timestamp || Date.now(),
    messages,
  };
}

/**
 * v1.0.44 · LA FIRMA DE UN HILO
 * =============================
 * 🐞 «los borro y se van acumulando» (Mario, 21/11). `buildArchivedChat` crea
 * un id NUEVO cada vez que se archiva, así que abrir un chat guardado archivaba
 * otra vez el hilo actual con otro id: dos copias del mismo contenido, y a la
 * siguiente apertura, tres. La carpeta crecía sola.
 *
 * La firma es la identidad REAL del hilo: sus mensajes (id + rol + longitud).
 * Dos copias con la misma firma son la misma conversación, se llamen como se
 * llamen.
 */
export function firmaDeHilo(messages: ChatMessage[]): string {
  if (!messages.length) return "";
  return messages
    .map((m) => `${m.id || ""}:${m.role}:${(m.content || "").length}`)
    .join("|");
}

/**
 * Archiva el hilo actual SIN duplicar: si ya hay un chat guardado con la misma
 * firma, se actualiza ese (misma id, `updatedAt` nuevo) en vez de crear otro.
 * De paso, el chat recién guardado pasa al frente, que es lo que el usuario
 * espera ver.
 */
export function archivarSinDuplicar(
  previos: SavedChat[],
  messages: ChatMessage[],
  title?: string
): SavedChat[] {
  const archived = buildArchivedChat(messages, title);
  if (!archived) return previos;
  const firma = firmaDeHilo(archived.messages);
  const existente = previos.find((c) => firmaDeHilo(c.messages) === firma);
  if (!existente) return [archived, ...previos];
  const actualizado: SavedChat = {
    ...existente,
    title: archived.title || existente.title,
    updatedAt: Math.max(existente.updatedAt || 0, archived.updatedAt),
    messages: archived.messages,
  };
  return [actualizado, ...previos.filter((c) => c.id !== existente.id)];
}

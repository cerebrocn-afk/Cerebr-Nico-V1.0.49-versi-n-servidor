/**
 * arranqueLimpio.ts — LA VENTANA ABRE VACÍA, Y NADA SE PIERDE (v1.97.0)
 * =====================================================================
 * Queja literal de Mario (30/10, con log y sesión exportada):
 *   «Tenemos un inconveniente cuando comienza/abre la app: arranca siempre con un
 *    proyecto viejo, tiene que por default arrancar vacía — sandbox vacío, editor/árbol
 *    vacío, chat vacío — a no ser que esté guardada sesión de algún chat. No solo eso:
 *    el modelo que empiece queda atrapado en resolver tareas que nunca pedí, que eran de
 *    mensajes anteriores y hasta de versiones anteriores de CerebroNico.»
 *
 * El segundo síntoma es consecuencia del primero: si el hilo viejo vuelve solo, el modelo
 * vuelve a ver «implementar control de ingreso y egreso…» y lo executa como si fuera de hoy.
 *
 * La regla que se implementa acá, en puro, para que se pueda probar sin abrir el navegador:
 *
 *   · El default es ARRANCAR VACÍO: sin hilo, sin árbol, sin sembrar la plantilla.
 *   · Aparcar ≠ borrar. Lo que había se guarda como chat automático
 *     (`⏮ Última sesión…`) y el workspace se mueve a una clave aparte. El usuario recupera
 *     con los caminos que ya existen (panel Chats / «Recuperar workspace anterior»).
 *   · Se respeta la preferencia explícita: si el usuario pidió «seguir donde lo dejé»
 *     (`codigo0_arranque = "restaurar"`), restauramos como antes.
 *   · Idempotente: React puede invocar el inicializador dos veces (StrictMode); la firma del
 *     hilo hace que aparcar dos veces no duplique nada.
 */
import type { ChatMessage, SavedChat, WorkspaceFile } from "../types";

/** Clave de la preferencia. `null`/otro = vacío; `"restaurar"` = volver donde estaba. */
export const CLAVE_ARRANQUE = "codigo0_arranque";
/** Donde se aparca el árbol de la sesión anterior (no se borra, no se pisa). */
export const CLAVE_WORKSPACE_PREVIO = "codigo0_workspace_previo";
export const TITULO_APARCADO = "⏮ Última sesión (guardada al abrir)";
/** Cuántos hilos auto-aparcados se conservan, para no llenar el panel de chat basura. */
export const MAX_APARCADOS = 5;

export type ModoArranque = "vacio" | "restaurar";

export function modoArranque(flag: string | null): ModoArranque {
  return flag === "restaurar" ? "restaurar" : "vacio";
}

/** Firma estable de un hilo: cantidad + primero y último timestamp. Sin recorrer el contenido. */
export function firmaHilo(mensajes: ChatMessage[]): string {
  if (!mensajes || mensajes.length === 0) return "";
  const ultimo = mensajes[mensajes.length - 1];
  return `${mensajes.length}-${mensajes[0]?.timestamp ?? 0}-${ultimo?.timestamp ?? 0}`;
}

export const esChatAparcado = (c: SavedChat) => typeof c?.id === "string" && c.id.startsWith("auto-");

/** Recorta los auto-aparcados al máximo, dejando intactos los chats que guardó el usuario. */
export function recortarAparcados(chats: SavedChat[], max = MAX_APARCADOS): SavedChat[] {
  let vistos = 0;
  return chats.filter((c) => {
    if (!esChatAparcado(c)) return true;
    vistos += 1;
    return vistos <= max;
  });
}

export interface MateriaPrima {
  mensajes: ChatMessage[];
  chats: SavedChat[];
  archivos: WorkspaceFile[];
  modo: ModoArranque;
}

export interface ResultadoArranque {
  mensajes: ChatMessage[];
  chats: SavedChat[];
  archivos: WorkspaceFile[];
  /** true cuando se guardó un hilo de una sesión anterior en el panel de chats. */
  hiloAparcado: boolean;
  /** true cuando el árbol anterior se movió a `CLAVE_WORKSPACE_PREVIO`. */
  workspaceAparcado: boolean;
}

/**
 * La decisión de arranque, PURA: recibe lo que hay en el almacén y devuelve lo que debe
 * mostrar la ventana. No escribe: quien llama escribe lo que devuelve (y así se puede
 * comprobar en seco que aparcar es idempotente).
 */
export function prepararArranque(m: MateriaPrima, ahora: number = Date.now()): ResultadoArranque {
  const mensajes = Array.isArray(m.mensajes) ? m.mensajes : [];
  const chats = Array.isArray(m.chats) ? m.chats : [];
  const archivos = Array.isArray(m.archivos) ? m.archivos : [];

  if (m.modo === "restaurar") {
    return { mensajes, chats, archivos, hiloAparcado: false, workspaceAparcado: false };
  }

  const firma = firmaHilo(mensajes);
  const yaAparcado = firma !== "" && chats.some((c) => c.id === `auto-${firma}`);
  const nuevoChat: SavedChat[] = firma === "" || yaAparcado
    ? []
    : [{ id: `auto-${firma}`, title: TITULO_APARCADO, createdAt: ahora, updatedAt: ahora, messages: mensajes }];

  return {
    mensajes: [],
    chats: recortarAparcados([...nuevoChat, ...chats]),
    archivos: [],
    hiloAparcado: nuevoChat.length > 0,
    // El árbol se aparca solo si había algo; si ya estaba vacío, no se toca la clave previa.
    workspaceAparcado: archivos.length > 0,
  };
}

/** Texto del ítem de menú: solo se ofrece cuando hay algo recuperable. */
export function puedeRecuperarWorkspace(previo: WorkspaceFile[] | null): boolean {
  return Array.isArray(previo) && previo.length > 0;
}

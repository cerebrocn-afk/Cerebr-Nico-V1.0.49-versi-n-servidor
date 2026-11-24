/**
 * interruptoresServicios.ts — QUIÉN MANDA EN LOS PACKS (v2.1.0)
 * ==============================================================
 * El síntoma que trajo este módulo (1/11, con el log de la ventana pegado):
 * «arranque memoria … [memoria] se cerro». La ventana no miente pero tampoco
 * explica: el .bat imprime esa frase con `&`, sin mirar el código de salida, y la
 * causa más directa es que el propio arranque llama a `autonomia.py puertos
 * --matar` y esa limpieza mata AL DUEÑO DEL PUERTO sin preguntar si está sano.
 * O sea: la IDE se apaga la memoria a sí misma cada vez que la relanzan.
 *
 * La respuesta que pidió Mario no es otro `if` suelto: «colocar interruptores en
 * la IDE, adentro y afuera, para que el usuario los encienda o, si se le da la
 * orden, que lo encienda el modelo». Tres manos, UN SOLO ESTADO. Este módulo es la
 * única dueña de ese estado: una tabla de tres posiciones por servicio, y las
 * decisiones que se derivan de ella. Sin fs, sin red, sin child_process — para que
 * la suite las bata en seco y para que el lanzador, la UI y el puente puedan
 * consultar la misma respuesta sin discutir.
 *
 * Las tres posiciones, y por qué no son un simple sí/no:
 *   · "auto"       → nadie mandó: manda el plano (el .bat levanta, el supervisor
 *                    reaviva con tope). Es lo que había hoy.
 *   · "encendido"  → el usuario LO QUIERE ARRIBA: si cae, se levanta sin respetar
 *                    el tope de reavivados (lo pidió a mano).
 *   · "apagado"    → el usuario LO QUIERE ABAJO: el lanzador no lo prende, el
 *                    supervisor NO lo reaviva y la limpieza de puertos sí puede
 *                    matarlo (acá matar es exactamente la orden recibida).
 * Sin "auto" no se puede distinguir «no lo quiero» de «no me metí nunca», y esa
 * distinción es la que evita pelearse con el lanzador de la casa.
 */
import { SERVICIOS_VENTANA, INVENTARIO_SERVICIOS, type ServicioVentana } from "./arranqueVentanas";

export type EstadoInterruptor = "auto" | "encendido" | "apagado";

export const ESTADOS_INTERRUPTOR: EstadoInterruptor[] = ["auto", "encendido", "apagado"];

/** El archivo, en la raíz de DATOS (no en la instalación): es preferencia, no código. */
export const ARCHIVO_INTERRUPTORES = "servicios.json";

/**
 * Lo que NO se apaga aunque lo pidan. `front` es el :3000 donde corre esta misma
 * IDE: un interruptor que puede matar al proceso que lo muestra es una trampa, no
 * una función. Se deja en el plano (para que la UI lo muestre vivo) pero marcado
 * como inmutable, con el motivo a la vista.
 */
export const INMUTABLES: Record<string, string> = {
  front: "es esta misma ventana: apagarla cerraría la IDE",
  // v2.3.24 · el sandbox no lo engendra el lanzador: lo levanta el preview del
  // proyecto abierto y lo apaga «Sync». Un interruptor que mate el :3500 mataría
  // la vista del proyecto que el usuario está mirando, desde otro panel.
  sandbox: "lo levanta y lo apaga el preview del proyecto (Sync), no el lanzador",
};

/** Apagar esto duele de verdad: la UI lo pide por las dos veces. */
export const REQUIEREN_CONFIRMAR: Record<string, string> = {
  ollama: "sin el motor no hay modelo que responda",
  puente: "sin el puente el motor no puede tocar la PC",
};

export interface ServicioInterrumpible extends ServicioVentana {
  inmutable?: string;
  confirmar?: string;
}

/**
 * El inventario interrumpible es EL PLANO COMPLETO, no una lista paralela que
 * envejece. v2.3.24: se pasó de `SERVICIOS_VENTANA` (5) a `INVENTARIO_SERVICIOS`
 * (7) para que la hoja de ruta muestre los mismos siete puertos que la cabecera;
 * el conteo de ventanas del usuario (2 CMD + 3 PY) sigue viviendo en
 * `SERVICIOS_VENTANA` y no se toca.
 */
export function serviciosInterrumpibles(): ServicioInterrumpible[] {
  return INVENTARIO_SERVICIOS.map((s) => ({
    ...s,
    inmutable: INMUTABLES[s.id],
    confirmar: REQUIEREN_CONFIRMAR[s.id],
  }));
}

export const esInterrumpible = (id: string) => serviciosInterrumpibles().some((s) => s.id === id);
export const esInmutable = (id: string) => !!INMUTABLES[id];
export const servicioDe = (id: string) => INVENTARIO_SERVICIOS.find((s) => s.id === id);

export type Interruptores = Record<string, EstadoInterruptor>;

/** Posición actual; lo desconocido vale "auto" (nadie mandó nada). */
export function interruptorDe(ints: Interruptores | null | undefined, id: string): EstadoInterruptor {
  const v = ints && typeof ints === "object" ? (ints as any)[id] : undefined;
  return ESTADOS_INTERRUPTOR.includes(v) ? v : "auto";
}

/**
 * Validación tolerante: un JSON escrito a mano (o por un modelo) puede traer
 * basura. No se lanza: se limpia. Un interruptor ilegible NO puede tumbar el
 * arranque de la IDE, y tampoco puede volverse "apagado" por un error de tipeo —
 * lo que no se entiende es "auto", que es la posición que no rompe nada.
 */
export function normalizarInterruptores(bruto: unknown): Interruptores {
  const salida: Interruptores = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return salida;
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (k.startsWith("_")) continue; // comentarios tipo "_nota": espacio del usuario
    if (!esInterrumpible(k)) continue; // un id que no está en el plano se ignora
    const e = typeof v === "string" ? v.trim().toLowerCase() : "";
    salida[k] = ESTADOS_INTERRUPTOR.includes(e as EstadoInterruptor) ? (e as EstadoInterruptor) : "auto";
  }
  return salida;
}

/** Lo que se escribe a disco: con encabezado legible para el que lo abre a mano. */
export function serializarInterruptores(ints: Interruptores): string {
  const cuerpo: Record<string, unknown> = {
    _nota: "Interruptores de los packs de CerebroNico. auto = manda el lanzador · encendido = el usuario lo quiere arriba · apagado = no se prende ni se reaviva. Se puede editar a mano y la IDE lo lee al tocar.",
    ...normalizarInterruptores(ints),
  };
  return JSON.stringify(cuerpo, null, 2) + "\n";
}

export type AccionSolicitada =
  | { accion: "nada"; porque: string }
  | { accion: "levantar"; porque: string }
  | { accion: "apagar"; porque: string };

/**
 * Orden del usuario (o del modelo) → qué se hace. Aquí vive la única protección
 * real contra el «me cerró solo»: nadie puede apagar el frente, y apagar lo que
 * duele exige confirmación explícita. No se consulta el reloj ni el disco: la
 * decisión es pura y por eso se puede probar.
 */
export function decidirOrden(input: {
  id: string;
  pedido: EstadoInterruptor;
  vivo: boolean;
  confirmar?: boolean;
}): AccionSolicitada {
  const { id, pedido, vivo, confirmar } = input;
  if (!ESTADOS_INTERRUPTOR.includes(pedido)) {
    return { accion: "nada", porque: `posición desconocida «${String(pedido)}»: se entiende auto, encendido o apagado` };
  }
  if (!esInterrumpible(id)) {
    return { accion: "nada", porque: `«${id}» no está en el plano de servicios (${INVENTARIO_SERVICIOS.map((s) => s.id).join(", ")})` };
  }
  if (INMUTABLES[id]) return { accion: "nada", porque: `${servicioDe(id)?.titulo || id} no se apaga: ${INMUTABLES[id]}` };
  if (pedido === "apagado" && !vivo) return { accion: "nada", porque: "ya está apagado" };
  if (pedido === "encendido" && vivo) return { accion: "nada", porque: "ya está arriba" };
  if (pedido === "apagado" && REQUIEREN_CONFIRMAR[id] && !confirmar) {
    return { accion: "nada", porque: `apagar ${id} necesita confirmación: ${REQUIEREN_CONFIRMAR[id]}` };
  }
  return pedido === "apagado"
    ? { accion: "apagar", porque: `interruptor en apagado (${REQUIEREN_CONFIRMAR[id] ? "confirmado" : "pedido directo"})` }
    : pedido === "encendido"
    ? { accion: "levantar", porque: vivo ? "ya está arriba" : "interruptor en encendido: lo pide el usuario" }
    : { accion: "nada", porque: "volver a auto no enciende ni apaga nada: deja mandar al lanzador" };
}

/**
 * ¿El supervisor puede reavivar este pack? La regla que faltaba cuando la ventana
 * decía «se cerro» y el motor volvía a prenderlo solo contra la voluntad del
 * usuario (o al revés: lo deja caído cuando el usuario lo quiere arriba).
 */
export function puedeReanimar(ints: Interruptores | null, id: string, hayTope = true): boolean {
  const e = interruptorDe(ints, id);
  if (e === "apagado") return false;
  if (e === "encendido") return true; // pedido a mano: sin tope de reavivados
  return hayTope; // "auto": el tope de la casa (3 intentos, 15/30/60 s)
}

/** ¿El lanzador (.bat) debe levantar este pack al arrancar? */
export function debeLevantarAlArrancar(ints: Interruptores | null, id: string): boolean {
  return interruptorDe(ints, id) !== "apagado";
}

/** Frase corta para la UI y para el aviso del supervisor, siempre en español. */
export function razonLegible(id: string, ints: Interruptores | null, vivo: boolean): string {
  const e = interruptorDe(ints, id);
  if (INMUTABLES[id]) return `siempre prendido — ${INMUTABLES[id]}`;
  if (e === "apagado") return "apagado a mano: no se prende ni se reaviva";
  if (e === "encendido") return vivo ? "pedido arriba y vivo" : "pedido arriba: se levanta aunque caiga";
  return vivo ? "vivo, sin pedido del usuario" : "auto: lo cuida el supervisor";
}

/** El estado que consumen la UI y el puente: plano + posición + realidad medida. */
export function tablaInterruptores(ints: Interruptores | null, vivos: Record<string, boolean>) {
  return serviciosInterrumpibles().map((s) => ({
    id: s.id,
    titulo: s.titulo,
    puerto: s.puerto,
    rol: s.rol,
    dueño: s.dueño,
    vivo: vivos[s.id] === true,
    interruptor: interruptorDe(ints, s.id),
    inmutable: s.inmutable || "",
    confirmar: s.confirmar || "",
    // v1.0.1 · lo que el supervisor NO vigila no puede decir «lo cuida el
    // supervisor»: esa frase era cierta para cinco filas y mentira para dos.
    razon: s.noVigilado && vivos[s.id] !== true ? s.noVigilado : razonLegible(s.id, ints, vivos[s.id] === true),
  }));
}

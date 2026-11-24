/**
 * hojaDeRuta.ts — LA HOJA DE RUTA TIENE TRES COSAS, Y SOLO TRES (v2.3.26)
 * ========================================================================
 * Mario, 15/11, con capturas de la hoja:
 *
 *   «hoja de ruta en capturas — ▸ Código · 48 · 283 KB ▸ Avisos · 2 · 11 KB
 *    ▸ Descripciones · 6514 · 41,8 MB ▸ Datos · 5 · 1,4 MB ▸ Entregables · 1 ·
 *    540 KB   TODO ESO QUITARLO ---- La hoja de ruta está llena de cosas
 *    innecesarias --- QUE DEJAR? -- 1 LA RECONEXION DE PUERTOS, 2 PASOS DE LA
 *    TAREA DEL AGENTE, LA HOJA DE RUTA CON LOS PASOS DE LA RUTA Y 3 EL
 *    ENTREGABLE FINAL, NADA MAS EN LA HOJA DE RUTA»
 *
 * Lo que se veía (y sobra): el inventario del sandbox agrupado en cinco baldes
 * (Código, Avisos, Descripciones, Datos, Entregables), la lista del repartidor,
 * los interruptores de servicios, el ciclo de decisión, «Acciones en la PC» con
 * sus tandas de ✓, los planes viejos, la barra de progreso por plan… Nada de eso
 * es la ruta: es el inventario del disco disfrazado de hoja.
 *
 * Lo que queda, en este orden y sin más:
 *
 *   1. RECONEXIÓN DE PUERTOS — si un puerto está abajo, QUÉ es, QUÉ se pierde y
 *      qué se va a intentar. Un puerto arriba no se anuncia (no es noticia).
 *   2. PASOS DE LA TAREA DEL AGENTE — los pasos REALES del plan: hecho, en
 *      curso, roto, pendiente. Desde el primero del plan vigente.
 *   3. ENTREGABLE FINAL — un solo archivo, con nombre y peso, y solo cuando el
 *      trabajo está cerrado. A medias no hay entregable: hay trabajo.
 *
 * Lo demás NO se borra del motor (el inventario sigue existiendo y el ZIP sigue
 * bajándose entero desde su sitio): se saca de la HOJA. Borrar capacidad sin
 * veredicto no se hace; quitar ruido de la cara, sí.
 *
 * PURA: mira listas, decide qué se ve. Sin React, sin red, sin disco.
 */

import { haceTexto, edadLectura } from "./haceTexto";

export type ClaseDePaso = "hecho" | "en-curso" | "roto" | "pendiente";

export interface PasoDeLaTarea {
  /** El id que le dio el planificador («p1», «t3»…), tal cual. */
  id: string;
  /** Una línea, en español, de qué es el paso. */
  titulo: string;
  clase: ClaseDePaso;
  /** El estado crudo del motor, por si hay que enseñarlo tal cual. */
  estado: string;
  /** El porqué, cuando el motor lo sabe (una tarea en espera sin motivo es una caja negra). */
  motivo?: string;
}

export interface LineaDePuerto {
  puerto: number;
  quien: string;
  vivo: boolean;
  /** Para qué sirve, en palabras del usuario («inferencia local», «puente»…). */
  para?: string;
  /** Qué se pierde si está abajo. */
  sePierde?: string;
  /**
   * v1.0.22 · esta muestra no lo midió, pero hay una lectura anterior que vale.
   * No es un verde: es un verde que tiene que decir que es heredado.
   */
  heredado?: boolean;
  /** v1.0.22 · el porqué que escribe el servidor (`sin respuesta en esta muestra…`). */
  motivo?: string;
  /**
   * v1.0.27 · LA ORDEN DEL USUARIO, no la medición. `"apagado"` es una ORDEN del
   * usuario, no una caída: el puerto no escucha porque él lo apagó, y pintarlo
   * con ⚠ tono falla («está abajo») era exactamente el «indicador de servicios
   * apagados» que reportó. Lo llena `PlanificationPanel` con la tabla del
   * supervisor; si no viene, la hoja no puede afirmar que fue a mano.
   */
  interruptor?: string;
}

export interface EntregableFinal {
  nombre: string;
  peso: string;
  archivos: number;
  /** Solo cuando de verdad está empacado y el trabajo cerró. */
  listo: boolean;
}

export type TipoDeFila = "reconexion" | "paso" | "entregable";

export interface FilaDeLaHoja {
  tipo: TipoDeFila;
  /** Lo que se pinta, ya escrito: la hoja no compone frases por su cuenta. */
  texto: string;
  /** Marca de la izquierda (✓ ▶ ✗ · ⚠ ⬇). */
  marca: string;
  /** Tono: neutro, trabajo, falla, entrega. El color lo pone la vista. */
  tono: "neutro" | "trabajo" | "falla" | "entrega";
  /** true si es una línea de cabecera de bloque. */
  cabecera?: boolean;
}

/** Las tres secciones, en el orden pedido. Nada más entra acá sin veredicto. */
export const SECCIONES_DE_LA_HOJA: TipoDeFila[] = ["reconexion", "paso", "entregable"];

/** Las marcas de la izquierda, por clase. Exportadas para que la vista y la prueba hablen del mismo ✓ ▶ ✗ ·. */
export const MARCA: Record<ClaseDePaso, string> = { hecho: "✓", "en-curso": "▶", roto: "✗", pendiente: "·" };
export const TONO: Record<ClaseDePaso, FilaDeLaHoja["tono"]> = {
  hecho: "neutro", "en-curso": "trabajo", roto: "falla", pendiente: "neutro",
};

/**
 * El estado crudo del planificador → una de las cuatro clases que se pintan.
 * Un estado que no conocemos NO se inventa como «pendiente»: cae en «pendiente»
 * pero el texto lo dice con su nombre, para que se pueda corregir el mapa.
 */
export function claseDeEstado(estado: string): ClaseDePaso {
  const e = String(estado || "").toLowerCase();
  if (e === "hecha" || e === "hecho" || e === "lista" || e === "ok") return "hecho";
  if (e === "en_curso" || e === "en curso" || e === "running") return "en-curso";
  if (e === "fallida" || e === "fallido" || e === "bloqueada" || e === "error") return "roto";
  return "pendiente";
}

/**
 * Los pasos de la tarea del agente: del plan VIVO, desde el primer paso, con el
 * que está en curso destacado. Si no hay plan vivo, se muestran los del último
 * cerrado (con su cierre dicho) — porque «no hay nada» tampoco es la verdad
 * cuando el motor acaba de terminar algo.
 */
export function pasosDeLaTarea(
  planes: { id: string; objetivo?: string; estado?: string; vivo?: boolean; tareas?: { id: string; titulo?: string; estado?: string; motivoEspera?: string | null }[] }[],
  tope = 12,
): { titulo: string; pasos: PasoDeLaTarea[]; cerrado: boolean } {
  const lista = Array.isArray(planes) ? planes.filter(Boolean) : [];
  if (lista.length === 0) return { titulo: "", pasos: [], cerrado: false };
  const vivo = lista.find((p) => p.vivo || p.estado === "en_curso");
  const plan = vivo || lista[0];
  const tareas = Array.isArray(plan.tareas) ? plan.tareas : [];
  const pasos: PasoDeLaTarea[] = tareas.slice(0, Math.max(1, tope)).map((t) => {
    const clase = claseDeEstado(String(t.estado || ""));
    return {
      id: String(t.id || ""),
      titulo: String(t.titulo || "(paso sin nombre)"),
      clase,
      estado: String(t.estado || ""),
      motivo: t.motivoEspera ? String(t.motivoEspera) : undefined,
    };
  });
  return { titulo: String(plan.objetivo || plan.id || ""), pasos, cerrado: !vivo };
}

/**
 * La reconexión de puertos: SOLO lo que está abajo, porque un puerto arriba no es
 * una noticia. Si están todos arriba se dice una vez, en corto, y no se ocupa la
 * hoja con una lista de seis verdes.
 */
export function reconexionDePuertos(
  puertos: LineaDePuerto[],
  reintentando = false,
  /**
   * v1.0.22 · LA EDAD DE LA MUESTRA. Un ✓ de puertos heredado de hace una hora es
   * la mentira que Mario cazó en la hoja vieja: el dato era real, la edad no se
   * decía. Se recibe en ms (o la marca `lastChecked`) y se escribe con
   * `haceTexto`/`edadLectura`, que son LAS de `engine/haceTexto.ts` — una sola
   * definición de «hace 1 h 20 min» en todo el árbol, no dos.
   */
  edadMs?: number | null,
): FilaDeLaHoja[] {
  const edad = edadLectura(edadMs);
  const sello = edad === "sin leer todavía" ? "sin lectura de telemetría" : `medido ${edad}`;
  const lista = Array.isArray(puertos) ? puertos.filter(Boolean) : [];
  // v1.0.27 · TRES GRUPOS, NO DOS. Antes era `!p.vivo` y nada más: lo apagado a
  // mano caía en el mismo cubo que lo caído y se anunciaba «está abajo». Ahora
  // lo apagado a mano se separa y se dice con voz neutra, sin botón de
  // reconectar (reconectar lo apagado a mano es deshacerle la orden).
  const apagados = lista.filter((p) => !p.vivo && p.interruptor === "apagado");
  const abajo = lista.filter((p) => !p.vivo && p.interruptor !== "apagado");
  if (lista.length === 0) return [];
  if (abajo.length === 0) {
    const heredados = lista.filter((p) => p.heredado);
    const aviso = heredados.length
      ? ` · ${heredados.length} con lectura anterior (${heredados.map((p) => `:${p.puerto}`).join(", ")}): sin responder ahora`
      : "";
    const aMano = apagados.length
      ? ` · ${apagados.length} apagado(s) a mano (${apagados.map((p) => `:${p.puerto}`).join(", ")})`
      : "";
    return [{ tipo: "reconexion", texto: `los ${lista.length} puertos están arriba · ${sello}${aviso}${aMano}`, marca: "✓", tono: "neutro" }];
  }
  const filasApagadas: FilaDeLaHoja[] = apagados.map((p) => {
    const que = p.para ? ` (${p.para})` : "";
    const pierde = p.sePierde ? ` — mientras esté apagado: ${p.sePierde}` : "";
    return {
      tipo: "reconexion" as TipoDeFila,
      texto: `:${p.puerto} ${p.quien}${que} apagado a mano${pierde} · no se reanima solo · ${sello}`,
      marca: "·",
      tono: "neutro" as const,
    };
  });
  return [...filasApagadas, ...abajo.map((p) => {
    const que = p.para ? ` (${p.para})` : "";
    const pierde = p.sePierde ? ` — se pierde: ${p.sePierde}` : "";
    return {
      tipo: "reconexion" as TipoDeFila,
      texto: `:${p.puerto} ${p.quien}${que} ${p.vivo ? "sin responder ahora · se conserva la lectura anterior" : "está abajo"}${pierde}${p.motivo ? ` (${p.motivo})` : ""}${reintentando ? " · reintentando" : ""} · ${sello}`,
      marca: "⚠",
      tono: "falla" as const,
    };
  })];
}

/**
 * El entregable final: uno, con nombre y peso, y SOLO si el trabajo cerró.
 * A medias no hay entregable — hay trabajo en marcha, y eso lo dice la sección
 * de pasos, no una oferta de descarga.
 */
export function entregableFinal(e: EntregableFinal | null | undefined, obraCerrada: boolean): FilaDeLaHoja[] {
  if (!e || !e.nombre) return [];
  if (!obraCerrada || !e.listo) {
    return [{
      tipo: "entregable",
      texto: "todavía no hay entregable final: el trabajo no cerró",
      marca: "·",
      tono: "neutro",
    }];
  }
  return [
    {
      tipo: "entregable",
      texto: `${e.nombre} · ${e.peso} · ${e.archivos} archivo(s)`,
      marca: "⬇",
      tono: "entrega",
    },
  ];
}

/**
 * La hoja armada: cabecera + filas, en el orden de las tres secciones. Lo que no
 * entra en ninguna de las tres no entra en la hoja.
 */
export interface HojaArmada {
  cabecera: { reconexion: string; pasos: string; entregable: string };
  filas: FilaDeLaHoja[];
  /** Cuántos pasos hay de cada clase: el resumen de una línea del pie. */
  cuenta: Record<ClaseDePaso, number>;
}

export function armarHoja(entrada: {
  puertos?: LineaDePuerto[];
  reintentando?: boolean;
  planes?: Parameters<typeof pasosDeLaTarea>[0];
  entregable?: EntregableFinal | null;
  obraCerrada?: boolean;
}): HojaArmada {
  const recon = reconexionDePuertos(entrada.puertos || [], entrada.reintentando === true);
  const { titulo, pasos, cerrado } = pasosDeLaTarea(entrada.planes || []);
  const entrega = entregableFinal(entrada.entregable || null, entrada.obraCerrada === true);
  const cuenta: Record<ClaseDePaso, number> = { hecho: 0, "en-curso": 0, roto: 0, pendiente: 0 };
  for (const p of pasos) cuenta[p.clase]++;
  const filas: FilaDeLaHoja[] = [
    { tipo: "reconexion", texto: "Reconexión de puertos", marca: "", tono: "neutro", cabecera: true },
    ...recon,
    {
      tipo: "paso",
      texto: titulo ? `Pasos de la tarea: ${titulo}${cerrado ? " (último plan, ya cerrado)" : ""}` : "Pasos de la tarea",
      marca: "",
      tono: "neutro",
      cabecera: true,
    },
    ...pasos.map((p) => ({
      tipo: "paso" as TipoDeFila,
      texto: p.motivo ? `${p.titulo} — ${p.motivo}` : p.titulo,
      marca: MARCA[p.clase],
      tono: TONO[p.clase],
    })),
    { tipo: "entregable", texto: "Entregable final", marca: "", tono: "neutro", cabecera: true },
    ...entrega,
  ];
  return {
    cabecera: {
      reconexion: recon.length ? `${recon.filter((r) => r.tono === "falla").length} abajo` : "sin datos",
      pasos: pasos.length ? `${cuenta.hecho}/${pasos.length}` : "sin plan",
      entregable: entrega[0] && entrega[0].tono === "entrega" ? "listo" : "en obra",
    },
    filas,
    cuenta,
  };
}

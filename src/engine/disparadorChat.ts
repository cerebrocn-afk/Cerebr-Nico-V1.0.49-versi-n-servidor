/**
 * disparadorChat.ts — EL CHAT DISPARA TAREAS (v1.28.0 · Tarea 1)
 * ===============================================================
 * El puente que faltaba: convierte las ÓRDENES que el chat ya sabe extraer
 * (`extraerOrdenes`, chatOrders.ts) en TAREAS de la capa de plan (taskPlanner.ts),
 * para poder dispararlas EN SEGUNDO PLANO y EN PARALELO en vez de ejecutarlas
 * una a una, inline, bloqueando la respuesta del chat.
 *
 * POR QUÉ ESTE MÓDULO Y NO MÁS CÓDIGO EN App.tsx
 * ---------------------------------------------
 * App.tsx ya ejecuta cada orden "a mano": un `fetch` por conversión, otro por
 * imagen, y el plan solo llega si el MODELO escribe el bloque `cerebronico:plan`
 * a propósito. Eso deja dos huecos:
 *
 *   1. Si el usuario pide "convertí estos cinco a YAML", el modelo emite cinco
 *      órdenes `convertir` sueltas — y el chat las corre EN SERIE, esperando
 *      cada `fetch`. Son independientes: deberían correr a la vez.
 *   2. La decisión "esto merece un plan de fondo" vivía repartida en `if`s
 *      dentro de un bucle de UI. No se podía probar sin montar el DOM.
 *
 * Aquí se cierra: una función PURA que mira el lote de órdenes de UN turno del
 * chat y decide, para cada una, si es acción de interfaz inmediata (abrir un
 * archivo) o TAREA de fondo (convertir, generar imagen). Las de fondo se pueden
 * agrupar en UN plan del cerebro — validado con el MISMO `crearPlan`/`validarPlan`
 * del motor, sin reglas duplicadas — y lanzarlo por /api/brain/plan.
 *
 * Es lógica pura: recibe órdenes, devuelve descriptores. No toca red, ni disco,
 * ni el DOM. Por eso se prueba entera (tests/disparadorChat.test.ts).
 */

// IMPORTA SOLO TIPOS de chatOrders (con `import type`, que se BORRA al compilar):
// chatOrders arrastra formatConverter → js-yaml en tiempo de EJECUCIón, y este
// módulo no necesita nada de eso en runtime (solo las formas). Así el bridge se
// puede probar sin instalar el conversor de YAML — la lógica pura no depende de él.
import type {
  Orden,
  OrdenConvertir,
  OrdenImagen,
  OrdenPlan,
  OrdenGenerica,
  TareaPlanOrden,
  ResultadoOrdenes,
} from "./chatOrders";
import { crearPlan, validarPlan } from "./taskPlanner";

/**
 * En qué canal cae cada orden del chat:
 *   · "accion-ui"    — efecto inmediato en la interfaz (abrir un archivo). NO es
 *                     una tarea de fondo: no tiene sentido "encolar" un abrir.
 *   · "tarea-fondo"  — trabajo real que corre en paralelo (convertir, imagen).
 *                     Es lo que alimenta un plan del cerebro.
 *   · "plan"         — el modelo YA armó un plan explícito; se dispara tal cual.
 *   · "reflejo-sin-ejecutor" — una de las 16 acciones genéricas del Reflejo v3.0
 *                     que aún no tiene ejecutor cableado: se reconoce y se dice,
 *                     pero no se promete que corra (honestidad, no silencio).
 */
export type ClaseDisparo = "accion-ui" | "tarea-fondo" | "plan" | "reflejo-sin-ejecutor";

export interface Disparo {
  /** La orden original, sin tocar. */
  orden: Orden;
  clase: ClaseDisparo;
  /** Una línea para el registro del terminal: qué se va a hacer, en cristiano. */
  etiqueta: string;
  /** ¿Corre en segundo plano y en paralelo con las demás de su clase? */
  enParalelo: boolean;
}

/** Las órdenes que valen como TAREA de un plan de fondo. */
const TIPOS_FONDO = new Set(["convertir", "imagen"]);

/**
 * Clasifica UNA orden. Puro y total: para toda orden conocida devuelve un
 * `Disparo`; nunca lanza.
 */
export function clasificarOrden(orden: Orden): Disparo {
  switch (orden.tipo) {
    case "abrir":
      return {
        orden,
        clase: "accion-ui",
        etiqueta: `abrir «${orden.ruta}» en el editor`,
        enParalelo: false,
      };
    case "plan":
      return {
        orden,
        clase: "plan",
        etiqueta: `plan «${orden.objetivo}» (${orden.tareas.length} tarea/s)`,
        enParalelo: true,
      };
    case "convertir":
      return {
        orden,
        clase: "tarea-fondo",
        etiqueta: `convertir ${orden.desde}→${orden.hacia} → «${orden.salida}»`,
        enParalelo: true,
      };
    case "imagen":
      return {
        orden,
        clase: "tarea-fondo",
        etiqueta: `generar imagen${orden.salida ? ` → «${orden.salida}»` : ""}`,
        enParalelo: true,
      };
    default: {
      // Las 16 acciones genéricas del Reflejo v3.0: reconocidas, sin ejecutor.
      const gen = orden as OrdenGenerica;
      return {
        orden,
        clase: "reflejo-sin-ejecutor",
        etiqueta: `acción «${gen.tipo}» reconocida (aún sin ejecutor integrado)`,
        enParalelo: false,
      };
    }
  }
}

export interface PlanificacionDisparos {
  disparos: Disparo[];
  /** Avisos heredados de `extraerOrdenes` (lo que no se pudo interpretar). */
  avisos: string[];
  /** Cuántas órdenes son trabajo de fondo agrupable. */
  fondo: number;
  /** Cuántas son acción de interfaz inmediata. */
  ui: number;
  /** Cuántos planes explícitos trae el turno. */
  planes: number;
}

/**
 * Mira el lote de órdenes de UN turno del chat y las reparte por canal. Puro.
 * Conserva los avisos de `extraerOrdenes` sin tocarlos: lo que el motor no
 * entendió se sigue diciendo, no se traga.
 */
export function planificarDisparos(res: ResultadoOrdenes): PlanificacionDisparos {
  const disparos = res.ordenes.map(clasificarOrden);
  return {
    disparos,
    avisos: [...res.avisos],
    fondo: disparos.filter((d) => d.clase === "tarea-fondo").length,
    ui: disparos.filter((d) => d.clase === "accion-ui").length,
    planes: disparos.filter((d) => d.clase === "plan").length,
  };
}

/**
 * Convierte UNA orden de fondo en una tarea de plan (`TareaPlanOrden`), con el
 * `id` que se le indique. Las conversiones e imágenes son INDEPENDIENTES entre
 * sí, así que salen SIN dependencias: el runner las corre en paralelo hasta donde
 * llegue el semáforo.
 *
 * Devuelve null para lo que no es tarea de fondo (abrir, plan, genéricas): esas
 * no entran en el plan agrupado.
 */
export function ordenComoTarea(orden: Orden, id: string): TareaPlanOrden | null {
  if (orden.tipo === "convertir") {
    const o = orden as OrdenConvertir;
    const datos: Record<string, unknown> = { desde: o.desde, hacia: o.hacia, salida: o.salida };
    if (o.archivo) datos.archivo = o.archivo;
    if (o.contenido !== undefined) datos.contenido = o.contenido;
    if (o.opciones) datos.opciones = o.opciones;
    return {
      id,
      titulo: `convertir ${o.desde}→${o.hacia} (${o.salida})`,
      peso: "io",
      tipo: "convertir",
      datos,
      dependeDe: [],
    };
  }
  if (orden.tipo === "imagen") {
    const o = orden as OrdenImagen;
    const datos: Record<string, unknown> = { prompt: o.prompt };
    if (o.salida) datos.salida = o.salida;
    if (o.ancho !== undefined) datos.ancho = o.ancho;
    if (o.alto !== undefined) datos.alto = o.alto;
    if (o.modelo) datos.modelo = o.modelo;
    if (o.seed !== undefined) datos.seed = o.seed;
    return {
      id,
      titulo: `generar imagen${o.salida ? ` (${o.salida})` : ""}`,
      peso: "io",
      tipo: "generar_imagen",
      datos,
      dependeDe: [],
    };
  }
  return null;
}

export interface ResultadoAgrupacion {
  ok: boolean;
  /** La orden de plan lista para /api/brain/plan (si `ok`). */
  orden?: OrdenPlan;
  /** Por qué NO se pudo agrupar (si `!ok`). Se dice; no se adivina. */
  motivo?: string;
}

/**
 * EL CORAZÓN DE LA TAREA 1: agrupa las órdenes de fondo de un turno en UN solo
 * plan del cerebro, para dispararlas en paralelo con una sola llamada.
 *
 * Reglas (deliberadas, no accidentales):
 *   · Solo entran las de fondo (convertir, imagen). Un `abrir` es UI inmediata y
 *     un `plan` explícito ya es su propio plan: mezclarlos aquí sería inventar.
 *   · Se valida con el MOTOR (`crearPlan`+`validarPlan`): si el motor lo
 *     rechazara, el chat no manda un plan que sabe roto.
 *   · Con 0 órdenes de fondo NO se arma plan: se devuelve `ok:false` con motivo,
 *     porque un plan vacío es un plan que miente sobre tener trabajo.
 *   · Con UNA sola orden de fondo TAMBIÉN se puede armar plan (deja el trabajo
 *     en el Planificador, visible y cancelable) — pero el que llama decide si
 *     prefiere el atajo inline; este módulo no impone.
 */
export function agruparEnPlan(objetivo: string, ordenes: Orden[]): ResultadoAgrupacion {
  const obj = String(objetivo || "").trim();
  if (!obj) return { ok: false, motivo: "Falta el objetivo del plan agrupado." };

  const deFondo = ordenes.filter((o) => TIPOS_FONDO.has(o.tipo));
  if (deFondo.length === 0) {
    return { ok: false, motivo: "No hay órdenes de fondo (convertir/imagen) que agrupar en un plan." };
  }

  const tareas: TareaPlanOrden[] = [];
  let n = 0;
  for (const o of deFondo) {
    const t = ordenComoTarea(o, String(++n));
    if (t) tareas.push(t);
  }

  // La autoridad del motor, no una copia de las reglas: si valida aquí, valida
  // en el servidor, porque es el mismo código.
  const plan = crearPlan(obj, tareas as any);
  const v = validarPlan(plan);
  if (!v.ok) return { ok: false, motivo: v.error || "El plan agrupado no pasa la validación del motor." };

  return {
    ok: true,
    orden: {
      tipo: "plan",
      objetivo: obj,
      tareas,
      autoLanzar: true,
    },
  };
}

/**
 * ¿Merece la pena agrupar? Heurística honesta para que el chat decida sin
 * adivinar: dos o más tareas de fondo en el mismo turno se corren MUCHO mejor
 * como plan paralelo que como `fetch`es en serie. Una sola es indiferente
 * (el atajo inline es igual de válido), así que se deja a criterio del que llama.
 */
export function convieneAgrupar(plani: PlanificacionDisparos): boolean {
  return plani.fondo >= 2;
}

/** Una línea de resumen para el terminal: qué va a pasar con este turno. */
export function resumenDisparos(plani: PlanificacionDisparos): string {
  const partes: string[] = [];
  if (plani.planes) partes.push(`${plani.planes} plan/es`);
  if (plani.fondo) partes.push(`${plani.fondo} tarea/s de fondo`);
  if (plani.ui) partes.push(`${plani.ui} acción/es de interfaz`);
  const sinEjecutor = plani.disparos.filter((d) => d.clase === "reflejo-sin-ejecutor").length;
  if (sinEjecutor) partes.push(`${sinEjecutor} reconocida/s sin ejecutor`);
  if (partes.length === 0) return "El turno no trae órdenes ejecutables.";
  return `Turno con ${partes.join(", ")}.` + (convieneAgrupar(plani) ? " Conviene lanzarlas como un plan paralelo." : "");
}


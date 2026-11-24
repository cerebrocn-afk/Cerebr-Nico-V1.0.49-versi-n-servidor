/**
 * tableroParalelo.ts — EL TABLERO DE TAREAS PARALELAS (v1.28.0 · Tarea 2)
 * ======================================================================
 * El monitor: de un vistazo, qué está corriendo AHORA, cuánto de la máquina se
 * está usando y qué está esperando o atascado. Los datos ya existen — los sirven
 * /api/brain/plans (los planes con sus tareas) y /api/brain/runner (el semáforo
 * global io/cpu) — pero estaban crudos: contar estados, medir ocupación y
 * diagnosticar salud se hacía a ojo en la interfaz, sin poder probarlo.
 *
 * Este módulo es la CUENTA: recibe la foto (planes + semáforo) y devuelve el
 * modelo del tablero — conteos por estado, por peso, ocupación de cada carril,
 * las tareas en curso y un diagnóstico honesto (sano / saturado / atascado).
 *
 * Lógica pura: no toca red, ni disco, ni el DOM. El componente React solo pinta
 * lo que este módulo calcula, así que la aritmética del tablero se prueba entera
 * (tests/tableroParalelo.test.ts) sin montar la interfaz.
 */

/** Los ocho estados de una tarea, tal y como los define taskPlanner. */
export type EstadoTareaPanel =
  | "pendiente"
  | "lista"
  | "en_curso"
  | "hecha"
  | "fallida"
  | "bloqueada"
  | "cancelada"
  | "descartada";

export type PesoTarea = "io" | "cpu";

/** Una tarea tal y como la sirve /api/brain/plans (subconjunto que usa el tablero). */
export interface TareaPanel {
  id: string;
  titulo: string;
  peso: PesoTarea;
  tipo?: string;
  estado: EstadoTareaPanel;
  motivoEspera?: string | null;
  ms?: number | null;
}

export interface PlanPanel {
  id: string;
  objetivo: string;
  estado: string;
  tareas: TareaPanel[];
}

/** El estado del semáforo global, tal y como lo sirve Semaforo.estado(). */
export interface CarrilSemaforo {
  enUso: number;
  limite: number;
  esperando: number;
}
export interface EstadoSemaforo {
  io: CarrilSemaforo;
  cpu: CarrilSemaforo;
}

/** Una tarea en curso, con el plan al que pertenece, para la lista del tablero. */
export interface TareaEnCurso {
  planId: string;
  objetivo: string;
  id: string;
  titulo: string;
  peso: PesoTarea;
  msTranscurridos: number | null;
}

export type SaludTablero = "inactivo" | "sano" | "saturado" | "atascado";

export interface OcupacionCarril {
  peso: PesoTarea;
  enUso: number;
  limite: number;
  esperando: number;
  /** 0..1 — fracción del carril en uso. Con límite 0 se reporta 0 (no NaN). */
  fraccion: number;
  /** 0..100 redondeado, para pintar la barra sin recalcular. */
  porcentaje: number;
}

export interface TableroParalelo {
  /** Conteo por estado, sumando TODAS las tareas de TODOS los planes. */
  porEstado: Record<EstadoTareaPanel, number>;
  /** Conteo por peso (solo de lo que está en curso, que es lo que ocupa máquina). */
  enCursoPorPeso: Record<PesoTarea, number>;
  /** Total de tareas y total de planes vistos. */
  totalTareas: number;
  totalPlanes: number;
  /** Planes que aún se mueven (en_curso / pendiente / pausado). */
  planesActivos: number;
  /** Ocupación de cada carril del semáforo. */
  ocupacion: { io: OcupacionCarril; cpu: OcupacionCarril };
  /** Lista de lo que corre AHORA, para pintarla tal cual. */
  enCurso: TareaEnCurso[];
  /** Diagnóstico honesto del conjunto. */
  salud: SaludTablero;
  /** Frase que explica el diagnóstico (el porqué, no solo la etiqueta). */
  diagnostico: string;
}

const ESTADOS: EstadoTareaPanel[] = [
  "pendiente",
  "lista",
  "en_curso",
  "hecha",
  "fallida",
  "bloqueada",
  "cancelada",
  "descartada",
];

function ceroPorEstado(): Record<EstadoTareaPanel, number> {
  const r = {} as Record<EstadoTareaPanel, number>;
  for (const e of ESTADOS) r[e] = 0;
  return r;
}

function ocupacion(peso: PesoTarea, c: CarrilSemaforo): OcupacionCarril {
  const limite = Math.max(0, Number(c?.limite) || 0);
  const enUso = Math.max(0, Number(c?.enUso) || 0);
  const esperando = Math.max(0, Number(c?.esperando) || 0);
  // Límite 0 => fracción 0, nunca dividir por cero (el bug clásico del NaN
  // que rompe la barra de la interfaz sin decir por qué).
  const fraccion = limite > 0 ? Math.min(1, enUso / limite) : 0;
  return { peso, enUso, limite, esperando, fraccion, porcentaje: Math.round(fraccion * 100) };
}

/** ¿El plan sigue moviéndose por su cuenta? */
function planActivo(estado: string): boolean {
  return estado === "en_curso" || estado === "pendiente" || estado === "pausado";
}

/**
 * Construye el modelo del tablero a partir de la foto. Puro y total: con la
 * lista vacía devuelve un tablero "inactivo" coherente (ceros, no NaN).
 */
export function construirTablero(planes: PlanPanel[], semaforo: EstadoSemaforo): TableroParalelo {
  const porEstado = ceroPorEstado();
  const enCursoPorPeso: Record<PesoTarea, number> = { io: 0, cpu: 0 };
  const enCurso: TareaEnCurso[] = [];
  let totalTareas = 0;
  let planesActivos = 0;

  for (const plan of planes || []) {
    if (planActivo(plan.estado)) planesActivos += 1;
    for (const t of plan.tareas || []) {
      totalTareas += 1;
      // Un estado que no reconocemos NO se cuenta como si fuera otro: se ignora
      // en los conteos por estado (pero sigue sumando al total). Inventar un
      // estado sería mentir sobre lo que hay.
      if (porEstado[t.estado] !== undefined) porEstado[t.estado] += 1;
      if (t.estado === "en_curso") {
        const peso: PesoTarea = t.peso === "cpu" ? "cpu" : "io";
        enCursoPorPeso[peso] += 1;
        enCurso.push({
          planId: plan.id,
          objetivo: plan.objetivo,
          id: t.id,
          titulo: t.titulo,
          peso,
          msTranscurridos: t.ms ?? null,
        });
      }
    }
  }

  const io = ocupacion("io", semaforo?.io ?? { enUso: 0, limite: 0, esperando: 0 });
  const cpu = ocupacion("cpu", semaforo?.cpu ?? { enUso: 0, limite: 0, esperando: 0 });

  const { salud, diagnostico } = diagnosticar({
    enCurso: enCurso.length,
    esperando: io.esperando + cpu.esperando,
    bloqueadas: porEstado.bloqueada,
    listas: porEstado.lista,
    pendientes: porEstado.pendiente,
    io,
    cpu,
    planesActivos,
  });

  return {
    porEstado,
    enCursoPorPeso,
    totalTareas,
    totalPlanes: (planes || []).length,
    planesActivos,
    ocupacion: { io, cpu },
    enCurso,
    salud,
    diagnostico,
  };
}

/**
 * EL DIAGNÓSTICO, aparte para poder probarlo solo. Cuatro veredictos:
 *   · inactivo  — no hay nada en curso ni esperando: el motor está quieto.
 *   · atascado  — hay trabajo listo/pendiente PERO nada corre: algo lo frena
 *                (un carril a cero, cortacircuitos, o bloqueadas de sobra).
 *                Es el estado que hay que ver en rojo: promete trabajo y no avanza.
 *   · saturado  — corre a tope y aún hay cola esperando hueco: sano pero lleno.
 *   · sano      — corre con hueco de sobra.
 */
export function diagnosticar(m: {
  enCurso: number;
  esperando: number;
  bloqueadas: number;
  listas: number;
  pendientes: number;
  io: OcupacionCarril;
  cpu: OcupacionCarril;
  planesActivos: number;
}): { salud: SaludTablero; diagnostico: string } {
  const hayTrabajoAbierto = m.listas + m.pendientes + m.enCurso > 0 || m.planesActivos > 0;

  if (m.enCurso === 0 && m.esperando === 0) {
    if (m.bloqueadas > 0 && m.listas + m.pendientes === 0) {
      return {
        salud: "atascado",
        diagnostico: `Nada corre y quedan ${m.bloqueadas} tarea/s bloqueada/s por dependencias rotas o cortacircuitos.`,
      };
    }
    if (!hayTrabajoAbierto) {
      return { salud: "inactivo", diagnostico: "No hay tareas en curso ni en espera: el motor está quieto." };
    }
    // Hay listas/pendientes pero nada corre y nada espera hueco: está frenado.
    return {
      salud: "atascado",
      diagnostico: `Hay ${m.listas + m.pendientes} tarea/s por hacer pero ninguna corre: revísalo (carril a cero, cortacircuito o dependencia).`,
    };
  }

  const carrilLleno = m.io.fraccion >= 1 || m.cpu.fraccion >= 1;
  if (m.esperando > 0 && carrilLleno) {
    return {
      salud: "saturado",
      diagnostico: `A tope: ${m.enCurso} en curso y ${m.esperando} esperando hueco (io ${m.io.enUso}/${m.io.limite}, cpu ${m.cpu.enUso}/${m.cpu.limite}). Sube el escalado para ir más rápido.`,
    };
  }

  return {
    salud: "sano",
    diagnostico: `${m.enCurso} tarea/s en curso con hueco libre (io ${m.io.enUso}/${m.io.limite}, cpu ${m.cpu.enUso}/${m.cpu.limite}).`,
  };
}

/**
 * Selector por estado: todas las tareas (de todos los planes) que están en el
 * estado pedido, con el plan al que pertenecen. Es el filtro del tablero.
 */
export function filtrarPorEstado(
  planes: PlanPanel[],
  estado: EstadoTareaPanel
): Array<{ planId: string; objetivo: string; tarea: TareaPanel }> {
  const salida: Array<{ planId: string; objetivo: string; tarea: TareaPanel }> = [];
  for (const plan of planes || []) {
    for (const t of plan.tareas || []) {
      if (t.estado === estado) salida.push({ planId: plan.id, objetivo: plan.objetivo, tarea: t });
    }
  }
  return salida;
}

/** Los estados que tiene sentido ofrecer como filtro en la interfaz, en orden. */
export const ESTADOS_FILTRABLES: EstadoTareaPanel[] = [...ESTADOS];

/** Barra de ocupación en texto (para logs y para tests que no pintan píxeles). */
export function barraOcupacion(o: OcupacionCarril, ancho = 10): string {
  const llenas = Math.round(o.fraccion * ancho);
  return `[${"█".repeat(llenas)}${"·".repeat(Math.max(0, ancho - llenas))}] ${o.enUso}/${o.limite}` +
    (o.esperando > 0 ? ` (+${o.esperando} en cola)` : "");
}

/**
 * DEL DIAGNÓSTICO A LA ACCIÓN (v1.56.8 · evolución de bucles).
 *
 * EL RECLAMO DE MARIO: la pestaña de planificación «no se automatizaba, tenía
 * errores y quedaba con el cartel de atascada sin resolver los problemas». Es
 * exacto: `diagnosticar` produce el veredicto y **ahí muere el asunto**. El cartel
 * rojo queda puesto, el cortacircuito ya enfrió hace un minuto, y nadie mueve nada
 * hasta que el usuario pulsa Reanudar — que además relanza TODO el plan, no lo que
 * se puede soltar.
 *
 * Esta función convierte el mismo dato en la decisión mínima. Es pura y recibe los
 * hechos ya medidos (circuito cerrado o no, dependencia pendiente o no) a propósito:
 * se prueba sin esperar 60 s y sin tocar el muro.
 *
 * Devuelve SIEMPRE un motivo legible. Un desatasco silencioso es tan malo como un
 * atasco silencioso: el usuario no puede saber si el motor resolvió o se rindió.
 */
export type AccionDesatasco = "ninguna" | "liberar_circuito" | "requiere_intervencion";

export function planDeDesatasco(args: {
  /** Tareas bloqueadas con dos hechos medidos, no supuestos. */
  bloqueadas: Array<{ id: string; circuitoCerradoAhora: boolean; dependeDePendiente: boolean }>;
  enCurso: number;
  esperando: number;
  listas: number;
  pendientes: number;
  /** Cuántos desatascos automáticos se intentaron ya (corte de bucle infinito). */
  desatascosHechos: number;
  maxDesatascos?: number;
}): { accion: AccionDesatasco; tareas: string[]; motivo: string } {
  const max = args.maxDesatascos ?? 3;

  // Si algo corre o algo espera hueco, NO es un atasco: es tráfico. Intervenir aquí
  // sería duplicar trabajo en marcha.
  if (args.enCurso > 0 || args.esperando > 0) {
    return { accion: "ninguna", tareas: [], motivo: "hay trabajo en curso o en cola: no se interviene" };
  }

  const liberables = args.bloqueadas
    .filter((b) => b.circuitoCerradoAhora && !b.dependeDePendiente)
    .map((b) => b.id);

  if (liberables.length > 0) {
    if (args.desatascosHechos >= max) {
      return {
        accion: "requiere_intervencion",
        tareas: liberables,
        motivo:
          `Se intentó desatascar ${args.desatascosHechos} vez/veces (techo ${max}) y siguen bloqueadas: ` +
          "el cortacircuito cierra, la tarea vuelve a fallar y se reabre. Eso ya no es un problema de " +
          "programación — falta una clave, hay cuota agotada o el modelo no responde.",
      };
    }
    return {
      accion: "liberar_circuito",
      tareas: liberables,
      motivo:
        `${liberables.length} tarea(s) bloqueada(s) cuyo cortacircuito YA cerró: se liberan y se relanzan ` +
        "sin esperar al usuario.",
    };
  }

  if (args.bloqueadas.length > 0) {
    return {
      accion: "requiere_intervencion",
      tareas: args.bloqueadas.map((b) => b.id),
      motivo:
        "Nada corre y las bloqueadas siguen con el cortacircuito abierto o esperando una " +
        "dependencia muerta: reintentar ahora gastaría el mismo recurso y daría el mismo fallo.",
    };
  }

  if (args.listas + args.pendientes > 0) {
    return {
      accion: "requiere_intervencion",
      tareas: [],
      motivo:
        `Hay ${args.listas + args.pendientes} tarea(s) por hacer y nada corre, sin bloqueadas: ` +
        "el plan no se lanzó o el carril está a cero.",
    };
  }

  return { accion: "ninguna", tareas: [], motivo: "no hay trabajo abierto" };
}

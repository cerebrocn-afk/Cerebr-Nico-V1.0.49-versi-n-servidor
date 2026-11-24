/**
 * manualPerfeccion.ts — EL MANUAL DE LA PERFECCIÓN (v1.79.0)
 * ====================================================================
 * Pedido de Mario 26/10: «perfecioná los bucles de trabajo en sincronía con
 * el plan de ruta de tareas: al inicio de la tarea se fija una ruta para la
 * tarea y se recorren sus rutas relativas… y cuando la auto-mejora actúe, que
 * escriba en perfeccion.md, donde estarán todas las rutas validadas y los
 * procesos con validación — el manual del motor».
 *
 * QUÉ ES ESTE MÓDULO
 * ------------------
 * El ESTADO PURO del manual. No toca disco, red ni reloj: recibe marcas de
 * tiempo inyectadas para poder probarse determinístico (mismo patrón que
 * `auditoriaBucle.ts`: lo que no se puede auditar no se puede afirmar).
 * La cara a disco vive en `manualPerfeccionDisco.ts` (perfeccion.json +
 * perfeccion.md, escritura atómica, patrón del órgano `.con-ciencia`).
 *
 * LAS TRES VERDADES QUE ESTE MÓDULO MANTIENE
 * ------------------------------------------
 * 1. Fijar la ruta. Al crearse un plan, la ruta se FIJA: objetivo + sus
 *    rutas relativas (las tareas). El bucle no decide la ruta: la recorre.
 * 2. Recorrer con evidencia. Cada ruta relativa se marca validada SOLO si el
 *    bucle trajo evidencia de ejecución (regla de la casa heredada de
 *    `evidenciaTurno.ts`: ESCRIBIR NO ES PROBAR). «Hecha» sin evidencia se
 *    cierra como `cerrada_sin_evidencia` — el manual dice la verdad aunque
 *    duela. Fallida se anota con su causa: un manual que solo registra
 *    éxitos no es manual, es propaganda.
 * 3. La auto-mejora escribe. Los procesos que el sistema valida por su
 *    cuenta (lecciones reforzadas, veredictos verdes) llegan como
 *    `registrarProceso` y quedan en el manual con su comando y su número.
 *
 * DETERMINISMO E IDEMPOTENCIA
 * ---------------------------
 * `renderPerfeccionMd` sobre el mismo estado produce los MISMOS bytes: el
 * manual se puede re-renderizar cuantas veces quiera sin crearse diferencias
 * fantasmas, y repetir la misma transición no duplica entradas (las rutas se
 * actualizan in-place por id; los procesos se dedupan por nombre+comando+
 * veredicto).
 */

/** El estado de una ruta relativa (tarea) dentro del manual. */
export type EstadoRuta =
  | "fijada" // la ruta existe pero el bucle aún no la recorrió
  | "validada" // recorrida CON evidencia de ejecución
  | "cerrada_sin_evidencia" // marcada hecha por el bucle, sin evidencia (se anota tal cual)
  | "fallida"; // recorrida y falló; la causa va en `causa`

export interface RutaTareaManual {
  id: string;
  titulo: string;
  tipo?: string;
  estado: EstadoRuta;
  /** Evidencia de ejecución (recorte del resultado del bucle). Obligada para "validada". */
  evidencia?: string;
  /** Causa del fallo (recorte del error). Obligada para "fallida". */
  causa?: string;
  /** Marca de tiempo inyectable de la última transición. */
  ts?: number;
}

export interface RutaManual {
  id: string;
  objetivo: string;
  fijadaEn: number;
  tareas: RutaTareaManual[];
  /** Presente cuando todas las rutas relativas llegaron a estado terminal. */
  completadaEn?: number;
}

export interface ProcesoManual {
  id: string;
  nombre: string;
  /** Comando o procedimiento exacto (p. ej. `npm run validar`). */
  comando?: string;
  /** El veredicto medido (p. ej. "TODO CORRECTO — 8180 comprobaciones, 0 fallos"). */
  veredicto: string;
  /** Quién lo validó (auto-mejora, ouroboros, entrega, …). */
  origen: string;
  ts: number;
}

export interface ManualPerfeccion {
  version: 1;
  rutas: RutaManual[];
  procesos: ProcesoManual[];
}

/** Manual vacío: el estado antes de que el motor valide nada. */
export function nuevoManual(): ManualPerfeccion {
  return { version: 1, rutas: [], procesos: [] };
}

/**
 * Cargador tolerante: un `perfeccion.json` viejo o podrido no debe tumbar el
 * motor — se normaliza lo salvable y se descarta lo que no se entiende
 * (mismo criterio de aduana que `favoriteModels.sanitize`).
 */
export function cargarManual(bruto?: string | null): ManualPerfeccion {
  const m = nuevoManual();
  if (!bruto) return m;
  let dato: any;
  try {
    dato = JSON.parse(bruto);
  } catch {
    return m;
  }
  if (!dato || typeof dato !== "object") return m;
  if (Array.isArray(dato.rutas)) {
    for (const r of dato.rutas) {
      if (!r || typeof r.id !== "string" || !r.id || typeof r.objetivo !== "string") continue;
      const ruta: RutaManual = {
        id: r.id,
        objetivo: r.objetivo,
        fijadaEn: typeof r.fijadaEn === "number" ? r.fijadaEn : 0,
        tareas: Array.isArray(r.tareas)
          ? r.tareas
              .filter((t: any) => t && typeof t.id === "string" && t.id)
              .map((t: any) => ({
                id: t.id,
                titulo: typeof t.titulo === "string" ? t.titulo : t.id,
                tipo: typeof t.tipo === "string" ? t.tipo : undefined,
                estado: (["fijada", "validada", "cerrada_sin_evidencia", "fallida"] as const).includes(t.estado)
                  ? t.estado
                  : "fijada",
                evidencia: typeof t.evidencia === "string" ? t.evidencia : undefined,
                causa: typeof t.causa === "string" ? t.causa : undefined,
                ts: typeof t.ts === "number" ? t.ts : undefined,
              }))
          : [],
      };
      if (typeof r.completadaEn === "number") ruta.completadaEn = r.completadaEn;
      m.rutas.push(ruta);
    }
  }
  if (Array.isArray(dato.procesos)) {
    for (const p of dato.procesos) {
      if (!p || typeof p.id !== "string" || !p.id || typeof p.veredicto !== "string" || !p.veredicto) continue;
      m.procesos.push({
        id: p.id,
        nombre: typeof p.nombre === "string" && p.nombre ? p.nombre : p.id,
        comando: typeof p.comando === "string" ? p.comando : undefined,
        veredicto: p.veredicto,
        origen: typeof p.origen === "string" ? p.origen : "desconocido",
        ts: typeof p.ts === "number" ? p.ts : 0,
      });
    }
  }
  return m;
}

/**
 * 1) FIJAR LA RUTA. Se llama al crearse el plan. Idempotente por id de ruta:
 * re-fijar la misma ruta no duplica (se conserva el avance ya recorrido).
 */
export function fijarRuta(
  m: ManualPerfeccion,
  ruta: { id: string; objetivo: string; tareas: Array<{ id: string; titulo: string; tipo?: string }> },
  ts: number
): RutaManual {
  const existente = m.rutas.find((r) => r.id === ruta.id);
  if (existente) {
    // Rutas nuevas del plan que faltan en el manual se suman; las ya
    // recorridas no se tocan (la ruta ya se recorrió: no se re-fija).
    for (const t of ruta.tareas) {
      if (!existente.tareas.some((e) => e.id === t.id)) {
        existente.tareas.push({ id: t.id, titulo: t.titulo, tipo: t.tipo, estado: "fijada", ts });
      }
    }
    existente.objetivo = ruta.objetivo || existente.objetivo;
    return existente;
  }
  const nueva: RutaManual = {
    id: ruta.id,
    objetivo: ruta.objetivo,
    fijadaEn: ts,
    tareas: ruta.tareas.map((t) => ({ id: t.id, titulo: t.titulo, tipo: t.tipo, estado: "fijada" as EstadoRuta, ts })),
  };
  m.rutas.push(nueva);
  return nueva;
}

/**
 * 2) RECORRER UNA RUTA RELATIVA. Aquí vive la regla que no se negocia:
 * `validada` SOLO con evidencia. Si el bucle dice "hecha" pero no trajo
 * evidencia de ejecución, el manual la cierra como `cerrada_sin_evidencia`
 * (ESCRIBIR NO ES PROBAR, heredado de evidenciaTurno.ts) — y se lo puede ver.
 */
export function recorrerRuta(
  m: ManualPerfeccion,
  rutaId: string,
  transicion: {
    tareaId: string;
    estado: "validada" | "fallida" | "cerrada_sin_evidencia";
    evidencia?: string;
    causa?: string;
  },
  ts: number
): RutaTareaManual | null {
  const ruta = m.rutas.find((r) => r.id === rutaId);
  if (!ruta) return null;
  const t = ruta.tareas.find((e) => e.id === transicion.tareaId);
  if (!t) return null;
  if (transicion.estado === "validada" && !transicion.evidencia?.trim()) {
    t.estado = "cerrada_sin_evidencia";
    t.evidencia = undefined;
  } else {
    t.estado = transicion.estado;
    t.evidencia = transicion.evidencia?.trim() || undefined;
    t.causa = transicion.causa?.trim() || undefined;
  }
  t.ts = ts;
  // ¿La ruta entera llegó a terminal? Se anota la hora de completado (una vez).
  const todasTerminales = ruta.tareas.every(
    (e) => e.estado === "validada" || e.estado === "fallida" || e.estado === "cerrada_sin_evidencia"
  );
  if (todasTerminales && !ruta.completadaEn) ruta.completadaEn = ts;
  return t;
}

/**
 * 3) LA AUTO-MEJORA ESCRIBE. Un proceso que el sistema validó por su cuenta
 * (lección reforzada, veredicto verde de autovalido/ouroboros, entrega
 * autoverificada) queda en el manual con comando y veredicto. Idempotente:
 * re-registrar el mismo proceso (nombre+comando+veredicto) no duplica —
 * se refresca la marca.
 */
export function registrarProceso(
  m: ManualPerfeccion,
  proceso: { nombre: string; comando?: string; veredicto: string; origen: string; id?: string },
  ts: number
): ProcesoManual {
  const clave = (p: ProcesoManual) => `${p.nombre}\u0000${p.comando ?? ""}\u0000${p.veredicto}`;
  const ya = m.procesos.find((p) => p.id === proceso.id) ||
    m.procesos.find((p) => clave(p) === clave({ id: "", nombre: proceso.nombre, comando: proceso.comando, veredicto: proceso.veredicto, origen: proceso.origen, ts }));
  if (ya) {
    ya.ts = ts;
    ya.origen = proceso.origen;
    return ya;
  }
  const p: ProcesoManual = {
    id: proceso.id || `proc-${m.procesos.length + 1}-${String(ts).slice(-6)}`,
    nombre: proceso.nombre,
    comando: proceso.comando?.trim() || undefined,
    veredicto: proceso.veredicto,
    origen: proceso.origen,
    ts,
  };
  m.procesos.push(p);
  return p;
}

/** Resumen de una ruta, para el panel y para los logs (una línea honesta). */
export function resumenRuta(m: ManualPerfeccion, rutaId: string): string {
  const r = m.rutas.find((e) => e.id === rutaId);
  if (!r) return `ruta ${rutaId}: no existe en el manual`;
  const n = (e: EstadoRuta) => r.tareas.filter((t) => t.estado === e).length;
  return `ruta ${r.id} «${r.objetivo}»: ${n("validada")} validada(s), ${n("cerrada_sin_evidencia")} sin evidencia, ${n("fallida")} fallida(s), ${n("fijada")} fijada(s) · ${r.completadaEn ? "completada" : "en curso"}`;
}

function fecha(ts: number): string {
  if (!ts) return "(sin marca)";
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function recorte(s: string, n: number): string {
  const limpio = s.replace(/\s+/g, " ").trim();
  return limpio.length > n ? limpio.slice(0, n) + "…" : limpio;
}

/**
 * LA CARA HUMANA. `perfeccion.md` se renderiza de forma DETERMINISTA: mismo
 * estado → mismos bytes (el orden de rutas y procesos es el de registro; no
 * se reordena, no se añade ruido de reloj ni de memoria).
 */
export function renderPerfeccionMd(m: ManualPerfeccion, versionApp?: string): string {
  const L: string[] = [];
  L.push("# PERFECIÓN — manual del motor (perfeccion.md)");
  L.push("");
  L.push("> Documento vivo que ESCRIBE EL MOTOR, no el usuario: acá quedan TODAS las");
  L.push("> rutas validadas y los procesos con validación. Reglas del manual:");
  L.push("> 1) la ruta se FIJA al crear el plan y se RECORRE por sus rutas relativas (tareas);");
  L.push("> 2) una ruta vale como `validada` SOLO con evidencia de ejecución (escribir no es probar);");
  L.push("> 3) la auto-mejora, cuando actúa, escribe aquí lo que validó, con comando y veredicto.");
  if (versionApp) L.push(`> Última versión del motor que escribió este manual: ${versionApp}.`);
  L.push("");
  const totales = m.rutas.reduce(
    (acc, r) => {
      for (const t of r.tareas) acc[t.estado] += 1;
      return acc;
    },
    { fijada: 0, validada: 0, cerrada_sin_evidencia: 0, fallida: 0 } as Record<EstadoRuta, number>
  );
  L.push(`Rutas: ${m.rutas.length} · Rutas relativas: ${Object.values(totales).reduce((a, b) => a + b, 0)} (${totales.validada} validadas, ${totales.cerrada_sin_evidencia} sin evidencia, ${totales.fallida} fallidas, ${totales.fijada} fijadas) · Procesos con validación: ${m.procesos.length}`);
  L.push("");
  L.push("## RUTAS");
  if (m.rutas.length === 0) {
    L.push("");
    L.push("(Todavía ninguna ruta fijada: el primer plan que el chat cree aparecerá acá con sus rutas relativas.)");
  }
  for (const r of m.rutas) {
    L.push("");
    L.push(`### Ruta ${r.id} — «${recorte(r.objetivo, 120)}»`);
    L.push("");
    L.push(`Fijada: ${fecha(r.fijadaEn)} · ${r.completadaEn ? `Completada: ${fecha(r.completadaEn)}` : "En curso."}`);
    L.push("");
    L.push("| Ruta relativa | Estado | Evidencia / causa |");
    L.push("|---|---|---|");
    for (const t of r.tareas) {
      const detalle =
        t.estado === "fallida"
          ? `Causa: ${recorte(t.causa ?? "(sin causa)", 160)}`
          : t.estado === "validada"
            ? recorte(t.evidencia ?? "(sin evidencia)", 160)
            : t.estado === "cerrada_sin_evidencia"
              ? "El bucle la marcó hecha sin evidencia de ejecución: se anota tal cual (escribir no es probar)."
              : "Aún no recorrida.";
      L.push(`| ${recorte(t.titulo, 60)}${t.tipo ? ` · \`${t.tipo}\`` : ""} | ${t.estado} | ${detalle} |`);
    }
  }
  L.push("");
  L.push("## PROCESOS CON VALIDACIÓN");
  if (m.procesos.length === 0) {
    L.push("");
    L.push("(Todavía la auto-mejora no validó nada: las lecciones reforzadas y los veredictos verdes aparecerán acá con su comando.)");
  } else {
    L.push("");
    L.push("| Proceso | Comando | Veredicto | Origen | Cuándo |");
    L.push("|---|---|---|---|---|");
    for (const p of m.procesos) {
      L.push(`| ${recorte(p.nombre, 80)} | ${p.comando ? `\`${recorte(p.comando, 80)}\`` : "(procedimiento)"} | ${recorte(p.veredicto, 100)} | ${recorte(p.origen, 40)} | ${fecha(p.ts)} |`);
    }
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push("*Escrito por el motor (módulo `manualPerfeccion` + `manualPerfeccionDisco`). Si un tramo dice");
  L.push("`cerrada_sin_evidencia` o `fallida`, el motor lo sabe y lo muestra: este manual no maquilla.*");
  L.push("");
  return L.join("\n");
}

/**
 * planAdaptativo.ts — EL CONTRATO DE ACEPTACIÓN: TERMINADO NO ES LO QUE PARECE (v1.32.0 · FASE 2)
 * =================================================================================================
 * QUÉ ES: la hoja de ruta §3 lo pidió con una frase: «criterios de aceptación
 * ANTES de escribir código, así el modelo no decide al final si "parece
 * terminado"». Este módulo convierte esa frase en estado de motor:
 *
 *   · `set_plan` puede traer por tarea: `tipo`, `archivos`, `presupuesto` y,
 *     LA JOYA, `criterios_aceptacion` (lista de cosas comprobables).
 *   · `update_task` puede traer `evidencia` (texto de la prueba: salida del
 *     build, del test, del HTTP…) — se va enganchando a los criterios abiertos.
 *   · cuando el modelo quiere CERRAR el turno, `decidirBucle` consulta
 *     `estadoContrato()`: si hay criterios sin evidencia, el cierre NO cierra —
 *     el motor devuelve la lista de lo que falta y ordena verificar.
 *   · el PRESUPUESTO por tarea (§20) limita intentos; agotado, la tarea pasa a
 *     `presupuesto_agotado` y el replan se pide solo, sin drama ni bucle.
 *
 * TOLERANCIA HONESTA: un plan sin criterios funciona EXACTAMENTE como en
 * v1.31 (cero regresión — las vallas viejas no se tocan); el contrato solo
 * aprieta cuando el modelo declaró criterios. El anclaje de evidencia es por
 * ORDEN de criterio sin probar (v1.32a); la verificación mecánica por criterio
 * (comando→evidencia) llega con Evidence Engine (v1.34, FASE 4 de la ruta).
 *
 * Estado POR TURNO en memoria de módulo (como espejoVivo/auditoriaBucle):
 * registrarContratoDesdeTareas limpia el anterior — un turno, un contrato.
 */

export type TipoTarea = "crear" | "modificar" | "reparar" | "investigar";
export type EstadoContrato =
  | "abierta" | "en_curso" | "cerrada_sin_verificar" | "verificada" | "presupuesto_agotado";

export interface Criterio {
  texto: string;
  /** Evidencia enganchada (null = sin probar). */
  evidencia: string | null;
}

export interface ContratoTarea {
  id: string;
  objetivo: string;
  tipo: TipoTarea;
  archivos: string[];
  criterios: Criterio[];
  presupuesto: { iteraciones: number; usadas: number };
  estado: EstadoContrato;
}

/** Presupuestos por tipo (§20: pequeña/media/compleja adaptado a la taxonomía de tarea). */
export const PRESUPUESTO_POR_TIPO: Record<TipoTarea, number> = {
  crear: 12,
  modificar: 12,
  reparar: 30,
  investigar: 8,
};

const TIPOS = new Set<string>(["crear", "modificar", "reparar", "investigar"]);

let contrato: ContratoTarea[] = [];

/**
 * Llama ESPEJOVIVO desde `declararPlanVivo` con las tareas CRUDAS del modelo.
 * Parseo tolerante: campos ausentes o torpes no rompen; un criterio vacío no
 * cuenta. Devuelve el contrato construido (para tests y para el panel).
 */
export function registrarContratoDesdeTareas(tareas: unknown): ContratoTarea[] {
  contrato = [];
  if (!Array.isArray(tareas)) return contrato;
  tareas.forEach((raw, i) => {
    const t = (raw || {}) as Record<string, unknown>;
    const id = String(t.id ?? `t${i + 1}`);
    const objetivo = String(t.description ?? t.objetivo ?? t.titulo ?? "").slice(0, 300);
    const tipoRaw = String(t.tipo ?? "").toLowerCase().trim();
    const tipo: TipoTarea = (TIPOS.has(tipoRaw) ? tipoRaw : "crear") as TipoTarea;
    const cruda = Array.isArray(t.criterios_aceptacion) ? t.criterios_aceptacion : Array.isArray(t.criterios) ? t.criterios : [];
    const criterios: Criterio[] = (cruda as unknown[])
      .map((c) => String(c ?? "").trim().slice(0, 240))
      .filter(Boolean)
      .map((texto) => ({ texto, evidencia: null }));
    const archivos = Array.isArray(t.archivos ?? t.archivos_objetivo)
      ? ((t.archivos ?? t.archivos_objetivo) as unknown[]).map((a) => String(a)).filter(Boolean).slice(0, 40)
      : [];
    const presupuesto = Math.max(1, Math.min(60, Number(t.presupuesto_iteraciones) || PRESUPUESTO_POR_TIPO[tipo]));
    const estadoInicial = /complet|hecha|done/i.test(String(t.status ?? "")) ? "cerrada_sin_verificar" : "abierta";
    contrato.push({ id, objetivo, tipo, archivos, criterios, presupuesto: { iteraciones: presupuesto, usadas: 0 }, estado: estadoInicial });
  });
  return contrato;
}

/** `update_task` → espejo → acá. Estados en dos vocabularios (inglés del tool, español del espejo). */
export function actualizarEstadoContrato(taskId: string, estadoCrudo: unknown): void {
  const t = contrato.find((x) => x.id === String(taskId));
  if (!t) return;
  const e = String(estadoCrudo ?? "").toLowerCase();
  if (/in_progress|en_curso|working|running/.test(e)) t.estado = "en_curso";
  else if (/complete|done|hecha|cerrada/.test(e)) {
    t.estado = t.criterios.every((c) => c.evidencia) ? "verificada" : t.criterios.length > 0 ? "cerrada_sin_verificar" : "verificada";
  } else if (/fail|fallida|error/.test(e)) t.estado = "abierta";
}

/** `evidencia` de `update_task`: se engancha AL PRIMER criterio sin probar. */
export function registrarEvidenciaContrato(taskId: string, evidencia: string): boolean {
  const t = contrato.find((x) => x.id === String(taskId));
  if (!t || !evidencia || !evidencia.trim()) return false;
  const abierto = t.criterios.find((c) => !c.evidencia);
  if (!abierto) {
    // Evidencia de sobra: se guarda como extra del último criterio, no se pierde.
    if (t.criterios.length) t.criterios[t.criterios.length - 1].evidencia += ` | + ${evidencia.trim().slice(0, 160)}`;
    return true;
  }
  abierto.evidencia = evidencia.trim().slice(0, 320);
  if (t.criterios.every((c) => c.evidencia) && (t.estado === "cerrada_sin_verificar" || t.estado === "en_curso" || t.estado === "abierta")) {
    t.estado = "verificada";
  }
  return true;
}

/** El fallo come presupuesto: lo llama bucleAutonomo cuando sube el escalón. */
export function consumirIntentoContrato(taskId?: string): void {
  const t = taskId ? contrato.find((x) => x.id === taskId) : contrato.find((x) => x.estado === "en_curso" || x.estado === "abierta");
  if (!t || t.estado === "verificada") return;
  t.presupuesto.usadas += 1;
  if (t.presupuesto.usadas >= t.presupuesto.iteraciones) t.estado = "presupuesto_agotado";
}

export interface EstadoContratoResumen {
  /** true si hay algo que el motor NO deja dar por terminado. */
  abierto: boolean;
  /** Criterios pendientes por tarea (para la directiva). */
  pendientes: Array<{ id: string; objetivo: string; sinVerificar: string[] }>;
  /** Agotados que piden replan, no más intentos. */
  agotados: string[];
  total: number;
  verificacionTotal: number;
}

export function estadoContrato(): EstadoContratoResumen {
  const pendientes: EstadoContratoResumen["pendientes"] = [];
  const agotados: string[] = [];
  let verificadas = 0;
  for (const t of contrato) {
    if (t.estado === "presupuesto_agotado") agotados.push(t.id);
    if (t.estado === "verificada") {
      verificadas++;
      continue;
    }
    const sinVerificar = t.criterios.filter((c) => !c.evidencia).map((c) => c.texto);
    if (t.criterios.length === 0) {
      // Sin criterios declarados NO hay contrato que cerrar: no bloquea (cero regresión).
      if (t.estado !== "abierta" && t.estado !== "en_curso") verificadas++;
      continue;
    }
    if (t.estado === "cerrada_sin_verificar" || (t.estado === "en_curso" && sinVerificar.length)) {
      pendientes.push({ id: t.id, objetivo: t.objetivo, sinVerificar });
    }
  }
  return {
    abierto: pendientes.length > 0 || agotados.length > 0,
    pendientes,
    agotados,
    total: contrato.length,
    verificacionTotal: verificadas,
  };
}

/** LA DIRECTIVA que el motor inyecta cuando el modelo quiere cerrar con contrato abierto. */
export function directivaDeContratoAbierto(e: EstadoContratoResumen): string {
  const partes = [
    "CONTRATO DE ACEPTACIÓN ABIERTO (planAdaptativo v1.32.0): el cierre del turno no procede porque hay criterios SIN evidencia. «Terminado» lo decide el contrato, no la sensación.",
    ...e.pendientes.map((p) => `  · tarea ${p.id}: ${p.sinVerificar.map((c) => `«${c}»`).join(" ")} — verificá (build/test/lectura de disco) y cerrá con update_task adjuntando "evidencia": "la prueba que viste".`),
    ...e.agotados.map((id) => `  · tarea ${id}: PRESUPUESTO AGOTADO — no insistas: proponé un REPLAN (otro enfoque) o declará el bloqueo con causa.`),
    "Si el criterio ya está probado de hecho, manda la evidencia — no repitas la obra.",
  ];
  return partes.join("\n");
}

/** Resumen para el panel/acta: el contrato como tabla de estado. */
export function contratoAParte(): string {
  if (contrato.length === 0) return "";
  return contrato
    .map((t) => `${t.id} [${t.estado}] ${t.criterios.filter((c) => c.evidencia).length}/${t.criterios.length} criterios · ${t.presupuesto.usadas}/${t.presupuesto.iteraciones} iteraciones`)
    .join("\n");
}

/** Pruebas y arranques limpios. */
export function reiniciarContrato(): void {
  contrato = [];
}

/** Solo lectura, para tests y panel. */
export function verContrato(): ContratoTarea[] {
  return contrato.map((t) => ({ ...t, criterios: t.criterios.map((c) => ({ ...c })) }));
}

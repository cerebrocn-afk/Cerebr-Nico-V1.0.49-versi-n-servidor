/**
 * TableroParalelo.tsx — EL MONITOR DE TAREAS PARALELAS (v1.28.0 · Tarea 2)
 * ========================================================================
 * La franja de arriba del Planificador: de un vistazo, qué corre AHORA, cuánto
 * de la máquina se está usando (carriles io/cpu del semáforo global) y un
 * diagnóstico honesto del conjunto (sano / saturado / atascado / inactivo).
 *
 * TODA la aritmética vive en el motor (engine/tableroParalelo.ts), que es puro y
 * está probado (tests/tableroParalelo.test.ts). Este componente SOLO pinta lo que
 * `construirTablero` calcula y lee las MISMAS APIs que PlansPanel
 * (/api/brain/plans y /api/brain/runner): una verdad, no dos fotografías.
 *
 * Regla de la casa: nada que mienta. El estado «atascado» sale en rojo aunque el
 * motor no haya «fallado», porque prometer trabajo y no avanzar es un fallo que
 * un monitor honesto tiene que señalar.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Cpu, Gauge, Loader2, Zap } from "lucide-react";
import {
  construirTablero,
  filtrarPorEstado,
  barraOcupacion,
  ESTADOS_FILTRABLES,
  type PlanPanel,
  type EstadoSemaforo,
  type EstadoTareaPanel,
  type SaludTablero,
} from "../engine/tableroParalelo";

const SEM_VACIO: EstadoSemaforo = {
  io: { enUso: 0, limite: 0, esperando: 0 },
  cpu: { enUso: 0, limite: 0, esperando: 0 },
};

// Color y texto por estado de salud. Determinista: la etiqueta no cambia sola.
const SALUD: Record<SaludTablero, { texto: string; clase: string; Icono: any }> = {
  inactivo: { texto: "Inactivo", clase: "text-zinc-400 border-zinc-600", Icono: Activity },
  sano: { texto: "Sano", clase: "text-emerald-400 border-emerald-600", Icono: CheckCircle2 },
  saturado: { texto: "A tope", clase: "text-amber-400 border-amber-600", Icono: Gauge },
  atascado: { texto: "Atascado", clase: "text-red-400 border-red-600", Icono: AlertTriangle },
};

// Marca por estado de tarea, la misma familia de símbolos que usa el panel.
const MARCA_ESTADO: Record<EstadoTareaPanel, string> = {
  pendiente: "·",
  lista: "○",
  en_curso: "▶",
  hecha: "✓",
  fallida: "✗",
  bloqueada: "⊘",
  cancelada: "⊝",
  descartada: "–",
};

export function TableroParalelo(): React.ReactElement {
  const [planes, setPlanes] = useState<PlanPanel[]>([]);
  const [semaforo, setSemaforo] = useState<EstadoSemaforo>(SEM_VACIO);
  const [filtro, setFiltro] = useState<EstadoTareaPanel | null>(null);
  const [error, setError] = useState<string>("");

  const cargar = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([fetch("/api/brain/plans"), fetch("/api/brain/runner")]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      if (j1?.ok) setPlanes((j1.planes || []) as PlanPanel[]);
      // El semáforo sale igual en los dos endpoints; se prefiere el del runner.
      const sem = (j2?.ok && j2.semaforo) || j1?.semaforo || SEM_VACIO;
      setSemaforo(sem as EstadoSemaforo);
      setError("");
    } catch (e: any) {
      setError(`No se pudo hablar con el motor: ${e?.message || e}`);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // La foto la calcula el motor: aquí no se cuenta nada a mano.
  const tablero = useMemo(() => construirTablero(planes, semaforo), [planes, semaforo]);

  // Refresco: rápido cuando algo se mueve, lento cuando todo está quieto.
  const activo = tablero.enCurso.length > 0 || tablero.planesActivos > 0;
  useEffect(() => {
    const ms = activo ? 1500 : 8000;
    const id = setInterval(() => void cargar(), ms);
    return () => clearInterval(id);
  }, [activo, cargar]);

  const filtradas = useMemo(
    () => (filtro ? filtrarPorEstado(planes, filtro) : []),
    [planes, filtro]
  );

  const s = SALUD[tablero.salud];

  return (
    <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300">
      {/* Fila 1: salud + ocupación de carriles + planes activos */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${s.clase}`}>
          <s.Icono size={13} /> {s.texto}
        </span>

        <span className="inline-flex items-center gap-1" title={barraOcupacion(tablero.ocupacion.io)}>
          <Zap size={13} className="text-sky-400" /> io
          <CarrilBarra frac={tablero.ocupacion.io.fraccion} />
          <span className="tabular-nums text-zinc-400">
            {tablero.ocupacion.io.enUso}/{tablero.ocupacion.io.limite}
            {tablero.ocupacion.io.esperando > 0 ? ` +${tablero.ocupacion.io.esperando}` : ""}
          </span>
        </span>

        <span className="inline-flex items-center gap-1" title={barraOcupacion(tablero.ocupacion.cpu)}>
          <Cpu size={13} className="text-fuchsia-400" /> cpu
          <CarrilBarra frac={tablero.ocupacion.cpu.fraccion} />
          <span className="tabular-nums text-zinc-400">
            {tablero.ocupacion.cpu.enUso}/{tablero.ocupacion.cpu.limite}
            {tablero.ocupacion.cpu.esperando > 0 ? ` +${tablero.ocupacion.cpu.esperando}` : ""}
          </span>
        </span>

        <span className="inline-flex items-center gap-1 text-zinc-400">
          <Loader2 size={13} className={activo ? "animate-spin text-emerald-400" : ""} />
          {tablero.enCurso.length} en curso · {tablero.planesActivos} plan/es activo/s
        </span>
      </div>

      {/* Fila 2: el diagnóstico en cristiano */}
      <div className="mt-1 text-zinc-500">{tablero.diagnostico}</div>

      {/* Fila 3: chips por estado (clic = filtrar). El conteo es el del motor. */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ESTADOS_FILTRABLES.map((e) => {
          const n = tablero.porEstado[e];
          const activoChip = filtro === e;
          return (
            <button
              key={e}
              type="button"
              onClick={() => setFiltro(activoChip ? null : e)}
              disabled={n === 0}
              className={
                "rounded px-1.5 py-0.5 tabular-nums transition " +
                (activoChip
                  ? "bg-emerald-600 text-white"
                  : n === 0
                  ? "cursor-default text-zinc-600"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")
              }
              title={`${n} tarea/s en estado ${e}`}
            >
              {MARCA_ESTADO[e]} {e} {n}
            </button>
          );
        })}
      </div>

      {/* Detalle del filtro: qué tareas están en el estado elegido, con su plan. */}
      {filtro && (
        <div className="mt-1.5 max-h-32 overflow-auto rounded border border-zinc-800 bg-black/30 p-1.5">
          {filtradas.length === 0 ? (
            <div className="text-zinc-500">No hay tareas en estado «{filtro}».</div>
          ) : (
            filtradas.map((x, i) => (
              <div key={`${x.planId}-${x.tarea.id}-${i}`} className="flex items-center gap-2 py-0.5">
                <span className="text-zinc-500">{MARCA_ESTADO[x.tarea.estado]}</span>
                <span className="truncate">{x.tarea.titulo}</span>
                <span className="text-zinc-600">[{x.tarea.peso}]</span>
                <span className="ml-auto truncate text-zinc-600" title={x.objetivo}>
                  {x.tarea.motivoEspera ? `← ${x.tarea.motivoEspera}` : x.objetivo}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {error && <div className="mt-1 text-red-400">{error}</div>}
    </div>
  );
}

/** Una barra de ocupación 0..1, sin texto (el número va al lado). */
function CarrilBarra({ frac }: { frac: number }): React.ReactElement {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  const color = pct >= 100 ? "bg-amber-500" : pct >= 66 ? "bg-sky-500" : "bg-emerald-500";
  return (
    <span className="inline-block h-2 w-14 overflow-hidden rounded bg-zinc-800 align-middle">
      <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

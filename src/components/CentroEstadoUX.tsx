/**
 * CentroEstadoUX.tsx — UX v1: el Centro de Estado y Ayuda
 * =====================================================
 * Un único panel flotante que reúne las 5 mejoras de UX del reporte del chat,
 * sin tocar el servidor (es puro frontend que lee buses y props ya vivos):
 *
 *   1) PANEL DE ESTADO     — versión real, salud del proceso y último resultado.
 *   2) VISIBILIDAD DE DEPS — de qué depende la IDE ahora mismo y si está sano.
 *   3) VISIBILIDAD DE FLUJOS — el paso que se ejecuta y los últimos pasos,
 *                             escuchando el mismo bus `cn:coreo` que la Espina.
 *   4) ATAJOS DE TECLADO   — referencia de los atajos de las acciones repetidas.
 *   5) AYUDA CONTEXTUAL    — pistas según la pestaña/vista en la que estás.
 *
 * El panel se abre con un atajo (ver App.tsx) o desde el botón de la Espina.
 * No desaparece por sí solo: una ayuda que se esconde no ayuda.
 */
import React, { useEffect, useRef, useState } from "react";
import { IDE_BRAND } from "../constants";

export type SeccionUX = "estado" | "deps" | "flujos" | "atajos" | "ayuda";

interface EventoFlujo { accion: string; detalle: string; n: number }

interface SystemStatsLike {
  ide?: { rssMb: number; heapUsedMb: number; cpuPercent: number; uptimeSec: number };
  sandbox?: { running: boolean };
  machine?: { cpuPercent: number | null; totalRamMb: number; freeRamMb: number; cores: number };
  ollama?: { vivo: boolean; residenteMb: number; error?: string };
}

export interface CentroEstadoUXProps {
  open: boolean;
  onClose: () => void;
  seccionInicial?: SeccionUX;
  systemStats: SystemStatsLike | null;
  provider: string;
  currentModel: string;
  apiKeyConfigured: boolean;
  isStreaming: boolean;
  sandboxRunning: boolean;
  extensionesActivas: number;
  activeCenterTab: string;
  activeView: string;
  ultimoLog?: string;
}

/** Verbo humano + icono para cada acción del bus de flujos (espejo de coreo). */
const VERBOS: Record<string, { icono: string; verbo: string; color: string }> = {
  pensar: { icono: "🧠", verbo: "Pensando", color: "#67e8f9" },
  planificar: { icono: "🗺", verbo: "Ordenando el plan", color: "#93c5fd" },
  espejo: { icono: "🪞", verbo: "Revisando en el espejo", color: "#6ee7b7" },
  escribir: { icono: "✍", verbo: "Escribiendo código", color: "#fcd34d" },
  convertir: { icono: "🔁", verbo: "Convirtiendo", color: "#a5b4fc" },
  imagen: { icono: "🖼", verbo: "Revelando imagen", color: "#f9a8d4" },
  forjar: { icono: "⚒", verbo: "Forjando complemento", color: "#86efac" },
  verificar: { icono: "🔍", verbo: "Pasando el crítico", color: "#7dd3fc" },
  bloqueado: { icono: "⛔", verbo: "Bloqueado", color: "#f87171" },
  entregar: { icono: "📦", verbo: "Firmando entrega", color: "#bef264" },
  actividad: { icono: "•", verbo: "Actividad", color: "#94a3b8" },
};

/** Pistas de ayuda según dónde está el usuario. */
function pistasDe(activeCenterTab: string, activeView: string): { titulo: string; pistas: string[] } {
  if (activeView === "web-editor") {
    return {
      titulo: "Editor web",
      pistas: [
        "Escribe tu orden en el chat central: el editor la ensambla y el previsualizador la reproduce.",
        "Hay UN solo chat; lo que escribas aquí llega al mismo hilo.",
        "El registro de actividad de abajo muestra los últimos pasos reales del montaje.",
      ],
    };
  }
  if (activeCenterTab === "self-improvement") {
    return {
      titulo: "Autosuperación",
      pistas: [
        "Los KPI y la tendencia son la prueba numérica de que el sistema mejora.",
        "Cada lección aprendida alimenta la siguiente respuesta del motor.",
        "Pulsa «refrescar» para recalcular el resumen tras una sesión larga.",
      ],
    };
  }
  if (activeCenterTab === "planes") {
    return {
      titulo: "Planes",
      pistas: [
        "Cada aviso del cerebro de tareas se copia también al registro de la terminal.",
        "Un plan en marcha enciende la Espina de abajo con el paso actual.",
      ],
    };
  }
  if (activeCenterTab.startsWith("ext:")) {
    return {
      titulo: "Extensión",
      pistas: [
        "La extensión corre aislada en su propio iframe con permisos acotados.",
        "Si declaró herramientas, el modelo puede llamarlas mientras su pestaña esté abierta.",
      ],
    };
  }
  return {
    titulo: "Chat",
    pistas: [
      "Elige el modelo con Ctrl+K; configura claves y preferencias con Ctrl+,.",
      "Adjunta archivos arrastrándolos al chat; se procesan antes de enviar.",
      "Pide un REPORTE o ESTADO y el motor narra su versión real y evolución actual.",
      "Exporta o importa la sesión para no perder el hilo entre reinicios.",
    ],
  };
}

const ATAJOS: { teclas: string; accion: string }[] = [
  { teclas: "F1  ·  Ctrl + /", accion: "Abrir este Centro de Estado y Ayuda" },
  { teclas: "Ctrl + .", accion: "Alternar el Centro de Estado y Ayuda" },
  { teclas: "Ctrl + K", accion: "Abrir el selector de modelo" },
  { teclas: "Ctrl + ,", accion: "Abrir la configuración (claves y preferencias)" },
  { teclas: "Ctrl + Alt + N", accion: "Empezar un chat nuevo" },
  { teclas: "F11", accion: "Alternar pantalla completa" },
  { teclas: "Esc", accion: "Cerrar el panel o los modales abiertos" },
];

/** Formatea un tiempo de actividad en algo legible. */
function formatearUptime(seg?: number): string {
  if (!seg || seg < 0) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

const TABS: { id: SeccionUX; etiqueta: string; icono: string }[] = [
  { id: "estado", etiqueta: "Estado", icono: "🟢" },
  { id: "deps", etiqueta: "Dependencias", icono: "🧩" },
  { id: "flujos", etiqueta: "Flujos", icono: "🌊" },
  { id: "atajos", etiqueta: "Atajos", icono: "⌨" },
  { id: "ayuda", etiqueta: "Ayuda", icono: "💡" },
];

function Semaforo({ ok, aviso }: { ok: boolean; aviso?: boolean }) {
  const color = aviso ? "#fbbf24" : ok ? "#4ade80" : "#f87171";
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />;
}

export const CentroEstadoUX: React.FC<CentroEstadoUXProps> = ({
  open,
  onClose,
  seccionInicial = "estado",
  systemStats,
  provider,
  currentModel,
  apiKeyConfigured,
  isStreaming,
  sandboxRunning,
  extensionesActivas,
  activeCenterTab,
  activeView,
  ultimoLog,
}) => {
  const [seccion, setSeccion] = useState<SeccionUX>(seccionInicial);
  const [flujoActual, setFlujoActual] = useState<EventoFlujo | null>(null);
  const [anillo, setAnillo] = useState<EventoFlujo[]>([]);
  const anilloRef = useRef<EventoFlujo[]>([]);

  // Al abrir, respeta la sección pedida por el atajo que lo invocó.
  useEffect(() => { if (open) setSeccion(seccionInicial); }, [open, seccionInicial]);

  // VISIBILIDAD DE FLUJOS — escucha el mismo bus que pinta la Espina de abajo.
  // No llama al servidor: se cuelga del CustomEvent ya emitido, así que es
  // frontend puro y queda sano aunque el panel esté cerrado (coste nulo).
  useEffect(() => {
    const alFlujo = (e: Event) => {
      const d = (e as CustomEvent).detail as EventoFlujo | undefined;
      if (!d || typeof d.n !== "number") return;
      setFlujoActual(d);
      const prev = anilloRef.current;
      if (prev[0]?.n === d.n) return;
      const next = [d, ...prev].slice(0, 7);
      anilloRef.current = next;
      setAnillo(next);
    };
    window.addEventListener("cn:coreo", alFlujo as EventListener);
    return () => window.removeEventListener("cn:coreo", alFlujo as EventListener);
  }, []);

  if (!open) return null;

  const ide = systemStats?.ide;
  const servidorVivo = systemStats != null;
  const ollama = systemStats?.ollama;
  const machine = systemStats?.machine;

  // VISIBILIDAD DE DEPENDENCIAS — de qué depende la IDE y cómo está cada pieza.
  const dependencias: { nombre: string; detalle: string; ok: boolean; aviso?: boolean }[] = [
    {
      nombre: "Proveedor del modelo",
      detalle: `${provider} · ${currentModel}` + (apiKeyConfigured ? "" : " (sin clave configurada)"),
      ok: apiKeyConfigured || provider === "ollama",
      aviso: !apiKeyConfigured && provider !== "ollama",
    },
    { nombre: "Servidor local", detalle: servidorVivo ? "respondiendo" : "sin respuesta", ok: servidorVivo },
    {
      nombre: "Ollama (modelos locales)",
      detalle: ollama?.error ? ollama.error : ollama?.vivo ? "activo" : "no detectado",
      ok: !!ollama?.vivo,
      aviso: !ollama?.vivo && !ollama?.error,
    },
    { nombre: "Entorno aislado (sandbox)", detalle: sandboxRunning ? "en marcha" : "detenido", ok: sandboxRunning, aviso: !sandboxRunning },
    { nombre: "Extensiones activas", detalle: `${extensionesActivas} instalada(s) y habilitada(s)`, ok: true },
  ];

  const ayuda = pistasDe(activeCenterTab, activeView);

  const panelEstado = (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg bg-[#0b1120] border border-[#1b2740] px-4 py-3">
        <span className="text-xl">🧠</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">{IDE_BRAND.FULL_NAME}</div>
          <div className="text-[11px] text-zinc-500">Versión real en ejecución · semilla única {IDE_BRAND.SEMVER}</div>
        </div>
        <span className={"ml-auto text-[11px] px-2 py-0.5 rounded-full " + (isStreaming ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300")}>
          {isStreaming ? "● trabajando" : "● en reposo"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
          <div className="text-zinc-500">Memoria del proceso</div>
          <div className="text-zinc-200 text-sm">{ide ? `${Math.round(ide.rssMb)} MB` : "—"}</div>
        </div>
        <div className="rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
          <div className="text-zinc-500">CPU del proceso</div>
          <div className="text-zinc-200 text-sm">{ide ? `${Math.round(ide.cpuPercent)} %` : "—"}</div>
        </div>
        <div className="rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
          <div className="text-zinc-500">Tiempo encendido</div>
          <div className="text-zinc-200 text-sm">{formatearUptime(ide?.uptimeSec)}</div>
        </div>
        <div className="rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
          <div className="text-zinc-500">RAM de la máquina</div>
          <div className="text-zinc-200 text-sm">{machine ? `${Math.round((machine.totalRamMb - machine.freeRamMb) / 1024)} / ${Math.round(machine.totalRamMb / 1024)} GB` : "—"}</div>
        </div>
      </div>
      <div className="rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
        <div className="text-[11px] text-zinc-500 mb-1">Último resultado</div>
        <div className="text-[12px] text-zinc-300 break-words line-clamp-3">{ultimoLog?.trim() || "Sin actividad reciente registrada."}</div>
      </div>
    </div>
  );

  const panelDeps = (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500">De esto depende la IDE ahora mismo. El semáforo indica si cada pieza responde.</p>
      {dependencias.map((d) => (
        <div key={d.nombre} className="flex items-center gap-3 rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
          <Semaforo ok={d.ok} aviso={d.aviso} />
          <div className="min-w-0">
            <div className="text-[12px] text-zinc-200">{d.nombre}</div>
            <div className="text-[11px] text-zinc-500 truncate">{d.detalle}</div>
          </div>
        </div>
      ))}
    </div>
  );

  const panelFlujos = (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">El paso que se ejecuta ahora y los últimos pasos. Se alimenta del mismo bus que la franja inferior.</p>
      {(() => {
        const a = flujoActual ? VERBOS[flujoActual.accion] || VERBOS.actividad : null;
        return (
          <div className="rounded-lg bg-[#0b1120] border border-[#1b2740] px-4 py-3 flex items-center gap-3">
            <span className="text-xl">{a ? a.icono : "💤"}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: a ? a.color : "#94a3b8" }}>{a ? a.verbo : "En reposo"}</div>
              {flujoActual?.detalle ? <div className="text-[11px] text-zinc-500 truncate">{flujoActual.detalle}</div> : <div className="text-[11px] text-zinc-600">Sin paso en curso.</div>}
            </div>
          </div>
        );
      })()}
      <div className="space-y-1">
        {anillo.length === 0 && <div className="text-[11px] text-zinc-600">Aún no hay pasos recientes en esta sesión.</div>}
        {anillo.map((ev, i) => {
          const a = VERBOS[ev.accion] || VERBOS.actividad;
          return (
            <div key={ev.n} className={"flex items-center gap-2 rounded-md px-3 py-1.5 border " + (i === 0 ? "bg-[#0b1120] border-[#243457]" : "bg-transparent border-[#141d2e] opacity-70")}>
              <span>{a.icono}</span>
              <span className="text-[12px]" style={{ color: a.color }}>{a.verbo}</span>
              {ev.detalle && <span className="text-[11px] text-zinc-500 truncate">{ev.detalle}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const panelAtajos = (
    <div className="space-y-1">
      <p className="text-[11px] text-zinc-500 mb-2">Atajos de las acciones repetidas. Funcionan desde cualquier parte de la IDE.</p>
      {ATAJOS.map((s) => (
        <div key={s.teclas} className="flex items-center gap-3 rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
          <kbd className="text-[11px] font-mono text-cyan-300 bg-[#06101f] border border-[#1b2740] rounded px-2 py-0.5 shrink-0">{s.teclas}</kbd>
          <span className="text-[12px] text-zinc-300">{s.accion}</span>
        </div>
      ))}
    </div>
  );

  const panelAyuda = (
    <div className="space-y-2">
      <div className="text-[11px] text-zinc-500">Estás en: <span className="text-cyan-300">{ayuda.titulo}</span></div>
      {ayuda.pistas.map((p, i) => (
        <div key={i} className="flex items-start gap-2 rounded-md bg-[#0b1120] border border-[#1b2740] px-3 py-2">
          <span className="text-cyan-400 mt-0.5">›</span>
          <span className="text-[12px] text-zinc-300">{p}</span>
        </div>
      ))}
    </div>
  );

  const cuerpo = seccion === "estado" ? panelEstado
    : seccion === "deps" ? panelDeps
    : seccion === "flujos" ? panelFlujos
    : seccion === "atajos" ? panelAtajos
    : panelAyuda;

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-[8vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[560px] max-w-[94vw] max-h-[80vh] flex flex-col rounded-xl bg-[#070c15] border border-[#1b2740] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Centro de Estado y Ayuda"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#141d2e]">
          <span className="text-sm font-semibold text-zinc-100">Centro de Estado y Ayuda</span>
          <span className="text-[10px] text-zinc-600">{IDE_BRAND.VERSION}</span>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200 text-lg leading-none" aria-label="Cerrar">×</button>
        </div>
        <div className="flex gap-1 px-3 py-2 border-b border-[#141d2e] overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSeccion(t.id)}
              className={"text-[12px] px-3 py-1.5 rounded-md whitespace-nowrap transition-colors " + (seccion === t.id ? "bg-[#132038] text-cyan-200" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#0d121c]")}
            >
              <span className="mr-1">{t.icono}</span>{t.etiqueta}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{cuerpo}</div>
      </div>
    </div>
  );
};

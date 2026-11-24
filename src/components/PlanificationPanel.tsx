/**
 * PlanificationPanel.tsx — LA HOJA DE RUTA, REDUCIDA A SUS TRES COSAS (v2.3.26)
 * ============================================================================
 * El motor de tareas funcionaba y sólo se veía por API. Esto es la ventana.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE MARIO MANDÓ SACAR (15/11, con las capturas de la hoja en la mano):
 *   «Código 48 · 283 KB / Avisos 2 · 11 KB / Descripciones 6514 · 41,8 MB /
 *    Datos 5 · 1,4 MB / Entregables 1 · 540 KB → TODO ESO QUITARLO. La hoja de
 *    ruta está llena de cosas innecesarias. QUÉ DEJAR: 1) la reconexión de
 *    puertos, 2) pasos de la tarea del agente, la hoja de ruta con los pasos de
 *    la ruta, 3) el entregable final. NADA MÁS EN LA HOJA DE RUTA.»
 *
 * Se fueron de la CARA: el inventario en cinco baldes, la lista del repartidor
 * (hilos, semáforo, ×N, memoria), los interruptores de servicios, el ciclo de
 * decisión, «Acciones en la PC» con sus tandas de ✓, los planes viejos y la
 * barra de progreso por plan.
 *
 * NO se borró ninguna capacidad del motor: `/api/brain/plans`, `/api/brain/runner`,
 * `/api/arranque/interruptor` y el `zip-info` con sus cinco grupos siguen
 * respondiendo igual (el panel completo y la barra derecha los usan). Lo que se
 * quitó es ruido en ESTA cara. Borrar funciones sin veredicto explícito no se hace.
 *
 * Lo que queda, en el orden pedido, lo arma `engine/hojaDeRuta.ts` (puro):
 *   1. reconexión de puertos  → solo lo que está abajo, con qué se pierde;
 *   2. pasos de la tarea      → los del plan vigente, desde el primer paso;
 *   3. entregable final       → uno solo, con nombre y peso, y solo si cerró.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, RefreshCw, Layers, MousePointerClick } from "lucide-react";
import { HojaDeRutaViva } from "./HojaDeRutaViva";
import type { LineaDePuerto } from "../engine/hojaDeRuta";
// v1.0.22 · la edad de la muestra se escribe con la ÚNICA definición de
// «hace 1 h 20 min» del árbol. El subtítulo no inventa su propio reloj.
import { edadLectura } from "../engine/haceTexto";

// ─── Tipos de lo que devuelve el servidor ───────────────────────────────────

interface TareaMini {
  id: string;
  titulo: string;
  estado: string;
  motivoEspera?: string | null;
  /** v1.0.22 · la herramienta que usó el paso y sobre qué (el feed `>_` del panel). */
  herramienta?: string;
  objetivo?: string;
}

/** v1.0.22 · una línea del feed del turno: la última herramienta con su blanco. */
interface FeedMini {
  tool: string;
  sobre?: string;
  ok?: boolean;
  ts?: number;
}

interface PlanMini {
  id: string;
  objetivo: string;
  estado: string;
  /** Viene del motor (`/api/brain/plans`); el cronómetro se niega si no es número. */
  creadoEn?: number;
  vivo?: boolean;
  enSegundoPlano?: boolean;
  tareas?: TareaMini[];
  ms?: number | null;
  log?: FeedMini[];
}

const EN_TRABAJO = new Set(["en_curso", "pendiente", "bloqueada", "fallida"]);
const planVivo = (p: PlanMini) => (p.tareas || []).some((t) => EN_TRABAJO.has(t.estado)) || p.estado === "en_curso";

const ANCHOSTO_PANEL = 320;

/**
 * LOS PUERTOS QUE IMPORTA SABER SI ESTÁN ABAJO. Cada uno con qué se pierde si no
 * responde: un `:11434 abajo` sin decir qué se queda sin motor no informa nada.
 * (Los textos son los de `brechaArranque.avisoDeInferenciaLocal`: si el :11434 cae,
 * los modelos de pago manejados desde la casa se quedan sin índice y sin pre-chequeo.)
 */
const PUERTOS: { puerto: number; quien: string; para: string; sePierde: string }[] = [
  { puerto: 3000, quien: "IDE", para: "el servidor de la app", sePierde: "el chat no puede hablar con el motor" },
  { puerto: 3500, quien: "entorno de prueba", para: "preview", sePierde: "no hay vista previa del proyecto" },
  { puerto: 5000, quien: "puente", para: "herramientas de PC", sePierde: "no se puede leer ni escribir en la carpeta vinculada" },
  { puerto: 5100, quien: "sandbox", para: "la caja de trabajo", sePierde: "el agente no puede ejecutar lo que escribe" },
  { puerto: 5102, quien: "sandbox (respaldo)", para: "la caja de trabajo", sePierde: "el sandbox queda sin segunda vía" },
  // v1.0.27 · el motor del cerebro: estaba en la tabla de interruptores del
  // supervisor pero no en esta lista, así que «apagado a mano» no tenía dónde
  // verse. Se agrega para que los siete puertos se lean igual en las dos caras.
  { puerto: 5103, quien: "motor del cerebro", para: "memoria y planes", sePierde: "el motor no recuerda ni planifica hasta que lo despierten" },
  { puerto: 11434, quien: "inferencia local", para: "Ollama", sePierde: "los modelos de la casa (y los de pago manejados desde acá) van sin índice ni pre-chequeo" },
];

export interface PropsPanel {
  onOpenPanel?: () => void;
  oculto?: boolean;
  anclajeDerecho?: number;
  telemetry?: {
    lastChecked?: number;
    port3000?: boolean; port3500?: boolean; port5000?: boolean;
    port5100?: boolean; port5102?: boolean; port5103?: boolean; port11434?: boolean;
    motivos?: Record<string, string>;
    heredados?: string[];
    incompleto?: boolean;
  } | null;
  onReconnectAll?: () => void;
  isReconnecting?: boolean;
  /**
   * v2.3.26 · la TANDA de ✓ de herramientas se fue de la cara (lo pidió Mario).
   * v1.0.20 · pero el MOTIVO del ✗ no puede desaparecer: sin él el usuario ve
   * una ✗ roja y no sabe si falló un paso o la tarea entera (v1.88.1). Se pinta
   * UNA sola línea, la del último fallo con motivo, arriba de los pasos.
   */
  acciones?: { tool: string; ok: boolean; detail?: string; motivo?: string | null; ts?: number }[];
}

export const PlanificationPanel: React.FC<PropsPanel> = ({
  onOpenPanel,
  oculto,
  anclajeDerecho,
  telemetry = null,
  onReconnectAll,
  isReconnecting = false,
  acciones = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [planes, setPlanes] = useState<PlanMini[]>([]);
  const [entregable, setEntregable] = useState<{
    hayProyecto: boolean; archivos: number; bytes: number; raizRel: string;
    nombre?: string; proyecto?: string; listo?: boolean; peso?: string; faltan?: string[];
    /** v1.0.22 · el servidor negó el paquete: el motivo reemplaza al botón. */
    bloqueado?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [ahora, setAhora] = useState(() => Date.now());
  const ultimaAperturaRef = useRef(0);
  const planesConocidosRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // El estado de los puertos: la MISMA muestra de telemetría que leía la hoja
  // vieja (una sola sonda, un solo criterio). Si el llamador no la pasa, se
  // pregunta al supervisor, que es quien ve los puertos de verdad.
  const [puertosMedidos, setPuertosMedidos] = useState<Record<string, boolean>>({});
  // v1.0.27 · EL INTERRUPTOR VIAJA CON EL PUERTO HASTA LA HOJA.
  // Sin esto la hoja solo sabía «vivo / no vivo», y un :5100 apagado a mano se
  // anunciaba «está abajo» con ⚠ tono falla: una orden del usuario pintada como
  // una caída (el «indicador de servicios apagados» que reportó Mario). Se lee
  // del supervisor, que ya expone la tabla con `interruptor` por servicio; si la
  // lectura falla, queda vacío y la hoja NO afirma «a mano» — no inventa.
  const [interruptores, setInterruptores] = useState<Record<string, string>>({});
  const cargar = useCallback(async (silencioso = false) => {
    try {
      const [rp, re, rv, ri] = await Promise.all([
        fetch("/api/brain/plans").then((r) => r.json()).catch(() => null),
        fetch("/api/sandbox/zip-info").then((r) => r.json()).catch(() => null),
        telemetry ? Promise.resolve(null) : fetch("/api/telemetry").then((r) => r.json()).catch(() => null),
        // La misma cadencia que los planes: apagar un servicio desde la UI se ve
        // en la hoja en el siguiente turno del reloj, no al recargar.
        fetch("/api/arranque/interruptores").then((r) => r.json()).catch(() => null),
      ]);
      if (rv) setPuertosMedidos(rv);
      if (ri && Array.isArray(ri.tabla)) {
        const mapa: Record<string, string> = {};
        for (const fila of ri.tabla) {
          if (fila && typeof fila.puerto === "number" && typeof fila.interruptor === "string") mapa[String(fila.puerto)] = fila.interruptor;
        }
        setInterruptores(mapa);
      }
      if (re && typeof re.hayProyecto === "boolean") {
        setEntregable({
          hayProyecto: !!re.hayProyecto,
          archivos: re.archivos || 0,
          bytes: re.bytes || 0,
          raizRel: re.raizRel || "",
          proyecto: re.proyecto || "",
          nombre: re.nombre || "",
          listo: !!re.listo,
          peso: re.peso || "",
          faltan: Array.isArray(re.faltan) ? re.faltan : [],
          bloqueado: typeof re.motivo === "string" ? re.motivo : "",
        });
      }
      if (rp?.ok && Array.isArray(rp.planes)) {
        const lista = rp.planes as PlanMini[];
        const nuevos = lista.filter((p) => !planesConocidosRef.current.has(p.id));
        setPlanes(lista);
        lista.forEach((p) => planesConocidosRef.current.add(p.id));
        if (!initializedRef.current) {
          initializedRef.current = true;
        } else if (nuevos.some(planVivo)) {
          // Un plan NUEVO vivo abre el indicador una sola vez por ráfaga.
          const t = Date.now();
          if (t - ultimaAperturaRef.current > 6000) {
            ultimaAperturaRef.current = t;
            setIsOpen(true);
          }
        }
        setError("");
      } else if (!silencioso && rp) {
        setError(rp?.error || "el motor no devolvió planes");
      }
    } catch (e: any) {
      if (!silencioso) setError(e?.message || String(e));
    }
  }, [telemetry]);

  useEffect(() => { void cargar(); }, [cargar]);

  const turnoVivo = planes.some((p) => p.vivo && p.estado === "en_curso");
  useEffect(() => {
    const ms = turnoVivo ? 2000 : 10000;
    const id = setInterval(() => void cargar(true), ms);
    return () => clearInterval(id);
  }, [turnoVivo, cargar]);

  // El segundero sólo corre si hay un turno del motor en curso.
  useEffect(() => {
    if (!turnoVivo) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [turnoVivo]);

  // Los eventos del chat fuerzan la recarga inmediata (una sola verdad: la API).
  useEffect(() => {
    const alPlan = () => void cargar();
    window.addEventListener("cerebronico:plan" as any, alPlan as EventListener);
    window.addEventListener("cerebronico:plan-creado" as any, alPlan as EventListener);
    return () => {
      window.removeEventListener("cerebronico:plan" as any, alPlan as EventListener);
      window.removeEventListener("cerebronico:plan-creado" as any, alPlan as EventListener);
    };
  }, [cargar]);

  // El panel publica cuánto espacio ocupa y la columna de chat lo despeja.
  useEffect(() => {
    const raiz = document.documentElement;
    const antes = raiz.style.getPropertyValue("--cn-tareas-gutter");
    raiz.style.setProperty("--cn-tareas-gutter", isOpen ? `${ANCHOSTO_PANEL + 16}px` : "0px");
    return () => { raiz.style.setProperty("--cn-tareas-gutter", antes || "0px"); };
  }, [isOpen]);

  // El botón se ancla debajo de la banda superior REAL, no a un número fijo.
  useEffect(() => {
    const raiz = document.documentElement;
    let raf = 0;
    const medir = () => {
      raf = 0;
      let base = 0;
      document.querySelectorAll<HTMLElement>("[data-cn-topbar]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.bottom > base) base = r.bottom;
      });
      if (base > 0) raiz.style.setProperty("--cn-top-h", `${Math.round(base + 8)}px`);
    };
    const pedir = () => { if (!raf) raf = requestAnimationFrame(medir); };
    medir();
    const ro = new ResizeObserver(pedir);
    const observados = new WeakSet<Element>();
    const reenganchar = () => {
      document.querySelectorAll("[data-cn-topbar]").forEach((el) => {
        if (!observados.has(el)) { observados.add(el); ro.observe(el); }
      });
    };
    reenganchar();
    const mo = new MutationObserver(() => { reenganchar(); pedir(); });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", pedir);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect(); ro.disconnect();
      window.removeEventListener("resize", pedir);
    };
  }, []);

  // Los puertos: telemetría del llamador si vino (una sola sonda por sesión).
  const puertos: LineaDePuerto[] = useMemo(() => {
    const fuente: Record<string, boolean | undefined> = telemetry
      ? { 3000: telemetry.port3000, 3500: telemetry.port3500, 5000: telemetry.port5000, 5100: telemetry.port5100, 5102: telemetry.port5102, 5103: (telemetry as any).port5103, 11434: telemetry.port11434 }
      : { 3000: puertosMedidos.port3000, 3500: puertosMedidos.port3500, 5000: puertosMedidos.port5000, 5100: puertosMedidos.port5100, 5102: puertosMedidos.port5102, 5103: puertosMedidos.port5103, 11434: puertosMedidos.port11434 };
    // Un puerto que esta muestra NO midió no es un verde ni un rojo: es «sin
    // responder ahora», y el servidor puede tener una lectura anterior que vale
    // (heredado). El motivo y la lista de heredados vienen en la misma muestra.
    const motivos = telemetry?.motivos || {};
    const heredados = Array.isArray(telemetry?.heredados) ? telemetry!.heredados! : [];
    return PUERTOS.map((p) => {
      const clave = String(p.puerto);
      const medido = fuente[clave];
      const anteriorVale = heredados.includes(clave) || heredados.includes(`port${clave}`) || heredados.includes(p.puerto as any);
      const motivo = motivos[clave] || motivos[`port${clave}`] || "";
      return {
        puerto: p.puerto,
        quien: p.quien,
        para: p.para,
        sePierde: p.sePierde,
        vivo: medido === true,
        ...(medido === false && anteriorVale ? { heredado: true } : {}),
        ...(motivo ? { motivo } : {}),
        // v1.0.27 · la orden, no la medición: es lo que permite que la hoja diga
        // «apagado a mano» en vez de «está abajo».
        ...(interruptores[clave] ? { interruptor: interruptores[clave] } : {}),
      } as LineaDePuerto;
    });
  }, [telemetry, puertosMedidos, interruptores]);

  // v1.0.22 · EL RELOJ DEL TURNO VIVO. Se calcula con `ahora` (el reloj del
  // navegador, que avanza solo mientras hay turno) sobre `creadoEn` del plan: un
  // cronómetro congelado por el refresco de la API no es un cronómetro.
  const reloj = useMemo(() => {
    for (const p of planes) {
      if (p.estado !== "en_curso" && !(p.tareas || []).some((t) => t.estado === "en_curso")) continue;
      // Cerrado el turno se usa la duración REAL medida por el motor (`ms`).
      if (typeof p.ms === "number" && p.estado !== "en_curso") return { plan: p, seg: Math.round(p.ms / 1000) };
      if (typeof p.creadoEn !== "number") continue;
      return { plan: p, seg: Math.max(0, Math.round((ahora - p.creadoEn) / 1000)) };
    }
    return null;
  }, [planes, ahora]);
  const ultimoFeed: FeedMini | null = useMemo(() => {
    for (let i = planes.length - 1; i >= 0; i--) {
      const log = planes[i]?.log;
      if (Array.isArray(log) && log.length) return log[log.length - 1];
    }
    return null;
  }, [planes]);

  const activos = planes.filter(planVivo);
  const hechas = planes.reduce((n, p) => n + (p.tareas || []).filter((t) => t.estado === "hecha" || t.estado === "hecho").length, 0);
  const totales = planes.reduce((n, p) => n + (p.tareas || []).length, 0);
  // El último ✗ que trajo motivo. No es un feed: es UNA línea con el por qué.
  const ultimoFallo = useMemo(() => {
    for (let i = acciones.length - 1; i >= 0; i--) {
      const a = acciones[i];
      if (a && a.ok === false && a.motivo && String(a.motivo).trim()) return a;
    }
    return null;
  }, [acciones]);
  const fallosConMotivo = acciones.filter((a) => a && a.ok === false && a.motivo && String(a.motivo).trim()).length;
  const abajo = puertos.filter((p) => !p.vivo).length;
  const obraCerrada = activos.length === 0 && !!entregable?.listo;
  const enCurso = planes.some((p) => (p.tareas || []).some((t) => t.estado === "en_curso"));

  if (oculto) return null;

  return (
    <div
      className="fixed z-40 font-sans text-xs pointer-events-none"
      style={{ top: "var(--cn-top-h, 62px)", right: `${anclajeDerecho ?? 8}px` }}
    >
      <button
        onClick={() => setIsOpen((v) => !v)}
        title="Hoja de ruta: puertos, pasos de la tarea y entregable final"
        aria-expanded={isOpen}
        className={`pointer-events-auto flex items-center gap-1.5 border px-2 py-1 rounded-lg shadow-md backdrop-blur transition-all ${
          enCurso || isReconnecting
            ? "bg-[#091122] border-amber-600/60 hover:border-amber-400 text-amber-200"
            : abajo > 0
            ? "bg-[#091122] border-rose-700/70 hover:border-rose-400 text-rose-200"
            : "bg-[#091122] border-[#121a2c] hover:border-cyan-800/60 text-zinc-200"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            enCurso || isReconnecting ? "bg-amber-400 animate-pulse" : abajo > 0 ? "bg-rose-500" : totales ? "bg-sky-400" : "bg-emerald-500"
          }`}
        />
        <span className="font-semibold">Ruta</span>
        <span className="bg-[#050810] text-zinc-400 px-1.5 py-0.5 rounded-full text-[10px] tabular-nums">
          {totales ? `${hechas}/${totales}` : abajo > 0 ? `${abajo}↓` : "✓"}
        </span>
      </button>

      {isOpen && (
        <div
          style={{ width: ANCHOSTO_PANEL }}
          className="pointer-events-auto absolute right-0 top-full mt-1 max-w-[calc(100vw-1.5rem)] max-h-[72vh] overflow-y-auto rounded-2xl border border-[#121a2c] bg-[#04070d]/95 p-2 space-y-2 shadow-2xl backdrop-blur text-zinc-300"
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] font-semibold text-cyan-200/90">Hoja de ruta</span>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-zinc-200" title="Cerrar (el motor sigue trabajando detrás)">
              ✕
            </button>
          </div>

          {/* ── LAS TRES COSAS: puertos · pasos · entregable final ─────────── */}
          <HojaDeRutaViva
            planes={planes}
            puertos={puertos}
            edadMs={telemetry?.lastChecked ? Date.now() - telemetry.lastChecked : null}
            entornoDePrueba={PUERTOS.find((p) => p.puerto === 3500)?.quien}
            reintentando={isReconnecting}
            entregable={entregable ? { nombre: entregable.nombre || "", peso: entregable.peso || "", archivos: entregable.archivos, listo: !!entregable.listo } : null}
            bloqueado={entregable?.bloqueado || ""}
            obraCerrada={obraCerrada}
            onReconnectAll={onReconnectAll}
          />

          {/* v1.0.22 · el cronómetro del turno vivo y el feed de pasos, DEBAJO de la
              hoja. Es la traza del turno (qué herramienta, sobre qué), no otra
              lista de puertos: por eso no compite con las tres cosas de la hoja. */}
          {reloj && (
            <div className="px-1 text-[10px] text-zinc-400 tabular-nums">⏱ {reloj.seg}s</div>
          )}

          {ultimoFeed && (
            <div className="rounded-xl border border-[#121a2c] bg-[#060a12]/80 px-2 py-1.5 text-[10px]">
              <span className="flex items-start gap-1">
                <span className={`shrink-0 font-mono ${ultimoFeed.ok === false ? "text-rose-400" : "text-emerald-400"}`}>&gt;_</span>
                <span className="min-w-0 truncate text-zinc-300">
                  <span className="font-semibold">{ultimoFeed.tool}</span>
                  {ultimoFeed.sobre ? <span className="text-zinc-500"> · {ultimoFeed.sobre}</span> : null}
                </span>
              </span>
            </div>
          )}

          {ultimoFallo && (
            <div
              className="rounded-xl border border-rose-800/60 bg-rose-950/25 px-2 py-1.5 text-[10px] text-rose-200"
              title={ultimoFallo.motivo || ""}
            >
              <span className="flex items-start gap-1">
                <span className="shrink-0">✗</span>
                <span className="min-w-0">
                  <span className="font-semibold">{ultimoFallo.tool}</span>
                  <span className="text-rose-300/90"> — {ultimoFallo.motivo}</span>
                </span>
              </span>
              <span className="block mt-0.5 text-[10px] text-rose-300/60 tabular-nums">
                {fallosConMotivo} intento(s) fallido(s) con motivo en esta sesión
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-800/60 bg-red-950/25 px-2 py-1.5 text-[10px] text-rose-200">
              El motor no contesta: {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-1 pt-1 border-t border-[#121a2c]">
            <button
              onClick={() => { setIsOpen(false); onOpenPanel?.(); }}
              className="flex items-center gap-1.5 text-zinc-300 hover:text-cyan-300 transition-colors"
              title="Abrir el panel completo del cerebro de tareas (inventario, repartidor e interruptores)"
            >
              <Layers size={12} /> Panel completo
            </button>
            <span className="flex items-center gap-1 text-[10px] text-zinc-600" title={enCurso ? `turno en marcha desde ${new Date(ahora).toLocaleTimeString()}` : "sin turno en curso"}>
              <MousePointerClick size={11} /> {enCurso ? "trabajando" : "en reposo"}
            </span>
            <button onClick={() => void cargar()} className="text-zinc-500 hover:text-zinc-200" title="Actualizar ahora">
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanificationPanel;

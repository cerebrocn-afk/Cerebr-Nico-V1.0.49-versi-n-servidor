/**
 * PanelEmbedder.tsx — EL EMBEDDER A LA VISTA (v1.98.0)
 * ====================================================
 * Mario preguntó «¿para qué era el embedding?» y la respuesta honesta es que la
 * interfaz nunca lo dijo: el motor se degradaba a búsqueda por palabra en cada
 * turno y eso sólo se veía en la consola. Este panel cuenta, con palabras
 * humanas y desde la pestaña Puertos:
 *   · QUÉ modelo vectoriza y POR QUÉ ese (residencia real en Ollama, no un
 *     default incrustado en el código);
 *   · cuántas entradas del cerebro tienen vector y cuántas deben todavía;
 *   · qué hizo la última pasada de calentado (y su error, si lo hubo);
 *   · y un botón para calentar YA, sin esperar al turno siguiente.
 *
 * Se basta solo: se autoconsulta y no le pide props a nadie, para no agrandar la
 * cadena de argumentos del `LeftSidebar` (que ya es larga como un brazo). La
 * fuente de verdad es `GET /api/cerebro/embedder` (server/routers/embedderCerebro.ts).
 */
import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, RefreshCw, Flame, CheckCircle2, AlertTriangle } from "lucide-react";

interface EstadoEmbedder {
  ok: boolean;
  error?: string;
  modelo: string | null;
  fuente?: string;
  motivo?: string;
  recomendado?: string;
  instalados?: number;
  cargados?: string[];
  /** v1.99.0 · el escalón de residencia que el IDE pidió para su embedder (ms). */
  residenteMs?: number;
  cerebro?: { entradas: number; conVector: number; deuda: number };
  /**
   * v1.99.4 · EL REFLEJO (dueño puro: `src/engine/cerebroSemilla.ts`).
   * No es el conteo del índice: es cuántas de las piezas que DEBERÍAN ser memoria tienen
   * luz. El tri-estado importa —`deuda` es trabajo pendiente, `nada` es que el archivo no
   * está en el disco— y por eso la cobertura no divide por el total.
   */
  reflejo?: { entradas: number; eje: boolean; luz: number; deuda: number; nada: number; cobertura: string; reflejo: string };
  calentamiento?: {
    enCurso: boolean;
    pasadas: number;
    vectorizados: number;
    fallidos: number;
    ultima?: { lotes: number; vectorizados: number; fallidos: number; ms: number; pendientes: number; aviso?: string; en: number };
  };
}

const REFRESCO_MS = 20_000;

export default function PanelEmbedder() {
  const [estado, setEstado] = useState<EstadoEmbedder | null>(null);
  const [calentando, setCalentando] = useState(false);
  const [error, setError] = useState("");

  const traer = useCallback(async () => {
    try {
      const r = await fetch("/api/cerebro/embedder");
      const j = await r.json();
      setEstado(j);
      setError("");
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    void traer();
    const alarma = setInterval(() => void traer(), REFRESCO_MS);
    return () => clearInterval(alarma);
  }, [traer]);

  const calentar = async () => {
    setCalentando(true);
    try {
      const r = await fetch("/api/cerebro/embedder/calentar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setEstado((await r.json())?.estado ?? null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setCalentando(false);
      void traer();
    }
  };

  const cerebro = estado?.cerebro || { entradas: 0, conVector: 0, deuda: 0 };
  // Sin reflejo no se pinta la línea: el server puede no tener sidecar ni semilla, y
  // «0 %» sería una afirmación sobre un territorio que no se midió.
  const reflejo = estado?.reflejo;
  const sinVector = cerebro.entradas > 0 && cerebro.conVector === 0;
  const sano = cerebro.entradas > 0 && cerebro.deuda === 0 && !!estado?.modelo;
  const ultima = estado?.calentamiento?.ultima;

  return (
    <div className="rounded-xl border border-[#182338] bg-[#0b101c] p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-[10px] font-bold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wide">
          <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" />
          <span>Embedder del cerebro</span>
        </h4>
        <button
          type="button"
          onClick={() => void traer()}
          title="Volver a preguntarle a Ollama qué tiene"
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Qué modelo, y por qué ese: la decisión sale del server, no de un default. */}
      <p className="text-[10px] leading-relaxed">
        <span className={estado?.modelo ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"}>
          {estado?.modelo || "sin embedder"}
        </span>
        {estado?.fuente ? <span className="text-zinc-500"> · {estado.fuente}</span> : null}
      </p>
      {estado?.motivo ? <p className="text-[9px] text-zinc-500 leading-snug mt-0.5">{estado.motivo}</p> : null}

      {/* v1.99.0 · la residencia en palabras, no en «0.0 GB»: lo que el usuario necesita
          saber es si la próxima tanda PAGA LA CARGA o no. El dato ya existía (`cargados`);
          estaba enterrado en una tarjeta de otra sección. */}
      {estado?.modelo ? (
        <p className="text-[9px] leading-snug mt-0.5">
          {(estado.cargados || []).includes(estado.modelo) ? (
            <span className="text-sky-300">◆ Está residente en RAM: la próxima tanda no paga la carga.</span>
          ) : (
            <span className="text-amber-300">
              ◇ Está enfriado: la primera tanda paga la carga del modelo
              {typeof estado.residenteMs === "number"
                ? ` y después lo dejamos ${Math.round((estado.residenteMs || 0) / 1000)} s en RAM (CN_EMBED_KEEP_ALIVE_MS).`
                : "."}
            </span>
          )}
        </p>
      ) : null}

      {/* El número que importa: cuánto recuerdo sabe buscar por SIGNIFICADO.
          v1.99.4 · se retira cuando el índice está vacío: «Memoria vectorial: 0/0» sobre
          un cerebro sin entradas no es un cero, es ruido — el reflejo de abajo ya dice
          por qué no hay nada. */}
      {cerebro.entradas > 0 ? (
      <div className="flex items-center justify-between mt-1.5 text-[10px]">
        <span className="text-zinc-400">
          Memoria vectorial:{" "}
          <span className={sano ? "text-emerald-300 font-semibold" : sinVector ? "text-rose-300 font-semibold" : "text-amber-300 font-semibold"}>
            {cerebro.conVector}/{cerebro.entradas}
          </span>
        </span>
        <span className="text-zinc-600">{cerebro.deuda > 0 ? `deben ${cerebro.deuda}` : "al día"}</span>
      </div>
      ) : null}

      {/* v1.99.4 · LA LUZ DEL REFLEJO (pedido 31/10: «diferenciar entre el eje de todo y la
          nada de algo, dale luz y reflejo iluminanos»). «Memoria vectorial 0/0» respondía la
          pregunta equivocada: no decía si lo que DEBERÍA ser memoria está encendido. Acá se
          ve la cobertura sobre lo que existe, y si el EJE —la pieza que ancla todo lo demás
          en `cerebro.md`— está o no. Con cerebro vacío la línea no miente «100 %»: dice
          «sin semilla». */}
      {reflejo ? (
        <div className="flex items-center justify-between mt-1 text-[10px]">
          <span className="text-zinc-400">
            Reflejo:{" "}
            <span className={reflejo.deuda > 0 ? "text-amber-300 font-semibold" : reflejo.luz > 0 ? "text-emerald-300 font-semibold" : "text-rose-300 font-semibold"}>
              {reflejo.cobertura}
            </span>
          </span>
          <span className={reflejo.eje ? "text-sky-300" : "text-zinc-600"}>{reflejo.eje ? "con eje" : "sin eje"}</span>
        </div>
      ) : null}
      {reflejo ? (
        <p className="text-[9px] text-zinc-600 leading-snug mt-0.5" title={`${reflejo.entradas} entradas de semilla`}>
          {reflejo.reflejo}
        </p>
      ) : null}
      {sinVector ? (
        <p className="text-[9px] text-rose-300/80 leading-snug mt-1 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Sin vectores el cerebro recuerda sólo por palabra exacta: una paráfrasis no encuentra el recuerdo. Dale a calentar o bajá <code className="text-emerald-300">ollama pull {estado?.recomendado || "qwen3-embedding:0.6b"}</code>.</span>
        </p>
      ) : null}

      {ultima ? (
        <p className="text-[9px] text-zinc-600 leading-snug mt-1">
          Último calentado: {ultima.vectorizados} vectorizado(s) en {ultima.lotes} lote(s) · {ultima.ms} ms
          {ultima.fallidos > 0 ? ` · ${ultima.fallidos} caído(s)` : ""}
          {ultima.aviso ? ` — ${ultima.aviso}` : ""}
        </p>
      ) : null}
      {error ? <p className="text-[9px] text-rose-400 mt-1">No se pudo leer el estado: {error}</p> : null}

      <button
        type="button"
        onClick={() => void calentar()}
        disabled={calentando || !estado?.modelo}
        title="Vectoriza las entradas que deben, de a lotes cortos y guardando entre lote y lote. No corta el turno en curso."
        className={`w-full mt-1.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
          calentando || !estado?.modelo
            ? "bg-zinc-800/60 text-zinc-500 border-zinc-700 cursor-wait"
            : sano
              ? "bg-[#0b101c] text-zinc-400 border-[#182338] hover:text-zinc-200"
              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        }`}
      >
        {calentando || estado?.calentamiento?.enCurso ? (
          <>
            <RefreshCw className="w-3 h-3 animate-spin" /> Calentando…
          </>
        ) : sano ? (
          <>
            <CheckCircle2 className="w-3 h-3" /> Índice completo · repasar
          </>
        ) : (
          <>
            <Flame className="w-3 h-3" /> Calentar vectores ahora
          </>
        )}
      </button>
    </div>
  );
}

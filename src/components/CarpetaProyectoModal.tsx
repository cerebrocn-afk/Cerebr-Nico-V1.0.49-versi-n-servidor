/**
 * CarpetaProyectoModal.tsx — «CANAL DIRECTO» (v1.73.0)
 * =====================================================
 * La respuesta al corte de Zai (sesión 1792972925054): el chat no tenía forma de
 * recibir una CARPETA de proyecto ni un .zip como entorno de trabajo. Este modal
 * es el selector que pidió Mario: «selecciono en el chat carpeta/archivo raíz y
 * se comienza a trabajar directo».
 *
 * Dos caminos, un mismo destino (la suite /api/carpeta/*):
 *   1. EXPLORAR EL EQUIPO — navega los discos reales de la máquina (la IDE corre
 *      en localhost, así que el sistema de archivos del usuario ES el del server)
 *      y vincula la carpeta elegida sin copiar un solo byte.
 *   2. SUBIR UN .ZIP — viaja en base64, se materializa en .vinculadas/ y queda
 *      vinculado igual que una carpeta.
 *
 * Al vincular, la ruta entra en `raices_extra` de puente-permitidos.json y se pide
 * un reinicio del puente :5000 para que la acepte de inmediato: así las herramientas
 * fs y pc del modelo operan ahí SIN restricciones ni confirmaciones por archivo.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, FolderOpen, FolderPlus, HardDrive, RefreshCw, Upload, X, Zap } from "lucide-react";

export interface CarpetaVinculadaEstado {
  ruta: string;
  nombre: string;
  origen: "carpeta" | "zip";
  vinculadaEn: number;
  archivos: number;
  bytes: number;
  truncado: boolean;
  muestra?: string[];
  rutaViva?: boolean;
}

interface Entrada { nombre: string; ruta: string; esDir: boolean; tam: number }

interface Props {
  abierto: boolean;
  onClose: () => void;
  vinculada: CarpetaVinculadaEstado | null;
  onVinculada: (estado: CarpetaVinculadaEstado) => void;
  onDesvinculada: () => void;
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

export const CarpetaProyectoModal: React.FC<Props> = ({ abierto, onClose, vinculada, onVinculada, onDesvinculada }) => {
  const [ruta, setRuta] = useState("");
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [raices, setRaices] = useState<string[]>([]);
  const [padre, setPadre] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [info, setInfo] = useState("");
  const zipInputRef = useRef<HTMLInputElement>(null);

  const explorar = useCallback(async (destino: string) => {
    setOcupado(true);
    setError("");
    try {
      const r = await fetch("/api/carpeta/explorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta: destino }),
      }).then((x) => x.json());
      if (r?.ok) {
        setRuta(r.ruta || "");
        setEntradas(r.entradas || []);
        setRaices(r.raices || []);
        setPadre(r.padre || null);
      } else {
        setError(r?.error || "no se pudo leer la carpeta");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setOcupado(false);
    }
  }, []);

  // Al abrir: si no hay ruta en el campo, arranca mostrando los discos.
  useEffect(() => {
    if (!abierto) return;
    if (!ruta) void explorar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const vincular = useCallback(async (unaRuta: string) => {
    setOcupado(true);
    setError("");
    setInfo("");
    try {
      const r = await fetch("/api/carpeta/vincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta: unaRuta }),
      }).then((x) => x.json());
      if (r?.ok && r.vinculada) {
        onVinculada(r.vinculada as CarpetaVinculadaEstado);
        setInfo(`Vinculada: ${r.vinculada.archivos} archivos (${mb(r.vinculada.bytes)}). El puente :5000 se reinicia para aceptarla.`);
        // El puente lee puente-permitidos.json AL NACER: sin reinicio, la raíz
        // nueva no rige hasta el próximo arranque. La IDE ya tiene el endpoint.
        fetch("/api/bridge/restart", { method: "POST" }).catch(() => {});
      } else {
        setError(r?.error || "el motor no pudo vincular esa carpeta");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setOcupado(false);
    }
  }, [onVinculada]);

  const subirZip = useCallback(async (file: File) => {
    setOcupado(true);
    setError("");
    setInfo("");
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = () => reject(new Error("no se pudo leer el zip"));
        fr.readAsDataURL(file);
      });
      const r = await fetch("/api/carpeta/vincular-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: file.name, base64: b64 }),
      }).then((x) => x.json());
      if (r?.ok && r.vinculada) {
        onVinculada(r.vinculada as CarpetaVinculadaEstado);
        setInfo(`ZIP descomprimido y vinculado: ${r.vinculada.archivos} archivos (${mb(r.vinculada.bytes)}).`);
        fetch("/api/bridge/restart", { method: "POST" }).catch(() => {});
      } else {
        setError(r?.error || "el motor no pudo procesar el zip");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setOcupado(false);
    }
  }, [onVinculada]);

  const desvincular = useCallback(async () => {
    setOcupado(true);
    try {
      await fetch("/api/carpeta/desvincular", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      onDesvinculada();
      fetch("/api/bridge/restart", { method: "POST" }).catch(() => {});
      setInfo("Carpeta desvinculada: el agente vuelve a su workspace habitual.");
    } finally {
      setOcupado(false);
    }
  }, [onDesvinculada]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
      ref={(el) => { if (el) el.focus(); }}
    >
      <div
        className="w-full max-w-lg max-w-[min(680px,95vw)] max-h-[85vh] overflow-hidden flex flex-col rounded-xl border border-cyan-500/40 bg-[#070c16] shadow-2xl text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#1a2540] bg-[#0b1322] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FolderPlus className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-mono font-bold text-cyan-200 truncate">CANAL DIRECTO · Carpeta de proyecto</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white shrink-0 ml-auto" title="Cerrar (Escape)">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Estado de la vinculación actual */}
        <div className="px-4 py-2 border-b border-[#141d2e] bg-[#050a12] shrink-0">
          {vinculada ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/50 border border-emerald-700/50 text-emerald-300 font-mono text-[11px]">
                <Check className="w-3 h-3" />
                <span className="truncate max-w-[320px]" title={vinculada.ruta}>{vinculada.ruta}</span>
              </span>
              <span className="text-zinc-500 font-mono text-[10px]">
                {vinculada.archivos} archivos · {mb(vinculada.bytes)}{vinculada.truncado ? " (medida parcial)" : ""} · origen: {vinculada.origen}
              </span>
              {vinculada.rutaViva === false && (
                <span className="text-amber-400 font-mono text-[10px]">⚠ la ruta no existe ahora (¿unidad extraíble?)</span>
              )}
              <button
                onClick={desvincular}
                disabled={ocupado}
                className="ml-auto px-2 py-1 rounded border border-red-800/60 text-red-300 hover:bg-red-950/40 text-[10px] font-mono disabled:opacity-40"
                title="Quitar la vinculación y su permiso del puente"
              >
                Desvincular
              </button>
            </div>
          ) : (
            <p className="text-zinc-500 leading-relaxed">
              Nada vinculado. Elegí una carpeta del equipo o subí un .zip: el modelo trabajará <span className="text-zinc-300">directamente ahí</span>, sin copias ni permisos por archivo.
            </p>
          )}
        </div>

        {/* Explorador */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2.5">
          {/* Barra de ruta */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void explorar(padre || "")}
              disabled={!padre || ocupado}
              className="px-2 py-1.5 rounded border border-[#1a2540] bg-[#0a1120] text-zinc-300 hover:text-cyan-300 disabled:opacity-30 shrink-0"
              title={padre ? `Subir a ${padre}` : "Sin carpeta padre"}
            >
              ↑
            </button>
            <input
              value={ruta}
              onChange={(e) => setRuta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && ruta.trim()) void explorar(ruta.trim()); }}
              placeholder="C:\Ruta\de\tu\proyecto  (Enter para ir)"
              className="flex-1 min-w-0 bg-[#0a1120] border border-[#1a2540] rounded px-2.5 py-1.5 text-zinc-200 font-mono text-[11px] outline-none focus:border-cyan-500/60"
            />
            <button
              onClick={() => void explorar(ruta.trim() || (raices[0] || ""))}
              disabled={ocupado}
              className="px-2.5 py-1.5 rounded border border-cyan-700/50 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/40 shrink-0 disabled:opacity-40"
              title="Ir a la ruta escrita"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ocupado ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Discos */}
          {raices.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <HardDrive className="w-3 h-3 text-zinc-500 shrink-0" />
              {raices.map((r) => (
                <button
                  key={r}
                  onClick={() => void explorar(r)}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${ruta && r.toLowerCase().startsWith(ruta.toLowerCase().slice(0, 2)) && ruta ? "border-cyan-600/60 text-cyan-300 bg-cyan-950/30" : "border-[#1a2540] text-zinc-400 hover:text-cyan-300"}`}
                  title={`Ir a ${r}`}
                >
                  {r.replace(/[\\/]+$/, "")}
                </button>
              ))}
            </div>
          )}

          {/* Botón grande de vincular la carpeta mostrada */}
          {ruta && (
            <button
              onClick={() => void vincular(ruta)}
              disabled={ocupado}
              className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-700/70 to-emerald-600/50 hover:from-emerald-600/80 hover:to-emerald-500/60 border border-emerald-500/50 text-emerald-100 font-mono font-bold text-[12px] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              title="Usar esta carpeta como raíz de trabajo del agente"
            >
              <Zap className="w-3.5 h-3.5" />
              Vincular esta carpeta como proyecto
            </button>
          )}

          {/* Lista de carpetas */}
          <div className="border border-[#141d2e] rounded-lg overflow-hidden">
            {entradas.length === 0 && !ocupado && (
              <div className="px-3 py-6 text-center text-zinc-600">
                {ruta ? "Carpeta vacía o sin subcarpetas legibles" : "Elegí un disco arriba"}
              </div>
            )}
            <div className="max-h-[min(46vh,420px)] overflow-y-auto custom-scrollbar">
              {entradas.filter((e) => e.esDir).slice(0, 500).map((e) => (
                <button
                  key={e.ruta}
                  onClick={() => void explorar(e.ruta)}
                  onDoubleClick={() => void vincular(e.ruta)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-cyan-500/5 text-left border-b border-[#0d1422] last:border-b-0 group"
                  title={`Entrar · doble clic para vincular: ${e.ruta}`}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                  <span className="truncate text-zinc-200">{e.nombre}</span>
                  <FolderPlus className="w-3 h-3 text-emerald-400 opacity-0 group-hover:opacity-100 ml-auto shrink-0" />
                </button>
              ))}
              {/* Los archivos sueltos se listan chiquitos (para no perder el mapa del proyecto) */}
              {entradas.filter((e) => !e.esDir).slice(0, 120).map((e) => (
                <div key={e.ruta} className="flex items-center gap-2 px-3 py-1 border-b border-[#0d1422] last:border-b-0 text-zinc-500">
                  <span className="truncate font-mono text-[10px]">{e.nombre}</span>
                  <span className="ml-auto text-[9px] shrink-0">{e.tam > 0 ? mb(e.tam) : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ZIP */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subirZip(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => zipInputRef.current?.click()}
              disabled={ocupado}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#1a2540] bg-[#0a1120] hover:border-cyan-500/50 text-zinc-300 hover:text-cyan-300 font-mono text-[11px] disabled:opacity-40"
              title="Subir un .zip: se descomprime en el workspace vinculado (.vinculadas/) y queda como raíz de trabajo"
            >
              <Upload className="w-3.5 h-3.5" />
              …o subí un .zip del proyecto
            </button>
            <span className="text-zinc-600 text-[10px]">El ZIP se materializa en <span className="font-mono">.vinculadas/</span> y se vincula igual que una carpeta.</span>
          </div>

          {info && (
            <div className="px-3 py-2 rounded border border-emerald-800/50 bg-emerald-950/30 text-emerald-300 font-mono text-[11px]">{info}</div>
          )}
          {error && (
            <div className="px-3 py-2 rounded border border-red-800/60 bg-red-950/30 text-red-300 font-mono text-[11px] flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="px-4 py-2 border-t border-[#141d2e] bg-[#04070d] shrink-0 text-[10px] text-zinc-600 leading-relaxed">
          💡 Canal directo: la ruta entra en las raíces del puente :5000 (<span className="font-mono">raices_extra</span>) y el agente lee, escribe y ejecuta ahí sin pedir permiso por archivo. Las carpetas críticas del sistema siguen vetadas.
        </div>
      </div>
    </div>
  );
};

export default CarpetaProyectoModal;

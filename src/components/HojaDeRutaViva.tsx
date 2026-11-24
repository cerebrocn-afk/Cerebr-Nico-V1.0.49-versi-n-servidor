/**
 * HojaDeRutaViva.tsx — LOS TRES BLOQUES DE LA HOJA DE RUTA (v2.3.26)
 * ============================================================================
 * Pinta y nada más: toda la lógica de «qué es un paso», «qué puerto está abajo»
 * y «qué entregable cerró» está en `engine/hojaDeRuta.ts`, que es puro y se
 * prueba con tsx sin navegador. Este archivo es la cara.
 *
 * Orden fijo y no negociable (lo pidió Mario así):
 *   1. Reconexión de puertos — sólo los que están abajo, con qué se pierde.
 *   2. Pasos de la tarea     — el plan del agente, desde el primer paso.
 *   3. Entregable final      — uno; el botón de descarga sólo si la obra cerró.
 */

import React from "react";
import { PlugZap, ListChecks, Package, Download, Loader2, AlertTriangle } from "lucide-react";
import {
  reconexionDePuertos,
  pasosDeLaTarea,
  SECCIONES_DE_LA_HOJA,
  MARCA,
  TONO,
  type LineaDePuerto,
  type EntregableFinal,
  type ClaseDePaso,
} from "../engine/hojaDeRuta";

export interface PropsHojaViva {
  planes: any[];
  puertos: LineaDePuerto[];
  reintentando?: boolean;
  /** v1.0.22 · cuántos ms hace de la muestra: se dice, no se supone. */
  edadMs?: number | null;
  /**
   * v1.0.22 · el entorno de prueba (:3500) es el ÚNICO puerto que no tiene
   * interruptor: se menciona aparte, con su qué se pierde,
   * para que no desaparezca de la cara al no caber en la tabla.
   */
  entornoDePrueba?: string;
  entregable: EntregableFinal | null;
  /**
   * v1.0.22 · POR QUÉ NO SE PUEDE BAJAR, en palabras del servidor.
   * Después del incidente del 16/11 (el ZIP salió de la raíz de datos y al
   * descomprimirlo se esparció por el disco) hay un caso que NO es «todavía no
   * está cerrado»: el entregable apunta a la raíz de datos y el servidor lo
   * niega con 409. Ofrecer un botón que va a fallar es exactamente cómo se
   * pierde la confianza, así que el motivo ocupa el lugar del botón.
   */
  bloqueado?: string;
  obraCerrada?: boolean;
  onReconnectAll?: () => void;
}

const Marca = ({ clase }: { clase: ClaseDePaso }) => (
  <span className={`shrink-0 w-[13px] text-center ${TONO[clase]}`}>{MARCA[clase]}</span>
);

const EsReconexion = SECCIONES_DE_LA_HOJA[0] === "reconexion";
const EsPaso = SECCIONES_DE_LA_HOJA[1] === "paso";
const EsEntregable = SECCIONES_DE_LA_HOJA[2] === "entregable";

export const HojaDeRutaViva: React.FC<PropsHojaViva> = ({
  planes,
  puertos,
  reintentando = false,
  edadMs = null,
  entornoDePrueba,
  entregable,
  bloqueado,
  obraCerrada = false,
  onReconnectAll,
}) => {
  const listaPuertos = puertos || [];
  // v1.0.27 · «abajo» y «apagado a mano» dejan de ser lo mismo en la hoja: lo
  // apagado por el usuario lleva un «·» neutro y NO se ofrece reconectar (eso
  // sería deshacerle la orden); lo caído sigue con ✗ y con su fila en la
  // reconexión. El criterio vive en `reconexionDePuertos`; acá solo se separa
  // para no pintar la lista con dos verdades.
  // El dato llega en cada línea (`p.interruptor`): apagado a mano ≠ caído.
  const caidos = listaPuertos.filter((p) => !p.vivo && p.interruptor !== "apagado");
  const apagadosAMano = listaPuertos.filter((p) => !p.vivo && p.interruptor === "apagado");
  void apagadosAMano;
  const recon = reconexionDePuertos(listaPuertos, reintentando, edadMs);
  const entorno = (entornoDePrueba || "").trim();
  const tarea = pasosDeLaTarea(planes || []);
  const descargable = !!(entregable && entregable.nombre && obraCerrada && entregable.listo && !bloqueado);
  const total = tarea.pasos.length;
  const hechas = tarea.pasos.filter((p) => p.clase === "hecho").length;

  return (
    <div className="space-y-2">
      {/* ── 1 · RECONEXIÓN DE PUERTOS ─────────────────────────────────────── */}
      {EsReconexion && (
        <section className="rounded-xl border border-[#121a2c] bg-[#060a12]/80 p-2">
          <header className="flex items-center justify-between gap-2 mb-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
              <PlugZap size={12} className="text-cyan-300" /> Reconexión de puertos
            </span>
            {caidos.length > 0 && onReconnectAll && (
              <button
                onClick={onReconnectAll}
                disabled={reintentando}
                className="flex items-center gap-1 rounded-md border border-amber-700/60 bg-amber-950/30 px-1.5 py-0.5 text-[10px] text-amber-200 hover:border-amber-400 disabled:opacity-50"
                title="Levanta otra vez los puertos caídos (puente, telemetría, modelos)"
              >
                {reintentando ? <Loader2 size={10} className="animate-spin" /> : <PlugZap size={10} />}
                {reintentando ? "Reconectando…" : "Reconectar"}
              </button>
            )}
          </header>

          {entorno && (
            <p className="mb-1.5 text-[10px] leading-snug text-zinc-500">
              entorno de prueba :3500 ({entorno}) — arranca con la IDE y no se enciende desde acá: si está abajo, no hay vista previa del proyecto
            </p>
          )}

          {recon.length === 0 ? (
            <p className="text-[10px] text-zinc-500">Sin muestra de puertos todavía.</p>
          ) : caidos.length === 0 ? (
            <p className="text-[10px] text-emerald-300/80">
              Todos los puertos contestan{apagadosAMano.length > 0 ? " o estan apagados a mano, que no es una falla" : ""}.
            </p>
          ) : (
            <ul className="space-y-1">
              {caidos.map((p) => (
                <li key={`${p.puerto}-${p.quien}`} className="flex items-start gap-1.5">
                  <span className="shrink-0 mt-[1px] text-rose-400">✗</span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-zinc-200 truncate">
                      <span className="font-mono text-rose-300">:{p.puerto}</span> {p.quien}
                    </div>
                    {p.sePierde && (
                      <div className="text-[10px] leading-snug text-zinc-500">Se pierde: {p.sePierde}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── 2 · PASOS DE LA TAREA ────────────────────────────────────────── */}
      {EsPaso && (
        <section className="rounded-xl border border-[#121a2c] bg-[#060a12]/80 p-2">
          <header className="flex items-center justify-between gap-2 mb-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
              <ListChecks size={12} className="text-sky-300" /> Pasos de la tarea
            </span>
            {total > 0 && (
              <span className="text-[10px] tabular-nums text-zinc-500">{hechas}/{total}</span>
            )}
          </header>

          {total === 0 ? (
            <p className="text-[10px] text-zinc-500">
              Sin tarea en marcha. Cuando el agente arme su plan, los pasos aparecen acá desde el primero.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-400 truncate" title={tarea.titulo}>
                {tarea.titulo}
                {tarea.cerrado && <span className="text-zinc-600"> · plan ya cerrado</span>}
              </p>
              <ol className="space-y-0.5">
                {tarea.pasos.map((f, i) => (
                  <li key={f.id || i} className="flex items-start gap-1.5">
                    <Marca clase={f.clase} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[10px] leading-snug ${f.clase === "hecho" ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                        <span className="tabular-nums text-zinc-600 mr-1">{i + 1}.</span>
                        {f.titulo}
                      </div>
                      {f.motivo && (
                        <div className="flex items-start gap-1 text-[10px] leading-snug text-amber-300/80">
                          <AlertTriangle size={9} className="mt-[2px] shrink-0" />
                          <span className="truncate" title={f.motivo}>{f.motivo}</span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* ── 3 · ENTREGABLE FINAL ─────────────────────────────────────────── */}
      {EsEntregable && (
        <section className="rounded-xl border border-[#121a2c] bg-[#060a12]/80 p-2">
          <header className="flex items-center gap-1.5 mb-1.5">
            <Package size={12} className="text-emerald-300" />
            <span className="text-[11px] font-semibold text-zinc-200">Entregable final</span>
          </header>

          {bloqueado ? (
            <p className="text-[10px] text-amber-300/90 leading-snug">{bloqueado}</p>
          ) : !entregable || !entregable.nombre ? (
            <p className="text-[10px] text-zinc-500">Todavía no hay proyecto cerrado para empaquetar.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-zinc-200 truncate" title={entregable.nombre}>
                  {entregable.nombre}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                  {entregable.peso || `${entregable.archivos} arch.`}
                </span>
              </div>
              {descargable ? (
                <a
                  href="/api/sandbox/zip"
                  download={entregable.nombre}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-700/60 bg-emerald-950/30 px-2 py-0.5 text-[10px] text-emerald-200 hover:border-emerald-400"
                >
                  <Download size={10} /> Descargar {entregable.nombre}
                </a>
              ) : (
                <p className="text-[10px] text-zinc-500">
                  Se habilita cuando el motor cierre el último paso.
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default HojaDeRutaViva;

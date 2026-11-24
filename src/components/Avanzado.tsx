/**
 * Avanzado.tsx — EL ⚙ QUE ORDENA LA SUPERFICIE (v1.83.0 · FASE 4)
 * ==============================================================
 * La regla del plano (V8 §7.2, medida en la queja de Mario 26/10): panel con
 * más de 3 acciones ⇒ UNA primaria visible y el resto plegada en
 * «⚙ Avanzado», PLEGADO POR DEFECTO. Lo plegado no se borra: cambia de lugar,
 * no de existencia.
 *
 * El registro de qué se pliega en cada panel vive en `contratoSuperficie.ts`
 * (puro, probado); este componente es solo la pieza visual. `data-avanzado`
 * es el ancla que lee la suite `superficie.test.ts` desde la fuente del
 * componente dueño: si alguien saca el botón de adentro sin actualizar el
 * contrato, el test se pone rojo antes que Mario.
 */
import * as React from "react";
import { useState } from "react";
// v1.83.0 · el ⚙ se autoinvalida contra el contrato: si un panel pide ⚙ sin
// estar registrado (o con otras acciones que las declaradas), el boton lo dice
// en vez de callarse. Y el contador «(N)» sale del REGISTRO, no del DOM: la
// superficie que se ve es la que se firmo.
import { panelPorId } from "../engine/contratoSuperficie";

export const Avanzado: React.FC<{
  /** id del contrato (contratoSuperficie.ts). Se estampa en data-avanzado. */
  panel: string;
  children: React.ReactNode;
  /** Clases del contenedor del botón + contenido (flex del panel dueño). */
  clase?: string;
  /** Título del botón: dice QUÉ se guarda adentro, no solo «avanzado». */
  titulo?: string;
}> = ({ panel, children, clase, titulo }) => {
  const [abierto, setAbierto] = useState(false);
  const contrato = panelPorId(panel);
  const cuenta = contrato ? contrato.avanzadas.length : -1;
  return (
    <div className={clase || "w-full"} data-avanzado={panel}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        title={contrato ? (titulo || "Acciones secundarias — viven acá para que la barra respire") : `AVISO: panel «${panel}» no está en contratoSuperficie.ts — registralo o sacale el ⚙`}
        className="px-2 py-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-600 rounded-md transition-colors"
      >
        {"⚙ Avanzado"}
        {cuenta >= 0 ? ` (${cuenta})` : " (?)"} {abierto ? "▲" : "▼"}
      </button>
      {abierto && (
        <div className="flex flex-wrap items-center gap-1 pt-1 min-w-0" data-avanzado-contenido={panel}>
          {children}
        </div>
      )}
    </div>
  );
};

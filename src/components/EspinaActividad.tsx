/**
 * EspinaActividad.tsx — COREO v1: la barra de actividad choreografiada
 * ====================================================================
 * Franja fija de 26px al pie de la IDE (por eso su montaje no altera el
 * layout: es position:fixed). Cada 700 ms lee GET /api/coreo — el mismo
 * régimen de polling que la cola de invocaciones del puente, probada — y
 * pinta chips animados: el VERBO del momento en grande y los últimos cuatro
 * eventos detrás. Al cambiar el evento de fondo despacha
 * `CustomEvent("cn:coreo")` para que otros órganos (el cerebro del Header,
 * la preview, futuros toques de sección) dancen del mismo bus.
 * Sin planes corriendo, la espina muestra el reposo — no se esconde: una
 * interfaz que desaparece cuando calla no es una interfaz que escucha.
 */
import React, { useEffect, useRef, useState } from "react";
import { ACCIONES, hojaCoreoCss, type EventoCoreo } from "../engine/coreo";
import {
  INTERVALO_LATIDO_MS,
  PLAZO_LATIDO_MS,
  RUTA_LATIDO,
  clasificarFalloLatido,
  estadoLatido,
  registrarLatido,
} from "../engine/latido";

interface EstadoCoreo {
  ok: boolean;
  emitidos: number;
  actual: EventoCoreo | null;
  anillo: EventoCoreo[];
}

/**
 * v1.86.4 — el latido viaja por su propio bus. La cabecera y el panel de puertos
 * lo escuchan: así la frase «motor listo» deja de ser un literal y pasa a ser
 * la consecuencia de un 200 comprobado. `vivo: null` = todavía sin medir.
 */
export function difundirLatido(vivo: boolean | null, chip = ""): void {
  const l = registrarLatido(vivo, chip);
  try {
    window.dispatchEvent(new CustomEvent("cn:latido", { detail: l }));
  } catch {
    /* el bus no puede tumbar la espina */
  }
}

export const EspinaActividad: React.FC = () => {
  const [estado, setEstado] = useState<EstadoCoreo | null>(null);
  const [caido, setCaido] = useState<string | null>(null);
  const ultimoN = useRef(0);

  useEffect(() => {
    // la hoja de movimiento se inyecta una sola vez, idempotente
    if (!document.getElementById("cn-coreo-hoja")) {
      const hoja = document.createElement("style");
      hoja.id = "cn-coreo-hoja";
      hoja.textContent = hojaCoreoCss();
      document.head.appendChild(hoja);
    }
    let vivo = true;
    // v1.86.4 · EL SONDEO NO PUEDE AHOGAR LO QUE SONDEA.
    // Medido el 28/10/2026: cada 700 ms salía un `fetch` nuevo sin esperar la
    // respuesta del anterior. Si el 3000 se atraganta, los fetch se acumulan
    // colgados y Chrome corta a 6 conexiones por origen: a los ~4 segundos la
    // espina se había quedado con todo el cupo y NADIE más podía hablar con el
    // servidor — ni el chat (`/api/ai/stream`), ni la telemetría, ni las imágenes.
    // Un vigilante que bloquea la puerta no vigila. De aquí en adelante: una sola
    // lectura en vuelo y cada lectura caduca.
    let enVuelo = false;
    // v1.0.15 · contador de fallos consecutivos del latido (anti-falso-positivo)
    let fallosSeguidos = 0;
    let piloto: AbortController | null = null;
    const leer = async () => {
      if (enVuelo) return;
      enVuelo = true;
      piloto = new AbortController();
      const mio = piloto;
      const caduca = setTimeout(() => mio.abort(), PLAZO_LATIDO_MS);
      try {
        const r = await fetch(RUTA_LATIDO, { signal: mio.signal });
        if (!r.ok) throw { status: r.status };
        const j = await r.json();
        if (!vivo) return;
        fallosSeguidos = 0;
        setCaido(null);
        difundirLatido(true);
        setEstado(j);
        if (j?.actual && j.actual.n !== ultimoN.current) {
          ultimoN.current = j.actual.n;
          window.dispatchEvent(new CustomEvent("cn:coreo", { detail: j.actual }));
          // el cerebro del Header también respira con el bus (v1.1 lo hará fino)
          (window as unknown as { __cnCoreo?: string }).__cnCoreo = j.actual.accion;
        }
      } catch (err) {
        if (!vivo) return;
        // v1.86.4 — se guarda el MOTIVO. Antes el catch tiraba el error a la
        // basura y solo dejaba un booleano, así que la pantalla decía «el motor
        // no contesta» sin poder distinguir «el proceso del 3000 murió» de
        // «el servidor respondió 500». Un fallo sin su causa es medio fallo.
        const motivo = mio.signal.aborted
          ? `sin respuesta en ${PLAZO_LATIDO_MS} ms`
          : clasificarFalloLatido(err);
        // v1.0.15 · NO DECLARAR «caído» AL PRIMER TROPIEZO. Durante un turno
        // largo el :3000 está ocupado sirviendo /api/ai/stream y un /api/coreo
        // puede tardar más que su plazo UNA vez sin que el servidor esté muerto.
        // Antes un solo fallo pintaba «servidor local caído» en medio del trabajo
        // (pedido de Mario 09/11). Ahora hace falta silencio sostenido: 3 lecturas
        // fallidas seguidas antes de declararlo.
        fallosSeguidos++;
        if (fallosSeguidos >= 3) {
          setCaido(motivo);
          difundirLatido(false, estadoLatido({ vivo: false, motivo }).chip);
        }
      } finally {
        clearTimeout(caduca);
        if (piloto === mio) piloto = null;
        enVuelo = false;
      }
    };
    difundirLatido(null); // «sin medir», hasta que la primera lectura diga otra cosa
    leer();
    const t = setInterval(leer, INTERVALO_LATIDO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
      try { piloto?.abort(); } catch { /* ya terminó */ }
    };
  }, []);

  const chip = (ev: EventoCoreo, vivo: boolean) => {
    const a = ACCIONES[ev.accion] || ACCIONES.actividad;
    return (
      <span
        key={ev.n}
        className={"cn-coreo-chip " + (vivo ? "cn-coreo-live " : "opacity-70 ") + "cn-anim-" + a.anim}
        style={{ color: a.color, background: "rgba(6,10,20,.75)" }}
        title={ev.detalle}
      >
        {a.icono} {a.verbo}{ev.detalle ? <> <small>{ev.detalle}</small></> : null}
      </span>
    );
  };

  const anillo = estado?.anillo ?? [];
  const actual = anillo[0];
  const latido = caido !== null ? estadoLatido({ vivo: false, motivo: caido }) : null;

  return (
    <div className="pointer-events-none fixed bottom-0 inset-x-0 z-40 h-[26px] bg-[#04070d]/95 border-t border-[#121824] flex items-center gap-2 px-3 backdrop-blur-sm overflow-hidden">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 shrink-0">espina</span>
      {latido && (
        <span className="cn-coreo-chip" style={{ color: "#f87171" }} title={latido.consecuencia}>
          {latido.chip}
        </span>
      )}
      {!latido && !actual && <span className="text-[11px] text-zinc-600">en reposo · esperando la primera orden</span>}
      {!latido && actual && (
        <>
          {chip(actual, true)}
          {anillo.slice(1, 5).map((e) => <span key={e.n} className="hidden xl:inline">{chip(e, false)}</span>)}
        </>
      )}
      <span className="ml-auto text-[9px] text-zinc-700 shrink-0">
        {estado ? `${estado.emitidos} eventos` : ""}
      </span>
    </div>
  );
};

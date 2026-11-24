/**
 * BootSplash.tsx — Pantalla de carga de CerebroNico (v2.1)
 * =======================================================
 * «CerebroNico arrancando motor», con un cerebro que piensa y **chispas que
 * saltan** de los anillos.
 *
 * Cambios de esta versión (a petición: "se ve muy chico, hacelo más grande e
 * iluminado, como saliendo chispas"):
 *  - Cerebro de ~220 px (antes ~120), escalado con `clamp()` para que se adapte
 *    a pantallas pequeñas sin encogerse en las grandes.
 *  - Doce chispas que recorren los anillos hacia afuera, con cabeza brillante y
 *    estela que se desvanece. Más un estallido cuando el arranque termina.
 *  - Halos y resplandores con `box-shadow` en lugar de `filter: blur()`, porque
 *    el desenfoque repinta en CPU y aquí se nota (equipos con poca RAM y pocos núcleos: el umbral
 *    real lo mide `presionEquipo`, no este comentario). Mismo
 *    brillo, menos trabajo.
 *  - Textos y filas de comprobación más grandes y legibles.
 *
 * La función NO cambia: consulta /api/health/deep, muestra el estado real de
 * cada pieza y deja entrar cuando termina. Si algo no responde, se ve antes de
 * entrar y se puede continuar con el botón.
 */

import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Minus, X } from "lucide-react";
import { PLAZO_SONDA_MS, debeEntrar, porQueSeAbrio } from "../arranque/guionArranque";
import { PUERTOS_DE_ARRANQUE } from "../engine/puertosArranque";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  fix?: string;
  /** v2.3.12 · los tres estados de la casa: vivo / sin-arrancar / caido. */
  estado?: "vivo" | "sin-arrancar" | "caido";
  /** v2.3.12 · `false` = se muestra pero no retiene el telón (ver `guionArranque`). */
  bloqueante?: boolean;
}

/**
 * v2.3.12 · TRES COLORES, NO DOS. Es el criterio que Mario fijó el 4/11 para el
 * chip del :5103 y que acá se aplica a la tabla entera:
 *   · verde — vive
 *   · gris  — no nació y es de los que nacen bajo demanda (no es una falla)
 *   · rojo  — debía estar y no está
 * Con dos colores había que elegir entre dos mentiras: pintar de rojo el
 * sandbox a las nueve de la mañana (nunca se abrió) o pintar de verde un puente
 * caído. El tercer estado es lo que hace posible mostrar los SIETE sin ruido.
 */
function semaforo(c: Check): "vivo" | "gris" | "rojo" {
  if (c.estado) return c.estado === "vivo" ? "vivo" : c.estado === "sin-arrancar" ? "gris" : "rojo";
  return c.ok ? "vivo" : "rojo";
}

const ESTILOS = `
@keyframes cns-girar { to { transform: rotate(360deg); } }
@keyframes cns-girar-inv { to { transform: rotate(-360deg); } }
@keyframes cns-latir {
  0%, 100% { transform: scale(1); opacity: .95; }
  50% { transform: scale(1.06); opacity: 1; }
}
@keyframes cns-respirar {
  0%, 100% { opacity: .35; transform: scale(.92); }
  50% { opacity: .8; transform: scale(1.08); }
}
/* Chispa: nace en el centro de los anillos y sale disparada hacia afuera,
   brillando y dejando estela hasta apagarse. */
@keyframes cns-chispa {
  0%   { transform: translate(0,0) scale(.35); opacity: 0; }
  10%  { opacity: 1; }
  70%  { opacity: .9; }
  100% { transform: translate(var(--dx), var(--dy)) scale(.1); opacity: 0; }
}
@keyframes cns-barrido {
  0%   { transform: translateY(-110%); opacity: 0; }
  40%  { opacity: .5; }
  100% { transform: translateY(210%); opacity: 0; }
}
@keyframes cns-entrada {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
@keyframes cns-estallido {
  0%   { transform: scale(.6); opacity: .9; }
  100% { transform: scale(1.9); opacity: 0; }
}
.cns-chispa {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  border-radius: 999px;
  background: radial-gradient(circle, #ffffff 0%, #7dd3fc 45%, rgba(34,211,238,0) 72%);
  box-shadow: 0 0 10px 3px rgba(34,211,238,.75), 0 0 22px 6px rgba(56,189,248,.35);
  animation: cns-chispa var(--dur, 2.4s) cubic-bezier(.22,.61,.36,1) infinite;
  animation-delay: var(--delay, 0s);
}
`;

const MENSAJES = [
  "encendiendo el motor",
  "cargando la ley del cerebro",
  "midiendo el hardware disponible",
  "abriendo la memoria del proyecto",
  "comprobando Ollama y el puente",
  "listo para trabajar",
];

export const BootSplash: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  const [checks, setChecks] = useState<Check[]>([]);
  const [terminado, setTerminado] = useState(false);
  const [mensaje, setMensaje] = useState(0);
  const [error, setError] = useState("");
  const inicio = useRef<number>(Date.now());
  const checksRef = useRef<Check[]>([]);

  // Chispas: direcciones repartidas en círculo, con duración y retardo variados
  // para que no salten todas a la vez (si no, parece un parpadeo, no chispas).
  const chispas = useRef(
    Array.from({ length: 12 }, (_, i) => {
      const ang = (i / 12) * Math.PI * 2 + (i % 2 ? 0.26 : 0);
      const dist = 92 + (i % 3) * 16;
      return {
        dx: `${Math.cos(ang) * dist}px`,
        dy: `${Math.sin(ang) * dist}px`,
        dur: `${2 + (i % 4) * 0.35}s`,
        delay: `${(i % 6) * 0.28}s`,
      };
    })
  ).current;

  useEffect(() => {
    let vivo = true;
    const rotar = window.setInterval(() => setMensaje((m) => (m + 1) % MENSAJES.length), 1300);

    // v2.1.3 — Tres cosas que antes no existían y hacían que el telón no se
    // abriera NUNCA cuando el motor se quedaba mudo:
    //   1. `enCurso`: el sondeo de cada 1,2 s ya no apila peticiones. Con el
    //      motor cargando un modelo, cada vuelta tardaba más que el intervalo y
    //      se iban acumulando: el navegador abría seis conexiones, las seis
    //      esperaban, y la séptima ya no salía.
    //   2. `AbortController` por intento: una pasada no puede durar más que
    //      PLAZO_SONDA_MS. Antes no había plazo del lado del cliente.
    //   3. El vigilante: la decisión de entrar se recalcula por reloj cada
    //      250 ms, así que no depende de que el `fetch` conteste. Es la pieza
    //      que cumple de verdad «no se deja al usuario atrapado».
    let enCurso = false;
    let cerrado = false;
    let ultimoError = "";

    const abrir = (motivo: string) => {
      if (cerrado || !vivo) return;
      cerrado = true;
      console.info(`[arranque] telón arriba: ${motivo}`);
      window.setTimeout(() => vivo && setTerminado(true), 250);
    };

    const evaluar = () => {
      const d = debeEntrar({
        ahora: Date.now(),
        inicio: inicio.current,
        checks: checksRef.current,
        ultimoError,
      });
      if (d.entrar) abrir(porQueSeAbrio(d));
    };

    const consultar = async () => {
      if (enCurso || cerrado) return;
      enCurso = true;
      const ctl = new AbortController();
      const reloj = window.setTimeout(() => ctl.abort(), PLAZO_SONDA_MS);
      try {
        const r = await fetch("/api/health/deep", { signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!vivo) return;
        const lista: Check[] = Array.isArray(j?.checks) ? j.checks : [];
        if (lista.length > 0) {
          checksRef.current = lista;
          setChecks(lista);
        }
        ultimoError = "";
        setError("");
      } catch (e: any) {
        if (!vivo) return;
        ultimoError = String(e?.name === "AbortError" ? "el motor no contestó a tiempo" : e?.message || e);
        setError(ultimoError);
      } finally {
        window.clearTimeout(reloj);
        enCurso = false;
        if (vivo) evaluar();
      }
    };

    consultar();
    const ciclo = window.setInterval(consultar, 1200);
    const vigilante = window.setInterval(evaluar, 250);
    return () => {
      vivo = false;
      window.clearInterval(rotar);
      window.clearInterval(ciclo);
      window.clearInterval(vigilante);
    };
  }, []);

  useEffect(() => {
    if (!terminado) return;
    // Pequeña pausa para que se vea el estallido antes de entrar.
    const t = window.setTimeout(onReady, 550);
    return () => window.clearTimeout(t);
  }, [terminado, onReady]);

  const ok = checks.filter((c) => c.ok).length;
  // v2.3.12 · lo que se cayó de verdad (rojo) va aparte de lo que todavía no
  // nació (gris). Un arranque que mezcla las dos cosas enseña al usuario a ignorar
  // el rojo, que es peor que no tener rojo.
  const caidos = checks.filter((c) => semaforo(c) === "rojo").length;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#03060c]">
      <style>{ESTILOS}</style>

      {/* Ambiente: dos halos que respiran. Sin blur (CPU), con degradados. */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: "min(120vw, 1100px)",
          height: "min(120vw, 1100px)",
          background: "radial-gradient(circle, rgba(34,211,238,0.16) 0%, rgba(56,189,248,0.06) 38%, rgba(3,6,12,0) 68%)",
          animation: "cns-respirar 5.5s ease-in-out infinite",
        }}
      />

      {/* ── El cerebro ─────────────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: "clamp(200px, 26vw, 280px)", height: "clamp(200px, 26vw, 280px)", animation: "cns-entrada .5s ease-out" }}
      >
        {/* Halo central */}
        <div
          className="absolute rounded-full"
          style={{
            width: "62%",
            height: "62%",
            background: "radial-gradient(circle, rgba(34,211,238,0.5) 0%, rgba(37,99,235,0.22) 55%, rgba(3,6,12,0) 75%)",
            animation: "cns-respirar 2.6s ease-in-out infinite",
          }}
        />

        {/* Anillo exterior: girando despacio */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 0,
            border: "2px dashed rgba(34,211,238,0.55)",
            boxShadow: "0 0 34px rgba(34,211,238,0.28), inset 0 0 26px rgba(34,211,238,0.16)",
            animation: "cns-girar 16s linear infinite",
          }}
        />
        {/* Anillo medio: gira al revés */}
        <div
          className="absolute rounded-full"
          style={{
            inset: "13%",
            border: "1.5px solid rgba(125,211,252,0.42)",
            borderTopColor: "rgba(34,211,238,0.95)",
            animation: "cns-girar-inv 7s linear infinite",
          }}
        />
        {/* Anillo interior: late */}
        <div
          className="absolute rounded-full"
          style={{
            inset: "27%",
            border: "1.5px solid rgba(34,211,238,0.3)",
            animation: "cns-latir 2.2s ease-in-out infinite",
          }}
        />
        {/* Barrido de escaneo */}
        <div className="absolute overflow-hidden rounded-full" style={{ inset: "8%" }}>
          <div
            className="absolute left-0 right-0"
            style={{
              height: "28%",
              background: "linear-gradient(to bottom, rgba(34,211,238,0), rgba(34,211,238,0.45), rgba(34,211,238,0))",
              animation: "cns-barrido 3.4s ease-in-out infinite",
            }}
          />
        </div>

        {/* ── Chispas ─────────────────────────────────────────── */}
        {chispas.map((c, i) => (
          <span
            key={i}
            className="cns-chispa"
            style={{ ["--dx" as any]: c.dx, ["--dy" as any]: c.dy, ["--dur" as any]: c.dur, ["--delay" as any]: c.delay }}
          />
        ))}

        {/* El cerebro en sí, grande y con resplandor */}
        <svg viewBox="0 0 24 24" className="relative" style={{ width: "46%", height: "46%", filter: "drop-shadow(0 0 14px rgba(34,211,238,0.95))" }}>
          <path
            fill="none"
            stroke="#d9f9ff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 5.5a3 3 0 0 0-5.9-.7A3.2 3.2 0 0 0 3.6 8c0 .6.2 1.2.5 1.7A3.3 3.3 0 0 0 3 12.4c0 1 .4 1.9 1.2 2.5-.1.3-.2.6-.2 1A3.2 3.2 0 0 0 7.2 19c.6 1 1.8 1.6 3 1.5V5.5Z"
          />
          <path
            fill="none"
            stroke="#7dd3fc"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 5.5a3 3 0 0 1 5.9-.7A3.2 3.2 0 0 1 20.4 8c0 .6-.2 1.2-.5 1.7a3.3 3.3 0 0 1 1.1 2.7c0 1-.4 1.9-1.2 2.5.1.3.2.6.2 1A3.2 3.2 0 0 1 16.8 19c-.6 1-1.8 1.6-3 1.5V5.5Z"
          />
          <path fill="none" stroke="#a5f3fc" strokeWidth="1.2" strokeLinecap="round" d="M12 5.5v15" opacity=".8" />
        </svg>

        {/* Estallido final */}
        {terminado && (
          <div
            className="absolute rounded-full"
            style={{
              inset: 0,
              border: "2px solid rgba(125,211,252,0.9)",
              boxShadow: "0 0 50px rgba(34,211,238,0.6)",
              animation: "cns-estallido .6s ease-out forwards",
            }}
          />
        )}
      </div>

      {/* ── Textos ─────────────────────────────────────────────── */}
      <h1
        className="mt-8 font-black tracking-tight text-center"
        style={{
          fontSize: "clamp(26px, 3.2vw, 40px)",
          background: "linear-gradient(90deg, #a5f3fc 0%, #22d3ee 45%, #60a5fa 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: "drop-shadow(0 0 18px rgba(34,211,238,0.35))",
        }}
      >
        CerebroNico arrancando motor
      </h1>
      <p className="mt-2 text-[13px] text-zinc-400 font-mono">
        El conocimiento vive en el motor · el conductor puede ser cualquiera · {MENSAJES[mensaje]}…
      </p>

      {/* ── Comprobaciones reales ─────────────────────────────── */}
      <div
        className="mt-7 w-full px-4"
        style={{ maxWidth: 620, animation: "cns-entrada .6s ease-out .15s both" }}
      >
        <div className="rounded-2xl border border-[#1b2a3f] bg-[#070c15]/90 p-4 shadow-[0_0_50px_rgba(34,211,238,0.10)]">
          <div className="mb-3 flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>comprobando los {PUERTOS_DE_ARRANQUE.length} puertos de la casa</span>
            <span className={caidos ? "text-rose-300" : "text-cyan-300"}>
              {checks.length > 0
                ? caidos
                  ? `${caidos} caído(s) · ${ok}/${checks.length}`
                  : `${ok}/${checks.length} correctas`
                : "consultando…"}
            </span>
          </div>
          <div className="space-y-2">
            {checks.length === 0 && (
              <div className="flex items-center gap-2 py-1 text-[13px] text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                consultando el estado del motor…
              </div>
            )}
            {checks.map((c, i) => (
              <div
                key={c.name + i}
                className="flex items-start gap-3 py-1"
                style={{ animation: "cns-entrada .35s ease-out both", animationDelay: `${i * 60}ms` }}
              >
                {semaforo(c) === "vivo" && (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/40 shadow-[0_0_14px_rgba(16,185,129,0.35)]">
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                  </span>
                )}
                {semaforo(c) === "gris" && (
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-500/10 ring-1 ring-zinc-500/30"
                    title="No está caído: es de los servicios que nacen cuando hacen falta"
                  >
                    <Minus className="h-3.5 w-3.5 text-zinc-400" />
                  </span>
                )}
                {semaforo(c) === "rojo" && (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-400/40">
                    <X className="h-3.5 w-3.5 text-rose-300" />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-zinc-100">
                    {c.name}
                    {c.bloqueante === false && c.estado === "caido" && (
                      <span className="ml-2 text-[10px] font-mono text-zinc-500">no impide trabajar</span>
                    )}
                  </div>
                  {c.detail && <div className="text-[12px] text-zinc-400 font-mono">{c.detail}</div>}
                  {c.estado !== "sin-arrancar" && !c.ok && c.fix && (
                    <div className="text-[12px] text-amber-300/90">{c.fix}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Botón: aparece al terminar, grande y con brillo */}
        <div className="mt-5 flex flex-col items-center gap-2">
          {terminado ? (
            <button
              onClick={onReady}
              className="flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-500/15 px-7 py-3 text-[15px] font-bold text-cyan-100 transition-colors hover:bg-cyan-500/25 shadow-[0_0_30px_rgba(34,211,238,0.35)]"
              style={{ animation: "cns-entrada .4s ease-out both" }}
            >
              Entrar de todos modos
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[12px] font-mono text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              arrancando…
            </div>
          )}
          {error && <p className="text-[11px] text-rose-300/80 font-mono">El motor no respondió: {error}</p>}
          <p className="text-[11px] text-zinc-600">
            Los estados en rojo no impiden trabajar: se pueden corregir desde Config.
          </p>
        </div>
      </div>
    </div>
  );
};

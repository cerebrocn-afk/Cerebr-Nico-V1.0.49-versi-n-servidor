// src/components/AudioAmbiente.tsx
// v1.48.4 — AUDIO DE AMBIENTE EN BUCLE INDEFINIDO (misterio / investigacion /
// suspenso). Pedido de Mario: fondo largo, con melodia y variacion de
// frecuencia, y que al repetirse NO haga "crick" (bucle sin costura).
//
// Por que ya no hace "crick":
// - La pista `misterio-loop.wav` es LARGA (72 s) y esta construida para ser
//   exactamente periodica: en el empalme la onda enlaza sin salto (ver el
//   generador en /temp/gen_ambiente.py).
// - Pero el culpable clasico del chasquido era el `<audio loop>` con MP3: el
//   MP3 lleva relleno (padding) del codificador al inicio/fin, y el navegador
//   deja un microhueco en cada vuelta -> "crick". Ahora NO usamos <audio loop>:
//   decodificamos el WAV a PCM y lo repetimos con la Web Audio API
//   (AudioBufferSourceNode.loop), que empalma muestra-a-muestra SIN hueco.
// - Si la Web Audio API fallara, cae a un <audio loop> con el WAV (PCM, sin el
//   padding del MP3), que ya empalma mucho mejor que antes.
//
// Autocontenido: no toca el resto de la app. Estado (on + volumen) en
// localStorage. Los navegadores no dejan sonar hasta que el usuario interactua;
// por eso el audio arranca con el boton (o se reanuda en el primer gesto).

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Music2 } from "lucide-react";
import { suscribirVozActiva } from "../utils/vozActiva";

const LS_ON = "cn.audioAmbiente.on";
const LS_VOL = "cn.audioAmbiente.vol";
const PISTA = "/audio/misterio-loop.wav";

/**
 * v1.70.2 — «SONIDO AMBIENTE MUY ALTO, BAJALO BASTANTE» (pedido de Mario,
 * captura del 24/10 con el slider a ~0.35 sonando por encima de todo).
 * Techo maestro sobre TODA la ganancia del fondo: aunque el slider llegue a 1,
 * el ambiente nunca pasa del 45 % de la escala anterior. Con el valor que
 * Mario tenía guardado (0.35) el efecto inmediato es ~-10 dB: se oye la
 * melodía, no tapa la voz ni el teclado. El mando sigue siendo el slider;
 * esto es solo el techo honesto del fondo.
 *
 * v1.73.0 — «BAJA BASTANTA MAS EL VOLUMEN DEL SONIDO AMBIENTE, ESTA MUY
 * ALTO» (Mario, 26/10). Segundo recorte, más agresivo: el techo baja de 0.45
 * a 0.12 — casi 4 veces menos de lo que sonaba hoy (y 7 veces menos que la
 * escala original). Como el techo se aplica DESPUÉS del slider guardado, el
 * recorte alcanza a todos por igual, sin borrar la perilla de nadie.
 */
const TOPE_MAESTRO_AMBIENTE = 0.12;

/**
 * v1.57.9 — DUCKING (pedido de Mario: «la voz se queda baja contra el fondo»).
 * La voz del navegador NO puede subir más (su volumen 1 es el techo real del
 * estándar), así que la única ganancia honesta está en el fondo: mientras la
 * app habla, el ambiente baja al 15 % de lo ajustado y vuelve a su sitio al
 * terminar. 15 % deja oír la melodía de fondo sin comerse las sílabas.
 */
const FACTOR_AGACHADO = 0.15;

/**
 * v1.56.8 — «BAJA UN POCO LA FRECUENCIA DE FONDO» (pedido de Mario).
 *
 * La pista es un WAV pregenerado de 72 s, no un oscilador: no hay una constante de
 * frecuencia que editar en el repo. El mando que sí existe en tiempo de ejecución
 * es `playbackRate`. Con 0.9 el espectro baja ~1,7 semitonos (más grave, más
 * "madera") y el bucle se alarga un 11 %; sigue siendo periodico, así que el
 * empalme sin costura NO se rompe y no vuelve el «crick».
 *
 * Se declara aquí y no en el generador porque el generador (`/temp/gen_ambiente.py`)
 * no viaja en el paquete: cambiar la pista exigiría regenerar el binario, y el motor
 * no emite binarios que no pueda verificar.
 */
const FRECUENCIA_FONDO = 0.9;

/**
 * v1.73.0 — `oculto`: la barrita flotante de abajo-izquierda tenía la X roja de
 * Mario en la captura `areglo.jpg`. Con este flag el componente sigue MONTADO
 * (misma Web Audio, mismo ducking, mismo fallback) pero invisible; el encendido
 * y apagado llegan por el evento `cerebronico:ambiente-toggle`, que envía el
 * menú CN. Ninguna lógica del audio se tocó: solo cambió de manos el interruptor.
 */
export function AudioAmbiente({ oculto = false }: { oculto?: boolean }) {
  // --- Web Audio (ruta principal: bucle sin costura) ---
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const cargandoRef = useRef<Promise<AudioBuffer | null> | null>(null);
  // --- Fallback (<audio loop> con el WAV) ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [usandoFallback, setUsandoFallback] = useState(false);

  const [encendido, setEncendido] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_ON) === "1"; } catch { return false; }
  });
  const [volumen, setVolumen] = useState<number>(() => {
    // v1.70.3 — el default NUEVO arranca en 0.15 (especificación de Mario:
    // «0.15 en lugar de 0.35»). Los valores ya guardados se respetan: lo que
    // cambió para todos es el techo maestro, no la perilla de cada uno.
    try { const v = parseFloat(localStorage.getItem(LS_VOL) || "0.15"); return Number.isFinite(v) ? v : 0.15; } catch { return 0.15; }
  });
  const [bloqueado, setBloqueado] = useState(false); // el navegador freno el autoplay
  // v1.57.9 — ref (no state): el agachado no necesita re-render, solo gobernar
  // el gain y el volumen del fallback en el momento exacto en que cambian.
  const agachadoRef = useRef(false);

  const volSeguro = (v: number) => Math.min(1, Math.max(0, v));
  /** Volumen efectivo: el pedido por el usuario, agachado si la voz está hablando. */
  const gananciaEfectiva = useCallback(
    (v: number) =>
      // v1.70.2 — el techo maestro se aplica DESPUÉS del agachado: ninguna
      // ruta (Web Audio, fallback <audio>, ducking) puede sonar por encima.
      volSeguro(v) * TOPE_MAESTRO_AMBIENTE * (agachadoRef.current ? FACTOR_AGACHADO : 1),
    []
  );

  // Decodifica el WAV una sola vez (cacheado). Devuelve null si no hay Web Audio.
  const asegurarBuffer = useCallback(async (): Promise<AudioBuffer | null> => {
    const AC: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctxRef.current) ctxRef.current = new AC();
    if (bufferRef.current) return bufferRef.current;
    if (!cargandoRef.current) {
      cargandoRef.current = (async () => {
        try {
          const resp = await fetch(PISTA);
          const datos = await resp.arrayBuffer();
          const buf = await ctxRef.current!.decodeAudioData(datos);
          bufferRef.current = buf;
          return buf;
        } catch {
          return null;
        }
      })();
    }
    return cargandoRef.current;
  }, []);

  // Arranca el bucle por Web Audio. Devuelve true si lo logro.
  const arrancarWebAudio = useCallback(async (): Promise<boolean> => {
    const buf = await asegurarBuffer();
    const ctx = ctxRef.current;
    if (!buf || !ctx) return false;
    try { if (ctx.state === "suspended") await ctx.resume(); } catch {}
    // Reemplaza cualquier fuente previa.
    try { sourceRef.current?.stop(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;                 // <- empalme muestra-a-muestra, sin hueco
    src.playbackRate.value = FRECUENCIA_FONDO; // v1.56.8: fondo un poco más grave
    const gain = gainRef.current || ctx.createGain();
    gain.gain.value = gananciaEfectiva(volumen); // v1.57.9 — arranca agachado si la voz ya hablaba
    src.connect(gain).connect(ctx.destination);
    src.start(0);
    sourceRef.current = src;
    gainRef.current = gain;
    return ctx.state === "running";
  }, [asegurarBuffer, volumen, gananciaEfectiva]);

  const pararWebAudio = useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    sourceRef.current = null;
  }, []);

  // Volumen en caliente (Web Audio y fallback).
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = gananciaEfectiva(volumen);
    if (audioRef.current) {
      audioRef.current.volume = gananciaEfectiva(volumen);
      // v1.56.8 — el fallback <audio loop> tiene que sonar IGUAL de grave que la
      // ruta Web Audio; si solo se aplica `playbackRate` en un camino, cambiar de
      // navegador cambia el fondo y nadie sabe cuál es el sonido "oficial".
      try { audioRef.current.playbackRate = FRECUENCIA_FONDO; } catch {}
    }
    try { localStorage.setItem(LS_VOL, String(volumen)); } catch {}
  }, [volumen, gananciaEfectiva]);

  // v1.57.9 — DUCKING: mientras el chat habla («Escuchar», navegador o Gemini),
  // el fondo baja al 15 % y vuelve al terminar. La transición es rampa suave
  // (`setTargetAtTime`), no un corte seco: un salto brusco de gain se oye como
  // un porrazo. En el fallback <audio> no hay rampa: se aplica directo.
  useEffect(() => {
    return suscribirVozActiva((on) => {
      agachadoRef.current = on;
      const ctx = ctxRef.current;
      const gain = gainRef.current;
      if (gain) {
        const objetivo = gananciaEfectiva(volumen);
        try {
          if (ctx) gain.gain.setTargetAtTime(objetivo, ctx.currentTime, 0.12);
          else gain.gain.value = objetivo;
        } catch {
          gain.gain.value = objetivo;
        }
      }
      if (audioRef.current) audioRef.current.volume = gananciaEfectiva(volumen);
    });
  }, [volumen, gananciaEfectiva]);

  // Enciende / apaga.
  useEffect(() => {
    let cancelado = false;
    try { localStorage.setItem(LS_ON, encendido ? "1" : "0"); } catch {}
    if (encendido) {
      (async () => {
        const ok = await arrancarWebAudio();
        if (cancelado) return;
        if (ok) {
          setUsandoFallback(false);
          setBloqueado(false);
          return;
        }
        // Fallback: <audio loop> con el WAV.
        setUsandoFallback(true);
        const a = audioRef.current;
        if (a) {
          a.volume = gananciaEfectiva(volumen); // v1.57.9 — respeta el agachado
          const p = a.play();
          if (p && typeof p.then === "function") {
            p.then(() => !cancelado && setBloqueado(false))
             .catch(() => !cancelado && setBloqueado(true));
          }
        } else {
          // Web Audio existio pero el contexto quedo suspendido: pedir gesto.
          setBloqueado(ctxRef.current?.state !== "running");
        }
      })();
    } else {
      pararWebAudio();
      try { ctxRef.current?.suspend(); } catch {}
      const a = audioRef.current;
      if (a) a.pause();
      setBloqueado(false);
    }
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encendido]);

  // Si quedo encendido pero el navegador bloqueo el autoplay, reanuda en el
  // primer gesto real del usuario (clic o tecla) en cualquier parte.
  useEffect(() => {
    if (!encendido || !bloqueado) return;
    const reanudar = async () => {
      const ok = await arrancarWebAudio();
      if (ok) { setUsandoFallback(false); setBloqueado(false); return; }
      const a = audioRef.current;
      if (a) a.play().then(() => setBloqueado(false)).catch(() => {});
    };
    window.addEventListener("pointerdown", reanudar, { once: true });
    window.addEventListener("keydown", reanudar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", reanudar);
      window.removeEventListener("keydown", reanudar);
    };
  }, [encendido, bloqueado, arrancarWebAudio]);

  // v1.73.0 — encendido desde el menú CN (la barra oculta ya no tiene botón).
  useEffect(() => {
    const alToggle = () => setEncendido((v) => !v);
    window.addEventListener("cerebronico:ambiente-toggle" as any, alToggle as EventListener);
    return () => window.removeEventListener("cerebronico:ambiente-toggle" as any, alToggle as EventListener);
  }, []);

  return (
    <div
      className={oculto ? "hidden" : "fixed bottom-3 left-3 z-[60] flex items-center gap-2 rounded-full border border-indigo-800/60 bg-zinc-950/80 px-2.5 py-1.5 shadow-lg shadow-indigo-950/40 backdrop-blur-sm"}
      title={bloqueado ? "Haz clic en cualquier parte para reanudar el sonido de ambiente" : "Sonido de ambiente (misterio) en bucle sin costura"}
    >
      <button
        onClick={() => setEncendido((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] transition-colors ${
          encendido
            ? "bg-indigo-900/70 text-indigo-200 hover:bg-indigo-800/70"
            : "bg-zinc-900/70 text-zinc-400 hover:text-indigo-300"
        }`}
        aria-pressed={encendido}
      >
        {encendido ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        <Music2 className="h-3 w-3 opacity-70" />
        <span>{encendido ? (bloqueado ? "Clic para sonar" : "Ambiente ON") : "Ambiente OFF"}</span>
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volumen}
        onChange={(e) => setVolumen(parseFloat(e.target.value))}
        className="h-1 w-20 cursor-pointer accent-indigo-500"
        aria-label="Volumen del sonido de ambiente"
        title="Volumen"
      />

      {/* Fallback: solo se usa si la Web Audio API no esta disponible. El WAV es
          PCM (sin el padding del MP3), asi que incluso aqui el bucle empalma
          mucho mejor que la version anterior. */}
      {usandoFallback && (
        <audio ref={audioRef} src={PISTA} loop preload="auto" />
      )}
    </div>
  );
}

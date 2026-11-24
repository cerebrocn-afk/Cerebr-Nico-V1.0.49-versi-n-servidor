import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom"; // v1.97.0 · el panel de voz sale del recorte del Menú CN (ver abajo)
import {
  ChevronDown,
  Gauge,
  Play,
  Radio,
  Volume2,
  X,
} from "lucide-react";
import {
  CONFIG_TTS_DEFAULT,
  ConfigTts,
  EVENTO_CONFIG_TTS,
  EVENTO_GEMINI_TTS_KEY,
  PITCH_MAX,
  PITCH_MIN,
  RATE_MAX,
  RATE_MIN,
  VOCES_GEMINI,
  cargarConfigTts,
  guardarConfigTts,
  leerClaveGeminiTts,
} from "../utils/ttsConfig";
import {
  ALTO_TARJETA_POR_DEFECTO,
  ANCHO_TARJETA_POR_DEFECTO,
  calcularAncla,
  esRectVivible,
  type Ancla,
} from "../engine/tarjetaFlotante";
// v1.99.9 · cuántas veces buscar voces del sistema, y qué decir cuando no aparecen.
import { decidirReintentoVoces, rotuloEstadoVoces } from "../engine/colaVoces";

/**
 * TtsSelector — BOTÓN DE VOZ EN LA BARRA SUPERIOR (v1.15.0)
 * ==========================================================
 * Petición literal: «agregar arriba un botón selector de tts, funciona bien
 * pero no tiene cambio de voz ni tono/velocidad».
 *
 * Este botón abre un desplegable con tres controles:
 *   1. Voz     — navegador automático · voces del sistema · voces Gemini.
 *   2. Tono    — slider 0.5–2.0 (pitch). Aplica a la voz del navegador.
 *   3. Velocidad — slider 0.5–2.0 (rate). Aplica a navegador y Gemini.
 *
 * No habla por sí mismo: escribe la configuración compartida
 * (utils/ttsConfig.ts) y el ChatCenter, que es quien reproduce, la lee.
 */

/** Deduplica las voces del sistema por nombre y las ordena: el idioma activo primero. */
function ordenarVocesSistema(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const unicas = new Map<string, SpeechSynthesisVoice>();
  for (const v of voces) {
    if (!v || !v.name) continue;
    if (!unicas.has(v.name)) unicas.set(v.name, v);
  }
  const lista = Array.from(unicas.values());
  const idiomaUi = (() => {
    try {
      return (localStorage.getItem("codigo0_response_language") || "es").toLowerCase().split(/[-_]/)[0];
    } catch {
      return "es";
    }
  })();
  // v1.70.2 — dentro del mismo idioma, las LOCALES van primero: son las únicas
  // que respetan el control de tono. Así el orden de la lista ya empuja hacia
  // la voz que responde a todos los mandos, sin carteles ni explicaciones.
  lista.sort((a, b) => {
    const pa = a.lang.toLowerCase().startsWith(idiomaUi) ? 0 : 1;
    const pb = b.lang.toLowerCase().startsWith(idiomaUi) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const la = a.localService === false ? 1 : 0;
    const lb = b.localService === false ? 1 : 0;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name);
  });
  return lista;
}

/**
 * v1.70.3 — etiqueta corta del origen de la voz para la lista (metadatos
 * explícitos [local/SAPI] vs [nube], pedido en la revisión del 25/10). Las
 * `Microsoft …` locales son el motor SAPI/OneCore de Windows — el mismo que
 * obedece el tono; otras locales (macOS/Linux) salen del motor nativo del
 * navegador. Las de nube (`localService === false`, las «Google …») ignoran
 * `pitch`: eso ya no se anuncia con carteles, se ve en la propia lista.
 */
function marcaOrigenVoz(v: SpeechSynthesisVoice): string {
  if (v.localService === false) return " · nube";
  if (/^microsoft\s/i.test(v.name)) return " · local/SAPI";
  return " · local";
}

export const TtsSelector: React.FC = () => {
  const [abierto, setAbierto] = useState(false);
  const [voz, setVoz] = useState<string>(CONFIG_TTS_DEFAULT.voz);
  const [rate, setRate] = useState<number>(CONFIG_TTS_DEFAULT.rate);
  const [pitch, setPitch] = useState<number>(CONFIG_TTS_DEFAULT.pitch);
  const [vocesSistema, setVocesSistema] = useState<SpeechSynthesisVoice[]>([]);
  const [hayClave, setHayClave] = useState<boolean>(false);
  const [probando, setProbando] = useState<boolean>(false);
  const raizRef = useRef<HTMLDivElement>(null);

  // v1.70.2 — PROBAR LA VOZ: muestra corta con la configuración en curso
  // (voz + tono + velocidad) sin tener que mandarle un mensaje al chat.
  // Con una voz Gemini elegida, la prueba la hace la voz del navegador
  // (la de Gemini cuesta un pedido a la API; para eso ya está «Escuchar»).
  const probarVoz = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      /* noop */
    }
    const muestra = "Hola, así suena esta voz con este tono y esta velocidad.";
    const utter = new SpeechSynthesisUtterance(muestra);
    const esGemini = VOCES_GEMINI.some((g) => g.id === voz);
    if (!esGemini && voz && voz !== "navegador") {
      const s = synth.getVoices().find((v) => v.name === voz);
      if (s) {
        utter.voice = s;
        utter.lang = s.lang;
      }
    } else {
      try {
        utter.lang = localStorage.getItem("codigo0_response_language") || "es";
      } catch {
        utter.lang = "es";
      }
    }
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = 1;
    utter.onend = () => setProbando(false);
    utter.onerror = () => setProbando(false);
    setProbando(true);
    try {
      synth.speak(utter);
    } catch {
      setProbando(false);
    }
  };

  // Leer la configuración y escuchar cambios externos (p. ej. el aviso que
  // devuelve el chat a «navegador» cuando se quita la clave Gemini).
  useEffect(() => {
    const aplicar = () => {
      const c = cargarConfigTts();
      setVoz(c.voz);
      setRate(c.rate);
      setPitch(c.pitch);
    };
    aplicar();
    window.addEventListener(EVENTO_CONFIG_TTS, aplicar);
    return () => window.removeEventListener(EVENTO_CONFIG_TTS, aplicar);
  }, []);

  // Cargar las voces del sistema (se cargan de forma asíncrona en el navegador).
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.getVoices !== "function") return;
    const cargar = () => {
      const v = synth.getVoices();
      if (v && v.length) setVocesSistema(ordenarVocesSistema(v));
    };
    cargar();
    try {
      synth.addEventListener("voiceschanged", cargar);
    } catch {
      /* noop */
    }
    return () => {
      try {
        synth.removeEventListener("voiceschanged", cargar);
      } catch {
        /* noop */
      }
    };
  }, []);

  // v1.99.9 · LA LISTA NO QUEDA VACÍA PARA SIEMPRE (dueño del criterio: `engine/colaVoces.ts`).
  // Escuchar sólo `voiceschanged` alcanza cuando el navegador dispara el evento DESPUÉS de montar;
  // en Chromium/Windows no siempre pasa, y ahí el usuario veía un «cambiador de voces» sin voces —
  // que es literalmente la queja con la que empezó todo este hilo. Se sondea con escalera corta y
  // SE RENUNCIA con motivo: cuatro oportunidades y la tarjeta lo dice, en vez de callar para siempre.
  const [intentosVoces, setIntentosVoces] = useState(0);
  const decisionVoces = decidirReintentoVoces({
    voces: vocesSistema.length,
    intentosHechos: intentosVoces,
    abierto,
    soporta: typeof window !== "undefined" && !!window.speechSynthesis && typeof window.speechSynthesis.getVoices === "function",
  });
  useEffect(() => {
    if (decisionVoces.accion !== "reintentar") return;
    const id = window.setTimeout(() => {
      const v = typeof window !== "undefined" ? window.speechSynthesis?.getVoices() : undefined;
      if (v && v.length) setVocesSistema(ordenarVocesSistema(v));
      setIntentosVoces((n) => n + 1);
    }, decisionVoces.esperaMs);
    return () => window.clearTimeout(id);
  }, [decisionVoces.accion, decisionVoces.esperaMs, decisionVoces.intento]);

  // Revisar si hay clave Gemini (local o del servidor).
  useEffect(() => {
    const revisar = () => setHayClave(leerClaveGeminiTts());
    revisar();
    window.addEventListener("focus", revisar);
    window.addEventListener(EVENTO_GEMINI_TTS_KEY, revisar);
    const t = setInterval(revisar, 4000);
    return () => {
      window.removeEventListener("focus", revisar);
      window.removeEventListener(EVENTO_GEMINI_TTS_KEY, revisar);
      clearInterval(t);
    };
  }, []);

  // v1.97.0 · EL DESPLEGABLE SE PORTALEA AL BODY (captura de Mario, 30/10). El panel del
  // Menú CN se dibuja con `overflow-hidden` (Header.tsx:311) y el header trae
  // `backdrop-blur-md`, que crea un contexto de apilamiento propio: el `z-[100]` del
  // desplegable NO pelea contra un recorte de un ancestro — z-index ordena el pintado,
  // no desclipea. Por eso "Tamaño texto" se veía bien: es un <select> NATIVO y su lista
  // la pinta el sistema operativo, no el árbol CSS. Mismo remedio que PanelAspecto:90 y
  // ConsejoPanel:76 — portal a `body` con `position:fixed` anclado al rect del gatillo.
  /* v1.98.0 · LA CUENTA DE LA ANCLA SE VA A CASA (engine/tarjetaFlotante.ts) y deja de
     estar a mano acá. Dos motivos medidos en la captura del 31/10:
       · «a veces abre al otro lado de la pantalla, a la derecha»: `if (!r) return`
         protegía del `null` pero no del rect 0×0 del gatillo todavía sin pintar, y
         `right: innerWidth - r.right` con r.right = 0 dava `right = innerWidth`: la
         tarjeta pegada al borde derecho. Ahora un rect degenerado NO pisa la última
         ancla buena: se re-mide en los frames siguientes.
       · se anclaba por el borde DERECHO y sin preguntar si cabía: con el menú a la
         izquierda la tarjeta salía cortada por el borde izquierdo, y con el gatillo a
         media altura el tono y el botón de prueba se iban bajo el borde inferior de la
         ventana (se ve en la captura). Se ancla por la izquierda, se recorta contra la
         ventana y se vuelca hacia arriba cuando abajo no cabe. */
  const tarjetaRef = useRef<HTMLDivElement | null>(null);
  const [ancla, setAncla] = useState<Ancla | null>(null);
  useLayoutEffect(() => {
    if (!abierto) {
      setAncla(null);
      return;
    }
    let id = 0;
    let intentos = 0;
    const medir = () => {
      const r = raizRef.current?.getBoundingClientRect();
      // Todavía no hay geometría real: no se pinta en un borde al azar, se espera al
      // frame siguiente (y si en unos frames sigue sin pintar, la tarjeta queda oculta
      // en vez de aparecer en un lugar que el usuario no pidió).
      if (!esRectVivible(r)) {
        if (intentos++ < 5) id = requestAnimationFrame(medir);
        return;
      }
      setAncla(
        calcularAncla(
          r,
          {
            ancho: tarjetaRef.current?.offsetWidth || ANCHO_TARJETA_POR_DEFECTO,
            alto: tarjetaRef.current?.offsetHeight || ALTO_TARJETA_POR_DEFECTO,
          },
          { ancho: window.innerWidth, alto: window.innerHeight }
        )
      );
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      if (id) cancelAnimationFrame(id);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [abierto]);

  // Cerrar el desplegable al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (e: MouseEvent) => {
      const t = e.target as Node;
      // La tarjeta vive en otro lado del árbol (body), así que hay que mirarla aparte:
      // si solo se consulta raizRef, un clic dentro del propio panel cerraba todo.
      const adentro = raizRef.current?.contains(t) || tarjetaRef.current?.contains(t);
      if (!adentro) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, [abierto]);

  const aplicar = (parcial: Partial<ConfigTts>) => {
    const c = guardarConfigTts(parcial);
    setVoz(c.voz);
    setRate(c.rate);
    setPitch(c.pitch);
  };

  const etiquetaVoz = (() => {
    if (voz === "navegador") return "Navegador (auto)";
    const g = VOCES_GEMINI.find((v) => v.id === voz);
    if (g) return g.label;
    const s = vocesSistema.find((v) => v.name === voz);
    return s ? `${s.name} (${s.lang})${marcaOrigenVoz(s)}` : voz;
  })();

  return (
    <div className="relative" ref={raizRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title="Voz de lectura (TTS): elegir voz, tono y velocidad"
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-mono text-[11px] transition-all shrink-0 ${
          abierto
            ? "bg-cyan-500/20 border-cyan-400/60 text-cyan-200"
            : "bg-[#060a14] hover:bg-[#0a1020] border-[#141d2e] hover:border-cyan-500/40 text-zinc-300 hover:text-cyan-300"
        }`}
      >
        <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
        <span className="hidden lg:inline max-w-[140px] truncate">{etiquetaVoz}</span>
        <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && createPortal(
        <div
          ref={tarjetaRef}
          data-cn-tarjeta-flotante="voz"
          style={{ position: "fixed", top: ancla?.top ?? 0, left: ancla?.left ?? 0, visibility: ancla ? "visible" : "hidden" }}
          className="w-72 max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto custom-scrollbar bg-[#0a0f1c] border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/50 z-[999] text-xs">
          <div className="px-3 py-2 bg-[#0d1426] border-b border-[#1a2540] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-cyan-300 font-mono text-[11px] font-bold tracking-wide">
              <Volume2 className="w-3.5 h-3.5" />
              <span>VOZ DE LECTURA (TTS)</span>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-200"
              title="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2.5 space-y-3">
            {/* Selección de voz */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                Voz
              </label>
              <select
                value={voz}
                onChange={(e) => aplicar({ voz: e.target.value })}
                className="w-full bg-[#060a14] border border-[#1a2540] rounded-md px-2 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-cyan-500/60 cursor-pointer"
              >
                <option value="navegador" className="bg-[#0a0f1a]">Navegador (automática)</option>
                {vocesSistema.length > 0 && (
                  <optgroup label="Voces del sistema">
                    {vocesSistema.map((v) => (
                      <option key={v.name} value={v.name} className="bg-[#0a0f1a]">
                        {v.name} ({v.lang}){marcaOrigenVoz(v)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {hayClave && (
                  <optgroup label="Gemini (requiere clave)">
                    {VOCES_GEMINI.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#0a0f1a]">
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {/* v1.99.9 · el silencio no es una opción: si el navegador todavía no publicó sus
                  voces, la tarjeta lo dice (y hasta cuántas veces lo buscó). Un selector vacío sin
                  explicación es lo que se leía como «el botón no abre». */}
              {rotuloEstadoVoces(decisionVoces, vocesSistema.length) ? (
                <p className="text-[9px] text-amber-400/80 mt-1 leading-relaxed">
                  {rotuloEstadoVoces(decisionVoces, vocesSistema.length)}
                </p>
              ) : null}
              {!hayClave && (
                <p className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                  Las voces Gemini aparecen cuando configures tu clave en el panel de API Keys.
                </p>
              )}
            </div>

            {/* Velocidad */}
            <div>
              <label className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-emerald-400" />
                  Velocidad
                </span>
                <span className="text-emerald-300 font-mono normal-case">{rate.toFixed(2)}×</span>
              </label>
              <input
                type="range"
                min={RATE_MIN}
                max={RATE_MAX}
                step={0.05}
                value={rate}
                onChange={(e) => aplicar({ rate: Number(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                <span>lenta {RATE_MIN}×</span>
                <span>{RATE_MAX}× rápida</span>
              </div>
            </div>

            {/* Tono */}
            <div>
              <label className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-violet-400" />
                  Tono
                </span>
                <span className="text-violet-300 font-mono normal-case">{pitch.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={PITCH_MIN}
                max={PITCH_MAX}
                step={0.01}
                value={pitch}
                onChange={(e) => aplicar({ pitch: Number(e.target.value) })}
                className="w-full accent-violet-400 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
                <span>grave {PITCH_MIN}</span>
                <span>{PITCH_MAX} agudo</span>
              </div>
            </div>
          </div>

          {/* Probar voz: la forma más corta de saber qué estás eligiendo. */}
          <button
            type="button"
            onClick={probarVoz}
            disabled={probando}
            title="Di un ejemplo corto con esta voz, tono y velocidad"
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 font-mono text-[10px] transition-colors disabled:opacity-50"
          >
            <Play className="w-3 h-3" />
            {probando ? "sonando…" : "probar esta voz"}
          </button>

          <div className="px-3 py-1.5 bg-[#04060d] border-t border-[#141d2e] text-[9px] text-zinc-600 font-mono leading-relaxed">
            <span className="text-amber-400/70">⚠ Tono:</span> lo respetan las voces marcadas <b>· local</b>; las <b>· nube</b> y las <b>Gemini</b> fijan su propio tono (la velocidad sí aplica a todas).
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

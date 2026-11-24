import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { decidirVentanaMensajes, siguienteRevelado, rotuloMostrarMas } from "../engine/ventanaMensajes";
import { decidirCuadro } from "../engine/goteo";
// v1.99.9 · el ancho del chat es un paso graduado (ventana + paneles abiertos), no un booleano.
import { claseHorma, type PasoHorma } from "../engine/hormaChat";
import { UMBRAL_PEGADO_PX, atrasoCritico, objetivoDelHilo, objetivoLectura, siguientePosicion } from "../engine/seguidorHilo"; // v2.3.2 · la vista persigue, no salta
// v1.0.14 · CUESTIONARIO CON OPCIONES: pinta bolsos cuando el asistente preguntó con opciones.
import { parsearOpciones } from "../engine/preguntaConOpciones";
// v2.3.17 · REVERTIDO EL ESCALÓN (queja del 6/11: «se queda quieto y sigue el texto
// para abajo, y no sube solo acompañando el texto»). v2.3.12 congelaba el objetivo
// hasta que el contenido crecía 5 renglones: la vista se quedaba quieta y subía de
// golpe. Eso era exactamente lo que el usuario pidió curar, así que el escalón se
// va y la vista vuelve a **perseguir el objetivo recalculado en cada cuadro**, a
// velocidad finita — que es lo que da fluidez sin el vaivén de `smooth`.
// `src/engine/escalonLectura.ts` y su suite se eliminan con este asiento.
// v1.83.0 · FASE 4: plegado de botoneras (contratoSuperficie.ts: "chat-input").
import { Avanzado } from "./Avanzado";
// v2.1 — La versión se lee de UNA sola fuente (constants.IDE_BRAND).
// Estaba escrita a mano: la interfaz decía "V1" mientras la carpeta y los
// archivos decían "v2.0". Dos versiones distintas, y ninguna era la real.
import { IDE_BRAND, LS_KEYS } from "../constants";
// v1.6.11 — las vallas no se comen el mensaje (ni al leerlo en voz alta ni al
// exportarlo). Ver src/utils/bloquesMarkdown.ts.
import { quitarVallasConservandoTexto, anotarBloquesSinExplicacion } from "../utils/bloquesMarkdown";
// v1.70.6 — MODO RESULTADOS: las vallas de código se ven como fichas colapsadas
// (ruta · líneas · estado) y la prosa de «Voy a…» se destila a una sola línea
// viva. El texto crudo sigue intacto para copiar/voz/exportar. Ver utils/chatResultados.ts.
import { esMensajeDenso, segmentarMensaje, dividirEclectica, resumenFinalDelMensaje, dividirVozSimple, type SegmentoMensaje, type EclecticaDividida } from "../utils/chatResultados";
// v1.92.0 · PROSA LEGIBLE: el Markdown que el modelo ya escribe (títulos, viñetas,
// tablas, `código`, **énfasis**) se pinta como estructura en vez de leerse como
// huesos. El crudo no se modifica: copiar/voz/export siguen leyendo el original.
import { parsearProsa, type BloqueProsa, type Tramo } from "../utils/prosaLegible";
import { dividirInformeEclectico, type EclecticaEnBloques } from "../utils/piezaEclectica";
// v1.6.11 — la clave de Gemini que el usuario ya configuró en la app, para
// mandarla también al motor de voz (antes solo existía la del servidor).
import { loadString } from "../utils/storage";
// F1 — autocorrector determinista del composer (modo «auto» reemplaza en
// caliente las correcciones seguras; «sugerir» nunca toca lo escrito).
import { corregirLinea } from "../engine/autocorrector";
import { loadProSettings } from "../utils/proSettings";
import { esNombreParteMultivolumen } from "../utils/multipartZip";
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  Clock,
  Copy,
  Cpu,
  Download,
  Eraser,
  FileCode,
  FileText,
  FolderArchive,
  // v8.0.4 — Para el aviso de voz (por qué suena robótica) y el de adjuntos.
  AlertTriangle,
  // v1.16.6 — chip del MODO DE PENSAMIENTO (Auto/Rápido/Ingeniero/Profundo),
  // visible en el chat: antes el selector solo vivía en el menú Pro.
  Brain,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  ListOrdered,
  // v8.0.3 — Para el chip fantasma del adjunto que aún se está procesando.
  Loader2,
  MessageSquare,
  // v1.16.6 — chip del MODO EDITOR (chat central → orden al Editor web).
  Palette,
  Paperclip,
  Pencil,
  Plus,
  // v1.73.0 · LIMPIEZA DE INTERFAZ: «Canal Directo» (carpeta/ZIP) y el menú
  // desplegable que agrupa los interruptores que antes copaban la barra.
  FolderPlus,
  SlidersHorizontal,
  ChevronDown,
  Radio,
  RefreshCw,
  Sparkles,
  Square,
  Shield,
  Terminal,
  Trash2,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
  Lightbulb,
  Play,
  Timer,
} from "lucide-react";
import { AgentAction, AgentTask, AttachmentItem, ChatMessage, QueuedMessageItem, SavedChat } from "../types";
// v1.16.6 — etiqueta y ayuda del chip de pensamiento: fuente única (engine).
import { AYUDA_MODO, ETIQUETA_MODO, esModoPensamiento, type ModoPensamiento, AYUDA_NIVEL_RAZON, ETIQUETA_NIVEL_RAZON, esNivelRazonGemini, type NivelRazonGemini } from "../engine/thinkingMode";
import { repairNumberedListsAndGaps } from "../utils/engine";
// v8.0.1 — ADUANA DE SALIDA: quita los rótulos de acta que el motor pedía al
// modelo ([DIAGNÓSTICO FLASH] / [ACCIÓN] / [CHECKLIST DE MEMORIA]). El prompt
// ya no los pide (ver brain.ts); esto recoge el residuo de los modelos que los
// tienen memorizados. Una sola función pura, aplicada en el único punto donde
// el texto llega a la vista: así no hay forma de saltársela.
import { limpiarMetadatosDeCierre } from "../utils/formatFixer";
// v8.0.4 — Elección de la voz del navegador. Módulo PURO (src/utils/voz.ts) para
// poder probar la prioridad entre voces sin un navegador: un `find()` apresurado
// era la causa de que sonara siempre la voz robótica.
import { elegirMejorVoz, elegirMejorVozLocal, idiomaDeVozPreferido, acortarMotivo, avisoDeVozNoDisponible, reforzarWavBase64, REFUERZO_VOZ, trocearParaVoz } from "../utils/voz";
import { anunciarVozActiva } from "../utils/vozActiva"; // v1.57.9 — ducking del fondo mientras habla
// TTS v1.15.0 — Configuración compartida de voz/tono/velocidad con el botón de
// la barra superior (ver utils/ttsConfig.ts). Aquí se lee y se aplica al hablar.
import { cargarConfigTts, guardarConfigTts, EVENTO_CONFIG_TTS, EVENTO_GEMINI_TTS_KEY, esVozGemini, leerClaveGeminiTts } from "../utils/ttsConfig";
import { etiquetaDeLaFila } from "../engine/lanzarEnCola"; // v1.0.20 — la cola muestra lo lanzado

/** Compone los dos arreglos de salida en el orden correcto y en un solo sitio.
 *  F2 — el guardián de «código sin explicación» corre aquí, en el único punto
 *  donde el texto del modelo llega a la vista: un bloque file="…" mudo se anota
 *  con el chip gris sin que haga falta tocar el modelo. */
const componerCuerpo = (texto: string): string =>
  anotarBloquesSinExplicacion(limpiarMetadatosDeCierre(repairNumberedListsAndGaps(texto)));

// ══════════════════════════════════════════════════════════════════════════
// v1.70.6 · MODO RESULTADOS — «EL CHAT NO ES UNA BIBLIA» (pedido de Mario, 25/10)
// ──────────────────────────────────────────────────────────────────────────
// Un mensaje DENSO (2+ vallas o 700+ chars de código) deja de ser un muro de
// texto: cada bloque se pliega en una ficha `ruta · N líneas · aplicado` que se
// expande con un clic, y las frases de intención («Voy a…») se condensan en la
// ÚLTIMA, como línea viva de actividad. Los mensajes normales (charla, una
// pegatina corta) se ven EXACTAMENTE igual que antes. Copiar, voz y export
// siguen usando el crudo: nada se pierde, solo se ordena la presentación.
// ══════════════════════════════════════════════════════════════════════════

const FichaArchivo: React.FC<{ seg: Extract<SegmentoMensaje, { tipo: "archivo" }>; streaming?: boolean }> = ({
  seg,
  streaming,
}) => {
  const [copiado, setCopiado] = useState(false);
  const rotulo = seg.ruta || (seg.lenguaje ? `bloque.${seg.lenguaje}` : "bloque de código");
  const estado = seg.abierto
    ? "escribiendo…"
    : streaming
    ? "listo (el IDE lo aplica al terminar)"
    : seg.ruta
    ? "✓ aplicado al workspace"
    : "✓ listo";
  const copiarBloque = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      navigator.clipboard?.writeText(seg.contenido);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1500);
    } catch { /* sin clipboard: queda el botón «Copiar» del mensaje */ }
  };
  return (
    <details className="group my-1.5 overflow-hidden rounded-lg border border-[#16233b] bg-[#060b14]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 font-mono text-[10.5px] text-cyan-300/90 hover:bg-cyan-500/5">
        <FileCode className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate font-semibold">{rotulo}</span>
        <span className="shrink-0 text-zinc-500">{seg.lineas} líneas</span>
        <span className={`ml-auto shrink-0 ${seg.abierto ? "text-amber-300" : "text-emerald-400/90"}`}>{estado}</span>
        <button
          type="button"
          onClick={copiarBloque}
          title="Copiar solo este bloque"
          className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-cyan-300"
        >
          {copiado ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </summary>
      <pre className="cn-chat-pre max-h-72 overflow-auto whitespace-pre border-t border-[#16233b] bg-[#03070e] px-3 py-2 font-mono text-[10.5px] leading-5 text-zinc-300">
        <code>{seg.contenido}</code>
      </pre>
    </details>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ──────────────────────────────────────────────────────────────────────────
// v1.92.0 · PROSA LEGIBLE — «MEJORA LA ESTÉTICA PARA MEJOR COMPRENSIÓN DEL CHAT»
// (pedido de Mario, 30/10)
// El cuerpo del mensaje se dibujaba con `whitespace-pre-wrap` a secas: el usuario
// leía los HUESOS del Markdown (**negrita**, ### título, |celdas|, `código`) en
// vez de la idea. Aquí se pinta la estructura que el modelo ya escribió.
// CERO riesgo de censura: el crudo de `msg.content` no se toca — copiar, voz y
// export siguen diciendo lo mismo. Solo cambia cómo entra por los ojos.
// Los tamaños van en `em` (relativos al cuerpo), nunca absolutos: el regulador de
// tamaño del panel «A» manda sobre `.cn-regulable` con `!important`, y si cada
// bloque clavara sus px la perilla del usuario dejaría de servir a mitad.
// Criterio de parsing: src/utils/prosaLegible.ts (puro, con su suite).
// ────────────────────────────────────────────────────────────────────────────
const Tramos: React.FC<{ tramos: Tramo[] }> = ({ tramos }) => (
  <>
    {tramos.map((t, i) => {
      if (t.t === "b") return <strong key={i} className="font-semibold text-zinc-50">{t.texto}</strong>;
      if (t.t === "i") return <em key={i} className="italic text-zinc-300/90">{t.texto}</em>;
      if (t.t === "c")
        return (
          <code
            key={i}
            className="mx-[1px] rounded-[4px] border border-[#1c2a42] bg-[#0a1320] px-[3px] py-[1px] font-mono text-[0.9em] text-cyan-200"
          >
            {t.texto}
          </code>
        );
      if (t.t === "a")
        return (
          <a
            key={i}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 underline decoration-cyan-800 underline-offset-2 hover:text-cyan-200"
            title={t.href}
          >
            {t.texto}
          </a>
        );
      return <React.Fragment key={i}>{t.texto}</React.Fragment>;
    })}
  </>
);

/** Techo del renderizado AL VUELO. `CuerpoMensaje` también pinta el streaming
 *  (línea de abajo, `streaming`), y ahí el texto crece un token por frame:
 *  re-parsear 20.000 caracteres en cada uno es O(n²) de trabajo para terminar
 *  pintando lo mismo. Pasado el techo, el turno en curso se ve como texto plano
 *  —como se veía siempre— y el parseo completo entra cuando el mensaje cierra.
 *  No es un atajo cosmético: es la diferencia entre «la IDE se puso lenta
 *  pensando» y una respuesta fluida (queja registrada en v1.88.1). */
const TECHO_PROSA_STREAMING = 4000;

const ProsaLegibleBase: React.FC<{ texto: string; compacta?: boolean; streaming?: boolean }> = ({ texto, compacta, streaming }) => {
  const crudoAlVuelo = Boolean(streaming) && texto.length > TECHO_PROSA_STREAMING;
  const bloques = useMemo(() => (crudoAlVuelo ? [] : parsearProsa(texto)), [texto, crudoAlVuelo]);
  if (crudoAlVuelo) return <div className="whitespace-pre-wrap">{texto}</div>;
  if (!bloques.length) return null;
  return (
    <div className={`cn-prosa ${compacta ? "space-y-1" : "space-y-1.5"}`}>
      {bloques.map((b, i) => {
        if (b.tipo === "titulo")
          return b.nivel <= 2 ? (
            <h4 key={i} className="mb-0.5 mt-2 border-b border-[#16233b] pb-0.5 text-[1.1em] font-semibold leading-snug text-cyan-100">
              <Tramos tramos={b.tramos} />
            </h4>
          ) : (
            <h5 key={i} className="mt-1.5 text-[1.02em] font-semibold leading-snug text-zinc-100">
              <Tramos tramos={b.tramos} />
            </h5>
          );
        if (b.tipo === "lista")
          return (
            <ul key={i} className="ml-0.5 space-y-0.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex items-start gap-1.5 leading-snug" style={{ marginLeft: `${it.nivel * 12}px` }}>
                  <span className="mt-[1px] shrink-0 select-none font-mono text-[0.85em] leading-snug text-cyan-500/80">
                    {it.hecho === null ? (b.ordenada ? `${j + 1}.` : "•") : it.hecho ? "☑" : "☐"}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">
                    <Tramos tramos={it.tramos} />
                  </span>
                </li>
              ))}
            </ul>
          );
        if (b.tipo === "cita")
          return (
            <blockquote key={i} className="border-l-2 border-cyan-800/70 bg-cyan-950/20 py-0.5 pl-2 text-[0.97em] italic leading-snug text-zinc-400">
              <Tramos tramos={b.tramos} />
            </blockquote>
          );
        if (b.tipo === "tabla")
          return (
            <div key={i} className="overflow-x-auto rounded-md border border-[#16233b]">
              <table className="w-full border-collapse text-[0.92em]">
                <thead>
                  <tr className="bg-[#0a1220]">
                    {b.cabecera.map((c, j) => (
                      <th key={j} className="border-b border-[#16233b] px-2 py-1 text-left font-semibold text-cyan-200/90">
                        <Tramos tramos={c} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.filas.map((f, j) => (
                    <tr key={j} className={j % 2 ? "bg-[#060b14]" : ""}>
                      {f.map((c, k) => (
                        <td key={k} className="border-t border-[#0f1728] px-2 py-1 align-top text-zinc-300">
                          <Tramos tramos={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (b.tipo === "separador") return <hr key={i} className="my-1.5 border-0 border-t border-[#16233b]" />;
        if (b.tipo === "codigo")
          return (
            <pre key={i} className="cn-chat-pre max-h-72 overflow-auto whitespace-pre rounded-md border border-[#16233b] bg-[#03070e] px-2.5 py-1.5 font-mono text-[0.9em] leading-snug text-zinc-300">
              <code>{b.contenido}</code>
            </pre>
          );
        return (
          <p key={i} className="leading-snug">
            <Tramos tramos={b.tramos} />
          </p>
        );
      })}
    </div>
  );
};

/**
 * v1.99.6 · MEMO con props primitivas (queja de Mario del 31/10: «cuando hay muchos mensajes le
 * cuesta escribir en el teclado, queda muy lento»). El `useMemo` de adentro ya ahorraba el PARSEO,
 * pero no el RENDER: con la ventana de 40 mensajes, cada tecla volvía a crear los elementos de
 * todos los bloques —títulos, listas, tablas— de los mensajes que no cambiaron nada, y React tenía
 * que reconciliarlos contra un árbol que era idéntico. Con las tres props cuerdas/booleanas,
 * `React.memo` es un bail-out EXACTO: mismo texto, mismo DOM, cero trabajo. El único que vuelve a
 * pintar durante el caudal es el mensaje en curso, que es el único cuyo `texto` cambia.
 *
 * Por qué acá y no en la fila entera: la fila recibe handlers y objetos que nacen nuevos en cada
 * render del padre, así que un `memo` ahí sería decorado (compararía siempre distinto). La prosa es
 * el único lugar donde las props son de valor, y es también lo caro.
 */
const ProsaLegible = React.memo(ProsaLegibleBase);

// v1.84.1 · CEREBRO/AUTO LIMPIO (pedido de Mario, 27/10, sesion exportada 26/10):
// «solo entregar la resolucion y los demas detalles en una ventana cerrada con
// su boton para ver el pensamiento o la tarea realizada». La respuesta
// eclectica deja de volcar el informe entero al chat: en la burbuja se lee el
// VEREDICTO; la tabla de voces, puntajes, acuerdo, divergencias, riesgos,
// resumen y la tarea consultada viajan detras del boton, en una ventana `<details>`
// NACIDA CERRADA. El crudo se conserva integro en el mensaje: copiar, voz y
// export siguen diciendo todo (aqui solo se ordena la presentacion, nunca se
// censura). Logica pura en utils/chatResultados.ts · dividirEclectica().
// ═══════════════════════════════════════════════════════════════════════════
/** Barrita de acuerdo: el porcentaje se VE, no se lee (<40 rojo, <70 ámbar). */
const BarraAcuerdo: React.FC<{ pct: number; ancho?: string }> = ({ pct, ancho = "w-16" }) => {
  const n = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = n < 40 ? "bg-rose-500" : n < 70 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Acuerdo medido: ${n} %`}>
      <span className={`h-1.5 ${ancho} overflow-hidden rounded-full bg-[#0d1524] ring-1 ring-inset ring-[#1b2740]`}>
        <span className={`block h-full ${color}`} style={{ width: `${n}%` }} />
      </span>
      <span className="font-mono text-[10px] tabular-nums text-zinc-400">{n} %</span>
    </span>
  );
};

/** Rótulo de sección dentro del detalle plegado. */
const RotuloEclectico: React.FC<{ children: React.ReactNode; clase?: string }> = ({ children, clase = "text-zinc-500" }) => (
  <div className={`mb-1 mt-2.5 font-mono text-[9.5px] uppercase tracking-wider ${clase}`}>{children}</div>
);

/** Lista de un valor (coincidencias / divergencias / riesgos) con su color. */
const ListaEclectica: React.FC<{ items: string[]; marca: string; clase: string }> = ({ items, marca, clase }) => (
  <ul className="space-y-0.5">
    {items.map((x, i) => (
      <li key={i} className={`flex items-start gap-1.5 leading-snug ${clase}`}>
        <span className="mt-[1px] shrink-0 font-mono text-[10px]">{marca}</span>
        <span className="min-w-0 flex-1">
          <ProsaLegible texto={x} compacta />
        </span>
      </li>
    ))}
  </ul>
);

/**
 * v1.92.0 · REESTRUCTURA ESTÉTICA DEL ECLÉCTICO (Mario, 30/10: «restrucura
 * estética de eclectico»). A la vista quedan los NÚMEROS (voces, acuerdo, qué
 * hizo la fase 2) y las dos cosas que se leen: VEREDICTO y RESUMEN. Detrás del
 * botón, cada pieza con su forma: las voces en tabla real con ✔/✗, el acuerdo en
 * barra, coincidencias/divergencias/riesgos en listas de color y la obra con sus
 * pasos. El monoespaciado solo queda como refugio cuando el informe no calza con
 * el molde — nunca se esconde sin reemplazar, nunca se inventa estructura.
 */
const ResumenEclectica: React.FC<{ ecl: EclecticaDividida }> = ({ ecl }) => {
  const p = useMemo(() => dividirInformeEclectico(ecl.detalle), [ecl.detalle]);
  const pct = Number(String(ecl.acuerdo).replace(/[^\d]/g, "")) || 0;
  const obraPasos = p?.obra?.pasos.length ?? 0;
  const obraOk = p?.obra ? p.obra.pasos.filter((s) => s.ok).length : 0;
  return (
    <div className="font-sans break-words selection:bg-cyan-500/40 select-text">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
        <span className="rounded border border-violet-700/50 bg-violet-950/40 px-1.5 py-0.5 text-violet-300">🎭 cerebro/auto</span>
        {ecl.voces && (
          <span className="rounded border border-[#16233b] bg-[#060b14] px-1.5 py-0.5 text-zinc-400" title="Voces que contestaron / voces convocadas">
            {ecl.voces} voces
          </span>
        )}
        {ecl.acuerdo && (
          <span className="rounded border border-[#16233b] bg-[#060b14] px-1.5 py-0.5">
            <BarraAcuerdo pct={pct} />
          </span>
        )}
        {p?.obra?.intentada && (
          <span
            className={`rounded border px-1.5 py-0.5 ${obraOk > 0 ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-rose-900/60 bg-rose-950/30 text-rose-300"}`}
            title="Fase 2: la tarea ejecutada con herramientas"
          >
            fase 2 · {obraOk}/{obraPasos} con efecto
          </span>
        )}
      </div>
      {p?.bucle && (
        <div className="mb-1.5 rounded-md border border-rose-800/60 bg-rose-950/30 px-2 py-1 text-[11px] leading-snug text-rose-200">
          {p.bucle}
        </div>
      )}
      {p && (p.veredicto || p.resumen) ? (
        <>
          {p.veredicto && (
            <div className="rounded-lg border border-violet-800/60 bg-violet-950/25 px-2.5 py-2">
              <div className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-violet-300">veredicto final de la tarea</div>
              <ProsaLegible texto={p.veredicto} compacta />
            </div>
          )}
          {p.resumen && (
            <div className="mt-1.5 rounded-lg border border-[#16233b] bg-[#060b14] px-2.5 py-2">
              <div className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">resumen del enjambre</div>
              <ProsaLegible texto={p.resumen} compacta />
            </div>
          )}
        </>
      ) : (
        // Informe sin piezas reconocibles (o sin veredicto todavía): se ve la
        // resolución cruda tal cual, sin fingir que se reestructuró.
        <div className="whitespace-pre-wrap">{ecl.resolucion}</div>
      )}
      <details className="group my-1.5 overflow-hidden rounded-lg border border-[#16233b] bg-[#060b14]">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 font-mono text-[10.5px] text-violet-300/90 hover:bg-violet-500/5">
          <Brain className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">Ver el pensamiento del enjambre / la tarea realizada</span>
          <span className="ml-auto shrink-0 text-zinc-600">
            {p ? `${p.voces.length} voces · ${p.coincidencias.length} coincid. · ${p.divergencias.length} diverg.` : "crudo del informe"}
          </span>
        </summary>
        <div className="max-h-[70vh] overflow-auto border-t border-[#16233b] bg-[#03070e] px-3 py-2 text-[11px] text-zinc-300 select-text">
          {p ? (
            <>
              {p.voces.length > 0 && (
                <>
                  <RotuloEclectico>voces consultadas</RotuloEclectico>
                  <div className="overflow-x-auto rounded-md border border-[#16233b]">
                    <table className="w-full border-collapse text-[10.5px]">
                      <thead>
                        <tr className="bg-[#0a1220]">
                          <th className="border-b border-[#16233b] px-2 py-1 text-left font-semibold text-zinc-400">#</th>
                          <th className="border-b border-[#16233b] px-2 py-1 text-left font-semibold text-zinc-400">voz</th>
                          <th className="border-b border-[#16233b] px-2 py-1 text-left font-semibold text-zinc-400">estado</th>
                          <th className="border-b border-[#16233b] px-2 py-1 text-right font-semibold text-zinc-400">pts</th>
                          <th className="border-b border-[#16233b] px-2 py-1 text-right font-semibold text-zinc-400">ms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.voces.map((v, i) => (
                          <tr key={i} className={i % 2 ? "bg-[#060b14]" : ""}>
                            <td className="border-t border-[#0f1728] px-2 py-1 font-mono text-zinc-500">{v.n}</td>
                            <td className="border-t border-[#0f1728] px-2 py-1 font-mono text-cyan-200/90">{v.voz}</td>
                            <td className={`border-t border-[#0f1728] px-2 py-1 ${v.ok ? "text-emerald-300/90" : "text-rose-300"}`}>{v.estado}</td>
                            <td className="border-t border-[#0f1728] px-2 py-1 text-right font-mono tabular-nums text-zinc-300">{v.puntaje}</td>
                            <td className="border-t border-[#0f1728] px-2 py-1 text-right font-mono tabular-nums text-zinc-500">{v.ms}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {(p.acuerdoTexto || p.mejorVoz) && (
                <>
                  <RotuloEclectico>consenso</RotuloEclectico>
                  {p.acuerdoTexto && (
                    <div className="flex flex-wrap items-center gap-2 leading-snug">
                      <BarraAcuerdo pct={pct} ancho="w-24" />
                      <span className="text-zinc-500">{p.acuerdoTexto.replace(/\d{1,3}\s*%/, "").replace(/^[·\s]+/, "")}</span>
                    </div>
                  )}
                  {p.mejorVoz && (
                    <div className="mt-1 leading-snug">
                      <span className="text-zinc-500">voz más sólida: </span>
                      <span className="font-mono text-emerald-300/90">{p.mejorVoz}</span>
                    </div>
                  )}
                </>
              )}
              {p.coincidencias.length > 0 && (
                <>
                  <RotuloEclectico clase="text-emerald-400/90">coinciden varias voces</RotuloEclectico>
                  <ListaEclectica items={p.coincidencias} marca="=" clase="text-emerald-200/90" />
                </>
              )}
              {p.divergencias.length > 0 && (
                <>
                  <RotuloEclectico clase="text-amber-400/90">lo dijo una sola voz — verificar</RotuloEclectico>
                  <ListaEclectica items={p.divergencias} marca="≠" clase="text-amber-200/90" />
                </>
              )}
              {p.riesgos.length > 0 && (
                <>
                  <RotuloEclectico clase="text-rose-400/90">riesgos declarados</RotuloEclectico>
                  <ListaEclectica items={p.riesgos} marca="!" clase="text-rose-200/90" />
                </>
              )}
              {p.obra?.intentada && (
                <>
                  <RotuloEclectico clase="text-cyan-400/90">fase 2 · la tarea, ejecutada</RotuloEclectico>
                  {p.obra.pasos.length === 0 ? (
                    <div className="leading-snug text-rose-300">{p.obra.veredicto || "No se ejecutó nada."}</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {p.obra.pasos.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5 leading-snug">
                          <span className={`mt-[1px] shrink-0 font-mono text-[10px] ${s.ok ? "text-emerald-400" : "text-rose-400"}`}>{s.ok ? "✔" : "✗"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-mono text-[10px] text-cyan-200/90">{s.nombre}</span>
                            <span className="text-zinc-400"> — {s.resumen}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.obra.veredicto && p.obra.pasos.length > 0 && (
                    <div className={`mt-1 leading-snug ${obraOk > 0 ? "text-emerald-300/90" : "text-rose-300"}`}>{p.obra.veredicto}</div>
                  )}
                  {p.obra.cierre && <div className="mt-1 border-l-2 border-cyan-900/70 pl-2 leading-snug italic text-zinc-400">{p.obra.cierre}</div>}
                </>
              )}
              {p.notas.length > 0 && (
                <>
                  <RotuloEclectico>cómo se armó este enjambre</RotuloEclectico>
                  <ul className="space-y-0.5 text-zinc-500">
                    {p.notas.map((n, i) => (
                      <li key={i} className="leading-snug">{n}</li>
                    ))}
                  </ul>
                </>
              )}
              {p.resto && (
                <>
                  <RotuloEclectico>resto del informe</RotuloEclectico>
                  <ProsaLegible texto={p.resto} compacta />
                </>
              )}
              {p.tarea && (
                <div className="mt-2 border-t border-[#16233b] pt-1.5 leading-snug text-zinc-500">
                  <span className="text-zinc-600">tarea consultada: </span>
                  {p.tarea}
                </div>
              )}
            </>
          ) : (
            <div className="whitespace-pre-wrap font-mono text-[10.5px] leading-5 text-zinc-400">{ecl.detalle}</div>
          )}
        </div>
      </details>
    </div>
  );
};

// LA PUERTA ÚNICA SIGUE SIENDO `componerCuerpo`: quien pinta un mensaje del
// asistente se lo pasa FILTRADO por la prop `cuerpo` (formato.test.ts vigila
// que mensaje guardado y streaming pasen literalmente por ahí; el plegado de
// resultados no abre una segunda puerta, se sienta detrás de la misma).
const CuerpoMensajeBase: React.FC<{ cuerpo: string; streaming?: boolean }> = ({ cuerpo: cuerpoCrudo, streaming }) => {
  // v1.99.3 · EL CAUDAL DE LA PANTALLA (dueño puro: `src/engine/goteo.ts`).
  // Queja 1/11: «la pantalla cae de golpe a veces o va muy rápido… normalizá siempre la
  // misma velocidad, nivel lectura media-rápida… aunque el entregable vaya fuera de tiempo
  // de ejecución, sincronizado y constante». El pantallazo venía de pintar cada parche del
  // SSE en cuanto arribaba: la pantalla heredaba el ritmo del servidor, que no es el ritmo
  // de nadie. Acá el texto se revela a 45 cps CON RELOJ ABSOLUTO por mensaje.
  // Dos decisiones que no son de gusto:
   //   · la bomba late ~10 veces por segundo, no cuadro a cuadro: repintar Markdown 60 veces
   //     por segundo es el mismo pantallazo con otra cara, y con el historial largo mataba el
   //     teclado. El techo no depende de cuánta RAM tenga cada equipo: a 45 caracteres/segundo,
   //     60 Hz no aporta un solo carácter más de lo que se puede leer.
  //   · se revela en el límite de render y no en el camino del SSE: el stream sigue
  //     acumulando crudo, así que si la red se corta no se pierde ni un carácter.
  const [visibles, setVisibles] = useState(() => (streaming ? 0 : cuerpoCrudo.length));
  const arranqueRef = useRef(0);
  useEffect(() => {
    if (!streaming) {
      // Fuera del stream no hay nada que animar: el historial se pinta entero, de una.
      arranqueRef.current = 0;
      setVisibles(cuerpoCrudo.length);
      return;
    }
    if (!arranqueRef.current) arranqueRef.current = Date.now();
    let vivo = true;
    let ultimo = 0;
    const bombear = () => {
      if (!vivo) return;
      const ahora = Date.now();
      if (ahora - ultimo >= 100) {
        ultimo = ahora;
        const desde = arranqueRef.current || ahora;
        setVisibles((prev) => decidirCuadro({
          texto: cuerpoCrudo,
          soltados: Math.min(prev, cuerpoCrudo.length),
          msTranscurrido: ahora - desde,
          streamEnCurso: true,
        }).soltados);
      }
      requestAnimationFrame(bombear);
    };
    const id = requestAnimationFrame(bombear);
    return () => { vivo = false; cancelAnimationFrame(id); };
  }, [cuerpoCrudo, streaming]);
  // Todo lo que sigue (eclectic, denso, charla) se deriva de ESTO: una sola puerta, un solo
  // caudal. Si cada rama recortara su propio texto, la velocidad volvería a ser del server.
  const cuerpo = streaming ? cuerpoCrudo.slice(0, visibles) : cuerpoCrudo;
  // v1.84.1 — la respuesta eclectica (cerebro/auto) se presenta PRIMERO: solo la
  // resolucion a la vista y el informe detras del boton. Si el informe aun no
  // trae veredicto (streaming temprano), dividirEclectica dice null y se ve el
  // crudo hasta que la resolucion exista — nunca se esconde sin reemplazar.
  const ecl = useMemo(() => dividirEclectica(cuerpo), [cuerpo]);
  const denso = useMemo(() => esMensajeDenso(cuerpo), [cuerpo]);
  const segmentos = useMemo(() => (denso ? segmentarMensaje(cuerpo) : null), [cuerpo, denso]);
  // v1.99.0 · #17 · EL CUERPO DE LA BURBUJA NO ES EL TALLER (pedido de Mario del 31/10:
  // «mencionar pasos, explicaciones o preguntas, pero TODO el pensamiento que quede en
  // segundo plano con el desplegable»). Las capturas mostraban bañera de proceso en la
  // pantalla («Hay 7 procesos node, pero ninguno es hijo claro de la validación… Cambio
  // de enfoque: mato ese proceso muerto…», «La consola es cp1252 y el log tiene UTF-8.
  // Fuerzo la salida a ASCII seguro.»).
  // El corte NO se inventa acá ni se duplica: es EL MISMO que ya hace `dividirVozSimple`
  // para las dos bocas de voz (ultimo parrafo de prosa corrida = lo que el modelo cerro;
  // todo lo anterior = proceso). Una verdad, una funcion: si manana el corte cambia,
  // cambian juntas la voz y la pantalla.
  // No se esconde nada: el proceso queda detras de un <details> que dice CUANTOS
  // caracteres guarda. Y durante el streaming no se pliega, que el texto todavia esta
  // naciendo y plegarlo lo haria saltar.
  const dosBocas = useMemo(() => (denso ? null : dividirVozSimple(cuerpo)), [cuerpo, denso]);
  // (Sin la bandera `streaming` adentro de esta rama: está defendida por `!streaming`,
  // así que pasarla sería decorado y prometería un parseo al vuelo que acá no ocurre.
  // `tests/prosaLegible.test.ts` congela que sólo las dos ramas vivas la piden.)
  if (dosBocas && !streaming) {
    // v2.3.3 · DOS SUPERFICIES, DOS PAPELES (pedido del 4/11: «poder encontrar fácil
    // el mensaje y la respuesta concreta y diferenciada del pensamiento en detalle»,
    // con «tonos distintos para remarcar… no chillones», sobre el dark de siempre).
    //
    // Cómo estaba: la respuesta iba Directamente sobre el fondo de la burbuja —sin
    // marca propia— y el pensamiento era un <details> con un filete de 1 px y
    // `opacity-90`. Dos defectos en uno: (a) nada jerarquizaba lo que el usuario
    // NEEDLE leer sobre lo que puede ignorar, y (b) `opacity-90` **bajaba el
    // contraste** del texto, que es justo lo contrario de diferenciar: un bloque
    // pálido se lee peor, no se lee distinto.
    //
    // Ahora: la RESPUESTA lleva un costado tenéu (verde-agua apagado, no neón) y su
    // aire; el PENSAMIENTO tiene superficie propia, más hundida que la burbuja, con
    // RÓTULO que dice qué es y cuántos caracteres guarda. Ninguno de los dos baja la
    // opacidad del texto: la diferencia se hace con el fondo y el ribete, que es lo
    // que el ojo usa para separar, no con hacer letras fantasma.
    return (
      <div className="font-sans break-words selection:bg-cyan-500/25 select-text">
        <div className="border-l-2 border-[#2f4d4a] pl-2.5 py-0.5">
          <ProsaLegible texto={dosBocas.resumen} />
        </div>
        <details className="mt-2 rounded-lg border border-[#1b2735] bg-[#0a1018] px-2.5 py-1.5">
          <summary className="cursor-pointer list-none text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
            {`pensamiento en detalle · ${dosBocas.pensamiento.length} caracteres`}
          </summary>
          <div className="mt-1.5 border-l border-[#1b2735] pl-2 text-zinc-400">
            <ProsaLegible texto={dosBocas.pensamiento} compacta />
          </div>
        </details>
      </div>
    );
  }
  if (ecl) {
    return <ResumenEclectica ecl={ecl} />;
  }
  if (!segmentos) {
    // Charla normal: antes era `whitespace-pre-wrap` pelado. ProsaLegible respeta
    // los saltos de línea del original (cada párrafo es un bloque) y solo añade
    // la estructura que el texto ya pedía a gritos.
    return (
      <div className="font-sans break-words selection:bg-cyan-500/40 select-text">
        <ProsaLegible texto={cuerpo} streaming={streaming} />
      </div>
    );
  }
  return (
    <div className="font-sans break-words selection:bg-cyan-500/40 select-text">
      {segmentos.map((s, i) =>
        s.tipo === "archivo" ? (
          <FichaArchivo key={`a${i}`} seg={s} streaming={streaming} />
        ) : s.tipo === "intencion" ? (
          <div key={`i${i}`} className="my-1 flex items-start gap-1.5 py-0.5 text-cyan-300/90">
            {streaming ? (
              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <span className="mt-0.5 shrink-0 text-cyan-400">▸</span>
            )}
            <span className="text-[11px] leading-4">
              {s.texto}
              {s.tapadas > 0 && <span className="text-zinc-600"> · (+{s.tapadas} notas de intención plegadas)</span>}
            </span>
          </div>
        ) : (
          <ProsaLegible key={`p${i}`} texto={s.texto} compacta streaming={streaming} />
        )
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// v1.99.6 · LA BUBUJA TAMBIÉN MEMOIZADA. Mismo criterio que `ProsaLegible`: las dos props de
// `CuerpoMensaje` son `cuerpo: string` y `streaming?: boolean`, o sea VALORES. Con el historial
// abierto, cada tecla del composer re-renderiza `ChatCenter`; sin memo eso obliga a reconstruir la
// burbuja entera de los 40 mensajes a la vista (fichas de archivo, intenciones, plegados, las dos
// bocas de voz) para llegar a un DOM idéntico en 39 de ellos. Con memo, el único que trabaja es el
// que está hablando. Y el pump del caudal (`setVisibles`, estado LOCAL de la fila) sigue teniendo
// su render: el bail-out es entre padres, no contra el propio estado.
const CuerpoMensaje = React.memo(CuerpoMensajeBase);

// v1.73.0 · MENÚ DE AJUSTES DEL CHAT — «la mayor parte de opciones quedan
// dentro del menú desplegable, así la interfaz queda más limpia» (Mario,
// captura `areglo.jpg`). Los cuatro interruptores que copaban la barra
// (Agente PC, Pensar, Razonar, Editor) siguen existiendo — con los mismos
// handlers y la misma semántica — pero viven desplegados. El botón resume el
// estado en una línea para que nada cambie de comportamiento sin avisar.
// Regla nueva de la casa: AGENTE PC nace SIEMPRE ACTIVO (el default lo pone
// App.tsx); el interruptor queda aquí abajo solo como freno de emergencia.
// ══════════════════════════════════════════════════════════════════════════
const MenuAjustesChat: React.FC<{
  pcMode?: boolean;
  onTogglePcMode?: () => void;
  thinkingMode?: string;
  onCycleThinkingMode?: () => void;
  geminiThinkingLevel?: string;
  onCycleGeminiThinkingLevel?: () => void;
  isGeminiProvider?: boolean;
  currentModel: string;
  editorMode?: boolean;
  onToggleEditorMode?: () => void;
  showEditorMode?: boolean;
}> = ({
  pcMode,
  onTogglePcMode,
  thinkingMode,
  onCycleThinkingMode,
  geminiThinkingLevel,
  onCycleGeminiThinkingLevel,
  isGeminiProvider,
  currentModel,
  editorMode,
  onToggleEditorMode,
  showEditorMode,
}) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const alTocarFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, [abierto]);

  const modo: ModoPensamiento = esModoPensamiento(thinkingMode) ? thinkingMode : "auto";
  const razonVisible = isGeminiProvider && /^gemini-[34]/i.test(currentModel);
  const nivel: NivelRazonGemini = esNivelRazonGemini(geminiThinkingLevel) ? geminiThinkingLevel : "bajo";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title="Ajustes del agente: Agente PC, modo de pensamiento, razonamiento y editor (todo plegado aquí para limpiar la barra)"
        aria-expanded={abierto}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] border transition-all ${
          abierto
            ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300"
            : "bg-zinc-900/70 border-zinc-700/60 text-zinc-400 hover:text-cyan-300 hover:border-cyan-700/50"
        }`}
      >
        <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
        <span className="font-mono">Ajustes</span>
        <span className={`font-mono ${pcMode ? "text-emerald-400" : "text-zinc-600"}`}>PC</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="absolute left-0 top-full mt-1 w-72 z-[90] rounded-lg border border-cyan-500/40 bg-[#0a0f1c] shadow-2xl overflow-hidden">
          <div className="px-3 py-2 bg-[#0d1426] border-b border-[#1a2540]">
            <div className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider">Ajustes del agente</div>
          </div>
          <div className="p-1.5 space-y-1">
            {/* Agente PC — activado por defecto desde v1.73.0 */}
            <button
              type="button"
              onClick={onTogglePcMode}
              disabled={!onTogglePcMode}
              title={
                pcMode
                  ? "Modo Agente PC ACTIVO (siempre activo por defecto desde v1.73.0): el chat ejecuta acciones REALES en tu PC vía puente :5000. Clic para desactivar (freno de emergencia)."
                  : "Agente PC DESACTIVADO: el puente rechaza toda ejecución. Clic para reactivar."
              }
              className="w-full px-2.5 py-2 text-left rounded-md hover:bg-emerald-500/10 text-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Cpu className={`w-3.5 h-3.5 ${pcMode ? "text-emerald-400" : "text-zinc-500"}`} />
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-semibold">Agente PC {pcMode ? "— ON" : "— OFF"}</span>
                <span className="text-[9px] text-zinc-500">Acciones reales en tu PC (puente :5000). Default: siempre ON.</span>
              </div>
            </button>
            {/* Pensar: Auto → Rápido → Ingeniero → Profundo */}
            <button
              type="button"
              onClick={onCycleThinkingMode}
              disabled={!onCycleThinkingMode}
              title={AYUDA_MODO[modo]}
              className="w-full px-2.5 py-2 text-left rounded-md hover:bg-violet-500/10 text-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-40"
            >
              <Brain className={`w-3.5 h-3.5 ${modo === "profundo" ? "text-violet-400 animate-pulse" : "text-violet-300/70"}`} />
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-semibold">Pensar: {ETIQUETA_MODO[modo]}</span>
                <span className="text-[9px] text-zinc-500">Clic para rotar Auto → Rápido → Ingeniero → Profundo</span>
              </div>
            </button>
            {/* Razonar Gemini (solo familia 3) */}
            {razonVisible && (
              <button
                type="button"
                onClick={onCycleGeminiThinkingLevel}
                disabled={!onCycleGeminiThinkingLevel}
                title={AYUDA_NIVEL_RAZON[nivel]}
                className="w-full px-2.5 py-2 text-left rounded-md hover:bg-rose-500/10 text-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-40"
              >
                <Lightbulb className="w-3.5 h-3.5 text-rose-300/80" />
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold">Razonar: {ETIQUETA_NIVEL_RAZON[nivel]}</span>
                  <span className="text-[9px] text-zinc-500">thinkingLevel real del SDK: Bajo → Medio → Alto</span>
                </div>
              </button>
            )}
            {/* Editor — solo con la pestaña abierta */}
            {showEditorMode && (
              <button
                type="button"
                onClick={onToggleEditorMode}
                disabled={!onToggleEditorMode}
                title={
                  editorMode
                    ? "Modo Editor ACTIVO: cada mensaje es una orden para el Editor web (sandbox :3500). Clic para volver al chat normal."
                    : "Activar Modo Editor: los mensajes de este chat se convierten en órdenes para el Editor web."
                }
                className="w-full px-2.5 py-2 text-left rounded-md hover:bg-fuchsia-500/10 text-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-40"
              >
                <Palette className={`w-3.5 h-3.5 ${editorMode ? "text-fuchsia-400" : "text-fuchsia-300/60"}`} />
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold">Editor {editorMode ? "ON" : "OFF"}</span>
                  <span className="text-[9px] text-zinc-500">Órdenes de diseño al Editor web (:3500)</span>
                </div>
              </button>
            )}
          </div>
          <div className="px-3 py-1.5 bg-[#04060d] border-t border-[#141d2e]">
            <p className="text-[9px] text-zinc-600 font-mono leading-relaxed">
              💡 v1.73.0: los interruptores obsoletos salieron de la barra; lo que importa se activa solo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

interface ChatCenterProps {
  messages: ChatMessage[];
  currentStreamingText: string;
  isStreaming: boolean;
  /**
   * v1.99.9 · el PASO de horma que le toca al chat, calculado por App con la ventana y los paneles
   * abiertos (`src/engine/hormaChat.ts`). Reemplaza el viejo `amplio: boolean`, que sólo sabía de
   * dos estados y miraba nada más el panel derecho. Sin prop = la horma histórica (`normal`), así
   * que ningún uso existente del componente se enteró de que esto cambió.
   */
  horma?: PasoHorma;
  onSendMessage: (text: string, attachments: AttachmentItem[]) => void;
  onStopStreaming: () => void;
  currentModel: string;
  onOpenModelSelector: () => void;
  pendingAttachments: AttachmentItem[];
  /**
   * v8.0.3 — Nombres de los archivos que TODAVÍA se están procesando, en orden.
   * Opcional a propósito: si no se pasa, la tira funciona igual que antes (solo
   * con lo ya cargado). Así el cambio no puede romper ningún uso existente.
   */
  pendingNames?: string[];
  onAddAttachments: (files: FileList | File[]) => void;
  onRemovePendingAttachment: (id: string) => void;
  onClearPendingAttachments: () => void;
  messageQueue?: QueuedMessageItem[];
  onRemoveQueuedMessage?: (id: string) => void;
  /**
   * v1.0.14 · EDITAR UN MENSAJE EN COLA (pedido de Mario, 09/11): recibe el
   * id del mensaje encolado y el texto corregido. Opcional a propósito: si no
   * se pasa, la cola se ve igual de antes (sin lápiz de editar).
   */
  onEditQueuedMessage?: (id: string, text: string) => void;
  /**
   * v1.0.14 · LANZAR UN MENSAJE EN COLA YA — pedido de Mario (09/11): «agregar
   * un botón de lanzar al mensaje de cola, solo tiene editar y eliminar pero no
   * lanzar». Envía ESE mensaje sin esperar a que termine la generación en curso.
   */
  onLaunchQueuedMessage?: (id: string) => void;
  onClearQueue?: () => void;
  /** v1.83.0 · FASE 4 - modo limpio: interruptor global (App es la duena del estado). */
  modoLimpio?: boolean;
  onToggleModoLimpio?: () => void;
  onResetSessionCache?: () => void;
  onRegenerate?: () => void;
  onExportSession?: () => void;
  onImportSession?: (file: File) => void;
  activeFileName?: string;
  openFilesCount?: number;
  agentTasks?: AgentTask[];
  actionLog?: AgentAction[];
  pcMode?: boolean;
  onTogglePcMode?: () => void;
  // v1.16.6 — MODO EDITOR: con la pestaña «Editor web» abierta, este chip
  // convierte cada mensaje del chat central en una ORDEN PARA EL EDITOR (la
  // envuelve con la etiqueta compartida y el motor la aplica al sandbox).
  // Es la respuesta al «doble chat»: el editor ya NO tiene caja de escritura
  // propia; aquí hay un solo sitio donde se escribe y un solo interruptor.
  editorMode?: boolean;
  onToggleEditorMode?: () => void;
  /** El chip solo se muestra si la pestaña del editor está abierta. */
  showEditorMode?: boolean;
  // v1.16.6 — MODO DE PENSAMIENTO: un clic rota Auto → Rápido → Ingeniero →
  // Profundo. Escribe en proSettings.ai.executionMode (compartido con el menú
  // Pro) y su directriz viaja al system prompt de cada turno. Siempre visible:
  // pensar aplica a cualquier chat, no solo al editor.
  thinkingMode?: string;
  onCycleThinkingMode?: () => void;
  // v1.52.5 — NIVEL DE RAZONAMIENTO GEMINI: chip Bajo/Medio/Alto que controla
  // el thinkingLevel real del SDK (MINIMAL/MEDIUM/HIGH). Solo visible si el
  // provider es Gemini y el modelo es de la familia 3 (flash/mini).
  geminiThinkingLevel?: string;
  onCycleGeminiThinkingLevel?: () => void;
  isGeminiProvider?: boolean;
  // Carpeta de chats guardados
  savedChats?: SavedChat[];
  activeChatTitle?: string;
  onNewChat?: () => void;
  onOpenChat?: (id: string) => void;
  onDeleteChat?: (id: string) => void;
  onRenameChat?: (id: string, title: string) => void;
  onRenameActiveChat?: (title: string) => void;
  // Audio (TTS) maestro
  isSoundMuted?: boolean;
  // ═══════════════════════════════════════════════════════════════════════
  // v1.73.0 · CANAL DIRECTO — carpeta/ZIP de proyecto vinculado al chat.
  // El botón vive en el compositor; el chip de estado, en la barra. La lógica
  // pesada es del server (server/routers/carpetaProyecto.ts): aquí solo se
  // muestra la ruta vinculada y se abre el modal que gestiona la vinculación.
  // ═══════════════════════════════════════════════════════════════════════
  carpetaVinculada?: { ruta: string; nombre: string; origen: string; archivos: number } | null;
  onAbrirCarpetaProyecto?: () => void;
  onDesvincularCarpeta?: () => void;
}

/**
 * v1.13.0 — CUÁNTO SE ESPERA ANTES DE VOLVER A PEDIR VOZ A GEMINI.
 * Cinco minutos. El motivo: si se agotó la cuota (429) o la clave no vale, pedir
 * voz otra vez en el mensaje siguiente no puede funcionar — solo cuesta tiempo,
 * cuota y un aviso repetido. Pasado el rato se vuelve a intentar solo, sin que el
 * usuario tenga que tocar nada.
 */
const VOZ_EN_ESPERA_MS = 5 * 60_000;

// La horma del chat (el tope de ancho de la columna). `normal` es la de siempre,
// 896px: con un panel abierto a la derecha es la correcta y no se toca. `amplia`
// entra SOLO cuando no hay nada abierto: 1024px, que sobre una ventana de
// ~1900px se lee como una columna de verdad y no como una franja angosta flotando
// en el medio. Es "+un poco", no "todo el ancho": la línea de lectura pasa de
// ~105 a ~120 caracteres, y pasar de ahí degrada más de lo que luce.
// v1.99.9 · LA HORMA YA NO VIVE ACÁ. El ancho del chat se gradúa con la ventana y los paneles
// abiertos, y esa cuenta es un criterio: vive en `src/engine/hormaChat.ts` (probada en seco). El
// componente recibe el PASO y pregunta la clase — una sola lista de pasos en toda la app.
// `hormaClase` se calcula una vez por render y lo usan las CUATRO franjas (turnos, enjambre,
// alerta y composer): si una sola se queda con un literal, esa franja se desalinea del resto.

export const ChatCenter: React.FC<ChatCenterProps> = ({
  messages,
  currentStreamingText,
  isStreaming,
  horma,
  onSendMessage,
  onStopStreaming,
  currentModel,
  onOpenModelSelector,
  pendingAttachments,
  onAddAttachments,
  onRemovePendingAttachment,
  onClearPendingAttachments,
  messageQueue = [],
  pendingNames = [],
  onRemoveQueuedMessage,
  onEditQueuedMessage,
  onLaunchQueuedMessage,
  onClearQueue,
  modoLimpio,
  onToggleModoLimpio,
  onResetSessionCache,
  onRegenerate,
  onExportSession,
  onImportSession,
  activeFileName = "MEMORIA.md",
  openFilesCount = 1,
  agentTasks = [],
  actionLog = [],
  pcMode = false,
  onTogglePcMode,
  editorMode = false,
  onToggleEditorMode,
  showEditorMode = false,
  thinkingMode = "auto",
  onCycleThinkingMode,
  geminiThinkingLevel = "bajo",
  onCycleGeminiThinkingLevel,
  isGeminiProvider = false,
  savedChats = [],
  activeChatTitle = "",
  onNewChat,
  onOpenChat,
  onDeleteChat,
  onRenameChat,
  onRenameActiveChat,
  isSoundMuted = false,
  // v1.73.0 · CANAL DIRECTO (ver declaración en ChatCenterProps)
  carpetaVinculada = null,
  onAbrirCarpetaProyecto,
  onDesvincularCarpeta,
}) => {
  const [inputText, setInputText] = useState("");
  // v1.99.0 · cuantos mensajes de los de arriba ya pidio ver el usuario (0 = la ventana de siempre)
  const [revelados, setRevelados] = useState(0);

  // v1.6.11 — DESHACER (Ctrl+Z) en el compositor.
  // El textarea es CONTROLADO: el valor lo pone React, y eso deja al deshacer
  // nativo del navegador sin historial. En cuanto la app reescribe el campo (al
  // enviar, al limpiar tras un error, al aplicar una orden), no había forma de
  // volver a lo escrito. Esta pila es la que devuelve el texto.
  const pilaDeshacer = useRef<string[]>([]);
  const ultimoValor = useRef<string>("");
  const registrarParaDeshacer = (nuevo: string) => {
    if (nuevo === ultimoValor.current) return;
    pilaDeshacer.current.push(ultimoValor.current);
    if (pilaDeshacer.current.length > 100) pilaDeshacer.current.shift();
    ultimoValor.current = nuevo;
  };
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // v8.0.3 — Vista previa en grande de un adjunto. Se abre al pulsar la
  // miniatura del chip: es lo que permite confirmar «sí, ESTA es la que quería»
  // cuando hay veinte parecidas. `null` = cerrada.
  const [vistaPrevia, setVistaPrevia] = useState<{ src: string; nombre: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // v1.52.0 — COMPOSITOR QUE SUBE AL ESCRIBIR (pedido del 4/11: «el renglón
  // central donde escribo sube más arriba, siempre termino escribiendo debajo
  // de la barra del chat»). El compositor estaba clavado al fondo con
  const importInputRef = useRef<HTMLInputElement>(null);

  // v1.60.13 — BUGFIX: «la barra del chat dejó de crecer hasta los 5 renglones».
  // El alto se fijaba a mano en `onChange` (`ta.style.height = min(scrollHeight,130)`),
  // pero el <textarea> llevaba `style={{ height: "auto" }}` en el prop de React:
  // en CADA re-render (y `setInputText` provoca uno) React reimponía `height:auto`
  // DESPUÉS del ajuste imperativo, así que el textarea volvía a 1 renglón y nunca
  // llegaba a los 5. Además, cuando el valor cambia por código (Ctrl+Z, limpiar,
  // aplicar orden) `onChange` ni se dispara. La cura: QUITAR `height` del prop de
  // estilo (abajo queda solo `maxHeight`) y recalcular el alto en un
  // useLayoutEffect atado a `inputText` — la única autoridad del alto, se ejecuta
  // tras cada render (del teclado o programático) y antes de pintar (sin parpadeo).
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    // 5 renglones ≈ 130 px (text-sm con leading-relaxed): crece hasta ahí y luego
    // scrollea dentro del propio textarea (overflow-y-auto).
    ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
  }, [inputText]);

  // ===== Carpeta de chats guardados (drawer lateral) =====
  const [chatsOpen, setChatsOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null); // "__active__" = chat actual
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // ===== v1.0.14 · EDITAR UN MENSAJE EN COLA =====
  // Estado local de edición por fila: `editingQueueId` dice qué mensaje encolado
  // está en modo edición y `queuedEditBuffer` porta el texto en borrador. Se
  // guarda AQUÍ (UI) y sólo se vuelca al motor con `onEditQueuedMessage(id, text)`
  // al confirmar, para no reescribir la cola en cada tecla.
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [queuedEditBuffer, setQueuedEditBuffer] = useState("");
  const queuedEditRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingQueueId) queuedEditRef.current?.focus();
  }, [editingQueueId]);

  // ===== v1.0.14 · CRONÓMETRO DEL TURNO (pedido de Mario, 09/11) =====
  // «coloca en el chat un cronómetro para ver bien el tiempo de trabajo del modelo».
  // Mide el tiempo REAL de trabajo: arranca cuando empieza el streaming y avanza
  // cada segundo; al terminar, CONGELA el último valor (`ultimoTurnoSeg`) para que
  // el tiempo del turno quede a la vista y no desaparezca al cerrar.
  const [cronoSeg, setCronoSeg] = useState(0);
  const [ultimoTurnoSeg, setUltimoTurnoSeg] = useState<number | null>(null);
  const cronoInicioRef = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming) {
      if (cronoInicioRef.current === null) cronoInicioRef.current = Date.now();
      setCronoSeg(0);
      const id = setInterval(() => {
        if (cronoInicioRef.current !== null) {
          setCronoSeg(Math.floor((Date.now() - cronoInicioRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(id);
    }
    // El turno terminó: se congela el tiempo total medido.
    if (cronoInicioRef.current !== null) {
      setUltimoTurnoSeg(Math.floor((Date.now() - cronoInicioRef.current) / 1000));
      cronoInicioRef.current = null;
    }
    setCronoSeg(0);
  }, [isStreaming]);

  /** Formatea segundos como «12s» o «3m 05s» o «1h 02m». */
  const formatearTiempo = (seg: number): string => {
    if (!Number.isFinite(seg) || seg < 0) return "0s";
    if (seg < 60) return `${seg}s`;
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  };

  const startQueueEdit = (id: string, texto: string) => {
    setEditingQueueId(id);
    setQueuedEditBuffer(texto);
  };

  const commitQueueEdit = () => {
    if (!editingQueueId) return;
    if (onEditQueuedMessage) onEditQueuedMessage(editingQueueId, queuedEditBuffer);
    setEditingQueueId(null);
    setQueuedEditBuffer("");
  };

  const cancelQueueEdit = () => {
    setEditingQueueId(null);
    setQueuedEditBuffer("");
  };

  useEffect(() => {
    if (editingChatId) editInputRef.current?.focus();
  }, [editingChatId]);

  const startEdit = (id: string, currentTitle: string) => {
    setEditingChatId(id);
    setEditTitle(currentTitle);
  };

  const commitEdit = () => {
    if (editingChatId === "__active__") {
      onRenameActiveChat?.(editTitle);
    } else if (editingChatId) {
      onRenameChat?.(editingChatId, editTitle);
    }
    setEditingChatId(null);
    setEditTitle("");
  };

  const cancelEdit = () => {
    setEditingChatId(null);
    setEditTitle("");
  };

  // ===== Audio por mensaje (TTS: Gemini con varias voces → fallback navegador) =====
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const speakingIdRef = useRef<string | null>(null);
  // v1.52.6 — pid en vuelo de TTS Gemini (para que «Escuchar» pueda cancelar
  // incluso mientras se espera la respuesta del servidor, antes de que suene).
  const ttsPidRef = useRef<string | null>(null);
  // v1.57.21 — TROCEADO + KEEP-ALIVE de la voz del navegador (ver `hablarConNavegador`).
  // `vozLoteSeqRef` invalida los lotes viejos: si el usuario corta y vuelve a
  // pedir voz, los `onerror('interrupted')` del lote anterior llegan DESPUÉS de
  // arrancar el nuevo y, sin número de lote, apagarían el keep-alive ajeno.
  const vozLoteSeqRef = useRef(0);
  const vozKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  speakingIdRef.current = speakingId;

  // 🎙️ TTS v1.15.0 — Voz, tono y velocidad ya no viven solo aquí: el botón de la
  // barra superior (TtsSelector) los escribe en la configuración compartida
  // (utils/ttsConfig.ts) y este componente los lee al hablar. El listado curado
  // de voces Gemini está en VOCES_GEMINI (mismo módulo); aquí solo se usa el id.
  const [ttsVoice, setTtsVoice] = useState<string>(() => cargarConfigTts().voz);
  const [ttsRate, setTtsRate] = useState<number>(() => cargarConfigTts().rate);
  const [ttsPitch, setTtsPitch] = useState<number>(() => cargarConfigTts().pitch);

  // Sincronizar con el selector de la barra superior: cuando el usuario cambia
  // voz/tono/velocidad desde arriba, este componente se entera por el evento.
  useEffect(() => {
    const aplicar = () => {
      const c = cargarConfigTts();
      setTtsVoice(c.voz);
      setTtsRate(c.rate);
      setTtsPitch(c.pitch);
    };
    window.addEventListener(EVENTO_CONFIG_TTS, aplicar);
    return () => window.removeEventListener(EVENTO_CONFIG_TTS, aplicar);
  }, []);

  // ============================================================
  // v1.6.15 — «lo de Gemini en la barra del chat, si no anda quítalo:
  //            ocupa lugar y no es funcional».
  //
  // Tenía razón a medias, y la mitad importante era la de fondo: las ocho
  // voces Gemini NO son ocho opciones. Sin clave no funciona NINGUNA, y todas
  // caían en silencio a la voz del navegador. Eran ocho etiquetas que hacían
  // exactamente lo mismo que «Navegador (local)» — 170 px de barra para elegir
  // entre ocho botones que no hacen nada.
  //
  // No se borran: se CONDICIONAN a que existan de verdad. Con clave aparecen;
  // sin clave no hay nada que elegir, así que el selector desaparece y la barra
  // recupera el espacio.
  // ============================================================
  const [hayClaveGeminiTts, setHayClaveGeminiTts] = useState<boolean>(() => leerClaveGeminiTts());
  useEffect(() => {
    // La clave puede vivir en localStorage o en el servidor (GEMINI_API_KEY):
    // releer al volver el foco y al avisar el bus del servidor.
    const revisar = () => setHayClaveGeminiTts(leerClaveGeminiTts());
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

  // Si la voz guardada era de Gemini y ya no hay clave, volver al navegador:
  // dejar seleccionada una voz que no puede sonar es justo el estado roto.
  // (v1.15.0) Solo se resetea una voz GEMINI: las voces del sistema no dependen
  // de ninguna clave y deben quedarse tal cual las eligió el usuario.
  useEffect(() => {
    if (!hayClaveGeminiTts && esVozGemini(ttsVoice)) {
      setTtsVoice("navegador");
      // TTS v1.15.0 — se escribe por la vía compartida para que el botón de
      // arriba también vuelva a «Navegador» sin recargar.
      guardarConfigTts({ voz: "navegador" });
    }
  }, [hayClaveGeminiTts, ttsVoice]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * v8.0.4 — CACHÉ DE VOCES DEL SISTEMA.
   *
   * `getVoices()` devuelve **lista vacía la primera vez** que se llama: las voces
   * se cargan de forma asíncrona y el navegador avisa por `voiceschanged` cuando
   * ya están. El código anterior leía la lista una sola vez y no escuchaba ese
   * evento, así que la elección de voz veía `[]` y acababa sonando la voz por
   * defecto del sistema (en Linux, eSpeak: la robótica de siempre).
   *
   * Este ref es la mitad del arreglo del audio; la otra mitad es `elegirMejorVoz`.
   */
  const vocesCacheRef = useRef<SpeechSynthesisVoice[]>([]);

  /** Aviso visible sobre la voz. Solo se rellena cuando hay algo que decir. */
  const [ttsAviso, setTtsAviso] = useState<string | null>(null);
  // v1.13.0 — Tras un fallo de cuota o de clave, se deja de pedir voz a Gemini un
  // rato: insistir no arregla la cuota y repetía el aviso en cada mensaje.
  const vozEnEsperaHastaRef = useRef<number>(0);
  const vozMotivoEsperaRef = useRef<string>("");

  // Cargar las voces y RE-cargarlas cuando el navegador avise de que ya están.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.getVoices !== "function") return;
    const cargar = () => {
      try {
        const v = synth.getVoices();
        if (v && v.length) vocesCacheRef.current = v;
      } catch {}
    };
    cargar();
    try {
      synth.addEventListener("voiceschanged", cargar);
    } catch {}
    return () => {
      try {
        synth.removeEventListener("voiceschanged", cargar);
      } catch {}
    };
  }, []);

  // (v1.15.0) El selector de voz se mudó a la barra superior (TtsSelector), así
  // que ya no hay un <select> local. La elección llega por la configuración
  // compartida y el evento EVENTO_CONFIG_TTS; no hace falta `elegirVozTts`.

  // Limpia markdown para que la voz lea solo texto natural.
  //
  // v1.6.11 — 🐞 «me dice bloque de código omitido y se corta el audio».
  // La primera línea reemplazaba la valla ENTERA —contenido incluido— por la
  // frase «(bloque de código omitido)». Cuando el mensaje del modelo es un
  // documento dentro de una valla (``` text file="…"), lo único que quedaba para
  // leer era esa frase: el audio se cortaba porque no había nada más.
  // Ahora un bloque de documento se lee entero, y el código de verdad se calla
  // SIN anunciarlo: oír una disculpa no es oír la respuesta.
  const cleanTextForSpeech = (raw: string): string => {
    return quitarVallasConservandoTexto(raw, { codigo: "callar" })
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/\|/g, " ")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const stopSpeech = () => {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } catch {}
    anunciarVozActiva(false); // v1.57.9 — el fondo recupera su volumen al cortar
    setSpeakingId(null);
    ttsPidRef.current = null; // v1.52.6
    vozLoteSeqRef.current++; // v1.57.21 — los handlers del lote cortado ya no mandan
    pararKeepAliveVoz();
  };

  // ============================================================
  // v1.57.21 — KEEP-ALIVE DE LA VOZ (crbug 12355103)
  // ------------------------------------------------------------
  // Chrome apaga `speechSynthesis` a mitad de un enunciado largo: deja de
  // sonar y NO dispara `onend`. El remedio conocido es respirar: cada pocos
  // segundos, `pause()` + `resume()` sobre el sintetizador mantienen viva la
  // cola. Con el troceo de 180 caracteres el bug ya casi no alcanza a entrar
  // (cada trozo dura ~13 s a velocidad 1), pero a velocidad 0.5 un trozo son
  // ~26 s — por eso el respirador sigue puesto, barato y sin efectos visibles.
  // ============================================================
  const pararKeepAliveVoz = () => {
    if (vozKeepAliveRef.current !== null) {
      clearInterval(vozKeepAliveRef.current);
      vozKeepAliveRef.current = null;
    }
  };
  const arrancarKeepAliveVoz = () => {
    pararKeepAliveVoz();
    vozKeepAliveRef.current = setInterval(() => {
      const s = window.speechSynthesis;
      if (!s) return;
      if (!s.speaking) {
        pararKeepAliveVoz();
        return;
      }
      if (!s.paused) {
        try {
          s.pause();
          s.resume();
        } catch {}
      }
    }, 8000);
  };

  const hablarConNavegador = (msg: ChatMessage, text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) return;

    // ============================================================
    // v1.57.21 — «EL REPRODUCTOR SE CORTA A LA MITAD»: SE LEE POR TROZOS
    // ------------------------------------------------------------
    // El texto llegaba ENTERO a un único `speak()`. En Chrome, un enunciado
    // largo se queda mudo a los ~15 segundos sin avisar (crbug 12355103) y el
    // usuario veía el botón «hablando» con silencio encima — «el reproductor de
    // voz no funciona bien». Ahora `trocearParaVoz` parte el texto en bocados
    // de a lo sumo 180 caracteres (frase por frase, sin perder ni un espacio:
    // lo prueba tests/ttsErrores.test.ts) y la cola del navegador los encadena
    // sin hueco audible. El keep-alive de arriba cubre el caso rate 0.5.
    // ============================================================
    const trozos = trocearParaVoz(text, 180);
    if (trozos.length === 0) return;
    try {
      synth.cancel(); // nada de colas del intento anterior
    } catch {}
    const lote = ++vozLoteSeqRef.current;

    // ============================================================
    // v8.0.4 — 🐞 «SALE SIEMPRE LA VOZ ROBÓTICA STANDARD»
    // ------------------------------------------------------------
    // Aquí había `synth.getVoices()` seguido de `.find(v => v.lang.startsWith("es"))`.
    // Eso produce el síntoma EXACTAMENTE, por dos motivos que se suman:
    //
    //  · `getVoices()` devuelve lista VACÍA la primera vez (las voces se cargan de
    //    forma asíncrona). Sin escuchar `voiceschanged` —y no lo escuchaba— la
    //    búsqueda no encontraba nada, NO se asignaba `utter.voice`, y sonaba la voz
    //    por defecto del sistema. En Linux esa por defecto es eSpeak: el
    //    sintetizador robótico de siempre. No fallaba a veces: fallaba siempre.
    //  · Aunque hubiera voces, el PRIMERO de la lista no es el mejor: el orden de
    //    `getVoices()` no está normalizado por nadie.
    //
    // Ahora las voces se cachean desde el arranque (ver el useEffect de la caché)
    // y la elección la hace `elegirMejorVoz`, que puntúa TODAS y prioriza idioma >
    // no-robótica > natural. Si la ganadora es robótica, se avisa: mejor decirlo
    // que fingir que suena bien.
    // ============================================================
    let idiomaUi = "es";
    try {
      idiomaUi = localStorage.getItem(LS_KEYS.RESPONSE_LANGUAGE) || "es";
    } catch {}
    const preferido = idiomaDeVozPreferido(idiomaUi);

    const lista = vocesCacheRef.current.length > 0 ? vocesCacheRef.current : synth.getVoices() || [];

    // v1.52.1 — EL TONO SOLO LO RESPETAN LAS VOCES LOCALES. `quiereTono` decide
    // si la búsqueda automática se restringe a voces del sistema (para que el
    // cambio de tono SE OIGA) o no.
    const quiereTono = Math.abs(ttsPitch - 1) > 0.01;

    // La voz se resuelve UNA sola vez y se aplica a todos los trozos (antes
    // vivía asignada al `utter` único; con el loteo, resolverla por trozo
    // multiplicaría los avisos).
    let vozElegida: SpeechSynthesisVoice | null = null;
    let langElegido = preferido;

    // TTS v1.15.0 — «cambio de voz»: si el usuario eligió UNA voz concreta del
    // sistema (no la automática ni una Gemini), se respeta esa. La puntuación de
    // `elegirMejorVoz` sigue mandando solo en el modo «Navegador (automática)».
    const vozManual = ttsVoice && ttsVoice !== "navegador" && !esVozGemini(ttsVoice) ? ttsVoice : null;

    if (vozManual) {
      const manual = lista.find((v) => v.name === vozManual);
      if (manual) {
        vozElegida = manual;
        langElegido = manual.lang || preferido;
        // v1.70.2 — 🧹 EL CARTEL SALIÓ DEL CHAT (pedido de Mario, 24/10). El
        // dato era cierto —las voces de nube fijan su propio tono y el
        // navegador ignora `pitch`— pero NO es una avería del usuario ni del
        // motor: es una propiedad de la voz. Un cartel cada vez que alguien
        // mueve el slider era ruido. El selector de voz ahora lo dice una vez,
        // en la propia lista, etiquetando cada voz como (local)/(nube); acá
        // queda solo el rastro para depurar en consola.
        if (quiereTono && manual.localService === false) {
          console.info(`[voz] «${manual.name}» es natural (de nube): el navegador ignora el control de tono con esta voz.`);
        }
      } else {
        // v1.57.21 — la voz elegida no estaba en la lista (idioma recién
        // cambiado, sistema sin ese paquete de voces…). Caer a la automática
        // SIN DECIRLO era medio diagnóstico.
        setTtsAviso(
          `La voz elegida «${ttsVoice}» no apareció en la lista del navegador; se usa la automática. Reabre el selector de voz para confirmar las disponibles.`
        );
      }
    } else {
      const elegida = quiereTono
        ? (elegirMejorVozLocal(lista, preferido) ?? elegirMejorVoz(lista, preferido))
        : elegirMejorVoz(lista, preferido);
      if (elegida) {
        vozElegida = elegida.voz;
        langElegido = elegida.voz.lang || preferido;
        // Solo se avisa cuando HAY algo que avisar. Si la voz es buena, ni palabra.
        if (elegida.robotica) setTtsAviso(elegida.motivo);
        else if (quiereTono && elegida.voz.localService === false) {
          // v1.70.2 — mismo criterio que la rama manual: la propiedad "voz de
          // nube ignora pitch" se muestra en el selector (etiquetas
          // local/nube), no como cartel cada vez que se habla.
          console.info(`[voz] «${elegida.voz.name}» es natural (de nube): el navegador ignora el control de tono con esta voz.`);
        }
      } else {
        // Sin ninguna voz publicada todavía: se declara el idioma y se deja decidir
        // al sistema. Se avisa, porque ESTO es lo que produce la voz robótica y el
        // usuario tiene derecho a saber por qué suena así.
        setTtsAviso(
          `Este navegador todavía no ha publicado ninguna voz de ${preferido} (las voces se cargan de forma asíncrona). Se usa la voz por defecto del sistema, que suele ser robótica. Vuelve a pulsar «Escuchar» en unos segundos, o elige una voz Gemini.`
        );
      }
    }

    // v1.57.21 — la limpieza del lote ocurre cuando el ÚLTIMO trozo terminó
    // (o falló). Contar `onend` y `onerror` por igual es a propósito: un trozo
    // que muere no debe dejar el botón «hablando» para siempre. La guarda por
    // número de lote ignora los eventos tardíos de un lote ya cortado.
    let resueltos = 0;
    const terminarLote = () => {
      if (vozLoteSeqRef.current !== lote) return;
      resueltos++;
      if (resueltos < trozos.length) return;
      if (speakingIdRef.current === msg.id) setSpeakingId(null);
      if (ttsPidRef.current === msg.id) ttsPidRef.current = null; // v1.52.6
      anunciarVozActiva(false); // v1.57.9 — el fondo vuelve a su volumen
      pararKeepAliveVoz();
    };

    for (const trozo of trozos) {
      const utter = new SpeechSynthesisUtterance(trozo);
      if (vozElegida) utter.voice = vozElegida;
      utter.lang = langElegido;
      // TTS v1.15.0 — velocidad y tono elegidos desde el botón de la barra superior.
      utter.rate = ttsRate;
      utter.pitch = ttsPitch;
      // v1.56.8 — se fija EXPLÍCITAMENTE en 1 para que quede dicho: aquí no hay
      // margen. `SpeechSynthesisUtterance.volume` admite 0..1 y 1 ya es el máximo,
      // así que el «doble de volumen» no puede salir de esta ruta — sale del
      // refuerzo sobre la onda en `speakConGemini`. La voz del navegador suena lo más
      // fuerte que el motor de síntesis permite.
      utter.volume = 1;
      utter.onend = terminarLote;
      utter.onerror = terminarLote;
      synth.speak(utter);
    }
    setSpeakingId(msg.id);
    ttsPidRef.current = msg.id; // v1.52.6 — marcar pid para toggle
    anunciarVozActiva(true); // v1.57.9 — ducking: el ambiente baja mientras habla
    arrancarKeepAliveVoz();
  };

  const speakConGemini = async (msg: ChatMessage, text: string, voice: string): Promise<boolean> => {
    // v1.52.6 — Marcar pid en vuelo ANTES del fetch, para que handleSpeak pueda
    // cancelar aunque el audio aún no suene.
    ttsPidRef.current = msg.id;
    try {
      // v1.6.11 — 🐞 «¿dónde va la api key? ¿no es la misma de los modelos?»
      //
      // No lo era, y era el motivo de fondo del 503. Los modelos usan la clave
      // que configuras EN LA APP (viaja en cada petición); el motor de voz solo
      // miraba `GEMINI_API_KEY` del ENTORNO DEL SERVIDOR. Con la clave puesta en
      // la app, la voz seguía diciendo «Falta GEMINI_API_KEY» — y desde fuera
      // parecía que el audio estaba roto. Ahora se manda la misma clave.
      const claveGeminiApp = loadString(LS_KEYS.GEMINI_API_KEY).trim();
      const res = await fetch("/api/tts/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(claveGeminiApp ? { "x-gemini-key": claveGeminiApp } : {}),
        },
        body: JSON.stringify({ text, voice }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.audioBase64) {
        // ============================================================
        // v8.0.4 — AQUÍ SE PERDÍA LA EXPLICACIÓN.
        // ------------------------------------------------------------
        // Antes esto era `return false` y nada más. El efecto: el usuario elegía
        // «Gemini · Aoede», el servidor contestaba 503 «Falta GEMINI_API_KEY», y
        // la interfaz caía al navegador SIN DECIR NADA — sonaba la voz robótica y
        // desde fuera parecía que el botón de audio estaba roto. La causa real
        // (la clave vive en el entorno del SERVIDOR, no en el navegador) era
        // invisible.
        //
        // Ahora se recoge el `motivo` que el servidor ya devolvía y se enseña.
        // ============================================================
        // v1.13.0 — EL BANNER DICE LA CAUSA; EL JSON VA AL REGISTRO.
        // Antes se pintaba el `motivo` tal cual, y con la cuota agotada el motivo
        // era el JSON entero de Google: un cartel de mil caracteres que se comía la
        // conversación. Ahora son dos cosas separadas: una frase para el usuario y el
        // volcado técnico a la consola, que es donde se depura.
        const motivo = String(data?.motivo || data?.error || `HTTP ${res.status}`);
        const clase = String(data?.clase || "");
        if (data?.detalle) console.warn(`[Voz] detalle técnico de Gemini: ${data.detalle}`);
        setTtsAviso(avisoDeVozNoDisponible(voice, motivo));
        // Cuota agotada o clave inválida no se arreglan insistiendo cada mensaje.
        if (clase === "cuota" || clase === "clave") {
          vozEnEsperaHastaRef.current = Date.now() + VOZ_EN_ESPERA_MS;
          vozMotivoEsperaRef.current = motivo;
        }
        ttsPidRef.current = null;
        return false;
      }
      // v1.56.8 — «SUBE LA VOZ AL DOBLE». `audio.volume` ya vale 1, y 1 es el
      // máximo del navegador: subirlo no existe. El doble se gana SOBRE LA ONDA,
      // con recorte suave para no saturar. Si el audio no es WAV PCM-16 se reproduce
      // igual que antes y se avisa en consola: honesto, no un fichero reventado.
      const reforzado = reforzarWavBase64(String(data.audioBase64 || ""), REFUERZO_VOZ);
      if (!reforzado.aplicado) {
        console.warn(`[voz] refuerzo ×${REFUERZO_VOZ} no aplicado: ${reforzado.motivo}`);
      }
      const audio = new Audio(
        `data:${reforzado.aplicado ? "audio/wav" : data.mime || "audio/wav"};base64,${reforzado.base64}`
      );
      // TTS v1.15.0 — la velocidad también aplica a Gemini: `playbackRate` acelera
      // sin cambiar el tono (`preservesPitch`). El tono no se toca aquí: en Gemini
      // lo fija cada voz; solo la voz del navegador acepta `pitch`.
      try {
        audio.playbackRate = ttsRate;
        audio.preservesPitch = true;
      } catch {
        /* noop */
      }
      audioRef.current = audio;
      // v1.52.6 — BUGFIX: el pid se mantiene HASTA que el audio termina o falla,
      // no se limpia al terminar play(). Antes se hacía ttsPidRef=null justo
      // después de play(), así que si el usuario tocaba «Escuchar» en ese
      // instante, el toggle NO detectaba el mensaje en vuelo y arrancaba OTRO
      // audio en vez de detener. Ahora ttsPidRef solo se limpia en onended/onerror.
      audio.onended = () => {
        if (speakingIdRef.current === msg.id) setSpeakingId(null);
        if (ttsPidRef.current === msg.id) ttsPidRef.current = null; // v1.52.6
        anunciarVozActiva(false); // v1.57.9
      };
      audio.onerror = () => {
        if (speakingIdRef.current === msg.id) setSpeakingId(null);
        if (ttsPidRef.current === msg.id) ttsPidRef.current = null; // v1.52.6
        anunciarVozActiva(false); // v1.57.9
      };
      setSpeakingId(msg.id);
      anunciarVozActiva(true); // v1.57.9 — ducking también en la ruta Gemini
      await audio.play();
      return true;
    } catch (e: any) {
      // Fallo de red o respuesta no-JSON: también se explica.
      console.warn("[Voz] fallo al pedir la voz:", e?.message || e);
      setTtsAviso(avisoDeVozNoDisponible("Gemini", "no se pudo pedir la voz al motor"));
      anunciarVozActiva(false); // v1.57.9 — si falló tras anunciar, el fondo NO se queda agachado
      ttsPidRef.current = null;
      return false;
    }
  };

  // v1.84.2 · DOS BOCAS POR MENSAJE (Mario 27/10): «Escuchar» dice el crudo
  // entero —como siempre— y «Solo final» dice únicamente la resolución
  // (resumenFinalDelMensaje: el veredicto en la respuesta ecléctica, la última
  // prosa en un informe con código). El estado «hablando» vive en la CLAVE
  // (`id` o `id~resumen`): cada botón se cancela a sí mismo y, si el hermano
  // estaba sonando, le corta el audio antes de empezar — un solo altavoz en la
  // sala, la misma regla de siempre. Los altavoces reales (`speakConGemini`,
  // `hablarConNavegador`) no se tocan: reciben un `msg` con el id cambiada,
  // del resto solo les interesa el `text` que ya se les pasa calculado.
  const handleSpeak = async (msg: ChatMessage, modo: "todo" | "resumen" | "pensamiento" = "todo") => {
    const clave = modo === "resumen" ? `${msg.id}~resumen` : modo === "pensamiento" ? `${msg.id}~pensamiento` : msg.id;
    // v1.57.21 — «no funciona» era a veces «está apagado el interruptor»: un
    // botón que no habla y no dice nada es indistinguible de un botón roto.
    if (isSoundMuted) {
      setTtsAviso(
        "El interruptor general de sonido está en silencio: «Escuchar» no habla mientras esté apagado. Vuelva a encenderlo en la barra superior."
      );
      return;
    }
    // v1.52.6 — BUGFIX: «tocar Escuchar mientras habla arranca otra vez en vez
    // de detener». Raíz: si se pulsa durante la llamada fetch a Gemini TTS,
    // `speakingIdRef` aún no tiene el id (se setea DESPUÉS de play()), así que
    // la comprobación no lo detecta como «hablando» y arranca otra petición.
    // Solución: si hay CUALQUIER cosa sonando (Gemini o navegador), se detiene.
    // Si es ESTE mensaje, solo se para; si es otro, se para el anterior y se
    // arranca este (comportamiento intuido). Se añade un flag `ttsPidRef` que
    // marca que hay una petición Gemini TTS en vuelo — aunque no suene todavía,
    // el usuario ya pulsó y espera poder cancelar.
    if (speakingIdRef.current || ttsPidRef.current) {
      // Ya hay audio activo (o petición en vuelo). Si es ESTE mensaje, solo
      // paramos; si es otro, paramos el anterior y continuamos con este.
      // v1.84.2 — «este» es la CLAVE: el veredicto hablando y el crudo hablando
      // del mismo mensaje son dos bocas distintas, cada botón cancela la suya.
      if (speakingIdRef.current === clave || ttsPidRef.current === clave) {
        stopSpeech();
        ttsPidRef.current = null;
        return;
      }
      stopSpeech();
      ttsPidRef.current = null;
    }
    const enEsperaVoz = Date.now() < vozEnEsperaHastaRef.current;
    // Cada intento empieza limpio: el aviso del intento anterior ya no aplica.
    // Salvo si Gemini está en espera: ahí se mantiene, para no repetir el mismo
    // aviso en CADA mensaje (que era la otra mitad del problema: el cartel volvía).
    if (!enEsperaVoz) setTtsAviso(null);
    // v1.84.2 — la fuente de la voz: el crudo entero, o SOLO la resolución.
    // v1.92.0 (Mario, 30/10) — en los MODELOS SIMPLES la resolución no venía marcada
    // (no hay vallas ni fichas), así que «Solo final» no aparecía y no había forma de
    // escuchar el pensamiento aparte. `dividirVozSimple` aporta el par cuando el
    // mensaje es largo de verdad; si no, se cae al crudo, que es lo honesto.
    const simple = dividirVozSimple(msg.content);
    const fuente =
      modo === "resumen"
        ? resumenFinalDelMensaje(msg.content) ?? simple?.resumen ?? msg.content
        : modo === "pensamiento"
        ? simple?.pensamiento ?? msg.content
        : msg.content;
    const text = cleanTextForSpeech(fuente).slice(0, 4500);
    if (!text) return;
    // 1) Gemini TTS con la voz elegida. IMPORTANTE (v1.15.0): ahora `ttsVoice`
    // también puede ser el NOMBRE de una voz del sistema (elegida desde el botón
    // de arriba), y eso NO debe ir a Gemini. Solo las voces Gemini van a Gemini.
    const esGemini = esVozGemini(ttsVoice);
    if (esGemini && !enEsperaVoz) {
      const ok = await speakConGemini({ ...msg, id: clave }, text, ttsVoice);
      if (ok) return;
    }
    if (enEsperaVoz && esGemini) {
      setTtsAviso(
        (prev) =>
          prev ??
          `Voz Gemini en espera: ${acortarMotivo(vozMotivoEsperaRef.current)}. Se usa la voz del navegador; se reintentará en unos minutos.`
      );
    }
    // 2) Fallback: voz del navegador (speechSynthesis)
    hablarConNavegador({ ...msg, id: clave }, text);
  };

  // Detener la voz al desmontar o al cambiar de conversación
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      // v1.57.21 — el respirador del lote también se apaga: un setInterval huérfano
      // sobre un sintetizador ya cancelado sería un fantasma con reloj.
      if (vozKeepAliveRef.current !== null) {
        clearInterval(vozKeepAliveRef.current);
        vozKeepAliveRef.current = null;
      }
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      } catch {}
    };
  }, []);

  // v1.67.1 · EL DESCENSO DEL CHAT (queja: «no está descendiendo bien acorde al
  // texto»). Con `behavior: "smooth"` cada token re-arrancaba una animación
  // suavizada hacia un blanco que ya se había movido: la carrera nunca terminaba y
  // la vista quedaba DETRÁS del texto, con ese vaivén de no llegar nunca. La
  // terminal de esta misma casa ya usa `"auto"` por ser el chorro rápido
  // (RightSidebar.tsx:375); el chat se había quedado con la versión animada.
  //
  // El `"auto"` a secas tendría un efecto peor: un salto duro al final en CADA
  // carácter, que le arrancaría de las manos el scroll a quien subió a releer. Por
  // eso el guard: se sigue el texto mientras el usuario esté pegado abajo, y en
  // cuanto sube a leer se lo deja tranquilo hasta el próximo mensaje suyo.
  const chatScrollerRef = useRef<HTMLDivElement>(null);
  const pegadoAbajoRef = useRef(true);
  const numMensajesRef = useRef(0);
  // v1.61.0 — El bloque de la ÚLTIMA respuesta. Su alto es lo que se centra en
  // la ventana: el seguidor ya no persigue el fondo del hilo, persigue el punto
  // en el que el texto que acaba de llegar queda a media pantalla.
  const ultimaRespuestaRef = useRef<HTMLDivElement>(null);

  /**
   * v2.3.17 · SOLO LA INTENCIÓN DEL USUARIO CORTA EL SEGUIMIENTO.
   *
   * El guard viejo medía geometría en cada `onScroll`: `distancia al fondo < 120`.
   * El problema es que el `onScroll` **también dispara el scroll que hacemos
   * nosotros**, y el seguidor —por diseño, desde v2.3.2— persigue a 780 px/s, así
   * que con el chorro rápido se queda legítimamente más de 120 px detrás del fondo.
   * En ese momento su propio movimiento declaraba «el usuario se fue a leer arriba»,
   * `paso()` salía por la puerta de atrás y la vista se **congelaba mientras el
   * texto seguía creciendo abajo**. Literalmente la queja del 6/11.
   *
   * Ahora: acercarse al fondo re-engancha (eso solo lo hace una persona), y
   * desengancharse exige un gesto de persona — rueda, dedo, o teclado hacia arriba.
   */
  const intencionDeSubirRef = useRef(false);
  const medirPegadoAlFondo = () => {
    const el = chatScrollerRef.current;
    if (!el) return;
    const distancia = el.scrollHeight - el.scrollTop - el.clientHeight;
    // 120 px de tolerancia: una fila de código o el cursor parpadeando no tienen por
    // qué cortar el seguimiento (~4 renglones a fuente chica).
    if (distancia < UMBRAL_PEGADO_PX) {
      pegadoAbajoRef.current = true;
      intencionDeSubirRef.current = false;
      return;
    }
    if (intencionDeSubirRef.current) pegadoAbajoRef.current = false;
  };
  /** Rueda / dedo / teclado hacia arriba: el usuario quiere leer, se lo deja. */
  const marcarIntencionDeSubir = () => {
    intencionDeSubirRef.current = true;
    medirPegadoAlFondo();
  };

  /**
   * v2.3.2 · EL CONDUCTOR DE LA VISTA (la regla vive en `seguidorHilo.ts`).
   *
   * El effect viejo hacía `scrollIntoView` en cada cambio, y con el chorro activo el
   * `behavior` era `auto`: o sea **un teletransporte al píxel final por cada gota**,
   * y `smooth` reservado para cuando NO llegaba texto — exactamente al revés de lo
   * que hace falta. De ahí el «la pantalla se mueve más lenta que el texto… pero a
   * sacudones»: la barra iba por delante de lo que se puede leer.
   *
   * Ahora la vista persigue el fondo a velocidad finita (780 px/s, techo de 52 px
   * por cuadro para que un cuadro largo de la pestaña en segundo plano no cobre la
   * ventana entera de un salto). El mensaje NUEVO del usuario sí salta: cuando él
   * habla quiere ver lo suyo ya; lo que se persigue despacio es la respuesta.
   */
  const cuadroSeguidorRef = useRef<number | null>(null);
  const relojSeguidorRef = useRef(0);
  // v2.3.17 · SIN ESCALÓN. v2.3.12 guardaba acá la referencia congelada del
  // objetivo; se va con el congelamiento. Lo que queda es el par de relojes del
  // perseguidor (velocidad finita), que es lo que da la fluidez.
  // v2.3.9 - EL CHORRO NO ESPERA AL CUADRO. Antes, si llegaba texto mientras un
  // cuadro estaba en vuelo, conducirSeguidor retornaba y esa gota se perdia: el
  // cuadro terminaba con el scrollHeight VIEJO, se declaraba llego y soltaba el
  // rAF. Con el streaming disparando decenas de cambios por segundo, casi todos
  // caian en ese return y la vista se quedaba atras. Ahora la llamada deja una
  // marca y el cuadro, al cerrar, vuelve a mirar el fondo real antes de soltar.
  const pendienteSeguidorRef = useRef(false);
  // Un hilo de ChatCenter puede vivir en la ventana de la interfaz y en el proceso
  // empaquetado (Electron) y en la prueba sin DOM. `requestAnimationFrame` no está
  // garantizado en los tres: se pide el cuadro por la vía que exista, con el
  // reloj de 16 ms como rescate. Sin esto, `tsc` pide `globalThis` y el hilo se
  // cae en cualquier entorno raro en vez de bajar a `setTimeout`.
  const pedirCuadro = (fn: FrameRequestCallback) =>
    typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : (setTimeout(() => fn(Date.now()), 16) as unknown as number);
  const soltarCuadro = (id: number) => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else clearTimeout(id as unknown as NodeJS.Timeout);
  };

  const conducirSeguidor = (saltar: boolean) => {
    const el = chatScrollerRef.current;
    if (!el) return;
    const ahora = typeof performance !== "undefined" ? performance.now() : Date.now();
    // v1.61.0 — El objetivo es el CENTRO DE LA RESPUESTA, no el fondo del hilo.
    // Si aún no hay bloque de respuesta medible, se cae al fondo de siempre.
    const altoRespuesta = ultimaRespuestaRef.current?.getBoundingClientRect().height ?? 0;
    // v2.3.12 · EL OBJETIVO SE CONGELA HASTA EL PRÓXIMO ESCALÓN. Antes se recalculaba
    // en cada cuadro y la vista subía en un deslizamiento continuo; ahora solo cambia
    // cuando el contenido creció 5 renglones (100 px) desde la última referencia.
    const calcular = (altura: number) => objetivoLectura(altura, el.clientHeight, altoRespuesta);
    // v2.3.17 · EL OBJETIVO SE RECALCULA SIEMPRE. Es la diferencia entre «la vista
    // acompaña el texto» y «la vista espera y salta». La fluidez no la da un
    // `behavior: "smooth"` (que re-arrancaba una animación por gota y nunca
    // terminaba, ver v1.67.1) sino recalcular el blanco en cada cuadro y caminar
    // hacia él a velocidad finita.
    const objetivo = calcular(el.scrollHeight);
    if (saltar) {
      // Un mensaje NUEVO del usuario sí salta: él quiere ver lo suyo ya, y además
      // reengancha el seguimiento después de haber estado leyendo arriba.
      pegadoAbajoRef.current = true;
      intencionDeSubirRef.current = false;
      el.scrollTop = objetivo;
      relojSeguidorRef.current = 0;
      pendienteSeguidorRef.current = false;
      return;
    }
    // v2.3.9 - un solo cuadro en vuelo, pero la gota NO se pierde: se anota y el
    // cuadro, al cerrar, vuelve a mirar el fondo real antes de soltar el rAF.
    if (cuadroSeguidorRef.current !== null) { pendienteSeguidorRef.current = true; return; }
    const paso = () => {
      const nodo = chatScrollerRef.current;
      if (!nodo || !pegadoAbajoRef.current) { cuadroSeguidorRef.current = null; return; }
      const altoResp = ultimaRespuestaRef.current?.getBoundingClientRect().height ?? 0;
      // v2.3.17 · cada cuadro mide y recalcula: el texto creció, el blanco se mueve,
      // la barra camina hacia él. Sin esto la vista se queda quieta «acompañando» al
      // fondo solo cuando el contenido ya se acumuló.
      const objetivoDelCuadro = objetivoLectura(nodo.scrollHeight, nodo.clientHeight, altoResp);
      // v2.3.18 · ATRASO CRÍTICO: si el texto creció más de una pantalla desde donde
      // está la vista, caminar a velocidad finita NUNCA alcanza (el texto gana la
      // carrera y nace fuera de la pantalla). Ahí se salta al fondo, como un terminal.
      const faltaAhora = objetivoDelCuadro - nodo.scrollTop;
      if (atrasoCritico(faltaAhora, nodo.clientHeight)) {
        nodo.scrollTop = objetivoDelCuadro;
        relojSeguidorRef.current = 0;
        pendienteSeguidorRef.current = false;
        cuadroSeguidorRef.current = null;
        return;
      }
      const r = siguientePosicion({
        actual: nodo.scrollTop,
        objetivo: objetivoDelCuadro,
        ahora: typeof performance !== "undefined" ? performance.now() : Date.now(),
        anterior: relojSeguidorRef.current || undefined,
      });
      relojSeguidorRef.current = r.en;
      if (Math.abs(nodo.scrollTop - r.pos) > 0.25) nodo.scrollTop = r.pos;
      if (r.llego) {
        cuadroSeguidorRef.current = null;
        // v2.3.9 - llego al objetivo que calculo al arrancar, pero puede haber
        // llegado texto nuevo mientras tanto. Si lo hay, se vuelve a perseguir.
        if (pendienteSeguidorRef.current) {
          pendienteSeguidorRef.current = false;
          relojSeguidorRef.current = 0;
          conducirSeguidor(false);
        }
      } else {
        cuadroSeguidorRef.current = pedirCuadro(paso);
      }
    };
    cuadroSeguidorRef.current = pedirCuadro(paso);
  };

  // v1.62.0 - Indice del ultimo mensaje del asistente. Se usa para saber si hay
  // una respuesta terminada que centrar cuando el chorro ya se corto. -1 = no hay.
  const ultimoAsistenteIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return i;
    }
    return -1;
  })();

  // El cuadro pendiente se suelta al desmontar: un rAF huérfano sobre un nodo muerto
  // es exactamente el tipo de zombi que `peluza` persigue en el disco.
  useEffect(() => () => {
    if (cuadroSeguidorRef.current !== null) soltarCuadro(cuadroSeguidorRef.current);
    cuadroSeguidorRef.current = null;
  }, []);

  useEffect(() => {
    // Un mensaje NUEVO del usuario reengancha: aunque estuviera releyendo arriba,
    // cuando habla quiere ver su mensaje y la respuesta desde ahí.
    let mensajeNuevo = false;
    if (messages.length !== numMensajesRef.current) {
      numMensajesRef.current = messages.length;
      pegadoAbajoRef.current = true;
      mensajeNuevo = true;
    }
    if (!pegadoAbajoRef.current) return;
    conducirSeguidor(mensajeNuevo);
  }, [messages, currentStreamingText, messageQueue]);

  // v1.43.0 — BUGFIX FOCO DEL CHAT (lado web, complementa el fix de Electron):
  // cuando la ventana recupera el foco, el textarea del chat vuelve a ser
  // enfocable al instante. Así el usuario ya no tiene que minimizar y restaurar
  // para poder cliquear en el recuadro. También soltamos cualquier overlay de
  // arrastre que pudiera haber quedado pegado tras un drag cancelado.
  useEffect(() => {
    const alRecuperarFoco = () => {
      setIsDragOver(false);
    };
    window.addEventListener("focus", alRecuperarFoco);
    // Si un arrastre termina FUERA de la zona (soltar en el escritorio, Escape),
    // el navegador emite 'dragend'/'drop' en window pero no siempre 'dragleave'
    // en el contenedor: el overlay quedaba encendido. Lo apagamos siempre.
    const alTerminarArrastre = () => setIsDragOver(false);
    window.addEventListener("dragend", alTerminarArrastre);
    window.addEventListener("drop", alTerminarArrastre);
    return () => {
      window.removeEventListener("focus", alRecuperarFoco);
      window.removeEventListener("dragend", alTerminarArrastre);
      window.removeEventListener("drop", alTerminarArrastre);
    };
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && pendingAttachments.length === 0) return;

    onSendMessage(inputText, pendingAttachments);
    setInputText("");
    onClearPendingAttachments();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // v1.6.11 — Ctrl+Z / Cmd+Z deshace en el compositor (ver la pila arriba).
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      const anterior = pilaDeshacer.current.pop();
      if (anterior !== undefined) {
        e.preventDefault();
        ultimoValor.current = anterior;
        setInputText(anterior);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // v2.3.10 — EL TOPE TAMBIÉN VALE PARA EL ARRASTRE. El clip y el drop son dos
  // puertas al mismo sitio; poner el límite solo en una es no ponerlo: arrastrar
  // un archivo de 300 MB se saltaba el control del input. La regla vive en una
  // sola función para que las dos puertas no puedan divergir.
  const MAX_ADJUNTO_BYTES = 200 * 1024 * 1024; // 200 MB por archivo

  // ══════════════════════════════════════════════════════════════════════════
  // v2.3.11 · CLÁUSULAS DE ADJUNTO (pedido del 4/11: «haz cláusulas para esos
  // archivos y los malignos»).
  //
  // Dos listas, dos motivos distintos, y NINGUNA de las dos es cosmética:
  //
  //  · CREDENCIALES — el archivo se lee, se mete en el prompt y SALE de la
  //    máquina hacia el proveedor del modelo. No se ejecuta nada: se filtra una
  //    clave. Un `.env` adjunto por descuido es una API key regalada.
  //  · EJECUTABLES — no se ejecutan (no hay child_process en esta ruta), pero
  //    un `.exe` de 150 MB entra entero en memoria vía FileReader → base64 y
  //    congela la pestaña antes de poder cancelar. Es el patrón que el propio
  //    attachmentProcessor.ts:801 documenta como causa de reinicio de la app.
  //
  // Se RECHAZAN en la puerta (no llegan al procesador) y se dice POR QUÉ, con
  // el nombre del archivo y la razón. Descartar en silencio sería peor que no
  // tener la cláusula: el usuario creería que adjuntó algo que no adjuntó.
  // ══════════════════════════════════════════════════════════════════════════
  const EXT_CREDENCIALES = [
    ".env", ".pem", ".key", ".p12", ".pfx", ".jks", ".keystore",
    ".npmrc", ".netrc", ".pgpass", ".htpasswd",
  ];
  const NOMBRES_CREDENCIALES = [
    "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
    "credentials.json", "service-account.json", "secrets.json",
    ".env.local", ".env.production", ".env.development",
  ];
  const EXT_EJECUTABLES = [
    ".exe", ".msi", ".dll", ".sys", ".scr", ".com", ".bat", ".cmd",
    ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".hta",
    ".jar", ".apk", ".app", ".dmg", ".deb", ".rpm", ".bin", ".iso",
  ];

  /** Devuelve el motivo del rechazo, o null si el archivo pasa. */
  const motivoRechazo = (f: File): string | null => {
    const nombre = (f.name || "").toLowerCase();
    if (f.size > MAX_ADJUNTO_BYTES) {
      return `supera el tope de 200 MB (${(f.size / 1048576).toFixed(1)} MB)`;
    }
    if (NOMBRES_CREDENCIALES.includes(nombre) || EXT_CREDENCIALES.some((e) => nombre.endsWith(e))) {
      return "parece contener credenciales (claves de API, certificados o tokens) y se enviaría al proveedor del modelo";
    }
    if (EXT_EJECUTABLES.some((e) => nombre.endsWith(e)) && !esNombreParteMultivolumen(nombre)) {
      return "es un ejecutable o script: no se ejecuta, pero se cargaría entero en memoria y puede colgar la app";
    }
    return null;
  };

  const filtrarPorTamano = (archivos: FileList | File[]): File[] => {
    const pasan: File[] = [];
    const rechazados: string[] = [];
    for (let i = 0; i < archivos.length; i++) {
      const f = archivos[i];
      const motivo = motivoRechazo(f);
      if (motivo) rechazados.push(`${f.name} — ${motivo}`);
      else pasan.push(f);
    }
    if (rechazados.length > 0) {
      setTtsAviso(
        `No se adjuntaron ${rechazados.length} archivo(s): ${rechazados.join("; ")}.`
      );
    }
    return pasan;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const pasan = filtrarPorTamano(e.dataTransfer.files);
      if (pasan.length > 0) onAddAttachments(pasan);
    }
  };

  // ===== Pegar captura de pantalla (fn+PrintScreen / Ctrl+V) =====
  // Captura cualquier imagen que venga en el portapapeles y la manda por la
  // MISMA ruta que los adjuntos arrastrados o seleccionados con el clip.
  // Si no hay imágenes (solo texto), deja que el pegado normal ocurra.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          // Los portapapeles suelen entregar nombre vacío ("") o genérico.
          // Le ponemos uno útil con marca de tiempo para que se vea en el badge.
          if (!file.name || file.name === "image.png" || file.name.trim() === "") {
            const ext = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "png";
            const ts = new Date()
              .toISOString()
              .replace(/[-:]/g, "")
              .replace("T", "-")
              .slice(0, 15);
            try {
              imageFiles.push(new File([file], `captura-${ts}.${ext}`, { type: file.type }));
            } catch {
              imageFiles.push(file);
            }
          } else {
            imageFiles.push(file);
          }
        }
      }
    }

    if (imageFiles.length === 0) return; // pegado de texto normal

    e.preventDefault();
    onAddAttachments(imageFiles);
  };

  // ============================================================
  // v8.0.3 — CHIP DEL ADJUNTO CON MINIATURA REAL
  // ------------------------------------------------------------
  // Petición literal: «que se vea la miniatura de la imagen, así se puede
  // apreciar qué elemento se está cargando cuando sean muchas; ahora solo es un
  // icono». Tenía razón en las dos partes, y la segunda es la importante: con
  // veinte capturas, veinte iconos rosa idénticos no dicen NADA sobre cuál es
  // cuál. El nombre ayuda, pero un nombre como «captura-20260922-143045.png» no
  // es más informativo que el icono.
  //
  // La cadena de respaldo es explícita y de tres niveles, y cada nivel existe
  // por un motivo real:
  //   1. `thumbData`   → miniatura generada al adjuntar (≤96 px, ligera).
  //   2. `base64Data`  → la imagen completa, si por lo que sea no hay miniatura.
  //   3. icono         → si no hay ni una cosa ni la otra (o si el <img> falla).
  //
  // El icono no se elimina: se pinta DEBAJO del <img>. Si la imagen no carga,
  // `onError` la oculta y el icono queda a la vista. Así el fallo degrada a lo
  // que había antes en vez de dejar un hueco negro.
  // ============================================================
  const renderAttachmentBadge = (att: AttachmentItem, canDelete = false) => {
    const isDocx = att.isDocx || att.name.endsWith(".docx");
    const isZip = att.isZip || att.name.endsWith(".zip");
    const isImg = att.isImage || !!att.base64Data;

    const miniatura = att.thumbData || att.base64Data || null;
    const completa = att.base64Data || att.thumbData || null;

    return (
      <div
        key={att.id}
        className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 shadow-sm shrink-0"
      >
        {isImg && miniatura ? (
          <button
            type="button"
            onClick={() => completa && setVistaPrevia({ src: completa, nombre: att.name })}
            title={`Ver «${att.name}» en grande`}
            className="relative w-9 h-9 rounded-md overflow-hidden border border-zinc-700 hover:border-cyan-400 transition-colors shrink-0 bg-zinc-950 grid place-items-center group"
          >
            {/* Nivel 3 del respaldo: debajo, por si la imagen no carga. */}
            <ImageIcon className="w-3.5 h-3.5 text-pink-400 absolute" />
            <img
              src={miniatura}
              alt={att.name}
              draggable={false}
              decoding="async"
              className="relative w-full h-full object-cover"
              onError={(e) => {
                // No se cambia el estado: basta con esconder el <img> para que
                // reaparezca el icono de debajo. Menos estado, menos re-render.
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            <span className="absolute inset-0 hidden group-hover:grid place-items-center bg-black/55 text-[9px] font-mono text-cyan-300">
              ver
            </span>
          </button>
        ) : isImg ? (
          <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
        ) : isZip ? (
          <FolderArchive className="w-3.5 h-3.5 text-amber-400" />
        ) : isDocx ? (
          <FileText className="w-3.5 h-3.5 text-blue-400" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <span className="font-mono truncate max-w-[130px]" title={att.name}>
          {att.name}
        </span>
        <span className="text-[10px] text-zinc-500">
          {(att.size / 1024).toFixed(0)}KB
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={() => onRemovePendingAttachment(att.id)}
            className="ml-1 text-zinc-500 hover:text-red-400 p-0.5 rounded transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  /**
   * v8.0.3 — Chip fantasma: un archivo que TODAVÍA se está procesando.
   *
   * Esto es la mitad de la petición que no se ve: no basta con que aparezca la
   * miniatura de lo ya cargado, hay que poder ver QUÉ FALTA. Sin estos huecos, la
   * tira crecía de una en una sin decir cuántos quedaban ni cuáles eran, y con
   * treinta archivos el usuario no tenía forma de saber si el que esperaba ya
   * había entrado o no.
   */
  const renderAttachmentPendiente = (nombre: string, indice: number) => (
    <div
      key={`pend-${indice}-${nombre}`}
      className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg bg-zinc-900/40 border border-dashed border-zinc-700 text-xs text-zinc-500 shrink-0 animate-pulse"
      title={`«${nombre}» todavía se está procesando`}
    >
      <span className="w-9 h-9 rounded-md bg-zinc-800/60 grid place-items-center shrink-0">
        <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
      </span>
      <span className="font-mono truncate max-w-[130px]">{nombre}</span>
      <span className="text-[10px] text-zinc-600 italic">cargando…</span>
    </div>
  );

  return (
    <main
      data-cn="chat" className="flex-1 flex flex-col h-full bg-[#000000] relative overflow-hidden select-text"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-black/90 border-2 border-dashed border-cyan-400 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none select-none">
          <Paperclip className="w-12 h-12 text-cyan-400 animate-bounce mb-3" />
          <p className="text-base font-semibold text-cyan-300 font-mono">
            Soltar archivos para adjuntar
          </p>
          {/* v2.3.10 — el cartel decía «hasta 50 elementos» y no era cierto: no
              había ningún control de cantidad ni de tamaño. Ahora dice el tope
              que SÍ se aplica (200 MB por archivo, ver filtrarPorTamano). */}
          <p className="text-xs text-zinc-400 mt-1">
            Soporta DOCX, ZIP, imágenes, audio, JSON, TSX, PY y código fuente · hasta 200 MB por archivo
            <br />
            <span className="text-[11px] text-amber-400/80">
              No se adjuntan credenciales (.env, .pem, .key, id_rsa…) ni ejecutables (.exe, .msi, .dll…)
            </span>
          </p>
        </div>
      )}

      {/* ============================================================
          CARPETA DE CHATS GUARDADOS (drawer lateral con renombrar/borrar)
          ============================================================ */}
      {chatsOpen && (
        <>
          {/* Fondo clickeable para cerrar */}
          <div
            className="absolute inset-0 z-30 bg-black/50 backdrop-blur-[1px]"
            onClick={() => {
              setChatsOpen(false);
              cancelEdit();
            }}
          />
          <div className="absolute left-0 top-0 bottom-0 z-40 w-[290px] max-w-[85%] bg-[#060a12] border-r border-[#182338] shadow-2xl flex flex-col">
            {/* Cabecera del drawer */}
            <div className="h-11 px-3 border-b border-[#141d2e] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-cyan-300 font-mono text-[11px] font-bold tracking-wide">
                <FolderOpen className="w-4 h-4" />
                <span>CHATS GUARDADOS ({savedChats.length})</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatsOpen(false);
                  cancelEdit();
                }}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                title="Cerrar carpeta de chats"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Botón Nuevo chat */}
            <div className="p-2 border-b border-[#101828] shrink-0">
              <button
                type="button"
                onClick={() => {
                  onNewChat?.();
                  cancelEdit();
                }}
                disabled={!onNewChat}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-2 bg-cyan-600/20 hover:bg-cyan-600/35 disabled:opacity-40 text-cyan-200 border border-cyan-500/40 rounded-lg text-xs font-medium transition-all"
                title="Guarda el chat actual en la carpeta y empieza uno nuevo"
              >
                <Plus className="w-4 h-4" />
                Nuevo chat
              </button>
            </div>

            {/* Chat actual (renombrable) */}
            <div className="px-2 pt-2 shrink-0">
              <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider px-1 pb-1">Chat actual</div>
              {editingChatId === "__active__" ? (
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0a1120] border border-cyan-500/50">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 bg-transparent text-xs text-zinc-100 outline-none font-mono min-w-0"
                    placeholder="Título del chat…"
                    maxLength={80}
                  />
                  <button type="button" onClick={commitEdit} className="p-1 text-emerald-400 hover:text-emerald-300" title="Guardar título (Enter)">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={cancelEdit} className="p-1 text-zinc-500 hover:text-zinc-300" title="Cancelar (Esc)">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="group flex items-center gap-1.5 p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="flex-1 truncate text-xs text-cyan-100 font-medium" title={activeChatTitle}>
                    {activeChatTitle || "Chat sin título"}
                  </span>
                  <span className="text-[9px] text-cyan-400/70 font-mono shrink-0">{messages.length} msj</span>
                  <button
                    type="button"
                    onClick={() => startEdit("__active__", activeChatTitle)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition-all"
                    title="Renombrar chat actual"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Lista de chats guardados */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-1">
              <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider px-1 pb-1">Guardados</div>
              {savedChats.length === 0 && (
                <div className="text-zinc-600 text-[11px] px-1 py-3 leading-relaxed">
                  Todavía no hay chats guardados. Pulsa «Nuevo chat» o cambia de conversación y la actual se guardará aquí automáticamente.
                </div>
              )}
              {savedChats.map((chat) =>
                editingChatId === chat.id ? (
                  <div key={chat.id} className="flex items-center gap-1 p-1 rounded-lg bg-[#0a1120] border border-cyan-500/50">
                    <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 bg-transparent text-xs text-zinc-100 outline-none font-mono min-w-0"
                      placeholder="Título del chat…"
                      maxLength={80}
                    />
                    <button type="button" onClick={commitEdit} className="p-1 text-emerald-400 hover:text-emerald-300" title="Guardar título (Enter)">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={cancelEdit} className="p-1 text-zinc-500 hover:text-zinc-300" title="Cancelar (Esc)">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    key={chat.id}
                    className="group flex items-center gap-1.5 p-1.5 rounded-lg border border-transparent hover:border-zinc-700/70 hover:bg-zinc-800/50 cursor-pointer transition-all"
                    onClick={() => {
                      onOpenChat?.(chat.id);
                      cancelEdit();
                    }}
                    title={`Abrir "${chat.title}"`}
                  >
                    <FileText className="w-3.5 h-3.5 text-zinc-500 group-hover:text-cyan-400 shrink-0 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs text-zinc-200 group-hover:text-cyan-100 transition-colors">{chat.title}</div>
                      <div className="text-[9px] text-zinc-500 font-mono">
                        {chat.messages.length} msj · {new Date(chat.updatedAt).toLocaleDateString()} {new Date(chat.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(chat.id, chat.title);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition-all shrink-0"
                      title="Renombrar"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`¿Borrar el chat "${chat.title}"? Esta acción no se puede deshacer.`)) {
                          onDeleteChat?.(chat.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-all shrink-0"
                      title="Borrar chat"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="px-3 py-2 border-t border-[#101828] text-[9px] text-zinc-600 font-mono shrink-0 leading-relaxed">
              Los chats se guardan en el almacenamiento local de la IDE y sobreviven a reinicios.
            </div>
          </div>
        </>
      )}

      {/* Top Telemetry / Status Bar */}
      <div data-cn-topbar className="h-10 px-4 bg-[#04060c] border-b border-[#101726] flex items-center justify-between text-xs text-zinc-400 shrink-0 select-text">
        <div className="flex items-center gap-2">
          {/* Carpeta de chats guardados */}
          <button
            type="button"
            onClick={() => setChatsOpen((v) => !v)}
            title="Carpeta de chats guardados: nuevo, abrir, renombrar y borrar conversaciones"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] border transition-all ${
              chatsOpen
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "bg-zinc-900/70 border-zinc-700/60 text-zinc-400 hover:text-cyan-300 hover:border-cyan-700/50"
            }`}
          >
            <FolderOpen className="w-3 h-3" />
            <span>Chats ({savedChats.length})</span>
          </button>

          {/* v1.73.0 · LIMPIEZA (captura `areglo.jpg`): el chip del modelo se
              cayó de la barra — el selector YA está en el compositor del chat
              (la píldora con el modelo, al lado del clip). Duplicarlo arriba
              era pagar dos veces el mismo dato.
              Los interruptores (Agente PC / Pensar / Razonar / Editor) se
              plegaron en «Ajustes»: siguen existiendo, pero la barra respira.
              Agente PC nace SIEMPRE ACTIVO (default en App.tsx); el toggle
              queda solo como freno de emergencia dentro del menú. */}
          {onToggleModoLimpio && (
            <button
              type="button"
              onClick={onToggleModoLimpio}
              title={modoLimpio ? "Mostrar todos los paneles otra vez" : "Modo limpio: esconde los paneles secundarios y deja chat + preview. Salis con el mismo boton."}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono transition-colors ${modoLimpio ? "border-emerald-600/70 text-emerald-300 bg-emerald-950/40" : "border-zinc-800 text-zinc-500 hover:text-zinc-300"}`}
            >
              "🧹 Modo limpio" <span className={modoLimpio ? "text-emerald-400" : "text-zinc-600"}>{modoLimpio ? "ON" : "OFF"}</span>
            </button>
          )}
          <MenuAjustesChat
            pcMode={pcMode}
            onTogglePcMode={onTogglePcMode}
            thinkingMode={thinkingMode}
            onCycleThinkingMode={onCycleThinkingMode}
            geminiThinkingLevel={geminiThinkingLevel}
            onCycleGeminiThinkingLevel={onCycleGeminiThinkingLevel}
            isGeminiProvider={isGeminiProvider}
            currentModel={currentModel}
            editorMode={editorMode}
            onToggleEditorMode={onToggleEditorMode}
            showEditorMode={showEditorMode}
          />

          {/* v1.73.0 · CANAL DIRECTO: chip de la carpeta de proyecto vinculada.
              Clic para abrir el gestor (re-vincular / desvincular). */}
          {carpetaVinculada && (
            <button
              type="button"
              onClick={onAbrirCarpetaProyecto}
              title={`Canal directo activo: el agente trabaja sobre ${carpetaVinculada.ruta} sin restricciones (${carpetaVinculada.archivos} archivos). Clic para gestionar.`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] border transition-all bg-emerald-950/60 border-emerald-600/60 text-emerald-300 hover:border-emerald-400"
            >
              <FolderOpen className="w-3 h-3 text-emerald-400" />
              <span className="max-w-[220px] truncate">{carpetaVinculada.nombre}</span>
            </button>
          )}

          {/* 🔧 Cartel de archivo activo eliminado — el usuario lo encuentra confuso.
              El nombre del archivo activo se ve en el panel derecho (editor). */}
        </div>

        <div className="flex items-center gap-2">
          {messageQueue.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[11px] font-mono">
              <ListOrdered className="w-3 h-3 text-amber-400" />
              <span>{messageQueue.length} en cola</span>
            </div>
          )}

          {/* v1.73.0 — Cartel «Historial Total Activo» fuera de la barra: es un
              estado permanente (el historial SIEMPRE está activo), no una señal
              que cambie. Un cartel fijo ocupando sitio es ruido; el historial
              sigue exactamente igual de activo que antes. */}

          <div className="flex items-center gap-1">
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                title="Regenerar última respuesta"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-cyan-300 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            {onExportSession && (
              <button
                onClick={onExportSession}
                title="Exportar sesión (JSON)"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-emerald-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
            {onImportSession && (
              <button
                onClick={() => importInputRef.current?.click()}
                title="Importar sesión (JSON)"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-amber-300 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            )}
            {onResetSessionCache && (
              <button
                onClick={onResetSessionCache}
                title="Limpiar conversación"
                className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-300 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages Scroll View.
          v1.20.1 — el pie de cada burbuja («Escuchar»/«Copiar») cae en el borde
          derecho de la columna, justo donde vive el panel de Tareas. Cuando el
          panel se abre publica su ancho en --cn-tareas-gutter; aquí se come ese
          ancho como margen, la columna se recentra a la izquierda y el panel ya
          no tapa los botones. Con el panel cerrado la variable vale 0px: nada se
          mueve, así que el chat no cambia de sitio por tener el panel instalado. */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 cn-chat-hilo select-text"
        ref={chatScrollerRef}
        onScroll={medirPegadoAlFondo}
        // v2.3.17 · desenganchar el seguimiento exige un GESTO, no una medición.
        // El `onScroll` de arriba ya no alcanza para soltar la persecución (ver el
        // comentario de `medirPegadoAlFondo`).
        onWheel={marcarIntencionDeSubir}
        onTouchMove={marcarIntencionDeSubir}
        onKeyDown={(e) => {
          if (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "Home") marcarIntencionDeSubir();
        }}
        style={{
          marginRight: "var(--cn-tareas-gutter, 0px)",
          transition: "margin-right .18s ease",
        }}
      >
        {/* v2.0 — Arranque compacto: logo y textos más pequeños para no dejar
            media pantalla vacía cuando el chat está recién abierto. */}
        {messages.length === 0 && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 max-w-xl mx-auto my-auto select-none">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 flex items-center justify-center mb-6 shadow-2xl shadow-cyan-500/30 ring-1 ring-white/10">
              <span className="text-white font-black text-6xl tracking-tighter leading-none drop-shadow-lg">CN</span>
            </div>
            <h2 className="text-4xl font-black text-zinc-50 mb-2 tracking-tight">
              {IDE_BRAND.NAME}{" "}
              <span className="inline-block align-middle ml-1 text-sm font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-400/30 rounded-full px-3 py-0.5">
                {IDE_BRAND.VERSION}
              </span>
            </h2>
            <p className="text-lg text-zinc-400 leading-relaxed max-w-md mb-2">
              Escribe tu requerimiento abajo para empezar, o usa un atajo.
            </p>
            <p className="text-xs text-zinc-600 tracking-wide uppercase mb-5">
              IA local · sandbox en vivo · puente PC · motor de planes
            </p>

            {/* v2.0 — Pantalla de bienvenida COMPACTA.
                Antes: 4 tarjetas grandes en rejilla 2x2 que ocupaban media
                pantalla y empujaban el compositor hacia abajo (el "espacio
                vacío" de las capturas). Ahora: 2 accesos en una sola fila de
                píldoras de una línea. Quitadas a petición del usuario:
                "Generar README" y "Auditar Seguridad" (eran las 2 de más). */}
            <div className="flex flex-wrap items-center justify-center gap-2 w-full text-xs font-mono">
              <button
                onClick={() => onSendMessage("Analiza la arquitectura del proyecto y genera los módulos del backend en el puerto 5000", [])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0a0e17]/80 hover:bg-[#0c1220] border border-[#121a2c] hover:border-cyan-500/50 text-zinc-300 transition-all"
                title="Generar microservicio de soporte y workers con tipado TypeScript"
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Módulo Backend :5000</span>
              </button>

              <button
                onClick={() => onSendMessage("Examina los mensajes del chat y resume los acuerdos técnicos", [])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0a0e17]/80 hover:bg-[#0c1220] border border-[#121a2c] hover:border-cyan-500/50 text-zinc-300 transition-all"
                title="Acceso íntegro a todos los turnos del chat"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Historial Completo</span>
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 text-[11px] text-zinc-600">
              <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-cyan-400" /> Multi-provider</span>
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-emerald-400" /> SLM optimizado</span>
              <span className="flex items-center gap-1"><Layers className="w-3 h-3 text-violet-400" /> RAG local</span>
              <span className="flex items-center gap-1"><Terminal className="w-3 h-3 text-amber-400" /> Sandbox :3500</span>
            </div>
          </div>
        )}

        {/* v1.73.0 · LA BARRA DEL AGENTE SE MUDÓ AL PANEL DE TAREAS
            (pedido con captura: «que se abra abajo o a la derecha en el
            apartado de Tareas, como en la segunda imagen»). El bloque
            «ACCIONES EJECUTADAS (agente 5000)» ya no ocupa la columna del
            chat: vive en el panel Tareas/Hoja de Ruta (arriba a la derecha),
            que además se autoabre cuando el motor ejecuta una tanda nueva.
            El feed llega ahí por la prop `acciones` de PlanificationPanel,
            alimentada por App con el MISMO actionLog que veía este bloque. */}

        {/* Tablero del agente (plan de tareas) */}
        {agentTasks.length > 0 && (
          <div className="mx-3 mb-2 p-2 rounded-lg border border-cyan-900/40 bg-[#050a14]">
            <div className="flex items-center gap-2 mb-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-mono font-bold text-cyan-300 tracking-wide">
                PLAN DEL AGENTE
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {agentTasks.map((t) => {
                const done = t.status === "completed";
                const active = t.status === "in_progress";
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 text-[11px] font-mono ${
                      done ? "text-emerald-400" : active ? "text-amber-300" : "text-zinc-500"
                    }`}
                  >
                    <span className="w-3 text-center shrink-0">
                      {done ? "✓" : active ? "▶" : "·"}
                    </span>
                    <span className={done ? "line-through opacity-70" : ""}>{t.description}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Render Chat Messages · v1.99.0 · la cola pintada, el resto a UN clic.
            Con 191 mensajes montados, teclear costaba una vida: cada tecla volvía a
            pasar el historial entero por `prosaLegible`. El criterio es puro
            (`src/engine/ventanaMensajes.ts`) y el boton nombra el numero exacto de
            mensajes que quedan arriba — esconder historial sin decirlo no era una
            opcion. */}
        {(() => {
          const v = decidirVentanaMensajes(messages.length, revelados);
          if (!v.mostrarMas) return null;
          return (
            <button
              type="button"
              onClick={() => setRevelados((r) => siguienteRevelado(r, messages.length))}
              className="mx-auto mb-2 block px-3 py-1 rounded-full border border-white/10 text-[10px] text-zinc-400 hover:text-emerald-300 hover:border-emerald-400/40"
              title="El historial completo sigue existiendo: se va sumiendo de a 40."
            >
              {rotuloMostrarMas(v.ocultos)}
            </button>
          );
        })()}
        {messages.slice(decidirVentanaMensajes(messages.length, revelados).desde).map((msg) => {
          const isUser = msg.role === "user";
          const isError = msg.status === "error";
          // v1.84.2 · «Solo final»: solo existe botón nuevo donde hay un resumen
          // DISTINTO del mensaje (veredicto ecléctico o prosa final de un informe
          // con código). En charla simple el mensaje entero ya es el resumen.
          // v1.92.0 · en un modelo SIMPLE y largo la resolución no estaba marcada por
          // vallas: `dividirVozSimple` la corta (último párrafo de prosa) y habilita
          // las dos bocas — resumen y pensamiento — sin tocar el «Escuchar» de siempre.
          const vozSimple = isUser ? null : dividirVozSimple(msg.content);
          const resumenVoz = isUser ? null : resumenFinalDelMensaje(msg.content) ?? vozSimple?.resumen ?? null;
          const claveResumen = `${msg.id}~resumen`;
          const resumenHablando = speakingId === claveResumen;
          const pensamientoHablando = speakingId === `${msg.id}~pensamiento`;

          return (
            <div
              key={msg.id}
              className={`cn-chat-turno group/turno flex gap-3 ${claseHorma(horma)} mx-auto select-text ${
                isUser ? "justify-end" : "justify-start"
              }`}
            >
              {!isUser && (
                <div className="cn-chat-sello w-7 h-7 rounded-lg bg-[#080d18] border border-cyan-800/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
              )}

              <div
                className={`cn-chat-burbuja max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-xs leading-relaxed select-text ${
                  isUser
                    ? "cn-chat-burbuja--usuario bg-[#091122] text-cyan-100 border border-cyan-900/60 rounded-tr-none"
                    : isError
                    ? "cn-chat-burbuja--error bg-red-950/40 text-red-200 border border-red-800/60 rounded-tl-none"
                    : "bg-[#050810] text-zinc-200 border border-[#121a2c] rounded-tl-none"
                }`}
              >
                {/* Attachments Preview in Bubble */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mb-2.5 pb-2 flex flex-wrap gap-1.5 border-b border-zinc-800/60">
                    {msg.attachments.map((att) => renderAttachmentBadge(att, false))}
                  </div>
                )}

                {/* Message Body — V8: .cn-regulable deja que el regulador de tamaño del panel «A» (Aspecto) escale el cuerpo del mensaje, que antes no tenía clase de tamaño y ningún regulador lo alcanzaba.
                    v1.70.6: el cuerpo pasa por CuerpoMensaje — los mensajes densos se ven como informe (fichas plegadas + una sola línea de intención); el resto, igual que siempre. */}
                <div className="cn-regulable font-sans break-words selection:bg-cyan-500/40 select-text">
                  <CuerpoMensaje cuerpo={componerCuerpo(msg.content)} />
                </div>

                {/* v1.0.14 · CUESTIONARIO CON OPCIONES — si el asistente preguntó con
                    opciones (formato PREGUNTA:/OPCIÓN N:), se pintan como BOTONES
                    elegibles. El clic envía la opción como mensaje del usuario. */}
                {!isUser && (() => {
                  try {
                    const opts = parsearOpciones(msg.content || "");
                    if (!opts || opts.opciones.length === 0) return null;
                    return (
                      <div className="mt-2.5 pt-2 flex flex-wrap gap-1.5 border-t border-zinc-800/40">
                        {opts.opciones.map((opcion, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onSendMessage(opcion, [])}
                            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-[#0a1120] hover:bg-cyan-900/50 text-amber-200 hover:text-cyan-100 border border-amber-800/40 hover:border-cyan-600/60 font-mono transition-colors"
                            title={`Elegir: ${opcion}`}
                          >
                            {i + 1}. {opcion}
                          </button>
                        ))}
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* Bubble Footer / Copy button + Escuchar (TTS por mensaje) */}
                <div className="mt-2.5 pt-1.5 flex items-center justify-between border-t border-zinc-800/40 text-[10px] text-zinc-500 font-mono">
                  <div className="flex items-center gap-1.5 min-w-0">
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    {msg.modelUsed ? ` • ${msg.modelUsed}` : ""}
                  </span>

                  {/* v1.43.0 — 🚩 FAILOVER VISIBLE: el chat respondía con un modelo
                      pero el pie firmaba el SELECCIONADO. Ya no: `modelUsed`
                      guarda el modelo REAL que contestó. Si NO coincide con el
                      seleccionado (p. ej. pediste gemini-3.8-flash y, al fallar,
                      el relevo sirvió gemini-3.5-flash), lo decimos sin rodeos
                      en vez de mentir con la etiqueta. */}
                  {msg.role === "assistant" && msg.modelUsed && currentModel && msg.modelUsed !== currentModel && (
                    <span
                      title={`Pediste «${currentModel}» pero falló; respondió el modelo de relevo «${msg.modelUsed}».`}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono text-[10px] whitespace-nowrap"
                    >
                      ↻ relevo: {msg.modelUsed}
                    </span>
                  )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Escuchar este mensaje (voz local del sistema) */}
                    <button
                      onClick={() => handleSpeak(msg)}
                      disabled={isSoundMuted}
                      className={`flex items-center gap-1 p-1 rounded transition-colors ${
                        isSoundMuted
                          ? "text-zinc-700 cursor-not-allowed"
                          : speakingId === msg.id
                          ? "text-cyan-300"
                          : "text-zinc-500 hover:text-cyan-300"
                      }`}
                      title={
                        isSoundMuted
                          ? "Audio silenciado: actívalo con el botón de altavoz de la barra superior"
                          : speakingId === msg.id
                          ? "Detener audio de este mensaje"
                          : "Escuchar este mensaje ENTEGO en voz alta (informe, código y todo)"
                      }
                    >
                      {isSoundMuted ? (
                        <VolumeX className="w-3 h-3" />
                      ) : speakingId === msg.id ? (
                        <Square className="w-3 h-3 fill-cyan-300" />
                      ) : (
                        <Volume2 className="w-3 h-3" />
                      )}
                      <span>{isSoundMuted ? "Silenciado" : speakingId === msg.id ? "Detener" : "Escuchar"}</span>
                    </button>

                    {/* v1.84.2 · «Solo final» (Mario 27/10): la otra boca del mismo
                        mensaje — lee ÚNICAMENTE la resolución final (el veredicto en
                        cerebro/auto, la última prosa en un informe con código). El
                        «Escuchar» de al lado no cambia: dice el crudo entero. Donde
                        no hay resumen distinto del mensaje, este botón no aparece. */}
                    {resumenVoz && (
                      <button
                        onClick={() => handleSpeak(msg, "resumen")}
                        disabled={isSoundMuted}
                        className={`flex items-center gap-1 p-1 rounded transition-colors ${
                          isSoundMuted
                            ? "text-zinc-700 cursor-not-allowed"
                            : resumenHablando
                            ? "text-emerald-300"
                            : "text-zinc-500 hover:text-emerald-300"
                        }`}
                        title={
                          isSoundMuted
                            ? "Audio silenciado: actívalo con el botón de altavoz de la barra superior"
                            : resumenHablando
                            ? "Detener la lectura del resumen"
                            : "Escuchar SOLO la resolución final de este mensaje (veredicto / resumen, sin el informe ni el código)"
                        }
                      >
                        {isSoundMuted ? (
                          <VolumeX className="w-3 h-3" />
                        ) : resumenHablando ? (
                          <Square className="w-3 h-3 fill-emerald-300" />
                        ) : (
                          <Volume2 className="w-3 h-3" />
                        )}
                        <span>{isSoundMuted ? "Silenciado" : resumenHablando ? "Detener" : vozSimple ? "Resumen" : "Solo final"}</span>
                      </button>
                    )}

                    {/* v1.92.0 · LA TERCERA BOCA (Mario, 30/10): en los modelos simples
                        el proceso y la conclusión venían mezclados en un solo audio.
                        Este botón lee ÚNICAMENTE lo que el modelo dijo antes de cerrar
                        (narración, pasos, intención) — el mismo texto que está en la
                        burbuja, sin resumir ni reescribir nada. Aparece solo cuando el
                        corte existe; si el mensaje es corto o todo es conclusión, no se
                        pinta (dos bocas diciendo lo mismo son decorado). */}
                    {vozSimple?.pensamiento && (
                      <button
                        onClick={() => handleSpeak(msg, "pensamiento")}
                        disabled={isSoundMuted}
                        className={`flex items-center gap-1 p-1 rounded transition-colors ${
                          isSoundMuted
                            ? "text-zinc-700 cursor-not-allowed"
                            : pensamientoHablando
                            ? "text-violet-300"
                            : "text-zinc-500 hover:text-violet-300"
                        }`}
                        title={
                          isSoundMuted
                            ? "Audio silenciado: actívalo con el botón de altavoz de la barra superior"
                            : pensamientoHablando
                            ? "Detener la lectura del pensamiento"
                            : "Escuchar SOLO el pensamiento / proceso de este mensaje, sin la conclusión"
                        }
                      >
                        {isSoundMuted ? (
                          <VolumeX className="w-3 h-3" />
                        ) : pensamientoHablando ? (
                          <Square className="w-3 h-3 fill-violet-300" />
                        ) : (
                          <Volume2 className="w-3 h-3" />
                        )}
                        <span>{isSoundMuted ? "Silenciado" : pensamientoHablando ? "Detener" : "Pensamiento"}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 p-1 rounded transition-colors"
                      title="Copiar mensaje"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-[#0c162a] border border-blue-600/40 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-blue-300" />
                </div>
              )}
            </div>
          );
        })}

        {/* v1.62.0 - Cuando NO hay streaming, el bloque que se centra es el ULTIMO
            mensaje del asistente: es el texto que el usuario esta leyendo. Sin esto,
            al cortarse el chorro la vista volvia al fondo y el texto se iba abajo. */}
        {!isStreaming && ultimoAsistenteIdx >= 0 && (
          <div ref={ultimaRespuestaRef} aria-hidden="true" style={{ height: 0 }} />
        )}

        {/* Live Streaming Bubble
            v1.62.0 - `ultimaRespuestaRef` se ENGANCHA AQUI. Antes se declaraba y se
            leia en `conducirSeguidor`, pero no estaba puesta en ningun elemento: el
            alto medido era siempre 0, `objetivoLectura` caia al `return fondo` y el
            hilo seguia pegando el texto al borde inferior. La respuesta en vuelo es
            el bloque que hay que centrar mientras llega el chorro. */}
        {/* v1.0.14 · EL TIEMPO DEL ÚLTIMO TURNO queda a la vista al terminar
            (el cronómetro vivo vive arriba, junto a «Inferencia activa»). */}
        {!isStreaming && ultimoTurnoSeg !== null && (
          <div className={`${claseHorma(horma)} mx-auto my-1 flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono`}>
            <Timer className="w-3 h-3" />
            <span>Último turno: {formatearTiempo(ultimoTurnoSeg)}</span>
          </div>
        )}

        {isStreaming && (
          <div
            ref={ultimaRespuestaRef}
            className={`flex gap-3 ${claseHorma(horma)} mx-auto justify-start select-text`}
          >
            <div className="w-7 h-7 rounded-lg bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
              <Bot className="w-4 h-4 text-cyan-400" />
            </div>

            <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-xs leading-relaxed bg-[#040710] text-zinc-200 border border-cyan-500/40 rounded-tl-none shadow-lg select-text">
              <div className="font-sans break-words selection:bg-cyan-500/40 select-text">
                {currentStreamingText ? (
                  <CuerpoMensaje cuerpo={componerCuerpo(currentStreamingText)} streaming />
                ) : (
                  <span className="whitespace-pre-wrap">Procesando requerimiento...</span>
                )}
                <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 animate-pulse" />
              </div>
              <div className="mt-2 text-[10px] text-cyan-400/80 font-mono flex items-center gap-2">
                <span>{currentModel} • Inferencia activa</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-700/40 text-cyan-300 tabular-nums" title="Tiempo de trabajo del modelo en este turno">
                  <Timer className="w-3 h-3" />
                  {formatearTiempo(cronoSeg)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Message Queue Preview in Chat */}
        {messageQueue.length > 0 && (
          <div className={`${claseHorma(horma)} mx-auto my-2 p-3 bg-[#080d18] border border-amber-800/40 rounded-xl select-text`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                <ListOrdered className="w-3.5 h-3.5 text-amber-400" />
                <span>Mensajes en cola ({messageQueue.length})</span>
                <span className="text-[10px] text-zinc-500">Se procesarán secuencialmente</span>
              </div>
              {onClearQueue && (
                <button
                  type="button"
                  onClick={onClearQueue}
                  className="text-[10px] text-red-400 hover:text-red-300 font-mono"
                >
                  Vaciar cola
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {messageQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#020408] border border-zinc-800/80 text-xs text-zinc-300"
                >
                  {editingQueueId === item.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        ref={queuedEditRef}
                        type="text"
                        value={queuedEditBuffer}
                        onChange={(e) => setQueuedEditBuffer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitQueueEdit();
                          if (e.key === "Escape") cancelQueueEdit();
                        }}
                        className="flex-1 bg-transparent text-xs text-zinc-100 outline-none font-mono min-w-0"
                        placeholder="Editar mensaje de la cola…"
                        maxLength={2000}
                      />
                      <button type="button" onClick={commitQueueEdit} className="p-1 text-emerald-400 hover:text-emerald-300 shrink-0" title="Guardar cambios en el mensaje encolado (Enter)">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={cancelQueueEdit} className="p-1 text-zinc-500 hover:text-zinc-300 shrink-0" title="Cancelar edición (Esc)">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-4 h-4 rounded bg-amber-950 border border-amber-700/60 text-amber-400 text-[10px] flex items-center justify-center shrink-0 font-mono">
                          {idx + 1}
                        </span>
                        <span className="truncate max-w-[480px] font-sans">{item.text || "Archivo(s) adjunto(s)"}</span>
                        {item.attachments.length > 0 && (
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                            (+{item.attachments.length} adjuntos)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* v1.0.20 · el mensaje lanzado se VE. Antes se pulsaba
                            «Lanzar», el mensaje quedaba igual y no había forma de
                            saber si el gesto había entrado: el botón parecía roto
                            aunque el gesto se hubiera hecho. La marca viene del
                            motor puro (engine/lanzarEnCola.ts). */}
                        {(() => {
                          const marca = etiquetaDeLaFila(item.lanzadoEn, !!isStreaming);
                          return marca.texto ? (
                            <span
                              className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-mono border ${
                                marca.tono === "lanzado"
                                  ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                                  : "bg-zinc-900 border-zinc-700 text-zinc-400"
                              }`}
                              title="Se adelantó desde la cola: sale al terminar el turno en curso, sin cortarlo"
                            >
                              {marca.texto}
                            </span>
                          ) : null;
                        })()}
                        {onLaunchQueuedMessage && item.lanzadoEn === undefined && (
                          <button
                            type="button"
                            onClick={() => onLaunchQueuedMessage(item.id)}
                            className="text-zinc-500 hover:text-emerald-300 p-1 transition-colors"
                            title="Lanzar este mensaje ahora: si hay un turno en curso, pasa al frente y sale al terminar sin cortarlo"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                        )}
                        {onEditQueuedMessage && (
                          <button
                            type="button"
                            onClick={() => startQueueEdit(item.id, item.text || "")}
                            className="text-zinc-500 hover:text-amber-300 p-1 transition-colors"
                            title="Editar mensaje encolado"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {onRemoveQueuedMessage && (
                          <button
                            type="button"
                            onClick={() => onRemoveQueuedMessage(item.id)}
                            className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                            title="Quitar de la cola"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area Form at Bottom
          v2.0 — El compositor es COMPACTO por defecto: una sola línea de alto.
          Antes forzaba `rows={5}` + `height:120px` y eso dejaba un bloque vacío
          enorme encima del lanzador (visible en las capturas). Ahora crece solo
          cuando escribes, hasta 5 renglones (~130 px), y vuelve a encogerse. */}
      {/* v1.20.1 — El despeje del panel de Tareas se come como PADDING del
          envoltorio, NO como margen del formulario: `marginRight` inline pisaba
          el `margin-right:auto` del `mx-auto` y el compositor se iba pegado al
          borde derecho con el panel cerrado (el «chat se movió a la derecha»).
          Con padding, mx-auto sigue centrando dentro del ancho libre. */}
      <div
        className="px-3 pt-2 pb-2.5 bg-[#000000] border-t border-[#101726] shrink-0 select-text"
        style={{
          paddingRight: "calc(0.75rem + var(--cn-tareas-gutter, 0px))",
          transition: "padding-right .18s ease",
        }}
      >
        <form
          onSubmit={handleSubmit}
          className={`cn-chat-composer ${claseHorma(horma)} mx-auto bg-[#050810] border border-[#141d2e] rounded-2xl shadow-2xl overflow-hidden transition-all`}
        >
          {/* Pending Attachments Strip */}
          {/* v8.0.3 — La tira aparece también MIENTRAS carga. Antes la condición
              era `pendingAttachments.length > 0`, así que durante el procesado
              de un lote grande (las imágenes generan su miniatura una a una) no
              se veía absolutamente nada hasta que entraba la primera: el usuario
              soltaba 30 archivos y no pasaba nada en pantalla. El contador ahora
              distingue «listos» de «cargando». */}
          {(pendingAttachments.length > 0 || pendingNames.length > 0) && (
            <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap gap-1.5 border-b border-zinc-800/80 bg-[#03050a]">
              <div className="w-full flex items-center justify-between text-[11px] text-zinc-400 font-mono mb-1">
                <span>
                  {pendingAttachments.length} adjunto(s) listo(s)
                  {pendingNames.length > 0 && (
                    <span className="text-cyan-400"> · {pendingNames.length} cargando…</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={onClearPendingAttachments}
                  className="text-red-400 hover:text-red-300 text-[10px] flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpiar todos
                </button>
              </div>
              {pendingAttachments.map((att) => renderAttachmentBadge(att, true))}
              {pendingNames.map((nombre, i) => renderAttachmentPendiente(nombre, i))}
            </div>
          )}

          {/* ============================================================
              v1.6.5 — AVISO DE VOZ, EN FLUJO NORMAL.
              Antes vivía con `absolute -top-11 left-0 right-0` DENTRO de la caja
              del textarea: su contenedor no era `relative`, así que el navegador
              lo posicionaba contra otro ancestro y el `overflow-hidden` del
              formulario lo recortaba a medias. El resultado era el «cartel por
              delante» flotando sobre la zona de escritura y comiéndose el sitio
              donde se teclea. Ahora es un banner más de la columna del
              compositor: nunca puede tapar el textarea ni los mensajes.
              Información, no bloqueo: se puede cerrar. */}
          {ttsAviso && (
            <div className="px-3 pt-2 pb-2 flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 text-amber-200 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed select-text">{ttsAviso}</span>
              <button
                type="button"
                onClick={() => setTtsAviso(null)}
                className="shrink-0 text-amber-300 hover:text-white"
                title="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Text Input Box — v2.0: arranca en 1 renglón y crece hasta 5 (≈130 px).
              `flex-1 min-w-0` + `overflow-y-auto` evitan que el textarea empuje el
              layout cuando el texto es largo. */}
          <div className="p-2 flex items-end gap-2 bg-[#0a0e17]/90 backdrop-blur-sm rounded-lg border border-zinc-800 mx-2 mb-2">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                // v1.6.11 — antes de cambiar el valor, se apunta el anterior: es
                // el historial que usa Ctrl+Z (ver registrarParaDeshacer).
                const bruto = e.target.value;
                registrarParaDeshacer(bruto);
                let texto = bruto;
                // F1 — con «auto», el autocorrector reemplaza en caliente solo
                // las correcciones seguras; si nada cambió NO se reescribe (así
                // no parpadea el caret). «sugerir»/«off» dejan lo escrito intacto.
                let modo: "off" | "sugerir" | "auto" = "sugerir";
                try {
                  modo = loadProSettings().editor.autocorrector ?? "sugerir";
                } catch {
                  /* configuración ilegible → sugerir */
                }
                if (modo === "auto") {
                  const caret = e.target.selectionStart ?? bruto.length;
                  // v1.48.4 — solo se corrigen las palabras YA TERMINADAS: la
                  // palabra que se está escribiendo bajo el caret se deja en paz
                  // (si no, el corrector «peleaba» con el usuario letra a letra
                  // y parecía que no servía). Se consideran terminadas las que
                  // acaban antes del inicio de la palabra en curso.
                  const antes = bruto.slice(0, caret);
                  const enCurso = antes.match(/[^\s]+$/); // palabra pegada al caret
                  const finCompletadas = enCurso ? antes.length - enCurso[0].length : antes.length;
                  const { correcciones } = corregirLinea(bruto, "sugerir");
                  const aplicables = correcciones.filter(
                    (c) => c.segura && c.fin <= finCompletadas
                  );
                  if (aplicables.length > 0) {
                    let tx = bruto;
                    // De derecha a izquierda para no descolocar índices.
                    for (const c of [...aplicables].sort((a, b) => b.inicio - a.inicio)) {
                      tx = tx.slice(0, c.inicio) + c.corregida + tx.slice(c.fin);
                    }
                    texto = tx;
                    // Todas las correcciones ocurren ANTES del caret, así que el
                    // caret se desplaza por la diferencia total de longitud.
                    const nuevoCaret = Math.max(0, caret + (tx.length - bruto.length));
                    const ta = e.currentTarget;
                    requestAnimationFrame(() => {
                      try { ta.setSelectionRange(nuevoCaret, nuevoCaret); } catch { /* noop */ }
                    });
                  }
                }
                setInputText(texto);
                const ta = e.currentTarget;
                ta.style.height = "auto";
                // 5 renglones ≈ 130 px (text-sm con leading-relaxed)
                ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isStreaming
                  ? "Escribe para encolar el siguiente mensaje..."
                  : "Escribe tu requerimiento o arrastra archivos..."
              }
              rows={1}
              /* v1.48.0 — CORRECTOR ORTOGRÁFICO EN TIEMPO REAL: el revisor nativo
                 del navegador (Chromium/Electron) subraya las faltas mientras se
                 escribe, en español, y ofrece la corrección con clic derecho. Se
                 suma al autocorrector determinista del composer (acentos/ñ). */
              spellCheck={true}
              lang="es"
              autoCapitalize="sentences"
              autoCorrect="on"
              className="flex-1 min-w-0 bg-transparent text-zinc-100 placeholder-zinc-600 text-sm py-1.5 px-1 outline-none resize-none leading-relaxed select-text border-none focus:outline-none overflow-y-auto custom-scrollbar"
              style={{ maxHeight: "130px" }}
            />

            {/* Hidden File Input
                v2.3.10 — TOPE DE TAMAÑO EN EL CLIP (pedido del 4/11: «el tope por
                archivo que sea 200mb»). Antes NO había ningún límite: el input era
                `<input type="file" multiple>` a secas, así que un .exe de 300 MB
                entraba entero en memoria vía FileReader → base64 y colgaba la
                pestaña antes de poder cancelar (el mismo patrón que el comentario
                de attachmentProcessor.ts:801 describe como causa de reinicio).
                El tope se aplica AQUÍ, en la puerta, y no en el procesador: así el
                archivo grande ni siquiera se lee. Se avisa con el nombre y el
                tamaño real, no se descarta en silencio.
                NO se pone `accept`: el usuario pidió explícitamente que siga
                aceptando todo (audio, .exe, lo que sea). */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const lista = e.target.files;
                if (!lista || lista.length === 0) return;
                // Misma función que el arrastre: una sola regla, dos puertas.
                const pasan = filtrarPorTamano(lista);
                if (pasan.length > 0) onAddAttachments(pasan);
                // Se limpia el input para poder volver a elegir el MISMO archivo
                // (si no, el navegador no dispara onChange la segunda vez).
                e.target.value = "";
              }}
            />

            {/* Action Buttons: Voz TTS, Attach, Model Pill, Send/Stop */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/*
                v1.6.19 — EL SELECTOR DE VOZ SE VA.
                Lo pidió el usuario: «quita el coso este de Gemini del chat, está
                al pedo si no anda, ocupa lugar». Y tiene razón en lo del lugar:
                se comía 150 px de la barra para elegir entre unas voces que, sin
                clave, todas hacían lo mismo.

                Que quede claro por si alguien vuelve a mirar esto: NO era la
                causa de que el modelo no respondiera. Aquello era el aborto del
                primer token (ver GEMINI_PRIMER_TOKEN_TIMEOUT_MS), otro camino
                distinto. Este desplegable solo elige la voz del botón
                «Escuchar», y nunca pudo afectar a la inferencia.

                Los mensajes siguen teniendo su «Escuchar»: usa la voz del
                navegador. Si algún día se quiere recuperar la elección de voces,
                el estado `ttsVoice` y `hayClaveGeminiTts` siguen aquí enteros —
                solo hay que volver a pintar el <select>.
              */}

              <button
                type="button"
                onClick={onOpenModelSelector}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-850 text-cyan-300 rounded-xl border border-zinc-800 text-xs font-mono transition-colors"
                title="Cambiar modelo activo"
              >
                <Radio className="w-3 h-3 text-cyan-400" />
                <span className="max-w-[100px] truncate">{currentModel}</span>
              </button>

              {/* v2.3.2 · EL USUARIO JUBILÓ EL "BOLSO" DE ESTA BARRA (4/11):
                  «elimina la opción de bolso de herramientas de la barra del chat…
                  las de adjuntar y de carpeta de trabajo quedan fijas, son
                  necesarios a la vista siempre».
                  La fase 4 (v1.83.0) había metido Canal directo + Adjuntar +
                  Encolar detrás del ⚙ para desocupar la barra. En el uso real salió
                  al revés: las dos que el contrato plegó son las que se tocan en
                  casi todos los mensajes, así que el pliegue agregaba un clic a la
                  ruta más corta del programa. Los tres vuelven a la barra y el
                  desplegable de ESTE panel desaparece; `contratoSuperficie` se
                  actualiza en la misma edición (tres acciones visibles es menos que
                  el umbral de la regla, como en `chats-cola`, que también certifica
                  lo que NO necesita plegarse). */}
              {/* v1.73.0 · CANAL DIRECTO — el botón que Zai no podía poner:
                  vincula una CARPETA del proyecto (o un .zip) como raíz de
                  trabajo del agente. No es un adjunto: es un montaje. Los
                  archivos no se copian al chat ni se pegan al prompt; el
                  modelo los lee, escribe y ejecuta EN SU SITIO, sin límite
                  por archivo ni permisos intermedios. */}
              {onAbrirCarpetaProyecto && (
                <button
                  type="button"
                  onClick={onAbrirCarpetaProyecto}
                  className={`p-2 rounded-xl border transition-colors ${
                    carpetaVinculada
                      ? "bg-emerald-950/60 hover:bg-emerald-900/50 text-emerald-300 border-emerald-700/60"
                      : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-300 border-zinc-800"
                  }`}
                  title={
                    carpetaVinculada
                      ? `Canal directo ACTIVO sobre ${carpetaVinculada.ruta} — clic para gestionar (cambiar o desvincular)`
                      : "Canal directo: vincular una CARPETA de proyecto o un .zip para que el modelo trabaje ahí sin restricciones"
                  }
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 rounded-xl border border-zinc-800 transition-colors"
                title="Adjuntar archivos al mensaje (ZIP, DOCX, código, imágenes, audio wav/mp3)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

                  <button
                    type="submit"
                    disabled={!inputText.trim() && pendingAttachments.length === 0}
                    className="p-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl shadow-md transition-all flex items-center gap-1 text-xs font-mono"
                    title="Encolar mensaje para enviarlo al terminar la generación actual"
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Encolar</span>
                  </button>

              {isStreaming ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onStopStreaming}
                    className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-xl shadow-md transition-colors"
                    title="Detener generación"
                  >
                    <Square className="w-4 h-4 fill-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim() && pendingAttachments.length === 0}
                  className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600 text-white rounded-xl shadow-md transition-all"
                  title="Enviar requerimiento"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Hidden Import Session File Input */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file && onImportSession) {
            onImportSession(file);
          }
          e.target.value = "";
        }}
      />

      {/* v8.0.3 — VISTA PREVIA EN GRANDE DE UN ADJUNTO.
          Se abre al pulsar la miniatura del chip. Existe por el caso «muchas»:
          con veinte capturas parecidas, la miniatura de 36 px dice cuál es la
          zona de la pantalla, pero no permite comprobar si es la buena. Se cierra
          con Escape, con la X o pulsando fuera — las tres, porque cada una es la
          que intenta la mitad de la gente. */}
      {vistaPrevia && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm grid place-items-center p-6"
          onClick={() => setVistaPrevia(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setVistaPrevia(null);
          }}
          tabIndex={-1}
          // Cuerpo con llaves a propósito: `(el) => el && el.focus()` devuelve
          // `void | null`, y React tipa la ref como `void | (() => void)`. Cuela
          // en runtime y no compila con `strict`. Con llaves, no devuelve nada.
          ref={(el) => { if (el) el.focus(); }}
        >
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-300 font-mono">
              <span className="truncate max-w-[70vw]" title={vistaPrevia.nombre}>
                {vistaPrevia.nombre}
              </span>
              <button
                type="button"
                onClick={() => setVistaPrevia(null)}
                className="text-zinc-400 hover:text-white shrink-0 flex items-center gap-1"
                title="Cerrar (Escape)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={vistaPrevia.src}
              alt={vistaPrevia.nombre}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg border border-zinc-700 bg-zinc-950"
            />
          </div>
        </div>
      )}
    </main>
  );
};

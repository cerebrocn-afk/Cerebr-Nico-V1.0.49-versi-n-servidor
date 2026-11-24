import React, { useRef, useState, useEffect } from "react";
import { useLatido } from "./useLatido";
import { textoCabecera } from "../engine/latido";

import {
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Key,
  Languages,
  Layers,
  PanelLeft,
  PanelRight,
  Radio,
  Server,
  Brain,
  Sparkles,
  Volume2,
  VolumeX,
  ChevronDown,
  Save,
  FileBox,
  Globe,
  Image as ImageIcon,
  Palette,
  Settings,
  // v2.0 — iconos de los controles nuevos (tamaño de texto, modo 8 GB,
  // extensiones, panel PRO y pantalla completa)
  Type,
  Gauge,
  Puzzle,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  History,
  Zap, // CONSEJO v1
  Music2, // v1.73.0 — el ambiente salió de la esquina inferior y entró al menú
} from "lucide-react";
import { PanelAspecto } from "./PanelAspecto"; // ASPECTO v1: controles de texto por sección
import { ConsejoPanel } from "./ConsejoPanel"; // CONSEJO v1: los 10 agentes y las 18 dormidas, por fin con botón
import { esTarjetaFlotante } from "../engine/tarjetaFlotante"; // v1.98.0: el fuera-clic del menú CN no se traga las tarjetas portaleadas
// v1.99.8 · el chip dejó de llamarse «8 GB»: la palabra que se ve es el MODO, y la RAM que se
// nombra en el tooltip es la que midió el server (`os.totalmem`), no el nombre de un interruptor.
import { siguientePerf, type ModoPerf, type DecisiónPerf } from "../engine/presionEquipo";

/**
 * ¿Está el liviano APLICADO? La decisión vive en App (`decidirModoPerf`, con la RAM medida); acá se
 * pinta. Si todavía no llegó (primer render, sin `/api/sistema/estado`), se pinta lo que pidió el
 * usuario y nada más — nunca el estado inverso: un chip que mienta mientras carga es como el que
 * decía «8 GB» en una máquina de 16.
 */
const estaLiviano = (d: DecisiónPerf | null | undefined, preferido: ModoPerf): boolean =>
  (d ? d.modo : preferido === "8gb" ? "8gb" : "auto") === "8gb";
import { TtsSelector } from "./TtsSelector"; // TTS v1.15.0: selector de voz/tono/velocidad en la barra superior
import { PortTelemetry } from "../types";
import { etiqueta as etiquetaDeIndicador } from "../engine/indicadorServicios"; // v2.3.1 · un solo criterio OK/OFF/—
import { EXPERT_MODES, RESPONSE_LANGUAGES } from "../utils/contextCache";
import { IDE_BRAND, APP_FONT_SIZES, APP_FONT_SIZE_LABELS } from "../constants";
import { BrainThinkingIcon } from "./BrainThinkingIcon";

interface HeaderProps {
  currentModel: string;
  onOpenModelSelector: () => void;
  onOpenApiKeys?: () => void;
  telemetry: PortTelemetry;
  workspaceFileCount: number;
  onDownloadZip: () => void;
  isLeftOpen: boolean;
  onToggleLeft: () => void;
  isRightOpen: boolean;
  onToggleRight: () => void;
  isSoundMuted: boolean;
  onToggleSound: () => void;
  ramUsageMb?: number;
  maxRamGb?: number;
  responseLanguage: string;
  onLanguageChange: (lang: string) => void;
  expertMode: string;
  onExpertModeChange: (mode: string) => void;
  // 🔧 Menú CN: guardar/abrir archivo .cn
  onSaveCn?: () => void;
  onOpenCn?: (file: File) => void;
  /** v1.97.0 · preferencia de arranque: vacía (default) o seguir donde lo dejé. */
  modoArranque?: "vacio" | "restaurar";
  onCambiarArranque?: () => void;
  /** v1.97.0 · recupera el árbol estacionado por el ARRANQUE LIMPIO (solo si hay uno). */
  onRestorePreviousWorkspace?: () => void;
  hayWorkspacePrevio?: boolean;
  // 🔧 Modo Web Editor (vista dedicada pantalla completa)
  activeView?: "ide" | "web-editor";
  onToggleWebEditor?: () => void;
  // 🔧 Estado de streaming para animar el cerebro (idle/thinking/exploding)
  isStreaming?: boolean;
  // 🔧 Selector de fondo de pantalla (imagen del cerebro)
  onOpenBgPicker?: () => void;
  hasCustomBg?: boolean;
  onClearBg?: () => void;
  // 🔧 Monitor de recursos en vivo (CPU/RAM del server)
  systemStats?: {
    ide: { rssMb: number; heapUsedMb: number; cpuPercent: number; uptimeSec: number; pid?: number };
    sandbox: { running: boolean };
    machine?: { cpuPercent: number | null; totalRamMb: number; freeRamMb: number; cores: number };
  } | null;
  // 🔧 Puntos de restauración (snapshots). ADVERTENCIA v1.72.0: estos tres props
  // llegan desde App con datos reales, pero este componente NO los renderiza
  // desde v1.0.3 (el botón se quitó por petición del usuario). Se conservan como
  // cableado para reabrir el panel sin tocar App; mientras no se rendericen, la
  // funcionalidad solo existe por CLI (npm run snapshot / verificar / revertir).
  // Antes existía además onShowSnapshotsPanel, que abría un panel inexistente:
  // fuera, junto con el estado showSnapshotsPanel de App.
  snapshots?: { id: string; label: string; createdAt: number; files: { length: number } }[];
  onRestoreSnapshot?: (id: string) => void;
  onDeleteSnapshot?: (id: string) => void;
  // 🔧 Exportar a Markdown / Informe Técnico
  onCreateSnapshot?: () => void;
  onExportMarkdown?: () => void;
  // 🔧 Panel de Configuración
  onOpenConfig?: () => void;
  // v1.1 — Reabrir el asistente de bienvenida Z.ai (GLM-4.5-Flash gratis)
  onOpenZaiWizard?: () => void;
  zaiApiKey?: string;
  // 🔧 Indicador SLM (modelo pequeño detectado)
  isSLM?: boolean;
  slmCategory?: "nano" | "small" | "medium" | "unknown";
  slmParams?: number | null;
  // ============================================================
  // v2.0 — Controles nuevos del híbrido
  // ============================================================
  /** v1.9 — tamaño global de texto (14-25 px) */
  appFontSize?: number;
  onAppFontSizeChange?: (size: number) => void;
  /**
   * v2.0 — «Modo 8 GB» (sin blur ni animaciones). v1.99.8: se ve como MODO LIVIANO y pasó a tres
   * estados (auto / liviano / pleno) porque la decisión depende de la RAM MEDIDA.
   */
  perfMode?: ModoPerf;
  onPerfModeChange?: (mode: ModoPerf) => void;
  /** La decisión ya tomada en App (fuente única: `decidirModoPerf`), para no reimplementar el criterio acá. */
  perf?: DecisiónPerf | null;
  /** v2.0 — Abrir el gestor de extensiones */
  onOpenExtensions?: () => void;
  extensionCount?: number;
  /** v2.0 — Abrir el panel de configuración PRO (menú de la 1.8) */
  onOpenProConfig?: () => void;
  /** v2.0 — Pantalla completa real (el botón que faltaba) */
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  /**
   * v2.0 — Memoria de conversación: cuántos mensajes recientes se envían
   * íntegros al modelo (el resto se resume automáticamente). 0 = compacta.
   */
  historyWindow?: number;
  onHistoryWindowChange?: (n: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentModel,
  onOpenModelSelector,
  onOpenApiKeys,
  telemetry,
  workspaceFileCount,
  onDownloadZip,
  isLeftOpen,
  onToggleLeft,
  isRightOpen,
  onToggleRight,
  isSoundMuted,
  onToggleSound,
  ramUsageMb = 78,
  maxRamGb = 8,
  responseLanguage,
  onLanguageChange,
  expertMode,
  onExpertModeChange,
  onSaveCn,
  onOpenCn, onRestorePreviousWorkspace, hayWorkspacePrevio, modoArranque, onCambiarArranque,
  activeView = "ide",
  onToggleWebEditor,
  isStreaming = false,
  onOpenBgPicker,
  hasCustomBg = false,
  onClearBg,
  systemStats = null,
  snapshots = [],
  onRestoreSnapshot,
  onDeleteSnapshot,
  onExportMarkdown,
  onCreateSnapshot,
  onOpenConfig,
  onOpenZaiWizard,
  appFontSize = 15,
  onAppFontSizeChange,
  perfMode = "auto",
  perf = null,
  onPerfModeChange,
  onOpenExtensions,
  extensionCount = 0,
  onOpenProConfig,
  onToggleFullscreen,
  isFullscreen = false,
  historyWindow = 60,
  onHistoryWindowChange,
  zaiApiKey = "",
  isSLM = false,
  slmCategory = "unknown",
  slmParams = null,
}) => {
  // 🔧 Menú desplegable "CN" con Guardar / Abrir archivo .cn
  const [cnMenuOpen, setCnMenuOpen] = useState(false);
  const [cnSnapsOpen, setCnSnapsOpen] = useState(false);
  const [consejoAbierto, setConsejoAbierto] = useState(false); // CONSEJO v1
  // v1.86.4 · SALUD MEDIDA — hasta hoy esta línea decía «motor listo» siempre,
  // fuera cual fuese el estado del proceso del 3000: era un literal que dependía
  // solo de `isStreaming`. Con el server colgado, la cabecera siguió diciendo
  // «listo» mientras la espina avisaba de que no contestaba. Ahora el texto sale
  // del último GET /api/coreo comprobado (ver src/engine/latido.ts).
  const latido = useLatido();
  // v1.73.0 · TURBO SIEMPRE ACTIVO — «dejalo siempre activo y quita el boton».
  // El interruptor desaparece de la barra Y del localStorage: ahora el motor
  // nace con TURBO_MOTOR=true (src/engine/reflejo/espejos.ts) y el POST
  // /api/consejo/turbo dejó de llamarse. Nada que activar: ya está activado.
  /**
   * v2.3.1 · EL MISMO CRITERIO PARA LOS CUATRO CHIPS.
   * Cada chip tenía su propio ternario de etiqueta (OK en un caso, OFF en el otro), y el `:11434`
   * además decía «LOCAL» cuando estaba apagado: cuatro etiquetas para una sola
   * pregunta. Ahora los cuatro pasan por `decidirIndicador`, y mientras la
   * telemetría no llegó (`medido: false`, ver App.tsx) los cuatro dicen «—» en
   * lugar de repartir mentiras verdes y rojas.
   */
  const chipPuerto = (vivo: boolean) => etiquetaDeIndicador({ medido: telemetry.medido === true, vivo });

  /**
   * v2.3.9 · EL CHIP DEL MOTOR DEL CEREBRO (:5103) — y por qué NO es igual a los otros seis.
   *
   * Mario lo pidió así: «añadidlo a la barra de estado como 5103, así si se corta o
   * pasa algo que indique con rojo al igual que los demás que están en verde, si se
   * cortan quedan rojos, ¿no? que sea así».
   *
   * Y tiene razón en lo que importa: un órgano que estaba vivo y se cayó tiene que
   * GRITAR. Pero el :5103 no nace con la IDE — lo levanta el motor BAJO DEMANDA, así
   * que «apagado» es su estado normal hasta que alguien lo despierta. Pintarlo rojo
   * desde el primer segundo sería una alarma permanente por un órgano que está
   * apagado a propósito, y una alarma que siempre suena deja de ser una alarma.
   *
   * De ahí los TRES estados, con memoria de lo que se vio:
   *   · vivo            → verde (OK)
   *   · nunca estuvo    → gris «—» (bajo demanda, no es un fallo)
   *   · estuvo y se cayó→ ROJO «CAÍDO» (esto es lo que pediste, y es lo que avisa)
   *
   * La memoria vive en un ref: sobrevive a los re-renders y no provoca uno extra.
   * Si el usuario recarga la IDE, el ref nace vacío y el chip vuelve a gris hasta
   * que el motor lo despierte — que es exactamente la verdad de ese momento.
   */
  const estuvoVivo5103 = useRef(false);
  const vivo5103 = telemetry.port5103 === true;
  if (vivo5103) estuvoVivo5103.current = true;
  const estado5103: "vivo" | "bajo-demanda" | "caido" =
    vivo5103 ? "vivo" : estuvoVivo5103.current ? "caido" : "bajo-demanda";
  const etiqueta5103 =
    estado5103 === "vivo" ? "OK" : estado5103 === "caido" ? "CAÍDO" : "—";
  const titulo5103 =
    estado5103 === "vivo"
      ? "Puerto 5103: motor del cerebro (cerebro_motor.py) — guarda hechos y páginas en .cerebro-db/"
      : estado5103 === "caido"
      ? "Puerto 5103: el motor del cerebro ESTABA VIVO y dejó de responder. Revisa el proceso cerebro_motor.py."
      : "Puerto 5103: motor del cerebro — apagado (nace bajo demanda; se enciende cuando el motor lo necesita)";

  const cnMenuRef = useRef<HTMLDivElement>(null);
  const cnFileInputRef = useRef<HTMLInputElement>(null);

  // Cerrar el menú CN al hacer clic fuera
  //
  // v1.98.0 · «la función de tts no abre el cambiador de voces»: el gatillo de voz
  // vive DENTRO de este menú (Header:520) pero su tarjeta se portal-ea a `body`
  // (TtsSelector:251), así que cae fuera de `cnMenuRef`. Con la guarda de antes, el
  // primer mousedown dentro de la tarjeta —arrastrar el tono, abrir la lista de
  // voces, pulsar «probar esta voz»— era un clic «afuera»: el menú se cerraba, se
  // desmontaba el `TtsSelector` y la tarjeta desaparecía con él. Parecía que el
  // cambiador no abría. Las tarjetas flotantes se anuncian con
  // `data-cn-tarjeta-flotante` y un clic dentro de una NO es un clic afuera.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const blanco = e.target as Node | null;
      if (cnMenuRef.current && !cnMenuRef.current.contains(blanco) && !esTarjetaFlotante(blanco as Element)) {
        setCnMenuOpen(false);
      }
    };
    if (cnMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [cnMenuOpen]);

  return (
    // v2.3.1 — `h-14` fijo + `justify-between` SIN envolvente: en cuanto la suma
    // de chips superaba el ancho disponible, la sección derecha (Config, Volver…)
    // se salía del viewport y el recorte la ocultaba: botones que "desaparecen
    // hacia la derecha". Con `flex-wrap` + `min-h-14` nada puede perderse — la
    // cabecera gana una fila y todo queda alcanzable a cualquier ancho.
    <header data-cn="cabecera" data-cn-topbar className="min-h-12 bg-[#03060c]/80 backdrop-blur-md border-b border-[#121a2c] px-2.5 py-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs select-text z-30 shrink-0 shadow-sm overflow-visible">
      {/* Left Section: Branding & Toggle Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleLeft}
          title={isLeftOpen ? "Ocultar panel izquierdo" : "Mostrar panel izquierdo"}
          className={`p-1.5 rounded-lg border transition-all ${
            isLeftOpen
              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              : "bg-[#080d1a] border-[#141d2e] text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* 🔧 Branding con icono de cerebro animado + "CerebroNico V0.9"
            + Menú desplegable CN (Guardar / Abrir archivo .cn / Fondo) */}
        <div className="relative" ref={cnMenuRef}>
          <button
            onClick={() => setCnMenuOpen((v) => !v)}
            /* v8.0.1 — CUARTO foco de versión, cazado en la auditoría de la
               discrepancia «cabecera V8.0.0 / menú CN V1.0.3»: este `title`
               llevaba un literal «V1.0.3» incrustado que la regla de fuente
               única nunca tocó, porque vive en un atributo y no en texto
               visible. Un atributo también se lee: basta pasar el ratón. */
            title={`Menú principal — ${IDE_BRAND.FULL_NAME}: archivos .cn, fondo, paleta de colores, PRO y Config`}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md shadow-inner transition-all ${
              cnMenuOpen
                ? "bg-cyan-500/20 border border-cyan-400/60"
                : "bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border border-cyan-500/40 hover:border-cyan-400"
            }`}
          >
            {/* ============================================================
                v0.9 — EL ICONO DEL PRODUCTO, EN LA ESQUINA VISIBLE
                ------------------------------------------------------------
                El arte real del cerebro-chip —el MISMO maestro del que sale
                `build/icon.ico`, o sea el que llevará el EXE— puesto en el
                extremo superior izquierdo. Se elige esta esquina por dos razones
                concretas: es la que se ve SIEMPRE, incluso en la pantalla de
                bienvenida sin ningún chat abierto, y el botón que la contiene ya
                abre el menú CN, así que el icono queda además pulsable sin añadir
                ni un control nuevo.
                ============================================================ */}
            <img
              src="/icono-cerebronico.png"
              alt={`Icono de ${IDE_BRAND.FULL_NAME}`}
              title={IDE_BRAND.FULL_NAME}
              width={22}
              height={22}
              draggable={false}
              className="shrink-0 rounded-[5px] ring-1 ring-cyan-500/40 shadow-[0_0_8px_rgba(34,211,238,0.25)]"
            />

            {/* 🧠 Icono de cerebro animado: cambia según estado de streaming.
                NO se sustituye por el icono de arriba: éste es el INDICADOR DE
                ACTIVIDAD (idle / exploding) y ya funcionaba. Cambiar la marca por
                el estado habría sido perder una señal para ganar un adorno. */}
            <BrainThinkingIcon
              state={isStreaming ? "exploding" : "idle"}
              size={22}
            />
            <div className="flex items-baseline gap-1.5 leading-none">
              {/* v1.6.16 — «lo que está chico es el nombre principal de
                  CerebróNico V…». Correcto: era `text-xs`, 12 px, el MISMO
                  tamaño que cualquier etiqueta secundaria del panel. El nombre
                  del producto es el título de más rango de toda la aplicación,
                  así que pasa al papel más alto de la escala. Es justo lo
                  contrario del resto: aquí no se achica, se jerarquiza. */}
              <span className="cn-hero tracking-tight text-white font-mono whitespace-nowrap">
                {IDE_BRAND.NAME}{" "}
                <span className="text-cyan-400 cn-meta font-sans font-semibold">{IDE_BRAND.VERSION}</span>
              </span>
              <span
                className={`text-[10px] font-mono leading-none whitespace-nowrap ${
                  latido.vivo === false ? "text-red-400 font-semibold" : "text-zinc-400"
                }`}
                title={
                  latido.vivo === false
                    ? latido.chip || "el servidor local del IDE no responde a GET /api/coreo"
                    : latido.vivo === null
                    ? "aún no se leyó /api/coreo"
                    : "servidor local respondiendo"
                }
              >
                {textoCabecera(latido.vivo, isStreaming)}
              </span>
            </div>
            <ChevronDown className={`w-3 h-3 text-cyan-300 transition-transform ${cnMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Menú desplegable CN */}
          {cnMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-72 bg-[#0a0f1c] border border-cyan-500/40 rounded-xl shadow-2xl shadow-cyan-950/50 z-[100] overflow-hidden">
              <div className="px-3 py-2 bg-[#0d1426] border-b border-[#1a2540]">
                <div className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider flex items-center gap-1.5">
                  <FileBox className="w-3 h-3" />
                  {/* v2.3 — desde la fuente única (IDE_BRAND): el literal «V2.1»
                      de aquí es exactamente el tipo de segunda fuente que
                      miente cuando sube la versión. */}
                  Menú CN — {IDE_BRAND.FULL_NAME}
                </div>
                <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">
                  Archivos .cn (contenedor ZIP) y personalización visual.
                </p>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    if (onSaveCn) onSaveCn();
                  }}
                  disabled={!onSaveCn}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-cyan-500/10 text-zinc-200 hover:text-cyan-300 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Guardar workspace completo como archivo .cn (ZIP con manifest)"
                >
                  <Save className="w-3.5 h-3.5 text-cyan-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Guardar .cn</span>
                    <span className="text-[9px] text-zinc-500">Empaqueta workspace como ZIP</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    cnFileInputRef.current?.click();
                  }}
                  disabled={!onOpenCn}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-cyan-500/10 text-zinc-200 hover:text-cyan-300 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Abrir archivo .cn (o .zip) y restaurar el workspace completo"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Abrir .cn / .zip</span>
                    <span className="text-[9px] text-zinc-500">Restaura workspace desde ZIP</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    onDownloadZip();
                  }}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-emerald-500/10 text-zinc-200 hover:text-emerald-300 transition-colors flex items-center gap-2"
                  title="Descargar workspace como ZIP estándar (sin manifest)"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Descargar ZIP</span>
                    <span className="text-[9px] text-zinc-500">ZIP estándar (sin manifest)</span>
                  </div>
                </button>
                {onRestorePreviousWorkspace && hayWorkspacePrevio && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onRestorePreviousWorkspace();
                    }}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-amber-500/10 text-zinc-200 hover:text-amber-300 transition-colors flex items-center gap-2"
                    title="Árbol de la sesión anterior, estacionado al abrir vacía (no se borró)"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Recuperar workspace anterior</span>
                      <span className="text-[9px] text-zinc-500">Lo que había al abrir esta ventana</span>
                    </div>
                  </button>
                )}
                {onCambiarArranque && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onCambiarArranque();
                    }}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-cyan-500/10 text-zinc-200 hover:text-cyan-300 transition-colors flex items-center gap-2"
                    title={modoArranque === "restaurar" ? "Ahora restaura el chat y el árbol al abrir" : "Ahora abre la ventana vacía (lo anterior queda guardado)"}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Al abrir: {modoArranque === "restaurar" ? "donde lo dejé" : "ventana vacía"}</span>
                      <span className="text-[9px] text-zinc-500">Clic para alternar · rige la próxima apertura</span>
                    </div>
                  </button>
                )}

                {/* Separador */}
                <div className="my-1 border-t border-[#1a2540]" />

                {/* ══════════════════════════════════════════════════════════
                    v1.73.0 · AJUSTES RÁPIDOS — la limpieza que pidió Mario:
                    «quiero que la mayor parte de opciones queden dentro del
                    menú desplegable, así la interfaz queda más limpia». Todo
                    lo que dejó la barra superior vive aquí, con los MISMOS
                    handlers de antes: ningún control se perdió, solo mudó de
                    casa. TURBO no está porque ya no es un control: está
                    siempre activo en el motor (espejos.ts).
                    ══════════════════════════════════════════════════════════ */}
                <div className="px-2.5 pb-1">
                  <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Ajustes rápidos</div>
                </div>

                {/* Tamaño global de texto: escala TODA la app (todo usa rem) */}
                {onAppFontSizeChange && (
                  <div className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md hover:bg-cyan-500/10 transition-colors" title="Tamaño de texto de toda la interfaz (14-25px)">
                    <Type className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-[11px] text-zinc-200 shrink-0">Tamaño texto</span>
                    <select
                      value={appFontSize}
                      onChange={(e) => onAppFontSizeChange(Number(e.target.value))}
                      className="ml-auto bg-[#0a1120] border border-[#1a2540] rounded px-1.5 py-0.5 text-[11px] text-zinc-300 outline-none cursor-pointer"
                    >
                      {APP_FONT_SIZES.map((s) => (
                        <option key={s} value={s} className="bg-[#0a0f1a]">
                          {APP_FONT_SIZE_LABELS[s] || `${s}px`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Memoria de conversación: los más antiguos se resumen solos */}
                {onHistoryWindowChange && (
                  <div
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md hover:bg-amber-500/10 transition-colors"
                    title="Cuántos mensajes recientes se envían íntegros al modelo. Los anteriores se resumen automáticamente (el modelo sigue 'recordando')."
                  >
                    <History className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[11px] text-zinc-200 shrink-0">Memoria</span>
                    <select
                      value={historyWindow}
                      onChange={(e) => onHistoryWindowChange(Number(e.target.value))}
                      className="ml-auto bg-[#0a1120] border border-[#1a2540] rounded px-1.5 py-0.5 text-[11px] text-zinc-300 outline-none cursor-pointer"
                    >
                      <option value={20} className="bg-[#0a0f1a]">20 msj</option>
                      <option value={40} className="bg-[#0a0f1a]">40 msj</option>
                      <option value={60} className="bg-[#0a0f1a]">60 msj</option>
                      <option value={100} className="bg-[#0a0f1a]">100 msj</option>
                      <option value={200} className="bg-[#0a0f1a]">200 msj</option>
                      <option value={1000} className="bg-[#0a0f1a]">Todo</option>
                    </select>
                  </div>
                )}

                {/* v1.99.8 · MODO LIVIANO (antes «Modo 8 GB»). El rótulo dice qué estado fijaste;
                    el tooltip dice cuánta RAM MIDIO el server y por qué se aplica o no. Clic:
                    automático → liviano → pleno → automático. */}
                {onPerfModeChange && (
                  <button
                    onClick={() => onPerfModeChange(siguientePerf(perfMode))}
                    className={`w-full px-2.5 py-2 text-left rounded-md hover:bg-emerald-500/10 transition-colors flex items-center gap-2 ${estaLiviano(perf, perfMode) ? "text-emerald-300" : "text-zinc-200"}`}
                    title={perf?.tooltip ?? "Modo liviano: quita el desenfoque de paneles y las animaciones de fondo. En automático se decide con la RAM medida de la máquina."}
                  >
                    <Gauge className={`w-3.5 h-3.5 ${estaLiviano(perf, perfMode) ? "text-emerald-400" : "text-zinc-400"}`} />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">{perf?.rotuloChip ?? "Automático"} {estaLiviano(perf, perfMode) ? "✓" : ""}</span>
                      <span className="text-[9px] text-zinc-500">{perf ? `RAM de la máquina: ${perf.totalGb ?? "?"} GB · umbral ${perf.equipoLimitado ? "alcanzado" : "sin alcanzar"}` : "Sin blur ni animaciones: inferencia más fluida"}</span>
                    </div>
                  </button>
                )}

                {/* CONSEJO v1 — «no encontré el botón de los 10 agentes y las 18 más» */}
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    setTimeout(() => setConsejoAbierto(true), 60);
                  }}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-emerald-500/10 text-zinc-200 hover:text-emerald-300 transition-colors flex items-center gap-2"
                  title="Consejo Agéntico: espejos, grupos de trabajo y herramientas dormidas — activar/dormir"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Consejo Agéntico</span>
                    <span className="text-[9px] text-zinc-500">Los 10 agentes y las herramientas dormidas</span>
                  </div>
                </button>

                {/* v1.1 — Reabrir el asistente Z.ai (GLM-4.5-Flash gratis) */}
                {onOpenZaiWizard && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onOpenZaiWizard();
                    }}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-violet-500/10 text-zinc-200 transition-colors flex items-center gap-2"
                    title={zaiApiKey ? "Z.ai GLM-4.5-Flash está configurado y listo. Clic para cambiar la clave." : "Configurar Z.ai (GLM-4.5-Flash) — 100% GRATIS, sin tarjeta"}
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${zaiApiKey ? "text-emerald-400" : "text-violet-300"}`} />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Z.ai {zaiApiKey ? "✓" : "GRATIS"}</span>
                      <span className="text-[9px] text-zinc-500">{zaiApiKey ? "GLM-4.5-Flash configurado" : "Configurar GLM-4.5-Flash gratis"}</span>
                    </div>
                  </button>
                )}

                {/* TTS v1.15.0 → v1.73.0: el selector de voz bajó del centro de
                    la barra a este menú. Misma voz, mismo estado compartido. */}
                <div className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md hover:bg-cyan-500/10 transition-colors">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-[11px] text-zinc-200 shrink-0">Voz</span>
                  <div className="ml-auto"><TtsSelector /></div>
                </div>

                {/* v1.73.0 — «Ambiente ON» y su slider ya NO flotan abajo a la
                    izquierda (la X roja de `areglo.jpg`). El sonido sigue
                    existiendo: este botón lo enciende/apaga vía evento, y el
                    AudioAmbiente oculto lo reproduce con el volumen guardado. */}
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("cerebronico:ambiente-toggle"));
                  }}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-violet-500/10 text-zinc-200 transition-colors flex items-center gap-2"
                  title="Sonido de ambiente (misterio/investigación): enciende o apaga el bucle. El volumen se ajusta con el control que aparece al encender."
                >
                  <Music2 className="w-3.5 h-3.5 text-violet-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Sonido ambiente</span>
                    <span className="text-[9px] text-zinc-500">Encender / apagar el bucle de fondo</span>
                  </div>
                </button>

                {/* Separador */}
                <div className="my-1 border-t border-[#1a2540]" />

                {/* 🔧 Sección de fondo de pantalla */}
                {onOpenBgPicker && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onOpenBgPicker();
                    }}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-violet-500/10 text-zinc-200 hover:text-violet-300 transition-colors flex items-center gap-2"
                    title="Subir una imagen (ej: cerebro.jpg) como fondo de pantalla del IDE"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Cambiar fondo de pantalla</span>
                      <span className="text-[9px] text-zinc-500">
                        {hasCustomBg ? "Fondo activo — clic para cambiar" : "Subir imagen (PNG/JPG)"}
                      </span>
                    </div>
                  </button>
                )}
                {hasCustomBg && onClearBg && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onClearBg();
                    }}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-red-500/10 text-zinc-200 hover:text-red-300 transition-colors flex items-center gap-2"
                    title="Quitar el fondo de pantalla personalizado"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-red-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Quitar fondo</span>
                      <span className="text-[9px] text-zinc-500">Vuelve al fondo oscuro</span>
                    </div>
                  </button>
                )}

                {/* v1.0.3 — Separador antes de los reubicados desde la barra superior */}
                <div className="my-1 border-t border-[#1a2540]" />

                {/* 🟢 REUBICADO — Paleta de colores (Aspecto del texto por sección) */}
                <button
                  onClick={() => {
                    setCnMenuOpen(false);
                    // Le damos un tick al navegador para que cierre el menú y posicione
                    // el portal de PanelAspecto sin que el backdrop lo tape.
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent("cerebronico:abrir-aspecto"));
                    }, 60);
                  }}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-cyan-500/10 text-zinc-200 hover:text-cyan-300 transition-colors flex items-center gap-2"
                  title="Paleta de colores: fuente, tamaño y color del texto por sección"
                >
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Paleta de colores</span>
                    <span className="text-[9px] text-zinc-500">Aspecto del texto por sección</span>
                  </div>
                </button>

                {/* 🟢 REUBICADO — Configuración PRO (apariencia, fondo, IA, red…) */}
                {onOpenProConfig && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onOpenProConfig();
                    }}
                    disabled={!onOpenProConfig}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-violet-500/10 text-zinc-200 hover:text-violet-300 transition-colors flex items-center gap-2 disabled:opacity-40"
                    title="Configuración PRO: apariencia, fondo, editor, IA, red, rendimiento y datos"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Configuración PRO</span>
                      <span className="text-[9px] text-zinc-500">Apariencia · IA · red · rendimiento</span>
                    </div>
                  </button>
                )}

                {/* 🟢 REUBICADO — Panel de Configuración (motores, puertos, SLM) */}

                {/* ============================================================
                    v1.72.1 · PUNTOS DE RESTAURACIÓN DEVUELTOS A LA INTERFAZ.
                    El boton de la barra se quito en v1.0.3 por peticion, y el
                    comentario del menu prometia que «sigue accesible desde el
                    menu CN»: no era cierto, el menu no tenia la entrada. Los
                    handlers de App (restaurar/borrar) ya existian y ya traen
                    confirmacion + snapshot de seguridad; solo estaban sordos.
                    Se abre como seccion plegable dentro del mismo menu: no nace
                    ningun panel flotante ni columna nueva, que es la regla de
                    esta casa (pantalla principal limpia, chat al centro).
                    ============================================================ */}
                <div className="my-1 border-t border-[#1a2540]" />
                <button
                  onClick={() => setCnSnapsOpen((v) => !v)}
                  className="w-full px-2.5 py-2 text-left rounded-md hover:bg-amber-500/10 text-zinc-200 hover:text-amber-300 transition-colors flex items-center gap-2"
                  title="Puntos de restauracion del workspace (snapshots)"
                >
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  <div className="flex flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold">Puntos de restauracion</span>
                    <span className="text-[9px] text-zinc-500">
                      {snapshots.length > 0 ? snapshots.length + " guardado(s)" : "ninguno guardado todavia"}
                    </span>
                  </div>
                  <ChevronDown className={"w-3 h-3 ml-auto text-zinc-500 transition-transform " + (cnSnapsOpen ? "rotate-180" : "")} />
                </button>
                {cnSnapsOpen && (
                  <div className="pl-2 pr-1 pb-1 max-h-56 overflow-y-auto custom-scrollbar">
                    {onCreateSnapshot && (
                      <button
                        onClick={() => onCreateSnapshot()}
                        className="w-full px-2 py-1.5 mb-1 text-left rounded border border-amber-700/40 bg-amber-900/20 hover:bg-amber-800/30 text-amber-200 text-[10px] font-mono transition-colors"
                        title="Guardar el estado actual del workspace como punto de restauracion"
                      >
                        + Guardar punto ahora
                      </button>
                    )}
                    {snapshots.length === 0 && (
                      <p className="px-2 py-1 text-[9px] text-zinc-600 leading-relaxed">
                        Todavia no hay puntos. Se crean solos al importar .cn, vaciar el
                        workspace o restaurar plantilla, y antes de cada restauracion.
                      </p>
                    )}
                    {snapshots.map((s) => (
                      <div key={s.id} className="px-2 py-1.5 rounded hover:bg-[#0d1526] group">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-zinc-200 truncate" title={s.label}>{s.label}</span>
                          <span className="text-[9px] text-zinc-600 ml-auto shrink-0">
                            {new Date(s.createdAt).toLocaleString()} · {s.files.length} arch.
                          </span>
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          <button
                            onClick={() => onRestoreSnapshot && onRestoreSnapshot(s.id)}
                            className="px-1.5 py-0.5 rounded bg-amber-700/40 hover:bg-amber-600/50 text-amber-100 text-[9px] font-mono"
                            title="Reemplazar el workspace por este punto (crea antes un punto del estado actual)"
                          >
                            Restaurar
                          </button>
                          <button
                            onClick={() => onDeleteSnapshot && onDeleteSnapshot(s.id)}
                            className="px-1.5 py-0.5 rounded bg-[#2a1418] hover:bg-[#3d1c22] text-red-300 text-[9px] font-mono"
                            title="Borrar este punto de restauracion"
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {onOpenConfig && (
                  <button
                    onClick={() => {
                      setCnMenuOpen(false);
                      onOpenConfig();
                    }}
                    disabled={!onOpenConfig}
                    className="w-full px-2.5 py-2 text-left rounded-md hover:bg-emerald-500/10 text-zinc-200 hover:text-emerald-300 transition-colors flex items-center gap-2 disabled:opacity-40"
                    title="Panel de Control y Compatibilidad — motores, puertos, SLM, apariencia"
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-400" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-semibold">Panel de Configuración</span>
                      <span className="text-[9px] text-zinc-500">Motores · puertos · SLM</span>
                    </div>
                  </button>
                )}
              </div>
              <div className="px-3 py-1.5 bg-[#04060d] border-t border-[#141d2e]">
                <p className="text-[9px] text-zinc-600 font-mono leading-relaxed">
                  💡 Tip: renombra un .cn a .zip para inspeccionarlo en cualquier explorador.
                </p>
              </div>
              {/* 🔧 Input oculto eliminado de aquí — ahora vive fuera del bloque condicional
                  (ver más abajo) para que funcione el .click() incluso cuando el menú está cerrado. */}
            </div>
          )}
          {/* 🔧 Input oculto para Abrir .cn — FUERA del bloque condicional del menú
              para que siga existiendo cuando el menú se cierra. Antes estaba dentro
              de {cnMenuOpen && (...)}, lo que hacía que se desmontara al cerrar el
              menú y el .click() no funcionaba. */}
          <input
            ref={cnFileInputRef}
            type="file"
            accept={`.${IDE_BRAND.EXTENSION},.zip,.json,application/zip,application/json,application/x-zip-compressed`}
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked && onOpenCn) onOpenCn(picked);
              e.target.value = "";
            }}
          />
        </div>

      </div>

      {/* Center Section: Ports Telemetry + Monitor + Snapshots */}
      {/* 🔧 Eliminados del Header para liberar espacio:
          - Selector de modelos (ya está en el chat)
          - Botón "Ranuras API" (ya está en LeftSidebar "Abrir Ranuras")
          - Selector de idioma (poco uso)
          - Selector de modo experto (poco uso)
          - Contador de archivos (poco uso)
          - Botón de sonido (poco uso) */}
      <div className="flex items-center gap-2">
        {/* Port Status Indicators */}
        <div className="hidden lg:flex items-center gap-1.5 bg-[#060a14] border border-[#141d2e] px-2.5 py-1 rounded-lg">
          {/* v1.0.2 · COMODIDAD/HONESTIDAD: `telemetria.ts` ya devuelve `incompleto`
              y `motivos` cuando una tanda de sondeos se perdió o una sonda no
              contesto (CPU al 100 %), y `App.tsx` los guarda con el `...data`.
              Nadie los mostraba: el chip pintaba el ULTIMO valor medido como si
              fuera el de ahora mismo. Un cartelito alcanza para que el usuario sepa
              que esa foto esta viciada, sin inventar una sonda nueva.
              Va con <span>: `reglasDeLaCasa.test.ts:134` prohibe el Fragmento
              abreviado en este proyecto. */}
          {(telemetry.incompleto || (telemetry.motivos && Object.keys(telemetry.motivos).length > 0)) ? (
            <span
              title={`La última tanda de sondeos salió incompleta (CPU saturado o sonda sin respuesta). ${
                (telemetry.heredados && telemetry.heredados.length)
                  ? `Vienen heredados de la medición anterior: ${telemetry.heredados.map((k) => `:${k.replace("port", "")}`).join(" ")}.`
                  : "Algún chip muestra el último valor realmente medido, no el de ahora mismo."
              }`}
              className="font-mono text-[8px] tracking-widest px-1 rounded text-amber-400 bg-amber-500/10 border border-amber-500/30"
            >
              MUESTRA PARCIAL{(telemetry.heredados && telemetry.heredados.length) ? ` (${telemetry.heredados.length})` : ""}
            </span>
          ) : null}
          {/* Port 3000 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 3000: IDE — interfaz + API /api/* (esta misma ventana)"
          >
            <Server className={`w-3 h-3 ${telemetry.port3000 ? "text-emerald-400" : "text-zinc-500"}`} />
            <span className={telemetry.port3000 ? "text-emerald-400" : "text-zinc-400"}>:3000</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port3000 ? "bg-emerald-500/20 text-emerald-300" : "bg-[#0b101c] text-zinc-500"}`}>
              {chipPuerto(telemetry.port3000)}
            </span>
          </div>

{/* Port 3500 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 3500: Sandbox / previsualización del proyecto (jamás el 3000)"
          >
            <Server className={`w-3 h-3 ${telemetry.port3500 ? "text-emerald-400" : "text-zinc-500"}`} />
            <span className={telemetry.port3500 ? "text-emerald-400" : "text-zinc-400"}>:3500</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port3500 ? "bg-emerald-500/20 text-emerald-300" : "bg-[#0b101c] text-zinc-500"}`}>
              {chipPuerto(telemetry.port3500)}
            </span>
          </div>

{/* Port 5000 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 5000: Puente PC (agent_bridge_5000.py) — archivos y comandos reales"
          >
            <Server className={`w-3 h-3 ${telemetry.port5000 ? "text-emerald-400" : "text-zinc-500"}`} />
            <span className={telemetry.port5000 ? "text-emerald-400" : "text-zinc-400"}>:5000</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port5000 ? "bg-emerald-500/20 text-emerald-300" : "bg-[#0b101c] text-zinc-500"}`}>
              {chipPuerto(telemetry.port5000)}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Port 11434 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 11434: Ollama Local Inferencia"
          >
            <Radio className={`w-3 h-3 ${telemetry.port11434 ? "text-cyan-400" : "text-amber-500"}`} />
            <span className={telemetry.port11434 ? "text-cyan-400" : "text-amber-400"}>:11434</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port11434 ? "bg-cyan-500/20 text-cyan-300" : "bg-amber-500/20 text-amber-300"}`}>
              {chipPuerto(telemetry.port11434)}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Port 5100 — v1.43.0 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 5100: Memoria híbrida (hindsight)"
          >
            <Brain className={`w-3 h-3 ${telemetry.port5100 ? "text-cyan-400" : "text-zinc-500"}`} />
            <span className={telemetry.port5100 ? "text-cyan-400" : "text-zinc-400"}>:5100</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port5100 ? "bg-cyan-500/20 text-cyan-300" : "bg-[#0b101c] text-zinc-500"}`}>
              {chipPuerto(telemetry.port5100)}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* Port 5102 — v1.43.0 */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title="Puerto 5102: Creador de sitios web"
          >
            <Globe className={`w-3 h-3 ${telemetry.port5102 ? "text-cyan-400" : "text-zinc-500"}`} />
            <span className={telemetry.port5102 ? "text-cyan-400" : "text-zinc-400"}>:5102</span>
            <span className={`text-[9px] px-1 rounded ${telemetry.port5102 ? "bg-cyan-500/20 text-cyan-300" : "bg-[#0b101c] text-zinc-500"}`}>
              {chipPuerto(telemetry.port5102)}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* ============================================================
              v2.3.9 · Port 5103 — EL MOTOR DEL CEREBRO (pedido de Mario, 4/11)
              ------------------------------------------------------------
              «añadidlo a la barra de estado como 5103, así si se corta o pasa
              algo que indique con rojo al igual que los demás que están en
              verde, si se cortan quedan rojos, ¿no? que sea así».

              Tres estados, y el rojo es el que pediste:
                · vivo            → verde  OK
                · nunca arrancado → gris   —      (nace bajo demanda: no es fallo)
                · estuvo y cayó   → ROJO   CAÍDO  (esto es la alarma de verdad)

              El icono es Brain porque es el cerebro que GUARDA (hechos y
              páginas en .cerebro-db/), distinto del :5100 que solo consulta.
              ============================================================ */}
          <div
            className="flex items-center gap-1 font-mono text-[11px]"
            title={titulo5103}
          >
            <Brain
              className={`w-3 h-3 ${
                estado5103 === "vivo"
                  ? "text-emerald-400"
                  : estado5103 === "caido"
                  ? "text-red-400 animate-pulse"
                  : "text-zinc-500"
              }`}
            />
            <span
              className={
                estado5103 === "vivo"
                  ? "text-emerald-400"
                  : estado5103 === "caido"
                  ? "text-red-400 font-semibold"
                  : "text-zinc-400"
              }
            >
              :5103
            </span>
            <span
              className={`text-[9px] px-1 rounded ${
                estado5103 === "vivo"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : estado5103 === "caido"
                  ? "bg-red-500/25 text-red-300 font-bold"
                  : "bg-[#0b101c] text-zinc-500"
              }`}
            >
              {etiqueta5103}
            </span>
          </div>
        </div>

        {/* 🔧 MONITOR DE RECURSOS EN VIVO (CPU/RAM del server) */}
        {systemStats && (
          <div
            className="hidden lg:flex items-center gap-2 bg-[#060a14] border border-[#141d2e] px-2.5 py-1 rounded-lg text-zinc-400 font-mono text-[11px]"
            title={`IDE (proceso Node.js${systemStats.ide.pid ? `, PID ${systemStats.ide.pid}` : ""}): CPU ${systemStats.ide.cpuPercent}%, RAM ${systemStats.ide.rssMb} MB, uptime ${Math.floor(systemStats.ide.uptimeSec / 60)} min${systemStats.machine ? ` — PC (máquina real): CPU ${systemStats.machine.cpuPercent !== null ? systemStats.machine.cpuPercent.toFixed(1) : "…"}%, RAM libre ${systemStats.machine.freeRamMb} MB, ${systemStats.machine.cores} núcleos` : ""}`}
          >
            <Cpu className={`w-3 h-3 ${systemStats.ide.cpuPercent > 60 ? "text-red-400 animate-pulse" : systemStats.ide.cpuPercent > 30 ? "text-amber-400" : "text-emerald-400"}`} />
            {/* v1.6.22 — «IDE» y no «CPU»: el medidor lee el proceso Node de la app, no
                la máquina. La CPU real de la máquina va aparte, etiquetada «PC». */}
            <span className="text-zinc-500">IDE:</span>
            <span className={systemStats.ide.cpuPercent > 60 ? "text-red-400 font-bold" : "text-zinc-200"}>
              {systemStats.ide.cpuPercent.toFixed(1)}%
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-500">RAM:</span>
            <span className={systemStats.ide.heapUsedMb > 200 ? "text-amber-400" : "text-zinc-200"}>
              {systemStats.ide.heapUsedMb}M
            </span>
            {systemStats.machine ? (
              <>
                <span className="text-zinc-700">|</span>
                <span className="text-zinc-500">PC:</span>
                <span className={systemStats.machine.cpuPercent !== null && systemStats.machine.cpuPercent > 60 ? "text-red-400 font-bold" : "text-zinc-200"}>
                  {systemStats.machine.cpuPercent !== null ? `${systemStats.machine.cpuPercent.toFixed(1)}%` : "…"}
                </span>
              </>
            ) : null}
          </div>
        )}

        {/* 🔧 PUNTOS DE RESTAURACIÓN (snapshots) — v1.0.3 🔴 ELIMINADO de la barra
            por petición: estaba marcado con una X roja en la captura.
            LOS DATOS SIGUEN LLEGANDO POR PROPS (snapshots/onRestoreSnapshot/onDeleteSnapshot), pero aquí nadie los renderiza: hoy los puntos de
            restauración solo se manejan por CLI — npm run snapshot | verificar | cirugia |
            revertir. Reabrir el panel desde el menú CN queda como decisión de producto,
            no como olvido: ver el aviso en la declaración de props. */}

        {/* 🔧 EXPORTAR A MARKDOWN — v1.0.3 🔴 ELIMINADO de la barra por petición:
            estaba marcado con una X roja. Cualquier .md se puede descargar desde
            el árbol de archivos (LeftSidebar), así que este botón era duplicado.
            Se mantiene onExportMarkdown en props por si se quiere reactivar
            desde el menú CN, pero el botón ya no ocupa espacio en la barra. */}
      </div>

      {/* Right Section: controles que no son menú (lo que iba antes como Pro/Config/Paleta/ZIP ya está en el menú CN de la izquierda) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* v1.0.3 — Paleta oculta: el botón «A» ya no vive en la barra; se abre
            desde el menú CN con el evento cerebronico:abrir-aspecto. La
            mantenemos montada (envuelta en .hidden) para que el listener del
            evento siga activo y su portal funcione. */}
        <div className="hidden"><PanelAspecto /></div>

        {/* v1.73.0 · Tamaño de texto, memoria de conversación y modo 8 GB se
            movieron al menú CN (sección «Ajustes rápidos»). La barra superior
            quedó para branding, puertos, monitor, pantalla completa, editor
            web y paneles: lo demás se despliega. */}

        {/* v2.0 — Memoria de conversación: >50 mensajes atrás (60 por defecto).
            Los mensajes más antiguos se resumen automáticamente para que el
            contexto crezca sin que la respuesta se vuelva lenta. */}
        {onHistoryWindowChange && (
          <div
            className="hidden md:flex items-center gap-1 px-1.5 py-0.5 bg-[#060a14] border border-[#141d2e] rounded-md"
            title="Cuántos mensajes recientes se envían íntegros al modelo. Los anteriores se resumen automáticamente (el modelo sigue 'recordando')."
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={historyWindow}
              onChange={(e) => onHistoryWindowChange(Number(e.target.value))}
              className="bg-transparent text-[11px] text-zinc-300 outline-none cursor-pointer"
            >
              <option value={20} className="bg-[#0a0f1a]">20 msj</option>
              <option value={40} className="bg-[#0a0f1a]">40 msj</option>
              <option value={60} className="bg-[#0a0f1a]">60 msj</option>
              <option value={100} className="bg-[#0a0f1a]">100 msj</option>
              <option value={200} className="bg-[#0a0f1a]">200 msj</option>
              <option value={1000} className="bg-[#0a0f1a]">Todo</option>
            </select>
          </div>
        )}

        {/* v2.0 — Modo 8 GB: apaga backdrop-blur y animaciones infinitas */}
        {onPerfModeChange && (
          <button
            onClick={() => onPerfModeChange(siguientePerf(perfMode))}
            className={`hidden md:flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border font-mono text-[11px] transition-all ${
              perfMode === "8gb"
                ? "bg-emerald-950/40 text-emerald-300 border-emerald-700/60"
                : "bg-[#060a14] text-zinc-400 border-[#141d2e] hover:text-cyan-300"
            }`}
            title={perf?.tooltip ?? "Modo liviano: quita el desenfoque de paneles y las animaciones de fondo. En automático se decide con la RAM medida de la máquina."}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>{perf?.rotuloChip ?? "Autom\u00e1tico"}</span>
          </button>
        )}

        {/* v2.0 — Extensiones: cada panel se abre en su propia pestaña.
            v1.0.3 🔴 ELIMINADO de la barra por petición: era el botón con el
            símbolo de plugins (Puzzle) que estaba marcado con una X roja en la
            captura. La gestión de extensiones sigue siendo accesible desde el
            menú CN si hace falta. */}

        {/* v1.73.0 · LIMPIEZA DE LA BARRA (captura `areglo.jpg`):
            · «Consejo» y «Turbo» salieron de la barra. TURBO QUEDÓ SIEMPRE
              ACTIVO por decisión del usuario — ya no existe el interruptor.
            · Z.ai salió: la clave y el selector de motor viven en el selector
              de modelo del chat («en el selector ya está»). El asistente Z.ai
              se reabre desde el menú CN.
            · Tamaño de texto, memoria de conversación, modo 8 GB y selector de
              voz se movieron al menú CN. La barra conserva solo lo que se mira
              o se pulsa a cada rato. */}

        {/* v1.0.3 — 🔴 ELIMINADO de la barra: el botón Pro ya está dentro del menú CN. */}

        {/* v2.0 — PANTALLA COMPLETA (el botón que faltaba). F11 también funciona. */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="flex items-center gap-1.5 px-1.5 py-0.5 bg-[#060a14] hover:bg-[#0a1020] border border-[#141d2e] hover:border-cyan-500/40 rounded-md text-zinc-400 hover:text-cyan-300 font-mono text-[11px] transition-all shrink-0"
            title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa (F11)"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* v1.1 → v1.73.0 — El botón Z.ai salió de la barra: «esto es para la
            API, pero en el selector ya está» (captura `areglo.jpg`). La clave
            se gestiona en el selector de modelo; el asistente de bienvenida
            Z.ai se reabre desde el menú CN («Ajustes rápidos»). */}

        {/* v1.0.3 — 🔴 ELIMINADO de la barra: el botón Config ya está dentro del menú CN. */}

        {/* 🔧 Botón Modo Web Editor */}
        {onToggleWebEditor && (
          <button
            onClick={onToggleWebEditor}
            className={`flex items-center gap-1.5 px-2 py-0.5 font-medium rounded-md shadow-sm transition-all text-xs shrink-0 ${
              activeView === "web-editor"
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/30"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700"
            }`}
            title={activeView === "web-editor" ? "Volver al IDE" : "Modo Web Editor"}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {activeView === "web-editor" ? "Volver" : "Modo Web"}
            </span>
          </button>
        )}

        {/* v1.0.3 — 🔴 ELIMINADO de la barra: el botón «ZIP» era duplicado del menú CN
            (entrada «Descargar ZIP» en el desplegable). Ya no hace falta aquí. */}

        {/* v1.73.0 — El selector de voz se mudó al menú CN («Ajustes rápidos»).
            El chat sigue leyendo la configuración compartida (utils/ttsConfig). */}

        {/* Toggle Right — SIEMPRE visible */}
        <button
          onClick={onToggleRight}
          title={isRightOpen ? "Ocultar panel derecho" : "Mostrar panel derecho"}
          className={`p-1.5 rounded-lg border transition-all shrink-0 ${
            isRightOpen
              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              : "bg-[#080d1a] border-[#141d2e] text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
      {consejoAbierto && <ConsejoPanel onClose={() => setConsejoAbierto(false)} />}
    </header>
  );
};

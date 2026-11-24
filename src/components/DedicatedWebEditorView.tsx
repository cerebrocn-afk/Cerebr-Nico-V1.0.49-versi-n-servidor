/**
 * DedicatedWebEditorView.tsx — Editor web guiado por IA (v2.0)
 * ===========================================================
 * QUÉ CAMBIA RESPECTO A LA v1.1 (los 3 problemas que reportaste)
 *
 * 1. "UN MENSAJE DADO AL EDITOR PASA POR EL CHAT CENTRAL Y EL CHAT SE ANULA"
 *    Antes: el editor mandaba la orden a `onSendAIToChat` → chat central, y el
 *    editor NO veía la respuesta (solo un setTimeout falso de 1.500 ms que
 *    decía "¡Aplicado!" pasara lo que pasara). Encima el chat central quedaba
 *    sustituido por esta vista, así que la orden viajaba a una pantalla que no
 *    estabas mirando.
 *    Ahora: el editor es un CLIENTE DIRECTO del motor. Envía la orden, escucha
 *    el stream de verdad, muestra el estado real (enviando → generando →
 *    aplicando → aplicado / error) y captura las acciones del agente en su
 *    propio registro de actividad. El chat lateral es opcional y no hace falta
 *    para nada.
 *
 * 2. "EL EDITOR NO REPRODUCE EN EL NAVEGADOR WEB" (preview en blanco)
 *    El iframe se refrescaba con un temporizador, no cuando los archivos
 *    llegaban al sandbox. Ahora escucha el evento real `cerebronico:autosync-done`
 *    que dispara la sincronización al disco, más un refresco de seguridad, y
 *    muestra el estado del sandbox (cargando / vacío / error) en lugar de un
 *    rectángulo blanco sin explicación.
 *
 * 3. "FALTA BOTÓN PANTALLA COMPLETA" y "CUANDO OCULTO LA IA SE RECORTA EL TÍTULO"
 *    El componente de la v1.1 definía toggleFullscreen y importaba Maximize2,
 *    pero NUNCA los renderizaba. Ahora hay botón real (con estado), atajo de
 *    teclado y una barra superior que no se corta: el bloque de la izquierda es
 *    fijo, el del centro es fijo y el título/URL es el único que se recorta con
 *    `min-w-0 truncate`. El marco del preview ocupa TODO el ancho disponible.
 *
 * v1.16.6 — 4. «SIMPLIFICAR EL DOBLE CHAT ANTES DEL EDITOR» (pedido del usuario)
 *    Quedaba UNA segunda caja de escritura: el textarea «Orden directa al
 *    editor» de esta vista. Escribías ahí y la orden aparecía, envuelta, en el
 *    chat central — dos entradas, un mismo deseo. Se elimina la caja de esta
 *    vista: el ÚNICO sitio donde se escribe es el chat central, con su chip
 *    «Editor ON» (App.tsx → sendDesdeChat → sendWebEditorOrder), que es quien
 *    ahora da la orden al editor. Lo que queda aquí es lo que nadie puede
 *    hacer desde el chat: ver el preview, el estado real de la orden, la
 *    actividad del agente, el sandbox vivo y los bloques rápidos (botones de
 *    un clic, no un chat).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { alternarPantallaCompleta, type ElementoPantalla } from "../engine/pantallaCompleta"; // v1.6.6 — pantalla completa en un solo sitio
import {
  Monitor, Smartphone, Plus, Layout,
  X, Maximize2, Minimize2, ExternalLink, RefreshCw, AlertTriangle,
} from "lucide-react";
// v2.1 — Claves de persistencia y límites de los desplazadores de esta vista.
// v1.60.14 — 🐞 «ya recargué y sigue igual»: el refresco re-montaba el iframe con
// la MISMA URL, y el service worker network-first de la página generada servía la
// copia vieja de caché en cuanto el :3500 tosía. Cada refresco pide ahora una URL
// única (?cn_r=<iframeKey>) → fallo de caché garantizado → render del disco nuevo.
import { urlConAntiCache } from "../utils/previewAntiCache";
// v1.27.0 — la matemática pura del preview móvil (escala uniforme + giro), probada
// en tests/vistaMovil.test.ts. Aquí sólo se cablea al DOM; los números viven fuera.
import {
  DISPOSITIVO_MOVIL,
  dimsSegunOrientacion,
  escalaUniforme,
  tamanoRenderizado,
  girar as girarOrientacion,
  type OrientacionMovil,
} from "../engine/vistaMovil";

export interface WebEditorStatus {
  phase: "idle" | "sending" | "streaming" | "applying" | "done" | "error";
  message?: string;
  /** Última línea de actividad del agente (archivos escritos, acciones…) */
  activity?: string[];
}

interface DedicatedWebEditorViewProps {
  /** URL del sandbox en :3500 */
  sandboxUrl: string;
  /** Volver al IDE completo */
  onBackToIDE: () => void;
  /**
   * v2.0 — ORDEN DIRECTA. Debe enviar la instrucción al motor y devolver el
   * control; el estado real llega por la prop `status`.
   */
  onDirectOrder?: (prompt: string) => void;
  /** Estado real del motor, calculado en App.tsx */
  status?: WebEditorStatus;
  /** ¿Sigue generando el modelo? (para bloquear el botón) */
  isBusy?: boolean;
  /** Registro de acciones del agente para el panel de actividad */
  activityLog?: string[];
  /** v2.1 — 🐞 "Esto nunca se borra?": el panel de actividad no tenía forma de
   *  limpiarse, así que se acumulaba para siempre. */
  onClearActivityLog?: () => void;
  /* v2.1 — Se eliminó `chatSlot`: esta vista montaba un SEGUNDO ChatCenter y
     había dos chats con estado independiente. Ahora hay uno solo, el central. */
  /** Estado del sandbox para explicar un preview vacío */
  sandboxRunning?: boolean;
}

type PreviewMode = "desktop" | "mobile";

export const DedicatedWebEditorView: React.FC<DedicatedWebEditorViewProps> = ({
  sandboxUrl,
  onBackToIDE,
  onDirectOrder,
  status,
  isBusy,
  activityLog = [],
  onClearActivityLog,
  sandboxRunning,
}) => {
  // ============================================================
  // v1.16.6 — SE ELIMINÓ LA CAJA DE ÓRDENES DE ESTA VISTA (y con ella su
  // borrador persistente de la v2.1: ya no hay nada que persistir).
  // El «doble chat» muere aquí: la ÚNICA escritura vive en el chat central,
  // cuyo chip «Editor ON» envía las órdenes (App.tsx). Esta vista muestra el
  // resultado (estado real, actividad, preview) y ofrece botones de un clic.
  // ============================================================
  const esNavegadorRemoto =
    typeof window !== "undefined" && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const usaProxySandbox = sandboxUrl.includes("/sandbox-preview");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  // v1.27.0 — orientación del preview móvil y medida del hueco disponible, para
  // calcular la escala UNIFORME (ni estirado ni recortado).
  // v1.60.12 — Mario: «la vista móvil vertical es horrible, quítala». El preview
  // móvil queda FIJO en horizontal (844×390, teléfono apaisado): se eliminó el
  // botón GIRAR y el estado ya no cambia. Quedan sólo dos vistas: Escritorio y
  // Móvil-horizontal. Las funciones puras de vistaMovil.ts (girar/vertical) se
  // conservan intactas por si algún día se reactiva, pero la UI no las usa.
  const [orientacionMovil] = useState<OrientacionMovil>("horizontal");
  const contenedorMovilRef = useRef<HTMLDivElement | null>(null);
  const [huecoMovil, setHuecoMovil] = useState({ ancho: 0, alto: 0 });
  // v1.27.0 — medir el hueco real del contenedor del preview móvil. Un
  // ResizeObserver mantiene la escala al día cuando el usuario arrastra el panel,
  // entra a pantalla completa o gira el teléfono. Sin esto la escala sería una
  // foto vieja y el teléfono no encajaría.
  useEffect(() => {
    if (previewMode !== "mobile") return;
    const el = contenedorMovilRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setHuecoMovil({ ancho: el.clientWidth, alto: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewMode, orientacionMovil]);
  const [iframeKey, setIframeKey] = useState(0);
  const [previewListo, setPreviewListo] = useState(false);

  // v1.6.14 — 🐞 «el sandbox arranca, pero hasta que no salgo del IDE, voy a
  // Google y entro en localhost:3500 no carga».
  //
  // El iframe cargaba UNA sola vez, antes de que el puerto 3500 respondiera. El
  // navegador guardaba esa página en blanco y no volvía a intentarlo: el preview
  // quedaba muerto hasta que el usuario abría la URL a mano —lo que además
  // calentaba el servidor— y recargaba. Aquí se sondea el puerto y, en cuanto
  // responde, se carga de verdad. Y al volver a la pestaña se reintenta solo:
  // exactamente lo que el usuario hacía a mano, pero automático.
  useEffect(() => {
    if (!sandboxUrl) return;
    let vivo = true;
    let intentos = 0;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const probar = async () => {
      if (!vivo) return;
      try {
        if (usaProxySandbox) {
          const resp = await fetch(sandboxUrl, { cache: "no-store" });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        } else {
          // `no-cors` basta en loopback directo: solo interesa si el puerto CONTESTA.
          await fetch(sandboxUrl, { mode: "no-cors", cache: "no-store" });
        }
        if (!vivo) return;
        setPreviewListo(true);
        setIframeKey((k) => k + 1); // fuerza una carga limpia
        return;
      } catch {
        /* todavía no está: se reintenta */
      }
      intentos += 1;
      if (intentos >= 20) return;
      temporizador = setTimeout(probar, Math.min(800 + intentos * 400, 4000));
    };

    void probar();

    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      intentos = 0;
      void probar();
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [sandboxUrl]);

  // ============================================================
  // v8.0.3 — 🐞 «EL EDITOR WEB NUNCA HA FUNCIONADO» (cazado, con las dos piezas)
  // ------------------------------------------------------------
  // La queja era «el editor web? hasta ahora no ha funcionado». No era un
  // problema de render: eran DOS fallos encadenados, y el segundo es el que hacía
  // que pareciera roto para siempre.
  //
  //  1) ESTA VISTA NUNCA ARRANCABA EL SANDBOX. En todo el proyecto, el único sitio
  //     que llama a `/api/sandbox/start` es el panel «Sandbox» de la barra LATERAL
  //     derecha (RightSidebar.tsx). Quien abría «Modo Web» sin haber pasado antes
  //     por ese panel se quedaba con un iframe apuntando a un puerto muerto
  //     (:3500) y ningún botón para arreglarlo DESDE la pantalla que estaba
  //     mirando. El editor web no fallaba: le faltaba el paso 1.
  //
  //  2) LA EXPLICACIÓN DEL HUECO NO PODÍA APARECER NUNCA. Este componente recibe
  //     `sandboxRunning` y pinta con él el punto de estado y el aviso «El sandbox
  //     (:3500) no está corriendo». Pero en App.tsx ese valor era
  //     `useState(true)` y **nadie lo escribía jamás**: `setSandboxRunning` no se
  //     llamaba en ningún sitio del proyecto. Un indicador clavado en verde
  //     tapando justo el fallo que existía para explicar. Peor que no tenerlo.
  //
  // El arreglo: la vista averigua POR SÍ MISMA si el sandbox está vivo, lo arranca
  // si no lo está, y si aun así no puede, lo dice con su motivo y su botón. Ya no
  // depende de que el usuario encuentre el panel correcto.
  // ============================================================
  // `sandboxRunning` se usa como PISTA INICIAL (evita pintar «comprobando» si
  // quien nos monta ya sabe que está caído). La comprobación real manda siempre:
  // la prop ya no puede dejar el indicador clavado en verde.
  const [sbEstado, setSbEstado] = useState<"comprobando" | "vivo" | "muerto" | "arrancando">(
    sandboxRunning === false ? "muerto" : "comprobando"
  );
  const [sbDetalle, setSbDetalle] = useState<string>("");
  /** Un solo intento automático por montaje: no entrar en bucle de arranques. */
  const sbAutoIntentado = useRef(false);

  /** Pregunta al motor si el sandbox está vivo. */
  const probarSandbox = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch("/api/sandbox/status");
      const d: any = await r.json().catch(() => ({}));
      const vivo = !!(d && (d.online === true || d.running === true));
      setSbEstado(vivo ? "vivo" : "muerto");
      setSbDetalle(vivo ? "" : String(d?.motivo || d?.message || "El sandbox no está arrancado."));
      return vivo;
    } catch (e: any) {
      setSbEstado("muerto");
      setSbDetalle(`No se pudo preguntar al motor: ${e?.message || e}`);
      return false;
    }
  }, []);

  /** Arranca el sandbox. Mismo protocolo que el panel lateral, incluida la
   *  confirmación cuando el proyecto ES la propia IDE. */
  const arrancarSandbox = useCallback(async () => {
    setSbEstado("arrancando");
    setSbDetalle("");
    try {
      let r = await fetch("/api/sandbox/start", { method: "POST" });
      let d: any = await r.json().catch(() => ({}));
      if (d?.requiereConfirmacion) {
        r = await fetch("/api/sandbox/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmar: "recursion" }),
        });
        d = await r.json().catch(() => ({}));
      }
      if (d?.ok) {
        setSbEstado("vivo");
        setSbDetalle("");
        // Recarga el iframe para que no se quede con el error de conexión previo.
        setIframeKey((k) => k + 1);
      } else {
        setSbEstado("muerto");
        setSbDetalle(String(d?.error || d?.message || "El motor no pudo arrancar el sandbox."));
      }
    } catch (e: any) {
      setSbEstado("muerto");
      setSbDetalle(`Fallo al arrancar el sandbox: ${e?.message || e}`);
    }
  }, []);

  // Al abrir la pestaña: comprobar; y si está muerto, arrancarlo UNA vez sin que
  // el usuario tenga que saber que existe un panel lateral para eso.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const vivo = await probarSandbox();
      if (cancelado || vivo || sbAutoIntentado.current) return;
      sbAutoIntentado.current = true;
      await arrancarSandbox();
    })();
    return () => {
      cancelado = true;
    };
  }, [probarSandbox, arrancarSandbox]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastRefreshReason, setLastRefreshReason] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // v1.60.15 — Se eliminaron el estado `showAITools`, el ancho `sideWidth` y los
  // desplazadores/arrastre (`startDrag`/`guardarAncho`): ya no hay columna
  // izquierda que mostrar/ocultar ni ensanchar. La vista es solo el preview.


  const refreshPreview = useCallback((reason: string) => {
    setIframeKey((k) => k + 1);
    setLastRefreshReason(reason);
  }, []);

  // ---------- Pantalla completa REAL (el botón que faltaba) ----------
  /**
   * v1.6.6 — 🐞 «el botón de salir de pantalla completa no anda».
   *
   * Aquí estaba el fallo, y era de una asimetría de una línea: la LLAMADA
   * contemplaba `requestFullscreen` y `webkitRequestFullscreen`, pero la
   * PREGUNTA solo miraba `document.fullscreenElement`. En un motor que exponga
   * únicamente el nombre prefijado, esa lectura vale `undefined` siempre — así
   * que la condición entraba por la rama de «entrar» incluso estando dentro:
   * pulsar «Salir» volvía a pedir pantalla completa. El botón no estaba muerto,
   * estaba eligiendo lo contrario.
   *
   * Y el `.catch(() => {})` escondía el motivo. Ahora el fallo se enseña.
   */
  const [avisoPantalla, setAvisoPantalla] = useState("");

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    void alternarPantallaCompleta(document, el as unknown as ElementoPantalla).then((r) => {
      setAvisoPantalla(r.ok ? "" : `${r.accion === "salir" ? "Salir" : "Entrar"} no funcionó: ${r.motivo ?? "sin motivo"}`);
    });
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler as any);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler as any);
    };
  }, []);

  // F11 dentro del editor web
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // v1.6.6 — El IDE entero escucha F11 en `window` y ya llama a
      // `preventDefault()`. Con DOS dueños de la misma tecla, los dos disparaban
      // en el mismo instante sobre elementos distintos y el navegador rechazaba
      // el segundo — rechazo que además se tragaba el `.catch` vacío. Si la
      // tecla ya la atendió el IDE, aquí no se toca: un dueño por tecla.
      if (e.defaultPrevented) return;
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  // ---------- Refresco del preview dirigido por EVENTOS REALES ----------
  useEffect(() => {
    const onAutoSync = () => refreshPreview("auto-sync al sandbox");
    window.addEventListener("cerebronico:autosync-done", onAutoSync);
    return () => window.removeEventListener("cerebronico:autosync-done", onAutoSync);
  }, [refreshPreview]);

  // Cuando el modelo TERMINA, además del autosync se refresca por si acaso el
  // sandbox no estaba levantado en ese instante.
  useEffect(() => {
    if (status?.phase === "done") refreshPreview("fin de la generación");
  }, [status?.phase, refreshPreview]);

  // v1.60.15 — Al quitar la columna izquierda desaparecieron sus consumidores:
  // los bloques rápidos (`quickBlocks`/`enviarBloqueRapido`), el badge de fase
  // (`phaseLabel`/`phaseColor`) y el indicador `busy`. La orden y su estado se
  // ven en el CHAT CENTRAL. `status`/`isBusy` siguen como props por contrato,
  // pero esta vista ya no los pinta: es solo el previsualizador.

  return (
    <div
      ref={containerRef}
      /* v2.2 — 🐞 EL VELO DE CEREBRONICO EN EL PREVIEW. La raíz y el lienzo del
         preview estaban en `bg-transparent`, así que el fondo de pantalla de la
         app (AppBackground, capa fija z-0 con la imagen de marca «Cerebro»
         encendida por defecto) se transparentaba POR DETRÁS de la
         previsualización: se veía «siempre una página de CerebroNico como un
         velo» tras el iframe (márgenes, estado de carga, modo móvil). El preview
         debe renderizar el PROYECTO sobre una superficie limpia, no sobre el
         wallpaper: se le da un fondo opaco propio (igual tono que los paneles). */
      className="cn-web-editor flex h-full w-full bg-[#05080f] text-slate-200 overflow-hidden"
    >
      {/* v1.60.15 — Mario: «quitá todo el recuadro “Editor Web & IA”; si las
          órdenes se le dan al chat, ¿para qué ese panel con el log del agente?
          Solo debe mostrarse el previsualizado». Se eliminó por completo la
          columna izquierda (instrucciones + bloques rápidos + «Actividad del
          agente») y su desplazador. Esta vista es AHORA solo la mesa de trabajo:
          barra superior + previsualizador a todo el ancho. La orden sigue
          viviendo en el CHAT CENTRAL (chip «Editor ON»), único sitio de entrada.
          Los bloques rápidos y el registro de actividad desaparecen de la UI;
          la actividad real ya se ve en el propio chat central. */}

      {/* ---------- Lienzo ---------- */}
      <div className="flex-1 flex flex-col bg-transparent min-w-0">
        {/* Barra superior: bloques fijos a izquierda y derecha, y SOLO el
            título/URL central se recorta. Esto arregla el "cuando oculto la IA
            se recorta el título". */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800 bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onBackToIDE}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 rounded-lg text-xs font-medium transition border border-slate-700 whitespace-nowrap"
              title="Volver al IDE completo"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Volver al IDE</span>
            </button>
            {/* v1.60.15 — Se eliminó el botón «Ocultar/Mostrar IA»: ya no hay panel
                de IA que ocultar (Mario: solo el previsualizado). */}
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 shrink-0">
            <button
              onClick={() => setPreviewMode("desktop")}
              className={`px-2 py-1 rounded text-xs transition flex items-center gap-1 ${previewMode === "desktop" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              title="Vista de escritorio"
            >
              <Monitor className="w-3 h-3" />
              <span className="hidden xl:inline">Escritorio</span>
            </button>
            <button
              onClick={() => setPreviewMode("mobile")}
              className={`px-2 py-1 rounded text-xs transition flex items-center gap-1 ${previewMode === "mobile" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              title="Vista móvil apaisada (844×390)"
            >
              <Smartphone className="w-3 h-3" />
              <span className="hidden xl:inline">Móvil</span>
            </button>
            {/* v1.60.12 — se eliminó el botón GIRAR y la vista móvil vertical (Mario:
                «la vertical es horrible»). El preview móvil es siempre horizontal
                (844×390). Quedan dos vistas: Escritorio y Móvil (apaisado). */}
          </div>

          {/* Título/estado: único elemento que se recorta */}
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-[11px] text-slate-500 font-mono">
            <span className="truncate" title={sandboxUrl}>
              {sandboxUrl.replace("http://", "")}
            </span>
            {lastRefreshReason && <span className="hidden xl:inline text-slate-600 shrink-0">· {lastRefreshReason}</span>}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => refreshPreview("refresco manual")}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 rounded-lg border border-slate-700"
              title="Refrescar preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.open(sandboxUrl, "_blank")}
              className="p-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 hover:text-cyan-100 rounded-lg border border-cyan-600/40"
              title="Abrir el sandbox en una pestaña nueva del navegador"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            {/* ✅ BOTÓN DE PANTALLA COMPLETA — el que faltaba */}
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1 px-2 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 rounded-lg text-xs font-medium border border-violet-500/40 whitespace-nowrap"
              title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa (F11)"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{isFullscreen ? "Salir" : "Pantalla completa"}</span>
            </button>
            {avisoPantalla && (
              <span className="text-[10px] text-amber-300 max-w-[240px] truncate" title={avisoPantalla}>
                ⚠ {avisoPantalla}
              </span>
            )}
            {/* v8.0.3 — El punto de estado informa de la REALIDAD medida por esta
                vista (probada contra el motor), no de una prop que llegaba fija
                en `true`. Antes estaba siempre verde, incluso con el sandbox
                muerto: el indicador mentía justo en el único caso en que hacía
                falta. `sandboxRunning` se conserva sólo como pista inicial. */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                sbEstado === "vivo" ? "bg-emerald-400 animate-pulse" : sbEstado === "comprobando" || sbEstado === "arrancando" ? "bg-amber-400 animate-pulse" : "bg-red-400"
              }`}
              title={
                sbEstado === "vivo"
                  ? "Sandbox :3500 activo (comprobado)"
                  : sbEstado === "comprobando"
                  ? "Comprobando el sandbox :3500…"
                  : sbEstado === "arrancando"
                  ? "Arrancando el sandbox :3500…"
                  : `Sandbox :3500 detenido${sbDetalle ? " — " + sbDetalle : ""}`
              }
            />
          </div>
        </div>

        {/* Lienzo del preview */}
        {/* v2.2 — opaco a propósito: sin esto, el wallpaper de marca de la app
            (capa z-0) asomaba por detrás del preview como un velo. */}
        <div className="flex-1 flex flex-col bg-[#05080f] overflow-hidden min-h-0 relative">
          {/* v1.0.42 — el aviso depende del estado MEDIDO, sin excepciones
              metidas dentro de la misma condición: el caso «navegador remoto con
              sandbox vivo» es otra franja, y va en su propio bloque. Así la
              condición se lee tal cual es. */}
          {sbEstado !== "vivo" && (
            <div
              className={`px-3 py-2 border-b text-xs flex items-center gap-2 ${
                sbEstado === "muerto" ? "bg-red-500/10 border-red-500/30 text-red-200" : "bg-amber-500/10 border-amber-500/30 text-amber-200"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {sbEstado === "comprobando" && <span>Comprobando si el sandbox (:3500) está vivo…</span>}
              {sbEstado === "arrancando" && <span>Arrancando el sandbox (:3500)…</span>}
              {sbEstado === "muerto" && (
                <>
                  <span className="flex-1">
                    {esNavegadorRemoto && !usaProxySandbox
                      ? "La vista previa en vivo (:3500) funciona en PC local (`localhost:3500`). Desde esta sesión web remota sigue funcionando la edición, compilación en servidor y descarga `.zip`/`.cn`."
                      : <>El sandbox (:3500) <strong>no está corriendo</strong>: por eso el preview sale en blanco.</>}
                    {sbDetalle ? ` Motivo del motor: ${sbDetalle}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={arrancarSandbox}
                    className="shrink-0 px-2 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-100 font-medium"
                    title="Arranca el servidor del proyecto en el puerto 3500"
                  >
                    Arrancar sandbox ahora
                  </button>
                  <button
                    type="button"
                    onClick={probarSandbox}
                    className="shrink-0 px-2 py-1 rounded-md bg-zinc-700/40 hover:bg-zinc-700/60 border border-zinc-600/50 text-zinc-200"
                    title="Volver a preguntar al motor si ya está vivo"
                  >
                    Reintentar
                  </button>
                </>
              )}
            </div>
          )}
          {esNavegadorRemoto && !usaProxySandbox && sbEstado === "vivo" && (
            <div className="px-3 py-2 border-b text-xs flex items-center gap-2 bg-amber-500/10 border-amber-500/30 text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">
                El preview en <span className="font-mono">localhost:3500</span> está pensado para ejecución en PC local; desde un navegador remoto puedes editar el proyecto, validar en el servidor y exportar el paquete completo en <span className="font-mono">.zip</span> / <span className="font-mono">.cn</span>.
              </span>
            </div>
          )}
          {/* v2.0 — 🐞 En modo móvil el marco de 375 px se comprimía hasta los
              ~230 px del contenedor y el contenido salía "achatado" (el navegador
              lo renderizaba a ese ancho real). Ahora el marco conserva sus 375 px
              y el contenedor hace scroll horizontal si no cabe: se ve igual que
              en un móvil de verdad, sin deformar. */}
          {previewMode === "mobile" ? (
            /* v1.27.0 — PREVIEW MÓVIL SIN ESTIRAR (cura del bug «se ve estirado»).
               Antes se dejaba al navegador encoger SÓLO el ancho del iframe (vía
               aspect-ratio/height:100%), y la página se renderizaba a un ancho
               raro: achatada. Ahora el iframe se pinta a un TAMAÑO DE DISPOSITIVO
               FIJO (390×844, o 844×390 al girar) para que su viewport interno sea
               el de un móvil real, y se encaja en el hueco con un único
               `transform: scale(k)` UNIFORME. Un solo factor no puede deformar:
               sólo agranda o achica, nunca estira. La matemática vive en
               engine/vistaMovil.ts (probada); aquí sólo se cablea al DOM. */
            (() => {
              const dims = dimsSegunOrientacion(orientacionMovil, DISPOSITIVO_MOVIL);
              const escala = escalaUniforme(huecoMovil, dims);
              const rend = tamanoRenderizado(dims, escala);
              return (
                <div
                  ref={contenedorMovilRef}
                  className="flex-1 p-3 min-h-0 flex items-center justify-center overflow-hidden"
                  /* v1.46.6 — 🐞 "en vertical se ve fino/angosto": el teléfono en
                     retrato mide 390×844; si el hueco es ancho pero BAJO, la
                     escala la manda el alto (h/844) y el móvil queda estrechísimo.
                     Reservando un alto mínimo (igual que el preview de escritorio)
                     el retrato tiene sitio para crecer y deja de verse fino.
                     En horizontal (844×390) el ancho ya manda, así que no cambia. */
                  style={{ minHeight: "min(78vh, 900px)" }}
                >
                  {/* Caja que reserva el tamaño YA escalado, para centrar sin
                      empujar el layout. Dentro, el marco va a tamaño real y se
                      reduce con transform (no cambia el flujo). */}
                  <div style={{ width: rend.ancho, height: rend.alto, position: "relative" }}>
                    <div
                      className="cn-device-frame"
                      style={{
                        width: dims.ancho,
                        height: dims.alto,
                        transform: `scale(${escala})`,
                        transformOrigin: "top left",
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }}
                    >
                      {orientacionMovil === "vertical" && <div className="cn-device-notch" />}
                      <iframe
                        key={iframeKey}
                        src={previewListo ? urlConAntiCache(sandboxUrl, iframeKey) : undefined}
                        title="Web Editor Preview (Mobile)"
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                      />
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <iframe
              key={iframeKey}
              src={previewListo ? urlConAntiCache(sandboxUrl, iframeKey) : undefined}
              title="Web Editor Preview (Desktop)"
              /* v2.0 — 🐞 "en el escritorio se ve aplastado": el iframe era un hijo
                 flex con `flex-1` dentro de un contenedor sin altura resuelta, así
                 que se quedaba con su altura por defecto (150 px) = una franja
                 aplastada. Ahora ocupa todo el alto disponible y, si el contenedor
                 no tiene altura, nunca baja de 420 px. */
              /* v2.1 — 🐞 "en modo escritorio se ve tan achatado" (y en el navegador
                 real NO). Diagnóstico: el iframe se quedaba con 420 px de alto en
                 una pantalla de 768, o sea un lienzo de ~1300×420: un viewport
                 anchísimo y bajísimo, así que cualquier página con secciones de
                 altura completa se comprime y parece aplastada. En Chrome, a
                 pantalla completa, el mismo sitio tiene 1300×700 y se ve normal.
                 Arreglo: el preview ocupa todo el alto disponible y, si el panel
                 no lo tiene resuelto, nunca baja del 78 % de la ventana. */
              className="block w-full border-0 bg-white"
              style={{ height: "100%", minHeight: "min(78vh, 900px)" }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          )}
        </div>
      </div>
    </div>
  );
};

/** Iconos auxiliares para que el árbol de pestañas pueda mostrarlos */
export const WEB_EDITOR_TAB_ICON = Layout;
export const WEB_EDITOR_QUICK_ADD = Plus;

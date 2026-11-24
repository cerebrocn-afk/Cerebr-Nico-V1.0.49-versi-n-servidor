import React, { useEffect, useRef, useState } from "react";
import { Download, Loader2, Smartphone, Wrench } from "lucide-react";
import {
  siguienteAccion,
  descargaAutomaticaPermitida,
  cuentaToolchain,
  type EstadoCompilacion,
} from "../engine/apkUnClic";

/**
 * PanelAndroid.tsx — EXPORTAR → APK CON UN CLIC (v1.56.9 · v1.0.14 con toolchain propio)
 * =======================================================================================
 * El pedido de Mario: que la IDE compile el APK sola. Cuatro botones hablan con
 * `server/routers/exportacion.ts`:
 *   0. Preparar herramientas → POST /api/export/android/provision (una vez:
 *      JDK 17 + Gradle + SDK a <raíz de datos>/.cerebronico/herramientas)
 *   1. Generar proyecto      → POST /api/export/android/proyecto
 *   2. Compilar APK          → POST /api/export/android/build  (luego sondeo el GET)
 *   3. Descargar APK         → GET  /api/export/android/apk
 *
 * Reglas de honestidad que trae puestas:
 *   · El botón 2 se muestra SIEMPRE; si la máquina no tiene cómo compilar, el
 *     servidor responde 400 con la solución concreta y ESTE panel la muestra tal
 *     cual — y ofrece el botón 0 si la solución es bajar el toolchain.
 *   · El botón 0 muestra el progreso REAL (bytes bajados, paso actual, últimas
 *     líneas) y al terminar relanza la compilación que quedó pendiente.
 *   · El enlace de descarga solo aparece cuando el servidor afirmó éxito Y verificó
 *     el archivo en disco (`apkVerificado`). Sin APK no hay botón, aunque el log
 *     diga BUILD SUCCESSFUL.
 *   · v1.0.21 · «solo exportar APK y listo»: hay UN botón («Exportar APK y listo»)
 *     que encadena generar → compilar → descargar, y si Gradle dice que falta el
 *     toolchain lo prepara él solo UNA vez y reintenta sin otro clic. La secuencia
 *     la decide `src/engine/apkUnClic.ts` (puro); este panel sólo obedece. Los
 *     botones sueltos quedan en «pasos manuales» por si hace falta reintentar uno.
 *   · Los sondeos se cortan solos si el trabajo terminó o el panel se desmonta.
 */

type EstadoBuild =
  | { fase: "quieto" }
  | { fase: "generando" | "compilando" | "preparando" }
  | { fase: "listo"; bytes: number }
  | { fase: "entregando"; bytes: number }
  | { fase: "error"; texto: string; solucion?: string; puedeAprovisionar?: boolean };

type Provision = {
  estado: "corriendo" | "exito" | "fallido";
  paso: string;
  bajadoMB: number;
  totalNota: string;
  lineas: string[];
  fallo?: { causa: string; solucion: string } | null;
};

const POST = async (url: string, body?: unknown) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const datos = await res.json().catch(() => ({}));
  return { ok: res.ok, datos };
};

export const PanelAndroid: React.FC = () => {
  const [estado, setEstado] = useState<EstadoBuild>({ fase: "quieto" });
  const [mensaje, setMensaje] = useState<string>("");
  const [log, setLog] = useState<string[]>([]);
  const [proyectoListo, setProyectoListo] = useState<boolean | null>(null);
  // v1.0.21 · la cadena del clic único: qué sigue, si ya se pidió el toolchain y
  // si este intento puede descargar solo. `ultimo` guarda la última compilación
  // contada por el servidor para que el avance no dependa del orden de la UI.
  const enCadenaRef = useRef<boolean>(false);
  const toolchainIntentadoRef = useRef<boolean>(false);
  const descargaRef = useRef<boolean>(false);
  const ultimoRef = useRef<EstadoCompilacion>({ tipo: "sin-trabajo" });
  const [enCadena, setEnCadena] = useState<boolean>(false);
  const [avisoDescarga, setAvisoDescarga] = useState<string>("");
  const [provision, setProvision] = useState<Provision | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const pollProvRef = useRef<number | null>(null);
  // Si «Compilar» falló por toolchain y el usuario prepara las herramientas,
  // al terminar se reintenta EL MISMO build sin otro clic (pedido 10/11).
  const reintentarTrasProvision = useRef<boolean>(false);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (pollProvRef.current) window.clearInterval(pollProvRef.current);
  }, []);

  const sondear = (jobId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/export/android/build/${jobId}`);
        const d = await r.json();
        if (!r.ok) return;
        setLog(Array.isArray(d.log) ? d.log : []);
        if (d.estado === "corriendo") return;
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        if (d.estado === "exito" && d.apk) {
          // Solo el servidor puede decir «exito»: ya verificó el archivo en disco.
          setEstado({ fase: "listo", bytes: d.apk.bytes });
          setMensaje(`APK listo (${Math.round(d.apk.bytes / 1024)} KB) · ${d.segundos}s`);
          terminoCompilacion({ tipo: "exito", apkBytes: d.apk.bytes });
        } else {
          const solucion = d.fallo?.solucion;
          setEstado({
            fase: "error",
            texto: d.fallo?.causa || "La compilación falló sin causa clasificada.",
            solucion,
            puedeAprovisionar: d.fallo?.puedeAprovisionar === true,
          });
          terminoCompilacion({
            tipo: "fallo",
            causa: d.fallo?.causa || "La compilación falló sin causa clasificada.",
            solucion,
            faltaToolchain: d.fallo?.puedeAprovisionar === true,
          });
        }
      } catch {
        /* la IDE se reinició debajo: el próximo click reintenta */
      }
    }, 2000);
  };

  const generar = async (auto = false) => {
    setEstado({ fase: "generando" });
    setMensaje("Generando el proyecto android/ …");
    const { ok, datos } = await POST("/api/export/android/proyecto");
    if (ok && datos.ok) {
      setProyectoListo(true);
      setMensaje(auto ? "Proyecto android/ generado. Sigo con Gradle." : datos.message || "Proyecto generado.");
      setEstado({ fase: "quieto" });
      // v1.0.21 · pedido de un clic: si esto nació del botón grande, no se para aquí.
      if (auto) void compilar(true);
    } else {
      setProyectoListo(false);
      setEstado({ fase: "error", texto: datos.error || "El servidor rechazó generar el proyecto." });
      setMensaje("");
      cortarCadena();
    }
  };

  const compilar = async (auto = false) => {
    setEstado({ fase: "compilando" });
    setMensaje("Lanzando Gradle …");
    const { ok, datos } = await POST("/api/export/android/build");
    if (!ok) {
      // v1.0.21 · el servidor dice si el 400 era por toolchain: eso activa el
      // plan de un clic (bajarlo y reintentar). Cualquier otro 400 se para.
      // v1.0.21 · `puedeAprovisionar` lo mide el servidor al vuelo (disco + java +
      // gradle); el panel lo usa para arrancar el plan de un clic. Sin esta rama,
      // la cadena se quedaría parada esperando a que Mario pulse ⚙.
      const faltaToolchain = datos.puedeAprovisionar === true;
      setEstado({
        fase: "error",
        texto: datos.error || "No se pudo lanzar la compilación.",
        solucion: datos.solucion,
        puedeAprovisionar: faltaToolchain,
      });
      terminoCompilacion({
        tipo: "fallo",
        causa: datos.error || "No se pudo lanzar la compilación.",
        solucion: datos.solucion,
        faltaToolchain,
      });
      return;
    }
    if (datos.yaEnMarcha) setMensaje("Ya había una compilación en marcha: siguiendo esa.");
    // Un job que ya venía vivo también se sigue: el sondeo no depende de quién lo lanzó.
    ultimoRef.current = { tipo: "corriendo" };
    jobIdRef.current = datos.jobId || null;
    if (jobIdRef.current) sondear(jobIdRef.current);
  };

  const preparar = async (auto = false) => {
    setEstado({ fase: "preparando" });
    setMensaje("Preparando herramientas: JDK 17 + Gradle + Android SDK (una sola vez).");
    reintentarTrasProvision.current = true;
    const { datos } = await POST("/api/export/android/provision", {});
    setProvision({
      estado: datos.estado || "corriendo",
      paso: datos.paso || "",
      bajadoMB: 0,
      totalNota: datos.totalNota || "",
      lineas: [],
      fallo: null,
    });
    if (pollProvRef.current) window.clearInterval(pollProvRef.current);
    pollProvRef.current = window.setInterval(async () => {
      try {
        const r = await fetch("/api/export/android/provision");
        const d = await r.json();
        if (!r.ok || !d.hayTrabajo) return;
        setProvision({
          estado: d.estado, paso: d.paso || "", bajadoMB: d.bajadoMB || 0,
          totalNota: d.totalNota || "", lineas: d.lineas || [], fallo: d.fallo || null,
        });
        if (d.estado !== "corriendo") {
          if (pollProvRef.current) window.clearInterval(pollProvRef.current);
          pollProvRef.current = null;
          if (d.estado === "exito") {
            setMensaje("Toolchain listo y verificado en disco. Reintentando la compilación…");
            if (reintentarTrasProvision.current) { reintentarTrasProvision.current = false; void compilar(true); }
            else setEstado({ fase: "quieto" });
          } else {
            setEstado({ fase: "error", texto: d.fallo?.causa || "El aprovisionamiento falló.", solucion: d.fallo?.solucion });
            cortarCadena();
          }
        }
      } catch { /* servidor reiniciado debajo: el próximo clic reintenta */ }
    }, 2000);
    return datos;
  };

  const ocupado = estado.fase === "generando" || estado.fase === "compilando" || estado.fase === "preparando";

  // ── v1.0.21 · EL AVANCE DE LA CADENA ─────────────────────────────────────
  // Cada respuesta del servidor (generar, compilar, sondeo, toolchain) pasa por
  // aquí y se ejecuta ÚNICAMENTE lo que diga la decisión pura (`apkUnClic.ts`).
  // Si el fallo no es de toolchain, la cadena se corta y el motivo queda escrito.
  const terminoCompilacion = (c: EstadoCompilacion) => {
    ultimoRef.current = c;
    if (!enCadenaRef.current) return;
    const paso = siguienteAccion({
      hayApkVerificado: c.tipo === "exito",
      // v1.0.21 · sin proyecto en disco no hay nada que compilar: `null` mientras
      // el estado no lo sepa (el servidor manda `proyectoGenerado` en /proyecto).
      proyectoGenerado: proyectoListo,
      compilacion: c,
      toolchainIntentado: toolchainIntentadoRef.current,
      faltaToolchainEnMaquina: false,
    });
    toolchainIntentadoRef.current = cuentaToolchain(toolchainIntentadoRef.current, paso.accion);
    if (paso.accion === "esperar") return;
    enCadenaRef.current = false;
    setEnCadena(false);
    if (paso.accion === "preparar-toolchain") void preparar(true);
    else if (paso.accion === "compilar") void compilar(true);
    else if (paso.accion === "generar") void generar(true);
    else if (paso.accion === "descargar") { setMensaje(paso.motivo); entregar(); }
    else setMensaje(paso.motivo);
  };

  /** La cadena se corta por un fallo ajeno a la compilación (proyecto, toolchain). */
  const cortarCadena = () => {
    enCadenaRef.current = false;
    setEnCadena(false);
  };

  const exportarYListo = async () => {
    setAvisoDescarga("");
    toolchainIntentadoRef.current = false;
    // La descarga sola solo si el navegador la va a aceptar (nació de este clic).
    descargaRef.current = descargaAutomaticaPermitida(true, true);
    // Ya hay un APK verificado de antes: no se recompila, se entrega.
    if (estado.fase === "listo") { entregar(); return; }
    enCadenaRef.current = true;
    setEnCadena(true);
    setEstado({ fase: "generando" });
    setMensaje("Exportar APK y listo: generando el proyecto android/ …");
    void generar(true);
  };

  /** Entrega el APK: descarga sola si el navegador lo permite; si no, deja el enlace. */
  const entregar = () => {
    if (!descargaRef.current) {
      setAvisoDescarga("El navegador bloquea la descarga automática: usá el enlace «Descargar APK».");
      return;
    }
    descargaRef.current = false;
    const a = document.createElement("a");
    a.href = "/api/export/android/apk";
    a.download = "app-debug.apk";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-emerald-400" />
        <h4 className="text-xs font-semibold text-zinc-200">Android · APK</h4>
        {proyectoListo === true && <span className="text-[10px] text-emerald-400/80 ml-auto">proyecto generado</span>}
        {proyectoListo === false && <span className="text-[10px] text-red-400/80 ml-auto">proyecto sin generar</span>}
      </div>

      {/* v1.0.21 · UN botón: rellena todo el ancho y dice qué está haciendo. */}
      <button
        onClick={exportarYListo}
        disabled={ocupado}
        className="w-full px-3 py-2 text-[12px] font-mono rounded border border-emerald-700/60 bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        title="Genera el proyecto android/, compila con Gradle y te entrega el APK. Si falta el toolchain lo prepara solo y reintenta."
      >
        {ocupado ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {estado.fase === "preparando" ? "preparando herramientas…" : estado.fase === "generando" ? "generando proyecto…" : "compilando…"}
          </>
        ) : (
          <>
            <Smartphone className="w-3.5 h-3.5" />
            {estado.fase === "listo" ? "Descargar APK de nuevo" : "Exportar APK y listo"}
          </>
        )}
      </button>

      <div className="flex flex-wrap gap-2">
        {estado.fase === "listo" && (
          <a
            href="/api/export/android/apk"
            className="px-2.5 py-1 text-[11px] font-mono rounded border border-cyan-700/60 bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-200 flex items-center gap-1 transition-colors"
            title="Descarga el app-debug.apk verificado en disco"
          >
            <Download className="w-3 h-3" /> Descargar APK ({Math.round(estado.bytes / 1024)} KB)
          </a>
        )}
        {estado.fase === "error" && (
          <button
            onClick={exportarYListo}
            className="px-2.5 py-1 text-[11px] font-mono rounded border border-emerald-700/60 bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-200 transition-colors"
            title="Vuelve a intentar la cadena completa desde el principio"
          >
            Reintentar todo
          </button>
        )}
        <details className="w-full">
          <summary className="text-[10px] font-mono text-zinc-500 cursor-pointer select-none">pasos manuales</summary>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <button
              onClick={() => void generar(false)}
              disabled={ocupado}
              className="px-2.5 py-1 text-[11px] font-mono rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-40 transition-colors"
              title="Escribe la carpeta android/ con el proyecto Gradle completo"
            >
              1. Generar proyecto
            </button>
            <button
              onClick={() => void compilar(false)}
              disabled={ocupado}
              className="px-2.5 py-1 text-[11px] font-mono rounded border border-emerald-700/60 bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-200 disabled:opacity-40 transition-colors"
              title="Ejecuta Gradle en esta máquina. Si falta el toolchain, el botón grande lo prepara y reintenta."
            >
              2. Compilar APK
            </button>
            <button
              onClick={() => void preparar(false)}
              disabled={ocupado}
              className="px-2.5 py-1 text-[11px] font-mono rounded border border-amber-700/50 bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 disabled:opacity-40 transition-colors flex items-center gap-1"
              title="Una sola vez: baja JDK 17 + Gradle + Android SDK a <raíz de datos>/.cerebronico/herramientas. No toca tu PATH ni Program Files."
            >
              <Wrench className="w-3 h-3" /> ⚙ Preparar herramientas
            </button>
          </div>
        </details>
      </div>

      {enCadena && (
        <p className="text-[10px] font-mono text-emerald-500/80">clic único en curso · {ocupado ? "encadenando pasos sin pedirte nada" : "esperando el servidor"}</p>
      )}
      {avisoDescarga && <p className="text-[11px] text-amber-300/90 leading-snug">{avisoDescarga}</p>}

      {mensaje && <p className="text-[11px] text-zinc-400 leading-snug">{mensaje}</p>}

      {estado.fase === "error" && (
        <div className="rounded border border-red-900/60 bg-red-950/40 p-2 space-y-1">
          <p className="text-[11px] text-red-300 leading-snug">{estado.texto}</p>
          {estado.solucion && <p className="text-[11px] text-zinc-300 leading-snug">→ {estado.solucion}</p>}
          {estado.puedeAprovisionar && (
            <p className="text-[11px] text-amber-300/90 leading-snug">
              → Falta el toolchain: «Exportar APK y listo» lo prepara solo y reintenta. Si preferís hacerlo a mano: «pasos manuales» → ⚙ Preparar herramientas.
            </p>
          )}
        </div>
      )}

      {provision && estado.fase === "preparando" && (
        <div className="rounded border border-amber-900/50 bg-amber-950/25 p-2 space-y-1">
          <p className="text-[11px] text-amber-200 leading-snug">
            {provision.paso || "planificando…"} · {provision.bajadoMB} MB {provision.totalNota ? `de ${provision.totalNota}` : ""}
          </p>
          <details open className="group">
            <summary className="text-[10px] font-mono text-zinc-500 cursor-pointer select-none">log ({provision.lineas.length})</summary>
            <pre className="mt-1 max-h-32 overflow-y-auto text-[10px] leading-tight text-zinc-400 bg-[#020306] border border-zinc-800 rounded p-2 whitespace-pre-wrap break-all custom-scrollbar">
              {provision.lineas.slice(-24).join("\n") || "…"}
            </pre>
          </details>
        </div>
      )}

      {(estado.fase === "compilando" || log.length > 0) && (
        <details open={estado.fase === "compilando"} className="group">
          <summary className="text-[10px] font-mono text-zinc-500 cursor-pointer select-none">
            log de Gradle {log.length ? `(${log.length} líneas)` : ""}
          </summary>
          <pre className="mt-1 max-h-40 overflow-y-auto text-[10px] leading-tight text-zinc-400 bg-[#020306] border border-zinc-800 rounded p-2 whitespace-pre-wrap break-all custom-scrollbar">
            {log.slice(-30).join("\n") || "…"}
          </pre>
        </details>
      )}
    </div>
  );
};

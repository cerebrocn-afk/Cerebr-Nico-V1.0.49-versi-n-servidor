// ============================================================
// v1.57.9 — EL CICLO OpenAI-COMPAT, FUERA DEL MONOLITO
// ------------------------------------------------------------
// MOVIMIENTO, NO MEJORA (regla de la casa: la Fase 2 es PARTIR, no añadir).
// La rama que usan Z.ai/GLM, Groq, OpenRouter y compañía para ejecutar
// herramientas de verdad vivía en server.ts. Aquí llega la sesión exportada
// del 14/10: el ciclo necesitó su primera cirugía seria (lazo suave, argumentos
// truncados, pasos con obra) y creció; el trinquete (`contrato-rutas.json`)
// avisa cuando server.ts engorda, así que el ciclo entero se va a su módulo
// hoja. Las dependencias ya viajaban todas por `opts` (doFetch, ctx,
// ejecutarHerramienta): mover la orquesta sin tocar una nota.
//
// La lógica VERIFICABLE (ensamblado SSE, guardia de repetición, truncamiento,
// presupuesto con obra) sigue en `src/engine/cicloHerramientasOpenAICompat.ts`
// — pura, testeable sin API. Este archivo es solo la parte con red.
// ============================================================
import { StreamContext } from "./streamContext";
// v1.88.1 · el ✗ con motivo y el corte por fallos repetidos de la MISMA herramienta
// (args válidos + resultado siempre fallido = bucle «pensando», sesión 1793231473406).
import {
  nuevoVigilanteFallos, vigilarFallo, motivoDeResultado,
  directivaPorFallos, cierrePorFallos, UMBRAL_CORTE_FALLOS,
} from "../src/engine/vigilanteDeFallos";
// v1.74.0 · AUTOAPRENDIZAJE EN TIEMPO REAL (suite): la pareja fallo→éxito de
// cada herramienta se anota como lección en el acto, también en la nube.
import { notificarFalloHerramienta, notificarExitoTrasFallo } from "./aprendizajeVivo";
import { abrirTurnoPropuestas, notificarFalloRecurrente } from "./propuestasAutonomas";
import {
  MAX_REEMPUJES_ANUNCIO,
  motivoDeParada,
  directivaDeReanudacion,
  cierreIntencionSinEjecutar,
} from "../src/engine/bucleAutonomo";
import {
  acumularToolCallsDelta,
  finalizarToolCalls,
  parsearArgsHerramienta,
  construirMensajeAsistenteConTools,
  construirMensajeRespuestaTool,
  extraerDatosDeLineaSSE,
  parsearArgsConEstado,
  anotarRepeticion,
  REPETICION_SIN_VER,
  UMBRAL_REPETICION,
  TOPE_INTERVENCIONES,
  esHerramientaDeObra,
  // v1.0.14 · la ejecución sana (pc_exec/exec/run_command) también compra pasos.
  esHerramientaDeEjecucion,
  techoPasosConObra,
  // v1.66.1 · el paso también se paga con LECTURA sana (ver techoPasosConProgreso).
  techoPasosConProgreso,
  DIRECTIVA_TRUNCAMIENTO,
  directivaRepeticion,
  cierrePorLazoAgotado,
  // v1.60.17 — circuito de reescritura idéntica (corta el giro del Quirófano).
  TOPE_REESCRITURA_IDENTICA,
  esRechazoReescrituraIdentica,
  cierrePorReescrituraIdentica,
  // v1.57.10 — vigilante de fallos de argumentos.
  nuevoVigilanteArgs,
  registrarFalloArgs,
  DIRECTIVA_SIN_HERRAMIENTAS,
  UMBRAL_SIN_HERRAMIENTAS,
  // v1.58.2 — captura de tool-calls emitidas como TEXTO (modelos sin
  // function-calling nativo, p. ej. openrouter/free).
  extraerLlamadasEnTexto,
  // v1.67.1 — el chat deja de ser la mesa de trabajo (raíz:línea 388 en vivo / 410 tirando textoLimpio).
  crearFiltroDeVallas,
  normalizarArgsAlias,
  construirDirectivaResultadosTextuales,
  // v1.58.4 — B3 entrega incremental + B4 gate de auto-revisión.
  DIRECTIVA_ENTREGA_INCREMENTAL,
  tareaPareceGrande,
  revisarObraEscrita,
  directivaAutorrevision,
  // v1.67.0 · ÍTEM 1.2 — la web entregada de molde (detector escrito en v1.66.0
  // y nunca llamado). Va en el MISMO embudo B4, no en el monolito: trinquete.
  revisarPlantillaWeb,
  MAX_AUTORREVISION,
  type AcumuladorToolCall,
  type EstadoRepeticion,
} from "../src/engine/cicloHerramientasOpenAICompat";
// v1.59.1 — GATE DE CIERRE unificado: cablea los modulos de certeza que hasta
// ahora eran huerfanos (auditoriaBucle, autorrevision, autocorrector,
// matrizVerificacion, grafoDependencias, motorContexto, memoriaEstrategias,
// extraerFirmas). evaluarCierre() los compone en una segunda capa de senal que
// complementa (no reemplaza) el gate propietario revisarObraEscrita.
import { evaluarCierre } from "../src/engine/gateCierre";
// v1.66.1 · LOS DOS MÓDULOS QUE v1.66.0 ESCRIBIÓ Y NUNCA LLAMÓ.
// `continuidadTurno` (BUG D: «el modelo anuncia y corta») y `contextoBucle`
// (detector de ciclos QUE SOBREVIVE a los turnos) tienen su test en verde y su
// comentario, pero ningún import: el ciclo estaba cortando el turno en «voy a…»
// exactamente igual que antes. El changelog lo decía él solo —«queda WIRING
// pendiente de cablear en server.ts en tu entorno»— y acá está ese cable.
//
// `contextoBucle` es el grave: ya estaba enganchado en los DOS bucles que quedaron
// dentro de server.ts (`runOllamaAgentLoop` y el de Gemini). Este ciclo se había
// mudado a su propio módulo en v1.57.9, y cuando llegó la funcionalidad de v1.64
// se le puso el detector a los bucles que estaban a mano. Los nueve proveedores
// que pasan por acá —OpenRouter, custom, Z.ai, Groq, Cerebras, Together, Mistral,
// DeepSeek, Fireworks— se quedaron sin memoria entre turnos. Justo Z.ai es el que
// la sesión del 23/10 denuncia: «z ai no contesto hoy, se cortaba pensando en la
// tarea». Sin `turnosEnBucle`, cada «sigue» nacía con el contador a cero y el
// mismo ciclo de siempre parecía la primera vez.
import {
  nuevoContextoBucle,
  abrirTurnoBucle,
  registrarPaso,
  evaluarContextoBucle,
  type EstadoContextoBucle,
} from "../src/engine/contextoBucle";
import { evaluarContinuidad } from "../src/engine/continuidadTurno";
import { contextoBucleSesion } from "../src/engine/contextoBucleSesion"; // v1.66.1 · memoria compartida con los bucles de Ollama y Gemini
// v1.69.0 · TURNO = CONTRATO EN LA NUBE (pedido de Mario, 24/10): el juez local
// ya consultaba el contrato de aceptación antes de cerrar (decidirBucle). Las
// once ramas OpenAI-compat no: el plan del modelo no llegaba al Planificador,
// las etapas no se tachaban y el turno se cortaba con etapas colgando. Acá
// viajan las tres piezas: espejo vivo (hoja del panel), contrato (criterios con
// evidencia) y la continuidad de plan con tope propio.
import {
  abrirTurnoVivo, cerrarTurnoVivo, empezarPasoVivo, terminarPasoVivo,
  declararPlanVivo, marcarTareaVivo, anotarVivo, hojaEnCurso, objetivoDesdeMensajes,
  publicarPlanDePalabras,
} from "../src/engine/espejoVivo";
import {
  registrarContratoDesdeTareas, estadoContrato, directivaDeContratoAbierto,
} from "../src/engine/planAdaptativo";
import { notaContinuidad, registrarPlanTurno, directivaDePlanPendiente, MAX_CONTINUIDAD_PLAN } from "./continuidadPlan";
import { actualizarPlanDesdeHerramienta, tareasPendientes, type TareaPlan } from "../src/engine/bucleAutonomo";
// v1.70.2 · LOS ESPEJOS ENTTRAN AL BUCLE (diagnóstico de la sesión exportada
// del 24/10, mensaje 17: «los espejos existen pero no se usan»). El modelo ya
// los ve en el system prompt cuando hay equipo activo, pero un modelo que
// narra sin ejecutar NO los llama: el re-empuje era la única voz del motor y
// nunca les nombraba. Esta nota se añade SOLO si el equipo está elegido y el
// turno todavía no llamó a `consultar_espejo` — un empujón con nombre y
// apellido, no un catálogo genérico.
import { notaEspejosDeEmpuje } from "../src/engine/reflejo/espejos"; // fuente única: la rama Gemini del monolito importa la MISMA función
/** Cuántas veces se le exige al modelo que ejecute lo que anunció. Acotado: no es bucle. */
export const MAX_CONTINUIDAD = 2;
import { hashArgsCanonico } from "../src/engine/hashArgs";
import type { InvocacionHerramienta } from "../src/auditoriaBucle";
// v1.60.0 — DOBLE ÁRBOL: el ciclo lleva su gestor de proyecciones (entrada vs
//   sandbox) y aplica el guardián de escritura ANTES de dispatch a disco, para
//   que el motor no pise material del usuario que no se promovió al sandbox.
import { GestorArboles, validarPermisoEscrituraSandbox, validarPermisoLecturaSandbox } from "../src/gestorArboles";
import type { OrigenArchivo } from "../src/types/arboles";

/**
 * v1.69.0 · LA HOJA VIVA TAMBIÉN EN LA NUBE.
 * El bucle local abre su hoja con el mismo patrón (`runOllamaAgentLoop` en
 * server.ts): abrir → trabajar → cerrar SIEMPRE. Hasta acá, las ramas de nube
 * ejecutaban herramientas sin hoja: el Planificador no encendía, el paso no se
 * veía, y al cerrar el turno no había acta. El wrapper abre solo si no hay otra
 * hoja en curso (Gemini/Ollama pueden tenerla) y cierra en `finally` — ninguna
 * salida del ciclo, por errática que sea, deja una hoja huérfana pulsando.
 */
export async function ejecutarCicloHerramientasOpenAICompat(opts: OptsCiclo): Promise<ResultadoCiclo> {
  const abrioAca = !hojaEnCurso();
  if (abrioAca) {
    try { abrirTurnoVivo(objetivoDesdeMensajes(opts.mensajes)); } catch { /* espejo auxiliar: nunca frena el turno */ }
  }
  try {
    return await cicloHerramientasOpenAICompatInterno(opts);
  } finally {
    if (abrioAca) { try { cerrarTurnoVivo(); } catch { /* idem */ } }
  }
}
type OptsCiclo = Parameters<typeof cicloHerramientasOpenAICompatInterno>[0];
type ResultadoCiclo = Awaited<ReturnType<typeof cicloHerramientasOpenAICompatInterno>>;

async function cicloHerramientasOpenAICompatInterno(opts: {
  doFetch: (cuerpo: any) => Promise<any>;
  cuerpoBase: Record<string, any>;
  mensajes: any[];
  herramientas: any[];
  ejecutarHerramienta: (nombre: string, args: any) => Promise<string>;
  ctx: StreamContext;
  maxPasos?: number;
  // v1.58.2 — nombres de herramienta válidos (para parsear llamadas textuales
  // aunque al modelo no se le ofrezcan tools por el canal nativo). Opcional:
  // si falta, se derivan de `herramientas`.
  nombresHerramientas?: string[];
  /**
   * v1.66.1 — memoria del detector de ciclos. El llamador pasa el singleton de
   * sesión (`contextoBucleSesion` en server.ts) para que el ciclo sobrevivido
   * cuente también a través de los «sigue». Si no se pasa, se usa uno propio:
   * el ciclo pierde la memoria entre turnos pero conserva la detección interna,
   * que ya es más de lo que había hasta acá.
   */
  contextoBucle?: EstadoContextoBucle;
}): Promise<{ ok: boolean; emittedAny: boolean; failReason?: string }> {
  const { doFetch, cuerpoBase, mensajes, herramientas, ejecutarHerramienta, ctx } = opts;
  // v1.58.2 — conjunto de nombres VÁLIDOS para reconocer tool-calls escritas
  // en el texto. Si el llamador no pasa `nombresHerramientas`, se derivan de
  // las propias `herramientas` ofrecidas (OpenAI tool spec).
  const nombresValidos = new Set<string>(
    (opts.nombresHerramientas && opts.nombresHerramientas.length
      ? opts.nombresHerramientas
      : (Array.isArray(herramientas) ? herramientas : []).map(
          (h: any) => h?.function?.name || h?.name
        )
    )
      .filter((n: any) => typeof n === "string" && n.trim())
      .map((n: string) => n.trim().toLowerCase())
  );
  // v1.57.9 — la base era 8 pasos y NO crecía: una tarea de 12 archivos moría
  // al paso 8 con la escritura a mitad («se queda a mitad de la tarea», sesión
  // 14/10). Ahora cada escritura que sale bien compra 2 pasos más.
  // v1.0.14 · base 12→24 y tope 36→96 (en el módulo puro): la sesión
  // 1794293050619 muestra turnos cortados a los 12 pasos ≈ 3 minutos con obra
  // SANITA en marcha («antes trabajaba más de 20 minutos», Mario 10/11).
  let maxPasos = Math.max(4, opts.maxPasos ?? 24);
  let escriturasOk = 0;
  // v1.66.1 — PROGRESO DE LECTURA: llamadas sanas y DISTINTAS que no escribieron
  // nada pero aportaron información. Es lo que compra pasos extra en un reporte,
  // un diagnóstico o una revisión (cero escrituras, mucho trabajo).
  let lecturasNuevasOk = 0;
  // v1.0.14 — contador de EJECUCIONES sanas y distintas (pc_exec etc.): work real
  // de test-and-fix que antes no compraba ni un paso (ver techoPasosConProgreso).
  let ejecucionesOk = 0;
  const clavesYaVistas = new Set<string>();
  // v1.66.1 — DETECTOR DE CICLOS CON MEMORIA (ver el import de contextoBucle).
  const bucle: EstadoContextoBucle = opts.contextoBucle ?? contextoBucleSesion;
  abrirTurnoBucle(bucle);
  abrirTurnoPropuestas(); // v1.76.0 · auto-propuesta: el contador de patrones abre turno también en la nube
  let avisoBucle = "";      // ciclo detectado → se INYECTA como mensaje de usuario
  let lazoBucle = "";       // el ciclo ya es terco → se cierra el turno con la verdad
  let continuidades = 0;    // v1.66.1 — cupo de «ejecutá lo que anunciaste»
  const tieneHerramientas = Array.isArray(herramientas) && herramientas.length > 0;
  let emittedAny = false;
  let huboToolExec = false;
  let reempujes = 0; // v1.55.1 — presupuesto de re-empujes/turno (anuncio sin acción): escala y topa
  let espejoInvocado = false; // v1.70.2 — ¿el modelo llamó espejos en este turno? (para no repetir el consejo)
  // v1.58.4 — CONTINUACIÓN POR CORTE DE TOKENS con presupuesto PROPIO. Antes el
  //   corte real (finish_reason:"length") gastaba el MISMO cupo que el anti-«voy
  //   a…», así que una respuesta larga y legítima se quedaba sin reintentos de
  //   continuación y moría a la mitad (queja de Mario: «se corta y se pierde
  //   todo»). Un corte declarado por el proveedor NO es un anuncio vacío: merece
  //   su propio cupo, más alto.
  const MAX_CONTINUACIONES_CORTE = 6;
  let continuacionesCorte = 0;
  // v1.57.9 — GUARDIA DEL LAZO (antes no existía aquí: el único freno era
  // quedarse sin pasos) y CACHE de salidas para no re-ejecutar la misma llamada.
  let guardia: EstadoRepeticion = { ...REPETICION_SIN_VER };
  let intervenciones = 0;
  const salidaPorClave = new Map<string, string>();
  let lazoAgotado = "";
  // v1.60.17 — CIRCUITO DE REESCRITURA IDÉNTICA: cuenta los rechazos
  //   «REESCRITURA IDÉNTICA» del Quirófano en CUALQUIER archivo del turno. El
  //   lazo suave (clave consecutiva) no los caza cuando el modelo rota entre
  //   varios archivos; este contador por turno sí, y corta el giro.
  let reescriturasIdenticas = 0;
  const rutasReescritasIdenticas: string[] = [];
  let cortePorReescritura = false;
  // v1.88.1 · vigilancia de fallos repetidos: args válidos y mismo fallo no es
  // reintentar, es trabarse (captura: 6 ✗ de write_file, 6 min, CPU 100 %).
  const vigilanteFallos = nuevoVigilanteFallos();
  let cortePorFallos: string | null = null;
  let motivoCorteFallos = "";
  const vigilante = nuevoVigilanteArgs(); // v1.57.10
  let hayDirectivaArgs = false;
  let pendientesAlCorte: string[] = []; // herramientas que el modelo pedía al agotarse los pasos
  // v1.58.4 — B3: el protocolo de entrega incremental se inyecta UNA sola vez,
  //   cuando la tarea ya dio señales de ser grande (no grava tareas pequeñas).
  let protocoloEntregaInyectado = false;
  // v1.58.4 — B4: estado FINAL por archivo escrito este turno (path -> contenido)
  //   y presupuesto acotado de auto-revisiones para no cerrar sobre obra a medias.
  const escritosTurno = new Map<string, string>();
  // ── v1.69.0 · TURNO = CONTRATO, TAMBIÉN EN LA NUBE ──
  // El plan que el modelo escribe con `set_plan` vive acá durante el turno:
  // sus etapas sin tachar son las que deciden que el turno NO cierre.
  const planTurno: TareaPlan[] = [];
  let planTocadoEsteTurno = false;
  let continuidadesPlan = 0;
  {
    // B1.2 en la nube: «el plan no se reinicia cada mensaje». El plan anterior
    // con pendientes entra como nota de sistema ANTES de la primera llamada.
    const notaPrev = notaContinuidad();
    if (notaPrev) mensajes.push({ role: "system", content: notaPrev });
  }
  /**
   * v1.69.0 · El espejo que el bucle local ya hacía y la nube no: cada
   * herramienta pisa su paso en la hoja viva (actividad visible en el
   * Planificador) y `set_plan`/`update_task` alimentan hoja + contrato de
   * aceptación + los eventos que el navegador escucha. Tolerante a fallos: el
   * planificador es auxiliar — nada de acá puede cortar un turno que funciona.
   */
  const espejarEnPlanificador = (nombre: string, args: any, ok: boolean, motivo?: string): void => {
    const n = String(nombre || "").toLowerCase();
    const detalle =
      args?.path ? String(args.path)
      : args?.command ? String(args.command).slice(0, 80)
      : args?.content ? `(${String(args.content).length} bytes)`
      : "";
    // v1.74.0 · igual que en el lazo local: el éxito que llega DESPUÉS de un
    // fallo de la misma herramienta es el momento exacto en que la nube
    // aprendió algo — se anota ya (LECCIONES.md + KB + espejo), no al cerrar.
    try {
      if (ok) notificarExitoTrasFallo(n, detalle || undefined);
      else {
        notificarFalloHerramienta(n, detalle ? `con ${detalle.slice(0, 90)}` : "sin detalle");
        // v1.76.0 · mismo hecho al contador de patrones (auto_propose): en la
        // nube la evidencia disponible es el argumento de la herramienta; un
        // path repetido tres turnos seguidos es exactamente el patrón «ruta».
        notificarFalloRecurrente(n, detalle || "sin detalle");
      }
    } catch { /* aprender nunca corta un turno que funciona */ }
    try {
      empezarPasoVivo(n, detalle);
      // v1.88.1 · el ✗ dice POR QUÉ: el motivo real de la herramienta reemplaza
      // al síntoma genérico, tanto en la hoja viva como en el panel de acciones.
      const motivoVisible = ok ? null : (motivo || motivoDeResultado(""));
      terminarPasoVivo(ok, motivoVisible);
      ctx.sendTaskEvent({ type: "action", action: { tool: n, detail: detalle, ok, motivo: motivoVisible } } as any);
    } catch { /* hoja cerrada a mitad de turno: no hay espejo que escribir */ }
    if (n === "set_plan" && Array.isArray(args?.tasks)) {
      try {
        declararPlanVivo(args.tasks);
        registrarContratoDesdeTareas(args.tasks);
        actualizarPlanDesdeHerramienta(planTurno, n, args);
        planTocadoEsteTurno = true;
        registrarPlanTurno(planTurno);
        ctx.sendTaskEvent({
          type: "plan",
          tasks: planTurno.map((t) => ({ id: t.id, description: t.description, status: t.status })),
        } as any);
      } catch { /* idem */ }
    } else if (n === "update_task") {
      try {
        const tid = String(args?.task_id || args?.taskId || "");
        // `marcarTareaVivo` ya sincroniza adentro el contrato de aceptación
        // (actualizarEstadoContrato + registrarEvidenciaContrato): llamarlos
        // también acá duplicaría la evidencia. Mismo cable que el bucle local.
        marcarTareaVivo(tid, args?.status, Date.now(), args?.evidencia);
        actualizarPlanDesdeHerramienta(planTurno, n, args);
        planTocadoEsteTurno = true;
        registrarPlanTurno(planTurno);
        ctx.sendTaskEvent({ type: "update", taskId: tid, status: args?.status } as any);
      } catch { /* idem */ }
    }
  };
  // v1.60.0 — DOBLE ÁRBOL: proyección de entrada/sandbox viva durante el turno.
  //   ingresar_archivo_workspace / promover_archivo_sandbox son bookkeeping puro
  //   (no tocan disco): se resuelven aquí sin llamar a ejecutarHerramienta. Las
  //   herramientas de obra pasan primero por el guardián; si la ruta no estaba
  //   registrada, se da de alta como sandbox_target (ya es parte de la obra).
  const gestorArboles = new GestorArboles();
  const ESCRITURAS_SANDBOX = new Set(["write_file", "edit_file", "append_file", "delete_file"]);
  const LECTURAS_SANDBOX = new Set(["read_file", "read_file_range"]);
  /**
   * Intercepta las herramientas del doble árbol. Devuelve un string de salida
   * (JSON) cuando la herramienta se resuelve/bloquea aquí, o `null` para dejar
   * que el dispatch normal a disco continúe.
   */
  function interceptarArboles(nombre: string, args: any): string | null {
    const n = String(nombre || "").toLowerCase();
    const path = typeof args?.path === "string" ? args.path : "";
    if (n === "ingresar_archivo_workspace") {
      const origen = (args?.origen as OrigenArchivo) || "chat_drop";
      try {
        const nodo = gestorArboles.registrarArchivoEntrada({
          pathRelativo: path,
          contenido: typeof args?.content === "string" ? args.content : "",
          origen,
        });
        return JSON.stringify({
          ok: true,
          arbol: nodo.incluidoEnSandbox ? "sandbox" : "entrada",
          path: nodo.pathRelativo,
          mensaje: nodo.incluidoEnSandbox
            ? "Registrado y promovido al sandbox (origen sandbox_target)."
            : "Registrado en el árbol de entrada (fuera del sandbox hasta promover).",
        });
      } catch (e: any) {
        return JSON.stringify({ ok: false, error: String(e?.message || e) });
      }
    }
    if (n === "promover_archivo_sandbox") {
      if (!gestorArboles.existe(path)) {
        return JSON.stringify({
          ok: false,
          error: `La ruta "${path}" no está en el árbol de entrada: ingésala antes con ingresar_archivo_workspace.`,
        });
      }
      const cambio = gestorArboles.promoverASandbox(path);
      return JSON.stringify({ ok: true, promovido: cambio, path, mensaje: cambio ? "Promovido al sandbox." : "Ya estaba en el sandbox." });
    }
    if (ESCRITURAS_SANDBOX.has(n) && path) {
      const permiso = validarPermisoEscrituraSandbox(gestorArboles, path);
      if (!permiso.permitido) {
        return JSON.stringify({ ok: false, error: permiso.motivo });
      }
      // Ruta permitida: si aún no estaba registrada, es obra nueva -> alta como
      // sandbox_target para que el guardián sea coherente en escrituras futuras.
      if (!gestorArboles.existe(path) && n !== "delete_file") {
        gestorArboles.registrarArchivoEntrada({
          pathRelativo: path,
          contenido: typeof args?.content === "string" ? args.content : "",
          origen: "sandbox_target",
        });
      }
    }
    if (LECTURAS_SANDBOX.has(n) && path) {
      // v1.60.3 — el aislamiento también cubre la LECTURA: no se carga a contexto
      //   material de entrada no promovido. Rutas nuevas/sandbox pasan.
      const permiso = validarPermisoLecturaSandbox(gestorArboles, path);
      if (!permiso.permitido) {
        return JSON.stringify({ ok: false, error: permiso.motivo });
      }
    }
    return null;
  }
  let autorrevisiones = 0;
  // v1.59.1 — historial de invocaciones (tool + hash canonico de args) para el
  //   cortafuegos de bucle del gate de cierre (ciclos A-B-A-B y saturacion).
  const historialHerramientas: InvocacionHerramienta[] = [];
  // v1.47.0 — Resumen de acciones: para que «Herramientas ejecutadas» deje de ser
  // un mensaje vacío y diga QUÉ se hizo (archivos escritos, comandos, etc.).
  const accionesHechas: string[] = [];
  const resumirAcciones = (): string => {
    if (accionesHechas.length === 0) return "";
    const vistos = accionesHechas.slice(-8);
    const mas = accionesHechas.length - vistos.length;
    return `\n` + vistos.map((a) => `  • ${a}`).join("\n") + (mas > 0 ? `\n  • …y ${mas} acción(es) más` : "");
  };
  // v1.57.9 — aviso de obra pendiente: se emite UNA sola vez, por el camino de
  // retorno que se cierre (final dentro del paso o agotados los pasos).
  let obraPendienteAvisada = false;
  const avisarObraPendiente = () => {
    if (obraPendienteAvisada || pendientesAlCorte.length === 0) return;
    obraPendienteAvisada = true;
    ctx.sendChunk(
      `\n\n⏳ Quedaban acciones pendientes (${pendientesAlCorte.join(", ")}) cuando se agotó el presupuesto de pasos del turno. Pídeme «sigue» y continúo por donde iba.`
    );
  };
  // v1.69.0 · CIERRE HONESTO DEL PLAN: agotadas las auto-preguntas sin que el
  // modelo tachara las etapas, el turno se cierra DICIENTO qué etapas quedan
  // abiertas — «parcial», jamás «Hecho». El turno coincide con la entrega.
  let planPendienteAvisado = false;
  const planEtapasAbiertas = (): TareaPlan[] => (planTocadoEsteTurno ? tareasPendientes(planTurno) : []);
  const avisarPlanSinCerrar = (): void => {
    if (planPendienteAvisado) return;
    planPendienteAvisado = true;
    const pend = planEtapasAbiertas();
    if (pend.length === 0) return;
    ctx.sendChunk(
      `\n\n⚠️ EL PLAN NO QUEDÓ CERRADO — ${pend.length} etapa(s) sin tachar en el Planificador:\n` +
      pend.map((t) => `  [ ] #${t.id} ${t.description}`).join("\n") +
      `\nDecí «seguí» y sigo por donde iba (el plan persiste), o pedime que lo reencuadre.`
    );
  };
  /**
   * v1.66.1 · LIBRO DE PASOS, UNA SOLA VEZ POR RAMA.
   * Antes el registro vivía duplicado en server.ts (bucle Ollama) y en la rama
   * Gemini; acá no existía. Apunta el paso al detector de ciclos y, si la
   * llamada es sanA y NUNCA se había hecho, le compra un paso más al turno.
   * `esHerramientaDeObra` reinicia la secuencia (avanzó de verdad): es el mismo
   * control de falso positivo que ya usaban los otros dos bucles.
   */
  const anotarPaso = (nombre: string, argsCrudo: string, ok: boolean): void => {
    registrarPaso(bucle, `${nombre}\u0000${argsCrudo || ""}`, ok && esHerramientaDeObra(nombre));
    const vb = evaluarContextoBucle(bucle);
    if (vb.mensaje) {
      avisoBucle = vb.mensaje;
      console.log(`[bucle] 🔁 ciclo visible: ${vb.ciclo?.repeticiones}ª vuelta de un ciclo de ${vb.ciclo?.periodo} paso(s)`);
    }
    if (vb.debeCortar) {
      lazoBucle = (vb.ciclo?.patron || []).map((t) => String(t).split("\u0000")[0]).join(" → ");
    }
    const clave = `${nombre}:${argsCrudo || ""}`;
    if (ok && !esHerramientaDeObra(nombre) && !clavesYaVistas.has(clave)) {
      clavesYaVistas.add(clave);
      if (esHerramientaDeEjecucion(nombre)) ejecucionesOk++;
      else lecturasNuevasOk++;
      maxPasos = Math.max(maxPasos, techoPasosConProgreso(escriturasOk, lecturasNuevasOk, ejecucionesOk));
    }
  };

  for (let paso = 0; paso <= maxPasos; paso++) {
    if (ctx.isAborted()) return { ok: true, emittedAny };

    // v1.58.4 — B3: en cuanto la tarea da señales de ser grande (≥2 escrituras
    //   o un corte por tokens ya ocurrido), se inyecta UNA vez el protocolo de
    //   entrega incremental, para que el modelo entregue por partes completas y
    //   un corte sólo pierda la parte en curso — nunca lo ya escrito.
    if (
      !protocoloEntregaInyectado &&
      tieneHerramientas &&
      tareaPareceGrande(escriturasOk, continuacionesCorte)
    ) {
      protocoloEntregaInyectado = true;
      mensajes.push({ role: "user", content: DIRECTIVA_ENTREGA_INCREMENTAL });
      console.log(`[bucle] B3 entrega incremental activada (escriturasOk=${escriturasOk}, cortes=${continuacionesCorte})`);
    }

    const cuerpo: any = { ...cuerpoBase, messages: mensajes, stream: true };
    // v1.57.10 — con 3 fallos de ARGUMENTOS seguidos el problema es del modelo
    // con el formato: se le retiran las herramientas y cierra en texto honesto.
    if (tieneHerramientas && vigilante.seguidos < UMBRAL_SIN_HERRAMIENTAS) {
      cuerpo.tools = herramientas;
      cuerpo.tool_choice = "auto";
    }

    let resp: any;
    try {
      resp = await doFetch(cuerpo);
    } catch (e: any) {
      return { ok: false, emittedAny, failReason: e?.message || String(e) };
    }

    // HTTP no-OK: construimos un failReason legible (igual que las ramas v1.43).
    if (!resp || !resp.ok || !resp.body) {
      let errBody = "";
      try { errBody = await resp.text(); } catch {}
      let msg = `HTTP ${resp?.status ?? "???"}`;
      try {
        const j = JSON.parse(errBody);
        if (j?.error?.message) msg = j.error.message;
        else if (j?.error) msg = String(j.error);
        else if (j?.message) msg = j.message;
      } catch {}
      const extra = errBody && !msg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "";
      // v1.75.0 · BUG MEDIDO (sesión 1792979455736): OpenRouter rechazaba
      // SIEMPRE el pedido con «This request requires more credits… You
      // requested up to 131072 tokens, but can only afford 14303» — el chip
      // Presupuesto pide 131k y la clave gratis no llega: el turno moría sin
      // intento. Ahora el ciclo LEE el número que el propio proveedor dicta y
      // re-marca UNA vez con ese tope (menos un margen) antes de rendirse.
      const afford = /can only afford\s+(\d+)/i.exec(msg + extra);
      let reintentoPresupuesto = false;
      if (afford && !emittedAny && !ctx.isAborted()) {
        const pedido = Number(cuerpo.max_tokens || 0);
        const tope = Math.max(256, Math.min(Number(afford[1]) - 256, pedido > 0 ? pedido : 8192));
        if (Number.isFinite(tope) && (pedido <= 0 || tope < pedido)) {
          cuerpo.max_tokens = tope;
          try {
            const resp2 = await doFetch(cuerpo);
            if (resp2 && resp2.ok && resp2.body) {
              reintentoPresupuesto = true;
              resp = resp2;
            }
          } catch { /* se rinde abajo, con el error original */ }
        }
      }
      if (!reintentoPresupuesto) {
        return { ok: false, emittedAny, failReason: msg + extra };
      }
    }

    // Lectura del stream SSE: texto en vivo + ensamblado de tool_calls.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sseBuf = "";
    let textoTurno = "";
    // v1.67.1 — retiene las vallas de herramienta mientras se forman, para que no
    // se escriban en el chat. Es POR PASO: cada paso forma su propia salida.
    const filtroChat = crearFiltroDeVallas(nombresValidos);
    // v1.57.9 — «length» significa que el PROVEEDOR cortó por su tope de
    // tokens: la frase quedó a medias o los arguments incompletos. Antes este
    // dato viajaba en el stream y nadie lo leía nunca.
    let finishPaso = "";
    const accTool = new Map<number, AcumuladorToolCall>();
    try {
      while (true) {
        if (ctx.isAborted()) break;
        const { done, value } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const lineas = sseBuf.split("\n");
        sseBuf = lineas.pop() || "";
        for (const linea of lineas) {
          const data = extraerDatosDeLineaSSE(linea);
          if (!data) continue;
          const fr = data.choices?.[0]?.finish_reason;
          if (fr) finishPaso = String(fr);
          const delta = data.choices?.[0]?.delta;
          const contenido = delta?.content;
          if (contenido) {
            // v1.67.1 — antes: `ctx.sendChunk(contenido)` a secas, o sea cada
            // carácter del modelo escrito en el chat en cuanto nacía, vallas de
            // herramienta incluidas. El filtro decide al cerrar la valla, y `textoTurno`
            // sigue recibiendo TODO (la extracción de llamadas no se entera de esto).
            const visible = filtroChat.escribir(contenido);
            if (visible) ctx.sendChunk(visible);
            textoTurno += contenido;
            emittedAny = true;
          }
          if (tieneHerramientas) acumularToolCallsDelta(accTool, delta?.tool_calls);
        }
      }
    } finally {
      try { await reader.cancel(); } catch {}
    }

    if (ctx.isAborted()) return { ok: true, emittedAny };

    let llamadas = tieneHerramientas ? finalizarToolCalls(accTool) : [];

    // v1.58.2 — FALLBACK DE TOOL-CALLS TEXTUALES: si el modelo NO usó el canal
    // nativo (`delta.tool_calls` vacío) pero escribió la llamada en el texto
    // (openrouter/free y compañía), la capturamos y la ejecutamos de verdad.
    // Esta es la cura del «no tienes acceso al editor/sandbox»: antes la
    // llamada se perdía como prosa y la herramienta jamás corría.
    let fueronTextuales = false;
    if (llamadas.length === 0 && nombresValidos.size > 0 && textoTurno.trim()) {
      const extra = extraerLlamadasEnTexto(textoTurno, nombresValidos);
      if (extra.llamadas.length > 0) {
        llamadas = extra.llamadas;
        fueronTextuales = true;
      }
    }

    // v1.67.1 — se libera lo retenido SÓLO si el turno no convirtió nada en acción.
    // Si salió una llamada, esa valla ya se está ejecutando en la mesa de trabajo y
    // no debe verse en el chat; si no salió ninguna, era prosa o código del sitio, y
    // se muestra tal cual. Ninguna respuesta se puede perder por este filtro.
    const restoChat = filtroChat.cerrar(llamadas.length > 0);
    if (restoChat) ctx.sendChunk(restoChat);

    if (llamadas.length > 0 && paso >= maxPasos) pendientesAlCorte = llamadas.map((l) => l.name);

    // v1.58.2 — rama TEXTUAL: el modelo habla texto, no el protocolo role:tool.
    // Ejecutamos sus llamadas y le devolvemos los resultados en PROSA (user),
    // nunca con tool_calls+role:tool que no sabe consumir.
    if (fueronTextuales && llamadas.length > 0 && paso < maxPasos) {
      mensajes.push({ role: "assistant", content: textoTurno });
      const resultadosTxt: Array<{ nombre: string; salida: string }> = [];
      for (const l of llamadas) {
        const clave = `${l.name}:${l.arguments || ""}`;
        guardia = anotarRepeticion(guardia, clave);
        historialHerramientas.push({ toolName: l.name, argsHash: hashArgsCanonico(l.arguments) });
        if (guardia.veces >= UMBRAL_REPETICION) {
          intervenciones++;
          if (intervenciones > TOPE_INTERVENCIONES) { lazoAgotado = l.name; break; }
          resultadosTxt.push({ nombre: l.name, salida: directivaRepeticion(l.name, guardia.veces, salidaPorClave.get(clave) || "") });
          continue;
        }
        const estado = parsearArgsConEstado(l.arguments);
        if (!estado.ok && estado.truncado) {
          resultadosTxt.push({ nombre: l.name, salida: DIRECTIVA_TRUNCAMIENTO });
          accionesHechas.push(`✂️ ${l.name} — argumentos truncados, dividido en partes`);
          continue;
        }
        let crudo: string;
        try {
          const argsTxt = normalizarArgsAlias(estado.ok ? estado.args : parsearArgsHerramienta(l.arguments));
          const bloqueo = interceptarArboles(l.name, argsTxt);
          crudo = bloqueo !== null ? bloqueo : await ejecutarHerramienta(l.name, argsTxt);
        } catch (e: any) {
          crudo = JSON.stringify({ ok: false, error: String(e?.message || e) });
        }
        huboToolExec = true;
        salidaPorClave.set(clave, crudo);
        resultadosTxt.push({ nombre: l.name, salida: crudo });
        if (esRechazoReescrituraIdentica(crudo)) {
          reescriturasIdenticas++;
          const rr = normalizarArgsAlias(estado.ok ? estado.args : parsearArgsHerramienta(l.arguments))?.path;
          if (rr) rutasReescritasIdenticas.push(String(rr));
          if (reescriturasIdenticas >= TOPE_REESCRITURA_IDENTICA) { cortePorReescritura = true; break; }
        }
        try {
          const a = normalizarArgsAlias(estado.ok ? estado.args : parsearArgsHerramienta(l.arguments)) || {};
          const obj = a.path || a.command || a.query || a.name || a.task_id || "";
          let ok = true;
          try { ok = JSON.parse(crudo)?.ok !== false; } catch {}
          accionesHechas.push(`${ok ? "✔" : "✖"} ${l.name}${obj ? ` — ${String(obj).slice(0, 80)}` : ""}`);
          anotarPaso(l.name, l.arguments || "", ok); // v1.66.1 · la rama textual también escribe el libro de pasos
          // v1.88.1 · el ✗ lleva el motivo real de la herramienta, y el mismo
          // fallo repetido deja de ser reintentar: a los 3 se le avisa al modelo,
          // a los 5 se corta el turno (captura: 6 ✗ de write_file, 6 min, 100 % CPU).
          const motivoFallo = ok ? "" : motivoDeResultado(crudo);
          espejarEnPlanificador(l.name, a, ok, motivoFallo); // v1.69.0 · la nube también pisa el Planificador
          {
            const vig = vigilarFallo(vigilanteFallos, l.name, ok, motivoFallo);
            if (vig.justoAviso) mensajes.push({ role: "user", content: directivaPorFallos(vig.herramienta, vig.seguidos, motivoFallo) });
            if (vig.corto) { cortePorFallos = vig.herramienta; motivoCorteFallos = motivoFallo; }
          }
          if (ok && esHerramientaDeObra(l.name)) {
            escriturasOk++;
            maxPasos = Math.max(maxPasos, techoPasosConProgreso(escriturasOk, lecturasNuevasOk, ejecucionesOk));
            // v1.58.4 — B4: guarda el estado FINAL del archivo (args ya
            //   normalizados: ruta->path, contenido->content).
            if (typeof a.path === "string" && a.path.trim() && typeof a.content === "string") {
              escritosTurno.set(a.path, a.content);
            }
          }
        } catch { accionesHechas.push(`✔ ${l.name}`); }
      }
      if (resultadosTxt.length > 0) {
        mensajes.push({ role: "user", content: construirDirectivaResultadosTextuales(resultadosTxt) });
      }
      // v1.66.1 — el ciclo detectado se inyecta DESPUÉS de los resultados (nunca
      // en medio: el transcript textual es frágil) y antes de la nueva vuelta.
      if (avisoBucle) { mensajes.push({ role: "user", content: avisoBucle }); avisoBucle = ""; }
      if (cortePorReescritura) break;
      if (cortePorFallos) break; // v1.88.1 · cierre honesto abajo
      if (lazoAgotado) break;
      if (lazoBucle) break; // v1.66.1 · ciclo terco: cierre honesto abajo
      continue; // nueva vuelta: el modelo razona con resultados reales
    }

    // ¿El modelo pidió herramientas y quedan pasos? Se ejecutan de VERDAD y se
    // le devuelve el resultado para que razone con datos reales.
    if (llamadas.length > 0 && paso < maxPasos) {
      mensajes.push(construirMensajeAsistenteConTools(textoTurno, llamadas));
      for (const l of llamadas) {
        const clave = `${l.name}:${l.arguments || ""}`;
        guardia = anotarRepeticion(guardia, clave);
        historialHerramientas.push({ toolName: l.name, argsHash: hashArgsCanonico(l.arguments) });

        // v1.57.9 — LAZO SUAVE: la 3ª vez de la MISMA llamada no se ejecuta;
        // el modelo recibe el resultado que YA tuvo + la orden de cambiar.
        // Solo si sigue repitiendo tras 3 intervenciones se cierra el turno,
        // y entonces con aviso honesto (no con el «Detenido» seco de antes).
        if (guardia.veces >= UMBRAL_REPETICION) {
          intervenciones++;
          if (intervenciones > TOPE_INTERVENCIONES) { lazoAgotado = l.name; break; }
          mensajes.push(construirMensajeRespuestaTool(
            l.id, l.name,
            directivaRepeticion(l.name, guardia.veces, salidaPorClave.get(clave) || ""),
          ));
          continue;
        }

        // v1.57.9 — TRUNCAMIENTO: arguments a medias = la llamada NO se
        // ejecuta (antes se ejecutaba con args={} y escribía basura o nada).
        const estado = parsearArgsConEstado(l.arguments);
        if (!estado.ok && estado.truncado) {
          mensajes.push(construirMensajeRespuestaTool(l.id, l.name, DIRECTIVA_TRUNCAMIENTO));
          accionesHechas.push(`✂️ ${l.name} — argumentos truncados, dividido en partes`);
          continue;
        }

        let crudo: string;
        try {
          const argsNat = estado.ok ? estado.args : parsearArgsHerramienta(l.arguments);
          const bloqueo = interceptarArboles(l.name, argsNat);
          crudo = bloqueo !== null ? bloqueo : await ejecutarHerramienta(l.name, argsNat);
        } catch (e: any) {
          crudo = JSON.stringify({ ok: false, error: String(e?.message || e) });
        }
        mensajes.push(construirMensajeRespuestaTool(l.id, l.name, crudo));
        huboToolExec = true;
        if (l.name === "consultar_espejo") espejoInvocado = true; // v1.70.2
        salidaPorClave.set(clave, crudo);
        if (esRechazoReescrituraIdentica(crudo)) {
          reescriturasIdenticas++;
          try {
            const rr = ((estado.ok ? estado.args : parsearArgsHerramienta(l.arguments)) || {}).path;
            if (rr) rutasReescritasIdenticas.push(String(rr));
          } catch {}
          if (reescriturasIdenticas >= TOPE_REESCRITURA_IDENTICA) { cortePorReescritura = true; break; }
        }
        try {
          const a = (estado.ok ? estado.args : parsearArgsHerramienta(l.arguments)) || {};
          const obj = a.path || a.command || a.query || a.name || a.task_id || "";
          let ok = true;
          try { ok = JSON.parse(crudo)?.ok !== false; } catch {}
          {
            const vf = registrarFalloArgs(vigilante, !ok, crudo);
            if (vf.justoAlCruzarlo) hayDirectivaArgs = true; // se inyecta al final del bloque
          }
          accionesHechas.push(`${ok ? "✔" : "✖"} ${l.name}${obj ? ` — ${String(obj).slice(0, 80)}` : ""}`);
          anotarPaso(l.name, l.arguments || "", ok); // v1.66.1 · libro de pasos + compra por lectura
          // v1.88.1 · el ✗ lleva el motivo real de la herramienta, y el mismo
          // fallo repetido deja de ser reintentar: a los 3 se le avisa al modelo,
          // a los 5 se corta el turno (captura: 6 ✗ de write_file, 6 min, 100 % CPU).
          const motivoFallo = ok ? "" : motivoDeResultado(crudo);
          espejarEnPlanificador(l.name, a, ok, motivoFallo); // v1.69.0 · la nube también pisa el Planificador
          {
            const vig = vigilarFallo(vigilanteFallos, l.name, ok, motivoFallo);
            if (vig.justoAviso) mensajes.push({ role: "user", content: directivaPorFallos(vig.herramienta, vig.seguidos, motivoFallo) });
            if (vig.corto) { cortePorFallos = vig.herramienta; motivoCorteFallos = motivoFallo; }
          }
          // v1.57.9 — cada ESCRITURA sana compra 2 pasos más (tope 36): la
          // tarea larga termina en vez de morir a mitad de la tanda.
          if (ok && esHerramientaDeObra(l.name)) {
            escriturasOk++;
            maxPasos = Math.max(maxPasos, techoPasosConProgreso(escriturasOk, lecturasNuevasOk, ejecucionesOk));
            // v1.58.4 — B4: guarda el estado FINAL del archivo para el gate de
            //   auto-revisión del cierre (última escritura por ruta gana).
            const rutaW = a.path || a.ruta;
            const contW = a.content ?? a.contenido;
            if (typeof rutaW === "string" && rutaW.trim() && typeof contW === "string") {
              escritosTurno.set(rutaW, contW);
            }
          }
        } catch { accionesHechas.push(`✔ ${l.name}`); }
      }
      // v1.66.1 — DETECTOR DE CICLOS, RAMA NATIVA. Se inyecta TRAS todas las
      // respuestas-tool (meterlo antes rompe el transcript OpenAI-compat, que
      // exige todo `tool` contiguo bajo su `assistant`) y antes de la nueva
      // vuelta, para que el modelo LEA que está girando y se corrija solo.
      if (avisoBucle) { mensajes.push({ role: "user", content: avisoBucle }); avisoBucle = ""; }
      if (hayDirectivaArgs) {
        // Después de TODAS las respuestas-tool del turno (el orden del
        // transcript OpenAI-compat lo exige): el modelo entiende que le
        // quitamos las herramientas y por qué.
        mensajes.push({ role: "user", content: DIRECTIVA_SIN_HERRAMIENTAS });
        hayDirectivaArgs = false;
      }
      if (cortePorReescritura) break; // salida del for: cierre honesto abajo
      if (cortePorFallos) break; // v1.88.1 · cinco fallos de la misma herramienta
      if (lazoAgotado) break; // salida del for de pasos: cierre honesto abajo
      if (lazoBucle) break; // v1.66.1 · el mismo ciclo de los turnos anteriores: se corta
      continue; // nueva vuelta con los resultados reales
    }

    // Turno final (sin más llamadas).
    // v1.55.1 — ANUNCIO SIN ACCIÓN: re-empuje ESCALADO (tope MAX_REEMPUJES_ANUNCIO,
    // nunca bucle). Antes era 1 solo cartucho: glm-4.5-flash volvía a narrar «voy
    // a…» y el turno moría, dejando al usuario escribiendo «¿qué pasa?». Ahora
    // insiste subiendo el tono y, en el último intento, exige ENTREGAR ya.
    // v1.57.9 — `finish_reason:"length"` también dispara la reanudación: el
    // corte lo declaró el proveedor, no hay que adivinar si la frase quedó a
    // medias. La directiva manda CONTINUAR exactamente donde se cortó.
    // v1.58.4 — el corte por tokens usa su PROPIO presupuesto (más alto), aparte
    // del cupo de anuncios sin acción: una respuesta larga que corta 4-5 veces
    // debe poder completarse, no abandonarse al segundo corte.
    if (
      finishPaso === "length" &&
      continuacionesCorte < MAX_CONTINUACIONES_CORTE &&
      paso < maxPasos
    ) {
      if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
      mensajes.push({
        role: "user",
        content: "⏳ Tu respuesta se CORTÓ por el tope de tokens del proveedor. Continúa EXACTAMENTE donde quedaste, sin repetir lo ya dicho. Si lo que falta es largo, entrégalo por partes y cierra cada parte de forma completa.",
      });
      continuacionesCorte++;
      console.log(`[bucle] CORTE por tokens (finish_reason:length) — continuación ${continuacionesCorte}/${MAX_CONTINUACIONES_CORTE} con ${mensajes.length} mensajes`);
      continue;
    }
    if (
      reempujes < MAX_REEMPUJES_ANUNCIO &&
      paso < maxPasos &&
      motivoDeParada(textoTurno, []) !== null
    ) {
      if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
      mensajes.push({
        role: "user",
        // v1.70.2 — si hay equipo espejo y el modelo aún no lo llamó, el
        // re-empuje le da la salida concreta en vez de exigirle genéricamente.
        content: directivaDeReanudacion(reempujes) + notaEspejosDeEmpuje(espejoInvocado),
      });
      reempujes++;
      // v1.56.8 — el re-empuje se VE en el log. Sin esta línea, la consola no
      // mostraba NADA durante toda la conversación (queja de Mario: «en el log de
      // cmd no generó nada») y el turno parecía colgado cuando en realidad estaba
      // insistiendo al proveedor por segunda o tercera vez.
      console.log(`[bucle] anuncio sin acción (${motivoDeParada(textoTurno, [])}) — re-empuje ${reempujes}/${MAX_REEMPUJES_ANUNCIO} con ${mensajes.length} mensajes`);
      continue;
    }

    // v1.58.4 — B4: GATE DE AUTO-REVISIÓN. Antes de cantar «hecho» habiendo
    //   ejecutado herramientas, se revisa el estado FINAL de los archivos
    //   escritos este turno. Si alguno quedó incompleto/truncado, se empuja UNA
    //   continuación dirigida a terminarlo en vez de cerrar. Acotado por
    //   MAX_AUTORREVISION: nunca es un bucle.
    if (huboToolExec && autorrevisiones < MAX_AUTORREVISION && paso < maxPasos && escritosTurno.size > 0) {
      const sospechosas = revisarObraEscrita(
        Array.from(escritosTurno, ([path, content]) => ({ path, content }))
      );
      if (sospechosas.length > 0) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({ role: "user", content: directivaAutorrevision(sospechosas) });
        autorrevisiones++;
        console.log(`[bucle] B4 auto-revisión ${autorrevisiones}/${MAX_AUTORREVISION} — obra incompleta: ${sospechosas.map((s) => s.path).join(", ")}`);
        continue;
      }

      // v1.67.0 · ÍTEM 1.2 — LA WEB QUE LLEGA DE MOLDE (defecto de v1.66.0 con el
      //   arreglo dentro y sin enchufar). Acá el archivo SÍ está íntegro: lo que
      //   falta es CONTENIDO real. Se pregunta después del gate de integridad y
      //   antes del de certeza, con el MISMO presupuesto `MAX_AUTORREVISION` — o
      //   sea que no puede abrir bucle nuevo, que era el riesgo de tocar el ciclo.
      const andamios = revisarPlantillaWeb(
        Array.from(escritosTurno, ([path, content]) => ({ path, content }))
      );
      if (andamios.length > 0) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({
          role: "user",
          content: andamios.slice(0, 2).map((a) => a.informe).join("\n\n"),
        });
        autorrevisiones++;
        console.log(`[bucle] B4 plantilla por defecto ${autorrevisiones}/${MAX_AUTORREVISION} — andamio en: ${andamios.map((a) => a.path).join(", ")}`);
        continue;
      }

      // v1.59.1 — SEGUNDA CAPA (gate de certeza unificado). El gate propietario
      //   no vio obra sospechosa; antes de cerrar pasamos los mismos escritos y
      //   el historial de herramientas por evaluarCierre(), que compone los
      //   ejes huerfanos (bucle A-B-A-B/saturacion, integridad por lineas,
      //   consistencia de exports). Si bloquea, inyectamos sus directivas en vez
      //   de cantar «hecho». Acotado por el MISMO presupuesto de autorrevisiones.
      const veredictoGate = evaluarCierre({
        historialHerramientas,
        escrituras: Array.from(escritosTurno, ([path, content]) => ({
          path,
          contenido: content,
          intento: autorrevisiones,
        })),
      });
      console.log(`[bucle] gate certeza telemetria: ${JSON.stringify(veredictoGate.telemetria)}`);
      if (!veredictoGate.liberar && veredictoGate.directivas.length > 0) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({
          role: "user",
          content:
            "⚠️ Revisión de certeza antes de cerrar:\n" +
            veredictoGate.directivas.join("\n"),
        });
        autorrevisiones++;
        console.log(`[bucle] B4+ gate de certeza ${autorrevisiones}/${MAX_AUTORREVISION} — ${veredictoGate.directivas.length} directiva(s)`);
        continue;
      }
    }

    // v1.66.1 · BUG D DE v1.66.0, POR FIN CABLEADO — «VOY A…» Y SE CORTA.
    // `continuidadTurno.ts` ya existía con su test en verde; nadie lo llamaba.
    // A diferencia del re-empuje de v1.55.1 (que mira fórmulas de anuncio), este
    // evalúa el turno COMPLETO y se calla si hubo herramienta u obra, si el
    // texto pregunta algo, o si ya entregó una conclusión: es la que no molesta
    // al modelo que trabaja. Cupo propio y chico: dos exigencias y se cierra.
    if (continuidades < MAX_CONTINUIDAD && paso < maxPasos) {
      const vc = evaluarContinuidad({
        textoFinal: textoTurno,
        huboToolCalls: huboToolExec,
        huboObra: escriturasOk > 0,
      });
      if (vc.prematuro) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({ role: "user", content: vc.directiva! });
        continuidades++;
        console.log(`[bucle] ▶️ corte prematuro («${vc.promesa}») — exigencia ${continuidades}/${MAX_CONTINUIDAD}`);
        continue;
      }
    }

    // v1.69.0 · LA PUERTA DEL CONTRATO, AHORA TAMBIÉN EN LA NUBE — pedido de
    // Mario: «ahí (en el Planificador) se ejecuta el contrato, plan y hoja de
    // ruta con la tarea escrita por etapas y tachando la ya hecha; hasta que no
    // termine no se corta o se auto pregunta para continuar el turno». El juez
    // local ya lo hacía (decidirBucle: contrato abierto ⇒ continuar); el ciclo
    // OpenAI-compat cerraba con etapas colgando. Ahora el motor SE AUTO-PREGUNTA:
    // inyecta la lista de etapas sin tachar y exige seguir en este mismo hilo.
    // Acotado (MAX_CONTINUIDAD_PLAN=3, como los re-empujes locales): exigir sin
    // tope sería el otro defecto — el turno que nunca muere.
    if (paso < maxPasos && continuidadesPlan < MAX_CONTINUIDAD_PLAN) {
      const contratoAbierto = estadoContrato();
      const directivaContrato = contratoAbierto.abierto ? directivaDeContratoAbierto(contratoAbierto) : null;
      const directivaEtapas = planTocadoEsteTurno ? directivaDePlanPendiente(planTurno, continuidadesPlan) : null;
      const directiva = directivaContrato || directivaEtapas;
      if (directiva) {
        if (textoTurno) mensajes.push({ role: "assistant", content: textoTurno });
        mensajes.push({ role: "user", content: directiva });
        try { anotarVivo(`contrato/plan abierto — auto-pregunta ${continuidadesPlan + 1}/${MAX_CONTINUIDAD_PLAN}`); } catch { /* espejo auxiliar */ }
        continuidadesPlan++;
        console.log(`[bucle] ▶️ ${directivaContrato ? "contrato de aceptación" : "plan"} abierto — auto-pregunta ${continuidadesPlan}/${MAX_CONTINUIDAD_PLAN}`);
        continue;
      }
    }

    // v1.70.6 · EL PLAN DE PALABRAS LLEGA AL PLANIFICADOR — pedido de Mario
    // (25/10): «cuando hace planes no usa el Planificador». El modelo que no
    // tiene `set_plan` a mano (o decide no usarlo) enumera sus pasos en el chat
    // y el panel se quedaba en 0. Toda la lógica (guarda + parser + declaración)
    // vive en el espejo (publicarPlanDePalabras → planDesdeProsa); el ciclo sólo
    // pregunta y reenvía el evento. Ante la duda el parser no inventa nada.
    try {
      const planPalabras = publicarPlanDePalabras(textoTurno || "");
      if (planPalabras) {
        planTocadoEsteTurno = true;
        ctx.sendTaskEvent({
          type: "plan",
          tasks: planPalabras.map((t) => ({ id: t.id, description: t.description, status: "pending" })),
        } as any);
        console.log(`[bucle] 🗒 plan declarado de palabra: ${planPalabras.length} etapa(s) → Planificador`);
      }
    } catch { /* el espejo es auxiliar: jamás corta un turno bueno */ }

    // v1.56.8 — SE ACABARON LOS RE-EMPUJES Y SIGUE SIENDO UN ANUNCIO: se dice.
    // Antes este punto devolvía `ok:true` solo porque salió texto, así el turno
    // moría en «voy a revisar…» sin explicación y el usuario tenía que volver a
    // preguntar para que la tarea continuara. Si hubo herramientas ejecutadas, el
    // anuncio ya no es el problema: no se añade el aviso.
    if (!huboToolExec) {
      const motivoFinal = motivoDeParada(textoTurno, []);
      if (motivoFinal) {
        console.warn(`[bucle] CIERRE SIN ACCIÓN tras ${reempujes} re-empuje(s): ${motivoFinal}`);
        ctx.sendChunk(cierreIntencionSinEjecutar(reempujes, motivoFinal));
      }
    }

    // v1.57.9 — el modelo pedía más herramientas justo donde se acabó el
    // presupuesto: se dice CUÁL era la obra pendiente (antes: silencio o
    // «límite de pasos» sin explicar que quedaba trabajo a medias).
    avisarObraPendiente();
    avisarPlanSinCerrar(); // v1.69.0 · con etapas abiertas esto es «parcial», no «Hecho»
    if (emittedAny) return { ok: true, emittedAny: true };
    if (huboToolExec) {
      ctx.sendChunk(planEtapasAbiertas().length > 0 ? `⚠️ Parcial — acciones realizadas:${resumirAcciones()}` : `✔️ Hecho. Acciones realizadas:${resumirAcciones()}`);
      return { ok: true, emittedAny: true };
    }
    return { ok: false, emittedAny: false, failReason: "stream vacío (ningún token recibido)" };
  }

  // v1.60.17 — CIRCUITO DE REESCRITURA IDÉNTICA: el modelo insistió en
  // reescribir archivos byte-a-byte iguales (rotando entre ellos para esquivar
  // el lazo suave). Se cierra con la verdad antes de que el turno gire sin fin.
  // v1.88.1 · CORTE POR FALLO REPETIDO: args válidos y el mismo error cinco veces
  // no es terquedad del usuario, es el lazo girando. Se nombra la herramienta y se
  // pega el motivo tal como lo dijo la herramienta.
  if (cortePorFallos) {
    ctx.sendChunk(
      cierrePorFallos(cortePorFallos, UMBRAL_CORTE_FALLOS, motivoCorteFallos) +
      (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : "")
    );
    return { ok: true, emittedAny: true };
  }

  if (cortePorReescritura) {
    ctx.sendChunk(cierrePorReescrituraIdentica(rutasReescritasIdenticas) + (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : ""));
    return { ok: true, emittedAny: true };
  }

  // v1.66.1 · CICLO ENTRE TURNOS: el mismo `A → B → C` de los turnos anteriores,
  // reconocido gracias a que el detector NO nació vacío. Se nombra el ciclo y se
  // dice qué se hizo antes: el usuario entiende por qué «sigue» no servía.
  if (lazoBucle) {
    ctx.sendChunk(
      `🔁 Corté el turno porque estaba girando el mismo ciclo de los turnos previos: ${lazoBucle}. ` +
      `Seguir pidiéndome «sigue» repite esas mismas herramientas; hace falta otro enfoque o un dato concreto.` +
      (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : "")
    );
    return { ok: true, emittedAny: true };
  }

  // v1.57.9 — LAZO AGOTADO: la guardia se cansó de intervenir. Se cierra con
  // la verdad (qué se insistió y qué hacer), nunca con el «Detenido» mudo.
  if (lazoAgotado) {
    ctx.sendChunk(cierrePorLazoAgotado(lazoAgotado) + (accionesHechas.length ? `\nLo realizado antes del corte:${resumirAcciones()}` : ""));
    return { ok: true, emittedAny: true };
  }

  // Se agotaron los pasos sin un cierre textual.
  avisarObraPendiente();
  avisarPlanSinCerrar(); // v1.69.0 · el acta dice qué etapas quedan colgando
  if (emittedAny) return { ok: true, emittedAny: true };
  if (huboToolExec) {
    ctx.sendChunk(planEtapasAbiertas().length > 0 ? `⚠️ Parcial (límite de pasos alcanzado):${resumirAcciones()}` : `✔️ Acciones realizadas (límite de pasos alcanzado):${resumirAcciones()}`);
    return { ok: true, emittedAny: true };
  }
  return { ok: false, emittedAny: false, failReason: "sin respuesta tras el límite de pasos" };
}

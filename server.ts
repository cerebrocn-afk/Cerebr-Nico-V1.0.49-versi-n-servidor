import { decidirRaicesEdicion } from "./server/configServidor";
import { modoServidor, rutaWorkspace, montarEdicionServidor, fetchConClave, inventarioWorkspace } from "./server/edicionServidor"; import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { decidirRaizInstalacion, esEmpaquetado } from "./src/engine/raizInstalacion"; // v1.0.23 · dónde está la casa, sin preguntarle al cwd
import nodeCrypto from "node:crypto";
// v1.57.0 — para localizar el `dist/` HERMANO del server.mjs empaquetado (el
// paquete NO siempre se lanza con cwd = resources/app).
import { fileURLToPath } from "node:url";
// EXE v1 — vite es devDependency: en el instalador empaquetado NO existe, y
// un import estático aquí rompía dist/server.mjs al cargar. Se importa solo en
// el modo desarrollo (rama dev del servidor).
import { GoogleGenAI } from "@google/genai";
import os from "os";
// v2.0 — Clasificación de modelos y ajustes de rendimiento (compartido con el cliente)
import {
  getModelProfile,
  buildOllamaOptions,
  trimMessagesToBudget,
  condensarHistorial,
  trimIncomingPrompt,
  parseParamsB,
  keepAliveExplicito,
  modoLivianoLocal,
  capacidadSinVerificar,
  type ModelProfile,
} from "./src/engine/modelTiers";
// v1.44.0 — HERRAMIENTAS EN LA NUBE: traducción de tools al SDK de Gemini y
// extracción de sus functionCall, para que un modelo de nube pueda LLAMAR las
// herramientas reales (fs/pc/web) en vez de inventarse un puente.
import {
  toGeminiFunctionDeclarations,
  extraerLlamadasGemini,
  respuestaHerramientaGemini,
  type LlamadaHerramienta,
} from "./src/engine/herramientasNube";
// v1.46.0 — El preflight del modelo local y la traducción de errores crudos
// viven en su propio módulo: el monolito tiene trinquete (no debe engordar).
import {
  preflightModeloOllama,
  mensajeLegibleDeError,
  avisoTurnoVacio,
} from "./src/engine/preflightLocal";
import { consejoSilencioLocal } from "./src/engine/cerebroModelo"; // v1.57.12 · CERTEZA DE MODELO
import { presupuestoPrimerByte, registrarPrimerByte, modelosMedidos, sugerirAlternativa, registrarPrefill } from "./src/engine/relojModelos"; // v1.57.18 · EL RELOJ MEDIDO · v1.0.19: el prefill medido entra al presupuesto
import { medicionDe } from "./src/engine/relojModelos";
import { cargarInventarioLocal, intentarPivotLocal, enviarEnTrozos, relojDeModeloLocal, consentimientoDeRescate, notaDeCuarentenaLocal, type InventarioLocal } from "./server/pivotEnVivo"; // v1.57.19 · F2 manos del rescate
import { STATIC_SERVER_SOURCE } from "./server/sandboxEstatico"; // v1.72.0 · F2 — el servidor estático del sandbox fuera del monolito
import { enCuarentena, notaCuarentena, registrarFalloProveedor, registrarExitoProveedor } from "./src/engine/fusibleProveedores"; // v1.57.18 · EL FUSIBLE UNIVERSAL
import { fusibleRechazaGemini, registrarFalloGemini, registrarExitoGemini, informeFusiblesGemini, filtrarModelosChatGemini, esGemini4, resolverPensamientoGemini, MODELOS_GEMINI_VIGENTES, ALIAS_GEMINI_INTERNOS } from "./src/engine/fusibleGemini"; // v1.57.12 · FUSIBLE DE LA CADENA  // v1.66.0 · + filtro de capacidad de chat
// v1.56.4 — ADMISIÓN POR RAM: función PURA (sin red/disco) que, con el tamaño
// que Ollama ya reporta y la RAM libre, dicta ok/justo/riesgo ANTES de cargar.
// Vive fuera del monolito por el trinquete («la Fase 2 es partir, no añadir»).
import { evaluarAdmisionRam } from "./src/engine/admisionRam"; import { textoDeMapaDePuertos } from "./src/engine/puertosArranque"; import { resumenProtocolo, auditarDirecciones } from "./src/engine/protocoloDirecciones"; // v1.0.20 · EL PROTOCOLO DE DIRECCIONES: una tabla, un grito en el arranque // v2.3.12 · EL ARRANQUE DECLARA LOS SIETE PUERTOS en el log, con la MISMA tabla que pinta el telón y que viaja en el prompt (antes el `.bat` y el server nombraban 3000 y 5000, y nada más). Comparte línea a propósito: el trinquete de `server.ts` es `presupuesto_lineas` y este asiento no lo mueve.
// v1.46.0 — El texto del «modo fallback» (182 líneas de plantillas, sin rutas ni
// guards) salió del monolito a su propio módulo: la clase de bloque que la Fase
// 2 pide mover primero (cero acoplamiento).
import { generateAutonomousTechnicalResponse } from "./src/engine/fallbackAutonomo";
// v1.46.0 — EL ACTA DE EVIDENCIA DEL TURNO. `anotarHerramienta` se llama desde el
// envoltorio de `executeToolCall`, que es el ÚNICO punto por el que pasan las 32
// herramientas (Ollama, Gemini y el bucle OpenAI-compat). De ahí sale la evidencia
// que el revisor de certeza esperaba y nunca recibía.
import { anotarHerramienta, actaDelTurno } from "./src/engine/evidenciaTurno";
// v1.46.2 — El inventario de un pack en UNA línea: al agrupar los avisos de
// reemplazo se perdieron los NOMBRES de las herramientas y el arranque dejó de
// mostrar qué se había cargado. Se notó enseguida («noto menos herramientas»).
import { inventarioDelPack } from "./src/engine/toolRegistry";
// v1.0.28 — EL CLIENTE MCP QUE FALTABA. `mcp_servers.json` era documentación
// disfrazada de configuración: nadie lo leía, nadie lanzaba sus servidores.
// `cargarPacksMcp` los arranca por stdio y los registra como packs.
import { asegurarServidorMcp, cargarPacksMcp, cerrarTodosMcp, duenioDeHerramienta, servidoresMcpVivos, type ResultadoPacksMcp } from "./src/engine/packsMcp";
// v1.0.28 — reformulación determinista: plegar, ordenar y recortar N preguntas en
// UNA consulta (herramienta abrir_red). Puro: sin red y sin llamar al modelo.
import { reformular } from "./src/engine/reformuladorConsultas";
import { registrarEstadoPacksMcp } from "./server/routers/estadoPacksMcp";
// v1.46.0 — Las rutas de descubrimiento de modelos salieron del monolito (327
// lineas): el trinquete de la Fase 2 exige menos de 11.800 lineas.
import { registerModelDiscoveryRoutes, resolverModelosGeminiVigentes } from "./server/routers/modelos";
import { fetchCloud } from "./server/fetchCloud";
import { plazoApi } from "./server/middleware/plazoApi"; // v2.1.7 · FALTA ESTA LÍNEA en 2.1.6: `plazoApi()` se llamaba sin importar (ReferenceError en el arranque)
import { techoDeHistorial, veredictoTecho } from "./src/engine/techoDelPrompt"; // v1.0.33 · el sistema también ocupa (Prompt exceeds max length)
import { puedeContestar } from "./src/engine/fichaUnica"; // v1.0.33 · una sola respuesta por petición
import { registrarSubagentes } from "./server/routers/subagentes"; // v1.0.24 · /api/subagents extraída: el cuerpo de la ruta con su ficha de una sola escritura
import { registrarEstadoSandbox } from "./server/routers/estadoSandbox"; // v1.0.25 · /api/sandbox/status extraída del monolito: con su aduana, su detección de proyecto anidado y su rama de web estática
import { humanizarErrorProveedor } from "./src/utils/erroresProveedor"; // v1.60.4 · errores de nube accionables en ES
// v1.44.0 — DIRECTRIZ anti-herramienta-fantasma y anti-bucle 'hazlo/no puedo'.
// v1.57.1 — + guardaSinHerramientas(): honestidad obligatoria en TODO turno sin tools.
import { directrizEjecucionReal, guardaSinHerramientas } from "./src/engine/ejecucionFantasma";
// v1.57.4 · FASE 5 — la temperatura del modo agente vive como CONFIG; aquí sólo se cablea.
import { temperaturaModoAgente } from "./src/engine/configAgente";
// FASE 4 (extracción) — estado crudo del sandbox como fábrica pura (trinquete Fase 2).
import { crearEstadoSandboxCrudo, type EstadoSandboxCrudo } from "./src/engine/estadoSandbox";
// v1.45.0 — CICLO DE HERRAMIENTAS OpenAI-compat (Z.ai/GLM, Groq, OpenRouter,
// Custom…): helpers PUROS para ensamblar las tool_calls fragmentadas del stream
// y construir el transcript. La orquestación (red + executeToolCall) vive abajo.
import {
  // v1.57.9 — lazo del bucle suave + detección de argumentos truncados (puro).
  // El ensamblado SSE y los constructores de transcript se fueron con el ciclo
  // a `server/cicloOpenAICompat.ts`; aquí quedan solo los pedazos que usan las
  // ramas de Ollama y Gemini.
  parsearArgsConEstado,
  anotarRepeticion,
  REPETICION_SIN_VER,
  UMBRAL_REPETICION,
  TOPE_INTERVENCIONES,
  esHerramientaDeObra,
  // v1.0.14 · la rama Gemini paga pasos con LECTURA y EJECUCIÓN sanas, no sólo
  // con escritura (regresión del corte a 3-4 min, sesión 1794293050619).
  esHerramientaDeEjecucion,
  techoPasosConProgreso,
  techoPasosConObra,
  DIRECTIVA_TRUNCAMIENTO,
  directivaRepeticion,
  cierrePorLazoAgotado,
  // v1.60.17 — circuito de reescritura idéntica (sesión pacman 20/10).
  esRechazoReescrituraIdentica,
  cierrePorReescrituraIdentica,
  TOPE_REESCRITURA_IDENTICA,
  // v1.57.10 — vigilante de fallos de argumentos (gemma4:31b-cloud).
  nuevoVigilanteArgs,
  registrarFalloArgs,
  DIRECTIVA_SIN_HERRAMIENTAS,
  UMBRAL_SIN_HERRAMIENTAS,
  type EstadoRepeticion,
} from "./src/engine/cicloHerramientasOpenAICompat";
// v1.61.0 — memoria de SESIÓN del bucle: ve lo que un turno no puede ver (34 rechazos agrupados).
import { crearVentanilla, abrirTurno, registrarRechazo, cierreEntreTurnos } from "./src/engine/reescrituraEntreTurnos";
// v1.11.0 · FASE 2 — primera extracción: el monolito adelgaza. Las rutas de
// diagnóstico (salud profunda, perfil de modelo, catálogo de Ollama) viven ahora
// en su propio módulo. Se le pasan los valores de arranque para que siga habiendo
// UNA sola fuente de verdad sobre Ollama y los recursos de la máquina.
import { registrarDiagnostico } from "./server/routers/diagnostico";
import { registrarGeminiTts } from "./server/routers/geminiTts"; // v1.62.0 · Fase 2 — TTS fuera del monolito
// v1.56.8 · FASE 2 — el dominio EXPORTAR sale del monolito y suma la ruta que
// produce el proyecto Android completo (antes solo explicaba cómo instalar
// Capacitor). Se registra dentro de `registerEngineRoutes`, donde vivía.
import { registrarExportacion } from "./server/routers/exportacion";
import { registrarVectorRag } from "./server/routers/vectorRag";
import { registrarFeatures } from "./server/routers/features";
import { registrarEnjambre } from "./server/routers/enjambre"; // v1.80.0 · respuesta ecléctica (un prompt, varias voces, veredicto)
import { registrarCalidad } from "./server/routers/calidad"; import { registrarAutomejora } from "./server/routers/automejora"; import { registrarTrabajo } from "./server/routers/trabajo"; import { registrarPersistencia } from "./server/routers/persistencia"; // v1.70.3 · Fase 2: verifier + governor fuera del monolito // v1.93.0 · AUTOEMEJORA: la política sale a su router y el monolito solo la monta // v1.95.0 · TRABAJO SEGURO: el manual de rutas/recetas, igual (trinquete: partir, no añadir — por eso los imports van en la línea del router hermano)
import { generarAndroidDesdeChat, lanzarCompilacionApk, estadoAndroidDesdeChat } from "./server/fabricaApk";
// v1.0.14 · el aprovisionador de herramientas (JDK/Gradle/SDK) guarda su raíz de
// datos aquí una sola vez, apenas PROJECT_ROOT queda decidido.
import { fijarRaizDatosParaHerramientas } from "./server/aprovisionarToolchain";
import { iniciarSanacionDaemon, marcarActividadDelMotor } from "./server/sanacionDaemon"; // v1.57.19 · F1.5 SANACIÓN AUTOMÁTICA // v1.57.17 · exportar_apk usa la MISMA fábrica que el botón
import { registrarBrain } from "./server/routers/brain";
// v1.12.0 · FASE 2 — telemetría y recursos salen del monolito, y con ellos el
// PRIMER ESTADO: la caché de telemetría y la muestra de CPU viven ahora en
// `server/estado/`, con API propia. Es el patrón que necesitan las demás
// variables globales. Al sandbox no se le alcanza: se le pregunta (ver deps).
import { registrarTelemetria } from "./server/routers/telemetria";
// v1.15.1 — espejos por servidor de datos: el catálogo (sql, mongo, redis,
// grafo, vectorial…) se expone como rutas reales; antes era un módulo huérfano.
import { registrarEspejosServidor } from "./server/routers/espejosServidor";
// v2.1.2 · LOS 10 ESPEJOS DE SERVIDOR DEJAN DE SER CÓDIGO MUERTO.
// Hasta aquí solo los alcanzaba POST /api/espejos-servidor/ejecutar: el tool del
// modelo filtraba por /^espejo\./ y los servidor.* nunca entraban. Ahora el mismo
// tool los despacha a su ejecutor real (otra función, otro módulo: ejecutarEntidad
// solo conoce el pool del consejo y devolvería «entidad desconocida»).
import { ejecutarEspejoServidor } from "./src/engine/reflejo/espejosServidor";
// v1.15.1 — plan de dependencias del puente PC: el planificador existía y
// estaba testado, pero nadie lo exponía; ahora vive en su propio router.
import { registrarPuenteDependencias } from "./server/routers/puenteDependencias";
// v1.15.1 — capacidades corroboradas: un único endpoint que dice con números
// qué está activo de verdad (skills, herramientas, consejo, rutas, plugins).
import { registrarCapacidades } from "./server/routers/capacidades";
// v1.16.3.1 · BAJO CONSUMO — residencia de Ollama a la vista (chip + Expulsar, §2.3):
// router extraído; el sondeo vive en server/ollamaBajoConsumo.ts.
import { registrarOllamaControl } from "./server/routers/ollamaControl";
import { sondearOllamaPs, expulsarModelos } from "./server/ollamaBajoConsumo";
import { registrarPlanTurno, notaContinuidad } from "./server/continuidadPlan";
// v1.73.0 · CANAL DIRECTO — la suite `carpetaProyecto` (carpeta/ZIP de proyecto al
// chat) nace y vive en server/routers/carpetaProyecto.ts: el monolito solo la registra.
import { registrarCarpetaProyecto, leerRutaVinculada, autoVincularObra } from "./server/routers/carpetaProyecto"; // v1.0.14 · auto-vinculado de obra en la raíz de datos
import { registrarRutasProyecto } from "./server/routers/rutasProyecto"; import { obraAbierta as obraAbiertaEnRegistro, olvidarRegistro as olvidarRegistroProyecto, type DepsRegistro } from "./server/proyectoRegistro"; import { registrarPackRutas, ejecutarHerramientaRutas, ES_HERRAMIENTA_RUTAS } from "./server/herramientasRutas"; /* v1.0.20 · RUTAS ATÓMICAS: una sola verdad sobre dónde vive la obra (contexto, abrir, cerrar, clasificar) y dos herramientas que no adivinan */
import { registrarNucleoAgentico } from "./server/routers/nucleoAgentico"; // v1.85.0 · FASE 6: ciclo con trazas, aduana de forja, multiagente, /api/explicar
import { registrarConcienciaSandbox } from "./server/routers/concienciaSandbox"; // v1.86.0 · FASE 7.1/7.2: /api/conciencia del sandbox + manifiesto del espejo
// v1.74.0 · AUTOAPRENDIZAJE EN TIEMPO REAL — toda la lógica vive en la suite
// `server/aprendizajeVivo.ts` (lección → LECCIONES.md + KB + espejo vivo, y
// inyección de las últimas en el prompt de CADA turno). El monolito solo cablea.
import { inicializarAprendizajeVivo, registrarRutasAprendizajeVivo, notificarFalloHerramienta, notificarExitoTrasFallo, detectarCorreccionUsuario, anotarLeccionViva, leerLeccionesParaInyectar } from "./server/aprendizajeVivo";
// v1.76.0 · EL LABORATORIO TIENE MOTOR: `auto_propose` y su contador de fallos
// repetidos por patrón viven en `server/propuestasAutonomas.ts` (capa pura
// probada). Apagada por la capacidad, no escribe ni un byte.
import { inicializarPropuestasAutonomas, abrirTurnoPropuestas, notificarFalloRecurrente } from "./server/propuestasAutonomas";
import { parseQuickAction, esOrdenDelEditorWeb } from "./server/quickParser";
// Fase 2 «partir, no añadir»: la lectura de causas de procesos sale del monolito
// a server/salidaProcesos.ts y libera las líneas que suma el router de arriba.
import { detalleDeSalida, esErrorDeCodigoDelProyecto } from "./server/salidaProcesos";
import { invalidarMuestra } from "./server/estado/telemetria";
import { arrancarDaemonsPython, resolverInterpretePython, type HandleDaemonsPython } from "./server/daemonsPython";
import { crearMiddlewareSandboxProxy } from "./server/sandboxProxy";
import { clasificarErrorTTS, recortarDetalle } from "./server/ttsErrores";
import { avisarProveedorCorregido } from "./server/avisosProveedor"; // v1.57.21 — el aviso 🧩 una vez por par modelo+motor
// v1.13.0 · FASE 2 — el ESTADO DEL SANDBOX sale del monolito: era el último bloque
// grande de estado compartido (35 sitios tocando una variable global). Las rutas
// siguen aquí, pero ya no son dueñas del proceso: preguntan por él.
import { isPidAlive, registrarProceso, olvidarProceso, procesoActual, sandboxVivo, pidSandbox, matarProceso, raizServidaActual, registrarRaizServida } from "./server/estado/sandbox";
import { prepararArranque, raizDeObraEnCurso, olvidarRaizDeObra } from "./server/sandboxArranque"; // v1.87.1 · la decisión de raíz, fuera del monolito
// v1.14.0 · La certeza llega al texto del modelo: el contexto de streaming sale
// del monolito y, al cerrar el turno, pasa la respuesta por `revisarSalida`. Así
// la certeza se engancha al chat sin hacer crecer server.ts (trinquete de la Fase 2).
import { resolverRutaDeObra } from "./src/engine/raizDeObra";
import { StreamContext } from "./server/streamContext";
import { ejecutarCicloHerramientasOpenAICompat } from "./server/cicloOpenAICompat";
import { sanearYVentana } from "./server/normalizarOllama"; import { contextoDeclaradoDeShow } from "./src/engine/escaleraContexto"; // v1.0.20 · techo de contexto que declara el modelo (/api/show) // v1.0.15/1.0.16 · system-first + ventana que crece al techo de RAM + recorte a num_ctx, en un paso
import { techoDeContexto } from "./src/engine/techoContexto"; import { puertoLibre, cuerpo409PuertoOcupado } from "./server/puertoLibre"; import { enfriarProveedor, resolverFailoverNube, PROVEEDORES_RESPALDO_NUBE, type ProveedorNube } from "./server/respaldoNube"; // v1.0.15/1.0.16 · techo num_ctx por RAM · puerto alterno :3500 · failover entre nubes gratis inestables
// v2.0 — Registro de herramientas extensible (packs internos + packs externos futuros)
import {
  registerBuiltinPacks,
  registerToolPack,
  unregisterToolPack,
  registerExternalPack,
  getActiveToolSpecs,
  getToolSpec,
  selectToolsForModel,
  explicarRecorte,
  toOllamaTools,
  listToolPacks,
  getAllToolNames,
  HUESO_DE_OBRA,
  esPackExterno,
  type ToolSpec,
} from "./src/engine/toolRegistry";
// TERMINAL PERSISTENTE — pack enchufable: shell vivo con sesión (estado entre
// comandos, REPL y prompts interactivos). Rellena el hueco de run_command/pc_exec
// (que son de un solo tiro). Ver src/engine/terminalInteractivo.ts.
import {
  registrarPackTerminal,
  ES_HERRAMIENTA_TERMINAL,
  ejecutarHerramientaTerminal,
} from "./src/engine/packTerminal";
// v1.71.0 · DOCUMENTOS REALES — el motor ahora escribe PDF/Word/Excel (los binarios
// no caben por write_file: utf-8 los corrompe). Mismo patrón enchufable que terminal.
import {
  registrarPackDocumentos,
  ES_HERRAMIENTA_DOCUMENTOS,
  ejecutarHerramientaDocumentos,
} from "./src/engine/packDocumentos";
// v1.23.0 · COMPLETITUD — contraste plan ↔ manifiesto ↔ disco para el acta.
import { rutasMencionadasEnPlan, verificarCompletitud, informeCompletitud } from "./src/engine/completitud";
// v1.23.0 · PUERTAS DE OBRA — la política de puertas del quirófano (compilación
// y seguridad encendidas por defecto, build inferido del package.json) vive en
// su propio módulo: la Fase 2 de la casa es partir, no añadir.
import { construirPuertasQf } from "./server/gatesObra"; import { dessecuestrarEntradaPreview, verificarEscrituraEnDisco, resumenUltimoCierre, restaurarHtmlOriginal as restaurarHtmlOriginal10 } from "./server/sandboxPreview"; import { desviarHaciaCarpetaDeObra } from "./server/obraCurso"; import { guardarHilana, tomarHilanaParaInyectar } from "./src/engine/hilana"; import { caminoCorrectoPara } from "./src/engine/caminoCorrecto"; import { lineaDeRelevos } from "./src/engine/cadenaSegura"; // v1.0.10/11/12 · guardias del preview, obra visible, hilana, error-con-su-camino y lista segura (trinquete: se parte, no se añade)
// v2.0 — Resiliencia profunda: clasificación de errores, reintentos y cortacircuitos
import { classifyError, describeResilience, withRetry } from "./src/engine/resilience";
import { normalizarReceta, generarArchivos, instruccionUso } from "./src/engine/pluginForja"; // FORJA v1: el sistema compone los complementos
// v2.0 — Extensiones de terceros (manifiesto, validación y registro)
import {
  EXTENSION_API_VERSION,
  ExtensionRegistry,
  listCommands,
  listPanels,
  listToolContributions,
  validateManifest,
  type ExtensionManifest,
} from "./src/engine/extensions";
// v2.0 — EL MOTOR: base de datos de conocimiento, blindaje de sintaxis y
// validación del contexto de herramientas. El conocimiento vive aquí, no en el
// modelo: así cualquier "conductor" (Ollama, GLM, Gemini…) responde igual.
import {
  KnowledgeBase,
  buildEngineContext,
  validateToolCall,
  // v2.1 — `tokenize` FALTABA aquí y el aprendizaje de fallos de herramientas
  // llevaba desde entonces sin funcionar: se llamaba más abajo, lanzaba
  // ReferenceError, y el `catch` que lo envuelve ("el aprendizaje nunca debe
  // romper la ejecución") se lo tragaba en silencio. Un fallo silencioso de
  // manual: la función existía, se llamaba, y no hacía absolutamente nada.
  tokenize,
  type ToolSchema,
} from "./src/engine/knowledgeBase";
import { guardFile, guardFileProfundo, guardYSanear, rejectMessage, problemasBloqueantes, type FuncionTransform } from "./src/engine/syntaxGuard";
// v1.6.32 · CALIDAD (ROADMAP D-P1): el parser real del blindaje es EL MISMO
// esbuild con el que Vite compila el sandbox. Si esbuild lo rechaza, el
// proyecto no compila: el oráculo y la víctima son el mismo juez, y así no
// hay falsos positivos por construcción.
// v1.22.2 · REPARACIÓN EXE — esbuild se carga PEREZOSAMENTE con caché de fallo
// (ver `obtenerTransformEsbuild` abajo). Un `import` estático aquí quedaba VIVO
// en dist/server.mjs (`--packages=external`) y, como esbuild vivía en
// devDependencies, el instalador NO lo traía: el EXE moría con
// ERR_MODULE_NOT_FOUND antes de arrancar. La tolerancia de guardFileProfundo
// estaba escrita a nivel de función sobre una dependencia que fallaba a nivel
// de módulo. Ahora: sin esbuild se AVISA y se deja pasar (nunca encarcela);
// con esbuild, sigue bloqueando la sintaxis rota.
import { extraerMetricasOllama, type MetricasInferencia } from "./src/engine/metricasInferencia";
// v1.16.0 — el bucle de herramientas ya no se corta a mitad: lo decide un módulo puro.
import { decidirBucle, informeHonesto, cierreIntencionSinEjecutar, tareasPendientes, actualizarPlanDesdeHerramienta, techoDePasos, motivoDeParada, directivaDeReanudacion, MAX_REEMPUJES_ANUNCIO, PASOS_BASE, PASOS_TOPE, concederProrrogaTecho, type TareaPlan, type UltimoFallo } from "./src/engine/bucleAutonomo";
// v1.49.0 · FASE 2 — el fiscal del último metro ya con cuerpo (autovalido.ts) y
// las dos fuentes únicas que aún no se importaban aquí para alimentarlo.
import { fiscalizar, type DictamenFiscal, parteMatrizPanel } from "./src/engine/autovalido";
import { estadoEvidencias } from "./src/engine/motorEvidencia";
import { estadoContrato } from "./src/engine/planAdaptativo";
import { crearRegistro as crearRegistroAuditoria, registrarDecision as registrarDecisionAuditoria, formatearAuditoria, huboReparacion, type RegistroAuditoria } from "./src/engine/auditoriaBucle";
// v1.22.1 · ORDEN DE OBRA — el motor hace la lista de archivos ANTES de comenzar y
// verifica la obra en disco al cerrar (lógica pura en ordenDeObra, no en el monolito).
import { directivaDeObra, formatearListado, registrarObra, cierreDeObra, directivaDeCierreRojo, huecosDeCerteza, decidirAperturaCierre, bytesObraEnDisco, registrarHuecosConocidos, notaHuecosConocidos, type ManifiestoObra, type SondaDisco } from "./src/engine/ordenDeObra";
import { notaDeContexto } from "./src/engine/motorContexto"; // v1.31.0 · CONTEXTO ENGINE: retrato del sandbox contra PROJECT_ROOT (lógica pura; el monolito solo la llama)
// v1.22.0 · MOTOR VIVO — cada turno deja su hoja en memoria (lógica pura en espejoVivo).
import { abrirTurnoVivo, cerrarTurnoVivo, empezarPasoVivo, terminarPasoVivo, declararPlanVivo, marcarTareaVivo, anotarVivo, hojaVivaParaPanel, objetivoDesdeMensajes, publicarPlanDePalabras } from "./src/engine/espejoVivo";

/** v1.22.2 — caché de fallo para el transform de esbuild: se resuelve UNA sola
 *  vez y un fallo no reintenta `import()` en cada archivo (avisa y deja pasar). */
let transformEsbuildCargado: ((codigo: string, opciones: any) => Promise<unknown>) | null = null;
let transformEsbuildFallo: string | null = null;

async function obtenerTransformEsbuild(): Promise<(codigo: string, opciones: any) => Promise<unknown>> {
  if (transformEsbuildCargado) return transformEsbuildCargado;
  if (transformEsbuildFallo) throw new Error(transformEsbuildFallo);
  try {
    const mod: any = await import("esbuild");
    if (!mod || typeof mod.transform !== "function") throw new Error("esbuild no expone «transform»");
    // v1.23.0 — TS no angosta una asignación desde `any`: se declara el tipo
    // UNA vez y el retorno no puede traer el `null` de la variable de módulo.
    const fn: (codigo: string, opciones: any) => Promise<unknown> = mod.transform;
    transformEsbuildCargado = fn;
    return fn;
  } catch (err) {
    transformEsbuildFallo = `esbuild no disponible (${(err as any)?.message || err}); el guard se degrada a la capa v2.0 — avisa, no bloquea`;
    throw new Error(transformEsbuildFallo);
  }
}

/** El transform del proyecto, adaptado al contrato inyectable del guardián. */
const PARSER_ESBUILD: FuncionTransform = async (codigo, opts) => {
  const transform = await obtenerTransformEsbuild();
  return transform(codigo, {
    loader: opts.loader,
    sourcefile: opts.sourcefile,
    target: "es2022",
    // tsconfigRaw vacío: juzga sintaxis sin buscar un tsconfig en el disco
    // del sandbox (que está cambiando MIENTRAS se sincroniza).
    tsconfigRaw: {},
  } as any);
};
import {
  crearOperacion,
  anotarCirugia,
  evaluarCirugia,
  cerrarOperacion,
  serializarOperacion,
  deserializarOperacion,
  revertir,
  lineaQuirofano,
  cirugiasDe,
  type Operacion,
  type Disco,
  type Puerta,
  type ModoEvaluacion,
  type VeredictoOperacion,
  type Diagnostico,
} from "./src/engine/quirofano"; // QUIRÓFANO v1 /*QF-IMPORT*/
// v1.8.0 · VOZ — certeza del propio trabajo, explicación por artefacto y mensajes
// espontáneos. Se importan junto al Quirófano a propósito: es él quien tiene la
// evidencia que estos módulos necesitan (si las puertas cerraron en verde o no).
// Sin esa evidencia, un artefacto se explica como «solo leído» y se dice así.
import { explicarArtefacto, type EntradaArtefacto } from "./src/engine/explicacionArtefacto";
import { mensajesEspontaneos, type ContextoVoz, type MensajeEspontaneo } from "./src/engine/autoRespuesta";
// v2.0 — Manuales del motor: leyes + uso de cada herramienta + procedimientos.
// Se inyectan en cada turno con las herramientas activas, para que cualquier
// modelo (por flojo que sea) sepa cómo usar lo que tiene delante.
import { MANUAL_ENTRIES } from "./src/engine/manuals";
// v1.68.0 · EL ABORDAJE DEL TURNO: un solo conjunto de herramientas viaja al
// esquema del proveedor Y al manual inyectado. Antes eran dos cálculos que podían
// divergir (y divergían: server.ts:9972 armaba el manual con `model` y cada rama
// recalculaba con modeloOR / modeloCustom / targetModel). Invariante:
// herramientasEnIndice === herramientasTotales — nunca se recorta una herramienta,
// se excede el presupuesto y se declara. Ver src/engine/abordaje.ts.
import { planDeAbordaje, auditarCatalogoUnaVez } from "./src/engine/abordaje";
import { resolverModeloEfectivo } from "./src/utils/providerRouting";
// v1.47.1 — Recetario de componentes web + protocolo de análisis (pedido Mario).
import { buildRecetarioUISection, PROTOCOLO_ANALISIS } from "./src/engine/recetarioUI";
// v1.47.2 — Conciencia en tiempo real (estado vivo del turno en el prompt).
import { buildConcienciaTiempoReal, pareceTareaPesada } from "./src/engine/conciencia"; import { presionDeTexto } from "./src/engine/contextoMedido"; import { prepararSistemaParaCache } from "./src/engine/ordenDelPrompt"; import { evaluarCercoDeAlcance } from "./src/engine/cercoDeAlcance"; // v1.0.29 · orden del prompt (prefijo que no cambia) + compactar por presión medida; v2.3.14 · FASE 13 CABLEADA: el medidor existía desde v1.5x y NADIE lo llamaba. Comparte línea con los de arriba a propósito: el trinquete de `server.ts` es `presupuesto_lineas` y este asiento no lo mueve. · v1.0.14 cercoDeAlcance: si el plan inventó tareas fuera del pedido, se re-ancla (mismo asiento).
// v1.48.0 — LA .CON-CIENCIA MADURADA: el cerebro como órgano de redirección
// (indice.json enruta por tema/título/contexto a los ficheros .md exactos del
// tema; NO se lee todo). Aprende solo y se inyecta SOLO lo enrutado. Base local bajo
// PROJECT_ROOT/cerebro (C:\Cerebronico\cerebro). Pedido de Mario.
import { buildCerebroContext, enrutarHibrido as enrutarHibridoCerebro, indexarSesiones as indexarSesionesCerebro, aprender as aprenderCerebro, enrutar as enrutarCerebro, estadoCerebro, type Ruta as RutaCerebro } from "./src/engine/cerebroOrgano"; // v1.97.2 · el embedder sale a su módulo (partir, no añadir): prueba /api/embed y /api/embeddings y, si ambos dan 404, dice el comando de arreglo
// v1.98.0 · el embedder ya no se elige a ciegas: mira qué tiene Ollama antes de señalar uno.
import { montarResolutorEmbedder, registrarEmbedderCerebro } from "./server/routers/embedderCerebro";
import { registrarSupervisorArranque } from "./server/routers/supervisorArranque";import { registrarAutoLlamado } from "./server/routers/autoLlamado"; import { interruptorQuirofano, registrarRutasInterruptorQuirofano } from "./server/routers/quirofanoInterruptor"; import { mensajeBloqueoQf, avisoJuezApagado } from "./src/engine/quirofano"; // v2.3.9 · el interruptor del Quirófano con memoria, y el mensaje del bloqueo que se va al motor. Se comparten la línea: el trinquete de contrato-rutas.json es una decisión, no un adorno, y el monolito no crece por comodidad.

// v1.98.0 · EL ECO: lo mismo, una vez (25 líneas iguales por turno tapaban la alarma nueva).
import { avisarCapacidadSinVerificar, avisarRecorteDeHistorial } from "./server/routers/ecoTurno";

// Fase 2 — Índice de símbolos (conocimiento real del proyecto) y compactador
// de contexto (disciplina de tokens en el motor).
import { buildSymbolMap, findSymbols, summarizeSymbols, type SymbolMap } from "./src/engine/symbolIndex";
import { compactToolResult, compactToolOutput } from "./src/engine/compactor";
// v1.63.0 — guarda de repetición de SOLO-LECTURA (bucle de relectura idéntica
// que el lazo suave consecutivo no cazaba por rotar entre varias herramientas).
import {
  nuevoEstadoLectura,
  evaluarLectura,
  registrarEscrituraLectura,
  type EstadoLectura,
} from "./src/engine/repeticionLectura";
// v1.64.0 — FASE 3: el bucle, VISIBLE para el modelo (detecta el ciclo repetido y lo inyecta ANTES de que las guardas duras corten).
import { nuevoContextoBucle, registrarPaso, evaluarContextoBucle, abrirTurnoBucle, type EstadoContextoBucle } from "./src/engine/contextoBucle";
import { contextoBucleSesion } from "./src/engine/contextoBucleSesion"; // v1.66.1 · memoria del ciclo compartida por los tres bucles
// v2.0 — Verificador de imports: detecta componentes que el modelo importa pero
// nunca creó (causa directa del cartel rojo de Vite y la pantalla en blanco).
import {
  findMissingImports,
  buildStubs,
  describeMissingImports,
  type CheckFile,
  type MissingImport,
} from "./src/engine/importChecker";
// v1.6.7 — CHEQUEO PREVIO DE DEPENDENCIAS: paquetes que el proyecto importa y
// que nadie declaró. Es lo que dejaba el sandbox arrancado pero en blanco.
import {
  paquetesFaltantes,
  declaradosSinInstalar,
  comandoInstalacion,
  describirFaltantes,
  // v1.6.24 — AUDITORÍA DE INTEGRIDAD: deja de preguntar «¿existe la carpeta?»
  // y empieza a preguntar «¿el paquete puede cargarse?». Sin esto, un
  // node_modules podado por el ZIP pasaba por instalado y el sandbox moría
  // con «Cannot find module …/vite/dist/node/chunks/dist.js».
  auditarInstalacion,
  instalacionSana,
  saludDePaquete,
  type DiscoDeAuditoria,
} from "./src/engine/dependenciasProyecto";
// v1.6.9 — EL BÚFER DE INFERENCIA, EN EL CAMINO REAL DE LOS DATOS.
// Hasta ahora era un módulo escrito y probado que nadie importaba. Aquí pasa a
// ser lo que interpreta cada línea del NDJSON de Ollama.
import { handleInferenceStream } from "./src/engine/inferenceBuffer";
// v1.6.10 — RAÍZ DE DATOS: dónde vive todo (bóveda, espejos, conocimiento y
// proyectos) y la mudanza de una sola vez a C:\Cerebronico.
import {
  resolverRaizDatos,
  decidirMigracion,
  mensajeMigracion,
  CARPETAS_DE_ESTADO,
  rechazarRaizAncestroApp,
  esAncestroOEquivale,
} from "./src/engine/raizDatos";
// v1.6.9 — VÍA RÁPIDA DE PREVISUALIZACIÓN: decidir la ruta más barata en vez de
// ir siempre por `npm install && npm run dev`.
import {
  elegirViaPreview,
  esFrameworkConServidor,
  tieneConfigPropia,
  fuentesATranspilar,
  entradaDeHtml,
  comandoBundle,
  reescribirHtmlParaBundle,
  importacionesDesnudas,
  NOMBRE_BUNDLE,
  NOMBRE_RESPALDO,
} from "./src/engine/viaRapidaPreview";
// v2.0 — CEREBRO + MEMORIA: capa de gobernanza del motor.
// cerebro.md = ley inmutable · memoria.md = estado vivo (escritura atómica +
// snapshots en memoria_history/, con rollback).
import { Brain } from "./src/engine/brain";
// v8.0.2 — CONTENEDOR GENERAL: reconocer cualquier formato por firma mágica,
// planear conversiones declarando lo que se pierde, y crear/modificar vídeo con
// recetas de ffmpeg. Se engancha aquí para que NO sea código muerto: las mismas
// funciones puras que hoy tienen 161 comprobaciones en las pruebas son las que
// responde el endpoint `/api/contenedor/inspeccionar`.
import { inspeccionar, planDeEntrega, capacidades, type Motor as MotorContenedor } from "./src/engine/contenedor";
import { estadoCadenaVideo } from "./src/engine/videoGen";
// v8.0.4 — Aduana del comando que entra a la consola. Nació de un defecto real:
// el TEXTO de una llamada de herramienta (`run_command command="…"`) llegó al
// shell y se intentó ejecutar. Se desenvuelve si es legible; si no, se rechaza.
import { normalizarComandoEntrante, esServidorDeLargaVida } from "./src/engine/comandoEntrante";
// v1.6.31 — ESPEJO-SYNC: el sync ya no deja restos. Un manifiesto de propiedad
// (.cn-sync/manifiesto.json) recuerda qué archivos escribió el sync; lo que se
// escribió antes y ya no llega se RETIRA. Las funciones puras viven en
// src/engine/espejoSync.ts; aquí solo se les da el disco.
import {
  MANIFESTO_DIR,
  MANIFESTO_FILE,
  crearManifiesto,
  planificarRetiro,
  registrarSync,
  serializarManifiesto,
  parsearManifiesto,
  esRutaIgnorableSync,
  lineaEspejoSync,
} from "./src/engine/espejoSync";
// v0.9 — Fuente única de la versión. La usaba la interfaz pero NO el servidor, y
// por eso el saludo del modo demo se había quedado en «CerebroNico V1».
import { IDE_BRAND } from "./src/constants";
// v8.0.7 — EL ESPEJO DEL PROYECTO: plantilla de qué archivos necesita cada tipo
// de proyecto, y cotejo contra lo que hay. Nació del «siempre se olvida de los
// archivos de un proyecto»: el modelo no escribe mal, no sabe cuántos son.
import { compararConEspejo, preguntaDeFaltantes } from "./src/engine/plantillasProyecto";
// CN v1.5.0 — EL PUENTE, MEDIDO EN VIVO. El módulo puro aporta el contrato, el
// búfer circular y las métricas; aquí se le da un transporte REAL contra Ollama.
// Y `http`/`socketPath` sólo se usan AQUÍ (server.ts es Node), nunca bajo `src/`,
// que va al paquete del navegador: la regla del módulo puro se respeta.
import { medirPuente, PuenteNube, compararPuentes, veredicto, UMBRAL_TTFT_MS, type PuenteIA } from "./src/engine/puenteIA";
// v2.0 — Vectorización local (RAG) de la memoria. CONSTRUIDA Y APAGADA: solo
// trabaja si el usuario la activa con el botón. Apagada no cuesta nada.
import { LocalRAG } from "./src/engine/localRAG";
// v2.0 — Laboratorio de capacidades avanzadas: construidas y APAGADAS, cada una
// con su botón. Nada se recorta por el hardware de hoy.
import { AdvancedFeatures } from "./src/engine/advancedFeatures";
// v2.0 — Gobernador de hardware: mide la máquina real (RAM libre, núcleos),
// clasifica la fase (V2.0/V2.1/V2.2/V2.3) y dictamina qué cabe AHORA. No activa
// nada por su cuenta: informa y recomienda.
import { HardwareGovernor, cpuPercentReal } from "./src/engine/hardwareGovernor";
// v2.1 — Verificador independiente EN LA NUBE: un segundo modelo (de otro
// proveedor) revisa la propuesta. Coste local ~0,1 MB: cabe en 8 GB, hoy.
import { CloudVerifier } from "./src/engine/cloudVerifier";
// ─── El cerebro de tareas (v2.2) ────────────────────────────────────────────
import { PlanRunner } from "./src/engine/planRunner";
import { GestorPlanes, crearAlmacenFs } from "./src/engine/taskStoreFs";
import { crearEjecutorDePlanes } from "./src/engine/planExecutors";
import { resolverOllama } from "./src/engine/direccionOllama";
import { narrarDesdeAviso, coreoEstado, notificar } from "./src/engine/coreo"; // COREO v1 (+FONDO: notificar)
import { validarFondo, tipoDeArchivo, dentroDe, metaDeFondo, limiteLegible, LIMITES_BYTES, TIPOS_FONDO } from "./src/engine/fondo"; // FONDO v1
import { cedeElLazo } from "./src/engine/sandboxTregua"; // TREGUA v1 /*TREGUA*/
// v1.6.23 — RESCATE v1: antes de nuklear .proyectos, el estado de CerebroNico
// (.cerebro-db: kb, espejos, salud, bóveda, leyes + MEMORIA.md y skills.md) se
// muda a la app. Si el rescate falla, el vaciado se ABORTA: la regla de «Borrar
// todo» del editor ya no puede llevarse puesta la memoria aprendida en silencio.
import {
  planearFusion,
  rutaRelRescate,
  procederBorrado,
  resumenRescate,
  planReSembrado,
  decidirRespaldo,
} from "./src/engine/estadoRescate"; /*RESCATE*/
import { convertir, idaYVuelta, FORMATOS as FORMATOS_CONV, type Formato as FormatoConv } from "./src/engine/formatConverter"; import { zipEntregable, infoEntregable, type CtxEntregable } from "./server/sandboxEntregable"; import { SPEC_CRIAR_PDF, ejecutarCrearPdf } from "./src/engine/herramientaPdf"; import { SPEC_CRIAR_DOCX, ejecutarCrearDocx } from "./src/engine/herramientaDocx"; import { SPEC_CRIAR_ZIP, ejecutarCrearZip } from "./src/engine/herramientaZip"; import { crearReinicioPuente, ejecutarHerramientaPuente, ES_HERRAMIENTA_PUENTE, fijarDependenciasPuente, depsPuente, SPEC_PUENTE_ESTADO, SPEC_REINICIAR_PUENTE } from "./src/engine/herramientaPuente"; // v1.97.0 · el interruptor del puente :5000 (otra máquina con cuerpo propio; el trinquete comparte línea) // v1.95.0 · crear_pdf / v1.96.0 · crear_docx + crear_zip: las máquinas de PDF, Word y ZIP viven en sus módulos; acá solo se montan (trinquete: partir, no añadir — por eso los tres imports comparten línea)
// ─── Imágenes gratis (v2.3) ──────────────────────────────────────────────────
import { generarImagen, validarDatosImagen, estadoCadenaImagen, rutaConExtensionReal } from "./src/engine/imageGen";
import { validarRutaImagen, instruccionesParaElModelo, extraerOrdenes } from "./src/engine/chatOrders";
import { TABLAS } from "./src/engine/reflejo";
import { estadoConsejo, ejecutarEntidad, cambiarActivacion, pensarConsejo, ENTIDADES, configurarSistema } from "./src/engine/reflejo/consejo";
// v1.15.1 — honestidad del consejo: qué acciones tienen ejecutor real y cuáles
// solo están declaradas. Antes el catálogo existía pero nadie lo exponía.
import { resumenEjecutores, EJECUTORES_CONSEJO } from "./src/engine/ejecutoresConsejo";
import { estadoEspejos, normalizarSeleccion, fijarSeleccion, fijarTurbo, IDS_ESPEJOS, GRUPOS_ESPEJOS, grupoPorTarea, notaSeleccionEspejos, seleccionMotor, notaEspejosDeEmpuje } from "./src/engine/reflejo/espejos"; // ESPEJOS v1 · TURBO v1 · GRUPO v1 · V8 D1 (la nota del equipo viaja a TODOS los proveedores) · v1.70.2 +seleccionMotor/+notaEspejosDeEmpuje (los espejos entran al re-empuje del bucle)
import { planificadorPorLeyes, estadoOrquestador, cargarLeyesAprendidas, LEYES_REFLEJO, orquestarPorFamilia, guardarLeyesAprendidas, leyAprendida, fijarTablaSalud, diagnosticoLeyes, configurarFsOrquestador, type LeyReflejo } from "./src/engine/reflejo/orquestador"; // ORQUESTADOR v1.0 (Reflejo v3.0) + SALUD/CONFIANZA v5
import { inicializarPool, agregarAlPool, quitarDelPool, catalogoPersonalizados, poolListo, poolEspejos } from "./src/engine/reflejo/cargadorEspejos"; // Reflejo v3.0 · Paso 2: espejos personalizados
import { pasarAduanaForja } from "./src/engine/aduanaForja"; // v1.85.0 · FASE 6.4: lo forjado pasa por aduana ANTES de tocar disco
import { registrarEjecucion, parsearTabla, serializarTabla, vistaSalud, estadoDe, scoreDe, type TablaSalud } from "./src/engine/reflejo/salud"; // SALUD v1 (Reflejo v5, manual §6.3)
import { reconocerCarpeta, clasificarEntrada, auditarEntradas, lineaReconocimiento, MARCADORES_PROYECTO } from "./src/engine/sandboxCompat"; // ADUANA v2 (Reflejo v5)
// v1.6.12 — «que sea funcional»: la evidencia web manda sobre un marcador suelto,
// y el esqueleto mínimo (package.json / index.html) se genera si falta.
import {
  hayEvidenciaWeb,
  servirPeseAlMarcador,
  esqueletoFaltante,
  packageJsonMinimo,
  indexHtmlMinimo,
} from "./src/engine/proyectoFuncional";
import { planearTransporte, indiceCon, indiceVacio, parsearIndice, arbolInicial, lineaTransporte, raizBovedaPorDefecto, CARPETAS_BOVEDA } from "./src/engine/bovedaLocal"; // BÓVEDA v1 (Reflejo v5)
import { createHash as _chAg, randomUUID as _ruAg } from "node:crypto";
configurarSistema({ totalmem: () => os.totalmem(), freemem: () => os.freemem(), cpus: () => os.cpus(), loadavg: () => os.loadavg(), sha256: (x) => _chAg("sha256").update(x, "utf8").digest("hex"), uuid: () => _ruAg() });
// ─── El Reflejo (v2.4) ──────────────────────────────────────────────────────
import { pensarReflejo, estadoReflejo } from "./src/engine/reflejo";
import { spawnSync } from "child_process";
// v1.56.8 · EVOLUCIÓN DE BUCLES — el punto de entrada no se inventa, y un lote que
// no escribió nada es un fallo (fuente única en src/engine/entradaReal.ts).
import {
  puntoDeEntradaVerificable,
  indexHtmlHonesto,
  sondaDeEntrada,
} from "./src/engine/entradaReal";
// v1.57.0 — el veredicto "¿sin Vite sirvo dist o me declaro muerto?" es puro (modoArranque.ts).
import { veredictoArranqueSinVite } from "./src/engine/modoArranque";
// v1.56.8 — el dominio `export` se fue a `server/routers/exportacion.ts`, y con él
// estos símbolos: traerlos aquí colgando sería una segunda puerta de entrada a
// mobileExport sin dueño (el catálogo honesto cuenta capacidades, no imports).
import { validarPlan, resumenPlan, lineaEstadoTarea, type Plan } from "./src/engine/taskPlanner";
import {
  resolverPresupuesto,
  siguienteEscalado,
  ESCALADOS,
  PERFILES_MR,
  ORDEN_MR,
  etiquetaEscalado,
  type MRId,
} from "./src/engine/memoriaResiliente";
// v2.1 — Adaptador de proyectos: arregla el puerto de arranque para que
// cualquier proyecto importado (p. ej. los de AI Studio, que traen
// `vite --port=3000`) funcione en el sandbox :3500 sin editarlo a mano.
import {
  normalizeProjectPort,
  resolverRaizProyecto as resolverRaizProyectoEn, puertaDeEleccionDeRaiz, // v1.97.0 · la puerta de elección de raíz (decisión pura; el monolito solo la consulta)
} from "./src/engine/projectPorter";

const PORT = Number(process.env.PORT) || 3000;
const WORKER_PORT = 5000;
// v2.2.2 · OLLAMA_HOST es una direccion de ESCUCHA (el .bat la pone en
// 0.0.0.0:11434 para que Ollama acepte red). Copiarla tal cual al client era
// llamar a un destino inalcanzable: /api/ollama/models devolvia lista vacia
// con HTTP 200, el embedder no media, y el chat local no arrancaba. Se
// interpreta (ver src/engine/direccionOllama.ts) y el arreglo se avisa en el
// arranque, porque un entorno roto tiene que decirlo una vez y en voz alta.
if (modoServidor()) globalThis.fetch = fetchConClave(globalThis.fetch); const __ollama = resolverOllama(process.env);
const OLLAMA_DEFAULT = __ollama.base;
for (const __oa of __ollama.avisos) {
  console.log(`[CerebroNico] ⚠ dirección de Ollama corregida (desde ${__ollama.origen}): ${__oa}`);
}

/**
 * CN v1.5.0 — TRANSPORTE POR SOCKET DE DOMINIO UNIX, PARA PODER MEDIRLO.
 *
 * Medición propia (ver `ide/backend/tools/puente-bench/`): ida y vuelta por socket
 * Unix = 16,42 µs frente a 45,08 µs de TCP loopback. Un 63 % menos. Y el motivo de
 * fondo es que **en Linux un socket Unix ya es un búfer circular del kernel**: el
 * «cero copia» que se buscaba con lenguajes nuevos ya está ahí, y sale más rápido
 * que montarlo a mano (31,89 µs el mmap+eventfd).
 *
 * POR QUÉ ESTO NO SUSTITUYE AL CANAL QUE YA FUNCIONA: sería migrar a ciegas. Se
 * añade como SEGUNDO transporte, y el endpoint de medición compara los dos con la
 * misma entrada. Si el socket Unix no existe en el equipo, se dice que no existe
 * — no se compara contra un cero que parecería una victoria.
 *
 * Vive en `server.ts` y NO bajo `src/` a propósito: `node:http` no puede acabar en
 * el paquete del navegador, y `src/` va entero al navegador.
 */
function puenteUds(rutaSocket: string, modelo: string, recordarEntrada: string): PuenteIA {
  void recordarEntrada;
  return {
    modo: `UDS (${rutaSocket})`,
    async conectar(): Promise<void> { /* el canal se abre en la petición */ },
    async *enviar(entrada: string): AsyncGenerator<TrozoUds, void, unknown> {
      const http = await import("node:http");
      const cuerpo = JSON.stringify({
        model: modelo,
        messages: [{ role: "user", content: entrada }],
        stream: true,
        options: { num_predict: 24, num_ctx: getProfile(modelo).numCtx }, // v1.57.14: sin num_ctx propio, el puente UDS heredaba el contexto global del equipo (256k de la app = swap)
      });

      // Cola mínima: `http.request` empuja por eventos y un generador asíncrono
      // tiene que esperar. Sin esta cola habría que acumular la respuesta entera
      // para poder devolverla — que es exactamente el defecto que se está midiendo.
      const cola: Uint8Array[] = [];
      let terminado = false;
      let fallo: unknown = null;
      let despertar: (() => void) | null = null;
      const avisar = () => { const d = despertar; despertar = null; if (d) d(); };

      const req = http.request(
        {
          socketPath: rutaSocket,
          path: "/api/chat",
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(cuerpo) },
        },
        (resp) => {
          resp.on("data", (d: Buffer) => { cola.push(new Uint8Array(d)); avisar(); });
          resp.on("end", () => { terminado = true; avisar(); });
          resp.on("error", (e) => { fallo = e; terminado = true; avisar(); });
        }
      );
      req.on("error", (e) => { fallo = e; terminado = true; avisar(); });
      req.end(cuerpo);

      let n = 0;
      for (;;) {
        while (cola.length) yield { n: n++, bytes: cola.shift()!, tRecibido: Date.now() };
        if (terminado) break;
        await new Promise<void>((r) => { despertar = r; });
      }
      while (cola.length) yield { n: n++, bytes: cola.shift()!, tRecibido: Date.now() };
      if (fallo) throw fallo;
    },
    async cerrar(): Promise<void> { /* se cierra al agotarse el stream */ },
  };
}

/** Sólo para tipar el transporte de arriba sin arrastrar el tipo del módulo puro. */
type TrozoUds = { n: number; bytes: Uint8Array; tRecibido: number };

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Constants for the streaming layer
const OLLAMA_INACTIVITY_MS = 5 * 60 * 1000;    // kill Ollama stream if no token in 5 min (model loading can take long on slow CPUs)
// 🔧 CORRECCIÓN CRÍTICA: el timeout de conexión era 8s — eso abortaba el fetch
// ANTES de que Ollama terminara de cargar el modelo en RAM. En CPUs lentos
// (como un i5-3340M), cargar qwen2.5-coder:1.5b y procesar el prompt puede tardar
// 87+ segundos. Subimos a 3 min para dar tiempo a la carga inicial del modelo.
const OLLAMA_CONNECT_TIMEOUT_MS = 3 * 60 * 1000; // 3 min for first byte (model load + prompt processing)
const OLLAMA_MAX_CONNECT_ATTEMPTS = 4; // OLLAMA v2 — 4 intentos con backoff de segundos ≈ 14 s de paciencia (arranque en frío en disco lento)

// v1.6.16 — TECHO DE ESPERA PARA LA NUBE: corte SOLO de primer byte (TTFB).
// Sin signal, un proveedor mudo colgaba hasta el watchdog de 8 min. Una vez que
// llegan cabeceras la generación puede tardar minutos: abortar a mitad es peor.



// ============================================================
// Sandbox: directorio de proyecto real + ejecución de comandos
// ============================================================
// Raíz de instalación separada de la obra; criterios de Gemini en configServidor.
const RAIZ_INSTALACION = (() => {
  const carpetaModulo = (() => {
    try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return ""; }
  })();
  const empaquetado = esEmpaquetado(carpetaModulo, (c) => { try { return fs.existsSync(c); } catch { return false; } });
  const d = decidirRaizInstalacion(
    {
      cwd: process.cwd(),
      plataforma: process.platform,
      modo: empaquetado ? "empaquetado" : "fuentes",
      env: process.env as Record<string, string | undefined>,
      carpetaDelModulo: carpetaModulo,
    },
    (c) => { try { return fs.existsSync(c); } catch { return false; } },
  );
  console.log(`[CerebroNico] ${d.sinMarcas ? "⚠️  " : ""}${d.nota}`);
  return d.raiz;
})();
const {PROJECT_ROOT, raizPorDefecto, raizResuelta} = decidirRaicesEdicion(RAIZ_INSTALACION);
console.log(`[CerebroNico] Raíz de datos activa: ${PROJECT_ROOT} (instalación: ${RAIZ_INSTALACION})`);
try {
  fs.mkdirSync(PROJECT_ROOT, { recursive: true });
} catch {}
// v1.0.14 · «Preparar herramientas» (APK) descarga en <raíz de datos>/.cerebronico/herramientas:
// el aprovisionador necesita conocer esta raíz antes de cualquier request.
fijarRaizDatosParaHerramientas(PROJECT_ROOT);

// --- Mudanza de una sola vez (reglas en src/engine/raizDatos.ts) ------------
// Copia, nunca mueve ni borra: el original se queda donde estaba, así que
// volver atrás es borrar la carpeta nueva. Y solo si la nueva está VACÍA.
try {
  const hayEstado = (raiz: string) =>
    CARPETAS_DE_ESTADO.some((c) => {
      try {
        return fs.existsSync(path.join(raiz, c));
      } catch {
        return false;
      }
    });
  const decision = decidirMigracion({
    raizDestino: PROJECT_ROOT,
    raizOrigen: raizPorDefecto,
    destinoTieneEstado: hayEstado(PROJECT_ROOT),
    origenTieneEstado: hayEstado(raizPorDefecto),
  });
  if (decision.migrar) {
    for (const carpeta of CARPETAS_DE_ESTADO) {
      const desde = path.join(raizPorDefecto, carpeta);
      if (!fs.existsSync(desde)) continue;
      // `force: false` = no pisa nada que ya exista en el destino.
      fs.cpSync(desde, path.join(PROJECT_ROOT, carpeta), {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
    }
    console.log(`[CerebroNico] ${mensajeMigracion(raizPorDefecto, PROJECT_ROOT)}`);
  } else if (raizResuelta.origen === "PROJECT_DIR") {
    console.log(`[CerebroNico] Raíz de datos: ${PROJECT_ROOT} (${decision.motivo}).`);
  }
} catch (err: any) {
  console.warn(
    `[CerebroNico] La mudanza de raíz no se completó (${err?.message ?? err}). Se sigue con la raíz nueva.`
  );
}

// Por seguridad el servidor escucha solo en localhost por defecto.
// Usa HOST=0.0.0.0 (junto con ACCESS_TOKEN) solo si necesitas acceso en red local.
const HOST = process.env.HOST || "127.0.0.1";

const execAsync = promisify(exec);

/**
 * Guard de acceso para las puertas mutantes (sandbox, exec, fs, quirófano…).
 *
 * v1.7.0 · DE «SI HAY TOKEN LO EXIJO» A «FUERA DE LOCALHOST, SIEMPRE»
 * ------------------------------------------------------------------
 * Antes esto empezaba con `if (!token) return true;`: sin ACCESS_TOKEN la
 * puerta NO existía. Y el mismo guard protege rutas alcanzables desde la red
 * local — el sandbox fuerza su propio HOST a 0.0.0.0 para el preview :3500, y
 * el puente escucha en :5000. Es decir: la ausencia de una variable de entorno
 * convertía una decisión de seguridad en un permiso.
 *
 * Ahora el reparto es explícito y en voz alta:
 *   · Loopback (la IDE, en la misma máquina) → pasa sin token. Exigir token
 *     aquí no añadiría seguridad: quien puede hablar por loopback ya está
 *     dentro de la máquina. Sería ceremonia, no puerta.
 *   · Cualquier otra dirección → token obligatorio Y correcto. Si no hay
 *     ACCESS_TOKEN definido, NO pasa: un fallo de configuración no puede
 *     degradar a «permiso concedido».
 */
function sandboxAuthorized(req: Request): boolean {
  const token = process.env.ACCESS_TOKEN;
  const provided = String(req.headers["x-access-token"] || "") || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token && provided === token) return true;

  // Sin token correcto solo pasa la propia máquina (propiedad fail-closed: si
  // no hay ACCESS_TOKEN, fuera de loopback sigue bloqueado sin excepciones por origen).
  const ip = String(req.ip || req.socket?.remoteAddress || "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" ||
    ip.startsWith("127.") || ip === "localhost";
}

// ============================================================
// SALUD v1 (Reflejo v5) — la flota de espejos se gana su prioridad
// ------------------------------------------------------------
// .cerebro-db/espejos-salud.json guarda usos/éxitos/correcciones por espejo.
// El orquestador recibe la tabla por inyección (fijarTablaSalud): un espejo
// DORMIDO (score < 0.5 con ≥8 usos) no se elige solo en el auto-enrutado,
// pero la ruta explícita (id o familia) siempre lo alcanza. Dormir no es matar.
// ============================================================
const archivoSalud = path.join(PROJECT_ROOT, ".cerebro-db", "espejos-salud.json");
let TABLA_SALUD: TablaSalud = {};
try {
  if (fs.existsSync(archivoSalud)) {
    const pr = parsearTabla(JSON.parse(fs.readFileSync(archivoSalud, "utf8")));
    TABLA_SALUD = pr.tabla;
    for (const a of pr.avisos) console.log(`[Salud] aviso: ${a}`);
  }
} catch (e: any) {
  console.log(`[Salud] no se pudo leer espejos-salud.json (${String(e?.message || e)}): se arranca limpio.`);
}
fijarTablaSalud(TABLA_SALUD);
function guardarSalud() {
  try {
    fs.mkdirSync(path.dirname(archivoSalud), { recursive: true });
    fs.writeFileSync(archivoSalud, serializarTabla(TABLA_SALUD), "utf8");
  } catch {}
}
/** Registra una ejecución de espejo (ok / corregida) y persiste. Nunca lanza. */
function registrarSaludEspejo(id: string, ok: boolean, corregido = false) {
  try {
    TABLA_SALUD = registrarEjecucion(TABLA_SALUD, id, ok, corregido);
    fijarTablaSalud(TABLA_SALUD);
    guardarSalud();
  } catch {}
}

// ============================================================
// BÓVEDA v1 (Reflejo v5) — el transporte de imágenes al disco real
// ------------------------------------------------------------
// «Que el agente cree C:\CN con carpetas indexadas (IMAGENES, APPS,
// INVESTIGACION, documentos, datos) y que la imagen generada VIAJE hasta
// ahí». El viaje lo ejecuta el puente PC (:5000) — la única puerta con manos
// fuera del sandbox — por /api/fs/write_b64. La config vive en
// .cerebro-db/boveda.json; sin puente no hay viaje, y eso se DECLARA.
// ============================================================
const archivoBoveda = path.join(PROJECT_ROOT, ".cerebro-db", "boveda.json");
interface ConfigBoveda { activa: boolean; raiz: string; }
let BOVEDA: ConfigBoveda = (() => {
  const porDefecto: ConfigBoveda = { activa: true, raiz: raizBovedaPorDefecto(process.platform, os.homedir()) };
  try {
    if (fs.existsSync(archivoBoveda)) {
      const c = JSON.parse(fs.readFileSync(archivoBoveda, "utf8"));
      if (typeof c?.raiz === "string" && c.raiz.trim()) porDefecto.raiz = c.raiz.trim();
      if (typeof c?.activa === "boolean") porDefecto.activa = c.activa;
    }
  } catch {}
  if (process.env.CN_BOVEDA_RAIZ) porDefecto.raiz = process.env.CN_BOVEDA_RAIZ;
  if (process.env.CN_BOVEDA === "0" || process.env.CN_BOVEDA === "off") porDefecto.activa = false;
  return porDefecto;
})();
function guardarBoveda() {
  try {
    fs.mkdirSync(path.dirname(archivoBoveda), { recursive: true });
    fs.writeFileSync(archivoBoveda, JSON.stringify(BOVEDA, null, 2), "utf8");
  } catch {}
}
/** POST al puente PC con timeout duro. Devuelve null si el puente no está. */
async function puenteFetch(ruta: string, cuerpo: Record<string, unknown>, timeoutMs = 20000): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${WORKER_PORT}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}
/**
 * El transporte en sí: planea la ruta indexada, escribe el binario por el
 * puente y actualiza el INDICE.json de la carpeta destino. Devuelve la línea
 * honesta para el chat/avisos. Nunca lanza: si el puente no contesta, la
 * imagen YA está a salvo en el sandbox y el aviso lo dice.
 */
async function transportarABoveda(opts: {
  bytes: Uint8Array;
  mime: string;
  proyecto: string;
  archivo: string;
  origenSandbox: string;
  categoria?: string;
  modeloUsado?: string;
}): Promise<string> {
  if (!BOVEDA.activa) return "";
  const plan = planearTransporte({
    raiz: BOVEDA.raiz,
    categoria: opts.categoria || "imagen",
    proyecto: opts.proyecto,
    archivo: opts.archivo,
    mimeReal: opts.mime,
    fechaIso: new Date().toISOString(),
    separador: process.platform === "win32" ? "\\" : "/",
  });
  if (!plan.ok) return lineaTransporte(false, null, plan.motivo);
  const firma = _chAg("sha256").update(opts.bytes).digest("hex").slice(0, 16);
  const w = await puenteFetch("/api/fs/write_b64", {
    path: plan.plan.rutaLocal,
    contentBase64: Buffer.from(opts.bytes).toString("base64"),
  });
  if (!w?.ok) { const ccQf = caminoCorrectoPara("el puente PC (:5000) no respondió"); return lineaTransporte(false, plan.plan, "el puente PC (:5000) no respondió o rechazó la escritura; la imagen queda en el sandbox" + (ccQf ? " · CAMINO CORRECTO: " + ccQf : "")); }
  // Índice: leer el viejo (si existe), añadir, escribir. Si la lectura falla,
  // se arranca limpio y se avisa — un índice reconstruido vale más que ninguno.
  let indice = indiceVacio();
  const archivoIndice = `${BOVEDA.raiz.replace(/[\\/]+$/, "")}${process.platform === "win32" ? "\\" : "/"}${CARPETAS_BOVEDA[plan.plan.carpeta]}${process.platform === "win32" ? "\\" : "/"}INDICE.json`;
  const r = await puenteFetch("/api/fs/read", { path: archivoIndice });
  if (r?.ok && r.content) {
    try { indice = parsearIndice(JSON.parse(r.content)); } catch {}
  }
  indice = indiceCon(indice, {
    archivo: plan.plan.relativa,
    proyecto: plan.plan.proyecto,
    origenSandbox: opts.origenSandbox,
    mime: opts.mime,
    bytes: opts.bytes.length,
    modeloUsado: opts.modeloUsado,
    firma,
    en: new Date().toISOString(),
  });
  await puenteFetch("/api/fs/write", { path: archivoIndice, content: JSON.stringify(indice, null, 2) });
  return lineaTransporte(true, plan.plan, "");
}

/** ADUANA v2: ¿esta carpeta (por nombres) es un proyecto reconocible? */
function esCarpetaProyecto(nombres: string[]): boolean {
  const r = reconocerCarpeta(nombres);
  return !!r && r.peso >= 40; // desde "make" hacia arriba; docs/datos no secuestran la raíz
}

function resolveSafePath(relPath: string): string { if (modoServidor()) return rutaWorkspace(PROJECT_ROOT, relPath);
  // v1.90.0 · UNA RAÍZ, UN ESPEJO: con carpeta vinculada (CANAL DIRECTO) la obra se
  // escribe donde el Editor web la ve y el sandbox la sirve en :3500. Sin vincular,
  // mismo comportamiento de siempre. Criterio y fugas: src/engine/raizDeObra.ts.
  return resolverRutaDeObra({ rel: relPath, raizProyecto: PROJECT_ROOT, vinculada: leerRutaVinculada(PROJECT_ROOT), servida: raizDeObraEnCurso(PROJECT_ROOT) || otraObraAbierta() }).abs; // v1.0.20 · + la obra del registro como último recurso
}

// ============================================================
// v2.1 — ¿HAY UNA COPIA MÁS NUEVA DEL PROYECTO DENTRO DE .proyectos?
// ------------------------------------------------------------
// CAUSA RAÍZ de la pantalla en blanco que sobrevivía a reinstalaciones.
//
// Había TRES sitios distintos —el estado, el aplanado y el resolutor de raíz—
// que daban el trabajo por terminado en cuanto veían un `package.json` EN LA
// RAÍZ. Pero el sync escribe SIEMPRE el árbol anidado (el workspace guarda las
// rutas con su carpeta contenedora), así que en la raíz vivía el proyecto VIEJO
// y dentro el RECIÉN sincronizado. En cuanto la raíz tuvo package.json el
// sandbox quedaba CONGELADO: cargaba el TÍTULO y devolvía 404 en todos los
// `/src/components/*`.
//
// Esta búsqueda mira DENTRO siempre, aunque la raíz ya tenga package.json.
// ============================================================
function buscarProyectoAnidado(): string | null {
  const skip = new Set([
    "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
    "venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
  ]);
  const recorrer = (dir: string, prof: number): string | null => {
    if (prof > 5) return null;
    let entradas: fs.Dirent[] = [];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      // ============================================================
      // v8.0.5 — 🐞 EL APLANADO TAMPOCO ENCONTRABA NADA, POR ESTA LÍNEA
      // ------------------------------------------------------------
      // Antes: `if (e.name.startsWith(".") || skip.has(e.name)) continue;`
      //
      // Se descartaba cualquier carpeta que empezara por punto ANTES de mirar
      // dentro. Y en este proyecto los caminos empiezan por punto: la carpeta
      // contenedora se llama `.proyectos`. Así que el proyecto anidado vivía en
      // un subdirectorio con punto, esta función lo descartaba por su nombre, y
      // el aplanado respondía «no hay ninguna copia anidada» teniéndola delante.
      //
      // De ahí el «no aplana bien y no encuentra los archivos» del usuario: no
      // era que aplazara mal, es que nunca llegaba a mirar.
      //
      // Se ignora por LISTA (artefactos y control de versiones), no por prefijo.
      // ============================================================
      if (skip.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      // ADUANA v2: cualquier proyecto reconocible (node, python, rust, go,
      // java, php, ruby, estático, docker, make…) vale — antes solo era
      // «package.json» y un ZIP de Python anidado era invisible.
      try {
        if (esCarpetaProyecto(fs.readdirSync(sub))) return sub;
      } catch {}
      const hit = recorrer(sub, prof + 1);
      if (hit) return hit;
    }
    return null;
  };
  return recorrer(PROJECT_ROOT, 1);
}

// Auto-arranque del Puente Python (puerto 5000): lo levanta si no está activo y lo apaga al cerrar
// 🔧 Devuelve además una función restart() para que el endpoint /api/bridge/restart pueda
// reiniciar el puente bajo demanda del usuario (botón "Reconectar" en la UI).
async function startAgentBridge(): Promise<{ kill: () => void; restart: () => Promise<boolean>; adoptado: boolean } | null> { // v1.97.0 · `adoptado`: decir la verdad sobre quién puede reiniciar el puente
  // ============================================================
  // v2.1 — 🐞 EL PUENTE NO DEBE ARRANCAR DENTRO DEL SANDBOX
  // ------------------------------------------------------------
  // Cuando el sandbox ejecuta ESTE proyecto, la IDE anidada intentaba levantar
  // su propio puente en :5000… que YA está ocupado por el puente de la IDE
  // anfitriona, en la misma máquina. Reproducido en local, literal:
  //   ❌ [ERROR] El puerto 5000 ya está ocupado.        (×5)
  //   [CerebroNico] Puente 5000 agotó 5 reinicios.
  //   [CerebroNico] Puente 5000 iniciado con python3 pero /health no responde aún.
  // De ahí el "no escucha" en la interfaz: el puente del sandbox NUNCA puede
  // escuchar, porque ese puerto no es suyo. No es un fallo de tu proyecto.
  //
  // Y no hace falta: el sandbox ejecuta con runCommand(..., raizProyecto) LOCAL
  // (ver /api/sandbox/*), así que no necesita puente para nada. Además, las
  // herramientas pc_* no tienen sentido ahí: acabarían actuando sobre la PC del
  // usuario a través del puente de la IDE anfitriona.
  //
  // Opt-out: CN_SANDBOX_CHILD=1 (lo pone sandboxEnv) o CN_DISABLE_BRIDGE=1.
  // ============================================================
  if (process.env.CN_SANDBOX_CHILD === "1" || process.env.CN_DISABLE_BRIDGE === "1") {
    console.log(
      "[CerebroNico] Puente 5000 OMITIDO a propósito: esto es un proyecto corriendo DENTRO del sandbox. El puerto 5000 es de la IDE anfitriona y el sandbox no necesita puente."
    );
    return null;
  }
  const scriptPath =
    [path.join(RAIZ_INSTALACION, "agent_bridge_5000.py"), path.join(process.cwd(), "agent_bridge_5000.py")].find((p) =>
      fs.existsSync(p)
    ) || path.join(process.cwd(), "agent_bridge_5000.py");
  if (!fs.existsSync(scriptPath)) {
    console.log("[CerebroNico] agent_bridge_5000.py no encontrado; puerto 5000 no se auto-inicia.");
    return null;
  }

  const pythonBin = process.platform === "win32" ? "python" : fs.existsSync("/usr/bin/python3") ? "python3" : "python";

  // v1.43.0 — BUGFIX :5000 NO ARRANCA EN EL EXE: los daemons :5100/:5102 los
  // lanza electron-main.cjs con el Python EMBEBIDO (CN_PYTHON) y por eso sí
  // suben; el puente :5000 lo arranca ESTE server y usaba el literal "python",
  // que en el EXE empaquetado puede no resolver (PATH sin el embebido, o un
  // Python de la Store que abre la tienda en vez de ejecutar). Si Electron nos
  // pasó CN_PYTHON, es el intérprete de confianza: lo usamos directamente y
  // nos saltamos la sonda `where python`.
  const pythonEmbebido = process.env.CN_PYTHON && fs.existsSync(process.env.CN_PYTHON) ? process.env.CN_PYTHON : null;
  const pythonElegido = pythonEmbebido || pythonBin;

  // 🔧 Fallback sin Python (v3.3): si Python no está instalado en la PC del
  // usuario, el puente moría en silencio y el EXE empaquetado del agente nunca
  // se usaba. Ahora: si hay Python usa el script; si no, lanza el EXE
  // (dist/CerebroNicoAgent.exe, creado por build_backend.bat).
  const probeCommand = (bin: string) =>
    runCommand(process.platform === "win32" ? `where ${bin} >nul 2>nul` : `command -v ${bin}`, process.cwd(), 8000);
  // v1.43.0 — si CN_PYTHON (embebido) existe, es una RUTA ABSOLUTA de confianza:
  // nos saltamos `where` (que no resuelve rutas) y validamos solo `--version`.
  // Si no, caemos a la sonda clásica sobre el `python` del sistema.
  const pythonOk = pythonEmbebido
    ? (await runCommand(`"${pythonEmbebido}" --version`, process.cwd(), 8000)).exitCode === 0
    : (await probeCommand(pythonBin)).exitCode === 0 &&
      (await runCommand(`"${pythonBin}" --version`, process.cwd(), 8000)).exitCode === 0;

  const exeCandidates = [
    path.join(process.cwd(), "..", "dist", "CerebroNicoAgent.exe"),
    path.join(process.cwd(), "dist", "CerebroNicoAgent.exe"),
  ];
  const bridgeExe = exeCandidates.find((p) => fs.existsSync(p)) || null;

  if (!pythonOk && !bridgeExe) {
    console.warn(
      "[CerebroNico] Ni Python ni dist/CerebroNicoAgent.exe están disponibles: el puente :5000 no se auto-inicia. Instala Python o compila el agente con build_backend.bat."
    );
    return null;
  }
  const useExe = !pythonOk;
  console.log(
    useExe
      ? `[CerebroNico] Python no detectado: el puente :5000 usará el agente compilado ${bridgeExe}`
      : `[CerebroNico] Puente :5000 usará Python (${pythonElegido}) con agent_bridge_5000.py`
  );

  // USERDATA v1 (recap): el log vive donde el proceso PUEDE escribir. En una
  // instalación por-máquina (C:\Program Files) cwd es solo-lectura para el
  // usuario normal y el createWriteStream fallaba en silencio. PROJECT_ROOT ya
  // honra PROJECT_DIR (que Electron dirige a userData).
  const bridgeLogPath = path.join(PROJECT_ROOT, ".bridge_5000.log");
  let bridgeLogStream: fs.WriteStream | null = null;
  try {
    bridgeLogStream = fs.createWriteStream(bridgeLogPath, { flags: "w" });
  } catch {
    bridgeLogStream = null;
  }

  let child: any = null;
  let restartCount = 0;
  const MAX_RESTARTS = 5;
  let userCancelled = false; let nacidoEn = 0; let reinicioEnCurso: Promise<boolean> | null = null; // v2.3.24 · sano mas de un minuto = arranque nuevo: caidas repartidas en dias no son una tormenta
  let puertoRobado = false; // v2.6.2 — EADDRINUSE no se reinicia en storm: se declara

  const spawnBridge = () => {
    if (userCancelled) return; puertoRobado = false; nacidoEn = Date.now(); // v2.3.24 · EL FLAG PEGAJOSO: `puertoRobado` se hacia true al primer EADDRINUSE y nunca volvia a false; el `exit` lo traduce en `restartCount = MAX_RESTARTS`, o sea que desde ese dia cada caida del :5000 quedaba sin reinicio automatico y pedia «Reconectar» a mano. Un puerto ocupado ayer no prueba que lo este hoy.
    try {
       child = useExe
         ? spawn(bridgeExe as string, [], {
             cwd: path.dirname(bridgeExe as string),
             stdio: ["ignore", "pipe", "pipe"],
             detached: false,
             // V8 · D3: el puente exige token en todo POST; el IDE se lo pasa al nacer
             env: { ...process.env, PORT: "5000", HOST: "127.0.0.1", ACCESS_TOKEN: BRIDGE_TOKEN, CN_PROJECT_DIR: PROJECT_ROOT }, // _PARCHE_ENV_PUENTE_V1: el puente hereda la raiz de datos
           })
         : spawn(pythonElegido, ["-u", scriptPath], { // v2.3.24 · `-u`: al redireccionar, Python bufferiza y .bridge_5000.log salia VACIO con el puente vivo — el diagnostico a ciegas empezaba aca
             cwd: path.dirname(scriptPath),
             stdio: ["ignore", "pipe", "pipe"],
             detached: false,
             env: { ...process.env, PORT: "5000", HOST: "127.0.0.1", ACCESS_TOKEN: BRIDGE_TOKEN, CN_PROJECT_DIR: PROJECT_ROOT }, // _PARCHE_ENV_PUENTE_V1: el puente hereda la raiz de datos
           });
    } catch (spawnErr: any) {
      console.warn(`[CerebroNico] No se pudo spawnear el Puente 5000:`, spawnErr.message);
      return;
    }

    child.on("error", (err: any) => {
      console.warn(`[CerebroNico] Puente 5000 error de spawn:`, err.message);
    });

    if (child.stdout) {
      child.stdout.on("data", (d: Buffer) => {
        const s = d.toString();
        if (bridgeLogStream) bridgeLogStream.write(s);
        // v1.6.0 — AQUI ESTABA EL DEFECTO. La deteccion de puerto ocupado solo
        // miraba stderr, y el puente Python anuncia el puerto ocupado por
        // STDOUT (es un print). Medido en el registro real: seis arranques
        // seguidos, seis EADDRINUSE, y el supervisor contando cada uno como
        // caida hasta agotar los 5 reintentos.
        // Un puerto ocupado es un estado PERMANENTE, no un fallo transitorio.
        if (/EADDRINUSE|Address already in use|ya esta ocupado|ya está ocupado/i.test(s)) puertoRobado = true;
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (d: Buffer) => {
        const s = d.toString();
        if (bridgeLogStream) bridgeLogStream.write(s);
        if (/EADDRINUSE|Address already in use/i.test(s)) puertoRobado = true;
        // Los errores del puente también van a la consola del server para diagnóstico
        console.warn(`[Puente 5000 stderr] ${s.trim()}`);
      });
    }

    child.on("exit", (code: number | null, signal: string | null) => { if (nacidoEn && Date.now() - nacidoEn > 60_000) restartCount = 0; // v2.3.24 · vivio un minuto largo: la seguidad anterior no debe contar
      console.warn(`[CerebroNico] Puente 5000 terminó (code=${code} signal=${signal}). Log en ${bridgeLogPath}.`);
      if (userCancelled) return;
      if (puertoRobado) {
        // v1.6.0 — Se nombra el ESTADO REAL del puerto, que es lo que faltaba.
        // El mensaje anterior era cierto pero no respondia a la pregunta que el
        // usuario se hace: «entonces el 5000 funciona o no?». Un puerto ocupado
        // por un proceso que NO responde /health es un estado INDETERMINADO, y
        // asi hay que llamarlo: de lo contrario la cabecera sigue diciendo
        // «5000 OK» mientras mira un cadaver.
        console.warn("[CerebroNico] :5000 ocupado por OTRO proceso: el puente no puede arrancar.");
        console.warn("[CerebroNico] ESTADO DEL PUERTO: INDETERMINADO (algo escucha, pero no es este puente).");
        console.warn("[CerebroNico] Liberar:  Windows -> netstat -ano | findstr :5000  +  taskkill /PID <PID> /F");
        console.warn("[CerebroNico]           Linux/Mac -> fuser -k 5000/tcp");
        console.warn("[CerebroNico] No se reintenta: un puerto ocupado no se arregla esperando.");
        restartCount = MAX_RESTARTS;
      }
      if (restartCount < MAX_RESTARTS) {
        restartCount++;
        console.log(`[CerebroNico] Reiniciando Puente 5000 (intento ${restartCount}/${MAX_RESTARTS}) en 1s...`);
        setTimeout(() => {
          if (!userCancelled) spawnBridge();
        }, 1000);
      } else {
        console.warn(`[CerebroNico] Puente 5000 agotó ${MAX_RESTARTS} reinicios. Usa /api/bridge/restart para reintentar manualmente.`);
        // Reset del contador para que el endpoint /api/bridge/restart funcione
        restartCount = 0;
      }
    });
  };

  // v2.6.2 — adopción de puente preexistente: si :5000 ya responde /health
  // (otra instancia de la IDE o un arranque manual), spawnear otro solo produce
  // la tormenta EADDRINUSE + 5 reinicios zombis que viste en el chat. Se adopta.
  try {
    const probe = new AbortController();
    const pt = setTimeout(() => probe.abort(), 1200);
    const pr = await fetch("http://127.0.0.1:5000/health", { signal: probe.signal });
    clearTimeout(pt);
    if (pr.ok) {
      console.log("[CerebroNico] :5000 ya tiene un puente sano: adoptado (no se spawnea un duplicado).");
      return { kill: () => {}, adoptado: true, restart: async () => false }; // v1.97.0 · `restart: async () => true` era una mentira medible: el botón decía «Puente 5000 reiniciado y listo» sobre un proceso que la IDE no engendró y no puede matar. Ahora dice qué es y por qué no.
    }
  } catch { /* nadie al otro lado: se spawnea normal */ }

  spawnBridge();

  // Esperar a que el puente responda /health antes de declarar éxito.
  let ready = false;
  for (let i = 0; i < 16; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 800);
      const res = await fetch("http://127.0.0.1:5000/health", { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) { ready = true; break; }
    } catch {
      /* aún no listo */
    }
    await sleepMs(500);
  }
  if (ready) {
    console.log(`[CerebroNico] Puente 5000 iniciado con ${pythonBin} y listo en http://127.0.0.1:5000.`);
  } else {
    console.warn(`[CerebroNico] Puente 5000 iniciado con ${pythonBin} pero /health no responde aún. Log en ${bridgeLogPath}.`);
  }

  // Reinicia el contador de auto-restarts para que el restart manual siempre funcione
  const restart = async (): Promise<boolean> => {
    console.log("[CerebroNico] Restart manual del Puente 5000 solicitado..."); if (reinicioEnCurso) { console.log("[CerebroNico] Reconectar: ya habia un reinicio en curso — se comparte ese, no se levanta un segundo puente sobre el :5000."); return reinicioEnCurso; } let aflojarReinicio!: (v: boolean) => void; reinicioEnCurso = new Promise<boolean>((r) => { aflojarReinicio = r; });
    // Matar el proceso actual si existe
    try {
      if (child && !child.killed) {
        userCancelled = true;  // evitar auto-restart automático
        child.kill();
        // Dar tiempo a que el puerto se libere
        await sleepMs(800); for (let k = 0; k < 8 && child && !(child as any).exitCode && !(child as any).signalCode; k++) await sleepMs(250); // v1.0.2 · se ESPERA que el viejo muera (hasta 2 s mas)
        userCancelled = false; // v1.0.2 · antes se soltaba a los 800 ms SIN MIRAR: si el `exit` del SIGTERM llegaba despues, el manejador lo leia como caida y spawniaba un SEGUNDO puente sobre el :5000 -> EADDRINUSE, 5 reinicios zombis y el panel en OFF justo despues de decir «listo» (esta en el log de arranque de Mario)
      }
    } catch {}
    restartCount = 0;
    spawnBridge();
    // Esperar a que esté listo
    for (let i = 0; i < 16; i++) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 800);
        const res = await fetch("http://127.0.0.1:5000/health", { signal: controller.signal });
        clearTimeout(t);
        if (res.ok) {
          console.log("[CerebroNico] Puente 5000 reiniciado y listo.");
          reinicioEnCurso = null; aflojarReinicio(true); return true;
        }
      } catch {}
      await sleepMs(500);
    }
    console.warn("[CerebroNico] Puente 5000 no respondió tras restart manual.");
    reinicioEnCurso = null; aflojarReinicio(false); return false;
  };

  return {
    adoptado: false, // v1.97.0 · este sí lo engendró la IDE: se lo puede matar y resubir
    kill: () => {
      userCancelled = true;
      try {
        if (child) child.kill();
      } catch {}
      try {
        if (bridgeLogStream) bridgeLogStream.end();
      } catch {}
    },
    restart,
  };
}

/**
 * ============================================================
 * v2.1 — RAÍZ REAL DEL PROYECTO (la otra mitad del bug de package.json)
 * ------------------------------------------------------------
 * 🐞 /api/sandbox/status ya buscaba el package.json POR NIVELES, pero
 * /api/sandbox/start lo miraba SOLO en la raíz de .proyectos. Con un proyecto
 * importado que trae carpeta contenedora (lo normal: un ZIP extraído como
 * `Mi-Proyecto/…/package.json`), el estado decía "hay proyecto" y el arranque
 * decía "no hay proyecto": el sandbox quedaba en blanco sin explicación.
 *
 * Esta función es la única autoridad sobre dónde vive el proyecto, y la usan
 * tanto el estado como el arranque, para que no puedan contradecirse.
 * Devuelve la carpeta con package.json más cercana a la raíz (o la que tenga
 * index.html si no hay npm: eso es un proyecto estático válido).
 * ============================================================
 */
/** v1.0.20 · Las deps del registro de proyecto, en UNA constante: las usan la
 *  autoridad de raíz, las cuatro rutas HTTP y las dos herramientas del modelo.
 *  `raizDatos` es perezoso a propósito: PROJECT_ROOT puede moverse al arrancar. */
const DEPS_REGISTRO: DepsRegistro = { raizDatos: () => PROJECT_ROOT, instalacion: () => RAIZ_INSTALACION, log: (m: string) => console.log(m) };

/** v1.0.20 · ¿Hay un proyecto ABIERTO por el registro? (una lectura cacheada de 1 s) */
function otraObraAbierta(): string | null {
  try { return obraAbiertaEnRegistro(DEPS_REGISTRO); } catch { return null; }
}

function resolverRaizProyecto() { if (modoServidor()) return resolverRaizProyectoEn(PROJECT_ROOT);
  // v1.0.20 · RUTAS ATÓMICAS: si el registro dice que hay una obra abierta, ESA
  // es la raíz servida y escrita. Antes se adivinaba barriendo la raíz de datos
  // (hasta 5 niveles) y el :3500 podía mostrar una carpeta mientras el editor
  // escribía en otra: dos verdades para una sola pregunta.
  return resolverRaizProyectoEn(otraObraAbierta() || PROJECT_ROOT);
}

// ============================================================
// v1.6.24 — AYUDAS COMPARTIDAS DEL SANDBOX
// ------------------------------------------------------------
// Nacieron de un log que lo contaba todo: el editor tenía una copia de la
// PROPIA CerebróNico, el aplanado se puso a mover el suelo bajo los pies del
// proceso vivo, /api/exec corrió `npm install` en un directorio sin
// package.json (ENOENT), el resolutor no podía denunciar la raíz porque la
// propia app vivía ahí, y verify-preview —que solo conoce proyectos Vite—
// sentenció «página en blanco» sobre un puerto que respondía a un servidor
// huérfano de una sesión anterior («pid externo»). Cada ayuda cierra una
// de esas cuatro puertas; todas eran verificables en el disco, ninguna
// necesitó adivinar.
// ============================================================

/** Adaptador de disco para la auditoría de integridad (v1.6.24). */
const DISCO_AUDITORIA: DiscoDeAuditoria = {
  existe: (p: string) => fs.existsSync(p),
  leer: (p: string) => {
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {
      return null;
    }
  },
  unir: (...p: string[]) => path.join(...p),
};

/** ¿Dentro de este directorio vive (o es) la app que está ejecutándose AHORA? */
function esCarpetaDeLaAppViva(dir: string): boolean {
  try {
    const r = path.resolve(dir);
    const cwdApp = path.resolve(process.cwd());
    return r === cwdApp || cwdApp.startsWith(r + path.sep);
  } catch {
    return false;
  }
}

/** `name` del package.json del directorio, o null si no lo hay o no se lee. */
function nombreDelPackageEn(dir: string): string | null {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"))?.name || "") || null;
  } catch {
    return null;
  }
}

/**
 * ¿El node_modules de esa raíz está SANO? v1.6.24: `installed` en el estado
 * del sandbox era `existsSync(node_modules)` —con un árbol podado mentía—, y
 * sobre esa mentira el piloto se saltaba la instalación. Ahora pasa por la
 * auditoría de integridad. Si el package.json no se lee, no se bloquea nada:
 * se devuelve true (el preflight del arranque ya audita con más datos).
 */
function nodeModulesSanoEn(raiz: string): boolean {
  if (!fs.existsSync(path.join(raiz, "node_modules"))) return false;
  let deps: string[] = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf-8"));
    deps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  } catch {
    return true;
  }
  if (deps.length === 0) return true;
  return instalacionSana(auditarInstalacion(raiz, deps, DISCO_AUDITORIA));
}

/**
 * Busca el `package.json` más cercano DESDE una base hacia abajo (máx. 4
 * niveles, sin entrar en artefactos). Es la brújula de GUARDA-ENOENT en
 * /api/exec: si el cwd resuelto no tiene proyecto npm pero el proyecto está
 * un nivel más adentro —el caso del sync con carpeta contenedora—, el
 * comando se ejecuta donde vive el package.json, no donde npm va a gritar.
 */
function buscarPackageJsonBajo(base: string): string | null {
  const IGNORAR = new Set(["node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage", ".next", ".nuxt", ".vite", "__pycache__", "venv", ".venv"]);
  const cola: Array<{ dir: string; prof: number }> = [{ dir: base, prof: 0 }];
  while (cola.length > 0) {
    const cur = cola.shift()!;
    if (cur.prof > 4) continue;
    let entradas: string[] = [];
    try {
      entradas = fs.readdirSync(cur.dir);
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (!fs.existsSync(path.join(cur.dir, e))) continue;
      let esDir = false;
      try {
        esDir = fs.statSync(path.join(cur.dir, e)).isDirectory();
      } catch {}
      if (!esDir) {
        if (e === "package.json" && cur.prof > 0) return cur.dir;
        continue;
      }
      if (IGNORAR.has(e)) continue;
      cola.push({ dir: path.join(cur.dir, e), prof: cur.prof + 1 });
    }
  }
  return null;
}

/** Nombre del proyecto actual para la BÓVEDA: el primer tramo de la raíz
 *  resuelta bajo .proyectos; "sandbox" si la raíz es .proyectos mismo. */
function nombreProyectoSandbox(): string {
  try {
    const rel = path.relative(PROJECT_ROOT, resolverRaizProyecto().raiz);
    const seg = rel.split(path.sep)[0] || "";
    return seg && !seg.startsWith("..") ? seg : "sandbox";
  } catch {
    return "sandbox";
  }
}

async function runCommand(command: string, cwd: string, timeoutMs: number) {
  try {
    const installBin = path.join(RAIZ_INSTALACION, "node_modules", ".bin");
    const installNodeModules = path.join(RAIZ_INSTALACION, "node_modules");
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === "win32" ? (process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe") : "/bin/bash",
      env: {
        ...process.env,
        PATH: [installBin, process.env.PATH || ""].filter(Boolean).join(path.delimiter),
        NODE_PATH: [installNodeModules, process.env.NODE_PATH || ""].filter(Boolean).join(path.delimiter),
      },
    });
    return { stdout, stderr, exitCode: 0, timedOut: false };
  } catch (err: any) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      exitCode: typeof err.code === "number" ? err.code : 1,
      timedOut: Boolean(err.killed),
      error: err.message,
    };
  }
}

// Determina la ventana de contexto óptima de Ollama según el tamaño del modelo
function getOptimalNumCtx(modelName: string): number {
  const lower = modelName.toLowerCase();
  // Modelos en la nube o muy grandes: contexto extenso (no consume RAM local)
  if (lower.includes("cloud") || lower.includes("120b") || lower.includes("70b") || lower.includes("72b") || lower.includes("31b")) {
    return 65536;
  }
  if (lower.includes("13b") || lower.includes("14b") || lower.includes("32b") || lower.includes("34b")) {
    return 32768;
  }
  if (lower.includes("7b") || lower.includes("8b") || lower.includes("9b") || lower.includes("11b")) {
    return 16384;
  }
  // Modelos locales pequeños (hasta 4b): contexto amplio y seguro para 8 GB de RAM
  return 8192;
}

// ============================================================
// Puente PC (agent_bridge_5000.py, puerto 5000)
// ------------------------------------------------------------
// Cuando el usuario activa "Modo Agente PC", el chat puede
// delegar acciones REALES sobre la PC del usuario a través de
// este puente Python: ejecutar comandos y leer/crear/borrar
// archivos fuera del sandbox .proyectos.
// ============================================================
const BRIDGE_URL = `http://127.0.0.1:${WORKER_PORT}`;
// V8 · D3 — el puente exige token en todo POST. El IDE lo genera al arrancar y
// lo pasa al puente por ACCESS_TOKEN + lo envía en la cabecera de cada llamada.
const BRIDGE_TOKEN = nodeCrypto.randomBytes(18).toString("hex");

async function bridgeFetch(path: string, body?: any, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Cerebro-Token": BRIDGE_TOKEN },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, error: `Puente 5000 no disponible (${err?.message || "conexión fallida"})` };
  } finally {
    clearTimeout(t);
  }
}

// ============================================================
// AGENTE: llamada a herramientas (tool calling) para Ollama
// ============================================================

// Herramientas base: operan dentro del sandbox del proyecto (.proyectos).
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "Listar los archivos del proyecto en el sandbox",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Leer el contenido de un archivo del proyecto (ruta relativa)",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta relativa del archivo" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Escribir o crear un archivo en el proyecto (ruta relativa)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta relativa del archivo" },
          content: { type: "string", description: "contenido completo del archivo" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Ejecutar un comando de terminal en el sandbox (npm, node, python, git, ls...)",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando a ejecutar" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exportar_apk",
      description: "Exportar el proyecto del sandbox a Android con la FÁBRICA real (no recetas de Capacitor por chat): 'generar' escribe el proyecto android/ completo (exige la web COMPILADA con index.html y valida el appId), 'compilar' lanza Gradle —es un trabajo largo y hay UN solo trabajo vivo, preguntá después con 'estado' antes de afirmar nada sobre el APK—, 'estado' informa progreso y dónde quedó el APK. Si a la máquina le falta JDK17/SDK, generar igual funciona y la respuesta dice qué falta para compilar.",
      parameters: {
        type: "object",
        properties: {
          accion: { type: "string", enum: ["generar", "compilar", "estado"], description: "qué paso de la fábrica ejecutar" },
          appId: { type: "string", description: "opcional (generar): com.tunombre.app — dominio al revés, minúsculas; si no, se deriva del nombre del proyecto" },
          nombreApp: { type: "string", description: "opcional (generar): nombre visible de la app" },
          forzar: { type: "boolean", description: "opcional (generar): reescribir archivos de android/ que ya existían y no se pisan por defecto" },
        },
        required: ["accion"],
      },
    },
  },
  SPEC_CRIAR_PDF as any, SPEC_CRIAR_DOCX as any, SPEC_CRIAR_ZIP as any, SPEC_PUENTE_ESTADO as any, SPEC_REINICIAR_PUENTE as any, // v1.96.0 · Word y ZIP en una llamada (mismo trinquete: la especificación vive en su módulo)
  {
    type: "function",
    function: {
      name: "set_plan",
      description: "Definir el plan de trabajo como una lista de tareas accionables (úsala ANTES de empezar)",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "identificador corto, ej t1" },
                description: { type: "string", description: "descripción de la tarea" },
              },
              required: ["id", "description"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Actualizar el estado de una tarea del plan",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "identificador de la tarea" },
          status: { type: "string", enum: ["pending", "in_progress", "completed"] },
        },
        required: ["task_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description: "Ejecutar las pruebas del proyecto (npm test) y devolver el resultado",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "comando de test opcional, por defecto npm test" } },
        required: [],
      },
    },
  },
];

// Herramientas de ACCESO PC REAL (solo se inyectan cuando el usuario
// activa "Modo Agente PC"). Se ejecutan a través del puente Python :5000.
const PC_TOOLS = [
  {
    type: "function",
    function: {
      name: "pc_info",
      description:
        "Obtener información de la PC del usuario: sistema operativo, usuario, ruta del Escritorio (Desktop), carpeta home, arquitectura y Python. Úsala ANTES de actuar sobre archivos de la PC para conocer las rutas reales.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_exec",
      description:
        "Ejecutar un comando de terminal REAL en la PC del usuario (CMD en Windows, bash en Linux/Mac). Para crear un archivo usa pc_write_file (más fiable que echo). Para listar usa pc_list_dir.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "comando a ejecutar, ej: 'dir' o 'echo hola > C:\\\\Users\\\\USER\\\\Desktop\\\\x.txt'" },
          timeout: { type: "number", description: "segundos máximos (por defecto 120)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_write_file",
      description:
        "Crear o sobrescribir un archivo REAL en la PC del usuario. Acepta rutas absolutas (C:\\Users\\... o /home/...) o atajos: 'Desktop/nombre.txt', 'Documents/...', 'Downloads/...', '~'.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "ruta del archivo (absoluta o atajo Desktop/...)" },
          content: { type: "string", description: "contenido completo del archivo" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_read_file",
      description: "Leer el contenido de un archivo REAL de la PC del usuario (ruta absoluta o atajo).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_list_dir",
      description: "Listar los archivos de una carpeta REAL de la PC del usuario (ej: 'Desktop', 'Documents', 'C:\\Users\\...').",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "carpeta a listar (absoluta o atajo)" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pc_delete",
      description: "Eliminar un archivo o carpeta REAL de la PC del usuario. ACCIÓN DESTRUCTIVA: úsala solo si el usuario lo pidió explícitamente.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "ruta del archivo/carpeta a borrar" } },
        required: ["path"],
      },
    },
  },
];

// ============================================================
// ACCIONES RÁPIDAS DETERMINISTAS · Modo Agente PC
// ------------------------------------------------------------
// Cuando el usuario pide algo directo (crear/borrar/leer/listar
// un archivo, o ejecutar un comando), lo ejecutamos INMEDIATAMENTE
// contra el puente :5000 SIN gastar una sola llamada al LLM.
// Así el IDE "hace" aunque el modelo sea pequeño o Ollama caiga.
//
// v1.16.6 — El PARSER (extractFilename/extractCommand/parseQuickAction) se
// fue a server/quickParser.ts, que es donde ahora vive la guarda del bug
// «DEL»: una orden del Editor web nunca puede ser acción rápida. Abajo
// queda solo el EJECUTOR, que sí necesita al puente y al stream.
// ============================================================

// Interfaz mínima que necesita handlePcQuickAction (la satisface StreamContext).
interface StreamLike {
  sendTaskEvent: (task: any) => void;
  sendChunk: (text: string) => void;
  sendDone: (modelUsed: string, metricas?: MetricasInferencia | null) => void;
}

// Ejecuta la acción rápida y la emite como respuesta de stream.
// Devuelve true si se manejó (corta el flujo, no toca el LLM).
async function handlePcQuickAction(prompt: string, ctx: StreamLike): Promise<boolean> {
  const action = parseQuickAction(prompt);
  if (!action) return false;

  const emit = (label: string, detail: string, ok: boolean) =>
    ctx.sendTaskEvent({ type: "action", action: { tool: label, detail, ok } });

  // pc_info una vez para enriquecer el detalle (no es obligatorio)
  const info = await bridgeFetch("/api/pc/info", undefined, 4000);
  const desktop = info?.desktop ? ` (Escritorio real: ${info.desktop})` : "";

  try {
    if (action.intent === "write") {
      const res = await bridgeFetch("/api/fs/write", { path: action.path, content: action.content ?? "" });
      emit("pc_write_file", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `✅ **Archivo creado en tu PC** (agente 5000):\n\`${res.path}\` — ${res.bytes} bytes${desktop}\n\n` +
          (action.content ? `\`\`\`\n${action.content}\n\`\`\`` : "")
        : `❌ No pude crear el archivo: ${res?.error || "error desconocido"}`;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "read") {
      const res = await bridgeFetch("/api/fs/read", { path: action.path });
      emit("pc_read_file", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `📄 **Contenido de** \`${res.path}\` (tu PC):\n\`\`\`\n${res.content}\n\`\`\``
        : `❌ No pude leer el archivo: ${res?.error || "error"}`;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "list") {
      const res = await bridgeFetch("/api/fs/list", { path: action.path });
      emit("pc_list_dir", `${action.path}`, Boolean(res?.ok));
      let msg: string;
      if (res?.ok && Array.isArray(res.entries)) {
        const lines = res.entries.map((e: any) => (e.isDir ? `📁 ${e.name}/` : `   ${e.name}  (${e.size} b)`)).join("\n");
        msg = `📁 **Contenido de** \`${res.path}\` (tu PC):\n\`\`\`\n${lines || "(vacío)"}\n\`\`\``;
      } else {
        msg = `❌ No pude listar: ${res?.error || "error"}`;
      }
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "delete") {
      const res = await bridgeFetch("/api/fs/delete", { path: action.path });
      emit("pc_delete", `${action.path}`, Boolean(res?.ok));
      const msg = res?.ok
        ? `🗑️ **Eliminado de tu PC:** \`${res.path}\``
        : `❌ No pude borrar: ${res?.error || "error"}`;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
    if (action.intent === "exec" && action.command) {
      const res = await bridgeFetch("/api/exec", { command: action.command, timeout: 60 }, 70000);
      emit("pc_exec", action.command, Boolean(res?.success));
      const out = res?.output || res?.content || "";
      const msg = res?.success
        ? `🖥️ **Comando ejecutado en tu PC:** \`${action.command}\`\n\`\`\`\n${out || "(sin salida)"}\n\`\`\``
        : `⚠️ Comando ejecutado con error:\n\`\`\`\n${res?.error || out || "sin salida"}\n\`\`\``;
      ctx.sendChunk(msg);
      ctx.sendDone("pc-quick-action");
      return true;
    }
  } catch (err: any) {
    emit(action.intent, prompt.slice(0, 60), false);
    ctx.sendChunk(`❌ Acción rápida falló: ${err?.message || err}`);
    ctx.sendDone("pc-quick-action");
    return true;
  }
  return false;
}

/**
 * v2.0 — ¿Puede este modelo usar herramientas?
 *
 * ANTES (v1.1): solo se miraba el NOMBRE. Cualquier "qwen2.5", "llama-3" o
 * "mistral" entraba al bucle de agente, incluidos `qwen2.5:0.5b` (≈400 MB) y
 * `llama3.2:1b`. Esos modelos NO saben emitir tool-calls válidos: el servidor
 * los llamaba en modo NO-streaming con timeout de 120 s por intento y hasta 10
 * intentos, así que la interfaz se quedaba sin un solo token durante minutos
 * ("no contesta o se tranca").
 *
 * AHORA: se usa el perfil del modelo (shared/modelTiers.ts) → hace falta estar
 * en la lista blanca Y tener tamaño suficiente (≥4B o ser modelo de nube).
 */
function isToolCapableModel(modelName: string): boolean {
  return getModelProfile(modelName).toolCapable;
}

/** Perfil cacheado del modelo activo (evita recalcular en cada llamada). */
const profileCache = new Map<string, ModelProfile>();
function getProfile(modelName: string): ModelProfile {
  const cached = profileCache.get(modelName);
  if (cached) return cached;
  // v1.16.3.1 · BAJO CONSUMO: se pasa RAM_GB para que la escalera MR
  // (3m/5m/0) decida con el equipo delante, no con suposiciones.
  const p = getModelProfile(modelName, RAM_GB);
  profileCache.set(modelName, p);
  return p;
}

const CPU_CORES = os.cpus()?.length || 4;
const RAM_GB = Math.round((os.totalmem() || 8 * 1024 ** 3) / 1024 ** 3);
// v1.0.16 · TOPE_CTX_RAM: techo num_ctx que la RAM paga de KV (techoDeContexto; en 16 GB >32k), tope de ventanaParaCaber. ENFRIADOS_NUBE: estado de failover (proveedor->timestamp enfriado) a nivel módulo, sobrevive entre turnos. PROVEEDORES_RESPALDO_NUBE se importa de server/respaldoNube.
const TOPE_CTX_RAM = techoDeContexto({ numCtxPedido: 1_048_576, ramGb: RAM_GB }).numCtx;
const ENFRIADOS_NUBE: Partial<Record<ProveedorNube, number>> = {};

// v2.0 — Packs de herramientas integrados (núcleo, Modo PC, git, web).
// Añadir un pack futuro = registerToolPack({...}) y listo: ni el bucle del
// agente ni el prompt hay que tocarlos.
registerBuiltinPacks();
// TERMINAL PERSISTENTE — se registra junto a los packs del núcleo. Idempotente
// (mismo id reemplaza sin ruido). Expone las 5 herramientas del pack (v1.71.0:
// leer/listar estaban implementadas pero SIN spec — eran inalcanzables).
registrarPackTerminal();
// v1.71.0 · DOCUMENTOS: generar_pdf / generar_docx / generar_xlsx.
registrarPackDocumentos();
// v1.0.20 · RUTAS: `contexto_rutas` y `abrir_proyecto` — dos llamadas baratas
// (pocos tokens de entrada/salida) para que el modelo NO tenga que combinar
// cuatro consultas ni adivinar dónde escribe. Sobreviven al recorte de modelos chicos.
registrarPackRutas();

/**
 * v2.0 — Packs de herramientas EXTERNOS.
 * v1.16.1 — El «futuro» llegó: además del manifiesto (GET <url>/tools), el
 * ejecutor ahora SABE llamar (`POST <url>/tools/call` con {name, arguments}).
 * El puente Python :5000 expone por ahí sus servidores MCP (mcp_servers.json:
 * web_fetch_url, web_extraer_enlaces…), y cualquier microservicio que hable
 * este contrato se enchufa sin tocar código.
 * Detalles honestos:
 *   · Packs en loopback reciben el token del puente (X-Cerebro-Token) para
 *     poder llamar a POST /tools/call, que exige autenticación como todo POST.
 *   · Si un pack falla al arrancar (el puente aún no está arriba), se reintenta
 *     solo hasta 12 veces cada 5 s; además: POST /api/tools/packs/recargar.
 */
const remotePackEndpoints = new Map<string, { url: string; headers: Record<string, string> }>();
let packsIntentos = 0;
const PACKS_INTENTOS_MAX = 12;
// ============================================================
// v1.16.6 · AISLAMIENTO :5000 DEL HIJO DEL SANDBOX — «la interferencia
// otra vez con la comunicación del modelo».
// startAgentBridge ya NO arranca el puente en el hijo (guarda CN_SANDBOX_CHILD
// de la v2.1), pero ESTE cargador corría igual en el hijo: GET a
// http://127.0.0.1:5000/tools del pack «puente-mcp» y, si el puente aún no
// estaba arriba, ESCALERA DE 12 REINTENTOS CADA 5 s. El hijo del sandbox
// martilleando el :5000 del ANFITRIÓN es exactamente la clase de ruido que
// enlentece las llamadas pc_* (el puente atiende de a una). Regla: un proceso
// marcado como hijo del sandbox NO toca packs que apunten al puerto del
// puente; los demás packs externos (microservicios propios) siguen intactos.
// ============================================================
const ES_HIJO_SANDBOX = process.env.CN_SANDBOX_CHILD === "1" || process.env.CN_DISABLE_BRIDGE === "1";
const apuntaAlPuente = (url: unknown) =>
  new RegExp(`\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\]|0\\.0\\.0\\.0):${WORKER_PORT}(\\/|$)`).test(String(url));
async function loadExternalToolPacks(recargar = false): Promise<{ cargados: Record<string, number>; fallidos: string[] }> {
  const cargados: Record<string, number> = {};
  const fallidos: string[] = [];
  const fallidosUrls: string[] = [];
  try {
    const cfgPath =
      [path.join(process.cwd(), "tools.config.json"), path.join(RAIZ_INSTALACION, "tools.config.json")].find((p) =>
        fs.existsSync(p)
      ) || path.join(process.cwd(), "tools.config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      const packs: any[] = Array.isArray(cfg?.packs) ? cfg.packs : [];
      for (const p of packs) {
        if (!p?.id || !p?.url || p.enabled === false) continue;
        // v1.16.6 · AISLAMIENTO :5000 — el hijo del sandbox pasa de los packs
        // que apuntan al puente del anfitrión (puente-mcp). Sin esto, el hijo
        // sondeaba /tools y /health del :5000 ajeno con escalera de 12
        // reintentos: la interferencia con la comunicación del modelo.
        if (ES_HIJO_SANDBOX && apuntaAlPuente(p.url)) {
          if (recargar !== false || packsIntentos === 0) {
            console.log(`[tools] Pack "${p.id}" OMITIDO: este proceso corre DENTRO del sandbox y el :${WORKER_PORT} pertenece a la IDE anfitriona.`);
          }
          continue;
        }
        if (recargar) unregisterToolPack(p.id); // recarga idempotente: sin herramientas huérfanas del manifiesto viejo
        // v1.43.0 lote 2 — PERMISOS MCP: las cabeceras se calculan ANTES de
        // listar, porque el GET /tools del puente :5000 exige el token igual
        // que /tools/call. Un pack en loopback sin token no pasaba ni del
        // listado, así que las herramientas del agente 5000 nunca cargaban.
        const headers: Record<string, string> = {};
        if (p.headers && typeof p.headers === "object") Object.assign(headers, p.headers);
        const esLoopback = /\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(String(p.url));
        if (esLoopback && !headers["X-Cerebro-Token"]) headers["X-Cerebro-Token"] = BRIDGE_TOKEN;
        let pack: Awaited<ReturnType<typeof registerExternalPack>> = null;
        try {
          // v1.46.2 — `silenciarFallo`: el mensaje lo da este cargador, que es el
          // único que sabe si queda reintento. Antes el registro gritaba «No se
          // pudo cargar el pack remoto» y el reintento lo resolvía 2 s después.
          pack = await registerExternalPack(p.id, p.label || p.id, p.url, fetch, headers, { silenciarFallo: true });
        } catch {
          pack = null;
        }
        if (pack) {
          remotePackEndpoints.set(p.id, { url: String(p.url).replace(/\/+$/, ""), headers });
          cargados[p.id] = pack.tools.length;
          // El recuento NO basta: el inventario es lo que se mira para saber si
          // falta algo. Una línea por pack, con sus nombres.
          const inventario = inventarioDelPack(pack);
          console.log(
            `[tools] Pack externo "${p.id}" cargado con ${pack.tools.length} herramienta(s)` +
            (inventario ? `: ${inventario}` : ".")
          );
        } else {
          fallidos.push(String(p.id));
          fallidosUrls.push(String(p.url));
          // v1.46.2 — HONESTO Y NO ALARMANTE. Esto NO es un fallo definitivo: es
          // lo normal cuando el servicio aún está arrancando (el puente :5000
          // tarda, y el propio server lo levanta). Se dice qué pasa y qué va a
          // pasar después, en vez de un «No se pudo» que asusta sin motivo.
          const quedan = PACKS_INTENTOS_MAX - packsIntentos;
          if (quedan > 0) {
            console.log(
              `[tools] Pack "${p.id}" aún no responde en ${p.url} — normal si el servicio está arrancando. ` +
              `Reintento ${packsIntentos + 1}/${PACKS_INTENTOS_MAX} en 5 s (quedan ${quedan}).`
            );
          } else {
            console.warn(
              `[tools] Pack "${p.id}": ${PACKS_INTENTOS_MAX} reintentos agotados sin respuesta en ${p.url}. ` +
              `Sus herramientas NO están disponibles en esta sesión. Recarga manual: POST /api/tools/packs/recargar`
            );
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("[tools] No se pudieron cargar los packs externos:", err?.message || err);
  }
  const sinPythonLocal = !resolverInterpretePython();
  const soloPacksPythonLocales = fallidosUrls.length > 0 && fallidosUrls.every((u) => /\/\/(127\.0\.0\.1|localhost|\[::1\]):(5000|5100|5102)(\/|$)/.test(u));
  if (fallidos.length && !recargar && sinPythonLocal && soloPacksPythonLocales) {
    console.log(`[tools] Python no está disponible en este entorno; se omiten reintentos automáticos para packs locales Python (${fallidos.join(", ")}).`);
  } else if (fallidos.length && !recargar && packsIntentos < PACKS_INTENTOS_MAX) {
    packsIntentos += 1;
    setTimeout(() => {
      loadExternalToolPacks(false).catch(() => {});
    }, 5000);
  }
  else if (fallidos.length && !recargar && packsIntentos >= PACKS_INTENTOS_MAX) {
    console.warn(
      `[tools] Se agotaron los ${PACKS_INTENTOS_MAX} reintentos de los packs: ${fallidos.join(", ")}. ` +
      `La IDE funciona, pero sin las herramientas de esos servicios.`
    );
  }
  return { cargados, fallidos };
}
loadExternalToolPacks().catch(() => {});

/**
 * v1.0.28 — SERVIDORES MCP (mcp_servers.json) ⇄ HERRAMIENTAS DEL MODELO.
 * Se llama UNA vez al arrancar, después de los packs HTTP. A diferencia de
 * `loadExternalToolPacks`, aquí NO hay reintentos: un servidor stdio no "termina
 * de arrancar solo"; si falló, se dice con su motivo y se sigue. `enabled:false`
 * (las entradas de Cloudflare) no se toca ni se arranca.
 */
let packsMcpEstado: ResultadoPacksMcp | null = null;
async function cargarMcpDelArchivo(recargar = false): Promise<ResultadoPacksMcp> {
  if (ES_HIJO_SANDBOX) {
    // El hijo del sandbox es un motor, no una IDE: arrancar servidores MCP ahí
    // duplicaría procesos (y en Windows eso son ventanas y RAM de verdad).
    return { cargados: {}, fallidos: [], apagados: [], descartados: [] };
  }
  packsMcpEstado = await cargarPacksMcp(process.cwd(), { recargar });
  return packsMcpEstado;
}
cargarMcpDelArchivo().catch((e: any) => console.warn("[mcp] No se pudieron cargar los servidores MCP:", e?.message || e));
process.once("exit", () => { try { cerrarTodosMcp(); } catch {} });

/**
 * v2.0 — Herramientas que se envían al modelo en este turno.
 * Filtra por contexto (Modo PC, git, red) y por tamaño del modelo: a un modelo
 * pequeño solo le llegan las herramientas baratas e imprescindibles (menos
 * prompt = menos latencia y menos confusión).
 */
function getToolsForModel(modelName: string, pcMode: boolean): any[] {
  const profile = getProfile(modelName);
  if (!profile.toolCapable) {
    // v1.68.0 · DEFECTO 5 — «no lo reconozco» ya no es «no puede».
    // Un endpoint custom (`model` vacío → "default"), un alias nuevo o un nombre
    // no canónico devolvían `[]`: cero manos, cero manual, y el modelo redactando
    // herramientas inventadas. Ahí la regex no sabe nada, así que la respuesta
    // honesta no es "nada": es el JUEGO MÍNIMO (hueso de obra + lo externo que
    // esté cargado) y un aviso en el log para que se pueda auditar.
    if (!capacidadSinVerificar(modelName)) return [];
    try {
      const specsMin = getActiveToolSpecs({
        pcMode,
        vision: isVisionModelName(modelName),
        network: process.env.OFFLINE_MODE !== "1",
        git: true,
        sandbox: true,
      }).filter((s) => (s.pack.startsWith("ext:") ? openExtensionPanels.has(s.pack.slice(4)) : true));
      const minimo = specsMin.filter((s) => HUESO_DE_OBRA.has(s.name) || esPackExterno(s.pack));
      if (minimo.length === 0) return [];
      // v1.98.0 · una vez por (modelo, mínimo) y contadas: server/routers/ecoTurno.ts
      avisarCapacidadSinVerificar(modelName, minimo.length);
      return toOllamaTools(minimo);
    } catch (err: any) {
      console.warn(`[CerebroNico] Aviso: juego mínimo no disponible (${err?.message || err})`);
      return [];
    }
  }
  const specs = getActiveToolSpecs({
    pcMode,
    vision: isVisionModelName(modelName),
    network: process.env.OFFLINE_MODE !== "1",
    git: true,
    sandbox: true,
  }).filter((s) => {
    // Las herramientas de una extensión solo se ofrecen si su pestaña está
    // abierta: si no, nadie puede ejecutarla y el modelo esperaría en vano.
    if (!s.pack.startsWith("ext:")) return true;
    return openExtensionPanels.has(s.pack.slice(4));
  });
  const selected = selectToolsForModel(specs, profile);
  // v1.23.0 · EL RECORTE NUNCA ES SILENCIOSO (log + panel MOTOR VIVO). Medido
  // en v1.22.2: un deepseek-r1:7b tool-capable recibía 8 herramientas de 20 y
  // nadie lo decía nunca — de ahí «no sabe que ya tiene mcp». Ahora el recorte
  // se nombra, se cuenta, y el HUESO DE OBRA garantiza que las manos (escribir,
  // ejecutar, probar, deshacer) jamás quedan fuera.
  const fuera = explicarRecorte(selected, specs);
  if (fuera.length > 0) {
    console.warn(
      `[CerebroNico] 🧰 RECORTE de herramientas para "${modelName}": ${selected.length}/${specs.length} — ` +
      `quedan fuera: ${fuera.join(", ")}. El hueso de obra (write_file, run_command, run_tests, revisar/deshacer) no se recorta nunca.`
    );
  }
  return toOllamaTools(selected);
}

function isVisionModelName(modelName: string): boolean {
  return /vision|smolvlm|glm-ocr|glm-4v|glm4v|glm-5|llava|llava-phi3|bakllava|moondream|minicpm|qwen2\.5vl|qwen2-vl|qwen3-vl|qwen-vl|cogvlm|internvl|pixtral|deepseek-vl|gpt-oss|gemma3|gemma4|kimi/i.test(
    modelName.toLowerCase()
  );
}

// ============================================================
// v2.0 — EL MOTOR: base de datos de conocimiento persistente
// ------------------------------------------------------------
// El conocimiento vive en el MOTOR (.cerebro-db/kb.json), no en el modelo. Así
// un modelo de 250 MB responde con datos precisos (errores conocidos, patrones,
// reglas de sintaxis, mapa del proyecto) porque el motor se los sirve por
// contexto. Cambiar de modelo no cambia el resultado.
// ============================================================
// USERDATA v1 (recap): la base de conocimiento del motor es ESCRITURA
// permanente (kb.json, planes, entidades, espejos, salud, bóveda). Con el
// instalador por-máquina, cwd (Program Files) no es escribible: el motor
// aprendía y perdía el aprendizaje al cerrar. Se mueve a PROJECT_ROOT, que
// Electron dirige a userData.
const ENGINE_DB_DIR = path.join(PROJECT_ROOT, ".cerebro-db");
const ENGINE_DB_FILE = path.join(ENGINE_DB_DIR, "kb.json");
let engineKb = new KnowledgeBase();
let kbDirty = false;

// ============================================================
// v2.0 — CEREBRO (ley) + MEMORIA (estado vivo)
// ------------------------------------------------------------
// Se cargan una sola vez al arrancar. Toda escritura de la memoria es atómica
// (tmp + rename) y deja copia en memoria_history/, lo que permite rollback si una
// directriz corrompe el flujo de trabajo.
// ============================================================
const brain = new Brain(process.cwd());
// Vectorización local: el constructor solo guarda rutas; el índice se lee
// únicamente si la función está activada.
const localRag = new LocalRAG(process.cwd());
localRag.loadConfig();
// v1.98.0 · UN solo resolutor para todo el server: dos instancias se pisarían `vectores.json`.
// v1.99.5 · el cerebro tiene DOS raíces porque tiene dos hemisferios: la de datos y la de la
// instalación. Montarlo con una sola hacía que el reflejo buscara `server.ts` dentro de
// C:\Cerebronico y reportara `nada` una pieza que está instalada.
const cerebroEmbedder = montarResolutorEmbedder({ ollamaUrl: OLLAMA_DEFAULT.replace(/\/$/, ""), raizDatos: PROJECT_ROOT, raizApp: process.cwd() });
// Capacidades avanzadas: solo persisten sus interruptores; el trabajo ocurre
// únicamente cuando están activadas.
const features = new AdvancedFeatures(process.cwd());
// Gobernador: se apoya en el catálogo de capacidades para hablar el mismo idioma.
const governor = new HardwareGovernor(features);
// Verificador en la nube: su configuración vive en .cerebro-db/verifier.json.
// La clave NO se guarda nunca: se lee del entorno (ZAI_API_KEY, GEMINI_API_KEY…).
const verifier = new CloudVerifier(process.cwd());
verifier.loadConfig();
try {
  brain.load();
  const st0 = brain.stats();
  console.log(
    `[CerebroNico] CEREBRO cargado: cerebro.md ${st0.cerebroChars} chars · memoria.md ${st0.memoriaLines} líneas · historial ${st0.historyCount} · propuestas ${st0.proposals}`
  );
} catch (err: any) {
  console.log(`[CerebroNico] No se pudo cargar el cerebro: ${err?.message || err}`);
}

function loadEngineKb(): void {
  try {
    if (fs.existsSync(ENGINE_DB_FILE)) {
      engineKb = KnowledgeBase.fromJSON(fs.readFileSync(ENGINE_DB_FILE, "utf-8"));
      console.log(`[engine] Base de conocimiento cargada: ${engineKb.size()} entradas.`);
    } else {
      console.log(`[engine] Base de conocimiento inicial creada con ${engineKb.size()} entradas de fábrica.`);
      kbDirty = true;
      saveEngineKb(true);
    }
  } catch (err: any) {
    // ============================================================
    // v0.9.1 — LA BASE CORRUPTA NO SE TIRA: SE APARTA Y SE AVISA
    // ------------------------------------------------------------
    // Antes: si el archivo no se podía leer, se creaba una base nueva CON LA
    // SEMILLA y se seguía como si nada. Dos daños, y el segundo es el grave:
    //
    //  1. El archivo ilegible se quedaba ahí, y el guardado periódico lo
    //     SOBRESCRIBÍA 30 segundos después. Lo aprendido se perdía para siempre
    //     y sin un solo aviso.
    //  2. El registro decía «se usa la semilla», en tono neutro. Alguien que
    //     leyera eso no podía saber que acababa de perder conocimiento.
    //
    // Ahora se aparta el archivo con extensión `.corrupto-<fecha>` antes de
    // nada: el motor arranca igual (una base de fábrica es mejor que no
    // arrancar), pero el archivo queda para poder recuperar entradas a mano.
    // Y se dice CUÁNTAS entradas tenía.
    // ============================================================
    let apartado = "(no se pudo apartar)";
    let bytes = 0;
    try {
      const st = fs.statSync(ENGINE_DB_FILE);
      bytes = st.size;
      const marca = new Date().toISOString().replace(/[:.]/g, "-");
      apartado = `${ENGINE_DB_FILE}.corrupto-${marca}`;
      fs.renameSync(ENGINE_DB_FILE, apartado);
    } catch {}
    console.error(
      `[engine] ⚠️ LA BASE DE CONOCIMIENTO NO SE PUDO LEER (${bytes} bytes): ${err?.message || err}\n` +
        `[engine] El archivo se ha apartado en: ${apartado}\n` +
        `[engine] Se arranca con la base de fábrica. Para recuperar entradas, abre ese archivo: es JSON.`
    );
    engineKb = new KnowledgeBase();
    kbDirty = true;
    saveEngineKb(true);
  }
}

/**
 * v0.9.1 — GUARDADO ATÓMICO DE LA BASE DE CONOCIMIENTO.
 *
 * Antes: `fs.writeFileSync(ENGINE_DB_FILE, engineKb.toJSON())`, escribiendo
 * DIRECTAMENTE encima del archivo bueno. Con la base creciendo (ya son cientos
 * de entradas y decenas de KB), un corte a mitad de escritura —cuelgue, apagón,
 * disco lleno— deja el archivo TRUNCADO. Y no avisa: el archivo existe, pesa
 * algo y se abre. Solo al leerlo se descubre que la última mitad no está.
 *
 * Es el peor fallo posible para algo cuyo trabajo es CRECER: el usuario pide
 * más conocimiento y un corte le devuelve menos del que tenía.
 *
 * El patrón correcto: escribir en un temporal y RENOMBRAR. El renombrado dentro
 * del mismo sistema de archivos es atómico — o está el viejo entero, o el nuevo
 * entero, nunca la mezcla.
 */
function saveEngineKb(force = false): void {
  if (!kbDirty && !force) return;
  const temporal = ENGINE_DB_FILE + ".tmp";
  try {
    fs.mkdirSync(ENGINE_DB_DIR, { recursive: true });
    const json = engineKb.toJSON();
    fs.writeFileSync(temporal, json, "utf-8");
    fs.renameSync(temporal, ENGINE_DB_FILE);
    kbDirty = false;
  } catch (err: any) {
    console.warn("[engine] No se pudo guardar la base de conocimiento:", err?.message || err);
    // El temporal se limpia, pero NUNCA el archivo bueno: si el rename falló, el
    // que había sigue siendo válido y es el único que hay que conservar.
    try { fs.unlinkSync(temporal); } catch {}
  }
}

/** Guarda y dice cuántas entradas quedaron, para dejar rastro en el arranque. */
function guardarYContar(): void {
  const n = engineKb.size();
  saveEngineKb(true);
  console.log(`[engine] Base de conocimiento guardada con ${n} entradas.`);
}

loadEngineKb();
// Guardado periódico (no se escribe en disco en cada turno) + al cerrar.
setInterval(() => saveEngineKb(), 30_000);
process.on("SIGINT", () => { guardarYContar(); process.exit(0); });
process.on("SIGTERM", () => { guardarYContar(); process.exit(0); });

// ============================================================
// v0.9.1 — GUARDAS GLOBALES DE ESTABILIDAD
// ------------------------------------------------------------
// Antes solo había SIGINT y SIGTERM. Faltaban las dos que de verdad matan el
// proceso en marcha, y su ausencia explica el peor escenario posible en un IDE:
// perder la sesión entera —memoria sin guardar y archivos abiertos— por un fallo
// en una ruta que quizá ni se estaba usando.
//
// · `unhandledRejection` — REGISTRAR Y SEGUIR. En Node, una promesa rechazada
//   sin nadie que la recoja termina el proceso por defecto. Es la guarda que más
//   vidas salva, porque el fallo suele estar en un camino secundario.
// · `uncaughtException` — REGISTRAR, GUARDAR e IRSE LIMPIO. Tras una excepción
//   no atrapada el proceso queda en un estado en el que no se puede confiar;
//   seguir funcionando ahí es peor que reiniciar, porque puede corromper datos.
//   Por eso aquí sí se sale, pero guardando antes la base de conocimiento.
//
// Las dos son RUIDOSAS a propósito. Un `catch {}` que se lo traga todo no es
// robustez, es ceguera: el fallo desaparece de la vista y vuelve cada día.
// ============================================================
process.on("unhandledRejection", (motivo: any) => {
  console.error("[estabilidad] Promesa rechazada sin recoger — el motor SIGUE:", motivo?.stack || motivo);
});
process.on("uncaughtException", (err: Error) => {
  console.error("[estabilidad] Excepción no atrapada — se guarda el estado y se sale:", err?.stack || err);
  try { saveEngineKb(true); } catch {}
  process.exit(1);
});

/** Registra/actualiza el mapa del proyecto en la base de conocimiento. */
function refreshEngineProjectMap(files: Array<{ path: string; language?: string }>): void {
  engineKb.setProjectFiles(files || []);
  kbDirty = true;
}

// ============================================================
// FASE 2 — ÍNDICE DE SÍMBOLOS DEL PROYECTO
// El motor lee los archivos del sandbox y extrae las firmas REALES de funciones,
// clases, interfaces y componentes. Eso evita que un modelo pequeño invente
// nombres y firmas, y ahorra el ciclo de "leer el archivo entero" en cada turno.
// ============================================================
let symbolMap: SymbolMap = { files: [], total: 0, updatedAt: 0 };

const INDEXABLE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);
const INDEX_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "dist_electron", ".vite", "venv", "__pycache__", ".cerebro-db"]);

/** Reescribe el índice leyendo los archivos desde el disco del sandbox. */
function reindexProjectSymbols(): { files: number; symbols: number } {
  const collected: Array<{ path: string; content: string }> = [];
  const walk = (dir: string, base: string, depth: number) => {
    if (collected.length >= 200 || depth > 6) return;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (collected.length >= 200) return;
      if (INDEX_SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      const rel = base ? `${base}/${entry}` : entry;
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, rel, depth + 1);
        continue;
      }
      const ext = path.extname(entry).toLowerCase();
      if (!INDEXABLE_EXT.has(ext)) continue;
      if (st.size > 300 * 1024) continue; // archivos gigantes: no aportan al índice
      try {
        collected.push({ path: rel, content: fs.readFileSync(full, "utf-8") });
      } catch {
        /* ilegible: se salta */
      }
    }
  };
  try {
    if (fs.existsSync(PROJECT_ROOT)) walk(PROJECT_ROOT, "", 0);
  } catch (err: any) {
    console.warn("[engine] No se pudo indexar símbolos:", err?.message || err);
  }

  symbolMap = buildSymbolMap(collected);
  // El resumen de la API del proyecto pasa a la base de conocimiento: se
  // recupera cuando el usuario pregunta por símbolos o nombres concretos.
  for (const file of symbolMap.files) {
    if (file.symbols.length === 0) continue;
    engineKb.upsert({
      id: `symbols:${file.path}`,
      table: "project",
      title: `Símbolos de ${file.path}`,
      body: file.symbols.map((s) => `${s.name} — ${s.signature}`).join("\n").slice(0, 1200),
      keys: [file.path.toLowerCase(), ...file.symbols.slice(0, 20).map((s) => s.name.toLowerCase())],
      lang: file.language,
      weight: 0.75,
    });
  }
  kbDirty = true;
  saveEngineKb();
  return { files: symbolMap.files.length, symbols: symbolMap.total };
}

/**
 * El motor aprende de sus fallos: cada error real de una herramienta queda como
 * entrada de conocimiento, deduplicada por nombre de herramienta + causa. Así el
 * motor sabe qué fallos existen en ESTE entorno y qué hacer, sin depender de que
 * el modelo lo recuerde.
 */
function learnFromToolFailure(toolName: string, args: any, result: string): void {
  // v2.0 — El fallo también se registra en la MEMORIA viva del agente: es la
  // sección [Incidencias Críticas] que el modelo lee en el siguiente turno para
  // no repetir el mismo error.
  try {
    brain.registrarFallo(toolName, result);
    // Si el historial Git de la memoria está activado, la incidencia queda
    // confirmada como un commit más (trazabilidad temporal de la evolución).
    features.commitMemoria(`incidencia: ${toolName}`);
  } catch {}
  try {
    let errorText = "";
    try {
      errorText = String(JSON.parse(result)?.error || "");
    } catch {
      errorText = String(result || "");
    }
    if (!errorText) return;
    // Se normaliza para no guardar una entrada por cada ruta distinta
    const normalized = errorText
      .replace(/[A-Za-z0-9_./\\-]{8,}/g, "<ref>")
      .replace(/\d+/g, "<n>")
      .slice(0, 180);
    notificarFalloHerramienta(toolName, errorText); // v1.74.0 · el éxito de después será la lección de ahora
    try { notificarFalloRecurrente(toolName, errorText); } catch { /* el contador de patrones nunca rompe el aprendizaje */ } // v1.76.0 · auto-propuesta
    const id = `fail:${toolName}:${normalized.slice(0, 40).replace(/\W+/g, "-")}`;
    const argHint = args?.path ? ` (con path="${args.path}")` : args?.command ? ` (con command="${String(args.command).slice(0, 60)}")` : "";
    engineKb.upsert({
      id,
      table: "error",
      title: `Fallo real de ${toolName}`,
      body: `La herramienta ${toolName}${argHint} falló en este entorno con: "${errorText.slice(0, 200)}". Antes de reintentar, corrige la causa (revisa ruta, comando o argumentos) en lugar de repetir la misma llamada.`,
      keys: [toolName.toLowerCase(), ...tokenize(errorText).slice(0, 8)],
      weight: 0.65,
    });
    kbDirty = true;
  } catch {
    /* el aprendizaje nunca debe romper la ejecución de una herramienta */
  }
}

/** Esquema validable de una herramienta del registro. */
function schemaForTool(name: string): ToolSchema | null {
  const spec = getToolSpec(name);
  if (!spec) return null;
  return { name: spec.name, parameters: spec.parameters as ToolSchema["parameters"] };
}

// ══════════════════════════════════════════════════════════════════════════
// QUIRÓFANO v1 /*QF-MOTOR*/ — la puerta que faltaba: cirugía sobre apps que YA funcionan
// --------------------------------------------------------------------------
// EL PROBLEMA REAL DEL USUARIO: «subo una app que funciona, pido una mejora y
// la rompen». El blindaje de sintaxis impide escribir un archivo DESBALANCEADO;
// no impide escribir un archivo mutilado y perfectamente balanceado, que es lo
// que hace un modelo de nube cuando reescribe de memoria un archivo que no ha
// leído. Aquí se juzga lo que de verdad rompe una app:
//   · exportaciones que desaparecen (el resto del proyecto las llama),
//   · amputación (el archivo se queda a la mitad),
//   · marcadores de truncado («…», «resto del código»),
//   · dependencias o scripts perdidos en package.json.
// Y si al cerrar la tanda una puerta cae, se REVIERTE lo escrito y se devuelve
// el informe. Coste en tokens: cero. Es todo determinista.
// ══════════════════════════════════════════════════════════════════════════

const QF_DIR = path.join(PROJECT_ROOT, ".cn-quirofano"); const interruptorQf = interruptorQuirofano({ raizDatos: PROJECT_ROOT, autorizado: sandboxAuthorized }); // v2.3.9 · el estado vive en <raíz de datos>/.cerebronico/quirofano.json y se lee ACÁ, al arrancar: un flag en RAM vuelve encendido con el primer reinicio, y eso no es un interruptor sino decoración.
const QF_ARCHIVO_ULTIMA = path.join(QF_DIR, "ultima.json");
/** Espera sin escrituras antes de dar la tanda por terminada y juzgarla. */
const QF_CIERRE_MS = Math.max(500, Number(process.env.QUIROFANO_CIERRE_MS) || 3500);

const discoQf: Disco = {
  existe: (r) => {
    try {
      return fs.existsSync(resolveSafePath(r));
    } catch {
      return false;
    }
  },
  leer: (r) => {
    try {
      return fs.readFileSync(resolveSafePath(r), "utf-8");
    } catch {
      return null;
    }
  },
  escribir: (r, c) => {
    const abs = resolveSafePath(r);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, c, "utf-8");
  },
  borrar: (r) => {
    try {
      fs.unlinkSync(resolveSafePath(r));
    } catch {
      /* un archivo que ya no está es el objetivo cumplido */
    }
  },
};

const QF_SKIP = new Set([
  "node_modules", ".git", "dist", "dist_electron", ".vite", "venv", "__pycache__",
  ".cerebro-db", ".cn-sync", ".cn-quirofano", ".quirofano-backup",
]);

/** Inventario del proyecto para la puerta de imports (acotado: nunca más de 800). */
function archivosProyectoQf(): CheckFile[] {
  const salida: CheckFile[] = [];
  const caminar = (dir: string, base: string, prof: number) => {
    if (salida.length >= 800 || prof > 12) return;
    let entradas: string[] = [];
    try {
      entradas = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entradas) {
      if (salida.length >= 800) return;
      const abs = path.join(dir, e);
      const rel = base ? base + "/" + e : e;
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!QF_SKIP.has(e)) caminar(abs, rel, prof + 1);
        continue;
      }
      if (st.size > 300 * 1024) continue;
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|json|html)$/i.test(e)) continue;
      try {
        salida.push({ path: rel, content: fs.readFileSync(abs, "utf-8") });
      } catch {
        /* ilegible: se salta */
      }
    }
  };
  try {
    if (fs.existsSync(PROJECT_ROOT)) caminar(PROJECT_ROOT, "", 0);
  } catch {}
  return salida;
}

let operacionQf: Operacion | null = null;
let temporizadorQf: ReturnType<typeof setTimeout> | null = null;
let cerrandoQf = false;
let ultimoCierreQf: VeredictoOperacion | null = null;
// v1.0.12 · objetivo del turno en curso: da nombre a la carpeta de obra nueva
// y viaja en la foto de la hilana cuando la nube se corta a mitad.
let objetivoTurnoQf = "";
let manifiestoObraVivoQf: { keys(): Iterable<string> } | null = null; // v1.0.12 · la foto del corte lee la tanda viva

// v1.0.12 · la foto del corte (hilana) no puede morir con el turno: escribe
// `.cn-turno/hilana.json` y la lee el turno siguiente.
const registrarHilanaGemini = (motivo: string): "" => { registrarHilanaCorte(objetivoTurnoQf, "Gemini: " + String(motivo || "").slice(0, 200)); return ""; };
function registrarHilanaCorte(objetivo: string, motivo: string): void {
  guardarHilana({ escribir: (a, tx) => { fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, tx, "utf-8"); }, union: (...s) => path.join(...s) }, PROJECT_ROOT, { ts: Date.now(), objetivo, motivo: String(motivo || "").slice(0, 300), archivos: manifiestoObraVivoQf ? [...manifiestoObraVivoQf.keys()] : [] });
}

const avisosQf: string[] = [];

// ─── v1.8.0 · VOZ: la facultad de decir lo que ya sabe, sin que se lo pregunten ─
/** Claves ya dichas: una cosa se dice una vez (regla R2 de autoRespuesta). */
const vozYaDichos = new Set<string>();
/** Últimos mensajes emitidos, para que el panel pueda trazarlos sin recalcularlos. */
let vozUltimos: MensajeEspontaneo[] = [];

/**
 * Lee un artefacto del proyecto para poder explicarlo.
 *
 * QUÉ ES: el puente entre «un fichero en disco» y el módulo de explicaciones.
 * PARA QUÉ SIRVE: para que la frase «qué es / para qué sirve / si está ejecutado»
 * se pueda dar de cualquier fichero sin que quien pregunta sepa dónde vive.
 *
 * Solo lee dentro de la carpeta de la aplicación: si la ruta se sale, no se lee y
 * se dice por qué. El `ejecutado` que se concede es el del QUIRÓFANO, y solo
 * cuando sus puertas cerraron en verde — que es la única evidencia de ejecución
 * que el servidor tiene de un archivo que él mismo escribió. Sin ese cierre, la
 * respuesta correcta es «no consta ejecución», aunque el código tenga buena pinta.
 */
function leerArtefactoParaExplicar(rutaRelativa: string): EntradaArtefacto {
  const rel = String(rutaRelativa || "").replace(/\\/g, "/");
  if (!rel) return { ruta: "(sin ruta)", evidencia: ["petición sin ruta"] };
  const base = process.cwd();
  const abs = path.resolve(base, rel);
  const dentro = abs === base || abs.startsWith(base + path.sep) || abs.startsWith(base + "/");
  if (!dentro) {
    return { ruta: rel, evidencia: ["fuera de la carpeta de la aplicación: no se lee"] };
  }
  const cerroEnVerde = !!ultimoCierreQf && ultimoCierreQf.ok === true && ultimoCierreQf.revertido !== true;
  try {
    const contenido = fs.readFileSync(abs, "utf-8");
    return {
      ruta: rel,
      contenido,
      ejecutado: cerroEnVerde,
      evidencia: cerroEnVerde
        ? ["las puertas del Quirófano cerraron en verde sobre esta tanda"]
        : ["sin cierre de puertas en verde: no consta ejecución"],
    };
  } catch {
    return { ruta: rel, ejecutado: false, evidencia: ["no se pudo leer el fichero desde el servidor"] };
  }
}

/**
 * El contexto real de la voz. No se inventa nada: son los datos que el Quirófano
 * ya tiene (avisos anotados, última tanda, tanda abierta). Si no hay nada que
 * decir, la lista sale vacía y el sistema se calla — que es una respuesta válida.
 */
function contextoVoz(): ContextoVoz {
  const avisos = avisosQf.slice(0, 3).map((texto, i) => ({
    clave: `qf-aviso-${i}-${texto.slice(0, 24)}`,
    texto,
    motivo: "lo anotó el Quirófano al cerrar una tanda",
  }));

  const hechos: ContextoVoz["hechos"] = [];
  if (ultimoCierreQf) {
    const informe = String(ultimoCierreQf.informe || "").slice(0, 160);
    hechos.push({
      clave: `qf-cierre-${informe.slice(0, 32)}`,
      texto: `Última tanda: ${ultimoCierreQf.revertido ? "REVERTIDA" : "aplicada"} — ${informe}`,
      // Solo es «ejecutado» si las puertas cerraron en verde y no se revirtió.
      certeza: ultimoCierreQf.ok === true && !ultimoCierreQf.revertido ? "ejecutado" : "sin_verificar",
      evidencia: ["puertas del Quirófano"],
    });
  }

  const sugerencias: ContextoVoz["sugerencias"] = [];
  if (operacionQf) {
    sugerencias.push({
      clave: "qf-tanda-abierta",
      texto: `Hay una tanda abierta (${cirugiasDe(operacionQf).length} archivo(s)) sin cerrar: hasta que la cierres, esos cambios no han pasado puertas.`,
      motivo: "el Quirófano tiene una operación en curso",
    });
  }

  return { avisos, hechos, sugerencias, yaDichos: [...vozYaDichos], ocupado: !!operacionQf };
}

/** Emite y marca: lo dicho no se repite (una facultad que se repite se apaga). */
function hablarAhora(): MensajeEspontaneo[] {
  const mensajes = mensajesEspontaneos(contextoVoz());
  for (const m of mensajes) vozYaDichos.add(m.clave);
  if (mensajes.length > 0) vozUltimos = mensajes;
  return mensajes;
}

/**
 * Puertas de esta instalación: la política (qué puertas corren, con qué build
 * inferido, con qué kill-switches) vive en server/gatesObra.ts — Fase 2 de la
 * casa: partir, no añadir. v1.23.0: COMPILACIÓN y SEGURIDAD encendidas por
 * defecto; tipos/humo siguen opt-in por QUIROFANO_GATES.
 */
function puertasQf(): Puerta[] {
  return construirPuertasQf(PROJECT_ROOT, runCommand);
}

function guardarUltimaQf(op: Operacion): void {
  try {
    fs.mkdirSync(QF_DIR, { recursive: true });
    fs.writeFileSync(QF_ARCHIVO_ULTIMA, serializarOperacion(op), "utf-8");
  } catch {
    /* la memoria del quirófano es accesoria: si no se puede guardar, el cambio sigue juzgado */
  }
}

/** Abre operación: guarda el baseline (imports rotos que YA existían) antes de tocar nada. */
function abrirOperacionQf(motivo: string): Operacion {
  const op = crearOperacion(motivo, Date.now());
  if (process.env.QUIROFANO_SIN_IMPORTS !== "1") {
    try {
      op.importsAntes = findMissingImports(archivosProyectoQf()).map((m) => `${m.from}|${m.specifier}`);
    } catch {
      op.importsAntes = [];
    }
  }
  operacionQf = op;
  console.log(`[CerebroNico] 🩺 QUIRÓFANO: operación abierta — ${motivo}`);
  return op;
}

function operacionActivaQf(motivo: string): Operacion {
  return operacionQf || abrirOperacionQf(motivo);
}

/**
 * EL JUEZ. Se llama ANTES de escribir. Devuelve si la escritura se bloquea y,
 * si sí, el mensaje COMPLETO que recibe el modelo (con la salida honesta).
 */
function juzgarEscrituraQf(
  ruta: string,
  contenido: string,
  opts: { force?: boolean; modo?: ModoEvaluacion } = {}
): { bloqueada: boolean; mensaje: string; original: string | null; diag: Diagnostico } {
  let original: string | null = null;
  try {
    const abs = resolveSafePath(ruta);
    original = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
  } catch {
    original = null;
  }
  const modo: ModoEvaluacion = opts.modo || "cirugia";
  let diag: Diagnostico;
  try {
    diag = evaluarCirugia(ruta, original, contenido, modo);
  } catch (err: any) {
    // Ante la duda, NO se bloquea: un guardián que falla cerrado mataría trabajo bueno.
    console.warn("[CerebroNico] 🩺 QUIRÓFANO: no se pudo juzgar " + ruta + " (" + (err?.message || err) + ")");
    return { bloqueada: false, mensaje: "", original, diag: null as unknown as Diagnostico };
  }
  // v2.3.9 · PALANCA DE ESCRITURAS (con memoria). Apagada: se escribe sin juzgar,
  // pero NO en silencio — si había algo bloqueante, el log nombra qué se dejó de
  // vigilar. El apagado que no se anuncia es un candado con aviso por fuera.
  if (!interruptorQf.vigilaEscrituras()) {
    if (diag.veredicto === "peligroso") console.warn(avisoJuezApagado(ruta, interruptorQf.archivo()));
    return { bloqueada: false, mensaje: "", original, diag };
  }
  if (diag.veredicto !== "peligroso" || opts.force) {
    if (diag.veredicto === "revisar") console.log("[CerebroNico] 🩺 QUIRÓFANO aviso en " + ruta + ": " + diag.motivos.join(" · "));
    return { bloqueada: false, mensaje: "", original, diag };
  }
  console.log("[CerebroNico] 🩺 QUIRÓFANO bloqueó " + ruta + ": " + diag.motivos[0]);
  return { bloqueada: true, mensaje: mensajeBloqueoQf(ruta, diag), original, diag };
}

/** Registra la escritura en la operación abierta y programa el cierre de la tanda. */
function registrarCirugiaQf(ruta: string, original: string | null, contenido: string, diag?: Diagnostico): void {
  try {
    const op = operacionActivaQf("cambios sobre el proyecto");
    anotarCirugia(op, ruta, original, contenido, diag);
    programarCierreQf("tanda de cambios");
  } catch (err: any) {
    console.warn("[CerebroNico] 🩺 QUIRÓFANO: no se pudo registrar " + ruta + " (" + (err?.message || err) + ")");
  }
}

/** Cierre diferido: cuando pasan QF_CIERRE_MS sin escrituras, se juzga la tanda. */
function programarCierreQf(motivo: string): void {
  if (temporizadorQf) clearTimeout(temporizadorQf);
  temporizadorQf = setTimeout(() => {
    temporizadorQf = null;
    void cerrarTurnoQf(motivo);
  }, QF_CIERRE_MS);
  if (typeof temporizadorQf.unref === "function") temporizadorQf.unref();
}

/**
 * CIERRE: corre las puertas sobre el DISCO, revierte si hay rojas y devuelve el
 * veredicto. Es idempotente: cerrar dos veces no revierte dos veces.
 */
async function cerrarTurnoQf(motivo: string): Promise<VeredictoOperacion | null> {
  if (temporizadorQf) {
    clearTimeout(temporizadorQf);
    temporizadorQf = null;
  }
  if (cerrandoQf) return ultimoCierreQf;
  const op = operacionQf;
  if (!op || cirugiasDe(op).length === 0) return null;
  cerrandoQf = true;
  operacionQf = null;
  try {
    const v = await cerrarOperacion(op, discoQf, {
      puertas: puertasQf(),
      revertirSiFalla: true,
      archivosProyecto: archivosProyectoQf,
    });
    guardarUltimaQf(op);
    ultimoCierreQf = v;
    const linea = lineaQuirofano(v);
    console.log(linea);
    if (!v.ok) {
      avisosQf.unshift(new Date().toLocaleTimeString() + " · " + (v.revertido ? "CAMBIO REVERTIDO" : "aviso") + " · " + v.motivo);
      if (avisosQf.length > 12) avisosQf.length = 12;
      try {
        learnFromToolFailure("quirofano", { motivo }, JSON.stringify({ ok: false, error: v.motivo }));
      } catch {}
    }
    return v;
  } catch (err: any) {
    console.warn("[CerebroNico] 🩺 QUIRÓFANO: el cierre falló (" + (err?.message || err) + ")");
    return null;
  } finally {
    cerrandoQf = false;
  }
}

/** Deshacer: la operación abierta si la hay; si no, la última guardada en disco. */
async function deshacerUltimoQf(): Promise<{ ok: boolean; informe: string; restaurados: string[]; retirados: string[] }> {
  const abierta = await cerrarTurnoQf("deshacer pedido");
  if (abierta && abierta.revertido) {
    return { ok: true, informe: "La tanda ya estaba revertida por el Quirófano.", restaurados: [], retirados: [] };
  }
  let op: Operacion | null = null;
  try {
    op = deserializarOperacion(fs.readFileSync(QF_ARCHIVO_ULTIMA, "utf-8"));
  } catch {
    op = null;
  }
  if (!op) return { ok: false, informe: "No hay ninguna operación que deshacer.", restaurados: [], retirados: [] };
  if (op.revertida) return { ok: true, informe: "Esa operación ya estaba revertida.", restaurados: [], retirados: [] };
  const res = revertir(op, discoQf);
  guardarUltimaQf(op);
  return {
    ok: true,
    informe:
      "Deshecho: " + res.restaurados.length + " archivo(s) restaurado(s), " + res.retirados.length + " retirado(s)." +
      (res.noReversibles.length ? " Sin copia de: " + res.noReversibles.join(", ") + "." : "") +
      (res.fallos.length ? " Fallos: " + res.fallos.join(" · ") : ""),
    restaurados: res.restaurados,
    retirados: res.retirados,
  };
}

/** Endpoints del Quirófano (los usa la IDE y el propio modelo). */
function registrarRutasQuirofano(app: express.Express): void {
  app.get("/api/quirofano/estado", (_req: Request, res: Response) => {
    try {
      const op = operacionQf;
      let ultima: any = null;
      try {
        ultima = JSON.parse(fs.readFileSync(QF_ARCHIVO_ULTIMA, "utf-8"));
      } catch {
        ultima = null;
      }
      return res.json({
        ok: true,
        gates:
          (String(process.env.QUIROFANO_GATES || "") || "estandar") +
          // v1.23.0 · el estado del quirófano declara los defaults nuevos, que
          // son ENCENDIDOS: compilación (build inferido) y cerradura (19 reglas).
          (process.env.QUIROFANO_SIN_COMPILACION === "1" ? "" : "+compilacion") +
          (process.env.QUIROFANO_SIN_CERRADURA === "1" ? "" : "+seguridad"),
        abierta: op ? { id: op.id, motivo: op.motivo, archivos: cirugiasDe(op).map((c) => c.ruta) } : null,
        // v1.0.10 · F1 — `revertidos`/`conservados`: la verdad por archivo. El
        // modelo ya no tiene que adivinar qué sobrevivió a la tanda.
        ultimo: ultimoCierreQf
          ? { ok: ultimoCierreQf.ok, revertido: ultimoCierreQf.revertido, informe: ultimoCierreQf.informe, revertidos: ultimoCierreQf.revertidos || [], conservados: ultimoCierreQf.conservados || [] }
          : null,
        ultimaOperacion: ultima ? { id: ultima.id, motivo: ultima.motivo, revertida: ultima.revertida, archivos: (ultima.archivos || []).map((a: any) => a.ruta) } : null,
        avisos: avisosQf, interruptor: interruptorQf.resumen(), // v2.3.9 · qué palancas están prendidas y QUÉ se dejó de vigilar con las apagadas

        // ─── v1.8.0 · VOZ ──────────────────────────────────────────────────
        // Las frases que dicen qué es y para qué sirve cada archivo tocado, con su
        // certeza. Se calculan SOLO si hay archivos de los que hablar (tanda
        // abierta o última cerrada): sin nada que explicar, el campo va vacío en
        // vez de llenarse de relleno.
        explicaciones: (() => {
          const rutas: string[] = operacionQf
            ? cirugiasDe(operacionQf).map((c) => c.ruta)
            : (ultima?.archivos || []).map((a: any) => a.ruta);
          return rutas.slice(0, 12).map((r) => explicarArtefacto(leerArtefactoParaExplicar(r)).frase);
        })(),
        // Lo que el sistema dice sin que le pregunten. Se marca como dicho al
        // emitirlo, así el panel puede sondear cada poco sin que la facultad
        // repita: una facultad que se repite se apaga (regla R2).
        voz: hablarAhora().map((m) => ({ tipo: m.tipo, texto: m.texto, motivo: m.motivo, certeza: m.certeza })),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  /**
   * v1.8.0 · VOZ — «¿esto qué es y para qué sirve?», contestado antes de que se
   * pregunte. Recibe una ruta o varias y devuelve la frase de cada artefacto con
   * su nivel de certeza (`ejecutado` / `solo leído` / `sin verificar`).
   *
   * Es de LECTURA: no ejecuta nada. Y no concede «ejecutado» a un archivo solo
   * porque exista: eso únicamente lo da un cierre de puertas en verde.
   */
  app.post("/api/artefacto/explicar", (req: Request, res: Response) => {
    try {
      const rutas: string[] = Array.isArray(req.body?.rutas)
        ? req.body.rutas.map((r: any) => String(r))
        : [String(req.body?.ruta || "")];
      const explicaciones = rutas
        .filter(Boolean)
        .slice(0, 40)
        .map((r) => explicarArtefacto(leerArtefactoParaExplicar(r)));
      return res.json({ ok: true, explicaciones, frases: explicaciones.map((e) => e.frase) });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/quirofano/revisar", async (req: Request, res: Response) => {
    // v1.6.32 · SEGURIDAD: cerrar una tanda PUEDE revertir archivos. Es una
    // puerta mutante igual que las 11 del sandbox y desde aquí también.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const v = await cerrarTurnoQf("revisión pedida desde la IDE");
    if (!v) return res.json({ ok: true, informe: "No hay cambios pendientes de revisar." });
    return res.json({ ok: v.ok, revertido: v.revertido, puertas: v.puertas, informe: v.informe });
  });

  app.post("/api/quirofano/deshacer", async (req: Request, res: Response) => {
    // v1.6.32 · SEGURIDAD: deshacer REESCRIBE archivos con la copia anterior.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const r = await deshacerUltimoQf();
    return res.json(r);
  });
}
/*QF-MOTOR*/

/**
 * v1.46.0 — EL ENVOLTORIO QUE CONVIERTE EJECUCIÓN EN EVIDENCIA.
 * =============================================================
 * POR QUÉ UN ENVOLTORIO Y NO UNA LÍNEA DENTRO: `executeToolCall` tiene 32 `case`
 * y decenas de `return`. Sembrar la anotación a mano en cada salida es garantizar
 * que la próxima herramienta que alguien añada se olvide de anotar — y esa clase
 * de olvido es invisible: el turno seguiría funcionando, solo que el revisor
 * volvería a decir «sin verificar» sin que nadie lo note. Envolviendo la función
 * ENTERA, toda herramienta presente y futura queda anotada por construcción.
 *
 * El envoltorio NO decide nada: solo registra. Quien concede o niega certeza es
 * `evidenciaTurno.ts`, con sus reglas a la vista y probadas.
 */
// v1.48.0 — EMISOR DE EVENTOS DEL TURNO ACTUAL (abrir previsualizador «a
// voluntad»). El previsualizador debe poder abrirse desde CUALQUIER conductor
// (Ollama / Gemini / Z.ai): todos pasan por executeToolCall, así que la señal
// sale de UN solo punto. Se fija al arrancar /api/ai/stream con el
// `sendTaskEvent` del contexto vivo y se limpia al cerrar el turno.
let emisorEventoTurno: ((ev: any) => void) | null = null;
function fijarEmisorEventoTurno(fn: ((ev: any) => void) | null): void {
  emisorEventoTurno = fn;
}

async function executeToolCall(name: string, args: any): Promise<string> { if (modoServidor() && name.startsWith("pc_")) return JSON.stringify({ok:false,error:"Edición servidor: usa write_file/read_file/list_files en /workspace, no el puente de la PC."});
  try {
    const salida = await executeToolCallInterno(name, args);
    anotarHerramienta(name, salida, String(args?.command ?? args?.cmd ?? args?.comando ?? args?.instruccion ?? "").trim());
    return salida;
  } catch (e: any) {
    // Una excepción es un fallo del turno. Se anota como tal —con `ok:false`, que
    // NO concede certeza— y se relanza: el mensaje original no se altera.
    anotarHerramienta(name, JSON.stringify({ ok: false, error: String(e?.message || e) }), String(args?.command ?? args?.cmd ?? args?.comando ?? args?.instruccion ?? "").trim());
    throw e;
  }
}

async function executeToolCallInterno(name: string, args: any): Promise<string> {
  try {
    // ------------------------------------------------------------
    // BLINDAJE DEL CONTEXTO DE HERRAMIENTAS: se valida la llamada contra el
    // esquema declarado ANTES de ejecutar. Los modelos pequeños inventan campos,
    // tipos y nombres; sin esta capa el motor ejecutaría basura (o un borrado con
    // el campo equivocado). Si algo no cuadra, el error vuelve al modelo para
    // que se autocorrija.
    // ------------------------------------------------------------
    const spec = getToolSpec(name);
    if (!spec) {
      return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
    }
    const schema = schemaForTool(name);
    if (schema) {
      const check = validateToolCall(schema, args || {});
      if (!check.ok) {
        const detail = check.issues.filter((i) => !i.message.includes("se ha ignorado")).map((i) => `- ${i.field}: ${i.message}`).join("\n");
        return JSON.stringify({
          ok: false,
          error: `Argumentos inválidos para "${name}" según el esquema del motor:\n${detail}`,
          hint: "Corrige los campos y vuelve a llamar a la herramienta.",
        });
      }
      args = check.sanitized;
    }

    // TERMINAL PERSISTENTE — se despacha antes del switch del núcleo. La
    // validación de esquema de arriba ya actuó (el pack declara sus specs).
    if (ES_HERRAMIENTA_TERMINAL(name)) {
      return ejecutarHerramientaTerminal(name, args);
    }

    // DOCUMENTOS REALES (v1.71.0) — ídem: el pack valida su ruta contra el
    // sandbox con el MISMO resolveSafePath del monolito (se le inyecta).
    // v1.0.20 · RUTAS — abrir_proyecto / contexto_rutas. Se despachan antes del
    // switch: no tocan disco fuera de la raíz de datos y devuelven SIEMPRE JSON.
    if (ES_HERRAMIENTA_RUTAS(name)) {
      return ejecutarHerramientaRutas(name, args, DEPS_REGISTRO);
    }
    if (ES_HERRAMIENTA_DOCUMENTOS(name)) {
      return ejecutarHerramientaDocumentos(name, args, { resolverRutaSegura: resolveSafePath });
    }

    // SERVIDORES MCP (v1.0.28) — las herramientas de mcp_servers.json se
    // despachan aquí, ANTES del switch y ANTES del despacho a packs HTTP: su
    // dueño es un proceso local por stdio, no un endpoint `/tools/call`. Se
    // responde SIEMPRE JSON (es lo que el lazo del agente sabe leer).
    // v1.0.30 · ARRANQUE PEREZOSO — `duenioDeHerramienta` casa por PREFIJO sobre
    // los nombres públicos, así que también reconoce las herramientas de un
    // servidor que aún NO tiene proceso (vive en la caché). `asegurarServidorMcp`
    // lo levanta UNA vez: la primera llamada paga el arranque, las demás no, y dos
    // llamadas simultáneas comparten ese mismo arranque en vez de abrir dos
    // procesos o contestar «no está vivo» con el proceso a medio levantar.
    {
      const duenio = duenioDeHerramienta(name, servidoresMcpVivos());
      if (duenio) {
        const serv = await asegurarServidorMcp(duenio.id);
        if (!serv) {
          return JSON.stringify({
            ok: false,
            servidor: duenio.id,
            herramienta: duenio.original,
            error: `el servidor MCP «${duenio.id}» no pudo arrancar al usarse (su comando falló o no declara herramientas); revisá mcp_servers.json y probá de nuevo`,
          });
        }
        try {
          const r = await serv.llamarHerramienta(duenio.original, (args && typeof args === "object" ? args : {}) as Record<string, unknown>);
          return JSON.stringify({ ok: r.ok, servidor: duenio.id, herramienta: duenio.original, resultado: r.texto });
        } catch (e: any) {
          // El motivo del servidor NO se tapa con "falló la herramienta": un
          // timeout se arregla reintentando, un 401 yendo a las claves, y un
          // "comando no encontrado" instalando. Distinguirlos es el trabajo.
          return JSON.stringify({ ok: false, servidor: duenio.id, herramienta: duenio.original, error: String((e && e.message) || e) });
        }
      }
    }

    // PUENTE :5000 (v1.97.0) — ídem: el interruptor vive en src/engine/herramientaPuente.ts y
    // atiende al modelo y al botón «Reconectar» por la MISMA función (una opinion, no dos).
    if (ES_HERRAMIENTA_PUENTE(name)) { const d = depsPuente(); return d ? ejecutarHerramientaPuente(name, args, d) : JSON.stringify({ ok: false, error: "el puente aún no registró sus dependencias (el server está arrancando): esperá un segundo y probá de nuevo" }); }

    switch (name) {
      case "exportar_apk": {
        // v1.57.17 · LA FÁBRICA TIENE MANOS EN EL CHAT: la misma máquina que atiende el
        // botón, con los mismos candados (web compilada, appId, UN trabajo vivo). No
        // receta pasos: produce, y cuando no puede, dice qué falta con precisión.
        const acc = String(args?.accion || "estado").toLowerCase();
        if (acc === "generar") return JSON.stringify(generarAndroidDesdeChat(PROJECT_ROOT, args || {}));
        if (acc === "compilar") {
          const r = lanzarCompilacionApk(PROJECT_ROOT);
          if (r.ok && r.trabajo) {
            return JSON.stringify({ ok: true, jobId: r.trabajo.id, yaEnMarcha: !!r.yaEnMarcha, estado: r.trabajo.estado, message: (r.yaEnMarcha ? "Ya había una compilación en marcha (un solo Gradle vivo por máquina): no arranqué otra. " : `Compilación lanzada: ${r.trabajo.explicacionRuta} `) + "Es un trabajo largo: volvé con accion=estado antes de afirmar nada sobre el APK." });
          }
          return JSON.stringify({ ok: false, error: r.error, hechos: r.hechos || null });
        }
        return JSON.stringify(estadoAndroidDesdeChat(PROJECT_ROOT));
      }
      case "list_files": {
        if (modoServidor()) return JSON.stringify({ok:true,files:inventarioWorkspace(PROJECT_ROOT).map(f=>f.path)});
        const files: string[] = [];
        const walk = (dir: string, base: string) => {
          let entries: string[] = [];
          try {
            entries = fs.readdirSync(dir);
          } catch {
            return;
          }
          for (const entry of entries) {
            const full = path.join(dir, entry);
            const rel = base ? `${base}/${entry}` : entry;
            let stat;
            try {
              stat = fs.statSync(full);
            } catch {
              continue;
            }
            if (stat.isDirectory()) walk(full, rel);
            else files.push(rel);
          }
        };
        walk(PROJECT_ROOT, "");
        return JSON.stringify({ ok: true, files });
      }
      case "read_file": {
        const abs = resolveSafePath(String(args?.path || ""));
        const content = fs.readFileSync(abs, "utf-8");
        return JSON.stringify({ ok: true, path: args?.path, content: content.slice(0, 40000) });
      }
      case "write_file": {
        // v1.0.12 · OBRA VISIBLE (server/obraCurso.ts): la piedra fundacional de
        // un proyecto nuevo sin vincular nace en SU carpeta — la que el árbol del
        // editor muestra y el :3500 sirve. Mario: «el usuario nunca ve los
        // archivos en su editor». Ediciones y órganos del IDE: ruta de siempre.
        const rutaQf12 = desviarHaciaCarpetaDeObra({ ruta: String(args?.path || ""), raizDatos: PROJECT_ROOT, vinculada: modoServidor() ? PROJECT_ROOT : leerRutaVinculada(PROJECT_ROOT), servida: raizDeObraEnCurso(PROJECT_ROOT), existe: (a) => fs.existsSync(a), titulo: objetivoTurnoQf }, (...s) => path.join(...s), (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }, () => olvidarRaizDeObra());
        if (rutaQf12.nueva) console.log(`[CerebroNico] ${rutaQf12.motivo}`);
        const abs = resolveSafePath(rutaQf12.ruta);
        const content = String(args?.content ?? "");
        // QUIRÓFANO v1 /*QF-WRITEFILE*/ — el juez entra ANTES del blindaje de sintaxis.
        // Reescribir un archivo que ya existe es la forma nº1 de romper una app que
        // funcionaba: el modelo devuelve «su versión» del archivo a medias.
        const juicioQf = juzgarEscrituraQf(String(args?.path || ""), content, { force: args?.force === true });
        if (juicioQf.bloqueada) {
          return JSON.stringify({ ok: false, error: juicioQf.mensaje, quirofano: juicioQf.diag, hint: "Usa edit_file con anclas únicas, o write_file con force=true y motivo." });
        }
/*QF-WRITEFILE*/
        // ------------------------------------------------------------
        // BLINDAJE DE SINTAXIS: el archivo se valida ANTES de tocar el disco.
        // Si está roto (JSON inválido, llaves sin cerrar, JSX desbalanceado,
        // código cortado con «…»), no se escribe nada y el error vuelve al
        // modelo para que se autocorrija. Es la diferencia entre "el conductor
        // es flojo" y "el proyecto se rompe".
        // ------------------------------------------------------------
        const guard = await guardFileProfundo(String(args?.path || ""), content, PARSER_ESBUILD);
        if (!guard.ok) {
          return JSON.stringify({ ok: false, error: rejectMessage(String(args?.path || ""), guard), issues: guard.issues });
        }
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf-8");
        registrarCirugiaQf(String(args?.path || ""), juicioQf.original, content, juicioQf.diag); /*QF-WRITEREG*/
        // v1.0.10 · F1 — ESCRITO NO ES CIERTO HASTA VER EN DISCO (la guarda
        // vive en server/sandboxPreview.ts): 49 tandas revertidas mientras
        // write_file decía «ok»; la respuesta ahora se construye sobre el
        // bytes-on-disk real y el último veredicto conocido del quirófano.
        const estQf10 = verificarEscrituraEnDisco({ stat: (a) => { try { const s = fs.statSync(a); return s.isFile() ? { size: s.size } : null; } catch { return null; } } }, abs, content);
        if (!estQf10.enDisco) return JSON.stringify({ ok: false, error: `la escritura NO quedó en disco (${args?.path}: se pedían ${estQf10.bytesEsperados} bytes, hay ${estQf10.bytesEnDisco})`, path: args?.path });
        try { const _bn = path.basename(abs).toLowerCase(); if (/^(index\.html|main\.(js|ts|tsx|py)|app\.(js|ts|tsx)|package\.json)$/.test(_bn)) autoVincularObra(PROJECT_ROOT, process.cwd(), path.dirname(abs)); } catch { /* el auto-vinculado no tumba una escritura exitosa */ } // v1.0.14 · fija C:\Cerebronico\<obra> como raíz de trabajo al crear la piedra fundacional (editor y :3500 la sirven solos).
        return JSON.stringify({ ok: true, path: args?.path, bytes: estQf10.bytesEsperados, verificado_en_disco: true, syntax: guard.summary, quirofano_tanda: "abierta — se juzga al cerrar el silencio; los archivos revertidos se nombran en /api/quirofano/estado", ultimo_cierre: resumenUltimoCierre(ultimoCierreQf) });
      }
      case "run_command": {
        // v8.0.4 — ADUANA OBLIGATORIA. Antes se pasaba `args.command` a `exec`
        // tal cual. Cuando el modelo escribía la llamada como TEXTO
        // (`run_command command="cd X && npm start"`), ese texto acababa
        // ejecutándose en el shell y Windows contestaba «run_command no se
        // reconoce como un comando…». Aquí se desenvuelve si se puede y se
        // rechaza con motivo si no.
        const norm = normalizarComandoEntrante(args?.command); const juicioCmdQf = interruptorQf.juzgarComando(norm, { origen: "run_command", comando: norm.comando }); // v2.3.9 · la palanca de comandos se llama aparte de la de escrituras: apagar una no desarma la otra.
        if (juicioCmdQf.bloqueado) return JSON.stringify({ ok: false, error: juicioCmdQf.motivo });
        if (norm.envuelto) console.warn(`[CerebroNico] ${norm.motivo}`);
        const result = await runCommand(norm.comando, PROJECT_ROOT, 120000);
        return JSON.stringify(result);
      }
      case "run_tests": {
        const crudo = typeof args?.command === "string" && args.command.trim() ? args.command : "npm test";
        const norm = normalizarComandoEntrante(crudo); const juicioCmdQf = interruptorQf.juzgarComando(norm, { origen: "run_tests", comando: norm.comando });
        if (juicioCmdQf.bloqueado) return JSON.stringify({ ok: false, error: juicioCmdQf.motivo });
        const result = await runCommand(norm.comando, PROJECT_ROOT, 180000);
        return JSON.stringify(result);
      }
      case "convertir_formato": {
        // v1.15.1 — expone el conversor determinista (formatConverter.ts) al agente.
        // Es lógica pura y ya está probada con ida-y-vuelta: cero red, cero créditos.
        const r = convertir(String(args?.texto ?? ""), args?.desde, args?.hacia, {
          ordenarClaves: args?.ordenar_claves === true,
          separadorCsv: args?.separador_csv === ";" ? ";" : ",",
          inferirTiposCsv: args?.inferir_tipos_csv === true,
        });
        if (!r.ok) return JSON.stringify({ ok: false, error: r.error });
        return JSON.stringify({ ok: true, salida: r.salida, informe: r.informe });
      }
      case "crear_pdf": return ejecutarCrearPdf(args, { resolver: resolveSafePath }); case "crear_docx": return ejecutarCrearDocx(args, { resolver: resolveSafePath }); case "crear_zip": return ejecutarCrearZip(args, { resolver: resolveSafePath }); // v1.95.0 / v1.96.0 · PDF, Word y ZIP en UNA llamada c/u: la lógica y la escritura viven en src/engine/herramienta{Pdf,Docx,Zip}.ts y acá solo se montan. LOS TRES `case` comparten UNA línea a propósito: el presupuesto del monolito es 12174 (lo mide `superficie.mjs` con `split("\n").length`) y agrandarlo es justo lo que el trinquete existe para impedir — se parte o se comparte línea, nunca se sube el techo. Sin `registrar` a propósito en crear_pdf: el quirófano anota con `anotarCirugia` y su firma no se invoca de memoria.
      // v1.16.3.1 · SISTEMA (bajo consumo): las mismas funciones del chip de
      // Puertos — el agente y la interfaz ven una sola verdad medida.
      case "ollama_estado": {
        const e = await sondearOllamaPs({ ollamaUrl: OLLAMA_DEFAULT.replace(/\/$/, "") }, true);
        return JSON.stringify({ ok: true, ...e });
      }
      case "ollama_expulsar": {
        const r = await expulsarModelos({ ollamaUrl: OLLAMA_DEFAULT.replace(/\/$/, "") }, args?.model ? [String(args.model)] : undefined);
        return JSON.stringify({ ok: r.ok, expulsados: r.expulsados, fallidos: r.fallidos, residenteMb: r.despues.residenteMb });
      }
      case "recursos_maquina": {
        const ps = await sondearOllamaPs({ ollamaUrl: OLLAMA_DEFAULT.replace(/\/$/, "") });
        return JSON.stringify({ ok: true, cpuCores: CPU_CORES, ramGb: RAM_GB, ramLibreMb: Math.round(os.freemem() / 1048576), residenteOllamaMb: ps.residenteMb });
      }
      // v1.48.0 — CEREBRO (.con-ciencia): memoria de largo plazo enrutada.
      case "cerebro_recordar": {
        const entrada = aprenderCerebro(PROJECT_ROOT, {
          tema: String(args?.tema || "general"),
          titulo: String(args?.titulo || ""),
          texto: String(args?.texto || ""),
          palabras: Array.isArray(args?.palabras) ? args.palabras.map(String) : undefined,
          resumen: args?.resumen ? String(args.resumen) : undefined,
        });
        if (!entrada) {
          return JSON.stringify({ ok: false, error: "No se pudo registrar en el cerebro (¿texto vacío?)." });
        }
        // v1.74.0 · espejo en tinta: lo que el agente guarda en el cerebro
        // queda TAMBIÉN en LECCIONES.md (visible, editable, inyectable ya).
        try { anotarLeccionViva({ fuente: "cerebro", titulo: `Cerebro[${entrada.tema}]: ${entrada.titulo}`, texto: String(args?.texto || "") }); } catch { /* */ }
        const st = estadoCerebro(PROJECT_ROOT);
        return JSON.stringify({
          ok: true,
          id: entrada.id,
          tema: entrada.tema,
          titulo: entrada.titulo,
          peso: entrada.peso,
          palabras: entrada.palabras.slice(0, 12),
          cerebro: { entradas: st.entradas, temas: st.temas },
          nota: "Guardado en el cerebro e indexado por tema/título/contexto. Lo reencontrarás con cerebro_consultar sin releer todo.",
        });
      }
      case "cerebro_consultar": {
        const consulta = String(args?.consulta || "");
        const max = Number.isFinite(args?.max) ? Number(args.max) : 4;
        // v1.84.0 · FASE 2: buscar en el cerebro tambien entiende parrafos.
        let rutas: RutaCerebro[];
        try {
          const hib = await enrutarHibridoCerebro(PROJECT_ROOT, consulta, { embed: cerebroEmbedder.embed, alCalentar: cerebroEmbedder.alCalentar, timeoutMs: 5000, max });
          rutas = hib.modo === "hibrido" ? hib.rutas : enrutarCerebro(PROJECT_ROOT, consulta, max);
        } catch {
          rutas = enrutarCerebro(PROJECT_ROOT, consulta, max);
        }
        if (rutas.length === 0) {
          return JSON.stringify({ ok: true, encontrado: false, mensaje: "El cerebro no tiene nada que enrute a esa consulta todavía." });
        }
        const contexto = buildCerebroContext(PROJECT_ROOT, consulta, 1600, rutas);
        return JSON.stringify({
          ok: true,
          encontrado: true,
          entradas: rutas.map((r: RutaCerebro) => ({ tema: r.entrada.tema, titulo: r.entrada.titulo, resumen: r.entrada.resumen, relevancia: r.score })),
          contexto,
        });
      }
      // v1.48.0 — EL AGENTE ABRE EL PREVISUALIZADOR A VOLUNTAD.
      case "abrir_previsualizador": {
        const motivo = args?.motivo ? String(args.motivo) : "";
        let entregado = false;
        if (emisorEventoTurno) {
          try { emisorEventoTurno({ type: "abrir_preview", motivo }); entregado = true; } catch { entregado = false; }
        }
        return JSON.stringify({
          ok: true,
          abierto: entregado,
          motivo,
          nota: entregado
            ? "Orden enviada a la interfaz: abre el editor web, arranca el sandbox si hace falta y refresca el previsualizador (:3500)."
            : "No hay interfaz escuchando este turno; la orden de abrir el previsualizador no se pudo entregar.",
        });
      }
      case "set_plan": {
        const tasks = Array.isArray(args?.tasks) ? args.tasks : [];
        return JSON.stringify({ ok: true, plan: tasks.length });
      }
       case "update_task": {
         return JSON.stringify({ ok: true, task: args?.task_id, status: args?.status });
       }
       // ---- Herramientas de ACCESO PC REAL (delegadas al puente Python :5000) ----
       case "pc_info": {
         const info = await bridgeFetch("/api/pc/info");
         return JSON.stringify(info);
       }
       case "pc_exec": {
         const command = String(args?.command || "");
         if (!command) return JSON.stringify({ ok: false, error: "Falta el comando" });
         const res = await bridgeFetch("/api/exec", { command, timeout: Number(args?.timeout) || 120 }, 130000);
         return JSON.stringify(res);
       }
       case "pc_write_file": {
         const res = await bridgeFetch("/api/fs/write", { path: String(args?.path || ""), content: String(args?.content ?? "") });
         return JSON.stringify(res);
       }
       case "pc_read_file": {
         const res = await bridgeFetch("/api/fs/read", { path: String(args?.path || "") });
         return JSON.stringify(res);
       }
       case "pc_list_dir": {
         const res = await bridgeFetch("/api/fs/list", { path: String(args?.path || "") });
         return JSON.stringify(res);
       }
       case "pc_delete": {
         const res = await bridgeFetch("/api/fs/delete", { path: String(args?.path || "") });
         return JSON.stringify(res);
       }

       // ============================================================
       // v2.0 — HERRAMIENTAS NUEVAS (todas dentro del sandbox .proyectos)
       // ------------------------------------------------------------
       // Motivo: con modelos pequeños, la diferencia entre "responder en 3
       // segundos" y "colgarse" es cuántos tokens tiene que generar. Reescribir
       // un archivo de 500 líneas cuesta ~4.000 tokens; reemplazar una línea
       // cuesta 40. Estas herramientas existen para que el modelo pueda hacer lo
       // segundo.
       // ============================================================
       case "read_file_range": {
         const abs = resolveSafePath(String(args?.path || ""));
         const all = fs.readFileSync(abs, "utf-8").split("\n");
         const start = Math.max(1, Number(args?.start) || 1);
         const end = Math.min(all.length, Number(args?.end) || Math.min(all.length, start + 199));
         const slice = all.slice(start - 1, end);
         // Numeramos las líneas para que el modelo pueda citar/patchar con precisión
         const numbered = slice.map((l, i) => `${start + i}: ${l}`).join("\n");
         return JSON.stringify({ ok: true, path: args?.path, start, end, totalLines: all.length, content: numbered });
       }
       case "edit_file": {
         const abs = resolveSafePath(String(args?.path || ""));
         if (!fs.existsSync(abs)) return JSON.stringify({ ok: false, error: `No existe el archivo ${args?.path}` });
         const find = String(args?.find ?? "");
         const replace = String(args?.replace ?? "");
         if (!find) return JSON.stringify({ ok: false, error: "Falta el texto a buscar (find)" });
         const original = fs.readFileSync(abs, "utf-8");
         const occurrences = original.split(find).length - 1;
         if (occurrences === 0) {
           return JSON.stringify({ ok: false, error: "El texto a reemplazar no se encontró en el archivo (¿espacios o comillas distintas?)" });
         }
         if (occurrences > 1) {
           return JSON.stringify({
             ok: false,
             error: `El texto aparece ${occurrences} veces: añade más contexto para que sea único.`,
           });
         }
         // El resultado del reemplazo también se valida: un edit_file puede
         // dejar el archivo desbalanceado (por ejemplo, si «replace» corta una
         // función a medias). Si rompe la sintaxis, se revierte.
         const updated = original.replace(find, replace);
         const guardEdit = await guardFileProfundo(String(args?.path || ""), updated, PARSER_ESBUILD);
         if (!guardEdit.ok) {
           return JSON.stringify({
             ok: false,
             error: `⛔ El reemplazo dejaría el archivo con errores de sintaxis y se ha REVERTIDO.\n${guardEdit.summary}\nCorrige el texto de "replace" y vuelve a intentarlo.`,
             issues: guardEdit.issues,
           });
         }
          // QUIRÓFANO v1 /*QF-EDIT*/ — también se juzga el resultado de un edit_file:
          // un find/replace puede llevarse por delante una exportación o media función.
          const juicioEditQf = juzgarEscrituraQf(String(args?.path || ""), updated);
          if (juicioEditQf.bloqueada) {
            return JSON.stringify({ ok: false, error: juicioEditQf.mensaje, quirofano: juicioEditQf.diag });
          }
          fs.writeFileSync(abs, updated, "utf-8");
          registrarCirugiaQf(String(args?.path || ""), original, updated, juicioEditQf.diag);
          return JSON.stringify({ ok: true, path: args?.path, savedChars: find.length - replace.length, syntax: guardEdit.summary });
       }
       case "append_file": {
         const abs = resolveSafePath(String(args?.path || ""));
         const content = String(args?.content ?? "");
         fs.mkdirSync(path.dirname(abs), { recursive: true });
         fs.appendFileSync(abs, content, "utf-8");
         return JSON.stringify({ ok: true, path: args?.path, appended: content.length });
       }
       case "search_in_files": {
         const query = String(args?.query || "");
         if (!query) return JSON.stringify({ ok: false, error: "Falta el texto a buscar (query)" });
         let re: RegExp;
         try {
           re = new RegExp(query, "i");
         } catch {
           re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
         }
         const extFilter = typeof args?.glob === "string" ? args.glob.trim().toLowerCase() : "";
         const maxResults = Math.max(1, Math.min(200, Number(args?.max_results) || 40));
         const hits: string[] = [];
         const IGNORED = new Set(["node_modules", ".git", "dist", "dist_electron", ".vite", "venv", "__pycache__"]);
         const walkSearch = (dir: string, base: string) => {
           if (hits.length >= maxResults) return;
           let entries: string[] = [];
           try {
             entries = fs.readdirSync(dir);
           } catch {
             return;
           }
           for (const entry of entries) {
             if (hits.length >= maxResults) return;
             if (IGNORED.has(entry)) continue;
             const full = path.join(dir, entry);
             const rel = base ? `${base}/${entry}` : entry;
             let stat;
             try {
               stat = fs.statSync(full);
             } catch {
               continue;
             }
             if (stat.isDirectory()) {
               walkSearch(full, rel);
               continue;
             }
             if (extFilter && !rel.toLowerCase().endsWith(extFilter)) continue;
             if (stat.size > 512 * 1024) continue; // no indexamos binarios gigantes
             let text = "";
             try {
               text = fs.readFileSync(full, "utf-8");
             } catch {
               continue;
             }
             const lines = text.split("\n");
             for (let i = 0; i < lines.length && hits.length < maxResults; i++) {
               if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
             }
           }
         };
         walkSearch(PROJECT_ROOT, "");
         return JSON.stringify({ ok: true, query, matches: hits.length, results: hits });
       }
       case "find_symbol": {
        // FASE 2 — Consulta al índice del motor (no al modelo).
        const needle = String(args?.name || "");
        if (!needle) return JSON.stringify({ ok: false, error: "Falta el nombre del símbolo (name)." });
        if (symbolMap.total === 0) reindexProjectSymbols();
        const limit = Math.max(1, Math.min(30, Number(args?.limit) || 8));
        const hits = findSymbols(symbolMap, needle, limit);
        if (hits.length === 0) {
          return JSON.stringify({
            ok: true,
            found: 0,
            message: `El motor no encontró ningún símbolo "${needle}" en el proyecto (${symbolMap.files.length} archivo(s) indexado(s), ${symbolMap.total} símbolo(s)). No inventes ese nombre: usa search_in_files o pide al usuario que confirme.`,
          });
        }
        return JSON.stringify({
          ok: true,
          found: hits.length,
          indexed: { files: symbolMap.files.length, symbols: symbolMap.total },
          results: hits.map((h) => ({ file: h.file, line: h.symbol.line, kind: h.symbol.kind, signature: h.symbol.signature })),
        });
      }
      case "make_dir": {
         const abs = resolveSafePath(String(args?.path || ""));
         fs.mkdirSync(abs, { recursive: true });
         return JSON.stringify({ ok: true, path: args?.path });
       }
       case "delete_file": {
         const abs = resolveSafePath(String(args?.path || ""));
         if (!fs.existsSync(abs)) return JSON.stringify({ ok: false, error: `No existe ${args?.path}` });
         // QUIRÓFANO v1 /*QF-DELETE*/ — un borrado entra en la operación: el botón
         // «Deshacer» tiene que poder devolver el archivo, no sólo lamentarlo.
         try {
           registrarCirugiaQf(String(args?.path || ""), fs.readFileSync(abs, "utf-8"), "");
         } catch {}
         fs.unlinkSync(abs);
         return JSON.stringify({ ok: true, deleted: args?.path });
       }
       // QUIRÓFANO v1 /*QF-CASOS*/ — el modelo puede revisar y deshacer SUS PROPIOS cambios.
       case "revisar_cambios": {
         const v = await cerrarTurnoQf("revisión pedida por el modelo");
         if (!v) return JSON.stringify({ ok: true, informe: "No hay cambios pendientes en esta tanda." });
         return JSON.stringify({ ok: v.ok, revertido: v.revertido, puertas: v.puertas, informe: v.informe });
       }
       case "deshacer_cambios": {
         const r = await deshacerUltimoQf();
         return JSON.stringify(r);
       }
       case "git_status": {
         const result = await runCommand("git status --short --branch", PROJECT_ROOT, 20000);
         return JSON.stringify(result);
       }
       case "git_diff": {
         const target = typeof args?.path === "string" && args.path.trim() ? ` -- ${args.path.trim()}` : "";
         const result = await runCommand(`git diff${target}`, PROJECT_ROOT, 30000);
         return JSON.stringify(result);
       }
       case "git_commit": {
         const message = String(args?.message || "Punto de restauración CerebroNico").replace(/"/g, "'");
         const result = await runCommand(`git add -A && git commit -m "${message}"`, PROJECT_ROOT, 40000);
         return JSON.stringify(result);
       }
       case "consultar_espejo": {
        // ESPEJOS v2 — el modelo llama espejos DIRECTO y en LOTE: cálculo
        // determinista (~1 ms, 0 alucinación) sin un round trip por operación.
        const llamadas = Array.isArray(args?.llamadas) ? args.llamadas : [];
        if (!llamadas.length) return JSON.stringify({ ok: false, motivo: "falta «llamadas» (array de {espejo, datos})." });
        if (llamadas.length > 8) return JSON.stringify({ ok: false, motivo: "máximo 8 llamadas por golpe — divide y reenvía." });
        const resultados = llamadas.map((l: any) => {
          const id = String(l?.espejo || "");
          // v2.1.2 · DOS CATÁLOGOS, DOS EJECUTORES. El prefijo decide la rama:
          //   espejo.*   → pool del consejo (ejecutarEntidad)
          //   servidor.* → contratos de servidor de datos (ejecutarEspejoServidor)
          // Sin la rama servidor.*, quitar el filtro devolvía «entidad desconocida»:
          // el arreglo es el DESPACHO, no el regex. La valla lo exige por las dos mitades.
          const esDeServidor = /^servidor\./.test(id);
          if (!esDeServidor && !/^espejo\./.test(id)) return { espejo: id, ok: false, motivo: "solo espejos (id «espejo.*» o «servidor.*»)." };
          try {
            const rr = esDeServidor ? ejecutarEspejoServidor(id, l?.datos ?? {}) : ejecutarEntidad(id, l?.datos ?? {});
            // SALUD v1: solo los espejo.* entran a la flota. registrarSaludEspejo + vistaSalud
            // (server.ts:4706) indexan por IDS_ESPEJOS + poolEspejos(): un servidor.* ahí sería
            // una fila huérfana y la próxima valla de salud saltaría roja por este arreglo.
            if (!esDeServidor) registrarSaludEspejo(id, !!rr?.ok);
            return { espejo: id, ok: !!rr?.ok, ms: rr?.ms, ...(rr?.ok ? { salida: rr.salida } : { motivo: rr?.motivo || "el espejo no devolvió motivo" }) };
          } catch (e2: any) { if (!esDeServidor) registrarSaludEspejo(id, false); return { espejo: id, ok: false, motivo: String(e2?.message || e2) }; }
        });
        return JSON.stringify({ ok: true, resultados });
      }
      case "forjar_complemento": {
         // FORJA v1 — el modelo SOLO aporta la receta (JSON, cadena u objeto);
         // el manifest y el panel los escribe el compilador y los valida el juez oficial.
         try {
           let brutoReceta: any = args?.receta ?? args;
           if (typeof brutoReceta === "string") {
             try { brutoReceta = JSON.parse(brutoReceta); }
             catch { return JSON.stringify({ ok: false, motivo: "la receta no es JSON válido. Reenvía la receta como objeto JSON limpio (sin texto alrededor)." }); }
           }
           const existentes = fs.existsSync(EXTENSIONS_DIR) ? fs.readdirSync(EXTENSIONS_DIR) : [];
           const nr = normalizarReceta(brutoReceta, existentes);
           if (!nr.ok) return JSON.stringify({ ok: false, motivo: "receta tachada: " + nr.motivos.join(" · ") + ". Corrígela y reenvíala: nada fue escrito." });
           const archivosForj = generarArchivos(nr.receta);
           const vmf = validateManifest(JSON.parse(archivosForj[0].content));
           if (!vmf.ok) return JSON.stringify({ ok: false, motivo: "bug del compilador (no tuyo): " + vmf.errors.join("; ") });
           const dir = path.join(EXTENSIONS_DIR, nr.receta.id);
           fs.mkdirSync(dir, { recursive: true });
           for (const a of archivosForj) fs.writeFileSync(path.join(dir, a.path), a.content, "utf8");
           return JSON.stringify({ ok: true, creado: nr.receta.id, uso: instruccionUso(nr.receta) });
         } catch (e: any) {
           return JSON.stringify({ ok: false, motivo: "forja falló: " + String((e && e.message) || e) });
         }
       }
       case "abrir_red": {
         // v1.0.28 — UNA PETICIÓN PARA TODAS LAS PREGUNTAS. Dos clases de entrada:
         // preguntas (se pliegan en UNA consulta de búsqueda) y URLs (se leen por
         // separado, pero EN PARALELO y en el mismo turno). Antes de salir a la
         // red se exige `confirmar:true`, igual que buscar_web: no se toca la red
         // sin que el usuario lo haya pedido.
         const crudas: string[] = Array.isArray(args?.preguntas) ? args.preguntas.map((x: any) => String(x ?? "")) : [String(args?.preguntas ?? "")];
         const esUrl = (t: string) => /^https?:\/\//i.test(t.trim());
         const urls = crudas.filter(esUrl).map((u) => u.trim());
         const preguntas = crudas.filter((p) => !esUrl(p));
         const r = reformular(preguntas, { maxPreguntas: 6 });
         if (args?.confirmar !== true) {
           return JSON.stringify({
             ok: false,
             estado: "REQUIRE_CONFIRMACION",
             consulta_reformulada: r.consulta,
             plegadas: r.plegadas,
             fuera: r.fuera,
             hint: "Reformulación ya hecha (no se envió nada). Si el usuario autoriza la búsqueda, repite la llamada con confirmar:true.",
           });
         }
         if (!r.consulta && urls.length === 0) {
           return JSON.stringify({ ok: false, error: "No hay nada que buscar: llegan preguntas vacías o solo signos.", descartadas: r.vacias });
         }
         const partes: any[] = [];
         // Las URLs: en paralelo, con la misma guarda SSRF que fetch_url.
         if (urls.length) {
           const lecturas = await Promise.all(
             urls.slice(0, 4).map(async (u) => {
               try {
                 const parsed = new URL(u);
                 const host = parsed.hostname.toLowerCase();
                 if (["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(host) || /\.local$/.test(host) || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
                   return { url: u, ok: false, error: "dirección interna bloqueada por seguridad" };
                 }
                 const c = new AbortController();
                 const t = setTimeout(() => c.abort(), 15000);
                 try {
                   const resp = await fetch(u, { signal: c.signal, headers: { "User-Agent": "CerebroNico-IDE/2.0" } });
                   const bruto = await resp.text();
                   const texto = bruto.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                   return { url: u, ok: resp.ok, status: resp.status, content: texto.slice(0, 4000) };
                 } finally {
                   clearTimeout(t);
                 }
               } catch (e: any) {
                 return { url: u, ok: false, error: `no se pudo leer: ${e?.message || e}` };
               }
             })
           );
           partes.push({ tipo: "paginas", leidas: lecturas });
         }
         // La consulta única: UNA salida a la red para todas las preguntas.
         if (r.consulta) {
           const c = new AbortController();
           const t = setTimeout(() => c.abort(), 20000);
           try {
             const urlBusqueda = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(r.consulta)}`;
             const resp = await fetch(urlBusqueda, { signal: c.signal, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CerebroNico/2.0" } });
             const html = await resp.text();
             // Extracción sobria de resultados: título + enlace + migaja.
             const resultados: Array<{ titulo: string; url: string }> = [];
             const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
             let m: RegExpExecArray | null;
             while ((m = re.exec(html)) && resultados.length < 8) {
               const titulo = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
               let enlace = m[1];
               // DuckDuckGo envuelve el destino: se saca el real de uddg=.
               const dentro = /[?&]uddg=([^&]+)/.exec(enlace);
               if (dentro) { try { enlace = decodeURIComponent(dentro[1]); } catch {} }
               if (titulo && /^https?:/i.test(enlace)) resultados.push({ titulo, url: enlace });
             }
             partes.push({ tipo: "busqueda", consulta: r.consulta, status: resp.status, resultados });
           } catch (e: any) {
             partes.push({ tipo: "busqueda", consulta: r.consulta, ok: false, error: `No se pudo buscar: ${e?.message || e}` });
           } finally {
             clearTimeout(t);
           }
         }
         // v1.0.29 — RESULTADOS PARCIALES: una URL caída o un buscador que no
         // responde NO puede convertir la llamada entera en «falló». Se declara
         // cuántas partes salieron y cuáles fallaron, con su motivo, para que el
         // modelo sepa qué tiene y qué le falta en vez de repetir todo el trabajo.
         const paginas = partes.find((x: any) => x.tipo === "paginas")?.leidas || [];
         const leidas = paginas.filter((x: any) => x.ok).length;
         const caidas = paginas.filter((x: any) => !x.ok);
         const busqueda = partes.find((x: any) => x.tipo === "busqueda");
         const buscaOk = !busqueda || busqueda.ok !== false;
         return JSON.stringify({
           ok: leidas > 0 || buscaOk,
           una_sola_peticion: true,
           preguntas_cubiertas: r.incluidas,
           plegadas: r.plegadas,
           fuera: r.fuera,
           descartadas: r.vacias,
           resumen: { paginas_pedidas: paginas.length, paginas_leidas: leidas, paginas_caidas: caidas.length, busqueda: buscaOk ? (busqueda?.resultados?.length || 0) : "falló" },
           fallidas: caidas.map((x: any) => ({ url: x.url, motivo: x.error })),
           partes,
           hint: !buscaOk && leidas === 0
             ? "No se pudo ni leer las páginas ni buscar: es un problema de red del equipo, no de la consulta. No repitas la llamada igual; avisá al usuario."
             : (r.fuera.length ? `Quedaron ${r.fuera.length} pregunta(s) fuera por el tope: si las necesitás, hacé una segunda llamada SOLO con ellas.` : undefined),
         });
       }
       case "fetch_url": {
         const url = String(args?.url || "");
         const maxChars = Math.max(500, Math.min(20000, Number(args?.max_chars) || 6000));
         // Guarda SSRF: solo http/https públicos, nunca direcciones internas.
         // El modelo no debe poder usarse para sondear la red local del usuario.
         if (!/^https?:\/\//i.test(url)) return JSON.stringify({ ok: false, error: "Solo se permiten URLs http/https." });
         try {
           const u = new URL(url);
           const host = u.hostname.toLowerCase();
           const isPrivate =
             host === "localhost" ||
             host === "127.0.0.1" ||
             host === "0.0.0.0" ||
             host === "[::1]" ||
             host.endsWith(".local") ||
             /^10\./.test(host) ||
             /^192\.168\./.test(host) ||
             /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
             /^169\.254\./.test(host);
           if (isPrivate) return JSON.stringify({ ok: false, error: "Dirección interna bloqueada por seguridad." });
         } catch {
           return JSON.stringify({ ok: false, error: "URL no válida." });
         }
         const controller = new AbortController();
         const t = setTimeout(() => controller.abort(), 15000);
         try {
           const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "CerebroNico-IDE/2.0" } });
           const raw = await res.text();
           const text = raw
             .replace(/<script[\s\S]*?<\/script>/gi, " ")
             .replace(/<style[\s\S]*?<\/style>/gi, " ")
             .replace(/<[^>]+>/g, " ")
             .replace(/\s+/g, " ")
             .trim();
           return JSON.stringify({ ok: res.ok, status: res.status, url, content: text.slice(0, maxChars) });
         } catch (e: any) {
           return JSON.stringify({ ok: false, error: `No se pudo descargar: ${e?.message || e}` });
         } finally {
           clearTimeout(t);
         }
       }
       default: {
         const spec = getToolSpec(name);
         // v1.16.1 — ¿Pertenece a un PACK EXTERNO (servidores MCP del puente,
         // microservicios con GET /tools + POST /tools/call)? Se reenvía tal
         // cual: ni el bucle del agente ni este interruptor crecen por pack.
         if (spec) {
           const rp = remotePackEndpoints.get(spec.pack);
           if (rp) {
             const control = new AbortController();
             const t = setTimeout(() => control.abort(), 45000);
             try {
               const resp = await fetch(`${rp.url}/tools/call`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json", ...rp.headers },
                 body: JSON.stringify({ name, arguments: args ?? {} }),
                 signal: control.signal,
               });
               const data = await resp.json().catch(() => null);
               if (!resp.ok) {
                 return JSON.stringify({ ok: false, error: `El pack remoto "${spec.pack}" respondió HTTP ${resp.status}`, detalle: data ?? undefined });
               }
               return JSON.stringify(data ?? { ok: false, error: `El pack remoto "${spec.pack}" respondió no-JSON` });
             } catch (e: any) {
               return JSON.stringify({ ok: false, error: `Pack remoto "${spec.pack}" no disponible: ${String((e && e.message) || e)}` });
             } finally {
               clearTimeout(t);
             }
           }
         }
         // ¿Es una herramienta aportada por una extensión? Se reenvía a su
         // pestaña (iframe) y se espera el resultado, que vuelve por la cola
         // de invocaciones. El modelo la ve como cualquier otra herramienta.
         if (spec && spec.pack.startsWith("ext:")) {
           const extId = spec.pack.slice(4);
           if (!openExtensionPanels.has(extId)) {
             return JSON.stringify({
               ok: false,
               error: `La extensión "${extId}" no tiene su pestaña abierta: ábrela para usar "${name}".`,
             });
           }
           const m = extensionRegistry.get(extId);
           const contrib = m ? listToolContributions(m).find((t) => t.name === name) : undefined;
           const command = contrib?.handler ? contrib.handler.replace(/^command:/, "") : name;
           const r = await invokeExtension(extId, command, args);
           return JSON.stringify(r.ok ? { ok: true, result: r.result } : { ok: false, error: r.error });
         }
         return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
       }
    }
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}

/**
 * v1.0.20 · EL CONTEXTO QUE EL MODELO DECLARA (`POST /api/show`).
 * Devuelve null si esta versión de Ollama no lo reporta o si no contesta en 1,5 s:
 * el bucle de agente NUNCA se bloquea esperando un dato opcional.
 */
async function contextoDeclaradoDeOllama(targetUrl: string, modelo: string): Promise<number | null> {
  try {
    const r = await fetch(`${targetUrl}/api/show`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: modelo }), signal: AbortSignal.timeout(1500) });
    return r.ok ? contextoDeclaradoDeShow(await r.json()) : null;
  } catch { return null; }
}

async function callOllamaNonStreaming(
  targetUrl: string,
  model: string,
  messages: any[],
  temperature: number,
  isAborted: () => boolean,
  tools: any[]
): Promise<any | null> {
  const maxAttempts = 3;
  let lastErr: any = null;
  // v1.0.15/1.0.16 · system-first + ventana que crece a TOPE_CTX_RAM + recorte a num_ctx en un paso (server/normalizarOllama.sanearYVentana): evita el «System message must be at the beginning» de qwen3.5 y el 500 por contexto desbordado.
  const opcionesOllamaAgente = buildOllamaOptions(model, temperature, CPU_CORES, RAM_GB);
  const mensajesOllamaAgente = sanearYVentana(messages, opcionesOllamaAgente as any, TOPE_CTX_RAM, (m) => console.log(m), await contextoDeclaradoDeOllama(targetUrl, model)); // v1.0.20 · el techo que DECLARA el modelo manda: era el 400 «17929 > 8192» de qwen3.5:4b
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isAborted()) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_CONNECT_TIMEOUT_MS); // v1.57.6: mismo techo que el chat (120s cortaba antes que Ollama)
    try {
      const res = await fetch(`${targetUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: mensajesOllamaAgente, // v1.0.15 · system-first + recortado a la ventana
          stream: false,
          // keep_alive: deja el modelo cargado en RAM (evita recargas lentas que cuelgan la UI)
          keep_alive: getProfile(model).keepAlive,
          tools,
          // v2.0 — el bucle de agente usa las mismas opciones por perfil que el
          // streaming: contexto y tope de salida acordes al tamaño del modelo.
          options: opcionesOllamaAgente,
        }),
      });
      if (res.ok) return await res.json();
      if (RETRYABLE_HTTP_STATUS.has(res.status)) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleepMs(150 * (attempt + 1));
        continue;
      }
      lastErr = new Error(`HTTP ${res.status}`);
      break;
    } catch (err: any) {
      lastErr = err;
      if (attempt < maxAttempts - 1) await sleepMs(150 * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }
  if (lastErr) console.warn(`Ollama (agente) no disponible en ${targetUrl}:`, lastErr.message);
  return null;
}

// ============================================================================
// v1.62.0 · LA VENTANILLA VIVE A NIVEL DE SESIÓN (no de turno)
// ----------------------------------------------------------------------------
// 🐞 El defecto de v1.61.0: la ventanilla de reescritura entre-turnos se creaba
// DENTRO del handler (`crearVentanilla(...)` en cada turno), así que el
// historial de turnos anteriores nacía vacío SIEMPRE y el corte entre-turnos
// —la razón de ser del módulo— jamás podía dispararse. Un contador «entre
// turnos» que se reinicia cada turno es un contador que miente: parece vigilar
// y no vigila. En el log real los 34 rechazos venían AGRUPADOS turno a turno y
// el usuario encadenaba sin que nadie cortara.
//
// El backend de la IDE es de UNA sesión (no hay sessionId en el bucle: es el
// proceso quien ES la sesión), así que la ventanilla correcta es un singleton
// de módulo que SOBREVIVE a los turnos. Cada turno llama `abrirTurno()` al
// arrancar para rotar la ventana (un turno limpio drena el historial y rompe
// la racha → ese es el control de falso positivo que ya trae el módulo puro).
//
// Se comparte entre la rama Ollama y la rama Gemini a propósito: el usuario que
// insiste con la misma reescritura es el mismo usuario cambie o no de motor.
// ============================================================================
const ventanillaSesion = crearVentanilla(0); // v1.62.0 — memoria de sesión, sobrevive a los turnos
// v1.65.0 — EL BUCLE QUE SOBREVIVE A LOS TURNOS (mismo motivo que la ventanilla de v1.62): un detector que
// nace vacío en cada turno no ve al modelo que, tras un «sigue», vuelve a girar EL MISMO ciclo. Singleton de
// módulo compartido por ambas ramas; cada turno llama `abrirTurnoBucle()` (un turno con obra o sin bucle lo drena).

/**
 * v1.22.0 · MOTOR VIVO — EL ENVOLTORIO. El bucle tiene siete caminos de salida;
 * espejar en cada uno era la receta para dejar una tarea en curso eterna en el
 * panel. Con `try/finally` la hoja se cierra SIEMPRE y con veredicto honesto.
 */
async function runOllamaAgentLoop(
  targetUrl: string,
  model: string,
  initialMessages: any[],
  temperature: number,
  isAborted: () => boolean,
  onTask?: (event: any) => void,
  tools?: any[]
): Promise<string | null> {
  try {
    abrirTurnoVivo(objetivoDesdeMensajes(initialMessages));
    marcarActividadDelMotor(); // v1.57.19 · hay un turno vivo: la sonda fantasma espera, no compite con el usuario
    return await cuerpoBucleAgente(targetUrl, model, initialMessages, temperature, isAborted, onTask, tools);
  } finally {
    cerrarTurnoVivo();
  }
}

async function cuerpoBucleAgente(
  targetUrl: string,
  model: string,
  initialMessages: any[],
  temperature: number,
  isAborted: () => boolean,
  onTask?: (event: any) => void,
  tools?: any[]
): Promise<string | null> {
  const messages = initialMessages.map((m) => ({ ...m }));
  // v1.0.20 · EL TECHO DEL MODELO, UNA VEZ POR TURNO: `/api/show` declara el contexto
  // real (p. ej. 8192 en qwen3.5:4b). Se lee aquí y no en cada paso porque el
  // nombre del modelo no cambia dentro del turno; si Ollama no lo reporta queda
  // null y no se inventa nada (esa es la diferencia entre techo y capricho).
  const contextoRealModelo = await contextoDeclaradoDeOllama(targetUrl, model);
  let maxSteps = PASOS_BASE; // v1.16.0: crece con el plan, topado por bucleAutonomo
  const plan: TareaPlan[] = [];
  const notaPrev = notaContinuidad(); if (notaPrev) messages.push({ role: "system", content: notaPrev }); // B1.2
  const notaHuecos = notaHuecosConocidos(); if (notaHuecos) messages.push({ role: "system", content: notaHuecos }); // v1.57.11 · el acta roja del turno anterior viaja como aviso: la certeza ya no nace de la amnesia
  // v1.22.1 · ORDEN DE OBRA: la lista de archivos la hace el MOTOR, no el modelo, y entra
  // como system antes del paso 0. El manifiesto y la sonda cierran la certeza en el disco.
  const listarArchivosMotor = async (): Promise<string[]> => { try { const j = JSON.parse(await executeToolCall("list_files", {})); return Array.isArray(j?.files) ? j.files : []; } catch { return []; } }; // v1.57.11 · los mismos ojos al abrir y al cerrar el turno
  let listadoReal: string[] = await listarArchivosMotor();
  messages.push({ role: "system", content: directivaDeObra(formatearListado(listadoReal), notaDeContexto(PROJECT_ROOT)) });
  const manifiestoObra: ManifiestoObra = new Map();
  manifiestoObraVivoQf = manifiestoObra;
  const sondaObra: SondaDisco = (p) => { try { const st = fs.statSync(resolveSafePath(p)); return { existe: true, esCarpeta: st.isDirectory(), bytes: st.size }; } catch { return { existe: false, esCarpeta: false, bytes: 0 }; } };
  let ultimoFallo: UltimoFallo | null = null;
  // v1.16.3.1 · AUTOMATISMO CONSCIENTE: el bucle sabe qué fase vive (crear /
  // modificar / reparar) y cuánta insistencia lleva cada herramienta.
  const fallosPorHerramienta: Record<string, number> = {};
  const historialBucle: { nombre: string; ok: boolean }[] = [];
  let lastContent = "";
  // v1.28.0 · Tarea 3 — LIBRO DE ACTAS: cada decisión del juez del bucle queda
  // anotada aquí para poder auditar después por qué un turno dio N vueltas y en
  // qué escalón de reparación se quedó. Capa pura (auditoriaBucle.ts).
  const registroAuditoria: RegistroAuditoria = crearRegistroAuditoria(`turno-${Date.now()}`);
  const turnoIdActual = Date.now(); // v1.61.0 — id del turno para la ventanilla de sesión

  // v1.57.9 — LAZO FIRME, NO LETAL (reemplaza al corte duro de 3 repeticiones
  // que mataba el turno entero: sesión 14/10, mensajes 27-33, donde TODO
  // mensaje nuevo respondía «Detenido» sin obra ni explicación).
  let guardiaO: EstadoRepeticion = { ...REPETICION_SIN_VER };
  let intervencionesO = 0;
  const salidaPorClaveO = new Map<string, string>();
  // v1.63.0 — libro de firmas de lectura del turno (dedupe de relectura idéntica).
  const lectorO: EstadoLectura = nuevoEstadoLectura();
  let lazoLecturaO = "";
  // v1.64.0 FASE 3: detector de ciclos VISIBLE. v1.65.0: SOBREVIVE a los turnos (singleton + rotación).
  const contextoBucleO: EstadoContextoBucle = contextoBucleSesion; abrirTurnoBucle(contextoBucleO); abrirTurnoPropuestas(); // v1.76.0 · el contador de patrones también abre turno
  let avisoBucleO = ""; let lazoBucleO = "";
  let lazoAgotadoO = "";
  let avisoReescrituraO = ""; let reescriturasIdenticasO = 0; const rutasReescritasO: string[] = []; // v1.60.17
  // v1.62.0 — la ventanilla YA NO se crea aquí (eso borraba la memoria cada
  // turno). Se usa el singleton de sesión y se ROTA al arrancar el turno.
  const ventanillaO = ventanillaSesion; abrirTurno(ventanillaO, turnoIdActual);
  const vigilanteO = nuevoVigilanteArgs(); // v1.57.10
  // v1.23.0 · CONTROL DE CIERRE DENTRO DEL TURNO: cuántas veces se reabrió el
  // turno porque las puertas del quirófano quedaron rojas. Tope 2 para no
  // convertir el cierre en persiana.
  let rondasCierreDeObra = 0;
  // v1.57.11 · LA CERTEZA TIENE MANOS: rondas de rescate por promesas sin disco (tope 2),
  // prórrogas del techo (tope 1) y evidencia de obra verificada que las autoriza.
  let rondasRescateCerteza = 0, prorrogasTecho = 0, prorrogaExtra = 0, ultimaObraBytes = 0;

  // v1.23.0 · Acta extendida: ORDEN DE OBRA (certeza en disco) + COMPLETITUD
  // (plan ↔ manifiesto ↔ disco: prometidos sin escribir, enlaces al vacío,
  // 0 bytes, truncados, hueco de arranque). El usuario pidió apps COMPLETAS;
  // un acta que sólo cuenta los escritos y calla los faltantes es publicidad.
  const actaExtendida = (): string => {
    let acta = cierreDeObra(manifiestoObra, sondaObra);
    try {
      const vered = calcularCompletitud();
      if (vered) {
        const informe = informeCompletitud(vered);
        if (informe) acta += `\n\n${informe}`;
      }
    } catch (err: any) {
      console.warn(`[CerebroNico] completitud no corrió (${err?.message || err})`);
    }
    return acta;
  };

  // v1.49.0 · FASE 2 — el contraste plan↔manifiesto↔disco, extraído para que lo
  // compartan el acta extendida y el fiscal del último metro (una sola verdad).
  const calcularCompletitud = (): ReturnType<typeof verificarCompletitud> | null => {
    const rutasEscritas = [...manifiestoObra.keys()];
    if (rutasEscritas.length === 0 && plan.length === 0) return null;
    return verificarCompletitud({
      rutasPlan: rutasMencionadasEnPlan(plan),
      manifiesto: manifiestoObra,
      rutasEscritas,
      htmls: rutasEscritas.filter((r) => /\.html?$/i.test(r)),
      sonda: sondaObra,
      leer: (r) => { try { return fs.readFileSync(resolveSafePath(r), "utf-8"); } catch { return null; } },
    });
  };

  // v1.49.0 · FASE 2 — prompt del usuario de este turno (para que el fiscal sepa
  // si es una tarea pesada y active las 5 casillas del §8).
  const promptUsuarioFiscal: string = (() => {
    try {
      const u = [...initialMessages].reverse().find((m) => m && m.role === "user");
      return typeof u?.content === "string" ? u.content : "";
    } catch { return ""; }
  })();

  for (let step = 0; step < maxSteps; step++) {
    if (isAborted()) return null;

    const resp = await callOllamaNonStreaming(targetUrl, model, messages, temperature, isAborted, vigilanteO.seguidos >= UMBRAL_SIN_HERRAMIENTAS ? [] : tools || AGENT_TOOLS);
    if (resp === null) return null;

    const msg = resp.message || {};
    const toolCalls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    const content: string = typeof msg.content === "string" ? msg.content : "";
    if (content) lastContent = content;

    if (toolCalls.length === 0) {
      // v1.16.0 — el juez determinista decide si esto es el fin o una parada a
      // mitad: plan abierto, permiso pedido, frase cortada, intención sin
      // ejecutar o un fallo reciente que hay que resolver cambiando de camino.
      // v1.49.0 · FASE 2 — EL FISCAL DEL ÚLTIMO METRO. Antes de que el juez
      // decida, se arma el dictamen con las fuentes únicas del turno (contrato,
      // tablero de evidencias, acta, completitud) y se adjunta a la señal. Si
      // algo falla, el fiscal se omite y el bucle decide como siempre (cero
      // regresión).
      let dictamenFiscal: DictamenFiscal | null = null;
      try {
        dictamenFiscal = fiscalizar({
          texto: content,
          tareaPesada: pareceTareaPesada(promptUsuarioFiscal),
          contrato: estadoContrato(),
          evidencias: estadoEvidencias(),
          acta: actaDelTurno(),
          completitud: calcularCompletitud(),
          ultimoFallo: ultimoFallo ? { herramienta: ultimoFallo.herramienta, error: ultimoFallo.error } : null,
        });
      } catch { dictamenFiscal = null; }
      const parteM = parteMatrizPanel(dictamenFiscal); if (parteM && onTask) onTask({ type: "log", message: parteM } as any); const d = decidirBucle({ contenido: content, plan, paso: step, maxPasos: maxSteps, ultimoFallo, fallosPorHerramienta, historialBucle, fiscal: dictamenFiscal });
      // v1.28.0 · Tarea 3 — se anota TODA decisión (continuar o cerrar), con la
      // herramienta cuyo último fallo motivó la reparación, si la hubo.
      registrarDecisionAuditoria(registroAuditoria, step, d, { herramientaFallo: ultimoFallo?.herramienta });
      if (d.accion === "continuar") {
        const nota = `🔁 [${d.fase}${d.escalon > 0 ? ` · escalón ${d.escalon}` : ""}] ${d.motivo} — sigo sin que me lo pidas`;
        if (onTask) onTask({ type: "log", message: nota } as any);
        anotarVivo(nota); // MOTOR VIVO: el juez también se ve en el panel
        messages.push({ role: "user", content: d.directiva });
        continue;
      }
      // v1.57.11 · LA CERTEZA TIENE MANOS — el acta roja ya no espera al funeral: si el
      // disco desmiente una promesa de la herramienta, el turno SE REABRE con la orden
      // dura (tope 2 rondas); la prórroga del techo (única, solo con obra verificada) y
      // el RECORDATORIO del hueco para el turno siguiente viven en módulos puros:
      // ordenDeObra.decidirAperturaCierre y bucleAutonomo.concederProrrogaTecho.
      if (manifiestoObra.size > 0 || plan.length > 0) {
        const huecosTurno = huecosDeCerteza(manifiestoObra, sondaObra, await listarArchivosMotor());
        registrarHuecosConocidos(huecosTurno); // el disco manda en cómo cierra el turno, verde o rojo
        const veredC = calcularCompletitud();
        const apertura = decidirAperturaCierre({ huecos: huecosTurno, faltantes: veredC && !veredC.ok ? [...veredC.prometidoFalta, ...veredC.enlacesRotos, ...veredC.arranque, ...veredC.pwa] : [], rondasUsadas: rondasRescateCerteza });
        if (apertura && apertura.tipo === "rescate") {
          rondasRescateCerteza++;
          if (onTask) onTask({ type: "log", message: apertura.nota } as any);
          anotarVivo(apertura.nota);
          messages.push({ role: "user", content: apertura.directiva });
          continue;
        }
        const obraBytes = bytesObraEnDisco(manifiestoObra, sondaObra);
        const prorroga = concederProrrogaTecho({ pendientes: tareasPendientes(plan), paso: step, maxPasos: maxSteps, obraBytes, ultimaObraBytes, prorrogasUsadas: prorrogasTecho });
        if (prorroga) {
          const extra = Math.max(1, prorroga.nuevoTope - maxSteps);
          prorrogasTecho++; ultimaObraBytes = obraBytes; prorrogaExtra = Math.max(prorrogaExtra, extra); maxSteps = prorroga.nuevoTope;
          const notaP = `🔁 PRÓRROGA DEL TECHO — el motor contó ${obraBytes} bytes de obra verificada: la tarea no muere a mitad (+${extra} pasos, prórroga única)`;
          if (onTask) onTask({ type: "log", message: notaP } as any);
          anotarVivo(notaP);
          messages.push({ role: "user", content: prorroga.directiva });
          continue;
        }
      }
      // v1.28.0 · Tarea 3 — el turno se cierra aquí: si hubo reparación, el acta
      // del bucle sale al panel/registro para poder auditarla (no se afirma lo
      // que no se puede auditar).
      if (huboReparacion(registroAuditoria)) {
        const acta = formatearAuditoria(registroAuditoria);
        if (onTask) onTask({ type: "log", message: acta } as any);
        try { anotarVivo(acta); } catch {}
      }
      // ══════════════════════════════════════════════════════════════════════
      // v1.23.0 · CONTROLAR CIERRE DE OBRA — el motor ya no dice «listo» con
      // obra roja. El defecto medido (v1.22.2): la tanda la cerraba un
      // temporizador diferido que corría DESPUÉS de contestar; si la puerta
      // caía y revertía, el modelo nunca se enteraba y el usuario leía un
      // «listo» sobre archivos revertidos («quedan rotas, no puede
      // repararlas»). Ahora, cuando el modelo quiere terminar, el motor CIERRA
      // la tanda aquí, con las puertas sobre el disco: si queda roja y hay
      // rondas disponibles, REABRE el turno con la orden concreta en vez de
      // devolver el «listo». (2 rondas máximas: después, el acta roja se
      // entrega tal cual — honesta, no silenciada.)
      // ══════════════════════════════════════════════════════════════════════
      // v1.70.6 · EL PLAN DE PALABRAS LLEGA AL PLANIFICADOR (bucle local Ollama).
      // Toda la lógica vive en el espejo (publicarPlanDePalabras): la valla
      // «el monolito no gana logica» de motorVivo cuenta las llamadas de espejo
      // aca y no perdona una de mas. El monolito solo pregunta y reenvia.
      try {
        const planPalabrasO = publicarPlanDePalabras(String(content || lastContent || d.informe || ""));
        if (planPalabrasO) {
          if (onTask) onTask({
            type: "plan",
            tasks: planPalabrasO.map((t) => ({ id: t.id, description: t.description, status: "pending" })),
          } as any);
          console.log(`[bucle Ollama] 🗒 plan declarado de palabra: ${planPalabrasO.length} etapa(s) → Planificador`);
        }
      } catch { /* el espejo es auxiliar: jamás corta un turno bueno */ }

      if (manifiestoObra.size > 0 || operacionQf) {
        const cierreObra = await cerrarTurnoQf("cierre dentro del turno");
        if (cierreObra && (!cierreObra.ok || cierreObra.revertido)) {
          if (rondasCierreDeObra < 2) {
            rondasCierreDeObra += 1;
            const nota = `⛔ CIERRE DE OBRA: puertas rojas → turno reabierto (ronda ${rondasCierreDeObra}/2)`;
            console.log(`[CerebroNico] ${nota} — ${cierreObra.motivo}`);
            if (onTask) onTask({ type: "log", message: nota } as any);
            anotarVivo(nota);
            messages.push({ role: "user", content: directivaDeCierreRojo(cierreObra.informe, rondasCierreDeObra) });
            continue;
          }
          const actaRoja =
            (content || lastContent || d.informe) +
            `\n\n⚠️ [CIERRE DE OBRA — el motor NO puede decir «listo»: las puertas quedaron rojas y se agotaron las 2 rondas de reparación. ${cierreObra.motivo}]` +
            "\n\n" + cierreObra.informe.slice(0, 2600);
          return actaRoja + actaExtendida();
        }
        const puertasVerdes = cierreObra
          ? `\n\n[🩺 QUIRÓFANO — puertas cerradas DENTRO del turno: VERDE · ${cierreObra.motivo}]`
          : "";
        // v1.22.1 · el cierre del turno lleva el acta de obra: certeza resuelta en disco.
        return (content || lastContent || d.informe) + puertasVerdes + actaExtendida();
      }
      return (content || lastContent || d.informe) + actaExtendida();
    }

    messages.push({ role: "assistant", content: content || "", tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const fnName = tc.function?.name;
      // v1.57.9 — parseo CON ESTADO: un JSON a medias (tope de tokens del
      // modelo) ya no se confunde con «sin argumentos». Antes se ejecutaba con
      // args={} y de ahí salían los archivos vacíos o duplicados de la sesión.
      const estadoArgs = parsearArgsConEstado(tc.function?.arguments);
      const args: any = estadoArgs.ok ? estadoArgs.args : {};
      if (!estadoArgs.ok && estadoArgs.truncado) {
        messages.push({ role: "tool", content: DIRECTIVA_TRUNCAMIENTO });
        continue;
      }

      // LAZO SUAVE: 3ª llamada idéntica → no se ejecuta; se devuelve al modelo
      // el resultado que YA tenía + orden de cambiar. Solo tras 3
      // intervenciones estériles se cierra el turno (con aviso honesto abajo).
      const toolKey = `${fnName}:${tc.function?.arguments || ""}`;
      guardiaO = anotarRepeticion(guardiaO, toolKey);
      if (guardiaO.veces >= UMBRAL_REPETICION) {
        intervencionesO++;
        if (intervencionesO > TOPE_INTERVENCIONES) { lazoAgotadoO = fnName; break; }
        messages.push({ role: "tool", content: directivaRepeticion(fnName, guardiaO.veces, salidaPorClaveO.get(toolKey) || "") });
        continue;
      }

      // Emitir eventos de tarea para el tablero (plan / estado)
      if (onTask) {
        if (fnName === "set_plan" && Array.isArray(args.tasks)) {
          onTask({
            type: "plan",
            tasks: args.tasks.map((t: any, i: number) => ({
              id: String(t?.id || `t${i + 1}`),
              description: String(t?.description || ""),
              status: "pending",
            })),
          });
        } else if (fnName === "update_task") {
          onTask({
            type: "update",
            taskId: String(args.task_id || args.taskId || ""),
            status: args.status,
          });
        }
      }

      // Qué es este paso, en las palabras que caben en el panel: la ruta, el
      // comando o el bulto de lo que se escribe.
      const detallePaso =
        args?.path ? String(args.path)
        : args?.command ? String(args.command).slice(0, 80)
        : args?.content ? `(${String(args.content).length} bytes)`
        : fnName === "list_files" ? "sandbox .proyectos"
        : "";

      // MOTOR VIVO: se espeja aunque NO haya oyentes en el tablero del chat.
      if (fnName === "set_plan" && Array.isArray(args.tasks)) declararPlanVivo(args.tasks);
      else if (fnName === "update_task") marcarTareaVivo(String(args.task_id || args.taskId || ""), args.status, Date.now(), args.evidencia); // v1.32.0 · contrato: la evidencia viaja con el cierre
      empezarPasoVivo(String(fnName), detallePaso);

      // Emitir evento de acción para el log visible del agente (qué herramienta usa y sobre qué)
      if (onTask) onTask({ type: "action", action: { tool: fnName, detail: detallePaso, ok: true } });

      const result = await executeToolCall(fnName, args);

      // ============================================================
      // FASE 2 — DISCIPLINA DE CONTEXTO EN EL MOTOR
      // El resultado de la herramienta se COMPACTA antes de devolverlo al
      // modelo: leer un archivo de 600 líneas o un log de 400 no debe llenar la
      // ventana del siguiente turno (con 8 GB de RAM eso es la diferencia entre
      // responder y quedarse colgado). Los errores NO se compactan nunca: el
      // modelo necesita el mensaje completo para corregir.
      // ============================================================
      let isError = false;
      try {
        isError = JSON.parse(result)?.ok === false;
      } catch {
        isError = false;
      }
      // MOTOR VIVO: el paso cierra con el resultado REAL, no con la prosa.
      terminarPasoVivo(!isError, isError ? String(result).slice(0, 200) : null);
      const compacted = compactToolResult(fnName, result, isError);
      // v1.63.0 — GUARDA DE REPETICIÓN DE SOLO-LECTURA. Se mide sobre la salida
      // CRUDA (`result`), que es la que se repite byte a byte; la excepción de
      // relectura-tras-escritura la cubre `registrarEscrituraLectura` (abajo,
      // para las herramientas de obra) + la lógica del propio módulo.
      registrarEscrituraLectura(lectorO, esHerramientaDeObra(fnName) && !isError, args?.path ? String(args.path) : undefined);
      const veredL = isError
        ? { veces: 0, deduplicar: false, cortar: false as boolean, nota: undefined as string | undefined }
        : evaluarLectura(lectorO, fnName, tc.function?.arguments || "", result, args?.path ? String(args.path) : undefined);
      let contenidoToolO = compacted.output;
      if (veredL.deduplicar && veredL.nota) {
        contenidoToolO = veredL.nota;
        if (onTask) onTask({ type: "log", message: `🔁 ${fnName}: ${veredL.veces}ª lectura idéntica — volcado omitido` } as any);
      } else if (compacted.note && onTask) {
        onTask({ type: "log", message: `🧠 ${fnName}: ${compacted.note}` } as any);
      }
      messages.push({ role: "tool", content: contenidoToolO });
      salidaPorClaveO.set(toolKey, contenidoToolO); // v1.57.9 — cache para el lazo suave
      if (veredL.cortar) { lazoLecturaO = fnName; break; } // v1.63.0 — bucle de relectura estéril
      if (esRechazoReescrituraIdentica(contenidoToolO)) { reescriturasIdenticasO++; if (args?.path) rutasReescritasO.push(String(args.path)); const veredS = registrarRechazo(ventanillaO, turnoIdActual); if (veredS.cortar) { avisoReescrituraO = cierreEntreTurnos(veredS.motivo, rutasReescritasO); break; } if (reescriturasIdenticasO >= TOPE_REESCRITURA_IDENTICA) { avisoReescrituraO = cierrePorReescrituraIdentica(rutasReescritasO); break; } } // v1.60.17 corte por turno · v1.61.0 corte por sesión
      // v1.57.10 — si el fallo es de ARGUMENTOS, el vigilante cuenta; al 3º
      // seguido se retiran las herramientas del request y se le dice al modelo
      // por qué (cerrar en texto honesto > reintentar para siempre).
      {
        const vfO = registrarFalloArgs(vigilanteO, isError, String(result));
        if (vfO.justoAlCruzarlo) messages.push({ role: "user", content: DIRECTIVA_SIN_HERRAMIENTAS });
      }

      // ============================================================
      // FASE 2 — EL MOTOR APRENDE DE SUS PROPIOS FALLOS
      // Cada error real de una herramienta se registra como entrada de la base
      // de conocimiento (deduplicada y acotada). A partir de ahí, el motor ya
      // sabe que ese fallo existe y qué hacer: no depende de que el modelo lo
      // recuerde ni de que alguien escriba documentación a mano.
      // ============================================================
      if (isError) {
        learnFromToolFailure(fnName, args, result);
      }
      // v1.16.3.1 — memoria de fase del turno: un éxito limpia el contador de
      // ESA herramienta; el historial dice si ya hay obra propia (modificar).
      // v1.74.0 · AUTOAPRENDIZAJE EN TIEMPO REAL: si la herramienta acaba de
      // funcionar DESPUÉS de haber fallado en este lazo, la pareja
      // (causa que dolía → argumentos que resolvieron) se anota YA como
      // lección en LECCIONES.md + KB. Es el momento exacto en que el motor
      // aprende algo: antes se perdía al cerrar el turno.
      if (!isError && (fallosPorHerramienta[fnName] || 0) > 0) {
        try { notificarExitoTrasFallo(fnName, String(tc.function?.arguments || "").slice(0, 120)); } catch { /* nunca rompe el lazo */ }
      }
      fallosPorHerramienta[fnName] = isError ? (fallosPorHerramienta[fnName] || 0) + 1 : 0;
      historialBucle.push({ nombre: String(fnName), ok: !isError });
      // v1.64.0 — FASE 3: registra el paso para el detector de ciclos. OBRA exitosa reinicia (control de falso positivo). Token = nombre + \u0000 + hash-de-args (distingue read(x) de read(y); el mensaje solo muestra el nombre).
      {
        registrarPaso(contextoBucleO, `${fnName}\u0000${tc.function?.arguments || ""}`, !isError && esHerramientaDeObra(fnName));
        const vb = evaluarContextoBucle(contextoBucleO);
        if (vb.mensaje) { avisoBucleO = vb.mensaje; if (onTask) onTask({ type: "log", message: `🔁 bucle visible: ${vb.ciclo?.repeticiones}ª vuelta de un ciclo de ${vb.ciclo?.periodo} paso(s)` } as any); }
        if (vb.debeCortar) lazoBucleO = (vb.ciclo?.patron || []).map((t) => t.split("\u0000")[0]).join(" → ");
      }
      registrarObra(manifiestoObra, String(fnName), args, !isError, isError ? String(result).slice(0, 160) : undefined); // ORDEN DE OBRA
      // v1.16.0 — memoria del bucle: plan y fallo son lo que decide seguir solo.
      actualizarPlanDesdeHerramienta(plan, fnName, args); registrarPlanTurno(plan);
      maxSteps = Math.min(PASOS_TOPE, techoDePasos(tareasPendientes(plan).length, PASOS_BASE, PASOS_TOPE, Object.values(fallosPorHerramienta).filter((n) => n > 0).length) + prorrogaExtra); // v1.57.11 · la prórroga concedida sobrevive al recálculo del techo
      ultimoFallo = isError ? { herramienta: fnName, error: String(result).slice(0, 300) } : null;
    }
    // v1.64.0 — FASE 3: el ciclo detectado se INYECTA como mensaje de usuario
    // TRAS el for (nunca dentro: rompe el transcript de tool_calls/tool). Así el
    // modelo LEE que está girando en el mismo ciclo y puede auto-corregirse en
    // la siguiente iteración, ANTES de que la guarda dura (lazoBucleO) corte.
    if (avisoBucleO) { messages.push({ role: "user", content: avisoBucleO }); avisoBucleO = ""; }
    if (lazoAgotadoO || avisoReescrituraO || lazoLecturaO || lazoBucleO) break; // v1.57.9 lazo suave · v1.60.17 reescritura idéntica · v1.63.0 bucle de lectura · v1.64.0 ciclo visible
  }

  // QUIRÓFANO v1 /*QF-TURNO*/ — fin del turno del agente: se juzga TODO lo que
  // escribió (con las puertas sobre el disco) y, si rompió algo, se revierte y el
  // informe viaja en la respuesta para que el usuario lo vea en el chat.
  // v1.57.9 — si el turno se cerró POR LAZO, la respuesta lo dice con nombre,
  // qué hacer y QUÉ obra quedó hecha (el «Detenido» viejo no decía nada).
  const avisoLazo = lazoAgotadoO ? cierrePorLazoAgotado(lazoAgotadoO) : (lazoLecturaO ? cierrePorLazoAgotado(lazoLecturaO) : (lazoBucleO ? cierrePorLazoAgotado(lazoBucleO) : avisoReescrituraO)); // v1.60.17 · v1.63.0 bucle de lectura · v1.64.0 ciclo visible
  try { registrarHuecosConocidos(huecosDeCerteza(manifiestoObra, sondaObra, listadoReal)); } catch {} // v1.57.11 · cuando el techo corta el turno, la verdad del disco sigue viajando al siguiente
  const cierreTurnoQf = await cerrarTurnoQf("turno del agente");
  if (cierreTurnoQf && (cierreTurnoQf.revertido || !cierreTurnoQf.ok)) {
    return (lastContent || "Completado.") + "\n\n" + cierreTurnoQf.informe + actaExtendida() + avisoLazo;
  }
  // v1.16.0 — con tareas abiertas ya no se dice «Completado»: se informa qué falta.
  const restante = informeHonesto(tareasPendientes(plan), true);
  return (lastContent || "El agente ejecutó las herramientas del turno.") + (restante ? `\n\n${restante}` : "") + actaExtendida() + avisoLazo;
}

/**
 * Lazy initialization of Google GenAI SDK
 *
 * 🔧 CORRECCIÓN: ahora acepta una API key explícita del request (enviada por el
 * cliente desde el modal "Ranuras de API Keys"). Si no se pasa, hace fallback a
 * process.env.GEMINI_API_KEY (comportamiento anterior, para backwards compat).
 * Esto permite que cada usuario configure su propia key de Google AI Studio
 * sin tocar el .env del servidor.
 */
let genAIClient: GoogleGenAI | null = null;
let genAIClientKey: string | null = null;
function getGenAI(explicitKey?: string): GoogleGenAI | null {
  const apiKey = (explicitKey && explicitKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // Reutilizar cliente si la key no cambió
  if (genAIClient && genAIClientKey === apiKey) return genAIClient;
  try {
    genAIClient = new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
    genAIClientKey = apiKey;
    return genAIClient;
  } catch (err) {
    console.warn("Error inicializando GoogleGenAI:", (err as Error).message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v1.46.6 — PLAN EN LA NUBE: credenciales + llamada NO-streaming reutilizable.
// ─────────────────────────────────────────────────────────────────────────────
// El runner de planes corre EN EL SERVIDOR y NO ve el localStorage del
// navegador (donde el usuario guarda sus claves de Z.ai/Gemini). Por eso el
// panel/chat reenvía las claves en cada POST /api/brain/plan y aquí se guardan
// para que `pedirModelo` pueda llamar a la nube. Env (ZAI_API_KEY, …) manda si
// no viene nada del navegador.
interface CredsNubePlan {
  provider?: string;
  zai?: string; gemini?: string; openai?: string; groq?: string;
  openrouter?: string; deepseek?: string; mistral?: string;
  together?: string; cerebras?: string; fireworks?: string;
}
let credencialesNubePlan: CredsNubePlan = {};

/** Mezcla lo que llega del navegador con lo del entorno (el navegador manda). */
function fijarCredencialesNubePlan(c: Partial<CredsNubePlan> | undefined) {
  if (!c || typeof c !== "object") return;
  const limpio: CredsNubePlan = {};
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === "string" && v.trim()) (limpio as any)[k] = v.trim();
  }
  credencialesNubePlan = { ...credencialesNubePlan, ...limpio };
}

function clavePorProveedorPlan(prov: string): string | undefined {
  const c = credencialesNubePlan;
  const env = process.env;
  const sel = (a?: string, b?: string) => (a && a.trim()) || (b && b.trim()) || undefined;
  switch (prov) {
    case "zai": return sel(c.zai, env.ZAI_API_KEY);
    case "gemini": return sel(c.gemini, env.GEMINI_API_KEY);
    case "openai": return sel(c.openai, env.OPENAI_API_KEY);
    case "groq": return sel(c.groq, env.GROQ_API_KEY);
    case "openrouter": return sel(c.openrouter, env.OPENROUTER_API_KEY);
    case "deepseek": return sel(c.deepseek, env.DEEPSEEK_API_KEY);
    case "mistral": return sel(c.mistral, env.MISTRAL_API_KEY);
    case "together": return sel(c.together, env.TOGETHER_API_KEY);
    case "cerebras": return sel(c.cerebras, env.CEREBRAS_API_KEY);
    case "fireworks": return sel(c.fireworks, env.FIREWORKS_API_KEY);
    default: return undefined;
  }
}

const ENDPOINT_NUBE_PLAN: Record<string, string> = {
  zai: "https://api.z.ai/api/paas/v4/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  together: "https://api.together.xyz/v1/chat/completions",
  cerebras: "https://api.cerebras.ai/v1/chat/completions",
  fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
};

/** Deduce el proveedor de nube a partir del nombre del modelo. */
function proveedorDesdeModeloPlan(modelo: string): string {
  const m = (modelo || "").toLowerCase();
  if (m.startsWith("gemini")) return "gemini";
  if (m.startsWith("glm")) return "zai";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "openai";
  if (m.includes("fireworks")) return "fireworks";      // ids "accounts/fireworks/models/..."
  if (m.includes("cerebras")) return "cerebras";
  if (m.includes("together")) return "together";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("mistral") || m.includes("mixtral") || m.includes("codestral")) return "mistral";
  if (m.includes("/")) return "openrouter"; // ids tipo "org/modelo"
  if (m.includes("llama")) return "groq";
  return "zai"; // por defecto, el gratuito preconfigurado
}

/** ¿El id de modelo parece de Ollama (lleva etiqueta "nombre:tag")? */
function pareceModeloOllamaPlan(modelo: string): boolean {
  const m = (modelo || "").trim();
  return /:/.test(m) && !/^https?:/i.test(m) && !m.includes("/");
}

/**
 * Gemini por defecto: familia 3.x.
 *
 * v1.56.8 — estaba fijado a `gemini-2.5-flash`, que el propio selector de modelos
 * ya dio de baja con esta nota: «Lo que había (gemini-2.5-flash, gemini-2.5-pro,
 * gemini-2.0-flash, gemini-1.5-flash) está apagado o da 404 con la clave
 * gratuita». El log de Mario lo confirma: `404 This model
 * models/gemini-2.5-flash is no longer available to new users`. Dos fuentes de
 * verdad sobre qué Gemini usar es peor que ninguna: el ejecutor de tareas pedía
 * un modelo que la UI ya no ofrece, así que fallaba SIEMPRE aunque la clave fuera
 * buena.
 */
const GEMINI_POR_DEFECTO = "gemini-4-hydrogen";

/** Modelo de nube por defecto para un proveedor dado. */
function modeloNubePorDefecto(prov: string): string {
  switch (prov) {
    case "zai": return "glm-4.5-flash";
    case "gemini": return GEMINI_POR_DEFECTO;
    case "openai": return "gpt-4o-mini";
    case "groq": return "llama-3.3-70b-versatile";
    case "deepseek": return "deepseek-chat";
    case "mistral": return "mistral-small-latest";
    case "together": return "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free";
    case "cerebras": return "llama3.1-8b";
    case "fireworks": return "accounts/fireworks/models/llama-v3p1-8b-instruct";
    default: return "glm-4.5-flash";
  }
}

/** Llamada NO-streaming a un proveedor de nube. Devuelve el texto o lanza. */
async function pedirAModeloNubePlan(opts: {
  provider: string;
  modelo: string;
  apiKey: string;
  mensajes: Array<{ role: string; content: string }>;
  temperatura?: number;
}): Promise<string> {
  const { provider, modelo, apiKey, mensajes } = opts;
  const temperatura = typeof opts.temperatura === "number" ? opts.temperatura : 0.2;

  if (provider === "gemini") {
    const ai = getGenAI(apiKey);
    if (!ai) throw new Error("falta la clave de Gemini (GEMINI_API_KEY o ranura).");
    const sys = mensajes.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const contents = mensajes
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const resp: any = await ai.models.generateContent({
      model: modelo && modelo.includes("gemini") ? modelo : GEMINI_POR_DEFECTO,
      contents,
      config: { ...(sys ? { systemInstruction: sys } : {}), temperature: temperatura },
    });
    // v1.56.8 — `resp.text` es el accessor del SDK que AVISA así:
    //   «there are non-text parts functionCall in the response, returning
    //    concatenation of all text parts»
    // y hacía justo eso: tiraba a la basura los `functionCall` devolviendo solo el
    // retazo de texto. En el log de Mario apareció tres veces seguidas. Aquí se
    // leen las parts a mano, se toma el texto, y si había llamadas a herramientas
    // se lo dice al registro en vez de disimularlo — este endpoint no manda `tools`
    // en el config, así que un functionCall significa que el modelo está
    // intentando actuar por su cuenta y merece verse.
    const partes: any[] = Array.isArray(resp?.candidates?.[0]?.content?.parts)
      ? resp.candidates[0].content.parts
      : [];
    const texto = partes
      .filter((p) => typeof p?.text === "string")
      .map((p) => p.text)
      .join("");
    const noTexto = partes.filter((p) => !p || typeof p.text !== "string");
    const llamadas = noTexto.filter((p) => p?.functionCall).map((p) => p.functionCall.name || "?");
    if (llamadas.length > 0) {
      console.warn(
        `[plan/gemini] el modelo devolvió ${llamadas.length} functionCall(s) [${llamadas.join(", ")}] ` +
        `en una llamada sin herramientas: se descarta(n) a propósito y se devuelve el texto. ` +
        `Si esto se repite, el planificador no debería usar este proveedor.`
      );
    }
    if (!texto.trim()) {
      throw new Error(
        noTexto.length > 0 && !partes.length
          ? "Gemini respondió sin texto."
          : `Gemini respondió sin texto${llamadas.length ? ` (solo functionCall: ${llamadas.join(", ")})` : ""}.`
      );
    }
    return texto;
  }

  const endpoint = ENDPOINT_NUBE_PLAN[provider];
  if (!endpoint) throw new Error(`proveedor de nube no soportado para el plan: «${provider}».`);
  if (!apiKey) throw new Error(`falta la clave de ${provider} para el plan.`);
  const r = await fetchCloud(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelo, messages: mensajes, stream: false, temperature: temperatura }),
  });
  if (!r.ok) {
    let errBody = ""; try { errBody = await r.text(); } catch {}
    throw new Error(`${provider} respondió HTTP ${r.status}${errBody ? ` (${errBody.slice(0, 160)})` : ""}`);
  }
  const j: any = await r.json();
  const texto = String(j?.choices?.[0]?.message?.content ?? "");
  if (!texto.trim()) throw new Error(`${provider} respondió sin texto.`);
  return texto;
}

// 🎙️ GEMINI TTS — extraído a server/routers/geminiTts.ts (v1.62.0, Fase 2).
// El dominio (30 voces + PCM→WAV + /api/tts/*) vivía aquí; se registra abajo
// con registrarGeminiTts(app, getGenAI). Ver ese módulo para el detalle.


// ============================================================
// v2.0 — SUBSISTEMA DE EXTENSIONES
// ------------------------------------------------------------
// Escaneo de ./extensions, estado habilitado/deshabilitado, registro de las
// herramientas que aportan y cola de invocación modelo → extensión.
// ============================================================
const EXTENSIONS_DIR = path.join(process.cwd(), "extensions");
const EXTENSIONS_STATE_FILE = path.join(process.cwd(), ".extensions-state.json");
const extensionRegistry = new ExtensionRegistry();
/** Extensiones deshabilitadas por el usuario (persistido) */
const disabledExtensions = new Set<string>();
/**
 * Extensiones con panel ABIERTO en la IDE. Lo informa el sondeo del cliente
 * (?open=id1,id2). Solo a esas se les ofrecen sus herramientas al modelo: si no
 * hay panel, no hay quién ejecute la herramienta.
 */
const openExtensionPanels = new Set<string>();

function loadExtensionsState(): void {
  try {
    if (!fs.existsSync(EXTENSIONS_STATE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(EXTENSIONS_STATE_FILE, "utf-8"));
    for (const id of raw?.disabled || []) disabledExtensions.add(String(id));
  } catch {}
}

function saveExtensionsState(): void {
  try {
    fs.writeFileSync(EXTENSIONS_STATE_FILE, JSON.stringify({ disabled: [...disabledExtensions] }, null, 2), "utf-8");
  } catch {}
}
loadExtensionsState();

export interface ExtensionView {
  manifest: ExtensionManifest;
  dir: string;
  enabled: boolean;
  error?: string;
  warnings?: string[];
  panelOpen: boolean;
}

/** Lee los manifiestos de las carpetas de ./extensions, los valida y devuelve la lista. */
function scanExtensions(): ExtensionView[] {
  const out: ExtensionView[] = [];
  extensionRegistry.all().forEach(() => {});
  try {
    if (!fs.existsSync(EXTENSIONS_DIR)) return out;
    const dirs = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of dirs) {
      const dirAbs = path.join(EXTENSIONS_DIR, d.name);
      const manifestPath = path.join(dirAbs, "manifest.json");
      const rel = `extensions/${d.name}`;
      if (!fs.existsSync(manifestPath)) continue;
      let raw: any = null;
      try {
        raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      } catch (err: any) {
        // v2.1 — Los tres caminos de error omitían `panelOpen`, que
        // `ExtensionView` exige. La interfaz lee ese campo para decidir si el
        // panel de la extensión está abierto; sin él, la entrada viajaba
        // incompleta. Una extensión rota no tiene panel abierto: `false`.
        out.push({
          manifest: { id: d.name, name: d.name, version: "0.0.0", main: "index.html" },
          dir: rel,
          enabled: false,
          panelOpen: false,
          error: `manifest.json no es JSON válido: ${err?.message || err}`,
        });
        continue;
      }
      const v = validateManifest(raw);
      if (!v.ok) {
        out.push({ manifest: raw, dir: rel, enabled: false, panelOpen: false, error: v.errors.join(" ") });
        continue;
      }
      const manifest: ExtensionManifest = raw;
      // El entry tiene que existir de verdad
      const entryAbs = path.resolve(dirAbs, manifest.main);
      if (!entryAbs.startsWith(dirAbs) || !fs.existsSync(entryAbs)) {
        out.push({ manifest, dir: rel, enabled: false, panelOpen: false, error: `No existe el archivo de entrada "${manifest.main}".` });
        continue;
      }
      const manifestWithPath: ExtensionManifest = { ...manifest, _path: rel, _installedAt: manifest._installedAt || Date.now() };
      extensionRegistry.add(manifestWithPath);
      out.push({
        manifest: manifestWithPath,
        dir: rel,
        enabled: !disabledExtensions.has(manifest.id),
        warnings: v.warnings,
        panelOpen: openExtensionPanels.has(manifest.id),
      });
    }
  } catch (err: any) {
    console.warn("[extensions] Error escaneando:", err?.message || err);
  }
  return out;
}

/** Vuelve a escanear y actualiza los packs de herramientas de las extensiones. */
function refreshExtensionTools(): ExtensionView[] {
  for (const m of extensionRegistry.all()) unregisterToolPack(`ext:${m.id}`);
  // El registro se reconstruye en cada escaneo (barato: son manifiestos locales)
  const fresh = new ExtensionRegistry();
  const views = scanExtensions().map((v) => {
    if (v.enabled && v.manifest?.id) fresh.add(v.manifest);
    return v;
  });
  for (const m of fresh.all()) {
    const tools = listToolContributions(m);
    if (tools.length === 0) continue;
    registerToolPack({
      id: `ext:${m.id}`,
      label: `${m.name} (extensión)`,
      description: m.description || `Herramientas aportadas por ${m.name}`,
      tools: tools.map((t) => ({
        name: t.name,
        pack: `ext:${m.id}`,
        description: toolDescriptionWithHint(t.description, m.id),
        parameters: t.parameters,
        cheap: t.cheap,
        destructive: t.destructive,
        // Requiere la extensión abierta: se comprueba al montar la lista de tools
        requires: {} as any,
      })),
    });
  }
  return views;
}

/** Marca en la descripción que la herramienta viene de una extensión (el modelo lo ve). */
function toolDescriptionWithHint(desc: string, extId: string): string {
  return `${desc} [aportada por la extensión ${extId}; solo funciona si su pestaña está abierta]`;
}

// ------------------------------------------------------------
// Cola de invocación: modelo (servidor) → extensión (iframe del navegador)
// ------------------------------------------------------------
interface PendingInvocation {
  id: string;
  extId: string;
  command: string;
  args: any;
  resolve: (r: { ok: boolean; result?: any; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingInvocations = new Map<string, PendingInvocation>();

function invokeExtension(
  extId: string,
  command: string,
  args: any,
  timeoutMs = 45000
): Promise<{ ok: boolean; result?: any; error?: string }> {
  return new Promise((resolve) => {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = setTimeout(() => {
      pendingInvocations.delete(id);
      resolve({ ok: false, error: "La extensión no respondió a tiempo." + (caminoCorrectoPara("aún no responde") ? " CAMINO CORRECTO: " + caminoCorrectoPara("aún no responde") : "") });
    }, timeoutMs);
    pendingInvocations.set(id, { id, extId, command, args, resolve, timer });
  });
}

// ============================================================
// v2.0 — RENDIMIENTO LOCAL Y SALUD PROFUNDA (resiliencia)
// ------------------------------------------------------------
// El problema real del usuario: "en local se queda, no contesta". Dos causas
// técnicas y su remedio automático desde aquí:
//   1. El modelo no está cargado en RAM cuando llega el primer mensaje: Ollama
//      tiene que leer 400 MB-2 GB de disco → parece colgado. → /api/ollama/warmup
//      lo precarga al seleccionarlo, con el contexto ya reservado.
//   2. No se sabía POR QUÉ no respondía (¿Ollama caído? ¿sandbox muerto? ¿sin
//      RAM?). → /api/health/deep comprueba cada pieza y dice qué hacer.
// ============================================================
// ============================================================
// v2.0 — ENDPOINTS DEL MOTOR (base de datos + blindaje)
// ============================================================
function registerEngineRoutes(app: express.Express, estadoSandboxCrudo?: () => Promise<EstadoSandboxCrudo>): void {
  // ============================================================
  // v2.0 — ENDPOINTS DEL CEREBRO (gobernanza + memoria viva)
  // ============================================================

  // ============================================================
  // v2.0 — LABORATORIO DE CAPACIDADES AVANZADAS (cada una con su botón)
  // ============================================================

  // ============================================================
  // v2.1 — VERIFICADOR INDEPENDIENTE (en la nube, coste local ~0)
  // ============================================================

  // ─── Fase 2 (v1.70.3): los dominios `verifier` y `governor` se mudaron a
  // server/routers/calidad.ts. Registro por delegación sobre las MISMAS
  // instancias: las rutas hablan con el mismo estado de antes. Contrato:
  // `node scripts/superficie.mjs` (generado, no se edita a mano).
  registrarCalidad(app, { verifier, governor });

  // ─── Fase 2 (v1.70.2): el dominio `features` se mudó a server/routers/features.ts.
  // Se registra por delegación sobre las MISMAS instancias (`features`, `localRag`):
  // las rutas siguen hablando con el mismo estado que antes. El contrato se
  // regenera con `node scripts/superficie.mjs` (no se edita a mano).
  registrarFeatures(app, { features, localRag });
  // v1.80.0 · RESPUESTA ECLÉCTICA: un prompt a varias voces y veredicto final.
  registrarEnjambre(app, { sandboxAuthorized, features, ollamaUrl: OLLAMA_DEFAULT, ejecutor: { ejecutarHerramienta: executeToolCall, herramientas: AGENT_TOOLS } }); // v1.88.0 · fase 2: el veredicto ejecuta con las herramientas REALES
  // v1.84.0 · FASE 2: las sesiones exportadas de la IDE entran al organo por
  // parecido, no por grep. Al arrancar solo se indexan los cuerpos (palabra);
  // los vectores llegan perezosamente con el primer ruteo hibrido que los pida.
  try {
    const _ses = indexarSesionesCerebro(PROJECT_ROOT, PROJECT_ROOT);
    if (_ses.indexadas > 0) console.log(`🧠 sesiones indexadas en el cerebro: ${_ses.indexadas}${_ses.saltadas ? ` (${_ses.saltadas} saltadas: ${_ses.motivos.slice(0, 2).join("; ")})` : ""}`);
  } catch { /* indexar sesiones nunca tumba el arranque */ }
  // v1.73.0 · CANAL DIRECTO: vincular carpeta/ZIP de proyecto desde el chat (suite nueva).
  registrarCarpetaProyecto(app, { proyectoRoot: PROJECT_ROOT, raizApp: process.cwd() });
  // v1.0.20 · RUTAS ATÓMICAS (pieza C): contexto/abrir/actual/cerrar/clasificar.
  registrarRutasProyecto(app, { ...DEPS_REGISTRO, autorizado: sandboxAuthorized, servido: () => raizDeObraEnCurso(PROJECT_ROOT), urlObra: () => `http://localhost:${Number(process.env.SANDBOX_PORT) || 3500}/` });
  // v1.85.0 · FASE 6 y v1.86.0 · FASE 7: el ciclo de decisión con trazas, la aduana
  // de lo forjado, el multiagente con relevo compartido y el «¿por qué decidiste
  // esto?». Todo el criterio vive en src/engine/* (suites homónimas); acá se registra.
  registrarNucleoAgentico(app, { raizDatos: PROJECT_ROOT, raizFuente: process.cwd(), sandboxAuthorized, ollamaUrl: OLLAMA_DEFAULT, relevoActivado: () => !!features?.isOn?.("auto_relay") });
  // v1.86.0 · FASE 7.1/7.2: la app generada recuerda en SU cerebro (dentro del
  // proyecto del sandbox, nunca en el árbol del usuario) y el espejo se audita.
  registrarConcienciaSandbox(app, { raizWorkspace: PROJECT_ROOT, raizApp: process.cwd(), resolverRaizSandbox: () => resolverRaizProyecto()?.raiz ?? null, sandboxAuthorized, instantaneaViva: () => hojaVivaParaPanel() });
  // v1.74.0 · El motor aprende en tiempo real: cada lección sale AL INSTANTE a
  // LECCIONES.md, a la KB (tabla lesson) y al espejo vivo (barra de Tareas).
  inicializarAprendizajeVivo({
    proyectoRoot: PROJECT_ROOT,
    upsertKb: (e) => { engineKb.upsert(e as any); kbDirty = true; },
    onLeccion: (l) => { try { anotarVivo(`LECCIÓN L${l.n} (${l.fuente}): ${l.titulo}`); } catch { /* el aviso nunca rompe nada */ } },
  });
  registrarRutasAprendizajeVivo(app);
  // v1.76.0 · auto-propuesta de parches al cerebro: la misma puerta de escritura
  // de siempre (`brain.guardarPropuesta`) con un contador de patrones detrás.
  inicializarPropuestasAutonomas({
    proyectoRoot: PROJECT_ROOT,
    activada: () => features.isOn("auto_propose"),
    guardarPropuesta: (p) => brain.guardarPropuesta(p as any),
    marcarVivo: (nota) => { try { anotarVivo(nota); } catch { /* el aviso nunca rompe nada */ } },
  });

  // ─── Fase 2 (v1.59.2): el dominio `rag` se mudó a server/routers/vectorRag.ts.
  // Se registra por delegación sobre la MISMA instancia `localRag`: la ruta
  // sigue hablando con el mismo estado que antes. El contrato se regenera con
  // `node scripts/superficie.mjs` (no se edita a mano).
  registrarVectorRag(app, { localRag });

  // v1.98.0 · el embedder se vuelve visible y calentable desde la UI; calienta a los 20 s.
  registrarEmbedderCerebro(app, { resolutor: cerebroEmbedder, retrasoCalentadoMs: 20_000 });
registrarSupervisorArranque(app, { raizProyecto: RAIZ_INSTALACION, raizDatos: PROJECT_ROOT, autorizado: sandboxAuthorized }); registrarPersistencia(app, { raizDatos: PROJECT_ROOT }); // v2.3.24 · LA RAIZ DE INSTALACION, NO LA DE DATOS. El shim hace `cd /d <raiz>` y corre `scripts\x.py` con ruta RELATIVA; con PROJECT_ROOT (=C:\Cerebronico) ese archivo no existe, el pack reanimado moria al nacer y asi se fue el :5102 (y el «py que se abre y se cierra»). Los scripts viven donde este server fue lanzado: la misma premisa que `scriptPath` de agent_bridge_5000.py. registrarRutasInterruptorQuirofano(app, { raizDatos: PROJECT_ROOT, autorizado: sandboxAuthorized }); // v2.3.9 · GET/POST /api/quirofano/interruptor (el cuerpo vive en server/routers/quirofanoInterruptor.ts) registrarAutoLlamado(app, { raizDatos: PROJECT_ROOT }); // v2.3.8 · el lazo se auto-invoca; antes: cero llamantes (ver server/routers/autoLlamado.ts) // v1.99.0 · vigila el plano 2 CMD + 3 PY · v2.1.0 interruptores con llave
  /** Consulta la base de conocimiento del motor (determinista, sin modelo). */
  app.get("/api/engine/kb", (req: Request, res: Response) => {
    const q = String(req.query.q || "");
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 5));
    const hits = q ? engineKb.query(q, limit) : [];
    return res.json({
      ok: true,
      query: q,
      hits: hits.map((h) => ({ id: h.entry.id, table: h.entry.table, title: h.entry.title, body: h.entry.body, score: h.score })),
      // Lo que el motor inyectaría al prompt con esa consulta
      context: buildEngineContext(engineKb, q, limit),
      stats: engineKb.stats(),
      size: engineKb.size(),
    });
  });

  /**
   * La ÚNICA autoridad para escribir una imagen generada en el proyecto (v2.3).
   * La usan el runner de planes y el endpoint directo: si hubiera dos, algún
   * día discreparían (la lección de la validación del plan, aplicada al binario).
   * El binario NO pasa por el workspace de texto: ese vive en localStorage con
   * tope de 5 MB, y un JPEG de 1 MB lo tumbaría entero.
   */
  function escribirImagenEnProyecto(rutaRel: string, data: Uint8Array): string {
    const raiz = resolverRaizProyecto().raiz;
    const abs = path.resolve(raiz, rutaRel);
    const rel = path.relative(raiz, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`la ruta «${rutaRel}» sale de la raíz del proyecto: no se escribe nada.`);
    }
    const ext = path.extname(abs).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      throw new Error(`«${ext || "(sin extensión)"}» no es una extensión de imagen.`);
    }
    // La extensión manda los BYTES, no la petición: un JPEG con extensión .png
    // es un archivo mal etiquetado. `rutaConExtensionReal` corrige la extensión
    // (y el servidor avisa al compararla, porque la función es muda).
    const real = rutaConExtensionReal(rel, data);
    const absFinal = path.resolve(raiz, real.ruta);
    if (path.relative(raiz, absFinal) !== real.ruta) {
      throw new Error("la ruta corregida sale de la raíz del proyecto: no se escribe nada.");
    }
    fs.mkdirSync(path.dirname(absFinal), { recursive: true });
    fs.writeFileSync(absFinal, Buffer.from(data));
    return path.relative(PROJECT_ROOT, absFinal).split(path.sep).join("/");
  }

  // v1.48.1 — CEREBRO DE TAREAS + rutas de solo lectura del cerebro extraídos a
  // server/routers/brain.ts (trinquete Fase 2: server.ts < 11.800 líneas). La
  // maquinaria de imagen (escribirImagenEnProyecto) se queda aquí porque la
  // comparte el endpoint directo /api/engine/imagen; se inyecta.
  registrarBrain(app, {
    // v1.82.0 · FASE 3: el panel de capacidades manda sobre los workers del
    // planificador; el número sale de los núcleos medidos (gobernante.ts).
    paralelismoActivo: () => features.isOn("parallel_workers"),
    brain,
    sandboxAuthorized,
    RAM_GB,
    CPU_CORES,
    PROJECT_ROOT,
    OLLAMA_DEFAULT,
    escribirImagenEnProyecto,
    transportarABoveda,
    nombreProyectoSandbox,
    pareceModeloOllamaPlan,
    callOllamaNonStreaming,
    proveedorDesdeModeloPlan,
    clavePorProveedorPlan,
    modeloNubePorDefecto,
    pedirAModeloNubePlan,
    resolveSafePath,
    fijarCredencialesNubePlan,
    credsNubePlan: () => credencialesNubePlan,
    estadoSandboxCrudo,
  });

  // ════════════════════════════════════════════════════════════════════════
  // CONVERSOR INTERNO (v2.2) — convertir Y DECIR QUÉ SE PIERDE
  // ════════════════════════════════════════════════════════════════════════
  // Disponible también como tipo de tarea ("convertir"), así que el cerebro
  // puede convertir 40 archivos en segundo plano mientras tú haces otra cosa.
  app.post("/api/engine/convertir", (req: Request, res: Response) => {
    const desde = String(req.body?.formatoEntrada || "").toLowerCase() as FormatoConv;
    const hacia = String(req.body?.formatoSalida || "").toLowerCase() as FormatoConv;
    const contenido = typeof req.body?.contenido === "string" ? req.body.contenido : "";
    if (!FORMATOS_CONV.includes(desde) || !FORMATOS_CONV.includes(hacia)) {
      return res.status(400).json({ ok: false, error: `Formatos válidos: ${FORMATOS_CONV.join(", ")}.` });
    }
    if (!contenido) return res.status(400).json({ ok: false, error: "Falta «contenido»: no hay nada que convertir." });
    const r = convertir(contenido, desde, hacia, (req.body?.opciones || {}) as any);
    return res.status(r.ok ? 200 : 400).json(r);
  });

  // ════════════════════════════════════════════════════════════════════════
  // IMÁGENES GRATIS (v2.3) — cadena de proveedores sin promesas falsas
  // ════════════════════════════════════════════════════════════════════════
  // La misma cadena que usa la tarea `generar_imagen` del cerebro, disponible
  // también como endpoint directo (la orden `cerebronico:imagen` del chat).
  // Gratis = Pollinations sin clave (lento, y el modelo real lo dice la
  // cabecera, no el pedido). Con GEMINI_API_KEY entra el respaldo. El resultado
  // SIEMPRE declara: proveedor, modelo que respondió DE VERDAD, bytes, tiempo,
  // advertencias y los motivos de cada eslabón fallido.
  app.post("/api/engine/imagen", async (req: Request, res: Response) => {
    try {
      const datos: Record<string, unknown> = req.body && typeof req.body === "object" ? { ...req.body } : {};
      const v = validarDatosImagen(datos);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

      let rutaRel: string | undefined;
      if (datos.salida !== undefined) {
        if (typeof datos.salida !== "string") return res.status(400).json({ ok: false, error: "«salida» tiene que ser una ruta (texto)." });
        const s = datos.salida.trim();
        if (s.length > 0) {
          const vr = validarRutaImagen(s);
          if (!vr.ok) return res.status(400).json({ ok: false, error: `«salida»: ${vr.error}` });
          rutaRel = s;
        }
      }

      const r = await generarImagen({
        prompt: v.prompt,
        ancho: v.ancho,
        alto: v.alto,
        modelo: v.modelo,
        seed: v.seed,
        // IMAGEN v5: la orden directa del chat no tiene planificador detrás,
        // así que el reintento corto vive aquí: 3 golpes con backoff (2.5 s,
        // 5 s) antes de dar la vuelta a Gemini. La congestión pasajera del
        // gratuito (medida: 500 con 429 dentro que al reintento salía bien)
        // ya no mata la orden.
        intentos: 3,
        tokenPollinations: process.env.POLLINATIONS_API_KEY?.trim() || undefined,
        keyGemini: process.env.GEMINI_API_KEY?.trim() || undefined,
      });

      if (!r.ok) {
        // 502: el fallo NO es de este servidor, es de la cadena de proveedores.
        // Y se declara con toda la lista de motivos: nunca un «no se pudo».
        return res.status(502).json({ ok: false, error: r.error, fallos: r.fallos, advertencias: r.advertencias, ms: r.ms });
      }

      // BÓVEDA v1 — sin «salida» explícita, la bóveda local indexada es el
      // destino: el pedido del usuario es que la imagen LLEGUE al disco real
      // (C:\CN\IMAGENES\<proyecto>\…), no que se quede flotando en una URL.
      const avisosBoveda: string[] = [];
      if (!rutaRel) {
        try {
          const linea = await transportarABoveda({
            bytes: r.bytes as Uint8Array,
            mime: String(r.tipoMime || "image/jpeg"),
            proyecto: nombreProyectoSandbox(),
            archivo: `imagen-${Date.now()}.${r.tipoMime === "image/png" ? "png" : r.tipoMime === "image/webp" ? "webp" : "jpg"}`,
            origenSandbox: "(no guardada en sandbox)",
            modeloUsado: r.modeloUsado,
          });
          if (linea) avisosBoveda.push(linea);
        } catch {}
      }

      let ruta: string | undefined;
      const avisosExtra: string[] = [];
      if (rutaRel) {
        try {
          ruta = escribirImagenEnProyecto(rutaRel, r.bytes as Uint8Array);
          // Si el servidor corrigió la extensión (los bytes son otro formato),
          // se dice: comparar por nombre base, que la ruta puede traer el
          // prefijo de la raíz anidada sin que eso sea una corrección.
          if ((ruta.split("/").pop() || "") !== (rutaRel.split("/").pop() || "")) {
            avisosExtra.push(`Se pidió «${rutaRel}» pero se guardó como «${ruta.split("/").pop()}»: la extensión se corrigió al formato real de los bytes (un archivo no se mal etiqueta).`);
          }
          // BÓVEDA v1: guardada en el sandbox, la imagen además VIAJA al
          // disco real indexado (puente mediante). El viaje se declara.
          try {
            const linea = await transportarABoveda({
              bytes: r.bytes as Uint8Array,
              mime: String(r.tipoMime || "image/jpeg"),
              proyecto: nombreProyectoSandbox(),
              archivo: rutaRel.split(/[\\/]/).pop() || "imagen",
              origenSandbox: ruta,
              modeloUsado: r.modeloUsado,
            });
            if (linea) avisosExtra.push(linea);
          } catch {}
        } catch (e: any) {
          // La imagen existió; el fallo es de escritura y se dice con su causa.
          return res.status(200).json({
            ok: true,
            url: r.url,
            bytes: (r.bytes as Uint8Array).length,
            tipoMime: r.tipoMime,
            proveedor: r.proveedor,
            modeloUsado: r.modeloUsado,
            ms: r.ms,
            seed: r.seed,
            advertencias: [...(r.advertencias || []), `No se guardó en «${rutaRel}»: ${e?.message || e}`],
            fallos: r.fallos,
          });
        }
      }

      console.log(`[Imágenes] ok · ${r.proveedor} · modelo real ${r.modeloUsado} · ${r.tipoMime} · ${((r.bytes?.length || 0) / 1024).toFixed(1)} KB · ${((r.ms || 0) / 1000).toFixed(1)} s${ruta ? ` · ${ruta}` : ""}`);
      return res.json({
        ok: true,
        url: r.url,
        ruta,
        bytes: (r.bytes as Uint8Array).length,
        tipoMime: r.tipoMime,
        proveedor: r.proveedor,
        modeloUsado: r.modeloUsado,
        ms: r.ms,
        seed: r.seed,
        advertencias: [...(r.advertencias || []), ...avisosExtra, ...avisosBoveda],
        fallos: r.fallos,
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: `Fallo interno generando la imagen: ${e?.message || e}` });
    }
  });

  /**
   * Vista de una imagen ya guardada en el proyecto (miniaturas del panel,
   * comprobación del usuario). Confinada al proyecto, como todo lo que se
   * sirve desde aquí; no es una puerta a archivos arbitrarios.
   */
  app.get("/api/engine/imagen/vista", (req: Request, res: Response) => {
    const ruta = String(req.query.ruta || "");
    if (!ruta) return res.status(400).json({ ok: false, error: "Falta «ruta»." });
    let abs: string;
    try {
      abs = resolveSafePath(ruta);
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: e?.message || "Ruta no permitida." });
    }
    const ext = path.extname(abs).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      return res.status(400).json({ ok: false, error: `«${ext || "(sin extensión)"}» no es una imagen.` });
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return res.status(404).json({ ok: false, error: `No existe la imagen «${ruta}» en el proyecto.` });
    }
    res.setHeader("Content-Type", ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    fs.createReadStream(abs).pipe(res);
  });

  /** Estado de la cadena (para el diagnóstico y el panel): qué eslabones hay. */
  app.get("/api/engine/imagen/estado", (_req: Request, res: Response) => {
    return res.json({ ok: true, cadena: estadoCadenaImagen(process.env) });
  });

  // ════════════════════════════════════════════════════════════════════════
  // EL REFLEJO (v2.4) — frase → orden/cálculo/plantilla, determinista, sin red
  // ════════════════════════════════════════════════════════════════════════
  // Mismas tablas que viajan en el ZIP. `modo`: "lite" (502 KB, fuzzy en
  // runtime) o "max" (2.2 MB, distancia 2 precalculada). Cero filtro de
  // contenido: el único «no» del reflejo es estructural y siempre trae motivo.
  app.post("/api/reflejo", (req: Request, res: Response) => {
    const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
    if (!frase.trim()) return res.status(400).json({ ok: false, accion: "nada", confianza: 0, modo: "lite", ms: 0, motivo: "falta «frase» (texto)." });
    const modo = req.body?.modo === "max" ? "max" : "lite";
    const r = pensarReflejo(frase, modo);
    return res.status(r.ok ? 200 : 422).json(r);
  });

  app.get("/api/reflejo/estado", (_req: Request, res: Response) => {
    return res.json(estadoReflejo());
  });

  // ════════════════════════════════════════════════════════════════════════
  // CEREBRONICO-AGENTICO v1 (v2.5) — el consejo: 12 especialistas + 28 herramientas
  // ════════════════════════════════════════════════════════════════════════
  const archivoEntidades = path.join(PROJECT_ROOT, ".cerebro-db", "entidades.json");
  const archivoEspejos = path.join(PROJECT_ROOT, ".cerebro-db", "espejos.json"); // ESPEJOS v1
  // El estado de los botones (activa/dormida) sobrevive reinicios; el catálogo
  // y su lógica NO: viven en el código (una sola fuente).
  try {
    if (fs.existsSync(archivoEntidades)) {
      const guardado = JSON.parse(fs.readFileSync(archivoEntidades, "utf8"));
      for (const [id, activa] of Object.entries(guardado?.activas || {})) cambiarActivacion(String(id), Boolean(activa));
    }
  } catch (e: any) {
    console.log(`[Consejo] el estado guardado de entidades no se pudo leer (${e?.message || e}); arranco con los valores por defecto.`);
  }

  app.get("/api/consejo/estado", (_req: Request, res: Response) => {
    return res.json({
      ...estadoConsejo(),
      // v1.15.1 — el consejo dice la verdad sobre sus ejecutores: cuántas
      // acciones son REALES (calculo, convertir) y cuántas solo DECLARADAS.
      ejecutores: {
        ...resumenEjecutores(),
        detalle: Object.entries(EJECUTORES_CONSEJO).map(([accion, ficha]) => ({ accion, ...ficha })),
      },
    });
  });

  app.post("/api/consejo/entidad", (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    const r = cambiarActivacion(id, req.body?.activa !== false);
    if (!r.ok) return res.status(400).json(r);
    try {
      fs.mkdirSync(path.dirname(archivoEntidades), { recursive: true });
      const activas: Record<string, boolean> = {};
      for (const e of ENTIDADES) if (e.tipo === "herramienta") activas[e.id] = e.activa;
      fs.writeFileSync(archivoEntidades, JSON.stringify({ activas, en: new Date().toISOString() }, null, 2));
    } catch (e: any) {
      console.log(`[Consejo] toggle aplicado en memoria pero NO persistido (${e?.message || e}).`);
    }
    return res.json({ ok: true, id, activa: req.body?.activa !== false });
  });

  // ─── ESPEJOS v1 — grupos de espejos y selector (la barra dentro de la
  // interfaz de modelos). La selección vive en el motor (memoria + disco,
  // para /api/conductor) y en el navegador (localStorage, para el prompt).
  try {
    if (fs.existsSync(archivoEspejos)) {
      const ns = normalizarSeleccion(JSON.parse(fs.readFileSync(archivoEspejos, "utf8")));
      if (ns.ok) fijarSeleccion(ns.seleccion);
      else console.log(`[Espejos] selección guardada inválida (${ns.motivo}); arranco sin grupo activo.`);
    }
  } catch (e: any) {
    console.log(`[Espejos] el estado guardado no se pudo leer (${e?.message || e}); arranco sin grupo activo.`);
  }

  // TURBO v1 — el botón de la cabecera arma/desarma el catálogo de poderes.
  app.post("/api/consejo/turbo", (req: Request, res: Response) => {
    fijarTurbo(Boolean(req.body?.turbo));
    return res.json({ ok: true, turbo: req.body?.turbo !== false });
  });

  app.get("/api/consejo/espejos", (_req: Request, res: Response) => res.json(estadoEspejos()));

  // ═══════════════════════════════════════════════════════════════════════════════
  // ORQUESTADOR ÚNICO v1.0 (Reflejo v3.0)
  // ═══════════════════════════════════════════════════════════════════════════════
  // El orquestador sustituye a la lógica dispersa de "qué espejo llamar para
  // esta frase". Aplica las 9 familias de leyes declarativas (física, mate,
  // lingüística, científica, cuántica, antropológica, extensible,
  // transformable, autoaprendible) y devuelve el espejo + datos.
  //
  // Dos endpoints:
  //   GET  /api/espejos/leyes      → catálogo de leyes activas (curadas + aprendidas)
  //   POST /api/espejos/orquestar → aplica las leyes a una frase y devuelve el espejo
  const archivoLeyesAprendidas = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
  // 🐞 DEFECTO v1.0.3 (doble): el orquestador llamaba `require("node:fs")`
  // dentro de un paquete ESM — require no existe, la excepción se tragaba en
  // su propio catch y las leyes aprendidas NUNCA sobrevivan al reinicio. Y
  // aquí encima se usaba `require("./…/orquestador")` sobre un módulo que ya
  // está importado arriba. Reflejo v5: el servidor INYECTA las primitivas fs
  // (misma regla que consejo.ts con node:os) y usa la función importada.
  try {
    configurarFsOrquestador({
      existsSync: (r: string) => fs.existsSync(r),
      readFileSync: (r: string, c: "utf8") => fs.readFileSync(r, c),
      mkdirSync: (r: string, o?: { recursive?: boolean }) => { fs.mkdirSync(r, o); },
      writeFileSync: (r: string, k: string, c: "utf8") => { fs.writeFileSync(r, k, c); },
    });
    cargarLeyesAprendidas(archivoLeyesAprendidas);
    const n = leyAprendida();
    if (n > 0) console.log(`[Orquestador] cargadas ${n} ley(es) aprendidas desde .cerebro-db/leyes-aprendidas.json`);
    for (const d of diagnosticoLeyes()) console.log(`[Orquestador] diagnóstico: ${d}`);
    console.log(`[Orquestador] activo — ${LEYES_REFLEJO.length} leyes curadas + ${n} aprendidas · salud de la flota: ${Object.keys(TABLA_SALUD).length} espejos medidos · ${(() => { try { const s = seleccionMotor(); return s.espejos.length ? `equipo activo «${s.grupo}» (${s.espejos.length}) — la nota viaja en el prompt de todos los proveedores` : "sin equipo activo: consultar_espejo igual responde por id, pero elegí uno en Modelos → Espejos para que los modelos los usen solos"; } catch { return "equipo sin leer"; } })()}`);
  } catch (e: any) {
    console.log(`[Orquestador] no se pudieron cargar las leyes aprendidas (${e?.message || e}); arranco solo con las curadas.`);
  }

  app.get("/api/espejos/leyes", (_req: Request, res: Response) => {
    return res.json(estadoOrquestador());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALUD v1 (Reflejo v5, manual §6.3) — la flota medida, no adivinada.
  // GET  /api/espejos/salud          → score/estado de cada espejo
  // POST /api/espejos/salud/dormir   → { id, dormir } a mano (el usuario manda)
  // POST /api/espejos/salud/reset    → { id? } borra la evidencia (nueva etapa)
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/espejos/salud", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      espejos: vistaSalud(TABLA_SALUD, [...IDS_ESPEJOS, ...poolEspejos().map((e: any) => e.id)]),
      umbrales: { dormido: 0.5, estrella: 0.95, usosMinimos: 8 },
      nota: "dormido = no se elige solo (la ruta explícita siempre lo alcanza) · estrella = sube en el desempate",
    });
  });

  app.post("/api/espejos/salud/dormir", (req: Request, res: Response) => {
    const id = String(req.body?.id || "");
    if (!id) return res.status(400).json({ ok: false, motivo: "falta «id» del espejo." });
    // Dormir a mano = sembrar la tabla con evidencia suficiente para que el
    // orquestador lo evite; despertar = borrar la evidencia. Sin campos mágicos.
    if (req.body?.dormir === false) {
      delete TABLA_SALUD[id];
    } else {
      TABLA_SALUD[id] = { usos: 10, exitos: 0, corregido: 0, ultima: new Date().toISOString() };
    }
    fijarTablaSalud(TABLA_SALUD);
    guardarSalud();
    return res.json({ ok: true, id, estado: estadoDe(TABLA_SALUD[id]) });
  });

  app.post("/api/espejos/salud/reset", (req: Request, res: Response) => {
    const id = req.body?.id ? String(req.body.id) : "";
    if (id) delete TABLA_SALUD[id];
    else TABLA_SALUD = {};
    fijarTablaSalud(TABLA_SALUD);
    guardarSalud();
    return res.json({ ok: true, reseteado: id || "toda la flota" });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO v1 (Reflejo v5) — el equipo por tarea, sin modelo y sin red.
  // POST /api/espejos/equipo  { texto }  → grupo recomendado + señales
  // (el selector global sigue en /api/consejo/espejos; esto es la pieza que
  //  el planificador y el chat usan para decidir TAREA a TAREA)
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/espejos/equipo", (req: Request, res: Response) => {
    const texto = typeof req.body?.texto === "string" ? req.body.texto : "";
    const eleccion = grupoPorTarea(texto);
    return res.json({
      ok: true,
      eleccion,
      grupos: GRUPOS_ESPEJOS.map((g) => ({ id: g.id, icono: g.icono, espejos: g.espejos })),
      nota: eleccion ? "" : "sin señales claras: el auto no lanza monedas — usa el grupo global o el espejo explícito",
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BÓVEDA v1 (Reflejo v5) — el transporte de imágenes al disco real.
  // GET  /api/boveda/estado     → config + si el puente PC está vivo
  // POST /api/boveda/configurar → { activa?, raiz? } (ej. "C:\\CN")
  // POST /api/boveda/preparar   → CON EL AGENTE crea el árbol indexado y
  //                               siembra INDICE.json en cada carpeta
  // GET  /api/boveda/indice     → el índice de una carpeta (IMAGENES…) leído
  //                               por el puente, parseado y listo para la UI
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/boveda/estado", async (_req: Request, res: Response) => {
    const puente = await puenteFetch("/api/health", {}, 2500).catch(() => null);
    return res.json({
      ok: true,
      config: BOVEDA,
      puenteVivo: !!puente,
      carpetas: Object.keys(CARPETAS_BOVEDA),
      nota: puente
        ? "el puente PC (:5000) responde: los transportes llegarán al disco real"
        : "el puente PC (:5000) no responde: las imágenes se guardan en el sandbox pero NO viajan; arranca el agente (iniciar_todo) y reintenta",
    });
  });

  app.post("/api/boveda/configurar", (req: Request, res: Response) => {
    const raiz = typeof req.body?.raiz === "string" ? req.body.raiz.trim() : "";
    if (raiz) {
      if (/[\u0000-\u001f]/.test(raiz) || raiz.length > 260) {
        return res.status(400).json({ ok: false, motivo: "raíz inválida (caracteres de control o demasiado larga)." });
      }
      BOVEDA.raiz = raiz;
    }
    if (typeof req.body?.activa === "boolean") BOVEDA.activa = req.body.activa;
    guardarBoveda();
    return res.json({ ok: true, config: BOVEDA });
  });

  app.post("/api/boveda/preparar", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: esto crea carpetas en el disco REAL vía el puente.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const sep = process.platform === "win32" ? "\\" : "/";
    const arbol = arbolInicial(BOVEDA.raiz, sep);
    const resultados: Array<{ carpeta: string; ok: boolean; nota: string }> = [];
    for (const carpeta of arbol) {
      const m = await puenteFetch("/api/fs/mkdir", { path: carpeta });
      const indiceRuta = carpeta + sep + "INDICE.json";
      let nota = m?.ok ? "carpeta creada" : "el puente no respondió" + (caminoCorrectoPara("el puente no respondió") ? ". CAMINO CORRECTO: " + caminoCorrectoPara("el puente no respondió") : "");
      if (m?.ok) {
        const previo = await puenteFetch("/api/fs/read", { path: indiceRuta });
        if (!previo?.ok) {
          await puenteFetch("/api/fs/write", { path: indiceRuta, content: JSON.stringify(indiceVacio(), null, 2) });
          nota += " · índice sembrado";
        } else {
          nota += " · índice ya existía (intacto)";
        }
      }
      resultados.push({ carpeta, ok: !!m?.ok, nota });
    }
    const vivo = resultados.filter((r) => r.ok).length;
    return res.json({
      ok: vivo > 0,
      raiz: BOVEDA.raiz,
      resultados,
      motivo: vivo ? "" : "el puente PC (:5000) no respondió: sin agente no hay manos fuera del sandbox. Arranca el agente y repite.",
    });
  });

  app.get("/api/boveda/indice", async (req: Request, res: Response) => {
    const carpeta = String(req.query.carpeta || "IMAGENES").toUpperCase();
    if (!(carpeta in CARPETAS_BOVEDA)) {
      return res.status(400).json({ ok: false, motivo: `carpeta indexada desconocida: «${carpeta}». Opciones: ${Object.keys(CARPETAS_BOVEDA).join(", ")}` });
    }
    const sep = process.platform === "win32" ? "\\" : "/";
    const ruta = `${BOVEDA.raiz.replace(/[\\/]+$/, "")}${sep}${CARPETAS_BOVEDA[carpeta as keyof typeof CARPETAS_BOVEDA]}${sep}INDICE.json`;
    const r = await puenteFetch("/api/fs/read", { path: ruta });
    if (!r?.ok) return res.json({ ok: false, motivo: r ? `el puente respondió mal: ${r.error || "sin contenido"}` : "el puente PC (:5000) no respondió", indice: null });
    return res.json({ ok: true, indice: parsearIndice(JSON.parse(r.content || "{}")) });
  });

  // ADUANA v2 — auditoría de tolerancia de entrada: «¿este archivo entra al
  // sandbox?». El frontend de adjuntos puede consultar antes de rechazar a
  // ciegas; la regla es entra todo salvo binarios de ejecución, con motivo.
  app.post("/api/entrada/auditar", (req: Request, res: Response) => {
    const nombres = Array.isArray(req.body?.nombres) ? req.body.nombres.map(String) : [];
    if (!nombres.length) return res.status(400).json({ ok: false, motivo: "falta «nombres» (array de nombres de archivo)." });
    const { aceptadas, rechazadas } = auditarEntradas(nombres);
    return res.json({ ok: true, aceptadas: aceptadas.length, rechazadas, tipos: [...new Set(aceptadas.map((a) => a.categoria))] });
  });

  app.post("/api/espejos/orquestar", async (req: Request, res: Response) => {
    const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
    if (!frase.trim()) return res.status(400).json({ ok: false, ms: 0, motivo: "falta «frase» (texto)." });
    const r = planificadorPorLeyes(frase);
    if (!r.ok) return res.status(422).json(r);

    // Reflejo v3.0 · extensión B — si la ley apunta a un Ollama externo, despachar
    if (r.modo === "ollama-externo" && r.endpoint) {
      try {
        const prompt = String((r.datos as any)?.prompt ?? frase);
        const body: Record<string, unknown> = {
          model: r.endpointModel || "gpt-3.5-turbo",
          prompt,
          stream: false,
        };
        if (r.endpointSystem) body.system = r.endpointSystem;
        const ext = await fetch(r.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j: any = await ext.json();
        return res.json({
          ...r,
          // Conservamos el resultado del Ollama externo bajo `respuestaOllama`
          // para que el llamador distinga: r.ok === true significa "la ley aplicó",
          // pero j.ok === false puede significar que el Ollama remoto falló.
          respuestaOllama: j,
          endpointUsado: r.endpoint,
          ms: r.ms,
        });
      } catch (e: any) {
        return res.status(502).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `la ley "${r.ley}" quería despachar a Ollama externo (${r.endpoint}) pero el fetch falló: ${e?.message || e}`,
        });
      }
    }

    // Modo espejo-local (default): ejecutar el espejo determinista y devolver su salida.
    if (r.espejo) {
      try {
        const er = ejecutarEntidad(r.espejo, r.datos ?? {});
        registrarSaludEspejo(r.espejo, !!er?.ok); // SALUD v1: el orquestado también cuenta
        return res.json({ ...r, resultadoEspejo: er });
      } catch (e: any) {
        registrarSaludEspejo(r.espejo, false);
        return res.status(500).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `el espejo "${r.espejo}" reventó al ejecutar: ${e?.message || e}`,
        });
      }
    }

    return res.json(r);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Reflejo v3.0 · extensión A — Endpoints URL por familia
  // ═══════════════════════════════════════════════════════════════════════════════
  // Permite a la app cliente FORZAR el enrutado a una familia específica sin
  // que el orquestador tenga que adivinar. Útil cuando el usuario ya sabe a
  // qué disciplina pertenece su pregunta ("esta es una pregunta de física")
  // y quiere evitar el riesgo de que el orquestador la enrute a otra familia.
  //
  // URL: POST /api/espejos/orquestar/:familia  body: { frase: "..." }
  // Familias válidas: física, matemática, lingüística, científica, cuántica,
  // antropológica, transformable, personalizada (+ las aprendidas).
  app.post("/api/espejos/orquestar/:familia", async (req: Request, res: Response) => {
    const familia = String(req.params.familia || "").trim();
    const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
    if (!frase.trim()) return res.status(400).json({ ok: false, ms: 0, motivo: "falta «frase» (texto)." });
    const r = orquestarPorFamilia(familia, frase);
    if (!r.ok) return res.status(422).json(r);

    // Mismo despacho que /api/espejos/orquestar: si la ley apunta a Ollama
    // externo, hacer fetch; si no, ejecutar el espejo local.
    if (r.modo === "ollama-externo" && r.endpoint) {
      try {
        const prompt = String((r.datos as any)?.prompt ?? frase);
        const body: Record<string, unknown> = {
          model: r.endpointModel || "gpt-3.5-turbo",
          prompt,
          stream: false,
        };
        if (r.endpointSystem) body.system = r.endpointSystem;
        const ext = await fetch(r.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j: any = await ext.json();
        return res.json({ ...r, respuestaOllama: j, endpointUsado: r.endpoint, ms: r.ms });
      } catch (e: any) {
        return res.status(502).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `la ley "${r.ley}" (familia ${familia}) quería despachar a Ollama externo (${r.endpoint}) pero el fetch falló: ${e?.message || e}`,
        });
      }
    }

    if (r.espejo) {
      try {
        const er = ejecutarEntidad(r.espejo, r.datos ?? {});
        return res.json({ ...r, resultadoEspejo: er });
      } catch (e: any) {
        return res.status(500).json({
          ok: false,
          ms: r.ms,
          ley: r.ley,
          espejo: r.espejo,
          motivo: `el espejo "${r.espejo}" (familia ${familia}) reventó al ejecutar: ${e?.message || e}`,
        });
      }
    }

    return res.json(r);
  });

  app.post("/api/consejo/espejos", (req: Request, res: Response) => {
    const ns = normalizarSeleccion(req.body);
    if (!ns.ok) return res.status(400).json({ ok: false, motivo: ns.motivo });
    fijarSeleccion(ns.seleccion);
    try {
      fs.mkdirSync(path.dirname(archivoEspejos), { recursive: true });
      fs.writeFileSync(archivoEspejos, JSON.stringify({ ...ns.seleccion, en: new Date().toISOString() }, null, 2));
    } catch (e: any) {
      console.log(`[Espejos] selección aplicada en memoria pero NO persistida (${e?.message || e}).`);
    }
    return res.json({ ok: true, seleccion: ns.seleccion });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Reflejo v3.0 · PASO 2 — ESPEJOS PERSONALIZADOS (.mjs instalables en caliente)
  // ═══════════════════════════════════════════════════════════════════════════════
  // Carga los espejos personalizados desde ~/.cerebronico/espejos/manifest.json
  // al arranque. Después expone 4 endpoints para gestionarlos en caliente:
  //
  //   GET  /api/espejos/personalizados       → lista espejos personalizados
  //   POST /api/espejos/instalar             → instala un .zip con un espejo nuevo
  //   POST /api/espejos/desinstalar          → desinstala un espejo por id
  //   POST /api/espejos/leyes/aprender       → añade una ley a leyes-aprendidas.json
  //   POST /api/espejos/leyes/desactivar     → marca una ley (curada o aprendida) como desactivada
  //
  // El directorio de espejos personalizados: PROJECT_ROOT/.cerebronico/espejos
  // (en producción) — relativo a donde se ejecuta el servidor.
  const dirEspejosPersonalizados = path.join(PROJECT_ROOT, ".cerebronico", "espejos");
  try {
    fs.mkdirSync(dirEspejosPersonalizados, { recursive: true });
    // Inicialización del pool: carga el manifest si existe. Es async porque
    // usa import() dinámico, pero el await está dentro de una IIFE para no
    // bloquear el setup del servidor. El pool queda listo cuando termina.
    (async () => {
      try {
        const r = await inicializarPool(dirEspejosPersonalizados);
        if (r.cargados.length > 0) {
          console.log(`[Espejos Personalizados] cargados: ${r.cargados.length} espejo(s) — ${r.cargados.map((e) => e.id).join(", ")}`);
        }
        if (r.fallidos.length > 0) {
          console.log(`[Espejos Personalizados] fallidos: ${r.fallidos.length} — ` + r.fallidos.map((f) => `${f.id} (${f.motivo})`).join(" · "));
        }
      } catch (e: any) {
        console.log(`[Espejos Personalizados] no se pudo inicializar el pool: ${e?.message || e}`);
      }
    })();
  } catch (e: any) {
    console.log(`[Espejos Personalizados] no se pudo crear el directorio ${dirEspejosPersonalizados}: ${e?.message || e}`);
  }

  // Catálogo público de espejos personalizados.
  app.get("/api/espejos/personalizados", (_req: Request, res: Response) => {
    if (!poolListo()) {
      return res.status(503).json({ ok: false, motivo: "el pool de espejos personalizados aún no se inicializó. Reintenta en 1 segundo o reinicia el servidor." });
    }
    return res.json(catalogoPersonalizados());
  });

  // Instalación: recibe un .zip con {espejo.mjs, manifest.json, (opcional leyes.json)}.
  // Lo descomprime en <dir>/<id>/ y recarga el pool.
  //
  // El .zip debe contener al menos:
  //   - manifest.json  (entrada única con el espejo que se instala)
  //   - el .mjs que manifest.json.ruta señale
  // Opcional:
  //   - leyes.json  (leyes que el orquestador usará para invocar el espejo)
  app.post("/api/espejos/instalar", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: instala ficheros en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    // Soporta multipart/form-data con campo "zip" o JSON con base64.
    // Para simplicidad v1: solo soportamos JSON con {zipBase64: "...", id: "..."}.
    const zipBase64 = String(req.body?.zipBase64 || "").trim();
    const idEspejo = String(req.body?.id || "").trim();
    if (!zipBase64) return res.status(400).json({ ok: false, motivo: "falta «zipBase64» (el .zip del espejo codificado en base64)." });
    if (!idEspejo || !/^espejo\./.test(idEspejo)) return res.status(400).json({ ok: false, motivo: "falta «id» o no empieza con «espejo.» (regla del manual)." });

    try {
      // Decodificar el base64 a Buffer
      const zipBuffer = Buffer.from(zipBase64, "base64");
      if (zipBuffer.length < 50) return res.status(400).json({ ok: false, motivo: "el .zip decodificado es demasiado pequeño (<50 bytes); probablemente el base64 está truncado." });

      // 🐞 DEFECTO v1.0.3: `require("jszip")` en un paquete ESM — require no
      // existe, así que INSTALAR UN ESPEJO-ZIP moría aquí con "require is not
      // defined" y el error salía genérico. La forma correcta ya estaba usada
      // en /api/extensions/install: import dinámico. Misma puerta, misma llave.
      const JSZipMod: any = await import("jszip");
      const JSZip = JSZipMod?.default || JSZipMod;
      const zip = await JSZip.loadAsync(zipBuffer);
      // Localiza manifest.json y el .mjs
      const archivos = Object.keys(zip.files);
      const manifestEntry = archivos.find((a: string) => a.endsWith("manifest.json") && !a.includes("__MACOSX"));
      if (!manifestEntry) return res.status(400).json({ ok: false, motivo: "el .zip no trae manifest.json en su raíz." });
      const manifestText = await zip.files[manifestEntry].async("string");
      let manifest: any;
      try {
        manifest = JSON.parse(manifestText);
      } catch (e: any) {
        return res.status(400).json({ ok: false, motivo: `manifest.json inválido: ${e?.message || e}` });
      }
      if (!Array.isArray(manifest.espejos) || manifest.espejos.length === 0) {
        return res.status(400).json({ ok: false, motivo: "manifest.espejos debe ser un array con al menos una entrada." });
      }
      const entrada = manifest.espejos[0];
      if (entrada.id !== idEspejo) {
        return res.status(400).json({ ok: false, motivo: `manifest.espejos[0].id ("${entrada.id}") ≠ id del request ("${idEspejo}"). Deben coincidir.` });
      }

      // Crea el directorio del espejo y escribe los archivos
      const dirDestino = path.join(dirEspejosPersonalizados, idEspejo);
      fs.mkdirSync(dirDestino, { recursive: true });
      // Escribe el .mjs
      const rutaMjs = path.join(dirDestino, path.basename(entrada.ruta));
      const mjsEntry = archivos.find((a: string) => a.endsWith(entrada.ruta) || a.endsWith(path.basename(entrada.ruta)));
      if (!mjsEntry) {
        return res.status(400).json({ ok: false, motivo: `el .zip no trae el archivo "${entrada.ruta}" que manifest.json referencia.` });
      }
      const mjsContent = await zip.files[mjsEntry].async("string");
      // v1.85.0 · FASE 6.4 — LA ADUANA ANTES DEL DISCO: nombre único contra las 51
      // curadas y el pool, proveedor/modelo reales y código sin red/disco/procesos.
      const aduanaEspejo = pasarAduanaForja({ ...entrada, ruta: entrada.ruta }, mjsContent, { existentes: catalogoPersonalizados().espejos.map((e: { id: string }) => e.id) });
      if (!aduanaEspejo.ok) return res.status(422).json({ ok: false, motivo: `aduana de forja: ${aduanaEspejo.rechazos.join(" · ")}`, rechazos: aduanaEspejo.rechazos, avisos: aduanaEspejo.avisos });
      if (aduanaEspejo.avisos.length) console.warn(`[espejos] ${idEspejo} se instala con avisos: ${aduanaEspejo.avisos.join(" · ")}`);
      fs.writeFileSync(rutaMjs, mjsContent, "utf8");

      // Escribe el manifest propio del espejo (entrada única)
      const manifestLocal = {
        version: "1.0",
        espejos: [{ ...entrada, ruta: path.basename(entrada.ruta) }],
      };
      fs.writeFileSync(path.join(dirDestino, "manifest.json"), JSON.stringify(manifestLocal, null, 2), "utf8");

      // Si el zip trae leyes.json, lo escribe en leyes-aprendidas.json del espejo
      const leyesEntry = archivos.find((a: string) => a.endsWith("leyes.json") && !a.includes("__MACOSX"));
      let leyesNuevas = 0;
      if (leyesEntry) {
        const leyesText = await zip.files[leyesEntry].async("string");
        let leyes: any;
        try {
          leyes = JSON.parse(leyesText);
        } catch {
          return res.status(400).json({ ok: false, motivo: "leyes.json inválido en el .zip." });
        }
        if (Array.isArray(leyes.leyes)) {
          // Añade cada ley a leyes-aprendidas.json (si no existe ya)
          const archivoLeyes = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
          let existentes: any[] = [];
          if (fs.existsSync(archivoLeyes)) {
            try { existentes = JSON.parse(fs.readFileSync(archivoLeyes, "utf8")).leyes || []; } catch {}
          }
          for (const ley of leyes.leyes) {
            if (!ley.id || !ley.patron || !ley.espejo) continue;
            if (existentes.find((l) => l.id === ley.id)) continue; // no duplicar
            existentes.push(ley);
            leyesNuevas++;
          }
          fs.mkdirSync(path.dirname(archivoLeyes), { recursive: true });
          fs.writeFileSync(archivoLeyes, JSON.stringify({ leyes: existentes, en: new Date().toISOString() }, null, 2), "utf8");
          // Recarga las leyes aprendidas en el orquestador
          cargarLeyesAprendidas(archivoLeyes);
        }
      }

      // Recarga el pool del cargador
      const r = await inicializarPool(dirEspejosPersonalizados);
      return res.json({
        ok: true,
        id: idEspejo,
        ruta: rutaMjs,
        leyesNuevas,
        pool: { cargados: r.cargados.length, fallidos: r.fallidos.length },
        nota: "espejo instalado y cargado en el pool. Ya es invocable vía /api/espejos/orquestar o directamente con ejecutarEntidad.",
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivo: `instalación falló: ${e?.message || e}` });
    }
  });

  // Desinstalación: elimina el directorio del espejo y lo quita del pool.
  app.post("/api/espejos/desinstalar", (req: Request, res: Response) => {
    const idEspejo = String(req.body?.id || "").trim();
    if (!idEspejo || !/^espejo\./.test(idEspejo)) return res.status(400).json({ ok: false, motivo: "falta «id» o no empieza con «espejo.»." });
    const dirDestino = path.join(dirEspejosPersonalizados, idEspejo);
    if (!fs.existsSync(dirDestino)) return res.status(404).json({ ok: false, motivo: `el espejo «${idEspejo}» no está instalado en ${dirDestino}.` });
    try {
      // Borrado recursivo
      fs.rmSync(dirDestino, { recursive: true, force: true });
      quitarDelPool(idEspejo);
      return res.json({ ok: true, id: idEspejo, eliminado: dirDestino });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivo: `desinstalación falló: ${e?.message || e}` });
    }
  });

  // Aprender una ley: añade una entrada a leyes-aprendidas.json.
  // Recibe: { id, familia, prioridad, patron (string regex), flags, datos?, espejo, descripcion, endpoint?, endpointModel?, endpointSystem? }
  app.post("/api/espejos/leyes/aprender", (req: Request, res: Response) => {
    const ley = req.body || {};
    if (!ley.id || !ley.patron || !ley.espejo) {
      return res.status(400).json({ ok: false, motivo: "falta «id», «patron» (regex como string) o «espejo»." });
    }
    // Compila el patrón para validarlo antes de guardarlo
    let patronCompilado: RegExp;
    try {
      patronCompilado = new RegExp(String(ley.patron), String(ley.flags || "i"));
    } catch (e: any) {
      return res.status(400).json({ ok: false, motivo: `patrón inválido: ${e?.message || e}` });
    }
    const archivoLeyes = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
    let existentes: any[] = [];
    if (fs.existsSync(archivoLeyes)) {
      try { existentes = JSON.parse(fs.readFileSync(archivoLeyes, "utf8")).leyes || []; } catch {}
    }
    // Si ya existe una ley con el mismo id, la reemplaza.
    const idx = existentes.findIndex((l) => l.id === ley.id);
    const nuevaLey = {
      id: String(ley.id),
      familia: String(ley.familia || "autoaprendible"),
      // 🐞 DEFECTO v1.0.3: aquí se guardaba `prioridad` absoluta pero el
      // cargador leía `prioridadOffset` (y sumaba 100): toda ley aprendida
      // con prioridad a medida renacía como 100. Se guarda el offset, que es
      // lo que el cargador entiende.
      prioridadOffset: Math.max(0, Number(ley.prioridad || 100) - 100),
      // Se guarda como string para que JSON lo pueda serializar; el cargador
      // lo reconstruye como RegExp con `new RegExp(patron, flags)`.
      patron: patronCompilado.source,
      flags: patronCompilado.flags,
      espejo: String(ley.espejo),
      descripcion: String(ley.descripcion || "(ley aprendida sin descripción)"),
      // Reflejo v5 · PLANTILLA: los datos serializables de la ley. Cada campo
      // admite `$1..$9` (grupos del regex) y `$input` (frase completa). Sin
      // esto, una ley aprendida no puede reconstruir su función `datos` tras
      // el reinicio — el bug que mataba el autoaprendizaje en silencio.
      ...(ley.plantilla && typeof ley.plantilla === "object" && !Array.isArray(ley.plantilla)
        ? {
            plantilla: Object.fromEntries(
              Object.entries(ley.plantilla as Record<string, unknown>)
                .filter(([, v]) => typeof v === "string")
                .map(([k, v]) => [String(k).replace(/[^\w.-]/g, "_"), String(v)])
            ),
          }
        : {}),
      ...(Number.isFinite(Number(ley.confianza)) ? { confianza: Math.max(0, Math.min(1, Number(ley.confianza))) } : {}),
      // Opcionales (extensión B): endpoint externo
      ...(ley.endpoint ? {
        endpoint: String(ley.endpoint),
        endpointModel: ley.endpointModel ? String(ley.endpointModel) : undefined,
        endpointSystem: ley.endpointSystem ? String(ley.endpointSystem) : undefined,
      } : {}),
      en: new Date().toISOString(),
    };
    if (idx >= 0) existentes[idx] = nuevaLey;
    else existentes.push(nuevaLey);
    fs.mkdirSync(path.dirname(archivoLeyes), { recursive: true });
    fs.writeFileSync(archivoLeyes, JSON.stringify({ leyes: existentes, en: new Date().toISOString() }, null, 2), "utf8");
    // Recarga las leyes aprendidas en el orquestador
    cargarLeyesAprendidas(archivoLeyes);
    return res.json({ ok: true, ley: nuevaLey, total: existentes.length });
  });

  // Desactivar una ley: la marca como desactivada (no se borra, sigue auditándola).
  app.post("/api/espejos/leyes/desactivar", (req: Request, res: Response) => {
    const idLey = String(req.body?.id || "").trim();
    if (!idLey) return res.status(400).json({ ok: false, motivo: "falta «id» de la ley a desactivar." });
    // Las leyes curadas (en LEYES_REFLEJO) NO se pueden desactivar por endpoint
    // — son parte del código. Solo se pueden desactivar las aprendidas.
    if (LEYES_REFLEJO.find((l) => l.id === idLey)) {
      return res.status(400).json({ ok: false, motivo: `«${idLey}» es una ley curada (parte del código). No se puede desactivar por endpoint; modifica orquestador.ts.` });
    }
    const archivoLeyes = path.join(PROJECT_ROOT, ".cerebro-db", "leyes-aprendidas.json");
    if (!fs.existsSync(archivoLeyes)) return res.status(404).json({ ok: false, motivo: "no hay leyes aprendidas guardadas (archivo leyes-aprendidas.json no existe)." });
    let existentes: any[];
    try {
      existentes = JSON.parse(fs.readFileSync(archivoLeyes, "utf8")).leyes || [];
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivo: `leyes-aprendidas.json inválido: ${e?.message || e}` });
    }
    const idx = existentes.findIndex((l) => l.id === idLey);
    if (idx < 0) return res.status(404).json({ ok: false, motivo: `la ley «${idLey}» no está en leyes-aprendidas.json.` });
    existentes[idx].desactivada = true;
    fs.writeFileSync(archivoLeyes, JSON.stringify({ leyes: existentes, en: new Date().toISOString() }, null, 2), "utf8");
    cargarLeyesAprendidas(archivoLeyes);
    return res.json({ ok: true, id: idLey, desactivada: true, totalActivas: existentes.filter((l) => !l.desactivada).length });
  });

  /**
   * EL CONDUCTOR (orquesta v2.6 en germen): consejo primero —si vota ≥0.8 el
   * neural NIQUIERA se despierta—, luego el director local con UNA ronda de
   * reparación (el error exacto del validador vuelve al modelo), y si aún así
   * no hay plan válido, FALLBACK determinista con todos los motivos. Ningún
   * JSON crudo del modelo llega al motor: todo pasa por `extraerOrdenes`.
   */
  app.post("/api/conductor", async (req: Request, res: Response) => {
    const frase = String(req.body?.frase || "").trim();
    if (!frase) return res.status(400).json({ ok: false, origen: "nada", motivo: "falta «frase»." });
    const consejo = pensarConsejo(frase, TABLAS.max);
    if (consejo.ok && consejo.confianza >= 0.8) {
      return res.json({ ok: true, origen: "consejo", confianza: consejo.confianza, entidad: consejo.entidad, salida: consejo.salida, nota: "el director neural no se despertó: el consejo resolvió solo." });
    }
    const modelo = String(req.body?.modelo || process.env.CEREBRONICO_DIRECTOR || "smollm2:135m-instruct-q3_K_S");
    const url = `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "")}/api/generate`;
    const system = instruccionesParaElModelo() + "\n\nAhora: convierte la frase del usuario en la orden que proceda. Si no puedes, responde exactamente NO ENTIENDO y el motivo.";
    const pedir = async (prompt: string): Promise<string> => {
      const rr = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelo, system, prompt, stream: false, format: "json", keep_alive: getProfile(modelo).keepAlive, options: buildOllamaOptions(modelo, undefined, CPU_CORES, RAM_GB) }), // v1.57.14: el director también paga su ventana; sin options heredaba el contexto global
        signal: AbortSignal.timeout(90_000),
      });
      if (!rr.ok) throw new Error(`el director (${modelo}) respondió HTTP ${rr.status}`);
      const jj: any = await rr.json();
      return String(jj.response || "");
    };
    try {
      let texto = await pedir(`Frase del usuario: ${frase}`);
      let ultimo = "";
      for (let reparaciones = 0; reparaciones <= 1; reparaciones++) {
        // El modelo puede devolver el JSON pelado o el bloque con cercas: el
        // envoltorio se añade SOLO si no lo trae, y la validación es la del chat.
        const bloque = texto.includes("cerebronico:") ? texto : "```cerebronico:plan\n" + texto + "\n```";
        const { ordenes, avisos } = extraerOrdenes(bloque);
        if (ordenes.length >= 1 && avisos.length === 0) {
          return res.json({ ok: true, origen: "director", modelo, reparaciones, bloque, ordenes });
        }
        ultimo = avisos.join(" · ") || "el director no devolvió una orden reconocible";
        if (reparaciones === 0) texto = await pedir(`Tu propuesta anterior fue RECHAZADA por el validador del IDE: ${ultimo}. Responde SOLO con el JSON corregido. Frase original: ${frase}`);
      }
      // Fallback: lo que el consejo sí supo, con sus motivos — nunca un vacío.
      return res.status(422).json({
        ok: false, origen: "fallback", director: { modelo, motivo: ultimo },
        consejo: consejo.ok ? { confianza: consejo.confianza, salida: consejo.salida } : { motivo: consejo.motivo || "el consejo tampoco votó" },
        motivo: "ni el consejo (confianza baja) ni el director (tras 1 reparación) produjeron una orden válida.",
      });
    } catch (e: any) {
      return res.status(502).json({
        ok: false, origen: "sin-director",
        motivo: `el director local no respondió (${e?.message || e}); el consejo dice: ${consejo.ok ? `confianza ${(consejo.confianza * 100).toFixed(0)}% por debajo del umbral 80%` : consejo.motivo || "sin voto"}.`,
        consejo_ok: consejo.ok, consejo_salida: consejo.salida,
      });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // EXPORTAR (v2.2 → v1.56.8): movido TAL CUAL a `server/routers/exportacion.ts`
  // y aquí solo se REGISTRA POR DELEGACIÓN. Se llama dentro de
  // `registerEngineRoutes`, en el mismo sitio donde vivían las rutas, para que la
  // extracción no cambie el momento de registro. Ojo: esto exporta la app QUE EL
  // MOTOR CREÓ, no el IDE — el APK es del proyecto del usuario. La ruta nueva
  // (`/api/export/android/proyecto`) produce el proyecto `android/` completo;
  // antes el IDE solo explicaba cómo salir a buscar Capacitor por internet.
  // ════════════════════════════════════════════════════════════════════════
  registrarExportacion(app, { projectRoot: PROJECT_ROOT, sandboxAuthorized });

  /**
   * Ida y vuelta A → B → A, con veredicto explícito. Es la comprobación que
   * distingue «se perdió y lo dije» de «se perdió y me callé»: lo segundo es un
   * fallo, y aquí se llama por su nombre.
   */
  app.post("/api/engine/convertir-verificar", (req: Request, res: Response) => {
    const desde = String(req.body?.formatoEntrada || "").toLowerCase() as FormatoConv;
    const hacia = String(req.body?.formatoSalida || "").toLowerCase() as FormatoConv;
    const contenido = typeof req.body?.contenido === "string" ? req.body.contenido : "";
    if (!FORMATOS_CONV.includes(desde) || !FORMATOS_CONV.includes(hacia)) {
      return res.status(400).json({ ok: false, error: `Formatos válidos: ${FORMATOS_CONV.join(", ")}.` });
    }
    if (desde === hacia) return res.status(400).json({ ok: false, error: "Los dos formatos son el mismo: no hay ida y vuelta que comprobar." });
    if (!contenido) return res.status(400).json({ ok: false, error: "Falta «contenido»." });

    const v = idaYVuelta(contenido, desde, hacia, (req.body?.opciones || {}) as any);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    const veredicto = v.igual ? "perfecto" : v.perdidasDeclaradas.length > 0 ? "perdida_declarada" : "PERDIDA_SILENCIOSA";
    return res.json({
      ok: true,
      veredicto,
      igual: v.igual,
      diferencias: v.diferencias.slice(0, 20),
      perdidasDeclaradas: v.perdidasDeclaradas,
      avisos: v.avisos,
      message:
        veredicto === "perfecto"
          ? `${desde} → ${hacia} → ${desde}: vuelve EXACTAMENTE lo mismo.`
          : veredicto === "perdida_declarada"
          ? `${desde} → ${hacia} → ${desde}: hay pérdidas, y están declaradas (${v.perdidasDeclaradas.length}). Es correcto: el formato no puede guardarlas.`
          : `${desde} → ${hacia} → ${desde}: PÉRDIDA SILENCIOSA. La conversión cambió datos sin avisar. Esto es un fallo.`,
    });
  });

  /** Estado de la base de datos (para el panel del motor). */
  app.get("/api/engine/kb/stats", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      size: engineKb.size(),
      tables: engineKb.stats(),
      file: ENGINE_DB_FILE,
      persisted: fs.existsSync(ENGINE_DB_FILE),
    });
  });

  /** El motor aprende: registra una lección como entrada consultable. */
  app.post("/api/engine/kb/learn", (req: Request, res: Response) => {
    const { id, text, tags } = req.body || {};
    if (!text || typeof text !== "string") return res.status(400).json({ ok: false, error: "Falta el texto de la lección." });
    engineKb.learnFromLesson(String(id || Date.now()), text, Array.isArray(tags) ? tags : []);
    // v1.74.0 · la enseñanza explícita también sale a LECCIONES.md en el acto.
    try { anotarLeccionViva({ fuente: "manual", titulo: "Lección de evolución", texto: String(text), keys: Array.isArray(tags) ? tags.map(String) : undefined }); } catch { /* */ }
    kbDirty = true;
    saveEngineKb(true);
    return res.json({ ok: true, size: engineKb.size() });
  });

  /** Alta/actualización manual de una entrada (para ampliar la base a mano). */
  app.post("/api/engine/kb/entry", (req: Request, res: Response) => {
    const entry = req.body;
    if (!entry?.id || !entry?.body) return res.status(400).json({ ok: false, error: "La entrada necesita id y body." });
    engineKb.upsert({
      id: String(entry.id),
      table: entry.table || "rule",
      title: String(entry.title || entry.id),
      body: String(entry.body),
      keys: Array.isArray(entry.keys) ? entry.keys.map(String) : [],
      lang: entry.lang,
      weight: typeof entry.weight === "number" ? entry.weight : 0.7,
    });
    kbDirty = true;
    saveEngineKb(true);
    return res.json({ ok: true, size: engineKb.size() });
  });

  /** Valida sintaxis sin escribir nada (útil para previsualizar y para tests). */
  app.post("/api/engine/guard", async (req: Request, res: Response) => {
    const { path: p, content } = req.body || {};
    // v1.6.32: este espejo del guardián también juzga con el parser real.
    const result = await guardFileProfundo(String(p || "archivo.txt"), String(content ?? ""), PARSER_ESBUILD);
    return res.json(result);
  });

  /**
   * El cliente informa del mapa del proyecto. Fase 2: además, el motor reindexa
   * los SÍMBOLOS leyendo los archivos del sandbox (no se envía contenido por la
   * red: se lee del disco, que es barato y siempre está al día).
   */
  app.post("/api/engine/sync", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: persiste la base de conocimiento en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    refreshEngineProjectMap(files.map((f: any) => ({ path: String(f?.path || ""), language: f?.language ? String(f.language) : undefined })));
    const index = reindexProjectSymbols();
    saveEngineKb(true);
    return res.json({
      ok: true,
      indexed: Math.min(files.length, 60),
      symbols: index,
      size: engineKb.size(),
    });
  });

  /** Fase 2 — Consulta pública del índice de símbolos del proyecto. */
  app.get("/api/engine/symbols", (req: Request, res: Response) => {
    const q = String(req.query.q || "");
    if (symbolMap.total === 0) reindexProjectSymbols();
    if (!q) {
      return res.json({
        ok: true,
        total: symbolMap.total,
        files: symbolMap.files.map((f) => ({ path: f.path, language: f.language, lines: f.lines, symbols: f.symbols.length })),
        summary: summarizeSymbols(symbolMap),
      });
    }
    const hits = findSymbols(symbolMap, q, Math.max(1, Math.min(30, Number(req.query.limit) || 10)));
    return res.json({
      ok: true,
      query: q,
      found: hits.length,
      results: hits.map((h) => ({ file: h.file, line: h.symbol.line, kind: h.symbol.kind, signature: h.symbol.signature })),
    });
  });

  /** Esquemas de herramientas que el motor aplica (contexto blindado). */
  app.get("/api/engine/tools", (_req: Request, res: Response) => {
    return res.json({ ok: true, tools: listToolPacks(), names: getAllToolNames() });
  });
}

function registerLocalPerformanceRoutes(app: express.Express): void {
  /**
   * Precalienta el modelo: lo carga en RAM (y reserva su contexto) antes de que
   * el usuario escriba. Medido: evita el "no contesta" del primer mensaje.
   */
  app.post("/api/ollama/warmup", async (req: Request, res: Response) => {
    const model = String(req.body?.model || "");
    if (!model) return res.status(400).json({ ok: false, error: "Falta el campo model" });
    const profile = getModelProfile(model, RAM_GB);
    const url = `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "")}/api/generate`;
    const started = Date.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 120_000);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: "",
          stream: false,
          keep_alive: keepAliveExplicito(profile.keepAlive),
          // Se reserva el contexto real que usará después: si no, Ollama
          // recarga el modelo con otra ventana y el precalentado no sirve.
          options: buildOllamaOptions(model, undefined, CPU_CORES, RAM_GB),
        }),
        signal: controller.signal,
      });
      clearTimeout(t);
      const ms = Date.now() - started;
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return res.status(502).json({ ok: false, model, ms, error: `Ollama respondió ${r.status}: ${body.slice(0, 200)}` });
      }
      return res.json({
        ok: true,
        model,
        ms,
        message: `Modelo listo en ${(ms / 1000).toFixed(1)} s (queda cargado ${keepAliveExplicito(profile.keepAlive)} y se expulsa solo al caducar).`,
        tier: profile.tier,
        numCtx: profile.numCtx,
        notes: profile.notes,
      });
    } catch (err: any) {
      const ms = Date.now() - started;
      const cls = classifyError(err);
      return res.status(502).json({
        ok: false,
        model,
        ms,
        error:
          cls.kind === "offline"
            ? "No se pudo hablar con Ollama (¿está arrancado en el puerto 11434?)"
            : `Falló el precalentado: ${cls.message}`,
        kind: cls.kind,
      });
    }
  });

  /** Salud profunda: estado de cada pieza + qué hacer si algo está mal. */
  // v2.1 — ¿HAY UNA COPIA MÁS NUEVA DEL PROYECTO DENTRO DE .proyectos?
  // ------------------------------------------------------------
  // CAUSA RAÍZ de la pantalla en blanco que sobrevivía a reinstalaciones.
  //
  // Había TRES sitios distintos —el estado, el aplanado y el resolutor de raíz—
  // que daban el trabajo por terminado en cuanto veían un `package.json` EN LA
  // RAÍZ:
  //     if (existe .proyectos/package.json)  →  "ya hay proyecto, no hay nada que hacer"
  // Y es razonable… salvo por un detalle que lo rompe todo: el sync escribe
  // SIEMPRE el árbol anidado, porque el workspace guarda las rutas con su carpeta
  // contenedora (`CerebroNico-IDE-v2.1/ide/backend/src/...`). Es decir, en la
  // raíz vive el proyecto VIEJO y dentro el proyecto RECIÉN SINCRONIZADO.
  //
  // Con esa condición, en cuanto la raíz tuvo un `package.json` (cosa que pasa en
  // el primer aplanado), el sandbox quedó CONGELADO para siempre: el sync seguía
  // escribiendo el árbol nuevo y nadie lo subía. Si el `src/` de la raíz venía de
  // una época en que el importador cortaba a los 40 archivos, conservaba
  // `main.tsx` y `App.tsx` —que entraban siempre— pero NO los componentes, que
  // eran justo los que el corte se comía. Resultado exacto y permanente: el
  // navegador cargaba el TÍTULO y devolvía 404 en TODOS los `/src/components/*`.
  //
  // Esta búsqueda mira DENTRO siempre, aunque la raíz ya tenga package.json.
  // ============================================================
  // La implementación vive en el ámbito del módulo (buscarProyectoAnidado),
  // porque la usan tanto este endpoint como /api/sandbox/status. Definirla aquí
  // dentro la dejaba invisible para el de estado: ReferenceError en tiempo de
  // ejecución y las dos rutas devolvían vacío.

  app.post("/api/sandbox/flatten-root", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: MUEVE archivos de sitio dentro del workspace.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    try {
      // v1.6.23 — F2: misma lista de artefactos que usa buscarProyectoAnidado
      // (antes cada lado tenía su set y el aplanado podía arrastrar un build/ o
      // .next/ viejo a la raíz). Se unifica; la de estado también entra.
      const skipDirs = new Set(["node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage", ".next", ".nuxt", "venv", "__pycache__", ".cerebro-db", ".cerebronico", ".vite"]);
      if (!fs.existsSync(PROJECT_ROOT)) {
        return res.json({ ok: false, moved: 0, message: `El sandbox todavía no existe en ${PROJECT_ROOT} (raíz de datos; «.proyectos» es solo el valor por defecto).` });
      }

      // ============================================================
      // v2.1 — 🐞 BUSCA A CUALQUIER PROFUNDIDAD (antes, solo UN nivel).
      // ------------------------------------------------------------
      // El log del usuario lo dejaba claro, línea a línea:
      //   "El package.json está en «CerebroNico-IDE-v2.0/ide/backend/»"  ← sí lo encontró
      //   "No hay ninguna subcarpeta con package.json en la raíz"        ← y aquí falló
      // Buscaba `package.json` solo en los hijos DIRECTOS de .proyectos, así que
      // un ZIP con «Contenedora/ide/backend/package.json» (DOS niveles) no tenía
      // candidato: el aplanado nunca se ejecutaba y el sandbox se quedaba sin
      // proyecto. Ahora usa la MISMA autoridad de raíz que el arranque
      // (resolverRaizProyecto → hasta 5 niveles), de modo que estado, aplanado y
      // arranque no pueden contradecirse.
      // ============================================================
      // Ya NO se usa resolverRaizProyecto() aquí: devuelve la raíz en cuanto ve
      // un package.json arriba (`if (enBase.pkg) → anidada: false`) y por eso un
      // proyecto anidado nunca se subía. Se busca la copia anidada siempre.
      const from = buscarProyectoAnidado();
      if (!from) {
        return res.json({
          ok: true,
          moved: 0,
          merged: 0,
          replaced: 0,
          skipped: [],
          message: "No hay ninguna copia anidada del proyecto: la raíz ya está al día.",
        });
      }
      // ============================================================
      // v1.6.24 — GUARDA-E: NO se aplana el suelo que pisa el programa vivo.
      // ------------------------------------------------------------
      // 🐞 Lo contó el log del usuario, hora por hora: el editor tenía una
      // copia de la PROPIA CerebróNico (183 archivos bajo «ide/»), el aplanado
      // se dispuso a renombrar la carpeta donde vive el proceso en ejecución a
      // la raíz del sandbox, /api/exec cayó sin package.json (ENOENT) y :3500
      // quedó sirviendo los restos de un servidor huérfano con su raíz
      // mudada — «pid externo», main.tsx 404, «página vacía».
      // Una copia DISTINTA de la IDE sigue siendo proyecto legítimo (la guarda
      // de recursión de /api/sandbox/start la trata con confirmación); lo que
      // está prohibido es mover la instalación desde la que se está corriendo.
      // ============================================================
      if (esCarpetaDeLaAppViva(from)) {
        const relE = path.relative(PROJECT_ROOT, from).split(path.sep).join("/") || ".";
        const msg =
          `La copia anidada «${relE}/» es la propia CerebróNico EN EJECUCIÓN (el programa arranca desde ahí): ` +
          "aplanarla movería los archivos del programa mientras corre. El sandbox debe contener TU app, no la IDE — quita «ide/» del editor o borra el sandbox y sincroniza solo tu proyecto.";
        console.warn(`[CerebroNico] 🧱 GUARDA-E: ${msg}`);
        return res.json({ ok: false, moved: 0, merged: 0, replaced: 0, skipped: [], from: relE, message: msg });
      }
      // ============================================================
      // v1.6.23 — GUARDA-D: identidad antes de fundir.
      // ------------------------------------------------------------
      // El criterio «manda la versión sincronizada» es correcto para la copia
      // más nueva del MISMO proyecto, y desastroso entre DOS proyectos
      // distintos: pisaba la app de la raíz con lo que hubiera anidado (así
      // `codigo-cerebronico` se convirtió en el proyecto del sandbox y el
      // piloto se puso a compilar la IDE). Si los package.json declaran
      // nombres distintos, la raíz se respalda primero en
      // `_respaldo-<iso>/` y el informe lo dice con los dos nombres.
      // ============================================================
      const pkgEn = (dir: string): string | null => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))?.name || null; } catch { return null; }
      };
      const veredictoD = decidirRespaldo(pkgEn(PROJECT_ROOT), pkgEn(from));
      let respaldo = "";
      const respaldoErrores: string[] = [];
      if (veredictoD.respaldar) {
        respaldo = path.join(PROJECT_ROOT, "_respaldo-" + new Date().toISOString().replace(/[:.]/g, "-"));
        try {
          fs.mkdirSync(respaldo, { recursive: true });
          for (const e of fs.readdirSync(PROJECT_ROOT)) {
            if (e === path.basename(respaldo)) continue;
            try {
              fs.renameSync(path.join(PROJECT_ROOT, e), path.join(respaldo, e));
            } catch (err: any) {
              respaldoErrores.push(`${e}: ${String(err?.message || err)}`);
            }
          }
        } catch (err: any) {
          respaldoErrores.push(`creación del respaldo: ${String(err?.message || err)}`);
        }
        console.log(`[CerebroNico] GUARDA-D: ${veredictoD.motivo}${respaldo ? ` Raíz respaldada en ${respaldo}.` : ""}${respaldoErrores.length ? ` ERRORES: ${respaldoErrores.join(" · ")}` : ""}`);
      }
      const relFrom = path.relative(PROJECT_ROOT, from) || ".";
      const moved: string[] = [];
      const fundidos: string[] = [];
      const reemplazados: string[] = [];
      const omitidos: string[] = [];

      // ============================================================
      // v2.1 — 🐞 EL APLANADO NO PUEDE DEJAR NADA ATRÁS EN SILENCIO
      // ------------------------------------------------------------
      // Antes había una sola línea:
      //     if (fs.existsSync(dst)) continue;   // "nunca pisar lo que ya está"
      // Suena prudente y era el peor fallo posible, porque el sandbox .proyectos
      // SE REUTILIZA: cada arranque vuelve a sincronizar sobre el mismo directorio.
      //
      // Secuencia que producía, paso a paso:
      //   1. El primer aplanado mueve el proyecto a la raíz, incluido «src/».
      //   2. El siguiente sync vuelve a escribir el árbol anidado.
      //   3. El segundo aplanado ve que «src» YA existe en la raíz → lo SALTA.
      //   4. La raíz se queda con el «src/» VIEJO para siempre; el nuevo y
      //      completo se descarta SIN UNA SOLA LÍNEA en el log.
      //
      // Y si ese «src/» viejo venía de un sandbox antiguo (cuando el importador
      // cortaba a los 40 archivos), conservaba main.tsx y App.tsx —que entraban
      // siempre— pero NO los componentes, que eran los que se comía el corte.
      // Resultado exacto y persistente: el navegador cargaba el TÍTULO y devolvía
      // 404 en TODOS los /src/components/*. La pantalla en blanco reportada
      // sobrevivía a reinstalaciones porque el «src» malo nunca se reemplazaba.
      //
      // Criterio nuevo: la versión SINCRONIZADA manda (es la que el editor
      // muestra). Si el destino ya existe, se FUNDE: los archivos del proyecto se
      // sobrescriben con la versión buena y lo que no venga en el ZIP se respeta.
      // Todo se cuenta y se reporta — nada de fallos mudos.
      // ============================================================
      const fusionar = (origen: string, destino: string): number => {
        let n = 0;
        let entradas: string[] = [];
        try {
          entradas = fs.readdirSync(origen);
        } catch {
          return 0;
        }
        for (const e of entradas) {
          // Nunca arrastrar carpetas de artefactos: si un node_modules se colara
          // dentro de algo que hay que fundir, la fusión copiaría decenas de
          // miles de archivos y pisaría el node_modules bueno de la raíz.
          if (skipDirs.has(e) || e === ".git") continue;
          const o = path.join(origen, e);
          const d = path.join(destino, e);
          let st;
          try {
            st = fs.statSync(o);
          } catch {
            continue;
          }
          if (st.isDirectory()) {
            // Si en el destino hay un ARCHIVO con ese nombre, hay que quitarlo
            // antes: mkdirSync fallaría y la fusión se abandonaría en silencio.
            let destinoEsDir = true;
            try {
              destinoEsDir = fs.statSync(d).isDirectory();
            } catch {
              destinoEsDir = true; // no existe: lo creará mkdirSync
            }
            if (!destinoEsDir) {
              try {
                fs.rmSync(d, { force: true });
              } catch {}
            }
            try {
              fs.mkdirSync(d, { recursive: true });
            } catch {}
            n += fusionar(o, d);
          } else {
            try {
              fs.copyFileSync(o, d);
              n++;
            } catch {}
          }
        }
        return n;
      };

      for (const item of fs.readdirSync(from)) {
        if (skipDirs.has(item)) continue;
        const src = path.join(from, item);
        const dst = path.join(PROJECT_ROOT, item);
        if (!fs.existsSync(dst)) {
          try {
            fs.renameSync(src, dst);
            moved.push(item);
          } catch (e: any) {
            omitidos.push(`${item} (${e?.message || e})`);
          }
          continue;
        }
        let esDir = false;
        try {
          esDir = fs.statSync(src).isDirectory();
        } catch {}
        if (esDir) {
          const n = fusionar(src, dst);
          fundidos.push(`${item} (${n})`);
          try {
            fs.rmSync(src, { recursive: true, force: true });
          } catch {}
        } else {
          try {
            fs.copyFileSync(src, dst);
            reemplazados.push(item);
          } catch (e: any) {
            omitidos.push(`${item} (${e?.message || e})`);
          }
        }
      }
      // Limpieza: se sube borrando las carpetas contenedoras que queden VACÍAS
      // (con dos niveles quedaban `Contenedora/ide/` colgando). rmdirSync falla
      // si la carpeta no está vacía, y ahí se para: nunca se borra contenido.
      let dir = from;
      for (let i = 0; i < 6; i++) {
        if (dir === PROJECT_ROOT) break;
        try {
          fs.rmdirSync(dir);
        } catch {
          break;
        }
        dir = path.dirname(dir);
      }
      console.log(
        `[CerebroNico] Sandbox aplanado: ${moved.length} movido(s)` +
          (fundidos.length ? ` · ${fundidos.length} fundido(s): ${fundidos.join(", ")}` : "") +
          (reemplazados.length ? ` · ${reemplazados.length} reemplazado(s): ${reemplazados.join(", ")}` : "") +
          (omitidos.length ? ` · ⚠️ ${omitidos.length} NO se pudo mover: ${omitidos.join(", ")}` : "") +
          ` (desde ${relFrom}/)`
      );
      return res.json({
        ok: omitidos.length === 0,
        moved: moved.length,
        merged: fundidos.length,
        replaced: reemplazados.length,
        skipped: omitidos,
        from: relFrom,
        // v1.6.23 — GUARDA-D: el respaldo viaja en la respuesta para que el
        // piloto lo escriba en el log con los dos nombres de proyecto.
        respaldo: respaldo || undefined,
        respaldoMotivo: veredictoD.respaldar ? veredictoD.motivo : undefined,
        respaldoErrores: respaldoErrores.length ? respaldoErrores : undefined,
        message:
          `Proyecto aplanado: ${moved.length} elemento(s) movidos desde «${relFrom}/» a la raíz del sandbox` +
          (fundidos.length ? `, ${fundidos.length} fundido(s) para actualizar el código que ya estaba` : "") +
          (reemplazados.length ? `, ${reemplazados.length} reemplazado(s)` : "") +
          (respaldo ? `. 🗄️ ${veredictoD.motivo} Raíz respaldada en «${path.basename(respaldo)}/»` : "") +
          (respaldoErrores.length ? `. ⚠️ Errores del respaldo: ${respaldoErrores.join(", ")}` : "") +
          (omitidos.length ? `. ⚠️ No se pudieron mover: ${omitidos.join(", ")}` : "."),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ============================================================
  // v2.1 — VERIFICACIÓN REAL DEL PREVIEW: ¿SE SIRVEN LOS MÓDULOS?
  // ------------------------------------------------------------
  // El puerto 3500 puede responder y el navegador quedarse en BLANCO con 404 en
  // /src/*. Visto desde fuera, eso es indistinguible de "todo bien": el semáforo
  // se pone verde, el log dice "Preview en vivo listo" y el usuario no ve nada.
  // Es exactamente el punto donde se perdió tanto tiempo.
  // Este endpoint comprueba, del lado del servidor (sin CORS de por medio), si
  // los módulos que el navegador va a pedir se sirven DE VERDAD.
  // ============================================================
  app.get("/api/sandbox/verify-preview", async (_req: Request, res: Response) => {
    // Se calcula aquí y no se usa la constante SANDBOX_PORT: vive dentro de
    // startServer() y este bloque está en otro ámbito (ReferenceError).
    const puertoSandbox = Number(process.env.SANDBOX_PORT) || 3500;
    const base = `http://127.0.0.1:${puertoSandbox}`;
    const raiz = resolverRaizProyecto().raiz;
    // ============================================================
    // v1.6.24 — EL VERIFICADOR TENÍA UN SOLO MUNDO EN LA CABEZA: VITE.
    // Exigía /src/main.tsx por HTTP, pero el sandbox de la vía rápida sirve
    // «/cn-preview.js» (el bundle de esbuild) y el anidado de producción
    // sirve «/assets/…»: en los dos casos legítimos el veredicto era el
    // mismo aviso falso —«preview quedará EN BLANCO»— sobre previews que
    // funcionaban, mientras el verdadero problema (un «pid externo» de otra
    // sesión) pasaba de largo. Ahora primero se pregunta QUÉ vía corre y se
    // sonda lo que esa vía promete servir.
    // ============================================================
    const leerSeguro = (p: string): string => {
      try {
        return fs.readFileSync(p, "utf-8");
      } catch {
        return "";
      }
    };
    let pkgRaiz: any = null;
    try {
      pkgRaiz = JSON.parse(leerSeguro(path.join(raiz, "package.json")));
    } catch {}
    const htmlRaiz = leerSeguro(path.join(raiz, "index.html"));
    let componentesEnDisco = 0;
    try {
      componentesEnDisco = fs.readdirSync(path.join(raiz, "src", "components")).filter((f) => /\.(tsx|jsx)$/i.test(f)).length;
    } catch {}
    const bundleEnDisco = fs.existsSync(path.join(raiz, NOMBRE_BUNDLE));
    const viaReportada: string = pkgRaiz?.name === "cerebronico-ide" ? "ide-anidada" : bundleEnDisco || htmlRaiz.includes(NOMBRE_BUNDLE) ? "estatico-compilado" : pkgRaiz ? "npm-dev" : "estatico-directo";

    type Sonda = { ruta: string; etiqueta: string; obligatorio: boolean };
    const sondas: Sonda[] = [{ ruta: "/", etiqueta: "HTML raíz", obligatorio: true }];
    if (viaReportada === "estatico-compilado") {
      sondas.push({ ruta: `/${NOMBRE_BUNDLE}`, etiqueta: "bundle esbuild", obligatorio: true });
    } else if (viaReportada === "npm-dev") {
      const compDir = path.join(raiz, "src", "components");
      let componentesEnDiscoViejo: string[] = [];
      try {
        componentesEnDiscoViejo = fs.readdirSync(compDir).filter((f) => /\.(tsx|jsx)$/i.test(f));
      } catch {}
      const primerComponente = componentesEnDiscoViejo[0] || "";
      // v1.56.8 — LA SONDA FANTASMA. Se exigía `/src/main.tsx` con
      // `obligatorio: true` SIN comprobar que existiera. En un proyecto cuya entrada
      // es `src/index.tsx` (o `app/main.tsx`) la sonda fallaba y el diagnóstico
      // mandaba reparar un archivo que el proyecto nunca usó: el bucle de
      // autocorrección perseguía un fantasma mientras el problema real seguía ahí.
      // Ahora se sonda la entrada VERIFICADA en disco; si no hay ninguna, se dice y
      // no se inventa una exigencia.
      const nombresSrc: string[] = [];
      try {
        for (const f of fs.readdirSync(path.join(raiz, "src"))) nombresSrc.push(`src/${f}`);
      } catch {}
      const sondaEntrada = sondaDeEntrada(null, nombresSrc);
      if (sondaEntrada) {
        sondas.push({ ruta: sondaEntrada.ruta, etiqueta: "entrada", obligatorio: true });
      } else {
        console.warn(
          "[CerebroNico] Vía rápida: no hay punto de entrada verificable en src/; no se exige ninguno " +
          "(antes se sondeaba /src/main.tsx aunque no existiera)."
        );
      }
      if (primerComponente) sondas.push({ ruta: `/src/components/${primerComponente.replace(/\.(tsx|jsx)$/i, "")}`, etiqueta: "componente", obligatorio: false });
    } else if (viaReportada === "ide-anidada") {
      const asset = (htmlRaiz.match(/(?:src|href)="(\/assets\/[^"]+)"/) || [])[1];
      if (asset) sondas.push({ ruta: asset, etiqueta: "asset de la IDE", obligatorio: true });
    } else {
      const jsRef = (htmlRaiz.match(/src="\.?\/?([\w./-]+\.js)"/) || [])[1];
      if (jsRef) sondas.push({ ruta: "/" + jsRef.replace(/^\/+/, ""), etiqueta: "script", obligatorio: false });
    }

    const resultados: Array<{ ruta: string; status: number; bytes: number }> = [];
    for (const s of sondas) {
      let status = 0;
      let bytes = 0;
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 4000);
        const resp = await fetch(base + s.ruta, { signal: ac.signal });
        clearTimeout(t);
        status = resp.status;
        bytes = (await resp.text()).length;
      } catch {
        status = -1;
      }
      resultados.push({ ruta: s.ruta, status, bytes });
    }
    const detalle = (r: { ruta: string; status: number; bytes: number }) => `${r.ruta}: HTTP ${r.status} (${r.bytes} B)`;
    const obligatorias = resultados
      .map((r, i) => ({ r, s: sondas[i] }))
      .filter((x) => x.s.obligatorio);
    const fallidas = obligatorias.filter((x) => !(x.r.status === 200 && x.r.bytes > 0));
    const paginaMuyFlaca = resultados[0] && resultados[0].status === 200 && resultados[0].bytes < 60;
    // v1.6.25-SANDBOXFIX3 — GUARDA-BUNDLE-DESNUDO en el verificador: un bundle
    // con imports desnudos responde 200 y aun así deja la pantalla en blanco.
    // Se lee el bundle de disco (sin pedirlo por HTTP) y se cuenta la verdad.
    const desnudosServidos =
      viaReportada === "estatico-compilado" ? importacionesDesnudas(leerSeguro(path.join(raiz, NOMBRE_BUNDLE))) : [];
    const ok = obligatorias.length > 0 && fallidas.length === 0 && !paginaMuyFlaca && desnudosServidos.length === 0;
    return res.json({
      ok,
      desnudos: desnudosServidos,
      base,
      raiz,
      via: viaReportada,
      componentesEnDisco,
      resultados,
      message: ok
        ? `Preview verificado (vía ${viaReportada}): ${obligatorias.map((x) => detalle(x.r)).join(" · ")}.`
        : desnudosServidos.length > 0
          ? `El bundle SE SIRVE (HTTP 200) pero el navegador NO puede ejecutarlo: quedó con ${desnudosServidos.length} import(s) desnudo(s) (${desnudosServidos.slice(0, 4).join(", ")}). Por eso el preview sale en blanco.`
          : paginaMuyFlaca
          ? `El puerto responde pero el HTML está VACIO (${resultados[0].bytes} bytes): el servidor no encontró su raíz. Detente, Sync completo y vuelve a arrancar.`
          : `El puerto responde pero no se sirve lo que la vía «${viaReportada}» promete. Obligatorio fallido: ${fallidas.map((x) => `${x.s.etiqueta} (${detalle(x.r)})`).join(" · ")}. ` +
            `Se sondó: ${resultados.map(detalle).join(" · ")}. Si arriba aparece un «pid externo», es un servidor huérfano de otra sesión: usa «Forzar Limpieza» y vuelve a Arrancar.`,
    });
  });

}

function registerExtensionRoutes(app: express.Express): void {
  /** Lista de extensiones instaladas (con estado y avisos) */
  // FORJA v1 — la misma compilación que usa el modelo vía forjar_complemento:
  // entra la receta, sale manifest+panel validados e instalados en extensions/.
  // Con tachas: TODOS los motivos y nada escrito.
  app.post("/api/extensions/forjar", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: crea una extensión en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    try {
      const existentes = fs.existsSync(EXTENSIONS_DIR) ? fs.readdirSync(EXTENSIONS_DIR) : [];
      const nr = normalizarReceta(req.body, existentes);
      if (!nr.ok) return res.status(400).json({ ok: false, motivos: nr.motivos });
      const archivos = generarArchivos(nr.receta);
      const vmf = validateManifest(JSON.parse(archivos[0].content));
      if (!vmf.ok) return res.status(500).json({ ok: false, motivos: ["el compilador produjo un manifest inválido (bug del sistema, repórtalo): " + vmf.errors.join("; ")] });
      const dir = path.join(EXTENSIONS_DIR, nr.receta.id);
      fs.mkdirSync(dir, { recursive: true });
      for (const a of archivos) fs.writeFileSync(path.join(dir, a.path), a.content, "utf8");
      return res.json({ ok: true, id: nr.receta.id, archivos: archivos.map((a) => a.path), uso: instruccionUso(nr.receta) });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivos: ["forja falló: " + String((e && e.message) || e)] });
    }
  });

  // COREO v1 — el bus de acción visual: la narración del plan llega aquí y
  // la Espina de Actividad lo baila (poll 700 ms, la arquitectura del puente).
  // ─── FONDO v1: fondo animado (gif/mp4/webm de 4–8 s) desde un archivo del
  // proyecto. El motor solo guarda un puntero y un tamaño; la respuesta es
  // STREAM: la máquina de pocos recursos paga el decodificado una vez (en el
  // navegador, con GPU si tiene) y no lo arrastra en cada tecla pulsada.
  const carpetaFondo = path.join(PROJECT_ROOT, ".cerebro-db");
  const metaFondoPath = path.join(carpetaFondo, "fondo.json");
  const binFondoPath = (ext: string) => path.join(carpetaFondo, "fondo" + ext);
  const leerMetaFondo = (): { tipo?: string } | null => {
    try { const mt = JSON.parse(fs.readFileSync(metaFondoPath, "utf8")); return mt && mt.tipo ? mt : null; } catch { return null; }
  };

  app.get("/api/fondo/meta", (_req: Request, res: Response) => {
    const mt = leerMetaFondo();
    res.json(mt ? { ...mt, activado: true } : { activado: false, nota: "sin fondo animado: el motor respira tranquilo" });
  });

  app.post("/api/fondo", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: escribe el fondo en disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const vf = validarFondo(req.body);
    if (!vf.ok) return res.status(400).json({ ok: false, motivos: vf.motivos });
    const abs = path.resolve(PROJECT_ROOT, vf.ruta);
    if (!dentroDe(PROJECT_ROOT, abs)) return res.status(400).json({ ok: false, motivos: ["la ruta salió del proyecto; de fuera no se sirve nada."] });
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
      return res.status(400).json({ ok: false, motivos: ['«' + vf.ruta + '» no existe en el proyecto. Primero deja el archivo dentro (arrastrarlo al explorador o pedirlo al chat).'] });
    const tipo = tipoDeArchivo(vf.ruta);
    if (!tipo) return res.status(400).json({ ok: false, motivos: ["el tipo se te escapó entre líneas: solo gif (≤4 MB), mp4 o webm (≤8 MB)."] });
    const st = fs.statSync(abs);
    if (st.size > LIMITES_BYTES[tipo])
      return res.status(400).json({ ok: false, motivos: ['esta máquina es de pocos recursos: .' + tipo + ' admite ' + limiteLegible(tipo) + ' y «' + vf.ruta + '» pesa ' + (st.size / 1048576).toFixed(1) + ' MB — baja la resolución o recórtalo a 4–8 s.'] });
    try {
      fs.mkdirSync(carpetaFondo, { recursive: true });
      for (const t of Object.keys(TIPOS_FONDO)) { try { fs.unlinkSync(binFondoPath("." + t)); } catch { /* si no estaba, mejor */ } }
      fs.copyFileSync(abs, binFondoPath("." + tipo));
      const mt = metaDeFondo(vf.ruta, tipo, st.size, new Date().toISOString());
      fs.writeFileSync(metaFondoPath, JSON.stringify(mt, null, 2));
      notificar("entregar", "fondo animado: " + vf.ruta); // el capricho, al menos, se anuncia por el bus
      return res.json({ ok: true, meta: mt });
    } catch (e: any) {
      return res.status(500).json({ ok: false, motivos: ["el fondo no pudo alojarse: " + String((e && e.message) || e)] });
    }
  });

  app.get("/api/fondo", (_req: Request, res: Response) => {
    const mt = leerMetaFondo();
    if (!mt || !mt.tipo) return res.status(404).json({ ok: false, motivo: "no hay fondo activado." });
    const bin = binFondoPath("." + mt.tipo);
    if (!fs.existsSync(bin)) return res.status(404).json({ ok: false, motivo: "el meta anuncia fondo pero el archivo no está: vuélvelo a activar." });
    res.setHeader("Content-Type", TIPOS_FONDO[mt.tipo as keyof typeof TIPOS_FONDO] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    fs.createReadStream(bin).pipe(res);
  });

  app.delete("/api/fondo", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: borra el fondo del disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    for (const t of Object.keys(TIPOS_FONDO)) { try { fs.unlinkSync(binFondoPath("." + t)); } catch { /* nada que borrar */ } }
    try { fs.unlinkSync(metaFondoPath); } catch { /* sin meta, sin drama */ }
    res.json({ ok: true, quitado: true, nota: "la IDE vuelve a su negro de siempre" });
  });

  // ─── CONTENEDOR GENERAL v8.0.2 ───────────────────────────────────────────
  // Inspecciona cualquier cosa que el usuario suelte y dice la verdad sobre ella:
  // qué ES de verdad (por firma mágica, no por el nombre), en qué se contradice,
  // qué se puede hacer con ella y QUÉ SE PERDERÍA al convertirla.
  //
  // Solo INFORMA. No convierte, no escribe y no lanza comandos: la escritura y la
  // ejecución siguen siendo de quien ya tenía permiso para hacerlas. Un contenedor
  // que además actúa sin que nadie lea el plan es un riesgo con buena interfaz.
  // ─── MEDICIÓN DEL PUENTE (CN v1.5.0) ─────────────────────────────────────
  //
  // LA PUERTA QUE FALTABA. El motor anunciaba «medición de TTFT en tiempo real»
  // en su catálogo de habilidades (`src/data/skills100.ts`) y **no había ni una
  // línea que lo midiera**. Aquí se mide de verdad: contra el Ollama real, por el
  // camino de streaming real, y comparando los DOS transportes.
  //
  // Las tres honestidades que este endpoint respeta:
  //  1. Si Ollama no responde, DICE QUE NO RESPONDE. No devuelve ceros ni una
  //     estimación: un banco que se inventa la respuesta no mide el sistema,
  //     mide su propia imaginación.
  //  2. El TTFT que sale aquí INCLUYE el arranque del modelo y el procesado del
  //     prompt. Es el número que de verdad siente el usuario, y también significa
  //     que la primera medición tras cargar un modelo sale mal a propósito: el
  //     motor espera hasta 3 minutos al primer byte por eso mismo.
  //  3. El socket Unix SÓLO se mide si el archivo existe. Si no está, se dice que
  //     no está en vez de comparar contra un cero que parecería una victoria.
  app.post("/api/puente/medir", async (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: acepta un socket arbitrario y sale a la red.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const cuerpo = (req.body || {}) as {
      modelo?: string; texto?: string; socket?: string; repeticiones?: number;
      /** v1.6.4 — Si es true, se inyecta el conocimiento del motor ANTES del texto. */
      contexto?: boolean;
      /** Cuántas entradas del motor se inyectan (por defecto, las 25 de la v1.0.0). */
      entradas?: number;
      /** Presupuesto en caracteres del bloque inyectado (por defecto, 5.500). */
      presupuesto?: number;
      /** Cuánto tiempo mantiene Ollama el modelo cargado. -1 = para siempre. */
      keepAlive?: string | number;
    };
    const base = (process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/, "");
    const textoBase = typeof cuerpo.texto === "string" && cuerpo.texto.trim() ? cuerpo.texto.trim() : "Di solamente: hola";

    // v1.6.4 — LA PREGUNTA QUE DE VERDAD IMPORTA, hecha medible.
    //
    // En la v1.0.0 subí x5 el conocimiento inyectado (5 -> 25 entradas, 1.100 ->
    // 5.500 caracteres) y lo documenté como un INTERCAMBIO: más conocimiento a
    // cambio de más latencia. Lo que no hice fue medir el coeficiente. Eso es
    // exactamente lo que este interruptor permite: la misma pregunta, con y sin
    // el bloque del motor, para ver cuánto TTFT cuesta el conocimiento.
    //
    // En un modelo local el tiempo suele irse en PROCESAR EL PROMPT, no en
    // generar. Si eso se confirma aquí, el bloque x5 es la palanca más grande de
    // todo el sistema — y es una palanca que yo mismo moví a ciegas.
    let entrada = textoBase;
    let contextoInyectado = 0;
    if (cuerpo.contexto) {
      try {
        const limite = Number.isFinite(cuerpo.entradas as number) ? (cuerpo.entradas as number) : 25;
        const presupuesto = Number.isFinite(cuerpo.presupuesto as number) ? (cuerpo.presupuesto as number) : 5500;
        const bloque = buildEngineContext(engineKb, textoBase, limite, presupuesto);
        if (bloque && bloque.trim()) {
          entrada = bloque + "\n\n" + textoBase;
          contextoInyectado = bloque.length;
        }
      } catch (e: any) {
        console.warn("[puente] No se pudo inyectar el contexto del motor:", e?.message || e);
      }
    }

    // 1. ¿Hay Ollama, y qué modelos tiene?
    let modelos: string[] = [];
    try {
      const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) throw new Error(`respondió ${r.status}`);
      const d: any = await r.json();
      modelos = (d?.models || []).map((m: any) => String(m?.name || "")).filter(Boolean);
    } catch (e: any) {
      return res.json({
        ok: false,
        motivo: `Ollama no responde en ${base} (${e?.message || e}). Sin motor no hay TTFT que medir.`,
        pista: "Arranca Ollama, o pasa la dirección real en la variable OLLAMA_URL.",
      });
    }
    if (modelos.length === 0) {
      return res.json({
        ok: false,
        motivo: "Ollama está vivo pero no tiene ningún modelo instalado.",
        pista: "`ollama pull <modelo>` — y para el lado nube, un nombre que contenga `-cloud`.",
      });
    }

    const nube = modelos.find((n) => /cloud/i.test(n)) || null;
    const modelo = cuerpo.modelo && modelos.includes(cuerpo.modelo) ? cuerpo.modelo : nube || modelos[0];

    const puenteDe = (url: string): PuenteIA =>
      new PuenteNube(url, (texto) => ({
        model: modelo,
        messages: [{ role: "user", content: texto }],
        stream: true,
        options: { ...buildOllamaOptions(modelo, undefined, CPU_CORES, RAM_GB), num_predict: 24 }, // medir el ARRANQUE con la ventana REAL del equipo, no con el default
        // v1.6.4 — El MODELO CARGADO es la diferencia entre segundos y
        // milisegundos. Ollama lo descarga al cabo de unos minutos de inactividad
        // (keep_alive por defecto, 5 min), así que el primer mensaje tras una
        // pausa paga la carga entera. Ese es el peor caso del usuario, y es el
        // único que no se ve si uno mide siempre seguido. Se puede fijar con
        // cuerpo.keepAlive (-1 = mantener cargado).
        ...(cuerpo.keepAlive !== undefined ? { keep_alive: cuerpo.keepAlive } : {}),
      }));

    // 2. Transporte TCP loopback: el que usa el motor hoy.
    let tcp;
    try {
      tcp = await medirPuente(puenteDe(`${base}/api/chat`), entrada, 256);
    } catch (e: any) {
      return res.json({ ok: false, modelo, modelos, motivo: `La petición al motor falló: ${e?.message || e}` });
    }

    // 3. Transporte socket Unix: sólo si existe de verdad.
    const rutaSocket = String(cuerpo.socket || process.env.OLLAMA_SOCKET || "");
    let uds: typeof tcp | null = null;
    let udsMotivo = "";
    if (!rutaSocket) udsMotivo = "No se pidió socket Unix (parámetro `socket` o variable OLLAMA_SOCKET).";
    else if (!fs.existsSync(rutaSocket)) udsMotivo = `El socket ${rutaSocket} no existe: no se compara contra la nada.`;
    else {
      try {
        uds = await medirPuente(puenteUds(rutaSocket, modelo, entrada), entrada, 256);
      } catch (e: any) {
        udsMotivo = `El socket existe pero la medición falló: ${e?.message || e}`;
      }
    }

    const ahorro = uds ? Math.round((tcp.ttftMs - uds.ttftMs) * 100) / 100 : null;

    return res.json({
      ok: true,
      modelo,
      esNube: /cloud/i.test(modelo),
      modelosDisponibles: modelos,
      umbralesMs: UMBRAL_TTFT_MS,
      resultados: { tcp, uds },
      comparacion: uds
        ? `Socket Unix: ${ahorro! > 0 ? ahorro + " ms MENOS" : Math.abs(ahorro!) + " ms MÁS"} en el TTFT.`
        : `Sin comparación de transporte. ${udsMotivo}`,
      veredicto: veredicto(tcp),
      // v1.6.4 — Se declara QUÉ se ha medido. Dos corridas con distinto contexto
      // dan números distintos, y sin esta línea serían incomparables.
      contextoInyectadoCaracteres: contextoInyectado,
      longitudPrompt: entrada.length,
      modeloCargado: cuerpo.keepAlive === undefined ? "por defecto de Ollama (se descarga al rato)" : String(cuerpo.keepAlive),
      nota:
        "El TTFT incluye la carga del modelo y el procesado del prompt: es el número que siente el usuario. " +
        "En frío (modelo sin cargar) puede tardar minutos, y eso es correcto, no un fallo.",
    });
  });

  app.post("/api/contenedor/inspeccionar", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: lanza `ffmpeg` sobre el fichero indicado.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const { nombre, base64, mimeDeclarado, motores, destino } = (req.body || {}) as {
      nombre?: string;
      base64?: string;
      mimeDeclarado?: string;
      motores?: MotorContenedor[];
      destino?: string;
    };

    if (!nombre) {
      return res.status(400).json({
        ok: false,
        motivo:
          "falta «nombre»: sin él no hay extensión que contrastar, y el nombre es una de las dos pistas que hay que denunciar cuando miente.",
      });
    }

    let bytes: Uint8Array | null = null;
    if (base64) {
      try {
        bytes = new Uint8Array(Buffer.from(String(base64), "base64"));
      } catch {
        return res.status(400).json({ ok: false, motivo: "«base64» no es base64 válido." });
      }
    }

    // Los motores por defecto son los que el SERVIDOR puede ofrecer de verdad:
    // `js-puro` y `red` siempre; `ffmpeg` SOLO si el binario responde. Suponer que
    // ffmpeg está porque «debería estarlo» es exactamente la promesa falsa que
    // este módulo existe para evitar, así que se comprueba, no se asume.
    const detectados: MotorContenedor[] =
      Array.isArray(motores) && motores.length
        ? motores
        : ["js-puro", "red", ...(tieneFfmpeg() ? (["ffmpeg"] as MotorContenedor[]) : ([] as MotorContenedor[]))];

    const inspeccion = inspeccionar({ nombre, bytes, mimeDeclarado });
    const plan = destino ? planDeEntrega(inspeccion, destino, detectados) : null;

    return res.json({
      ok: true,
      inspeccion,
      capacidades: capacidades(detectados),
      plan,
      motoresDetectados: detectados,
      video: estadoCadenaVideo(process.env as Record<string, string | undefined>),
      nota: "Esto es un INFORME, no una conversión: nada se ha escrito ni modificado.",
    });
  });

  /** ¿Hay ffmpeg de verdad en esta máquina? Se pregunta, no se supone. */
  function tieneFfmpeg(): boolean {
    try {
      const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf-8", timeout: 5000, windowsHide: true });
      return r.status === 0;
    } catch {
      return false;
    }
  }

  // ─── ESPEJO DEL PROYECTO v8.0.7 ──────────────────────────────────────────
  // Devuelve el cotejo entre lo que HAY en el sandbox y lo que ese tipo de
  // proyecto DEBE tener. Es la pieza que faltaba: el modelo no se olvidaba de
  // escribir bien, se olvidaba de CUÁNTOS archivos tiene un proyecto. Aquí se le
  // puede decir «te faltan estos dos», que es una respuesta binaria y por eso un
  // modelo pequeño sí sabe usarla.
  //
  // LECTURA ACOTADA a propósito: profundidad 5 y 600 entradas como techo. Un
  // cotejo que tarda o se atasca en un node_modules de 40.000 archivos no lo
  // usaría nadie.
  app.get("/api/proyecto/espejo", (req: Request, res: Response) => {
    const plantillaId = typeof req.query.plantilla === "string" ? req.query.plantilla : undefined;
    const rutas: string[] = [];
    const ignorar = new Set([
      "node_modules", ".git", "dist", "dist_electron", "build", "out", "coverage",
      "venv", ".venv", "__pycache__", ".cerebro-db", ".vite", ".next", ".nuxt",
    ]);
    const recorrer = (dir: string, rel: string, prof: number): void => {
      if (prof > 5 || rutas.length >= 600) return;
      let entradas: fs.Dirent[] = [];
      try {
        entradas = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entradas) {
        if (rutas.length >= 600) return;
        if (ignorar.has(e.name)) continue;
        const relHijo = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          recorrer(path.join(dir, e.name), relHijo, prof + 1);
        } else {
          rutas.push(relHijo);
        }
      }
    };
    recorrer(PROJECT_ROOT, "", 0);

    const cmp = compararConEspejo(rutas, plantillaId);
    return res.json({
      ok: true,
      raiz: PROJECT_ROOT,
      totalArchivos: rutas.length,
      truncado: rutas.length >= 600,
      // Las rutas del espejo se dan en relación con el sandbox, no en absoluto:
      // el usuario no necesita rutas del disco para entender qué falta.
      plantilla: cmp.plantilla ? { id: cmp.plantilla.id, nombre: cmp.plantilla.nombre } : null,
      completo: cmp.completo,
      faltan: cmp.faltan,
      faltanObligatorios: cmp.faltanObligatorios,
      pregunta: preguntaDeFaltantes(cmp),
      espejoParaPrompt: cmp.espejoParaPrompt,
    });
  });

  app.get("/api/coreo", (_req: Request, res: Response) => res.json(coreoEstado()));

  app.get("/api/extensions", (_req: Request, res: Response) => {
    try {
      const list = refreshExtensionTools();
      return res.json({
        apiVersion: EXTENSION_API_VERSION,
        dir: EXTENSIONS_DIR,
        extensions: list.map((e) => ({ ...e, problems: e.error ? [e.error] : [] })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Error listando extensiones" });
    }
  });

  app.post("/api/extensions/:id/enable", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: muta el estado de extensiones y refresca herramientas.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    // v2.1 — `req.params.id` está tipado como `string | string[]`: Express no
    // garantiza el tipo aunque en un parámetro con nombre siempre llegue texto.
    // Se normaliza con String() para que el tipo diga la verdad y no se cuele
    // un array por una función que espera cadena.
    disabledExtensions.delete(String(req.params.id));
    saveExtensionsState();
    refreshExtensionTools();
    return res.json({ ok: true, enabled: true });
  });

  app.post("/api/extensions/:id/disable", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: muta el estado de extensiones.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    disabledExtensions.add(String(req.params.id));
    saveExtensionsState();
    refreshExtensionTools();
    return res.json({ ok: true, enabled: false });
  });

  app.delete("/api/extensions/:id", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: BORRA una carpeta de extensión del disco.
    if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    try {
      const abs = path.resolve(EXTENSIONS_DIR, String(req.params.id));
      if (!abs.startsWith(EXTENSIONS_DIR) || !fs.existsSync(abs)) {
        return res.status(404).json({ ok: false, message: "Extensión no encontrada." });
      }
      fs.rmSync(abs, { recursive: true, force: true });
      // v2.1 — `req.params.id` está tipado como `string | string[]`: Express no
    // garantiza el tipo aunque en un parámetro con nombre siempre llegue texto.
    // Se normaliza con String() para que el tipo diga la verdad y no se cuele
    // un array por una función que espera cadena.
    disabledExtensions.delete(String(req.params.id));
      saveExtensionsState();
      refreshExtensionTools();
      return res.json({ ok: true, message: "Extensión desinstalada." });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || "Error desinstalando." });
    }
  });

  /**
   * Instalación desde ZIP (cuerpo binario).
   * Protecciones: límite de tamaño, rechazo de rutas con ".." (Zip-Slip),
   * límite de número de archivos y validación del manifiesto ANTES de dejar
   * nada en disco: si el manifiesto no es válido, se borra lo extraído.
   */
  app.post(
    "/api/extensions/install",
    express.raw({ type: ["application/zip", "application/octet-stream"], limit: "25mb" }),
    async (req: Request, res: Response) => {
      try {
        const buf = req.body as Buffer;
        if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
          return res.status(400).json({ ok: false, message: "No se recibió ningún ZIP." });
        }
        const JSZipMod: any = await import("jszip");
        const JSZip = JSZipMod?.default || JSZipMod;
        const zip = await JSZip.loadAsync(buf);

        const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
        if (entries.length > 500) {
          return res.status(400).json({ ok: false, message: "El ZIP tiene demasiados archivos (máximo 500)." });
        }
        for (const name of entries) {
          if (name.includes("..") || name.startsWith("/") || /^[a-zA-Z]:/.test(name)) {
            return res.status(400).json({ ok: false, message: `Ruta no permitida en el ZIP: ${name}` });
          }
        }

        // ¿El manifiesto está en la raíz o dentro de una única carpeta?
        const manifestEntry = entries.find((n) => n === "manifest.json") || entries.find((n) => n.endsWith("/manifest.json"));
        if (!manifestEntry) {
          return res.status(400).json({ ok: false, message: "El ZIP no contiene manifest.json." });
        }
        const rootPrefix = manifestEntry.includes("/") ? manifestEntry.slice(0, manifestEntry.lastIndexOf("/") + 1) : "";

        let manifestRaw: any = null;
        try {
          manifestRaw = JSON.parse(await zip.files[manifestEntry].async("string"));
        } catch (err: any) {
          return res.status(400).json({ ok: false, message: `manifest.json inválido: ${err?.message || err}` });
        }
        const validation = validateManifest(manifestRaw);
        if (!validation.ok) {
          return res.status(400).json({ ok: false, message: `Manifiesto rechazado: ${validation.errors.join(" ")}` });
        }

        const targetDir = path.join(EXTENSIONS_DIR, manifestRaw.id);
        if (fs.existsSync(targetDir)) {
          return res.status(409).json({
            ok: false,
            message: `Ya existe una extensión con id "${manifestRaw.id}". Desinstálala antes de reinstalar.`,
          });
        }
        fs.mkdirSync(targetDir, { recursive: true });

        let written = 0;
        for (const name of entries) {
          const rel = rootPrefix && name.startsWith(rootPrefix) ? name.slice(rootPrefix.length) : name;
          if (!rel) continue;
          const destAbs = path.resolve(targetDir, rel);
          if (!destAbs.startsWith(targetDir)) continue; // doble comprobación anti Zip-Slip
          fs.mkdirSync(path.dirname(destAbs), { recursive: true });
          const data = await zip.files[name].async("nodebuffer");
          fs.writeFileSync(destAbs, data);
          written++;
        }

        refreshExtensionTools();
        return res.json({
          ok: true,
          message: `Extensión "${manifestRaw.name}" instalada (${written} archivo(s)). Abre su pestaña para usarla.`,
          warnings: validation.warnings,
          extension: { id: manifestRaw.id, name: manifestRaw.name },
        });
      } catch (err: any) {
        return res.status(500).json({ ok: false, message: err?.message || "Error instalando la extensión." });
      }
    }
  );

  /** El cliente informa qué paneles tiene abiertos y recoge una invocación pendiente. */
  app.get("/api/extensions/invocations", (req: Request, res: Response) => {
    const open = String(req.query.open || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    openExtensionPanels.clear();
    open.forEach((id) => openExtensionPanels.add(id));

    for (const inv of pendingInvocations.values()) {
      if (!openExtensionPanels.has(inv.extId)) continue;
      return res.json({ id: inv.id, extId: inv.extId, command: inv.command, args: inv.args });
    }
    return res.status(204).end();
  });

  /** Resultado de la extensión. */
  app.post("/api/extensions/invocations/:id/result", (req: Request, res: Response) => {
    const inv = pendingInvocations.get(String(req.params.id));
    if (!inv) return res.status(404).json({ ok: false, message: "Invocación no encontrada o expirada." });
    clearTimeout(inv.timer);
    pendingInvocations.delete(String(req.params.id));
    inv.resolve({
      ok: req.body?.ok !== false,
      result: req.body?.result,
      error: req.body?.error,
    });
    return res.json({ ok: true });
  });

  /**
   * Sirve los archivos de las extensiones.
   * CSP estricta: la extensión solo puede cargar recursos propios o datos
   * incrustados — se le corta la red directa (`connect-src 'none'`), así que
   * cualquier acceso externo tiene que pasar por el puente de permisos.
   */
  app.get("/extensions/*", (req: Request, res: Response) => {
    const rel = decodeURIComponent(String((req.params as any)[0] || ""));
    const abs = path.resolve(EXTENSIONS_DIR, rel);
    if (!abs.startsWith(EXTENSIONS_DIR)) return res.status(403).end();
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return res.status(404).end();

    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
      ".txt": "text/plain; charset=utf-8",
    };
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline' data: blob:; img-src * data: blob:; connect-src 'none'; frame-ancestors 'self'"
    );
    const ext = path.extname(abs).toLowerCase();

    // ============================================================
    // v2.1 — 🐞 "EL PANEL DE PLUGINS CASI NI SE VE DE TAN CHIQUITO"
    // ------------------------------------------------------------
    // El panel de una extensión es un documento APARTE (iframe de origen opaco),
    // así que el tamaño de letra de la IDE —25px en el ajuste global— NO llega
    // dentro. El panel se ve con el CSS que traiga su propio HTML: el de ejemplo
    // venía con 13px de base y 11px en botones y listados, ilegible al lado del
    // resto de la interfaz.
    //
    // Aquí se le inyecta una base legible a TODO HTML servido como extensión. Va
    // justo antes de </body> a propósito: así queda DESPUÉS del CSS del panel y
    // gana en la cascada a igual especificidad, sin tocar el archivo del autor.
    // Es aditivo: si algo falla, se sirve el archivo tal cual.
    // ============================================================
    if (ext === ".html") {
      try {
        let html = fs.readFileSync(abs, "utf8");
        if (!html.includes("data-cn-base-font")) {
          const estilo =
            "<style data-cn-base-font>" +
            "/* Inyectado por CerebroNico: base legible para el panel (el CSS de la IDE no entra en un iframe). */" +
            "html,body{font-size:15px}" +
            "</style>";
          html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${estilo}</body>`) : html + estilo;
        }
        res.type("text/html; charset=utf-8");
        return res.send(html);
      } catch {
        /* si no se puede leer, se sirve el archivo original */
      }
    }

    res.type(types[ext] || "application/octet-stream");
    return res.sendFile(abs);
  });
}

async function startServer() {
  const app = express();

  // v1.70.6 · 50mb → 128mb: el log completo de la sesión del 24/10 registró
  // «PayloadTooLargeError: request entity too large» en POST /api/ai/stream con
  // un turno de muchas fotos inline: el turno moría en el parser ANTES de que
  // las imágenes se materializaran (la causa raíz del «referencia la imagen y
  // no se ve»). El cliente ya recomprime >1,5 MB (attachmentProcessor), así que
  // 128mb es techo de seguridad, no licencia para volcar sin medida.
  // v2.1.5 · el plazo de toda ruta /api vive en su módulo (el monolito no engorda).
  app.use("/api", plazoApi());

  app.use(express.json({ limit: "128mb" }));
  app.use(express.urlencoded({ extended: true, limit: "128mb" })); montarEdicionServidor(app, PROJECT_ROOT);

  // 🔧 Endpoints de autodetección de modelos gratuitos (Gemini flash + OpenRouter :free)
  registerModelDiscoveryRoutes(app);

  // 🎙️ Gemini TTS — voces de texto a voz (cloud) + listado de voces
  registrarGeminiTts(app, getGenAI);

  // ============================================================
  // v2.0 — EXTENSIONES DE TERCEROS (estilo VS Code)
  // ------------------------------------------------------------
  // Cada extensión vive en ./extensions/<id>/ con un manifest.json y su HTML.
  // La IDE la ejecuta en un iframe aislado y se comunica por el puente de
  // permisos. Desde aquí se sirve su contenido, se instala desde ZIP y se
  // atienden las invocaciones que el modelo hace a SUS herramientas.
  // ============================================================
  registerExtensionRoutes(app);

  // v2.0 — Endpoints de rendimiento local (precalentado de modelo) y salud profunda
  registerLocalPerformanceRoutes(app);
  // Los DOS registros que necesitan saber del sandbox se hacen más abajo, junto a
  // sus declaraciones: usarlos aquí sería usarlos antes de declararlos (lo cazó el
  // compilador). Un mismo motivo, una misma solución.
  // registrarTelemetria se registra más abajo, junto a las declaraciones del
  // sandbox: necesita SANDBOX_PORT como VALOR, y usarlo aquí sería usarlo antes de
  // declararlo. Lo cazó el compilador, y tenía razón.

  // v2.0 — Endpoints del MOTOR: la llamada va más abajo, junto a isPortUp/SANDBOX_PORT.


// ============================================================
// Subagentes: topología del IDE con estado en vivo
// (UI :3000, Puente PC :5000, Ollama :11434, Sandbox .proyectos)
// ============================================================
// v1.0.24 · LA RUTA VIVE FUERA DEL MONOLITO: /api/subagents estaba en el log con
// `ERR_HTTP_HEADERS_SENT` y su cura (la ficha de una sola escritura) no podía
// entrar como parche suelto en un archivo con techo declarado. El cuerpo se mudó
// entero a `server/routers/subagentes.ts` y aquí solo queda la delegación.
registrarSubagentes(app, { puerto: PORT, puertoPuente: WORKER_PORT, raizProyecto: PROJECT_ROOT, puente: bridgeFetch });

// ============================================================
// SANDBOX API: ejecución de comandos + sistema de archivos real
// ============================================================




// ------------------------------------------------------------
// SANDBOX RUNTIME: servidor dev del proyecto en el puerto 3500.
// La IDE vive en :3000 y la app del sandbox en :3500: jamás colisionan.
// ------------------------------------------------------------
const SANDBOX_PORT = Number(process.env.SANDBOX_PORT) || 3500;
let sandboxLogStream: fs.WriteStream | null = null;

// v1.12.0 — Telemetría y recursos: se registran AQUÍ, junto a las declaraciones del
// sandbox, porque necesitan SANDBOX_PORT como valor. Se le pasa la pregunta («¿está
// vivo?», «¿cuál es su PID?») en vez de darle acceso a la variable: así este módulo
// no vuelve a atar el estado al monolito, y el día que se extraiga el sandbox su API
// ya está escrita por lo que este fichero le pide.
registrarDiagnostico(app, {
  ollamaUrl: OLLAMA_DEFAULT,
  ramGb: RAM_GB,
  cpuCores: CPU_CORES,
  sandboxVivo,
  sandboxPort: SANDBOX_PORT,
});

registrarTelemetria(app, {
  ollamaUrl: OLLAMA_DEFAULT,
  workerPort: WORKER_PORT,
  sandboxPort: SANDBOX_PORT,
  sandboxVivo,
  sandboxPid: pidSandbox,
});

// v1.15.1 — los espejos por servidor de datos quedan disponibles por HTTP.
registrarEspejosServidor(app);

// v1.15.1 — el plan de dependencias del puente queda disponible por HTTP.
registrarPuenteDependencias(app);

// v1.15.1 — el informe de capacidades corroboradas queda disponible por HTTP.
registrarCapacidades(app);

// v1.16.3.1 · BAJO CONSUMO — GET /api/ollama/ps y POST /api/ollama/expulsar.
registrarOllamaControl(app, { ollamaUrl: OLLAMA_DEFAULT.replace(/\/$/, ""), ramGb: RAM_GB }); // v1.57.14: ramGb para que el dial de contexto se tope con la máquina real

async function isPortUp(port: number, timeoutMs = 2000): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    await fetch(`http://127.0.0.1:${port}`, { signal: ctl.signal });
    clearTimeout(t);
    return true; // cualquier respuesta HTTP cuenta como "arriba"
  } catch {
    return false;
  }
}

// FASE 4 — estado crudo del sandbox junto a isPortUp/SANDBOX_PORT, inyectado vía registerEngineRoutes.
registerEngineRoutes(app, crearEstadoSandboxCrudo(() => ({
  isPortUp, resolverRaiz: resolverRaizProyecto, sandboxVivo, nodeModulesSano: nodeModulesSanoEn, puertoSandbox: SANDBOX_PORT, raizSandbox: PROJECT_ROOT,
})));

/** Mata cualquier proceso escuchando en el puerto indicado (limpieza de huérfanos).
 *  Endurecido: coincidencia EXACTA del puerto local (antes findstr :3500 también
 *  pescaba :35000 y direcciones remotas) y jamás mata nuestro propio PID. */
async function killPortListeners(port: number): Promise<void> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
      const selfPid = process.pid;
      const pids = new Set<string>();
      for (const line of stdout.split("\n")) {
        const cols = line.trim().split(/\s+/);
        // netstat -ano: Proto  Local  Foreign  State  PID
        if (cols.length < 5) continue;
        const [proto, local, , state, pid] = cols;
        if (!/^TCP$/i.test(proto || "")) continue;
        if (!/LISTENING/i.test(state || "")) continue;
        // El puerto debe ser EXACTO al final de la dirección local (evita :35000)
        if (!new RegExp(`:${port}$`).test(local || "")) continue;
        if (Number(pid) === selfPid) continue; // nunca suicidarnos
        if (/^\d+$/.test(pid || "")) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          await execAsync(`taskkill /PID ${pid} /T /F`);
        } catch {}
      }
    } else {
      try {
        await execAsync(`fuser -k ${port}/tcp 2>/dev/null || true`);
      } catch {}
    }
  } catch {
    // no hay listeners: nada que hacer
  }
}

/** Lee los últimos maxBytes de un archivo de log (helper compartido, antes duplicado x2). */
function readFileTail(logPath: string, maxBytes: number): string {
  try {
    if (!fs.existsSync(logPath)) return "";
    const stat = fs.statSync(logPath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(logPath, "r");
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}

app.post("/api/sandbox/start", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    // v1.6.23 — GUARDA-ZOMBIE v1: «puerto arriba» NO es «nuestro servidor».
    // El viejo `|| isPortUp(...)` devolvía alreadyRunning ante CUALQUIER cosa
    // escuchando en :3500 — incluido el dev-server de otra sesión del día
    // anterior. Resultado observado: el piloto informaba «saliendo por el 3500»
    // mientras el navegador mostraba una app vieja («sale igual pero no es la
    // de ahora»). Distinción por propiedad: vivo Y nuestro → ya corre; vivo y
    // NO nuestro → zombie: se mata (killPortListeners, puerto exacto, nunca
    // propio PID) y se arranca el proyecto actual.
    const arranque = await prepararArranque({ base: PROJECT_ROOT, destino: req.body?.destino ?? null, vinculada: leerRutaVinculada(PROJECT_ROOT), vivo: sandboxVivo(), pid: pidSandbox(), raizEnCurso: raizServidaActual(), puerto: SANDBOX_PORT, execAsync, matarProceso, olvidarProceso, isPortUp, killPortListeners, log: (m) => console.log(m) }); // v1.87.1 · «ya corre» ≠ «ya corre lo tuyo» (server/sandboxArranque.ts)
    const { raiz: raizProyecto, tienePkg: hasPkgJson, tieneHtml: hasIndexHtml } = arranque;
    if (arranque.yaCorre) return res.json({ ok: true, alreadyRunning: true, port: SANDBOX_PORT, online: true, raiz: raizProyecto });
    if (await isPortUp(SANDBOX_PORT, 1200)) {
      console.log(`[CerebroNico] 🧟 GUARDA-ZOMBIE v1: :${SANDBOX_PORT} está tomado por un proceso que NO arrancó esta sesión (probable resto de otra app de días atrás). Se lo mata y se arranca el proyecto actual.`);
      await killPortListeners(SANDBOX_PORT);
      // v1.0.15 · ¿SE PUDO LIBERAR DE VERDAD? Si tras matar el :3500 SIGUE ocupado, lo tiene una app del usuario que no se puede/debe matar: antes el preview quedaba en blanco sin explicar por qué. Ahora se sondea un puerto libre REAL y se devuelve como alterno accionable, sin recablear el sandbox (el frontend sigue apuntando a :3500 a propósito).
      if (await isPortUp(SANDBOX_PORT, 800)) {
        const alterno = await puertoLibre(SANDBOX_PORT + 1, 25);
        console.warn(`[CerebroNico] ⚠️ :${SANDBOX_PORT} NO se pudo liberar (lo retiene otra aplicación). ${alterno ? `Puerto libre sugerido: ${alterno}.` : "No se halló un puerto libre cercano."}`);
        return res.status(409).json(cuerpo409PuertoOcupado(SANDBOX_PORT, alterno)); // v1.0.15 · mensaje accionable en server/puertoLibre.ts
      }
    }

    // v2.6.2 — anti-recursión: la IDE vista desde dentro es solo un proyecto más
    // para el piloto, y el piloto se comió 5 minutos instalando la propia IDE en
    // su sandbox (TransformError de node 26 mediante). La IDE no corre dentro de
    // su propio sandbox: lo que corre ahí son LOS PROYECTOS que la IDE crea.
    //
    // v1.6.24 — LA GUARDA TAMBIÉN MIRABA SOLO LA RAÍZ: cuando el package.json
    // vive un nivel más adentro (ZIP con carpeta contenedora, sync anidado),
    // la copia de la IDE escondida ahí pasaba desapercibida y la recursión se
    // descubría tarde — en medio de cinco minutos de instalación y compilación
    // de la propia herramienta. Ahora la comprobación cubre raíz y raíz
    // resuelta por el mismo sitio.
    try {
      if (req.body?.confirmar !== "recursion") {
        const raizRes = resolverRaizProyecto();
        if (raizRes.anidada && nombreDelPackageEn(raizRes.raiz) === "cerebronico-ide") {
          const rel = path.relative(PROJECT_ROOT, raizRes.raiz).split(path.sep).join("/");
          return res.json({
            requiereConfirmacion: true,
            aviso:
              `Hay una copia de CerebróNico ANIDADA en el sandbox («${rel}/»): ` +
              "arrancarla serían dos IDEs compartiendo RAM, y el preview mostraría la propia IDE, no tu app. " +
              "Si es exactamente lo que buscas (probar la IDE dentro de la IDE), confírmalo y se arranca igual.",
          });
        }
      }
      const pkgCamino = path.join(PROJECT_ROOT, "package.json");
      if (fs.existsSync(pkgCamino)) {
        const pkg = JSON.parse(fs.readFileSync(pkgCamino, "utf8"));
        if (pkg && pkg.name === "cerebronico-ide" && req.body?.confirmar !== "recursion")
          return res.json({ requiereConfirmacion: true, aviso: "Es la propia CerebróNico: está corriendo la IDE dentro del sandbox de la IDE. Mario verificó que funciona completo — dos IDEs compartiendo RAM; se continúa con aviso. Si lo que hay en el sandbox es una VARIANTE (Pocket), no hace falta confirmar: cámbiale el «name» del package.json a «cerebronico-pocket» y el aviso desaparece." });
      }
    } catch { /* package.json roto: que el flujo normal lo reporte con su causa */ }

    // ============================================================
    // v2.0 — PROYECTOS ESTÁTICOS (HTML + CSS + JS, sin npm)
    // ------------------------------------------------------------
    // 🐞 BUG REPORTADO: "no inyecta el código, algo pasa en el sandbox".
    // El modelo escribía un index.html, el sandbox lo recibía en disco… y este
    // bloque respondía "No hay proyecto en el sandbox" porque SOLO sabía arrancar
    // proyectos npm (package.json + vite). Resultado: previsualizador en blanco
    // aunque el código estuviese bien escrito.
    // Ahora, si hay index.html y NO hay package.json, se sirve el proyecto con un
    // servidor estático mínimo en Node: sin dependencias, sin npm install, sin
    // build. Es el caso de la web de instrumentos musicales que estabas probando.
    // ============================================================
    // v2.1 — 🐞 Antes se miraba SOLO la raíz de .proyectos, así que un proyecto
    // importado con carpeta contenedora se daba por inexistente. Ahora la raíz
    // se resuelve y se usa también como cwd del servidor.
    // v1.86.6 — pin (CANAL DIRECTO) o `destino` explícito ganan al desempate por recencia (§6).
    if (arranque.anidada) console.log(`[CerebroNico] Proyecto encontrado en subcarpeta: ${path.relative(PROJECT_ROOT, raizProyecto) || "."}`);
    if (arranque.origen !== "autodeteccion") console.log(`[CerebroNico] Sandbox fijado por ${arranque.origen}: ${path.relative(PROJECT_ROOT, raizProyecto) || raizProyecto}`);
    // v1.97.0 · LA PUERTA DE LA RAÍZ (ok de Mario, 30/10): sin carpeta vinculada y con más de un entregable, elegir por recencia es correcto pero no inocente — de ahí salieron «lo que se ve es un proyecto viejo» y el reinicio manual de puertos. Se pregunta SOLO en ese caso ambiguo; con un candidato, con pin o con destino explícito se sirve como siempre (preguntar siempre sería secuestrar la pantalla otra vez).
    const puerta = puertaDeEleccionDeRaiz(arranque, { base: PROJECT_ROOT, hayPin: Boolean(leerRutaVinculada(PROJECT_ROOT)), confirmado: Boolean(req.body?.confirmarRaiz) });
    if (puerta.pide) { console.log(`[CerebroNico] Sandbox SIN arrancar: ${puerta.candidatos.length} entregables esperan una elección (autodetección, sin carpeta vinculada).`); return res.json({ ok: false, pide_eleccion_de_raiz: true, raiz: arranque.raiz, candidatos: puerta.candidatos.map((x) => ({ ruta: x.ruta, nombre: x.nombre, mtimeMs: x.mtimeMs })), aviso: puerta.motivo }); }

    // ============================================================
    // v1.6.9 — VÍA RÁPIDA: PREVISUALIZAR SIN INSTALAR NI ARRANCAR NADA
    // ------------------------------------------------------------
    // La condición de abajo era `!hasPkgJson && hasIndexHtml`. O sea: en cuanto
    // el proyecto tenía package.json, daba igual que fuera una página con cuatro
    // módulos — se iba por la vía cara (`npm install && npm run dev`), con toda
    // su instalación, su servidor de desarrollo y su watcher. Y si faltaba un
    // solo paquete, el preview moría con un aviso de Vite dentro.
    //
    // Ahora hay tres vías y se elige la más barata que pueda funcionar:
    //   · estatico-directo   → se sirve tal cual. Cero instalación, cero compilación.
    //   · estatico-compilado → UNA compilación con el esbuild que ya trae la IDE
    //                          y se sirve el resultado. Cero instalación.
    //   · npm-dev            → solo cuando de verdad hace falta (marco con su
    //                          propio servidor, o proyecto ya instalado con su
    //                          configuración, que es lo que hay que respetar).
    //
    // Funciona porque el proyecto vive DENTRO de ide/backend/: la resolución de
    // Node sube por el árbol y encuentra el node_modules de la propia IDE, así
    // que `react`, `react-dom` o `lucide-react` se resuelven solos.
    //
    // La decisión en sí es pura y está probada en viaRapidaPreview.ts.
    // ============================================================
    const leerFicherosProyecto = (raiz: string): string[] => {
      const lista: string[] = [];
      const rec = (dir: string, rel: string, prof: number): void => {
        if (prof > 10 || lista.length > 800) return;
        let es: string[] = [];
        try {
          es = fs.readdirSync(dir);
        } catch {
          return;
        }
        for (const e of es) {
          if (["node_modules", ".git", "dist", "build", ".vite", ".cn-preview", "__pycache__", "venv"].includes(e)) continue;
          const abs = path.join(dir, e);
          let st: fs.Stats;
          try {
            st = fs.statSync(abs);
          } catch {
            continue;
          }
          if (st.isDirectory()) rec(abs, rel ? `${rel}/${e}` : e, prof + 1);
          else lista.push(rel ? `${rel}/${e}` : e);
        }
      };
      rec(raiz, "", 0);
      return lista;
    };

    // v1.6.24 — usa el DISCO_AUDITORIA compartido (arriba, junto al resolutor).
    const auditarRaiz = (raiz: string, declarados: string[]) =>
      auditarInstalacion(raiz, declarados, DISCO_AUDITORIA);

    const decidirViaPreviewDelProyecto = (): ReturnType<typeof elegirViaPreview> => {
      const ficheros = leerFicherosProyecto(raizProyecto);
      let dependencias: string[] = [];
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(raizProyecto, "package.json"), "utf-8"));
        dependencias = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
      } catch {}
      const hayNodeModules = fs.existsSync(path.join(raizProyecto, "node_modules"));
      // Sin carpeta no hay nada que auditar: la vía barata (esbuild + estático)
      // ya cubre ese caso sin instalar. La auditoría existe para el caso
      // contrario —carpeta que MIENTE—, que era el que mataba el preview.
      const nodeModulesSano = hayNodeModules
        ? instalacionSana(auditarRaiz(raizProyecto, dependencias))
        : true;
      return elegirViaPreview({
        tieneIndexHtml: hasIndexHtml,
        tienePackageJson: hasPkgJson,
        fuentes: fuentesATranspilar(ficheros),
        tieneNodeModules: hayNodeModules,
        nodeModulesSano,
        tieneConfigPropia: tieneConfigPropia(ficheros),
        frameworkConServidor: esFrameworkConServidor(dependencias),
      });
    };

    /** Compila una vez con el esbuild de la IDE y deja el HTML apuntando al bundle. */
    const compilarPreviewRapida = async (): Promise<{ ok: boolean; mensaje: string }> => {
      const rutaHtml = path.join(raizProyecto, "index.html");
      let html = "";
      try {
        html = fs.readFileSync(rutaHtml, "utf-8");
      } catch (e: any) {
        return { ok: false, mensaje: `no se pudo leer index.html (${e?.message ?? e})` };
      }
      // v1.56.8 — el `|| "src/main.tsx"` no rompía nada (abajo se comprueba el
      // disco), pero SÍ producía el mensaje que Mario leyó en el log:
      //   «no existe el punto de entrada «./src/main.tsx»»
      // acusando a un archivo que el proyecto nunca declaró. Un diagnóstico que
      // señala el archivo equivocado manda el bucle de reparación entero hacia un
      // fantasma. Se usa la entrada declarada o la verificada, y si no hay ninguna
      // se dice la verdad: no hay entrada.
      let nombresParaEntrada: string[] = [];
      try {
        const raizSrc = path.join(raizProyecto, "src");
        for (const f of fs.readdirSync(raizSrc)) nombresParaEntrada.push(`src/${f}`);
        for (const f of fs.readdirSync(raizProyecto)) if (!f.includes(".")) nombresParaEntrada.push(f);
      } catch {}
      // v1.0.10 · F3 — guarda del bundle que se come a sí mismo (8 ciclos en el
      // log viejo): vive en server/sandboxPreview.ts — restaura, repara o DECLARA.
      const guardiaPreview = dessecuestrarEntradaPreview(
        {
          leerIndex: () => { try { return fs.readFileSync(rutaHtml, "utf-8"); } catch { return null; } },
          escribirIndex: (t) => { try { fs.writeFileSync(rutaHtml, t, "utf-8"); return true; } catch { return false; } },
          existe: (rel) => fs.existsSync(path.join(raizProyecto, rel)),
          restaurarRespaldo: () => restaurarHtmlOriginal(),
          nombreBundle: NOMBRE_BUNDLE,
          avisar: (m) => console.warn("[CerebroNico] " + m),
        },
        (h) => entradaDeHtml(h) || puntoDeEntradaVerificable(nombresParaEntrada)
      );
      html = guardiaPreview.html;
      if (guardiaPreview.secuestroDeclarado) return { ok: false, mensaje: guardiaPreview.mensaje || "SECUESTRO DE PREVIEW" };
      const entrada = guardiaPreview.entrada;
      if (!entrada) {
        return {
          ok: false,
          mensaje:
            "no hay punto de entrada: el index.html no declara ninguno y no se encontró " +
            "ningún src/main.* / src/index.* en disco. (No se asume «src/main.tsx»: así se " +
            "veía el error «no existe el punto de entrada ./src/main.tsx» sobre un proyecto " +
            "que nunca tuvo ese archivo.)",
        };
      }
      const rutaEntrada = path.join(raizProyecto, entrada.replace(/^\//, ""));
      if (!fs.existsSync(rutaEntrada)) {
        return { ok: false, mensaje: `no existe el punto de entrada «${entrada}»` };
      }

      // v1.0.10 · F3 — ya no se respalda para reescribir: YA NO SE REESCRIBE.
      // El respaldo antiguo existe solo para RESTAURAR proyectos que llegaron
      // reescritos desde ≤v1.0.9 (ver restaurarHtmlOriginal); no se crea otro.
      const rutaBundle = path.join(raizProyecto, NOMBRE_BUNDLE);
      const cmd = comandoBundle(entrada.replace(/^\//, ""), NOMBRE_BUNDLE);
      const res = await runCommand(cmd, raizProyecto, 120000);
      if (!fs.existsSync(rutaBundle)) {
        const detalle = detalleDeSalida((res as any)?.stderr || (res as any)?.stdout);
        return { ok: false, mensaje: `la compilación no produjo el bundle${detalle ? `: ${detalle}` : ""}` };
      }

      // ============================================================
      // v1.6.25-SANDBOXFIX3 — GUARDA-BUNDLE-DESNUDO
      // ------------------------------------------------------------
      // Un bundle con bare specifiers se sirve con HTTP 200 y el navegador lo
      // rechaza: pantalla en blanco sin un solo error en el servidor. Se audita
      // ANTES de reescribir el HTML; si quedó desnudo, se declara el fallo para
      // que el flujo caiga en la vía de npm (instalar y respetar su dev) en vez
      // de servir una página muerta que parece funcionar.
      // ============================================================
      try {
        const desnudos = importacionesDesnudas(fs.readFileSync(rutaBundle, "utf-8"));
        if (desnudos.length > 0) {
          return {
            ok: false,
            mensaje:
              `el bundle salió con ${desnudos.length} import(s) que el navegador no puede resolver ` +
              `(${desnudos.slice(0, 4).join(", ")}): el preview quedaría en blanco aunque el puerto responda`,
          };
        }
      } catch { /* si no se puede leer, no se puede auditar: se sigue */ }

      // v1.0.10 · F3 — EL HTML SE TRANSFORMA AL SERVIR, NUNCA EN DISCO.
      // `reescribirHtmlParaBundle` sigue siendo la verdad pura de CÓMO se
      // reescribe (misma función que prueban los tests); aquí solo se consulta
      // si hace falta la inyección. El archivo del usuario queda intacto: el
      // md5 del index.html es estable entre previews (AC de F3) y el agente
      // deja de pelear contra un `src` que "volvía" solo.
      const necesitaInyeccion = reescribirHtmlParaBundle(html) !== null;
      return {
        ok: true,
        mensaje:
          `bundle listo (${entrada} → ${NOMBRE_BUNDLE}), sin instalar nada del proyecto` +
          (necesitaInyeccion ? " — el HTML se reescribe SOLO en la respuesta (:3500), el archivo no se toca" : " — el HTML ya apunta al bundle en disco (residuo viejo: restaurar con preview npm-dev)"),
      };
    };

    // ============================================================
    // v1.6.25-SANDBOXFIX3 — EL HTML REESCRITO NO PUEDE QUEDAR PEGADO
    // ------------------------------------------------------------
    // La vía rápida reescribe index.html para que cargue ./cn-preview.js y
    // guarda el original en .cn-preview/index.html.orig… pero nada lo devolvía
    // nunca. A partir de ahí, un proyecto ya instalado que arranca por
    // `npm run dev` seguía sirviendo el BUNDLE VIEJO: si ese bundle estaba
    // roto, la pantalla blanca sobrevivía a todas las reparaciones (instalar
    // dependencias, purgar node_modules, reiniciar) porque el HTML nunca
    // volvía a pedir /src/main.tsx. Esto explica por qué el arreglo de
    // v1.6.24 «no se notaba».
    // ============================================================
    const restaurarHtmlOriginal = (): boolean => restaurarHtmlOriginal10({ leer: (a) => { try { return fs.existsSync(a) ? fs.readFileSync(a, "utf-8") : null; } catch { return null; } }, escribir: (a, tx) => fs.writeFileSync(a, tx, "utf-8"), rutaHtml: path.join(raizProyecto, "index.html"), rutaRespaldo: path.join(raizProyecto, NOMBRE_RESPALDO), nombreBundle: NOMBRE_BUNDLE, avisar: (m) => console.log("[CerebroNico] " + m) });

    const viaPreview = decidirViaPreviewDelProyecto();
    // v1.6.24 — el plan de trabajo se decide UNA sola vez y se lee por nombre:
    // `viaPreview.requiereInstalar` resultó ser un campo que el resto del
    // flujo nunca consultaba (el preflight tiene sus propios criterios). Se
    // extrae a variable para que el log y el piloto digan lo mismo.
    const viaPreviewRequireInstalar = viaPreview.requiereInstalar;
    console.log(`[CerebroNico] Preview por «${viaPreview.via}»: ${viaPreview.motivo}`);
    let compilacionFallida = false;
    if (viaPreview.requiereCompilar) {
      const comp = await compilarPreviewRapida();
      compilacionFallida = !comp.ok;
      console.log(`[CerebroNico] Vía rápida: ${comp.ok ? "✔" : "✘"} ${comp.mensaje}`);
    }

    // Si la vía rápida no pudo entregar un bundle ejecutable, no se sirve una
    // página muerta: se cae a la vía de npm (instala lo que falte y respeta su
    // `dev`). Y si vamos por npm-dev, el HTML tiene que volver a ser el original.
    if (viaPreview.via === "npm-dev" || compilacionFallida) restaurarHtmlOriginal();

    if (viaPreview.via !== "npm-dev" && !compilacionFallida) {
      // v1.72.0 · FASE 2: la plantilla del servidor estático del sandbox vivía aquí
      // (242 líneas dentro de otra plantilla). Se fue a server/sandboxEstatico.ts para
      // respetar el trinquete de líneas y para poder verificarse aislada con node --check.
      const PLANTILLA_ESTATICA = STATIC_SERVER_SOURCE;
      try {
        if (Boolean(procesoActual() && !sandboxVivo())) olvidarProceso();
        if (await isPortUp(SANDBOX_PORT, 800)) await killPortListeners(SANDBOX_PORT);
        // v1.43.0-fix: escribir el helper en PROJECT_ROOT (escribible), no en process.cwd()
        // que cuando corre el .exe es C:\Program Files\... → EPERM
        const staticScript = path.join(PROJECT_ROOT, "..cn-static-server.cjs");
        fs.writeFileSync(staticScript, PLANTILLA_ESTATICA, "utf-8");
        try {
          sandboxLogStream = fs.createWriteStream(path.join(PROJECT_ROOT, ".sandbox_3500.log"), { flags: "w" });
        } catch {
          sandboxLogStream = null;
        }
        // v1.52.6 — cuarto argumento: PROJECT_ROOT (fallback assets/subidas/).
        // v1.0.10 · F3 — quinto: el bundle se inyecta EN LA RESPUESTA, nunca en el archivo.
        const argvBundlePreview = viaPreview.via === "estatico-compilado" && !compilacionFallida && fs.existsSync(path.join(raizProyecto, NOMBRE_BUNDLE)) ? NOMBRE_BUNDLE : "";
        const procEstatico = spawn(process.execPath, [staticScript, raizProyecto, String(SANDBOX_PORT), PROJECT_ROOT, argvBundlePreview], {
          cwd: raizProyecto,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        registrarProceso(procEstatico);
        if (sandboxLogStream) {
          procEstatico.stdout?.pipe(sandboxLogStream);
          procEstatico.stderr?.pipe(sandboxLogStream);
        }
        for (let i = 0; i < 25; i++) {
          if (await isPortUp(SANDBOX_PORT, 400)) break;
          await sleepMs(250);
        }
        const staticUp = await isPortUp(SANDBOX_PORT, 1200);
        if (staticUp) registrarRaizServida(raizProyecto); // v1.87.1 · para poder comparar en el próximo start
        console.log(`[CerebroNico] Sandbox ESTÁTICO (HTML sin npm) ${staticUp ? "arrancado" : "sin confirmar"} en :${SANDBOX_PORT}`);
        return res.json({
          ok: staticUp,
          static: true,
          port: SANDBOX_PORT,
          online: staticUp,
          url: `http://127.0.0.1:${SANDBOX_PORT}`,
          message: "Proyecto estático servido (HTML/CSS/JS, sin npm).",
        });
      } catch (err: any) {
        return res.status(500).json({ error: `No se pudo arrancar el servidor estático: ${err.message}` });
      }
    }

    // ============================================================
    // v2.1 — ADAPTACIÓN DEL PROYECTO AL SANDBOX (P U E R T O)
    // ------------------------------------------------------------
    // 🐞 Caso real reproducido: un proyecto trae `vite --port=3000` POR LÍNEA DE
    // COMANDOS (así lo genera la plantilla de Google AI Studio). En Vite la CLI
    // GANA a la configuración, y el 3000 es el puerto de la propia IDE:
    //   · colisión de puerto  →  Vite salta a 3001 en silencio (no hay strictPort)
    //   · el sandbox sigue esperando en el 3500  →  no ve nada y lo da por muerto
    //   · el HTML sí se carga (de ahí que el TÍTULO se reconozca) pero el bundle
    //     de JavaScript no llega  →  PÁGINA EN BLANCO
    //
    // El motor lo adapta solo, sin que nadie edite su proyecto: reescribe el
    // `--port` del script y garantiza `port` + `strictPort: true` (para que un
    // puerto ocupado falle EN VOZ ALTA en vez de saltar en silencio).
    // Guarda copia `.cn-original` la primera vez y es idempotente.
    // ============================================================
    try {
      const adaptado = normalizeProjectPort(raizProyecto, SANDBOX_PORT);
      for (const c of adaptado.cambios) console.log(`[CerebroNico] Proyecto adaptado · ${c}`);
      if (adaptado.respaldos.length > 0) {
        console.log(`[CerebroNico] Respaldos guardados: ${adaptado.respaldos.join(", ")} (revierte renombrándolos)`);
      }
    } catch (err: any) {
      console.log(`[CerebroNico] No se pudo adaptar el puerto del proyecto: ${err?.message || err}`);
    }

    // ============================================================
    // v1.6.12 — QUE SEA FUNCIONAL
    // ------------------------------------------------------------
    // 🐞 1. Un `requirements.txt` suelto (peso 90) le ganaba a `index.html`
    //      (peso 60): el sandbox declaraba «🐍 Python, sin previsualizador» y el
    //      usuario veía su web ahí mismo. Si hay evidencia web, HAY preview.
    // 🐞 2. Si el modelo olvida el `package.json`, la carpeta deja de ser un
    //      proyecto. No se puede depender de que se acuerde: se genera el
    //      esqueleto mínimo con las dependencias REALES que el código importa.
    // ============================================================
    let pkgCreadoAqui = false;
    let nombresProyecto: string[] = [];
    try {
      const recorrer = (dir: string, rel: string, prof: number) => {
        if (prof > 3 || nombresProyecto.length > 800) return;
        let entradas: string[] = [];
        try {
          entradas = fs.readdirSync(dir);
        } catch {
          return;
        }
        for (const e of entradas) {
          if (["node_modules", ".git", "dist", ".vite", "__pycache__", ".cn-preview"].includes(e)) continue;
          const abs = path.join(dir, e);
          let st: fs.Stats;
          try {
            st = fs.statSync(abs);
          } catch {
            continue;
          }
          const relHijo = rel ? `${rel}/${e}` : e;
          if (st.isDirectory()) recorrer(abs, relHijo, prof + 1);
          else nombresProyecto.push(relHijo);
        }
      };
      recorrer(raizProyecto, "", 0);

      const ev = hayEvidenciaWeb(nombresProyecto);
      const falta = esqueletoFaltante(nombresProyecto, { tienePackageJson: hasPkgJson });
      if (ev.hay && falta.crear.length > 0) {
        const leerSeguro = (rel: string) => {
          try {
            return fs.readFileSync(path.join(raizProyecto, rel), "utf-8");
          } catch {
            return "";
          }
        };
        const paquetes = paquetesFaltantes(
          nombresProyecto.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/i.test(f)).map((f) => ({ path: f, content: leerSeguro(f) })),
          {
            declarados: [],
            estaInstalado: (p) => fs.existsSync(path.join(raizProyecto, "node_modules", ...p.split("/"))),
          }
        );
        for (const pieza of falta.crear) {
          if (pieza === "package.json") {
            fs.writeFileSync(
              path.join(raizProyecto, "package.json"),
              packageJsonMinimo(path.basename(raizProyecto), paquetes, { conVite: ev.tieneFuentes }),
              "utf-8"
            );
            pkgCreadoAqui = true;
            console.log(`[CerebroNico] Faltaba el package.json: generado con ${paquetes.length} dependencia(s) reales.`);
          } else if (pieza === "index.html") {
            // v1.56.8 — ANTES: `… ?? "src/main.tsx"`. Un `??` con forma de dato es
            // una alucinación programada: se generaba un HTML que cargaba un archivo
            // que no está en disco, se ANUNCIABA como si existiera, y el paso
            // siguiente fallaba contra esa promesa («no existe el punto de entrada
            // «./src/main.tsx»», literal en el log de Mario) o el navegador pedía un
            // 404 y la pantalla salía en blanco. La entrada se verifica o se dice.
            const entrada = puntoDeEntradaVerificable(nombresProyecto);
            fs.writeFileSync(path.join(raizProyecto, "index.html"), indexHtmlHonesto(entrada), "utf-8");
            console.log(
              entrada
                ? `[CerebroNico] Faltaba el index.html: generado para cargar ${entrada} (verificado en disco).`
                : "[CerebroNico] Faltaba el index.html y NO hay punto de entrada en disco: se generó una página autocontenida que lo dice, en vez de un <script src> roto."
            );
          }
        }
      }
    } catch (err: any) {
      console.warn(`[CerebroNico] No se pudo completar el esqueleto: ${err?.message ?? err}`);
    }

    // Si hay evidencia web, NO se rechaza el preview — se sirve.
    if (!hasPkgJson && !pkgCreadoAqui && !servirPeseAlMarcador(nombresProyecto, false).servir) {
      // 🐞 DEFECTO MADRE v1.0.3: aquí el sandbox confesaba «no hay proyecto»
      // ante un Python, un Rust o una carpeta de datos perfectamente reales,
      // porque solo conocía package.json e index.html. ADUANA v2: si hay un
      // tipo reconocido, se DECLARA cuál es, qué marcador lo delató y cómo se
      // arranca — sin previsualizador, pero con verdad.
      const rec = arranque.reconocido;
      if (rec && rec.peso >= 40) {
        return res.status(400).json({
          error:
            `Proyecto reconocido: ${rec.icono} ${rec.nombre} (marcador «${rec.marcador}»). ` +
            `No tiene previsualizador en :${SANDBOX_PORT} porque no es una web ni un proyecto npm — ` +
            `se arranca por consola: ${rec.cmdArranque}. Puedes usar la terminal del sandbox para correrlo y ver su salida.`,
          reconocido: { tipo: rec.tipo, nombre: rec.nombre, marcador: rec.marcador, cmdArranque: rec.cmdArranque },
        });
      }
      // v1.56.8 — LA RUTA ENGAÑOSA. Estos dos mensajes decían «el sandbox
      // (.proyectos)», pero `.proyectos` es solo el VALOR POR DEFECTO de la raíz
      // (`path.join(cwd, ".proyectos")`). Con una raíz de datos configurada —el
      // caso de Mario: `C:\Cerebronico`, y es lo que el Sync escribe— el diagnóstico
      // mandaba a mirar una carpeta que no existe. Nombrar la raíz REAL buscada es
      // la diferencia entre un problema resoluble y uno que se persigue a ciegas.
      return res.status(400).json({
        error: hasIndexHtml
          ? `No hay proyecto en el sandbox. Se buscó en ${raizProyecto} (la raíz de datos real; NO una carpeta \`.proyectos\`). Pulsa Sync para escribir el workspace del editor ahí.`
          : rec && rec.peso > 0
            ? `En ${raizProyecto} hay ${rec.icono} ${rec.nombre} (marcador «${rec.marcador}»), pero no es un proyecto ejecutable ni una web: es material de trabajo. Pulsa Sync si faltan archivos, o pide al agente que genere un proyecto alrededor de este material.`
            : `No hay proyecto en el sandbox: se buscaron marcadores (package.json, index.html, requirements.txt, Cargo.toml, go.mod, pom.xml, Dockerfile, Makefile…) en ${raizProyecto} y no apareció ninguno. Dos causas posibles, y se distinguen en el log: (a) el editor tiene archivos que no llegaron → pulsa Sync, que escribe EN ESA RAÍZ; (b) el editor está VACÍO porque el chat no creó ningún archivo → no hay nada que sincronizar, hay que crearlo primero (Modo Agente PC o el editor a mano).`,
        raizBuscada: raizProyecto,
        reconocido: rec ? { tipo: rec.tipo, nombre: rec.nombre, marcador: rec.marcador } : null,
      });
    }

    // 🔧 ANTI-ZOMBIE: si hubo un sandboxProc previo muerto pero su PID sigue
    // referenciado, limpiar. Y si hay un proceso externo reteniendo 3500 sin
    // que nosotros lo gestionemos, matarlo antes de arrancar (evita EADDRINUSE).
    if (Boolean(procesoActual() && !sandboxVivo())) {
      try { matarProceso("SIGKILL"); } catch {}
      olvidarProceso();
    }
    if (await isPortUp(SANDBOX_PORT, 800)) {
      console.log("[CerebroNico] Sandbox: puerto 3500 ocupado por proceso externo — limpiando…");
      await killPortListeners(SANDBOX_PORT);
      //esperar a que se libere (hasta 5s)
      for (let i = 0; i < 5; i++) {
        if (!(await isPortUp(SANDBOX_PORT, 600))) break;
        await sleepMs(1000);
      }
    }

    const logPath = path.join(PROJECT_ROOT, ".sandbox_3500.log");

    // Detección de auto-reparación: si el proyecto no arranca por dependencias
    // viejas/faltantes (ej: "cross-env: not found"), corre npm install solo y reintenta.
    const readLogTail = (): string => readFileTail(logPath, 8 * 1024);
    const needsInstall = (logText: string): boolean =>
      /not found|Cannot find module|ERR_MODULE_NOT_FOUND|missing script|MODULE_NOT_FOUND|Cannot find package/i.test(
        logText.slice(-3000)
      );

    // v1.43.0 — RAÍZ del «NADA se ve en el sandbox»: cuando la IDE corre como
    // EXE empaquetado (Electron), el PATH heredado a veces NO incluye la carpeta
    // de Node, así que «npm.cmd»/«npm» no se encuentra y el spawn muere con
    // «no se reconoce como un comando interno o externo» / ENOENT. En vez de
    // confiar en el PATH, RESOLVEMOS la ruta real de npm sondeando ubicaciones
    // habituales (y, de último recurso, caemos a npm-cli.js con el propio
    // runtime via ELECTRON_RUN_AS_NODE).
    const resolverNpmBin = (): { cmd: string; args0: string[]; via: string } | null => {
      const win = process.platform === "win32";
      const nombre = win ? "npm.cmd" : "npm";
      // 1) ¿Está ya en PATH? (where/which). Si sí, se devuelve el NOMBRE
      //    PELADO («npm.cmd»/«npm»): el shell lo resuelve por PATH y así
      //    EVITAMOS pasar una ruta con espacios tipo «C:\Program Files\nodejs\
      //    npm.cmd» a cmd.exe, que la parte en el espacio y muere con
      //    ««C:\Program» no se reconoce como un comando interno o externo».
      //    (Regresión real de v1.43.0 lote 1: sustituir el nombre por la ruta
      //    completa rompió a quien SÍ tenía npm en el PATH.)
      try {
        const probe = spawnSync(win ? "where" : "which", [nombre], { encoding: "utf-8", timeout: 4000, windowsHide: true });
        const hit = (probe.stdout || "").split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s));
        if (hit) return { cmd: nombre, args0: [], via: "PATH" };
      } catch { /* seguimos sondeando */ }
      // 2) Junto al Node/ejecutable que nos lanza (process.execPath) y en
      //    directorios de instalación típicos.
      const candidatos: string[] = [];
      try { candidatos.push(path.join(path.dirname(process.execPath), nombre)); } catch { /* noop */ }
      if (win) {
        const pf = process.env.ProgramFiles || "C:\\Program Files";
        const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
        const appdata = process.env.APPDATA || "";
        const localapp = process.env.LOCALAPPDATA || "";
        const programdata = process.env.ProgramData || "C:\\ProgramData";
        candidatos.push(path.join(pf, "nodejs", "npm.cmd"));
        candidatos.push(path.join(pf86, "nodejs", "npm.cmd"));
        if (appdata) candidatos.push(path.join(appdata, "npm", "npm.cmd"));
        // v1.44.0 — cubrimos los gestores de versiones y empaquetadores que NO
        // dejan Node en Program Files ni en el PATH del EXE empaquetado: así el
        // sandbox arranca aunque el usuario tenga Node por nvm/fnm/volta/winget/
        // chocolatey. Las rutas con comodín (nvm guarda una carpeta por versión)
        // se exploran a mano.
        if (localapp) {
          candidatos.push(path.join(localapp, "Programs", "nodejs", "npm.cmd"));
          candidatos.push(path.join(localapp, "Volta", "bin", "npm.cmd"));
          candidatos.push(path.join(localapp, "Microsoft", "WinGet", "Links", "npm.cmd"));
          // fnm: %LOCALAPPDATA%\fnm_multishells\<id>\npm.cmd  y  node-versions\<v>\installation\npm.cmd
          for (const sub of ["fnm", "fnm_multishells"]) {
            const base = path.join(localapp, sub);
            try {
              if (fs.existsSync(base)) {
                for (const d of fs.readdirSync(base)) {
                  candidatos.push(path.join(base, d, "npm.cmd"));
                  candidatos.push(path.join(base, d, "installation", "npm.cmd"));
                }
              }
            } catch { /* carpeta inaccesible: seguimos */ }
          }
        }
        candidatos.push(path.join(programdata, "chocolatey", "bin", "npm.cmd"));
        // nvm-windows: %NVM_HOME% o %APPDATA%\nvm, con una carpeta por versión.
        const nvmHome = process.env.NVM_HOME || (appdata ? path.join(appdata, "nvm") : "");
        if (nvmHome) {
          try {
            if (fs.existsSync(nvmHome)) {
              for (const d of fs.readdirSync(nvmHome)) {
                candidatos.push(path.join(nvmHome, d, "npm.cmd"));
              }
            }
          } catch { /* seguimos */ }
        }
      } else {
        candidatos.push("/usr/local/bin/npm", "/usr/bin/npm", "/opt/homebrew/bin/npm");
        // nvm/fnm/volta en Linux/macOS.
        const home = process.env.HOME || "";
        if (home) {
          candidatos.push(path.join(home, ".volta", "bin", "npm"));
          for (const base of [path.join(home, ".nvm", "versions", "node"), path.join(home, ".local", "share", "fnm", "node-versions")]) {
            try {
              if (fs.existsSync(base)) {
                for (const d of fs.readdirSync(base)) {
                  candidatos.push(path.join(base, d, "bin", "npm"));
                  candidatos.push(path.join(base, d, "installation", "bin", "npm"));
                }
              }
            } catch { /* seguimos */ }
          }
        }
      }
      const found = candidatos.find((c) => { try { return fs.existsSync(c); } catch { return false; } });
      if (found) return { cmd: found, args0: [], via: "ruta" };
      // 3) Último recurso: npm-cli.js corrido con nuestro propio runtime como Node
      //    (ELECTRON_RUN_AS_NODE lo activa en el env del spawn).
      const cliCands: string[] = [];
      try {
        const nodeDir = path.dirname(process.execPath);
        cliCands.push(path.join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"));
        cliCands.push(path.join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"));
      } catch { /* noop */ }
      const cli = cliCands.find((c) => { try { return fs.existsSync(c); } catch { return false; } });
      if (cli) return { cmd: process.execPath, args0: [cli], via: "npm-cli.js" };
      return null;
    };
    const npmInfo = resolverNpmBin();
    const npmCmd = npmInfo ? npmInfo.cmd : (process.platform === "win32" ? "npm.cmd" : "npm");
    const npmArgs0 = npmInfo ? npmInfo.args0 : [];
    const npmResuelto = !!npmInfo;
    if (!npmResuelto) {
      console.warn(
        "[CerebroNico] Sandbox: no se pudo RESOLVER npm (ni en PATH, ni en Program Files, " +
        "ni en nvm/fnm/volta/winget/chocolatey). El arranque fallará. SOLUCIÓN: instala Node LTS " +
        "desde https://nodejs.org y reabre la IDE, o añade la carpeta de Node al PATH. El " +
        "auto-diagnóstico del sandbox lo reportará con este mismo detalle."
      );
    } else if (npmInfo && npmInfo.via !== "PATH") {
      console.log(`[CerebroNico] Sandbox: npm resuelto por ${npmInfo.via}: ${npmCmd}`);
    }
    // v1.43.0 lote 2 — CITADO SEGURO para Windows: cuando npm se resolvió por
    // RUTA (p. ej. «C:\Program Files\nodejs\npm.cmd») o vía npm-cli.js con el
    // runtime («C:\…\CerebroNico.exe»), la ruta lleva espacios y hay que
    // entrecomillarla o cmd.exe la parte y falla con ««C:\Program» no se
    // reconoce…». En PATH el nombre es pelado («npm.cmd») y NO se cita.
    const _win32Npm = process.platform === "win32";
    const _citar = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
    // Ejecuta npm de forma síncrona respetando el citado. En Windows usamos
    // shell:true con la línea YA citada; fuera de Windows, args[] sin shell.
    const correrNpmSync = (extra: string[], opts: Record<string, any>): ReturnType<typeof spawnSync> => {
      if (_win32Npm) {
        const linea = [_citar(npmCmd), ...npmArgs0.map(_citar), ...extra.map(_citar)].join(" ");
        return spawnSync(linea, { ...opts, shell: true, windowsHide: true });
      }
      return spawnSync(npmCmd, [...npmArgs0, ...extra], { ...opts, windowsHide: true });
    };
    // v1.43.0 lote 2 — LÍNEA npm PARA runCommand (que SIEMPRE corre por shell:
    // cmd.exe en Windows, /bin/bash fuera). Antes estos tres `npm install`
    // llevaban el literal «npm install …», que depende del PATH del shell: si
    // la IDE arrancó como EXE sin la carpeta de Node en el PATH, el shell
    // respondía ««npm» no se reconoce…» / «command not found». Ahora usan el
    // MISMO npm resuelto (ruta real o npm-cli.js con el runtime) y CITADO, para
    // que no se parta en los espacios de «C:\Program Files\nodejs\npm.cmd».
    const _lineaNpm = (extra: string[]): string =>
      [_citar(npmCmd), ...npmArgs0.map(_citar), ...extra.map(_citar)].join(" ");
    const spawnSandbox = () => {
      try {
        sandboxLogStream = fs.createWriteStream(logPath, { flags: "w" });
      } catch {
        sandboxLogStream = null;
      }
      // DEP0190: nunca mezclar args[] + shell:true. En Windows se invoca cmd.exe
      // directamente (sin opción shell) para que npm.cmd corra igual y sin warning.
      const isWinSandbox = process.platform === "win32";
      // 🔧 HOST=0.0.0.0 — forzamos que Vite escuche en todas las interfaces para
      // que el sandbox sea alcanzable desde el contenedor/Electron/preview iframe.
      const sandboxEnv = {
        ...process.env,
        PORT: String(SANDBOX_PORT), // 🔧 el sandbox corre en 3500, la IDE en 3000
        SANDBOX_PORT: String(SANDBOX_PORT),
        HOST: "0.0.0.0",
        // ============================================================
        // v2.1 — 🐞 EL SANDBOX NO DEBE HEREDAR MODO PRODUCCIÓN.
        // sandboxEnv hace `...process.env`, así que si la IDE anfitriona corre en
        // producción, el proyecto del sandbox también — y entonces su servidor
        // sirve dist/ (que no existe) en vez de montar Vite: la previsualización
        // queda en blanco y los módulos /src/* dan 404, sin ningún error visible.
        // El sandbox SIEMPRE quiere previsualización en vivo ⇒ desarrollo.
        // ============================================================
        NODE_ENV: "development",
        // v2.1 — Marca de "esto corre DENTRO del sandbox". La usa
        // startAgentBridge para NO arrancar el puente :5000, que pertenece a la
        // IDE anfitriona y hacía que el puente del sandbox muriera 5 veces
        // diciendo "El puerto 5000 ya está ocupado" (y la UI, "no escucha").
        CN_SANDBOX_CHILD: "1",
        // v1.43.0 — si npm se resolvió como npm-cli.js (sin Node en PATH), el
        // propio runtime Electron debe comportarse como Node para ejecutarlo.
        ...(npmInfo && npmInfo.via === "npm-cli.js" ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      };

      // 🔧 PATCH vite.config.ts Y package.json: si el sandbox tiene port:3000
      // en cualquier sitio (vite.config, package.json dev script), reemplazarlo
      // por port:3500. Vite respeta el port del config file y del dev script
      // por encima del env var PORT.
      try {
        // 1. Parchear vite.config.ts/js/mjs
        const viteConfigCandidates = [
          path.join(raizProyecto, "vite.config.ts"),
          path.join(raizProyecto, "vite.config.js"),
          path.join(raizProyecto, "vite.config.mjs"),
        ];
        for (const cfgPath of viteConfigCandidates) {
          if (fs.existsSync(cfgPath)) {
            let content = fs.readFileSync(cfgPath, "utf8");
            // Reemplazar port: <cualquier número> por port: 3500
            const patched = content.replace(/port\s*:\s*\d+/g, `port: ${SANDBOX_PORT}`);
            // Si no tiene port definido pero tiene server:, añadirlo
            let final = patched;
            if (!/port\s*:/.test(patched) && /server\s*:/.test(patched)) {
              final = patched.replace(/(server\s*:\s*\{)/, `$1\n    port: ${SANDBOX_PORT},`);
            }
            // Asegurar host: "0.0.0.0"
            if (!/host\s*:/.test(final) && /server\s*:/.test(final)) {
              final = final.replace(/(server\s*:\s*\{)/, `$1\n    host: "0.0.0.0",`);
            } else {
              final = final.replace(/host\s*:\s*["'][^"']*["']/g, `host: "0.0.0.0"`);
            }

            // ============================================================
            // v2.0 — QUITAR EL CARTEL ROJO DE ERROR DE VITE QUE TAPA EL PREVIEW.
            // Si el proyecto del sandbox no compila (p. ej. un archivo truncado),
            // el overlay de Vite ocupa TODA la vista previa y no deja ver nada:
            // el usuario solo ve el error. Preferimos que el error quede en el
            // log del sandbox y que se pueda seguir viendo la aplicación; además
            // ahora el motor bloquea la escritura de archivos con sintaxis rota,
            // así que este caso debería ser raro.
            // ============================================================
            if (!/overlay\s*:/.test(final)) {
              if (/hmr\s*:\s*\{/.test(final)) {
                final = final.replace(/(hmr\s*:\s*\{)/, `$1\n    overlay: false,`);
              } else if (/server\s*:\s*\{/.test(final)) {
                final = final.replace(/(server\s*:\s*\{)/, `$1\n    hmr: { overlay: false },`);
              } else {
                final = final.replace(/(defineConfig\s*\(\s*\{)/, `$1\n  server: { hmr: { overlay: false } },`);
              }
            }
            fs.writeFileSync(cfgPath, final, "utf8");
            console.log(`[CerebroNico] Sandbox: ${path.basename(cfgPath)} parcheado → port: ${SANDBOX_PORT}`);
            break;
          }
        }

        // 2. 🔧 Parchear package.json: reemplazar --port=3000 o --port 3000
        // en el dev script por --port=3500
        const pkgPath = path.join(raizProyecto, "package.json");
        if (fs.existsSync(pkgPath)) {
          let pkgContent = fs.readFileSync(pkgPath, "utf8");
          // Reemplazar --port=NNNN o --port NNNN por --port=3500
          const patchedPkg = pkgContent
            .replace(/--port[=\s]\d+/gi, `--port=${SANDBOX_PORT}`)
            .replace(/"dev"\s*:\s*"vite"/i, `"dev": "vite --port=${SANDBOX_PORT} --host=0.0.0.0"`);
          if (patchedPkg !== pkgContent) {
            fs.writeFileSync(pkgPath, patchedPkg, "utf8");
            console.log(`[CerebroNico] Sandbox: package.json parcheado → dev script usa --port=${SANDBOX_PORT}`);
          }
        }
      } catch (e: any) {
        console.warn(`[CerebroNico] Sandbox: no se pudo parchear config: ${e.message}`);
      }

      // PROPIO-IDE v1: correr la IDE dentro de su sandbox usa la ruta de
      // producción (compilar + node dist/server.mjs). El desvío dev (tsx)
      // choca con TransformError bajo Node 26 — la recursión no puede pagar
      // un dev server dentro de otro.
      const esPropiaIde = (() => {
        try { return JSON.parse(fs.readFileSync(path.join(raizProyecto, "package.json"), "utf8"))?.name === "cerebronico-ide"; }
        catch { return false; }
      })();
      if (esPropiaIde) {
        // spawnSync ya está importado arriba (estático, línea ~114).
        // 🐞 DEFECTO v1.0.3 (IDE-dentro-de-IDE): el ZIP de la propia IDE no
        // trae node_modules (pesaría 300 MB) y la auto-instalación general
        // está DESACTIVADA para el resto de proyectos (evita recargas en
        // caliente con el sync). Resultado: `npm run build` moría en
        // «tsx is not recognized» y la recursión no arrancaba nunca.
        // Para la propia IDE SÍ instalamos aquí, en su propia carpeta, con
        // --ignore-scripts: el postinstall del proyecto siembra .cerebro-db
        // (que la copia anidada no necesita del padre) y Electron bajaría su
        // binario de 100 MB para un servidor headless que no lo usa.
        // v1.6.27 — NO BASTA CON QUE LA CARPETA EXISTA.
        // Un node_modules creado por un package.json ANTERIOR pasa el
        // `existsSync` y deja el árbol roto PARA SIEMPRE, porque el
        // `npm install` no se vuelve a ejecutar nunca. Caso real medido: al
        // árbol le faltaba `js-yaml`, que el código importa en
        // src/engine/formatConverter.ts, y `vite build` moría con
        // «Rollup failed to resolve import "js-yaml"» — un fallo pegajoso que
        // sobrevive a reiniciar y a «Forzar Limpieza».
        // Ahora la condición es la auditoría de integridad: carpeta ausente O
        // dependencia declarada que no está → se instala.
        if (!nodeModulesSanoEn(raizProyecto)) {
          console.log(
            fs.existsSync(path.join(raizProyecto, "node_modules"))
              ? "[CerebroNico] IDE anidada: node_modules INCOMPLETO (alguna dependencia declarada no está) → se reinstala (--ignore-scripts)…"
              : "[CerebroNico] IDE anidada sin node_modules: instalando dependencias de compilación (--ignore-scripts)…"
          );
          const inst = correrNpmSync(["install", "--no-audit", "--no-fund", "--ignore-scripts"], {
            cwd: raizProyecto, env: sandboxEnv, timeout: 600000,
          });
          if (inst.status !== 0) {
            const detalle = detalleDeSalida(inst.stderr || inst.stdout);
            return res.json({
              error:
                "La IDE anidada no pudo instalar sus dependencias (necesita red la primera vez) " +
                `[npm install en ${raizProyecto}]: ` + (detalle || "sin detalle"),
            });
          }
        }
        // ============================================================
        // v1.6.28-AUTOMEJORA — REFORMAR EL CÓDIGO Y VERLO CORRIENDO
        // ------------------------------------------------------------
        // Lo que se quiere de este camino NO es «arrancar la IDE dentro de la
        // IDE»: es el CICLO. Reformar el código en el editor → sincronizar →
        // arrancar → ver el resultado en el :3500 → repetir. Para eso el build
        // tiene que ejecutarse cuando HAY CAMBIOS, y sólo entonces:
        //
        //   · dist/ más nuevo que todas las fuentes → no hubo reforma: se
        //     arranca con lo que hay (segundos, sin Rollup).
        //   · alguna fuente más nueva que dist/ → hubo reforma: se RECOMPILA.
        //   · SANDBOX_IDE_BUILD=1 → se recompila igual (forzar).
        //
        // Y si el build falla: primero se intenta REPARAR (instalar lo
        // declarado que falte) y se reintenta UNA vez. Si aun así falla, el
        // :3500 no queda muerto, pero tampoco se miente: se avisa de que el
        // build servido es ANTERIOR a los últimos cambios.
        // ============================================================
        const distServer = path.join(raizProyecto, "dist", "server.mjs");
        const forzarBuildIde = String(process.env.SANDBOX_IDE_BUILD || "") === "1";
        const hayDist = fs.existsSync(distServer);

        /** Lo más nuevo del CÓDIGO del proyecto: lo que el build tiene que reflejar. */
        const mtimeMasNuevoDeFuentes = (): number => {
          let max = 0;
          const pila = [raizProyecto];
          while (pila.length > 0) {
            const actual = pila.pop() as string;
            let entradas: fs.Dirent[] = [];
            try {
              entradas = fs.readdirSync(actual, { withFileTypes: true });
            } catch {
              continue; // carpeta que se fue mientras recorríamos
            }
            for (const e of entradas) {
              if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
              if (e.name.startsWith(".")) continue; // .proyectos, .cerebro-db, .git…
              const p = path.join(actual, e.name);
              if (e.isDirectory()) {
                pila.push(p);
                continue;
              }
              // Sólo lo que entra en un build: código, estilos, HTML y manifiestos.
              if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|html|json)$/i.test(e.name)) continue;
              try {
                max = Math.max(max, fs.statSync(p).mtimeMs);
              } catch {
                /* archivo que se fue: no importa */
              }
            }
          }
          return max;
        };

        const fuentesMasNuevas = mtimeMasNuevoDeFuentes();
        const distMtime = hayDist ? fs.statSync(distServer).mtimeMs : 0;
        // Tolerancia de 2 s: al importar un ZIP todos los archivos quedan con la
        // misma marca de tiempo, y un empate NO es una reforma (si lo fuera, se
        // compilaría en cada arranque, que es justo lo que se quiere evitar).
        const hayReforma = !hayDist || fuentesMasNuevas > distMtime + 2000;
        const tocaCompilar = forzarBuildIde || hayReforma;

        if (!tocaCompilar) {
          console.log(
            `[CerebroNico] IDE anidada: dist/ al día (${new Date(distMtime).toISOString()}) — sin reformas que compilar, se omite npm run build.`
          );
        } else {
          if (forzarBuildIde) console.log("[CerebroNico] IDE anidada: SANDBOX_IDE_BUILD=1 → se recompila (npm run build).");
          else if (hayDist) console.log("[CerebroNico] IDE anidada: hay fuentes más nuevas que dist/ → se recompila (npm run build).");
          let build = correrNpmSync(["run", "build"], { cwd: raizProyecto, env: sandboxEnv, timeout: 300000 });
          if (build.status !== 0) {
            const primerDetalle = detalleDeSalida(build.stderr || build.stdout);
            // v1.6.28 — AUTO-REPARACIÓN ANTES DE DARSE POR VENCIDO.
            // El fallo más común de un build dentro del sandbox es una
            // dependencia DECLARADA que no está en node_modules (árbol creado por
            // un package.json anterior, o instalación que quedó a medias). Se
            // instala y se reintenta UNA vez: si el problema era ése, el ciclo de
            // automejora se arregla solo en lugar de quedar muerto para siempre.
            if (!nodeModulesSanoEn(raizProyecto)) {
              console.warn(
                "[CerebroNico] IDE anidada: el build falló y la auditoría ve dependencias declaradas sin instalar → se instalan y se reintenta una vez."
              );
              correrNpmSync(["install", "--no-audit", "--no-fund", "--ignore-scripts"], {
                cwd: raizProyecto,
                env: sandboxEnv,
                timeout: 600000,
              });
              build = correrNpmSync(["run", "build"], { cwd: raizProyecto, env: sandboxEnv, timeout: 300000 });
              if (build.status === 0)
                console.log("[CerebroNico] IDE anidada: ✔ build correcto tras reparar las dependencias.");
            }
            if (build.status !== 0) {
              const detalle = detalleDeSalida(build.stderr || build.stdout) || primerDetalle;
              // Un fallo de compilación no tiene por qué dejar el :3500 muerto:
              // si hay un dist/ usable, se arranca con él. Pero se dice la
              // verdad: ese build es ANTERIOR a los últimos cambios, así que el
              // preview no va a reflejar la reforma.
              if (hayDist) {
                console.warn(
                  `[CerebroNico] IDE anidada: npm run build falló (${detalle || "sin detalle"}) pero hay dist/server.mjs: se arranca con ese build — OJO: es ANTERIOR a tus últimos cambios, el preview NO refleja la reforma.`
                );
              } else if (esErrorDeCodigoDelProyecto(detalle)) {
                // v1.6.30 — UN ERROR DE CÓDIGO NO SE EXPLICA CON LA VÍA DE LA RECURSIÓN.
                // Este caso (visto en pantalla: «"loadLanguageMemories" is not exported
                // by src/utils/languageMemory.ts») es un archivo del árbol que no
                // coincide con el que lo importa: la firma de un árbol MEZCLADO.
                return res.json({
                  error:
                    `Se rompió el BUILD del proyecto — es un error de CÓDIGO, no de recursión ni de dependencias [npm run build en ${raizProyecto}]: ` +
                    (detalle || "sin detalle del proceso") +
                    " | CAUSA TÍPICA: el árbol del sandbox quedó MEZCLADO con archivos de versiones anteriores. La sincronización escribe lo que tiene el editor, pero NO borra lo que sobró de sesiones previas; ese archivo viejo no coincide con el nuevo que lo importa, y Rollup corta. " +
                    " | CÓMO LIMPIARLO SIN REINSTALAR: Ctrl + Alt + L en la IDE (borra los restos y conserva node_modules y el estado) y después «Arrancar ahora»: el sync reescribe el proyecto entero desde el editor. " +
                    " | Si el error se repite con el árbol ya limpio, entonces el archivo que falta NO está en el workspace del editor: reimportá el proyecto completo.",
                });
              } else {
                // v1.6.23 — GUARDA-E: el error ya no muere en la traza. Casi siempre
                // significa que la propia IDE cayó dentro del sandbox (mal importada
                // o encontrada por el resolutor con una raíz de datos inválida — las
                // guardas A y B de esta versión lo previenen). El mensaje dice cómo
                // salir en tres pasos, porque un fallo sin salida es un callejón.
                return res.json({
                  error:
                    `La IDE no pudo compilarse dentro del sandbox [npm run build en ${raizProyecto}]: ` +
                    (detalle || "sin detalle del proceso") +
                    " — VÍA DE SALIDA: esto casi siempre significa que la propia IDE está dentro del sandbox, no tu app. " +
                    "Pasos: 1) Sandbox → Detener. 2) «Borrar todo» en el editor (muda el estado de CerebroNico y vacía .proyectos por completo). " +
                    "3) Reimportá SOLO tu aplicación. Si el problema persiste, revisá que PROJECT_DIR no apunte a la carpeta de instalación de la IDE. " +
                    "Si lo que buscabas era el autotest «IDE dentro de la IDE», reimportá el ZIP completo: trae dist/ compilado y con eso no hace falta compilar nada.",
                });
              }
            }
          }
        }
      }
      const proc = esPropiaIde
        ? spawn(process.execPath, ["dist/server.mjs"], {
            cwd: raizProyecto,
            env: { ...sandboxEnv, PORT: String(SANDBOX_PORT), NODE_ENV: "production" },
            detached: true,
            windowsHide: true,
            stdio: ["ignore", sandboxLogStream ? "pipe" : "ignore", sandboxLogStream ? "pipe" : "ignore"],
          })
        : isWinSandbox
        ? spawn(process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", ["/d", "/s", "/c", [_citar(npmCmd), ...npmArgs0.map(_citar), "run", "dev"].join(" ")], {
            cwd: raizProyecto,
            env: sandboxEnv,
            windowsHide: true,
            // windowsVerbatimArguments: Node NO vuelve a entrecomillar los args;
            // la línea tras «/c» viaja tal cual, con la ruta de npm ya citada,
            // así cmd.exe no parte «C:\Program Files\…» por el espacio.
            windowsVerbatimArguments: true,
            stdio: ["ignore", sandboxLogStream ? "pipe" : "ignore", sandboxLogStream ? "pipe" : "ignore"],
          })
        : spawn(npmCmd, [...npmArgs0, "run", "dev"], {
            cwd: raizProyecto,
            env: sandboxEnv,
            detached: true,
            windowsHide: true,
            stdio: ["ignore", sandboxLogStream ? "pipe" : "ignore", sandboxLogStream ? "pipe" : "ignore"],
          });
      // 🔧 ANTI-ZOMBIE: si el padre muere, matar al hijo. Y olvidar el proceso al salir.
      proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        console.log(`[CerebroNico] Sandbox proc exited (code=${code}, signal=${signal})`);
        olvidarProceso(proc);
      });
      proc.on("error", (err: Error) => {
        console.warn(`[CerebroNico] Sandbox proc error: ${err.message}`);
        olvidarProceso(proc);
      });
      if (sandboxLogStream && proc.stdout) proc.stdout.pipe(sandboxLogStream);
      if (sandboxLogStream && proc.stderr) proc.stderr.pipe(sandboxLogStream);
      return proc;
    };

    const waitPortOrDeath = async (maxMs: number): Promise<boolean> => {
      const t0 = Date.now();
      let up = false;
      while (Date.now() - t0 < maxMs) {
        up = await isPortUp(SANDBOX_PORT, 1500);
        if (up) break;
        if (!sandboxVivo()) break;
        await sleepMs(1500);
      }
      return up;
    };

    // ============================================================
    // v1.6.7 — CHEQUEO PREVIO DE DEPENDENCIAS DEL PROYECTO
    // ------------------------------------------------------------
    // 🐞 Caso real, visto en pantalla: el IDE arrancaba, el sandbox «arrancaba»
    // y el preview quedaba muerto con
    //
    //   [plugin:vite:import-analysis] Failed to resolve import "jspdf" from
    //   "src/services/pdfReportService.ts". ¿Existe el archivo?
    //
    // El código generado importaba `jspdf` y `jspdf-autotable`; el package.json
    // del proyecto no los declaraba y nadie los instaló.
    //
    // La auto-reparación de más abajo NO podía verlo, y no por un detalle: solo
    // se dispara cuando el proceso MUERE. Aquí Vite sigue VIVO, contestando el
    // puerto con el aviso dentro, así que `waitPortOrDeath` lo da por bueno y el
    // sandbox se reporta «online» con una pantalla de error. Hay que mirarlo
    // ANTES de arrancar.
    //
    // Se instala SOLO lo que falta, por nombre (`npm install --save pkg…`), y no
    // un `npm install` a secas: ese era el que disparaba watchers y reiniciaba
    // la IDE a mitad de una carga de archivos. Aquí el servidor del proyecto
    // todavía no existe, así que no hay watcher al que despertar.
    //
    // Para desactivarlo: SANDBOX_AUTO_DEPS=0 en el entorno.
    // ============================================================
    // v1.6.24 — esta bandera llega hasta la respuesta JSON: el piloto y la UI
    // pueden saber si el sandbox se instaló solo en este arranque.
    let dependenciasInstaladas = false;
    if (process.env.SANDBOX_AUTO_DEPS !== "0") {
      try {
        const raizDeps = resolverRaizProyecto().raiz;
        const ficherosDeps: Array<{ path: string; content: string }> = [];
        const recorrerDeps = (dir: string, rel: string, prof: number): void => {
          if (prof > 12 || ficherosDeps.length > 1500) return;
          let entradas: string[] = [];
          try {
            entradas = fs.readdirSync(dir);
          } catch {
            return;
          }
          for (const e of entradas) {
            if (["node_modules", ".git", "dist", "build", ".vite", "__pycache__", "venv"].includes(e)) continue;
            const abs = path.join(dir, e);
            let st: fs.Stats;
            try {
              st = fs.statSync(abs);
            } catch {
              continue;
            }
            if (st.isDirectory()) {
              recorrerDeps(abs, rel ? `${rel}/${e}` : e, prof + 1);
            } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(e) && st.size < 400000) {
              try {
                ficherosDeps.push({ path: rel ? `${rel}/${e}` : e, content: fs.readFileSync(abs, "utf-8") });
              } catch {}
            }
          }
        };
        recorrerDeps(raizDeps, "", 0);

        let declaradosDeps: string[] = [];
        let nombrePkgDeps = "";
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(raizDeps, "package.json"), "utf-8"));
          nombrePkgDeps = String(pkg?.name || "");
          declaradosDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
        } catch {}
        // La IDE anidada se autorrepara en su propio bloque (PROPIO-IDE v1), con
        // --ignore-scripts para no traer Electron ni sembrar .cerebro-db. Que el
        // preflight de abajo no le monte una instalación paralela sin esas banderas.
        const esPropiaIdeDeps = nombrePkgDeps === "cerebronico-ide";
        const entornoDeps = {
          declarados: declaradosDeps,
          // `path.join(raiz, "node_modules", "@scope", "pkg")`: con `p.split("/")`
          // los paquetes con ámbito se buscan donde están de verdad.
          // v1.6.24 — y «estar» dejó de ser existir la carpeta: el paquete está
          // si su propio package.json declara una entrada que responde en disco.
          estaInstalado: (p: string) =>
            saludDePaquete(path.join(raizDeps, "node_modules", ...p.split("/")), DISCO_AUDITORIA) === "ok",
        };

        const faltantes = paquetesFaltantes(ficherosDeps, entornoDeps);
        const sinInstalar = declaradosSinInstalar(ficherosDeps, entornoDeps);

        // v1.6.24 — AUDITORÍA COMPLETA de los declarados, importados o no: es el
        // paso que faltaba. El caso reportado («Cannot find module
        // …/vite/dist/node/chunks/dist.js») es un node_modules EXISTENTE pero
        // podado —ZIP sin dependencias o npm install cortado por el viejo
        // timeout de 300 s—. La comprobación por carpeta lo dejaba pasar.
        const auditoria = esPropiaIdeDeps ? { ausentes: [], rotos: [] } : auditarRaiz(raizDeps, declaradosDeps);

        if (auditoria.rotos.length > 0) {
          // Lo podado hay que enterrarlo: npm confía en el árbol que ya ve y
          // puede no reescribir archivos que cree presentes. Se borran SOLO
          // las carpetas de los paquetes rotos —jamás código del usuario— y
          // el install de abajo las devuelve limpias.
          console.log(
            `[CerebroNico] Sandbox: ${auditoria.rotos.length} paquete(s) con instalación incompleta ` +
              `(${auditoria.rotos.slice(0, 5).join(", ")}) → se purgan antes de reinstalar.`
          );
          for (const p of auditoria.rotos) {
            try {
              fs.rmSync(path.join(raizDeps, "node_modules", ...p.split("/")), { recursive: true, force: true });
            } catch {}
          }
        }

        const aReinstalar = auditoria.ausentes.length > 0 || auditoria.rotos.length > 0;
        if (aReinstalar) {
          // Declaradas pero ausentes o rotas: el remedio es el `npm install`
          // normal —respeta lockfile y las versiones fijadas por la plantilla—,
          // no reescribirlas con --save.
          // v1.6.24 — ANTES esto era solo un `console.warn`: el usuario se
          // quedaba con el aviso y sin sandbox («NO FUNCIONA EL SANDBOX»).
          // Ahora se instala aquí mismo, antes de spawn, donde todavía NO hay
          // ningún watcher vivo al que despertar (la misma razón de seguridad
          // que ya justificaba el --save de abajo). El timeout pasa de 300 s a
          // 600 s: el timeout corto era, precisamente, el generador de árboles
          // incompletos.
          console.log(
            `[CerebroNico] Sandbox: ${aReinstalar ? `${auditoria.ausentes.length} ausente(s) + ${auditoria.rotos.length} roto(s)` : ""} en node_modules → npm install automático antes de arrancar.`
          );
          const inst = await runCommand(_lineaNpm(["install", "--no-audit", "--no-fund"]), raizDeps, 600000);
          if (inst.exitCode === 0) {
            dependenciasInstaladas = true;
            console.log("[CerebroNico] Sandbox: ✔ npm install completo — ahora sí se puede respetar su `dev`.");
          } else {
            const detalle = detalleDeSalida(inst.stderr || inst.stdout);
            console.warn(
              `[CerebroNico] Sandbox: ✘ npm install no completó (${inst.timedOut ? "timeout de 10 min — ¿red lenta o registry caído?" : `exit ${inst.exitCode}`})${detalle ? `: ${detalle}` : ""}. Se intenta arrancar igual; la auto-reparación de abajo reintenta.`
            );
          }
        } else if (sinInstalar.length > 0 && !aReinstalar) {
          // caso raro: declaradas-sin-instalar que la auditoría no vio (p. ej.
          // paquete instalado en un nivel anidado). Se avisa, sin instalar a ciegas.
          console.warn(
            `[CerebroNico] Sandbox: ${sinInstalar.length} dependencia(s) declaradas y SIN instalar ` +
              `(${sinInstalar.slice(0, 5).join(", ")}). La auditoría no las vio rotas; puede ser hoisting anidado.`
          );
        }
        if (faltantes.length > 0 && !esPropiaIdeDeps) {
          console.log(`[CerebroNico] Sandbox: ${describirFaltantes(faltantes)} → se instalan antes de arrancar.`);
          // v1.43.0 lote 2 — mismo npm resuelto+citado (no el literal «npm»
          // de comandoInstalacion, que dependía del PATH del shell).
          const cmd = _lineaNpm(["install", "--save", "--no-audit", "--no-fund", ...faltantes]);
          const r = await runCommand(cmd, raizDeps, 600000);
          if (r && r.exitCode === 0) dependenciasInstaladas = true;
        }
      } catch (err: any) {
        console.warn(
          `[CerebroNico] Sandbox: el chequeo de dependencias no pudo completarse (${err?.message ?? err}). Se arranca igual.`
        );
      }
    }

    // Intento 1: arranque directo (rápido si todo está instalado)
    registrarProceso(spawnSandbox());
    console.log(`[CerebroNico] Sandbox arrancado (pid ${pidSandbox()}) en puerto ${SANDBOX_PORT}`);
    let online = await waitPortOrDeath(45000);
    let healed = false;

    // Intento 2 (auto-reparación): si murió sin levantar puerto por deps faltantes,
    // npm install automático y reintento. Así el usuario nunca instala a mano.
    //
    // v1.6.24 — LA REPARACIÓN VUELVE A ESTAR ACTIVADA POR DEFECTO.
    // El apagado respondía al bug «subir ZIP reinicia la app»: un `npm install`
    // a mitad de una carga masiva despertaba watchers. Pero ese caso no existe
    // aquí: este flujo es /api/sandbox/start —acción explícita del usuario— y
    // la reparación solo corre cuando el proceso del proyecto YA MURIÓ
    // (!isPidAlive): el watcher que podía reiniciar algo es justamente el que
    // ya no está. Además el preflight de arriba instala ANTES de spawn, cuando
    // tampoco hay watcher vivo. El apagado por defecto dejó una garantía peor:
    // con node_modules podado por el ZIP, el sandbox NUNCA se arreglaba solo
    // («NO FUNCIONA EL SANDBOX»). Opt-out: AUTO_INSTALL_DEPS=0.
    const autoInstallEnabled = process.env.AUTO_INSTALL_DEPS !== "0";
    if (autoInstallEnabled && !online && !sandboxVivo() && needsInstall(readLogTail())) {
      console.log("[CerebroNico] Sandbox: dependencias faltantes detectadas -> npm install automático");
      try {
        olvidarProceso();
        // v2.1 — 🐞 `npm install` corría SIEMPRE en la raíz de .proyectos, aunque
        // el proyecto estuviera en una subcarpeta: instalaba en el sitio
        // equivocado (o fallaba). Ahora instala donde vive el package.json real.
        await runCommand(_lineaNpm(["install", "--no-audit", "--no-fund"]), resolverRaizProyecto().raiz, 600000);
        healed = true;
      } catch {}
      registrarProceso(spawnSandbox());
      online = await waitPortOrDeath(60000);

      // Intento 3 — el martillo contra el árbol FANTASMA (v1.6.24):
      // si el log sigue quejando módulos después de un install que npm creyó
      // bueno, el árbol tiene archivos huérfanos que npm da por presentes
      // (típico de un install anterior cortado a medias). Se borra SOLO
      // node_modules —el código del usuario no se toca ni un byte— y se
      // instala de cero. Coste: unos segundos; valor: el sandbox se repara
      // siempre, sin terminal y sin instrucciones manuales.
      if (!online && !sandboxVivo() && needsInstall(readLogTail())) {
        try {
          const raizMartillo = resolverRaizProyecto().raiz;
          const nmMartillo = path.join(raizMartillo, "node_modules");
          console.log("[CerebroNico] Sandbox: el reintegro no sanó el árbol → se purga node_modules y se instala de cero.");
          fs.rmSync(nmMartillo, { recursive: true, force: true });
          const martillo = await runCommand(_lineaNpm(["install", "--no-audit", "--no-fund"]), raizMartillo, 600000);
          if (martillo.exitCode === 0) dependenciasInstaladas = true;
          healed = true;
        } catch {}
        registrarProceso(spawnSandbox());
        online = await waitPortOrDeath(60000);
      }
    } else if (!online && !autoInstallEnabled && needsInstall(readLogTail())) {
      // 🔧 Reparación explícitamente apagada por el usuario: decir la salida.
      console.warn(
        "[CerebroNico] Sandbox: dependencias faltantes detectadas, pero la auto-instalación " +
        "fue desactivada a mano (AUTO_INSTALL_DEPS=0). " +
        "Ejecuta manualmente: cd .proyectos && npm install (o quita la variable para que la IDE se repare sola)."
      );
    }

    // ============================================================
    // v2.1 — 🐞 CUANDO EL PUERTO NO RESPONDE, DECIR POR QUÉ
    // ------------------------------------------------------------
    // Antes la respuesta era solo `online:false`, y el usuario leía
    // "El proceso arrancó pero el puerto 3500 aún no responde": un mensaje que
    // no explica NADA. El proceso puede haber MUERTO (falta tsx, EADDRINUSE,
    // error de arranque) o seguir vivo pero lento, y todo se veía igual.
    //
    // Comprobado en local: este proyecto SÍ engancha el 3500 con el entorno del
    // sandbox (PORT=3500, HOST=0.0.0.0). El silencio era el problema, no el
    // arranque. Así que ahora se devuelve el final real del log del proceso y
    // una pista de la causa más probable.
    // ============================================================
    const cola = online ? "" : readLogTail();
    const vivo = sandboxVivo(); if (vivo) registrarRaizServida(raizProyecto); // v1.87.1 · la raíz que de verdad quedó sirviendo
    let pista = "";
    if (!online) {
      if (/EADDRINUSE|address already in use|ya est[áa] ocupado/i.test(cola)) {
        pista = `El puerto ${SANDBOX_PORT} ya está ocupado por otro proceso (normalmente un intento anterior que quedó vivo). Pulsa «Forzar Limpieza» y reintenta.`;
      } else if (!npmResuelto) {
        // v1.43.0 — RAÍZ real del «NADA se ve en el sandbox»: Node/npm no está
        // en el PATH del proceso (típico al correr la IDE como EXE empaquetado),
        // así que el spawn de npm muere con «no se reconoce como un comando
        // interno o externo» y la vista previa queda en blanco sin explicación.
        // Solo se dice esto cuando la IDE NO pudo resolver npm (ni en PATH ni en
        // rutas conocidas); si npm SÍ se resolvió, el «no se reconoce» de abajo
        // viene de OTRO binario (del `dev` del proyecto), no de npm.
        pista = "No se encontró Node/npm: no están en el PATH de la IDE (habitual al abrir la app como ejecutable empaquetado). La IDE ya probó a resolver npm en las rutas conocidas sin éxito. Instala Node.js (incluye npm) y asegúrate de que «node» y «npm» funcionen en una terminal nueva; luego vuelve a pulsar Arrancar. No hace falta tocar nada más.";
      } else if (/no se reconoce como un comando|is not recognized as (?:an? )?(?:internal|external|the name)|command not found/i.test(cola)) {
        // v1.43.0 lote 2 — npm SÍ se resolvió (npmResuelto=true), pero el log
        // trae un «no se reconoce / command not found». Entonces NO es npm: es
        // un binario que invoca el `dev`/`build` del propio proyecto y que no
        // está instalado (p. ej. «cross-env», «vite», «tsx»). Decir «instala
        // Node» aquí despistaba. El remedio real es instalar las dependencias
        // del proyecto (la IDE ya lo intenta) o declarar el paquete que falta.
        pista = "Node/npm SÍ están disponibles, pero un comando que usa el arranque del proyecto («dev»/«build») no se reconoce: casi siempre es una herramienta del proyecto sin instalar (cross-env, vite, tsx, etc.). La IDE ya intentó «npm install»; si persiste, revisa el nombre del comando en los scripts del package.json y que el paquete que lo aporta esté en las dependencias. El detalle está en el log de abajo.";
      } else if (/Cannot find (module|package)|ERR_MODULE_NOT_FOUND|ENOENT/i.test(cola)) {
        // v1.6.24 — El viejo «Ejecuta npm install y reintenta» convertía el
        // sandbox en una tarea de terminal. Para cuando este mensaje se lee, la
        // IDE YA intentó instalar dos veces en esta misma petición (preflight
        // antes de spawn + escalera de reparación tras la muerte, incluida la
        // purga del árbol). La pista dice lo que queda, que es diagnóstico.
        pista = autoInstallEnabled
          ? "La auto-instalación del sandbox no logró sanarlo. Casi siempre es RED (registry.npmjs.com inalcanzable, proxy corporativo, antivirus) o un package.json con versiones incompatibles. El detalle está en el log de arriba; con el problema resuelto, vuelve a pulsar Arrancar — no hace falta tocar la terminal."
          : "Faltan dependencias y la reparación automática está apagada (AUTO_INSTALL_DEPS=0). Quítala para que la IDE se repare sola, o ejecuta «npm install» en el proyecto.";
      } else if (!vivo) {
        pista = "El proceso del proyecto TERMINÓ antes de abrir el puerto. La causa está en las últimas líneas de abajo.";
      } else {
        pista = "El proceso sigue vivo pero aún no ha abierto el puerto. Revisa las últimas líneas de abajo.";
      }
    }
    return res.json({
      ok: true,
      pid: pidSandbox() ?? null,
      port: SANDBOX_PORT,
      online,
      healed,
      // v1.6.24 — `instalo`: ¿instaló dependencias el sandbox por su cuenta en
      // este arranque? `via`: qué vía decidió el preview. Los dos campos que
      // faltaban para que el piloto pudiera explicar lo que pasó sin adivinar.
      instalo: dependenciasInstaladas,
      via: viaPreview.via,
      running: vivo,
      logTail: cola,
      hint: pista,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/sandbox/stop", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  let killed = false;
  // El PID se lee UNA vez y se usa el mismo en las tres llamadas. Antes se leía en
  // cada sitio: si el proceso moría entre la comprobación y el `taskkill`, se
  // estaría matando a otro (o a nadie) con un PID reciclado. Un dato del estado se
  // lee una vez y se usa entero.
  const pidSandboxActual = pidSandbox();
  if (pidSandboxActual) {
    try {
      if (process.platform === "win32") {
        await execAsync(`taskkill /PID ${pidSandboxActual} /T /F`);
      } else {
        try {
          process.kill(-pidSandboxActual, "SIGKILL");
        } catch {
          matarProceso("SIGKILL");
        }
      }
      killed = true;
    } catch {}
    try { matarProceso("SIGKILL"); } catch {}
    olvidarProceso();
  }
  // Limpieza de huérfanos: algo sigue en 3500 sin que lo gestionemos
  if (await isPortUp(SANDBOX_PORT, 1200)) {
    await killPortListeners(SANDBOX_PORT);
  }
  return res.json({ ok: true, killed });
});

// ============================================================
// v1.53.0 — INYECTAR IMAGEN EN EL SANDBOX (P2)
// ------------------------------------------------------------
// Copia un archivo (imagen u otro estático) del workspace del proyecto
// a la raíz que sirve el sandbox, y devuelve la ruta relativa que el
// HTML puede usar como <img src="...">.
//
// Antes: el modelo insertaba <img src="assets/subidas/foto.png"> pero
// el sandbox servía desde .creador/<sitio>/, donde esa ruta NO existía.
// Ahora el frontend puede llamar este endpoint para copiar la imagen al
// sandbox y obtener la ruta usable.
//
// ESTADO v1.72.0 (medido, no opinado): NINGÚN llamador en el frontend. La
// copia que el recetario le prometía al modelo «automáticamente» nunca ocurrió
// — y por eso las instrucciones de ruta se corrigieron para decir la verdad
// (assets/subidas/ existe en la raíz del proyecto: server.ts lo materializa
// ahí y el servidor estático lo resuelve desde v1.72.0, incluso por nombre).
// Se MANTIENE porque está dado de alta en contrato-rutas.json (darlo de baja
// es un cambio de superficie, no una limpieza) y porque sigue siendo la
// respuesta correcta cuando el sitio servido es una subcarpeta y el HTML no
// puede subir con «../». Si se cablea, que sea desde la aduana de sync.
// ============================================================
app.post("/api/sandbox/inject-image", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const { sourcePath, targetSubdir = "img" } = req.body;
  if (!sourcePath || typeof sourcePath !== "string") {
    return res.status(400).json({ error: "sourcePath es obligatorio (ruta relativa dentro del proyecto)." });
  }
  // Seguridad: solo rutas relativas dentro del PROJECT_ROOT
  const absSource = resolveSafePath(sourcePath);
  if (!fs.existsSync(absSource)) {
    return res.status(404).json({ error: `El archivo no existe: ${sourcePath}` });
  }
  // Resolver la raíz del sandbox (donde sirve los estáticos)
  const proyecto = resolverRaizProyecto();
  const sandboxRoot = proyecto.raiz;
  const targetDir = path.join(sandboxRoot, targetSubdir);
  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch {}
  const nombreArchivo = path.basename(absSource);
  // Evitar colisiones: si ya existe un archivo con el mismo nombre, añadir sufijo
  let targetName = nombreArchivo;
  let absTarget = path.join(targetDir, targetName);
  if (fs.existsSync(absTarget)) {
    // Comparar si es el mismo archivo (mismo tamaño)
    const statSource = fs.statSync(absSource);
    const statTarget = fs.statSync(absTarget);
    if (statSource.size !== statTarget.size) {
      const ext = path.extname(nombreArchivo);
      const base = path.basename(nombreArchivo, ext);
      targetName = `${base}_${Date.now()}${ext}`;
      absTarget = path.join(targetDir, targetName);
    }
  }
  try {
    fs.copyFileSync(absSource, absTarget);
  } catch (err: any) {
    return res.status(500).json({ error: `Error al copiar: ${err.message}` });
  }
  // La ruta relativa que el HTML del sandbox debe usar
  const rutaRelativa = `${targetSubdir}/${targetName}`;
  return res.json({ ok: true, rutaRelativa, rutaAbsoluta: absTarget, sandboxRoot });
});

  // v1.97.4 · EL ENTREGABLE ES UN SOLO ZIP (pedido de Mario, 31/10): una
  // línea de registro por ruta — la lógica vive en server/sandboxEntregable.ts,
  // porque el techo del monolito lo congelan embedderLocal (12174) y
  // rutasSistema (12178): se parte el código, no se agranda el presupuesto.
  const entregableCtx: CtxEntregable = { raizDe: () => resolverRaizProyecto().raiz, raizDatos: PROJECT_ROOT, autorizado: sandboxAuthorized };
  // La puerta se ve en la SUPERFICIE (el trinquete vigila que un guard no
  // desaparezca) y el módulo la vuelve a exigir: doble puerta, cero confianza.
  app.get("/api/sandbox/zip", (req: Request, res: Response) => { if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." }); return zipEntregable(req, res, entregableCtx); });
  app.get("/api/sandbox/zip-info", (req: Request, res: Response) => { if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." }); return infoEntregable(req, res, entregableCtx); });

  // v1.0.24 · EL CUERPO SE MUDÓ A UN ROUTER CON SUS CINCO AYUDANTES.
  // /api/sandbox/status (server.ts:8219 en el log) estallaba con
  // ERR_HTTP_HEADERS_SENT cuando el sondeo del :3500 vencía el plazo de /api. La
  // cura es pequeña (una ficha), pero el archivo donde vivía tiene TECHO
  // DECLARADO y un parche de tres líneas lo empuja por encima: la Fase 2 dice
  // partir, no añadir. Se extrajo la ruta ENTERA (1 línea de delegación) con su
  // detección de proyecto anidado, su aduana y su rama de web estática.
  // v1.0.28 — el inventario de packs (y de servidores MCP) se audita en vivo.
  registrarEstadoPacksMcp(app, {
    packsHttp: () => [...remotePackEndpoints.entries()].map(([id, e]) => ({
      id,
      url: e.url,
      autenticado: Boolean(e.headers["X-Cerebro-Token"]),
      herramientas: (listToolPacks().find((p) => p.id === id)?.tools || []).map((t) => t.name),
    })),
    reintentosUsados: () => packsIntentos,
    reintentoMax: () => PACKS_INTENTOS_MAX,
    estadoMcp: () => packsMcpEstado,
    mcpVivos: () => servidoresMcpVivos(),
    recargarMcp: () => cargarMcpDelArchivo(true),
  });
  registrarEstadoSandbox(app, { raizProyecto: PROJECT_ROOT, puertoSandbox: SANDBOX_PORT, sandboxVivo, autorizado: sandboxAuthorized, puertoArriba: (p, ms) => isPortUp(p, ms), resolverRaizProyecto, nodeModulesSano: nodeModulesSanoEn });

app.get("/api/sandbox/logs", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    const logPath = path.join(PROJECT_ROOT, ".sandbox_3500.log");
    const logs = readFileTail(logPath, 16 * 1024);
    return res.json({ logs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================
// v1.6.31 — GUARDA-SERVIDOR-EJEC · usaEnSuLugar
// ------------------------------------------------------------
// Un servidor de larga vida no se ejecuta por la puerta síncrona: `execAsync`
// espera a que el proceso «termine», y Vite/npm start/uvicorn… nunca terminan,
// así que morían por timeout. En su lugar (usaEnSuLugar) se arranca EN SEGUNDO
// PLANO y se devuelve al momento, sin esperar. El puerto se adapta al sandbox
// (:3500) igual que hace /api/sandbox/start.
// ============================================================
async function arrancarServidorEnSegundoPlano(comando: string, cwd: string) {
  try {
    const adaptado = normalizeProjectPort(cwd, SANDBOX_PORT);
    for (const c of adaptado.cambios) console.log(`[CerebroNico] Proyecto adaptado · ${c}`);
  } catch {
    /* la adaptación de puerto nunca debe tumbar el arranque */
  }
  const esWin = process.platform === "win32";
  const logPath = path.join(PROJECT_ROOT, ".sandbox_3500.log");
  let logStream: fs.WriteStream | null = null;
  try {
    logStream = fs.createWriteStream(logPath, { flags: "a" });
  } catch {
    logStream = null;
  }
  const hijo = esWin
    ? spawn(process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe", ["/d", "/s", "/c", comando], {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn(comando, {
        cwd,
        detached: true,
        shell: "/bin/bash",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
  if (logStream) {
    hijo.stdout?.pipe(logStream);
    hijo.stderr?.pipe(logStream);
  }
  hijo.on("error", (err: any) => { console.warn(`[CerebroNico] arrancarServidorEnSegundoPlano — no pudo arrancar: ${err?.message || err}`); try { logStream?.write(`\n[CerebroNico] spawn error: ${err?.message || err}\n`); } catch {} }); // v1.60.16 RED DE SEGURIDAD: ENOENT async de spawn no debe tumbar el servidor
  hijo.unref?.();
  console.log(`[CerebroNico] /api/exec — GUARDA-SERVIDOR-EJEC: «${comando}» es un servidor de larga vida; en su lugar (usaEnSuLugar) se arranca en segundo plano (pid=${hijo.pid ?? "?"}).`);
  return {
    ok: true,
    exitCode: 0,
    timedOut: false,
    enSegundoPlano: true,
    pid: hijo.pid ?? null,
    comandoEjecutado: comando,
    stdout: "",
    stderr: "",
    nota:
      "Servidor de larga vida: no se espera a que termine (nunca termina). Arrancado en segundo plano; el preview estará en http://127.0.0.1:" +
      SANDBOX_PORT,
  };
}

app.post("/api/exec", async (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const { command, cwd, timeoutMs = 120000 } = req.body || {};
  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "Falta el campo 'command'." });
  }
  // v8.0.4 — LA CONSOLA ES LA PUERTA MÁS PELIGROSA del proyecto: acepta
  // cualquier cadena y la pasa al shell del sistema. Aquí llegó, tal cual, el
  // TEXTO de una llamada de herramienta (`run_command command="…"`) y se
  // ejecutó. Se desenvuelve si es legible; si no, se rechaza SIN ejecutar nada.
  const norm = normalizarComandoEntrante(command); const juicioCmdQf = interruptorQf.juzgarComando(norm, { origen: "/api/exec", comando: command });
  if (juicioCmdQf.bloqueado) {
    return res.status(400).json({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: juicioCmdQf.motivo,
      error: juicioCmdQf.motivo,
      motivo: juicioCmdQf.motivo,
    });
  }
  if (norm.envuelto) console.warn(`[CerebroNico] /api/exec — ${norm.motivo}`);
  try {
    // v1.6.22 — Si no viene `cwd`, ejecutar en la RAÍZ DEL PROYECTO resuelta, no
    // en la raíz de datos. El sync escribe el árbol anidado (p. ej.
    // C:\Cerebronico\ide\backend) y `npm install` corría en C:\Cerebronico, donde
    // no hay package.json → ENOENT. resolverRaizProyecto() devuelve la base misma
    // cuando no hay proyecto anidado, así que el comportamiento no cambia ahí.
    let workDir = cwd ? resolveSafePath(String(cwd)) : resolverRaizProyecto().raiz;
    // ============================================================
    // v1.6.24 — GUARDA-ENOENT (visto en el log del usuario, 9:39:11 p. m.):
    // «npm install con errores: … enoent … open 'package.json'» — diez
    // segundos de aviso de npm que no dijo NADA accionable. La raíz resuelta
    // puede no tener package.json (sync con carpeta contenedora a medio
    // aplanar, sandbox recién vaciado). Un comando npm en ese sitio solo
    // puede fallar, así que: si el proyecto npm está más abajo, se ejecuta
    // ahí; si no está en ninguna parte, se responde en cristiano sin invocar
    // a npm. El piloto y el agente reciben la misma verdad.
    // ============================================================
    if (!cwd && /^\s*(npm|npx)\b/i.test(norm.comando) && !fs.existsSync(path.join(workDir, "package.json"))) {
      const abajo = buscarPackageJsonBajo(workDir);
      if (abajo) {
        console.log(`[CerebroNico] /api/exec — GUARDA-ENOENT: no hay package.json en «${workDir}»; el comando va a «${abajo}».`);
        workDir = abajo;
      } else {
        return res.json({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr:
            "No hay ningún package.json en el sandbox: no hay proyecto npm que instalar. " +
            "Pulsa Sync para escribir el proyecto en disco o pide al agente que lo genere — la instalación es automática después.",
          error: "Sin package.json en el sandbox",
        });
      }
    }
    // ============================================================
    // v1.6.31 — GUARDA-SERVIDOR-EJEC: un servidor de larga vida NO se
    // ejecuta por esta puerta síncrona. `npm run dev` (Vite) nunca termina,
    // así que aquí siempre moría por timeout (`[exit 1] (timeout) Command
    // failed: npm run dev`) y el preview quedaba muerto. En su lugar
    // (usaEnSuLugar) se arranca en segundo plano y se devuelve al momento.
    // ============================================================
    if (esServidorDeLargaVida(norm.comando)) {
      const usaEnSuLugar = await arrancarServidorEnSegundoPlano(norm.comando, workDir);
      return res.json({ ...usaEnSuLugar, desenvuelto: norm.envuelto, nota: norm.motivo || usaEnSuLugar.nota });
    }
    const result = await runCommand(norm.comando, workDir, Math.min(Number(timeoutMs) || 120000, 300000));
    return res.json({ ...result, comandoEjecutado: norm.comando, desenvuelto: norm.envuelto, nota: norm.motivo || undefined });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

registrarRutasQuirofano(app); registrarAutomejora(app, { autorizada: sandboxAuthorized }); registrarTrabajo(app); /*QF-ENDPOINTS*/

app.post("/api/fs/write", async (req: Request, res: Response) => { /*TREGUA*/
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const { path: filePath, content } = req.body || {};
  if (!filePath || typeof filePath !== "string") return res.status(400).json({ error: "Falta 'path'." });
  if (typeof content !== "string") return res.status(400).json({ error: "Falta 'content'." });

  // ============================================================
  // v2.0 — BLINDAJE EN ESTA PUERTA TAMBIÉN.
  // ------------------------------------------------------------
  // Este endpoint es el que usa el AUTOSYNC del cliente (los bloques de código
  // que el modelo escribe en el chat llegan por aquí). Antes solo estaban
  // protegidas las herramientas write_file/edit_file del agente, así que un
  // archivo truncado por el chat entraba al sandbox, rompía la compilación de
  // Vite y tapaba el previsualizador con el error en pantalla.
  // Ahora se valida igual, y si está roto no se escribe: se devuelve el motivo.
  // ============================================================
  const guard = await guardFileProfundo(filePath, content, PARSER_ESBUILD);
  // v2.1 — ESTE BLOQUEO NUNCA SE ACTIVABA: filtraba por `i.severity === "error"`,
  // un campo que `SyntaxIssue` no tiene, así que la lista salía siempre vacía y
  // el archivo roto se escribía igual. La regla está ahora en
  // `problemasBloqueantes()` —fuera de este endpoint de 6.800 líneas— para que
  // se pueda probar, que es justo lo que aquí no se podía.
  const bloqueantes = problemasBloqueantes(guard);
  if (!guard.ok && bloqueantes.length > 0) {
    console.warn(`[engine] Escritura bloqueada por sintaxis: ${filePath}`);
    return res.status(422).json({
      ok: false,
      blocked: true,
      path: filePath,
      language: guard.language,
      error: `El motor bloqueó la escritura de ${filePath}: la sintaxis está rota y rompería el sandbox.`,
      issues: bloqueantes.slice(0, 6).map((i) => ({ line: i.line, message: i.message })),
      // El consejo sale de `fix`, que es el campo que de verdad trae la solución
      // en imperativo; `hint` no existía. El resumen del guardián queda de respaldo.
      hint: bloqueantes[0].fix || guard.summary || "Corrige el problema o vuelve a generar el archivo completo.",
    });
  }

  // ══ QUIRÓFANO v1 /*QF-FSWRITE*/ — esta puerta la usa el AUTOSYNC del chat
  // (los bloques de código que el modelo escribe llegan por aquí). Ya se validaba
  // la sintaxis; ahora además se juzga la PÉRDIDA: una reescritura mutilada y
  // balanceada pasaba el guardián de sintaxis sin pestañear y rompía la app.
  const juicioFsQf = juzgarEscrituraQf(filePath, content, { force: !!(req.body && req.body.force) });
  if (juicioFsQf.bloqueada) {
    return res.status(422).json({
      ok: false,
      blocked: true,
      quirofano: true,
      path: filePath,
      error: juicioFsQf.mensaje,
      motivos: juicioFsQf.diag?.motivos || [],
      cifras: juicioFsQf.diag?.cifras || null,
    });
  }

  try {
    const abs = resolveSafePath(filePath);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, content, "utf-8"); // TREGUA v1 /*TREGUA*/
    registrarCirugiaQf(filePath, juicioFsQf.original, content, juicioFsQf.diag);
    // Si el archivo es crítico el aviso va al log aunque no bloquee: nadie se entera
    // de lo que no se cuenta.
    if (juicioFsQf.diag && juicioFsQf.diag.veredicto === "revisar") {
      console.log("[CerebroNico] 🩺 QUIRÓFANO aviso en " + filePath + ": " + juicioFsQf.diag.motivos.join(" · "));
    }
    // Si el archivo quedó indexado, refrescamos los símbolos del motor
    if (INDEXABLE_EXT.has(path.extname(filePath).toLowerCase())) {
      setTimeout(() => {
        try {
          reindexProjectSymbols();
        } catch {}
      }, 300);
    }
    return res.json({ ok: true, path: filePath });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 🔧 LIMPIEZA TOTAL DEL SANDBOX: borra TODOS los archivos del directorio .proyectos/
 * (no solo los del editor — también los que quedaron en disco de sesiones anteriores).
 * Esto arregla el bug "el sandbox sigue mostrando la imagen vieja aunque el editor esté vacío".
 */
app.post("/api/fs/clear-all", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    let deletedCount = 0;
    let preservedCount = 0;
    // ============================================================
    // v1.70.6 · RESGUARDO DE OBRA — «NUEVO CHAT» NO PUEDE BORRAR EL TRABAJO
    // ------------------------------------------------------------
    // El cuerpo puede traer {resguardar:true}: antes de borrar, la OBRA del
    // proyecto (código, assets, entregables — todo lo que NO es node_modules,
    // .git ni estado) se copia a <app>/.cerebro-db/rescate-obras/<iso>/.
    // Así, el reinicio automático del sandbox al abrir un chat nuevo (pedido
    // de Mario: «siempre queda algo atascado de otro proyecto») no destruye
    // nada: lo viejo se retira del árbol de trabajo pero queda rescatado.
    // Copia, nunca mueve; si el resguardo falla, el borrado se ABORTA.
    // ============================================================
    const quiereResguardo = (req.body as any)?.resguardar === true;
    let resguardo: { ok: boolean; dir?: string; archivos?: number; error?: string } = { ok: false };
    if (quiereResguardo) {
      const SE_RESGUARDA_CARPETA = new Set<string>(["node_modules", ".git", ...CARPETAS_DE_ESTADO]);
      const listar = (dir: string, base: string, salida: string[]) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = base ? base + "/" + ent.name : ent.name;
          if (ent.isDirectory()) listar(path.join(dir, ent.name), rel, salida);
          else salida.push(rel);
        }
      };
      const snapDir = path.join(
        process.cwd(), ".cerebro-db", "rescate-obras",
        new Date().toISOString().replace(/[:.]/g, "-"),
      );
      try {
        const rels: string[] = [];
        for (const ent of fs.readdirSync(PROJECT_ROOT, { withFileTypes: true })) {
          if (ent.isDirectory()) {
            if (SE_RESGUARDA_CARPETA.has(ent.name)) continue;
            listar(path.join(PROJECT_ROOT, ent.name), ent.name, rels);
          } else rels.push(ent.name);
        }
        fs.mkdirSync(snapDir, { recursive: true });
        let copiados = 0;
        for (const rel of rels) {
          try {
            const destino = path.join(snapDir, ...rel.split("/"));
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            fs.copyFileSync(path.join(PROJECT_ROOT, ...rel.split("/")), destino);
            copiados++;
          } catch { /* archivo desaparecido a mitad: se resguarda lo que hay */ }
        }
        resguardo = { ok: true, dir: snapDir, archivos: copiados };
        console.log(`[CerebroNico] RESGUARDO DE OBRA: ${copiados} archivo(s) → ${snapDir}`);
      } catch (e: any) {
        resguardo = { ok: false, error: String(e?.message || e) };
        console.error(`[CerebroNico] RESGUARDO FALLÓ — clear-all se ABORTA (integridad antes que limpieza): ${resguardo.error}`);
        return res.status(500).json({ ok: false, error: "Resguardo falló, nada fue borrado: " + resguardo.error });
      }
    }
    // ============================================================
    // v1.6.30 — LIMPIAR NO PUEDE LLEVARSE EL CEREBRO
    // ------------------------------------------------------------
    // 🐞 Esta limpieza nació para borrar «los archivos que quedaron en disco de
    // sesiones anteriores» (los que hacen que un árbol viejo choque con el
    // nuevo: «X is not exported by Y»). Y borraba TODO lo que hubiera en la
    // raíz. Con PROJECT_DIR apuntando a la raíz de datos (C:\Cerebronico), el
    // estado del agente VIVE ahí dentro: esta llamada se llevaba .cerebro-db,
    // .cerebronico, MEMORIA.md y skills.md **sin rescate** — el borrado total
    // (nuclear-wipe) sí los salva, ésta no. Ahora preserva exactamente lo mismo
    // que un borrado total: el estado y las dependencias.
    // ============================================================
    const SE_PRESERVA_CARPETA = new Set<string>(["node_modules", ".git", ...CARPETAS_DE_ESTADO]);
    const SE_PRESERVA_ARCHIVO = new Set<string>(["MEMORIA.md", "skills.md"]);
    const deleteRecursive = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // No borrar node_modules (tardaría mucho en reinstalar), .git ni el estado
          if (SE_PRESERVA_CARPETA.has(entry.name)) {
            preservedCount++;
            continue;
          }
          deleteRecursive(fullPath);
          try { fs.rmdirSync(fullPath); } catch {}
        } else {
          if (dir === PROJECT_ROOT && SE_PRESERVA_ARCHIVO.has(entry.name)) {
            preservedCount++;
            continue;
          }
          try {
            fs.unlinkSync(fullPath);
            deletedCount++;
          } catch {}
        }
      }
    };
    deleteRecursive(PROJECT_ROOT);

    // 🔧 Borrar también la caché de Vite dentro de node_modules/.vite
    const viteCache = path.join(PROJECT_ROOT, "node_modules", ".vite");
    if (fs.existsSync(viteCache)) {
      try {
        fs.rmSync(viteCache, { recursive: true, force: true });
      } catch {}
    }

    const sandboxLog = path.join(PROJECT_ROOT, ".sandbox_3500.log");
    if (fs.existsSync(sandboxLog)) {
      try { fs.unlinkSync(sandboxLog); } catch {}
    }

    return res.json({ ok: true, deleted: deletedCount, preserved: preservedCount, root: PROJECT_ROOT, viteCacheCleared: true, resguardo });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 🔧 NUCLEAR WIPE: borra ABSOLUTAMENTE TODO en .proyectos/ incluyendo node_modules.
 * Esto destruye por completo el sandbox y lo deja vacío. La próxima vez que se
 * arranque el sandbox, será como si fuera la primera vez (npm install incluido).
 * Úsalo SOLO cuando clear-all no sea suficiente (ej: apps completas que quedaron pegadas).
 *
 * v1.6.23 — RESCATE v1: el borrador de esta ruta tenía un fallo del tamaño del
 * proyecto: el cerebro del motor (.cerebro-db: kb, espejos, salud, bóveda, leyes
 * aprendidas) y las copias de MEMORIA.md / skills.md viven DENTRO de .proyectos,
 * así que «Borrar todo» del editor (App.tsx → handleDeleteAllFiles) se llevaba
 * puesta toda la memoria aprendida SIN DECIR NADA. Ahora, antes de nuklear:
 *   1. SNAPSHOT no-pisante a <app>/.cerebro-db/rescate/<iso>/ (copia, nunca mueve);
 *   2. FUSIÓN de archivos NUEVOS hacia <app>/.cerebro-db/ — lo que ya existe en
 *      destino NO se pisa (criterio planearFusion);
 *   3. si el estado existía y el rescate arrojó cualquier error, el vaciado se
 *      ABORTA con motivo explícito (integridad antes que destrucción).
 * Reglas puras y probadas en src/engine/estadoRescate.ts; acá solo se ejecutan.
 */
app.post("/api/fs/nuclear-wipe", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  try {
    // ─── RESCATE v1 — primero se muda lo que sirve; después nuklea. ───
    // Las carpetas de estado son las que el PROPIO proyecto declara
    // (CARPETAS_DE_ESTADO en raizDatos.ts: .cerebro-db y .cerebronico). Ahí
    // viven los espejos (espejos.json, espejos-salud.json, leyes-aprendidas,
    // entidades, bóveda, verifier, RAG, proposals) y los espejos
    // personalizados (.cerebronico/espejos, server.ts:4246). El lugar
    // permanente de cada una es <app>/<carpeta> (cwd), no el sandbox.
    const docsSandbox = ["MEMORIA.md", "skills.md"].filter((d) => fs.existsSync(path.join(PROJECT_ROOT, d)));
    const dirsEstado = CARPETAS_DE_ESTADO.filter((c) => fs.existsSync(path.join(PROJECT_ROOT, c)));
    const existeEstado = dirsEstado.length > 0 || docsSandbox.length > 0;
    const rescate = { trasladados: 0, conservados: 0, snapshot: "", docs: [] as string[], errores: [] as string[] };
    let snapshotOk = false;
    const listarRels = (dir: string, base: string, salida: string[]) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? base + "/" + ent.name : ent.name;
        if (ent.isDirectory()) listarRels(path.join(dir, ent.name), rel, salida);
        else salida.push(rel);
      }
    };
    if (existeEstado) {
      const dirSnapshots = path.join(process.cwd(), ".cerebro-db");
      const snapDir = path.join(dirSnapshots, ...rutaRelRescate(new Date().toISOString()).split("/"));
      try {
        fs.mkdirSync(snapDir, { recursive: true });
        for (const carpeta of dirsEstado) {
          fs.cpSync(path.join(PROJECT_ROOT, carpeta), path.join(snapDir, carpeta), {
            recursive: true,
            force: false,
            errorOnExist: false,
          });
        }
        for (const doc of docsSandbox) {
          fs.copyFileSync(path.join(PROJECT_ROOT, doc), path.join(snapDir, doc));
          rescate.docs.push(doc);
        }
        snapshotOk = true;
        rescate.snapshot = snapDir;
      } catch (e: any) {
        rescate.errores.push("snapshot: " + String(e?.message || e));
      }
      // Fusión hacia el lugar permanente: lo nuevo se muda; lo que ya existe
      // se conserva (el snapshot ya guardó el nuestro).
      if (snapshotOk) {
        for (const carpeta of dirsEstado) {
          try {
            const rels: string[] = [];
            listarRels(path.join(PROJECT_ROOT, carpeta), "", rels);
            const destino = path.join(process.cwd(), carpeta);
            const plan = planearFusion(rels, (rel) => fs.existsSync(path.join(destino, ...rel.split("/"))));
            for (const rel of plan.trasladar) {
              try {
                const dst = path.join(destino, ...rel.split("/"));
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                fs.copyFileSync(path.join(PROJECT_ROOT, carpeta, ...rel.split("/")), dst);
                rescate.trasladados++;
              } catch (e: any) {
                rescate.errores.push(`fusión ${carpeta}/${rel}: ${String(e?.message || e)}`);
              }
            }
            rescate.conservados += plan.conservar.length;
          } catch (e: any) {
            rescate.errores.push(`fusión ${carpeta}: ${String(e?.message || e)}`);
          }
        }
      }
    }
    const veredicto = procederBorrado({ existeEstado, snapshotOk, errores: rescate.errores });
    if (!veredicto.seguir) {
      const detalle = resumenRescate(rescate);
      console.error(`[CerebroNico] NUCLEAR WIPE ABORTADO — ${veredicto.motivo} ${detalle}`);
      return res.status(500).json({ ok: false, error: veredicto.motivo, rescate: detalle });
    }
    if (existeEstado) console.log(`[CerebroNico] RESCATE: ${resumenRescate(rescate)}`);

    let deletedCount = 0;
    let deletedDirs = 0;

    const nuclearDelete = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          nuclearDelete(fullPath);
          try {
            fs.rmdirSync(fullPath);
            deletedDirs++;
          } catch {}
        } else {
          try {
            fs.unlinkSync(fullPath);
            deletedCount++;
          } catch {}
        }
      }
    };

    nuclearDelete(PROJECT_ROOT);

    // Recrear el directorio .proyectos vacío
    try {
      fs.mkdirSync(PROJECT_ROOT, { recursive: true });
    } catch {}

    // ─── RESEMBRA v1 — el estado vuelve: espejos, conocimiento, bóveda y
    // verifier tienen que funcionar DESPUÉS del vaciado como si no hubiera
    // pasado nada. Se copia desde el lugar permanente de cada carpeta
    // (process.cwd()/<carpeta>) excluyendo el histórico `rescate/`
    // (planReSembrado): si no, cada wipe resembraría sus propios backups.
    // Nunca se pisa: el sandbox recién creado no debería tener nada, y si
    // algo apareció en el ínterin, manda lo que ya estaba.
    let resembrado = 0;
    const erroresReSiembra: string[] = [];
    for (const carpeta of CARPETAS_DE_ESTADO) {
      const origen = path.join(process.cwd(), carpeta);
      if (!fs.existsSync(origen)) continue;
      try {
        const rels: string[] = [];
        listarRels(origen, "", rels);
        for (const rel of planReSembrado(rels)) {
          try {
            const src = path.join(origen, ...rel.split("/"));
            const dst = path.join(PROJECT_ROOT, carpeta, ...rel.split("/"));
            if (fs.existsSync(dst)) continue;
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
            resembrado++;
          } catch (e: any) {
            erroresReSiembra.push(`${carpeta}/${rel}: ${String(e?.message || e)}`);
          }
        }
      } catch (e: any) {
        erroresReSiembra.push(`${carpeta}: ${String(e?.message || e)}`);
      }
    }

    console.log(
      `[CerebroNico] NUCLEAR WIPE: ${deletedCount} archivos + ${deletedDirs} carpetas borradas. .proyectos está vacío. RESEMBRA: ${resembrado} archivo(s) de estado devueltos${erroresReSiembra.length ? ` · ERRORES: ${erroresReSiembra.join(" · ")}` : ""}.`
    );

    return res.json({
      ok: true,
      deleted: deletedCount,
      deletedDirs,
      root: PROJECT_ROOT,
      // v1.6.23 — el informe del traslado y de la resiembra viaja al log del
      // usuario: ningún resultado de este borrado puede quedar mudo.
      rescate,
      resembrado,
      erroresReSiembra,
      message:
        "Sandbox completamente destruido y recreado vacío. La próxima vez que arranques será como la primera vez (npm install incluido)." +
        (existeEstado ? ` ${resumenRescate(rescate)}` : "") +
        ` 🌱 Estado re-sembrado en el sandbox: ${resembrado} archivo(s) (espejos, conocimiento, bóveda y verifier siguen vivos).` +
        (erroresReSiembra.length ? ` ⚠️ ERRORES de resiembra: ${erroresReSiembra.join(" · ")}` : ""),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * v2.1 — Archivos sin los cuales el sandbox no puede instalar ni arrancar nada.
 * Se usan para que el guardián de sintaxis NO pueda descartarlos en silencio.
 */
function esArchivoCriticoParaArrancar(p: string): boolean {
  return (
    /(^|\/)package\.json$/i.test(p) ||
    /(^|\/)vite\.config\.[cm]?[jt]s$/i.test(p) ||
    /(^|\/)(ts|js)config(\..+)?\.json$/i.test(p) ||
    /(^|\/)index\.html$/i.test(p)
  );
}

app.post("/api/fs/sync", async (req: Request, res: Response) => { /*TREGUA*/
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const { files } = req.body || {};
  if (!Array.isArray(files)) return res.status(400).json({ error: "Falta 'files'." });
  const written: string[] = [];
  // ============================================================
  // v2.0 — 🐞 BLINDAJE EN LA SINCRONIZACIÓN EN BLOQUE
  // ------------------------------------------------------------
  // CASO REAL: un index.html llegó TRUNCADO a disco ("...Tono agresivo con
  // sim") y el sandbox no supo qué hacer con él. El blindaje de sintaxis ya
  // existía, pero este endpoint —el que usa el piloto automático para volcar
  // los 40 archivos de golpe— escribía DIRECTAMENTE con fs.writeFileSync, sin
  // pasar por él. Era la única puerta sin guardia.
  //
  // Criterio: en un volcado masivo NO se aborta todo (dejaría el workspace a
  // medias). Se escribe lo válido, se RECHAZA lo roto y se devuelve el detalle
  // para que la IDE lo muestre en el log con el motivo exacto.
  // ============================================================
  const rejected: Array<{ path: string; issues: string[] }> = [];
  let syncIdx = 0; // TREGUA v1 /*TREGUA*/
  // ══ QUIRÓFANO v1 /*QF-SYNC-ABRE*/ — abrir operación antes de escribir el lote.
  // El modo lo decide el propio lote: si la mayoría de los archivos son NUEVOS
  // (el usuario está subiendo su app entera), no se juzga la pérdida de líneas
  // contra lo que hubiera en el sandbox — eso sería un falso positivo. Si la
  // mayoría YA existían, es una MEJORA y se juzga como cirugía.
  const opSyncQf = abrirOperacionQf("sync del chat (" + files.length + " archivos)");
  const modoQf: ModoEvaluacion = (() => {
    let nuevos = 0;
    let total = 0;
    for (const f of files) {
      if (!f || typeof f.path !== "string" || typeof f.content !== "string") continue;
      total++;
      try {
        if (!fs.existsSync(resolveSafePath(f.path))) nuevos++;
      } catch {}
    }
    return total > 0 && nuevos / total >= 0.7 ? "carga" : "cirugia";
  })();
  console.log("[CerebroNico] 🩺 QUIRÓFANO: lote en modo " + modoQf + " (" + files.length + " archivos)");
  // ============================================================
  // v1.6.31 — ESPEJO-SYNC: el manifiesto de propiedad decide qué retirar.
  // ------------------------------------------------------------
  // Antes de escribir el lote nuevo se calcula qué rutas escribió el sync en
  // un lote anterior y YA NO vienen. Eso es un RESTO: si no se retira, el
  // árbol queda mezclado (el fallo de las 2:10 a. m.). El manifiesto vive en
  // .cn-sync/manifiesto.json, dentro de PROJECT_ROOT.
  // ============================================================
  const rutaManifiesto = path.join(PROJECT_ROOT, MANIFESTO_DIR, MANIFESTO_FILE);
  let manifiesto = crearManifiesto();
  try {
    const previo = parsearManifiesto(fs.readFileSync(rutaManifiesto, "utf-8"));
    if (previo) manifiesto = previo;
  } catch {
    /* primer sync: aún no hay manifiesto */
  }
  const rutasActuales = files
    .filter((f) => f && typeof f.path === "string" && !esRutaIgnorableSync(f.path))
    .map((f) => f.path);
  const retiro = planificarRetiro(manifiesto, rutasActuales);
  try {
    for (const f of files) {
      if (f && typeof f.path === "string" && typeof f.content === "string") {
        const texto = typeof f.isBinary === "boolean" ? !f.isBinary : true;
        if (texto) {
          let guard = await guardFileProfundo(f.path, f.content, PARSER_ESBUILD); if (!guard.ok) { const sanJs = await guardYSanear(f.path, f.content, PARSER_ESBUILD); if (sanJs.sanado) { f.content = sanJs.contenido; guard = sanJs.guard; console.log(`[CerebroNico] SANEADO ${f.path}: .js con sintaxis TS → transpilado a JS corriente y sincronizado (v1.60.18)`); } } // v1.60.18 — el parser profundo manda; el saneado JS←TS es solo fallback cuando ya iba a descartarse
          if (!guard.ok) {
            // ============================================================
            // v2.1 — 🐞 UN ARCHIVO CRÍTICO NUNCA SE DESCARTA EN SILENCIO
            // ------------------------------------------------------------
            // Un proyecto sin package.json / vite.config / index.html es
            // inservible. El error que veía el usuario ("No se encontró
            // package.json en el sandbox tras sincronizar") no explicaba que el
            // archivo SÍ existía y lo había tirado el guardián de sintaxis.
            // Era un fallo mudo: el log decía "38 archivo(s) escrito(s)" y nadie
            // sabía nada de los otros 2.
            // Cuando el guardián duda de un archivo crítico, se escribe IGUAL y
            // se avisa fuerte. Un proyecto incompleto se diagnostica mal; un
            // proyecto con un archivo raro se diagnostica en segundos.
            // ============================================================
            const critico = esArchivoCriticoParaArrancar(f.path);
            rejected.push({
              path: f.path,
              issues: guard.issues.slice(0, 4).map((i: any) => i.message),
            });
            console.log(
              `[CerebroNico] SYNC ${critico ? "CRÍTICO · se escribe igual" : "rechazado"} ${f.path}: ${guard.issues[0]?.message || "sintaxis inválida"}`
            );
            // El motor aprende del fallo real (queda en la base de conocimiento)
            try {
              learnFromToolFailure("fs_sync", { path: f.path }, JSON.stringify({ ok: false, error: guard.issues[0]?.message }));
            } catch {}
            if (!critico) continue;
          }
        }
        const abs = resolveSafePath(f.path);
        const originalQf = fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
        const juicioSyncQf = juzgarEscrituraQf(f.path, f.content, { modo: modoQf });
        if (juicioSyncQf.bloqueada) {
          rejected.push({ path: f.path, issues: juicioSyncQf.diag?.motivos?.slice(0, 3) || ["bloqueado por el Quirófano"] });
          console.log("[CerebroNico] 🩺 QUIRÓFANO: rechazado en el lote " + f.path + " — " + (juicioSyncQf.diag?.motivos?.[0] || ""));
          continue;
        }
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, f.content, "utf-8");
        anotarCirugia(opSyncQf, f.path, originalQf, f.content, juicioSyncQf.diag); /*QF-SYNC-BUCLE*/
        written.push(f.path);
      }
      // TREGUA v1 — cada 8 archivos cedo el lazo: los SSE de los chats (local y
      // cloud) respiran entre tandas. Un volcado síncrono de 251 archivos los
      // silenciaba y el cliente cortaba el stream: «se corta cuando el sandbox trabaja».
      if (cedeElLazo(++syncIdx)) await new Promise<void>((r) => setImmediate(r)); /*TREGUA*/
    }

    // ============================================================
    // v1.6.31 — ESPEJO-SYNC: retirar restos y sellar el manifiesto.
    // ------------------------------------------------------------
    // 1. Se borran las rutas que escribimos antes y ya no llegan.
    // 2. Se registra el lote nuevo (huella por archivo) y se guarda el
    //    manifiesto para que el próximo sync sepa qué es nuestro.
    // ============================================================
    const retirados: string[] = [];
    for (const ruta of retiro.aRetirar) {
      try {
        const abs = resolveSafePath(ruta);
        const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
        if (st && st.isFile()) {
          fs.unlinkSync(abs);
          retirados.push(ruta);
        }
      } catch {
        /* un retiro que falla no debe tumbar el sync */
      }
    }
    const registro = registrarSync(retiro.manana, files);
    try {
      fs.mkdirSync(path.dirname(rutaManifiesto), { recursive: true });
      fs.writeFileSync(rutaManifiesto, serializarManifiesto(registro.manifesto), "utf-8");
    } catch {
      /* el manifiesto es accesorio: si no se puede escribir, el sync sigue */
    }
    if (retirados.length > 0 || registro.escritos > 0) {
      console.log(`[CerebroNico] ${lineaEspejoSync(registro, retirados.length)}`);
    }

    // ============================================================
    // v2.0 — VERIFICACIÓN DE IMPORTS DESPUÉS DE SINCRONIZAR
    // ------------------------------------------------------------
    // Error real en pantalla:
    //   [plugin:vite:import-analysis] Failed to resolve import
    //   "./components/ErrorBoundary" from "src/App.tsx". Does the file exist?
    // El proyecto pedía un componente que nunca se creó: el servidor levantaba,
    // el navegador no encontraba el módulo y el usuario veía un cartel rojo sin
    // saber si el fallo era del sandbox, del motor o del modelo.
    // Ahora el motor lo comprueba solo y, si falta un componente, crea un STUB
    // funcional para que el proyecto compile y el preview se vea.
    // ============================================================
    let missingImports: MissingImport[] = [];
    const stubsCreated: string[] = [];
    try {
      const enDisco: CheckFile[] = [];
      const recorrer = (dir: string, rel: string, prof: number) => {
        // ============================================================
        // v2.1 — 🐞 EL VERIFICADOR ESTABA CIEGO A PARTIR DEL 5º NIVEL.
        // ------------------------------------------------------------
        // Antes decía `prof > 4`, y con el proyecto dentro de su carpeta
        // contenedora («CerebroNico-IDE-v2.1/ide/backend/src/…») los archivos de
        // src/ ya caían en el nivel 5: NO LOS LEÍA. Consecuencia, en el log real
        // del usuario: "Imports sin resolver: 63" sobre archivos que SÍ existían,
        // y "stubs creados: 60" — 60 archivos basura escritos dentro del proyecto
        // en cada sincronización.
        // El recorrido ya no depende de la profundidad del ZIP: se hace desde la
        // raíz REAL del proyecto y con margen de sobra.
        // ============================================================
        if (prof > 12 || enDisco.length > 1500) return;
        let entradas: string[] = [];
        try {
          entradas = fs.readdirSync(dir);
        } catch {
          return;
        }
        for (const e of entradas) {
          if (["node_modules", ".git", "dist", ".vite", "__pycache__", "venv"].includes(e)) continue;
          const abs = path.join(dir, e);
          const relPath = rel ? `${rel}/${e}` : e;
          let st: fs.Stats;
          try {
            st = fs.statSync(abs);
          } catch {
            continue;
          }
          if (st.isDirectory()) recorrer(abs, relPath, prof + 1);
          // v2.1 — el escaneo debe incluir TODO lo que el verificador considera
          // importable (EXTENSIONES de importChecker). Faltaban .css/.scss/.json,
          // así que un `import "./index.css"` —que sí existe— se reportaba como
          // import sin resolver en cada sync. Falso positivo puro.
          else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss)$/i.test(e) && st.size < 400000) {
            try {
              enDisco.push({ path: relPath, content: fs.readFileSync(abs, "utf-8") });
            } catch {}
          }
        }
      };
      // Se recorre la raíz REAL del proyecto, pero las rutas se guardan relativas
      // a PROJECT_ROOT (como las del sync), para que findMissingImports resuelva
      // igual y los stubs caigan en el sitio correcto.
      const raizSync = resolverRaizProyecto().raiz;
      const prefijoSync = path.relative(PROJECT_ROOT, raizSync).split(path.sep).join("/");
      recorrer(raizSync, prefijoSync, 0);
      missingImports = findMissingImports(enDisco);
      if (missingImports.length > 0) {
        for (const s of buildStubs(missingImports)) {
          try {
            const abs = resolveSafePath(s.path);
            if (fs.existsSync(abs)) continue;
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, s.content, "utf-8");
            stubsCreated.push(s.path);
          } catch {}
        }
        console.log(
          `[CerebroNico] Imports sin resolver: ${missingImports.length} · stubs creados: ${stubsCreated.length} · ${describeMissingImports(missingImports)}`
        );
        try {
          learnFromToolFailure("fs_sync", { etapa: "imports" }, JSON.stringify({ ok: false, error: describeMissingImports(missingImports) }));
        } catch {}
      }
    } catch {
      /* la verificación nunca debe romper el sync */
    }

    // ══ QUIRÓFANO v1 /*QF-SYNC-CIERRA*/ — el lote ya está completo: ahora sí se
    // corre el juicio de verdad (puertas sobre el disco) y se revierte si algo
    // quedó roto. Es el momento correcto: cerrar antes revertiría a medias.
    const cierreSyncQf = await cerrarTurnoQf("sync del chat");

    return res.json({
      ok: rejected.length === 0 && missingImports.length === 0,
      written: written.length,
      // v1.43.0 lote 2 — DÓNDE se escribió, sin ambigüedad. El usuario no sabía
      // si el sync iba a C:\Cerebronico (PROJECT_DIR) o a .proyectos/, y un
      // «0 archivos» sin saber el destino es imposible de diagnosticar. `root`
      // es la raíz de datos; `raiz` es la del proyecto real (puede ser anidada).
      root: PROJECT_ROOT,
      raiz: (() => { try { return resolverRaizProyecto().raiz; } catch { return PROJECT_ROOT; } })(),
      rejected: rejected.length,
      rejectedFiles: rejected,
      missingImports: missingImports.length,
      missingImportDetails: missingImports.slice(0, 8),
      stubsCreated,
      retirados,
      quirofano: cierreSyncQf ? { ok: cierreSyncQf.ok, revertido: cierreSyncQf.revertido, informe: cierreSyncQf.informe } : null,
      message:
        rejected.length > 0
          ? `${written.length} archivo(s) escrito(s); ${rejected.length} RECHAZADO(S) por sintaxis rota.`
          : missingImports.length > 0
            ? `${written.length} archivo(s) escrito(s); ${missingImports.length} import(s) sin resolver${stubsCreated.length ? `, ${stubsCreated.length} stub(s) creado(s)` : ""}.`
            : `${written.length} archivo(s) escrito(s).`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, written, rejectedFiles: rejected });
  }
});

app.get("/api/fs/read", async (req: Request, res: Response) => { /*TREGUA*/
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "Falta 'path'." });
  try {
    const abs = resolveSafePath(filePath);
    const content = await fs.promises.readFile(abs, "utf-8"); // TREGUA v1 /*TREGUA*/
    if (!puedeContestar(res)) return; // v1.0.33 · el plazo ya contestó 504: no se reescribe el socket
    return res.json({ path: filePath, content });
  } catch (err: any) {
    if (!puedeContestar(res)) return; // v1.0.33 · idem en el error
    return res.status(404).json({ error: err.message });
  }
});

app.get("/api/fs/tree", (req: Request, res: Response) => {
  if (!sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
  const files: string[] = [];
  const walk = (dir: string, base: string) => {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      const rel = base ? `${base}/${name}` : name;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        files.push(rel);
      }
    }
  };
  walk(PROJECT_ROOT, "");
  return res.json({ root: PROJECT_ROOT, files });
});


// ============================================================
// StreamContext vive ahora en `./server/streamContext` (v1.14.0): allí se
// acumula el texto del modelo y, al cerrar el turno, se pasa por el revisor de
// certeza sin hacer crecer este monolito (trinquete de la Fase 2).
// ============================================================

/**
 * Pipe a generic OpenAI-compatible streaming response (used by both
 * OpenRouter and Custom providers) into the StreamContext.
 *
 * Handles: SSE buffering, [DONE] sentinel, error/abort propagation.
 * Returns true if at least one chunk was emitted, false otherwise.
 *
 * Note: `response` is the global fetch Response, not Express's Response.
 */
async function pipeOpenAICompatibleStream(
  response: any,
  ctx: StreamContext
): Promise<boolean> {
  if (!response || !response.ok || !response.body) return false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sseBuf = "";
  let emittedAny = false;

  try {
    while (true) {
      if (ctx.isAborted()) break;
      const { done, value } = await reader.read();
      if (done) break;

      sseBuf += decoder.decode(value, { stream: true });
      const lines = sseBuf.split("\n");
      sseBuf = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:") || trimmed.includes("[DONE]")) continue;
        try {
          const data = JSON.parse(trimmed.slice(5).trim());
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            ctx.sendChunk(content);
            emittedAny = true;
          }
        } catch {}
      }
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }

  return emittedAny;
}

/**
 * ============================================================
 * v1.56.0 — RELEVO LOCAL AUTOMÁTICO ("seguro contra cortes")
 * ------------------------------------------------------------
 * 🐞 Caso real reproducido en sesión: el usuario trabaja con un modelo en la
 * NUBE (Gemini / Z.ai). Cuando la nube se cae a mitad de turno —`fetch failed`,
 * timeout del primer token, 429 de cuota diaria, o un parpadeo del servicio— el
 * flujo terminaba en un `ctx.sendError` y el usuario quedaba EN BLANCO, viendo
 * "problemas de conexión" una y otra vez.
 *
 * Pero la máquina del usuario tiene decenas de modelos LOCALES de Ollama vivos
 * en :11434, que NO dependen de internet ni de cuota. Este relevo los usa como
 * red de seguridad: si la nube falla, en vez de rendirse se TERMINA el turno con
 * un modelo local (con herramientas si el modelo las admite, para que pueda
 * tocar el sandbox de verdad). Es transparente: avisa en el chat de que cambió
 * de motor, no finge que respondió la nube.
 *
 * Devuelve true si el relevo emitió texto y ya cerró el stream (`done`);
 * false si no había relevo posible (Ollama apagado, sin modelos, abortado…),
 * en cuyo caso el llamador manda su error de siempre.
 * Opt-out: CN_RELEVO_LOCAL=0.
 * ============================================================
 */
async function relevoLocalTrasFalloNube(opts: {
  ctx: StreamContext;
  proveedorFallido: string;
  motivo: string;
  systemInstruction: string;
  history: Array<{ role: string; content: string }>;
  userPrompt: string;
  temperature: number;
  pcMode: boolean;
  ollamaUrl: string;
}): Promise<boolean> {
  if (String(process.env.CN_RELEVO_LOCAL ?? "").trim() === "0") return false;
  const { ctx } = opts;
  if (ctx.isAborted()) return false;
  const targetUrl = (opts.ollamaUrl || OLLAMA_DEFAULT).replace(/\/$/, "");

  // 1) ¿Hay Ollama vivo y con modelos instalados? (sondeo corto, no bloqueante).
  let modelos: string[] = [];
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500);
    const r = await fetch(`${targetUrl}/api/tags`, { method: "GET", signal: ac.signal });
    clearTimeout(t);
    if (r.ok) {
      const j: any = await r.json();
      modelos = (j?.models || []).map((m: any) => m?.name).filter(Boolean);
    }
  } catch { /* Ollama apagado: no hay relevo */ }
  if (modelos.length === 0) return false;

  // 2) Elegir el modelo local CONSCIENTE del equipo. Medido con Mario (Dell
  //    Latitude E6430, 8 GB RAM, sin GPU dedicada): un modelo de 7B+ hace que
  //    el sistema se vaya a memoria de disco (swap) y SE CUELGUE — justo lo
  //    que le pasaba «hasta con un 1b» cuando el relevo elegía uno grande. Su
  //    propia terminal responde en segundos con un 1B. Por eso: con poca RAM
  //    se prefiere un modelo LIGERO (1B-4B); con RAM holgada, el más capaz.
  const bajosRecursos =
    String(process.env.CN_RELEVO_MODO_LIVIANO ?? "").trim() === "1" ||
    (String(process.env.CN_RELEVO_MODO_LIVIANO ?? "").trim() !== "0" && RAM_GB <= 8);
  const paramsB = (m: string): number => {
    const nombre = m.toLowerCase();
    const mb = nombre.match(/(\d+(?:\.\d+)?)\s*b(?![a-z])/);
    if (mb) return parseFloat(mb[1]);
    const mm = nombre.match(/(\d+)\s*m(?![a-z])/);
    if (mm) return parseFloat(mm[1]) / 1000;
    return NaN;
  };
  const esDiminuto = (m: string) => /(^|[^0-9.])(0\.5b|0\.6b|135m|270m|360m)/i.test(m);
  let elegido: string | null = null;
  if (bajosRecursos) {
    // Ligeros primero (1B-4B): es lo máximo que una máquina de 8 GB mueve sin
    // irse a swap. Un 7B+ aquí NO se ofrece: es la causa directa del cuelgue.
    const ligeros = modelos
      .map((m) => ({ m, b: paramsB(m) }))
      .filter((x) => !esDiminuto(x.m) && !Number.isNaN(x.b) && x.b <= 4)
      .sort((a, b) => a.b - b.b);
    if (ligeros.length > 0) elegido = ligeros[0].m;
    // Si TODO lo instalado es grande, se usa el MÁS pequeño disponible (incluso
    // uno diminuto): mejor una respuesta pobre que colgar la máquina entera.
    if (!elegido) {
      const porTamano = modelos
        .map((m) => ({ m, b: Number.isNaN(paramsB(m)) ? 999 : paramsB(m) }))
        .sort((a, b) => a.b - b.b);
      elegido = porTamano.length ? porTamano[0].m : null;
    }
  } else {
    const preferidos = [/qwen2\.5-coder/i, /qwen2\.5/i, /qwen3/i, /llama-?3/i, /mistral/i, /gemma[3-9]/i, /phi/i];
    for (const pat of preferidos) {
      const hit = modelos.find((m) => pat.test(m) && !esDiminuto(m));
      if (hit) { elegido = hit; break; }
    }
    if (!elegido) elegido = modelos.find((m) => !esDiminuto(m)) || modelos[0];
  }
  if (!elegido) return false;

  // 3) Transparencia total: avisar del relevo (no se finge que respondió la nube).
  ctx.sendChunk(
    `\n\n> 🔌 **${opts.proveedorFallido} no respondió** (${String(opts.motivo).slice(0, 120)}).\n` +
    `> Sigo con el modelo LOCAL **${elegido}** para no dejarte en blanco: no depende de internet ni de cuota.\n\n`
  );

  // 4) Construir el payload. En modo liviano se recorta MÁS el contexto y se
  //    usa un system CORTO: un prompt gigante en un modelo pequeño sobre CPU
  //    son minutos de espera y memoria que se va a swap (eso colgaba la PC).
  //    La terminal de Mario responde en segundos justamente porque no le mete
  //    un contexto enorme: aquí imitamos esa ligereza.
  const profile = getProfile(elegido);
  const sysLiviano =
    "Eres el asistente de CerebroNico. Respondé de forma clara, breve y útil, en el mismo idioma del usuario.";
  const presupuestoChars = bajosRecursos ? Math.min(profile.contextCharBudget, 2500) : profile.contextCharBudget;
  const turnosHist = bajosRecursos ? Math.min(profile.historyTurns, 2) : profile.historyTurns;
  const payload: any[] = [];
  const systemUsado = bajosRecursos ? sysLiviano : opts.systemInstruction;
  if (systemUsado) payload.push({ role: "system", content: systemUsado });
  const trimmed = trimMessagesToBudget(
    opts.history.filter((h) => h?.role && h?.content).map((h) => ({ role: String(h.role), content: String(h.content) })),
    presupuestoChars,
    turnosHist
  );
  for (const h of trimmed.messages) payload.push({ role: h.role, content: h.content });
  payload.push({ role: "user", content: opts.userPrompt });

  const temp = typeof opts.temperature === "number" ? opts.temperature : profile.temperature;
  // En modo liviano NO se usan herramientas: el bucle de agente con el esquema
  // de herramientas infla el contexto y es, junto al modelo grande, lo que
  // colgaba la máquina. Sin tools, el 1B responde como en la terminal.
  const activeTools = bajosRecursos ? [] : getToolsForModel(elegido, opts.pcMode);

  // Tope de tiempo del relevo: si el modelo local no entrega nada en este
  // plazo, se CORTA y se avisa — la interfaz NUNCA queda colgada. Ajustable con
  // CN_RELEVO_TIMEOUT_MS (ms); por defecto 90 s (mínimo 5 s).
  const topeMs = (() => {
    const raw = parseInt(String(process.env.CN_RELEVO_TIMEOUT_MS ?? "").trim(), 10);
    return Number.isFinite(raw) && raw >= 5000 ? raw : 90000;
  })();
  let relevoVencido = false;
  const abortadoORelevo = () => ctx.isAborted() || relevoVencido;
  const elegidoFinal: string = elegido;

  // 5) Ejecutar CON TOPE DE TIEMPO (Promise.race): la generación va por un lado
  //    y un reloj por el otro; gana el que llega primero.
  try {
    const ejecutar = (async (): Promise<string | null> => {
      if (activeTools.length > 0) {
        const agentText = await runOllamaAgentLoop(
          targetUrl, elegidoFinal, payload, temp,
          abortadoORelevo,
          (ev: any) => { try { ctx.sendTaskEvent(ev); } catch { /* turno cerrado */ } },
          activeTools
        );
        if (agentText && agentText.trim()) return agentText;
      }
      // Sin herramientas (o el bucle no devolvió texto): respuesta directa.
      const resp = await callOllamaNonStreaming(targetUrl, elegidoFinal, payload, temp, abortadoORelevo, []);
      return String(resp?.message?.content ?? resp?.response ?? "") || null;
    })();

    const reloj = new Promise<"__TOPE__">((resolve) => { setTimeout(() => resolve("__TOPE__"), topeMs); });
    const resultado = await Promise.race([ejecutar, reloj]);

    if (resultado === "__TOPE__") {
      relevoVencido = true; // corta los bucles internos en su próxima comprobación
      const seg = Math.round(topeMs / 1000);
      ctx.sendChunk(
        `\n\n> ⏱️ El modelo local **${elegidoFinal}** no respondió en ${seg}s y corté la espera para NO dejar la app colgada.\n` +
        `> En equipos con poca memoria conviene un modelo pequeño (1B-3B). Probá eligiendo uno más chico, ` +
        `o reintentá con Gemini/Z.ai cuando tengas conexión.\n`
      );
      ctx.sendDone(elegidoFinal);
      return true;
    }

    const texto = String(resultado ?? "");
    if (texto.trim()) {
      const words = texto.split(" ");
      for (let i = 0; i < words.length; i += 3) {
        if (ctx.isAborted()) break;
        ctx.sendChunk(words.slice(i, i + 3).join(" ") + " ");
        await sleepMs(15);
      }
      ctx.sendDone(elegidoFinal);
      return true;
    }
  } catch (e: any) {
    console.warn(`[relevo-local] falló con ${elegidoFinal}:`, e?.message || e);
  }
  return false;
}

/**
 * AI Streaming Proxy Endpoint
 * Supports: Ollama (11434), Gemini (Google GenAI), OpenRouter, and Custom Server
 */
app.post("/api/ai/stream", async (req: Request, res: Response) => {
  const {
    prompt,
    systemInstruction: systemInstructionRecibida,
    hiddenSystemFiles = [],
    openFiles = [],
    provider: providerSolicitado = "ollama",
    model = "stablelm2:latest",
    temperature = 0.5,
    ollamaUrl = OLLAMA_DEFAULT,
    openrouterApiKey = process.env.OPENROUTER_API_KEY,
    geminiApiKey,
    // v1.56.2 — se recibe en una variable aparte: el proveedor EFECTIVO puede
    // corregirse abajo si el modelo elegido es claramente local (ver guard).
    customServerUrl,
    customApiKey,
    openaiApiKey = process.env.OPENAI_API_KEY,
    // v1.1 — Dedicated cloud providers:
    zaiApiKey = process.env.ZAI_API_KEY,
    groqApiKey = process.env.GROQ_API_KEY,
    cerebrasApiKey = process.env.CEREBRAS_API_KEY,
    togetherApiKey = process.env.TOGETHER_API_KEY,
    mistralApiKey = process.env.MISTRAL_API_KEY,
    deepseekApiKey = process.env.DEEPSEEK_API_KEY,
    fireworksApiKey = process.env.FIREWORKS_API_KEY,
    attachments = [],
    history = [],
    pcMode = false,
    geminiThinkingLevel,
  } = req.body; const systemInstruction = modoServidor() ? `${systemInstructionRecibida || ""}\nEDICIÓN SERVIDOR: la obra vive en /workspace. Usa list_files, read_file, write_file y edit_file con rutas relativas a /workspace. NO uses pc_* ni crees otra carpeta oculta para la obra. Escribe archivos reales, relee para verificar y sólo entonces informa. El editor obtiene esos mismos archivos del disco. No declares una vista previa disponible sin verificarla.` : systemInstructionRecibida;

  // ============================================================
  // v1.56.2 — EL MODELO MANDA SOBRE EL PROVEEDOR "PEGADO" (bug real de Mario)
  // ------------------------------------------------------------
  // Log de la sesión: el usuario cambió el modelo a uno LOCAL de Ollama
  // ("llama3.2:1b") en el 2.º mensaje, pero el proveedor seguía en "gemini"
  // del 1.er mensaje (el selector de modelo NO cambiaba el motor). El turno se
  // iba igual a Gemini, agotaba la cuota diaria gratis (429) y moría en el
  // watchdog con un cartel que CULPABA a "llama3.2:1b" — un modelo que ni se
  // llegó a invocar. Corrección: si el id del modelo es inequívocamente de
  // Ollama (lleva etiqueta "nombre:tag", sin "/" ni URL) y el proveedor
  // recibido es de NUBE, el proveedor EFECTIVO pasa a "ollama": el modelo que
  // el usuario eligió manda sobre un proveedor heredado de un turno anterior.
  // No se toca si el proveedor ya es local ("ollama") ni "custom" (proxy local).
  const PROVEEDORES_NUBE = new Set([
    "gemini", "zai", "openai", "groq", "openrouter",
    "deepseek", "mistral", "together", "cerebras", "fireworks",
  ]);
  let provider = providerSolicitado;
  if (
    pareceModeloOllamaPlan(model) &&
    !model.toLowerCase().startsWith("gemini") &&
    PROVEEDORES_NUBE.has(provider)
  ) {
    // v1.57.21 — la corrección sigue siendo obligatoria; el aviso se deduplica
    // por par (modelo, motor): siete turnos, una sola línea de log.
    avisarProveedorCorregido(model, provider);
    provider = "ollama";
  }

  // v1.0.16 · FAILOVER DE NUBE GRATIS (lógica en server/respaldoNube.resolverFailoverNube): si el proveedor elegido no tiene clave o quedó ENFRIADO por un 429/5xx/timeout reciente, se rota al primero del pool gratuito con clave y sin enfriar, usando su modelo por defecto (modeloBaseTurno="" → resolverModeloEfectivo cae en MODELO_POR_DEFECTO_PROVEEDOR). No toca Ollama/Gemini/OpenAI/Custom. El enfriamiento se marca más abajo.
  let modeloBaseTurno = String(model || "");
  if (PROVEEDORES_RESPALDO_NUBE.has(provider)) {
    const clavesNube: Partial<Record<ProveedorNube, boolean>> = { zai: !!zaiApiKey, groq: !!groqApiKey, openrouter: !!openrouterApiKey, cerebras: !!cerebrasApiKey, together: !!togetherApiKey, deepseek: !!deepseekApiKey, mistral: !!mistralApiKey, fireworks: !!fireworksApiKey };
    const dec = resolverFailoverNube(provider as ProveedorNube, clavesNube, ENFRIADOS_NUBE);
    if (dec.cambio) {
      console.warn(`[CerebroNico] ☁️ Failover de nube: «${provider}» ${dec.motivo} → se usa «${dec.provider}» con su modelo por defecto.`);
      provider = dec.provider;
      modeloBaseTurno = ""; // el modelo pedido era del proveedor caído → default del nuevo
    }
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // 🔧 REFACTORIZACIÓN: Toda la lógica de abort/watchdog/SSE está encapsulada
  // en StreamContext. Esto evita los 3 bugs originales (req.on close, duplicado,
  // timeout no limpio) por construcción.
  const ctx = new StreamContext(res);

  // v1.48.0 — Conecta el emisor module-level con ESTE turno vivo, para que
  // `abrir_previsualizador` (y futuros eventos) lleguen al frontend sin importar
  // qué proveedor condujo la llamada. Se limpia en el finally de este turno.
  fijarEmisorEventoTurno((ev: any) => {
    try { ctx.sendTaskEvent(ev); } catch { /* turno ya cerrado */ }
  });

  try {
    // 1. Process attachments cleanly
    const base64Images: string[] = [];
    let textAttachmentsContext = "";

    // ============================================================
    // v1.47.0 — 🖼️ LAS IMÁGENES SUBIDAS AHORA SE GUARDAN EN EL PROYECTO
    // ------------------------------------------------------------
    // CAUSA RAÍZ del «no puedes poner una foto en una página web / recuadro
    // blanco»: las imágenes que sube el usuario llegaban al modelo como VISIÓN
    // (base64), pero NUNCA se escribían a disco. El modelo generaba HTML con
    // `<img src="assets/foo.png">` y ese archivo no existía → recuadro blanco.
    // `write_file` sólo escribe TEXTO, así que un modelo no podía materializar
    // un PNG aunque quisiera.
    //
    // Solución (faculta de verdad, no depende de que el modelo acierte): al
    // entrar imágenes se guardan en `assets/subidas/<nombre>` DENTRO del
    // proyecto del sandbox, y se le dice al modelo la ruta EXACTA que debe usar.
    // Como el archivo ya existe en disco, el <img> renderiza de verdad.
    // ============================================================
    const imagenesGuardadas: string[] = [];
    const sanearNombreImg = (nombre: string, mime: string): string => {
      const extDeMime = (mime.split("/")[1] || "").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();
      let base = String(nombre || "imagen").trim().replace(/\\/g, "/").split("/").pop() || "imagen";
      base = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 80) || "imagen";
      if (!/\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(base)) {
        base += `.${extDeMime || "png"}`;
      }
      return base;
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (att.isImage && att.base64Data) {
          const pureBase64 = att.base64Data.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
          base64Images.push(pureBase64);
          // — Materializar la imagen en el proyecto para que el HTML la encuentre.
          try {
            const mime = (att.base64Data.match(/^data:(image\/[a-zA-Z0-9+]+);base64,/)?.[1]) || att.type || "image/png";
            let nombre = sanearNombreImg(att.name || "", mime);
            let relativa = `assets/subidas/${nombre}`;
            let abs = resolveSafePath(relativa);
            // Evitar pisar una imagen distinta con el mismo nombre.
            if (fs.existsSync(abs)) {
              const punto = nombre.lastIndexOf(".");
              const raiz = punto > 0 ? nombre.slice(0, punto) : nombre;
              const ext = punto > 0 ? nombre.slice(punto) : "";
              nombre = `${raiz}-${Date.now().toString(36)}${ext}`;
              relativa = `assets/subidas/${nombre}`;
              abs = resolveSafePath(relativa);
            }
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, Buffer.from(pureBase64, "base64"));
            imagenesGuardadas.push(relativa);
          } catch (e: any) {
            console.log(`[CerebroNico] No se pudo guardar la imagen subida "${att?.name}": ${e?.message || e}`);
          }
        } else if (att.extractedText) {
          textAttachmentsContext += `\n\n${att.extractedText.slice(0, 15000)}`;
        }
      }
    }

    // v1.70.6 · EL CLIENTE NECESITA SABER QUÉ IMÁGENES QUEDARON REALES: las rutas
    // materializadas viajan al frontend para (a) reparar referencias <img> soñadas
    // antes de sincronizar (utils/repararImagenes) y (b) informar en el log.
    if (imagenesGuardadas.length > 0) {
      try { ctx.sendTaskEvent({ type: "imagenes-subidas", paths: [...imagenesGuardadas] } as any); } catch { /* el panel es opcional */ }
    }

    // ============================================================
    // v1.58.0 — 🎙️ ENTRADA DE AUDIO (wav/mp3/m4a/ogg/flac…)
    // ------------------------------------------------------------
    // Hasta aquí el motor SOLO escuchaba imágenes (visión). Un audio adjunto
    // caía por el camino binario y se «extraía» como texto basura: nunca se
    // enviaba como MEDIA al modelo. Ahora se recolectan los adjuntos marcados
    // con isAudio (ver attachmentProcessor + types) con su base64 puro y su
    // MIME, para empujarlos como `inlineData` de audio hacia los modelos con
    // oído real. HOY eso es Gemini nativo (2.5/2.0/1.5 flash·pro) por el SDK
    // @google/genai; el resto de proveedores NO procesa audio y recibe el aviso
    // honesto que ya trae el adjunto en extractedText.
    //
    // Límite: Gemini acepta audio inline hasta ~20 MB por petición (varios
    // archivos suman). Por encima de ese techo habría que usar la Files API,
    // que este motor aún no implementa: se avisa y se omite el que no cabe.
    // ============================================================
    const base64Audios: { data: string; mime: string; name: string }[] = [];
    const TECHO_AUDIO_INLINE = 18 * 1024 * 1024; // ~18 MB en base64, margen bajo el techo de Gemini
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (att.isAudio && att.base64Data) {
          // El data URL de audio puede traer cualquier subtipo: audio/wav,
          // audio/mp3, audio/mp4, audio/ogg… Se extrae MIME + payload puro.
          const m = att.base64Data.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
          const mime = (m?.[1]) || (att.type && att.type.startsWith("audio/") ? att.type : "audio/wav");
          const pureBase64 = m ? m[2] : att.base64Data.replace(/^data:[^;]+;base64,/, "");
          if (pureBase64.length > TECHO_AUDIO_INLINE) {
            textAttachmentsContext += `\n\n[Audio «${att.name}» omitido: supera el techo de audio en línea (~18 MB). Recorta el clip o súbelo más corto.]`;
            continue;
          }
          base64Audios.push({ data: pureBase64, mime, name: att.name || "audio" });
        }
      }
    }

    // Nota fuerte para el modelo: las imágenes YA están en disco; usar ESAS rutas.
    let imagenesSubidasContext = "";
    if (imagenesGuardadas.length > 0) {
      imagenesSubidasContext =
        `\n\n[IMÁGENES SUBIDAS — YA GUARDADAS EN EL PROYECTO]\n` +
        `El usuario subió ${imagenesGuardadas.length} imagen(es). YA están escritas en disco dentro del proyecto en estas rutas EXACTAS:\n` +
        imagenesGuardadas.map((r) => `  - ${r}`).join("\n") +
        `\nPara mostrarlas en una página web usa EXACTAMENTE esa ruta relativa en el atributo src, por ejemplo: <img src="${imagenesGuardadas[0]}" alt="...">.\n` +
        `NO inventes otras rutas, NO uses base64 en el HTML, NO las copies a otra carpeta: ya existen ahí.\n` +
        `NOTA: el servidor de vista previa (:3500) busca automáticamente archivos bajo «assets/» en la raíz del proyecto si no los encuentra en la carpeta del sitio, así que la ruta relativa «${imagenesGuardadas[0]}» funciona tanto si el HTML está en la raíz como en una subcarpeta (.creador/*/).`;
    }

    // 2. Format Open Files Context (if any files are currently open in editor)
    // ============================================================
    // v1.6.20 — ✂️ TOPE A LOS ARCHIVOS ABIERTOS. AQUÍ ESTABA EL MINUTO.
    // ------------------------------------------------------------
    // Esto volcaba el `content` COMPLETO de cada pestaña abierta, sin límite
    // alguno, en TODAS las peticiones. Con el editor cargado y el historial
    // entero encima, el prompt se hacía enorme.
    //
    // La medición que lo delató: un modelo CLOUD rápido (Gemini) tardaba 51 s
    // en contestar 15 tokens, y uno LOCAL de 270M tardaba 59 s en no contestar
    // nada. Dos motores incomparables con la misma latencia. Ese empate solo lo
    // explica el tamaño del prompt, no la capacidad del motor: los dos estaban
    // pagando el mismo peaje de lectura antes de escribir la primera palabra.
    //
    // Y la propia base de conocimiento de la app ya lo decía por escrito, en el
    // bloque que se le manda al modelo en cada turno: «Reescribir un archivo
    // entero cuesta miles de tokens y es la causa principal de lentitud con
    // modelos locales».
    //
    // Ahora hay tope por archivo y tope total, y cuando se recorta SE DICE, para
    // que el modelo sepa que le falta contexto y lo pida, en vez de rellenar el
    // hueco inventando.
    // ============================================================
    const MAX_CHARS_POR_ARCHIVO = 3_000;
    const MAX_CHARS_ARCHIVOS = 9_000;
    let openFilesContext = "";
    if (Array.isArray(openFiles) && openFiles.length > 0) {
      let acumulado = 0;
      const trozos: string[] = [];
      for (const f of openFiles) {
        if (acumulado >= MAX_CHARS_ARCHIVOS) break;
        const contenido = String(f.content || "");
        const margen = Math.min(MAX_CHARS_POR_ARCHIVO, MAX_CHARS_ARCHIVOS - acumulado);
        const recortado = contenido.length > margen;
        trozos.push(
          `\`\`\`${f.language || "text"} file="${f.path || f.name}"\n` +
            `${recortado ? contenido.slice(0, margen) : contenido}\n` +
            (recortado
              ? `[… recortado: el archivo tiene ${contenido.length} caracteres y solo se enviaron los primeros ${margen}. Pide la parte que necesites.]\n`
              : "") +
            `\`\`\``
        );
        acumulado += margen;
      }
      const omitidos = openFiles.length - trozos.length;
      if (omitidos > 0) {
        trozos.push(`[… ${omitidos} archivo(s) abiertos más, omitidos por presupuesto de contexto]`);
      }
      openFilesContext = "\n\n### [ARCHIVOS ABIERTOS EN EL EDITOR ACTIVO]:\n" + trozos.join("\n\n");
    }

    // ============================================================
    // v1.23.0 · ✂️ RECORTE DEL PROMPT ENTRANTE — el caso «se tranca con un log»
    // ------------------------------------------------------------
    // Medido: el tope de v1.6.20 recortaba el HISTORIAL (24 mensajes) pero el
    // mensaje entrante viajaba CRUDO. Un log de 400 líneas (≈40 KB) entraba
    // entero a un `num_ctx` de 8192: Ollama expulsaba el system prompt, la
    // respuesta salía vacía y el turno moría sin aviso («le doy un log y no
    // contesta»). `trimIncomingPrompt` conserva el inicio (la pregunta real del
    // usuario) y el final (el error suele estar ahí) y nombra lo omitido.
    // El presupuesto es el 45 % del budget del perfil: el 55 % restante es del
    // system, el historial y las herramientas. Se avisa por consola, nunca en
    // silencio.
    // ============================================================
    const perfilEntrante = getProfile(model);
    const presupuestoEntrante = Math.max(3000, Math.floor(perfilEntrante.contextCharBudget * 0.45));
    const recorteEntrante = trimIncomingPrompt(String(prompt || "Analizar requerimiento"), presupuestoEntrante);
    if (recorteEntrante.recortado) {
      console.log(
        `[CerebroNico] ✂️ Prompt entrante recortado para "${model}": ` +
        `${String(prompt || "").length} → ${recorteEntrante.texto.length} caracteres ` +
        `(omitidos del centro: ${recorteEntrante.charsOmitidos}; presupuesto: ${presupuestoEntrante}). ` +
        `Se conservan inicio y final; si el modelo necesita el medio, que pida la parte concreta.`
      );
    }
    // v1.0.12 · HILANA (src/engine/hilana.ts): si el turno anterior murió a
    // mitad por un corte de nube, la foto se inyecta UNA vez: continuar desde
    // lo escrito, no rehacerlo. Y el objetivo de este turno queda guardado
    // para nombrar la carpeta de obra nueva y la próxima foto.
    const hilanaTxt = tomarHilanaParaInyectar({ leer: (a) => { try { return fs.readFileSync(a, "utf-8"); } catch { return null; } }, borrar: (a) => { try { fs.rmSync(a, { force: true }); } catch { /* sin acta de borra-do: caduca sola */ } }, union: (...s) => path.join(...s) }, PROJECT_ROOT);
    objetivoTurnoQf = String(prompt || "").slice(0, 300);
    const fullUserPrompt = `${hilanaTxt}${recorteEntrante.texto}${
      textAttachmentsContext ? `\n\n[DOCUMENTOS ADJUNTOS EXTRAÍDOS]:${textAttachmentsContext}` : ""
    }${imagenesSubidasContext}${openFilesContext}`;

    // System instruction enriched with hidden system files (MEMORIA.md & skills.md on turn 1)
    let consolidatedSystemInstruction = systemInstruction || "Eres CerebroNico, motor y agente autónomo de ingeniería de software e IDE. Responde SIEMPRE y EXCLUSIVAMENTE en ESPAÑOL técnico directo, riguroso y sin rodeos.";

    // ============================================================
    // v1.6.17 — 📅 LA FECHA, QUE NO ESTABA EN NINGUNA PARTE
    // ------------------------------------------------------------
    // «¿Puedes responderme qué día es hoy?» — y no podía ninguno. Se buscó
    // `fecha`, `date`, `hoy` y `día` en la construcción del prompt y solo
    // aparecía `new Date()` para sellos internos (registro de incidencias del
    // cerebro, bóveda, logs), NUNCA como contexto para el modelo.
    //
    // El daño real no es que no sepa la fecha: es que un modelo grande no
    // responde «no sé», se INVENTA una con total aplomo. Eso es peor que no
    // contestar, y es justo lo que se prueba al revisar una interfaz.
    //
    // Se inyecta aquí porque este es el punto ÚNICO por el que pasa el prompt
    // de sistema de TODOS los proveedores (ver la nota siguiente), así que
    // arreglarlo una vez lo arregla para Ollama, GLM, Gemini y el resto.
    // ============================================================
    const ahoraDelSistema = new Date();
    const fechaDelSistema = ahoraDelSistema.toLocaleDateString("es-ES", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const horaDelSistema = ahoraDelSistema.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    let zonaDelSistema = "hora local";
    try {
      zonaDelSistema = Intl.DateTimeFormat().resolvedOptions().timeZone || "hora local";
    } catch { /* se queda el texto por defecto */ }
    consolidatedSystemInstruction +=
      `\n\n[DATO REAL DEL SISTEMA — fecha y hora] Hoy es ${fechaDelSistema}, ${horaDelSistema} (${zonaDelSistema}).` +
      ` Úsalo tal cual cuando te pregunten la fecha o la hora. No lo deduzcas del historial ni lo inventes.`;

    // v1.74.0 · AUTOAPRENDIZAJE EN TIEMPO REAL — dos cosas acá, en el punto
    // ÚNICO del prompt de sistema que comparten TODOS los proveedores:
    //  1) la corrección del usuario («así no», «ya te lo dije», «acordate
    //     que»…) se aprende AL INSTANTE como lección textual en LECCIONES.md;
    //  2) las lecciones aprendidas (no solo en este turno: en cualquier
    //     turno anterior de cualquier sesión) se inyectan SIEMPRE, no solo
    //     en el «turno 1» como MEMORIA.md. Aprender sin aplicar después es
    //     un diario íntimo; esto es memoria con dientes.
    try { detectarCorreccionUsuario(String(prompt || "")); } catch { /* aprender nunca rompe un turno */ }
    try {
      const leccionesVivas = leerLeccionesParaInyectar();
      if (leccionesVivas) {
        consolidatedSystemInstruction +=
          `\n\n[LECCIONES APRENDIDAS POR EL MOTOR — hecho, no sugerencia] Aplícalas en este turno sin volver a preguntar:\n${leccionesVivas}`;
      }
    } catch { /* sin lecciones: el turno sigue igual */ }

    // ============================================================
    // v2.0 — GOBERNANZA: CEREBRO (ley) + MEMORIA (estado vivo)
    // ------------------------------------------------------------
    // Este es el punto ÚNICO por el que pasa el prompt de sistema de TODOS los
    // proveedores (Ollama, GLM/Z.ai, Gemini, OpenRouter, OpenAI, Custom), así que
    // la ley del agente se aplica igual sea cual sea el "conductor".
    // El nivel decide cuánto se inyecta: un modelo diminuto recibe solo la ley
    // imprescindible (evita la fatiga de contexto), uno grande recibe el cerebro
    // completo más el estado y los fallos recientes.
    // ============================================================
    try {
      const perfilBrain = getProfile(model);
      // v1.45.4 — MODO TURBO para nube RÁPIDA (flash/lite/mini…): recibe la ley
      // en nivel "compact" (lo esencial) en vez de "pro". El nivel "pro" mete el
      // cerebro completo y es justo lo que inflaba el prompt y retrasaba la
      // primera palabra en Gemini Flash frente a la versión ligera. El modelo
      // sigue teniendo sus herramientas: solo adelgaza el texto fijo del prompt.
      const nivelBrain =
        perfilBrain.tier === "micro" || perfilBrain.tier === "tiny"
          ? "micro"
          : perfilBrain.tier === "small"
            ? "compact"
            : perfilBrain.nubeRapida
              ? "compact"
              : perfilBrain.tier === "large" || perfilBrain.tier === "cloud"
                ? "pro"
                : "standard";
      const bloqueBrain = brain.systemBlock(nivelBrain as any);
      if (bloqueBrain && brain.getCerebro().length > 200) {
        consolidatedSystemInstruction = `${bloqueBrain}\n\n${consolidatedSystemInstruction}`;
      }
      // Métrica de interacción (cada 10 dispara la compresión de la memoria).
      brain.registrarInteraccion();

      // ============================================================
      // v2.0 — RECUERDOS DE LA MEMORIA VECTORIAL (RAG local)
      // ------------------------------------------------------------
      // APAGADA POR DEFECTO: si `localRag.isEnabled()` es false, esta rama no se
      // ejecuta, no se llama a ningún modelo de embeddings y no se lee el índice.
      // Coste en reposo: cero. Cuando se activa, aporta los fragmentos de memoria
      // más parecidos a la consulta, que es justo lo que hace falta cuando el
      // archivo ya es demasiado grande para enviarlo entero.
      // ============================================================
      if (localRag.isEnabled()) {
        // v1.76.0 · hybrid_rerank: con la capacidad encendida, el bloque se
        // reordena por consenso palabra+vector (RRF, capa pura recalceHibrido).
        const recuerdos = await localRag.buildContextBlock(
          String(fullUserPrompt || ""),
          3,
          nivelBrain === "micro" ? 600 : 1400,
          { hibrido: features.isOn("hybrid_rerank") }
        );
        if (recuerdos) {
          consolidatedSystemInstruction = `${consolidatedSystemInstruction}\n\n${recuerdos}`;
        }
      }

      // ============================================================
      // v2.0 — LEY ESPECÍFICA DE DOMINIO (multi-cerebro)
      // Si la capacidad está activada y existe el sub-cerebro del dominio que
      // toca la petición, se suma aquí. Apagada no lee ningún archivo.
      // ============================================================
      const bloqueDominio = features.buildDomainBlock(String(fullUserPrompt || ""));
      if (bloqueDominio) {
        consolidatedSystemInstruction = `${consolidatedSystemInstruction}\n\n${bloqueDominio}`;
      }
    } catch (err: any) {
      console.log(`[CerebroNico] Aviso: gobernanza no inyectada (${err?.message || err})`);
    }

    // ============================================================
    // v1.6.20 — ✂️ TOPE A LOS ARCHIVOS DE SISTEMA OCULTOS
    // ------------------------------------------------------------
    // Aquí van MEMORIA.md y skills.md —y en las capturas del usuario se vio al
    // modelo de 270M DEVOLVIENDO este contenido en vez de contestar. Se metía
    // `hf.content` ENTERO, sin límite, en cada turno.
    //
    // Un modelo pequeño no aprovecha ese texto: se ahoga y lo repite. Y a
    // cualquiera que sea el motor, son tokens que se pagan en cada petición
    // antes de que el modelo pueda escribir la primera palabra.
    // ============================================================
    // v1.45.4 — En nube RÁPIDA el tope por archivo de contexto baja a 1500 car.
    // (en vez de 4000): un flash/lite no aprovecha más y cada carácter es espera
    // antes de la primera palabra. El modelo grande conserva los 4000.
    const MAX_CHARS_ARCHIVO_SISTEMA = getProfile(model).nubeRapida ? 1_500 : 4_000;
    if (Array.isArray(hiddenSystemFiles) && hiddenSystemFiles.length > 0) {
      for (const hf of hiddenSystemFiles) {
        const contenido = String(hf.content || "");
        const recortado = contenido.length > MAX_CHARS_ARCHIVO_SISTEMA;
        // v1.6.22 — Decirle a un modelo que un archivo está «OCULTO» es pedirle que
        // lo muestre. El rótulo era el punto único por el que pasa el prompt de
        // TODOS los proveedores. Ahora es material de referencia interno y lleva la
        // orden de no transcribirlo.
        consolidatedSystemInstruction +=
          `\n\n--- [CONTEXTO DE TRABAJO: ${hf.name}] (material de referencia interno; NO lo transcribas, cites ni repitas en la respuesta) ---\n` +
          (recortado ? contenido.slice(0, MAX_CHARS_ARCHIVO_SISTEMA) : contenido) +
          (recortado
            ? `\n[… recortado: quedan ${contenido.length - MAX_CHARS_ARCHIVO_SISTEMA} caracteres sin enviar. Pide la sección que necesites en vez de suponerla.]`
            : "");
      }
    }

    // ============================================================
    // v1.68.0 · FASES 2-3 «CONTRATO E INYECCIÓN» — UN CONJUNTO, DOS DESTINOS
    // ------------------------------------------------------------
    // El conjunto del turno se calcula UNA vez y viaja a las dos cosas que tienen
    // que coincidir: el esquema `tools` que recibe el proveedor en cada rama y el
    // manual que se inyecta en el system prompt. Mientras fueron dos cálculos
    // divergieron (defecto 4): el manual se armaba con `model` y cada rama
    // recalculaba con modeloOR / modeloCustom / targetModel. Va FUERA del try del
    // conocimiento del motor a propósito: si la KB falla se pierde un párrafo de
    // contexto; si fallara además esto, se perderían las manos en silencio.
    // El motor es src/engine/abordaje.ts; el invariante es que el manual nombre
    // TODAS las herramientas activas o se declare el exceso. Nada de esto estaba:
    // medido en v1.67.0, Gemini Flash y GLM-flash recibían 6 de 37 herramientas.
    // ============================================================
    let modeloEfectivoTurno = String(model || "");
    let herramientasTurno: any[] = [];
    let nombresTurno: string[] = [];
    try {
      modeloEfectivoTurno = resolverModeloEfectivo(provider, modeloBaseTurno) || String(model || "");
      const perfilTurno = getProfile(modeloEfectivoTurno);
      const plan = planDeAbordaje({
        modeloEfectivo: modeloEfectivoTurno,
        provider,
        perfil: { tier: perfilTurno.tier, nubeRapida: perfilTurno.nubeRapida },
        getTools: (m: string) => getToolsForModel(m, pcMode),
        ejecutables: getAllToolNames(),
        descripcionDe: (n: string) => getToolSpec(n)?.description,
        esExterna: (n: string) => esPackExterno(getToolSpec(n)?.pack || ""),
        raizDatos: PROJECT_ROOT, raizApp: fs.existsSync(path.join(process.cwd(), "package.json")) ? process.cwd() : "", // v1.86.3 · el mapa de rutas le llega al modelo CON el camino real: PROJECT_ROOT ya pasó por PROJECT_DIR y la guarda-raíz v1; la instalación solo se publica si trae package.json delante (un cwd raro de Electron no puede enseñar un camino falso).
      });
      modeloEfectivoTurno = plan.modeloEfectivo;
      herramientasTurno = plan.herramientas;
      nombresTurno = plan.nombres;
      if (plan.abordaje.texto) consolidatedSystemInstruction += `\n\n${plan.abordaje.texto}`;
      plan.notificar();
      auditarCatalogoUnaVez(plan.conjuntoManual, {
        specs: plan.conjuntoManual.map((n: string) => ({ name: n, description: getToolSpec(n)?.description })),
        hueso: HUESO_DE_OBRA,
        esExterna: (n: string) => esPackExterno(getToolSpec(n)?.pack || ""),
      });
    } catch (err: any) {
      console.warn(`[CerebroNico] Aviso: abordaje del turno no armado (${err?.message || err}) — el turno sigue, sin manual`);
    }

    // ============================================================
    // V8 · D1 — CONOCIMIENTO DEL MOTOR: PUNTO ÚNICO MULTI-PROVEEDOR
    // ------------------------------------------------------------
    // [CONOCIMIENTO DEL MOTOR] + [MANUAL DEL MOTOR] + [SÍMBOLOS REALES]
    // + [EQUIPO ESPEJO ACTIVO] se inyectan AHORA (antes de las ramas de
    // proveedor), no solo en la rama Ollama. Tesis fundacional: el
    // conocimiento vive en el motor, no en el modelo — cada "conductor"
    // (Ollama, GLM/Z.ai, Gemini, OpenRouter, OpenAI, Custom…) recibe el
    // mismo contexto verificado, en cada turno, con presupuesto por tramo
    // de modelo (700 car. en micro).
    // ============================================================
    try {
      // v1.68.0 · del modelo AL QUE se le habla, no del nombre del selector (defecto 4)
      const perfilMotor = getProfile(modeloEfectivoTurno || model);
      const esMicroMotor = perfilMotor.tier === "micro" || perfilMotor.tier === "tiny";
      const engineContextV8 = buildEngineContext(
        engineKb,
        `${fullUserPrompt}\n${(history || []).slice(-4).map((h: any) => h?.content || "").join("\n")}`,
        5,
        esMicroMotor ? 700 : (perfilMotor.nubeRapida ? 500 : 1200)
      );
      if (engineContextV8) {
        consolidatedSystemInstruction += `\n\n${engineContextV8}`;
      }
      // El manual ya está inyectado arriba (FASE 3). Aquí solo los alias que
      // usaban las variables viejas del bloque.
      const herramientasV8 = herramientasTurno;
      const nombresHerramientasV8 = nombresTurno;

      // ============================================================
      // v1.47.1 — RECETARIO DE UI + PROTOCOLO DE ANÁLISIS (pedido de Mario)
      // ------------------------------------------------------------
      // (a) El recetario de componentes web (botones por función, perilla/knob,
      //     slider de volumen, modales/drawers/popovers, vídeo incrustado) se
      //     inyecta SOLO cuando la tarea huele a interfaz/web (esTareaUI), para
      //     no gastar contexto en lo demás. Presupuesto por tramo de modelo.
      // (b) El PROTOCOLO DE ANÁLISIS PREVIO («analiza antes de hacer cagadas»)
      //     se inyecta a modelos con capacidad real (no micro/tiny: en esos no
      //     cabe y además no ejecutan herramientas), para que mire, planifique y
      //     verifique en vez de reescribir a ciegas.
      // ============================================================
      try {
        const recetarioUI = buildRecetarioUISection(
          fullUserPrompt,
          esMicroMotor ? 0 : (perfilMotor.nubeRapida ? 1400 : 2600)
        );
        if (recetarioUI) consolidatedSystemInstruction += `\n\n${recetarioUI}`;
        if (!esMicroMotor && herramientasV8.length > 0) {
          consolidatedSystemInstruction += `\n\n${PROTOCOLO_ANALISIS}`;
        }
      } catch { /* el recetario nunca debe tumbar el turno */ }

      // ============================================================
      // v1.47.2 — CONCIENCIA EN TIEMPO REAL (pedido de Mario)
      // ------------------------------------------------------------
      // El protocolo de análisis deja de ser un cartel fijo: en cada turno se
      // le inyecta al modelo el ESTADO VIVO (objetivo, pasos ya dados, recuento
      // del plan, capacidades reales ahora mismo) para que reconcilie su
      // próxima acción con la realidad en vez de razonar a ciegas o repetir
      // trabajo. Solo para modelos con herramientas (los que de verdad actúan).
      // ============================================================
      if (!esMicroMotor && herramientasV8.length > 0) {
        try {
          const hoja = hojaVivaParaPanel();
          let retrato: string | null = null;
          try { retrato = notaDeContexto(PROJECT_ROOT); } catch { retrato = null; }
          const concienciaV8 = buildConcienciaTiempoReal({
            objetivo: hoja?.objetivo ?? null,
            pasos: (hoja?.pasos || []).map((p: any) => ({
              herramienta: p.herramienta,
              detalle: p.detalle,
              ok: p.ok,
            })),
            resumen: hoja
              ? { hechas: hoja.resumen.hechas, fallidas: hoja.resumen.fallidas, sinHacer: hoja.resumen.sinHacer }
              : null,
            modelo: model,
            proveedor: provider,
            pcMode: !!pcMode,
            red: process.env.OFFLINE_MODE !== "1",
            retratoProyecto: retrato,
            ultimoError: null,
            // v1.48.0 — si la consulta parece una tarea pesada / de responsabilidad
            // (interpretar una idea para un software complejo), se antepone el
            // CONTRATO DE ARQUITECTO para que el modelo piense la obra antes de teclear.
            tareaPesada: pareceTareaPesada(fullUserPrompt),
          }, perfilMotor.nubeRapida ? 600 : 1000);
          if (concienciaV8) consolidatedSystemInstruction += `\n\n${concienciaV8}`; const _cerco = (() => { try { const _obj = hoja?.objetivo ?? null; const _abiertas = (hoja?.resumen?.sinHacer || []) as string[]; if (_obj && _abiertas.length > 0) { const _v = evaluarCercoDeAlcance({ objetivo: _obj, tareas: _abiertas.map((t: string, i: number) => ({ id: "t" + (i + 1), description: t })) }); return _v.hayDesvio ? _v.directiva : null; } return null; } catch { return null; } })(); if (_cerco) consolidatedSystemInstruction += `\n\n${_cerco}`; const presionTurno = presionDeTexto({ texto: consolidatedSystemInstruction, ventanaTokens: perfilMotor.numCtx }); if (presionTurno.aviso) consolidatedSystemInstruction += `\n${presionTurno.aviso}`; // v2.3.14 · FASE 13: la presión se mide sobre el texto que se va a mandar y contra la ventana del modelo (numCtx). Vacío por debajo del 45 %: callar cuesta cero caracteres. Una línea porque el trinquete no se mueve.
        } catch { /* la conciencia nunca debe tumbar el turno */ }
      }
      // ============================================================
      // v1.48.0 — CEREBRO (.con-ciencia) ENRUTADO (pedido de Mario)
      // ------------------------------------------------------------
      // El órgano de redirección (src/engine/cerebroOrgano.ts) puntua la consulta
      // contra indice.json y abre SÓLO las entradas que ganan — nunca todo el
      // cerebro. Si está vacío o nada enruta, devuelve "" y no gasta contexto.
      // Presupuesto por tramo de modelo (en micro no entra: no cabe).
      // ============================================================
      if (!esMicroMotor) {
        try {
          // v1.0.9 · el embedder local (Ollama) SALE del camino caliente en NUBE:
          // se enruta por vector (0.7 semántico/0.3 léxico) SOLO si el motor del turno
          // YA es Ollama; en nube → enrutado léxico (rutas undefined, sin red). No se
          // borra: en nube peleaba con Ollama por GPU/RAM y se comía 5 s de timeout.
          const _cbConsulta = `${fullUserPrompt}\n${(history || []).slice(-3).map((h: any) => h?.content || "").join("\n")}`;
          let _cbRutas: RutaCerebro[] | undefined;
          if (provider === "ollama") {
            const _cbHib = await enrutarHibridoCerebro(PROJECT_ROOT, _cbConsulta, { embed: cerebroEmbedder.embed, alCalentar: cerebroEmbedder.alCalentar, timeoutMs: 5000 });
            if (_cbHib.aviso) console.log(`🧠 cerebro: ${_cbHib.aviso} [embedder: ${cerebroEmbedder.resolucion()?.modelo ?? "sin resolver"}]`);
            _cbRutas = _cbHib.modo === "hibrido" ? _cbHib.rutas : undefined;
          }
          const cerebroCtx = buildCerebroContext(PROJECT_ROOT, _cbConsulta, perfilMotor.nubeRapida ? 1000 : 1600, _cbRutas);
          if (cerebroCtx) consolidatedSystemInstruction += `\n\n${cerebroCtx}`;
        } catch { /* el cerebro nunca debe tumbar el turno */ }
      }
      // v1.44.0 — DIRECTRIZ DE EJECUCIÓN REAL: contra la herramienta fantasma
      // («consultarEscritorioMCP») y el bucle «hazlo/no puedo» de la sesión de
      // Mario. Se inyecta SIEMPRE (haya o no herramientas): si las hay, obliga a
      // usarlas; si no, obliga a decir qué activar en vez de fingir acceso.
      try {
        const directrizReal = directrizEjecucionReal({
          herramientas: nombresHerramientasV8,
          pcMode: !!pcMode,
          red: process.env.OFFLINE_MODE !== "1",
        });
        if (directrizReal) consolidatedSystemInstruction += `\n\n${directrizReal}`;
      } catch { /* la directriz nunca debe tumbar el turno */ }
      if (symbolMap.total === 0) {
        try {
          reindexProjectSymbols();
        } catch {}
      }
      const simbolosV8 = summarizeSymbols(symbolMap, esMicroMotor ? 700 : (perfilMotor.nubeRapida ? 500 : 1300));
      if (simbolosV8) consolidatedSystemInstruction += `\n\n${simbolosV8}`;
      const notaEspejosV8 = notaSeleccionEspejos(String(fullUserPrompt || "")); // v1.70.3 · auto llega con el equipo YA resuelto por el motor
      if (notaEspejosV8) {
        consolidatedSystemInstruction += `\n\n${notaEspejosV8}\nCuando el pedido encaje con ese equipo, llámalo (consultar_espejo): es determinista (~1 ms) y no gasta RAM del modelo.`;
      }
    } catch (err: any) {
      console.log(`[CerebroNico] Aviso: conocimiento del motor no inyectado (${err?.message || err})`);
    }

    // ============================================================
    // v1.6.20 — ✂️ TOPE AL HISTORIAL
    // ------------------------------------------------------------
    // La nota anterior decía «no artificial 5-message truncation», y quitar el
    // recorte de 5 estaba bien: era demasiado agresivo. El problema es que se
    // pasó de 5 a INFINITO, y el historial entero viaja en cada petición.
    //
    // Con «Historico Total Activo» encendido, cada mensaje nuevo reenvía toda la
    // conversación. El coste crece con la sesión, y de ahí que la latencia fuera
    // parecida en un modelo cloud rápido y en uno local diminuto: los dos
    // pagaban el mismo peaje de lectura.
    //
    // Se recorta a los últimos 24 mensajes. Sigue siendo holgado para que la
    // conversación tenga sentido —muy lejos del recorte de 5 que se quitó en su
    // día—, y pone un techo que antes no existía. Se avisa por consola al
    // recortar, para que no sea un silencio.
    // ============================================================
    const MAX_MENSAJES_HISTORIAL = 24;
    const historialCrudo = Array.isArray(history) ? history : [];
    const historialPorConteo =
      historialCrudo.length > MAX_MENSAJES_HISTORIAL
        ? historialCrudo.slice(-MAX_MENSAJES_HISTORIAL)
        : historialCrudo;
    // ============================================================
    // v1.45.2 — RECORTE POR PRESUPUESTO DE CARACTERES (no solo por conteo).
    // ------------------------------------------------------------
    // 🐞 RAÍZ medida (sesión glm-4.5-flash/Z.ai): el historial se capaba por
    // NÚMERO de mensajes (24) pero NO por TAMAÑO. Unos pocos mensajes largos
    // (volcados de código, archivos, salidas de herramientas) hinchaban el
    // prompt → latencia media 31 s / máx 123 s y, al acumularse, el proveedor cortaba con
    // «Prompt exceeds max length (code 1261)». Las ramas de nube reenviaban `fullHistory`
    // ENTERO sin pasar por `trimMessagesToBudget` — ese recorte sólo vivía en la rama Ollama.
    // Ahora se aplica aquí, EN EL ORIGEN, para TODOS los proveedores: el presupuesto de
    // caracteres del perfil del modelo manda, igual que en local.
    // ============================================================
    const _perfilHistorial = getModelProfile(String(model || ""), RAM_GB);
    // v1.45.2 — MEMORIA DE TAREAS LARGAS SIN SACRIFICAR VELOCIDAD.  ·  ------------------
    // Pedido de Mario: «debe tener contexto para tareas largas PERO responder lo más rápido
    // posible». Antes el recorte TIRABA los mensajes viejos → rápido pero amnésico. Ahora se
    // reserva un trozo del presupuesto para un RESUMEN de lo descartado: el modelo sigue el
    // hilo de la tarea larga y el prompt total NO crece (= primer token rápido). El resumen es
    // determinista (no gasta otra llamada al modelo).
    const _budgetResumen = Math.min(
      2000,
      Math.max(0, Math.floor(_perfilHistorial.contextCharBudget * 0.12))
    );
    const _recorteHistorial = trimMessagesToBudget(
      historialPorConteo
        .filter((h: any) => h?.role && h?.content)
        .map((h: any) => ({ role: String(h.role), content: String(h.content) })),
      techoDeHistorial({ presupuesto: _perfilHistorial.contextCharBudget, sistema: consolidatedSystemInstruction.length, resumen: _budgetResumen }), // v1.0.33 · el sistema YA está escrito: se descuenta medido, no estimado.
      _perfilHistorial.historyTurns
    );
    let fullHistory: Array<{ role: string; content: string }> = _recorteHistorial.messages;
    // Si quedó algo fuera, lo condensamos y lo ponemos al INICIO del contexto.
    let _resumenHistorial = "";
    if (_recorteHistorial.droppedMessages?.length && _budgetResumen >= 200) {
      _resumenHistorial = condensarHistorial(_recorteHistorial.droppedMessages, _budgetResumen);
      if (_resumenHistorial) {
        fullHistory = [{ role: "user", content: _resumenHistorial }, ...fullHistory];
      }
    }
    try { const _vt = veredictoTecho({ presupuesto: _perfilHistorial.contextCharBudget, sistema: consolidatedSystemInstruction.length, historial: fullHistory.reduce((a: number, m: any) => a + String(m?.content || "").length, 0) }); if (_vt.aviso) console.log(_vt.aviso); } catch { /* medir nunca tumba el turno */ } // v1.0.33
    if (historialCrudo.length > fullHistory.length || _resumenHistorial) {
      // v1.98.0 · conducta normal del perfil, no emergencia: una vez por (tope, perfil)
      avisarRecorteDeHistorial({ crudos: historialCrudo.length, finales: fullHistory.length, tope: MAX_MENSAJES_HISTORIAL, presupuesto: _perfilHistorial.contextCharBudget, tier: _perfilHistorial.tier, condensados: _resumenHistorial ? _recorteHistorial.droppedMessages.length : null });
    }

    // v1.0.29 — EL PREFIJO QUE NO CAMBIA + COMPACTAR POR PRESIÓN MEDIDA.
    // Punto ÚNICO del prompt de sistema (todos los proveedores pasan por aquí).
    // El porqué, las trampas y los umbrales están documentados en el módulo; aquí
    // solo la llamada, porque cada línea del monolito se paga contra su trinquete.
    // La lógica vive en `ordenDelPrompt` (pura y con suite): aquí solo la llamada.
    try {
      consolidatedSystemInstruction = prepararSistemaParaCache({
        sistema: consolidatedSystemInstruction,
        presion: presionDeTexto({ texto: consolidatedSystemInstruction, ventanaTokens: getProfile(modeloEfectivoTurno || model).numCtx }).fraccion,
        turnosDisponibles: Array.isArray(history) ? history.length : 0,
      }).texto;
    } catch { /* ordenar el prompt nunca debe tumbar el turno */ }

    // 2.5. ACCIONES RÁPIDAS DETERMINISTAS · Modo Agente PC
    // Si el usuario pide algo directo (crear/borrar/leer/listar/ejecutar),
    // lo hacemos YA contra el puente :5000, sin gastar LLM. Corta el flujo.
    // v1.16.6 — GUARDA EXPLÍCITA: una orden del Editor web JAMÁS es acción
    // rápida. El bug «DEL» nacía aquí: el envoltorio «[ORDEN DEL EDITOR WEB]
    // … ejecuta.» engañaba al parser, que pescaba «DEL EDITOR WEB» de la
    // etiqueta y lo mandaba al puente ANTES de tocar el modelo. parseQuickAction
    // ya devuelve null para estas órdenes; este `&&` lo refuerza en el sitio.
    if (pcMode && prompt && typeof prompt === "string" && !esOrdenDelEditorWeb(prompt)) {
      const handled = await handlePcQuickAction(prompt, ctx);
      if (handled) return;
    }

    // 3. PROVIDER: GEMINI
    if (provider === "gemini" || model.startsWith("gemini")) {
      const ai = getGenAI(geminiApiKey);
      if (!ai) {
        // 🔧 CORRECCIÓN: si el usuario pidió Gemini pero no hay API key, enviar
        // error claro en vez de caer al fallback autónomo silenciosamente.
        ctx.sendError(
          `❌ Gemini requiere API Key. Configúrala en el modal "Ranuras de API Keys" ` +
          `(botón "Abrir Ranuras" en el panel izquierdo), o como variable de entorno ` +
          `GEMINI_API_KEY. Consíguela gratis en https://aistudio.google.com/apikey`
        );
        return;
      }
      // ============================================================
      // v1.48.0 — CADENA DE RESERVA SOBRE MODELOS VALIDADOS EN CAMPO (Mario).
      // La familia 2.x/1.5 está apagada o da 404; los que responden con la
      // clave gratuita son los Gemini 3.x (flash y mini). Los IDs vivos salen
      // de ListModels (abajo); esta lista fija es el último recurso y va de
      // más nuevo a más antiguo. `ALIAS_GEMINI_INTERNOS` descarta los alias
      // que no son modelos de la API («gemini-flash»/«gemini-free») → 404.
      // ============================================================
      // v1.57.12 · la lista fija y los alias VIAJAN con el fusible (src/engine/fusibleGemini.ts):
      // el monolito deja de repartir modelos a ciegas — el fusible dice cuáles no hay que tentar.
      const modeloPedidoEsReal =
        model.includes("gemini") && !ALIAS_GEMINI_INTERNOS.has(String(model).trim().toLowerCase());
      // v1.46.4 — ListModels dice qué IDs puede usar ESTA clave (flash primero);
      // así se purga el ID «fantasma» fijado en localStorage. Si falla, lista fija.
      const listaVivaGemini = await resolverModelosGeminiVigentes(geminiApiKey);
      const baseGemini =
        (listaVivaGemini && listaVivaGemini.length) ? listaVivaGemini : MODELOS_GEMINI_VIGENTES;
      const pedidoUsable =
        modeloPedidoEsReal && (!listaVivaGemini || listaVivaGemini.includes(model));
      const candidateModels = [
        ...(pedidoUsable ? [model] : []),
        ...baseGemini,
      ];
      const uniqueModels = filtrarModelosChatGemini(
        Array.from(new Set(candidateModels)).filter((m) => !fusibleRechazaGemini(m, Date.now()))
      ); // v1.57.12 · muertos y enfriados no se tentan  ·  v1.66.0 · y los NO-chat (lyria/imagen/veo/transcribe/robotics/computer-use/deep-research) tampoco
      let lastGeminiErr: any = null;

      for (const targetModel of uniqueModels) {
        // Declarado AQUÍ y no dentro del `try`: un `const` del bloque `try` NO
        // es visible desde su `catch`, y el catch necesita poder desarmar el
        // reloj si el SDK falla antes del primer token.
        let relojGemini: ReturnType<typeof setTimeout> | undefined;
        try {
          const contents: any[] = [];
          // Add full history for Gemini
          for (const h of fullHistory) {
            if (h.role && h.content) {
              contents.push({
                role: h.role === "assistant" ? "model" : "user",
                parts: [{ text: h.content }],
              });
            }
          }

          const currentParts: any[] = [{ text: fullUserPrompt }];
          for (const imgBase64 of base64Images) {
            currentParts.push({
              inlineData: {
                data: imgBase64,
                mimeType: "image/png",
              },
            });
          }
          // v1.58.0 — AUDIO para Gemini: cada clip entra como `inlineData` con su
          // MIME real (audio/wav|mp3|mp4|ogg|flac…). Gemini nativo SÍ lo escucha
          // y transcribe/razona sobre él; es la única ruta de audio del motor hoy.
          for (const aud of base64Audios) {
            currentParts.push({
              inlineData: {
                data: aud.data,
                mimeType: aud.mime,
              },
            });
          }
          contents.push({ role: "user", parts: currentParts });

          // v1.6.16 — Gemini es el único proveedor que NO pasa por `fetch` (usa
          // el SDK), así que `fetchCloud` no lo cubría. Y es el que más lo
          // necesita: su cadena de failover prueba hasta 5 modelos EN SERIE, de
          // modo que un modelo mudo multiplicaba la espera hasta por cinco.
          // ============================================================
          // v1.6.19 — 🐞 EL ABORTO ERA MÍO, Y ESTE ERA EL FALLO DE VERDAD
          // ------------------------------------------------------------
          // La v1.6.16 puso aquí un techo de 45 s a la espera del primer byte.
          // Razonable para un `fetch` a un proveedor mudo. INCORRECTO para
          // Gemini, porque en Gemini el primer token NO es inmediato: la
          // familia 3 usa «dynamic thinking» por defecto y Google avisa en su
          // guía de que «the model may take SIGNIFICANTLY LONGER to reach a
          // first (non thinking) output token».
          //
          // Resultado: peticiones perfectamente válidas cortadas a los 45 s, y
          // el usuario viendo «signal is aborted without reason» después de
          // esperar minutos. Un fallo mío — y con el peor mensaje posible,
          // porque parecía un problema de su configuración.
          //
          // Esperar de más es molesto; cortar una respuesta que venía es peor.
          // Así que Gemini tiene su propio presupuesto, mucho más largo.
          // ============================================================
          const GEMINI_PRIMER_TOKEN_TIMEOUT_MS = 150_000;
          const ctrlGemini = new AbortController();
          relojGemini = setTimeout(() => ctrlGemini.abort(), GEMINI_PRIMER_TOKEN_TIMEOUT_MS);

          // v1.6.18 — 🌡️ GEMINI 3 QUIERE temperature = 1.0
          //
          // Palabras de Google, en la guía oficial de la familia 3: «For all
          // Gemini 3 models, we strongly recommend keeping the temperature
          // parameter at its default value of 1.0... Changing the temperature
          // (setting it below 1.0) may lead to unexpected behavior, such as
          // LOOPING or degraded performance, particularly in complex
          // mathematical or reasoning tasks».
          //
          // La app enviaba el valor del regulador de la interfaz, que por
          // defecto está en 0.5 — la MITAD de lo recomendado. No produce el 404,
          // pero sí puede explicar respuestas degeneradas o en bucle con estos
          // modelos. Solo se fuerza en la familia 3: los anteriores sí se
          // benefician de ajustar la temperatura.
          const esFamiliaGemini3 = /^gemini-3/.test(String(targetModel));
          const temperaturaEfectiva = esFamiliaGemini3
            ? 1.0
            : typeof temperature === "number" ? temperature : 0.5;

          // v1.6.19 — 🏃 EL ARREGLO DE LA VELOCIDAD.
          //
          // La temperatura no era lo único que iba por defecto: el NIVEL DE
          // RAZONAMIENTO también. Gemini 3 razona en «high» si no se le dice
          // otra cosa, y Google lo describe como «may take significantly longer
          // to reach a first output token» — en una interfaz de chat eso es
          // pura espera sin valor. Google documenta `low` como «minimizes
          // latency and cost», que es exactamente este caso.
          // Se construye aparte tipado `any` (TS2322 si se usa spread condicional).
          // v1.6.21 — «low» → «minimal»: «low» sube el razonamiento en flash-lite.
          //
          // Y el razonamiento se paga en TIEMPO antes de la primera palabra
          // visible — que es justo el minuto que se estaba midiendo.
          //
          // v1.52.5 — BOTÓN DE RAZONAMIENTO GEMINI: la UI envía geminiThinkingLevel
          // ("MINIMAL"/"MEDIUM"/"HIGH"); si no viene, fallback "MINIMAL".
          // v1.0.40 — Nivel de pensamiento compatible con Gemini 3 y Gemini 4 (nunca MINIMAL en 4.x).
          const configRazonamientoGemini: any = resolverPensamientoGemini(targetModel, geminiThinkingLevel);

          // ============================================================
          // v1.44.0 — HERRAMIENTAS EN LA NUBE (RAÍZ #2 y #3 de Mario)
          // ------------------------------------------------------------
          // Hasta v1.43 esta rama SOLO transmitía texto: el modelo recibía los
          // NOMBRES de las herramientas en el prompt pero NO podía LLAMARLAS
          // (no se pasaban `tools` al SDK ni se interpretaban las
          // `functionCall`). De ahí el bug: el modelo inventaba
          // «consultarEscritorioMCP» y caía en «hazlo/no puedo». Ahora, si el
          // modelo es tool-capable y hay herramientas activas, se cablea el
          // BUCLE REAL reutilizando `executeToolCall` (el MISMO ejecutor del
          // bucle de Ollama). Sin herramientas, el camino es IDÉNTICO al de
          // v1.43 (`toolsGemini` queda undefined → una sola pasada de texto).

          const herramientasGemini = herramientasTurno;
          const toolsGemini =
            herramientasGemini.length > 0
              ? [{ functionDeclarations: toGeminiFunctionDeclarations(herramientasGemini) }]
              : undefined;
          // v1.57.9 — mismo defecto que las otras dos ramas: 8 pasos fijos
          // mataban tandas largas «a mitad de la escritura». Base 12 y cada
          // escritura sana compra 2 pasos más (tope 36).
          // v1.0.14 · base 24 y el tope duro sube a 96: con Gemini 3 cada vuelta
          // cuesta 10-20 s y las tandas de test-and-fix (pc_exec sano) no
          // compraban NINGÚN paso — el turno moría a los ~3 minutos con obra en
          // marcha. Ahora lectura y ejecución sanas y distintas también pagan.
          let MAX_PASOS_TOOL_GEMINI = 24;
          let escriturasGemini = 0;
          let lecturasGemini = 0, ejecucionesGemini = 0;
          const clavesVistasGemini = new Set<string>();
          let streamedAnyChunk = false;
          let turnoFinalGemini = false;
          let reempujesGemini = 0, espejoUsadoG = false; // v1.55.1 — presupuesto de re-empujes/turno (escala y topa) · v1.70.2 espejoUsadoG: si ya llamó espejos, el re-empuje no ofrece lo hecho
          const accionesGemini: string[] = []; // v1.47.0 — resumen de acciones
          // v1.57.9 — lazo suave compartido con las otras ramas (mismo módulo puro).
          let guardiaG: EstadoRepeticion = { ...REPETICION_SIN_VER };
          let intervencionesG = 0;
          const salidaPorClaveG = new Map<string, string>();
          let lazoAgotadoG = "";
          // v1.63.0 — misma guarda de relectura idéntica que la rama Ollama.
          const lectorG: EstadoLectura = nuevoEstadoLectura();
          let lazoLecturaG = "";
          // v1.64.0 FASE 3 (rama Gemini). v1.65.0: singleton de sesión compartido + rotación por turno.
          const contextoBucleG: EstadoContextoBucle = contextoBucleSesion; abrirTurnoBucle(contextoBucleG); abrirTurnoPropuestas(); // v1.76.0 (rama Gemini)
          let avisoBucleG = ""; let lazoBucleG = "";
          let avisoReescrituraG = ""; let reescriturasIdenticasG = 0; const rutasReescritasG: string[] = []; // v1.60.17
          // v1.62.0 — misma corrección que la rama Ollama: ventanilla de SESIÓN
          // (singleton de módulo) rotada al arrancar el turno, nunca recreada.
          const turnoIdGemini = Date.now();
          const ventanillaG = ventanillaSesion; abrirTurno(ventanillaG, turnoIdGemini);
          const vigilanteG = nuevoVigilanteArgs(); // v1.57.10

          for (let pasoTool = 0; pasoTool <= MAX_PASOS_TOOL_GEMINI; pasoTool++) {
            const streamResult = await ai.models.generateContentStream({
              model: targetModel,
              contents,
              config: {
                systemInstruction: consolidatedSystemInstruction,
                ...(esGemini4(targetModel) ? {} : { temperature: temperaturaEfectiva }),
                abortSignal: ctrlGemini.signal,
                ...(configRazonamientoGemini ? { thinkingConfig: configRazonamientoGemini } : {}),
                ...(toolsGemini && vigilanteG.seguidos < UMBRAL_SIN_HERRAMIENTAS ? { tools: toolsGemini } : {}),
              },
            });

            // v1.46.0 — BUGFIX DE TIPOS: antes esta lista se declaraba como
            // `Array<{ name: string; args: any }>`, y ese tipo NO tiene
            // `thoughtSignature`. La firma de pensamiento SÍ se capturaba en
            // `extraerLlamadasGemini`, pero al leerla aquí (`l.thoughtSignature`)
            // el compilador daba TS2339 y `npm run lint` quedaba en rojo. Es
            // decir: el arreglo del 400 de Gemini vivía en código que no pasaba
            // el propio tipo del proyecto. Ahora la lista usa el tipo REAL de la
            // función (`LlamadaHerramienta[]`), así que la firma viaja tipada.
            const llamadasTurno: LlamadaHerramienta[] = [];
            let textoTurno = "";
            for await (const chunk of streamResult) {
              // Primer token: la espera ya está pagada. Se levanta el techo para
              // no matar una generación larga a mitad de camino.
              if (!streamedAnyChunk) clearTimeout(relojGemini);
              if (ctx.isAborted()) break;
              const text = chunk.text;
              if (text) {
                ctx.sendChunk(text);
                textoTurno += text;
                streamedAnyChunk = true;
              }
              if (toolsGemini) {
                const ll = extraerLlamadasGemini(chunk);
                if (ll.length) llamadasTurno.push(...ll);
              }
            }

            if (ctx.isAborted()) { turnoFinalGemini = true; break; }

            // ¿El modelo pidió herramientas en este turno? Si quedan pasos,
            // las ejecutamos de VERDAD y le devolvemos el resultado.
            if (toolsGemini && llamadasTurno.length > 0 && pasoTool < MAX_PASOS_TOOL_GEMINI) {
              // Turno del modelo en el transcript: su texto (si hubo) + sus
              // functionCall.
              contents.push({
                role: "model",
                parts: [
                  ...(textoTurno ? [{ text: textoTurno }] : []),
                  // v1.45.6 — DEVOLVER LA FIRMA DE PENSAMIENTO. Gemini 3
                  // (modelos "thinking") exige que, al reenviarle su propia
                  // functionCall en el siguiente turno, venga pegada la
                  // `thoughtSignature` que ÉL emitió. Sin ella corta con
                  // 400 «Function call is missing a thought_signature in
                  // functionCall parts» — justo el error que dejaba a Gemini
                  // inservible en modo agente. La capturamos en
                  // extraerLlamadasGemini y la reinyectamos aquí, tal cual.
                  ...llamadasTurno.map((l) => ({
                    functionCall: { name: l.name, args: l.args || {} },
                    ...(l.thoughtSignature ? { thoughtSignature: l.thoughtSignature } : {}),
                  })),
                ],
              });
              // Ejecución real de cada herramienta (fs/pc/web). La autorización
              // previa de descargas/navegación la sigue imponiendo el puente.
              const partesRespuesta: any[] = [];
              for (const l of llamadasTurno) {
                // LAZO SUAVE (v1.57.9): 3ª llamada idéntica → no se ejecuta, se
                // responde con lo que ya sabía + orden de cambiar de enfoque.
                const claveG = `${l.name}:${JSON.stringify(l.args || {})}`;
                guardiaG = anotarRepeticion(guardiaG, claveG);
                if (guardiaG.veces >= UMBRAL_REPETICION) {
                  intervencionesG++;
                  if (intervencionesG > TOPE_INTERVENCIONES) { lazoAgotadoG = l.name; break; }
                  partesRespuesta.push(respuestaHerramientaGemini(
                    l.name, directivaRepeticion(l.name, guardiaG.veces, salidaPorClaveG.get(claveG) || ""),
                  ));
                  continue;
                }
                let crudo: string;
                try {
                  crudo = await executeToolCall(l.name, l.args || {});
                } catch (e: any) {
                  crudo = JSON.stringify({ ok: false, error: String(e?.message || e) });
                }
                // v1.63.0 — DISCIPLINA DE CONTEXTO EN GEMINI. Antes esta rama
                // devolvía el volcado CRUDO (los diagnósticos `memory_*` enteros
                // llenaban el chat igual que en Ollama). Ahora se compacta y, si
                // es una relectura idéntica estéril, se deduplica. Los errores no
                // se compactan (los detecta `compactToolResult`).
                let isErrorG = false;
                try { isErrorG = JSON.parse(crudo)?.ok === false; } catch { isErrorG = false; }
                const compactedG = compactToolResult(l.name, crudo, isErrorG);
                const pathG = (l.args as any)?.path ? String((l.args as any).path) : undefined;
                registrarEscrituraLectura(lectorG, esHerramientaDeObra(l.name) && !isErrorG, pathG); if (l.name === "consultar_espejo") espejoUsadoG = true; // v1.70.2
                const veredLG = isErrorG
                  ? { veces: 0, deduplicar: false, cortar: false as boolean, nota: undefined as string | undefined }
                  : evaluarLectura(lectorG, l.name, JSON.stringify(l.args || {}), crudo, pathG);
                let contenidoToolG = compactedG.output;
                if (veredLG.deduplicar && veredLG.nota) contenidoToolG = veredLG.nota;
                partesRespuesta.push(respuestaHerramientaGemini(l.name, contenidoToolG));
                salidaPorClaveG.set(claveG, contenidoToolG);
                if (veredLG.cortar) { lazoLecturaG = l.name; break; } // v1.63.0 — bucle de relectura estéril
                if (esRechazoReescrituraIdentica(contenidoToolG)) { reescriturasIdenticasG++; if ((l.args as any)?.path) rutasReescritasG.push(String((l.args as any).path)); const veredG = registrarRechazo(ventanillaG, turnoIdGemini); if (veredG.cortar) { avisoReescrituraG = cierreEntreTurnos(veredG.motivo, rutasReescritasG); break; } if (reescriturasIdenticasG >= TOPE_REESCRITURA_IDENTICA) { avisoReescrituraG = cierrePorReescrituraIdentica(rutasReescritasG); break; } } // v1.60.17 corte por turno · v1.61.0 corte por sesión (rama Gemini)
                try {
                  const a = l.args || {};
                  const obj = a.path || a.command || a.query || a.name || a.task_id || "";
                  let ok = true;
                  try { ok = JSON.parse(crudo)?.ok !== false; } catch {}
                  // v1.57.10 — vigilante de argumentos (rutas Gemini).
                  {
                    const vfG = registrarFalloArgs(vigilanteG, !ok, crudo);
                    if (vfG.justoAlCruzarlo) partesRespuesta.push({ text: DIRECTIVA_SIN_HERRAMIENTAS });
                  }
                  accionesGemini.push(`${ok ? "✔" : "✖"} ${l.name}${obj ? ` — ${String(obj).slice(0, 80)}` : ""}`);
                  if (ok && esHerramientaDeObra(l.name)) {
                    escriturasGemini++;
                    MAX_PASOS_TOOL_GEMINI = Math.max(MAX_PASOS_TOOL_GEMINI, techoPasosConProgreso(escriturasGemini, lecturasGemini, ejecucionesGemini));
                  } else if (ok && !clavesVistasGemini.has(claveG)) {
                    // v1.0.14 · lectura/ejecución sanas y DISTINTAS compran paso
                    // (mismo libro que la rama OpenAI-compat, techo 96).
                    clavesVistasGemini.add(claveG);
                    if (esHerramientaDeEjecucion(l.name)) ejecucionesGemini++;
                    else lecturasGemini++;
                    MAX_PASOS_TOOL_GEMINI = Math.max(MAX_PASOS_TOOL_GEMINI, techoPasosConProgreso(escriturasGemini, lecturasGemini, ejecucionesGemini));
                  }
                  // v1.64.0 — FASE 3: registra el paso (OBRA exitosa reinicia; token con hash de args tras \u0000, el mensaje solo muestra el nombre).
                  {
                    registrarPaso(contextoBucleG, `${l.name}\u0000${JSON.stringify(l.args || {})}`, ok && esHerramientaDeObra(l.name));
                    const vbG = evaluarContextoBucle(contextoBucleG);
                    if (vbG.mensaje) avisoBucleG = vbG.mensaje;
                    if (vbG.debeCortar) lazoBucleG = (vbG.ciclo?.patron || []).map((t) => t.split("\u0000")[0]).join(" → ");
                  }
                } catch { accionesGemini.push(`✔ ${l.name}`); }
              }
              if (avisoReescrituraG) {
                // v1.60.17 — Gemini exige una functionResponse por cada functionCall ya enviado.
                while (partesRespuesta.length < llamadasTurno.length) partesRespuesta.push(respuestaHerramientaGemini(llamadasTurno[partesRespuesta.length]?.name || "tool", avisoReescrituraG));
                contents.push({ role: "user", parts: partesRespuesta });
                ctx.sendChunk(avisoReescrituraG + (accionesGemini.length ? `\nLo realizado antes del corte:\n${accionesGemini.slice(-8).map((a) => `  • ${a}`).join("\n")}` : ""));
                turnoFinalGemini = true;
                break;
              }
              if (lazoAgotadoG) {
                // Gemini exige una functionResponse por cada functionCall ya
                // enviado: se completa la tanda con un cierre antes de romper.
                while (partesRespuesta.length < llamadasTurno.length) {
                  partesRespuesta.push(respuestaHerramientaGemini(llamadasTurno[partesRespuesta.length]?.name || "tool", cierrePorLazoAgotado(lazoAgotadoG)));
                }
                contents.push({ role: "user", parts: partesRespuesta });
                ctx.sendChunk(cierrePorLazoAgotado(lazoAgotadoG) + (accionesGemini.length ? `\nLo realizado antes del corte:\n${accionesGemini.slice(-8).map((a) => `  • ${a}`).join("\n")}` : ""));
                turnoFinalGemini = true;
                break;
              }
              if (lazoLecturaG) {
                // v1.63.0 — bucle de relectura idéntica estéril: se cierra honesto,
                // completando una functionResponse por cada functionCall ya enviado.
                while (partesRespuesta.length < llamadasTurno.length) {
                  partesRespuesta.push(respuestaHerramientaGemini(llamadasTurno[partesRespuesta.length]?.name || "tool", cierrePorLazoAgotado(lazoLecturaG)));
                }
                contents.push({ role: "user", parts: partesRespuesta });
                ctx.sendChunk(cierrePorLazoAgotado(lazoLecturaG) + (accionesGemini.length ? `\nLo realizado antes del corte:\n${accionesGemini.slice(-8).map((a) => `  • ${a}`).join("\n")}` : ""));
                turnoFinalGemini = true;
                break;
              }
              if (lazoBucleG) {
                // v1.64.0 — FASE 3 (respaldo duro): el ciclo giró demasiadas
                // veces pese al aviso visible; se cierra honesto completando una
                // functionResponse por cada functionCall ya enviado.
                while (partesRespuesta.length < llamadasTurno.length) {
                  partesRespuesta.push(respuestaHerramientaGemini(llamadasTurno[partesRespuesta.length]?.name || "tool", cierrePorLazoAgotado(lazoBucleG)));
                }
                contents.push({ role: "user", parts: partesRespuesta });
                ctx.sendChunk(cierrePorLazoAgotado(lazoBucleG) + (accionesGemini.length ? `\nLo realizado antes del corte:\n${accionesGemini.slice(-8).map((a) => `  • ${a}`).join("\n")}` : ""));
                turnoFinalGemini = true;
                break;
              }
              // v1.64.0 — FASE 3: el aviso del ciclo VIAJA como texto en la misma
              // tanda de respuestas para que el modelo lo lea y se auto-corrija
              // ANTES de que el respaldo duro (lazoBucleG) corte en otra vuelta.
              if (avisoBucleG) { partesRespuesta.push({ text: avisoBucleG }); avisoBucleG = ""; }
              contents.push({ role: "user", parts: partesRespuesta });
              continue; // nueva vuelta: el modelo razona con el resultado real
            }

            // v1.55.1 — ANUNCIO SIN ACCIÓN: narró el paso y cerró sin functionCall → re-empuje ESCALADO.
            if (
              toolsGemini &&
              reempujesGemini < MAX_REEMPUJES_ANUNCIO &&
              pasoTool < MAX_PASOS_TOOL_GEMINI &&
              motivoDeParada(textoTurno, []) !== null
            ) {
              if (textoTurno) contents.push({ role: "model", parts: [{ text: textoTurno }] });
              contents.push({ role: "user", parts: [{ text: directivaDeReanudacion(reempujesGemini) + notaEspejosDeEmpuje(espejoUsadoG) }] });
              reempujesGemini++;
              console.log(`[bucle/gemini] anuncio sin acción (${motivoDeParada(textoTurno, [])}) — re-empuje ${reempujesGemini}/${MAX_REEMPUJES_ANUNCIO}`);
              continue;
            }

            // v1.56.8 — MISMO AGUJERO QUE EN LA RAMA OpenAI-compat: agotados los
            // re-empujes, el turno cerraba como si estuviera completo. Se avisa
            // solo si ninguna herramienta ejecutó obra real (si ejecutó, el cierre
            // de abajo ya cuenta qué se hizo).
            if (accionesGemini.length === 0) {
              const motivoFinalGemini = motivoDeParada(textoTurno, []);
              if (motivoFinalGemini) {
                console.warn(`[bucle/gemini] CIERRE SIN ACCIÓN tras ${reempujesGemini} re-empuje(s): ${motivoFinalGemini}`);
                ctx.sendChunk(cierreIntencionSinEjecutar(reempujesGemini, motivoFinalGemini));
              }
            }

            // Sin más llamadas: este turno es la respuesta final.
            turnoFinalGemini = true;
            break;
          }

          // El flujo terminó (o lo cortó el usuario): el reloj ya no vigila nada.
          // `clearTimeout` repetido es inofensivo.
          clearTimeout(relojGemini);

          if (streamedAnyChunk) {
            registrarExitoGemini(targetModel); // v1.57.12 · respondió: vuelve a ser confiable
            ctx.sendDone(targetModel);
            return;
          }
          if (turnoFinalGemini) {
            // Hubo cierre limpio pero sin texto (p. ej. sólo llamadas a
            // herramientas y ningún resumen): se avisa en vez de quedar mudo.
            const resumen = accionesGemini.length
              ? `\n` + accionesGemini.slice(-8).map((a) => `  • ${a}`).join("\n") +
                (accionesGemini.length > 8 ? `\n  • …y ${accionesGemini.length - 8} acción(es) más` : "")
              : "";
            ctx.sendChunk(resumen ? `✔️ Hecho. Acciones realizadas:${resumen}` : "✔️ Turno completado (sin texto final del modelo).");
            registrarExitoGemini(targetModel); // v1.57.12 · sin texto pero con cierre limpio: el modelo RESPONDIÓ
            ctx.sendDone(targetModel);
            return;
          }
          lastGeminiErr = new Error(`Gemini no emitió tokens para el modelo ${targetModel}`);
         } catch (geminiErr: any) {
          // Si el SDK falló ANTES del primer token, el reloj seguía armado.
          if (relojGemini) clearTimeout(relojGemini);
          // v1.6.19 — «signal is aborted without reason» no le dice nada a nadie.
          // Peor: suena a que el usuario configuró algo mal, cuando el aborto lo
          // provocaba nuestro propio reloj. Si fue eso, se dice en claro.
          const fueNuestroReloj =
            geminiErr?.name === "AbortError" ||
            /abort/i.test(String(geminiErr?.message ?? ""));
          lastGeminiErr = fueNuestroReloj
            ? new Error(
                `Gemini no empezó a responder a tiempo con ${targetModel} y se cortó la espera ` +
                `para no dejarte en blanco. Prueba con otro modelo de la lista, o revisa la conexión.`
              )
            : geminiErr;
          console.warn(`Error en Gemini stream (${targetModel}):`, geminiErr.message);
          registrarFalloGemini(targetModel, lastGeminiErr, Date.now()); // v1.57.12 · 404=muerto, 429=con su retryDelay, 503=5 min de frío
        }
      }
      // 🔧 CORRECCIÓN: si llegamos aquí, todos los modelos candidatos de Gemini fallaron.
      // Enviar error claro en vez de caer al fallback autónomo.
      // ============================================================
      // v2.0 — DIAGNÓSTICO ÚTIL PARA EL PLAN GRATUITO DE GEMINI
      // ------------------------------------------------------------
      // Antes: "verifica que la key sea válida y tengas cuota disponible". Eso no
      // dice nada. Ahora se clasifica el error real y se explica cómo seguir
      // trabajando, porque el plan gratuito de Gemini SÍ tiene un tope diario
      // (recortado de 250 a unas pocas decenas de peticiones al día según los
      // propios foros de Google) y por tanto NO es un motor "sin cuota diaria".
      // ============================================================
      const geminiMsg = String(lastGeminiErr?.message || "");
      const isQuotaErr = /429|RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(geminiMsg);
      const isKeyErr = /400|401|403|API key|API_KEY_INVALID|PERMISSION_DENIED|permission/i.test(geminiMsg);

      const diagnosis = isQuotaErr
        ? "Se agotó la cuota del plan GRATUITO de Gemini.\n" +
          "Ten en cuenta que Google recortó el nivel gratuito: el límite es DIARIO y en la práctica son unas pocas decenas de peticiones al día. No sirve como motor de trabajo intensivo.\n" +
          "Opciones que sí aguantan:\n" +
          "  · GLM-4.7-Flash (Z.ai) — gratis y sin tope diario publicado. Pon tu API key de Z.ai en Config y selecciónalo.\n" +
          "  · Cualquier modelo LOCAL de Ollama — sin cuota de ningún tipo (los tuyos: qwen2.5-coder:1.5b, qwen3:0.6b, smollm2:1.5b)."
        : isKeyErr
        ? "La API key de Gemini no es válida o no tiene permisos.\n" +
          "Genera una nueva en https://aistudio.google.com/apikey (empieza por «AIza») y pégala en Config → Gemini."
        : "No fue cuota ni clave: parece un fallo temporal del servicio. Prueba de nuevo o recorré la LISTA SEGURA (validada en campo): " + lineaDeRelevos();

      // El motor aprende del fallo: queda registrado con su causa
      try {
        learnFromToolFailure("gemini", { model }, JSON.stringify({ ok: false, error: geminiMsg || "sin detalle" }));
      } catch {}

      // v1.56.0 — RELEVO LOCAL: antes de rendirse, intentar terminar el turno
      // con un modelo LOCAL de Ollama (sin internet ni cuota). Si lo logra, el
      // usuario recibe su respuesta en vez de un callejón sin salida.
      const releváronGemini = await relevoLocalTrasFalloNube({
        ctx,
        proveedorFallido: `Gemini (${model})`,
        motivo: geminiMsg || "fallo de red o servicio",
        systemInstruction: consolidatedSystemInstruction,
        history: fullHistory,
        userPrompt: fullUserPrompt,
        temperature,
        pcMode,
        ollamaUrl,
      });
      if (releváronGemini) return;

      ctx.sendError(
        `❌ Gemini no pudo responder con "${model}".\n\n${diagnosis}\n\nDetalle técnico: ${geminiMsg.slice(0, 300) || "desconocido"}${informeFusiblesGemini(uniqueModels)}` + registrarHilanaGemini(geminiMsg)
      );
      return;
    }

    // 4. PROVIDER: OPENROUTER
    if (provider === "openrouter" && openrouterApiKey) {
      let orEnteredAndFailed = false;
      let orFailReason = "";
      try {
        const messagesToSend: any[] = [
          {
            role: "system",
            content: consolidatedSystemInstruction,
          },
        ];

        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        // v1.58.0 — AUDIO vía OpenRouter: a diferencia de Gemini (SDK), OpenRouter
        // es OpenAI-compat y recibe el audio como parte `input_audio` (base64 +
        // `format` en texto plano: wav|mp3). OJO: esto solo lo «escucha» el
        // modelo subyacente si ESE modelo acepta audio (p.ej. los de audio de
        // OpenAI o los Gemini servidos por OpenRouter). Un modelo de solo texto
        // —incluidos casi todos los `:free`— lo ignora o lo rechaza; por eso el
        // adjunto ya trae su aviso honesto en el texto.
        const formatoAudioOR = (mime: string): string => {
          const sub = (mime.split("/")[1] || "").toLowerCase();
          if (sub.includes("mpeg") || sub.includes("mp3") || sub.includes("mpga")) return "mp3";
          if (sub.includes("wav")) return "wav";
          if (sub.includes("flac")) return "flac";
          if (sub.includes("ogg") || sub.includes("opus")) return "ogg";
          if (sub.includes("mp4") || sub.includes("m4a") || sub.includes("aac")) return "m4a";
          return sub || "wav";
        };
        const contenidoUsuarioOR: any =
          base64Audios.length > 0
            ? [
                { type: "text", text: fullUserPrompt },
                ...base64Audios.map((a) => ({
                  type: "input_audio",
                  input_audio: { data: a.data, format: formatoAudioOR(a.mime) },
                })),
              ]
            : fullUserPrompt;
        messagesToSend.push({ role: "user", content: contenidoUsuarioOR });

        const modeloOR = modeloEfectivoTurno;
        // v1.45.0 — BUCLE DE HERRAMIENTAS OpenAI-compat (OpenRouter).
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasOR = herramientasTurno;
        const cicloOR = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openrouterApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: modeloOR, temperature: temperature || 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasOR,
          ejecutarHerramienta: executeToolCall,
          // v1.58.2 — nombres válidos para capturar tool-calls que un modelo
          // free escriba en el TEXTO aunque no se le ofrezcan tools nativas.
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloOR.ok) {
          ctx.sendDone(model);
          return;
        }
        orEnteredAndFailed = true; orFailReason = cicloOR.failReason || "stream vacío (ningún token recibido)";
      } catch (orErr: any) {
        orEnteredAndFailed = true; orFailReason = orErr.message || String(orErr);
        console.warn("Error en OpenRouter stream:", orErr.message);
      }

      // 🔧 CORRECCIÓN CRÍTICA: si OpenRouter falló, NO caer al fallback autónomo
      // silenciosamente — enviar error claro al usuario.
      if (orEnteredAndFailed) {
        // v1.60.4 — ya no se propaga el motivo crudo (p. ej. `401 User not found`); lo humanizamos a ES accionable (clave inválida=config del usuario, no bug).
        ctx.sendError(humanizarErrorProveedor("openrouter", model, orFailReason).mensaje);
        return;
      }
    }

    // 4.5. PROVIDER: CUSTOM SERVER / PROXY (Puerto 5000 u otro endpoint OpenAI/v1 compatible)
    if (provider === "custom" && customServerUrl) {
      let customEnteredAndFailed = false;
      let customFailReason = "";
      try {
        const cleanUrl = customServerUrl.replace(/\/$/, "");
        const endpoint = cleanUrl.endsWith("/chat/completions")
          ? cleanUrl
          : cleanUrl.endsWith("/v1")
          ? `${cleanUrl}/chat/completions`
          : `${cleanUrl}/v1/chat/completions`;

        const messagesToSend: any[] = [
          {
            role: "system",
            content: consolidatedSystemInstruction,
          },
        ];

        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });

        const customHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (customApiKey) {
          customHeaders["Authorization"] = `Bearer ${customApiKey}`;
        }

        const modeloCustom = modeloEfectivoTurno;
        // v1.45.0 — BUCLE DE HERRAMIENTAS OpenAI-compat (Custom / puente :5000).
        // Si el modelo detrás del endpoint es tool-capable (p. ej. GLM/Gemini
        // vía el puente MCP), ahora puede VER/CREAR/EDITAR archivos de la PC de
        // verdad. Si no se reconoce como tool-capable, cae al modo texto de v1.44.
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasCustom = herramientasTurno;
        const cicloCustom = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud(endpoint, {
            method: "POST",
            headers: customHeaders,
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: modeloCustom, temperature: temperature || 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasCustom,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloCustom.ok) {
          ctx.sendDone(model);
          return;
        }
        customEnteredAndFailed = true;
        customFailReason = cicloCustom.failReason || "stream vacío (ningún token recibido)";
      } catch (customErr: any) {
        customEnteredAndFailed = true;
        customFailReason = customErr.message || String(customErr);
        console.warn("Error en Custom Server stream:", customErr.message);
      }

      // 🔧 CORRECCIÓN CRÍTICA: si el Custom Server falló, NO caer al fallback autónomo
      // silenciosamente — enviar error claro al usuario.
      if (customEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "Custom Server: " + String(customFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ Custom Server no pudo responder para el modelo "${model}": ${customFailReason}`);
        return;
      }
    }

    // 4.7. PROVIDER: OPENAI (api.openai.com directo)
    if (provider === "openai") {
      let openaiEnteredAndFailed = false;
      let openaiFailReason = "";
      try {
        if (!openaiApiKey) {
          ctx.sendError(
            `❌ OpenAI requiere API Key. Configúrala en el modal "Ranuras de API Keys" ` +
            `(botón "Abrir Ranuras" en el panel izquierdo), o como variable de entorno ` +
            `OPENAI_API_KEY. Consíguela en https://platform.openai.com/api-keys`
          );
          return;
        }
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        // Soporte de imágenes: si el modelo es vision-capable (gpt-4o, gpt-4o-mini, gpt-4-vision)
        // y hay imágenes adjuntas, las añadimos al último mensaje del usuario como content array.
        const isVisionOpenai = /^gpt-4o|gpt-4-vision/i.test(model);
        const finalUserContent: any = isVisionOpenai && base64Images.length > 0
          ? [
              { type: "text", text: fullUserPrompt },
              ...base64Images.map((b64: string) => ({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${b64}` },
              })),
            ]
          : fullUserPrompt;
        messagesToSend.push({ role: "user", content: finalUserContent });

        const openaiResponse = await fetchCloud("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: messagesToSend,
            stream: true,
            temperature: typeof temperature === "number" ? temperature : 0.5,
          }),
        });

        if (openaiResponse.ok && openaiResponse.body) {
          const emitted = await pipeOpenAICompatibleStream(openaiResponse, ctx);
          if (emitted) {
            ctx.sendDone(model);
            return;
          }
          openaiEnteredAndFailed = true;
          openaiFailReason = "stream vacío (ningún token recibido)";
        } else {
          let errBody = "";
          try { errBody = await openaiResponse.text(); } catch {}
          let openaiErrMsg = `HTTP ${openaiResponse.status}`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson?.error?.message) openaiErrMsg = errJson.error.message;
            else if (errJson?.error) openaiErrMsg = String(errJson.error);
          } catch {}
          openaiEnteredAndFailed = true;
          openaiFailReason = openaiErrMsg + (errBody && !openaiErrMsg.includes(errBody.slice(0, 100)) ? ` (${errBody.slice(0, 200)})` : "");
          console.warn(`[ai/stream] OpenAI devolvió HTTP ${openaiResponse.status}: ${openaiErrMsg}`);
        }
      } catch (openaiErr: any) {
        openaiEnteredAndFailed = true;
        openaiFailReason = openaiErr.message || String(openaiErr);
        console.warn("Error en OpenAI stream:", openaiErr.message);
      }

      if (openaiEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "OpenAI: " + String(openaiFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ OpenAI no pudo responder para el modelo "${model}": ${openaiFailReason}`);
        return;
      }
    }

    // 4.8. PROVIDER: Z.AI (GLM-4.5-Flash, GLM-4-Flash — 100% GRATIS)
    // Z.ai expone un endpoint OpenAI-compatible en https://api.z.ai/api/paas/v4/chat/completions
    if (provider === "zai") {
      if (!zaiApiKey) {
        // v1.1 — Modo DEMO amistoso: en lugar de errorar, respondemos con un mensaje
        // útil que explica cómo obtener la clave gratuita en 30 segundos. Así el chat
        // no parece "roto" y el usuario sabe qué hacer.
        const demoMessage =
          `## 🧠 GLM-4.5-Flash — Tu modelo gratuito está listo\n\n` +
          // v0.9 — Aquí ponía «**CerebroNico V1**» a mano: un literal de versión
          // en TEXTO QUE EL USUARIO LEE, y encima con una versión que ya no
          // existía. Es el mismo defecto que la discrepancia «cabecera V8.0.0 /
          // menú CN V1.0.3», en un sitio donde nadie lo iba a buscar: el saludo
          // del modo demo. Ahora sale de la fuente única.
          `Hola, soy el modo demo de **${IDE_BRAND.FULL_NAME}**. El motor **GLM-4.5-Flash de Z.ai** ya está preconfigurado como predeterminado, ` +
          `pero para empezar a chatear de verdad necesitas pegar tu **clave API gratuita**.\n\n` +
          `### Por qué Z.ai + GLM-4.5-Flash\n` +
          `- ✅ **100% gratuito** con generosos límites diarios.\n` +
          `- ✅ **Sin tarjeta de crédito** (solo email + verificación SMS).\n` +
          `- ✅ **128K de contexto** — suficiente para archivos enteros.\n` +
          `- ✅ **Responde en español** de forma natural.\n\n` +
          `### Cómo activarlo en 30 segundos\n\n` +
          `1. **Abre** 👉 [https://z.ai/manage/apikey](https://z.ai/manage/apikey) en una pestaña nueva.\n` +
          `2. **Regístrate** con tu email y verifica tu teléfono (recibirás un SMS).\n` +
          `3. **Copia** la clave que aparece (formato como \`xxxxxxxx.xxxxxxxxxxxxxxxx\`).\n` +
          `4. En CerebroNico, clic en el botón **"Ranuras API"** del panel izquierdo (o en el menú **CN → Ranuras API**).\n` +
          `5. Pega tu clave en el campo destacado en violeta **"0. Z.ai (GLM)"**.\n` +
          `6. ¡Listo! Vuelve a escribir aquí y te responderá GLM-4.5-Flash en tiempo real.\n\n` +
          `> 💡 La clave se guarda **solo en tu navegador** (localStorage). No se comparte ni se envía a terceros.\n\n` +
          `### ¿Quieres probar otros modelos gratis?\n\n` +
          `Si ya tienes claves de **Groq** (Llama 3.3 70B), **Gemini** (Flash), **OpenRouter** (DeepSeek R1:free), ` +
          `**Cerebras**, **Together AI**, **Mistral** o **Fireworks**, puedes pegarlas también en **Ranuras API** ` +
          `y seleccionar el modelo desde el **selector de modelos** (botón con el nombre del modelo arriba).\n\n` +
          `---\n*Vuelve a escribir tu consulta después de pegar tu clave gratuita de Z.ai.*`;
        ctx.sendChunk(demoMessage);
        ctx.sendDone("glm-4.5-flash (modo demo)");
        return;
      }
      let zaiEnteredAndFailed = false;
      let zaiFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        // Soporte de visión para GLM-4.5V-Flash (modelo multimodal gratuito):
        const isZaiVision = /glm-4\.5v|glm-4v|vision/i.test(model);
        // v1.52.6 — BUGFIX: «Z.ai falla con Prompt exceeds max length».
        // Las imágenes base64 PNG (~1.4 MB cada una) desbordan el límite de
        // prompt de Z.ai. Para modelos cloud-fast, solo se envía 1 imagen.
        const maxImgsZai = (getProfile(model).nubeRapida) ? 1 : base64Images.length;
        const imgsZai = base64Images.slice(0, maxImgsZai);
        const finalUserContent: any = isZaiVision && imgsZai.length > 0
          ? [
              { type: "text", text: fullUserPrompt },
              ...imgsZai.map((b64: string) => ({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${b64}` },
              })),
            ]
          : fullUserPrompt;
        messagesToSend.push({ role: "user", content: finalUserContent });

        // Modelo por defecto: GLM-4.5-Flash (gratis, veloz, capaz).
        const targetModel = modeloEfectivoTurno; // defecto 4: glm-4.5-flash

        // v1.45.0 — BUCLE DE HERRAMIENTAS OpenAI-compat (Z.ai/GLM). Antes esta
        // rama sólo transmitía texto; ahora, si el modelo es tool-capable, pasa
        // `tools` y ejecuta el MISMO executeToolCall del bucle de Ollama/Gemini.
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasZai = herramientasTurno;
        const cicloZai = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://api.z.ai/api/paas/v4/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${zaiApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: targetModel, temperature: typeof temperature === "number" ? temperature : 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasZai,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloZai.ok) {
          ctx.sendDone(targetModel);
          return;
        }
        zaiEnteredAndFailed = true;
        zaiFailReason = cicloZai.failReason || "stream vacío (ningún token recibido)";
      } catch (zaiErr: any) {
        zaiEnteredAndFailed = true;
        zaiFailReason = zaiErr.message || String(zaiErr);
        console.warn("Error en Z.ai stream:", zaiErr.message);
      }
      if (zaiEnteredAndFailed) {
        // v1.56.0 — RELEVO LOCAL antes de rendirse (Z.ai/GLM cayó por red/cuota).
        const relevaronZai = await relevoLocalTrasFalloNube({
          ctx,
          proveedorFallido: `Z.ai/GLM (${model})`,
          motivo: zaiFailReason || "fallo de red o servicio",
          systemInstruction: consolidatedSystemInstruction,
          history: fullHistory,
          userPrompt: fullUserPrompt,
          temperature,
          pcMode,
          ollamaUrl,
        });
        if (relevaronZai) return;
        registrarHilanaCorte(objetivoTurnoQf, "Z.ai: " + String(zaiFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ Z.ai no pudo responder para el modelo "${model}": ${zaiFailReason}`);
        return;
      }
    }

    // 4.9. PROVIDER: GROQ (ultra-rápido, tier gratuito)
    if (provider === "groq") {
      if (!groqApiKey) {
        ctx.sendError(
          `❌ Groq requiere API Key. Consíguela GRATIS en https://console.groq.com/keys ` +
          `(tier gratuito con rate limits generosos).`
        );
        return;
      }
      let groqEnteredAndFailed = false;
      let groqFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = modeloEfectivoTurno; // defecto 4: llama-3.3-70b-versatile
        // v1.45.0 — BUCLE DE HERRAMIENTAS OpenAI-compat (Groq).
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasGroq = herramientasTurno;
        const cicloGroq = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: targetModel, temperature: typeof temperature === "number" ? temperature : 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasGroq,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloGroq.ok) { ctx.sendDone(targetModel); return; }
        groqEnteredAndFailed = true;
        groqFailReason = cicloGroq.failReason || "stream vacío (ningún token recibido)";
      } catch (groqErr: any) {
        groqEnteredAndFailed = true;
        groqFailReason = groqErr.message || String(groqErr);
        console.warn("Error en Groq stream:", groqErr.message);
      }
      if (groqEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "Groq: " + String(groqFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ Groq no pudo responder para el modelo "${model}": ${groqFailReason}`);
        return;
      }
    }

    // 4.10. PROVIDER: CEREBRAS (ultra-rápido, beta gratuita)
    if (provider === "cerebras") {
      if (!cerebrasApiKey) {
        ctx.sendError(
          `❌ Cerebras requiere API Key. Consíguela GRATIS en https://cloud.cerebras.ai ` +
          `(tier gratuito durante la beta).`
        );
        return;
      }
      let cerebrasEnteredAndFailed = false;
      let cerebrasFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = modeloEfectivoTurno; // defecto 4: llama3.1-8b
        // v1.58.4 — BUCLE DE HERRAMIENTAS OpenAI-compat (Cerebras): antes usaba
        //   pipeOpenAICompatibleStream (paso directo), sin bucle de herramientas ni
        //   reanudación por corte de tokens (finish_reason:"length"), así que una
        //   respuesta larga se cortaba a la mitad y se perdía. Ahora pasa por el
        //   mismo ciclo que Groq/Z.ai, que continua donde quedó y ejecuta tools.
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasCerebras = herramientasTurno;
        const cicloCerebras = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://api.cerebras.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cerebrasApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: targetModel, temperature: typeof temperature === "number" ? temperature : 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasCerebras,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloCerebras.ok) { ctx.sendDone(targetModel); return; }
        cerebrasEnteredAndFailed = true;
        cerebrasFailReason = cicloCerebras.failReason || "stream vacío (ningún token recibido)";
      } catch (cerebrasErr: any) {
        cerebrasEnteredAndFailed = true;
        cerebrasFailReason = cerebrasErr.message || String(cerebrasErr);
        console.warn("Error en Cerebras stream:", cerebrasErr.message);
      }
      if (cerebrasEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "Cerebras: " + String(cerebrasFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ Cerebras no pudo responder para el modelo "${model}": ${cerebrasFailReason}`);
        return;
      }
    }

    // 4.11. PROVIDER: TOGETHER AI ($5 crédito gratuito)
    if (provider === "together") {
      if (!togetherApiKey) {
        ctx.sendError(
          `❌ Together AI requiere API Key. Consíguela en https://api.together.xyz/settings/api-keys ` +
          `($5 de crédito gratuito al registrarse).`
        );
        return;
      }
      let togetherEnteredAndFailed = false;
      let togetherFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = modeloEfectivoTurno; // defecto 4: meta-llama/Llama-3.3-70B-Instruct-Turbo-Free
        // v1.58.4 — BUCLE DE HERRAMIENTAS OpenAI-compat (Together): igual que
        //   Cerebras, sale del paso directo para ganar reanudación anti-corte y tools.
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasTogether = herramientasTurno;
        const cicloTogether = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://api.together.xyz/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${togetherApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: targetModel, temperature: typeof temperature === "number" ? temperature : 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasTogether,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloTogether.ok) { ctx.sendDone(targetModel); return; }
        togetherEnteredAndFailed = true;
        togetherFailReason = cicloTogether.failReason || "stream vacío (ningún token recibido)";
      } catch (togetherErr: any) {
        togetherEnteredAndFailed = true;
        togetherFailReason = togetherErr.message || String(togetherErr);
        console.warn("Error en Together stream:", togetherErr.message);
      }
      if (togetherEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "Together AI: " + String(togetherFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ Together AI no pudo responder para el modelo "${model}": ${togetherFailReason}`);
        return;
      }
    }

    // 4.12. PROVIDER: MISTRAL AI (tier gratuito)
    if (provider === "mistral") {
      if (!mistralApiKey) {
        ctx.sendError(
          `❌ Mistral AI requiere API Key. Consíguela en https://console.mistral.ai/api-keys ` +
          `(tier gratuito con rate limits).`
        );
        return;
      }
      let mistralEnteredAndFailed = false;
      let mistralFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = modeloEfectivoTurno; // defecto 4: mistral-small-latest
        // v1.58.4 — BUCLE DE HERRAMIENTAS OpenAI-compat (Mistral): sale del paso
        //   directo para ganar reanudación anti-corte y ejecución de herramientas.
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasMistral = herramientasTurno;
        const cicloMistral = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${mistralApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: targetModel, temperature: typeof temperature === "number" ? temperature : 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasMistral,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloMistral.ok) { ctx.sendDone(targetModel); return; }
        mistralEnteredAndFailed = true;
        mistralFailReason = cicloMistral.failReason || "stream vacío (ningún token recibido)";
      } catch (mistralErr: any) {
        mistralEnteredAndFailed = true;
        mistralFailReason = mistralErr.message || String(mistralErr);
        console.warn("Error en Mistral stream:", mistralErr.message);
      }
      if (mistralEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "Mistral: " + String(mistralFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ Mistral no pudo responder para el modelo "${model}": ${mistralFailReason}`);
        return;
      }
    }

    // 4.13. PROVIDER: DEEPSEEK (muy económico, casi gratis)
    if (provider === "deepseek") {
      if (!deepseekApiKey) {
        ctx.sendError(
          `❌ DeepSeek requiere API Key. Consíguela en https://platform.deepseek.com/api_keys ` +
          `(muy económico, casi gratis).`
        );
        return;
      }
      let deepseekEnteredAndFailed = false;
      let deepseekFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = modeloEfectivoTurno; // defecto 4: deepseek-chat
        // v1.58.4 — BUCLE DE HERRAMIENTAS OpenAI-compat (DeepSeek): sale del paso
        //   directo para ganar reanudación anti-corte y ejecución de herramientas.
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasDeepseek = herramientasTurno;
        const cicloDeepseek = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${deepseekApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: targetModel, temperature: typeof temperature === "number" ? temperature : 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasDeepseek,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloDeepseek.ok) { ctx.sendDone(targetModel); return; }
        deepseekEnteredAndFailed = true;
        deepseekFailReason = cicloDeepseek.failReason || "stream vacío (ningún token recibido)";
      } catch (deepseekErr: any) {
        deepseekEnteredAndFailed = true;
        deepseekFailReason = deepseekErr.message || String(deepseekErr);
        console.warn("Error en DeepSeek stream:", deepseekErr.message);
      }
      if (deepseekEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "DeepSeek: " + String(deepseekFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ DeepSeek no pudo responder para el modelo "${model}": ${deepseekFailReason}`);
        return;
      }
    }

    // 4.14. PROVIDER: FIREWORKS AI ($1 crédito gratuito)
    if (provider === "fireworks") {
      if (!fireworksApiKey) {
        ctx.sendError(
          `❌ Fireworks AI requiere API Key. Consíguela en https://fireworks.ai/account/api-keys ` +
          `($1 de crédito gratuito al registrarse).`
        );
        return;
      }
      let fireworksEnteredAndFailed = false;
      let fireworksFailReason = "";
      try {
        const messagesToSend: any[] = [
          { role: "system", content: consolidatedSystemInstruction },
        ];
        for (const h of fullHistory) {
          if (h.role && h.content) {
            messagesToSend.push({ role: h.role, content: h.content });
          }
        }
        messagesToSend.push({ role: "user", content: fullUserPrompt });
        const targetModel = modeloEfectivoTurno; // defecto 4: accounts/fireworks/models/llama-v3p1-70b-instruct
        // v1.58.4 — BUCLE DE HERRAMIENTAS OpenAI-compat (Fireworks): sale del paso
        //   directo para ganar reanudación anti-corte y ejecución de herramientas.
// v1.68.0 · defecto 4: MISMO conjunto que el manual inyectado (herramientasTurno)
        const herramientasFireworks = herramientasTurno;
        const cicloFireworks = await ejecutarCicloHerramientasOpenAICompat({
          doFetch: (cuerpo) => fetchCloud("https://api.fireworks.ai/inference/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${fireworksApiKey}`,
            },
            body: JSON.stringify(cuerpo),
          }),
          cuerpoBase: { model: targetModel, temperature: typeof temperature === "number" ? temperature : 0.5 },
          mensajes: messagesToSend,
          herramientas: herramientasFireworks,
          ejecutarHerramienta: executeToolCall,
          nombresHerramientas: getAllToolNames(),
          ctx,
        });
        if (cicloFireworks.ok) { ctx.sendDone(targetModel); return; }
        fireworksEnteredAndFailed = true;
        fireworksFailReason = cicloFireworks.failReason || "stream vacío (ningún token recibido)";
      } catch (fireworksErr: any) {
        fireworksEnteredAndFailed = true;
        fireworksFailReason = fireworksErr.message || String(fireworksErr);
        console.warn("Error en Fireworks stream:", fireworksErr.message);
      }
      if (fireworksEnteredAndFailed) {
        registrarHilanaCorte(objetivoTurnoQf, "Fireworks: " + String(fireworksFailReason || "").slice(0, 200)); // v1.0.12 · el corte no borra el hilo // v1.0.12 · el corte no borra el hilo
        ctx.sendError(`❌ Fireworks no pudo responder para el modelo "${model}": ${fireworksFailReason}`);
        return;
      }
    }

    // 5. PROVIDER: OLLAMA LOCAL
    if (provider === "ollama") {
      const targetUrl = (ollamaUrl || OLLAMA_DEFAULT).replace(/\/$/, "");
      // 🔧 v1.43.0 — BUGFIX ".ollama" SUFFIX: algo (proveedorParaModelo o la UI)
      // puede añadir ".ollama" al nombre del modelo; Ollama NO lo reconoce y devuelve 404.
      // Se hace strip del sufijo ANTES de enviar el request, pero solo para Ollama.
      const modelForOllama = modeloEfectivoTurno;
      // v1.57.19 · F2: intento vigente, tope de rescates por turno e inventario real.
      let modeloEnVuelo = modelForOllama, pivotesUsados = 0;
      const inventarioLocal: InventarioLocal = await cargarInventarioLocal(targetUrl); // v1.57.19 · F2: catálogo + CARGADOS (/api/ps)

      // v1.46.0 — PREFLIGHT DEL MODELO LOCAL (el 404 deja de ser un callejón):
      // se le pregunta a Ollama qué tiene de verdad antes de enviar y, si el
      // nombre no está, se dice cuál se parece. Vive en `preflightLocal.ts`
      // porque el monolito tiene trinquete («la Fase 2 es partir, no añadir»).
      const preflight = await preflightModeloOllama(targetUrl, modelForOllama, fetch, base64Images.length > 0); // v1.57.12 · el preflight sabe si ESTE turno trae imágenes
      ctx.setAvisoSilencio(consejoSilencioLocal(modelForOllama)); // v1.57.12 · si el watchdog corta, el consejo es DEL modelo elegido (un OCR no es un problema de tu clave de Google)
      if (!preflight.ok) {
        ctx.sendError(preflight.mensaje);
        return;
      }

      // v1.57.18/19 · El reloj del primer byte usa el presupuesto medido de ESTE modelo y el
      // fusible universal corta el reintento silencioso (la sesión de Z.ai quemó 17 min así).
      const relojLocal = relojDeModeloLocal(modelForOllama, inventarioLocal); ctx.setRelojDePrimerByte(relojLocal.ms, relojLocal.etiqueta); // v1.57.18/19 · v1.66.1: carga fría declarada por /api/ps
      const pausaLocal = notaDeCuarentenaLocal(modelForOllama); // v1.57.19 · F2: la guarda vive en pivotEnVivo
      if (pausaLocal) { ctx.sendError(pausaLocal); return; }

      // v1.56.4 — ADMISIÓN POR RAM (aviso NO bloqueante, en la RAÍZ):
      // el modelo YA pasó el preflight de existencia; ahora, con el tamaño que
      // Ollama reporta en /api/tags y la RAM libre real, se estima si de verdad
      // cabe. Esto ataca la CAUSA del cuelgue del Dell de 8 GB de Mario (cargar
      // un modelo que no entra → swap → minutos de espera) en lugar de cortarlo
      // tarde con el watchdog. NO bloquea (misma filosofía que preflightLocal):
      // solo deja el veredicto honesto en el log del servidor. Todo va dentro de
      // un try/catch que, ante cualquier fallo o lentitud, NO opina y sigue.
      try {
        const rTags = await fetch(`${targetUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
        if (rTags.ok) {
          const dTags: any = await rTags.json();

          const sinTag = (s: string) => String(s).toLowerCase().replace(/:latest$/, "");
          const buscado = sinTag(modelForOllama);
          const hit = (dTags?.models || []).find((m: any) => {
            const n = String(m?.name || m?.model || "");
            return sinTag(n) === buscado || n.toLowerCase() === modelForOllama.toLowerCase();
          });
          const tamModeloBytes = Number(hit?.size) || 0;
          if (tamModeloBytes > 0) {
            const adm = evaluarAdmisionRam({
              ramLibreGb: os.freemem() / 1024 ** 3,
              ramTotalGb: RAM_GB,
              tamModeloBytes,
              modelo: modelForOllama,
            });
            if (adm.nivel !== "ok") {
              console.warn(
                `[CerebroNico] 🧠 Admisión RAM [${adm.nivel}] ${adm.mensaje}` +
                (adm.sugerencia ? ` — ${adm.sugerencia}` : "") +
                ` (aviso NO bloqueante; la decisión final es tuya).`
              );
            }
          }
        }
      } catch {
        /* Ollama caído/lento o respuesta rara: no se opina, se sigue igual. */
      }

      const isVision = isVisionModelName(modelForOllama);

      // v2.0 — Perfil de rendimiento: decide contexto, tope de salida, hilos y
      // si este modelo puede usar herramientas. Es la pieza que evita que un
      // modelo de 250 MB entre al bucle de agente y deje la UI sin responder.
      const profile = getProfile(modelForOllama);

      // ============================================================
      // v1.56.3 — MODO LIVIANO LOCAL (selección MANUAL de un modelo chico)
      // ------------------------------------------------------------
      // Reporte de Mario (Dell E6430, 8 GB, sin GPU): eligió a mano modelos
      // LOCALES chicos y: `llama3.2:1b` colgó la PC; `qwen2.5:0.5b` y
      // `gemma3:270m` contestaron pero tardando MÁS DE UN MINUTO. En su
      // terminal, `ollama run <modelo>` responde en segundos. La diferencia NO
      // es el modelo: es el PROMPT. La IDE le armaba un system pesado (ley del
      // cerebro + conocimiento del motor + archivos de contexto + símbolos) y,
      // aunque ya se recorta por tramo, para un micro-modelo en CPU eso son
      // miles de tokens que procesar ANTES de la primera palabra → minutos de
      // espera y memoria que se va a swap (lo que colgaba la máquina).
      //
      // Solución: cuando el usuario elige a mano un modelo chico en un equipo
      // con poca RAM, se le habla como en la terminal — system de UNA línea,
      // SIN herramientas y con contexto mínimo. Es el mismo recetario que ya
      // usa el relevo automático (relevoLocalTrasFalloNube).
      // v1.57.1 · sin-manos-no-narras — la decisión se fue a modelTiers en
      // modoLivianoLocal(): un modelo de NUBE nunca está liviano (su cómputo no
      // toca esta máquina; la IIFE vieja le apagaba las tools a NEMESIS en PCs de
      // ≤8 GB) y el env CN_LOCAL_LIVIANO=1/=0 sigue mandando sobre todo.
      // ============================================================
      const localLiviano = modoLivianoLocal(profile, RAM_GB);
      const sysLivianoLocal =
        `Eres el asistente de CerebroNico. Respondé de forma clara, breve y útil, en el mismo idioma del usuario. ` +
        `Hoy es ${fechaDelSistema}, ${horaDelSistema}.`;
      if (localLiviano) {
        console.warn(
          `[CerebroNico] 🪨 Modo LIVIANO local para "${modelForOllama}" (RAM≈${RAM_GB} GB, tramo ${profile.tier}): ` +
          `system corto, SIN herramientas y contexto mínimo — como en tu terminal, para que no tarde ni cuelgue. ` +
          `Se apaga con CN_LOCAL_LIVIANO=0.`
        );
      }

      const activeTools = localLiviano ? [] : herramientasTurno; // v1.68.0 · el mismo conjunto del manual

      const messagesPayload: any[] = [];

      // Add main system instruction
      if (consolidatedSystemInstruction) {
        // v1.56.3 — en modo liviano local se descarta el system pesado y se usa
        // el de UNA línea: eso es lo que hace que responda en segundos y no
        // ahogue la RAM (igual que la terminal del usuario).
        let sysContent = localLiviano ? sysLivianoLocal : consolidatedSystemInstruction;
        if (activeTools.length > 0) {
          sysContent +=
            "\n\n[PROTOCOLO DE AGENTE AUTÓNOMO]\n" +
            // v1.68.0 · la lista de nombres NO se repite aquí: el catálogo completo
            // ya viajó en [HERRAMIENTAS DE ESTE TURNO] (P0). Repetirlo costaba ~600
            // caracteres en el modelo local, que es justo el que menos margen tiene.
            "- Tus herramientas son EXACTAMENTE las nombradas en HERRAMIENTAS DE ESTE TURNO: no inventes otras.\n" +
            "- ANTES de actuar, define un plan con set_plan (tareas cortas y accionables, cada una con id y descripción).\n" +
            "- Ejecuta paso a paso y actualiza el estado con update_task (pending | in_progress | completed).\n" +
            "- Para retoques usa edit_file (buscar/reemplazar), no reescribas el archivo entero.\n" +
            "- ANTES de declarar terminada una mejora, CIERRA con revisar_cambios (el Quirófano juzga sintaxis, API pública e imports) y run_tests. Si algo sale rojo, corrige y vuelve a verificar: no des nada por bueno en rojo.";
        } else {
          // v1.57.1 · sin-manos-no-narras — LA GUARDA CUBRE EL AGUJERO, NO AL MODELO.
          // Antes solo hablaba si tier micro/tiny: un modelo nube renombrado que
          // caía sin tools por la RAM del equipo quedaba en limbo — sin herramientas
          // Y sin orden de admitirlo — y narraba ✔ falsos (sesión 2026-10-12, 29
          // mensajes). Ahora se aplica a TODO turno con activeTools.length === 0,
          // incluido el system de una línea del modo liviano. El texto vive en
          // src/engine/ejecucionFantasma.ts (guardaSinHerramientas).
          sysContent += "\n\n" + guardaSinHerramientas();
        }

        // ============================================================
        // V8 · D1 — el CONOCIMIENTO DEL MOTOR (KB + manual de herramientas +
        // símbolos reales + equipo espejo activo) ya se inyectó en el punto
        // central multi-proveedor ANTES de las ramas. Aquí solo quedan los
        // protocolos de comportamiento específicos del conductor Ollama.
        // (En v2.x esto vivía solo en la rama Ollama: la nube no recibía el
        //  motor — violaba la tesis "el conocimiento vive en el motor").
        // ============================================================
        if (pcMode && activeTools.length > 0) {
          sysContent +=
            "\n\n[PROTOCOLO DE AGENTE PC — puente :5000 ACTIVO]\n" +
            "El usuario activó el 'Modo Agente PC'. AHORA puedes ejecutar acciones REALES en la PC del usuario a través de las herramientas pc_*.\n" +
            "- ANTES de tocar archivos, llama a pc_info para conocer las rutas reales (OS, Escritorio/Desktop, home, usuario).\n" +
            "- Para CREAR un archivo usa SIEMPRE pc_write_file (no uses pc_exec con echo: es más fiable y evita problemas de codificación). Usa atajos tipo 'Desktop/archivo.txt' o rutas absolutas que devuelva pc_info.\n" +
            "- Para EJECUTAR comandos reales usa pc_exec. Para LISTAR usa pc_list_dir. Para LEER usa pc_read_file.\n" +
            "- pc_delete es DESTRUCTIVA: úsala SOLO si el usuario lo pidió explícitamente.\n" +
            "- Tras cada acción, verifica el resultado (pc_read_file / pc_list_dir) y reporta al usuario el contenido exacto y la ruta del archivo creado/modificado, para que lo pueda confirmar.\n" +
            "- Las herramientas list_files/read_file/write_file/run_command (sin prefijo pc_) operan SOLO dentro del sandbox .proyectos. Para la PC real usa SIEMPRE las herramientas pc_*.";
        }
        messagesPayload.push({ role: "system", content: sysContent });
      }

      // Add full history messages
      // v2.0 — Defensa final del contexto: aunque el cliente ya acota el
      // historial, aquí se vuelve a recortar al presupuesto del modelo. Con un
      // modelo diminuto, un prompt de 8.000 tokens son MINUTOS de espera en CPU;
      // no es un detalle estético.
      // v1.56.3 — en modo liviano local, el presupuesto de contexto se recorta
      // MÁS todavía (como el relevo): menos historial = menos tokens que
      // procesar en CPU = respuesta en segundos.
      const presupuestoCharsOllama = localLiviano
        ? Math.min(profile.contextCharBudget, 2500)
        : profile.contextCharBudget;
      const turnosHistOllama = localLiviano
        ? Math.min(profile.historyTurns, 2)
        : profile.historyTurns;
      const trimmedHistory = trimMessagesToBudget(
        fullHistory
          .filter((h: any) => h?.role && h?.content)
          .map((h: any) => ({ role: String(h.role), content: String(h.content) })),
        presupuestoCharsOllama,
        turnosHistOllama
      );
      for (const h of trimmedHistory.messages) {
        messagesPayload.push({ role: h.role, content: h.content });
      }

      const userMsg: any = {
        role: "user",
        content: fullUserPrompt,
      };

      if (base64Images.length > 0 && isVision) {
        userMsg.images = base64Images;
      }

      messagesPayload.push(userMsg);

      // v1.0.15/1.0.16 · ANTES de cualquier /api/chat (agente o streaming directo): system-first + ventana-que-crece + recorte a num_ctx en un paso (sanearYVentana). Evita el «System message must be at the beginning» de qwen3.5 y el 500 por contexto desbordado. Se muta el array EN SITIO (es const) para que agente y streaming usen la versión saneada.
      {
        const opcOllama = buildOllamaOptions(modelForOllama, typeof temperature === "number" ? temperature : profile.temperature, CPU_CORES, RAM_GB);
        // v1.0.19 · EN MODO LIVIANO LA VENTANA NO CRECE: en CPU cada token de prompt extra se paga en el prefill (~165 s observados). Se respeta num_ctx del perfil y se recorta ahí.
        const saneados = sanearYVentana(messagesPayload, opcOllama as any, localLiviano ? undefined : TOPE_CTX_RAM, (m) => console.log(m));
        messagesPayload.splice(0, messagesPayload.length, ...saneados);
        (ctx as any).declararVentana?.(Number((opcOllama as any).num_ctx) || profile.numCtx, modelForOllama); // v1.0.20 · la ventana CON LA QUE SE SALIÓ viaja al done: aviso con prompt_eval_count real
      }

      // Bucle de agente con llamada a herramientas.
      // v2.0 — `activeTools` ya viene filtrado por el perfil: si el modelo es
      // diminuto, la lista está vacía y se salta directo al streaming (antes
      // entraba igual y se colgaba intentando tool-calls que no sabe hacer).
      if (activeTools.length > 0) {
        const agentText = await runOllamaAgentLoop(
          targetUrl,
          modelForOllama,
          messagesPayload,
          // v1.57.4 · FASE 5 — modo AGENTE a 0.4 por defecto; se respeta temp explícita.
          temperaturaModoAgente(req.body?.temperature),
          () => ctx.isAborted(),
          (ev: any) => ctx.sendTaskEvent(ev),
          activeTools
        );
        if (agentText !== null) { await enviarEnTrozos(ctx, agentText); ctx.sendDone(model); return; } // v1.57.19 · F2: el troceo vive en server/pivotEnVivo.ts
      }

      intentoDelTurno: while (true) { // v1.57.19 · F2 EL PIVOT: si el modelo local falla sin entregar texto, se reintenta con el mejor candidato MEDIDO (mismo pedido, mismo contexto)
        let response: any = null;
        let lastOllamaError: any = null;
        let lastOllamaErrorBody: string | null = null;

        // Robust reconnection: retry the Ollama connection up to 3 times on transient failures
        const maxOllamaAttempts = OLLAMA_MAX_CONNECT_ATTEMPTS;
        for (let attempt = 0; attempt < maxOllamaAttempts; attempt++) {
          if (ctx.isAborted()) break;

          const fetchController = new AbortController();
          const timeoutId = setTimeout(() => fetchController.abort(), OLLAMA_CONNECT_TIMEOUT_MS);

          // 🔧 CORRECCIÓN: ELIMINADO el `req.on("close")` duplicado que había aquí.
          // Se disparaba al recibir el body (antes del primer token) y abortaba el fetch
          // al instante. El `res.on("close")` global (en StreamContext) ya cubre la
          // desconexión real del cliente, y aquí solo necesitamos respetar `ctx.isAborted()`
          // en cada iteración.

          try {
            response = await fetch(`${targetUrl}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: fetchController.signal,
              body: JSON.stringify({
                model: modeloEnVuelo,
                messages: messagesPayload,
                stream: true,
                // keep_alive: el modelo queda cargado en RAM (escalera MR: 3m/5m/0) — sin esto, cada
                // mensaje recarga los pesos y la UI parece "colgada en inferencia".
                // v2.0: además se envían num_ctx / num_predict / num_batch / num_thread
                // calculados por el perfil del modelo (buildOllamaOptions), porque
                // num_ctx fijo a 8192 con un modelo de 250 MB solo sirve para que la
                // CPU procese contexto que el modelo no aprovecha.
                keep_alive: profile.keepAlive,
                options: buildOllamaOptions(
                  modelForOllama,
                  typeof temperature === "number" ? temperature : profile.temperature,
                  CPU_CORES,
                  RAM_GB
                ),
              }),
            });

            if (response.ok) {
              break;
            }

            // 🔧 CORRECCIÓN CRÍTICA: capturar SIEMPRE el body del error de Ollama.
            // Antes, un 404 ("model not found") o 400 ("model not loaded") caía silenciosamente
            // al fallback autónomo y el usuario pensaba que el modelo contestaba cuando en realidad
            // respondía el fallback automático. Ahora leemos el body, lo guardamos y lo enviamos
            // al cliente como error claro.
            let errBody = "";
            try {
              errBody = await response.text();
            } catch {}
            lastOllamaErrorBody = errBody.slice(0, 500);
            // Intentar extraer el campo "error" del JSON
            let ollamaErrMsg = `HTTP ${response.status}`;
            try {
              const errJson = JSON.parse(errBody);
              if (errJson && typeof errJson.error === "string") {
                ollamaErrMsg = errJson.error;
              }
            } catch {}
            lastOllamaError = new Error(`HTTP ${response.status}: ${ollamaErrMsg}`);

            // Retryable status -> reconnect after a short instant backoff. v1.70.2: EXCEPTO el 429 «Free usage limit» de Ollama Cloud — tope de cuenta, no pico transitorio (CHANGELOG-v1.70.2 §6).
            if (RETRYABLE_HTTP_STATUS.has(response.status) && !/free usage limit|usage limit reached|ollama\.com\/upgrade/i.test(ollamaErrMsg)) {
              console.warn(`[ai/stream] Ollama devolvió HTTP ${response.status} (intentos ${attempt + 1}/${maxOllamaAttempts}): ${ollamaErrMsg}`);
              response = null;
              await sleepMs(150 * (attempt + 1));
              continue;
            }

            // Non-retryable (e.g. 404 model not found, 400 bad request): stop retrying.
            // 🔧 Ya capturamos el mensaje arriba — el handler de abajo lo enviará al cliente.
            console.warn(`[ai/stream] Ollama devolvió error no-reintentable HTTP ${response.status}: ${ollamaErrMsg}`);
            break;
          } catch (ollamaFetchErr: any) {
            lastOllamaError = ollamaFetchErr;
            lastOllamaErrorBody = ollamaFetchErr.message || String(ollamaFetchErr);
            response = null;
            if (attempt < maxOllamaAttempts - 1) {
              // OLLAMA v2 — «nada rompa la comunicación»: un ECONNREFUSED casi siempre
              // es Ollama ARRANCANDO (8 GB, disco lento), no un cable suelto. Con 150 ms
              // de espera se quemaban los 3 intentos en medio segundo y el usuario veía
              // «conexión interrumpida» cuando nadie interrumpió nada. Espera real:
              // 2 s, 4 s, 6 s. Solo el cambio de modelo aborta (a propósito, por el usuario).
              const negativa = /ECONNREFUSED|EADDRNOTAVAIL|ENOTFOUND|fetch failed|Could not connect|SocketError/i.test(String(ollamaFetchErr?.message || ollamaFetchErr));
              await sleepMs(negativa ? 2000 * (attempt + 1) : 150 * (attempt + 1));
            }
          } finally {
            clearTimeout(timeoutId);
          }
        }

        // 🔧 CORRECCIÓN CRÍTICA: si Ollama respondió con error (no OK) o nunca respondió,
        // enviar el error al cliente en vez de caer silenciosamente al fallback autónomo.
        // El fallback solo debe usarse si NINGÚN provider fue configurado/probado.
        const ollamaBranchEntered = (response !== null) || (lastOllamaError !== null);
        if (ollamaBranchEntered && !(response && response.ok && response.body)) {
          const crudoReason = lastOllamaError?.message || lastOllamaErrorBody || "razón desconocida";
          // v1.46.4 — no filtrar «signal is aborted without reason» crudo al chat:
          // se traduce igual que en el catch exterior (cambio de modelo/cancelación).
          const reason = mensajeLegibleDeError(crudoReason, lastOllamaError?.name) || crudoReason;
          const hint = /not found|not loaded|pull/i.test(crudoReason)
            ? ` Ejecuta \`ollama pull ${modelForOllama}\` para descargarlo, o elige otro modelo en la UI.`
            : /ECONNREFUSED|fetch failed|aborted/i.test(crudoReason)
            ? ` Verifica que Ollama esté corriendo en ${targetUrl} (\`ollama serve\`).`
            : "";
          ctx.sendError(`❌ Ollama no pudo responder para el modelo "${modelForOllama}": ${reason}.${hint}`);
          return;
        }

        if (response && response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let timedOut = false;

          // 🔧 CORRECCIÓN: timeout de inactividad REAL.
          // Antes el setTimeout(120s) nunca se limpiaba al llegar cada chunk, así que
          // cortaba cualquier generación local a los 120s aunque los tokens siguieran
          // fluyendo. Ahora el timer se reinicia en cada chunk: solo dispara si pasan
          // 120s SIN recibir nada nuevo.
          let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
          const clearInactivityTimer = () => {
            if (inactivityTimer !== null) {
              clearTimeout(inactivityTimer);
              inactivityTimer = null;
            }
          };
          const readChunk = (): Promise<{ done: boolean; value: Uint8Array | undefined }> => {
            clearInactivityTimer();
            return new Promise<{ done: boolean; value: Uint8Array | undefined }>((resolve, reject) => {
              inactivityTimer = setTimeout(() => {
                timedOut = true;
                try {
                  reader.cancel();
                } catch {}
                resolve({ done: true, value: undefined });
              }, OLLAMA_INACTIVITY_MS);
              reader.read().then(
                (r: ReadableStreamReadResult<Uint8Array>) => {
                  clearInactivityTimer();
                  resolve({ done: r.done, value: r.value as Uint8Array | undefined });
                },
                (err: unknown) => {
                  clearInactivityTimer();
                  reject(err);
                }
              );
            });
           };

           // v1.6.9 — Sello de llegada del primer byte del stream. Es lo que hace
           // que `latencyMs` sea una medida y no una declaración del payload.
           const inicioBufferIA = Date.now();
           // v1.46.0 — ¿SALIÓ ALGO? Un stream que termina sin un solo carácter y
           // sin error dejaba al usuario mirando un hueco en el chat («no salió
           // nada», decía él, con razón). Se cuenta el texto real entregado para
           // poder avisar en vez de cerrar en silencio.
           let textoEntregado = 0;
           let primerByteMedido = false; // v1.57.18 · el primer byte REAL alimenta la medición del reloj

           while (true) {
             if (ctx.isAborted()) {
              clearInactivityTimer();
              try {
                await reader.cancel();
              } catch {}
              break;
            }

            const { done, value } = await readChunk();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

             // v1.6.9 — cada línea la interpreta EL BÚFER, no un `JSON.parse` desnudo.
             //
             // Lo que cambia de verdad: antes, una línea que no parseaba caía en un
             // `catch {}` VACÍO y su contenido desaparecía sin dejar rastro. Si el
             // modelo había emitido texto en una línea con la coma mal puesta, el
             // usuario veía la respuesta cortada a la mitad y ningún error. Ahora el
             // búfer intenta la cascada completa (JSON directo → objeto dentro de
             // prosa → NDJSON → reparación → texto crudo) y, pase lo que pase, saca
             // el contenido: `content` viaja SIEMPRE.
             for (const line of lines) {
               if (!line.trim()) continue;
                const estado = handleInferenceStream(line, { startedAt: inicioBufferIA, final: false });
                if (!estado.content) ctx.latido(String((estado.data as any)?.status || "")); // v1.57.18/19 · v1.66.1: la SEÑERA de carga rearma el reloj solo si avanza
               if (estado.content) { if (!primerByteMedido) { primerByteMedido = true; registrarPrimerByte(modeloEnVuelo, Date.now() - inicioBufferIA); } ctx.sendChunk(estado.content); textoEntregado += estado.content.length; }
               if (estado.status === "error_recovered" && estado.reason) {
                 console.warn(`[ai/stream] Línea recuperada por el búfer (${estado.reason}).`);
               }
               // `done` no es texto: va en el objeto parseado. Un `{"done":true}`
               // limpio sale del búfer como `incomplete` con `data` puesto, así que
               // se consulta ahí y no en `status`.
               if (estado.data && (estado.data as Record<string, unknown>).done) {
                 // D8 (v1.6.32): el done de Ollama trae eval_count y las duraciones
                 // del motor. Se leen AQUÍ y viajan al cliente en el propio evento.
                 registrarExitoProveedor(modeloEnVuelo); // v1.57.18 · respondió: se limpia la cuarentena
                 { const met: any = extraerMetricasOllama(estado.data); registrarPrefill(modeloEnVuelo, Number(met?.msPrompt) || 0, relojLocal.ms); ctx.sendDone(model, met); } // v1.0.19 · el costo del prompt entra al reloj del próximo turno
                 return;
               }
             }
           }

           // v1.6.9 — La cola sin salto de línea final era el trozo que se perdía
           // siempre: el bucle la dejaba en `buffer` y nadie la volvía a mirar.
           // Ahora se rescata con `final: true`, que además cierra el JSON si venía
           // cortado por el cierre del stream.
           if (buffer.trim()) {
             const cola = handleInferenceStream(buffer, { startedAt: inicioBufferIA, final: true });
              if (cola.content) { if (!primerByteMedido) { primerByteMedido = true; registrarPrimerByte(modeloEnVuelo, Date.now() - inicioBufferIA); } ctx.sendChunk(cola.content); textoEntregado += cola.content.length; } // v1.57.18 · la cola también mide
             if (cola.data && (cola.data as Record<string, unknown>).done) {
               registrarExitoProveedor(modeloEnVuelo); // v1.57.18
               { const mf: any = extraerMetricasOllama(cola.data); registrarPrefill(modeloEnVuelo, Number(mf?.msPrompt) || 0, relojLocal.ms); ctx.sendDone(model, mf); } // v1.0.19 · prompt del camino sin stream
               return;
             }
           }

           if (timedOut) {
             // v1.57.18 · EL AVISO NOMBRA EL TRAMO Y EL PRESUPUESTO MEDIDO, y el fallo
             // entra al fusible: si se repite, la próxima vez no se reintenta en silencio.
             // v1.57.19 · F2 — EL PIVOT: el fallo entra al fusible y la decisión vive en server/pivotEnVivo.ts
             const pivote = intentarPivotLocal({ modeloEnVuelo, inventarioLocal, textoEntregado, pivotesUsados, consentimiento: consentimientoDeRescate(req.body), relojLocalMs: relojLocal.ms, relojLocalEtiqueta: relojLocal.etiqueta });
             if (pivote.continuar && pivote.modelo) {
               pivotesUsados++; try { ctx.sendTaskEvent({ type: "log", message: pivote.aviso } as any); } catch { /* el panel es opcional */ }
               ctx.setRelojDePrimerByte(pivote.relojMs || relojLocal.ms, pivote.relojEtiqueta || relojLocal.etiqueta); modeloEnVuelo = pivote.modelo; continue intentoDelTurno;
             }
             ctx.sendError(pivote.mensajeError);
             return;
           }

           // v1.46.0 — SILENCIO CERO. Antes, un stream que cerraba sin tokens
           // terminaba con un `done` limpio y el usuario veía un mensaje VACÍO:
           // desde su lado parecía que la app no hacía nada («no salió nada»).
           // Ahora, si no se entregó ni un carácter, se dice qué pasó y qué
           // probar. Un turno sin texto nunca es un turno «correcto».
           if (textoEntregado === 0) {
             ctx.sendError(avisoTurnoVacio(modelForOllama));
             return;
           }

           ctx.sendDone(model);
           return;
        }
      } // intentoDelTurno
    }

    // 5. Autonomous Engine Fallback
    // ------------------------------------------------------------
    // 🔧 CORRECCIÓN CRÍTICA: Este fallback solo se ejecuta si NINGÚN provider
    // fue configurado (provider desconocido, o provider válido pero sin API key
    // y sin Ollama corriendo). Antes se ejecutaba TAMBIÉN cuando un provider
    // fallaba silenciosamente — el usuario pensaba que el modelo contestaba pero
    // en realidad recibía este texto automático. Ahora los providers envían su
    // propio error vía ctx.sendError() antes de llegar aquí, así que este bloque
    // es un último recurso genuino.
    //
    // Para que el usuario sepa que esto es un fallback (no respuesta del modelo),
    // enviamos primero un evento `error` con texto explicativo, luego el texto
    // autónomo como `text`, y cerramos con `done` marcando el modelo como
    // "fallback-autonomous" (no el modelo solicitado).
    // ------------------------------------------------------------
    console.warn(
      `[ai/stream] Ningún provider respondió (provider=${provider}, model=${model}). ` +
      `Usando fallback autónomo. Posibles causas: provider desconocido, falta API key, ` +
      `Ollama no corre en ${OLLAMA_DEFAULT}, o modelo no descargado.`
    );
    // v1.0.16 · Si el que no respondió era una nube gratis se ENFRÍA: el turno siguiente arranca por otro del pool (ver failover arriba), así un 429/5xx no te deja clavado turno tras turno.
    if (PROVEEDORES_RESPALDO_NUBE.has(provider)) {
      const _antes = ENFRIADOS_NUBE[provider as ProveedorNube];
      Object.assign(ENFRIADOS_NUBE, enfriarProveedor(ENFRIADOS_NUBE, provider as ProveedorNube));
      if (!_antes) console.warn(`[CerebroNico] ☁️ «${provider}» enfriado 60s por no responder; el próximo turno rota a otra nube gratis.`);
    }
    // Mensaje inicial claro para el usuario
    ctx.sendChunk(`⚠️ **Modo fallback**: ningún proveedor de IA pudo responder ` +
      `(provider=\`${provider}\`, modelo=\`${model}\`). ` +
      `Verifica que tengas Ollama corriendo y el modelo descargado, ` +
      `o configura una API key de Gemini/OpenRouter.\n\n`);

    const autonomousText = generateAutonomousTechnicalResponse(prompt, textAttachmentsContext);
    const words = autonomousText.split(" ");
    for (let i = 0; i < words.length; i += 3) {
      if (ctx.isAborted()) break;
      ctx.sendChunk(words.slice(i, i + 3).join(" ") + " ");
      await new Promise((r) => setTimeout(r, 20));
    }
    // Marcamos el done con "fallback-autonomous" para que la UI sepa que no fue el modelo real.
    ctx.sendDone("fallback-autonomous");
  } catch (err: any) {
    if (!ctx.isAborted()) {
      // v1.46.0 — «signal is aborted without reason» DEJA DE LLEGAR AL USUARIO.
      // Esa cadena es lo que Node pone cuando se aborta un fetch, y el usuario
      // la leyó tal cual en la sesión («signal is aborted without reason»), sin
      // saber si había hecho algo mal. Casi nunca es culpa suya: es un cambio de
      // modelo, una cancelación o el watchdog cortando una espera. Se traduce al
      // idioma de la persona, y se dice qué hacer.
      const crudo = String(err?.message || err || "");
      ctx.sendError(
        mensajeLegibleDeError(crudo, err?.name) || crudo || "Error al procesar la solicitud de IA."
      );
    }
  } finally {
    // 🔧 Asegura que nunca quede un watchdog colgado tras salir del handler.
    ctx.clearWatchdog();
    // v1.48.0 — Suelta el emisor de este turno: `abrir_previsualizador` solo
    // debe empujar eventos mientras el turno vive.
    fijarEmisorEventoTurno(null);
  }
  });

  // 🔧 ENDPOINTS DE RECONEXIÓN — DEBEN registrarse ANTES del middleware de Vite,
  // si no Vite captura los POST a /api/* y devuelve 404.
  // Auto-arranque del Puente Python (puerto 5000)
  // ═══════════════════════════════════════════════════════════════════════
  // v1.6.2 — EL PUERTO SE ABRE ANTES QUE LOS SUBSISTEMAS OPCIONALES
  // -----------------------------------------------------------------------
  // Aquí estaba `const bridge = await startAgentBridge();`, y ESA línea era la
  // causa raíz de todos los «el puerto está abierto y no responde» de esta
  // sesión: el await paraba la ejecución en el arranque del puente —con bucles
  // de 16 sondeos de salud por 5 reintentos— ANTES de llegar al `app.listen`
  // de unas líneas más abajo. Medido: el registro terminaba en los mensajes del
  // puente y NUNCA imprimía «Escuchando en…», mientras el proceso seguía vivo.
  // Desde fuera: conexión rechazada contra un puerto que la interfaz anunciaba
  // como OK. Es la misma familia de fallo que el indicador clavado en verde:
  // el mensaje y la realidad contradiciéndose.
  //
  // Un subsistema OPCIONAL no puede impedir que el servidor escuche. El puente
  // MEJORA el motor; no ES el motor. Ahora se arranca después de abrir el
  // puerto y sin await: si tarda, si falla o si el :5000 está ocupado, la IDE
  // ya está sirviendo y el fallo queda contado en el registro.
  let bridge: Awaited<ReturnType<typeof startAgentBridge>> = null;
  let daemonsPy: HandleDaemonsPython | null = null;

  // 🔧 ENDPOINT: Reiniciar el puente Python bajo demanda del usuario.
  // El botón "Reconectar" del frontend llama aquí cuando el puerto 5000 cae.
  const DEPS_PUENTE = { bridge: () => bridge, invalidar: invalidarMuestra, cargadas: () => (listToolPacks().find((p: any) => p.id === "puente-mcp")?.tools || []).map((t: any) => t.name), reintentos: () => ({ usados: packsIntentos, max: PACKS_INTENTOS_MAX }) };
  fijarDependenciasPuente(DEPS_PUENTE);
  // EL CUERPO VIVE EN src/engine/herramientaPuente.ts: el MISMO interruptor atiende al botón
  // «Reconectar» y a la herramienta `reiniciar_puente` del modelo. La respuesta conserva
  // {ok, port} (lo leen App.tsx y la automejora) y suma origen/motivo.
  app.post("/api/bridge/restart", crearReinicioPuente(DEPS_PUENTE)); // v1.97.0 · EL CUERPO VIVE EN src/engine/herramientaPuente.ts: el mismo interruptor para el botón «Reconectar» y para la herramienta `reiniciar_puente` del modelo. La respuesta conserva {ok, port} y suma origen/motivo.

  /**
   * v1.16.1 — SUPERFICIE HONESTA DE PACKS EXTERNOS (MCP).
   * Lo que el auto-arranque no pudo cargar (el puente :5000 aún no estaba
   * arriba) se recarga aquí; /estado dice qué packs viven y qué herramientas
   * aportan de verdad. Mismo principio que /api/capacidades: se reporta el
   * hecho, no la intención.
   */
  app.post("/api/tools/packs/recargar", async (_req: Request, res: Response) => {
    packsIntentos = 0;
    try {
      const r = await loadExternalToolPacks(true);
      const packs = [...remotePackEndpoints.keys()];
      const herramientas = packs.reduce(
        (n, id) => n + (listToolPacks().find((p) => p.id === id)?.toolCount || 0),
        0
      );
      return res.json({ ok: true, cargados: r.cargados, fallidos: r.fallidos, packs, herramientas_remotas: herramientas });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // Reverse proxy de :3500 bajo /sandbox-preview/* para navegadores remotos (AI Studio / nube)
  if (!modoServidor()) app.use(crearMiddlewareSandboxProxy({ sandboxPort: SANDBOX_PORT, sandboxVivo }));

  // Vite middleware in development mode
  // 🔧 AISLAMIENTO CRÍTICO (bug "subir ZIP reinicia la app"):
  // Vite por defecto observa TODOS los archivos del proyecto. Cuando el usuario
  // sube un ZIP con 60+ archivos a .proyectos/, Vite detecta los cambios en
  // node_modules/.proyectos y dispara una recarga del servidor (HMR), lo que
  // tira abajo la conexión de streaming y "reinicia" la app.
  //
  // Solución: ignorar completamente .proyectos/, dist_electron/, y node_modules/
  // en el watcher de Vite. La IDE (:3000) solo recargará si cambian archivos
  // de src/ o de backend/ (no del sandbox del usuario).
   // v1.57.0 · EL EXE MORÍA ACÁ (sin NODE_ENV pedía Vite y salía con code=1 teniendo
   // el cliente al lado). La historia completa está en modoArranque.ts y el CHANGELOG;
   // acá manda el hecho: NODE_ENV, y si falta o miente, la existencia real del dist.
   const distHermano = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.html");
   let servirProduccion = process.env.NODE_ENV === "production";
   // FUERA del bloque sonda: la consume la rama siguiente (scope de bloque).
   let createViteServer: any;
  if (!servirProduccion) {
    // v1.6.0 — Un servidor que anuncia el puerto y NO sirve es peor que uno que no arranca.
    // Medido: sin las dependencias de desarrollo, esta linea lanzaba
    // ERR_MODULE_NOT_FOUND, la promesa se rechazaba, el middleware de rutas no
    // llegaba a montarse, y el proceso seguia VIVO anunciando «Escuchando en
    // http://127.0.0.1:3000». Las peticiones no obtenian respuesta.
    // Ahora se dice que falta y como arrancar sin Vite, y se sale: quedarse
    // sordo deja un puerto abierto que no responde, y eso hace imposible saber
    // que esta pasando.
    try {
      ({ createServer: createViteServer } = await import("vite"));
    } catch (e: any) {
      // La decisión vive en `modoArranque.ts` (pura, probada): acá solo se aportan
      // los hechos medidos en disco y se ejecuta su fallo. Un server que PUEDE
      // servir y se muere miente sobre su estado; uno que NO puede y sigue vivo
      // anuncia un puerto sordo (el bug de v1.6.0). Ningún camino es silencioso.
      const v = veredictoArranqueSinVite({
        distHermano,
        distHermanoExiste: fs.existsSync(distHermano),
        nodeEnv: process.env.NODE_ENV,
        viteError: e && e.message ? e.message : String(e),
      });
      for (const a of v.avisos) console.warn(a);
      for (const m of v.errores) console.error(m);
      servirProduccion = v.servirProduccion;
      if (!servirProduccion) process.exit(1);
    }
  }
  if (!servirProduccion) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // 🔧 Desactivar HMR: el servidor de la IDE nunca se recarga solo.
        // El usuario debe recargar el navegador manualmente si cambia algo.
        hmr: false,
        // 🔧 Watcher ignorado: la raíz del sandbox (PROJECT_ROOT — `.proyectos` es
        // solo su valor por defecto) y sus node_modules NUNCA deben disparar
        // recargas en el servidor de la IDE.
        watch: {
          ignored: [
            ".proyectos/**",
            "**/.proyectos/**",
            "**/node_modules/**",
            "**/dist_electron/**",
            "**/.bridge_5000.log",
            "**/.sandbox_3500.log",
            "**/.vite/**",
            "**/.cache/**",
          ],
          usePolling: false,
        },
        // No tocar el sistema de archivos del sandbox.
        fs: { strict: true },
      },
      appType: "spa",
      // 🔧 Cache de Vite en directorio aislado (no dentro del sandbox)
      cacheDir: path.join(process.cwd(), "node_modules", ".vite"),
    });
    app.use(vite.middlewares);
    // ============================================================
    // v2.1 — SABER SIEMPRE QUIÉN SIRVE EL CLIENTE
    // ------------------------------------------------------------
    // Esta duda costó una vuelta entera: el navegador pedía /src/main.tsx y los
    // módulos daban 404, y no había forma de saber desde fuera si Vite estaba
    // vivo o si el servidor estaba sirviendo otra cosa. Ahora se dice al
    // arrancar, sin ambigüedad.
    // ============================================================
    console.log(
      `[CerebroNico] Cliente: Vite en modo DESARROLLO (NODE_ENV=${process.env.NODE_ENV ?? "sin definir"}). Vite transforma y sirve /src/*.`
    );

    // NOTA v2.1 — Aquí probé un middleware para AVISAR cuando un /src/* da 404
    // (el síntoma de la pantalla en blanco). NO funciona colocado después de los
    // de Vite: Vite responde el 404 él mismo y nunca cede el paso, así que el
    // aviso jamás se disparaba. Se retiró en lugar de dejar un diagnóstico que
    // finge funcionar. La detección real está en el cliente, tras cada sync:
    // "🔎 Estructura del workspace" (en App.tsx).
  } else {
    let distPath = path.join(process.cwd(), "dist");
    let distIndex = path.join(distPath, "index.html");
    // v1.57.0 — si relativo al cwd no hay cliente pero SÍ lo hay junto al server
    // (lanzado con `node dist/server.mjs` desde dentro de dist/, o con otro cwd),
    // se sirve el que existe de verdad. Un servidor que ignora al cliente que tiene
    // al lado para quejarse del que no ve, miente sobre su propio estado.
    if (!fs.existsSync(distIndex) && fs.existsSync(distHermano)) {
      distPath = path.dirname(distHermano);
      distIndex = distHermano;
    }
    // ============================================================
    // v2.1 — 🐞 MODO PRODUCCIÓN SIN CLIENTE COMPILADO = PANTALLA BLANCA MUDA
    // ------------------------------------------------------------
    // En producción este servidor sirve dist/. Si dist/ no existe —lo normal al
    // importar este proyecto en el sandbox, porque dist se excluye al empaquetar—
    // la interfaz queda EN BLANCO y nada lo explica: ni un error, ni una pista.
    // Es la causa más probable de "el 3500 sirve HTML pero todos los módulos dan
    // 404": el index.html que se ve NO viene de aquí, y los /src/* no los sirve
    // nadie porque Vite no está montado.
    // ============================================================
    if (!fs.existsSync(distIndex)) {
      console.error(
        "[CerebroNico] ⚠️ MODO PRODUCCIÓN SIN CLIENTE COMPILADO.\n" +
          `            No existe: ${distIndex}\n` +
          "            La interfaz se quedará EN BLANCO y los módulos /src/* darán 404.\n" +
          "            Causa habitual: NODE_ENV=production heredado del proceso padre y nadie ejecutó «npm run build».\n" +
          "            Solución: ejecuta «npm run build», o arranca en desarrollo (sin NODE_ENV=production)."
      );
    }
    console.log(`[CerebroNico] Cliente: dist/ ${fs.existsSync(distIndex) ? "OK" : "AUSENTE (ver aviso arriba)"}.`);
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(distIndex);
    });
  }

  // ============================================================
  // v0.9.1 — MIDDLEWARE DE ERROR (el que faltaba)
  // ------------------------------------------------------------
  // No había ninguno. Consecuencia real: una excepción dentro de una ruta
  // dejaba la petición SIN RESPUESTA — ni 200 ni 500 — y en la interfaz eso se
  // ve como un indicador girando para siempre. El usuario no puede distinguir
  // «está pensando» de «se rompió y nadie me lo va a decir», así que espera.
  //
  // Va el ÚLTIMO, después de todas las rutas: en Express, el manejador de error
  // se identifica por tener CUATRO argumentos, y si se registra antes que una
  // ruta, esa ruta nunca llega a él.
  //
  // Devuelve JSON y no una página HTML a propósito: quien llama a /api/* es la
  // interfaz, que espera datos. Una página de error de Express en mitad de un
  // fetch produce un fallo de análisis confuso encima del fallo real.
  // ============================================================
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const ruta = `${req.method} ${req.originalUrl || req.url}`;
    console.error(`[estabilidad] Error en la ruta ${ruta}:`, err?.stack || err);
    if (res.headersSent) return; // ya se empezó a responder: no se puede reescribir
    // v1.70.6 · EL 413 TIENE NOMBRE Y APELLIDO: «adjuntaste demasiado peso»
    // dicho en cristiano, con la salida a la vista. Un 500 genérico aquí era
    // indistinguible de un fallo del motor (y el usuario reintentaba lo mismo).
    if (err && (err.type === "entity.too.large" || err.status === 413 || err.statusCode === 413)) {
      return res.status(413).json({
        ok: false,
        error: "El pedido superó el tamaño máximo que el motor puede leer.",
        ruta,
        pista:
          "Volvé a mandar con MENOS imágenes a la vez (o más livianas). Las fotos de más de 1,5 MB ya se recomprimen solas; " +
          "si son muchas, repartilas en dos mensajes.",
      });
    }
    res.status(500).json({
      ok: false,
      error: "Error interno del motor.",
      ruta,
      motivo: String(err?.message || err || "sin detalle"),
      pista: "El motor SIGUE funcionando: este fallo afecta solo a esta petición. El detalle completo está en la terminal de la IDE.",
    });
  });

  // v1.6.17 — 🔌 Y SI EL PUERTO YA ESTÁ OCUPADO, DECIRLO.
  //
  // `app.listen()` devolvía un servidor al que nadie escuchaba. En Node, un
  // `net.Server` que emite `'error'` SIN manejador no avisa: LANZA y mata el
  // proceso. Así que si quedaba un proceso vivo de una prueba anterior
  // agarrado al puerto —lo típico al ir probando versiones— la nueva no
  // arrancaba, se moría, y el usuario solo veía que «no contesta». Sin un
  // mensaje. Sin una pista. El síntoma era indistinguible de un cuelgue.
  //
  // Ahora se captura, se explica qué pasa, se dice cómo encontrar al culpable
  // y se sale con código de error para que no parezca que arrancó bien.
  const servidorHttp = app.listen(PORT, HOST, () => {
    console.log(`[CerebroNico Server] Escuchando en http://${HOST}:${PORT}\n[CerebroNico] ${resumenProtocolo()}\n[CerebroNico] ${textoDeMapaDePuertos()}\n[CerebroNico] ${auditarDirecciones(process.env).join(" | ")}`); // v1.0.20 · DIRECCIONES en una línea + auditoría de direcciones de escucha coladas
    iniciarSanacionDaemon(); // v1.57.19 · F1.5: sonda fantasma cada 5 min a los modelos en cuarentena (local activo, nube pasiva)
    // v1.6.2 — Y SÓLO AHORA el subsistema opcional. ESTE ORDEN ES EL ARREGLO:
    // el puerto ya está abierto, así que lo peor que puede pasar es que el
    // puente no esté. Eso es una molestia; una IDE muda es otra cosa.
    const arranquePuente = startAgentBridge()
      .then((sup) => {
        bridge = sup;
        if (sup) console.log("[CerebroNico] Puente 5000 listo.");
      })
      .catch((e: any) => {
        console.error("[CerebroNico] El puente 5000 no arrancó. LA IDE SIGUE SIRVIENDO:", e?.message || e);
      });
    const arranqueDaemons = arrancarDaemonsPython({ installRoot: RAIZ_INSTALACION, projectRoot: PROJECT_ROOT })
      .then((handle) => {
        daemonsPy = handle;
      })
      .catch((e: any) => {
        console.error("[CerebroNico] Los daemons Python no arrancaron. LA IDE SIGUE SIRVIENDO:", e?.message || e);
      });
    void Promise.allSettled([arranquePuente, arranqueDaemons]).then(() => {
      invalidarMuestra();
      void loadExternalToolPacks(true).catch(() => {});
    });
  });

  // El manejador que faltaba. Va sobre el servidor que devuelve `listen`, no
  // sobre `app`: `app` es el enrutador de Express y no emite los errores de
  // socket, así que ahí nunca se habría enterado de nada.
  servidorHttp.on("error", (err: any) => {
    console.error("");
    console.error("════════════════════════════════════════════════════════════");
    if (err?.code === "EADDRINUSE") {
      console.error(`[CerebroNico] EL PUERTO ${PORT} YA ESTÁ OCUPADO. La IDE NO arrancó.`);
      console.error("");
      console.error("  Lo normal es que sea un CerebroNico anterior que quedó vivo.");
      console.error("  Para encontrarlo y cerrarlo:");
      console.error("");
      console.error(`    Windows       netstat -ano | findstr ":${PORT}"`);
      console.error("                  taskkill /PID <el-pid-que-aparezca> /F");
      console.error(`    macOS/Linux   lsof -i :${PORT}   y luego   kill <pid>`);
      console.error("");
      console.error("  Ojo también con el puente 5000: si alguna vez cerraste la ventana");
      console.error("  sin parar la app, sus procesos siguen ahí ocupando el puerto.");
    } else {
      console.error(`[CerebroNico] El servidor no pudo abrir el puerto ${PORT}: ${err?.message || err}`);
    }
    console.error("════════════════════════════════════════════════════════════");
    console.error("");
    // Se sale con código distinto de cero: antes esto reventaba igual (el
    // proceso moría), pero sin decir nada y pareciendo que había arrancado.
    process.exit(1);
  });

  const shutdown = () => {
    if (bridge) {
      try {
        bridge.kill();
        console.log("[CerebroNico] Puente 5000 detenido.");
      } catch {}
    }
    if (daemonsPy) {
      try {
        daemonsPy.kill();
      } catch {}
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();

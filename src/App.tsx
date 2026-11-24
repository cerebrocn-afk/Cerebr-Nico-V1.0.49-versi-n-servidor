import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { conTope, podar, TOPE_ACCIONES, TOPE_BITACORA } from "./engine/colaConTope";
import { Header } from "./components/Header";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { ChatCenter } from "./components/ChatCenter";
import { ModelSelectorModal } from "./components/ModelSelectorModal";
import { auditarListaOllama } from "./engine/aduanaModelos"; // v1.77.0 · aduana única de modelos
import { decisionRelevoFavoritos, decisionRelevoPorFallo, type IntentoRelevo } from "./engine/relevoFavoritos"; // v1.77.0 · relevo automático a ⭐ Favoritos · v1.80.0 · la cascada del fallo
// v1.80.0 · FASE 1, punto 4: la telemetría del relevo (cuántas veces, a quién,
// con qué resultado). Consola de la IDE, no red: es la evidencia de que la
// máquina se cura sola, y tiene que poder leerse sin abrir un depurador.
import { registrarRelevo, cerrarRelevo, lineaTelemetria, resumenRelevo, type RegistroRelevo } from "./engine/telemetriaRelevo";
// v1.80.0 · LA RESPUESTA ECLÉCTICA: `cerebro/auto` es un modelo del selector que
// no habla a una máquina, habla a varias y devuelve veredicto.
import { esCerebroAuto, MODELO_CEREBRO_AUTO } from "./engine/enjambreEclectico";
// v1.86.4 · SALUD MEDIDA — un «Failed to fetch» del navegador no es culpa del proveedor.
import { PATRON_FALLO_DE_RED, consejoFalloDeRed } from "./engine/latido";
// v1.95.2 · Dos motores puros nuevos. (1) Redacción de credenciales que llegan de afuera:
// el error de OpenRouter imprimió la clave del usuario en el chat y la sesión exportada
// (src/App.tsx:3440 armaba el mensaje con `${errMsg}` crudo). (2) El dictamen de por qué
// la carpeta de la API unificada está vacía: el motivo real solo existía como línea de
// terminal, así que «sin configurar», «endpoint apagado» y «0 modelos» se veían idénticos
// — y Mario concluyó, con razón, que «los unificados nunca cargaron».
import { redactarSecretos, textoSeguro } from "./engine/redaccionSecretos";
import { dictamenCarpetaUnificada, INTENTOS_UNIFICADA_TOPE } from "./engine/estadoUnificada";
import { consultarEnjambre, vocesDelUsuario, sugerirJuez, historialParaEnjambre, imagenesParaEnjambre } from "./utils/enjambreCliente";
// v1.80.0 · el interruptor del panel de capacidades llega al motor (antes el
// relevo solo se leía de localStorage, que es una costumbre, no una capacidad).
import { capacidadActiva, refrescarCapacidades, suscribirCapacidades } from "./utils/capacidadesMotor";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ZaiWizard } from "./components/ZaiWizard";
import { DedicatedWebEditorView, type WebEditorStatus } from "./components/DedicatedWebEditorView";
import { ConfigModal } from "./components/ConfigModal";
// v2.0 — Pestañas centrales (el Chat es una pestaña más), extensiones de terceros
// y panel de configuración pro (heredado de la v1.8/v1.9).
import { CenterTabBar, type CenterTab } from "./components/CenterTabs";
import { ExtensionPanelView } from "./components/ExtensionPanelView";
import { ProConfigPanel } from "./components/ProConfigPanel";
import { AppBackground } from "./components/AppBackground";
import { ExtensionManager } from "./components/ExtensionManager";
// v2.0 — Pantalla de carga con el cerebro arrancando el motor, y menú
// contextual + portapapeles global (click derecho, Ctrl+C/V, captura).
import { BootSplash } from "./components/BootSplash";
import { ContextMenuRoot } from "./components/ContextMenuRoot";
import { CentroEstadoUX, type SeccionUX } from "./components/CentroEstadoUX"; // UX v1: Centro de Estado y Ayuda
import { AudioAmbiente } from "./components/AudioAmbiente"; // AUDIO v1: ambiente en bucle
// v1.73.0 · CANAL DIRECTO: carpeta/ZIP de proyecto vinculado al chat
// (suite server/routers/carpetaProyecto.ts; el modal es el selector que pidió Mario).
import { CarpetaProyectoModal, type CarpetaVinculadaEstado } from "./components/CarpetaProyectoModal";
// v1.75.0 · MARCADOR AUTOMÁTICO: antes de cortar, el motor llama solo al
// siguiente Favorito con clave (mismo prompt). Cola y cuarentenas en utils/marcador.
import { esFalloDeComunicacion, iniciarMarcado, marcarComoNoContesto, siguienteMarcada, estadoMarcador, colaDeMarcado } from "./utils/marcador";
import {
  type ProSettings,
  type ThemeId,
  loadProSettings,
  saveProSettings,
  applyProSettings,
  WALLPAPER_PRESETS,
  reglasEfectivas,
} from "./utils/proSettings";
// PALETA v1 — el papel de la interfaz tiene un solo dueño: engine/paleta.ts.
import {
  INTENSIDAD_MIN, INTENSIDAD_MAX,
  paletaActual, fijarPaleta, suscribirPaleta, modoDesdeTemaPro, temaProDesdePaleta,
} from "./engine/paleta";
import {
  type ExtensionInfo,
  fetchExtensions,
  setExtensionEnabled,
  uninstallExtension,
  installExtensionZip,
} from "./utils/extensionHost";
import { startInvocationPolling, stopInvocationPolling, parseSlashCommand } from "./utils/extensionBridge";
import {
  type FavoriteModel,
  loadFavoriteModels,
  toggleFavoriteModel,
  moveFavoriteModel,
  restoreCatalog,
  clearFavoriteModels,
  exportFavoriteModels,
  importFavoriteModels,
} from "./utils/favoriteModels";
import { APP_FONT_SIZES, APP_FONT_SIZE_DEFAULT, APP_FONT_SIZE_LABELS, PANEL_LIMITS, IDE_BRAND } from "./constants";
import { AgentAction, AgentTask, AttachmentItem, ChatMessage, ModelProvider, PortTelemetry, QueuedMessageItem, SavedChat, SubagentItem, WorkspaceFile } from "./types";
import { HighPerformanceAIStreamer, consumirUltimaMedicion } from "./utils/engine";
import { buildContextCachePayload, DEFAULT_MEMORIA_MD, DEFAULT_SKILLS_MD } from "./utils/contextCache"; // v1.72.0: fuera `type PromptInfo`, era del estado borrado
import { proveedorParaModelo, modeloAlCambiarMotor } from "./utils/providerRouting";
// v1.77.0 · EL RELEVO (pedido de Mario 26/10): turno que cerró sin respuesta
// re-pregunta el MISMO prompt al siguiente cloud de ⭐ Favoritos. El criterio
// vive en src/engine/relevoFavoritos.ts (puro, probado); acá sólo la memoria
// del turno y el gatillo. APAGADO por defecto — el usuario lo enciende.
// v1.80.0 · FASE 1 del plano: la puerta ya NO es `localStorage`. La capacidad
// `auto_relay` del panel de capacidades manda (utils/capacidadesMotor, que lee
// y escribe el motor). El `localStorage cn_auto_relay` viejo sigue respetándose
// como preferencia personal cuando el motor todavía no respondió: la decisión
// del usuario no se borra por un refactor.
const PREF_RELEVO_KEY = "cn_auto_relay";
const relevoPrefido = (): boolean => {
  if (capacidadActiva("auto_relay")) return true;
  try { return localStorage.getItem(PREF_RELEVO_KEY) === "1"; } catch { return false; }
};
// v2.0 — Autosuperación medible y resiliencia profunda
import { fijarPreferenciaMotor, getModelProfile } from "./engine/modelTiers";
import {
  type Lesson,
  loadLessons,
  loadMetrics,
  hydrateLessonsAndMetrics,
  getRelevantLessons,
  buildSelfImprovementDirective,
  confirmLastLessonsUsed,
  leccionesReforzadasRecientes,
  reflectOnTurn,
  recordTurnMetric,
  getImprovementSummary,
  startNewMetricsSession,
  clearMetrics,
  deleteLesson,
  clearLessons,
  exportLessons,
} from "./utils/selfImprovement";
import { describeResilience, resetBreakers } from "./engine/resilience";
import { SelfImprovementPanel } from "./components/SelfImprovementPanel";
// v2.2 — La ventana del cerebro de tareas: planes, dependencias, paralelismo y
// el porqué de cada espera. El motor ya funcionaba; esto lo hace visible.
import { PlansPanel } from "./components/PlansPanel";
import { TableroParalelo } from "./components/TableroParalelo";
// v1.16.3 — Paso 2 del plan de pantalla: indicador de acceso rápido (superior
// derecha) que alterna el panel desplegable de hojas de ruta en segundo plano.
// Lee la MISMA API que PlansPanel: una verdad, no dos fotografías.
import { PlanificationPanel } from "./components/PlanificationPanel";
import { planDeLanzado, notaDelLanzado, esLanzadoReciente } from "./engine/lanzarEnCola";
// QUIRÓFANO HD v1 — el motor QUIRÓFANO ya operaba en la sombra (sus cuatro puertas
// y sus endpoints vivían en server.ts); esta pestaña lo saca a la luz: sala,
// operación en curso, última cirugía, bitácora y botones Revisar/Deshacer.
import { PanelQuirofano } from "./components/PanelQuirofano";
import { EspinaActividad } from "./components/EspinaActividad"; // COREO v1
import { FondoLayer } from "./components/FondoLayer"; // FONDO v1
import { esModeloEmbeds, motivoEmbeds } from "./engine/ollamaPugil"; // PUGIL v1 /*PUGIL*/
import { debePausarSync, avisoPausaSync } from "./engine/sandboxTregua"; // TREGUA v1 /*TREGUA*/
import { autoLearnFromInteraction } from "./utils/languageMemory";
import { processUploadedFile } from "./utils/attachmentProcessor";

import { extractCodeBlocksFromMessage, extractToolCallDeletes, mergeExtractedFiles } from "./utils/codeParser";
// v1.70.6 — ADUANA DE IMÁGENES: ninguna referencia <img> sale al sandbox apuntando
// a un archivo que no existe; si el modelo soñó la ruta y hay una imagen real que
// casa, se reescribe ANTES de escribir en disco (ver utils/repararImagenes.ts).
import { repararRutasDeImagen, RE_IMAGEN_RUTA } from "./utils/repararImagenes";
// v2.2 — El chat puede PEDIR una conversión de formato. Es la pieza que faltaba
// para cerrar chat → conversor → editor → preview.
import { extraerOrdenes } from "./engine/chatOrders";
import { alternarPantallaCompletaInteligente, minimizarVentana } from "./engine/pantallaCompleta"; // v1.6.6 en un solo sitio · v2.3.1 variante con reintento en la raíz + minimizado honesto
import { evaluarPesoAnimado, mensajePesoAnimado } from "./engine/fondo"; // v1.6.8 — el peso del fondo avisa, ya no bloquea
import { generateProjectZip, generateCnFile, parseCnFile, triggerFileDownload } from "./utils/fileParser";
// v1.16.4 · CAMINO DE LOS ARCHIVOS: la aduana del árbol (v8.0.6) ya guardaba la
// SALIDA (.cn/ZIP). Ahora guarda también la ENTRADA y el paso al sandbox:
// entrada → contenedor → (aduana) → árbol del proyecto → (lista quirúrgica) → sandbox.
import { clasificarRuta, auditarArbol, puedeIrEnElEmpaque } from "./engine/aduanaArbol";
import { detectLanguageFromPath } from "./utils/syntaxEngine";
import { agruparPartesMultivolumen, ensamblarBinarioMultivolumen } from "./utils/multipartZip";
import { calcularTelemetriaSesion, compactarHistorialSeguro } from "./engine/contextTelemetry";
import { loadJSON, saveJSON, loadString, saveString, alFallarGuardado, restaurarDeAlmacenGrande } from "./utils/storage"; import { CLAVE_ARRANQUE, CLAVE_WORKSPACE_PREVIO, modoArranque, prepararArranque } from "./utils/arranqueLimpio"; // v1.97.0 · ARRANQUE LIMPIO: la ventana abre vacia y lo anterior se aparca, no se borra // v1.9.0 — resultado del guardado + rescate al almacén grande
import { deriveChatTitle as deriveChatTitlePure, buildArchivedChat, archivarSinDuplicar } from "./utils/chatStorage"; import { fusionarEliminaciones, type EliminacionChat } from "./engine/persistenciaHibrida";
import { LS_KEYS, OLLAMA_URL as DEFAULT_OLLAMA_URL, resolverUrlSandbox, WEB_EDITOR_ORDER_TAG, leerCredencialesNubePlan } from "./constants";
import { marcarGeminiServidorTts } from "./utils/ttsConfig";
import {
  fusionarChatsGuardados,
  type EstadoSincronizacion,
  type LeccionPersistida,
  type MetricaPersistida,
} from "./engine/persistenciaHibrida";
// v1.16.6 — el MODO DE PENSAMIENTO (Auto/Rápido/Ingeniero/Profundo) sale del
// menú Pro y se cablea de verdad: ciclo, etiqueta y directriz viven en
// src/engine/thinkingMode.ts (fuente única, probada en tests/pensamientoChat).
import { siguienteModo, directrizModo, siguienteNivelRazon, MAPA_NIVEL_SDK, esNivelRazonGemini, type NivelRazonGemini } from "./engine/thinkingMode";
// v1.99.8 · el «Modo 8 GB» dejó de ser un nombre: la interfaz se aligera (o no) con la RAM que
// midiò el server. Dueño del criterio: `src/engine/presionEquipo.ts`.
import { decidirModoPerf, atributoPerf, normalizarModoPreferido, type ModoPerf, type DecisiónPerf } from "./engine/presionEquipo";
// v1.99.9 · la horma del chat: cuatro pasos calculados con la ventana y los paneles abiertos.
import { decidirHorma } from "./engine/hormaChat";
// v2.3.0 · PRESUPUESTO DE CONEXIONES. Los nueve sondeos de catálogo del arranque
// salían a la vez contra el mismo origen y Chrome sólo abre 6 conexiones por
// origen; los que rebotan contra un proveedor externo mantienen el socket hasta
// el plazo del servidor (20 s) y el latido de `/api/coreo`, que caduca a los
// 2800 ms, hacía cola y moría. Éste es el mecanismo exacto de las capturas del
// 03/11: cabecera «servidor local caído» junto a «44 detectados en Ollama», con
// el servidor sano. Techo y plazos declarados en ./engine/presupuestoConn.
import { fetchCatalogo, fetchCritico } from "./engine/presupuestoConn";
import { createSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, Snapshot } from "./utils/restorePoints";
import { addFavoritePrompt, deleteFavoritePrompt, markPromptUsed, loadFavoritePrompts, FavoritePrompt, DEFAULT_FAVORITE_PROMPTS } from "./utils/favoritePrompts";
import { indexDocument, searchRelevantChunks, listIndexedDocuments, clearIndex } from "./utils/localRAG";
import { downloadMarkdownReport } from "./utils/markdownExport";
import { installGlobalErrorHandler } from "./utils/selfHealing";
import { marcarComoEntrada, promoverArchivo, contarArboles } from "./utils/arbolWorkspace"; // v1.60.5 — doble árbol VISIBLE (insignia 📥/🏗️ + promover)
import { detectSLM, getRecommendedRagChunks, getRecommendedEvolutionLessons } from "./utils/slmDetector";
import { buildSLMSystemPromptAddon, getSLMUserWarning } from "./utils/slmSystemPrompt";
import { buildEvolutionContextForPrompt } from "./utils/evolutionDB";
import { saveBackgroundImage, loadBackgroundImage, clearBackgroundImage, migrateBackgroundFromLocalStorage, urlDeFondo, revocarFondo } from "./utils/indexedDBStorage";

const INITIAL_PACKAGE_JSON = JSON.stringify(
  {
    name: "cerebronico-ide",
    private: true,
    version: "1.0.0",
    type: "module",
    author: "Mario Nicolas Quintero",
    scripts: {
      // 🔧 Puerto 3500: la app exportada corre en su propio puerto y así
      // NUNCA colisiona con la interfaz de CerebroNico IDE (puerto 3000).
      dev: "cross-env PORT=3500 tsx server.ts",
      build: "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
      start: "cross-env PORT=3500 node dist/server.cjs",
      lint: "tsc --noEmit",
    },
    dependencies: {
      "@google/genai": "^2.20.0",
      "@tailwindcss/vite": "^4.0.9",
      "@types/prismjs": "^1.26.6",
      clsx: "^2.1.1",
      "cross-env": "^7.0.3",
      cors: "^2.8.5",
      express: "^4.21.2",
      jszip: "^3.10.1",
      "lucide-react": "^1.16.0",
      prismjs: "^1.30.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "tailwind-merge": "^3.0.2",
      tailwindcss: "^4.0.9",
    },
    devDependencies: {
      "@types/cors": "^2.8.17",
      "@types/express": "^5.0.0",
      "@types/node": "^22.13.5",
      "@types/react": "^19.0.10",
      "@types/react-dom": "^19.0.4",
      "@vitejs/plugin-react": "^4.3.4",
      esbuild: "^0.25.0",
      tsx: "^4.23.13",
      typescript: "^5.7.3",
      vite: "^6.2.0",
    },
    overrides: {
      qs: "^6.16.0",
    },
  },
  null,
  2
);

const INITIAL_WORKSPACE_FILES: WorkspaceFile[] = [
  {
    id: "f-package-json",
    name: "package.json",
    path: "package.json",
    content: INITIAL_PACKAGE_JSON,
    language: "json",
    size: INITIAL_PACKAGE_JSON.length,
    modified: false,
  },
  {
    id: "f-memoria",
    name: "MEMORIA.md",
    path: "MEMORIA.md",
    content: DEFAULT_MEMORIA_MD,
    language: "markdown",
    size: DEFAULT_MEMORIA_MD.length,
    modified: false,
  },
  {
    id: "f-skills",
    name: "skills.md",
    path: "skills.md",
    content: DEFAULT_SKILLS_MD,
    language: "markdown",
    size: DEFAULT_SKILLS_MD.length,
    modified: false,
  },
  {
    id: "f-readme",
    name: "README.md",
    path: "README.md",
    content: `# ${IDE_BRAND.FULL_NAME}

Entorno de ingeniería de software autónomo de alto rendimiento con persistencia de sesión, reconexión automática a Ollama y soporte multi-provider (OpenAI / Gemini / OpenRouter / Custom).

- **Marca**: ${IDE_BRAND.FULL_NAME} — por ${IDE_BRAND.AUTHOR}
- **Turno 1**: MEMORIA.md y skills.md se inyectan como mensajes de sistema.
- **Turnos siguientes**: historial completo + archivos abiertos en el editor.
- **Inferencia**: Ollama (:11434), OpenAI (api.openai.com), Gemini (AI Studio), OpenRouter y servidor custom.
- **Puertos (los 7 de la casa)**: IDE en :3000 · App exportada/sandbox en :3500 · Puente PC en :5000 · Memoria híbrida en :5100 · Creador de sitios en :5102 · Motor del cerebro en :5103 · Ollama en :11434.
- **Extensión personalizada**: usa archivos \`.cn\` (CerebroNico) para guardar y abrir workspace completo.
- **Sesión**: historial y workspace persistidos en local (sobreviven a recargas).
`,
    language: "markdown",
    size: 700,
    modified: false,
  },
  {
    id: "f-server",
    name: "server.ts",
    path: "server.ts",
    content: `// CerebroNico Server Proxy
// 🔧 Puerto 3500: puerto oficial de la app exportada (la IDE usa el 3000)
import express from "express";
const app = express();
const PORT = process.env.PORT || 3500;

// Portada de bienvenida: edita este archivo y el preview del sandbox se actualiza solo
app.get("/", (_req, res) => {
  res.send(\`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Mi app :3500</title></head>
<body style="font-family:system-ui,sans-serif;background:#0b1120;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <h1 style="font-size:30px;margin-bottom:8px">🚀 Tu app vive en el puerto 3500</h1>
    <p style="color:#94a3b8;margin:0">Edita <code style="color:#22d3ee">server.ts</code> en CerebroNico IDE y este preview se actualiza solo (piloto automático).</p>
  </div>
</body></html>\`);
});

app.listen(PORT, () => console.log("Servidor activo en puerto " + PORT));
`,
    language: "typescript",
    size: 720,
    modified: false,
  },
];

/**
 * v1.6.15 — 🐞 «aceitar la máquina»: el consejo del error acusaba al culpable
 * equivocado.
 *
 * Todo fallo del motor recibía el mismo sufijo: «Verifica que Ollama esté
 * activo o cambia a otro modelo disponible». Así que cuando fallaba un modelo
 * EN LA NUBE de Z.ai —como en la captura— el mensaje decía literalmente:
 *
 *   ❌ Z.ai no pudo responder para el modelo "glm-4.5v-flash": fetch failed.
 *   Verifica que Ollama esté activo…
 *
 * Es decir: el sistema sabía que había fallado Z.ai y te mandaba a revisar
 * Ollama. Dos servicios distintos, y encima Ollama no estaba en juego.
 *
 * El servidor ya nombra al proveedor real al principio del mensaje, así que el
 * consejo se deduce de ahí. Si NO hay pista del proveedor no se inventa a quién
 * culpar: se pide revisar la configuración del motor activo.
 */
function consejoDeError(errMsg: string): string {
  const m = String(errMsg || "");

  // v1.46.0 — 🐞 «el consejo culpaba al que no falló». Medido en la sesión del
  // usuario: un fallo de GEMINI terminaba con «Revisa la clave de Z.ai…». La
  // causa era este bucle: recorría el mensaje ENTERO y devolvía el primer
  // proveedor que apareciera. El diagnóstico de Gemini, para ser útil, nombra a
  // Z.ai y a Ollama como alternativas («Opciones que sí aguantan»), así que la
  // lista de alternativas del mensaje se leía como culpable. Ahora el proveedor
  // se deduce del ENCABEZADO —la línea que empieza con «❌ … no pudo responder»—
  // y el diagnóstico/«Detalle técnico» no participan. Si el mensaje ya trae su
  // propia salida (un `ollama pull`, una ruta de Config), no se añade nada: dos
  // consejos distintos sobre lo mismo se estorban.
  const yaTraeSuArreglo =
    /ollama pull|Config\s*→|Configuraci[oó]n PRO|Ejecuta\s*`/i.test(m);
  if (yaTraeSuArreglo) return "";

  // El encabezado es lo primero, hasta la primera línea en blanco. El orden de
  // la tabla importa: Google/Gemini va ANTES que Z.ai porque «Gemini» y «GLM»
  // pueden convivir en un mismo texto y el error 400/401 de Gemini no se
  // arregla con una clave de Z.ai.
  const encabezado = (m.split(/\n\s*\n/)[0] || m).trim();
  // v1.86.4 · «no es la clave del modelo». Medido el 28/10/2026: con el proceso del
  // IDE caído, cada mensaje salía con «Error de comunicación con gemini-3.5-flash:
  // Failed to fetch» y este consejo mandaba a revisar la clave de Google. La clave
  // estaba bien: el navegador no había llegado a /api/ai/stream, que contesta el
  // servidor local. El fallo de red del navegador se atiende ANTES de señalar a
  // cualquier proveedor, porque señala al órgano equivocado.
  if (PATRON_FALLO_DE_RED.test(encabezado)) return consejoFalloDeRed();
  const enLaNube: Array<[RegExp, string]> = [
    [/Gemini|Google/i, "Revisa la clave de Google AI Studio, la cuota y la conexión."],
    [/Z\.ai|GLM/i,     "Revisa la clave de Z.ai y la conexión: el motor no llegó a sus servidores."],
    [/OpenRouter/i,    "Revisa la clave de OpenRouter y la conexión: el motor no llegó a sus servidores."],
    [/OpenAI/i,        "Revisa la clave de OpenAI, la cuota y la conexión."],
    [/Groq/i,          "Revisa la clave de Groq, la cuota y la conexión."],
    [/Cerebras/i,      "Revisa la clave de Cerebras, la cuota y la conexión."],
    [/Together/i,      "Revisa la clave de Together AI, la cuota y la conexión."],
    [/Mistral/i,       "Revisa la clave de Mistral, la cuota y la conexión."],
    [/DeepSeek/i,      "Revisa la clave de DeepSeek, la cuota y la conexión."],
    [/Fireworks/i,     "Revisa la clave de Fireworks, la cuota y la conexión."],
  ];
  for (const [patron, texto] of enLaNube) if (patron.test(encabezado)) return texto;
  if (/Ollama/i.test(encabezado)) {
    return "Comprueba que Ollama esté arrancado y que el modelo esté descargado (ollama list).";
  }
  // Un encabezado que ya explica el corte por espera (watchdog) no necesita más.
  if (/no respondi[oó] a tiempo|no empez[oó] a responder/i.test(encabezado)) return "";
  return "Revisa la configuración del motor activo antes de cambiar de modelo.";
}

export const App: React.FC = () => {
  // v1.97.0 · ARRANQUE LIMPIO (Mario, 30/10): «arranca siempre con un proyecto viejo; tiene
  // que por default arrancar vacía — sandbox vacío, editor/árbol vacío, chat vacío — a no ser
  // que esté guardada sesión de algún chat». Y el efecto colateral que él mismo notó: con el hilo
  // viejo restaurado solo, el modelo volvía a ejecutar tareas de sesiones e incluso de
  // versiones anteriores.
  //
  // Se calcula UNA vez y antes de cualquier estado, porque los efectos de autoguardado de
  // abajo escriben `messages` apenas monta: si el estacionamiento viniera después, el hilo
  // anterior se pisaría con la ventana vacía y eso sí sería borrar trabajo ajeno.
  // Es idempotente (React puede ejecutar el inicializador dos veces en StrictMode): la firma
  // del hilo hace que la segunda vuelta no duplique el chat auto-guardado.
  const modoArranqueApp = useMemo(() => modoArranque(loadString(CLAVE_ARRANQUE)), []);
  const arranque = useMemo(() => {
    const crudos = {
      mensajes: loadJSON<ChatMessage[]>(LS_KEYS.MESSAGES, []),
      chats: loadJSON<SavedChat[]>(LS_KEYS.SAVED_CHATS, []),
      archivos: loadJSON<WorkspaceFile[]>(LS_KEYS.WORKSPACE_FILES, []),
      modo: modoArranqueApp,
    };
    const r = prepararArranque(crudos);
    if (r.hiloAparcado) saveJSON(LS_KEYS.SAVED_CHATS, r.chats);
    if (r.workspaceAparcado) {
      saveJSON(CLAVE_WORKSPACE_PREVIO, crudos.archivos);
      saveJSON(LS_KEYS.WORKSPACE_FILES, []);
      saveString(LS_KEYS.WORKSPACE_SEEDED, "1"); // y no volver a sembrar la plantilla
    }
    return r;
  }, [modoArranqueApp]);

  const [messages, setMessages] = useState<ChatMessage[]>(arranque.mensajes);

  // Carpeta de chats guardados: historiales completos con título editable
  const [savedChats, setSavedChats] = useState<SavedChat[]>(arranque.chats);
  /**
   * v1.0.44 · LOS CHATS BORRADOS, CON FECHA.
   * 🐞 El síntoma de Mario: «los borro y al abrir la app siguen estando, y se van
   * acumulando». Causa raíz en dos sitios que fusionaban por `id` haciendo UNIÓN
   * (cliente y servidor): borrar en pantalla nunca llegaba al disco, y el disco
   * reponía la copia en el arranque siguiente. Una lápida (id + cuándo) sí viaja:
   * cualquier copia anterior a esa fecha se descarta.
   */
  const [chatsEliminados, setChatsEliminados] = useState<EliminacionChat[]>(() =>
    loadJSON<EliminacionChat[]>(LS_KEYS.CHATS_ELIMINADOS, [])
  );
  const [activeChatTitle, setActiveChatTitle] = useState<string>(() => (arranque.mensajes.length ? loadString(LS_KEYS.ACTIVE_CHAT_TITLE) : ""));
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [actionLog, setActionLog] = useState<AgentAction[]>([]);

  const [currentStreamingText, setCurrentStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Model & Server State
  // v1.1 — DEFAULT cambiado a Z.ai + GLM-4.5-Flash (modelo 100% gratuito, sin tarjeta).
  //   El usuario solo necesita pegar su API key gratuita una vez y queda guardada para siempre.
  const hadExplicitProviderRef = useRef<boolean>(Boolean(loadString(LS_KEYS.PROVIDER).trim()));
  const geminiBootstrappedRef = useRef<boolean>(false);
  const [provider, setProvider] = useState<ModelProvider>(() => {
    const p = loadString(LS_KEYS.PROVIDER);
    if (p === "gemini" || p === "openrouter" || p === "custom" || p === "openai"
        || p === "zai" || p === "groq" || p === "cerebras"
        || p === "together" || p === "mistral" || p === "deepseek" || p === "fireworks"
        || p === "cerebro") {
      return p as ModelProvider;
    }
    return "cerebro";
  });
  const [currentModel, setCurrentModel] = useState<string>(() => loadString(LS_KEYS.CURRENT_MODEL, "cerebro/auto"));
  const [ollamaApiKey, setOllamaApiKey] = useState<string>("");
  const [ollamaUrl, setOllamaUrl] = useState<string>(() => loadString(LS_KEYS.OLLAMA_URL, DEFAULT_OLLAMA_URL));
  const [responseLanguage, setResponseLanguage] = useState<string>(() => loadString(LS_KEYS.RESPONSE_LANGUAGE, "es"));
  const [expertMode, setExpertMode] = useState<string>(() => loadString(LS_KEYS.EXPERT_MODE, "general"));
  const [openrouterApiKey, setOpenrouterApiKey] = useState<string>(() => loadString(LS_KEYS.OPENROUTER_KEY));
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => loadString(LS_KEYS.GEMINI_API_KEY));
  const [customServerUrl, setCustomServerUrl] = useState<string>(() => loadString(LS_KEYS.CUSTOM_SERVER_URL));
  const [customApiKey, setCustomApiKey] = useState<string>(() => loadString(LS_KEYS.CUSTOM_API_KEY));
  // 🔧 OpenAI directo (provider "openai") — clave sk-proj-...
  const [openaiApiKey, setOpenaiApiKey] = useState<string>(() => loadString(LS_KEYS.OPENAI_API_KEY));
  // v1.1 — Dedicated cloud provider API keys:
  const [zaiApiKey, setZaiApiKey] = useState<string>(() => loadString(LS_KEYS.ZAI_API_KEY));
  const [groqApiKey, setGroqApiKey] = useState<string>(() => loadString(LS_KEYS.GROQ_API_KEY));
  const [cerebrasApiKey, setCerebrasApiKey] = useState<string>(() => loadString(LS_KEYS.CEREBRAS_API_KEY));
  const [togetherApiKey, setTogetherApiKey] = useState<string>(() => loadString(LS_KEYS.TOGETHER_API_KEY));
  const [mistralApiKey, setMistralApiKey] = useState<string>(() => loadString(LS_KEYS.MISTRAL_API_KEY));
  const [deepseekApiKey, setDeepseekApiKey] = useState<string>(() => loadString(LS_KEYS.DEEPSEEK_API_KEY));
  const [fireworksApiKey, setFireworksApiKey] = useState<string>(() => loadString(LS_KEYS.FIREWORKS_API_KEY));
  // Modo Agente PC: habilita que el chat delegue acciones REALES a la PC vía puente :5000
  // v1.73.0 · AGENTE PC SIEMPRE ACTIVO por defecto («deben estar activas
  // siempre y quitar el interruptor»): quien nunca tocó el switch ya lo tiene
  // encendido; quien lo apagó a propósito conserva su decisión (el valor
  // guardado manda). El interruptor sobrevive en el menú «Ajustes» del chat.
  const [pcMode, setPcMode] = useState<boolean>(() => {
    // loadString devuelve "" cuando la tecla no existe: el fallback "1" es lo
    // que hace que un usuario nuevo (o un navegador limpio) arranque ON.
    return loadString(LS_KEYS.PC_MODE, "1") === "1";
  });

  // ═══════════════════════════════════════════════════════════════════════
  // v1.73.0 · CANAL DIRECTO — estado de la carpeta/ZIP de proyecto.
  // La vinculación vive en el server (.cerebro-db/carpeta-vinculada.json) y
  // aquí se refleja para: el chip de la barra, el modal y — lo importante —
  // la inyección en el system prompt de cada turno (ver extraParts en
  // handleSendMessageWithRAG). El ref evita closures viejas en el envío.
  // ═══════════════════════════════════════════════════════════════════════
  const [carpetaVinculada, setCarpetaVinculada] = useState<CarpetaVinculadaEstado | null>(null);
  const [modalCarpetaAbierto, setModalCarpetaAbierto] = useState(false);
  const carpetaVinculadaRef = useRef<CarpetaVinculadaEstado | null>(null);
  carpetaVinculadaRef.current = carpetaVinculada;
  useEffect(() => {
    // Al arrancar: recuperar la vinculación vigente (resiste recargas y reinicios).
    fetch("/api/carpeta/estado")
      .then((r) => r.json())
      .then((r) => { if (r?.ok && r.vinculada) setCarpetaVinculada(r.vinculada as CarpetaVinculadaEstado); })
      .catch(() => { /* sin server (p. ej. preview estático): sin canal directo */ });
  }, []);
  // Topología de subagentes (estado en vivo)
  const [subagents, setSubagents] = useState<{ bridge: string; items: SubagentItem[] }>({ bridge: "http://127.0.0.1:5000", items: [] });
  const [temperature, setTemperature] = useState<number>(() => {
    const n = Number(loadString(LS_KEYS.TEMPERATURE));
    return Number.isFinite(n) && loadString(LS_KEYS.TEMPERATURE) !== "" ? n : 0.5;
  });
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  // Workspace Files
  // 🔧 CORRECCIÓN CRÍTICA (bug "editor con un .bat"): solo sembramos INITIAL_WORKSPACE_FILES
  // en el PRIMER arranque (cuando WORKSPACE_SEEDED no existe). Si el usuario ya tiene
  // un workspace persistido (aunque sea un solo archivo .bat), respetamos eso y NO
  // forzamos la plantilla base. Esto evita el bug "borro y se regenera".
  // v1.97.0 · el árbol viene del ARRANQUE LIMPIO: vacío salvo preferencia explícita de
  // restaurar. Antes se auto-cargaba `codigo0_workspace_files` (y en el primer arranque se
  // sembraba la plantilla), que es literalmente el "proyecto viejo" de la queja. Recuperar
  // sigue existiendo: Menú CN → «Recuperar workspace anterior», «Abrir .cn / .zip» y el botón
  // «Plantilla» de siempre.
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>(arranque.archivos);
  // Espejo de `workspaceFiles` para poder LEER los archivos actuales desde código
  // asíncrono sin meter efectos dentro del actualizador de `setWorkspaceFiles`.
  // Un actualizador debe ser PURO: React lo puede invocar dos veces (StrictMode) y
  // cualquier `setState` de dentro se duplicaría — líneas repetidas en el registro.
  const workspaceFilesRef = useRef<WorkspaceFile[]>(workspaceFiles);
  workspaceFilesRef.current = workspaceFiles;

  // v1.97.0 · RECUPERAR EL ÁRBOL DE LA SESIÓN ANTERIOR. El arranque limpio no borra nada:
  // estaciona el árbol en `codigo0_workspace_previo`. Este es el camino de vuelta, y es un
  // INTERCAMBIO: si el usuario ya estaba trabajando, lo que había queda aparcado en lugar del
  // recuperado (así puede volver atrás sin perder ninguno de los dos).
  // La preferencia se puede Cambiar desde el Menú CN. Sin boton seria una capacidad declarada
  // sin camino: el codigo leeria `codigo0_arranque` y nadie podria escribirlo jamas.
  const [preferenciaArranque, setPreferenciaArranque] = useState<"vacio" | "restaurar">(modoArranqueApp);
  const handleCambiarArranque = useCallback(() => {
    const nuevo = preferenciaArranque === "vacio" ? "restaurar" : "vacio";
    saveString(CLAVE_ARRANQUE, nuevo);
    setPreferenciaArranque(nuevo);
    setTerminalLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 🚪 Al abrir la próxima ventana: ${nuevo === "vacio" ? "VACÍA (chat y árbol arrancan limpios)" : "se restaura el chat y el árbol de donde los dejaste"}.`]);
  }, [preferenciaArranque]);

  const [hayWorkspacePrevio, setHayWorkspacePrevio] = useState<boolean>(() => {
    const p = loadJSON<WorkspaceFile[] | null>(CLAVE_WORKSPACE_PREVIO, null);
    return Array.isArray(p) && p.length > 0;
  });
  const handleRestorePreviousWorkspace = useCallback(() => {
    const previo = loadJSON<WorkspaceFile[] | null>(CLAVE_WORKSPACE_PREVIO, null);
    if (!previo || previo.length === 0) {
      setTerminalLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 📦 No hay workspace aparcado que recuperar.`]);
      return;
    }
    const antes = workspaceFilesRef.current;
    setWorkspaceFiles(previo);
    setActiveFileId(previo[0]?.id ?? null);
    saveJSON(CLAVE_WORKSPACE_PREVIO, antes.length > 0 ? antes : previo);
    setHayWorkspacePrevio(true);
    setTerminalLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 📦 Workspace anterior restaurado (${previo.length} archivo(s)).${antes.length ? ` Lo que había quedó aparcado en su lugar (${antes.length}).` : ""}`]);
  }, []);
  const [activeFileId, setActiveFileId] = useState<string | null>(() => arranque.archivos[0]?.id ?? null);

  // Pending Attachments & Message Queue
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentItem[]>([]);
  /**
   * v8.0.3 — Nombres de los adjuntos que aún se están procesando.
   *
   * Existe porque el defecto de fondo no era el icono: `handleAddAttachments`
   * acumulaba TODO en un array local y lo volcaba al estado UNA sola vez al
   * terminar el bucle. Con treinta imágenes, la tira de adjuntos se quedaba
   * vacía treinta veces el tiempo de una, y luego aparecían las treinta de golpe.
   * Desde fuera eso se ve como «el IDE se ha colgado», y el usuario no tiene
   * forma de saber cuál de los treinta archivos está atascando la cola.
   *
   * Con esta lista, cada archivo que entra en el bucle aparece YA en pantalla
   * como chip fantasma con su nombre, y se retira en cuanto su miniatura está
   * lista. Se ve qué falta y qué ya está.
   */
  const [attachmentsCargando, setAttachmentsCargando] = useState<string[]>([]);
  const [messageQueue, setMessageQueue] = useState<QueuedMessageItem[]>([]);
  const messageQueueRef = useRef<QueuedMessageItem[]>([]);
  messageQueueRef.current = messageQueue;
  /**
   * v1.0.20 · DESENCOLAR = UNA SOLA PUERTA. Había cuatro copias del mismo bloque
   * (`[nextItem, ...resto]`, `setMessageQueue(resto)`, log, `setTimeout(...)`):
   * fin de turno normal, fin de turno con error, fin del enjambre y el
   * auto-llamado. Cuatro copias son cuatro maneras de perder la marca `lanzadoEn`
   * y cuatro maneras de olvidar que el turno anterior pudo escribir archivos.
   * Acá se toma el PRIMERO de la cola (que es el lanzado cuando lo hay), se le
   * pasa la nota de «juntate con lo ya hecho» si fue lanzado hace poco, y se
   * envía por la boca única (`handleSendMessageWithRAGRef`).
   */
  const desencolarSiguiente = (historyForNext?: ChatMessage[]) => {
    const cola = messageQueueRef.current;
    if (!Array.isArray(cola) || cola.length === 0) return false;
    const [nextItem, ...resto] = cola;
    const esLanzado = esLanzadoReciente(nextItem, Date.now());
    const nota = notaDelLanzado(nextItem, Date.now());
    setMessageQueue(resto);
    messageQueueRef.current = resto;
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] ${esLanzado ? "▶️ Sale el mensaje lanzado" : "⏳ Desencolando mensaje"}: "${String(nextItem.text || "").slice(0, 30)}…" (${resto.length} restantes).`,
    ]);
    const texto = nota ? `${nota}\n\n${nextItem.text}` : nextItem.text;
    setTimeout(() => {
      try {
        if (historyForNext) executeSendMessage(texto, nextItem.attachments || [], historyForNext);
        else handleSendMessageWithRAGRef.current(texto, nextItem.attachments || []);
      } catch { /* la cola no puede romper el chat */ }
    }, 100);
    return true;
  };
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const availableModelsCountRef = useRef(availableModels.length);
  availableModelsCountRef.current = availableModels.length;
  const refreshingOllamaRef = useRef(false);
  const lastTelemetryOllamaRetryRef = useRef(0);

  // Bucle autónomo de compilación (compila -> corrige -> recompila)
  const afterStreamRef = useRef<(() => void) | null>(null);
  const buildFixRef = useRef<{ active: boolean; iteration: number; max: number }>({
    active: false,
    iteration: 0,
    max: 5,
  });
  // v1.72.0 — EL BUCLE TIENE CARA. buildFixRef manda de verdad (es síncrono y no
  // re-renderiza); esto es SOLO su espejo visible, para que el botón «Compilar»
  // diga en qué vuelta va y para que un segundo clic no monte otro bucle encima.
  const [buildFixUI, setBuildFixUI] = useState({ active: false, iteration: 0, max: 5 });

  // Persistencia de sesión: historial, workspace y ajustes sobreviven a recargas
  useEffect(() => {
    saveJSON(LS_KEYS.MESSAGES, messages);
  }, [messages]);

  useEffect(() => {
    saveJSON(LS_KEYS.SAVED_CHATS, savedChats);
  }, [savedChats]);

  useEffect(() => {
    saveJSON(LS_KEYS.CHATS_ELIMINADOS, chatsEliminados);
  }, [chatsEliminados]);

  useEffect(() => {
    saveString(LS_KEYS.ACTIVE_CHAT_TITLE, activeChatTitle);
  }, [activeChatTitle]);

  useEffect(() => {
    saveJSON(LS_KEYS.WORKSPACE_FILES, workspaceFiles);
  }, [workspaceFiles]);

  useEffect(() => {
    saveString(LS_KEYS.CURRENT_MODEL, currentModel);
    saveString(LS_KEYS.TEMPERATURE, String(temperature));
    saveString(LS_KEYS.PROVIDER, provider);
    saveString(LS_KEYS.PC_MODE, pcMode ? "1" : "0");
  }, [currentModel, temperature, provider, pcMode]);

  // 🔧 Persistencia de API keys (Gemini + OpenRouter + OpenAI) en localStorage
  useEffect(() => {
    saveString(LS_KEYS.OPENROUTER_KEY, openrouterApiKey);
  }, [openrouterApiKey]);
  useEffect(() => {
    saveString(LS_KEYS.GEMINI_API_KEY, geminiApiKey);
  }, [geminiApiKey]);
  useEffect(() => {
    saveString(LS_KEYS.OPENAI_API_KEY, openaiApiKey);
  }, [openaiApiKey]);

  // UI Panels & Resizable Desplazadores (Splitters)
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);
  /**
   * v1.99.9 · ancho de la ventana, para graduar la horma del chat. Lo mantiene al día el mismo
   * `resize` que ya escucha el auto-fit de paneles: no se agregó un segundo listener.
   */
  const [anchoVentanaPx, setAnchoVentanaPx] = useState<number>(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = loadString(LS_KEYS.LEFT_WIDTH);
    return saved ? Math.max(220, Math.min(600, Number(saved))) : 320;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = loadString(LS_KEYS.RIGHT_WIDTH);
    return saved ? Math.max(300, Math.min(850, Number(saved))) : 540;
  });
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  // UX v1 — Centro de Estado y Ayuda (estado, dependencias, flujos, atajos, ayuda).
  const [isCentroUXOpen, setIsCentroUXOpen] = useState(false);
  const [seccionUX, setSeccionUX] = useState<SeccionUX>("estado");
  // Ref vivo a «nuevo chat» para que el atajo lo invoque sin crear ciclos de deps.
  const handleNewChatRef = useRef<() => void>(() => {});
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [maxRamGb, setMaxRamGb] = useState<number>(8);
  const [ramUsageMb, setRamUsageMb] = useState<number>(76);

  // v1.1 — Asistente de bienvenida Z.ai (se muestra al primer arranque si no hay clave Z.ai).
  //   El usuario lo puede cerrar ("Saltar por ahora") y volver a abrirlo desde el botón
  //   de la izquierda del panel de chat. La clave Z.ai es gratuita (sin tarjeta).
  const [isZaiWizardOpen, setIsZaiWizardOpen] = useState<boolean>(() => {
    try {
      const dismissed = localStorage.getItem(LS_KEYS.ZAI_WIZARD_DISMISSED) === "1";
      return !dismissed;
    } catch {
      return true;
    }
  });

  // 🔧 Modo de vista: 'ide' (3 columnas) | 'web-editor' (pantalla completa dedicada)
  // v2.0 — 'web-editor' ya no sustituye la interfaz: vive como PESTAÑA central.
  const [activeView, setActiveView] = useState<"ide" | "web-editor">("ide");

  // ============================================================
  // v2.0 — ESTADO NUEVO DEL HÍBRIDO
  // ============================================================

  /** Tamaño global de texto (v1.9): escala TODA la app desde <html> */
  const [appFontSize, setAppFontSize] = useState<number>(() => {
    const saved = loadString(LS_KEYS.APP_FONT_SIZE);
    const n = saved ? Number(saved) : NaN;
    // v1.6.16 — los topes se leen de APP_FONT_SIZES en vez de ir escritos a
    // mano. Antes eran literales (14 y 25) duplicados en dos sitios, y al
    // ampliar el rango por abajo el literal se habría quedado recortando el
    // valor guardado sin que nadie se enterara.
    const min = APP_FONT_SIZES[0];
    const max = APP_FONT_SIZES[APP_FONT_SIZES.length - 1];
    return Number.isFinite(n) && n >= min && n <= max ? n : APP_FONT_SIZE_DEFAULT;
  });

  /**
   * Preferencia del MODO LIVIANO (antes «Modo 8 GB», un nombre que se leía como si fuera la
   * máquina). Tres estados: `auto` manda con la RAM medida, `8gb` y `pleno` son la palabra del
   * usuario por encima de la medición. Sin backdrop-blur ni animaciones infinitas = menos GPU/CPU.
   */
  const [perfMode, setPerfMode] = useState<ModoPerf>(() => normalizarModoPreferido(loadString(LS_KEYS.PERF_MODE)));
  /** La decisión aplicada (con su fuente y su lectura), para que el chip pueda explicarlos. */
  const [perf, setPerf] = useState<DecisiónPerf | null>(null);

  /** Configuración pro (menú de la 1.8, portado) */
  const [proSettings, setProSettings] = useState<ProSettings>(() => loadProSettings());
  const [isProConfigOpen, setIsProConfigOpen] = useState(false);
  /** v2.0 — Gestor de extensiones */
  const [isExtensionManagerOpen, setIsExtensionManagerOpen] = useState(false);
  const [wallpaperPreset, setWallpaperPreset] = useState<string>(() => {
    const saved = loadString("codigo0_wallpaper_preset");
    // v1.15.1 — el cerebro por defecto ahora es el preset "predeterminado", no
    // "aurora": así el fondo por defecto es el de siempre y el panel Pro puede
    // cambiarlo de verdad.
    return saved && WALLPAPER_PRESETS.some((p) => p.id === saved) ? saved : "predeterminado";
  });

  /** Ventana de memoria de conversación: mensajes recientes íntegros (>50 por defecto) */
  const [historyWindow, setHistoryWindow] = useState<number>(() => {
    const saved = loadString("codigo0_history_window");
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= 10 ? n : 60;
  });

  /** Carpeta de modelos favoritos (v2.0) */
  const [favoriteModels, setFavoriteModels] = useState<FavoriteModel[]>(() => loadFavoriteModels());
  // v1.77.0 · memoria del relevo EN CURSO (se reinicia en cada turno de usuario)
  // v1.80.0 · FASE 1: la memoria del turno también trae `intentos`, la traza que
  // alimenta el informe honesto cuando la cascada se agota.
  const relevoTurnoRef = useRef<{ activado: boolean; relevosEsteTurno: number; probados: string[]; texto: string; adjuntos: AttachmentItem[]; intentos: IntentoRelevo[] }>({ activado: false, relevosEsteTurno: 0, probados: [], texto: "", adjuntos: [], intentos: [] });
  // v1.80.0 · FASE 1 punto 4: telemetría de relevo por SESIÓN (consola, no red).
  const relevoSesionRef = useRef<RegistroRelevo[]>([]);
  // v1.80.0 · FASE 1 punto 2 (la cascada necesita MEMORIA): cuando el relevo
  // re-entra por el mismo sender, el turno nuevo HEREDA el contador, los
  // probados y la traza. Sin esto, cada relevo abriría un turno "limpio" y el
  // tope de 2 nunca se alcanzaría: el tope se mide sobre la ráfaga original.
  const relevoContinuacionRef = useRef<{ relevosEsteTurno: number; probados: string[]; intentos: IntentoRelevo[]; texto: string; adjuntos: AttachmentItem[] } | null>(null);
  // v1.80.0 · el espejo de las capacidades del motor en el navegador, para que el
  // cambio de un interruptor se vea sin recargar (la fuente vive en capacidadesMotor).
  const [capacidadesMotor, setCapacidadesMotor] = useState<Record<string, boolean>>({});
  // v1.83.0 · FASE 4 · MODO LIMPIO: un solo dueno del estado (App), sin switches
  // sueltos por panel. Encendido esconde la barra izquierda: quedan el chat y
  // el panel derecho (editor/preview). Se recuerda entre sesiones.
  const [modoLimpio, setModoLimpio] = useState<boolean>(() => {
    try { return localStorage.getItem("cn_modo_limpio") === "1"; } catch { return false; }
  });
  const toggleModoLimpio = () => setModoLimpio((v) => {
    const n = !v;
    try { localStorage.setItem("cn_modo_limpio", n ? "1" : "0"); } catch { /* sin storage: no se recuerda */ }
    return n;
  });
  // v1.80.0 · FASE 1 punto 1: el panel de capacidades manda de verdad. Al abrir la
  // IDE se lee el estado del MOTOR y uno se suscribe a los cambios, así cuando
  // Mario enciende «Relevo automático» desde el laboratorio NO hace falta
  // recargar el navegador para que el efecto exista (antes era un `localStorage`
  // que cada tanto alguno escribía a mano en la consola).
  useEffect(() => {
    void refrescarCapacidades().then((c) => setCapacidadesMotor(c));
    const dejar = suscribirCapacidades((e) => setCapacidadesMotor({ ...e.activos }));
    return dejar;
  }, []);

  /** Extensiones instaladas + pestañas centrales */
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [centerTabs, setCenterTabs] = useState<CenterTab[]>([
    // v1.97.4 · LA PESTAÑA PLANIFICADOR QUEDÓ FUERA (pedido de Mario, 31/10):
    // «quita la pestaña y deja la función activa en automático en segundo
    // plano». La planificación sigue corriendo igual (el motor crea planes
    // aunque nadie mire); se ve en la barra de Tareas (siempre visible, arriba
    // a la derecha) y, a pedido, en el overlay «Panel completo».
    { id: "chat", label: "Chat", kind: "chat", pinned: true },
    // v2.0 — La autosuperación es una pestaña fija: siempre visible, siempre medible.
    { id: "self-improvement", label: "Superación", kind: "custom", pinned: true },
    // QUIRÓFANO HD v1 — misma ley: el guardián de cambios se ve y se toca.
    { id: "quirofano", label: "Quirófano", kind: "custom", pinned: true },
  ]);
  const [activeCenterTab, setActiveCenterTab] = useState<string>("chat");
  const activeCenterTabRef = useRef<string>("chat");
  activeCenterTabRef.current = activeCenterTab;
  // v1.97.4 · el panel COMPLETO de planes (tablero + hoja) ya no es pestaña
  // central: es un overlay que SOLO el usuario abre desde «Panel completo» de
  // la barra de Tareas. El motor nunca lo trae al frente.
  const [planPanelAbierto, setPlanPanelAbierto] = useState<boolean>(false);

  const telemetriaSesion = useMemo(
    () =>
      calcularTelemetriaSesion({
        messages,
        workspaceFiles,
        currentModel,
      }),
    [messages, workspaceFiles, currentModel]
  );

  const handleCompactarHistorial = useCallback(() => {
    const res = compactarHistorialSeguro(messagesRef.current, 8);
    if (res.compactados <= 0) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ℹ️ Historial con ${res.conservados} turno(s): no requiere compactación todavía.`,
      ]);
      return;
    }
    setMessages(res.messages);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🗜️ Historial compactado: ${res.compactados} mensaje(s) resumido(s), ${res.conservados} reciente(s) intactos (${res.caracteresAhorrados.toLocaleString("es-UY")} caracteres liberados).`,
    ]);
  }, []);

  /** Comando de extensión pendiente (viene de "/comando" escrito en el chat) */
  const [pendingExtCommand, setPendingExtCommand] = useState<{ extId: string; commandId: string } | null>(null);

  /** Estado real del editor web (alimenta el indicador del panel) */
  const [webEditorStatus, setWebEditorStatus] = useState<WebEditorStatus>({ phase: "idle" });
  const webEditorOrderRef = useRef(false);

  // ============================================================
  // v1.16.6 — MODO EDITOR: UN SOLO CHAT, EL CENTRAL
  // ------------------------------------------------------------
  // El editor web tenía su propia caja de órdenes y además publicaba cada orden
  // en el chat central: DOS entradas para la misma acción («el doble chat»). El
  // pedido fue quitar la del editor y que SOLO el chat central le dé la orden.
  // Este flag, con su chip en ChatCenter, decide si lo que se escribe en el chat
  // central se envuelve como orden de diseño (sendWebEditorOrder) o viaja como
  // conversación normal. Se recuerda entre sesiones; solo tiene sentido (y solo
  // se muestra) cuando la pestaña «Editor web» está abierta.
  // ============================================================
  const [editorMode, setEditorMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEYS.WEB_EDITOR_MODE) === "1";
    } catch {
      return false;
    }
  });
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;
  // Puente al callback, que se declara más abajo (misma técnica que
  // handleSendMessageWithRAGRef: el orden de declaración no puede morder).
  const sendWebEditorOrderRef = useRef<(prompt: string) => void>(() => {});
  const toggleEditorMode = useCallback(() => {
    setEditorMode((v) => {
      const next = !v;
      try {
        localStorage.setItem(LS_KEYS.WEB_EDITOR_MODE, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  // La pestaña del editor abierta o no. v1.48.3 — el chip del editor es visible
  // cuando el Modo Editor está ON *o* la pestaña está abierta, para que Mario
  // siempre vea el estado real y pueda apagarlo cuando quiera.
  const editorTabOpen = centerTabs.some((t) => t.id === "web-editor");

  // ============================================================
  // v1.16.6 — MODO DE PENSAMIENTO DESDE EL CHAT (chip «Pensar: …»)
  // ------------------------------------------------------------
  // El selector existía SOLO en el menú Pro y además era un regulador mudo:
  // `ai.executionMode` no lo leía nadie. El chip escribe en el MISMO
  // `proSettings` (única fuente: el useEffect de applyProSettings/saveProSettings
  // lo persiste y el ProConfigPanel lo pinta en vivo), así que botón visible y
  // menú Pro no pueden divergir. La directriz viaja al system prompt en
  // handleSendMessageWithRAG (buscar «directrizPensamiento»).
  // ============================================================
  const cycleThinkingMode = useCallback(() => {
    setProSettings((prev) => ({
      ...prev,
      ai: { ...prev.ai, executionMode: siguienteModo((prev as any)?.ai?.executionMode) },
    }));
  }, []);

  // v1.52.5 — CICLO DEL NIVEL DE RAZONAMIENTO GEMINI (Bajo → Medio → Alto → Bajo)
  const cycleGeminiThinkingLevel = useCallback(() => {
    setProSettings((prev) => ({
      ...prev,
      ai: { ...prev.ai, geminiThinkingLevel: siguienteNivelRazon((prev as any)?.ai?.geminiThinkingLevel) },
    }));
  }, []);

  /** Pantalla completa del contenedor principal (botón del Header) */
  const [isAppFullscreen, setIsAppFullscreen] = useState(false);

  /** ¿Está vivo el sandbox :3500? Se consulta cada 15 s para poder explicar un
      preview vacío en el editor web en vez de mostrar un rectángulo blanco. */
  /**
   * v8.0.3 — 🐞 ESTE ESTADO ESTABA MUERTO Y MENTÍA.
   *
   * Estaba declarado con valor inicial `true` y **`setSandboxRunning` no se
   * llamaba en ningún sitio del proyecto**. Es decir: el editor web recibía
   * siempre «sandbox activo», pintaba el punto en verde y no mostraba el aviso
   * de «no está corriendo» — justo el aviso que existía para explicar el preview
   * en blanco. Un indicador fijo en verde tapando el único fallo que tenía que
   * anunciar, que es de las peores cosas que puede hacer un indicador.
   *
   * Ahora se pregunta de verdad y se refresca cada 6 s. El `false` inicial es
   * deliberado: si al arrancar la IDE el sandbox no está, es más honesto empezar
   * en «no» y corregir cuando responda, que empezar en «sí» y no corregir nunca.
   */
  const [sandboxRunning, setSandboxRunning] = useState<boolean>(false);

  /** 🐞 v2.0 — Evita que la autodetección de Z.ai vuelva a pisar el modelo elegido. */
  const zaiAutoSelectRef = useRef<boolean>(false);

  /** v2.0 — Pantalla de carga inicial (se cierra sola al terminar el arranque). */
  const [isBooting, setIsBooting] = useState(true);

  /** Espejo del tamaño de fuente para el zoom con Ctrl+rueda (evita cierres obsoletos). */
  const appFontSizeRef = useRef<number>(appFontSize);
  useEffect(() => {
    appFontSizeRef.current = appFontSize;
  }, [appFontSize]);

  /**
   * v2.0 — ZOOM CON Ctrl + RUEDA (el ajuste de la v1.1: era infaltable).
   * ------------------------------------------------------------
   * Se aplica al tamaño de fuente global de <html>, y como todo el layout usa
   * rem, escala la interfaz COMPLETA sin descolocar los paneles
   * redimensionables ni el iframe del previsualizador.
   *   Ctrl + rueda  → subir / bajar
   *   Ctrl + 0      → volver al 100 %
   *   Ctrl + +/-    → lo mismo desde el teclado
   */
  useEffect(() => {
    const STEPS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const clamp = (n: number) => Math.max(0, Math.min(STEPS.length - 1, n));
    const index = () => {
      const i = STEPS.indexOf(appFontSizeRef.current);
      return i < 0 ? STEPS.indexOf(15) : i;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = STEPS[clamp(index() + (e.deltaY < 0 ? 1 : -1))];
      if (next !== appFontSizeRef.current) setAppFontSize(next);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key;
      if (k === "0") {
        e.preventDefault();
        setAppFontSize(15);
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        setAppFontSize(STEPS[clamp(index() + 1)]);
      } else if (k === "-" || k === "_") {
        e.preventDefault();
        setAppFontSize(STEPS[clamp(index() - 1)]);
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // ============================================================
  // v2.0 — AUTOSUPERACIÓN: telemetría del prompt y del turno
  // ============================================================
  // v1.72.0 — FUERA promptInfoState: se escribía en cada turno y nunca lo leía
  // nadie. El dato sí se usa — sale al terminal desde contextPayload.promptInfo
  // en el mismo sitio donde antes se guardaba el estado.
  const [lastLesson, setLastLesson] = useState<Lesson | null>(null);
  const [improvementSummary, setImprovementSummary] = useState(() => getImprovementSummary());
  /** Inicio del turno actual y tiempo hasta el primer token (ms) */
  const turnStartRef = useRef<number>(0);
  const firstTokenRef = useRef<number>(0);

  /**
   * Herramientas que el prompt anuncia al modelo. Se derivan del PERFIL, no de
   * una lista fija: a un modelo micro no se le prometen herramientas (se lo
   * diríamos y no podría usarlas), y a uno grande se le enumeran todas.
   */
  const agentToolsHint = React.useMemo(() => {
    const profile = getModelProfile(currentModel);
    if (!profile.toolCapable) return [];
    return [
      "set_plan", "update_task", "list_files", "read_file", "read_file_range",
      "write_file", "edit_file", "append_file", "search_in_files", "make_dir",
      "delete_file", "run_command", "run_tests", "git_status", "git_diff",
      "git_commit", "fetch_url",
      ...(pcMode ? ["pc_info", "pc_exec", "pc_write_file", "pc_read_file", "pc_list_dir", "pc_delete"] : []),
    ];
  }, [currentModel, pcMode]);

  // 🔧 ConfigModal: Panel de Control y Compatibilidad
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [ideConfig, setIdeConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("cerebronico_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      autoSync: true,
      slmDetection: true,
      streamResponse: true,
      sandboxPort: "3500",
      ollamaUrl: DEFAULT_OLLAMA_URL,
      themeMode: "dark",
    };
  });

  const handleUpdateConfig = (updates: Partial<typeof ideConfig>) => {
    setIdeConfig((prev: typeof ideConfig) => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem("cerebronico_settings", JSON.stringify(next)); } catch {}
      // 🔧 Aplicar cambios en vivo:
      if (updates.ollamaUrl !== undefined) {
        setOllamaUrl(updates.ollamaUrl);
        saveString(LS_KEYS.OLLAMA_URL, updates.ollamaUrl);
      }
      if (updates.slmDetection !== undefined) {
        // Si se desactiva SLM, resetear el estado SLM
        if (!updates.slmDetection) {
          slmInfoRef.current = { isSLM: false, estimatedBillionParams: null, recommendedContextWindow: 8192, reason: "Detector SLM desactivado", category: "unknown" };
          setSlmState({ isSLM: false, category: "unknown", params: null });
        } else {
          // Si se activa, recalcular
          const info = detectSLM(currentModelRef.current);
          slmInfoRef.current = info;
          setSlmState({ isSLM: info.isSLM, category: info.category, params: info.estimatedBillionParams });
        }
      }
      if (updates.themeMode !== undefined) {
        // Aplicar tema
        if (updates.themeMode === "glass") {
          document.body.classList.add("glass-mode");
        } else {
          document.body.classList.remove("glass-mode");
        }
      }
      return next;
    });
  };

  // 🔧 Fondo de pantalla personalizado (imagen del cerebro subida por el usuario)
  // 🔧 Usamos IndexedDB (no localStorage) porque las imágenes pesan 1-5 MB y
  // localStorage se llena ("QuotaExceededError"). IndexedDB es persistente y sin límite práctico.
  // v1.15.1 — El fondo por defecto (el cerebro) ya NO es una imagen
  // "personalizada" embebida a mano: ahora es el preset «predeterminado» de
  // WALLPAPER_PRESETS. `customBg` queda RESERVADO para la imagen que el usuario
  // sube de verdad (menú CN o «Imagen propia» del panel Pro). Con el valor
  // antiguo, `customBg` siempre estaba lleno y AppBackground le daba prioridad
  // sobre todo el panel Pro → el menú Pro de fondo «no andaba».
  const [customBg, setCustomBg] = useState<string>("");

  // v1.7.1 — LA URL DE OBJETO DEL FONDO SE GUARDA PARA PODER SOLTARLA.
  // El fondo se guarda como Blob (para que 100 MB sean posibles), y un Blob se
  // pinta con `URL.createObjectURL`: mientras esa URL viva, el navegador retiene
  // el archivo ENTERO en memoria. Cambiar de fondo sin soltar la anterior deja
  // el anterior cargado: con fondos de decenas de MB eso se nota, y sólo aparece
  // cuando alguien sube el límite — nunca antes.
  const fondoUrlRef = useRef<string>("");
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Al iniciar: migrar de localStorage (versiones viejas) y cargar desde IndexedDB
  useEffect(() => {
    (async () => {
      await migrateBackgroundFromLocalStorage();
      const img = await loadBackgroundImage();
      if (img) {
        // v1.7.1 — `img` puede ser un Blob (lo nuevo) o un data URL (lo viejo):
        // `urlDeFondo` resuelve los dos casos.
        const url = urlDeFondo(img);
        fondoUrlRef.current = url;
        setCustomBg(url);
      }
    })();
    // Al desmontar, la URL de objeto se libera: si no, el fondo se queda en
    // memoria mientras la pestaña viva.
    return () => revocarFondo(fondoUrlRef.current);
  }, []);

  // ─── v1.9.0 · EL WORKSPACE YA NO SE PIERDE AL PASAR DE 5 MB ───────────────
  // Causa raíz: `saveJSON` avisaba por consola y no devolvía nada, así que el
  // IDE seguía como si hubiera guardado. Ahora `storage.ts` rescata al almacén
  // grande (IndexedDB) y deja un puntero. `loadJSON` es síncrono y no puede
  // esperar a IndexedDB, así que el valor real vuelve AQUÍ: sin este efecto, el
  // rescate sería otro sitio donde perderse.
  useEffect(() => {
    void (async () => {
      try {
        const grandes = await restaurarDeAlmacenGrande([
          LS_KEYS.WORKSPACE_FILES,
          LS_KEYS.MESSAGES,
          LS_KEYS.SAVED_CHATS,
        ]);
        const claves = Object.keys(grandes);
        if (claves.length === 0) return;
        // v1.97.0 · el almacén grande guarda LO MISMO que localStorage (solo que cabe más).
        // En modo vacío, lo que aparezca de allí es la SESIÓN ANTERIOR: aparcar, no abrir.
        // Si de acá se restauraba el hilo, el arranque limpio se desarmaba solo en equipos
        // con proyectos grandes — exactamente el caso del usuario que más lo sufre.
        if (modoArranqueApp === "restaurar") {
          if (grandes[LS_KEYS.WORKSPACE_FILES]) setWorkspaceFiles(grandes[LS_KEYS.WORKSPACE_FILES] as WorkspaceFile[]);
          if (grandes[LS_KEYS.MESSAGES]) setMessages(grandes[LS_KEYS.MESSAGES] as ChatMessage[]);
          if (grandes[LS_KEYS.SAVED_CHATS]) setSavedChats(grandes[LS_KEYS.SAVED_CHATS] as SavedChat[]);
        } else {
          const previos = grandes[LS_KEYS.WORKSPACE_FILES] as WorkspaceFile[] | undefined;
          if (previos?.length) saveJSON(CLAVE_WORKSPACE_PREVIO, previos);
          const ms = grandes[LS_KEYS.MESSAGES] as ChatMessage[] | undefined;
          if (ms?.length) setSavedChats((antes) => prepararArranque({ mensajes: ms, chats: antes, archivos: [], modo: "vacio" }).chats);
          const cs = grandes[LS_KEYS.SAVED_CHATS] as SavedChat[] | undefined;
          if (cs?.length) setSavedChats((antes) => (antes.length ? antes : cs));
        }
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🗄️ Recuperados del almacén grande ${claves.length} conjunto(s) que no cabían en localStorage.`,
        ]);
      } catch {
        // Si el almacén grande no está, se sigue con lo que haya: no se finge.
      }
    })();
  }, []);

  // ─── v1.9.0 · Y SI ALGO NO SE PUDO GUARDAR, SE DICE ──────────────────────
  // Este es el canal que antes no existía: la interfaz se entera de un fallo de
  // guardado. Antes solo lo sabía la consola del navegador, que nadie mira.
  useEffect(() => {
    return alFallarGuardado((r) => {
      const mb = (r.bytes / 1048576).toFixed(2);
      const sello = `[${new Date().toLocaleTimeString()}]`;
      setTerminalLogs((prev) =>
        r.ok
          ? [...prev, `${sello} 🗄️ «${r.clave}» (${mb} MB) no cabía en localStorage: guardado en el almacén grande.`]
          : [...prev, `${sello} ⚠️ NO se pudo guardar «${r.clave}» (${mb} MB): ${r.motivo}. ${r.detalle || ""}`]
      );
    });
  }, []);

  // Aplicar/quitar el fondo del body
  useEffect(() => {
    if (customBg) {
      document.body.style.backgroundImage = `url("${customBg}")`;
      document.body.classList.add("has-brain-bg");
    } else {
      document.body.style.backgroundImage = "";
      document.body.classList.remove("has-brain-bg");
    }
  }, [customBg]);

  // ============================================================
  // v2.0 — TRANSPARENCIA DEL MÓDULO Y EL CHAT  ·  PALETA v1: ahora manda la paleta
  // ------------------------------------------------------------
  // El chat se veía rosado porque su fondo translúcido se mezclaba con la imagen
  // de fondo. Este valor (deslizador en el panel Pro → Fondo) decide cuánto se
  // transparentan los paneles, el chat, el explorador y el editor.
  //
  // PALETA v1: el deslizador dejó de escribir `--cn-module-opacity` a mano. La
  // variable es la misma, pero ahora la escribe `aplicarPaleta`, que es además la
  // que rinde cuando la superficie está en «opaca». Dos inline distintos sobre la
  // misma propiedad del mismo elemento es la receta exacta del «lo guardo y no se
  // guarda»: ganaba el último useEffect que corriera, y eso dependía del orden de
  // montaje, no de lo que el usuario pidió.
  // ============================================================
  useEffect(() => {
    const valor = (proSettings as any)?.wallpaper?.moduleOpacity;
    if (typeof valor !== "number") return;
    const want = Math.round(Math.max(INTENSIDAD_MIN, Math.min(INTENSIDAD_MAX, valor * 100)));
    const actual = paletaActual();
    if (actual.intensidad === want && actual.superficie === "vidrio") return; // guarda anti-reentrada
    /* Arrastrar el deslizador de transparencia con la superficie en «opaca» tiene
       que hacer algo, y lo evidente es que abra la superficie: quien mueve ese
       regulador quiere ver el fondo, no comprobar que el regulador está mudo. */
    fijarPaleta({ ...actual, superficie: "vidrio", intensidad: want });
  }, [proSettings]);

  // PALETA v1 · la vuelta: si el usuario eligió el modo desde la tarjeta de
  // Aspecto, el panel Pro tiene que ENSEÑAR ese modo. Un regulador que muestra
  // «Oscuro» mientras la pantalla es blanca no es un regulador, es un adorno que
  // miente — y esta casa ya tiene escrita esa regla en PlansPanel.
  useEffect(() => suscribirPaleta((p) => {
    setProSettings((prev) => {
      const tema = temaProDesdePaleta(p.modo, prev.appearance.theme) as ThemeId;
      return prev.appearance.theme === tema ? prev : { ...prev, appearance: { ...prev.appearance, theme: tema } };
    });
  }), []);

  // ============================================================
  // v2.0 — 🐞 "en la pantalla principal del IDE no se ve el fondo, en el editor
  // web sí".
  // ------------------------------------------------------------
  // La imagen SÍ se estaba pintando (capa fija z-0 y fondo del body), pero los
  // paneles de la IDE son casi opacos (bg-[#...]/85, /90 + backdrop-blur) y la
  // tapaban por completo; en la pestaña del editor web el lienzo es transparente
  // y por eso ahí se veía.
  // Con este atributo, las reglas de index.css bajan la opacidad de esos paneles
  // y el fondo se ve en TODA la IDE, sin perder legibilidad del texto.
  // ============================================================
  useEffect(() => {
    const html = document.documentElement;
    const hasPreset = proSettings?.wallpaper?.enabled !== false;
    const active = !!customBg || hasPreset;
    if (active) html.dataset.wallpaper = "on";
    else delete html.dataset.wallpaper;
  }, [customBg, proSettings]);

  const handleOpenBgPicker = () => {
    bgInputRef.current?.click();
  };

  const handleBgFileSelected = (file: File) => {
    // v8.0.1 — GIF soportado de verdad, no de boquilla.
    const esGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
    if (!file.type.startsWith("image/")) {
      alert("El archivo debe ser una imagen (PNG, JPG, WEBP o GIF).");
      return;
    }

    // ────────────────────────────────────────────────────────────
    // v8.0.1 — DEFECTO CAZADO: «no admite gif»
    // ------------------------------------------------------------
    // El GIF sí entraba por el `if` de arriba (`image/gif` empieza por
    // `image/`), pero moría dos líneas más abajo: se pintaba en un canvas y se
    // re-codificaba con `toDataURL("image/jpeg")`. Un canvas tiene UN fotograma,
    // así que el resultado era el PRIMER cuadro del GIF convertido a JPEG
    // inmóvil. El usuario veía «no admite gif» y tenía razón: lo aceptaba y lo
    // destrozaba, que es peor que rechazarlo.
    //
    // Un GIF animado no puede pasar por canvas nunca. La ruta correcta es subir
    // el dataURL ORIGINAL tal cual: el navegador anima un GIF en
    // `background-image` igual que en un <img>, sin que el motor tenga que
    // decodificarlo ni una vez.
    // ────────────────────────────────────────────────────────────
    if (esGif) {
      // v1.6.8 — 🐞 «no pude colocar un gif, me dice que solo admite hasta 4 MB».
      //
      // El 4 MB era una ADUANA: por encima se rechazaba y no había forma de
      // ponerlo. Ahora es un AVISO con techo duro muy por encima (48 MB), así
      // que la decisión vuelve a ser del usuario — que es quien tiene la máquina
      // delante. Solo se rechaza cuando de verdad dejaría de funcionar.
      const nivelGif = evaluarPesoAnimado("gif", file.size);
      if (nivelGif === "rechazo") {
        alert(mensajePesoAnimado("gif", file.size));
        return;
      }
      if (nivelGif === "aviso") {
        const seguir = confirm(`${mensajePesoAnimado("gif", file.size)}\n\n¿Ponerlo igualmente?`);
        if (!seguir) return;
      }
      // v1.7.1 — SE GUARDA EL ARCHIVO TAL CUAL (Blob), no un data URL.
      // Antes esto pasaba por FileReader → base64 (+33 %) → cadena de texto en
      // IndexedDB. Con un GIF de decenas de MB, lo que fallaba era eso: la
      // conversión y la cadena, no el disco. El Blob se guarda binario, el
      // navegador lo pinta con la animación intacta, y por eso el techo de
      // 100 MB es una cifra real y no un deseo.
      //
      // El IIFE async no es adorno: `handleBgFileSelected` NO es async, y el
      // `await` suelto no compila (TS1308). Y no se hace async la función entera
      // a propósito: el manejador tiene DOS caminos (GIF y foto) y el de la foto
      // sigue necesitando el FileReader para medir la imagen.
      void (async () => {
        try {
          await saveBackgroundImage(file);
          const url = urlDeFondo(file);
          revocarFondo(fondoUrlRef.current);
          fondoUrlRef.current = url;
          setCustomBg(url);
          setTerminalLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] 🖼️ Fondo GIF aplicado (${(file.size / 1048576).toFixed(2)} MB, animación original conservada).`,
          ]);
        } catch (err: any) {
          alert(`No se pudo guardar el fondo en IndexedDB: ${err?.message || err}`);
        }
      })();
      return;
    }

    // 🔧 Re-escalar la imagen con canvas para optimizar (max 1920px, JPEG 0.85)
    // (solo para fotos: un GIF animado se habría quedado en su primer cuadro)
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const maxDim = 1920;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          alert("No se pudo procesar la imagen.");
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        // v1.7.1 — A BLOB, NO A DATA URL: mismo cambio que en el GIF.
        // Aquí además la imagen ya viene re-escalada a 1920 px, así que una foto
        // de 100 MB entra por aquí convertida en un JPEG pequeño: el techo alto
        // sirve sobre todo para GIF y vídeo, que no se re-escalan.
        canvas.toBlob(async (blob) => {
          if (!blob) {
            alert("No se pudo procesar la imagen.");
            return;
          }
          try {
            // Guardar en IndexedDB (sin límite práctico, no llena localStorage)
            await saveBackgroundImage(blob);
            const url = urlDeFondo(blob);
            revocarFondo(fondoUrlRef.current);
            fondoUrlRef.current = url;
            setCustomBg(url);
            setTerminalLogs((prev) => [
              ...prev,
              `[${new Date().toLocaleTimeString()}] 🖼️ Fondo de pantalla aplicado (${w}x${h}, ${(blob.size / 1048576).toFixed(2)} MB en IndexedDB).`,
            ]);
          } catch (err: any) {
            alert(`No se pudo guardar el fondo en IndexedDB: ${err?.message || err}`);
          }
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => alert("No se pudo cargar la imagen. ¿Archivo corrupto?");
      img.src = reader.result as string;
    };
    reader.onerror = () => alert("No se pudo leer el archivo.");
    reader.readAsDataURL(file);
  };

  const handleClearBg = async () => {
    await clearBackgroundImage();
    setCustomBg("");
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🖼️ Fondo de pantalla quitado (IndexedDB limpiado).`,
    ]);
  };

  // ============================================================
  // 🔧 SISTEMA DE PUNTOS DE RESTAURACIÓN (snapshots en memoria)
  // ============================================================
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const refreshSnapshots = useCallback(() => setSnapshots(listSnapshots()), []);

  const handleCreateSnapshot = useCallback((label?: string) => {
    const snap = createSnapshot(workspaceFiles, {
      currentModel,
      provider,
      temperature,
      messageCount: messages.length,
      label: label || `Snapshot ${new Date().toLocaleTimeString()}`,
    });
    refreshSnapshots();
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📸 Punto de restauración creado: "${snap.label}" (${workspaceFiles.length} archivos).`,
    ]);
    return snap;
  }, [workspaceFiles, currentModel, provider, temperature, messages.length, refreshSnapshots]);

  const handleRestoreSnapshot = useCallback((id: string) => {
    const snap = restoreSnapshot(id);
    if (!snap) {
      alert("No se encontró el snapshot.");
      return;
    }
    if (!window.confirm(`¿Restaurar el snapshot "${snap.label}"?\n\nEsto reemplazará el workspace actual (${workspaceFiles.length} archivos) por el snapshot (${snap.files.length} archivos).\n\nSe creará un snapshot del estado actual antes de restaurar.`)) return;
    // Crear snapshot del estado actual antes de restaurar (por si el usuario quiere volver)
    createSnapshot(workspaceFiles, {
      currentModel, provider, temperature, messageCount: messages.length,
      label: `Antes de restaurar ${snap.label}`,
    });
    setWorkspaceFiles(snap.files);
    setActiveFileId(snap.files[0]?.id ?? null);
    setCurrentModel(snap.currentModel);
    setProvider(snap.provider);
    setTemperature(snap.temperature);
    refreshSnapshots();
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ⏪ Snapshot restaurado: "${snap.label}" — ${snap.files.length} archivos.`,
    ]);
  }, [workspaceFiles, currentModel, provider, temperature, messages.length, refreshSnapshots]);

  const handleDeleteSnapshot = useCallback((id: string) => {
    deleteSnapshot(id);
    refreshSnapshots();
  }, [refreshSnapshots]);

  // Crear snapshot automático cuando cambia significativamente el workspace
  // (después de importar .cn, borrar todo, o restaurar plantilla).
  const lastSnapshotFileCountRef = useRef(workspaceFiles.length);
  useEffect(() => {
    const prevCount = lastSnapshotFileCountRef.current;
    const currCount = workspaceFiles.length;
    // Solo crear snapshot si el cambio es grande (>5 archivos o cambia de vacío a lleno)
    if (Math.abs(currCount - prevCount) > 5 || (prevCount === 0 && currCount > 0)) {
      handleCreateSnapshot(`Auto: ${prevCount} → ${currCount} archivos`);
      lastSnapshotFileCountRef.current = currCount;
    }
  }, [workspaceFiles.length, handleCreateSnapshot]);

  // ============================================================
  // 🔧 HISTORIAL DE PROMPTS FAVORITOS
  // ============================================================
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  // v1.72.0 — FUERA showFavoritesPanel y showSnapshotsPanel: las dos se ponían
  // a true/false y NINGÚN render las leía, así que «abrían» un panel que no
  // existe. favoritePrompts sí está vivo (es el historial del chat); el booleano
  // sobraba. Con snapshots pasa lo mismo pero el panel SÍ existe como datos: ver
  // la nota del Header, línea 563, para la decisión pendiente sobre reabrirlo.

  useEffect(() => {
    let favs = loadFavoritePrompts();
    // Si es la primera vez (sin favoritos), cargar los defaults
    if (favs.length === 0) {
      DEFAULT_FAVORITE_PROMPTS.forEach((p) => {
        addFavoritePrompt(p.title, p.content, p.category);
      });
      favs = loadFavoritePrompts();
    }
    setFavoritePrompts(favs);
  }, []);

  const refreshFavorites = useCallback(() => setFavoritePrompts(loadFavoritePrompts()), []);

  const handleAddFavorite = useCallback((title: string, content: string, category: FavoritePrompt["category"] = "custom") => {
    addFavoritePrompt(title, content, category);
    refreshFavorites();
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ⭐ Prompt favorito añadido: "${title}".`,
    ]);
  }, [refreshFavorites]);

  const handleUseFavorite = useCallback((fav: FavoritePrompt, onInject: (text: string) => void) => {
    markPromptUsed(fav.id);
    refreshFavorites();
    onInject(fav.content);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ⭐ Prompt favorito inyectado: "${fav.title}" (usado ${fav.useCount + 1} vez/veces).`,
    ]);
  }, [refreshFavorites]);

  const handleDeleteFavorite = useCallback((id: string) => {
    deleteFavoritePrompt(id);
    refreshFavorites();
  }, [refreshFavorites]);

  // ============================================================
  // 🔧 MONITOR DE RECURSOS EN VIVO (CPU/RAM del server)
  // ============================================================
  // v1.16.3.1 · BAJO CONSUMO: `ollama` trae los modelos RESIDENTES y sus MB
  // (mismo sondeo del server, /api/ps cacheado 5 s): el chip de Puertos y el
  // botón Expulsar salen de acá, sin pedidos extra al motor.
  const [systemStats, setSystemStats] = useState<{ ide: { rssMb: number; heapUsedMb: number; cpuPercent: number; uptimeSec: number }; sandbox: { running: boolean }; machine?: { cpuPercent: number | null; totalRamMb: number; freeRamMb: number; cores: number }; ollama?: { vivo: boolean; residenteMb: number; modelos: { model: string; sizeMb: number | null; until: string; expirado: boolean }[]; error?: string }; geminiServidorDisponible?: boolean } | null>(null);
  const geminiServerReady = Boolean(systemStats?.geminiServidorDisponible);
  const [estadoSync, setEstadoSync] = useState<EstadoSincronizacion>("pendiente");
  const persistedReadyRef = useRef<boolean>(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/system/stats");
      if (res.ok) setSystemStats(await res.json());
    } catch {}
  }, []);
  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Sincronizar disponibilidad de Gemini TTS del servidor sin exponer la clave al navegador
  useEffect(() => {
    marcarGeminiServidorTts(geminiServerReady);
  }, [geminiServerReady]);

  // Persistencia híbrida (Servidor + Navegador): hidratar al montar respetando arranqueLimpio
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const res = await fetch("/api/persistencia/estado");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelado || !data?.ok || !data?.snapshot) return;
        const snap = data.snapshot;
        if (Array.isArray(snap.chatsEliminados) && snap.chatsEliminados.length > 0) {
          setChatsEliminados((prev) => fusionarEliminaciones(prev, snap.chatsEliminados));
        }
        if (Array.isArray(snap.savedChats) && snap.savedChats.length > 0) {
          // v1.0.44 · la fusión con el disco ya NO es una unión ciega: respeta
          // las lápidas (antes el chat borrado volvía en cada arranque).
          setSavedChats((prev) =>
            fusionarChatsGuardados(
              prev,
              snap.savedChats,
              fusionarEliminaciones(chatsEliminados, Array.isArray(snap.chatsEliminados) ? snap.chatsEliminados : [])
            )
          );
        }
        if (Array.isArray(snap.lessons) || Array.isArray(snap.turnMetrics)) {
          hydrateLessonsAndMetrics(
            Array.isArray(snap.lessons) ? snap.lessons : [],
            Array.isArray(snap.turnMetrics) ? snap.turnMetrics : []
          );
        }
        if (Array.isArray(snap.workspacePrevio) && snap.workspacePrevio.length > 0) {
          if (modoArranqueApp === "restaurar") {
            setWorkspaceFiles((prev) => (prev.length > 0 ? prev : snap.workspacePrevio));
          } else {
            const actualPrevio = loadJSON<WorkspaceFile[]>(CLAVE_WORKSPACE_PREVIO, []);
            if (actualPrevio.length === 0) saveJSON(CLAVE_WORKSPACE_PREVIO, snap.workspacePrevio);
          }
        }
        if (!cancelado) setEstadoSync("hibrido");
      } catch {
        if (!cancelado) setEstadoSync("solo-local");
      } finally {
        persistedReadyRef.current = true;
      }
    })();
    return () => { cancelado = true; };
  }, [modoArranqueApp]);

  // Guardado híbrido con debounce hacia /api/persistencia/guardar (nunca envía claves API)
  useEffect(() => {
    if (!persistedReadyRef.current) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          setEstadoSync("sincronizando");
          const workspacePrevioLocal = workspaceFiles.length > 0
            ? workspaceFiles
            : loadJSON<WorkspaceFile[]>(CLAVE_WORKSPACE_PREVIO, []);
          const res = await fetch("/api/persistencia/guardar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              snapshot: {
                version: 1,
                updatedAt: Date.now(),
                modoArranque: preferenciaArranque,
                activeChatTitle,
                savedChats,
                chatsEliminados,
                lessons: loadLessons() as unknown as LeccionPersistida[],
                turnMetrics: loadMetrics() as unknown as MetricaPersistida[],
                workspacePrevio: workspacePrevioLocal,
              },
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setEstadoSync("hibrido");
        } catch {
          setEstadoSync("solo-local");
        }
      })();
    }, 1200);
    return () => clearTimeout(t);
  }, [savedChats, chatsEliminados, workspaceFiles, activeChatTitle, preferenciaArranque, messages.length]);

  // 🦙 Expulsar modelos residentes (POST /api/ollama/expulsar): libera la RAM
  // de Ollama al instante; la siguiente respuesta la recarga sola. Tras el
  // portazo se refresca la muestra para que el chip mienta lo mínimo.
  const [isExpulsando, setIsExpulsando] = useState(false);
  const handleExpulsarModelos = useCallback(async () => {
    if (isExpulsando) return;
    setIsExpulsando(true);
    try {
      const res = await fetch("/api/ollama/expulsar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🦙 Expulsar: ${data.ok ? `OK — ${((data.expulsados || []).join(", ")) || "nada residente"} · RAM residente ahora ${data.residenteMb ?? 0} MB` : `fallo (${JSON.stringify(data.fallidos || data.error || "sin detalle")})`}`,
      ]);
    } catch (err: any) {
      setTerminalLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] 🦙 Expulsar lanzó: ${err?.message || err}`]);
    } finally {
      await fetchStats();
      setIsExpulsando(false);
    }
  }, [isExpulsando, fetchStats]);

  // ============================================================
  // 🔧 MOTOR DE AUTODIAGNÓSTICO (Self-Healing)
  // ============================================================
  useEffect(() => {
    installGlobalErrorHandler();
  }, []);

  // ============================================================
  // 🔧 RAG LOCAL: indexar archivos .txt/.md/.pdf del workspace
  // ============================================================
  const [indexedDocs, setIndexedDocs] = useState<{ file: string; chunks: number; words: number }[]>([]);
  const refreshIndexedDocs = useCallback(() => setIndexedDocs(listIndexedDocuments()), []);

  // Indexar automáticamente archivos .md/.txt del workspace
  useEffect(() => {
    const raggable = workspaceFiles.filter((f) => {
      const ext = f.path.split(".").pop()?.toLowerCase();
      return (ext === "md" || ext === "txt") && f.content.length > 100;
    });
    // Reindexar solo si cambió el número de archivos raggables (evita reindexar en cada keystroke)
    if (raggable.length > 0 && raggable.length !== indexedDocs.length) {
      raggable.forEach((f) => indexDocument(f.name, f.content));
      refreshIndexedDocs();
    }
  }, [workspaceFiles, indexedDocs.length, refreshIndexedDocs]);

  // 🔧 Inyectar contexto RAG al prompt antes de enviar al modelo.
  // 🔧 SLM: si el modelo activo es pequeño, usar chunks reducidos + reglas anti-alucinación.
  // 🔧 EvolutionDB: inyectar lecciones históricas (3 para SLMs, 5 para modelos grandes).
  // 🔧 Declarado después de handleSendMessage (ver más abajo) — se asigna con useRef
  // para evitar el error de "used before declaration".
  const handleSendMessageWithRAGRef = useRef<(text: string, attachments: AttachmentItem[]) => void>(() => {});
  // v2.6.1 — «el chat central no anda»: un envío desde el Chat es, por
  // definición, NO del editor. Este envoltorio limpia el flag y destraba una
  // fase envenenada por una orden anterior del Editor web (el ref se quedaba
  // true cuando el motor fallaba sin ruta de error: el chat entonces no
  // publicaba tus mensajes y el texto del modelo se esfumaba). El antídoto
  // no espera a un reinicio: el siguiente mensaje desde el chat destraba todo.
  const sendDesdeChat = (text: string, attachments?: AttachmentItem[]) => {
    // v1.16.6 — MODO EDITOR ON: este mensaje NO es conversación, es una ORDEN
    // PARA EL EDITOR. Se enruta por sendWebEditorOrder (que la envuelve con la
    // etiqueta compartida y la manda al motor). Así el chat central es la ÚNICA
    // caja de escritura: el editor ya no tiene la suya.
    // v1.48.3 — 🐞 BUG «Editor ON se apaga solo»: el enrutado YA NO exige que la
    // pestaña del editor esté abierta. El Modo Editor es un interruptor manual
    // (el chip) y manda mientras esté encendido, con o sin pestaña a la vista.
    if (editorModeRef.current && !isStreamingRef.current) {
      sendWebEditorOrderRef.current(text);
      return;
    }
    webEditorOrderRef.current = false;
    setWebEditorStatus((s) => (s.phase === "sending" || s.phase === "streaming" ? { phase: "idle", message: "" } : s));
    // 🐞 FIX «Encolar corta la generación»: el envío del chat llegaba directo a
    // handleSendMessageWithRAG, que NO consulta isStreamingRef y arrancaba un
    // stream nuevo → abortaba el texto que el modelo estaba escribiendo. Ahora,
    // si está generando, se encola de verdad y la generación actual no se toca.
    if (isStreamingRef.current) {
      const queuedItem: QueuedMessageItem = {
        id: "queue-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        text,
        attachments: [...(attachments || [])],
        timestamp: Date.now(),
      };
      setMessageQueue((prev) => [...prev, queuedItem]);
      return;
    }
    handleSendMessageWithRAGRef.current(text, attachments || []);
  };
  const slmInfoRef = useRef(detectSLM(currentModel));
  const slmWarningRef = useRef<string | null>(getSLMUserWarning(slmInfoRef.current));
  // 🔧 Estado para forzar re-render del Header cuando cambia el SLM info
  const [slmState, setSlmState] = useState({ isSLM: slmInfoRef.current.isSLM, category: slmInfoRef.current.category, params: slmInfoRef.current.estimatedBillionParams });

  // Recalcular SLM info cuando cambia el modelo activo
  useEffect(() => {
    const info = detectSLM(currentModel);
    slmInfoRef.current = info;
    const warning = getSLMUserWarning(info);
    slmWarningRef.current = warning;
    setSlmState({ isSLM: info.isSLM, category: info.category, params: info.estimatedBillionParams });
    if (warning) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${warning}`,
      ]);
    }
    // 🐞 Aviso explícito: los modelos locales <4B NO saben usar herramientas
    // (tool-calling). Sin este aviso, el modelo responde con texto genérico y
    // parece "que no sabe usar el sistema" cuando en realidad el sistema ya le
    // quitó las herramientas a propósito para que no se cuelgue.
    const perfil = getModelProfile(currentModel);
    if (!perfil.remote && !perfil.toolCapable) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🧰 Sin herramientas: «${currentModel}» (${perfil.paramsB ?? "?"}B) no puede usar las herramientas del sistema (tool-calling). Para tareas de agente usa un modelo ≥4B, p. ej. qwen2.5:7b o llama3.1:8b.`,
      ]);
    }
  }, [currentModel]);

  // ============================================================
  // 🔧 EXPORTAR A MARKDOWN / INFORME TÉCNICO
  // ============================================================
  const handleExportMarkdown = useCallback(() => {
    downloadMarkdownReport(messages, workspaceFiles, {
      includeCodeBlocks: true,
      includeWorkspaceTree: true,
      includeFileContents: false,
      // v2.3 — desde la fuente única: este literal «V2.1» era el segundo foco.
      title: `Informe Técnico — ${IDE_BRAND.FULL_NAME}`,
      author: "Mario Nicolas Quintero",
    });
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📄 Informe Markdown generado (${messages.length} mensajes, ${workspaceFiles.length} archivos).`,
    ]);
  }, [messages, workspaceFiles]);

  // Drag listeners for responsive column resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const newWidth = Math.max(200, Math.min(550, e.clientX));
        setLeftWidth(newWidth);
      }
      if (isDraggingRight) {
        const newWidth = Math.max(280, Math.min(window.innerWidth - 300, window.innerWidth - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingLeft || isDraggingRight) {
        setIsDraggingLeft(false);
        setIsDraggingRight(false);
        saveString(LS_KEYS.LEFT_WIDTH, leftWidth.toString());
        saveString(LS_KEYS.RIGHT_WIDTH, rightWidth.toString());
      }
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      // v1.43.0 lote 2 — RED DE SEGURIDAD: si el puntero se escapa de la ventana
      // o la pestaña pierde el foco (p. ej. el iframe del sandbox captura el
      // evento), igual se suelta el arrastre. Sin esto, un `mouseup` perdido
      // dejaba el panel «pegado» y el chat sin clics hasta remontar.
      window.addEventListener("blur", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, leftWidth, rightWidth]);

  // ============================================================
  // v2.0 — EFECTOS DEL HÍBRIDO
  // ============================================================

  /** Tamaño global de texto (v1.9): se aplica a <html> y se persiste. */
  useEffect(() => {
    const html = document.documentElement;
    // v1.6.16 — mismo tope que arriba, leído de la fuente única. Con el literal
    // «14» el valor mínimo nuevo (11) se descartaba en silencio: el desplegable
    // lo mostraba pero <html> seguía a 14 px, o sea el fallo de siempre.
    if (appFontSize >= APP_FONT_SIZES[0] && appFontSize <= APP_FONT_SIZES[APP_FONT_SIZES.length - 1]) {
      html.setAttribute("data-app-font-size", String(appFontSize));
      html.style.setProperty("--cn-app-font-size", `${appFontSize}px`);
      try {
        saveString(LS_KEYS.APP_FONT_SIZE, String(appFontSize));
      } catch {}
    }
  }, [appFontSize]);

  /**
   * `html[data-perf-mode="8gb"]` apaga backdrop-filter (lo más caro de la interfaz) y las
   * animaciones infinitas del cerebro: si además la GPU desenfoca el fondo de tres paneles, el
   * scroll compite con la inferencia.
   *
   * v1.99.8 · QUIÉN decide es `presionEquipo.decidirModoPerf`, con la RAM que midió el server
   * (`os.totalmem`, vía `/api/sistema/estado`). Antes `"auto"` no hacía NADA: el equipo de poca RAM
   * seguía pintando desenfoques, y el chip de al lado decía «8 GB» en una máquina de 16 — un nombre
   * confundido con una lectura. El valor del atributo no cambia: es el selector CSS histórico.
   */
  useEffect(() => {
    const decision = decidirModoPerf(perfMode, systemStats?.machine?.totalRamMb);
    const atributo = atributoPerf(decision);
    const html = document.documentElement;
    if (atributo) html.setAttribute("data-perf-mode", atributo);
    else html.removeAttribute("data-perf-mode");
    setPerf(decision);
    try {
      saveString(LS_KEYS.PERF_MODE, perfMode);
    } catch {}
  }, [perfMode, systemStats?.machine?.totalRamMb]);

  /** Configuración pro: variables CSS globales + persistencia. */
  const preferenciaMotorEnviadaRef = useRef<string>("");
  useEffect(() => {
    applyProSettings(proSettings);
    saveProSettings(proSettings);
    /* PALETA v1 — el «Tema» del panel Pro y el «Modo» de la tarjeta de Aspecto son
       la MISMA palanca con dos mangos: dark/midnight/carbon son oscuro, light es
       claro. Se reconcilia acá, en el único sitio que ya es efecto del config, y
       con la guarda de igualdad para que la vuelta (paleta→tema, arriba) no se
       empuje con esta en un bucle. */
    const modo = modoDesdeTemaPro(proSettings.appearance.theme);
    if (modo && paletaActual().modo !== modo) fijarPaleta({ ...paletaActual(), modo });
    // v1.57.14 · LOS DIALES LLEGAN AL MOTOR — `contextSize`, `keepAlive`, `topP`,
    // `topK` y `maxTokens` del panel Pro se guardaban en localStorage y NADIE los
    // leía: mover «Ventana de contexto» no cambiaba el num_ctx que recibía Ollama.
    // Se aplican en las dos puertas: la local (perfil del modelo, en este mismo
    // módulo) y la del servidor (POST), y el parte del techo de RAM se IMPRIME en
    // la terminal en vez de recortar en silencio.
    const ai = proSettings.ai;
    const motor = {
      numCtx: ai.contextSize,
      keepAlive: ai.keepAlive,
      topP: ai.topP,
      topK: ai.topK,
      numPredict: ai.maxTokens,
    };
    const firma = `${motor.numCtx}|${motor.keepAlive}|${motor.topP}|${motor.topK}|${motor.numPredict}`;
    if (firma === preferenciaMotorEnviadaRef.current) return;
    preferenciaMotorEnviadaRef.current = firma;
    fijarPreferenciaMotor(motor);
    fetch("/api/ollama/preferencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...motor, modelo: currentModel }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((d: any) => {
        const motivo = d?.aplicado?.motivo as string | undefined;
        if (motivo) setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 🎛️ Panel Pro → motor: ${motivo}`]);
      })
      .catch(() => {
        // Sin servidor (APK / archivo abierto a mano) la preferencia local ya
        // quedó fijada arriba; no hay nada que avisar, pero tampoco que fingir.
      });
  }, [proSettings, currentModel]);

  useEffect(() => {
    saveString("codigo0_wallpaper_preset", wallpaperPreset);
  }, [wallpaperPreset]);

  useEffect(() => {
    saveString("codigo0_history_window", String(historyWindow));
  }, [historyWindow]);

  /**
   * AUTO-FIT DE PANELES AL VIEWPORT (fix de pantalla de la v1.8.1).
   * Si el usuario guardó paneles anchos en una pantalla grande y abre la app en
   * una más chica, los anchos persistidos ya no caben y el panel derecho se
   * cortaba. Aquí se reparte el sobrante de forma proporcional.
   *
   * v2.3.1 — Dos agujeros que devolvían el mismo síntoma («se pierde pantalla
   * hacia la derecha»):
   *   1. Contaba el ancho PERSISTADO de un panel CERRADO (ocupa 0 px reales),
   *      así que robaba reducción al que sí estaba abierto.
   *   2. No corría al abrir/cerrar un panel: el sobrante aparecía al cerrar y
   *      nadie lo repartía hasta el siguiente resize.
   */
  useEffect(() => {
    const fit = () => {
      // v1.99.9 · de paso alimenta la horma del chat: el auto-fit ya escuchaba `resize` y ya se
      // disparaba al abrir/cerrar paneles, así que la lectura de la ventana sale gratis.
      setAnchoVentanaPx(window.innerWidth);
      const lw = isLeftOpen ? leftWidth : 0;
      const rw = isRightOpen ? rightWidth : 0;
      const need = lw + rw + PANEL_LIMITS.CENTER_MIN + PANEL_LIMITS.SPLITTERS + PANEL_LIMITS.SAFETY;
      const excess = need - window.innerWidth;
      if (excess <= 0) return;
      const total = lw + rw;
      if (total <= 0) return; // con todo cerrado no hay a quién reducir
      const reduceLeft = Math.round((lw / total) * excess);
      const reduceRight = Math.round((rw / total) * excess);
      const newLeft = Math.max(PANEL_LIMITS.LEFT_MIN, leftWidth - reduceLeft);
      const newRight = Math.max(PANEL_LIMITS.RIGHT_MIN, rightWidth - reduceRight);
      if (newLeft !== leftWidth) setLeftWidth(newLeft);
      if (newRight !== rightWidth) setRightWidth(newRight);
      try {
        saveString(LS_KEYS.LEFT_WIDTH, String(newLeft));
        saveString(LS_KEYS.RIGHT_WIDTH, String(newRight));
      } catch {}
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // Cambios de ancho Y de qué paneles están abiertos: `fit` corrige y se
    // vuelve a disparar solo
  }, [leftWidth, rightWidth, isLeftOpen, isRightOpen]);

  /**
   * v1.99.9 · LA HORMA DEL CHAT, graduada (pedido que venía a medias desde sesiones anteriores:
   * «el chat más ancho y que se redimensione a medida que se abren más cosas»). Antes era
   * `amplio={!isRightOpen}`: dos estados y una sola señal. Ahora el criterio es cuánto espacio
   * queda libre de verdad — ventana menos los paneles ABIERTOS, con sus anchos reales — y el paso
   * se elige en `src/engine/hormaChat.ts`, que es donde la cuenta se puede probar sin navegador.
   */
  const hormaChat = useMemo(
    () =>
      decidirHorma({
        anchoPx: anchoVentanaPx,
        izquierdaAbierta: isLeftOpen,
        derechaAbierta: isRightOpen,
        izquierdaPx: leftWidth,
        derechaPx: rightWidth,
      }),
    [anchoVentanaPx, isLeftOpen, isRightOpen, leftWidth, rightWidth],
  );

  /** Extensiones: carga inicial y refresco cada vez que se abre una pestaña. */
  const reloadExtensions = useCallback(async () => {
    const list = await fetchExtensions();
    setExtensions(list);
    return list;
  }, []);

  useEffect(() => {
    reloadExtensions().then((list) => {
      if (list.length > 0) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] 🧩 ${list.length} extensión(es) detectada(s): ${list.map((e) => e.manifest.id).join(", ")}`,
        ]);
      }
    });
  }, [reloadExtensions]);

  /**
   * v2.0 — EL MOTOR SE ALIMENTA DEL PROYECTO.
   * Se le manda el mapa real de archivos para que lo indexe: así el modelo recibe
   * rutas y lenguajes verdaderos en el contexto en vez de inventarlos (el fallo
   * más caro de los modelos pequeños). Con 1,5 s de retardo para no enviar nada
   * mientras el usuario sigue escribiendo.
   */
  useEffect(() => {
    const files = workspaceFiles
      .filter((f) => !f.isBinary)
      .map((f) => ({ path: f.path, language: f.language }));
    if (files.length === 0) return;
    const timer = window.setTimeout(() => {
      fetch("/api/engine/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [workspaceFiles]);

  /**
   * v2.0 — AUTOSUPERACIÓN → BASE DE DATOS DEL MOTOR.
   * Cada lección aprendida se registra como entrada consultable: deja de
   * depender de que el prompt la lleve y pasa a ser conocimiento del motor,
   * recuperable con cualquier modelo.
   */
  useEffect(() => {
    if (!lastLesson) return;
    fetch("/api/engine/kb/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lastLesson.id, text: lastLesson.text, tags: lastLesson.tags }),
    }).catch(() => {});
  }, [lastLesson]);

  /**
   * Canal modelo → extensión. Se arranca siempre y el propio módulo decide si
   * hay algo que hacer (si no hay paneles abiertos, no consulta nada).
   */
  useEffect(() => {
    startInvocationPolling((msg) => {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    });
    return () => stopInvocationPolling();
  }, []);

  /** Pantalla completa del contenedor principal, sincronizada con el navegador. */
  useEffect(() => {
    const handler = () => setIsAppFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /**
   * v1.6.6 — 🐞 «el botón de salir de pantalla completa no anda».
   *
   * Antes: `if (!document.fullscreenElement)` con la llamada contemplando los
   * dos nombres de la API. La PREGUNTA solo miraba el moderno, así que en un
   * motor que exponga únicamente el prefijado esa lectura es `undefined`
   * siempre y la rama de «salir» no se alcanzaba jamás. Además, el
   * `.catch(() => {})` se tragaba cualquier rechazo: el síntoma era «no hace
   * nada», sin una sola pista de por qué.
   *
   * Ahora decide el módulo, pregunta al NAVEGADOR (no a un booleano de React,
   * que se desincroniza si se sale con Esc) y el fallo se cuenta en el registro
   * en vez de desaparecer.
   */
  const toggleAppFullscreen = useCallback(() => {
    void alternarPantallaCompletaInteligente(document, document.documentElement).then((r) => {
      if (!r.ok) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] ⚠ Pantalla completa (${r.accion}): ${r.motivo ?? "fallo sin motivo"}`,
        ]);
      }
    });
  }, []);

  /**
   * v2.3.1 · Alt+M minimiza. Con el navegador abierto esto NO puede minimizar la
   * ventana (no existe API para eso) y `minimizarVentana` lo dice en el registro
   * en vez de fingir que funcionó; empaquetados (Electron) el `preload` expone el
   * atajo real y ahí sí minimiza. El usuario decide si lo deja o lo retira.
   */
  const minimizarApp = useCallback(() => {
    void minimizarVentana().then((r) => {
      if (!r.ok) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] ⚠ Minimizar: ${r.motivo ?? "no se pudo"}`,
        ]);
      }
    });
  }, []);

  /** Esc cierra modales; F11 alterna pantalla completa; atajos de UX v1. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleAppFullscreen();
        return;
      }
      if (e.altKey && !e.ctrlKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        minimizarApp();
        return;
      }
      // UX v1 — atajos de las acciones repetidas. Se abren el Centro de Estado y
      // Ayuda y los paneles ya existentes; nada de esto toca el servidor.
      if (e.key === "F1") {
        e.preventDefault();
        setSeccionUX("ayuda");
        setIsCentroUXOpen(true);
        return;
      }
      if (e.ctrlKey && !e.altKey && (e.key === "/" || e.key === ".")) {
        e.preventDefault();
        if (e.key === "/") setSeccionUX("ayuda");
        setIsCentroUXOpen((v) => !v);
        return;
      }
      if (e.ctrlKey && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsModelSelectorOpen(true);
        return;
      }
      if (e.ctrlKey && !e.altKey && e.key === ",") {
        e.preventDefault();
        setIsProConfigOpen(true);
        return;
      }
      if (e.ctrlKey && e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        handleNewChatRef.current();
        return;
      }
      if (e.key === "Escape") {
        setIsCentroUXOpen(false);
        setIsProConfigOpen(false);
        setIsApiKeyModalOpen(false);
        setIsModelSelectorOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleAppFullscreen, minimizarApp]);

  // ------------------------------------------------------------
  // v2.0 — Pestañas centrales
  // ------------------------------------------------------------
  const openCenterTab = useCallback((tab: CenterTab) => {
    setCenterTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveCenterTab(tab.id);
  }, []);

  const closeCenterTab = useCallback((id: string) => {
    // v1.48.3 — 🐞 BUG «Editor ON se apaga solo»: cerrar la pestaña del editor
    // (o pulsar «Volver») YA NO apaga el Modo Editor en silencio. El chip es el
    // ÚNICO que lo enciende/apaga; así Mario conserva el estado que eligió.
    setCenterTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (!tab || tab.pinned) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveCenterTab((cur) => (cur === id ? "chat" : cur));
      return next;
    });
  }, []);

  /** v1.91.0 — EL PREVIEW NO SECUESTRA LA PANTALLA. Antes esto hacía
      `setActiveView("web-editor")` y el chat SE IBA de la vista (y como el agente
      emite `abrir_preview` con frecuencia, la pantalla saltaba una y otra vez).
      Ahora solo se asegura el sandbox a la derecha: el chat queda al frente y el
      editor completo sigue disponible si se abre a mano desde las pestañas. */
  const openWebEditorTab = useCallback(() => {
    openCenterTab({ id: "web-editor", label: "Editor web", kind: "web-editor" });
    setActiveCenterTab("chat");
  }, [openCenterTab]);

  /** Abre la pestaña de una extensión. */
  const openExtensionTab = useCallback(
    (ext: ExtensionInfo) => {
      const panel = ext.manifest.contributes?.panels?.[0];
      openCenterTab({
        id: `ext:${ext.manifest.id}`,
        label: panel?.title || ext.manifest.name,
        kind: "extension",
        extensionId: ext.manifest.id,
      });
    },
    [openCenterTab]
  );

  // ------------------------------------------------------------
  // v2.0 — Orden DIRECTA del editor web al motor
  // ------------------------------------------------------------
  /**
   * Antes: el editor llamaba a `handleSendMessage`, que escribía en el chat
   * central (que en esa vista estaba oculto) y el editor solo simulaba éxito con
   * un setTimeout. Ahora la orden entra al motor por el mismo camino que el chat
   * y el estado que se muestra es el real (isStreaming + autosync).
   */
  const sendWebEditorOrder = useCallback(
    (prompt: string) => {
      setWebEditorStatus({ phase: "sending", message: "Orden enviada al motor…" });
      webEditorOrderRef.current = true;
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🎨 Editor web → orden directa: "${prompt.slice(0, 70)}${prompt.length > 70 ? "…" : ""}"`,
      ]);
      // v1.16.6 — La etiqueta sale de la constante COMPARTIDA (src/constants.ts
      // ↔ server/quickParser.ts). El servidor la usa para NO tratar el
      // envoltorio como acción rápida de PC: así el «DEL EDITOR WEB» secuestrado
      // del propio tag no puede volver. Cambiarla aquí sin cambiarla allí lo
      // canta tests/accionesRapidas.test.ts.
      const wrapped =
        `${WEB_EDITOR_ORDER_TAG} Modifica la página del sandbox (puerto 3500) aplicando esta instrucción ` +
        `sobre los archivos HTML/CSS/JS del workspace. Aplica los cambios directamente con las herramientas ` +
        `(prefiere edit_file antes que reescribir el archivo entero), mantén el tema oscuro y no expliques: ejecuta. ` +
        `El chat es un informe de resultados: una línea «✔ archivo — qué cambió» por archivo tocado y UNA sola ` +
        `línea final «→ Ahora: …» o «→ Listo: cómo comprobarlo». PROHIBIDO narrar en futuro («Voy a…»), pegar ` +
        `código que ya escribiste con herramientas y pegar salidas de comandos.\n\n` +
        `Instrucción: "${prompt}"`;
      handleSendMessageWithRAG(wrapped, []);
    },
    // handleSendMessageWithRAG es estable (delegado a un ref) → no hace falta en deps
    []
  );
  // v1.16.6 — el puente que usa sendDesdeChat cuando el Modo Editor está ON.
  sendWebEditorOrderRef.current = sendWebEditorOrder;

  // ============================================================
  // v2.0 — BUCLE DE AUTOSUPERACIÓN: medir → reflexionar → aprender
  // ============================================================
  /** Primer token: mide cuánto tarda el modelo en empezar a responder. */
  useEffect(() => {
    if (isStreaming && currentStreamingText && firstTokenRef.current === 0 && turnStartRef.current > 0) {
      firstTokenRef.current = Date.now() - turnStartRef.current;
    }
  }, [currentStreamingText, isStreaming]);

  /**
   * Fin de turno: se registra la métrica, se confirman las lecciones que
   * estaban activas y se reflexiona (determinista, sin gastar tokens) para
   * sacar una lección nueva si el turno falló o fue anómalo.
   */
  useEffect(() => {
    if (isStreaming || turnStartRef.current === 0) return;

    const totalMs = Date.now() - turnStartRef.current;
    const firstTokenMs = firstTokenRef.current || undefined;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const text = lastAssistant?.content || "";
    const looksFailed =
      text.trim().length === 0 ||
      /(^|\n)\s*(❌|error:|error al|no se pudo|failed to|invalid api key|rate limit|timeout)/i.test(text.slice(0, 400));
    const failureKind = !looksFailed
      ? undefined
      : /rate limit|quota|cuota/i.test(text)
      ? "quota"
      : /api key|clave|401|unauthorized/i.test(text)
      ? "auth"
      : /timeout|tardó|timed out/i.test(text)
      ? "timeout"
      : "retryable";

    const profile = getModelProfile(currentModel);
    const summary = getImprovementSummary();
    const baseline = summary.byModel.find((m) => m.model === currentModel)?.avgFirstTokenMs ?? null;

    // v1.6.32 · D8: el motor ya contó los tokens de este turno (eval_count) y
    // el búfer los dejó en la medición del último stream. Si la hay, se
    // REGISTRA LA MEDIDA; el len/4 queda solo como estimación etiquetada.
    const medicion = consumirUltimaMedicion();
    recordTurnMetric({
      at: Date.now(),
      provider,
      model: currentModel,
      firstTokenMs,
      totalMs,
      tokensOut: medicion?.tokensOut ?? Math.round(text.length / 4),
      tokensIn: medicion?.tokensIn,
      tokPorSegundo: medicion?.tokPorSegundo,
      medidaExacta: medicion?.exacta ?? false,
      ok: !looksFailed,
      failureKind,
      tier: profile.tier,
    });

    confirmLastLessonsUsed(!looksFailed);

    // v1.79.0 · LA AUTO-MEJORA ESCRIBE EN EL MANUAL (perfeccion.md): una
    // lección que acaba de reforzarse — presente en el turno y el turno salió
    // bien — es un PROCESO VALIDADO por el sistema. Se lo dice al manual sin
    // bloquear nada: si el servidor no responde, la lección sigue viva en
    // localStorage (el manual es cara del aprendizaje, no su fuente).
    if (!looksFailed) {
      const reforzadas = leccionesReforzadasRecientes(10);
      if (reforzadas.length > 0) {
        fetch("/api/perfeccion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "leccion",
            nombre: reforzadas.map((l) => l.text.slice(0, 80)).join(" · "),
            texto: reforzadas.map((l) => l.text).join("\n").slice(0, 400),
            helped: Math.max(...reforzadas.map((l) => l.helped)),
          }),
        }).catch(() => {});
      }
    }

    const lesson = reflectOnTurn({
      model: currentModel,
      tier: profile.tier,
      ok: !looksFailed,
      failureKind,
      firstTokenMs,
      totalMs,
      baselineFirstTokenMs: baseline,
      askedForTools: !profile.toolCapable && agentToolsHint.length === 0 && /crea|crear|escribe|archivo|código|refactor/i.test(text.slice(0, 200)),
    });

    setImprovementSummary(getImprovementSummary());
    if (lesson) {
      setLastLesson(lesson);
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🎓 Nueva lección aprendida: ${lesson.text.slice(0, 90)}${lesson.text.length > 90 ? "…" : ""}`,
      ]);
    }
    // Última telemetría del turno: latencia y estado de los cortacircuitos
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 📈 Turno ${looksFailed ? "con error" : "correcto"} · ${(totalMs / 1000).toFixed(1)} s${firstTokenMs ? ` (primer token ${(firstTokenMs / 1000).toFixed(1)} s)` : ""} · resiliencia: ${describeResilience()}`,
    ]);
    turnStartRef.current = 0;
    firstTokenRef.current = 0;
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sincroniza el estado mostrado por el editor web con la realidad del motor. */
  useEffect(() => {
    if (!webEditorOrderRef.current) return;
    if (isStreaming) {
      setWebEditorStatus((s) => (s.phase === "streaming" ? s : { phase: "streaming", message: "El modelo está escribiendo los cambios…" }));
      return;
    }
    // El stream terminó: si había una orden pendiente, se aplica y se refresca.
    setWebEditorStatus((s) => {
      if (s.phase === "done" || s.phase === "error" || s.phase === "idle") return s;
      webEditorOrderRef.current = false;
      return { phase: "done", message: "Cambios aplicados. El preview se refresca con la sincronización al sandbox." };
    });
  }, [isStreaming]);

  // FOCO v2 — si el mouse se soltó fuera de la ventana (Alt+Tab con un divisor
  // arrastrado), body quedaba con userSelect:"none" y cursor congelado: la
  // interfaz «no dejaba escribir» hasta minimizar y volver. Al perder el foco,
  // todo se resetea.
  useEffect(() => {
    const alPerderFoco = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("blur", alPerderFoco);
    return () => window.removeEventListener("blur", alPerderFoco);
  }, []);

  // v2.6.2 — vigilante del canal editor: 20 s en «sending» sin que el motor
  // haya empezado a emitir = la orden está muerta en el agua (modelo sin
  // servicio, puente caído). Se libera la fase con motivo en vez de dejar el
  // panel secuestrado por un busy eterno.
  useEffect(() => {
    if (webEditorStatus.phase !== "sending" || isStreaming) return;
    const t = setTimeout(() => {
      setWebEditorStatus((s) => {
        if (s.phase !== "sending") return s;
        webEditorOrderRef.current = false;
        return { phase: "error", message: "El motor tardó más de 20 s en empezar a responder (¿modelo caído o puente sin servicio?). Prueba la misma orden desde el Chat para ver el error completo." };
      });
    }, 20000);
    return () => clearTimeout(t);
  }, [webEditorStatus.phase, isStreaming]);

  // Telemetry
  // v2.3.1 · la semilla NO afirma nada: todos los puertos arrancan en `false`
  // CON `medido: false`, que es lo que hace que la cabecera pinte «—» en vez de
  // un «OK» inventado (:3000, :11434) o un «OFF» inventado (el resto). Cuatro
  // superficies con cuatro ternarios propios era el «cuatriplicado que dice
  // indicativos distintos» que reportó el usuario.
  const [telemetry, setTelemetry] = useState<PortTelemetry>({
    port3000: false,
    port3500: false,
    port5000: false,
    port5100: false,
    port5102: false,
    port11434: false,
    medido: false,
    lastChecked: 0,
  });
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[00:00:01] Sistema CerebroNico inicializado.",
    "[00:00:02] Puerto 3000 activo para UI.",
    "[00:00:03] Parser de adjuntos DOCX/ZIP activado.",
  ]);

  // v1.88.1 · LA BITÁCORA NO PUEDE CRECER SIN TECHO (queja medida: «a esa altura
  // de mensajes ya estaba el IDE lento», CPU 100 %). `terminalLogs` se agrandaba
  // desde ~90 sitios sin tope y el panel de Tareas filtra/ordena en cada render.
  // Se muestran 40 líneas: guardar 400 cuesta lo mismo por push y no se nota.
  useEffect(() => {
    setTerminalLogs((l) => podar(l, TOPE_BITACORA));
  }, [terminalLogs.length]);

  const streamerRef = useRef<HighPerformanceAIStreamer>(new HighPerformanceAIStreamer());
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  // v2.3.0 · cuando un catálogo no contesta hay que DECIRLO. Antes la lista
  // quedaba vacía y el modal respondía «No se encontraron modelos con el filtro
  // seleccionado», que es exactamente lo que Mario vio a las 20:38 con el chip
  // diciendo «Z.ai (4+)»: una lista vacía por un request que nadie completó
  // nunca se ve igual que un proveedor sin modelos.
  const [avisoCatalogo, setAvisoCatalogo] = useState<string>("");
  const [isDetectingGemini, setIsDetectingGemini] = useState(false);
  const [isDetectingOpenRouter, setIsDetectingOpenRouter] = useState(false);
  const [isDetectingOpenai, setIsDetectingOpenai] = useState(false);
  const [isDetectingZai, setIsDetectingZai] = useState(false);
  const [isDetectingGroq, setIsDetectingGroq] = useState(false);
  const [isRedetectingAll, setIsRedetectingAll] = useState(false);
  const [detectedGeminiModels, setDetectedGeminiModels] = useState<string[]>([]);
  const [detectedOpenRouterModels, setDetectedOpenRouterModels] = useState<string[]>([]);
  const [detectedOpenaiModels, setDetectedOpenaiModels] = useState<string[]>([]);
  const [detectedZaiModels, setDetectedZaiModels] = useState<string[]>([]);
  const [detectedGroqModels, setDetectedGroqModels] = useState<string[]>([]);
  // v1.58.3 — motores cloud OpenAI-compatibles que faltaban en el selector de
  //   modelos (el backend /api/cloud/models y server.ts ya los soportaban, pero
  //   la UI no surfaceaba sus catálogos). Se autocargan al arranque como Z.ai.
  const [detectedCerebrasModels, setDetectedCerebrasModels] = useState<string[]>([]);
  const [detectedMistralModels, setDetectedMistralModels] = useState<string[]>([]);
  const [detectedTogetherModels, setDetectedTogetherModels] = useState<string[]>([]);
  const [detectedDeepseekModels, setDetectedDeepseekModels] = useState<string[]>([]);
  const [detectedFireworksModels, setDetectedFireworksModels] = useState<string[]>([]);
  // v1.78.0 · los modelos del servidor custom (ranura 4B / API Unificada) ya
  // NO se disfrazan de OpenAI con prefijo `custom:` dentro de
  // detectedOpenaiModels — ese disfraz hacía que al elegirlos el enrutador por
  // nombre los mandara a Ollama («no existe la carpeta para seleccionar
  // los modelos», Mario 26/10). Viven en su lista, con su proveedor real.
  const [detectedCustomModels, setDetectedCustomModels] = useState<string[]>([]);
  // v1.95.2 · LO QUE LA CARPETA DE LA UNIFICADA TIENE QUE PODER DECIR. `fetchCustomModels`
  // escribía el motivo (sin URL / no contestó / 0 modelos) SOLO en la terminal, y el
  // selector mostraba «(0)» pelado. Desde la pantalla donde se elige el modelo,
  // "no lo configuraste" y "el endpoint está apagado" se ven idénticos.
  const [sondaUnificada, setSondaUnificada] = useState<{ total: number; error: string | null; endpoint: string | null; cuando: number }>({ total: 0, error: null, endpoint: null, cuando: 0 });
  const [isDetectingCerebras, setIsDetectingCerebras] = useState(false);
  const [isDetectingMistral, setIsDetectingMistral] = useState(false);
  const [isDetectingTogether, setIsDetectingTogether] = useState(false);
  const [isDetectingDeepseek, setIsDetectingDeepseek] = useState(false);
  const [isDetectingFireworks, setIsDetectingFireworks] = useState(false);

  // ============================================================
  // v1.57.21 — MOTOR Y MODELO SON UNA SOLA DECISIÓN
  // ------------------------------------------------------------
  // El log de Mario (16/10, v1.57.20) traía siete veces el aviso 🧩 del
  // servidor: «el modelo gemma4:31b-cloud es LOCAL pero el turno llegó con
  // provider=zai». La guarda corregía bien, pero el despareado nacía acá: los
  // botones del MOTOR (LeftSidebar y ranuras de ApiKeyModal) hacían
  // `setProvider(p)` a secas y dejaban el modelo anterior pegado. Cada turno
  // salía mal casado y el servidor lo remendaba.
  // La regla, en los dos sentidos:
  //   · cambiar de MODELO elige el motor que le corresponde (`cambiarModelo`,
  //     que ya hacía esto el selector de modelos — ahora también la barra lateral);
  //   · cambiar de MOTOR elige un modelo de ese motor (`cambiarMotor`), y si no
  //     hay ninguno detectado, lo dice en consola en vez de quedarse mudo.
  // La guarda del servidor sigue puesta: es el cinturón, no el volante.
  // ============================================================
  const cambiarModelo = (modelName: string, proveedorSugerido?: string) => {
    setCurrentModel(modelName);
    // v1.6.22 — LOCAL PRIMERO: un modelo instalado en Ollama es local aunque
    // su nombre empiece por "glm-", "gemini", "gpt", etc.
    // v1.78.0 — EL SELECTOR SABE DE QUÉ MOTOR ES CADA TARJETA: cuando viene
    // sugerencia explícita (motor custom / API unificada, zai, groq…) manda la
    // sugerencia; deducir el proveedor por el nombre era justo el defecto que
    // mandaba los modelos de la API unificada a Ollama («no existe»). Sin sugerencia,
    // se conserva la deducción de siempre.
    const locales = availableModels.map((m) => m.name);
    const esLocal = locales.includes(modelName);
    setProvider(
      esLocal ? "ollama" : ((proveedorSugerido as ModelProvider) || proveedorParaModelo(modelName, locales))
    );
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Modelo activo actualizado a: ${modelName}`,
    ]);
  };

  const cambiarMotor = (p: ModelProvider) => {
    const r = modeloAlCambiarMotor(p, currentModel, {
      ollama: availableModels.map((m) => m.name),
      gemini: detectedGeminiModels,
      zai: detectedZaiModels,
      groq: detectedGroqModels,
      openrouter: detectedOpenRouterModels,
      openai: detectedOpenaiModels,
      cerebras: detectedCerebrasModels,
      mistral: detectedMistralModels,
      together: detectedTogetherModels,
      deepseek: detectedDeepseekModels,
      fireworks: detectedFireworksModels,
    });
    if (r.modelo && r.modelo !== currentModel) {
      setCurrentModel(r.modelo);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🔧 Motor ${p}: «${currentModel}» no es de este motor — se pasó a «${r.modelo}» (motor y modelo viajan juntos).`,
      ]);
    } else if (!r.pertenece && !r.modelo) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠ Motor ${p}: no hay modelos detectados para este motor. Se mantiene «${currentModel}»; si el turno llega mal casado, el servidor lo corrige y avisa una sola vez.`,
      ]);
    }
    setProvider(p);
  };

  /**
   * 🔧 Autodetección de modelos Gemini flash (gratuitos) usando la API key del usuario.
   * Llama al endpoint backend /api/gemini/models que a su vez consulta
   * https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY
   * y filtra los modelos flash disponibles para generateContent.
   */
  const fetchGeminiFreeModels = useCallback(async () => {
    if (!geminiApiKey && !geminiServerReady) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Gemini: introduce tu API key en "Ranuras de API Keys" o configura GEMINI_API_KEY en el servidor.`,
      ]);
      return;
    }
    setIsDetectingGemini(true);
    try {
      const endpoint = geminiApiKey.trim()
        ? `/api/gemini/models?key=${encodeURIComponent(geminiApiKey.trim())}`
        : "/api/gemini/models";
      const res = await fetchCatalogo(endpoint);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.name);
      setDetectedGeminiModels(names);
      setAvisoCatalogo((prev) => (prev.startsWith("Gemini:") ? "" : prev));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚡ Gemini: ${names.length} modelo(s) detectado(s)${geminiApiKey.trim() ? " para tu clave" : " (servidor)"} — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}].`,
      ]);
      const preferido = names.includes("gemini-4-hydrogen") ? "gemini-4-hydrogen" : names[0];
      const modeloActual = currentModelRef.current;
      if (names.length > 0 && !modeloActual.startsWith("gemini")) {
        setCurrentModel(preferido);
        setProvider("gemini");
      } else if (names.length > 0 && modeloActual.startsWith("gemini") && !names.includes(modeloActual)) {
        setCurrentModel(preferido);
      }
    } catch (err: any) {
      setAvisoCatalogo(`Gemini: ${String(err?.message || err).slice(0, 90)}`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Gemini autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingGemini(false);
    }
  }, [geminiApiKey, geminiServerReady]);

  // Arranque automático en Gemini 4 (gemini-4-hydrogen) usando clave del servidor cuando no hay elección previa explícita
  useEffect(() => {
    if (!geminiServerReady || geminiBootstrappedRef.current) return;
    geminiBootstrappedRef.current = true;
    const modeloActual = currentModelRef.current;
    const sinEleccionPrevia = !hadExplicitProviderRef.current || (providerRef.current === "cerebro" && modeloActual === "cerebro/auto");
    if (!geminiApiKey.trim() && sinEleccionPrevia) {
      setProvider("gemini");
      setCurrentModel("gemini-4-hydrogen");
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚡ Gemini 4 (gemini-4-hydrogen) activado automáticamente con la clave del servidor.`,
      ]);
    }
    void fetchGeminiFreeModels();
  }, [geminiServerReady, geminiApiKey, fetchGeminiFreeModels]);

  // v1.46.3 — AUTODETECCIÓN AL GUARDAR LA CLAVE. Antes la lista de modelos
  // Gemini solo se refrescaba al pulsar «Redetectar» a mano; si el usuario solo
  // pegaba su clave, el selector seguía mostrando el catálogo estático. Ahora,
  // en cuanto hay una clave estable (con un pequeño retardo para no disparar en
  // cada tecla), se consulta la API UNA vez por clave distinta y se sincroniza
  // la lista real de modelos disponibles para esa cuenta.
  const geminiAutoDetectRef = useRef<string>("");
  useEffect(() => {
    const clave = geminiApiKey.trim();
    if (!clave || clave.length < 20) return;
    if (geminiAutoDetectRef.current === clave) return;
    const t = setTimeout(() => {
      geminiAutoDetectRef.current = clave;
      void fetchGeminiFreeModels();
    }, 800);
    return () => clearTimeout(t);
  }, [geminiApiKey, fetchGeminiFreeModels]);

  /**
   * 🔧 Autodetección de modelos gratuitos de OpenRouter.
   * Llama al endpoint backend /api/openrouter/models que consulta
   * https://openrouter.ai/api/v1/models y filtra los que terminan en ":free",
   * más el modelo virtual "openrouter/free".
   * No requiere API key (es catálogo público), pero la validamos para no listar
   * modelos que luego no se podrán usar.
   */
  const fetchOpenRouterFreeModels = useCallback(async () => {
    if (!openrouterApiKey) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ OpenRouter: introduce tu API key en "Ranuras de API Keys" antes de autodetectar modelos.`,
      ]);
      return;
    }
    setIsDetectingOpenRouter(true);
    try {
      const res = await fetchCatalogo("/api/openrouter/models");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      setDetectedOpenRouterModels(names);
      setAvisoCatalogo((prev) => (prev.startsWith("OpenRouter:") ? "" : prev));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🌐 OpenRouter: ${names.length} modelo(s) gratuito(s) disponible(s) — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}].`,
      ]);
      // Si el modelo actual NO es openrouter y hay modelos disponibles, preferir "openrouter/free"
      if (names.length > 0 && !currentModelRef.current.includes("/")) {
        const preferred = names.includes("openrouter/free") ? "openrouter/free" : names[0];
        setCurrentModel(preferred);
        setProvider("openrouter");
      }
    } catch (err: any) {
      setAvisoCatalogo(`OpenRouter: ${String(err?.message || err).slice(0, 90)}`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ OpenRouter autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingOpenRouter(false);
    }
  }, [openrouterApiKey]);

  /**
   * 🔧 Autodetección de modelos OpenAI disponibles para la API key del usuario.
   * Llama al endpoint backend /api/openai/models que a su vez consulta
   * https://api.openai.com/v1/models con Authorization: Bearer <API_KEY>.
   * Filtra los modelos chat-completion y omite los legacy (gpt-3.5-turbo-instruct, etc).
   */
  const fetchOpenaiAvailableModels = useCallback(async () => {
    if (!openaiApiKey) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ OpenAI: introduce tu API key en "Ranuras de API Keys" antes de autodetectar modelos.`,
      ]);
      return;
    }
    setIsDetectingOpenai(true);
    try {
      // Enviar la API key en el header x-openai-key para que el server no la loguee en URL.
      const res = await fetchCatalogo("/api/openai/models", {
        headers: { "x-openai-key": openaiApiKey },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      setDetectedOpenaiModels(names);
      setAvisoCatalogo((prev) => (prev.startsWith("OpenAI:") ? "" : prev));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚡ OpenAI: ${names.length} modelo(s) disponible(s) para tu clave — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}].`,
      ]);
      // Si el modelo actual no es de OpenAI y hay modelos disponibles, auto-seleccionar el mejor (gpt-4o-mini por velocidad)
      const modeloActual = currentModelRef.current;
      if (names.length > 0 && !modeloActual.startsWith("gpt") && !modeloActual.startsWith("o1") && !modeloActual.startsWith("o3")) {
        const preferred = names.includes("gpt-4o-mini") ? "gpt-4o-mini" : names[0];
        setCurrentModel(preferred);
        setProvider("openai");
      }
    } catch (err: any) {
      setAvisoCatalogo(`OpenAI: ${String(err?.message || err).slice(0, 90)}`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ OpenAI autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingOpenai(false);
    }
  }, [openaiApiKey]);

  /**
   * v1.1 — Autodetección de modelos Z.ai (GLM) gratuitos.
   * Llama al endpoint backend /api/zai/models que devuelve:
   *   - Siempre el catálogo estático (glm-4.5-flash, glm-4-flash, glm-4-air, glm-4-flashx, glm-4.5v-flash).
   *   - Si hay API key, también intenta listar en vivo y los combina.
   * NO requiere API key para mostrar el catálogo estático (todos son gratis).
   */
  const fetchZaiFreeModels = useCallback(async () => {
    setIsDetectingZai(true);
    try {
      const headers: Record<string, string> = {};
      if (zaiApiKey) headers["x-zai-key"] = zaiApiKey;
      let res: Response;
      try {
        res = await fetchCatalogo("/api/zai/models", { headers });
      } catch {
        // Reintento único por arranque frío de Vite en Windows
        await new Promise((r) => setTimeout(r, 1200));
        res = await fetchCatalogo("/api/zai/models", { headers });
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      setDetectedZaiModels(names);
      setAvisoCatalogo((prev) => (prev.startsWith("Z.ai:") ? "" : prev));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🧠 Z.ai: ${names.length} modelo(s) GLM gratuito(s) disponible(s) — [${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}]. Fuente: ${data?.source || "estática"}.`,
      ]);
      if (!zaiAutoSelectRef.current) {
        zaiAutoSelectRef.current = true;
        const savedModel = loadString(LS_KEYS.CURRENT_MODEL);
        if (!savedModel && names.length > 0) {
          const preferred = names.includes("glm-4.5-flash") ? "glm-4.5-flash" : names[0];
          setCurrentModel(preferred);
          setProvider("zai");
          setTerminalLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] 🧠 Modelo inicial: ${preferred} (solo esta vez; ya puedes cambiarlo libremente).`,
          ]);
        }
      }
    } catch (err: any) {
      setAvisoCatalogo(`Z.ai: ${String(err?.message || err).slice(0, 90)}`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Z.ai autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingZai(false);
    }
  }, [zaiApiKey]);

  /**
   * ⚡ Autodetección de modelos Groq (gratuitos) usando la API key del usuario.
   * Llama al endpoint backend /api/cloud/models?provider=groq que a su vez
   * consulta https://api.groq.com/openai/v1/models y filtra los disponibles.
   */
  const fetchGroqFreeModels = useCallback(async () => {
    if (!groqApiKey) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Groq: API key no configurada — omite autodetección`,
      ]);
      return;
    }
    setIsDetectingGroq(true);
    try {
      const res = await fetchCatalogo(`/api/cloud/models?provider=groq&key=${encodeURIComponent(groqApiKey)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models: string[] = Array.isArray(data?.data)
        ? data.data.map((m: any) => m.id)
        : Array.isArray(data?.models)
        ? data.models.map((m: any) => m.id ?? m)
        : [];
      setDetectedGroqModels(models);
      setAvisoCatalogo((prev) => (prev.startsWith("Groq:") ? "" : prev));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚡ Groq: ${models.length} modelos detectados`,
      ]);
    } catch (err: any) {
      setAvisoCatalogo(`Groq: ${String(err?.message || err).slice(0, 90)}`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Groq autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
      ]);
    } finally {
      setIsDetectingGroq(false);
    }
  }, [groqApiKey]);

  // ============================================================
  // v1.58.3 — AUTODETECCIÓN GENÉRICA PARA MOTORES CLOUD OPENAI-COMPAT
  // ------------------------------------------------------------
  // Mario: «no está incluida esa parte» — Cerebras y Mistral (y de paso
  // Together / DeepSeek / Fireworks) nunca aparecían en el selector de modelos.
  // El backend /api/cloud/models ya devuelve su catálogo (estático sin key,
  // live+static con key), así que basta pedirlo igual que a Groq. Se cargan al
  // arranque — así el usuario ve los modelos aunque todavía no haya pegado la key.
  // ============================================================
  const fetchCloudProviderModels = useCallback(
    async (
      provider: string,
      apiKey: string,
      setModels: (m: string[]) => void,
      setDetecting: (b: boolean) => void,
    ) => {
      setDetecting(true);
      try {
        const q = apiKey
          ? `?provider=${provider}&key=${encodeURIComponent(apiKey)}`
          : `?provider=${provider}`;
        let res: Response;
        try {
          res = await fetchCatalogo(`/api/cloud/models${q}`);
        } catch {
          await new Promise((r) => setTimeout(r, 1200));
          res = await fetchCatalogo(`/api/cloud/models${q}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models: string[] = Array.isArray(data?.models)
          ? data.models.map((m: any) => (typeof m === "string" ? m : m.id ?? m.name)).filter(Boolean)
          : Array.isArray(data?.data)
          ? data.data.map((m: any) => m.id ?? m).filter(Boolean)
          : [];
        setModels(models);
        const motivo = typeof data?.motivo === "string" ? data.motivo : "";
        /* v1.0.34 · si la clave no fue aceptada, el backend ya no lo calla: la
           línea viaja con el catálogo guardado y aquí se muestra tal cual. */
        if (motivo) setAvisoCatalogo(motivo.slice(0, 160));
        else setAvisoCatalogo((prev) => (prev.startsWith(`${provider}:`) ? "" : prev));
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ⚡ ${provider}: ${models.length} modelos detectados${apiKey ? "" : " (catálogo estático)"}${motivo ? ` · ⚠️ ${motivo}` : ""}`,
        ]);
      } catch (err: any) {
        setAvisoCatalogo(`${provider}: ${String(err?.message || err).slice(0, 90)}`);
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ❌ ${provider} autodetección falló: ${err.message?.slice(0, 200) || String(err)}`,
        ]);
      } finally {
        setDetecting(false);
      }
    },
    [],
  );

  const fetchCerebrasFreeModels = useCallback(
    () => fetchCloudProviderModels("cerebras", cerebrasApiKey, setDetectedCerebrasModels, setIsDetectingCerebras),
    [fetchCloudProviderModels, cerebrasApiKey],
  );
  const fetchMistralFreeModels = useCallback(
    () => fetchCloudProviderModels("mistral", mistralApiKey, setDetectedMistralModels, setIsDetectingMistral),
    [fetchCloudProviderModels, mistralApiKey],
  );
  const fetchTogetherFreeModels = useCallback(
    () => fetchCloudProviderModels("together", togetherApiKey, setDetectedTogetherModels, setIsDetectingTogether),
    [fetchCloudProviderModels, togetherApiKey],
  );
  const fetchDeepseekFreeModels = useCallback(
    () => fetchCloudProviderModels("deepseek", deepseekApiKey, setDetectedDeepseekModels, setIsDetectingDeepseek),
    [fetchCloudProviderModels, deepseekApiKey],
  );
  const fetchFireworksFreeModels = useCallback(
    () => fetchCloudProviderModels("fireworks", fireworksApiKey, setDetectedFireworksModels, setIsDetectingFireworks),
    [fetchCloudProviderModels, fireworksApiKey],
  );

  // Auto-detect installed models from Ollama
  const fetchInstalledModels = useCallback(async (customUrl?: string) => {
    if (refreshingOllamaRef.current && !customUrl) return;
    const rawTarget = (customUrl || ollamaUrl || DEFAULT_OLLAMA_URL).trim();
    const targetUrl = (rawTarget.replace(/\/+$/, "") || DEFAULT_OLLAMA_URL);
    refreshingOllamaRef.current = true;
    setIsRefreshingModels(true);
    let detected: string[] = [];
    let proxyError = "";

    try {
      // 1. Intento directo rápido (3s): si Ollama nació fuera sin OLLAMA_ORIGINS=*,
      //    devolverá 403 CORS (!res.ok) o error de red, y debemos pasar de inmediato
      //    al proxy del servidor (/api/ollama/models) con fetchCritico sin esperar cola cloud.
      try {
        if (ollamaApiKey || window.location.protocol === "https:") throw new Error("Usar backend autenticado");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${targetUrl}/api/tags`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.models)) {
            detected = data.models
              .map((m: any) => m.name || m.model || m.id || (typeof m === "string" ? m : ""))
              .filter((s: string) => typeof s === "string" && s.trim().length > 0);
          }
        }
      } catch {
        // Silencioso: cualquier bloqueo CORS, 403, timeout o red pasa al proxy del servidor.
      }

      // 2. Respaldo por servidor (/api/ollama/models) SIEMPRE que el directo no devolvió modelos
      //    (incluye HTTP 403 / !res.ok, CORS, localhost vs 127.0.0.1 o lista vacía).
      if (detected.length === 0) {
        try {
          const proxyRes = await fetchCritico(`/api/ollama/models?url=${encodeURIComponent(targetUrl)}`, {headers: ollamaApiKey ? {"x-ollama-key": ollamaApiKey} : {}}, 40000);
          if (proxyRes.ok) {
            const data = await proxyRes.json();
            if (data && Array.isArray(data.models)) {
              detected = data.models
                .map((m: any) => m.name || m.model || m.id || (typeof m === "string" ? m : ""))
                .filter((s: string) => typeof s === "string" && s.trim().length > 0);
            }
            if (detected.length === 0 && typeof data?.error === "string" && data.error.trim()) {
              proxyError = data.error.trim();
            }
          } else {
            proxyError = `HTTP ${proxyRes.status}`;
          }
        } catch (err: any) {
          proxyError = String(err?.message || err || "Error consultando /api/ollama/models");
        }
      }
    } finally {
      refreshingOllamaRef.current = false;
      setIsRefreshingModels(false);
    }

    if (detected.length > 0) {
      const auditoria = auditarListaOllama(detected);
      setAvailableModels(auditoria.todos.map((t) => ({ name: t.name, rol: t.rol, motivo: t.motivo })));
      setAvisoCatalogo((prev) => (prev.startsWith("Ollama:") ? "" : prev));
      const nombres = auditoria.todos.map((t) => t.name);
      const displayList = nombres.length <= 12
        ? nombres.join(", ")
        : nombres.slice(0, 12).join(", ") + ` … (+${nombres.length - 12} más)`;
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🦙 Ollama: ${auditoria.conteo.total} modelo(s) en ${targetUrl} (${auditoria.conteo.chat} de chat, ${auditoria.conteo.embeddings} embedding, ${auditoria.conteo.fim} FIM — todos visibles, los no-chat etiquetados): [${displayList}]`,
      ]);

      const preferred = detected.find((m) => m.includes("qwen2.5-coder") || m.includes("deepseek") || m.includes("stablelm") || m.includes("coder")) || detected[0];
      const modeloActual = currentModelRef.current;
      if (preferred && (!modeloActual || modeloActual === "stablelm2:latest")) {
        setCurrentModel(preferred);
      }
    } else {
      if (proxyError) {
        setAvisoCatalogo((prev) => prev || `Ollama: ${proxyError.slice(0, 90)}`);
      }
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ℹ️ Ollama: No se detectaron modelos en ${targetUrl}${proxyError ? ` (${proxyError})` : ""} (catálogo global + fallback autónomo activos).`,
      ]);
    }
  }, [ollamaUrl, ollamaApiKey]);

  /**
   * 🔧 Cargar modelos del Servidor Personalizado (Groq, Cerebras, Together, Mistral, etc.)
   * Llama al endpoint backend /api/custom/models que a su vez consulta
   * la URL del servidor Custom con Authorization: Bearer <KEY>.
   */
  const fetchCustomModels = useCallback(async () => {
    if (!customServerUrl) {
      // v1.95.2 · se limpia el estado anterior (un error viejo de otra URL no puede
      // seguir contándole al selector que el endpoint no respondió).
      setSondaUnificada({ total: 0, error: null, endpoint: null, cuando: 0 });
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Custom: configura la URL del endpoint en "Ranuras de API Keys" antes de cargar modelos.`,
      ]);
      return;
    }
    setIsDetectingOpenai(true); // reusamos el mismo flag de "detectando" del OpenAI spinner
    try {
      const headers: Record<string, string> = { "x-custom-url": customServerUrl };
      if (customApiKey) headers["x-custom-key"] = customApiKey;
      const res = await fetchCatalogo("/api/custom/models", { headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const names: string[] = (data?.models || []).map((m: any) => m.id || m.name);
      // v1.78.0 · los custom tienen su propia lista (carpeta 🧩 Unificada en el
      // selector). También se barre el disfraz viejo: cualquier `custom:` que
      // hubiera quedado mezclado con los OpenAI reales.
      setDetectedCustomModels(Array.from(new Set(names)));
      // v1.95.2 · se guarda CUÁNTOS y DESDE DÓNDE, para que el selector pueda decirlo.
      setSondaUnificada({ total: names.length, error: null, endpoint: (data && data.endpoint) ? String(data.endpoint) : customServerUrl, cuando: Date.now() });
      setDetectedOpenaiModels((prev) => prev.filter((n) => !String(n).startsWith("custom:")));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🌐 Custom [${customServerUrl}]: ${names.length} modelo(s) disponible(s) — [${names.slice(0, 8).join(", ")}${names.length > 8 ? ` … (+${names.length - 8})` : ""}].`,
      ]);
      // Auto-seleccionar el primero si el modelo actual no es custom.
      // v1.80.0 · excepción honesta: `cerebro/auto` ES la elección del usuario
      // (el enjambre ya usa estos modelos como voces); robarle el micrófono al
      // detectar el router era devolverlo a un solo proveedor por sorpresa.
      if (names.length > 0 && provider !== "custom" && !String(currentModelRef.current || "").startsWith("cerebro/")) {
        setCurrentModel(names[0]);
        setProvider("custom");
      }
    } catch (err: any) {
      // v1.95.2 · el motivo se guarda REDACTADO y llega al selector. El error de un
      // endpoint puede traer credenciales rebotadas (así se filtró la clave de
      // OpenRouter en la sesión de Mario), y una carpeta vacía sin explicación es
      // indistinguible de un apagón.
      const causa = redactarSecretos(err && err.message ? String(err.message) : String(err));
      setSondaUnificada((prev) => ({ total: prev.total, error: causa.texto.slice(0, 240), endpoint: customServerUrl, cuando: Date.now() }));
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Custom autodetección falló: ${causa.texto.slice(0, 200)}${causa.ocultas ? ` [${causa.ocultas} credencial(es) ocultada(s)]` : ""}`,
      ]);
    } finally {
      setIsDetectingOpenai(false);
    }
  }, [customServerUrl, customApiKey, provider]);

  /**
   * 🔧 Redetección global: ejecuta en paralelo la autodetección de Ollama,
   * Gemini, OpenRouter, OpenAI y el servidor Custom. Útil para "limpiar y
   * volver a escanear" después de instalar nuevos modelos o cambiar claves.
   */
  const redetectAllModels = useCallback(async () => {
    if (isRedetectingAll) return;
    setIsRedetectingAll(true);
    setAvisoCatalogo("");
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🔄 Redetectando TODOS los proveedores (Ollama + OpenAI + Gemini + OpenRouter + Z.ai + Groq + Custom) en paralelo...`,
    ]);
    try {
      // v2.1.6 — EL BOTÓN QUE SE QUEDABA EN «DETECTANDO...» Y LA PANTALLA QUE
      // DECÍA «SERVIDOR LOCAL CAÍDO» ERAN EL MISMO BUG.
      //
      // Antes: doce sondeos a la vez, todos contra el MISMO origen (:3000). El
      // navegador sólo abre 6 conexiones por origen, así que seis quedaban en
      // cola, y cada una podía esperar hasta el techo de PRIMER BYTE del
      // servidor (120 s). Con las seis conexiones ocupadas, el latido de
      // `/api/coreo` —que caduca a los 2,8 s— no conseguía ni un socket: la
      // cabecera decía «servidor local caído» con el servidor perfectamente
      // sano, y el botón no volvía nunca porque `allSettled` espera a los doce.
      //
      // Ahora: de a TRES (media docena ya no se atropella) y con un techo total.
      // Si un proveedor no contesta, se dice cuál y el botón se libera igual.
      const sondeos: Array<{ nombre: string; correr: () => Promise<unknown> }> = [
        { nombre: "Ollama", correr: () => fetchInstalledModels() },
        { nombre: "OpenAI", correr: () => (openaiApiKey ? fetchOpenaiAvailableModels() : Promise.resolve()) },
        { nombre: "Gemini", correr: () => ((geminiApiKey || geminiServerReady) ? fetchGeminiFreeModels() : Promise.resolve()) },
        { nombre: "OpenRouter", correr: () => (openrouterApiKey ? fetchOpenRouterFreeModels() : Promise.resolve()) },
        { nombre: "Z.ai", correr: () => fetchZaiFreeModels() },
        { nombre: "Groq", correr: () => (groqApiKey ? fetchGroqFreeModels() : Promise.resolve()) },
        { nombre: "Cerebras", correr: () => fetchCerebrasFreeModels() },
        { nombre: "Mistral", correr: () => fetchMistralFreeModels() },
        { nombre: "Together", correr: () => fetchTogetherFreeModels() },
        { nombre: "DeepSeek", correr: () => fetchDeepseekFreeModels() },
        { nombre: "Fireworks", correr: () => fetchFireworksFreeModels() },
        { nombre: "Custom", correr: () => (customServerUrl ? fetchCustomModels() : Promise.resolve()) },
      ];

      const enParalelo = 3;
      const sinRespuesta: string[] = [];
      const cola = [...sondeos];
      const trabajador = async () => {
        for (;;) {
          const tarea = cola.shift();
          if (!tarea) return;
          try {
            await tarea.correr();
          } catch (e: any) {
            sinRespuesta.push(`${tarea.nombre}: ${String(e?.message || e).slice(0, 80)}`);
          }
        }
      };
      const turnos = Array.from({ length: Math.min(enParalelo, sondeos.length) }, () => trabajador());
      // Techo total: aunque un sondeo se atore, el botón se libera y se informa.
      await Promise.race([
        Promise.allSettled(turnos),
        new Promise((listo) => setTimeout(listo, 20000)),
      ]);
      if (sinRespuesta.length) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ⚠ Redetección con avisos: ${sinRespuesta.join(" · ")}`,
        ]);
      }
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✅ Redetección global completada.`,
      ]);
    } finally {
      setIsRedetectingAll(false);
    }
  }, [isRedetectingAll, fetchInstalledModels, fetchOpenaiAvailableModels, fetchGeminiFreeModels, fetchOpenRouterFreeModels, fetchZaiFreeModels, fetchGroqFreeModels, fetchCerebrasFreeModels, fetchMistralFreeModels, fetchTogetherFreeModels, fetchDeepseekFreeModels, fetchFireworksFreeModels, fetchCustomModels, openaiApiKey, geminiApiKey, geminiServerReady, openrouterApiKey, groqApiKey, customServerUrl]);

  // Check Telemetry & Auto-detect models
  const telemetriaEnVuelo = useRef(false);
  const checkTelemetry = useCallback(async () => {
    // v2.3.0 · el intervalo es de 10 s pero el request no tenía límite: con el
    // servidor ocupado, cada tick sumaba otro fetch al mismo origen y los seis
    // sockets de Chrome se llenaban de sondeos de salud duplicados. Con la
    // guarda hay un sondeo a la vez, como mucho.
    if (telemetriaEnVuelo.current) return;
    telemetriaEnVuelo.current = true;
    try {
      const res = await fetchCritico("/api/telemetry/ports", {}, 8000);
      if (res.ok) {
        const data = await res.json();
        // `medido: true` recién acá: desde este render la cabecera puede decir
        // OK/OFF; antes de este render, y mientras el sondeo esté en vuelo, dice «—».
        setTelemetry({ ...data, medido: true });
        if (data.port11434 && availableModelsCountRef.current === 0 && Date.now() - lastTelemetryOllamaRetryRef.current > 15000) {
          lastTelemetryOllamaRetryRef.current = Date.now();
          void fetchInstalledModels();
        }
      }
    } catch {
      // No se traga el error a secas: si el sondeo falla, la tarjeta de
      // Servicios muestra la última muestra con su marca de tiempo, y el latido
      // de la cabecera (que va por otro camino) es el que dice si el 3000 vive.
    } finally {
      telemetriaEnVuelo.current = false;
    }
  }, [fetchInstalledModels]);

  // v1.80.0 · LA CARPETA SE LLENA SOLA (pedido de Mario 27/10: «revisá bien que
  // la ranura tenga una carpeta con sus modelos en el selector»). Si hay URL de
  // API unificada cargada y la carpeta está vacía, la detección corre al abrir
  // la IDE — una vez por arranque y sin molestar: el usuario elige el endpoint,
  // la casa se encarga de que sus modelos estén donde se eligen.
  // v1.94.1 · EL LATCH DE UN SOLO INTENTO ERA LA MITAD DEL «NUNCA CARGAN»
  // (queja de Mario, 30/10). Hasta acá el ref se ponía en `true` ANTES de intentar,
  // así que un router unificado que nace después de la IDE (el caso real: el endpoint
  // arranca más lento que la IDE) perdía el único intento del arranque y la carpeta
  // quedaba vacia hasta el próximo reinicio — sin ninguna segunda oportunidad en la
  // pantalla donde se elige el modelo. Se cambia el cerrojo por reintentos contados y
  // crecientes (mismo criterio que los packs: el servidor puede tardar, el usuario no
  // tiene que adivinar), que se detienen en cuanto la carpeta tiene modelos.
  // v1.95.2 · el tope vive en `estadoUnificada.ts` para que el reintento automático y el
  // mensaje que ve el usuario no discrepen del número (la casa ya tenía ese defecto: la
  // carpeta decía «pedí la lista» sin decir que los intentos automáticos se agotaron).
  const INTENTOS_UNIFICADA = INTENTOS_UNIFICADA_TOPE;
  const [intentoUnificada, setIntentoUnificada] = useState(0);
  useEffect(() => {
    if (!customServerUrl) return;
    if (detectedCustomModels.length > 0) return;
    if (intentoUnificada >= INTENTOS_UNIFICADA) return;
    const t = setTimeout(() => {
      setIntentoUnificada((n) => n + 1);
      void fetchCustomModels();
    }, 1200 + intentoUnificada * 1500);
    return () => clearTimeout(t);
  }, [customServerUrl, detectedCustomModels.length, intentoUnificada, fetchCustomModels]);

  /**
   * v1.95.2 · SONDEO A PEDIDO, CON EL CONTADOR REINICIADO. El botón «Cargar modelos de
   * la API unificada» del selector llamaba a `fetchCustomModels` a secas: funcionaba una
   * vez, pero si el reintento automático ya había gastado los 6 intentos (≈30 s) y el
   * router del usuario levantó en el minuto 4, la carpeta seguía vacía y nadie volvía a
   * preguntar. Abrir el selector o pulsar el botón reinicia la ventana de intentos: el
   * router de Mario es un proceso que él levanta cuando quiere, no un servicio del sistema.
   */
  const sondarUnificadaAhora = useCallback(() => {
    setIntentoUnificada(0);
    void fetchCustomModels();
  }, [fetchCustomModels]);

  // Fetch Subagents topology (live status of UI / Bridge / Ollama / Sandbox)
  const fetchSubagents = useCallback(async () => {
    try {
      const res = await fetch("/api/subagents");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          setSubagents(data);
        }
      }
    } catch {}
  }, []);

  // 🔧 Reconexión completa: reinicia el puente Python (:5000) e invalida el cache
  // de telemetría para que el próximo check refleje el estado real de Ollama (:11434).
  // Este es el handler que usa el botón "Reconectar" de la UI.
  const [isReconnecting, setIsReconnecting] = useState(false);
  // v1.99.0 · LA PROYECCION DEL CHAT SE CALCULA UNA VEZ POR MENSAJE NUEVO (lo que falta
  // de #16 para cumplir la promesa: antes se fabricaba el arreglo NUEVO con objetos
  // NUEVOS en cada render — o sea en cada tecla —, lo que anula cualquier memo aguas
  // abajo y obligaba a repintar el historial. La dependencia es `messages`, que es la
  // unica cosa que puede cambiar lo que se lee en la pantalla del chat.)
  const chatProyectado = useMemo(
    () => messages.map((m: any) => ({ role: m.role, content: m.content })),
    [messages],
  );
  const handleReconnectAll = useCallback(async () => {
    if (isReconnecting) return;
    setIsReconnecting(true);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🔧 Reconectando puente Python (:5000) y refrescando telemetría...`,
    ]);
    try {
      // 1. Reiniciar el puente Python (server lo vuelve a spawnear)
      try {
        const bridgeRes = await fetch("/api/bridge/restart", { method: "POST" });
        const bridgeData = await bridgeRes.json().catch(() => ({}));
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}]   ↳ Puente 5000: ${bridgeData.ok ? "OK reiniciado" : "fallo (" + (bridgeData.error || "desconocido") + ")"}`,
        ]);
      } catch (e: any) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}]   ↳ Puente 5000: no se pudo reiniciar (${e.message})`,
        ]);
      }
      // 2. Invalidar cache de telemetría y forzar re-check
      try {
        await fetch("/api/telemetry/refresh", { method: "POST" });
      } catch {}
      // 3. Re-verificar telemetría inmediatamente
      await checkTelemetry();
      // 4. Re-detectar modelos de Ollama
      await fetchInstalledModels();
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✅ Reconexión completada. Re-verifica los puertos en la pestaña "Puertos".`,
      ]);
    } finally {
      setIsReconnecting(false);
    }
  }, [checkTelemetry, fetchInstalledModels, isReconnecting]);

  useEffect(() => {
    checkTelemetry();
    fetchInstalledModels();
    // v1.1 — Auto-cargar el catálogo de Z.ai al iniciar (NO requiere API key):
    //   así el usuario ve los modelos GLM gratuitos disponibles desde el arranque.
    fetchZaiFreeModels();
    // v1.43.0 — Auto-cargar modelos Groq si API key está configurada:
    if (groqApiKey) fetchGroqFreeModels();
    // v1.58.3 — Auto-cargar catálogos de Cerebras / Mistral / Together /
    //   DeepSeek / Fireworks al arranque (el backend devuelve catálogo estático
    //   sin key, así el usuario los ve y puede elegir modelo desde el inicio).
    fetchCerebrasFreeModels();
    fetchMistralFreeModels();
    fetchTogetherFreeModels();
    fetchDeepseekFreeModels();
    fetchFireworksFreeModels();
    fetchSubagents();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void checkTelemetry();
    }, 10000);
    const subInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchSubagents();
    }, 15000);
    return () => {
      clearInterval(interval);
      clearInterval(subInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkTelemetry, fetchInstalledModels, fetchSubagents, fetchZaiFreeModels, fetchGroqFreeModels, fetchCerebrasFreeModels, fetchMistralFreeModels, fetchTogetherFreeModels, fetchDeepseekFreeModels, fetchFireworksFreeModels, groqApiKey]);

  // ============================================================
  // v8.0.3 — ESTADO REAL DEL SANDBOX (el indicador que mentía)
  // ------------------------------------------------------------
  // `sandboxRunning` se pasaba al editor web y allí decidía el color del punto
  // de estado y si aparecía el aviso «el sandbox no está corriendo». Pero nunca
  // se actualizaba: estaba clavado en `true`. Ahora se pregunta al motor.
  //
  // Cada 6 s, no cada 10 como la telemetría: el sandbox se arranca y se para a
  // mano, y un indicador que tarda 10 s en reflejarlo hace que el usuario pulse
  // «Arrancar» dos veces. El sondeo es un GET local barato; el coste real de
  // equivocarse aquí es el usuario, no la CPU.
  // ============================================================
  useEffect(() => {
    let vivo = true;
    const sondear = async () => {
      try {
        const r = await fetch("/api/sandbox/status");
        const d: any = await r.json();
        if (vivo) setSandboxRunning(!!(d && (d.online === true || d.running === true)));
      } catch {
        // Motor caído o recargando: se declara NO vivo. Decir «activo» cuando no
        // se pudo preguntar sería volver al defecto que se acaba de corregir.
        if (vivo) setSandboxRunning(false);
      }
    };
    sondear();
    const intervalo = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void sondear();
    }, 6000);
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, []);

  // Add Attachments with Automatic DOCX/ZIP Unpacking
  // ============================================================
  // v1.16.4 · CAMINO DE LOS ARCHIVOS — PEAJE DE ENTRADA AL ÁRBOL
  // ------------------------------------------------------------
  // El viaje que el usuario definió: lo que entra por el chat o por el
  // adjunto del editor llega al CONTENEDOR; solo lo NECESARIO del proyecto
  // continúa al ÁRBOL DEL PROYECTO; y recién desde ahí, una LISTA QUIRÚRGICA
  // cruza al SANDBOX. Esta función es el primer peaje:
  //   · PROHIBIDO (node_modules, .git, secretos, logs, copias .proyectos,
  //     rutas absolutas o con «..») → no entra nunca, con su motivo en la
  //     terminal. Nunca en silencio.
  //   · PREGUNTA (no se reconoce, es pesado o es de datos) → se confirma en
  //     bloque con la pregunta que LA PROPIA ADUANA redactó (auditarArbol):
  //     una pregunta vaga produce un «sí» que no autoriza nada.
  //   · INCLUIR (código/config/documentación) → sigue de largo, preguntar por
  //     un .ts sería ruido.
  // Lo rechazado no se pierde: sigue vivo como adjunto del chat (contexto
  // para el modelo); simplemente NO se hace archivo del proyecto.
  // ============================================================
  const aduanaDeEntrada = (nuevos: WorkspaceFile[], origen: string): WorkspaceFile[] => {
    if (nuevos.length === 0) return nuevos;
    const hora = () => new Date().toLocaleTimeString();
    const veredictos = nuevos.map((f) => clasificarRuta(f.path));
    const prohibidos = nuevos.filter((_, i) => veredictos[i].veredicto === "prohibido");
    const preguntar = nuevos.filter((_, i) => veredictos[i].veredicto === "preguntar");
    const incluidas = nuevos.filter((_, i) => veredictos[i].veredicto === "incluir");
    const lineas: string[] = [];
    prohibidos.slice(0, 6).forEach((f) =>
      lineas.push(`[${hora()}] ⛔ Aduana (${origen}): «${f.path}» NO continúa al árbol — ${clasificarRuta(f.path).motivo}`)
    );
    if (prohibidos.length > 6) lineas.push(`[${hora()}] ⛔ …y ${prohibidos.length - 6} vetado(s) más por la aduana.`);
    let autorizadas: WorkspaceFile[] = [];
    if (preguntar.length > 0) {
      const aud = auditarArbol(preguntar.map((f) => f.path));
      const ok = window.confirm(
        `${aud.pregunta || `¿Añado ${preguntar.length} archivo(s) que la aduana no reconoce?`}\n\nSi dices que NO, siguen disponibles como adjunto del chat pero NO como archivo del proyecto.`
      );
      lineas.push(`[${hora()}] ❓ ${preguntar.length} archivo(s) pedían confirmación (${origen}): ${ok ? "AUTORIZADOS por el usuario" : "dejados FUERA por el usuario"}.`);
      if (ok) autorizadas = preguntar;
    }
    const finales = [...incluidas, ...autorizadas];
    if (finales.length !== nuevos.length)
      lineas.push(`[${hora()}] 🧭 Camino de los archivos · ${origen}: ${nuevos.length} pasaron por la aduana → ${finales.length} continúan al árbol del proyecto.`);
    if (lineas.length) setTerminalLogs((prev) => [...prev, ...lineas]);
    return finales;
  };

  const prepararArchivosEntrantes = async (archivos: File[]): Promise<File[]> => {
    const agrupacion = agruparPartesMultivolumen(archivos);
    const resultado: File[] = [...agrupacion.sueltos];
    const hora = () => new Date().toLocaleTimeString();

    for (const inc of agrupacion.incompletos) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${hora()}] ⚠️ ZIP multivolumen incompleto (${inc.nombreBaseZip}): ${inc.motivo}`,
      ]);
    }

    for (const grp of agrupacion.completos) {
      try {
        const leidas = await Promise.all(
          grp.partes.map(async (p) => ({
            name: p.archivo.name,
            bytes: new Uint8Array(await p.archivo.arrayBuffer()),
          }))
        );
        const ensamblado = ensamblarBinarioMultivolumen(leidas);
        const archivoZip = new File(
          [ensamblado.bytes.buffer as ArrayBuffer],
          ensamblado.nombreSalida,
          { type: "application/zip" }
        );
        const kb = Math.max(1, Math.round(ensamblado.totalBytes / 1024));
        setTerminalLogs((prev) => [
          ...prev,
          `[${hora()}] 🧩 ZIP multivolumen ensamblado: ${ensamblado.nombreSalida} (${grp.totalPartes} partes, ${kb} KB)${ensamblado.esZip ? "" : " — sin firma PK estándar, se intenta abrir igualmente"}`,
        ]);
        resultado.push(archivoZip);
      } catch (err) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${hora()}] ⚠️ No se pudo ensamblar "${grp.nombreBaseZip}": ${String(err).slice(0, 120)}`,
        ]);
      }
    }

    return resultado;
  };

  const handleAddAttachments = async (files: FileList | File[]) => {
    const fileArray = await prepararArchivosEntrantes(Array.from(files));
    if (fileArray.length === 0) return;
    const newWorkspaceFiles: WorkspaceFile[] = [];

    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Procesando ${fileArray.length} archivo(s) adjunto(s)...`,
    ]);

    // v8.0.3 — Los nombres entran en la cola de «cargando» TODOS de golpe, antes
    // de procesar ninguno. Así el usuario ve la lista completa de lo que falta
    // desde el primer instante, en vez de una tira vacía seguida de un volcado.
    setAttachmentsCargando((prev) => [...prev, ...fileArray.map((f) => f.name)]);

    for (const file of fileArray) {
      try {
        const { attachment, workspaceFiles: extractedFiles } = await processUploadedFile(file);
        // Uno a uno: el chip con su miniatura aparece en cuanto ESTE archivo está
        // listo, sin esperar a los demás.
        setPendingAttachments((prev) => [...prev, attachment]);
        if (extractedFiles.length > 0) {
          newWorkspaceFiles.push(...extractedFiles);
        }
      } catch (err) {
        console.error("Error procesando adjunto:", err);
      } finally {
        // Se retira SIEMPRE, también cuando falló. Un chip fantasma eterno sería
        // peor que no haberlo puesto: el usuario esperaría algo que ya no va a
        // llegar. Se quita la primera coincidencia, que es la de esta iteración.
        setAttachmentsCargando((prev) => {
          const i = prev.indexOf(file.name);
          if (i === -1) return prev;
          return [...prev.slice(0, i), ...prev.slice(i + 1)];
        });
      }
    }

    // PEAJE 1 (v1.16.4): del contenedor al árbol del proyecto solo continúa lo
    // que la aduana admite; lo prohibido queda fuera con su motivo.
    const admitidos = marcarComoEntrada(aduanaDeEntrada(newWorkspaceFiles, "adjunto del chat")); // v1.60.5 — lo que entra por la aduana es del árbol de ENTRADA
    if (admitidos.length > 0) {
      setWorkspaceFiles((prev) => {
        const map = new Map<string, WorkspaceFile>();
        prev.forEach((f) => map.set(f.path, f));
        admitidos.forEach((f) => map.set(f.path, f));
        return Array.from(map.values());
      });
      setActiveFileId(admitidos[0].id);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${admitidos.length} archivo(s) extraído(s) e incorporado(s) al editor sin rombos ni caracteres corruptos.`,
      ]);
    }
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Send Message with Context Cache Management & Message Queue
  const executeSendMessage = (
    text: string,
    attachments: AttachmentItem[],
    currentHistory: ChatMessage[],
    extraSystemInstruction?: string
  ) => {
    // PUGIL v1 — los modelos de EMBEDDINGS no chatean: Ollama los rechaza con
    // 400 en /api/chat y la UI lo contaba como «se cortó la comunicación».
    // La verdad se dice antes de gastar el pedido.
    if (esModeloEmbeds(currentModel)) {
      const pugilMsg: ChatMessage = { id: "msg-" + Date.now(), role: "assistant", content: motivoEmbeds(currentModel), timestamp: Date.now() };
      setMessages((h) => [...h, pugilMsg]);
      setIsStreaming(false);
      return;
    } /*PUGIL*/
    // PUGIL v1 — los modelos de EMBEDDINGS no chatean: Ollama los rechaza con
    // 400 en /api/chat y la UI lo contaba como «se cortó la comunicación».
    // La verdad se dice antes de gastar el pedido.
    if (esModeloEmbeds(currentModel)) {
      const pugilMsg: ChatMessage = { id: "msg-" + Date.now(), role: "assistant", content: motivoEmbeds(currentModel), timestamp: Date.now() };
      setMessages((h) => [...h, pugilMsg]);
      setIsStreaming(false);
      return;
    } /*PUGIL*/
    const userMsg: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      attachments: [...attachments],
    };

    const updatedHistory = [...currentHistory, userMsg];

    // ============================================================
    // v2.0 — CANAL DIRECTO DEL EDITOR WEB (recorrido simplificado)
    // ------------------------------------------------------------
    // Antes: orden del editor → chat central → el chat central devolvía el prompt
    // al editor → preview. Una vuelta ilógica que además ensuciaba la
    // conversación con órdenes que no eran tuyas.
    // Ahora: si la orden viene del editor (webEditorOrderRef en true), se envía
    // igual al MOTOR —el payload se construye con `updatedHistory`, así que el
    // modelo la recibe completa— pero NO se publica en el chat: la respuesta se
    // queda en el editor, y los archivos generados se aplican por la vía normal
    // (workspace → autosync → sandbox → preview).
    // ============================================================
    const desdeElEditor = webEditorOrderRef.current === true;
    // ORDEN VISIBLE v1: la orden del editor se publica en el chat central como
    // cualquier otra. El canal directo de v2.0 la escondía y la experiencia era
    // «no hizo nada» — lo que no se ve, no existe.
    setMessages(updatedHistory);
    setIsStreaming(true);
    setCurrentStreamingText("");
    setAgentTasks([]);
    setActionLog([]);
    // v1.70.6 — las imágenes reales son POR TURNO: lo que subió el usuario este
    // turno es la carne de la reparación de <img>; la lista vieja no viaja.
    imagenesTurnoRef.current = [];

    // Build context payload following the strict cache policy with full history support
    // ============================================================
    // v2.0 — AUTOSUPERACIÓN + RENDIMIENTO en el prompt
    // ------------------------------------------------------------
    // 1. `modelName` + `ramGb`: el prompt, el contexto y los archivos abiertos
    //    se dimensionan al modelo real (antes eran los mismos para todos).
    // 2. `historyWindow`: memoria larga configurable (60 mensajes por defecto).
    // 3. `extra`: las 3-4 LECCIONES más relevantes para esta petición. Solo las
    //    relevantes: inyectar 100 lecciones sería más lento y peor.
    // ============================================================
    const relevantLessons = getRelevantLessons(text, 4);
    const contextPayload = buildContextCachePayload(
      currentHistory,
      workspaceFiles,
      activeFileId,
      text,
      responseLanguage,
      expertMode,
      {
        modelName: currentModel,
        historyWindow,
        toolNames: agentToolsHint,
        extra: buildSelfImprovementDirective(relevantLessons),
      }
    );
    {
      const info = contextPayload.promptInfo;
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🧠 Prompt "${info.level}" ≈${info.estTokens} tokens · memoria: ${info.historyIncluded} mensaje(s) íntegro(s), ${info.historySummarized} resumido(s)${info.dropped > 0 ? `, ${info.dropped} descartado(s)` : ""} · ${info.openFilesCount} archivo(s)`,
      ]);
      if (relevantLessons.length > 0) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] 🎓 Autosuperación: ${relevantLessons.length} lección(es) aplicadas al prompt de este turno.`,
        ]);
      }
      for (const note of info.notes) {
        setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚙️ ${note}`]);
      }
    }
    // Telemetría: se marca el inicio del turno para medir latencia real
    turnStartRef.current = Date.now();
    firstTokenRef.current = 0;

    if (contextPayload.isFirstMessage) {
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] ⚡ Context Cache: Inyectados MEMORIA.md y skills.md como mensajes de sistema ocultos (Turno 1).`,
      ]);
    } else {
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] ⚡ Context: Historial total activo (${currentHistory.length + 1} turnos) + ${
          contextPayload.openFiles.length
        } archivo(s) abiertos.`,
      ]);
    }

    // v1.22.0 · MOTOR VIVO — el PRIMER paso del turno avisa al panel de Tareas.
    // Sin el aviso la hoja tardaba hasta 2 s en asomar, que es exactamente el
    // «sigue diciendo 0» que se veía. Es un aviso por turno, no por paso: el
    // resto lo trae el refresco rápido del propio panel.
    let pasoVivoAvisado = false;

    streamerRef.current.stream(
      text,
      attachments,
      contextPayload.history as any,
      {
        provider,
        model: currentModel,
        temperature,
        // 🔧 Combinar el systemInstruction base (contextCache) con el extra (SLM/Evolution/RAG)
        // ANTES: el PROTOCOLO SLM se inyectaba como PREFIJO del prompt del usuario → aparecía visible.
        // AHORA: se inyecta como systemInstruction → el modelo lo lee pero no lo muestra.
        systemInstruction: extraSystemInstruction
          ? `${contextPayload.systemInstruction}\n\n${extraSystemInstruction}`
          : contextPayload.systemInstruction,
        hiddenSystemFiles: contextPayload.hiddenSystemFiles,
        openFiles: contextPayload.openFiles,
        ollamaUrl,
        ollamaApiKey,
        openrouterApiKey,
        geminiApiKey,
        customServerUrl,
        customApiKey,
        openaiApiKey,
        // v1.1 — Pass dedicated cloud provider API keys to the streamer:
        zaiApiKey,
        groqApiKey,
        cerebrasApiKey,
        togetherApiKey,
        mistralApiKey,
        deepseekApiKey,
        fireworksApiKey,
        pcMode,
        geminiThinkingLevel: provider === "gemini" ? MAPA_NIVEL_SDK[(esNivelRazonGemini((proSettings as any)?.ai?.geminiThinkingLevel) ? (proSettings as any).ai.geminiThinkingLevel : "bajo") as NivelRazonGemini] : undefined,
      },
      {
        onChunk: (accumulated) => {
          setCurrentStreamingText(accumulated);
        },
        onTask: (event) => {
          // v1.48.0 — EL AGENTE ABRE EL PREVISUALIZADOR A VOLUNTAD. El motor
          // emite { type:"abrir_preview" } desde cualquier proveedor; la UI abre
          // el editor web, arranca el sandbox si hace falta y refresca el iframe.
          if ((event as any).type === "abrir_preview") {
            const motivo = String((event as any).motivo || "").trim();
            setTerminalLogs((l) => [
              ...l,
              `[${new Date().toLocaleTimeString()}] 👁️ El agente abrió el previsualizador${motivo ? ` — ${motivo}` : ""}`,
            ]);
            openWebEditorTab();
            (async () => {
              try {
                // v1.86.6 — el preview debe servir la carpeta que el usuario
                // fijó (CANAL DIRECTO), no la que la autodetección desempata por
                // recencia. Se manda la ruta vinculada como `destino`; el server
                // la valida y, si no es servible, cae a la autodetección.
                const destinoSandbox = carpetaVinculadaRef.current?.ruta || undefined;
                let r = await fetch("/api/sandbox/start", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(destinoSandbox ? { destino: destinoSandbox } : {}),
                });
                let d: any = await r.json().catch(() => ({}));
                if (d?.requiereConfirmacion) {
                  r = await fetch("/api/sandbox/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirmar: "recursion", ...(destinoSandbox ? { destino: destinoSandbox } : {}) }),
                  });
                  d = await r.json().catch(() => ({}));
                }
              } catch { /* el panel del editor muestra el estado real del sandbox */ }
              // Refresca el previsualizador aunque el sandbox ya estuviera vivo.
              window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
            })();
            return;
          }
          // v1.70.6 — EL MOTOR AVISA QUÉ IMÁGENES SON REALES: las adjuntas que
          // materializó en el proyecto viajan por este evento; con sus rutas, la
          // aduana de sync puede reencauzar los <img> que el modelo soñó.
          if (event.type === "imagenes-subidas") {
            const rutas: string[] = Array.isArray(event.paths) ? event.paths : [];
            if (rutas.length > 0) {
              imagenesTurnoRef.current = Array.from(new Set([...imagenesTurnoRef.current, ...rutas]));
              setTerminalLogs((l) => [
                ...l,
                `[${new Date().toLocaleTimeString()}] 🖼️ ${rutas.length} imagen(es) reales en el proyecto: ${rutas.join(", ")}. Los <img> con rutas soñadas se reescriben al sincronizar.`,
              ]);
              void refrescarImagenesProyecto();
            }
            return;
          }
          if (event.type === "action") {
            setActionLog((prev) => conTope(prev, { ...event.action, ts: Date.now() }, TOPE_ACCIONES));
            if (!pasoVivoAvisado) {
              pasoVivoAvisado = true;
              // UNA llamada por turno: el panel recarga contra la API (la
              // fuente de verdad sigue siendo /api/brain/plans, no el evento).
              window.dispatchEvent(new CustomEvent("cerebronico:plan", { detail: { vivo: true } }));
            }
            return;
          }
          // v1.16.3 — Paso 3 del plan de pantalla: el stream AVISA con el evento
          // nombrado `cerebronico:plan` (payload informativo). Quien escucha
          // recarga contra la API del motor; el payload no es fuente de verdad.
          if (event.type === "plan") {
            window.dispatchEvent(new CustomEvent("cerebronico:plan", { detail: { tareas: event.tasks } }));
            // v1.97.4 · el plan nace en SEGUNDO PLANO: la barra de Tareas se abre
            // sola al escuchar este evento (PlanificationPanel). La pestaña que el
            // turno traía al frente ya no existe: el modelo no secuestra el frente.
            // (Desde v1.69.0 este evento también llega de la nube: Z.ai, Groq,
            // OpenRouter… escriben su plan en la misma hoja.)
          }
          setAgentTasks((prev) => {
            if (event.type === "plan") {
              return event.tasks.map((t) => ({ ...t }));
            }
            return prev.map((t) =>
              t.id === event.taskId ? { ...t, status: event.status } : t
            );
          });
        },
        onDone: (finalText, meta) => {
          setIsStreaming(false);
          setCurrentStreamingText("");

          const assistantMsg: ChatMessage = {
            id: "msg-" + Date.now(),
            role: "assistant",
            content: finalText,
            timestamp: Date.now(),
            modelUsed: meta.model,
          };
          const nextHistory = [...updatedHistory, assistantMsg];
          // v1.0.20 · EL AVISO DE VENTANA SALE DEL DATO (prompt_eval_count real).
          // Antes, el 400 «17929 > 8192» y el «cayó demasiado tiempo y se cortó»
          // terminaban en el mismo consejo genérico; ahora el turno trae el
          // veredicto del motor y se escribe en el registro, con su severidad.
          try {
            const av = (meta as any)?.avisoVentana as { nivel?: string; ocupacion?: number | null; texto?: string } | null;
            if (av && av.texto) {
              const icono = av.nivel === "desborda" ? "⛔" : "🪟";
              setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${icono} ${av.texto}`]);
            }
          } catch { /* un aviso nunca puede romper el cierre del turno */ }
          // v2.0 — Canal directo del editor: la respuesta no se publica en el chat
          // central; se marca en el estado del editor, que es quien la pidió.
          if (desdeElEditor) {
            // v2.1 — aquí decía `phase: "applied"`, que NO existe en el tipo
            // (`idle | sending | streaming | applying | done | error`). Como las
            // etiquetas y los colores son un Record sobre esa unión, el editor
            // pintaba una etiqueta vacía y una clase CSS «undefined». Y como el
            // refresco del preview se dispara sólo con «done»
            // (DedicatedWebEditorView.tsx:211), tampoco refrescaba. La fase
            // correcta es «done»: el rótulo es literalmente «Aplicado».
            setWebEditorStatus({
              phase: "done",
              message: "Orden aplicada por el canal directo del editor. El preview se refresca al llegar los archivos al sandbox.",
            });
            // ============================================================
            // v2.1 — 🐞 "no ingresa texto para probar la edición web, el chat
            // central no se ha movido".
            // ------------------------------------------------------------
            // El canal directo (v2.0) hizo lo correcto: la orden del editor ya no
            // pasa por el chat central. Pero eso dejó al usuario SIN VER NADA:
            // la respuesta se quedaba en una variable y no se mostraba en ningún
            // sitio, así que parecía que el editor no hacía nada.
            // Ahora la respuesta del motor se escribe también en el registro que
            // el editor SÍ muestra ("Actividad del agente").
            // ============================================================
            const respuesta = String(finalText || "").trim();
            setTerminalLogs((l) => [
              ...l,
              respuesta
                ? `[${new Date().toLocaleTimeString()}] ✎ Respuesta del motor (canal directo del editor): ${respuesta.slice(0, 600)}${respuesta.length > 600 ? " …" : ""}`
                : "[editor] El motor terminó sin devolver texto. Revisa el modelo elegido o el log del sandbox.",
            ]);
          }
    // ORDEN VISIBLE v1: la respuesta SIEMPRE se publica en el chat central;
    // el editor recibe además su estado y su registro propios.
    setMessages(nextHistory);

    // v1.77.0 · EL RELEVO (Mario 26/10): si el modelo cerró el turno SIN
    // contestar, el mismo prompt se re-pregunta solo al siguiente cloud de
    // ⭐ Favoritos. El criterio es puro (relevoFavoritos.decisionRelevoFavoritos);
    // acá solo el gatillo.
    // v1.80.0 · FASE 1 «EL RELEVO POR DISEÑO» — tres cambios, todos medidos:
    //   1) la puerta es la capacidad `auto_relay` del panel (la vieja clave de
    //      localStorage sigue respetándose como preferencia personal);
    //   2) la cascada tiene TOPE 2 y, al agotarse, emite INFORME HONESTO con la
    //      traza de a quién se marcó y con qué cayó (antes: silencio elegante);
    //   3) cada relevo deja telemetría de sesión (cuántos, a quién, éxito/fallo),
    //      que es la evidencia de que la máquina se cura sola.
    try {
      const mem = relevoTurnoRef.current;
      if (mem && mem.activado && !desdeElEditor) {
        const horaRel = () => new Date().toLocaleTimeString();
        const dec = decisionRelevoFavoritos(
          { activado: mem.activado, relevosEsteTurno: mem.relevosEsteTurno, probados: mem.probados, intentos: mem.intentos },
          finalText,
          (favoriteModels || [])
            .filter((fm) => (fm as any).enabled !== false)
            .map((fm) => ({ provider: fm.provider, modelId: fm.modelId, name: fm.name })),
          String(meta?.model || provider)
        );
        if (dec.accion === "relevar") {
          // El que acaba de cerrar sin contestar entra en la traza antes de llamar al siguiente.
          mem.intentos = [...(mem.intentos || []), { provider: String(meta?.provider || provider), modelId: String(meta?.model || provider), motivo: "cerró el turno sin respuesta" }];
          mem.relevosEsteTurno += 1;
          mem.probados.push(dec.destino.modelId);
          relevoContinuacionRef.current = { relevosEsteTurno: mem.relevosEsteTurno, probados: [...mem.probados], intentos: [...(mem.intentos || [])], texto: mem.texto, adjuntos: mem.adjuntos };
          relevoSesionRef.current = registrarRelevo(relevoSesionRef.current, {
            momento: horaRel(),
            desde: mem.intentos[mem.intentos.length - 1].modelId,
            desdeProvider: mem.intentos[mem.intentos.length - 1].provider,
            a: dec.destino.modelId,
            aProvider: dec.destino.provider,
            motivo: "turno-vacio",
            nota: "mismo prompt re-preguntado",
          });
          setTerminalLogs((l) => [...l, `[${horaRel()}] ${dec.aviso}`, `[${horaRel()}] ${lineaTelemetria(relevoSesionRef.current)}`]);
          // Un solo camino: cambiar motor/modelo y re-entrar por el MISMO
          // sender con el MISMO texto (así el relevo hereda RAG, lecciones,
          // canal directo y vallas — no es un chat paralelo de segunda clase).
          setCurrentModel(dec.destino.modelId);
          setProvider(dec.destino.provider as ModelProvider);
          const _rlTexto = mem.texto;
          const _rlAdj = mem.adjuntos;
          setTimeout(() => {
            try { handleSendMessageWithRAGRef.current(_rlTexto, _rlAdj); } catch { /* el relevo no puede romper el chat */ }
          }, 250);
        } else if (dec.accion === "informar") {
          // Tope alcanzado: el usuario recibe la traza COMPLETA, no un error seco.
          relevoSesionRef.current = cerrarRelevo(relevoSesionRef.current, "fallo", dec.informe.split("\n")[0]);
          const informeMsg: ChatMessage = {
            id: "msg-relevo-" + Date.now(),
            role: "assistant",
            content: `⊕⊕ ${dec.informe}`,
            timestamp: Date.now(),
            status: "done",
          };
          setMessages((h) => [...h, { ...informeMsg, id: "msg-relevo-" + Date.now() }]);
          setTerminalLogs((l) => [...l, `[${horaRel()}] ${dec.informe.replace(/\n/g, " · ")}`, `[${horaRel()}] ${lineaTelemetria(relevoSesionRef.current)}`]);
        } else if (relevoSesionRef.current.some((r) => r.resultado === "pendiente")) {
          // El turno SÍ entregó: el relevo pendiente se cierra como éxito.
          relevoSesionRef.current = cerrarRelevo(relevoSesionRef.current, "exito");
          const resRel = resumenRelevo(relevoSesionRef.current);
          setTerminalLogs((l) => [...l, `[${horaRel()}] ✅ El relevo sirvió: ${resRel.modelos.slice(-1)[0]} respondió. ${lineaTelemetria(relevoSesionRef.current)}`]);
        }
      }
    } catch { /* el relevo es un extra: jamás interrumpe la entrega */ }

          // Extract code blocks from assistant response and update files
          const codeBlocks = extractCodeBlocksFromMessage(finalText);
          // v1.70.6 — aduana de imágenes también en la ENTRADA: el bloque que el
          // modelo acaba de dictar se corrige antes de tocar el editor (y el
          // sync posterior lo encuentra ya limpio).
          const repBloques = repararReferenciasDeImagen(codeBlocks as unknown as Array<{ path: string; content: string }>);
          if (repBloques.length > 0) {
            setTerminalLogs((l) => [
              ...l,
              `[${new Date().toLocaleTimeString()}] 🖼️ ${repBloques.length} <img> sin archivo real reencaminado(s) a la imagen subida (${repBloques
                .slice(0, 3)
                .map((r) => `${r.de} → ${r.a}`)
                .join(" · ")}).`,
            ]);
          }
          if (codeBlocks.length > 0) {
            setWorkspaceFiles((prev) => {
              const { updatedFiles, createdCount, updatedCount } = mergeExtractedFiles(
                prev,
                codeBlocks
              );
              setTerminalLogs((l) => [
                ...l,
                `[${new Date().toLocaleTimeString()}] Archivos sincronizados: +${createdCount} creados, ~${updatedCount} actualizados.`,
              ]);
              // 🔧 AUTO-SYNC AL DISCO: cuando la IA genera código, escribirlo
              // inmediatamente al sandbox (.proyectos/) para que el preview
              // del sandbox lo refleje. Sin esto, el código queda solo en
              // memoria de React y el sandbox sigue mostrando la web vieja.
              setTimeout(() => {
                syncToDisk(false).then((written) => {
                  if (written > 0) {
                    setTerminalLogs((l) => [
                      ...l,
                      `[${new Date().toLocaleTimeString()}] 🔄 Auto-sync: ${written} archivo(s) escritos al sandbox para preview en vivo.`,
                    ]);
                  }
                  // v1.60.20 — RAÍZ del bug «dos contenidos a la vez» (editor con lo
                  // nuevo, :3500 con lo viejo): el refresco del iframe NO puede
                  // depender de que CAMBIARA el disco. Cuando el modelo regenera
                  // index.html byte-a-byte IGUAL, el Quirófano lo rechaza como
                  // «REESCRITURA IDÉNTICA» y `written` queda en 0 — pero el iframe
                  // puede seguir mostrando el render viejo (SW network-first +
                  // :3500 reiniciado). Desacoplamos: todo sync que TERMINA fuerza
                  // recarga + cache-bust, así editor y sandbox convergen siempre,
                  // haya cambiado el disco o no. El conteo de escritos sigue siendo
                  // honesto (solo se loguea cuando written>0).
                  window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
                });
              }, 200);
              return updatedFiles;
            });
          }

          // v2.2 — ORDENES DEL CHAT: conversiones de formato y aperturas.
          // Va DESPUÉS de los bloques de código, para que un mensaje que haga las
          // dos cosas funcione igual. No se espera: el chat queda libre.
          void aplicarOrdenesDelChat(finalText);

          // Automejora activa en segundo plano
          try {
            const learned = autoLearnFromInteraction(text, finalText);
            if (learned) {
              setTerminalLogs((l) => [
                ...l,
                `[${new Date().toLocaleTimeString()}] 🧠 Automejora: Se aprendió y consolidó en memoria "${learned.term}".`,
              ]);
            }
          } catch {}

          // Check if there are queued messages to process next
          // v1.0.20 · una sola puerta (ver `desencolarSiguiente`): conserva la
          // marca de «lanzado» y le pide al modelo que se junte con lo que este
          // turno acaba de escribir, en vez de rehacerlo.
          if (desencolarSiguiente(nextHistory)) {
            /* desencolado por la puerta única */
          } else {
            // v2.3.8 · EL "SEGUÍ" AUTOMÁTICO DEJA DE SER MÍO. Cerrado el turno y vacía
            // la cola del usuario, se le pregunta al server si la hoja de ruta todavía
            // tiene trabajo. El navegador no decide ni adivina: reporta el cierre y
            // obedece. Apagado (el default, porque quema crédito del modelo) la
            // respuesta es "callar" y no pasa nada; si dijo "llamar", el mensaje entra
            // por la cola VISIBLE del chat, así que se ve y se puede cancelar. Y si el
            // server no responde, el turno terminó nomas: un lazo que tumba el chat es
            // peor que no tener lazo.
            const ultimo = [...(nextHistory as any[])].reverse().find((m: any) => m?.role === "assistant");
            void fetch("/api/autoLlamado/cierre", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                conversacion: "global",
                conclusion: String((ultimo as any)?.content || ""),
                turnoFallo: false,
              }),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((d: any) => {
                // v1.0.2 · callar TAMBIEN se explica (era el «que paso con el
                // autollamado?» sin respuesta: apagado, agotado y sin-tareas se
                // veian identicos). El server ya trae el motivo en espanol.
                if (!d) {
                  setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ↻ El lazo no respondio: el turno termino nada mas (el servidor de /api/autoLlamado no contesto).`]);
                  return;
                }
                if (d.accion !== "llamar" || !d.mensaje) {
                  if (d.motivo) {
                    setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ↻ Autollamado: ${String(d.motivo).slice(0, 180)}${d.llamados !== undefined ? ` (llamados: ${d.llamados})` : ""}`]);
                  }
                  return;
                }
                const texto = String(d.mensaje);
                setMessageQueue((q) => [...q, { text: texto, attachments: [] } as any]);
                setTerminalLogs((l) => [
                  ...l,
                  `[${new Date().toLocaleTimeString()}] ↻ La hoja de ruta sigue sola (${d.restantes} restantes): ${texto.slice(0, 80)}`,
                ]);
                setTimeout(() => executeSendMessage(texto, [], nextHistory), 400);
              })
              .catch(() => {});
          }

          // Hook para el bucle autónomo de compilación
          if (afterStreamRef.current) {
            const cb = afterStreamRef.current;
            afterStreamRef.current = null;
            setTimeout(cb, 300);
          }
        },

        onError: (errMsg) => {
          setIsStreaming(false);
          setCurrentStreamingText("");
          // v2.6.1 — «ingresa texto pero no hizo nada»: si la orden venía del
          // Editor web, el fallo dejaba la fase en «sending» para siempre: busy
          // true, botón bloqueado y toda orden posterior descartada en silencio.
          // El error ahora libera el canal CON motivo legible en el propio editor.
          if (webEditorOrderRef.current) {
            webEditorOrderRef.current = false;
            setWebEditorStatus({
              phase: "error",
              message: "El motor no respondió: " + String(errMsg).slice(0, 140) + " — reintenta, o manda la orden desde el Chat para leer el error completo.",
            });
          }
          // ══════════════════════════════════════════════════════════════
          // v1.75.0 · MARCADOR AUTOMÁTICO («auto-discado») — pedido de Mario
          // con captura del glm-4.5-flash en cuarentena: «antes de cortar que
          // haya un relevo a un modelo de la lista de Favoritos, y que se
          // auto-llame CON EL MISMO PROMPT a otro modelo». El motor ya no se
          // queda preguntando «¿seguimos con Groq?»: MARCA. Solo ante fallos
          // de comunicación (red/cuota/cuarentena — nunca ante errores de
          // lógica), con cuarentena de hecho de 12 min por mudo y techo de 5
          // llamadas por ráfaga. Si nadie contesta, el error honesto de
          // siempre, ahora con la constancia de a quién se marcó.
          // ══════════════════════════════════════════════════════════════
          // ══════════════════════════════════════════════════════════════
          // v1.80.0 · FASE 1 punto 1: la capacidad `auto_relay` del panel gobierna
          // TAMBIÉN esta puerta. Antes el fallo solo activaba al marcador (v1.75)
          // y el relevo miraba nada más el turno vacío: dos puertas, una costumbre.
          // Hoy: si el usuario encendió el relevo, el fallo de comunicación releva
          // en cascada por ⭐ Favoritos (tope 2, mismo sender, informe al agotarse).
          // Si está apagado, el marcador hace lo de siempre: cero sorpresas.
          // ══════════════════════════════════════════════════════════════
          {
            const memErr = relevoTurnoRef.current;
            if (memErr && memErr.activado && esFalloDeComunicacion(String(errMsg))) {
              const decErr = decisionRelevoPorFallo(
                { activado: memErr.activado, relevosEsteTurno: memErr.relevosEsteTurno, probados: memErr.probados, intentos: memErr.intentos },
                String(errMsg),
                (favoriteModels || [])
                  .filter((fm) => (fm as any).enabled !== false)
                  .map((fm) => ({ provider: fm.provider, modelId: fm.modelId, name: fm.name }))
              );
              const horaErr = () => new Date().toLocaleTimeString();
              if (decErr.accion === "relevar") {
                memErr.intentos = [...(memErr.intentos || []), { provider: String(provider), modelId: String(currentModel), motivo: String(errMsg).slice(0, 120) }];
                memErr.relevosEsteTurno += 1;
                memErr.probados.push(decErr.destino.modelId);
                relevoContinuacionRef.current = { relevosEsteTurno: memErr.relevosEsteTurno, probados: [...memErr.probados], intentos: [...(memErr.intentos || [])], texto: memErr.texto, adjuntos: memErr.adjuntos };
                marcarComoNoContesto(currentModel);
                relevoSesionRef.current = registrarRelevo(relevoSesionRef.current, {
                  momento: horaErr(),
                  desde: String(currentModel),
                  desdeProvider: String(provider),
                  a: decErr.destino.modelId,
                  aProvider: decErr.destino.provider,
                  motivo: "fallo-comunicacion",
                  nota: String(errMsg).slice(0, 140),
                });
                setTerminalLogs((l) => [...l, `[${horaErr()}] ${decErr.aviso}`, `[${horaErr()}] ${lineaTelemetria(relevoSesionRef.current)}`]);
                setCurrentModel(decErr.destino.modelId);
                setProvider(decErr.destino.provider as ModelProvider);
                const _tx = memErr.texto;
                const _ad = memErr.adjuntos;
                window.setTimeout(() => {
                  try { handleSendMessageWithRAGRef.current(_tx, _ad); } catch { /* el relevo no rompe el chat */ }
                }, 400);
                return; // relevado: no se muestra el error todavía
              }
              if (decErr.accion === "informar") {
                relevoSesionRef.current = cerrarRelevo(relevoSesionRef.current, "fallo", decErr.informe.split("\n")[0]);
                setMessages((h) => [...h, {
                  id: "msg-relevo-informe-" + Date.now(),
                  role: "assistant" as const,
                  content: `⊕⊕ ${decErr.informe}`,
                  timestamp: Date.now(),
                  status: "done" as const,
                }]);
                setTerminalLogs((l) => [...l, `[${horaErr()}] ${decErr.informe.replace(/\n/g, " · ")}`, `[${horaErr()}] ${lineaTelemetria(relevoSesionRef.current)}`]);
              }
            }
          }
          if (esFalloDeComunicacion(String(errMsg))) {
            const tieneClavePorProvider: Record<string, boolean> = {
              gemini: !!(geminiApiKey || geminiServerReady), zai: !!zaiApiKey, openrouter: !!openrouterApiKey,
              openai: !!openaiApiKey, groq: !!groqApiKey, cerebras: !!cerebrasApiKey,
              together: !!togetherApiKey, mistral: !!mistralApiKey, deepseek: !!deepseekApiKey,
              fireworks: !!fireworksApiKey, custom: !!customServerUrl,
            };
            const favoritosMarcables = colaDeMarcado(favoriteModels as any[], tieneClavePorProvider);
            if (estadoMarcador().pendientes === 0) iniciarMarcado(favoritosMarcables, currentModel);
            marcarComoNoContesto(currentModel);
            const sig = siguienteMarcada();
            if (sig) {
              const quienFallo = currentModel;
              // v1.95.2 · se REDACTA antes de recortar: cortar por lo sano deja igual
              // los primeros 90 caracteres de una clave, que es justamente lo que un
              // error de proveedor suele traer rebotado.
              const constancia = `⚠ MARCADOR AUTOMÁTICO: «${quienFallo}» no contestó (${textoSeguro(errMsg).slice(0, 90)}). Marcando al favorito «${sig.modelo}» (${sig.provider}) — intento ${estadoMarcador().llamadas}/5, mismo mensaje.`;
              setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${constancia}`]);
              setProvider(sig.provider as any);
              setCurrentModel(sig.modelo);
              const historialParaMarcar = [...updatedHistory.slice(0, -1), {
                id: "msg-marca-" + Date.now(), role: "assistant" as const,
                content: `⊕⊕ ${constancia}`, timestamp: Date.now(), status: "done" as const,
              }];
              const textoAMarcar = String(updatedHistory[updatedHistory.length - 1]?.content || "");
              window.setTimeout(() => executeSendMessage(textoAMarcar, [], historialParaMarcar), 600);
              return; // NO se corta: hay línea marcada
            }
          }
          const errAssistantMsg: ChatMessage = {
            id: "msg-err-" + Date.now(),
            role: "assistant",
            // v1.95.2 · EL ERROR DEL PROVEEDOR ES TEXTO INCONTROLADO. OpenRouter rebota
            // la URL de su consola CON la clave del usuario dentro, y esta línea la
            // imprimía tal cual en el chat — de ahí pasó al export de la sesión que Mario
            // me pasó para que yo mismo leyera su clave. El consejo además se calcula
            // sobre el texto ya redactado, para que una credencial no entre tampoco a los
            // patrones de `consejoDeError`.
            content: `⚠️ Error de comunicación con ${currentModel}: ${textoSeguro(errMsg)}${(() => { const c = consejoDeError(textoSeguro(errMsg)); return c ? " " + c : ""; })()}`,
            timestamp: Date.now(),
            status: "error",
          };
          const nextHistory = [...updatedHistory, errAssistantMsg];
          setMessages(nextHistory);

          // If there are queued messages, continue processing
          // v1.0.20 · tras un error también se pasa por la puerta única: si el que
          // estaba al frente era el lanzado, mantiene su marca y su nota.
          desencolarSiguiente(nextHistory);

          // Detener el bucle autónomo si hubo un error de comunicación
          afterStreamRef.current = null;
          if (buildFixRef.current.active) {
            // v1.72.0 — antes esto apagaba el bucle SIN decir nada: el botón
            // volvía a su estado normal y «Compilar» ya no hacía nada visible,
            // que es justo lo que se reportó como «el botón se apaga en silencio».
            buildFixRef.current.active = false;
            setBuildFixUI((u) => ({ ...u, active: false }));
            setTerminalLogs((l) => [
              ...l,
              `[${new Date().toLocaleTimeString()}] ⛔ Bucle «compilar y corregir» DETENIDO por el fallo de comunicación (iba por la vuelta ${buildFixRef.current.iteration + 1}). El proyecto NO quedó corregido: pulsa Compilar cuando el modelo responda.`,
            ]);
          } else {
            buildFixRef.current.active = false;
          }
        },
      }
    );
  };

  const handleSendMessage = (text: string, attachments: AttachmentItem[]) => {
    if (isStreamingRef.current) {
      // Enqueue message
      const queuedItem: QueuedMessageItem = {
        id: "queue-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        text,
        attachments: [...attachments],
        timestamp: Date.now(),
      };
      setMessageQueue((prev) => [...prev, queuedItem]);
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 📥 Mensaje añadido a la cola (${messageQueueRef.current.length + 1} en espera).`,
      ]);
      return;
    }

    executeSendMessage(text, attachments, messagesRef.current);
  };

  // 🔧 Inyectar contexto RAG + EvolutionDB + system prompt SLM al SYSTEM INSTRUCTION
  // (NO como prefijo del prompt del usuario — eso hacía que apareciera visible en el chat).
  // Ahora se pasa como `extraSystemInstruction` a `executeSendMessage`, que lo combina
  // con el systemInstruction base (contextCache) y lo envía como instrucción de sistema
  // oculta al modelo.
  // ══════════════════════════════════════════════════════════════════════
  // v1.80.0 · EL TURNO ECLÉCTICO (cara del enjambre en el chat)
  // ──────────────────────────────────────────────────────────────────────
  // Cuando el modelo elegido es `cerebro/auto`, el mensaje del usuario se
  // publica igual que siempre y la respuesta es el INFORME del enjambre:
  // tabla de voces con su estado, acuerdo medido, coincidencias, divergencias
  // y el veredicto final de la tarea. Si el enjambre no tuvo voces, lo dice —
  // no se finge un consenso con una sola voz (regla de la casa: lo que no se
  // hizo, se nombra).
  // ══════════════════════════════════════════════════════════════════════
  const enviarTurnoAlEnjambre = async (text: string, attachments: AttachmentItem[]) => {
    const hora = () => new Date().toLocaleTimeString();
    const userMsg: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      attachments: [...(attachments || [])],
    };
    // v1.84.5 · ANTES de que este mensaje entre en la pila: la memoria que
    // verán las voces son los turnos que YA estaban (incluye las imágenes del
    // mensaje actual como adjuntos de datos, no como historia).
    const memoriaTurno = historialParaEnjambre(messagesRef.current);
    setMessages([...messagesRef.current, userMsg]);
    setIsStreaming(true);
    setCurrentStreamingText("🎭 Enjambre ecléctico consultando a sus voces…");
    setTerminalLogs((l) => [...l, `[${hora()}] 🎭 CEREBRO/AUTO — el mismo prompt sale a las voces cargadas (⭐ Favoritos + 🧩 Unificada), con ${memoriaTurno.length} mensaje(s) de memoria${(attachments || []).length ? ` y ${(attachments || []).length} archivo(s) del turno` : ""}.`]);
    const tieneClavePorProvider: Record<string, boolean> = {
      gemini: !!(geminiApiKey || geminiServerReady), zai: !!zaiApiKey, openrouter: !!openrouterApiKey,
      openai: !!openaiApiKey, groq: !!groqApiKey, cerebras: !!cerebrasApiKey,
      together: !!togetherApiKey, mistral: !!mistralApiKey, deepseek: !!deepseekApiKey,
      fireworks: !!fireworksApiKey, custom: !!customServerUrl,
    };
    const resultado = await consultarEnjambre({
      tarea: text,
      // v1.84.5 · memoria del turno e imágenes del mensaje actual.
      historial: memoriaTurno,
      adjuntos: imagenesParaEnjambre(attachments || []),
      favoritos: (favoriteModels || []).filter((fm) => (fm as any).enabled !== false),
      // v2.3.6 · ranura de voz: los favoritos marcados como «habla en el enjambre».
      vocesFijas: (favoriteModels || [])
        .filter((fm) => (fm as any).vozEclectica === true && (fm as any).enabled !== false)
        .map((fm: any) => ({ provider: fm.provider, modelId: fm.id, name: fm.name })),
      unificados: detectedCustomModels,
      tieneClave: tieneClavePorProvider,
      claves: {
        gemini: geminiApiKey, zai: zaiApiKey, openrouter: openrouterApiKey, openai: openaiApiKey,
        groq: groqApiKey, cerebras: cerebrasApiKey, together: togetherApiKey, mistral: mistralApiKey,
        deepseek: deepseekApiKey, fireworks: fireworksApiKey,
      },
      customUrl: customServerUrl,
      customKey: customApiKey,
      ollamaUrl,
      actual: { provider, model: currentModelRef.current },
    });
    const contenido = resultado.ok && resultado.informe
      ? resultado.informe
      : `⚠️ **cerebro/auto no pudo consensuar:** ${resultado.error || "motivo desconocido"}`;
    setMessages((h) => [...h, {
      id: "msg-eclectico-" + Date.now(),
      role: "assistant" as const,
      content: contenido,
      timestamp: Date.now(),
      status: "done" as const,
      modelUsed: MODELO_CEREBRO_AUTO,
    }]);
    setIsStreaming(false);
    setCurrentStreamingText("");
    setTerminalLogs((l) => [...l, `[${hora()}] ${resultado.ok
      ? `🎭 Veredicto ecléctico firmado: ${resultado.respondieron ?? "?"}/${(resultado.voces || []).length} voces contestaron, acuerdo ${Math.round((resultado.acuerdo || 0) * 100)} %.`
      : `🎭 El enjambre no llegó a un veredicto: ${String(resultado.error || "").slice(0, 140)}`}`]);
    // ═════════════════════════════════════════════════════════════════
    // v1.84.3 · LA COLA TAMBIÉN SE BAJA EN ESTE ANDÉN (queja de Mario con
    // captura, 27/10: «el mensaje de cola no salta luego que el modelo
    // termina el turno» — y el chip «1 en cola» ahí para siempre). El
    // desencolado vivía solo en las dos rutas normales del turno (streaming
    // y chat); cerebro/auto se desviaba ANTES de ese tramo en
    // `handleSendMessageWithRAG`, y lo encolado quedaba huérfano: el
    // comentario del v1.80.0 prometía que «la cola habla al enjambre por el
    // mismo camino»; el camino existía, la parada no. Sale por la BOCA ÚNICA
    // (`handleSendMessageWithRAGRef`) para que el siguiente turno vuelva a
    // pasar por todas las interceptaciones (injerto incluido), y con el
    // mismo log «⏳ Desencolando…» de las otras dos rutas — una verdad, una
    // frase. Se hace SIEMPRE que haya cola, hubiera o no veredicto: un
    // enjambre mudo tampoco es motivo para tragar mensajes.
    // ═════════════════════════════════════════════════════════════════
    // v1.0.20 · la misma puerta única que las otras dos rutas.
    desencolarSiguiente();
  };

  handleSendMessageWithRAGRef.current = async (text: string, attachments: AttachmentItem[]) => {
    const modelName = currentModelRef.current;
    const slmInfo = slmInfoRef.current;
    // ══════════════════════════════════════════════════════════════════
    // v1.80.0 · `cerebro/auto`: este turno NO habla a una máquina. El mismo
    // prompt sale en paralelo a las voces cargadas y vuelve evaluado, con
    // veredicto y acuerdo medido (respuesta ecléctica). Se intercepta ACÁ —
    // la boca única de los turnos — para que el relevo, la cola y el editor
    // web hablen al enjambre por el mismo camino que hablan a un modelo.
    // (Mario 27/10: «que enlace con esa función de respuesta ecléctica».)
    // ══════════════════════════════════════════════════════════════════
    if (esCerebroAuto(provider, modelName)) {
      void enviarTurnoAlEnjambre(text, attachments);
      return;
    }
    // v1.77.0 · el turno de usuario abre su propia memoria de relevo: el
    // modelo que arranca ya queda "probado" y el texto viaja por si hay que
    // re-preguntarlo tal cual. v1.80.0 · FASE 1: la memoria abre además con
    // `intentos` vacíos, PERO si este turno es la continuación de un relevo
    // (relevoContinuacionRef) HEREDA contador, probados y traza: el tope de 2
    // se mide sobre la ráfaga original, no sobre cada pata del relevo.
    const _rlHeredada = relevoContinuacionRef.current;
    relevoContinuacionRef.current = null;
    relevoTurnoRef.current = {
      activado: relevoPrefido(),
      relevosEsteTurno: _rlHeredada ? _rlHeredada.relevosEsteTurno : 0,
      probados: _rlHeredada ? _rlHeredada.probados : [modelName],
      texto: (_rlHeredada && _rlHeredada.texto) || text,
      adjuntos: (_rlHeredada && _rlHeredada.adjuntos) || attachments || [],
      intentos: (_rlHeredada && _rlHeredada.intentos) || [],
    };

    // 1. RAG: número de chunks recomendado según tipo de modelo (1 para nano, 2 para small, 4 default)
    const chunkCount = getRecommendedRagChunks(modelName);
    const ragContext = searchRelevantChunks(text, chunkCount);

    // 2. EvolutionDB: lecciones históricas (3 para SLMs, 5 para grandes)
    const evolutionLessons = getRecommendedEvolutionLessons(modelName);
    const evolutionContext = await buildEvolutionContextForPrompt(evolutionLessons);

    // 3. System prompt SLM (reglas anti-alucinación estrictas para modelos pequeños)
    const slmPrompt = buildSLMSystemPromptAddon(slmInfo);

    // 4. Componer el extraSystemInstruction (todo va al system prompt, no al texto del usuario)
    const extraParts: string[] = [];
    // v1.16.5 — «Instrucciones extra del sistema» (systemExtra) era un
    // regulador mudo: el panel lo guardaba y NADIE lo leía. Viaja ahora al
    // system prompt, el primero de todos: las reglas del usuario son el piso,
    // no el condimento. (El foco del campo ya fue arreglado hoisteando los
    // controles de ProConfigPanel — por eso antes «no dejaba ingresarle».)
    const reglasUsuario = reglasEfectivas(proSettings);
    if (reglasUsuario) extraParts.push("REGLAS DEL PROYECTO (puestas por el usuario en Configuración → IA / Modelos; cúmplelas en toda la conversación):\n" + reglasUsuario);
    // v1.16.6 — MODO DE PENSAMIENTO: la directriz del chip del chat (o del
    // mismo selector en el menú Pro) viaja en cada turno. «auto» añade cero
    // bytes: el comportamiento de siempre. Sin esta línea, executionMode
    // seguía siendo el regulador mudo que la suite pensamientoChat canta.
    const directrizPensamiento = directrizModo((proSettings as any)?.ai?.executionMode);
    if (directrizPensamiento) extraParts.push(directrizPensamiento);
    // v1.73.0 · CANAL DIRECTO — si hay carpeta/ZIP de proyecto vinculado, el
    // modelo recibe su ruta como RAÍZ DE TRABAJO oficial del turno. Con esto se
    // acaba el «no puedo acceder a esa carpeta» de la sesión 1792972925054: la
    // ruta ya está autorizada en puente-permitidos.json (raices_extra), así que
    // fs_list/fs_read/fs_write/pc_* operan ahí sin restricciones ni permisos.
    const canal = carpetaVinculadaRef.current;
    if (canal) {
      extraParts.push(
        `CARPETA DE TRABAJO VINCULADA (CANAL DIRECTO, activado por el usuario desde el chat):\n` +
        `- Raíz del proyecto actual: ${canal.ruta} (${canal.archivos} archivos${canal.truncado ? ", conteo parcial" : ""}; origen: ${canal.origen}).\n` +
        `- Esa ruta ya está en las raíces permitidas del puente :5000: LEE, ESCRIBE y EJECUTA ahí directamente con fs_list/fs_read/fs_write/fs_delete, pc_exec, terminal y las herramientas del sandbox. NO pidas autorización, NO copies los archivos al workspace y NO digas que no puedes acceder: el acceso está concedido.\n` +
        `- Trata esa carpeta como el centro del trabajo: ignora la raíz por defecto salvo que el usuario pida explícitamente otra cosa.\n` +
        (Array.isArray(canal.muestra) && canal.muestra.length > 0 ? `- Muestra de contenido (primeras rutas): ${canal.muestra.slice(0, 25).join(", ")}.\n` : "") +
        `- Si el usuario vincula otra carpeta o desvincula, esta indicación cambia en el siguiente turno.`,
      );
    }
    if (slmPrompt) extraParts.push(slmPrompt);
    if (ragContext) extraParts.push(ragContext);
    if (evolutionContext) extraParts.push(evolutionContext);
    const extraSystemInstruction = extraParts.length > 0 ? extraParts.join("\n\n") : undefined;

    // 5. El texto del usuario se envía LIMPIO (sin prefijo del PROTOCOLO SLM)
    executeSendMessage(text, attachments, messagesRef.current, extraSystemInstruction);
  };
  /**
   * v1.0.14 · LANZAR UN MENSAJE EN COLA YA — pedido de Mario (09/11): «agregar
   * un botón de lanzar al mensaje de cola, solo tiene editar y eliminar pero no
   * lanzar». Saca ESE mensaje de la cola y lo manda en el acto, sin esperar a que
   * termine la generación en curso. v1.0.15: si hay un turno en vuelo YA NO se
   * corta (Mario 09/11 reportó que lanzar cortaba la tarea viva); el mensaje
   * lanzado pasa al FRENTE de la cola y sale como el próximo en cuanto el turno
   * actual termina por su cuenta. Sin turno en vuelo, sale en el acto.
   */
  const handleLaunchQueuedMessage = (id: string) => {
    // v1.0.20 · EL BOTÓN NO ANDABA. Tres causas, las tres medidas en la captura
    // del 15/11 (mensaje en la cola, «Lanzar» pulsado, nada):
    //
    //   a) `messageQueueRef.current = messageQueue` se re-asigna en CADA render,
    //      así que lo que se leía entre dos actualizaciones podía ser una foto
    //      vieja: el mensaje se quitaba de la lista y no entraba al envío.
    //   b) con turno en vuelo se hacía `filter` y luego se re-insertaba al
    //      frente; si el mensaje YA estaba en la posición 0, el arreglo cambiaba
    //      de identidad pero no de orden → React podía no repintar y no había ni
    //      un aviso de que el gesto se había hecho.
    //   c) y lo de fondo: un mensaje enviado con el streamer vivo dispara
    //      `stream()` → `if (this.isProcessing) this.abort()`, que aborta el
    //      turno EN CURSO. O sea que «lanzar ahora» cortaba la tarea viva,
    //      exactamente lo que no queremos.
    //
    // La decisión se toma en un módulo puro (probado con tsx) y acá sólo se
    // aplica: NO hay abort, NO se pierde nada y se avisa la verdad.
    const plan = planDeLanzado(messageQueueRef.current, id, isStreamingRef.current, Date.now());
    if (plan.destino === "no-esta" || !plan.mensaje) {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚠️ Lanzar: ${plan.aviso}`]);
      return;
    }
    // Se escribe la cola Y el ref espejo en el mismo gesto: el desencolador lee
    // el ref, y esperar al re-render era la carrera que se comía el mensaje.
    setMessageQueue(plan.cola);
    messageQueueRef.current = plan.cola;
    setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ▶️ ${plan.aviso}`]);
    if (plan.saleYa) {
      setTimeout(() => {
        try { handleSendMessageWithRAGRef.current(plan.mensaje!.text, plan.mensaje!.attachments || []); } catch { /* el lanzado no puede romper el chat */ }
      }, 0);
    }
  };

  const handleSendMessageWithRAG = (text: string, attachments: AttachmentItem[]) =>
    handleSendMessageWithRAGRef.current(text, attachments);

  const handleRemoveQueuedMessage = (id: string) => {
    setMessageQueue((prev) => prev.filter((item) => item.id !== id));
  };

  /**
   * v1.0.14 · EDITAR UN MENSAJE EN COLA — pedido de Mario (09/11):
   * «quiero agregarle este sistema de editar el mensaje en cola».
   * La cola ya existía (Encolar / Vaciar / quitar); faltaba poder corregir
   * el texto de un mensaje que todavía NO se envió. El edit se guarda en el
   * MISMO objeto `QueuedMessageItem` de `messageQueue`, así que cuando el
   * desencolador lo tome (`nextItem.text` en el flujo de send) envía el texto
   * corregido. Si el texto queda vacío tras editar, se descarta el mensaje
   * (equivalente a quitarlo de la cola, sin ambigüedad).
   */
  const handleEditQueuedMessage = (id: string, texto: string) => {
    const nuevo = String(texto ?? "");
    setMessageQueue((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, text: nuevo } : item))
        // Si tras editar el texto quedó vacío Y no hay adjuntos, el mensaje ya
        // no vale nada: se descarta (equivalente a quitarlo de la cola).
        .filter((item) => item.id !== id || item.text.trim() !== "" || item.attachments.length > 0)
    );
  };

  const handleClearQueue = () => {
    setMessageQueue([]);
  };

  const handleStopStreaming = () => {
    streamerRef.current.abort();
    setIsStreaming(false);
  };

  // Regenerar la última respuesta: reenviar el último prompt del usuario
  const handleRegenerate = () => {
    if (isStreamingRef.current) return;
    const msgs = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUser = msgs[lastUserIdx];
    const historyBefore = msgs.slice(0, lastUserIdx);
    executeSendMessage(lastUser.content, lastUser.attachments || [], historyBefore);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🔁 Regenerando la última respuesta...`,
    ]);
  };

  // Limpiar conversación y cola, manteniendo el workspace
  const handleClearSession = () => {
    streamerRef.current.abort();
    setIsStreaming(false);
    setCurrentStreamingText("");
    setMessages([]);
    setMessageQueue([]);
    setActiveChatTitle("");
    try {
      localStorage.removeItem(LS_KEYS.MESSAGES);
    } catch {}
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🧹 Conversación limpiada. MEMORIA.md y skills.md se inyectarán en el próximo turno.`,
    ]);
  };

  // ============================================================
  // CARPETA DE CHATS GUARDADOS: nuevo / abrir / renombrar / borrar
  // (lógica pura en utils/chatStorage.ts)
  // ============================================================
  const deriveChatTitle = deriveChatTitlePure;

  // Guarda la conversación actual en la carpeta de chats (si tiene contenido)
  const archiveCurrentChat = (source: ChatMessage[], titleOverride?: string): SavedChat | null => {
    const chat = buildArchivedChat(source, titleOverride || activeChatTitle);
    if (!chat) return null;
    // v1.0.44 · si ese hilo YA está en la carpeta, se actualiza (no se duplica):
    // era la mitad del «se van acumulando».
    setSavedChats((prev) => archivarSinDuplicar(prev, source, titleOverride || activeChatTitle));
    return chat;
  };

  const stopStreamingQuietly = () => {
    if (isStreamingRef.current) {
      streamerRef.current.abort();
      setIsStreaming(false);
      setCurrentStreamingText("");
    }
  };

  // v1.70.6 · MESA LIMPIA — «NUEVO CHAT» TAMBIÉN LIMPIA EL TALLER.
  // La queja medida (25/10): «siempre queda algo atascado de otro proyecto»:
  // el editor y el sandbox (:3500) seguían mostrando los archivos de la tarea
  // anterior. Ahora, al abrir un chat nuevo: se resguarda la obra en disco
  // (.cerebro-db/rescate-obras/<fecha>/ — copia, nunca mueve), se vacía el
  // sandbox (clear-all con resguardar:true: conserva node_modules y el cerebro)
  // y el editor arranca vacío. Si el usuario prefiere el comportamiento viejo,
  // lo desactiva con la clave cn.nuevo.chat.limpia = "0".
  const limpiarSandboxParaNuevaTarea = async () => {
    try {
      if (loadString("cn.nuevo.chat.limpia") === "0") {
        setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 🧹 Limpieza de sandbox desactivada (cn.nuevo.chat.limpia=0): el proyecto anterior sigue en su sitio.`]);
        return;
      }
    } catch {}
    try { await fetch("/api/sandbox/stop", { method: "POST" }); } catch { /* si no había sandbox, mejor */ }
    try {
      const r = await fetch("/api/fs/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resguardar: true }),
      });
      const d: any = await r.json().catch(() => ({}));
      setTerminalLogs((l) => [
        ...l,
        d?.ok
          ? `[${new Date().toLocaleTimeString()}] 🧹 Mesa limpia: ${d.deleted ?? 0} archivo(s) retirados del sandbox${d.resguardo?.dir ? `, obra resguardada en ${d.resguardo.dir}` : ""}. node_modules y memoria intactos.`
          : `[${new Date().toLocaleTimeString()}] ⚠ No se pudo limpiar el sandbox para el chat nuevo: ${d?.error || "sin respuesta"}. El proyecto anterior puede seguir visible.`,
      ]);
    } catch (e: any) {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚠ Limpieza de sandbox falló: ${e?.message || e}`]);
    }
    setWorkspaceFiles([]);
    setActiveFileId(null);
    imagenesTurnoRef.current = [];
    imagenesProyectoRef.current = [];
    window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
  };

  // Nuevo chat: archiva el actual (si tiene mensajes) y arranca limpio
  const handleNewChat = () => {
    stopStreamingQuietly();
    const current = messagesRef.current;
    const archived = archiveCurrentChat(current);
    setMessages([]);
    setMessageQueue([]);
    setActiveChatTitle("");
    try {
      saveString(LS_KEYS.MESSAGES, "[]");
    } catch {}
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 💬 Nuevo chat iniciado.${archived ? ` El anterior quedó guardado como "${archived.title}".` : ""}`,
    ]);
    // v1.70.6 — mesa limpia: nada del proyecto anterior puede heredar el chat nuevo.
    void limpiarSandboxParaNuevaTarea();
  };
  // El atajo Ctrl+Alt+N llama al último «nuevo chat» vía este ref siempre vivo.
  handleNewChatRef.current = handleNewChat;

  // Abrir un chat guardado: intercambia el actual por el elegido
  const handleOpenChat = (id: string) => {
    const chat = savedChats.find((c) => c.id === id);
    if (!chat) return;
    stopStreamingQuietly();
    const current = messagesRef.current;
    // v1.0.44 · abrir un chat guardaba OTRA copia del hilo actual con id nuevo
    // (una más en cada apertura). `archivarSinDuplicar` reusa el chat si su
    // contenido ya está, y respeta el que se está abriendo.
    setSavedChats((prev) => {
      const rest = prev.filter((c) => c.id !== id);
      const archivado = archivarSinDuplicar(rest, current, activeChatTitle);
      const elegido = archivado.find((c) => c.id === id);
      return elegido ? archivado : rest;
    });
    setMessages(chat.messages);
    setActiveChatTitle(chat.title);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 📂 Chat "${chat.title}" abierto (${chat.messages.length} mensajes).`,
    ]);
  };

  const handleDeleteChat = (id: string) => {
    const target = savedChats.find((c) => c.id === id);
    setSavedChats((prev) => prev.filter((c) => c.id !== id));
    // v1.0.44 · la lápida es lo que hace que el borrado sobreviva al arranque,
    // al reinicio de la IDE y a instalar una versión nueva.
    const at = Date.now();
    setChatsEliminados((prev) => fusionarEliminaciones(prev, [{ id, at }]));
    if (target) {
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] 🗑️ Chat "${target.title}" eliminado de la carpeta.`,
      ]);
    }
  };

  const handleRenameChat = (id: string, title: string) => {
    const clean = title.trim().slice(0, 80);
    if (!clean) return;
    setSavedChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
  };

  const handleRenameActiveChat = (title: string) => {
    setActiveChatTitle(title.trim().slice(0, 80));
  };

  // Exportar sesión completa a un archivo JSON
  const handleExportSession = () => {
    const payload = {
      app: "CerebroNico-IDE-v1",
      version: 1,
      // v1.95.2 · La sesión de Mario decía `version: 1` y nada más: al pedirme que
      // corroborara «los funcionamientos» no había forma de saber desde qué versión pasó
      // cada cosa (solo lo sabía porque él lo escribió en el mensaje). La versión real de
      // la IDE va ahora en el propio archivo.
      appVersion: IDE_BRAND.SEMVER,
      exportedAt: new Date().toISOString(),
      messages,
      workspaceFiles,
      currentModel,
      provider,
      temperature,
      responseLanguage,
      // Honestidad de inventario: este export guarda `id, role, content, timestamp,
      // status`. NO registra qué modelo produjo cada respuesta ni las llamadas a
      // herramientas, así que con este archivo no se puede auditar una tarea MCP. Se
      // declara acá en vez de dejar que el lector lo descubra a golpes.
      registro: { modeloporMensaje: false, llamadasAHerramientas: false },
    };
    // v1.95.2 · DEFENSA EN PROFUNDIDAD. El chat ya sale redactado de `App.tsx:3440`,
    // pero el export es el archivo que la gente COMPARTE: si un mensaje llegó a guardarse
    // con una credencial (sesiones empezadas antes de este arreglo, o un texto pegado por
    // el propio usuario), el export no la repite. `redactarSecretos` es idempotente, así
    // que pasarla dos veces no cambia un texto ya limpio.
    const exportSeguro = redactarSecretos(JSON.stringify(payload, null, 2));
    if (exportSeguro.ocultas) {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 🧾 El export de la sesión ocultó ${exportSeguro.ocultas} credencial(es) encontrada(s) en el historial (${exportSeguro.tipos.join(", ")}).`]);
    }
    const blob = new Blob([exportSeguro.texto], { type: "application/json" });
    triggerFileDownload(blob, `cerebronico-ide-sesion-${Date.now()}.json`);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 📦 Sesión exportada a JSON (${messages.length} mensajes, ${workspaceFiles.length} archivos).`,
    ]);
  };

  // Importar sesión desde un archivo JSON
  const handleImportSession = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
          saveJSON(LS_KEYS.MESSAGES, data.messages);
        }
        if (Array.isArray(data.workspaceFiles)) {
          setWorkspaceFiles(data.workspaceFiles);
          saveJSON(LS_KEYS.WORKSPACE_FILES, data.workspaceFiles);
        }
        if (typeof data.currentModel === "string") {
          setCurrentModel(data.currentModel);
        }
        if (typeof data.temperature === "number") {
          setTemperature(data.temperature);
        }
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] 📥 Sesión importada correctamente.`,
        ]);
      } catch (err) {
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] ❌ Error importando sesión: ${(err as Error).message}`,
        ]);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadZip = async () => {
    try {
      const zipBlob = await generateProjectZip(workspaceFiles);
      triggerFileDownload(zipBlob, `cerebronico-ide-proyecto-${Date.now()}.zip`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Paquete ZIP exportado exitosamente.`,
      ]);
    } catch (err) {
      console.error("Error generando ZIP:", err);
    }
  };

  // Escribir los archivos del workspace en el sandbox (disco real del servidor)
  // ==========================================================================
  // v2.2 — ÓRDENES DEL CHAT: chat → CONVERSOR → EDITOR → PREVIEW
  // --------------------------------------------------------------------------
  // El camino del editor ya existía (bloques de código → mergeExtractedFiles →
  // syncToDisk → evento `cerebronico:autosync-done` que refresca el iframe).
  // Lo que faltaba era el CONVERSOR en medio: el modelo podía escribir archivos,
  // pero no pedir «convierte esto a YAML». Esto lo añade, y lo engancha al MISMO
  // camino en vez de montar uno paralelo.
  //
  // Todo lo que ocurre queda escrito en el registro: cada conversión, cada byte
  // de antes y después, y **cada pérdida declarada**. Un archivo que aparece en
  // el editor sin decir qué se perdió por el camino sería justo el fallo
  // silencioso que este proyecto no admite.
  // ==========================================================================
  async function aplicarOrdenesDelChat(texto: string): Promise<number> {
    const hora = () => new Date().toLocaleTimeString();
    const { ordenes, avisos } = extraerOrdenes(texto);
    for (const a of avisos) setTerminalLogs((l) => [...l, `[${hora()}] ⚠️ Orden ignorada: ${a}`]);
    if (ordenes.length === 0) return 0;

    const bloques: Array<{ language: string; filePath: string; content: string }> = [];
    let rutaAAbrir: string | null = null;
    let fallos = 0;
    let huboPlan = false;

    for (const o of ordenes) {
      if (o.tipo === "abrir") {
        rutaAAbrir = o.ruta;
        continue;
      }

      // ── IMAGEN: el IDE dibuja gratis y guarda el binario en el proyecto ──
      // El archivo NO entra en el workspace de texto (localStorage, tope 5 MB):
      // el servidor lo escribe directo en la raíz del proyecto. Aquí solo se
      // registra el resultado — con el modelo que respondió DE VERDAD y sus
      // advertencias, que es la parte que el usuario tiene que oír.
      if (o.tipo === "imagen") {
        let avisoImagen = false;
        try {
          const r = await fetch("/api/engine/imagen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: o.prompt,
              salida: o.salida,
              ancho: o.ancho,
              alto: o.alto,
              modelo: o.modelo,
              seed: o.seed,
            }),
          });
          const j = await r.json();
          if (!j?.ok) {
            setTerminalLogs((l) => [
              ...l,
              `[${hora()}] ✗ Imagen no generada: ${j?.error || "sin detalle"}`,
            ]);
            for (const f of j?.fallos || []) {
              setTerminalLogs((l) => [...l, `[${hora()}]    · ${f.proveedor}: ${f.motivo}`]);
            }
            fallos += 1;
            continue;
          }
          setTerminalLogs((l) => [
            ...l,
            `[${hora()}] 🖼️ Imagen: proveedor ${j.proveedor} · modelo REAL ${j.modeloUsado} · ${j.bytes} bytes · ${((j.ms || 0) / 1000).toFixed(1)} s` +
              (j.ruta ? ` · guardada en «${j.ruta}»` : j.url ? ` · ${j.url}` : ""),
          ]);
          for (const a of j?.advertencias || []) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · aviso: ${a}`]);
          }
          for (const f of j?.fallos || []) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · proveedor fallido/saltado: ${f.proveedor} → ${f.motivo}`]);
          }
          if (j.ruta) {
            avisoImagen = true;
          }
        } catch (e: any) {
          setTerminalLogs((l) => [...l, `[${hora()}] ✗ No se pudo generar la imagen: ${e?.message || e}`]);
          fallos += 1;
        }
        if (avisoImagen) {
          // La app del preview ya puede referirse a <img src="…/img/…">: se
          // remonta el iframe con el mismo mecanismo del conversor.
          window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
        }
        continue;
      }

      // ── PLAN: el chat crea un plan del cerebro y lo lanza ────────────────
      // El plan ya viene VALIDADO por el motor (chatOrders usa `validarPlan`),
      // así que aquí sólo queda enviarlo. Si el servidor lo rechazara igualmente,
      // se dice el motivo; no se da por bueno un plan que no arrancó.
      if (o.tipo === "plan") {
        try {
          const r = await fetch("/api/brain/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objetivo: o.objetivo,
              tareas: o.tareas,
              modelo: o.modelo,
              contexto: o.contexto,
              autoLanzar: o.autoLanzar,
              // v1.46.6 — Claves de nube + proveedor para que el PLAN corra en
              // Z.ai/Gemini (nube) y no en Ollama local (que congela la PC).
              claves: leerCredencialesNubePlan(),
              provider,
            }),
          });
          const j = await r.json();
          if (!j?.ok) {
            setTerminalLogs((l) => [...l, `[${hora()}] ✗ Plan rechazado por el motor: ${j?.error || "sin detalle"}`]);
            fallos += 1;
            continue;
          }
          setTerminalLogs((l) => [
            ...l,
            `[${hora()}] 🧠 Plan ${j.planId} creado (${o.tareas.length} tarea/s): «${o.objetivo}».`,
          ]);
          if (j.lanzado?.ok) {
            setTerminalLogs((l) => [...l, `[${hora()}]    lanzado en segundo plano. Se ve en la barra de Tareas (arriba a la derecha).`]);
          } else {
            setTerminalLogs((l) => [
              ...l,
              `[${hora()}]    NO se lanzó${j.lanzado?.motivo ? `: ${j.lanzado.motivo}` : ""}. Está en la barra de Tareas para revisarlo.`,
            ]);
          }
          huboPlan = true;
          // v1.97.4 · la barra de Tareas se abre sola por el evento: el frente
          // ya no se secuestra para mirar el plan (la pestaña quedó fuera).
          window.dispatchEvent(new CustomEvent("cerebronico:plan-creado"));
        } catch (e: any) {
          setTerminalLogs((l) => [...l, `[${hora()}] ✗ No se pudo crear el plan: ${e?.message || e}`]);
          fallos += 1;
        }
        continue;
      }

      // ── Reflejo v3.0 — 16 ACCIONES GENÉRICAS (analizar, explicar, resumir, …) ──
      // Aún no tienen ejecutores wired en el chat; el Reflejo las emite y aquí se
      // registra el intento en el log del terminal para que el usuario vea que
      // el motor las reconoció. Cuando se integre un ejecutor por acción, el
      // `console.log` se sustituye por un fetch a /api/engine/<accion>.
      if (o.tipo !== "convertir" && (o as any).datos && typeof (o as any).datos === "object") {
        const datos = (o as { tipo: string; datos: Record<string, string | undefined> }).datos;
        const resumen = Object.entries(datos)
          .filter(([, v]) => v && v.trim())
          .map(([k, v]) => `${k}=${v}`)
          .join(" · ");
        setTerminalLogs((l) => [
          ...l,
          `[${hora()}] 🧩 Reflejo v3.0 — orden «${o.tipo}» reconocida. Payload: ${resumen || "(vacío)"}. Aún sin ejecutor integrado; el modelo puede continuar el trabajo.`,
        ]);
        continue;
      }

      // El contenido sale del espacio de trabajo (lo que el usuario ve en el
      // editor), no del disco del sandbox: así se convierte lo que hay en pantalla.
      // (Reflejo v3.0 — antes este bloque se ejecutaba para cualquier orden
      // que no fuera abrir/imagen/plan. Ahora solo entra si es "convertir".)
      if (o.tipo === "convertir") {
        let contenido = o.contenido;
        if (o.archivo) {
          const f = workspaceFiles.find((w) => w.path === o.archivo || w.name === o.archivo);
          if (!f) {
            setTerminalLogs((l) => [
              ...l,
              `[${hora()}] ✗ Conversión ${o.desde}→${o.hacia}: no está «${o.archivo}» en el espacio de trabajo. Ábrelo o impórtalo primero.`,
            ]);
            fallos += 1;
            continue;
          }
          contenido = f.content;
        }

        try {
          const r = await fetch("/api/engine/convertir", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              formatoEntrada: o.desde,
              formatoSalida: o.hacia,
              contenido: contenido ?? "",
              opciones: o.opciones,
            }),
          });
          const j = await r.json();
          if (!j?.ok) {
            setTerminalLogs((l) => [...l, `[${hora()}] ✗ Conversión ${o.desde}→${o.hacia} fallida: ${j?.error || "sin detalle"}`]);
            fallos += 1;
            continue;
          }

          bloques.push({ language: o.hacia, filePath: o.salida, content: j.salida });
          setTerminalLogs((l) => [
            ...l,
            `[${hora()}] ✓ ${o.desde.toUpperCase()} → ${o.hacia.toUpperCase()}: «${o.salida}» (${j.informe.bytesEntrada} → ${j.informe.bytesSalida} bytes, ${j.informe.claves} clave/s).`,
          ]);
          // Las pérdidas se cuentan, una por una. No van a un tooltip: van al registro.
          for (const p of j.informe.perdidas) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · pérdida declarada — ${p.que}: ${p.detalle}`]);
          }
          for (const av of j.informe.avisos) {
            setTerminalLogs((l) => [...l, `[${hora()}]    · aviso: ${av}`]);
          }
        } catch (e: any) {
          setTerminalLogs((l) => [...l, `[${hora()}] ✗ No se pudo convertir ${o.desde}→${o.hacia}: ${e?.message || e}`]);
          fallos += 1;
        }
        continue;
      }

      // Si llegamos aquí con un tipo no reconocido, lo decimos: nunca silencios.
      setTerminalLogs((l) => [...l, `[${hora()}] ✗ Orden «${o.tipo}» sin dispatcher en App.tsx. Reporta este caso.`]);
    }

    // EDITOR: los archivos convertidos entran en el espacio de trabajo y el
    // último se abre, para que el usuario VEA el resultado sin buscarlo.
    if (bloques.length > 0) {
      // v1.70.6 — misma aduana de imágenes para los bloques que el motor dicta
      // al Editor por las órdenes del chat.
      repararReferenciasDeImagen(bloques as unknown as Array<{ path: string; content: string }>);
      // Se lee del espejo y se escribe con el actualizador PURO. Así el recuento
      // que se registra es el real y no se duplica ninguna línea.
      const { updatedFiles, createdCount, updatedCount } = mergeExtractedFiles(workspaceFilesRef.current, bloques);
      setWorkspaceFiles((prev) => mergeExtractedFiles(prev, bloques).updatedFiles);
      setTerminalLogs((l) => [
        ...l,
        `[${hora()}] Editor actualizado por órdenes del chat: +${createdCount} creado(s), ~${updatedCount} actualizado(s).`,
      ]);
      const ultimo = bloques[bloques.length - 1];
      const nuevo = updatedFiles.find((f) => f.path === ultimo.filePath);
      if (nuevo) setActiveFileId(nuevo.id);
    }

    if (rutaAAbrir) {
      const f = workspaceFiles.find((w) => w.path === rutaAAbrir || w.name === rutaAAbrir);
      if (f) setActiveFileId(f.id);
      else setTerminalLogs((l) => [...l, `[${hora()}] ⚠️ No existe «${rutaAAbrir}» para abrir en el editor.`]);
    }

    // PREVIEW: el mismo mecanismo que ya usa el chat — escribir al sandbox y
    // avisar. Sin esto, el archivo se vería en el editor y el preview seguiría
    // mostrando la versión vieja.
    if (bloques.length > 0) {
      try {
        const escritos = await syncToDisk(false);
        if (escritos > 0) {
          setTerminalLogs((l) => [...l, `[${hora()}] 🔄 ${escritos} archivo(s) al sandbox: el preview se refresca.`]);
        }
        // v1.60.20 — mismo desacople que el auto-sync del chat: el refresco del
        // iframe se dispara aunque `escritos === 0` (disco idéntico / reescritura
        // rechazada), para que el sandbox nunca quede anclado al render viejo
        // mientras el editor muestra lo nuevo.
        window.dispatchEvent(new CustomEvent("cerebronico:autosync-done"));
      } catch (e: any) {
        setTerminalLogs((l) => [...l, `[${hora()}] ✗ Los archivos están en el editor, pero no se pudieron llevar al sandbox: ${e?.message || e}`]);
      }
    }

    // v1.97.4 · la planificación ya no tiene pestaña central: terminada la obra,
    // la ENTREGA se ve en el chat (contrato «que el turno coincida con la tarea
    // y la entrega») y el evento refuerza la barra de Tareas, que refleja el
    // cierre. El motor nunca mueve el frente a su cuenta.
    if (huboPlan) {
      window.dispatchEvent(new CustomEvent("cerebronico:plan-creado"));
    }

    return bloques.length;
  }

  // ════════════════════════════════════════════════════════════════════════
  // v1.70.6 · ADUANA DE IMÁGENES + FOTOGRAFÍA DEL PROYECTO
  // ─────────────────────────────────────────────────────────────────────────
  // · imagenesTurnoRef   → rutas reales que el motor materializó ESTE turno
  //                        (evento SSE «imagenes-subidas»). Candidatas a todo.
  // · imagenesProyectoRef→ imágenes que ya existen en disco (árbol al montar y
  //                        tras cada subida). Candidatas solo por nombre-base.
  // repararReferenciasDeImagen MUTA el array de payload (copias frescas, nunca
  // el estado React) y devuelve cuántas referencias soñadas corrigió.
  // ════════════════════════════════════════════════════════════════════════
  const imagenesTurnoRef = useRef<string[]>([]);
  const imagenesProyectoRef = useRef<string[]>([]);

  const refrescarImagenesProyecto = useCallback(async () => {
    try {
      const r = await fetch("/api/fs/tree");
      if (!r.ok) return;
      const d: any = await r.json().catch(() => null);
      const files: string[] = Array.isArray(d?.files) ? d.files : [];
      imagenesProyectoRef.current = files.filter(
        (p) => RE_IMAGEN_RUTA.test(p) && !p.startsWith("node_modules/") && !p.startsWith(".git/")
      );
    } catch { /* sin sandbox a mano: no hay con qué reparar, y eso es honesto */ }
  }, []);

  useEffect(() => {
    void refrescarImagenesProyecto();
  }, [refrescarImagenesProyecto]);

  const repararReferenciasDeImagen = useCallback(
    (archivos: Array<{ path: string; content: string }>): Array<{ archivo: string; de: string; a: string }> => {
      const subidas = imagenesTurnoRef.current;
      const proyecto = imagenesProyectoRef.current;
      if (subidas.length === 0 && proyecto.length === 0) return [];
      const conocidas = Array.from(
        new Set([
          ...workspaceFilesRef.current.map((f) => f.path),
          ...proyecto,
          ...subidas,
        ].map((r) => r.replace(/^\.\//, "")))
      );
      const reparadas: Array<{ archivo: string; de: string; a: string }> = [];
      for (const f of archivos) {
        if (!/\.(html?|css|js|mjs|cjs|jsx|tsx|vue|svelte|md)$/i.test(f.path)) continue;
        if (!/src\s*=|url\(/i.test(f.content)) continue;
        const r = repararRutasDeImagen(f.content, f.path, conocidas, subidas, proyecto);
        if (r.reparadas.length > 0) {
          f.content = r.texto;
          for (const x of r.reparadas) reparadas.push({ archivo: f.path, de: x.de, a: x.a });
        }
      }
      return reparadas;
    },
    []
  );

  const syncToDisk = async (log = true): Promise<number> => {
    try {
      // ============================================================
      // v1.16.4 · CAMINO DE LOS ARCHIVOS — LA LISTA QUIRÚRGICA.
      // Del árbol del proyecto al sandbox NO va todo: cada ruta pasa por la
      // aduana y lo PROHIBIDO (la copia .proyectos recursively copiada,
      // node_modules, .git, secretos, logs) se queda fuera ANTES de salir por
      // la red. Espejo del peaje de entrada: mismo juez, sentido inverso.
      // Menos archivos cruzando = menos disco, menos sync, menos consumo.
      // ============================================================
      const listaQuirurgica = workspaceFiles.filter((f) => puedeIrEnElEmpaque(f.path));
      const vetados = workspaceFiles.length - listaQuirurgica.length;
      if (vetados > 0 && log) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🧭 Lista quirúrgica al sandbox: ${listaQuirurgica.length} archivo(s) cruzan; ${vetados} prohibido(s) se quedan fuera (aduana v8.0.6).`,
        ]);
      }
      // v1.70.6 — ADUANA DE IMÁGENES: ningún <img> roto pisa disco sin aviso.
      const payloadSync = listaQuirurgica.map((f) => ({ path: f.path, content: f.content }));
      const repSync = repararReferenciasDeImagen(payloadSync);
      if (repSync.length > 0 && log) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🖼️ Aduana de imágenes: ${repSync.length} referencia(s) inexistente(s) reescrita(s) a la imagen real del proyecto (${repSync
            .slice(0, 3)
            .map((r) => `${r.archivo}: ${r.de} → ${r.a}`)
            .join(" · ")}${repSync.length > 3 ? " …" : ""}).`,
        ]);
      }
      const res = await fetch("/api/fs/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: payloadSync,
        }),
      });
      const data = await res.json();
      const written = data.written ?? 0;

      // ============================================================
      // v2.1 — ¿EL WORKSPACE TRAE EL CÓDIGO DEL CLIENTE?
      // ------------------------------------------------------------
      // El sandbox solo puede servir lo que recibe. Si el workspace va
      // incompleto, el puerto responde, la pestaña muestra el TÍTULO… y TODOS los
      // módulos dan 404 en el navegador, sin una sola pista en esta interfaz.
      // Es exactamente el síntoma que quedó sin explicar: "solo carga el título".
      // (Reproducido en local: /src/main.tsx devuelve 404 tanto si el servidor no
      // monta Vite como si el archivo no está en disco. Este chequeo separa las
      // dos causas ANTES de arrancar nada, en vez de adivinar.)
      // ============================================================
      // ============================================================
      // v2.1 — 🐞 ESTE DIAGNÓSTICO NUNCA LLEGABA A EJECUTARSE.
      // ------------------------------------------------------------
      // Estaba dentro de `if (log)`, y el piloto automático del sandbox llama a
      // esta función con log=false (para no llenar la consola en cada cambio).
      // Es decir: la única ruta que de verdad arranca el sandbox era justo la que
      // se saltaba la comprobación. Al pedirle al usuario "mándame la línea de
      // 🔎 Estructura del workspace" no aparecía por ningún lado, y parecía que
      // el chequeo no existía.
      // Ahora la comprobación se hace SIEMPRE; lo que depende de `log` es solo si
      // la línea informativa se imprime. La ALARMA se imprime siempre: si falta
      // código del cliente, el diagnóstico es demasiado importante para callarlo.
      // ============================================================
      const hora = new Date().toLocaleTimeString();
      const rutas = workspaceFiles.map((f) => String(f.path).replace(/\\/g, "/"));
      const tieneIndex = rutas.some((p) => /(^|\/)index\.html$/i.test(p));
      const tieneMain = rutas.some((p) => /(^|\/)src\/main\.[jt]sx?$/i.test(p));
      const comps = rutas.filter((p) => /(^|\/)src\/components\/[^/]+\.(tsx?|jsx?)$/i.test(p)).length;
      const engine = rutas.filter((p) => /(^|\/)src\/engine\/[^/]+$/i.test(p)).length;
      if (log) {
        setTerminalLogs((l) => [
          ...l,
          `[${hora}] 🔎 Estructura del workspace: ${rutas.length} archivos · index.html ${tieneIndex ? "✓" : "FALTA"} · src/main.tsx ${tieneMain ? "✓" : "FALTA"} · src/components ${comps} · src/engine ${engine}`,
        ]);
      }
      if (!tieneIndex || !tieneMain || comps === 0) {
        setTerminalLogs((l) => [
          ...l,
          `[${hora}] ❌ Al workspace le falta el código del cliente (index.html ${tieneIndex ? "✓" : "FALTA"} · src/main.tsx ${tieneMain ? "✓" : "FALTA"} · src/components ${comps}). El preview quedará EN BLANCO con 404 en /src/* aunque el puerto 3500 responda. Reimporta el ZIP del proyecto: la importación se cortó. NO es un fallo del sandbox.`,
        ]);
      }

      if (log) {
        setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 💾 ${written} archivo(s) sincronizado(s) al sandbox.`]);
        // ============================================================
        // v2.1 — 🐞 El rechazo del guardián era INVISIBLE.
        // El log decía "38 archivo(s) escrito(s)" y el usuario no tenía forma de
        // saber qué pasó con los otros 2: parecía que el sistema "no escribe
        // todos los archivos". Ahora se dice cuáles y por qué.
        // ============================================================
        // v1.43.0 lote 2 — 🐞 CONTRATO: el servidor manda `rejectedFiles`
        // (ARRAY, con {path, issues}) y `rejected` (NÚMERO). El cliente le
        // a dejado colgado desde v2.1: leía `data.rejected`, que es un número,
        // con `Array.isArray(...)` → SIEMPRE false → `rec = []`, así que el
        // aviso «N archivo(s) con sintaxis dudosa» NO se mostraba NUNCA. Ese era
        // el «0 archivos escritos» MUDO con 2 archivos en el editor: el guard
        // los rechazaba y el usuario no veía ni uno ni el motivo. Ahora se lee
        // `rejectedFiles` (con respaldo a `rejected` por si fuera array).
        const rec: Array<{ path: string; issues?: string[] }> = Array.isArray(data.rejectedFiles)
          ? data.rejectedFiles
          : Array.isArray(data.rejected)
            ? data.rejected
            : [];
        if (rec.length > 0) {
          const detalle = rec
            .slice(0, 3)
            .map((r) => `${r.path} (${r.issues?.[0] || "sintaxis dudosa"})`)
            .join(" · ");
          setTerminalLogs((l) => [
            ...l,
            `[${new Date().toLocaleTimeString()}] ⚠️ ${rec.length} archivo(s) con sintaxis dudosa: ${detalle}${rec.length > 3 ? ` … +${rec.length - 3}` : ""}`,
          ]);
        }
      }
      // v1.43.0 lote 2 — EL «0 ARCHIVOS» JAMÁS ES MUDO. Si había archivos
      // candidatos pero no se escribió NINGUNO, se dice el motivo SIEMPRE
      // (también en auto-sync, log=false): el usuario reportaba «0 escritos»
      // con 2 archivos en el editor y sin una sola pista. Casi siempre: el
      // guard de sintaxis los rechazó, el Quirófano los bloqueó, o la aduana
      // los dejó fuera. Se nombran y se da el porqué.
      if (written === 0 && listaQuirurgica.length > 0) {
        const rec0: Array<{ path: string; issues?: string[] }> = Array.isArray(data.rejectedFiles)
          ? data.rejectedFiles
          : Array.isArray(data.rejected)
            ? data.rejected
            : [];
        const motivo = rec0.length > 0
          ? `${rec0.length} archivo(s) rechazado(s): ${rec0.slice(0, 3).map((r) => `${r.path} (${r.issues?.[0] || "sintaxis dudosa"})`).join(" · ")}${rec0.length > 3 ? ` … +${rec0.length - 3}` : ""}`
          : vetados > 0
            ? `los ${listaQuirurgica.length} candidato(s) no llegaron a escribirse y la aduana vetó ${vetados} más. Revisa el log del sandbox.`
            : "ninguno pasó el guard de sintaxis / el Quirófano. Revisa el log del sandbox para el motivo exacto.";
        setTerminalLogs((l) => [
          ...l,
          `[${new Date().toLocaleTimeString()}] ⚠️ 0 archivo(s) escrito(s) de ${listaQuirurgica.length} candidato(s): ${motivo}`,
        ]);
      }
      return written;
    } catch (err: any) {
      if (log) setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ❌ Error sincronizando: ${err.message}`]);
      return 0;
    }
  };

  const handleSyncToDisk = (): Promise<number> => {
    return syncToDisk(true);
  };

  // Sincronización silenciosa para el piloto automático del sandbox (sin logear cada cambio)
  const handleAutoSyncToSandbox = (): Promise<number> => {
    // TREGUA v1 — el piloto NO vuelca archivos mientras un chat (local o cloud)
    // está transmitiendo: sync y SSE comparten lazo. Pospone CON AVISO y el
    // piloto reintenta solo. El botón Sync manual nunca se pausa: pidió ahora.
    if (debePausarSync(isStreamingRef.current)) {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${avisoPausaSync()}`]);
      return Promise.resolve(0);
    } /*TREGUA*/
    return syncToDisk(false);
  };

  // Traer del sandbox al editor los archivos que el agente haya escrito en disco
  const pullFromDisk = async (log = true): Promise<number> => {
    try {
      const treeRes = await fetch("/api/fs/tree");
      const treeData = await treeRes.json();
      const filePaths: string[] = Array.isArray(treeData.files) ? treeData.files : [];
      const toPull = filePaths.filter(
        (p) =>
          !p.startsWith("node_modules/") &&
          !p.startsWith(".git/") &&
          !p.endsWith(".zip") &&
          // v1.70.6 — LOS BINARIOS NO SE PULLEAN: /api/fs/read es de texto; traer
          // un PNG como string y devolverlo en el sync lo corrompía (y llenaba el
          // editor de basura). Las imágenes viven en disco y el preview las sirve
          // directo: no necesitan entrar al workspace.
          !RE_IMAGEN_RUTA.test(p) &&
          !/\.(woff2?|ttf|otf|eot|mp[34]|wav|ogg|pdf|exe|dll|node)$/i.test(p)
      );
      const pulled: WorkspaceFile[] = [];
      for (const relPath of toPull) {
        try {
          const r = await fetch(`/api/fs/read?path=${encodeURIComponent(relPath)}`);
          if (!r.ok) continue;
          const d = await r.json();
          if (typeof d.content === "string") {
            pulled.push({
              id: "disk-" + relPath,
              name: relPath.split("/").pop() || relPath,
              path: relPath,
              content: d.content,
              language: detectLanguageFromPath(relPath).id,
              size: d.content.length,
              modified: false,
              // v1.70.6 — viene del sandbox, se llama como tal: sin esta marca
              // nacían los huérfanos arbol=None que sobrevivían a todo cambio.
              arbol: "sandbox",
            });
          }
        } catch {}
      }
      if (pulled.length > 0) {
        setWorkspaceFiles((prev) => {
          const map = new Map<string, WorkspaceFile>();
          prev.forEach((f) => map.set(f.path, f));
          pulled.forEach((f) => map.set(f.path, f));
          return Array.from(map.values());
        });
      }
      if (log) {
        setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 📥 ${pulled.length} archivo(s) traídos del sandbox al editor.`]);
      }
      return pulled.length;
    } catch (err: any) {
      if (log) setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ❌ Error trayendo archivos: ${err.message}`]);
      return 0;
    }
  };

  const serverRevisionRef = useRef("");
  useEffect(() => {
    if (!(window as any).__CN_SERVER_MODE__) return;
    let stopped = false, busy = false;
    const read = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const r = await fetch("/api/server/workspace");
        if (!r.ok) return;
        const d = await r.json();
        if (stopped || !Array.isArray(d.files) || d.revision === serverRevisionRef.current) return;
        serverRevisionRef.current = d.revision;
        if (d.files.length) setActiveFileId(id => id || "disk-" + d.files[0].path);
        window.dispatchEvent(new Event("cn:server-workspace"));
        setWorkspaceFiles(prev => {
          const presentes = new Set(d.files.map((f: any) => f.path));
          const map = new Map(prev.filter(f => !f.id.startsWith("disk-") || f.modified || presentes.has(f.path)).map(f => [f.path, f]));
          for (const f of d.files) {
            const old = map.get(f.path);
            if (old?.modified) continue;
            map.set(f.path, {id:old?.id || "disk-" + f.path, name:f.path.split("/").pop(), path:f.path, content:f.content, language:detectLanguageFromPath(f.path).id, size:f.size, modified:false, arbol:"sandbox"});
          }
          return Array.from(map.values());
        });
      } catch { /* el latido informa los fallos de conexión */ }
      finally { busy = false; }
    };
    void read(); const timer = window.setInterval(read, 2000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!(window as any).__CN_SERVER_MODE__) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/server/session", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({messages, currentModel, provider})}).then(r => {
        if (!r.ok) setTerminalLogs(l => [...l, "⚠ No se pudo guardar la sesión en el servidor."]);
      }).catch(() => setTerminalLogs(l => [...l, "⚠ Guardado de sesión pendiente: servidor inaccesible."]));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [messages, currentModel, provider]);

  const handlePullFromDisk = () => {
    pullFromDisk(true);
  };

  // Ejecutar el build en el sandbox
  const runBuild = async (installDeps: boolean) => {
    const command = installDeps
      ? "npm install --no-audit --no-fund && npm run build"
      : "npm run build";
    const res = await fetch("/api/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeoutMs: 180000 }),
    });
    return await res.json();
  };

  // Bucle autónomo: compila -> corrige -> recompila (hasta buildFixRef.max iteraciones)
  const runBuildFixIteration = async () => {
    const st = buildFixRef.current;
    if (!st.active) return;

    if (st.iteration === 0) {
      await syncToDisk(false);
    } else {
      // Traer los archivos que el agente escribió con herramientas y volver a sincronizar
      await pullFromDisk(false);
      await syncToDisk(false);
    }

    setBuildFixUI({ active: true, iteration: st.iteration, max: st.max });
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🔨 Compilando (iteración ${st.iteration + 1}/${st.max})...`,
    ]);

    let data: any;
    try {
      data = await runBuild(st.iteration === 0);
    } catch (err: any) {
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ❌ Error compilando: ${err.message}`]);
      buildFixRef.current.active = false;
      return;
    }

    if (data && data.exitCode === 0) {
      buildFixRef.current.active = false;
      await pullFromDisk(false);
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ✅ Compilación exitosa tras ${st.iteration + 1} iteración(es).`]);
      return;
    }

    st.iteration++;
    if (st.iteration >= st.max) {
      buildFixRef.current.active = false;
      setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚠️ Se alcanzó el máximo de ${st.max} iteraciones. Revisa los errores en la terminal.`]);
      return;
    }

    const errSummary = `${data?.stderr || ""}\n${data?.stdout || ""}`.slice(-4000);
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🔁 Reenviando errores al modelo (iteración ${st.iteration + 1})...`,
    ]);
    afterStreamRef.current = runBuildFixIteration;
    handleSendMessage(
      `El proyecto falló al compilar. Usa las herramientas disponibles (write_file / run_command) para corregir los archivos y no te limites a explicar: actúa.\n\nERRORES DE COMPILACIÓN:\n${errSummary}`,
      []
    );
  };

  // Compilar y corregir (inicia el bucle autónomo)
  const handleBuildAndFix = () => {
    // v1.72.0 — GUARDA ANTIRREINTENTO. Cada vuelta del bucle termina llamando a
    // handleSendMessage y el botón seguía activo mientras el motor respondía: dos
    // clics montaban DOS bucles sobre el mismo ref. Se mezclaban las iteraciones,
    // se duplicaban los reenvíos de errores y el tope de 5 dejaba de ser 5.
    // Un segundo clic ahora avisa en lugar de sumar otro bucle.
    if (buildFixRef.current.active) {
      setTerminalLogs((l) => [
        ...l,
        `[${new Date().toLocaleTimeString()}] ⏳ Ya hay un bucle «compilar y corregir» en marcha (vuelta ${buildFixRef.current.iteration + 1}/${buildFixRef.current.max}). Espera a que termine o detén el turno.`,
      ]);
      return;
    }
    buildFixRef.current = { active: true, iteration: 0, max: 5 };
    setBuildFixUI({ active: true, iteration: 0, max: 5 });
    runBuildFixIteration();
  };

  // Adjuntar archivos al workspace desde el explorador (CUALQUIER tipo).
  // Reutiliza processUploadedFile: los .zip se extraen solos, los PDF se
  // procesan, los binarios viajan como base64 y el texto entra limpio.
  const handleAttachFilesToWorkspace = async (fileArray: File[]) => {
    const archivosPreparados = await prepararArchivosEntrantes(fileArray);
    if (archivosPreparados.length === 0) return;
    const newWorkspaceFiles: WorkspaceFile[] = [];
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📎 Adjuntando ${archivosPreparados.length} archivo(s) al workspace...`,
    ]);
    for (const file of archivosPreparados) {
      try {
        const { workspaceFiles: extractedFiles } = await processUploadedFile(file);
        if (extractedFiles.length > 0) newWorkspaceFiles.push(...extractedFiles);
      } catch (err) {
        console.error("Error procesando adjunto:", err);
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ⚠️ No se pudo procesar "${file.name}": ${String(err).slice(0, 120)}`,
        ]);
      }
    }
    // PEAJE 1 (v1.16.4): el adjunto del editor también pasa por la aduana antes
    // de tocar el árbol del proyecto. Misma llave, otra puerta.
    const admitidos = marcarComoEntrada(aduanaDeEntrada(newWorkspaceFiles, "adjunto del editor")); // v1.60.5 — adjunto del editor también es ENTRADA
    if (admitidos.length > 0) {
      setWorkspaceFiles((prev) => {
        const map = new Map<string, WorkspaceFile>();
        prev.forEach((f) => map.set(f.path, f));
        admitidos.forEach((f) => map.set(f.path, f)); // los nuevos ganan
        return Array.from(map.values());
      });
      setActiveFileId(admitidos[0].id);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ✅ ${admitidos.length} archivo(s) añadidos al árbol. Usa Sync/AUTO para verlos en el sandbox.`,
      ]);
    } else {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ⚠️ Ningún archivo extraíble en la selección.`,
      ]);
    }
  };

  // Borrar TODO el workspace (botón "Borrar todo" del explorador).
  // 🔧 CORRECCIÓN CRÍTICA: NO restaurar automáticamente la plantilla base — eso era
  // el bug "borro y se regenera". Ahora dejamos el workspace realmente vacío.
  // 🔧 IMPORTANTE: se pueden borrar TODOS los archivos, incluidos MEMORIA.md y skills.md.
  // Las skills y la memoria base del motor viven en contextCache.ts (segundo plano,
  // no en el workspace del editor). El usuario puede dejar el workspace vacío e
  // ingresar solo lo adecuado para cada modelo.
  // 🔧 AISLAMIENTO: También detiene el sandbox Y borra los archivos del disco (.proyectos/)
  // para que no quede ninguna imagen/vista previa vieja pegada.
  const handleDeleteAllFiles = async () => {
    setWorkspaceFiles([]);
    setActiveFileId(null);
    // v1.43.0 lote 3 — 🐞 FOCO ATRAPADO AL BORRAR: al detener el sandbox el <iframe>
    // de :3500 se desmonta y el foco nativo queda colgado del frame muerto, así
    // que el chat deja de recibir clics hasta minimizar/reabrir. Devolvemos el
    // foco a la ventana a mano — mismo efecto, automático.
    const rescatarFoco = () => {
      try {
        const a = document.activeElement as HTMLElement | null;
        if (a && a.tagName === "IFRAME" && typeof a.blur === "function") a.blur();
      } catch {}
      try { window.focus(); } catch {}
    };
    // 🔧 NUCLEAR WIPE: borrar ABSOLUTAMENTE TODO del disco (.proyectos/) incluyendo
    // node_modules. Esto destruye por completo cualquier app que haya quedado pegada
    // (como "Mockup Studio"). La próxima vez que arranque el sandbox será como la
    // primera vez (npm install incluido).
    try {
      // Primero detener el sandbox (matar el proceso npm run dev)
      try { await fetch("/api/sandbox/stop", { method: "POST" }); } catch {}
      // Luego NUCLEAR WIPE — borrar TODO incluyendo node_modules.
      // v1.6.23 — RESCATE v1: el endpoint primero muda el estado de CerebroNico
      // (.cerebro-db, MEMORIA.md, skills.md) a la app y, si eso falla, ABORTA el
      // borrado con `ok: false`. Antes, un abort se logueaba como «0 archivos
      // borrados… vacío» — un éxito falso que tapaba la causa.
      const res = await fetch("/api/fs/nuclear-wipe", { method: "POST" });
      const data = await res.json();
      if (data?.ok === false) {
        setTerminalLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ⚠️ WIPE ABORTADO: ${data.error || "motivo no informado por el motor"} — el workspace quedó vacío pero .proyectos NO se tocó. Arreglá el rescate y repetí.`,
        ]);
        return;
      }
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ☢️ NUCLEAR WIPE: ${data.deleted || 0} archivo(s) + ${data.deletedDirs || 0} carpeta(s) borrados. .proyectos completamente vacío. Sandbox destruido.` +
          (data?.rescate?.snapshot
            ? ` 🛟 Estado de CerebroNico mudado a ${data.rescate.snapshot}${data.rescate.docs?.length ? ` (incluye ${data.rescate.docs.join(", ")})` : ""}.`
            : "") +
          (typeof data?.resembrado === "number"
            ? ` 🌱 Re-sembrado ${data.resembrado} archivo(s) de estado: espejos y conocimiento siguen funcionando.` +
              (data?.erroresReSiembra?.length ? ` ⚠️ ${data.erroresReSiembra.join(" · ")}` : "")
            : ""),
      ]);
    } catch (e: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 🗑️ Workspace vaciado (no se pudo hacer nuclear wipe: ${e?.message || e}).`,
      ]);
    } finally {
      // Pase inmediato y otro diferido: el desmontaje del iframe puede llegar por
      // el sondeo de estado unos ms después, así que rescatamos el foco dos veces.
      rescatarFoco();
      setTimeout(rescatarFoco, 900);
    }
  };

  // Restaurar la plantilla base (package.json, MEMORIA.md, skills.md, README.md, server.ts)
  // tras un borrado total o cuando el usuario quiere volver al estado inicial.
  const handleRestoreTemplate = () => {
    setWorkspaceFiles(INITIAL_WORKSPACE_FILES);
    setActiveFileId(INITIAL_WORKSPACE_FILES[0]?.id ?? null);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 📋 Plantilla base restaurada (${INITIAL_WORKSPACE_FILES.length} archivos). Usa Sync para escribirla al sandbox.`,
    ]);
  };

  // ============================================================
  // EXTENSIÓN .cn (CerebroNico) — Contenedor tipo ZIP genérico
  // ------------------------------------------------------------
  // El archivo .cn es un ZIP renombrado con un manifest.json incluido.
  // Adentro entran TODO tipo de archivos: código (.ts, .tsx, .py, .js),
  // markdown (.md), JSON, imágenes (.png, .jpg), PDFs, binarios, etc.
  //
  // El usuario puede:
  //   - Guardar .cn  → descarga un ZIP con todos los archivos + manifest
  //   - Abrir .cn    → restaura el workspace completo desde el ZIP
  //   - Renombrar a .zip → inspeccionarlo en cualquier explorador (7-Zip, WinRAR)
  // ============================================================
  const handleExportCnFile = async () => {
    try {
      // 🔧 Pedir al usuario un nombre para el archivo (con default sugerido)
      const defaultName = `cerebronico-workspace-${new Date().toISOString().slice(0, 10)}`;
      const fileName = prompt(
        "Nombre del archivo .cn a guardar:",
        defaultName
      );
      if (!fileName || !fileName.trim()) {
        // Cancelado por el usuario
        return;
      }
      const cleanName = fileName.trim().replace(/\.(cn|zip|json)$/i, "");

      const blob = await generateCnFile(workspaceFiles, {
        currentModel,
        provider,
        temperature,
        responseLanguage,
        expertMode,
      });
      triggerFileDownload(blob, `${cleanName}.cn`);
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 💾 Workspace empaquetado como "${cleanName}.cn" (ZIP): ${workspaceFiles.length} archivo(s), ${(blob.size / 1024).toFixed(1)} KB. Tip: renómbralo a .zip para inspeccionarlo en cualquier explorador.`,
      ]);
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Error exportando .cn: ${err.message || err}`,
      ]);
      alert(`No se pudo exportar el archivo .cn: ${err.message || err}`);
    }
  };

  const handleImportCnFile = async (file: File) => {
    try {
      const result = await parseCnFile(file);
      const restoredFiles = result.files;
      if (restoredFiles.length === 0) {
        throw new Error("El archivo .cn no contenía archivos de texto válidos para restaurar.");
      }
      setWorkspaceFiles(restoredFiles);
      setActiveFileId(restoredFiles[0].id);

      // Restaurar metadatos opcionales del manifest
      const m = result.manifest;
      if (m) {
        if (typeof m.currentModel === "string" && m.currentModel) {
          setCurrentModel(m.currentModel);
        }
        if (typeof m.provider === "string") {
          const p = m.provider as ModelProvider;
          if (p === "ollama" || p === "gemini" || p === "openrouter" || p === "custom" || p === "openai") {
            setProvider(p);
          }
        }
        if (typeof m.temperature === "number") {
          setTemperature(m.temperature);
        }
        if (typeof m.responseLanguage === "string" && m.responseLanguage) {
          setResponseLanguage(m.responseLanguage);
          saveString(LS_KEYS.RESPONSE_LANGUAGE, m.responseLanguage);
        }
        if (typeof m.expertMode === "string" && m.expertMode) {
          setExpertMode(m.expertMode);
          saveString(LS_KEYS.EXPERT_MODE, m.expertMode);
        }
      }

      const extrasCount = result.extras.length;
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] 📂 Workspace restaurado desde "${file.name}" — ${restoredFiles.length} archivo(s) de código${extrasCount > 0 ? ` + ${extrasCount} archivo(s) binario(s) (imágenes/PDFs)` : ""}.${m?.currentModel ? ` Modelo activo: ${m.currentModel}.` : ""}`,
      ]);
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Error abriendo archivo .cn "${file.name}": ${err.message || err}`,
      ]);
      alert(`No se pudo abrir el archivo .cn: ${err.message || err}`);
    }
  };

  const handleCreateNewFile = () => {
    const fileName = prompt("Nombre del nuevo archivo (ej: Componente.tsx, worker.py):");
    if (fileName) {
      const newFile: WorkspaceFile = {
        id: "f-" + Date.now(),
        name: fileName.split("/").pop() || fileName,
        path: fileName,
        content: `// ${fileName}\n\n`,
        language: fileName.split(".").pop() || "typescript",
        size: 0,
        modified: true,
      };
      setWorkspaceFiles((prev) => [...prev, newFile]);
      setActiveFileId(newFile.id);
    }
  };

  // v1.60.5 — PROMOVER: pasa un archivo del árbol de ENTRADA (📥) al Sandbox (🏗️).
  const handlePromoverArchivo = (id: string) => {
    setWorkspaceFiles((prev) => promoverArchivo(prev, id));
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] 🏗️ Archivo promovido de Entrada a Sandbox.`,
    ]);
  };

  const handlePurgeMemory = () => {
    setRamUsageMb(42);
    setTerminalLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Memoria RAM optimizada. Buffers y cachés liberados (${ramUsageMb}MB -> 42MB).`,
    ]);
  };

  const handleAppendToMemoriaFile = (ruleText: string) => {
    setWorkspaceFiles((prev) =>
      prev.map((f) => {
        if (f.name.toLowerCase() === "memoria.md" || f.path === "MEMORIA.md") {
          return {
            ...f,
            content: f.content + "\n" + ruleText,
            size: f.content.length + ruleText.length,
            modified: true,
          };
        }
        return f;
      })
    );
    setTerminalLogs((l) => [
      ...l,
      `[${new Date().toLocaleTimeString()}] 🧠 MEMORIA.md actualizado en el workspace con nueva directiva.`,
    ]);
  };

  return (
    <div className="w-screen h-screen flex flex-col pb-[26px] bg-transparent text-zinc-100 overflow-hidden select-text font-sans" /* FOCO v1: 26 px reservados para la Espina — sin esto tapaba el textarea del chat y el clic no entraba */>
      {/* ============================================================
          v1.43.0 lote 2 — 🐞 EL IFRAME DEL SANDBOX SE COMÍA EL ARRASTRE
          ------------------------------------------------------------
          BUG REPORTADO (Mario): «al tocar el sandbox hay que minimizar/reabrir
          para poder clicar en el chat». Causa real: al arrastrar el separador
          del panel derecho, los listeners de mousemove/mouseup viven en
          `window`. Cuando el puntero cruza por ENCIMA del <iframe> del preview
          (:3500, otro documento), el navegador entrega esos eventos al IFRAME,
          NO a la ventana padre: el `mouseup` NO llega nunca, `isDraggingRight`
          se queda en true PARA SIEMPRE, el cursor queda en col-resize y el chat
          deja de recibir clics hasta remontar (minimizar/reabrir).
          ARREGLO canónico: mientras se arrastra, se tiende un velo transparente
          a pantalla completa POR ENCIMA del iframe. Así los eventos de ratón
          caen en el padre, el `mouseup` siempre llega y el arrastre se suelta.
          ============================================================ */}
      {(isDraggingLeft || isDraggingRight) && (
        <div
          className="fixed inset-0 z-[9999] cursor-col-resize"
          style={{ background: "transparent" }}
          aria-hidden="true"
        />
      )}
      {/* v2.0 — Fondo de la aplicación (heredado de la v1.9): el preset elegido
          en el panel Pro manda sobre la imagen personalizada. */}
      <AppBackground settings={proSettings} presetId={wallpaperPreset} customImageUrl={customBg || undefined} />

      {/* v2.0 — Menú contextual (click derecho), portapapeles y captura: funciona
          en toda la interfaz (chat, editor, terminal, preview, campos). */}
              <FondoLayer />{/* FONDO v1: capa z:-1 que asoma por los velillos de data-cn */}
      <ContextMenuRoot />
      {/* v1.45.3 — Sonido de ambiente (misterio/investigación/suspenso) en bucle
          indefinido. Control flotante abajo-izquierda; arranca al pulsarlo. */}
      {/* v1.73.0 — La barrita flotante de ambiente salió de abajo-izquierda
          (X roja en `areglo.jpg`): el componente sigue vivo y mudo, y el
          encendido se maneja desde el menú CN. Volumen: techo recortado a
          0.12 por el pedido del mismo día («baja bastante más»). */}
      <AudioAmbiente oculto />
      {/* v1.73.0 · CANAL DIRECTO: el modal selector de carpeta/ZIP. */}
      <CarpetaProyectoModal
        abierto={modalCarpetaAbierto}
        onClose={() => setModalCarpetaAbierto(false)}
        vinculada={carpetaVinculada}
        onVinculada={(e) => {
          setCarpetaVinculada(e);
          setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 📁 Canal DIRECTO activado: ${e.ruta} (${e.archivos} archivos). El agente trabaja ahí sin restricciones.`]);
        }}
        onDesvinculada={() => {
          setCarpetaVinculada(null);
          setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] 📁 Canal directo cerrado.`]);
        }}
      />
      {/* v1.16.3 — Panel de Trabajo Secundario (superior derecha): tareas vivas
          del motor en segundo plano, estado del sandbox y salto al panel completo.
          v1.48.3 — se oculta en la pestaña Planificador (redundante) y se ancla a
          la izquierda de la barra derecha para no tapar el preview/sandbox.
          v1.73.0 — además es LA BARRA DEL AGENTE: recibe el actionLog del
          puente :5000 (las «ACCIONES EJECUTADAS» que antes copaban el chat) y
          se autoabre cuando el motor empieza una tanda. */}
      {/* v1.97.4 · siempre visible (ya no hay pestaña que lo haga redundante);
          «Panel completo» abre el overlay, no una pestaña central. */}
      <PlanificationPanel
        onOpenPanel={() => setPlanPanelAbierto(true)}
        anclajeDerecho={(isRightOpen ? rightWidth : 0) + 8}
        acciones={actionLog}
        /* v2.2.4 · acá vive la ÚNICA lista de servicios (con reinicio y
           encendido/apagado). La pestaña Puertos quedó para el motor local, así
           que la muestra de telemetría y el reconectar viajan con ella. */
        telemetry={telemetry}
        onReconnectAll={handleReconnectAll}
        isReconnecting={isReconnecting}
      />

      {/* v2.0 — Pantalla de carga: cerebro arrancando el motor + comprobación real
          de Ollama, sandbox, puente y base de conocimiento. */}
      {isBooting && <BootSplash onReady={() => setIsBooting(false)} />}

      {/* Top Main Header */}
      <Header
        currentModel={currentModel}
        onOpenModelSelector={() => setIsModelSelectorOpen(true)}
        onOpenApiKeys={() => setIsApiKeyModalOpen(true)}
        telemetry={telemetry}
        workspaceFileCount={workspaceFiles.length}
        onDownloadZip={handleDownloadZip}
        isLeftOpen={isLeftOpen}
        onToggleLeft={() => setIsLeftOpen(!isLeftOpen)}
        isRightOpen={isRightOpen}
        onToggleRight={() => setIsRightOpen(!isRightOpen)}
        isSoundMuted={isSoundMuted}
        onToggleSound={() => setIsSoundMuted(!isSoundMuted)}
        ramUsageMb={ramUsageMb}
        maxRamGb={maxRamGb}
        responseLanguage={responseLanguage}
        onLanguageChange={(lang) => {
          setResponseLanguage(lang);
          saveString(LS_KEYS.RESPONSE_LANGUAGE, lang);
        }}
        expertMode={expertMode}
        onExpertModeChange={(mode) => {
          setExpertMode(mode);
          saveString(LS_KEYS.EXPERT_MODE, mode);
        }}
        onSaveCn={handleExportCnFile}
        onOpenCn={handleImportCnFile}
        onRestorePreviousWorkspace={handleRestorePreviousWorkspace}
        hayWorkspacePrevio={hayWorkspacePrevio}
        modoArranque={preferenciaArranque}
        onCambiarArranque={handleCambiarArranque}
        activeView={activeView}
        // v2.0 — El "Modo Web" ya no cambia de vista: abre/cierra la pestaña
        // del editor web al lado del chat.
        onToggleWebEditor={() => {
          if (centerTabs.some((t) => t.id === "web-editor")) {
            closeCenterTab("web-editor");
            setActiveCenterTab("chat");
          } else {
            openWebEditorTab();
          }
        }}
        // ============================================================
        // v2.0 — Controles nuevos del Header
        // ============================================================
        appFontSize={appFontSize}
        onAppFontSizeChange={setAppFontSize}
        perfMode={perfMode}
        perf={perf}
        onPerfModeChange={setPerfMode}
        onOpenExtensions={() => setIsExtensionManagerOpen(true)}
        extensionCount={extensions.length}
        onOpenProConfig={() => setIsProConfigOpen(true)}
        onToggleFullscreen={toggleAppFullscreen}
        isFullscreen={isAppFullscreen}
        isStreaming={isStreaming}
        onOpenBgPicker={handleOpenBgPicker}
        hasCustomBg={!!customBg}
        onClearBg={handleClearBg}
        systemStats={systemStats}
        snapshots={snapshots}
        onRestoreSnapshot={handleRestoreSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onCreateSnapshot={() => handleCreateSnapshot()}
        onExportMarkdown={handleExportMarkdown}
        onOpenConfig={() => setIsConfigOpen(true)}
        // v1.1 — Z.ai wizard reopen:
        onOpenZaiWizard={() => {
          // Reset dismissed flag so the wizard shows again:
          try { localStorage.removeItem(LS_KEYS.ZAI_WIZARD_DISMISSED); } catch {}
          setIsZaiWizardOpen(true);
        }}
        zaiApiKey={zaiApiKey}
        isSLM={slmState.isSLM}
        slmCategory={slmState.category}
        slmParams={slmState.params}
      />

      {/* 🔧 Input oculto para seleccionar imagen de fondo de pantalla */}
      <input
        ref={bgInputRef}
        type="file"
        /* v8.0.1 — GIF añadido (defecto reportado: «me di cuenta que no admite
           gif»). Faltaba por dos sitios a la vez: este `accept` no lo listaba,
           así que el diálogo del sistema ni siquiera lo dejaba elegir, y el
           procesado de abajo lo habría aplastado a JPEG de todos modos. */
        accept="image/png,image/jpeg,image/webp,image/jpg,image/gif"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) handleBgFileSelected(picked);
          e.target.value = "";
        }}
      />

      {/* v2.0 — La vista dedicada "web-editor" de la v1.1 queda DESACTIVADA
          (código muerto intencional con `false ?`): el editor web es ahora una
          PESTAÑA central más, al lado del Chat, y ya no sustituye la interfaz.
          Se conserva para poder comparar sin rebuscar en el historial. */}
      {false ? (
        <div className="flex-1 flex overflow-hidden">
          {/* 🔧 MODO WEB EDITOR: chat (40%) + preview del sandbox (60%) lado a lado.
              Sin explorador de archivos, sin panel izquierdo, sin panel derecho.
              El usuario chatea con el modelo y este escribe el HTML/CSS que se
              previsualiza en vivo en el iframe :3500. */}
          <div className="w-2/5 min-w-[360px] max-w-[600px] border-r border-[#141d2e] flex flex-col overflow-hidden bg-[#0d121c]/85 backdrop-blur-md">
            <ChatCenter
              messages={messages}
              currentStreamingText={currentStreamingText}
              isStreaming={isStreaming}
              onSendMessage={sendDesdeChat}
              onStopStreaming={handleStopStreaming}
              currentModel={currentModel}
              onOpenModelSelector={() => setIsModelSelectorOpen(true)}
              pendingAttachments={pendingAttachments}
              pendingNames={attachmentsCargando}
              onAddAttachments={handleAddAttachments}
              onRemovePendingAttachment={handleRemovePendingAttachment}
              onClearPendingAttachments={() => setPendingAttachments([])}
              messageQueue={messageQueue}
              onRemoveQueuedMessage={handleRemoveQueuedMessage}
              onEditQueuedMessage={handleEditQueuedMessage}
              onLaunchQueuedMessage={handleLaunchQueuedMessage}
              onClearQueue={handleClearQueue}
                modoLimpio={modoLimpio}
                onToggleModoLimpio={toggleModoLimpio}
              onResetSessionCache={handleClearSession}
              onRegenerate={handleRegenerate}
              onExportSession={handleExportSession}
              onImportSession={handleImportSession}
              agentTasks={agentTasks}
              actionLog={actionLog}
              savedChats={savedChats}
              activeChatTitle={activeChatTitle || deriveChatTitle(messages)}
              onNewChat={handleNewChat}
              onOpenChat={handleOpenChat}
              onDeleteChat={handleDeleteChat}
              onRenameChat={handleRenameChat}
              onRenameActiveChat={handleRenameActiveChat}
              isSoundMuted={isSoundMuted}
              activeFileName={workspaceFiles.find((f) => f.id === activeFileId)?.name || "MEMORIA.md"}
              openFilesCount={workspaceFiles.filter((f) => f.id === activeFileId || f.modified).length || 1}
              pcMode={pcMode}
              onTogglePcMode={() => setPcMode((v) => !v)}
              carpetaVinculada={carpetaVinculada}
              onAbrirCarpetaProyecto={() => setModalCarpetaAbierto(true)}
              onDesvincularCarpeta={() => setCarpetaVinculada(null)}
            />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* v2.1 — Esta instancia pasaba `onSendAIToChat`, una prop que el
                componente NO acepta desde la v2.0: se ignoraba EN SILENCIO. Es
                decir, en esta vista a pantalla completa el botón de orden directa
                no hacía nada y la barra de estado nunca se pintaba. Se cablea
                igual que la pestaña del editor, que sí lo hacía bien. */}
            <DedicatedWebEditorView
              sandboxUrl={resolverUrlSandbox()}
              onBackToIDE={() => setActiveView("ide")}
              onDirectOrder={sendWebEditorOrder}
              status={webEditorStatus}
              isBusy={isStreaming}
              activityLog={terminalLogs.slice(-40)}
              onClearActivityLog={() => setTerminalLogs([])}
              sandboxRunning={sandboxRunning}
            />
          </div>
        </div>
      ) : (
      <>

      {/* Main Workspace Layout with Flexible Resizable Columns */}
      <div className="flex-1 flex overflow-hidden relative select-text">
        {/* Left Sidebar (Config, Memory, Ports) */}
        {isLeftOpen && (
          <>
            <div
              style={{ width: `${leftWidth}px` }}
              className="h-full shrink-0 z-20 flex flex-col overflow-hidden bg-[#0d121c]/85 backdrop-blur-md"
            >
              <EspinaActividad />{/* COREO v1: franja fixed, no altera el layout */}
              {/* UX v1 — lanzadera discreta del Centro de Estado y Ayuda (F1). */}
              <button
                onClick={() => { setSeccionUX("estado"); setIsCentroUXOpen(true); }}
                title="Centro de Estado y Ayuda (F1)"
                className="fixed bottom-[30px] right-3 z-40 w-7 h-7 rounded-full bg-[#0b1120] border border-[#1b2740] text-cyan-300 text-sm flex items-center justify-center shadow-lg hover:bg-[#132038] hover:text-cyan-200"
              >
                ℹ
              </button>
              {modoLimpio ? null : (
<LeftSidebar
                provider={provider}
                onSelectProvider={cambiarMotor}
                currentModel={currentModel}
                onSelectModel={cambiarModelo}
                availableModels={availableModels}
                ollamaUrl={ollamaUrl}
                onUpdateOllamaUrl={setOllamaUrl}
                temperature={temperature}
                onUpdateTemperature={setTemperature}
                telemetry={telemetry}
                onRefreshTelemetry={checkTelemetry}
                subagents={subagents}
                pcMode={pcMode}
                onTogglePcMode={() => setPcMode((v) => !v)}
                onReconnectAll={handleReconnectAll}
                isReconnecting={isReconnecting}
                ollamaStats={systemStats?.ollama ?? null}
                onExpulsarModelos={handleExpulsarModelos}
                isExpulsando={isExpulsando}
                onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
                maxRamGb={maxRamGb}
                onUpdateMaxRam={setMaxRamGb}
                onPurgeMemory={handlePurgeMemory}
                chatMessages={messages}
                onAppendToMemoriaFile={handleAppendToMemoriaFile}
                openrouterApiKey={openrouterApiKey}
                onUpdateOpenrouterApiKey={(key) => {
                  setOpenrouterApiKey(key);
                  saveString(LS_KEYS.OPENROUTER_KEY, key);
                }}
                customServerUrl={customServerUrl}
                onUpdateCustomServerUrl={(url) => {
                  setCustomServerUrl(url);
                  try {
                    saveString(LS_KEYS.CUSTOM_SERVER_URL, url);
                  } catch {}
                }}
                customApiKey={customApiKey}
                onUpdateCustomApiKey={(key) => {
                  setCustomApiKey(key);
                  try {
                    saveString(LS_KEYS.CUSTOM_API_KEY, key);
                  } catch {}
                }}
                onRefreshModels={() => fetchInstalledModels()}
                isRefreshingModels={isRefreshingModels}
              />)}

            </div>

            {/* Left Draggable Resizer Splitter */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingLeft(true);
              }}
              onDoubleClick={() => setLeftWidth(320)}
              title="Arrastra para ajustar el ancho del panel izquierdo (Doble clic para 320px)"
              className={`w-2 hover:w-2.5 -mr-1 -ml-1 h-full z-30 cursor-col-resize flex items-center justify-center group transition-colors select-none ${
                isDraggingLeft ? "bg-cyan-500/80 shadow-lg shadow-cyan-500/50" : "bg-transparent hover:bg-cyan-500/40"
              }`}
            >
              <div className={`w-[2px] rounded-full transition-all ${
                isDraggingLeft ? "h-24 bg-cyan-300 shadow-sm" : "h-10 bg-zinc-700 group-hover:bg-cyan-400 group-hover:h-20"
              }`} />
            </div>
          </>
        )}

        {/* v2.0 — COLUMNA CENTRAL CON PESTAÑAS.
            El Chat es una pestaña más (fija, no se puede cerrar) y el Editor web
            o cualquier extensión se abren AL LADO, sin sustituir la interfaz.
            Esto es lo que pedías: herramientas externas "en una pestaña tipo chat". */}
        <div className="flex-1 h-full min-w-[220px] flex flex-col z-10 overflow-hidden">
          <CenterTabBar
            // v1.97.4 · sin pestaña Planificador: el latido del contrato en
            // ejecución vive en la barra de Tareas (arriba a la derecha), que
            // siempre está a la vista.
            tabs={centerTabs}
            activeId={activeCenterTab}
            onSelect={(id) => setActiveCenterTab(id)}
            onClose={closeCenterTab}
            isFullscreen={isAppFullscreen}
            onToggleFullscreen={toggleAppFullscreen}
            right={
              <span className="flex items-center gap-2">
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    estadoSync === "hibrido"
                      ? "text-emerald-400"
                      : estadoSync === "sincronizando"
                      ? "text-cyan-300"
                      : estadoSync === "solo-local"
                      ? "text-amber-300"
                      : "text-zinc-500"
                  }`}
                  title="Estado de persistencia híbrida (servidor + navegador)"
                >
                  {estadoSync === "hibrido"
                    ? "Srv + Local"
                    : estadoSync === "sincronizando"
                    ? "Sincronizando"
                    : estadoSync === "solo-local"
                    ? "Solo local"
                    : "Iniciando"}
                </span>
                <span className="text-zinc-600">·</span>
                <button
                  onClick={() => setActiveCenterTab("self-improvement")}
                  className={`font-mono tabular-nums text-[11px] hover:underline ${
                    telemetriaSesion.presion.nivel === "forzar_compactar"
                      ? "text-red-300"
                      : telemetriaSesion.presion.nivel === "sugerir_compactar"
                      ? "text-amber-300"
                      : telemetriaSesion.presion.nivel === "aviso"
                      ? "text-cyan-300"
                      : "text-emerald-400"
                  }`}
                  title={`Presión de contexto: ~${telemetriaSesion.tokensEstimados.toLocaleString("es-UY")} / ${telemetriaSesion.ventanaTokens.toLocaleString("es-UY")} tokens (${telemetriaSesion.presion.procedencia}). Clic para inspeccionar.`}
                >
                  {telemetriaSesion.presion.porcentaje}% ctx
                </button>
                <span className="text-zinc-600">·</span>
                <span className="flex items-center gap-1.5 font-mono">
                  {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                  {currentModel}
                </span>
              </span>
            }
          />
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className={activeCenterTab === "chat" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>
          <ChatCenter
            messages={messages}
            currentStreamingText={currentStreamingText}
            isStreaming={isStreaming}
            // v1.99.9 · la horma se gradúa con la ventana y los paneles abiertos (antes era
            // `!isRightOpen`, dos estados y una sola señal). El paso ya trae la cuenta hecha.
            horma={hormaChat.paso}
            onSendMessage={sendDesdeChat}
            onStopStreaming={handleStopStreaming}
            currentModel={currentModel}
            onOpenModelSelector={() => setIsModelSelectorOpen(true)}
            pendingAttachments={pendingAttachments}
              pendingNames={attachmentsCargando}
            onAddAttachments={handleAddAttachments}
            onRemovePendingAttachment={handleRemovePendingAttachment}
            onClearPendingAttachments={() => setPendingAttachments([])}
            messageQueue={messageQueue}
            onRemoveQueuedMessage={handleRemoveQueuedMessage}
            onEditQueuedMessage={handleEditQueuedMessage}
            onLaunchQueuedMessage={handleLaunchQueuedMessage}
            onClearQueue={handleClearQueue}
            onResetSessionCache={handleClearSession}
            onRegenerate={handleRegenerate}
            onExportSession={handleExportSession}
            onImportSession={handleImportSession}
            agentTasks={agentTasks}
            actionLog={actionLog}
            savedChats={savedChats}
            activeChatTitle={activeChatTitle || deriveChatTitle(messages)}
            onNewChat={handleNewChat}
            onOpenChat={handleOpenChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            onRenameActiveChat={handleRenameActiveChat}
            isSoundMuted={isSoundMuted}
            activeFileName={workspaceFiles.find((f) => f.id === activeFileId)?.name || "MEMORIA.md"}
            openFilesCount={workspaceFiles.filter((f) => f.id === activeFileId || f.modified).length || 1}
            pcMode={pcMode}
            onTogglePcMode={() => setPcMode((v) => !v)}
            editorMode={editorMode}
            onToggleEditorMode={toggleEditorMode}
            showEditorMode={editorMode || editorTabOpen}
            thinkingMode={(proSettings as any)?.ai?.executionMode || "auto"}
            onCycleThinkingMode={cycleThinkingMode}
            geminiThinkingLevel={(proSettings as any)?.ai?.geminiThinkingLevel || "alto"}
            onCycleGeminiThinkingLevel={cycleGeminiThinkingLevel}
            isGeminiProvider={provider === "gemini"}
            carpetaVinculada={carpetaVinculada}
            onAbrirCarpetaProyecto={() => setModalCarpetaAbierto(true)}
            onDesvincularCarpeta={() => setCarpetaVinculada(null)}
          />
          </div>

          {/* v2.0 — Pestaña del EDITOR WEB: alimentada por orden directa y con
              estado real (ya no depende del chat central). */}
          {activeCenterTab === "web-editor" && (
            <DedicatedWebEditorView
              sandboxUrl={resolverUrlSandbox()}
              onBackToIDE={() => setActiveCenterTab("chat")}
              onDirectOrder={sendWebEditorOrder}
              status={webEditorStatus}
              isBusy={isStreaming}
              activityLog={terminalLogs.slice(-40)}
              onClearActivityLog={() => setTerminalLogs([])}
              sandboxRunning={sandboxRunning}
              /* ============================================================
                 v2.1 — 🐞 SEGUNDO CHAT ELIMINADO.
                 Esta vista montaba SU PROPIO ChatCenter, así que había dos chats
                 vivos a la vez, con estado independiente: lo que escribías en uno
                 no estaba en el otro, y el usuario escribía en uno creyendo que
                 era el mismo. El flujo queda simple y de una sola dirección:
                   1) el chat central envía la orden con el código
                   2) el editor web la ensambla
                   3) el previsualizador la reproduce
                 Por eso ya no se pasa chatSlot: hay UN solo chat, el central.
                 ============================================================ */
            />
          )}

          {/* v2.0 — Pestañas de EXTENSIONES: cada una es un iframe aislado con su
              propio puente de permisos. Si la extensión declaró herramientas,
              el modelo puede llamarlas mientras su pestaña esté abierta. */}
          {(() => {
            if (!activeCenterTab.startsWith("ext:")) return null;
            const extId = activeCenterTab.slice(4);
            const ext = extensions.find((e) => e.manifest.id === extId);
            if (!ext) {
              return (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-400 text-sm">
                  <span>La extensión "{extId}" ya no está instalada o está deshabilitada.</span>
                  <button
                    onClick={() => reloadExtensions()}
                    className="px-3 py-1.5 rounded bg-[#0d121c] border border-[#162034] text-xs hover:text-cyan-300"
                  >
                    Recargar extensiones
                  </button>
                </div>
              );
            }
            return (
              <ExtensionPanelView
                extension={ext}
                pendingCommandId={pendingExtCommand?.extId === extId ? pendingExtCommand.commandId : undefined}
                workspaceFiles={workspaceFiles.map((f) => ({ path: f.path, content: f.content }))}
                chatMessages={chatProyectado}
                onChatMessage={(text) => handleSendMessageWithRAG(text, [])}
                onLog={(line) => setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`])}
                onError={(msg) => setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ⚠️ ${msg}`])}
              />
            );
          })()}

          {/* v2.0 — Pestaña de AUTOSUPERACIÓN: KPIs, tendencia, lecciones y
              estado de la resiliencia. Es la prueba numérica de que el sistema
              se supera (o de que algo hay que cambiar). */}
          {activeCenterTab === "self-improvement" && (
            <SelfImprovementPanel
              summary={improvementSummary}
              lastLesson={lastLesson}
              onRefresh={() => setImprovementSummary(getImprovementSummary())}
              onLog={(line) => setTerminalLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] ${line}`])}
              messages={messages}
              workspaceFiles={workspaceFiles}
              currentModel={currentModel}
              onCompactHistory={handleCompactarHistorial}
            />
          )}
          {/* v1.97.4 · EL PANEL COMPLETO DE PLANES, FUERA DEL FRENTE. La pestaña
              «Planificador» quedó eliminada (pedido: planificación en automático
              en segundo plano): esto es un OVERLAY que solo el USUARIO abre desde
              «Panel completo» de la barra de Tareas. El motor nunca lo trae al
              frente — la obra se ve en la barra y la entrega, en el chat.
              Mismos componentes que antes (TableroParalelo + PlansPanel): una
              sola API, no dos verdades. */}
          {planPanelAbierto && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => setPlanPanelAbierto(false)}
            >
              <div
                className="flex h-[92vh] w-[min(980px,94vw)] flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-neutral-700 bg-neutral-800/60 px-4 py-2">
                  <span className="text-sm font-semibold text-neutral-200">Planificador completo — el motor sigue en segundo plano</span>
                  <button
                    onClick={() => setPlanPanelAbierto(false)}
                    className="px-2 text-neutral-400 transition-colors hover:text-neutral-100"
                    title="Cerrar (el motor sigue trabajando detrás)"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  <TableroParalelo />
                  <PlansPanel />
                </div>
              </div>
            </div>
          )}
          {/* QUIRÓFANO HD v1 — la sala de operaciones del guardián de cambios. */}
          {activeCenterTab === "quirofano" && (
            <PanelQuirofano />
          )}
          </div>
        </div>

        {/* Right Sidebar (Sandbox, Editor con pestañas de scroll fluido, Entregables) */}
        {isRightOpen && (
          <>
            {/* Right Draggable Resizer Splitter */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingRight(true);
              }}
              onDoubleClick={() => setRightWidth(540)}
              title="Arrastra para ajustar el ancho del editor/sandbox (Doble clic para 540px)"
              className={`w-2 hover:w-2.5 -mr-1 -ml-1 h-full z-30 cursor-col-resize flex items-center justify-center group transition-colors select-none ${
                isDraggingRight ? "bg-cyan-500/80 shadow-lg shadow-cyan-500/50" : "bg-transparent hover:bg-cyan-500/40"
              }`}
            >
              <div className={`w-[2px] rounded-full transition-all ${
                isDraggingRight ? "h-24 bg-cyan-300 shadow-sm" : "h-10 bg-zinc-700 group-hover:bg-cyan-400 group-hover:h-20"
              }`} />
            </div>

            <div
              style={{ width: `${rightWidth}px` }}
              className="h-full shrink-0 z-20 flex flex-col overflow-hidden bg-[#0d121c]/85 backdrop-blur-md"
            >
              <RightSidebar
                files={workspaceFiles}
                activeFileId={activeFileId}
                onSelectFile={(id) => setActiveFileId(id)}
                onCloseFile={(id) => {
                  const remaining = workspaceFiles.filter((f) => f.id !== id);
                  setWorkspaceFiles(remaining);
                  if (activeFileId === id && remaining.length > 0) {
                    setActiveFileId(remaining[0].id);
                  }
                }}
                onUpdateFileContent={(id, content) => {
                  setWorkspaceFiles((prev) =>
                    prev.map((f) => (f.id === id ? { ...f, content, size: content.length, modified: true } : f))
                  );
                }}
                onCreateNewFile={handleCreateNewFile}
                onPromoteFile={handlePromoverArchivo}
                onDeleteFile={(id) => {
                  setWorkspaceFiles((prev) => prev.filter((f) => f.id !== id));
                }}
                onAttachFiles={handleAttachFilesToWorkspace}
                onDeleteAllFiles={handleDeleteAllFiles}
                onRestoreTemplate={handleRestoreTemplate}
                onExportCnFile={handleExportCnFile}
                onImportCnFile={handleImportCnFile}
                onDownloadZip={handleDownloadZip}
                terminalLogs={terminalLogs}
                onSyncProject={handleSyncToDisk}
                onAutoSync={handleAutoSyncToSandbox}
                onPullProject={handlePullFromDisk}
                onBuildProject={handleBuildAndFix}
                buildFix={buildFixUI} // v1.72.0 — el boton dice en que vuelta va el bucle
              />
            </div>
          </>
        )}
      </div>
      </>
      )}

      {/* Model Selection Modal */}
      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        currentModel={currentModel}
        installedOllamaModels={availableModels.map((m) => m.name)}
        detectedGeminiModels={detectedGeminiModels}
        detectedOpenRouterModels={detectedOpenRouterModels}
        detectedOpenaiModels={detectedOpenaiModels}
        // v1.1 — Z.ai (GLM) free models always visible (auto-cargados al arranque):
        detectedZaiModels={detectedZaiModels}
        onRefreshModels={() => fetchInstalledModels()}
        onRefreshGeminiModels={fetchGeminiFreeModels}
        onRefreshOpenRouterModels={fetchOpenRouterFreeModels}
        onRefreshOpenaiModels={fetchOpenaiAvailableModels}
        onRefreshZaiModels={fetchZaiFreeModels}
        avisoCatalogo={avisoCatalogo}
        onRefreshGroqModels={fetchGroqFreeModels}
        onRefreshCustomModels={sondarUnificadaAhora}
        // v1.95.2 · el selector ya no adivina por qué la carpeta está vacía: le llega el
        // estado de la última sonda y el contador de intentos automáticos.
        sondaUnificada={sondaUnificada}
        hayUrlUnificada={Boolean(customServerUrl)}
        intentoUnificada={intentoUnificada}
        maxIntentosUnificada={INTENTOS_UNIFICADA}
        onRedetectAll={redetectAllModels}
        isRefreshing={isRefreshingModels}
        isDetectingGemini={isDetectingGemini}
        isDetectingOpenRouter={isDetectingOpenRouter}
        isDetectingOpenai={isDetectingOpenai}
        isDetectingZai={isDetectingZai}
        isDetectingGroq={isDetectingGroq}
        detectedGroqModels={detectedGroqModels}
        isRedetectingAll={isRedetectingAll}
        // v1.58.3 — motores cloud OpenAI-compatibles que faltaban en el selector:
        detectedCerebrasModels={detectedCerebrasModels}
        detectedMistralModels={detectedMistralModels}
        detectedTogetherModels={detectedTogetherModels}
        detectedCustomModels={detectedCustomModels}
        detectedDeepseekModels={detectedDeepseekModels}
        detectedFireworksModels={detectedFireworksModels}
        onRefreshCerebrasModels={fetchCerebrasFreeModels}
        onRefreshMistralModels={fetchMistralFreeModels}
        onRefreshTogetherModels={fetchTogetherFreeModels}
        onRefreshDeepseekModels={fetchDeepseekFreeModels}
        onRefreshFireworksModels={fetchFireworksFreeModels}
        isDetectingCerebras={isDetectingCerebras}
        isDetectingMistral={isDetectingMistral}
        isDetectingTogether={isDetectingTogether}
        isDetectingDeepseek={isDetectingDeepseek}
        isDetectingFireworks={isDetectingFireworks}
        // v1.57.21 — el mismo `cambiarModelo` de la barra lateral (LOCAL PRIMERO,
        // v1.6.22: un modelo instalado en Ollama es local aunque su nombre
        // empiece por "glm-", "gemini", "gpt", etc.).
        onSelectModel={cambiarModelo}
      />

      {/* API Key and Server Slots Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        provider={provider}
        // v1.57.21 — las ranuras de motor también viajan por `cambiarMotor`:
        // elegir Z.ai con `gemma4:31b-cloud` puesto ya no deja el turno despareado.
        onSelectProvider={cambiarMotor}
        openrouterApiKey={openrouterApiKey}
        onUpdateOpenrouterApiKey={(key) => {
          setOpenrouterApiKey(key);
          saveString(LS_KEYS.OPENROUTER_KEY, key);
        }}
        geminiApiKey={geminiApiKey}
        onUpdateGeminiApiKey={(key) => {
          setGeminiApiKey(key);
          saveString(LS_KEYS.GEMINI_API_KEY, key);
        }}
        onDetectGeminiModels={fetchGeminiFreeModels}
        isDetectingGemini={isDetectingGemini}
        onDetectOpenRouterModels={fetchOpenRouterFreeModels}
        isDetectingOpenRouter={isDetectingOpenRouter}
        ollamaUrl={ollamaUrl}
        ollamaApiKey={ollamaApiKey}
        onUpdateOllamaApiKey={setOllamaApiKey}
        onDetectOllamaModels={() => fetchInstalledModels()}
        onUpdateOllamaUrl={(url) => {
          setOllamaUrl(url);
          saveString(LS_KEYS.OLLAMA_URL, url);
        }}
        customServerUrl={customServerUrl}
        onUpdateCustomServerUrl={(url) => {
          setCustomServerUrl(url);
          try {
            saveString(LS_KEYS.CUSTOM_SERVER_URL, url);
          } catch {}
        }}
        customApiKey={customApiKey}
        onUpdateCustomApiKey={(key) => {
          setCustomApiKey(key);
          try {
            saveString(LS_KEYS.CUSTOM_API_KEY, key);
          } catch {}
        }}
        openaiApiKey={openaiApiKey}
        onUpdateOpenaiApiKey={(key) => {
          setOpenaiApiKey(key);
          saveString(LS_KEYS.OPENAI_API_KEY, key);
        }}
        onDetectOpenaiModels={fetchOpenaiAvailableModels}
        onDetectCustomModels={fetchCustomModels}
        isDetectingOpenai={isDetectingOpenai}
        // v1.1 — Dedicated cloud provider keys:
        zaiApiKey={zaiApiKey}
        onUpdateZaiApiKey={(key) => {
          setZaiApiKey(key);
          saveString(LS_KEYS.ZAI_API_KEY, key);
        }}
        onDetectZaiModels={fetchZaiFreeModels}
        isDetectingZai={isDetectingZai}
        groqApiKey={groqApiKey}
        onUpdateGroqApiKey={(key) => {
          setGroqApiKey(key);
          saveString(LS_KEYS.GROQ_API_KEY, key);
        }}
        cerebrasApiKey={cerebrasApiKey}
        onUpdateCerebrasApiKey={(key) => {
          setCerebrasApiKey(key);
          saveString(LS_KEYS.CEREBRAS_API_KEY, key);
        }}
        togetherApiKey={togetherApiKey}
        onUpdateTogetherApiKey={(key) => {
          setTogetherApiKey(key);
          saveString(LS_KEYS.TOGETHER_API_KEY, key);
        }}
        mistralApiKey={mistralApiKey}
        onUpdateMistralApiKey={(key) => {
          setMistralApiKey(key);
          saveString(LS_KEYS.MISTRAL_API_KEY, key);
        }}
        deepseekApiKey={deepseekApiKey}
        onUpdateDeepseekApiKey={(key) => {
          setDeepseekApiKey(key);
          saveString(LS_KEYS.DEEPSEEK_API_KEY, key);
        }}
        fireworksApiKey={fireworksApiKey}
        onUpdateFireworksApiKey={(key) => {
          setFireworksApiKey(key);
          saveString(LS_KEYS.FIREWORKS_API_KEY, key);
        }}
      />

      {/* 🔧 ConfigModal: Panel de Control y Compatibilidad */}
      <ConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={ideConfig}
        onUpdate={handleUpdateConfig}
      />

      {/* ============================================================
          v2.0 — PANEL DE CONFIGURACIÓN PRO (menú de la 1.8 portado y ampliado)
          ============================================================ */}
      <ProConfigPanel
        open={isProConfigOpen}
        settings={proSettings}
        onClose={() => setIsProConfigOpen(false)}
        onChange={(patch) => setProSettings((prev) => ({ ...prev, ...patch } as ProSettings))}
        /* v2.1 — `onReplaceAll` es OBLIGATORIA en ProConfigPanel y NO se pasaba,
           así que «restaurar valores por defecto» (ProConfigPanel.tsx:180 y :474)
           e «importar ajustes» (:457) lanzaban `onReplaceAll is not a function`:
           dos botones muertos. Se pasa sin fusionar, que es justo lo que la
           distingue de `onChange`: reemplaza el juego entero. El guardado lo hace
           el efecto de App.tsx:990, igual que con `onChange`. */
        onReplaceAll={(s) => setProSettings(s)}
        /* v1.7.1 — la imagen de «Imagen propia» se aplica AL INSTANTE.
           El panel la guarda en IndexedDB (blob); aquí se pinta y se libera la
           URL de objeto anterior, para no quedarse con dos fondos en memoria. */
        onWallpaperListo={(imagen: Blob) => {
          const url = urlDeFondo(imagen);
          revocarFondo(fondoUrlRef.current);
          fondoUrlRef.current = url;
          setCustomBg(url);
        }}
        /* v1.15.1 — Cuando el usuario elige preset, URL o apaga el fondo desde el
           panel Pro, hay que soltar la imagen personalizada (customBg) para que lo
           que acaba de elegir tenga prioridad visible. */
        onWallpaperClear={() => {
          revocarFondo(fondoUrlRef.current);
          fondoUrlRef.current = "";
          setCustomBg("");
        }}
        presetId={wallpaperPreset}
        onPresetChange={setWallpaperPreset}
        /* v1.6.33 — aquí vivía `version="2.0.0"`: la pestaña «Acerca de» mostraba
           ese literal mientras la cabecera mostraba IDE_BRAND. Se retira: el
           panel lee la versión de la semilla única y no admite otra por prop. */
      />

      {/* ============================================================
          v2.0 — GESTOR DE EXTENSIONES: cada panel se abre en su pestaña
          ============================================================ */}
      <ExtensionManager
        open={isExtensionManagerOpen}
        extensions={extensions}
        onClose={() => setIsExtensionManagerOpen(false)}
        onReload={() => reloadExtensions()}
        onToggle={async (id, enabled) => {
          await setExtensionEnabled(id, enabled);
          reloadExtensions();
        }}
        onInstall={async (file) => {
          const res = await installExtensionZip(file);
          if (res.ok) reloadExtensions();
          return res;
        }}
        onUninstall={async (id) => {
          await uninstallExtension(id);
          // Si la pestaña de esa extensión estaba abierta, se cierra.
          closeCenterTab(`ext:${id}`);
          reloadExtensions();
        }}
        onOpenPanel={(ext) => {
          openExtensionTab(ext);
          setIsExtensionManagerOpen(false);
        }}
      />

      {/* v1.1 — Asistente de bienvenida Z.ai (GLM-4.5-Flash GRATIS) */}
      <ZaiWizard
        isOpen={isZaiWizardOpen}
        onClose={() => {
          try {
            localStorage.setItem(LS_KEYS.ZAI_WIZARD_DISMISSED, "1");
          } catch {}
          setIsZaiWizardOpen(false);
        }}
        zaiApiKey={zaiApiKey}
        onUpdateZaiApiKey={(key) => {
          setZaiApiKey(key);
          saveString(LS_KEYS.ZAI_API_KEY, key);
          // Marcar el wizard como visto para que no vuelva a aparecer solo:
          try {
            localStorage.setItem(LS_KEYS.ZAI_WIZARD_DISMISSED, "1");
          } catch {}
        }}
        onOpenApiKeyModal={() => {
          setIsZaiWizardOpen(false);
          try {
            localStorage.setItem(LS_KEYS.ZAI_WIZARD_DISMISSED, "1");
          } catch {}
          setIsApiKeyModalOpen(true);
        }}
      />

      {/* ============================================================
          UX v1 — CENTRO DE ESTADO Y AYUDA
          Reúne las 5 mejoras del reporte del chat (estado, dependencias,
          flujos, atajos, ayuda contextual). Puro frontend: lee props y el
          bus `cn:coreo`, no llama al servidor. Se abre con F1 / Ctrl+/ / Ctrl+.
          ============================================================ */}
      <CentroEstadoUX
        open={isCentroUXOpen}
        onClose={() => setIsCentroUXOpen(false)}
        seccionInicial={seccionUX}
        systemStats={systemStats}
        provider={provider}
        currentModel={currentModel}
        apiKeyConfigured={(() => {
          const porProveedor: Record<string, string> = {
            openrouter: openrouterApiKey,
            gemini: geminiApiKey,
            custom: customApiKey,
            openai: openaiApiKey,
            zai: zaiApiKey,
            groq: groqApiKey,
            cerebras: cerebrasApiKey,
            together: togetherApiKey,
            mistral: mistralApiKey,
            deepseek: deepseekApiKey,
            fireworks: fireworksApiKey,
          };
          if (provider === "ollama") return true;
          if (provider === "gemini" && geminiServerReady) return true;
          return !!(porProveedor[provider] && porProveedor[provider].trim());
        })()}
        isStreaming={isStreaming}
        sandboxRunning={sandboxRunning}
        extensionesActivas={extensions.filter((e) => e.enabled).length}
        activeCenterTab={activeCenterTab}
        activeView={activeView}
        ultimoLog={terminalLogs[terminalLogs.length - 1]}
      />
    </div>
  );
};

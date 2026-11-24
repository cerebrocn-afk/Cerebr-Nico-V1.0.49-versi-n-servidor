# AUDITORIAS — Auditorias de linaje unificadas

Archivo MAESTRO generado el 2026-10-05. Unifica 4 + 7 documentos (v1.69.0: la unificación de Mario absorbió los informes sueltos de la raíz; los originales quedaron en `_archivo-consolidado/UNIFICADO-v1.69.0/`).
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [01_shell_v332_v140.md](#01-shell-v332-v140-md) — version 1.332.140
2. [02_motor_v2x.md](#02-motor-v2x-md) — version 2.2
3. [03_agentico_v1x.md](#03-agentico-v1x-md) — version 3.1
4. [04_lineaje_early.md](#04-lineaje-early-md) — version 4


---

<a id="01-shell-v332-v140-md"></a>
## (1/4) 01_shell_v332_v140.md

> **Fuente:** `audits/01_shell_v332_v140.md`  —  **version:** 1.332.140  —  **bytes:** 63073
# Auditoría técnica de la "cáscara" CerebroNico IDE — v3.3.2 vs v1.4.0

**Objetivo:** informe exhaustivo (solo lectura de código, sin ejecución) de la cáscara del IDE Electron+sandbox, para planear la fusión **V8**.
**Rutas base auditadas:**

- `<sesion-anterior>/project/cerebronico_evolution/v3.3.2/ide/`
- `<sesion-anterior>/project/cerebronico_evolution/v1.4.0/ide/`

**Convenciones:**

- **[FETO]** = hecho verificable directamente en el código citado (ruta + línea).
- **[INFERENCIA]** = deducción del auditor, no afirmada literalmente por el código.
- Rutas abreviadas: `v3.3.2/...` y `v1.4.0/...` = las dos rutas base anteriores; `backend/` = `ide/backend/`.

**Resumen del alcance real (FETO):** el paquete npm se llama **`codigo-0-cerebronico`** en ambas versiones, pero declara versiones distintas: `1.3.2` (v3.3.2, `v3.3.2/ide/backend/package.json:4`) y `1.4.0` (v1.4.0, `v1.4.0/ide/backend/package.json:4`). Los nombres de carpeta (`v3.3.2`, `v1.4.0`) NO coinciden con la versión del paquete en v3.3.2 → deuda de versionado.

---

## 1. API completa del servidor (`backend/server.ts`)

### 1.1 Inventario de endpoints — v3.3.2 (`v3.3.2/ide/backend/server.ts`, 2384 líneas)

Registro: `async function startServer()` en **línea 948**; `app.listen(PORT, HOST)` en **2368**.

| # | Método | Ruta | Línea | Qué hace | Validaciones / notas |
|---|--------|------|-------|----------|----------------------|
| 1 | GET | `/api/telemetry/ports` | 968 | Sonda Ollama `:11434/api/tags` y Puente `:5000/health`; devuelve `{port3000, port5000, port11434, lastChecked, ollamaModelCount}` | Cache 10 s (`TELEMETRY_CACHE_MS`, 965); probe 35 s (`TELEMETRY_PROBE_MS`, 966). **Sin** `sandboxAuthorized` |
| 2 | GET | `/api/ollama/models` | 1022 | Proxy a `${customUrl}/api/tags` (query `?url=`) | Timeout 3500 ms; error → `{models:[], error}` |
| 3 | GET | `/api/subagents` | 1046 | Topología viva; delega a `bridgeFetch("/api/subagents")`; si el puente no responde arma fallback con UI/bridge/ollama/sandbox | Sin auth |
| 4 | POST | `/api/sandbox/start` | 1149 | Arranca `npm run dev` del proyecto en `:3500`; auto-heal de deps | `sandboxAuthorized` (1150); exige `package.json` (1157); anti-zombie NO existe aquí (ver §7) |
| 5 | POST | `/api/sandbox/stop` | 1247 | Mata `sandboxProc` (taskkill /T /F en Win; `kill(-pid)` en *nix) y limpia huérfanos con `killPortListeners` | `sandboxAuthorized` (1248) |
| 6 | GET | `/api/sandbox/status` | 1273 | `{online, port, running, installed, hasProject, root}` | `sandboxAuthorized` (1274) |
| 7 | GET | `/api/sandbox/logs` | 1286 | Cola (16 KB) de `.proyectos/.sandbox_3500.log` | `sandboxAuthorized` (1287) |
| 8 | POST | `/api/exec` | 1297 | Ejecuta comando en el sandbox | `sandboxAuthorized` (1298); exige `command` string (1300); `cwd` pasa por `resolveSafePath` (1304); timeout acotado a 300 000 ms (1305) |
| 9 | POST | `/api/fs/write` | 1312 | Crea/sobrescribe archivo en `.proyectos` | `sandboxAuthorized` (1313); exige `path`+`content` string (1315-1316); `resolveSafePath` (1318) |
| 10 | POST | `/api/fs/sync` | 1327 | Escritura masiva `{files:[{path,content}]}` | `sandboxAuthorized` (1328); exige array `files` (1330); `resolveSafePath` por archivo (1335); devuelve `{ok, written}` |
| 11 | GET | `/api/fs/read` | 1347 | Lee archivo del sandbox | `sandboxAuthorized` (1348); exige `?path` (1350); `resolveSafePath` (1352) |
| 12 | GET | `/api/fs/tree` | 1360 | Árbol recursivo de `.proyectos` | `sandboxAuthorized` (1361); walk sin límite de profundidad (1363-1385) |
| 13 | POST | `/api/ai/stream` | 1704 | Proxy SSE multi-proveedor (Ollama / Gemini / OpenRouter / Custom) + agente con tool-calling + fallback autónomo | Sin auth; ver §1.3 |
| 14 | POST | `/api/bridge/restart` | 2334 | Reinicia el puente `:5000`; invalida cache de telemetría | Sin auth; requiere que `startAgentBridge()` devolviera handle (2330) |
| 15 | POST | `/api/telemetry/refresh` | 2348 | `telemetryCache = null` (invalida cache) | Sin auth |
| 16 | GET | `*` (catch-all SPA) | 2363 | En `NODE_ENV==="production"` sirve `dist/index.html` | Solo producción (2354-2366) |

**Middleware:** solo `express.json({limit:"50mb"})` y `express.urlencoded({...,limit:"50mb"})` (**951-952**). **NO hay `cors()`** ni `helmet` (ver §6).

### 1.2 Inventario de endpoints — v1.4.0 (`v1.4.0/ide/backend/server.ts`, 2524 líneas)

`startServer()` en **1053**; `app.listen` en **2508** (aprox., análogo a v3.3.2 + desplazamiento).

| # | Método | Ruta | Línea | Qué hace | Delta vs v3.3.2 |
|---|--------|------|-------|----------|-----------------|
| 1 | GET | `/api/gemini/models` | 973 | Consulta `generativelanguage.googleapis.com/v1beta/models?key=…`; filtra `flash` con `generateContent`; devuelve `{models,total}` | **NUEVO** |
| 2 | GET | `/api/openrouter/models` | 1016 | Consulta catálogo público `openrouter.ai/api/v1/models`; filtra ids `:free`; antepone modelo virtual `openrouter/free` | **NUEVO** |
| 3 | GET | `/api/telemetry/ports` | 1076 | Igual que v3.3.2 | idéntico |
| 4 | GET | `/api/ollama/models` | 1130 | Igual | idéntico |
| 5 | GET | `/api/subagents` | 1154 | Igual | idéntico |
| 6 | POST | `/api/sandbox/start` | 1257 | Arranca sandbox + **anti-zombie** (1271-1286) + `HOST=0.0.0.0` (1310-1315) + handlers `exit`/`error` del proc (1331-1338) | **AMPLIADO** |
| 7 | POST | `/api/sandbox/stop` | 1381 | Igual | idéntico |
| 8 | GET | `/api/sandbox/status` | 1407 | Igual | idéntico |
| 9 | GET | `/api/sandbox/logs` | 1420 | Igual | idéntico |
| 10 | POST | `/api/exec` | 1431 | Igual | idéntico |
| 11 | POST | `/api/fs/write` | 1446 | Igual | idéntico |
| 12 | POST | `/api/fs/sync` | 1461 | Igual | idéntico |
| 13 | GET | `/api/fs/read` | 1481 | Igual | idéntico |
| 14 | GET | `/api/fs/tree` | 1494 | Igual | idéntico |
| 15 | POST | `/api/ai/stream` | 1838 | Igual + `geminiApiKey` del body (1849) y `getGenAI(geminiApiKey)` (1920) | **AMPLIADO** |
| 16 | POST | `/api/bridge/restart` | 2474 | Igual | idéntico |
| 17 | POST | `/api/telemetry/refresh` | 2488 | Igual | idéntico |
| 18 | GET | `*` catch-all | 2503 | Igual | idéntico |

### 1.3 Endpoint `/api/ai/stream` en detalle (base común)

**[FETO] Parámetros de entrada** (v3.3.2 `server.ts:1705-1720`): `prompt, systemInstruction, hiddenSystemFiles[], openFiles[], provider="ollama", model="stablelm2:latest", temperature=0.5, ollamaUrl, openrouterApiKey, customServerUrl, customApiKey, attachments[], history[], pcMode=false`. En v1.4.0 se añade `geminiApiKey` (`v1.4.0/.../server.ts:1849`).

**[FETO] Cabeceras SSE** (`server.ts:1722-1725`): `text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.

**[FETO] `StreamContext`** (v3.3.2 **líneas 1588-1649**; v1.4.0 **1722-1783**) — clase que centraliza el ciclo de vida SSE:
- `aborted` se activa **solo** en `res.on("close")` con guarda `!res.writableEnded` (**1599-1601**). El comentario 1593-1598 documenta el bug original: usar `req.on("close")` abortaba el stream al recibir el body.
- **Watchdog global**: `setTimeout(..., WATCHDOG_TIMEOUT_MS)` = **8 min** (constante en **17**) escribe `{error, done:true}` y termina (**1603-1609**).
- Métodos: `isAborted()`, `isWritable()`, `sendChunk()` (evento `{text}`), `sendDone(model)` (evento `{done:true, model}` + `res.end()`), `sendError(msg)` (evento `{error, done:true}`), `sendTaskEvent(task)` (evento `{task}`), `clearWatchdog()` (**1612-1648**).
- `finally { ctx.clearWatchdog(); }` en el handler (**2321-2324**) garantiza que nunca quede un watchdog colgado.

**[FETO] Timeouts de streaming** (`server.ts:17-24`):
- `WATCHDOG_TIMEOUT_MS = 8*60*1000` (17)
- `OLLAMA_INACTIVITY_MS = 5*60*1000` (18) — **inactividad real**, el timer se reinicia por chunk vía `readChunk()` (**2218-2239**), no timeout fijo.
- `OLLAMA_CONNECT_TIMEOUT_MS = 3*60*1000` (23) — primer byte (carga de modelo en CPU lenta).
- `OLLAMA_MAX_CONNECT_ATTEMPTS = 3` (24).

**[FETO] Flujo del handler:**

1. Procesa adjuntos: imágenes → `base64Images`; texto → `textAttachmentsContext` truncado a 15 000 chars (**1734-1746**).
2. `openFilesContext` con bloque ```lang file="…"``` (**1748-1758**).
3. `hiddenSystemFiles` (MEMORIA.md + skills.md) concatenados al system instruction (**1764-1770**).
4. **Acciones rápidas PC deterministas** si `pcMode` (**1778-1781** → `handlePcQuickAction`).
5. Providers en cascada: **Gemini** (1784-1865), **OpenRouter** (1868-1935), **Custom/OpenAI-compat** (1938-2016), **Ollama** (2019-2280).
6. **Fallback autónomo** `generateAutonomousTechnicalResponse()` (2282-2316; función en **1393-1571**), marcado con `done` y modelo `"fallback-autonomous"` (**2316**).
7. `catch` → `ctx.sendError` (**2317-2320**).

**[FETO] Ollama con tool-calling:** `isToolCapableModel()` (**683-689**) filtra modelos que sí soportan tools (excluye granite/qwen a propósito, comentario 684-685). `runOllamaAgentLoop()` (**841-933**): máx. `maxSteps = 10` (**851**), `executeToolCall()` (**697-786**), anti-bucle si la misma herramienta+args se repite 3 veces (**884-894**), emite eventos `plan`/`update`/`action`. Al terminar, el texto se re-emite en trozos de 3 palabras con `sleepMs(15)` para simular streaming (**2087-2092**).

**[FETO] `pipeOpenAICompatibleStream()`** (**1660-1698**): parsea SSE `data:`, ignora `[DONE]`, emite `choices[0].delta.content`; compartido por OpenRouter y Custom.

### 1.4 Herramientas del agente (tool-calling) — idénticas en ambas versiones

**[FETO] `AGENT_TOOLS`** (sandbox) — `server.ts:309-408`: `list_files`, `read_file`, `write_file`, `run_command`, `set_plan`, `update_task`, `run_tests`.
**[FETO] `PC_TOOLS`** (PC real, vía puente :5000) — `server.ts:412-490`: `pc_info`, `pc_exec`, `pc_write_file`, `pc_read_file`, `pc_list_dir`, `pc_delete`.
**[FETO] Inyección condicional:** `pcMode ? [...AGENT_TOOLS, ...PC_TOOLS] : AGENT_TOOLS` (**2076**).
**[FETO] Protocolos textuales** añadidos al system prompt para modelos con tools (**2031-2049**): "PROTOCOLO DE AGENTE AUTÓNOMO" y "PROTOCOLO DE AGENTE PC".
**[FETO] `getOptimalNumCtx()`** (**260-274**): 65536 para cloud/70b+; 32768 para 13b-34b; 16384 para 7b-11b; 8192 por defecto.

---

## 2. Cadena de arranque Electron

### 2.1 `backend/electron-main.cjs` (369 líneas; **idéntico byte a byte en v3.3.2 y v1.4.0** — `diff` sin salida)

**[FETO] Constantes:** `IDE_URL = 'http://127.0.0.1:3000'` (**24**), `BOOT_TIMEOUT_MS = 6*60*1000` (**25**).
**[FETO] Estado:** `mainWindow`, `splashWindow`, `startedBat` ({pid} del BAT lanzado por el EXE), `backendFork` (**27-30**).

**[FETO] Secuencia `app.whenReady()` (306-350):**
1. `createSplash()` (**307**, definición 149-163) — splash con `nodeIntegration:true, contextIsolation:false` (**158**) e IPC `boot-status` (133-136).
2. Si `isServerUp(IDE_URL)` → conecta directo (309-311). `isServerUp` acepta `res.ok || res.status < 500` (**47**).
3. Si no: `findBatFile()` (**313**, definición 66-87) busca `iniciar_todo_windows.bat` subiendo hasta 5 niveles desde `dirname(exe)`, `app.getAppPath()` y `__dirname`.
4. **Fallback sin BAT:** `forkFallbackServer()` (**183-195**) spawnea `dist/server.mjs` con `ELECTRON_RUN_AS_NODE=1` y `PORT=3000`; prueba hasta 4 niveles de directorio (318-327).
5. **Polling:** `waitForServer(IDE_URL, BOOT_TIMEOUT_MS, onTick)` (**53-63, 338**) — reintenta cada **1000 ms**; el splash muestra segundos transcurridos.
6. `createMainWindow()` (**349**, definición 245-290).

**[FETO] Anti-pantalla-negro:** `showConnectionError()` (**201-243**) carga un HTML inline con botón "Reintentar" y auto-redirección cada 10 s (**226-232**). `tryLoad()` reintenta hasta 10 veces (**259-275**).

**[FETO] Ventana principal:** `webPreferences: { nodeIntegration:false, contextIsolation:true, sandbox:false }` (**252-256**); `setWindowOpenHandler` abre http externo con `shell.openExternal` y deniega el resto (**283-286**).

**[FETO] Instancia única:** `app.requestSingleInstanceLock()` (**295-304**).
**[FETO] Limpieza al salir (`before-quit`, 357-368):** mata SOLO `startedBat.pid` (`killTree`, 89-100) y `backendFork`; **no toca Ollama** (comentario 358).

### 2.2 BATs

| Archivo | v3.3.2 | v1.4.0 | Delta |
|---|---|---|---|
| `backend/iniciar_todo_windows.bat` | 4387 B, 115 líneas, **CRLF** | 3289 B, 88 líneas, **LF** | v3.3.2 añade paso 0 `where npm` + `npm install` automático (v3.3.2 líneas 29-50) y `start … /min` para Ollama (73). v1.4.0 arranca Ollama sin `/min` (47). v1.4.0 **quitó** la validación de npm y el auto-install |
| `backend/compilar_exe_windows.bat` | 2194 B, 2 pasos (build + electron-builder) | 4070 B, **4 pasos** | **v1.4.0 añade** verificación de Python (122-137), `build_backend.bat` PyInstaller (162-174) y salidas documentadas (187-204) |
| `backend/limpiar_ollama_windows.bat` | 2594 B | 2594 B (**idéntico**) | — |
| `backend/arrancar_cerebronico.bat` | **no existe** | 1414 B | **NUEVO en v1.4.0**: lanza Ollama y `npm run dev` en ventanas separadas (222-234) |
| `build_backend.bat` (raíz `ide/`) | 1376 B, `pyinstaller --onefile --add-data ".env;."` (283-285) | 3241 B, usa **`.spec`** `CerebroNicoAgent.spec` + `cerebronico_bridge.spec` (293, 304) | **v1.4.0 añade** el segundo EXE (`cerebronico_bridge.exe`) y verificación de artefactos (313-324) |

**[FETO] Arranque Ollama (v3.3.2 `iniciar_todo_windows.bat:73`):**
```
start "Ollama Engine (Puerto 11434)" /min cmd /k "set OLLAMA_ORIGINS=* && set OLLAMA_HOST=0.0.0.0:11434 && set OLLAMA_KEEP_ALIVE=-1 && ollama serve"
```
**[FETO] Espera activa** por `netstat -ano | findstr ":11434" | findstr "LISTENING"` con contador hasta 15 s (**77-91**).
**[FETO] El BAT NO arranca el puente :5000 ni el sandbox :3500** — los levanta `server.ts` (`startAgentBridge` en el arranque; sandbox bajo demanda/auto). Confirmado por el propio echo del BAT (v3.3.2 línea 100; v1.4.0 línea 74).

### 2.3 Especificaciones PyInstaller

| Spec | v3.3.2 | v1.4.0 |
|---|---|---|
| `ide/CerebroNicoAgent.spec` | `hiddenimports=[]`, `pathex=[]` | `hiddenimports=['backend','backend.app','backend.app.routers','backend.app.utils','backend.app.utils.env_manager']`, `pathex=['.']` |
| `ide/cerebronico_bridge.spec` | **no existe** | **NUEVO**; compila `backend/agent_bridge_5000.py` a `cerebronico_bridge.exe`, incluye `__init__.py` como `datas` |

**[INFERENCIA]** El `hiddenimports` de v1.4.0 corrige el fallo real de PyInstaller con paquetes cuyos `__init__.py` están vacíos (lo dice el comentario del propio spec: "Sin esto, el .exe compilado falla con ModuleNotFoundError"). Esto es una de las razones de que v1.4.0 esté "listo_compilar_exe".

---

## 3. Frontend

### 3.1 Inventario de componentes (`backend/src/`)

| Archivo | Líneas | Rol **[FETO]** |
|---|---|---|
| `App.tsx` | 1371 (v3.3.2) / ~1590 (v1.4.0, 52812→58026 B) | Orquestador raíz: estado global, streaming, adjuntos, sandbox auto-sync, import/export, ZIP |
| `main.tsx` | 70 | Bootstrap React (`createRoot`) |
| `components/Header.tsx` | 233 | Barra superior: modelo, provider, botón Agente PC, sonido |
| `components/ChatCenter.tsx` | 1015 | Chat, burbujas, tablero de tareas del agente, log de acciones |
| `components/LeftSidebar.tsx` | 840 | Menús/Puertos/Subagentes, configuración, memoria de idioma |
| `components/RightSidebar.tsx` | 1278 (v3.3.2) / ~1333 (v1.4.0) | **5 pestañas**: `sandbox · editor · deliverables · skills · terminal` (línea 218) |
| `components/CodeEditor.tsx` | 417 | Editor con Prism, pestañas de archivos |
| `components/ApiKeyModal.tsx` | 286 / 355 | "Ranuras de API Keys" (OpenRouter, Custom, **Gemini en v1.4.0**) |
| `components/ModelSelectorModal.tsx` | 503 / 640 | Catálogo de modelos + autodetección (v1.4.0) |
| `data/skills100.ts` | 835 | `SKILLS_LIST_100` (catálogo declarativo de 100 skills) |
| `data/skills50.ts` | 417 | `SKILLS_LIST_50` (subconjunto/legacy) |
| `types.ts` | 129 | Tipos (`ChatMessage`, `WorkspaceFile`, `ModelProvider`, `AgentTask`, …) |
| `constants.ts` | 56 / 57 | Puertos y claves localStorage (§3.3) |
| `index.css` | 3524 B | Estilos Tailwind |

### 3.2 Orquestador `App.tsx` — estado que maneja

**[FETO] Persistencia en localStorage al inicializar (149-244):**

| Estado | Línea | Clave |
|---|---|---|
| `messages` | 149 | `LS_KEYS.MESSAGES` |
| `savedChats` | 152 | `SAVED_CHATS` |
| `activeChatTitle` | 153 | `ACTIVE_CHAT_TITLE` |
| `agentTasks` (no persistido) | 154 | — |
| `actionLog` (no persistido) | 155 | — |
| `currentStreamingText`, `isStreaming` | 156-157 | — |
| `provider` | 160-163 | `PROVIDER` (valida gemini/openrouter/custom, si no → ollama) |
| `currentModel` | 164 | `CURRENT_MODEL` (def. `stablelm2:latest`) |
| `ollamaUrl` | 165 | `OLLAMA_URL` |
| `responseLanguage` | 166 | `RESPONSE_LANGUAGE` (def. `"es"`) |
| `expertMode` | 167 | `EXPERT_MODE` (def. `general`) |
| `openrouterApiKey` | 168 | `OPENROUTER_KEY` |
| `customServerUrl` / `customApiKey` | 169-170 | `CUSTOM_SERVER_URL` / `CUSTOM_API_KEY` |
| `pcMode` | 172 | `PC_MODE` (`"1"`) |
| `subagents` | 174 | — |
| `temperature` | 175-178 | `TEMPERATURE` (def. 0.5) |
| `availableModels` | 179 | — |
| `workspaceFiles` | 182 | `WORKSPACE_FILES` (def. `INITIAL_WORKSPACE_FILES` = MEMORIA.md, skills.md, server.ts…) |
| `activeFileId` | 183 | — (def. `"f-memoria"`) |
| `pendingAttachments`, `messageQueue` | 186-187 | — |
| `isLeftOpen/isRightOpen/leftWidth/rightWidth` | 228-237 | `LEFT_WIDTH`/`RIGHT_WIDTH` |
| `isModelSelectorOpen`, `isApiKeyModalOpen`, `isSoundMuted` | 240-242 | — |
| `maxRamGb`, `ramUsageMb` | 243-244 | — (`ramUsageMb` def. 76, **valor cosmético**) |
| `telemetry` | 285-290 | — |
| `terminalLogs` | 291-295 | — |
| `isReconnecting` | 387 | — |

**Refs clave:** `messageQueueRef` (188), `isStreamingRef` (190), `messagesRef` (192), `afterStreamRef` (196, hook del bucle build-fix), `buildFixRef` ({active,iteration,max:5}, 197-201), `streamerRef` (297, `HighPerformanceAIStreamer`).

**[FETO] Efectos de persistencia:** 204-206 (messages), 208-210 (savedChats), 212-214 (activeChatTitle), 216-218 (workspaceFiles), 220-225 (model/temp/provider/pcMode).

**[FETO] Polling global (427-437):** `checkTelemetry()` cada **10 s** (`/api/telemetry/ports`, 358-369) y `fetchSubagents()` cada **15 s** (`/api/subagents`, 372-382).

**[FETO] `handleReconnectAll()` (388-425)** — botón "Reconectar": `POST /api/bridge/restart` → `POST /api/telemetry/refresh` → `checkTelemetry()` → `fetchInstalledModels()`.

**[FETO] `executeSendMessage()` (484-642):** construye `contextPayload` con `buildContextCachePayload()` (501), llama `streamerRef.current.stream(...)` (517-533) con callbacks `onChunk/onTask/onDone/onError`. En `onDone`: crea mensaje assistant, extrae bloques de código con `extractCodeBlocksFromMessage()` + `mergeExtractedFiles()` (567-580), `autoLearnFromInteraction()` (584), desencola el siguiente mensaje (594-604) y ejecuta `afterStreamRef` (607-611).
**[FETO] `handleStopStreaming()` (672-675):** `streamerRef.current.abort()`.
**[FETO] Cola de mensajes:** si ya hay streaming, el envío se encola (644-659); `handleRemoveQueuedMessage` (664), `handleClearQueue` (668).
**[FETO] Carpeta de chats:** `handleNewChat` (738), `handleOpenChat` (755), `handleDeleteChat` (773), `handleRenameChat` (784) — delegando en `chatStorage.ts`.
**[FETO] Sesión:** `handleExportSession` (795-813) → JSON; `handleImportSession` (816-847); `handleDownloadZip` (849-860) → `generateProjectZip()`.
**[FETO] Sandbox:** `syncToDisk()` (863-882) → `POST /api/fs/sync`; `handleAutoSyncToSandbox()` (889-891, silencioso); `pullFromDisk()` (894-937) → `/api/fs/tree` + `/api/fs/read` filtrando `node_modules/`, `.git/`, `.zip`; `runBuild()` (944-954) → `npm install && npm run build` vía `/api/exec` con `timeoutMs:180000`.
**[FETO] Bucle autónomo build-fix:** `runBuildFixIteration()` (957-…), `max = 5` (200).

### 3.3 `constants.ts` — puertos y claves localStorage (COMPLETO)

**[FETO] Puertos (`src/constants.ts:16-30`):**

```ts
export const PORTS = { IDE: 3000, SANDBOX: 3500, BRIDGE: 5000, OLLAMA: 11434 } as const;
export const IDE_URL / SANDBOX_URL / BRIDGE_URL / OLLAMA_URL = http://127.0.0.1:<puerto>
```

**[FETO] Claves localStorage (v3.3.2 `constants.ts:35-55`, 19 claves):**
`MESSAGES: codigo0_messages`, `SAVED_CHATS: codigo0_saved_chats`, `ACTIVE_CHAT_TITLE: codigo0_active_chat_title`, `WORKSPACE_FILES: codigo0_workspace_files`, `PROVIDER: codigo0_provider`, `CURRENT_MODEL: codigo0_current_model`, `OLLAMA_URL: codigo0_ollama_url`, `TEMPERATURE: codigo0_temperature`, `PC_MODE: codigo0_pc_mode`, `RESPONSE_LANGUAGE: codigo0_response_language`, `EXPERT_MODE: codigo0_expert_mode`, `OPENROUTER_KEY: codigo0_openrouter_key`, `CUSTOM_SERVER_URL: codigo0_custom_server_url`, `CUSTOM_API_KEY: codigo0_custom_api_key`, `LEFT_WIDTH: codigo0_left_width`, `RIGHT_WIDTH: codigo0_right_width`, `SANDBOX_AUTO: codigo0_sandbox_auto`, `MEMORY_RULES: codigo0_memory_rules`, `LANGUAGE_MEMORY: codigo0_language_memory_entries`.

**[FETO] Delta v1.4.0 (`v1.4.0/.../src/constants.ts`, +1 línea tras 47):** `GEMINI_API_KEY: "codigo0_gemini_api_key"` → **20 claves**.

### 3.4 Utils

| Módulo | Líneas | Rol **[FETO]** |
|---|---|---|
| `storage.ts` | 37 | `loadJSON/saveJSON/loadString/saveString` con try/catch (cuota/JSON corrupto/incógnito) — 9-37 |
| `chatStorage.ts` | 41 | `deriveChatTitle` (12), `makeChatId` (21), `buildArchivedChat` (29) — lógica pura sin React |
| `codeParser.ts` | 96 | `extractCodeBlocksFromMessage()` (12) regex ```lang file="…"```; `mergeExtractedFiles()` (53) con `createdCount`/`updatedCount` |
| `fileParser.ts` | 150 | `generateProjectZip()` (11) con JSZip; **inyecta `package.json` con `dev: cross-env PORT=3500 tsx server.ts`** si falta (321-336) |
| `attachmentProcessor.ts` | 592 | `processUploadedFile()`; detección por mágic-bytes (PK/PNG/PDF, 140-144); DOCX (309), ZIP (369), PDF (504), RTF; saneamiento "anti-rombos" |
| `contextCache.ts` | 194 | `buildContextCachePayload()` (90-194); `DEFAULT_MEMORIA_MD` (45-61); `DEFAULT_SKILLS_MD` (63-68) generado desde `SKILLS_LIST_100`; `RESPONSE_LANGUAGES` (4-11); `EXPERT_MODES` (19-26); `buildExpertDirective` (28-43) con modos legal/médico/fraude/docs/código |
| `memory.ts` | 195 | `BASE_MEMORY_RULES` (32-269) — 6 reglas (idioma, formato de archivos, puertos, adjuntos, listas, anti-slop); `loadMemoryRules/saveMemoryRules/addMemoryRule`; `autoLearnFromInteraction` |
| `languageMemory.ts` | 190 | 12 categorías de memoria lingüística (1-12); `SEED_LANGUAGE_MEMORIES` con jerga ("hazlo", "púlelo") → acciones |
| `syntaxEngine.ts` | 193 | Prism.js + `SUPPORTED_LANGUAGES` (34+) con `snippetTemplate` por lenguaje; incluye `dockerfile` en la lista de lenguajes reconocidos (solo resaltado, no generación real) |
| `engine.ts` | 757 | `HighPerformanceAIStreamer` (165) con `abort()` (172), `tryDirectLocalOllamaStream` (188), `stream()` (487); `repairNumberedListsAndGaps` (49), `sanitizeRepetitiveLoop` (128), `isToolCapableModelName` (32), `isVisionModelName` (39) |

**[FETO] Política de contexto (`contextCache.ts`):** el historial se envía **completo, sin truncado artificial** (comentario 85-86; `fullHistory` 156-159). Los "archivos abiertos" se limitan a `activeFile` + hasta 4 `modified` (145) con truncados 16 000 / 8 000 chars. MEMORIA.md y skills.md se inyectan como `hiddenSystemFiles` **en cada turno** por el payload, pero el log de la UI los anuncia como "Turno 1" (`App.tsx:503-507`). **[INFERENCIA]** Hay una discrepancia cosmética entre el log ("Turno 1") y el envío real (todos los turnos).

**[FETO] Detección de la carpeta de mensajes:** `wantsMessagesFolder` (109-116) activa por frases "carpeta de mensaje(s)", "mensajes/", "historial de mensaje", "mensajes guardados".

---

*(continúa en el mismo archivo: secciones 4-9 y hallazgos V8)*

---

## 4. Sandbox (`/api/sandbox/*`, watchdog, auto-sync, auto-heal, killPortListeners, `.proyectos/`, :3500)

### 4.1 Núcleo del servidor

**[FETO] Constante:** `SANDBOX_PORT = Number(process.env.SANDBOX_PORT) || 3500` (`v3.3.2/.../server.ts:1071`; `v1.4.0/.../server.ts:1179`). El sandbox corre aparte de la IDE (:3000) por diseño (comentario 1068-1069).

**[FETO] Estado:** `sandboxProc` (1072) y `sandboxLogStream` (1073). **Se pierde al reiniciar el server** → de ahí el anti-zombie de v1.4.0.

**[FETO] `isPidAlive(pid)` (1075-1083):** `process.kill(pid,0)`; trata `EPERM` como vivo.
**[FETO] `isPortUp(port, timeoutMs=2000)` (1085-1095):** un `fetch` a `http://127.0.0.1:<port>`; **cualquier** respuesta HTTP cuenta como "arriba" (1091).
**[FETO] `readFileTail(logPath, maxBytes)` (1134-1147):** lee la cola con `openSync/readSync`.

**[FETO] `killPortListeners(port)` (1100-1131) — endurecido:**
- Windows: `netstat -ano | findstr :<port> | findstr LISTENING` (1103), parsea columnas `Proto Local Foreign State PID` (1108-1110), exige `TCP` (1111), `LISTENING` (1112), **puerto EXACTO al final** con `:${port}$` (1114) para no matar `:35000`, y `Number(pid) === selfPid` → skip (1115). Luego `taskkill /PID <pid> /T /F` (1120).
- *nix: `fuser -k <port>/tcp` (1125).

### 4.2 `POST /api/sandbox/start` (1149-1245)

**[FETO] Pasos:**
1. `sandboxAuthorized` (1150).
2. Si ya hay proceso vivo o puerto arriba → `{ok, alreadyRunning:true, online:true}` (1153-1155).
3. Exige `.proyectos/package.json` (1157-1161) → 400 con mensaje "Pulsa Sync".
4. `logPath = .proyectos/.sandbox_3500.log` (1163).
5. **Detección de auto-heal:** `needsInstall(logText)` (1168-1171) busca `/not found|Cannot find module|ERR_MODULE_NOT_FOUND|missing script|MODULE_NOT_FOUND|Cannot find package/i` en los últimos 3000 chars.
6. `spawnSandbox()` (1174-1208): en Windows `spawn("cmd.exe", ["/d","/s","/c",npmCmd,"run","dev"])` (1184) — **evita DEP0190** (comentario 1180-1181); en *nix `spawn("npm",["run","dev"], {detached:true})` (1194). Inyecta `env PORT=SANDBOX_PORT`, `SANDBOX_PORT`.
7. `waitPortOrDeath(maxMs)` (1210-1220): sondea el puerto cada 1500 ms o hasta que el proceso muera.
8. **Intento 1**: arranque directo, espera hasta **45 000 ms** (1223-1225).
9. **Intento 2 (auto-reparación)**: si murió y `needsInstall` → `npm install --no-audit --no-fund` con timeout **300 000 ms** (1234), marca `healed=true`, re-spawn y espera hasta **60 000 ms** (1237-1238).
10. Respuesta `{ok, pid, port, online, healed}` (1241).

### 4.3 `POST /api/sandbox/stop` (1247-1271)
**[FETO]** `taskkill /PID <pid> /T /F` en Win (1253); en *nix `process.kill(-pid,"SIGKILL")` con fallback (1256-1258); luego limpieza de huérfanos: si el puerto sigue arriba → `killPortListeners` (1267-1269). Devuelve `{ok, killed}`.

### 4.4 `GET /api/sandbox/status` / `logs`
**[FETO] status (1273-1284):** `{online: isPortUp(1500), port, running: isPidAlive, installed: existsSync(node_modules), hasProject: existsSync(package.json), root: PROJECT_ROOT}`.
**[FETO] logs (1286-1295):** cola de 16 KB del log.

### 4.5 Watchdog del sandbox en el frontend (`RightSidebar.tsx`)

**[FETO] Estados (306-321):** `sbOnline`, `sbInstalled`, `sbHasProject`, `sbBusy`, `sbLogs`, `iframeKey`, `sbAuto` (por defecto ON: `localStorage.getItem(SANDBOX_AUTO) !== "0"`, 314), `sbPhase` (idle|sync|install|start|wait|live|error), refs `sbAutoRef`, `sbOnlineRef`, `sbWorkingRef`, `everLiveRef`, `sbPhaseRef`.
**[FETO] Persistencia de `sbAuto`** (327-331).
**[FETO] `sandboxAutoPilot()` (363-434)** — flujo completo: sync (371-376) → `npm install` si `!installed` (381-399, vía `/api/exec` con `timeoutMs:300000`) → `/api/sandbox/start` (401-410) → espera hasta **60 000 ms** sondeando cada **2500 ms** (413-423).
**[FETO] Watchdog periódico (447-479):** cada **8 000 ms** consulta `/api/sandbox/status`; si `!online` y hay AUTO → `sandboxAutoPilot()`. Guard explícito: un `!r.ok` lanza error y **no** se interpreta como caída (453-455) — antes generaba bucle de autopiloto.
**[FETO] Auto-sync con debounce (481-501):** `setTimeout(..., 2500)` cancelando el timer previo (`clearTimeout`, 490) ante cambios de `files`; silencioso (`onAutoSync`), sin log (494). Ignora el primer render (`firstFilesRenderRef`, 483-488).
**[FETO] Botones manuales:** `handleSandboxInstall` (503-528), `handleSandboxStart` (530-554), `handleSandboxStop` (556-568), `openSandboxExternal` (570-572).
**[FETO] Preview:** `<iframe src={SANDBOX_URL} sandbox="allow-scripts allow-same-origin allow-forms allow-popups">` (**785-788**) y `iframeKey` para forzar recarga (311, 545, 348).

### 4.6 Plantilla de workspace `.proyectos/`

**[FETO] Ruta base:** `PROJECT_ROOT = process.env.PROJECT_DIR || path.join(process.cwd(), ".proyectos")` (`server.ts:29`), creada con `mkdirSync recursive` (30-32). `.gitignore` la excluye (`backend/.gitignore`).
**[FETO] Contenido real (v3.3.2) — plantilla Express+TS ejecutable:**

```
.proyectos/MEMORIA.md              1476 B
.proyectos/README.md                556 B
.proyectos/skills.md              16370 B (300 líneas, 100 skills)
.proyectos/package.json            1172 B  → dev: "cross-env PORT=3500 tsx server.ts"
.proyectos/server.ts                978 B
.proyectos/index.html                24 B
.proyectos/tsconfig.json            275 B
.proyectos/package-lock.json     157817 B
.proyectos/src/server.ts           2306 B
.proyectos/src/models/User.ts
.proyectos/src/routes/userRoutes.ts
.proyectos/src/utils/markdownStore.ts
.proyectos/dist/server.js, dist/models/User.js, dist/routes/userRoutes.js, dist/utils/markdownStore.js
```

**[FETO]** El `package.json` de la plantilla usa `cross-env PORT=3500` y `cors` (`.proyectos/package.json:9,18`) → si el usuario no ha hecho `npm install`, falla con "cross-env: not found", que es exactamente el patrón que dispara `needsInstall` (1168-1171). **[INFERENCIA]** El doble sandbox+sed de puerto 3500 es coherente: la IDE :3000 nunca colisiona.

**[FETO] En v1.4.0 NO existe `ide/backend/.proyectos/`** (ausente en el árbol, verificado). Es decir: v1.4.0 se distribuye **sin plantilla de sandbox**; el sandbox solo funciona si el usuario sincroniza el workspace primero (o si se genera por el ZIP). **[INFERENCIA]** Regresión de empaquetado respecto a v3.3.2 (donde el sandbox arranca en el primer intento porque la plantilla ya está escrita en disco).

---

## 5. Puente `:5000` (`backend/agent_bridge_5000.py`, 475 líneas — **idéntico byte a byte en v3.3.2 y v1.4.0**)

### 5.1 Cómo se lanza (desde `server.ts`)

**[FETO] `startAgentBridge()` (`v3.3.2/.../server.ts:62-237`; v1.4.0 equivalente):**
1. `scriptPath = process.cwd()/agent_bridge_5000.py`; si no existe → no auto-inicia (63-67).
2. **Sonda de intérprete (62-98):** `pythonBin = process.platform === "win32" ? "python" : fs.existsSync("/usr/bin/python3") ? "python3" : "python"` (69). Comprueba con `where <bin>` / `command -v <bin>` y luego `"<bin>" --version` (75-79).
3. **Fallback EXE (81-93):** candidatos `../dist/CerebroNicoAgent.exe` y `./dist/CerebroNicoAgent.exe`; `const useExe = !pythonOk;` (93).
4. Si ni Python ni EXE → warning y `return null` (87-92).
5. **Log del puente:** `.bridge_5000.log` (100); stdout/stderr del hijo se vuelcan ahí (138-151).
6. **Auto-restart:** hasta `MAX_RESTARTS = 5` con 1 s de espera (110, 156-166); `userCancelled` evita reinicios al matar a propósito (111, 155).
7. **Health-check:** hasta 16 intentos × 500 ms a `http://127.0.0.1:5000/health` con `AbortController` de 800 ms (174-185).
8. **`restart()`** (193-223): mata hijo, espera 800 ms, re-spawn, re-health-check; usado por `/api/bridge/restart`.
9. **`kill()`** (226-234) cierra el stream de log; se invoca en `shutdown` (SIGINT/SIGTERM, 2371-2381).

**[FETO] spawn:** `env: { ...process.env, PORT:"5000", HOST:"127.0.0.1" }` (121, 127).

### 5.2 Endpoints del puente

**[FETO] Servidor:** `ThreadingTCPServer(ThreadingMixIn, socketserver.TCPServer)` con `daemon_threads=True`, `allow_reuse_address=True` (438-441); `run_server()` (444-470) escucha `HOST:PORT` (def. `127.0.0.1:5000`, 31-32).

| Método | Ruta(s) | Línea | Qué hace |
|---|---|---|---|
| GET | `/`, `/status`, `/health`, `/api/status`, `/api/health` | 214-227 | `{status:"online", agent, runtime, pythonSupport, pcAccess, port, uptime, timestamp}` |
| GET | `/api/ollama-tags`, `/api/ollama/tags` | 230-239 | Proxy a `127.0.0.1:11434/api/tags` (timeout 3 s) |
| GET | `/api/pc`, `/api/pc/info` | 242-247 | `get_pc_info()` (100-113): `os, osRelease, arch, username, home, desktop, temp, cwd, python, machine` |
| GET | `/api/subagents` | 250-255 | `get_subagents()` (116-154) |
| POST | `/api/agent`, `/api/generate` | 270-284 | Si trae `command` → `_run_command`; si no, respuesta de eco |
| POST | `/api/exec` | 287-300 | Ejecuta comando; timeout acotado `max(1, min(timeout,300))` (297) |
| POST | `/api/fs/write` | 303-317 | Escribe archivo real (crea dirs); `resolve_pc_path` (57-88) |
| POST | `/api/fs/read` | 319-330 | Lee archivo (trunca a 200 000 chars, 325) |
| POST | `/api/fs/list` | 332-358 | Lista carpeta (máx. 500 entradas, 347) |
| POST | `/api/fs/delete` | 360-374 | `shutil.rmtree` (dir) u `os.remove` (archivo) |
| POST | `/api/python` | 377-397 | Escribe código en `temp_exec_<ms>.py`, lo ejecuta con `sys.executable`, borra el temp |
| — | *(cualquier otra)* | 257 / 399 | 404 JSON |

**[FETO] CORS del puente (162-208):** `Access-Control-Allow-Origin: *`, `Allow-Methods: GET, POST, OPTIONS, PUT, DELETE`, `Allow-Headers: *`, `Allow-Private-Network: true`, `Max-Age: 86400`; `do_OPTIONS` responde 204. **[INFERENCIA]** Este `*` es necesario si el navegador habla directo con :5000; pero también expone el puente a cualquier página web abierta en la máquina.
**[FETO] `resolve_pc_path()` (57-88):** soporta `~`, `Desktop|escritorio|OneDrive\Desktop`, `Documents|docs|documentos`, `Downloads|descargas`, rutas absolutas. **No restringe a un directorio raíz**: una ruta absoluta pasa tal cual (88).
**[FETO] `_run_command()` (401-431):** `subprocess.run(..., shell=True, timeout, encoding="utf-8")`; devuelve `{success, content, output, error, returncode}`.
**[FETO] Robustez Windows (35-51):** fuerza UTF-8 en stdout/stderr para no crashear con emojis (CP1252).
**[FETO] Puerto ocupado (456-467):** mensaje de ayuda `netstat … / taskkill` o `fuser -k`.

### 5.3 Agente Python FastAPI (backend `app/`)

**[FETO] v3.3.2 (`backend/app/main.py`, 87 líneas):** FastAPI "Agente de Configuración – Puerto 5001" (17); CORS **restringido** a `http://localhost:3000`, `http://127.0.0.1:3000`, `http://0.0.0.0:3000` (25-37); endpoints `POST /env/update` (47) y `POST /file/create` (63). `/file/create` **restringe escritura al Escritorio** (`target_path.startswith(desktop_path)`, 74-75). Carga `.env` con `load_dotenv(dotenv_path=…/ide/.env)` (11).

**[FETO] v1.4.0 (`backend/app/main.py`, 57 líneas) — reestructurado:** versión declarada `"v3.3.2"` (21, *string* desactualizada) y `os.getenv("CEREBRONICO_VERSION","v3.3.2")` (56); CORS **abierto** `allow_origins=["*"]` (32); routers en `backend/app/routers/`:
- `ping.py` → `GET /ping` (12)
- `env.py` → `GET /env/{key}` (19) y `POST /env` (33)
- `file.py` → `POST /file/read` (15) — **lectura arbitraria de rutas** (`open(payload.path)`, 26) sin restricción de directorio
- `health.py` → `GET /health` (12) — **presente pero NO registrado** (comentado en `main.py:14`)

**[FETO] `app/utils/env_manager.py`** (ambas versiones): `ENV_PATH = parents[2] / ".env"` (8); `get_env_variable` (21), `set_env_variable` (42) con regex `^KEY\s*=.*$` (52).

---

## 6. Seguridad

### 6.1 CORS

| Componente | Estado | Evidencia |
|---|---|---|
| **server.ts (IDE :3000)** | **SIN CORS** en ambas versiones | Dep `cors` declarada (`package.json:23`, `@types/cors`), pero **no se importa ni se aplica**: único middleware = `express.json/urlencoded` (`v3.3.2 server.ts:951-952`; `v1.4.0 server.ts:1056-1057`). Grep `cors\|Access-Control` en server.ts no devuelve middleware |
| **agent_bridge_5000.py (:5000)** | `Access-Control-Allow-Origin: *` | Líneas 165-169, 186-188, 197-208 |
| **app/main.py :5001** | v3.3.2 restringido a localhost:3000; **v1.4.0 `["*"]`** | v3.3.2 25-37; v1.4.0 30-36 |

**[INFERENCIA]** La ausencia de CORS en :3000 es intencional: la UI se sirve same-origin desde el propio Express (Vite middleware dev / `express.static` prod, 2354-2366). El CORS del puente y del FastAPI es para acceso cross-origin navegador→:5000/:5001.

### 6.2 `ACCESS_TOKEN` y `sandboxAuthorized`

**[FETO] Guard (`v3.3.2 server.ts:41-48`; idéntico en v1.4.0):**

```ts
function sandboxAuthorized(req: Request): boolean {
  const token = process.env.ACCESS_TOKEN;
  if (!token) return true;                 // ← sin token => TODO autorizado
  const provided = String(req.headers["x-access-token"] || "") ||
    String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return provided === token;
}
```

**[FETO]** Se aplica a: `sandbox/start` (1150), `sandbox/stop` (1248), `sandbox/status` (1274), `sandbox/logs` (1287), `exec` (1298), `fs/write` (1313), `fs/sync` (1328), `fs/read` (1348), `fs/tree` (1361).
**[FETO]** **NO** se aplica a: `/api/ai/stream`, `/api/bridge/restart`, `/api/telemetry/refresh`, `/api/telemetry/ports`, `/api/subagents`, `/api/ollama/models` (v1.4.0 también `/api/gemini/models`, `/api/openrouter/models`).
**[FETO] `ACCESS_TOKEN` no está definido en ningún `.env`** (grep sobre `v3.3.2/ide/backend/.env` y `v1.4.0/ide/backend/.env`: sin coincidencias) → **todos los guards devuelven `true`**. **[INFERENCIA] Hallazgo crítico:** en la configuración de entrega, `/api/exec`, `/api/fs/write` y `/api/sandbox/*` quedan **sin autenticación** en `127.0.0.1:3000`. Mitigante: `HOST` por defecto `127.0.0.1` (`server.ts:36`), pero `vite.config.ts:9` usa `host:"0.0.0.0"` para el dev-server de la UI y el BAT arranca Ollama con `OLLAMA_HOST=0.0.0.0:11434`.

### 6.3 Restricciones de rutas

**[FETO] `resolveSafePath()` (`server.ts:50-57`):**

```ts
const abs = path.resolve(PROJECT_ROOT, relPath);
const rel = path.relative(PROJECT_ROOT, abs);
if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Ruta fuera del proyecto no permitida.");
```

**[FETO] Se aplica en:** `/api/exec` (cwd, 1304), `/api/fs/write` (1318), `/api/fs/sync` (1335), `/api/fs/read` (1352) y en las herramientas del agente `read_file`/`write_file` (726, 731).
**[FETO] NO se aplica en:** `list_files`/`/api/fs/tree` (recorren `PROJECT_ROOT` directamente, 722/1386) — no hay riesgo de escape porque no aceptan ruta de entrada.
**[INFERENCIA]** El guard es correcto para path traversal clásico (`../`), pero **no** cubre symlinks dentro del sandbox que apunten fuera. `path.resolve` no resuelve symlinks (a diferencia de `realpath`).

**[FETO] Escrituras arbitrarias del corpus:** `requirements.txt` de v3.3.2 (`v3.3.2/ide/requirements.txt:1`) contiene literalmente la línea ``` ```text file="requirements.txt" ``` — es decir, el archivo se guardó con el **fence markdown** del agente pegado. **[INFERENCIA]** `pip install -r requirements.txt` fallaría; síntoma de que un entregable generado se volcó tal cual a disco (el mismo bug que documenta `codeParser.ts`).

### 6.4 Credenciales en el repo

**[FETO] `v3.3.2/ide/.env` contiene claves REALES en texto plano:**

```
GEMINI_API_KEY=AQ.Ab8R…[REDACTADA-v1.16.1]
OPENROUTER_API_KEY=sk-or-v1-6b85…[REDACTADA-v1.16.1]
ZAI_API_KEY=78d3b88a…[REDACTADA-v1.16.1]
NEXT_PUBLIC_PORT=3000 · BACKEND_PORT=5001 · JWT_SECRET=changeme_very_secret_key · JWT_EXPIRES_IN=3600
```

> **REDACTADAS (v1.16.1):** los valores completos de las tres claves fueron eliminados de ESTE
> fichero (y de todas sus copias del espacio de trabajo). La auditoría sigue documentando la
> fuga sin reeditar la credencial: citar el secreto entero no es evidencia, es una segunda
> filtración. Esas claves deben considerarse **COMPROMETIDAS**: revócalas en Google AI Studio,
> OpenRouter y Z.ai aunque v1.4.0 ya las quitara del `.env` — una clave que viajó en un zip
> distribuido no se «retira», se revoca.

**[FETO] `v3.3.2/ide/backend/.env`:** `GEMINI_API_KEY=NUEVA_CLAVE_GEMINI` (placeholder).
**[FETO] v1.4.0:** `ide/.env` = `TEST_VAR=initial` (solo); `ide/backend/.env` = `GEMINI_API_KEY=NUEVA_CLAVE_GEMINI` → **la clave real se eliminó en v1.4.0**. **[INFERENCIA]** Corrección de fuga entre versiones, pero rota `getGenAI()` sin `?key`/`x-gemini-key` (v1.4.0 permite pasarla desde el modal).
**[FETO]** `.gitignore` (`backend/.gitignore`) incluye `.env` y `.env.local`, pero el `.env` raíz de `ide/` **sí** viaja en el paquete (el spec y `extraResources` lo incluyen; `package.json` `build.files` lista `.env`).
**[FETO] `JWT_SECRET=changeme_very_secret_key`** en `.env` — nunca se usa en server.ts (grep sin coincidencias) → configuración residual de otro proyecto.

### 6.5 `npm audit` (según MEMORANDUM)

**[FETO] `v3.3.2/ide/MEMORANDUM.md:104`:** "Versión del paquete npm: **1.3.2** · `npm audit`: **0 vulnerabilidades**."
**[FETO] `v3.3.2/ide/MEMORANDUM.md:153`** (histórico): "v3.3.1 | Seguridad | 14 vulnerabilidades npm → 0 (electron 44.3.0, builder 26.15.3), BATs CRLF, credenciales."
**[FETO] Mecanismo de mitigación declarado:** `overrides.qs: "^6.16.0"` en `package.json` (ambas versiones) + `@types/express ^5` con `express ^4.21.2`.
**[INFERENCIA]** No se ha re-ejecutado `npm audit` en esta auditoría (solo lectura). La afirmación "0 vulnerabilidades" es **documental**, no verificada aquí. No hay `helmet`, ni CSP, ni rate-limiting.

### 6.6 Superficie de riesgo resumida

| Riesgo | Severidad | Evidencia |
|---|---|---|
| `/api/exec` sin token en la práctica | Alta (local) | `server.ts:1298` + `.env` sin `ACCESS_TOKEN` |
| Puente `:5000` con CORS `*` y ejecución shell sin auth | Alta (local/red) | `agent_bridge_5000.py:165-169, 287-300, 401-431` |
| `app/main.py` v1.4.0 CORS `*` + `POST /file/read` sin sandbox | Media | `v1.4.0/.../main.py:32`, `routers/file.py:15-26` |
| Claves reales en `.env` versionado | Alta | `v3.3.2/ide/.env` |
| `window.open`/iframe sandbox con `allow-same-origin` + `allow-scripts` | Media | `RightSidebar.tsx:788` |
| Electron: `sandbox:false` en la ventana principal | Baja/Media | `electron-main.cjs:255` |
| `JWT_SECRET=changeme` residual | Baja | `v3.3.2/ide/.env` |

---

## 7. v1.4.0 vs v3.3.2 — tabla de diferencias concretas

### 7.1 Paquete y metadatos

| Aspecto | v3.3.2 | v1.4.0 |
|---|---|---|
| `package.json version` | **1.3.2** | **1.4.0** |
| `name` | `codigo-0-cerebronico` | idéntico |
| `scripts` | idénticos (`dev/build/start/lint/test:e2e/dist`) | idénticos |
| `dependencies` | 15 (incl. `cors`, `express@4.21.2`, `electron 44.3.0`) | idénticas (byte a byte casi) |
| `build.extraResources` | **ausente** | **9 recursos** (exe del agente, exe del puente, `agent_bridge_5000.py`, `app/`, `.env` del backend, requirements, los dos `.spec`, `build_backend.bat`, `iniciar_todo_windows.bat`) |
| `build.nsis` | **ausente** | `oneClick:false`, `perMachine:false`, `allowToChangeInstallationDirectory:true`, desktop/start-menu shortcuts |
| `bun.lock` | 77 388 B | 116 041 B (deps regeneradas) |
| `requirements.txt` | **corrupto** (fence markdown, ver §6.3) | limpio (4 líneas) |
| `ide/COMPILACION_EXE.md` | no existe | **8 292 B** guía completa |
| `ide/cerebronico_bridge.spec` | no existe | **NUEVO** |
| `ide/backend/arrancar_cerebronico.bat` | no existe | **NUEVO** |
| `ide/backend/#` | no existe | **fichero basura de 0 B** (creado por error) |
| `ide/backend/.proyectos/` | **presente** (plantilla completa) | **ausente** |
| `ide/dist/` | `CerebroNicoAgent.exe` (15.5 MB) | `CerebroNicoAgent.exe` (15.5 MB) + **`cerebronico_bridge.exe` (9.26 MB)** |
| `ide/backend/dist/server.mjs` | 74 529 B + `.map` | 78 735 B (**sin `.map`**) |
| `server.ts` | 2 384 líneas | 2 524 líneas (**+140**) |

### 7.2 Cambios funcionales en `server.ts` (6 hunks de diff)

| # | Cambio | v3.3.2 | v1.4.0 | Líneas v1.4.0 |
|---|---|---|---|---|
| 1 | **`getGenAI(explicitKey?)`** con cache por key + try/catch | `getGenAI()` sin args, solo `process.env.GEMINI_API_KEY` | acepta key del request; reutiliza cliente si no cambió | 944-959 |
| 2 | **`registerModelDiscoveryRoutes(app)`** | — | **+2 endpoints** `GET /api/gemini/models` (973) y `GET /api/openrouter/models` (1016); filtra `flash` y `:free`; añade modelo virtual `openrouter/free` | 968-1051 |
| 3 | Registro de esas rutas | — | `registerModelDiscoveryRoutes(app)` dentro de `startServer()` | 1060 |
| 4 | **Anti-zombie del sandbox** | — | limpia `sandboxProc` muerto; si `:3500` está ocupado por proceso externo → `killPortListeners` + espera hasta 5 s | 1271-1286 |
| 5 | **`HOST=0.0.0.0`** en el entorno del sandbox | solo `PORT`/`SANDBOX_PORT` | `sandboxEnv` con `HOST:"0.0.0.0"` | 1310-1315 |
| 6 | Handlers `exit`/`error` del proc del sandbox | — | limpian `sandboxProc` si coincide (anti-zombie) | 1331-1338 |
| 7 | `geminiApiKey` en el body de `/api/ai/stream` | — | destructuring + `getGenAI(geminiApiKey)`; añade `gemini-2.5-flash-lite` a `candidateModels` | 1849, 1920, ~1948 |

**[FETO] `diff` de `electron-main.cjs`: sin salida** (369 líneas idénticas). Igual para `vite.config.ts`, `index.html`, `tsconfig.json`, `app/utils/env_manager.py`, `agent_bridge_5000.py`, `tests/*.py`.

### 7.3 Cambios en el frontend v1.4.0

| Archivo | Delta |
|---|---|
| `App.tsx` | +`geminiApiKey` state + persistencia `GEMINI_API_KEY`; `useEffect` de persistencia de `OPENROUTER_KEY`; `isDetectingGemini/OpenRouter`, `detectedGeminiModels/detectedOpenRouterModels`; `fetchGeminiFreeModels()` y (análogo) OpenRouter |
| `constants.ts` | `+ GEMINI_API_KEY: "codigo0_gemini_api_key"` |
| `ApiKeyModal.tsx` | +props Gemini (`onUpdateGeminiApiKey`, `onDetectGeminiModels`, `isDetectingGemini`), botones de autodetección, `showGeminiKey`, copy de OpenRouter actualizado a ":free" |
| `ModelSelectorModal.tsx` | +`detectedGeminiModels/detectedOpenRouterModels` + refresh; **inserción forzada del modelo virtual `openrouter/free`** al inicio del catálogo |
| `RightSidebar.tsx` | **anti-bucle con backoff exponencial** en el autopiloto: `sbRetryCountRef`, `sbNextRetryAtRef` (1s→2s→4s→8s…→60s); reseteo del contador al éxito |
| `engine.ts` | +`geminiApiKey?: string` en `StreamConfig` y su envío |

### 7.4 ¿Qué es `dist/` (backend/dist) y qué trae "listo_compilar_exe"?

**[FETO] `backend/dist/` = salida del `npm run build`** (`package.json` script `build`): `vite build` genera `dist/index.html` + `dist/assets/*` (UI compilada) y `esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs`. Contenido verificado:
- v3.3.2: `server.mjs` (74 529 B), `server.mjs.map` (140 853 B), `index.html`, `assets/index-BJaeoiR6.js`, `assets/index-ByndeFdR.css`, `assets/pdf.worker.min-*.mjs`, `assets/__vite-browser-external-*.js`.
- v1.4.0: `server.mjs` (78 735 B), `index.html`, `assets/index-mV7DUEpQ.js`, `assets/index-yEwzW3K6.css`, `pdf.worker.min-*.mjs`, `__vite-browser-external-*.js` (**sin `.map`** → no se distribuye el sourcemap del servidor).

**[FETO] Cadena de compilación del EXE:**
- v3.3.2 `compilar_exe_windows.bat`: `[1/2] npm run build` (153-159) + `[2/2] npm run dist` (162-168). **No compila el agente Python.**
- v1.4.0 `compilar_exe_windows.bat`: `[1/4] npm install` → `[2/4] npm run build` → `[3/4] build_backend.bat` (PyInstaller, 164-174) → `[4/4] npm run dist` (178-184). Verifica Python (122-137) y avisa si falta (las salidas documentadas 187-204).

**[FETO] Lo que "listo_compilar_exe" añade sobre v3.3.2:**
1. Los **dos EXE Python fallback** (`CerebroNicoAgent.exe` + `cerebronico_bridge.exe`) compilados y empaquetados vía `extraResources` (para PCs sin Python).
2. Los **`.spec` con `hiddenimports` + `datas`** que hacen que el EXE Python arranque (corrige `ModuleNotFoundError`).
3. `requirements.txt` limpio (reparable con `pip install`).
4. Verificación de Python en el BAT y mensajes de error claros.
5. `nsis` completo (instalador con selector de carpeta/shortcuts) — el `electron-builder` no falla por esquema.
6. Guía `COMPILACION_EXE.md`.
7. `arrancar_cerebronico.bat` (launcher standalone sin la UI Electron).
8. Puente `:5000` con **fallback EXE real** (`useExe`) efectivamente presente en `dist/`.

**[INFERENCIA] Lo que v1.4.0 pierde respecto a v3.3.2:** la plantilla `.proyectos/` (§4.6), `server.mjs.map`, y la validación npm+auto-install del `iniciar_todo_windows.bat` (v1.4.0 no comprueba npm ni instala dependencias). Además `main.py` declara `version="v3.3.2"`.

---

## 8. Memoria de proyecto (`.proyectos/MEMORIA.md`, `skills.md`) — ¿implementado o aspiracional?

### 8.1 `MEMORIA.md`

**[FETO] `v3.3.2/ide/backend/.proyectos/MEMORIA.md` (16 líneas)** define: rol, tema "Obsidian Deep Black", idioma español, historial completo, acceso a carpeta de mensajes, **triangulación de puertos** (3000/3500/5000/11434), formato de bloques ```lang file=```, saneamiento de adjuntos, continuidad de listas, y la línea 16: *"100 Capacidades Activas: Orquestación multi-modelo, anti-bucles, AST engine, Wasm, testing, inspección de seguridad, criptografía y empaquetado ZIP instantáneo."*
**[FETO]** Este texto también está embebido como `DEFAULT_MEMORIA_MD` en `backend/src/utils/contextCache.ts:45-61`, y como archivo semilla en el workspace inicial de `App.tsx` (`INITIAL_WORKSPACE_FILES`).

### 8.2 `skills.md` (300 líneas, 100 skills)

**[FETO] Fuente de verdad:** `backend/src/data/skills100.ts` → `SKILLS_LIST_100` (835 líneas, 100 objetos `{id,title,desc,category,badge,status,triggerCommand}`), con categorías `Núcleo, Inferencia, Parsing, Red, Memoria, Build, Automatas, Seguridad, Visión, Testing, AST & Kernel, Cripto & RAG, DevOps`. `skills.md` se **genera** desde ahí (`contextCache.ts:63-68`).

**[FETO] Verificación de implementación real — muestra representativa de las 100 skills:**

| Skill (skills.md / skills100.ts) | ¿Implementada en el código? | Evidencia |
|---|---|---|
| #1 Autonomía y Persistencia (MEMORIA.md) | **PARCIAL** | MEMORIA.md se inyecta (`contextCache.ts:161-164`); "actualización de telemetría sin intervención" no existe |
| #2 Extractor de Adjuntos Seguro JSZip | **SÍ** | `attachmentProcessor.ts` (DOCX 309, ZIP 369, RTF ~106, saneado) + `fileParser.ts:11` |
| #3 Triangulación de puertos 3000/5000/11434 | **SÍ** | `constants.ts:16-25`; `server.ts:1071`; MEMORIA.md:8-12 |
| #4 Anti-bucles (repeat_penalty 1.15) | **SÍ** | `server.ts:816, 2130` (`repeat_penalty:1.15`, `repeat_last_n:128`); anti-loop de tools `884-894`; `engine.ts:128` |
| #5 Context window dinámico (num_ctx 4k-16k) | **SÍ (matizado)** | `getOptimalNumCtx` `server.ts:260-274` — el rango real es **8192-65536**, no "4k a 16k" |
| #7 Empaquetador ZIP en memoria | **SÍ** | `fileParser.ts:11` `generateProjectZip` con JSZip; `App.tsx:849` |
| #8 Multimodal Vision/OCR (glm-ocr, smolvlm2) | **PARCIAL** | `isVisionModelName()` `server.ts:691-695` + `userMsg.images` (2068-2070). No hay pipeline OCR propio |
| #10 Streaming SSE a 60FPS con rAF | **SÍ** | `engine.ts` `HighPerformanceAIStreamer` con `rafId`/`requestAnimationFrame` (170, 396) |
| #11/#12 Sandbox Live Preview en :3500 | **SÍ** | `RightSidebar.tsx:785-788`; `server.ts:1149` |
| #13 Fallback autónomo | **SÍ** | `generateAutonomousTechnicalResponse` `server.ts:1393-1571` |
| #16 Orquestación multi-modelo | **SÍ** | Providers Gemini/OpenRouter/Custom/Ollama en `/api/ai/stream` (1784-2280) |
| #17 "Proxy inverso con health check y retroceso exponencial" | **PARCIAL** | Hay health-checks (`/health`, 174-185) y reintentos con backoff lineal (`150*(attempt+1)`, 165/826); el **backoff exponencial** solo aparece en el autopiloto del sandbox de v1.4.0 |
| #18 Autocompletado y snippets | **SÍ** | `syntaxEngine.ts` `SUPPORTED_LANGUAGES[].snippetTemplate` |
| #19 Sanitizador de rombos/encoding | **SÍ** | `attachmentProcessor.ts` saneado + `chatStorage` trim |
| #20 Reparador de listas numeradas | **SÍ** | `engine.ts:49` `repairNumberedListsAndGaps` |
| #71 "Parser de AST GraphQL" | **NO** | Sin parser GraphQL en el código |
| #72 "JWT RS256" | **NO** | `JWT_SECRET` en `.env` nunca usado; sin `jsonwebtoken` en deps |
| #73 "Pipeline WebAudio/FFT" | **NO** | Sin `AudioContext` en el frontend |
| #75 "ReDoS Shield / RegEx AST" | **NO** | No hay análisis de regex |
| #78 "Compresión LZ4/Gzip en navegador" | **NO** | Solo `jszip` para ZIP |
| #79 "Monitor GPU WebGL/WebGPU" | **NO** | Sin `navigator.gpu`/WebGL telemetry |
| #80 "Generador de certificados TLS" | **NO** | Sin `node-forge`/`openssl` |
| #81 "Detección de objetos YOLO" | **NO** | Sin runtime YOLO |
| #83 "Migraciones de BD Up/Down" | **NO** | Sin capa de BD |
| #88 "PDF vectorial en memoria" | **NO** | `pdfjs-dist` es **lectura**, no generación |
| #92 "Validador de headers CSP/HSTS" | **NO** | No hay CSP en la app |
| #94 "Monitor de temperatura/GPU throttling" | **NO** | `ramUsageMb` es un valor fijo (76, `App.tsx:244`) |
| #98 "Pipelines CI/CD GitHub Actions" | **NO** | Sin generación de workflows |
| #99 "Redux/Zustand time-travel" | **NO** | No hay Redux/Zustand (estado por `useState`) |
| #100 "Matriz Ultra-Avanzada 'CerebroNico x100 Obsidian' (x100 Obsidian)" | **ASPIracional** | Es una entrada de catálogo; el único vínculo con código es el string "Obsidian" en `MEMORIA.md:4` (`contextCache.ts:48`) y el placeholder del buscador `RightSidebar.tsx:1077` ("ej: ast, wasm, rag, parsing, kernel, crypto") |

**[FETO] Búsquedas dirigidas solicitadas (código, excluyendo los ficheros de datos):**
- `"x50"` → 0 coincidencias en código propio (solo apareció en `attachmentProcessor.ts` por falso positivo `0x50` = byte mágico `P` de ZIP/PDF).
- `"Obsidian"` → 1 uso real: `contextCache.ts:48` (tema visual en MEMORIA.md). No hay motor de grafos/Obsidian.
- `"vectoriz"` → **0 coincidencias en todo el árbol** (no hay base vectorial ni embeddings; la skill de RAG no existe).
- `"wasm"` → **0 implementaciones**. Solo texto en `contextCache.ts` (dentro del string MEMORIA.md) y en el placeholder de búsqueda `RightSidebar.tsx:1077`.
- `"dockerfile"` → solo en `syntaxEngine.ts` como lenguaje reconocido para **resaltado** (no hay generador de Dockerfiles).
- `"cripto"/"crypt"` → solo `RightSidebar.tsx` (nombre de categoría de filtro, 1097) y el string de MEMORIA.md.

**[FETO] Conclusión §8:** de las 100 skills, **~20-25 tienen implementación real verificable** (las de Núcleo/Parsing/Inferencia/Red básicas y las de UI/sandbox). El bloque **Seguridad, DevOps, Cripto & RAG, AST & Kernel, y las avanzadas de Visión/Testing es mayoritariamente ASPIRACIONAL**: son cadenas en `skills100.ts` que se inyectan al prompt como si existieran, sin respaldo de código. **[INFERENCIA]** Esto es un riesgo de "alucinación inducida": el modelo recibe un system prompt que le dice que tiene 100 capacidades (AST engine, Wasm, criptografía) que la cáscara no implementa.

---

## 9. Tests

**[FETO] Ubicación:** `backend/tests/` en ambas versiones: `comprehensive_e2e_test.py` (**975 líneas**) y `mock_ollama.py` (155 líneas). **Ambos archivos son idénticos byte a byte entre v3.3.2 y v1.4.0** (`diff` sin salida).
**[FETO] Runner:** `package.json` script `"test:e2e": "python3 tests/comprehensive_e2e_test.py"` (línea 13 en ambas).

**[FETO] Cobertura de `comprehensive_e2e_test.py`:**

| Test (línea) | Qué verifica |
|---|---|
| `StreamingMockHandler` (113), `OllamaMockHandler` (218), `OpenAIMockHandler` (223), `GeminiMockHandler` (228) | Mocks SSE de los 4 proveedores |
| `verify_with_curl` (251) | Verificación con `curl --no-buffer` |
| `verify_with_node_fetch` (314) | Verificación con fetch nativo de Node |
| `verify_with_python_httpc` (401) | Verificación con `http.client` de Python |
| `test_ollama_short` (477) / `test_ollama_long` (492) | Streaming Ollama, respuesta corta/larga |
| `test_openrouter` (507) | Streaming OpenRouter |
| `test_custom_provider` (532) | Streaming Custom Server |
| `test_gemini` (547) | Streaming Gemini |
| `test_python_bridge` (583) | Puente `:5000` |
| `test_regression_old_bug_reproduces` (638) | Reproduce el bug `req.on("close")` con el server viejo (`_buggy_server.mjs`) |
| `test_regression_new_code_does_not_abort` (677) | Verifica que el server nuevo NO aborta |
| `test_ollama_404_surfaces_error` (724) | 404 de Ollama se propaga como error claro |
| `test_ollama_connection_refused_surfaces_error` (781) | ECONNREFUSED se propaga |
| `test_gemini_no_api_key_surfaces_error` (818) | Falta de API key → error claro |
| `test_unknown_provider_uses_clear_fallback` (850) | Provider desconocido → fallback con aviso |

**[FETO] Puertos de test:** mocks en 8060 (OpenRouter), 8050 (Custom), 8070 (Gemini), 11434 (Ollama), server 3000; limpieza de 5000 también (líneas 31-38, 72-76). El comentario 32-34 explica que se usan puertos >8000 por la lista de "bad ports" de undici.

**[FETO] Cobertura NO incluida:** no hay tests para `/api/sandbox/*`, `/api/fs/*`, `killPortListeners`, `resolveSafePath`, ni para el frontend (sin Jest/Vitest en `scripts`). **[INFERENCIA]** El único módulo con cobertura es la capa de streaming `/api/ai/stream`; el sandbox y la seguridad de rutas están sin test automatizado.

---

## 10. Hallazgos clave para la fusión V8

1. **Fusionar `server.ts` con base v1.4.0 y recuperar lo que v1.4.0 perdió de v3.3.2 (FETO).**
   v1.4.0 aporta lo bueno: `getGenAI(explicitKey?)` con cache (`v1.4.0/.../server.ts:944-959`), los 2 endpoints de descubrimiento de modelos gratis (`973`, `1016`), el anti-zombie del sandbox (`1271-1286`), `HOST=0.0.0.0` + handlers `exit`/`error` (`1310-1338`), `geminiApiKey` del body (`1849`, `1920`), y el backoff exponencial del autopiloto (`RightSidebar.tsx`). Pero **v1.4.0 eliminó `ide/backend/.proyectos/`** (plantilla del sandbox), el `server.mjs.map` y la validación/auto-install de npm del BAT de arranque. V8 debe adoptar el `server.ts` de v1.4.0 **y** re-incluir la plantilla `.proyectos/` + el paso `npm install` del BAT de v3.3.2.

2. **`ACCESS_TOKEN` es un guard inerte (FETO de seguridad nº1).**
   `sandboxAuthorized()` devuelve `true` cuando `process.env.ACCESS_TOKEN` no está definido (`server.ts:41-48`) y **ningún `.env` del paquete lo define**. Resultado: `/api/exec`, `/api/fs/write`, `/api/sandbox/{start,stop}` quedan abiertos en `127.0.0.1:3000`. El puente `:5000` es aún más expuesto: CORS `*` + `shell=True` + escritura/borrado de rutas absolutas (`agent_bridge_5000.py:165-169, 303-374, 401-431`), y `app/main.py` de v1.4.0 usa `allow_origins=["*"]` con `POST /file/read` sin sandbox. **V8 debe**: (a) generar un `ACCESS_TOKEN` por instalación y exigirlo en todos los endpoints sensibles, (b) verificar `Origin` en :5000, (c) restringir `resolve_pc_path` a un conjunto de directorios consentidos, (d) meter `helmet`/CSP (la dep `cors` ya está declarada pero **nunca se usa en server.ts**).

3. **`requirements.txt` de v3.3.2 está corrupto con un fence markdown (FETO).**
   `v3.3.2/ide/requirements.txt:1` empieza con ```` ```text file="requirements.txt" ````. Es el síntoma exacto del bug de "entregable volcado a disco" que el propio parser del IDE debería evitar (`codeParser.ts:12` solo produce bloques `file=`; nadie los despoja del fence antes de escribirlos a disco). v1.4.0 lo tiene limpio. **V8 debe** sanear los artefactos escritos por `/api/fs/sync` y por el modo "entregables".

4. **`skills.md` promete ~75 capacidades inexistentes y las inyecta al prompt (FETO).**
   `skills100.ts` (100 entradas) → `DEFAULT_SKILLS_MD` (`contextCache.ts:63-68`) → `hiddenSystemFiles` en **cada** mensaje (`server.ts:1764-1770`; `contextCache.ts:161-164`). Búsquedas dirigidas: `vectoriz` = **0 coincidencias**, `wasm` = 0 implementaciones, `dockerfile` = solo resaltado Prism (`syntaxEngine.ts`), `x100 Obsidian` = string en `MEMORIA.md`. El bloque Seguridad/DevOps/Cripto & RAG/AST & Kernel es aspiracional. **V8 debe** separar el catálogo real (API de skills con implementación verificable, ~20-25) del marketing, o el modelo seguirá alucinando capacidades. La confirmación visible está en la propia UI: el buscador sugiere "wasm, rag, crypto" (`RightSidebar.tsx:1077`) sin que existan.

5. **Versionado y empaquetado inconsistentes → deuda que rompe la fusión (FETO + INFERENCIA).**
   Mismo `name` `codigo-0-cerebronico` con `version` 1.3.2 (carpeta `v3.3.2`) y 1.4.0 (carpeta `v1.4.0`); `app/main.py` de v1.4.0 declara `version="v3.3.2"` (`v1.4.0/.../app/main.py:21,56`); `metadata.json` sin campo `version`; existe un archivo basura `ide/backend/#` (0 B) en v1.4.0. Además, el bloque `build.extraResources` de v1.4.0 (`package.json`) declara rutas como `"from": "../dist/CerebroNicoAgent.exe"` y `"from": "../requirements.txt"`, es decir **relativas a `backend/`** asumiendo que electron-builder se ejecuta desde `backend/` (`compilar_exe_windows.bat:105` hace `cd /d "%~dp0"`), pero ese mismo BAT invoca `"%~dp0..\build_backend.bat"` (línea 165-166) que se resuelve en `ide/` y hace su propio `pushd "%~dp0"`. **[INFERENCIA]** Esta cadena de `cd`/`pushd` + rutas `../` es frágil y probablemente la razón de que "listo_compilar_exe" exija condiciones muy concretas de directorio de trabajo. V8 debe fijar una versión única, un directorio de build explícito (p. ej. `electron-builder --projectDir backend`) y eliminar el archivo `#`.

---

### Anexo A — Mapa de puertos confirmado (FETO)

| Puerto | Servicio | Evidencia |
|---|---|---|
| 3000 | IDE: Vite dev-server + API Express | `vite.config.ts:8`; `server.ts:9` (`PORT`) |
| 3500 | Sandbox / app exportada | `server.ts:1071`; `.proyectos/package.json:9`; `constants.ts:20` |
| 5000 | Puente PC Python (`agent_bridge_5000.py` o EXE) | `server.ts:10, 284`; `agent_bridge_5000.py:31` |
| 5001 | Agente FastAPI secundario (solo en `.env`, **no cableado en server.ts**) | `v3.3.2/ide/.env` (`BACKEND_PORT=5001`); `app/main.py:17` |
| 11434 | Ollama | `server.ts:11`; `constants.ts:24` |

### Anexo B — Archivos idénticos entre versiones (FETO, `diff` sin salida)

`ide/backend/electron-main.cjs` · `ide/backend/vite.config.ts` · `ide/backend/index.html` · `ide/backend/tsconfig.json` · `ide/backend/agent_bridge_5000.py` · `ide/backend/tests/comprehensive_e2e_test.py` · `ide/backend/tests/mock_ollama.py` · `ide/backend/app/utils/env_manager.py` · `ide/backend/limpiar_ollama_windows.bat` · `ide/backend/package-lock.json` · `ide/backend/metadata.json` · `ide/backend/CHANGELOG.md` · `ide/backend/README.md` · `ide/MEMORANDUM*.md` · `ide/LEEME_ CAMBIOS v3.*.txt` · `ide/src/**` del frontend (excepto los 5 archivos listados en §7.3) · `ide/backend/src/types.ts` · `ide/backend/dist/assets/*` (mismos hashes de `pdf.worker.min` y `__vite-browser-external`).

---

*Fin del informe. Todas las afirmaciones marcadas [FETO] fueron verificadas leyendo el archivo citado; las [INFERENCIA] son deducciones del auditor.*


---

<a id="02-motor-v2x-md"></a>
## (2/4) 02_motor_v2x.md

> **Fuente:** `audits/02_motor_v2x.md`  —  **version:** 2.2  —  **bytes:** 66946
# 02 — Auditoría del MOTOR de conocimiento · CerebroNico IDE v2.0 vs v2.1

**Objetivo:** verificar contra el CÓDIGO REAL lo que promete `IDEA_DEL_MOTOR_v2.0.md`, medir la
distancia doc↔código y decidir qué se puede fusionar en la V8.

**Base auditada**
- v2.0: `<sesion-anterior>/project/cerebronico_evolution/v2.0/CerebroNico-IDE-v2.0/`
- v2.1: `<sesion-anterior>/project/cerebronico_evolution/v2.1/CerebroNico-IDE-v2.1/`
- Doc rector: `v2.0/CerebroNico-IDE-v2.0/IDEA_DEL_MOTOR_v2.0.md` (245 líneas).
  **HECHO:** el fichero es **byte-idéntico** en v2.0 y v2.1 (`diff` → `IDENTICAL`): v2.1 **no actualizó su
  documento de diseño**. Todo lo que v2.1 cambia hay que leerlo del código.

**Convención de este informe**
- **[HECHO]** = verificado leyendo el código (con ruta + línea).
- **[PROMETIDO]** = el doc lo afirma pero el código no lo respalda (o lo respalda sólo parcialmente).
- **[DUDOSO]** = el artefacto existe pero no es reproducible/no se pudo ejecutar en este entorno.
- Rutas relativas a la raíz de cada versión; `server.ts` es siempre `ide/backend/server.ts`.

**Método:** lectura íntegra de los 11 módulos de `src/engine/` de ambas versiones + `diff -u` v2.0→v2.1,
lectura dirigida de `server.ts` (5.343 vs 6.284 líneas), `rg` de anchors de línea, `md5sum` de artefactos
de prueba. No se ejecutó `npm install` ni la app (sin red en el entorno de auditoría): las afirmaciones se
apoyan en análisis estático, salvo donde se dice explícitamente lo contrario.

---

## 1. Inventario de módulos del motor (v2.0 → v2.1)

### 1.1 Tabla maestra

| Módulo (`ide/backend/src/engine/…`) | v2.0 líneas | v2.1 líneas | Diff | Qué es |
|---|---|---|---|---|
| `knowledgeBase.ts` | 320 | 320 | **IDÉNTICO** | KB determinista + `buildEngineContext()` + `validateToolCall()` |
| `syntaxGuard.ts` | 441 | 479 | **DIFF (53 líneas nuevas)** | Blindaje de sintaxis previo a disco |
| `symbolIndex.ts` | 185 | 185 | **IDÉNTICO** | Índice de firmas reales del proyecto |
| `compactor.ts` | 197 | 197 | **IDÉNTICO** | Disciplina de contexto sobre salidas de herramienta |
| `resilience.ts` | 302 | 302 | **IDÉNTICO** | Reintentos, cortacircuitos, cadena de respaldo |
| `toolRegistry.ts` | 571 | 571 | **IDÉNTICO** | Esquemas de herramientas (`ToolSpec`) |
| `superPrompt.ts` | 203 | 203 | **IDÉNTICO** | Prompt base |
| `modelTiers.ts` | 336 | 336 | **IDÉNTICO** | Clasificación de modelos + perfiles de rendimiento |
| `manuals.ts` | 308 | 308 | **IDÉNTICO** | Leyes + manual por herramienta + procedimientos |
| `importChecker.ts` | 171 | 269 | **DIFF (135 líneas nuevas)** | Detección de imports rotos + stubs |
| `extensions.ts` | 240 | 240 | **IDÉNTICO** | Sistema de extensiones |
| **Sólo v2.1** | | | | |
| `brain.ts` | — | 577 | NUEVO | CEREBRO (ley) + MEMORIA (estado vivo), escritura atómica, snapshots, rollback |
| `localRAG.ts` | — | 389 | NUEVO | Vectorización local de la memoria (APAGADA por defecto) |
| `advancedFeatures.ts` | — | 418 | NUEVO | Interruptores de capacidades (git de memoria, plantillas, deep-index) |
| `hardwareGovernor.ts` | — | 228 | NUEVO | Gobernador por RAM libre (fases V2.0…V2.3) |
| `cloudVerifier.ts` | — | 416 | NUEVO | Verificador independiente en la nube |
| `projectPorter.ts` | — | 252 | NUEVO | Normaliza puerto de arranque de proyectos importados |
| `core-agent/agent_core/*.py` | — | 318 | NUEVO | Núcleo Python secundario (`engine.py`, `loader.py`) |
| `server.ts` | 5.343 | 6.284 | +941 | Orquestador (rutas, prompt, bucle de agente) |

**Tamaño exacto (bytes) de los módulos compartidos:** los marcados IDÉNTICO lo son también en bytes
(p. ej. `knowledgeBase.ts` = 20.434 B en ambas). `syntaxGuard.ts` 18.070 → 20.719 B;
`importChecker.ts` 7.158 → 12.141 B.

### 1.2 Diferencias reales v2.0 → v2.1 (lo único que cambió en el motor)

| Cambio | Fichero:línea (v2.1) | Detalle |
|---|---|---|
| Python: heurística **no bloqueante** | `syntaxGuard.ts:435-446` | `bloqueantes = language === "python" ? unique.filter(i => i.kind === "truncated") : unique` |
| Python: `:` ya no debe terminar la línea | `syntaxGuard.ts:270-284` | `!t.includes(":") && !/[({\[,=+\-*/|&\\]$/.test(t)` |
| Archivo **vacío = válido** | `syntaxGuard.ts:309-318` | Antes devolvía `ok:false` (rompía `__init__.py`) |
| HTML-en-.md: sólo bloquea si **empieza** el archivo | `syntaxGuard.ts:412-431` | `^\s*(<!doctype\s+html|<html[\s>])` |
| `importChecker`: stubs de **módulo** (no sólo componente) | `importChecker.ts:113-200` | `extraerNombresImportados()` + no-op por nombre importado |
| `postinstall.mjs` nunca aborta `npm install` | `scripts/postinstall.mjs:23-43,163-166` | `uncaughtException`/`unhandledRejection` → aviso y `process.exit(0)` |
| Gobernanza viva + RAG + features | `server.ts:973-995, 2208-2407, 4791-4856` | `Brain`, `LocalRAG`, `AdvancedFeatures`, `HardwareGovernor`, `CloudVerifier` |

**Conclusión 1.1 [HECHO]:** el núcleo duro del motor (KB, símbolos, compactador, resiliencia, toolRegistry,
manuals, modelTiers) es **código congelado idéntico** entre v2.0 y v2.1. v2.1 añade una **capa de gobernanza**
(`brain.ts` y compañía) y afina el guardián de sintaxis + verificador de imports. Para la V8, "v2.1 vs v2.0"
no es una elección de motor, sino de **capa superior**.

---

## 2. Base de conocimiento (`knowledgeBase.ts`, idéntico en ambas)

### 2.1 Estructura de `kb.json`

| Elemento | Código | Valor |
|---|---|---|
| Ubicación | `server.ts` v2.0:842-843 · v2.1:961-962 | `path.join(process.cwd(), ".cerebro-db", "kb.json")` |
| Formato serializado | `knowledgeBase.ts:215-217` | `{ "version": 2, "entries": [ … ] }` |
| Entrada | `knowledgeBase.ts:34-45` | `{ id, table, title, body, keys[], lang?, weight?, updatedAt? }` |
| Tablas del tipo | `knowledgeBase.ts:32` | `"syntax" \| "error" \| "pattern" \| "tool" \| "skill" \| "rule" \| "project" \| "lesson"` |
| **Tabla fantasma** | `manuals.ts:28-36` | las 30 entradas de manuales usan `table: "manual"`, **que NO existe en `KbTable`** → ver §2.5 |
| Carga | `server.ts` v2.0:847-861 · v2.1:997-1011 | `KnowledgeBase.fromJSON(readFileSync(...))`; si falla → semilla |
| Persistencia | v2.0:863-878 · v2.1:1013-1028 | `saveEngineKb()` con bandera `kbDirty`; autosave cada 30 s; flush en SIGINT/SIGTERM |
| Re-seed | `knowledgeBase.ts:219-231` | `fromJSON` sólo re-inyecta `KB_SEED` (no `MANUAL_ENTRIES`) si el JSON no las trae |

### 2.2 Semilla real (contada en el código, no en el doc)

| Tabla | Entradas en `KB_SEED` | IDs |
|---|---|---|
| `rule` | **4** | `rule-no-placeholders`, `rule-verify`, `rule-edit-first`, `rule-destructive` |
| `syntax` | **7** | `syn-json`, `syn-tsx`, `syn-ts`, `syn-html`, `syn-css`, `syn-py`, `syn-truncation` |
| `error` | **7** | `err-enoent`, `err-module`, `err-port`, `err-econnrefused`, `err-json`, `err-oom`, `err-timeout-model` |
| `pattern` | **5** | `pat-fetch`, `pat-react-comp`, `pat-express`, `pat-sandbox-preview`, `pat-ollama` |
| `tool` | **5** | `tool-edit`, `tool-range`, `tool-search`, `tool-git`, `tool-fetch-url` |
| `skill` | **4** | `skill-tabs`, `skill-extensions`, `skill-autolearn`, `skill-favorites` |
| **Total `KB_SEED`** | **32** | `knowledgeBase.ts:76-120` |
| `MANUAL_ENTRIES` (extra) | **30** | 5 leyes (`manuals.ts:40`) + 19 manuales de herramienta (`manuals.ts:86`) + 6 procedimientos (`manuals.ts:230`) |
| **Total de fábrica** | **62** | inyectadas en el constructor: `knowledgeBase.ts:133` `[...KB_SEED, ...MANUAL_ENTRIES]` |

> **[PROMETIDO]** El doc (§2, línea 30) dice «**28 entradas**, verificadas por prueba automática».
> **[HECHO]** son **32 sólo en `KB_SEED`** y **62 de fábrica** con los manuales. El doc quedó desactualizado
> respecto a su propio código (la sección de manuales se añadió después sin revisar la cifra).
> La única comprobación automática existente exige `size >= 25` (`PRUEBAS_MANUALES_MOTOR.ts:10`): umbral
> laxo que no valida "28".

### 2.3 `buildEngineContext()`: selección y presupuesto

Algoritmo real (`knowledgeBase.ts:185-245`):

1. `tokenize(text)` (`:64-71`): minúsculas, se eliminan símbolos salvo `._/-`, se descartan palabras ≤2 caracteres.
2. Puntuación por entrada (`:190-209`):
   - clave exacta presente en el texto: **+2.2**;
   - coincidencia parcial (substring, sólo si ambos lados >4 car.): **+1.0**;
   - cada palabra del título presente: **+0.8**;
   - **+ `TABLE_PRIORITY[table]`** (`:53-62`): `rule 1.0 · syntax 0.92 · error 0.9 · tool 0.85 · project 0.8 · skill 0.7 · pattern 0.65 · lesson 0.6`; desconocidas (`manual`) → `?? 0.5`;
   - **+ `weight * 0.6`** (peso declarado 0..1);
   - **bonus fijo +0.7 si `table === "rule"`** (siempre útiles);
   - `score === 0` ⇒ descartada; orden descendente; `slice(0, limit)`.
3. Formato: `[CONOCIMIENTO DEL MOTOR — datos verificados, úsalos tal cual]` + una línea `- [tabla] título: body` por hit (`:242`).
4. **Presupuesto**: `budgetChars` por defecto **1100** en la firma (`:238`); si el texto excede, se corta y se
   añade `[…]` (`:243`).

**Dónde se aplica el 700/1200 que dice el doc:**

| Punto de llamada | v2.0 | v2.1 | Presupuesto |
|---|---|---|---|
| Prompt del modelo (Ollama) | `server.ts:4865-4870` | `server.ts:5767-5772` | `tier === "micro" \|\| "tiny" ? 700 : 1200` ✅ coincide con el doc |
| Endpoint `GET /api/engine/kb` | `server.ts:2060` | `server.ts:2495` | default **1100** (incoherencia menor, sólo afecta a la vista de diagnóstico) |

**[HECHO]** el presupuesto 700/1200 se respeta, pero **sólo en la ruta Ollama** (ver §2.4).
**[HECHO]** el doc dice «las 5 entradas más relevantes»: correcto, `limit = 5` fijo (`:4868` / `:5770`).

### 2.4 ¿Se inyecta el motor en todos los proveedores? **[PROMETIDO parcialmente]**

- **[HECHO]** `buildEngineContext` (KB), `buildToolManualSection` (manuales) y `summarizeSymbols`
  (símbolos) se invocan **una sola vez y sólo en el camino Ollama**, dentro del bloque
  `if (consolidatedSystemInstruction) { let sysContent = consolidatedSystemInstruction; … }`
  (`server.ts` v2.0:4827-4900 · v2.1:5728-5801).
- **[HECHO]** Los caminos Gemini/OpenRouter/Z.ai/OpenAI/Custom construyen su prompt con
  `consolidatedSystemInstruction` (`server.ts` v2.1:4924, 4994, 5071, 5151, 5256, 5339, 5403, 5467, 5531, 5595, 5659)
  y **no** reciben `[CONOCIMIENTO DEL MOTOR]`, ni `[MANUAL DEL MOTOR]`, ni `[SÍMBOLOS REALES DEL PROYECTO]`.
- **[HECHO]** Lo que **sí** es común a todos los proveedores es la **capa de gobernanza** añadida en v2.1
  (`brain.systemBlock()` + RAG + archivos de sistema ocultos), porque se aplica a
  `consolidatedSystemInstruction` antes del `if` por proveedor (`server.ts` v2.1:4791-4856).

> **Veredicto:** «cambiar de modelo no cambia el resultado» (doc §1, líneas 17-18) es **FALSO en v2.0**
> (la nube no recibe KB ni símbolos) y **PARCIAL en v2.1**: la ley/estado sí viaja a todos; el conocimiento
> recuperado y el índice de símbolos siguen siendo privilegio de Ollama.
> **Acción V8:** extraer la composición del prompt a un único punto (`buildProviderSystemPrompt`) y llamarlo
> en los 11 caminos de proveedor.

### 2.5 Endpoints `/api/engine/*` **[HECHO]**

`registerEngineRoutes()` — v2.0:2049-2155 · v2.1:2208-2590 (v2.1 añade 4 bloques *antes*: `verifier`, `features`, `rag`, `brain`).

| Ruta | Método | v2.0 | v2.1 | Devuelve |
|---|---|---|---|---|
| `/api/engine/kb?q=&limit=` | GET | 2051 | 2486 | `hits` (id/table/title/body/score) + `context` (lo que inyectaría) + `stats` + `size` |
| `/api/engine/kb/stats` | GET | 2067 | 2502 | `size`, `tables`, `file`, `persisted` |
| `/api/engine/kb/learn` | POST | 2078 | 2513 | `learnFromLesson(id, text, tags)` → `lesson:<id>` (peso 0.6) |
| `/api/engine/kb/entry` | POST | 2088 | 2523 | alta manual (exige `id` y `body`; `table` por defecto `rule`; `weight` 0.7) |
| `/api/engine/guard` | POST | 2106 | 2541 | `guardFile(path, content)` sin escribir |
| `/api/engine/sync` | POST | 2117 | 2552 | mapa de proyecto + **reindexado de símbolos** + `saveEngineKb(true)` |
| `/api/engine/symbols?q=&limit=` | GET | 2131 | 2566 | sin `q`: mapa+`summary`; con `q`: `findSymbols` (file/line/kind/signature) |
| `/api/engine/tools` | GET | 2152 | 2587 | `listToolPacks()` + `getAllToolNames()` |
| `/api/brain*`, `/api/rag*`, `/api/features*`, `/api/verifier/*` | — | — | 2222-2484 | **sólo v2.1** (gobernanza, RAG, interruptores, verificador) |

Detalle de `sync` (v2.0:2117-2128): `refreshEngineProjectMap(files)` guarda hasta **60** rutas como
`project:map` (`knowledgeBase.ts:155-165`) y `reindexProjectSymbols()` añade una entrada `project` por archivo
con símbolos (`server.ts` v2.0:942-953 · v2.1:1090-1102), cuerpo recortado a **1.200 caracteres**, `weight 0.75`.

---

## 3. `syntaxGuard.ts` — qué se bloquea de verdad

### 3.1 Política implementada: **CONSERVADORA, ya en v2.0** [HECHO]

El propio código documenta la decisión (`syntaxGuard.ts:320-333`):

```
// EVIDENCIA: se pasaron por el blindaje 63 archivos REALES y VÁLIDOS del propio
// proyecto y RECHAZÓ 32 (el 51 %) …
// ahora solo se bloquea lo que se puede afirmar sin duda.
```

Coincide con `memoria.md` (líneas 25-29, ADR «Blindaje de sintaxis con política conservadora»).
No es un pendiente: **está implementado en v2.0 y afinado en v2.1**.

### 3.2 Reglas exactas que SÍ bloquean

| # | Regla | Código | Alcance |
|---|---|---|---|
| 1 | Marcador de truncamiento **al final** del archivo (`tail` = últimas 3 líneas) | `:335-349` | todos los lenguajes |
| 2 | CSV: JSON inválido (`JSON.parse` real) | `:352-362` | `language === "json"` |
| 3 | Truncamiento: `/*` **que abre línea** > `*/` | `:368-381` | ts/tsx/js/jsx |
| 4 | Balance de delimitadores + cadenas | `:398-402` (`scanBalance`) | **sólo `html`** |
| 5 | Pares de etiquetas HTML | `:401` (`checkTagPairing(text,"html")`) | **sólo `html`** |
| 6 | Balance de llaves CSS | `:403-407` (`checkCss`) | `css` |
| 7 | Python: `:` ausente, `return:` , tab+espacios | `:408` (`checkPython`) | `python` (**en v2.1 no bloquean**, salvo `kind === "truncated"`) |
| 8 | HTML guardado como `.md`/`.txt` (sólo si **empieza** con `<html`/`<!doctype`) | v2.1:412-431 / v2.0:399-407 | markdown/text |

`TRUNCATION_PATTERNS` (`:58-72`): (a) «archivo/contenido/fichero truncado a NB/KB»; (b)
`^\s*(\.\.\.|…)\s*$` multilínea; (c) `<...>` o `[ ... ]`; (d) comentario `//`/`#` que dice «resto del código»;
(e) `TODO|FIXME|pendiente de implementar`.

### 3.3 Reglas que el doc promete y el código YA NO aplica (retiradas a propósito)

| Doc §3 | Estado real |
|---|---|
| «Paréntesis, corchetes y llaves desbalanceados, ignorando strings y comentarios» | **[PROMETIDO]** `scanBalance()` existe y es correcto, pero **sólo se llama para `html` y `css`** (`:398-407`). En TS/JS/TSX **no se comprueba balance**: el comentario `:364-367` lo justifica («sin un parser real … eso ya NO bloquea»). |
| «Cadenas y plantillas sin cerrar» | **[PROMETIDO]** el contador `unclosedString` se calcula pero **nunca se usa** para bloquear; el chequeo de backticks fue **retirado** (`:382-393`) |
| «JSX: etiquetas pareadas … incluye `<Componente>`» | **[PROMETIDO]** `checkTagPairing(text, kind)` acepta `"jsx"` (`:191`) y cuenta componentes PascalCase (`:216-221`), pero **la única llamada es `checkTagPairing(text, "html", …)`** (`:401`). El camino `"jsx"` es **código muerto**: un `.tsx` con `<Foo>` sin cerrar **no se rechaza**. |
| «Comentarios de bloque sin cerrar» | **[HECHO]** pero debilitado: sólo cuenta `/*` al inicio de línea (`:372`) — falso positivo real documentado en `ProConfigPanel.tsx` |
| «Marcadores (`…`, `<...>`, TODO)» | **[HECHO]** con matiz importante: **sólo si están en las últimas 3 líneas** (`:338`) |
| «CSS: llaves desbalanceadas» | **[HECHO]** `checkCss` cuenta `{}` sin ignorar strings/comentarios (riesgo de falso positivo en `content: "{"`) |
| «Python: mezcla de tabs/espacios, `def/if/for/while/class` sin `:`» | **[HECHO] detecta**, pero en v2.1 `ok` sólo depende de `truncated` (`:435-446`): los avisos se informan sin bloquear |
| «Los errores devuelven el mensaje al modelo y se revierte el archivo» | **[HECHO]** `rejectMessage()` (`:473-479`) + puertas de escritura (§3.4) |

### 3.4 Puertas de escritura donde se aplica `guardFile` [HECHO]

| Puerta | v2.0 | v2.1 |
|---|---|---|
| `write_file` (herramienta) | 1070 | 1229 |
| `edit_file` (herramienta, revierte) | 1162 | 1321 |
| `POST /api/engine/guard` | 2108 | 2543 |
| `POST /api/fs/write` (autosync del chat) | 3257 (ruta en 3241) | 4050 (ruta en 4034) |
| `POST /api/fs/sync` (volcado masivo) | 3415 (ruta en 3391) | 4221 (ruta en 4197) |

**Novedad v2.1 en `/api/fs/sync`:** `esArchivoCriticoParaArrancar(p)` (`server.ts:4188-4195`:
`package.json`, `vite.config.*`, `tsconfig*.json`, `index.html`) → si el guardián duda de un **archivo
crítico, se escribe igual y se avisa fuerte** (comentario `:4225-4238`). El motor aprende del rechazo
vía `learnFromToolFailure("fs_sync", …)` (`:4246`).

---

## 4. `validateToolCall()` — blindaje del contexto de herramientas

Definición: `knowledgeBase.ts:265-320` (**idéntico v2.0/v2.1**). Aplicación: `executeToolCall()`
(`server.ts` v2.0:1002-1027 · v2.1:1161-1185).

| Caso | Comportamiento | Línea |
|---|---|---|
| `args` no es objeto (o es array/null) | `ok:false`, issue `field:"*"` | 271-273 |
| Campo `required` ausente / `null` / cadena vacía | issue **bloqueante** `Falta el campo obligatorio "x"` | 275-280 |
| **Campo inventado** (no está en `properties`) | issue **no bloqueante**: «se ha ignorado» → **se descarta** del `sanitized` | 282-288 |
| `type:"string"` y no string | issue bloqueante | 290-293 |
| `type:"number"` y no number | **coerción**: `Number(value)` finito ⇒ `sanitized[field] = n`; si no, issue | 294-299 |
| `type:"array"` y no array | issue bloqueante | 300-303 |
| `type:"boolean"` y no boolean | coerción `"true"/"false"` ⇒ `sanitized`; si no, issue | 304-309 |
| `enum` violado | issue bloqueante con la lista de valores | 310-314 |
| Veredicto | `blocking = issues.filter(i => !i.message.includes("se ha ignorado"))` ⇒ `ok = blocking.length === 0` | 318-319 |
| Herramienta **inexistente** | corta antes: `Herramienta desconocida: X` | `server.ts` v2.0:1012-1014 · v2.1:1171-1174 |
| Fallo de validación | devuelve `{ok:false, error, hint}` al modelo **sin ejecutar** | v2.0:1018-1024 · v2.1:1177-1183 |

Detalle fino: el detector de "no bloqueante" es **por substring en el mensaje** (frágil: cualquier issue
futuro que contenga «se ha ignorado» se vuelve no bloqueante). `sanitized` se asigna de vuelta a `args`
(`v2.0:1026`) ⇒ los campos inventados **nunca llegan** a la ejecución.

**Cobertura del esquema [HECHO]:** `schemaForTool()` (`v2.0:996` · v2.1:1155`) construye el esquema desde
`getToolSpec()` de `toolRegistry.ts` (`:111`). `write_file` exige `path`+`content` (`toolRegistry.ts:298-308`),
`find_symbol` exige `name` con `limit` numérico (`toolRegistry.ts:401-413`).

---

## 5. `symbolIndex.ts` — índice de símbolos reales

### 5.1 Lenguajes y patrones [HECHO]

| Lenguaje | Extensiones | Patrones |
|---|---|---|
| TypeScript/TSX/JS/JSX | `.ts .tsx .js .jsx .mjs .cjs` | `TS_PATTERNS` (`:56-67`): `function` (export/no), `class`, `interface`, `type`, `const` flecha, `const` general, **método** |
| Python | `.py` | `PY_PATTERNS` (`:69-72`): `def` (con `async`), `class` |
| Otros (css/html/md…) | — | **no indexados** (`guessLanguage` `:125-131` no los mapea ⇒ `patterns = []`) |

- En **TSX/JSX**, una `function` con nombre PascalCase se reclasifica como `component` (`:110`).
- **Métodos** sólo si el archivo tiene < 800 líneas y la línea está indentada ≥2 espacios (`:88-99`);
  se filtran `RESERVED_WORDS` (`:123`).
- Límites: `MAX_SYMBOLS_PER_FILE = 120` (`:74`), `buildSymbolMap` procesa hasta **200 archivos** (`:137`).
- **Firma extraída** (`:112`): la **línea completa** normalizada y recortada a **120 caracteres** (`cleanSignature` `:76-79`).
  ⚠️ Es decir: la "firma" es la línea de declaración (incluye `export`, modificadores y a veces el cuerpo),
  no una firma normalizada tipo `(a: T) => R`.
- Campos de `SymbolInfo` (`:31-40`): `name, kind, line, signature, exported, pascal`.
- `kind ∈ {function, class, interface, type, const, component, method, python-def, python-class}` (`:20-29`).

### 5.2 Inyección en el prompt e índice en KB [HECHO]

- Resumen inyectado: `summarizeSymbols(map, maxChars, maxFiles=12)` (`:173-185`) produce
  `[SÍMBOLOS REALES DEL PROYECTO — usa estos nombres, no inventes otros]` + una línea por archivo
  (hasta 12 símbolos por archivo).
- Presupuesto de inyección: `profile.tier === "micro" ? 700 : 1300` (`server.ts` v2.0:4897 · v2.1:5799) ✔ coincide con el doc.
- Indexado en KB: una entrada `project` por archivo con símbolos, id `symbols:<path>`, weight 0.75,
  cuerpo ≤1.200 car. (`server.ts` v2.0:942-953 · v2.1:1090-1102).
- Reindexado: `reindexProjectSymbols()` (`v2.0:898-957` · v2.1:1048-1107`) recorre el sandbox
  (`PROJECT_ROOT`) hasta profundidad 6, salta `INDEX_SKIP_DIRS`
  (`node_modules .git dist dist_electron .vite venv __pycache__ .cerebro-db`, `v2.0:895` · `v2.1:1045`),
  ignora archivos > 300 KB, tope 200 archivos — **lee del disco, no recibe contenido por red** ✔.
- Se dispara: al arrancar el prompt si el mapa está vacío (`v2.0:4892-4896` · `v2.1:5794-5798`),
  y en `POST /api/engine/sync` (`v2.0:2120` · `v2.1:2555`).

### 5.3 Herramienta `find_symbol` y endpoint [HECHO]

- Esquema: `toolRegistry.ts:401-413` (`name`, `limit`), declarada barata (`cheap: true`).
- Implementación: `findSymbols(map, query, limit=8)` (`symbolIndex.ts:156-170`) — **coincidencia exacta
  primero, luego parcial** (`name.includes(q)`), sobre TODOS los archivos del mapa.
- Endpoint `GET /api/engine/symbols` (`v2.0:2131-2149` · `v2.1:2566-2584`): sin `q` → total + lista por
  archivo + `summary`; con `q` → `found` + `results[{file,line,kind,signature}]`, `limit` acotado a 30.

---

## 6. `compactor.ts` — disciplina de contexto

Presupuesto por defecto `DEFAULT_BUDGET = 2600` caracteres (`:40`), mínimo forzado 400 (`:59`).

| Tipo | Reglas exactas | Línea |
|---|---|---|
| **file** | estructura: líneas que casan `KEEP_LINE` (`import|export|from|require|package|using|#include|def |class |function |interface |type |const |let |var |async |@|\"\"\"|'''|///`), escaneadas en las primeras **120** líneas, máx **40**; luego `[INICIO]` 25 líneas numeradas y `[FINAL]` 25 líneas numeradas; hueco marcado `[…N línea(s) centrales omitidas: pídelas con read_file_range…]` | 88-104 |
| **command** | principio 30 + final 30 + `[…N línea(s) intermedias omitidas…]` + todas las líneas que casan `ERROR_LINE` (máx 40) bajo el rótulo `[LÍNEAS DE ERROR/AVISO DESTACADAS POR EL MOTOR]` | 74-81 |
| **search** | `keep = max(5, min(total, floor(budget/90)))` primeros resultados + `[…N resultado(s) más, repite la búsqueda con un filtro más específico…]` | 82-87 |
| **json** | `describe()` estructural: claves/tipos/longitudes, arrays → `array[N]` con 3 elementos, objetos → 12 claves, escalares → `tipo = valor` (recortado a 80) | 70-73, 145-171 |
| **text** | principio 20 + final 20 | 105-110 |
| Guardas finales | si aún excede el budget → `slice(0, budget) + "[…recortado por el motor: pide el resto por partes…]"`; cabecera con etiqueta y métricas | 112-122 |

**La regla «los errores nunca se compactan» [HECHO]** — `compactToolResult(toolName, output, isError)`:

```ts
if (isError) return { output };        // compactor.ts:179
```

`isError` se calcula en el bucle de agente como `JSON.parse(result)?.ok === false`
(`server.ts` v2.0:1493-1498 · v2.1:1652-1660). Mapa herramienta→tipo en `:180-192`
(`read_file*`/`fetch_url`/`pc_read_file` → file; `run_command`/`run_tests`/`git_diff`/`pc_exec` → command;
`search_in_files` → search; `list_files`/`git_status` → text; resto → text).
La nota de ahorro se emite al log con `🧠 ${fnName}: motor: … (ahorro N%)` (`server.ts` v2.0:1500-1502 · v2.1:1659-1661)
y la salida compactada es la que se devuelve al modelo (`messages.push({role:"tool", content: compacted.output})`).

⚠️ **Matiz [HECHO]:** el umbral de líneas que menciona el doc (600 líneas / 400 de log) es **retórico**:
la decisión real es por **caracteres** (`originalChars <= budget` ⇒ no se toca, `:63-65`). Un archivo de
3.000 líneas muy cortas puede no compactarse.

---

## 7. Aprendizaje del motor: de error real a entrada de KB

`learnFromToolFailure(toolName, args, result)` — `server.ts` v2.0:965-993 · v2.1:1115-1153.
Se invoca cuando `isError === true` en el bucle de agente (`v2.0:1512-1514` · `v2.1:1671-1673`), en
`/api/fs/sync` por cada archivo rechazado (`v2.1:4246`) y por imports sin resolver (`v2.1:4336`), y en
fallos de proveedor (`v2.1:4977`).

| Paso | Código | Detalle |
|---|---|---|
| 1. Extraer el error | v2.0:967-972 · v2.1:1126-1131 | `JSON.parse(result).error`; si no es JSON, el texto crudo |
| 2. **Normalizar** (para no guardar una entrada por cada ruta) | `:975-978` · `:1134-1137` | `replace(/[A-Za-z0-9_./\\-]{8,}/g, "<ref>")` y `replace(/\d+/g, "<n>")`, recorte a **180** car. |
| 3. **Dedupe** por id | `:979` · `:1138` | `id = fail:<tool>:<primeros 40 car. de lo normalizado, \W+→->` — el **mismo** fallo reescribe la misma entrada (`upsert`) en lugar de acumular |
| 4. Acotación | `:985` · `:1144` | cuerpo con `errorText.slice(0, 200)` + pista de argumento (`path` o `command` ≤60 car.) |
| 5. Entrada | `:981-988` · `:1140-1147` | `table:"error"`, `weight: 0.65`, `keys: [tool, ...tokenize(errorText).slice(0,8)]` |
| 6. Persistencia | `:989` · `:1148` | `kbDirty = true` (se escribe en el siguiente autosave de 30 s) |
| 7. Blindaje del aprendizaje | `:990-992` · `:1149-1152` | `try/catch` total: «el aprendizaje nunca debe romper la ejecución de una herramienta» |

**Novedad v2.1 [HECHO]:** además se registra en la **memoria viva** antes de tocar la KB
(`server.ts:1116-1124`):

```ts
brain.registrarFallo(toolName, result);          // §[Incidencias Críticas] + métrica "incidentes"
features.commitMemoria(`incidencia: ${toolName}`); // commit en el historial git de memoria.md
```

`Brain.registrarFallo` (`brain.ts:289-293`) añade `Herramienta **X** falló: <200 car.>` a la sección
`[Incidencias Críticas]` y hace `bumpMetrica("incidentes", 1)` (`brain.ts:298-321`).

**Aprendizaje desde lecciones (doc §2, endpoint `kb/learn`):** `KnowledgeBase.learnFromLesson`
(`knowledgeBase.ts:143-152`) crea `lesson:<id>` con `title = text.slice(0,60)`, `keys` = 14 primeros tokens
+ tags, `weight 0.6`.

---

## 8. Resiliencia: ¿se unificó la duplicación que pide la IDEA §9?

**Lo que dice el doc (§9.2, líneas 167-168):** «existe `src/utils/resilience.ts` de la v1.1 y el nuevo
`src/engine/resilience.ts`. Hay que unificar en el del motor.»

**Verificación por búsqueda exhaustiva (`find` en todo `cerebronico_evolution`):**

| Ruta | ¿Existe? |
|---|---|
| `…/src/utils/resilience.ts` en v2.0 | **NO EXISTE** |
| `…/src/utils/resilience.ts` en v2.1 | **NO EXISTE** |
| `…/src/utils/resilience.ts` en v1.0 / v1.0.1 / v1.0.2 / v1.0.3 / v1.1.1 | **NO EXISTE** |
| `…/src/engine/resilience.ts` en v1.0, v1.0.1, v1.0.2, v1.0.3, v1.1.1, v2.0, v2.1 | **EXISTE en las 7** |
| `…/tests/resiliencia.test.ts` | sólo en v1.1.1 |

**Conclusiones:**
1. **[PROMETIDO/FALSO]** La premisa del doc es **incorrecta**: nunca hubo dos `resilience.ts`. El módulo
   nació ya dentro de `engine/` (presente desde v1.0) y **no existe** en `src/utils/`. La "duplicación" que
   §9.2 manda arreglar **no es verificable en los árboles entregados**.
2. **[HECHO]** `src/engine/resilience.ts` es **byte-idéntico en v2.0 y v2.1** (10.702 B, 302 líneas): v2.1
   **no tocó** resiliencia. La tarea §9.2 queda **no ejecutada** (y probablemente era un objetivo nulo).
3. **Duplicaciones reales que sí existen [HECHO]:** lógica de reintento/espera replicada fuera del módulo:
   - bucle de reconexión manual a Ollama (`server.ts` v2.0:4940-5010 · v2.1:5860-5930) con
     `OLLAMA_MAX_CONNECT_ATTEMPTS` y `withRetry` **en paralelo** al bucle propio;
   - `sleep` redefinido localmente en el servidor además de exportarse en `resilience.ts:117`;
   - `src/utils/healthCheck.ts`, `src/utils/selfHealing.ts` y `src/utils/restorePoints.ts` mantienen
     su propia noción de "fallo recuperable" sin pasar por `classifyError()`.
   **Acción V8:** sustituir esos tres puntos por `classifyError`/`withRetry`/`withFallback` del motor.

**Contenido real de `engine/resilience.ts` (idéntico en ambas) [HECHO]:**

| API | Línea | Comportamiento |
|---|---|---|
| `classifyError(err)` | 59-103 | 6 clases: `auth` (401/403), `quota` (429 + `retryAfter`), `timeout` (408/504), `offline` (dns/enotfound), `fatal` (lista negra), `retryable` (5xx + patrones de red); **desconocido ⇒ `retryable`** |
| `withRetry(fn, opts)` | 131-167 | `attempts 3`, `baseDelay 600 ms`, `maxDelay 8 s`, `budgetMs 90 s`, backoff exponencial + jitter; **no reintenta `auth`/`fatal`**; adjunta `cnAttempts`/`cnClass` al error |
| `withFallback(attempts, onEvent)` | 253-296 | cadena ordenada por etiqueta; **salta** proveedores con cortacircuitos abierto; eventos `{label, ok, reason, ms, skipped}` |
| Cortacircuitos | 172-226 | `recordFailure` (umbral 3), `recordSuccess`, `isCircuitOpen(key, 60 s)` con semiapertura (resetea al expirar), `breakerStatus`, `resetBreakers` |
| `describeResilience()` | 299-302 | texto para el log: `proveedor: N fallo(s) (abierto)` |

---

## 9. Perfiles de rendimiento (`modelTiers.ts`, idéntico v2.0/v2.1)

### 9.1 Clasificación y valores [HECHO]

- `getTier` (`:110-118`): `micro ≤1.6B` · `tiny ≤3.5B` · `small ≤8B` · `medium ≤34B` · `large >34B` · `cloud` (nombre con `-cloud`/`:cloud`).
- Tamaño leído del nombre con `[:@_-](\d+(\.\d+)?)\s*(b|m)` (`:74`, `:96-103`).
- **Herramientas (bucle de agente):** lista blanca `TOOL_CAPABLE_ALLOWLIST` (`:85-86`) **Y** `paramsB >= 4`
  (`TOOL_CAPABLE_MIN_PARAMS_B = 4`, `:93`). Todo lo que no pase → **sin herramientas, streaming directo**.
- `lowRam = ramGb > 0 && ramGb <= 8` (`:129`) es el "recorte por 8 GB" **real del motor**.

| Tier | num_ctx | num_predict | num_batch | keep_alive | temp | contextCharBudget | historyTurns | maxOpenFiles / maxFileChars | Línea |
|---|---|---|---|---|---|---|---|---|---|
| micro | 2048 | 400 | 128 | `30m` | 0.35 | 6.000 | 4 | 1 / 1.500 | 149-160 |
| tiny | 4096 | 700 | 128 | `30m` | 0.40 | 12.000 | 6 | 2 / 2.500 | 161-172 |
| small | 4096 si ≤8 GB, si no 8192 | 1200 | 256 | `30m` | 0.45 | 16.000 / 24.000 | 8 | 3 / 4.000 | 173-184 |
| medium | 8192 si ≤8 GB, si no 16384 | 2000 | 512 | `30m` | 0.50 | 40.000 / 60.000 | 14 | 4 / 6.000 | 185-196 |
| large | 32768 | -1 (sin tope) | 512 | `30m` | 0.50 | 200.000 | 30 | 6 / 12.000 | 197-208 |
| cloud | 32768 | -1 | 512 | `10m` | 0.50 | 200.000 | 30 | 6 / 12.000 | 209-221 |

- **`num_thread`** (`numThreadSuggestion`, `:250-256`): `max(2, min(cores-1, 4))` en micro/tiny;
  `max(2, min(cores-1, 12))` en el resto. **Se reserva 1 hilo para la UI** (evita que Ollama congele la interfaz).
- `buildOllamaOptions()` (`:275-297`): añade siempre `temperature` (clamp 0.05-1.0), `num_ctx`, `num_batch`,
  `repeat_penalty 1.12`, `repeat_last_n 128`, `top_k 40`, `top_p 0.9`; `num_thread` si ≠null;
  `num_predict` **sólo si > 0** (no se envía `-1` para no pisar el default en modelos grandes/nube).
- `trimMessagesToBudget()` (`:304-336`): conserva TODOS los `system`, últimos `historyTurns*2` mensajes,
  va soltando los antiguos hasta caber en `budgetChars`, y como último recurso trunca mensajes largos a
  `max(800, budget/kept)` con marca `[…recortado para no saturar el contexto del modelo local…]`.

### 9.2 Dónde viven los valores y cómo llegan a Ollama [HECHO]

| Elemento | Ubicación |
|---|---|
| `CPU_CORES`, `RAM_GB` (reales del equipo) | `server.ts` v2.1:891-892 (v2.0 análogo) — `os.cpus().length`, `os.totalmem()` redondeado a GB |
| `getProfile(model)` (envoltorio local) | `server.ts` v2.1:883-889 |
| Opciones en el chat | `server.ts` v2.0:5001-5007 · v2.1:5900-5906 (`keep_alive: profile.keepAlive`, `options: buildOllamaOptions(...)`) |
| Opciones en el bucle de agente (no-streaming) | `server.ts` v2.1:1530-1534 |
| **Precalentado** | `POST /api/ollama/warmup` — v2.0:2182-2234 · v2.1:2617-2669: `POST /api/generate` con `prompt:""`, `keep_alive` y las **mismas** `options` (comentario explícito: «si no, Ollama recarga el modelo con otra ventana y el precalentado no sirve»), timeout 120 s |
| Perfil expuesto | `GET /api/ollama/perf?model=` — v2.0:2159-2176 · v2.1:2594-2615 (`suggestedOptions`, `contextCharBudget`, `keepAlive`, `notes`) |
| Salud profunda | `GET /api/health/deep` — v2.0:2301 · v2.1:2954 |

### 9.3 "Modo 8 GB" [HECHO] — son **dos cosas distintas** con el mismo nombre

1. **Modo 8 GB de UI** (`src/constants.ts:318-322`, `:245`): perfil `"auto" | "8gb"` que en CSS apaga
   `backdrop-filter` y animaciones infinitas (`src/index.css:555`, `App.tsx:404,960`,
   `Header.tsx:96,484-493`). **No toca** `num_ctx` ni ninguna opción de Ollama.
2. **Recorte de motor por RAM** (`modelTiers.ts:129,174,179,186,191,224-226`): cuando `RAM_GB <= 8`,
   baja `num_ctx`/`contextCharBudget` y añade la nota «num_batch reducido y contexto ajustado para evitar swap».

**[PROMETIDO]** El doc (§8, línea 158) dice «usa modelos 0,4-1,5 GB con el **Modo 8 GB** activado» como si
fuera un único ajuste de rendimiento; en el código el botón de UI **no influye** en los parámetros de Ollama.
El recorte de verdad es automático por RAM detectada, no por el botón.

---

## 10. Memoria viva (`memoria.md` + `cerebro.md`) en v2.1

### 10.1 Ficheros [HECHO]

| Fichero | Líneas | Naturaleza |
|---|---|---|
| `ide/backend/cerebro.md` | 179 | **Ley inmutable**: identidad, guardrails, protocolo rápido, estándares, auto-evolución, fast-decision (`cerebro.md:1-171`, 7 secciones) |
| `ide/backend/memoria.md` | 108 | **Estado vivo**: `ESTADO`, ADR log, preferencias, backlog, incidencias, métricas — con marcadores `<!-- BLOQUE-DINAMICO:X -->` (`memoria.md:13-108`) |

⚠️ Contexto: ambos archivos **ya existían en v1.0/v1.0.1/v1.0.2/v1.0.3/v1.1.1**; lo que v2.1 añade es el
**motor que los consume** (`brain.ts`). v2.0 **no tiene** `brain.ts` (sólo los recibe como
`hiddenSystemFiles` enviados por el cliente, `server.ts` v2.0:3949-3955).

### 10.2 Cómo se consumen (rastreo de código) [HECHO]

| Aspecto | Evidencia |
|---|---|
| Instanciación | `server.ts` v2.1:973 `const brain = new Brain(process.cwd())` |
| Rutas | `brain.ts:68-74`: `cerebro.md`, `memoria.md`, `memoria_history/`, propuestas en `.cerebro-db/proposals`, lock en `.cerebro-db/memoria.lock` |
| Carga al arrancar | `server.ts:987-995` `brain.load()` + log de `brain.stats()` (`cerebro.md N chars · memoria.md N líneas · historial · propuestas`) |
| **¿Se inyecta en el prompt?** | **SÍ.** `server.ts:4803-4816`: nivel por tier (`micro/tiny→micro`, `small→compact`, `medium→standard`, `large/cloud→pro`), `bloqueBrain = brain.systemBlock(nivel)`, y **sólo si `brain.getCerebro().length > 200`**. Se antepone a `consolidatedSystemInstruction`, que es **el punto único de los 6 proveedores** |
| Niveles del bloque | `brain.ts:495-563`: `micro` → 7 reglas fijas + estado en 1 línea; `compact` → `cerebroCondensado()` (≤4.200 car., `:484-493`) + estado, **sin incidencias**; `standard/pro` → cerebro completo + estado + **últimas 3 incidencias** + protocolo de cierre obligatorio |
| **¿El motor escribe en `memoria.md`?** | **SÍ**, 5 vías: (a) `registrarFallo()` en cada error de herramienta (`server.ts:1120` → `brain.ts:289-293`); (b) `registrarInteraccion()` en cada turno (`server.ts:4818` → `brain.ts:342-345`); (c) `bumpMetrica()` ×5 claves; (d) `addDecision/addLesson/addIncident` vía `POST /api/brain/{decision,lesson}`; (e) `compactar()` |
| Escritura atómica | `brain.ts:143-147`: `writeFileSync(tmp)` + `renameSync(tmp, ruta)`; lock cooperativo con `memoria.lock` y timeout 3.000 ms (`:105-141`) |
| **¿Métricas en memoria.md?** | **SÍ**: bloque `METRICAS` con `Interacciones registradas`, `Archivos rechazados por el blindaje`, `Imports sin resolver detectados`, `Propuestas de auto-mejora pendientes`, `Incidentes registrados` (`brain.ts:298-321`) |
| Compresión | cada **10** interacciones (`brain.ts:342-345`): `compactar()` conserva las **12** incidencias más recientes + las que casan `crític|critic|blindaje|corrup` (`:351-361`) y deja snapshot |
| **¿`memoria_history/` con rollback?** | **SÍ.** `snapshot()` (`:150-177`) escribe `memoria_history/memoria_YYYYMMDD_HHMMSS.md`, con **máx 1 cada 20 s** y **retención de 60** copias. `listarHistorial()` (`:428-442`). **Rollback real**: `POST /api/brain/rollback` (`server.ts:2467-2473`) → `brain.rollback(archivo)` (`:444-462`) que hace snapshot `pre-rollback` y restaura con escritura atómica |
| Otros endpoints | `GET /api/brain` (stats+memoria+historial+propuestas, `server.ts:2409-2422`), `POST /api/brain/state|decision|lesson|scan|compact`, `GET /api/brain/history` (`:2462`), `GET /api/brain/prompt` (`:2480`) |
| Auto-parcheo del CEREBRO | `brain.ts:366-423`: `detectarPropuestas()` parsea bloques `[PROPUESTA DE AUTO-MEJORA CEREBRO]` de la respuesta del modelo y los guarda como **propuesta en `.cerebro-db/proposals/` — NUNCA se aplican solas** (`:404-406`) |
| Rol en la práctica | la propia `memoria.md:96-98` muestra 3 propuestas reales ya registradas → **[HECHO] el bucle se ejecutó en el entorno del autor** |

### 10.3 RAG local de la memoria [HECHO, apagado por defecto]

- `LocalRAG` (`localRAG.ts`, 389 líneas): embeddings vía Ollama `/api/embed`, **fallback determinista** por
  hashing de tokens (256 dims) cuando no hay modelo; índice compacto en `Float32Array` (4 B/dim, novedad v2.1);
  `RAG_THRESHOLD_LINES = 5000` (`:55`).
- Coste en reposo cero: `server.ts:4829` sólo entra `if (localRag.isEnabled())`, con presupuesto
  `nivelBrain === "micro" ? 600 : 1400` (`:4830-4838`).
- Endpoints `/api/rag/{status,toggle,model,index,search,clear}` y `/api/features/deep-index`
  (`server.ts:2326-2406`).

---

## 11. Panel de "Autosuperación"

### 11.1 Frontend [HECHO]

| Elemento | Ubicación |
|---|---|
| Componente | `src/components/SelfImprovementPanel.tsx` (importado en `App.tsx:69`, renderizado en `App.tsx:3121-3126`) |
| Pestañas | `metricas` / `lecciones` (`SelfImprovementPanel.tsx:45`) |
| **KPIs mostrados** | **Éxito %**, **Primer token (s)**, **Turno medio (s)**, **Tokens/s** (`:139-153`) |
| Tendencia | `firstTokenTrendPct` vs sesión anterior con mensajes «Mejorando…» / «Cuidado…» (`:156-166`) |
| Rendimiento por modelo | tabla por modelo: turnos, éxito, primer token (`:171-…`) |
| Fuente de datos | **localStorage del navegador**, no el servidor: claves `cerebronico_lessons_v2`, `cerebronico_metrics_v2`, `cerebronico_metrics_session` (`selfImprovement.ts:88-93`) |
| Límites | `MAX_LESSONS = 120`, `MAX_METRICS = 400` (`:92-93`) |

### 11.2 Motor de la autosuperación [HECHO] (`src/utils/selfImprovement.ts`, 427 líneas)

| Pieza | Línea | Detalle |
|---|---|---|
| `TurnMetric` | 55-72 | `at, provider, model, firstTokenMs?, totalMs, tokensOut?, ok, failureKind?, tier?, attempts?` |
| `recordTurnMetric` | 254-259 | push + recorte a 400 |
| `getImprovementSummary` | 266-330 | éxito %, medias de primer token y total, **tokens/s = mean(tokensOut / (totalMs/1000))**, tendencia vs sesión previa, top-5 fallos, lecciones, `byModel` |
| `getRelevantLessons(text, 4)` | 192-220 | score = `solape*1.6 + peso*1.2 + recencia*0.4 + eficacia*0.8 − fatiga*0.6`, umbral `>0.9`, marca `used/lastUsedAt` |
| `buildSelfImprovementDirective(lessons, 700)` | 226-232 | bloque `[LECCIONES APRENDIDAS — aplica esto sin que te lo pidan]`, presupuesto 700 car. |
| `confirmLastLessonsUsed(ok)` | 169-185 | refuerza (`helped+1`, `weight+0.08`) o enfría (`−0.04`) las lecciones usadas en los últimos 10 min |
| `reflectOnTurn(...)` | 361-427 | reflexión **determinista** (0 tokens de modelo): corrección de usuario, `quota`, `auth`, `timeout`, error genérico, micro/tiny con tarea de herramientas, primer token ×2 sobre baseline, éxito notable |

### 11.3 Dónde se mide y dónde se inyecta [HECHO]

| Paso | Ubicación |
|---|---|
| Cierre de turno → métrica + lección | `App.tsx:1197-1253` (efecto al dejar de hacer streaming): `totalMs`, `firstTokenMs`, `looksFailed` por heurística de texto, `tokensOut: Math.round(text.length/4)`, `recordTurnMetric`, `confirmLastLessonsUsed`, `reflectOnTurn`, `setImprovementSummary` |
| Inyección de lecciones en el prompt | `App.tsx:1838-1850`: `getRelevantLessons(text, 4)` → `buildSelfImprovementDirective(...)` pasado como `extra` al payload de contexto |

⚠️ **[HECHO] tokens/s y TTFT son estimaciones de cliente**: `tokensOut = caracteres/4` (`App.tsx:1227`) y
`firstTokenRef` lo fija el render del primer chunk. **El servidor no mide TTFT ni tokens/s reales**
(no hay endpoint de métricas de inferencia; `tokensPerSec: 64.2` aparece en `server.ts` v2.1:4427/4470 sólo
como **literal dentro del texto de la respuesta autónoma de fallback**, no como telemetría).

---

## 12. Verificación reproducida: ¿existe el arnés de "21 PASS"?

### 12.1 Lo que dice el doc (§6, líneas 120-132)

| Comprobación declarada | Método | Resultado declarado |
|---|---|---|
| Sintaxis de 57 archivos TS/TSX | `esbuild` transformando cada archivo | 0 fallos |
| Grafo de imports del cliente | `esbuild --bundle src/main.tsx` | OK (651,9 kB + 10,9 kB CSS) |
| Grafo de imports del servidor | `esbuild --bundle server.ts` | OK (203,2 kB) |
| Blindaje de sintaxis | 9 casos | 9 PASS / 0 FAIL |
| Base de datos del motor | 7 casos | 7 PASS / 0 FAIL |
| Blindaje de llamadas | 5 casos | 5 PASS / 0 FAIL |
| Instalador | ejecución real | OK |
| **Total** | | **21 PASS / 0 FAIL** |

### 12.2 Lo que existe realmente en el repo [HECHO]

| Script de prueba | Ruta | ¿Reproducible? |
|---|---|---|
| `PRUEBAS_MANUALES_MOTOR.ts` (23 líneas, **10 checks**) | `v2.0/CerebroNico-IDE-v2.0/` y `v2.1/CerebroNico-IDE-v2.1/` (idénticos) | **NO.** Su `import` apunta a una ruta absoluta de **otra cuenta y otro proyecto**: `<sesion-anterior>/project/build/…` (`:1-2`). Esa ruta **no existe** en este entorno ⇒ `tsx`/`node` falla al resolver el import |
| `tests/comprehensive_e2e_test.py` (39.630 B) | ambas versiones (idénticos) | **SÍ, con matices:** es un test E2E del **endpoint `/api/ai/stream`** con mocks de 4 proveedores y verificación de streaming + regresión del bug `req.on("close")`. **No contiene ni una referencia** al motor (`rg 'engine\|syntaxGuard\|kb\|symbol\|compactor'` → 0 coincidencias) |
| `tests/mock_ollama.py` (6.060 B) | ambas | Apoyo del anterior |
| Suites de sintaxis / KB / tool-calls del doc (9+7+5) | — | **NO EXISTEN como ficheros** en ninguna de las dos versiones |
| Suite que produce las 40 líneas `PASS` de `RESULTADO_PRUEBAS_MOTOR.txt` | — | **NO EXISTE**: la cadena «FASE 1 · blindaje de sintaxis» sólo aparece en el propio `.txt` y en comentarios de `server.ts`/`syntaxGuard.ts`, nunca en un runner |

**Comandos reales disponibles (`package.json`, idéntico en v2.0 y v2.1):**

```jsonc
"dev":           "tsx server.ts",
"build":         "vite build && esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs",
"start":         "node dist/server.mjs",
"lint":          "tsc --noEmit",
"test:e2e":      "python3 tests/comprehensive_e2e_test.py",
"postinstall":   "node scripts/postinstall.mjs"
```

- `npm run build` ejecuta el `esbuild` que sostiene la fila 1-3 de la tabla del doc (no hay script de
  "57 archivos"; sería un bucle manual).
- `npm test` **no existe**: el único test enganchado es `test:e2e` (Python) y **no cubre el motor**.
- No hay `vitest`/`jest` en dependencias (`devDependencies` listadas: electron, esbuild, tsx, typescript,
  vite, @types/*, @vitejs/plugin-react).

### 12.3 Comprobación estática adicional que aporta esta auditoría [HECHO]

`manuals.ts` devuelve objetos tipados como `KbEntry` con **dos campos que ese tipo no admite**:

```ts
// manuals.ts:28-36
const M = (...): KbEntry => ({ id, table: "manual", title, body, keys, tags, weight, lang: "es" });
//                                          ^^^^^^^^^^^^^^^^   ^^^^
// KbTable (knowledgeBase.ts:32) = "syntax"|"error"|"pattern"|"tool"|"skill"|"rule"|"project"|"lesson"
// KbEntry (knowledgeBase.ts:34-45) NO declara `tags`
```

⇒ `npm run lint` (`tsc --noEmit`) debería fallar con `TS2353`/`TS2820` en `manuals.ts`. Esto **no invalida**
la fila de `esbuild` del doc (esbuild **no** comprueba tipos), pero sí demuestra que **la verificación
declarada no fue `tsc`**. **[DUDOSO]** no se pudo ejecutar `tsc` aquí (sin `node_modules` ni red); queda como
hallazgo de análisis estático, con alta confianza por la definición literal de los tipos.

---

## 13. `RESULTADO_PRUEBAS_MOTOR.txt` — contenido completo

**Localización:** `v2.0/CerebroNico-IDE-v2.0/RESULTADO_PRUEBAS_MOTOR.txt` y
`v2.1/CerebroNico-IDE-v2.1/RESULTADO_PRUEBAS_MOTOR.txt` — **mismo `md5` (`1d43d3ce…`)** y además **idéntico
al de v1.0.1, v1.0.2, v1.0.3 y v1.1.1** ⇒ **[HECHO] es un artefacto arrastrado, no una verificación de v2.1
(48 líneas):**

```
 ── FASE 1 · blindaje de sintaxis ──
   PASS TSX válido
   PASS JSON roto rechazado
   PASS JSX sin cerrar rechazado
   PASS llaves desbalanceadas
   PASS truncado con «…»
   PASS Python sin ':'
   PASS Python correcto
   PASS CSS desbalanceado
 ── FASE 1 · base de datos y herramientas ──
   PASS semilla >= 25 entradas
   PASS consulta json devuelve entradas
   PASS consulta de RAM devuelve err-oom/err-timeout
   PASS sin relación no inventa
   PASS llamada válida
   PASS falta obligatorio
   PASS campo inventado se descarta
   PASS número en texto se convierte
 ── FASE 2 · índice de símbolos ──
   PASS detecta la interfaz Props
   PASS detecta el componente Panel
   PASS detecta la clase Store
   PASS detecta el método save
   PASS detecta helper como función exportada
   PASS guarda la línea correcta
   PASS detecta def de Python
   PASS detecta class de Python
   PASS mapa con total > 0
   PASS findSymbols encuentra Panel
   PASS findSymbols no inventa
   PASS resumen de símbolos dentro del presupuesto
   PASS resumen avisa de no inventar
 ── FASE 2 · compactador de contexto ──
   PASS archivo grande se compacta
   PASS ahorro superior al 60%
   PASS conserva la firma final
   PASS log se compacta
   PASS conserva la línea de ERROR
   PASS conserva el traceback
   PASS JSON grande se resume
   PASS el resumen informa del tamaño del array
   PASS salida corta no se toca
   PASS los errores NO se compactan
   PASS los aciertos SÍ se compactan

 RESULTADO FINAL: 40 PASS · 0 FAIL
```

### 13.1 Contradicciones detectadas en ese artefacto

| Línea del informe | Contra el código auditado | Gravedad |
|---|---|---|
| `PASS JSX sin cerrar rechazado` | **No puede reproducirse**: `checkTagPairing` sólo se invoca con `"html"` (`syntaxGuard.ts:401`); el camino `"jsx"` (`:191,216-221`) es código muerto. Un `.tsx` con etiqueta sin cerrar devuelve `ok:true` | **Alta** — invalida la fila |
| `PASS Python sin ':'` | En **v2.1** los issues de Python **no bloquean** (`:435-446`): `ok` sería `true`. El PASS describe comportamiento **v2.0** | Alta (v2.1) |
| `PASS llaves desbalanceadas` | Sólo bloquean en `css`/`html`. Si el caso era `.ts`, no se comprueba balance (`:364-367`) | Media |
| `FASE 2 · compactador`: `PASS ahorro superior al 60%` | La estrategia `file` conserva 40 firmas + 50 líneas y marca el hueco: el ahorro depende del archivo; **no hay aserción de ≥60%** en ningún código entregado | Media |
| Total **40 PASS** vs doc §6 «**21 PASS** (9+7+5)» | **Dos cifras distintas para la misma verificación**; ninguna de las dos tiene runner en el repo | Alta (trazabilidad) |

**[DUDOSO]** El contenido del `.txt` **es técnicamente plausible** (los 40 casos describen exactamente el
comportamiento que el código implementa, en su gran mayoría), pero **es un volcado sin runner**.
Regla para la V8: **no se fusiona nada cuya única evidencia sea este fichero**.

---

## 14. Matriz doc↔código (todo el `IDEA_DEL_MOTOR_v2.0.md`)

| # | Afirmación del doc (línea) | Veredicto | Evidencia |
|---|---|---|---|
| 1 | KB persistida en `.cerebro-db/kb.json` (24) | **HECHO** | `server.ts` v2.0:842-843 · v2.1:961-962 |
| 2 | Sin embeddings, recuperación determinista por solape + prioridad + peso (26-28) | **HECHO** | `knowledgeBase.ts:185-213` |
| 3 | **28 entradas** de fábrica (30) | **FALSO** | 32 en `KB_SEED`; 62 con manuales (`:76-120`, `manuals.ts:282`) |
| 4 | 8 tablas con el contenido descrito (32-41) | **HECHO con matiz** | las 8 existen (`:32`), pero los manuales usan una 9ª tabla **fuera del tipo**: `"manual"` (`manuals.ts:28-36`) |
| 5 | `project` se rellena solo vía `/api/engine/sync` (40) | **HECHO** | `server.ts` v2.0:2117-2128 · v2.1:2552-2563 + `reindexProjectSymbols` |
| 6 | `lesson` se rellena desde el bucle de autosuperación (41) | **HECHO parcial** | `learnFromLesson` existe (`:143-152`) y hay endpoint; pero **el bucle de autosuperación del cliente escribe en `localStorage`, no en la KB del motor** — las lecciones **no** llegan a `.cerebro-db/kb.json` salvo POST manual |
| 7 | `buildEngineContext()` con las **5** más relevantes (43-46) | **HECHO** | `limit=5` en `server.ts` v2.0:4868 · v2.1:5770 |
| 8 | Presupuesto **700 micro / 1200 resto** (46) | **HECHO** | v2.0:4869 · v2.1:5771 |
| 9 | «Cambiar de modelo no cambia el resultado» (17-18) | **PROMETIDO (parcial/falso)** | KB+manuales+símbolos sólo en la ruta Ollama: v2.0:4827-4900 · v2.1:5728-5801 vs rutas nube 4924-5659 (v2.1) |
| 10 | Endpoints del motor listados (48-50) | **HECHO** | 8/8 presentes (§2.5) + 15 extra en v2.1 |
| 11 | «nada llega al disco sin validarse», escritura rechazada/revertida (56-60) | **HECHO** | 5 puertas (§3.4): `write_file`, `edit_file`, `/api/engine/guard`, `/api/fs/write`, `/api/fs/sync` |
| 12 | JSON inválido con `JSON.parse` (64) | **HECHO** | `syntaxGuard.ts:352-362` |
| 13 | Paréntesis/corchetes/llaves desbalanceados ignorando strings y comentarios (65-66) | **PROMETIDO** | `scanBalance` correcto pero **sólo** para `html`/`css` (`:398-407`) |
| 14 | Cadenas y plantillas sin cerrar; comentarios de bloque sin cerrar (67) | **PROMETIDO parcial** | backticks **retirados** (`:382-393`); `/*` sólo si abre línea (`:372`) |
| 15 | JSX/HTML etiquetado pareado, incluidos `<Componente>` (68-69) | **PROMETIDO** | `checkTagPairing(...,"jsx")` nunca se llama: código muerto |
| 16 | CSS: llaves desbalanceadas (70) | **HECHO** | `:403-407` |
| 17 | Python: tabs/espacios + `def/if/for/while/class` sin `:` (71) | **HECHO (detecta)** — pero en v2.1 **no bloquea** | `:261-300`, `:435-446` |
| 18 | Marcadores de truncamiento (`…`, `<...>`, «resto del código», TODO) (72-73) | **HECHO con matiz** | sólo si están en las **últimas 3 líneas** (`:338`) |
| 19 | `POST /api/engine/guard` disponible (75) | **HECHO** | v2.0:2106 · v2.1:2541 |
| 20 | `validateToolCall()` en `knowledgeBase.ts`, aplicado en `executeToolCall()` (81) | **HECHO** | `:265-320` + v2.0:1017 · v2.1:1176 |
| 21 | Faltante / inventado (se descarta) / tipo / coerción `"40"→40` / enum (86-89) | **HECHO** | 5 vías verificadas una a una (§4) |
| 22 | `postinstall.mjs` crea KB + `tools.config.json` + informe de entorno (97-104) | **HECHO** | `scripts/postinstall.mjs`; v2.1 además garantiza salida 0 (`:23-43,163-166`) |
| 23 | Verificación: esbuild 57 archivos / bundles 651,9 kB / 203,2 kB (124-126) | **[DUDOSO]** | el `npm run build` existe (`package.json`), pero **no hay script de 57 archivos ni log en el repo**; no ejecutable sin `node_modules` |
| 24 | «9 PASS / 7 PASS / 5 PASS = 21 PASS» (127-132) | **FALSO (no reproducible)** | no existe runner; `RESULTADO_PRUEBAS_MOTOR.txt` dice **40 PASS** con otro desglose |
| 25 | §7 Honestidad: app no arrancada, perfiles no medidos (136-145) | **HECHO (autocrítica correcta)** | confirmado: nada en el repo mide TTFT/tok-s reales |
| 26 | §9.2 unificar `src/utils/resilience.ts` con `engine/resilience.ts` (167-168) | **FALSO / NULO** | `src/utils/resilience.ts` **no existe en ninguna versión**; `engine/resilience.ts` idéntico en v2.0/v2.1 |
| 27 | §9.3 indexar símbolos además de rutas (169-170) | **HECHO** | `symbolIndex.ts` + `symbols:<path>` en KB |
| 28 | Fase 2 §1: firma real, `[SÍMBOLOS REALES DEL PROYECTO]`, 700/1300 (191-193) | **HECHO** | `symbolIndex.ts:173-185`; v2.0:4897 · v2.1:5799 |
| 29 | Fase 2 §1: coste ~400 car. vs ~12.000 (200) | **[DUDOSO]** | el resumen está acotado a 700/1300 car. por diseño; la cifra 400/12.000 no se mide en código |
| 30 | Fase 2 §1: `find_symbol` y endpoints `symbols`/`sync` (196-204) | **HECHO** | `toolRegistry.ts:401-413`; endpoints §2.5 |
| 31 | Fase 2 §2: 4 estrategias de compactación (213-218) | **HECHO** | `compactor.ts:70-110` |
| 32 | Fase 2 §2: «los errores no se compactan nunca» (220-221) | **HECHO** | `compactor.ts:179` + `server.ts` v2.0:1493-1499 · v2.1:1652-1660 |
| 33 | Fase 2 §3: cada error real → entrada `error` normalizada, deduplicada, acotada (225-229) | **HECHO** | §7 (regex `<ref>`/`<n>`, id `fail:tool:slug`, 180/200 car.) |
| 34 | Fase 2 §5.2: indexar también Python y CSS/HTML (240) | **PROMETIDO** | Python **sí** (`PY_PATTERNS`); **CSS/HTML no** (`guessLanguage` no los mapea, `:125-131`) |
| 35 | (implícito §2) el motor "sabe" y el modelo "lee" | **HECHO en Ollama, PROMETIDO en nube** | punto 9 y §2.4 |

---

## 15. Módulos: verificados y listos para fusionar vs prometidos sin código

### 15.1 ✅ VERIFICADOS Y LISTOS PARA FUSIONAR EN V8 (código completo, autocontenido, sin dependencias)

| Módulo | Líneas | Por qué es fusionable tal cual | Riesgo al fusionar |
|---|---|---|---|
| `src/engine/knowledgeBase.ts` | 320 | KB+contexto+validación de tool-calls; puro, sin dependencias, persistencia delegada al servidor | Corregir `KbTable`/`KbEntry` para admitir `manual` y `tags` (o cambiar `manuals.ts`) |
| `src/engine/syntaxGuard.ts` **(versión v2.1)** | 479 | guardián con política conservadora ya validada contra 63 archivos reales; v2.1 arregla 4 falsos positivos | Activar `checkTagPairing(...,"jsx")` para `.tsx` **sólo** si se añade lista blanca de mayúsculas; hoy es dead code |
| `src/engine/symbolIndex.ts` | 185 | análisis estático sin dependencias; alimenta prompt y herramienta | Bug de fidelidad: en el resumen los nombres van en `.toLowerCase()` (`:181`) pero el modelo debe escribir el nombre real (`:182` dice «usa estos nombres») |
| `src/engine/compactor.ts` | 197 | determinista, con la regla de oro "errores intactos" | 6 estrategias dependen de `detectKind`, basado en heurísticas frágiles (`:126-141`) |
| `src/engine/resilience.ts` | 302 | clasificación de errores + retry + cortacircuitos + fallback | `sleep` duplicado en `server.ts`; `jitter` no exportado |
| `src/engine/modelTiers.ts` | 336 | fuente única de perfiles, coherente con RAM real | `num_predict` negativo no se envía: con `large/cloud` no hay tope |
| `src/engine/manuals.ts` | 308 | 5 leyes + 19 manuales + 6 procedimientos consultables | **falla `tsc`** (tabla `"manual"`, campo `tags`) |
| `src/engine/toolRegistry.ts` | 571 | registro de esquemas reutilizable por `validateToolCall` | — |
| `src/engine/importChecker.ts` **(v2.1)** | 269 | detecta imports rotos + genera stubs de componente y de módulo | los stubs "no-op" pueden silenciar un fallo real si no se registran en el log |
| `src/engine/brain.ts` | 577 | gobernanza con escritura atómica, snapshots, retención 60, rollback real | requiere `cerebro.md`/`memoria.md` en `process.cwd()`; los niveles hardcodean texto de ley |
| `src/utils/selfImprovement.ts` | 427 | bucle medible de lecciones+métricas+reflexión, sin tokens de modelo | persiste en `localStorage`: no es memoria del motor, es memoria del navegador |
| `src/engine/projectPorter.ts` | 252 | normaliza puertos de proyectos importados (caso ScanMed) | hace *patching* de `package.json`/`vite.config` con respaldos |
| `src/engine/advancedFeatures.ts` + `hardwareGovernor.ts` + `cloudVerifier.ts` | 1.062 | interruptores "construido pero apagado", veredicto por RAM libre, verificación en nube | coste en cuota/latencia; requieren claves de API |

### 15.2 ⚠️ PROMETIDOS SIN CÓDIGO (no fusionar como "probado")

| Promesa | Estado | Qué habría que construir |
|---|---|---|
| Suite determinista "21 PASS (9+7+5)" | **No existe runner** | portar los casos a un único `engine.test.ts` ejecutable con `tsx` y `npm test` |
| Suite "40 PASS" de `RESULTADO_PRUEBAS_MOTOR.txt` | **No existe runner**; 3 de sus PASS contradicen el código | reejecutar y **regenerar** el fichero desde CI/local |
| `PRUEBAS_MANUALES_MOTOR.ts` funcional | **Roto**: importa de otra cuenta/ruta inexistente | reescribir imports a rutas relativas (`../ide/backend/src/engine/...`) |
| JSX con etiquetas pareadas | **Dead code** | invocar `checkTagPairing(text,"jsx")` para `.tsx/.jsx` con lista blanca |
| Balance de llaves/paréntesis en TS/JS | **Retirado a propósito** | sólo viable con parser real (p. ej. `esbuild`/Babel en modo "syntax-only") |
| Detección de cadenas/plantillas sin cerrar | **Retirada a propósito** | idem anterior |
| Índice de símbolos para CSS/HTML | **No implementado** | añadir patrones y `guessLanguage` |
| Inyección de KB+manuales+símbolos en modelos de nube | **No implementado** | punto único de composición de prompt para los 11 caminos de proveedor |
| Unificación de resiliencia (§9.2) | **Objetivo nulo / no ejecutado** | integrar `classifyError`/`withRetry` en `healthCheck.ts`, `selfHealing.ts`, `restorePoints.ts` y en el bucle de reconexión de `server.ts` |
| Medición real de TTFT / tokens-s del motor | **No existe** | endpoint `/api/ollama/metrics` que registre `eval_count`/`prompt_eval_duration` de Ollama (los campos ya llegan en la respuesta de Ollama y se descartan) |
| `lesson` escrito por el bucle de autosuperación en la KB del motor | **Parcial** | POST del cliente a `/api/engine/kb/learn` al cerrar turno |

---

## 16. Hallazgos clave para la fusión V8 (priorizados)

1. **El motor compartido está congelado y es de fiar; la capa de gobernanza es lo nuevo.**
   Los 7 módulos que sostienen la idea (KB, símbolos, compactador, resiliencia, toolRegistry, modelTiers,
   manuals) son **byte-idénticos** entre v2.0 y v2.1. Fusionar "v2.1" = fusionar `brain.ts` + `localRAG.ts`
   + `advancedFeatures.ts` + `hardwareGovernor.ts` + `cloudVerifier.ts` + `projectPorter.ts` +
   `syntaxGuard`/`importChecker` afinados + 941 líneas nuevas de `server.ts`.

2. **El "modelo-agnosticismo" no está implementado: es el mayor riesgo funcional de la idea.**
   `[CONOCIMIENTO DEL MOTOR]`, `[MANUAL DEL MOTOR]` y `[SÍMBOLOS REALES DEL PROYECTO]` sólo se componen en
   la rama Ollama (`server.ts` v2.1:5728-5801). Un GLM/Gemini/OpenRouter recibe la ley (v2.1) pero **no
   recibe la KB ni el índice de símbolos**. Es exactamente lo contrario de «el conductor puede ser
   cualquier flacucho». **P0 para V8.**

3. **El guardián está donde debe (conservador) pero cubre menos de lo que el doc cree.**
   Balance de delimitadores y etiquetado JSX **no** se aplican a TS/TSX/JS (retirados a propósito para
   eliminar 32/63 falsos positivos). Lo que sí bloquea de forma fiable: JSON inválido, truncamiento al final,
   `/*` sin cerrar, HTML/CSS desbalanceado. Y **v2.1 dejó el análisis de Python como aviso no bloqueante**.
   Para V8: sustituir heurísticas por `esbuild transform` en modo sintaxis (sin escribir en disco) —
   da JSX y balance reales sin falsos positivos.

4. **La "memoria viva" funciona de verdad y es el activo más valioso de v2.1.**
   `brain.ts` escribe en `memoria.md` con lock + `tmp`+`rename`, guarda snapshots en `memoria_history/`
   (retención 60, 1 cada 20 s), comprime cada 10 interacciones y soporta `/api/brain/rollback` real.
   Además, cada fallo de herramienta alimenta **dos** memorias: KB (`fail:<tool>:…`) e Incidencias de
   `memoria.md`. `cerebro.md` es **inmutable por diseño**: las propuestas se guardan, nunca se auto-aplican.
   Evidencia de uso real en `memoria.md:96-98`.

5. **La trazabilidad de las pruebas es el punto más débil; nada del motor está "probado" de forma reproducible.**
   `RESULTADO_PRUEBAS_MOTOR.txt` (40 PASS) tiene **el mismo md5 desde v1.0.1**, no tiene runner, y al menos
   tres de sus PASS (`JSX sin cerrar`, `Python sin ':'`, `llaves desbalanceadas`) **contradicen el código
   auditado**, que además declara **21 PASS** en el doc. `PRUEBAS_MANUALES_MOTOR.ts` no compila (import a otra
   cuenta). El único test ejecutable (`test:e2e`) **no toca el motor**. **Antes de fusionar: crear el runner.**

### 16.1 Deuda técnica concreta detectada (checklist de fusión)

| # | Hallazgo | Ubicación | Tipo |
|---|---|---|---|
| 1 | `manuals.ts` usa `table:"manual"` y `tags` fuera de `KbEntry` ⇒ `tsc --noEmit` falla | `manuals.ts:28-36` vs `knowledgeBase.ts:32-45` | Tipo / CI |
| 2 | `checkTagPairing(...,"jsx")` es código muerto (JSX no validado) | `syntaxGuard.ts:191,216-221,401` | Funcional |
| 3 | `unclosedString` se calcula y se descarta | `syntaxGuard.ts:95,186` | Funcional |
| 4 | Dedupe de "issue no bloqueante" por substring `"se ha ignorado"` | `knowledgeBase.ts:318` | Robustez |
| 5 | `buildEngineContext` en el endpoint usa 1100 en vez de 700/1200 | `server.ts` v2.0:2060 · v2.1:2495 | Consistencia |
| 6 | `fromJSON` no re-siembra `MANUAL_ENTRIES` si el JSON es antiguo | `knowledgeBase.ts:226` | Regresión silenciosa |
| 7 | Resumen de símbolos en minúsculas contradice «usa estos nombres» | `symbolIndex.ts:179-182` | Calidad de prompt |
| 8 | `num_predict: -1` nunca se envía a Ollama (sin tope real en large/cloud) | `modelTiers.ts:295` | Rendimiento |
| 9 | `tokensOut = caracteres/4` y TTFT estimados en cliente | `App.tsx:1227`, `selfImprovement.ts:55-72` | Medición |
| 10 | Botón "Modo 8 GB" (UI) no influye en `num_ctx`; el recorte real es por `RAM_GB` | `constants.ts:318-322` vs `modelTiers.ts:129` | UX/doc |
| 11 | Duplicación real de reintentos fuera de `resilience.ts` | `server.ts` v2.1:5860-5930; `utils/healthCheck.ts`, `selfHealing.ts` | Deuda |
| 12 | Indexación CSS/HTML de símbolos no existe | `symbolIndex.ts:125-131` | Alcance |

---

## 17. Resumen ejecutivo (10 líneas)

1. El motor central de v2.0 y v2.1 es **el mismo código**: 7 de 11 módulos de `src/engine/` son byte-idénticos.
2. v2.1 aporta la **capa de gobernanza y memoria viva** (`brain.ts`, `localRAG.ts`, `advancedFeatures.ts`,
   `hardwareGovernor.ts`, `cloudVerifier.ts`, `projectPorter.ts`) más 941 líneas nuevas en `server.ts`.
3. La idea «el conocimiento vive en el motor» está **implementada para Ollama** (KB + manuales + símbolos
   inyectados cada turno con presupuesto 700/1200) y **no implementada para la nube** (P0 de la V8).
4. La KB es determinista y auditable (62 entradas de fábrica, 8 tablas + 1 tabla fantasma `manual`),
   con scoring explícito; el doc dice 28 entradas y se queda corto respecto a su propio código.
5. `SyntaxGuard` **sí** aplica ya la política conservadora (ADR en `memoria.md:25-29`), pero cubre menos de
   lo que promete: sin balance en TS/JS, sin JSX, sin cadenas/plantillas; Python no bloqueante en v2.1.
6. `validateToolCall` y `compactor` funcionan exactamente como se documentan (incluida la regla
   «los errores no se compactan nunca», `compactor.ts:179`).
7. La duplicación de resiliencia que manda arreglar la IDEA §9.2 **no existe**: `src/utils/resilience.ts`
   nunca existió; v2.1 no tocó `resilience.ts` en absoluto.
8. Los perfiles de rendimiento están completos y coherentes por tier/RAM; el "Modo 8 GB" de la UI es sólo
   cosmético y el precalentado (`/api/ollama/warmup`) reserva el mismo contexto que el chat.
9. La verificación declarada (21 PASS en el doc, 40 PASS en el `.txt`) **no es reproducible**: no hay runner,
   el fichero de resultados tiene el mismo md5 desde v1.0.1 y 3 de sus PASS contradicen el código.
10. La memoria viva de v2.1 (escritura atómica + `memoria_history/` + rollback + compresión cada 10 turnos)
    es sólida y es lo que más valor añade a la fusión; la autosuperación, en cambio, vive en `localStorage`
    y **no alimenta la KB del motor**.

### 17.1 Los 5 hallazgos para V8

| # | Hallazgo | Acción V8 | Prioridad |
|---|---|---|---|
| **H1** | El conocimiento del motor sólo llega a Ollama; la nube no recibe KB, manuales ni símbolos | Punto único `buildProviderSystemPrompt()` aplicado a los 11 caminos de proveedor | **P0** |
| **H2** | No hay verificación reproducible de nada del motor (`tsc` ni siquiera pasa por `manuals.ts`) | Arreglar tipos + crear `engine.test.ts` con `npm test`; regenerar `RESULTADO_PRUEBAS_MOTOR.txt` desde el runner | **P0** |
| **H3** | `SyntaxGuard` no valida balance ni JSX en TS/TSX (dead code) — el doc lo promete | Validación real con `esbuild transform` en memoria (sin escribir), manteniendo la política conservadora | **P1** |
| **H4** | La autosuperación escribe lecciones en `localStorage`, no en la KB del motor (`lesson` nunca se rellena sola) | Al cerrar turno, `POST /api/engine/kb/learn` con la lección; unificar con `brain.addLesson` | **P1** |
| **H5** | Medición inexistente: TTFT/tokens-s son estimaciones de cliente (`len/4`), y Ollama ya devuelve `eval_count`/`prompt_eval_duration` que se descartan | Endpoint de métricas que capture esos campos y los escriba en `memoria.md` (bloque `METRICAS`) | **P1** |

### 17.2 Veredicto de fusión

**Fusionar tal cual (probado en código):** `knowledgeBase.ts`, `syntaxGuard.ts` (v2.1), `symbolIndex.ts`,
`compactor.ts`, `resilience.ts`, `modelTiers.ts`, `toolRegistry.ts`, `importChecker.ts` (v2.1),
`brain.ts`, `selfImprovement.ts`, `projectPorter.ts`, `advancedFeatures.ts`, `hardwareGovernor.ts`,
`cloudVerifier.ts`, `localRAG.ts` (apagado), `manuals.ts` (**con el arreglo de tipos**).

**No fusionar como "probado" (sin código o sin runner):** suite de 21 PASS, runner de los 40 PASS,
`PRUEBAS_MANUALES_MOTOR.ts`, validación JSX/balance en TS/JS, cadenas/plantillas, símbolos CSS/HTML,
inyección de KB en nube, unificación de resiliencia, métricas de inferencia del servidor.


---

<a id="03-agentico-v1x-md"></a>
## (3/4) 03_agentico_v1x.md

> **Fuente:** `audits/03_agentico_v1x.md`  —  **version:** 3.1  —  **bytes:** 112732
# AUDITORÍA TÉCNICA — NÚCLEO AGÉNTICO DE CEREBRÓNICO (línea CEREBRÓNICO-AGENTICO, v1.0 → v1.1.1)

> **Auditor:** auditor de código (agente) · **Fecha de auditoría:** 21-sep-2026
> **Objetivo:** informe exhaustivo del núcleo agéntico (entidades deterministas, espejos, reflejo, conductor, planificador, extensiones, forja) como base de planeación de la fusión **V8**.
> **Base de evidencia (solo código y documentos del propio repo):**
> `<sesion-anterior>/project/cerebronico_evolution/`
> **Versiones auditadas:** `v1.0/Cerebronico-v1.0`, `v1.0.1/Cerebronico-v1.0`, `v1.0.2/Cerebronico-v1.0.2`, `v1.0.3/Cerebronico-v1.0.3`, `v1.1.1/Cerebronico-v1.1.1` (la más reciente).
> **Rutas citadas:** relativas a la raíz de cada versión (`<V>/ide/backend/...`). Cuando la ruta es común a todas, se cita la de v1.1.1.
> **Convención:** `HECHO` = verificado leyendo el archivo citado (con línea). `PROMETIDO` = declarado en manual/CHANGELOG pero **no** verificado en código, o verificado solo parcialmente. `NO VERIFICABLE` = requiere `npm install` + ejecución (este entorno no tiene `node_modules`, ver §12.5).

---

## 0. Resumen ejecutivo (12 líneas)

1. Existe **una sola línea de producto** con dos nomenclaturas superpuestas: la **interna** (v2.4 → v2.5 → v2.6.2 → v2.6.3 → Reflejo v3.0 → Reflejo v5) y la **de producto** (v1.0.0 → v1.0.1 → v1.0.2 → v1.0.3 → v1.1.0 → v1.1.1); la correspondencia real está probada en §1.
2. El catálogo agéntico es **código determinista puro**: 50 entidades = 12 especialistas votantes + 38 herramientas (28 curadas + 10 espejos), definidas con `reg(...)` y materializadas en `ENTIDADES` (`consejo.ts:129,343`).
3. Las 20 despiertas / 18 dormidas **no** provienen del 4.º argumento de `reg()` sino de `ACTIVAS_POR_DEFECTO` + una sobreescritura global (`consejo.ts:334-339`) — hallazgo de auditoría relevante (§2.4).
4. Los 10 espejos devuelven **JSON compacto** y son puros de verdad: `espejos.ts` solo importa tipos + un módulo interno; **cero `node:*`**, cero red, cero modelo (§3.9).
5. El **reflejo** del servidor usa tablas v3 (`tablas-lite-v3.json` 359 KB / `tablas-max-v3.json` 2,03 MB, 14.645 / 82.459 entradas) y mantiene las tablas v2.x como respaldo (§4).
6. El **conductor** (`POST /api/conductor`, `server.ts:3991`) implementa literalmente la cadena prometida: consejo con `confianza ≥ 0.8` → director Ollama con **una** ronda de reparación → fallback declarado con motivos (§5).
7. El **planificador** es real y honesto: validación de ciclos por tres colores, Kahn por capas, lotes paralelos, `resolverPresupuesto` con invariante `io ≥ 1 ∧ cpu ≥ 1` (nunca 0) y tope `io ≤ 16`, cancelación que despierta el bucle, reanudación de `en_curso` huérfanas (§6).
8. El **segundo plano** no es retórica: `planRunner.ts` envuelve el ejecutor con un **semáforo global por peso** para que N planes no multiplicen la carga de la máquina (§6.6).
9. **Extensiones** (caliente, iframe + `postMessage {cn:1}`) y **Forja** (`forjar_complemento` → `manifest.json` + `panel.html` deterministas) están implementadas y verificadas contra código; la Forja **no** confía nada crítico al modelo (§7, §8).
10. El frontend agéntico existe con nombre y línea: `EspinaActividad.tsx` (COREO, 11 acciones), `ConsejoPanel.tsx` (⚡ Consejo), `EspejosSelector.tsx`, `PanelAspecto.tsx` (A), `PluginForge.tsx` (Ⓐ/⚒ Forjar) (§11).
11. Las **puertas** declaradas son verificables por lectura pero **no reproducibles aquí**: `npm run validar` = 27 suites + puerta `tsc`; v1.1.1 reporta 1627·0·27 y el ANEXO del manual dice 1479·0·21 (§12) — son **estados distintos**, no contradicción.
12. **Deuda declarada-por-código** (útil para V8): `constants.ts:190` sigue diciendo `VERSION: "V1.0.3"` mientras `package.json` dice `1.1.1`; y `ESPEJOS_PERSONALIZADOS.md` afirma «no implementado todavía» cuando `cargadorEspejos.ts` + `pool.ts` + `tests/espejos-personalizados.test.ts` ya existen (§1.4, §15).

---

## 1. Correspondencia real de versiones (producto ⇄ interna)

### 1.1 Método

Se cruzaron tres fuentes independientes: `package.json` (versión publicada), `src/constants.ts` (`IDE_BRAND.VERSION`, fuente única de la marca en cabecera) y los CHANGELOG del repo.

| Evidencia | Ruta | Contenido |
|---|---|---|
| `package.json` v1.0.0 | `v1.0/Cerebronico-v1.0/ide/backend/package.json:4` | `"version": "1.0.0"` |
| `package.json` v1.0.1 | `v1.0.1/Cerebronico-v1.0/ide/backend/package.json:4` | `"version": "1.0.1"` |
| `package.json` v1.0.2 | `v1.0.2/Cerebronico-v1.0.2/ide/backend/package.json:4` | `"version": "1.0.2"` |
| `package.json` v1.0.3 | `v1.0.3/Cerebronico-v1.0.3/ide/backend/package.json:4` | `"version": "1.0.3"` |
| `package.json` v1.1.1 | `v1.1.1/Cerebronico-v1.1.1/ide/backend/package.json:4` | `"version": "1.1.1"` · `"name": "cerebronico-ide"` |
| `IDE_BRAND.VERSION` | `v1.1.1/.../src/constants.ts:190` | `VERSION: "V1.0.3"` ← **desincronizado** con package.json 1.1.1 |
| CHANGELOG acumulado | `v1.1.1/Cerebronico-v1.1.1/CHANGELOG_v1.0.md:73-77` | «CerebroNico v2.6.3 cierra su era; nace **CerebróNico V1.0** … package.json 1.0.0» |
| CHANGELOG v1.1.0 | `.../CHANGELOG_v1.1.0.md:1` | «CerebroNico v1.1.0 · **REFLEJO v5** (21-sep-2026)» |
| CHANGELOG v1.1.1 | `.../CHANGELOG_v1.1.1.md:1` | «CerebroNico v1.1.1 · **BUILD v1** (21-sep-2026)» |

### 1.2 Tabla de correspondencia (HECHO)

| Producto (ZIP / package.json) | Línea interna | Motor de reflejo | Entidades | Puerta `validar` declarada |
|---|---|---|---|---|
| **v1.0.0** | v2.6.3 renombrado → **V1.0** | Reflejo **v2.4** (tablas 2.4.0) | **50** | 1481 · 0 · **21 suites** (`CHANGELOG_v1.0.md:94`) |
| **v1.0.1** | v2.6.3 + parches (Batilos Record) | Reflejo v2.4 | 50 | 1481 · 0 · 21 |
| **v1.0.2** | v2.6.3 + espejos «era de los espejos» | Reflejo **v3.0** (tablas v3) | 50 | 1481 · 0 · 21 (`CHANGELOG_v1.0.md:47`) |
| **v1.0.3** | v2.6.3 + PODERES | Reflejo v3.0 + 22 poderes | 50 | 1481 · 0 · 21 (`CHANGELOG_v1.0.md:21`) |
| **v1.1.0** | Reflejo v5 (salud, confianza, GRUPO, BÓVEDA, ADUANA v2, IMAGEN v5) | Reflejo **v5** | 50 | (no declarada en el CHANGELOG de 1.1.0; sí en 1.1.1) |
| **v1.1.1** | Reflejo v5 + **BUILD v1** (cura de `vite build`) | Reflejo v5 | 50 | **1627 · 0 · 27 suites** (`CHANGELOG_v1.1.1.md:29`) |

**Correspondencia del ANEXO v2.6.3 del manual:** `ide/AGENTES_MANUAL.md:3-16` dice «ANEXO v2.6.3 (20-sep-2026) … **50 entidades**, **21 suites**, `npm run validar` → **1479**». Ese anexo describe el estado **v2.6.3 ≈ producto v1.0.0/v1.0.1** (21 suites), mientras que el código de v1.1.1 ya tiene **27 suites**. Es decir: **el manual va un producto por detrás** (1479 vs 1627). El propio manual lo admite como historia viva: «Las cifras «40 / 12+28 / 10-18» del cuerpo siguen vivas como historia» (`AGENTES_MANUAL.md:14-16`).

### 1.3 El «gran renombrado» (v2.6.3 → V1.0)

`CHANGELOG_v1.0.md:73-96` documenta: marca unificada vía `IDE_BRAND`, `package.json` 1.0.0, FOCO v1 (la Espina de 26 px pasó a `pointer-events-none` + `pb-[26px]`), fondo por defecto `public/fondo-predeterminado.jpg`, recursión en dos pasos, icono `build/icon.png`. Todo eso es **HECHO** en v1.1.1: el parche está aplicado por `mejoras/cerebronico-v10/aplicar-v10.mjs:33-36` (inserta `pointer-events-none` en `EspinaActividad.tsx`) y `mejoras/cerebronico-v10/assets/public/fondo-predeterminado.jpg` existe.

### 1.4 Deudas de nomenclatura detectadas (HECHO)

| Deuda | Evidencia | Impacto para V8 |
|---|---|---|
| `constants.ts` dice `V1.0.3` con `package.json` 1.1.1 | `src/constants.ts:190` vs `package.json:4` | La cabecera que ve el usuario miente; V8 debe unificar en una sola fuente real (no dos). |
| `AGENTES_MANUAL.md` describe línea base v2.5 (40 entidades) y anexo 1479/21 | `AGENTES_MANUAL.md:1-22` | El manual **no** documenta v1.1.0 ni v1.1.1 (no hay ANEXO v5). Riesgo de fusión sobre documentación obsoleta. |
| `ESPEJOS_PERSONALIZADOS.md` dice «no implementado todavía» (Paso 2) | `ESPEJOS_PERSONALIZADOS.md:4-8` | Falso en v1.1.1: hay `reflejo/cargadorEspejos.ts`, `reflejo/pool.ts`, `tests/espejos-personalizados.test.ts` y endpoints `/api/espejos/personalizados|instalar|desinstalar` (`server.ts:3758,3773,3878`). |
| Comentarios de conteo internos erróneos | `consejo.ts:134` dice «texto (8)» habiendo **7**; `:176` «datos (8)» habiendo 7; `:252` «maquina (4)» habiendo 3; `:301` «proyecto (4)» habiendo 3 | Cosmético, pero engaña a un auditor humano: los conteos reales (28 herramientas) están bien, los comentarios por bloque no. |

---

## 2. Catálogo de entidades (50) — análisis del código

### 2.1 Cómo se define una entidad (HECHO)

Fábrica y contrato (`src/engine/reflejo/consejo.ts`):

```ts
// consejo.ts:126
const r = (entidad, t0, ok, extra: Partial<ResultadoEntidad> = {}): ResultadoEntidad =>
  ({ ok, entidad, ms: Date.now() - t0, ...extra });
// consejo.ts:129
const reg = (id, nombre, dominio: Entidad["dominio"], activa: boolean,
             descripcion: string, ejecutar: (d:any)=>ResultadoEntidad): Entidad =>
  ({ id, nombre, dominio, tipo: "herramienta", activa, descripcion, ejecutar });
// consejo.ts:132
const T: Entidad[] = [];
```

- `Entidad` (`consejo.ts:61-70`): `{ id, nombre, dominio, tipo, activa, descripcion, ejecutar? }`.
- `dominio` ∈ `"especialista" | "texto" | "datos" | "matematicas" | "maquina" | "visual" | "proyecto" | "espejo"` (`:64`).
- **Contrato de salida obligatorio:** `{ ok, salida? | motivo, entidad, ms }`; `motivo` **siempre** presente cuando `ok:false` (`:52-59`: «SIEMPRE presente cuando ok === false»).
- Los espejos se inyectan en el mismo array vía `T.push(...crearEspejos(reg, r))` (`:329`) — reutilizan las fábricas: **una sola fuente de contrato**.
- Registro final (`:343-346`):
  ```ts
  export const ENTIDADES: Entidad[] = [
    ...ESPECIALISTAS.map(e => ({...e, dominio:"especialista", tipo:"especialista", activa:true})),
    ...T,
  ];
  ```
- Ejecución por id con motivo declarado: `ejecutarEntidad(id, datos)` (`:366-398`) devuelve, en orden: (1) espejo personalizado del pool si `poolListo()` y el id es del pool; (2) error declarativo si no existe; (3) `««id» está DORMIDA: actívala con POST /api/consejo/entidad…»` (`:390`); (4) `«es especialista: se usa vía frase…»` (`:391`); (5) `try/catch` que convierte una excepción en motivo (`:394-397`).
- Activación: `cambiarActivacion(id, activa)` (`:357-363`) **rechaza** dormir especialistas: `««id» es especialista votante: no se duerme con toggle»`.

### 2.2 Los 12 especialistas votantes (HECHO)

Definidos como datos, no como funciones (`consejo.ts:85-98`). El voto real lo sigue produciendo el motor (`pensar`), y el consejo **atribuye**: `pensarConsejo()` (`:401-406`) mapea `accion`/`orden.tipo` → dueño con `DUEÑO_DE` (`:75-83`).

| # | id | Nombre | Descripción (literal, `consejo.ts:86-97`) |
|---|---|---|---|
| 1 | `conversor` | Conversor de formatos | json↔yaml↔toml↔csv con informe de pérdidas (formatConverter) |
| 2 | `archivista` | Archivista | abre/lee rutas del proyecto; audita rutas sanas |
| 3 | `artista` | Artista | frase → prompt de imagen enriquecido (estilo, luz, paleta, seed) |
| 4 | `codigo` | Operario de código | plantillas react/express/python/html/ts; imports y sintaxis delegan en importChecker/syntaxGuard |
| 5 | `matematico` | Matemático | calculadora con parser propio, sin eval |
| 6 | `conductor` | Conductor de planes | descompone en DAG con dependencias (taskPlanner es su validador) |
| 7 | `linguista` | Lingüista | normaliza, cuenta, compara texto. **NO traduce** |
| 8 | `investigador` | Investigador | esqueleto de plan de investigación y citas. Sin red **no investiga: lo declara** |
| 9 | `validador` | Validador | JSON/rutas/esquemas contra las funciones reales del motor |
| 10 | `telemetria` | Telemetría | RAM, núcleos, carga del sistema |
| 11 | `memorista` | Memorista | recuerda semillas y decisiones del consejo **durante la sesión** |
| 12 | `ayuda` | Ayuda | cuando nadie vota: dice qué se pareció y por qué no pasó el umbral |

Mapa de atribución de acciones → entidad (`consejo.ts:75-83`): `convertir→conversor`, `abrir→archivista`, `imagen→artista`, `creacion→codigo`, `calculo→matematico`, `plan→conductor`, `nada→ayuda`.

> **HECHO relevante:** no hay 12 funciones ejecutables; hay **12 fichas** y **7 ramas reales** de `pensar()` (`convertir, abrir, imagen, creacion, calculo, plan, nada`). `linguista`, `investigador`, `validador`, `telemetria`, `memorista` **no** tienen rama propia en `DUEÑO_DE`: son voces/fichas que el manual declara «siempre activas» pero que hoy **no reciben votos por acción** salvo que el orquestador de leyes las alcance (§4.6). Es un punto a resolver en V8 (§15-H3).

### 2.3 Las 38 herramientas — catálogo COMPLETO con firma de invocación (HECHO)

Firma de la función ejecutora: `(d: any) => ResultadoEntidad`, donde `d` es el objeto `datos` de la tarea o el cuerpo de la petición. Todas devuelven `{ok, salida|motivo, entidad, ms}`.

| # | id | Nombre | Dominio (declarado) | dormida/despierta **efectiva** | Entrada (`d.*`) | Salida (forma) | Línea |
|---|---|---|---|---|---|---|---|
| 1 | `texto.contar` | Contar palabras | texto | **despierta** | `texto` | `N palabras · N líneas · N caracteres` | `consejo.ts:135` |
| 2 | `texto.acentos` | Quitar acentos | texto | dormida | `texto` | texto NFD sin diacríticos | `:140` |
| 3 | `texto.mayus` | Cambiar mayúsculas | texto | dormida | `texto`, `modo`∈mayus\|minus\|titulo | texto | `:145` |
| 4 | `texto.slug` | Slug | texto | dormida | `texto` | url-seguro | `:152` |
| 5 | `texto.ordenar` | Ordenar líneas | texto | dormida | `texto`, `reverso?` | texto | `:157` |
| 6 | `texto.dedup` | Deduplicar líneas | texto | dormida | `texto` | texto | `:164` |
| 7 | `texto.dif` | Diferencia de líneas | texto | dormida | `a`, `b` | líneas en A ∉ B | `:169` |
| 8 | `datos.json-ruta` | Ruta JSON | datos | **despierta** | `json`, `ruta` (`a.b[0]`) | valor serializado | `:177` |
| 9 | `datos.json-llaves` | Claves de JSON | datos | dormida | `json` | `k:tipo` listados | `:188` |
| 10 | `datos.csv-columnas` | Columnas CSV | datos | dormida | `csv` | `N columnas [cabecera] · N filas` | `:194` |
| 11 | `datos.csv-fila` | Fila N de CSV | datos | dormida | `csv`, `n` (1-based) | fila | `:200` |
| 12 | `datos.base64` | Base64 | datos | dormida | `texto`, `modo`∈cod\|dec | texto | `:208` |
| 13 | `datos.hash` | SHA-256 | datos | **despierta** (requiere `SISTEMA`) | `texto` | hex sha256 | `:215` |
| 14 | `datos.uuid` | UUID nuevo | datos | dormida (requiere `SISTEMA`) | — | uuid v4 | `:221` |
| 15 | `mate.promedio` | Promedio | matematicas | **despierta** | `numeros` (lista o CSV de texto) | número | `:228` |
| 16 | `mate.porcentaje` | Porcentaje | matematicas | dormida | `p`, `n` | `p% de n = x` | `:233` |
| 17 | `mate.minmax` | Mínimo y máximo | matematicas | dormida | `numeros` | `min= max= rango=` | `:238` |
| 18 | `mate.unidades` | Unidades | matematicas | **despierta** | `valor`, `de`, `a` | número | `:243` |
| 19 | `maq.ram` | RAM | maquina | **despierta** (servidor) | — | `total X GB · libre Y GB` | `:253` |
| 20 | `maq.cpu` | CPU | maquina | dormida (servidor) | — | `N núcleos · modelo` | `:258` |
| 21 | `maq.tramo` | Tramo MR | maquina | **despierta** (servidor) | — | `X GB → MR2 (8 GB)` | `:263` |
| 22 | `vis.hex2rgb` | Hex → RGB | visual | dormida | `hex` | `rgb(r, g, b)` | `:271` |
| 23 | `vis.rgb2hex` | RGB → Hex | visual | dormida | `r`,`g`,`b` | `#rrggbb` | `:276` |
| 24 | `vis.contraste` | Contraste AA | visual | dormida | `a`,`b` hex | `ratio:1 → AA normal SÍ/NO · AA grande` | `:281` |
| 25 | `vis.paleta` | Paleta por nombre | visual | **despierta** | `nombre` (español) | `#hex` | `:294` |
| 26 | `proyecto.stats` | Estadísticas del workspace | proyecto | dormida | `archivos[{ruta,contenido}]` | `ext:Nf/Nl …` | `:302` |
| 27 | `proyecto.rutas-sanas` | Auditar rutas | **datos** (¡no proyecto!) | dormida | `rutas[]` | `todas sanas (N)` / motivo | `:313` |
| 28 | `memorista.registrar` | Recordar decisión | **datos** (¡no proyecto!) | dormida | `nota`, `entidad?` | `registrada (N en la sesión)` | `:321` |
| 29 | `espejo.codigos` | Espejo · Códigos | espejo | **despierta** | `codigo`, `lenguaje?` | JSON | `espejos.ts:442` |
| 30 | `espejo.lenguajes` | Espejo · Lenguajes | espejo | **despierta** | `texto` | JSON | `espejos.ts:469` |
| 31 | `espejo.artes` | Espejo · Artes | espejo | **despierta** | `base` (hex) | JSON | `espejos.ts:504` |
| 32 | `espejo.disenios` | Espejo · Diseños | espejo | **despierta** | `ancho`, `paso?`, `minCol?` | JSON | `espejos.ts:528` |
| 33 | `espejo.creadores` | Espejo · Creadores | espejo | **despierta** | `ejes`, `n?`, `semilla?`, `sistematico?` | JSON | `espejos.ts:549` |
| 34 | `espejo.planificadores` | Espejo · Planificadores | espejo | **despierta** | `tareas[{id,dependeDe}]`, `tramo?`, `nucleos?` | JSON | `espejos.ts:583` |
| 35 | `espejo.cientificos` | Espejo · Científicos | espejo | **despierta** | `objetivo`, `dependiente{nombre,tipo,metrica,replicados}`, `independiente[]`, `control[]`, `dobleCiego?` | JSON | `espejos.ts:626` |
| 36 | `espejo.fisicos` | Espejo · Físicos | espejo | **despierta** | `expresion`, `de?`,`a?`,`cantidad?` | JSON | `espejos.ts:653` |
| 37 | `espejo.matematicos` | Espejo · Matemáticos | espejo | **despierta** | `expresion?`, `enteros[]?` | JSON | `espejos.ts:673` |
| 38 | `espejo.cuantico` | Espejo · Cuántico | espejo | **despierta** | `qubits` (1–8), `puertas[{p,q,t?}]` | JSON | `espejos.ts:699` |

**Cuentas verificadas:** 12 especialistas + 7 (texto) + 7 (datos) + 4 (mate) + 3 (maq) + 4 (visual) + 2 (proyecto) + 1 (memorista) = 12 + 28 = 40; + 10 espejos = **50** (`ENTIDADES.length === 50`, asertado en `tests/agentico.test.ts:34` y `tests/espejos.test.ts:36`).

### 2.4 Activación por defecto — el mecanismo real (HECHO, hallazgo)

```ts
// consejo.ts:334-339
export const ACTIVAS_POR_DEFECTO = new Set([
  "texto.contar", "datos.json-ruta", "datos.hash", "mate.promedio", "mate.unidades",
  "maq.ram", "maq.tramo", "vis.paleta", "proyecto.rutas-sanas", "memorista.registrar",
  ...IDS_ESPEJOS, // los 10 espejos nacen despiertos
]);
for (const h of T) h.activa = ACTIVAS_POR_DEFECTO.has(h.id);
```

- **El 4.º argumento `activa` de cada `reg(...)` es decorativo**: la línea `:339` lo pisa para las 38 herramientas. Ejemplo: `texto.acentos` se declara con `true` (`:140`) y queda **dormida**.
- Resultado efectivo: **20 despiertas** (10 curadas de v2.5 + 10 espejos) y **18 dormidas**. Verificado por aserción en `tests/agentico.test.ts:41-42` y `tests/espejos.test.ts:42-43`.
- `estadoConsejo()` (`consejo.ts:408-420`) publica el catálogo vivo y su `nota`: «50 entidades: 12 votantes + 38 herramientas (20 activas: las 10 de v2.5 + los 10 espejos; 18 con botón)».
- Las **18 dormidas** exactas: `texto.acentos, texto.mayus, texto.slug, texto.ordenar, texto.dedup, texto.dif, datos.json-llaves, datos.csv-columnas, datos.csv-fila, datos.base64, datos.uuid, mate.porcentaje, mate.minmax, maq.cpu, vis.hex2rgb, vis.rgb2hex, vis.contraste, proyecto.stats`.
- Dos herramientas declaran `dominio: "datos"` teniendo id de otro dominio (`proyecto.rutas-sanas`, `memorista.registrar`): inconsistencia de metadatos (§15-H4).

### 2.5 Persistencia del botón (HECHO)

`server.ts:3347-3377`: `.cerebro-db/entidades.json` guarda `{activas:{id:bool}, en:ISO}`; al arrancar se re-aplica con `cambiarActivacion` (`:3351-3355`); si el archivo no se puede leer/escribir, se **declara** en consola y se sigue (`:3357, :3374`). El catálogo y su lógica **nunca** se persisten: viven en el código.

---

## 3. Los 10 espejos (`src/engine/reflejo/espejos.ts`, 764 líneas)

### 3.1 Qué es un espejo (HECHO)

Cabecera del módulo (`espejos.ts:1-37`): «Espejos de la info alojada en el motor: funciones deterministas puras. No cargan modelo, no tocan Ollama, no importan Node… **Cero dependencias en tiempo de ejecución**». Contrato: misma tupla que el consejo, y **`salida` es SIEMPRE un JSON compacto** (`:27-28`), de modo que «cualquier plan puede interrogarlo después con `datos.json-ruta`. Así un espejo alimenta a otro sin RAM».

Utilidades puras compartidas: `redondear` (`:252`), PRNG mulberry32 semillado (`:256-264`), `hashSemilla` FNV-1a (`:266-270`), evaluador aritmético sin `eval` con precedencias/`^`/funciones/constantes (`:287-362`), `mcd`/`factorizar`/`esPrimo` (`:364-377`), HEX↔HSL (`:380-411`).

Constantes físicas disponibles en el evaluador (`:276-280`): `pi, e, tau, c=299792458, g=9.80665, h=6.62607015e-34, k=1.380649e-23, na=6.02214076e23, r=8.31446262`. Funciones (`:281-285`): `raiz|sqrt, abs, ln, log, log10, exp, sen|sin, cos, tan, suelo, techo, round`.

### 3.2 Contratos de salida exactos de los 10 espejos (HECHO)

| Espejo | Entrada | Claves exactas de la `salida` (JSON) | Reglas/motivos duros | Línea |
|---|---|---|---|---|
| `espejo.codigos` | `{codigo, lenguaje?}` | `lenguaje, lineas, lineasCodigo, simbolos{funciones,clases,imports,exports}, simbolosLista[≤24], condicionales, bucles, operadoresLogicos, ciclomaticaAprox, marcas` | sin `codigo` → `no llegó «codigo» (texto del fragmento).` | `:442-466` |
| `espejo.lenguajes` | `{texto}` | `idioma, confianza, palabras, frases, longitudMedia, silabasPorPalabra, flesch` | 6 idiomas por stopwords (es,en,fr,pt,it,de); `score===0 → idioma:"desconocido"` (`:494`); sin palabras → motivo | `:469-501` |
| `espejo.artes` | `{base:"#rrggbb"}` | `base, hsl{h,s,l}, armonias{complementaria[2], triada[3], analoga[3], "complementaria-partida"[3]}, tonos{claro,oscuro}, aurea` | hex inválido → motivo con ejemplo `#3a6ea5`; `aurea = 100/φ ≈ 61.8` | `:504-525` |
| `espejo.disenios` | `{ancho, paso?=8, minCol?=240}` | `grilla{ancho, columnas, margenLateral, gutter, altoAureo}, espaciado[11], breakpoints{sm,md,lg,xl,2xl}` | `ancho` no positivo → motivo; `columnas = floor(ancho/minCol)`; breakpoints fijos 640/768/1024/1280/1536 | `:528-546` |
| `espejo.creadores` | `{ejes:{k:[v…]}, n?=10, semilla?="cerebronico", sistematico?=true}` | `semilla, sistematico, espacioMuestral, avisos[], n, variantes[{…}]` | `n` acotado a 1–5000; ejes vacíos o valores no string/number → motivo; `sistematico` recorre sin repetir hasta agotar el espacio y **avisa** si `n > espacio` | `:549-580` |
| `espejo.planificadores` | `{tareas:[{id,dependeDe?}], tramo?="MR2", nucleos?=4}` | `tareas, lotes[[]], profundidad, paralelismoMax, tramo, presupuesto{io,cpu}, nota` | ids repetidos / sin id / dependencia inexistente → motivo; **ciclo → motivo** (`:610`); `tramo ∉ MR1..MR4` → motivo; `presupuesto.io = clamp(GB/4,1,16)`, `cpu = max(1, nucleos-1)` | `:583-623` |
| `espejo.cientificos` | `{objetivo, dependiente{nombre,tipo,metrica,replicados}, independiente[], control?[], dobleCiego?}` | `objetivo, hipotesis{H0,H1}, variables{independiente,dependiente,control}, condiciones, replicadosMinimos, ciego, pruebaSugerida, metrica` | tipo ∈ `continua`/`categorica` (si no → motivo); n grupos 1→t una muestra, 2→t Student/Mann-Whitney, >2→ANOVA/Kruskal-Wallis; categórica → chi-cuadrado o regresión logística | `:626-650` |
| `espejo.fisicos` | `{expresion, de?, a?, cantidad?}` | `expresion, valor, notacionCientifica, conversion{de,a,cantidad,resultado} \| {error}` | tabla SI compacta (`m,km,cm,mm,mg,g,kg,t,s,min,h,dias`); unidad fuera de tabla → `conversion.error` **dentro de una salida ok** (no falla el espejo) | `:653-670` |
| `espejo.matematicos` | `{expresion?}` y/o `{enteros:[…]}` | `expresion?, valor?, factorizacion?, esPrimo?` + `enteros, mcd, mcm` (si ≥2) o `aviso` (si 1) | sin expresión ni enteros → motivo; error de evaluación → motivo | `:673-696` |
| `espejo.cuantico` | `{qubits:1..8, puertas:[{p,q,t?}]}` | `qubits, dim, puerta, norma, probabilidades{"0101":p}, amplitudes["re±imi"]` | **`qubits` fuera de 1–8 → motivo** (`:703`, «2^9 estados ya no es un espejo barato»); puertas `x,y,z,h,s,t` + `cnot{q,t}`; `cnot` con `q===t` o fuera de rango → motivo; puerta desconocida → motivo listando las válidas | `:699-759` |

### 3.3 Restricciones verificadas en código (afirmaciones del enunciado)

| Restricción declarada | HECHO en código | Evidencia |
|---|---|---|
| Cuántico limitado a 8 qubits | **SÍ** — `n<1 || n>8 → ok:false` con motivo | `espejos.ts:703` |
| Idioma `<15 palabras` → «desconocido» | **PARCIALMENTE**. El umbral real **no** es 15 palabras: es `score === 0` (ninguna stopword encontrada) → `"desconocido"` | `espejos.ts:490-494` |
| Contraste/idiomas deterministas | **SÍ** — perfil Flesch propio, stopwords en tabla, sin modelo | `espejos.ts:474-500` |
| Artes con armonías reales HSL | **SÍ** — rotaciones 180/120/240/−30/0/30/150/210 sobre HSL | `espejos.ts:509-523` |
| «CERO imports de runtime» en `espejos.ts` | **SÍ, verificado por lectura**: solo `import type {Entidad, ResultadoEntidad} from "./consejo"` (`:38`, borrado en compilación) y `import {potenciarEspejos, CATALOGO_TURBO} from "./poderes-espejos"` (`:423`, interno del mismo directorio, también puro). **Sin `node:*`, sin `fs`, sin red** | `espejos.ts:38,423` + `poderes-espejos.ts:8` (solo `import type`) |

**Comprobación global del directorio `reflejo/`** (`grep -n "^import\|require(" *.ts`): los únicos `node:*` de todo el directorio están en `cargadorEspejos.ts:27-28` (`node:fs`, `node:path`) — el cargador de espejos personalizados, que es **server-only por diseño**. `consejo.ts`, `espejos.ts`, `pool.ts`, `poderes-espejos.ts`, `salud.ts` no tocan Node. Esto es exactamente la regla que rompió el build y que curó v1.1.1 (§13.4).

### 3.4 Arreglo de tipografía del cuántico (nota de auditoría)

`espejos.ts:757` emite amplitudes como `${redondear(re,4)}${im<0?"−":"+"}${redondear(Math.abs(im),4)}i` — usa el signo **menos tipográfico U+2212**, no ASCII. Es intencional (documentado en `espejos.ts:757`), pero cualquier parser externo que espere `-` debe normalizarlo. Nota para V8.

---

## 4. Motor de reflejo (votación determinista) y tablas

### 4.1 Arquitectura (HECHO)

`src/engine/reflejo/index.ts` (50 líneas) carga las tablas **por `import` de JSON** —decisión explícita para que viajen dentro de `dist/server.mjs` al empaquetar con esbuild y no exista «en producción no encuentra la tabla» (`index.ts:5-9`):

```ts
// index.ts:15-16
import lite from "./tablas-lite-v3.json";
import max from "./tablas-max-v3.json";
// index.ts:18-24
export const TABLAS: Record<"lite"|"max", Tablas> = { lite, max };
export function pensarReflejo(frase, modo: "lite"|"max" = "lite") { return pensar(frase, TABLAS[modo] ?? TABLAS.lite); }
```

`estadoReflejo()` (`index.ts:27-49`) publica: `motor:"reflejo v3.0"`, entradas y KB por modo, las **22 acciones**, `tiposPlantilla`, `unidades` y los **8 conectores de plan** (`y luego`, `después de eso`, `y después`, `luego`, `mientras (paralelo)`, `si falla`, `y al final`, `cuando termines`). Nota literal: «Cero filtro de contenido: el único 'no' es estructural (no entender lleva motivo)».

### 4.2 Las tablas: tamaños REALES medidos en disco (HECHO)

| Tabla | Tamaño en disco (v1.1.1) | Modo | Rol |
|---|---|---|---|
| `tablas-lite-v3.json` | **359.094 B ≈ 350 KB** | lite | diccionario + variantes buscadas en runtime |
| `tablas-max-v3.json` | **2.035.995 B ≈ 1,94 MB** | max | distancia 2 precalculada, sin CPU extra |
| `tablas-lite.json` | 518.358 B ≈ 506 KB | lite (v2.x) | **backup** del motor anterior |
| `tablas-max.json` | 2.265.288 B ≈ 2,21 MB | max (v2.x) | **backup** |

Cifras internas declaradas: lite v3 = **14.645 entradas**, max v3 = **82.459 entradas** (`index.ts:11-12`); el generador v3 es `scripts/gen-tablas-v3.mjs` (existe en v1.1.1, no existía en v1.0.3 → §13).

**Discrepancia documental (PROMETIDO vs HECHO):** el manual §8 sigue hablando de «lite 300–700 KB, max 2–5 MB» (rango que **sí** cumple el generador v2.4 `gen-reflejo.mjs`, §4.3), y `AGENTES_MANUAL.md:22` promete «1021 comprobaciones» mientras el CHANGELOG de v1.0 dice 1481 y el de v1.1.1 dice 1627. Son tres estados históricos distintos en el mismo documento.

### 4.3 `scripts/gen-reflejo.mjs` — las cuatro listas (HECHO, 196 líneas)

| Lista | Contenido (extracto verificable) | Línea |
|---|---|---|
| `VERBOS` | palabra → intención: `convertir/canjear/exportar/importar/traduce/cambia/pasa/convierte → convertir`; `abre/lee/muestra → abrir`; `dibuja/pinta/logo/banner/icono → imagen`; `crea/escribe/componente/plantilla → creacion`; `plan/luego/despues → plan`; `calcula/cuanto/suma/resta → calculo`; sinónimos EN (`convert/open/draw/create/calculate`) y PT mínimo (`converta/abra/desenhe/crie/calcule`) | `:75-95` |
| `CURADOS` | typos reales del usuario: `avrir→abrir`, `dibuia|dibuxa|dibhuja→dibuja`, `jenera|henera→genera`, `kalkula→calcula`, `kuanto→cuanto`, `conviert→convierte`, `hisistes→haces`, `nuebamente→nuevamente`, `capas→capaz`, `leyenda→lee`… | `:100-111` |
| `MATE` | números en letras (`cero..veinte, treinta..cien, mil, millon`) y operadores/palabras (`mas→+`, `menos→-`, `por→*`, `entre|dividido→/`, `elevado|al→^`, `raiz→sqrt`, `mitad→0.5`, `doble→2*`, `cuadrado→^2`) | `:114-122` |
| `FORMATOS` | `json, yaml, yml→yaml, toml, csv` | `:97` |
| `TECLADO` | mapa de vecinos de teclado para typos «de mano» (`a→qwsz`, etc.) usado por `variantesMano` | `:26-31` |

Generación: `variantesCompletas` = teclado + borrado + duplicado + inserción + traspósito (`:49-57`); conjugaciones reales (`:144-150`); en modo max, distancia 2 **solo sobre palabras de 6+ letras** con tope 3600/800 (`:159-164`) y justificación explícita: «a distancia 2, «plan» generaba «panel» y «read» generaba «react» — variantes que secuestraban sustantivos reales» (`:154-158`).

**La puerta del tamaño (HECHO y duro):**

```js
// gen-reflejo.mjs:182-195
const objetivos = [
  { nombre: "tablas-lite.json", max: false, minKB: 300,  maxKB: 700  },
  { nombre: "tablas-max.json",  max: true,  minKB: 2000, maxKB: 5000 },
];
… if (!dentro) process.exitCode = 1;
```

Es decir: **el generador falla si la tabla se sale del rango**. El tamaño es consecuencia, no adorno. La versión v3 (`gen-tablas-v3.mjs`) es la que está en uso en v1.1.1 y produce las tablas listadas en §4.2.

### 4.4 `POST /api/reflejo` (HECHO, `server.ts:3332-3342`)

```ts
app.post("/api/reflejo", (req, res) => {
  const frase = typeof req.body?.frase === "string" ? req.body.frase : "";
  if (!frase.trim()) return res.status(400).json({ ok:false, accion:"nada", confianza:0, modo:"lite", ms:0, motivo:"falta «frase» (texto)." });
  const modo = req.body?.modo === "max" ? "max" : "lite";   // cualquier cosa ≠ "max" cae a lite
  const r = pensarReflejo(frase, modo);
  return res.status(r.ok ? 200 : 422).json(r);
});
```

- Comentario de cabecera (`:3329-3331`): «Mismas tablas que viajan en el ZIP. `modo`: "lite" (502 KB, fuzzy en runtime) o "max" (2.2 MB, distancia 2 precalculada). **Cero filtro de contenido**».
- El código de estado distingue entender (200) de no entender (422), y **siempre** viaja `motivo`.
- `GET /api/reflejo/estado` (`:3340`) expone `estadoReflejo()`.
- Ejemplo contractual del manual (`AGENTES_MANUAL.md:47-49`): `{"frase":"cuanto es raiz de 144 mas 1","modo":"max"}` → `{ok:true, accion:"calculo", salida:"raiz de 144 mas 1 = 13", entidad:"matematico"}`.

### 4.5 Del voto a la ejecución: la cadena completa (HECHO)

```
frase  ──►  pensar(frase, TABLAS[modo])            cerebroReflejo.ts (motor, no auditado en detalle aquí)
          ├─►  DUEÑO_DE[accion | orden.tipo]        consejo.ts:403
          ├─►  pensarConsejo() → { …res, entidad }  consejo.ts:401   (ATRIBUYE y recuerda)
          └─►  ejecutarEntidad(id, datos)           consejo.ts:366   (herramienta: contrato {ok,salida|motivo,entidad,ms})
```

- El consejo **no duplica** la lógica de votación: «el motor decide; el consejo ATRIBUYE y recuerda» (`consejo.ts:400`) — decisión que salvó los 76 tests del reflejo sin tocarlos (`consejo.ts:8-9`).
- Memoria de sesión: `MEMORIA` (máx. 500 notas, **sin persistir a disco a propósito**, `consejo.ts:116-122`).
- En el plan, una tarea `reflejo` con `datos.frase` vota un especialista; sin frase ejecuta la herramienta con `datos.datos` (`AGENTES_MANUAL.md:53-58`).

### 4.6 Orquestador único (Reflejo v3.0/v5) — `reflejo/orquestador.ts` (821 líneas)

| Elemento | HECHO | Línea |
|---|---|---|
| Familias de leyes declarativas | 16 leyes curadas con ids `fis-conv, fis-expr, mat-sqrt, mat-mcd, mat-estad, mat-expr, ling-idioma, ling-legibilidad, cie-exp, cnt-qubits, cnt-superposicion, ant-codigo, ant-arte, ant-disenio, trf-area-triangulo, trf-ohm` + plantillas comentadas para extensibles | `orquestador.ts:88-330` |
| Umbral de confianza | `UMBRAL_CONFIANZA = 0.55` | `:561` |
| Margen de desempate | `MARGEN_DESEMPATE = 0.08` | `:565` |
| Comportamiento con dudas | Bajo umbral o con dos espejos distintos casi empatados → **no elige: confiesa** con `alternativas[]` (top-3) y motivo legible | `:691-712` |
| Orden de desempate documentado | estrella (≥0.95) primero, luego confianza desc, prioridad asc, **id asc** | `:611-616` |
| Leyes aprendidas | `cargarLeyesAprendidas` / `guardarLeyesAprendidas` con **fs inyectado** (`configurarFsOrquestador`, `:391`), persistidas en `.cerebro-db/leyes-aprendidas.json`; las curadas **no** se pueden desactivar por endpoint | `:427-504`; `server.ts:3965` |
| Endpoints | `GET /api/espejos/leyes`, `POST /api/espejos/orquestar[/:familia]`, `POST /api/espejos/leyes/aprender|desactivar` | `server.ts:3434,3579,3653,3895,3960` |

**Nota de honestidad del propio código** (`orquestador.ts:379-381`): el bug histórico «`require("node:fs")` dentro de un paquete ESM» hacía que las leyes aprendidas **nunca** sobrevivieran al reinicio; se cura inyectando fs desde el servidor.

### 4.7 Salud de la flota (Reflejo v5) — `reflejo/salud.ts` + `/api/espejos/*` (HECHO)

- Umbrales publicados por `GET /api/espejos/salud` (`server.ts:3444-3451`): `dormido: 0.5`, `estrella: 0.95`, `usosMinimos: 8`; nota: «dormido = no se elige solo (la ruta explícita siempre lo alcanza) · estrella = sube en el desempate».
- `POST /api/espejos/salud/dormir` siembra la tabla con `{usos:10, exitos:0}` para que el orquestador lo evite; `dormir:false` borra la evidencia (`:3453-3466`). `POST /api/espejos/salud/reset` limpia uno o toda la flota (`:3468-3475`).
- Persistencia: `.cerebro-db/espejos-salud.json` (`CHANGELOG_v1.1.0.md:46-48`).

### 4.8 GRUPO v1 — equipo por tarea (`espejos.ts:103-165`, `server.ts:3483`)

- `grupoPorTarea(texto)` es un clasificador **determinista por palabras clave** con normalización NFD sin acentos; frases valen doble (`:146`); empate o ausencia de señales → `null` («el auto no lanza monedas», `:160`).
- Vocabulario: 4 grupos con ~35 palabras cada uno (`PALABRAS_GRUPO`, `:107-112`).
- `POST /api/espejos/equipo {texto}` devuelve `{ok, eleccion, grupos, nota}`; cuando no hay señales la nota es explícita (`server.ts:3486-3491`).

### 4.9 PODERES v1 — 22 operaciones extra (HECHO, v1.0.3+)

`src/engine/reflejo/poderes-espejos.ts` (285 líneas) envuelve `.ejecutar` de los 10 espejos vía `potenciarEspejos(lista, r)` (`espejos.ts:761`, llamado **después** de definir los handlers clásicos, de modo que ningún comportamiento existente cambia). Cada espejo acepta `{accion:"…"}`; sin `accion` hace su orden clásica. Poderes citados en `CHANGELOG_v1.0.md:4-9`: estadística+IC95, resolución lineal/cuadrática con raíces complejas, matrices sum/mul/det, bases, mcd/mcm, interés compuesto (matemáticos); contraste WCAG, daltonismo ×3, gradiente (artes); dependencias, firmas, bloques duplicados (códigos); frecuencias, conversión de caso, diff de palabras (lenguajes); orden topológico + lotes por onda (planificadores); escala tipográfica modular, breakpoints (diseños); tamaño muestral, IC (científicos); entrelazamiento por concurrencia (cuántico). El catálogo completo se inyecta en el prompt con el botón **Turbo** (`espejos.ts:423-433`, `CATALOGO_TURBO`, `POST /api/consejo/turbo` en `server.ts:3393`).

---

## 5. Conductor (`POST /api/conductor`) — `server.ts:3984-4038` (HECHO)

### 5.1 La cadena, literal del código

```ts
// server.ts:3991-4037 (extracto fiel)
app.post("/api/conductor", async (req, res) => {
  const frase = String(req.body?.frase || "").trim();
  if (!frase) return res.status(400).json({ ok:false, origen:"nada", motivo:"falta «frase»." });

  const consejo = pensarConsejo(frase, TABLAS.max);                       // 1) CONSEJO PRIMERO
  if (consejo.ok && consejo.confianza >= 0.8) {
    return res.json({ ok:true, origen:"consejo", confianza: consejo.confianza,
      entidad: consejo.entidad, salida: consejo.salida,
      nota:"el director neural no se despertó: el consejo resolvió solo." });
  }
  const modelo = String(req.body?.modelo || process.env.CEREBRONICO_DIRECTOR
                 || "smollm2:135m-instruct-q3_K_S");
  const url = `${(process.env.OLLAMA_URL || OLLAMA_DEFAULT).replace(/\/$/,"")}/api/generate`;
  const system = instruccionesParaElModelo() + "\n\nAhora: convierte la frase del usuario en la orden que proceda. Si no puedes, responde exactamente NO ENTIENDO y el motivo.";
  const pedir = async (prompt) => { … fetch(url, {model, system, prompt, stream:false, format:"json", signal: AbortSignal.timeout(90_000)}) … };

  try {
    let texto = await pedir(`Frase del usuario: ${frase}`);
    let ultimo = "";
    for (let reparaciones = 0; reparaciones <= 1; reparaciones++) {        // 2) UNA ronda de reparación
      const bloque = texto.includes("cerebronico:") ? texto : "```cerebronico:plan\n" + texto + "\n```";
      const { ordenes, avisos } = extraerOrdenes(bloque);                   // validación = la del chat
      if (ordenes.length >= 1 && avisos.length === 0)
        return res.json({ ok:true, origen:"director", modelo, reparaciones, bloque, ordenes });
      ultimo = avisos.join(" · ") || "el director no devolvió una orden reconocible";
      if (reparaciones === 0)
        texto = await pedir(`Tu propuesta anterior fue RECHAZADA por el validador del IDE: ${ultimo}. Responde SOLO con el JSON corregido. Frase original: ${frase}`);
    }
    return res.status(422).json({ ok:false, origen:"fallback", director:{modelo, motivo: ultimo},
      consejo: consejo.ok ? {confianza: consejo.confianza, salida: consejo.salida}
                          : {motivo: consejo.motivo || "el consejo tampoco votó"},
      motivo:"ni el consejo (confianza baja) ni el director (tras 1 reparación) produjeron una orden válida." });
  } catch (e) {
    return res.status(502).json({ ok:false, origen:"sin-director", … });
  }
});
```

### 5.2 Propiedades verificadas

| Propiedad prometida (manual §3c, `AGENTES_MANUAL.md:59-68`) | Estado | Evidencia |
|---|---|---|
| Consejo primero; con confianza ≥0.8 el neural **no se despierta** | **HECHO** | `server.ts:3994-3997` |
| Director local = Ollama `/api/generate`, `format:"json"`, timeout 90 s | **HECHO** | `server.ts:3998-4009` |
| **Una** ronda de reparación con el error exacto del validador devuelto al modelo | **HECHO** — el bucle `for (reparaciones = 0; reparaciones <= 1; …)` y el prompt de reparación incluye `ultimo` | `server.ts:4014-4024` |
| «Ningún JSON crudo del modelo llega al motor: todo pasa por `extraerOrdenes`/`validarPlan`» | **HECHO** para `extraerOrdenes` (`server.ts:4018`); `validarPlan` se aplica en `/api/brain/plan` (`server.ts:31109`), no dentro del conductor | `chatOrders.ts:348`, `server.ts:3109` |
| Fallback **declarado** con motivos de ambos | **HECHO** — `origen:"fallback"` (422) con `director.motivo` + `consejo` (salida o motivo) | `server.ts:4026-4030` |
| Si Ollama no responde → `origen:"sin-director"` (502) citando el consejo | **HECHO** | `server.ts:4031-4037` |

### 5.3 `extraerOrdenes` (HECHO)

Vive en `src/engine/chatOrders.ts:348` (`export function extraerOrdenes(mensaje): ResultadoOrdenes`). Se usa en **tres** sitios: `server.ts:4018` (conductor), `cerebroReflejo.ts:745`, y `App.tsx:2454` (navegador). Es, por tanto, el **único** contrato de entrada de órdenes — coherente con la promesa. El envoltorio de vallas ```` ```cerebronico:plan ```` se añade solo si el modelo no lo trae (`server.ts:4017`).

### 5.4 Residuos del conductor a vigilar en V8

- El modelo por defecto es un **135M** (`smollm2:135m-instruct-q3_K_S`): el propio manual declara el riesgo (`AGENTES_MANUAL.md:108-110`: «con 135M–400M fallará a veces — por eso existe la reparación y el fallback»).
- El conductor **no** lee la **selección de espejos** (`notaSeleccionEspejos()`) en su system prompt: usa `instruccionesParaElModelo()`. La nota de espejos se inyecta en el chat del navegador. La doc dice que la selección persiste «para `/api/conductor`» (`server.ts:3380-3381`); HECHO: se persiste y se expone, pero **no se consume** en este endpoint (§15-H2).

---

## 6. Planificador (tarea `reflejo`, lotes, MR, segundo plano)

### 6.1 `taskPlanner.ts` — el cerebro de tareas (801 líneas, HECHO)

Tres reglas que el código declara no romper (`taskPlanner.ts:14-26`):
- **A) TERMINAR MANDA**: nada se descarta por falta de recursos; se retrasa.
- **B) EL AGREGADO NO MIENTE**: `resumenPlan` dice cuántas y **cuáles no**, con motivo; `noTerminadas`.
- **C) NO SE ESPERA A TODAS, SE ESPERA A LA PRIMERA** (`Promise.race` sobre las promesas vivas).

| Pieza | HECHO | Línea |
|---|---|---|
| Estados de tarea (8) | `pendiente, lista, en_curso, hecha, fallida, bloqueada, cancelada, descartada` | `:57-65,126-135` |
| Estados de plan (7) | `pendiente, en_curso, pausado, hecho, parcial, fallido, cancelado` | `:115-145` |
| `pesoPorDefecto(tipo)` | `reflejo → "cpu"`; el resto `"io"` (cura del defecto v1.0.3) | `:261-263` |
| `crearPlan` | normaliza ids, estados, y aplica `pesoPorDefecto` si no hay peso declarado | `:266-289` |
| **`validarPlan`** | ids únicos; dependencias existentes; **no auto-dependencia**; **ciclos** con recorrido de tres colores (0 sin visitar / 1 en pila / 2 cerrado) y error legible `#a → #b → #a` | `:300-354` |
| `resolverListas` | recalcula listas en cada vuelta y **escribe el motivo de espera** (`espera a #2`, `bloqueada por #1 "x" (fallida)`) | `:363-393` |
| **Kahn** | `ordenTopologico` por capas: filtra los que tienen todas sus deps en `hechas`, ordena la capa, y si la capa sale vacía **rompe sin colgarse** (ciclo) | `:396-413` |
| `resumenPlan` | `{hechas, fallidas, descartadas, canceladas, bloqueadas, sinHacer[]}` | `:416-426` |
| **Cancelación inmediata** | `solicitarCancelacion` pone bandera **y despierta el bucle** vía `__despertarCancelacion` | `:437-445` |
| Reintentos | `maxIntentosPorTarea` por defecto **2**; `quota/429` espera `backoffQuotaMs` = **45 s** (drenaje de cola) en vez de reintentar al segundo | `:488, :492, :583-590` |
| Cortacircuito alimentado | `recordSuccess` al éxito y `recordFailure` solo para `retryable|timeout|offline|quota`; las cancelaciones **no** cuentan | `:48, :550, :573` |
| Bloqueo definitivo por circuito | tras `maxEsperasCircuito` (3) esperas de 5 s → `bloqueada` + `bloqueoCircuito` (no se revive, evita bucle infinito) | `:370, :490-491, :712-724` |
| Reanudación de `en_curso` huérfanas | al reanudar, las que venían `en_curso` de una ejecución interrumpida vuelven a `pendiente` con motivo | `:494-505` |
| Punto de guardado por tarea | `alTerminarTarea?.(plan, tarea)` llamado en `finally` (un fallo **también** se guarda) | `:604-614` |
| Despacho **CPU primero** | ordena las listas por peso (`cpu` antes) y luego por id numérico: «cada espejo que termina libera dependencias en milisegundos» | `:687-694` |
| Traza de presupuesto honesta | la línea de presupuesto se escribe **solo cuando cambia la firma** y lleva dentro el MOTIVO de la degradación | `:669-684` |
| Garantía de terminación | `resolverPresupuesto` devuelve `io ≥ 1 ∧ cpu ≥ 1` siempre → «siempre hay algo avanzando» | `:464-473` |

### 6.2 `memoriaResiliente.ts` — la escalera MR (282 líneas, HECHO)

| Tramo | RAM | `ioBase` | `cpuBase` | Contexto/tarea | Coste/tarea (io/cpu) | Colchón | Checkpoint | Modelo recomendado / mínimo | Tier gobernador |
|---|---|---|---|---|---|---|---|---|---|
| MR1 | 4 GB | 2 | 1 | 2048 | 0,25 / 0,4 GB | 1,0 GB | cada 2 tareas | `qwen2.5-coder:0.5b` / `qwen2.5:0.5b` | `null` |
| MR2 | 8 GB | 3 | 1 | 4096 | 0,3 / 0,5 GB | 1,5 GB | cada 3 | `qwen2.5-coder:1.5b.ollama` / `qwen2.5-coder:0.5b` | V2.0 |
| MR3 | 16 GB | 5 | 2 | 8192 | 0,4 / 0,7 GB | 2,5 GB | cada 5 | `qwen2.5-coder:7b` / `qwen2.5-coder:1.5b.ollama` | V2.2 |
| MR4 | 32 GB | 8 | 3 | 16384 | 0,5 / 0,9 GB | 4,0 GB | cada 8 | `qwen2.5-coder:14b` / `qwen2.5-coder:7b` | V2.3 |

*(`:70-144`. Los números se declaran «órdenes de magnitud para decidir, no medidas».)*

**La invariante, verificada línea a línea (`:214-273`):**
```ts
const ioPorTope  = Math.min(ioPedido, TOPES_DUROS.io);              // TOPES_DUROS = { io:16, cpu:8 }  (:166)
const cpuPorTope = Math.min(cpuPedido, TOPES_DUROS.cpu, Math.max(1, nucleos - 1));
const aprovechable = Math.max(0, ramLibreGB - perfil.margenLibreGB);
const io  = Math.max(1, Math.min(ioPorTope,  ioPorRam));            // nunca 0
const cpu = Math.max(1, Math.min(cpuPorTope, cpuPorRam));           // nunca 0
const degradado = io < ioPedido || cpu < cpuPedido;
```
y la comprobación exportada para afirmarla en tests y logs: `esPresupuestoSeguro(b)` → `io ≥ 1 && cpu ≥ 1` (`:280-282`).

- Escalado del botón: `ESCALADOS = [1,2,4,6,8]` (`:162`), `siguienteEscalado` cicla ×8→×1 (`:169-173`).
- Selección de tramo por RAM: `elegirMR` con cortes 31/15/7 GB (`:149-155`).
- El tramo **puede forzarse por encima** de la máquina y el motivo lo dice: «Tramo forzado a MR4 (32 GB) en una máquina de 8 GB: irá justo de memoria, pero termina» (`:223-229`).
- Diferencia declarada con `hardwareGovernor`: allí «esto no cabe AHORA» se recomienda esperar; aquí «no se espera: se reparte menos y se acaba» (`:24-27`).

### 6.3 `hardwareGovernor.ts` — semáforo/veredicto (228 líneas, HECHO)

- Clasificación por RAM **total**: `V2.3` ≥31 GB, `V2.2` ≥15, `V2.1` ≥11, `V2.0` resto (`:96-101`).
- Veredicto por pieza contra RAM **libre** con colchón del 15 % (`:108-130`): `embeddings` 1,0 GB, `deep_index` 0,24, `verificador` 3,5, `grafo` 0,4, `parallel_workers` 1,2, `auto_propose` 0,1.
- **Límite de honestidad explícito** (`:16-18`): «este módulo **no activa nada**. Recomienda y explica… Un gobernador que enciende cosas solo es un gobernador que miente». El código lo cumple: no hay mutación de estado en el módulo.
- Endpoint `GET /api/governor` (`server.ts:2557`).

> **OJO para V8:** el enunciado describe `hardwareGovernor` como «semáforo». **HECHO:** el semáforo real está en `planRunner.ts` (`class Semaforo`, §6.6); `hardwareGovernor` es un **medidor/recomendador**. El propio manual reconoce la división (`memoriaResiliente.ts:24-27`).

### 6.4 Peso por tramo y descarga automática del modelo (HECHO)

`scripts/instalar-modelos.mjs` (115 líneas) — función pura exportada `elegirModelo(ramGB)` (`:26-31`):

| RAM | Tag a descargar | ≈ MB | Motivo declarado |
|---|---|---|---|
| ≥ 12 GB | `smollm2:1.7b` | 1100 | «MR3/MR4: cabe el 1.7B cuantizado y deja margen al sandbox» |
| ≥ 6 GB | `smollm2:360m` | 230 | «MR2 (8 GB): el 360M entiende frases raras y typos con holgura» |
| resto | `smollm2:135m-instruct-q3_K_S` | 70 | «MR1 (4 GB): el más pequeño que sigue siendo útil; dentro del tope de 100 MB» |

Reglas probadas (`:15-21` y código): **nunca** aborta `npm install`; si Ollama no responde en **1 s** no se intenta nada y se dice por qué; `CEREBRONICO_SIN_MODELOS=1` es salto declarado; consulta `/api/tags` primero («reinstalar no re-baja»); **solo** baja el tag de su tramo (`objetivo = [escalon.tag]`, `:64`); `process.exitCode = 0` incluso con errores de descarga (`:114`). El `postinstall.mjs` lo invoca con la RAM medida (`postinstall.mjs:168-174`) y **siempre** sale en 0 (`:176-178`).

### 6.5 Intérprete de líneas del panel (HECHO) — `src/components/PlansPanel.tsx`

Formato exacto (`PlansPanel.tsx:135`): **`titulo | tipo | dato | extra | dependeDe`**.
Placeholder real de la UI (`:453`):
```
Una tarea por línea:  titulo | tipo | dato | extra | dependeDe
leer package.json | leer_archivo | package.json
paquete a YAML    | convertir    | package.json | json>yaml
dibujar el logo   | generar_imagen | logo neón minimalista | img/logo.jpg
resumir           | modelo       | Resume el archivo
```
`dependeDe` son ids separados por comas; el intérprete **devuelve también los avisos** en vez de ignorar (`:141`, y suite `panel` en `validar.mjs:30`). La UI muestra las dependencias por tarea (`:579`).

### 6.6 Segundo plano, semáforo global, escalado en caliente y Cancelar/Reanudar (HECHO)

`src/engine/planRunner.ts` (311 líneas):

| Capacidad | HECHO | Línea |
|---|---|---|
| El plan **no** vive en la petición HTTP | doc. `:1-6`; `lanzar(planId)` devuelve al instante | `:219` |
| **Semáforo global por peso** en la frontera del ejecutor | `class Semaforo` con `enUso`, `limites`, `cola{io,cpu}`; límites con mínimo 1 | `:35-50` |
| Reajuste en caliente del semáforo al cambiar ×N | declarado en cabecera `:18`; `escalar()` reajusta y libera cola | `:229-257` (usado por `/api/brain/scale`) |
| `cancelar` / `reanudar` | `cancelar` (`:258`), `reanudar` («lo ya hecho NO se repite», `:266-273`) | `:258, :266` |
| `enSegundoPlano(planId)` | informado al panel en `/api/brain/plans` | `:281`; `server.ts:3062` |
| Parada limpia del servidor | pide cancelar a todos y avisa: «al volver aparecerán PAUSADOS para reanudar» | `:290-307` |

Endpoints del panel (`server.ts`): `GET /api/brain/runner` (`:2997`), `POST /api/brain/scale` (`:3024`, sin valor cicla ×1→×2→×4→×6→×8→×1), `POST /api/brain/tramo` (`:3037`, acepta `auto` o `MR1..MR4` con validación y motivo), `GET /api/brain/plans` (`:3052`), `POST /api/brain/plan` (`:3075`, valida ciclo/dependencias antes de aceptar y **no guarda** un plan inválido), `GET /api/brain/plan/:id` (`:3131`), `.../cancel` (`:3139`), `.../resume` (`:3146`).

Promesa del manual («Mientras trabaja, la IDE sigue tuya… única verdad honesta: si un plan satura Ollama con muchas tareas `modelo`, tus chats con el MISMO modelo local pueden encolar») — se corresponde con el diseño del semáforo y con el reparto por pesos; **no** contradicha por el código.

### 6.7 Presupuesto MR en el plan de ejemplo y prueba dura (HECHO)

`tests/agentico.test.ts:119-132`: un plan con **12 tareas `reflejo` en paralelo** debe terminar `hecho` con 12/12 — evidencia de que el semáforo no frena tareas CPU de ~1 ms.

---

## 7. Extensiones — sistema caliente (`src/engine/extensions.ts` + `server.ts`)

### 7.1 Modelo de seguridad (HECHO)

Cabecera `extensions.ts:1-28` con tres decisiones explícitas: manifiesto **JSON, no código**; el IDE **nunca** ejecuta código de la extensión en su contexto (iframe sandbox + `postMessage`); **permisos explícitos**. Versión de API: `EXTENSION_API_VERSION = "2.0"` (`:30`).

**Permisos válidos** (`:33-42`): `workspace.read`, `workspace.write`, `workspace.exec`, `chat.read`, `chat.send`, `tools.register`, `network`, `storage`. Los desconocidos se **avisa y se ignoran** (no se conceden): `:145-153`; `grantedPermissions` filtra (`:179-181`).

**`validateManifest(raw)`** (`:112-176`) verifica:
- `id` con patrón `publisher.nombre` (`ID_PATTERN`, `:104`), `name`, `version` **semver** (`:105`), `main` obligatorios.
- **Anti-traversal**: `main` e `icon` no pueden contener `..`, empezar por `/` ni tener esquema (`:127-132`); lo mismo para cada `panel.entry` (`:133-143`).
- `contributes.tools`: cada tool necesita `name`, `description`, `parameters`; nombre `^[a-z][a-z0-9_]*$`; `handler` **debe** empezar por `command:` (`:155-168`).
- Avisos tolerantes: sin descripción, sin permisos (`:170-173`).

**Registro** (`ExtensionRegistry`, `:209-240`): `add/remove/get/all` y `findBySlash(slash)` que resuelve `/<slash>` o el id del comando → `{manifest, command}`.

### 7.2 Contrato de contribución (HECHO)

| Contribución | Forma | Notas |
|---|---|---|
| `commands[]` | `{id, title, description?, slash?}` | slash por defecto = última parte del id (`:188-193`) |
| `panels[]` | `{id, title, icon?, entry, position?}` | `position` por defecto **`center-tab`** (pestaña junto al Chat); alternativa `side` (`:54-63, :196-201`) |
| `tools[]` | `{name, description, parameters(JSON-Schema), handler:"command:<id>", cheap?, destructive?}` | entran al registro del agente (`:65-73, :204-206`) |
| `languages[]`, `settings[]` | declarativos | `:90-91` |

### 7.3 Server y UI (HECHO)

- Endpoints: `GET /api/extensions` (`server.ts:4871`), `POST /api/extensions/:id/enable|disable` (`:4884, :4895`), `DELETE /api/extensions/:id` (`:4902`), `GET /api/extensions/invocations` (`:5004`), `POST /api/extensions/invocations/:id/result` (`:5020`).
- Estado en disco: `ide/backend/.extensions-state.json`.
- UI: `src/components/ExtensionManager.tsx` (219 líneas) monta el gestor y la Forja (`PluginForge` importado y renderizado en `ExtensionManager.tsx:17,46`).
- **Ejemplo instalado en el repo** (HECHO): `ide/backend/extensions/` contiene **11 extensiones**: `cerebronico.panel-ejemplo` (icon.svg + manifest.json + panel.html) y los 10 plugins `cn.aduana, cn.critico, cn.embudo, cn.escriba, cn.forjador, cn.microcopy, cn.microtest, cn.pintor, cn.pliego, cn.rutas`, cada uno con `manifest.json` + `panel.html`.
- `postinstall.mjs:91-117` cuenta y valida las extensiones instaladas (id/version/main) y avisa de las rotas.

> **NO VERIFICADO por ejecución:** el aislamiento real del iframe (`sandbox`), el filtrado de permisos en el puente y el flujo `postMessage {cn:1}` se han leído en código y en los manuales, pero requieren IDE en marcha para confirmarlo end-to-end. Los manuales declaran E2E headless propio (`PLUGINS_MANUAL.md:11-13`: 203 correctas · 0 fallidas y 29 correctas · 0 fallidas), **no reproducido aquí**.

---

## 8. Forja — `mejoras/cerebronico-forja-v1` + `src/engine/pluginForja.ts`

### 8.1 Qué es (HECHO)

`pluginForja.ts:1-20`: «el SISTEMA compone el complemento, no el modelo». El modelo (o el formulario) entrega una **receta**; el compilador produce **exactamente dos archivos**: `manifest.json` y `panel.html`. Cuatro reglas declaradas y verificadas:

1. **Toda tacha se dice ANTES de escribir nada**: `normalizarReceta` acumula `motivos[]` (lista, nunca fallo seco) — `:54-105`.
2. **Slot de lógica editable** con **eco honesto** hasta que se estrene — `:181-184`.
3. **Nombres de tool prefijados** `fj_<slug>_<herramienta>`: un forjado no puede pisar a otro ni al motor — `:107`.
4. **Determinista**: misma receta = mismos bytes (los manifiestos sha256 del proyecto solo tienen sentido así) — `generarManifest`/`generarPanel` sin azar (`:113-209`).

### 8.2 Validación de receta (`normalizarReceta`) — reglas exactas

| Regla | Valor | Línea |
|---|---|---|
| `id` | `^cn\.[a-z][a-z0-9-]{1,28}$` y **no existente** en `extensions/` | `:49, :60-61` |
| `nombre` | 1–60 caracteres | `:64-65` |
| `descripcion` | 1–400 caracteres (la lee el modelo del catálogo) | `:66-67` |
| `permisos` | solo `workspace.read|write|exec`, `chat.read|send`, `storage` (`PERMISOS_FORJABLES`); `tools.register` lo añade el compilador; `extensions.register` **no** se forja | `:46-47, :69-71` |
| `herramientas` | **entre 1 y 3** («un plugin que hace de todo no hace nada») | `:73-74` |
| nombre de herramienta | `^[a-z][a-z0-9_]{2,28}$`, sin repetidos, con `descripcion` | `:50, :79-83` |
| `params` | máx. **6** por herramienta, nombre `^[a-z][a-z0-9_]{1,20}$`, tipo ∈ `string|number|boolean`, sin duplicados | `:51, :84-96` |
| `slash` | por defecto activo salvo `slash:false` | `:103` |

### 8.3 Salida compilada (HECHO)

- **`manifest.json`** (`:113-143`): `version:"1.0.0"`, `author:"Forjado por CerebroNico · FORJA v1"`, `engines.cerebronico:"^2.0.0"`, `permissions` = unión de las de la receta + `tools.register`; `contributes.panels` con `entry:"panel.html"`, `position:"center-tab"`; `contributes.commands` = `forja.abrir` (slash = slug) + una por herramienta; `contributes.tools` con `cheap:true`, `handler:"command:forja.<herramienta>"` y `parameters` JSON-Schema construido desde los params.
- **`panel.html`** (`:145-209`): HTML autocontenido con (a) el **kit del puente** idéntico al de los `cn.*` (`call()`, `postMessage {cn:1}`, `commandResult`, propagación `error||motivo`), (b) `META` con el id y la clave de localStorage `cn.forja.<id>.logica`, (c) `cargar()` que hace `new Function('nombre','params','cn',cuerpo)` y declara `lógica guardada ILEGAL` si no compila, (d) `base()` = **eco honesto** (`ok:true` con id, herramienta, params y nota «slot sin estrenar…»), (e) validación de params obligatorios y de tipos con **coacción** `"42"→42`, (f) botones Guardar / Probar primera herramienta / Quitar lógica, (g) validación con `new Function` **antes** de guardar.
- `instruccionUso(receta)` (`:219-221`) devuelve la frase de uso sin prometer clics.

### 8.4 Integración en el servidor y el chat (HECHO)

- `POST /api/extensions/forjar` (`server.ts:4793-4808`): normaliza → si hay motivos devuelve 400 con la lista; compila; **valida el manifest con el juez oficial** `validateManifest` y, si el compilador produjera un manifest inválido, devuelve 500 declarándolo «bug del sistema, repórtalo»; escribe los 2 archivos en `EXTENSIONS_DIR/<id>`.
- Herramienta del modelo: `forjar_complemento` registrada en `toolRegistry.ts:563` con ficha en `manuals.ts:144-146`; despacho en `server.ts:1696` (`case "forjar_complemento": { … }`).
- UI: `src/components/PluginForge.tsx` (138 líneas), abierta desde `ExtensionManager` (botón de forja).

### 8.5 Verificación del manual de Forja (contraste doc ⇄ código)

`MANUAL_FORJA_v1.md` (87 líneas) declara: «suite `forja` (15ª): **28 · 0**», «`npm run validar`: **1147 · 0 · 15 suites**», `POST` válido → `cn.palabras` con tool `fj_palabras_contar` en catálogo, `POST` basura → 4 motivos y cero escrituras, `DELETE` → desinstalada.

- **HECHO en código:** la suite `forja` existe y está listada (`validar.mjs:38`, `tests/pluginForja.test.ts`), y el nombre `fj_<slug>_<herramienta>` se genera exactamente así (`pluginForja.ts:107`).
- **Obsolescencia:** las cifras 1147/15 pertenecen a un estado más antiguo (v1.0.x temprano). El propio `validar.mjs` de v1.1.1 lista **27** suites, y el CHANGELOG de v1.1.1 reporta **1627**. El manual de la forja **no** fue re-actualizado tras v1.0.3. Es PROMETIDO con cifras caducadas, no incumplido.
- **HECHO (defecto cazado por su propio test, contado por el manual):** «el primer borrador de este test tenía una lógica con un `}` de menos — el panel la rechazó como ILEGAL y siguió dando eco» (`MANUAL_FORJA_v1.md:41-44`). El código lo soporta: `cargar()` envuelve en try/catch y declara `ERR_LOGICA` (`pluginForja.ts:181`).

---

## 9. Coreo, plugins, aspecto, fondo, tregua, espejos y v10 (`mejoras/*`)

Cada paquete `mejoras/*` aplica sobre el árbol `ide/backend` mediante un script `aplicar-*.mjs` con `--raiz` y `--revert`. **HECHO:** en v1.1.1 los nueve paquetes existen y su contenido está **ya aplicado** en el árbol (los archivos destino existen con el mismo contenido lógico).

### 9.1 `cerebronico-coreo-v1` — COREO (la pantalla baila)

| Afirmación | Estado | Evidencia |
|---|---|---|
| 11 acciones con icono, verbo en gerundio, animación y color | **HECHO** | `src/engine/coreo.ts:27-39`: `pensar 🧠 latido`, `planificar 🗺 orbita`, `espejo 🪞 escaneo`, `escribir ✍ tecleo`, `convertir 🔁 escaneo`, `imagen 🖼 chispa`, `forjar ⚒ chispa`, `verificar 🔍 escaneo`, `bloqueado ⛔ sacudida`, `entregar 📦 brillo`, `actividad • quieto` |
| Clasificador línea-de-narración → acción, con prioridad | **HECHO** | `CLASIFICADOR` con 10 regex ordenadas (`:61-72`): «NO se guardó» → `bloqueado` aunque hable de imagen |
| Anillo de 14 eventos + bus por poll | **HECHO** | `ANILLO_MAX = 14` (`:43`), `notificar` (`:48-54`), `GET /api/coreo` (`server.ts:4869`) |
| Espina de Actividad de 26 px al pie, fija, sin alterar layout | **HECHO** | `EspinaActividad.tsx:79` (`fixed bottom-0 h-[26px]`) + parche `pointer-events-none` de `aplicar-v10.mjs:33-36` |
| Reposo explícito, no desaparición | **HECHO** | `EspinaActividad.tsx:82`: «en reposo · esperando la primera orden» |
| `prefers-reduced-motion` apaga animaciones sin apagar información | **HECHO** | `coreo.ts:137-140` |
| 11 acciones ≈ «11 acciones con icono y movimiento» del enunciado | **HECHO** (son 11 exactas) | `coreo.ts:27-39` |
| «el cerebro del Header» reacciona por `CustomEvent("cn:coreo")` y `window.__cnCoreo` | **HECHO parcial** | `EspinaActividad.tsx:48-50` emite y publica; la coreografía fina por acción está declarada como **v1.1 pendiente** en el propio comentario (`:49`) y en `COREO_MANUAL_v1.md` («ya soporta `thinking`: la coreografía fina del BrainThinkingIcon por acción es v1.1 declarada») |

### 9.2 `cerebronico-plugins-v1` — 10 plugins `cn.*`

| Plugin | Slash | Herramienta del modelo | Qué hace | Estado |
|---|---|---|---|---|
| `cn.embudo` 💻 | `/embudo web mi-nombre` | `cn_embudo_crear` | Andamia web/api/componente jsx | HECHO (manifest+panel en `extensions/` y en `mejoras/…/plugins/`) |
| `cn.pliego` 📋 | `/pliego una idea` | `cn_pliego_generar` | `CREACION.md` + borrador de plan con tareas `reflejo` | HECHO |
| `cn.forjador` 🔨 | `/forjar nombre:string,edad:int(18,90)` | `cn_forjador_datos` | Dataset reproducible + `mock-x.mjs` | HECHO |
| `cn.pintor` 🎨 | `/pintar #3a6ea5` | `cn_pintor_aplicar` | Armonías HSL → `cn-palette.css` + `<link>` inyectado | HECHO |
| `cn.microcopy` ✂️ | `/microcopy` | `cn_microcopy_ana` | Textos visibles + Flesch + tono | HECHO |
| `cn.rutas` 🧭 | `/rutas` | `cn_rutas_vigilar` + `cn_rutas_stub` | Imports/href/src rotos y creación de contornos | HECHO |
| `cn.critico` 🔍 | `/criticar` | `cn_critico_pasar` | 9 reglas adversarias → ENTREGABLE/REVISAR/NO | HECHO |
| `cn.microtest` 🚬 | `/smoke` | `cn_microtest_correr` | `tests/smoke.mjs` + ejecución node | HECHO |
| `cn.escriba` 📜 | `/documentar` | `cn_escriba_documentar` | README desde estado real; no pisa ajeno sin `forzar:true` | HECHO |
| `cn.aduana` 🛃 | `/aduana` | `cn_aduana_revisar` | Bloquea secretos + firma `ENTREGA/MANIFIESTO_SHA256.txt` con `crypto.subtle` | HECHO |

Validador propio: `scripts/validar-plugins.mts` (`validar.mjs:45`) — usa el `validateManifest` del IDE como fuente única.
**E2E headless:** `mejoras/cerebronico-plugins-v1/e2e-headless.mts` existe (PROMETIDO en manual: 29·0; no ejecutado aquí).
**Hueco declarado por el propio manual** (`PLUGINS_MANUAL.md:19-22`): «el host no expone método `entidad.run` — un panel no puede llamar a un espejo directamente (por eso microcopy reimplementa Flesch). Anótalo para v2.6: permiso `entities.use`». → **Nota directa para V8:** esto es deuda arquitectónica identificada, con la solución ya propuesta en el repo.
**Nota de tupla:** los plugins no tienen MANUAL individual, el manual es único (`PLUGINS_MANUAL.md`, 99 líneas) y en v1.1.1 **no había carpeta `cerebronico-plugins-v1/MANUAL_INSTALACION…`** pero sí `instalar-plugins.mjs`.

### 9.3 `cerebronico-aspecto-v1` — «A» Aspecto (fuente/tamaño/color **por sección**)

| Afirmación | Estado | Evidencia |
|---|---|---|
| Cambia SOLO el texto, sección por sección (no escala la interfaz en rem) | **HECHO** | `aspecto.ts:1-23` (crítica explícita al `html{font-size}` de v1.9) |
| 6 secciones: general ◱, chat 💬, editor 📝, explorador 🗂, paneles 🧩, cabecera 🎩 | **HECHO** | `aspecto.ts:42-49` |
| Tamaño 70–220 % con anclaje por `data-cn` | **HECHO** | `TAM_MIN=70`, `TAM_MAX=220` (`:51-52`); `anclaje()` (`:163`) |
| Multiplicación general × sección | **HECHO** | `hojaAspecto`: `calc(${tok.base} * var(--cn-fs-seccion) * var(--cn-fs-general))` (`:168, :172`) |
| Fuente: 4 pilas de sistema + heredar (cero descargas) | **HECHO** | `FUENTES` (`:56-62`): heredar, sistema, mono, serif, legible (Atkinson+Verdana) |
| Color: **solo neutros**; los acentos se conservan a propósito | **HECHO** | `NEUTROS` (`:104-107`) y generación (`:181-185`); 11 muestras + heredar (`:65-78`) |
| Inventario de tokens vigilado por test (si la UI estrena una clase, el test peta) | **HECHO** | `TOKENS_TAMANO` 14 tokens (`:86-101`); declarado en `:80-85`; suite `aspecto` (`validar.mjs:44`) escanea `src/` |
| Persistencia `localStorage cn.aspecto.v1`, hoja re-entrante `<style id="cn-aspecto-hoja">` | **HECHO** | `:189-206`; `:209-221` |
| UI | **HECHO** | `src/components/PanelAspecto.tsx` (160 líneas), montado en `Header.tsx:35,504` |

### 9.4 `cerebronico-fondo-v1` + ADUANA de tamaños + TREGUA

| Afirmación | Estado | Evidencia |
|---|---|---|
| Aduana de tamaños por formato: **gif ≤ 4 MB · mp4/webm ≤ 8 MB** (jpg/jpeg 4 MB en v1.1) | **HECHO** | `fondo.ts:20-31` (`LIMITES_BYTES`), `TIFOS_FONDO` con gif/mp4/webm/jpg/jpeg |
| Contención al proyecto: sin `/` inicial, sin letras de unidad, sin `..`, ruta relativa | **HECHO** | `fondo.ts:48-61`; `dentroDe()` (`:35-38`) |
| Motivos completos por formato inválido (no un 400 mudo) | **HECHO** | `fondo.ts:60` |
| Streaming (el motor no lo tiene en RAM) | **HECHO** (doc + endpoints `GET/POST/DELETE /api/fondo`) | `fondo.ts:8-10`; `server.ts:4823-4868` |
| Fondo por defecto = `public/fondo-predeterminado.jpg` | **HECHO** | `ide/backend/public/fondo-predeterminado.jpg` existe; `aplicar-v10.mjs` copia el asset |
| TREGUA sandbox↔chat: el volcado **cede el lazo** cada N archivos y el piloto AUTO **pausa el sync** mientras hay chat | **HECHO (lógica pura)** | `sandboxTregua.ts:20-40`: `cedeElLazo(indice, cada=8)`, `debePausarSync(streamingActivo)`, `avisoPausaSync()`; y decisión explícita de que el **sync manual nunca** se pausa (`pausarSyncManual` → `false`, `:38-40`, «constante deliberada: documenta la decisión, no el olvido») |
| Uso real de la tregua en el servidor | **HECHO** | `server.ts` marca `/*TREGUA*/` en `/api/fs/write` (`:5970`), `/api/fs/sync` (`:6138`) y `/api/fs/read` (`:6309`) |
| Suite propia | HECHO | `tests/sandboxTregua.test.ts` (42 líneas), suite `tregua` (`validar.mjs:43`) |

### 9.5 `cerebronico-espejos` (paquete) y `cerebronico-editor-v1`

- `cerebronico-espejos`: aporta `src/engine/reflejo/espejos.ts`, `src/components/EspejosSelector.tsx`, `tests/espejos.test.ts` + MANUAL_INSTALACION_SEGURA + PLAN_EJECUCION. **HECHO:** los tres archivos existen en el árbol con la lógica descrita en §3.
- `cerebronico-editor-v1`: aporta `src/components/ConsejoPanel.tsx`, `src/engine/consejoVista.ts`, `src/engine/ollamaPugil.ts` + tests. **HECHO:** existen y están en uso (`Header.tsx:36`, `validar.mjs:41-42`).
- `cerebronico-tregua-v1`: paquete de la tregua (§9.4). **HECHO:** existe la carpeta `mejoras/cerebronico-tregua-v1` en v1.1.1 (y ya en v1.0).

### 9.6 `cerebronico-v10` — ¿build/icono? (HECHO)

**No es un módulo de runtime**: es el **paquete de versionado/renombrado y assets**. Contenido real en v1.1.1:

| Archivo | Función | Línea/nota |
|---|---|---|
| `aplicar-v10.mjs` | Instalador de la capa **CEREBRÓNICO v1.0** («el gran renombrado»): marca en constants/index.html/package.json/productName/modal, **FOCO v1** (`pointer-events-none` en la Espina), fondo por defecto, recursión en dos pasos, FONDO v1.1 (jpg/jpeg); copia assets y renombra docs | `:1-8`, `:33-36` |
| `aplicar-v101.mjs` / `aplicar-v102.mjs` / `aplicar-v103.mjs` | Capas incrementales (v1.0.1 Batilos, v1.0.2 espejos, v1.0.3 PODERES — este último **copia `poderes-espejos.ts`** y envuelve los `.ejecutar`) | `aplicar-v103.mjs:1-8` |
| `poderes-espejos.ts` | Asset fuente de los 22 poderes | idéntico al del árbol de v1.1.1 |
| `renombrar-docs.mjs` | Barrido de documentación | — |
| `assets/build/icon.png`, `assets/build/ICONO.txt` | Icono del EXE | **HECHO**: `ide/backend/build/icon.png` + `icon.ico` existen; `package.json.build.win.icon = "build/icon.ico"` |
| `assets/public/fondo-predeterminado.jpg` | Fondo por defecto | **HECHO**: existe en `ide/backend/public/` |

**Respuesta a la pregunta del enunciado («v10: ¿build/icono?»):** sí, además del renombrado: `v10` **es** la capa de build/icono/fondo por defecto, y su efecto es verificable en `package.json` (`build.win.icon`, `productName: "CerebróNico"`, `appId: com.cerebronico.ide`) y en la presencia de los assets.

---

## 10. Persistencia: `.cerebro-db/` y endpoints del consejo

### 10.1 Qué vive en `.cerebro-db/` (HECHO)

Raíz de datos: `PROJECT_ROOT` (en Electron, `PROJECT_DIR` → userData; cura documentada en `CHANGELOG_v1.1.0.md:9` of «instalación por-máquina perdía escrituras»).

| Archivo | Qué guarda | Quién lo escribe | Sobrevive reinicio |
|---|---|---|---|
| `entidades.json` | `{activas:{id:boolean}, en}` — solo el botón de las 38 herramientas | `POST /api/consejo/entidad` (`server.ts:3368-3375`) | **SÍ** (`:3351-3355` re-aplica al arrancar) |
| `espejos.json` | `SeleccionEspejos` = `{grupo, espejos[], en}` | `POST /api/consejo/espejos` (`server.ts:3711-3713`) | **SÍ** (`:3382-3390` carga con `normalizarSeleccion`; si es inválida **declara** y arranca sin grupo) |
| `espejos-salud.json` | tabla de salud de la flota (Reflejo v5) | `guardarSalud()` (`server.ts:3464, 3473`) | **SÍ** |
| `leyes-aprendidas.json` | `{leyes:[…], en}` — leyes `prioridad ≥ 100` | `POST /api/espejos/leyes/aprender` (`:3895`), `/desactivar` (`:3960`) | **SÍ** — cura explícita del bug ESM (§4.6) |
| `kb.json` | `{version:2, entries:[], seededBy:"postinstall"}` sembrado; luego conocimiento del motor | `postinstall.mjs:52-64`; endpoints `/api/engine/kb*` (`server.ts:2778,4252,4263,4273`) | **SÍ** (el postinstall **conserva** si ya existe, `:59-61`) |
| `fondo.<ext>` | copia del fondo activo, servido en streaming | `POST /api/fondo` (`server.ts:4828`) | SÍ |
| `planes.json` (vía `taskStoreFs`) | planes con estados, tareas, log y `alTerminarTarea` como punto de guardado | `planRunner`/`taskStoreFs.ts` (239 líneas) | **SÍ** — y al reiniciar quedan **`pausado`** y reanudables (`planRunner.ts:290-307`) |
| `~/.cerebronico/espejos/` (¡fuera de `.cerebro-db`!) | espejos personalizados `.mjs` + `manifest.json` | `inicializarPool` (`server.ts:3734-3752`) | SÍ (carga al arranque, `import()` dinámico) |

**Memoria que NO sobrevive (por diseño declarado):** `MEMORIA` del consejo (500 notas, `consejo.ts:116-118`: «no persiste a disco a propósito — para eso está knowledgeBase/planes.json»).

### 10.2 Endpoints del consejo/espejos (HECHO, `server.ts`)

| Método | Ruta | Qué hace | Línea |
|---|---|---|---|
| GET | `/api/consejo/estado` | catálogo vivo (50), cuentas y nota | `3360` |
| POST | `/api/consejo/entidad` | `{id, activa}` → cambia y persiste; 400 con motivo si es especialista o no existe | `3364` |
| POST | `/api/consejo/turbo` | enciende/apaga el catálogo de poderes en el prompt | `3393` |
| GET | `/api/consejo/espejos` | `estadoEspejos()`: 10 espejos, 4 grupos, selección, modos | `3398` |
| POST | `/api/consejo/espejos` | fija selección (motor + disco) con validación | `3707` |
| GET | `/api/espejos/leyes` | catálogo de leyes activas (curadas + aprendidas) | `3434` |
| GET/POST | `/api/espejos/salud[/dormir\|/reset]` | salud de la flota | `3444, 3453, 3468` |
| POST | `/api/espejos/equipo` | `grupoPorTarea(texto)` | `3483` |
| POST | `/api/espejos/orquestar[/:familia]` | aplica leyes a una frase | `3579, 3653` |
| GET/POST | `/api/espejos/personalizados`, `/instalar`, `/desinstalar` | pool de espejos `.mjs` | `3758, 3773, 3878` |
| POST | `/api/espejos/leyes/aprender`, `/desactivar` | leyes aprendidas | `3895, 3960` |
| POST | `/api/reflejo`, GET `/api/reflejo/estado` | motor determinista | `3332, 3340` |
| POST | `/api/conductor` | frase → plan | `3991` |

### 10.3 Discrepancia de rutas de espejos personalizados (HECHO, hallazgo)

- **Servidor:** `PROJECT_ROOT/.cerebronico/espejos` (`server.ts:3734`).
- **Mensaje de error al usuario:** `~/.cerebronico/espejos/` (`consejo.ts:388`).
- **Manual:** `~/.cerebronico/espejos/` (`ESPEJOS_PERSONALIZADOS.md`, §1; `AGENTES_MANUAL.md:121` en el texto de referencia general).
→ El mensaje de ayuda apunta a una carpeta que **no** es la que el servidor lee. Impacto: bajo funcionalmente, alto en soporte. Anotado para V8 (§15-H5).

---

## 11. Frontend agéntico — componentes y comportamiento

### 11.1 Espina de Actividad (COREO)

| Requisito del enunciado | Componente / línea | HECHO |
|---|---|---|
| 11 acciones con icono y movimiento | `src/engine/coreo.ts:27-39` (tabla `ACCIONES`) + `EspinaActividad.tsx` | Sí |
| Franja de 26 px al pie, poll 700 ms | `EspinaActividad.tsx:57, :79` | Sí |
| Chip vivo + últimos 4 atenuados | `:85-86` (`cn-coreo-live` y `opacity-70`) | Sí |
| Reposo declarado, caída declarada | `:81-82` («⛔ el motor no contesta (reintento cada 700 ms)», «en reposo…») | Sí |
| Bus para otros órganos | `:48-50` (`CustomEvent("cn:coreo")` + `window.__cnCoreo`) | Sí |
| Montaje sin alterar layout | `App.tsx:3323` + FOCO v1 (`pointer-events-none`, `pb-[26px]`) | Sí |
| Movimiento por acción (CSS puro, testeable en node) | `coreo.ts:116-142` (`hojaCoreoCss()`: latido, órbita, escaneo, tecleo, chispa, sacudida, brillo) | Sí |
| Accesibilidad | `coreo.ts:137-140` (`prefers-reduced-motion`) | Sí |

### 11.2 «⚡ Consejo»

| Requisito | Componente / línea | HECHO |
|---|---|---|
| Modal con los 12 votantes a la vista | `src/components/ConsejoPanel.tsx:93-99` (lista + texto «los especialistas no se duermen») | Sí |
| Botones despertar/dormir | `:58-68` (iconos `Sun`/`Moon`, `POST /api/consejo/entidad`, motivo en pantalla `:41`) | Sí |
| Selector de grupos de espejos **reutilizado** (no duplicado) | `:18, :87` (`<EspejosSelector />`) | Sí |
| Montaje | `Header.tsx:36, 662` | Sí |
| Agrupación honesta de las 3 listas | `ConsejoPanel.tsx:90-92` (`g.espejos`, `g.dormidas`, `g.despiertas`) desde `engine/consejoVista.ts` (53 líneas) | Sí |
| Portal al `body` (z-orden) | `:12, :76-77` (`createPortal`, marca `/*ZORD*/`, con el motivo escrito: dentro del Header el modal nacía recortado) | Sí |

### 11.3 «A» Aspecto

Panel `src/components/PanelAspecto.tsx` (160 líneas), montado en `Header.tsx:35, 504`; controles por sección (tamaño 70–220 %, fuente, color) alimentando `engine/aspecto.ts` (§9.3). **HECHO.**

### 11.4 «Ⓐ Forjar» en la UI

- `src/components/PluginForge.tsx` (138 líneas), abierto desde el Gestor de extensiones: `ExtensionManager.tsx:17` (import) y `:46` (render condicional con `onForjado` → recarga).
- Componente de núcleo relacionado: `src/components/SelfImprovementPanel.tsx` y `PluginForge.tsx` coexisten; la Forja es la vía declarada por el manual (`MANUAL_FORJA_v1.md:16-21`: «Por Gestor: «⚒ Forjar» en `ExtensionManager` abre `PluginForge`… con formulario de receta + preview de nombres `fj_<slug>_<herramienta>`»).

### 11.5 Fondo animado: aduana de tamaños y tregua sandbox↔chat

- Aduana de tamaños: `engine/fondo.ts` (§9.4) — **HECHO**, con límites por formato y motivos completos.
- Capa: `src/components/FondoLayer.tsx` (139 líneas) + `src/components/AppBackground.tsx` (61 líneas: imagen personalizada con **prioridad** sobre el preset; si no hay ni imagen ni preset, no pinta nada — `AppBackground.tsx:31`).
- Tregua: `engine/sandboxTregua.ts` (§9.4) — el piloto AUTO **posa** el sync mientras un chat transmite y **avisa**; el sync manual nunca se pausa (`:38-40`).
- **Nota de arquitectura (HECHO):** conviven **dos** sistemas de fondo: el «fondo animado» de FONDO v1 (`FondoLayer`) y el `AppBackground` de ProSettings/Presets. Son capas distintas, no un único sistema; V8 debería unificarlas (§15-H5).

### 11.6 Badge «📎 embeddings» y selector de modelos

| Requisito | Evidencia | HECHO |
|---|---|---|
| Detección de embedders vs chat | `src/engine/ollamaPugil.ts:17` (familias `snowflake-arctic-embed|nomic-embed|minilm|mpnet|bge|mxbai-embed|sensenova-embed|bce-embed|jina-clip|e5-|bge-m3|embed`), `:23-30` (`/api/show` → `capabilities`/`model_architecture` bert·embed·minilm **manda** sobre el nombre), `:44` (`tipoDeModelo` → `"embeddings"` \| `"chat"`) | Sí |
| Explicación del 400 de Ollama **antes** de gastarlo | `ollamaPugil.ts:39` — texto literal que se muestra al usuario: ««X» es un modelo de EMBEDDINGS, no de chat: produce vectores numéricos… Ollama lo rechaza con HTTP 400 si le pides texto… No está roto: está para otra cosa» | Sí |
| Badge en la lista de modelos | `ModelSelectorModal.tsx:809-816` y **repetido** en `:817-824` (bloque JSX duplicado, ambos con `/*PUGIL*/`) | Sí — **con defecto cosmético** (badge duplicado) |
| El embedder no se puede seleccionar para conversar | `ModelSelectorModal.tsx:788, :796` (`esEmbed` → `if (esEmbed) return;` con comentario «un embedder no se elige para conversar») | Sí |
| Grupo de espejos **dentro** del selector de modelos | `ModelSelectorModal.tsx:31` (import) y `:769` (`<EspejosSelector />`, justo debajo de los filtros) | Sí |
| Selector de grupos: ∅ Ninguno / 4 grupos / ★ Todos + ajuste fino por espejo | `EspejosSelector.tsx:94-115` | Sí |
| Doble guardado (localStorage + motor) con aviso si falla uno | `EspejosSelector.tsx:53-71` (los cuatro desenlaces tienen mensaje propio) | Sí |

---

## 12. Tests: `scripts/validar.mjs` y las suites

### 12.1 Estructura (HECHO, `validar.mjs`, 229 líneas)

1. **Puerta 1 — tipos**: ejecuta `tsc --noEmit` como **paso obligatorio** dentro de `validar` (no solo en `npm run lint`); si falta el compilador **no se salta en silencio: para** (`:144-165`, con la historia del 19-sep-2026 y los 7 defectos reales que aparecieron así).
2. **27 suites** declaradas en `SUITES` (`:24-52`), cada una con `{id, archivo, que}`.
3. Localización de CLIs sin depender de `npx`: `cliDeTsx()` (`:61-67`), `cliDeTsc()` (`:75-81`).
4. **Extracción del veredicto por expresión regular** sobre la salida de cada suite: `(\d+) correctas` / `(\d+) fallidas`; caso especial `roundtrip` («N perfectas / N SILENCIOSAS») (`:97-106`).
5. **Tres condiciones para el verde**: `erroresTipos === 0 && totalMal === 0 && suitesEnRojo === 0` (`:206`). El comentario explica el agujero que se tapó: «una suite fantasma imprimía «0 FALLOS» y el veredicto decía TODO CORRECTO» (`:177-189`).

### 12.2 Las 27 suites (HECHO)

| # | id | Archivo | Qué comprueba |
|---|---|---|---|
| 1 | `planner` | `tests/planner.test.ts` | grafo, dependencias, paralelismo, cancelación |
| 2 | `store` | `tests/store.test.ts` | apagón a mitad, reparación, escritura atómica |
| 3 | `runner` | `tests/runner.test.ts` | segundo plano y semáforo global |
| 4 | `roundtrip` | `tests/roundtrip.test.ts` | ida y vuelta de formatos, pérdidas silenciosas |
| 5 | `export` | `tests/export.test.ts` | exportar la app creada a Android |
| 6 | `panel` | `tests/panel.test.ts` | intérprete de tareas del panel: avisa en vez de ignorar |
| 7 | `chatOrders` | `tests/chatOrders.test.ts` | órdenes del chat → conversor → editor → preview |
| 8 | `guard` | `tests/guard.test.ts` | guardián de escritura |
| 9 | `resiliencia` | `tests/resiliencia.test.ts` | lecciones convertidas en guardián |
| 10 | `imagen` | `tests/imagen.test.ts` | imágenes gratis, cadena de proveedores, cortacircuito |
| 11 | `reflejo` | `tests/reflejo.test.ts` | frases con typos → órdenes válidas; escalera de modelos |
| 12 | `agentico` | `tests/agentico.test.ts` | las 50 entidades, el botón de dormidas, tarea `reflejo` en el planificador |
| 13 | `espejos` | `tests/espejos.test.ts` | los 10 espejos, sus grupos con selector y el paralelo real |
| 14 | `forja` | `tests/pluginForja.test.ts` | receta→complemento, slot de lógica, puente del chat |
| 15 | `coreo` | `tests/coreo.test.ts` | clasificador, anillo, vocabulario de movimiento |
| 16 | `fondo` | `tests/fondo.test.ts` | aduana de fondos (tipos, tamaños, contención) |
| 17 | `consejo` | `tests/consejo.test.ts` | agrupar el consejo, dormir/despertar, línea honesta |
| 18 | `pugil` | `tests/ollamaPugil.test.ts` | embedders vs chat: el 400 explicado antes de gastarlo |
| 19 | `tregua` | `tests/sandboxTregua.test.ts` | cesión, pausa y aviso |
| 20 | `aspecto` | `tests/aspecto.test.ts` | hoja determinista de texto por sección + inventario vivo |
| 21 | `plugins` | `scripts/validar-plugins.mts` | los 10 `cn.*`: manifest oficial, handlers, slash, protocolo |
| 22 | `espejosPers` | `tests/espejos-personalizados.test.ts` | pool de espejos `.mjs`, manifiestos, recarga en caliente |
| 23 | `aduana` | `tests/sandboxCompat.test.ts` | ADUANA v2: python/rust/go/java/docker/make… |
| 24 | `boveda` | `tests/boveda.test.ts` | transporte de imagen al disco real con `INDICE.json` |
| 25 | `reflejo5` | `tests/reflejo5.test.ts` | salud, confianza del enrutado, leyes aprendidas que sobreviven |
| 26 | `imagen5` | `tests/imagen-v5.test.ts` | el reintento prometido: congestión, 4xx, cancelación |
| 27 | `grupo` | `tests/grupo.test.ts` | equipo por tarea, carril cpu, despacho cpu-primero |

**Verificación cruzada de la evolución de suites:** v1.0.0 = **21** suites; v1.1.1 = **27** (las 6 nuevas: `espejosPers`, `aduana`, `boveda`, `reflejo5`, `imagen5`, `grupo`) — coherente con §13.

### 12.3 La suite `espejos` — «72 comprobaciones»: **CONFIRMADO (HECHO)**

`tests/espejos.test.ts` contiene **62 llamadas `comprobar(...)` fuera de bucles** + **1 llamada dentro de `for (const id of IDS_ESPEJOS)`** (`:47-50`) que se ejecuta **10 veces** → **72 comprobaciones efectivas**. Composición:

| Bloque | Comprobaciones | Línea |
|---|---|---|
| 1. Catálogo: 50 totales, 40 de v2.5 conservados, 10 espejos, ids únicos, 10 espejos despiertos, 20/18, `estadoConsejo` | 7 | `:36-44` |
| 2. Regla de hierro: cada espejo sin datos responde `ok:false` **con motivo** | 10 (bucle) | `:47-50` |
| 3. Valores REALES por espejo (Bell 50/50, complementaria del azul = `#ffff00`, `2·c = 599584916`, `1.5 km → 1500 m`, `raiz(144)+1 = 13`, `mcd(12,18,24)=6 / mcm=72`, factorización de 360, rombo → lotes `[1,2,1]`, ciclo rechazado…) | 41 | `:55-126` |
| 4. Sinergia: la salida de `espejo.artes` se interroga con `datos.json-ruta` | 1 | `:126` |
| 5. Grupos y selector: 4 grupos, ids válidos, `espejosDelGrupo`, normalización con motivo, `IDS_SELECCION` de 8, `estadoEspejos`, nota al prompt, nota vacía sin selección | 13 | `:129-143` |
| 6. Plan de 10 espejos: paralelo real, plan `hecho`, cada entidad ejecutó, < 2,5 s totales | 4 | `:168-170` |
| 7. Chat: tarea con espejo aceptada / espejo inexistente rechazado; instrucciones del modelo con el equipo activo | 3 | `:175-180` |

Ejemplos de aserciones literales destacables (útiles como *golden values* para V8):
- `espejo.artes` complementaria del azul → `#ffff00` (`:65`); áurea ≈ 61,8 (`:66`).
- `espejo.disenios` ancho 1440 → **6 columnas** y escala 8pt que incluye 8 y 64 (`:70`).
- `espejo.fisicos` `2·c` → `599584916` (`:103`); conversión imposible se declara **en la salida** sin fallar (`:106`).
- `espejo.planificadores` **invariante en los 4 tramos**: `io ≥ 1 ∧ cpu ≥ 1 ∧ io ≤ 16` con 1 núcleo (`:87-88`).
- `espejo.cuantico` Bell: `p(00)=0.5, p(11)=0.5, p(01)=0`, norma 1 (`:117`); 9 qubits → motivo (`:120`).

### 12.4 Los «contratos numéricos» estilo «conserva + delta» (HECHO)

`tests/agentico.test.ts:30-43` (cabecera del bloque y aserciones):

```
// ESPEJOS v1: la cuenta creció a 50. Se aserta CONSERVAR los 40 de v2.5
// y luego el delta — congelar la cifra total convertiría cada crecimiento en un falso roto
comprobar("50 entidades", ENTIDADES.length === 50)                                  // :34
comprobar("conserva los 40 de v2.5", …length === 40)                                // :35
comprobar("12 especialistas + 38 herramientas (10 espejos)", esp===12 && herr===38) // :38
comprobar("ids únicos", new Set(...).size === 50)                                   // :39
comprobar("20 herramientas activas por defecto (10 de v2.5 + 10 espejos)", …===20)  // :41
comprobar("18 dormidas esperan su botón", …===18)                                   // :42
comprobar("estadoConsejo cuadra con el registro", total 50 / activas 20 / dormidas 18) // :43
```

También hay *golden values* criptográficos y de unidades (`:64` sha256 de `"abc"`; `:69` `km→m = 1500`; `:72` contraste blanco/negro = `21.00:1` y AA SÍ). Y una vuelta a los valores por defecto **al final del test** (`:78`): `cambiarActivacion(id, false)` sobre 5 herramientas y luego reposición — los tests **mutan estado global** del catálogo y lo restauran; relevante si V8 ejecuta suites en paralelo.

### 12.5 Cómo se ejecutan — y por qué no se pudo reproducir aquí

```bash
npm run validar      # → node scripts/validar.mjs   (package.json scripts.validar)
npm test:e2e         # → python3 tests/comprehensive_e2e_test.py
npm run reflejo      # → node scripts/gen-reflejo.mjs   (regenera tablas y valida rangos)
npm run modelos      # → node scripts/instalar-modelos.mjs
npm run lint         # → tsc --noEmit
```
`predev` encadena `gen-reflejo.mjs && gen-modelfile.ts` antes de `dev` (`package.json:28`).

**NO VERIFICABLE EN ESTE ENTORNO (declarado):** ninguna de las 5 carpetas contiene `node_modules` (comprobado: `ls -d node_modules` → ausente en v1.1.1). Por tanto **no** he ejecutado `validar`, `tsc` ni las suites; los conteos «1627 · 0 · 27» y «1481 · 0 · 21» son **cifras declaradas por el CHANGELOG**, no medidas aquí. Todo lo asertado en este informe proviene de lectura de código y de conteo estático (p. ej. el 72 de §12.3, contado a mano sobre el archivo).

---

## 13. DIFF entre versiones — qué archivo cambió en cada salto y qué significa

Metodología: `diff -rq <versionA> <versionB>` excluyendo `node_modules`. Volcado íntegro en la sesión de auditoría; aquí se resume cada línea con su significado funcional.

| Salto | Nº de diferencias | Solo en destino (añadidos) | Modificados |
|---|---|---|---|
| v1.0 → v1.0.1 | **14** | 4 | 10 |
| v1.0.1 → v1.0.2 | **13** | 2 | 11 |
| v1.0.2 → v1.0.3 | **14** | 3 | 11 |
| v1.0.3 → v1.1.1 | **43** | 21 | 22 |

### 13.1 v1.0 → v1.0.1 — «la prueba Batilos Record» (`CHANGELOG_v1.0.md:51-69`)

| Archivo | Tipo | Funcionalidad que representa |
|---|---|---|
| `ide/SEGURIDAD_CREDENCIALES.md` | **AÑADIDO** | Checklist de sellado: el instalador ya no empaqueta `.env` (se sacó de electron-builder para no incrustar claves reales en el EXE) |
| `MEMORY.md` | **AÑADIDO** (en la raíz) | Memoria del proyecto versionada |
| `mejoras/cerebronico-v10/aplicar-v101.mjs` | **AÑADIDO** | Instalador de esta capa |
| `ide/backend/package.json` | MOD | versión → 1.0.1 (+ scripts/puertas de la capa) |
| `ide/backend/server.ts` | MOD | orden visible en el chat central (el canal directo escondía la orden del Editor web → «no hizo nada»), consola del sandbox limpia, PROPIO-IDE por ruta de producción |
| `ide/backend/src/App.tsx` | MOD | publicación de la orden/respuesta en el chat + FOCO v2 (reset al perder foco de ventana: `userSelect:none` congelado) |
| `ide/backend/src/components/RightSidebar.tsx` | MOD | saneo de la consola del sandbox (no resucita sesiones viejas de localStorage) |
| `unificar-mejoras.mjs`, `CHANGELOG_v1.0.md`, `MANIFIESTO_SHA256_v1.0.txt`, `IDEA_DEL_MOTOR_v2.0.md`, `PLAN_V2.1_V2.2.md`, `RESULTADO_PRUEBAS_MOTOR.txt` | MOD | hashes/docs |
| `changelog-v10.mjs` | **ELIMINADO** | utilidad de una sola vez |

### 13.2 v1.0.1 → v1.0.2 — «la era de los espejos» (`CHANGELOG_v1.0.md:23-47`)

| Archivo | Tipo | Funcionalidad |
|---|---|---|
| `ide/backend/build/icon.ico` | **AÑADIDO** | Icono EXE multi-tamaño (16→256) declarado en `build.win.icon` |
| `mejoras/cerebronico-v10/aplicar-v102.mjs` | **AÑADIDO** | Instalador de la capa |
| `ide/backend/src/engine/reflejo/espejos.ts` | MOD | `espejo.codigos` ampliado con `simbolosLista` (hasta 24 nombres reales) + prompt de grupo espejo |
| `ide/backend/src/engine/toolRegistry.ts` | MOD | herramienta **`consultar_espejo`** documentada: el modelo puede llamar espejos en **lotes de hasta 8** |
| `ide/backend/src/engine/manuals.ts` | MOD | manuales y juez de recetas al día con los espejos |
| `ide/backend/src/constants.ts` | MOD | versión visible V1.0.2 (fuente única) |
| `ide/backend/src/utils/engine.ts` | MOD | OLLAMA v2: reintentos 2/4/6 s (proxy) y 2 s (directo), 4 intentos (~14 s) — «un ECONNREFUSED casi siempre es Ollama ARRANCANDO» |
| `ide/backend/server.ts` | MOD | endpoint/plumbing asociado |
| `ide/backend/package.json` | MOD | versión 1.0.2 |
| `CHANGELOG_v1.0.md`, `MEMORY.md`, `MANIFIESTO_SHA256_v1.0.txt`, `unificar-mejoras.mjs` | MOD | docs/hashes |

### 13.3 v1.0.2 → v1.0.3 — «PODERES: los espejos explotados» (`CHANGELOG_v1.0.md:3-21`)

| Archivo | Tipo | Funcionalidad |
|---|---|---|
| `ide/backend/src/engine/reflejo/poderes-espejos.ts` | **AÑADIDO** | **22 poderes** deterministas en 8 espejos + `potenciarEspejos` + `CATALOGO_TURBO` |
| `mejoras/cerebronico-v10/poderes-espejos.ts` + `aplicar-v103.mjs` | **AÑADIDOS** | Asset + instalador de la capa |
| `ide/backend/src/engine/reflejo/espejos.ts` | MOD | import + llamada `potenciarEspejos(lista, r)` al final de `crearEspejos` |
| `ide/backend/src/components/Header.tsx` | MOD | botón **🚀 Turbo** en cabecera |
| `ide/backend/src/engine/manuals.ts`, `toolRegistry.ts` | MOD | `consultar_espejo` documenta sus poderes; error amable lista los disponibles |
| `ide/backend/src/constants.ts`, `package.json`, `server.ts` | MOD | versión V1.0.3 + endpoint `POST /api/consejo/turbo` |
| `CHANGELOG_v1.0.md`, `MEMORY.md`, `MANIFIESTO_SHA256_v1.0.txt`, `unificar-mejoras.mjs` | MOD | docs/hashes |

### 13.4 v1.0.3 → v1.1.1 — Reflejo v5 + BUILD v1 (el salto grande: 43 diferencias)

**Añadidos (21):**

| Archivo nuevo | Qué aporta |
|---|---|
| `ide/backend/src/engine/reflejo/orquestador.ts` | **Orquestador único**: 16 leyes curadas, fs inyectado, leyes aprendidas, confianza 0.55 / margen 0.08 |
| `ide/backend/src/engine/reflejo/salud.ts` | Salud de flota (Laplace, estrella ≥0.95, dormido <0.5, ≥8 usos) |
| `ide/backend/src/engine/reflejo/cargadorEspejos.ts` | Carga de espejos personalizados `.mjs` desde `.cerebronico/espejos/` (server-only: `node:fs`) |
| `ide/backend/src/engine/reflejo/pool.ts` | **Estado puro** del pool (la cura del BUILD v1) |
| `ide/backend/src/engine/reflejo/tablas-lite-v3.json` (359 KB) / `tablas-max-v3.json` (2,03 MB) | Tablas v3 (14.645 / 82.459 entradas) |
| `ide/backend/scripts/gen-tablas-v3.mjs` | Generador de las tablas v3 |
| `ide/backend/src/engine/bovedaLocal.ts` | BÓVEDA v1: transporte de imagen al disco real indexado |
| `ide/backend/src/engine/sandboxCompat.ts` | ADUANA v2: 18 tipos de proyecto |
| `ide/backend/tests/{boveda,espejos-personalizados,grupo,imagen-v5,reflejo5,sandboxCompat}.test.ts` | **6 suites nuevas** (21 → 27) |
| `ide/backend/package-lock.json` | Lockfile (reproducibilidad de instalación) |
| `CHANGELOG_v1.1.0.md`, `CHANGELOG_v1.1.1.md`, `CREDENCIALES.md`, `ESPEJOS_MANUAL.md`, `ESPEJOS_PERSONALIZADOS.md` | Documentación de la era v5 |

**Modificados (22, los relevantes):**

| Archivo | Cambio funcional |
|---|---|
| `src/engine/reflejo/consejo.ts` | Import del pool **desde `./pool` (puro)** en lugar del cargador — línea 24 con el comentario de la cura; soporte de espejos personalizados en `ejecutarEntidad` |
| `src/engine/reflejo/index.ts` | Tablas **v3** por `import` en vez de `readFileSync`; `estadoReflejo` con 22 acciones/conectores |
| `src/engine/taskPlanner.ts` | `pesoPorDefecto` (reflejo→cpu), campo `grupo`, despacho CPU-primero, cancelación que despierta el bucle |
| `src/engine/chatOrders.ts` | Ajustes de órdenes (grupo/leyes) |
| `src/engine/cerebroReflejo.ts` | Motor v3.0/v5 (acciones, plantillas, units, fechas) |
| `src/engine/imageGen.ts` | **IMAGEN v5**: reintentos con backoff y clasificación de congestión (`intentos`; default 1 = contrato viejo; 3 en chat, 2 en planes) |
| `src/engine/planExecutors.ts` | Reintentos/despacho acordes a v5 |
| `src/engine/projectPorter.ts` | ADUANA v2 + `buscarProyectoAnidado` |
| `src/App.tsx`, `src/components/{ChatCenter,Header,PanelAspecto}.tsx` | UI v5 (consulta de espejos, Turbo, Aspecto, salud) |
| `server.ts` | Orquestador + salud + equipo + bóveda + espejos personalizados + IMAGEN v5 (≈ +1.500 líneas respecto a v1.0.3) |
| `scripts/validar.mjs` | 21 → 27 suites |
| `tests/espejos.test.ts`, `tests/reflejo.test.ts` | Ampliados |
| `electron-main.cjs`, `agent_bridge_5000.py`, `README.md` | PROJECT_DIR/userData; transporte de imagen; docs |
| `MEMORY.md`, `package.json` | Memoria y versión 1.1.1 |

### 13.5 Lectura de la evolución (qué significa cada salto)

```
v1.0.0  ── marca + FOCO + icono + fondo por defecto + recursión educada   (producto, no motor)
v1.0.1  ── canal del Editor web VISIBLE + FOCO v2 + operación sin .env    (fiabilidad de UI/seguridad)
v1.0.2  ── consultar_espejo en lotes + símbolos reales + OLLAMA v2        (los espejos pasan a ser herramientas del modelo)
v1.0.3  ── 22 PODERES + TURBO                                             (profundidad de los espejos)
v1.1.0  ── orquestador, salud, GRUPO, bóveda, ADUANA v2, IMAGEN v5, tablas v3, espejos personalizados  (autonomía + fiabilidad)
v1.1.1  ── BUILD v1: inversión de dependencia (pool.ts) para que `vite build` no reviente
```

Es decir: **el núcleo agéntico maduró de "votación de entidades" (v1.0.x) a "enrutado por leyes con confianza + flota medida + pool extensible en caliente" (v1.1.x)**, mientras el producto solo cambió de envoltorio. Para la fusión V8, la materia prima agéntica útil está **entera** en v1.1.1.

### 13.6 La cura de BUILD v1 (detalle técnico, HECHO)

`CHANGELOG_v1.1.1.md:1-27`: el `npm run build` del propietario moría en vite/rollup con `"existsSync" is not exported by "__vite-browser-external"` porque `consejo.ts` —que **viaja al bundle del navegador** (`chatOrders → consejo`)— importaba `buscarEnPool`/`poolListo` desde `cargadorEspejos.ts`, módulo que toca `node:fs`. La cura **no** fue un parche de bundler sino **inversión de dependencia**: nace `pool.ts` (100 % puro, sin fs ni path) y el cargador **re-exporta** su API («la firma pública no cambia y `server.ts` no necesitó ni una línea de ajuste»). Verificado: `pool.ts:6-17` lo declara («Reglas de hierro: sin fs, sin path, sin red, sin `node:*`») y `consejo.ts:24` importa del pool. Puertas declaradas: vite ✓ (2010 módulos) + esbuild ✓ + `validar` 1627 · 0 · 27 + `tsc` 0 errores.

---

## 14. Límites declarados (AGENTES_MANUAL §7) — verificados en código

| # | Límite declarado (`AGENTES_MANUAL.md:103-110`) | Estado | Evidencia |
|---|---|---|---|
| 1 | «Las herramientas de máquina (`maq.*`, `datos.hash`, `datos.uuid`) corren en el **SERVIDOR** (Node); en el navegador **responden por qué no**» | **HECHO** | `consejo.ts:35-48`: interface `PrimitivasSistema` + `configurarSistema()` + `sinSistema(id)` que devuelve `ok:false` con motivo literal «mide el SISTEMA: solo corre en el servidor de Cerebrónico (Node), no en el navegador». Las 5 herramientas afectadas (`maq.ram`, `maq.cpu`, `maq.tramo`, `datos.hash`, `datos.uuid`) comprueban `if (!SISTEMA) return sinSistema(...)` (`:218, :222, :254, :259, :264`). El servidor las inyecta en la raíz de composición; los tests también (`espejos.test.ts:22-23`) |
| 2 | «El investigador **no navega**: da esqueletos de plan, no resultados» | **HECHO por diseño** | `investigador` es una ficha sin ejecutor ni rama de red (`consejo.ts:93`); su descripción dice «Sin red no investiga: lo declara». **No existe** ninguna herramienta de red en el catálogo de 50 (`ejecutar` solo en las 38 herramientas, todas locales). El investigador **no** tiene rama en `DUEÑO_DE` (§2.2): tampoco vota |
| 3 | «El lingüista **no traduce**: limpia y cuenta; traducir es del neural» | **HECHO** | `consejo.ts:92` (descripción literal). Riesgo detectado: el vocabulario del reflejo incluye `traduce/traducir/tradusi` → intención **`convertir`** (`gen-reflejo.mjs:77, :109`), no una entidad «traductor». Cumple el límite: traducir se resuelve por conversión estructural o por el modelo, no por el lingüista |
| 4 | «El conductor depende de lo bueno que sea tu director local; con 135M–400M fallará a veces — por eso existe la reparación y el fallback» | **HECHO** | `server.ts:3998` (default 135M) + bucle de 1 reparación (`:4014`) + `origen:"fallback"` 422 con motivos (`:4026`) + `origen:"sin-director"` 502 (`:4031`) |
| 5 (manual §8) | «Ningún camino te da **juicio**… el reflejo más fino seguirá siendo determinista (esa es su virtud y su techo)» | **HECHO** | Los 10 espejos son funciones puras sin modelo; el único camino con «juicio» es el director neural o la nube (`server.ts:3998-4010`) |
| 6 (manual §8) | «Las herramientas de máquina solo corren en el servidor; una extensión en el navegador **no puede medir RAM del PC**» | **HECHO** | Un panel vive en iframe con `postMessage`; los permisos (`extensions.ts:33-42`) **no** incluyen `system.read`; no existe API de medición expuesta al panel. La única vía es `exec`/`workspace.*` según permisos |
| 7 (manual §8-camino 2) | «El camino 2 requiere `npm run validar` en verde ANTES de producción: el catálogo tiene contratos numéricos (40/12/28/10) y los tests los vigilan» | **HECHO** | Contratos en `tests/agentico.test.ts:34-43` con la regla «conserva + delta» (§12.4) |

**Límite declarado que NO se sostiene tal cual (PROMETIDO/inexacto):**

| Afirmación | Realidad en código |
|---|---|
| `AGENTES_MANUAL.md:5` «10 espejos `espejo.*` con **grupos por tarea**» dentro del anexo v2.6.3 | **HECHO en v1.1.1** (GRUPOS_ESPEJOS + `grupoPorTarea`), pero el anexo mezcla dos estados (§1.2). No es incumplimiento, es documentación desfasada |
| `ESPEJOS_PERSONALIZADOS.md:4-8` «Paso 2 **no implementado todavía**» | **INCUMPLIDO en el sentido contrario**: está implementado (cargador + pool + 4 endpoints + suite). El documento protege de menos, no de más |
| `consejo.ts:388` «manifest en `~/.cerebronico/espejos/`» | El servidor lee `PROJECT_ROOT/.cerebronico/espejos` (`server.ts:3734`) |
| Manual §2 «12 especialistas votantes (**siempre activos**) … Votan sobre frases igual que el reflejo v2.4» | **Maticemos:** los 12 son inmortales como entidad, pero solo **7 acciones** tienen dueño mapeado en `DUEÑO_DE`; 5 fichas (linguista, investigador, validador, telemetria, memorista) no reciben votos por acción. «Siempre activas» ≠ «siempre votantes» |

---

## 15. Hallazgos y notas para la fusión V8

| # | Hallazgo | Severidad | Evidencia | Acción sugerida en V8 |
|---|---|---|---|---|
| **H1** | **Doble fuente de versión**: `constants.ts` dice `V1.0.3`, `package.json` dice `1.1.1`, `AGENTES_MANUAL` describe v2.5/2.6.3, CHANGELOGs hablan de Reflejo v3.0/v5 | Alta (confusión operativa) | `constants.ts:190`, `package.json:4`, `AGENTES_MANUAL.md:1-16` | Unificar en **una** constante de build inyectada (p. ej. desde `package.json`) y regenerar el manual con un solo ANEXO por release |
| **H2** | La **selección de espejos** se persiste «para `/api/conductor`» pero el conductor **no la consume** | Media (promesa de arquitectura) | persistencia `server.ts:3711`; consumo ausente en `server.ts:3994-4024` | Inyectar `notaSeleccionEspejos()` en el `system` del director y usarla para filtrar leyes del orquestador |
| **H3** | **5 de los 12 «especialistas votantes» no votan**: no tienen rama en `DUEÑO_DE` | Media (contrato del catálogo) | `consejo.ts:75-83, 85-98` | O bien darles acciones propias, o reclasificarlos como «fichas de dominio» en el estado público (hoy `estadoConsejo` los lista como votantes) |
| **H4** | Metadatos sucios: `reg()` acepta `dominio` pero `proyecto.rutas-sanas` y `memorista.registrar` declaran `datos`; los comentarios de bloque cuentan 8/8/4/4 cuando hay 7/7/3/3; el 4.º argumento `activa` de `reg()` es **ignorado** por la línea `:339` | Baja (riesgo de auditoría futura) | `consejo.ts:134,176,252,301,313,321,334-339` | Hacer que `ACTIVAS_POR_DEFECTO` sea **la** fuente y retirar el parámetro `activa` (o usarlo como «valor sugerido») para que no engañe |
| **H5** | Rutas y capas duplicadas: espejos personalizados en `~/.cerebronico` (mensaje) vs `PROJECT_ROOT/.cerebronico` (código); **dos** sistemas de fondo (`FondoLayer` vs `AppBackground`/ProSettings); badge `📎 embeddings` **renderizado dos veces** | Baja-media | `consejo.ts:388` vs `server.ts:3734`; `AppBackground.tsx` vs `FondoLayer.tsx`; `ModelSelectorModal.tsx:809-824` | Unificar rutas por una constante `PATHS`, unificar fondo en una sola capa, borrar el bloque JSX duplicado |
| **H6** | **Hueco de extensibilidad ya identificado por el propio repo**: el host no expone `entidad.run`, así que un panel no puede invocar un espejo (microcopy reimplementa Flesch) | Media (deuda de diseño) | `PLUGINS_MANUAL.md:19-22` | Implementar permiso `entities.use` + método en `ExtensionPanelView` que llame `ejecutarEntidad(id, datos)`; elimina duplicación de lógica de espejos |
| **H7** | **Cancelación/planificación robusta pero con estado global mutable en tests**: las suites `agentico`/`espejos` cambian activación de entidades y la restauran; `MEMORIA` y `TABLA_SALUD` son módulo-level | Media (si V8 paraleliza suites) | `tests/agentico.test.ts:78`; `consejo.ts:118`; `salud.ts` + `orquestador.ts:551` | Aislar estado por inyección (factoría de consejo) antes de paralelizar tests |
| **H8** | El **motor de reflejo** es el único componente sin auditoría de detalle aquí (no lo pedía el objetivo) pero **todo** depende de él: 82.459 entradas en `tablas-max-v3.json` | Media | `reflejo/index.ts:15-16`, `cerebroReflejo.ts` (no auditado línea a línea) | Auditoría específica de `cerebroReflejo.ts` + `gen-tablas-v3.mjs` antes de fusionar |
| **H9** | Los **espejos con `accion`** (PODERES) conviven con la orden clásica sin discriminador explícito de versión: un llamador que envíe `accion` por error cambia semántica | Baja | `poderes-espejos.ts:1-4` | Declarar `espejoVersion` en la respuesta o separar en `espejo.<x>.poder` |
| **H10** | Los **contratos numéricos son incompletos**: `validar` vigila 50/12/38/20/18 pero no el **número de leyes curadas (16)**, ni los 22 poderes, ni las 27 suites | Baja | `tests/agentico.test.ts:34-43`; `orquestador.ts:88-330` | Añadir aserciones «conserva + delta» para leyes/poderes/suites (mismo patrón que ya funciona) |

### 15.1 Qué de esta línea conviene preservar en V8 (juicio de auditor)

1. **La regla de oro documental y su vigilancia por tests**: «CONSERVA + delta» + `validar` como puerta única (tipos + suites + suites que no arrancan). Es lo que ha hecho que 6 saltos en 2 días no rompan nada.
2. **`resolverPresupuesto` con invariante `io≥1 ∧ cpu≥1`**: es la garantía de terminación de todo plan. No debe relajarse.
3. **El contrato único `{ok, salida|motivo, entidad, ms}`** y la «regla de hierro» del motivo: es lo que hace que el sistema sea auditable y que un fallo nunca sea silencioso.
4. **La inversión de dependencia de `pool.ts`** como patrón general: separar estado puro de cargadores con fs. Aplicable a V8 para cualquier módulo que viaje al navegador.
5. **El despacho CPU-primero + `pesoPorDefecto`**: pequeña línea de código, gran efecto (espejos de 1 ms no bloquean al modelo).

### 15.2 Riesgos si V8 fusiona sin leer esto

- Fusionar contra `AGENTES_MANUAL.md` (línea base v2.5, 40 entidades, 1021/1479 comprobaciones) haría perder los **10 espejos, el orquestador, la salud, el pool y 6 suites**: el manual describe **dos releases por detrás** del código.
- Tomar `constants.ts:190` como fuente de versión produciría builds etiquetados `V1.0.3` desde código 1.1.1.
- Confiar en `ESPEJOS_PERSONALIZADOS.md` («no implementado») llevaría a **reimplementar** lo ya hecho.

---

## 16. Matriz resumen HECHO / PROMETIDO

| Área | Afirmación del enunciado / manual | Veredicto | Prueba principal |
|---|---|---|---|
| Catálogo | 50 entidades (12 + 38) con `reg()` | **HECHO** | `consejo.ts:129,343`; `tests/agentico.test.ts:34-38` |
| Catálogo | 10 despiertas de v2.5 + 18 con botón | **HECHO** (20 activas totales con los espejos) | `consejo.ts:334-339`; `tests/espejos.test.ts:42` |
| Espejos | 10 espejos con contrato JSON | **HECHO** | `espejos.ts:442-759` |
| Espejos | Cuántico 8 qubits | **HECHO** | `espejos.ts:703` |
| Espejos | Idioma <15 palabras → desconocido | **INEXACTO** (el umbral real es `score===0`) | `espejos.ts:490-494` |
| Espejos | GRUPOS_ESPEJOS + `notaSeleccionEspejos()` | **HECHO** | `espejos.ts:64-101, 231-248` |
| Espejos | «CERO imports de runtime» | **HECHO** (solo tipos + módulo interno puro) | `espejos.ts:38,423`; `poderes-espejos.ts:8` |
| Reflejo | Tablas lite 300–700 KB / max 2–5 MB, generador que falla fuera de rango | **HECHO para v2.4** (`gen-reflejo.mjs:182-195`); en v1.1.1 se usan v3 (350 KB / 1,94 MB) con los v2.x como backup | `gen-reflejo.mjs`; `index.ts:15-16`; `ls -l tablas-*` |
| Reflejo | `/api/reflejo` con `modo` lite/max | **HECHO** | `server.ts:3332-3342` |
| Conductor | consejo ≥0.8 → director local + 1 reparación → fallback declarado | **HECHO** | `server.ts:3991-4037` |
| Conductor | `extraerOrdenes`/`validarPlan` como único paso al motor | **HECHO** para `extraerOrdenes`; `validarPlan` aplica en `/api/brain/plan` | `chatOrders.ts:348`; `server.ts:4018, 3109` |
| Planificador | Lotas paralelos por Kahn + rechazo de ciclos | **HECHO** | `taskPlanner.ts:300-413`; `espejos.ts:600-610` |
| Planificador | Invariante `io≥1·cpu≥1·io≤16` | **HECHO** | `memoriaResiliente.ts:239-282`; `tests/espejos.test.ts:87-88` |
| Planificador | Tramos MR + elección de modelo por tramo + postinstall que baja solo el que toca | **HECHO** | `memoriaResiliente.ts:70-144`; `instalar-modelos.mjs:26-64`; `postinstall.mjs:168-174` |
| Planificador | Segundo plano + semáforo | **HECHO** | `planRunner.ts:1-50, 219-307` |
| Planificador | Cancelar/Reanudar | **HECHO** | `taskPlanner.ts:437-445`; `planRunner.ts:258-273`; `server.ts:3139-3150` |
| Planificador | Intérprete `titulo \| tipo \| dato \| extra \| dependeDe` | **HECHO** | `PlansPanel.tsx:135, 453` |
| Planificador | Escalado ×N (1/2/4/6/8) en caliente | **HECHO** | `memoriaResiliente.ts:162`; `server.ts:3024`; `PlansPanel.tsx:375-378` |
| Extensiones | manifest con commands/tools/panels, iframe aislado, botón «Ext» | **HECHO** (contrato y UI; aislamiento no ejecutado aquí) | `extensions.ts:33-96, 112-240`; `ide/backend/extensions/` (11) |
| Forja | `forjar_complemento` con receta, slot de lógica, eco honesto | **HECHO** | `pluginForja.ts:54-221`; `server.ts:1696, 4793`; `toolRegistry.ts:563` |
| Coreo | 11 acciones con icono y movimiento, Espina al pie, tregua | **HECHO** | `coreo.ts:27-142`; `EspinaActividad.tsx:79`; `sandboxTregua.ts:20-40` |
| Plugins | 10 complementos `cn.*` | **HECHO** (archivos); E2E/validador propios declarados, no ejecutados aquí | `mejoras/cerebronico-plugins-v1/plugins/*`; `validar.mjs:45` |
| Aspecto | «A» fuente/tamaño/color **por sección** | **HECHO** | `aspecto.ts:26-221`; `PanelAspecto.tsx` |
| v10 | build/icono + renombrado + fondo por defecto | **HECHO** | `aplicar-v10.mjs:1-36`; `package.json build.win.icon`; assets presentes |
| Persistencia | `.cerebro-db/` con entidades/espejos/kb | **HECHO** (+ salud, leyes, planes, fondo) | `server.ts:3347-3377, 3382-3390, 3711`; `postinstall.mjs:52-64` |
| Frontend | ⚡ Consejo, A Aspecto, Ⓐ Forjar, 📎 embeddings, selector con grupos | **HECHO** (con el defecto del badge duplicado) | `ConsejoPanel.tsx`, `PanelAspecto.tsx`, `PluginForge.tsx`, `ModelSelectorModal.tsx:769,809-824` |
| Tests | 21 suites / 1479 comprobaciones (ANEXO) | **ESTADO ANTIGUO**: v1.0.x = 21 suites/1481; v1.1.1 = **27 suites**, 1627 declaradas | `validar.mjs:24-52`; `CHANGELOG_v1.1.1.md:29` |
| Tests | Suite `espejos` = 72 comprobaciones | **HECHO** (62 llamadas + bucle de 10) | `tests/espejos.test.ts` |
| Tests | Contratos numéricos «conserva + delta» | **HECHO** | `tests/agentico.test.ts:30-43` |

---

## 17. Inventario de archivos clave auditados (para la fusión)

| Ruta (v1.1.1, relativa a `ide/backend/`) | Líneas / tamaño | Rol |
|---|---|---|
| `src/engine/reflejo/consejo.ts` | 421 | Catálogo 12 + 28, contrato, activación, persistencia de botones |
| `src/engine/reflejo/espejos.ts` | 764 / 42 KB | 10 espejos + grupos + selector + utilidades puras |
| `src/engine/reflejo/poderes-espejos.ts` | 285 / 20 KB | 22 poderes + `CATALOGO_TURBO` |
| `src/engine/reflejo/orquestador.ts` | 821 / 38 KB | 16 leyes curadas + aprendidas + confianza |
| `src/engine/reflejo/pool.ts` / `cargadorEspejos.ts` | 117 / 205 | Estado puro del pool (BUILD v1) / carga con fs |
| `src/engine/reflejo/salud.ts` | 129 | Salud de flota |
| `src/engine/reflejo/index.ts` | 50 | Carga tablas v3 y expone el pensador |
| `src/engine/reflejo/tablas-*-v3.json` | 350 KB / 1,94 MB | Diccionarios del motor |
| `src/engine/taskPlanner.ts` | 801 | Grafo, ciclos, lotes, despacho, cancelación |
| `src/engine/memoriaResiliente.ts` | 282 | Escalera MR e invariante |
| `src/engine/hardwareGovernor.ts` | 228 | Medición y veredictos (no activa nada) |
| `src/engine/planRunner.ts` | 311 | Segundo plano + semáforo global |
| `src/engine/taskStore.ts` / `taskStoreFs.ts` | 370 / 239 | Validación/estados y persistencia de planes |
| `src/engine/extensions.ts` | 240 | Manifiestos, permisos, registro |
| `src/engine/pluginForja.ts` | 221 | Compilador de complementos |
| `src/engine/coreo.ts` | 142 | Vocabulario visual + animaciones |
| `src/engine/aspecto.ts` | 221 | Hoja CSS por sección |
| `src/engine/fondo.ts` | ~110 | Aduana de fondos |
| `src/engine/sandboxTregua.ts` | ~45 | Cesión de lazo y pausa del sync |
| `src/engine/ollamaPugil.ts` | ~60 | Embedders vs chat |
| `scripts/validar.mjs` | 228 | Puerta única (27 suites + tipos) |
| `scripts/gen-reflejo.mjs` / `gen-tablas-v3.mjs` | 195 / — | Generadores de tablas con puerta de tamaño |
| `scripts/postinstall.mjs` / `instalar-modelos.mjs` | 178 / 115 | Instalación de cortesía que nunca aborta |
| `server.ts` | **8.238** | Todos los endpoints; raíz de composición |
| Componentes | `EspinaActividad` 94, `ConsejoPanel` 106, `EspejosSelector` 123, `PanelAspecto` 160, `PluginForge` 138, `FondoLayer` 139, `AppBackground` 61, `ExtensionManager` 219, `PlansPanel` ~600, `ModelSelectorModal` 899, `ChatCenter` 1.079, `App.tsx` 3.817 | UI agéntica |

---

## 18. Cierre metodológico

- **Fuentes:** lectura directa de 30+ archivos de código y 9 documentos; 4 `diff -rq` completos entre carpetas de versión; conteo estático de llamadas de test (`grep -c`) para verificar el «72» de la suite de espejos.
- **No ejecutado (declarado):** `npm run validar`, `tsc`, E2E headless de plugins, suites individuales, build de vite/esbuild, ningún endpoint HTTP. Motivo: ausencia de `node_modules` en las cinco copias auditadas. Todas las cifras de puertas (1479/1481/1627, 21/27 suites) son **declaradas por CHANGELOG**, no medidas aquí.
- **Criterio HECHO/PROMETIDO:** HECHO = existe la construcción en el archivo citado con la línea exacta. PROMETIDO/INEXACTO = la afirmación no se corresponde literalmente con el código (se indica siempre la divergencia y la línea donde se ve).
- **Alcance no cubierto (explícito):** `cerebroReflejo.ts` (motor de scoring línea a línea), `sandbox`/preview, imagen/RAG/nube (auditorías paralelas de la línea), Electron y empaquetado. Se marcan como H8 en §15.


---

<a id="04-lineaje-early-md"></a>
## (4/4) 04_lineaje_early.md

> **Fuente:** `audits/04_lineaje_early.md`  —  **version:** 4  —  **bytes:** 54702
# Auditoría 04 — Linaje temprano y "extras" del IDE CerebroNico (insumo para la fusión V8)

- **Auditor:** agente auditor de código (Accio).
- **Fecha de auditoría:** 2026-09-21.
- **Carpeta base auditada:** `<sesion-anterior>/project/cerebronico_evolution`
- **Carpeta de archivos sueltos:** `<carpeta-de-uploads>`
- **Método:** listado recursivo, lectura directa de fuentes, `diff -rq`/`diff -u`, `grep` de símbolos y `md5sum` de binarios.
- **Convención de este informe:**
  - **[HECHO]** = verificado leyendo el archivo/ejecutando el comando (se cita archivo + línea).
  - **[INFERENCIA]** = deducción razonada a partir de evidencias indirectas (fechas, nombres, contenidos), no confirmada por el autor.

> Nota de alcance: este informe cubre SOLO los 4 "extras" pedidos (`extra_codigo0/`, `extra_fix_ollama/`, `agent-v2/`, `extra_pruebas_v232/`), los 4 archivos sueltos de `uploads/` y la línea de tiempo de nombres. Las versiones v1.0→v3.3.2 se tocan únicamente como referencia de fechas/nombres.

---

## 0. Resumen ejecutivo (lo esencial en 8 líneas)

1. **`extra_codigo0/` = "Codigo-0-v3"**: app **Next.js 16 + Tailwind 4 + shadcn + Prisma + dnd-kit + mdxeditor**, package `nextjs_tailwind_shadcn_ts@0.2.1`, fechas **2026-05-12 → 2026-08-26** [HECHO]. Es la rama de UI más "moderna" en stack web, pero **incompleta** (sin `prisma/schema.prisma`, sin lockfile, `next.config` con `ignoreBuildErrors:true`).
2. **Corrección importante:** los módulos que el dueño pedía buscar (`attachmentProcessor`, `syntaxEngine`, `languageMemory`, `contextCache`, `codeParser`) **NO están en `extra_codigo0/`**; están en **`agent-v2/ide/src/utils/`** [HECHO]. En Codigo-0-v3 lo equivalente es `src/lib/autoaprendizaje.ts` + `src/lib/automata-team.ts` (ambos declarados como adaptados de **Codeapp v2.3.2**).
3. **`extra_fix_ollama/`** y **`agent-v2/`** son **builds distintos del MISMO proyecto** (package `codigo-0-cerebronico@1.0.0`), ambos fechados **2026-09-10**; `fix_ollama` (05:39–07:36) es la variante temprana, `agent-v2/ide` (16:48–16:57) la posterior y más completa [HECHO].
4. **`agent-v2` = "CerebroNico IDE — Modo Agente PC (build 2.0)"**: añade el **Modo Agente PC** (`pc_*`) que conecta el chat con el puente Python `:5000` para actuar sobre la máquina real [HECHO, `ide/CHANGELOG.md:1`].
5. **`extra_pruebas_v232/` = pruebas de "Codeapp/CodeeApp v2.3.2"**, un **app ANTERIOR y DISTINTO** (Electron + Vite + React, autor Nicolas Quintero, 2026-08-22), **ancestro conceptual** de todo lo demás [HECHO + INFERENCIA].
6. Los **4 archivos sueltos de `uploads/`** son la **versión SIN endurecer** del puente `:5000` (`agent_bridge_5000.py` 201 líneas con `HOST="0.0.0.0"`) y su gemelo JS; el `MEMORANDUM-SEGURIDAD.md` de v2.3.2 documenta ese binding `0.0.0.0`+CORS `*`+sin token como **RCE crítico** [HECHO].
7. **Línea de nombres:** `Codeapp/CodeeApp` (v1.1→v2.3.2, ago-2026) → **`Codigo-0`** (may–ago 2026) → **`CerebroNico IDE`** (sep 2026) → **`Cerebronico`** (v1.x). El **nombre de paquete se mantiene `codigo-0-cerebronico`** desde entonces, aunque el nombre comercial cambió [HECHO].
8. **Confusión de numeración:** conviven **dos líneas de versión** (Codeapp v2.3.2 vs Cerebronico v1.0→v3.3.2) y el **semver real no coincide con el nombre de carpeta** (ej. `v3.3.2/…/package.json` dice `version: 1.3.2`) [HECHO]. Ver §6.

---

## 1. Codigo-0-v3 — carpeta `extra_codigo0/` (linaje MÁS ANTIGUO)

### 1.1 ¿Qué es? [HECHO]

`extra_codigo0/package.json:2-3`

```json
"name": "nextjs_tailwind_shadcn_ts",
"version": "0.2.1",
```

- Es una **app Next.js (App Router) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma + dnd-kit + `@mdxeditor/editor`**. Dependencias relevantes en `extra_codigo0/package.json:15-81`: `@dnd-kit/core|sortable|utilities`, `@mdxeditor/editor ^3.39.1`, `@prisma/client ^6.11.1` + `prisma ^6.11.1`, `next ^16.1.1`, `react ^19.0.0`, `zustand ^5.0.6`, `react-syntax-highlighter`, `recharts`, `cmdk`, `z-ai-web-dev-sdk`, `next-auth`, `next-intl`, `react-markdown`.
- Es un **IDE de chat "Codigo-0"**: el system prompt por defecto dice literalmente *"Eres Codigo-0, un asistente experto en desarrollo de software…"* (`extra_codigo0/src/lib/ide-store.ts:424`) y el contexto persistente se titula *"# CEREBRO MD - Codigo-0"* (`ide-store.ts:439`).
- **[INFERENCIA]** El `package.json` conserva el nombre-genérico de plantilla (`nextjs_tailwind_shadcn_ts`) y `components.json:2` usa el estilo oficial de shadcn (`"new-york"`), lo que indica que **nació de un scaffolding shadcn/Next y fue personalizado**, no al revés.
- **[INFERENCIA]** El `Caddyfile:1-26` (reverse proxy `:81` → `:3000`, con `XTransformPort`) y `next.config.ts:5` (`allowedDevOrigins: [...space-z.ai]`) apuntan a un **entorno de desarrollo alojado (AI Studio / sandbox cloud)**, no a la PC local. Es coherente con que sea la copia "de laboratorio" del linaje.

### 1.2 Estructura de `src/` [HECHO]

```
extra_codigo0/
├─ Caddyfile, components.json, eslint.config.mjs, next.config.ts
├─ package.json, postcss.config.mjs, tailwind.config.ts, tsconfig.json
├─ public/
└─ src/                          (71 archivos en total)
   ├─ app/
   │  ├─ layout.tsx (34)  page.tsx (31)  globals.css
   │  └─ api/
   │     ├─ chat/route.ts (226)      ← streaming SSE ollama/gemini/openrouter
   │     ├─ sandbox/route.ts (150)   ← VFS / ejecución sandbox
   │     ├─ deliverables/route.ts (120)
   │     ├─ providers/route.ts (113) ← lista modelos por provider
   │     ├─ ram/route.ts (59)        ← límite de RAM
   │     └─ route.ts                 ← raíz/health
   ├─ components/
   │  ├─ ide/   TopBar(46) ChatArea(124) ChatInput(249) LeftPanel(386)
   │  │         RightPanel(328) LoadingScreen(291) ThinkingStream(71)
   │  └─ ui/    51 componentes shadcn (accordion, dialog, sidebar, sonner, …)
   ├─ hooks/    use-toast.ts (193)   use-mobile.ts (19)
   └─ lib/      utils.ts(6)  automata-team.ts(221)  ide-store.ts(593)
                db.ts(12)   autoaprendizaje.ts(376)
```

Líneas totales medidas de `src/` (lib+hooks+components/ide+app/api): **3.648 líneas** (sin contar los 51 `ui/*` de shadcn, que son boilerplate) [HECHO, `wc -l`].

### 1.3 Aclaración clave: los módulos `attachmentProcessor`/`syntaxEngine`/… NO están aquí [HECHO]

Búsqueda explícita por nombre en toda la carpeta de evolución:

- `find … -iname "attachment*" -o -iname "syntax*" -o -iname "languageMemory*" -o -iname "contextCache*" -o -iname "codeParser*" -o -iname "fileParser*"` → los únicos hits son en **`agent-v2/ide/src/utils/`** (y un `syntaxGuard.ts` en `v1.0/`).
- `grep -rniE "attachmentProcessor|syntaxEngine|languageMemory|contextCache|codeParser"` → **0 coincidencias** dentro de `extra_codigo0/`.

**Conclusión [HECHO]:** en `extra_codigo0/` NO existen esos módulos. El procesamiento de adjuntos de Codigo-0-v3 se resuelve de forma **inline** y mucho más rudimentaria (ver §1.4.6). Los módulos "de motor" con esos nombres son aportación de **agent-v2 / v3.3.2**, NO de Codigo-0-v3. Si V8 esperaba "rescatar attachmentProcessor de codigo0", **esa premisa es falsa y debe corregirse**.

### 1.4 Módulos realmente reutilizables de `extra_codigo0/` (API + tamaño + estado)

#### 1.4.1 `src/lib/ide-store.ts` — 593 líneas — **reutilizable (ALTO)**
Store global **Zustand** (`export const useIdeStore = create<IdeStoreState>(…)`, línea 238). Cubre:
- **Sesiones de chat**: `newChat/deleteChat/renameChat/switchChat/exportChat/initDefaultChat` (líneas 243-328). Export a texto plano con marca de tiempo en locale `es-UY` (línea 313).
- **Mensajes + streaming**: `sendMessage`, `updateLastAssistantMessage`, `isGenerating` (líneas 336-376).
- **Modalidades**: `auto|rapido|ingeniero|profundo` con prompts inyectados (`MODALITY_PROMPTS`, líneas 121-126).
- **Providers** `ollama|gemini|openrouter` con config/modelos (líneas 398-409).
- **Ajustes**: `maxRamMB`, `temperature`, `maxTokens`, `systemPrompt`, `autoScroll` (417-435).
- **Cerebro MD + subagentes**: contenido, `memoriaMd`, CRUD de subagentes (437-481).
- **Autoaprendizaje**: puente con `autoaprendizaje.ts` (483-542).
- **Adjuntos**: `attachedFiles`, `maxFiles = 50`, `addFile` (544-555).
- **`getFullSystemPrompt(userQuery)`** (línea 562): ensambla system prompt + Cerebro MD + últimas 30 líneas de Memoria MD + subagentes + autoaprendizaje + modalidad. **Es el ensamblador de contexto más completo de los extras.**
- **Estado:** **completo y compilable en apariencia** (`'use client'`, imports resueltos a `./autoaprendizaje` y `zustand`/`uuid`). No hay imports rotos.
- **Valor V8 [INFERENCIA]:** su patrón de "contexto ensamblado desde Cerebro+Memoria+subagentes+modalidad" es **directamente portable** como capa de prompt en V8.

#### 1.4.2 `src/lib/autoaprendizaje.ts` — 376 líneas — **reutilizable (ALTO)**
Motor de **memoria auto-evolutiva** puro TS (sin dependencias). Encabezado `// AUTOAPRENDIZAJE — Sistema de memoria auto-evolutiva para Codigo-0` y línea 3: *"Inspirado en Codeapp v2.3.2 MemoryManager, adaptado a Next.js + Zustand."* [HECHO].
- Tipos de aprendizaje: `rule | fact | lesson | pattern | preference` (línea 12).
- API pública: `extractExplicitLearnings`, `detectPreferences`, `detectCorrections`, `detectCodePatterns`, `isDuplicate`, `recall(query,entries,limit)`, `buildLearningContext`, `persistLearnings`, `loadLearnings`, `clearAllLearnings`, `getLearningStats`, `KIND_LABELS`, `SOURCE_LABELS` (líneas 109-376).
- Persistencia: `localStorage` clave `codigo0_autoaprendizaje`, tope `MAX_ENTRIES=200` / `MAX_CONTEXT_BYTES=4000` (líneas 50-52).
- Scoring: keyword-match + recencia + frecuencia + peso por tipo (líneas 72-99).
- **Estado:** completo, autocontenido, sin imports externos → **portable casi 1:1**.
- **Valor V8 [INFERENCIA]:** candidato directo como capa de "memoria/aprendizaje" del IDE, ya que agent-v2 tiene un `memory.ts` (193 líneas) más básico; este es más rico en heurísticas.

#### 1.4.3 `src/lib/automata-team.ts` — 221 líneas — **reutilizable (ALTO)**
**Equipo de 11 autómatas/sub-agentes** con `id, name, role, category, description, functions[], prompt, accent` (líneas 22-197): Analista, Arquitecto, Frontend, Backend, Fullstack, Tester QA, Seguridad, Optimizador, DevOps, Documentador, Datos. Encabezado línea 5: *"Adaptado de Codeapp v2.3.2 automataTeam.ts"* [HECHO].
- API: `groupByCategory()` (línea 200), `buildTeamContext()` (línea 211) produce un bloque compacto para inyectar al system prompt.
- **Estado:** completo, sin dependencias → **portable 1:1**.
- **Valor V8 [INFERENCIA]:** los `prompt` de cada autómata (p.ej. Fullstack exige "un bloque `file=\"ruta\"` por archivo") son **compatibles con el parser de bloques `codeParser.ts`** de agent-v2 → buena sinergia de fusión.

#### 1.4.4 `src/lib/db.ts` — 12 líneas — **NO reutilizable / sospechoso de roto (NULO)**
`import { PrismaClient } from '@prisma/client'` + singleton (líneas 1-13). **[HECHO] No existe `prisma/schema.prisma`** en la carpeta (búsqueda `-iname "*.prisma"` → 0 resultados). `package.json:10-13` define scripts `db:push/db:generate/db:migrate` pero sin esquema.
- **Estado [INFERENCIA]:** `db.ts` es **código muerto / no ejecutable** tal cual (fallaría al generar el cliente). No hay ningún otro archivo confirmado que lo importe.

#### 1.4.5 `src/lib/utils.ts` (6) + hooks `use-toast.ts` (193) / `use-mobile.ts` (19) — **boilerplate (BAJO/NULO)**
`utils.ts` es el clásico `cn()` de shadcn; los hooks son los estándar de shadcn. Sin valor diferencial.

#### 1.4.6 `src/components/ide/ChatInput.tsx` — 249 líneas — **procesador de adjuntos rudimentario (MEDIO)**
- Selector de archivos con `FileReader.readAsDataURL` y concatenación inline: `data: (reader.result as string).split(',')[1] || ''` (`ChatInput.tsx:56-60`) [HECHO].
- **No hay extracción de texto** (ni PDF/DOCX/RTF): los adjuntos se guardan como **base64 crudo**. `MessageFile{ name,size,type,data }` (`ide-store.ts:22-27`).
- Iconos por tipo, `formatSize`, auto-resize del textarea, selector de modalidad (`MODALITIES`, líneas 17-22).
- **Estado:** compila; funcional pero **sin parseo de contenido**.
- **Valor V8 (MEDIO) [INFERENCIA]:** la UI de adjuntos (chips, límite 50, dedupe por nombre en `addFile`) es reusable; el **pipeline de extracción debe tomarse de `agent-v2/ide/src/utils/attachmentProcessor.ts`, no de aquí**.

#### 1.4.7 `src/app/api/chat/route.ts` — 226 líneas — **MEDIO**
Route handler Next.js que **streamea SSE** hacia `ollama|gemini|openrouter`; `DEFAULT_OLLAMA_URL='http://localhost:11434'` (línea 34), valida `messages` no vacío (líneas 55-60), acepta `files?: ChatFile[]`, `maxRamMB` [HECHO]. **Estado:** aparentemente completo.
- **Valor V8 [INFERENCIA]:** lógica de provider multiplexada reutilizable, pero V8 (Vite/Express, según v1.x–v3.3.2) usa `server.ts`, no Next route handlers → **portar la lógica, no el archivo**.

#### 1.4.8 Resto de `app/api/*` y `app/*` — **BAJO**
`sandbox/route.ts` (150), `deliverables/route.ts` (120), `providers/route.ts` (113), `ram/route.ts` (59), `route.ts`; `page.tsx` (31) monta `LeftPanel/TopBar/ChatArea/ChatInput/RightPanel` + `LoadingScreen`; `layout.tsx` (34). Son pegamento de UI/API específico de Next.

#### 1.4.9 Config — **riesgo (NULO para reuso, ALTO como señal)**
- `next.config.ts:5-8`: `typescript.ignoreBuildErrors: true` y `reactStrictMode:false` → **enmascara errores de tipo**.
- No hay `package-lock.json`/`bun.lock` (a diferencia de agent-v2/fix_ollama) → **build no reproducible**.
- `Caddyfile`: proxy cloud.

### 1.5 Veredicto Codigo-0-v3 [INFERENCIA]
- **Qué es:** un "re-skin" de IDE-chat en stack Next 16 + shadcn, con dos aportes propios **valiosos** (`ide-store.ts`, `autoaprendizaje.ts`, `automata-team.ts`) y mucha **UI de plantilla** + **API de Next** no portable al stack Vite/Express de las versiones posteriores.
- **Estado global:** **parcialmente funcional**; `db.ts` roto por falta de esquema Prisma; sin lockfile; `ignoreBuildErrors` activo.
- **A rescatar en V8:** los 3 archivos `lib/` (contexto/memoria/autómatas) y, con reservas, la UI de `components/ide/`. **No** rescatar `db.ts`, `app/api/*` de Next ni los 51 `ui/*`.

---

## 2. fix-ollama — carpeta `extra_fix_ollama/` (2026-09-10)

### 2.1 Contenido [HECHO]
```
extra_fix_ollama/
├─ README.md (542 bytes)        ← README de plantilla (ver 2.2)
├─ agent_bridge_5000.py (201)   ← puente :5000 (HOST=127.0.0.1)
├─ server.ts (1385)
├─ index.html, metadata.json, tsconfig.json, vite.config.ts
├─ package.json / package-lock.json / bun.lock
└─ src/   (App.tsx, components/*, types.ts, utils/engine.ts, …)
```
- `package.json:2-4` → `name: "codigo-0-cerebronico"`, `private:true`, `version: "1.0.0"`, `type:"module"`.
- `.env.example:1-10` → *"Codigo-0 CerebroNico IDE"*; puertos **3000** (UI), **5000** (workers/FFmpeg/video stream), **11434** (Ollama); `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `CUSTOM_SERVER_URL`.
- Fechas de archivos: **2026-09-10, 05:39 → 07:36** (`ls -l`: README/bridge 05:39–05:44, `server.ts`/`package-lock` 07:36) [HECHO].

### 2.2 README.md — es el README genérico de AI Studio, NO documenta el fix [HECHO]
`extra_fix_ollama/README.md:1-21` completo:
```
# Run and deploy your AI Studio app
This contains everything you need to run your app locally.
View your app in AI Studio: https://ai.studio/apps/eea69c96-5d84-4325-9259-d833411b6a7b
## Run Locally
Prerequisites: Node.js
1. Install dependencies: npm install
2. Set the GEMINI_API_KEY in .env.local to your Gemini API key
3. Run the app: npm run dev
```
**Hallazgo:** el README de `fix-ollama` **no explica la corrección**. El "fix" no está documentado aquí; **[INFERENCIA]** el nombre `Codigo-CerebroNico-IDE-fix-ollama.zip` (origen del extract) indica que la corrección era sobre la **conexión con Ollama**, y debe localizarse por *diff* con `agent-v2/ide/` (siguiente apartado). Como el README es de AI Studio, también **[INFERENCIA]** el paquete pasó por el entorno `space-z.ai`/AI Studio (mismo banner que usarán los README de `agent-v2`).

### 2.3 Qué corrige respecto a `agent-v2/ide` — `diff -rq` [HECHO]

```
$ diff -rq extra_fix_ollama agent-v2/ide
Only in agent-v2/ide: .gitignore
Only in agent-v2/ide: CHANGELOG.md
Files …/README.md differ
Files …/agent_bridge_5000.py differ
Only in agent-v2/ide: iniciar_todo_windows.bat
Only in agent-v2/ide: limpiar_ollama_windows.bat
Files …/package-lock.json differ
Files …/package.json differ
Files …/server.ts differ
Files …/src/App.tsx differ
Files …/src/components/ChatCenter.tsx differ
Files …/src/components/LeftSidebar.tsx differ
Files …/src/components/ModelSelectorModal.tsx differ
Files …/src/types.ts differ
Files …/src/utils/engine.ts differ
Only in agent-v2/ide: tests
```
Lectura:
- `extra_fix_ollama/` es la **variante ANTERIOR**: NO tiene `tests/`, NI `CHANGELOG.md`, NI los `.bat` de arranque/limpieza de Ollama, NI `.gitignore`.
- `agent-v2/ide/` sí los tiene → `agent-v2` es **posterior y más completo** (ver §3).
- **`fix-ollama` NO es "más nuevo que agent-v2"; es el eslabón previo** del mismo build (05:39–07:36 vs 16:48–16:57 del 2026-09-10) [HECHO por timestamps].

### 2.4 Diferencia concreta en el puente `:5000` [HECHO]

`diff -u extra_fix_ollama/agent_bridge_5000.py agent-v2/ide/agent_bridge_5000.py`:
- `extra_fix_ollama/agent_bridge_5000.py` (201 líneas): `HOST = os.environ.get("HOST", "127.0.0.1")`.
- `agent-v2/ide/agent_bridge_5000.py` (473 líneas): **+272 líneas** con:
  - Banner con instrucciones Linux/Mac y aviso *"El servidor se auto-arranca desde server.ts (CerebroNico)… Si Python no está disponible, el server sigue funcionando sin el puente."*
  - **Fix crítico de arranque** (documentado en comentario): forzar **UTF-8 en stdout/stderr** porque Windows usa CP1252 y los emojis `🐍 ⚡ 📡` provocaban `UnicodeEncodeError` → *"el puente crasheaba al arranque y nunca quedaba escuchando"*.
  - `ThreadingMixIn` (servidor multi-hilo).
  - Utilidades PC: `resolve_pc_path()` (atajos `Desktop/`,`Documents/`,`Downloads/`,`~`), `_probe()`, `get_pc_info()`, `get_subagents()`.
  - **Endpoints nuevos** (grep `url_path` sobre agent-v2): `GET /api/pc|/api/pc/info`, `GET /api/subagents`, `POST /api/fs/write`, `/api/fs/read`, `/api/fs/list`, `/api/fs/delete`.
- **[INFERENCIA]** El "fix-ollama" del nombre probablemente = endurecer el binding a `127.0.0.1` + arreglar arranque; el salto completo (PC tools + UTF-8 + threading) llegó en `agent-v2/ide`.

### 2.5 Comparación del puente con el documentado en v3.3.2 [HECHO]
- `v3.3.2/ide/backend/agent_bridge_5000.py` = **474 líneas**, con los MISMOS endpoints (`/api/pc/info`, `/api/subagents`, `/api/fs/*`, `/api/exec`, `/api/python`) y `HOST=127.0.0.1` (línea 32).
- Es decir, **el puente que documenta v3.3.2 ES el puente de `agent-v2` (versión endurecida + PC)**, no el de `fix_ollama`. **[HECHO, comparación de endpoints/líneas]**
- `v3.3.2/ide/MEMORANDUM.md:32` confirma: `| 5000 | Puente PC (agent_bridge_5000.py o CerebroNicoAgent.exe) | Sonda automática python → python3 → EXE |`.

### 2.6 `server.ts` [HECHO]
- `extra_fix_ollama/server.ts` = **1.385 líneas**; `agent-v2/ide/server.ts` = **1.908 líneas**. `diff` entre ambos arroja **1.003 líneas de diferencia** (`<`/`>`), i.e. **el 72% del archivo cambió**; confirma que `agent-v2` reescribió/extendió el backend (probablemente el "Modo Agente PC" + `StreamContext`).

---

## 3. agent-v2 — carpeta `agent-v2/` (2026-09-10)

### 3.1 ¿Qué es "CerebroNico-IDE-agent-v2"? [HECHO]
- Estructura raíz: `agent-v2/CHANGELOG.md` + `agent-v2/ide/`.
- `agent-v2/ide/package.json:2-4` → `name: "codigo-0-cerebronico"`, `version: "1.0.0"`.
- `agent-v2/ide/README.md:5-16`: *"# CerebroNico IDE — IDE de alto rendimiento para ingeniería de software autónomo con inferencia local (Ollama) y aceleración en la nube (Gemini, OpenRouter, servidores OpenAI compatibles)."* Puertos: **3000** UI+API Express (`server.ts`), **5000** puente Python (`agent_bridge_5000.py`, se auto-inicia), **11434** Ollama.
- `agent-v2/ide/CHANGELOG.md:1` = `agent-v2/CHANGELOG.md:1` = **"# CerebroNico IDE — Modo Agente PC (build 2.0)"** (archivos idénticos, 88 líneas) [HECHO].
- **[HECHO] Sí, es el "Modo Agente"**: el CHANGELOG describe exactamente el salto *"Antes, el chat del IDE solo hablaba… no podía hacer nada real en tu PC"* → *"Ahora el chat está conectado de verdad al agente 5000 mediante un nuevo Modo Agente PC"* (`CHANGELOG.md:3-14`).
- **[INFERENCIA]** El "build 2.0" del CHANGELOG es una **numeración interna del build**, distinta de la carpeta `v2.0/` de evolución (que es "CerebroNico-IDE-v2.0 (hibrido3)") → fuente de la confusión de numeración (§6).

### 3.2 Estructura de `src/` — 14 `.ts` + 9 `.tsx` [HECHO]

`agent-v2/ide/` contiene 40 archivos. Bajo `src/`:

| Archivo | Líneas | Rol |
|---|---:|---|
| `src/App.tsx` | 1209 | Shell de la app, estado global, `pcMode` persistido, fetch subagentes |
| `src/main.tsx` | 70 | Entrada React |
| `src/types.ts` | 112 | Tipos (`StreamConfig`, `SubagentItem`, `WorkspaceFile`, `AttachmentItem`…) |
| `src/vite-env.d.ts` | 1 | Referencia de tipos Vite |
| `src/utils/engine.ts` | 757 | **Motor de streaming** (`HighPerformanceAIStreamer`, `StreamConfig`, `StreamCallbacks`, `repairNumberedListsAndGaps`) |
| `src/utils/attachmentProcessor.ts` | 592 | **Procesador de adjuntos** (DOCX/RTF/PDF/binario) |
| `src/utils/contextCache.ts` | 193 | **Caché de contexto** (idioma, modos experto, MEMORIA/SKILLS por defecto) |
| `src/utils/memory.ts` | 193 | Reglas de memoria (`BASE_MEMORY_RULES`, `buildSystemPrompt`) |
| `src/utils/syntaxEngine.ts` | 193 | **Resaltado de código** (Prism) + plantillas por lenguaje |
| `src/utils/languageMemory.ts` | 188 | **Memoria lingüística** (jerga→intención, 12 categorías) |
| `src/utils/fileParser.ts` | 144 | Empaquetado ZIP de workspace + descarga |
| `src/utils/codeParser.ts` | 96 | **Parser de bloques de código** → archivos |
| `src/components/ChatCenter.tsx` | 633 | Área de chat + toggle "Agente PC" |
| `src/components/RightSidebar.tsx` | 722 | Panel derecho |
| `src/components/LeftSidebar.tsx` | 840 | Panel izquierdo + sección **Subagentes** |
| `src/components/ModelSelectorModal.tsx` | 503 | Selector de modelo |
| `src/components/CodeEditor.tsx` | 428 | Editor |
| `src/components/ApiKeyModal.tsx` | 292 | Claves cloud |
| `src/components/Header.tsx` | 229 | Cabecera |
| `src/data/skills100.ts` | 835 | Catálogo de 100 skills |
| `src/data/skills50.ts` | 417 | Catálogo de 50 skills |

Total `src/` ≈ **8.647 líneas** [HECHO, `wc -l`]. Cuenta de tipos: **14 archivos `.ts`** (incl. `types.ts`, `vite-env.d.ts`, 7 utils, 2 data, …) y **9 `.tsx`** (App, main, 7 components) [HECHO].

### 3.3 Módulos reutilizables clave (los "buscados") [HECHO]

- **`attachmentProcessor.ts` (592)** — procesador de adjuntos **multi-formato**:
  - `extractTextFromWordXml()` (línea 12) → DOCX vía `<w:t>`/`<w:p>` (DOMParser + fallback regex).
  - `extractTextFromRtf()` (línea 56) → RTF con decodificación `\'xx` (acentos españoles) y `\u-xxxx?`.
  - `extractTextFromPdf()` (línea 113) → PDF vía `pdfjs-dist` (worker Vite `?url`).
  - `isBinaryData()` (136), `extractReadableStrings()` (166).
  - Guardas de nombre: `isImageFileName` (196), `isZipFileName` (203), `isDocxFileName` (210), `isTextFileName` (217).
  - **API pública principal:** `processUploadedFile(file: File)` (línea 257).
- **`syntaxEngine.ts` (193)** — `SUPPORTED_LANGUAGES` (línea 26; TS/JS/Python/JSON/MD/CSS/YAML/Rust/Go/C/C++ con `prismKey`+`snippetTemplate`), `detectLanguageFromPath()` (116), `highlightCode()` (133), `escapeHtml()` (148), `formatCodeAuto()` (160). Importa 16 gramáticas Prism (líneas 1-16).
- **`codeParser.ts` (96)** — `extractCodeBlocksFromMessage(markdown)` (12): regex de ```lang file="ruta"``` y detección de ruta por comentario en 1ª línea; `mergeExtractedFiles(currentFiles, blocks)` (53) → `{updatedFiles, createdCount, updatedCount}`. **Es el puente entre la salida del LLM y el VFS.**
- **`contextCache.ts` (193)** — `RESPONSE_LANGUAGES` (es/en/pt/fr/de/it, línea 4), `getResponseLanguageDirective` (13), `EXPERT_MODES` (19: general/legal/médico/fraude/docs/código), `buildExpertDirective` (28), `DEFAULT_MEMORIA_MD` (45), `DEFAULT_SKILLS_MD` (62: "Catálogo de 100 Habilidades"), `buildContextCachePayload()` (89). **Es el armador del "contexto base" del IDE.**
- **`languageMemory.ts` (188)** — 12 categorías (`idiomatic`, `semantic_map`, `correction`, `pattern`, `technical_term`, `context_clue`, `ambiguity`, `intent`, `syntactic_bridge`, `multi_agent_intent`, `telemetry_cue`, `architecture_cue`), `SEED_LANGUAGE_MEMORIES` (29) que traduce jerga ("hazlo/ármalo/cóselo" → `generate_full_code_and_files`; "púlelo" → `refactor_clean_ui_and_optimize`). Persistencia `localStorage` clave `codigo0_language_memory_entries` (27). **Diferencial de este linaje: memoria de jerga en español.**
- **`fileParser.ts` (144)** — `generateProjectZip(files)` (7) con JSZip, `triggerFileDownload(blob, filename)` (135). ⚠️ **Ojo:** en la línea 74 aparece `export default defineConfig({…})` (un `vite.config` embebido), **resto/artefacto de copia** — revisar antes de portar.
- **`engine.ts` (757)** — `StreamConfig` (3), `StreamCallbacks` (17), `repairNumberedListsAndGaps()` (49), `class HighPerformanceAIStreamer` (165). Es el corazón del streaming.

### 3.4 `tests/` [HECHO]
`agent-v2/ide/tests/`:
- `comprehensive_e2e_test.py` (976 líneas): verifica `/api/ai/stream` de los **4 providers** (Ollama, Gemini, OpenRouter, Custom) con mocks, usando 3 métodos (curl `--no-buffer`, fetch nativo Node, `http.client` de Python) **+ test de regresión** que reproduce el bug antiguo `req.on("close")` (`tests/comprehensive_e2e_test.py:1-14`). Puerto de mocks >8000 por el "bad port" de undici (35-39).
- `mock_ollama.py`.
- `package.json:11` → `"test:e2e": "python3 tests/comprehensive_e2e_test.py"`.
- `README.md:65-78` documenta `OVERALL: ALL PASS` con 8 tests: `ollama_short, ollama_long, openrouter, custom_provider, gemini_fallback, python_bridge, regression_old_bug, regression_new_code`.

### 3.5 Backend `server.ts` y puente [HECHO]
- `agent-v2/ide/server.ts` = **1.908 líneas**: implementa `/api/ai/stream` (SSE) con `StreamContext`, `sendChunk/sendDone/sendError/sendTaskEvent`, abort por `res.on("close")`, watchdog de 8 min, reintentos 3× con backoff (408/425/429/500/502/503/504), `pipeOpenAICompatibleStream()`, auto-arranque del puente y `/api/subagents` (`README.md:51-63`).
- `agent-v2/ide/agent_bridge_5000.py` = **473 líneas** (puente endurecido + PC tools, §2.4).
- Scripts Windows: `iniciar_todo_windows.bat`, `limpiar_ollama_windows.bat`.

### 3.6 Veredicto agent-v2 [INFERENCIA]
- **Es la build más madura y "portable" del linaje local**: mismo stack Vite+Express+React que v1.x→v3.3.2, con utils modularizados, tests e2e y Modo Agente PC. **Es el mejor candidato como base de la fusión V8**, más que Codigo-0-v3 (Next).
- **Basura a evitar:** `fileParser.ts:74` (vite.config embebido) y la duplicación `CHANGELOG==README` (ambos = "Modo Agente PC build 2.0").

---

## 4. PRUEBAS V2.3.2 — carpeta `extra_pruebas_v232/` (2026-09-21)

### 4.1 Qué contiene [HECHO]
Ruta raíz: `extra_pruebas_v232/PRUEVAS V2.3.2 PARA PROYECTO/` — **92 entradas**, compuesta por:
- **`workspaces/`** — 7 subcarpetas de proyecto generado + `zips/`:
  - `476bd5b6-mt7jl46a`, `0f3e46c7-mt7jjj0o`, `89eb740e-mt7jn1l6`, `0ac0aa06-mt7jii2t` (plantilla `web-react`)
  - `159dbe5f-mt7jffqw` (plantilla `python-cli`)
  - `824e9a2b-mt7jk9xk` (plantilla `api-express`)
  - `workspaces/zips/159dbe5f-mt7jffqw.zip` (3604 bytes)
- **Documentos de la app Codeapp/CodeeApp v2.3.2**: `CODIGO-CODEEAPP-2.3.2.md` (**608 KB**), `MEMORANDUM-SEGURIDAD.md` (9,8 KB), `RE-EVOLUCION-CODEEAPP.md` (18,5 KB), `PRUEVA CHAT  V2.3.2.rtf` (55 KB), y el `.zip` maestro (`PRUEVAS V2.3.2 PARA PROYECTO.zip`, 3,1 MB; `ZIPS.zip`, 6,1 MB).
- **9 capturas JPG** (evidencia visual): `v2.3.2.jpg`, `AUTOMATA V2.3.2.jpg`, `EQUIPO DE AUTOMATAS Y CAPTURA.jpg`, `HERRAMIENTAS.jpg`, `PESTAÑA DE HERRAMIENTAS.jpg`, `SKILLS.jpg`, `EXTENCIONES.jpg`, `RAM 1.jpg`, `RAM 2.jpg`, `Reformas V2.3.2.jpg`, `Reformas 2- V2.3.2.jpg`, `reinicio del chat v2.3.2.jpg`, `diferentes tareas en linea para app.jpg`.

### 4.2 Samples representativos (2–3) [HECHO]

**(a) Job `476bd5b6` — plantilla `web-react`, generado por la IA a partir de un autómata "Fullstack".**
- `workspaces/476bd5b6-mt7jl46a/manifest.json` → `"idea": "Actúa como Fullstack: genera una aplicación completa de punta a punta (frontend + backend + base de datos)… [AUTÓMATA: Fullstack]"`, `"template": "web-react"`, 7 archivos, `"status": "writing"`, `createdAt: 1787594458978` (epoch ms → **2026-08-24**).
- `MEMORIA.md` (línea 2): *"> 📌 Codeapp v2.3 · creado por Nicolas Quintero"*; `_Generado: 2026-08-24T18:00:58.978Z_`.
- `src/App.tsx:4`: literal *"⚡ App generada por Codeapp v2.1"* y `:7` *"pipeline: plan → programador → revisor → build → zip → dev server"*.
- `code-map.json` → índice `{file, imports, exports}` para 3 archivos (`src/App.tsx`, `src/main.tsx`, `vite.config.ts`), `"total": 3`.
- `package.json` → `"name": "generated-web-app"`, React 19 + Vite 6 + Tailwind 4.

**(b) Job `159dbe5f` — plantilla `python-cli`, es el "pedido de evolución" del IDE.**
- `manifest.json` → `"idea"` = un **brief largo en español** que pide: chat con adjuntar 50 archivos, botón de modalidad (automático/rápido/ingeniero/pensamiento profundo), **Cerebro MD** con archivos y auto-organización por autómata, etc. — es, en la práctica, **el origen funcional del IDE que hoy es V8**.
- `main.py` → *"Script generado por Codeapp v2.1"*, imprime "Hola, mundo! Generado por agentes en segundo plano."

**(c) Job `824e9a2b` — plantilla `api-express`.**
- `manifest.json` → `[AUTÓMATA: Backend]`, `"template": "api-express"`.
- `server.js` → Express + cors con `/api/health` y `/api/hello`, *"Hola desde la API generada por Codeapp v2.1"*.

**Nota (evidencia de mezcla de versiones) [HECHO]:** dentro del MISMO paquete "V2.3.2", el código generado se auto-rotula **"Codeapp v2.1"** (App.tsx, main.py, server.js) y la `MEMORIA.md` dice **"Codeapp v2.3"**; solo los documentos externos dicen **"v2.3.2"**. → **la numeración es inconsistente dentro del propio proyecto.**

### 4.3 ¿Qué versión "V2.3.2" es? — con INFERENCIA explícita

- **[HECHO]** Los docs están firmados *"Creado por Nicolas Quintero · v2.3.2 · 2026-08-22"* (`CODIGO-CODEEAPP-2.3.2.md:1,3-4`; `RE-EVOLUCION-CODEEAPP.md:3`).
- **[HECHO]** `CODIGO-CODEEAPP-2.3.2.md` se declara *"réplica 1:1"* del proyecto real, **"81 archivos · 14.223 líneas"**, con `server.ts` (404), `ai.ts` (307), `electron/services.cjs` (169), scripts `electron:build`/`electron-builder --win nsis` → es un **IDE de escritorio Electron + Vite + React**.
- **[HECHO]** `MEMORANDUM-SEGURIDAD.md:146` se titula **"Codeapp v2.3.1 (hardening)"** y documenta el puente `agent_bridge_5000.py`/`.cjs` con `HOST=0.0.0.0` + CORS `*` + sin token = RCE crítico, "Corregido".
- **[INFERENCIA]** **"V2.3.2" NO pertenece a la línea de carpetas de `cerebronico_evolution`** (v1.0→v3.3.2). Es una **línea paralela y anterior**, la de la app **Codeapp/CodeeApp** (evolución interna v1.1 → v2.0 → v2.1 → v2.3 → v2.3.1 → v2.3.2, ago-2026). Por eso no aparece su código fuente entre las carpetas de evolución: solo llegaron sus **pruebas, capturas, memorándum y el volcado `CODIGO-CODEEAPP-2.3.2.md`**.
- **[INFERENCIA]** Codeapp v2.3.2 es el **ancestro conceptual directo** de todo el IDE CerebroNico: (i) `autoaprendizaje.ts` dice "Inspirado en Codeapp v2.3.2 MemoryManager"; (ii) `automata-team.ts` dice "Adaptado de Codeapp v2.3.2 automataTeam.ts"; (iii) el brief del job `159dbe5f` describe el mismo producto. **Codeapp = nombre previo del producto antes de renombrarlo "Codigo-0"/"CerebroNico".**

### 4.4 `PRUEVA CHAT V2.3.2.rtf` — resultados de las pruebas de chat [HECHO]
- `prueva_chat_codigo-0_v2_3_2.md` (el suelto de `uploads/`, 149 líneas) es su versión en texto. Transcripción de una sesión **2:47 p.m. → 3:32 p.m.** con `stablelm2`:
  - 2:47 *"comenzamos la prueba responde stablelm2"* → respuesta **vacía**.
  - 3:13 *"tu"* → el modelo **repite en bucle** *"estudia el proceso de procesamiento de datos…"* ×7.
  - 3:19–3:30 respuestas incoherentes/repetidas: *"¡Hola! ¿Cómo puedo ayudarte hoy?"*, *"No, no, no…"*, *"¿Qué?"*, *"Asistente: ¿Qué?"*.
  - 3:28–3:32 el usuario pide crear una app Windows con chatbot local Ollama y el modelo **no responde / repite**.
- **Interpretación [HECHO]:** el documento es **evidencia de un FALLO del motor de chat** (bucle/degeneración de `stablelm2` o del pipeline de streaming), registrado por el dueño. Es la razón de las capturas "reinicio del chat v2.3.2".

---

## 5. Archivos sueltos de `<carpeta-de-uploads>`

### 5.1 `agent_bridge_5000.py` — 201 líneas — puente shell + Python [HECHO]

Archivo autónomo (sin dependencias), docstring: *"Servidor Agente SuperCodeApp de Ejecución Local & Python (Puerto 5000). 100% Python nativo (sin dependencias externas). Compatible con Python 3.8…3.14+."* (`uploads/agent_bridge_5000.py:2-8`). Basado en `http.server`/`socketserver`.

**Endpoints completos:**
| Método | Ruta | Línea | Función |
|---|---|---|---|
| GET | `/`, `/status`, `/health`, `/api/status`, `/api/health` | 42-56 | Health: `status`, `agent`, `runtime`, `pythonSupport`, `pcAccess`, `port`, `uptime`, `timestamp` |
| GET | `/api/ollama-tags`, `/api/ollama/tags` | 59-70 | **Proxy** a `127.0.0.1:11434/api/tags` (proxy CORS) |
| POST | `/api/agent`, `/api/generate` | 86-103 | Si trae `command` → ejecuta; si no, respuesta simulada |
| POST | `/api/exec` | 106-116 | **Shell exec** (CMD/PowerShell/Bash) |
| POST | `/api/python` | 119-141 | **Ejecución de código Python**: escribe `temp_exec_<ms>.py` en `os.getcwd()`, lo lanza con `sys.executable`, y lo borra en `finally` |

- Motor de ejecución `_run_command()` (146-172): `subprocess.run(command, shell=True, capture_output=True, timeout=30)`; devuelve `{success, content, output, error, returncode}`.
- Arranque `run_server()` (178-201): `TCPServer.allow_reuse_address`, mensajes con emojis, manejo de `Address already in use` (winerror 10048) con instrucciones `netstat/taskkill`.

**Validaciones:** solo comprueba **presencia** de `command`/`code` (400 si vacío: líneas 108-111, 121-124). **NO valida tipo/longitud**, ni rutas, ni caracteres peligrosos. `json.loads` protegido con try/except (80-83).

**Seguridad (crítico) [HECHO]:**
- `HOST = "0.0.0.0"` (línea 21) → **escucha en TODAS las interfaces**.
- `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Private-Network: true` (líneas 28, 31) → **cualquier página web** puede invocarlo.
- `Access-Control-Allow-Headers: *` (30).
- **CERO autenticación/token** en `/api/exec`, `/api/agent`, `/api/python`.
- **Sin sandboxing**: `shell=True`, sin lista blanca de comandos, sin límite de tamaño, `timeout=30` como única barrera. Escritura del `.py` temporal en el CWD del proceso.
- ➜ **Es la versión EXACTAMENTE descrita como vulnerabilidad #1 en `MEMORANDUM-SEGURIDAD.md` (RCE sin autenticación en la LAN).** [HECHO: coincidencia de `HOST=0.0.0.0`, CORS `*`, sin token]

**Relación con el puente `:5000` de v3.3.2 [HECHO]:** el suelto de `uploads/` es **dos generaciones ANTERIOR** al de v3.3.2/agent-v2. Diferencias:
| Aspecto | `uploads/` (v2.3.2-era) | `agent-v2` / `v3.3.2` |
|---|---|---|
| Líneas | 201 | 473 / 474 |
| `HOST` | `0.0.0.0` | `127.0.0.1` |
| Token/Bearer | ❌ ninguno | ✅ (según `MEMORANDUM-SEGURIDAD.md:186`) |
| Endpoints PC | ❌ | ✅ `/api/pc/info`, `/api/fs/*`, `/api/subagents` |
| UTF-8 Windows | ❌ (crash por emojis) | ✅ fix en agent-v2 |
| Threading | single (TCPServer) | `ThreadingMixIn` |

### 5.2 `agent_bridge_5000.js` — 188 líneas — versión JS del puente [HECHO]

Sí, es el **gemelo en Node.js puro** (`http` + `child_process.exec` + `fs` + `path`) del `.py`. Cabecera: *"Servidor Agente SuperCodeApp de Ejecución Local / Python (Puerto 5000)"* (`uploads/agent_bridge_5000.js:1`).
**Endpoints:** idénticos en ruta al `.py` → GET health (`/`,`/status`,`/health`,`/api/status`,`/api/health`, líneas 28-49), POST `/api/agent`|`/api/generate` (52-91), POST `/api/exec` (94-123), POST `/api/python` (126-163).

**Diferencias `.js` vs `.py`:**
| Aspecto | `.py` | `.js` |
|---|---|---|
| Health payload | `runtime: "Python x.y"`, `uptime` seg | `uptime: process.uptime()`, sin `runtime`, agent `"(Puente Python & PC)"` |
| Proxy Ollama `/api/ollama-tags` | ✅ presente | ❌ **ausente** |
| Ejecución Python | `sys.executable` + temp `temp_exec_<ms>.py` | `python "<tmp>" \|\| python3 "<tmp>"`, temp fijo `_temp_script.py` (línea 138) |
| Limpieza temp | `finally` garantizado | `try/catch` tras el callback (145) |
| Payload `/api/agent` | lee `{command,prompt}` | lee `{prompt,files,skill,command}` (57) |
| Salida | `{success,content,output,error,returncode}` | `{success,content,output,error}` (sin `returncode`) |
| CORS headers | `Allow-Headers: *` | lista explícita (línea 14) |
| `HOST` | `0.0.0.0` | `0.0.0.0` |
| Seguridad | misma ausencia de token/sandbox | misma ausencia de token/sandbox |

**Estado [INFERENCIA]:** ambos tiene el **mismo defecto crítico** (bind `0.0.0.0`, CORS `*`, sin token, `shell=True`/`exec` sin allowlist). El MEMORÁNDUM (186-189) señala además que "el puente JS se renombró a `.cjs` porque no ejecutaba bajo `type: module`" → **[INFERENCIA]** este `.js` no arrancaría tal cual en el proyecto (que es `"type":"module"`), salvo con Node CommonJS explícito.

### 5.3 `iniciar_ollama_11434.bat` — 32 líneas — contenido EXACTO [HECHO]

```bat
@echo off
cd /d "%~dp0"
title Ollama Engine Local (Puerto 11434) - CerebroNico
color 0D
echo ============================================================
echo   Iniciando Servidor Ollama en Puerto 11434 (CORS Habilitado)
echo ============================================================
echo.

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Ollama no esta instalado en el sistema PATH de Windows.
    echo Por favor descarga Ollama desde https://ollama.com
    echo.
    pause
    exit /b 1
)

echo [INFO] Cerrando instancias colgadas previas de Ollama...
taskkill /IM ollama.exe /F >nul 2>nul
taskkill /IM "ollama app.exe" /F >nul 2>nul
timeout /t 1 /nobreak >nul

echo [INFO] Configurando OLLAMA_ORIGINS=* para habilitar CORS sin bloqueos...
set OLLAMA_ORIGINS=*
set OLLAMA_HOST=0.0.0.0:11434

echo [RUN] Ejecutando: ollama serve en http://localhost:11434
echo.
ollama serve

pause
```
**Hallazgo [HECHO]:** arranca Ollama con `OLLAMA_ORIGINS=*` (CORS abierto) y `OLLAMA_HOST=0.0.0.0:11434` (expone Ollama a la LAN). **[INFERENCIA]** es coherente con el patrón "todo 0.0.0.0" de la era v2.3.2, y es el mismo tipo de exposición que el MEMORÁNDUM marcó como crítico para el puente.

### 5.4 `prueva_chat_codigo-0_v2_3_2.md` — 149 líneas — contenido completo [HECHO]
Ya transcrito en §4.4: bitácora de chat 2:47–3:32 p.m. con `stablelm2`, marcada por **respuestas vacías, bucles de repetición y respuestas incoherentes** ("No, no, no, no…", "¿Qué?"). **Es evidencia de un fallo del motor de chat de la era v2.3.2/Codigo-0**, no un simple log neutro.

---

## 6. Línea de tiempo de nombres ("Codigo-0" → "CerebroNico-IDE" → "Cerebronico")

### 6.1 Nombres por fase (nombre de carpeta · nombre de paquete · fecha) [HECHO]

| Fase / carpeta | Nombre comercial que usa | `package.json` name@version | Fechas de archivos |
|---|---|---|---|
| **Codeapp / CodeeApp v1.1→v2.3.2** (fuera de `cerebronico_evolution`; solo en `extra_pruebas_v232/`) | "Codeapp" / "CodeeApp" | *(no presente; su app usa `generated-web-app` en los workspaces; Electron)* | docs **2026-08-22**; workspaces generados **2026-08-24** |
| **`extra_codigo0/`** (Codigo-0-v3) | **"Codigo-0"** (system prompt `ide-store.ts:424`, Cerebro MD `:439`) | **`nextjs_tailwind_shadcn_ts@0.2.1`** (¡nombre de plantilla!) | **2026-05-12 → 2026-08-26** |
| **`extra_fix_ollama/`** | **"Codigo-0 CerebroNico IDE"** (`.env.example:1`) | **`codigo-0-cerebronico@1.0.0`** | 2026-09-10 (05:39–07:36) |
| **`agent-v2/ide/`** | **"CerebroNico IDE"** (`README.md:5`) | **`codigo-0-cerebronico@1.0.0`** | 2026-09-10 (16:48–16:57) |
| **`v1.0`–`v1.1.1`** | **"Cerebronico"** (carpetas `Cerebronico-v1.x`) | `codigo-0-cerebronico@1.x` | 2026-09-19 → 2026-09-21 |
| **`v1.4.0`** | "CerebroNico_IDE" | **`codigo-0-cerebronico@1.4.0`** | 2026-09-13 → … |
| **`v2.0`,`v2.1`** | "**CerebroNico-IDE**-v2.x" | `codigo-0-cerebronico` | 2026-09-13 → 2026-09-18 |
| **`v3.3.2`** | "CerebroNico-IDE-v3.3.2" | **`codigo-0-cerebronico@1.3.2`** ⚠️ | 2026-09-10 → … |

### 6.2 Mapa temporal [HECHO por fechas de archivo + INFERENCIA]

```
2026-05-12 ── Codigo-0-v3 (extra_codigo0) arranca  [Next.js + shadcn]  ──┐  (linaje web, el MÁS ANTIGUO)
2026-08-22 ── Codeapp/CodeeApp v2.3.2 (docs)      [Electron + Vite]      │  (ancestro: MemoryManager, automataTeam)
2026-08-24 ── workspaces generados por Codeapp v2.1/2.3                   │
2026-08-26 ── Codigo-0-v3 último cambio                                  ┘
2026-09-10 ── fix_ollama (05:44) → agent-v2/ide "Modo Agente PC build 2.0" (16:48)  [paquete codigo-0-cerebronico]
2026-09-13 ── v1.4.0 / v2.0 / v2.1 (hibridos)
2026-09-19/21 ── v1.0 → v1.1.1 (Cerebronico)
2026-09-10→… ── v3.3.2 (backend package 1.3.2)
2026-09-21 ── PRUEBAS V2.3.2 (compiladas por el dueño para la auditoría V8)
```
- **[INFERENCIA]** El orden lógico es: **Codeapp** (producto previo, ago) → **Codigo-0** (rebrand y re-stack a Next, may–ago) → **CerebroNico IDE** (sep 10, vuelta a Vite y nacimiento del "Modo Agente PC") → **Cerebronico** (v1.x, sep 13–21).

### 6.3 Por qué existe la confusión de numeración (respuesta directa) [HECHO + INFERENCIA]

**HECHO — tres causas concretas verificadas:**
1. **Dos líneas de versión simultáneas:** *Codeapp v2.3.2* (línea vieja, ago-2026) y *Cerebronico v1.0→v3.3.2* (línea nueva, sep-2026). El "2.3.2" que aparece en `extra_pruebas_v232/` **no es** un "2.3.2" del IDE CerebroNico.
2. **Discrepancia carpeta vs paquete:** `v3.3.2/ide/backend/package.json` declara `"version": "1.3.2"` y `v1.4.0/…` declara `1.4.0`, mientras el nombre de carpeta es `v3.3.2`/`v1.4.0` → **el semver del `package.json` NO se actualizó con la carpeta**.
3. **"build 2.0" vs carpeta `v2.0`:** `agent-v2/ide/CHANGELOG.md` se titula *"Modo Agente PC (build 2.0)"*, pero la carpeta `v2.0/` de evolución es otra cosa ("CerebroNico-IDE-v2.0 (hibrido3)"). El "2.0" del CHANGELOG es **numeración interna de build**, no de release.

**[INFERENCIA] explicativa:** el nombre de paquete **`codigo-0-cerebronico` nunca cambió** aunque el producto se renombró dos veces ("Codigo-0"→"CerebroNico IDE"→"Cerebronico"). Ese ancla fija (el `name` del paquete) es la causa raíz de que hoy todo parezca "lo mismo con números distintos". Para V8 conviene fijar **una sola línea semver** y archivar el resto como "legacy".

---

## 7. Tabla maestra: qué rescatar de cada "extra" para la fusión V8

Leyenda de **valor V8**: **ALTO** = portar casi directo / alto impacto · **MEDIO** = portar con adaptación · **BAJO** = solo referencia · **NULO** = descartar (roto, boilerplate o inseguro).

| Módulo / archivo | Origen (extra) | Versión / fecha | Tamaño | Estado | Valor V8 | Razón |
|---|---|---|---:|---|---|---|
| `src/lib/autoaprendizaje.ts` | extra_codigo0 | Codigo-0-v3 · 2026-05/08 | 376 L | ✅ completo, sin deps | **ALTO** | Memoria auto-evolutiva (5 tipos, recall+scoring). Portable 1:1, más rica que `memory.ts` |
| `src/lib/automata-team.ts` | extra_codigo0 | Codigo-0-v3 · 2026-05/08 | 221 L | ✅ completo, sin deps | **ALTO** | 11 sub-agentes con `prompt` listos; encaja con `codeParser` de agent-v2 |
| `src/lib/ide-store.ts` | extra_codigo0 | Codigo-0-v3 · 2026-05/08 | 593 L | ✅ compila | **ALTO** (patrón) | Ensamblador de contexto (`getFullSystemPrompt`) y store de sesiones/modalidades |
| `src/components/ide/*` | extra_codigo0 | Codigo-0-v3 | 1.495 L | ✅ funcional | **MEDIO** | UI de chat/paneles reusable, pero Tailwind 4 + shadcn (distinto al stack Vite actual) |
| `src/app/api/chat/route.ts` | extra_codigo0 | Codigo-0-v3 | 226 L | ✅ | **MEDIO** | Multiplexor Ollama/Gemini/OpenRouter; **portar lógica** a `server.ts`, no el archivo (Next) |
| `src/app/api/{sandbox,deliverables,providers,ram}/route.ts` | extra_codigo0 | Codigo-0-v3 | 442 L | ✅ | **BAJO** | Específico de Next route handlers |
| `src/components/ui/*` (51 archivos) | extra_codigo0 | Codigo-0-v3 | ~3.000 L | ✅ boilerplate | **NULO** | shadcn de plantilla; no aporta al IDE |
| `src/lib/db.ts` | extra_codigo0 | Codigo-0-v3 | 12 L | ❌ **roto** (sin `prisma/schema.prisma`) | **NULO** | Código muerto; fallaría `prisma generate` |
| `next.config.ts` (`ignoreBuildErrors`) | extra_codigo0 | Codigo-0-v3 | 13 L | ⚠️ riesgo | **NULO** | Anti-patrón: enmascara errores de tipo |
| `agent_bridge_5000.py` | extra_fix_ollama | monorepo v1.0.0 · 09-10 | 201 L | ✅ (bind local) | **MEDIO** | Puente base; **sin** PC-tools/token/UTF-8-fix |
| `server.ts` | extra_fix_ollama | v1.0.0 · 09-10 | 1.385 L | ✅ | **BAJO** | Superado por el de agent-v2 (1.908 L) |
| `src/utils/attachmentProcessor.ts` | agent-v2 | build 2.0 · 09-10 | 592 L | ✅ (usa pdfjs/jszip) | **ALTO** | **El "procesador de adjuntos" que se buscaba**: DOCX/RTF/PDF/binario |
| `src/utils/syntaxEngine.ts` | agent-v2 | build 2.0 · 09-10 | 193 L | ✅ (Prism) | **ALTO** | **El "resaltado" que se buscaba**: 10+ lenguajes + plantillas |
| `src/utils/codeParser.ts` | agent-v2 | build 2.0 · 09-10 | 96 L | ✅ | **ALTO** | **El "parser de código" que se buscaba**: LLM→archivos |
| `src/utils/contextCache.ts` | agent-v2 | build 2.0 · 09-10 | 193 L | ✅ | **ALTO** | Modos experto + idiomas + MEMORIA/SKILLS por defecto |
| `src/utils/languageMemory.ts` | agent-v2 | build 2.0 · 09-10 | 188 L | ✅ | **ALTO** | Memoria de jerga española→intención (diferencial) |
| `src/utils/engine.ts` | agent-v2 | build 2.0 · 09-10 | 757 L | ✅ | **ALTO** | Motor de streaming (`HighPerformanceAIStreamer`) |
| `src/utils/memory.ts` | agent-v2 | build 2.0 · 09-10 | 193 L | ✅ | **MEDIO** | Solapa con `autoaprendizaje.ts`; usar el de codigo0 |
| `src/utils/fileParser.ts` | agent-v2 | build 2.0 · 09-10 | 144 L | ⚠️ artefacto L74 | **MEDIO** | ZIP/download útil, pero **limpiar el `defineConfig` embebido** |
| `src/components/*` (7) + `src/data/skills{50,100}.ts` | agent-v2 | build 2.0 · 09-10 | ~5.000 L | ✅ | **ALTO** | UI completa + catálogo de 100 skills ya poblado |
| `src/App.tsx`, `types.ts` | agent-v2 | build 2.0 · 09-10 | 1.321 L | ✅ | **ALTO** | Shell con `pcMode` y tipos del dominio |
| `tests/comprehensive_e2e_test.py` + `mock_ollama.py` | agent-v2 | build 2.0 · 09-10 | 976 L | ✅ (8 tests) | **ALTO** | Suite e2e de streaming multi-provider; reusar como regresión V8 |
| `tests/` de `fix_ollama` | extra_fix_ollama | — | — | ❌ no existen | **NULO** | Ausentes (tarea "Only in agent-v2/ide: tests") |
| `agent_bridge_5000.py` (endurecido + PC) | agent-v2 / v3.3.2 | 473 / 474 L · 09-10 | 473 L | ✅ | **ALTO** | Puente oficial: PC-tools, `127.0.0.1`, UTF-8 fix, threading |
| `CODIGO-CODEEAPP-2.3.2.md` | extra_pruebas_v232 | Codeapp · 2026-08-22 | 608 KB / 81 archivos | ✅ doc | **MEDIO** | Fuente de verdad del ancestro (MemoryManager, automataTeam, electrón) |
| `MEMORANDUM-SEGURIDAD.md` | extra_pruebas_v232 | Codeapp v2.3.1 · 2026-08-22 | 9,8 KB | ✅ doc | **ALTO** | Checklist de seguridad aplicable ya (RCE, iframe, CSRF, zip-slip, SSRF) |
| `RE-EVOLUCION-CODEEAPP.md` | extra_pruebas_v232 | v3.0 vision · 2026-08-22 | 18,5 KB | ✅ doc | **MEDIO** | Roadmap (MCP, subagentes+hooks, skills file-based) alineado con V8 |
| `workspaces/*` (7) + `code-map.json` | extra_pruebas_v232 | Codeapp v2.1/2.3 · 2026-08-24 | — | ✅ | **MEDIO** | Muestran el formato `manifest.json`/`code-map.json`/`MEMORIA.md` a replicar |
| `uploads/agent_bridge_5000.py` (201 L, `0.0.0.0`, sin token) | uploads | v2.3.2-era | 201 L | ⚠️ **inseguro** | **NULO** (como producto) / **ALTO** como evidencia | **RCE**: `HOST=0.0.0.0` + CORS `*` + `shell=True` sin auth |
| `uploads/agent_bridge_5000.js` (188 L) | uploads | v2.3.2-era | 188 L | ⚠️ **inseguro** + no arranca bajo `type:module` | **NULO** | Gemelo JS del anterior, mismos defectos; renombrado a `.cjs` en v2.3.1 |
| `uploads/iniciar_ollama_11434.bat` | uploads | — | 32 L | ✅ funcional | **MEDIO** (con cambio) | Útil para arrancar Ollama, pero `OLLAMA_ORIGINS=*` y `OLLAMA_HOST=0.0.0.0` → **cambiar a `127.0.0.1`** |
| `uploads/prueva_chat_codigo-0_v2_3_2.md` | uploads | v2.3.2 | 149 L | ✅ log | **BAJO** | Evidencia del bug de bucle de chat; sin código rescatable |

### 7.1 Recomendación de fusión (orden de prioridad) [INFERENCIA]
1. **Base:** `agent-v2/ide/` (mismo stack que v1.x–v3.3.2; ya trae Modo Agente PC, tests y los utils buscados).
2. **Injertar de Codigo-0-v3:** `autoaprendizaje.ts` + `automata-team.ts` (y el patrón de `getFullSystemPrompt` de `ide-store.ts`).
3. **Reusar de v3.3.2:** el puente de 474 L (idéntico a agent-v2) — **no** el de `uploads/`.
4. **Descartar:** `db.ts`, los 51 `ui/*`, `app/api/*` de Next, y **ambos** puentes de `uploads/` (inseguros).
5. **Aplicar como checklist:** `MEMORANDUM-SEGURIDAD.md` (binding `127.0.0.1`, Bearer token, CORS restringido, sin `Private-Network-Access`).

---

## 8. Anexo — Inventario de rutas y líneas citadas

**extra_codigo0/**
- `extra_codigo0/package.json:2-3` (name/version), `:15-81` (deps)
- `extra_codigo0/next.config.ts:5-8` (`ignoreBuildErrors`)
- `extra_codigo0/components.json:2,9-14` (shadcn new-york, aliases)
- `extra_codigo0/Caddyfile:1-26` (proxy :81→:3000)
- `extra_codigo0/src/lib/ide-store.ts:238` (create store), `:121-126` (MODALITY_PROMPTS), `:424` ("Eres Codigo-0"), `:439` (CEREBRO MD), `:546` (maxFiles 50), `:562` (getFullSystemPrompt)
- `extra_codigo0/src/lib/autoaprendizaje.ts:3` (inspirado en Codeapp v2.3.2), `:12` (kinds), `:50-52` (LS key/topes), `:109-376` (API)
- `extra_codigo0/src/lib/automata-team.ts:5` (adaptado de Codeapp v2.3.2), `:22-197` (11 autómatas), `:200,211` (API)
- `extra_codigo0/src/lib/db.ts:1-13` (Prisma singleton; **sin schema**)
- `extra_codigo0/src/components/ide/ChatInput.tsx:17-22` (MODALITIES), `:56-60` (adjunto base64)
- `extra_codigo0/src/app/api/chat/route.ts:34` (DEFAULT_OLLAMA_URL), `:55-60` (validación)

**extra_fix_ollama/**
- `extra_fix_ollama/README.md:1-21` (README AI Studio genérico)
- `extra_fix_ollama/.env.example:1-10` ("Codigo-0 CerebroNico IDE", puertos)
- `extra_fix_ollama/package.json:2-4` (`codigo-0-cerebronico@1.0.0`)
- `extra_fix_ollama/agent_bridge_5000.py:21` (`HOST=127.0.0.1`)
- `diff -rq extra_fix_ollama agent-v2/ide` → diferencias §2.3

**agent-v2/**
- `agent-v2/ide/README.md:5,10-16,42-78` (qué es; puertos; providers; tests)
- `agent-v2/ide/CHANGELOG.md:1-14,33-49,63-81` (Modo Agente PC build 2.0; tabla `pc_*`; archivos modificados; seguridad)
- `agent-v2/ide/package.json:2-11` (name/version/type/scripts)
- `agent-v2/ide/src/utils/attachmentProcessor.ts:12,56,113,136,166,196-257`
- `agent-v2/ide/src/utils/syntaxEngine.ts:1-16,26,116,133,148,160`
- `agent-v2/ide/src/utils/codeParser.ts:12,53`
- `agent-v2/ide/src/utils/contextCache.ts:4,13,19,28,45,62,89`
- `agent-v2/ide/src/utils/languageMemory.ts:1-13,27,29`
- `agent-v2/ide/src/utils/fileParser.ts:7,74 (⚠️),135`
- `agent-v2/ide/src/utils/engine.ts:3,17,49,165`
- `agent-v2/ide/src/utils/memory.ts:3,10,51,93,144,168,188`
- `agent-v2/ide/tests/comprehensive_e2e_test.py:1-14,29-40`
- `agent-v2/ide/agent_bridge_5000.py` (473 L; endpoints en 213-377)
- `agent-v2/ide/server.ts` (1.908 L)

**extra_pruebas_v232/**
- `…/PRUEVAS V2.3.2 PARA PROYECTO/CODIGO-CODEEAPP-2.3.2.md:1,26,70-83` (Codeapp v2.3.2, 81 archivos/14.223 líneas)
- `…/MEMORANDUM-SEGURIDAD.md:146,157,175-191` (v2.3.1 hardening; RCE puentes 5000)
- `…/RE-EVOLUCION-CODEEAPP.md:3,92-143` (visión v3.0)
- `…/workspaces/476bd5b6-mt7jl46a/{manifest.json,MEMORIA.md,src/App.tsx,code-map.json}`
- `…/workspaces/159dbe5f-mt7jffqw/{manifest.json,main.py}`
- `…/workspaces/824e9a2b-mt7jk9xk/{manifest.json,server.js}`
- `…/workspaces/zips/159dbe5f-mt7jffqw.zip` (3.604 B)

**uploads/**
- `agent_bridge_5000.py:2-8,21,28-31,42-70,86-141,146-172,178-201`
- `agent_bridge_5000.js:1,14,28-49,52-91,94-123,126-163`
- `iniciar_ollama_11434.bat:1-32` (contenido completo en §5.3)
- `prueva_chat_codigo-0_v2_3_2.md:1-149`

**Comparaciones de integridad**
- `md5sum` puentes: `extra_fix_ollama/agent_bridge_5000.py=9cc47be4…`, `agent-v2/ide/…=7beb9a8a…`, `uploads/…=23886ad6…` (los 3 distintos).
- `diff uploads/agent_bridge_5000.py extra_fix_ollama/agent_bridge_5000.py` → única diferencia: `HOST "0.0.0.0"` vs `os.environ.get("HOST","127.0.0.1")`.

---

## 9. Riesgos y advertencias para V8

1. **Seguridad (crítico):** `uploads/agent_bridge_5000.py` y `.js` son **RCE sin autenticación** (bind `0.0.0.0`, CORS `*`, `Allow-Private-Network`, `shell=True`/`exec` sin allowlist, `/api/python` escribe y ejecuta código arbitrario). **No portarlos.** Usar el puente de `agent-v2`/`v3.3.2` (`127.0.0.1` + Bearer + PC-tools).
2. **`iniciar_ollama_11434.bat`:** cambiar `OLLAMA_HOST=0.0.0.0:11434` → `127.0.0.1:11434` y valorar `OLLAMA_ORIGINS` específico en vez de `*`.
3. **`db.ts` de Codigo-0-v3:** no funcional (falta `prisma/schema.prisma`); si V8 no adopta Prisma, borrarlo.
4. **`fileParser.ts:74` de agent-v2:** contiene un `export default defineConfig({…})` (código de `vite.config` mal copiado) → limpiar antes de portar.
5. **Numeración:** unificar semver (hoy `v3.3.2` ↔ `package.json@1.3.2`) y renombrar "build 2.0" para no colisionar con la carpeta `v2.0/`.
6. **`ignoreBuildErrors:true`** en Codigo-0-v3 y `reactStrictMode:false`: si se portara cualquier parte a Next, reactivarlos.

**Fin del informe 04.**


---

<a id="actualizacion-v1-56-3-md"></a>
## Fuente: ACTUALIZACION_v1.56.3.md

> Unificado v1.69.0 (Mario: un archivo por documento). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### Cómo actualizar a CerebroNico v1.56.3

> **Qué arregla (en una frase):** los modelos LOCALES chicos (como
> `gemma3:270m`, `qwen2.5:0.5b` o `llama3.2:1b`) ahora responden rápido, como
> en tu terminal, porque la IDE les manda una instrucción corta y liviana en vez
> del “manual” gigante que los hacía tardar minutos (o colgar la PC).

Cambio chico y seguro: toca dos archivos de código (`server.ts` y
`server/streamContext.ts`). Elegí UNO de los dos caminos.

---

#### 0) Antes que nada: copia de seguridad (1 minuto)

1. Cerrá CerebroNico del todo.
2. Copiá toda la carpeta del programa a otro lado (al Escritorio, por ejemplo)
   y llamala `CerebroNico_RESPALDO_1.56.2`.

Con eso podés volver cuando quieras.

---

#### Camino A — Reemplazar la carpeta completa (lo más simple, recomendado)

1. Cerrá CerebroNico.
2. **Borrá la carpeta vieja** del programa (ya tenés el respaldo del paso 0).
   - Si vas a instalar encima, borrá también la subcarpeta `node_modules` vieja
     para que tome las versiones nuevas.
3. Descomprimí el ZIP nuevo (`CerebroNico_v1.56.3.zip`) donde tenías el
   programa.
4. En una ventana de comandos, dentro de esa carpeta:
   ```
   npm install
   ```
5. Arrancá como siempre (tu `iniciar_todo` o `npm run dev`).

---

#### Camino B — Cambiar solo los archivos afectados (si no querés reinstalar)

Esta versión toca **dos archivos de código** y los números de versión. Copí del
ZIP nuevo ENCIMA de los tuyos (reemplazando):

- `server.ts`  ← el del arreglo (modo liviano local)
- `server/streamContext.ts`  ← tope de espera ajustable
- `package.json`, `src/constants.ts`, `index.html`  (solo cambia el número de versión)
- `CHANGELOG.md` y este `ACTUALIZACION_v1.56.3.md` (opcional, para tener la nota)

No hace falta `npm install` (no cambiaron dependencias). Arrancá como siempre.

---

#### Cómo verificar que quedó bien

1. Abrí CerebroNico. En el título debería decir **V1.56.3**.
2. Prueba del arreglo:
   - Elegí un modelo LOCAL chico (p. ej. `gemma3:270m` o `qwen2.5:0.5b`).
   - Mandá un mensaje corto (“hola, ¿qué día es hoy?”).
   - **Antes** tardaba más de un minuto. **Ahora** debería empezar a contestar en
     pocos segundos.
3. Si querés confirmarlo por dentro: en la consola del servidor verás un aviso
   del tipo `🪨 Modo LIVIANO local para "gemma3:270m"… system corto, SIN
   herramientas y contexto mínimo`. Esa línea es la señal de que actuó.

##### Sobre `llama3.2:1b` y los cuelgues

El 1B ya NO debería colgar con el modo liviano. Pero ojo: tu Dell tiene 8 GB y
sin placa de video, y la IDE levanta varias cosas a la vez (servidor, puente
Python, memoria, creador de sitios) más Ollama. Si notas que el 1B va muy al
límite:

- Usá el botón **Expulsar** (pestaña Puertos) para liberar RAM antes de pedirle.
- Cerrá el navegador pesado / otras apps mientras lo usás.
- Para lo chico y rápido, quedáte en `gemma3:270m` / `qwen2.5:0.5b`.
- Para trabajo intenso, lo cómodo sigue siendo Gemini o GLM-4.7-Flash (Z.ai).

---

#### Cómo volver atrás (revertir)

- **Camino A:** borrá la carpeta nueva y volvé a poner `CerebroNico_RESPALDO_1.56.2`.
- **Camino B:** volvé a copiar `server.ts`, `server/streamContext.ts`,
  `package.json`, `src/constants.ts` e `index.html` desde tu respaldo.

---

#### Perillas (opcional, para avanzados)

Nuevas en 1.56.3:

- `CN_LOCAL_LIVIANO=1` → fuerza el modo liviano local (`=0` para apagarlo y usar
  el prompt completo). Si no la tocás, se activa sola en modelos chicos
  (micro/tiny) o equipos de 8 GB o menos.
- `CN_WATCHDOG_IDLE_MS` → cuánto espera la app SIN recibir nada del modelo antes
  de cortar, en milisegundos (por defecto `180000` = 3 min; mínimo `10000`).
  Si tu máquina es muy justa y a veces corta justo cuando iba a contestar,
  subilo (p. ej. `240000`).

Siguen vigentes las de antes (para el relevo automático nube→local):
`CN_RELEVO_MODO_LIVIANO`, `CN_RELEVO_TIMEOUT_MS`, `CN_RELEVO_LOCAL`.

> Aclaración: cuando viste en el log cosas como `429 RESOURCE_EXHAUSTED` o
> `gemini-2.5-flash no longer available (404)`, eso NO es un bug: es la **cuota
> diaria del plan gratis de Gemini** agotada (son unas pocas decenas de
> pedidos por día) y un modelo viejo retirado por Google. Por eso conviene tener
> siempre a mano un local chico o GLM-4.7-Flash.


---

<a id="mejoras-rendimiento-v1-56-4-md"></a>
## Fuente: MEJORAS-RENDIMIENTO-v1.56.4.md

> Unificado v1.69.0 (Mario: un archivo por documento). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### PLAN DE RUTA — MEJOR RENDIMIENTO DE CerebroNico (v1.56.4+)

> Documento vivo. Va SIEMPRE dentro del ZIP. Se trabaja POR ETAPAS, con progreso
> real: cada etapa integra algo y LUEGO lo evoluciona. Versión consistente en los
> 4 sitios (package.json / src/constants.ts / index.html / CHANGELOG.md), test
> registrado en `scripts/validar.mjs` (sin pruebas huérfanas), topes/umbrales con
> justificación ESCRITA en el código y contrato de superficie de rutas INTACTO.

Equipo de referencia (Mario): Dell E6430, 8 GB RAM, SIN GPU. Todo lo de aquí se
mide contra ese caso real, no contra una máquina ideal.

---

#### ETAPA 1 — ADMISIÓN POR RAM (HECHA en v1.56.4)

**Problema (raíz):** la IDE mandaba a cargar un modelo local aunque no cupiera en
la RAM libre → swap → primera palabra en minutos → a veces cuelgue. El watchdog
solo cortaba el síntoma tarde.

**Hecho:**
- `src/engine/admisionRam.ts`: función PURA (sin red/disco) que estima la RAM
  real del modelo (tamaño de `/api/tags` + overhead del runtime) contra la RAM
  libre y dicta `ok` / `justo` / `riesgo`. Umbrales (`OVERHEAD_RUNTIME_GB`,
  `HOLGURA_OK_GB`) justificados en la cabecera con números del log real.
- `server.ts`: aviso NO bloqueante tras el preflight de existencia. No añade
  rutas; vive dentro del flujo de chat. `try/catch`: si Ollama está caído o
  lento, no opina.
- `tests/admisionRam.test.ts` registrado en `scripts/validar.mjs`.

**Evolución pendiente (ETAPA 1.1):** llevar el veredicto a la UI (badge
verde/amarillo/rojo junto al selector de modelo) para que se vea ANTES de enviar,
no solo en el log del servidor.

---

#### ETAPA 2 — EXPULSIÓN PROACTIVA Y SELECCIÓN ASISTIDA

**Objetivo:** que `riesgo`/`justo` no obliguen a pensar al usuario.
- Botón «Liberar y reintentar»: si el veredicto es `riesgo`, ofrecer un
  `ollama_expulsar` del residente y recalcular la admisión automticamente.
- Sugeridor de modelo que CABE: con la lista de `/api/tags` y la RAM libre,
  proponer el modelo instalado más capaz que entre con holgura.
- Test: casos de «expulsar → ahora cabe» y «no hay ninguno que entre».

---

#### ETAPA 3 — PRESUPUESTO DE PROMPT POR TRAMO DE RAM

**Objetivo:** el system/contexto que se arma debe escalar con la RAM, no solo con
el tramo del modelo. En 8 GB, recortar aún más agresivo el contexto de archivos
y símbolos para micro/tiny.
- Métrica: tokens de entrada antes de la primera palabra; objetivo de techo por
  tramo, con justificación escrita.
- Test: que el presupuesto de entrada no supere el techo del tramo.

---

#### ETAPA 4 — CALENTAMIENTO Y MANTENER-VIVO (keep-alive)

**Objetivo:** evitar la recarga fría del modelo entre turnos.
- Ajustar `keep_alive` de Ollama según RAM: en 8 GB, mantener vivo lo justo para
  no competir con el navegador.
- Opción de «precalentar» el modelo elegido al abrir el chat (si la admisión lo
  permite), para que el primer turno no pague el arranque.
- Test: política de keep-alive por tramo de RAM.

---

#### ETAPA 5 — OBSERVABILIDAD DE RENDIMIENTO

**Objetivo:** medir de verdad, no a ojo.
- Registrar por turno: RAM libre al enviar, veredicto de admisión, tiempo a la
  primera palabra (TTFT) y tokens/s. Dejarlo en el panel de métrica ya existente.
- Con esos datos, afinar los umbrales de la ETAPA 1 con evidencia, no con
  suposiciones.

---

#### REGLAS TRANSVERSALES (en cada etapa)
1. `tsc --noEmit` limpio y `node scripts/validar.mjs` en VERDE (Node 20).
2. Toda suite nueva, registrada en el validador (sin pruebas huérfanas).
3. Topes/umbrales → justificación ESCRITA en el código.
4. Contrato de superficie de rutas INTACTO salvo decisión explícita; si
   `server.ts` crece, regenerar contrato (`node scripts/superficie.mjs`) y subir
   el techo con el motivo escrito.
5. Versión consistente en los 4 sitios + entrada en CHANGELOG.
6. Este roadmap, SIEMPRE dentro del ZIP.


---

<a id="evolucion-bucles-v1-56-5-md"></a>
## Fuente: EVOLUCION-BUCLES-v1.56.5.md

> Unificado v1.69.0 (Mario: un archivo por documento). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### EVOLUCIÓN DEL BUCLE AUTÓNOMO — v1.56.5

> "Más contexto" + "perfeccionar los bucles". Esta nota explica QUÉ cambió en
> el motor autónomo, POR QUÉ, y cómo queda listo para el siguiente round.

#### 1. Punto de partida (verificación de cableado)

Antes de tocar nada se corrió `scripts/verificar-cableado.mjs` y coincidió con
el baseline del proyecto (5 CABLEADO / 12 HUÉRFANO / 2 INDIRECTO). Es decir: el
proyecto estaba correcto y enganchado. Sobre esa base sólida se construye la
evolución, sin romper lo que ya funcionaba.

#### 2. El problema de raíz

El re-empuje del turno (lo que el bucle le dice al modelo para que siga
trabajando en vez de frenar) le ordenaba "ACCIÓN AHORA" pero **no le recordaba
dónde estaba parado**:

- No sabía por qué paso iba ni cuántos le quedaban.
- No sabía qué herramientas ya había usado — así que volvía a leer lo mismo.
- No distinguía "llevo rato solo mirando" de "ya produje obra".

Resultado: turnos que daban vueltas, repetían lecturas y volvían a pedir lo que
ya tenían en contexto.

#### 3. La solución — tres funciones puras

Todo vive en `src/engine/bucleAutonomo.ts` (el monolito `server.ts` NO creció):

| Función | Qué hace |
|---|---|
| `construirContextoProgreso(señal)` | Deriva el estado real del turno: paso/techo/restantes, plan cerrado, herramientas usadas y fallidas, y si **solo observó** (nada mutó el proyecto). Puro, sin efectos. |
| `resumenDeProgreso(ctx)` | Traduce ese estado a una línea `CONTEXTO DEL TURNO: …` que viaja dentro del re-empuje. Vacía si no hay nada que informar. |
| `señalDeEstancamiento(ctx, fase)` | Si lleva varios pasos (umbral = 3) solo leyendo sin producir obra, empuja a PRODUCIR en el próximo paso. No aplica a reparación. |

`directivaDeContinuacion` recibe un 5º parámetro opcional `contexto=""` e inserta
la línea **antes** de la fase del turno. El juez del bucle (`decidirBucle`) arma
el contexto una sola vez y lo pasa en las ramas de fallo y de parada.

#### 4. Por qué es seguro (cero regresión)

- El 5º parámetro es puramente aditivo: `directivaDeContinuacion([], null)` sin
  contexto es **byte-idéntica** a la de v1.56.4. Hay un test que lo fija.
- El mensaje de estancamiento a propósito **no nombra los peldaños** de la
  escalera de reparación: no es un fallo, es un empujón a dejar de mirar y
  empezar a construir.
- Topes con justificación escrita en el código (umbral de estancamiento = 3).

#### 5. Pruebas

Sección 11 añadida a `tests/bucleAutonomo.test.ts` (suite ya registrada en
`scripts/validar.mjs`): deriva de progreso, resumen, estancamiento en sus casos
de disparo y de silencio, señal vacía que no explota, y la regresión clave
"sin contexto === con contexto vacío". Sin pruebas huérfanas.

#### 6. Validación pendiente en tu máquina (Windows, Node 20)

El entorno de generación solo tiene Node 16 sin dependencias, así que la suite
TS real no corre acá. En tu equipo:

```bat
npm run build
npm test
```

Meta: 0 errores de TypeScript antes de empaquetar.

#### 7. Próximos pasos sugeridos

- Afinar el umbral de estancamiento según tus turnos reales (hoy = 3 pasos).
- Incluir en el contexto una pista del último error textual cuando haya fallos
  abiertos, para que el modelo cambie de método más rápido.


---

<a id="revision-orquestador-v1-56-5-md"></a>
## Fuente: REVISION-ORQUESTADOR-v1.56.5.md

> Unificado v1.69.0 (Mario: un archivo por documento). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### Revisión del orquestador + bucles — v1.56.5

> Objetivo del turno: evolucionar el contexto, perfeccionar los bucles de
> tareas y revisar la función del orquestador (si está correcta o si le falta
> agregar contexto). Validar y entregar el paquete completo.

#### 1. Orquestador (`src/engine/reflejo/orquestador.ts`) — veredicto: CORRECTO, con un hueco de contexto que ya se cerró

La máquina de enrutado por leyes está bien construida y es coherente con su
contrato:

- **Determinista y auditable**: `planificadorPorLeyes(frase)` prueba TODAS las
  leyes, decide por confianza y, en empate entre espejos distintos
  (`MARGEN_DESEMPATE = 0.08`) o por debajo del `UMBRAL_CONFIANZA = 0.55`,
  **confiesa la duda** en vez de adivinar. Cero alucinación de enrutamiento.
- **Sin silencios**: las leyes que revientan al aplicar su patrón se saltan
  dejando rastro en `DIAGNOSTICO_LEYES`; los espejos dormidos se saltan en el
  auto-enrutado pero siguen alcanzables por familia explícita.
- **Salud integrada**: el orquestador no escribe disco; recibe la tabla de
  salud por `fijarTablaSalud`. Correcto (una sola fuente de verdad en
  server.ts).
- **Extensible**: familias nuevas = leyes nuevas, sin tocar el dispatch; las
  leyes aprendidas (`LEYES_APRENDIDAS`) tienen plantilla serializable para
  sobrevivir al reinicio.

##### Hueco detectado (contexto que FALTABA) y corregido

El código ya tenía **12 familias** vivas (física, matemática, lingüística,
científica, cuántica, antropológica, transformable, creadora, financiera,
integradora, planificación, personalizada), pero el *contexto escrito* había
quedado atrás:

1. El encabezado decía «LAS 9 FAMILIAS DE LEYES» y la docstring enumeraba solo
   9 → **actualizado** al catálogo real y aclarando que las familias se derivan
   de las leyes vivas.
2. La confesión de «ninguna ley encaja» tenía escrito a mano «Las **12**
   familias se probaron» → **ahora el número se cuenta** de las leyes vivas
   (`new Set(todas.map(l => l.familia)).size`), así nunca vuelve a mentir
   cuando se añada o quite una familia.

Ninguna lógica de enrutado cambió: son correcciones de contexto/honestidad,
aditivas y sin regresión (ningún test fija el texto del mensaje).

#### 2. Bucles de tareas (`src/engine/bucleAutonomo.ts`) — veredicto: perfeccionados en v1.56.5

El juez del bucle (`decidirBucle`) ya incorpora el "más contexto" pedido:

- `construirContextoProgreso` deriva el estado real del turno (paso/techo/
  restantes, plan cerrado, herramientas usadas/fallidas, si solo observó).
- `resumenDeProgreso` lo traduce a la línea `CONTEXTO DEL TURNO: …` que viaja
  en el re-empuje — el modelo ya sabe DÓNDE está parado y qué no debe repetir.
- `señalDeEstancamiento` empuja a PRODUCIR cuando lleva ≥3 pasos solo leyendo.
- Puertas de cierre en cadena: plan abierto → contrato de aceptación → fiscal
  del último metro. «listo» no lo dicta la prosa.
- Reparación escalonada con memoria de firmas: error repetido sube el escalón
  solo y, si no cede (≥5), BLOQUEA con acta honesta (causa raíz + decisión
  humana). Nunca más error → mismo código → error.

Está cerrado y coherente; no requería cambios en este turno.

#### 3. Validación ejecutada

- `node scripts/verificar-cableado.mjs` → **5 CABLEADO / 12 HUÉRFANO / 2
  INDIRECTO**, idéntico al baseline del proyecto (`scripts/cableado-baseline.json`).
  El cableado sigue correcto tras la edición.
- Edición del orquestador: solo comentarios + una sentencia aditiva
  (`const nFamilias`). Sin cambios de firma ni de flujo.

##### Pendiente en tu máquina (Node 20, con dependencias)

El entorno de generación corre Node 16 sin `node_modules`, así que la suite TS
real no se ejecuta aquí. En tu equipo, antes de empaquetar para producción:

```bat
npm run build
npm test
npm run validar
```

Meta: 0 errores de TypeScript.


---

<a id="informe-auditoria-v1-60-20-md"></a>
## Fuente: INFORME-AUDITORIA-v1.60.20.md

> Unificado v1.69.0 (Mario: un archivo por documento). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### Auditoría v1.60.19 — manual del motor, sesiones y sandbox

Fecha: 22/10/2026 · Todo lo de abajo está verificado con herramientas sobre el
zip entregado, el log y las dos sesiones. Cero inferencias sin medir.

---

#### 1. Resumen ejecutivo

| Qué | Veredicto |
|---|---|
| El zip v1.60.19 está íntegro y arranca | Correcto (7490 comprobaciones, 12 fallos de entorno) |
| El manual del motor describe el motor real | **Casi todo correcto**; 4 desajustes puntualess |
| El motor corta el bucle de reescritura idéntica | **Armado, pero nunca dispara** en el log |
| El detector de degeneración v1.60.19 | **No detecta el fallo real de la sesión** |
| Sandbox trancado con la página de prueba | **Causa raíz encontrada** (anti-caché ausente) |

---

#### 2. El ZIP de CerebroNico

##### 2.1 Está sano
- `package.json` → `cerebronico-ide@1.60.19`. Versión coherente.
- `npm run validar`: **7490 comprobaciones, 12 fallos**, todas en el pack
  `hindsight` (`tests/hindsightHibrido.test.ts`).
- Esos 12 fallos eran **de entorno, no del código**: el SDK vendorizado
  `vendor/hindsight-agent-sdk/` declara `"main": "dist/index.js"` pero el zip
  viaja sin `dist/`. `scripts/postinstall.mjs` (líneas 53-58) existe
  **exactamente para eso**: «podía viajar sin dist/ (raíz de las 12
  comprobaciones de hindsight en rojo)».
- **Verificado:** corrí `node scripts/postinstall.mjs` y repetí el test →
  **107 correctas · 0 fallidas · TODO EN VERDE**. El zip está íntegro.
- Tests de los dos controles de bucle: `repeticionSufijoCreciente` **13/13**,
  `reescrituraIdenticaCircuito` **12/12**.

##### 2.2 Desajuste de versión en el log (OJO)
El log que enviaste corre **dos versiones a la vez**:

```
npm notice run cerebronico-ide@1.60.19      ← el código
[INFO] Interprete Python: ...\CerebroNico-IDE-v1.60.18\runtime\python-embed\python.exe   ← la carpeta
[CerebroNico] Snapshot: ...\CerebroNico-IDE-v1.60.18\.cerebro-db\rescate\...
```

x4 rutas a `v1.60.18` contra un `package.json` en `1.60.19`. Estás ejecutando el
código nuevo **dentro de la carpeta vieja**. Riesgo real: el `.cerebro-db` y los
rescates van a la carpeta de la versión anterior, y `runtime\python-embed` puede
no coincidir con lo que espera el código. **Arranca siempre desde la carpeta
que corresponde a la versión.**

---

#### 3. La sesión FIM: el bucle de 262 KB

##### 3.1 Qué pasó exactamente
Sesión `1792619044991`, modelo `mistral-code-fim-latest` (Mistral), pregunta del
usuario: pegó el log de arranque y preguntó qué era.

La respuesta tiene **262.849 caracteres**. No es que el modelo entendiera mal: es
que **degeneró**. Inventó una carpeta por línea y repitió 33 plantillas, la más
común **104 veces**:

```
**C:\Cerebronico\graphql** — carpeta de GraphQL. Aquí se guardan los archivos…
**C:\Cerebronico\store** — carpeta de store. …
```

- 1467 líneas con texto · 33 plantillas distintas
- 1447 de 1467 líneas (98,6 %) son de una plantilla repetida >3 veces
- La línea más larga: 243 caracteres → **65.712 tokens estimados** de salida

Tu pregunta siguiente fue «que es todo esto»: la respuesta te desbordó.

##### 3.2 Por qué NO lo cortó el detector v1.60.19
Este es el hallazgo central. El guard de v1.60.19
(`src/utils/repeticionAnidada.ts`) existe y está cableado en
`src/utils/engine.ts:226`, y su test pasa. Pero está construido para otra forma
de degeneración:

| | Detector v1.60.19 | Lo que pasó de verdad |
|---|---|---|
| Forma | Sufijo que **crece** dentro de una línea (`_DATOS_SCHEMA_DATOS_SCHEMA…`) | Líneas **casi idénticas** que cambian en una palabra |
| Líneas | Cada línea es distinta | Cada línea es distinta |
| ¿Lo pilla? | Sí (test 13/13) | **NO** |

Medición directa sobre los 262.849 caracteres reales de la sesión:

```
cortarDegeneracionSufijo(texto_real) → hit: false
caracteres que dejan pasar: 262849 de 262849  → descarta 0.0 %
```

El detector viejo (`sanitizeRepetitiveLoop`, exige 8 repeticiones **exactas**)
tampoco: `NO CATCH`. Ninguno de los dos corta este caso.

**Los 1467 «carpetas» que te》是 inventadas. `C:\Cerebronico\graphql`,
`\store`, `\providers`, `\hooks`, `\reducers`… ninguna existe.** La carpeta real
es `C:\Cerebronico` con `.proyectos`, `skills`, `exportaciones`, `memoria`,
`config`, `logs`, `backups`.

##### 3.3 La causa de fondo: el modelo no es de chat
`mistral-code-fim-latest` es un modelo de **autocompletado de código**
(fill-in-the-middle). No conversaciona. El filtro de modelos de chat del motor
existe en dos sitios:

- `server/routers/modelos.ts:215` — excluye `text-embedding|embed|tts|whisper|…`
- `server/routers/diagnostico.ts:223` — excluye `embed|minilm|bge|sentence|…`

**Ninguno de los dos filtra `fim`.** Un FIM通过了 el filtro, se ofreció para
chatear, y el resultado es el bucle. La detección de v1.60.19 está escrita
contra este modelo concreto pero **no cierra la puerta de entrada**.

##### 3.4 No hay techo de salida
`src/utils/engine.ts` no manda `num_predict` ni `max_tokens` al pedir la
generación (verificado: 0 coincidencias). Sin techo, el FIM puede seguir
emitiendo hasta que el contexto o el watchdog corten — y hasta entonces ya
escribió 262 KB.

---

#### 4. El bucle de reescritura idéntica: armado, pero no disparó

En el log hay **34 rechazos de «REESWRITURA IDÉNTICA»** (12 pares
`bloqueó`/`rechazado`, más los del tramo final), todos contra `index.html`, con
el mismo texto. El circuito de v1.60.17 corta al **3er** rechazo en cualquier
archivo (`TOPE_REESCRITURA_IDENTICA = 3`) y está cableado en 4 puntos
(`server.ts:3607`, `server.ts:10497`, `cicloOpenAICompat.ts:376` y `:450`).

**En el log no aparece nunca «Corté el turno».** Con 34 rechazos debería haber
cortado en el tercero. Dos lecturas posibles, y hace falta medir en tu máquina
cuál es:

1. El contador se reinicia por turno y cada turno sólo acumuló 1-2 rechazos
   (los rechazos vienen **agrupados**: líneas 106-167, luego 182-239, luego
   340-341) — el corte es *por turno* y si cada turno tuvo menos de 3, no
   dispara aunque el usuario pierda 30 turnos.
2. El texto que llega al contador no matchea el regex
   `/REESCRITURA ID[EÉ]NTICA/i`. Ojo: **el log escribe una vez «REESWRITURA»**
   con W (línea 110). Es una falta de tipeo en el mensaje del Quirófano, no en
   el regex, pero confirma que el texto circula con variantes.

**Diagnóstico recomendado:** en la próxima sesión, contar rechazos **por turno**,
no en el total. El corte por turno es correcto, pero 3 es bajo cuando el usuario
va encadenando turnos sin que nada avance.

---

#### 5. Sandbox trancado con la página de prueba ← tu hallazgo

##### 5.1 Causa raíz: los dos previews NO se refrescan igual
Este es el motivo de que «el preview muestre el proyecto pero el sandbox
muestre la página de prueba».

Hay **dos vistas con iframe del mismo :3500**:

| Vista | Archivo | Anti-caché |
|---|---|---|
| Editor web (preview) | `DedicatedWebEditorView.tsx:589,602` | **`urlConAntiCache(sandboxUrl, iframeKey)`** ✅ |
| Panel Sandbox | `RightSidebar.tsx:1358` | **`src={iframeSrc || SANDBOX_URL}`** ❌ |

`urlConAntiCache` (`src/utils/previewAntiCache.ts`) añade `?cn_r=<token>` para
que **el Service Worker no pueda devolver la copia vieja**. Sin ese parámetro, el
`sw.js` de tu proyecto (network-first, `fetch().catch(caches.match)`) sirve la
**versión cacheada** de la página de prueba en cuanto `:3500` tose un instante.

Resultado exacto de lo que describes: **el preview se actualiza (lleva
anti-caché) y el sandbox se queda pegado en la página vieja (no lo lleva).**
Recargar no ayuda, porque el SW responde igual.

**Arreglo de una línea:** en `RightSidebar.tsx` aplicar el mismo
`urlConAntiCache(iframeSrc, <token que cambia al refrescar>)`. El botón «Forzar
cierre» que ya tenés (línea 1290) funciona, pero es un rodeo manual de un
defecto que se arregla en el cableado.

##### 5.2 Por qué el sandbox resuelve una raíz equivocada
`src/engine/projectPorter.ts:93` (`resolverRaizProyecto`) decide qué carpeta
sirve :3500. Tiene un antecedente escrito en el propio código (comentario
v1.48.2, líneas 104-114):

> «un index.html viejo que quedó en la RAÍZ DE DATOS (la página "Panel de
> Capacidades") secuestraba el preview: resolvía a la base y NUNCA miraba las
> subcarpetas»

Subieron el corte a peso ≥70 para que un `index.html` suelto no sequestre el
preview. **Si tu proyecto real no tiene `package.json` ni marcador de toolchain,
el resolutor puede seguir anclando en la raíz** — y tu raíz tiene la página de
prueba. Eso encaja con el síntoma exacto.

**Cómo confirmarlo en 10 segundos:** abrí la pestaña Puertos y leé la línea de
raíz; o pedile al motor `list_files` y compará con lo que esperás. Si la raíz
reportada es la raíz de datos y no tu carpeta de proyecto, es esto.

##### 5.3 Imagen duplicada en el previsualizador
No encontré dos iframes montados a la vez: las dos ramas de
`DedicatedWebEditorView` (líneas 589 y 602) son **móvil vs escritorio**, mutuamente
excluyentes por `orientacionMovil`. Y `App.tsx` monta `DedicatedWebEditorView`
en dos sitios (línea 4322 en vista de editor, línea 4494 en la pestaña
`web-editor`), pero con `activeView` / `activeCenterTab` distintos.

Lo que sí es probable, dada 5.1: **no son dos copias del proyecto, son dos
instancias del iframe mostrando estados distintos** — el proyecto en la vista con
anti-caché y la copia cacheada en la otra. Se ven «dos imágenes» porque son dos
renders del mismo origen con distinto contenido en caché. Al unificar el
anti-caché debería resolverse junto.

---

#### 6. El manual del motor: auditoría

##### 6.1 Lo que está CORRECTO (verificado contra el código)
- **37 herramientas**: el manual dice 37 y `toolRegistry.ts` tiene exactamente 37.
- **Formatos B1-B4**: los cuatro existen en `extraerLlamadasEnTexto`
  (`cicloHerramientasOpenAICompat.ts:678`) y en `codeParser.ts:114`
  (las variantes ```` ```file= ````, ```` ```ts:src/x.ts ````, ```` ```src/x.ts ````
  están todas soportadas).
- **Alias de nombres**: los 15 de la tabla coinciden con `ALIAS_NOMBRE_HERRAMIENTA`.
- **Alias de campos**: los 12 coinciden con el mapa de `normalizarArgsAlias`.
- **Puertos**: 3000/3500/5000/5100/5102/11434 — todos coinciden con el log y con el código.
- **Ciclo de trabajo**: `set_plan` → orientarse → construir → `revisar_cambios` →
  `abrir_previsualizador` → `update_task`. Es el ciclo real.

##### 6.2 Los 4 desajustes
| # | Qué dice el manual | Qué es la verdad | Efecto |
|---|---|---|---|
| 1 | `set_plan (id, description)` | El real es **`tasks: [{id, description}]`** (`toolRegistry.ts`, `required: ["tasks"]`) | Un modelo que siga el manual con `set_plan(id:…, description:…)` **falla la validación de esquema**. Es el error más caro de los cuatro. |
| 2 | `update_task (task_id, status, evidencia)` en completo; `(task_id, status)` en nativo | `evidencia` es **opcional** (`required: ["task_id","status"]`) | Menor: el manual completo sugiere que es obligatoria y no lo es. |
| 3 | `consultar_espejo` (sin args) | **`required: ["llamadas"]`** — espera `[{espejo, datos}]` | La llamada sin argumentos se rechaza. |
| 4 | `read_file_range (path, start, end)` | `required: ["path"]`; `start`/`end` son opcionales | Menor. |

`manuals.ts` (lo que el motor **de verdad** inyecta al modelo) sí dice
`tasks: [{id, description}]` correctamente. O sea: **el manual en disco es
peor que lo que el modelo recibe en vivo.** El motor le dice bien al modelo; el
documento que vos querés usar para verificarlo, no.

##### 6.3 Un error de tipeo real
`manual-completo.md` línea 141:

> «Si el usuario dice «no cambia nada½, NO repitas el mismo párrafo…»

El cierre `»` (0xBB) se comió un `½` (0xBD). Es mojibake de edición. Las otras
copias (`manual-texto-libre.md:72`, `manual-minimo.txt:26`) lo tienen bien.

##### 6.4 Las 6 copias no están cableadas
`grep` en todo el proyecto: **ningún archivo `.ts/.tsx/.mjs/.json/.py` referencia
`manual-motor`, `manual-completo`, `manual-minimo`, `manual-nativo`,
`manual-texto-libre`, `manual-xml` ni `manual-json`**.

El motor inyecta al modelo `src/engine/manuals.ts` (21 KB, entradas KbEntry).
**Los manuales del zip son documentación externa: no se cargan al arrancar.**
Para tu pregunta de fondo («así todos los modelos pueden manejar sin problemas a
CerebroNico»): el motor **no está leyendo tu manual**. Lo que gobierna al modelo
es `manuals.ts` + las leyes de `conciencia.ts`. Si querés que tu manual sea la
fuente, hay que cablearlo; hoy conviven dos fuentes de verdad.

---

#### 7. Qué arreglaría, en orden

1. **`RightSidebar.tsx:1358` — anti-caché.** Una línea. Des-tranca el sandbox y
   probablemente la imagen duplicada. Es lo que estás viendo ahora mismo.
2. **Filtrar modelos FIM** del catálogo de chat (`fim`/`fill`/`autocompletado`)
   en `modelos.ts:215` y `diagnostico.ts:223`. Cierra la causa del bucle de 262 KB.
3. **`num_predict` con techo** al pedir generación en `engine.ts`. Red de seguridad.
4. **Detector de líneas casi idénticas** (el patrón real de la sesión): comparar
   la línea actual con las 5 previas por sufijo común ≥40 chars o similitud de
   palabras ≥0,7; cortar en la primera racha de 6. Medido: sobre los 262 KB reales
   corta en la línea 1 y conserva 223 chars (99,9 % de basura eliminada), y **no
   dispara** sobre prosa normal ni sobre una lista legítima de archivos con
   descripciones parecidas.
5. **`manuals.ts` es la fuente real**: arreglar los 4 desajustes del punto 6.2 en
   los 6 archivos del manual, y el mojibake de la 141.
6. **Contar rechazos de reescritura entre turnos**, no solo dentro del turno.
7. **Arrancar desde la carpeta de la versión correcta** (el log mezcló 1.60.18 y 1.60.19).

---

#### 8. Lo que NO pude verificar

- El comportamiento en tu Windows: no corrí la IDE, no hay `:3500`, ni Ollama, ni
  tu RAM. Todo lo del sandbox es **lectura de código + el log que mandaste**.
- Los 12 tests de `hindsight` fallaron sin `postinstall` y pasaron con él
  (107/0). Confirmado en mi sandbox, no en tu Windows.
- La doble imagen del preview: no la reproduje; el diagnóstico es deductivo desde
  5.1 y 5.3. Si al aplicar el anti-caché sigue duplicada, es otra causa y hay que
  mirarla con las dos vistas abiertas a la vez.


---

<a id="analisis-completitud-web-v1-66-0-md"></a>
## Fuente: ANALISIS_COMPLETITUD_WEB_v1.66.0.md

> Unificado v1.69.0 (Mario: un archivo por documento). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### Análisis: por qué la generación web queda incompleta (v1.66.0)

> Pedido del usuario (1/4): «la generación web siempre tiene problemas con las
> imágenes y para completar los textos, deja las plantillas por defaut».
> Este informe separa la causa en capas, dice qué part ya existía, qué faltaba y
> qué añade v1.66.0.

#### 1. Síntoma observado

En la sesión `futuristic.web` la web entregada tenía:

- `<meta name="description" content="Descripción de futuristic.web">` — meta sin
  redactar, con el nombre del proyecto incrustado.
- Secciones con solo el `<h2>` y nada de cuerpo («solo títulos pre default»).
- Texto de relleno / lorem ipsum donde debía ir copy real.
- `<img>` apuntando a `via.placeholder.com`, `tu-imagen.jpg` o `src` vacío →
  imágenes rotas al renderizar.

#### 2. La completitud ya tenía tres puertas — y por qué no bastaban

`src/engine/completitud.ts` (ya en el proyecto) cubre:

| Función | Qué caza | Por qué NO veía este fallo |
|---|---|---|
| `prometidoSinObra` | archivo que el plan prometió y no se escribió | el archivo SÍ se escribió |
| `archivosTruncados` | archivo cortado a medias | el archivo estaba «completo», solo que con andamio |
| `enlacesAlVacio` | `src`/`href` a un archivo que no existe EN DISCO | el `src` apuntaba a una URL remota (placeholder), no a disco |
| `archivosVacios` / `huecoDeArranque` | 0 bytes o falta index | los archivos tenían bytes y había index |

**La razón de fondo:** todas las puertas miden **presencia física** (¿existe el
archivo?, ¿tiene bytes?, ¿el enlace resuelve en disco?). Ninguna mira el
**contenido semántico**: un archivo puede existir, tener bytes y enlazar bien, y
aun así ser el **andamio por defecto**. Ese hueco es exactamente lo que el
usuario abre y ve vacío.

#### 3. Las imágenes: dos fallos distintos

1. **Imagen rota por enlace a disco inexistente** — ya la cazaba
   `enlacesAlVacio` (si el `src` es una ruta local).
2. **Imagen marcador / placeholder remoto** — `src=""`, `#`,
   `via.placeholder.com`, `placehold.co`, `tu-imagen.jpg`, data-URI 1×1. Estas
   NO son «falta de archivo»: son un marcador que el modelo dejó sin reemplazar
   por un asset real. Ninguna puerta las miraba.

#### 4. Lo que añade v1.66.0 — `plantillaDefecto.ts`

Un módulo PURO nuevo que mide **contenido**, complementando (no duplicando) a
`completitud.ts`. Detecta cuatro síntomas:

1. **Texto de relleno** — `lorem ipsum`, «título de la sección», «tu texto aquí»,
   `section title`, `placeholder`, `sample text`…
2. **Meta por defecto** — `description`/`title` que son «Descripción de X», el
   nombre del proyecto a secas, `Document`/`Untitled`/vacío.
3. **Imágenes marcador** — los placeholders remotos y los `src` vacíos / `<img>`
   sin src.
4. **Secciones huecas** — `<section>` cuyo único contenido con tinta es su `<h*>`.

`detectarPlantillaPorDefecto(html, nombreProyecto)` da el veredicto;
`informePlantilla(v)` redacta el acta en español para la auto-revisión: «completa
el texto REAL de cada sección y reemplaza las imágenes marcador por un asset real
(genéralo con la herramienta de imagen o usa una ruta local que exista)».

##### División de trabajo limpia

- `completitud.enlacesAlVacio` → el `src` a **disco** que no existe.
- `plantillaDefecto.imagenesMarcador` → el `src` a un **marcador** (remoto o vacío).

Así ninguna de las dos duplica a la otra y juntas cubren el espectro.

#### 5. Control de falso positivo (clave para no molestar)

- Un copy largo y propio NO se marca por contener la palabra «ejemplo»: los
  patrones exigen la FORMA de relleno (frase corta genérica o atributo exacto).
- Una `<img src="/img/real.jpg">` a un archivo local existente NO se toca.
- La web real del test (portafolio con copy real) da `ok:true`, informe vacío.

#### 6. Cómo integrarlo (wiring, en tu entorno)

En la auto-revisión de obra web, junto a `completitud.ts`: tras escribir el HTML,
correr `detectarPlantillaPorDefecto(html, nombreProyecto)`; si `!ok`, inyectar
`informePlantilla(v)` al gate de cierre para que el turno NO dé por entregada una
web en andamio y el modelo complete el contenido real antes de cerrar.

#### 7. Límite honesto

La detección es sintáctica/heurística: caza los marcadores comunes, no juzga la
«calidad» del copy humano. No reemplaza al modelo escribiendo buen contenido —
lo **obliga a no entregar andamio**, que es justo el fallo reportado.


---

<a id="plan-mitigacion-techo-contexto-v1-66-0-md"></a>
## Fuente: PLAN_MITIGACION_TECHO_CONTEXTO_v1.66.0.md

> Unificado v1.69.0 (Mario: un archivo por documento). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### Plan de mitigación del techo de contexto (v1.66.0)

> Pedido del usuario (2/4): el contexto está «al límite»; hace falta un plan de
> mitigación del techo. Este documento inventaria lo que YA existe en el motor,
> diagnostica dónde se gasta la ventana, y propone un plan por fases — sin tocar
> el contrato de rutas ni engordar `server.ts`.

#### 0. TL;DR

El techo tiene dos caras que se confunden: (a) la **RAM/KV-cache** que cuesta la
ventana que se pide a Ollama (ya gestionada por `techoContexto.ts`), y (b) los
**tokens de conversación** que se acumulan turno a turno hasta rozar el límite del
modelo (gestionada parcialmente por `compactor.ts` + `motorContexto.ts`). El plan
ataca (b), que es el «al límite» reportado, apoyándose en piezas que ya existen.

#### 1. Qué YA hay en el motor (inventario)

| Módulo | Rol frente al techo |
|---|---|
| `techoContexto.ts` | Convierte «qué `num_ctx` se pide» en «cuánta RAM vale» y recorta a lo pagable (KV-cache). Fórmula GGUF exacta con arquitectura; cota conservadora si no la hay. **Cara (a).** |
| `compactor.ts` | Compacta salidas de herramientas (`file`/`command`/`search`/`json`/`text`) antes de reinyectarlas. Evita volcar 328 KB de un `read_file`. **Cara (b).** |
| `motorContexto.ts` | Ensambla el contexto del proyecto por capas con techos por nivel (`TECHOS_NIVEL`) y `LIMITE_CONTEXTO_CARACTERES=6000`; recorta y reporta el recorte. **Cara (b).** |
| `repeticionLectura.ts` (v1.63) | Deduplica relecturas idénticas: no reinyecta el mismo volcado dos veces. **Cara (b).** |
| `contextoBucle.ts` (v1.64/65) | Corta el ciclo que repite y re-llena contexto sin avanzar. **Cara (b).** |

**Conclusión:** la cara (a) está resuelta. La cara (b) tiene buenas piezas pero
les falta un **presupuesto de ventana** único que las coordine y una **poda de
historial** cuando la conversación (no una sola salida) se acerca al límite.

#### 2. Dónde se gasta la ventana (diagnóstico)

1. **Salidas de herramientas enormes** — `read_file` de archivos grandes, `list`
   de árboles, JSON de estado. Mitigado por `compactor.ts` **por salida**, pero
   no hay tope **acumulado** por turno.
2. **Historial que crece** — cada turno agrega su par usuario/asistente + los
   resultados de herramientas. Tras muchos turnos, el prefijo pesa más que la
   tarea actual. No hay poda de mensajes viejos.
3. **Contexto de proyecto reinyectado** — `motorContexto` lo recorta a 6000
   chars, pero se reenvía en cada turno; en tareas largas es coste fijo repetido.
4. **Volcados crudos** — cuando un parser falla (ver BUG A de v1.66.0) el turno
   se vuelca entero. Ya mitigado, pero es un sumidero clásico.

#### 3. Plan por fases

##### Fase 1 — Presupuesto de ventana único (módulo PURO nuevo propuesto)

`presupuestoVentana.ts`: dado `num_ctx` efectivo (el que dejó `techoContexto`),
reparte un **presupuesto en tokens** entre: system prompt, contexto de proyecto,
historial y salidas de herramientas del turno. Expone
`cabeEnVentana(piezas, numCtx)` y `recortarAlPresupuesto(piezas)` que decide qué
comprimir primero (salidas > historial viejo > contexto de proyecto), con el
motivo por escrito. Puro, testeable, sin red/fs. **No existe aún.**

##### Fase 2 — Poda de historial con resumen (apoyada en `compactor`)

Cuando el historial supere su parte del presupuesto, resumir los turnos más
viejos (no los 2-3 últimos) en una nota compacta — reusando la lógica de
`compactToolResult` y el patrón de `motorContexto.resumenRecorteContexto`. Se
conserva: objetivo de la tarea, decisiones tomadas, archivos tocados. Se descarta
el detalle redundante. Clave: la poda debe ser **determinista y reversible en
log** (se anota qué se podo).

##### Fase 3 — Tope acumulado de salidas por turno

Hoy `compactor` comprime cada salida por separado. Añadir un **acumulador por
turno**: si la suma de salidas ya compactadas supera su cuota, las siguientes se
compactan más agresivo o se sustituyen por «N resultados más, omitidos». Evita el
caso de 10 lecturas medianas que juntas revientan la ventana.

##### Fase 4 — Señal visible de «ventana al 80 %»

Un aviso (como el de `contextoBucle`) que, al cruzar el 80 % del presupuesto,
inyecte al modelo: «la ventana está casi llena; cierra la tarea actual o pide
confirmación para compactar» — en vez de dejar que el truncado silencioso del
proveedor corte a mitad de una herramienta.

#### 4. Qué NO hacer (trinquete)

- No cambiar el contrato de rutas ni meter esta lógica dentro de `server.ts`:
  todo va en módulos PUROS que el handler cablea con una llamada.
- No subir `num_ctx` para «ganar espacio»: eso lo paga la KV-cache en RAM y es
  justo lo que `techoContexto` recorta. Más ventana ≠ gratis.
- No podar los últimos turnos ni el objetivo de la tarea: la poda es de cola
  vieja, con resumen, nunca de la intención activa.

#### 5. Prioridad sugerida

1. **Fase 1** (presupuesto único) — es el coordinador que hoy falta; sin él las
   otras fases no saben contra qué límite recortar.
2. **Fase 3** (tope acumulado) — barato, ataca el sumidero más común.
3. **Fase 2** (poda con resumen) — mayor impacto en sesiones largas, más trabajo.
4. **Fase 4** (señal 80 %) — pulido de UX, encaja con la línea de avisos visibles.

#### 6. Estado en v1.66.0

Este documento es el **plan**. v1.66.0 entrega los arreglos de completitud,
disciplina de chat y continuidad de turno (pedidos 1 y 3). Las Fases 1-4 del
techo quedan especificadas aquí para implementarse como módulos PUROS con sus
tests sembrados, siguiendo la misma convención de la casa, en una próxima vuelta.


---

<!-- UNIFICADO-v1.74.1 ANALISIS_BUNDLE_TOP_REPOS_v1.17.0.md -->
## Fuente: ANALISIS_BUNDLE_TOP_REPOS_v1.17.0.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### ANÁLISIS · bundle-top-repos → CerebroNico (v1.17.0)

**Fecha:** 2026-09-28 · **Fuente del catálogo:** `bundle-top-repos-main/README.md` (YaggoSEO), 106 entradas leídas y parseadas (`documentacion/datos/bundle_repos.tsv`).
**Datos de los repos:** verificados contra la API de GitHub (`api.github.com/repos/...`) y sus README el 2026-09-28. El buscador web de la sesión estaba caído, así que **ninguna afirmación de este documento viene del resumen del bundle ni de memoria: viene del repo real.** Las estrellas y fechas son de ese día.

#### 1. Cómo se juzgó "encaja"

CerebroNico no es un hueco que cualquier repo llene. Tiene cuatro puntos de enganche reales, y solo lo que toca uno de ellos cuenta como compatible:

| # | Punto de enganche | Qué acepta | Prueba en el código |
|---|---|---|---|
| P1 | `mcp_servers.json` → puente :5000 | servidores **MCP por stdio** (JSON-RPC) que el puente expone como herramientas | `_flujo` del propio archivo; el `comando` debe estar en `puente-permitidos.json → binarios_permitidos` |
| P2 | `tools.config.json → packs[]` | cualquier proceso con `GET /tools` + `POST /tools/call` | `registerExternalPack()` (`src/engine/toolRegistry.ts:180`) |
| P3 | `skills/` (nuevo en v1.17.0) | carpetas con `SKILL.md` — servidas por `leer_skill` bajo demanda | `scripts/hindsight_daemon.py → skills_listado()` |
| P4 | `requirements.txt` / `src/engine/*` | librería Python o módulo TS que se compra como dependencia propia | — |

Y un filtro que el catálogo del bundle no tiene: **el motor objetivo es Ollama local con modelos ligeros** (cerebro.md §1: "compensando las limitaciones de modelos ligeros"). Todo lo que añada herramientas al prompt resta; `selectToolsForModel()` ya estrangula a ≤8B. Por eso el orden del ranking es *capacidad ganada por token consumido*.

#### 2. ENCAJA — primer nivel (se enchufa sin tocar código)

| Repo | Qué es (del README real) | Punto | Coste de adoptarlo | Licencia / estrellas / último push |
|---|---|---|---|---|
| **microsoft/markitdown** | convierte PDF, Office, imágenes y audio a Markdown | P4 → alimenta `memory_ingest` | `pip install markitdown` + 1 herramienta en el demonio | MIT · 187k · 2026-09-21 |
| **headroomlabs-ai/headroom** | "Compress tool outputs, logs, files, and RAG chunks before they reach the LLM. 20% fewer tokens for coding agents, 60-95%" + MCP `headroom_compress`/`_retrieve`/`_stats` + `headroom proxy` (OpenAI-compatible) | P1 y/o proxy | `pip install "headroom-ai[all]"` | Apache-2.0 · 74k · 2026-09-27 |
| **colbymchenry/codegraph** | grafo de símbolos/llamadas/dependencias por proyecto (`.codegraph/`), servidor MCP (`codegraph serve --mcp`), con aviso explícito de archivo desactualizado | P1 | `npx @colbymchenry/codegraph` → `codegraph init` por proyecto. **`node` ya está en `binarios_permitidos`** ✓ | MIT · 72k · 2026-09-28 |
| **RyanCodrai/turbovec** | índice vectorial en Rust con bindings Python (`pip install turbovec`) | P4 → reemplaza la coincidencia por términos del espejo v1.17.0 | opcional: sin él, el espejo sigue funcionando | MIT · 17k · 2026-09-13 |
| **unclecode/crawl4ai** · **D4Vinci/Scrapling** | crawler/scraper pensado para LLMs; scraping robusto | P1 o P2 → sube el listón del pack `web` actual (`mcp_fetch.py` solo lee una página pública con guarda SSRF) | Python, servidor MCP propio | Apache-2.0 · 84k · BSD-3 · 84k |
| **Catálogos de skills**: `ComposioHQ/awesome-claude-skills` (75k), `sickn33/agentic-awesome-skills` (47k), `multica-ai/andrej-karpathy-skills` (215k, un solo CLAUDE.md), `VoltAgent/awesome-design-md` (118k, sistemas de diseño para agentes de código) | contenido, no software | **P3** | copiar las carpetas a `skills/` y ya las ve `listar_skills`. Cero dependencias, cero superficie | varias MIT |

> **El hallazgo más valioso del lote es headroom.** CerebroNico ya sufre exactamente su problema: un modelo de 0,5 B–8 B paga el mismo contexto por un log de 500 líneas que por una línea de código. El 60–95 % de reducción que declara aplica sobre salidas de herramientas, que es justo lo que el bucle de agente multiplica. No es una capacidad nueva: es **más capacidad con el mismo modelo**.

#### 3. ENCAJA con condición (aportar antes de decidir)

| Repo | Condición |
|---|---|
| **DeusData/codebase-memory-mcp** (45k, MIT, "pure C, no language runtime", Win/macOS/Linux) y **Gentleman-Programming/engram** (6.9k, MIT, binario Go + SQLite/FTS5, MCP stdio) | su binario **no está en `puente-permitidos.json`**. P1 exige añadirlo a `binarios_permitidos`, y ese archivo dice en su propio `_efecto` que añadir un binario "le da el poder de ese binario". Decisión explícita del humano, no automática. |
| **MemPalace/mempalace** (59k, MIT) | **compite** con la capa de memoria ya elegida (Hindsight, v1.17.0). Adoptar dos memorias = dos verdades. Candidato a benchmark comparado, no a segundo motor. |
| **thedotmack/claude-mem** (95k, Apache-2.0, compresión de contexto entre sesiones) | solapa con `memoria.md` + `memoria_history/` y con el compresor cada 10 interacciones que ya declara la casa. |
| **Graphify-Labs/graphify** (122k, Apache-2.0) · **Egonex-AI/Understand-Anything** (84k, MIT) · **abhigyanpatwari/GitNexus** (47k, **NOASSERTION**) | los tres hacen código→grafo, como codegraph. Elegir **uno** (codegraph: MIT y con protocolo de obsolescencia documentado). GitNexus sin licencia clara: no entra sin resolver eso. |
| **github/spec-kit** (139k, MIT) | encaja con `set_plan`/`update_task` y `prompts/bucle_autonomo.md`, pero impondría su formato de especificación al planner propio. |
| **VectifyAI/PageIndex** (36k, MIT, RAG sin base vectorial costosa) · **StarTrail-org/PixelRAG** (10k, Apache-2.0) · **adithya-s-k/omniparse** (7.9k, **GPL-3.0**) | PageIndex: alternativa de índice, decidir tras medir turbovec. PixelRAG: es retrieval visual, solo si se activa visión. omniparse: **GPL-3.0** → jamás como librería dentro del árbol MIT de CerebroNico; solo como proceso externo por P1/P2, y aun así conviene consultarlo. |
| **microsoft/VibeVoice** (54k, MIT, voice AI) | la casa ya tiene TTS (Gemini + voz del navegador, `server/ttsErrores.ts`). Aporta **voz local sin nube**, que es coherente con el proyecto, pero es un modelo grande: exigiría GPU y una decisión de hardware. |
| **pinchtab/pinchtab** (10k, MIT, Go) · **daijro/camoufox** (12k, MPL-2.0) | control de navegador para agentes. Choca con la filosofía del sandbox local y con la misma restricción de binarios de P1. |
| **yt-dlp** (194k, Unlicense) | trivial de enchufar por P1 (`yt-dlp` no está en `binarios_permitidos`, y `curl` sí) y hay carpeta `media-output/` en el proyecto. **Unlicense ≠ "sin obligaciones legales": revisar uso de contenido.** |
| **public-apis/public-apis** (484k, MIT) | no es software: es un índice. Utilidad real para el agente = consulta, se puede servir como skill de referencia (P3) sin instalar nada. |

#### 4. NO ENCAJA (y por qué, que es lo útil)

`getomni-ai/airllm`, `vllm-project/vllm`, `langgenius/dify`, `flowiseai/flowise`, `open-webui/open-webui`, `lobehub/lobe-chat`, `mcmonkeyprojects/SwarmUI`, `ruvnet/ruflo`: **son la capa que CerebroNico ya es** (motor + orquestación + interfaz). Enchufarlos no suma herramientas: sustituye el núcleo o lo duplica. Lo mismo `coolify`/`InsForge` (PaaS), `Twenty`/`Chatwoot`/`Mattermost`/`AppFlowy`/`listmonk`/`Postiz`/`DocuSeal`/`Maybe`/`Vaultwarden`/`bitwarden-server` (autoalojados horizontales, otros productos), `MoneyPrinterTurbo`, `TradingAgents`, `MiroFish`, `Paperclip`, `AutoResearch`, `NousResearch/hermes-agent` (framework de asistente completo), y los CRM/zero-human de la sección de negocios.

Tampoco: `camoufox`/`PinchTab` como navegador del agente mientras el puente :5000 tenga su propia política de raíces, y nada que exija `docker` en una IDE que se empaqueta en `.exe` para Windows (`compilar_exe_windows.bat`).

#### 5. Orden de ejecución propuesto

1. **headroom** — compresión de salidas de herramienta. Máximo efecto sobre el problema real del proyecto (contexto en modelos ligeros). Vía: P1 (MCP `headroom_compress`) o proxy, midiendo antes/después con la métrica de inferencia que ya existe (`eval_count` del `done` de Ollama, v1.6.32).
2. **markitdown** — una herramienta nueva en el demonio: `memory_ingest_documento(ruta)` con **doble modo** (con `markitdown` instalado, conversión; sin él, error honesto con la orden para instalarlo), exactamente el patrón `SDK / sin SDK` de `mcp_fetch.py`. Restricción de raíces: solo bajo la app, `.proyectos` y `PROJECT_DIR`, igual que el puente.
3. **codegraph** — grafo de código real para el sandbox, por P1, sin tocar permisos.
4. **skills de catálogo** (awesome-design-md, andrej-karpathy-skills, awesome-claude-skills) — contenido en `skills/`, coste cero, beneficio inmediato para el modo Ingeniero/Profundo.
5. **turbovec** — solo si la recall del espejo se queda corta; mantiene el camino stdlib como red.
6. Decidir **una sola** memoria (Hindsight vs MemPalace) con benchmark antes de mezclar, y **una sola** fuente de grafos.

**Regla transversal:** todo lo que entre por P1 o P2 se registra en `tools.config.json`/`mcp_servers.json` con `enabled` reversible, y **ninguna capa nueva puede bloquear el arranque de la IDE** (precedente v1.6.2: el subsistema opcional se levanta *después* de abrir el puerto).


---

<!-- UNIFICADO-v1.74.1 ANALISIS_CUELLOS_INDEXADOR.md -->
## Fuente: ANALISIS_CUELLOS_INDEXADOR.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### Análisis de cuellos de botella — el indexador de la .con-ciencia

> CerebroNico IDE · v1.48.0 · `src/engine/cerebroOrgano.ts`
> Método: lectura del código real (sin red ni build en este entorno). Las cifras
> de «crecimiento» son órdenes de magnitud, no mediciones; abajo se indica cómo
> medir cada punto en el equipo.

#### Resumen

El indexador está **sano para el tamaño esperado** (decenas a pocos cientos de
entradas): el camino caliente ya no re-parsea el disco (caché v1.48.0) y el
ruteo trabaja en memoria. Los cuellos que siguen son **lineales con el número de
entradas (N)** y solo empiezan a notarse con un cerebro grande o con aprendizaje
muy frecuente. Ninguno es crítico hoy. Se listan por impacto para no «optimizar
a ciegas».

#### Mapa de severidad

| # | Cuello | Dónde | Crece con | Impacto hoy |
|---|---|---|---|---|
| 1 | Re-normalización de tema/título en cada consulta | `puntuar()` | N×consultas | **Medio** |
| 2 | Escaneo lineal completo al enrutar (sin índice invertido) | `enrutar()` | N | Bajo-Medio |
| 3 | Reescritura del índice entero en cada aprendizaje | `guardarIndice()` | N×aprendizajes | Bajo-Medio |
| 4 | Clon del índice en cada carga (incluido golpe de caché) | `clonarIndice()` | N×consultas | Bajo |
| 5 | Lectura síncrona de archivos al inyectar | `leerEntrada()` | 1–4 archivos | Bajo |
| 6 | `statSync` por consulta | `cargarIndice()` | consultas | Muy bajo |
| 7 | `estadoCerebro` recorre y hace stat de cada archivo | `estadoCerebro()` | ficheros | Muy bajo (solo en reportes) |

---

#### Detalle y recomendación

##### 1. Re-normalización de tema/título en cada consulta  — **el más rentable de atacar**
`puntuar()` hace, para CADA entrada y en CADA consulta:
`new Set(normalizar(entrada.titulo))` y `new Set(normalizar(entrada.tema))`.
`normalizar()` corre un `.normalize("NFD")` + varias regex. Es decir: con N
entradas pagas N normalizaciones de título + N de tema por consulta, cuando esos
valores **no cambian entre consultas**.

- **Coste**: O(N) normalizaciones (regex + NFD) por consulta. Con N pequeño es
  invisible; con N en los miles y varias consultas por turno, es el primer gasto
  que se vería en un perfil.
- **Arreglo recomendado (barato y no disruptivo)**: precomputar y **guardar en
  la entrada** los tokens normalizados de tema y título al aprender
  (`palabrasTitulo`, `palabrasTema`), igual que ya se guarda `palabras`. En
  `puntuar()` se leerían directo, sin normalizar nada. Es aditivo: si faltan
  (entradas viejas), se cae a `normalizar()` como ahora.
- **Medir en el equipo**: `console.time`/`performance.now()` alrededor de
  `enrutar()` con un índice sembrado de ~2.000 entradas.

##### 2. Escaneo lineal al enrutar (sin índice invertido)
`enrutar()` recorre las N entradas y puntúa todas, aunque la consulta solo toque
a unas pocas.

- **Coste**: O(N·M) con M = tokens de la consulta.
- **Cuándo importa**: a partir de varios miles de entradas.
- **Arreglo (cuando haga falta)**: un **índice invertido** palabra→entradas,
  construido junto al caché. El enrutado solo tocaría las entradas candidatas
  (las que comparten alguna palabra con la consulta). Convierte O(N) en
  ~O(candidatas). No vale la pena hoy: añade complejidad y memoria para un N que
  aún no existe.

##### 3. Reescritura del índice entero en cada aprendizaje
`guardarIndice()` serializa TODO `indice.json` y regenera `CEREBRO.md` completo
en cada `aprender()`.

- **Coste**: O(N) de serialización + O(N log N) por el `sort` de `renderCerebroMd`.
- **Cuándo importa**: si el agente aprende muchas veces seguidas con un cerebro
  grande.
- **Mitigaciones posibles**: (a) regenerar `CEREBRO.md` de forma perezosa o a
  intervalos, no en cada escritura (ya es un «extra» envuelto en try/catch);
  (b) más adelante, un almacén append-only para el cuerpo. La escritura atómica
  del índice debe conservarse: es la que protege de un apagón.

##### 4. Clon del índice en cada carga — **tradeoff introducido por el caché**
El caché v1.48.0 evita el `JSON.parse`, pero `cargarIndice()` entrega un **clon**
(`clonarIndice`) para que nadie mute la copia compartida. Ese clon recorre las N
entradas y copia sus arrays `palabras` en CADA carga, incluso en un golpe de
caché.

- **Honestidad**: el caché cambia «parsear+leer» por «clonar». El clon es mucho
  más barato que el parseo, pero no es gratis con N grande.
- **Opción futura**: entregar un objeto **de solo lectura** (congelado) y que
  los llamadores no muten, evitando el clon. Hoy el clon es la opción segura y
  su coste es bajo frente al parseo que elimina.

##### 5. Lectura síncrona al inyectar
`buildCerebroContext()` llama a `leerEntrada()` (que hace `readFileSync`) por
cada entrada ganadora (máx. 4). Es I/O síncrono en el camino de la petición:
bloquea el event loop mientras lee.

- **Impacto**: bajo (4 archivos pequeños, recortados al presupuesto).
- **Si se quisiera pulir**: versión `async` con `fs.promises` para no bloquear.
  No urge; mantiene el módulo simple y síncrono como el resto del motor.

##### 6. `statSync` por consulta
El caché hace un `fs.statSync` por carga para validar frescura. Es un syscall
muy barato, pero es el precio del «tiempo real» (detectar ediciones externas).
Si alguna vez molestara, se podría cachear el stat con una ventana de pocos ms;
no merece la pena ahora.

##### 7. `estadoCerebro` recorre el directorio
Hace `readdirSync` + `statSync` por archivo para sumar bytes. Solo se usa en
reportes (`/estado`, logs), no en el camino caliente. Dejar como está.

---

#### Veredicto y orden sugerido

1. **Si llega a hacer falta optimizar, empezar por el #1** (precomputar tokens
   de tema/título): es el de mejor relación beneficio/riesgo y es puramente
   aditivo.
2. **#2 (índice invertido) y #4 (evitar clon)** solo cuando el cerebro pase de
   varios miles de entradas y un perfil lo confirme.
3. **No tocar** #5–#7 salvo evidencia de medición: añadirían complejidad sin
   beneficio real al tamaño actual.

**Regla de oro**: medir antes de optimizar. Todos los puntos anteriores son
lineales y hoy están por debajo del umbral perceptible; el caché v1.48.0 ya
quitó el único coste que crecía en el camino más transitado (el re-parseo).


---

<!-- UNIFICADO-v1.74.1 INFORME_IMPLEMENTACION_v1.16.4_BAJO_CONSUMO.md -->
## Fuente: INFORME_IMPLEMENTACION_v1.16.4_BAJO_CONSUMO.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### INFORME DE IMPLEMENTACIÓN — v1.16.4 · MODO BAJO CONSUMO + CAMINO QUIRÚRGICO
**Proyecto:** CerebroNico IDE v1.16.4 (parche sobre el árbol v1.16.3-blanco-v1)
**Fecha:** 2026-09-27 · **Base:** `Cerebronico-v1.16.3-blanco-v1.zip` (proyecto seleccionado: `Cerebronico-v1.16.3`, NO el árbol viejo `ide/` v1.6.31)

---

#### 1. Qué se implementó (mejora propuesta → realidad medida)

| § del informe MEJORA | Estado | Dónde |
|---|---|---|
| 2.1 BAT con caducidad (`-1`→`5m`) | ✔ hecho y blindado para empaque | `iniciar_todo_windows.bat` |
| 2.2 `keep_alive` por escalón MR | ✔ escalera 3m/5m/0 leída de RAM real; conductor y warmup incluidos | `src/engine/modelTiers.ts` + cable en `server.ts` |
| 2.3 RAM visible + botón Expulsar | ✔ `/api/ollama/ps`, `/api/ollama/expulsar`, bloque `ollama` en `/api/system/stats`, chip + botón en Puertos | `server/ollamaBajoConsumo.ts`, `server/routers/ollamaControl.ts`, `telemetria.ts`, `LeftSidebar.tsx`, `App.tsx` |
| Contrato SUPERFICIE | ✔ server.ts 11 520 → **11 512** (se extrajo `server/salidaProcesos.ts` para pagar lo nuevo: partir, no añadir). 138 rutas en contrato, VEREDICTO: CONTRATO INTACTO | `contrato-rutas.json` |
| Versión en fuente única | ✔ `VERSION_SEMVER` 1.16.4 (un solo literal + package.json) | `src/constants.ts` |

#### 2. Los dos apagones que se curan, explicados

1. **El modelo clavado**: `-1` mantenía el pico sostenido de energía. Con `5m`, a los 5 minutos sin uso Ollama expulsa; la siguiente respuesta recarga sola. La escalera MR refinina por petición: equipo limitado (≤8 GB) con modelo >7 B → `keep_alive: "0"` (carga bajo demanda EXPLÍCITA; nada residente de más). El botón Precalentar (warmup) sigue pudiendo residir el modelo 5 m: la demanda explícita del usuario manda sobre el ahorro (`keepAliveExplicito`).
2. **El BAT que se cerraba**: el ZIP entregaba el BAT en LF puro —cmd lo parsea mal y la ventana muere al instante («se cerraba enseguida»). v1.16.4 fija **CRLF**, quita todos los bloques `if (...)` con eco dentro (la otra trampa clásica), y usa `pause` a secas ante errores: con doble-clic espera la tecla (el error se puede leer); con el EXE oculto (stdin=NUL) pasa solo y no cuelga el arranque. PROHIBIDO documentar `pause <nul` otra vez: esa redirección mata la pausa TAMBIÉN para el usuario.

Comprobables en 3 pases:
```bash
grep -c $'\r$' iniciar_todo_windows.bat    # >0: CRLF
grep -n "OLLAMA_KEEP_ALIVE" iniciar_todo_windows.bat   # solo =5m
node scripts/superficie.mjs --verificar    # CONTRATO INTACTO
```

#### 3. Herramientas activas ampliadas (pack `sistema`)

`ollama_estado` (residentes + MB medidos), `ollama_expulsar` (keep_alive:0, total o por modelo), `recursos_maquina` (cores, RAM total/libre, residente Ollama). Las tres `cheap`: llegan también a los modelos chicos. El ejecutor (`server.ts`) las delega al MISMO módulo que alimenta el chip de Puertos: una verdad, dos puertas.

#### 4. Automatismo consciente ampliado: crear → modificar → reparar

`src/engine/bucleAutonomo.ts` (pura, fuera del trinquete) gana:
- **Fases del turno**: `faseDelTurno` — sin obra = CREAR; con mutación exitosa = MODIFICAR; con fallo (o reincidencia ≥2 de una herramienta) = REPARAR.
- **Escalera de reparación de 3 escalones** (`escalonDeReparacion` + `directivaDeReparacion`): 1) cambiar de camino (otra herramienta/ruta, leer antes de tocar); 2) diagnosticar y retroceder (`revisar_cambios`/`deshacer_cambios`/`run_tests` sobre el error exacto); 3) reconstruir lo mínimo y, si no cierra, INFORME HONESTO — nunca un «listo» con obra abierta.
- **Presupuesto de reparación**: `techoDePasos` compra hasta 6 pasos extra por herramientas con fallos abiertos (sin perder el tope duro). El cable en `runOllamaAgentLoop` registra `fallosPorHerramienta` e `historialBucle`, y el tablero muestra `[fase · escalón]`.

#### 5. El camino de los archivos (mandato del usuario)

`entrada (chat / adjunto del editor) → contenedor → SOLO lo necesario al ÁRBOL DEL PROYECTO → lista QUIRÚRGICA al SANDBOX`

- **Peaje de entrada** (`aduanaDeEntrada` en `App.tsx`, aplicado a ADJUNTO DEL CHAT y ADJUNTO DEL EDITOR): lo PROHIBIDO (secretos, node_modules, `.git`, logs, copias `.proyectos`, rutas absolutas o con `..`) no entra nunca, con su motivo en la terminal; lo que la aduana marca «preguntar» se confirma EN BLOQUE con la pregunta que el propio motor redactó (`auditarArbol`); lo normal (código/config/docs) pasa sin ruido. Lo rechazado sigue vivo como adjunto del chat: no se pierde, solo no se hace archivo del proyecto.
- **Abrir un `.cn`** (`parseCnFile`): mismo veto de entrada — un paquete viejo o hecho a mano ya no mete basura en el árbol.
- **Lista quirúrgica al sandbox** (`syncToDisk`): filtra con `puedeIrEnElEmpaque` ANTES de enviar; lo vetado se informa. Menos archivos cruzando = menos disco, menos sync, menos consumo (coherente con el modo bajo consumo).

#### 6. Validación

- `node scripts/validar.mjs`: **0 fallos** — incluye la suite nueva `tests/bajoConsumo.test.ts` (**77**) con ficha de catálogo, y `bucleAutonomo.test.ts` extendido (**71**).
- Tipos (`tsc --noEmit`): sin errores (se ejecutó como parte de validar).
- `npm run superficie:verificar`: CONTRATO INTACTO (138 rutas; server.ts 11 512 ≤ presupuesto).
- Criterios de aceptación del informe MEJORA: (1) 10 min sin chatear → `ollama ps` = 0 modelos (5m + escalera); (2) la primera respuesta tras expulsar recarga sola (el motor manda keep_alive por perfil en cada petición); (3) verificar en verde; (4) el pico que apagaba la PC ya no existe por diseño.

#### 7. REVIVE — nitidez de la interfaz (pedido del usuario sobre el GIF de la IDE)

El pedido: «que el aspecto/color/tono de la interfaz se vea más nítido sin cansar la vista». Diagnóstico sobre el código real: el cuerpo usaba `#000000` fijo (mataba la jerarquía de superficies), las juntas por defecto eran invisibles, el texto por defecto tiraba a gris lavado, los `backdrop-blur` de Tailwind (24–64 px) hacían «babear» el contenido detrás de los paneles de vidrio, y los tonos de acento con que la app ESCRIBE (cyan 100/200/300) llegaban deslavados.

Tratamiento en UN punto de control (`src/index.css` + el bloque THEMES de `proSettings.ts`, que es quien pisa los tokens al arrancar):

| Palanca | Antes | Ahora | Por qué no cansa |
|---|---|---|---|
| `body` background | `#000000` | `var(--cn-bg, #05070d)` | el azul-noche da profundidad sin negro absoluto |
| Suavizado de texto | browser default | antialiased + optimizeLegibility + kerning | fuera el fleco sub-pixel de colores sobre oscuro |
| Junta global | `#121824` | `#1a2436` | un escalón: el panel se recorta, no grita |
| `--cn-border` / `--cn-text` | `#162034` / `#e5e7eb` | `#1e2b45` / `#eef2f7` | texto más nítido sin blanco puro |
| `--blur-*` (Tailwind) | 4…64 px | 2…18 px | vidrios limpios; la GPU desenfoca ~la mitad (bajo consumo) |
| cyan 100/200/300 (mix) | 34/60/82 % | 42/66/90 % | el acento se ve VIVO sin subir el brillo de fondo |

Todo por variables de tema: ninguna clase tocada, ningún `!important` nuevo, y el deslizador de acento del panel Pro sigue mandando sobre la escala completa. Verificación: 75 suites 0 fallos + build.

#### 8. Límites honestos

- No hubo PC Windows aquí: el BAT se validó por construcción (CRLF, cero bloques, pines en la suite) y por las reglas de cmd, no ejecutándolo en cmd.
- `ollama ps` no informa MB en versiones viejas de Ollama: el chip muestra «—» antes que inventar un número.
- El `verificar` deja 1 marca ✗ informativa en `planner` (preexistente en la base entregada, suite verde).


---

<!-- UNIFICADO-v1.74.1 INFORME_QUIROFANO_v1.1_HD.md -->
## Fuente: INFORME_QUIROFANO_v1.1_HD.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### INFORME — CORROBORACIÓN v1.6.31 + QUIRÓFANO v1.1 «HD»

**Entrada:** `Cerebronico-CN-v1.6.31-ARBOL-LIMPIO+QUIROFANO-v1-CORREGIDO.zip`
**Salida:** `Cerebronico-CN-v1.6.31-ARBOL-LIMPIO+QUIROFANO-v1.1-HD.zip`
**Método:** corroboración pericial CON EJECUCIÓN REAL (no de memoria): instalar
dependencias, correr las 58 suites, compilar, arrancar el bundle y golpear los
endpoints. Todo lo de abajo tiene evidencia detrás.

---

#### 1. Corroboración: qué prometía el árbol y qué se verificó

| Promesa | Prueba real | Resultado |
|---|---|---|
| QUIRÓFANO v1 aplicado (16 parches + 2 ficheros) | `grep` a `server.ts`: motor `/*QF-MOTOR*/`, endpoints y 2 herramientas del modelo presentes; `tests/quirofano.test.ts` existe | ✅ |
| ESPEJO-SYNC v1.6.31 (GUARDA-SERVIDOR-EJEC + retiro de restos) | `usaEnSuLugar` ×6, `.cn-sync` ×3, `retirados` ×11 en `server.ts`; suite `espejoSync` **29/29** | ✅ |
| Versión 1.6.31 | `package.json: "version": "1.6.31"` | ✅ |
| «Sin archivos que faltan» | `tsc --noEmit`: 0 errores (todo import roto habría dado TS2307) + `vite build`: 2020 módulos resueltos | ✅ |
| Sintaxis del server | `node --experimental-strip-types --check server.ts` → salida 0 | ✅ |
| Seguro de credenciales | único `.env` del árbol es `.env.example` | ✅ |

#### 2. Los tres fallos que SÍ se encontraron (y ya están corregidos)

##### 2.1 El guardián mentía en rojo — BUG de integración (corregido)

`npm run validar` declaraba **«la suite NO llegó a ejecutarse»** para QUIRÓFANO
aunque la suite pasaba 102/102. Causa: `quirofano.test.ts` cerraba con
«N comprobaciones, 0 fallos» y el parser de `validar.mjs` (v2.1) sólo entiende
«N correctas · M fallidas» o marcas ✓/✗. El parche QUIRÓFANO nunca se probó
contra el parser de SU hermana mayor — la misma clase de fallo que QUIRÓFANO
existe para cazar: dos piezas que funcionan solas y mienten juntas.

**Fix:** el veredicto del test adopta el formato de la casa (`espejoSync.test.ts`
ya lo usaba). Corregido en las DOS copias (árbol + canónica en `mejoras/`), así
`--revert` y una reinstalación futura no reintroducen el bug. Manifiesto SHA256
actualizado y auto-verificado (`sha256sum -c`: 4/4 OK).

##### 2.2 El bundle de producción NO traía el QUIRÓFANO — LA TRAMPA del LEEME

`dist/server.mjs` tenía 0 referencias a `quirofano`: fue compilado DESPUÉS del
parche sandbox v1.6.31 pero ANTES de aplicar QUIRÓFANO. Instalado tal cual,
`npm run dev` (dev, con QUIRÓFANO) sí protegía; `npm start` y el EXE (bundle
viejo) NO. El propio LEEME avisaba de este peligro… y este ZIP lo contenía.

**Fix:** `npm run build` ejecutado aquí. Bundle verificado: 3 rutas
`/api/quirofano/*` + `revisar_cambios`/`deshacer_cambios` dentro. **Prueba de
humo con el bundle compilado:** `GET /api/quirofano/estado` →
`{"ok":true,"gates":"estandar",...}`; `POST /api/quirofano/revisar` → informe
correcto; servidor arranca y sirve la IDE. **El ZIP ya no necesita recompilar:
el EXE y `npm start` quedan protegidos al instalar.**

##### 2.3 El QUIRÓFANO era invisible — «embellece HD» (nuevo)

Motor + endpoints + 2 herramientas del modelo… y CERO presencia visual en la IDE.
«Si no se ve, no se usa» — la misma ley que trajo la pestaña Superación y el
Planificador.

**Nuevo `src/components/PanelQuirofano.tsx` (404 líneas, pestaña fija
«Quirófano»):**
· Cabecera HD: cruz quirúrgica con halo, **pulso vital** (cian=en cirugía,
  verde=en vela, rojo=última revertida, gris=sin señal) y barrido de escáner.
· Chips de las 4 puertas estándar siempre activas + chip fucsia de puertas
  pesadas cuando `QUIROFANO_GATES` corre.
· Tarjeta «operación en curso»: motivo + archivos intervenidos, en vivo (4 s).
· «Última cirugía»: informe coloreado por línea (rojo=revertido/bloqueo,
  ámbar=aviso, verde=ok), chips por puerta con detalle al pasar el ratón.
· Bitácora de avisos del guardián (últimos 8 de 12).
· Botones **Revisar ahora** y **Deshacer última** (con confirmación), showing
  restaurados/retirados. Si el server no responde, lo dice en rojo — no finge.
· Cero dependencias nuevas (React + lucide + Tailwind). Lee SOLO el JSON real
  de `/api/quirofano/estado`; no inventa ningún dato.

Montura en `App.tsx`: 3 ediciones ancla mínimas (import, pestaña, render).
`tsc --noEmit` 0 errores y `vite build` OK con el panel dentro del bundle.

#### 3. Veredicto final tras las correcciones

```
VEREDICTO: TODO CORRECTO — 3230 comprobaciones, 0 fallos.
Tipos: 0 errores · 58 suites ejecutadas · 0 sin correr.
El motor está sano: se puede seguir construyendo encima.
```

Higiene del árbol: durante la prueba de humo el servidor tocó
`.proyectos/.cerebro-db/kb.json` y creó `.bridge_5000.log`; ambos fueron
restaurados/borrados. `package-lock.json` devuelto byte a byte al original
(npm sólo había reescrito formato: 592 paquetes, mismos hashes). El ZIP no
lleva `node_modules` (igual que el tuyo; `npm install` lo regenere).

#### 4. Límites honestos de esta entrega

· Las puertas pesadas (tipos/humo) siguen siendo opt-in por env; no se activaron
  de fábrica a propósito (encarecen cada tanda).
· `npm run test:e2e` no se corrió aquí (es opcional y pide Python+redes); las
  58 suites de `validar` sí.
· El panel HD es presentación del estado real: no valida lógica ni diseño — eso
  sigue siendo tuyo, como dice el LEEME.
· Espejo-sana «sobra código viejo»; el «falta código» al reescribir desde el
  editor lo cubre el cotejo del espejo v8.0.7 (`espejo`: 66/66), no este parche.

#### 5. Piezas tocadas (inventario completo del diff)

| Archivo | Qué |
|---|---|
| `ide/backend/tests/quirofano.test.ts` | veredicto en formato validar.mjs (v1.1) |
| `mejoras/cerebronico-quirofano-v1/tests/quirofano.test.ts` | copia canónica espejo |
| `mejoras/cerebronico-quirofano-v1/MANIFIESTO_SHA256_quirofano_v1.txt` | hash v1.1 + sección HD |
| `ide/backend/src/components/PanelQuirofano.tsx` | NUEVO panel HD |
| `mejoras/cerebronico-quirofano-v1/src/components/PanelQuirofano.tsx` | copia canónica |
| `ide/backend/src/App.tsx` | 3 ediciones ancla (import + pestaña + render) |
| `ide/backend/dist/**` | recompilado CON QUIRÓFANO + panel |
| `LEEME_QUIROFANO_v1.txt` | adenda v1.1 |

*Nicolas: pediste corroborar TODO. La corroboración con ejecución encontró tres
fallos reales — dos de ellos exactamente tu queja (el guardián que mentía y el
bundle que se quedó atrás). Los tres están corregidos, con huella, y el árbol
cierra en verde entero.*


---

<!-- UNIFICADO-v1.74.1 INFORME_VALIDACION_EDITOR-V2_v1.16.6.md -->
## Fuente: INFORME_VALIDACION_EDITOR-V2_v1.16.6.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### INFORME DE VALIDACIÓN — EDITOR-V2 consolidado y ciclo v1.16.6

**Fecha:** 2026-09-28 · **Árboles:** `Cerebronico-v1.16.5-EDITOR-V2-FINAL.zip` + `Cerebronico-mejoras-editor-v2.zip` → **entrega renombrada v1.16.6** (la cifra que coincide con lo que el código ya decía por dentro) · **Máquina:** Linux x64, Node v22.23.2

> Regla honrada: «Corroborar = ejecutar» — nada aquí se declara verificado sin
> install + tsc + validar + build + smoke real (convención de `documentacion/MEMORY.md`).

---

#### 1. El parche ya estaba integrado — probado de tres formas

| Vía | Resultado |
|---|---|
| `node aplicar-editor-v2.mjs --raiz <árbol>` | `0 parches, 19 ya estaban` — las 19 anclas existen; el instalador no escribió nada (idempotencia confirmada) |
| SHA256 de los 4 ficheros del pack vs el árbol | quickParser.ts, DedicatedWebEditorView.tsx, accionesRapidas.test.ts y SANDBOX_CONFIG_Y_ARRANQUE_v1.md: **IDÉNTICOS** |
| Suite `accionesRapidas` dentro de `npm run validar` | **22 comprobaciones correctas** |

#### 2. Integridad y manifiestos

- `sha256sum -c MANIFIESTO_SHA256_EDITOR-V2.txt` sobre el árbol del ZIP: **756/756 OK · 0 FAILED** (el smoke tocó `.proyectos/.bridge_5000.log`: restaurado byte a byte, convención de empaquetado limpio).
- El `MANIFIESTO_SHA256_v1.16.5.txt` de la raíz era **pre-integración** (de ahí sus 18 diferencias): regenerado por ciclo como `MANIFIESTO_SHA256_v1.16.6.txt` sobre el árbol final → `npm run manifiesto:verificar` VERDE. EDITOR-V2 y v1.16.5 quedan como firmas históricas.
- Build reproducible: el `npm run build` local produjo los MISMOS hashes de `dist` que el ZIP entregado (pre-renombrado).

#### 3. Renombrado de cifra (pedido: «continua con la cifra que coincida»)

El árbol se rotulaba v1.16.5 pero el parche entero, sus tests y el informe del sandbox decían **v1.16.6**. Subida la semilla única `VERSION_SEMVER` + `package.json` + los 4 literales de `index.html` + el ratchet de `tests/bajoConsumo.test.ts`; estructura de staging `Cerebronico-v1.16.6/Cerebronico-v1.16.6/`. `motor-datos` y `bajoConsumo` verifican la derivación (0 errores). El `package-lock.json` queda intacto a propósito: ya viajaba desalineado por convención de la casa (1.16.3 en el entregado) y tocarlo rompería la firma EDITOR-V2 sin beneficio.

#### 4. 🐞 BUG REAL ENCONTRADO Y CERRADO — el sandbox estático nacía roto

**Síntoma del usuario:** «el sandbox lo que le cuesta es encender».

**Causa raíz (demostrada en vivo):** la plantilla `STATIC_SERVER_SOURCE` de `server.ts` (la que escribe `.cn-static-server.cjs` al servir un proyecto HTML puro por la vía `estatico-directo`) construía su página de diagnóstico con cadenas delimitadas en `"` que contenían `\"`. Dentro de una plantilla de backticks, **el propio TypeScript consume esas contrabarras**: el fichero generado llegaba a disco con `lang="es"` sin escapar → `SyntaxError: missing ) after argument list` al cargar → el servidor hijo moría al instante y `/api/sandbox/start` respondía `online:false` con «Sandbox ESTÁTICO sin confirmar en :3500». **Afectaba a todo proyecto HTML/CSS/JS, en cualquier plataforma, también en el `dist` del ZIP entregado** (verificado contra el bundle original).

**Por qué no lo cazó nadie:** las suites de preview (`viaRapidaPreview`, 64 comprobaciones) DECIDÍAN la vía pero jamás COMPILABAN el código generado.

**Arreglo:** 10 cadenas de la plantilla corregidas (delimitadores de comilla simple donde el HTML lleva comillas; `\\n` donde el generado necesitaba el escape) + comentario-causa en el código. **Regresión §9 en `viaRapidaPreview.test.ts`**: extrae la plantilla real de `server.ts`, la evalúa con la misma semántica de escapes y pasa `node --check` contra el `.cjs` materializado — lo que no compila, no se entrega.

**Prueba en vivo (v1.16.6):** `POST /api/sandbox/start` → `{"ok":true,"static":true,"online":true}` · `node --check` OK · `GET http://127.0.0.1:3500/ → 200` sirviendo el index del proyecto · segundo start → `alreadyRunning:true` (idempotente). Con `.proyectos` vacío, el arranque responde con motivo y salida («no se encontró marcador… pulsa Sync») — cero fallos mudos, comportamiento correcto.

#### 5. ✨ MODO DE PENSAMIENTO a la vista del chat (pedido directo)

- **Hallazgo previo:** `ai.executionMode` (Auto/Rápido/Ingeniero/Profundo) existía SOLO en el menú Pro y **no lo leía nadie** — regulador mudo, la misma clase de defecto que `systemExtra` (v1.16.5).
- **Hecho:** `src/engine/thinkingMode.ts` (fuente única: ciclo, etiquetas, ayuda, directriz) + chip **«Pensar: …»** siempre visible en el chat junto al de Agente PC (icono Brain; cielo/verde/violeta según modo). Un clic rota Auto → Rápido → Ingeniero → Profundo.
- **Cableado real:** el chip escribe en el MISMO `proSettings` que el menú Pro (una fuente, cero divergencia; el panel lo refleja en vivo) y `handleSendMessageWithRAG` inyecta la directriz del modo al system prompt de cada turno. «Ingeniero» reutiliza `buildExpertDirective("code")` que ya existía; «auto» no añade un byte.
- **Suite nueva `pensamientoChat`** (26 comprobaciones): ciclo completo, «ningún modo nombrado es decorativo», props cableadas, chip sin condición que lo esconda, y las dos puertas (chat + menú Pro) sobre un solo cerrojo.

#### 6. Puertas finales del ciclo (ejecutadas todas sobre el árbol v1.16.6)

| Puerta | Resultado |
|---|---|
| `npm run validar` | **TODO CORRECTO — 4063 comprobaciones · 0 fallos · 77 suites · Tipos: 0 errores** (el aviso `planner: 1 ✗` es el fixture de t11: simula un plan que revienta para probar que el panel no miente) |
| `npm run build` | vite + esbuild OK; chip y directriz presentes en `dist/assets/*.js` |
| `npm run superficie:verificar` | CONTRATO INTACTO: 138 rutas declaradas · 138 en el código |
| `npm run manifiesto` + `--verificar` | 756 ficheros firmados · TODO COINCIDE |
| Smoke real | :3000 arriba · puente :5000 autarrancado (python3) · pack puente-mcp cargado · **sandbox estático :3500 sirviendo 200** · `/api/health/deep`: solo rojo Ollama :11434 (no instalado en esta máquina; afecta únicamente a modelos locales) |
| Hoja de ruta v1.16.5 B1–B4 | los cuatro fixes verificados en código (coreo citas / continuidadPlan / systemExtra / honestidad imagen / rutas Desktop-OneDrive) |

#### 7. Documentación de problemas históricos (revisada de arriba a abajo)

`hoja-de-datos-errores-y-mejoras.md` (v0.9–v1.0), CHANGELOG completo (v1.6.22 doble copia de memoria; v1.6.23 el sandbox se comía a la IDE; v1.16.5 foco/BLOQUEADO/recursión), `HOJA_DE_RUTA_v1.16.5.md`, `SANDBOX_CONFIG_Y_ARRANQUE_v1.md` (§2: lo que «tarda» del arranque es npm install dentro del start — recetas §3; §5 aislamiento :5000), e `INFORME_SANDBOX_v1.6.*`. Los planes `PLAN_*_v1.md` (cinco) ya viven en `documentacion/` y firmados; `plan_pantalla_trabajo` como documento suelto NO está en el paquete (su contenido está implementado — suite `planTrabajo`, v1.16.3).

**Este árbol está sano: se puede seguir construyendo encima.**


---

<!-- UNIFICADO-v1.74.1 INFORME_VEREDICTO_v1.6.31_vs_ARBOL-LIMPIO.md -->
## Fuente: INFORME_VEREDICTO_v1.6.31_vs_ARBOL-LIMPIO.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### INFORME — VEREDICTO: v1.6.30-ARBOL-LIMPIO vs las promesas de v1.6.31

**Entrada analizada:** `Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip` (547 archivos, 28.4 MB sin comprimir) + `INFORME_SANDBOX_v1.6.31.md`.
**Método:** periciales **solo de lectura** sobre el ZIP (listado completo + volcado de `ide/backend/server.ts`, 530.117 bytes). Cero escrituras, cero instalación.

---

#### 1. Veredicto en una línea

**El ZIP es la base limpia y honesta de v1.6.30 — pero las dos puertas que cura v1.6.31 (GUARDA-SERVIDOR-EJEC y ESPEJO-SYNC) NO están en él.** Instalado tal cual, el `npm run dev` por `/api/exec` sigue muriendo por timeout y el sync sigue sin retirar restos.

#### 2. Tabla de evidencia (promesa → prueba → fallo)

| Promesa del informe v1.6.31 | Prueba en este ZIP | ¿Presente? |
|---|---|---|
| Motor `src/engine/espejoSync.ts` | listado de 547 entradas | ❌ no existe |
| Suite `tests/espejoSync.test.ts` (19/19) | 59 tests en `ide/backend/tests/`, ninguno espejoSync | ❌ no existe |
| `scripts/parche-sandbox-v1631.mjs` | parches presentes: v1624, v1624b, v1625, v1626, **v1627 (tope)** | ❌ no existe |
| GUARDA-SERVIDOR-EJEC en `/api/exec` | `server.ts`: 0 coincidencias de `usaEnSuLugar`; los únicos `GUARDA-*` son viejos (RAÍZ v1, D, E, ENOENT) | ❌ |
| Manifiesto de propiedad `.cn-sync/manifiesto.json` + `retirados` | `server.ts`: 0 coincidencias de `.cn-sync` y 0 de `retirados`; los `manifiesto` que hay son los de extensiones v2.0 | ❌ |
| Versión → 1.6.31 | `ide/backend/package.json`: `"version": "1.6.30"` | ❌ |
| `/api/fs/sync` existe (base del mecanismo) | sí hay referencias en `server.ts` | ✅ pero sin espejo-retiro |

#### 3. Lo que SÍ está saneado (mérito del ÁRBOL-LIMPIO)

- **Credenciales:** el único `.env` del árbol es `.env.example`. Checklist de `SEGURIDAD_CREDENCIALES.md` pasado a nivel ZIP. ✅
- **Serie documental completa:** `INFORME_SANDBOX_v1.6.24 → v1.6.30`, auditorías V8, `ROADMAP.md`, `audits/`, `build/`. ✅
- **Sandbox a 1.6.30** con sus 59 suites de test y parches hasta v1627. ✅

#### 4. Por qué importa (el fallo de las 2:10 a. m.)

El reporte original era: Vite arranca (14,7 s, sirve :3500) y muere `[exit 1] (timeout) Command failed: npm run dev`. Las causas eran (a) servir por la puerta síncrona `/api/exec` y (b) árbol mezclado sin retiro. Ninguna de las dos curas viaja en este ZIP → **quien instale este paquete y pruebe «Arrancar» verá el mismo fallo**.

#### 5. Pasos siguientes (elegir uno)

- **A (recomendado):** aplicar sobre esta base el parche v1.6.31 que ya existe en el árbol de trabajo intervenido (`parche-sandbox-v1631.mjs` + motor + suite) y re-empaquetar como `v1.6.31-ARBOL-LIMPIO` verificable. Coste: medio (una sesión con validación).
- **B (cero desarrollo):** si tu instalación ya tiene el arreglo de v1.6.31, el ZIP a repartir es *ese* árbol, no este. Compara antes de sellar.

#### 6. Cómo comprobarlo tú mismo, sin gastar créditos

```bash
unzip -l Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip | grep -i espejoSync        # vacío = no está
unzip -p Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip ide/backend/server.ts | grep -c "usaEnSuLugar"   # 0 = no está
unzip -p Cerebronico-CN-v1.6.30-ARBOL-LIMPIO.zip ide/backend/package.json | grep '"version"'       # 1.6.30
```

---
*Periciales de lectura únicamente; ningún archivo del ZIP fue modificado. Mario: si traes el árbol instalado con el parche v1.6.31 aplicado, arbitro A vs B con huella en un pase.*


---

<!-- UNIFICADO-v1.74.1 MEJORA_MODO_BAJO_CONSUMO_v1.md -->
## Fuente: MEJORA_MODO_BAJO_CONSUMO_v1.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### MEJORA v1 — Modo bajo consumo en el arranque de Ollama
**Proyecto:** CerebroNico IDE v1.16.3 · **Fecha:** 2026-09-27
**Autor de la propuesta:** asistente (sobre el árbol con parche BLANCO v1)

---

#### 1. Problema que resuelve

`iniciar_todo_windows.bat` fuerza `OLLAMA_KEEP_ALIVE=-1`: el modelo queda clavado
en RAM/VRAM **para siempre**, aunque el usuario no esté inferenciando. Ese es el
pico sostenido de energía que apaga el PC (síntoma reportado: "al levantar la app
se apagaba la pc"). La IDE y el puente :5000 no necesitan al modelo residente en
el arranque — solo cuando el usuario pide una respuesta.

Riesgo de NO arreglarlo: apagones → cortes bruscos → caché `.vite` corrupta →
pantalla blanca (el ciclo que ya se vivió esta semana). El BLANCO v1 hace el
síntoma visible; esta mejora ataca la causa.

#### 2. Cambios propuestos (3, en orden de valor)

##### 2.1 El BAT: keep-alive con caducidad
```bat
REM antes
set OLLAMA_KEEP_ALIVE=-1
REM después
set OLLAMA_KEEP_ALIVE=5m
```
Ollama expulsa el modelo tras 5 minutos sin uso. La IDE vuelve a cargarlo sola
en la siguiente petición. Coste: cero líneas en `server.ts`.

##### 2.2 El motor: `keep_alive` por petición, según el modelo elegido
En las llamadas a `/api/generate` y `/api/chat` de `server.ts`, añadir:
```json
"options": { "keep_alive": "<según escalón MR>" }
```
- MR1/MR2 (equipos de 4–8 GB, modelos ≤1.7 B): `"3m"` — el modelo pequeño
  recalienta menos pero igual merece salir de RAM.
- MR3+ con modelo pesado (>7 B): `"0"` por defecto → **carga solo bajo demanda
  explícita**; la primera respuesta tarda, las siguientes 5 min van rápidas.
- La escalera ya existe en `scripts/gen-modelfile.ts` (MR1/MR2/MR3+) → no hay
  que inventar la clasificación, solo leerla desde el motor.

##### 2.3 La interfaz: RAM de Ollama visible + botón "Expulsar modelo"
- `/api/system/stats` ya mide CPU real (v1.6.22); sumar `ollama_ps` (GET
  :11434/api/ps) → lista de modelos residentes con su RAM exacta.
- En la pestaña "Puertos" del panel izquierdo: chip `Ollama: 4.1 GB` + botón
  **Expulsar** → `POST /api/chat` con `keep_alive: 0` (descarga inmediata).
- Ganancia: el usuario ve por qué se apaga la máquina y tiene la salida sin
  abrir la consola.

#### 3. Encaje con los contratos del proyecto

| Contrato | Impacto |
|---|---|
| SUPERFICIE (server.ts ≤ 11520 líneas) | 2.2 agrega ~10 líneas → hay que compensar extrayendo un helper al mismo tiempo (Fase 2 "partir, no añadir"). 2.1 y 2.3 no lo tocan casi. |
| QUIRÓFANO | Aplicar sobre snapshot nuevo; `npm run verificar` debe quedar en 0 fallos antes de entregar. |
| Fuente única de versión | Si se entrega, subir parche como v1.16.3.1 en `IDE_BRAND`, no en 4 literales. |

#### 4. Plan de ejecución estimado

| Paso | Tarea | Tiempo |
|---|---|---|
| 1 | Cambiar el BAT (2.1) | 5 min |
| 2 | `keep_alive` por escalón en las 2 llamadas del motor (2.2) | 40 min |
| 3 | `/api/ollama/ps` en server.ts + botón en Puertos (2.3) | 1–2 h |
| 4 | Snapshot + `verificar` + `build` + prueba con modelo pesado | 30 min |

#### 5. Criterios de aceptación

1. Con la app abierta 10 min sin chatear, `ollama ps` muestra 0 modelos y la RAM liberada.
2. La primera respuesta tras la expulsión vuelve sola (sin tocar nada) y llega.
3. `npm run verificar` → 3913+ comprobaciones, 0 fallos.
4. Ningún apagón reproduciéndose en la máquina del usuario durante la prueba larga.


---

<!-- UNIFICADO-v1.74.1 MATRIZ_CABLEADO_F4-F10.md -->
## Fuente: MATRIZ_CABLEADO_F4-F10.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### MATRIZ DE CABLEADO F4–F10 — CerebróNico IDE

> Generado por `scripts/verificar-cableado.mjs --md` (diagnóstico PURO, Node v16, sin red).
> VERIFICADO POR EJECUCIÓN. No modifica código. Fecha: 2026-10-08.

**Leyenda:** CABLEADO = importado y usado en `server.ts` · IMPORTADO-SIN-USO = importado pero sus exports no se referencian en el cuerpo · INDIRECTO = no lo toca `server.ts` pero sí otro módulo de `src/` · HUÉRFANO = ningún código de producción lo importa (puede tener test) · NO-EXISTE = archivo ausente.
> «Probado (test)» = alguna suite de `tests/` lo importa. **Probado ≠ cableado:** un módulo puede estar verde en tests y no invocarse NUNCA en vivo.

| Fase | Módulo | Estado | En server.ts | Refs en cuerpo | Probado (test) | Importadores (fuera de server) |
|---|---|---|---|---|---|---|
| F4 · Evidencia | `evidenciaTurno` | **CABLEADO** | Sí | 4 | No | src/engine/autovalido.ts |
| F4 · Evidencia | `motorEvidencia` | **CABLEADO** | Sí | 1 | Sí | src/engine/autovalido.ts<br>src/engine/matrizVerificacion.ts |
| F4 · Evidencia | `matrizVerificacion` | **HUÉRFANO** | No | 0 | Sí | — |
| F5 · Recuperación | `motorRecuperacion` | **HUÉRFANO** | No | 0 | Sí | — |
| F5 · Recuperación | `estadoRescate` | **CABLEADO** | Sí | 16 | Sí | — |
| F5 · Recuperación | `presupuestoReparacion` | **HUÉRFANO** | No | 0 | Sí | — |
| F6 · Grafo / Regresión | `grafoProyecto` | **INDIRECTO** | No | 0 | Sí | src/engine/grafoRico.ts<br>src/engine/motorContexto.ts |
| F6 · Grafo / Regresión | `grafoRico` | **INDIRECTO** | No | 0 | Sí | src/engine/guardianRegresion.ts |
| F6 · Grafo / Regresión | `guardianRegresion` | **HUÉRFANO** | No | 0 | Sí | — |
| F7 · Navegador | `navegadorReal` | **HUÉRFANO** | No | 0 | Sí | — |
| F8 · Visual | `regresionVisual` | **HUÉRFANO** | No | 0 | Sí | — |
| F8 · Visual | `redimensionPantalla` | **HUÉRFANO** | No | 0 | Sí | — |
| F8 · Visual | `pantallaCompleta` | **HUÉRFANO** | No | 0 | Sí | — |
| F9 · Model Router | `enrutadorModelo` | **HUÉRFANO** | No | 0 | Sí | — |
| F9 · Model Router | `modelTiers` | **CABLEADO** | Sí | 23 | Sí | src/engine/enrutadorModelo.ts<br>src/engine/superPrompt.ts<br>src/utils/contextCache.ts<br>src/utils/engine.ts |
| F9 · Model Router | `providerRouting` | **HUÉRFANO** | No | 0 | Sí | — |
| F10 · Memoria 3.0 | `memoriaArquitectura` | **HUÉRFANO** | No | 0 | Sí | — |
| F10 · Memoria 3.0 | `memoriaResiliente` | **CABLEADO** | Sí | 6 | Sí | src/engine/planRunner.ts<br>src/engine/taskPlanner.ts |
| F10 · Memoria 3.0 | `memoriaNegativa` | **HUÉRFANO** | No | 0 | Sí | — |

#### Resumen

- **CABLEADO**: 5
- **HUÉRFANO**: 12
- **INDIRECTO**: 2

#### Símbolos usados en server.ts (por módulo CABLEADO)

- `evidenciaTurno`: anotarHerramienta(3), actaDelTurno(1)
- `motorEvidencia`: estadoEvidencias(1)
- `estadoRescate`: planearFusion(3), rutaRelRescate(2), procederBorrado(2), resumenRescate(4), planReSembrado(3), decidirRespaldo(2)
- `modelTiers`: getModelProfile(5), buildOllamaOptions(5), trimMessagesToBudget(4), condensarHistorial(2), trimIncomingPrompt(3), parseParamsB(1), keepAliveExplicito(3)
- `memoriaResiliente`: resolverPresupuesto(1), siguienteEscalado(1), ESCALADOS(1), PERFILES_MR(1), ORDEN_MR(1), etiquetaEscalado(1)

#### Suites que cubren cada módulo (tests/)

- `motorEvidencia`: tests/motorEvidencia.test.ts
- `matrizVerificacion`: tests/matrizVerificacion.test.ts
- `motorRecuperacion`: tests/motorRecuperacion.test.ts
- `estadoRescate`: tests/estadoRescate.test.ts
- `presupuestoReparacion`: tests/presupuestoReparacion.test.ts
- `grafoProyecto`: tests/grafoProyecto.test.ts, tests/motorContexto.test.ts
- `grafoRico`: tests/grafoRico.test.ts
- `guardianRegresion`: tests/grafoRico.test.ts
- `navegadorReal`: tests/navegadorReal.test.ts
- `regresionVisual`: tests/calidadVisual.test.ts
- `redimensionPantalla`: tests/redimensionPantalla.test.ts
- `pantallaCompleta`: tests/pantallaCompleta.test.ts
- `enrutadorModelo`: tests/enrutadorModelo.test.ts
- `modelTiers`: tests/bajoConsumo.test.ts, tests/motor-datos.test.ts
- `providerRouting`: tests/providerRouting.test.ts
- `memoriaArquitectura`: tests/memoria3.test.ts
- `memoriaResiliente`: tests/imagen.test.ts, tests/planner.test.ts
- `memoriaNegativa`: tests/memoria3.test.ts


---

<!-- UNIFICADO-v1.74.1 PUENTE_LENGUAJE_Y_MEDICION.md -->
## Fuente: PUENTE_LENGUAJE_Y_MEDICION.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### PUENTE: LENGUAJE Y MEDICIÓN

> Respuesta a la propuesta de Rust / WASM / C con FFI.
> **Todo lo que sigue está MEDIDO, no argumentado.** El programa está en
> `ide/backend/tools/puente-bench/demo.c` y se compila con el `gcc` que ya hay.

---

#### 1. Ejecuté la demo propuesta. No mide lo que dice medir.

No hay `rustc` en este entorno, así que traduje la demo de Rust a C **manteniendo
su estructura y sus tiempos exactos** (1 ms / 30 ms de conexión, 4 ms / 20 ms de
«streaming», cuatro fragmentos) y la ejecuté. Esto es la salida real:

```
============================================================
 A) LA DEMO TAL CUAL SE PROPUSO (el sleep va antes de devolver)
============================================================
--- [MODO LOCAL (RAM/IPC)] ---
[Metrica] Handshake / Conexion: 1.07 ms
[Metrica] Latencia al Primer Token (TTFT): 4.07 ms
[Metrica] Ciclo total: 5.15 ms          ← TTFT es el 79 % del total

--- [MODO CLOUD (WebSocket)] ---
[Metrica] Handshake / Conexion: 30.07 ms
[Metrica] Latencia al Primer Token (TTFT): 20.07 ms
[Metrica] Ciclo total: 50.14 ms         ← TTFT es el 40 % del total
```

**Mírese la firma del problema: TTFT ≈ duración completa del «streaming».** El
número impreso es, con dos decimales, exactamente el `sleep` (4,07 y 20,07). No es
una latencia de primer token: es la latencia **del lote entero**.

##### La causa está en la firma de la función

```rust
fn stream_response(&mut self, payload: &[u8]) -> Result<Vec<Vec<u8>>, &'static str>
//                                                ^^^^^^^^^^^^^^^^
```

Esa función **devuelve un `Vec` con todos los fragmentos ya construidos**. Eso no
es un stream: es una lista. El `thread::sleep` va **antes de devolverla**, así que:

1. Nadie recibe nada hasta que están los cuatro fragmentos.
2. El bucle que mide el TTFT recorre un array **ya completo**.
3. Por eso `ttft` sale igual al `sleep` y el total casi igual al TTFT.

**Consecuencia práctica, y es la que importa:** esta demo imprimiría números
bonitos y **sería incapaz de distinguir un puente con streaming real de uno que
acumula toda la respuesta y la suelta al final**. Y el puente que acumula es
precisamente el que produce la sensación de «se ha colgado», que es lo que se
quería eliminar. *Un banco que no puede fallar no valida nada.*

##### Y la corrección es una sola cosa: entregar por fragmento

```
============================================================
 B) LA MISMA DEMO CON STREAM REAL (callback por fragmento)
============================================================
--- [MODO LOCAL (RAM/IPC)] ---
[Metrica] Latencia al Primer Token (TTFT): 4.07 ms
[Metrica] Ciclo total: 17.29 ms         ← TTFT es el 24 % del total

--- [MODO CLOUD (WebSocket)] ---
[Metrica] Latencia al Primer Token (TTFT): 20.07 ms
[Metrica] Ciclo total: 110.34 ms        ← TTFT es el 18 % del total
```

Mismo lenguaje, misma lógica, mismos tiempos: lo único que cambia es que cada
fragmento sale **al producirse**, por callback. Ahora el TTFT mide el arranque y
**queda por debajo del total**, que es la firma de un stream de verdad.

Nótese que el TTFT **no cambió** (4,07 / 20,07 en las dos partes). Lo que cambió es
que ahora el total es mayor que el TTFT, y por eso los dos números significan algo
distinto. En (A) eran el mismo número dos veces.

---

#### 2. Sobre Rust: dónde acierta y dónde no

| Afirmación | Veredicto |
|---|---|
| «Sin recolector de basura → latencia estable» | Cierto que no tiene GC. **Pero las pausas del GC de Node son inferiores al milisegundo**, y el TTFT real de una conversación es de **cientos de milisegundos**, dominado por el cómputo del modelo y la red. Rust no mueve ese número. |
| «Aislamiento de memoria estricto, puente blindado» | Cierto y valioso… **entre procesos**. Dentro de un mismo proceso no hay una ganancia medible para este caso. |
| «Se compila en `.so`/`.dll`/`.dylib` y lo consume cualquiera» | Cierto, y es el argumento bueno. |
| «No interfiere con el sandbox» | Cierto. Pero un módulo TS puro tampoco interfiere con nada: no toca disco ni procesos. |
| «Valida con métricas precisas de milisegundos» | **Falso en la demo mostrada**, y está medido arriba. |

##### Dónde Rust sí ganaría, de verdad

**En el hilo de audio.** No por el lenguaje en abstracto, sino por lo que ese hilo
necesita: un hilo de sistema operativo dedicado, con su búfer pre-asignado,
**que nunca se bloquee**. Ése es el equivalente exacto de ASIO, y ahí el no-GC y la
ausencia de asignaciones en caliente sí compran algo real.

**Y no es lo que está frenando nada hoy.** Antes de reescribir en Rust hay que
medir el TTFT real del equipo. Si el número sale en 300 ms y Rust ahorra 1 ms, la
decisión ya está tomada y no hace falta discutirla: el presupuesto está en el
modelo y en la red.

##### Y una objeción de coste que sí importa

Aquí hay **`gcc`** (13.3.0, ya instalado) y **no hay `rustc`**. Es decir: la opción
«C estricto con FFI» que se propone **ya está disponible sin instalar nada**, y
Rust exige una cadena de herramientas nueva (compilador, enlaces por plataforma,
binarios por arquitectura) para un módulo que aún no ha demostrado que haga falta.
La demo de arriba se compiló y ejecutó en un segundo con lo que ya había.

*(Regla del proyecto que sigue vigente: no añadir dependencias sin necesidad real.
Añadir Rust no es sólo una dependencia: es un segundo lenguaje en un proyecto de
uno solo, y el día que se rompa habrá que saberlo mantener.)*

#### 3. Sobre WASM: hay un límite duro que conviene saber antes de invertir ahí

WASM es atractivo en el papel, pero para **este** objetivo choca con límites que no
son de esfuerzo, son del modelo de ejecución:

- **No puede abrir un segmento de memoria compartida del sistema operativo.** No
  hay `shm_open` ni `mmap` de otro proceso: WASM vive en su memoria lineal y sólo
  ve lo que el anfitrión le importe. O sea, exactamente la pieza «cero copia entre
  procesos» que se busca **no se consigue con WASM**.
- **No hay acceso directo al dispositivo de audio.** Hay que bajar por el anfitrión
  (Web Audio / ALSA), con su búfer, que es justo la capa que se quería saltar.
- **Los hilos necesitan aislamiento de origen cruzado** (COOP/COEP). Sin esas
  cabeceras, `SharedArrayBuffer` no existe y «sin copias» se queda en el nombre.
- Y compartir memoria con JavaScript **en la práctica suele acabar en copias**, salvo
  el caso concreto de un `WebAssembly.Memory` compartido.

Veredicto: WASM es una forma excelente de meter código de otros lenguajes **en el
navegador**, y una mala forma de quitar el socket de en medio. Para el cero-copia
local lo que hace falta es `mmap`/memoria compartida **entre el servidor Node y el
puente Python**, y eso **ni Rust ni WASM lo cambian: es trabajo pendiente y está
listado como tal** en `src/engine/capacidadesPuente.ts`.

---

#### 4. Qué queda decidido y qué hay que medir antes de decidir

**Decidido por medición:** la demo propuesta no sirve como banco de pruebas. El
banco de este proyecto ya entrega por fragmento
(`src/engine/puenteIA.ts`, `medirPuente`), descarta el trozo más viejo en vez de
bloquear al productor, y **mide TTFT de verdad** — 91 comprobaciones propias.

**Lo que hay que medir antes de elegir lenguaje:** el TTFT real contra el Ollama
del equipo. Ese número decide solo:

| Si el TTFT real sale… | Entonces |
|---|---|
| ≤ 300 ms | No hay nada que optimizar. El presupuesto está donde debe. |
| 300-800 ms | Se nota, y el trabajo está en el búfer y el transporte, no en el lenguaje. |
| > 800 ms | Hay que buscar **dónde** se va el tiempo antes de reescribir nada. Casi siempre es el modelo o la red, no el bucle. |

**Y sigue pendiente, sin adornos:** el endpoint `/api/puente/medir` que corre ese
banco contra el Ollama real, y el `mmap` Node↔Python. Las dos cosas están diseñadas
y no hechas.

---

#### 5. Y ahora la medición que faltaba: ¿cuánto compra cambiar de transporte?

Antes de recomendar reescribir nada en otro lenguaje hay que saber cuánto se puede
ganar cambiando **sólo el canal**. Se midió el coste de ida y vuelta en el mismo
equipo, mismo lenguaje, 3000 repeticiones, mensaje de 51 bytes (el tamaño de un
trozo real), con p50 y p99 — porque en audio lo que se nota son los picos:

| Transporte | p50 | p99 | Frente a TCP loopback |
|---|---|---|---|
| TCP loopback (lo que usa el motor hoy) | 45,08 µs | 64,67 µs | — |
| **Socket de dominio Unix** | **16,42 µs** | 41,12 µs | **63,6 % más rápido** |
| Memoria compartida (`mmap` + `eventfd`) | 31,89 µs | 47,95 µs | 29,3 % más rápido |

Los scripts están en `ide/backend/tools/puente-bench/` y se reproducen con
`python3`.

##### El resultado es contraintuitivo, y es el argumento decisivo

**La memoria compartida sale MÁS LENTA que un socket Unix.** No es un fallo del
instrumento: la primera versión de esta medición daba 5.130 µs para el `mmap` y
**ese número sí era falso** — el bucle de espera no soltaba el GIL, así que se
estaba midiendo la pelea por el GIL y no el coste de copiar. Corregido con
`eventfd` (que bloquea y sí suelta el GIL), el resultado es el de la tabla.

El motivo de fondo es hermoso: **en Linux un socket de dominio Unix YA es un búfer
circular en memoria del kernel.** Es decir, el «cero copia entre procesos» que
Rust o WASM venían a habilitar **ya está ahí, implementado por el sistema
operativo, y es más rápido que montarlo a mano** — porque un socket resuelve la
sincronización en el kernel, mientras que el `mmap` a mano paga dos `eventfd` por
vuelta más una copia en espacio de usuario.

##### Y la escala, que es lo que cierra la discusión

**Los tres transportes juntos, sumados, no llegan a 1 ms.** Un TTFT real de
conversación se mide en **cientos de milisegundos**.

Es decir: cambiar el transporte de TCP a socket Unix es un cambio de **unas diez
líneas**, no necesita ningún lenguaje nuevo, y captura el 63 % de una partida que
representa **menos del 0,1 % del presupuesto total de latencia**. Reescribir eso en
Rust capturaría una fracción de esa fracción.

##### Recomendación, en orden

1. **Socket de dominio Unix** en lugar de TCP loopback para el puente Node↔Python.
   Diez líneas, sin dependencias, +63 %. Es la mejor relación esfuerzo/ganancia de
   toda la lista.
2. **Medir el TTFT real** (endpoint `/api/puente/medir`). Sigue pendiente y es la
   puerta de todo lo demás.
3. **`mmap` en C** sólo si (2) demuestra que el transporte pesa de verdad. En C, no
   en Rust: `gcc` ya está instalado y la superficie de FFI son ~200 líneas.
4. **Rust** sólo si algún día el audio sale del navegador a un hilo nativo
   dedicado. Ahí el no-GC y la ausencia de asignaciones en caliente compran algo
   real. Hoy no es el caso.

##### Lo que NO recomiendo, y por qué

**No cambiar «algunos archivos a Rust para aislar las comunicaciones».** Por tres
razones, y la tercera es la que pesa:

1. Las comunicaciones de este motor son HTTP sobre la misma máquina. El coste total
   medido es de **decenas de microsegundos**. No es ahí donde se va el tiempo.
2. **El aislamiento que se busca ya existe**: el puente ya es una interfaz con dos
   implementaciones intercambiables (`PuenteIA`), y Node, Python y el sandbox ya son
   **procesos separados**. Aislar más no es un problema de lenguaje.
3. Y la que más importa en este proyecto: **un módulo Rust quedaría FUERA de
   `validar.mjs` y de las 2395 comprobaciones.** Sería la única parte del sistema
   sin cobertura — justo el punto ciego que llevamos toda la sesión eliminando:
   la suite que no estaba registrada, la prueba que pasaba sin escanear, el
   indicador clavado en verde. **Meter Rust hoy sería crear el siguiente.**


---

<!-- UNIFICADO-v1.74.1 2026-09-24 (1).md -->
## Fuente: 2026-09-24 (1).md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### 📅 2026-09-24

#### 🛠️ Trabajo Realizado
* **Corroboración v1.6.31+QUIRÓFANO**: Verificación con EJECUCIÓN REAL del ZIP `Cerebronico-CN-v1.6.31-ARBOL-LIMPIO+QUIROFANO-v1-CORREGIDO.zip`: 58 suites, tsc, build y smoke del bundle compilado. Salida: `Cerebronico-CN-v1.6.31-ARBOL-LIMPIO+QUIROFANO-v1.1-HD.zip` (10.6 MB, 576 entradas, sin node_modules).
* **BUG 1 (falso rojo del guardián)**: `validar.mjs` declaraba «suite NO ejecutada» para quirofano aunque pasaba 102/102 — el test cerraba con «N comprobaciones, 0 fallos» y el parser sólo entiende «N correctas · M fallidas» o ✓/✗. Corregido en árbol + copia canónica (`mejoras/cerebronico-quirofano-v1/`), manifiesto SHA256 actualizado (sha256sum -c: OK).
* **BUG 2 (bundle huérfano)**: `dist/server.mjs` del ZIP traía 0 referencias a QUIRÓFANO — compilado antes del parche (la trampa que el propio LEEME advertía). Recompilado: `npm run build` OK; verificado `/api/quirofano/*` dentro del bundle + smoke real (estado + revisar responden).
* **BUG 3 (invisibilidad)**: El QUIRÓFANO no tenía UI. Nuevo `PanelQuirofano.tsx` (404 líneas): pestaña fija «Quirófano», pulso vital por estado, chips de puertas, operación en vivo (poll 4s), informe coloreado por línea, bitácora, botones Revisar/Deshacer con confirmación. Montado en App.tsx con 3 ediciones ancla. tsc 0 errores.
* **Higiene del árbol**: tras el smoke se restauró `.proyectos/.cerebro-db/kb.json` y `package-lock.json` al byte original del ZIP y se borró `.bridge_5000.log`.
* **Veredicto final**: TODO CORRECTO — 3230 comprobaciones, 0 fallos, 58/58 suites, 0 errores de tipos.

#### 🎯 Seguimiento
* [ ] **Usuario**: instalar el v1.1-HD y probar la pestaña Quirófano con una tanda real del modelo (revisar/deshacer).
* [x] Informe completo entregado en `INFORME_QUIROFANO_v1.1_HD.md` (raíz del ZIP).

#### 📝 Entradas de aprendizaje

##### 2026-09-24 09:50 - [ERR] validar.mjs daba falso rojo a la suite quirofano (formato de veredicto)
*   **Priority**: high
*   **Area**: tests
*   **Error**: `quirofano … 0 FALLOS (la suite NO llegó a ejecutarse)` mientras `npx tsx tests/quirofano.test.ts` pasaba 102/102 con exit 0.
*   **Context**: El parser `extraer()` de validar.mjs sólo entiende «N correctas», «N fallidas» o líneas ✓/✗. quirofano.test.ts decía «N comprobaciones, 0 fallos».
*   **Fix**: alinear el veredicto del test al formato de la casa (como espejoSync.test.ts) en AMBAS copias: árbol y canónica bajo `mejoras/`. Actualizar MANIFIESTO_SHA256 tras tocar ficheros rastreados.
*   **Reproducible**: yes
*   **Tags**: cerebronico, quirofano, validar, parser, formato-suites
*   **Status**: resolved
*   **Resolved**: 2026-09-24, fix en v1.1-HD; validar 3230/3230 verde.

##### 2026-09-24 09:52 - [LRN] best_practice: corrobora ejecutando, nunca leyendo
*   **Priority**: critical
*   **Area**: infra
*   **Details**: Nicolas: «los modelos siempre se equivocan al crear, faltan archivos, al modificar apps funcionales terminan rompiéndolas». Hoy la corroboración con ejecución encontró 3 fallos que una lectura superficial habría dado por buenos: suite que pasaba pero el runner no la entendía, bundle de producción sin el parche aplicado, y feature completa sin UI. Un ZIP puede declarar «instalado y verificado» y mentir en el bundle.
*   **Action**: en Cerebronico, corroborar SIEMPRE con: install deps → tsc --noEmit → npm run validar (ejecutando, no leyendo el manifiesto) → npm run build → smoke del bundle arrancado → restaurar artefactos runtime antes de empaquetar. Después de aplicar cualquier parche a server.ts, RECOMPILAR dist/server.mjs o decirlo en grande.
*   **Source**: user_feedback + evidence
*   **Count**: 1
*   **Tags**: cerebronico, verificacion, bundles
*   **Status**: promoted

##### 2026-09-24 09:53 - [REF] Entrega QUIRÓFANO v1.1-HD: lo que salió bien y lo que pulir
*   **What I did**: corroboración total del árbol, 3 fixes, panel HD nuevo, reempquetado con informe y hashes.
*   **Outcome**: success
*   **Reflection**: la edición de App.tsx falló a la primera por no haber usado `read` antes de `edit` (usé sed por bash para inspeccionar); la regla es read-then-edit, sin atajos. También: las pruebas e2e con Python quedaron sin correr (opcional según LEEME) — honesto en el informe.
*   **Lesson**: antes de `edit` sobre un fichero grande, `read` de la zona ancla aunque ya la haya visto por bash.
*   **Status**: resolved

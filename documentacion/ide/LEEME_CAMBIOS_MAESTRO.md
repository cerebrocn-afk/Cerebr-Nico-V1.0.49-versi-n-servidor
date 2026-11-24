# LEEME CAMBIOS (IDE) — Todas las notas de cambios del IDE

Archivo MAESTRO generado el 2026-10-05. Unifica 2 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [LEEME_CAMBIOS_CerebroNico_IDE_v1.md](#leeme-cambios-cerebronico-ide-v1-md) — version 1
2. [LEEME_CAMBIOS_CerebroNico_V1.md](#leeme-cambios-cerebronico-v1-md) — version 1


---

<a id="leeme-cambios-cerebronico-ide-v1-md"></a>
## (1/2) LEEME_CAMBIOS_CerebroNico_IDE_v1.md

> **Fuente:** `ide/LEEME_CAMBIOS_CerebroNico_IDE_v1.md`  —  **version:** 1  —  **bytes:** 6724
# CerebroNico IDE v1 — Cambios y Novedades

**Versión**: 1.0.0 (renombrado desde v1.4.0 como "CerebroNico IDE v1")
**Fecha**: 2026-09-16
**Autor**: Mario Nicolas Quintero

---

## 🎯 Renombrado a CerebroNico IDE v1

- Marca unificada: `CerebroNico IDE v1` (en `Header`, `ChatCenter`, `index.html`, `package.json`, `README.md` del workspace, exportaciones).
- Constante `IDE_BRAND` en `constants.ts` con `NAME`, `VERSION`, `FULL_NAME`, `AUTHOR` y `EXTENSION = "cn"`.
- `package.json` con `name: "cerebronico-ide"`, `version: "1.0.0"`.
- Los exports de sesión JSON y ZIP ahora usan el prefijo `cerebronico-ide-*`.

## 🆕 Botón "Redetectar modelos" (todos los proveedores)

- Nuevo botón 🔄 **Redetectar** en el modal de selección de modelos (`ModelSelectorModal`).
- Llama a `redetectAllModels()` que ejecuta en paralelo la autodetección de:
  - 🦙 Ollama local (`/api/ollama/models` → `:11434/api/tags`)
  - ⚡ OpenAI (`/api/openai/models` → `api.openai.com/v1/models`)
  - ⚡ Gemini flash free (`/api/gemini/models`)
  - 🌐 OpenRouter :free (`/api/openrouter/models`)
- Muestra un spinner mientras se ejecuta y un log de terminal cuando termina.

## 🆕 Botón "Cargar modelos OpenAI" (provider OpenAI)

- Nuevo provider `openai` en `ModelProvider` (types.ts).
- Ranura de **API Key de OpenAI** en el modal "Ranuras de API Keys" (ApiKeyModal).
- Botón **⚡ Autodetectar modelos OpenAI** que llama a `https://api.openai.com/v1/models`.
- Filtra y ordena los modelos útiles: `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`, `chatgpt-*`.
- Catálogo inicial con 4 modelos OpenAI preconfigurados.
- Endpoint backend `GET /api/openai/models` (acepta `x-openai-key` como header seguro).
- Soporte completo de streaming OpenAI en `POST /api/ai/stream` (provider="openai").
- Auto-selección inteligente: si el usuario carga modelos y está en otro provider, cambia automáticamente a `openai` con `gpt-4o-mini` por defecto.
- Soporte de **visión**: si el modelo es `gpt-4o*` o `gpt-4-vision*` y hay imágenes adjuntas, se envían como `image_url` con base64 data URL.

## 🆕 Extensión `.cn` (CerebroNico) para guardar/abrir workspace

- Botón **`.cn` Guardar**: exporta todo el workspace (archivos + metadatos + modelo activo + provider + temperatura) a un único archivo `.cn` (formato JSON con metadatos).
- Botón **`.cn` Abrir**: restaura el workspace completo desde un archivo `.cn`.
- Formato robusto: si algún archivo no tiene `id` o `language`, se asigna automáticamente.
- Restauración también de metadatos opcionales: `currentModel`, `provider`, `temperature`.
- Acepta tanto `.cn` como `.json` en el file picker (compatibilidad).

## 🐛 Fix: "Imagen blanca atascada" en el sandbox

- Cambiado el `className` del iframe del sandbox de `bg-white` a `bg-[#0a0e17]` (fondo oscuro del tema). Antes, cuando el sandbox no cargaba, el iframe se veía como una imagen blanca gigante que no se iba.
- Añadido botón **🟠 Forzar cierre** en los controles del sandbox:
  1. Detiene el proceso npm run dev (POST `/api/sandbox/stop`).
  2. Reinicia la key del iframe (`iframeKey + 1`) — fuerza el remount completo.
  3. Espera 800ms y re-chequea el estado real del puerto 3500.
  4. Limpia cualquier página blanca atascada sin respuesta.

## 🐛 Fix: "Editor con un solo .bat" (workspace se regeneraba al borrar)

- Añadida la clave `LS_KEYS.WORKSPACE_SEEDED` (flag "ya sembramos la plantilla base al menos una vez").
- En el primer arranque: si no hay workspace persistido Y no estaba marcado como seeded, se siembra `INITIAL_WORKSPACE_FILES`. En adelante, se respeta lo que el usuario tenga (incluso vacío o 1 solo archivo).
- `handleDeleteAllFiles()` ahora **deja el workspace realmente vacío** (no restaura la plantilla automáticamente). Era el bug "borro y se regenera".
- Nuevo botón **🌱 Plantilla** que restaura manualmente `INITIAL_WORKSPACE_FILES` cuando el usuario lo quiera.

## 🆕 Indicador del puerto 3500 (Sandbox) en el Header

- Antes solo se veían `:5000` y `:11434`. Ahora también aparece `:3500` (violeta, etiqueta `SAND`) para recordar que es el puerto oficial del sandbox.

## 🔧 Mejoras adicionales

- `index.html` actualizado con título "CerebroNico IDE v1".
- `vite.config.ts` (estaba vacío) ahora define explícitamente la configuración de Vite con React y Tailwind 4.
- Textos del hero "CerebroNico IDE" → "CerebroNico IDE v1" en el ChatCenter.
- Descripción ampliada para mencionar los 5 providers disponibles.
- Persistencia de `openaiApiKey` en localStorage con su propia clave `codigo0_openai_api_key`.

## 📋 Providers soportados (5)

1. **Ollama Local** (`:11434`) — Inferencia 100% offline, modelos locales.
2. **OpenAI** (`api.openai.com`) — GPT-4o, GPT-4o-mini, o1, o3-mini.
3. **Gemini AI** (Google AI Studio) — gemini-2.5-flash, gemini-2.0-flash.
4. **OpenRouter** (multi-modelo en la nube) — DeepSeek, Claude, Llama, etc.
5. **Custom :5000** (FastAPI / vLLM / LM Studio) — Cualquier endpoint OpenAI-compatible.

## 📋 Puertos de la arquitectura

| Puerto | Servicio                              |
|--------|---------------------------------------|
| 3000   | Interfaz de la IDE (Vite + Express)   |
| 3500   | Sandbox Preview (app exportada)       |
| 5000   | Puente PC (Python / agent_bridge)     |
| 11434  | Ollama Local                          |

## 📋 Cómo usar la extensión `.cn`

1. **Guardar workspace**:
   - Clic en botón `.cn` (violeta) en el explorador de archivos.
   - Se descarga `cerebronico-workspace-YYYY-MM-DDTHH-MM-SS.cn`.
   - El archivo contiene: `format`, `formatVersion`, `ide`, `exportedAt`, `currentModel`, `provider`, `temperature`, `responseLanguage`, `expertMode`, `fileCount`, `files[]`.

2. **Abrir workspace**:
   - Clic en botón "Abrir .cn" (violeta) en el explorador.
   - Selecciona el archivo `.cn` o `.json`.
   - El workspace se restaura completo + el modelo y provider activos.

## 📋 Cómo usar el botón "Forzar cierre" (fix imagen blanca)

1. Ve al panel derecho → pestaña **Sandbox**.
2. Si ves una imagen blanca atascada o el preview no responde.
3. Clic en **🟠 Forzar cierre** (junto a "Recargar" y "Abrir").
4. El sandbox se detiene, el iframe se reinicia y se re-chequea el estado.
5. Clic en "Arrancar ahora" para volver a levantarlo limpio.

## 📋 Cómo usar el botón "Redetectar modelos"

1. Clic en el botón del modelo activo (Header) o en "Cambiar modelo" (panel izquierdo).
2. En el modal del selector, clic en **🔄 Redetectar** (botón ámbar, arriba a la derecha).
3. Se ejecutan en paralelo las 4 detecciones (Ollama, OpenAI, Gemini, OpenRouter).
4. Los modelos detectados aparecen marcados como "✓ Detectado Local" o se añaden al catálogo.


---

<a id="leeme-cambios-cerebronico-v1-md"></a>
## (2/2) LEEME_CAMBIOS_CerebroNico_V1.md

> **Fuente:** `ide/LEEME_CAMBIOS_CerebroNico_V1.md`  —  **version:** 1  —  **bytes:** 6671
# CerebroNico V1 — Cambios y Novedades

**Versión**: 1.0.0 (renombrado como **CerebroNico V1**)
**Fecha**: 2026-09-16
**Autor**: Mario Nicolas Quintero

---

## 🎨 Renombrado a "CerebroNico V1" (branding simplificado)

- Quitado "-Codigo-0" del branding visible.
- Header ahora muestra: **cuadrado CN** (gradiente cyan→blue) + **"CerebroNico V1"** + indicador verde de "online".
- Hero del ChatCenter: cuadrado CN gradiente + "CerebroNico V1" en vez del ícono de robot anterior.
- `index.html` title → "CerebroNico V1".
- Constante `IDE_BRAND.FULL_NAME = "CerebroNico V1"` en `constants.ts`.
- `package.json` con `name: "cerebronico-ide"`, `version: "1.0.0"`.
- README del workspace actualizado a "CerebroNico IDE v1" con todos los providers soportados.

## 📦 Extensión `.cn` rediseñada como contenedor tipo ZIP

El archivo `.cn` ya NO es un JSON simple — es un **ZIP real renombrado**:

- **Cabecera `PK` (50 4b 03 04)**: lo reconoce cualquier herramienta ZIP estándar (7-Zip, WinRAR, el Explorador de Windows, el Finder de macOS, `unzip` de Linux).
- **Adentro entra TODO**: código (.ts, .tsx, .py, .js, .md, .json), imágenes (.png, .jpg), PDFs, binarios, lo que sea. Es un contenedor genérico.
- **`manifest.json`** con metadatos: modelo activo, provider, temperatura, idioma de respuesta, modo experto, fecha de exportación, número de archivos.
- **Carpeta `.cerebronico/README.md`** con info del IDE.
- Verificado con `unzip -l`: lista correctamente todos los archivos.
- **Renombrable**: un archivo `workspace.cn` puede renombrarse a `workspace.zip` y viceversa sin perder datos.

### Funciones en `fileParser.ts`

- `generateCnFile(files, options)` → produce un Blob (ZIP) con todos los archivos + manifest.
- `parseCnFile(file)` → lee el .cn (o .zip, o .json legacy), devuelve `{ manifest, files, extras }`:
  - `files[]`: archivos de texto del workspace (para el editor).
  - `extras[]`: archivos binarios (imágenes, PDFs) en base64 — almacenables pero no editables.

### Botones en el explorador (RightSidebar)

- **Violeta `.cn`** → guarda el workspace como ZIP.
- **Violeta "Abrir .cn"** → acepta `.cn`, `.zip` o `.json` (compatible con todo).

## 🗑️ Pestaña "Skills (100)" ELIMINADA

- Las 100 skills viven dentro del **motor** (se inyectan vía `contextCache.ts` en el system prompt del turno 1 como mensajes ocultos).
- Ya no aparece la pestaña en el panel derecho.
- Pestañas visibles ahora: **Sandbox · Editor · Entregables · Terminal** (4 en vez de 5).
- El usuario puede pedir las skills por chat: *"lista las skills disponibles"*, *"activa la skill de parsing"*, etc.

## 🆕 Botón "Redetectar modelos" (todos los proveedores en paralelo)

- Botón 🔄 **Redetectar** en el modal de selección de modelos.
- Ejecuta en paralelo: Ollama + OpenAI + Gemini + OpenRouter.
- Spinner ámbar mientras se ejecuta + log de terminal al terminar.

## 🆕 Botón "Cargar modelos OpenAI" (provider OpenAI)

- Nuevo provider `openai` en `ModelProvider`.
- Ranura de API Key de OpenAI en "Ranuras de API Keys".
- Botón ⚡ **OpenAI** en el selector de modelos.
- Endpoint `/api/openai/models` con autenticación vía header `x-openai-key`.
- Streaming real de OpenAI en `/api/ai/stream` (provider="openai").
- Catálogo inicial: gpt-4o, gpt-4o-mini, o1, o3-mini.
- Soporte de visión: si el modelo es `gpt-4o*` y hay imágenes adjuntas, se envían como `image_url` con base64.

## 🐛 Fix: "Imagen blanca atascada" en el sandbox

- iframe cambiado de `bg-white` → `bg-[#0a0e17]` (fondo oscuro del tema).
- Nuevo botón **🟠 Forzar cierre**: detiene el sandbox + reinicia la key del iframe + re-chequea el estado. Mata cualquier página blanca atascada.

## 🐛 Fix: "Editor con un solo .bat" (workspace se regeneraba al borrar)

- Flag `WORKSPACE_SEEDED`: solo se siembra `INITIAL_WORKSPACE_FILES` en el primer arranque.
- `handleDeleteAllFiles()` ahora deja el workspace **realmente vacío** (no restaura la plantilla automáticamente).
- Nuevo botón **🌱 Plantilla** para restaurar la plantilla manualmente cuando se quiera.

## 🆕 Indicador del puerto 3500 (Sandbox) en el Header

- Añadido `:3500 SAND` (violeta) junto a `:5000` y `:11434`.

## 📋 Providers soportados (5)

1. **Ollama Local** (`:11434`) — Inferencia 100% offline.
2. **OpenAI** (`api.openai.com`) — GPT-4o, GPT-4o-mini, o1, o3-mini.
3. **Gemini AI** (Google AI Studio) — gemini-2.5-flash, gemini-2.0-flash.
4. **OpenRouter** (multi-modelo en la nube) — DeepSeek, Claude, Llama, etc.
5. **Custom :5000** (FastAPI / vLLM / LM Studio) — cualquier endpoint OpenAI-compatible.

## 📋 Puertos de la arquitectura

| Puerto | Servicio                              |
|--------|---------------------------------------|
| 3000   | Interfaz de la IDE (Vite + Express)   |
| 3500   | Sandbox Preview (app exportada)       |
| 5000   | Puente PC (Python / agent_bridge)     |
| 11434  | Ollama Local                          |

## 📋 Cómo usar la extensión `.cn` (contenedor ZIP)

### Guardar workspace

1. Panel derecho → explorador → botón **violeta `.cn`**.
2. Se descarga `cerebronico-workspace-YYYY-MM-DDTHH-MM-SS.cn`.
3. **Tip**: renómbralo a `.zip` para inspeccionarlo en cualquier explorador (Windows, macOS, Linux).

### Abrir workspace

1. Panel derecho → explorador → botón **violeta "Abrir .cn"**.
2. Selecciona el `.cn` (también acepta `.zip` o `.json` legacy).
3. Se restauran: archivos del editor + modelo activo + provider + temperatura + idioma.

### Estructura interna del .cn

```
mi-workspace.cn  (ZIP renombrado)
├── manifest.json          ← metadatos del IDE
├── package.json           ← archivos del workspace
├── server.ts
├── README.md
├── src/
│   └── index.ts
├── assets/
│   └── logo.png           ← binarios también entran
└── .cerebronico/
    └── README.md          ← info del IDE
```

## 📋 Cómo usar el botón "Forzar cierre" (fix imagen blanca)

1. Panel derecho → pestaña **Sandbox**.
2. Si ves una imagen blanca atascada o el preview no responde.
3. Clic en **🟠 Forzar cierre** (junto a "Recargar" y "Abrir").
4. El sandbox se detiene, el iframe se reinicia y se re-chequea el estado.
5. Clic en "Arrancar ahora" para volver a levantarlo limpio.

## 📋 Cómo usar el botón "Redetectar modelos"

1. Clic en el botón del modelo activo (Header) o en "Cambiar modelo".
2. En el modal del selector, clic en **🔄 Redetectar** (botón ámbar arriba a la derecha).
3. Se ejecutan en paralelo las 4 detecciones (Ollama, OpenAI, Gemini, OpenRouter).
4. Los modelos detectados aparecen en el catálogo.

---

<a id="leeme-cambios-v3-1-txt"></a>
## (extra) LEEME_ CAMBIOS v3.1.txt

> **Fuente:** `ide/LEEME_ CAMBIOS v3.1.txt`  —  **bytes:** 5066

============================================================
 CerebroNico IDE v3.1 — "Autoarranque Total"
 LEEME PRIMERO: qué cambió y cómo usarlo
============================================================

QUÉ SE CORRIGIÓ EN ESTA VERSIÓN
===============================

1) ADIÓS PANTALLA NEGRA EN EL EXE — ARRANQUE 100% AUTOMÁTICO
   Antes tenías que abrir iniciar_todo_windows.bat y DESPUÉS el EXE.
   Ahora el EXE lo hace solo:
     - Si el server (:3000) ya está corriendo, entra directo.
     - Si no, ejecuta iniciar_todo_windows.bat de forma OCULTA por ti.
     - Muestra una pantalla de carga con progreso real (nunca negra).
     - Espera hasta 6 minutos (cubre npm install en PCs lentas) y
       abre la interfaz apenas el server responde.
     - Al cerrar el EXE, cierra solo el server que él arrancó
       (Ollama no se toca).
   Además iniciar_todo_windows.bat ahora:
     - Instala dependencias SOLO (npm install) si falta node_modules.
     - Arranca Ollama con ventana minimizada.

2) ÁRBOL DE ARCHIVOS VERTICAL (como pediste, estilo AI Studio)
   El editor ya no usa pestañas horizontales: tiene un EXPLORADOR
   vertical con carpetas anidadas (src > components > ...),
   buscador, iconos por tipo de archivo, punto naranja de
   "modificado", cerrar archivo con la X al pasar el mouse y botón
   "Nuevo archivo".

3) ZIP EXPORTABLE EN PUERTO 3500 (sin colisiones)
   Todo proyecto exportado con el botón ZIP (o sincronizado al
   sandbox) queda configurado para correr en el puerto 3500:
     - package.json: "dev": "cross-env PORT=3500 tsx server.ts"
     - vite.config.ts: port 3500
     - server.ts de la plantilla: process.env.PORT || 3500
     - MEMORIA.md documenta la regla de puertos.
   La IDE vive en :3000 y tus apps en :3500: jamás chocan.

4) SANDBOX REAL (antes era un muerto decorativo)
   El tab "Sandbox" ahora SÍ funciona:
     - Botón "Instalar dependencias": npm install real en el
       proyecto del sandbox (.proyectos).
     - Botón "Arrancar app (:3500)": sincroniza el workspace del
       editor a disco y levanta npm run dev en el puerto 3500.
     - Preview EN VIVO dentro de la IDE (iframe) + botones
       Recargar / Abrir en navegador / Detener.
     - La app del sandbox que tenías (vitacora-vision) quedó
       parcheada para respetar el puerto del entorno
       (process.env.PORT || 3000), así deja de pisar la IDE.

5) node_modules y dist_electron
   - node_modules NO viene en el paquete (563 MB, se regenera solo):
     la primera vez que ejecutes iniciar_todo_windows.bat o el EXE,
     instala las dependencias automáticamente.
   - dist_electron (el EXE) se genera con el nuevo
     compilar_exe_windows.bat (ver abajo).

CÓMO USARLO EN WINDOWS (3 caminos)
==================================

CAMINO A — Un solo doble clic (recomendado):
   1. Descomprime el paquete donde quieras.
   2. Doble clic a iniciar_todo_windows.bat
      (la primera vez instala dependencias: espera sin cerrar).
   3. Listo. Abre http://127.0.0.1:3000 si no se abre solo.

CAMINO B — Solo el EXE (autoarranque total):
   1. Genera el EXE con compilar_exe_windows.bat (una sola vez).
   2. Usa el EXE portable: dist_electron\win-unpacked\CerebroNico IDE.exe
      Déjalo dentro de la carpeta del proyecto (o en una subcarpeta):
      el EXE busca iniciar_todo_windows.bat hacia arriba y lo ejecuta
      oculto, espera al server y abre la IDE solo.
   3. También puedes instalar el Setup .exe: abrirá la IDE; si el
      server no está corriendo y no encuentra el BAT, arranca el
      server compilado incluido (sin Ollama ni puente Python; para
      TODO usa el Camino A o el portable del paso 2).

CAMINO C — Los dos a la vez:
   Da igual el orden ahora: si el BAT ya corre, el EXE detecta el
   server al instante; si no, el EXE lanza el BAT solo.

COMPILAR EL EXE INSTALABLE (después de este paquete)
====================================================
   1. Doble clic a compilar_exe_windows.bat
   2. Espera: compila la interfaz + server y luego empaqueta con
      electron-builder (varios minutos).
   3. Resultado en dist_electron/:
        - CerebroNico IDE Setup (versión).exe  -> instalador NSIS
        - win-unpacked/CerebroNico IDE.exe     -> portable

PUERTOS (regla de oro)
======================
   :3000  -> Interfaz de CerebroNico IDE (no tocar)
   :3500  -> Tus apps exportadas y el sandbox (oficial de apps)
   :5000  -> Puente Python (agente PC)
   :11434 -> Ollama

NOTAS TÉCNICAS
==============
   - Nuevos endpoints del server para el sandbox:
       POST /api/sandbox/start | POST /api/sandbox/stop
       GET  /api/sandbox/status | GET /api/sandbox/logs
   - El log del sandbox queda en .proyectos/.sandbox_3500.log
   - El EXE ya no usa el fork a un puerto equivocado (5001) que
     causaba parte de la pantalla negra: ahora todo entra por :3000.
   - electron-main.cjs usa instancia única: abrir el EXE dos veces
     solo enfoca la ventana existente (cero conflictos de puertos).
============================================================


---

<a id="leeme-cambios-v3-2-txt"></a>
## (extra) LEEME_ CAMBIOS v3.2.txt

> **Fuente:** `ide/LEEME_ CAMBIOS v3.2.txt`  —  **bytes:** 3651

============================================================
 CerebroNico IDE v3.2 — "Sandbox Automático + Carpeta de Chats"
 LEEME PRIMERO: qué cambió y cómo usarlo
============================================================

QUÉ SE AGREGÓ / CORRIGIÓ EN ESTA VERSIÓN (sobre la v3.1)
========================================================

1) SANDBOX 100% AUTOMÁTICO EN LA PREVISUALIZACIÓN
   Ya no tocás ningún botón: el sandbox ahora tiene PILOTO
   AUTOMÁTICO (pilazo "AUTO ON" en la pestaña Sandbox):
     - Al entrar a la pestaña Sandbox se sincroniza solo.
     - Si faltan dependencias, hace npm install SOLO.
     - Arranca tu app en el puerto 3500 sin que la toques.
     - Si el server se cae, lo re-levanta solo (vigilancia cada 8s).
     - Si el proyecto no arranca por dependencias viejas
       (ej: "cross-env: not found"), lo detecta, corre
       npm install automáticamente y reintenta (auto-reparación).
     - EDITÁS EN LA IDE Y EL PREVIEW SE ACTUALIZA SOLO:
       cada cambio de archivos se sincroniza al sandbox en 2.5s
       y el HMR de Vite refresca la vista (piloto automático ON
       por defecto; se puede apagar con el botón AUTO).
   La portada del proyecto nuevo ahora muestra una página de
   bienvenida en :3500 en vez de "Cannot GET /".

2) CARPETA DE CHATS GUARDADOS (en el chat, arriba a la izquierda)
   Botón "Chats (N)" en la barra del chat. Abre un panel con:
     - NUEVO chat: guarda el actual en la carpeta y empieza limpio.
     - ABRIR: clic en un chat guardado y se intercambia por el
       actual (el actual se guarda solo antes de salir).
     - RENOMBRAR: lápiz en cada chat (también en el chat actual).
       Enter confirma, Esc cancela.
     - BORRAR: tachito con confirmación.
   Título automático con tu primer mensaje, editable siempre.
   Todo persiste en el almacenamiento local de la IDE (sobrevive
   a reinicios de la app).

3) BOTÓN DE AUDIO EN CADA MENSAJE
   Cada mensaje (tuyo y del modelo) tiene su botón "Escuchar":
   lee el texto en voz alta con la voz del sistema (español si
   está disponible). Los bloques de código no se leen: se avisa
   "bloque de código omitido". Mientras lee, el botón muestra
   "Detener". El botón de altavoz de la barra superior ahora es
   el silencio global: si está silenciado, los "Escuchar" quedan
   desactivados.

4) BOTONES DE DESCARGA REDUCIDOS (de 4 a 2, como pediste)
   - "Descargar ZIP" (verde, barra superior): TODO el proyecto,
     configurado en puerto 3500.
   - "Descargar este archivo" (cabecera del editor): el archivo
     individual abierto.
   Se eliminaron los duplicados: el ZIP de la barra de pestañas
   del panel derecho, el ZIP de la pestaña Entregables y el
   botón de descarga dentro de la barra del CodeEditor.

RECORDATORIO v3.1 (sigue incluido)
===================================
- El EXE arranca solo: ejecuta iniciar_todo_windows.bat oculto,
  pantalla de carga con progreso real, adiós pantalla negra.
- Árbol de archivos VERTICAL con carpetas, buscador e iconos.
- ZIP exportable y sandbox en puerto 3500 (la IDE en 3000).

CÓMO USAR
=========
1. Descomprimí el ZIP.
2. (Primera vez) Doble clic en iniciar_todo_windows.bat para que
   instale dependencias y quede todo listo; o compilá el EXE con
   compilar_exe_windows.bat y usá el instalador: el EXE hace todo solo.
3. Abrí la IDE, andá a la pestaña "Sandbox" y esperá 10-30 segundos:
   el piloto automático sincroniza, instala y enciende tu app en
   :3500 sin que toques nada.
4. En el chat, botón "Chats" para guardar/renombrar/borrar
   conversaciones, y "Escuchar" en cada mensaje para oírlo.


---

<a id="leeme-cambios-v3-3-txt"></a>
## (extra) LEEME_ CAMBIOS v3.3.txt

> **Fuente:** `ide/LEEME_ CAMBIOS v3.3.txt`  —  **bytes:** 5407

============================================================
  CerebroNico IDE — v3.3 "REFACTOR Y CORRECCIONES"
  (package.json 1.3.0 · Septiembre 2026)
============================================================

  AUTOR Y PROPIETARIO: MARIO NICOLAS QUINTERO
  Copyright © 2026 Mario Nicolas Quintero.
  Todas las credenciales e integraciones de este paquete
  quedan atribuidas a Mario Nicolas Quintero.

Esta versión NO agrega funciones nuevas: limpia, ordena y
repara lo que ya existía. Ideal tenerla como base estable.

------------------------------------------------------------
1) LIMPIEZA DE BASURA (era peso muerto)
------------------------------------------------------------
- Eliminados directorios/archivos accidentales que viajaban
  en el proyecto: del/, dir, para/, llamada/, Downloads/,
  buildbuild_backend.bat (duplicado mal nombrado del
  build_backend.bat real), app/backend__init__.py (nombre
  incorrecto; el marcador válido app/__init__.py sigue
  intacto) y todos los __pycache__.
- LOS __init__.py SE CONSERVAN (son marcadores de paquete
  que FastAPI/PyInstaller necesitan para los imports tipo
  `from backend.app.utils.env_manager import ...`):
  * backend/__init__.py, app/__init__.py y app/utils/__init__.py
    intactos.
  * src/__init__.py y src/utils/__init__.py se normalizaron:
    tenían contenido markdown inválido (no era Python) y se
    dejaron como marcadores de paquete válidos. Verificado:
    los imports del agente resuelven y los 5 archivos
    compilan sin errores.
- El ZIP ya NO incluye: venv/ (57 MB regenerables),
  build/ de PyInstaller (35 MB de intermedios) ni ningún
  node_modules (los instala solos el BAT y el piloto automático).
  El paquete pesa una fracción y no arrastra binarios ajenos.
  Si quieres compilar el agente EXE: build_backend.bat crea el
  venv solo. El EXE ya compilado SÍ viaja en dist/.

------------------------------------------------------------
2) REFACTORIZACIÓN (mismo comportamiento, mejor código)
------------------------------------------------------------
- NUEVO src/constants.ts: única fuente de verdad para los
  puertos (IDE 3000 · Sandbox 3500 · Puente 5000 · Ollama
  11434) y las 19 claves de localStorage (codigo0_*).
  Antes había ~35 strings duplicados entre 6 archivos: cambiar
  un puerto implicaba cazarlos a mano.
- NUEVO src/utils/storage.ts: loadJSON/saveJSON/loadString/
  saveString con protección ante JSON corrupto y cuota llena
  (antes eran helpers privados de App.tsx).
- NUEVO src/utils/chatStorage.ts: deriveChatTitle,
  makeChatId y buildArchivedChat (lógica pura de la carpeta
  de chats, testeable sin React; App.tsx sólo orquesta).
- server.ts: helper readFileTail() elimina la duplicación de
  lectura de logs (sandbox/start y sandbox/logs).
- ApiKeyModal: eliminada la doble persistencia (el modal
  repetía los setItem que App.tsx ya hacía por callback).

------------------------------------------------------------
3) CORRECCIONES (bugs reales encontrados y reparados)
------------------------------------------------------------
a) PUENTE :5000 SIN PYTHON QUEDABA MUERTO (el más grave)
   Si la PC no tenía Python, el puente moría en silencio
   (solo un warn en consola) y el Modo Agente PC nunca
   funcionaba. Ahora el server sondea Python al arrancar;
   si no existe, lanza automáticamente el agente compilado
   dist/CerebroNicoAgent.exe que viaja en el paquete.
   Cadena: python -> python3 -> CerebroNicoAgent.exe.

b) EXE: VENTANA OCULTA PARA SIEMPRE SI EL SERVER NO RESPONDE
   Antes, si el server no levantaba, la ventana principal
   quedaba oculta eternamente (solo el splash avisaba).
   Ahora se muestra una página de error clara con botón
   "Reintentar ahora" y reintento automático cada 10s.

c) OLLAMA_URL NO SOBREVIVÍA A LA RECARGA
   La URL de Ollama configurada en Ranuras de API se
   guardaba pero App.tsx nunca la leía al arrancar: al
   recargar volvía a 127.0.0.1:11434 sin importar lo que
   hubieras puesto. Corregido.

d) WATCHDOG DEL SANDBOX CONTRA ERRORES HTTP
   Si /api/sandbox/status respondía 401/500, el vigilante
   interpretaba "sandbox caído" y relanzaba el autopiloto
   en bucle. Ahora valida r.ok antes de decidir.

e) Versión alineada: package.json 1.2.0 -> 1.3.0.

------------------------------------------------------------
4) VERIFICACIÓN REALIZADA (no es "debería funcionar")
------------------------------------------------------------
- tsc --noEmit: sin errores. vite build + esbuild: OK.
- E2E del server: UI :3000 -> 200, sandbox arranque frío
  online en :3500, preview 200, puente :5000 health 200
  (con la nueva sonda Python/EXE activa), stop limpio.
- UI en navegador: explorador vertical, drawer de chats y
  piloto automático del sandbox (sync -> arranque -> preview
  vivo) operando sin clicks.
- electron-main.cjs: chequeo de sintaxis OK.

------------------------------------------------------------
5) CÓMO ARRANCAR (igual que siempre)
------------------------------------------------------------
1. iniciar_todo_windows.bat  (o directamente el EXE: el
   arranque automático lo ejecuta oculto por ti)
2. Primera vez: instala node_modules solo y arranca Ollama.
3. Compilar instalador Windows: compilar_exe_windows.bat
4. Compilar agente EXE (opcional, ya viene uno): build_backend.bat

Puertos: IDE 3000 · Sandbox/App exportada 3500 ·
Puente PC 5000 · Ollama 11434.

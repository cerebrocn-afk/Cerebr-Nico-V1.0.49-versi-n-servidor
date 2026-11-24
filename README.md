# CerebróNico v1.0.55 — edición servidor

Fuente de Gemini sobre v1.0.49, con autenticación, proyecto compartido por modelo/editor y sesiones en la raíz persistente. No reemplaza tu edición PC.

Lee **SUBIR-A-GITHUB.md** para el repositorio y despliegue; **SERVIDOR.md** para alcance y límites; **VALIDACION-SERVIDOR.md** para resultados y pruebas pendientes. Las secciones de escritorio que siguen son documentación histórica conservada, no instrucciones para desplegar esta edición.

---

# Entrega 1.0.55 — edición servidor experimental

**Leer primero SERVIDOR.md y VALIDACION-SERVIDOR.md.** Ésta no reemplaza el EXE validado. Incluye backend y cliente compilados, fuente, pruebas y configuración de servidor.

---

# CerebróNico v1.0.0 — backend

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# CerebróNico

> **Autor y propietario:** Mario Nicolas Quintero Marin
> **Copyright © 2026 Mario Nicolas Quintero Marin.** Todos los derechos reservados.
> Versión de paquete 1.0.0 (línea base del proyecto en funcionamiento real).

## Mapa de documentos — UN archivo por tipo (unificación v1.0.0)

«Que no haya varios CHANGELOG: la información centralizada en un archivo por cada
documento» (Mario, 24/10). El papeleo vive una sola vez, acá:

| Qué | Dónde (único) |
|---|---|
| Cambios por versión | `CHANGELOG.md` (contiene TODO el detalle de cada `vX`) |
| Correcciones documentadas | `CORRECCIONES.md` |
| Hoja de ruta VIGENTE | `HOJA_DE_RUTA_PERFECCION.md` · `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md` (`documentacion/ROADMAP_MAESTRO.md` es histórico) |
| Manual del motor (self-awareness de los modelos) | `manual-motor/` — canónico `manual-completo.md` + copias por formato |
| Auditorías e informes técnicos | `documentacion/audits/AUDITS_MAESTRO.md` |
| Habilidades/skills | `SKILLS.md` (+ `ACTIVAR-SKILLS-OAUTH.md`, `CREDITOS-SKILLS-EXTERNAS.md`) |
| Superficie HTTP del servidor | `SUPERFICIE_RUTAS.md` + `contrato…` generado: `npm run superficie` → `contrato-rutas.json` |
| Manifiesto SHA256 del paquete | `MANIFIESTO_SHA256_v<versión>.txt` (`npm run manifiesto`) |
| Arranque rápido | `LEEME-PRIMERO.txt` · empaquetado: `LEEME-EMPAQUETADO.md` · Android: `LEEME-ANDROID.txt` |

Lo superado NO se tira a la basura: va a `documentacion/_archivo-consolidado/`
(reversible). La unificación del 24/10 dejó su script: `scripts/unificar-papeleo.mjs`.

IDE de alto rendimiento para ingeniería de software autónomo con inferencia local
(Ollama) y aceleración en la nube (Gemini, OpenRouter, servidores OpenAI compatibles).

## Reconocimientos

> **Sin las siguientes herramientas, CerebroNico jamás hubiera sido posible.**
> Este proyecto es, en parte, el resultado del trabajo que estas plataformas hacen
> accesible a cualquiera con una idea y disciplina:

- **[Z.ai](https://z.ai)** — Acceso al modelo GLM-4.5-Flash (gratis, sin tarjeta) que
  permitió prototipar, depurar y validar el motor agéntico sin gastar un centavo.
- **[Accio Work](https://www.accio.com//** — El entorno de trabajo (workbench) sobre
  el que se ensamblaron, probaron y empaquetaron casi todas las iteraciones de la IDE.
- **[Google AI Studio](https://aistudio.google.com)** — Donde se modelaron, midieron y
  afinaron los prompts y los flujos del Cerebro antes de pasarlos al motor local.

> **Mario Nicolas Quintero Marin** reconoce públicamente que estas tres herramientas
> fueron infraestructura crítica del proyecto, no meros complementos. CerebroNico es
> también un homenaje a quiénes las construyeron y las mantienen abiertas para todos.

## Puertos del sistema

| Puerto | Servicio | Descripción |
|--------|----------|-------------|
| 3000 | Frontend + API | UI Vite/React + backend Express (`server.ts`) |
| 5000 | Puente Python | `agent_bridge_5000.py` (shell + python exec) — se auto-inicia |
| 11434 | Ollama | Inferencia local (debes tenerlo instalado aparte) |
| 5100 | Memoria híbrida (OPCIONAL) | `scripts/hindsight_daemon.py` — pack `memoria-hindsight` (19 herramientas) |
| 5102 | Creador web (OPCIONAL) | `scripts/creador_daemon.py` — pack `creador-web` (27 herramientas) |
| 5101 | Wrapper SDK Node (OPCIONAL) | `scripts/hindsight_agent_server.mjs` — pack `memoria-hindsight-sdk`, `enabled: false` |


## Pack creador de sitios y apps web (v1.19.0 → v1.21.0 · opcional)

`npm run creador` (Windows) / `npm run creador:linux` levanta `:5102`, otro pack
externo con el mismo contrato. Veintisiete herramientas. Nueve familias: crear (`crear_sitio`, `crear_sitio_multipagina`, `crear_pagina`, `crear_bloque`, `crear_pwa`, `crear_og_image`, `generar_schema_jsonld`), auditar (`auditar_pagina`, `auditar_sitio`, `auditar_contraste`), corregir (`mejorar_pagina`), componentes (`componente_modo_oscuro`, `componente_consentimiento`, `formulario_destino`), medir (`preflight_rendimiento`), una sola pasada (`forjar_desde_brief`), **bucle (`mejorar_hasta_estable`)**, plan (`plan_de_construccion`), operación (`listar_sitios`, `previsualizar_sitio`, `plantillas_disponibles`, `estado_creador`) y —nueve en v1.21.0— **ENTREGA**: `exportar_sitio_zip` (ZIP determinista con sha256), `desplegar_carpeta` (en seco por defecto, solo a raíces autorizadas), `verificar_despliegue` (hash a hash: idéntico o divergente con nombres), `listar_exportaciones` y `generar_hreflang` (declara idiomas, **no traduce nada**: lista lo que falta). Once de v1.19: `crear_sitio`, `crear_bloque`,
`auditar_pagina`, `auditar_sitio`, `mejorar_pagina`, `crear_pwa`, `crear_og_image`,
`listar_sitios`, `previsualizar_sitio`, `plantillas_disponibles`, `estado_creador`.

Qué genera: HTML+CSS+JS **sin frameworks** (custom properties, grid, `clamp`), con
`lang`, viewport, skip-link, menú accesible con `aria-expanded`, validación de
formulario con `aria-live`, `prefers-reduced-motion`, manifest + service worker y
`og-image.svg`. Los sitios viven en `.creador/` (o `CN_CREADOR_ROOT`).

Tres reglas que lo hacen seguro de usar:

- **No inventa.** Donde no diste datos queda `[Personaliza este texto]`, y el
  auditor lo cuenta: un sitio con marcadores **no es publicable**.
- **No pisa sin permiso.** `crear_sitio` se niega si el sitio existe (salvo
  `sobrescribir: true`); `mejorar_pagina` corrige en seco y escribe solo con
  `aplicar: true`, dejando snapshot en `.creador/historial/`.
- **No abre servidores ni puertos por su cuenta.** `previsualizar_sitio` explica
  cómo hacerlo; quien decide es el usuario.

## Panel de Tareas: ya no tapa los botones (v1.20.0)

El panel de tareas del motor estaba fijo arriba a la derecha y su caja se comía los
clics del pie de cada burbuja («Escuchar»/«Copiar») y del compositor. Ahora el
contenedor ignora punteros (solo el botón y la hoja reciben eventos), la hoja abre
debajo con `top-full`, y al abrirse publica `--cn-tareas-gutter`: la lista de mensajes
y el compositor consumen ese ancho como margen, la columna se aparta y los botones
quedan libres. Con el panel cerrado la variable vale `0px` — nada se desplaza.

Guías: `skills/cerebronico-creador`, `skills/cerebronico-creador-bucle` y
`skills/cerebronico-web-qa`.

## Editor web: solo el previsualizador (v1.60.15)

La vista del editor web mostraba a la izquierda un recuadro «Editor Web & IA»
(campo de instrucciones + bloques rápidos + registro «Actividad del agente» con
su botón Limpiar) y, a la derecha, el previsualizador, separados por un
desplazador de ancho y un botón Mostrar/Ocultar IA. Ese panel duplicaba lo que
ya ocurre en el chat central: las órdenes del editor se dan ahí (chip «Editor
ON»), que es el único punto de entrada, y la actividad del agente también se ve
en el propio chat.

Desde v1.60.15 ese recuadro se eliminó por completo. El editor web es ahora
**solo la mesa de trabajo**: barra superior + previsualizador a todo el ancho.
No hay panel izquierdo, ni desplazador, ni botón Mostrar/Ocultar IA. Con el
panel se fueron sus estados y helpers internos (ancho persistido, arrastre,
bloques rápidos, badge de fase e indicador de ocupado), que ya no tenían uso.

## Capa de memoria híbrida (v1.17.0 · CerebroNico × Hindsight)

El motor puede recordar y aprender entre sesiones sin depender del contexto de la
ventana. Es **opcional por construcción**: si el demonio no está, la IDE arranca
igual y el modelo simplemente no ve las herramientas.

```bash
# Windows (el BAT ya lo hace solo, tras Ollama y antes del server):
python scripts\hindsight_daemon.py --port 5100
# Linux/macOS:
python3 scripts/hindsight_daemon.py --port 5100
# o por npm:
npm run memoria           # Windows   |   npm run memoria:linux
```

Dos modos, la misma interfaz (`tools.config.json → packs[memoria-hindsight]`):

| | Sin `HINDSITE_API_URL` | Con Hindsight arriba |
|---|---|---|
| Qué es | **modo espejo**: `.cerebro-db/hindsight-mirror.json`, búsqueda por superposición de términos (acentos insensibles), escritura atómica + snapshot + lock | **memoria biomimética**: extracción de hechos, consolidación, páginas y `reflect` con LLM |
| Quién lo sirve | `scripts/hindsight_daemon.py` (100 % stdlib, Python 3.8+, sin `pip install`) | `pip install hindsight-all` → `npm run hindsight:server` |
| Qué ve el modelo | las mismas 11 herramientas; `memory_estado` declara el modo | idéntico, con síntesis real |

19 herramientas: estado/recuerdos (`memory_estado`, `memory_recall` con **BM25**,
`memory_reflect`, `memory_conflictos`), aprendizaje (`memory_guardar_aprendizaje`,
`memory_aprender_de_error`, `memory_ingest`, `memory_indexar_proyecto`), páginas
(`memory_guardar_page`, `memory_leer_page`, `memory_listar_pages`,
`memory_borrar_page` ·destructiva), higiene y portabilidad (`memory_repasar`,
`memory_olvidar` ·destructiva, `memory_exportar`, `memory_importar`) y documentación
(`listar_skills`, `leer_skill`, `skill_buscar`).

**Skills servidas bajo demanda** (`skills/` + `SKILLS.md`): `hindsight-architect`,
`hindsight-local`, `hindsight-cloud`, `hindsight-self-hosted`, `hindsight-docs`,
`code-review`, `cerebronico-memoria`, `cerebronico-verificar`, `cerebronico-ecosistema`. No inflan el system prompt: el modelo las carga con `leer_skill`
cuando hacen falta, con guarda anti-traversal (solo `.md`/`.txt`/`.json` dentro de
`skills/`).

**Wrapper Node del SDK oficial** (vía `:5101`): `vendor/hindsight-agent-sdk`
(precompilado) + `npm run memoria:node`. Viaja desactivado a propósito: ofrecer
18 herramientas de memoria simultáneas a un modelo ≤8B es justo lo que
`selectToolsForModel()` existe para evitar.

Análisis del ecosistema compatible: `documentacion/ANALISIS_BUNDLE_TOP_REPOS_v1.17.0.md`.

## Arranque

**Prerequisitos:** Node.js 18+ y (opcional) Python 3.8+ y Ollama.

```bash
npm install
npm run dev
```

El servidor escucha en `http://127.0.0.1:3000`. En desarrollo, Vite se monta como
middleware; en producción (`NODE_ENV=production`), se sirven los estáticos de `dist/`.

Variables de entorno opcionales:

| Variable | Default | Uso |
|----------|---------|-----|
| `PORT` | `3000` | Puerto del servidor principal |
| `HOST` | `127.0.0.1` | Bind address (usa `0.0.0.0` + `ACCESS_TOKEN` para LAN) |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | URL de Ollama |
| `GEMINI_API_KEY` | — | Habilita el provider Gemini |
| `OPENROUTER_API_KEY` | — | Habilita el provider OpenRouter |
| `ACCESS_TOKEN` | — | Si está definido, exige header `x-access-token` en endpoints de sandbox |
| `PROJECT_DIR` | `./.proyectos` | Directorio del sandbox del proyecto |

## Providers soportados en `/api/ai/stream`

1. **Ollama** (provider=`ollama`) — Streaming NDJSON contra `/api/chat`.
   - Bucle de agente con tool-calling para modelos compatibles (llama3, qwen, mistral…).
   - Reintentos (3×) con backoff ante fallos transitorios (408/425/429/500/502/503/504).
2. **Gemini** (provider=`gemini` o modelo empiece por `gemini`) — vía `@google/genai`.
3. **OpenRouter** (provider=`openrouter` + `openrouterApiKey`) — SSE OpenAI-compatible.
4. **Custom** (provider=`custom` + `customServerUrl`) — cualquier endpoint OpenAI-compatible.

## Arquitectura interna del streaming

Toda la lógica de streaming SSE está encapsulada en la clase `StreamContext`
(`server.ts`), que centraliza:

- **Abort por desconexión real**: `res.on("close")` + guard `!res.writableEnded`,
  NO `req.on("close")` (que se dispara al recibir el body, antes del primer token).
- **Watchdog global**: cap de 8 min por si el modelo cuelga sin cerrar.
- **Envío SSE**: `sendChunk` / `sendDone` / `sendError` / `sendTaskEvent`.

La lectura OpenAI-compatible (OpenRouter + Custom) se factorizó en
`pipeOpenAICompatibleStream()`. La lectura Ollama mantiene su timeout de inactividad
de 120s que se **reinicia en cada chunk** (no dispara si los tokens siguen fluyendo).

## Tests end-to-end

El repositorio incluye un suite exhaustivo de tests e2e que cubre los 4 providers
con mocks, usando 3 métodos de verificación (curl --no-buffer, Node fetch nativo,
Python http.client) más un test de regresión que reproduce el bug original.

```bash
# Requisitos: tener npm install hecho en el proyecto
python3 /ruta/a/comprehensive_e2e_test.py
```

Salida esperada: `OVERALL: ALL PASS` con 8 tests (ollama_short, ollama_long,
openrouter, custom_provider, gemini_fallback, python_bridge, regression_old_bug,
regression_new_code).

## Servidores MCP (v1.16.1) — navegación web por el puente

El puente Python (:5000) habla **MCP (Model Context Protocol)**: lee
`mcp_servers.json`, lanza cada servidor como proceso stdio (JSON-RPC, 100 %
stdlib en el cliente) y expone sus herramientas como *pack externo* hacia la IDE:

```
mcp_servers.json ─▶ agente_bridge_5000.py ─▶ GET :5000/tools   ─▶ registerExternalPack (tools.config.json «puente-mcp»)
                                              POST :5000/tools/call (token + auditoría) ◀─ ejecutor de server.ts
```

Trae conectado por fábrica `scripts/mcp_fetch.py` (servidor «web»), que aporta
al agente `web_fetch_url` (descargar y leer páginas públicas; HTML→texto) y
`web_extraer_enlaces` (navegar de página en página). Guarda SSRF: solo hosts
públicos, redirecciones revalidadas. `pip install mcp` es OPCIONAL: el servidor
usa el SDK si está (API v2 `MCPServer`, con bajada a v1) y su propio transporte
stdlib si no — mismo protocolo.

```bash
python3 tests/mcp_puente_test.py     # o: npm run test:mcp — 13 comprobaciones E2E
curl http://127.0.0.1:5000/tools              # manifiesto del pack
curl http://127.0.0.1:5000/api/mcp/estado     # qué servidor vive, qué aporta, por qué no
# recargar packs sin reiniciar la IDE:
curl -X POST http://127.0.0.1:3000/api/tools/packs/recargar
```

Para añadir otro servidor MCP: una entrada en `mcp_servers.json` (el binario
debe estar en `binarios_permitidos` de `puente-permitidos.json`) y
`POST /api/mcp/sincronizar`. El respaldo FastAPI del EXE (`app/`) NO replica
MCP a propósito: existe para máquinas sin Python, donde un servidor stdio no
puede correr — exponerlo allí sería una capacidad falsa.

## Autonomía sin humano (v1.16.2)

Tres piezas ejecutables, todas verificadas por `npm run test:autonomia` (28 comprobaciones con procesos reales):

1. **Autodiagnóstico de puertos** — `python autonomia.py puertos [--matar]`: antes de
   arrancar dice quién ocupa :3000/:3500/:5000 y, con `--matar`, SOLO elimina zombies
   reconocibles como propios (lista blanca de nombres + verificación post-kill: «kill
   devolvió 0» no es «ya no escucha»). Cualquier otro dueño se informa y no se toca.
   Ollama (:11434) se espera VIVO y jamás se mata.
2. **Gestor de dependencias Python** — `python autonomia.py deps [--auto]`: declara que
   el puente es stdlib (no necesita nada). Desde v1.0.23 el `requirements.txt` de la
   raíz pide **cero** paquetes: los tres daemons (:5100/:5102/:5103) y el puente son
   100% biblioteca estándar y el `python-embed` que viaja en el paquete no trae pip,
   así que pedirle fastapi/uvicorn era un faltante imposible que desviaba cualquier
   diagnóstico de arranque. Lo único que se instala es lo de un pack que lo declare
   con su motivo escrito; `--auto` lo hace sin preguntar, UNA vez por hash del
   fichero, con log en `.autonomia-deps/`. Las dependencias del agente FastAPI
   legacy viven JUNTO a su componente (`core-agent/requirements.txt`) y solo las
   usa `build_backend.bat`. `CEREBRONICO_MCP_SDK=1` añade el SDK opcional de MCP.
3. **Watchdog externo** — `python scripts/vigilante_autonomo.py` (`npm run vigilar`):
   comprueba por HEALTH HTTP (no por «puerto escuchando») a IDE :3000, puente :5000 y
   Ollama; reanima con el comando declarado, límite de 5 reinicios/hora por servicio y
   BLOQUEO explícito cuando el log del caído dice `SyntaxError` — reiniciar sobre código
   roto está prohibido por diseño. Cada decisión, en `.vigilante/vigilante.jsonl`.
   NO gestiona el sandbox :3500 (es del proyecto del usuario).

El `iniciar_todo_windows.bat` encadena ya puertos→deps antes de levantar la IDE, sin
interrupciones (un fallo de autonomía avisa y continúa). Para auditar un paquete:
`python scripts/analizar_autonomia.py [zip|carpeta]` — porcentaje de autonomía con
faltantes nombrados (Docker es informativo: un contenedor no añade autonomía local).
El prompt operativo del bucle cerrado está en `prompts/bucle_autonomo.md`.

## Verificación rápida manual

```bash
# Arrancar el servidor
npm run dev

# En otro terminal: probar streaming de Ollama (necesitas Ollama corriendo)
curl -sN -X POST http://127.0.0.1:3000/api/ai/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hola","provider":"ollama","model":"qwen2.5:7b"}'

# Telemetría (estado de los 3 puertos)
curl http://127.0.0.1:3000/api/telemetry/ports
```

---

# Descripción extensa del sistema (v1.6.12)

## Qué es

CerebróNico es un entorno integrado de desarrollo que combina **inferencia local**
(mediante un motor de modelos en el propio equipo) con **aceleración en la nube**
opcional, y que además **ejecuta** lo que produce: escribe archivos, levanta una
previsualización aislada y controla procesos del sistema desde una interfaz web.

No es un chat con esteroides. La diferencia está en tres cosas que el sistema
trata como **invariantes**, no como buenas intenciones del modelo:

### 1. Lo que el modelo olvida, lo completa el sistema

Un modelo de lenguaje puede olvidar el manifiesto de dependencias de una app.
Eso no es aceptable como resultado. Antes de declarar un proyecto ejecutable, el
sistema analiza el árbol de importaciones de las fuentes y **genera lo que
falta**: el manifiesto con las dependencias *realmente* importadas y el documento
de entrada si no existe. Además instala exactamente los paquetes importados y no
declarados, en lugar de arrastrar un árbol completo.

### 2. Previsualizar no cuesta una instalación

Previsualizar exigía instalar todas las dependencias del proyecto y levantar su
servidor de desarrollo: decenas de segundos y fallo total por un solo paquete
ausente. Ahora el sistema elige **la vía más barata que pueda funcionar**:

| Vía | Cuándo | ¿Instala? |
|---|---|---|
| Servido directo | El proyecto no necesita transformación | No |
| Empaquetado único | Necesita transformación: se compila una vez con el empaquetador que el propio sistema ya trae | **No** |
| Arranque del proyecto | Marcos con servidor propio, o proyectos ya instalados y configurados | Sí |

La elección se registra con su motivo. Y no previsualizar nunca es la respuesta
cuando hay evidencia de contenido web: un archivo ajeno en la carpeta no puede
secuestrar una web.

### 3. Un fallo no se lleva por delante el resto

Cuatro capas desacopladas por puerto: interfaz y API, previsualización aislada,
puente de control y motor de inferencia local. La caída de la vista previa **no**
inutiliza la interfaz, y el motivo del fallo se reporta de forma explícita en
lugar de propagarse como un error genérico.

## Dónde viven tus datos

La raíz de datos es conmutable mediante la variable de entorno `PROJECT_DIR`
(por defecto, una carpeta junto al motor). **Todas** las capas la respetan,
incluido el puente de control, de modo que no se fragmenta en dos ubicaciones.

Contiene tus credenciales, el historial de uso de los espejos, el conocimiento
acumulado del motor y tus proyectos. Al cambiarla, el sistema ejecuta una
**migración no destructiva**: copia el estado solo si el destino está vacío, no
sobreescribe nada y no borra el origen — volver atrás es borrar la carpeta nueva.

## Robustez del flujo de inferencia

El flujo de respuesta del motor se interpreta con un búfer de recuperación: si la
estructura de un mensaje no es interpretable, **su texto se entrega igualmente**
en lugar de descartarse. Distingue el mensaje incompleto —que debe esperar— del
mensaje corrupto, y mide la latencia real en vez de dar por buena la que el
propio motor declara sobre sí mismo.

## Verificación

El proyecto no se apoya en «parece que funciona». Cada pieza tiene sus pruebas y
hay un validador que ejecuta **todas** las suites, comprueba los tipos y falla de
forma explícita si alguna no llegó a ejecutarse:

```bash
npm run validar
```

## Estado y honestidad

Este repositorio contiene un sistema en desarrollo activo. Lo que **no** está
hecho se dice aquí y no se disimula:

- **No hay generación de imágenes.** El registro de herramientas no incluye
  ninguna capacidad de imagen, ni de generación ni de edición.
- **La vía rápida de previsualización es una foto fija**: no ofrece recarga en
  caliente.
- **La orden del editor web** se envía al modelo como texto; el panel informa de
  que el mensaje se envió, no de que los archivos se hayan escrito.

## Documentación

- [`documentacion/memoria-patente.md`](documentacion/memoria-patente.md) — memoria
  descriptiva y reivindicaciones (borrador técnico, versionado con el código).
- [`documentacion/CREDENCIALES-y-papeleo.md`](documentacion/CREDENCIALES-y-papeleo.md)
  — inventario de datos y documentos a reunir.

## Licencia y titularidad

**Autor y propietario:** Mario Nicolas Quintero Marin.
**Copyright © 2026 Mario Nicolas Quintero Marin.** Todos los derechos reservados.

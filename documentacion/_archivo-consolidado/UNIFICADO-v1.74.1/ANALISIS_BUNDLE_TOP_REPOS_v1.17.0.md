# ANÁLISIS · bundle-top-repos → CerebroNico (v1.17.0)

**Fecha:** 2026-09-28 · **Fuente del catálogo:** `bundle-top-repos-main/README.md` (YaggoSEO), 106 entradas leídas y parseadas (`documentacion/datos/bundle_repos.tsv`).
**Datos de los repos:** verificados contra la API de GitHub (`api.github.com/repos/...`) y sus README el 2026-09-28. El buscador web de la sesión estaba caído, así que **ninguna afirmación de este documento viene del resumen del bundle ni de memoria: viene del repo real.** Las estrellas y fechas son de ese día.

## 1. Cómo se juzgó "encaja"

CerebroNico no es un hueco que cualquier repo llene. Tiene cuatro puntos de enganche reales, y solo lo que toca uno de ellos cuenta como compatible:

| # | Punto de enganche | Qué acepta | Prueba en el código |
|---|---|---|---|
| P1 | `mcp_servers.json` → puente :5000 | servidores **MCP por stdio** (JSON-RPC) que el puente expone como herramientas | `_flujo` del propio archivo; el `comando` debe estar en `puente-permitidos.json → binarios_permitidos` |
| P2 | `tools.config.json → packs[]` | cualquier proceso con `GET /tools` + `POST /tools/call` | `registerExternalPack()` (`src/engine/toolRegistry.ts:180`) |
| P3 | `skills/` (nuevo en v1.17.0) | carpetas con `SKILL.md` — servidas por `leer_skill` bajo demanda | `scripts/hindsight_daemon.py → skills_listado()` |
| P4 | `requirements.txt` / `src/engine/*` | librería Python o módulo TS que se compra como dependencia propia | — |

Y un filtro que el catálogo del bundle no tiene: **el motor objetivo es Ollama local con modelos ligeros** (cerebro.md §1: "compensando las limitaciones de modelos ligeros"). Todo lo que añada herramientas al prompt resta; `selectToolsForModel()` ya estrangula a ≤8B. Por eso el orden del ranking es *capacidad ganada por token consumido*.

## 2. ENCAJA — primer nivel (se enchufa sin tocar código)

| Repo | Qué es (del README real) | Punto | Coste de adoptarlo | Licencia / estrellas / último push |
|---|---|---|---|---|
| **microsoft/markitdown** | convierte PDF, Office, imágenes y audio a Markdown | P4 → alimenta `memory_ingest` | `pip install markitdown` + 1 herramienta en el demonio | MIT · 187k · 2026-09-21 |
| **headroomlabs-ai/headroom** | "Compress tool outputs, logs, files, and RAG chunks before they reach the LLM. 20% fewer tokens for coding agents, 60-95%" + MCP `headroom_compress`/`_retrieve`/`_stats` + `headroom proxy` (OpenAI-compatible) | P1 y/o proxy | `pip install "headroom-ai[all]"` | Apache-2.0 · 74k · 2026-09-27 |
| **colbymchenry/codegraph** | grafo de símbolos/llamadas/dependencias por proyecto (`.codegraph/`), servidor MCP (`codegraph serve --mcp`), con aviso explícito de archivo desactualizado | P1 | `npx @colbymchenry/codegraph` → `codegraph init` por proyecto. **`node` ya está en `binarios_permitidos`** ✓ | MIT · 72k · 2026-09-28 |
| **RyanCodrai/turbovec** | índice vectorial en Rust con bindings Python (`pip install turbovec`) | P4 → reemplaza la coincidencia por términos del espejo v1.17.0 | opcional: sin él, el espejo sigue funcionando | MIT · 17k · 2026-09-13 |
| **unclecode/crawl4ai** · **D4Vinci/Scrapling** | crawler/scraper pensado para LLMs; scraping robusto | P1 o P2 → sube el listón del pack `web` actual (`mcp_fetch.py` solo lee una página pública con guarda SSRF) | Python, servidor MCP propio | Apache-2.0 · 84k · BSD-3 · 84k |
| **Catálogos de skills**: `ComposioHQ/awesome-claude-skills` (75k), `sickn33/agentic-awesome-skills` (47k), `multica-ai/andrej-karpathy-skills` (215k, un solo CLAUDE.md), `VoltAgent/awesome-design-md` (118k, sistemas de diseño para agentes de código) | contenido, no software | **P3** | copiar las carpetas a `skills/` y ya las ve `listar_skills`. Cero dependencias, cero superficie | varias MIT |

> **El hallazgo más valioso del lote es headroom.** CerebroNico ya sufre exactamente su problema: un modelo de 0,5 B–8 B paga el mismo contexto por un log de 500 líneas que por una línea de código. El 60–95 % de reducción que declara aplica sobre salidas de herramientas, que es justo lo que el bucle de agente multiplica. No es una capacidad nueva: es **más capacidad con el mismo modelo**.

## 3. ENCAJA con condición (aportar antes de decidir)

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

## 4. NO ENCAJA (y por qué, que es lo útil)

`getomni-ai/airllm`, `vllm-project/vllm`, `langgenius/dify`, `flowiseai/flowise`, `open-webui/open-webui`, `lobehub/lobe-chat`, `mcmonkeyprojects/SwarmUI`, `ruvnet/ruflo`: **son la capa que CerebroNico ya es** (motor + orquestación + interfaz). Enchufarlos no suma herramientas: sustituye el núcleo o lo duplica. Lo mismo `coolify`/`InsForge` (PaaS), `Twenty`/`Chatwoot`/`Mattermost`/`AppFlowy`/`listmonk`/`Postiz`/`DocuSeal`/`Maybe`/`Vaultwarden`/`bitwarden-server` (autoalojados horizontales, otros productos), `MoneyPrinterTurbo`, `TradingAgents`, `MiroFish`, `Paperclip`, `AutoResearch`, `NousResearch/hermes-agent` (framework de asistente completo), y los CRM/zero-human de la sección de negocios.

Tampoco: `camoufox`/`PinchTab` como navegador del agente mientras el puente :5000 tenga su propia política de raíces, y nada que exija `docker` en una IDE que se empaqueta en `.exe` para Windows (`compilar_exe_windows.bat`).

## 5. Orden de ejecución propuesto

1. **headroom** — compresión de salidas de herramienta. Máximo efecto sobre el problema real del proyecto (contexto en modelos ligeros). Vía: P1 (MCP `headroom_compress`) o proxy, midiendo antes/después con la métrica de inferencia que ya existe (`eval_count` del `done` de Ollama, v1.6.32).
2. **markitdown** — una herramienta nueva en el demonio: `memory_ingest_documento(ruta)` con **doble modo** (con `markitdown` instalado, conversión; sin él, error honesto con la orden para instalarlo), exactamente el patrón `SDK / sin SDK` de `mcp_fetch.py`. Restricción de raíces: solo bajo la app, `.proyectos` y `PROJECT_DIR`, igual que el puente.
3. **codegraph** — grafo de código real para el sandbox, por P1, sin tocar permisos.
4. **skills de catálogo** (awesome-design-md, andrej-karpathy-skills, awesome-claude-skills) — contenido en `skills/`, coste cero, beneficio inmediato para el modo Ingeniero/Profundo.
5. **turbovec** — solo si la recall del espejo se queda corta; mantiene el camino stdlib como red.
6. Decidir **una sola** memoria (Hindsight vs MemPalace) con benchmark antes de mezclar, y **una sola** fuente de grafos.

**Regla transversal:** todo lo que entre por P1 o P2 se registra en `tools.config.json`/`mcp_servers.json` con `enabled` reversible, y **ninguna capa nueva puede bloquear el arranque de la IDE** (precedente v1.6.2: el subsistema opcional se levanta *después* de abrir el puerto).

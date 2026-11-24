---
name: cerebronico-ecosistema
description: Mapa de puntos de enganche de CerebroNico (packs, MCP, skills, dependencias) y criterios para decidir si una herramienta externa vale la pena — con candidatos ya verificados.
user_invocable: true
---

# Enchufar capacidades externas sin romper el núcleo

## Los cuatro puntos de enganche

| # | Archivo | Qué acepta | Precio |
|---|---|---|---|
| P1 | `mcp_servers.json` | servidores **MCP por stdio** que el puente :5000 expone como `<id>_<herramienta>` | el binario debe estar en `puente-permitidos.json` |
| P2 | `tools.config.json → packs[]` | cualquier proceso con `GET /tools` + `POST /tools/call` | un puerto loopback propio |
| P3 | `skills/` | carpetas con `SKILL.md` (+ `references/`) servidas por `leer_skill`/`skill_buscar` | gratis |
| P4 | `requirements.txt` / `src/engine/*` | librería o módulo comprado como dependencia | la carga el arranque |

## Criterio de decisión (en este orden)

1. **¿Tapa un hueco real o duplica lo que ya hay?** Un framework de agentes completo
   (Dify, Flowise, Open WebUI, vLLM, Lobe Chat) **es** la capa que CerebroNico ya es:
   sustituye, no suma.
2. **Capacidad ganada por token consumido.** Cada herramienta nueva compite por el
   contexto de un modelo ligero; `selectToolsForModel()` ya recorta a ≤8B. La
   compresión de salidas vale más que otra herramienta de consulta.
3. **Licencia.** MIT/Apache/BSD entran. GPL-3.0 (p. ej. `omniparse`) **nunca** como
   librería dentro del árbol MIT: solo proceso externo, y avisando. `NOASSERTION`
   (p. ej. `GitNexus`) no entra sin resolver licencia.
4. **Superficie de ataque.** Lo que lee disco hereda las raíces del puente; lo que
   sale a red hereda la guarda SSRF de `mcp_fetch.py` (validar la resolución, no la
   forma, y revalidar cada redirección).

## Candidatos ya verificados (2026-09-28, contra la API de GitHub y sus README)

- **`headroomlabs-ai/headroom`** (Apache-2.0) — comprime salidas de herramientas,
  logs y chunks RAG antes de llegar al LLM. El de mayor efecto sobre el problema real.
- **`microsoft/markitdown`** (MIT) — PDF/Office/imagen → Markdown: alimenta
  `memory_ingest`. Encaja como modo opcional del demonio (con/sin, como `mcp_fetch.py`).
- **`colbymchenry/codegraph`** (MIT) — grafo de símbolos por proyecto, MCP stdio
  (`codegraph serve --mcp`); `node` ya está permitido. Un grafo de código, y solo uno.
- **`RyanCodrai/turbovec`** (MIT) — índice vectorial con bindings Python: upgrade
  opcional del recall del espejo.
- **`unclecode/crawl4ai`** (Apache-2.0) / **`D4Vinci/Scrapling`** (BSD-3) — subir el
  listón del pack `web`.
- **Catálogos de skills** (`ComposioHQ/awesome-claude-skills`, `sickn33/agentic-awesome-skills`,
  `VoltAgent/awesome-design-md`, `multica-ai/andrej-karpathy-skills`) — contenido para P3.
- **No encajan sin decisión explícita**: `engram` y `codebase-memory-mcp` (piden
  ampliar `binarios_permitidos`), `MemPalace`/`claude-mem` (compiten con la memoria ya
  elegida), `VibeVoice` (voz local: exige hardware).

Ver informe completo: `documentacion/ANALISIS_BUNDLE_TOP_REPOS_v1.17.0.md`.

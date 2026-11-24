---
name: unblocked
escription: Contexto organizacional de código, PRs, docs, issues y conversaciones vía Unblocked MCP y CLI. Da al modelo visibilidad de equipo más allá del código local.
user_invocable: true
---

# Unblocked — Contexto organizacional para agentes

Integración de [Unblocked](https://getunblocked.com) en CerebroNico. Da al agente
acceso a contexto de equipo: código fuente conectado, pull requests, issues,
documentación y conversaciones de mensajería.

## Qué hace

- **context_research**: Investiga a través de código, PRs, docs, issues y
  conversaciones, devolviendo respuesta con citas de fuentes.
- **context_get_urls**: Recupera contenido de una o más URLs conocidas.
- **Búsqueda avanzada** (CLI): código, PRs, issues, docs, mensajes.
- **Consultas filtradas** (CLI): issues por proyecto/persona, PRs por repo/persona.

## Modos de uso

### 1. MCP remoto (recomendado si hay cuenta Unblocked)

Servidor MCP en `https://getunblocked.com/api/mcpsse` vía Streamable HTTP + OAuth.

Para activar en CerebroNico:
1. Añadir al puente MCP (`mcp_servers.json`) con `"comando": "npx",
   "args": ["-y", "@anthropic-ai/mcp-remote", "https://getunblocked.com/api/mcpsse"]`.
2. O usar el pack externo en `tools.config.json` apuntando al proxy local si se
   prefiere no pasar por OAuth directo.

Requiere cuenta Unblocked con acceso al workspace del equipo.

### 2. CLI local (sin MCP)

Si Unblocked CLI está instalado (`curl -fsSL https://getunblocked.com/install-mcp.sh | bash`),
el agente puede invocar directamente:

```bash
unblocked context-research "¿quién tocó el auth la semana pasada?"
unblocked context-search-code "auth middleware"
unblocked context-search-prs "login refactor"
```

### 3. Skills internas (siempre disponibles)

Las 10 sub-skills en `skills/skills-main/skills/` guían al agente sobre cuándo y
cómo usar cada herramienta. Se leen vía `leer_skill`:

- `leer_skill("unblocked", "skills/unblocked-context-research/SKILL.md")`
- `leer_skill("unblocked", "skills/unblocked-tools-guide/SKILL.md")`

## Skills internas

| Skill | Cuándo usarla |
|---|---|
| `unblocked-context-research` | Investigación cruzada: código + PRs + docs + issues |
| `unblocked-context-search-code` | Buscar código en repos conectados |
| `unblocked-context-search-prs` | Buscar PRs por descripción/revisión |
| `unblocked-context-search-issues` | Buscar issues en trackers conectados |
| `unblocked-context-search-documentation` | Buscar docs de equipo |
| `unblocked-context-search-messages` | Buscar en conversaciones de Slack/Teams |
| `unblocked-context-query-issues` | Issues filtrados por proyecto y persona |
| `unblocked-context-query-prs` | PRs filtrados por repo y persona |
| `unblocked-context-get-urls` | Recuperar contenido de URLs conocidas |
| `unblocked-tools-guide` | Elegir entre CLI y MCP; manejar herramientas no disponibles |

## Honestidad

- Si no hay cuenta Unblocked, `context_research` no funciona: **decirlo**.
- Si el puente MCP no alcanza el servidor remoto, las herramientas simplemente
  no aparecen: la IDE arranca normal sin ellas.
- Una skill leída es un **procedimiento**, no una capacidad verificada (cerebro.md §2.1).

## Configuración en CerebroNico

### mcp_servers.json (puente :5000)
```json
{
  "id": "unblocked",
  "label": "Unblocked: contexto organizacional (requiere cuenta)",
  "comando": "npx",
  "args": ["-y", "@anthropic-ai/mcp-remote", "https://getunblocked.com/api/mcpsse"],
  "enabled": false,
  "timeout": 30
}
```

Activar solo si se tiene cuenta Unblocked. Desactivado por defecto (no rompe nada).

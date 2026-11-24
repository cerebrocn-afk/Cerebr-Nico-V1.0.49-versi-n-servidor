# CerebroNico IDE v1.53.1 — Activación de Skills con OAuth

Guía paso a paso para activar las 3 skills MCP integradas que requieren
autenticación: **Unblocked**, **Webflow** y **Context7** (este último ya
activado sin OAuth, pero con API key opcional).

---

## Resumen rápido

| Skill | Estado por defecto | Autenticación | Node mínimo |
|-------|-------------------|---------------|:------------|
| **Context7** | ✅ Activado | API key opcional (`CONTEXT7_API_KEY`) | 18+ |
| **Unblocked** | ❌ Desactivado | OAuth (cuenta + navegador) | 18+ |
| **Webflow** | ❌ Desactivado | OAuth (cuenta + navegador) | 22.3+ |

> **Requisito previo**: el IDE necesita Node ≥20 para `npm run validar` y
> las 114+ suites. Para Webflow MCP en concreto, Node ≥22.3.0.

---

## 1. Context7 — Docs actualizadas bajo demanda

### Estado

- **Ya activado** en `mcp_servers.json` (id: `context7`, `enabled: true`).
- Funciona SIN API key, con rate limits bajitos (suficiente para uso normal).

### Activación con API key (rate limits más altos)

1. Ir a [context7.com](https://context7.com) y crear cuenta.
2. Obtener API key desde el dashboard.
3. Añadir la variable de entorno:

```bash
# En .env o en el entorno del sistema
export CONTEXT7_API_KEY="tu-api-key-aquí"
```

4. Reiniciar el puente Python (`POST /api/mcp/sincronizar` o reiniciar el IDE).

### Cómo funciona

- El puente lanza `npx -y @upstash/context7-mcp` por stdio.
- Herramientas expuestas: `resolve-library-id` y `query-docs`.
- El modelo puede consultar documentación actualizada de cualquier librería.

### Verificación

```bash
# Con el servidor arrancado (:3000):
curl -s http://127.0.0.1:5000/tools | python3 -m json.tool | grep context7
```

Debe mostrar herramientas `context7_resolve-library-id` y `context7_query-docs`.

---

## 2. Unblocked — Contexto organizacional

### Qué necesitas antes de empezar

- **Cuenta Unblocked** con workspace de equipo activo.
- Al menos **una fuente de datos conectada** (código GitHub/GitLab, docs,
  issues, Slack/Teams) en [getunblocked.com](https://getunblocked.com).
- **Node ≥18** (el puente usa `npx` para lanzar `@anthropic-ai/mcp-remote`).

### Paso 1: Activar en `mcp_servers.json`

Editar `mcp_servers.json` y cambiar `enabled` a `true`:

```json
{
  "id": "unblocked",
  "label": "Unblocked: contexto organizacional — código, PRs, issues, docs (requiere cuenta + OAuth)",
  "comando": "npx",
  "args": ["-y", "@anthropic-ai/mcp-remote", "https://getunblocked.com/api/mcpsse"],
  "enabled": true,
  "timeout": 30
}
```

### Paso 2: Sincronizar el puente

Con el IDE arrancado:

```bash
curl -X POST http://127.0.0.1:5000/api/mcp/sincronizar \
  -H "X-Cerebro-Token: $CN_BRIDGE_TOKEN"
```

O simplemente **reiniciar el IDE** (la sincronización es automática al arrancar).

### Paso 3: Flujo OAuth (primera vez)

1. La primera vez que el modelo llame una herramienta `unblocked_*`,
   `@anthropic-ai/mcp-remote` abrirá el **navegador** para el flujo OAuth.
2. Inicia sesión en Unblocked y **autoriza la conexión**.
3. El token OAuth se almacena en `~/.mcp-auth/` (directorio del usuario).
4. A partir de ahí, las llamadas subsiguientes usan el token almacenado.

> **Si el navegador no abre automáticamente**: verificar que el entorno
> de escritorio tiene navegador por defecto configurado. En servidores
> headless, usar el CLI en su lugar (ver abajo).

### Alternativa: REST API con token personal

Si prefieres evitar el flujo OAuth interactivo (servidor sin navegador):

1. Crear un **Personal API Token** en
   [Unblocked → Settings → API Tokens](https://app.getunblocked.com/settings/api-tokens).
2. Configurar como variable de entorno:

```bash
export UNBLOCKED_API_TOKEN="tu-personal-token"
```

3. Modificar `mcp_servers.json` para pasar el token:

```json
{
  "id": "unblocked",
  "label": "Unblocked: contexto organizacional (API token)",
  "comando": "npx",
  "args": ["-y", "@anthropic-ai/mcp-remote", "https://getunblocked.com/api/mcpsse"],
  "env": { "UNBLOCKED_API_TOKEN": "tu-personal-token" },
  "enabled": true,
  "timeout": 30
}
```

> **Nota**: Los Personal API Tokens tienen límite de 1.000 llamadas/día.
> Para uso intensivo, usar Team API Token.

### Alternativa: CLI local

Si prefieres no usar MCP en absoluto:

```bash
# Instalar CLI
curl -fsSL https://getunblocked.com/install-mcp.sh | bash

# Usar desde terminal
unblocked context-research "¿quién tocó el auth la semana pasada?"
```

### Verificación

```bash
# Con el servidor arrancado:
curl -s http://127.0.0.1:5000/tools | python3 -m json.tool | grep unblocked
```

Debe mostrar `unblocked_context_research` y `unblocked_context_get_urls`.

### Resetear OAuth

```bash
rm -rf ~/.mcp-auth
```

Reiniciar el IDE; se volverá a abrir el navegador para re-autorizar.

---

## 3. Webflow — Diseño y gestión de sitios

### Qué necesitas antes de empezar

- **Cuenta Webflow** con al menos un sitio.
- Ser **owner o admin** del sitio (los demás roles no pueden autorizar MCP).
- **Node ≥22.3.0** (requisito estricto del servidor MCP de Webflow).

> ⚠️ **Node 22.3.0 es obligatorio**. Con Node 20, Webflow MCP
> **no arranca**. Esto es un requisito del propio paquete npm de Webflow,
> no de CerebroNico.

### Paso 1: Verificar versión de Node

```bash
node --version
# Debe ser v22.3.0 o superior
```

Si tienes una versión anterior, usar `nvm`:

```bash
# Instalar nvm si no lo tienes
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Instalar Node 22.3.0
nvm install 22.3.0
nvm use 22.3.0
nvm alias default 22.3.0
``n
# Limpiar cache de npx (evita que use versión vieja)
rm -rf ~/.npm/_npx
```

### Paso 2: Activar en `mcp_servers.json`

Editar `mcp_servers.json` y cambiar `enabled` a `true`:

```json
{
  "id": "webflow",
  "label": "Webflow: diseño y gestión de sitios vía IA (requiere cuenta + OAuth)",
  "comando": "npx",
  "args": ["-y", "webflow-mcp-server"],
  "enabled": true,
  "timeout": 30
}
```

> **Alternativa (remoto OAuth)**: Para usar el servidor remoto de Webflow
> con OAuth gestionado por Webflow (no almacena API keys localmente):
>
> ```json
> {
>   "id": "webflow",
>   "label": "Webflow MCP remoto (OAuth)",
>   "comando": "npx",
>   "args": ["-y", "@anthropic-ai/mcp-remote", "https://mcp.webflow.com/mcp"],
>   "enabled": true,
>   "timeout": 30
> }
> ```

### Paso 3: Sincronizar el puente

```bash
curl -X POST http://127.0.0.1:5000/api/mcp/sincronizar \
  -H "X-Cerebro-Token: $CN_BRIDGE_TOKEN"
```

O **reiniciar el IDE**.

### Paso 4: Flujo OAuth (primera vez)

1. La primera llamada a una herramienta `webflow_*` disparará el flujo OAuth.
2. Se abre el **navegador** → iniciar sesión en Webflow.
3. **Seleccionar los sitios** a los que dar acceso.
4. Clic en **"Authorize App"**.
5. El token se almacena en `~/.mcp-auth/`.
6. **App companion**: Webflow instala automáticamente una app companion
     en los sitios autorizados. Para herramientas del **Designer API**
   (manipulación visual en tiempo real), la app companion debe estar
   **abierta en el Designer de Webflow**.

### Alternativa: API key local (sin OAuth)

1. En Webflow: **Site Settings → Apps & Integrations**.
2. Generar un **API token**.
3. Configurar como variable de entorno:

```bash
export WEBFLOW_API_KEY="tu-api-key-de-webflow"
```

4. Modificar `mcp_servers.json`:

```json
{
  "id": "webflow",
  "label": "Webflow: gestión de sitios (API key local)",
  "comando": "npx",
  "args": ["-y", "webflow-mcp-server"],
  "env": { "WEBFLOW_API_KEY": "tu-api-key" },
  "enabled": true,
  "timeout": 30
}
```

> ⚠️ Con API key local solo funcionan las herramientas del **Data API**
> (CMS, colecciones, items, custom code, páginas). Las herramientas del
> **Designer API** (crear elementos, estilos, variables en canvas)
> **requieren OAuth remoto** + companion app.

### Verificación

```bash
# Con el servidor arrancado:
curl -s http://127.0.0.1:5000/tools | python3 -m json.tool | grep webflow
```

Debe mostrar ~22 herramientas `webflow_*`.

### Resetear OAuth

```bash
rm -rf ~/.mcp-auth
```

Reiniciar el IDE; se volverá a abrir el navegador.

### Troubleshooting Webflow

| Problema | Solución |
|----------|----------|
| Error 500 al cargar MCP | `rm -rf ~/.mcp-auth` y reiniciar |
| `npx` usa Node viejo | `rm -rf ~/.npm/_npx` + verificar `node --version` |
| Sitios greyed out | Solo owners/admins pueden autorizar |
| Designer tools no conectan | Abrir "MCP Bridge App" en Apps panel del Designer |
| `npm -v` solo con sudo | Corregir permisos globales de NPM |

---

## Flujo general en CerebroNico

```
Usuario pregunta en el chat
  → Modelo decide usar herramienta MCP
  → POST :5000/tools/call {name: "unblocked_context_research", arguments: {...}}
  → Puente Python (:5000) lanza proceso stdio JSON-RPC
  → Proceso MCP (npx @upstash/context7-mcp / mcp-remote / webflow-mcp-server)
  → Si primera vez: navegador → OAuth → token en ~/.mcp-auth/
  → Si no: usa token almacenado
  → Respuesta MCP → Puente → Modelo → Chat del usuario
```

## Variables de entorno relevantes

Añadir al `.env` según las skills que actives:

```bash
# Context7 (opcional — rate limits más altos)
CONTEXT7_API_KEY=

# Unblocked (alternativa a OAuth — Personal/Team API Token)
UNBLOCKED_API_TOKEN=

# Webflow (alternativa a OAuth — API key local, solo Data API)
WEBFLOW_API_KEY=
```

## Script de activación automática

`scripts/activar-skills.mjs` automatiza los 4 pasos manuales:

```bash
# Ver estado de todas las skills
node scripts/activar-skills.mjs --estado

# Activar una skill específica
node scripts/activar-skills.mjs --context7
node scripts/activar-skills.mjs --unblocked
node scripts/activar-skills.mjs --webflow

# Activar las 3 de golpe
node scripts/activar-skills.mjs --todas

# Resetear tokens OAuth (volver a autorizar)
node scripts/activar-skills.mjs --reset-oauth

# Desactivar una skill
node scripts/activar-skills.mjs --desactivar webflow

# Modo interactivo (menú)
node scripts/activar-skills.mjs
```

Qué hace el script por cada skill:
1. ✅ Verifica versión de Node (avisa si Webflow necesita 22.3.0+)
2. ✅ Edita `mcp_servers.json` → `enabled: true`
3. ✅ Pregunta si quieres poner API key/token en `.env` (opcional para OAuth)
4. ✅ Dispara `POST /api/tools/packs/recargar` si la IDE está arrancada


## Checklist de activación

- [ ] Node ≥20 instalado (≥22.3.0 si se usa Webflow MCP)
- [ ] `mcp_servers.json` editado con `enabled: true` en las skills deseadas
- [ ] `.env` configurado con tokens/API keys (si se usa alternativa a OAuth)
- [ ] IDE reiniciado o `POST /api/mcp/sincronizar`
- [ ] Flujo OAuth completado en el navegador (primera vez)
- [ ] `curl :5000/tools | grep <skill-id>` confirma herramientas disponibles
- [ ] Primer uso real en el chat

---

## Referencias

- Unblocked: https://getunblocked.com · https://docs.getunblocked.com/api-reference/quickstart
- Webflow MCP: https://developers.webflow.com/data/v1.0.0/docs/ai-tools · https://github.com/webflow/mcp-server
- Context7: https://github.com/upstash/context7 · https://mcp.context7.com
- `@anthropic-ai/mcp-remote`: puente MCP remoto con OAuth integrado
- Esquema MCP: https://modelcontextprotocol.io

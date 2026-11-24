---
name: context7
description: Docs actualizadas de librerías y frameworks — evita alucinaciones de APIs obsoletas. Se usa vía el servidor MCP Context7 (npx -y @upstash/context7-mcp) configurado en mcp_servers.json.
---

# Context7 — Documentación actualizada bajo demanda

Context7 es un servidor MCP que proporciona documentación actualizada de librerías
y frameworks directamente al chat. En lugar de confiar en datos de entrenamiento
que pueden estar desactualizados, Context7 busca la documentación más reciente
de la librería solicitada.

## Cuándo usar esta skill

- El usuario pregunta sobre configuración o setup de una librería
- Necesita ejemplos de código que involucren librerías específicas
- Referencia de APIs de frameworks (React, Vue, Next.js, Prisma, etc.)
- El usuario menciona una versión específica de una librería

## Cómo funciona en CerebroNico

1. El servidor MCP Context7 se configura en `mcp_servers.json` (id: "context7")
2. Se ejecuta vía `npx -y @upstash/context7-mcp` (transporte stdio)
3. El puente Python (:5000) lo conecta y expone sus herramientas
4. Las herramientas disponibles son:
   - `resolve-library-id`: Resolver el ID de la librería
   - `query-docs`: Buscar documentación específica

## Configuración

El servidor ya está pre-configurado en `mcp_servers.json`:

```json
{
  "id": "context7",
  "label": "Context7: docs actualizadas de librerías (API key opcional, sin ella rate limits bajitos)",
  "comando": "npx",
  "args": ["-y", "@upstash/context7-mcp"],
  "enabled": true,
  "timeout": 30
}
```

API key opcional (`CONTEXT7_API_KEY`) para rate limits más altos.

## Skills internas

Context7 incluye sub-skills para diferentes entornos:
- `context7-mcp`: Skill MCP principal
- `context7-cli`: Interfaz CLI
- `find-docs`: Búsqueda de documentación

## Fuente

Repositorio: https://github.com/upstash/context7
Versión: 4.0.3

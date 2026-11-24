# Webflow MCP Server

Integración MCP para Webflow: diseño y gestión de sitios Webflow con IA.

## Descripción

Servidor MCP (Model Context Protocol) para Webflow que permite:
- Gestionar sitios y colecciones de Webflow
- Leer y modificar componentes y propiedades del DOM
- Interactuar con el diseñador de Webflow via protocolo MCP

## Configuración

### Remoto (recomendado)

El servidor se conecta vía Streamable HTTP a:
```
https://mcp.webflow.com/mcp
```

### Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `WEBFLOW_API_KEY` | API key de Webflow | Sí |

## Herramientas disponibles

Ver `src/` para la lista completa de herramientas MCP expuestas.

## Fuente

Repositorio: https://github.com/webflow/mcp-server
Versión: 2.0.0

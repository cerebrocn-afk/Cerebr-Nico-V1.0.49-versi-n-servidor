---
name: cn-lectura-por-rangos
description: Presupuestar el contexto — ubicar con búsqueda, leer 30-60 líneas, decidir. Usarla en cualquier archivo de más de 400 líneas o cuando la conversación ya está cargada.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [search_in_files, read_file_range, list_files]
evidencia: [src/engine/techoContexto.ts, src/engine/contextoBucle.ts]
---
# Leer por rangos, no el archivo entero

> Presupuestar el contexto — ubicar con búsqueda, leer 30-60 líneas, decidir. Usarla en cualquier archivo de más de 400 líneas o cuando la conversación ya está cargada.

## Herramientas que usa (todas existen en este build)

`search_in_files` · `read_file_range` · `list_files`

## Receta

1. Primer paso: `list_files` o `search_in_files`, nunca `read_file` a ciegas de un archivo grande.
2. Con la línea exacta, `read_file_range` con 30 líneas de aire alrededor.
3. Si hace falta el contorno, otro rango; no se pide el archivo entero «por si acaso».

## Cómo se verifica (con números, no con adverbios)

- La edición usó texto copiado de lo leído, con la indentación tal cual.
- Ninguna lectura repitió un rango ya visto en el turno.

## No hacer

- No releer un archivo entero para confirmar un cambio: para eso está `revisar_cambios`.

## Evidencia en el repo

- `src/engine/techoContexto.ts`
- `src/engine/contextoBucle.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

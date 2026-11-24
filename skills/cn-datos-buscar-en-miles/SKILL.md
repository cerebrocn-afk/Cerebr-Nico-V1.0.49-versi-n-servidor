---
name: cn-datos-buscar-en-miles
description: Patrón de búsqueda — filtro chico primero, luego ampliar, siempre con conteo. Usarla para logs enormes, exportaciones masivas o el propio repo.
version: 1.0.0
dominio: datos
estado: probada
requiere: [search_in_files, read_file_range, run_command, list_files]
evidencia: [src/engine/localRAG.ts, src/engine/knowledgeBase.ts]
---
# Buscar en montones de archivos sin reventar

> Patrón de búsqueda — filtro chico primero, luego ampliar, siempre con conteo. Usarla para logs enormes, exportaciones masivas o el propio repo.

## Herramientas que usa (todas existen en este build)

`search_in_files` · `read_file_range` · `run_command` · `list_files`

## Receta

1. Empezar con el patrón más específico posible y un límite de resultados.
2. Si el conteo es enorme, se filtra por ruta o por fecha antes de volver a buscar.
3. Citar archivo:línea de cada hallazgo, no un resumen difuso.

## Cómo se verifica (con números, no con adverbios)

- Cada afirmación tiene su origen con línea.
- Ninguna lectura trajo un archivo de 200 MB al contexto.

## No hacer

- No iterar «leer todos los archivos» cuando hay un índice.

## Evidencia en el repo

- `src/engine/localRAG.ts`
- `src/engine/knowledgeBase.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

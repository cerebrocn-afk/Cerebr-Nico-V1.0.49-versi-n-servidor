---
name: cn-mem-indexar-proyecto
description: Montar/actualizar el índice del repo y su RAG local para que las búsquedas salgan baratas. Usarla al empezar sesión sobre un proyecto grande o cuando las búsquedas se repiten.
version: 1.0.0
dominio: memoria
estado: probada
requiere: [memory_indexar_proyecto, memory_recall, run_command, list_files]
evidencia: [src/engine/localRAG.ts, src/engine/grafoProyecto.ts]
---
# Indexar el proyecto para no volver a rastrearlo

> Montar/actualizar el índice del repo y su RAG local para que las búsquedas salgan baratas. Usarla al empezar sesión sobre un proyecto grande o cuando las búsquedas se repiten.

## Herramientas que usa (todas existen en este build)

`memory_indexar_proyecto` · `memory_recall` · `run_command` · `list_files`

## Receta

1. Indexar y verificar el conteo de archivos indexados contra `list_files`.
2. Reindexar después de mover mucho código, no al azar cada turno.
3. Si el índice está viejo, decirlo antes de responder de memoria del índice.

## Cómo se verifica (con números, no con adverbios)

- El índice menciona los archivos nuevos de esta obra.
- Las consultas salen por el índice, no por lecturas completas.

## No hacer

- No indexar node_modules ni artefactos binarios.

## Evidencia en el repo

- `src/engine/localRAG.ts`
- `src/engine/grafoProyecto.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

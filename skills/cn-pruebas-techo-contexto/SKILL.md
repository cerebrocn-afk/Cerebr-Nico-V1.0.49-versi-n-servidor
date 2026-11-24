---
name: cn-pruebas-techo-contexto
description: Paginar y filtrar cualquier lista que se inyecta al modelo, y medir los KB que cuesta. Usarla cuando se agrega catálogo, skill, herramienta o historial al prompt.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_command, read_file_range, edit_file, run_tests]
evidencia: [src/engine/techoContexto.ts, scripts/hindsight_daemon.py]
---
# Presupuesto de contexto en listas y catálogos

> Paginar y filtrar cualquier lista que se inyecta al modelo, y medir los KB que cuesta. Usarla cuando se agrega catálogo, skill, herramienta o historial al prompt.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file_range` · `edit_file` · `run_tests`

## Receta

1. Medir el costo real (KB) de la lista completa y de una página.
2. Exponer `filtro`/`desde`/`limite` y mandar el aviso de paginación para que el modelo no pida todo.
3. Probar hacia atrás: llamadas sin parámetros siguen funcionando.

## Cómo se verifica (con números, no con adverbios)

- La respuesta sin argumentos trae una página, no el catálogo entero.
- El costo por página está medido y declarado.

## No hacer

- No duplicar el catálogo en dos lugares del prompt «por si acaso».

## Evidencia en el repo

- `src/engine/techoContexto.ts`
- `scripts/hindsight_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

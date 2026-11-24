---
name: cn-plan-de-obra
description: Partir una tarea grande en tareas con criterio de término, y mantener el tablero diciendo la verdad. Usarla en cuanto el trabajo tiene más de tres pasos o va a durar más de un turno.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [set_plan, update_task, read_file, run_tests]
evidencia: [src/engine/planAdaptativo.ts, src/engine/taskStore.ts]
---
# Plan de obra con tareas verificables

> Partir una tarea grande en tareas con criterio de término, y mantener el tablero diciendo la verdad. Usarla en cuanto el trabajo tiene más de tres pasos o va a durar más de un turno.

## Herramientas que usa (todas existen en este build)

`set_plan` · `update_task` · `read_file` · `run_tests`

## Receta

1. Cada tarea se escribe como resultado («el .docx abre en Word»), no como actividad («investigar»).
2. Nada queda en curso al terminar el turno: se cierra, se archiva o se deja dicho el bloqueante.
3. El plan se actualiza cuando la realidad cambia, no cuando conviene.

## Cómo se verifica (con números, no con adverbios)

- Ninguna tarea queda `in_progress` fantasma.
- Cada tarea cerrada tiene una comprobación que la respalda.

## No hacer

- No inflar el plan con tareas internas de ejecución (leer un archivo no es un resultado).

## Evidencia en el repo

- `src/engine/planAdaptativo.ts`
- `src/engine/taskStore.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

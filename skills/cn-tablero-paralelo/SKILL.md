---
name: cn-tablero-paralelo
description: Repartir subtareas que no se tocan entre sí en el tablero paralelo y juntar resultados. Usarla cuando hay varias obras independientes (varios archivos, varios sitios) y una sola mano.
version: 1.0.0
dominio: app
estado: probada
requiere: [set_plan, update_task, read_file, revisar_cambios]
evidencia: [src/engine/tableroParalelo.ts, src/components/TableroParalelo.tsx]
---
# Trabajo en paralelo sin pisarse

> Repartir subtareas que no se tocan entre sí en el tablero paralelo y juntar resultados. Usarla cuando hay varias obras independientes (varios archivos, varios sitios) y una sola mano.

## Herramientas que usa (todas existen en este build)

`set_plan` · `update_task` · `read_file` · `revisar_cambios`

## Receta

1. Dividir por archivo, no por deseo: dos tareas sobre el mismo archivo se hacen en serie.
2. Cada rama con su criterio de término; el merge es una tarea aparte, no un supuesto.
3. Al unir, `revisar_cambios` y correr la puerta.

## Cómo se verifica (con números, no con adverbios)

- Ninguna escritura póstuma sobre el mismo rango.
- El plan muestra cada rama cerrada con su comprobación.

## No hacer

- No paralelizar una tarea con estado compartido (mismo archivo de configuración, mismo store).

## Evidencia en el repo

- `src/engine/tableroParalelo.ts`
- `src/components/TableroParalelo.tsx`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-web-plan-de-construccion
description: Pedir `plan_de_construccion` al pack creador y ejecutarlo por pasos con verificación intermedia. Usarla en obras grandes (varias páginas, componentes, despliegue).
version: 1.0.0
dominio: web
estado: probada
requiere: [plan_de_construccion, crear_sitio, set_plan, update_task]
evidencia: [scripts/creador_daemon.py, src/engine/ordenDeObra.ts]
---
# Plan de construcción antes de tocar el sitio

> Pedir `plan_de_construccion` al pack creador y ejecutarlo por pasos con verificación intermedia. Usarla en obras grandes (varias páginas, componentes, despliegue).

## Herramientas que usa (todas existen en este build)

`plan_de_construccion` · `crear_sitio` · `set_plan` · `update_task`

## Receta

1. Generar el plan y pasarlo a tareas con criterio de término por paso.
2. Ejecutar en orden: cada paso se verifica antes del siguiente (un sitio se cae por el segundo piso).
3. Si un paso cambia de rumbo, se actualiza el plan, no se lo ignora.

## Cómo se verifica (con números, no con adverbios)

- Ninguna tarea quedó en curso fantasma.
- El orden ejecutado coincide con el plan o la diferencia está explicada.

## No hacer

- No improvisar orden de bloques en una obra grande: después hay que rehacer.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/ordenDeObra.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

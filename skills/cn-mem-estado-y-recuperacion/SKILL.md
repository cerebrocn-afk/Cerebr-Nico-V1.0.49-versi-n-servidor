---
name: cn-mem-estado-y-recuperacion
description: Consultar el estado del hindsight y recuperar páginas concretas antes de asumir que el sistema no sabe algo. Usarla al empezar una obra larga o cuando el usuario dice «ya te había dicho».
version: 1.0.0
dominio: memoria
estado: probada
requiere: [memory_estado, memory_recall, memory_leer_page, memory_listar_pages]
evidencia: [scripts/hindsight_daemon.py, src/utils/memory.ts]
---
# Qué sabe la memoria y qué hay que recordarle

> Consultar el estado del hindsight y recuperar páginas concretas antes de asumir que el sistema no sabe algo. Usarla al empezar una obra larga o cuando el usuario dice «ya te había dicho».

## Herramientas que usa (todas existen en este build)

`memory_estado` · `memory_recall` · `memory_leer_page` · `memory_listar_pages`

## Receta

1. `memory_estado` para ver qué hay indexado y qué está viejo.
2. `memory_recall` con las palabras del usuario (en su idioma) y luego `memory_leer_page` de la página buena.
3. Citar de dónde salió el dato recuperado.

## Cómo se verifica (con números, no con adverbios)

- Lo recuperado se usó, no se leyó por leer.
- Nada se presentó como recuerdo si la búsqueda dio vacía.

## No hacer

- No inventar que «está en memoria» algo que no apareció en la búsqueda.

## Evidencia en el repo

- `scripts/hindsight_daemon.py`
- `src/utils/memory.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

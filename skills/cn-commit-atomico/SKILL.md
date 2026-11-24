---
name: cn-commit-atomico
description: Cortar el trabajo en commits que se pueden revertir solos, con mensaje que se entiende seis meses después. Usarla al cerrar cada unidad de obra, no al final del día.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [git_status, git_diff, git_commit]
evidencia: [src/engine/quirofano.ts, src/data/skills100.ts]
---
# Commit atómico que dice qué y por qué

> Cortar el trabajo en commits que se pueden revertir solos, con mensaje que se entiende seis meses después. Usarla al cerrar cada unidad de obra, no al final del día.

## Herramientas que usa (todas existen en este build)

`git_status` · `git_diff` · `git_commit`

## Receta

1. Un commit por intención: la máquina, el cable, la valla y el documento pueden ser cuatro.
2. Mensaje: imperativo corto + línea de por qué (la razón es la que se necesita en marzo).
3. Si el cambio tocó un archivo con trinquete, decirlo en el mensaje.

## Cómo se verifica (con números, no con adverbios)

- `git_status` queda limpio.
- Revertir el commit no rompe nada más (se puede probar en una rama).

## No hacer

- No mezclar refactor y cambio de conducta en el mismo commit.

## Evidencia en el repo

- `src/engine/quirofano.ts`
- `src/data/skills100.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

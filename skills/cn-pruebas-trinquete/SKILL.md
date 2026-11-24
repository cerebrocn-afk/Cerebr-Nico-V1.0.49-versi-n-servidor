---
name: cn-pruebas-trinquete
description: Mover lógica afuera de `server.ts` en vez de agrandarlo, y medir contra el contrato. Usarla ante cualquier cambio que toque el monolito.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_command, read_file_range, edit_file, write_file]
evidencia: [contrato-rutas.json, tests/vallasVivas.test.ts]
---
# Respetar el presupuesto de líneas del monolito

> Mover lógica afuera de `server.ts` en vez de agrandarlo, y medir contra el contrato. Usarla ante cualquier cambio que toque el monolito.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file_range` · `edit_file` · `write_file`

## Receta

1. Antes de escribir, mirar el número: `presupuesto_lineas` de `contrato-rutas.json` contra las líneas reales.
2. Si no entra, la lógica nueva va a un módulo de `src/engine/` y al monolito solo se le monta el `case` (varios `case` pueden compartir una línea).
3. Correr las vallas que miden el trinquete.

## Cómo se verifica (con números, no con adverbios)

- Las líneas del monolito no superan el presupuesto.
- El presupuesto no se agrandó para que pase: eso es perder el trinquete.

## No hacer

- No subir el techo del contrato para acomodar un cambio: el techo existe para obligar a partir.

## Evidencia en el repo

- `contrato-rutas.json`
- `tests/vallasVivas.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-quirofano-controlado
description: Parchear el propio cuerpo del IDE por el quirófano — instantánea antes, verificación después, reversión si algo huele mal. Usarla ante cualquier edición de archivos del núcleo, y siempre antes de un cambio grande del monolito.
version: 1.0.0
dominio: app
estado: probada
requiere: [run_command, read_file_range, revisar_cambios, run_tests]
evidencia: [src/engine/quirofano.ts, scripts/quirofano-cli.mjs]
---
# Cirugía de código con instantánea y reversión

> Parchear el propio cuerpo del IDE por el quirófano — instantánea antes, verificación después, reversión si algo huele mal. Usarla ante cualquier edición de archivos del núcleo, y siempre antes de un cambio grande del monolito.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file_range` · `revisar_cambios` · `run_tests`

## Receta

1. `node scripts/quirofano-cli.mjs iniciar` para la instantánea; sin instantánea no hay cirugía.
2. Parchear, `verificar`, y correr la suite del área afectada.
3. Si la verificación marca `peligroso`, `revertir` en vez de insistir.

## Cómo se verifica (con números, no con adverbios)

- Hay registro de la operación y su resultado.
- El verde se obtuvo con la puerta, no con un test suelto.

## No hacer

- No editar el quirófano, la transacción o `validar.mjs` desde el lazo automático: son rutas intocables a propósito.

## Evidencia en el repo

- `src/engine/quirofano.ts`
- `scripts/quirofano-cli.mjs`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

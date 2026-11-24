---
name: cn-contrato-de-superficie
description: Mantener al día la foto de qué exporta cada módulo cuando se parte el monolito o se muda una función. Usarla después de cualquier extracción de archivo, antes de dar por cerrado el cambio.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [run_command, read_file, revisar_cambios, edit_file]
evidencia: [scripts/superficie.mjs, src/engine/contratoSuperficie.ts]
---
# Regenerar el contrato de superficie tras mover código

> Mantener al día la foto de qué exporta cada módulo cuando se parte el monolito o se muda una función. Usarla después de cualquier extracción de archivo, antes de dar por cerrado el cambio.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `revisar_cambios` · `edit_file`

## Receta

1. Correr `node scripts/superficie.mjs` para regenerar y `--verificar` para comprobar.
2. Leer el diff del contrato: los símbolos que desaparecieron tienen que tener dueño nuevo.
3. Si un símbolo se perdió de verdad, se restaura o se declara la pérdida en la respuesta.

## Cómo se verifica (con números, no con adverbios)

- `superficie:verificar` termina en 0.
- El contrato nuevo menciona el módulo nuevo.

## No hacer

- No commitear un cambio de superficie sin regenerar: el próximo diff será ruido incompresible.

## Evidencia en el repo

- `scripts/superficie.mjs`
- `src/engine/contratoSuperficie.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-refactor-estricto
description: Apretar un archivo para que el compilador trabaje a favor — tipos reales en lugar de `any`, guards en las fronteras y cero casts de conveniencia. Usarla antes de que un módulo crezca o cuando un bug fue un campo mal nombrado.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file, edit_file, run_command, search_in_files]
evidencia: [src/engine/syntaxGuard.ts, src/engine/importChecker.ts]
---
# Refactorizaci TypeScript estricta sin `any`

> Apretar un archivo para que el compilador trabaje a favor — tipos reales en lugar de `any`, guards en las fronteras y cero casts de conveniencia. Usarla antes de que un módulo crezca o cuando un bug fue un campo mal nombrado.

## Herramientas que usa (todas existen en este build)

`read_file` · `edit_file` · `run_command` · `search_in_files`

## Receta

1. Correr el chequeo real: `run_command` con `npx tsc --noEmit` y leer la lista de errores, no el resumen.
2. Atacar primero los `any` en las fronteras (argumentos de herramientas, JSON externo): ahí entra el mundo y ahí miente.
3. Sustituir cada cast por un guard que devuelva motivo legible cuando la forma no cuadra.
4. Volver a correr el chequeo y comparar conteo contra conteo; si subió, se trajo un error nuevo.

## Cómo se verifica (con números, no con adverbios)

- `tsc --noEmit` en 0 errores (o menos que antes, con los restantes justificados en el mensaje).
- Ningún `as any` nuevo en el diff.

## No hacer

- No cambiar nombres de API pública «de paso»: eso es otra obra y se paga aparte.

## Evidencia en el repo

- `src/engine/syntaxGuard.ts`
- `src/engine/importChecker.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

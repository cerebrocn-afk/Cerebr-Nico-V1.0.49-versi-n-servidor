---
name: cn-pruebas-guardian-regresion
description: Transformar un error repetitive en una valla que lo impide en el futuro, con su motivo en el código. Usarla después de arreglar cualquier bug que pudo haberse evitado.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [edit_file, run_tests, read_file, run_command]
evidencia: [src/engine/guardianRegresion.ts, tests/resiliencia.test.ts]
---
# Cada lección convertida en guardián

> Transformar un error repetitive en una valla que lo impide en el futuro, con su motivo en el código. Usarla después de arreglar cualquier bug que pudo haberse evitado.

## Herramientas que usa (todas existen en este build)

`edit_file` · `run_tests` · `read_file` · `run_command`

## Receta

1. Formular la regla en una frase que se pueda evaluar en el archivo («no escribir claves en el árbol»).
2. Implementarla como guardián con motivo legible y prueba propia.
3. Anclarla a la puerta y citar en el comentario la vez que dolió.

## Cómo se verifica (con números, no con adverbios)

- Sembrar el error otra vez hace que el guardián falle (probado).
- El motivo del fallo dice qué hacer, no solo «prohibido».

## No hacer

- No dejar la lección solo en un comentario: los comentarios no bloquean merges.

## Evidencia en el repo

- `src/engine/guardianRegresion.ts`
- `tests/resiliencia.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

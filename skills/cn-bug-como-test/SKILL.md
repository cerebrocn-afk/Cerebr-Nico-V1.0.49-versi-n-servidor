---
name: cn-bug-como-test
description: Regresar de cada corrección con una valla que impide que el mismo bug vuelva. Usarla en cuanto hay un fallo reproducble, un reporte de «antes sí andaba» o un error visto en producción.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file, write_file, run_tests, edit_file]
evidencia: [src/engine/patronesFallo.ts, src/engine/guardianRegresion.ts]
---
# Convertir el bug en test antes de arreglarlo

> Regresar de cada corrección con una valla que impide que el mismo bug vuelva. Usarla en cuanto hay un fallo reproducble, un reporte de «antes sí andaba» o un error visto en producción.

## Herramientas que usa (todas existen en este build)

`read_file` · `write_file` · `run_tests` · `edit_file`

## Receta

1. Copiar la entrada real que rompió el sistema (del log, del archivo del usuario) dentro del test, tal cual, con sus acentos y sus bytes raros.
2. Afirmar el comportamiento correcto, no el actual.
3. Correr: rojo. Arreglar. Correr: verde.
4. Etiquetar la prueba con la versión y la frase del usuario, como hace la casa (`tests/*.test.ts` dice el porqué en el encabezado).

## Cómo se verifica (con números, no con adverbios)

- El test falla con el código viejo y pasa con el nuevo (se comprueba en las dos versiones si hace falta).
- La entrada del test es real, no una paráfrasis limpia.

## No hacer

- No «verificar a mano que ya no pasa» sin dejar la prueba escrita.

## Evidencia en el repo

- `src/engine/patronesFallo.ts`
- `src/engine/guardianRegresion.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

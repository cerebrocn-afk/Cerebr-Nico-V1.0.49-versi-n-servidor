---
name: cn-pruebas-determinismo
description: Exigir que los generadores sean reproducibles — fecha fija dentro del artefacto, orden estable, sha256 comparable. Usarla en cualquier generador de archivos, planos o empaques.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_command, run_tests, read_file, edit_file]
evidencia: [src/engine/zipMinimo.ts, tests/zipDocx.test.ts]
---
# Misma entrada, mismos bytes

> Exigir que los generadores sean reproducibles — fecha fija dentro del artefacto, orden estable, sha256 comparable. Usarla en cualquier generador de archivos, planos o empaques.

## Herramientas que usa (todas existen en este build)

`run_command` · `run_tests` · `read_file` · `edit_file`

## Receta

1. Generar dos veces y comparar sha256; si difiere, hay un reloj, un `Map` desordenado o un path absoluto adentro.
2. Congelar lo que cambia (fecha DOS fija, orden alfabético de entradas).
3. Dejar la comprobación de determinismo como prueba, no como ritual manual.

## Cómo se verifica (con números, no con adverbios)

- Dos corridas producen el mismo hash.
- Un cambio de contenido real sí cambia el hash (la prueba no es trivial).

## No hacer

- No aceptar «sale distinto pero funciona»: sin determinismo no se puede auditar una entrega.

## Evidencia en el repo

- `src/engine/zipMinimo.ts`
- `tests/zipDocx.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

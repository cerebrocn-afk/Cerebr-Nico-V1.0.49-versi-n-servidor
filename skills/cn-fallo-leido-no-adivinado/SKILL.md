---
name: cn-fallo-leido-no-adivinado
description: Diagnóstico por evidencia — comando, salida, línea. Usarla cuando algo «no anda», cuando una orden devolvió un error o cuando la tentación es cambiar algo al azar a ver si mejora.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [run_command, read_file_range, search_in_files]
evidencia: [src/engine/vigilanteDeFallos.ts, src/engine/reconocimientoError.ts]
---
# Leer el fallo real antes de tocar nada

> Diagnóstico por evidencia — comando, salida, línea. Usarla cuando algo «no anda», cuando una orden devolvió un error o cuando la tentación es cambiar algo al azar a ver si mejora.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file_range` · `search_in_files`

## Receta

1. Reproducir con el mismo comando y copiar la salida completa, incluida la primera línea.
2. Buscar el archivo y la línea que nombra el error; leer ese rango.
3. Formular la hipótesis en una frase verificable y baratearla con la comprobación más barata.
4. Arreglar UNA cosa y volver a correr el mismo comando.

## Cómo se verifica (con números, no con adverbios)

- La explicación cita la línea y el mensaje tal como salieron.
- El comando original pasa, o queda dicho qué falta (no se declara éxito en silencio).

## No hacer

- No reinstalar ni borrar caché como primer movimiento: eso tapa el diagnóstico.
- No decir «probá de nuevo» sin haber leído el error.

## Evidencia en el repo

- `src/engine/vigilanteDeFallos.ts`
- `src/engine/reconocimientoError.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

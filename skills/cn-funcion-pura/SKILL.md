---
name: cn-funcion-pura
description: Sacar una decisión enterrada en un handler o en el monolito hacia una función pura con tests. Usarla cuando alguien diga «esto no se puede probar», «está todo mezclado» o cuando un bug dependa de un `if` invisible.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file_range, edit_file, write_file, run_tests, find_symbol]
evidencia: [src/engine/certeza.ts, src/engine/catalogoHonesto.ts]
---
# Extraer lógica a función pura testeable

> Sacar una decisión enterrada en un handler o en el monolito hacia una función pura con tests. Usarla cuando alguien diga «esto no se puede probar», «está todo mezclado» o cuando un bug dependa de un `if` invisible.

## Herramientas que usa (todas existen en este build)

`read_file_range` · `edit_file` · `write_file` · `run_tests` · `find_symbol`

## Receta

1. Localizar la rama con `find_symbol` y leer 30 líneas alrededor con `read_file_range`: el contexto chico evita reescribir de memoria.
2. Copiar la decisión a una función nueva que reciba los datos ya resueltos (nada de `exists` interno: se inyecta como juzgador, como hace `auditarCatalogo`).
3. Dejar el sitio original llamando a la función y sin lógica propia.
4. Tastar la función con los casos raros que se vieron en el log, no con los obvios.

## Cómo se verifica (con números, no con adverbios)

- La función se puede importar en un test sin levantar servidor ni filesystem.
- El comportamiento del viejo camino no cambió: mismo resultado con misma entrada.

## No hacer

- No extraer una función que termina leyendo `process.env`: eso es mover el problema, no resolverlo.

## Evidencia en el repo

- `src/engine/certeza.ts`
- `src/engine/catalogoHonesto.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

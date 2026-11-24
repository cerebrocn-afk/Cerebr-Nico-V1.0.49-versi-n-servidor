---
name: cn-trazas-limpia
description: Depurar con prefijo único y limpieza garantizada. Usarla cuando el flujo es largo, asíncrono, o cuando el bug es de orden/timing y el debugger no alcanza.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [edit_file, run_command, search_in_files, read_file]
evidencia: [src/engine/rotacionTrazas.ts, src/engine/latido.ts]
---
# Trazas para ver, y borrarlas después

> Depurar con prefijo único y limpieza garantizada. Usarla cuando el flujo es largo, asíncrono, o cuando el bug es de orden/timing y el debugger no alcanza.

## Herramientas que usa (todas existen en este build)

`edit_file` · `run_command` · `search_in_files` · `read_file`

## Receta

1. Prefijo propio y buscable en cada traza (`[cn-debug-9x]`), con el dato que importa, no «llegué acá».
2. Correr y filtrar por el prefijo con `search_in_files` o `rg`.
3. Borrar las trazas al terminar: la búsqueda del prefijo tiene que dar cero antes de cerrar la obra.

## Cómo se verifica (con números, no con adverbios)

- `search_in_files` del prefijo devuelve 0 coincidencias al final.
- Ningún log secreto quedó en las trazas (claves, tokens, rutas de usuario).

## No hacer

- No dejar `console.log` de depuración en el monolito: contamina la telemetría real.

## Evidencia en el repo

- `src/engine/rotacionTrazas.ts`
- `src/engine/latido.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

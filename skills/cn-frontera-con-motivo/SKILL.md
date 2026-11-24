---
name: cn-frontera-con-motivo
description: Poner try/catch donde entra el mundo (archivo, red, modelo) y devolver `{ ok:false, motivo }` en vez de lanzar. Usarla en toda herramienta, lector de formatos y auditor.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file_range, edit_file, run_tests]
evidencia: [src/engine/zipMinimo.ts, src/engine/herramientaZip.ts]
---
# Manejar la frontera con motivo legible

> Poner try/catch donde entra el mundo (archivo, red, modelo) y devolver `{ ok:false, motivo }` en vez de lanzar. Usarla en toda herramienta, lector de formatos y auditor.

## Herramientas que usa (todas existen en este build)

`read_file_range` · `edit_file` · `run_tests`

## Receta

1. Identificar la frontera: todo lo que lee bytes, abre puerto o llama a un proveedor.
2. Envolver y convertir la excepción en motivo para humanos («el archivo no se puede leer: …»), nombrando qué se perdió.
3. En un auditor, preferir `{ok:false}` a un lanzamiento: un auditor que lanza es peor que uno que dice «no».
4. Tastar el camino malo: bytes rotos, archivo inexistente, respuesta vacía.

## Cómo se verifica (con números, no con adverbios)

- Con entrada podrida la herramienta devuelve motivo, no stack trace.
- Hay una prueba del camino de rechazo.

## No hacer

- No capturar y seguir de largo: el silencio es el peor bug del lote.

## Evidencia en el repo

- `src/engine/zipMinimo.ts`
- `src/engine/herramientaZip.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

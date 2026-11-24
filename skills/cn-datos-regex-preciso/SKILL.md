---
name: cn-datos-regex-preciso
description: Escribir el patrón mínimo que coincide con lo que se quiere y verificarlo con casos reales, incluidos los que NO deben coincidir. Usarla para extraer códigos, versiones, rutas o identificadores.
version: 1.0.0
dominio: datos
estado: probada
requiere: [run_command, search_in_files, read_file_range]
evidencia: [src/utils/codeParser.ts, src/engine/validadorAST.ts]
---
# Expresión regular chiquita y probada

> Escribir el patrón mínimo que coincide con lo que se quiere y verificarlo con casos reales, incluidos los que NO deben coincidir. Usarla para extraer códigos, versiones, rutas o identificadores.

## Herramientas que usa (todas existen en este build)

`run_command` · `search_in_files` · `read_file_range`

## Receta

1. Sacar 5 ejemplos reales del archivo y 3 contraejemplos.
2. Probar el patrón con un comando (`node -e` o `rg`) sobre los ejemplos, leyendo la salida.
3. Anclar (`^`, `$`, límites de palabra) antes de agrandar el patrón.

## Cómo se verifica (con números, no con adverbios)

- Coincide con los 5 y no coincide con los 3.
- No hay catastrofismo de backtracking (nada de `(a+)+`).

## No hacer

- No parsear HTML, JSON o fechas con regex cuando existe la herramienta que lo hace bien.

## Evidencia en el repo

- `src/utils/codeParser.ts`
- `src/engine/validadorAST.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

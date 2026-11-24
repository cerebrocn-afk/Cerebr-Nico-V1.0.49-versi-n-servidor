---
name: cn-datos-muestra-honesta
description: Mostrar un puñado de registros y decir el total real, con la forma en que se contó. Usarla ante archivos grandes, exportaciones o logs donde la tentación es pegar 300 líneas.
version: 1.0.0
dominio: datos
estado: probada
requiere: [read_file_range, run_command, list_files, search_in_files]
evidencia: [src/engine/compactor.ts, src/utils/prosaLegible.ts]
---
# Muestra de 5, total medido

> Mostrar un puñado de registros y decir el total real, con la forma en que se contó. Usarla ante archivos grandes, exportaciones o logs donde la tentación es pegar 300 líneas.

## Herramientas que usa (todas existen en este build)

`read_file_range` · `run_command` · `list_files` · `search_in_files`

## Receta

1. Medir el total con un comando (`wc -l`, conteo de claves) y decir cómo se contó.
2. Mostrar 3-5 registros representativos, incluyendo el primero y uno raro.
3. Declarar qué se recortó y dónde está el archivo completo.

## Cómo se verifica (con números, no con adverbios)

- El total tiene comando que lo produjo.
- Ningún «aproximadamente» cuando se pudo contar.

## No hacer

- No extrapolar conclusiones desde la muestra que se mostró.

## Evidencia en el repo

- `src/engine/compactor.ts`
- `src/utils/prosaLegible.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

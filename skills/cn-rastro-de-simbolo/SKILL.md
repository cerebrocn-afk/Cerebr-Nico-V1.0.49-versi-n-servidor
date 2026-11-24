---
name: cn-rastro-de-simbolo
description: Antes de renombrar, mover o borrar una función o constante, averiguar todas sus bocas — imports, `case` del switch de herramientas, cadenas del prompt y tests. Usarla siempre que la mano vaya a un símbolo compartido.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [find_symbol, search_in_files, read_file_range, revisar_cambios]
evidencia: [src/engine/symbolIndex.ts, src/engine/toolRegistry.ts]
---
# Rastrear quién usa un símbolo antes de tocarlo

> Antes de renombrar, mover o borrar una función o constante, averiguar todas sus bocas — imports, `case` del switch de herramientas, cadenas del prompt y tests. Usarla siempre que la mano vaya a un símbolo compartido.

## Herramientas que usa (todas existen en este build)

`find_symbol` · `search_in_files` · `read_file_range` · `revisar_cambios`

## Receta

1. `find_symbol` para la definición y los usos directos.
2. `search_in_files` con el nombre crudo (sin comillas) para cazar las cadenas: los nombres de herramienta viajan como texto en specs y en el prompt.
3. Contar los hits y anotarlos en el plan; si un número no está en la lista, no se toca.
4. Aplicar el cambio y pasar `revisar_cambios` para ver el diff completo antes de continuar.

## Cómo se verifica (con números, no con adverbios)

- El conteo de usos antes y después cierra (los renombrados aparecen los dos lados en el diff).
- Ningún `case "..."` del monolito quedó huérfano ni duplicado.

## No hacer

- No borrar un símbolo solo porque `search_in_files` dio cero: puede estar vivo en un string del daemon Python.

## Evidencia en el repo

- `src/engine/symbolIndex.ts`
- `src/engine/toolRegistry.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

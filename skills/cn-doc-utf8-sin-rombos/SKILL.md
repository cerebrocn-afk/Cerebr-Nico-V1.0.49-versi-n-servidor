---
name: cn-doc-utf8-sin-rombos
description: Detectar y corregir `ï¿½`, `Ã¡`, rombos y dobles codificaciones en texto que viene de Windows, CSV o logs. Usarla cuando el texto se ve roto aunque el archivo «está bien».
version: 1.0.0
dominio: documentos
estado: probada
requiere: [read_file, run_command, edit_file]
evidencia: [src/utils/formatFixer.ts, src/engine/superPrompt.ts]
---
# Mojibake y UTF-8: arreglar la codificación, no el síntoma

> Detectar y corregir `ï¿½`, `Ã¡`, rombos y dobles codificaciones en texto que viene de Windows, CSV o logs. Usarla cuando el texto se ve roto aunque el archivo «está bien».

## Herramientas que usa (todas existen en este build)

`read_file` · `run_command` · `edit_file`

## Receta

1. Determinar la codificación real (BOM, bytes sueltos) antes de tocar.
2. Aplicar el saneado del proyecto y comparar antes/después con la misma muestra.
3. Escribir la salida como UTF-8 explícito, y decir en qué quedó.

## Cómo se verifica (con números, no con adverbios)

- La muestra final no tiene caracteres de reemplazo.
- Ningún carácter legítimo se perdió al «limpiar».

## No hacer

- No borrar los caracteres raros: muchas veces son la ñ del cliente.

## Evidencia en el repo

- `src/utils/formatFixer.ts`
- `src/engine/superPrompt.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

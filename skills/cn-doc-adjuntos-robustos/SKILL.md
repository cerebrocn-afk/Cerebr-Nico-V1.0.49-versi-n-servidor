---
name: cn-doc-adjuntos-robustos
description: Tragar archivos corruptos, con mojibake o de formatos viejos (docx/rtf/csv) sin tirar el turno. Usarla cuando el adjunto del usuario «no se puede leer» o llega con caracteres rotos.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [read_file, run_command, list_files]
evidencia: [src/utils/attachmentProcessor.ts, src/utils/formatFixer.ts]
---
# Adjuntos raros sin que revienten

> Tragar archivos corruptos, con mojibake o de formatos viejos (docx/rtf/csv) sin tirar el turno. Usarla cuando el adjunto del usuario «no se puede leer» o llega con caracteres rotos.

## Herramientas que usa (todas existen en este build)

`read_file` · `run_command` · `list_files`

## Receta

1. Mirar qué es de verdad (bytes, cabecera, tamaño) antes de creer la extensión.
2. Extraer con el camino tolerante del proyecto; si una parte está podrida, se recupera el resto y se declara.
3. Devolver el texto con los acentos arreglados, no el mojibake original.

## Cómo se verifica (con números, no con adverbios)

- La salida no tiene rombos ni `ï¿½`.
- Se dijo qué parte del archivo no se pudo recuperar.

## No hacer

- No declarar «archivo dañado, no se puede» sin haberlo abierto con el extractor.

## Evidencia en el repo

- `src/utils/attachmentProcessor.ts`
- `src/utils/formatFixer.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

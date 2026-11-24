---
name: cn-doc-bloques-markdown
description: Escribir y reparar Markdown con bloques de código bien cercados, tablas válidas y anclas que existen. Usarla cuando un .md se rompió al renderizar o cuando se manda un informe largo al chat.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [read_file, edit_file, search_in_files, write_file]
evidencia: [src/utils/bloquesMarkdown.ts, src/utils/prosaLegible.ts]
---
# Markdown sin bloques rotos ni cercas mal cerradas

> Escribir y reparar Markdown con bloques de código bien cercados, tablas válidas y anclas que existen. Usarla cuando un .md se rompió al renderizar o cuando se manda un informe largo al chat.

## Herramientas que usa (todas existen en este build)

`read_file` · `edit_file` · `search_in_files` · `write_file`

## Receta

1. Contar las cercas (` ``` `) del archivo: un número impar es la causa del 80% de los desastres.
2. Reparar la cerca huérfana y volver a contar.
3. Verificar que las tablas tengan la fila separadora y que cada enlace apunte a algo real.

## Cómo se verifica (con números, no con adverbios)

- El archivo tiene cercas pareadas.
- Los encabezados no saltan de nivel.

## No hacer

- No anidar Markdown dentro de una cerca «para que se vea»: se muestra literal.

## Evidencia en el repo

- `src/utils/bloquesMarkdown.ts`
- `src/utils/prosaLegible.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

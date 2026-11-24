---
name: cn-doc-tablas-y-csv
description: Convertir tablas pegadas (chat, PDF, Word) en CSV/JSON parejos, con separador y comillas resueltos. Usarla cuando el usuario pega una tabla o pide «esto en Excel/CSV».
version: 1.0.0
dominio: documentos
estado: probada
requiere: [convertir_formato, read_file, write_file, run_command]
evidencia: [src/engine/reflejo/consejo.ts, src/utils/attachmentProcessor.ts]
---
# Tablas y CSV: de texto pegado a datos pares

> Convertir tablas pegadas (chat, PDF, Word) en CSV/JSON parejos, con separador y comillas resueltos. Usarla cuando el usuario pega una tabla o pide «esto en Excel/CSV».

## Herramientas que usa (todas existen en este build)

`convertir_formato` · `read_file` · `write_file` · `run_command`

## Receta

1. Identificar el separador real (coma/punto y coma/tab) mirando una fila con comas internas.
2. Normalizar cabeceras (sin espacios, con tildes resueltas) y contar columnas por fila.
3. Emitir y releer: si una fila cambia de ancho, se declara cuál.

## Cómo se verifica (con números, no con adverbios)

- El conteo de columnas es idéntico en todas las filas.
- Los números no perdieron decimales ni se convirtieron en fechas.

## No hacer

- No suponer coma decimal «porque es español»: se mira el archivo.

## Evidencia en el repo

- `src/engine/reflejo/consejo.ts`
- `src/utils/attachmentProcessor.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

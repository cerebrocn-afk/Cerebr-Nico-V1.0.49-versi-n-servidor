---
name: cn-doc-tabla-en-word
description: Convertir datos tabulares a la `tabla` del .docx (filas de celdas, primera fila como encabezado). Usarla cuando el contenido tiene más de dos dimensiones o el usuario compara opciones.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [crear_docx, read_file_range, convertir_formato]
evidencia: [src/engine/docxMinimo.ts, src/engine/reflejo/consejo.ts]
---
# Comparaciones en tabla, no en párrafo

> Convertir datos tabulares a la `tabla` del .docx (filas de celdas, primera fila como encabezado). Usarla cuando el contenido tiene más de dos dimensiones o el usuario compara opciones.

## Herramientas que usa (todas existen en este build)

`crear_docx` · `read_file_range` · `convertir_formato`

## Receta

1. Normalizar los datos a matriz pareja (misma cantidad de columnas por fila) antes de escribir.
2. Poner unidad en la celda cuando el número la necesita («1.234 USD», no 1234).
3. Dejar la explicación del hallazgo en un párrafo antes o después de la tabla, no dentro.

## Cómo se verifica (con números, no con adverbios)

- El conteo de `w:tc` del documento es filas×columnas (se puede verificar reabriendo el paquete).
- Ninguna celda vacía por descuido.

## No hacer

- No poner una tabla de 12 columnas en página A4: se divide o se gira.

## Evidencia en el repo

- `src/engine/docxMinimo.ts`
- `src/engine/reflejo/consejo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

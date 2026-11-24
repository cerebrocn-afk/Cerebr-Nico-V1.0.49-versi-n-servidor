---
name: cn-doc-plantilla-corporativa
description: Usar los estilos del .docx (título, subtítulo, viñetas, tabla con encabezado) para que el documento se vea hecho por una persona y no por un volcado. Usarla en informes, actas y propuestas que se comparten.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [crear_docx, read_file]
evidencia: [src/engine/docxMinimo.ts, src/engine/generadorDocumentos.ts]
---
# Documento con voz y jerarquía consistente

> Usar los estilos del .docx (título, subtítulo, viñetas, tabla con encabezado) para que el documento se vea hecho por una persona y no por un volcado. Usarla en informes, actas y propuestas que se comparten.

## Herramientas que usa (todas existen en este build)

`crear_docx` · `read_file`

## Receta

1. Definir la jerarquía: Título2 por sección, párrafos corridos para argumento, viñetas para listas, tabla para comparaciones.
2. Firmar con `autor` y cerrar con `nota` cuando corresponde.
3. Releer la muestra devuelta y revisar que la jerarquía no quedó aplastada en un solo estilo.

## Cómo se verifica (con números, no con adverbios)

- Las tablas del documento tienen fila de encabezado.
- No hay sección con tres puntos convertidos en párrafo.

## No hacer

- No imitar negritas metiendo `**` en el texto: Word no las interpreta.

## Evidencia en el repo

- `src/engine/docxMinimo.ts`
- `src/engine/generadorDocumentos.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

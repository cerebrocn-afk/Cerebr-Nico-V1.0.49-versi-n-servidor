---
name: cn-doc-leer-word-ajeno
description: Extraer texto, tablas y adjuntos de un .docx o .rtf ajeno con el extractor de adjuntos. Usarla cuando el usuario sube un documento y pregunta por su contenido o quiere que se continúe a partir de él.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [read_file, list_files, run_command]
evidencia: [src/utils/attachmentProcessor.ts, src/utils/fileParser.ts]
---
# Leer el Word del usuario sin romperlo

> Extraer texto, tablas y adjuntos de un .docx o .rtf ajeno con el extractor de adjuntos. Usarla cuando el usuario sube un documento y pregunta por su contenido o quiere que se continúe a partir de él.

## Herramientas que usa (todas existen en este build)

`read_file` · `list_files` · `run_command`

## Receta

1. Confirmar la ruta y el tamaño real del archivo subido.
2. Extraer con el camino probado del proyecto (ZIP + XML), no con un parser improvisado.
3. Citar textualmente lo relevante y separar lo que es dato de lo que es formato.

## Cómo se verifica (con números, no con adverbios)

- Lo citado está en el archivo (se puede señalar la parte).
- El original quedó intacto.

## No hacer

- No reescribir encima del documento del usuario; la entrega es un archivo nuevo.

## Evidencia en el repo

- `src/utils/attachmentProcessor.ts`
- `src/utils/fileParser.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

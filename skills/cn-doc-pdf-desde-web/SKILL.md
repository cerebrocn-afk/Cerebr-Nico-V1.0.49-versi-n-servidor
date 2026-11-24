---
name: cn-doc-pdf-desde-web
description: Traer el contenido de una URL con `fetch_url`, seleccionar lo que importa y cerrarlo en PDF con la fuente citada. Usarla para «pasame esta página a PDF», resúmenes de referencia o anexos de una obra.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [fetch_url, crear_pdf, run_command]
evidencia: [src/engine/busquedaWebNube.ts, src/engine/pdfMinimo.ts]
---
# PDF de una página externa leída de verdad

> Traer el contenido de una URL con `fetch_url`, seleccionar lo que importa y cerrarlo en PDF con la fuente citada. Usarla para «pasame esta página a PDF», resúmenes de referencia o anexos de una obra.

## Herramientas que usa (todas existen en este build)

`fetch_url` · `crear_pdf` · `run_command`

## Receta

1. Traer la URL y verificar que el contenido llegó (una página vacía o un muro de cookies no es una fuente).
2. Separar dato de decoración; citar la URL y la fecha de consulta.
3. Cerrar en PDF y decir qué se recortó.

## Cómo se verifica (con números, no con adverbios)

- Cada afirmación del PDF tiene su fuente con enlace.
- Los datos fechados llevan su fecha.

## No hacer

- No resumir de memoria una página que no se trajo: eso es inventar con confianza.

## Evidencia en el repo

- `src/engine/busquedaWebNube.ts`
- `src/engine/pdfMinimo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

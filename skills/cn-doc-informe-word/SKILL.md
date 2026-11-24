---
name: cn-doc-informe-word
description: Producir un Word real y editable con `crear_docx` (título, secciones, párrafos, viñetas, tablas) en vez de HTML renombrado. Usarla ante «pase lo a Word», «documento editable», «informe para el jefe».
version: 1.0.0
dominio: documentos
estado: probada
requiere: [crear_docx, read_file, list_files]
evidencia: [src/engine/docxMinimo.ts, src/engine/herramientaDocx.ts]
---
# Informe .docx editable en una llamada

> Producir un Word real y editable con `crear_docx` (título, secciones, párrafos, viñetas, tablas) en vez de HTML renombrado. Usarla ante «pase lo a Word», «documento editable», «informe para el jefe».

## Herramientas que usa (todas existen en este build)

`crear_docx` · `read_file` · `list_files`

## Receta

1. Armar el contenido estructurado (una sección por apartado) ANTES de llamar: la herramienta escribe lo que se le da.
2. Una sola llamada con `path` relativo (informes/<slug>.docx). Nada de fs/write_file sobre binarios ni de renombrar un .html.
3. Citar en la respuesta los `bytes`, `partes`, `parrafos` y la `muestra` que devolvió: son LEÍDOS del archivo reabierto.

## Cómo se verifica (con números, no con adverbios)

- La herramienta devolvió ok con sus números y la muestra se parece al texto pedido.
- El archivo existe en la ruta dicha (verificado con `list_files`).

## No hacer

- No intentar python-docx: el Python embebido trae 0 paquetes de pip.
- No mandar un Word vacío: la herramienta lo rechaza, y con razón.

## Evidencia en el repo

- `src/engine/docxMinimo.ts`
- `src/engine/herramientaDocx.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

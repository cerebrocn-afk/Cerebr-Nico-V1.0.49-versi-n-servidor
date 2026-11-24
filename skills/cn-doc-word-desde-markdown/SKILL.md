---
name: cn-doc-word-desde-markdown
description: Tomar un .md que ya existe (informe, lectura, bitácora) y convertirlo en .docx conservando títulos, listas y tablas. Usarla cuando el usuario pide el mismo contenido «en Word» o «para mandar por correo».
version: 1.0.0
dominio: documentos
estado: probada
requiere: [read_file, crear_docx, list_files, search_in_files]
evidencia: [src/utils/markdownExport.ts, src/engine/docxMinimo.ts]
---
# Markdown del proyecto a Word entregable

> Tomar un .md que ya existe (informe, lectura, bitácora) y convertirlo en .docx conservando títulos, listas y tablas. Usarla cuando el usuario pide el mismo contenido «en Word» o «para mandar por correo».

## Herramientas que usa (todas existen en este build)

`read_file` · `crear_docx` · `list_files` · `search_in_files`

## Receta

1. Leer el .md y mapear: `#`→título, `##`→sección, `-`→puntos, tabla `|`→`tabla`.
2. Quitar lo que Word no entiende (código de cerca con acentos raros, HTML crudo, imágenes locales que no viajan).
3. Crear el .docx y decir qué se perdió en la conversión: una pérdida declarada es honestidad, una silenciosa es un bug.

## Cómo se verifica (con números, no con adverbios)

- El número de secciones del Word coincide con el de encabezados del .md (o la diferencia está explicada).
- Las imágenes locales que no se pudieron incrustar están declaradas en la respuesta.

## No hacer

- No incrustar rutas de imagen del sandbox en el Word: en la PC del usuario no existen.

## Evidencia en el repo

- `src/utils/markdownExport.ts`
- `src/engine/docxMinimo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-doc-informe-pdf
description: Producir .pdf con `crear_pdf` cuando el destino es que NO se edite (acta firmable, informe enviado, presupuesto). Usarla cuando el usuario dice PDF, «no editable», «para imprimir».
version: 1.0.0
dominio: documentos
estado: probada
requiere: [crear_pdf, read_file]
evidencia: [src/engine/pdfMinimo.ts, src/engine/herramientaPdf.ts]
---
# PDF en una llamada, con su propia auditoría

> Producir .pdf con `crear_pdf` cuando el destino es que NO se edite (acta firmable, informe enviado, presupuesto). Usarla cuando el usuario dice PDF, «no editable», «para imprimir».

## Herramientas que usa (todas existen en este build)

`crear_pdf` · `read_file`

## Receta

1. Decidir si el destino es editar (Word) o cerrar (PDF) y decirlo en una línea.
2. Una sola llamada con el contenido estructurado; la herramienta valida contra su propio árbol de páginas.
3. Reportar los números que devolvió la herramienta (páginas, bytes).

## Cómo se verifica (con números, no con adverbios)

- El PDF se reabrió y se leyó del árbol de páginas antes de entregarlo.
- La ruta entregada es la escrita.

## No hacer

- No generar HTML y llamarlo PDF: el icono miente y el usuario lo descubre al abrirlo.

## Evidencia en el repo

- `src/engine/pdfMinimo.ts`
- `src/engine/herramientaPdf.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

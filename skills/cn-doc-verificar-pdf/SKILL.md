---
name: cn-doc-verificar-pdf
description: Comprobar que el PDF generado tiene sus páginas y su texto, leyendo del archivo. Usarla al entregar un PDF o cuando el usuario reporta « sale en blanco ».
version: 1.0.0
dominio: documentos
estado: probada
requiere: [read_file, run_command, list_files]
evidencia: [src/engine/pdfMinimo.ts, scripts/verificar-artefactos.mjs]
---
# Verificar el PDF reabriéndolo

> Comprobar que el PDF generado tiene sus páginas y su texto, leyendo del archivo. Usarla al entregar un PDF o cuando el usuario reporta « sale en blanco ».

## Herramientas que usa (todas existen en este build)

`read_file` · `run_command` · `list_files`

## Receta

1. Reabrir con el lector del proyecto (pdfjs) y contar páginas y texto.
2. Comparar con lo que se pidió (N secciones ⇒ N páginas o la regla declarada).
3. Si el archivo pesa casi nada, sospechar de contenido vacío antes de entregarlo.

## Cómo se verifica (con números, no con adverbios)

- El conteo de páginas es leído del archivo.
- El texto buscado aparece en el texto extraído.

## No hacer

- No mirar solo el tamaño del archivo como prueba de calidad.

## Evidencia en el repo

- `src/engine/pdfMinimo.ts`
- `scripts/verificar-artefactos.mjs`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

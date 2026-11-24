---
name: cn-doc-fuentes-y-citas
description: Acompasar cada afirmación de un informe con su fuente real (URL, archivo, tabla del proyecto) antes de cerrar el Word o el PDF. Usarla en informes, análisis y comparaciones que alguien va a usar para decidir.
version: 1.0.0
dominio: documentos
estado: probada
requiere: [crear_docx, fetch_url, read_file, search_in_files]
evidencia: [src/engine/citaFuente.ts, src/engine/motorEvidencia.ts]
---
# Documento con las fuentes al pie, no de adorno

> Acompasar cada afirmación de un informe con su fuente real (URL, archivo, tabla del proyecto) antes de cerrar el Word o el PDF. Usarla en informes, análisis y comparaciones que alguien va a usar para decidir.

## Herramientas que usa (todas existen en este build)

`crear_docx` · `fetch_url` · `read_file` · `search_in_files`

## Receta

1. Armar la lista de fuentes PRIMERO: número → qué afirma → dónde está.
2. Escribir el documento citando por número; ninguna afirmación numérica sin fuente.
3. Al final, verificar que cada fuente citada fue realmente leída en esta sesión.

## Cómo se verifica (con números, no con adverbios)

- No hay cifras huérfanas en el documento.
- Las fuentes son enlaces o rutas que existen.

## No hacer

- No poner una bibliografía decorativa al final para dar seriedad.

## Evidencia en el repo

- `src/engine/citaFuente.ts`
- `src/engine/motorEvidencia.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

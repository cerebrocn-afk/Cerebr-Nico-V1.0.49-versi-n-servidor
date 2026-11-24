---
name: cn-datos-estructura-a-reporte
description: Tomar un dataset chico-mediano y convertirlo en una tabla/respuesta con las columnas que deciden, no con las que estaban. Usarla cuando el usuario pega datos y pregunta «¿qué veo acá?».
version: 1.0.0
dominio: datos
estado: probada
requiere: [read_file, convertir_formato, run_command, crear_docx]
evidencia: [src/engine/explicacionArtefacto.ts, src/utils/markdownExport.ts]
---
# De datos crudos a tabla que se puede leer

> Tomar un dataset chico-mediano y convertirlo en una tabla/respuesta con las columnas que deciden, no con las que estaban. Usarla cuando el usuario pega datos y pregunta «¿qué veo acá?».

## Herramientas que usa (todas existen en este build)

`read_file` · `convertir_formato` · `run_command` · `crear_docx`

## Receta

1. Nombrar la pregunta antes de la tabla: costo, riesgo, ritmo, ranking.
2. Elegir 4-6 columnas que responden eso y descartar el resto (diciendo qué se descartó).
3. Cerrar con dos o tres lecturas concretas y su número.

## Cómo se verifica (con números, no con adverbios)

- Cada fila de la tabla es rastreable al dato original.
- Ninguna columna fue calculada en silencio.

## No hacer

- No volcar el dataset entero en el chat y llamar a eso análisis.

## Evidencia en el repo

- `src/engine/explicacionArtefacto.ts`
- `src/utils/markdownExport.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

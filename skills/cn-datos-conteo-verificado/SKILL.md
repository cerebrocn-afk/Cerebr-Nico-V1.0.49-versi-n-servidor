---
name: cn-datos-conteo-verificado
description: Producir todo número de una respuesta con un conteo ejecutado y leído. Usarla cuando la respuesta incluye cantidades, totales, promedios o comparaciones.
version: 1.0.0
dominio: datos
estado: probada
requiere: [run_command, read_file, convertir_formato]
evidencia: [src/engine/motorEvidencia.ts, src/engine/evidenciaTurno.ts]
---
# Contar con comando, no de vista

> Producir todo número de una respuesta con un conteo ejecutado y leído. Usarla cuando la respuesta incluye cantidades, totales, promedios o comparaciones.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `convertir_formato`

## Receta

1. Elegir la operación mínima (conteo de líneas, de claves, de coincidencias).
2. Correrla y copiar el número tal cual.
3. Si dos conteos se contradicen, se muestra la contradicción en vez de elegir uno.

## Cómo se verifica (con números, no con adverbios)

- Cada número citado tiene su conteo detrás.
- Los redondeos se declaran como redondeos.

## No hacer

- No presentar dos decimales de precisión que el dato no tiene.

## Evidencia en el repo

- `src/engine/motorEvidencia.ts`
- `src/engine/evidenciaTurno.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-pruebas-suite-nueva
description: Registrar cada archivo de pruebas en SUITES de `scripts/validar.mjs` con su descripción de qué cuida. Usarla al crear cualquier test nuevo.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [write_file, edit_file, run_command, read_file]
evidencia: [scripts/validar.mjs, tests/skillsPropias.test.ts]
---
# Suite nueva que entra a la puerta o no existe

> Registrar cada archivo de pruebas en SUITES de `scripts/validar.mjs` con su descripción de qué cuida. Usarla al crear cualquier test nuevo.

## Herramientas que usa (todas existen en este build)

`write_file` · `edit_file` · `run_command` · `read_file`

## Receta

1. Escribir la suite con el formato de la casa (`comprobar(…)`, conteo de correctas/fallidas, `process.exit` en fallo).
2. Agregar la entrada a SUITES con el `que:` explicando el riesgo que cubre, no el nombre del archivo.
3. Correr la puerta y verificar que la suite nueva aparece en el conteo de suites.

## Cómo se verifica (con números, no con adverbios)

- El conteo de suites subió en uno.
- La suite falla si se le rompe lo que cuida (se probó rompiéndola una vez).

## No hacer

- No dejar una prueba huérfana en `tests/`: si no está en la puerta, se borra sola con el tiempo.

## Evidencia en el repo

- `scripts/validar.mjs`
- `tests/skillsPropias.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

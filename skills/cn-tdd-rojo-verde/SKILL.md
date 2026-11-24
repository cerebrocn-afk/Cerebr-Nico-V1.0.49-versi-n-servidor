---
name: cn-tdd-rojo-verde
description: Escribir el test que falla antes de la implementación, cuando el criterio de éxito es objetivo. Usarla en lógica de negocio, parsers, formatos de archivo y cualquier cosa que el usuario pueda verificar con los ojos.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [write_file, run_tests, edit_file, read_file]
evidencia: [src/engine/cerebroReflejo.ts, tests/zipDocx.test.ts]
---
# Prueba primero: rojo, verde, refactar

> Escribir el test que falla antes de la implementación, cuando el criterio de éxito es objetivo. Usarla en lógica de negocio, parsers, formatos de archivo y cualquier cosa que el usuario pueda verificar con los ojos.

## Herramientas que usa (todas existen en este build)

`write_file` · `run_tests` · `edit_file` · `read_file`

## Receta

1. Formular la comprobación como frase con número adentro («devuelve 3 entradas», no «funciona»).
2. Escribir el test y correrlo: tiene que fallar por el motivo esperado. Un test que pasa sin código es un test que no prueba nada.
3. Implementar lo mínimo para el verde.
4. Refactar con el test puesto.

## Cómo se verifica (con números, no con adverbios)

- Se vio el rojo ANTES del verde, con su mensaje.
- El test quedó registrado en SUITES de `scripts/validar.mjs` (si no está en la puerta, no existe).

## No hacer

- No escribir el test después de la implementación y llamar a eso TDD.

## Evidencia en el repo

- `src/engine/cerebroReflejo.ts`
- `tests/zipDocx.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

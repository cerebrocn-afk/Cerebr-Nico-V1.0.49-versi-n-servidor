---
name: cn-pruebas-caminos-de-rechazo
description: Tastar rechazos — bytes podridos, rutas fuera, entrada vacía, archivo inexistente. Usarla en toda herramienta que escribe o audita.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_tests, edit_file, read_file_range]
evidencia: [src/engine/herramientaZip.ts, tests/zipDocx.test.ts]
---
# Probar que el sistema sabe decir «no»

> Tastar rechazos — bytes podridos, rutas fuera, entrada vacía, archivo inexistente. Usarla en toda herramienta que escribe o audita.

## Herramientas que usa (todas existen en este build)

`run_tests` · `edit_file` · `read_file_range`

## Receta

1. Enumerar los rechazos que la herramienta conoce (falta campo, formato malo, `..`, existe el destino).
2. Escribir una comprobación por rechazo, esperando el motivo, no solo `ok:false`.
3. Verificar que ningún rechazo dejó archivo a medias.

## Cómo se verifica (con números, no con adverbios)

- Cada camino de rechazo tiene su prueba con mensaje.
- Ninguna entrada podrida lanzó un stack trace al modelo.

## No hacer

- No probar solo el camino feliz: ahí casi nunca está el bug.

## Evidencia en el repo

- `src/engine/herramientaZip.ts`
- `tests/zipDocx.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-forjar-complemento
description: Crear un complemento .cn del IDE (extensión de comportamiento) con la herramienta de forja y su validación. Usarla cuando la capacidad que pide el usuario pertenece al editor y no al motor.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [forjar_complemento, read_file, list_files, run_tests]
evidencia: [src/engine/pluginForja.ts, src/engine/aduanaForja.ts]
---
# Forjar un complemento y pasar su aduana

> Crear un complemento .cn del IDE (extensión de comportamiento) con la herramienta de forja y su validación. Usarla cuando la capacidad que pide el usuario pertenece al editor y no al motor.

## Herramientas que usa (todas existen en este build)

`forjar_complemento` · `read_file` · `list_files` · `run_tests`

## Receta

1. Leer un complemento existente para copiar la forma (`list_files` en la carpeta de extensiones).
2. Forjar con `forjar_complemento`; si la aduana lo rechaza, leer el motivo y corregir el origen, no la aduana.
3. Probar el complemento cargado, no solo escrito.

## Cómo se verifica (con números, no con adverbios)

- La aduana lo aceptó y eso está en la salida de la herramienta.
- Un complemento rechazado no se reportó como creado.

## No hacer

- No tocar la aduana para que pase: es lo único que separa «compila» de «sirve».

## Evidencia en el repo

- `src/engine/pluginForja.ts`
- `src/engine/aduanaForja.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

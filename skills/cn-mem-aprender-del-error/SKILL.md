---
name: cn-mem-aprender-del-error
description: Registrar el fallo con contexto, causa y correctivo para que el sistema no lo repita. Usarla inmediatamente después de un error real (comando que explotó, supuesto que cayó, corrección del usuario).
version: 1.0.0
dominio: memoria
estado: probada
requiere: [memory_aprender_de_error, memory_guardar_aprendizaje, memory_reflect]
evidencia: [scripts/hindsight_daemon.py, src/engine/memoriaNegativa.ts]
---
# El error de hoy es la valla de mañana

> Registrar el fallo con contexto, causa y correctivo para que el sistema no lo repita. Usarla inmediatamente después de un error real (comando que explotó, supuesto que cayó, corrección del usuario).

## Herramientas que usa (todas existen en este build)

`memory_aprender_de_error` · `memory_guardar_aprendizaje` · `memory_reflect`

## Receta

1. Guardar el error con la salida tal cual, no con un resumen amable.
2. Añadir la regla accionable («no leer el archivo entero», «no suponer el puerto»).
3. Relacionarlo con aprendizajes parecidos para que la repetición se vea.

## Cómo se verifica (con números, no con adverbios)

- Hay un aprendizaje guardado y recuperable con otras palabras.
- La misma corrección no aparece por tercera vez.

## No hacer

- No guardar como «aprendizaje» una instrucción del usuario que es de una sola vez.

## Evidencia en el repo

- `scripts/hindsight_daemon.py`
- `src/engine/memoriaNegativa.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

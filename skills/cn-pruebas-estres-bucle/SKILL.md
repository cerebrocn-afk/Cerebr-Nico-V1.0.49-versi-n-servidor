---
name: cn-pruebas-estres-bucle
description: Correr el estrés del lazo autónomo y auditar repeticiones, topes y salidas. Usarla cuando se toca el bucle autónomo, la orquestación o cualquier cosa que pueda iterar sola.
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_command, read_file, run_tests, cerebro_recordar]
evidencia: [scripts/validar-estres-bucle.mjs, src/engine/auditoriaBucle.ts]
---
# Estrés de bucles: que no se muerda la cola

> Correr el estrés del lazo autónomo y auditar repeticiones, topes y salidas. Usarla cuando se toca el bucle autónomo, la orquestación o cualquier cosa que pueda iterar sola.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `run_tests` · `cerebro_recordar`

## Receta

1. Correr `node scripts/validar-estres-bucle.mjs` y leer el conteo de iteraciones y cortes.
2. Verificar que `auditoriaBucle`/`ouroboros` cortan: un lazo sin tope es un bug con pinta de feature.
3. Registrar en memoria el patrón de fallo si apareció uno nuevo.

## Cómo se verifica (con números, no con adverbios)

- Hay un tope de iteraciones demostrado con números.
- Ninguna prueba quedó colgando esperando un evento que no llega.

## No hacer

- No confiar en «lo probé dos veces y paró»: el lazo falla a la vez 400.

## Evidencia en el repo

- `scripts/validar-estres-bucle.mjs`
- `src/engine/auditoriaBucle.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

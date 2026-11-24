---
name: cn-modulo-nuevo
description: Parir un módulo de TypeScript que otro pueda usar sin preguntarle a nadie — tipos arriba, pureza adentro, errores con motivo. Usarla cada vez que la tarea sea «agregá una función/módulo/peza nueva», aunque no se mencione esta skill.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file, write_file, run_tests, search_in_files]
evidencia: [src/engine/zipMinimo.ts, src/engine/herramientaZip.ts]
---
# Módulo nuevo con contrato explícito

> Parir un módulo de TypeScript que otro pueda usar sin preguntarle a nadie — tipos arriba, pureza adentro, errores con motivo. Usarla cada vez que la tarea sea «agregá una función/módulo/peza nueva», aunque no se mencione esta skill.

## Herramientas que usa (todas existen en este build)

`read_file` · `write_file` · `run_tests` · `search_in_files`

## Receta

1. Buscar primero: `search_in_files` por el verbo del pedido. Si ya existe algo que lo hace, se extiende; un segundo módulo que hace lo mismo es deuda con nombre nuevo.
2. Definir el contrato ANTES del cuerpo: interfaces exportadas arriba del archivo, con comentario de UNA línea diciendo qué rechaza y por qué.
3. Escribir la lógica como función pura (todo adentro por parámetros, nada de `fs` ni red): así se puede probar sin montar el mundo.
4. Montar la parte impura al final, en un envoltorio chico que sí lee disco o llama red.
5. Correr `run_tests` de la suite propia y leer la salida completa antes de decir que funciona.

## Cómo se verifica (con números, no con adverbios)

- Los tests pasan y la salida fue LEÍDA, no supuesta.
- El módulo exporta el tipo de entrada y el de salida; nadie adivina formas.

## No hacer

- No empezar escribiendo el archivo sin haber leído el módulo vecino: el estilo de la casa está en los vecinos.
- No devolver `null` mudo donde la casa devuelve `{ ok:false, motivo }`.

## Evidencia en el repo

- `src/engine/zipMinimo.ts`
- `src/engine/herramientaZip.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

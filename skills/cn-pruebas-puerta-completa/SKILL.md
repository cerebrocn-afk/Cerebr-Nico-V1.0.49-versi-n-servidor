---
name: cn-pruebas-puerta-completa
description: Correr todas las suites con un solo comando y leer el veredicto del log. Usarla antes de cualquier entrega, paquete, merge o afirmación de que algo «anda».
version: 1.0.0
dominio: pruebas
estado: probada
requiere: [run_command, read_file, list_files]
evidencia: [scripts/validar.mjs, tests/zipDocx.test.ts]
---
# La puerta entera antes de decir «listo»

> Correr todas las suites con un solo comando y leer el veredicto del log. Usarla antes de cualquier entrega, paquete, merge o afirmación de que algo «anda».

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `list_files`

## Receta

1. Correr `npm run validar` (o `node scripts/validar.mjs`) y dejar que termine; no se interrumpe porque «ya pasó lo mío».
2. LEER el VEREDICTO del log: conteo de comprobaciones, suites y fallos. El verde se lee, no se declara.
3. Si algo falla, se nombra la suite y la comprobación exacta, y se arregla antes de seguir.

## Cómo se verifica (con números, no con adverbios)

- El número de comprobaciones y de suites citado salió del log de esta corrida.
- VEREDICTO dice 0 fallos (o se reportó cuál falla y por qué todavía no bloquea).

## No hacer

- No correr solo la suite propia y anunciar «todo verde».
- No borrar ni saltear una prueba que molesta: se arregla o se archiva con motivo.

## Evidencia en el repo

- `scripts/validar.mjs`
- `tests/zipDocx.test.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

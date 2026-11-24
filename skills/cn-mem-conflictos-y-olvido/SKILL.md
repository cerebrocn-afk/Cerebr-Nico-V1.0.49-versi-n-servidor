---
name: cn-mem-conflictos-y-olvido
description: Detectar recuerdos que se contradicen, elegir con fecha y evidencia, y olvidar lo falso o lo viejo. Usarla cuando el sistema dice dos cosas distintas o arrastra información muerta.
version: 1.0.0
dominio: memoria
estado: probada
requiere: [memory_conflictos, memory_olvidar, memory_repasar, memory_borrar_page]
evidencia: [scripts/hindsight_daemon.py, src/utils/languageMemory.ts]
---
# Memoria que se contradice y memoria que sobra

> Detectar recuerdos que se contradicen, elegir con fecha y evidencia, y olvidar lo falso o lo viejo. Usarla cuando el sistema dice dos cosas distintas o arrastra información muerta.

## Herramientas que usa (todas existen en este build)

`memory_conflictos` · `memory_olvidar` · `memory_repasar` · `memory_borrar_page`

## Receta

1. Correr el chequeo de conflictos y listar los pares que se contradicen.
2. Preferir el recuerdo con evidencia reciente; el resto se olvida o se marca.
3. Repasar lo que queda para que la recuperación no se caiga al primer cambio.

## Cómo se verifica (con números, no con adverbios)

- El conteo de conflictos bajó.
- Lo olvidado era efectivamente falso o estaba reemplazado.

## No hacer

- No borrar un recuerdo porque incomoda: se borra porque es falso o viejo.

## Evidencia en el repo

- `scripts/hindsight_daemon.py`
- `src/utils/languageMemory.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

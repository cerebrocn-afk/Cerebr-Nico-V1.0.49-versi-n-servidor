---
name: cn-deshacer-seguro
description: Volver atrás un cambio propio sin borrar lo que otro editó. Usarla cuando el parche se fue de las manos, cuando una escritura salió mal o cuando el usuario dice «volvé eso».
version: 1.0.0
dominio: codigo
estado: probada
requiere: [deshacer_cambios, revisar_cambios, read_file_range, git_diff]
evidencia: [src/utils/restorePoints.ts, src/engine/capaTransaccion.ts]
---
# Deshacer sin perder trabajo ajeno

> Volver atrás un cambio propio sin borrar lo que otro editó. Usarla cuando el parche se fue de las manos, cuando una escritura salió mal o cuando el usuario dice «volvé eso».

## Herramientas que usa (todas existen en este build)

`deshacer_cambios` · `revisar_cambios` · `read_file_range` · `git_diff`

## Receta

1. Antes de deshacer, leer el estado actual (`revisar_cambios`): si hay cambios ajenos, se preservan a mano.
2. Deshacer el paso puntual, no un salto grande.
3. Confirmar releyendo el rango afectado.

## Cómo se verifica (con números, no con adverbios)

- El archivo vuelve al estado esperado y lo demás sigue intacto.
- Se dijo en la respuesta qué se perdió, si se perdió algo.

## No hacer

- No usar `delete_file` como deshacer: borrar no es revertir.

## Evidencia en el repo

- `src/utils/restorePoints.ts`
- `src/engine/capaTransaccion.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

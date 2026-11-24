---
name: cn-web-preflight-rendimiento
description: Cazar lo que pesa (imagen enorme, CSS sin usar, fuente por cada estilo) con `preflight_rendimiento`. Usarla cuando el sitio «tarda», cuando hay imágenes generadas o cuando se entrega a un cliente con datos móviles.
version: 1.0.0
dominio: web
estado: probada
requiere: [preflight_rendimiento, insertar_imagen, mejorar_pagina, auditar_pagina]
evidencia: [scripts/creador_daemon.py, src/engine/rendimiento.ts]
---
# Preflight de rendimiento antes de publicar

> Cazar lo que pesa (imagen enorme, CSS sin usar, fuente por cada estilo) con `preflight_rendimiento`. Usarla cuando el sitio «tarda», cuando hay imágenes generadas o cuando se entrega a un cliente con datos móviles.

## Herramientas que usa (todas existen en este build)

`preflight_rendimiento` · `insertar_imagen` · `mejorar_pagina` · `auditar_pagina`

## Receta

1. Correr el preflight y leer la lista ordenada por costo, de mayor a menor.
2. Atacar el primero de la lista: casi siempre una imagen o una fuente.
3. Repetir y comparar números antes/después.

## Cómo se verifica (con números, no con adverbios)

- Hay un número antes y un número después.
- Nada se optimizó a costa de romper el diseño (se re-auditó la página).

## No hacer

- No minificar «por las dudas» sin medir: el peso suele estar en los assets.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/rendimiento.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

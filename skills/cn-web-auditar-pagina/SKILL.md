---
name: cn-web-auditar-pagina
description: Pasar `auditar_pagina` y arreglar lo que dice, en vez de presumir que «se ve bien». Usarla después de cada creación o edición de HTML y antes de cualquier entrega web.
version: 1.0.0
dominio: web
estado: probada
requiere: [auditar_pagina, mejorar_pagina, read_file_range, crear_bloque]
evidencia: [scripts/creador_daemon.py, src/engine/completitud.ts]
---
# Auditar la página antes de mostrarla

> Pasar `auditar_pagina` y arreglar lo que dice, en vez de presumir que «se ve bien». Usarla después de cada creación o edición de HTML y antes de cualquier entrega web.

## Herramientas que usa (todas existen en este build)

`auditar_pagina` · `mejorar_pagina` · `read_file_range` · `crear_bloque`

## Receta

1. Auditar primero, opinar después: leer los ítems con su severidad y su archivo.
2. Corregir en el origen (bloque o plantilla) y volver a auditar; la valla tiene que bajar de errores, no quedar igual con otro mensaje.
3. Reportar cuántos quedaban y cuántos quedan, con los números leídos.

## Cómo se verifica (con números, no con adverbios)

- 0 errores de accesibilidad/enlaces en la auditoría final.
- Nada se «arregló» silenciando la comprobación.

## No hacer

- No decir «publicable» si la auditoría marcó algo: la valla ya lo sabe.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/completitud.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

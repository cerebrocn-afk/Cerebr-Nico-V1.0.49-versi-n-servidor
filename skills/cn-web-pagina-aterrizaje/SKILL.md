---
name: cn-web-pagina-aterrizaje
description: Armar una landing que empuja UNA acción medible, con bloque de prueba social honesto. Usarla para campaña, lanzamiento, preventa o recolección de correos.
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_pagina, crear_bloque, formulario_destino, auditar_pagina]
evidencia: [scripts/creador_daemon.py, src/engine/recetarioUI.ts]
---
# Página de aterrizaje con una sola acción

> Armar una landing que empuja UNA acción medible, con bloque de prueba social honesto. Usarla para campaña, lanzamiento, preventa o recolección de correos.

## Herramientas que usa (todas existen en este build)

`crear_pagina` · `crear_bloque` · `formulario_destino` · `auditar_pagina`

## Receta

1. Elegir la acción única (reservar, escribir, cotizar) y escribir el copy alrededor de ella.
2. Armar la secuencia de bloques: promesa, prueba, objeciones, acción.
3. Cerrar con `formulario_destino` apuntando a un destino real dicho por el usuario.
4. Auditar la página antes de mostrarla.

## Cómo se verifica (con números, no con adverbios)

- `auditar_pagina` sin errores.
- El formulario tiene destino configurado, no un `action="#"` decorativo.

## No hacer

- No inventar testimonios, cifras de clientes ni premios: si no hay material, se deja el marcador.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/recetarioUI.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

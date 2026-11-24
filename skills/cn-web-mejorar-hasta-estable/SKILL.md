---
name: cn-web-mejorar-hasta-estable
description: Usar `mejorar_hasta_estable` para que el propio creador itere mientras la auditoría baje, con tope y con criterio. Usarla cuando hay muchos detalles chicos y una mano no alcanza.
version: 1.0.0
dominio: web
estado: probada
requiere: [mejorar_hasta_estable, mejorar_pagina, auditar_pagina]
evidencia: [scripts/creador_daemon.py, src/engine/presupuestoReparacion.ts]
---
# Iterar hasta que la valla se calle

> Usar `mejorar_hasta_estable` para que el propio creador itere mientras la auditoría baje, con tope y con criterio. Usarla cuando hay muchos detalles chicos y una mano no alcanza.

## Herramientas que usa (todas existen en este build)

`mejorar_hasta_estable` · `mejorar_pagina` · `auditar_pagina`

## Receta

1. Definir «estable» antes de empezar: 0 errores de auditoría, no «que quede lindo».
2. Poner tope de iteraciones y respetarlo; si se choca el tope, se reporta lo que falta.
3. Leer el diff final: la máquina también puede empeorar cosas.

## Cómo se verifica (con números, no con adverbios)

- La condición de corte se cumplió y está medida.
- Ningún contenido pedido desapareció en la iteración.

## No hacer

- No dejar que la herramienta itore sobre contenido inventado: los huecos siguen siendo marcadores.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/presupuestoReparacion.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

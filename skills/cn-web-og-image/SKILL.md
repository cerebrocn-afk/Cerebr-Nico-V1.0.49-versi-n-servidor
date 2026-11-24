---
name: cn-web-og-image
description: Generar la OG/preview del sitio y declararla en el HTML. Usarla cuando el link se comparte y llega sin imagen, o al cerrar cualquier obra web.
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_og_image, crear_bloque, auditar_pagina]
evidencia: [scripts/creador_daemon.py]
---
# Imagen social que se ve donde importa

> Generar la OG/preview del sitio y declararla en el HTML. Usarla cuando el link se comparte y llega sin imagen, o al cerrar cualquier obra web.

## Herramientas que usa (todas existen en este build)

`crear_og_image` · `crear_bloque` · `auditar_pagina`

## Receta

1. Definir título del sitio, claim corto y acento antes de generar; la OG no es el logo agrandado.
2. Generar y enlazar `og:image`, `twitter:card` y el `alt` correspondiente.
3. Verificar dimensiones y peso (`preflight_rendimiento` si la imagen manda).

## Cómo se verifica (con números, no con adverbios)

- Las etiquetas existen y apuntan a un archivo real.
- El texto de la imagen es legible a tamaño de teléfono.

## No hacer

- No incrustar un PNG de 2 MB como preview: castiga el primer segundo de carga.

## Evidencia en el repo

- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

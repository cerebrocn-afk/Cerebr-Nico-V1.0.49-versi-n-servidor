---
name: cn-web-multipagina
description: Generar varias páginas que comparten navegación, estilos e idioma, con hreflang si hay más de uno. Usarla cuando el pedido incluye «secciones», «páginas» o «catálogo».
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_sitio_multipagina, crear_pagina, generar_hreflang, auditar_sitio]
evidencia: [scripts/creador_daemon.py]
---
# Sitio multipágina coherente

> Generar varias páginas que comparten navegación, estilos e idioma, con hreflang si hay más de uno. Usarla cuando el pedido incluye «secciones», «páginas» o «catálogo».

## Herramientas que usa (todas existen en este build)

`crear_sitio_multipagina` · `crear_pagina` · `generar_hreflang` · `auditar_sitio`

## Receta

1. Definir el mapa de páginas antes de generar (qué página, para qué intención, qué bloque arriba).
2. Generar con `crear_sitio_multipagina`; las páginas sueltas entran con `crear_pagina`.
3. Si hay dos idiomas, `generar_hreflang` y verificar que los enlaces cruzados existan.

## Cómo se verifica (con números, no con adverbios)

- `auditar_sitio` no reporta enlaces internos rotos.
- Cada página declara el idioma correcto.

## No hacer

- No copiar y pegar HTML de una página a otra: la coherencia se rompe en el tercer copia-pega.

## Evidencia en el repo

- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-web-pwa
description: Convertir un sitio en PWA (manifest, service worker, íconos, pantalla de arranque) y probar que se instala. Usarla cuando el pedido dice «app sin tienda», «que funcione offline» o «instalable».
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_pwa, crear_og_image, auditar_pagina, preflight_rendimiento]
evidencia: [src/engine/certezaPWA.ts, scripts/creador_daemon.py]
---
# Instalable de verdad: PWA con manifest válido

> Convertir un sitio en PWA (manifest, service worker, íconos, pantalla de arranque) y probar que se instala. Usarla cuando el pedido dice «app sin tienda», «que funcione offline» o «instalable».

## Herramientas que usa (todas existen en este build)

`crear_pwa` · `crear_og_image` · `auditar_pagina` · `preflight_rendimiento`

## Receta

1. Generar PWA con `crear_pwa` y verificar que index enlaza manifest y sw (históricamente se escribían sin enlazar).
2. Íconos reales en los tamaños que pide la plataforma, generados con el pack.
3. Probar offline recargando sin red y decir qué se sirve del caché.

## Cómo se verifica (con números, no con adverbios)

- Manifest parseable y referenciado desde el HTML.
- La instalación aparece ofrecida en el navegador usado para probar.

## No hacer

- No prometer PWA si falta manifest o service worker: se declara el faltante.

## Evidencia en el repo

- `src/engine/certezaPWA.ts`
- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

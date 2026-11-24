---
name: cn-web-archivo-sueltos
description: Escribir robots.txt, sitemap, favicons, verificaciones de servicios y páginas de error con `crear_archivo` y sus candados de ruta. Usarla cuando falta UN archivo chico del sitio.
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_archivo, leer_skill, auditar_sitio]
evidencia: [scripts/creador_daemon.py, src/engine/aduanaArbol.ts]
---
# Archivos sueltos del sitio, en el lugar correcto

> Escribir robots.txt, sitemap, favicons, verificaciones de servicios y páginas de error con `crear_archivo` y sus candados de ruta. Usarla cuando falta UN archivo chico del sitio.

## Herramientas que usa (todas existen en este build)

`crear_archivo` · `leer_skill` · `auditar_sitio`

## Receta

1. Confirmar la ruta dentro del sitio (no en la raíz del proyecto) con `listar_sitios`.
2. Crear el archivo con `crear_archivo`, que aplica el candado; no con escritura cruda.
3. Verificar que el sitio lo vea (`auditar_sitio` o pedido directo a la ruta).

## Cómo se verifica (con números, no con adverbios)

- El archivo está dentro de la carpeta del sitio.
- Ningún secreto ni token de verificación quedó en un archivo público.

## No hacer

- No escribir sitemap a mano si el sitio cambió de URLs: se genera y se verifica.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/aduanaArbol.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

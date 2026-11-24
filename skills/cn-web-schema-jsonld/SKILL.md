---
name: cn-web-schema-jsonld
description: Emitir JSON-LD coherente con lo que la página dice (Organización, Producto, FAQ, LocalBusiness) y validarlo. Usarla al cerrar cualquier sitio orientado a resultados de búsqueda.
version: 1.0.0
dominio: web
estado: probada
requiere: [generar_schema_jsonld, auditar_pagina, read_file_range]
evidencia: [scripts/creador_daemon.py]
---
# Datos estructurados que un lector entiende

> Emitir JSON-LD coherente con lo que la página dice (Organización, Producto, FAQ, LocalBusiness) y validarlo. Usarla al cerrar cualquier sitio orientado a resultados de búsqueda.

## Herramientas que usa (todas existen en este build)

`generar_schema_jsonld` · `auditar_pagina` · `read_file_range`

## Receta

1. Elegir UN tipo principal por página; rebotar el schema con tipos para parecer rico es ruido.
2. Rellenar con datos verificados del usuario; lo desconocido se deja fuera, no se estima.
3. Validar que el JSON embebido sea parseable y que coincida con el texto visible.

## Cómo se verifica (con números, no con adverbios)

- El JSON-LD parsea y sus campos existen en la página.
- No hay promesas (precios, horarios, premios) que no estén en el contenido.

## No hacer

- No inventar reseñas, estrellas ni fechas de disponibilidad.

## Evidencia en el repo

- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

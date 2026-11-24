---
name: cn-web-bloques-modulares
description: Insertar bloques ya probados (hero, galería, precios, FAQ) en lugar de maquetar desde cero. Usarla para cambiar o ampliar una sección puntual de un sitio existente.
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_bloque, plantillas_disponibles, read_file_range, auditar_pagina]
evidencia: [scripts/creador_daemon.py]
---
# Componer con bloques del creador

> Insertar bloques ya probados (hero, galería, precios, FAQ) en lugar de maquetar desde cero. Usarla para cambiar o ampliar una sección puntual de un sitio existente.

## Herramientas que usa (todas existen en este build)

`crear_bloque` · `plantillas_disponibles` · `read_file_range` · `auditar_pagina`

## Receta

1. Listar los bloques disponibles y elegir por intención, no por apariencia.
2. Insertar el bloque en la posición pedida; leer después el rango afectado para ver cómo quedó el contexto.
3. Auditar la página para que el bloque nuevo no rompa anclas ni jerarquía de títulos.

## Cómo se verifica (con números, no con adverbios)

- El bloque nuevo aparece en el HTML con su contenido real.
- La jerarquía h1→h2 sigue intacta.

## No hacer

- No reescribir toda la página para agregar un bloque: la edición por ancla es más barata y más segura.

## Evidencia en el repo

- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

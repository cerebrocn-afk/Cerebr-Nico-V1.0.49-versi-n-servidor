---
name: cn-web-forjar-desde-brief
description: Convertir un brief de negocio en un sitio entero, publicado y auditable, con el pack creador. Usarla cuando el usuario describe un negocio y quiere la obra terminada, no un fragmento de HTML.
version: 1.0.0
dominio: web
estado: probada
requiere: [forjar_desde_brief, forjar_y_entregar, estado_creador, auditar_sitio]
evidencia: [scripts/creador_daemon.py]
---
# Forjar el sitio completo desde un brief

> Convertir un brief de negocio en un sitio entero, publicado y auditable, con el pack creador. Usarla cuando el usuario describe un negocio y quiere la obra terminada, no un fragmento de HTML.

## Herramientas que usa (todas existen en este build)

`forjar_desde_brief` · `forjar_y_entregar` · `estado_creador` · `auditar_sitio`

## Receta

1. Check-in: `estado_creador` para ver raíz, sitios y plantillas disponibles.
2. Armar el brief con los datos reales del negocio; lo que falte queda como marcador visible, no se inventa.
3. Forjar y recién después auditar (`auditar_sitio`) y mejorar hasta estable.

## Cómo se verifica (con números, no con adverbios)

- La herramienta devolvió la ruta del sitio y sus archivos; se listó alguno para confirmar.
- Ningún dato inventado: los huecos quedaron marcados y se avisaron.

## No hacer

- No entregar como terminado un sitio con marcadores [Personaliza este texto] sin decirlo.

## Evidencia en el repo

- `scripts/creador_daemon.py`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

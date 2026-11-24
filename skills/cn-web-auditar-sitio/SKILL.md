---
name: cn-web-auditar-sitio
description: Recorrer todo el sitio — enlaces cruzados, coherencia de plantillas, assets huérfanos. Usarla antes de publicar, antes de entregar ZIP y después de tocar navegación compartida.
version: 1.0.0
dominio: web
estado: probada
requiere: [auditar_sitio, listar_sitios, preflight_rendimiento, auditar_contraste]
evidencia: [scripts/creador_daemon.py, src/engine/grafoProyecto.ts]
---
# Auditoría de sitio completo (no de una página)

> Recorrer todo el sitio — enlaces cruzados, coherencia de plantillas, assets huérfanos. Usarla antes de publicar, antes de entregar ZIP y después de tocar navegación compartida.

## Herramientas que usa (todas existen en este build)

`auditar_sitio` · `listar_sitios` · `preflight_rendimiento` · `auditar_contraste`

## Receta

1. Confirmar qué sitio se audita con `listar_sitios` (puede haber más de uno y el usuario habla del otro).
2. Auditar y agrupar los hallazgos por tipo: rotos, accesibilidad, peso.
3. Arreglar los rotos primero: un enlace muerto es más caro que un color feo.

## Cómo se verifica (con números, no con adverbios)

- Los conteos (páginas auditadas, errores) salieron de la herramienta.
- Ningún asset citado en el HTML queda ausente del ZIP final.

## No hacer

- No auditar solo el index y decir «el sitio está bien».

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/grafoProyecto.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

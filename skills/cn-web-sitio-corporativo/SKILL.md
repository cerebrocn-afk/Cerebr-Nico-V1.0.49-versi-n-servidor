---
name: cn-web-sitio-corporativo
description: Crear el sitio base (HTML+CSS+JS sin frameworks, PWA, OG, README) con `crear_sitio`. Usarla para la primera piedra de cualquier obra web dentro del IDE.
version: 1.0.0
dominio: web
estado: probada
requiere: [crear_sitio, plantillas_disponibles, estado_creador, listar_sitios]
evidencia: [scripts/creador_daemon.py, src/engine/plantillaDefecto.ts]
---
# Sitio corporativo en una llamada

> Crear el sitio base (HTML+CSS+JS sin frameworks, PWA, OG, README) con `crear_sitio`. Usarla para la primera piedra de cualquier obra web dentro del IDE.

## Herramientas que usa (todas existen en este build)

`crear_sitio` · `plantillas_disponibles` · `estado_creador` · `listar_sitios`

## Receta

1. Consultar `plantillas_disponibles` antes de elegir tipo: adivinar la receta produce sitios genéricos.
2. Llamar `crear_sitio` con nombre, tipo y bloques; si el sitio ya existe, se pide sobrescribir explícitamente o se crea en otra ruta.
3. Listar el resultado con `listar_sitios` y nombrar la ruta al usuario.

## Cómo se verifica (con números, no con adverbios)

- El sitio aparece en `listar_sitios` con la ruta esperada.
- No se pisó un sitio existente en silencio.

## No hacer

- No escribir el index a mano con `write_file` si existe `crear_sitio`: se pierde determinismo y auditoría.

## Evidencia en el repo

- `scripts/creador_daemon.py`
- `src/engine/plantillaDefecto.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

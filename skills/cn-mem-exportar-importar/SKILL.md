---
name: cn-mem-exportar-importar
description: Exportar el aprendizaje del proyecto e importarlo en otra máquina, con sus límites y su revisión. Usarla al migrar de equipo, respaldar o compartir aprendizaje entre instancias.
version: 1.0.0
dominio: memoria
estado: probada
requiere: [memory_exportar, memory_importar, crear_zip, run_command]
evidencia: [scripts/hindsight_daemon.py, src/engine/bovedaLocal.ts]
---
# Llevarse y traerse la memoria sin sorpresas

> Exportar el aprendizaje del proyecto e importarlo en otra máquina, con sus límites y su revisión. Usarla al migrar de equipo, respaldar o compartir aprendizaje entre instancias.

## Herramientas que usa (todas existen en este build)

`memory_exportar` · `memory_importar` · `crear_zip` · `run_command`

## Receta

1. Exportar, revisar el contenido y recién después empaquetar: un export puede traer rutas personales.
2. Antes de importar, mirar qué hay: la importación no borra lo existente en silencio.
3. Verificar después con `memory_estado` que el conteo coincide.

## Cómo se verifica (con números, no con adverbios)

- El export no contiene secretos ni claves.
- El conteo importado es el que informó la herramienta.

## No hacer

- No compartir un export sin leerlo antes.

## Evidencia en el repo

- `scripts/hindsight_daemon.py`
- `src/engine/bovedaLocal.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

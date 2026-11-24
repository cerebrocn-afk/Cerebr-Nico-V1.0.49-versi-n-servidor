---
name: cn-mem-usar-skills-instaladas
description: Usar `listar_skills` (paginado), `leer_skill` y `skill_buscar` para apoyarse en lo que ya está instalado. Usarla ante cualquier tarea de formato, framework o flujo raro.
version: 1.0.0
dominio: memoria
estado: probada
requiere: [listar_skills, leer_skill, skill_buscar]
evidencia: [scripts/hindsight_daemon.py, src/engine/catalogoHonesto.ts]
---
# Buscar en las skills instaladas antes de improvisar

> Usar `listar_skills` (paginado), `leer_skill` y `skill_buscar` para apoyarse en lo que ya está instalado. Usarla ante cualquier tarea de formato, framework o flujo raro.

## Herramientas que usa (todas existen en este build)

`listar_skills` · `leer_skill` · `skill_buscar`

## Receta

1. Con 200 skills, la lista completa no se pide: se va con `filtro` (una palabra) o con `skill_buscar`.
2. Leer solo la skill que sirve (`leer_skill`), no cinco por si acaso.
3. Si la skill dice algo que contradice la evidencia del repo, gana el repo y se reporta la contradicción.

## Cómo se verifica (con números, no con adverbios)

- Se usó una skill instalada y se la nombra en la respuesta.
- El costo de contexto del turno no se disparó pidiendo catálogos enteros.

## No hacer

- No decir «no tengo cómo hacer eso» sin haber buscado en las skills.

## Evidencia en el repo

- `scripts/hindsight_daemon.py`
- `src/engine/catalogoHonesto.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

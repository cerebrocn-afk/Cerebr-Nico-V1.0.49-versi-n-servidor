---
name: cn-revision-antes-de-commitear
description: Ver el diff entero, no el último parche, y buscar secretos, trazas y archivos de sobra. Usarla antes de cada `git_commit`, sin excepción.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [revisar_cambios, git_diff, git_status, run_command]
evidencia: [src/engine/redaccionSecretos.ts, scripts/sin-claves.mjs]
---
# Revisar el cambio completo antes de commitear

> Ver el diff entero, no el último parche, y buscar secretos, trazas y archivos de sobra. Usarla antes de cada `git_commit`, sin excepción.

## Herramientas que usa (todas existen en este build)

`revisar_cambios` · `git_diff` · `git_status` · `run_command`

## Receta

1. `git_status` para ver qué entró (¿generados? ¿caché? ¿.env?).
2. `revisar_cambios`/`git_diff` para leer el contenido.
3. Correr `node scripts/sin-claves.mjs` antes de dar ok: un secreto en el repo ya no es un error de tipeo, es una filtración.

## Cómo se verifica (con números, no con adverbios)

- El diff no trae claves, rutas personales ni trazas de debug.
- Sin-claves terminó limpio (exit 0) y se leyó esa salida.

## No hacer

- No commitear lo que no se leyó: el commit es la unidad de arrepentimiento.

## Evidencia en el repo

- `src/engine/redaccionSecretos.ts`
- `scripts/sin-claves.mjs`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

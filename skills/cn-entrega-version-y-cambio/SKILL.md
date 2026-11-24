---
name: cn-entrega-version-y-cambio
description: Subir la versión del proyecto, escribir el CHANGELOG con lo que el usuario nota y cerrar el ciclo. Usarla al empaquetar cualquier entrega nueva.
version: 1.0.0
dominio: entrega
estado: probada
requiere: [read_file, edit_file, run_command, git_commit]
evidencia: [package.json, src/engine/entregaRitual.ts]
---
# Versionar y contar qué cambió

> Subir la versión del proyecto, escribir el CHANGELOG con lo que el usuario nota y cerrar el ciclo. Usarla al empaquetar cualquier entrega nueva.

## Herramientas que usa (todas existen en este build)

`read_file` · `edit_file` · `run_command` · `git_commit`

## Receta

1. Leer la versión actual y decidir el salto por lo que hay adentro (parche / función / rompiente).
2. Escribir el cambio en términos de síntoma resuelto, no de archivo tocado.
3. Sincronizar la versión en todos los lugares donde aparece (package.json, manifiesto, nombre del paquete).

## Cómo se verifica (con números, no con adverbios)

- La versión del archivo entregado coincide con la del changelog.
- El changelog no menciona nada que no esté en el paquete.

## No hacer

- No prometer en el changelog una capacidad que quedó declarada.

## Evidencia en el repo

- `package.json`
- `src/engine/entregaRitual.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-cazar-codigo-muerto
description: Encontrar funciones, cases y archivos que ya no usa nadie, y separarlos de los que solo se referencian desde cadenas. Usarla en limpiezas, antes de un split del monolito o cuando el índice pesa demasiado.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [search_in_files, find_symbol, list_files, run_tests, revisar_cambios]
evidencia: [src/grafoDependencias.ts, src/engine/importChecker.ts]
---
# Cazar código muerto sin matar código vivo

> Encontrar funciones, cases y archivos que ya no usa nadie, y separarlos de los que solo se referencian desde cadenas. Usarla en limpiezas, antes de un split del monolito o cuando el índice pesa demasiado.

## Herramientas que usa (todas existen en este build)

`search_in_files` · `find_symbol` · `list_files` · `run_tests` · `revisar_cambios`

## Receta

1. Listar candidatos (export sin usos) y verificar cada uno con `search_in_files` del nombre crudo en todo el repo, incluidos .py, .json y prompts.
2. Antes de borrar: `git_diff` para saber qué se va y poder volver.
3. Borrar de a un símbolo y correr la puerta entre medias; un borrado en lote que rompe no dice cuál rompió.

## Cómo se verifica (con números, no con adverbios)

- La puerta sigue verde después de cada borrado.
- Ninguna herramienta del inventario perdió su `case`.

## No hacer

- No borrar por edad o por «esto seguro no anda»: sin búsqueda, es vandalismo.

## Evidencia en el repo

- `src/grafoDependencias.ts`
- `src/engine/importChecker.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

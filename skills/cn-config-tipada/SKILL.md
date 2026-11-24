---
name: cn-config-tipada
description: Mover números y banderas mágicos a una configuración con tipo, default y origen del valor. Usarla cuando aparece un `5000` repetido, un puerto, un techo o un `true` que nadie sabe qué hace.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file, edit_file, search_in_files, run_tests]
evidencia: [src/engine/configEstructurada.ts, src/engine/configAgente.ts]
---
# Configuración tipada con defaults visibles

> Mover números y banderas mágicos a una configuración con tipo, default y origen del valor. Usarla cuando aparece un `5000` repetido, un puerto, un techo o un `true` que nadie sabe qué hace.

## Herramientas que usa (todas existen en este build)

`read_file` · `edit_file` · `search_in_files` · `run_tests`

## Receta

1. Buscar todas las apariciones del valor (`search_in_files`), incluidas las de tests y prompts.
2. Declarar el valor una sola vez, con comentario de por qué ese número.
3. Reemplazar las apariciones por la referencia y correr la puerta: un trinquete que se mueve indica que el número era una valla, no un dato.

## Cómo se verifica (con números, no con adverbios)

- El número vive en un solo archivo.
- Cambiarlo en un solo lugar cambia la conducta real (se probó una vez).

## No hacer

- No meter configuración en variables de entorno sin default: el arranque sin .env tiene que seguir funcionando.

## Evidencia en el repo

- `src/engine/configEstructurada.ts`
- `src/engine/configAgente.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

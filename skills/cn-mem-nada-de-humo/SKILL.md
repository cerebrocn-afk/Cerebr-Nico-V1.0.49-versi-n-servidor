---
name: cn-mem-nada-de-humo
description: El criterio transversal — antes de ofrecer algo, verificar que exista (herramienta en el inventario, archivo en disco, prueba en la puerta). Usarla en cada respuesta donde se prometen capacidades.
version: 1.0.0
dominio: memoria
estado: probada
requiere: [consultar_espejo, search_in_files, run_tests, read_file_range]
evidencia: [src/engine/catalogoHonesto.ts, src/engine/completitud.ts]
---
# Cero humo: cada capacidad dicha, respaldada

> El criterio transversal — antes de ofrecer algo, verificar que exista (herramienta en el inventario, archivo en disco, prueba en la puerta). Usarla en cada respuesta donde se prometen capacidades.

## Herramientas que usa (todas existen en este build)

`consultar_espejo` · `search_in_files` · `run_tests` · `read_file_range`

## Receta

1. Si el catálogo dice «aspiracional», se dice pendiente; no se ofrece como hecha.
2. Todo número de la respuesta proviene de un archivo o comando leído en esta sesión.
3. Si hace falta una capacidad que no existe, se construye la máquina, se cablea, se prueba, o se informa que no está.

## Cómo se verifica (con números, no con adverbios)

- Ninguna habilidad declarada fue ofrecida como disponible.
- Las limitaciones están dichas en la misma respuesta que la solución.

## No hacer

- No decir «ya está» porque la herramienta devolvió sin error.
- No prometer PDF, APK, integración o modelo que no está montado en este build.

## Evidencia en el repo

- `src/engine/catalogoHonesto.ts`
- `src/engine/completitud.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

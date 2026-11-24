---
name: cn-preview-verificado
description: Usar abrir_previsualizador cuando el usuario tiene que VER la obra, y verificar que la vista apuntaba al archivo correcto. Usarla tras crear o editar HTML/CSS/JS, y ante cualquier queja de «no se ve» o «se ve otra cosa».
version: 1.0.0
dominio: app
estado: probada
requiere: [abrir_previsualizador, read_file_range, list_files, search_in_files]
evidencia: [src/engine/focoPreview.ts, src/engine/viaRapidaPreview.ts, src/utils/previewAntiCache.ts]
---
# Abrir el previsualizador y comprobar que mostró

> Usar abrir_previsualizador cuando el usuario tiene que VER la obra, y verificar que la vista apuntaba al archivo correcto. Usarla tras crear o editar HTML/CSS/JS, y ante cualquier queja de «no se ve» o «se ve otra cosa».

## Herramientas que usa (todas existen en este build)

`abrir_previsualizador` · `read_file_range` · `list_files` · `search_in_files`

## Receta

1. Confirmar qué archivo se está sirviendo (no qué archivo se editó hace diez turnos).
2. Abrir el preview sobre esa ruta exacta.
3. Si el usuario ve otra cosa: buscar rutas relativas rotas con `search_in_files` (`src="`, `href="`) antes de tocar estilos.

## Cómo se verifica (con números, no con adverbios)

- La ruta abierta es la editada (coincidencia verificada).
- Los enlaces internos del HTML apuntan a archivos que existen.

## No hacer

- No confundir el preview del sandbox con el navegador externo: son dos ventanas y el usuario dice cuál.

## Evidencia en el repo

- `src/engine/focoPreview.ts`
- `src/engine/viaRapidaPreview.ts`
- `src/utils/previewAntiCache.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

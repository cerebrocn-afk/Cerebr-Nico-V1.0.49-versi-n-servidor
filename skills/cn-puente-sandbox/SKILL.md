---
name: cn-puente-sandbox
description: Mover archivos entre el sandbox, el workspace y el panel de entregables sin perderlos de vista. Usarla cuando el usuario dice «no lo veo», «no lo puedo abrir» o cuando un archivo se generó y nadie lo encuentra.
version: 1.0.0
dominio: app
estado: probada
requiere: [ingresar_archivo_workspace, promover_archivo_sandbox, list_files, read_file_range]
evidencia: [src/engine/estadoSandbox.ts, src/engine/concienciaSandbox.ts]
---
# Traer y promover archivos entre sandbox y workspace

> Mover archivos entre el sandbox, el workspace y el panel de entregables sin perderlos de vista. Usarla cuando el usuario dice «no lo veo», «no lo puedo abrir» o cuando un archivo se generó y nadie lo encuentra.

## Herramientas que usa (todas existen en este build)

`ingresar_archivo_workspace` · `promover_archivo_sandbox` · `list_files` · `read_file_range`

## Receta

1. Confirmar la ruta real con `list_files` antes de mover nada.
2. Promover al workspace/entrega y decir la ruta final, absoluta, en la respuesta.
3. Releer un pedazo del archivo promovido para probar que llegó entero.

## Cómo se verifica (con números, no con adverbios)

- La ruta comunicada es la que el usuario puede abrir (panel de archivos a la derecha).
- El tamaño leído coincide con el escrito.

## No hacer

- No anunciar «listo, en tu carpeta» sin una ruta verificada.

## Evidencia en el repo

- `src/engine/estadoSandbox.ts`
- `src/engine/concienciaSandbox.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

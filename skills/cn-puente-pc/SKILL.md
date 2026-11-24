---
name: cn-puente-pc
description: Usar pc_read_file / pc_write_file / pc_exec para tocar la máquina del usuario cuando el sandbox no alcanza (Descargas, Documentos, rutas absolutas). Usarla cuando el archivo nombrado está claramente fuera del proyecto.
version: 1.0.0
dominio: app
estado: probada
requiere: [pc_info, pc_list_dir, pc_read_file, pc_write_file, pc_exec]
evidencia: [src/engine/capacidadesPuente.ts, src/engine/contenedor.ts]
---
# Trabajar sobre la PC real con el puente

> Usar pc_read_file / pc_write_file / pc_exec para tocar la máquina del usuario cuando el sandbox no alcanza (Descargas, Documentos, rutas absolutas). Usarla cuando el archivo nombrado está claramente fuera del proyecto.

## Herramientas que usa (todas existen en este build)

`pc_info` · `pc_list_dir` · `pc_read_file` · `pc_write_file` · `pc_exec`

## Receta

1. Empezar con `pc_info` y `pc_list_dir`: la ruta existe o no existe; se averigua, no se supone.
2. Leer antes de escribir; si el destino ya tiene contenido, se avisa y se pide permiso explícito.
3. Toda `pc_exec` se anuncia con su comando y su efecto; las destructivas no se improvisan.

## Cómo se verifica (con números, no con adverbios)

- Los caminos usados son absolutos y reales en la máquina del usuario.
- Nada se borró sin que el usuario lo haya pedido con esas palabras.

## No hacer

- No copiar rutas del sandbox (`/root/...`) creyendo que existen en la PC.

## Evidencia en el repo

- `src/engine/capacidadesPuente.ts`
- `src/engine/contenedor.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-entrega-zip
description: Armar el paquete final con `crear_zip` (archivos del workspace y/o contenido escrito en la llamada) y reportar lo que el paquete reabierto dice. Usarla para cerrar cualquier obra con varios archivos.
version: 1.0.0
dominio: entrega
estado: probada
requiere: [crear_zip, list_files, run_command, read_file]
evidencia: [src/engine/herramientaZip.ts, src/engine/zipMinimo.ts]
---
# Empaquetar la entrega en un ZIP auditable

> Armar el paquete final con `crear_zip` (archivos del workspace y/o contenido escrito en la llamada) y reportar lo que el paquete reabierto dice. Usarla para cerrar cualquier obra con varios archivos.

## Herramientas que usa (todas existen en este build)

`crear_zip` · `list_files` · `run_command` · `read_file`

## Receta

1. Listar qué va a entrar y por qué; lo generado y lo de caché quedan fuera.
2. Una llamada a `crear_zip` con `entradas` (texto o `ruta` a archivos ya creados) y/o `desde`.
3. Reportar `entradas`, `bytes` y `sha256` leídos del paquete, y verificar con `unzip -t` si el usuario lo va a abrir en otra máquina.

## Cómo se verifica (con números, no con adverbios)

- El sha256 del paquete está en la respuesta.
- Reabierto, el zip tiene la misma cantidad de archivos que se listaron.

## No hacer

- No empaquetar sin haber pasado sin-claves.
- No comprimir con `run_command zip` rutas absolutas: el candado del sandbox se entera tarde.

## Evidencia en el repo

- `src/engine/herramientaZip.ts`
- `src/engine/zipMinimo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

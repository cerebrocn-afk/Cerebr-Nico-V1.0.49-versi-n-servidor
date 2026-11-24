---
name: cn-endpoint-con-guarda
description: Sumar una ruta HTTP al servidor validando cuerpo, ruta y tamaño antes de usarlos. Usarla cuando se agrega API al server o a un router de `server/routers/`.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file_range, edit_file, run_command, revisar_cambios]
evidencia: [server/routers/exportacion.ts, server/routers/trabajo.ts]
---
# Endpoint con guarda de entrada

> Sumar una ruta HTTP al servidor validando cuerpo, ruta y tamaño antes de usarlos. Usarla cuando se agrega API al server o a un router de `server/routers/`.

## Herramientas que usa (todas existen en este build)

`read_file_range` · `edit_file` · `run_command` · `revisar_cambios`

## Receta

1. Copiar la forma de un router existente de `server/routers/` (guarda, respuesta de error, cierre de conexión).
2. Validar tipos y largos antes de tocar disco; un candado de rutas dentro del workspace es obligatorio si la ruta viene del cliente.
3. Devolver error con motivo en 400 y algo accionable; nunca una página de stack.
4. Probar el endpoint con un `run_command` real (curl al 127.0.0.1) y leer la respuesta.

## Cómo se verifica (con números, no con adverbios)

- La ruta responde bien con entrada buena y con entrada podrida.
- Ninguna ruta absoluta del cliente llega a `fs` sin pasar por el candado.

## No hacer

- No inventar un esquema nuevo si el router de al lado ya tiene uno: la casa se copia a sí misma.

## Evidencia en el repo

- `server/routers/exportacion.ts`
- `server/routers/trabajo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

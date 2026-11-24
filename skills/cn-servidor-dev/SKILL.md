---
name: cn-servidor-dev
description: Arrancar el dev/producción, detectar el puerto realmente escuchado y no matar procesos a ciegas. Usarla cada vez que haga falta el server vivo para probar algo.
version: 1.0.0
dominio: app
estado: probada
requiere: [run_command, read_file_range, list_files]
evidencia: [server.ts, src/engine/rutasSistema.ts]
---
# Levantar el servidor y elegir puerto sin pelear

> Arrancar el dev/producción, detectar el puerto realmente escuchado y no matar procesos a ciegas. Usarla cada vez que haga falta el server vivo para probar algo.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file_range` · `list_files`

## Receta

1. Levantar con el script del package.json (`npm run dev`), en segundo plano si el comando no devuelve.
2. Leer el log de arranque para ver el puerto real: el triángulo 3000/5000/11434 no es un deseo, es lo que dice el log.
3. Probar contra 127.0.0.1 con `run_command` y leer la respuesta.

## Cómo se verifica (con números, no con adverbios)

- El puerto usado salió del log, no de la costumbre.
- Se dejó dicho si el servidor quedó corriendo o se lo detuvo.

## No hacer

- No matar procesos por nombre sin ver la lista: se lleva puesto otro servidor.

## Evidencia en el repo

- `server.ts`
- `src/engine/rutasSistema.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

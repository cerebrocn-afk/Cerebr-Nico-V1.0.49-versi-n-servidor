---
name: cn-entrega-sin-claves
description: Correr el guardián anti-claves sobre lo que se va a entregar y leer su salida. Usarla antes de ZIP, antes de commit y antes de mandar cualquier archivo generado.
version: 1.0.0
dominio: entrega
estado: probada
requiere: [run_command, read_file, list_files, search_in_files]
evidencia: [scripts/sin-claves.mjs, src/engine/redaccionSecretos.ts]
---
# Ningún secreto viaja en la entrega

> Correr el guardián anti-claves sobre lo que se va a entregar y leer su salida. Usarla antes de ZIP, antes de commit y antes de mandar cualquier archivo generado.

## Herramientas que usa (todas existen en este build)

`run_command` · `read_file` · `list_files` · `search_in_files`

## Receta

1. `node scripts/sin-claves.mjs` sobre el contenido que viaja (después de descomprimir si es un paquete).
2. Si detecta, se saca la clave del artefacto y se le pide al usuario que revoque la que ya salió.
3. Declarar en la respuesta que se corrió y con qué resultado.

## Cómo se verifica (con números, no con adverbios)

- El exit code del guardián es 0 y se leyó.
- Ningún token, clave o ruta de usuario quedó en los entregables.

## No hacer

- No «enmascarar» el aviso con un placeholder para que pase: la clave sigue expuesta.

## Evidencia en el repo

- `scripts/sin-claves.mjs`
- `src/engine/redaccionSecretos.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

---
name: cn-migracion-de-datos
description: Transformar un archivo o carpeta de un formato a otro con conteo antes/después y copia de seguridad. Usarla con estados guardados, sesiones, JSON de configuración o datasets del usuario.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file, write_file, convertir_formato, run_command, search_in_files]
evidencia: [src/engine/formatConverter.ts, src/utils/restorePoints.ts]
---
# Migración de datos reversible y medida

> Transformar un archivo o carpeta de un formato a otro con conteo antes/después y copia de seguridad. Usarla con estados guardados, sesiones, JSON de configuración o datasets del usuario.

## Herramientas que usa (todas existen en este build)

`read_file` · `write_file` · `convertir_formato` · `run_command` · `search_in_files`

## Receta

1. Contar lo que hay antes de tocar: registros, claves, tamaño.
2. Copiar el original a un nombre con sufijo de versión y decirlo en la respuesta.
3. Transformar y volver a contar; los números tienen que casar o explicar la diferencia.
4. Mostrar una muestra del resultado (3-5 registros), no el archivo entero.

## Cómo se verifica (con números, no con adverbios)

- `conte_antes` y `conte_despues` declarados y leídos del archivo, no estimados.
- El original sigue intacto y se dice dónde está.

## No hacer

- No migrar en el sitio sin copia, ni borrar la copia al terminar sin avisar.

## Evidencia en el repo

- `src/engine/formatConverter.ts`
- `src/utils/restorePoints.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

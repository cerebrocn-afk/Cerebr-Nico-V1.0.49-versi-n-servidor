---
name: cn-datos-unicos-y-duplicados
description: Encontrar duplicados y decidir cuál gana con criterio explícito (última fecha, más completo, fuente autorizada). Usarla en listas de contactos, catálogos, productos o registros migrados.
version: 1.0.0
dominio: datos
estado: probada
requiere: [read_file, convertir_formato, run_command, write_file]
evidencia: [src/utils/evolutionDB.ts, src/engine/taskStoreFs.ts]
---
# Deduplicar sin perder la fila buena

> Encontrar duplicados y decidir cuál gana con criterio explícito (última fecha, más completo, fuente autorizada). Usarla en listas de contactos, catálogos, productos o registros migrados.

## Herramientas que usa (todas existen en este build)

`read_file` · `convertir_formato` · `run_command` · `write_file`

## Receta

1. Definir la clave de identidad ANTES de deduplicar (mail, id, nombre normalizado).
2. Declarar la regla de preferencia y aplicarla en un script/paso verificable.
3. Reportar cuántos eran, cuántos quedaron y cuáles se fusionaron con datos parciales.

## Cómo se verifica (con números, no con adverbios)

- `antes − eliminados = después` cierra.
- Ninguna fila borrada tenía un dato único que no esté en el sobreviviente.

## No hacer

- No deduplicar por nombre exacto cuando el mismo cliente está escrito con y sin tilde.

## Evidencia en el repo

- `src/utils/evolutionDB.ts`
- `src/engine/taskStoreFs.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

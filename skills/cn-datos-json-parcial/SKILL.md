---
name: cn-datos-json-parcial
description: Recuperar datos de JSON truncado, con comas colgantes o generado por un modelo. Usarla cuando un parse explota, cuando la respuesta del proveedor se cortó o cuando un archivo de estado quedó a medias.
version: 1.0.0
dominio: datos
estado: probada
requiere: [read_file, convertir_formato, edit_file, run_command]
evidencia: [src/engine/jsonParcial.ts, src/engine/hashArgs.ts]
---
# JSON que llega a pedazos o mal formado

> Recuperar datos de JSON truncado, con comas colgantes o generado por un modelo. Usarla cuando un parse explota, cuando la respuesta del proveedor se cortó o cuando un archivo de estado quedó a medias.

## Herramientas que usa (todas existen en este build)

`read_file` · `convertir_formato` · `edit_file` · `run_command`

## Receta

1. Leer el archivo y localizar dónde se rompe (llave sin cerrar, coma final).
2. Reparar la estructura mínima y volver a parsear; si hay datos perdidos, decir cuántos.
3. Guardar el original antes de reparar y ofrecer el archivo saneado con otro nombre.

## Cómo se verifica (con números, no con adverbios)

- El parse final es exitoso y su conteo coincide con lo visible.
- El original intacto sigue en disco.

## No hacer

- No reconstruir datos que no estaban: un JSON reparado no es una licencia para inventar claves.

## Evidencia en el repo

- `src/engine/jsonParcial.ts`
- `src/engine/hashArgs.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

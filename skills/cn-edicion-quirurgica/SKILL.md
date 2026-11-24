---
name: cn-edicion-quirurgica
description: Cambiar el mínimo texto posible sin romper indentación ni vecindad. Usarla para todo parche chico, y sobre todo cuando el archivo es compartido o tiene trinquete de líneas.
version: 1.0.0
dominio: codigo
estado: probada
requiere: [read_file_range, edit_file, revisar_cambios]
evidencia: [src/engine/parcheRango.ts, src/engine/capaTransaccion.ts]
---
# Edición quirúrgica con ancla única

> Cambiar el mínimo texto posible sin romper indentación ni vecindad. Usarla para todo parche chico, y sobre todo cuando el archivo es compartido o tiene trinquete de líneas.

## Herramientas que usa (todas existen en este build)

`read_file_range` · `edit_file` · `revisar_cambios`

## Receta

1. Leer el fragmento exacto en el rango que se va a tocar: la ancla se COPIA de lo leído, no se reescribe de memoria.
2. Elegir un `old_string` que aparezca una sola vez; si aparece dos, se agranda el contexto hasta que sea único.
3. Editar, y después `revisar_cambios` para ver solo el diff.
4. Si el archivo tiene presupuesto de líneas, medirlo (el contrato vive en `contrato-rutas.json`).

## Cómo se verifica (con números, no con adverbios)

- El diff muestra exactamente lo pedido y nada más.
- El archivo sigue parseando (chequeo de sintaxis del editor en verde).

## No hacer

- No reformatear líneas vecinas «porque estaban feas»: ensucia el diff y oculta el cambio real.

## Evidencia en el repo

- `src/engine/parcheRango.ts`
- `src/engine/capaTransaccion.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

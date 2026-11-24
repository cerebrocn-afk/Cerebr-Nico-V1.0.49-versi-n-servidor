---
name: cn-datos-fechas-y-zona
description: Interpretar, convertir y comparar fechas sin el bug clásico de la medianoche. Usarla cuando hay horarios, plazos, registros con `Z` o `+00:00`, o cuando el usuario reporta «me cambió la fecha».
version: 1.0.0
dominio: datos
estado: probada
requiere: [read_file, run_command, convertir_formato, edit_file]
evidencia: [src/engine/relojModelos.ts, src/engine/continuidadTurno.ts]
---
# Fechas con zona horaria explícita

> Interpretar, convertir y comparar fechas sin el bug clásico de la medianoche. Usarla cuando hay horarios, plazos, registros con `Z` o `+00:00`, o cuando el usuario reporta «me cambió la fecha».

## Herramientas que usa (todas existen en este build)

`read_file` · `run_command` · `convertir_formato` · `edit_file`

## Receta

1. Averiguar la zona de origen del dato (¿viene con offset? ¿es local? ¿es epoch?).
2. Normalizar a ISO 8601 con zona explícita al comparar.
3. Al escribir, decir la zona usada; la hora «del sistema» no es universal.

## Cómo se verifica (con números, no con adverbios)

- Dos fechas comparadas están en la misma zona.
- No hay fechas imposibles (24:00, 31 de febrero).

## No hacer

- No restar días «a ojo» cuando hay horario de verano en el medio.

## Evidencia en el repo

- `src/engine/relojModelos.ts`
- `src/engine/continuidadTurno.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

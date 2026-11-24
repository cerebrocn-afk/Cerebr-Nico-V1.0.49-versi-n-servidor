---
name: cn-modelo-local-ram
description: Decidir qué modelo Ollama cabe en la RAM libre antes de invocarlo, y descargarlo cuando termine la tarea grande. Usarla con cualquier modelo local, sobre todo en equipos de 8 GB.
version: 1.0.0
dominio: app
estado: probada
requiere: [ollama_estado, ollama_expulsar, recursos_maquina, run_command]
evidencia: [src/engine/admisionRam.ts, src/engine/ollamaPugil.ts, server/ollamaBajoConsumo.ts]
---
# Cargar modelo local sin colgar la máquina

> Decidir qué modelo Ollama cabe en la RAM libre antes de invocarlo, y descargarlo cuando termine la tarea grande. Usarla con cualquier modelo local, sobre todo en equipos de 8 GB.

## Herramientas que usa (todas existen en este build)

`ollama_estado` · `ollama_expulsar` · `recursos_maquina` · `run_command`

## Receta

1. `recursos_maquina` + `ollama_estado`: RAM libre y modelos ya cargados.
2. Si la admisión dice riesgo, se elige un modelo más chico o se libera uno antes de cargar.
3. Al terminar la tanda, `ollama_expulsar` del modelo pesado para devolver la memoria.

## Cómo se verifica (con números, no con adverbios)

- La decisión cita los números leídos (libre, tamaño del modelo).
- No quedaron dos modelos pesados cargados a la vez.

## No hacer

- No asumir que «anda lento»: si el watchdog cortó, fue la RAM, y se dice.

## Evidencia en el repo

- `src/engine/admisionRam.ts`
- `src/engine/ollamaPugil.ts`
- `server/ollamaBajoConsumo.ts`

<!-- generada por scripts/generar-skills-cn.mjs desde scripts/habilidades-cn.mjs — no editar a mano: se pierde en la próxima tanda -->

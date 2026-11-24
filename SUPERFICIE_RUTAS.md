# SUPERFICIE DE RUTAS — orden de trabajo de la Fase 2

> **Generado** por `scripts/superficie.mjs` el 2026-11-20. No editar a mano.
> **Total:** 210 rutas · **server.ts:** 12277 líneas · **con guard:** 43
> **Progreso Fase 2:** por mover 79 · extraídas 131

Esto NO es documentación: es la lista de trabajo. Cada fila es un módulo que se extrae
de `server.ts` a `server/routers/<dominio>.ts` sin cambiar ni una ruta ni un comportamiento.
El contrato (`contrato-rutas.json`) impide que ninguna se pierda por el camino, y la
columna «Dónde» dice a quién le toca: si pone `server.ts`, aún hay que moverlo.

| Dominio | Rutas | Métodos | Con guard | Líneas (aprox.) | Dónde |
|---|---:|---|---:|---|---|
| `brain` | 20 | DELETE/GET/POST | 1 | 447–813 | `server/routers/brain.ts` |
| `engine` | 13 | GET/POST | 1 | 4628–5744 | `server.ts` |
| `espejos` | 12 | GET/POST | 1 | 4993–5528 | `server.ts` |
| `consejo` | 10 | GET/POST | 2 | 86–5268 | `server.ts` + `server/routers/nucleoAgentico.ts` |
| `features` | 9 | GET/POST | 0 | 57–132 | `server/routers/features.ts` |
| `sandbox` | 9 | GET/POST | 7 | 83–8397 | `server.ts` + `server/routers/estadoSandbox.ts` |
| `export` | 8 | GET/POST | 4 | 109–429 | `server/routers/exportacion.ts` |
| `extensions` | 8 | DELETE/GET/POST | 4 | 6229–6739 | `server.ts` |
| `ollama` | 7 | GET/POST | 0 | 43–5754 | `server.ts` + `server/routers/diagnostico.ts` + `server/routers/ollamaControl.ts` |
| `fs` | 6 | GET/POST | 6 | 8544–9216 | `server.ts` |
| `rag` | 6 | GET/POST | 0 | 50–106 | `server/routers/vectorRag.ts` |
| `carpeta` | 5 | GET/POST | 0 | 283–407 | `server/routers/carpetaProyecto.ts` |
| `quirofano` | 5 | GET/POST | 3 | 211–2856 | `server.ts` + `server/routers/quirofanoInterruptor.ts` |
| `arranque` | 4 | GET/POST | 0 | 573–582 | `server/routers/supervisorArranque.ts` |
| `autoLlamado` | 4 | GET/POST | 0 | 98–156 | `server/routers/autoLlamado.ts` |
| `automejora` | 4 | GET/POST | 0 | 51–102 | `server/routers/automejora.ts` |
| `boveda` | 4 | GET/POST | 1 | 5062–5118 | `server.ts` |
| `capacidades` | 4 | GET/POST | 0 | 46–153 | `server/routers/capacidades.ts` |
| `conciencia` | 4 | GET/POST | 4 | 75–133 | `server/routers/concienciaSandbox.ts` |
| `espejos-servidor` | 4 | GET/POST | 0 | 30–50 | `server/routers/espejosServidor.ts` |
| `fondo` | 4 | DELETE/GET/POST | 2 | 6261–6303 | `server.ts` |
| `proyecto` | 4 | GET/POST | 0 | 84–6537 | `server.ts` + `server/routers/rutasProyecto.ts` |
| `trabajo` | 4 | GET/POST | 0 | 24–60 | `server/routers/trabajo.ts` |
| `enjambre` | 3 | GET/POST | 2 | 108–340 | `server/routers/enjambre.ts` |
| `puente` | 3 | GET/POST | 1 | 26–6336 | `server.ts` + `server/routers/puenteDependencias.ts` |
| `verifier` | 3 | GET/POST | 0 | 49–79 | `server/routers/calidad.ts` |
| `aprender` | 2 | GET/POST | 0 | 300–313 | `server/aprendizajeVivo.ts` |
| `cerebro` | 2 | GET/POST | 0 | 502–511 | `server/routers/embedderCerebro.ts` |
| `multiagente` | 2 | GET/POST | 1 | 132–146 | `server/routers/nucleoAgentico.ts` |
| `perfeccion` | 2 | GET/POST | 1 | 630–665 | `server/routers/brain.ts` |
| `persistencia` | 2 | GET/POST | 0 | 68–79 | `server/routers/persistencia.ts` |
| `raiz` | 2 | GET | 0 | 6758–12161 | `server.ts` |
| `reflejo` | 2 | GET/POST | 0 | 4883–4891 | `server.ts` |
| `rutas` | 2 | GET/POST | 0 | 47–130 | `server/routers/rutasProyecto.ts` |
| `telemetry` | 2 | GET/POST | 0 | 244–275 | `server/routers/telemetria.ts` |
| `tools` | 2 | GET/POST | 0 | 56–12019 | `server.ts` + `server/routers/estadoPacksMcp.ts` |
| `tts` | 2 | GET/POST | 0 | 94–98 | `server/routers/geminiTts.ts` |
| `ai` | 1 | POST | 0 | 9498–9498 | `server.ts` |
| `artefacto` | 1 | POST | 0 | 2832–2832 | `server.ts` |
| `bridge` | 1 | POST | 0 | 12010–12010 | `server.ts` |
| `cloud` | 1 | GET | 0 | 322–322 | `server/routers/modelos.ts` |
| `conductor` | 1 | POST | 0 | 5559–5559 | `server.ts` |
| `contenedor` | 1 | POST | 1 | 6466–6466 | `server.ts` |
| `coreo` | 1 | GET | 0 | 6582–6582 | `server.ts` |
| `custom` | 1 | GET | 0 | 411–411 | `server/routers/modelos.ts` |
| `diagnostico` | 1 | POST | 0 | 550–550 | `server/routers/diagnostico.ts` |
| `entrada` | 1 | POST | 0 | 5133–5133 | `server.ts` |
| `exec` | 1 | POST | 1 | 8468–8468 | `server.ts` |
| `explicar` | 1 | GET | 0 | 191–191 | `server/routers/nucleoAgentico.ts` |
| `gemini` | 1 | GET | 0 | 109–109 | `server/routers/modelos.ts` |
| `governor` | 1 | GET | 0 | 98–98 | `server/routers/calidad.ts` |
| `health` | 1 | GET | 0 | 344–344 | `server/routers/diagnostico.ts` |
| `mcp` | 1 | POST | 0 | 74–74 | `server/routers/estadoPacksMcp.ts` |
| `openai` | 1 | GET | 0 | 205–205 | `server/routers/modelos.ts` |
| `openrouter` | 1 | GET | 0 | 153–153 | `server/routers/modelos.ts` |
| `subagents` | 1 | GET | 0 | 33–33 | `server/routers/subagentes.ts` |
| `system` | 1 | GET | 0 | 290–290 | `server/routers/telemetria.ts` |
| `zai` | 1 | GET | 0 | 278–278 | `server/routers/modelos.ts` |

## Orden sugerido de extracción

1. **Primero los de lectura y pocos métodos** (los GET de dominios pequeños): riesgo bajo,
   y sirven para validar el mecanismo de extracción sin tocar nada que escriba.
2. **Después los dominios grandes pero independientes** (`brain`, `engine`, `espejos`).
3. **Al final los que tocan el chat y el sandbox** (`ai`, `sandbox`): son los que más estado
   comparten y donde el monolito está más enredado.

Regla de la casa durante toda la fase: **se mueve, no se mejora**. Al cerrar cada dominio,
la puerta debe dar el mismo número de comprobaciones que al empezar.

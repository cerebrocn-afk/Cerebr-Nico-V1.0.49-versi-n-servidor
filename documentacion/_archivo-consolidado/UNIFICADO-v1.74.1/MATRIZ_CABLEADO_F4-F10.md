# MATRIZ DE CABLEADO F4–F10 — CerebróNico IDE

> Generado por `scripts/verificar-cableado.mjs --md` (diagnóstico PURO, Node v16, sin red).
> VERIFICADO POR EJECUCIÓN. No modifica código. Fecha: 2026-10-08.

**Leyenda:** CABLEADO = importado y usado en `server.ts` · IMPORTADO-SIN-USO = importado pero sus exports no se referencian en el cuerpo · INDIRECTO = no lo toca `server.ts` pero sí otro módulo de `src/` · HUÉRFANO = ningún código de producción lo importa (puede tener test) · NO-EXISTE = archivo ausente.
> «Probado (test)» = alguna suite de `tests/` lo importa. **Probado ≠ cableado:** un módulo puede estar verde en tests y no invocarse NUNCA en vivo.

| Fase | Módulo | Estado | En server.ts | Refs en cuerpo | Probado (test) | Importadores (fuera de server) |
|---|---|---|---|---|---|---|
| F4 · Evidencia | `evidenciaTurno` | **CABLEADO** | Sí | 4 | No | src/engine/autovalido.ts |
| F4 · Evidencia | `motorEvidencia` | **CABLEADO** | Sí | 1 | Sí | src/engine/autovalido.ts<br>src/engine/matrizVerificacion.ts |
| F4 · Evidencia | `matrizVerificacion` | **HUÉRFANO** | No | 0 | Sí | — |
| F5 · Recuperación | `motorRecuperacion` | **HUÉRFANO** | No | 0 | Sí | — |
| F5 · Recuperación | `estadoRescate` | **CABLEADO** | Sí | 16 | Sí | — |
| F5 · Recuperación | `presupuestoReparacion` | **HUÉRFANO** | No | 0 | Sí | — |
| F6 · Grafo / Regresión | `grafoProyecto` | **INDIRECTO** | No | 0 | Sí | src/engine/grafoRico.ts<br>src/engine/motorContexto.ts |
| F6 · Grafo / Regresión | `grafoRico` | **INDIRECTO** | No | 0 | Sí | src/engine/guardianRegresion.ts |
| F6 · Grafo / Regresión | `guardianRegresion` | **HUÉRFANO** | No | 0 | Sí | — |
| F7 · Navegador | `navegadorReal` | **HUÉRFANO** | No | 0 | Sí | — |
| F8 · Visual | `regresionVisual` | **HUÉRFANO** | No | 0 | Sí | — |
| F8 · Visual | `redimensionPantalla` | **HUÉRFANO** | No | 0 | Sí | — |
| F8 · Visual | `pantallaCompleta` | **HUÉRFANO** | No | 0 | Sí | — |
| F9 · Model Router | `enrutadorModelo` | **HUÉRFANO** | No | 0 | Sí | — |
| F9 · Model Router | `modelTiers` | **CABLEADO** | Sí | 23 | Sí | src/engine/enrutadorModelo.ts<br>src/engine/superPrompt.ts<br>src/utils/contextCache.ts<br>src/utils/engine.ts |
| F9 · Model Router | `providerRouting` | **HUÉRFANO** | No | 0 | Sí | — |
| F10 · Memoria 3.0 | `memoriaArquitectura` | **HUÉRFANO** | No | 0 | Sí | — |
| F10 · Memoria 3.0 | `memoriaResiliente` | **CABLEADO** | Sí | 6 | Sí | src/engine/planRunner.ts<br>src/engine/taskPlanner.ts |
| F10 · Memoria 3.0 | `memoriaNegativa` | **HUÉRFANO** | No | 0 | Sí | — |

## Resumen

- **CABLEADO**: 5
- **HUÉRFANO**: 12
- **INDIRECTO**: 2

## Símbolos usados en server.ts (por módulo CABLEADO)

- `evidenciaTurno`: anotarHerramienta(3), actaDelTurno(1)
- `motorEvidencia`: estadoEvidencias(1)
- `estadoRescate`: planearFusion(3), rutaRelRescate(2), procederBorrado(2), resumenRescate(4), planReSembrado(3), decidirRespaldo(2)
- `modelTiers`: getModelProfile(5), buildOllamaOptions(5), trimMessagesToBudget(4), condensarHistorial(2), trimIncomingPrompt(3), parseParamsB(1), keepAliveExplicito(3)
- `memoriaResiliente`: resolverPresupuesto(1), siguienteEscalado(1), ESCALADOS(1), PERFILES_MR(1), ORDEN_MR(1), etiquetaEscalado(1)

## Suites que cubren cada módulo (tests/)

- `motorEvidencia`: tests/motorEvidencia.test.ts
- `matrizVerificacion`: tests/matrizVerificacion.test.ts
- `motorRecuperacion`: tests/motorRecuperacion.test.ts
- `estadoRescate`: tests/estadoRescate.test.ts
- `presupuestoReparacion`: tests/presupuestoReparacion.test.ts
- `grafoProyecto`: tests/grafoProyecto.test.ts, tests/motorContexto.test.ts
- `grafoRico`: tests/grafoRico.test.ts
- `guardianRegresion`: tests/grafoRico.test.ts
- `navegadorReal`: tests/navegadorReal.test.ts
- `regresionVisual`: tests/calidadVisual.test.ts
- `redimensionPantalla`: tests/redimensionPantalla.test.ts
- `pantallaCompleta`: tests/pantallaCompleta.test.ts
- `enrutadorModelo`: tests/enrutadorModelo.test.ts
- `modelTiers`: tests/bajoConsumo.test.ts, tests/motor-datos.test.ts
- `providerRouting`: tests/providerRouting.test.ts
- `memoriaArquitectura`: tests/memoria3.test.ts
- `memoriaResiliente`: tests/imagen.test.ts, tests/planner.test.ts
- `memoriaNegativa`: tests/memoria3.test.ts

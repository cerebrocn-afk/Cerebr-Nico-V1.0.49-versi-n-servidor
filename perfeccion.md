# PERFECIÓN — manual del motor (perfeccion.md)

> Documento vivo que ESCRIBE EL MOTOR, no el usuario: acá quedan TODAS las
> rutas validadas y los procesos con validación. Reglas del manual:
> 1) la ruta se FIJA al crear el plan y se RECORRE por sus rutas relativas (tareas);
> 2) una ruta vale como `validada` SOLO con evidencia de ejecución (escribir no es probar);
> 3) la auto-mejora, cuando actúa, escribe aquí lo que validó, con comando y veredicto.
> Última versión del motor que escribió este manual: 1.86.0.

Rutas: 0 · Rutas relativas: 0 (0 validadas, 0 sin evidencia, 0 fallidas, 0 fijadas) · Procesos con validación: 9

## RUTAS

(Todavía ninguna ruta fijada: el primer plan que el chat cree aparecerá acá con sus rutas relativas.)

## PROCESOS CON VALIDACIÓN

| Proceso | Comando | Veredicto | Origen | Cuándo |
|---|---|---|---|---|
| nucleo-agentico-fase6 | `node scripts/validar.mjs` | verde: inventarioEntidades (53) + cicloDecision (41) + multiagenteRelevo (41) + aduanaForja (50) | FASE 6 del plano de la perfección, cerra… | 2026-10-27 12:00:00 UTC |
| sandbox-con-cerebro-fase7 | `node scripts/validar.mjs` | verde: concienciaSandbox (61) + explicarDecision (34); contrato «ninguna cita sin ruta» con plaga se… | FASE 7 del plano, cerrada en v1.86.0 (qu… | 2026-10-27 12:00:00 UTC |
| relevo-por-diseno | `node scripts/validar.mjs` | criterio en src/engine/relevoFavoritos.ts (tope 2 + informe honesto), cable en App.tsx (onError + on… | trasladado del md escrito a mano: el JSO… | 2026-10-27 12:00:00 UTC |
| respuesta-ecleutica | `node scripts/validar.mjs` | criterio puro en src/engine/enjambreEclectico.ts (voz de respaldo declarada; confianza escalada con … | trasladado del md escrito a mano: el JSO… | 2026-10-27 12:00:00 UTC |
| ranura-sin-marcas | `node scripts/validar.mjs` | nombre único en src/engine/ranuraUnificada.ts; export tolerante por FORMATO, comando distinto de cla… | trasladado del md escrito a mano: el JSO… | 2026-10-27 12:00:00 UTC |
| gobernante-fase3 | `node scripts/validar.mjs` | criterio puro src/engine/gobernante.ts (clamp 2..n-1..8; RAM >70% sostenido degrada a 1 worker), apl… | trasladado del md escrito a mano: el JSO… | 2026-10-27 12:00:00 UTC |
| superficie-fase4 | `node scripts/validar.mjs` | registro puro contratoSuperficie.ts + fixture versionado + Avanzado.tsx; explorador y chat-input ple… | trasladado del md escrito a mano: el JSO… | 2026-10-27 12:00:00 UTC |
| entrega-fase5 | `node scripts/validar.mjs` | npm run entregar / entregar:verificar sobre funciones puras entregaRitual.ts; el paquete de ESTA ver… | trasladado del md escrito a mano: el JSO… | 2026-10-27 12:00:00 UTC |
| organo-vectorizado-fase2 | `node scripts/validar.mjs` | criterio puro vectorCerebro.ts (coseno, 0.7/0.3 ajustable, ventana contra reloj); cerebroOrgano.enru… | trasladado del md escrito a mano: el JSO… | 2026-10-27 12:00:00 UTC |

---

*Escrito por el motor (módulo `manualPerfeccion` + `manualPerfeccionDisco`). Si un tramo dice
`cerrada_sin_evidencia` o `fallida`, el motor lo sabe y lo muestra: este manual no maquilla.*

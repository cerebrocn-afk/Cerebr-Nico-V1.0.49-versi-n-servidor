## v1.68.0 · 2026-10-24 · EL CATÁLOGO ES P0: el manual que no puede recortar una herramienta

> Mario: «algunos proveedores encuentran las rutas y herramientas y otros no».
> Medido sobre v1.67.0 ejecutando su propio código: no era el proveedor. Era el
> corte. Un módulo nuevo (`src/engine/abordaje.ts`), una prueba nueva
> (`tests/abordaje.test.ts`) y un punto de cableado que sustituye a dos cálculos
> que podían divergir.

### La medición, no la hipótesis

Con los presupuestos que `server.ts` reparte por nivel de modelo, esto es lo que
llegaba de verdad al prompt:

| Nivel | Presupuesto | chars devueltos | Herramientas nombradas |
|---|---|---|---|
| nube rápida (flash/lite/mini/turbo/haiku) | 800 → suelo 1450 | 1 390 | **6 de 37** |
| local ≤8 B (`small`) | 1 300 → suelo 1450 | 1 390 | **6 de 37** |
| nube grande / local grande | 1 900 | 1 889 | **10 de 37** |

Gemini Flash, GLM-flash y GPT-4o-mini trabajaban con **un sexto** del catálogo, y el
corte caía sobre herramientas distintas según el orden de la lista. De ahí el
síntoma: dos modelos, dos catálogos, y la sensación de «este proveedor no
encuentra las rutas».

Y debajo había un segundo agujero: `inventarioCanonico()` filtraba
`.filter(n => TOOL_MANUALS[n])`, así que **16 de las 37** herramientas del registro no
se nombraban **nunca**, ni con presupuesto ilimitado. Entre esas 16 están
`revisar_cambios` y `deshacer_cambios`, que son `HUESO_DE_OBRA`
(`toolRegistry.ts:191`): se ofrecen en todos los niveles y jamás se explicaron. El
modelo recibía la función en el esquema y cero prosa sobre ella — la definición
exacta de «no sabe que la tiene».

(Nota de honestidad: el `text.slice(0, budgetChars)` de `buildToolManualSection`
que señalaba la hipótesis inicial **ya no está en el camino de producción**: en
v1.67.0 quien atiende el turno es `buildContratoDeAccion`. El efecto medido es el
mismo —catálogo mutilado—, pero el culpable era otro y queda dicho aquí.)

### El invariante

```
Antes que recortar una herramienta, se EXCEDE el presupuesto — y se DECLARA.
herramientasEnIndice === herramientasTotales, siempre.
```

Una herramienta activa que el modelo no ve en el manual es una herramienta que no
va a usar, o que va a **inventar** con otro nombre. Consecuencia de diseño: el
catálogo de nombres pasa a ser **P0 intocable**, y lo que flexiona es el detalle.

| Prioridad | Contenido | ¿Se recorta? |
|---|---|---|
| P0 | Nombres de TODAS las herramientas activas | **Nunca** |
| P1 | Leyes del motor (3) | Nunca; cambia la densidad (enteras → esenciales → títulos), jamás se corta una frase |
| P2 | Estado MCP | Nunca |
| P3 | Manos (PC vs sandbox) + rutas HTTP por dominio | Sí, si no cabe |
| P4 | Detalle de una línea por herramienta | **Lo primero en caer** |

Costes medidos sobre el catálogo real: `CONTRATO_DE_ACCION` 924 · leyes enteras
1 519 · leyes esenciales ~660 · leyes en títulos 200 · **P0 de 37 nombres 582** ·
P4 completo 3 815. El suelo de un turno completo (P0+P1+P2) ronda los 3 300
caracteres: `presupuestoAbordaje()` lo **deriva** del catálogo en vez de recibir un
literal por tramo.

Resultado después del cambio:

| Modelo | Manual | Detalle | chars (preparados) |
|---|---|---|---|
| gemini-2.5-flash | **37/37** | 18 | 4 947 (4 971) |
| glm-4.5-flash | **37/37** | 18 | 4 947 (4 971) |
| qwen2.5:7b (local) | **37/37** | 10 | 4 168 (4 171) |
| gemma3:27b (local) | **37/37** | 37 | 6 920 (7 204) |
| endpoint custom sin nombre | **11/11** | 8 | 2 836 (2 843) |

### Los cinco defectos y dónde cerraron

1. **Recorte que borra herramientas** → `abordaje.ts`: P0 no se recorta nunca; si no
   cabe el detalle, cae el detalle, y si aun así no cabe el índice se envía y se
   marca `excedido` con el exceso cuantificado en el log.
2. **16 de 37 sin manual** → `notaDeHerramienta()` usa la `description` que **ya
   estaba escrita** en el registro (`getToolSpec(name).description`, la misma que viaja
   al proveedor en el esquema). Cero documentación nueva.
3. **Las MCP nunca se explicaban** → P2 en tres estados honestos: cargadas y en el
   catálogo → se las nombra; cargadas pero fuera del catálogo de este turno → se le
   dice que no las llame; ausentes → se dice que no hay y se le prohíbe inventarlas.
4. **El manual no correspondía a las herramientas enviadas** → un único
   `planDeAbordaje()` calcula el conjunto del turno y ese mismo array va al esquema
   y al manual. Las **11 ramas** de proveedor (gemini, openrouter, custom, zai, groq,
   cerebras, together, mistral, deepseek, fireworks, ollama) usan
   `herramientasTurno`. El nombre lo resuelve `resolverModeloEfectivo()`
   (`src/utils/providerRouting.ts`) con la misma tabla de defaults que cada rama tenía
   por su cuenta: el perfil, el esquema y el manual salen del mismo nombre.
5. **`toolCapable` por regex del nombre** → `capacidadSinVerificar()`
   (`modelTiers.ts`) separa *verificado-no* (chico por tamaño o tramo: sigue sin
   herramientas) de *sin verificar* (nombre desconocido, endpoint custom, alias
   nuevo). El segundo ya no se castiga con `[]`: recibe el **juego mínimo** (hueso de
   obra + externas cargadas) y un aviso en el log que dice cómo declararlo.

### Lo que se tocó

* `src/engine/abordaje.ts` — **nuevo**. Motor puro (sin fs, sin red, sin modelo):
  `construirAbordaje()`, `presupuestoAbordaje()`, `charsDetalleDe()`,
  `auditarManuales()`, `planDeAbordaje()`, `auditarCatalogoUnaVez()`.
* `tests/abordaje.test.ts` — **nuevo**. 57 correctas. El catálogo es el **registro
  real**, no una lista de adorno: si alguien añade la herramienta 38 sin escribirle
  manual, la prueba sigue exigiendo que se la nombre.
* `src/engine/manuals.ts` — `PROVEEDORES_SIN_CICLO_DE_TEXTO` pasa a ser exportado
  (una sola regla de «dónde nace la acción»). `buildToolManualSection` queda como
  código muerto con su prueba: **no se ha borrado** para no tocar 344 líneas de
  leyes con la excusa del arreglo.
* `src/engine/modelTiers.ts` — `capacidadSinVerificar()`.
* `src/utils/providerRouting.ts` — `MODELO_POR_DEFECTO_PROVEEDOR` + `resolverModeloEfectivo()`.
* `server.ts` — el bloque FASE 2-3 queda **fuera** del `try` del conocimiento del
  motor: si la KB falla se pierde un párrafo de contexto; si fallara además esto, se
  perderían las manos en silencio.
* `contrato-rutas.json` — regenerado: 12 189 → **12 286** líneas (techo 13 800, margen
  1 514). El trinquete se mueve aquí porque el alta es querida y declarada: **la
  próxima entrega debe compensarla**, no heredar este número como cómodo.
* `scripts/validar.mjs` — la suite `abordaje` queda catalogada con su motivo.

### Verificación

`abordaje 57·0`, `contratoAccion 56·0` (sin regresión: el estándar de v1.67.0 sigue
byte a byte), `inventarioHerramientas 31·0`, `toolCallsTextuales 28·0`,
`herramientasNube 21·0`, `cicloHerramientasOpenAICompat` verde,
`presupuestoHuerfanos 104·0` (`abordaje` NO es huérfano: está cableado),
`cableadoFases 40·0` (subió de 39·1: `providerRouting` dejó de ser huérfano y se
actualizó su fila en `scripts/cableado-baseline.json`), `superficieRutas 52·0`,
`bajoConsumo 84·0`, `androidProyecto 157·0` y `superficie --verificar` →
**CONTRATO INTACTO**. `motorDatos` estaba roja igual en la base intacta: su archivo
no existe en ninguno de los dos árboles (preexistente, no imputable).

### Queda dicho, no resuelto

* El **detalle** (P4) de 19 de 37 herramientas sigue sin caber en nube rápida. Ahora
  es visible y medido, no invisibile: la línea `ABORDAJE … detalle 18` en el log es la
  cuenta de lo que falta.
* 16 herramientas siguen sin entrada propia en `TOOL_MANUALS`; hablan con la
  `description` del registro. Escribirles su manual (cuándo / cómo / error típico) es
  trabajo de contenido, no de arquitectura, y `auditarManuales()` las nombra una a una.
* La **FASE 4** (cerrar el turno si el modelo anuncia una acción sin llamarla) ya
  vive en `ejecucionFantasma.ts` + `gateCierre.ts`; no se duplicó acá.

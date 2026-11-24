# PLAN — CAPACIDAD DE CÁLCULO DE PROBABILIDADES DEL AGENTE
**Objetivo:** que CerebroNico pase de «funciona o no funciona» a «esto tiene ~78 % de salir (12 éxitos / 3 fallos) — ¿lo intento por el camino del 91 %?».
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)

**Anclas verificadas hoy sobre `work/app`:** server.ts 11 494 l. (presupuesto 11 495) · `src/engine/cerebroReflejo.ts` maneja `confianza` como **constante fija** (0.99, 0.9) y un `UMBRAL_CONFIANZA` de reflejo — etiqueta, no cálculo · `src/engine/votacionConsejo.ts` + `consejoVista.ts` + `ejecutoresConsejo.ts` (Consejo con votaciones reales) · `src/engine/hardwareGovernor.ts` (`Tier`, `ModoTrabajo`, `HardwareMedido`, `Veredicto`, `GovernorReport`) · `bucleAutonomo.ts` con fases/escalera/topadores · `continuidadPlan.ts` (estado entre turnos) · **no existe** ningún motor probabilístico (sin Beta/Brier/score en `src/engine`).

---

## 1. Qué se gana (los cuatro usos que justifican todo)

1. **Elegir camino, no repetir ceguera:** la escalera de reparación hoy sube escalones en orden FIJO. Con probabilidades, el escalón 1 es «el desvío con mayor p(éxito) medido aquí, en esta máquina, con esta herramienta».
2. **Preflight honesto:** antes de arrancar una autotarea, `p(plan verde)` sale del histórico; si es baja, propone el plan más seguro en vez de gastar 200 tokens y 6 minutos.
3. **Umbrales vivos:** el Velador (plan anti-errores V5) usa «>2× umbral» fijo; con distribución de duraciones reales usa cuantil (mediana + k·MAD) — menos falsas alarmas de «se tranca».
4. **Autocreencia calibrada:** el sistema aprende si es optimista: Brier score propio; la UI muestra incertidumbre real, no «100%».

## 2. Núcleo: `src/engine/probabilidades.ts` (puro, sin dependencias, sin ratchet)

Modelo **Beta-Bernoulli conjugado** (el estándar mínimo honesto: cerrado, interpretable, sin librerías):

```ts
export type Posterior = { alfa: number; beta: number };          // éxitos+prior, fallos+prior
export const PRIOR_NEUTRO: Posterior = { alfa: 1, beta: 1 };     // Beta(1,1): «no sé»
export const PRIORES_DOMINIO: Record<string, Posterior>;         // p.ej. read_file (49,1), npm install (3,2) — tabla documentada y editable
export function observar(p: Posterior, exito: boolean, peso = 1): Posterior
export function pExito(p: Posterior): number                     // media posterior = α/(α+β)
export function intervalo90(p: Posterior): [number, number]      // cuantiles numéricos (bisección sobre la beta incompleta regularizada — ~30 líneas, sin deps)
export function riesgoDeAccion(clave: string, ledger: LedgerVista): { p: number; ic: [number, number]; n: number }
export function elegirDesvio(opciones: Desvio[], ledger: LedgerVista): Desvio   // ordena por p×beneficio − costePasos
export function actualizarBrier(historial: BrierHist, pronostico: number, ocurrio: boolean): { score: number; n: number }
export function caducar(p: Posterior, diasDesde: number, lambda = 0.98): Posterior  // recencia: α,β decaen hacia el prior del dominio
```

**Clave de aprendizaje:** `(herramienta, claseError|contexto)` — exactamente la clave del **F1 ledger** del plan de retroalimentación: este plan se apoya en F1 para la persistencia (mismo JSON, campos `alfa/beta` por lección) y funciona sin él (memoria de turno).

**Reglas de honestidad (duras):**
- `n < 5` observaciones → se muestra `p` pero NUNCA decide por el agente (prior de dominio manda).
- Jamás 0.00 ni 1.00: se acota a [0.02, 0.98] — la certeza absoluta es mentira estadística.
- Toda `p` en UI va con su muestra: «78 % · 12✓/3✗» o «62 % · 2 muestras (débil)».

## 3. Puntos de integración (cada uno con su dueño puro)

| # | Punto | Qué cambia | Dónde |
|---|---|---|---|
| I1 | **Escalera de reparación** | escalón 1 = desvío con mayor `pExito` (si hay datos); si no, el orden fijo actual | `bucleAutonomo.ts` — `directivaDeReparacion(escalon, opciones?)` |
| I2 | **Preflight V1 (anti-errores)** | `p(plan verde)` = producto de `riesgoDeAccion` de las tareas (asunción de independencia declarada como límite); < 0.35 → sugiere plan alternativo o pregunta única | `validarPlan` + `probabilidades.ts` |
| I3 | **Velador V5** | umbral de espera = `mediana + 3·MAD` de duraciones de la herramienta (distribución gamma-fitting opcional fase 2) | `velador.ts` (plan anti-errores) |
| I4 | **Reflejos** | las constantes 0.99/0.9 de `cerebroReflejo` pasan a ser PRIOR del dominio; la confianza mostrada se mezcla con tasa histórica real del reflejo | `cerebroReflejo.ts` |
| I5 | **Consejo (votación)** | votos de `votacionConsejo` alimentan observaciones (cada acierto/error de acción consejada = `observar`) | `ejecutoresConsejo.ts` |
| I6 | **HardwareGovernor** | `Veredicto` gana `pCabe: number` (probabilidad de que el modelo quepa fluido con la carga actual, de muestras de `ollama_ps`+RAM) | `hardwareGovernor.ts` |
| I7 | **Gate final** | `p(entrega verde)` de los últimos checkpoints; si < 0.5 el informe honesto lo dice antes de intentar vender el trabajo | `gateFinal` (plan anti-errores A4) |
| I8 | **Selección de modelo** | al pedir tarea, rankear modelos candidatos por `p(éxito de la tarea con ese modelo)` (histórico por modelo ya existe en `fallosPorHerramienta` por turno; persistirlo con F1) | nota de `continuidadPlan` |

**Cableado server.ts:** tope **+8 líneas** (hooks I1/I2 ya viven en rutas puras del bucle; I4–I6 son src/ puro). Compensación nominada: extraer el bloque anti-repetición `repeatCount` de `runOllamaAgentLoop` a función pura en `bucleAutonomo` (−10 líneas). Trinquete intacto.

## 4. UI (solo `src/components/*`)
- Chip discreto en el tablero de tareas: `p` por tarea pendiente («escribir test · 84 %»).
- Tooltip: α/β, intervalo 90 %, última observación, si viene de prior de dominio.
- Panel Rendimiento: Brier score global del IDE (¿somos optimistas?) — un número con tendencia.
- Regla visual: `p` con <5 muestras se muestra **gris** (decorativa, no decisoria).

## 5. Datos: de dónde salen las observaciones
1. `historialBucle` (ya capturado por turno, v1.16.4) → `observar()` en cada cierre de herramienta.
2. F1 ledger (plan retroalimentación) → persistencia con decaimiento `caducar()`.
3. `run_tests`/`validar.mjs` resultados → observaciones para I7.
4. Polls de telemetría (`ollama_ps`, RAM) → serie de duraciones y cabida para I3/I6.
5. Votaciones del Consejo → I5.
**Cold start:** PRIORES_DOMINIO es tabla escrita a mano y versionada en el .md del módulo (cada prior con su justificación de una línea); se recalibra sola con las primeras ~20 observaciones.

## 6. Fases, gates y esfuerzo

| Fase | Contenido | Aceptación (gate casa: verificar 0 · contrato INTACTO · build · manifiesto) |
|---|---|---|
| B1 | `probabilidades.ts` + suite `probabilidades.test.ts` (~40 casos: priors, Bayes mano a mano contra valores conocidos, intervalo, caducidad, acotación 0.02–0.98) | matemática verificada contra ejemplos de tabla beta publicados; 0 dependencias |
| B2 | I1 escalera + I4 reflejos | con ledger sintético, el desvío elegido es el de mayor p; sin datos, comportamiento idéntico al de hoy (no regress) |
| B3 | F1-dependientes: persistencia α/β en ledger + I2 preflight | el preflight rechaza «plan imposible» con número y muestra |
| B4 | I3 velador + I6 governor + I5 consejo | umbrales dinámicos; `pCabe` en el Veredicto |
| B5 | UI chips + Brier panel | incertidumbre visible; nada decide con datos insuficientes |

## 7. Riesgos y mitigaciones
1. **Falsa precisión con muestras chicas** → regla n<5 (gris, no decisorio) + intervalo siempre junto al punto.
2. **Independencia asumida en p(plan)** → declarado como límite; fase 2: co-ocurrencia de fallos (matriz simple herramienta×herramienta).
3. **Envenenamiento del histórico** (un fallo raro contamina) → decaimiento + cap de peso por observación (1) + override manual con motivo.
4. **Latencia** → todo es aritmética sobre contadores (µs); los cuantiles beta se calculan con bisección ~20 iteraciones.
5. **Opacidad** → cada `p` es auditable: α, β, prior usado y últimas N observaciones a un clic.

## 8. Límites honestos
- No es un motor de inferencia bayesiana completo (no hay redes de dependencias): es Beta-Bernoulli por clave, suficiente para «¿reintento o me desvío?» que es el 90 % de las decisiones del bucle.
- Depende de F1 (ledger) para su versión persistente: sin F1, funciona por turno (memoria corta).
- Las probabilidades NO bloquean acciones por sí solas: reordenan, informan y preguntan; el humano y las leyes duras (aduana, guardas, quirofano) mandan.

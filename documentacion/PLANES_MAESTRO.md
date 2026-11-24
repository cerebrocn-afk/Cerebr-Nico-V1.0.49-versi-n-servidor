# PLANES DE CAPACIDAD — Todos los planes v1 unificados

Archivo MAESTRO generado el 2026-10-05. Unifica 5 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [PLAN_CAPACIDAD_ANALISIS_QUIRURGICO_v1.md](#plan-capacidad-analisis-quirurgico-v1-md) — version 1
2. [PLAN_CAPACIDAD_PROBABILIDADES_v1.md](#plan-capacidad-probabilidades-v1-md) — version 1
3. [PLAN_EXPANSION_RETROALIMENTACION_BUCLE_v1.md](#plan-expansion-retroalimentacion-bucle-v1-md) — version 1
4. [PLAN_INTEGRACION_SIMULTANEA_HABILIDADES_v1.md](#plan-integracion-simultanea-habilidades-v1-md) — version 1
5. [PLAN_PAQUETE_ANTI_ERRORES_VALIDACION_CONTINUA_v1.md](#plan-paquete-anti-errores-validacion-continua-v1-md) — version 1


---

<a id="plan-capacidad-analisis-quirurgico-v1-md"></a>
## (1/5) PLAN_CAPACIDAD_ANALISIS_QUIRURGICO_v1.md

> **Fuente:** `./PLAN_CAPACIDAD_ANALISIS_QUIRURGICO_v1.md`  —  **version:** 1  —  **bytes:** 9924
# PLAN — CAPACIDAD DE ANÁLISIS QUIRÚRGICO DE INGENIERO DE SOFTWARE
**Objetivo:** que ante un bug, el agente NO «toque a ver si mejora»: que opere como un ingeniero senior — localiza, traza, encuentra la causa raíz, diseña el parche MÍNIMO, vacuna con test de regresión y cierra con evidencia.
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)

**Anclas verificadas hoy sobre `work/app`:** `src/engine/quirofano.ts` (versión 1.0.0; `UMBRAL_AMPUTACION=0.35`, `UMBRAL_AVISO=0.12`, `MIN_LINEAS_PARA_CIRUGIA=30`, `RUTAS_DE_RIESGO`, `normalizarRuta`) · `src/engine/importChecker.ts` (`extraerImportsRelativos`, `findMissingImports`, `buildStubs`) · `src/engine/dependenciasProyecto.ts` (`extraerPaquetesConOrigen`) · herramientas existentes: `search_in_files`, `find_symbol`, `read_file_range`, `run_tests`, `revisar_cambios`, `deshacer_cambios`, `git_diff` · `FaseBucle = "crear"|"modificar"|"reparar"` (`bucleAutonomo.ts:78`) · server.ts 11 494 l. / presupuesto 11 495 · **NO existe** ningún concepto de causa raíz, cadena causal ni radio afectado (la palabra `radio` solo vive en `tema.ts` como borde).

**Lo que hay y no basta:** el Quirófano actual es la MÁQUINA (snapshots, reversión, umbrales de amputación) pero el cirujano es la improvisación del modelo: no hay protocolo obligatorio, no hay evidencia de que el diagnóstico preceda al bisturí. Este plan pone el protocolo.

---

## 1. El protocolo: 7 estaciones (ninguna se salta, ninguna se firma sin evidencia)

```
Q1 SÍNTOMA → Q2 LOCALIZACIÓN → Q3 TRAZA (radio afectado) → Q4 CAUSA RAÍZ
     → Q5 DISEÑO DEL PARCHE MÍNIMO → Q6 VACUNA (test rojo primero) → Q7 CIERRE CON EVIDENCIA
```

- **Q1 Síntoma:** reproducir ANTES de opinar. Capturar error exacto (`detalleDeSalida` v1.6.26 ya elige la línea causa), comando que lo dispara, entorno (RAM/puertos del pack sistema). Salida: `Hallazgo.sintoma` con cita textual.
- **Q2 Localización:** `search_in_files` + `find_symbol` + `read_file_range` (existen). Salida: archivo:símbolo con **rango leído, no supuesto**.
- **Q3 Trazo:** grafo de importaciones estático (base: `extraerImportsRelativos` + `extraerPaquetesConOrigen`) en DOS direcciones: de dónde depende el sitio (corriente arriba) y **quién lo consume — radio afectado** (corriente abajo). Salida: `RadioAfectado { importa: [], consumidoPor: [], testsCercanos: [] }`.
- **Q4 Causa raíz:** cadena causal explícita `síntoma ← … ← causa` (máx 5 eslabones, cada uno con evidencia o marcado `hipótesis`). Discriminador duro: **la causa es el último eslabón que, arreglado, hace innecesario tocar los anteriores**. Si hay 2+ candidatas → `probar_causa` (test dirigido) antes de cortar.
- **Q5 Parche mínimo:** el menor diff que mata la causa (no el que calla el síntoma). Reglas duras del módulo: toca archivos ⊆ radio ∪ causa; si el diff supera `MIN_LINEAS_PARA_CIRUGIA` o roza `RUTAS_DE_RIESGO`, exige justificación explícita; si puede tocar >35 % del archivo → bandera de **amputación** (replantear, no coser). Snapshot `quirofano iniciar` OBLIGATORIO antes del primer `edit_file`.
- **Q6 Vacuna:** test de regresión PRIMERO, en rojo, con nombre de la causa; luego el parche lo pasa a verde. Sin test posible (código no testeable), el informe lo declara y propone el seam — nunca lo esconde.
- **Q7 Cierre:** `run_tests` del radio afectado completo (no solo el test nuevo) + `revisar_cambios` + checkpoint verde (arnés anti-errores V3) + `informeQuirurgico` (plantilla: 7 estaciones con su evidencia).

## 2. Núcleo puro: `src/engine/analisisQuirurgico.ts` (fuera del trinquete)

```ts
export type Estacion = "sintoma"|"localizacion"|"traza"|"causa"|"diseno"|"vacuna"|"cierre";
export interface Hallazgo   { estacion: Estacion; evidencia: string; fuente?: string; hipotesis?: boolean }
export interface CadenaCausal { sintomas: string[]; eslabones: string[]; causa: string; candidatas?: string[] }
export interface RadioAfectado { importa: string[]; consumidoPor: string[]; testsCercanos: string[] }
export interface ParcheMinimo  { diff: string; archivos: string[]; lineas: number; justificacion?: string }

export function registrarHallazgo(bitacora: Hallazgo[], h: Hallazgo): Hallazgo[]
export function estacionHabilitada(bitacora, estacion): { ok: boolean; falta?: string }   // Qn no abre sin Qn-1 firmada
export function cadenaValida(c: CadenaCausal): { ok: boolean; defectos: string[] }        // eslabones ≤5, causa con evidencia
export function parcheEsMinimo(p: ParcheMinimo, causa: string, radio: RadioAfectado):
  { ok: boolean; avisos: string[] }                                                        // ⊆ radio, umbrales de quirofano.ts
export function informeQuirurgico(bitacora, cadena, parche, tests): string                 // plantilla Q7, honesta con lo no-verificado
```

Reutiliza umbrales de `quirofano.ts` (misma metáfora, misma casa: `UMBRAL_AMPUTACION` ya existe — acá significa «demasiado tejido para coser»).

## 3. Tres herramientas nuevas — pack `cirugia` en `toolRegistry.ts`

| Herramienta | Qué hace (determinista) | Base reutilizada |
|---|---|---|
| `trazar_dependencias` | grafo estático de un archivo/símbolo, bidireccional, con profundidad ≤3 | `extraerImportsRelativos` + índice de archivos |
| `radio_afectado` | quién rompe si esto cambia + tests que lo cubren | grafo inverso + patrones `*.test.*` |
| `probar_causa` | ejecuta UN test/pedido acotado para discriminar hipótesis (con timeout y salida resumida) | `run_tests` + `detalleDeSalida` |

Las tres `cheap: true` (un flash-lite también merece diagnosticar antes de cortar) y sin sandbox cuando el grafo está en el workspace.

## 4. Integración con el bucle (don esto se vuelve conducta, no documentación)

- **Fase nueva `analizar`:** `FaseBucle = "analizar"|"crear"|"modificar"|"reparar"`. `faseDelTurno` la asigna cuando el turno abre con reporte de fallo/bug (señal: cita de error o petición de diagnóstico) — ANTES de cualquier mutación.
- **Escalón 0 de la escalera de reparación:** hoy el escalón 1 es «cambiar de camino»; pasa a ser **protocolo completo Q1→Q5** (diagnosticar antes de re-intentar). La escalera existente no se elimina: se le pone delantal.
- **Guardia estructural (la clave para modelos chicos):** el server NO confía en la disciplina del modelo — `write_file`/`edit_file` sobre un archivo con bitácora quirúrgica incompleta en turno de diagnóstico devuelve al modelo la estación que falta (`estacionHabilitada`). El protocolo lo sostiene el arnés, no la inteligencia.
- **Presupuesto anti-parálisis:** máx 12 llamadas de exploración por análisis; al exceder, `decidirBucle` fuerza «elige la mejor hipótesis y decídela como tal en el informe» (el Velador del plan anti-errores lo cronometra).
- **Conexión con los otros dos planes:** Q6/Q7 son el gate V2/V4 del arnés anti-errores; cada `probar_causa` alimenta `observar()` del plan de probabilidades (p de que la hipótesis sea la causa = tasa histórica de ese `claseError`).

## 5. Cableado y trinquete (server.ts ≤ 11 495, hoy 11 494)

Tope **+8 líneas**: 3 casos de herramienta (3), hook `estacionHabilitada` en el dispatcher de `write_file/edit_file` (2), fase `analizar` en la señal del bucle (2), registro del pack (1). **Compensación nominada:** extraer el bloque de `parseQuickAction` que ya quedó partido en v1.16.5 (el resto de `extractFilename`/`extractText` → `server/quickParser.ts`, −14 líneas). El contrato se regenera solo con `--verificar` INTACTO.

## 6. UI
- Panel «Bisturí» (tab junto a Planificador): las 7 estaciones con semáforo y evidencia de cada una; clic en un eslabón abre el archivo en el rango citado.
- El informe Q7 se renderiza con formato: síntoma → cadena → parche (diff) → tests (rojo→verde) → veredicto honesto.

## 7. Fases y gates

| Fase | Contenido | Aceptación (gate casa: verificar 0 · contrato INTACTO · build · manifiesto) |
|---|---|---|
| D1 | `analisisQuirurgico.ts` + suite `cirugia.test.ts` (~35 casos: estaciones, cadena, parche mínimo con fixtures de radio) | protocolo verificable 100 % puro |
| D2 | pack `cirugia` (3 herramientas) + extracción compensatoria | `trazar_dependencias` sobre este mismo server.ts da grafo correcto |
| D3 | fase `analizar` + escalón 0 + guardia estructural | bug sembrado en fixture: el agente NO puede editar sin Q1-Q4 firmadas (prueba de integración) |
| D4 | Q6 vacuna obligatoria + informe Q7 + Panel Bisturí | test rojo→verde exigido; informe con evidencia o palabra «sin verificar» |
| D5 | integración probabilidades (p de hipótesis) + Velador (anti-parálisis) | ranking de candidatas por tasa histórica |

## 8. Riesgos y mitigaciones
1. **Parálisis por análisis** → presupuesto de 12 exploraciones + forzar hipótesis razonada (documentada como hipótesis).
2. **Grafo estático ciego a imports dinámicos** (`require(variable)`, rutas construidas) → el radio se muestra con `confianza` explícita y `probar_causa` como red; límite declarado.
3. **Modelo que finge el protocolo** (escribe hallazgos vacíos) → `estacionHabilitada` exige evidencia con fuente citada (archivo:range que el propio server puede releer y comprobar que existe).
4. **Parches «mínimos» que matan la mosca a cañonazos** → `parcheEsMinimo` + umbrales de amputación de `quirofano.ts`; >35 % del archivo = replantear.

## 9. Límites honestos
- No es análisis semántico/AST completo: el grafo es de imports estáticos (TS/JS/Python por regex probada de `importChecker`); para cross-language se queda en el radio declarado.
- No reemplaza al ingeniero: impone la DISCIPLINA del ingeniero (orden + evidencia), que es justo lo que un flash-lite no trae de fábrica.
- Depende de los planes hermanos solo para sus extras (probabilidades, Velador); D1-D4 funcionan sin ellos.


---

<a id="plan-capacidad-probabilidades-v1-md"></a>
## (2/5) PLAN_CAPACIDAD_PROBABILIDADES_v1.md

> **Fuente:** `./PLAN_CAPACIDAD_PROBABILIDADES_v1.md`  —  **version:** 1  —  **bytes:** 8752
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


---

<a id="plan-expansion-retroalimentacion-bucle-v1-md"></a>
## (3/5) PLAN_EXPANSION_RETROALIMENTACION_BUCLE_v1.md

> **Fuente:** `./PLAN_EXPANSION_RETROALIMENTACION_BUCLE_v1.md`  —  **version:** 1  —  **bytes:** 9553
# PLAN — EXPANSIÓN DE LA HABILIDAD DE RETROALIMENTACIÓN DEL BUCLE EN LA AUTOTAREA CONTINUA
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)
**Autor:** asistente, sobre el árbol real de esta entrega (líneas verificadas hoy)

---

## 0. Punto de partida (lo que el bucle YA sabe hacer hoy)

| Pieza | Archivo | Qué aporta |
|---|---|---|
| Juez puro del bucle | `src/engine/bucleAutonomo.ts` | `decidirBucle(SeñalBucle)` → continuar/cerrar; fases **crear→modificar→reparar**; escalera de reparación de 3 escalones; `techoDePasos` con presupuesto de reparación |
| Cable del bucle | `server.ts` · `runOllamaAgentLoop` (~3062) | `fallosPorHerramienta`, `historialBucle`, `learnFromToolFailure`, anti-repetición (repeat≥3) |
| Continuidad entre turnos | `server/continuidadPlan.ts` | plan sin terminar viaja al turno siguiente (30 min) |
| Herramientas de verificación | registro `core`/`pc`/`sistema` | `run_tests`, `revisar_cambios`, `deshacer_cambios`, `ollama_estado`, `recursos_maquina` |
| Vigía de arranque | `RightSidebar.tsx` | latido cada 20 s (el "se queda" ya se ve) |

**Laguna que ataca este plan:** el bucle recibe retroalimentación solo del RESULTADO INMEDIATO de cada herramienta. No aprende entre turnos, no verifica con evidencia sus propias promesas, no recibe corrección explícita del usuario y su presupuesto de pasos no conoce el historial. Eso es lo que el usuario percibe como «empieza otra vez», «contesta sin explicación» y «se tranca».

**Disciplina de presupuesto (trinquete):** el contrato fija server.ts en **11 495 líneas** (presupuesto actual). Todo lo nuevo vive en `src/engine/` y `server/` (módulos, fuera del ratchet); el cableado en server.ts tiene un tope de **+12 líneas por fase**, compensado con extracciones candidatas ya identificadas: bloque `learnFromToolFailure` (→ módulo), bloque anti-repetición `repeatCount` (→ función pura en bucleAutonomo), `StreamLike`+`emit` de quick-action.

---

## F1 · LIBRO DE LECCIONES (memoria de fallos entre turnos) — la base de todo
**Objetivo:** que la herramienta que falló 3 veces ayer no vuelva a intentarse hoy "a ciegas".

- **Nuevo módulo puro** `src/engine/ledgerRetroalimentacion.ts`:
  ```
  type Leccion = { clave: string; herramienta: string; claseError: string;
                   veces: number; ultimo: number; arregloQueFunciono?: string }
  registrarFallo(ledger, herramienta, error): ledger        // claseError = firma normalizada
  registrarExitoTrasCambio(ledger, herramienta, nota)       // cierra el ciclo: qué desvío funcionó
  leccionesPara(ledger, herramienta): string | null          // nota inyectable al turno
  ```
- **Persistencia:** `server/ledgerDisco.ts` — JSON en `CEREBRONICO_DATOS/ledger_bucle.json` (mismo patrón de `continuidadPlan` pero a disco; cap 200 lecciones, LRU por `ultimo`).
- **Cableado (≤4 líneas server.ts):** en `runOllamaAgentLoop`, junto a `learnFromToolFailure` → `registrarFallo`; cuando una herramienta tiene éxito tras ≥2 fallos de la misma → `registrarExitoTrasCambio`; y en la nota de `notaContinuidad()` → adjuntar `leccionesPara(...)` de las herramientas del plan.
- **Criterio de aceptación:** tras un ciclo fallido real, el turno nuevo lleva en su system-note «NO reintentes `run_command: npm x` así: falló 3× por EADDRINUSE; funcionó `Detener` primero». Prueba: suite nueva `retroalimentacion.test.ts` con disco simulado.

## F2 · VERIFICACIÓN DE PROMESAS (evidencia antes de decir «hecho»)
**Objetivo:** cerrar la laguna «sin explicación / dice listo y no lo está».

- **Nuevo módulo puro** `src/engine/verificadorBucle.ts`:
  ```
  type Promesa = { accion: "escribir"|"editar"|"comando"|"arranque-sandbox"|"imagen"; ruta?: string; objetivo?: string }
  extraerPromesas(turnoModelo, plan): Promesa[]                  // de los tool_calls del turno
  veredicto(p: Promesa, evidencia: Evidencia): "cumplida"|"parcial"|"incumplida"|"sin-evidencia"
  ```
- **Evidencias deterministas ya disponibles sin código nuevo:** `read_file` post-escritura, salida de `run_tests`, probe de puerto 3500 (existe en telemetría), existencia de archivo para `cerebronico:imagen` (la orden ya sabe qué archivo debe producir).
- **Ciclo:** al cerrar el turno (decisión `cerrar` de `decidirBucle`), si hay promesa `incumplida|sin-evidencia` → NO cierra con «listo»: una ronda extra (máx 2, contadas en el presupuesto de reparación) con directiva «verifica o corrige»; si persiste → `informeHonesto` lista cada promesa con su veredicto y la evidencia que falta.
- **Cableado (≤6 líneas):** hook en la rama `accion:"cerrar"` → `rondaDeVerificacion(decision, promesas)` (pura, en bucleAutonomo: extiende `Decision` con `verificaciones?`).
- **Aceptación:** el caso de la langosta (HTML con `<img>` a archivo inexistente) produce `incumplida` y el informe final lo dice con nombre y ruta. Suite: 12 casos mínimo.

## F3 · PRESUPUESTO ADAPTATIVO (el techo que aprende)
**Objetivo:** `techoDePasos` hoy es fórmula fija + +2 por fallo. Que conozca su propio historial.

- Extensión pura en `bucleAutonomo.ts`: `techoDePasos(tareas, base, tope, fallos, leccionVelocidad?)` donde `leccionVelocidad` = pasos medios reales que costaron tareas de este tamaño (llega del F1 ledger: `{tamanyoPlan: promedioPasos}`). Regla: `base = clamp(6, 20, promedio + 4)`; nunca supera `PASOS_TOPE`.
- Origen del dato: al cerrar turno con plan completo, registrar `pasosUsados/tareas` en el ledger (1 línea de cableado).
- **Aceptación:** plan de 3 tareas que históricamente cuesta 14 pasos no muere en `techo=8` (hoy PASOS_BASE=8+3·3=17 ok, pero un plan de 12 tareas con modelo lento sí se cortaba). Prueba con datos sintéticos de ledger.

## F4 · CANAL DE CORRECCIÓN DEL USUARIO (feedback explícito, el más humano)
**Objetivo:** que «no, eso no» y «✓ así sí» sean datos, no chat perdido.

- **UI (solo `src/`, sin ratchet):** dos chips diminutos bajo cada mensaje asistente terminado: `✓ sirvió` / `✗ no, corregir`. Estado en `App.tsx`, POST `nuevo router server/routers/feedbackTurno.ts` → `POST /api/feedback/turno {turnoId, veredicto, nota?}`.
- **Destino:** `✗` escribe Lección en F1 (`herramienta:"turno"`, `claseError:"corregido-por-usuario"`) y marca el `continuidadPlan` del turno con `rechazado:true` → la nota del siguiente turno empieza con «EL USUARIO CORREGIR el intento anterior: <nota>. No repitas ese enfoque; continúa el plan por otro camino.» `✓` sube contador de acierto a las herramientas del turno (F3 lo usa como velocidad buena).
- **Aceptación:** corregir un turno cambia el comportamiento del siguiente sin reiniciar la tarea (complementa B1.2).

## F5 · VIGÍA DEL BUCLE (retroalimentación desde el tiempo, anti-«se tranca»)
**Objetivo:** el bucle sabe cuándo está esperando a algo LENTO y lo dice/negocia, en vez de parecer colgado.

- `SeñalBucle` gana `cronos?: { msHerramientaActual, umbralEsperadoMs }` (puro). Umbral esperado viene del F1 (medias de duración por herramienta/proyecto).
- `decidirBucle`: si `msHerramientaActual > 2×umbral` y no hay respuesta → decisión nueva `{accion:"informar-espera"}` → el server emite un task-event «sigo esperando `npm install` (X min; la media aquí es Y) — puedo cancelar (Detener) o seguir». NO mata el proceso: informa. El usuario decide.
- Reutiliza el latido del VIGILA-ARRANQUE (ya existe en cliente) y el `run_tests`/`sandbox/status` del server.
- **Aceptación:** ningún turno del bucle pasa >45 s sin que el chat diga QUÉ espera y CON QUÉ historial.

## F6 · INFORME HONESTO v2 (consolidación)
`informeHonesto` pasa de lista de tareas a parte de cierre con: promesas→veredictos (F2), lecciones usadas (F1), pasos reales vs presupuesto (F3), correcciones del usuario pendientes (F4). Todo calculado en `bucleAutonomo.ts` (puro); el server solo renderiza.

---

## Orden de ejecución y esfuerzo (créditos ≈ pasos de agente)

| Fase | Riesgo | Esfuerzo | Depende de |
|---|---|---|---|
| F1 ledger | bajo (añaditivo) | 1 sesión | — |
| F2 verificación | MEDIO (toca el cierre del turno) | 1–2 sesiones | F1 (guardar evidencia) |
| F4 canal usuario | bajo | 1 sesión | F1 |
| F5 vigía | bajo | 1 sesión | F1 (umbrales) |
| F3 presupuesto | bajo | media sesión | F1, F2 |
| F6 informe v2 | bajo | media sesión | F2, F4 |

**Gate de cada fase (no negociable, estilo casa):** `node scripts/validar.mjs` 0 fallos · `superficie --verificar` CONTRATO INTACTO (server.ts ≤ presupuesto, con extracción compensatoria ANTES de regenerar contrato) · `npm run build` · manifiesto regenerado · suite `retroalimentacion.test.ts` en catálogo. Rollback: `quirofano-cli` (existe el flujo revertir).

**Riesgos y mitigaciones:**
1. *Ronda extra de F2 puede alargar turnos* → tope duro 2 rondas, contadas en el presupuesto de reparación (no sumadas al tope).
2. *Ledger envenenado por un fallo único* → una Lección solo se inyecta con `veces ≥ 2`; decae a los 30 días.
3. *El trinquete* → cada fase declara su extracción compensatoria ANTES de tocar server.ts (candidatas listadas arriba).
4. *F4 abre puerta a spam* → un veredicto por turno, sin contador global.

## Qué NO es este plan (límites honestos)
No toca la calidad del modelo nube que finge imágenes (F2 lo DETECTA y lo INFORMA; curarlo es asunto del proveedor). No persiste entre proyectos (el ledger es por raíz de datos). No añade paralelismo de herramientas (otra campaña).


---

<a id="plan-integracion-simultanea-habilidades-v1-md"></a>
## (4/5) PLAN_INTEGRACION_SIMULTANEA_HABILIDADES_v1.md

> **Fuente:** `./PLAN_INTEGRACION_SIMULTANEA_HABILIDADES_v1.md`  —  **version:** 1  —  **bytes:** 8795
# PLAN — CAPACIDAD DE INTEGRACIÓN SIMULTÁNEA DE HABILIDADES DEL MOTOR
**Objetivo:** que las 70 habilidades del motor trabajen SOBRE EL MISMO HECHO, en el mismo instante, sin cables sueltos: un solo tablero compartido, un despachador determinista y un panel donde se vea la simultaneidad.
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)

**Anclas verificadas hoy sobre `work/app`:** `src/engine/` contiene **70 módulos** · `server.ts` tiene **56 líneas de import** desde `./src/engine/*` (coreo, bucleAutonomo, ejecutoresConsejo, hardwareGovernor, modelTiers, importChecker, quirofano, memoriaResiliente, metricasInferencia…) · **no existe** ningún bus/orquestador/blackboard (grep `orquestread|eventbus|blackboard` = 0; los únicos «director» son comentarios) · `coreo.ts` YA tiene taxonomía de eventos: `EventoCoreo { accion, detalle, n }` (línea 41) y `notificar(accion, detalle)` (línea 48) · `ejecutoresConsejo.ts` (líneas 68/80) ya distingue «ejecutor natural: el director neural» (el modelo) de lo determinista — la metáfora nerviosa es de la casa, este plan la completa.

---

## 1. El problema, en una frase verificable

Hoy el mismo hecho se procesa por separado y sin coordinarse: una salida de comando la leen `detalleDeSalida` (server), `clasificarAviso` (coreo) y `learnFromToolFailure` (bucle) — **tres lectores, tres interpretaciones, cero consenso**. Cada habilidad nueva (los planes F1-F6, arnés V, probabilidades B, bisturí D) añadiría más cables al monolito: 56 imports ya no caben en 11 495 líneas. La «integración simultánea» no es una feature extra: es la única forma de que los cuatro planes convivan.

## 2. Arquitectura: médula espinal, no cerebro

**Regla de diseño:** el modelo sigue siendo el *director neural* (término de la casa). Este sistema es la *médula*: **nunca piensa, solo conecta**. Puro, determinista, sin fetch ni fs — todo efecto queda en los ejecutores que ya existen.

### 2.1 `src/engine/tableroTurno.ts` (puro) — el hecho compartido
```ts
export interface EstadoDelTurno {
  turno: number;
  evento: EventoCoreo;                       // la espina dorsal YA EXISTE: los verbos del coreo
  hechos: {                                  // cada dominio, UN solo campo canónico
    error?: { crudo: string; lineaCausa: string; clase: string };   // ← detalleDeSalida + clasificarAviso se fusionan acá
    recursos?: { ramLibreMb: number; residenteMb: number; tier: Tier };
    hipotesis?: { cadena: CadenaCausal; candidatas: [string, number][] };  // ← plan bisturí
    plan?: TareaPlan[]; fase: FaseBucle; escalon: number;                  // ← plan bucle
    lecciones?: Leccion[];                                                 // ← plan F1
  };
  propuestas: Propuesta[];   // lo que cada habilidad QUIERE hacer
  decision?: AccionDirector; // lo que el director resolvió
}
```

### 2.2 `src/engine/directorHabilidades.ts` (puro) — la simultaneidad
```ts
export interface Habilidad {
  id: string;                                  // "bisturí", "arnés", "ledger", "governor"…
  escucha: EventoCoreo["accion"][];            // en qué eventos despierta
  aporta: (keyof EstadoDelTurno["hechos"])[];  // qué campos escribe
  propone: (t: EstadoDelTurno) => Propuesta[];  // función PURA: misma entrada, misma salida
  prioridad: "seguridad" | "usuario" | "protocolo" | "optimizacion";
  presupuesto: number;                          // máx propuestas por turno (anti-ruido)
}
export function registrarHabilidad(h: Habilidad): void
export function despachar(tablero: EstadoDelTurno, evento: EventoCoreo): AccionDirector
```
`despachar` ejecuta **en el mismo tick** a todas las habilidades que escuchan el evento (pureza = no hay carreras ni orden que temer: es simultaneidad real sin asincronía), recoge propuestas y resuelve conflictos con **regla fija de la casa**: `seguridad > usuario > protocolo > optimización`; empate dentro de nivel → mayor `pExito` (plan probabilidades B). Todo queda registrado en `tablero.propuestas` con `adoptada|rechazada(razón)` — la trazabilidad ES la UI.

### 2.3 La espina de eventos = coreo promovido
Los verbos del coreo (`actividad, pensar, escribir, ejecutar, probar, exito, bloqueado…`) pasan a ser el vocabulario oficial de eventos; `notificar()` (existe, línea 48) se convierte en el único punto de publicación. Eventos nuevos que piden los otros planes: `hipotesis`, `checkpoint`, `leccion`, `correccion-usuario` — todos entran por el mismo caño.

## 3. Migración de lo que ya existe (primera ola — sin conducta nueva)

| Habilidad actual | Rol en el bus |
|---|---|
| `coreo` | **emisor** de eventos (ya notifica) |
| fusión `detalleDeSalida`+`clasificarAviso`+`learnFromToolFailure` | un solo lector del error → `hechos.error` canónico (elimina los 3 interpretando distinto) |
| `bucleAutonomo` | consumidor/decisor registrado (fase/escalón leen y escriben el tablero) |
| `hardwareGovernor` + `modelTiers` | habilidad `recursos` (aporta `hechos.recursos`, propone degradación de modelo) |
| `quirofano` | habilidad `seguridad` (prioridad máxima: su veto gana a todo) |
| `aduanaArbol` | veto de seguridad sobre rutas (ya existe su criterio; entra al bus como propuesta `seguridad`) |
| planes F1/V/B/D | al implementarse, nacen COMO habilidades registradas — no como cables sueltos |

**Efecto en el trinquete:** cada migración REPLAZA imports y hooks del monolito por una línea de `despachar(...)` — server.ts debe **bajar** de 11 494 (meta: ≤ 11 470 al cerrar N3). Prohibido registrar sin extraer.

## 4. Contrato anti-degradación (suite `bus.test.ts`, estilo casa)
1. Toda habilidad registrada: `escucha ≥ 1`, `aporta ≥ 1`, `propone` pura (prohibido `fetch|fs|Date.now` sin inyectar clock — la casa ya inyecta relojes en tests).
2. Ninguna habilidad puede escribir fuera de sus campos `aporta` (chequeo de objeto devuelto).
3. `despachar` es determinista: mismo tablero + mismo evento → mismo `AccionDirector` (golden test).
4. Habilidad huérfana (registrada, nunca despierta con los eventos del catálogo) = rojo.
5. Profundidad de casacada = 1: una decisión del director puede emitir UN evento hijo; el bus se niega a sí mismo en cascada (anti-bucle infinito de habilidades parlándose entre sí).

## 5. UI: panel «Médula»
Vista viva del turno: columna de eventos → abanico de habilidades despiertas → propuestas adoptadas/rechazadas con la razón y la prioridad que ganó. Es la respuesta directa a «simultánea»: el usuario VE a 6 habilidades opinar del mismo error y por qué ganó una. (Bisturí, chips de probabilidad y lecciones del F1 se cuelgan de este panel en vez de tener cada uno su rincón.)

## 6. Fases y gates (gate casa: verificar 0 · contrato INTACTO · build · manifiesto)

| Fase | Contenido | Aceptación |
|---|---|---|
| N1 | `tableroTurno.ts` + `directorHabilidades.ts` + suite `bus.test.ts` con 2 habilidades juguete | despachar determinista; contrato de pureza verde |
| N2 | Fusión del lector de errores (única fuente de `hechos.error`) + coreo como emisor oficial | 3 consumidores viejos leen del tablero; `clasificarAviso` sin regressión (suite coreo 48/0 intacta) |
| N3 | Migración governor/quirofano/aduana/bucle como habilidades | server.ts ≤ 11 470 (el bus PAGA líneas, no las gasta) |
| N4 | Panel Médula + trazabilidad de rechazos | cada propuesta rechazada muestra prioridad ganadora |
| N5 | Los planes F/V/B/D se registran al implementarse (cada uno declara su fase del bus) | sin nuevos imports en server.ts por habilidad nueva |

## 7. Riesgos y mitigaciones
1. **Objeto dios** → el director no conoce a las habilidades: solo su contrato; registrar es añadir un módulo, nunca editar el bus.
2. **Latencia** → todo es puro y en memoria (µs); los efectos siguen en los ejecutores de siempre; `presupuesto` por habilidad limita ruido.
3. **Habilidades parlándose en bucle** → cascada profundidad 1 + golden test de determinismo.
4. **Romper lo vivo al migrar** → N2/N3 requieren suite específica por migración y el gate de la casa en cada fase; rollback por quirofano.
5. **Falsa simultaneidad** (que sea otro registro pasivo) → el criterio de aceptación N3 es duro: el orden de resultados cambia SOLO por prioridad/propuesta, y el panel muestra el porqué.

## 8. Límites honestos
- No es un sistema de plugins de terceros (eso lo ve `extensions.ts` por otro lado); es el bus interno del motor.
- «Simultáneo» = mismo tick, determinista, sin hilos: no hay paralelismo real (no hace falta: son funciones puras de microsegundos).
- El plan no toca la calidad del modelo; da estructura para que la estructura — no la memoria del modelo — sostenga la conducta.


---

<a id="plan-paquete-anti-errores-validacion-continua-v1-md"></a>
## (5/5) PLAN_PAQUETE_ANTI_ERRORES_VALIDACION_CONTINUA_v1.md

> **Fuente:** `./PLAN_PAQUETE_ANTI_ERRORES_VALIDACION_CONTINUA_v1.md`  —  **version:** 1  —  **bytes:** 9756
# PLAN — PAQUETE ANTI-ERRORES EN TAREA: BUCLE DE VALIDACIÓN CONTINUA
**Lema: «aunque se demore un poco, mejor estar seguro».**
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)
Anclas verificadas hoy sobre `work/app`: server.ts **11 494 líneas** (presupuesto del contrato **11 495**, rutas **138**) · `scripts/quirofano-cli.mjs` con `iniciar`(snapshot)/`estado`/`revertir` · herramientas `run_tests`, `revisar_cambios`, `deshacer_cambios` en `src/engine/toolRegistry.ts` · preflight de arranque ya existente (`server.ts:1138, 7222, 8016`) · suites python en `tests/*.py` (`autonomia_test.py`, `comprehensive_e2e_test.py`, `mcp_puente_test.py`).

---

## 1. Qué es este paquete y con qué se come al plan F1–F6

Este documento define el **arnés de seguridad** de la autotarea: después de CADA paso del bucle, una validación determinista decide si se avanza, se repara o se retrocede. El plan `PLAN_EXPANSION_RETROALIMENTACION_BUCLE_v1.md` (F1–F6, aún no implementado) aporta el **aprendizaje** (memoria de fallos, umbrales, veredictos de promesas). Este paquete funciona sin F1–F6, pero con F1/F2 se vuelve mucho más barato (valida menos cosas porque recuerda las ya validadas). Dependencias: §V3 y §V5 usan F1 (ledger) y F2 (verificador) — marcadas como [requiere F#].

**Regla de oro:** un paso NO cuenta como hecho por decisión del modelo, sino por evidencia verificable. La latencia extra aceptada es el precio; el estado rojo NUNCA se propaga.

## 2. Arquitectura: el bucle de validación continua (5 anillos)

```
[PRETAREA] → [MICRO-PASO → VALIDO → avanza/repara] → [CHECKPOINT cada N pasos]
     ↓ no pasa                                    ↓ invariante roja
   NO ARRANCA                                   REVERTIR al checkpoint verde
     ↓ pasa                                     ↓ verde
[TRABAJO] → [GATE FINAL: verificar+build+contrato+manifiesto] → [LISTO con informe de evidencia]
```

### V1 · PRETAREA (pre-flight de la autotarea) — extiende el preflight existente
- **Entorno:** Ollama vivo y con RAM libre suficiente para el modelo del turno (ya medible con `ollama_estado`/`recursos_maquina` del pack sistema, v1.16.4) · puertos 3000/5000/3500 sanos · proyecto dentro de `CEREBRONICO_DATOS`.
- **Plan validado:** función pura nueva `validarPlan(plan)` en `src/engine/bucleAutonomo.ts`: toda tarea tiene verbo de acción + criterio de término observable (ruta, test, comando); sin ciclos; ≤ 20 tareas. Un `set_plan` inválido NO se ejecuta: devuelve al modelo la lista de defectos (una ronda de corrección del plan, barata).
- **Línea base:** `quirofano-cli iniciar "autotarea <turno>"` ANTES del primer paso de escritura (snapshots a `.revisiones/` ya es el mecanismo de la casa).
- Coste: ~3–5 s. Si algo falla: el bucle informa y no gasta ni un token en trabajar sobre terreno roto.

### V2 · MICRO-BUCLE POR PASO (el corazón: validar antes de avanzar)
Después de cada `tool_call`, validación determinista según el tipo (todo con funciones puras nuevas en `src/engine/validaPaso.ts`):

| Paso | Validación inmediata | Si falla |
|---|---|---|
| `write_file` / `edit_file` / `pc_write_file` | read-back byte a byte + parse por extensión: `tsc --noEmit` filtrado al archivo tocado, `python -m py_compile`, `node --check`, JSON parse | escalarón 1 de la escalera (cambiar de camino) |
| `run_command` / `pc_exec` | exit code + `detalleDeSalida()` (ya existe, v1.6.26) clasificado: éxito / fallo de código / fallo de entorno | entorno → avisar y parar; código → escalón 2 (diagnóstico) |
| `run_tests` | parsear salida: N pasaron / M fallaron con nombres | el plan no avanza hasta tests verdes o escalón 3 |
| arranque sandbox | probe de puerto 3500 + `hint`/`logTail` (ya devuelve el server v2.1) | no reintentar a ciegas: informar causa |
| `cerebronico:imagen` / entregables | existencia del archivo prometido + tamaño > 0 [requiere F2] | promesa `incumplida` en el informe |

**Regla de propagación:** un paso sin validar = tarea sigue `pending`. El modelo no puede marcar `update_task: hecha` si la evidencia no está en el historial del turno (chequeo puro `evidenciaSuficiente(historialBucle, tarea)`).

### V3 · CHECKPOINTS DE INVARIANTES (cada N pasos y tras cada tarea `hecha`)
- **Barato (cada 3–4 pasos o 1 tarea):** `tsc --noEmit` + `node scripts/superficie.mjs --verificar` (contrato 138 rutas + trinquete 11 495) — ambos ya existen y tardan segundos.
- **Medio (cada ~8 pasos):** `node scripts/validar.mjs` completo (75 suites / ~4 012 comprobaciones).
- **Al romper una invariante:** `quirofano-cli revertir` al último snapshot verde ANTES de seguir (el árbol vuelve a estado seguro; el trabajo del tramo rojo se rehace, no se propaga). Se registra la lección [requiere F1].
- Los checkpoints guardan su propio id de snapshot en el estado del turno (`server/continuidadPlan.ts` ya persiste estado entre turnos: añadir campo `checkpointVerde`).

### V4 · GATE FINAL (nada se dice «listo» sin pasar la puerta)
Secuencia obligatoria antes del `cerrar` de `decidirBucle`:
1. `validar.mjs` completo 0 fallos · 2. `build` OK · 3. `superficie --verificar` INTACTO · 4. `manifiesto --verificar` (o regenerar si tocó fuentes) · 5. veredicto de promesas [requiere F2].
Si alguno falla → el turno NO cierra con «listo»: cierra con `informeHonesto` ampliado (F6) listando qué puerta quedó roja y el checkpoint al que se puede revertir.

### V5 · EL VELADOR (meta-vigilante del propio bucle) [requiere F5]
Máquina de estados mínima por turno: `verde | rojo | esperando | gastado`.
- **esperando:** herramienta > 2× su umbral histórico → informa QUÉ espera (nunca mata solo).
- **gastado:** presupuesto de pasos agotado → cierre honesto con plan pendiente (ya existe) + el siguiente turno arranca OBLIGADO a continuar (nota de `continuidadPlan`, v1.16.5).
- **rojo persistente:** 2 checkpoints rojos seguidos → revertir + pedir una sola pregunta al usuario (único punto donde el arnés permite preguntar; el resto sigue solo).

## 3. Dónde vive cada pieza (disciplina de trinquete: server.ts ≤ 11 495)

| Pieza | Ubicación | Líneas en server.ts | Compensación |
|---|---|---|---|
| `validarPlan`, `evidenciaSuficiente` | `src/engine/bucleAutonomo.ts` (puro) | 0 | — |
| `validaPaso.ts` (read-back/parsers) | `src/engine/validaPaso.ts` nuevo | ~6 (hook post-tool) | extraer bloque `learnFromToolFailure` → módulo |
| checkpoints + revertir | `server/checkpointVerde.ts` nuevo (usa quirófano por API interna) | ~4 | extraer `StreamLike`+`emit` de quick-action |
| gate final | rama `cerrar` de `decidirBucle` + `server/gateFinal.ts` | ~3 | extracción de anti-repetición `repeatCount` a pura |
| Velador | `src/engine/velador.ts` (puro) + señal en `SeñalBucle` | ~2 | — |
| UI chips de evidencia (✓/✗ por paso en el tablero) | solo `src/components/*` | 0 | — |
**Tope duro: +15 líneas server.ts por fase, cada una con su extracción nombrada arriba; el contrato se regenera SOLO después de que `--verificar` dé INTACTO con las extracciones ya hechas.**

## 4. Coste (el «aunque se demore» cuantificado)
- Micro-validación por paso: +1 lectura o +1 proceso corto → ~0.5–3 s/paso; un turno de 12 pasos ≈ +20–40 s.
- Checkpoint barato cada 3–4 pasos: tsc ~3–6 s + superficie <1 s.
- `validar.mjs` por checkpoint medio: ~2–4 min — solo cada ~8 pasos y al cerrar (hoy se corre 1 vez por entrega; aquí 2–4 veces por turno grande).
- **Ahorro que lo paga:** el tiempo que hoy se pierde en «empezó otra vez», rehacer un turno rojo descubierto al final, o un sandbox colgado, es mayor que el arnés.

## 5. Fases de ejecución y gates

| Fase | Contenido | Criterio de aceptación (gate de la casa: verificar 0 fallos + contrato INTACTO + build + manifiesto) |
|---|---|---|
| A1 | `validarPlan` + `evidenciaSuficiente` (puras) + suite `antierrores.test.ts` | plan defectuoso rechazado con defectos legibles; 100 % pruebas puras |
| A2 | `validaPaso` + hook post-tool + read-back | escribir TS roto no marca la tarea hecha; se ve el escalón de reparación |
| A3 | `checkpointVerde` + revertir automático en invariante roja | romper tsc a mitad de turno → árbol vuelve verde solo; lección registrada |
| A4 | gate final en `cerrar` | es imposible cerrar con verificar rojo: el informe dice qué puerta falta |
| A5 | Velador + umbrales [F5] | ningún paso espera >2× umbral sin mensaje de QUÉ se espera |
| A6 (opcional) | paralelizar read-back con el siguiente paso (promesa en vuelo) | recupera ~30 % de latencia sin perder seguridad |

## 6. Riesgos y mitigaciones
1. **Falsos positivos del parser de tests** → la validación NUNCA borra trabajo, solo bloquea el avance; el humano puede forzar paso con «continúa de todos modos» (override registrado como lección).
2. **Turnos eternos por validación infinita** → topes: 2 re-validaciones por paso, 2 checkpoints rojos → revertir+preguntar (V5).
3. **Quirófano llenando `.revisiones/`** → cap de 10 snapshots por turno con limpieza LRU (la casa ya limita por tamaño en aduana).
4. **server.ts** → cada hook delega a módulo; prohibido crecer sin extracción nombrada en el mismo commit.

## 7. Límites honestos
- No elimina el error del modelo; lo CONTIENE: ningún error cruza un checkpoint.
- Las suites python (`autonomia_test.py`, `comprehensive_e2e_test.py`, `mcp_puente_test.py`) NO están hoy en `validar.mjs`; integrarlas al gate final es tarea aparte (requiere entorno python en el gate).
- F1/F2/F5 son prerequisitos declarados de V3-cierre-lecciones, V2-imagen y V5; este plan los referencia como el otro documento, no como código existente.

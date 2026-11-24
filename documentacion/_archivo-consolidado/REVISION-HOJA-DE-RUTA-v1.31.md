# Revisión de la Hoja de Ruta Evolutiva — CerebroNico v1.30.0 → v2.0

**Fecha:** 2026-09-30 · **Base verificada:** código real extraído de `Cerebronico-v1.30.0.zip`
(165 archivos TS en `src/` ≈ 57.103 líneas · 96 suites en `tests/` ≈ 17.316 líneas · `server.ts` = **11.645 líneas** · 90 módulos en `src/engine/` · 32 herramientas en `toolRegistry.ts` · 21 skills en `skills/`).

---

## 1. Veredicto general

La hoja de ruta es **técnicamente sound y sus premisas son todas ciertas**: cada referencia al
CHANGELOG (v1.22.1 listar antes de crear, v1.29 preservación ≥35 %, v1.30 firma normalizada con
bucle en ≥2 repeticiones, tablero paralelo io/cpu, BM25, preflight del creador, conciencia de
artista ponderada) fue verificada contra el código y el CHANGELOG. Ninguna premisa es falsa.

**El riesgo real no está en lo que la hoja de ruta propone, sino en lo que no ve: una parte
significativa de los 28 módulos del árbol propuesto ya existe con otro nombre y en español.** Si
FASE 1 arranca creando `contextEngine.ts`, `evidenceEngine.ts`, `taskScheduler.ts`,
`rollbackEngine.ts` y `modelRouter` desde cero, el proyecto viola su propia regla fundacional
(documentada en v1.28/v1.30: *«sin verdades duplicadas»*, *«Fase 2 de la casa es PARTIR, NO
AÑADIR»* — cabecera de `server/gatesObra.ts`).

La revisión propuesta es por tanto: **consolidar y conectar antes que crear.** El problema que la
hoja de ruta acierta a diagnosticar en §30 no es falta de capacidades sino falta de coordinador —
y eso cambia qué fases son trabajo nuevo y cuáles son trabajo de cableo.

---

## 2. Fact-check de premisas (claim → evidencia)

| Premisa de la hoja de ruta | Estado | Evidencia en el código |
|---|---|---|
| «lista archivos antes de trabajar y verifica el disco» | ✅ existe | `src/engine/ordenDeObra.ts` (v1.22.1: `list_files` + manifiesto + inyección de estado real) |
| «escalera de reparación de tres niveles» | ✅ existe | `src/engine/bucleAutonomo.ts:210-250` (`directivaDeReparacion(escalon)`, presupuesto de reparación 2 pasos/fallo, tope 6) |
| «v1.30 detecta repetición por firma normalizada, bucle ≥2» | ✅ existe | `src/engine/reconocimientoError.ts:249` `analizarBucle(historial, minRepeticiones = 2)` |
| «esa detección solo registra, no cambia estrategia» | ✅ **crítico y cierto** | Único consumidor del módulo es `superPrompt.ts:25` (directriz estática al prompt). Ningún archivo de motor llama a `analizarBucle` para alterar la ejecución. Es literalmente tinta en el system prompt. |
| «set_plan/update_task es la base correcta» | ✅ existe | `toolRegistry.ts:170,286` + `taskPlanner.ts` (801 l., con `Peso = "io"|"cpu"`, `ordenTopologico`, `validarPlan`) |
| «tablero paralelo conoce carriles io/cpu, estados y saturación» | ✅ existe | `tableroParalelo.ts` + `planRunner.ts` + semáforo `/api/brain/runner` |
| «auditoría de preservación detecta exports, ≥35 %, truncamientos, vaciado» | ✅ existe | `quirofano.ts:57` `UMBRAL_AMPUTACION = 0.35`, `superficiePublica()`, `marcadoresDeTruncado()` |
| «memoria con BM25, aprendizaje, skills, conflictos» | ✅ existe | `scripts/hindsight_daemon.py` (BM25), `kbMotor.ts`, `kbCodigo.ts`, `memoriaResiliente.ts`, `.revisiones/lecciones.md`, `resumenAprendizaje()` en `reconocimientoError.ts` |
| «conciencia de artista: diez ejes ponderados» | ✅ existe (y son más) | `concienciaArtista.ts`: 5 ejes base + ejes 6-13+ (`EjeX10` con `peso` y `severidad`) — responsive, feedback, copy, robustez, rendimiento, contraste, jerarquía, i18n |
| «creador audita, corrige, PWA, JSON-LD, contraste, preflight» | ✅ existe | `scripts/creador_daemon.py` (`preflight_rendimiento` en guion t7), skills `cerebronico-creador`, `cerebronico-web-qa`, `cerebronico-accesibilidad` |
| «skill Git y commits atómicos» | ✅ existe | `skills/cerebronico-git/` + herramientas `git_status/git_diff/git_commit` |
| «snapshots y rollback» | ✅ existe | `.revisiones/<timestamp>/` + `quirofano-cli.mjs` (`iniciar/verificar/corregir/revertir`) + tools `revisar_cambios`/`deshacer_cambios` |
| «verificaciones sin navegador real» | ✅ **hueco true confirmed** | Cero dependencias de playwright/puppeteer/selenium/webdriver en `package.json` ni en el código |

---

## 3. Mapa de huecos reales (los 28 módulos del árbol §27)

### A) Lo que la hoja de ruta pide YA EXISTE (trabajo = conectar/no duplicar)

| Módulo propuesto | Ya vive en | Qué falta realmente |
|---|---|---|
| `modelRouter.ts` (§18) | `modelTiers.ts` (520 l., «escalera MR», fuente única) + `puenteAdaptativo.ts` + `src/utils/contextCache.ts` + `providerRouting.ts` | Reafirmar el principio «herramienta determinista primero» en el enrutador; no crear un segundo router |
| `rollbackEngine.ts` (§23) | `quirofano.ts` + `.revisiones/` + `quirofano-cli` + `deshacer_cambios` + `restorePoints.ts` | Envolver en semántica BEGIN/COMMIT transaccional, no reescribir |
| `taskScheduler.ts` / `parallelExecutor.ts` (§22) | `taskPlanner.ts` + `planRunner.ts` + `tableroParalelo.ts` + `hardwareGovernor.ts` | Exclusión por archivo compartido (depende del grafo, ver B) |
| `evidenceEngine.ts` (§8, parte) | `certeza.ts` (3 niveles deducidos de evidencia) + `completitud.ts` (plan↔manifiesto↔disco) + manifiesto de `ordenDeObra.ts` + `auditoriaBucle.ts` (actas) | Unificar CLAIM→EVIDENCE→VERDICT en una sola tabla/estado; hoy son 4 primitivas dispersas que no comparten identificador de afirmación |
| `repairEngine.ts` / `failureClassifier.ts` (§5,§17) | `reconocimientoError.ts` (clase + firma + diagnóstico raíz) + escalera de `bucleAutonomo.ts` | **El cable faltante:** `analizarBucle` → escalación automática de `escalon` en el motor (hoy solo llega como texto al prompt) |
| `loopBreaker.ts` (§17) | `analizarBucle` (≥2), `auditoriaBucle.ts` (registro) | Convertir detección en acción: 2→cambiar táctica, 3→rollback, 4→arquitectura, 5→bloqueo (reglas configurables por perfil, como pide §17) |
| Memoria de errores / negativa (§16) | `.revisiones/lecciones.md`, `resumenAprendizaje()`, `selfHealing.ts`, `selfImprovement.ts` | Tipificar en almacén consultable por firma de error |
| `webQuality.ts` (§14) | `concienciaArtista.ts` (ejes ponderados) + `completitud.ts` | Fusionar en `productQuality` con las 3 dimensiones — sobre los ejes existentes, no de nuevo |

### B) Lo que NO existe y es trabajo nuevo real (confirmado por búsqueda)

| Capacidad | Evidencia de ausencia | Impacto |
|---|---|---|
| **Grafo de proyecto con aristas tipadas** (importa/llama/sirve/comparte-contrato) y análisis de impacto «¿qué rompo si cambio X?» | `symbolIndex.ts` (firmas), `importChecker.ts` (imports resueltos), `dependenciasProyecto.ts` (packages vs instalado) son **materias primas**; no hay grafo unificado ni consulta de impacto transitivo. `grep "aceptaci\|impacto"` en motor: nada | Alto — es el presupuestado §2 y desbloquea L1/L2 de contexto y exclusión de paralelismo |
| **Context Engine con niveles L0–L5 y presupuesto** | `ordenDeObra.ts` inyecta la lista cruda del sandbox; no hay selección jerárquica por tarea | Alto — §1 correcto como primer salto |
| **Criterios de aceptación por tarea (contrato antes de código)** | `taskPlanner.ts` tiene `validarPlan` pero **cero campos de aceptación**; grep «aceptación» sin resultados | Alto — barato de añadir, multiplica el valor del resto |
| **Reasoning Controller como decisór de próximo paso** | `reflejo/consejo.ts` (40 entidades + votación) decide *qué piensa el sistema*, no *qué acción de motor sigue*; `bucleAutonomo` decide continuar/parar con reglas fijas. No existe selector de (herramienta, argumentos, contexto, verificación) | Núcleo de v2 — pero **debe absorber al Consejo existente**, no nacer como tercer cerebro |
| **Navegador real** (render, clic, consola, viewport, screenshots) | Cero dependencias; límites reconocidos en docs (render JS, Lighthouse, contraste efectivo) | El mayor hueco individual — confirma §12 |
| **Regresión a nivel proyecto** (rutas/APIs/exports que antes pasaban) | Preservación es por archivo en la mesa de operación; no hay comparación de instantánea global antes/después | Medio-alto, se apoya en grafo + manifiesto |
| **Visual regression** (layout shift, overflow, elementos fuera de viewport) | Requiere navegador; sin él es imposible | Deriva de navegador |
| **Memoria arquitectónica tipo ADR** | Hay lecciones y aprendizaje, no hay registro de decisiones/consecuencias consultable | Medio |

---

## 4. Cinco correcciones materiales a la hoja de ruta

1. **Orden de fases — el Project Graph no va en FASE 6.** La propia hoja dice que el Context
   Engine necesita «archivos directamente afectados» (L1) y «dependencias e impacto» (L2), y que el
   scheduler debe impedir que dos tareas toquen `App.tsx` a la vez. Las tres cosas consumen el
   grafo. Un **núcleo mínimo de grafo** (nodos = archivos, aristas = importa/exporta, con
   transitividad de 1 salto) debe ir en FASE 1, reutilizando las salidas de `symbolIndex`,
   `importChecker` y `dependenciasProyecto` como materiales de construcción. FASE 6 queda para las
   aristas ricas (llama/sirve/contrato endpoint) y el Regression Guardian sobre grafo completo.

2. **Naming: el árbol §27 en inglés choca con la convención del proyecto.** Los 90 módulos de
   `src/engine/` son en español (`bucleAutonomo`, `quirofano`, `concienciaArtista`,
   `certeza`…). Proponer `contextEngine.ts`, `repairEngine.ts` y `loopBreaker.ts` junto a
   `reconocimientoError.ts` crearía dos dialectos conviviendo. Regla sugerida: directorios en inglés
   (`engine/context/`, `engine/recovery/`) ya propuestos, pero **módulos en español**
   (`motorContexto.ts`, `grafoProyecto.ts`, `partidorBucle.ts`, `motorEvidencia.ts`) — o decidir lo
   contrario y migrar en un commit separado. Lo inaceptable es la mezcla.

3. **§18 Model Router y §23 Transaction Layer no son fases futuras: son deudas de integración.**
   Ambos existen (modelTiers / quirófano+revisiones). Reescribirlos sería el peor resultado posible
   del roadmap. Su «implementación» debe reformularse como: *publicar una interfaz estable sobre lo
   existente* y prohibir en el linter/validar.mjs la creación de homónimos.

4. **El Reasoning Controller (§6) debe definirse contra el Consejo (§reflejo/consejo.ts), que la
   hoja de ruta no menciona.** Hoy hay tres instancias de «decidir»: el consejo de 40 entidades con
   votación, `bucleAutonomo` (juez determinista de continuidad) y `puenteAdaptativo`. El controller
   nuevo sin plan de fusión produce un cuarto cerebro. Recomendación explícita en el roadmap:
   *el Reasoning Controller es la fusión de bucleAutonomo + consumo del consejo como asesor, no un módulo
   paralelo*. El ejemplo de §6 (error → inspeccionar package.json → node_modules → lockfile) ya
   está resuelto a nivel diagnóstico por `diagnosticoRaiz()` en `reconocimientoError.ts`; lo que
   falta es que esa secuencia **ejecute** sin pasar por el modelo — que es exactamente la regla §19.

5. **La §19 («herramientas deterministas primero») es la única regla nueva que merece rango de
   principio central**, más que la §30. La §30 (autoridad dividida) ya está de hecho implementada en
   espíritu: `certeza.ts` deriva niveles de evidencia, `completitud.ts` contrasta plan↔disco, el
   acta de `auditoriaBucle.ts` registra. Enunciarla como novedad esconde la deuda real: hay
   capacidades coordinadas por convención documental, no por contrato de datos. La regla §19
   mecánica (tsc antes que modelo, fs antes que modelo) sí agrega algo que hoy no está escrito en
   ningún archivo de política.

---

## 5. ROADMAP corregido (con orden de dependencias reales)

| Fase | Contenido | Nuevo vs Cableo | Comentario |
|---|---|---|---|
| **v1.31 — CONTEXTO** | `motorContexto.ts` con niveles L0–L5 + presupuesto + cache; **núcleo mínimo de `grafoProyecto.ts`** (archivos/importa, 1 salto) consumiendo symbolIndex+importChecker+dependenciasProyecto; **cable crítico:** `analizarBucle` → escalación automática de peldaño en `bucleAutonomo` (la §5 «nunca más mismo código») | 70 % cableo, 30 % nuevo | La escalación automática es ~80 líneas y elimina el dolor documentado de v1.30. Prioridad máxima relación costo/valor |
| **v1.32 — PLAN** | Campos `criterios_aceptacion` + `presupuesto` + `evidencia` en `Tarea` de taskPlanner (con `validarPlan` exigiéndolos antes de permitir IMPLEMENT); presupuesto dinámico según progreso (mechón de §20/§21) | 90 % nuevo | Barato y habilita toda la verificación posterior |
| **v1.33 — CONTROL** | `controlRazonamiento.ts`: fusión bucleAutonomo + asesoría del Consejo + selector de estrategia (niveles 0–4 de §5); regla §19 escrita como política de motor | Fusión, no creación paralela | |
| **v1.34 — EVIDENCIA** | `motorEvidencia.ts`: unificar certeza+manifiesto+completitud+actas en CLAIM→EVIDENCE→VERDICT con ID por tarea; `puertaAceptacion` consume criterios de v1.32 | Consolidación | Aquí nace «no se dice terminado sin verificaciones de la §10» |
| **v1.35 — NAVEGADOR** | Playwright/Puppeteer (empacable con electron-builder — el proyecto ya embebe Python, puede embeber node binario): apertura de :3500, clics, formularios, viewport, consola, screenshots, DOM | 100 % nuevo, el salto más grande | **Se adelanta de FASE 7.** Todo lo visual (§13) depende de esto y hoy es imposible |
| **v1.36 — GRAFO RICO + REGRESIÓN** | Aristas llamada/sirve/contrato; `guardianRegresion.ts` de proyecto completo (rutas, APIs, exports, suites que pasaban) sobre base v1.31 | Extiende v1.31 | |
| **v1.37 — VISUAL** | Regression visual con umbral estructural (layout shift, overflow, off-viewport), `calidadProducto.ts` 3 dimensiones fusionando ejes existentes | Nuevo sobre v1.35 | |
| **v1.38 — EFICIENCIA** | Publicar API estable sobre `modelTiers` como router de tarea (pequeño/medio/grande/sin-modelo) + exclusión de paralelismo por grafo | Cableo sobre existente | |
| **v1.39 — MEMORIA** | Almacén tipificado: ADR, memoria negativa por firma, decisiones; exportación desde lecciones.md actual | Consolidación + nuevo | |
| **v2.0** | Consolidación del flujo §29 | — | |

El tablero «centro de operaciones» (§26) no necesita fase propia: `TableroParalelo.tsx` +
`PlanificationPanel.tsx` + `PanelQuirofano.tsx` ya son sus órganos; es una tarea de integración de
UI que puede acompañar a v1.32 y v1.34.

---

## 6. Aplicar §3 a la propia FASE 1 (criterios de aceptación antes de código)

Tarea: `motorContexto` v1.31. Aceptación propuesta:

- ✓ `modelarProyecto(raiz)` devuelve estructura+stack+scripts+tests+puertos leyendo solo disco (sin red, sin modelo)
- ✓ presupuesto: L0–L5 ensamblados no superan el límite de tokens configurado; L5 solo entra si L1–L4 no resuelven
- ✓ cache inválida automáticamente por mtime+hash de package.json y git HEAD
- ✓ `grafoProyecto.impactoDe("src/App.tsx")` responde en <200 ms para este repo (57k líneas) con transitividad 1
- ✓ con ≥2 repeticiones de firma idéntica, `bucleAutonomo` sube de peldaño de escalera **sin intervención del modelo** (test con secuencia simulada del flip-flop react-dom real de v1.30)
- ✓ ninguna verdad duplicada: `grep -c list_files` de ordenDeObra sigue siendo la única fuente de listado; `git commit` no se duplica
- ✓ suite nueva registrada en `scripts/validar.mjs` (la casa ya lo exige: ninguna suite huérfana)
- ✓ `tsc --noEmit` y las ~96 suites actuales siguen verdes
- ✓ server.ts **no crece**: todo el trabajo nuevo vive en `src/engine/` (regla §27 verificada como mecánica, no como deseo)

---

## 7. Conclusión

La hoja de ruta está bien: diagnostica con precisión que a CerebroNico le sobran manos y le falta
un coordinador, y sus quince afirmaciones sobre el estado actual verifican contra el código. Su
peligro es el optimismo de inventario: ~40 % de los módulos del árbol §27 existen con otro nombre
(Quirófano, modelTiers, taskPlanner/tablero, certeza/completitud/manifiesto), y el roadmap los
trata como inexistentes. Corregido el orden (grafo mínimo en v1.31, navegador en v1.35 como
adelanto), electa la convención de nombres, y reformuladas tres fases como cableo en vez de
creación, la ruta a v2.0 es realista. La pieza de mayor valor por línea de código es la que §5
pide: hacer que `analizarBucle` (ya existente, ya probado con 54 tests) **mande** sobre la escalera
de reparación, en vez de sólo susurrarle una directriz al prompt.

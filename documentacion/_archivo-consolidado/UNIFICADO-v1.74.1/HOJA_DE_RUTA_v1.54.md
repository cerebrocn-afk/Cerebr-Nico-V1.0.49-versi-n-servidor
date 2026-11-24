# HOJA DE RUTA — CerebróNico IDE · v1.53.4 → v1.54 «CABLEADO Y EJECUCIÓN REAL»

> Documento de continuidad entre sesiones. Escrito contra el código **v1.53.4** el 2026-10-08.
> **Regla de la casa:** creer SOLO lo verificado contra código o por ejecución. Lo demás va marcado «SIN VERIFICAR».
> **Trinquete:** `server.ts` NO crece. Todo lo nuevo entra como módulo PURO en `src/engine/*` o `src/utils/*`.
> **Entrega:** SIEMPRE el proyecto COMPLETO como ZIP (carpeta top `cereb_check`). NUNCA parches ni archivos sueltos.

---

## 0. De dónde partimos (estado verificado v1.53.4)

| Hecho | Estado |
|---|---|
| Versión semilla única | **1.53.4** en `package.json`, `src/constants.ts` (VERSION_SEMVER), `index.html`, `CHANGELOG.md` |
| Paso A (v1.53.3) | DENTRO del zip v1.53.4 (nunca llegó al chat por corte de red, pero está en el árbol) |
| Paso B | `tests/generalistaFlujo.test.ts` creado y registrado en `scripts/validar.mjs` |
| Paso C | 2 defectos curados en `orquestador.ts` (ant-disenio, cnt-qubits) |
| Harness de ruteo | `temp/harness_routing.mjs` → **34/34 verde en Node v16** (extrae tramos reales de `orquestador.ts` por marcadores, solo quita tipos) |
| `tsc --noEmit` completo | **SIN VERIFICAR** (no hay node_modules/tsx/red en el entorno dev) |
| `npm run validar` completo | **SIN VERIFICAR** (ídem) |

**Defecto conocido NO shippeado (reportado):** cobertura baja de LEYES_REFLEJO —
`científica = 1 ley`, `cuántica = 2 leyes`. Candidato a ampliar (ver §2.0).

---

## 1. Principios que gobiernan esta hoja de ruta

1. **Fixes de RAÍZ sobre parches puntuales.** Cada fallo del modelo se trata como síntoma sistémico.
2. **Verificar, no adivinar.** En el entorno dev (Node v16, sin red/node_modules/tsx) se valida **portando la lógica a `.mjs`** y ejecutando; lo que no se pueda correr queda «SIN VERIFICAR».
3. **Trinquete.** `server.ts` (11.842 líneas) no se toca salvo CABLEADO mínimo e inevitable; se prefiere exponer módulo puro + punto de invocación.
4. **Self-heal NO auto-parchea.** Registra en `evolutionDB`; no escribe el fix solo.
5. **No portar a Python ni adoptar E2B.** Stack TS/Electron intacto.
6. **Injertar sobre el código real.** Nada de motores autónomos nuevos.

---

## 2. Pasos planificados (orden recomendado por ROI/riesgo)

> Orden pensado: **primero lo barato que da visibilidad (diagnóstico), luego lo que habilita capacidad (ejecución), y por último lo que necesita red/deps**.

### PASO 1 — Matriz de CABLEADO F4–F10  *(diagnóstico · ROI alto · riesgo bajo)*  ✅ HECHO en v1.53.5
**Objetivo:** mapear, por cada módulo puro de las fases F4–F10, **QUIÉN lo invoca en vivo** desde `server.ts` (o si está HUÉRFANO, es decir, existe pero nadie lo llama).
**Por qué primero:** es diagnóstico puro, no cambia comportamiento, y revela el verdadero «qué falta» (módulos construidos pero no cableados).
**Entregable:**
- `documentacion/MATRIZ_CABLEADO_F4-F10.md`: tabla `módulo puro → ruta/handler que lo invoca → estado (CABLEADO / HUÉRFANO / PARCIAL)`.
- Script de verificación `scripts/verificar-cableado.mjs` (grep estructural sobre `server.ts` + `src/engine/*`), registrable en `validar.mjs`.
**Verificación:** ejecutable en Node v16 (solo lectura/grep). **VERIFICABLE AL 100% en el entorno dev.**
**Riesgo:** ninguno (no modifica lógica).

> **RESULTADO (VERIFICADO POR EJECUCIÓN, Node v16):** de 19 módulos F4–F10 →
> **5 CABLEADOS** (`evidenciaTurno`, `motorEvidencia`, `estadoRescate`, `modelTiers`,
> `memoriaResiliente`), **2 INDIRECTOS** (`grafoProyecto`, `grafoRico`), **12 HUÉRFANOS**
> (existen y están PROBADOS pero NUNCA se invocan en vivo): F7 completo, F8 completo,
> parte de F9 y F10, más `matrizVerificacion`/`motorRecuperacion`/`presupuestoReparacion`/
> `guardianRegresion`. Entregado: `scripts/lib-cableado.mjs`, `scripts/verificar-cableado.mjs`,
> `documentacion/MATRIZ_CABLEADO_F4-F10.md`, `scripts/cableado-baseline.json` y el guardián
> `tests/cableadoFases.test.mjs` (40/40 verde, registrado en `validar.mjs`).
> **El verdadero «qué falta» no es escribir módulos — es CABLEAR los que ya existen.**

### PASO 2 — Ampliar cobertura de LEYES_REFLEJO  *(fix de raíz · riesgo bajo)*  ✅ HECHO en v1.53.6
**Objetivo:** subir cobertura de dominios con pocas leyes: `científica` (1) y `cuántica` (2).
**Por qué:** poca cobertura = ruteo pobre → más errores del modelo. Es un fix de raíz sobre el orquestador.
**Entregable:** nuevas entradas en `LEYES_REFLEJO` dentro de `orquestador.ts` + casos en `temp/harness_routing.mjs`.
**Verificación:** el harness `.mjs` extrae el array real → **VERIFICABLE por ejecución en Node v16**.
**Riesgo:** bajo; podría solapar leyes existentes (mitigar con tests de no-regresión en el harness).

**RESULTADO (v1.53.6):** 3 leyes nuevas — `cie-muestra`→`tam_amostral`, `cie-ic`→`ic`,
`cnt-amplitudes`→`entrelazamiento` — cada una enruta a un PODER YA EXISTENTE con el
formato de datos EXACTO (verificado contra `poderes-espejos.ts`). Científica = 3,
cuántica = 3. Fix de raíz colateral: `cie-ic` sube a `confianza 0.93` para ganarle a
`mat-estad` (genérica) sin «empate dudoso». **Verificado extremo a extremo (enrutado +
PODER real) en Node v16: 56 OK, 0 FALLOS.** `cnt-qubits` intacta y no secuestrada.
type-check completo `tsc`/`validar.mjs` íntegro **SIN VERIFICAR** (sin node_modules).

### PASO 3 — Ejecución real end-to-end: install → build → test → preview  *(capacidad · riesgo medio)*  ✅ HECHO en v1.53.7
**Objetivo:** que el IDE pueda correr el ciclo real de un proyecto generado (no solo prometerlo).
**Por qué antes que la especulativa:** la ejecución simple y secuencial es prerequisito y más segura que la especulativa.
**Entregable:** módulo puro `src/engine/ejecucionReal.ts` (orquesta fases, captura stdout/stderr, códigos de salida) + punto de CABLEADO mínimo.
**Verificación:** lógica de orquestación portada a `.mjs` y probada con comandos simulados; el ciclo real completo (con red/deps) queda **SIN VERIFICAR en el entorno dev** y debe correrlo Mario en Windows.
**Riesgo:** medio (procesos externos, timeouts). Reutilizar el detector de silencio/watchdog ya endurecido en `streamContext.ts`.

**RESULTADO (v1.53.7):** `src/engine/ejecucionReal.ts` creado (módulo PURO + capa SO fina al final, patrón `terminalInteractivo.ts`).
- **Lógica pura verificada POR EJECUCIÓN** en Node v16 (`temp/harness_ejecucion.mjs`, extrae las funciones puras del `.ts` y stripea tipos de una lista CERRADA, lanzador SIMULADO sin spawn): **48 OK, 0 FALLOS**. Suite tsx paralela `tests/ejecucionReal.test.ts` REGISTRADA en `scripts/validar.mjs` (paridad disco↔validar que exige `resiliencia.test.ts`).
- **`derivarOrdenes`** lee el `package.json` real + gestor por lockfile (npm/pnpm/yarn/bun); omite lo que no existe; el `test` placeholder de `npm init` NO cuenta; preview = primer servidor (preview→start→dev).
- **`ejecutarCiclo`** encadena, CORTA en la primera fase bloqueante (resto OMITIDO, no fingido), respeta no bloqueantes y trata preview como SERVIDOR VIVO.
- **Capa SO SIN VERIFICAR en dev:** `lanzadorReal` (spawn, búfer de anillo, detector de silencio rearmable reusado de `streamContext.ts`), `detenerServidores`, `ejecutarCicloReal`. La corre Mario en Windows.
- **CABLE MÍNIMO NO insertado (trinquete):** documentado en la cabecera del módulo (`import { ejecutarCicloReal }` desde una sola herramienta/handler, sin crecer `server.ts`). Módulo HUÉRFANO a propósito hasta que se cablee.
- **`tsc` completo SIN VERIFICAR** (sin node_modules).

### PASO 4 — Ejecución ESPECULATIVA en `planRunner.ts`  *(capacidad · riesgo ALTO)*  ✅ HECHO en v1.53.8 (mecánica; cable DOCUMENTADO, no insertado)
**Objetivo:** adelantar pasos del plan mientras el modelo aún decide.
**Riesgos (explícitos):** consumo DOBLE de recursos/tokens; commits a medias si se aborta.
**Mitigación OBLIGATORIA:** envolver todo en `capaTransaccion` (rollback atómico); presupuesto/cancelación de la rama especulativa.
**Dependencia:** requiere el PASO 3 estable.
**Verificación:** lógica transaccional portable a `.mjs`; el comportamiento especulativo real queda **SIN VERIFICAR** sin ejecución end-to-end.
**Riesgo:** ALTO. Entrar solo tras PASO 3 verde.

**RESULTADO (v1.53.8):** `src/engine/ejecucionEspeculativa.ts` creado — módulo PURO que REUTILIZA `capaTransaccion.ts` como FUENTE ÚNICA (no reimplementa la transacción). Exporta la mecánica segura: `DEFECTOS`, `debeEspecular`, `seleccionarCandidatos` (presupuesto: tope de ramas + tope POR rama —no lanza el intento caro— + tope TOTAL), `reconciliar` (ATÓMICO: solo reutiliza rama que coincide + quedó LISTA + sana; en cualquier otro caso revierte TODO), `cancelarRamas`, `parteEspeculacion` y el orquestador `ejecutarEspeculativo` (lanzador y decisión INYECTADOS).
- **Verificado POR EJECUCIÓN** en Node v16: `temp/harness_especulativa.mjs` (extrae byte a byte las puras de `capaTransaccion.ts` + `ejecucionEspeculativa.ts`, stripea tipos de lista CERRADA, lanzador SIMULADO + decisión inyectada) → **37 OK, 0 FALLOS**. Suite tsx paralela `tests/ejecucionEspeculativa.test.ts` REGISTRADA en `scripts/validar.mjs` (paridad disco↔validar.mjs de `resiliencia.test.ts`).
- **Cable DOCUMENTADO, NO insertado:** NO toca `server.ts` (trinquete) ni se mete a ciegas en `planRunner.ts`. El cómo engancharlo (en el hueco en que `PlanRunner` espera la decisión: `ejecutarEspeculativo({candidatos,mundo,lanzador,decidir,presupuesto})`) vive en la cabecera del módulo. Módulo HUÉRFANO a propósito — primero la mecánica segura y probada, lo correcto para riesgo ALTO.
- **SIN VERIFICAR:** el COMPORTAMIENTO ESPECULATIVO REAL (concurrencia real contra modelo/herramientas en paralelo a su propia decisión) — lo corre Mario end-to-end en Windows. `tsc` completo SIN VERIFICAR (sin node_modules).

### PASO 5 — Validador AST para edición por parche multi-archivo  *(capacidad · bloqueado por deps)*  ✅ HECHO en v1.53.9 (interfaz + fallback PROVISIONAL + orquestador; AST real SIN VERIFICAR)
**Objetivo:** validar ediciones multi-archivo con AST real (no regex).
**Bloqueo:** necesita `ts-morph` o `@babel/*` → **requiere RED + node_modules**, que NO hay en el entorno dev.
**Por qué último:** mayor dependencia externa; sin red no se puede ni instalar ni verificar aquí.
**Entregable (v1.53.9):** módulo puro `src/engine/validadorAST.ts` con (1) la **INTERFAZ `AnalizadorAST`** (contrato inyectable que aísla la dep AST del resto del motor), (2) un **FALLBACK REGEX PROVISIONAL** marcado `confiable:false` — `balanceDelimitadores` (máquina de estados que ignora cadenas/comentarios/plantillas y analiza `${}`), `extraerExports` — y (3) el **ORQUESTADOR PURO `validarParcheMultiArchivo`** que clona el mundo, valida la sintaxis por archivo y cruza invariantes ENTRE archivos reutilizando `importChecker` como fuente única (`import-a-borrado`, `export-perdido` sin falso positivo, encogimiento ≥35%).
**Verificación:** fallback + orquestador **verificados POR EJECUCIÓN** en Node v16 (`temp/harness_validador.mjs`, **51/51**); suite tsx `tests/validadorAST.test.ts` REGISTRADA (paridad 124/124). El **AST real** (ts-morph/babel) sigue **SIN VERIFICAR en dev** (dependencia de red): lo valida Mario tras `npm install`; se prueba que el contrato es INYECTABLE con un analizador falso confiable.
**Riesgo:** medio; la dependencia queda aislada tras la interfaz → el trinquete (`server.ts`) intacto. Módulo HUÉRFANO a propósito con cable mínimo DOCUMENTADO en la cabecera.

### PASO 6 — Búsqueda web por defecto en modelos de nube  *(capacidad · política pura)*  ✅ HECHO en v1.54.0 (política + payload + directiva + citas; búsqueda real SIN VERIFICAR)
**Objetivo:** por DEFECTO, cuando el turno usa un modelo de NUBE, activar la búsqueda web para que el modelo CONFIRME en internet si lo que va a validar/escribir/ejecutar ESE turno es correcto; ejecutar SOLO sobre lo confirmado; y CITAR fuentes.
**Bloqueo honesto:** en el proyecto NO existía una herramienta de búsqueda web real cableada (ni serper/tavily/grounding). La llamada REAL a internet necesita red → **SIN VERIFICAR en dev**.
**Entregable (v1.54.0):** módulo puro `src/engine/busquedaWebNube.ts` que REUTILIZA `modelTiers` (`getModelProfile`/`esFamiliaNubeConHerramientas`) como FUENTE ÚNICA: `decidirBusquedaWeb` (prioridad: anulación del usuario > apagado global > exclusión por modelo > nube+default-ON; LOCAL nunca dispara), ensamblado de PAYLOAD por proveedor (Gemini `{googleSearch:{}}` vía `aplicarGroundingATools`; OpenRouter `:online` vía `modeloConSufijoOnline`; openai/compat de chat → solo-directiva → SIN VERIFICAR), `directivaBusquedaWeb` (confirma→ejecuta sobre lo seguro→cita) y la política de citas (`requiereCitas`/`formatearCitas`).
**Verificación:** **verificado POR EJECUCIÓN** en Node v16 (`temp/harness_busquedaweb.mjs`, **56/56**); suite tsx `tests/busquedaWebNube.test.ts` REGISTRADA (paridad 125/125). La BÚSQUEDA WEB REAL contra internet sigue **SIN VERIFICAR en dev** (sin red): la ejerce Mario al cablear.
**Riesgo:** bajo-medio; NO añade deps de pago ni de nube pesada (usa el grounding que el proveedor YA ofrece). Trinquete (`server.ts`) intacto; módulo HUÉRFANO a propósito con cable mínimo DOCUMENTADO en la cabecera. Detalle completo en `documentacion/HOJA_DE_RUTA_BUSQUEDA_WEB_v1.54.0.md`.

---

## 3. Tabla resumen de priorización

| # | Paso | Tipo | ROI | Riesgo | ¿Verificable en dev (Node v16, sin red)? |
|---|---|---|---|---|---|
| 1 | Matriz de CABLEADO F4–F10 | Diagnóstico | ALTO | Bajo | **SÍ (100%)** |
| 2 | Ampliar LEYES_REFLEJO | Fix de raíz | Medio-Alto | Bajo | **SÍ (harness .mjs)** |
| 3 | Ejecución real E2E | Capacidad | Alto | Medio | Parcial (lógica sí; ciclo real NO) |
| 4 | Ejecución especulativa | Capacidad | Medio | **ALTO** | Parcial (transacción sí; especulativa NO) |
| 5 | Validador AST | Capacidad | Medio | Medio | **Parcial (fallback+orquestador SÍ 51/51; AST real NO)** |
| 6 | Búsqueda web por defecto en nube | Capacidad | Alto | Bajo-Medio | **Parcial (política+payload+directiva+citas SÍ 56/56; búsqueda real NO)** |

---

## 4. Hitos de versión propuestos

- **v1.53.5** — PASO 1 (Matriz de CABLEADO). **v1.53.6** — PASO 2 (LEYES_REFLEJO ampliadas: científica 3 / cuántica 3). **v1.53.7** — PASO 3 (Ciclo real install→build→test→preview, lógica pura verificada 48/48; capa SO SIN VERIFICAR). **v1.53.8** — PASO 4 (Ejecución ESPECULATIVA: mecánica segura PURA verificada 37/37; capaTransaccion fuente única; cable DOCUMENTADO no insertado; comportamiento especulativo real SIN VERIFICAR). **v1.53.9** — PASO 5 (Validador AST por parche multi-archivo: interfaz inyectable + fallback regex PROVISIONAL + orquestador puro verificados 51/51; importChecker fuente única; AST real SIN VERIFICAR hasta tener deps). Todo verificable en dev salvo lo marcado.
- **v1.54.0** — PASO 3 cableado al vivo (cuando exista el cable mínimo). Primer salto de capacidad.
- **v1.54.x** — PASO 4 cableado al vivo (`planRunner.ts`): la MECÁNICA ya está (v1.53.8); falta insertar el cable y verificar la concurrencia real E2E.
- **v1.55.0** — PASO 5 cableado al vivo + **AST real** (ts-morph/babel) verificado: la interfaz, el fallback y el orquestador ya están (v1.53.9); falta instalar la dep, implementar el adaptador real tras `AnalizadorAST`, cablearlo antes de confirmar la `capaTransaccion` y verificar end-to-end en la máquina de Mario.

> Cada bump: sincronizar `package.json` + `src/constants.ts` (VERSION_SEMVER) + `index.html` + `CHANGELOG.md`. Registrar suites nuevas en `scripts/validar.mjs`. Documentar en `cerebro.md` / `CHANGELOG.md`. Respetar el trinquete.

---

## 5. Lo que esta hoja de ruta NO promete (honestidad)

- NO afirma `tsc`/`validar.mjs` completos verdes: SIN node_modules eso queda **SIN VERIFICAR**; solo corren suites portadas a `.mjs`.
- NO promete que los módulos F4–F10 estén cableados: justamente el PASO 1 existe para DESCUBRIRLO.
- NO promete ejecución real E2E ni especulativa verificada en el entorno dev: dependen de red/deps en la máquina de Mario.

---

*Próxima decisión de Mario:* confirmar si arrancamos por el **PASO 1 (Matriz de CABLEADO)** como recomendado, o reordenar.

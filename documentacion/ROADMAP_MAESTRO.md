# ROADMAP — Hojas de ruta y revisiones unificadas (HISTÓRICO)

> **HOJA DE RUTA VIGENTE (un archivo por documento, unificación v1.69.0):** la que
> gobierna hoy es [`HOJA_DE_RUTA_CerebroNico-IDE.md`](../HOJA_DE_RUTA_CerebroNico-IDE.md)
> en la raíz. Este maestro queda como archivo histórico: las hojas de ruta
> anteriores a v1.60 unificadas acá ya no se editan.

Archivo MAESTRO generado el 2026-10-05. Unifica 4 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [ROADMAP.md](#roadmap-md) — version s/v
2. [HOJA_DE_RUTA_v1.16.5.md](#hoja-de-ruta-v1-16-5-md) — version 1.16.5
3. [REVISION-HOJA-DE-RUTA-v1.31.md](#revision-hoja-de-ruta-v1-31-md) — version 1.31
4. [ROADMAP-V1.33-HASTA-V2.md](#roadmap-v1-33-hasta-v2-md) — version 1.33.2


---

<a id="roadmap-md"></a>
## (1/4) ROADMAP.md

> **Fuente:** `./ROADMAP.md`  —  **version:** s/v  —  **bytes:** 11069
# ROADMAP — CerebróNico · estado real y plan de continuación

> Documento de continuidad entre sesiones. **Regenerado contra el código el 24-sep-2026**, sobre **v1.13.0-SANDBOX-Y-VOZ**.
> Regla de la casa: **creer solo lo verificado contra código.**
> El plan completo vive en [PLAN_MAESTRO_V2](PLAN_MAESTRO_V2/PLAN_MAESTRO_CEREBRONICO_V2_PRO.md).

------------------------------------------------------------------------

## 1. Estado verificado hoy (no citado: ejecutado)

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 errores** |
| `npm run validar` | **3724 comprobaciones · 0 fallos · 69 suites · 0 sin correr** |
| `npm run superficie:verificar` | **127 rutas · CONTRATO INTACTO** · **6 extraídas, 121 en el monolito** (11.438 líneas) |
| `npx tsx tests/estado.test.ts` | **50 correctas · 0 fallidas** (estado: telemetría, CPU y SANDBOX) |
| `npx tsx tests/ttsErrores.test.ts` | **35 correctas · 0 fallidas** (la ventana de voz, domesticada) |
| `npx tsx tests/voz.test.ts` | **75 correctas · 0 fallidas** (certeza + voz) |
| `npx tsx tests/persistencia.test.ts` | **42 correctas · 0 fallidas** (workspace de 5 MB+, cuota, sin almacén) |
| `npm run manifiesto:verificar` | **498 ficheros declarados · 498 en disco · TODO COINCIDE** |
| `npm audit --audit-level=high` | **0 vulnerabilidades** |
| Humo real | `:3000` responde 200 y sirve `CerebróNico V1.7.0` · puente `:5000` publica `shell: false` |

Versión: **1.13.0** (semilla única en `src/constants.ts`, sincronizada con `package.json`, `index.html` y el bundle).

**v1.13.0 «SANDBOX Y VOZ»** — tres frentes: (1) **el estado del sandbox** sale a
`server/estado/sandbox.ts` (era el último bloque grande de estado compartido, 35
sitios); al tiparlo apareció un **fallo latente**: `spawnSandbox()` puede devolver una
`Response` y el monolito la guardaba como «el proceso». (2) **La ventana de voz**: el
429 de Gemini ya no pinta su JSON en la interfaz — `server/ttsErrores.ts` lo traduce a
una frase, el volcado va al registro, no se reintenta lo que no mejora y hay espera de
5 min. (3) **El sandbox al arrancar ya no sale en rojo**: «aún no arrancado» no es un
fallo; «arrancado y no contesta» sí, y se distingue. Suites nuevas:
`tests/ttsErrores.test.ts` (35) y `tests/estado.test.ts` ampliada a 50.

**v1.12.0 «EL ESTADO SALE DEL MONOLITO»** — el paso que decide la Fase 2. La caché de
telemetría y la muestra de CPU del proceso dejan de ser variables sueltas y viven en
`server/estado/telemetria.ts` y `server/estado/proceso.ts`, con API de funciones y
**el tiempo inyectado** (por eso su caducidad se prueba sin esperar). Con ellas salen
3 rutas más (`server/routers/telemetria.ts`). **`server.ts`: 11.518 → 11.413 líneas
(6 rutas de 127 fuera).** El módulo al sandbox no lo alcanza: **le pregunta** — eso
deja escrita la API de la siguiente extracción. Comprobado en marcha: la caché sirve
la 2ª consulta y el `refresh` la invalida.

**v1.11.0 «PRIMERA EXTRACCIÓN»** — el monolito empieza a adelgazar: **3 rutas**
(`/api/health/deep`, `/api/ollama/perf`, `/api/ollama/models`) viven ya en
`server/routers/diagnostico.ts`. **`server.ts`: 11.661 → 11.518 líneas.** Los
cuerpos se movieron verbatim y solo cambia de dónde salen tres valores (Ollama, RAM,
núcleos), que se pasan como dependencias para no tener dos fuentes de verdad. El
contrato ahora informa **MOVIDAS** (no pérdidas) y publica el progreso de la fase;
su presupuesto se ajustó a 11.518. Comprobado contra el servidor en marcha: las tres
rutas responden.

**v1.10.0 «CONTRATO DE RUTAS»** — primer paso de la Fase 2: **127 rutas congeladas**
en `contrato-rutas.json` (generado desde el código), el **orden de trabajo** por 39
dominios en `SUPERFICIE_RUTAS.md`, y `scripts/superficie.mjs` (generar · verificar ·
`--seco`). Tres candados: ruta perdida → rojo, guard perdido → rojo, y **presupuesto
de líneas de `server.ts` (11.661) que no puede crecer**. Suite propia:
`tests/superficieRutas.test.ts` (37 comprobaciones). **La extracción de módulos
todavía no ha empezado** — a propósito: medio servidor migrado es peor que nada.

**v1.9.0 «ESTABILIDAD»** — lo que se cierra: (1) **el workspace ya no se pierde al
pasar de 5 MB**: `saveJSON` devuelve resultado, lo que no cabe se **rescata** al
almacén grande (IndexedDB, `grandes`) y vuelve al arrancar
(`restaurarDeAlmacenGrande`); (2) **si no se puede guardar, se dice** — la interfaz
se suscribe con `alFallarGuardado` y lo escribe en el registro visible; (3) **la
deuda D9 queda cerrada**: `/api/brain/lesson` ya tiene llamador (el aprendizaje va
a local y al cerebro) y guard, porque escribe. Suite propia:
`tests/persistencia.test.ts` (42 comprobaciones **ejecutando** la capa real contra
un localStorage y un IndexedDB de prueba).

**v1.8.0 «VOZ»** — capa transversal que ya está en el árbol: **certeza en el
idioma** (`certeza.ts` + `vocabulario.ts`: las 14 palabras que afirman exigen
ejecución), **una frase por artefacto** (`explicacionArtefacto.ts`: qué es, para
qué sirve, y si está ejecutado) y **facultad de hablar sin que pregunten**
(`autoRespuesta.ts`: 4 reglas — no inventar, decir una vez, certeza en el texto,
presupuesto de atención). Enganchada en `/api/quirofano/estado` y visible en el
panel del Quirófano. Suite propia: `tests/voz.test.ts` (75 comprobaciones).

------------------------------------------------------------------------

## 2. Lo que se corrigió en este documento (y por qué importa)

La versión anterior de este ROADMAP pedía trabajo **ya hecho**. Eso no es un detalle: este documento lo lee cada sesión nueva, así que un pendiente falso **genera trabajo duplicado**. Corregido contra código:

| Decía | Código real |
|---|---|
| D7 «SIN VERIFICAR» | `votacionConsejo.ts` + `consejoVotacion.test.ts` (40/40). **Hecho.** |
| D8 «cero referencias a `eval_count`» | `metricasInferencia.ts:77-102`, `server.ts:11079-11095`. **Hecho.** |
| D-P1 «código muerto» | `syntaxGuard` v3 con `<code>esbuild.transform</code>` en 5 puertas. **Hecho.** |
| «convertir el catálogo a aspiracional» | `catalogoHonesto.ts` cableado al cliente (`contextCache.ts:39`). **Hecho.** |
| «el `dist/` del ZIP es el viejo» | Era de la v1.6.31. El de 1.7.0 está al día (verificado por cadenas dentro del bundle). |

------------------------------------------------------------------------

## 3. Programa por fases

| Fase | Nombre | Estado | Esfuerzo estimado |
|---|---|---|---|
| **F0** | Verdad congelada (puerta que no puede mentir) | **COMPLETA** (v1.7.0) | hecho |
| **F1** | Seguridad cerrada (puente, guard, auditoría) | **COMPLETA** (v1.7.0) | hecho |
| **F2** | Partir el monolito `server.ts` | **EN CURSO** — contrato (v1.10.0) · 3 rutas (v1.11.0) · estado telemetría/CPU + 3 rutas (v1.12.0) · **estado del sandbox (v1.13.0)**: 6 de 127 rutas fuera, y **los dos bloques de estado que ataban las rutas ya tienen dueño**. Lo que queda es mecánico | ~2 semanas |
| **F3** | Motor del chat: `/api/ai/stream` a pipeline | Pendiente (depende de F2) | 1–2 semanas |
| **F4** | Cerebro ejecutor: 23 acciones con ejecutor o declaración | **EN CURSO** — registro hecho y verificado (`ejecutoresConsejo.ts`): **2 con ejecutor real, 21 declaradas con motivo**. Falta enchufar los 21 ejecutores | 1–1,5 semanas |
| **F5** | Producto y datos: `App.tsx` por contextos, workspace a IndexedDB | Pendiente (depende de F2) | 1,5–2 semanas |
| **F6** | Git nativo + enrutador de modelo por complejidad | Pendiente | 2 semanas |
| **F7** | Visión/OCR y decisión del mapa aspiracional | Pendiente | 1 mes+ |

**Regla de F2:** el primer entregable no es código, es el **contrato de las 126 rutas congelado** (`tests/superficieRutas.test.ts`). Y durante F2 **no se mejora nada: se mueve**, con la misma cifra de aserciones al salir que al entrar.

------------------------------------------------------------------------

## 4. Deuda abierta, con su evidencia

| # | Severidad | Deuda | Dónde |
|---|---|---|---|
| 1 | **ALTO** | **Monolito**: 11.661 líneas, 127 rutas, 19 singletons, y un handler de **1.711 líneas** (`POST /api/ai/stream`). Desde v1.10.0 tiene **contrato y trinquete**: no puede crecer, y sus rutas no pueden perderse | `ide/backend/server.ts` + `contrato-rutas.json` |
| 2 | **CERRADA (v1.9.0)** | ~~Pérdida silenciosa del workspace al pasar de 5 MB~~ → ahora se **rescata** al almacén grande y, si no se puede guardar, **se dice** en el registro visible. Queda como límite declarado: por encima de 5 MB el guardado es asíncrono (vuelve al arrancar, no al instante) | `src/utils/storage.ts` + `indexedDBStorage.ts` |
| 3 | **MEDIO** | El **Consejo vota pero no ejecuta**: medido en v1.7.1, **21 de 23 acciones sin ejecutor real** (2 sí: `calculo` y `convertir`). Antes se decía «16 sin especialista» — es otra cuenta: esa era de VOTOS, ésta de TRABAJO | `src/engine/ejecutoresConsejo.ts` |
| 4 | **CERRADA (v1.9.0)** | ~~Endpoint huérfano `/api/brain/lesson`~~ → el aprendizaje ahora **sí** llega al cerebro (con guard, porque escribe) | `selfImprovement.ts` → `server.ts` |
| 5 | **MEDIO** | **Cero git** y copias canónicas de `mejoras/` divergentes del árbol (`espejos.ts` 668 vs 852) | sin `.git` |
| 6 | **MEDIO** | `localRAG` recupera por **token/clave, no por embeddings**; existen **dos** módulos RAG | `src/engine/localRAG.ts` y `src/utils/localRAG.ts` |
| 7 | **BAJO** | «Hasta 50 adjuntos» es **texto de interfaz**: no hay tope de 50 en el código | `ChatCenter.tsx:711` |
| 8 | **BAJO** | Claves en `.env` **en claro** (riesgo local, no de distribución: `.env` no se empaqueta) | `app/utils/env_manager.py:8,15,19` |

**Cerrado en v1.7.0** (ya no son deuda): puente con `shell=True` sin lista blanca · rutas sin contención · guard fail-open · 11 endpoints mutantes sin guard · suite sin descubrimiento dinámico · manifiesto de 22 entradas · ROADMAP desactualizado.

------------------------------------------------------------------------

## 5. Reglas que no se tocan

1. **Puertos:** 3000 IDE · 3500 sandbox · 5000 puente · 11434 Ollama externo.
2. **Fuente única de versión:** un solo literal en `src/constants.ts`; lo demás se deriva.
3. **Nada silencioso:** lo que se decide, se dice; lo que se rechaza, dice por qué.
4. **Ritual de entrega:** `npm ci` → `tsc` → `validar` → `build` → **comprobar la feature DENTRO del bundle** → `start` (humo) → restaurar artefactos de runtime → `manifiesto` → excluir `node_modules`.
5. **Formato de suite:** cerrar con «N correctas · M fallidas»; y ahora, además, **el código de salida manda**.

------------------------------------------------------------------------

## 6. Siguiente paso acordado

**F2 (partir el monolito), empezando por el contrato de superficie.**
Alternativas independientes con resultado visible antes: **F6 (git nativo)** y **F4 (que el consejo ejecute)**.
Detalle de cada una en [PLAN_MAESTRO_V2](PLAN_MAESTRO_V2/PLAN_MAESTRO_CEREBRONICO_V2_PRO.md) §4.


---

<a id="hoja-de-ruta-v1-16-5-md"></a>
## (2/4) HOJA_DE_RUTA_v1.16.5.md

> **Fuente:** `./HOJA_DE_RUTA_v1.16.5.md`  —  **version:** 1.16.5  —  **bytes:** 6715
# HOJA DE RUTA v1.16.5 → v1.16.5 — PLAN DETALLADO HASTA EL FINAL (VALIDADO CONTRA EL CÓDIGO REAL)
**Fecha:** 2026-09-27 · **Estado del árbol:** v1.16.5 en curso · **Créditos limitados: este documento es la entrega**

---

## A. YA CORREGIDO EN ESTE CICLO (v1.16.5, código aplicado)

| # | Queja del usuario | Causa raíz encontrada | Arreglo aplicado | Verificación |
|---|---|---|---|---|
| A1 | «Instrucciones extra del sistema»: **no deja ingresar/pegar** | `Row/Toggle/Slider/Num/Txt/Sel` estaban DEFINIDOS DENTRO del componente → cada tecla React los veía como componente nuevo → desmontaje/remontaje del panel → el textarea perdía el foco al primer carácter y el pegado caía sobre un nodo desprendido («no es editable») | Hoist de los 6 controles al ámbito del módulo (`src/components/ProConfigPanel.tsx`) | `tsc --noEmit` = 0 errores |
| A2 | «Le cuesta el arranque… se queda» con copia anidada de la IDE | El piloto detectaba la recursión pero el cliente **auto-continuaba con aviso** (`reintentando con confirmación…`): arrancaba DOS IDEs compartiendo RAM y el preview nunca mostraba la app del usuario | RECURSIÓN v2: el primer clic SOLO informa y NO arranca nada; el segundo clic confirma explícitamente (`recursionPendienteRef` en `RightSidebar.tsx`) | pendiente: verificar completo |
| A3 | «Se queda» sin señales | Silencio total mientras el servidor instalaba dependencias (minutos) antes de spawnear | VIGILA-ARRANQUE: latido cada 20 s («siguen trabajando (Xs)… no cierres la página») durante `/api/sandbox/start` | pendiente |
| A4 | «El sandbox debería tener un botón de reinicio» | Solo existía Detener + Arrancar (y «Reiniciar preview» que era un alias engañoso) | Botón **Reiniciar** (cielo, junto a Detener): stop → start completo en un clic (`handleSandboxReiniciar`) | pendiente |

## B. PENDIENTE — plan exacto para el siguiente ciclo (cada paso con archivo y línea de anclaje verificados hoy)

### B1 · «Le paso código o logs y CONTESTA BLOQUEADO» (máxima prioridad)
Diagnóstico hecho sobre el código: dos sospechosos, en este orden de ataque.

1. **Clasificador del coreo demasiado goloso** — `src/engine/coreo.ts`, `CLASIFICADOR[0]`:
   `/no se pudo|no se guard|NO se |no pasó|no tiene|se pierde|queda en la URL|rechaz|bloquea|BLOQUEO|ilegal/i → "bloqueado"`.
   Cuando el usuario pega un log, el agente NARRA líneas que CITAN ese log («no se pudo conectar», «connection refused»→«rechaz»…), y el chip ⛔ BLOQUEADO sacude aunque no haya fallo real.
   **Arreglo propuesto:** exigir que el aviso sea del EJECUTOR, no una cita:
   - descartar líneas que lleguen prefijadas como eco (`/^\s{2,}/`, `logTail`, o entre comillas « »);
   - quitar los genéricos `NO se `, `no tiene`, `rechaz`, `bloquea`, `ilegal` del regex 0 y dejarlos solo en anclajes largos (`El motor bloqueó`, `No se pudo`, `BLOQUEO:`);
   - mantener los literales que la suite `coreo` (22 comprobaciones) fija hoy: pasar la suite tras cada recorte.
2. **Reinicio de tarea al responder «lee»** — en `runOllamaAgentLoop` (server.ts ~10.900), cada mensaje nuevo construye el turno desde cero: si el turno anterior quedó «bloqueado» (B1.1), el bucle vuelve a planificar la tarea completa. Revisar `memoriaDeTurno`/`contextCache` (el cache existe: `src/utils/contextCache.ts`) y comprobar que el historial llega al request `/api/ai/stream` (`messages` se construye en `src/App.tsx` ~línea 2500; verificar que NO se poda a 1 mensaje cuando hay error).

**Criterio de aceptación:** pegar un log con «failed/refused/no se pudo» y preguntar «¿qué dice?» → el chip muestra `actividad`/`pensar`, NUNCA ⛔; decir «lee» continúa el plan sin recomenzarlo.

### B2 · `systemExtra` es un regulador mudo
`settings.ai.systemExtra` se guarda pero NADIE lo consume (grep: solo proSettings.ts:62/134 y ProConfigPanel).
**Arreglo:** en el cliente, donde se arma el system prompt del chat (buscar `system` en `src/utils/engine.ts` / payload de `/api/ai/stream`), añadir `+ "\n\nREGLAS DEL PROYECTO: " + settings.ai.systemExtra` si no está vacío. El server ya acepta el campo `system` en el body. **Prueba:** suite nueva o extensión de `esperaNube` comprobando que el texto viaja.

### B3 · «Le pedí una imagen y no salió nada» (gemini finge con HTML)
El mecanismo existe: orden ```cerebronico:imagen``` (`chatOrders.ts:561-570`) + plan `generar_imagen`. El modelo nube escribió `<img src="langosta.jpg">` + recarga en 3 s (farsa).
**Arreglo (2 líneas de prompt, sin riesgo):** en `instruccionesParaElModelo()` añadir: «PROHIBIDO escribir `<img>` que apunte a un archivo que no existe en el proyecto: si falta la imagen, EMITE PRIMERO la orden cerebronico:imagen y dile al usuario que la verás al revelarse. Si no puedes, dilo con palabras.»
**Mejora siguiente (ciclo aparte):** detector client-side en `extraerOrdenes`: si la respuesta HTML referencia `src="*.jpg|png|webp"` y ese archivo no está en el workspace → aviso honesto en el chat + botón «revelar ahora» que emite la orden con el prompt deducido del alt.

### B4 · «No pude borrar: No existe: Desktop/Cerebronico-v1.16.4»
`pc_delete`/herramientas PC resuelven rutas relativas contra el cwd del server, no contra el perfil del usuario.
**Arreglo:** en el resolvedor de las herramientas `pc_*` (server.ts, bloque `Herramientas de ACCESO PC REAL` ~1380-1436): si la ruta empieza por `Desktop/`, `Documents/`, `Downloads/` → prefijar `os.homedir()`. Motivo en el error cuando no exista (ya dice «No existe: X» — añadir «resuelta desde <base>»).

### B5 · Uso correcto del sandbox (documentar, no codear)
El ZIP de la IDE NO va al sandbox: `.proyectos` es para las APPS que se construyen. Para trabajar sobre el código de la propia IDE: `PROJECT_DIR=C:\Cerebronico` (o el BAT desde la carpeta descomprimida), y el Editor/Árbol para abrirla como proyecto. La A2 ya corta el camino erróneo con aviso claro.

## C. ORDEN DE EJECUCIÓN RECOMENDADO (con presupuesto)
1. B1.1 (regex del coreo) → suite `coreo` + suite nueva con 6 logs citados → 30 min.
2. B2 (systemExtra) → 15 min + prueba.
3. B3 (regla de honestidad de imagen) → 10 min.
4. B1.2 (reinicio de tarea) → requiere reproducir: pedir al usuario el log del server del turno «lee» → después.
5. B4 (rutas Desktop) → 15 min.
6. Cierre: `validar` + `build` + `superficie --verificar` + manifiesto + ZIP v1.16.5.

## D. Validación del presente ciclo (obligatorio antes de empaquetar)
`node scripts/validar.mjs` (75 suites + tipos) · `node scripts/superficie.mjs --verificar` · `npm run build` · manifiesto regenerado sobre el staging con la estructura doble de la casa.


---

<a id="revision-hoja-de-ruta-v1-31-md"></a>
## (3/4) REVISION-HOJA-DE-RUTA-v1.31.md

> **Fuente:** `./REVISION-HOJA-DE-RUTA-v1.31.md`  —  **version:** 1.31  —  **bytes:** 16685
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


---

<a id="roadmap-v1-33-hasta-v2-md"></a>
## (4/4) ROADMAP-V1.33-HASTA-V2.md

> **Fuente:** `./ROADMAP-V1.33-HASTA-V2.md`  —  **version:** 1.33.2  —  **bytes:** 3273
# ROADMAP — de aquí a v2.0 (cierre de v1.33.0 · 2026-09-30)

> **ESTADO 2026-09-30 · CERRADO HASTA FASE 10 (v1.40.0).** Todas las fases del
> plan evolutivo quedaron implementadas como módulos PUROS bajo `src/engine/`,
> cada uno con su suite en `tests/` registrada en `scripts/validar.mjs`, y con
> `tsc --noEmit` en 0 errores sobre todo el proyecto. Mapeo entregado:
>
> - **F4 · v1.34** Evidencia + Matriz de verificación — `motorEvidencia.ts` (29✓) · `matrizVerificacion.ts` (14✓)
> - **F5 · v1.35** Recuperación + Transacción — `motorRecuperacion.ts` · `capaTransaccion.ts` (22✓)
> - **F6 · v1.36** Grafo rico + Guardián de regresión — `grafoRico.ts` · `guardianRegresion.ts` (24✓)
> - **F7 · v1.37** Navegador real (contrato Browser Agent, degradación honesta sin Playwright) — `navegadorReal.ts` (22✓)
> - **F8 · v1.38** Regresión visual + Calidad de producto (3 dimensiones) — `regresionVisual.ts` · `calidadProducto.ts` (13✓)
> - **F9 · v1.39** Model Router (reutiliza `modelTiers`) — `enrutadorModelo.ts` (11✓)
> - **F10 · v1.40** Memory 3.0: ADR + memoria negativa por firma — `memoriaArquitectura.ts` · `memoriaNegativa.ts` (21✓)
>
> Las únicas suites en rojo del validador completo son las que dependen de red /
> `fetch` global (imagen, creador, hindsight, entregaFuncional, rutaTrabajo):
> requieren Node 18+ (este entorno corre Node 16, que no trae `fetch`/`Response`
> globales, como el propio instalador advierte). No son defectos del código de
> las fases; con Node 18+ el validador queda en verde.

Completado: **F1 v1.31** Context Engine + grafo mínimo + cable firma→escalera ·
**F2 v1.32** Plan Adaptativo: contrato de aceptación + presupuesto ·
**F3 v1.33** Reasoning Controller: el motor decide el próximo movimiento (§6)
con política determinista (§19).

| Versión | Qué | Aceptación mínima |
|---|---|---|
| v1.34 · Evidence Engine | unificar certeza+manifiesto+completitud+actas en CLAIM→EVIDENCE→VERDICT; anclaje MECÁNICO criterio→comando (hoy es por orden) | sin evidencia no hay VERIFICADO; cada cierre con parte firmado |
| v1.35 · Navegador real | Playwright/puppeteer: :3500, clics, formularios, viewport, consola, screenshots | detecta lo que los archivos no ven; evidencia entra al Engine |
| v1.36 · Grafo rico + Regresión | aristas llama/sirve/contrato; comparación proyecto completa antes/después | export/ruta/API que desaparece = FALLO |
| v1.37 · Visual & Quality | regresión visual estructural; calidadProducto 3 dimensiones | los 14 ejes pasan de lectura estática a medida |
| v1.38 · Efficiency | modelTiers publicado como router por tarea; exclusión de paralelismo por grafo | lo trivial no despierta al modelo grande |
| v1.39 · Memory 3.0 | ADR + memoria negativa por firma + preferencias | no re-propone lo rechazado; lecciones firmadas |
| v2.0 | consolidación §29 | humano solo en decisiones indecidibles objetivamente |

Principios vigentes como mecánica: §19 medible (esDeterminista) · §3 contrato
antes de código · §5/§17 peldaño automático y bloqueo honesto · §27 trinquete
(el monolito no crece: v1.31 +1 línea, v1.32 y v1.33 0 netas) · módulos en
español · análisis madre: `REVISION-HOJA-DE-RUTA-v1.31.md`.


---

<!-- UNIFICADO-v1.74.1 HOJA_DE_RUTA_v1.54.md -->
## Fuente: HOJA_DE_RUTA_v1.54.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### HOJA DE RUTA — CerebróNico IDE · v1.53.4 → v1.54 «CABLEADO Y EJECUCIÓN REAL»

> Documento de continuidad entre sesiones. Escrito contra el código **v1.53.4** el 2026-10-08.
> **Regla de la casa:** creer SOLO lo verificado contra código o por ejecución. Lo demás va marcado «SIN VERIFICAR».
> **Trinquete:** `server.ts` NO crece. Todo lo nuevo entra como módulo PURO en `src/engine/*` o `src/utils/*`.
> **Entrega:** SIEMPRE el proyecto COMPLETO como ZIP (carpeta top `cereb_check`). NUNCA parches ni archivos sueltos.

---

#### 0. De dónde partimos (estado verificado v1.53.4)

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

#### 1. Principios que gobiernan esta hoja de ruta

1. **Fixes de RAÍZ sobre parches puntuales.** Cada fallo del modelo se trata como síntoma sistémico.
2. **Verificar, no adivinar.** En el entorno dev (Node v16, sin red/node_modules/tsx) se valida **portando la lógica a `.mjs`** y ejecutando; lo que no se pueda correr queda «SIN VERIFICAR».
3. **Trinquete.** `server.ts` (11.842 líneas) no se toca salvo CABLEADO mínimo e inevitable; se prefiere exponer módulo puro + punto de invocación.
4. **Self-heal NO auto-parchea.** Registra en `evolutionDB`; no escribe el fix solo.
5. **No portar a Python ni adoptar E2B.** Stack TS/Electron intacto.
6. **Injertar sobre el código real.** Nada de motores autónomos nuevos.

---

#### 2. Pasos planificados (orden recomendado por ROI/riesgo)

> Orden pensado: **primero lo barato que da visibilidad (diagnóstico), luego lo que habilita capacidad (ejecución), y por último lo que necesita red/deps**.

##### PASO 1 — Matriz de CABLEADO F4–F10  *(diagnóstico · ROI alto · riesgo bajo)*  ✅ HECHO en v1.53.5
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

##### PASO 2 — Ampliar cobertura de LEYES_REFLEJO  *(fix de raíz · riesgo bajo)*  ✅ HECHO en v1.53.6
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

##### PASO 3 — Ejecución real end-to-end: install → build → test → preview  *(capacidad · riesgo medio)*  ✅ HECHO en v1.53.7
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

##### PASO 4 — Ejecución ESPECULATIVA en `planRunner.ts`  *(capacidad · riesgo ALTO)*  ✅ HECHO en v1.53.8 (mecánica; cable DOCUMENTADO, no insertado)
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

##### PASO 5 — Validador AST para edición por parche multi-archivo  *(capacidad · bloqueado por deps)*  ✅ HECHO en v1.53.9 (interfaz + fallback PROVISIONAL + orquestador; AST real SIN VERIFICAR)
**Objetivo:** validar ediciones multi-archivo con AST real (no regex).
**Bloqueo:** necesita `ts-morph` o `@babel/*` → **requiere RED + node_modules**, que NO hay en el entorno dev.
**Por qué último:** mayor dependencia externa; sin red no se puede ni instalar ni verificar aquí.
**Entregable (v1.53.9):** módulo puro `src/engine/validadorAST.ts` con (1) la **INTERFAZ `AnalizadorAST`** (contrato inyectable que aísla la dep AST del resto del motor), (2) un **FALLBACK REGEX PROVISIONAL** marcado `confiable:false` — `balanceDelimitadores` (máquina de estados que ignora cadenas/comentarios/plantillas y analiza `${}`), `extraerExports` — y (3) el **ORQUESTADOR PURO `validarParcheMultiArchivo`** que clona el mundo, valida la sintaxis por archivo y cruza invariantes ENTRE archivos reutilizando `importChecker` como fuente única (`import-a-borrado`, `export-perdido` sin falso positivo, encogimiento ≥35%).
**Verificación:** fallback + orquestador **verificados POR EJECUCIÓN** en Node v16 (`temp/harness_validador.mjs`, **51/51**); suite tsx `tests/validadorAST.test.ts` REGISTRADA (paridad 124/124). El **AST real** (ts-morph/babel) sigue **SIN VERIFICAR en dev** (dependencia de red): lo valida Mario tras `npm install`; se prueba que el contrato es INYECTABLE con un analizador falso confiable.
**Riesgo:** medio; la dependencia queda aislada tras la interfaz → el trinquete (`server.ts`) intacto. Módulo HUÉRFANO a propósito con cable mínimo DOCUMENTADO en la cabecera.

##### PASO 6 — Búsqueda web por defecto en modelos de nube  *(capacidad · política pura)*  ✅ HECHO en v1.54.0 (política + payload + directiva + citas; búsqueda real SIN VERIFICAR)
**Objetivo:** por DEFECTO, cuando el turno usa un modelo de NUBE, activar la búsqueda web para que el modelo CONFIRME en internet si lo que va a validar/escribir/ejecutar ESE turno es correcto; ejecutar SOLO sobre lo confirmado; y CITAR fuentes.
**Bloqueo honesto:** en el proyecto NO existía una herramienta de búsqueda web real cableada (ni serper/tavily/grounding). La llamada REAL a internet necesita red → **SIN VERIFICAR en dev**.
**Entregable (v1.54.0):** módulo puro `src/engine/busquedaWebNube.ts` que REUTILIZA `modelTiers` (`getModelProfile`/`esFamiliaNubeConHerramientas`) como FUENTE ÚNICA: `decidirBusquedaWeb` (prioridad: anulación del usuario > apagado global > exclusión por modelo > nube+default-ON; LOCAL nunca dispara), ensamblado de PAYLOAD por proveedor (Gemini `{googleSearch:{}}` vía `aplicarGroundingATools`; OpenRouter `:online` vía `modeloConSufijoOnline`; openai/compat de chat → solo-directiva → SIN VERIFICAR), `directivaBusquedaWeb` (confirma→ejecuta sobre lo seguro→cita) y la política de citas (`requiereCitas`/`formatearCitas`).
**Verificación:** **verificado POR EJECUCIÓN** en Node v16 (`temp/harness_busquedaweb.mjs`, **56/56**); suite tsx `tests/busquedaWebNube.test.ts` REGISTRADA (paridad 125/125). La BÚSQUEDA WEB REAL contra internet sigue **SIN VERIFICAR en dev** (sin red): la ejerce Mario al cablear.
**Riesgo:** bajo-medio; NO añade deps de pago ni de nube pesada (usa el grounding que el proveedor YA ofrece). Trinquete (`server.ts`) intacto; módulo HUÉRFANO a propósito con cable mínimo DOCUMENTADO en la cabecera. Detalle completo en `documentacion/HOJA_DE_RUTA_BUSQUEDA_WEB_v1.54.0.md`.

---

#### 3. Tabla resumen de priorización

| # | Paso | Tipo | ROI | Riesgo | ¿Verificable en dev (Node v16, sin red)? |
|---|---|---|---|---|---|
| 1 | Matriz de CABLEADO F4–F10 | Diagnóstico | ALTO | Bajo | **SÍ (100%)** |
| 2 | Ampliar LEYES_REFLEJO | Fix de raíz | Medio-Alto | Bajo | **SÍ (harness .mjs)** |
| 3 | Ejecución real E2E | Capacidad | Alto | Medio | Parcial (lógica sí; ciclo real NO) |
| 4 | Ejecución especulativa | Capacidad | Medio | **ALTO** | Parcial (transacción sí; especulativa NO) |
| 5 | Validador AST | Capacidad | Medio | Medio | **Parcial (fallback+orquestador SÍ 51/51; AST real NO)** |
| 6 | Búsqueda web por defecto en nube | Capacidad | Alto | Bajo-Medio | **Parcial (política+payload+directiva+citas SÍ 56/56; búsqueda real NO)** |

---

#### 4. Hitos de versión propuestos

- **v1.53.5** — PASO 1 (Matriz de CABLEADO). **v1.53.6** — PASO 2 (LEYES_REFLEJO ampliadas: científica 3 / cuántica 3). **v1.53.7** — PASO 3 (Ciclo real install→build→test→preview, lógica pura verificada 48/48; capa SO SIN VERIFICAR). **v1.53.8** — PASO 4 (Ejecución ESPECULATIVA: mecánica segura PURA verificada 37/37; capaTransaccion fuente única; cable DOCUMENTADO no insertado; comportamiento especulativo real SIN VERIFICAR). **v1.53.9** — PASO 5 (Validador AST por parche multi-archivo: interfaz inyectable + fallback regex PROVISIONAL + orquestador puro verificados 51/51; importChecker fuente única; AST real SIN VERIFICAR hasta tener deps). Todo verificable en dev salvo lo marcado.
- **v1.54.0** — PASO 3 cableado al vivo (cuando exista el cable mínimo). Primer salto de capacidad.
- **v1.54.x** — PASO 4 cableado al vivo (`planRunner.ts`): la MECÁNICA ya está (v1.53.8); falta insertar el cable y verificar la concurrencia real E2E.
- **v1.55.0** — PASO 5 cableado al vivo + **AST real** (ts-morph/babel) verificado: la interfaz, el fallback y el orquestador ya están (v1.53.9); falta instalar la dep, implementar el adaptador real tras `AnalizadorAST`, cablearlo antes de confirmar la `capaTransaccion` y verificar end-to-end en la máquina de Mario.

> Cada bump: sincronizar `package.json` + `src/constants.ts` (VERSION_SEMVER) + `index.html` + `CHANGELOG.md`. Registrar suites nuevas en `scripts/validar.mjs`. Documentar en `cerebro.md` / `CHANGELOG.md`. Respetar el trinquete.

---

#### 5. Lo que esta hoja de ruta NO promete (honestidad)

- NO afirma `tsc`/`validar.mjs` completos verdes: SIN node_modules eso queda **SIN VERIFICAR**; solo corren suites portadas a `.mjs`.
- NO promete que los módulos F4–F10 estén cableados: justamente el PASO 1 existe para DESCUBRIRLO.
- NO promete ejecución real E2E ni especulativa verificada en el entorno dev: dependen de red/deps en la máquina de Mario.

---

*Próxima decisión de Mario:* confirmar si arrancamos por el **PASO 1 (Matriz de CABLEADO)** como recomendado, o reordenar.


---

<!-- UNIFICADO-v1.74.1 HOJA_DE_RUTA_BUSQUEDA_WEB_v1.54.0.md -->
## Fuente: HOJA_DE_RUTA_BUSQUEDA_WEB_v1.54.0.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### HOJA DE RUTA — CerebróNico IDE · PASO 6 · «BÚSQUEDA WEB POR DEFECTO EN NUBE» (v1.53.9 → v1.54.0)

> Documento de la TAREA. Escrito contra el código **v1.53.9** el 2026-10-08.
> **Regla de la casa:** creer SOLO lo verificado contra código o por ejecución. Lo demás va marcado «SIN VERIFICAR».
> **Trinquete:** `server.ts` (11.842 líneas) NO crece ni cambia su contrato. Todo lo nuevo entra como módulo PURO en `src/engine/*`.
> **Entrega:** SIEMPRE el proyecto COMPLETO como ZIP (carpeta top `cereb_check`). NUNCA parches ni archivos sueltos.

---

#### 1. El encargo (lo que pidió Mario)

> Por DEFECTO en el motor, cuando se use un modelo CLOUD, activar la BÚSQUEDA WEB para que el modelo consulte internet y confirme si lo que va a **validar / escribir / ejecutar ESE turno** es correcto; luego **ejecutar sólo sobre lo seguro**; y **CITAR fuentes** cuando haga falta.

Traducido a invariantes verificables:

1. **Nube ⇒ búsqueda ON por defecto.** Si el modelo del turno es de NUBE y el usuario no la ha apagado, la búsqueda web entra activada sin que nadie la pida.
2. **Local ⇒ OFF.** Un modelo local (Ollama) NO dispara búsqueda (no hay cliente ni cuota; sería ruido). Queda sólo la directiva de prudencia si el usuario la fuerza.
3. **El usuario manda.** Un apagado global (config) o una anulación explícita del turno (`anuladoPorUsuario`) GANA al valor por defecto, en ambos sentidos.
4. **Verificar ANTES de actuar.** La directiva de sistema ordena: consulta la web, **confirma**, ejecuta/escribe SOLO lo confirmado, y lo no confirmado se declara «SIN VERIFICAR» (no se ejecuta a ciegas).
5. **Citar cuando dependa de datos externos/volátiles.** Política de citas pura (URL + por qué), con tope configurable.

---

#### 2. Honestidad primero: qué SÍ y qué NO se puede verificar aquí

- **NO existe hoy en el proyecto una herramienta de búsqueda web real** (ni serper, ni tavily, ni grounding cableado). El único rastro es una mención en `tests/huesoObra.test.ts`. Por tanto, **la red real NO se toca en este paso** y la ejecución contra internet queda **SIN VERIFICAR en dev** (entorno sin red/node_modules).
- Lo que SÍ es **puro y comprobable HOY**: la **POLÍTICA** (decidir cuándo la búsqueda está activa), la **DIRECTIVA de sistema** que se inyecta en el prompt, el **ensamblado del payload de grounding** por proveedor (fragmento de `tools` para Gemini; sufijo `:online` para OpenRouter; sólo-directiva para el resto) y la **política de citas**. Todo eso se verifica portando la lógica a `.mjs` y ejecutándola en Node v16.
- El soporte NATIVO de cada proveedor se declara sin maquillaje: `gemini` → `{ googleSearch: {} }` nativo; `openrouter` → sufijo `:online`; `openai`/compat de chat/completions → **sólo-directiva** (su `web_search` vive en la Responses API, que este motor no usa) → **SIN VERIFICAR**.

---

#### 3. Diseño (RAÍZ, no parche)

Módulo PURO NUEVO: **`src/engine/busquedaWebNube.ts`**. Se apoya en la FUENTE ÚNICA de clasificación de modelos (`modelTiers.ts`: `getModelProfile`, `esFamiliaNubeConHerramientas`) — NO reimplementa la detección de nube. Patrón «dos capas + config `.cerebro-db`» heredado de `cloudVerifier.ts`.

Funciones PURAS exportadas:

| Función | Qué hace |
|---|---|
| `CONFIG_BUSQUEDA_DEFECTO` | Config por defecto: `porDefectoEnNube:true`, `desactivadaGlobal:false`, `modelosExcluidos:[]`, `maxCitas:5`. |
| `resolverSoporteGrounding(proveedor)` | Mapea proveedor → `gemini-nativo` / `openrouter-online` / `solo-directiva` / `ninguno`. |
| `decidirBusquedaWeb(entrada)` | **El corazón.** Cruza (es nube) × (por defecto ON) × (no excluido) × (anulación del usuario). Devuelve `{activa, esNube, soporte, motivo}`. |
| `payloadGeminiGrounding()` | Devuelve el fragmento `{ googleSearch: {} }` para añadir al array `tools` de Gemini. |
| `aplicarGroundingATools(tools, decision)` | Devuelve un array NUEVO con el fragmento de grounding añadido (sólo si `gemini-nativo`). No muta la entrada. |
| `modeloConSufijoOnline(modelo)` | Añade `:online` a un id de OpenRouter si falta (habilita su búsqueda web). |
| `directivaBusquedaWeb(decision, opts)` | Genera el texto de la directiva de sistema (verifica→ejecuta sobre lo seguro→cita). |
| `requiereCitas(decision, afirmacionExterna)` | Política: ¿hay que citar en esta afirmación? |
| `formatearCitas(fuentes, maxCitas)` | Formatea una lista de fuentes citadas (URL + motivo), recortada al tope. |
| `parteBusqueda(decision)` | Línea de parte legible para el log de la IDE. |
| `cargarConfigBusqueda(raiz)` | Lee `.cerebro-db/busquedaWeb.json` (fs; capa fina, **SIN VERIFICAR** pesado). |

**Cable MÍNIMO, DOCUMENTADO y NO insertado** (módulo HUÉRFANO a propósito):
- Rama Gemini (`server.ts` ~línea 10256): `toolsGemini = aplicarGroundingATools(toolsGemini ?? [], decision)` y `consolidatedSystemInstruction += directivaBusquedaWeb(decision, {...})`.
- Rama OpenAI/compat: anteponer la directiva al mensaje de sistema; para OpenRouter, pasar `modeloConSufijoOnline(model)`.
- La decisión se calcula una vez por turno: `decidirBusquedaWeb({ modelo, proveedor, config: cargarConfigBusqueda(RAIZ), anuladoPorUsuario })`.

El porqué exacto vive en la cabecera del módulo y en el CHANGELOG. **`server.ts` queda intacto.**

---

#### 4. Plan de verificación (entorno dev: Node v16, sin red/node_modules)

1. Harness `temp/harness_busquedaweb.mjs`: EXTRAE byte a byte las funciones puras de `busquedaWebNube.ts`, stripea tipos de una lista CERRADA, y ejercita decisión/directiva/payload/citas. Objetivo: **verde**.
2. Suite tsx paralela `tests/busquedaWebNube.test.ts`, REGISTRADA en `scripts/validar.mjs` (paridad disco↔validar.mjs que exige `resiliencia.test.ts`: 125/125, cero huérfanos).
3. **SIN VERIFICAR:** la búsqueda web REAL contra internet (sin red en dev) y `tsc --noEmit` completo (sin node_modules). Lo corre Mario en Windows.

---

#### 5. Entregables (v1.54.0)

- `src/engine/busquedaWebNube.ts` (módulo PURO nuevo).
- `tests/busquedaWebNube.test.ts` + registro en `scripts/validar.mjs`.
- `temp/harness_busquedaweb.mjs` (prueba por ejecución en Node v16).
- Bump de versión **1.53.9 → 1.54.0** sincronizado en todas las caras desde `VERSION_SEMVER`.
- `CHANGELOG.md` (entrada nueva) + esta hoja de ruta + apunte PASO 6 en `HOJA_DE_RUTA_v1.54.md`.
- ZIP COMPLETO `cerebronico-ide-v1.54.0-AMPLIADO.zip` (top `cereb_check`).

---

#### 6. Lo que esta hoja de ruta NO promete (honestidad)

- NO afirma que la búsqueda web real funcione: en dev no hay red → **SIN VERIFICAR**; se verifica la POLÍTICA/DIRECTIVA/PAYLOAD, no la llamada a internet.
- NO cablea `server.ts`: el cable queda DOCUMENTADO; el módulo es HUÉRFANO a propósito.
- NO promete `tsc`/`validar.mjs` completos verdes sin node_modules.
- NO añade dependencias de pago ni de nube pesada: el grounding usa lo que el proveedor YA ofrece (Gemini nativo / OpenRouter `:online`).

---

*Siguiente decisión de Mario:* cablear al vivo en `server.ts` (PASO 6 → v1.54.x) tras validar en su máquina, y decidir si el `openai`/compat de chat merece migrar a Responses API para tener `web_search` nativo.


---

<!-- UNIFICADO-v1.74.1 HOJA_DE_RUTA_VENTANA_CONTEXTO_v1.55.0.md -->
## Fuente: HOJA_DE_RUTA_VENTANA_CONTEXTO_v1.55.0.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### HOJA DE RUTA — AMPLIAR LA VENTANA DE CONTEXTO DE LOS MODELOS (v1.55.0)

> Pedido de Mario tras exportar el chat (sesión `1791453571902`): el chat se
> cortaba a mitad de la redacción y Z.ai devolvía **«Prompt exceeds max length
> (code 1261)»** con `glm-4.5-flash`. «Amplía la ventana de contexto de los
> modelos, te darás cuenta con el chat.»

---

#### 1. DIAGNÓSTICO (causa raíz)

En `src/engine/modelTiers.ts`, la rama de nube **RÁPIDA** (flash/lite/mini/turbo/
haiku…) usaba un presupuesto **FIJO a ojo**: `contextCharBudget = 48000` chars y
`historyTurns = 12`. Era prudente para no desbordar, pero quedaba **>90 % por
debajo** de la ventana real del modelo:

| Familia                         | Ventana real (tokens) |
|---------------------------------|-----------------------|
| GLM-4.5 / 4.5-Flash / 4.5-Air   | 128K                  |
| GLM-4.6 / 4.7                   | 200K                  |
| Claude (sonnet/opus/haiku)      | 200K                  |
| GLM-4.5V y multimodales         | 64K                   |
| Gemini Flash/Pro, GPT-4.1/5     | 1M                    |
| gpt-oss, deepseek, qwen, grok   | 128K                  |

Pedir ~13K tokens a un modelo de 128K **desperdiciaba la ventana** y, a la vez,
cuando se adjuntaban capturas el prompt crecía de golpe y disparaba el 1261.

#### 2. LA CURA (pura — NO toca `server.ts`, trinquete 11.842 líneas intacto)

El presupuesto deja de ser un literal y se **DERIVA de la ventana real**:

1. **Tabla nueva** `VENTANAS_CONTEXTO_NUBE` + función `ventanaContextoTokens()`
   (ambas exportadas). Lo específico gana el orden: `glm-4.5v` → 64K **antes** de
   que `glm-4.5` lo capture a 128K. Los alias (p. ej. `nemesis` =
   `gpt-oss:120b-cloud`) heredan la ventana de su canónico vía
   `resolverAliasDeModelo()`.
2. Fórmula: `presupuesto = ventana × fracción_entrada × chars_por_token`,
   acotada por un **TOPE DURO** y un **SUELO** (sin regresión posible).

Resultado medido:

| Modelo                 | Antes        | Después (v1.55.0)        |
|------------------------|--------------|--------------------------|
| `glm-4.5-flash`        | 48000 / 12   | **220000 / 40** (≈4.5×)  |
| `gemini-*-flash`       | 48000 / 12   | 220000 / 40 (tope)       |
| `glm-4.5v` (visión)    | 48000 / 12   | 145600 / ~36             |
| `gpt-oss:120b-cloud`   | 128000 / 20  | 322560 / 60              |

#### 3. JUSTIFICACIONES ESCRITAS EN CÓDIGO (no ajustes silenciosos)

- `CARS_POR_TOKEN = 3.5` — prudente para ES + código + logs; subirlo a 4 acercaría
  el prompt al borde y reabriría el 1261. Deja ~12 % de colchón.
- `FRACCION_ENTRADA` **0.65** (rápida) / **0.72** (grande) — reserva margen para la
  salida y las imágenes (las capturas son lo que de verdad dispara el 1261).
- `TOPE_BUDGET` **220000** (rápida) / **400000** (grande) — aunque Gemini declare
  1M tokens, mandar 1M de chars por turno en un equipo de 8 GB dispara la latencia
  sin beneficio real.
- `SUELO_BUDGET` **48000** (rápida) / **128000** (grande) — nunca por debajo del
  comportamiento previo (garantía de no regresión).

#### 4. SIN REGRESIÓN

- `numCtx` de nube sigue en **32768** (lo exige `tests/motor-datos.test.ts`).
- La salida no se trunca: `numPredict = -1` intacto.
- Los modelos **LOCALES no se tocan** (su ventana la fija Ollama).
- Las notas del perfil informan en el log de la IDE la ventana real y el
  presupuesto AMPLIADO.

#### 5. VERIFICACIÓN

- **POR EJECUCIÓN** en Node v16 con un harness que porta la lógica nueva:
  **18/18 OK**.
- Suite paralela `tests/ventanaContexto.test.ts` **REGISTRADA** en
  `scripts/validar.mjs` (sin suites huérfanas: 127 en disco = 127 registradas).
- Versión unificada en **4 sitios**: `package.json` + `src/constants.ts`
  (`VERSION_SEMVER`) + `index.html` + `CHANGELOG.md` = **1.55.0**.
- **SIN VERIFICAR** en dev: la ventana REAL contra el proveedor (no hay claves/red
  aquí); la ejerce Mario al arrancar la IDE con sus credenciales.

#### 6. ETAPAS

- [x] **Etapa 1 — Diagnóstico** desde el chat exportado (1261 con glm-4.5-flash).
- [x] **Etapa 2 — Tabla de ventanas + derivación** en `modelTiers.ts`.
- [x] **Etapa 3 — Justificaciones** escritas en código (topes/fracciones/suelos).
- [x] **Etapa 4 — Pruebas** nuevas registradas + harness 18/18 verde.
- [x] **Etapa 5 — Versión + CHANGELOG + este documento** dentro del ZIP.
- [ ] **Etapa 6 (futuro / EVOLUCIÓN)** — medición de tokens REAL por tokenizador
  del proveedor (ahora se estima con `CARS_POR_TOKEN`); compactación semántica del
  historial (resumir turnos viejos) en vez de recorte por ventana; y telemetría
  del uso real de ventana para auto-ajustar fracciones por familia.


---

<!-- UNIFICADO-v1.74.1 HOJA_DE_RUTA_ANTITRANCADO_v1.55.1.md -->
## Fuente: HOJA_DE_RUTA_ANTITRANCADO_v1.55.1.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### HOJA DE RUTA — ANTI-TRANCADO v1.55.1
#### «El modelo anuncia y frena» → re-empuje ESCALADO (nunca colgado)

**Versión:** 1.55.1 · **Fecha:** 2026-10-08 · **Para:** Mario Nicolas Quintero

---

#### 1. Síntoma reportado (captura 4)

Con `glm-4.5-flash` y «Agente PC ON», el chat responde:

> «Voy a analizar… exploremos la estructura del proyecto»

… y **se queda ahí**: no ejecuta ninguna herramienta, el turno termina mostrando
esa promesa y hay que escribirle «¿qué pasa?» para que siga. Pedido de Mario:
**que siga/conteste solo, sin re-preguntar.**

#### 2. Causa raíz

- El anti-trancado de **v1.46.4** ya detectaba el «anuncio sin acción»
  (`motivoDeParada` reconoce «voy a…», encabezados, «primero…») y re-empujaba…
  **pero una sola vez** (cartucho booleano).
- Un modelo flojo volvía a narrar en el 2.º intento → cartucho gastado → el turno
  cerraba igual, colgado de la promesa.
- `glm-4.5-flash` **SÍ** es tool-capable (familia `/glm-4/` en
  `CLOUD_TOOL_FAMILIES`). No era falta de capacidad: era falta de insistencia.

#### 3. Fix (integrado)

`src/engine/bucleAutonomo.ts` — nueva `directivaDeReanudacion(intento)`:

| intento | tono |
|--------|------|
| 0 | directiva base de siempre (cero regresión) |
| intermedio | «SEGUNDO AVISO — basta de narrar»: próximo mensaje = herramienta real; arrastra la base |
| último | ULTIMÁTUM con **camino B**: si no vas a usar herramientas, **ENTREGÁ YA** la respuesta en texto —sin «voy a»—; prohibido volver a anunciar y frenar |

`server.ts` — los **dos** puntos de re-empuje de nube pasan de booleano a contador:
- rama OpenAI-compat / Z.ai (`let reempujes = 0`, `reempujes < MAX_REEMPUJES_ANUNCIO`, `directivaDeReanudacion(reempujes)`);
- rama **Gemini** (`let reempujesGemini = 0`, mismo patrón).

> El fix cubre AMBOS proveedores, no solo Z.ai.

#### 4. Justificación del tope (escrita en código)

`MAX_REEMPUJES_ANUNCIO = 3`. Con 1 (v1.46.4) un modelo débil se escapaba narrando
dos veces; con **2 reintentos reales + 1 ultimátum de entrega** se cubre el caso
medido sin regalar latencia ni arriesgar un turno interminable. Acotado y
determinista: agotados los re-empujes, el turno cierra con lo que haya.

#### 5. Contrato de superficie de rutas (regenerado, justificado)

- Venía **stale** del 2026-10-07: `presupuesto_lineas = 11826` vs `server.ts = 11843`
  real (17 líneas de desfase **pre-existente**, no causado por este fix).
- Regenerado con `node scripts/superficie.mjs`: **141 rutas = 141**,
  `presupuesto_lineas = 11844`, techo derivado 13400, margen 1556.
- **Superficie INTACTA** (141/141): solo creció el conteo de líneas; ninguna ruta
  nueva ni eliminada.

#### 6. Pruebas

- `tests/bucleAutonomo.test.ts` → **sección 10** (re-empuje escalado) + aserciones
  de cableado (ambas ramas del `server.ts` usan `directivaDeReanudacion` + contador;
  el booleano viejo no volvió). Registrada en `scripts/validar.mjs` (sin pruebas huérfanas).
- `temp/harness_reanudacion.mjs` (Node v16, extraído del FUENTE): **13/13 verde**.

#### 7. SIN VERIFICAR (honestidad)

La ruta de red real contra el proveedor (Z.ai/Gemini) no se ejercita en dev:
depende de Electron + claves + red. Lo probado es la lógica de escalada (unidad +
harness) y el cableado leído del fuente del `server.ts`.

#### 8. Versión consistente (4 sitios)

`src/constants.ts` (`VERSION_SEMVER`), `package.json`, `index.html`
(title + description + og:title + og:description) y `CHANGELOG.md` → **1.55.1**.


---

<!-- UNIFICADO-v1.74.1 CORROBORACION_Y_ROADMAP_REAL.md -->
## Fuente: CORROBORACION_Y_ROADMAP_REAL.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### CORROBORACIÓN Y ROADMAP REAL — verificación de los 5 documentos recibidos
**Contra:** CerebroNico IDE v2.3 (motor de planes con imágenes) · **Fecha:** 19-sep-2026
**Método:** cada afirmación se buscó en el código real (grep/lectura), no en el catálogo.
Veredictos: ✅ CIERTO · 🟡 PARCIAL (existe pero no como lo cuenta) · ❌ FALSO (no existe) · 📋 RECOMENDACIÓN VÁLIDA (aún no está; puede hacerse)

#### 0. LA TRAMPA QUE HAY QUE SABER ANTES DE LEER NADA
Los documentos citan «SKILL 7, 8, 21, 51, 52, 53, 55, 64, 66, 76» como si fueran código.
**No lo son.** `src/data/skills100.ts` es un **catálogo de texto**: solo 8 de las 100
entradas tienen `triggerCommand` real, y **92 describen capacidades que nunca se
construyeron** (hallazgo documentado el 18-sep). Un documento que "corrobora" el
proyecto citando SKILLs del catálogo está confirmando promesas, no hechos. Regla
permanente: **creer solo lo que tenga fichero, endpoint o prueba.**

#### 1. MEJORAS_SOFTWARE_PRO.md (roadmap "grado industrial")
| Afirmación | Veredicto | Hecho en el código |
|---|---|---|
| Docker/Podman "vía puerto 5000" | 📋 + ❌ del "vía" | No hay Docker (0 en package.json). Y el :5000 es el **puente PC (HTTP/Flask para archivos)**, no una API de contenedores; el orquestador real sería Express :3000. La recomendación es válida; la arquitectura que supone, no. |
| Proxy de paquetes npm/pip | 📋 | No existe. Caché real hoy: `npm install` del sandbox. |
| Git nativo en UI | 📋 | Cero integración git (0 coincidencias en server.ts). Es el hueco más grande y real de la lista. |
| CRDT/Yjs multiusuario | 📋 | Yjs no está. Nota honesta: choca con el tope de 5 MB del workspace y con que el estado vive en localStorage. |
| DAP debugger | 📋 | No existe. |
| APM local (CPU/RAM/TPS) | 🟡 | **Ya hay monitor de CPU/RAM** (chips del Header, `hardwareGovernor.ts`, telemetría Ollama). Lo que falta: TPS y red. |
| SAST/secretos antes de exportar | 📋 | No existe. El `syntaxGuard` actual solo valida sintaxis/truncamiento. |
| Vault (PBKDF2+AES-GCM) para claves | 📋 | Hoy las claves viven en `.env` (servidor) sin cifrar en reposo. "SKILL 55 AES-GCM" es **catálogo sin código**. |
| Plugins Wasm | 📋 | El sistema de extensiones real es más simple y SÍ existe: `extensions/<id>/manifest.json + panel.html` (aisladas en iframe), con comandos `/…` y herramientas para el modelo. Ver §3. |

#### 2. CEREBRONICO_CAPACIDADES_MAXIMAS.md
| Afirmación | Veredicto | Hecho |
|---|---|---|
| Autodespliegue: escribir→probar→ZIP→planes paralelos | 🟡 | Escribir/probar (guardián+10 suites)/empaquetar/planes: **cierto hoy**. "Desplegar sin intervención": no hay deploy; y el plan **no** despliega. |
| OCR multimodal desde capturas | ❌ | No hay modelo visual cableado. **Ahora el cerebro dibuja, pero no mira**: `generar_imagen` es salida, no entrada. |
| Refactorización AST masiva ("SKILL 51") | ❌ | Catálogo. El IDE tiene ediciones por texto y el `importChecker` con stubs, no transformaciones AST. |
| Auto-curación: fugas ("SKILL 66"), imports, rollback de memoria | 🟡 | `importChecker.ts` con generación de stubs: **CIERTO** (17 referencias, existe). `memoria.md` atómico + historial + volver a confirmación concreta: **CIERTO** (endpoint de rollback). "Fugas de memoria SKILL 66": catálogo. |
| Generación multimedia on-demand (`cerebronico:imagen`) | ✅ | **CIERTO desde v2.3**: cadena Pollinations gratuita + Gemini con clave, tarea de plan + orden de chat + miniaturas en el panel. 91 pruebas propias. |
| Auditoría OWASP ("SKILL 21") / AES-GCM ("SKILL 55") | ❌ | Catálogo sin código en ambos casos. |

#### 3. GUIA_USO_EXTENSIONES.md
| Afirmación | Veredicto | Hecho |
|---|---|---|
| Anatomía `extensions/<id>/manifest.json + panel.html + icono` | ✅ | Existe tal cual: `extensions/cerebronico.panel-ejemplo/` con su manifest. |
| Habilitar/Deshabilitar + "Abrir" abre pestaña central aislada | ✅ | Coincide con `App.tsx` (pestañas centrales + iframe aislado). |
| Comandos `/contar`, `/informe` y herramientas `ext_…` para el modelo | ✅ | El ejemplo los trae; `skills100.ts` marca solo 8 entradas con `triggerCommand` — coherente con que las extensiones reales son las de `extensions/`, no el catálogo. |

#### 4. ANALISIS_CEREBRO_MEMORIA_MULTISERIE.md
| Afirmación | Veredicto | Hecho |
|---|---|---|
| Chat local (Ollama :11434) + nube (OpenAI/Gemini/OpenRouter) | ✅ | Cierto: 6 plantillas de proveedor con clave. |
| 3 niveles de memoria: `memoria.md` atómica+historial / RAG vectorial / IndexedDB | 🟡 | `memoria.md` + `memoria_history`: **CIERTO**. RAG local: **existe** (`localRAG.ts`, indexación al guardar conocimiento) — "vectorial en RAM sin alucinaciones" es marketing: recupera por token/clave, no embeddings neuronales. IndexedDB: **existe** (`utils/indexedDBStorage.ts`) pero el WORKSPACE vive en **localStorage** (tope 5 MB); IndexedDB guarda otra cosa. |
| syntaxGuard bloquea escrituras | ✅ | Cierto, con la nota conocida: no comprueba balance de llaves en JS/TS (política deliberada). |
| importChecker auto-repara con stubs | ✅ | Cierto. |
| hardwareGovernor "monitorea TEMPERATURA" | ❌ | Mide CPU/RAM/carga; **0** referencias a temperatura. No mientas con lo que tu máquina no lee. |
| "Qué le falta": 1) motor de grafos DAG | ❌ del "falta" | **YA EXISTE**: `taskPlanner.ts` (nodos, `dependeDe`, detección de ciclos, despachador paralelo, cancelación, reanudación) + `planRunner` con semáforo global + presupuesto MR. El documento recomienda comprar lo que ya está construido. |
| 2) Model Router local/nube | 🟡 | Parcialmente existe: plantillas de proveedor + `modelo` por tarea/plan. Falta el *router por complejidad* — esa sí es una recomendación buena y barata. |
| 3) Bus de mensajes entre agentes | 📋 | No hay broker; hoy el intercambio es HTTP request/response. Recomendación válida para otra fase. |
| 4) Arbitraje de conflictos de archivo | 📋 | Hoy lo resuelve el semáforo + el orden del grafo; un árbitro por archivo no existe. |

#### 5. MODO_PLANIFICADOR_Y_AUTOMATIZACION.md — el que más errores tiene
| Afirmación | Veredicto | Hecho real (léase esto, no el documento) |
|---|---|---|
| Esquema `cerebronico:plan` con `id/titulo/tipo/peso/datos/dependeDe` | ✅ | Exacto. Y el ejemplo con `generar_imagen` es válido **desde v2.3** (aunque `public/banner.png` saldría re-etiquetado a `.jpg` si los bytes son JPEG: la extensión la mandan los bytes). |
| "Backend FastAPI (:5000) ejecuta el plan en 4 fases" | ❌ | El planificador corre en **Express :3000** (`/api/brain/*`, `planRunner` en segundo plano). :5000 solo acerca el sistema de archivos del PC. |
| Valida ciclos, unicidad de ids, parámetros por tipo | ✅ | Cierto — y chat y motor usan la **misma** validación (`crearPlan`+`validarPlan`), probado palabra por palabra. |
| "Hilos independientes del sandbox" | ❌ | Nada de hilos: asíncrono en el proceso, con **presupuesto por tramos MR** (io/cpu ≥1 siempre) y semáforo global por peso. |
| "Resultado se inyecta en memoria viva (memoria.md)" | ❌ | Los planes viven en **`.cerebro-db/planes.json`** a propósito: si fueran conocimiento, el modelo los recibiría en cada prompt. |
| "Si una subtarea falla, el motor ABORTA el plan y hace ROLLBACK automático" | ❌❌ | **Lo contrario de la regla fundante del motor: TERMINAR SIEMPRE.** La tarea fallida se marca con su clase de error y su motivo; las independientes siguen; los 429 esperan 45 s y reintentan; el cortacircuito enfría en vez de abortar; al final queda `hecho/parcial/fallido` con la lista `sinHacer`. No hay rollback de archivos porque el motor **nunca escribe código por ti**: solo lee, convierte, genera imagen y guarda artefactos declarados. |

#### 6. ROADMAP REAL, ORDENADO POR LO QUE YA EXISTE (honesto, con coste)
1. 🟢 **Modo serie para imágenes gratuitas** — la cola real es ~1/IP; un plan de N imágenes ya funciona pero choca contra 429 y espera. Un flag "imagen: en serie" (peso io→1 para el circuito `imagen`) elimina el 90 % de los reintentos. 1 día.
2. 🟢 **Pegar la imagen generada donde se vea**: orden `cerebronico:abrir` ya existe; falta una mini-orden que inserte `<img src="…">` en un archivo del workspace (texto, no binario → sin tocar el tope de 5 MB). 1–2 días.
3. 🟡 **Model Router por complejidad** (barato: ya hay `modelo` por tarea; falta una heurística local→nube en `chatOrders`/planner). Semana.
4. 🟡 **Git nativo** (el hueco real más grande; `simple-git` + panel; el workspace ya tiene rutas estables). Semana y media.
5. 🔴 **Entrada de imagen (visión)**: el OCR multimodal que el documento da por hecho **no existe**; requiere cablear un modelo con visión (Gemini sí, Ollama depende del modelo). Mes.
6. 🔴 **Docker/CRDT/DAP/Wasm**: recomendaciones legítimas pero cada una es una plataforma nueva; ninguna es "lo que le falta al cerebro". Meses.

**Antes de nada de esto: limpiar el catálogo.** `skills100.ts` sigue prometiendo 92
capacidades sin código y `contextCache.ts` se las inyecta al modelo como "activas".
Mientras eso siga ahí, cualquier documento externo (como los 5 corregeados aquí)
usará el catálogo como evidencia y el ciclo de promesas falsas se autoalimenta.


---

<!-- UNIFICADO-v1.74.1 CAMBIOS_v1.1_ZAI_GRATIS.md -->
## Fuente: CAMBIOS_v1.1_ZAI_GRATIS.md

> Unificado UNIFICADO-v1.74.1 (Mario: «un ejemplar actual de cada archivo con toda la información»). Original archivado en `documentacion/_archivo-consolidado/UNIFICADO-v1.74.1/`.

### v1.1 — Z.ai (GLM-4.5-Flash) GRATIS + servidores cloud extra + fix fondo de pantalla

#### Resumen ejecutivo

Se añadieron **7 proveedores cloud con tier gratuito** como proveedores dedicados (no como plantillas Custom):
- **Z.ai (GLM)** — GLM-4.5-Flash, GLM-4-Flash, GLM-4-Air, GLM-4-FlashX, GLM-4.5V-Flash → **100% GRATIS, sin tarjeta de crédito**
- **Groq** — Llama 3.3 70B, Gemma 2 9B, Mixtral → GRATIS
- **Cerebras** — Llama 3.1 8B/70B, Qwen 2.5 Coder → GRATIS (beta)
- **Together AI** — Llama 3.3 70B Turbo Free, DeepSeek R1 Distill → $5 crédito gratis
- **Mistral AI** — Mistral Small/Medium, Codestral, Nemo → GRATIS (rate limits)
- **DeepSeek** — V3, R1, Coder → muy económico (casi gratis)
- **Fireworks AI** — Llama 3.1, DeepSeek R1 Distill → $1 crédito gratis

#### ⚠️ Aclaración importante sobre "gratis"

Z.ai (como **todos** los proveedores cloud: OpenAI, Gemini, Groq, etc.) **requiere registro gratuito + API key** para usar sus modelos. NO hay un endpoint "sin API key" en ningún lado. Lo que SÍ hicimos:

1. **Preconfigurado por defecto**: al arrancar el IDE, el provider activo es **Z.ai** y el modelo es **GLM-4.5-Flash** (sin que el usuario tenga que tocar nada).
2. **Asistente de bienvenida**: aparece un modal al primer arranque que:
   - Explica por qué GLM-4.5-Flash es gratis
   - Tiene un botón "Abrir z.ai/manage/apikey" en 1 clic
   - Tiene un campo para pegar la clave
   - La guarda automáticamente y persiste
3. **Modo demo amistoso**: si el usuario intenta chatear sin clave, en lugar de errorar con un mensaje frío, responde con una guía detallada en español que explica cómo conseguir la clave gratis en 30 segundos.
4. **Botón "Z.ai GRATIS" en el header**: botón violeta pulsante (visible cuando no hay clave) que reabre el asistente; se vuelve verde estático con ✓ cuando la clave está configurada.

#### Cambios técnicos

##### 1. `src/types.ts` — Tipo `ModelProvider` extendido

```typescript
export type ModelProvider =
  | "ollama" | "gemini" | "openrouter" | "custom" | "openai"
  // v1.1 — cloud servers con free tiers dedicados:
  | "zai" | "groq" | "cerebras" | "together" | "mistral"
  | "deepseek" | "fireworks";
```

##### 2. `src/constants.ts` — Catálogos estáticos

- `CLOUD_PROVIDERS` extendido con `zai`, `groq`, `cerebras`, `together`, `mistral`, `deepseek`, `fireworks` (con `apiBase`, `docs`, `freeTier`, `description`).
- `ZAI_FREE_MODELS` — catálogo estático de los 5 modelos GLM gratuitos (no requiere API key para listarlos).
- `GROQ_FREE_MODELS`, `CEREBRAS_FREE_MODELS`, `TOGETHER_FREE_MODELS`, `MISTRAL_FREE_MODELS`, `DEEPSEEK_MODELS`, `FIREWORKS_FREE_MODELS`.
- `LS_KEYS` extendido con `ZAI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `TOGETHER_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `FIREWORKS_API_KEY`, y `ZAI_WIZARD_DISMISSED`.

##### 3. `src/utils/engine.ts` — `StreamConfig` extendido

Añadidos los campos `zaiApiKey`, `groqApiKey`, `cerebrasApiKey`, `togetherApiKey`, `mistralApiKey`, `deepseekApiKey`, `fireworksApiKey`. El body del POST a `/api/ai/stream` ahora envía todas estas claves al servidor.

##### 4. `backend/server.ts` — Nuevos endpoints y providers

**Endpoints nuevos:**
- `GET /api/zai/models` — devuelve catálogo estático GLM (sin key) o estático + en vivo (con key).
- `GET /api/cloud/models?provider=groq|cerebras|together|mistral|deepseek|fireworks` — catálogo estático o en vivo según proveedor.

**Ramas de provider en `/api/ai/stream`:**
- `provider === "zai"` → endpoint `https://api.z.ai/api/paas/v4/chat/completions`. Soporta visión (GLM-4.5V-Flash). **Modo demo** cuando no hay clave: responde con guía detallada en español.
- `provider === "groq"` → `https://api.groq.com/openai/v1/chat/completions`
- `provider === "cerebras"` → `https://api.cerebras.ai/v1/chat/completions`
- `provider === "together"` → `https://api.together.xyz/v1/chat/completions`
- `provider === "mistral"` → `https://api.mistral.ai/v1/chat/completions`
- `provider === "deepseek"` → `https://api.deepseek.com/v1/chat/completions`
- `provider === "fireworks"` → `https://api.fireworks.ai/inference/v1/chat/completions`

Todos usan `pipeOpenAICompatibleStream` (compartido con OpenRouter/OpenAI/Custom) y manejan errores con mensajes claros en español.

##### 5. `src/App.tsx` — Defaults + wiring

- **Default provider cambiado** de `"ollama"` → **`"zai"`** (al primer arranque, sin tocar localStorage).
- **Default model cambiado** de `"stablelm2:latest"` → **`"glm-4.5-flash"`**.
- Nuevos estados: `zaiApiKey`, `groqApiKey`, `cerebrasApiKey`, `togetherApiKey`, `mistralApiKey`, `deepseekApiKey`, `fireworksApiKey`, `isZaiWizardOpen`, `isDetectingZai`, `detectedZaiModels`.
- `fetchZaiFreeModels()` se llama **automáticamente al montar** (no requiere API key) → el catálogo GLM aparece en el selector de modelos desde el primer segundo.
- `redetectAllModels()` ahora incluye Z.ai.
- Routing inteligente en `onSelectModel`: si el modelo empieza con `glm-` → `zai`; si empieza con `llama-3.` o `gemma2` → `groq`; etc.
- `ZaiWizard` renderizado al final del JSX.

##### 6. `src/components/ZaiWizard.tsx` (NUEVO)

Asistente de 3 pasos:
1. **Por qué GLM-4.5-Flash**: bullets con beneficios (gratis, sin tarjeta, 128K, español, OpenAI-compatible).
2. **Cómo obtener la clave**: botón grande "Abrir z.ai/manage/apikey" que abre en pestaña nueva.
3. **Pegar la clave**: input password con placeholder claro, guardado automático con feedback "¡Clave guardada!".

Incluye:
- Header con gradiente violeta + badge "FREE".
- Botón "Saltar por ahora (modo demo)" para cerrar sin configurar.
- Botón "Ver todas las claves" para abrir el `ApiKeyModal` completo.
- Persistencia del flag `ZAI_WIZARD_DISMISSED` para no molestar al usuario en cada arranque.

##### 7. `src/components/Header.tsx` — Botón "Z.ai GRATIS"

- Nuevo prop `onOpenZaiWizard` y `zaiApiKey`.
- Botón violeta **pulsante** (con `animate-pulse`) cuando no hay clave configurada → se vuelve verde estático con ✓ cuando la clave ya está guardada.
- Title claro: "Configurar Z.ai (GLM-4.5-Flash) — 100% GRATIS, sin tarjeta".

##### 8. `src/components/ApiKeyModal.tsx` — Sección Z.ai destacada

- Grid de providers ampliado a 10 (con Z.ai destacado en primer lugar después de Ollama).
- Sección "0. Z.ai (GLM)" con gradiente violeta, badge "FREE TIER", explicación detallada y botón "⚡ Cargar modelos GLM".
- Sección "0.5. Groq API Key" destacada en naranja.
- Sección "0.6. Otros servidores cloud" colapsable (`<details>`) con Cerebras, Together, Mistral, DeepSeek, Fireworks.

##### 9. `src/components/ModelSelectorModal.tsx` — Soporte Z.ai

- Props nuevas: `detectedZaiModels`, `onRefreshZaiModels`, `isDetectingZai`.
- Los modelos GLM detectados se inyectan al inicio de la lista con `provider: "zai"`, descripción "Modelo GLM GRATUITO de Z.ai", marcado como vision-capable para GLM-4.5V-Flash.
- Botón "🧠 Z.ai free" en la barra de autodetección.

##### 10. `src/index.css` — Fix visibilidad del fondo de pantalla

Cuando `body.has-brain-bg` está activo:
- `body` cambia `background-color` a `transparent !important` (antes era `#000` que tapaba la imagen).
- `header`, `.bg-[#0d121c]`, `.bg-[#060912]`, `.bg-[#060a14]`, `.bg-[#05070d]`, `.bg-[#050811]`, `.bg-[#03060c]` se vuelven translúcidos (rgba con opacidad 0.65-0.75) + `backdrop-filter: blur()` para mantener legibilidad.
- Los textos `.text-zinc-100`, `.text-zinc-200`, `.text-white` reciben `text-shadow` sutil.

#### Cómo probar

1. `cd backend && bun install`
2. `bun run dev`
3. Abrir `http://127.0.0.1:3000` — el **asistente Z.ai aparece automáticamente**.
4. Clic en "Abrir z.ai/manage/apikey" → se abre la página de Z.ai en pestaña nueva.
5. Registrarse (email + SMS) → copiar la clave.
6. Pegar en el input del asistente → "Guardar y empezar a chatear".
7. El botón del header cambia de "Z.ai GRATIS" (violeta pulsante) a "Z.ai ✓" (verde).
8. Escribir cualquier mensaje → GLM-4.5-Flash responde en streaming.

#### Si el usuario no quiere Z.ai

- Botón "Saltar por ahora (modo demo)" cierra el asistente sin configurar.
- El IDE entra en modo demo: cualquier mensaje recibe una guía detallada de cómo obtener la clave.
- El usuario puede cambiar a Ollama Local (provider), Gemini (free), OpenRouter (free), etc. desde el selector de modelos.

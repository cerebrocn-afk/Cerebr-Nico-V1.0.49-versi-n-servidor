# Hoja de ruta — CerebroNico-IDE

> **Este es EL documento vivo de la ruta** (unificación v1.69.0): un archivo por
> tipo. `documentacion/ROADMAP_MAESTRO.md` quedó como histórico.
>
> **EL PLANO DE LA PERFECCIÓN** (qué falta, en qué orden, con qué evidencia se
> certifica cada tramo) vive en
> [HOJA_DE_RUTA_PERFECCION.md](HOJA_DE_RUTA_PERFECCION.md) — nacida en v1.78.1
> (26/10/2026). Aquí va la crónica; allí va el plano.

## v1.84.0 — EL ÓRGANO ENTIENDE PÁRRAFOS (HECHO · FASE 2, la última del tramo)

- **HECHO (pedido 27/10 «haz la fase 2»):** enrute HÍBRIDO del cerebro:
  0.7 similitud vectorial + 0.3 palabra, pesos ajustables, embedder inyectado
  (Ollama en produccion con ventana PROPIA de 5 s contra reloj; mapa semantico
  en los tests), vectores como cache lateral invalidada por huella, sesiones
  `cerebronico-ide-sesion-*.json` indexadas por parecido (12 mas recientes,
  saltado honesto, idempotente). El turno y `cerebro-buscar` usan el hibrido;
  embedder ausente = ruta de palabra de siempre con el fallback REGISTRADO.
  Suite `concienciaVector` 7 (la prueba del plano: parrafos sin ninguna palabra
  en comun que solo vuelven por vector). Valla nueva permanente `censoSuites`
  (ninguna suite huerfana fuera del ritual). v1.83.0 viaja fundida dentro de
  esta version (declarado en el CHANGELOG; partes viejas descartadas).
- Y la pregunta del dia, con evidencia: **el modo agente nunca fue tocado** —
  `configAgente.ts` bit a bit igual a v1.79.

## v1.83.0 — LA SUPERFICIE QUE RESPIRA + RITUAL AUTOVERIFICADO (HECHO · FASES 4 y 5 juntas)

- **HECHO (pedido 27/10 «fase 4 y 5 si podes las dos»):** regla de superficie
  generalizada (⚙ Avanzado plegado por defecto en Explorador y chat-input;
  contrato puro + fixture + suite; Ajustes PC exenta con motivo), MODO LIMPIO
  global (dueño App, botón en el chat, esconde la barra izquierda) y
  `npm run entregar` / `entregar:verificar`: el ritual de seis pasos es un
  comando que se niega solo ante faltantes, claves reales o reensamblaje roto,
  y cuyo receptor rechaza la parte corrupta NOMBRÁNDOLA (congelado sobre el
  script real). Suites `superficie` 6 + `entregaAutoverificada` 5.

## v1.82.0 — EL GOBERNADOR EN TODAS PARTES (HECHO · FASE 3 adelantada)

- **HECHO (pedido 27/10 «fase 3»):** los workers del planificador ya no son
  una constante ni un consejo: `gobernante.ts` mide núcleos y aplica
  clamp(2, núcleos-1, 8) cuando `parallel_workers` está encendida; RAM >70 %
  sostenido degrada a 1 worker con aviso; `cloud_verifier` tiene su cuota
  CERTIFICADA (timeout/fetch/ventana propios, comprobado); y el semáforo +
  workers + RAM se ven en la Hoja de Ruta Activa. Los dos «a propósito» de
  v1.76.0 quedan tachados en §6. Suite `gobernante` 7. FASE 2 (órgano
  vectorizado) sigue pendiente: el 1.81.0 la espera.

## v1.80.0 — EL RELEVO POR DISEÑO Y LA RESPUESTA ECLÉCTICA (HECHO)

- **HECHO (FASE 1 del plano + pedido 27/10 «terminá la tarea de perfección»):**
  capacidad `auto_relay` en el panel de capacidades cableada al motor
  (`capacidadesMotor.ts`: el interruptor llega sin recargar); cascada de relevo
  con TOPE 2 que hereda memoria entre patas, disparada tanto por turno vacío
  como por fallo de comunicación (`decisionRelevoPorFallo`); al agotarse el
  tope, INFORME HONESTO con la traza completa (a quién se marcó y con qué cayó)
  — nunca silencio; telemetría de sesión en consola. Suite `relevoPorDiseno` 6
  + `relevoFavoritos` actualizada a la cascada (el tope 1 era la mitad del
  diseño; declarado). P1 del plano pasa a OK.
- **HECHO (pedido 27/10 «mismo prompt a varios proveedores, varias respuestas,
  y el orquestador evalúa y da el veredicto final; modelo `cerebro/auto` por
  defecto; que la marca externa no aparezca pero su funcionamiento sí; siempre
  una va a contestar y si muchos contestan mejor será el veredicto»):**
  - `cerebro/auto`: MODELO del selector (tarjeta siempre primera, pestaña
    🎭 Ecléctico, default al arranque; quien ya eligió conserva su elección).
    El turno se intercepta en la boca única de App y va al enjambre.
  - Criterio puro `src/engine/enjambreEclectico.ts`: una voz por proveedor
    (dos ecos no son consenso); aduana (embedders/fantasmas/sin-clave fuera);
    evaluación por respuesta (vacía/rechazo/placeholder/repetitiva); consenso
    MEDIDO por similitud real; juez con JSON tolerante o consenso declarado
    «sin juez»; voz de respaldo siempre (regla de Mario) con confianza escalada
    por cuántas contestaron (1 voz ≤ 0.35, 5 = techo).
  - Llamadas paralelas por `fetchCloud` (`server/enjambreLlamadas.ts`: hereda
    reloj de primer byte y cuarentena) + rutas `/api/enjambre/{estado,
    consultar,evaluar}` (`server/routers/enjambre.ts`; 3 líneas en el monolito
    — server.ts 12.122, contrato 163 rutas/32 guards).
  - Ranura 4B rebautizada **API Unificada** (fuente única
    `src/engine/ranuraUnificada.ts`): la marca externa salió de toda la cara de
    la IDE; el export `{keys:[{platform,key}]}` sigue entrando por formato
    (comando≠clave, plataforma sin ranura se avisa). La carpeta **🧩
    Unificada** existe siempre, se autodetecta al abrir con URL cargada y trae
    botón de carga propia. Ejemplo sin secretos en
    `ejemplos/api-unificada-claves.EJEMPLO.json`.
  - Suites: `enjambreEclectico` 9, `ranuraUnificada` 4. Ritual completo verde:
    200 suites · 8223 comprobaciones · 0 fallos · `tsc --noEmit` limpio ·
    `sin-claves` limpio (y escaneo del ZIP: 0 claves reales).
- **NOTA DE ENTREGA (rev.B):** la rev.A del zip nacía con un filtro
  `-x "app/*.png"` que en `zip` cruza carpetas y se llevó 104 .png (incluidos
  los íconos de `public/`). Lección incorporada: en este proyecto las
  exclusiones del empaque se verifican listando el ZIP contra el árbol de
  origen (faltantes = 0), nunca asumiendo que el glob hizo lo que uno leyó.

## v1.79.0 — EL MANUAL DE LA PERFECCIÓN: LOS BUCLES EN SINCRONÍA CON LA RUTA (HECHO)

- **HECHO (pedido 26/10 «perfecioná los bucles en sincronía con el plan de
  ruta… al inicio se fija una ruta y se recorren sus rutas relativas; cuando
  la auto-mejora actúe, que escriba en perfeccion.md»):**
  - `manualPerfeccion.ts` (núcleo puro, sin disco/reloj): `fijarRuta` se
    llama al crearse el plan (`POST /api/brain/plan`); `recorrerRuta` se
    llama en el hook `onTareaTerminada` del `PlanRunner` — el MISMO punto
    donde el bucle termina la tarea, así plan y manual no se desincronizan.
  - La regla de la casa entra al manual: `validada` SOLO con evidencia de
    ejecución (escribir no es probar); «hecha» sin evidencia se cierra como
    `cerrada_sin_evidencia`; fallida siempre con causa.
  - La auto-mejora escribe: turno ok + lección reforzada → `POST
    /api/perfeccion` (`tipo: leccion`) → queda en `perfeccion.md` con su
    veredicto. Puerta `tipo: proceso` abierta para autovalido/ouroboros
    (veredicto verde: comando exacto + número medido).
  - Cara a disco `manualPerfeccionDisco.ts` (patrón del órgano):
    `perfeccion.json` + `perfeccion.md` en la raíz, escritura atómica,
    cargador tolerante. El manual se siembra en la entrega y el motor lo
    completa solo.
  - Suite `tests/manualPerfeccion.test.ts` (23 comprobaciones) con plaga:
    ninguna ruta `validada` sin evidencia, en ningún manual.
  - `server.ts` sin tocar (12.059 ≤ 12.187): el cable vive en el router
    `brain.ts` (trinquete) y en el engine.
  - Es la FASE 0 del plano en `HOJA_DE_RUTA_PERFECCION.md`.

## v1.78.0 — LA COLA HONESTA, EL SANDBOX EN SEGUNDO PLANO Y LA CARPETA DE LA API UNIFICADA (HECHO)

- **HECHO (queja 26/10 «todas las tareas con errores / sale el modelo
  fav-model-1792662099324-zlh7»):** el marcador automático armaba su cola con
  `f.model || f.id` — `model` nunca existió, así que marcaba al IDENTIFICADOR
  INTERNO de la carpeta ⭐: un número que ningún proveedor conoce. Ahora
  `colaDeMarcado()` (puro, en `src/utils/marcador.ts`) arma la cola con
  `modelId` real y deja afuera locales, embedders, proveedores sin clave y
  fantasmas; `favoriteModels.sanitize()` poda las entradas podridas del
  localStorage viejo EN LA FUENTE. Suite `tests/marcadorFavoritos.test.ts`
  con plaga sembrada: si `f.model || f.id` renace en App.tsx, validar se
  pone rojo. La Favoritos del selector muestra el nombre real, no el id.
- **HECHO (pedido 26/10 «quitá los botones, dejá el verde que haga todo»):**
  el tablero del sandbox muestra UN solo botón — el verde «Arrancar ahora»,
  que hace el flujo completo (piloto ON → sync → npm install si falta →
  arrancar :3500 → preview vivo; si ya está vivo, reinicia todo). El resto
  (AUTO, Sync, Pull, npm install, Detener, Reiniciar, Recargar, Forzar
  Limpieza, Abrir) vive plegado en «⚙ Avanzado» — en segundo plano, no
  borrado. El piloto ya NO se rinde solo: editor vacío o sin proyecto ⇒
  espera 60 s y reintenta (antes se apagaba hasta reiniciar el navegador).
  Migración de una sola vez (`codigo0_sandbox_auto_v178`): el «0» viejo
  dejado por aquellas rendiciones vuelve a ON; un apagado MANUAL desde
  ⚙ Avanzado sigue respetándose.
- **HECHO (queja 26/10 «no existe la carpeta de modelos custom para
  seleccionar los modelos»):** los modelos del servidor Custom/API unificada
  venían disfrazados
  de OpenAI con prefijo `custom:` y el enrutador por nombre los mandaba a
  Ollama. Ahora: lista propia `detectedCustomModels` con proveedor real
  `custom`, pestaña «🧩 Unificada» en el selector, y el selector dice el MOTOR
  de la tarjeta al elegir (segundo argumento de `onSelectModel`) — motor y
  modelo siguen siendo una sola decisión. El disfraz viejo se barre al
  detectar.
- **CONTESTADA (pregunta 26/10 «¿los embeddings para qué sirven?»):** no
  conversan; convierten texto en vectores para la MEMORIA VECTORIAL (RAG) —
  buscar recuerdos por parecido de sentido, no por palabra exacta. El
  selector los etiqueta `📎 embeddings` y PUGIL sigue impidiendo
  elegirlos para chatear.
- **NO requirió entrenamiento:** los errores no eran del modelo sino de la
  casa (números inventados al marcar y modelos disfrazados). Ninguna de
  estas correcciones se arregla entrenando: se arregló así.

## v1.77.0 — LA ADUANA DE MODELOS Y EL RELEVO A FAVORITOS (HECHO)

- **HECHO (queja 26/10 «muchos modelos no aparecen»):** aduana única
  `src/engine/aduanaModelos.ts` — los 47 del `ollama ls` entran al selector;
  los no-chat se ETIQUETAN con su motivo en vez de desaparecer; el filtro
  duplicado (proxy/front, ya divergido) murió y su regreso pone roja la suite.
- **HECHO (queja 26/10 «no hay carpeta de modelos custom»):** la ranura Custom valida
  URL con criterio puro — una carpeta no es un endpoint y el error lo dice.
- **HECHO (pedido 26/10):** `src/engine/relevoFavoritos.ts` — turno que cerró
  SIN respuesta re-pregunta el mismo prompt al siguiente cloud de ⭐ Favoritos
  (uno por turno, locales excluidos). Apagado por defecto:
  `localStorage.cn_auto_relay="1"` lo enciende.
- **PENDIENTE natural:** encender el relevo desde el panel de capacidades del
  laboratorio en vez de localStorage (la preferencia vive en el navegador
  porque la carpeta de favoritos también; moverla al motor requiere exponer
  favoritos al server — no inventar un espejo doble).

## v1.76.0 — EL LABORATORIO TIENE MOTOR (HECHO) + lo que queda a propósito

- **HECHO `auto_propose`:** contador de fallos repetidos por patrón entre
  turnos + redacción automática (`src/engine/patronesFallo.ts` puro +
  `server/propuestasAutonomas.ts` con disco). La propuesta entra por el
  escritor huérfano que ya existía (`Brain.guardarPropuesta`) y NUNCA se
  aplica sola. Umbrales: 3 turnos distintos, cooldown 7 días.
- **HECHO `hybrid_rerank`:** fusión RRF (K=60, constante pública — cero
  calibración inventada) en `src/engine/recalceHibrido.ts`, cableada en
  `LocalRAG.search` con la bandera del laboratorio. Reordena el candidateo
  vectorial; no agranda el coste en reposo.
- **PENDIENTE a propósito (no fingir):** `parallel_workers` pide 8 núcleos y
  la máquina mide 4; `cloud_verifier` vive de su config propia en
  `/api/verifier/*`, no de la bandera. Cuando el hardware o la medición
  acompañen, se motorizan con la misma regla: capa pura + test con defecto
  sembrado + cable mínimo.
- **Calibración futura de `hybrid_rerank`:** RRF no necesita pesos, pero si
  algún día se mide que el léxico debería pesar distinto, el cambio vive SOLO
  en `fusionarPorPuesto` (pesos) y su test lo exigirá con evidencia.

## v1.69.0 — EL PLANIFICADOR A PRIMER PLANO: turno = tarea = entrega

> Mario, 24/10: «ahí es donde se centra el plan o se ejecuta el contrato, plan y
> hoja de ruta con la tarea escrita por etapas y tachando la ya hecha; hasta que
> no termine no se corta o se auto pregunta para continuar el turno; hacer
> coincidir el turno con la tarea y la entrega».

- **CAZA DEL HUÉRFANO GORDO:** en la nube, `set_plan`/`update_task` chocaban con
  un stub vacío dentro de `executeToolCall` (respondían `ok:true` y no registraban
  nada). El espejo vivo, el contrato de aceptación y los eventos del Planificador
  SOLO vivían en el bucle local: once proveedores de nube ejecutaban el ciclo a
  ciegas — plan invisible, etapas sin tachar, turnos que se cortaban igual.
- **ESPEJO EN LA NUBE** (`server/cicloOpenAICompat.ts`): cada herramienta pisa su
  paso en la hoja viva; `set_plan` abre contrato + dispara `type:"plan"`;
  `update_task` tacha con evidencia y dispara `type:"update"`. Wrapper
  abrir/cerrar hoja con `finally` (ninguna salida deja hoja huérfana). B1.2
  (`notaContinuidad`) también viaja en los turnos de nube.
- **PUERTA DEL CONTRATO** en el ciclo OpenAI-compat (espejo de la «puerta de
  aceptación» de `decidirBucle`): cierre con contrato abierto o etapas sin tachar
  ⇒ el motor se AUTO-PREGUNTA (inyecta la lista `[x] [ ] [▶]` y exige seguir en
  el mismo hilo). Tope 3 (`MAX_CONTINUIDAD_PLAN`) — exigir sin tope sería el otro
  defecto. Agotado, el cierre es honesto: **PARCIAL** con la lista de lo que falta,
  nunca «Hecho». Test: `tests/contratoDeTurno.test.ts` (suite `contratoDeTurno`).
- **PRIMER PLANO** (UI): Planificador abre la barra de pestañas con categoría e
  ícono propios; nace un plan → la vista salta sola; punto ámbar mientras hay
  etapas abiertas; llega la entrega → vuelve al chat (si la pestaña la trajo el
  motor — la mano de Mario manda). TAQUERA: las etapas hechas se tachan en
  Planificador completo, mini-panel y chat.
- **MANUAL DEL MOTOR** (self-awareness): sección 9 «El Planificador y el contrato
  del turno» en `manual-completo.md` + las seis copias (nativo, texto-libre,
  mínimo, JSON, XML, LEEME) y las entradas `set_plan`/`update_task` de
  `TOOL_MANUALS` (`src/engine/manuals.ts`) — el modelo sabe desde el primer
  turno que su plan es un contrato, no un decorado.
- **PAPELEO UNIFICADO** (Mario: «que no haya varios CHANGELOG, un archivo por
  cada documento»): 10 `CHANGELOG-vX.md` absorbidos por `CHANGELOG.md` en orden;
  `CORRECCIONES-v1.56.4/8` → `CORRECCIONES.md`; informes sueltos
  (ACTUALIZACION/MEJORAS/EVOLUCION/REVISION/ANALISIS/PLAN_MITIGACION/
  INFORME-AUDITORIA) → `documentacion/audits/AUDITS_MAESTRO.md`; parches ya
  aplicados (`mejoras/`, `parches/`), manifiesto v1.53.1 y scratch (`_diag`,
  `_esp`) → `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/` (reversible).
  Script: `scripts/unificar-papeleo.mjs` (idempotente).

## v1.65.0 — EL BUCLE QUE SOBREVIVE A LOS TURNOS

> **Continuación de la Fase 3.** v1.64 hizo el bucle visible DENTRO de un turno;
> v1.65 arregla que el detector nacía vacío en cada turno y no veía el ciclo que
> el modelo repite tras un «sigue» del usuario.

- **DEFECTO SEMBRADO + FALSO POSITIVO:** el detector `contextoBucle` pasa de
  per-turno a **nivel de SESIÓN** (singleton de módulo compartido por ambas
  ramas, igual que la ventanilla de v1.62). Nueva API `abrirTurnoBucle()` que se
  llama al arrancar cada turno: conserva la secuencia y sube la racha
  `turnosEnBucle` si el turno anterior estaba en bucle sin avanzar, y CORTA al
  2º/3er turno seguido en el mismo ciclo. Falso positivo (doble): un turno con
  obra, o preguntas distintas en turnos seguidos (sin ciclo detectado), drenan
  la racha y la secuencia — nunca heredan sospecha.
- Tests: `tests/contextoBucle.test.ts` (14 ok: 10 de v1.64 + 4 cross-turno).
  `superficie --verificar` CONTRATO INTACTO (12.190/13.700), trinquete android
  157/0, `tsc`/`esbuild` OK. Versión 1.65.0 en los 4 sitios + CHANGELOG-v1.65.0.md.

## v1.64.0 — FASE 3 (ORIGINAL): EL BUCLE, VISIBLE PARA EL MODELO

> **Deuda saldada.** Esta es la Fase 3 ORIGINAL que quedó pendiente tras el
> override de la v1.63. Objetivo: que el modelo SEPA que está en bucle — no solo
> que se le corte el turno.

- **DEFECTO SEMBRADO + FALSO POSITIVO:** nuevo módulo puro
  `src/engine/contextoBucle.ts`. Detecta el CICLO que se repite — no solo una
  herramienta (periodo 1) sino un patrón ROTADO de hasta 6 pasos
  (`A→B→C→D` ×N, el caso real de v1.63). A la 2ª vuelta INYECTA en la
  conversación un mensaje visible que nombra la secuencia y ofrece 3 salidas,
  ANTES de cortar; a la 4ª vuelta hay respaldo duro (cierre honesto). Falso
  positivo cuidado: una OBRA exitosa REINICIA la secuencia (editar→probar con
  cambios reales no es bucle). El token lleva el hash de args tras `\u0000` pero
  el mensaje solo muestra el nombre. Cableado en ramas Ollama y Gemini (aviso
  SIEMPRE tras el `for` de tool_calls, nunca dentro, para no romper el
  transcript).
- Tests: `tests/contextoBucle.test.ts` (10 ok), registrada en `validar.mjs`.
  `superficie --verificar`: CONTRATO INTACTO (12.200/13.700). Versión 1.64.0
  sincronizada en los 4 sitios + CHANGELOG-v1.64.0.md. `tsc` y `esbuild` OK.

## v1.63.0 — GUARDA DE REPETICIÓN DE SOLO-LECTURA + DIAGNÓSTICO NO SE VUELCA CRUDO

> **Override del usuario.** La v1.63 ORIGINAL era la Fase 3 «contexto de bucle
> VISIBLE para el modelo». El usuario la REDEFINIÓ (override explícito) para
> atacar primero dos defectos del chat exportado; la Fase 3 original queda
> pendiente.

- **item 1 — DEFECTO SEMBRADO + FALSO POSITIVO:** nuevo módulo puro
  `src/engine/repeticionLectura.ts`. Deduplica/corta cuando la misma herramienta
  de LECTURA se llama con mismos args y misma salida N veces (aunque rote entre
  varias herramientas: el lazo suave consecutivo no lo cazaba). Falso positivo
  cuidado: la relectura legítima TRAS escribir el mismo path no se penaliza.
  Cableado en ramas Ollama y Gemini.
- **item 2 — DEFECTO SEMBRADO:** el diagnóstico (`memory_*`, `list_files`,
  `git_status`, packs externos) ya no vuelca el JSON crudo al chat. `compactor.ts`
  autodetecta el tipo y lo resume; la rama Gemini ahora también compacta.
- Tests: `tests/repeticionLectura.test.ts` (8 ok). `superficie --verificar`:
  CONTRATO INTACTO. Versión 1.63.0 sincronizada en los 4 sitios + CHANGELOG.

## v1.60.10 — `validar` EN VERDE: registrar las dos suites nuevas en el catálogo

`npm run validar` dio 1/7416 en rojo: `resiliencia.test.ts` detectó que
`rutaCanonicaEditor.test.ts` (v1.60.8) y `planEscrituraCableada.test.ts`
(v1.60.9) estaban en disco pero fuera del catálogo `SUITES` de
`scripts/validar.mjs`. Bug de proceso mío (olvidé registrarlas y empaqueté antes
de hacerlo). Arreglo: ambas suites registradas tras `arbolWorkspace`. Sin tocar
`server.ts`. Verde: resiliencia 35/35, rutaCanonicaEditor 12/12,
planEscrituraCableada 6/6. Regla: toda suite nueva → catálogo `SUITES`.

## v1.60.9 — EL PLANIFICADOR YA ESCRIBE ARCHIVOS: la mano estaba sin enchufar

Mario corrió un plan de prueba (v1.60.8, openrouter/free) y las 5 tareas de
escritura fallaron con «este contexto no tiene escritura de archivos cableada»,
dejando la #6 bloqueada. Causa raíz demostrada y honesta: NO fue el modelo (plan
válido) ni la config de Mario. `planExecutors.ts` sabe escribir/verificar desde
v1.57.3, pero la fábrica `crearEjecutorDePlanes` de `server/routers/brain.ts`
nunca inyectaba las primitivas `escribirArchivo`/`verificarArchivo`, así que el
guard de honestidad rompía toda escritura. Arreglo sin tocar `server.ts`: se
cablean ambas en `brain.ts` con el patrón de `leerArchivo` (`resolveSafePath` +
`fs` + puerta de evidencia en disco). Prueba:
`tests/planEscrituraCableada.test.ts` 6/6 (incluye guard de regresión del
cableado); `escrituraArchivo` 22/22. Mario valida él.

## v1.60.8 — EL BOTÓN DEL EDITOR NO SE TRABA: una ruta física = un solo archivo

Mario temía dos trabas del botón del editor: que el modelo «no sepa dónde está
el archivo» y que «al renderizar no estén todos los archivos». Grieta real y
demostrada: el editor materializaba rutas con `.trim()` crudo mientras el sync a
disco (`espejoSync.normalizarRuta`) sí canonizaba (`./`, `/` inicial, `\` de
Windows, `//`). Así `./index.html` e `index.html` caían en claves distintas →
dos entradas fantasma del mismo archivo y, en el preview :3500, una pisaba a la
otra. Arreglo en capa pura (`src/utils/codeParser.ts`), sin tocar `server.ts`:
toda ruta pasa por el mismo canonizador del disco al entrar al editor y
`mergeExtractedFiles` indexa/guarda la ruta canonizada. Prueba:
`tests/rutaCanonicaEditor.test.ts` 12/12; regresión verde (codeParser 18/18,
toolCallsTextuales 18/18, viaRapidaPreview 67/67). Mario valida él.

## v1.60.7 — VAL-ERR-001 CON CAUSA RAÍZ: el puente :5000 ya responde `/api/pc/info`

La bitácora de validación marcó un `404` al consultar `/api/pc/info` en el puente
:5000. Causa raíz demostrada: `server.ts` sondea esa ruta pero
`agent_bridge_5000.py` nunca la definió (su `do_GET` sólo cubría
`/api/health`, `/api/fs/*`, `/api/seguridad/estado`, `/tools`). No era puente
zombi — era una ruta faltante. Se añadió `GET /api/pc/info` (alias `/pc/info`),
informativa y sin auth, que devuelve el Escritorio real + info del entorno.
Verificado en vivo (health 200, pc/info 200, inexistente 404). No se tocó
`server.ts`. VAL-ERR-002 depende del modelo (v1.60.6); VAL-ERR-004 (no borrar
`.cerebro-db`) se respeta.

## v1.60.6 — HONESTIDAD MCP: el modelo deja de culpar al puente e inventar config

Sesión real de dev (modelo `openrouter/free`). El log de arranque mostraba 6
herramientas del puente-mcp cargadas (fs_read/fs_write/exec…), pero el modelo le
dijo a Mario que el puente «no las expuso» e inventó un arreglo falso
(`ENABLE_FS_TOOLS`, editar `agent_bridge_5000.py`). Causa real: `openrouter/free`
no tiene function-calling fiable, así que el motor no le entregó las tools a ESE
modelo — no un fallo del puente. (Aparte, el watchdog cortó a los 180s por el
modelo gratis lento; eso no es bug.)

- `src/engine/ejecucionFantasma.ts`: `guardaSinHerramientas()` ahora prohíbe
  culpar al puente/packs e inventar variables de entorno o ediciones del bridge,
  y enseña el único arreglo honesto (cambiar a un modelo con herramientas). La
  rama de `directrizEjecucionReal()` con Modo Agente PC activo deja de decir que
  «el puente no ofreció las herramientas».
- `tests/ejecucionFantasma.test.ts`: 19/19. No se tocó `server.ts`.

## v1.60.5 — DOBLE ÁRBOL VISIBLE EN EL EXPLORADOR (insignia 📥/🏗️ + PROMOVER)

Mario preguntó dónde estaba el «doble árbol» de v1.60.0: no lo veía al abrir la
app. Era cierto — ese doble árbol (`gestorArboles.ts`) vivía SOLO en el motor
del servidor (una instancia por turno, en memoria) y ningún `.tsx` lo consumía,
así que por diseño era invisible. Opción elegida por Mario: hacerlo VISIBLE en
el explorador real como UN solo árbol con una insignia por archivo (📥 Entrada /
🏗️ Sandbox) y un botón PROMOVER, SIN reestructurar el layout (menos riesgo).

- Capa pura `src/utils/arbolWorkspace.ts`: inferirArbol / insigniaArbol /
  contarArboles / marcarComoEntrada / promoverArchivo / expulsarArchivo
  (inmutables, sin red, sin fs). Campo `arbol?` en `WorkspaceFile`.
- UI: adjuntos admitidos por la aduana (`aduanaDeEntrada`, chat y editor) se
  marcan como ENTRADA; el resto queda en Sandbox por defecto. RightSidebar pinta
  la insignia por fila, el botón PROMOVER en filas de Entrada y el conteo por
  rama en la cabecera.
- `tests/arbolWorkspace.test.ts`: 26/26. Registrado en `scripts/validar.mjs`.
- No se tocó `server.ts` (trinquete intacto) ni `gestorArboles.ts`.

## v1.60.4 — PERFECCIÓN: ventana de modelos fluida + errores de nube accionables

A partir de una sesión real (log + captura + chat). Honestidad primero: la
lentitud estaba dominada por la máquina al 99.5% de CPU (45 modelos de Ollama
vivos) y el `401 User not found` de OpenRouter era una clave inválida en la
config — ninguna de las dos es un bug del IDE. Esta versión hace que el IDE se
comporte bien incluso con la máquina saturada y que el error diga qué hacer. No
se baja ningún umbral.

- **HECHO (rendimiento de la ventana de modelos):**
  - `src/components/ModelSelectorModal.tsx` · render capado a 60 tarjetas con
    aviso «Mostrando 60 de N — escribe para afinar». Búsqueda/filtros siguen
    operando sobre la lista COMPLETA; nada se oculta, solo se pinta por tandas
    (con cientos de modelos `:free` + CPU al 99% abrir/cambiar proveedor se
    sentía pegado).
- **HECHO (errores de nube accionables):**
  - `src/utils/erroresProveedor.ts` (NUEVO, puro) · `humanizarErrorProveedor()`
    traduce 401/No-auth/402/429/404 a mensaje ES accionable (revisa clave en
    Ranuras de API Keys), conservando el detalle técnico; marca
    `esConfigUsuario`.
  - `server.ts` · el fallo de OpenRouter pasa por el humanizador antes de
    `ctx.sendError` (ya no se propaga crudo).
- **HECHO (pruebas):**
  - `tests/erroresProveedor.test.ts` · 16/16 verdes.
- **Versión 1.60.4** sincronizada en los 4 sitios + CHANGELOG.

## v1.60.3 — AISLAMIENTO DE CONTEXTO TAMBIÉN EN LA LECTURA

v1.60.0 blindó la ESCRITURA; v1.60.3 cierra la lectura: el motor no carga a su
contexto material de ENTRADA que no se promovió al sandbox.

- **HECHO (gestor, capa pura):**
  - `src/gestorArboles.ts` · `validarPermisoLecturaSandbox` (ruta nueva pasa;
    entrada no promovida se deniega citando `promover_archivo_sandbox`) y
    `componerContextoSandbox` (bloque legible SOLO de lo promovido).
- **HECHO (ciclo):**
  - `server/cicloOpenAICompat.ts` · set `LECTURAS_SANDBOX` + guardián de lectura
    en `interceptarArboles()`, a la par del de escritura.
- **HECHO (pruebas):**
  - `tests/dobleArbolArchivos.test.ts` · bloques 8 (read-guard) y 9 (contexto).
- **Versión 1.60.3** sincronizada en los 4 sitios + CHANGELOG.

## v1.60.2 — FASE 2: `rag` SALE DEL MONOLITO + LA VALLA DE LA NUBE SIGUE AL CÓDIGO

Dos vallas de `validar` en rojo medían una FORMA antigua del código, no la
propiedad que vigilan. Se devuelven al verde sin tocar umbrales a mano.

- **HECHO (Fase 2 · `androidProyecto`):** el dominio `rag` (6 rutas) sale de
  `server.ts` a `server/routers/vectorRag.ts` tal cual, registrado por
  delegación (`registrarVectorRag(app, { localRag })`) sobre la misma instancia.
  `server.ts` baja de 12.228 a 12.170 líneas (< 12.191). Contrato REGENERADO con
  `node scripts/superficie.mjs`: 149 rutas intactas, «CONTRATO INTACTO».
- **HECHO (`esperaNube`):** el contador de proveedores con techo de primer byte
  dejó de exigir `await fetchCloud(` pegado (el camino de chat lo envuelve en el
  fusible `doFetch: (cuerpo) => fetchCloud(...)`). Ahora cuenta todas las
  llamadas a `fetchCloud(` y descuenta la definición: 15 ≥ 10. Las vallas de
  «sin fetch crudo» y «los nueve hosts» siguen vigilando.
- **Versión 1.60.2** sincronizada en los 4 sitios + CHANGELOG.

## v1.60.0 — SISTEMA DE DOBLE ÁRBOL DE ARCHIVOS (aislamiento de contexto)

El workspace se separa en dos proyecciones de la MISMA fuente de verdad: el
Árbol de ENTRADA (ingesta: lo que el usuario arroja/sube) y el Árbol de SANDBOX
(runtime: lo que el motor/compilación pueden leer y escribir). Lo que entra no
está en el sandbox hasta promoverlo — así el motor no carga ruido ni pisa
material ajeno a la obra.

- **HECHO (tipos y gestor, capa pura):**
  - `src/types/arboles.ts` · `OrigenArchivo`/`NodoArchivo`/`EstadoArboles`/
    `PermisoEscritura`/`AltaArchivoEntrada`.
  - `src/gestorArboles.ts` · `GestorArboles` (fuente única `ruta→nodo` + flag
    `incluidoEnSandbox`), `registrarArchivoEntrada` (auto-promueve
    `sandbox_target`), `promoverASandbox`/`expulsarDeSandbox`,
    `obtenerArbolEntrada`/`obtenerArbolSandbox`, `canonizarRuta`,
    `hashContenido`, y el guardián `validarPermisoEscrituraSandbox`.
- **HECHO (cableado):**
  - `toolRegistry.ts` · herramientas `ingresar_archivo_workspace` y
    `promover_archivo_sandbox` en el pack core.
  - `ordenDeObra.ts` · `REGLAS_ENRUTAMIENTO_ARBOLES` (regla 6) viaja al system
    prompt.
  - `server/cicloOpenAICompat.ts` · el ciclo lleva su `GestorArboles`; las dos
    herramientas son bookkeeping (sin disco) y el guardián filtra las escrituras
    de obra antes del dispatch.
- **HECHO (backend):**
  - `app/routers/arboles.py` · `POST /arboles/leer_quirurgico` (lectura por
    rango) y `POST /arboles/ejecutar_sandbox` (asyncio + timeout, anti-traversal).
    Registrado en `__init__.py` y `main.py`.
- **HECHO (pruebas):** `tests/dobleArbolArchivos.test.ts` (7 bloques) en el
  catálogo de `validar.mjs`.
- **PENDIENTE de Mario:** validar con `npm install` / `npm run validar` /
  `npm run build` y dar el veredicto.

## v1.59.1 — CABLEADO DEL MOTOR DE CERTEZA (fin de los huérfanos)

v1.59.0 dejó 8 subsistemas puros pero 7 eran HUÉRFANOS (nadie los importaba).
v1.59.1 los cablea y cierra las piezas que faltaban para que el motor fuera
usable de verdad.

- **HECHO (piezas que faltaban):**
  - `src/engine/hashArgs.ts` · `hashArgsCanonico()`/`claveInvocacion()`: huella
    canónica de args (claves ordenadas) — sin falsos negativos por reordenado.
  - `src/extraerFirmas.ts` · `extraerFirmas()`/`aislarSimbolos()`/
    `componerContextoFirmas()`: corazón real del Eje 1 (inyecta sólo firmas y
    mide el ahorro de caracteres).
  - `src/auditoriaBucle.ts` · `diagnosticarBucle()`: ciclos A-B-A-B y saturación
    de lecturas sin escritura, además de la repetición exacta previa.
  - `src/autocorrectorCompilacion.ts` · `parsearTodosLosErrores()`/
    `generarDirectivaMultiError()`: corrige TODOS los errores de un build de una
    vez, agrupados por archivo.
  - `src/autorrevision.ts` · `detectarTruncamiento()`: detección anclada a línea
    (sin falsos positivos de `// ...` dentro de cadenas).
  - `src/grafoDependencias.ts` · `construirNodoDesdeFuentes()`/`exportacionesDe()`/
    `importacionesDe()`: constructor del nodo desde las fuentes (antes a mano).
- **HECHO (orquestador):** `src/engine/gateCierre.ts` · `evaluarCierre()` — único
  punto de articulación de los 4 ejes; devuelve `{ liberar, directivas,
  telemetria }`. Primer y único consumidor de los módulos antes huérfanos.
- **HECHO (cableado):** `server/cicloOpenAICompat.ts` registra el historial de
  herramientas con hash canónico y, en el gate B4, tras `revisarObraEscrita`,
  pasa escritos+historial por `evaluarCierre()` como segunda capa de señal
  (acotada por `MAX_AUTORREVISION`) con telemetría a consola.
- **HECHO (pruebas/metadatos):** `tests/motorCertezaX5.test.ts` +6 bloques;
  versión **1.59.1** sincronizada en los 4 sitios + CHANGELOG.
- **PENDIENTE (fallos de `validar` de Mario):** `androidProyecto` (server.ts
  >12191 líneas, requiere extracción de módulo; NO bajar el umbral a mano) y
  `esperaNube` (fallo nuevo por investigar con el `validar` completo).

---

## NUEVA HOJA DE RUTA DE EVOLUCIÓN (v1.59.0) — MOTOR DE CERTEZA / VALIDACIÓN / BUCLE / CONTEXTO (x5)

Foco: endurecer el ciclo del agente con subsistemas PUROS (sin red, sin fs, sin
estado global), cada uno verificable con `npx tsx` y cubierto por
`tests/motorCertezaX5.test.ts` (registrada en `scripts/validar.mjs`).

### Eje 1 — Contexto quirúrgico y presupuesto dinámico
- **HECHO:** `src/motorContexto.ts` · `calcularPresupuestoContexto(archivos, limiteMaxChars=15000)`
  mide determinista el peso en caracteres antes del payload y, al pasar el techo,
  emite `resumenRecorteContexto` declarando peso real vs límite.
- **HECHO:** `src/resumidorContexto.ts` · `comprimirContextoHistorico(bloques, umbral=11250, actuales=15000)`
  pila de resúmenes efímeros: al superar el 75% del umbral cambia el código
  histórico por tarjetas de metadatos `[Módulo X: exporta …]`.

### Eje 2 — Detección de bucle infinito (Stuck-Tool Guard)
- **HECHO:** `src/auditoriaBucle.ts` · `detectarEstancamiento(historial, umbral=3)`
  marca 3 invocaciones idénticas (tool + argsHash) seguidas; `directivaRomperBucle()`
  inyecta la pista para cambiar de estrategia.
- **HECHO:** `src/memoriaEstrategias.ts` · `evaluarYFiltrarEstrategias(historial, enfoque)`
  veta reintentar enfoques ya fallidos (case-insensitive) con directiva de
  exclusión estricta.

### Eje 3 — Matriz de verificación cruzada y validación estructural
- **HECHO:** `src/matrizVerificacion.ts` · `verificarConsistenciaExportaciones(codigo)`
  cuenta exports nombrados y acepta `export default`; sin exports = inválido.
- **HECHO:** `src/grafoDependencias.ts` · `validarConsistenciaGrafo(nodo, nuevaFirma)`
  detecta exports perdidos que un consumidor importa por nombre y los nombra
  antes del cierre.
- **HECHO (gate de metadatos atómicos):** versión sincronizada a **1.59.0** en
  `package.json`, `src/constants.ts` (VERSION_SEMVER), `package-lock.json`
  (raíz + packages[""]) e `index.html` (×4). Version gate §12 consistente.

### Eje 4 — Auto-corrección limitada y cierre atómico (Bounded Self-Correction)
- **HECHO:** `src/autorrevision.ts` · `evaluarIntegridadPostEscritura(contenido, intento)`
  + `MAX_AUTORREVISION=2`: bloquea rellenos (`// ...`, `/* ... resto`,
  `TODO: implementar`), inyecta directiva quirúrgica y al tope declara ERROR
  CRÍTICO (nunca bucle infinito de pruebas).
- **HECHO:** `src/autocorrectorCompilacion.ts` · `parsearYConstruirParcheCompiler(output)`
  + `generarDirectivaCorreccion(err)`: extrae archivo/línea/`TSxxxx` del output
  del compilador y arma el parche directivo prioritario.

> Verificación: lógica portada a Node (harness) 23/23 aserciones OK; la suite
> `.test.ts` real la corre Mario con `npm run validar` (tsx no corre en-env sin
> `node_modules`). Todo el código es mío y lo valida Mario antes del veredicto.

---

## Registro de avance (en curso — v1.58.4)

- **A1 — HECHO (verificado en código):** la cadena backend→App→modal para los 5 proveedores
  (cerebras/mistral/together/deepseek/fireworks) está completa; el autoload al arranque los trae del
  catálogo estático aunque no haya key. Las pestañas muestran modelos elegibles.
- **A2 — HECHO:** faltaban los botones «Cargar modelos» de esos 5 proveedores en el modal
  (las props llegaban pero no se renderizaban). Agregados en `ModelSelectorModal.tsx`.
- **A3 — HECHO:** el ejecutor de planes (`server/routers/brain.ts`) adivinaba el proveedor por el
  nombre del modelo y mal-ruteaba Cerebras/Together/Fireworks/codestral (p. ej. mandaba el default de
  otro proveedor). Ahora el proveedor ELEGIDO en el panel manda, y se respeta el modelo tal cual.
  Además `server.ts`: `proveedorDesdeModeloPlan` reconoce fireworks/cerebras/together/codestral y
  `modeloNubePorDefecto` ya tiene default para together/cerebras/fireworks.
- **B1 — HECHO:** el corte por tokens (`finish_reason:"length"`) tenía presupuesto compartido con el
  anti-«voy a…». Ahora tiene su propio cupo (`MAX_CONTINUACIONES_CORTE = 6`) en
  `server/cicloOpenAICompat.ts`: una respuesta larga que corta varias veces se completa.
- **B2 — HECHO (verificado):** el contenido se emite en vivo (`ctx.sendChunk`) a medida que llega y,
  al cortar, el parcial se preserva como mensaje `assistant` + continuación «seguir sin repetir».
  No se pierde el texto.
- **ROOT FIX extra (parte de B):** Cerebras/Together/Mistral/DeepSeek/Fireworks usaban
  `pipeOpenAICompatibleStream` (paso directo, SIN bucle de herramientas ni reanudación anti-corte).
  Reconectados al mismo ciclo que Groq/Z.ai (`ejecutarCicloHerramientasOpenAICompat`). Esta era la
  causa de «se corta a la mitad y se pierde todo» justo en los proveedores que Mario habilitó.
- **B3 — HECHO:** protocolo de entrega incremental por partes para CONTENIDO largo.
- **B4 — HECHO:** gate de auto-revisión antes de cerrar el turno.

> Nota: cambios no recompilados/retesteados por pedido de Mario («ya te di los errores, no pruebes»).
> Todos reutilizan símbolos ya en uso en el mismo ámbito (patrón idéntico al de Groq).

---

> Estado del árbol en trabajo: **v1.58.3** (`package.json` y `src/constants.ts` → `1.58.3`).
> El ZIP que te entregué por partes era **1.58.2**. Es decir: en disco hay cambios de 1.58.3 que
> todavía NO están en tu último ZIP. Lo aclaro acá porque cambia el punto de partida.
>
> Regla de la ruta: **un turno = una mejora acotada + una verificación concreta**. Nada de tocar
> diez cosas a la vez. Cada turno deja el proyecto funcionando y verificable de un vistazo.

---

## Foco A — "No veo dónde elegir el modelo de Cerebras/Mistral/etc."

### Lo que encontré (importante)

El fix de este problema **YA está escrito en 1.58.3**, de punta a punta. Cadena real:

1. **Backend** `server/routers/modelos.ts` → `GET /api/cloud/models?provider=X`
   devuelve un **catálogo estático** (sin API key) para `cerebras`, `mistral`, `together`,
   `deepseek`, `fireworks` (y `groq`). Con key, combina estático + modelos en vivo.
2. **App** `src/App.tsx` tiene los estados `detectedCerebrasModels`, `detectedMistralModels`,
   `detectedTogetherModels`, `detectedDeepseekModels`, `detectedFireworksModels`, los **autocarga**
   al arranque (igual que Z.ai) y los pasa al modal (líneas ~4647-4651).
3. **Modal** `src/components/ModelSelectorModal.tsx` → la función `mergeCloudModels(...)`
   (def. ~651) se invoca 5 veces (~691-720) y mete esos modelos en la lista seleccionable.

**Conclusión honesta:** el hueco "no aparece dónde elegir el modelo" **ya debería estar tapado**
en 1.58.3. Pero ese código es mío y **no está verificado por vos**. Así que el Foco A no es
"implementar", es **confirmar y pulir**.

### Turno A1 — Confirmar que los 5 proveedores muestran modelos elegibles
- **Qué:** abrir el selector sin ninguna API key cargada y confirmar que en las pestañas
  `cerebras / mistral / together / deepseek / fireworks` aparecen los modelos del catálogo estático
  (p. ej. Mistral debe mostrar `mistral-small-latest`, `codestral-latest`, `open-mistral-nemo`).
- **Verificación:** de un vistazo, cada pestaña tiene ≥1 modelo clickeable. Si alguna sale vacía,
  el problema está en el autoload de `App.tsx` (que ese `detected*Models` quedó en `[]`), no en el modal.
- **Archivos:** `src/App.tsx` (autoload ~2203-2219), `ModelSelectorModal.tsx` (merge ~691-720).

### Turno A2 — Botón "Cargar modelos" por proveedor (con API key)
- **Qué:** verificar que al pegar la key de un proveedor y pulsar refrescar, se llame a
  `/api/cloud/models?provider=X&key=...` y la lista pase de estático a `live+static`.
- **Verificación:** con key válida, la lista crece / cambia a modelos en vivo; sin key, se queda en
  el estático. Revisar que `onRefresh{Provider}` e `isDetecting{Provider}` estén cableados al botón.
- **Archivos:** `ModelSelectorModal.tsx` (props `onRefresh*`, `isDetecting*`), `App.tsx` (handlers).

### Turno A3 — Que el modelo elegido se USE de verdad en el motor
- **Qué:** confirmar que al seleccionar, p. ej., `codestral-latest`, el request real sale al
  endpoint de Mistral con ese `model`, y no cae al default. El ruteo provider→modelo-por-defecto
  vive en `server.ts` (~3710, 3771).
- **Verificación:** una llamada de prueba manda `model: "codestral-latest"` al host de Mistral.
- **Nota:** este es el turno donde un bug se vuelve visible aunque A1/A2 estén bien.

---

## Foco B (PRIMORDIAL) — Que la tarea se entregue de a poco, se auto-revise y la llamada NO se corte a la mitad

### Lo que ya existe (base real, no partir de cero)

- `src/engine/cicloHerramientasOpenAICompat.ts`:
  - `pareceTruncado()` — detecta JSON de **argumentos** cortado (llaves/cadenas abiertas).
  - `DIRECTIVA_TRUNCAMIENTO` — cuando los **argumentos** llegan cortados, le ordena al modelo
    escribir en partes (`write_file` corto + `append_file`), no reintentar el archivo entero.
  - `techoPasosConObra()` — el presupuesto de pasos crece +2 por cada escritura OK (base 12, tope 36),
    para que una tarea de 15 archivos no muera al paso 8.
  - Guardas de repetición y de fallos de argumentos (retira herramientas tras 3 fallos seguidos).
- `server/cicloOpenAICompat.ts`:
  - **Ya reanuda en `finish_reason: "length"`** (v1.57.9, ~334-355): re-empuja el texto parcial como
    `assistant` + un `user` "continúa exactamente donde quedaste". El texto parcial se preserva en el
    contexto; no se pierde del todo.
  - Pero ese contador comparte presupuesto con el de "anuncio sin acción" (`MAX_REEMPUJES_ANUNCIO`).

### El hueco real

Lo que describís ("se corta a la mitad y se pierde TODO el mensaje/tarea") pasa cuando:
1. El corte agota el **mismo** presupuesto de re-empujes que usa el anti-"voy a…", así que una
   respuesta larga y legítima se queda sin reintentos de continuación.
2. No hay un **protocolo de entrega incremental** propio: el modelo entrega todo de una y, si no
   entra, se corta. La única guía de "entregá en partes" vive en `DIRECTIVA_TRUNCAMIENTO`, que solo
   dispara con argumentos de herramienta cortados, no con contenido largo.
3. No hay un **gate de auto-revisión** explícito (checklist "¿terminé lo pedido? ¿compila? ¿faltan
   archivos?") antes de cerrar el turno.

### Turno B1 — Separar el presupuesto de continuación-por-corte del de anuncio
- **Qué:** darle a `finish_reason:"length"` su propio contador (p. ej. `MAX_CONTINUACIONES_CORTE`,
  más alto, 4-6) independiente de `MAX_REEMPUJES_ANUNCIO`. Un corte real por tokens no debería gastar
  los cartuchos del anti-"voy a…".
- **Archivo:** `server/cicloOpenAICompat.ts` (~334-355).
- **Verificación:** forzar una respuesta larga que corte 3-4 veces y ver que continúa hasta cerrar,
  en vez de abandonar al segundo corte.

### Turno B2 — No perder el texto parcial ante el usuario
- **Qué:** confirmar que cada trozo de contenido se emite en vivo (`ctx.sendChunk`) ANTES de pedir
  continuación, para que aunque el proveedor corte, lo ya escrito quede visible y la continuación se
  concatene limpio (sin repetir).
- **Archivo:** `server/cicloOpenAICompat.ts` (lectura del stream ~168-195).
- **Verificación:** en un corte, el usuario ve el texto parcial + la continuación pegada, sin
  duplicado ni pantalla en blanco.

### Turno B3 — Protocolo de entrega incremental para CONTENIDO (no solo args) — HECHO (v1.58.4)
- **Qué:** cuando la tarea es grande (muchos archivos / respuesta larga), instruir al modelo a
  entregar por partes explícitas y cerrar cada parte con un marcador, de modo que un corte solo
  pierda la parte en curso, no todo. Extender la idea de `DIRECTIVA_TRUNCAMIENTO` al contenido.
- **Archivos:** `cicloHerramientasOpenAICompat.ts` (nueva directiva), inyección en
  `server/cicloOpenAICompat.ts`.
- **Hecho:** nuevo `DIRECTIVA_ENTREGA_INCREMENTAL` + `tareaPareceGrande(escriturasOk,
  continuacionesCorte)` (puro, determinista) en `src/engine/cicloHerramientasOpenAICompat.ts`. El
  bucle lo inyecta en `mensajes` UNA sola vez (bandera `protocoloEntregaInyectado`) en cuanto la
  tarea da señales de ser grande (≥2 escrituras sanas o un corte por tokens ya ocurrido), para no
  gravar tareas pequeñas. Ordena entregar por partes COMPLETAS (un archivo/bloque por vez, cerrado y
  válido, sin «…resto igual») y seguir solo, de modo que un corte sólo pierda la parte en curso.
- **Verificación:** `tests/entregaIncrementalAutorrevision.test.ts` congela `tareaPareceGrande`
  (0,0→no; 1,0→no; 2,0→sí; 0,1→sí; NaN→no) y la directiva. En vivo: una tarea de varios archivos
  avanza parte-a-parte; si corta en la parte 3, las partes 1-2 ya quedaron escritas en el proyecto.

### Turno B4 — Gate de auto-revisión antes de cerrar el turno — HECHO (v1.58.4)
- **Qué:** antes de dar el turno por terminado, un chequeo corto: ¿se cubrió lo pedido?, ¿quedó obra
  a medias?, ¿los archivos escritos cierran sintácticamente? Si no, re-empujar "terminá lo que falta"
  en lugar de cerrar. Ya hay piezas aprovechables: `avisarObraPendiente()`, `syntaxGuard.ts`,
  `auditoriaBucle.ts`.
- **Archivos:** `server/cicloOpenAICompat.ts` (cierre del turno),
  `src/engine/cicloHerramientasOpenAICompat.ts`, `src/engine/syntaxGuard.ts`.
- **Hecho:** el bucle guarda el estado FINAL de cada archivo escrito en el turno
  (`escritosTurno: Map<ruta,contenido>`, última escritura por ruta gana, en las dos ramas — nativa y
  textual). Antes de cantar «hecho» habiendo ejecutado herramientas, el gate llama a
  `revisarObraEscrita()` (reusa `guardFile` + `problemasBloqueantes` de syntaxGuard); si algún
  archivo quedó incompleto/truncado, empuja `directivaAutorrevision()` y vuelve al bucle en vez de
  cerrar. Acotado por `MAX_AUTORREVISION=2`: nunca es bucle. Es defensa en profundidad — aunque la
  ruta de escritura ya valide, aquí se recomprueba el estado final del turno.
- **Verificación:** `tests/entregaIncrementalAutorrevision.test.ts` congela `revisarObraEscrita`
  (HTML completo→sano; .ts con relleno→sospechoso; mezcla deduplicada por ruta; entradas sin
  ruta/contenido ignoradas) y `directivaAutorrevision` (nombra el archivo, pide COMPLETO). En vivo:
  un turno que deja un archivo a medias NO se cierra en silencio.

---

## Orden sugerido de ejecución

1. **A1 → A2 → A3** (rápido: casi todo es confirmar/pulir lo que ya está en 1.58.3).
2. **B1 → B2** (lo que ataca directamente "se corta y se pierde todo").
3. **B3 → B4** (entrega incremental + auto-revisión, lo más de fondo).

Cada turno se cierra con su verificación y recién ahí paso al siguiente. No re-testeo en masa:
vos me pasás el error puntual si algo falla y voy directo a ese punto.

## Pendiente de decisión tuya

- **Versión:** el disco está en **1.58.3**. ¿Seguimos numerando desde 1.58.3 (los turnos serían
  1.58.4, 1.58.5…) o querés que lo deje en 1.58.2 y renumere? Lo dejo como vos digas.

---

## v1.66.0 — COMPLETITUD, CANAL DE CHAT Y TURNOS QUE NO SE CORTAN (HECHO)

Tres pedidos de esta ronda, cada uno como módulo PURO nuevo + test sembrado +
control de falso positivo, registrados en `scripts/validar.mjs`:

- **Completitud web — `src/engine/plantillaDefecto.ts`** (+ `tests/plantillaDefecto.test.ts`).
  Caza el andamio por defecto que `completitud.ts` no veía: texto de relleno,
  meta/title por defecto («Descripción de futuristic.web»), imágenes marcador
  (placeholder/rotas) y secciones solo con título. Ver `ANALISIS_COMPLETITUD_WEB_v1.66.0.md`.
- **Continuidad de turno — `src/engine/continuidadTurno.ts`** (+ `tests/continuidadTurno.test.ts`).
  El modelo que dice «voy a revisar…» y corta sin actuar: detecta la promesa
  vacía (sin obra ni tool-call) e inyecta una directiva para que EJECUTE ya, sin
  esperar «sigue». Triple control de falso positivo (obra, pregunta, entrega).
- **Disciplina de chat — `src/engine/disciplinaChat.ts`** (+ `tests/disciplinaChat.test.ts`).
  El chat deja de ser un volcadero: los bloques de código van al editor y los
  comandos a la terminal, el chat queda en español contextual. El inline corto
  no se toca.
- **Ya en v1.66.0 (ronda previa):** Formato 6 de tool-call estilo atributo +
  filtro de modelos no-chat de Gemini (`formatoAtributo_v1_66_0.test.ts`).
- **Plan del techo de contexto:** `PLAN_MITIGACION_TECHO_CONTEXTO_v1.66.0.md`
  (inventario de lo que ya hay + plan por fases; implementación en próxima vuelta).

**Pendiente de cablear en tu entorno** (trinquete: no engordar `server.ts`): los
tres módulos nuevos son puros y probados; su enganche al handler está descrito en
la sección «Integración» del `CHANGELOG-v1.66.0.md`. **No se pudieron correr los
gates aquí** (sin `node_modules`/`tsx`/Node 16): la lógica se verificó con un port
`.mjs` en seco (20/20). Corré `npm run validar` en tu máquina para el veredicto
completo.

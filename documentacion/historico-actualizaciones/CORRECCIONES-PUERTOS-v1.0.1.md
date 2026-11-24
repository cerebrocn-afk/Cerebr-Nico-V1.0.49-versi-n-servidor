# Los 7 puertos, revisión integral — v1.0.1 (2026-11-07)

Documento de entrega. Va DENTRO del ZIP, junto al código que describe.

## 0. De dónde salió el análisis (y por qué el tuyo no es el mío)

Comparé árbol contra árbol, archivo por archivo (normalizando CRLF):

| Comparación | Resultado |
|---|---|
| Tu árbol (v1.0.0) vs ZIP v2.3.23 — los 7 archivos de arranque | **BYTE A BYTE IGUALES**: `electron-main.cjs`, `iniciar_todo_windows.bat`, `server.ts`, `arranqueVentanas.ts`, `interruptoresServicios.ts`, `supervisorArranque.ts`, `agent_bridge_5000.py` |
| Mismo par, resto del código | 139 archivos distintos; 13 módulos del motor son **más chicos en tu árbol** (ver §5) |
| Versión declarada | tu árbol: `1.0.0` (reescriptura oficial) · ZIP: `2.3.23` |

**Consecuencia:** el fallo que ves NO viene de tus cambios — está en la base común.

## 1. La prueba más dura: tu propio log de arranque

`log de inicio.json` (pegaste la consola del lanzador) dice, literal:

```
[INFO] Interprete Python para los packs: "C:\Users\BirdBox\Downloads\CerebroNico-IDE-v1.84.0\app\runtime\python-embed\python.exe"
npm notice run cerebronico-ide@1.84.0 predev
```

**Estás arrancando desde la carpeta `CerebroNico-IDE-v1.84.0`.** No desde este árbol.
En v1.84 el `.bat` no tenía bloque del motor :5103 ni verificación de packs, y
`autonomia.py` sólo conocía 3000/5000/5100 (se ve en tu log: lista tres puertos).
Por eso "no encienden todos": el árbol que se ejecuta es anterior a la mayor parte
de las curas. **Punto de acción número uno: borra/renombrá esa carpeta v1.84.0 o
arrancá siempre desde la instalación nueva.** Cualquier arreglo que no haga eso se
ve como "no funcionó".

Y el log muestra la otra mitad del síntoma, ya sin explicación en pantalla:

```
[CerebroNico] Restart manual del Puente 5000 solicitado...
[CerebroNico] Puente 5000 terminó (code=null signal=SIGTERM).
[CerebroNico] Puente 5000 reiniciado y listo.
[CerebroNico] Puente 5000 reiniciado y listo.        <- dos veces: doble spawn
[CerebroNico] Restart manual del Puente 5000 solicitado...   <- volviste a pedirlo
```

Eso es el §3.4: `puertoRobado` pegajoso + `restart()` con carrera.

## 2. Causa por síntoma

### "¿El 5102 no arranca?"
No es el daemon: **los cuatro daemons arrancan y responden `/health` en 200** (medido
acá, en vivo: 5000/5100/5102/5103, y `tests/exe_orquestacion_test.py` §5 lo repite).
Son tres fallas de *encendido*, no de código del pack:

1. **El .EXE nunca lo lanza.** `electron-main.cjs` sólo lanzaba el server. Los packs
   :5100/:5102/:5103 los prende `iniciar_todo_windows.bat`, y el instalador **no
   ejecuta ese .bat**. Instalación por instalador = 4 puertos de 7.
   Curiosidad honesta: esto **ya estaba vallado** y la valla se ignoraba:
   `tests/exe_orquestacion_test.py` exigía `arrancarDaemonsPython`, `isPortUp`,
   `pythonEmbebido`, `estadoServicios…` y daba **16 rojos**. Ahora da 0.
2. **El reanimado moría al nacer** (esto es "un py se abre y se cierra"):
   `registrarSupervisorArranque(app, { raizProyecto: PROJECT_ROOT … })` — y
   `PROJECT_ROOT` es la raíz de DATOS (`C:\Cerebronico`). El shim escribe
   `cd /d <esa raíz>` y ejecuta `scripts\creador_daemon.py` **con ruta relativa**:
   ese archivo no está ahí. Cada intento del supervisor era una ventana que nacía,
   fallaba y se cerraba. Con Python del sistema (sin `runtime\python-embed`) era
   peor: `CN_PYTHON` no se definía y Windows entregaba el `.py` a la **asociación
   de archivos**. → `raizProyecto: process.cwd()` + `CN_PYTHON` en las tres ramas.
3. **El lanzador no miraba si :5102 había nacido**: :5100 tenía bucle de espera,
   :5102 y :5103 saltaban directo al paso siguiente.

### "¿Por qué un py se abre y se cierra?"
Dos causas, ambas curadas: el reanimado con raíz equivocada (arriba) y **la ventana
que era el proceso**: con `start /b` no hay ventana, así que la que parpadea es la
del reanimado o la asociación de archivos. Y el log que debería haberlo contado
salía **vacío** porque Python bufferiza al redireccionar → `PYTHONUNBUFFERED=1` y
`-u` en el puente.

### "El 5000 se cae, no muy seguido (y a veces no vuelve)"
Tres capas, todas adentro del mismo ciclo:
1. `puertoRobado` se ponía en `true` al primer `EADDRINUSE` y **nunca** volvía a
   `false`; el `exit` lo traduce en `restartCount = MAX_RESTARTS`. O sea: una sola
   tormenta de puerto en la historia del proceso y el :5000 quedó sin autocura
   permanente. Se limpia en cada `spawnBridge()`.
2. `restartCount` no decaía nunca: cinco caídas *repartidas en semanas* agotaban
   los reintentos. Ahora vivir más de 60 s sanos resetea la seguidad.
3. Adentro del puente, `serve_forever()` corría al aire libre: un `OSError` del
   accept (`WinError 10024`, `EMFILE`) mataba **el proceso entero**. Ahora hay lazo
   de reapertura con anuncio, backoff y techo de 10. **Probado rompiéndolo a
   propósito**: `tests/puente_autocura_test.py` inyecta el fallo y exige que el
   proceso siga vivo, que el aviso salga con tipo y motivo, y que `/health` vuelva
   a contestar solo (7/7 verdes).
4. Extraído del log: `restart()` manual tiene una carrera (`userCancelled = false`
   800 ms depois, antes de que el `exit` dispare) que produce **doble spawn** — las
   dos líneas "reiniciado y listo". No lo toqué: necesita prueba de tiempo real y
   preferí no meter un cambio sin valla. Queda como deuda declarada.

## 3. Indicadores: ¿están bien cableados?

| Superficie | Antes | Ahora |
|---|---|---|
| Cabecera (`Header.tsx`) | 7 chips, todos por `chipPuerto` (v2.3.1) ✓ | idem + rótulos corregidos: `:3500` decía "Backend de agentes", `:5000` "Microservicios/FastAPI" |
| Telón de arranque (`BootSplash` + `/api/health/deep`) | 7 filas (v2.3.12) ✓ | sin cambios |
| **Hoja de ruta / barra de Tareas → Servicios** | **5 filas** (salía de `SERVICIOS_VENTANA`) | **7**: nuevo `INVENTARIO_SERVICIOS` = plano (2 CMD + 3 PY, contrato intacto) + motor :5103 + sandbox :3500 |
| Supervisor (`/api/arranque/estado`) | medía 5, reavivaba 4 | **mide 7** y reaviva 5 (front y sandbox no se reavivan a sí mismos, cada uno con su motivo: `noVigilado`) |
| Telemetría (`/api/telemetry/ports`) | 6 sondas + `port3000: true` ✓ | sin cambios (la valla `indicadorServicios` exige el literal de `setTelemetry` y no se toca) |

Regla que se conservó: **sin medición no hay afirmación** (`arriba` / `abajo` /
`sin-medir`); el :5103 sigue gris mientras nunca nació y rojo cuando se cae.

## 4. Qué se tocó (11 archivos + 2 suites nuevas)

`src/engine/arranqueVentanas.ts` (+`SERVICIOS_ADICIONALES`, `INVENTARIO_SERVICIOS`,
`puertosDelInventario`, campo `noVigilado`, `serviciosVigilados` sobre el inventario,
`"sin-ventana"`) · `src/engine/interruptoresServicios.ts` (inventario + `sandbox`
inmutable + `razon` honesta) · `server/routers/supervisorArranque.ts` (recorre 7) ·
`server.ts` (5 ediciones **sin sumar una línea**: el monolito está al tope del
contrato, 12.210) · `electron-main.cjs` (orquestación completa del EXE) ·
`iniciar_todo_windows.bat` (orden, 2 bucles de verificación, ancla de puerto,
`PYTHONUNBUFFERED`, `CN_PYTHON` en las 3 ramas, inventario medido de los 7, subrutina
`:chequeo`) · `agent_bridge_5000.py` (autocura + `timeout` de conexión) ·
`src/components/Header.tsx` (rótulos) · `scripts/validar.mjs` y `package.json`
(suite nueva + `npm run test:puente`) · versión 1.0.0 → 1.0.1 ·
`CHANGELOG.md`, `memoria.md` · **nuevas**: `tests/puertosCableados.test.ts`,
`tests/puente_autocura_test.py`.

## 5. "Cosas de más" que encontré en tu árbol (nada borrado: es tuyo)

- **13 módulos del motor más chicos que en el ZIP v2.3.23** — tu árbol se quedó
  atrás acá (no es un defecto de puertos, pero es la respuesta a "¿qué más hay?"):
  `conciencia.ts` 368 vs 607 · `manuals.ts` 263 vs 531 · `motorContexto.ts` 1022 vs
  1180 · `kbMotor.ts` 470 vs 477 (435 líneas distintas) · `knowledgeBase.ts` 423 vs
  505 · `parchesSemilla.ts` 299 vs 376 · `dependenciasProyecto.ts` 282 vs 356 ·
  `importChecker.ts` 282 vs 304 · `grafoProyecto.ts` 168 vs 231 · `recetarioUI.ts`
  150 vs 194 · `kbArquitectura.ts`, `kbCodigo.ts`, `kbPoderX50.ts`. Decidí **no**
  pisarlos: son tu línea 1.0 y la diferencia puede ser tuya a propósito. Si querés,
  los traigo del ZIP en una pasada aparte, archivo por archivo, con diff.
- **51 archivos de trabajo en la raíz** (`_diag-*.mjs`, `_f18-*.cjs`, `_tmp_*.cjs`,
  `_suites*`, `_sonda_5102.py`, `_build.log`, `__init__.py`) y 6 baterías de
  `ACTUALIZAR-A-*.bat` / `FIJAR-VERSION-*.bat`. Suman 342 archivos sobre el ZIP,
  junto con `.cerebro-papelera/`, `.proyectos/`, `.cerebro-db/rescate/`,
  `scripts/.cerebro-papelera/`, `tests/_diag_horma*.{ts,mjs}` y `__pycache__`.
  **No los borré.** Están en el ZIP tal como los tenés. Cuando quieras, hacemos la
  limpieza con valla (`cn-cazar-codigo-muerto`) y sin tocar estado real.
- En el ZIP de entrega sólo saqué los `__pycache__/` (bytecode regenerable).
- Tu árbol tiene **dos bloques `BLOQUE-DINAMICO:ESTADO`** en `memoria.md` (líneas 13
  y 242). El deriva-documental choca contra ambos; actualicé los dos, pero la
  duplicación en sí merece una mirada.

## 6. Cómo verificarlo en tu Dell (en orden)

```
npm run test:exe          <- antes 16 fallos, ahora TODO CORRECTO
npm run test:puente       <- rompe el lazo del :5000 a proposito: 7/7
npx tsx tests/puertosCableados.test.ts     <- la valla nueva (el cable de los 7)
npm run validar           <- la valla maestra (incluye la suite nueva)
arranque:diagnostico      -> npm run arranque:diagnostico   (LOS SIETE, por consola)
```

Arrancá **siempre** con `iniciar_todo_windows.bat` de esta carpeta (no la v1.84.0).
Ahora el lanzador imprime, puerto por puerto, `[ARRIBA]` / `[APAGADO]` y dónde está
el log de cada pack; y si :5102 o :5103 no contestan en 12 s / 8 s lo dicen en la
consola en vez de dejar el panel en STANDBY.

## 7. Estado real de las vallas (lo verde y lo rojo, sin maquillaje)

Corrido en este árbol, suite por suite:

| Suite | Resultado |
|---|---|
| `tests/puertosCableados.test.ts` (**nueva**) | **72 · 0** |
| `tests/puente_autocura_test.py` (**nueva**, `npm run test:puente`) | **7 · 0** |
| `tests/exe_orquestacion_test.py` (`npm run test:exe`) | **0 fallos** (antes **16**) |
| `arranqueVentanas` | 25 · 0 |
| `indicadorServicios` | 27 · 0 |
| `reavivarServicio` | 54 · 0 |
| `telemetriaHonest` | 19 · 0 |
| `lanzadorRepliegue` | 27 · 0 |
| `puertosArranque` | 72 · 0 |
| `arranqueElectron` | 30 · 0 |
| `bajoConsumo` | 84 · 0 |
| `derivaDocumental` | 38 · 0 |
| `rutasSistema` | 136 · **1 en rojo** |

### El rojo de `rutasSistema` NO es de los puertos: es tu reescritura de versión

`tests/rutasSistema.test.ts:100` exige `IDE_BRAND.SEMVER >= 1.86.3` ("este mapa nace
ahí"). Tu árbol declara 1.0.1 — antes de esta entrega declaraba 1.0.0 — así que
**ese rojo ya estaba antes de tocar nada**: es el piso de versionado que quedó del
linaje 1.x/2.x y que tu reescritura a 1.0 invalidó.

No lo bajo por mi cuenta: una valla que baja su propio piso deja de ser valla.
La decisión es tuya, y el cambio es una línea (100), dos opciones honestas:

1. **Reconocer el nuevo linaje** (recomendado): reemplazar la comparación por el
   piso real de la casa nueva, p. ej. `>= 1.0.1`, y anotar al lado por qué
   («linaje reescrito a 1.0 por Mario, 6/11 — el piso 1.86.3 pertenece al linaje
   anterior, no a este»).
2. **Volver a numerar**: si 1.0 era una etiqueta de marketing y el linaje sigue
   siendo 2.3.x, se restaura `VERSION_SEMVER` y el rojo desaparece solo.

Mientras no elijas, el rojo queda a la vista. Es exactamente el tipo de cosa que
no hay que tapar para que el panel salga verde.

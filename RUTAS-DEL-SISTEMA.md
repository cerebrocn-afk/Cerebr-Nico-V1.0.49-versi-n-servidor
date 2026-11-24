# RUTAS DEL SISTEMA CerebróNico — dónde vive cada cosa

**v2.1.7 · corroborado v1.0.20.** Este archivo es la versión PARA HUMANOS del mapa que el motor le inyecta a
**todo** modelo en cada turno. La versión canónica es código:
`src/engine/rutasSistema.ts` → `MAPA_DE_RUTAS`, que viaja en el *abordaje*
(`src/engine/abordaje.ts`) justo después de `CONTRATO_DE_ACCION` y **nunca se recorta**
(categoría `P0·rutas`).

> La regla de la casa: si un modelo tiene que adivinar una ruta, escribe en el lugar
> equivocado o declara que un archivo no existe. Y en Windows esa adivinanza ya mató el
> :3500 dos veces. Por eso el mapa se inyecta, no se documenta y se reza.

`tests/rutasSistema.test.ts` verifica que **este documento y el módulo no se separen**:
cada ruta, carpeta, variable y puerto que el módulo le enseña al modelo tiene que
aparecer acá, y las carpetas nombradas tienen que existir de verdad en el árbol.

**No confundir con** `SUPERFICIE_RUTAS.md`: ahí «rutas» son endpoints HTTP
(`/api/...`). Este documento habla del **sistema de archivos**.

---

## 1. Los dos árboles (el error que más caro salió)

Hay **dos** árboles y un modelo que los mezcla destruye trabajo ajeno:

| | **Instalación del IDE** | **Raíz de datos** |
|---|---|---|
| Qué es | El programa: `app/` con `package.json`, `server.ts`, `dist/` | El terreno de trabajo: proyectos, bóveda, memoria |
| Quién escribe | Solo el desarrollador, a mano | El motor, el sandbox y los modelos |
| Default | — | `<instalación>/.proyectos` |
| Con `PROJECT_DIR` | — | exactamente lo que diga `PROJECT_DIR` (en Windows: `C:\Cerebronico`) |

**El árbol de la instalación** (lo que ves al descomprimir; el modelo **no** escribe acá):

| Ruta | Qué es |
|---|---|
| `src/` | motor y UI en TypeScript (lo que se transforma) |
| `server/` | rutas HTTP del servidor (`server/routers/*.ts`) |
| `dist/` | salida del build (`dist/server.mjs`). Se regenera: **no se edita a mano** |
| `runtime/` | `python-embed`: el intérprete de los packs externos |
| `scripts/` | `validar.mjs`, daemon del creador, empaquetado |
| `manual-motor/` | manual de cada herramienta, por familia |
| `docs/` y `documentacion/` | manuales y fases (humanos) |

**Dentro de la raíz de datos** (ahí sí se escribe):

| Ruta | Qué es |
|---|---|
| `<nombre-del-proyecto>/` | un proyecto por carpeta, **hija directa** de la raíz de datos |
| `.cerebro-db/` y `.cerebronico/` | estado que se migra entre versiones (bóveda, salud de espejos, conocimiento). **No es un proyecto** |
| `cerebro/` | la .con-ciencia: `indice.json` y las notas `.md` por tema. **No es un proyecto** |
| `.creador/` | sitios generados por el creador web (`:5102`) y su historial |

---

## 2. La pregunta del nivel: ¿`.proyectos/<nombre>` o `<raíz>/<nombre>`?

Las dos formas circularon en los logs y **no son intercambiables**. La respuesta
verificada, con fuente:

- El motor resuelve la raíz así: `PROJECT_ROOT = PROJECT_DIR || <cwd>/.proyectos`
  (`resolverRaizDatos`, `src/engine/raizDatos.ts:66-73`; usado en `server.ts:681-691`).
- El **proyecto** se resuelve **dentro** de esa raíz con
  `resolverRaizProyecto(PROJECT_ROOT)` (`src/engine/projectPorter.ts:93`, llamado en
  `server.ts:1270`): toma la propia raíz o **una subcarpeta suya**.

De ahí el nivel real:

| Situación | Dónde cae un proyecto llamado `mi-app` |
|---|---|
| Sin `PROJECT_DIR` (default) | `<instalación>/.proyectos/mi-app/` |
| Con `PROJECT_DIR=C:\Cerebronico` | `C:\Cerebronico\mi-app\` |
| Con `PROJECT_DIR=C:\Cerebronico` y `mi-app` ya instalado en la raíz | el proyecto **es** `C:\Cerebronico\` (la raíz tiene el marcador, pesa ≥ 70) |

Consecuencia práctica, y es la que produce el «creé el archivo y no aparece»:
escribir `.proyectos/mi-app/...` **con `PROJECT_DIR` puesto crea un nivel de más** que
el resolutor nunca mira. Conviene trabajar con rutas **relativas a la raíz del sandbox**
y, ante la duda, listar antes de crear (`list_files` lo dice: la raíz migrada es
`C:\Cerebronico`, no `.proyectos`).

---

## 2-bis. Qué sirve el sandbox `:3500` (verificado en disco el 2026-11-09)

El servidor estático del sandbox recibe **una sola raíz** y sirve SOLO esa
carpeta. Esa raíz es la **raíz de datos**, no la instalación:

```
:3500  ──sirve──▶  C:\Cerebronico\            ← raíz de datos
                   ├── juego-autos\           ← un proyecto = carpeta hija directa
                   ├── .cerebro-db\           ← estado (NO es proyecto)
                   ├── .cerebronico\          ← estado (NO es proyecto)
                   ├── cerebro\               ← la .con-ciencia
                   ├── .creador\              ← sitios del creador web
                   └── vendor\                ← three.js compartido
```

Consecuencias prácticas:

1. Para que algo se vea en el preview, el archivo debe estar **dentro de
   `C:\Cerebronico`**, en una carpeta hija directa.
2. La URL es `http://localhost:3500/<carpeta>/index.html`.
3. `vendor/` está en la raíz de datos, **un nivel arriba** de los proyectos.
   Por eso un proyecto en `juego-autos/` referencia three con
   `../vendor/three/three.module.js` (con `..`) y NO con `./vendor/...`.
   Si el proyecto se mueve de profundidad, hay que reescribir esa ruta.

**Comprobar la raíz efectiva sin adivinar:** `GET http://localhost:3500/__cn_info`
devuelve la raíz real y los duplicados. Si no coincide con `C:\Cerebronico`,
el sandbox arrancó con otra `PROJECT_DIR`.

**El error que costó este turno:** el juego se escribió primero en
`C:\Users\BirdBox\Downloads\CerebroNico-IDE-v1.0.13\juego-autos\` (la
instalación). Los archivos existían y `dir` los mostraba, pero el `:3500` no
los servía porque sirve otra raíz. Síntoma exacto: «en el árbol del editor no
hay nada». La prueba de verdad es `dir /s /b` en disco, no la lista del panel
(el explorador cachea la vista).

---

## 3. Contrato de entorno (las variables que mueven las rutas)

| Variable | Qué cambia | Fuente |
|---|---|---|
| `PROJECT_DIR` | raíz de datos del motor. **Vacía o con solo espacios no cuenta** → cae al default | `raizDatos.ts:70-71` |
| `CN_PROJECT_DIR` | la misma raíz para el puente Python `:5000` | `agent_bridge_5000.py:39` |
| `CN_CREADOR_ROOT` | dónde guarda sus sitios el creador web (`:5102`) | `scripts/creador_daemon.py:52-53` |
| `CN_HINDSITE_MIRROR` | archivo del espejo de memoria (`:5100`) | `scripts/hindsight_daemon.py:64-68` |
| `CN_BOVEDA_RAIZ` | dónde cae la bóveda de claves | `src/engine/bovedaLocal.ts:26` |
| `CN_CEREBRO_MOTOR` | ruta de `cerebro_motor.py` que lanza el arranque (bloque `4f-bis`) | `iniciar_todo_windows.bat` |
| `HINDSITE_API_URL` | a qué motor apunta el daemon `:5100` (default `http://127.0.0.1:5103`) | `scripts/hindsight_daemon.py` |
| `CN_CEREBRO_DB` | carpeta del almacén del cerebro; **si falta**, cae a `<raíz de datos>/.cerebro-db` | `scripts/cerebro_motor.py` |

Si `PROJECT_DIR` y `CN_PROJECT_DIR` **no coinciden**, el almacenamiento se parte en dos:
el motor escribe en un lado y el puente en el otro, con dos sandboxes que parecen andar.
El lanzador `iniciar_todo_windows.bat:59-67` las fija juntas (`CEREBRONICO_DATOS=C:\Cerebronico`
→ `PROJECT_DIR` → `CN_HINDSITE_MIRROR` → `CN_CREADOR_ROOT`); `CEREBRONICO_DATOS` **no** la
lee el motor, es solo un paso del lanzador.

**Bóveda de claves:** `C:\CN` (Windows) · `~/CN` (resto), cambiable con `CN_BOVEDA_RAIZ`.
**Espejos personalizados:** `C:\Cerebronico\.cerebronico\espejos\` — **derivada de la raíz de
datos**, no de la home. La fuente canónica es `raizEspejosPersonalizados()`
(`src/engine/rutasSistema.ts`) y el cargador operativo es `server.ts:4995`
(`path.join(PROJECT_ROOT, ".cerebronico", "espejos")`). No es la raíz de datos: es solo
donde caen los espejos definidos por el usuario.

### Las dos raíces, en detalle (v2.1.2 · opción b)

El mapa que viaja en el system prompt (`MAPA_DE_RUTAS`) nombra **la forma canónica**
`~/.cerebronico/espejos/` porque es la que un modelo entiende sin expandir, y porque
nombrar las dos raíces costaba 67 caracteres contra un déficit de 58 en el techo de
3000 del mapa. El detalle vive acá, igual que `CN_CEREBRO_MOTOR`, `CN_CEREBRO_DB` y
`HINDSITE_API_URL`: **el mapa es el índice, no el manual.**

| SO | Raíz de datos | Espejos personalizados |
|---|---|---|
| **Windows** | `C:\Cerebronico` (lo fija `iniciar_todo_windows.bat:59-67`) | `C:\Cerebronico\.cerebronico\espejos\` |
| **resto** | `<instalación>/.proyectos` (default del motor, sin lanzador que la mueva) | `<instalación>/.proyectos/.cerebronico/espejos/` |
| **SO sin determinar** | el mapa usa la forma canónica; **no adivina** | `~/.cerebronico/espejos/` |

**La constante y el cable son dos cosas distintas, y ahora está escrito cuál es cuál:**

- `RUTA_ESPEJOS_CANONICA` = `"~/.cerebronico/espejos/"` → **lo que dice el mapa**.
- `RUTA_ESPEJOS_PERSONALIZADOS` = `raizEspejosPersonalizados("windows")` → **la derivada
  real** (`C:\Cerebronico\.cerebronico\espejos\`), que es lo que lee el cable
  `server.ts:4995` con `path.join(PROJECT_ROOT, ".cerebronico", "espejos")`.

Que el mapa diga la forma canónica **no vuelve a mentir al cable**: el cable nunca
leyó la constante del mapa, lee la derivada. La mentira de v2.1.1 era otra — el mapa
decía `~` y el cable leía `PROJECT_ROOT`, y en la máquina de Mario coincidían por
casualidad. Ahora el mapa dice la forma canónica a propósito y el doc dice la real.


> **v2.1.2 — el prompt dejó de mentir.** Antes decía `~/.cerebronico/espejos/`, un literal
> con `~` que en Windows no se expande. En la máquina de Mario coincidía por casualidad con
> la ruta real; en cualquier otra instalación el modelo mandaba al usuario a la home, el
> cargador no miraba ahí nunca y el síntoma era el ya conocido: carpeta «vacía» y nadie se
> queja. Que la constante no la importara nadie no la volvía inofensiva: la volvía
> **invigilable**. Ahora deriva de la raíz de datos, como la bóveda.

---

### 3-bis. Dónde vive Ollama: `OLLAMA_HOST` NO es una dirección a la que llamar (v2.2.2)

`OLLAMA_HOST` es la variable con la que **Ollama elige dónde escuchar**. El
`iniciar_todo_windows.bat` la pone en `0.0.0.0:11434` para aceptar red. Nuestro
server la copiaba tal cual para **salir a llamarla**, y así searmaba un destino
imposible: `0.0.0.0` no es un sitio al que conectarse y el valor no lleva
protocolo. Los cuatro síntomas de un solo bicado: «servidor local caído»,
«no cargan los modelos», «el embedding no carga» y «el mensaje no sale».

Desde v2.2.2 la dirección se interpreta en `src/engine/direccionOllama.ts`
(puro, con valla propia `tests/direccionOllama.test.ts`) y **el arreglo se grita
en el arranque**. Reglas, en orden:

| variable | significado | qué hace la casa |
|---|---|---|
| `OLLAMA_URL` | destino de nuestras llamadas (la nuestra, sin ambigüedad) | manda sobre `OLLAMA_HOST` |
| `OLLAMA_HOST` | interfaz de ESCUCHA de Ollama | `0.0.0.0`/`::` se reemplazan por `127.0.0.1` y se avisa |
| — | sin protocolo | se antepone `http://` |
| — | sin puerto | se asume `11434` |
| `localhost` | puede resolver a `::1` | se fija a `127.0.0.1` (Ollama levanta en IPv4) |

Y una cosa más, medida y no supuesta: `/api/ollama/models` abortaba a **3,5 s**,
que en Windows con disco frío y 44 modelos no alcanza. Ahora el plazo es
`CN_PLAZO_TAGS_MS` (9000 por defecto) y la respuesta vacía **dice a dónde se
llamó**, porque un `{ models: [] }` con HTTP 200 obligaba a adivinar.
Para medir en vez de suponer: `npm run sonda`.

## 4. Puertos propios (de `PORTS`, `src/constants.ts`: una sola verdad)

| Puerto | Dueño |
|---:|---|
| `3000` | IDE |
| `3500` | sandbox / preview — **jamás 3000**: el proyecto del usuario se sirve en 3500 |
| `5000` | puente Python a la PC (`pc_exec`, `pc_list_dir`, almacenamiento) |
| `5100` | memoria (hindsight) — daemon que **lee del motor `:5103`** |
| `5102` | creador de sitios |
| `5103` | **motor del cerebro** (`cerebro_motor.py`): hechos, páginas, consolidación |
| `11434` | Ollama local (apagado por defecto: satura la RAM) |

**El motor `:5103` y el daemon `:5100` son dos órganos distintos.** El daemon no guarda
nada: consulta al motor por HTTP (`HINDSITE_API_URL=http://127.0.0.1:5103`) y, si el motor
no responde, cae al espejo local sin romperse. El botón «Reconectar» **no** reanima
ninguno de los dos: los levanta el lanzador (bloque `4f-bis`).

Si un puerto no responde: el botón **«Reconectar»** reanima el puente `:5000` y la
telemetría (no los demás); el preview `:3500` se levanta arrancando el sandbox
(`/api/sandbox/start`). La pestaña **Puertos** muestra el estado real. No matar procesos
a mano: el servidor vuelve a spawnear lo suyo y el resultado es una carrera.

**v1.0.20 — dónde se ve y qué dice ahora.** El botón «Reconectar» de la **Hoja de
ruta** es el mismo `handleReconnectAll()` de `App.tsx` (POST `/api/bridge/restart`,
POST `/api/telemetry/refresh`, `checkTelemetry`, `fetchInstalledModels`); no hay un
segundo gesto. La hoja lista **sólo los puertos caídos** y, por cada uno, **qué se
pierde**: `:3000` el chat no habla con el motor · `:3500` no hay vista previa ·
`:5000` no se lee ni escribe en la carpeta vinculada · `:5100` el agente no puede
ejecutar lo que escribe · `:5102` el sandbox queda sin segunda vía · `:11434` los
modelos de la casa (y los de pago manejados desde acá) van sin índice ni
pre-chequeo. Con todos arriba, una sola línea en verde. Fuente de la decisión:
`src/engine/hojaDeRuta.ts` (puro) → `tests/hojaDeRuta.test.ts`,
`tests/hojaRutaFormatoChat.test.ts`. Los «para» y «se pierde» de la hoja salen de
los textos de `src/engine/brechaArranque.ts` (`avisoDeInferenciaLocal`), que es la
autoridad de *qué se rompe cuando el :11434 cae*.

### 4-bis. Cómo se entrega al sandbox (v1.0.14 · el envío no se busca, ya está)

El paso que las sesiones perdían media hora era «enviar el trabajo al sandbox»:
no existe tal envío. `write_file` / `edit_file` / `append_file` sobre la carpeta
vinculada **son** la entrega: el motor resuelve la ruta contra `PROJECT_ROOT`
(§3, nivel verificado) y `:3500` sirve exactamente esa carpeta. No hay endpoint de
subida ni que buscar. Para ver el resultado: `GET /api/sandbox/status` (estado y
raíz servida) → `POST /api/sandbox/start` con `{"destino":"<proyecto>"}` si no está
vivo o sirve otra cosa (guarda-zombie mediante, `server/sandboxArranque.ts`).
Si lo servido no es lo escrito: `GET /__cn_info` en el :3500 muestra la raíz
efectiva. Fuente: `src/engine/rutasSistema.ts` (el mapa canónico) y `server.ts`.

---

## 4-ter. Corroboración de rutas (v1.0.20) — quién es la autoridad de cada camino

Un puerto abajo no es un dato suelto: es una **ruta** que dejó de contestar. Esta
tabla es la que usa la Hoja de ruta para decir «qué se pierde», con la fuente de
cada afirmación. Si una fila de acá no coincide con el código, el error está en el
código, no en el mensaje.

| Camino | Autoridad (código) | Qué se pierde si no contesta |
|---|---|---|
| `:3000` → `/api/*` del IDE | `server.ts` | el chat no habla con el motor |
| `:3500` → raíz de datos | `server/sandboxArranque.ts` + §2-bis de este documento | no hay vista previa (y sirve OTRA carpeta si la raíz cambió) |
| `:5000` → puente Python | `agent_bridge_5000.py`, `CN_PROJECT_DIR` | no se lee ni escribe en la carpeta vinculada |
| `:5100` → daemon de memoria | `scripts/hindsight_daemon.py`, `HINDSITE_API_URL` | sin memoria recuperable; cae al espejo local |
| `:5102` → creador de sitios | `scripts/creador_daemon.py`, `CN_CREADOR_ROOT` | sin segunda vía del sandbox (sitios) |
| `:11434` → Ollama | `src/engine/direccionOllama.ts` + §3-bis | modelos de la casa sin índice ni pre-chequeo; el embedding no carga |

Reglas de lectura, para no volver a adivinar:

1. **Un puerto vivo no se anuncia.** La hoja sólo nombra lo que está abajo; una
   lista de seis verdes no informa nada y tapa la falla real.
2. **Cada caída dice qué se pierde.** `:11434 abajo` a secas no dice si el
   problema es «no hay modelos» o «no hay índice».
3. **La raíz servida se pregunta, no se supone.** `GET :3500/__cn_info` devuelve
   la raíz efectiva (§2-bis). Un «creé el archivo y no aparece» sin esa pregunta
   es una adivinanza.
4. **La ruta absoluta se fabrica con `fileURLToPath`** (§7). Un camino con
   `/C:/…` hace que un `.ts` perfecto «no contenga el patrón».
5. **El arranque no es el único camino.** Antes de culpar a una ruta, mirar el
   arranque: `tests/arranquePuertos.test.ts` (18/18) cubre que cada puerto se
   sondee y se anuncie como corresponde; `tests/brechaArranque.test.ts` (14/14),
   que la inferencia local caída se explique en vez de dejar al usuario a ciegas.

El botón «Reconectar» **no** levanta `:5103` (motor del cerebro) ni `:5100`
(daemon): esos los arranca el lanzador (bloque `4f-bis`). Tampoco `:3500`: eso es
`POST /api/sandbox/start`. Lo que sí reanima es el puente `:5000` y la telemetría.

---

## 5. Mudanza de raíz: qué se lleva y qué no

Al cambiar la raíz, lo que **no se regenera** son las carpetas de estado
`CARPETAS_DE_ESTADO = [".cerebro-db", ".cerebronico"]`. `decidirMigracion()`
(`raizDatos.ts:106-125`) aplica cuatro reglas, en orden:

1. **misma raíz** → no hay mudanza;
2. **origen sin estado** → no hay nada que llevarse;
3. **destino CON estado** → **no se toca nada** (pisar la bóveda de claves sería peor que no migrar);
4. **destino vacío** → **copiar** (nunca mover, nunca borrar: volver atrás es borrar la carpeta nueva).

El log dice literalmente qué se copió y de dónde a dónde. Un arranque en raíz nueva vacía
sin migración es lo que se ve como «el cerebro está vacío»: no se borró nada, está en la
otra raíz.

---

## 6. Guarda de raíz (v1.6.23) — por qué `PROJECT_DIR` **no** puede ser la instalación

El incidente: `PROJECT_DIR=C:\Cerebronico` apuntó a la carpeta de la IDE. El resolutor
bajó dos niveles, encontró `ide\backend` (la IDE viva) y el piloto se puso a instalar y
compilar **la propia IDE dentro de su sandbox** → rollup `ModuleScope.findVariable`,
`:3500` muerto, y «La IDE no pudo compilarse dentro del sandbox» repetido tres veces.

Desde entonces `rechazarRaizAncestroApp()` (`raizDatos.ts:168-183`) rechaza cualquier raíz
que **sea o contenga** la app, avisa en consola con `⛔ GUARDA-RAÍZ v1` y cae al default.
Y en el resolutor de proyectos, `IGNORAR` excluye `.cerebro-db`, `.cerebronico` y
`.cerebro_db` para que el estado nunca se lea como proyecto.

---

## 7. La regla de la ruta absoluta (los dos rojos de Windows)

**De un `import.meta.url` se pasa con `fileURLToPath(import.meta.url)`** (de `node:url`), **nunca** con
`new URL(import.meta.url).pathname`: en Windows eso devuelve `/C:/Users/…`, y
`path.resolve` lo convierte en `\C:\Users\…`, un camino **inexistente**. Con ese camino
roto un `.ts` perfecto «no contiene el patrón», y así dos suites enteras llegaron rojas a
casa con el código bien.

Los síntomas que produce una ruta mal fabricada se distinguen en un segundo: **imprimir la
ruta resuelta antes de afirmar «el archivo no existe»**. Los dos tests que cubren esta
lección son `tests/rutaTrabajo.test.ts` y `tests/rutasSistema.test.ts`.

---

## 7-bis. El cerebro: dónde vive su estado (verificado en v2.1.7)

El motor guarda **todo** en un único archivo JSON, fuera de la instalación:

| Ruta | Qué es |
|---|---|
| `<raíz de datos>/.cerebro-db/cerebro-motor.json` | hechos + páginas + contradicciones (≈1 MB con 2.500 hechos) |
| `<raíz de datos>/.cerebro-db/alias-paginas.json` | tabla `{"alias": {"id-real": "Nombre legible"}}` que el daemon aplica al listar páginas |
| `<raíz de datos>/.cerebro-db/hindsight-mirror.json` | espejo local que el daemon usa si el motor no responde |

Estar **fuera de la instalación** es deliberado: sobrevive a cualquier actualización del IDE.
Si el cerebro «aparece vacío» tras actualizar, mirar primero si `PROJECT_DIR` cambió
(sección 5): el archivo sigue donde estaba.

**Endpoints reales del motor** (no inventar otros):

| Método y ruta | Qué hace |
|---|---|
| `GET /health` | versión, hechos, vigentes, superados, páginas, contradicciones, ruta del almacén |
| `POST /v1/default/banks/{banco}/memories` | ingesta. Cuerpo: `{"items":[{"content","document_id","type","tags"}]}` |
| `POST /v1/default/banks/{banco}/memories/recall` | recuperación de hechos |
| `GET /v1/default/banks/{banco}/mental-models` | **listado de páginas** (no existe `/pages`) |
| `GET /v1/default/banks/{banco}/mental-models/{id}` | detalle de una página |
| `POST /v1/default/banks/{banco}/consolidar` | reconstruye las páginas desde los hechos |

**Trampa verificada:** la ingesta dispara la consolidación automática de páginas, así que
puede tardar más de 60 s con un documento grande. Un timeout del cliente **no** significa
que la ingesta falló: comprobar `/health` antes de reintentar, o se duplica el contenido.

**Trampa verificada (Windows):** reiniciar un proceso Python no siempre mata el viejo. Hay
que comprobar el PID real por línea de comando antes de creer que el reinicio funcionó; si
no, se sigue sirviendo el código anterior y el parche «no se aplica».

---

## 8. Dónde se ve reflejado este mapa en tiempo real

- **Arranque / cada turno:** el log `📚 ABORDAJE "modelo" … rutas ✓ 2467 …`. Si alguna vez
  dice `rutas ✗ AUSENTES`, hay un abordaje con texto y sin mapa: eso es un **problema**, no
  un aviso, y `planDeAbordaje` lo marca con `esProblema`.
- **Con `PROJECT_DIR` puesto**, el mapa no habla en abstracto: el servidor pasa
  `raizDatos: PROJECT_ROOT` (`server.ts:9889`) y el modelo recibe **el camino real** de esa
  máquina, ya validado por la guarda de la sección 6.
- **Coste declarado:** `CHARS_MAPA_RUTAS` entra en `presupuestoAbordaje()`. El mapa no se
  puede colar como gasto invisible: o el presupuesto lo incluye, o el `excedido` que se
  reporta es mentira.

## Sesiones de edición servidor

`.sesiones/actual.json` conserva el hilo bajo PROJECT_DIR; `.sesiones/` no aparece en el inventario público. Servidor exige PROJECT_DIR explícito; no lo sustituye por una raíz temporal.

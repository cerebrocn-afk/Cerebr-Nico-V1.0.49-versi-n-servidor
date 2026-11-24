# CHANGELOG v1.66.1 — LOS CABLES, NO MÁS MÓDULOS HUÉRFANOS

> **Revisión pedida:** «revisión rápida, corregí los bucles de tarea y revisá ollama en local»,
> sobre `CerebroNico-IDE-v1.66.0.zip` y dos sesiones exportadas del 23/10:
> `cerebronico-ide-sesion-1792723545252.json` (Gemini / Z.ai / Mistral, 26 mensajes)
> y `cerebronico-ide-sesion-1792727665798.json` (Ollama local, 30 mensajes).
>
> **Esta versión no agrega funcionalidad nueva. Conecta la que ya estaba escrita.**

---

## EL HALLAZGO CENTRAL

v1.66.0 escribió tres módulos nuevos, los probó, y **no los importó nadie**. El propio
`CHANGELOG-v1.66.0.md` lo decía en su última línea, bajo el título *«Integración (wiring
pendiente en tu entorno)»*:

> «`continuidadTurno` → al cerrar el turno, llamar `evaluarContinuidad(...)`»
> «`disciplinaChat` → en el punto donde el texto del asistente se emite al chat...»

Verificado con `grep` sobre todo el arbol: `continuidadTurno` solo aparecía en su propio
archivo y en su test. Lo mismo `disciplinaChat`. Los tests daban verde (11/11 y compania)
porque prueban la función pura, **no el cable**. El motor seguia cortando el turno en
«voy a...» exactamente igual que antes.

---

## ARREGLO 1 · EL DETECTOR DE CICLOS VOLVIO A LOS NUEVE PROVEEDORES

**Síntoma (sesión 1792723545252, cinco turnos seguidos):**

```
Quedaban acciones pendientes (pc_exec) cuando se agotó el presupuesto de pasos del turno.
Pídeme «sigue» y continuo por donde iba.
```

El usuario: *«no te tranques»*, *«por qué te cortas»*, *«quedastes trancado hace rato, tuve
que detenerte»*, *«z ai no contesto hoy, se cortaba pensando en la tarea»*.

**Raíz.** `src/engine/contextoBucle.ts` (v1.64.0) detecta el ciclo y, desde v1.65.0,
**sobrevive a los turnos** con un singleton de sesión: si el turno anterior giro el mismo
ciclo y no avanzo, conserva la secuencia y suma `turnosEnBucle`. Su `TOPE_TURNOS_EN_BUCLE = 2`
existe exactamente para el caso «giró el ciclo, lo corté, el usuario dice 'sigue', vuelve a
girar EL MISMO ciclo».

Ese detector estaba enganchado en **dos** sitios: `runOllamaAgentLoop` (server.ts:3392) y la
rama Gemini (server.ts:10356). **No estaba en `server/cicloOpenAICompat.ts`**, el modulo al
que el ciclo se mudo en v1.57.9 — más tarde de que llegara la funcionalidad. Por él pasan los
nueve proveedores OpenAI-compat: **OpenRouter, custom, Z.ai, Groq, Cerebras, Together,
Mistral, DeepSeek, Fireworks**. Cada «sigue» arrancaba con el contador en cero y el mismo
bucle de siempre parecía la primera vez.

**Arreglo.** El ciclo acepta `contextoBucle` por `opts`, abre el turno sobre él, registra
cada paso (`anotarPaso`, en **ambas** ramas: nativa y textual), inyecta el aviso como mensaje
**despues** de las respuestas-tool (meterlo antes rompe el transcript OpenAI-compat) y corta
con una frase que nombra el ciclo. `server.ts` pasa el mismo `contextoBucleSesion` que ya
usaban Ollama y Gemini.

---

## ARREGLO 2 · LEER TAMBIEN COMPRA PASOS

**Raíz del mismo síntoma, segunda pata.** El presupuesto de pasos solo crecía con
`esHerramientaDeObra()` — que es exactamente `write_file|edit_file|append_file|create_file|crear_archivo`.
El pedido de la sesión era *«reporte de sistemas de versión»*: quince `pc_list_dir`, `pc_exec`
y `read_file`, **cero escrituras**. El techo se quedaba en 12 y la tarea moría a mitad, con
razon para el usuario y sin razon para el motor.

**Arreglo.** Nuevo `techoPasosConProgreso(escriturasOk, lecturasNuevasOk)` en el módulo PURO
(con su test). Reglas para que no se convierta en el bucle que pretende cortar:

* solo cuentan llamadas **sanas y DISTINTAS** (`clavesYaVistas`): repetir la misma lectura no
  compra nada, y la guardia de repetición ya la caza aparte;
* aporte de la lectura **topado** en `PASOS_MAX_POR_LECTURA = 12`;
* el **techo duro del turno sigue en 36**, y `techoPasosConObra()` no cambió su contrato.

Un reporte ahora llega a 24 pasos; una tanda de 15 archivos, igual que antes, a 36.

---

## ARREGLO 3 · `continuidadTurno` POR FIN SE LLAMA

Cableado al cierre del turno del ciclo, con cupo propio `MAX_CONTINUIDAD = 2`. Convive con el
re-empuje de v1.55.1 sin pisarse: `motivoDeParada` mira fórmulas sueltas; `evaluarContinuidad`
mira el turno **completo** y se calla si hubo herramienta u obra, si el texto pregunta algo, o
si ya entregó conclusión. Es la que no molesta al modelo que si esta trabajando.

---

## ARREGLO 4 · OLLAMA LOCAL — SEIS MODELOS, MUERTE A LOS 60 s EXACTOS

**Síntoma (sesión 1792727665798, prácticamente todos los turnos):**

```
Error de comunicación con qwen2.5:0.5b: El modelo local cayó demasiado tiempo y se cortó...
```

Medido sobre los timestamps: **64 s, 68 s, 74 s, 64 s, 65 s, 69 s, 74 s**. Y los modelos
implicados eran `qwen3-vl:2b`, `smollm2:1.5b`, `gemma3:270m`, `deepseek-coder:1.3b`,
`qwen3:0.6b`, `qwen2.5:0.5b` y `L4_cerebronico_master:latest`. Un 0.5B en CPU responde en
segundos. **Ninguno estaba lento: todos chocaron contra el mismo número.**

### 4a · «270m» no decía tamaño y caía en «nube-rapida»

`relojModelos.parametrosDe()` solo leia el sufijo `b`. `gemma3:270m` devolvia `0`, y
`claseDeModelo()` tenia `if (p === 0) return "nube-rapida"`. Un modelo **local** recibía el
reloj de un endpoint remoto. Lo mismo con `L4_cerebronico_master:latest` (un Modelfile propio:
sin tamaño en el nombre, por diseño).

* `parametrosDe()` ahora lee `m` (millones): `270m → 0,27 B`, `135m → 0,135 B`. Acotado a
  `10 … 999 999` millones para que **`bge-m3` no se lea como un tamaño** (con test).
* `claseDeModelo(nombre, esLocal)` y `presupuestoPrimerByte(nombre, { esLocal })`: el llamador
  sabe de qué proveedor viene y la duda se resuelve a favor de la maquina. Un `-cloud`
  declarado en el nombre **sigue ganando** — su cómputo no toca esta PC — y `glm-4.5-flash` no
  se vuelve local. Los dos controles de falso positivo, con test.

### 4b · LA CARGA FRÍA NO TENÍA PRESUPUESTO

El reloj medía el primer byte como si el modelo ya estuviera servido. Pero el primer byte de un
modelo local **frio** incluye volcar los pesos a RAM **y** procesar el prompt entero antes de la
primera palabra. Y en esa sesión el usuario rotó por seis modelos en dos minutos: cada rotacion
expulsa al anterior, así que `keep_alive` no mantenía nada y **todos los turnos eran fríos**.
Sesenta segundos contra ese muro son una derrota segura, no un diagnóstico.

Ollama **ya responde eso**: `/api/ps` dice cuál está cargado, y el turno ya lo consultaba
(`cargarInventarioLocal`). Se declara, no se adivina:

| estado | local-chico | local-mediano | local-grande |
|---|---|---|---|
| cargado en RAM | 60 s (igual que antes) | 120 s | 240 s |
| **carga fria** | **150 s** | **240 s** | **420 s** |
| nadie consultó | 60 s (comportamiento viejo) | 120 s | 240 s |

La lógica está en `server/pivotEnVivo.ts` (`relojDeModeloLocal`), no en el monolito. Elige su
propio piso pero **las mediciones propias siguen mandando por encima**: si el modelo respondio
lento estando frio, el p95 ya lo sabe mejor que esta tabla. Y el log ahora dice cuanto le toco
a cada turno:

```
[ai/stream] «qwen2.5:0.5b»: 150 s de primer byte — local-chico (base 60 s, piso de carga fría 150 s) · carga FRÍA (/api/ps no lo muestra)
```

### 4c · EL LATIDO CASTIGABA AL QUE MÁS INFORMA

`StreamContext.latido()` rearmaba el reloj con los `status` de Ollama, pero **con un tope duro
de 2**. Un modelo cargando suelta `loading safetensors 12% ... 87%`: al tercer aviso el reloj
dejaba de rearmarse **aunque el motor estuviera avanzando delante de nosotros**. Ahora se
cuentan las repeticiones **ignoradas**, no los latidos:

* señera que **cambia** → hay movimiento, el reloj se rearma;
* misma señera repetida 3 veces → estancado, se corta;
* sin señera aprovechable → se conserva el tope historico de 2;
* techo absoluto de 24 extensiones: un stream que solo emite `status` no vive para siempre.

`server.ts` pasa la señera completa (`estado.data.status`) en lugar de pulsar a ciegas.

---

## ARREGLO 5 · EL MENSAJE DECÍA «CALLO»

`consejoSilencioLocal()` escribia *«El modelo local **calló** demasiado tiempo»* — que es del
verbo *callar*. Es *«cayo»*. Corregido en los dos mensajes. No cambia una coma de lógica, pero
ese texto se lo lleva el usuario a Google buscando por qué no anda.

---

## LO QUE **NO** TOQUE (y por que)

* **`disciplinaChat.ts` sigue sin cablear.** No es un bucle de tarea, y engancharlo mal es peor
  que no engancharlo: `depurarChatParaUsuario()` saca del chat **todo** bloque cercado. Para eso
  hace falta un canal real hacia el editor y la terminal (`artefactos` necesita destino). Sin ese
  cable del lado del cliente, filtrar en el servidor **escondería código que el usuario pidió
  ver**. Queda como trabajo aparte, con su decisión de UX tomada a conciencia.
* **`plantillaDefecto.ts`** (BUG C de v1.66.0): mismo criterio, no es de esta tanda.
* **`keep_alive`, `num_ctx` y el modo liviano local**: revisados, están bien resueltos y con su
  logica en `modelTiers`. No los toqué.

---

## PRUEBAS

Batería completa: **175 suites** (`tests/*.test.ts`, con la nueva incluida).

| | v1.66.0 (zip original) | v1.66.1 |
|---|---|---|
| pasan | 155 | **156** |
| fallan | 19 | **19** — *exactamente los mismos 19* |

**Regresiones: cero** (verificado comparando lista de fallas contra el zip original,
no contra mi memoria). Las 19 preexistentes se dividen en dos grupos:

* **14** revientan con `}` + `Node.js v22.23.2` — necesitan `node_modules`
  (`agentico`, `chatOrders`, `consejoVotacion`, `escrituraArchivo`, `espejos`,
  `espejos-personalizados`, `grupo`, `imagen`, `panel`, `planEscrituraCableada`,
  `reflejo`, `roundtrip`, `syntaxGuardProfundo`, `vallasVivas`… ). No corren en un
  árbol pelado; en el tuyo, con dependencias instaladas, es otra historia.
* **5** son rojos reales de v1.66.0: el trinquete de líneas (`bajoConsumo`,
  `androidProyecto`, `techoContexto`, `superficieRutas`) y `hindsightHibrido`
  (packs de Node). **El trinquete ya estaba roto de fábrica**: `server.ts` shippeó
  con 12 191 líneas contra un `server_lineas = 12190`.

Suites tocadas por esta tanda, todas en verde:

* **Nueva** `tests/v1661_buclesYReloj.test.ts` — **32/32 ✓**. Los tres frentes de
  Ollama con sus falsos positivos, la contabilidad de pasos, y las **aserciones de
  cable**: que el ciclo importa los dos módulos huérfanos, que ambas ramas anotan el
  paso, que existe un único dueño del estado del ciclo, y que el monolito **no creció
  ni una línea**.
* `tests/relojModelos.test.ts` — **36/36 ✓**. Dos aserciones estaban pegadas al texto
  viejo (`ctx.latido()` sin argumento, `extensionesDeCarga >= 2`) y se reescribieron
  contra el contrato nuevo, **exigiendo los tres techos por nombre** para que nadie
  los afloje en silencio.
* `tests/continuidadTurno.test.ts` 11/11 · `tests/contextoBucle.test.ts` 14/14 — intactas.
* Suite registrada en `scripts/validar.mjs` (array `SUITES`).

## NOTA DE ENTORNO · TRINQUETE

`server.ts` queda en **12 191 líneas: ni una más que v1.66.0.** Todo lo nuevo salió
del monolito:

* la carga fría → `server/pivotEnVivo.ts` (`relojDeModeloLocal`), donde ya vivía
  `InventarioLocal`;
* la contabilidad de pasos → `src/engine/cicloHerramientasOpenAICompat.ts`, que es puro;
* el estado del detector de ciclos → **nuevo módulo hoja** `src/engine/contextoBucleSesion.ts`.

Ese último punto es el que permitió el cero: en vez de copiar
`contextoBucle: contextoBucleSesion,` en las nueve llamadas al ciclo (nueve líneas de
monolito y nueve sitios que mantener), el ciclo toma el singleton por defecto y
`opts.contextoBucle` sigue pudiendo sobrescribirlo. Los tres bucles —Ollama, Gemini y
OpenAI-compat— comparten ahora **un solo** estado, que es lo que `contextoBucle.ts`
pedía a gritos desde v1.65.0.

No levanté el `server_lineas` del contrato para tapar el rojo preexistente: sigue
abierto, y está dicho acá.

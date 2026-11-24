# CONCIENCIA — Diseno, protocolo y resumen ejecutivo del organo

Archivo MAESTRO generado el 2026-10-05. Unifica 3 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [DISENO_CONCIENCIA.md](#diseno-conciencia-md) — version s/v
2. [GUIA_PROTOCOLO_ANALISIS_Y_CONCIENCIA.md](#guia-protocolo-analisis-y-conciencia-md) — version s/v
3. [RESUMEN_EJECUTIVO_CONCIENCIA.md](#resumen-ejecutivo-conciencia-md) — version s/v


---

<a id="diseno-conciencia-md"></a>
## (1/3) DISENO_CONCIENCIA.md

> **Fuente:** `./DISENO_CONCIENCIA.md`  —  **version:** s/v  —  **bytes:** 6629
# Diseño técnico — La «.con-ciencia» (órgano de redirección)

> Versión del documento: v1.48.0 · Módulo: `src/engine/cerebroOrgano.ts`
> Estado: implementado y cableado al motor (`server.ts`) y a la interfaz (`src/App.tsx`).

---

## 1. Qué es (y qué NO es)

La `.con-ciencia` es la memoria de **largo plazo** de CerebroNico: un «cerebro»
que el agente consulta turno a turno. La idea central, en palabras de Mario, es
que funcione como un **órgano que redirige**, no como un documento que se lee
entero.

- **NO es** un único `cerebro.md` gigante que haya que cargar completo en cada
  turno. Eso llena la ventana del modelo y, en una máquina de 8 GB, es la
  diferencia entre responder y colgarse.
- **SÍ es** una base de datos pequeña con una **tabla de ruteo**: ante una
  consulta, el órgano decide *qué* trozos de conocimiento valdría la pena abrir
  y abre solo esos.

Se distingue de `memoria.md` (la pizarra viva, estado operativo del turno a
corto plazo): el cerebro guarda conocimiento duradero —decisiones, recetas,
patrones del proyecto— enrutado por tema, título y contexto.

---

## 2. Estructura en disco

Vive bajo la raíz de datos del proyecto, en su propia carpeta (nunca toca los
archivos del usuario):

```
cerebro/
  ├─ indice.json        ← EL ÓRGANO: tabla de ruteo (tema/título/palabras → archivo).
  │                       Es lo ÚNICO que se lee para DECIDIR qué abrir.
  ├─ CEREBRO.md         ← cara humana: índice legible de lo aprendido, por tema.
  └─ temas/<id>.md      ← el conocimiento de verdad, UN archivo por entrada.
```

Cada **entrada** del índice lleva: `id` estable, `tema`, `titulo`, `palabras`
clave (ya normalizadas), `archivo` relativo, `resumen` de una línea, `peso`
(importancia, sube con los refuerzos) y `ts` (última actualización).

---

## 3. Las tres operaciones

### 3.1 ENRUTAR — decidir sin leer todo

`enrutar(raízDatos, consulta, max)` puntúa la consulta contra el índice y
devuelve solo las entradas que ganan, de mayor a menor relevancia. **No abre
ningún `.md`**: solo dice *cuáles* valdría la pena abrir.

La puntuación respeta la intención que pidió Mario («enruta por tema/título/
contexto»):

| Dónde coincide la palabra de la consulta | Puntos |
|---|---|
| en el **tema** de la entrada | +3 |
| en el **título** | +2 |
| en las **palabras** del cuerpo | +1 |

El `peso` de la entrada modula al final (una decisión reforzada muchas veces
pesa un poco más), pero con un tope logarítmico: **una coincidencia fuerte de
tema siempre vence al peso bruto**, para que un tema muy reforzado no secuestre
todas las consultas.

El tokenizador es específico de español: baja a minúsculas, quita acentos y
signos, descarta palabras vacías (`de`, `la`, `que`…) y ruido de menos de 3
letras.

### 3.2 APRENDER — el cerebro se auto-escribe

`aprender(raízDatos, {tema, titulo, texto, …})` registra o **refuerza** una
entrada:

- Extrae palabras clave semánticas de `tema + titulo + texto` (el tema y el
  título entran siempre; del cuerpo se toman las más frecuentes que no son
  ruido). Así el ruteo futuro acierta sin que nadie escriba las palabras a mano.
- Si ya existe una entrada con el mismo tema+título, **actualiza** el cuerpo y
  sube su peso (refuerzo) en vez de duplicar.
- Nunca lanza: un fallo de aprendizaje jamás debe tumbar el turno del agente.

### 3.3 INYECTAR — solo lo enrutado llega al prompt

`buildCerebroContext(raízDatos, consulta, presupuesto)` enruta, abre **solo** las
entradas ganadoras, las recorta a un presupuesto total de caracteres y arma un
bloque de contexto. Si el cerebro está vacío o nada enruta, devuelve `""` y no
gasta ni un token.

---

## 4. Indexación en tiempo real (optimización v1.48.0)

`enrutar()` se llama en cada turno —y a veces varias veces por turno, desde
cada proveedor—. Antes, cada llamada releía y re-parseaba `indice.json` entero
desde disco. Con un cerebro que crece, eso es lectura + `JSON.parse` en el
camino caliente, justo en la máquina más limitada.

La optimización añade un **caché del índice en memoria**, por raíz de datos,
validado contra el `mtime` + tamaño del archivo:

1. En cada carga se hace un `fs.statSync` **barato** (sin leer el contenido).
2. Si el archivo no cambió desde la última vez → se sirve la copia cacheada
   (cero lectura, cero parse).
3. Si cambió —porque el agente aprendió algo, o alguien editó el `.json` a
   mano— el `stat` lo detecta al instante y se recarga. Por eso es **tiempo
   real**: el aprendizaje se refleja en la siguiente consulta sin reiniciar.
4. Además, `guardarIndice` **siembra** el caché con lo que acaba de escribir,
   de modo que el primer enrutado tras aprender tampoco toca disco.

El caché entrega siempre un **clon** del índice, para que quien lo reciba no
mute por accidente la copia compartida. Es 100 % opcional: si el `stat` falla,
se cae al camino clásico (leer + parsear) sin romper nada. Hay
`invalidarCacheCerebro(raízDatos)` para forzar recarga si se borra la carpeta a
mano.

---

## 5. Cableado con el agente

- **Herramientas del agente** (en `toolRegistry.ts`, pack `CEREBRO_PACK`):
  - `cerebro_recordar` → `aprender(...)`.
  - `cerebro_consultar` → `enrutar(...)` + `buildCerebroContext(...)`.
  - `abrir_previsualizador` → el agente abre el previsualizador a voluntad.
- **Inyección en el prompt**: en `/api/ai/stream`, tras el bloque de conciencia
  en tiempo real, se añade el contexto enrutado del cerebro para la consulta.
- **Previsualizador a voluntad**: la señal `abrir_preview` se emite desde un
  único punto común a todos los proveedores (Gemini / Z.ai / Ollama) mediante un
  emisor a nivel de módulo, que se conecta al contexto vivo del turno al
  arrancar el stream y se suelta en el `finally`. La interfaz reacciona abriendo
  el editor web, arrancando el sandbox si hace falta y refrescando el iframe.

---

## 6. Reglas de la casa respetadas

- Módulo **puro** de Node (`fs`/`path`/`crypto`): cero red, cero dependencias
  nuevas, cero Ollama.
- Escritura **atómica** (tmp + rename): un corte de luz no deja el índice a
  medias.
- **Aditivo y no destructivo**: si el cerebro no existe o está vacío, todas las
  funciones devuelven vacío sin romper nada. No mueve ni toca archivos de la
  raíz referenciados por los tests (contrato de superficie intacto).

---

## 7. Verificación en el equipo

El entorno del agente no tiene red ni build; los cambios se validaron por
lectura y sintaxis. Para activarlos en el equipo:

```
npm install
npm run validar
npm run dev
```


---

<a id="guia-protocolo-analisis-y-conciencia-md"></a>
## (2/3) GUIA_PROTOCOLO_ANALISIS_Y_CONCIENCIA.md

> **Fuente:** `./GUIA_PROTOCOLO_ANALISIS_Y_CONCIENCIA.md`  —  **version:** s/v  —  **bytes:** 6745
# Guía de mejores prácticas — Protocolo de análisis y Conciencia en tiempo real

> **Qué es esto.** El motor de CerebroNico ya no deja que el modelo escriba a lo
> loco: le inyecta, en cada turno, (1) un **protocolo de análisis previo** y
> (2) un bloque de **conciencia en tiempo real** con el estado vivo del turno.
> Esta guía explica el porqué, el cómo y las reglas para que el agente «analice
> antes de hacer cagadas». Vive en el motor (no en la cabeza del modelo), así que
> funciona igual con GLM, Gemini o un modelo pequeño.

---

## 1. El bucle: de «cartel fijo» a «conciencia viva»

Un protocolo de análisis clásico se responde **una vez** al empezar y se olvida.
El problema real aparece a mitad de tarea: el modelo repite un paso que ya hizo,
da por bueno un archivo que no leyó, o reintenta la misma llamada que ya falló.

La solución es un **bucle**: las mismas 5 preguntas, pero re-respondidas en
**cada paso** con el estado real del turno.

```
   ┌────────────────┐
   │  1. ¿DÓNDE ESTOY?  │ ◀──────┐
   └───────┬───────┘        │
           ▼                 │
   2. ¿QUÉ CAMBIÓ?            │  el ESTADO VIVO
           ▼                 │  realimenta el bucle
   3. ¿QUÉ PUEDO hacer?       │  en cada paso
           ▼                 │
   4. PRÓXIMO PASO MÍNIMO     │
           ▼                 │
   5. ¿CÓMO lo VERIFICO? ─────┘
```

---

## 2. Las 5 preguntas (el contrato)

1. **¿DÓNDE ESTOY?** — Objetivo del turno + qué pasos ya di y cómo fueron. No
   repitas una acción ya hecha ni asumas un archivo que no leíste este turno.
2. **¿QUÉ CAMBIÓ por mi última acción?** — Si una herramienta falló, **lee el
   error antes de reintentar**. No repitas la misma llamada esperando otro
   resultado.
3. **¿QUÉ PUEDO hacer realmente ahora?** — Mira tus herramientas y tus límites
   reales. Sin control de PC o sin red, no prometas lo que no puedes: di qué
   activar.
4. **¿CUÁL es el próximo paso MÍNIMO útil?** — Uno, pequeño y verificable. Nada
   de saltos grandes a ciegas.
5. **¿CÓMO verifico que salió bien?** — Define la comprobación **antes** de
   actuar (releer, compilar, abrir el preview). Si no puedes verificar, dilo.

> **Regla de oro:** si el estado real contradice tu plan, **gana el estado
> real**. Ajusta el plan, no inventes la realidad.

---

## 3. Mejores prácticas por fase

### 3.1 MIRAR antes de tocar
- Nunca supongas el contenido de un archivo: `list_files` para ubicarlo,
  `read_file` / `read_file_range` para leer **solo el tramo** que vas a cambiar.
- Un archivo leído **este turno** es un hecho; uno recordado de hace rato puede
  estar desactualizado.
- Antes de crear algo que quizá ya existe, busçalo (`search_in_files`).

### 3.2 PLANIFICAR pequeño
- Tareas de >2 pasos → `set_plan` con tareas cortas (id + descripción
  accionable). Avanza de una en una y marca cada tarea al terminar.
- No anuncies un plan gigante para luego abandonarlo: pásalo por el espejo vivo
  para que quede en el estado del turno.

### 3.3 Medir el RIESGO (reversible vs irreversible)
| Tipo | Ejemplos | Cómo actuar |
|---|---|---|
| **Reversible** | crear, editar un tramo, borrar un elemento con deshacer | Hazlo y ofrece volver atrás |
| **Irreversible / impacto amplio** | vaciar todo, borrado masivo, reescribir un archivo entero, config de producción | **Avisa y confirma antes** |

- Prefiere `edit_file` a reescribir entero. Prefiere mover a borrar.
- En la **UI**: modal de confirmación **solo** para lo grave; para lo reversible,
  un *toast con Deshacer* (no abuses del modal — ver `ejemplos/flujo-confirmacion-modal.html`).

### 3.4 VERIFICAR y reconciliar
- Tras actuar: relee lo escrito, compila o abre el preview en `:3500`.
- Si una herramienta falló: lee el error, entiende la causa, cambia el enfoque.
- Si no pudiste verificar, dilo claro: *«aplicado, sin verificar»*.

---

## 4. Cómo lo implementa el motor

Todo se arma en el **punto único multi-proveedor** (`/api/ai/stream`), después
del manual de herramientas, así que **cualquier** conductor (GLM, Gemini,…)
recibe lo mismo:

| Pieza | Archivo | Qué inyecta | Cuándo |
|---|---|---|---|
| `PROTOCOLO_ANALISIS` | `src/engine/recetarioUI.ts` | las 5 preguntas (versión fija) | modelos con herramientas |
| `buildConcienciaTiempoReal()` | `src/engine/conciencia.ts` | **estado vivo**: objetivo, pasos ya dados (✔/✖), recuento del plan, capacidades reales (PC/red), retrato del proyecto | modelos con herramientas, cada turno |
| `CONCIENCIA_KB_ENTRIES` | `src/engine/conciencia.ts` | buenas prácticas como KB consultable | se siembran en `SEMILLA_COMPLETA` |
| `proc-analisis-previo`, `proc-ui-variada` | `src/engine/manuals.ts` | procedimientos | recuperables por palabra clave |

**Presupuesto por modelo.** La parte dinámica se recorta: ~600 car. en nube
rápida (flash/lite), ~1000 en modelo grande. Los modelos *micro/tiny* no
reciben estos bloques (no ejecutan herramientas y no caben).

El **estado vivo** sale del *espejo vivo* (`espejoVivo.ts`, vía
`hojaVivaParaPanel()`): objetivo del turno, pasos/herramientas ya ejecutados con
su resultado, y el recuento del plan (hechas / fallidas / sin hacer).

---

## 5. Ejemplo de bloque inyectado (lo que ve el modelo)

```
[CONCIENCIA EN TIEMPO REAL — recálcula esto en CADA paso, no solo al empezar]
1) ¿DÓNDE ESTOY? ...
...
Si el estado real contradice tu plan, GANA el estado real.

[ESTADO VIVO DEL TURNO]
• Objetivo del turno: añadir pantalla de ajustes con control de volumen
• Pasos ya dados este turno (3): ✔ list_files | ✔ read_file src/App.tsx | ✖ edit_file ajustes.tsx
• Plan vivo: 2 hechas, 1 fallidas, 2 sin hacer.
• Capacidades ahora: modelo glm-4.7-flash (zai) · control de PC: NO · red: sí.
• ÚLTIMO ERROR a tener en cuenta: edit_file: no se encontró el ancla «export default»
```

Con esto el modelo **sabe** que su última edición falló por un ancla mal puesta
y no vuelve a lanzar la misma llamada: primero relee el archivo.

---

## 6. Antipatrones (lo que ya NO debe pasar)

- ❌ Reescribir un archivo entero «por si acaso» en vez de editar el tramo.
- ❌ Reintentar la misma herramienta tres veces sin leer el error.
- ❌ Prometer «descargo e instalo» cuando no hay red o no hay control de PC.
- ❌ Abrir un modal de confirmación para cada clic (fatiga de confirmación).
- ❌ Dar por hecho un archivo que no se leyó en el turno actual.
- ❌ Entregar siempre la misma plantilla sin adaptarla al pedido.

---

*CerebroNico v1.47.2 — el conocimiento vive en el motor, no en el modelo.*


---

<a id="resumen-ejecutivo-conciencia-md"></a>
## (3/3) RESUMEN_EJECUTIVO_CONCIENCIA.md

> **Fuente:** `./RESUMEN_EJECUTIVO_CONCIENCIA.md`  —  **version:** s/v  —  **bytes:** 3144
# Resumen ejecutivo — Arquitectura de la «.con-ciencia»

> CerebroNico IDE · v1.48.0 · una página para decidir, el diseño completo en
> `DISENO_CONCIENCIA.md`.

## El problema

Un modelo pequeño, en una máquina de 8 GB, no puede «recordar» cargando un
documento de memoria entero en cada turno: llena la ventana de contexto y, en la
práctica, es la diferencia entre responder y colgarse. Hacía falta una memoria
de largo plazo que **no se lea completa**, sino que lleve al dato exacto.

## La solución en una frase

La `.con-ciencia` es un **órgano de redirección**: una base de datos local
pequeña que, ante una consulta, decide *qué* trozos de conocimiento abrir y abre
solo esos —nunca todo el cerebro.

## Cómo funciona (tres verbos)

| Verbo | Qué hace | Coste |
|---|---|---|
| **Enrutar** | Puntúa la consulta contra un índice (tema > título > cuerpo) y devuelve solo las entradas que ganan. No abre archivos. | Barato: trabaja sobre el índice en memoria. |
| **Aprender** | Cuando el agente cierra algo útil, escribe una entrada y extrae sus palabras clave solo. El cerebro se auto-indexa. | Una escritura atómica. |
| **Inyectar** | Abre únicamente las entradas ganadoras, las recorta a un presupuesto y las mete en el prompt. Si nada enruta, no gasta ni un token. | Acotado por presupuesto. |

## Qué aporta cada pieza

- **Base de datos, no un `.md` gigante.** `cerebro/indice.json` (la tabla de
  ruteo) + `cerebro/temas/*.md` (un archivo por entrada) + `CEREBRO.md` (cara
  humana legible). Solo el índice se lee para decidir.
- **Indexación en tiempo real (v1.48.0).** El índice se cachea en memoria y se
  valida con un `stat` barato (fecha + tamaño). Si no cambió, se sirve la copia
  (cero lectura/parseo); si cambió, se recarga al instante. Aprender se refleja
  en la siguiente consulta sin reiniciar.
- **Ligado al agente.** Herramientas `cerebro_recordar` y `cerebro_consultar`;
  el contexto enrutado se inyecta en cada turno de `/api/ai/stream`.
- **El agente abre el previsualizador a voluntad.** `abrir_previsualizador`
  emite una señal desde un punto común a todos los proveedores; la interfaz abre
  el editor web, arranca el sandbox y refresca la vista.

## Garantías de ingeniería

- **Puro y sin dependencias nuevas** (`fs`/`path`/`crypto`), cero red, cero
  Ollama.
- **Escritura atómica** (tmp + rename): un corte de luz no deja el índice a
  medias.
- **Aditivo y no destructivo**: cerebro vacío → todo responde vacío. No mueve ni
  toca archivos de la raíz referenciados por los tests (contrato de superficie
  intacto).
- **Verificable**: suite dedicada `tests/concienciaCache.test.ts` (corre con
  `npm run validar`).

## Riesgo residual y línea de evolución

El ruteo es léxico (solapamiento de palabras), no semántico puro: dos términos
sinónimos no se cruzan por sí solos. Es una decisión deliberada (cero coste,
cero dependencias). La evolución natural —si alguna vez hace falta— sería añadir
sinónimos/stemming ligero y, más adelante, embeddings locales; el
`ANALISIS_CUELLOS_INDEXADOR.md` detalla cuándo valdría la pena y cuándo no.

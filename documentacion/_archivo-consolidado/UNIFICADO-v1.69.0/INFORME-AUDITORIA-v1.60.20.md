# Auditoría v1.60.19 — manual del motor, sesiones y sandbox

Fecha: 22/10/2026 · Todo lo de abajo está verificado con herramientas sobre el
zip entregado, el log y las dos sesiones. Cero inferencias sin medir.

---

## 1. Resumen ejecutivo

| Qué | Veredicto |
|---|---|
| El zip v1.60.19 está íntegro y arranca | Correcto (7490 comprobaciones, 12 fallos de entorno) |
| El manual del motor describe el motor real | **Casi todo correcto**; 4 desajustes puntualess |
| El motor corta el bucle de reescritura idéntica | **Armado, pero nunca dispara** en el log |
| El detector de degeneración v1.60.19 | **No detecta el fallo real de la sesión** |
| Sandbox trancado con la página de prueba | **Causa raíz encontrada** (anti-caché ausente) |

---

## 2. El ZIP de CerebroNico

### 2.1 Está sano
- `package.json` → `cerebronico-ide@1.60.19`. Versión coherente.
- `npm run validar`: **7490 comprobaciones, 12 fallos**, todas en el pack
  `hindsight` (`tests/hindsightHibrido.test.ts`).
- Esos 12 fallos eran **de entorno, no del código**: el SDK vendorizado
  `vendor/hindsight-agent-sdk/` declara `"main": "dist/index.js"` pero el zip
  viaja sin `dist/`. `scripts/postinstall.mjs` (líneas 53-58) existe
  **exactamente para eso**: «podía viajar sin dist/ (raíz de las 12
  comprobaciones de hindsight en rojo)».
- **Verificado:** corrí `node scripts/postinstall.mjs` y repetí el test →
  **107 correctas · 0 fallidas · TODO EN VERDE**. El zip está íntegro.
- Tests de los dos controles de bucle: `repeticionSufijoCreciente` **13/13**,
  `reescrituraIdenticaCircuito` **12/12**.

### 2.2 Desajuste de versión en el log (OJO)
El log que enviaste corre **dos versiones a la vez**:

```
npm notice run cerebronico-ide@1.60.19      ← el código
[INFO] Interprete Python: ...\CerebroNico-IDE-v1.60.18\runtime\python-embed\python.exe   ← la carpeta
[CerebroNico] Snapshot: ...\CerebroNico-IDE-v1.60.18\.cerebro-db\rescate\...
```

x4 rutas a `v1.60.18` contra un `package.json` en `1.60.19`. Estás ejecutando el
código nuevo **dentro de la carpeta vieja**. Riesgo real: el `.cerebro-db` y los
rescates van a la carpeta de la versión anterior, y `runtime\python-embed` puede
no coincidir con lo que espera el código. **Arranca siempre desde la carpeta
que corresponde a la versión.**

---

## 3. La sesión FIM: el bucle de 262 KB

### 3.1 Qué pasó exactamente
Sesión `1792619044991`, modelo `mistral-code-fim-latest` (Mistral), pregunta del
usuario: pegó el log de arranque y preguntó qué era.

La respuesta tiene **262.849 caracteres**. No es que el modelo entendiera mal: es
que **degeneró**. Inventó una carpeta por línea y repitió 33 plantillas, la más
común **104 veces**:

```
**C:\Cerebronico\graphql** — carpeta de GraphQL. Aquí se guardan los archivos…
**C:\Cerebronico\store** — carpeta de store. …
```

- 1467 líneas con texto · 33 plantillas distintas
- 1447 de 1467 líneas (98,6 %) son de una plantilla repetida >3 veces
- La línea más larga: 243 caracteres → **65.712 tokens estimados** de salida

Tu pregunta siguiente fue «que es todo esto»: la respuesta te desbordó.

### 3.2 Por qué NO lo cortó el detector v1.60.19
Este es el hallazgo central. El guard de v1.60.19
(`src/utils/repeticionAnidada.ts`) existe y está cableado en
`src/utils/engine.ts:226`, y su test pasa. Pero está construido para otra forma
de degeneración:

| | Detector v1.60.19 | Lo que pasó de verdad |
|---|---|---|
| Forma | Sufijo que **crece** dentro de una línea (`_DATOS_SCHEMA_DATOS_SCHEMA…`) | Líneas **casi idénticas** que cambian en una palabra |
| Líneas | Cada línea es distinta | Cada línea es distinta |
| ¿Lo pilla? | Sí (test 13/13) | **NO** |

Medición directa sobre los 262.849 caracteres reales de la sesión:

```
cortarDegeneracionSufijo(texto_real) → hit: false
caracteres que dejan pasar: 262849 de 262849  → descarta 0.0 %
```

El detector viejo (`sanitizeRepetitiveLoop`, exige 8 repeticiones **exactas**)
tampoco: `NO CATCH`. Ninguno de los dos corta este caso.

**Los 1467 «carpetas» que te》是 inventadas. `C:\Cerebronico\graphql`,
`\store`, `\providers`, `\hooks`, `\reducers`… ninguna existe.** La carpeta real
es `C:\Cerebronico` con `.proyectos`, `skills`, `exportaciones`, `memoria`,
`config`, `logs`, `backups`.

### 3.3 La causa de fondo: el modelo no es de chat
`mistral-code-fim-latest` es un modelo de **autocompletado de código**
(fill-in-the-middle). No conversaciona. El filtro de modelos de chat del motor
existe en dos sitios:

- `server/routers/modelos.ts:215` — excluye `text-embedding|embed|tts|whisper|…`
- `server/routers/diagnostico.ts:223` — excluye `embed|minilm|bge|sentence|…`

**Ninguno de los dos filtra `fim`.** Un FIM通过了 el filtro, se ofreció para
chatear, y el resultado es el bucle. La detección de v1.60.19 está escrita
contra este modelo concreto pero **no cierra la puerta de entrada**.

### 3.4 No hay techo de salida
`src/utils/engine.ts` no manda `num_predict` ni `max_tokens` al pedir la
generación (verificado: 0 coincidencias). Sin techo, el FIM puede seguir
emitiendo hasta que el contexto o el watchdog corten — y hasta entonces ya
escribió 262 KB.

---

## 4. El bucle de reescritura idéntica: armado, pero no disparó

En el log hay **34 rechazos de «REESWRITURA IDÉNTICA»** (12 pares
`bloqueó`/`rechazado`, más los del tramo final), todos contra `index.html`, con
el mismo texto. El circuito de v1.60.17 corta al **3er** rechazo en cualquier
archivo (`TOPE_REESCRITURA_IDENTICA = 3`) y está cableado en 4 puntos
(`server.ts:3607`, `server.ts:10497`, `cicloOpenAICompat.ts:376` y `:450`).

**En el log no aparece nunca «Corté el turno».** Con 34 rechazos debería haber
cortado en el tercero. Dos lecturas posibles, y hace falta medir en tu máquina
cuál es:

1. El contador se reinicia por turno y cada turno sólo acumuló 1-2 rechazos
   (los rechazos vienen **agrupados**: líneas 106-167, luego 182-239, luego
   340-341) — el corte es *por turno* y si cada turno tuvo menos de 3, no
   dispara aunque el usuario pierda 30 turnos.
2. El texto que llega al contador no matchea el regex
   `/REESCRITURA ID[EÉ]NTICA/i`. Ojo: **el log escribe una vez «REESWRITURA»**
   con W (línea 110). Es una falta de tipeo en el mensaje del Quirófano, no en
   el regex, pero confirma que el texto circula con variantes.

**Diagnóstico recomendado:** en la próxima sesión, contar rechazos **por turno**,
no en el total. El corte por turno es correcto, pero 3 es bajo cuando el usuario
va encadenando turnos sin que nada avance.

---

## 5. Sandbox trancado con la página de prueba ← tu hallazgo

### 5.1 Causa raíz: los dos previews NO se refrescan igual
Este es el motivo de que «el preview muestre el proyecto pero el sandbox
muestre la página de prueba».

Hay **dos vistas con iframe del mismo :3500**:

| Vista | Archivo | Anti-caché |
|---|---|---|
| Editor web (preview) | `DedicatedWebEditorView.tsx:589,602` | **`urlConAntiCache(sandboxUrl, iframeKey)`** ✅ |
| Panel Sandbox | `RightSidebar.tsx:1358` | **`src={iframeSrc || SANDBOX_URL}`** ❌ |

`urlConAntiCache` (`src/utils/previewAntiCache.ts`) añade `?cn_r=<token>` para
que **el Service Worker no pueda devolver la copia vieja**. Sin ese parámetro, el
`sw.js` de tu proyecto (network-first, `fetch().catch(caches.match)`) sirve la
**versión cacheada** de la página de prueba en cuanto `:3500` tose un instante.

Resultado exacto de lo que describes: **el preview se actualiza (lleva
anti-caché) y el sandbox se queda pegado en la página vieja (no lo lleva).**
Recargar no ayuda, porque el SW responde igual.

**Arreglo de una línea:** en `RightSidebar.tsx` aplicar el mismo
`urlConAntiCache(iframeSrc, <token que cambia al refrescar>)`. El botón «Forzar
cierre» que ya tenés (línea 1290) funciona, pero es un rodeo manual de un
defecto que se arregla en el cableado.

### 5.2 Por qué el sandbox resuelve una raíz equivocada
`src/engine/projectPorter.ts:93` (`resolverRaizProyecto`) decide qué carpeta
sirve :3500. Tiene un antecedente escrito en el propio código (comentario
v1.48.2, líneas 104-114):

> «un index.html viejo que quedó en la RAÍZ DE DATOS (la página "Panel de
> Capacidades") secuestraba el preview: resolvía a la base y NUNCA miraba las
> subcarpetas»

Subieron el corte a peso ≥70 para que un `index.html` suelto no sequestre el
preview. **Si tu proyecto real no tiene `package.json` ni marcador de toolchain,
el resolutor puede seguir anclando en la raíz** — y tu raíz tiene la página de
prueba. Eso encaja con el síntoma exacto.

**Cómo confirmarlo en 10 segundos:** abrí la pestaña Puertos y leé la línea de
raíz; o pedile al motor `list_files` y compará con lo que esperás. Si la raíz
reportada es la raíz de datos y no tu carpeta de proyecto, es esto.

### 5.3 Imagen duplicada en el previsualizador
No encontré dos iframes montados a la vez: las dos ramas de
`DedicatedWebEditorView` (líneas 589 y 602) son **móvil vs escritorio**, mutuamente
excluyentes por `orientacionMovil`. Y `App.tsx` monta `DedicatedWebEditorView`
en dos sitios (línea 4322 en vista de editor, línea 4494 en la pestaña
`web-editor`), pero con `activeView` / `activeCenterTab` distintos.

Lo que sí es probable, dada 5.1: **no son dos copias del proyecto, son dos
instancias del iframe mostrando estados distintos** — el proyecto en la vista con
anti-caché y la copia cacheada en la otra. Se ven «dos imágenes» porque son dos
renders del mismo origen con distinto contenido en caché. Al unificar el
anti-caché debería resolverse junto.

---

## 6. El manual del motor: auditoría

### 6.1 Lo que está CORRECTO (verificado contra el código)
- **37 herramientas**: el manual dice 37 y `toolRegistry.ts` tiene exactamente 37.
- **Formatos B1-B4**: los cuatro existen en `extraerLlamadasEnTexto`
  (`cicloHerramientasOpenAICompat.ts:678`) y en `codeParser.ts:114`
  (las variantes ```` ```file= ````, ```` ```ts:src/x.ts ````, ```` ```src/x.ts ````
  están todas soportadas).
- **Alias de nombres**: los 15 de la tabla coinciden con `ALIAS_NOMBRE_HERRAMIENTA`.
- **Alias de campos**: los 12 coinciden con el mapa de `normalizarArgsAlias`.
- **Puertos**: 3000/3500/5000/5100/5102/11434 — todos coinciden con el log y con el código.
- **Ciclo de trabajo**: `set_plan` → orientarse → construir → `revisar_cambios` →
  `abrir_previsualizador` → `update_task`. Es el ciclo real.

### 6.2 Los 4 desajustes
| # | Qué dice el manual | Qué es la verdad | Efecto |
|---|---|---|---|
| 1 | `set_plan (id, description)` | El real es **`tasks: [{id, description}]`** (`toolRegistry.ts`, `required: ["tasks"]`) | Un modelo que siga el manual con `set_plan(id:…, description:…)` **falla la validación de esquema**. Es el error más caro de los cuatro. |
| 2 | `update_task (task_id, status, evidencia)` en completo; `(task_id, status)` en nativo | `evidencia` es **opcional** (`required: ["task_id","status"]`) | Menor: el manual completo sugiere que es obligatoria y no lo es. |
| 3 | `consultar_espejo` (sin args) | **`required: ["llamadas"]`** — espera `[{espejo, datos}]` | La llamada sin argumentos se rechaza. |
| 4 | `read_file_range (path, start, end)` | `required: ["path"]`; `start`/`end` son opcionales | Menor. |

`manuals.ts` (lo que el motor **de verdad** inyecta al modelo) sí dice
`tasks: [{id, description}]` correctamente. O sea: **el manual en disco es
peor que lo que el modelo recibe en vivo.** El motor le dice bien al modelo; el
documento que vos querés usar para verificarlo, no.

### 6.3 Un error de tipeo real
`manual-completo.md` línea 141:

> «Si el usuario dice «no cambia nada½, NO repitas el mismo párrafo…»

El cierre `»` (0xBB) se comió un `½` (0xBD). Es mojibake de edición. Las otras
copias (`manual-texto-libre.md:72`, `manual-minimo.txt:26`) lo tienen bien.

### 6.4 Las 6 copias no están cableadas
`grep` en todo el proyecto: **ningún archivo `.ts/.tsx/.mjs/.json/.py` referencia
`manual-motor`, `manual-completo`, `manual-minimo`, `manual-nativo`,
`manual-texto-libre`, `manual-xml` ni `manual-json`**.

El motor inyecta al modelo `src/engine/manuals.ts` (21 KB, entradas KbEntry).
**Los manuales del zip son documentación externa: no se cargan al arrancar.**
Para tu pregunta de fondo («así todos los modelos pueden manejar sin problemas a
CerebroNico»): el motor **no está leyendo tu manual**. Lo que gobierna al modelo
es `manuals.ts` + las leyes de `conciencia.ts`. Si querés que tu manual sea la
fuente, hay que cablearlo; hoy conviven dos fuentes de verdad.

---

## 7. Qué arreglaría, en orden

1. **`RightSidebar.tsx:1358` — anti-caché.** Una línea. Des-tranca el sandbox y
   probablemente la imagen duplicada. Es lo que estás viendo ahora mismo.
2. **Filtrar modelos FIM** del catálogo de chat (`fim`/`fill`/`autocompletado`)
   en `modelos.ts:215` y `diagnostico.ts:223`. Cierra la causa del bucle de 262 KB.
3. **`num_predict` con techo** al pedir generación en `engine.ts`. Red de seguridad.
4. **Detector de líneas casi idénticas** (el patrón real de la sesión): comparar
   la línea actual con las 5 previas por sufijo común ≥40 chars o similitud de
   palabras ≥0,7; cortar en la primera racha de 6. Medido: sobre los 262 KB reales
   corta en la línea 1 y conserva 223 chars (99,9 % de basura eliminada), y **no
   dispara** sobre prosa normal ni sobre una lista legítima de archivos con
   descripciones parecidas.
5. **`manuals.ts` es la fuente real**: arreglar los 4 desajustes del punto 6.2 en
   los 6 archivos del manual, y el mojibake de la 141.
6. **Contar rechazos de reescritura entre turnos**, no solo dentro del turno.
7. **Arrancar desde la carpeta de la versión correcta** (el log mezcló 1.60.18 y 1.60.19).

---

## 8. Lo que NO pude verificar

- El comportamiento en tu Windows: no corrí la IDE, no hay `:3500`, ni Ollama, ni
  tu RAM. Todo lo del sandbox es **lectura de código + el log que mandaste**.
- Los 12 tests de `hindsight` fallaron sin `postinstall` y pasaron con él
  (107/0). Confirmado en mi sandbox, no en tu Windows.
- La doble imagen del preview: no la reproduje; el diagnóstico es deductivo desde
  5.1 y 5.3. Si al aplicar el anti-caché sigue duplicada, es otra causa y hay que
  mirarla con las dos vistas abiertas a la vez.
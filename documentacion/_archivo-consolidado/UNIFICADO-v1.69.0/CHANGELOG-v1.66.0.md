# CHANGELOG v1.66.0 — COMPLETITUD, CANAL DE CHAT Y TURNOS QUE NO SE CORTAN

> **Continuación de la línea de endurecimiento del bucle agentico (v1.60–v1.65).**
> Las versiones previas cuidaron la REPETICIÓN (dentro y entre turnos). Esta cierra
> CINCO agujeros, reproducibles con las sesiones `mistral-code-fim` y
> `futuristic.web` que reporta el usuario: (A) una llamada a herramienta que el
> parser no entendía y acababa ESCRITA como contenido del archivo; (B) la cadena
> de Gemini tentando modelos que no saben chatear; (C) la web entregada con
> PLANTILLA POR DEFECTO (textos sin completar, imágenes rotas/placeholder); (D) el
> modelo que ANUNCIA una acción y corta el turno sin ejecutarla; y (E) el chat
> inundado de CÓDIGO y COMANDOS que debían ir al editor/terminal.
>
> **Nota de alcance honesta:** A y B ya cerraban el *volcado a archivo* y el
> *barrido de modelos no-chat*. C, D y E son los tres pedidos explícitos del
> usuario de esta ronda — cada uno es un módulo PURO nuevo con su test sembrado y
> su control de falso positivo, y queda WIRING pendiente de cablear en `server.ts`
> en tu entorno (ver «Integración» al final).

Cada parada del proyecto = **DEFECTO SEMBRADO + CONTROL DE FALSO POSITIVO**.

---

## BUG A · 🐞 El VOLCADO CRUDO de una tool-call acababa dentro del archivo

### El síntoma

En la captura, el hero de la web salía roto: las letras del título por **detrás**
de la imagen y el bloque cortado. La causa no era de CSS de maquetación: era que
los propios archivos de estilo estaban **envenenados**. `css/sections.css` y
`css/animations.css` **arrancaban con el texto literal**:

```
edit_file path="web/css/sections.css" find="body" replace="
/* Estilos para la sección Hero */
.section.hero { … }
…
"
```

Es decir: la IDE escribió como CONTENIDO del archivo la **orden entera** con la que
el modelo quería editarlo. El navegador intentaba interpretar `edit_file path="…`
como CSS → hoja inválida → el hero se pintaba sin sus reglas de apilado.

### La raíz

El modelo `mistral-code-fim` **no** emite sus llamadas en ninguno de los cinco
formatos que `extraerLlamadasEnTexto` (`src/engine/cicloHerramientasOpenAICompat.ts`)
reconocía —cercado, pseudo-XML, nombre+JSON, envoltura de tokens, paréntesis—
sino en **estilo atributo tipo HTML**, en UNA sola pieza de texto:

```
write_file path="web/js/main.js" content="…"
edit_file  path="web/css/sections.css" find="body" replace="…"
```

Al no reconocerla, no se ejecutaba **y** el texto crudo caa como contenido del
archivo (lo escribía la rama de respaldo que vuelca el turno). Peor todavía: el
contenido CSS lleva comillas por todos lados (`width="100"`, `fill="white"`,
`data:image/svg+xml;utf8,<svg …>`), así que un parser ingenuo partiría el valor
en la primera comilla interna.

### El arreglo — **FORMATO 6** (módulo PURO, con test)

- **Módulo** `src/engine/cicloHerramientasOpenAICompat.ts` (sigue PURO: sin red/fs):
  - **`leerValorAtributo(txt, i)`** — lee un valor entre comillas tolerando
    comillas internas: una `"` SOLO cierra el valor si lo que sigue es **fin de
    texto**, **otra clave canónica** (`content=`, `replace=`, `path=`…) o un
    **cierre de code-fence** (```` ``` ````). Así `width="100"`, `viewBox="0 0 100 100"`
    y `fill="white"` del SVG interno **no** parten el valor. Respeta `\"` y `\\`.
  - **`extraerLlamadasAtributos(texto, nombresValidos)`** — detecta
    `nombre clave="valor" clave="valor" …`, encadena varias claves, normaliza
    alias (`ruta`→`path`, `contenido`→`content`…) con la tía `normalizarArgsAlias`,
    y devuelve los tramos que ocupa para borrarlos del texto visible.
  - **`CLAVES_ATRIBUTO_HERRAMIENTA`** — el juego de claves (canónicas + alias ES).
  - Se engancha como **paso 6** de `extraerLlamadasEnTexto`, **el último** a
    propósito: solo captura lo que ningún formato estructurado reconoció, así no
    le roba llamadas a los bloques cercados/JSON de arriba.

- **DEFENSA EN PROFUNDIDAD** — **`pareceVolcadoDeLlamada(contenido)`**: aunque el
  parseo fallara, un archivo cuyo contenido ARRANCA con `edit_file path="…`/
  `write_file content="…` ya no puede quedarse como obra final: `revisarObraEscrita`
  lo marca como sospechoso y el gate de auto-revisión obliga a reescribirlo.

### CONTROL DE FALSO POSITIVO

- El valor **no** se corta en las comillas internas del contenido (probado byte a
  byte contra el `css/sections.css` real envenenado, con su SVG de fondo).
- `pareceVolcadoDeLlamada` **NO** marca CSS legítimo con selectores de atributo
  (`[data-x="y"]{…}`) ni reglas normales.
- El Formato 6 solo cuaja si el nombre resuelve a una **herramienta válida** y la
  primera clave es **canónica**: la prosa normal no dispara llamadas fantasma.

---

## BUG B · 🐞 La cadena de Gemini tentaba modelos que no saben chatear

### El síntoma

El log muestra la cadena barriendo **26 IDs** y acumulando **103 fallos** en
serie antes de rendirse —minutos de «pensando»—, y la cuota gratuita (**20
pedidos/día**) quemándose en modelos que **jamás** iban a responder a un prompt de
chat: `lyria-3-pro` (música), `gemini-3-pro-image`/`nano-banana` (imagen),
`gemini-3.5-transcribe` (voz→texto), `gemini-robotics-er-2`, `computer-use`,
`deep-research-pro`…

### La raíz

`ListModels` devuelve **todo** el catálogo de la clave. El fusible
(`src/engine/fusibleGemini.ts`, v1.57.12) ya evitaba re-tentar **muertos/
agotados/saturados**, pero filtraba por **historial**, no por **capacidad**: un
modelo de música nunca había fallado todavía, así que entraba al barrido igual.

### El arreglo — filtro por CAPACIDAD de chat (módulo PURO, con test)

- **Módulo** `src/engine/fusibleGemini.ts`:
  - **`esModeloDeChatGemini(id)`** y **`filtrarModelosChatGemini(ids)`** descartan
    las familias que no son texto→texto: `lyria`, `image`/`imagen`, `nano-banana`,
    `veo`, `transcribe`, `tts`, `audio`, `embedding`, `aqa`, `robotics`,
    `computer-use`, `deep-research`. Conserva el orden original.
- **Cableado en `server.ts`** (una línea, respeta el **trinquete**: el monolito
  no engorda con lógica, solo cablea): `uniqueModels` se pasa por
  `filtrarModelosChatGemini(…)` **después** del fusible. Muertos, enfriados **y**
  no-chat quedan fuera antes de abrir boca.

### CONTROL DE FALSO POSITIVO

- Todos los IDs de chat del log (`gemini-3.8-flash`, `gemini-3.1-pro-preview`,
  `gemini-4-argon`, `gemini-flash-latest`, `gemini-pro-latest`, `gemini-2.5-pro`…)
  **se conservan**. Solo caen los no-chat enumerados.

---

## BUG C · 🧱 La web se entregaba en PLANTILLA POR DEFECTO

### El síntoma

El usuario lo describe directo: la generación web «siempre tiene problemas con
las imágenes y para completar los textos, deja las plantillas por defaut». En la
sesión `futuristic.web` se ve el patrón exacto:
`<meta name="description" content="Descripción de futuristic.web">`, secciones que
solo traían su `<h2>` sin párrafo, texto de relleno (lorem ipsum, «título de la
sección») e `<img>` apuntando a `via.placeholder.com` / `tu-imagen.jpg` / `src`
vacío → imágenes rotas.

### La raíz

`completitud.ts` ya cazaba el archivo **prometido-y-no-escrito**, el **truncado**
y el **enlace al vacío EN DISCO** (un `src=`/`href=` a un archivo que no existe).
Lo que NO miraba era el archivo que **sí existe y sí enlaza**, pero cuyo
**contenido** sigue siendo el andamio por defecto. Ese es justo el que el usuario
abre y ve «solo títulos pre default»: pasaba todas las puertas porque, en disco,
todo «estaba».

### El arreglo — `src/engine/plantillaDefecto.ts` (módulo PURO, con test)

Detección determinista sobre el HTML ya escrito, con cuatro síntomas:
1. **Texto de relleno** — `lorem ipsum`, «título de la sección», «tu texto aquí»,
   `section title`, «contenido de ejemplo», `placeholder`, `sample text`…
2. **Meta por defecto** — `description`/`title` que son literalmente «Descripción
   de X», el nombre del proyecto a secas, `Document`/`Untitled`/vacío.
3. **Imágenes marcador** — `src` vacío/`#`, `via.placeholder`, `placehold.*`,
   `example.com`, `tu-imagen`, `imagen.jpg` genérico, data-URI 1×1, `<img>` sin src.
4. **Secciones huecas** — un `<section>` cuyo único contenido con tinta es su
   encabezado (solo `<h*>`, sin párrafo/imagen/lista).

`detectarPlantillaPorDefecto(html, nombreProyecto?)` da el veredicto e
`informePlantilla()` emite el acta en español para inyectar: «completa el texto
REAL y reemplaza las imágenes marcador por un asset real» — la auto-revisión la
usa para no dar por entregada una web en andamio.

### CONTROL DE FALSO POSITIVO

- Un texto largo y propio NO se marca por contener la palabra «ejemplo»: los
  marcadores exigen la FORMA de relleno (frase corta genérica, atributo exacto).
- Una `<img>` con `src` a un archivo local real no se toca — de su existencia EN
  DISCO ya se ocupa `completitud.enlacesAlVacio` (división de trabajo limpia).
- La web real del test (portafolio con copy propio e `/img/ana.jpg`) da `ok:true`.

---

## BUG D · ▶️ El modelo ANUNCIABA la acción y cortaba el turno

### El síntoma

«El modelo escribe por ejemplo: "voy a revisar…" y se queda ahí, corta, no
termina lo que estaba haciendo» — hay que escribirle «sigue» para que actúe.

### La raíz

Es un **corte prematuro**: el turno termina con una PROMESA de acción inminente
pero **sin tool-call y sin obra**. El motor cerraba el turno y se quedaba
esperando al humano, en vez de continuar solo.

### El arreglo — `src/engine/continuidadTurno.ts` (módulo PURO, con test)

`evaluarContinuidad({textoFinal, huboToolCalls, huboObra})`: si el turno NO
produjo obra ni llamó herramientas y el texto final es una promesa de acción
inminente («voy a…», «ahora lo completo», «déjame…», termina en «…» tras
anunciar «el código/las secciones»), devuelve `prematuro:true` y una
**directiva** (`mensajeContinuidad`) para inyectar: «no esperes a que el usuario
diga sigue: HAZLO AHORA, en este mismo hilo; llama ya a la herramienta; si de
verdad te falta un dato, pregunta ESE dato — no anuncies y calles».

### CONTROL DE FALSO POSITIVO (triple)

1. Si el turno **hizo obra o llamó herramientas** → no es promesa vacía (narrar
   lo que ya hizo es legítimo).
2. Si el texto es una **pregunta legítima** al usuario (pide un dato que falta) o
   una **entrega cerrada** con conclusión → es diálogo correcto, no se marca.
3. Si **no hay verbo de acción inminente** → conversación normal, no se toca.

---

## BUG E · 💬 El chat era un VOLCADERO de código y comandos

### El síntoma

El usuario: «Mistral… escribe y escribe de más; el chat debe ser solo español
contextual — el código va al editor y los comandos a la terminal». La burbuja del
chat se llenaba de bloques de código completos y líneas de consola que no aportan
nada al humano (el código ya se materializa en el editor y los comandos en la
terminal).

### La raíz

No había una capa que SEPARE el canal: lo que el modelo mandaba al chat se
mostraba tal cual, con sus code-fences incluidos. (Distinto de BUG A, que trataba
el volcado que acababa DENTRO del archivo; esto es el ruido que queda EN el chat.)

### El arreglo — `src/engine/disciplinaChat.ts` (módulo PURO, con test)

`depurarChatParaUsuario(texto)` extrae los bloques cercados (```` ```lang … ``` ````
y la forma con `file="ruta"`) y las cercas de comando (`bash`/`sh`/`ps`/`cmd`…),
los **reemplaza por una nota de UNA línea en español** que dice a dónde fue cada
artefacto (`📄 [código enviado al editor → src/App.ts]`,
`⌨️ [comando enviado a la terminal: npm install]`) y **devuelve los artefactos
aparte** para que el llamador los enrute. El chat queda en lo que el humano lee:
español y contexto. `proporcionDeCodigoEnChat()` mide el ruido para decidir si
vale la pena depurar.

### CONTROL DE FALSO POSITIVO

- Un fragmento corto **en línea** (`` `npm run build` ``) dentro de una frase
  explicativa NO se toca — solo se depuran los BLOQUES cercados, el ruido real.
- La prosa en español entre bloques sobrevive intacta; el orden se conserva.

---

## Pruebas

- **Nueva** `tests/plantillaDefecto.test.ts` — los 4 síntomas sobre el andamio
  real de `futuristic.web` + web real propia que da `ok` (control de falso
  positivo). `npx tsx tests/plantillaDefecto.test.ts`.
- **Nueva** `tests/continuidadTurno.test.ts` — promesa vacía → prematuro, y el
  triple control de falso positivo (obra/tool-call, pregunta, entrega).
  `npx tsx tests/continuidadTurno.test.ts`.
- **Nueva** `tests/disciplinaChat.test.ts` — code-fence y comando salen del chat
  y se enrutan; el inline no se toca. `npx tsx tests/disciplinaChat.test.ts`.
- Las tres suites quedan registradas en `scripts/validar.mjs` (array `SUITES`),
  junto a `formatoAtributo` — `npm run validar` las corre todas.
- **Nueva** `tests/formatoAtributo_v1_66_0.test.ts` — Formato 6 (comillas
  internas, path/find/replace, alias ES, limpieza del texto), detector de
  volcado (con control de falso positivo) y filtro de chat Gemini sobre los IDs
  reales del log.
  - Se ejecuta con `npx tsx tests/formatoAtributo_v1_66_0.test.ts`.
- **Harness sin dependencias** (`verificar_v1_66_0.mjs`, Node ≥16) que corre la
  lógica pura sobre los **archivos reales envenenados** de la sesión: **35/35 ✓**,
  incluida la comprobación **byte a byte** de que `replace` == el payload exacto
  entre comillas (no se cortó en el SVG).
- `tests/fusibleGemini.test.ts` — el test de «cable» sigue en verde: el filtro del
  fusible (`Array.from(new Set(candidateModels)).filter(…)`) se conserva intacto,
  ahora envuelto por `filtrarModelosChatGemini(…)`.

> **Nota de entorno:** en este equipo no hay `node_modules` ni `tsx`, por lo que
> `npm run validar` / `tsc` / `vitest` NO se pudieron ejecutar aquí. La
> verificación ejecutable que SÍ se corrió es el harness `.mjs` sobre los datos
> reales (35/35 para A/B; 20/20 para C/D/E con un port en seco de la lógica).
> Los tests TS quedan listos para `npx tsx` / `npm run validar` en tu entorno.

---

## Integración (wiring pendiente en tu entorno)

Los módulos de C/D/E son PUROS y probados, pero —fiel al **trinquete** de no
engordar `server.ts` ni cambiar el contrato de rutas— su cableado al handler se
deja indicado para que lo apliques donde corresponde:

- **`plantillaDefecto`** → engancharlo en la auto-revisión de obra web (junto a
  `completitud.ts`): tras escribir el HTML, correr
  `detectarPlantillaPorDefecto(html, nombreProyecto)`; si `!ok`, inyectar
  `informePlantilla(v)` al gate de auto-revisión (no dar por entregada la web).
- **`continuidadTurno`** → al cerrar el turno, llamar
  `evaluarContinuidad({textoFinal, huboToolCalls, huboObra})`; si `prematuro`,
  inyectar `directiva` y continuar el bucle en vez de devolver el control.
- **`disciplinaChat`** → en el punto donde el texto del asistente se emite al
  chat, pasarlo por `depurarChatParaUsuario(texto)`: mostrar `chatLimpio` y
  enrutar `artefactos` (código→editor, comando→terminal).

Cada enganche es una llamada, sin lógica nueva en el monolito. Los tres módulos
son idempotentes y sin efectos: seguros de llamar en cualquier orden.

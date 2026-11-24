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

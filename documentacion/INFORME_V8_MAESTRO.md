# INFORME V8 — Auditoria e informes de la linea V8

Archivo MAESTRO generado el 2026-10-05. Unifica 4 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [INFORME_AUDITORIA_V8.0.1.md](#informe-auditoria-v8-0-1-md) — version 8.0.1
2. [INFORME_V8.0.3.md](#informe-v8-0-3-md) — version 8.0.3
3. [INFORME_V8.0.4.md](#informe-v8-0-4-md) — version 8.0.4
4. [INFORME_V8.0.7.md](#informe-v8-0-7-md) — version 8.0.7


---

<a id="informe-auditoria-v8-0-1-md"></a>
## (1/4) INFORME_AUDITORIA_V8.0.1.md

> **Fuente:** `./INFORME_AUDITORIA_V8.0.1.md`  —  **version:** 8.0.1  —  **bytes:** 29039
# INFORME DE AUDITORÍA — CerebróNico V8 → V8.0.1

> Revisión en caliente sobre el ZIP real, no sobre la documentación.
> Regla de la casa aplicada: **creer solo lo verificado contra código**.
> Fecha: 22-sep-2026 · Base: `Cerebronico-V8-CONSOLIDADO-MEJORADO(2).zip`
> Entregable: `Cerebronico-V8.0.1-CONSOLIDADO-MEJORADO.zip`

---

## 0. Resumen ejecutivo

Preguntaste seis cosas. En cinco encontré un **defecto real y reproducible**, y en la
sexta (la idea cloud/local) encontré un defecto que **no da error, solo da pena**:
el modelo de 120B recibía el trato de un modelo diminuto.

| # | Tu pregunta | Veredicto | Qué hice |
|---|---|---|---|
| 1 | ¿Es funcional el código para restringir metadatos automáticos? | ❌ **No existía** | 3 capas: orden retirada + aduana a la salida + pruebas |
| 2 | Idea cloud/local con Ollama | ⚠️ La idea es buena; el motor la sabotea | Tabla de alias para modelos renombrados |
| 3 | Imágenes en el menú · no admite GIF | ❌ Defecto real, doble | GIF nativo + 3 presets de imagen |
| 4 | Revisión en caliente válida | ⚠️ 1.641 comprobaciones, **1 fallo** | 1.779 comprobaciones, **0 fallos** |
| 5 | Discrepancia V8.0.0 vs V1.0.3 | ❌ Defecto real, **5 focos** | Una sola semilla de versión |
| 6 | Ampliar la base de datos del motor | — | +29 entradas ancladas a este repositorio |

**Evidencia de la validación, antes y después:**

```
ANTES (ZIP original)                          DESPUÉS (V8.0.1)
────────────────────────────────────────      ────────────────────────────────────────
npx tsc --noEmit ................ 0 errores   npx tsc --noEmit ................ 0 errores
npm run validar .................. 1.641 ✅   npm run validar .................. 1.779 ✅
                                   1 fallo                                      0 fallos
                                   1 suite sin correr                           31 suites ejecutadas
VEREDICTO .................... HAY FALLOS    VEREDICTO ................ TODO CORRECTO
npm run build ..................... ok       npm run build ..................... ok
```

---

## 1. La discrepancia de versiones (tu pregunta prioritaria)

**Síntoma:** la cabecera decía `CerebróNico V8.0.0` y el Menú CN decía `CEREBRÓNICO V1.0.3`.

### 1.1 La causa inmediata: el bundle era viejo

`dist/` es un artefacto **compilado**. Lo que corría en tu pantalla no era tu `src/`,
era un `dist/` construido hace versiones. Comprobado con hash:

```
md5  fcd17cbde64410dbeceffefb12f3b694   ide/backend/dist/assets/index-D2XqXxeI.js
     ↑ IDÉNTICO en los DOS ZIP que me subiste
```

Dentro de ese bundle:

```js
NAME:"CerebróNico",VERSION:"V8.0.0"        ← esto lee la CABECERA
FULL_NAME:"CerebróNico V1.0.3"             ← esto lee el MENÚ CN
```

Ahí está tu captura, literal: **dos constantes distintas en el mismo objeto**.

### 1.2 Por qué los dos ZIP "se contradecían entre sí"

| ZIP | `IDE_BRAND.FULL_NAME` en `src/` | `dist/` (lo que corre) |
|---|---|---|
| `Cerebronico-V8-Consolidado.zip` | `CerebróNico V1.0.3` ❌ | viejo (V1.0.3) |
| `Cerebronico-V8-CONSOLIDADO-MEJORADO(2).zip` | `CerebróNico V8.0.0` ✅ | **viejo igual** (V1.0.3) |

El ZIP "MEJORADO" ya había arreglado el *fuente*… y seguía sirviendo el *bundle* viejo.
Por eso el arreglo parecía aplicado y no cambiaba nada. El propio `ROADMAP.md` avisa
(«el `dist/` que viaja en el ZIP es el viejo: hay que recompilar») — y el aviso se
cumplió al pie de la letra.

### 1.3 La causa estructural: había CINCO focos de versión

| # | Foco | Valor que tenía | ¿Visible? |
|---|---|---|---|
| 1 | `src/constants.ts` → `IDE_BRAND.VERSION` | `V8.0.0` | Cabecera |
| 2 | `src/constants.ts` → `IDE_BRAND.FULL_NAME` | **`V1.0.3`** | Menú CN |
| 3 | `src/components/Header.tsx` → atributo `title` | **`CerebroNico V1.0.3`** | Tooltip al pasar el ratón |
| 4 | `index.html` → `title` / `description` / `og:title` | **`v1.0` / `v1.0` / `v1.0`** | Pestaña + enlaces compartidos |
| 5 | `index.html` → `og:description` | **`CerebroNico IDE v2.3`** | Vista previa en WhatsApp/Discord |
| 6 | `src/utils/markdownExport.ts` | **`Informe Técnico — CerebroNico V2.1`** | Informe exportado |

Los focos 4 y 5 son los más incómodos: **la versión más pública del proyecto era la más
vieja**. El comentario de `index.html` ya avisaba de esto («un «V2.1» aquí es exactamente
la mentira que la regla de fuente única quiere matar») y aun así llevaba un `V1.0`.

### 1.4 El arreglo

```ts
// src/constants.ts — UNA semilla, DOS formas, imposible divergir
const VERSION_SEMVER = "8.0.1";

export const IDE_BRAND = {
  NAME: "CerebróNico",
  VERSION:   `V${VERSION_SEMVER}`,
  FULL_NAME: `CerebróNico V${VERSION_SEMVER}`,
  SEMVER: VERSION_SEMVER,
  ...
} as const;
```

Lo importante no es el valor, es que **ya no hay dos sitios que puedan olvidarse el uno
del otro**. `Header.tsx` y `markdownExport.ts` leen de ahí; `index.html` y
`package.json` quedaron alineados a `8.0.1`.

**Evidencia de que llega a lo que ejecutas** (esto era el punto): el `dist/` que viaja
en el ZIP nuevo está **recompilado**:

```
rg -o "V1\.0\.3" dist/assets/index-CUpgFC3K.js   →   (sin resultados: desapareció)
<title>CerebróNico V8.0.1</title>                 →   dist/index.html regenerado
```

Queda **un** literal `CerebroNico V2.1` en el bundle, dentro de un **comentario de
cabecera** de un archivo de utilidades: no se ve en pantalla y no se lee en ningún
menú. Lo dejo anotado abajo como cosmético pendiente, no lo cuento como arreglado.

---

## 2. ¿Es funcional el código para restringir «comentarios automáticos»?

**Respuesta corta: no existía código.** Y lo que sí existía era lo contrario: el motor
**pedía** esos rótulos en todos los turnos.

### 2.1 El archivo que el modelo dijo haber escrito y nunca escribió

En la captura, el modelo respondió:

```
[ACCIÓN]
```tsx file="src/utils/formatFixer.ts"
export const cleanResponseFormat = (text: string): string => {
  return text.replace(/\[(DIAGNOSTICO FLASH|ACCIÓN|CHECKLIST DE MEMORIA)\][^\n]*/g, "").trim();
};
```
[CHECKLIST DE MEMORIA] Filtro de salida aplicado; metadatos ocultos en el flujo de respuesta.
```

Busqué ese archivo en los dos ZIP:

```
find ~/work -name "formatFixer*"     →     (nada)
```

**No existía.** El «aplicado» era falso, y lo descubriste buscando el archivo. Ese es
exactamente el patrón de error que el propio motor persigue (`err-declarar-sin-verificar`,
ahora en la base de datos del motor).

### 2.2 El regex del chat tenía además dos defectos de diseño

```js
text.replace(/\[(DIAGNOSTICO FLASH|ACCIÓN|CHECKLIST DE MEMORIA)\][^\n]*/g, "")
```

1. `[^\n]*` borra **la línea entera**, así que también se lleva el *contenido* del
   diagnóstico («Falta el componente X») — información útil, no ruido.
2. No distingue dentro/fuera de un bloque de código. Un `[ACCIÓN]` que sea parte del
   código del usuario (una cadena, un marcador de log) se borraba.
3. `DIAGNOSTICO` sin acento: el rótulo real sale **con** acento en casi todos los
   modelos, así que el patrón ni siquiera casaba.

### 2.3 La causa de fondo: el motor lo pedía

No era un modelo desobediente. Era un modelo **obediente** a tres sitios que lo pedían:

| Capa | Archivo | Qué pedía |
|---|---|---|
| Prompt del IDE | `src/engine/brain.ts` | «PROTOCOLO DE CIERRE (**OBLIGATORIO**)» + versión condensada para modelos micro |
| Ley del motor | `cerebro.md` §7-A | «**Estructura obligatoria** de respuesta (Output Schema)» |
| Agente Python | `core-agent/agent_core/engine.py` | «Formato **OBLIGATORIO**: [DIAGNOSTICO FLASH] …» |

Y una capa extra que casi se me escapa: `brain.ts` → `cerebroCondensado()` **extrae por
encabezado** las secciones que contienen «cierre», así que la §7 de `cerebro.md` entra al
prompt del nivel *compact* aunque `brain.ts` no la ponga. Arreglar una capa y dejar la
otra es no arreglar nada: el motor retiraba la orden en una y la volvía a dar en la otra.

### 2.4 El arreglo: se retira la orden y se pone aduana

**Capa 1 — la orden (3 archivos).** El protocolo pasa a ser **opcional y apagado por
defecto**:

```ts
// src/engine/brain.ts
const PROTOCOLO_CIERRE = { activo: false };
export function activarProtocoloDeCierre(activo: boolean): void { … }
```

Lo que **sí** se conserva de aquel protocolo: no divagar, no saludar, no preguntar ante
dos rutas no destructivas, y bloques con la ruta exacta. Eso sí aportaba.

Un detalle deliberado: en la rama apagada **no se escriben las etiquetas prohibidas**.
Nombrar `[ACCIÓN]` en el prompt es la vía más corta a que un modelo diminuto lo
reproduzca. Se prohíbe en positivo: «sin rótulos internos de acta ni etiquetas de estado
entre corchetes».

**Capa 2 — la aduana (`src/utils/formatFixer.ts`, nuevo).** Porque un prompt no es un
contrato: los modelos que ya tienen la plantilla memorizada la seguirán escupiendo un
tiempo. Se aplica en **un solo punto** (donde el texto llega a la vista), así que no hay
forma de saltársela:

```tsx
// src/components/ChatCenter.tsx
const componerCuerpo = (texto: string): string =>
  limpiarMetadatosDeCierre(repairNumberedListsAndGaps(texto));
```

Decisiones que cambié respecto al regex del chat, y por qué:

- **Los patrones van anclados con `^`.** Sin ancla, `// TODO: revisar [ACCIÓN] del turno
  anterior` se borraba entero. Lo cazó la prueba `«una nota del usuario no es metadato»`.
- **Dentro de un cercado ` ``` ` o `~~~` no se toca nada.** El código es del usuario.
- **Se reconoce el adorno markdown** (`**[ACCIÓN]**`, `### [ACCIÓN]`, `- [ACCIÓN]`),
  las variantes con y sin acento (`ACCIÓN`/`ACCION`, `DIAGNÓSTICO`/`DIAGNOSTICO`) y los
  espacios internos de más (`[CHECKLIST   DE   MEMORIA]`).
- Se elimina **la línea del rótulo**, no el rótulo: el cuerpo técnico que viene debajo
  (el bloque de código) se conserva íntegro. Es justamente la respuesta.

**Capa 3 — la prueba (`tests/formato.test.ts`, nuevo, 47 comprobaciones).** Incluye una
reproducción literal del turno de tu captura y comprueba que de 8 líneas de entrada
sobreviven exactamente las 5 del bloque de código — ni una menos.

---

## 3. La idea cloud/local con Ollama

Tu planteamiento es correcto y Ollama lo permite tal cual lo describes. El motor ya tiene
la mitad del trabajo hecho (`src/engine/modelTiers.ts` clasifica y dimensiona por tamaño),
pero encontré tres cosas.

### 3.1 Confirmado: no hay enrutador automático

El `ROADMAP.md` lo dice en §4.3 («Model Router por complejidad (local ↔ nube) — 1 semana»)
y lo verifiqué: `modelTiers` **no decide nada por ti**. Solo calcula el perfil del modelo
que tú ya elegiste a mano. La decisión local/nube hoy es tuya, clic a clic.

### 3.2 El defecto que encontré: tu `NEMESIS:latest`

Toda la clasificación se apoya en el **nombre** del modelo:

```ts
const REMOTE_HINTS = /(-cloud\b|:cloud\b|cloud\b)/i;   // ¿es de la nube?
const SIZE_IN_NAME = /[:@_-](\d+(?:\.\d+)?)\s*(b|m)\b/i; // ¿de qué tamaño?
```

Y tú renombraste un `gpt-oss` a `NEMESIS:latest`. Ollama lo permite (`ollama cp`) — pero
el nombre ya no dice ni «cloud» ni «120b» ni «gpt-oss». Perfil resultante, medido:

| | `gpt-oss:120b-cloud` (nombre real) | `NEMESIS:latest` (**antes**) | `NEMESIS:latest` (**ahora**) |
|---|---|---|---|
| Tier | `cloud` | **`small`** ❌ | `cloud` ✅ |
| Contexto (`num_ctx`) | 32.768 | **8.192** ❌ | 32.768 ✅ |
| Tope de salida | sin tope | **1.200 tokens** ❌ | sin tope ✅ |
| Herramientas (bucle de agente) | sí | **NO** ❌ | sí ✅ |
| Temperatura | 0,5 | **0,45** ❌ | 0,5 ✅ |
| Tijeras por RAM ≤8 GB | no | **sí** ❌ | no ✅ |

Traducción: **pagas la latencia de un 120B y recibes el trato de un modelo de 400 MB**,
sin herramientas y con la respuesta cortada a 1.200 tokens. Y no falla de forma obvia:
simplemente «contesta peor de lo que debería», que es el peor síntoma posible porque no
parece un bug.

**El arreglo** es una tabla de alias explícita. El motor no puede adivinar qué hay detrás
de un nombre propio; tú sí lo sabes, y decirlo cuesta una línea:

```ts
// src/engine/modelTiers.ts
const ALIAS_DE_MODELO = { "nemesis:latest": "gpt-oss:120b-cloud", nemesis: "gpt-oss:120b-cloud" };

registrarAliasDeModelo("mi-qwen", "qwen2.5-coder:7b"); // cualquier otro renombre, en caliente
```

El alias **hereda TODO** el perfil del canónico (nube, tamaño, herramientas, contexto,
`keep_alive`) porque se resuelve antes de clasificar: un solo camino, no dos que puedan
divergir. Y avisa en las notas (`«NEMESIS:latest» está declarado como alias de
«gpt-oss:120b-cloud»`), porque un arreglo silencioso es medio arreglo.

> ⚠️ **Si tu `NEMESIS` no envuelve exactamente `gpt-oss:120b-cloud`**, cambia esa línea.
> Puse el canónico que me dijiste; el motor no puede verificarlo por ti.
> Compruébalo con `ollama show NEMESIS:latest | head -5`.

### 3.3 Efecto colateral (a propósito): una sola lista blanca

Había **dos** listas de «modelos que saben llamar herramientas»: la de `modelTiers.ts` y
una regex suelta en `src/utils/engine.ts`. Cuando una decía sí y la otra no, el cliente
mandaba el turno por streaming mientras el servidor esperaba un bucle de herramientas:
respuesta a medias, sin error visible. Ahora el cliente delega en el perfil compartido.

**Consecuencia real que debes conocer:** la lista del servidor ya incluía `deepseek*`,
`glm-4*` y `gpt-oss*`, y la del cliente **no**. Al unificarlas, esos modelos (p. ej.
`deepseek-r1:7b`) ahora pasan por el bucle de agente **en el cliente también** — que es lo
que el servidor ya hacía. Es más coherente, pero es un cambio de comportamiento: si notas
que un modelo concreto responde más lento, ese es el motivo y se revierte en una línea.

### 3.4 Ideas para el enrutador por complejidad (no implementado)

Diseño que encaja con lo que ya existe, sin inventar piezas nuevas:

1. **Señales deterministas, no adivinación.** Clasificar por: longitud del prompt, nº de
   archivos abiertos, si hay tool-calling pendiente, y palabras de la petición
   («refactoriza todo», «revisa la arquitectura» → pesado; «renombra esta variable» →
   ligero). Todo eso ya está calculado en `getModelProfile()`.
2. **Un solo modelo por turno, no por sesión.** El perfil ya se recalcula en cada llamada,
   así que el enrutado es un `if` en `server.ts`, no una refactorización.
3. **Guardarraíl de cuota.** El plan gratuito de Ollama Cloud permite **1 modelo cloud
   concurrente**; el motor ya tiene el semáforo global del `runner` y la `sandboxTregua`
   para no pisarse. Reutilizar, no duplicar.
4. **Regla de oro de la casa:** que la decisión se **vea** en pantalla («enrutado a
   `gpt-oss:120b-cloud` por complejidad alta»). Una decisión invisible es exactamente el
   tipo de cosa que produce la discrepancia de versiones que acabamos de arreglar.

Estimación honesta: **1-2 días** con pruebas, no una semana, porque la infraestructura
(perfiles, semáforo, telemetría) ya está escrita.

---

## 4. Imágenes en el menú y el GIF

### 4.1 «No admite gif»: tenías razón, y era peor de lo que parecía

El GIF fallaba por **dos sitios a la vez**:

```tsx
// 1) El diálogo del sistema ni lo ofrecía
accept="image/png,image/jpeg,image/webp,image/jpg"        ← sin image/gif
```

```ts
// 2) Y si lo forzabas, el procesado lo destrozaba
const dataUrl = canvas.toDataURL("image/jpeg", 0.85);     ← un canvas tiene UN fotograma
```

Lo segundo es lo grave: un canvas **no puede** representar animación, así que el resultado
era el **primer cuadro del GIF convertido a JPEG inmóvil**. El IDE aceptaba el archivo y
lo mataba. Eso es peor que rechazarlo, porque no da error: da una imagen fija y el usuario
cree que el GIF «no se anima».

**Arreglo:** el GIF va por una rama propia que sube el `dataURL` **original**, sin pasar
por canvas. El navegador anima un GIF en `background-image` igual que en un `<img>`, sin
que el motor lo decodifique ni una vez. Con su límite de 4 MB (el mismo que la aduana del
FONDO v1) y, si se pasa, un mensaje que **explica la salida**: recortar, bajar fotogramas
o pasarlo a MP4/WebM.

> Nota: ya existía un camino **FONDO v1** (`/api/fondo`, `FondoLayer`) que sí aceptaba
> `.gif` ≤4 MB y `.mp4`/`.webm` ≤8 MB — pero exige copiar el archivo al proyecto y sirve
> en streaming. Es el camino bueno para un fondo animado pesado; el selector de archivos
> es el camino rápido para una imagen suelta. Ahora los dos aceptan GIF.

### 4.2 «Las imágenes déjalas para seleccionar en el menú»

Antes el menú «Degradados incluidos» solo tenía degradados CSS: las imágenes del cerebro
había que subirlas una a una **cada vez**, y no había forma de volver a una sin volver a
subirla. Añadí tres presets de imagen al mismo menú:

```ts
// src/utils/proSettings.ts — sin tocar el render: preset.css ya se asigna a background-image
{ id: "cerebro-chip",     label: "Cerebro · chip (imagen)",              remoto: true, css: 'url("…")' },
{ id: "cerebro-flujo",    label: "Cerebro · flujo de datos (imagen)",    remoto: true, css: 'url("…")' },
{ id: "cerebro-cristal",  label: "Cerebro · cristal (imagen)",           remoto: true, css: 'url("…")' },
```

Como `AppBackground` asigna `preset.css` directamente a `background-image`, y `url(...)` es
un valor válido de esa propiedad, **no hizo falta ni una línea nueva en el componente**.
Y como ahora el menú ya no es solo de degradados, corregí la etiqueta que decía «Cargan
siempre, sin internet»: habría pasado a ser falsa, y una etiqueta que miente es peor que
no tenerla. Ahora dice «Los degradados cargan siempre; las imágenes necesitan internet».

**Lo que NO hice, y lo digo claro:** el `cerebronico_brain_alive_4s.mp4` **no** puede ser
un preset de este menú. Es vídeo y necesita un `<video>`, no un `background-image`. Su
sitio es el camino **FONDO v1** (que ya soporta `.mp4` ≤8 MB y tiene su capa con velillos y
`prefers-reduced-motion`). Para usarlo: copia el `.mp4` al proyecto y actívalo por
`POST /api/fondo` con `{ "ruta": "assets/tu-video.mp4" }`. Dejarlo en el menú de degradados
habría sido un preset que no se ve: justo el tipo de mentira que perseguimos en esta
entrega.

---

## 5. Ampliación de la base de datos del motor

**Petición:** «hasta el momento los modelos cometen errores en los códigos, amplía su base
de datos en el motor».

La tesis ya estaba escrita en `knowledgeBase.ts` («el conocimiento no debe vivir en el
modelo, debe vivir en el motor»). Lo que faltaba era **llenarla**.

### 5.1 29 entradas nuevas, todas ancladas a ESTE repositorio

`src/engine/kbCodigo.ts` — la regla que me impuse: *si no lo pude verificar en este
repositorio, no lo escribí*. Un pack de reglas inventadas es peor que no tener pack,
porque el modelo obedece con la misma fidelidad una regla falsa.

Reparto real por tabla: **12 `error` · 11 `syntax` · 4 `rule` · 2 `pattern`**.

| Bloque | Entradas | De dónde sale el dato |
|---|---|---|
| **El bundle viejo / versión** | 2 | El defecto que acabas de reportar (`dist/` + fuente única) |
| **React 19** | 5 | `react@19.3.0` instalado; `tsconfig.json` `jsx: react-jsx` |
| **Tailwind v4** | 2 | `tailwindcss@4.3.3`; `@import "tailwindcss"` en `src/index.css`; plugin en `vite.config.ts` |
| **TypeScript 5.9** | 4 | `tsconfig.json`: `strict`, `isolatedModules`, `noFallthroughCasesInSwitch`, `esModuleInterop:false` |
| **ESM del proyecto** | 2 | `package.json` `"type": "module"`; los defectos `require` ya documentados en `server.ts` |
| **Dependencias reales** | 5 | `express@4.22.3`, `lucide-react`, `jszip@3.10.1`, `pdfjs-dist@4.8.69`, `@google/genai` |
| **Errores de modelo** | 5 | Import inventado, marcadores «…», el «aplicado» sin escribir, edit vs rewrite, verificar |
| **Diagnóstico del IDE** | 4 | Puertos reales, preview en blanco, `key` en listas, estado mutado |

Ejemplos de lo que ahora sabe el motor y antes no:

> **`err-esm-require`** — «`require` is not defined. Este defecto ya rompió la v1.0.3 dos
> veces y está documentado en `server.ts`. OJO: `tsc` NO avisa, porque `@types/node`
> declara `require` como global. Compila y falla en ejecución — por eso está aquí.»

> **`err-dist-viejo`** — «SÍNTOMA: el usuario ve dos versiones distintas en la misma
> pantalla. CAUSA: el IDE en marcha sirve `dist/`, y editar `src/` no lo cambia.
> DIAGNÓSTICO RÁPIDO: `rg "CerebróNico V" dist/assets/*.js`»

Estas dos entradas son, literalmente, las dos preguntas que me hiciste hoy. Ahora el
motor se lo dice a cada modelo en el turno en que toca ese tema.

### 5.2 Defecto colateral que encontré de paso: la semilla estaba partida

```ts
constructor(seed = [...KB_SEED, ...MANUAL_ENTRIES])   ← camino 1
static fromJSON() { for (const e of KB_SEED) … }      ← camino 2, MÁS CORTO
```

Dos listas para la misma semilla. Consecuencia real: al recargar la base desde disco (que
es el camino normal en el servidor), **las entradas de los manuales desaparecían** si no
se habían guardado antes. Otra vez la misma enfermedad —dos fuentes de la misma verdad—,
esta vez dentro del motor de conocimiento. Ahora hay una constante
(`SEMILLA_COMPLETA`) que usan los dos caminos, y una prueba que lo verifica.

### 5.3 Cómo se mide que esto sirve (64 comprobaciones)

No me vale decir «el motor sabe más». `tests/motor-datos.test.ts` verifica:

- El pack está bien formado: ids únicos, sin claves repetidas, tablas declaradas.
- La recuperación **acierta** con consultas escritas como las escribiría una persona
  (7 casos: `useRef`, bundle viejo, ESM, Tailwind v4, guarda de Vite, preview en blanco, SDK de Gemini).
- Y lo más importante: **el pack NO desplaza a las reglas del motor** en la puntuación
  (3 casos: destructivo, marcadores, JSON malformado siguen ganando lo suyo).

---

## 6. Validación en caliente: qué se ejecutó de verdad

```
cd ide/backend
npm install                # instalado de verdad, no “debería funcionar”
npx tsc --noEmit           # 0 errores
npm run validar            # 1.779 comprobaciones · 0 fallos · 31 suites · 0 sin correr
npm run build              # vite build + esbuild → dist/ regenerado
```

Detalle de las tres suites nuevas/reparadas:

| Suite | Antes | Después |
|---|---|---|
| `espejosServidor` | En disco pero **no registrada** → nadie la ejecutaba | Registrada · 27 ✅ |
| `formato` (nueva) | — | 47 ✅ |
| `motorDatos` (nueva) | — | 64 ✅ |

**Y el fallo del ZIP original, cazado y corregido:**

```
ANTES:  resiliencia › «todas las suites están registradas en validar.mjs»
        FALLO :: tests/espejosServidor.test.ts
        VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 1641 comprobaciones.
```

Una prueba que existe pero que el runner no ejecuta **no cubre nada**, y además teñía de
rojo el veredicto global. Al registrarla apareció un segundo problema: `validar.mjs` solo
sabía leer el formato «N correctas», y esa suite informa con marcas `✓`; la daba por
«NO llegó a ejecutarse» aunque terminara en verde. Corregido también: el guardián ahora
entiende los dos formatos, porque **confundir «no arrancó» con «arrancó y no usa mi
formato» es presentar un fallo que no existe** — la misma clase de mentira que esa
herramienta existe para evitar.

---

## 7. Ideas de mejora, priorizadas

### 🟢 Corto (menos de un día cada una)

1. **Limpiar los literales de versión en comentarios.** Quedan ~20 comentarios de cabecera
   que dicen `CerebroNico V2.1` en archivos de `src/utils/`. No se ven en pantalla, pero
   son los siguientes candidatos a convertirse en la discrepancia de esta semana.
2. **Exponer el filtro de salida como ajuste.** `activarProtocoloDeCierre(true)` ya existe;
   un interruptor en el panel PRO («respuesta con acta / sin acta») lo haría visible. Útil
   si algún día quieres el formato para un banco de pruebas.
3. **Panel de diagnóstico de versión.** Un botón que muestre: versión de `package.json`,
   de `IDE_BRAND`, fecha del `dist/` y hash del bundle. Cinco líneas, y mata de raíz la
   clase de bug de hoy.
4. **Presets de imagen con caché local.** Hoy necesitan internet. Guardar el archivo en
   `public/` al elegirlo por primera vez lo haría offline para siempre.

### 🟡 Medio (una semana)

5. **Enrutador por complejidad (local ↔ nube).** El diseño está en §3.4. Es el siguiente
   paso natural de tu idea y lo que más tiempo te ahorraría: hoy la decisión es un clic
   manual por turno.
6. **D8 del ROADMAP: métricas reales de inferencia.** Leer `eval_count`,
   `prompt_eval_duration` y `eval_duration` del stream de Ollama y mostrar TTFT y
   tokens/s. Hoy el cliente estima con `len/4`, que es una cifra inventada con buena
   presentación. Es acotado, verificable y no rompe nada — el propio ROADMAP lo marca como
   «la siguiente tarea recomendada».
7. **`syntaxGuard` con `esbuild.transform`.** Validar TS/JSX de verdad antes de escribir.
   El ROADMAP lo anota como código muerto actual y `server.ts` **ya** importa esbuild.

### 🔴 Largo

8. **D7: votación real de los 12 especialistas.** Revisar `DUEÑO_DE` y declarar los que no
   votan. Lo dejo señalado: hoy hay ramas que no existen y el sistema no lo dice.
9. **D9: auto-lección.** Disparar el aprendizaje al recuperar un error de turno (hoy
   escribe en localStorage). El pack de código que acabo de añadir es el sitio natural
   donde aterrizarían esas lecciones.
10. **Git nativo.** El hueco real más grande del proyecto (1,5 semanas según tu ROADMAP).

---

## 8. Cómo verificarlo tú mismo

```bash
cd cerebronico_v8/ide/backend
npm install
npm run validar            # esperado: TODO CORRECTO — 1.779 comprobaciones, 0 fallos
npx tsc --noEmit           # esperado: sin salida
npm run build              # recompila dist/ (obligatorio si tocas src/)

# Las tres comprobaciones directas de los arreglos de hoy:
npx tsx tests/formato.test.ts       # 47 correctas · 0 fallidas
npx tsx tests/motor-datos.test.ts   # 64 correctas · 0 fallidas
rg "V1\.0\.3" src dist              # no debe encontrar nada en lo visible
```

Para ver la versión arreglada en pantalla: `npm run dev` y mira la cabecera y el Menú CN
— las dos deben decir **V8.0.1**.

---

## 9. Límites de esta entrega (lo que no hice)

- **No incluí `dist/server.mjs` ni su sourcemap** en el ZIP, para no añadir 8,5 MB y
  mantener el empaquetado igual que el original (que tampoco lo traía). `npm run build` lo
  regenera.
- **No toqué `agent_bridge_5000.py`** a fondo (D3 del ROADMAP, «falta re-verificar
  allowlist de binarios y `shell=False`»). Sigue pendiente y no lo cuento como hecho.
- **El alias `NEMESIS` es una declaración tuya.** Verifícalo con `ollama show NEMESIS:latest`.
- **El MP4 no está cableado** como preset de menú (ver §4.2). Va por el camino FONDO v1.
- **Queda un literal `CerebroNico V2.1`** en el bundle, dentro de un comentario de
  cabecera: invisible, pero no lo declaro arreglado.
- No inventé cifras de rendimiento. Donde no hay medición, no hay número.

---

## 10. Inventario de cambios

**Archivos nuevos (5)**

| Archivo | Qué es |
|---|---|
| `src/utils/formatFixer.ts` | La aduana de metadatos de cierre |
| `src/engine/kbCodigo.ts` | +29 entradas verificadas para la base del motor |
| `tests/formato.test.ts` | 47 comprobaciones |
| `tests/motor-datos.test.ts` | 64 comprobaciones |
| `INFORME_AUDITORIA_V8.0.1.md` | Este informe |

**Archivos modificados (15)**

| Archivo | Cambio |
|---|---|
| `src/constants.ts` | Una sola semilla de versión (`VERSION_SEMVER = "8.0.1"`) |
| `src/components/Header.tsx` | `title` desde `IDE_BRAND` (fuera el literal `V1.0.3`) |
| `src/components/ChatCenter.tsx` | El render pasa por la aduana (`componerCuerpo`) |
| `src/components/ProConfigPanel.tsx` | Etiqueta del menú corregida (degradados vs imágenes) |
| `src/engine/brain.ts` | Protocolo de cierre opcional y apagado + `SEMILLA` |
| `src/engine/knowledgeBase.ts` | `SEMILLA_COMPLETA` única + pack de código |
| `src/engine/modelTiers.ts` | Alias de modelos renombrados + `aliasDe` |
| `src/utils/engine.ts` | Una sola lista de modelos con herramientas |
| `src/utils/markdownExport.ts` | Informe sin literal de versión |
| `src/utils/proSettings.ts` | 3 presets de imagen en el menú |
| `src/App.tsx` | GIF nativo (accept + sin canvas) |
| `core-agent/agent_core/engine.py` | Contrato de salida (fuera el acta) |
| `cerebro.md` | §7-A pasa de «obligatoria» a «OPCIONAL (v8.0.1)» |
| `scripts/validar.mjs` | 3 suites registradas + parser tolerante a marcas `✓` |
| `index.html` · `package.json` | Versión alineada a `8.0.1` |

**Reconstruido:** `dist/` completo (assets + `index.html`) con `npm run build`.


---

<a id="informe-v8-0-3-md"></a>
## (2/4) INFORME_V8.0.3.md

> **Fuente:** `./INFORME_V8.0.3.md`  —  **version:** 8.0.3  —  **bytes:** 8599
# INFORME V8.0.3 — MINIATURA DE ADJUNTOS · ESTADO DEL SANDBOX

> Dos peticiones, tres defectos reales, y todos del mismo tipo: **cableado roto**.
> Ni uno solo era un problema de pintado. Eso es información útil: significa que
> el diseño estaba bien y lo que faltaba era conectar las piezas.
> Verificación: **2004 comprobaciones · 0 fallos · 33 suites · 0 errores de tipo**.

---

## 1. «Que se vea la miniatura de la imagen, ahora solo es un icono»

### 1.1 El defecto visible

El chip del adjunto **ya tenía la imagen al lado y no la usaba**:

```tsx
// ChatCenter.tsx, antes
{isImg ? <ImageIcon className="w-3.5 h-3.5 text-pink-400" /> : …}
```

`AttachmentItem.base64Data` contiene el data URL completo desde siempre. El
comentario era «un icono de 14 px». Con tres adjuntos da igual; con veinte el
usuario tiene veinte iconos rosa idénticos, y el nombre no ayuda: un archivo
llamado `captura-20260922-143045.png` no dice más que el icono.

### 1.2 El defecto de fondo: no se veía NADA hasta el final

Esto es lo que de verdad pedías con «así se puede apreciar qué elemento se está
cargando cuando sean muchas», y no lo había:

```ts
// App.tsx, antes
const newAttachments = [];
for (const file of fileArray) {
  const { attachment } = await processUploadedFile(file);
  newAttachments.push(attachment);       // ← se acumula en local
}
setPendingAttachments((prev) => [...prev, ...newAttachments]);   // ← volcado único
```

Con treinta imágenes, la tira de adjuntos se quedaba **vacía** treinta veces el
tiempo de una, y después aparecían las treinta de golpe. Visto desde fuera eso es
«el IDE se ha colgado», y no había forma de saber **cuál** de los treinta estaba
atascando la cola.

### 1.3 El arreglo

**a) Miniatura de verdad.** Se genera al adjuntar (≤96 px, WebP 0,8) y se guarda
en un campo nuevo `thumbData`. `base64Data` **no se toca**: sigue siendo la
imagen íntegra que se manda al modelo.

> **Por qué no pintar `base64Data` directamente en un `<img>` de 32 px**, que era
> lo barato: el navegador **decodifica la imagen completa** para dibujarla
> pequeña. Treinta capturas 4K son cientos de MB de mapas de bits en memoria y la
> interfaz se arrastra. Una miniatura de 96 px son unos miles de píxeles. Esta es
> la diferencia entre que funcione con tres y que funcione con treinta.

**b) Respaldo en tres niveles, sin huecos negros.** `thumbData` → `base64Data` →
icono. El icono se pinta **debajo** del `<img>`: si la imagen no carga, `onError`
la oculta y reaparece el icono. El fallo degrada a lo que había antes.

**c) Vista previa en grande.** Pulsar la miniatura abre la imagen completa sobre
la interfaz. Se cierra con Escape, con la X o pulsando fuera — las tres, porque
cada una es la que intenta la mitad de la gente.

**d) Cola de «cargando».** Los nombres de todos los archivos entran en pantalla
**antes** de procesar ninguno, como chips fantasma con su nombre y su indicador.
Cada uno se retira en cuanto su miniatura está lista. El contador ahora dice
`4 adjunto(s) listo(s) · 2 cargando…`. Se ve qué falta y qué ya está.

**e) La aritmética vive aparte y se prueba.** `src/utils/miniatura.ts` es puro
(sin DOM), y ahí están las 22 comprobaciones de geometría. `canvas` y `drawImage`
no se pueden probar en Node, y una prueba que no se puede ejecutar no cubre nada:
así que se aísla lo que **decide** y se prueba eso.

---

## 2. «El editor web? hasta ahora no ha funcionado»

Tenías razón, y había **dos** causas encadenadas. La segunda es la que lo hacía
parecer roto para siempre.

### 2.1 El editor web nunca arrancaba el sandbox

En todo el proyecto, el único sitio que llama a `/api/sandbox/start` es el panel
**«Sandbox» de la barra lateral derecha** (`RightSidebar.tsx`). Quien abría «Modo
Web» sin haber pasado antes por ese panel se quedaba con un iframe apuntando a un
puerto muerto (`:3500`) y **ningún botón para arreglarlo desde la pantalla que
estaba mirando**. El editor web no fallaba: le faltaba el paso 1.

### 2.2 El indicador estaba clavado en verde

```tsx
// App.tsx
const [sandboxRunning, setSandboxRunning] = useState<boolean>(true);
```

`setSandboxRunning` **no se llamaba en ningún sitio del proyecto**. Consecuencia:
el editor web recibía siempre «sandbox activo», pintaba el punto en verde y **no
mostraba el aviso** de «el sandbox no está corriendo» — justo el aviso que existía
para explicar el preview en blanco. Un indicador fijo en verde tapando el único
fallo que tenía que anunciar. Eso es peor que no tener indicador, porque el
usuario descarta la causa correcta *porque la interfaz le dijo que no era esa*.

### 2.3 El arreglo

| Qué | Antes | Ahora |
|---|---|---|
| ¿Quién arranca el sandbox? | Solo el panel lateral | El editor web, solo, al abrir la pestaña |
| ¿Quién sabe si está vivo? | Nadie: valor fijo `true` | La vista lo **pregunta** a `/api/sandbox/status` |
| Punto de estado | Verde siempre | Verde / ámbar (comprobando, arrancando) / rojo |
| Preview en blanco | Rectángulo blanco mudo | Aviso con el **motivo del motor** + botón «Arrancar sandbox ahora» + «Reintentar» |
| Si el motor no responde | «Activo» | Se declara **NO vivo** |

Detalles que importan:

- **Un solo intento automático por montaje** (`sbAutoIntentado.current`): si el
  arranque falla, no se entra en bucle de arranques. Se reintenta a mano.
- **Confirmación anti-recursión**: el motor pide confirmación explícita cuando el
  proyecto ES la propia IDE; se maneja igual que en el panel lateral.
- **Al arrancar, se refresca el iframe**, porque ya tenía dentro el error de
  conexión anterior y si no seguiría en blanco con el servidor ya vivo.
- **Sondeo cada 6 s** y valor inicial `false`. Se elige 6 s (y no 10 como la
  telemetría) porque el sandbox se para y se arranca a mano, y un indicador que
  tarda 10 s en reflejarlo hace que el usuario pulse «Arrancar» dos veces.
  Empezar en `false` es deliberado: es más honesto arrancar en «no» y corregir
  cuando responda, que arrancar en «sí» y no corregir nunca.

> **Nota de disciplina:** las dos peticiones de hoy eran el mismo error con dos
> disfraces — una pieza existía y nadie la usaba. Es exactamente lo que el
> proyecto ya se había encontrado con `IDEBRAND.FULL_NAME` (dos literales que se
> contradicen), con la semilla del motor (dos listas) y con la lista de modelos
> con herramientas (dos listas blancas). Cuando algo se «arregla» y sigue igual,
> la primera pregunta ya no es *qué falta*, sino **quién tenía que llamarlo y no
> lo llama**. El compilador no ve ninguna de estas cuatro cosas.

---

## 3. Evidencia

```
npx tsc --noEmit ...................... 0 errores
npm run validar ....................... 2004 comprobaciones · 0 fallos
                                        33 suites ejecutadas · 0 sin correr
tests/interfaz.test.ts ................ 64 correctas · 0 fallidas   (nueva)
tests/contenedor.test.ts .............. 161 correctas · 0 fallidas
```

`tests/interfaz.test.ts` comprueba, entre otras cosas, que **`setSandboxRunning`
sí se llama** y que el aviso depende del **estado medido** y no de la prop. Es
decir: la prueba falla si alguien vuelve a clavar el indicador en verde.

Dos comprobaciones nacieron de fallos míos durante esta sesión, y se quedan
porque documentan un borde real:

1. `esVideoPorFirma` exigía 12 bytes y devolvía «no es vídeo» para un **WebM**
   corto (EBML solo necesita 4). Se cazó al probar.
2. La denuncia de «archivo renombrado» se apoyaba en la **familia** del formato, y
   eso marcaba como sospechoso **todo `.docx` legítimo** (que es un ZIP por
   dentro, familia `documento`, no `paquete`). Ahora se enumera por ID.

---

## 4. Límites honestos

- **La miniatura no se prueba en el navegador**: `canvas` no existe en Node. Lo
  probado es la geometría; el `drawImage` solo se puede comprobar a ojo abriendo
  el IDE. Si un formato exótico no se puede dibujar en canvas, el chip cae al
  icono — está previsto, pero no verificado por prueba.
- **No he podido arrancar tu sandbox** desde aquí para ver el preview con mis
  ojos. Lo verificado es que la vista pregunta, arranca y explica; el resultado
  final del iframe depende del proyecto que tengas en `.proyectos`.
- **El MP4 del cerebro sigue sin ser preset de menú** (va por el camino FONDO v1,
  `/api/fondo`). Sigue pendiente de la entrega anterior.
- Sigue pendiente, y no lo doy por hecho: **el estudio de actualización en
  caliente / servidores locales en tiempo real** que se interrumpió.


---

<a id="informe-v8-0-4-md"></a>
## (3/4) INFORME_V8.0.4.md

> **Fuente:** `./INFORME_V8.0.4.md`  —  **version:** 8.0.4  —  **bytes:** 9736
# INFORME V8.0.4 — AUDIO · SANDBOX · CONSOLA

> Cuatro reportes tuyos, tres causas raíz encontradas, y dos cosas que **no** hice.
> Verificación: **2073 comprobaciones · 0 fallos · 34 suites · 0 errores de tipo**.

---

## 1. «Sale siempre la voz robótica standard»

### 1.1 Por qué salía SIEMPRE (no a veces)

El código decía, literalmente:

```ts
const voices = synth.getVoices();
const esVoice = voices.find((v) => v.lang.startsWith("es"));
if (esVoice) utter.voice = esVoice;
```

Dos fallos independientes, y **cada uno basta por sí solo** para producir lo que
oías:

1. **`getVoices()` devuelve lista VACÍA la primera vez.** Las voces del sistema se
   cargan de forma asíncrona; el navegador avisa por `voiceschanged` cuando ya
   están. Ese evento **no se escuchaba nunca**. Con la lista vacía, `find()` no
   encontraba nada, **no se asignaba `utter.voice`**, y sonaba la voz por defecto
   del sistema. En Linux esa por defecto es eSpeak: el sintetizador robótico de
   siempre. No fallaba por casualidad: fallaba **por construcción**.
2. **El primero de la lista no es el mejor.** El orden de `getVoices()` no está
   normalizado por nadie.

### 1.2 Y había un segundo problema encima: el fallo de Gemini se tragaba

Elegir «Gemini · Aoede» en el selector hacía una petición a `/api/tts/gemini`.
Ese endpoint exige la clave **en el entorno del servidor** (`GEMINI_API_KEY`);
la interfaz **nunca manda la cabecera** (`x-gemini-key` no aparece ni una vez en
todo `src/`). Cuando falta, el servidor contesta `503` con un `motivo` claro… y el
cliente hacía:

```ts
if (!res.ok || !data?.ok || !data?.audioBase64) return false;   // ← y aquí se perdía la explicación
```

Silencio → voz del navegador → robótica. Desde fuera, «el botón de audio no
funciona». La causa real era invisible.

### 1.3 El arreglo

| Qué | Antes | Ahora |
|---|---|---|
| Lista de voces | Se leía una vez, casi siempre vacía | Se cachea y se escucha `voiceschanged` |
| Elección | El primer `es` que aparezca | Se puntúan **todas** (`src/utils/voz.ts`, puro) |
| Prioridad | — | **idioma > no-robótica > natural** |
| Voz robótica | Se usaba en silencio | Se usa **pero se avisa** |
| Fallo de Gemini | `return false`, mudo | Se enseña el `motivo` del servidor |

Sobre la prioridad, que es la decisión discutible: **una voz natural inglesa
leyendo español se entiende PEOR que una robótica en español.** Por eso otro
idioma resta (−60) en vez de simplemente no sumar, y una eSpeak en español
(40−50 = −10) le gana a una Microsoft inglesa (−60+30 = −30). Para leer en voz
alta el idioma no es una preferencia: es un requisito.

---

## 2. El registro del sandbox: la contradicción

Tu log, en dos líneas consecutivas:

```
SYNC · 1 archivo(s) escrito(s) en .proyectos/.
No se pudo arrancar: No hay proyecto en el sandbox (.proyectos): no se encontró
ningún marcador reconocido (package.json, index.html, requirements.txt…).
```

Lo primero que hice fue dejar de tratar esto como un misterio y buscar la
contradicción. Está en el código, y son tres defectos encadenados:

### 2.1 La comprobación de «proyecto estático» miraba solo la raíz

```ts
...(fs.existsSync(path.join(PROJECT_ROOT, "index.html"))    // ← SOLO la raíz
```

El sync escribe el árbol **con su carpeta contenedora**, así que lo normal es que
la web acabe en `.proyectos/<carpeta>/index.html`. Ahí `hasProject` quedaba en
`false` con la web perfectamente escrita en disco.

**Arreglo:** si no hay `index.html` en la raíz, se busca en subcarpetas (hasta 3
niveles, sin entrar en `node_modules`/`dist`/etc.) y se declara **dónde** está.
Nota deliberada: **no se saltan las carpetas que empiezan por punto** — el motor
usa nombres como `.proyectos`, y saltárselos por reflejo es parte de por qué este
caso tardó tanto en verse.

### 2.2 El mensaje no solo era falso: **daba una orden al modelo**

```
AUTO · ❌ No se encontró package.json en el sandbox tras sincronizar.
AUTO · Solución: asegúrate de que tu workspace tenga un package.json.
```

El sandbox acepta una decena de marcadores; una web con `index.html` es un
proyecto válido que **no necesita npm**. Decir «falta package.json» es
diagnosticar la enfermedad equivocada. Y lo caro es la segunda mitad: es una
**instrucción**. El modelo la leyó y contestó —tu propio texto— *«el sandbox no
tiene un proyecto reconocido. Voy a crear un proyecto Node.js básico»*. Se puso a
montar un proyecto npm que no necesitabas **por culpa de una frase nuestra**.

**Arreglo:** el mensaje ahora dice dónde se buscó, qué había en la raíz, y qué
marcadores sirven de verdad (con `index.html` primero, porque no requiere npm).

### 2.3 `.proyectos/` es una ruta relativa y no permite verificar nada

**Arreglo:** el estado del sandbox devuelve `raizSandbox` y
`raizProyectoResuelta` **en absoluto**, y el log del SYNC los imprime. Con eso, un
solo Sync zanja la duda de si el archivo aterrizó donde el detector mira.

### 2.4 El preview en blanco ya no puede quedarse mudo

En el servidor estático del sandbox (el que sirve `:3500`), si no había
`index.html` **toda** petición acababa en un 404 de texto plano. En pantalla eso
es una página en blanco sin una pista. Ahora:

1. Si no hay `index.html` en la raíz pero hay **un solo** subdirectorio con
   `index.html`, **sirve ese**. Muchas veces esto arregla el preview y punto.
2. Si no aparece, sirve una **página de diagnóstico en HTML** (no un 404 de
   texto) con la raíz real, lo que hay dentro y dónde ha visto algún `index.html`.
3. Si el `index.html` existe pero pesa **0 bytes**, lo dice: una escritura a
   medias produce exactamente una página blanca.
4. Nuevo `/__cn_info` en JSON, para que la interfaz lo consulte.

---

## 3. La consola ejecutó el texto de una herramienta

```
$ run_command command="cd .proyectos/mi-proyecto && npm start
"run_command" no se reconoce como un comando interno o externo…
```

Léelo despacio: **el shell ejecutó el TEXTO de una llamada a herramienta**.
`run_command` es el nombre de una herramienta del motor y `command="…"` su
parámetro. El modelo lo escribió como texto, y la consola —que acepta cualquier
cadena y la pasa a `cmd.exe`— lo intentó ejecutar tal cual.

**Por qué esto importa más de lo que parece:** la consola es la puerta más
peligrosa del proyecto. Hoy llegó el texto de una herramienta; mañana llega un
`rm -rf` desde una llamada mal formada y **sí hace algo**. Una puerta que ejecuta
lo que le pongan necesita distinguir «comando» de «resto».

### El arreglo: desenvolver si se puede, negarse si no

Cuando el modelo escribe eso, su intención es inequívoca: quiere ejecutar
`cd .proyectos/mi-proyecto && npm start`. Negarse a secas sería obedecer la letra
y traicionar la intención —y el modelo volvería a intentarlo. Así que se
**desenvuelve**, se ejecuta lo de dentro y se deja constancia.

Y si tras desenvolver sigue pareciendo una llamada de herramienta (anidada, o
`path="x.ts" content="…"`, que son **parámetros** y no un comando), entonces **no
se ejecuta nada** y se devuelve el motivo con la forma correcta.

Módulo puro `src/engine/comandoEntrante.ts`, conectado en **las dos puertas**:
la herramienta `run_command`/`run_tests` y el endpoint `/api/exec`.

---

## 4. Lo que NO hice (y por qué)

Tres de tus cinco peticiones se quedan fuera de esta entrega. No las doy por
hechas:

- **«X de cerrar en toda ventana o pestaña».** Es mecánico pero toca varias
  superficies (pestañas del centro, panel «Editor Web & IA», ventanas flotantes) y
  no lo he tocado. Existe ya `closeCenterTab`, así que el trabajo es añadir el
  botón en cada cabecera y conectar al cierre que ya funciona.
- **«Separar el reproductor web y el chat».** Requiere un divisor arrastrable
  entre el panel del editor y el lienzo del preview, y decidir si «separar»
  significa divisor redimensionable o ventana independiente. Prefiero
  preguntártelo antes de construirlo entero.
- **«El sandbox tardó muchísimo».** No lo he medido, así que no te voy a dar una
  causa inventada. Lo que sí puedo decir con lo visto: el piloto automático
  reintentaba en bucle (4:32:59, 4:33:01, 4:33:02…), y cada vuelta sincroniza el
  workspace entero. Con el proyecto mal detectado, **el bucle no podía terminar
  bien nunca** — el 2.1/2.2 lo arregla, y es razonable que parte de la lentitud
  fuera eso. Para el resto necesitaría tu log con marcas de tiempo reales.

---

## 5. Evidencia

```
npx tsc --noEmit .................... 0 errores
npm run validar ..................... 2073 comprobaciones · 0 fallos · 34 suites
tests/consola-voz.test.ts (nueva) ... 69 correctas · 0 fallidas
```

La suite nueva incluye el **caso exacto de tu terminal** (con su salto de línea y
su comilla final) y comprueba que `run_command path="x.ts"` **no se ejecuta**. Las
dos pruebas que fallaron al escribirlas —comillas escapadas en el anidado, y
`path=` colándose como comando— eran defectos reales del módulo, no de las
pruebas, y quedan documentadas en el código.

---

## 6. Cómo comprobar tú mismo el problema del sandbox

En el ZIP que te entrego, abre la pestaña «Consola» del panel derecho y pulsa
**Sync**. Ahora verás una línea con la **ruta absoluta** real del sandbox y, si no
hay proyecto, **qué archivos hay ahí dentro**. Compárala con la carpeta donde el
modelo escribió:

- Si coinciden y aparece `index.html` → debe arrancar; si no, el motivo exacto
  está en el propio `:3500` (ya no sale en blanco).
- Si **no** coinciden → ahí está la causa, y el nuevo mensaje lo dirá con nombres
  y rutas en vez de «no hay proyecto».


---

<a id="informe-v8-0-7-md"></a>
## (4/4) INFORME_V8.0.7.md

> **Fuente:** `./INFORME_V8.0.7.md`  —  **version:** 8.0.7  —  **bytes:** 8079
# INFORME V8.0.7 — EL ESPEJO DEL PROYECTO, EL ÁRBOL Y EL APLANADO

> Tres peticiones de esta tanda, tres causas raíz, y una sola idea detrás de las
> tres: **el motor no tenía forma de saber qué le falta.**
> Verificación: **2244 comprobaciones · 0 fallos · 36 suites · 0 errores de tipo**.

---

## 1. «No aplana bien y no encuentra los archivos» — LA CAUSA

`buscarProyectoAnidado`, el resolvedor de raíz y el buscador de copias tenían
todos la misma línea:

```js
if (e.name.startsWith(".") || skip.has(e.name)) continue;
```

Saltarse las carpetas que empiezan por punto parece prudente. Aquí es **justo lo
contrario**, porque **los caminos de este proyecto empiezan por punto**: la
carpeta contenedora se llama `.proyectos`. Al sincronizar, el árbol cae dentro de
`.proyectos/<algo>/…`, y `<algo>` puede ser otra vez `.proyectos`.

Encaja línea a línea con tu registro:

| Lo que veías | Lo que pasaba |
|---|---|
| «1 archivo(s) escrito(s) en .proyectos/» | El sync escribía de verdad |
| «No se encontró ningún marcador reconocido» | El detector **descartaba por el nombre** la carpeta que lo contenía, antes de mirar dentro |
| «No aplana bien» | El aplanador usa la misma función → nunca encontraba la copia anidada |
| «Y no encuentra los archivos» | Por lo mismo |

**Arreglo:** se ignora por **lista** (artefactos y `.git`), no por prefijo. Un
punto en el nombre no es un criterio.

**Añadido:** cuando hay un proyecto en la raíz **y además** uno anidado, el motor
lo dice. Es el caso en que todo parece bien y el preview sigue enseñando lo
viejo: el marcador de la raíz tiene prioridad, el sync sigue escribiendo en la
subcarpeta, y el usuario no ve nada raro.

---

## 2. «Se suman archivos que no van en el empaque»

Fui a mirar `generateCnFile` antes de escribir nada. Empaquetaba así:

```ts
for (const file of files) {
  if (file.path && typeof file.content === "string") {
    zip.file(file.path, file.content);      // ← todo
  }
}
```

**No es que la lista estuviera corta: no había lista.** Cualquier cosa con nombre
y contenido entraba: un `.env`, un `debug.log`, el `node_modules` completo, o la
copia espejo de `.proyectos/`.

### El veredicto tiene TRES valores, y ése es el punto

Un filtro de dos categorías (entra / no entra) decide por el usuario y no se lo
dice — el mismo pecado que no tener filtro. Así que:

| Veredicto | Qué es | Qué hace el motor |
|---|---|---|
| `incluir` | código, configuración, documentación del proyecto | nada que preguntar |
| **`preguntar`** | **imágenes, datos, documentos, extensión desconocida** | **para y pregunta, con la lista** |
| `prohibido` | secretos, artefactos, efímeros, espejo, rutas absolutas | no entra **ni con permiso** |

**`preguntar` es la categoría que antes no existía, y es la que pediste.** Preguntar
por un `.ts` sería ruido, y el ruido enseña a ignorar las preguntas.

Los `prohibido` no entran nunca porque el daño **no se deshace**: un `.env`
empaquetado y enviado ya está filtrado. Y no se excluye en silencio: lo excluido
queda **registrado en el manifiesto** con su motivo. El manifiesto además ya no
declara un `fileCount` falso (contaba la entrada, no el contenido) ni una versión
`v1` del IDE que sobrevivió a ocho versiones.

**Matiz que casi se pierde:** `package-lock.json`, `yarn.lock` y `Cargo.lock` **sí
viajan** — son ficheros de verdad del proyecto. Sólo se descartan los `.pid`, que
son señal de un proceso vivo.

### Y el modelo ahora lo tiene por ley

El proceso está en los **guardrails** de `cerebro.md` (que se inyectan siempre,
también en modelos diminutos) y en la base de datos del motor como entrada `rule`.

---

## 3. «Siempre se olvida de los archivos de un proyecto» — EL ESPEJO

### 3.1 El diagnóstico correcto, que no era el que parecía

«Se olvida de los archivos» **no describe un error de escritura**. El modelo
escribe bien las líneas que escribe. Lo que pasa es que **no sabe cuántos archivos
tiene un proyecto de ese tipo**: escribe los dos que tiene en la cabeza y da el
trabajo por terminado. De ahí un `index.html` que enlaza `styles.css`… y
`styles.css` no existe.

**Y eso explica el síntoma de antes mejor que ninguna otra hipótesis:** una web de
tres archivos con sólo el primero escrito **se ve exactamente en blanco**. El
previsualizador blanco y «se olvida de los archivos» eran el mismo problema.

### 3.2 Por qué un espejo y no una lista en el prompt

Una lista pegada en el prompt se lee una vez y se diluye entre mil instrucciones.
Un **espejo se coteja**: produce una respuesta binaria —falta / no falta—, que es
justo lo que un modelo pequeño sabe usar. La diferencia práctica es la que hay
entre decirle «acuérdate de los archivos» y enseñarle «te faltan estos dos».

### 3.3 Cinco plantillas, y «obligatorio» significa algo

| Plantilla | Conjunto mínimo |
|---|---|
| **web estática** | `index.html` + `styles.css` + `script.js` |
| **Vite + React + TS** | `package.json` + `vite.config.ts` + `tsconfig.json` + `index.html` + `src/main.tsx` + `src/App.tsx` |
| **Servidor Node** | `package.json` + `server.js` |
| **API FastAPI** | `requirements.txt` + `app/main.py` + `app/__init__.py` |
| **Script suelto** | `index.js` |

**Obligatorio = sin él no arranca o no se ve.** No es «recomendado» disfrazado: un
`README.md` no es obligatorio, y no lo voy a llamar así — si todo es obligatorio,
nada lo es.

El espejo marca lo presente con `[x]` y lo ausente con `[ ]`, distingue
(obligatorio) de (opcional), y cuando faltan obligatorios lo dice sin rodeos:
`FALTAN 2 ARCHIVO(S) OBLIGATORIO(S): styles.css, script.js`.

### 3.4 Implantado, no sólo escrito

- **Base de datos del motor:** entrada `rule-espejo-proyecto` con los conjuntos de memoria.
- **Ley del motor:** proceso en `cerebro.md` § guardrail 8, dentro de lo que se inyecta siempre.
- **En vivo:** `GET /api/proyecto/espejo` coteja el sandbox real y devuelve la pregunta ya redactada. Lectura acotada (profundidad 5, 600 entradas) porque un cotejo que se atasque en un `node_modules` de 40.000 archivos no lo usaría nadie.

---

## 4. Tres defectos míos que cazaron las pruebas (y se quedan documentados)

1. **`service-account.json` se colaba** como secreto por un guion: la lista decía
   `serviceaccount`. Un secreto que se cuela por un separador es exactamente la
   clase de fallo que esa lista existe para evitar.
2. **Una regla del motor desbordó a otra.** La entrada del árbol llevaba cuatro
   claves que contenían «archivo»; la consulta «borrar un archivo del usuario sin
   permiso» sumaba 1,0 por cada una y **desplazaba a la regla de acciones
   destructivas**. Una palabra común repetida en cuatro claves no refuerza:
   desborda.
3. **`marcadores` significa «todos presentes», y yo había puesto los tres del
   script suelto.** Ningún script suelto se reconocía: habría hecho falta tener
   `index.js`, `main.py` y `app.js` a la vez.

---

## 5. Evidencia

```
npx tsc --noEmit .................... 0 errores
npm run validar ..................... 2244 comprobaciones · 0 fallos · 36 suites
tests/espejo.test.ts (nueva) ........ 66 correctas · 0 fallidas
tests/arbol.test.ts (nueva) ......... 99 correctas · 0 fallidas
tests/consola-voz.test.ts ........... 75 correctas · 0 fallidas
```

---

## 6. Qué sigue pendiente, sin adornos

- **La X de cerrar** en toda ventana/pestaña, y **separar el chat del reproductor**
  (divisor arrastrable o ventana independiente: falta que me digas cuál).
- **La lentitud del sandbox**: ahora el log dice la ruta absoluta y qué archivos
  hay. Con eso se puede medir; aún no lo he medido.
- **El estudio de actualización en caliente** que se interrumpió.
- **El espejo no se inyecta todavía solo en el prompt** en cada llamada: está en
  la ley y en la base de datos (se recupera por consulta) y hay endpoint para
  cotejar. Lo siguiente sería que el servidor lo meta automáticamente en el
  contexto cuando detecte el tipo de proyecto. Es media hora y no lo he hecho.

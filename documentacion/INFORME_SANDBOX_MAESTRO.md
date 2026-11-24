# INFORME SANDBOX — Historia unificada de pruebas del sandbox

Archivo MAESTRO generado el 2026-10-05. Unifica 11 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [INFORME_SANDBOX_v1.6.24.md](#informe-sandbox-v1-6-24-md) — version 1.6.24
2. [INFORME_SANDBOX_v1.6.25.md](#informe-sandbox-v1-6-25-md) — version 1.6.25
3. [INFORME_SANDBOX_v1.6.26.md](#informe-sandbox-v1-6-26-md) — version 1.6.26
4. [INFORME_SANDBOX_v1.6.27.md](#informe-sandbox-v1-6-27-md) — version 1.6.27
5. [INFORME_SANDBOX_v1.6.28.md](#informe-sandbox-v1-6-28-md) — version 1.6.28
6. [INFORME_SANDBOX_v1.6.29.md](#informe-sandbox-v1-6-29-md) — version 1.6.29
7. [INFORME_SANDBOX_v1.6.30.md](#informe-sandbox-v1-6-30-md) — version 1.6.30
8. [INFORME_SANDBOX_v1.6.31.md](#informe-sandbox-v1-6-31-md) — version 1.6.31
9. [INFORME_SANDBOX_v1.6.32.md](#informe-sandbox-v1-6-32-md) — version 1.6.32
10. [INFORME_SANDBOX_v1.6.33.md](#informe-sandbox-v1-6-33-md) — version 1.6.33
11. [INFORME_SANDBOX_v1.13.0.md](#informe-sandbox-v1-13-0-md) — version 1.13.0


---

<a id="informe-sandbox-v1-6-24-md"></a>
## (1/11) INFORME_SANDBOX_v1.6.24.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.24.md`  —  **version:** 1.6.24  —  **bytes:** 10214
# INFORME — SANDBOX v1.6.24 «AUTO-SANADOR»

**Build:** CerebróNico CN v1.6.23-CONSOLIDADO → **v1.6.24-SANDBOXFIX**
**Fallo reportado:** `Cannot find module '.../vite/dist/node/chunks/dist.js'` al arrancar el sandbox (`ide/backend/.proyectos`, puerto 3500). «NO FUNCIONA EL SANDBOX».

---

## 1. Causa raíz (confirmada con evidencia del código)

El diagnóstico del reporte era correcto en esencia: el sandbox arrancaba un proyecto React+Vite cuyos `node_modules` nunca se instalaron en su propia carpeta (el ZIP los excluye por peso). El código de v1.6.23 tenía **cuatro eslabones** que convertían ese estado en un fallo permanente e irreparable:

1. **`existe la carpeta` ≠ `está instalado`.** `elegirViaPreview` (src/engine/viaRapidaPreview.ts) declaraba «ya está instalado» con un simple `fs.existsSync(node_modules)`. Un árbol podado (ZIP sin dependencias, o un `npm install` cortado a medias) pasaba por sano.
2. **npm-dev con `requiereInstalar: false`.** Con `vite.config.ts` + carpeta `node_modules` presente, la decisión fija era «respetar su `dev`, no instalar nada» → `spawnSandbox` ejecutaba `npm run dev` → el bin de Vite arrancaba y moría contra su propio chunk interno faltante. Nota: la IDE trae **Vite 6** y la plantilla `sandbox-app` declara **Vite 5** — con el árbol local incompleto, npm resuelve el `vite` del ancestro (`ide/backend/node_modules/.bin`) y el cruce 6-core/5-plugin produce exactamente el `.../vite/dist/node/chunks/dist.js` del aviso.
3. **El chequeo v1.6.7 solo avisaba.** Las dependencias «declaradas y SIN instalar» provocaban únicamente un `console.warn`; nunca un `npm install`.
4. **La auto-reparación estaba APAGADA por defecto.** `AUTO_INSTALL_DEPS` exigía `=1` para reinstalar tras la muerte del proceso; sin la variable, el sistema dejaba el error en pantalla y mandaba al usuario a la terminal. Y el `npm install` de reparación usaba **timeout de 300 s**, que es precisamente el mecanismo que trunca instalaciones y genera árboles fantasma.

Resultado: con la carpeta podada, **ninguna** de las tres capas de defensa (decisión → pre-chequeo → reparación) hacía nada. El sandbox no podía arreglarse solo, nunca.

## 2. El parche (mismo criterio en tres capas)

**Regla nueva, única:** *un paquete está instalado cuando su carpeta existe, su `package.json` se parsea, y el archivo de entrada que él mismo declara (`main` / `exports["."]` / primer `bin`) está en el disco.*

| Capa | Archivo | Cambio |
|---|---|---|
| **Auditoría** | `src/engine/dependenciasProyecto.ts` | Nuevas funciones puras `saludDePaquete`, `auditarInstalacion`, `instalacionSana` (disco inyectado por parámetro; 12 tests nuevos). |
| **Decisión** | `src/engine/viaRapidaPreview.ts` | Campo `nodeModulesSano` en `EntradaPreview`. Con config propia + árbol podado → sigue `npm-dev` pero **declara `requiereInstalar: true`**. Marco con servidor propio: idem. Árbol sano o ausente: comportamiento viejo intacto (la vía rápida sigue sin instalar nada). |
| **Preflight** | `server.ts` (`/api/sandbox/start`) | Antes de spawn (donde no hay watcher vivo que despertar): audita los declarados → **purga solo las carpetas rotas** → `npm install --no-audit --no-fund` con **600 s**. `estaInstalado` del cruce v1.6.7 reforzado con la auditoría. La IDE anidada (`cerebronico-ide`) queda excluida: se autorrepara en su bloque PROPIO-IDE con `--ignore-scripts`. |
| **Reparación** | `server.ts` | `AUTO_INSTALL_DEPS` **ON por defecto** (opt-out `=0`), justificado: solo corre con el proceso del proyecto ya muerto y en una acción explícita de Arrancar — el bug de aislamiento «subir ZIP reinicia la app» era de instalaciones *durante* cargas masivas, que no instalan. Añadido **Intento 3**: si tras reinstalar el log sigue con `Cannot find module`, se purga `node_modules` completo y se instala de cero (nunca se toca código del usuario). |
| **Transparencia** | ambos | La respuesta JSON gana `instalo: boolean` y `via: "estatico-directo" | "estatico-compilado" | "npm-dev"`; la pista final ya no manda al usuario a la terminal: explica que la reparación falló y por dónde (red/registry/versões). |
| **Producción** | `dist/server.mjs` | Los seis cambios espejados 1:1 en el bundle compilado (`node --check` OK), generador idempotente en `scripts/parche-sandbox-v1624.mjs` por si se regenera desde otro source. |
| **Versión** | `constants.ts`, `package.json`, bundle | `1.6.23` → `1.6.24`. |

## 3. Comportamiento esperado ahora

- **ZIP recién importado (sin `node_modules`)**: vía rápida esbuild si no trae config; si trae `vite.config.ts`, `npm install` automático antes de arrancar Vite → preview vivo.
- **Árbol podado/corrupto (el error reportado)**: auditoría lo detecta ANTES de spawn, purga los paquetes rotos, reinstala; si aun así muere, la escalada purga e instala de cero. El usuario no toca la terminal en ninguno de los dos casos.
- **Proyecto sano**: cero cambios de comportamiento (no reinstala, no purga) — tests de regresión de v1.6.9 en verde.

## 4. Verificación

- `node --experimental-strip-types` sobre los suites puros: **Vía Rápida 58/58** (incluidos los 4 casos nuevos del árbol podado y la invariante barrida con la nueva dimensión) · **Dependencias 44/44** (12 casos nuevos de auditoría) · `sandboxCompat` y `raizDatos` sin regresión.
- `node --check` sobre `dist/server.mjs` y `--experimental-strip-types --check` sobre `server.ts`/`constants.ts`: sintaxis válida.
- Prueba manual al desplegar: importar un proyecto React+Vite con `vite.config.ts`, borrar su `node_modules`, pulsar Arrancar → debe aparecer en el log `→ npm install automático antes de arrancar.` y luego el preview en :3500.

## 5. Notas

- La primera auto-instalación **necesita red** (registry de npm). Sin red el sandbox ahora lo dice explícitamente (`timeout de 10 min — ¿red lenta o registry caído?`) en vez de morir en silencio.
- `Cerebronico-v1.1.1/` (copia antigua incluida en el consolidado) **no se tocó**: snapshot histórico; el `ide/` de la raíz es el árbol vivo.
- Respaldo del bundle previo a `dist/server.mjs.v1.6.23.bak` guardado **fuera** del paquete (carpeta `_respaldo_cerebronico/` junto a este proyecto).
- Opt-outs que siguen funcionando: `SANDBOX_AUTO_DEPS=0` (no tocar dependencias) y `AUTO_INSTALL_DEPS=0` (no reparar post-mortem).

---

## 6. RONDA 2 — SANDBOXFIX2 (log del 23-09, 9:37–9:53 p. m.)

El primer parche cerró el fallo de dependencias. El log nuevo cuenta **otra historia**, con cuatro líneas que lo delatan:

| Línea del log | Lo que significa |
|---|---|
| `SYNC · Proyecto reconocido en: C:\Cerebronico\ide\backend` | El editor tenía sincronizada **la propia CerebróNico** (183 archivos con carpeta `ide/`), no una app. |
| `Proyecto aplanado: 4 elemento(s) movidos desde «ide/»` | El aplanado renombró la carpeta anidada… que era la instalación viva. **El programa movió el suelo que pisaba.** |
| `npm install con errores: … enoent … package.json` | `/api/exec` corrió npm donde ya no había package.json (GUARDA-B del resolutor, correcta, impide señalar la app como proyecto — pero npm quedó ladrando solo). |
| `App viva en :3500 (pid externo)` + `main.tsx: 404` | Lo que respondía en 3500 era un servidor **de otra sesión** con la raíz mudada; y `verify-preview`, que solo conoce proyectos Vite, sentenció «página en blanco» sobre vías que no prometen `/src/main.tsx`. |

### Salvaguardas nuevas (server.ts + espejo en dist/server.mjs)

1. **GUARDA-E (flatten-root)**: si la copia anidada es o contiene el `cwd` del proceso vivo, el aplanado **se niega** y lo dice con la solución en tres pasos (quitar `ide/` del editor / borrar sandbox / sync de solo la app). Una copia *distinta* de la IDE sigue siendo aplanable y recurrible con confirmación.
2. **GUARDA-RECURSIÓN ANIDADA (`/api/sandbox/start`)**: la comprobación `cerebronico-ide` ya no mira solo la raíz de `.proyectos`: también la raíz resuelta. La recursión se declara ANTES de gastar cinco minutos instalando y compilando la IDE dentro de sí.
3. **GUARDA-ENOENT (`/api/exec`)**: comando npm en carpeta sin package.json → busca el package.json hacia abajo (BFS ≤ 4 niveles) y ejecuta ahí; si no existe en ninguna parte, responde en cristiano sin invocar npm.
4. **`installed` auditado (`/api/sandbox/status`)**: deja de ser `existsSync(node_modules)`; ahora pasa por `nodeModulesSanoEn` (auditoría de entrada), así que un árbol podado vuelve a disparar la instalación del piloto.
5. **`verify-preview` consciente de la vía**: antes exigía `/src/main.tsx` siempre (por eso el falso «EN BLANCO»). Ahora clasifica —`estatico-compilado` (sondea `/cn-preview.js`), `npm-dev` (main.tsx + componente), `ide-anidada` (`/` + `/assets/…`), `estatico-directo` (`/` + script)— y añade detección de HTML vacío (< 60 B) y la mención explícita al «pid externo» con «Forzar Limpieza» cuando aplica.
6. **Ayudas compartidas a nivel de módulo** (`DISCO_AUDITORIA`, `esCarpetaDeLaAppViva`, `nombreDelPackageEn`, `nodeModulesSanoEn`, `buscarPackageJsonBajo`): un solo criterio de «dónde vive el proyecto vivo» para status, exec, flatten, start y verify, que era justo lo que se contradecía entre sí.

### Verificación ronda 2

- `server.ts`: `node --experimental-strip-types --check` OK.
- `dist/server.mjs`: `node --check` OK; 6 sustituciones aplicadas por `scripts/parche-sandbox-v1624b.mjs` (idempotente, marcado `v1.6.24b-SANDBOXFIX2`), sin símbolos duplicados.
- Suites puros: **Vía Rápida 58/58** · **Dependencias 44/44** (sin regresión).

### Comportamiento esperado con el log de referencia

- Con `ide/` en el editor: el aplanado **no** mueve la instalación (GUARDA-E con mensaje accionable), el piloto detecta la app de la raíz, `/api/exec` instala donde hay package.json (o responde por qué no hay), y `verify-preview` informa según la vía real. El sandbox deja de autocanibalizarse.
- Regla para el usuario: **el sandbox corre TU app; la IDE no se sincroniza dentro de sí misma**. Para dogfood de la IDE existe la ruta explícita de confirmación de recursión (copias distintas, no la del proceso vivo).


---

<a id="informe-sandbox-v1-6-25-md"></a>
## (2/11) INFORME_SANDBOX_v1.6.25.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.25.md`  —  **version:** 1.6.25  —  **bytes:** 11767
# INFORME — SANDBOX v1.6.25 «SANDBOXFIX3»

**Build:** CerebróNico CN v1.6.24-SANDBOXFIX2 → **v1.6.25-SANDBOXFIX3**
**Fallo reportado:** «el sandbox no anda — se queda con la pantalla blanca y pide 3500»

---

## 0. La causa, en una línea

El sandbox **sí arranca** y el puerto **3500 responde 200**, pero la vía rápida
entrega un bundle que **el navegador no puede ejecutar**: 788 bytes que empiezan
con `import React from "react"`. El navegador no resuelve especificadores
desnudos, no monta nada → pantalla en blanco. Y como el bundle se sirve con HTTP
200, el verificador del preview decía «Preview verificado»: el único síntoma
visible era la pantalla vacía.

No era un fallo de instalación de dependencias (eso lo cerró v1.6.24). Era el
**formato del bundle** y **el HTML que quedaba pegado**.

---

## 1. Causa raíz — con evidencia reproducible

### 1.1 El bundle no es ejecutable en un navegador

`comandoBundle` (src/engine/viaRapidaPreview.ts) compilaba con
`--packages=external`, con esta justificación escrita en el código:

> «Deja los `import "react"` tal cual, y el navegador los resuelve por el
> `node_modules` que la IDE sirve en la raíz del proyecto».

**Eso es falso, por dos motivos independientes:**

1. En un navegador un especificador desnudo (`react`) **no se resuelve nunca**:
   no consulta `node_modules`, no sube por el árbol de directorios y no hay mapa
   de imports que lo redirija. La consola del iframe dice
   `Failed to resolve module specifier "react"` y la app no monta.
2. Aunque se sirviera `node_modules` por HTTP, **`react/index.js` es CommonJS**
   (`module.exports = require("./cjs/react.development.js")`) y el navegador no
   ejecuta CommonJS. Un mapa de imports tampoco habría salvado esto: las
   dependencias **tienen** que entrar compiladas dentro del bundle.

**Medición en local, con el propio proyecto del ZIP (`.proyectos`, React+Vite):**

| Bundle | Comando | Tamaño | Imports desnudos |
|---|---|---|---|
| v1.6.24 | `… --format=esm --jsx=automatic --loader:.js=jsx … --packages=external` | **788 B** | `["react", "react-dom/client", "react/jsx-runtime"]` |
| v1.6.25 | `… --format=esm --platform=browser --jsx=automatic --loader:.js=jsx …` | **1.082.773 B** | `[]` |

Y la prueba que cierra el caso: los dos bundles ejecutados bajo un resolutor con
**las reglas del navegador** (cualquier especificador que no empiece por `/`,
`./`, `../` o sea URL → error):

```
=== bundle v1.6.24 ===
Failed to resolve module specifier "react". Relative references must start with either "/", "./", or "../".

=== bundle v1.6.25 ===
ReferenceError: document is not defined
```

El segundo error es **el esperado y es la buena noticia**: la resolución pasó; el
bundle ahora solo se queja de que en Node no hay DOM (en el navegador sí lo hay).

### 1.2 El `index.html` reescrito se quedaba pegado (por esto «el arreglo de v1.6.24 no se notó»)

`compilarPreviewRapida` reescribe `index.html` para que cargue `./cn-preview.js`
y guarda el original en `.cn-preview/index.html.orig`… **y nada lo devolvía
nunca**. Consecuencia en cadena:

1. Primer arranque, sin `node_modules` → vía rápida → compila el bundle roto →
   **reescribe el HTML** apuntando a él.
2. v1.6.24 instala bien las dependencias, el árbol queda sano, el flujo pasa a
   `npm-dev`… y **Vite sirve el `index.html` reescrito**: el bundle viejo, no
   `/src/main.tsx`.
3. La pantalla blanca **sobrevive a todas las reparaciones** (instalar, purgar
   `node_modules`, reiniciar, «Forzar Limpieza»), porque el HTML ya no pide la
   fuente.

### 1.3 El verificador cantaba verde sobre una página vacía

`/api/sandbox/verify-preview` daba por bueno el preview con que `/cn-preview.js`
respondiera 200 y pesara más de 0 bytes. Un bundle irreproducible en el navegador
cumple esas dos condiciones. De ahí la contradicción que has visto tantas veces:
**«dice que está listo / habla del :3500» y la pantalla está en blanco.**

### 1.4 Lo que el informe de v1.6.24 prometía y el código no hacía

El §3 del informe anterior decía: «si trae `vite.config.ts`, `npm install`
automático antes de arrancar Vite». **No era así.** La decisión pura
(`elegirViaPreview`) solo va por `npm-dev` cuando hay configuración propia **Y**
`node_modules` ya existe; si el proyecto trae `vite.config.ts` y **no** tiene
`node_modules`, cae a la vía rápida… y esa rama **retorna antes** del chequeo de
dependencias, así que el `npm install` automático ni se ejecutaba. Esta versión
lo cierra por el otro lado (ver §2.5).

---

## 2. El parche v1.6.25 — cinco cambios, mismo criterio

| # | Archivo | Cambio |
|---|---|---|
| 1 | `src/engine/viaRapidaPreview.ts` | `comandoBundle`: **fuera `--packages=external`**, dentro `--platform=browser`. Las dependencias entran en el bundle, resueltas subiendo por el árbol (el proyecto vive dentro de `ide/backend/`). `--platform=browser` fija las condiciones de resolución y define `process.env.NODE_ENV` (sin él, el React compilado revienta con «process is not defined», otra pantalla en blanco). |
| 2 | `src/engine/viaRapidaPreview.ts` | Nueva función pura `importacionesDesnudas(codigo)`: audita el bundle **generado** y devuelve los especificadores que un navegador no podrá resolver. Solo mira al principio de línea (donde esbuild escribe los `import`), para no confundir el mismo texto dentro de una cadena o un comentario. |
| 3 | `server.ts` (`compilarPreviewRapida`) | **GUARDA-BUNDLE-DESNUDO**: si el bundle salió con imports desnudos, la compilación se declara fallida **antes** de tocar el HTML, con el motivo exacto en el mensaje. |
| 4 | `server.ts` (`/api/sandbox/start`) | **Restauración del HTML**: si la vía es `npm-dev` (o si la compilación falló), el `index.html` original vuelve desde `.cn-preview/index.html.orig` antes de arrancar nada. Y si la vía rápida falla, el flujo **cae a la vía de npm** (instala lo que falte y respeta su `dev`) en vez de servir una página muerta. |
| 5 | `server.ts` (`/api/sandbox/verify-preview`) | El verificador lee el bundle de disco y **no canta verde** si quedó con imports desnudos: dice literalmente que el bundle se sirve pero el navegador no puede ejecutarlo, y por eso el preview sale en blanco. Añade `desnudos: [...]` a la respuesta JSON. |
| — | `dist/server.mjs` (+ `.map`) | **Regenerado** desde el `server.ts` parcheado con el mismo esbuild del `build` (`--bundle --platform=node --format=esm --packages=external --sourcemap`). Fuente y bundle quedan sincronizados (en el ZIP anterior había divergencias de forma entre ambos). |
| — | `tests/viaRapidaPreview.test.ts` | El test que **exigía** `--packages=external` ahora exige lo contrario (`!cmd.includes("--packages=external")` + `--platform=browser`) y se añaden 5 casos de `importacionesDesnudas`. |
| — | `src/constants.ts`, `package.json`, bundle | `1.6.24` → `1.6.25`. |

**Regla que queda escrita en el código:** *un bundle solo es bueno si el
navegador puede resolver todos sus `import`; el servidor no lo declara listo
hasta haberlo comprobado.*

---

## 3. Verificación ejecutada aquí

| Comprobación | Resultado |
|---|---|
| `VÍA RÁPIDA DE PREVIEW` | **64 correctas · 0 fallidas** (58 + 5 nuevos de `importacionesDesnudas` + 1 de bandera) |
| `DEPENDENCIAS DEL PROYECTO` | **44 correctas · 0 fallidas** |
| `ADUANA v2` (`sandboxCompat`) | **34 correctas · 0 en rojo** |
| `RAÍZ DE DATOS` | **22 correctas · 0 fallidas** |
| `TREGUA` (`sandboxTregua`) | **15 correctas · 0 fallidas** |
| `PROYECTO FUNCIONAL` | **32 correctas · 0 fallidas** |
| `node --experimental-strip-types --check server.ts` | **exit 0** |
| `node --check dist/server.mjs` (bundle regenerado) | **exit 0** |
| Bundle del `.proyectos` real del ZIP | 788 B con bare imports → **1.082.773 B con 0 bare imports** |
| Resolución con reglas de navegador | antiguo: `Failed to resolve module specifier "react"` · nuevo: resuelve (falla solo por falta de DOM) |

### Lo que NO se pudo comprobar aquí (dicho claro)

- No hay Windows, ni el `node_modules` del proyecto real, ni acceso al registry
  de npm: **no se pudo arrancar la IDE de punta a punta** ni medir el preview en
  un navegador de verdad. Lo verificado es el bundle, su resolubilidad, las
  suites puras y la sintaxis de los dos artefactos.
- El `npx --no-install esbuild` del comando no pudo ejecutarse tal cual (el árbol
  de pruebas no trae el shim `node_modules/.bin`); se ejecutó el **mismo binario
  de esbuild con las mismas banderas** que emite `comandoBundle`.

### Prueba manual pendiente (5 minutos, en tu máquina)

1. Importar/desplegar este ZIP y pulsar **Arrancar** (o AUTO).
2. En el log debe aparecer `Preview por «estatico-compilado»: …` y después
   `Vía rápida: ✔ bundle listo (src/main.tsx → cn-preview.js)`.
3. El preview en `:3500` debe mostrar **«CerebroNico Sandbox Funcional — El
   entorno está operativo y sirviendo módulos correctamente en el puerto 3500»**.
4. Si algo falla, el log dirá **por qué** en lugar de quedarse blanco:
   - `✘ el bundle salió con N import(s) que el navegador no puede resolver (…)`
     → falta una dependencia instalable: el flujo cae a `npm install` + `npm run dev`.
   - `index.html restaurado (apuntaba al bundle de la vía rápida)` → ya volvió al
     original; a partir de ahí manda Vite.
5. Consola del iframe (F12 dentro del preview): con el bundle nuevo **no debe
   aparecer** `Failed to resolve module specifier`.

---

## 4. Sobre el «pide 3500» del reporte

No hay ningún literal «pide 3500» en el código. Los dos mensajes que sí existen y
encajan con lo que describes son:

| Dónde | Texto | Qué significa |
|---|---|---|
| Pestaña Sandbox (cabecera) | `APAGADO/REINTENTANDO… · IDE en :3000 · App en :3500` | El motor cree que el sandbox no está en pie (o está reintentando con backoff). |
| Atajo manual / piloto | `El proceso arrancó pero el puerto 3500 aún no responde…` + `El puerto 3500 ya está ocupado por otro proceso… Pulsa «Forzar Limpieza»` | Hay algo reteniendo el 3500 (huérfano) o el proceso murió al arrancar. |

Con la causa de §1.1, **el puerto responde**: si el mensaje que veías era de
«listo/en vivo» junto a la pantalla blanca, es exactamente este fallo (y el
verificador de §1.3 era el que lo tapaba). Si además veías el aviso de puerto no
responde u ocupado, entonces hay además un proceso huérfano de una sesión
anterior: **Detener → Forzar Limpieza → Arrancar** y el log nuevo dirá la verdad
en una línea.

---

## 5. Notas

- **Opt-outs intactos:** `SANDBOX_AUTO_DEPS=0` (no tocar dependencias del
  proyecto) y `AUTO_INSTALL_DEPS=0` (no reparar tras la muerte del proceso).
- **Trade-off documentado y deliberado:** con la vía rápida, un proyecto que
  traiga `vite.config.ts` se previsualiza **sin** su configuración (alias,
  plugins, `define`) — es el precio de previsualizar sin instalar y sin red. Si
  esa configuración importa, el camino es el `npm install` + `npm run dev`, que
  ahora es también el **fallback automático** cuando el bundle no sale ejecutable.
- **El script del parche** (`ide/backend/scripts/parche-sandbox-v1625.mjs`) es
  idempotente y verifica cada anclaje: sirve para reaplicar los cambios si algún
  día se regenera el `server.ts` desde otro source.
- **Riesgo residual:** `--loader:.js=jsx` sigue aplicándose a todos los `.js` del
  bundle (ahora también a los de `node_modules`). Con React/React-DOM compila sin
  errores en las pruebas; si algún paquete usara `<` de forma no-JSX en un `.js`,
  la compilación fallaría en voz alta (y entonces se cae a la vía de npm, que es
  donde estaba antes). No es un fallo silencioso.


---

<a id="informe-sandbox-v1-6-26-md"></a>
## (3/11) INFORME_SANDBOX_v1.6.26.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.26.md`  —  **version:** 1.6.26  —  **bytes:** 6651
# INFORME — SANDBOX v1.6.26 «DIAG»

**Build:** v1.6.25-SANDBOXFIX3 → **v1.6.26-DIAG**
**Fallo reportado:** el sandbox no arranca. El log termina en
`No se pudo arrancar: La IDE no pudo compilarse dentro del sandbox: at ModuleScope.findVariable (…) · at ReturnValueScope.findVariable (…) · at FunctionBodyScope.findVariable (…) · at Identifier.bind (…)`

---

## 0. Qué se ve en tu log, leído en orden

```
SYNC · 185 archivo(s) escrito(s) en C:\Cerebronico
SYNC · Proyecto reconocido en: C:\Cerebronico\ide\backend        ← ⚠ el proyecto es LA IDE
SYNC · Proyecto detectado. Ejecuta 'npm install' y luego 'Arrancar ahora'.
npm install en curso… → [0:25:18] Dependencias instaladas correctamente.
Arrancando servidor del proyecto en el puerto 3500…
⚠ Hay una copia de CerebróNico ANIDADA en el sandbox («ide/backend/») … reintentando con confirmación…
No se pudo arrancar: La IDE no pudo compilarse dentro del sandbox: <14 renglones de PILA, cero de causa>
```

Dos cosas pasan a la vez, y conviene separarlas:

1. **El sandbox está corriendo la propia IDE**, no tu aplicación. La guarda
   anti-recursión de v1.6.24 lo detectó bien (`«ide/backend/»`) y siguió con tu
   confirmación. En ese camino el motor **compila la IDE dentro del sandbox**
   (`npm run build` → `vite build && esbuild …`) y recién después arranca
   `node dist/server.mjs`. Ese build es el que falla.
2. **El mensaje de ese fallo no llegó a la pantalla.** Eso es el bug que arregla
   esta versión (ver §1).

---

## 1. El bug que arregla v1.6.26: el error se recortaba dejando solo la pila

El motor capturaba la salida de un proceso así:

```ts
String(build.stderr || build.stdout).split("\n").filter(x => x.trim()).slice(-6).join(" · ")
```

`.slice(-6)` = **los seis últimos renglones**. En Vite/Rollup/esbuild el mensaje va
**arriba** y debajo queda la pila de llamadas, así que el log mostraba catorce
renglones de `at …` y **cero de causa**. Un fallo sin su mensaje no se puede
arreglar: se adivina.

### Verificación con salidas de error reales (no inventadas)

Reproduje el fallo de Vite aquí (mismo código, dependencias del proyecto) y
capturé tres salidas de error reales; después pasé cada una por el extractor
viejo y por el nuevo:

| Salida real | ANTES (`.slice(-6)`) | AHORA |
|---|---|---|
| `vite build` (Rollup, salida real capturada) | `at onRollupLog (…dep-Dm0c1Wj2.js:46552:5) · at onLog (…) · …` | `error during build: · [vite]: Rollup failed to resolve import "js-yaml" from "…/src/engine/formatConverter.ts".` |
| `esbuild` con import inexistente | incluía el `✘ [ERROR]` de casualidad | `✘ [ERROR] Could not resolve "…" · 1 error` |
| `npm install` de un paquete que no existe | `npm error 404 · …` (cola) | `npm error code E404 · npm error 404 Not Found - GET https://registry.npmjs.org/…` |

El extractor elige las líneas que **parecen la causa** estén donde estén (arriba
en Vite/esbuild, abajo en npm) y, si no reconoce ninguna, toma la **cabeza** de la
salida. Nunca la cola.

Además los dos mensajes ahora dicen **qué comando y en qué carpeta** corrió:

```
La IDE no pudo compilarse dentro del sandbox [npm run build en C:\Cerebronico\ide\backend]: <causa real>
La IDE anidada no pudo instalar sus dependencias (necesita red la primera vez) [npm install en …]: <causa real>
```

Cambios: `server.ts` (4 puntos de captura + helper `detalleDeSalida()`), `dist/server.mjs` regenerado, versión a 1.6.26. Script idempotente:
`ide/backend/scripts/parche-sandbox-v1626.mjs`. Suites puras y `node --check`
siguen en verde.

---

## 2. Sospecha nº 1 para tu `vite build` (a confirmar con el log nuevo)

En mi reproducción, con el código de esta misma versión, `vite build` falló
**exactamente con esta forma**:

```
error during build:
[vite]: Rollup failed to resolve import "js-yaml" from "…/src/engine/formatConverter.ts".
```

…y la causa era una **dependencia declarada en `package.json` que no estaba
instalada** en el `node_modules` del árbol que compilaba. El instalador del
sandbox anidado corre con `--ignore-scripts`; si alguna dependencia del cliente
no quedó disponible (o el `package.json` sincronizado y el `node_modules` no se
corresponden), el build muere exactamente así.

No afirmo que sea tu caso: **la pila que viste (`Identifier.bind`) no es la misma
forma que la mía** (la mía venía con `handleInvalidResolvedId`), y con el log
recortado no había mensaje para comparar. Con v1.6.26 el próximo intento dirá el
import exacto y el archivo, y ahí se arregla en un minuto.

### Cómo tenerlo ya, sin esperar

En la carpeta del sandbox, a mano:

```bat
cd C:\Cerebronico\ide\backend
npm run build
```

Las **primeras 10 líneas** de esa salida son el mensaje que faltaba. Pegámelas y
sigo por ahí.

---

## 3. Qué hacer ahora con el sandbox

### Si querés previsualizar TU app (lo normal)

El editor tiene dentro la carpeta de la IDE, así que el sandbox "reconoce" la IDE
como proyecto. Los pasos que sugiere la propia guarda:

1. **Sandbox → Detener.**
2. **«Borrar todo»** en el editor (vacía `.proyectos`/estado de CerebroNico).
3. **Reimportá SOLO tu aplicación** (no la carpeta que contiene la IDE).
4. **Arrancar ahora.**

### Si querés la prueba «IDE dentro de la IDE» (autotest)

Es un camino legítimo pero pesado: instala las dependencias de la IDE en el
sandbox (~3,5 min en tu log) y **compila el cliente dentro del sandbox**, que es
justo donde está fallando. Dos mejoras candidatas, a decidir con el mensaje real:

- **Omitir `npm run build` cuando `dist/server.mjs` ya está en el árbol**
  (el ZIP lo trae compilado): el autotest arrancaría en segundos y sin pasar por
  Rollup. Requiere confirmar que el sync copia `dist/` — se ve con
  `dir C:\Cerebronico\ide\backend\dist`.
- **Instalar las dependencias del árbol anidado sin `--ignore-scripts`**, por si
  una dependencia necesita su script de instalación para quedar utilizable.

---

## 4. Recordatorio de lo otro (interfaz «todo grande»)

Nada de esto arregla el zoom: para salir del aprieto, **`Ctrl + 0`** (tamaño
global a 15 px). Si además tocaste la paleta de aspecto, en la consola de la IDE:

```js
localStorage.removeItem('codigo0_app_font_size');
localStorage.removeItem('cn.aspecto.v1');
location.reload();
```

Los dos arreglos de interfaz (desplegable CN con scroll y Esc, y tope de escala)
sigo teniéndolos listos para el fuente, pero **el cliente hay que recompilarlo en
tu máquina** (`npm run build`): aquí no lo toco para no cambiar tu bundle por uno
hecho con otras versiones de Tailwind/React.


---

<a id="informe-sandbox-v1-6-27-md"></a>
## (4/11) INFORME_SANDBOX_v1.6.27.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.27.md`  —  **version:** 1.6.27  —  **bytes:** 5541
# INFORME — SANDBOX v1.6.27 «AUTOTEST»

**Build:** v1.6.26-DIAG → **v1.6.27-AUTOTEST**
**Contexto:** colocaste la v1.6.25 dentro del sandbox a propósito — el autotest «IDE dentro de la IDE». Ese camino es el que fallaba.

---

## 1. Qué hacía el motor en ese camino

| Paso | Lo que hacía | El problema |
|---|---|---|
| Instalar | `npm install --ignore-scripts` **solo si NO existía** `node_modules` | Si la carpeta existe pero está **vieja** (creada por un `package.json` anterior), nunca se reinstala: el árbol roto queda **pegado para siempre** |
| Compilar | `npm run build` **siempre** (≈300 s de Rollup dentro del sandbox) | Es el paso que fallaba… y encima regeneraba un `dist/` que **el ZIP ya trae compilado** |
| Fallar | Si el build fallaba → `return error` | Aunque hubiera un `dist/server.mjs` perfectamente usable, el autotest no arrancaba |

Cinco minutos de compilación para volver a generar un archivo que ya estaba, y ese paso era justo el que moría.

---

## 2. Los tres cambios

1. **No recompilar lo que ya viene compilado.** Si existe `dist/server.mjs`, se arranca con él y se omite el build. Para forzar la recompilación: `SANDBOX_IDE_BUILD=1` (o borrar `dist/`).
2. **Un build fallido ya no deja el autotest muerto.** Si el build falla pero hay un `dist/` usable, se avisa en el log y se arranca igual.
3. **`node_modules` incompleto = se reinstala.** La condición dejó de ser «¿existe la carpeta?» y pasó a ser la auditoría de integridad (`nodeModulesSanoEn`): si falta alguna dependencia **declarada**, se instala.

Script: `ide/backend/scripts/parche-sandbox-v1627.mjs` (idempotente). `server.ts` + `dist/server.mjs` regenerado + versión 1.6.27.

---

## 3. Verificación: prueba de integración real (no «por inspección»)

Monté un sandbox de prueba con una **IDE anidada** (`package.json` con `name: "cerebronico-ide"`) cuyo script `build` **falla a propósito** — así, si el parche no saltara, el test falla a gritos. Levanté el servidor parcheado y llamé al endpoint.

**Corrida A — comportamiento normal:**

```
[CerebroNico] Proyecto encontrado en subcarpeta: ide/backend
[CerebroNico] IDE anidada: uso el dist/server.mjs que ya viene compilado (…) — se omite npm run build.
[CerebroNico] Sandbox arrancado (pid 10657) en puerto 3500
```
Respuesta del endpoint: `{"ok":true,"pid":10657,"port":3500,"online":true,…}`
`curl http://127.0.0.1:3500/` → `<h1>NESTED-IDE-OK</h1>`
El build que falla **no se ejecutó nunca** (no aparece `BUILD-SE-EJECUTO` en ningún log).

**Corrida B — con `SANDBOX_IDE_BUILD=1` (forzando el build que falla):**

```
[CerebroNico] IDE anidada: SANDBOX_IDE_BUILD=1 → se recompila (npm run build).
[CerebroNico] IDE anidada: npm run build falló (BUILD-SE-EJECUTO: el parche NO salto) pero hay dist/server.mjs: se arranca con ese build.
[CerebroNico] Sandbox arrancado (pid 10810) en puerto 3500
```
Respuesta: `{"ok":true,"port":3500,"online":true,…}` y el `:3500` sirviendo igual.

Esa segunda línea de log, además, **prueba en vivo el arreglo de v1.6.26**: la causa real del proceso (`BUILD-SE-EJECUTO: …`) aparece en el mensaje en lugar de la pila.

Suites puras sin cambios: Vía Rápida 64/64 · Dependencias 44/44 · ADUANA v2 34/34 · Raíz de datos 22/22 · Tregua 15/15 · Proyecto funcional 32/32 · `node --check` OK en `server.ts` y en el bundle.

**Nota de honestidad:** para levantar el servidor en mi entorno tuve que poner dos sustitutos mínimos (`js-yaml`, `smol-toml`) en el `node_modules` de una copia de trabajo. **No forman parte del ZIP**; sólo existen para poder ejecutar la prueba.

---

## 4. Un hallazgo que apunta a tu `vite build`: falta `js-yaml`

En el árbol que tengo, el `node_modules` viejo **no tenía `js-yaml`**, que el código importa en `src/engine/formatConverter.ts`. Con esa ausencia, `vite build` muere exactamente con:

```
error during build:
[vite]: Rollup failed to resolve import "js-yaml" from "…/src/engine/formatConverter.ts".
```

…y el mismo hueco rompe también `node dist/server.mjs`, porque ese import queda **externo** en el bundle del servidor. Si tu `C:\Cerebronico\ide\backend\node_modules` viene de una corrida anterior, tiene el mismo problema — y con el guard viejo (`existsSync`) **nunca se reinstalaba**.

**Lo que NO está confirmado:** la pila que viste (`at ModuleScope.findVariable … at Identifier.bind`) no tiene la misma forma que la de mi fallo (la mía traía `handleInvalidResolvedId`), así que **no afirmo** que tu error sea el import de `js-yaml`. Con v1.6.27 ya no hace falta compilar para el autotest; y si algún día lo forzás con `SANDBOX_IDE_BUILD=1`, el log te va a decir el import exacto y el archivo.

---

## 5. Qué hacer con esto

1. **Usá el ZIP v1.6.27.** El autotest «IDE dentro de la IDE» debería arrancar en segundos y mostrar la IDE en el preview, sin pasar por Rollup.
2. Si querés que el **build** también funcione (no sólo el arranque): en `C:\Cerebronico\ide\backend`, borrá `node_modules` y volvé a arrancar — con el cambio 3, el motor reinstala solo lo que falte declarado. Un `npm install` a mano en esa carpeta hace lo mismo.
3. Si en algún momento querés ver **tu app** y no la IDE: importá sólo tu aplicación. El sandbox arranca el primer proyecto que encuentra, y con el ZIP completo lo que encuentra es la IDE.
4. Recordatorio de lo otro: **`Ctrl + 0`** devuelve el tamaño de la interfaz a 15 px (el arreglo de menú/escala sigue pendiente de recompilar el cliente en tu máquina).


---

<a id="informe-sandbox-v1-6-28-md"></a>
## (5/11) INFORME_SANDBOX_v1.6.28.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.28.md`  —  **version:** 1.6.28  —  **bytes:** 5171
# INFORME — SANDBOX v1.6.28 «AUTOMEJORA»

**Build:** v1.6.27-AUTOTEST → **v1.6.28-AUTOMEJORA**
**Objetivo (tuyo):** «quiero ser capaz de reformar mi proyecto, eso sí es automejora».

---

## 0. Corrección de rumbo — y lo digo primero

Lo de ayer (v1.6.27) hacía que el arranque **usara el `dist/` que viene en el paquete y se saltara el build**. Eso arranca en segundos, pero **no sirve para automejora**: serviría el código viejo. Y lo peor no es que sea lento o rápido — es que *podía parecer que la reforma funcionó* cuando en realidad estabas viendo el build anterior.

Para reformar y **ver** el resultado hace falta lo contrario: **compilar cuando hay cambios**. Eso es lo que hace esta versión.

---

## 1. El ciclo que ahora existe

| Situación | Qué hace el motor |
|---|---|
| `dist/` más nuevo que **todas** las fuentes | No compila: `dist/ al día … sin reformas que compilar` (arranque en segundos) |
| Alguna fuente **más nueva** que `dist/` (o sea: reformaste algo) | **Recompila** (`npm run build`) y arranca con el resultado |
| `SANDBOX_IDE_BUILD=1` | Recompila igual, aunque no haya cambios |
| El build **falla** y la auditoría ve dependencias declaradas sin instalar | **Instala lo que falta y reintenta UNA vez** (auto-reparación) |
| El build **falla** igual, pero hay un `dist/` usable | Avís en el log y arranca con ese build, **diciendo que es anterior a tus cambios** |
| El build falla y **no hay** `dist/` | Error con la causa real + la vía de salida (no hay nada que arrancar) |

El detalle que evita el falso positivo: la comparación es **`fuentes > dist + 2 s`**. Al importar un ZIP todos los archivos quedan con la misma marca de tiempo, y un empate **no** es una reforma (si lo fuera, compilaría en cada arranque).

---

## 2. Verificación: el ciclo completo, en ejecución

Monté un proyecto anidado (`package.json` con `name: "cerebronico-ide"`) cuyo `build` **compila de verdad**: lee `src/mensaje.ts` y genera `dist/server.mjs`. Levanté el servidor parcheado y usé el endpoint real del sandbox.

**Arranque 1 — sin `dist/` (obliga a compilar):**
`:3500` → `AUTOMEJORA: SALUDO v1`

**La reforma** — cambio `src/mensaje.ts` a `"SALUDO v2 (reformado)"`:

```
[CerebroNico] IDE anidada: hay fuentes más nuevas que dist/ → se recompila (npm run build).
[CerebroNico] Sandbox arrancado (pid 11432) en puerto 3500
```
`:3500` → **`AUTOMEJORA: SALUDO v2 (reformado)`** ← la reforma está servida

**Arranque 3 — sin tocar nada:**

```
[CerebroNico] IDE anidada: dist/ al día (…) — sin reformas que compilar, se omite npm run build.
```
(no compila al pedo)

**Y los dos caminos de fallo** (con un `build` que falla a propósito, `BUILD-SE-EJECUTO`):

```
[CerebroNico] IDE anidada: npm run build falló (BUILD-SE-EJECUTO: el parche NO salto) pero hay dist/server.mjs:
               se arranca con ese build — OJO: es ANTERIOR a tus últimos cambios, el preview NO refleja la reforma.
```
→ `{"ok":true,"online":true,…}` y el `:3500` sirviendo: el sandbox no queda muerto, pero **no se hace pasar por reforma lo que es un build viejo**.

Suites puras: Vía Rápida 64/64 · Dependencias 44/44 · ADUANA v2 34/34 · Raíz de datos 22/22 · Tregua 15/15 · Proyecto funcional 32/32 · `node --check` OK en `server.ts` y en el bundle.

---

## 3. Tu flujo, de aquí en adelante

1. El proyecto (la IDE) abierto en el editor.
2. Le pedís al agente la reforma que quieras.
3. **Sandbox → Sync → Arrancar ahora.**
4. El motor ve que hay fuentes más nuevas que `dist/` → **recompila** → arranca → el preview muestra tu versión reformada.
5. Repetir: cada arranque con cambios compila solo; cada arranque sin cambios arranca en segundos.

Forzar recompilación cuando dudes: `SANDBOX_IDE_BUILD=1`.

---

## 4. Lo que sigue sin verificar (y no lo voy a dar por hecho)

**Si el `vite build` completo de la IDE funciona dentro del sandbox.** Es el único eslabón que no puedo probar aquí: no tengo tu `node_modules` ni tu Windows. Lo que sí está puesto:

- cuando falle, el log va a decir **el import exacto y el archivo** (v1.6.26);
- antes de rendirse, el motor **instala lo declarado que falte y reintenta una vez** (v1.6.28);
- y si igual falla, el `:3500` no queda muerto y te dice que el build es viejo.

Para cerrarlo del todo, en tu máquina:

```bat
cd C:\Cerebronico\ide\backend
npm run build
```

Las **primeras 10 líneas** de esa salida son la causa. Con eso lo arreglo sin adivinar.

---

## 5. Notas técnicas

- El cambio está aplicado **directamente** en `server.ts` (bloque `if (esPropiaIde)`, marcado `v1.6.28-AUTOMEJORA`) y el `dist/server.mjs` está regenerado. No hay script de parche para este cambio porque es la **reescritura completa del bloque** (se lee entero en el código, con el porqué en los comentarios).
- Toqué sólo ese bloque y la versión (`1.6.28` en `constants.ts`, `package.json` y el bundle). Los cambios de v1.6.25/1.6.26/1.6.27 siguen dentro.
- Sigue en pie lo otro: **`Ctrl + 0`** devuelve el tamaño de la interfaz; el arreglo del menú CN (scroll + Esc) y el tope de escala necesitan recompilar el cliente en tu máquina.


---

<a id="informe-sandbox-v1-6-29-md"></a>
## (6/11) INFORME_SANDBOX_v1.6.29.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.29.md`  —  **version:** 1.6.29  —  **bytes:** 4977
# INFORME — v1.6.29 «RESCATE UI»

**Build:** v1.6.28-AUTOMEJORA → **v1.6.29-RESCATE-UI**
**Reporte:** «no me deja llegar hasta la paleta para regular el tamaño ni acceder al menú, tocaste otra cosa».

---

## 1. Primero lo que reportás: ¿lo toqué yo?

**No. Y no lo digo de memoria: lo verifiqué con hashes.** Comparé, byte a byte, el ZIP que vos subiste (v1.6.24) contra el mío (v1.6.28):

| Archivo | Resultado |
|---|---|
| `dist/assets/index-DbdYG4zO.css` (todos los estilos) | **idéntico** |
| `dist/assets/index-LSc9Okxh.js` (todo el cliente React) | **idéntico** |
| `dist/index.html` | **idéntico** |
| `src/App.tsx` · `src/components/Header.tsx` · `RightSidebar.tsx` · `PanelAspecto.tsx` · `src/engine/aspecto.ts` | **idénticos** |

Mis parches (v1.6.25 → v1.6.28) tocaron **sólo el motor**: `server.ts` → `dist/server.mjs`, `src/engine/viaRapidaPreview.ts`, la versión, y el bloque del sandbox anidado. La interfaz no se recompiló nunca: la que ves es la que vos compilaste.

Y el defecto ya estaba en la captura de la v1.6.25 (dos turnos atrás): mismo menú gigante, mismas entradas cortadas. Lo único mío que ves en pantalla es el número de versión del encabezado.

---

## 2. Por qué es un callejón sin salida (la causa, en el código)

El desplegable **MENÚ CN** ([Header.tsx:278](ide/backend/src/components/Header.tsx:278)) es:

```html
<div class="absolute left-0 top-full mt-1 w-72 … z-[100] overflow-hidden">
```

- `w-72` = **18 rem**. Con el tamaño global a 25 px, eso son **450 px de ancho** y una lista de ~780 px de alto en una ventana de 768.
- `overflow-hidden` **sin `max-height`**: lo que sobra **no se puede scrollear**, queda fuera de la ventana.
- Las últimas entradas —**«Paleta de colores»**, «Configuración PRO»— son justo las que quedan afuera.
- Sin llegar a la paleta no hay forma de bajar la escala, y el selector de tamaño del encabezado también queda fuera de alcance. **Por eso no podés salir desde la interfaz.**

Son dos escalas independientes y las dos se guardan: `codigo0_app_font_size` (11–25 px) y `cn.aspecto.v1` (70–220 %).

---

## 3. Cómo salir AHORA (con la v1.6.27 que estás corriendo)

En orden, de la más rápida a la más definitiva:

1. **Zoom del navegador hacia afuera, desde el menú ⋮ de Chrome → Zoom → −** (dos o tres pasos).
   La app captura `Ctrl + rueda` y `Ctrl + 0`, pero **no** puede interceptar el menú de Chrome: al 67–80 % el menú CN entra completo en la pantalla y podés llegar a **«Paleta de colores» → «Restablecer todo»**. Después volvés el zoom a 100 %.
2. **`Ctrl + 0`** → devuelve el **tamaño global** a 15 px (sólo ese escalar).
3. **Consola** (F12 → Console) si los dos escalares están altos:

```js
localStorage.removeItem('codigo0_app_font_size');
localStorage.removeItem('cn.aspecto.v1');
location.reload();
```

---

## 4. Lo que agrega esta versión (para que no vuelva a pasar)

Dos piezas, en `index.html` y `dist/index.html` — **ahí y no en el bundle minificado**, porque el cliente se sirve compilado y meter mano en 1,4 MB de JS minimizado sería peor que no hacer nada:

1. **CSS — el desplegable siempre entra:**

```css
header[data-cn="cabecera"] .absolute.left-0.top-full.mt-1.w-72 {
  max-height: calc(100vh - 6rem) !important;
  overflow-y: auto !important;
}
```

2. **Rescate de escala**, que devuelve **los dos** escalares y recarga:
   - **`Ctrl + Alt + 0`** (atajo nuevo, no pisa el `Ctrl+0` existente);
   - o abrir `http://localhost:3000/?cn-escala=reset`.

Ninguna de las dos cambia la escala por su cuenta: sólo actúan cuando las pedís.

Verificado: el bloque `<script>` extraído pasa `node --check`; el selector coincide con las clases reales del menú; `dist/index.html` sigue bien formado (1 `<head>`, 1 `</head>`, `#root`, y su `/assets/index-LSc9Okxh.js` intacto).

---

## 5. El arreglo de fondo (para tu próximo `npm run build`)

Lo de arriba es una red de seguridad, no la cura. En el fuente, cuando compiles el cliente:

- `Header.tsx:278` → añadir `max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain`.
- `Header.tsx` → **Esc cierra el menú CN** (hoy sólo cierra PRO, el modal de API key y el selector de modelo; el menú CN se cierra únicamente con clic afuera).
- `App.tsx` → **topar la escala global según la ventana** (p. ej. no permitir > 20 px por debajo de 1100 px de ancho) para que la interfaz nunca pueda quedar inalcanzable.
- Opcional: dejar siempre visible el control de tamaño (aunque el encabezado se parta en dos filas).

---

## 6. Sigue pendiente de la v1.6.28

El ciclo de automejora quedó funcionando (reformar → arrancar → recompila → preview), pero **no pude verificar el `vite build` completo de la IDE dentro del sandbox**: es el único eslabón que necesita tu máquina. Si querés cerrarlo:

```bat
cd C:\Cerebronico\ide\backend
npm run build
```

Las primeras 10 líneas de esa salida son la causa exacta.


---

<a id="informe-sandbox-v1-6-30-md"></a>
## (7/11) INFORME_SANDBOX_v1.6.30.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.30.md`  —  **version:** 1.6.30  —  **bytes:** 6054
# INFORME — v1.6.30 «ÁRBOL LIMPIO»

**Build:** v1.6.29-RESCATE-UI → **v1.6.30-ARBOL-LIMPIO**
**Fallo reportado:** el sandbox no arranca; el build de la IDE anidada muere con
`src/components/LeftSidebar.tsx (39:2): "loadLanguageMemories" is not exported by src/utils/languageMemory.ts`

---

## 1. La causa real (por fin con el mensaje delante)

El arreglo del log de la v1.6.26 hizo su trabajo: **ahora sabemos qué falla**, y no es ni la recursión ni las dependencias.

```
"loadLanguageMemories" is not exported by
"../../../CerebroNico/ide/backend/src/utils/languageMemory.ts",
imported by ".../src/components/LeftSidebar.tsx"
```

**En el ZIP que te entregué, ese archivo SÍ exporta la función** (`src/utils/languageMemory.ts`, línea 94) y `LeftSidebar.tsx:39` la importa. O sea: los dos archivos son consistentes… en el ZIP. El que está en tu sandbox, no.

### El mecanismo exacto

La sincronización (`App.tsx:2925`) envía **sólo lo que tiene el editor**:

```ts
files: workspaceFiles.map((f) => ({ path: f.path, content: f.content })),
```

…y **no borra lo que sobra en disco**. Tu log lo confirma: «185 archivo(s) escrito(s)», cuando sólo `ide/backend` tiene ~317 archivos. Es decir: `languageMemory.ts` **no vino del editor en esta sesión** — quedó ahí de una corrida anterior, con una versión vieja, sin `loadLanguageMemories`. El archivo nuevo que lo importa sí se escribió. Un archivo viejo + un importador nuevo = Rollup corta el build.

Eso es todo lo que estuvo pasando durante días: el árbol del sandbox es una **mezcla de versiones**. (Y no, no lo introdujeron mis parches: los archivos del cliente y de la interfaz siguen idénticos byte a byte al ZIP original — §1 del informe de la v1.6.29.)

---

## 2. Lo que arregla esta versión

| # | Cambio | Verificación |
|---|---|---|
| 1 | **El error dice lo que es.** El mensaje distingue un error de CÓDIGO de la «vía de salida» de la recursión (que aquí mandaba a borrar todo y reimportar: pérdida de tiempo). Ahora dice: es código, la causa típica es el árbol mezclado, y los dos pasos para limpiarlo. | Clasificador probado **5/5** con tu texto literal del log, un mensaje de recursión, un `ENOENT`, un `Rollup failed to resolve` real y un fallo genérico de npm |
| 2 | **Ctrl + Alt + L → limpiar el sandbox.** Llama a `/api/fs/clear-all`: borra los restos de sesiones anteriores y **conserva `node_modules` y el estado**. Antes no había forma desde la interfaz: «Forzar Limpieza» sólo reinicia el iframe, y «Borrar todo» se lleva todo. | Prueba en vivo con un sandbox de prueba: `{"ok":true,"deleted":4,"preserved":6}` — borró proyecto y caché de Vite, conservó `node_modules` (raíz y anidado) |
| 3 | **Limpiar ya no se lleva el cerebro.** 🐞 `clear-all` borraba TODO lo que hubiera en la raíz. Con `PROJECT_DIR` apuntando a tu raíz de datos (`C:\Cerebronico`), esa llamada se llevaba `.cerebro-db`, `.cerebronico`, `MEMORIA.md` y `skills.md` **sin rescate** (el borrado total sí los salva; éste no). Ahora preserva exactamente lo mismo que un borrado total. | Prueba en vivo: `.cerebro-db/kb.json`, `.cerebronico/espejos.json`, `MEMORIA.md`, `skills.md` y los `node_modules` **intactos** después de la limpieza |

Suites puras sin cambios: Vía Rápida 64/64 · Dependencias 44/44 · ADUANA v2 34/34 · Raíz de datos 22/22 · Tregua 15/15 · Proyecto funcional 32/32 · `node --check` OK en `server.ts`, el bundle y los dos scripts de `index.html`.

---

## 3. ⚠️ Aviso antes de tocar nada

En el build que estás corriendo (**v1.6.27**) **NO** llames a `/api/fs/clear-all` desde la consola: te borraría el estado (`.cerebro-db`, `MEMORIA.md`). Hasta que instales esta versión, limpiá **a mano**.

---

## 4. Qué hacer ahora

### Camino A — con esta versión (recomendado)

1. Instalá el ZIP **v1.6.30**.
2. **`Ctrl + Alt + L`** (borra los restos; conserva `node_modules` y el estado).
3. **«Arrancar ahora»** → el sync reescribe el proyecto entero desde el editor → el build debería completar (~30-60 s con la caché de Vite ya limpia).

### Camino B — sin cambiar de build

Borrá a mano la carpeta del proyecto dentro del sandbox:

```
C:\Cerebronico\ide
```

Es la **copia que el sandbox escribió** (tu proyecto vive en el editor y en el `.cn`). Se rehace sola: el sync reescribe el código y `node_modules` se reinstala (~3 minutos, como la primera vez).

### Después, en los dos casos

Si el error **cambia** a `Could not resolve "./utils/languageMemory"`, entonces ese archivo **tampoco está en el workspace del editor** — y la solución es otra: reimportar el proyecto completo (import sobre workspace vacío) para que el editor tenga los ~317 archivos, no 185.

---

## 5. Sobre «por primera vez veo que sube la CPU»

Eso es **el build corriendo de verdad**: Rollup analizando ~1900 módulos de la IDE. Es el precio de compilar la IDE dentro del sandbox — y es exactamente lo que pediste que exista para la automejora. En tu máquina se vio al 63 % de CPU; terminado el build, el proceso baja y queda sólo el servidor del preview.

---

## 6. Lo que queda propuesto (no implementado a propósito)

**Que la sincronización sea un ESPEJO**: al sincronizar, borrar en el sandbox lo que ya no está en el editor. Eso mata el problema de raíz. No lo activé automáticamente porque el agente también escribe archivos directo en disco con sus herramientas (`fs_write`): un espejo ciego podría borrar trabajo que sólo existe en el sandbox. La versión segura es la de esta entrega: **limpiar cuando vos lo pidas** (Ctrl + Alt + L) y que el sync reescriba.

---

## 7. Recordatorio de la v1.6.29 (ya incluida acá)

- **`Ctrl + Alt + 0`** → devuelve los dos escalares de tamaño (global y aspecto) y recarga.
- El desplegable **MENÚ CN** ahora tiene altura máxima + scroll: «Paleta de colores» ya no queda fuera de la pantalla.
- Mientras sigas con la v1.6.27 (interfaz gigante): **Chrome ⋮ → Zoom → −** para llegar al menú, y después volvé el zoom a 100 %.


---

<a id="informe-sandbox-v1-6-31-md"></a>
## (8/11) INFORME_SANDBOX_v1.6.31.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.31.md`  —  **version:** 1.6.31  —  **bytes:** 3879
# INFORME — SANDBOX v1.6.31 «ESPEJO-SYNC»

**Build:** v1.6.30-ARBOL-LIMPIO → **v1.6.31-ESPEJO-SYNC**
**Fallo reportado (evidencia del usuario, 2:10 a. m.):** `npm run dev` arranca Vite bien (14,7 s, :3500 servido) y muere con `[exit 1] (timeout) Command failed: npm run dev`. El iframe queda en blanco «pero no hace nada».

---

## 1. Las dos causas que quedaban, vistas de frente

### 1.1 Un servidor corriendo por la puerta síncrona (el log pegado)

`/api/exec` es un endpoint **con timeout que espera a que el comando termine**. `npm run dev` **no termina nunca**: Vite arranca feliz, sirve :3500… y `runCommand` lo mata al cumplir el timeout. El piloto reintenta → otro cold start de 14 s → otra muerte. El proyecto y sus dependencias estaban perfectos; la puerta era la equivocada. Con `--strictPort`, además, el reintento choca contra el cadáver del puerto.

### 1.2 El árbol mezclado (herencia de v1.6.30 §6, pendiente a propósito)

El sync escribe lo que trae el editor y **nunca borra lo que sobra**. El manifiesto de v1.6.30 lo dijo con números: 185 archivos escritos contra ~317 en disco. Un `languageMemory.ts` viejo + un importador nuevo = Rollup corta el build. §6 descartó el espejo ciego con razón: el agente escribe directo a disco con `fs_write` y un ZIP tampoco pasa por el editor — un `rm` por diferencia los borraría.

## 2. Lo que trae esta versión

| # | Cambio | Por qué es seguro |
|---|---|---|
| 1 | **GUARDA-SERVIDOR-EJEC** (`/api/exec`): comandos de servidor (`npm/pnpm/yarn/npx dev\|start\|serve\|watch`, `vite`, `next dev`, `nodemon`, `node …server…`) **no se ejecutan** aquí. Si el sandbox ya está vivo → `ok:true` con la verdad («ya vive en :3500, no arranques otro»). Si no → rechazo con `usaEnSuLugar: "POST /api/sandbox/start"` y la explicación del timeout. | Ningún flujo legítimo se pierde: la vía gestionada existe desde v2 y es la que el piloto ya usa. |
| 2 | **ESPEJO-SYNC** (`/api/fs/sync`): manifiesto de propiedad en `.cn-sync/manifiesto.json`. Cada sync anota qué escribió (incluidos los **stubs** que él genera). Al terminar, retira solo lo que **un sync anterior escribió y esta tanda ya no trae**. La respuesta trae `retirados` + detalle, y el mensaje lo anuncia. | Lo de `fs_write`, lo del ZIP y lo puesto a mano **jamás aparecen en el manifiesto** → anatómicamente intocables. Segunda capa: `node_modules`, `.git`, `dist`, `.vite`, `.cn-*`, `.cerebro*`, `MEMORIA.md`, `skills.md` protegidos por segmento **a cualquier profundidad** (el test 4 cazó que el prefijo solo-al-inicio dejaba pasar los anidados). Sync con 0 archivos = fallo de transporte, no orden de vaciado: no retira nada ni reescribe el manifiesto. |
| 3 | Motor puro nuevo: `src/engine/espejoSync.ts` + suite `tests/espejoSync.test.ts` (**19/19**). | El disco se inyecta; el diff es determinista y testeable sin tocar filesystem. |

**Sin regresión:** Vía Rápida 64/64 · Dependencias 44/44 · `node --check` OK en `server.ts` y en el bundle. Espejo 1:1 del bundle vía `scripts/parche-sandbox-v1631.mjs` (idempotente). Versión → **1.6.31**.

## 3. Qué hacer ahora

1. Instalar este ZIP sobre la instalación.
2. Un Sync normal: la primera pasada retirará los restos de sesiones anteriores (el log dirá `ESPEJO-SYNC · N archivo(s) obsoleto(s) retirado(s)`). No hace falta Ctrl+Alt+L.
3. «Arrancar». Si algo (piloto o agente) intenta `npm run dev` por la terminal, recibirá la puerta correcta en el mensaje en vez de una muerte por timeout.

## 4. Límite conocido (honestidad)

El espejo cura el «sobra código viejo»; **no** cura el «falta código» — si el editor solo tiene 185 de 317 archivos, al proyecto le faltarán piezas (el clasificador de v1.6.30 ya lo detecta con `Could not resolve`). La salida para ese caso sigue siendo reimportar el proyecto completo sobre workspace vacío.


---

<a id="informe-sandbox-v1-6-32-md"></a>
## (9/11) INFORME_SANDBOX_v1.6.32.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.32.md`  —  **version:** 1.6.32  —  **bytes:** 9169
# INFORME — SANDBOX v1.6.32 «EVOLUCIÓN»

**Build:** v1.6.31-ARBOL-LIMPIO+QUIRÓFANO-v1.1-HD → **v1.6.32-EVOLUCIÓN**
**Ejes pedidos:** fluidez · calidad · velocidad · seguridad.
**Veredicto de la puerta:** `npm run validar` → **3291 comprobaciones, 0 fallos,
61 suites, 0 errores de tipos** (era 3230/58; +61 comprobaciones, cero
regresiones). `npm run build` ejecutado: el `dist/` que viaja en este ZIP ya
contiene TODO esto — el EXE y `npm start` quedan protegidos SIN recompilar.

---

## 1. Qué se evolucionó (y por qué era este el punto)

### 1.1 CALIDAD — SYNTAXGUARD v3: el parser de verdad (ROADMAP D-P1)

El guardián de sintaxis (v2.0) hacía bien una cosa y la hacía a conciencia:
**no bloquear con heurísticas lo que no podía afirmar** (genéricos `<Props>`,
JSX, backticks). Pero el ROADMAP dejaba apuntado el hueco con nombre:

> «3. syntaxGuard con esbuild.transform para validar TS/JSX de verdad (hoy el
> balanceo TS/JS + JSX es código muerto).»

Es decir: el mutilado clásico —`export function f() {` sin llave final,
perfectamente «balanceado» para una heurística tonta— seguía entrando al
sandbox y reventando Rollup. El Quirófano lo juzgaba por proporciones; la
llave en sí, nadie.

**Solución:** `guardFileProfundo()` en `syntaxGuard.ts` — parser REAL
(esbuild 0.25, `transform`) inyectado como dependencia. Las cuatro puertas de
escritura lo usan ahora DESPUÉS de la capa rápida (el parser solo corre si la
v2.0 dio limpia; si la v2.0 ya sentenció, no se gasta):

| Puerta | Qué protegía | Qué protege ahora |
|---|---|---|
| `write_file` (agente) | heurísticas v2.0 | + truncado/llave/JSX reales con línea exacta |
| `edit_file` (agente) | heurísticas v2.0 | + lo mismo sobre el resultado del reemplazo |
| `/api/fs/write` (autosync del chat) | heurísticas v2.0 | + lo mismo |
| `/api/fs/sync` (lote del espejo) | heurísticas v2.0 | + lo mismo, archivo por archivo |
| `/api/engine/guard` (validar sin escribir) | heurísticas v2.0 | + lo mismo (espejo fiel de las puertas) |

**Regla de oro respetada** (un guardián que encarcela trabajo correcto es peor
que no tenerlo): el parser se EQUIVOCA CON DATOS — es el mismo juez que usa
Vite para compilar el sandbox, así que si él rechaza, el sandbox rechaza: cero
falsos positivos por construcción. Y si el parser FALLA ÉL (falta la
dependencia, crash interno, timeout de 4 s), el archivo **pasa con aviso**:
un guardián averiado no tiene derecho a encerrar. Un .ts con errores que
además contiene `</cierre>` recibe el consejo de renombrar a `.tsx` (el
consejo no bloquea; solo habla).

Suite nueva: `tests/syntaxGuardProfundo.test.ts` — 23 comprobaciones, entre
ellas la REGRESIÓN de los tres falsos positivos históricos de la v2.0
(genéricos con `<` y comparaciones, backticks con llaves sueltas dentro de
cadenas, componente JSX con `<textarea>` sin cierre) y la prueba de que el
parser NO se gasta cuando la capa rápida ya sentenció.

### 1.2 VELOCIDAD — D8: LA MÉTRICA DEJÓ DE SER UNA ADIVINANZA

El ROADMAP lo marcaba en rojo: «D8 — NO IMPLEMENTADO — cero referencias a
`eval_count`/`ttft` en server.ts; el cliente sigue con len/4». Verificado
contra el código: era verdad, y era peor de lo dicho — el cliente «contaba
tokens» haciendo `tokenCount++` POR LÍNEA DE STREAM (una línea NDJSON puede
traer tres tokens o ninguno) y el panel de auto-mejora dividía esa cuenta por
los ms TOTALES (incluyendo carga del modelo y red) y lo llamaba «tk/s».

Ollama manda la verdad en la última línea del stream (`eval_count`,
`eval_duration`, `prompt_eval_count`, `prompt_eval_duration`, `load_duration`,
`total_duration`, en nanosegundos) y el cliente la VEÍA pasar
(`if (data.done) break;`) y la TIRABA.

**Ahora:**
* Motor puro nuevo `src/engine/metricasInferencia.ts`: normaliza ns→ms con la
  misma ley del búfer de inferencia, descarta basura (negativos, 1e12,
  no-números) y devuelve `null` cuando no hay medida — un `null` honesto vale
  más que un 0 inventado.
* `server.ts`: los dos puntos `done` del stream de Ollama extraen la métrica y
  `sendDone` la manda en el propio evento SSE (`{done, model, metricas}`).
* `src/utils/engine.ts` (cliente): **ruta directa a Ollama** captura el `done`
  y usa la cuenta del motor; **ruta proxy** lee `data.metricas` del servidor.
  El `tps` del turno es MEDIDA cuando existe; la cuenta de líneas queda como
  estimación etiquetada (`exacta: false`).
* `App.tsx` + `selfImprovement.ts`: el registro del turno guarda
  `tokensOut/tokensIn/tokPorSegundo/medidaExacta`; el resumen del panel
  calcula la velocidad con los tk/s medidos y muestra cuántos turnos traen
  medida real (`turnosMedidos`).

Suite nueva: `tests/metricasInferencia.test.ts` — 28 comprobaciones, con el
payload real de Ollama (142 tk / 4.531 s → 31.3 tk/s), las formas basura, y la
auditoría estática del cableado de punta a punta.

### 1.3 SEGURIDAD — QUIRÓFANO: dos puertas mutantes abiertas

D2 (v8.0) puso `sandboxAuthorized` en 11 puertas (exec/fs/sandbox). El
QUIRÓFANO añadió después dos endpoints que TOCAN DISCO y se quedaron sin
puerta:

* `POST /api/quirofano/revisar` — cierra la tanda y, si una puerta falla,
  **revierte archivos**.
* `POST /api/quirofano/deshacer` — **reescribe los archivos** con la copia
  anterior.

Cualquiera que alcance el puerto puede pedirle al motor que revierta el
trabajo en curso. Se cerraron con la MISMA puerta que las otras 11 (si no hay
`ACCESS_TOKEN` en el entorno, la puerta es un no-op: la UI no cambia de
comportamiento; si lo hay, piden la cabecera igual que `/api/exec`). El
endpoint de lectura (`/estado`) se quedó abierto a propósito: no muta nada.

Suite nueva: `tests/quirfanoPuertas.test.ts` — 10 comprobaciones estáticas:
ningún `app.post("/api/quirofano/…")` sin `sandboxAuthorized(req)`, el
contrato de la puerta intacto, y el conteo de puertas 11 → 13.

### 1.4 FLUIDEZ — lo que se midió antes de tocar (honestidad)

El recorrido de auditoría buscó bloqueos del bucle de eventos en el servidor:
los cinco escaneos síncronos bajo petición (espejo de proyecto, vía rápida,
árbol de preview) ya excluyen `node_modules`/`.git`/`dist` por segmento y van
topados (profundidad ≤10, ≤600–800 entradas). `raizEfectiva()` escanea en
cada petición de preview **a propósito** (comentario de la casa: el modelo
escribe archivos MIENTRAS corre y una raíz cacheada dejaría de ver lo que
acaba de llegar) y su coste es un `readdir` de primer nivel + un `stat` por
candidato. No había tacho que limpiar sin empeorar esa garantía — así que la
fluidez de esta versión viene por D8: la medida real (tk/s del motor, carga
del modelo aparte) es la que permite al piloto y al usuario decidir con
números que no mienten.

---

## 2. Pruebas: verificación reproducible (D4, pendiente desde el ROADMAP)

Ejecutado en este entorno (Linux, Node 22.23.2):

| Comando | Resultado |
|---|---|
| `npm install` | correcto |
| `npm run validar` (línea base ANTES de tocar) | **3230/3230, 58 suites, 0 tipos** |
| `npm run validar` (después) | **3291/3291, 61 suites, 0 tipos** |
| `npm run build` | correcto (Vite + esbuild); `node --check dist/server.mjs` OK |

## 3. Ficheros tocados

| Fichero | Qué |
|---|---|
| `src/engine/metricasInferencia.ts` | **nuevo** — motor puro D8 |
| `src/engine/syntaxGuard.ts` | v3.0: `guardFileProfundo`, tipo `parser`, heurística del consejo .tsx |
| `server.ts` | import+adaptador `PARSER_ESBUILD`, 5 puertas profundas, `sendDone(metricas)`, 2 extracciones del done, gates del Quirófano |
| `src/utils/engine.ts` | métrica en las dos rutas del stream + `consumirUltimaMedicion()` |
| `src/App.tsx` | registro del turno con medida real |
| `src/utils/selfImprovement.ts` | `TurnMetric` + `turnosMedidos`; tk/s con medida |
| `tests/metricasInferencia.test.ts` | **nuevo** — 28 |
| `tests/syntaxGuardProfundo.test.ts` | **nuevo** — 23 |
| `tests/quirfanoPuertas.test.ts` | **nuevo** — 10 |
| `scripts/validar.mjs` | 3 suites registradas |
| `src/constants.ts` + `package.json` + `index.html` | versión → **1.6.32** (una semilla, dos literales derivados) |
| `dist/` | **recompilado** — el bundle lleva todo dentro |

## 4. Límites declarados (para que no te confíes)

* La métrica real existe **donde el motor la manda**: Ollama (directo y
  proxy). Los proveedores cloud que no publican `eval_count` siguen
  registrándose como ESTIMACIÓN, con la etiqueta `medidaExacta: false` a la
  vista.
* El parser real juzga **sintaxis**, no lógica: una mejora que compila y queda
  fea sigue siendo tuya (misma línea que el Quirófano).
* Los `*_duration` en ns se normalizan con la ley de la casa (umbral 1e7); un
  motor que publicara ms ya hechos con valores >1e7 los dividiría mal — es el
  mismo compromiso asumido por `inferenceBuffer` desde v1.6.6, y las dos
  copias están declaradas en el comentario del módulo.
* Queda para la próxima (sin tocar hoy, verificado el estado): D7 (votación de
  los 12 especialistas), D9 (auto-lección al recuperar un error), catálogo
  honesto de `skills100.ts`, y el hueco grande: Git nativo.


---

<a id="informe-sandbox-v1-6-33-md"></a>
## (10/11) INFORME_SANDBOX_v1.6.33.md

> **Fuente:** `./INFORME_SANDBOX_v1.6.33.md`  —  **version:** 1.6.33  —  **bytes:** 5622
# INFORME — SANDBOX v1.6.33 «CONSEJO QUE VOTA»

**Build:** v1.6.32-EVOLUCIÓN → **v1.6.33-CONSEJO-QUE-VOTA**
**Ejes:** D7 (votación real) · catálogo honesto · fuente única de versión en la pestaña «Acerca de».
**Puerta:** `npm run validar` → **3372 comprobaciones, 0 fallos, 63 suites, 0 errores de tipos**
(era 3291/61; +81 comprobaciones, cero regresiones). `npm run build` ejecutado: el `dist/`
de este ZIP lleva TODO dentro — el EXE y `npm start` quedan servidos sin recompilar.

---

## 1. D7 — EL CONSEJO VOTA DE VERDAD (el ROADMAP decía «5 sin rama»; eran 16 a Ayuda)

`DUEÑO_DE` solo tenía ramas para 6 acciones. El clasificador (`cerebroReflejo.pensar`) emite
**22** `orden.tipo`: las 16 de Reflejo v3.0 (`analizar`, `explicar`, `resumir`, `comparar`,
`listar`, `ordenar`, `filtrar`, `contar`, `buscar`, `testear`, `documentar`, `refactorizar`,
`optimizar`, `traducir`, `instalar`, `desplegar`) caían **todas** al `|| "ayuda"`. El Lingüista,
el Investigador y el Validador no recibieron un voto jamás; la sesión lo registraba como
«resuelto por Ayuda».

**Ahora** (`src/engine/votacionConsejo.ts`, fuente única + `tests/consejoVotacion.test.ts` 40/40):
* **9 asientos reciben voto real** (antes 6) + Ayuda como **portavoz** del silencio = 10 voces.
* Reparto honesto por dominio: L ingüista ← analizar/explicar/resumir/comparar/listar/ordenar/
  filtrar/contar · Investigador ← buscar · Validador ← testear · Operario ← documentar/
  refactorizar/optimizar.
* **Se declaran los que NO votan**: telemetría y memorista (aportan herramientas —
  `maq.*`, `memorista.registrar`—, no disputan frases). Y las 3 acciones sin especialista
  (`traducir`, `instalar`, `desplegar`) se nombran con su motivo en vez de disfrazarse.
* `pensarConsejo` atribuye por el reparto y devuelve el MOTIVO del voto; `estadoConsejo()`
  expone `voto_por_frase` por especialista y el bloque `reparto`. La cabecera del módulo
  (que prometía «12 votantes») quedó corregida.

## 2. CATÁLOGO HONESTO — 100 «activas» eran 31 verificadas + 69 en el mapa

`skills100.ts` marcaba las 100 como `active` y `contextCache` las volcaba ENTERAS al prompt:
el modelo le decía al usuario que existían YOLO local, Wasm, JWT RS256, Protobuf o Prettier
porque **se lo leía de su propio manual**.

**Ahora** (`src/engine/catalogoHonesto.ts` + `tests/catalogoHonesto.test.ts` 32/32):
* Cada capacidad activa apunta a **evidencia real** (31 ids → ficheros del repo que existen;
  el test lo comprueba con `fs.existsSync`, así la mentira no sobrevive a un refactor).
* El SKILLS.md inyectado tiene **dos bloques con nombre verdadero**: `ACTIVA (evidencia: …)` y
  `MAPA (aspiracional — NO afirmar que existe)`, con la orden explícita de no ofrecer lo segundo.
* Los huecos del roadmap quedaron clavados como pendientes por test: visión/OCR, Wasm, Git
  diffs, merge, YOLO, ×100, Protobuf, JWT, Prettier.
* El texto viejo («Catálogo de 100 Habilidades», «declara 100 capacidades operativas») ya no
  existe en el prompt (regresión en el test).

## 3. LA PESTAÑA «ACERCA DE» (reporte con captura)

La pestaña del navegador decía `V1.6.31` y el panel **`CerebroNico IDE v2.0.0`**: `App.tsx`
le pasaba `version="2.0.0"` y el panel traía default `"1.8.0"`. Era la ÚLTIMA fuente paralela
de versión del defecto que la casa ya había cazado en la cabecera (D5).

**Ahora**: la prop se retira, el panel lee `IDE_BRAND` (nombre + `VERSION` + `AUTHOR`) y muestra
**«CerebróNico V1.6.33 · IDE»**. De la misma familia, y también derivados de la marca: el README
semilla del workspace y el README/manifiesto de los paquetes `.cn` (que firmaban «CerebroNico IDE
v1»). Regresión añadida al suite de versión única (`motor-datos`: 78/78).

Verificado sobre el bundle servido: `dist/index.html` → `V1.6.33`; el literal `CerebroNico IDE v`
bajó de 3 a **1** (queda solo la etiqueta legítima de formato legacy al leer `.cn` viejos) y
`v2.0.0` ya no aparece. `node --check dist/server.mjs` OK.

## 4. Ficheros

| Fichero | Qué |
|---|---|
| `src/engine/votacionConsejo.ts` | **nuevo** — reparto único de votos (23 acciones) |
| `src/engine/catalogoHonesto.ts` | **nuevo** — auditoría por evidencia + SKILLS.md honesto |
| `src/engine/reflejo/consejo.ts` | DUEÑO_DE derivado, atribución con motivo, estado con reparto |
| `src/utils/contextCache.ts` | inyecta el catálogo auditado (adiós al volcado de 100) |
| `src/components/ProConfigPanel.tsx` | «Acerca de» lee IDE_BRAND (sin prop de versión) |
| `src/components/RightSidebar.tsx` | import muerto de skills100 retirado |
| `src/utils/fileParser.ts`, `src/App.tsx` | README semilla y paquete `.cn` firmados con la marca |
| `tests/consejoVotacion.test.ts`, `tests/catalogoHonesto.test.ts` | **nuevas** (40 + 32) |
| `tests/motor-datos.test.ts` | +9 aserciones de versión visible |
| `scripts/validar.mjs` · `constants.ts` · `package.json` · `index.html` · `dist/` | registro y versión **1.6.33** |

## 5. Límites declarados

* El curado del catálogo es humano **verificado por test**: si un fichero de evidencia
  desaparece, la suite lo denuncia; pero las 69 aspiracionales siguen siendo mapa, no producto.
* La etiqueta `CerebroNico IDE v1 (legacy JSON)` de `fileParser` se conserva a propósito:
  describe archivos viejos, no la app.
* Sin tocar (siguiente ronda): **D9** (auto-lección al recuperar un error), **Git nativo**,
  `instalar/desplegar` sin especialista (hoy declarado), y la votación de las acciones
  genéricas aún sin ejecutor real en `planExecutors` (hoy atribuyen y se registran).


---

<a id="informe-sandbox-v1-13-0-md"></a>
## (11/11) INFORME_SANDBOX_v1.13.0.md

> **Fuente:** `./INFORME_SANDBOX_v1.13.0.md`  —  **version:** 1.13.0  —  **bytes:** 56694
# INFORME — v1.7.0 «SEGURIDAD Y PUERTA»

**Build:** v1.6.33-CONSEJO-QUE-VOTA → **v1.7.0-SEGURIDAD-Y-PUERTA**
**Fecha:** 24-sep-2026 · **Propietario:** Mario Nicolas Quintero
**Base de trabajo:** el ZIP `Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA` que subiste, auditado primero y modificado después.
**Plan que ejecuta:** [PLAN_MAESTRO_V2](PLAN_MAESTRO_V2/PLAN_MAESTRO_CEREBRONICO_V2_PRO.md) — fases 0 y 1 completas, más la automatización del `.bat`.

------------------------------------------------------------------------

## 1. La puerta, ejecutada (no citada)

| Comprobación | Antes (v1.6.33) | **Ahora (v1.7.0)** |
|---|---|---|
| `npx tsc --noEmit` | 0 errores | **0 errores** |
| `npm run validar` | 3372 · 0 fallos · 63 suites | **3442 · 0 fallos · 64 suites · 0 sin correr** |
| Integridad | 22 ficheros firmados a mano | **457 ficheros firmados por generador · `sha256sum -c` = 457/457** |
| `npm audit --audit-level=high` | — | **0 vulnerabilidades** |
| Bundle | `dist/server.mjs` con 1.6.33 | **`dist/server.mjs` con 1.7.0 · `node --check` sano** |
| Humo real | — | **`:3000` responde 200 y sirve «CerebróNico V1.7.0» · puente `:5000` responde en vivo con `shell: false`** |
| Árbol tras la puerta | — | **`manifiesto:verificar` = 457 declarados · 457 en disco · TODO COINCIDE** |

Delta: **+70 comprobaciones** (3372 → 3442), **0 regresiones**, y una suite nueva.

------------------------------------------------------------------------

## 2. FASE 0 · Verdad congelada (completa)

### 2.1 La puerta ya no puede quedarse sin ejecutar una suite
`scripts/validar.mjs` ejecutaba una **lista fija**. Una suite nueva que nadie registrase **no corría nunca** y el veredicto seguía verde.

- Ahora **descubre** `tests/*.test.ts` y `scripts/validar-*.mts` en disco y las ejecuta todas, estén en el catálogo o no.
- Una suite del catálogo **cuyo fichero ya no existe** es un **rojo**, no un silencio.
- **Prueba en vivo, no teórica:** la suite nueva `tests/seguridadPuente.test.ts` se ejecutó **sin** estar registrada, y el propio informe lo dijo:
  `1 suite(s) en disco fuera del catálogo — se ejecutan igual: + tests/seguridadPuente.test.ts`
- El catálogo se conserva como **descripciones** (y la regla de la casa «toda suite se registra» sigue viva: la suite `resiliencia` la comprueba y ahora pasa).

### 2.2 Ninguna marca ✗ se pierde, y ninguna lectura tapa a la otra
Aquí me equivoqué en el primer intento y lo dejo escrito, porque la corrección es el dato:

- **Lo que había:** si la suite traía recuento, las marcas `✗` no se miraban.
- **Lo que probé primero:** «gana el caso peor» (`mal = max(mal, marcas)`). **Saltó un falso rojo** en `planner`: esa suite **imprime** `✗ #2 revienta [fallida · io]` como **contenido** (el estado de una tarea que el test hace fallar a propósito), no como comprobación fallida.
- **Lo que quedó, tras comprobarlo en las 62 suites:** manda el **veredicto + el código de salida** (las 62 suites hacen `process.exitCode = 1` al fallar), y las marcas `✗` **no se ignoran**: si el veredicto dice 0 fallos y hay marcas, se **avisan en voz alta** en el informe.
  Hoy: `AVISO: 1 marca(s) ✗ en 1 suite(s) verde(s) — revisar…` ← eso antes era silencio.

### 2.3 El manifiesto lo genera la máquina: 22 → 457
`scripts/manifiesto.mjs` (nuevo, con `npm run manifiesto` y `npm run manifiesto:verificar`):
recorre el paquete y firma **todo**. Excluye lo que se explica por escrito: `node_modules`, `.proyectos/**` (estado que las pruebas de humo modifican), `*.log` y el propio manifiesto.
`--verificar` responde a las dos preguntas que importan: **¿cambió algo?** y **¿hay ficheros nuevos que el manifiesto no conoce?**

### 2.4 ROADMAP regenerado
Se corrigieron los pendientes que ya estaban implementados y que hacían **repetir trabajo en cada sesión**: D7 (votación), D8 (métricas), D-P1 (parser real) y el catálogo honesto figuraban como pendientes. Ver `ROADMAP.md`.

------------------------------------------------------------------------

## 3. FASE 1 · Seguridad cerrada (completa)

### 3.1 El puente ya no usa shell — y no perdió `dir`
`agent_bridge_5000.py` ejecutaba con `subprocess.run(..., shell=True)` sin lista blanca de binarios. La mitigación declarada era «token + auditoría»: la auditoría dice lo que pasó **después**; no impide nada.

**Ahora:**
1. **Sin shell.** El comando se parte con `shlex`, se rechazan los metacaracteres (`;` `>` `<` `` ` `` `$(` `${` `^` y el **`&` suelto** que colaba a cmd.exe) y cada tramo se valida contra una **lista blanca**.
2. **Los nativos de Windows siguen funcionando** (`dir`, `echo`, `type`, `tasklist`…): van por `cmd.exe /c` con el comando **ya saneado**. Aquí tuve un fallo real que cazó mi propia prueba: comparaba la lista de binarios y **olvidaba la de nativos**, así que `dir` quedaba rechazado en Windows por el endurecimiento pensado para Windows. Corregido.
3. **La lista es explícita y tuya:** `puente-permitidos.json`, versionado y comentado. Deliberadamente **no** están `rm`, `mv`, `cp`, `dd`, `del`, `reg`, `net`: las mutaciones de fichero van por `/api/fs/*`, que sí comprueba raíces. Añadir un binario es una decisión escrita.
4. **Fallos con motivo y con instrucción:** un binario no listado o una ruta fuera de sitio devuelven **por qué** y **qué hacer** para permitirlo. Nada de «error 500».
5. **Límite declarado (no lo escondo):** la lista blanca decide **qué programas** se ejecutan; **no** encierra los permisos de fichero de un programa permitido — eso exige un sandbox del sistema operativo. Lo que sí se impide: binarios arbitrarios, composición de shell, redirección a fichero, borrado, y ejecución de binarios descargados.

### 3.2 Contención de rutas de verdad
`resolve_pc_path` terminaba en `return os.path.abspath(p)`: **cualquier ruta absoluta pasaba**. Ahora toda ruta se resuelve con `realpath` y se comprueba contra **raíces permitidas** (`commonpath`); fuera de ellas → **403 con motivo**. Y el patrón correcto ya existía en el proyecto (`resolveSafePath`, `server.ts:662-669`): solo faltaba aplicarlo aquí.

Además hay **una sola puerta** (`_resolver`) por la que resuelven los seis endpoints de `/api/fs/*`, para que no pueda quedar un endpoint nuevo sin la comprobación.

### 3.3 Origen, token y auditoría por acción
- **Sin `Origin` ya no se salta el filtro**: se exige además **loopback**. (El cliente Node no manda `Origin` — ese era exactamente el caso que dejaba pasar a cualquier cliente que no fuese un navegador.)
- **Guard del servidor fail-closed** (`server.ts`): antes `if (!token) return true;` — **sin `ACCESS_TOKEN` la puerta no existía**, y el mismo guard protege rutas alcanzables en red local. Ahora: token correcto → pasa; si no, solo loopback. La ausencia de configuración **no** es un permiso.
- **11 endpoints mutantes** que antes entraban sin puerta, ahora con guard (bóveda, espejos, export Android, sync de la KB, flatten-root, forjar extensión, fondo POST/DELETE, medir puente, inspeccionar contenedor, extensiones enable/disable/delete).
- **Auditoría en JSON Lines** (`auditoria.jsonl`): hora, acción, detalle, resultado y motivo, de cada ejecución **y de cada rechazo** (token, origen, ruta, comando).
- **`GET /api/seguridad/estado`** (nuevo): el puente publica su propia postura —shell, lista blanca, raíces, ruta de auditoría y últimas entradas—. La seguridad se puede **consultar**, no solo creer.

### 3.4 La suite que lo protege: `tests/seguridadPuente.test.ts` (68 comprobaciones)
No comprueba que exista un comentario que diga «hay lista blanca»: **importa el puente y le pregunta**, y conserva comprobaciones estáticas para que **vuelvan a fallar solas** si alguien reintroduce lo que se quitó (que es como vuelven estas cosas: de buena fe, en una sesión futura, porque `dir` «no funcionaba»).
Ejemplos de lo que exige: rechaza `rm -rf /`, `curl … | sh`, `node -v & rm -rf /`, `npm run build > log.txt`, `echo hola; rm x`; acepta `node --version` y `npm run build | tail -5` (partido en 2 tramos); rechaza `~/.ssh/id_rsa` y acepta `~/Cerebronico/a.txt`; sin `Origin` solo pasa loopback.

------------------------------------------------------------------------

## 4. El `.bat` automatizado (lo que pediste en marcha)

`ide/backend/iniciar_todo_windows.bat` **imprimía** «Abre tu navegador en: http://127.0.0.1:3000» y el usuario copiaba la dirección a mano. Peor: `npm run dev` corría **en esa misma ventana**, así que la única forma de abrir el navegador era **antes** de que el servidor existiera — con la página de error delante.

**Ahora:**
1. El servidor arranca **en su propia ventana**: cerrar la consola del `.bat` **no apaga la IDE**, y la consola sigue viva para informar.
2. Se espera a que `:3000` **responda de verdad** (PowerShell `Invoke-WebRequest`, con `netstat` como plan B si PowerShell está bloqueado) — no solo a que el puerto esté escuchando.
3. **Abre el navegador solo**, una vez, en el momento correcto.
4. Si **ya había** una IDE en `:3000`, **no** lanza una segunda (antes: `EADDRINUSE` y una ventana de errores rojos que parecía «se rompió»).
5. Mini consola: **[B]** reabrir navegador · **[E]** estado de los cuatro puertos · **[Q]** salir sin apagar nada.
6. Detalles de `.bat` que se corrigieron a propósito: **sin comillas anidadas** en `start`, **sin bloques `( … )`** alrededor de `%errorlevel%` (dentro de un bloque se expande al leerlo, no al ejecutarlo: habría abierto el navegador antes de tiempo), etiquetas verificadas una a una, `echo` sin caracteres no-ASCII y fin de línea **CRLF**.

**Nota honesta:** el `.bat` es de Windows y **no se ha podido ejecutar aquí** (este entorno es Linux). Se ha validado de forma estática: etiquetas ↔ `goto` sin huérfanos, bloques equilibrados, sin trampas de expansión diferida y sintaxis revisada línea a línea. La prueba real es tu doble clic.
Existe además `ide/arrancar_cerebronico.bat`, que ya abría el navegador con una espera más débil (`netstat`): **no lo he tocado** para no cambiar lo que no me pediste, pero conviene alinearlo. Dime y lo hago.

------------------------------------------------------------------------

## 5. Qué NO está hecho (dicho, no disfrazado)

| Fase | Estado | Por qué |
|---|---|---|
| **F2 · Partir el monolito** (`server.ts`, 11.461 líneas) | **Pendiente** | Es la fase grande: 14 dominios a routers, con el contrato de las 126 rutas congelado antes de mover nada. Estimación: 2–3 semanas. **No se empieza a medias**: dejar el árbol con medio servidor migrado es peor que no empezar. El plan está listo para ejecutarla ([Anexo C](PLAN_MAESTRO_V2/ANEXO_C_MAPA_OBJETIVO_Y_CONTRATOS.md)) |
| F3 · Motor del chat (pipeline) | Pendiente | Depende de F2 |
| F4 · Cerebro ejecutor (23 acciones) | Pendiente | Independiente de F2 |
| F5 · Producto y datos (App.tsx, IndexedDB) | Pendiente | Depende de F2 |
| F6 · Git nativo | Pendiente | Da igual el orden, alta prioridad |
| F7 · Visión y mapa aspiracional | Pendiente | Decisión tuya |

**Tampoco hecho:** el e2e con Python (`npm run test:e2e` pide Python y Ollama), la prueba del EXE/NSIS, y **ningún pentest contra el puente en marcha**: lo de §3 es lectura de código **más** las 68 comprobaciones que ejecutan el puente de verdad, no un ataque simulado.

**Y una cosa que no puedo prometer:** no he ejecutado la aplicación **en Windows**. Todo lo del `.bat` es validación estática; el puente endurecido sí se ejecutó (su suite y su endpoint en vivo), pero sobre Linux.

------------------------------------------------------------------------

## 6. Ficheros tocados

**Nuevos (4):**
- `ide/backend/puente-permitidos.json` — la lista blanca, versionada y comentada
- `ide/backend/tests/seguridadPuente.test.ts` — 68 comprobaciones (registrada en la puerta)
- `ide/backend/scripts/manifiesto.mjs` — el manifiesto generado y verificado
- `PLAN_MAESTRO_V2/` — el plan y sus tres anexos (viajan con el paquete)

**Modificados (7):**
- `ide/backend/agent_bridge_5000.py` — sin shell, lista blanca, contención, origen, auditoría, `/api/seguridad/estado`
- `ide/backend/server.ts` — guard fail-closed + 11 endpoints con puerta
- `ide/backend/scripts/validar.mjs` — descubrimiento dinámico, parser honesto, aviso de marcas
- `ide/backend/iniciar_todo_windows.bat` — arranque con navegador automático
- `ide/backend/src/constants.ts`, `package.json`, `index.html` — versión única 1.7.0
- `ROADMAP.md` — regenerado contra el código
- `MANIFIESTO_SHA256_v1.7.0.txt` — 457 ficheros

**No tocado a propósito:** los 10 espejos, el planificador, el Quirófano, `brain`/`memoria.md`, la política del guardián de sintaxis y los puertos 3000/3500/5000/11434.

------------------------------------------------------------------------

## 7. Cómo verificar todo esto en 6 comandos

```bash
cd ide/backend
npm ci
npx tsc --noEmit                 # 0 errores
npm run validar                  # 3442 · 0 fallos · 64 suites · 0 sin correr
npm run build                    # bundle al día (con 1.7.0 dentro)
npm start                        # y abre http://127.0.0.1:3000
npm run manifiesto:verificar     # 457/457 · TODO COINCIDE
```

Y para comprobar por tu cuenta las dos que más importan:

```bash
grep -n "shell=True" agent_bridge_5000.py            # solo comentarios, cero en código
curl -s http://127.0.0.1:5000/api/seguridad/estado   # {"shell": false, ...}
```

------------------------------------------------------------------------

## 8. Siguiente paso

**F2, y solo F2.** El orden del plan no es negociable: sin monolito partido, F3 y F5 son trabajo sobre terreno movedizo. El primer entregable de F2 **no** es código: es el **contrato de las 126 rutas congelado** (`tests/superficieRutas.test.ts`), que es lo que permite mover 11.461 líneas sin romper nada.

Si prefieres algo con resultado visible antes, el plan tiene dos fases independientes de F2 con impacto directo en tu día a día: **F6 (git nativo** — el hueco que el propio ROADMAP llamaba «el más grande») y **F4 (que el consejo ejecute, no solo vote)**.

------------------------------------------------------------------------

## 9. v1.7.1 — FONDO A 100 MB Y EL CONSEJO, MEDIDO

Segunda vuelta sobre la misma entrega. La puerta, ejecutada de nuevo y sobre este
estado exacto: **3473 comprobaciones · 0 fallos · 64 suites · 0 sin correr**
(antes 3442: +31, y 0 regresiones). Versión única 1.7.1 en `constants.ts`,
`package.json`, `index.html` y dentro del bundle.

### 9.1 Fondo de pantalla: 100 MB, y el número es real

**Lo que se pidió:** subir el tamaño soportado a 100 MB.

**Lo que había:** gif 48 MB · foto 32 MB de techo (el vídeo ya estaba en 128).
Y un techo que, además, **no lo ponía el disco**: lo ponía el transporte. El fondo
se leía con `FileReader`, se convertía a base64 (+33 %) y se guardaba como una
cadena de texto en IndexedDB. Un fondo de 100 MB son ~133 millones de caracteres,
que en memoria son ~266 MB en UTF-16: el navegador se queda sin aire **antes** de
escribir. Subir el número sin cambiar esto habría sido prometer 100 MB y fallar a
los 40 — el peor tipo de límite, el que miente.

**Lo que se hizo:**

| Pieza | Antes | Ahora |
|---|---|---|
| Transporte | data URL (base64, +33 %) | **Blob directo** — sin conversión ni cadena gigante |
| Techo gif | 48 MB | **100 MB** |
| Techo foto fija | 32 MB | **100 MB** |
| Techo vídeo | 128 MB | **128 MB** (no se toca: «aumentar» no puede significar bajar) |
| Imagen propia del panel | data URL → preferencias (localStorage, ~5 MB, pérdida silenciosa) | **Blob → IndexedDB** + marca corta en preferencias |
| Al cambiar de fondo | la URL anterior quedaba viva | **se libera** (`revocarFondo`) |
| Avisos 4 MB / 8 MB | consejo | **consejo** (no se movieron: no son aduana) |

**Un fallo que apareció de camino, y que llevaba ahí desde antes:** el selector de
«imagen propia» de la configuración **nunca pintaba nada**. Guardaba el data URL
en las preferencias, y `AppBackground` da **prioridad** a `customImageUrl` — que
App tiene siempre puesto con el fondo por defecto. Es decir: la imagen se guardaba
y no se veía, sin error. Ahora la imagen va a IndexedDB y el panel avisa a App
para aplicarla **al instante**.

**Cómo se comprueba:** la suite `fondoPeso` pasa de 55 a **64 comprobaciones** y
estrena una sección que no se conforma con el número: exige que el
almacenamiento haya cambiado de verdad (acepta `Blob`, existe `urlDeFondo`, el GIF
ya no pasa por `readAsDataURL`, la foto usa `canvas.toBlob`, la marca no llega al
CSS). Esas comprobaciones son estáticas y **se dice por qué**: IndexedDB no existe
en Node, así que probarlas de verdad exige un navegador — fingir lo contrario
sería peor que declarar el límite.

### 9.2 El Consejo: de votar a ejecutar (Fase 4, primer paso)

**El problema, medido:** el Consejo atribuye el voto (v1.6.33), pero votar no es
hacer. Cuántas de las 23 acciones acaban en trabajo real había que deducirlo
cruzando dos ficheros a mano — y el resultado no era el que la documentación
sugería.

**El entregable:** `src/engine/ejecutoresConsejo.ts` — el registro acción →
ejecutor, con dos estados y ninguno más: **`real`** (hay función, con fichero y
llamada) o **`declarada`** (no hay, y dice POR QUÉ y cuál sería el natural).

**El número, sin adornos: 2 acciones con ejecutor real · 21 declaradas.**

- Reales: `calculo` → `cerebroReflejo.calcular()` · `convertir` → `formatConverter.convertir()`.
- Declaradas: las 21 restantes, cada una con su motivo. Por ejemplo `testear` no
  se declara «pendiente» a secas: dice que el Validador existe como especialista,
  que `syntaxGuard` valida sintaxis y que **ejecutar pruebas lo hace la puerta**
  (`npm run validar`) — o sea, el ejecutor natural es invocar la puerta desde el plan.

**Dos garantías que no son promesas:**
1. El registro es `Record<AccionConsejo, …>`: si mañana se añade una acción al
   clasificador y no se le pone ficha, **el proyecto no compila**.
2. La suite comprueba que cada ejecutor «real» apunta a una función que **existe
   en el fichero que dice** (no basta con escribir un nombre bonito).

**Qué NO es esto:** no he implementado los 21 ejecutores. Este paso hace el hueco
**medible y planificable**; el trabajo de llenarlo es la Fase 4 completa. Un hueco
declarado se planifica; un hueco que nadie escribió se confunde con una capacidad
que existe — y eso es exactamente cómo un «consejo de 12 especialistas» acaba sin
hacer nada.

### 9.3 Estado del plan tras esta vuelta

| Fase | Estado |
|---|---|
| F0 · Verdad congelada | **completa** |
| F1 · Seguridad cerrada | **completa** |
| F4 · Cerebro ejecutor | **en curso** — registro hecho (2/23); falta enchufar ejecutores |
| F2 · Partir el monolito | pendiente (2–3 semanas; empieza por el contrato de las 126 rutas) |
| F3 · Motor del chat · F5 · Producto y datos · F6 · Git nativo · F7 · Visión | pendientes |

Ficheros nuevos de esta vuelta: `src/engine/ejecutoresConsejo.ts`. Modificados:
`src/engine/fondo.ts`, `src/utils/indexedDBStorage.ts`, `src/App.tsx`,
`src/components/ProConfigPanel.tsx`, `src/components/AppBackground.tsx`,
`tests/fondoPeso.test.ts`, `tests/consejoVotacion.test.ts`, y los tres de la versión.

### 9.4 Lo que sigue sin poder prometer

- **No he probado el navegador.** El fondo de 100 MB está implementado y sus
  piezas verificadas por código y por suite; la prueba de verdad es que subas un
  archivo de ese tamaño. Si algo falla ahí, el sitio donde mirar es la consola del
  navegador: el guardado avisa por `alert` en vez de callarse.
- **No he ejecutado Windows** (ni el `.bat` ni la app). Es entorno Linux.

------------------------------------------------------------------------

## 10. v1.8.0 — «VOZ»: CERTEZA, UNA FRASE POR ARTEFACTO Y HABLAR SIN QUE PREGUNTEN

Tercera vuelta sobre la misma entrega, con tres encargos: vocabulario, explicar
siempre en una frase qué es y para qué sirve el código (y si está ejecutado), y
una facultad autónoma de decir lo que ya se sabe sin esperar a que pregunten.

Puerta ejecutada sobre este estado exacto: **3548 comprobaciones · 0 fallos ·
65 suites · 0 sin correr** (antes 3473/64: **+75**, todas de la suite nueva
`tests/voz.test.ts`, y 0 regresiones). Versión única **1.8.0** en `constants.ts`,
`package.json`, `index.html` y dentro del bundle.

### 10.1 La certeza, metida en el idioma

**El problema:** la regla de la casa ya era «creer solo lo verificado contra
código». Pero una regla no impide escribir «verificado» en un informe que nadie
ejecutó — eso lo impide el idioma. Y un texto sin ejecución detrás suena igual
que uno con ella, que es lo que hace que la gente deje de distinguirlos.

**Lo que hay ahora** (`src/engine/certeza.ts` + `src/engine/vocabulario.ts`):
tres niveles y ninguno más — **ejecutado · leído · sin verificar** — y un
catálogo de 14 palabras que **afirman** un resultado (`funciona`, `verificado`,
`comprobado`, `listo`, `terminado`, `soportado`, `garantizado`, `sin errores`,
`0 fallos`…). Cada una declara qué certeza exige. `revisarVocabulario(texto,
certeza)` devuelve los avisos con su motivo y **con la forma de decirlo sin
mentir**.

Dos propiedades que la suite vigila porque son donde esto se rompe:
- **Leer NO asciende a ejecutado.** `certezaDe({leido:true, ejecutado:false})` es
  «leído», no «ejecutado». Es la trampa más común: como he leído el código, digo
  que va.
- **Con ejecución real no hay avisos.** El filtro no es un detector de pesimismo:
  cuando hay salida real, deja escribir «funciona» sin molestar.

### 10.2 Una frase por artefacto, y no la redacta un modelo

`src/engine/explicacionArtefacto.ts` produce:

```
src/engine/fondo.ts — módulo de motor (lógica determinista) · FONDO v1: fondo
animado (GIF / MP4 / WebM de 4-8 s) para la IDE. Estado: solo leído: NO ejecutado.
```

**Por qué es determinista y no lo redacta el modelo:** si la frase la escribe
quien quiere que suene bien, la frase acaba sonando bien aunque el trabajo esté a
medias. El «qué» y el «para qué» se **extraen de la cabecera del propio fichero**
(convención de la casa `nombre.ext — PROPÓSITO`, o `QUÉ ES:` / `PARA QUÉ SIRVE:`),
y el «ejecutado» **solo** se concede cuando quien llama afirma haber visto la
salida de una ejecución. Si la cabecera no declara propósito, se dice que no lo
declara — con la misma naturalidad que se dice un dato bueno.

Tiene un detalle del que no estoy poco satisfecho: **el módulo se audita a sí
mismo**. Si la cabecera de un fichero dice «VERIFICADA Y FUNCIONANDO» y no hay
ejecución detrás, la explicación devuelve el aviso de vocabulario correspondiente.
Un fichero de prueba con esa cabecera es una de las 75 comprobaciones.

### 10.3 La facultad de hablar sin que pregunten

`src/engine/autoRespuesta.ts`. «Que hable sin que le pregunten» es fácil de
escribir mal: basta con que suelte todo cada vez. Eso no es autonomía, es ruido, y
termina con el panel cerrado. Por eso la facultad tiene **cuatro reglas
declaradas** en `REGLAS_VOZ` y **vigiladas por la suite**:

| | Regla | Por qué |
|---|---|---|
| **R1** | No se inventa nada: sin hechos, avisos ni sugerencias, no hay mensaje | El silencio es una respuesta, y es la más frecuente |
| **R2** | Una `clave` se dice UNA vez (`yaDichos`) | Sin esto, «proactivo» significa «pesado» |
| **R3** | La certeza viaja **en el texto**, no al pie | Un mensaje espontáneo que suena seguro sin serlo miente en la primera línea, y nadie lee la segunda |
| **R4** | Presupuesto de atención (3) y, con una operación en curso, **solo avisos** | Una sugerencia buena en medio de una escritura es una interrupción |

Es determinista (la suite comprueba que el módulo no usa reloj ni azar: mismas
entradas, mismos mensajes, mismo orden), traza de dónde salió cada mensaje
(`trazarMensajes`), y **llega a la pantalla**: el panel del Quirófano muestra
`voz` y `explicaciones` en `/api/quirofano/estado`.

**De dónde saca lo que dice (y esto es lo que lo hace útil en vez de decorativo):**
de lo que el Quirófano **ya sabe** — avisos anotados al cerrar una tanda, resultado
de la última tanda (con su revertido o su verde), y si hay una tanda abierta sin
cerrar. Y el «ejecutado» lo concede **solo** cuando las puertas cerraron en verde
(`cerroEnVerde`): si una tanda se revirtió, el hecho se cuenta como
«sin verificar», no como éxito.

### 10.4 La frase, aplicada a lo que se ha escrito hoy

Cumpliendo el propio encargo, cada artefacto nuevo de esta vuelta con su frase,
qué es, para qué sirve y su estado real:

- `src/engine/certeza.ts` — los tres niveles de certeza y las dos operaciones que
  se hacen con ellos: **qué es** un tipo con dos funciones, **para qué sirve**
  para que la honestidad no dependa de la memoria de quien escribe. **Estado:
  ejecutado** (sus aserciones corren dentro de `tests/voz.test.ts`).
- `src/engine/vocabulario.ts` — el catálogo de palabras que afirman y el revisor
  que las caza: **qué es** un léxico ejecutable, **para qué sirve** para que
  «funciona» no se escriba sin haberlo ejecutado. **Estado: ejecutado.**
- `src/engine/explicacionArtefacto.ts` — la frase única por artefacto: **qué es**
  un extractor determinista de propósito y certeza, **para qué sirve** para no
  tener que preguntar qué es cada cosa. **Estado: ejecutado.**
- `src/engine/autoRespuesta.ts` — la facultad de hablar sin que pregunten: **qué
  es** un motor determinista de mensajes con cuatro reglas, **para qué sirve**
  para que lo que el motor ya sabe no se quede esperando la pregunta adecuada.
  **Estado: ejecutado** (75 comprobaciones, incluidas la de que no se repite y la
  de que no se inventa).
- `tests/voz.test.ts` — la suite que los vigila: **qué es** la prueba de los
  cuatro módulos, **para qué sirve** para que esto no se degrade a promesa.
  **Estado: ejecutado** (75 correctas · 0 fallidas, dentro de la puerta).
- `server.ts` (enganche) — **qué es** dos superficies nuevas (`/api/quirofano/estado`
  ampliado y `POST /api/artefacto/explicar`), **para qué sirve** para que la
  facultad y las explicaciones lleguen a la pantalla, **estado: ejecutado**
  (arranca y sirve `V1.8.0`; las dos superficies las verifica la suite sobre el
  código, no por petición HTTP real).

### 10.5 Lo que NO está hecho de esto (dicho, no disfrazado)

- **La certeza no cubre todavía el texto del modelo.** Está aplicada a lo que el
  MOTOR dice de sí mismo (explicaciones, voz, informes). Que un modelo no pueda
  afirmar sin evidencia exige pasar su salida por el revisor, y ese es el sitio
  natural de la **Fase 3** (pipeline del chat), no de esta vuelta.
- **No he probado el panel en el navegador.** La suite verifica que el panel
  recibe y pinta `voz` y `explicaciones`; que se vea bien es tu ojo.
- **Las 21 acciones del Consejo siguen sin ejecutor** (Fase 4, en curso).
- Sigue pendiente **F2** (partir `server.ts`): esta vuelta le ha **añadido** un
  endpoint más, lo cual engorda el monolito. Se dice porque es verdad y porque es
  el argumento que hace urgente F2.

### 10.6 Cómo comprobarlo tú mismo en dos comandos

```bash
cd ide/backend
npx tsx tests/voz.test.ts     # 75 correctas · 0 fallidas
npm run validar               # 3548 · 0 fallos · 65 suites
```

------------------------------------------------------------------------

## 11. v1.9.0 — «ESTABILIDAD»: NADA SE PIERDE EN SILENCIO

Encargo: continuar con lo que no estaba hecho, y el siguiente paso con **más
estabilidad**. Se atacaron las dos deudas que el plan marcaba como ALTA y MEDIA, y
no por ser fáciles sino porque son las dos que hacían perder trabajo o memoria de
forma invisible.

Puerta sobre este estado: **3590 comprobaciones · 0 fallos · 66 suites · 0 sin
correr** (antes 3548/65: **+42**, todas de la suite nueva de persistencia, y 0
regresiones). Manifiesto **482/482**. Humo real: `:3000` sirve `CerebróNico
V1.9.0` y el puente responde `shell: false`. Versión única **1.9.0**.

### 11.1 La pérdida silenciosa del workspace (deuda ALTA) — CERRADA

**La causa raíz, exacta:** `saveJSON` y `saveString` devolvían `void`. Cuando el
valor pasaba de 5 MB —o la cuota estaba llena— escribían un `console.warn` y
**devolvían nada**. Quien llamaba no podía saber que el trabajo del usuario
acababa de perderse, así que el IDE seguía como si hubiera guardado: el usuario
cerraba, volvía y el workspace estaba en su versión anterior. El peor tipo de
fallo, porque no se nota en el momento.

**Lo que cambió (`src/utils/storage.ts`):**

1. **Devuelve el resultado.** `saveJSON`/`saveString` devuelven
   `ResultadoGuardado` con `ok`, `motivo`, `bytes` y `limite`. Quien lo ignoraba
   sigue compilando; quien quiera mirarlo, ahora puede.
2. **Rescata antes de rendirse.** Si no cabe en localStorage, el valor se guarda
   en el **almacén grande** (IndexedDB, almacén nuevo `grandes`) y en localStorage
   queda un puntero mínimo. El dato no se pierde: **cambia de sitio**.
3. **Avisa.** `alFallarGuardado(fn)` es el canal que antes no existía: la interfaz
   se entera, y App lo escribe en el registro visible con clave, tamaño y motivo.
4. **Recupera.** `restaurarDeAlmacenGrande([...])` devuelve al arranque lo que se
   fue al almacén grande. Sin este paso, el rescate sería *otro sitio donde
   perderse*: por eso el efecto de arranque de App es parte del arreglo, no un
   adorno.

Una decisión de honestidad que conviene señalar: el retorno **no dice** que el
rescate haya ocurrido —eso todavía no se sabe—, dice que el valor se ha *enviado*,
y el desenlace real lo lleva el aviso. Es la misma disciplina de certeza de la
v1.8.0 aplicada a este módulo: no se afirma un resultado antes de tenerlo.

### 11.2 La prueba no lee el código: lo ejecuta

`tests/persistencia.test.ts` (42 comprobaciones) monta un **localStorage falso** y
un **IndexedDB falso mínimo** y llama a las funciones reales:

| Escenario | Qué se exige |
|---|---|
| Guardado normal | `ok:true`, con bytes, y se puede leer |
| JSON corrupto | se purga y devuelve el fallback (no congela el render) |
| **5 MB + 1 KB** | no se declara guardado aquí; **se avisa**; hay puntero; **el dato ESTÁ en el almacén grande**; y **se recupera al arrancar** |
| Vuelve a caber | el puntero se retira, sin dejar rastros |
| Cuota llena | el motivo es «cuota», y el aviso dice el desenlace real |
| Sin almacén grande | **el fallo se cuenta** (antes: `console.warn` y a seguir) |

**Límite declarado:** esos dobles **no son un navegador**. El IndexedDB falso no
valida versiones ni cuotas reales. Está escrito en la cabecera de la suite para que
nadie confunda «pasa la suite» con «probado en Chrome».

### 11.3 La deuda D9 (endpoint huérfano) — CERRADA

`/api/brain/lesson` existía desde hacía versiones y **no lo llamaba nadie**. La
promesa de D9 («las lecciones que se escriben») estaba escrita y el endpoint hecho,
pero las lecciones vivían **solo en `localStorage`**: al limpiar los datos del
navegador, el motor olvidaba todo lo aprendido y volvía a tropezar con lo mismo.

Ahora `learnLesson` manda la lección al cerebro —con su tipo, para no perder el
contexto— y el endpoint lleva **guard**, porque escribe en la memoria. Sin `await`:
aprender una lección no puede bloquear ni fallar el turno del usuario, y si el
cerebro no está, la copia local sigue siendo la fuente de trabajo.

### 11.4 Los ficheros de esta vuelta, con su frase

- `src/utils/storage.ts` — qué es: la capa de guardado local con resultado, rescate
  y aviso. Para qué sirve: para que «no se guardó» deje de ser un secreto de la
  consola. **Estado: ejecutado** (42 comprobaciones contra la capa real).
- `src/utils/indexedDBStorage.ts` (ampliado) — qué es: el almacén grande (IndexedDB,
  versión 2). Para qué sirve: para que lo que no cabe arriba no se pierda. **Estado:
  ejecutado** (guardar, leer, borrar y listar, contra el doble de IndexedDB).
- `tests/persistencia.test.ts` — qué es: la prueba de los dos anteriores. Para qué
  sirve: para que este arreglo no se deshaga solo. **Estado: ejecutado** (42/42).
- `src/App.tsx` (enganche) — qué es: el efecto de recuperación al arrancar y la
  suscripción a los fallos. Para qué sirve: para que el rescate llegue a la pantalla
  y el fallo se vea. **Estado: ejecutado** en la parte de datos (la suite comprueba
  que recupera y que avisa); **solo leído** en la parte visual (no he abierto un
  navegador).
- `src/utils/selfImprovement.ts` + `server.ts` (lecciones) — qué es: el envío de la
  lección al cerebro y su guard. Para qué sirve: para que el aprendizaje sobreviva.
  **Estado: ejecutado** en cuanto a lo comprobable (el código y el guard); **no
  ejecutado** end-to-end (requiere el servidor en marcha y aprender una lección).

### 11.5 Lo que sigue sin estar hecho

| Fase | Estado | Nota |
|---|---|---|
| **F4** · Cerebro ejecutor | en curso | 2/23 con ejecutor real; 21 declaradas con motivo |
| **F2** · Partir `server.ts` | pendiente | **No crece más en esta vuelta** (se añadió guard, no ruta). Sigue siendo la deuda ALTA |
| **F3** · Motor del chat | pendiente | Ahí va la certeza sobre el texto del modelo |
| **F5**, **F6**, **F7** | pendientes | Interfaz/datos, git nativo, visión |

Y los límites de siempre, que no cambian: **no he probado el navegador** ni
**Windows** (este entorno es Linux), y **no hice pentest** contra el puente.

------------------------------------------------------------------------

## 12. v1.10.0 — FASE 2, PRIMER PASO: EL CONTRATO DE LAS 127 RUTAS

Encargo: continuar por el contrato de las 126 rutas «y más». Las rutas reales
resultaron ser **127** (la 127ª la añadió la v1.8.0 con `/api/artefacto/explicar`);
el número del plan era correcto cuando se escribió.

Puerta sobre este estado: **3627 comprobaciones · 0 fallos · 67 suites · 0 sin
correr** (antes 3590/66: **+37**, todas del contrato, y 0 regresiones). Manifiesto
**487/487**. Humo real: `:3000` sirve `CerebróNico V1.10.0` y el puente responde
`shell: false`. Versión única **1.10.0**.

### 12.1 Qué se ha hecho y por qué era el paso correcto

El plan dice que el primer entregable de la Fase 2 **no es código**: es el contrato.
Partir 11.661 líneas moviendo bloques de cientos sin una referencia es un acto de
fe — y la fe es lo contrario de lo que hace este proyecto. Ahora hay tres piezas:

- **`contrato-rutas.json`** — las 127 rutas congeladas, **generadas desde el
  código**: método, ruta, línea, dominio y si tienen guard. Un contrato escrito a
  mano se puede editar para tapar la pérdida que debería detectar; generado, la
  única forma de cambiarlo es cambiar el código.
- **`SUPERFICIE_RUTAS.md`** — el **orden de trabajo**: 39 dominios con rutas,
  métodos y líneas. Empieza por los de lectura (riesgo bajo) y deja `ai` y
  `sandbox` para el final, que es donde el monolito está más enredado.
- **`tests/superficieRutas.test.ts`** (37 comprobaciones) — los tres candados, más
  dos lectores independientes que tienen que coincidir.

### 12.2 Los tres candados

| Candado | Qué vigila | Por qué |
|---|---|---|
| **Ruta perdida** | en el contrato y ya no en el código → ROJO | Es el fallo que esta pieza existe para cazar |
| **Guard perdido** | una ruta con puerta que ya no la tiene → ROJO | Sería aflojar la seguridad (Fase 1) sin decirlo |
| **Presupuesto de líneas** | `server.ts` > 11.661 líneas → ROJO | Trinquete: la Fase 2 es **partir**, no añadir |

El trinquete merece una frase: si algún día hay que añadir una ruta, habrá que
**subir el presupuesto a propósito** — y eso se ve en el diff. La decisión queda
escrita en vez de colarse. Y las rutas **nuevas** no son rojo (añadir es legítimo),
pero se **avisan**: lo que no se permite es añadir y no enterarse.

### 12.3 Dos fallos de mi propio medidor, y el tercero que evité antes de tenerlo

Lo cuento porque es lo que hace fiable el número:

1. **El contrato decía 29 rutas con guard cuando hay 27.** El cuerpo del manejador
   se delimitaba con una ventana de 700 caracteres, así que una ruta corta **sin**
   guard heredaba el guard de su vecina. Un medidor que se equivoca **al alza** es
   peor que no tenerlo: da tranquilidad sin motivo y, en este caso, habría tapado
   justo lo que hay que vigilar. Corregido: el cuerpo se acota con la **ruta
   siguiente**, y la suite exige que las dos cifras **cuadren** (contrato = código).
2. **`GET '*'` no empieza por «/».** Es la ruta comodín del SPA (sirve el
   `index.html` para cualquier dirección) y es legítima. La comprobación estaba
   mal, no el contrato: ahora acepta el comodín y lo identifica como tal.
3. **El fallo que evité antes de tenerlo:** mi primera versión de la suite
   comprobaba el generador **ejecutándolo**, y ejecutarlo **escribe** el contrato
   con un presupuesto de líneas recalculado. Es decir: la propia comprobación podía
   **tapar el trinquete** — bastaba con crecer y correr la suite una vez. Añadí el
   modo **`--seco`** (calcula y dice qué saldría, sin escribir) y la suite comprueba
   además que el fichero **no ha cambiado** tras pasar por ahí.

### 12.4 Los ficheros de esta vuelta, con su frase

- `scripts/superficie.mjs` — qué es: el generador y verificador del contrato, con
  modo seco. Para qué sirve: para poder mover el monolito sin perder rutas.
  **Estado: ejecutado** (modo normal, modo seco y modo verificar, los tres por la suite).
- `contrato-rutas.json` — qué es: las 127 rutas congeladas, generadas. Para qué
  sirve: para que ninguna desaparezca sin que se note. **Estado: ejecutado**
  (verificado contra dos lectores independientes).
- `SUPERFICIE_RUTAS.md` — qué es: el orden de trabajo por dominios. Para qué sirve:
  para que la extracción de la Fase 2 se haga por partes y en orden de riesgo.
  **Estado: ejecutado** (la suite comprueba que lista los 39 dominios y que no se
  edita a mano).
- `tests/superficieRutas.test.ts` — qué es: la suite del contrato. Para qué sirve:
  para que esto no se degrade. **Estado: ejecutado** (37/37).

### 12.5 Lo que queda de la Fase 2 (y sigue siendo lo grande)

El contrato está hecho; **la extracción no se ha empezado**, y eso es deliberado:
partir el monolito son 2-3 semanas de mover 127 rutas a `server/routers/<dominio>.ts`
sin cambiar comportamiento, con la puerta abierta en cada paso. Empezarlo a medias
—medio servidor migrado— es peor que no empezarlo, y ya se dijo en el plan.

Lo que **sí** se puede afirmar ahora: cuando la extracción empiece, el que la haga
tendrá (a) la lista exacta de lo que hay que preservar, (b) el orden de trabajo por
riesgo y (c) un guardián que se pone rojo en cuanto una ruta o un guard se pierda.
Eso es exactamente lo que faltaba hace una hora.

Y lo demás sigue igual, sin adornos: **F3** (la certeza sobre el texto del modelo),
**F4** (21 de 23 acciones del Consejo sin ejecutor), **F5**, **F6** y **F7**
pendientes. Nada de eso se ha tocado en esta vuelta.

------------------------------------------------------------------------

## 13. v1.11.0 — FASE 2, SEGUNDO PASO: LA PRIMERA EXTRACCIÓN

El contrato ya estaba; ahora empieza el trabajo que el contrato existe para
proteger. **El monolito ha empezado a adelgazar.**

Puerta sobre este estado: **3639 comprobaciones · 0 fallos · 67 suites · 0 sin
correr** (antes 3627/67: **+12** en la suite del contrato, 0 regresiones).
Manifiesto **489/489**. Contrato: **127 rutas · 3 extraídas · 124 en el monolito ·
CONTRATO INTACTO**. Versión única **1.11.0**.

### 13.1 Qué se movió y por qué esas tres

A `server/routers/diagnostico.ts` (nuevo): `/api/health/deep`,
`/api/ollama/perf` y `/api/ollama/models`. **`server.ts`: 11.661 → 11.518 líneas
(−143).**

La elección fue por **riesgo**, no por tamaño:

| Criterio | Las tres elegidas | Las que se dejaron fuera |
|---|---|---|
| Método | GET (no escriben nada) | `/api/telemetry/refresh` (POST) |
| Estado mutable | ninguna lo toca | `/api/telemetry/ports` y `/api/system/stats` usan `telemetryCache`, `sandboxProc`, `lastCpuTime` |
| Dependencias | funciones puras y valores de arranque | estado compartido del servidor |

Las que dependen de estado **no se traen aquí a propósito**: su sitio es la
extracción del estado (`server/estado/`). Meterlas ahora sería mover el problema,
no el código.

### 13.2 Los cuerpos se movieron tal cual, y una sola fuente de verdad

Los tres manejadores están copiados **verbatim**: ni una línea de lógica
reescrita (el síntoma de que se ha movido algo con la excusa de moverlo es que
«de paso» cambia el comportamiento). Lo único que cambia es **de dónde salen tres
valores** —la URL de Ollama, la RAM y los núcleos—, que ahora se pasan como
dependencias: si se recalcularan dentro del módulo habría **dos fuentes de verdad**
sobre la misma máquina, y el primer día que una cambiara tendríamos un diagnóstico
que miente sobre el servidor al que diagnostica.

### 13.3 El contrato falló al primer movimiento, y tenía que fallar

Al mover las rutas, `superficie:verificar` dio las tres por **PERDIDAS**. Tenía
razón desde su punto de vista y estaba equivocado desde el del proyecto: una ruta
extraída **no se ha perdido, se ha mudado**. Un contrato que solo mira el monolito
convierte cada paso de la Fase 2 en un falso rojo — y un guardián que grita en
falso se acaba ignorando, que es como se pierde la costumbre de mirarlo.

Corregido: el extractor mira ahora **el monolito y los módulos**, informa las
**MOVIDAS** (con origen y destino) y publica el **progreso** de la fase. De paso
el contrato ha dejado de ser solo un candado y es también el **marcador de
progreso**: `3 extraídas · 124 aún en el monolito`.

### 13.4 Comprobado contra el servidor en marcha

Que compile no es que funcione. Con el servidor levantado:

| Petición real | Respuesta |
|---|---|
| `GET /` | `200` · `<title>CerebróNico V1.11.0</title>` |
| `GET /api/ollama/perf?model=llama3.2:3b` | perfil completo (`tier tiny`, `paramsB 3`, `num_ctx 4096`…) — **desde el módulo nuevo** |
| `GET /api/health/deep` | sus 5 comprobaciones con sus remedios (`Ollama :11434`, `Sandbox :3500`…) |
| `GET /api/ollama/models` | `{"models":[],"error":"fetch failed"}` (no hay Ollama aquí: comportamiento correcto, no un fallo del traslado) |

### 13.5 Los ficheros de esta vuelta, con su frase

- `server/routers/diagnostico.ts` — qué es: el primer módulo de rutas extraído del
  monolito, con las 3 rutas de diagnóstico. Para qué sirve: para empezar a partir
  `server.ts` sin cambiar comportamiento. **Estado: ejecutado** (responde en
  marcha y la suite lo vigila: 49 comprobaciones).
- `scripts/superficie.mjs` (corregido) — qué es: el generador/verificador del
  contrato, ahora con visión sobre todo `server/`. Para qué sirve: para que una
  mudanza no parezca una pérdida y el progreso esté a la vista. **Estado: ejecutado.**
- `contrato-rutas.json` (regenerado) — qué es: las 127 rutas con su fichero, más
  el progreso de la fase. **Estado: ejecutado** (presupuesto del trinquete
  ajustado a 11.518: el listón ha bajado con el trabajo).
- `tests/superficieRutas.test.ts` (ampliada) — qué es: el contrato y la primera
  extracción vigilados. **Estado: ejecutado** (49/49).

### 13.6 Lo que queda, sin adornos

**124 rutas** siguen en el monolito. El siguiente movimiento natural son los
dominios pequeños de lectura (`system`, `verifier`, `zai`), y después la
extracción del **estado** (`server/estado/`), que es la puerta para poder mover
`telemetry`, `sandbox` y todo lo que hoy comparte variables globales. Ese paso —el
estado— es el que de verdad decide si la Fase 2 sale bien; las rutas de lectura son
el calentamiento.

Y lo demás sigue igual: **F3** (la certeza sobre el texto del modelo), **F4** (21
de 23 acciones del Consejo sin ejecutor), **F5**, **F6** y **F7** pendientes.

------------------------------------------------------------------------

## 14. v1.12.0 — FASE 2, EL PASO QUE DECIDE: EL ESTADO SALE DEL MONOLITO

En la vuelta anterior dije cuál era el paso que de verdad decide la Fase 2: «el
riesgo real no es mover 124 rutas, es el **estado compartido**». Esto es eso.

Puerta sobre este estado: **3670 comprobaciones · 0 fallos · 68 suites · 0 sin
correr** (antes 3639/67: **+31** de la suite de estado y +12 de la del contrato, 0
regresiones). Manifiesto **494/494**. Contrato: **127 rutas · 6 extraídas · 121 en
el monolito · CONTRATO INTACTO**. Versión única **1.12.0**.

### 14.1 Mover código no es mover estado

Mover una ruta es mover texto. Mover estado es cambiar **quién manda** sobre él. Una
variable global suelta no dice nada: no se sabe quién la escribe, ni cuándo, ni qué
contratos hay detrás. Se han extraído las dos primeras, con API de tres funciones:

| Módulo | Qué guarda | API |
|---|---|---|
| `server/estado/telemetria.ts` | la caché de telemetría (última comprobación de puertos + modelos) | `muestraVigente` · `guardarMuestra` · `invalidarMuestra` |
| `server/estado/proceso.ts` | la última medición de CPU del proceso | `porcentajeCpu` · `reiniciarMuestraProceso` |

Y con ellas, **3 rutas más** fuera del monolito:
`server/routers/telemetria.ts` (`/api/telemetry/ports`, `/api/telemetry/refresh`,
`/api/system/stats`). **`server.ts`: 11.518 → 11.413 líneas.**

### 14.2 La decisión técnica que hace que esto valga la pena

**El tiempo entra por parámetro:** `muestraVigente(ahora)` en lugar de leer el reloj
por dentro. Suena a purismo y no lo es — es lo que convierte la caducidad de 10
segundos en algo **probable**: la suite fija el instante y comprueba que a los 9 s
sigue vigente y a los 10 s justos ha caducado, todo en milisegundos de ejecución.
Un módulo que lee el reloj por dentro solo se puede probar durmiendo, y las pruebas
que duermen son las primeras que se quitan cuando van lentas.

**Y el módulo pregunta, no coge:** al sandbox no se le alcanza `sandboxProc`. En
`DepsTelemetria` se declara exactamente qué necesita saber de él —«¿está vivo?»,
«¿cuál es su PID?»—. Eso convierte este fichero en la **especificación escrita de la
próxima extracción**: quien mueva el estado del sandbox ya sabe qué API tiene que
ofrecer. Un módulo que pregunta es mejor que uno que coge.

### 14.3 Tres cosas que el trabajo destapó (y por qué se cuentan)

1. **Un consumidor oculto:** `/api/bridge/restart` invalidaba la caché **escribiendo
   la variable** (`telemetryCache = null`). Ahora lo pide por la API del estado. Si
   no se hubiera buscado, la caché habría dejado de invalidarse en silencio al
   reiniciar el puente — y el síntoma habría sido «el indicador dice :5000 caído
   durante diez segundos después de reiniciarlo», que nadie habría relacionado con
   este cambio.
2. **El compilador tenía razón:** el registro del módulo se hacía antes de declarar
   `SANDBOX_PORT`, y eso es usar una `const` antes de declararla (TDZ). Se movió la
   llamada junto a las declaraciones del sandbox, con el porqué escrito al lado.
3. **Otra vez mis comprobaciones leían comentarios:** dos checks fallaron porque el
   módulo *explica en prosa* que no toca `sandboxProc` y *menciona* `Date.now()` al
   justificar que el tiempo se inyecta. Mismo patrón que ya me pasó con el puente y
   con el manifiesto: **las comprobaciones miran código, no comentarios** — en los
   dos sentidos (no valen los que explican, ni esconden los que comentan código malo).

### 14.4 Comprobado contra el servidor en marcha (la caché se comporta)

| Petición real | Resultado |
|---|---|
| `GET /` | `200` · `<title>CerebróNico V1.12.0</title>` |
| `GET /api/system/stats` | `ide.rssMb 176 · cpuPercent 0 (primera muestra, como está documentado) · sandbox {running:false, pid:null} · machine {cores:2, freeRamMb:2374}` — la ruta movida, con el sandbox **preguntado** |
| `GET /api/telemetry/ports` (1ª) | sondea · `lastChecked: 1790251017595` |
| `GET /api/telemetry/ports` (2ª, 1 s después) | **misma marca** → servida de la caché |
| `POST /api/telemetry/refresh` + 3ª consulta | **marca nueva** → la invalidación funciona |

Esa columna es la diferencia entre «el módulo compila» y «el estado se comporta».

### 14.5 Los ficheros de esta vuelta, con su frase

- `server/estado/telemetria.ts` — qué es: la primera pieza de estado extraída, con
  API de tres funciones. Para qué sirve: para que las rutas de estado no necesiten
  vivir en el monolito. **Estado: ejecutado** (caducidad probada con tiempo inyectado).
- `server/estado/proceso.ts` — qué es: la memoria de la última medición de CPU. Para
  qué sirve: para poder mover `/api/system/stats` sin llevarse una variable dentro.
  **Estado: ejecutado.**
- `server/routers/telemetria.ts` — qué es: las 3 rutas de telemetría y recursos. Para
  qué sirve: para sacarlas del monolito preguntando por el sandbox en vez de
  alcanzarlo. **Estado: ejecutado** (responde en marcha; la caché se comporta).
- `tests/estado.test.ts` — qué es: la suite del estado. Para qué sirve: para que la
  caducidad y el cálculo se prueben sin dormir. **Estado: ejecutado** (31/31).

### 14.6 Lo que queda

**121 rutas** siguen en el monolito (11.413 líneas). Las variables globales que
quedan —`sandboxProc`, los espejos, el conocimiento— ya tienen **receta probada**:
API de funciones, tiempo inyectado y dependencias declaradas en vez de alcanzadas.
El siguiente movimiento natural es el **estado del sandbox** (que ya está
especificado por lo que `telemetria.ts` le pide), y con él `sandbox`, `exec` y todo
lo que hoy comparte esa variable.

Y lo demás sigue igual: **F3** (la certeza sobre el texto del modelo), **F4** (21 de
23 acciones del Consejo sin ejecutor), **F5**, **F6** y **F7** pendientes.

------------------------------------------------------------------------

## 15. v1.13.0 — ESTADO DEL SANDBOX + LAS DOS VENTANAS QUE REPORTaste

Tres cosas en esta vuelta: la fase que tocaba (el estado del sandbox) y los dos
avisos que mandaste con captura (la ventana de la voz y el sandbox en rojo al
arrancar).

Puerta sobre este estado: **3724 comprobaciones · 0 fallos · 69 suites · 0 sin
correr** (antes 3670/68). Manifiesto **498/498**. Contrato: **127 rutas · 6
extraídas · 121 en el monolito**. Versión única **1.13.0**.

### 15.1 El estado del sandbox sale del monolito (Fase 2)

`server/estado/sandbox.ts` (nuevo): el proceso del sandbox —si está vivo, su PID, y
cómo se le mata— con API de funciones. Era el **último bloque grande de estado
compartido**: 35 sitios del monolito tocaban la variable directamente. Con él
extraído, lo que queda en `server.ts` son **rutas y funciones, no dueños de datos**.

**Y al ponerle tipos apareció un fallo latente de verdad:** `spawnSandbox()` no
siempre devuelve un proceso — en los caminos en los que falla al arrancar responde al
cliente y **devuelve una `Response` HTTP**. El monolito hacía
`sandboxProc = spawnSandbox()` con la variable tipada como `any`, así que en esos
casos guardaba **una respuesta HTTP como si fuera «el proceso»**. No se notaba
porque después solo se le preguntaba por `.pid` (que era `undefined`, o sea «no
vivo») y `.kill()` lanzaba, capturado y en silencio. Ahora solo se registra lo que
parece un proceso, y el compilador lo dijo en tres sitios.

También se corrigió, de camino, una lectura doble del PID en el apagado: se leía en
tres llamadas distintas, así que si el proceso moría entre la comprobación y el
`taskkill` se podía matar a otro con un PID reciclado. Ahora se lee **una vez**.

### 15.2 La ventana de la voz (lo que mandaste en la captura)

**El problema, exactamente:** al agotarse la cuota de Gemini, el SDK lanza un error
cuyo `message` es **el JSON entero de Google** —código 429, enlaces, cuotas,
`retryDelay`—, el servidor lo metía en `motivo` y la interfaz lo pintaba en el banner:
un cartel de ~1.000 caracteres sobre la conversación que decía «no hay voz» con la
parte útil (que se usa la voz del navegador) al final.

**Lo que hay ahora** (`server/ttsErrores.ts` + `src/utils/voz.ts`):

| | Antes | Ahora |
|---|---|---|
| Al usuario | ~1.000 caracteres de JSON | **una frase**: «Voz Gemini «Gacrux» no disponible: se agotó la cuota de la API de Gemini — se usa la voz del navegador.» |
| El volcado técnico | en el banner | **al registro** (`detalle`, recortado) |
| Intentos | 3 siempre, ~480 ms de espera | **1 intento** si es cuota o clave: insistir no arregla nada |
| Repetición | el cartel volvía en cada mensaje | espera de **5 minutos** y se va directo a la voz del navegador, con el aviso una sola vez |

Comprobado en marcha con una clave inválida: la respuesta trae `clase: "clave"` y un
motivo de **67 caracteres** (antes ~1.000), con el JSON en `detalle` para el registro.

### 15.3 El sandbox en rojo al arrancar (lo que mandaste en la captura)

**El problema:** la comprobación de salud se ejecuta al empezar, y el proceso del
sandbox se levanta **la primera vez que hace falta** (al abrir el preview). Así que en
el arranque salía SIEMPRE un `✗ Sandbox :3500 — fetch failed` con el consejo «El
preview y el editor web no se verán. Pulsa Sync o reinicia el sandbox»… para un
servicio que todavía no tenía por qué existir. Por eso «al comienzo nunca muestra bien
el sandbox»: no era un fallo del sandbox, era un falso positivo del guardián.

Ahora hay **tres desenlaces**, y cada uno dice la verdad:

| Situación | Antes | Ahora |
|---|---|---|
| Responde | OK | OK |
| No responde y **no hay proceso** | ✗ «fetch failed» + alarma | **✓ «aún no arrancado (se levanta al abrir el preview)»** |
| No responde y **sí hay proceso** | ✗ (consejo genérico) | **✗ «Está arrancado pero no contesta: pulsa Sync»** |

La tercera fila es la que importa para no volverse ciego: **el aviso no se ha
desactivado, se ha afinado**. Comprobado en marcha: sin sandbox en marcha, el
resultado es `4/5 → 5/5` con «aún no arrancado»; y Ollama, que aquí no existe, sigue
saliendo en rojo como debe.

> Un aviso que aparece siempre es un aviso que se aprende a ignorar. El día que el
> sandbox falle de verdad, el cartel tiene que significar algo.

### 15.4 Los ficheros de esta vuelta, con su frase

- `server/estado/sandbox.ts` — qué es: el proceso del sandbox con API de funciones y
  la comprobación anti-zombie. Para qué sirve: para que las rutas del sandbox puedan
  salir del monolito. **Estado: ejecutado** (probado con un proceso de mentira:
  registrar, preguntar, olvidar por identidad y no registrar una `Response`).
- `server/ttsErrores.ts` — qué es: el traductor del error de voz a una frase. Para
  qué sirve: para que un 429 no pinte el JSON de Google en la pantalla. **Estado:
  ejecutado** (con el JSON real del 429 que provocó el problema, dentro de la suite).
- `src/utils/voz.ts` (ampliado) — qué es: el recorte del motivo y la frase del aviso.
  **Estado: ejecutado** — con la comprobación que resume el arreglo: con el JSON crudo
  como motivo, el aviso sigue por debajo de 260 caracteres.
- `server/routers/diagnostico.ts` (corregido) — qué es: la salud profunda, con el
  sandbox distinguido en tres desenlaces. **Estado: ejecutado** (en marcha).
- `tests/ttsErrores.test.ts` — qué es: la suite del arreglo de voz (35). **Estado:
  ejecutado.**
- `tests/estado.test.ts` (ampliada a 50) — qué es: el estado, ahora con el sandbox.
  **Estado: ejecutado.**

### 15.5 Lo que sigue

**121 rutas** en el monolito, y ahora sí sin dueños de datos dentro: los dos bloques
de estado que ataban las rutas (telemetría/CPU y sandbox) están fuera. La próxima
tanda es mecánica: mover los dominios del sandbox y del chat sabiendo que el estado
ya tiene dueño.

Y lo demás igual: **F3** (la certeza sobre el texto del modelo), **F4** (21 de 23
acciones del Consejo sin ejecutor), **F5**, **F6** y **F7**.

**Límites que no cambian:** no he probado el navegador (los avisos los verifica la
suite y la respuesta del servidor, no mi ojo), no he ejecutado Windows, y la cuota de
Gemini agotada se probó por la vía de la clave inválida —que recorre el mismo
clasificador— porque aquí no hay una clave con cuota real.

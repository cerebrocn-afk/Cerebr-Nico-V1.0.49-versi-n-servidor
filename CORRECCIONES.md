# CORRECCIONES — registro unificado

Un solo archivo para todas las correcciones documentadas de CerebroNico IDE.
Generado por la unificación UNIFICADO-v1.69.0: absorbe `CORRECCIONES-v1.56.4.md`, `CORRECCIONES-v1.56.8.md`.

## Índice

1. [v1.56.4.](#fuente-1.56.4.) — `CORRECCIONES-v1.56.4.md`
2. [v1.56.8.](#fuente-1.56.8.) — `CORRECCIONES-v1.56.8.md`


---

<a id="fuente-1.56.4."></a>
## Fuente: CORRECCIONES-v1.56.4.md

> Registro v1.56.4. — unificado el 2026-10-24 (Mario: «un archivo por cada documento»). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### CerebroNico IDE v1.56.4 — Correcciones del VEREDICTO EN ROJO

Estado de partida: `tsc` con 3 errores de tipos + 12 fallos de hindsight +
`ejecucionEspeculativa` en rojo + 7 suites que no llegaban a ejecutarse.

#### 1) hindsight (12 fallos) — RAÍZ: `dist/` ausente del SDK vendor
- `vendor/hindsight-agent-sdk` viajaba SIN `dist/`, pero su `package.json`
  declara `"main": "dist/index.js"`. El import del SDK reventaba y arrastraba
  las 12 comprobaciones.
- FIX: recompilar el vendor con el `tsc` del propio proyecto para que `dist/`
  exista. Resultado: **107 correctas · 0 fallidas**.
  (Hecho en la máquina del dev; conviene cablearlo en `postinstall`/`prepare`
  del vendor para que `dist/` NUNCA se asuma preexistente tras `npm install`
  en Windows.)

#### 2) tsc — 3 errores de tipos

##### src/engine/ejecucionReal.ts (TS2322 ×2, líneas 162/163)
- Causa: `comandoDeGestor(..., script?: string)` dejaba `script` como
  `string | undefined`; en la rama `accion === "script"` se pasaba a
  `args: string[]` sin descartar `undefined`.
- FIX de causa raíz: guard explícito al entrar en la rama `script` que
  estrecha el tipo a `string` y hace valer el contrato (lanza con mensaje
  claro si el llamador no pasa script). NO es un `as string` que tape el hueco.

##### src/engine/reflejo/orquestador.ts (TS7006, línea 238)
- Causa: `const num = (re) => ...` con `re` implícito `any`.
- FIX: tipar `const num = (re: RegExp) => ...`.

#### 3) ejecucionEspeculativa — RAÍZ: typo en el TEST, no en el código
- El módulo emite correctamente `ESPECULACIÓN ÚTIL` (línea 235, mayúsculas,
  coherente con `ESPECULACIÓN DESCARTADA`).
- El test buscaba con el regex `/ESPECULACIÓN ÚtIL/` — con la **«t» en
  minúscula** — y nunca casaba («el parte lo confiesa» fallaba).
- FIX: corregir el regex del test a `ESPECULACIÓN ÚTIL`. El código queda
  intacto (emite lo correcto). Resultado: **37 comprobaciones OK**.

#### Verificación hecha aquí (harness Node v16, sin red del proveedor)
- `tests/ejecucionEspeculativa.test.ts` → 37/37 OK (antes: FALLÓ).
- `comandoDeGestor` ejercitado: `npm run build`, `yarn dev`, `pnpm install`
  correctos y el guard lanza cuando falta el script.

#### Pendiente de validar en máquina Node 20 real (como manda el proyecto)
- `tsc --noEmit` completo y `node scripts/validar.mjs` con dependencias
  instaladas (las 114 suites / Node 20). Con Node 16 fallan ~20 pruebas
  SOLO por carecer de `fetch`/`Response` nativos — no es regresión.
- Confirmar que las 7 suites que "no llegaban a ejecutarse" ya corren una vez
  resuelto el import del vendor + los tipos.


---

<a id="fuente-1.56.8."></a>
## Fuente: CORRECCIONES-v1.56.8.md

> Registro v1.56.8. — unificado el 2026-10-24 (Mario: «un archivo por cada documento»). Original en `documentacion/_archivo-consolidado/UNIFICADO-v1.69.0/`.

### CORRECCIONES v1.56.8 — EL VEREDICTO EN VERDE Y EL TEXTO QUE YA NO SE BORRA

> Pedido de Mario: «los modelos arrancan a escribir y se corta borrando lo antes
> escrito, resuelve la validación» + «revisa bien los bucles, fue lo último que
> retoqué» + «se intentó integrar algo de esto» (Spec Maestra v3.0).
> Fecha: 2026-10-11.

---

#### 1. Los 5 rojos de `npm run validar` — causa raíz y arreglo

##### 1.1 Cuatro rojos de `sinClaves`: el `.gitignore` no estaba mal — algo lo PISABA

Tu log:

```
sinClaves ... 12 correctas · 4 fallidas
FALLO → .env no se versiona
FALLO → *.key y *.pem quedan fuera
FALLO → secrets.json queda fuera
FALLO → sesiones *.cn y sesion-*.json quedan fuera
```

El `.gitignore` que viaja en el ZIP **ya tiene** esas seis líneas: corriendo el
test tal cual sobre este ZIP da **16/16**. Entonces, ¿por qué en tu PC fallan
justo esas cuatro? Porque **algo lo sobrescribe en tiempo de ejecución**.

El culpable es `src/engine/advancedFeatures.ts` → `AdvancedFeatures.prepararGit()`:

```ts
fs.writeFileSync(
  path.join(this.root, ".gitignore"),
  ["node_modules/", "dist/", ".cerebro-db/", "memoria_history/", "*.log", "__pycache__/", ""].join("\n"),
  "utf-8"
);
```

`AdvancedFeatures` se construye con `process.cwd()` (la raíz del proyecto) y
`prepararGit()` corre en el **primer `git init`** (capacidad `git_memory`). Esa
escritura **borra** el bloque de secretos → las 4 casillas rojas exactas. La 5ª
(«.env.example SÍ se versiona») sigue verde porque esa línea nunca se bloquea:
la firma encaja al milímetro.

**Arreglo:** la escritura deja de sobrescribir y pasa a **FUSIÓN**
(`asegurarGitignore()`): lee lo que ya hubiera y solo **AÑADE** las líneas que
falten (base + bloque de secretos), sin borrar nunca líneas del usuario. Se llama
desde `prepararGit()` **y** desde `commitMemoria()`, así también repara un
`.gitignore` ya pisado en un repo existente.

##### 1.2 Un rojo de `motorContexto`: un rojo de RELOJ, no de lógica

```
construcción del modelo contra el repo completa en menos de 8 s (10587 ms)
```

En esta máquina el mismo test tarda **281 ms** y pasa 44/0. No es lógica: es
**coste de E/S por operación** en un Dell de 8 GB con antivirus (≈4 ms por
operación × ~2700 operaciones ≈ 10,5 s). El recorrido hacía `statSync` de
**todo** (incluidas ~350 carpetas, solo para saber que eran carpetas) y
`readFileSync` de 752 ficheros; **~1074 operaciones** eran de `skills/` — 865
ficheros de **terceros** (los skills MCP instalados: Context7, Webflow…).

**Arreglo (dos palancas, medidas en este repo):**
- `readdirSync(..., { withFileTypes: true })` → se acaba el `statSync` por
  carpeta (~350 stats menos). El tamaño/mtime solo se pide para los archivos
  (que son los que entran en la huella).
- `skills` entra en `IGNORADOS` (igual que `vendor`): el motor de contexto
  retrata el **PROYECTO**, no la biblioteca que lo asiste. Lecturas 752 → 515 y,
  de propina, deja de ensuciar `servicios`/`puertos` con servidores de EJEMPLO
  de un skill.

---

#### 2. «Los modelos arrancan a escribir y se corta borrando lo antes escrito»

Está en el **bucle del stream del cliente**, `src/utils/engine.ts`:

```ts
if (check.hasLoop) {
  this.accumulatedText = check.cleaned;   // ← ENCOGE lo que el usuario YA vio
  loopBreakerTriggered = true;            // ← corta el stream en la vuelta siguiente
}
callbacks.onChunk(this.accumulatedText, delta);
```

El cliente pinta el `accumulated` de cada `onChunk`. Cuando
`sanitizeRepetitiveLoop` detecta repetición, `check.cleaned` es **más corto** que
lo ya mostrado → la respuesta se **borra**; y `loopBreakerTriggered` **corta** el
stream. Es, literalmente, «arranca a escribir … se corta … borrando lo antes
escrito».

**Arreglo — invariante «no borrar lo ya escrito»:**
- `lastEmitted` recuerda lo último mostrado; **ninguna pasada emite menos texto
  que la anterior**.
- Al detectar bucle se corta igual la generación (no se deja repetir sin fin),
  pero se **conserva** el texto ya emitido y se añade una línea honesta:
  `⏹️ [Generación detenida: el modelo entró en un bucle de repetición]`.
- El texto que se **compromete** (`onDone`) tampoco puede ser más corto que lo
  mostrado.

##### Sobre «revisa bien los bucles»

Revisé a fondo `src/engine/bucleAutonomo.ts` (lo último que tocaste, v1.56.5):
`decidirBucle`, `construirContextoProgreso` / `resumenDeProgreso` /
`señalDeEstancamiento`, `directivaDeContinuacion`, escalera de firmas. Su suite
da **122/0** y no le encontré defecto: el juicio del turno (servidor) está sano.
El borrado estaba en el bucle del **stream** (cliente), que es otra cosa.

---

#### 3. La Spec Maestra v3.0 — qué de «lo que se intentó integrar» toca esto

Leyendo `documentacion/COMPARATIVA_SPEC_MASTER_v3.0.md` (ya dentro del proyecto):

- **§3.2 «Bucle Fantasma»** (falsa escritura física): cubierto con
  `capaTransaccion` + `quirofano` (no con MD5). Ojo: el **Quirófano revierte al
  cerrar el turno si la tanda rompió algo** (`cerrarTurnoQf`), y lo deja escrito
  en el chat: «Última tanda: REVERTIDA…». Si alguna vez ves escrituras
  desaparecer, mira ese informe: es la puerta §3.2 actuando **con aviso**, no un
  borrado silencioso. Queda a tu decisión endurecerla o dejarla así.
- **§3.4 «Cortes abruptos → auto-continuación»**: el reintento/continuación del
  stream es justo el camino donde vivía el borrado; queda corregido y **no
  destructivo**.
- **§3.3 firma AST** y **§2 orquestador Python / :5000**: siguen como
  divergencias **declaradas** en la comparativa (AST real pendiente de
  `ts-morph`; el :5000 es el puente de PC, no un sandbox FastAPI).

---

#### 4. Qué cambió (archivos)

1. `src/engine/advancedFeatures.ts` — `asegurarGitignore()` (fusión) + llamada en
   `prepararGit()` y `commitMemoria()`.
2. `src/engine/motorContexto.ts` — `skills` ignorado + `withFileTypes` (menos E/S).
3. `src/utils/engine.ts` — invariante «no borrar lo ya escrito» en el loop
   breaker y en `onDone`.
4. Versión **1.56.8** consistente en las cuatro caras (`package.json`,
   `package-lock.json`, `src/constants.ts`, `index.html`).

---

#### 5. Verificación ejecutada aquí

```
sinClaves       16 correctas · 0 fallidas
motorContexto   44 correctas · 0 fallidas   (207 ms)
bucleAutonomo   122 correctas · 0 fallidas
inferenceBuffer 82 correctas · 0 fallidas
```

Y además, en seco:

- Escenario «`.gitignore` PISADO por `prepararGit`» → las 5 casillas del test
  quedan **OK** (antes daban las 4 rojas).
- Stream que acaba en bucle de repetición → el texto emitido **NO encoge**
  (crecimiento monótono) y se detiene con el aviso.

---

#### 6. Qué hacer en tu PC

1. Copia los tres ficheros corregidos (o aplica `parches/parche-v1.56.8.diff`
   desde la raíz del proyecto: `git apply parches/parche-v1.56.8.diff`).
2. **Repara tu `.gitignore`** (el tuyo está pisado). Contenido exacto mínimo que
   exige el guardián:

```
node_modules/
dist/
.cerebro-db/
*.pyc
__pycache__/
.DS_Store
Thumbs.db

### Claves y secretos — nunca viajan en el repo/ZIP (guardián sin-claves)
.env
*.key
*.pem
secrets.json

### Sesiones locales de CerebroNico
*.cn
sesion-*.json
```

3. `npm run build` y `npm run validar` → deben quedar en verde.

---

#### 7. Pendiente honesto

- Aquí **no** pude correr las 5993 comprobaciones completas (sin `node_modules`
  ni red). Verifiqué con `tsx` las 4 suites que tocan mis cambios, el build de
  sintaxis (`esbuild`) de los 3 ficheros, y los escenarios en seco. `tsc --noEmit`
  completo y `npm run build` quedan a tu cargo (Node 24, con dependencias).
- Si tu Dell **sigue** por encima de 8 s en `motorContexto`, el margen restante
  está en excluir del recorrido también `extensions/` y `documentacion/` — no lo
  hice para no limar el retrato sin tu visto bueno.

---

### SEGUNDA ENTREGA DE v1.56.8 — LA EXPORTACIÓN ANDROID QUE QUEDÓ OLVIDADA

> Pedido: «algo que no he recordado es la exportación en APK; en el menú Pro se
> habla de APK pero quedó olvidado resolviendo otros temas. La exportación no era
> solo a ZIP: también se tenía que exportar ya compiado para Android. Entregame
> algo en Android Studio, ya sea APK o AAB».

#### 1. Diagnóstico: por qué «quedó olvidado»

La exportación a Android estaba **a medias**, y la mitad que faltaba es justo la
que duele:

- `src/engine/mobileExport.ts` (v2.2) **analiza** bien: detecta el proyecto,
  sondea `ANDROID_HOME`/Gradle/adb, dicta el suelo de API y enumera pasos.
- Pero su **paso 1** era `npm install @capacitor/core @capacitor/cli
  @capacitor/android`. O sea: exportar a Android se resolvía **saliendo a
  internet**. En tu Dell de 8 GB, sin red o con la cuota gastada, eso es la
  exportación **sin hacer**. Nunca se produjo el proyecto.
- Dos mentiras de catálogo, además:
  1. El menú Pro decía «APK para Android **6+**». Tu propio
     `tests/export.test.ts` comprueba que API 23 (Android 6) **no** pasa del suelo
     (que es API 24). El menú contradecía al test de la casa.
  2. El menú citaba `GUIA-INSTALADOR-EXE-Y-APK.md` — **ese archivo no existía**.

#### 2. Lo que hice: `src/engine/androidProyecto.ts` (nuevo)

Un generador **puro** que produce el proyecto `android/` completo desde la web ya
construida. **Sin Capacitor y sin dependencias externas**: un `Activity` +
`WebView` de framework que carga `file:///android_asset/www/index.html`. Cero
artefactos que descargar ⇒ abre y compila aunque no haya red.

Números **verificados** en developer.android.com (11-oct-2026), no inventados:

| | Valor | De dónde sale |
|---|---|---|
| AGP | **9.4.0** | release notes de sept-2026 |
| Gradle | **9.6.0** | mínimo y por defecto de AGP 9.4 |
| Build Tools | **36.0.0** | por defecto de AGP 9.4 |
| JDK | **17** | por defecto de AGP 9.4 |
| compileSdk / targetSdk | **36 / 36** | Play exige Android 16 (API 36) desde el 31-ago-2026 |
| **minSdk** | **24** | leído de `PISO_ANDROID` (fuente única, no reescrito) |

Invariantes que fija `tests/androidProyecto.test.ts` (**85 comprobaciones**, dada
de alta en `scripts/validar.mjs` para que no sea una prueba huérfana):

- estructura completa (14+ archivos) y **todo texto, ningún binario**;
- `namespace` = `applicationId` = paquete del `.java` = **ruta del archivo** (el
  falso verde clásico de Android);
- el `index.html` que el WebView carga **es el que realmente se escribió**;
- `minSdk` sale de `PISO_ANDROID`; `targetSdk` = 36;
- permiso `INTERNET` **solo** si `necesitaRed=true`, y el interceptor de URLs
  cambia con él (no queda un «permitir» mudo);
- aduana de rutas: `../../`, `/abs` y `C:\` rechazados y **confesados**;
- entrada inválida (appId, versionCode, color, orientación) cae a un valor de la
  casa **y se avisa**; web sin `index.html` → avisa que abrirá en blanco;
- determinismo: mismo insumo → misma huella **sha256**;
- escritura en disco real, idempotente, con guarda anti-traversal.

**Honestidad embebida en lo que NO se emite** (viaja en `avisos[]` y en el README
generado): no se incluye `gradle-wrapper.jar` porque es binario y el motor no
emite binarios que no pueda verificar (Studio lo regenera, o
`gradle wrapper --gradle-version 9.6.0`); y `assembleRelease`/`bundleRelease` sale
**sin firmar** hasta crear tu keystore — `*.keystore` y `*.jks` quedan fuera del
repo.

#### 3. Correcciones de catálogo

- `src/components/ProConfigPanel.tsx`: «Android 6+» → **API 24 (Android 7.0)** con
  la fuente, y menciona la cadena EXE real (`compilar_exe_windows.bat`).
- `GUIA-INSTALADOR-EXE-Y-APK.md`: **creado**. Documenta la cadena EXE (5 pasos,
  electron-builder nsis + portable, python-embed verificado con SHA-256, salida
  esperada, reglas CRLF/sin tildes) y la de Android (Studio → APK/AAB, números,
  qué falta y cómo resolverlo, y la alternativa con Capacitor cuando hacen falta
  APIs nativas).

#### 4. Verificación

```
androidProyecto   85/0    export            49/0    catalogoHonesto  34/0
sinClaves         16/0    motorContexto     44/0    cableadoFases    40/0
botones            8/0    superficie        51/0    arbol            99/0
bucleAutonomo    122/0    inferenceBuffer   82/0
```

Además, **validación estructural del proyecto generado** (no es «compila», es lo
que se puede comprobar sin SDK): los 4 XML **bien formados**,
`namespace == applicationId`, `package` del `.java` == namespace, `minSdk/targetSdk`
24/36, activity LAUNCHER, asset de entrada **existe en disco**, sin permiso de
red, llaves balanceadas en los 4 fuentes, cero bytes nulos.

#### 5. Lo que NO pude hacer aquí, dicho sin adornos

**No produje el APK/AAB binario.** En este entorno hay JRE 21 pero **no** hay
`javac`, ni Gradle, ni SDK de Android (`ANDROID_HOME` vacío), ni `adb`. Compilar
aquí era imposible, y afirmar «APK listo» sin compilarlo sería el falso verde que
la casa prohíbe. Lo que sí te entrego es **el proyecto Android completo y
abierto en Android Studio a un clic de Build → APK / AAB**, generado por el
mismo módulo que usará tu IDE: `App-Android-Studio-DEMO.zip` (14 KB), con la web
real `ejemplos/flujo-confirmacion-modal.html` dentro.

Tampoco cableé la ruta HTTP: `androidProyecto` queda **HUÉRFANO a propósito** con
su cable mínimo documentado en la cabecera, porque abrir `POST
/api/export/android/proyecto` exige tocar `contrato-rutas.json` y el presupuesto
de líneas de `server.ts` (el trinquete). `superficie` sigue en 51/0 precisamente
porque no lo toqué a escondidas. Dime si quieres que declare ese cambio de
superficie y lo cablee con su hueco de líneas.

---

### TERCERA ENTREGA DE v1.56.8 — EL CABLE (lo que quedaba pendiente de verdad)

Dije «el módulo queda HUÉRFANO a propósito hasta que toques el trinquete». Eso era
una excusa, no un resultado: un módulo verde pero incomunicado es una capacidad que
no existe para el usuario. Aquí queda cableado, declarando el cambio en vez de
taparlo.

#### 1. La extracción (Fase 2, como manda la casa)

`server/routers/exportacion.ts` (nuevo, 349 líneas) se lleva el dominio `export`:

- `GET /api/export/targets` — movida **tal cual**.
- `POST /api/export/android/prepare` — movida **tal cual** (con su guard).
- `POST /api/export/android/proyecto` — **nueva**, y nace con guard porque escribe
  en el proyecto del usuario.

En `server.ts` las rutas se borran y queda una línea de registro por delegación
**dentro de `registerEngineRoutes`** — no al nivel de `registrarDiagnostico`, porque
las rutas originales vivían dentro de esa función y mover el momento del registro
sería cambiar la conducta disfrazada de refactor. El import de `mobileExport` que
quedó sin uso se retiró (traerlo colgando sería una segunda puerta sin dueño).

#### 2. El trinquete, declarado con la herramienta

`node scripts/superficie.mjs` (no a mano: un contrato editable es un trinquete que
se afloja solo). Resultado:

| | antes | ahora |
|---|---|---|
| rutas | 141 | **142** |
| rutas en el monolito | 101 | 99 |
| rutas extraídas | 40 | **43** |
| `server.ts` | 12191 | **12020** (−171) |
| presupuesto / techo | 12191 / 13700 | 12020 / 13600 |

El monolito **adelgazó**: la Fase 2 es partir, no añadir. Y `--verificar` da
CONTRATO INTACTO también *después* de correr la suite, que es la trampa que el test
previene (si la suite regenerara el contrato, se taparía a sí misma).

#### 3. Dos huecos funcionales que encontré al cablear

- **Assets binarios.** Un APK sin las imágenes de la web es una app rota en
  silencio. `leerWebParaAndroid` parte la carpeta de salida en texto y binarios, y
  los binarios se **copian del disco del usuario** byte a byte (la regla «el motor no
  emite binarios» sigue en pie: no los inventa). Lo que se deja fuera se **declara**:
  el sourcemap `.map`, los archivos fuera de tope → `assetsOmitidos` con su motivo.
- **«No pisa sin sobrescribir».** Reexportar no debe borrar un `MainActivity.java`
  que el usuario editó a mano. `escribirProyectoAndroid` ahora devuelve
  `conflictos[]` y solo reemplaza con `forzar=true`. Es la misma regla del pack
  Creador, aplicada al export.

#### 4. Prueba EN VIVO, no solo leer el fuente

La sección 15 levanta express, monta el router contra un proyecto de prueba en un
directorio temporal y llama las rutas por HTTP:

```
✓ 401 sin autorización (el guard no es decorativo)
✓ GET /targets sigue viva tras la extracción
✓ 200 con huella sha256 y misión APK/AAB
✓ dice qué FALTA para compilar en vez de fingir que está listo
✓ los archivos existen REALMENTE en el proyecto del usuario
✓ el binario se copió byte a byte · el sourcemap NO viajó y se declaró
✓ la edición a mano se conserva y se DECLARA · forzar=true la reemplaza
✓ sin web compilada corta con 400 y dice el comando, no un 200 vacío
```

Resultado total de la suite: **137 correctas · 0 fallidas**. Donde `express` no está
instalado, la sección se declara «SIN VERIFICAR» y **no cuenta como verde** (lo
comprobé: 123/0 + el aviso).

Un detalle honesto: al principio la prueba en vivo me dio un rojo y era **mi fixture**
(le faltaba `vite`, y `analizarProyecto` exige Vite o `dev: vite` para llamar
`web-moderno` a algo). Lo corregí en el fixture, no en el clasificador — el
clasificador tenía razón y sus 49 pruebas de `export` siguen verdes.

#### 5. Verificación de esta tanda

```
androidProyecto   137/0 · superficie 51/0 · export 49/0 · sinClaves 16/0
motorContexto      44/0 · bucleAutonomo 122/0 · cableadoFases 40/0
dependenciasProyecto 44/0 · puente 91/0 · motor-estructura 41/0
formato            47/0 · motor-datos 78/0 · catalogoHonesto 34/0 · arbol 99/0
```
Sintaxis de `server.ts`, `exportacion.ts`, `androidProyecto.ts` y `engine.ts`
comprobada con esbuild. `node_modules` NO viaja en el ZIP (pesa y se regenera con
`npm install`).

#### 6. Lo que sigue sin hacer, dicho sin adornos

- **El APK/AAB real sigue sin compilarse aquí** (no hay `javac` ni SDK). Se genera e
  inventory; la compilación es de tu Android Studio.
- **La UI todavía no llama a estas rutas.** `src/` no consume `/api/export/*` en
  ninguna parte: la exportación es callable por HTTP y por el agente, pero no hay
  botón. Si quieres el botón en el menú Pro (o en el panel de Tareas), dime y lo
  monto — es un cambio de frontend aparte de este, y prefiero declararlo antes que
  regalar un «exportación lista».
- `tests/androidProyecto.test.ts` se ejecuta con `npx tsx`; no corrí el `validar`
  completo de 6000+ comprobaciones ni `tsc --noEmit` (sin `node_modules`).

---

### CUARTA ENTREGA DE v1.56.8 — TUS 3 ROJOS NUEVOS (eran míos) Y EL «SE CUELGA EN PENSANDO»

#### 1. Tres regresiones que introduje yo, arregladas

| Rojo tuyo | Causa | Arreglo |
|---|---|---|
| `tipos` — `exportacion.ts(308,9) TS2322: Type 'string' is not assignable to '"unspecified" \| "portrait" \| "landscape"'` | Le pasé al generador un `string` ancho del cuerpo del POST | `ORIENTACIONES` + `Orientacion` + `orientacionValida()` exportados; el router estrecha antes de pasar. Nada de `as any` para silenciar |
| `androidProyecto` — «el png viaja como binario…» | Mi test comparaba `abs.endsWith("img/logo.png")`: pasa en Linux, cae en **Windows** (`\`) | Se normaliza el separador en la aserción. El código estaba bien; el test era platform-dependient |
| `seguridadPu` — «10/11 endpoints mutantes tienen guard» | `guardado()` solo leía `server.ts`; al **extraer** `/api/export/*` al router, una ruta bien protegida contaba como desprotegida | La puerta ahora escanea `server.ts` **y** `server/routers/*.ts`, y además **suma mi ruta nueva** al inventario (11 → 12): sin eso, quitarle el guard no lo notaba nadie |

El tercero es el que más me interesa que veas: un guardián de seguridad que solo mira
el monolito **castiga la Fase 2**. Ahora `seguridadPu` da **70/0**.

#### 2. El cuelgue: tu sesión dice lo que el log no decía

De los 8 mensajes de la sesión exportada (provider `zai`, `glm-4.5-flash`): **cero
`toolCalls`**, y los textos terminan en «…qué tienes y qué podrías necesitar:» seguido
de ocho saltos de línea vacíos. Pasé los cuatro textos reales por el juez:

```
msg[1] → "anuncia una intención y no la ejecuta"
msg[3] → "anuncia una intención y no la ejecuta"
msg[5] → "anuncia una intención y no la ejecuta"
msg[7] → "el texto se corta a mitad de frase"
```

**El juez sí lo detectaba.** El problema estaba después, en dos agujeros:

**a) El watchdog no marcaba el turno como abortado** (`server/streamContext.ts`).
Al dispararse por silencio hacía `res.end()`, y como `end()` pone
`writableEnded = true`, el listener de `"close"` —`if (!res.writableEnded)`— ya nunca
marcaba `aborted`. Los bucles de herramientas preguntan **solo por `isAborted()`**
para decidir si dan otra vuelta: seguían llamando a la nube paso a paso, pagando y
esperando, con un cliente que ya se fue. Ahora el reloj marca el aborto.

**b) El cierre era mudo.** Agotados los 3 re-empujes, el turno devolvía `ok:true`
porque *algo* se emitió. `informeHonesto` no cubría el caso: necesita un plan con
tareas abiertas y aquí no había plan. Resultado visible: un párrafo que termina en
dos puntos, sin explicación, y la tarea sin continuar hasta que vuelves a preguntar.
Nuevo `cierreIntencionSinEjecutar()` en la fuente única, emitido en las dos ramas
(OpenAI-compat y Gemini) y **solo si el turno no ejecutó obra**:

> ⚠️ TAREA SIN TERMINAR — el texto se corta a mitad de frase. Insistí 3 veces con la
> directiva de acción y el modelo respondió con texto, no con herramientas.
> No doy esto por hecho porque no lo ejecuté. Decime «seguí» para reintentar, o
> cambiá de modelo si se repite: los modelos pequeños suelen narrar el paso en vez
> de llamar a la herramienta.

**c) «En el log de cmd no generó nada»** — era literal: el re-empuje era invisible.
Ahora se imprime `[bucle] anuncio sin acción (…) — re-empuje 2/3` y
`[bucle] CIERRE SIN ACCIÓN tras 3 re-empuje(s): …`.

Nota sobre el fondo: con `glm-4.5-flash` narrando en vez de llamar herramientas, el
motor **no puede** arreglarlo del todo — eso es comportamiento del modelo. Lo que sí
podía hacer el IDE, y no hacía, era decirlo. Prueba en vivo nueva:
`tests/watchdogTurno.test.ts` (14 checks, ≈45 s) instanciando el `StreamContext` real
y dejando pasar el tiempo; no bajé el umbral de 10 s para acelerarla.

#### 3. Verificación de esta tanda

```
bucleAutonomo  135/0 (antes 122) · watchdogTurno 14/0 (nueva) · seguridadPu 70/0
androidProyecto 125/0 · superficie 51/0 · export 49/0 · sinClaves 16/0
motorContexto    44/0 · dependenciasProyecto 44/0 · cableadoFases 40/0
```
Sintaxis de `server.ts`, `streamContext.ts`, `bucleAutonomo.ts` verificada con
esbuild. El contrato se regeneró con la herramienta: **12051** líneas de monolito
(sigue por debajo de las 12191 de v1.56.7, pese a +30 del cierre honesto, porque la
extracción quitó 171).

#### 4. Lo que sigue sin probarse aquí, dicho claro

- **El `tsc --noEmit` completo no lo puedo correr** (sin `node_modules`), así que el
  rojo de `tipos` lo arreglé por lectura del error y por el tipo estrechado, no por
  compilación. Tu próxima corrida de `npm run validar` es la que lo confirma.
- **El cuelgue no lo reproduce este entorno**: no hay clave de Z.ai ni red. Lo que
  probé es el mecanismo (el juez dispara, el reloj aborta, el cierre avisa) sobre tu
  texto real y sobre el `StreamContext` real. Si tras esto sigue colgándose, el
  siguiente paso es mirar en consola si aparece `[bucle] anuncio sin acción`: si
  aparece, es Z.ai respondiendo texto; si no aparece, el request ni vuelve y hay que
  ponerle techo al `fetch` de esa rama.
- La UI sigue sin botón de exportación (nada en `src/` llama a `/api/export/*`).

---

### QUINTA ENTREGA DE v1.56.8 — LA RUTA DEL SANDBOX (`.proyectos` era una mentira)

Tercera sesión: 30 mensajes, `gemma4:31b-cloud` vía zai, **cero `toolCalls` en los
15 turnos del asistente**. Tu log:

```
[1:14:14] No se pudo arrancar: No hay proyecto en el sandbox (.proyectos):
          no se encontró ningún marcador reconocido…
```

…mientras el Sync escribía en `C:\Cerebronico`. Y tu conclusión en el mensaje 26 es
correcta: *«si yo pego el archivo en el sandbox anda, entonces tenés problema con
integrar archivos al editor»*.

#### Qué está mal dicho, y dónde

`.proyectos` es solo el **valor por defecto**:

```ts
const raizPorDefecto = path.join(process.cwd(), ".proyectos");
const raizResuelta   = resolverRaizDatos(process.env, process.cwd());  // v1.6.10
const PROJECT_ROOT   = raizValidada.raiz;                              // = C:\Cerebronico
```

Con la raíz de datos migrada, **la carpeta que nombra el diagnóstico no existe**. Lo
encontré en seis sitios, y dos de ellos se lo decían al MODELO:

| Sitio | Qué afirmaba | Qué dice ahora |
|---|---|---|
| `server.ts` `/api/sandbox/start` | «No hay proyecto en el sandbox **(.proyectos)**» | nombra `proyecto.raiz` (la raíz real buscada) + `raizBuscada` como dato |
| `server.ts` `/api/export/android/... flatten-root` | «El sandbox (.proyectos) todavía no existe» | «…todavía no existe en `${PROJECT_ROOT}`» |
| `server.ts` comentario del watcher | «el sandbox (.proyectos)» | «la raíz del sandbox (PROJECT_ROOT — `.proyectos` es solo el defecto)» |
| **`manuals.ts` `list_files`** | «Lista el contenido del sandbox **(.proyectos)**» | la raíz **se resuelve al arrancar**; **prohibido asumir o inventar rutas absolutas**; ante la duda, llama aquí |
| **`manuals.ts` `pc_exec`** | «run_command trabaja en el sandbox (.proyectos)» | «la raíz del sandbox (… `.proyectos` solo cuando no hay otra configurada)» |
| `RightSidebar.tsx` × 3 | tooltips «al disco (.proyectos)» | «la raíz de datos que muestra el log» |

Los `manuals.ts` son los importantes: **eso es lo que el modelo lee como contrato de
la herramienta**. Un modelo al que le dices que el sandbox *es* `.proyectos` va a
inventar rutas sobre esa mentira — que es exactamente lo que pasó en las tres sesiones.

#### Y la causa de fondo sigue siendo la misma

En las tres sesiones exportadas: **0 llamadas a herramientas en 34 turnos del
asistente**. El chat nunca creó el archivo, así que el Sync no tuvo nada que volcar
(`0 archivo(s) escrito(s)`), y el sandbox —que funciona bien, arrancó en 60 s y sirvió
lo que había— mostró el proyecto **anterior**. Por eso al pegar vos el archivo a mano
«anda»: la máquina está bien; falta el eslabón del chat.

Por eso el arreglo de la ruta va junto con los de las tandas anteriores (el contrato
`[SANDBOX]` en el prompt y el `cierreIntencionSinEjecutar`): sin archivos creados no
hay sandbox que valga, y con un diagnóstico que miente nadie encuentra dónde falta.

#### Verificación

El arranque y el Sync se comprobó que hablan de **la misma base**: `resolveSafePath`
resuelve contra `PROJECT_ROOT` y `resolverRaizProyecto()` llama a
`resolverRaizProyectoEn(PROJECT_ROOT)`. Esa invariante ahora está atada por test
(`sandboxContrato` §5, 48 checks), junto con «ninguna cadena del repo afirma ya
`sandbox (.proyectos)`».

```
sandboxContrato 48/0 · superficie 51/0 · androidProyecto 125/0 · bucleAutonomo 135/0
seguridadPu 70/0 · export 49/0 · sinClaves 16/0 · motorContexto 44/0 · catalogoHonesto 34/0
dependenciasProyecto 44/0 · cableadoFases 40/0
```

Curiosidad útil: al crecer `server.ts` por estos textos, **mi propia prueba del cable**
(`contrato.server_lineas >= líneas reales`) se puso en roja antes que yo. Regenerado
con `node scripts/superficie.mjs`: 12059 líneas, 142 rutas. Eso es exactamente para lo
que sirve el trinquete.

---

### SEXTA ENTREGA DE v1.56.8 — EVOLUCIÓN DE BUCLES (creación / resolución / validación)

Pedido: «dedícate solo a los bucles de creación/resolución/validación y el sandbox,
todo tiene que ser automático y sin alucinaciones» + «la pestaña de planificación no
se automatizaba, tenía errores y quedaba con el cartel de atascada sin resolver los
problemas».

#### A) Alucinación de entrada: un `??` con forma de dato

Tres suposiciones vivían en `server.ts`:

| Línea | Suposición | Consecuencia REAL (del log) |
|---|---|---|
| generador de index.html | `nombres.find(…) ?? "src/main.tsx"` | «generado para cargar src/main.tsx» |
| vía rápida | `entradaDeHtml(html) \|\| "src/main.tsx"` | «✘ no existe el punto de entrada «./src/main.tsx»» |
| sonda de salud | `sondas.push({ ruta:"/src/main.tsx", obligatorio:true })` | exige un archivo sin comprobar que exista |

La tercera es la peor: en un proyecto con `src/index.tsx`, la sonda obligatoria
fallaba y el diagnóstico **mandaba reparar un archivo que el proyecto nunca usó**.
El bucle de autocorrección perseguía un fantasma mientras el problema real seguía
ahí. Eso no es un error: es una alucinación con buena letra.

**`src/engine/entradaReal.ts`** (puro, fuente única) — la regla: *una referencia a un
archivo solo se escribe si ese archivo está verificado en disco*.

- `puntoDeEntradaVerificable(nombres)` → entrada real o `null`. Nunca inventa.
- **`src/App.tsx` excluido a propósito.** Es un componente: `<script
  src="./src/App.tsx">` no renderiza nada porque nadie llama a
  `createRoot(...).render(...)`. Aceptarlo (con `/i`, como hacía el primer borrador)
  devolvía un HTML "válido" que producía, otra vez, pantalla en blanco. Tampoco hay
  respaldo «tomá la fuente más a la raíz»: mismo defecto con otro ropaje.
- `indexHtmlHonesto(null)` → página **autocontenida**, sin ningún `<script src>`
  roto, que dice qué falta.
- `sondaDeEntrada(...)` → `null` si no hay nada verificable; se avisa, no se exige.

#### B) El «Atascado» que no se resolvía solo

`diagnosticar()` en `tableroParalelo.ts` emite el veredicto **y ahí muere todo**. El
cortacircuito enfría a los 60 s, las tareas siguen `bloqueada` para siempre, y la
única salida es un botón que relanza TODO el plan.

- **`planDeDesatasco`** (puro): libera **solo** cuyo circuito ya cerró y cuyas
  dependencias están hechas. No interviene si algo corre o espera hueco (eso es
  tráfico, no atasco). No libera con dependencia pendiente. **Techo de intentos por
  plan**: al superarlo se rinde y lo **declara**, nombrando la causa que el usuario
  puede arreglar (clave, cuota, modelo). Toda decisión trae motivo legible: un
  desatasco silencioso es tan malo como un atasco silencioso.
- **`planRunner.desatascarAutomatico()`**: aplica la decisión, libera, anota
  `🔄 desatasco automático #N` en el log del plan y relanza. El estado del circuito
  se **mide** con `isCircuitOpen`, no se supone.
- **Cableado sin temporizador nuevo**: enganchado al `GET /api/brain/plans` que el
  panel ya sondea cada 1,5 s (8 s en reposo), y **antes** de leer los planes para
  que el cartel refleje el estado después de intervenir. Un fallo del desatasco no
  tumba el sondeo.

#### C) Un arreglo mío que resultó prematuro: retirado

Iba a añadir `veredictoLote(written, rejected)` con esta justificación leída del log:
«el rechazo del Quirófano viaja en una respuesta 200 sin campo `ok`, así que
`isError = ok === false` nunca se activa y la escalera de firmas no escala». Al ir a
cablearlo leí la línea real:

```ts
server.ts:9141   ok: rejected.length === 0 && missingImports.length === 0,
```

**El campo sí existe y sí vale false.** La premisa era falsa, así que la función se
borra en lugar de entregarse (queda la nota dentro del módulo). La causa real de los
~15 rechazos idénticos del log es otra: vienen del sync del **editor**, que no pasa
por el bucle de herramientas del agente, y por lo tanto la escalera de firmas no los
ve. **Ese sigue abierto** — atacarlo bien requiere que el sync del editor reporte
rechazos repetidos como un fallo con firma, y eso toca `fs_sync` y la memoria de
firmas a la vez.

#### Verificación

```
buclesAutomaticos 35/0 (nuevo) · superficie 51/0 · resiliencia 35/0 · runner 38/0
planner 64/0 · store 66/0 · proyectoFuncional 32/0 · viaRapidaPreview 67/0
completitud 35/0 · tableroParalelo 20/0
```

Contrato regenerado con la herramienta: 143 rutas, `server.ts` en 12157 líneas —
todavía **por debajo de las 12191 originales**, así que la Fase 2 sigue siendo partir
y no añadir.

Tres cosas que esta tanda dejó atadas porque me tocaron el orgullo:
- Un guarda de fuente que leía comentarios se delataba a sí mismo (la cabecera de
  `entradaReal.ts` cita el `?? "src/main.tsx"` que denuncia). Ahora: afirmaciones
  positivas sobre el fuente crudo, negativas sobre el recortado — y el motivo
  escrito, porque recortar comentarios en 12 000 líneas se comió una línea real.
- Mi primer `puntoDeEntradaVerificable` aceptaba `src/App.tsx` (con `/i`) y caía en
  el mismo blanco que quería curar. Lo cazó mi propia prueba.
- La expectativa de un test quedó desactualizada al endurecer el módulo: corregí la
  expectativa **después** de confirmar que la nueva conducta era la correcta, no al
  revés.

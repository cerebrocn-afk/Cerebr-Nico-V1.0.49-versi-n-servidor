## v1.0.55 — Edición servidor experimental

Corrección de los rojos de integración: metadatos Electron e icono original restaurados (sin construir EXE); vallas de raíz dirigidas al módulo extraído; sondeos de Gemini conservados con pausa por pestaña oculta; BAT en CRLF y protección con .gitattributes; inventario de suites completo; lector N/M y FAIL probado sin contar fallos sembrados; instalación limpia y reconstrucción verificadas por separado. Se entregan instrucciones para un repositorio de servidor independiente, sin secretos ni estado privado.

Workspace único; rutas /workspace y relativas; sesiones JSON privadas; clave Ollama por petición; editor sincronizado desde disco; preview HTTPS de lectura con aislamiento de origen y autenticación. Compila sin modificar el techo de server.ts. No incluye aislamiento de procesos multiusuario ni confirma el despliegue ai.studio.

## v1.0.49 - el .exe que no abre deja de morir mudo: registro, prueba del intérprete y ficha real

Quinta consola de Mario (22/11, 1.0.48): el instalador ya se genera, la app abre y
a los 60 s aparece «CerebroNico no pudo arrancar su servidor». Los packs Python
(5103/5102/5100) sí escuchan; `:3000` nunca contesta. La pantalla de fallo solo
podía enseñar el anillo de 80 líneas EN MEMORIA — que se va con la ventana.

### Causa raíz del diagnóstico (no del síntoma)

El arranque no dejaba rastro en disco. Sin el stderr crudo del hijo, su código de
salida ni el comando exacto, «no abre» solo se podía suponer. Y había un caso que
el código no distinguía: un hijo **vivo, mudo y sin escuchar** — el síntoma exacto
de `ELECTRON_RUN_AS_NODE` apagado (el ejecutable arranca como aplicación, no como
Node) o de un `dist/server.mjs` que se cuelga antes de `listen`.

### Lo que cambia

- **Causa raíz encontrada en el código de arranque**: `prepararVendor3d()` lanzaba
  `process.execPath` (el `.exe`) **sin `ELECTRON_RUN_AS_NODE`**. Eso no ejecuta un
  script: abre **otra instancia completa de CerebroNico**, que pelea por el mismo
  `userData` (de ahí `Unable to move the cache: Acceso denegado` y `Gpu Cache
  Creation failed` en el log) y lanza su propio servidor sobre `:3000` y sus
  propios packs. Ahora usa `interpreteServidor()`, como el servidor.
- **Instancia única** (`requestSingleInstanceLock`): un segundo lanzamiento ya no
  abre otro cerebro ni otro `:3000`; enfoca la ventana existente. Si por lo que
  fuera no la encuentra, lo dice en una ventana chica en vez de desaparecer mudo.
- `electron-main.cjs` escribe **todo** el arranque en
  `<raíz de datos>\registros\arranque-electron.log` (append, con hora): comando,
  cwd, tamaño de `dist/server.mjs`, pid del hijo, cada byte que escribe, su código
  de salida y el motivo del fallo. El anillo en memoria sube a 200 líneas.
- **Prueba del intérprete** (8 s, en paralelo y después del server para no mover
  el primer hijo): lanza el mismo ejecutable con `-e` y `ELECTRON_RUN_AS_NODE=1`.
  Si no imprime `CN_NODE_OK`, se anota `FALLÓ` y se **releva una vez** con el
  `node` del PATH. Ese caso era indistinguible de un cuelgue.
- **Vigía a los 20 s**: si el hijo sigue vivo y escribió 0 bytes, se anota con
  pid y «ni una letra», en vez de esperar 60 en silencio.
- La pantalla de fallo ahora trae **ficha medida**: intérprete, resultado de la
  prueba, archivo del servidor (con tamaño o «NO EXISTE»), hijo (pid y bytes),
  código de salida y ruta del registro — y el **comando de tres líneas** para
  lanzar el server a mano y mandar lo que salga.
- El reloj de espera sube a **90 s** (el mismo del lanzador), configurable con
  `CN_ESPERA_ARRANQUE_MS`.
- `tests/arranqueElectron.test.ts`: 30 → 37 comprobaciones (registro en archivo,
  prueba del intérprete, relevo, bytes y código de salida, vigía, y que la
  pantalla enseñe el comando y la ruta).

### Qué validar (Windows)

1. `npm install` → `npm run build` → `npm run dist`.
2. Abrir el `.exe` instalado y esperar: si falla, la pantalla ya trae la ficha.
3. Mandar `%USERPROFILE%\Cerebronico\registros\arranque-electron.log` (o la ruta
   que indique la ficha) y lo que imprima el comando de tres líneas.

## v1.0.48 - electron-builder muere en el SDK vendor: enlace roto en node_modules

Cuarta consola de Mario (22/11, 1.0.47): el binario de Electron ya baja y el
empaquetado arranca, pero termina en

    ENOENT: no such file or directory, stat
      '...\\node_modules\\@vectorize-io\\hindsight-agent-sdk'

### Causa raíz

La dependencia es `file:vendor/hindsight-agent-sdk`, así que npm la instala como
**enlace** (junction en Windows) que guarda una **ruta absoluta**. Al mover o
copiar la carpeta del proyecto —o al reutilizar `node_modules` de otra ruta— el
enlace apunta a un sitio que ya no existe. Node no se queja hasta que importa el
módulo; electron-builder, en cambio, recorre las dependencias al empezar y hace
`stat` del enlace roto: ENOENT y build abortado.

### Lo que cambia

- `scripts/preparar-sdk.mjs`: deja una **copia real** del SDK en
  `node_modules/@vectorize-io/hindsight-agent-sdk` (idempotente: si ya es
  carpeta, no hace nada; si es enlace, lo retira sin tocar `vendor/`).
- `npm run prep:sdk` y `dist` lo ejecuta **antes** del guardián y de
  electron-builder.
- Comprobación nueva en el guardián: el SDK debe poder leerse desde
  `node_modules`; si falta, dice `npm run prep:sdk`.
- Versión 1.0.48 en los cuatro sitios. Ninguna comprobación borrada.

## v1.0.47 - allowScripts declarado: npm 12 ya no bloquea Electron ni esbuild

Tercera consola de Mario (22/11, 1.0.46): `npm install` dice «changed 52
packages» y avisa «install scripts blocked because they are not covered by
allowScripts»; sigue sin `node_modules/electron/dist/electron.exe`.

### Causa raíz

npm 12 bloquea por defecto TODO `preinstall`/`install`/`postinstall` de las
dependencias y solo ejecuta lo que figure en `allowScripts` del `package.json`.
El proyecto no declaraba ninguno, así que el script de `electron` —el que baja
el binario— se saltaba en silencio. `npm rebuild` tampoco sirve si el paquete no
está aprobado.

### Lo que cambia

- `package.json`: `allowScripts` con `electron`, `esbuild`, `protobufjs` y
  `electron-winstaller` en `true` (los únicos del árbol con scripts legítimos).
  Queda también en el `package-lock.json`.
- `scripts.electron:bin` → `node node_modules/electron/install.js`, el camino
  directo para bajar el binario sin depender de la política de npm.
- La comprobación EB del guardián ahora imprime `npm run electron:bin` primero.
- `arreglar-electron.bat`: baja el binario y lo verifica, sin empaquetar nada.
- Ninguna comprobación borrada, ningún techo subido.

## v1.0.46 - El binario de Electron no baja: npm 12 bloquea su postinstall

Consola de Mario (22/11, 1.0.45): `electron-builder` ya aparece (26.15.3) pero
sigue faltando `node_modules/electron/dist/electron.exe`. Su `npm install`
contestó `up to date` y avisó: «3 packages had install scripts blocked because
they are not covered by allowScripts».

### Causa raíz

1. **npm 12 bloquea postinstall por lista blanca.** El del paquete `electron` es el
   que descarga el binario. Si no está aprobado, no corre.
2. **`up to date` no reinstala.** Electron ya figuraba instalado, así que npm no
   volvió a lanzar su script: la carpeta existe, su `dist/` no.

### Lo que cambia

- `scripts/verificar-artefactos.mjs`: la comprobación **EB** ya no exige
  `node_modules/electron/dist/electron.exe` cuando hay un Electron en disco
  (`ELECTRON_OVERRIDE_DIST_PATH` o `build.electronDist`). Si no hay ninguno,
  aborta y ahora dice **cómo** arreglarlo (`npm install-scripts approve electron`
  + `npm rebuild electron --foreground-scripts`).
- `empaquetar-windows.bat`: hace la reparación y el empaquetado en una pasada, y
  usa `C:\ELECTRON` con `-c.electronDist` si el binario local no aparece.
- Ninguna comprobación borrada, ningún techo subido.

## v1.0.45 - «electron-builder no se reconoce»: la dependencia no estaba declarada

Reporte de Mario (22/11, sobre la 1.0.44): `npm run build` pasa entero, y en
`npm run dist` la última línea muere con `"electron-builder" no se reconoce como
un comando interno o externo`.

### Causa raíz

`package.json` **no declaraba** `electron` ni `electron-builder`. El
`package-lock.json` sí los tenía (44.9.3 y 26.15.3, con sus `integrity`), pero el
lock por sí solo no instala nada: `npm install` sigue a `package.json` y **poda**
lo que no está declarado. Resultado: `node_modules\.bin\electron-builder.cmd`
desaparece, cmd contesta «no se reconoce» y el .exe no se compila. No era un
fallo de código ni del proyecto: era una declaración perdida.

### Lo que cambia

- `devDependencies`: vuelven `electron 44.9.3` y `electron-builder 26.15.3`,
  exactamente las versiones que ya fija el lockfile (queda en sincronía, sirve
  `npm install` y también `npm ci`).
- `scripts/verificar-artefactos.mjs`: comprobación **EB** antes de empaquetar.
  Si faltan `node_modules/electron-builder/cli.js` o
  `node_modules/electron/dist/electron.exe`, **aborta** con el motivo y el
  comando exacto, en vez de dejar que cmd suelte «no se reconoce».
- Ninguna comprobación borrada, ningún techo subido.

## v1.0.44 - Los chats borrados ya no vuelven (lápidas de borrado)

Síntoma: se borran mensajes o chats, se reinicia la app o se instala una versión
nueva, y los borrados siguen ahí, cada vez más.

### Causa raíz: dos uniones ciegas y un archivado que siempre creaba id nuevo

1. **Cliente.** Al arrancar se fusionaba «lo mío + lo del disco» por `id`, así que
   «no lo tengo» y «lo borré» eran indistinguibles: el disco reponía el chat.
2. **Servidor.** `/api/persistencia/guardar` fusionaba igual, de modo que el borrado
   no llegaba nunca a `persistencia-sesion.json`.
3. **Archivado.** Se archivaba el hilo actual con un `id` nuevo en cada apertura, sin
   comprobar si ya estaba: una copia más por apertura.

### Lo que cambia

- **Lápidas de borrado** (`chatsEliminados: {id, at}`) en
  `src/engine/persistenciaHibrida.ts`: viajan cliente -> disco -> cliente.
- `fusionarChatsGuardados` descarta toda copia con `updatedAt` anterior o igual al
  borrado y deja pasar la re-archivada posterior (borrar y volver a guardar funciona).
- `combinarInstantaneaPersistencia` aplica las lápidas y las devuelve, para que el
  servidor las escriba en disco en vez de absorberlas.
- `archivarSinDuplicar` (`src/utils/chatStorage.ts`): reutiliza el chat si la firma
  del hilo ya existe; abrir el mismo chat no crea copia nueva.
- `LS_KEYS.CHATS_ELIMINADOS` (`codigo0_chats_eliminados`) y cableado en `App.tsx`
  (borrado, apertura, hidratación y POST de guardado).
- `tests/persistenciaHibrida.test.ts`: 6 comprobaciones nuevas (23 correctas · 0 fallidas).

Ninguna comprobación borrada, ningún techo subido.

## v1.0.43 - Los ocho bloqueos de `npm run dist`, cerrados

Se corrigieron los ocho puntos que cortaban el empaquetado de Windows (archivado de
la base, claves, artefactos y cadena de build) hasta dejar `npm run dist` completo.

## v1.0.42 - Los siete rojos del veredicto 12751, cerrados por causa raíz

Entrega de corrección sobre la 1.0.41. No se subió ningún techo ni se borró
ninguna comprobación: cada rojo se cerró donde nacía.

### Lo que cambia

1. **`motorDatos` — la guarda de Vite volvió al archivo que Vite lee de verdad.**
   `cerebroNodeGuard` vivía sólo en `vite.config.ts.cn-original`; el
   `vite.config.ts` activo era el de AI Studio, sin guarda. La regla seguía en la
   semilla pero el build ya no la hacía cumplir. Se restauró el plugin en el
   archivo activo (misma lógica: `fs`/`path`/`child_process`/`node:*` de `src/`
   no llegan al bundle del navegador).
2. **`interfaz` — el aviso de preview en blanco depende del estado medido, literal.**
   La condición era `(sbEstado !== "vivo" || esNavegadorRemoto)`; el caso
   «navegador remoto con sandbox vivo» se sacó a su propio bloque, así la franja
   del preview responde exactamente a `sbEstado !== "vivo"` sin excepciones
   escondidas en la misma expresión. Comportamiento idéntico.
3. **`techoContexto` — el AVISO honesto del BAT.**
   El lanzador documentaba las tres variables de concurrencia pero no decía que
   un motor ya abierto NO las recibe. Se añadió el bloque `AVISO HONESTO`
   (`NO le llegaron` / `sali de la app`) y un `echo` visible antes de abrir la
   ventana de Ollama. BAT en ASCII puro y CRLF intacto.
4. **`presupuestoHuerfanos` — `kbAutomejora` dejó de ser huérfano.**
   El pack de automejora (14 reglas, v1.0.42) estaba escrito y en verde sin
   consumidor. Entra en `SEMILLA_COMPLETA`, junto a `KB_CODIGO`, así que también
   sobrevive a la recarga desde disco. Huérfanos: 33 → 32, sin tocar el techo.
5. **`persistenciaHibrida` — la aserción de libuv al cerrar.**
   El `process.exit(0)` del final mataba el bucle mientras libuv cerraba los
   sockets keep-alive de `fetch`; en Windows eso dispara
   `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94`.
   El proceso moría con los 17 ✓ ya impresos y sin resumen, y el ritual lo leía
   como «suite no ejecutada». Ahora se sale por `process.exitCode` y el bucle
   drena solo.

### Validación

Reproducidas una por una: `motor-datos` 96·0, `interfaz` 64·0, `techoContexto`
115·0, `presupuestoHuerfanos` 137·0, `persistenciaHibrida` 17·0 con salida 0.
Barrido de las suites que leen `vite.config.ts`, el `.bat` y la semilla:
`arbol` 99·0, `arranqueVentanas` 27·0, `lanzadorEtiquetas` 32·0,
`lanzadorRepliegue` 27·0, `sincroniaGraciaArranque` 16·0, `techoContexto` 115·0,
`motor-estructura` 41·0, `espejo` 66·0, `devSinVite` 8·0, `resiliencia` 38·0.

## v1.0.41 - Gemini 4 por defecto, RAG/TTS con clave del servidor y persistencia híbrida

Evolución operativa para que CerebróNico IDE funcione de punta a punta en el
entorno web manteniendo compatibilidad íntegra con el flujo de PC local (`:3500`):

### Lo que cambia

1. **Autoarranque con Gemini 4 usando clave del servidor (`GEMINI_API_KEY`):**
   `/api/system/stats` informa `geminiServidorDisponible` de forma booleana sin
   exponer jamás el secreto al cliente. Cuando no hay proveedor explícito previo,
   el frontend detecta el catálogo vivo y selecciona `gemini-4-hydrogen`
   automáticamente; los sondeos y el enjambre ecléctico reconocen Gemini desde
   el servidor aunque no haya clave escrita en `localStorage`.
2. **RAG Vectorial y Voz TTS desbloqueados en servidor:**
   - `LocalRAG` (`src/engine/localRAG.ts`) añade respaldo con
     `gemini-embedding-001` / `gemini-embedding-2-preview` / `text-embedding-004`
     cuando Ollama local no responde, antes de caer a `hash-256`.
   - `ttsConfig`, `TtsSelector` y `ChatCenter` desbloquean las voces Gemini TTS
     en cuanto `geminiServidorDisponible` está activo.
   - `imageGen.ts` incorpora `gemini-3.1-flash-lite-image` y
     `gemini-3.1-flash-image-preview` manteniendo `gemini-3.1-flash-image` en
     primera posición.
3. **Persistencia híbrida servidor + navegador (`persistenciaHibrida.ts`, `server/routers/persistencia.ts`):**
   Sincronización determinista (merge sin pérdidas) de `savedChats`,
   `lessons`, `turnMetrics` y `workspacePrevio` en
   `<raizDatos>/.cerebro-db/persistencia-sesion.json` con escritura atómica,
   saneamiento de secretos (`.env`, `.key`, `.pem`), cuarentena ante JSON
   corrupto y respeto estricto de `arranqueLimpio`.
4. **Honestidad de entorno remoto en `:3500`:**
   `DedicatedWebEditorView` y `RightSidebar` mantienen `localhost:3500` para PC
   local y explican con claridad desde navegador remoto qué corre local y qué
   funciona en línea (edición, validación y exportación `.zip`/`.cn`).

### Validación

Suite `persistenciaHibrida` registrada en `scripts/validar.mjs`, superficie de
rutas regenerada, deriva documental sincronizada a `1.0.41` y verificación
completa en vivo sobre el puerto `3000`.

## v1.0.40 - Soporte Gemini 4, ZIP multivolumen e inspector de contexto en vivo

Evolucion integral de CerebróNico IDE tras el desempaquetado desde los 4
volumenes divididos:

### Lo que cambia

1. **Familia Gemini 4 y Gemini 3.1 Flash Lite:** Soporte nativo para
   `gemini-4-hydrogen` (modelo por defecto), `gemini-4-neon`, `gemini-4-carbon`,
   `gemini-4-argon` y `gemini-3.1-flash-lite` en el motor, servidor, fusible y
   selector de modelos. Configuracion compatible con `@google/genai`: cabecera
   `User-Agent: aistudio-build`, `thinkingConfig.thinkingLevel` seguro (sin
   `MINIMAL` en Gemini 4) y omision de `temperature` fija en modelos 4.x.
2. **Ensamblaje nativo de archivos ZIP divididos (`src/utils/multipartZip.ts`):**
   Al adjuntar fragmentos al chat o al explorador (`-parte01-de-04.bin`,
   `.zip.001`, `.part01.bin`, `.001`), la IDE los agrupa, ordena y une en un
   `.zip` valido antes de extraerlo sin bloquear los fragmentos `.bin`. Advierte
   cuando faltan partes o hay duplicados.
3. **Inspector de presion de contexto en vivo (`src/engine/contextTelemetry.ts`):**
   Indicador en la barra superior (`% ctx`) enlazado a la pestana de
   Autosuperacion con desglose honesto (sistema, workspace y mensajes), barras
   de umbral (45% / 65% / 80%) y boton **Compactar historial** que resume turnos
   antiguos preservando los ultimos 8 y las rutas mencionadas.
4. **Compatibilidad TypeScript 7 y PDF.js:** Ajuste de tipado en
   `attachmentProcessor.ts` (`doc.destroy`) y alineacion de `moduleResolution:
   "bundler"` en la base de conocimiento y pruebas.

### Validacion

Suites nuevas `multipartZip` y `contextTelemetry` registradas en `validar.mjs`,
deriva documental sincronizada a `1.0.40` y contrato de rutas intacto.

## v1.0.39 - El lanzador se cerraba solo: dos etiquetas que no existian

No era lentitud, ni un pack caido, ni Ollama. **El archivo se moria en la
linea 137**, antes de arrancar nada:

```
if %errorlevel% equ 0 goto :ollama_arriba
goto :ollama_arrancar
```

Ninguna de esas dos etiquetas estaba escrita. cmd no avisa con un error de
sintaxis: imprime "No se puede encontrar la etiqueta de lote especificada" y
**aborta el archivo en ese punto**. El `pause` del final nunca se alcanzaba,
asi que la ventana se cerraba sola con el aspecto de "arranco y se cerro".
Pasaba siempre, con Ollama arriba o abajo. Con la 1.0.9 abria porque esa
rama era otra.

### Lo que se arregla

1. **Las dos ramas existen.** `:ollama_arriba` (ya estaba escuchando: no se
duplica) y `:ollama_arrancar` (ventana minimizada con `cmd /k`). La primera
salta directo al inventario de modelos; la segunda arranca y espera su
escucha.
2. **`if ... set A & set B` deja de mentir.** El `&` corta la linea: `set B`
corria siempre, aunque el `if` fuera falso. Con `dist/` ausente el log
imprimia "npm run dev:sin-vite" mientras abria `npm run dev`. Ahora cada
rama va en su linea, sin `&`.
3. **`echo - Lanzado: %TIME%>>`** - un `2>>` pegado a la hora convertia el
renglon en una redireccion de error y el parte quedaba vacio. Un espacio de
diferencia.

### La valla

`tests/lanzadorEtiquetas.test.ts` lee el `.bat` como fuente y lo bate contra
lo que cmd exige: **todo `goto :x` y todo `call :x` con su etiqueta escrita**
(las dos rotas se nombran aparte, para que el rojo diga cual falta), ningun
`if ... set A ' + AMP + ' set B`, `pause` real y sin `<nul`, CRLF en todas
las lineas, sin BOM y sin tildes, la gracia de 90 s compartida con el
supervisor, las tres ramas de apertura con su repliegue unico, y los siete
puertos medidos con ancla exacta. **32 correctas - 0 fallidas.**

### Validacion

`lanzadorEtiquetas` 32-0 - `sondaUnica` 43-0 - `arranqueVentanas` 27-0 -
`indicadorServicios` 36-0 - `derivaDocumental` 38-0 (version alineada).

## v1.0.38 — Una sola petición acaparaba las seis conexiones del navegador

El log del arranque de la 1.0.37 lo dice sin interpretación posible:

```
[estabilidad] /api sin respuesta en 45000 ms: GET /api/telemetry/ports
[supervisor] «memoria» (:5100) no contesta a tiempo pero el puerto tiene dueño
[supervisor] «motor» (:5103) no contesta a tiempo pero el puerto tiene dueño
```

Y en pantalla, a la vez: `:3000 OK`, `:11434 OK`, los tres packs ARRIBA en el
lanzador… y la cabecera diciendo «⚠ servidor local caído», los puertos en OFF y
los modelos sin cargar.

### 1 · El dueño de la medición esperaba los 35 s de Ollama (la causa)

`/api/telemetry/ports` se toma una vez por proceso, y **el primero que llega es
el dueño: esperaba la medición entera**. Con 19 modelos, Ollama tarda 35 s en
`/api/tags`, así que esa única petición tenía la conexión tomada 35-45 s.

El navegador abre **seis** conexiones por origen y el panel pide la telemetría
cada 10 s. A los pocos segundos las seis estaban ocupadas por sondeos. Detrás
de ellas quedaron esperando:

- el **latido** (2,8 s) → la cabecera escribe «servidor local caído» con el
  servidor contestando su propio puerto;
- el **catálogo de los modelos con clave** (8 s) → vence sin respuesta y la
  pantalla se queda sin modelos, sin motivo visible;
- los **sondeos del supervisor** (8 s) → «no contesta a tiempo pero el puerto
  tiene dueño», que es la frase que él mismo imprime cuando no lo alcanza.

Un solo defecto, cinco síntomas distintos.

### 2 · Qué cambia

El dueño también tiene techo: **2 s**. Si la medición no llegó, la petición
contesta con la última lectura (marcada como heredada, con su edad) y **la
medición sigue en segundo plano** hasta dejar la muestra lista para el siguiente
pedido. Nadie cancela nada: se deja de acaparar la conexión.

Los dos plazos (el del dueño y el del que llega tarde) quedan **por debajo de
los 2,8 s del latido**, que es la condición para que el remedio no repita la
enfermedad. Lo vigila la suite: si alguien los sube, hay rojo con el número.

### 3 · Los diez minutos de apertura

El log también lo dice: `Abriendo CON Vite en el proceso - no hay cliente
compilado en dist\`. Sin `dist/`, cada módulo del frente se transpila al primer
pedido. **Una sola vez:** `npm run build`. A partir de ahí el lanzador toma
`npm run start` (server y cliente ya compilados) y abre en segundos.

### 4 · Validación

`sondaUnica` 43 correctas · 0 fallidas (incluye la prueba nueva del techo del
dueño: suelta en 2 s, contesta heredada y la medición sigue en vuelo);
`telemetriaHonest` 19·0; y las vallas vecinas de arranque en verde.

## v1.0.37 — Los modelos con clave no cargaban porque el catálogo tenía fusibles de chat

Corrección del usuario sobre la 1.0.36: «pero yo no estoy hablando de ollama,
los que no cargan son los de api key». La ventana del motor no era la queja. El
camino de los modelos con clave (Cerebras, Mistral, Together, DeepSeek, Fireworks)
está **idéntico byte por byte** al de la v1.0.9 que sí cargaba: la misma función
que pide el catálogo en el front, el mismo modal de selección, las mismas claves
guardadas y los mismos topes en el navegador. La diferencia no estaba en el
catálogo: estaba en **por dónde pasaba**.

### 1 · El catálogo pasaba por los fusibles de la generación (la causa)

Del lado del servidor, `/api/cloud/models` pide la lista con el mismo guardián
que un turno de chat. Y ese guardián cobra peaje **antes** de gastar un byte:

- `puedeLlamar(anfitrión)`: si el proveedor dijo «vuelve en X» (un 429, un
  `retry-after`), la petición no sale;
- `guardiaDeCuarentena(modelo)`: si hubo fallos recientes, la petición no sale.

Y cobra también **al volver**: un listado que tarda o falla registra fallo del
anfitrión y abre cuarentena de 15 minutos (30 al reincidir), y un 429 en la lista
deja al anfitrión en espera durante lo que declaró el proveedor.

Con eso, el primer `/models` lento o rechazado enganchaba al proveedor. El
usuario veía «no cargaron los modelos», apretaba de nuevo —que es exactamente lo
que hace— y ese reintento se comía el aviso de cuarentena **sin tocar la red**.
Así hasta media hora, y reiniciar era la única salida. En la v1.0.9 no había
fusibles en ese camino, y por eso cargaba.

### 2 · Qué cambia (una marca, no un camino nuevo)

`fetchCloud` acepta `catalogo: true`. Con esa marca la petición **sigue teniendo
techo de tiempo**, pero no consulta fusibles ni los alimenta: no espera cuota, no
respeta cuarentena, no la abre, y no mide el listado como si fuera un turno. Los
cinco catálogos del router la llevan. La generación no cambió ni un pelo: los
mismos fallos de un chat siguen abriendo la misma cuarentena.

### 3 · El navegador se rendía al mismo tiempo que el servidor

Los dos plazos del catálogo eran **8000 ms**. Cuando el proveedor tardaba, la
interfaz cortaba en el mismo instante que el backend: el catálogo estático con su
motivo («la clave viajó y fue rechazada») llegaba a un socket ya cerrado y la
pantalla no explicaba nada. Ahora el navegador espera **12 000 ms** contra los
8 000 del servidor: primero contesta él, después se rinde la interfaz. Y ese
motivo ahora se lee.

### 4 · Validación

Suite nueva `catalogoSinFusibles` (8 pruebas de comportamiento con la red
simulada): dos catálogos caídos seguidos llegan **los dos** a la red y ninguno
abre cuarentena; un 429 del listado no bloquea la generación; el fusible sigue
intacto cuando la petición no es catálogo; y el techo de tiempo sigue cortando.
Las vallas de catálogo (`catalogoNoCuelga`, `catalogoNube`, `presupuestoConn`,
`unificadaCarga`) siguen en verde.

## v1.0.36 — El motor que moría con la consola del lanzador

El usuario trajo una versión vieja (v1.0.9) con una frase: «fíjate en esta
versión, los puentes funcionan bien y los modelos cargan». Comparado el lanzador
de las dos versiones línea por línea, el arranque de packs, los puertos, los
tiempos de espera y los dos puentes de Python (`agent_bridge_5000.py`,
`arranque_puente.bat`) son **idénticos byte por byte**. La única diferencia
funcional en todo el arranque es **cómo nace Ollama**. Ahí estaba el defecto.

### 1 · Ollama nacía pegado a la consola del lanzador (la causa)

v1.0.9 arrancaba el motor en **su propia ventana minimizada**:

```
start "Ollama Engine - Puerto 11434" /min /d "%~dp0" cmd /k "set OLLAMA_... && ollama serve 1>> log 2>&1"
```

Una versión posterior lo pasó a `start "" /b ... cmd /c`, «para no abrir
ventanas». `/b` **no** despega al hijo: lo deja colgado de esa consola. Y esa
consola **es la del servidor**, porque el lanzador abre la IDE en primer plano
con `call npm run start` / `npm run dev`. Consecuencia medible:

- un `Ctrl+C` en la consola del lanzador (lo normal para cortar el server) llega
  a **todo el grupo**, y se lleva Ollama por delante;
- lo mismo un cierre de ventana o cualquier corte del server.

Resultado: el `.bat` imprimía «Ollama listo en :11434», la IDE abría, y a los
segundos **no había motor**. Sin motor no hay modelos que cargar y el puente al
`:11434` contesta `ECONNREFUSED`: exactamente «los modelos no cargan» y «los
puentes no andan».

- El motor vuelve a nacer en su propia ventana **minimizada** con `cmd /k`
  (sobrevive al cierre del lanzador), con las seis variables **dentro del hijo**
  —las lee al nacer y solo entonces— y su salida a `logs\ollama.log`.
- Sigue habiendo **un solo dueño**: la rama que ya encontró `:11434` escuchando
  no arranca nada, y el supervisor no reanima si el puerto tiene dueño (v1.0.35).
  La ventana es una, minimizada y con título fijo; las «ventanas de CMD que se
  abrían y cerraban solas» eran los **segundos** `ollama serve` del supervisor.
- La gracia de 90 s del arranque no se toca.

### 2 · Lo que la suite vigila desde ahora

- `arranquePuertos`: la línea del motor debe abrir **ventana propia**
  (`start "Ollama Engine - Puerto 11434" /min ... cmd /k`), **sin `/b`**, con las
  seis variables dentro del hijo y la salida al log.
- `arranqueVentanas`: se añade la **prueba** de por qué no puede ser `/b` — el
  server corre en primer plano en esa misma consola (`call npm run ...`), así que
  un hijo `/b` comparte grupo de control con él.
- `sincroniaGraciaArranque`: el dueño único se cuenta por líneas de `start`, ya
  no por la forma `/b`.

Nada más cambia: ni packs, ni puertos, ni puentes, ni la gracia, ni el servidor.

## v1.0.35 — El sondeo que tumbaba al servidor que venía a informar

Del log de v1.0.34 en Windows: CPU al 100 %, «servidor local caído», el panel de
puertos entero en OFF y, en el mismo log, el servidor contestando.

```
[estabilidad] /api sin respuesta en 45000 ms: GET /api/telemetry/ports
[supervisor] «memoria» (:5100) no contesta → reanimo, intento 1 de 3
[supervisor] «motor»  (:5103) no contesta → reanimo, intento 2 de 3
```

### 1 · `/api/telemetry/ports` no tenía vuelo único (la causa del atasco)

Cada petición que encontraba la caché vencida abría **su propio** juego de seis
sondas, y una de ellas es `/api/tags` de Ollama con **35 s** de plazo (deliberado:
un modelo cargando tarda 28 s). El panel pide cada 10 s y la muestra puede tardar
30 s, así que a los 30 s había **tres juegos apilados** — dieciocho sondas contra
un Ollama ya al 100 % de CPU. El sondeo era la causa del atasco que informaba, y
como todos tardaban más que el plazo del `/api`, el vigilante anotaba «sin
respuesta» con el servidor contestando.

- Nuevo módulo puro `src/engine/sondaUnica.ts`: si hay muestra vigente se sirve;
  si no hay medición en vuelo, el que llega la arranca y espera el presupuesto;
  si **ya** hay una en vuelo, el que llega **no abre otra** — espera 6 s y, si no
  llegó, contesta con la última lectura **marcada como heredada**
  (`heredadaPorSondeoEnCurso` + `motivoMuestra` con su edad). Nunca se queda
  colgado; nunca duplica el sondeo. Un sondeo que estalla no deja la puerta
  cerrada: la siguiente petición vuelve a medir.
- Medido en la suite, contra la ruta real: **tres peticiones simultáneas = seis
  sondas, no dieciocho**, y la cuarta sale de la caché sin tocar el puerto.
- El catálogo de modelos ya no se convierte en «0 modelos» cuando la sonda de
  Ollama no llega: se hereda el último número conocido.
- El temporizador del presupuesto se apaga al terminar las sondas (antes cada
  muestra dejaba un reloj de 30 s vivo).

### 2 · El supervisor abría un SEGUNDO dueño de un puerto que ya estaba arriba

`memoria` (:5100) y `motor` (:5103) estaban **arriba** — el lanzador los había
levantado — pero con la CPU tomada no aceptaban la conexión en los 3 s del
sondeo. El supervisor leía «no contesta» como «caído» y lanzaba otro proceso en
el mismo puerto: el segundo choca, muere, y mientras tanto come CPU y RAM. Eso
es el «reanimo 1 y 2 de 3» del log.

- Antes de reanimar se pregunta **quién escucha** ese puerto (`netstat -ano` /
  `ss`), que es la única pregunta que autoriza un segundo dueño. Si hay dueño: se
  anota `escucha en :5100 pero no contestó en 3 s: hay dueño, no abro un segundo`,
  se pinta vivo (hay alguien) y **no se gasta intento**.
- Un puerto **libre** se sigue reanimando igual que antes: el guardián no
  paraliza al supervisor.

### 3 · Lo que NO es un fallo (para no perseguir fantasmas)

- `[mcp] context7: comando no encontrado «npx»` es cosmético: ese pack no tiene
  `npx` en el PATH y sus herramientas simplemente no se ofrecen.
- `[ficha] … se descarta en vez de estallar` es la ficha funcionando: la muestra
  llegó después del 504 y se descarta la segunda escritura.
- `[APAGADO] :3000 IDE - la levanta este mismo lanzador` es el orden del arranque,
  no un puerto caído.

Suite nueva `tests/sondaUnica.test.ts` (36 comprobaciones), registrada en el
ritual. Nada se da por bueno hasta el veredicto en Windows.

## v1.0.34 — El import que un comentario se comía, y la clave que se callaba

Dos cosas del veredicto de v1.0.33 y de la prueba con clave de pago (DeepSeek).

### 1 · `TS2304: Cannot find name 'evaluarCercoDeAlcance'` (el fallo del veredicto)

El nombre no faltaba: el `import` **estaba escrito**, en la misma línea que un
comentario de cola, y `//` se come todo lo que queda a su derecha:

```
…from "./src/engine/ordenDelPrompt"; // v1.0.29 · … import { evaluarCercoDeAlcance } from …
```

El archivo se lee bien, las vallas de texto que buscan el nombre lo encuentran,
`tsc` no lo ve y el motor arranca con la función sin definir. El `import` vuelve
a su sitio viva, y una suite nueva (`tests/importsVivos.test.ts`) recorre el
monolito, `server/` y `src/` y denuncia **cualquier** import que viva después de
un `; //`: el defecto no puede volver a colarse en otro archivo.

### 2 · La clave rechazada ya no se calla (DeepSeek)

«Puse la clave de un modelo pago y ni cargaron los modelos.» El backend pedía
`/models` al proveedor y, cuando la clave **no** era aceptada, devolvía **HTTP
200** con los 3 modelos estáticos y sin una palabra de motivo; la interfaz
escribía «3 modelos detectados». No había forma de saber que la clave había
viajado y había sido rechazada.

- Nuevo módulo puro `src/engine/catalogoNube.ts`: `limpiarClave` (quita `Bearer`,
  comillas, saltos de línea y espacios del copiar-pegar — un `\n` al final daba
  401 con la clave perfecta) y `diagnosticoCatalogo`, que traduce el resultado a
  una frase con **culpable**: 401/403 clave rechazada · 402 sin saldo · 429
  límite · 5xx proveedor caído (no es tu clave) · sin respuesta con los segundos
  del plazo · 200 sin lista = formato. Nunca incluye la clave.
- `/api/cloud/models` devuelve ahora `motivo` junto al catálogo guardado (que
  sigue viajando: la lista nunca se vacía) y pide el catálogo con el plazo de
  catálogo, no con el de generación. La interfaz muestra ese motivo en el aviso
  y en la terminal.
- Suite nueva `tests/catalogoNube.test.ts` (30 comprobaciones).

### Sobre los «700 modelos»

No hay ningún tope de 100 en el motor. Esa lista grande sale del catálogo **en
vivo** de OpenRouter, que se pide a su web: si esa petición no llega (red,
plazo, proveedor lento), el selector se queda solo con los catálogos guardados y
la cifra baja de golpe. Con este cambio, cuando eso pase, la línea dirá cuál de
los dos casos fue.

### Lo que **no** entra

Siguen fuera, como estaban: P1c y P3–P5.

---

## v1.0.33 — El turno que no cabe se dice, no se manda

Diagnóstico sobre la sesión real del 19/11 (glm-4.5-flash, «los modelos no cargan»):
el chat se quedaba mudo sin una sola línea que lo explicase. Dos causas, ninguna
cosmética.

### 1 · La cuenta del historial ignoraba el prompt de sistema (causa del silencio)

El último mensaje de la sesión es del proveedor, no del motor:
«Prompt exceeds max length» (Z.ai, código 1261). El log del mismo turno muestra el
contrato de acción a **9.325 caracteres** (presupuesto 9.360), el índice a 20.545 y
**111 herramientas** en el catálogo (46 con manual + 65 con descripción), más cerebro,
conciencia del turno, directriz y rutas de obra.

La cuenta del historial, en cambio, hacía `Math.max(1500, presupuesto − resumen)`:
descontaba el resumen y **daba el prompt de sistema por gratis**. Con 9,3 k de sistema
y 111 esquemas, el turno se pasaba del tope del proveedor y volvía error; la interfaz
solo mostraba un chat que no contesta.

- Nuevo módulo puro `src/engine/techoDelPrompt.ts`: `techoDeHistorial({presupuesto,
  sistema, resumen})` = `max(suelo, presupuesto − sistema − resumen − salida)`, con
  suelo de 1.500 caracteres para no dejar el turno sin hilo y sin NaN con entradas raras.
- `server.ts` le pasa el tamaño **medido** del prompt de sistema
  (`consolidatedSystemInstruction.length`), no una constante. La resta vieja ya no existe.
- `veredictoTecho({presupuesto, sistema, historial, esquemas})` devuelve `cabe`, `sobra`
  y un aviso **con números**; cuando el turno no entra, queda una línea en consola del
  tipo «sistema 9325 + historial … = … contra un presupuesto de …». Un turno rechazado
  por tamaño deja de ser invisible.
- Suite nueva `tests/techoDelPrompt.test.ts` (19 comprobaciones), registrada en el censo.

### 2 · `/api/fs/read` escribía dos veces la misma respuesta

Si la lectura de un archivo se pasaba del plazo, el plazo ya había contestado 504 y la
ruta seguía y volvía a escribir: `ERR_HTTP_HEADERS_SENT` en el servidor y, en la
interfaz, el efecto en cascada que Mario vio como servidor caído y «MUESTRA PARCIAL».
Ambos caminos (éxito y error) pasan ahora por la guarda `puedeContestar(res)`, la misma
que ya usaban las rutas de streaming.

### Lo que **no** entra en esta entrega

Siguen fuera, como estaban: P1c y P3–P5 del plan de evolución. Este parche es el
diagnóstico de la sesión, nada más.

---

## v1.0.32 — La valla del contrato deja de tener un número que envejece

Único cambio: el rojo de `contratoAccion` que v1.0.31 dejó declarado.

- **`tests/contratoAccion.test.ts`**: la suite pedía el inventario completo a un
  presupuesto **literal de 6000**, número que era correcto cuando había 30
  manuales. P1a añadió 16 (46 en total), el inventario completo pasó a costar
  ~7.642 caracteres y el literal se puso rojo. **El defecto no estaba en el
  inventario ni en el contrato: estaba en el número**, que nadie ató a la lista
  de herramientas.
- La valla ahora se ancla a lo que el motor **calcula**: para un modelo grande
  `presupuestoAbordaje` deriva **11.593** caracteres y para la nube rápida
  **8.136** — con los dos entran las 46 y no hay recorte, así que el turno real
  nunca truncaba el catálogo.
- Se conserva lo que protegía el número viejo, y más explícito: con un
  presupuesto corto (6.000) el recorte tiene que **declararse** con su cuenta
  («inventario recortado: N de 46»), nunca perderse en silencio; y se comprueba
  que el presupuesto derivado **crece con el catálogo**, para que un 47.º manual
  no vuelva a dejar la valla muda. 59 comprobaciones en verde.

---

## v1.0.31 — El banco que mide, los 16 manuales que faltaban y la caché que no se rompe

Los tres parches que la revisión de «Súper Evolución CerebróNico (v1.0.30 → v1.1.0)»
dejó abiertos, más la corrección del catálogo. **Nada de lo que estaba en verde se
tocó de forma sustractiva**: todo son añadidos y cuatro suites nuevas.

### P0 · El banco de elección de herramientas (medible, no opinable)

- **`src/engine/bancoHerramientas.ts`** (nuevo, puro): evalúa un banco de casos
  contra los turnos medidos. La métrica que decide es el **acierto@1 CONDICIONAL a
  visibilidad**: si la herramienta correcta no estaba en el catálogo de ese turno,
  el caso es **imposible** y se cuenta aparte — el absoluto se informa al lado,
  nunca solo. Un banco que suma los imposibles hunde el número y hace tomar la
  decisión contraria a la correcta.
- Cuenta las llamadas emitidas **en texto** (`parsearLlamadasDeTexto`: bloque
  ```` ```cerebronico: ````, nombre+JSON, `<tool_call>`, objeto JSON suelto,
  `<function=x>`), porque un 7B sin function-calling sale como «no eligió» aunque
  haya escrito la llamada. Un nombre inventado se informa aparte. El turno que no
  respondió es disponibilidad, no elección. Suma tokens y TTFT mediana.
- **`tests/fixtures/banco-herramientas.json`** (nuevo): 47 casos en 12 categorías
  (plan, lectura, edición, ejecución, git, PC, sistema, red, memoria, documentos,
  datos, vista), todos contra nombres REALES del registro.
- **`scripts/banco-herramientas.ts`** (nuevo): valida el banco, informa la
  visibilidad por perfil (con el hueso de obra, 35 de 47 casos son imposibles y se
  declaran) y mide desde un JSONL. Sin transcripción **no inventa números**.

### P1a · Los 16 manuales que faltaban

- **`src/engine/manuals.ts`**: el registro tenía 46 herramientas y `TOOL_MANUALS`
  30. Las 16 sin ficha (`pc_write_file`, `pc_list_dir`, `pc_delete`, `git_diff`,
  `git_commit`, `convertir_formato`, `ollama_estado`, `ollama_expulsar`,
  `recursos_maquina`, `cerebro_recordar`, `cerebro_consultar` y las cinco
  `terminal_*`) no se nombraban nunca. Derivadas de los **esquemas reales**, no de
  la prosa de la propuesta.
- Cuatro contradicciones eliminadas: XML que el motor no usa, escritura «a disco»
  dentro de un sandbox, memoria «de corto plazo» para la tabla de largo plazo y un
  «no exige tests verdes» que contradecía la ley del veredicto.

### P2 · La caché de esquemas MCP que no puede corromperse a sí misma

- **`src/engine/cacheEsquemasMcp.ts`**: escritura **atómica** (temporal en el mismo
  directorio con pid+aleatorio y renombrado con reintentos), lo corrupto se aparta
  como `.corrupto-<pid>-<ts>.json` en vez de borrarse, formato **v2** (envoltorio
  con versión y servidores) que **sigue leyendo el mapa plano v1**, TTL con entorno
  inyectado y rechazo de entradas truncadas (nunca servir definiciones a medias).
- **`src/engine/packsMcp.ts`**: usa esa capa (respaldo previo, guardado atómico,
  TTL del entorno).

### Catálogo

- **`HERRAMIENTAS-PUENTE.md`**: decía 104 y había 105 (faltaba `abrir_red`). Ahora
  dice 105, tiene las 105 filas y lleva el aviso de que **la fuente es el registro**.
  `scripts/catalogo-herramientas.ts` hace el censo y una suite lo vigila.

### Suites nuevas

`manualesCobertura` · `cacheEsquemasV2` · `bancoHerramientas` ·
`catalogoHerramientas`, registradas en `npm run validar`.

### Lo que esta versión NO trae (dicho sin disimulo)

- **P1c** (cuotas por turno y congelado de sesión) **no está**.
- **P3, P4 y P5** de la propuesta **no están**.

---

## v1.0.30 — El arranque perezoso de MCP (caché de definiciones) y el prefijo que no cambia

Los dos puntos que quedaron abiertos de la propuesta «Evolución CerebróNico», con
las dos trampas que la propuesta no veía ya resueltas.

### 1 · v1.0.29 · El prefijo del prompt y la compactación por presión

- **`src/engine/ordenDelPrompt.ts`** (nuevo, puro): los bloques del prompt se
  ORDENAN por estabilidad (fijo → sesión → turno → volátil) y `prefijoEstable`
  mide cuántos caracteres iniciales no van a cambiar entre turnos. `compararPrefijos`
  solo puede declarar rotura DENTRO de ese prefijo; si el cambio cae en la parte
  volátil, no hay rotura que culpar. La compactación se decide por **presión medida**
  (65 % / 80 %) conservando los últimos 3 turnos, no por número de turnos.
- **Cableado en `server.ts`**: `prepararSistemaParaCache` (la operación completa)
  se llama en el ÚNICO punto donde se arma el prompt de sistema, antes de «2.5
  ACCIONES RÁPIDAS». La lógica vive en el módulo, no en el monolito: la primera
  versión del cable metía el corte de la fecha y la nota dentro de `server.ts`
  (+45 líneas contra el trinquete) y se sacó a una función de 6 líneas de llamada.
- **`abrir_red`** devuelve resultado por página (`paginas_pedidas`, `leidas`,
  `caidas`, `busqueda`), `ok` solo si se leyó algo o hubo búsqueda, y una pista
  «red del equipo» cuando todo cae.

### 2 · v1.0.30 · MCP perezoso, con memoria en disco

- **`src/engine/cacheEsquemasMcp.ts`** (nuevo): huella sha256 de la configuración
  (comando + argumentos + **nombres** de variables de entorno con una huella corta
  del valor, nunca el valor), TTL de 14 días para las definiciones, 60 s de
  inactividad para cerrar el proceso, y `sanitizar` que tapa `sk-…`/`ghp-…` antes
  de escribir a disco. Un archivo corrupto o sin permiso se ignora: se pierde la
  optimización, no el turno.
- **`src/engine/packsMcp.ts`**: si la caché coincide, el pack se declara **sin
  levantar proceso**; `asegurarServidorMcp` lo arranca en la primera llamada real
  con **un solo arranque compartido** (diez llamadas simultáneas = un proceso), y
  un comando que falla se dice con su motivo en vez de contestar con la caché.
- **`server.ts`**: el despacho MCP deja de contestar «ya no está vivo» y levanta
  a demanda. `cerrarTodosMcp` suelta además los relojes de inactividad.
- `server.ts` queda en **12280 líneas** (contrato regenerado con el generador:
  208 rutas). El literal de la suite se aprieta a 12280, no se deja en 12360.

### Suites nuevas

`ordenDelPrompt` (44 — 33 de la regla y 11 de la operación completa),
`ordenPromptCableado` (23), `cacheEsquemasMcp` (64) y `mcpPerezoso` (25, contra un
servidor MCP real por stdio). Las cuatro registradas en el ritual.

## v1.0.28 — MCP por stdio, Cloudflare en la ranura directa y una sola petición

- **Servidores MCP que de verdad arrancan** (`src/engine/clienteMcp.ts`, `src/engine/packsMcp.ts`): cliente JSON-RPC sobre stdio con `initialize`, `tools/list` y `tools/call`, timeouts y `taskkill /T` en Windows. Hasta 1.0.27 nadie leía `mcp_servers.json`.
- **Cloudflare (Workers AI) como ranura directa** (`src/engine/ranuraDirecta.ts`): ids `@cf/…` y ids pelados de Groq/Cerebras, con ventana de contexto y viaje de herramientas. Entra **apagado**.
- **Tres entradas de Cloudflare en `mcp_servers.json`** (`cloudflare_docs`, `cloudflare_browser`, `cloudflare_api`) con `enabled:false` y su nota. `web` y `context7` intactos: nada se borró.
- **`GET /api/tools/packs/estado` y `POST /api/mcp/recargar`** en `server/routers/estadoPacksMcp.ts`: se ve qué se cargó, qué falló, qué está apagado y qué se descartó.
- **Una sola petición por turno** (`src/engine/reformuladorConsultas.ts`): la reformulación se hace en local, no pidiéndosela al modelo.
- **`abrir_red`** en el pack web: abre varias URL en paralelo con guarda SSRF, plegando la consulta.
- `server.ts` queda en **12244 líneas** (contrato regenerado con el generador).

## v1.0.27 · 2026-11-18 · DOS ARREGLOS: EL BAT ESPERA LO MISMO QUE EL SUPERVISOR, Y «APAGADO A MANO» DEJA DE SER «CAÍDO»

Los dos pedidos de esta entrega, y nada más: los otros dos del diagnóstico
(coreo y ahogo del chat) **no** van en esta versión.

### 1 · Sincronizar el sondeo del BAT con la gracia del supervisor

Raíz medida. Tres dueños del mismo puerto, cada uno con su reloj:

| quién | paciencia en v1.0.26 |
|---|---|
| supervisor (`GRACIA_ARRANQUE_MS`, `src/engine/arranqueVentanas.ts`) | 90 s |
| `iniciar_todo_windows.bat`, sondeo de `:11434` (`WAIT_COUNT geq 20`) | **20 s** |
| `iniciar_todo_windows.bat`, sondeo de `:5103` (`MOTOR_WAIT geq 8`) | **8 s** |

Ollama en frío tarda ~50 s (124 blobs). Con 20 s el lanzador declaraba «no
respondió» un puerto que estaba **naciendo**; la IDE abría creyendo el `:11434`
muerto y, agotada la gracia del supervisor, aparecía un **segundo**
`ollama serve` sobre el mismo puerto. Ese era el «otro CMD de ollama» y el
`[supervisor] no contesta -> reanimo` repetido.

Arreglo: una sola paciencia, `GRACIA_ARRANQUE_S` (90, copiada de
`GRACIA_ARRANQUE_MS`, movible con `CN_GRACIA_ARRANQUE_S` sin recompilar), y los
dos bucles se rinden con ella. Rendirse ya **no** arranca un segundo dueño: el
aviso dice que el supervisor decide, con su motivo en el log. Progreso a los 15
y 45 s para que 90 s de espera no parezcan un cuelgue. El archivo sigue en CRLF
puro y sin bloques `( … )`.

### 2 · El indicador de servicios apagados

`describirServicio` mapeaba `interruptor === "apagado"` a `indicador: "abajo"`,
y «abajo» es el texto `OFF` con tono de falla: lo que Mario apagó a mano se
pintaba como si se hubiera caído. Y `reconexionDePuertos` partía los puertos en
`!p.vivo` y nada más, así que la hoja lo anunciaba «está abajo» con ⚠.

Arreglo, sin inventar un cuarto color (el contrato de `TEXTO_INDICADOR` sigue
siendo de tres claves): la orden se respeta y sigue mandando sobre la medición,
pero dice **«apagado a mano»**, con el mismo vocabulario que ya usaba
`razonLegible`. `LineaDePuerto` lleva el `interruptor`; `PlanificationPanel` lo
lee de `/api/arranque/interruptores` junto con los planes (apagar un servicio se
ve en la hoja sin recargar) y la hoja separa los dos casos: lo apagado a mano va
con marca `·`, tono neutro, «no se reanima solo», y **no** ofrece reconectar
(reconectar sería deshacerle la orden); lo caído sigue con ✗ y su fila. Se
añadió el `:5103` a la lista del panel para que los siete puertos se lean igual.

### Vallas

- Nueva `tests/sincroniaGraciaArranque.test.ts` (16): la gracia es un número que
  el `.bat` copia de `GRACIA_ARRANQUE_MS`, los dos topes son
  `%GRACIA_ARRANQUE_S%`, nadie se rinde antes, rendirse no deja segundo dueño,
  CRLF y sin paréntesis. Registrada en `scripts/validar.mjs`.
- `tests/indicadorServicios.test.ts` (36): se **añade** «apagado a mano» ≠ `OFF`
  y ≠ «no responde», y el cable (línea con interruptor → panel → hoja).
  Las 27 afirmaciones anteriores siguen intactas.
- `tests/hojaRutaFormatoChat.test.ts` (45): la regla «la hoja no pinta la tabla
  de interruptores» se **aprieta**, no se afloja: sigue prohibido `encender`/
  `apagar` y el rótulo de la tabla; se admite leer la posición de cada línea,
  que es lo que impide llamar «caído» a lo apagado a mano.
- Corridas verdes en esta entrega: indicadorServicios 36, sincroniaGraciaArranque
  16, hojaDeRuta 35, hojaRutaFormatoChat 45, planificacionPanel 33,
  unaListaDePuertos 13, interruptoresServicios 32, reavivarServicio 55,
  arranqueVentanas 25, puertosCableados 96, arranquePuertos 21,
  telemetriaHonest 19, androidProyecto 143.

**Lo que esta versión NO arregla (a pedido):** el plazo del latido del coreo y
el ahogo del socket del chat cuando hay muchas conexiones. Siguen en el
diagnóstico, fuera de esta entrega.

## v1.0.26 · 2026-11-17 · «HAY FALLOS»: EL MONOLITO, POR DEBAJO DE SU TECHO, Y LAS VALLAS DE VUELTA

**Qué pasó con la 1.0.24.** La cura del `ERR_HTTP_HEADERS_SENT` estaba bien, pero la
entrega volvió con veredicto «HAY FALLOS», y el fallo era de contabilidad, no de
lógica: `tests/androidProyecto.test.ts` exige que `server.ts` no pase de 12317
líneas y el archivo medía **12364**. Un parche de tres líneas dentro del monolito
lo empujó por encima del techo que la propia casa vigila.

**La regla es partir, no añadir (Fase 2).** Esta versión no sube el techo ni
regenera el contrato para tapar el número: **saca dos rutas enteras** a
`server/routers/` y deja en el monolito una línea de delegación por ruta.

| Ruta | Antes | Ahora |
|---|---|---|
| `/api/subagents` | cuerpo en `server.ts` (~6704) | `server/routers/subagentes.ts` |
| `/api/sandbox/status` | cuerpo en `server.ts` (~8182–8433) | `server/routers/estadoSandbox.ts` |

Con ellas viajaron sus ayudantes, no quedaron huérfanos:

- `subagentes.ts` recibe el puerto de la UI, el del puente y el `bridgeFetch` ya
  armado (con su plazo y su token) por parámetro. La ruta NO abre su propia
  conexión: usa la misma puerta que usaba antes.
- `estadoSandbox.ts` trae la aduana de proyecto (marcadores de `sandboxCompat`), la
  detección del proyecto anidado, la rama de web estática y el aviso de proyecto
  duplicado. Lo único que pide prestado es la raíz real (`resolverRaizProyecto`),
  el veredicto de `node_modules` sano y el sondeo de puerto con plazo.

**Resultado medido, no prometido.** `server.ts`: **12364 → 12097** líneas, y el
contrato regenerado declara **12098**. El techo del literal de la suite se
**aprieta** (sigue en 12317) a propósito: si esto vuelve a crecer, la suite tiene
que caer ahí y no esperar a que el contrato lo disimule.

**Vallas reformuladas al diseño nuevo, y más estrictas.** `tests/fichaUnica.test.ts`
ya no busca la ficha dentro del monolito: comprueba que cada módulo abra su ficha,
que el monolito delegue en los dos, que **no** recupere ninguno de los dos cuerpos,
y que ninguno de los dos módulos escriba por la puerta vieja (`res.json` crudo).
13·0 en verde. `androidProyecto` 143·0.

**Corrección de la 1.0.25 (cinco vallas en rojo).** La 1.0.25 sacó la ruta, pero dejó **cinco vallas de `tests/consola-voz.test.ts`
en rojo**: esas vallas leen el texto del monolito y el aviso de proyecto duplicado
se había ido con la ruta. No era el comportamiento, era la valla apuntando al
fichero equivocado. Se reformulan (no se borran) para leer también
`server/routers/estadoSandbox.ts`, y se ajustan las dos que citaban el nombre de
la constante de la raíz (`PROJECT_ROOT` → `RAIZ`, que es el alias del módulo).
Las cinco siguen exigiendo lo mismo: que el aviso exista, nombre las dos rutas,
diga cuál gana, dé las dos salidas y se dispare con proyecto en la raíz.

**Cómo comprobarlo en 30 segundos:** abrir `server.ts` y contar rutas de estado.
`/api/sandbox/status` y `/api/subagents` ya no están ahí; están en `server/routers/`
y el monolito solo las registra. El comportamiento visible —incluida la ficha que
evita el segundo `res.json()`— es el de la 1.0.24.

## v1.0.24 · 2026-11-17 · «SERVIDOR LOCAL CAÍDO» SOBRE UN SERVIDOR VIVO

**El síntoma.** A mitad de sesión el cartel «SERVIDOR LOCAL CAÍDO» aparecía con el
`:3000` contestando. El log de arranque dejaba cuatro trazas idénticas:

```
[estabilidad] /api sin respuesta en 20000 ms: GET /api/subagents
[estabilidad] /api sin respuesta en 20000 ms: GET /api/telemetry/ports
[estabilidad] /api sin respuesta en 20000 ms: GET /api/sandbox/status
[estabilidad] /api sin respuesta en 20000 ms: GET /api/system/stats
  → Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent
```

**Causa raíz.** El plazo de `/api` **contesta 504 pero no cancela el handler**. La
ruta terminaba su trabajo un segundo después y volvía a llamar `res.json()` sobre
el socket ya respondido: `ERR_HTTP_HEADERS_SENT` lanzado dentro de una promesa que
nadie espera (sale como `unhandledRejection`). El servidor sobrevive, pero el
navegador acumula 504 encadenados en cuatro rutas de estado y la pantalla declara
caído un proceso sano. Los detonantes de la lentitud: `/api/tags` de Ollama tarda
21-37 s con 19-40 modelos, el presupuesto de telemetría es de 30 s, `bridgeFetch`
espera 12 s mientras el puente `:5000` se reanima, y el sandbox mide el `:3500`.

1. **Una sola escritura por petición.** Nuevo `src/engine/fichaUnica.ts`:
   `abrirFicha(res, ruta)` entrega un `json()` de un solo uso; si el reloj llegó
   antes, `descartarSiTarde` cierra sin tocar el socket y lo anota con el nombre de
   la ruta. Es puro (`{ headersSent }`), así que se prueba sin levantar Express.
2. **Las cuatro rutas del log contestan por ficha.** `/api/subagents` y
   `/api/sandbox/status` en `server.ts`; `/api/telemetry/ports` y
   `/api/system/stats` en `server/routers/telemetria.ts`. La segunda escritura ya no
   es una excepción: es un no-op con nombre en el log.
3. **Ahogo no es caída.** `decidirCorte` en `plazoApi`: con 3 o más rutas colgadas
   a la vez no se contesta 504 — un proceso ocupado no es un proceso muerto. Se
   deja el socket vivo y se anota; la respuesta tardía se respeta.
4. **Plazos honestos.** `/api/subagents`, `/api/sandbox/status` y
   `/api/system/stats` entran en `RUTAS_LENTAS_POR_DISENO` con 45 s y su evidencia
   escrita, igual que `/api/telemetry/ports`. El comentario que anunciaba
   «presupuesto 12 s dentro de 20 s» se corrigió a la verdad (30 s / 45 s).

**Vallas.** Suite nueva `tests/fichaUnica.test.ts` (13 comprobaciones): la doble
escritura escribe UNA vez, el socket ya respondido descarta y anota, el corte es
504 con 1-2 colgadas y solo-anotar con 3, las cuatro rutas del log tienen plazo
propio con evidencia, y la fuente declara la ficha en las cuatro. Además
`tests/plazoApiStream.test.ts` se re-ancló a la guarda nueva (`puedeContestar`)
en vez de relajarse, y comprueba que sea la de la ficha y no una copia suelta.

## v1.0.23 · 2026-11-16 · LOS SERVICIOS LOCALES YA NO SE CAEN AL ARRANCAR

**El síntoma.** Los tres daemons (`:5100`, `:5102`, `:5103`) y el puente se
levantaban y morían a los segundos; el panel de servicios alternaba «en marcha» y
«caído». No era el `:3000` —ese nunca se cayó—: se caían los hijos reanimados.

**Causa raíz.** El reanimado arrancaba los procesos con `process.cwd()` y con
`shell: true`. El `cwd` del IDE empaquetado no es la raíz de instalación (un acceso
directo con «Iniciar en» vacío deja `System32`), así que `scripts\<x>.py` no
existía y el hijo moría con `ENOENT` en cada intento; y `shell: true` convertía
cualquier ruta con espacios en un error de shell que se tragaba el código real.

1. **Raíz de instalación fijada una sola vez.** Nuevo `src/engine/raizInstalacion.ts`
   (`decidirRaizInstalacion`) resuelve la raíz desde `CN_INSTALL_ROOT` (que
   `electron-main.cjs` inyecta como `__dirname`), la del ejecutable o la de trabajo,
   y `server.ts` la publica como `RAIZ_INSTALACION`. El supervisor ya no llama a
   `process.cwd()`: arma el `argv` con rutas absolutas y `shell: false`.
2. **Los fallos dejan rastro.** Nuevo `src/engine/evidenciaReavivado.ts`: cada
   intento escribe `logs/reavivar-<id>.intentos.log` con motivo, `argv`, `cwd`,
   código de salida y las últimas líneas de stderr, así que la próxima caída se
   diagnostica sin adivinar. El evento `DeIntento` viaja al panel con el mismo dato.
3. **`requirements.txt` de la raíz pide CERO paquetes.** Los tres daemons y el
   puente son 100% biblioteca estándar (verificado por imports) y el `python-embed`
   del paquete no trae pip: pedir `fastapi`/`uvicorn`/`pydantic` era un faltante
   imposible que desviaba cualquier diagnóstico de arranque. Las dependencias del
   agente FastAPI legacy quedan junto a su componente (`core-agent/requirements.txt`
   y `documentacion/ide/requirements.txt`), con el ámbito escrito en la cabecera y
   solo las usa `build_backend.bat`.

**Vallas.** Suite nueva `tests/raizInstalacion.test.ts` (53 comprobaciones) y dos
viejas reformuladas **más estrictas**: `reavivarServicio` exige cero `shell: true`
en el código, y `puertosCableados` exige `RAIZ_INSTALACION` y prohíbe
`process.cwd()`. `autonomia_test.py` exige que la raíz tenga cero paquetes reales y
que cada `requirements.txt` declare su ámbito.

**A validar por Mario:** `npm install`, `npm run validar`, `npm run build`.

## v1.0.22 · 2026-11-16 · EL ENTREGABLE NO PUEDE ESCRIBIR FUERA DE SU CARPETA

**El incidente.** «Al intentar descargar la tarea realizada en el entregable de la
hoja de ruta hice click en Descargar ZIP y cuando descomprimí ERRÓ toda la carpeta
C:\Cerebronico de mi disco local.» No fue el ZIP del mensaje: fue el botón del
producto. Tres capas, las tres cerradas:

1. **Se empaquetaba la raíz de datos.** El resolutor de proyecto devuelve la base
   cuando encuentra un `package.json` suelto, y la base es la instalación del IDE
   con sus políticas, logs, `.env` y lanzadores. Nuevo `src/engine/raizEntregable.ts`:
   `proponerPaquete()` **niega** la raíz de datos y solo acepta un subproyecto real
   con marcador de arranque; si hay dos, pide elegir en vez de adivinar; `logs`,
   `respaldos`, `.cerebronico`, `node_modules`, `skills` nunca son proyecto. La
   descarga responde 409 con el motivo legible y `zip-info` devuelve el mismo
   motivo, así que la hoja ya no ofrece un botón que va a fallar.
2. **Los nombres de entrada no se saneaban.** `crearZip` solo quitaba las barras
   iniciales: `../Cerebronico/politicas.md` salía tal cual y descomprimir subía un
   nivel; `C:/…` escribía en una ruta absoluta. `nombreSeguroParaZip()` elimina
   `..`, `.`, la unidad de Windows y los caracteres de control de cada tramo, y se
   aplica siempre, sin opción de omitirlo.
3. **Sin carpeta envoltorio.** El ZIP se esparcía sobre lo que ya había. Ahora
   `envolverEntradas()` mete todo bajo `<proyecto>-<fecha>/`, sin duplicar el
   prefijo si ya venía envuelto.

Defensa en profundidad: `recopilar()` vuelve a rechazar la raíz de datos aunque
alguien lo llame directo, porque un incidente que llegó al disco del usuario no se
protege con una sola condición.

**Corregido en la segunda pasada (veredicto de Mario sobre este mismo paquete):**
5 errores de tipos en `PlanificationPanel.tsx` (`creadoEn` declarado dos veces en la
interfaz del plan: `TS2300/TS2687/TS2717`) — queda una sola declaración opcional y
el cronómetro ya se negaba con `typeof`; `hojaRutaFormatoChat` en rojo porque el
texto nuevo del entorno de prueba decía «no tiene interruptor» y la valla prohíbe
esa palabra en la hoja (reescrito el texto, no la valla); `entregableZip` en rojo
porque sus cuatro comprobaciones buscaban los nombres SIN la carpeta envoltorio
recién añadida (ahora comprueban el árbol completo Y que todo cuelga de una sola
carpeta: la valla es más estricta, no más laxa); y **dos archivos que faltaban en
el paquete** por un filtro de empaquetado demasiado ancho (`.env.example` de la
raíz y de `skills/context7-master`), que causaban el `ENOENT` en `creador` y
`hindsight`.

**Suite nueva:** `tests/entregableSinSecuestro.test.ts` (14·0) — incluye
descomprimir el ZIP real en disco y comprobar que no queda un archivo por fuera.

**Rojos del veredicto v1.0.21 cerrados:** apkUnClic 29·0, auditoriaSkills 27·0,
resiliencia 38·0, derivaDocumental 38·0, unaListaDePuertos 13·0, motorVivo 60·0,
interruptoresServicios 32·0, gobernante 7·7, arranqueVentanas 25·0,
arranqueElectron 30·0.

**Versión:** `V1.0.22` en `title`, `og:title` y las dos descripciones de
`index.html`; semilla `VERSION_SEMVER = "1.0.22"`, `package.json` y la raíz de
`package-lock.json`.

**Veredicto de Mario (16/11):** `npm run validar` **TODO EN VERDE**. Cierra la
1.0.22 con los 7 fallos de la pasada anterior corregidos y los 10 rojos heredados
de la 1.0.21 en verde. Lo que queda pendiente NO es de esta versión: la caída del
servidor local que Mario reportó con dos sesiones y un log de consola (ver
`DIAGNOSTICO-CAIDA-SERVIDOR-v1.0.22.md`), que va en la 1.0.23.

## v1.0.21 · 2026-11-16 · «SOLO EXPORTAR APK Y LISTO» — Y LA CABECERA DECÍA V1.0.20

Mario, dos pedidos en el mismo turno. El primero: «revisar que la exportación de
APK esté bien definida y sea lo más automática posible: **solo exportar apk y
listo**». El segundo, con la captura en la mano: «la pestaña dice v1.0.20».

**Causa raíz, medida:**

1. **El APK no era un clic: eran cuatro botones y un callejón.** El panel tenía
   «1. Generar → 2. Compilar → ⚙ Preparar → 3. Descargar» en fila. Si la máquina
   no tenía toolchain, «Compilar» devolvía 400, el panel lo escribía y **se
   quedaba esperando otro clic**. Dos clics y un aviso no son un clic.
2. **La versión visible no salía de la semilla.** `index.html` lleva los textos
   `title` / `og:title` / `description` escritos a mano con `V1.0.20`: la regla
   de hierro («nadie más escribe la versión en texto visible») se cumplió dentro
   de `src/`, y el documento HTML quedó fuera. Por eso la pestaña mentía aunque
   la cabecera derivada dijera otra cosa.

**Lo que hay ahora:**

- `src/engine/apkUnClic.ts` (puro, cero red, cero disco, cero spawn): decide la
  secuencia completa a partir de HECHOS — hay APK verificado, el proyecto existe,
  hay compilación viva, el fallo es de toolchain, ya se intentó prepararlo.
  Reglas: un APK verificado siempre gana y no se recompila; el toolchain se
  prepara **como máximo una vez por intento** (bajar herramientas en bucle es
  cómo se rompe una máquina de 8 GB) y a la segunda se para con la causa real;
  un fallo ajeno al toolchain para con causa + solución y ofrece «Reintentar»;
  una compilación viva se sigue en vez de lanzar otra; la descarga automática
  solo se dispara si el navegador la va a aceptar.
- `PanelAndroid.tsx`: **un botón grande, «Exportar APK y listo»** que encadena
  generar → compilar → verificar → descargar, y que prepara el toolchain solo y
  reintenta si Gradle dice que falta. Los botones sueltos siguen ahí, plegados en
  «pasos manuales» (no se borró nada).
- `tests/apkUnClic.test.ts` (28 comprobaciones) registrado en el ritual.
- `index.html`: `V1.0.21` en `title`, `og:title` y las dos descripciones.
  Semilla `VERSION_SEMVER = "1.0.21"`, `package.json` y la raíz del
  `package-lock.json` alineados.

## v1.0.20 · 2026-11-15 · EL BOTÓN «LANZAR» NO ANDABA, Y CUANDO ANDE NO PUEDE CORTAR

Mario, con la captura del 15/11 (cola con un mensaje, inferencia activa 9m30s):
«el botón de lanzar ahora no anda, y que cuando ande no corte la tarea en curso,
que se resuelva en segundo plano hasta juntarse con el proyecto central».

Dice dos cosas y las dos eran ciertas. **Causa raíz, medida en el código:**

1. **No andaba.** `messageQueueRef.current = messageQueue` se reasigna en cada
   render, así que el mensaje que el manejador había encontrado podía venir de
   una foto vieja. Con turno en vuelo hacía `filter` y lo re-insertaba al frente:
   si ya estaba en la posición 0, el arreglo cambiaba de identidad pero **no de
   orden** → cero re-render, cero aviso. Un gesto sin rastro.
2. **Cortaba.** `HighPerformanceAIStreamer.stream()` empieza con
   `if (this.isProcessing) this.abort()`. Enviar el lanzado por el camino normal
   con el turno vivo abortaba el turno EN CURSO: «lanzar ahora» y «lanzar
   después» eran lo mismo, matar el trabajo.

**Además el desencolado estaba copiado cuatro veces** (fin de turno normal, fin
con error, fin del enjambre y auto-llamado): cuatro maneras de perder la marca y
de olvidar que el turno anterior pudo escribir archivos.

**Lo que hay ahora:**

- `src/engine/lanzarEnCola.ts` (puro, probado): `planDeLanzado`, `etiquetaDeLaFila`,
  `esLanzadoReciente`, `notaDelLanzado`, `hayLanzadoAlFrente`,
  `VIGENCIA_DEL_LANZADO_MS` (10 min).
- **Con turno en vuelo**: el mensaje pasa al FRENTE, se le pone `lanzadoEn` y
  sale como próximo en el desencolado natural del fin de turno — sin abortar
  nada. **Sin turno**: sale en el acto. **Si ya no está**: se dice, no se finge.
  «Lanzado» sólo se anuncia cuando de verdad salió.
- **Se ve**: la fila de la cola pinta «lanzado · sale al terminar» (o
  «lanzado · saliendo»), y el botón desaparece en ese mensaje — antes el gesto
  no dejaba ninguna marca y parecía roto.
- **Se junta con el proyecto central**: al desencolar un lanzado vigente se le
  añade al modelo la nota «MENSAJE LANZADO DESDE LA COLA … mira lo que ya está
  hecho y continúa desde ahí; no repitas trabajo ya escrito». La marca se guarda
  en `QueuedMessageItem.lanzadoEn` (`src/types.ts`).
- **Una sola puerta**: `desencolarSiguiente()` en `App.tsx` sustituye los cuatro
  bloques copiados; enjambre, fin normal y fin con error pasan por ella.
- `tests/lanzarEnCola.test.ts` — 46 comprobaciones (al frente sin abortar, en el
  acto sin turno, no-está, marca vigente/caducada, nota, etiqueta, flujo
  completo) registrada en `scripts/validar.mjs`.
- `tests/enjambreEclectico.test.ts` — la comprobación del desencolado del
  enjambre apunta ahora a la puerta única (ya no al bloque copiado).

**Qué validar:** `npm run validar` (debe entrar `lanzarEnCola` en verde) y en la
app: con un turno en curso, pulsar «Lanzar» en un mensaje de la cola → el turno
NO se corta, la fila dice «lanzado · sale al terminar» y al terminar el turno sale
ese mensaje, no el que estaba primero.

## v1.0.20 · 2026-11-15 · LA HOJA DE RUTA QUEDÓ EN TRES COSAS (pedido con capturas)

Mario miró la hoja de ruta del panel de tareas y dijo qué sobraba, con los números
a la vista: «Código 48 · 283 KB / Avisos 2 · 11 KB / Descripciones 6514 · 41,8 MB
/ Datos 5 · 1,4 MB / Entregables 1 · 540 KB → TODO ESO QUITARLO. QUÉ DEJAR:
1) la reconexión de puertos, 2) pasos de la tarea del agente, 3) el entregable
final. NADA MÁS EN LA HOJA DE RUTA.»

**Qué salió de la cara** (no del motor): el inventario en cinco baldes, la lista
del repartidor (hilos, semáforo, ×N, memoria), los interruptores de servicio, el
ciclo de decisión, «Acciones en la PC» con sus tandas de ✓, los planes viejos y
la barra de progreso por plan.

**Qué quedó, en este orden:**

1. **Reconexión de puertos** — sólo los caídos, cada uno con quién es, para qué
   sirve y **qué se pierde**; botón «Reconectar» únicamente si hay alguno abajo
   (consume `handleReconnectAll` de `App.tsx`, no duplica el gesto). Con todo
   arriba, una sola línea en verde.
2. **Pasos de la tarea del agente** — del plan **vigente**, desde el primer paso:
   ✓ hecho · ▶ en curso · ✗ roto (con su motivo, no una caja negra) · · pendiente,
   con contador `hechas/total`. Si el plan ya cerró, lo dice.
3. **Entregable final** — uno solo, con nombre, peso y número de archivos. El
   botón «⬇ Descargar» exige obra cerrada **y** paquete empacado; a medias dice
   «todavía no hay entregable final: el trabajo no cerró».

**Archivos nuevos:**

- `src/engine/hojaDeRuta.ts` — puro (sin React, sin red, sin disco):
  `claseDeEstado`, `pasosDeLaTarea`, `reconexionDePuertos`, `entregableFinal`,
  `armarHoja`, `SECCIONES_DE_LA_HOJA` = `["reconexion","paso","entregable"]`,
  `MARCA` (✓ ▶ ✗ ·) y `TONO`.
- `src/components/HojaDeRutaViva.tsx` — pinta los tres bloques y nada más.
- `tests/hojaDeRuta.test.ts` — ejecuta el motor puro de verdad (35 comprobaciones).
- `HOJA_DE_RUTA_TRES_COSAS.md` — el documento vivo de esta hoja.

**Reescrito:** `src/components/PlanificationPanel.tsx` (de 719 líneas al
indicador «Ruta» + la hoja + el pie «Panel completo»; el early-return de `oculto`
sigue **después** de todos los hooks) y `tests/hojaRutaFormatoChat.test.ts`
(ahora blinda las dos mitades: el inventario salió de la cara y **sigue vivo en
el motor**).

**Lo que NO se tocó:** `agruparEntregables` / `clasificarArchivo` / `pesoLegible`,
`/api/sandbox/zip-info` con sus cinco grupos, la descarga por archivo suelto
(`?archivo=`), la aduana y el `actionLog`. El panel completo los sigue pintando.
Quitar ruido de la cara no es borrar capacidad.

## v1.0.20 · 2026-11-15 · EL VEREDICTO DE v1.0.20, CERRADO (corrección de la misma versión, sin subirla)

Los cuatro rojos que dio `npm run validar` sobre v1.0.20, con su causa raíz y su
valla. Nada se "ajustó para que pasara": cada uno era un defecto real del turno.

1. **resiliencia + censoSuites — seis suites huérfanas.** Las seis pruebas nuevas
   del protocolo existían en disco y corrían por el descubrimiento dinámico, pero
   NO estaban declaradas en `scripts/validar.mjs`: una prueba que nadie declara no
   cubre nada. Ahora las seis tienen ficha con su descripción y su motivo
   (escaleraContexto, protocoloDirecciones, promptDirecciones, avisoVentana,
   avisoVentanaCableado, rutasAtomicas). Disco y ritual: 307 ↔ 307.
2. **raizDeObra — la valla del cableado se había quedado con el texto viejo.**
   El v1.0.20 añadió `|| otraObraAbierta()` como último recurso de la raíz servida
   (la causa raíz de que el :3500 sirviera una carpeta mientras el editor escribía
   en otra), y la valla seguía exigiendo la firma literal antigua con un
   `[^)]*` que se corta en el paréntesis anidado. Se mide el criterio por piezas
   (las tres del resolutor) y se añade la simetría: la autoridad de raíz y
   `resolveSafePath` tienen que leer LA MISMA obra del registro. 39/39.
3. **androidProyecto — el techo del monolito estaba escrito a mano.** El número
   vivo (12.317) era el mismo que el presupuesto pero la valla comparaba contra un
   literal heredado (12.300), así que se ponía roja justo en el borde sano. Ahora
   compara contra `contrato.presupuesto_lineas` y contra su techo declarado.
   Causa raíz del literal: nadie lo regeneraba junto con el contrato.
4. **Corrección a lo que dije en la entrega anterior:** el 143/144 de
   `androidProyecto` NO era "solo el fetch de Node 16". Su prueba en vivo también
   necesitaba `express` instalado y `body-parser` presente; sin ellos el rojo
   decía "Cannot find module", no "fetch is not defined". Medido en esta máquina
   con la cadena completa y `--experimental-fetch`: **157 correctas · 0 fallidas**.
   En tu equipo, con `npm install` de verdad, el número será 157.

Sin cambios de comportamiento: los cuatro arreglos son de valla y de catálogo.

## v1.0.20 · 2026-11-15 · «SE CORTA» ERAN DOS CAUSAS, Y LAS DIRECCIONES TENÍAN CUATRO DUEÑOS

**Pedido de Mario**: (a) una ESTRATEGIA DE PROTOCOLO con las direcciones/puertos
correctos para que no haya más equivocaciones entre el proyecto y el sandbox, y
(b) saber por qué qwen3.5:4b «se corta / nunca funciona» (sesión
cerebronico-ide-sesion-1794621531453).

### La raíz del 400 (mensajes 69 y 71 del hilo)
`HTTP 400: request (17929 tokens) exceeds the available context size (8192)` no
era el modelo: el motor le pedía a Ollama una ventana MAYOR que la que el modelo
DECLARA en `/api/show`, y el dial «Ventana de contexto» del panel Pro nacía en
8192 pudiendo fijarla por debajo de la escalera del perfil (small con ≤8 GB =
4096). Recortar escondía el defecto hasta el turno siguiente. El «cayó demasiado
tiempo y se cortó» era el mismo pedido pagando el prefill en CPU, no una caída.

1. `src/engine/escaleraContexto.ts`: UNA regla. El dial manda solo si pide MÁS
   que la escalera; el liviano no crece; el techo de RAM se respeta; y lo que
   declara `/api/show` CLAMPEA cualquier deseo.
2. `server/normalizarOllama.ts`: `sanearYVentana` acepta el contexto declarado;
   `server.ts` lo pide una vez por turno (`contextoDeclaradoDeOllama`).
3. `src/engine/avisoVentana.ts` + `server/streamContext.ts`: el `done` del turno
   lleva `avisoVentana` armado con `prompt_eval_count` REAL (0 avisos si no hubo
   medida), y separa CARGA de PESOS de PREFILL GRANDE. `engine.ts` lo propaga y
   `App.tsx` lo escribe en el registro con dos severidades (⛔ desborda / 🪟
   ajustado). Antes las dos causas terminaban en la misma frase genérica.

### La estrategia de direcciones
`src/engine/protocoloDirecciones.ts`: una sola tabla derivada de `PORTS` (3000
IDE · 3500 sandbox · 5000 puente · 5100 memoria · 5102 creador · 5103 cerebro ·
11434 Ollama), con dueño, quién le habla y la equivocación concreta que previene.
Se imprime en el arranque junto a la auditoría de direcciones de escucha coladas,
y viaja en el prompt: `superPrompt.ts` dejó de llevar el literal a mano
«Puertos: 3000 IDE · 3500 sandbox · 5000 PC · 11434 Ollama» — que además se había
quedado corto — y ahora lo deriva de `lineasProtocolo()`.

### Tipos (veredicto de Mario sobre el primer parche)
Los 4 errores de `src/engine/relojModelos.ts` eran UNO: el mapa de muestras de
prefill se declaró `Map<string, number>` y guardaba listas. Ahora
`Map<string, number[]>`. `tsc --noEmit` del proyecto completo: 0 errores.
`redondearVentana` tampoco devuelve 1024 para 10 tokens: devuelve el suelo.
`contrato-rutas.json` regenerado a propósito (207 rutas · 12.317 líneas) y los
literales congelados de `escena3dCableada` pasaron a leer `presupuesto_lineas`.

### Suites nuevas
`escaleraContexto` (21), `protocoloDirecciones` (19), `avisoVentana` (13),
`avisoVentanaCableado` (12, vigila que la capa nueva SE LLAME), `promptDirecciones`
(10). Tres vallas viejas se ajustaron a contratos reales (no a la forma literal):
`rutasSistema`, `sandboxContrato` y `escena3dCableada`.

## v1.0.19 · 2026-11-14 · EL TURNO QUE MORÍA CON EL MODELO A PUNTO DE HABLAR

**Veredicto de Mario sobre v1.0.17**: 3 fallos sobre 11.675 comprobaciones y 2
suites que no llegaron a ejecutarse. Causas, todas mías:

1. **`.env.example` no estaba en el ZIP.** Nunca me lo llevé: `.gitignore` ignora
   `.env` y el patrón se tragaba también la plantilla, así que `creadorWeb` y
   `hindsightHibrido` morían con ENOENT antes de comprobar nada (de ahí los 2
   suites sin ejecutar). Ahora `.gitignore` lleva `!.env.example` y viaja.
2. **El Sync del terminal nunca abría el preview.** La rama existía pero `count`
   era la constante `0`, así que `count > 0` era imposible: el botón escribía y
   no refrescaba. Ahora usa la cifra real que devuelve el sync y abre si escribió.
3. **La semilla visible decía 1.0.18** (`VERSION_SEMVER` en `src/constants.ts`):
   ahora 1.0.19, coherente con `package.json`.

**Segunda vuelta (veredicto de Mario sobre la primera v1.0.19): 6 errores de
tipos y 15 fallos, todos de la misma raíz — la versión.** Cambié la semilla a
1.0.19 pero dejé fuera `package-lock.json` (raíz y `packages[""]` seguían en
1.0.18), y la pestaña del navegador seguía diciendo V1.0.18 porque el `title`,
`description`, `og:title` y `og:description` de `index.html` conservaban el
literal viejo. Con la semilla en 1.0.18, siete suites (motor-datos, bajoConsumo,
creadorWeb, hindsight, techoContexto, ordenDeObra, entradaIntacta,
derivaDocumental) caían en cascada. Ahora: lock 1.0.19 en sus dos asientos,
index.html con los cuatro rótulos en 1.0.19, y `VERSION_SEMVER` = 1.0.19.
Además, dos anotaciones de tipo (`const lista: number[]`) que el compilador
leía como `number | never[]` en `relojModelos.ts`, y el testigo de líneas del
monolito subido a 12.273 (contrato regenerado).

Síntoma de Mario: el mismo modelo local contesta rápido en la interfaz de Ollama
(incluso un 4B) pero en CerebroNico tarda ~2 minutos y los turnos se cortan;
«cargastes y te descargastes de la ram barias veces».

**Causa raíz (log de la sesión 1794607399689).** `library=cpu` 29 veces: en CPU
pura la primera palabra de un 1B cuesta ~165 s (volcar 1.5 GB de pesos +
procesar el prompt). El piso de carga fría estaba en **150 s** y el aborto de
conexión con Ollama en **180 s**: el reloj y el aborto se pisaban, el turno moría
justo cuando el modelo iba a hablar (el 1º respondió a los ~165 s; los turnos
2-4 cayeron). Y el `keep_alive` de «3m» para modelos ≤1.7B los expulsaba entre
turnos, así que cada turno volvía a pagar la carga completa.

**Qué se tocó**
- `src/engine/relojModelos.ts` — piso de carga fría `local-chico` 150 s → 270 s,
  `local-mediano` 240 s → 300 s; nuevo `TECHO_CONEXION_OLLAMA_MS = 180 s`: el
  presupuesto NUNCA se acerca al aborto del fetch (deja 15 s de aire, tope real
  165 s). El techo solo acota a modelos LOCALES: un `-cloud` conserva su 600 s.
- `src/engine/relojModelos.ts` — el prompt se paga: `registrarPrefill()`,
  `sobranteDePrefill()`, `sobranteMedidoDePrefill()` guardan el sobreprecio del
  `prompt_eval_duration` medido en el `done` y lo SUMAN al presupuesto del turno
  siguiente (mediana, máx. 6 muestras). La etiqueta dice `+N s de prompt medido`.
- `server.ts` — el `done` del stream y el camino sin stream registran el prefill
  en **ms** (`met.msPrompt`), no en ns.
- `server.ts` — en modo liviano la ventana de contexto YA NO CRECE
  (`sanearYVentana` recibe tope `undefined`): cada token extra de prompt se paga
  en el prefill de una CPU.
- `src/engine/modelTiers.ts` — `keepAliveBajoConsumo`: ≤1.7B pasa de «3m» a «5m»
  (misma ventana que un ≤7B) y deja de expulsarse entre turnos.

**Suites** (medidas con `npx tsx`): relojModelos 53/0 (sección nueva 7 con el
caso real del 1B en CPU), keepAliveOllama 46/0, bajoConsumo 84/0,
v1661_buclesYReloj 38/0, techoContexto 115/0, normalizarOllama 25/0,
esperaNube 20/0, fusibleProveedores 27/0. Contrato regenerado: **202 rutas ·
12 273 líneas**.

**Qué valida Mario**: `npm install && npm run validar && npm run build`; después
un turno con el 1B y `ollama ps` en otra terminal (debe seguir residente a los
3 min), y el log debe decir «piso de carga fría 270 s» sin aborto a los 180.

## v1.0.18 · 2026-11-14 · EL BOTÓN SYNC: la comprobación del sandbox vuelve a leerlo de un tirón

Veredicto de Mario sobre la v1.0.17: **1 fallo en 11.653 comprobaciones**, y el que
fallaba era el mío, no el suyo:

```
herramientasParaTodos
  ✗ el Sync manual del terminal también abre el preview
```

**Causa raíz.** En la v1.0.17 saqué la decisión del Sync a una función aparte
(`abrirPreviewTrasSync`) para que no quedara enterrada entre cientos de líneas de
avisos de terminal. El comportamiento era el mismo, pero la comprobación lee
`RightSidebar.tsx` **como texto**: pide ver la petición al Sync y la entrada al
sandbox (`setActiveTab("sandbox")`) a menos de 900 caracteres de distancia. Al
moverla, la distancia pasó a ~2.400 y la valla se apagó. Un arreglo de forma
rompió una valla de forma: el rojo era real, aunque el botón funcionase.

**El arreglo.** El `onClick` del Sync vuelve a contener la secuencia completa
—escribir, contar, decidir y abrir— y los párrafos de aviso (la pantalla blanca
con 0 archivos, la ruta absoluta donde escribió, el proyecto duplicado, el :3500
muerto) se mudan a `informarSync(count)`, que además es la que recibe la cifra
real. Ni una línea de comportamiento cambia: mismo anti-bucle (una apertura por
tanda + `COOLDOWN_APERTURA_MS`), misma negativa a abrir sobre un puerto muerto,
mismo «0 archivos no es un listo». `herramientasParaTodos` pasa a **47/0**.

**Lo demás sigue en pie.** El 400 de Ollama («Siempre» = `-1`, que viajaba como
`keep_alive` sin unidad) sigue corregido con `traducirKeepAlive()` → `-1m` y sus
46 comprobaciones. `server.ts` no se toca: 12272 líneas = presupuesto del contrato
(202 rutas). Manifiesto regenerado y firmado con la versión real.

## v1.0.17 · 2026-11-14 · OLLAMA LOCAL: el «Siempre» que rompía el chat (HTTP 400) y el 1.0.16 que quedó en verde

Reporte de Mario con el error literal del chat local:

```
⚠️ Error de comunicación con llama3.2:1b: ❌ Ollama no pudo responder para el modelo
"llama3.2:1b": HTTP 400: time: missing unit in duration "-1".
Comprueba que Ollama esté arrancado y que el modelo esté descargado (ollama list).
```

**Causa raíz, no es Ollama.** Ollama SÍ estaba arrancado y el modelo SÍ estaba descargado:
era la petición la que venía mal formada. El panel Pro ofrece «Mantener modelo en RAM →
**Siempre**» y guarda el valor `"-1"`. Ese `-1` es válido como **variable de entorno**
(`OLLAMA_KEEP_ALIVE=-1` del BAT, que es de donde se copió la idea), pero en el campo
`keep_alive` del cuerpo JSON Ollama interpreta `-1` como MinInt64 segundos y su parser de
duraciones exige unidad → rechaza la petición entera con `missing unit in duration "-1"`.
Un solo dial convertía en 400 TODOS los mensajes al modelo local.

**Arreglo (forma, no política).** `traducirKeepAlive()` en `src/engine/modelTiers.ts`:
`"-1"` → `"-1m"` (la forma que Ollama sí acepta para «nunca caduca»). Se aplica en el
**único punto por el que sale `keep_alive` hacia Ollama** — `aplicarPreferenciaMotor()`,
que alimenta `getModelProfile().keepAlive` y de ahí todas las puertas: chat del agente,
bucle de herramientas, precalentado y camino directo del navegador. `5m`, `30m`, `0` y los
segundos pasan intactos; la escalera MR (3m/5m/0) no cambia.

**Suite nueva, registrada en el ritual.** `tests/keepAliveOllama.test.ts` (46 comprobaciones):
la traducción, el punto único de salida, la escalera por modelo/RAM, y una regresión que
reproduce el texto del 400 para que no pueda volver. `npm run validar` la ejecuta.

**El otro cierre.** `server.ts` queda en **12272 líneas** = `presupuesto_lineas` del
contrato (regenerado con `node scripts/superficie.mjs`; 202 rutas), y `MANIFIESTO_SHA256.txt`
se regenera firmando **2325** ficheros con la versión real en la cabecera (el que viajaba
decía v1.0.13 y dejaba fuera `normalizarOllama.ts`, `respaldoNube.ts`, `puertoLibre.ts`,
`cercoDeAlcance.ts`, `toolchainPlan.ts` y sus suites).

Lo que NO se tocó: el motor de respuestas (ninguna política de contexto, residencia o
muestreo cambia), ni el bug del preview, ni la carpeta `ollama-local/` (viaja aparte).

## v1.0.16 · 2026-11-11 · Consolidación: identidad de versión unificada y las dos suites nuevas registradas

Parche de cierre sobre v1.0.15. No agrega features; alinea la IDENTIDAD de versión en todo el
árbol y mete las suites nuevas al censo para que `npm run validar` las ejecute en vez de
ignorarlas.

- **Identidad 1.0.16 en una sola voz**: la semilla `VERSION_SEMVER` (`src/constants.ts`),
  `package.json`, `package-lock.json` (raíz y `packages[""]`), `index.html` (título + og) y el
  tope de este CHANGELOG dicen todos `1.0.16`. Las dos líneas de `memoria.md` que eran registro
  histórico quedan marcadas `deriva:historico` (son memoria, no una afirmación de versión viva).
- **Censo de suites completo**: `scripts/validar.mjs` ahora declara `normalizarOllama` y
  `respaldoNube` en `SUITES[]`; antes existían como test pero no corrían bajo `validar`, así que
  resiliencia/censoSuites/vallasVivas las contaban como ausentes.

## v1.0.15 · 2026-11-11 · Ollama local vuelve a andar: el system va primero, el prompt cabe y el 500 tiene causa

Seis síntomas reportados por Mario (Windows, LOG_IDE/LOG_OLLAMA + sesión). Los dos que dejaban
a Ollama local «sin andar» eran dos HTTP 500 distintos en `POST /api/chat`, los dos con nombre:

- **«System message must be at the beginning» (plantilla Jinja de qwen3.5 y afines)**: el motor
  empujaba notas de continuidad / orden de obra como `role:"system"` al FINAL del array
  (`server.ts` cuerpoBucleAgente), detrás de los user/assistant. La plantilla rechazaba el
  pedido entero → 500 en cada turno. Fix puro `server/normalizarOllama.ts` →
  `consolidarSystemAlInicio()` funde todos los system en UNO al frente, conservando el orden del
  resto. Cableado en los DOS puntos de entrada a `/api/chat`: `callOllamaNonStreaming` (bucle de
  agente) y el fetch de streaming directo.
- **«request (16547 tokens) exceeds the available context size (8192)»**: manual + orden de obra
  + historial pasaban el `num_ctx` del modelo → 500. `recortarMensajesAVentana()` recorta el
  historial más viejo (nunca el system ni el último pedido del usuario) para caber en `num_ctx`
  dejando reserva para la respuesta; como último recurso trunca el system. Usa el `num_ctx` real
  de `buildOllamaOptions` por perfil del modelo.
- **`/api/tags` HTTP 500 por modelo corrupto**: ya se atrapaba (stale-while-error conservaba la
  última lista buena), pero el motivo era un seco «HTTP 500». Ahora `server/tagsCache.ts` lo dice
  en cristiano (modelo corrupto en el almacén → `ollama list` / `ollama rm` + `ollama pull`) y
  adjunta el cuerpo de Ollama.
- **Puerto :3500 ocupado por OTRA app**: la guarda-zombie mataba al ocupante; si no podía
  liberarlo, el preview quedaba en blanco sin explicación. Nuevo `server/puertoLibre.ts`
  (sondeo real con `node:net`) + `/api/sandbox/start` ahora verifica que el :3500 quedó libre y,
  si no, responde 409 con `puertoAlterno` concreto y cómo cerrar al ocupante. NO se recableó el
  frontend a puerto dinámico (a propósito: demasiado riesgo).

Tests: `tests/normalizarOllama.test.ts` (16/16 con `npx tsx`), casos sacados del LOG_OLLAMA real
(system detrás de user, prompt que desborda 8192, cadena consolidar→recortar). Cambios aditivos
y bien anclados; sin compilar aquí (no hay node_modules en la copia de trabajo).

## v1.0.14 · 2026-11-10 · El presupuesto de vuelta, el envío al sandbox y el APK con herramienta propia

Tres rojos de la sesión 1794293050619 (Mario, Windows), los tres con nombre y apellido:

- **PRESUPUESTO DE PASOS (el corte a 3-4 minutos)**: no era el reloj, eran los pasos. Con
  base 12 · tope 36 el modelo se cortaba a ~12 pasos (~15 s/paso ⇒ 144-178 s medidos en el log),
  y la propia frase de corte lo decía: «presupuesto de pasos». Ahora: nube OpenAI-compat
  (`cicloHerramientasOpenAICompat.ts` + `server/cicloOpenAICompat.ts`) base 24 · tope 96 con
  prórroga tasada por progreso (escrituras y ejecuciones exitosas suman techo, lecturas
  repetidas no); Gemini (`server.ts`) mismo tope 24→96 vía `techoPasosConProgreso`; planificador
  Ollama (`bucleAutonomo.ts`) base 16 · tope 96. Los guardas anti-bucle (repetición, relectura,
  ciclo, vigilante de fallos) quedan intactos: más aire, mismo candado. Los tests de la valla
  (`cicloHerramientasOpenAICompat.test.ts`, `v1661_buclesYReloj.test.ts`) se re-pactaron al contrato nuevo.
- **ENVÍO AL SANDBOX (la media hora buscando «dónde se sube»)**: el mapa canónico
  (`src/engine/rutasSistema.ts`) ahora lo dice en el system prompt de cada turno:
  `write_file`/`edit_file`/`append_file` sobre la carpeta vinculada **es** la entrega — no existe
  endpoint de subida; preview: `GET /api/sandbox/status` → `POST /api/sandbox/start` con
  `{"destino":"<proyecto>"}`, y si no se ve lo escrito, `GET /__cn_info` en el :3500 muestra la raíz
  efectiva. El documento `RUTAS-DEL-SISTEMA.md` refleja la sección 4-bis (anti-deriva). Mapa:
  3230 chars (< 3600, valla vigente).
- **APK SIN ANDROID STUDIO (`Preparar herramientas`)**: la fábrica ya no depende de que el
  wrapper o un Gradle del sistema existan. Nuevo plan puro (`src/engine/toolchainPlan.ts`) +
  efectos (`server/aprovisionarToolchain.ts`): JDK 17 (Adoptium), Gradle 9.6.0 y cmdline-tools +
  SDK 36 (sdkmanager, licencias aceptadas por stdin) bajan UNA vez a
  `<raíz de datos>/.cerebronico/herramientas` — no tocan el PATH ni Program Files. Ruta de build
  nueva `gradle-local` en `apkBuild.ts` con env por-spawn (JAVA_HOME/ANDROID_HOME/PATH) y
  `local.properties` escrito solo si el SDK es el aprovisionado. Rutas
  `POST/GET /api/export/android/provision` (contrato: 8 rutas de export · 4 con guard) y botón
  «⚙ Preparar herramientas» en `PanelAndroid.tsx` con progreso real (MB, paso, log) que
  re-intenta el build solo al terminar. Si algo falta, el 400 dice la solución concreta; si el
  APK no está verificado en disco, no hay botón de descarga: la honestidad de `apkVerificado` sigue.

Validación: suites de cercos re-pactadas (rutas de exportación 8, guards 4, monolito 12233
líneas · contrato regenerado con `npm run superficie`). Juez definitivo: `npm run lint` +
`npm run validar` en la máquina de Mario.

## v1.0.14 · 2026-11-10 · El presupuesto de vuelta, el envío al sandbox y el APK con herramienta propia

Tres rojos de la sesión 1794293050619 (Mario, Windows), los tres con nombre y apellido:

- **PRESUPUESTO DE PASOS (el corte a 3-4 minutos)**: no era el reloj, eran los pasos. Con
  base 12 · tope 36 el modelo se cortaba a ~12 pasos (~15 s/paso ⇒ 144-178 s medidos en el log),
  y la propia frase de corte lo decía: «presupuesto de pasos». Ahora: nube OpenAI-compat
  (`cicloHerramientasOpenAICompat.ts` + `server/cicloOpenAICompat.ts`) base 24 · tope 96 con
  prórroga tasada por progreso (escrituras y ejecuciones exitosas suman techo, lecturas
  repetidas no); Gemini (`server.ts`) mismo tope 24→96 vía `techoPasosConProgreso`; planificador
  Ollama (`bucleAutonomo.ts`) base 16 · tope 96. Los guardas anti-bucle (repetición, relectura,
  ciclo, vigilante de fallos) quedan intactos: más aire, mismo candado. Los tests de la valla
  (`cicloHerramientasOpenAICompat.test.ts`, `v1661_buclesYReloj.test.ts`) se re-pactaron al contrato nuevo.
- **ENVÍO AL SANDBOX (la media hora buscando «dónde se sube»)**: el mapa canónico
  (`src/engine/rutasSistema.ts`) ahora lo dice en el system prompt de cada turno:
  `write_file`/`edit_file`/`append_file` sobre la carpeta vinculada **es** la entrega — no existe
  endpoint de subida; preview: `GET /api/sandbox/status` → `POST /api/sandbox/start` con
  `{"destino":"<proyecto>"}`, y si no se ve lo escrito, `GET /__cn_info` en el :3500 muestra la raíz
  efectiva. El documento `RUTAS-DEL-SISTEMA.md` refleja la sección 4-bis (anti-deriva). Mapa:
  3230 chars (< 3600, valla vigente).
- **APK SIN ANDROID STUDIO (`Preparar herramientas`)**: la fábrica ya no depende de que el
  wrapper o un Gradle del sistema existan. Nuevo plan puro (`src/engine/toolchainPlan.ts`) +
  efectos (`server/aprovisionarToolchain.ts`): JDK 17 (Adoptium), Gradle 9.6.0 y cmdline-tools +
  SDK 36 (sdkmanager, licencias aceptadas por stdin) bajan UNA vez a
  `<raíz de datos>/.cerebronico/herramientas` — no tocan el PATH ni Program Files. Ruta de build
  nueva `gradle-local` en `apkBuild.ts` con env por-spawn (JAVA_HOME/ANDROID_HOME/PATH) y
  `local.properties` escrito solo si el SDK es el aprovisionado. Rutas
  `POST/GET /api/export/android/provision` (contrato: 8 rutas de export · 4 con guard) y botón
  «⚙ Preparar herramientas» en `PanelAndroid.tsx` con progreso real (MB, paso, log) que
  re-intenta el build solo al terminar. Si algo falta, el 400 dice la solución concreta; si el
  APK no está verificado en disco, no hay botón de descarga: la honestidad de `apkVerificado` sigue.

Validación: suites de cercos re-pactadas (rutas de exportación 8, guards 4, monolito 12233
líneas · contrato regenerado con `npm run superficie`). Juez definitivo: `npm run lint` +
`npm run validar` en la máquina de Mario.
## v1.0.13 · 2026-11-09 · La interfaz deja de adivinarse: inventario medido, duplicados nombrados y la tijera con plan

Tercera tanda del plan `EVOLUCION-PERFECCION-Y-AUTOMEJORA.md`. Mario pidió limpieza «por
sensación» y la casa responde como siempre: PRIMERO EL NÚMERO.

- **`scripts/superficie-ui.mjs`** (nuevo, regenerable): recorre los 36 componentes vivos y
  App.tsx y produce `SUPERFICIE_UI.md` — **107 llamadas a /api, 69 endpoints, 315 botones, 11
  grupos «duplicados»**, cada uno con su nota de qué automatización del motor (v1.0.10→12) ya
  lo volvió redundante y la versión que lo trajo. `--verificar` lo mantiene fresco (falla si
  un componente cambió después del inventario).
- **`documentacion/audits/PLAN-LIMPIEZA-UI.md`** (nuevo): la ronda 1 de la auditoría
  DESMIENTE el recorte ciego (los ×8 de `sandbox/start` son UN flujo automático, no ocho
  botones) y deja **3 candidatos reales + 1 REFUTADO en la propia auditoría** (el `bridge/restart` del modal es necesario: el puente lee sus permisos al nacer — la planilla señala, la lectura decide), con evidencia línea a línea y riesgo declarado,
  esperando el «cuál» de Mario. La planilla es oferta, no sentencia.
- Cierre de la trilogía 1.0.10→13 con la orden de no empaquetar hasta acá: este ZIP incluye
  preview transform-on-serve, reversión por archivo, rutas explícitas en el mapa del motor,
  barra en español, entregable sin órganos, cadena segura, obra visible automática, hilana
  reanudable y la auditoría de interfaz.

## v1.0.12 · 2026-11-09 · La obra nace a la vista y el corte de nube ya no borra el hilo

Dos cirugías pedidas por Mario en mayúsculas, sobre el diagnóstico de la sesión exportada:

- **OBRA VISIBLE (server/obraCurso.ts)**: cuando `write_file` posa la PIEDRA FUNDACIONAL de
  un proyecto nuevo (index.html, main.*, app.*, package.json en la raíz de datos), sin carpeta
  vinculada y sin proyecto servido, la obra se abre en SU PROPIA CARPETA con nombre derivado
  del objetivo del turno («App de control dinero» → `app-control-dinero/`). Desde ahí, la
  autoridad única (`resolverDestinoSandbox`) hace que escritura, árbol del editor y :3500
  coincidan: «el usuario nunca ve los archivos en su editor» muere acá. Los siete guardas de
  no-desvío verificados: archivo que no es obra, carpeta vinculada (manda el CANAL DIRECTO),
  proyecto ya servido (regla 4b), raíz-proyecto existente (editar no es crear), subcarpeta y
  escapes intactos. El mismo objetivo dos veces reusa la carpeta: continuación, no `-2`.
- **HILANA REANUDABLE (src/engine/hilana.ts, F16 mínimo)**: los diez puntos de rendición de
  nube (Gemini, Z.ai, OpenAI, Custom, Groq, Cerebras, Together, Mistral, DeepSeek, Fireworks)
  disparan una foto `.cn-turno/hilana.json` — objetivo, motivo del corte y archivos YA
  escritos según el manifiesto de la tanda (verdad de disco, no memoria del modelo). El turno
  siguiente recibe `⚑ CONTINUACIÓN DE OBRA INTERRUMPIDA` delante del pedido con la regla
  explícita de NO rehacer lo escrito. La foto se consume al inyectarse y caduca a los 45 min.
  La rotación automática entre nubes de la lista segura quedará atada a este mismo riel.

Humo v1.0.12: 7 guardas de desvío + slug + hilana ida-y-vuelta + caducidad — todo verde. tsc 0.
Empaquetado aplazado por orden de Mario: el ZIP llega con la v1.0.13 (auditoría de interfaz).

## v1.0.11 · 2026-11-09 · La barra habla español, el entregable solo trae la OBRA y la lista segura de relevos vive en el motor

Segunda tanda del plan `EVOLUCION-PERFECCION-Y-AUTOMEJORA.md`, salida de la boca de Mario:
«en la barra de tareas solo muestra comandos como write_file con una X o un visto… no se sabe
qué hizo, no lo menciona en español»; «muestra muchos archivos para descargar que no son de la
sesión, he visto md y cosas de CerebroNico»; «en los relevos la lista segura es GLM-4.5-flash
(Z.ai), OpenRouter /free o auto (Gemma gratis), Gemini 3.5→3.8-flash; DeepSeek-v4-flash en
Mistral no sé si es gratis — no corta a mitad como Gemini/Z.ai».

- **VOZ DE TAREAS** (`src/engine/vozDeTareas.ts` + `PlanificationPanel`): cada acción de la
  barra se muestra en español con su objeto real — «escribió index.html (2 341 bytes)» en vez
  de `write_file ✓`. El nombre técnico no muere: vive en el tooltip para depurar. FALLOS con
  su motivo, verbos por herramienta (escribir/leer/buscar/ejecutar/abrir preview/quirófano…).
- **ENTREGABLE SIN ÓRGANOS DEL IDE** (`esOrganoDelIDE` en `src/engine/entregable.ts`, aplicado
  al recorrido en `server/sandboxEntregable.ts`): cuando el paquete se recorre desde la raíz de
  datos SIN carpeta vinculada, los md/bat/lanzadores/documentación interna de CerebroNico y el
  rasclo (`_*`, `test-*`, `verificar-*`) dejan de ensuciar la lista de descargas. En carpeta
  vinculada todo sigue siendo obra (un CHANGELOG.md del proyecto no se toca). Suites de la
  casa: entregable 48·0, entregableZip 33·0, planificacionPanel 33·0, voz 75·0, quirofano 130·0.
- **CADENA SEGURA** (`src/engine/cadenaSegura.ts`): la lista de relevos validada EN CAMPO por
  Mario (orden + carácter: cuáles cortan a mitad de tarea —Gemini/Z.ai— y cuál solo cae antes
  de empezar —Mistral/DeepSeek-v4-flash, con la duda de facturación declarada, sin afirmar
  que sea gratis) entra como dato del motor; los mensajes de fallo de nube ya no recomiendan
  modelos al azar: listan la cadena. La ROTACIÓN automática entre nubes queda atada al plan
  reanudable (F16, v1.0.12): relevar sin perder el hilo exige reanudar — mismo mecanismo.

## v1.0.10 · 2026-11-09 · El camino correcto viaja DENTRO del motor: preview que no toca la fuente, reversión por archivo, rutas explícitas y UN solo manifiesto

Salido de la sesión exportada 1794120824912 y su log (análisis completo en
`documentacion/audits/analisis-sesion-requisitos.md`; plan vivo en
`EVOLUCION-PERFECCION-Y-AUTOMEJORA.md`). Mario cerró el pedido así: *«perfecciona el problema de
confusión de rutas al crear algo y su previsualización en el sandbox»* y, a media sesión:
*«el camino correcto de todas las rutas debe estar explícito en el motor; no pueden existir
errores de ese tipo»*. Esta versión hace literal esa frase.

- **F3 · EL PREVIEW DEJA DE TOCAR LA FUENTE**: `server/sandboxEstatico.ts` inyecta el bundle
  `cn-preview.js` **en la respuesta** (transform on serve); el `index.html` del usuario conserva
  su md5 para siempre. Guarda anti-secuestro en `server/sandboxPreview.ts`: si la entrada
  declarada ES el bundle generado, restaura el respaldo, repara a la entrada real o DECLARA el
  secuestro — el ciclo `cn-preview.js → cn-preview.js` (8 veces en el log) no puede volver.
- **F4 · EL SANDBOX SE DECLARA**: balise de estado en cada preview (raíz efectiva, hash del
  index, edad del bundle) + ámbar **«⚠ DOS COPIAS»** cuando hay `index.html` en la raíz y en una
  subcarpeta; `/__cn_info` ampliado. El fin del «edito y no se ve» sin abrir DevTools.
- **F1 · EL GUARDIÁN REVIERTA LO SUYO**: las puertas nombran `culpables` por archivo; la
  reversión alcanza solo a los culpables (las puertas sin culpa siguen revirtiendo la tanda);
  el veredicto trae `revertidos`/`conservados`; `write_file` solo dice «ok» con los bytes
  verificados en disco y pega el último cierre del quirófano. Prueba: `quirofano` 130/130.
- **F2 · CERRADURA CON CONTEXTO**: `innerHTML` de plantilla local (dato probadamente no
  externo) → AVISO, no bloqueo; externo/dudoso sigue crítico. `// cn-allow: xss-innerhtml
  <motivo>` con registro en el acta; `.cn-seguridad.json` por proyecto. Las 49 reversiones por
  HUDs propios del juego no se repiten. `cerradura` 52/52.
- **F9 · EL RASCLO NO ES OBRA**: `importChecker` ignora `_*`, `test-*`, `verificar-*`,
  `*.test.*`, `tests/**` — las sondas del agente ya no nacen bloqueando la tanda siguiente.
- **F6 · NADA DE MUERTES SILENCIOSAS**: en `engine.ts`, abort del usuario = silencio pactado;
  abort interno = `onError` explícito.
- **MAPA + CAMINO (el pedido explícito)**: cuatro líneas nuevas en `MAPA_DE_RUTAS` (sandbox de
  una sola carpeta → `GET /__cn_info`; profundidad de rutas relativas; espejo `dist/` vs `/src/`;
  puente :5000 caído ≠ ruta mala) que TODO modelo recibe cada turno; `src/engine/caminoCorrecto.ts`
  engancha en los errores de puente/extensión la frase del camino correcto (`camino_correcto` en
  la propia respuesta). Manuales que faltaban: `ingresar_archivo_workspace`,
  `promover_archivo_sandbox`, `abrir_previsualizador`, `revisar_cambios`, `deshacer_cambios`
  (`abordaje` 57/57; `rutasSistema` 137/137 con el piso del mapa reafirmado en 3600 y la razón
  escrita).
- **PAPELEO CONSOLIDADO (pedido de Mario con captura: 46 manifiestos en la raíz)**: el
  manifiesto es UN archivo rolling `MANIFIESTO_SHA256.txt` (versión en la cabecera); los 45
  históricos van a `documentacion/_archivo-consolidado/MANIFIESTOS-HISTORICOS/` y NO viajan;
  13 docs de versiones viejas a `documentacion/historico-actualizaciones/`; índice documental
  único `INDICE-DOCUMENTACION.md`; reglas anti-acumulación declaradas. El ZIP de esta versión
  lleva UN manifiesto.

## v1.0.9 · 2026-11-07 · El generador de ambientes 3D: la casa ya no solo audita y compara — GENERA (con render nativo) y lo corrobora sola

Continuación de «perfecciona mas el 3d y render, corrobora todo lo que mas puedas que sea capaz de generar
ambientes en 3d y render nativo». v1.0.7 dejó **el testigo** (audita el montaje por HTTP) y v1.0.8 **el ojo**
(compara dos fotogramas). Faltaba lo que Mario pide acá: que la casa **genere** el ambiente, no que dependa
de que el modelo lo escriba a mano siguiendo la skill — y que esa capacidad quede **corroborada**, no
prometida.

- **`src/engine/generadorEscena3D.ts`** (nuevo, puro, sin dependencias, determinista): `generarEscena3D()`
  produce los TRES archivos de un ambiente 3D navegable que YA cumple el contrato de la casa: `index.html`
  con CSP `'self'` + importmap al motor vendorizado + JS afuera; `estilo.css`; y `main.js` con **render
  NATIVO** (`new THREE.WebGLRenderer`, `setPixelRatio` capado en 2), `PerspectiveCamera(60,…,0.1,2000)`,
  `HemisphereLight` + `DirectionalLight`, geometría procedural, `OrbitControls`, recorrido por **longitud de
  arco** (`getPointAt`, nunca `getPoint`), testigos DOM (`data-motor/progreso/fotograma`) y limpieza
  (`cancelAnimationFrame` + `dispose()` + `ResizeObserver`).
- **Cinco ambientes** (`ciudad`, `bosque`, `espacio`, `abstracto`, `terreno`), cada uno con su paleta,
  niebla y cuerpo procedural. **Determinista**: misma semilla ⇒ los mismos bytes (reproducible); semillas
  distintas ⇒ obras distintas. El texto generado se escapa (anti-inyección) y el JS va siempre afuera.
- **Corroboración de punta a punta, sin navegador:** la obra generada se pasa por el MISMO testigo que
  audita cualquier escena (`auditarEscena3D`), sirviendo los archivos recién generados y el motor
  vendorizado del disco. La valla comprueba que los **cinco** ambientes salen **ok** con las 11 pruebas y
  **cero ediciones a mano**. Eso es «capaz de generar ambientes 3D» medido, no afirmado.
- **Render nativo REAL, verificado:** la valla confirma que `vendor/three/three.module.js` **exporta de
  verdad** `WebGLRenderer`, `Scene`, `PerspectiveCamera` (y trae `REVISION`), así que la capacidad no es un
  stub ni un CDN disfrazado.
- **Ruta `POST /api/capacidades/generar-escena-3d`** montada en el router de capacidades — **cero líneas
  nuevas en `server.ts`** (sigue clavado en 12.210). Genera el ambiente y lo **auto-audita** en el acto con
  el testigo; la respuesta no es «acá tenes archivos» sino «acá tenes una obra que su propio testigo
  aprueba».
- **Valla ampliada**: `escena3dCableada` pasó de 69 a **86 · 0**. Los casos nuevos cubren la estructura de
  los tres archivos, el render nativo, el recorrido por arco (incluso que `getPoint` no aparezca ni en los
  comentarios), la aprobación del testigo para los cinco ambientes, el determinismo, los exports reales del
  motor y la ruta POST que auto-audita.
- **Honestidad del entorno (intacta):** generar NO es renderizar. Toda escena generada declara `noMedible`
  — un «ok» autoriza a decir «la obra está bien armada y la aprueba su propio testigo», NO «se ve y se
  mueve» (eso sigue necesitando el navegador: el ojo de v1.0.8 sobre tu Dell).

## v1.0.8 · 2026-11-07 · El ojo: comparar dos fotogramas, para poder decir «se mueve con el scroll» (o negarlo con pruebas)

Continuación de «reconstruye y evoluciona todo el 3d y render». v1.0.7 dejó **el testigo**: audita el
MONTAJE de la escena por HTTP (motor servido, importmap, canvas, `data-testigos`) y declara, en cada
veredicto, que **NO midió los píxeles**. La deuda que quedaba era justo ésa: nadie miraba dos fotogramas,
así que «se mueve con el scroll» seguía sin poderse probar ni desmentir. v1.0.8 pone el ojo.

- **`src/engine/fotogramas.ts`** (nuevo, puro, sin dependencias): `compararFotogramas(entrada)` recibe lo
  que el capturador ya redujo a datos —`sha256` de cada PNG, los testigos del recorrido
  (`progreso`/`fotograma`) y una **rejilla de luminancia**— y dicta un veredicto con cuatro casos
  honestos: `iguales` (dos PNG idénticos no mienten aunque el testigo diga que subió → NO autoriza),
  `autorizado` (distintos **+** testigos que suben **+** píxeles que cambian → la única frase que habilita
  decir «se mueve»), `sin-testigos` (fotogramas distintos sin recorrido = HUD/parpadeo/textura, NO
  movimiento) y `sin-rejilla-ni-sha` (sin evidencia no se inventa nada). `compararRejillas` mide región y
  centroide del cambio; si las rejillas son de distinto tamaño, **no medible**.
- **Decisión de criterio, escrita en el código:** la rejilla manda sobre el hash. Si el `sha` difiere pero
  los píxeles son iguales (metadatos, un timestamp en el PNG), **no autoriza** — es el aviso honesto, no un
  falso verde.
- **`preload.cjs`** (nuevo, superficie mínima): expone **una** función por `contextBridge`
  (`cerebronico.capturarEscena`), sin `fs`, sin procesos, sin navegación. El renderer pide la captura; los
  PNG nunca cruzan al renderer.
- **`electron-main.cjs`**: la ventana principal ahora carga el `preload`; un handler
  `ipcMain.handle("cn:capturar-escena")` abre una ventana **oculta** (`backgroundThrottling:false` para que
  Electron no congele y falsee un «no cambió nada»), la posiciona en dos scrolls, captura, reduce cada PNG a
  `sha256` + rejilla 32×32 de luminancia y **se lo POSTea al motor** para que él dicte el veredicto. Todo
  localhost. El handler guarda `ipcMain`/`nativeImage`: sin display real (CI, headless) responde
  `{ ok:false, error }` con el motivo en vez de fingir, y el arranque sigue verde con los stubs del test.
- **Ruta `POST /api/capacidades/comparar-fotogramas`** montada en el router de capacidades corroboradas —
  **cero líneas nuevas en `server.ts`** (el monolito sigue clavado en 12.210, y la valla lo comprueba).
  Rechaza un cuerpo sin `sha` ni rejilla: el ojo no inventa movimiento sin evidencia.
- **Valla ampliada**: `escena3dCableada` pasó de 55 a **69 · 0**. Los casos nuevos cubren los cuatro
  veredictos del ojo, la precedencia rejilla>hash, el `noMedible` en todo veredicto, la ruta POST y su
  rechazo sin evidencia, el cableado IPC con ventana oculta y guardas, y el `preload` de superficie mínima.
- **Honestidad del entorno:** la captura real necesita la máquina de Mario (Electron + display); acá no hay
  pantalla. Por eso `fotogramas.ts` es puro y testeable, y el handler degrada con un motivo claro en vez de
  afirmar «se ve y se mueve».

## v1.0.7 · 2026-11-07 · El testigo de la escena: la casa ya puede auditar una escena 3D por HTTP (y dice lo que NO mide)

Continuación del pedido «instalale el manual del motor 3D…» → «no hay problema, continúa». La deuda que
quedó declarada en v1.0.6 era **el ojo**: el manual y la skill exigían `data-progreso`/`data-fotograma`,
pero la valla los leía **en el texto**. Nadie pedía nada por HTTP, así que «se mueve con el scroll»
seguía siendo una promesa.

- **`src/engine/testigoEscena.ts`** (nuevo, puro, sin dependencias): `auditarEscena3D(traer, ruta)`
  audita la obra **como la ve el navegador**. Pide el motor **por la ruta exacta que declaró el
  importmap**, así que el `404` de `/vendor/three/three.module.js` — o sea la pantalla negra —
  se detecta acá y no a oscuras. Chequea once puntos: respuesta del preview, importmap presente y con
  la ruta del motor vendorizado, el **motor servido de verdad**, JS afuera (regla `csp-ausente`), cero
  CDN, `getPointAt` en lugar de `getPoint`, testigos DOM, bucle con `cancelAnimationFrame`, `dispose()`
  y limpieza.
- **Dos decisiones de criterio, escritas en el código:** (1) el detector de `getPoint` **incluye el
  punto** —`curva.getPoint(t)`— porque excluirlo dejaba sin marcar el bug real (me pasó: la primera
  versión lo perdono); (2) los testigos se aceptan en las dos formas de escribirlos (`data-fotograma`
  en el HTML o `canvas.dataset.fotograma` en el módulo), porque castigar la forma moderna sería
  fabricar un rojo.
- **`noMedible` viaja en TODO veredicto**, incluso en el de una escena perfecta: «LO QUE ESTO NO MIDIO:
  los píxeles. Nadie renderizó la escena ni comparó dos fotogramas… Un veredicto «ok» autoriza a decir
  «la escena está bien montada y sus testigos existen», y NO «se ve y se mueve»». Es la barrera contra
  el `ok` inflado que la casa viene persiguiendo en espejos, parches y lanzadores.
- **Ruta `GET /api/capacidades/testigo-3d?base=…&ruta=…`** montada en el router que ya existe para
  «qué está ACTIVO y qué está solo DECLARADO» — **cero líneas nuevas en `server.ts`** (el monolito sigue
  clavado en su tope de 12.210, y la valla lo comprueba). Solo acepta `127.0.0.1`/`localhost`: una ruta
  de auditoría que trague cualquier `base` es un Rebalsa-servicios disfrazado.
- **Valla ampliada**: `escena3dCableada` pasó de 44 a **55 · 0**. Los once casos nuevos se corren contra
  un `traer` inyectable (sin server, sin red) y cubren los modos de falla reales: escena buena aprueba,
  motor 404 cae y manda a `vendor:3d`, `getPoint` cae, CDN cae, JS inline cae, sin `data-fotograma` no
  se puede afirmar animación, y el `noMedible` está presente en los dos extremos.

**Medido:** `escena3dCableada` **55 · 0** · `skillsPropias` **24 · 0** · `capasSkills` **25 · 0** ·
`abordaje` **57 · 0** · `contextoMedido` **54 · 0** · `motorContexto` **54 · 0** · `manualPerfeccion`
**23 · 0** · `bajoConsumo` **84 · 0** · `rutasSistema` **137 · 0** · `derivaDocumental` **38 · 0**.

**Sigue siendo el límite honesto:** para mirar los píxeles hace falta un navegador. El seam está escrito
en `navegadorReal.ts` (`BrowserDriver`) y Electron ya viaja en el instalador, así que el paso siguiente
es un `capturar(base, {scroll: 0.2|0.8})` que compare dos fotogramas. Hasta entonces, la casa puede
afirmar **montaje y testigos**, no imagen. Rojo preexistente y declarado: `auditoriaSkills` 1.

**Versión:** 1.0.6 → **1.0.7**, propagada con `npm run deriva:fijar`.

## v1.0.6 · 2026-11-07 · Capacidad 3D instalada y cableada (motor offline + skill + verificación)

Pedido de Mario: «¿lo podemos implementar en CerebroNico? no para el caso específico de la montaña
rusa, fue solo un ejemplo de tarea; si es posible, ¡comienza a instalar y cablear!».

**Diagnóstico previo (v1.0.5, medido):** la casa no tenía 3D. `three` no estaba en
`dependencies`/`devDependencies`; `WebGL` aparecía **una sola vez** en todo el código propio
(`src/data/skills100.ts:661`, y era el *nombre* de un panel propuesto); `manuals.ts` no tenía ni un
capítulo de WebGL/3D/shader/canvas; de las 20 skills `cn-web-*` ninguna era espacial; la cerradura
(`csp-ausente`) empuja a `default-src 'self'`, que **corta el CDN** por donde el modelo intentaría
cargar three; y `navegadorReal.ts` sólo valida acciones — no había ojo para un fotograma, así que
"se mueve con el scroll" no era verificable.

### Qué se instaló y cómo queda cableado

- **`vendor/three/`** — three.js **r169** (`build/three.module.js`, 1,27 MB) + `addons/OrbitControls.js`
  (31 KB), **copias intactas del paquete npm**, con `LICENCIA.txt` (MIT), `VERSION.txt` y
  `vendor-3d.json` con **sha256 de cada archivo**. Sin red, sin CDN, versionado dentro del ZIP.
- **`scripts/preparar-vendor-3d.mjs`** (`npm run vendor:3d`, `vendor:3d:verificar`) — copia el motor a
  la **raíz de datos**, que es la segunda base con la que resuelve el preview
  (`server/sandboxEstatico.ts:203` → `[raizEfectiva().dir, projectRoot]`, y `projectRoot` es
  `PROJECT_ROOT = raizValidada.raiz`, `server.ts:713`). Es **idempotente** (compara sha256, no
  "existe") y **sale con código ≠ 0 si no verifica**: los extremos pueden encadenarlo sin creerse cuentos.
- **Cable en los dos extremos**: `iniciar_todo_windows.bat` lo prepara antes de servir (avisa con el
  motivo si no verifica, **sin cortar el arranque**: los proyectos 2D siguen andando) y
  `electron-main.cjs` llama a `prepararVendor3d()` después de los packs (no frena la ventana).
- **`skills/cn-web-escena-3d/`** — materializada **por el generador de la casa** desde
  `scripts/habilidades-cn.mjs` (fila nueva), o sea reproducible y sin deriva: el contrato validó sus
  5 herramientas contra el **inventario real** del Creador (`crear_sitio`, `crear_archivo`,
  `previsualizar_sitio`, `auditar_pagina`, `preflight_rendimiento`) y sus 5 evidencias contra el disco.
  La receta fija los cinco puntos que separan una escena que funciona de una negra: **importmap**
  (OrbitControls importa `three` pelado), **CSP `'self'` con el JS afuera** (respeta la cerradura en vez
  de esquivarla), **prohibición explícita del CDN**, **`getPointAt` en lugar de `getPoint`** (sin
  reparametrización por longitud de arco el recorrido frena y alabea en las curvas), y **`dispose()` +
  cancelación del `requestAnimationFrame`** (el preview comparte origen entre proyectos).
- **Valla nueva `tests/escena3dCableada.test.ts` (31 · 0, registrada en `validar.mjs`)** — ateora el
  cable, no la idea: el motor es r169 y pesa lo que pesa un motor; los hashes del manifiesto cierran con
  el disco; el instalador copia, **no duplica** (2 verificados / 0 copiados en la segunda pasada) y
  **se da cuenta cuando alguien mutila el archivo a mano** (prueba destructiva con asiento temporal, y
  la corrida siguiente lo repara sola); la skill exige importmap/CSP/dos-fotogramas; `csp-ausente` sigue
  en su sitio (no se la aflojó para dejar pasar un CDN); `generar-skills-cn --verificar` reproduce sin
  deriva; y los dos extremos preparan el motor antes de servir.

### Conteos del corpus que subieron (con la razón escrita en el test)

`skillsPropias`: `100 → 101` declaradas · `100 → 101` carpetas `cn-*` · `200 → 201` total del corpus.
Se **suben** porque el cuerpo creció de verdad (fila + SKILL.md + evidencia); no se afloja ninguna
comprobación.

### El manual del motor 3D, en el MOTOR (para que cualquier proveedor lo sepa manipular)

Pedido: «instalale el manual del motor 3D asi todo modelo de distinto proveedor sabe manipularlo».
`src/engine/manuals.ts` ya decia el principio: *el conocimiento viaja en el motor, no en el modelo —
«un qwen de 0,5 B, GLM, Gemini reciben el mismo manual y trabaja igual de bien»*. Faltaba la pagina
del 3D. Se instalaron **dos entradas `PROCEDURES`** (KbEntry, `table: "manual"`):

| id | que ensena | weight |
|---|---|---|
| `proc-motor-3d` | Las 10 paradas obligadas: `vendor:3d` antes de escribir codigo, los TRES archivos (JS afuera), el **importmap** con las rutas reales, CSP `'self'`, renderer/camaras/luces, `ResizeObserver`, scroll→`progreso` con lerp, **`getPointAt` (longitud de arco) y no `getPoint`**, `Matrix4.lookAt` con arriba estable, `data-motor`/`data-progreso`/`data-fotograma`, `dispose()` + cancelar el `requestAnimationFrame` | 0,97 |
| `proc-motor-3d-verificar` | Como se prueba: verificacion del vendor, importmap presente y 0 `<script>` inline, `data-fotograma` **subiendo** entre dos lecturas, dos fotogramas distintos con scroll 20 % y 80 %, el alabeo del encuadre como sintoma de `getPoint`, y `preflight_rendimiento`. Cierra con la regla de la casa: lo que no se midio **se dice**, no se adverbializa | 0,96 |

Cableado y probado: las entradas entran por `MANUAL_ENTRIES` → `SEMILLA_COMPLETA`
(`src/engine/knowledgeBase.ts`), o sea **sobreviven a recargar la base desde disco** — que es justo el
defecto que el comentario de esa constante documenta. Y la valla nueva las comprueba **cargadas**, no
mencionadas: `CAPACIDAD 3D CABLEADA` paso de 31 a **44 · 0** agregando 13 comprobaciones de manual,
incluida una matriz de **7 modos distintos de pedir 3D** (castellano rioplatense, «tipo blender»,
«subirme al carrito», «recorrido en primera persona», «shader y render») contra las `keys` declaradas,
y un control de **no-deriva**: los nueve puntos duros (`importmap`, `vendor/three/three.module.js`,
`default-src`, `getPointAt`, `data-progreso`, `data-fotograma`, `dispose`, `ResizeObserver`,
`devicePixelRatio`) tienen que aparecer tanto en el manual como en la skill.

Consumidores del manual, todos verdes despues de la tanda: `abordaje` **57 · 0**, `contratoAccion`
**56 · 0**, `manualPerfeccion` **23 · 0**, `contextoMedido` **54 · 0**, `motorContexto` **54 · 0**,
`skillsPropias` **24 · 0**, `capasSkills` **25 · 0**, `bajoConsumo` **84 · 0**, `derivaDocumental`
**38 · 0**, `rutasSistema` **137 · 0**.


### Medido en este árbol

`escena3dCableada` **31 · 0** · `skillsPropias` **24 · 0** · `capasSkills` **25 · 0** ·
`creadorWeb` **158 · 0** · `bajoConsumo` **84 · 0** (el bloque nuevo del `.bat` volvió a quedar sin
tildes, como exige la página OEM de `cmd`) · `espejosPoderesCableados` 16 · 0 · `resiliencia` 38 · 0 ·
`puertosCableados` 95 · 0 · `rutasSistema` 137 · 0 · `test:exe` 0.

**Rojo declarado, no tocado:** `auditoriaSkills` 26 · 1 → la auditoría marca `frontmatter_roto` en
**15 skills `cn-*` preexistentes** (`cn-app-android`, `cn-automejora-frenada`, `cn-datos-buscar-en-miles`,
…); **la skill nueva no está en esa lista** y el generador-reportó "100 ya coincidían" (no las reescribió),
o sea que el rojo viene de antes. Requiere su propia pasada (ojo: es un parser de YAML del auditor, no
15 archivos rotos).

**Todavía no está (y no se hizo a medias):** el **ojo que mira el fotograma**. La skill *exige*
`data-progreso`/`data-fotograma` y la valla lo verifica en el **texto**, pero no existe un
`capturar(previewUrl)` real: `navegadorReal.ts` define el `BrowserDriver` que haría falta y no hay
Playwright en `devDependencies`. Es el paso 4 del plan y se puede montar sobre el Electron que ya viaja
en el instalador.

**Versión:** 1.0.5 → **1.0.6**, propagada con `npm run deriva:fijar`.

## v1.0.5 · 2026-11-07 · Los 3 espejos sin habilidad (declarados) y la lupa de `resiliencia`

Dos preguntas de Mario cerradas con medición: «¿puede ser que 3 espejos no tengan
habilidad/nombre?» y «encárgate de resiliencia».

### 1 · Sí: son TRES, y el problema no era la ausencia sino el silencio

Inventario medido con el módulo cargado (no a ojo): **13** ids en `IDS_ESPEJOS`; **8** con poderes en
`PODERES`; **2** con despacho propio (`espejo.medicina`, `espejo.codigo`, que resuelven `accion`
dentro de su propio `.ejecutar` y por eso no figuran en `PODERES`); y **3 sin ninguna habilidad**:
**`espejo.generalista`, `espejo.creadores`, `espejo.fisicos`**. Los tres **sí tienen `nombre`**
(están registrados con «Espejo · …»): lo que no tienen son acciones.

Lo grave era cómo estaba declarado el silencio: `potenciarEspejos` hacía `if (!poderes) continue`,
así que un `{"accion": "…"}` dirigido a esos espejos caía igual al handler clásico — que ignora
`accion` y devuelve su orden de siempre. **El neural recibía un `ok` y seguía creyendo que la acción
había existido.** Y el `CATALOGO_TURBO` que lee el modelo nombraba 8 de 13 y callaba el resto.

Curas (sin inventarles aritmética a nadie, que sería peor):
- `ESPEJOS_SIN_PODERES` y `ESPEJOS_CON_DESPACHO_PROPIO` quedan **declarados** en
  `src/engine/reflejo/poderes-espejos.ts`.
- Un espejo sin poderes ahora **rechaza** la `accion` con un motivo que dice qué espejos sí tienen y
  que él atiende su orden clásica. Sin `accion`, hace lo de siempre (probado).
- `CATALOGO_TURBO` pasa a nombrar los tres casos: potenciados, despacho propio y sin poderes.
- **Valla nueva `tests/espejosPoderesCableados.test.ts` (16 · 0, registrada en `validar.mjs`):**
  ateora el reparto — las tres listas tienen que cubrir el inventario, excluirse entre sí y no tener
  sobrantes; y prueba conducta (rechazo dicho, clásico intacto, idempotencia, medicina no interceptada).

**Bug que la valla nueva agarró antes de salir:** al principio las dos constantes nuevas estaban
declaradas **después** de `CATALOGO_TURBO`, que se evalúa en tiempo de carga →
`ReferenceError: Cannot access 'ESPEJOS_CON_DESPACHO_PROPIO' before initialization` al importar el
módulo, es decir **la IDE entera no arrancaba**. Se reordenó el bloque antes del catálogo. Es
exactamente el tipo de error que se cuela cuando se "arregla" sin correr la suite.

### 2 · `resiliencia`: el rojo era la lupa, no el cable

«server.ts importa todo lo que usa del motor» llevaba rojo acusando a **`resolver`**. Medido:
`resolver` lo exporta `src/engine/permisos.ts`, y en `server.ts` la única ocurrencia que el detector
tomaba como llamada era **un comentario en español** (línea 1052: «…puede no resolver (PATH sin el
embebido…)»), **idéntica en el ZIP v2.3.23** — o sea, preexistente y ajena a los puertos.

El detector ya construía `sinComentarios` para leer los bloques de `import`, pero medía el **uso**
sobre la fuente cruda. Se corrigió la lupa (medir el uso sobre el código sin comentarios) y se
agregaron tres comprobaciones que prueban que no se aflojó nada:
un nombre que sólo aparece en un comentario no cuenta como uso; en el mismo archivo, la llamada real
sí cae; y una clave de objeto (`{ resolver: fn }`) no se confunde con una llamada.

**`resiliencia`: 34 · 1 rojo → 38 · 0.**

### 3 · Nota sobre los rojos "fantasma" del entorno

Dos suites (`espejos`, `espejos-personalizados`) y cuatro antes daban crash o rojo por **dependencias
que el sandbox no tiene** (`js-yaml`, `smol-toml`, declaradas en tu `package.json`). Instaladas aparte
y re-corridas: `espejos` **76 · 0**, `espejos-personalizados` **29 · 0**, `permisos` 33 · 0,
`capasSkills` 25 · 0, `perfilParches` 31 · 0, `parchesSemilla` 47 · 0. El `node_modules` prestado
**no viaja** en el ZIP.

### 4 · Estado de la batería (26 suites + 2 python)

Verdes: `espejosPoderesCableados` 16 · 0 (nueva) · `resiliencia` 38 · 0 · `espejos` 76 · 0 ·
`espejo` 66 · 0 · `espejos-personalizados` 29 · 0 · `espejosServidor` verde · `espejoTachaDeclaradas`
17 · 0 · `rutasEspejosDerivadas` 6/6 · `permisos` 33 · 0 · `capasSkills` 25 · 0 · `perfilParches`
31 · 0 · `parchesSemilla` 47 · 0 · `puertosCableados` 95 · 0 · `puertosArranque` 72 · 0 ·
`arranqueVentanas` 25 · 0 · `rutasSistema` 137 · 0 · `bajoConsumo` 84 · 0 · `entradaIntacta` 6 · 0 ·
`hemisferios` 36 · 0 · `autoLlamado` 29 · 0 · `derivaDocumental` 38 · 0 · `lanzadorRepliegue` 27 · 0 ·
`telemetriaHonest` 19 · 0 · `indicadorServicios` 27 · 0 · `reavivarServicio` 54 · 0 ·
`arranqueElectron` 30 · 0 · `test:exe` 0 fallos · `test:puente` 7 · 7.

**Ya no queda ningún rojo declarado.** Deuda que sigue en pie (otra cosa, no un rojo): el plan abierto
del turno todavía no alimenta `REANUDAR.md`; el puente adoptado no se puede reiniciar desde el botón;
`memoria.md` tiene dos bloques `BLOQUE-DINAMICO:ESTADO`.

**Versión:** 1.0.4 → **1.0.5**, propagada con `npm run deriva:fijar`.

## v1.0.4 · 2026-11-07 · Lo atómico: el rechazo total ahora lo GRITA (rojo histórico curado en el módulo)

Se preguntó «¿qué pasa con lo atómico?» por el rojo preexistente que quedó declarado en v1.0.3
(`parchesSemilla` → *«atómico: la línea dice REVERTIDO»*).

**Diagnóstico medido.** La valla `tests/parchesSemilla.test.ts:79` exige que la línea que lee el
operador contenga `REVERTIDO` cuando el motor devolvió la semilla entera. El módulo la escribía
**en minúscula y al final de la frase** (`parche RECHAZADO y revertido (1 causa): …`). El detalle que
explica por qué el rojo era tan viejo: **las dos versiones del archivo** —la del árbol y la del ZIP
v2.3.23 que se trajo en v1.0.3— tenían la misma cadena. No era que el parche nuevo estuviera mal;
era que la valla y el módulo nunca se pusieron de acuerdo en **cómo se anuncia un revertido**, y
nadie atesoraba ese vínculo.

**Curado en el módulo, no en la valla** (bajarle el piso a una valla para fabricarse un verde es lo
que la casa prohíbe):

- `armadoRechazo()` → `REVERTIDO · parche RECHAZADO (N causas) — semilla original intacta: <causa>`.
  **El estado primero, el detalle después**: quien lee un log tiene que ver qué pasó antes de leer
  por qué.
- El ramo de perfil nulo también reporta `revertidoPorCompleto: true`, así que su línea grita igual
  (antes: dos ramos, mismo informe, distinto grito).
- `src/engine/perfiles/perfilParches.ts` — la capa que **ve el usuario**: los dos rechazos que de
  verdad devuelven todo ahora dicen `REVERTIDO · …`. El ramo de YAML ilegible se quedó sólo con
  `RECHAZADO`: ahí nunca se aplicó nada, y decir «REVERTIDO» sería mentira.

**La valla que faltaba.** Se agregó el **invariante**, no otro caso suelto: para todo resultado con
`revertidoPorCompleto: true`, la línea dice `REVERTIDO` y la semilla que vuelve trae el tamaño de la
que entró. Cuatro caminos cubiertos (operación inválida, piso de 116 entradas, perfil nulo,
demasiadas operaciones), cada uno con su **propia base** — `rMin` arrancó de 116 entradas y no de
120, que fue el error de mi primer intento de invariante.

**Medido:** `parchesSemilla` **38 · 1 rojo → 47 · 0**. `perfilParches` 31 · 0, `permisos` 33 · 0,
`capasSkills` 25 · 0 siguen intactos. Rojo declarado y no tocado: `resiliencia` 1 (ajeno a este
archivo).

**Versión:** 1.0.3 → **1.0.4**, propagada con `npm run deriva:fijar`.

## v1.0.3 · 2026-11-07 · El motor al día: 13 módulos traídos del ZIP v2.3.23, con diff y con medición

Pedido: «4 diff» — cerrar el punto 4 de la deuda declarada (13 módulos del motor estaban más
adelantados en el ZIP v2.3.23 que en este árbol). Documentación de la operación:
**`documentacion/diffs-motor-v2.3.23/README.md`**, con 13 `.patch`, `_resumen.json` y el respaldo
de cada archivo reemplazado en `respaldo-arbol/`.

- **Método, no intuición:** línea base de 31 suites que miran esos módulos, copia de hoja a núcleo,
  y reversión individual si alguna valla se ponía roja. Contar líneas o hacer `grep` de símbolos
  no cuenta como prueba.
- **13 de 13 aplicados.** En la primera pasada habían quedado 11: `knowledgeBase.ts` y
  `motorContexto.ts` fueron revertidos por un `ERR_MODULE_NOT_FOUND` que resultó ser **de mi
  entorno de pruebas** (falta `js-yaml`, dependencia declarada en `package.json:95`), no del código.
  Con `js-yaml` disponible, las cuatro suites afectadas quedaron verdes (**41·0, 96·0, 54·0, 22·0**)
  y se aplicaron.
- **Símbolos nuevos que el árbol no tenía:** `motorContexto` 7 · `conciencia` 6 · `knowledgeBase` 6 ·
  `parchesSemilla` 6 · `dependenciasProyecto` 5 · `grafoProyecto` 4 · `importChecker` 2 · `manuals` 1.
- **Efecto secundario: 4 falsos rojos de la base desaparecieron** (`permisos` 31·2 → **33·0**,
  `capasSkills` crash → **25·0**, `perfilParches` crash → **31·0**, `parchesSemilla` 4 rojos → 1).
- **Autocorrección registrada:** `_f8f9.md` estaba declarado *intocable* porque un `grep` lo
  encontraba en `perfilParches` e `insertar_fases`. Corrida la valla, se entiende al revés:
  `perfilParches` comprueba que **ya no esté**. Movido a la papelera y la suite pasó a 31·0. La
  lección quedó en `MANIFIESTO-LIMPIEZA.md`: declarar algo intocable por un `grep`, sin correr la
  valla, es una defensa falsa.
- **Rojos preexistentes, declarados y no tapados:** `parchesSemilla` sigue con 1 rojo
  (`atómico: la línea dice REVERTIDO` — falla igual con la versión vieja del archivo) y
  `resiliencia` con 1.
- **Versión:** 1.0.2 → **1.0.3**, propagada con `npm run deriva:fijar`.

## v1.0.2 · 2026-11-07 · COMODIDAD, CABLEADO Y LIMPIEZA (los 7 puertos: 6 en el arranque + :3500 a demanda)

Segunda pasada sobre la revisión de los siete puertos (`CORRECCIONES-PUERTOS-v1.0.1.md`).
Pedido de Mario: «implementa todo lo que veas en mi árbol, son cosas de comodidad del
usuario, con lógica, cableado, manifiestos, y haz limpieza; resume todo y actualiza la
documentación». Informe completo: **`COMODIDAD-Y-LIMPIEZA-v1.0.2.md`**.

- **Comodidad 1 — «Reconectar» ya no levanta dos puentes sobre el :5000.** `restart()` no
  tenía guard de reentrancia y soltaba `userCancelled` a los 800 ms sin comprobar que el
  proceso viejo hubiera muerto: si el `exit` del SIGTERM llegaba después, el manejador lo
  leía como caída y spawniaba un segundo puente → `EADDRINUSE`, reinicios zombis y el panel
  en OFF justo después de «listo» (visible en el log de arranque de Mario). Ahora se espera
  la salida real, un solo reinicio vuela a la vez y el segundo pedido comparte el primero.
  Cinco ediciones en `server.ts` **sin sumar una línea** (monolito al tope del contrato).
- **Comodidad 2 — la muestra incompleta se ve.** `telemetria.ts` ya devolvía
  `incompleto`/`motivos`/`heredados`/`presupuestoMs` y `App.tsx` los guardaba, pero
  `PortTelemetry` no los declaraba: con CPU al 100 % los chips pintaban el último valor
  **heredado** como si fuera recién medido. Se declaran en el tipo y la cabecera muestra
  `MUESTRA PARCIAL (n)` con qué puertos vienen de la tanda anterior.
- **Comodidad 3 — un solo lugar para fijar la versión.** Ocho .bat de un solo uso
  (`ACTUALIZAR-A-2.3.1x`, `FIJAR-1.0.0`, `FIJAR-VERSION-1.0.0`, `build-2.3.14`) pasan a
  **`FIJAR-VERSION.BAT`** + `scripts/fijar-version.mjs`: escribe sólo la semilla
  (`src/constants.ts`) y propaga con el derivador oficial.
- **Limpieza con manifiesto (51 archivos, nada borrado).** 32 residuos de sesión de la raíz,
  8 sondas muertas en `tests/`, 8 .bat de versionado, 2 temporales que el propio
  `empaquetar.mjs` declara efímeros y `build-2.3.14.log` → `.cerebro-papelera/limpieza-2026-11-07`,
  con `MANIFIESTO-LIMPIEZA.md` y `_MANIFIESTO.json`. Borrado en serio: 3 `__pycache__/`.
  Declarados intocables (con razón escrita): `_f8f9.md`, `_tc_out.txt`, `__init__.py` +
  `routers/` + `utils/` + `espejos_servidor/` (el espejo FastAPI que exige
  `tests/espejo.test.ts:62`) y todo el estado real del usuario.
- **Piso de versión reconocido.** `tests/rutasSistema.test.ts` exigía `SEMVER ≥ 1.86.3`
  (un número del linaje anterior) y estaba rojo desde que el árbol se reescribió a 1.0. Se
  reafirma el piso del linaje nuevo **con la razón escrita dentro del test**: bajar un piso
  sin explicarlo es la manera clásica de fabricarse un verde.
- **Valla nueva (grupo [7] de `tests/puertosCableados.test.ts`):** congelá el guard de
  reentrancia, la bandera de kill esperada, el contrato declarado de la telemetría, el aviso
  de muestra parcial, los seis chips intactos, el manifiesto de limpieza, la raíz limpia y
  el `FIJAR-VERSION.BAT` único.
- **Autollamado reparado de raíz (la pregunta de Mario: «¿qué pasó con el autollamado cuando quedan tareas pendientes?»).** `server/routers/autoLlamado.ts` decide con DOS fuentes y una sola acepta: `plan: []` a propósito (el navegador no es dueño del plan) y `REANUDAR.md` como única fuente de «todavía hay trabajo». `src/engine/hemisferios.ts:80` jura que *el lanzador escribe REANUDAR.md y el motor lo lee*: medido, **el .bat nunca lo escribió**. Sin parte, cada cierre respondía `nada → callar`, así que el «seguí automático» no estaba apagado: estaba **ciego**. Cura: el lanzador escribe el parte (`## Estado de servicios` + `## Trabajo pendiente`) en la raíz de datos, y el frente ahora **muestra el `motivo`** cuando el lazo se calla (apagado, agotado y sin-tareas ya no se ven iguales). Deuda declarada: el plan abierto del turno todavía no alimenta el parte — hace falta un escritor del lado del `GestorPlanes`, y no se improvisa a medias.
- **Versión:** 1.0.1 → **1.0.2**, propagada con `npm run deriva:fijar`.

## v1.0.1 · 2026-11-07 · LOS SIETE PUERTOS, CABLEADOS HASTA EL FINAL

Queja de Mario sobre el arranque: «revisa los puertos, son 7 … **en el arranque no
encienden todos los puertos**; fijate en la cabecera y en la hoja de ruta de la barra
de tareas que los indicadores estén bien cableados. **Un comando py se abre y se
cierra** … el 5000 se cae, no muy seguido, pero **el 5102 no arranca**. Revisión
integral.»

Medido en dos árboles —el ZIP v2.3.23 y el árbol propio de Mario (versión oficial
1.0.0)—: **los siete archivos de arranque son byte a byte iguales en los dos**, así
que el diagnóstico y la cura sirven para ambos. Nada de esto estaba vallado; por eso
se rompió. El detalle completo, con las pruebas, está en
**`CORRECCIONES-PUERTOS-v1.0.1.md`**.

| # | Defecto medido | Dónde | Cura |
|---|----------------|-------|------|
| 1 | La hoja de ruta (barra de Tareas → *Servicios*) pintaba **5** puertos; la cabecera, 7 | `arranqueVentanas.ts` / `interruptoresServicios.ts` | nuevo `INVENTARIO_SERVICIOS` (7) para medir y pintar; el plano de ventanas sigue en **2 CMD + 3 PY** (contrato del usuario, intacto) |
| 2 | **El .EXE nunca encendió ningún pack**: sólo lanzaba el server; el instalador no corre el `.bat` | `electron-main.cjs` | `arrancarDaemonsPython()` con `isPortUp` previo, interruptor `servicios.json` respetado, orden motor→creador→memoria y limpieza en `before-quit`. `npm run test:exe`: **16 fallos → 0** |
| 3 | **El «py que se abre y se cierra»**: el reanimado corría `cd /d C:\Cerebronico` + `scripts\x.py` (ruta relativa) | `server.ts:4348` | `raizProyecto: process.cwd()` — la raíz de **instalación**, donde los scripts existen |
| 4 | **El :5000 perdía la autocura para siempre**: `puertoRobado` nunca volvía a `false` y el `exit` lo convertía en «reinicios agotados» | `server.ts` (`startAgentBridge`) | la bandera se limpia en cada intento + una caída tras un minuto sano no gasta los 5 reinicios |
| 5 | Adentro del puente, `serve_forever()` al aire libre: un OSError del accept **mataba el proceso** | `agent_bridge_5000.py` | lazo de reapertura con anuncio, backoff y techo honesto (10). Probado **rompiéndolo a propósito**: `tests/puente_autocura_test.py` (7/7) |
| 6 | El motor :5103 nacía **después** de que :5100 preguntara si existía → memoria sin cerebro en todo arranque frío | `iniciar_todo_windows.bat` | el motor se lanza primero y se espera su escucha antes de fijar `HINDSITE_API_URL` |
| 7 | :5102 y :5103 se lanzaban **sin verificar**: si morían, el lanzador seguía como si nada | `iniciar_todo_windows.bat` | bucles `:wait_creador` / `:wait_motor` con `[OK]`/`[ADVERTENCIA]` y el log nombrado, como tenía :5100 |
| 8 | **Logs de arranque vacíos** con el daemon vivo (Python bufferiza al redireccionar) | `.bat`, `electron-main.cjs`, `server.ts` | `PYTHONUNBUFFERED=1` en el lanzador y en los hijos; `-u` en el puente |
| 9 | `netstat` + `findstr ":5102"` leía como «ya está arriba» cualquier :5102x o una conexión saliente | `iniciar_todo_windows.bat` | puerto anclado con espacio (`":5102 "`) + inventario final de los 7 medido uno por uno |
| 10 | Con Python del sistema (sin `runtime\python-embed`), `CN_PYTHON` no se definía → el reanimado caía en la **asociación de archivos** de Windows | `iniciar_todo_windows.bat` | `CN_PYTHON` definido en las tres ramas del intérprete |
| 11 | La cabecera rotulaba `:3500` como «Backend de agentes» y `:5000` como «Microservicios/FastAPI» | `Header.tsx` | rótulos que dicen lo que el puerto es (sandbox / Puente PC) |

**Valla nueva:** `tests/puertosCableados.test.ts` (registrada en `npm run validar`)
congela las once curas sobre los archivos reales — el cable, no el módulo puro.
**Versión:** 1.0.0 → **1.0.1**, propagada con `npm run deriva:fijar`
(`src/constants.ts` sigue siendo la única semilla).

## v2.3.23 · 2026-11-06 · EL LOCKFILE DEJÓ DE CONTRADECIRSE (y la deuda estaba mal declarada)

Deuda declarada desde hace versiones: «`package-lock.json` pinea `tapable 2.3.8` con `resolved` inexistente → 404 en `npm install`». **Medido con el candado nuevo, la declaración era corta y estaba mal enfocada:** no era una entrada, son **SIETE**, y el patrón es el mismo en las siete — alguien subió el campo `version` a mano y dejó la `resolved` y la `integrity` del tarball viejo.

```
@jridgewell/remapping        2.3.8 → tarball 2.3.5
fsevents                     2.3.8 → tarball 2.3.4
lightningcss (+linux-x64-gnu, +linux-x64-musl)  1.33.0 → tarball 1.32.0
prismjs                      1.33.0 → tarball 1.30.0
tapable                      2.3.8 → tarball 2.3.4
```

Un lock que se contradice a sí mismo es un `npm install` que no entra en la máquina de otro: 404 buscando la versión declarada, o `integrity checksum mismatch` porque el hash pertenece al tarball viejo.

- **Se repara bajando `version` a la del tarball, no subiendo la URL.** `resolved` + `integrity` son un par que se valida contra el tarball real: reescribir la URL deja un hash huérfano. Alinear `version` deja un lock coherente con lo que efectivamente se va a bajar — que es lo único que se le pide a un lockfile.
- **`scripts/candado-lockfile.mjs`** es **dry-run por defecto** (`npm run lock:candado`), idempotente, y cambia **sólo** la clave `version` de esas entradas: nada de ordenar el JSON — un diff de 601 entradas es inauditable. `--aplicar` repara.
- **Candado permanente** (`candadoLockfile.test.ts` **15/15**, registrada → catálogo 295): el lock publicado no puede tener ninguna entrada cuyo `version` contradiga su propio `resolved`. La deuda queda **cerrada**, no declarada: ya no puede volver sin ponerse roja.

**Arreglo de mi propio registro, además:** cité `npm run skills:proponer-orden` en la entrega anterior y **nunca lo registré** en `package.json`. Está agregado y vallado. Es la misma clase de defecto que vengo cazando desde F13: escribir que algo existe sin comprobar que existe — acá, un comando que no estaba.

**Verificado:** `candadoLockfile` 15/0 · `cierreDeuda71b` 8/0 · `skillsPropias` 24/0 · `auditoriaSkills` 27/0 · `entradaIntacta` 6/0 · `techoContexto` 115/0 · 601 entradas de lock coherentes · `deriva-documental` SIN DERIVA · `superficie --verificar` CONTRATO INTACTO · rearma de las 7 partes con sha256 coincidente.

### lo que este asiento NO dice

- **No puedo verificar `npm install` contra el registry desde este sandbox** (sin red). Lo que sí verifiqué es la **coherencia interna** del lock, que es el defecto que estaba declarado: ahora ninguna entrada declara una versión que no sea la de su propio tarball. Si el registry rechaza otra cosa, el síntoma será distinto y el candado no lo tapará.
- **La UI de presets de permisos (F14-bis) y la ejecución de F15 siguen esperando tu decisión**, no mi criterio: la primera define si el preset aprieta el candado, la segunda define si manda el `name:` o la carpeta en 78 rutas.
- FASE 10 la inicia Mario; `Tareas → Servicios` 5 no 7.

---

## v2.3.22 · 2026-11-06 · LO QUE DECÍA «CUATRO PUERTOS» Y LA LISTA PARA DECIDIR F15

Después de cerrar el tramo 10→18 quedan deudas declaradas. Este asiento paga dos y **corrige una que yo había declarado mal**.

- **① Tres textos decían «4 puertos» en un sistema de siete.** `brain.ts:545` —el `nucleo` que reciben los modelos chicos— decía «Puertos: IDE 3000 · sandbox 3500 · puente 5000 · Ollama 11434», y la semilla de `README.md` que se escribe en **cada proyecto nuevo** repetía la lista. Un modelo al que se le enumeran cuatro niega los otros tres **citando**, y acá la cita le llega hasta al `micro`. Puestos los siete, en el orden del plano.
- **② Anti-regreso, con comentarios fuera.** Valla nueva en `puertosArranque` (66 → **72/0**): ningún texto de `brain.ts`, `App.tsx`, `rutasSistema.ts` o `constants.ts` puede enumerar menos de siete. **Mira sólo líneas de código, con los comentarios removidos** — es la **cuarta vez en el día** que una valla de «buscar esta cadena» se dispara contra el texto que la explica (el escalón, el auditor, el registro de `validar.mjs`, y acá el comentario que cuenta qué se corrigió). Sin exclusión de comentarios, la valla castiga documentar.
- **③ Lo que NO toqué, y por escrito.** `RightSidebar.tsx:1335` dice «IDE en :3000 · App en :3500» dentro del panel del sandbox: nombra los **dos extremos que ese panel usa**, no hace una afirmación sobre la casa. Reescribirla a siete era meter ruido en una etiqueta correcta. Medir antes de «arreglar» sigue dando resultados.
- **④ Corrección del registro (F17, y es mía).** En v2.3.20 declaré como deuda que «el puente `:5000` no usa todavía el CAS», repitiendo la redacción del plano. **Medido** `agent_bridge_5000.py` (1065 líneas): su único `.cerebro-db` es `auditoria.jsonl`, que **ya es append-only**, y **no escribe `planes.json`**. O sea: hoy hay **un** escritor de la sesión, no dos; el CAS queda como el mecanismo para cuando aparezca el segundo, pero **no había nada que cablear**. Deudo decirlo así: declaré una tarea por leer el plano en vez de medir el archivo, y la valla (`★ el puente :5000 NO comparte el documento de sesión`) ahora fija la medición, no mi memoria.
- **⑤ Borrador de orden para F15 (`documentacion/PROPUESTA-ORDEN-SKILLS.md`, y `npm run skills:proponer-orden`).** El plano dice que el orden se decide **con Mario delante**; esto es ese «delante». Agrupa las **79 rotas por arreglo** (`nombre_distinto 78`, `nombre_invalido 13`, `sin_frontmatter 1`, `sin_descripcion 1`) con la decisión explícita en cada grupo — ¿manda el `name:` o manda la carpeta? — y **no aplica nada**. Que un script de «propuesta» termine renombrando 78 rutas es exactamente el cambio silencioso que este repo persigue desde la FASE 11.

**Verificado:** `puertosArranque` **72/0** · `tsc --noEmit` exit 0 con salida vacía · `deriva-documental` **SIN DERIVA** · `superficie --verificar` **CONTRATO INTACTO** · `auditoriaSkills` 27/0 y `skillsPropias` 24/0 después de regenerar la propuesta (el generador sigue cuadrando con el disco).

### lo que este asiento NO dice

- **No renombré ninguna skill ni ninguna carpeta.** Eso espera el criterio de la lista de arriba.
- **La UI sigue sin selector de presets** (deuda real de F14), y la dejo declarada con su razón: ofrecer `lectura` o `escritura-workspace` **sin enforcement** sería una etiqueta que promete lo que el motor no cumple — justo lo que la valla de la FASE 14 castiga en el otro sentido. Antes de la UI hace falta decidir si el preset nuevo aprieta el candado (retrocede capacidades) o no; eso es F14-bis y es de Mario.
- FASE 10 la inicia Mario; `Tareas → Servicios` lista 5 y no 7; el `package-lock` con `tapable` heredado sigue ahí.

---

---
## v2.3.21 · 2026-11-06 · FASE 18: LA ÚLTIMA DEUDA, CERRADA DECLARÁNDOLA

Con esto se cierra el tramo **FASE 10 → FASE 18** de `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md`.

`perfeccion.json` nombraba a 7.1b desde la FASE 7: «queda 7.1b: el preview llamando a `/api/conciencia` desde su propio server estático». La FASE 18 no pide construirla: pide **cerrarla**, y da las dos salidas legítimas — «con el mismo criterio: evidencia + suite, **o se retira del plano declarándolo**. No se deja abierta indefinidamente porque es poquito».

- **MEDIDO, no recordado.** 446 archivos del paquete (`scripts`, `src`, `server`, `web-cerebronico`; fuera `node_modules`, `dist`, `.cerebro-db`). **Sólo dos mencionan `/api/conciencia`, y los dos son su casa**: `server/routers/concienciaSandbox.ts` (el endpoint, con sus cuatro rutas) y `src/engine/concienciaSandbox.ts` (su estado). **Ningún server estático ni de preview lo llama.** La deuda, tal como está redactada, no existe: los parches `v1.62.x` del sandbox se la comieron y nadie bajó la bandera.
- **Se retira declarándola, no borrándola.** `perfeccion.json` conserva la línea y le pega el cierre con fecha y porqué. Borrar el registro es exactamente cómo una deuda resurge a los seis meses con cara de novedad.
- **Queda el anti-regreso**, que es lo que hace que «retirada» no signifique «a ver si alguien se acuerda»: si alguien vuelve a meter `/api/conciencia` en un server estático o en los scripts del sandbox, `cierreDeuda71b.test.ts` se pone rojo. Y la otra pata: **las cuatro rutas reales siguen vivas** — retirar una deuda no es borrar la API que la deuda usaba de excusa.

**La lección del cierre, y es la más incómoda del tramo:** la valla se disparó contra **su propio registro** — `scripts/validar.mjs` menciona `/api/conciencia` porque SU TEXTO explica la deuda. Es la **tercera vez en el día** que me pasa lo mismo (la valla del escalón con su comentario; el auditor de skills con su propio listado). Una valla del tipo «buscar esta cadena en el árbol», sin lista de exclusión, no es una valla: explota cuando uno documenta. Ya está declarado en el código del test, con la razón.

**Vallas.** `cierreDeuda71b` **8/8** (nueva, registrada → catálogo 294) · `tsc --noEmit -p tsconfig.json` exit 0 con salida vacía · `superficie --verificar` CONTRATO INTACTO (server.ts no se toca en este asiento) · sin regresión en `sesionWrite` 30, `capasSkills` 25, `auditoriaSkills` 27, `permisos` 33, `perfilParches` 31, `contextoMedido` 71, `derivaDocumental` 39, `puertosArranque` 66, `techoContexto` 115, `motor-datos` 96, `motor-estructura` 41.

### Balance del tramo 10 → 18 (lo que quedó y lo que no)

- **Cerradas con evidencia y suite registrada:** F11 (v2.3.13), F13 (v2.3.14), F12 (v2.3.15), F14 (v2.3.16), F15 (v2.3.18), F16 (v2.3.19), F17 (v2.3.20), F18 (v2.3.21). Ocho de nueve.
- **F10 sigue abierta y es tuya:** rotación de claves que estuvieron en claro y bóveda en carpeta alcanzable. Toca secretos y `C:\CN`, que no veo ni debo ver.
- **Deuda declarada, no ocultada:** la UI sigue sin ofrecer los tres presets de permisos de v2.3.16; 200 skills sin `capa:` (decisión de orden delante de Mario); `Tareas → Servicios` lista 5 en vez de 7; `brain.ts` (núcleo micro) y la semilla `README.md` de `App.tsx` siguen diciendo «4 puertos»; `package-lock.json` pinea `tapable 2.3.8` con `resolved` inexistente (404 en `npm install`) — todo heredado, todo nombrado en los manifiestos.
- **Lo que estas ocho fases produjeron de más**, y vale más que cualquiera de ellas: **cinco módulos que estaban escritos, en verde y sin cable** (`contextoMedido`, `parchesSemilla`, el vigilante de skills, la suite del escalón, y 116 pruebas mudas), y **una valla roja que llevaba versiones naturalizada** (`seguidorHilo`). El patrón no era «falta feature»: era que el verde no se corría.

---

---
## v2.3.20 · 2026-11-06 · FASE 17: CORTAR A MITAD DEJA DE COSTAR EL ESTADO

Cierre de la **FASE 17** (sesión resistente a cortes, row-versioning). El plano la marcaba como «la fase con más migration-cost del plan» y pedía no hacerla antes de F12/F13 — ya están, y son justamente las que permiten verificar que la migración conservó todo.

- **Lo que estaba mal no era la atomicidad.** `.cerebro-db/planes.json` ya se escribía con tmp+rename, así que **nunca** se veía un archivo a medias. Lo que no existía era la defensa del otro caso, que es el que duele: **dos escritores** — la IDE y el puente `:5000`, y el puente corta a los 60 s (lección L15). El último que termina se lleva puesto al otro sin enterarse.

- **`src/engine/sesionEscribir.ts`**: log append-only `{ver, seq, campo, val, escritor, ts}` al lado del documento. Una línea se escribe entera o no se escribe: un corte cuesta a lo sumo **un renglón**, y el lector lo descarta **nombrándolo en el acta**. `seq` monótono = punto de reanudación. CAS optimista con `esperadoSeq`: el segundo escritor **se rechaza con causa** en vez de pisar. Compactación con tmp+rename.

- **Cable real, y angosto.** En `crearAlmacenFs`: registrar **después** de la escritura atómica (el documento viejo se escribe byte a byte igual, así que Ningún lector actual se entera) y rescatar desde el log como **tercer recurso** cuando el documento está truncado — hasta acá, documento corrupto + `.bak` corrupto = arrancar con los planes perdidos. El registro va envuelto en su propio `try`: **un seguro que puede tumbar el vuelo no es un seguro**.

- **La evidencia del plano, cumplida dos veces**: la línea truncada escrita a mano (5 mutaciones intactas, `seq` en el último consistente, la rota nombrada) y **un proceso real matado con `SIGKILL`** a mitad del append — sobrevivió TODO lo completo y nada a medias.

**Cuatro defectos míos que la suite cazó antes de salir:**

1. El zombie estaba escrito en `.mjs` y usaba `require`: en un `.mjs` no existe, el hijo moría de error de sintaxis y la prueba «pasaba» **sin matar nada**. `.cjs`. Si una prueba de corte no corta de verdad, es una foto.

2. Mi clasificador de truncado medía el **largo** de la línea en vez de la **posición**: llamaba «ilegible» a un corte real y «truncado» a un renglón malo en el medio. Decía al revés. La señal correcta es que el archivo no termine en salto de línea y la rota sea la última.

3. La valla fijaba «36 mutaciones»: el kernel mató en 37 y estaba rojo **sin que nada estuviera mal**. Asertar la invariante (`aplicadas === seq`, una sola rota) en vez del número es la diferencia entre una prueba y una fotografía.

4. `JSON.parse` / `stringifySafe` / una línea de log duplicada: cuatro erratas mías en código nuevo, todas cazadas antes de salir. Vale decirlo en el registro: **el código que escribo hoy necesita las vallas más que el que ya estaba**.

**Medido:** con el documento truncado a mano, el log rescata el último estado consistente de 3 planes y el acta dice qué descartó; la migración del formato viejo es idempotente y deja `.v0.json` (reversibilidad media, como pedía el plano).

**Vallas.** `sesionWrite` **30/30** (nueva, registrada → catálogo 293) · sin regresiones: `planEscrituraCableada` 6/0 · `planner` 64/0 · `planAdaptativo` 30/0 · `motor-datos` 96/0 · `motor-estructura` 41/0 · `capasSkills` 25/0 · **`tsc --noEmit` exit 0 con salida vacía**.

### lo que este asiento NO dice

- **El puente `:5000` sigue escribiendo como escribía.** El CAS está implementado, probado y listo; usarlo desde el puente es un cambio en un proceso de Python que no toqué acá. Hoy la protección contra pisarse está del lado de la IDE.

- El log se escribe con `appendFileSync` sin bloqueo entre procesos. Con CAS optimista y líneas cortas es correcto para dos escritores de este tamaño, pero no es una base de datos: si algún día hay más de dos, hay que sumar `flock`.

- FASES 18 sin empezar (y es la última); FASE 10 la inicia Mario; la UI sigue sin ofrecer los presets de permisos.

---
## v2.3.19 · 2026-11-06 · FASE 16: TRES CAPAS, Y EL ÍNDICE QUE SE MIDE A SÍ MISMO

Cierre de la **FASE 16** (skills en tres capas con criterio de uso = F6 real). Origen medido del plano: el `office/SKILL.md` de `dsh` — catorce líneas que dicen **qué** skill cargar, y una frase que dice **cuándo NO bajar** («editar datos no exige renderizar sólo porque haya formato incidental»).

- **`src/engine/capasSkills.ts`**: `indice | cuerpo | detalle`, tope de 260 caracteres para el nivel 1, y la invariante del plano hecha función: **«una entrada del nivel 1 nunca contiene el cuerpo del nivel 3»** (`violaLasCapas`). Cada índice exige su `cuandoNoConsultar`: sin esa frase, un índice se lee como «cargá todo por las dudas».

- **Destino A (el motor).** `bucle-indice` entra en `BUCLES_KB_ENTRIES` y rutea los **seis** packs `bucle-*` por su id; el detalle largo (`bucle-dos-intentos-detalle`) queda marcado `bajoDemanda` para que nadie lo inyecte. Los cuerpos conservan su id de siempre: **nada se borra** (la reversibilidad media que pedía el plano).

- **Destino B.** `agents-md-cede`: «si el proyecto declara algo en AGENTS.md, el skill **cede**». La idea que el plano señala como la que más fricción quita.

**La evidencia de cierre, cumplida con el medidor de la FASE 13** (no con una opinión): `compararSuperficie` mide el prompt antes y después sobre la ventana real del modelo — **antes 2115 caracteres (2 % de la ventana) → después 245 (0 %): 1870 ahorrados, 8,6 veces menos superficie**. Es la primera vez en esta hoja de ruta que una fase se paga de otra: el `presionDeTexto` que cableé en v2.3.14 es el que certifica que el índice de v2.3.19 no es decorativo.

**Tres defectos que la suite encontró antes de salir, y los tres eran míos:**

- **Mi DP de «longest common substring» devolvía siempre 0.** La invariante estrella de la fase estaba escrita y **muda**: no detectaba nunca la invasión. La cazó el caso que debía romperla. Una valla sin un caso que la haga fallar no es una valla, es decorado.

- **`superficieInyectada` contaba los cuerpos ruteados como si viajaran siempre** (daba 2388 sobre un motor que inyecta 245): número caro, cómodo y falso. Ahora un cuerpo sólo cuenta si ningún índice lo nombra — y así el chequeo detecta un índice que olta routea un pack.

- **`agents-md-cede` con `weight: 3` le ganaba el ruteo a las entradas específicas**: «el proyecto está en una subcarpeta» y «en qué puerto va el proyecto» respondían con la regla de deferencia. `motor-estructura` lo cazó en el acto. Bajada a `weight: 1` y sin la palabra suelta «proyecto» en las keys. Es la invasión entre capas pero **en la recuperación**: una regla general que pesa más que la respuesta concreta desplaza a la respuesta.

**Vallas.** `capasSkills` **25/25** (nueva, registrada → catálogo 292) · sin regresión: `motor-estructura` 41/0 · `motor-datos` 96/0 · `permisos` 33/0 · `auditoriaSkills` 27/0 · `contextoMedido` 71/0 · `tsc --noEmit -p tsconfig.json` exit 0 con salida vacía.

### lo que este asiento NO dice

- **No reclasifiqué las 200 skills del catálogo con `capa:`.** Las tres capas están declaradas, el motor las usa en su propia familia `bucle-*` y el auditor ya cuenta cuántas tienen el campo (hoy: **0**). Repartir 200 entradas entre índice/cuerpo/detalle es exactamente «el orden se decide con él delante»: decime si querés que proponga un borrador y te lo entregue como listado para revisar, no como hecho.

- El índice reduce la superficie de la **familia bucle-***, no la del prompt completo: el resto de las entradas del motor entra por retriever y no se tocó.

- FASES 17 y 18 sin empezar; FASE 10 la inicia Mario; la UI sigue sin ofrecer los presets de permisos.

---
## v2.3.18 · 2026-11-06 · FASE 15: EL VIGILANTE DE SKILLS AHORA SE PUEDE CORRER


Saneamiento del catálogo (F5 real). El plano decía que la herramienta «ya está escrita» señalando `skills/cn-vigilante-de-skills/SKILL.md`: **prosa dirigiendo a un agente**. Contra eso, dos objeciones y las dos se cierran acá: una revisión que no devuelve un número comparable entre corridas no es una revisión, y una revisión que no se puede vallar no existe. Este repo ya contó **cinco** casos de «escrito, verde y nunca registrado».


- **`scripts/auditar-skills.mjs`**, y **`npm run skills:auditar`** / `skills:auditar:pc` (esta última apunta a `<pc>/.agents/.zcode/skills`). Caza `name != carpeta` —el defecto que deja media biblioteca inabarcable para quien indexa por ruta—, frente roto o ausente, nombre inválido o faltante, descripción ausente, cuerpo útilmente vacío, `SKILL.md` inexistente. **BOM y CRLF son ruido, no rojo**: un falso rojo enseña a ignorar los rojos.
- **No arregla nada, y es deliberado.** El plano es literal: «la herramienta de auditoría sirve, el catálogo se arregla con ella, **el orden se decide con él delante**». La suite lo fija con la **huella sha256 del árbol antes y después de correrlo**: idéntica. Un script que renombrara 78 skills por su cuenta sería exactamente el cambio silencioso que este repo persigue desde la FASE 11.
- **Lo que encontré al correrlo sobre el propio repo (y es el hallazgo del turno): 15 de las 200 skills eran de este proyecto y tenían el frente YAML ILEGIBLE.** La causa estaba en `generar-skills-cn.mjs:58`, que escribía `description: <texto>` **sin comillar**, y las descripciones dicen cosas como «…al proyecto android/ que compila: SDK piso…» — un escalar llano con «: » adentro no parsea (`bad indentation of a mapping entry`). Quince skills propias que cualquier consumidor que lea YAML simplemente **no ve**. Reparadas las quince y comillado el generador: `frontmatter_roto` pasó de **15 a 0**. El generador no se auditaba contra sí mismo; ahora sí.


**Medido en `./skills` (200 skills):** antes 94 rotas (47 %) · ahora **79 rotas (40 %)**, con `nombre_distinto 78`, `nombre_invalido 13`, `sin_frontmatter 1`, `sin_descripcion 1`. Las 79 restantes son del catálogo de terceros (`ak-*`): se **informan**, no se toca una coma. Y **0 con `capa:` / 0 con `cuando_no_usar:`** — la FASE 16 arranca literalmente de cero, dato que valía la pena tener escrito antes de prometer capas.



- **La segunda mitad del hallazgo, y la que duele más: `skillsPropias.test.ts`比对aba el frente contra el contrato con un regex de prefijo (`^description:\s*(.+)## v2.3.18 · 2026-11-06 · FASE 15: EL VIGILANTE DE SKILLS AHORA SE PUEDE CORRER


Saneamiento del catálogo (F5 real). El plano decía que la herramienta «ya está escrita» señalando `skills/cn-vigilante-de-skills/SKILL.md`: **prosa dirigiendo a un agente**. Contra eso, dos objeciones y las dos se cierran acá: una revisión que no devuelve un número comparable entre corridas no es una revisión, y una revisión que no se puede vallar no existe. Este repo ya contó **cinco** casos de «escrito, verde y nunca registrado».


- **`scripts/auditar-skills.mjs`**, y **`npm run skills:auditar`** / `skills:auditar:pc` (esta última apunta a `<pc>/.agents/.zcode/skills`). Caza `name != carpeta` —el defecto que deja media biblioteca inabarcable para quien indexa por ruta—, frente roto o ausente, nombre inválido o faltante, descripción ausente, cuerpo útilmente vacío, `SKILL.md` inexistente. **BOM y CRLF son ruido, no rojo**: un falso rojo enseña a ignorar los rojos.
- **No arregla nada, y es deliberado.** El plano es literal: «la herramienta de auditoría sirve, el catálogo se arregla con ella, **el orden se decide con él delante**». La suite lo fija con la **huella sha256 del árbol antes y después de correrlo**: idéntica. Un script que renombrara 78 skills por su cuenta sería exactamente el cambio silencioso que este repo persigue desde la FASE 11.
- **Lo que encontré al correrlo sobre el propio repo (y es el hallazgo del turno): 15 de las 200 skills eran de este proyecto y tenían el frente YAML ILEGIBLE.** La causa estaba en `generar-skills-cn.mjs:58`, que escribía `description: <texto>` **sin comillar**, y las descripciones dicen cosas como «…al proyecto android/ que compila: SDK piso…» — un escalar llano con «: » adentro no parsea (`bad indentation of a mapping entry`). Quince skills propias que cualquier consumidor que lea YAML simplemente **no ve**. Reparadas las quince y comillado el generador: `frontmatter_roto` pasó de **15 a 0**. El generador no se auditaba contra sí mismo; ahora sí.


**Medido en `./skills` (200 skills):** antes 94 rotas (47 %) · ahora **79 rotas (40 %)**, con `nombre_distinto 78`, `nombre_invalido 13`, `sin_frontmatter 1`, `sin_descripcion 1`. Las 79 restantes son del catálogo de terceros (`ak-*`): se **informan**, no se toca una coma. Y **0 con `capa:` / 0 con `cuando_no_usar:`** — la FASE 16 arranca literalmente de cero, dato que valía la pena tener escrito antes de prometer capas.

), o sea **comparaba la forma del texto, no el valor**. Mientras el lector fuera un regex, el generador estaba *obligado* a emitir YAML inválido: cualquier descripción con «: » adentro habría roto la paridad. Comillar las descripciones (el generador, línea 63) y enseñar al lector a aceptar escalares comillados destrabó las dos cosas: se regeneraron las 100 skills (`85 actualizadas`), `skillsPropias` volvió a **24/24** y ningún frente del repo vuelve a nacer ilegible. Es el mismo vicio de la valla de `seguidorHilo` de ayer: la cadena literal sobreviviendo al contrato que dice representar.

**Vallas.** `auditoriaSkills` **27/27**, **registrada** en `validar.mjs` (catálogo 291). Se prueba corriéndola con `execFileSync` contra árboles sintéticos (cada defecto con su nombre) y contra el catálogo real, donde solo se exige sobre lo que el repo genera (`cn-*`: 0 rotas). Dos fallos míos que la suite cazó antes de salir: los retornos tempranos del auditor omitían `nombreCarpeta` (el defecto existía pero nadie podía nombrarlo) y una propiedad que llamé `salida` y leí como `stdout`.


### lo que este asiento NO dice



- **No sé cómo está tu catálogo real.** El plano midió 229 skills / 36 rotas en `<pc>/.agents/.zcode/skills` el 06/11; ese árbol no está en el paquete. Corré `npm run skills:auditar:pc` y el acta te da los nombres, uno por línea, con qué dice cada `name:`.
- No fusioné, no borré y no renombré ninguna skill, incluida ninguna de las 78 con `name != carpeta`: esa es la decisión que el plano reserva para Mario, delante del listado.
- FASES 16, 17, 18 sin empezar; FASE 10 la inicia Mario; la UI sigue sin ofrecer los presets de permisos.


---
## v2.3.17 · 2026-11-06 · EL CHAT VUELVE A ACOMPAÑAR EL TEXTO (2 causas, las dos mías por accidente)

Queja del usuario, textual: «corregí el movimiento del chat que sea más fluido hacia arriba, **se queda quieto y sigue el texto para abajo y no sube solo acompañando el texto**».

El síntoma tenía **dos causas**, y la segunda era la grave porque se congelaba a sí misma:

- **① El escalón de v2.3.12.** Desde hace cinco versiones el objetivo de lectura se **congelaba** hasta que el contenido crecía 100 px (5 renglones) y recién entonces saltaba: quieto + de golpe. Esa era su intención declarada («cada 5 renglones que suba»), pero el usuario pide otra cosa distinta de la que ese asiento creyó entender: **movimiento continuo**. Se elimina el congelamiento y el objetivo vuelve a recalcularse en cada cuadro; la fluidez la da la velocidad finita (780 px/s, techo de 52 px por cuadro), no un `behavior:"smooth"` que —medido en v1.67.1— re-arrancaba una animación por gota y nunca terminaba. Se borran `src/engine/escalonLectura.ts` y su suite.
- **② El seguidor se auto-declaraba «usuario se fue arriba» y se congelaba solo.** El guard de "no robarle el scroll a quien subió a leer" medía geometría en cada `onScroll`: `distancia al fondo < 120`. Pero `onScroll` **también dispara el scroll que hacemos nosotros**, y el perseguidor va a propósito más lento que el texto: con el chorro rápido su propio rezago pasa los 120 px, el handler declaraba que el usuario se había ido, `paso()` salía por la puerta de atrás y la vista **se quedaba quieta mientras el texto seguía creciendo abajo**. Exactamente lo que él veía. Ahora desengancharse exige un **gesto** (rueda, dedo, teclado hacia arriba); acercarse al fondo re-engancha; y el mensaje nuevo del usuario re-engancha y salta, que es lo que él pide cuando habla.

**Lo que encontré al vallar esto, y importa más que el arreglo:**

- `tests/escalonLectura.test.ts` **nunca estuvo registrado en `scripts/validar.mjs`**. Quinta aparición de la misma enfermedad en cinco turnos (F13, F12, el vigilante, las 116 pruebas mudas, el escalón). El congelamiento llegó al producto con su suite escrita y sin que nadie la corriera.
- `seguidorHilo.test.ts` tenía **una valla roja ANTES de mi cambio**: pedía el literal `objetivoDelHilo(nodo.scrollHeight, nodo.clientHeight)` —la persecución del fondo de v2.3.2— cuando el contrato cambió a objetivo de lectura en v1.61.0. La forma literal sobrevivió al contrato y el rojo se naturalizó. Reescrita contra la intención, no contra la cadena.
- Mi primera valla anti-escalón buscaba la palabra `escalonLectura` y **se auto-impactaba con el propio comentario que anuncia que se borró**. Un guard que se espanta a sí mismo no guarda nada: ahora verifica el enlace (import y llamada), no el vocablo.

**Vallas nuevas (seguidorHilo 29/29, estaba en 26 con una roja):** goteo continuo sin mesetas de más de dos cuadros; el avance ocurre en 90 % de las llegadas; el enlace al escalón borrado; el objetivo recalculado dentro del cuadro; rueda y táctil enganchados; y **la trampa escrita como número**: con 200 px de rezago `estaPegadoAlFondo()` devuelve `false` —por eso la geometría no puede ser la única señal para soltar la persecución.

**Verificado:** `tsc --noEmit -p tsconfig.json` exit 0, salida vacía  ·  superficie `--verificar` **CONTRATO INTACTO** (server.ts no se toca en este asiento)  ·  `seguidorHilo` 29/29  ·  `ventanaMensajes`/`goteo`/`hormaChat` sin regresón  ·  deriva-documental SIN DERIVA (semilla 2.3.17 fijada con `npm run deriva:fijar`).

### lo que este asiento NO dice

- **La fluidez final la tienen tus ojos, no la suite.** La regla está probada en el módulo puro (curva, velocidad, mesetas) y el cable verificado por fuente; pero cómo se *siente* el chat con tu streaming real depende de la velocidad de tu modelo. Si todavía lo ves trabado, la palanca es `VELOCIDAD_SEGUIMIENTO_PX_S` (780) y `PASO_MAXIMO_PX` (52), declaradas en `src/engine/seguidorHilo.ts`.
- El resto del hilo sigue igual: `goteo`, el revelado de bloques y la ventana de mensajes no se tocaron.
- FASES 15, 16, 17, 18 sin empezar; 7.1b sigue en `perfeccion.json`; FASE 10 la inicia Mario; la UI aún no ofrece los tres presets de permisos.

---
## v2.3.16 · 2026-11-06 · FASE 14: PERMISOS EN DOS EJES, SIN AFOJAR NINGÚN CANDADO

Cierre de la **FASE 14** de `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md`. El plano la marca **riesgo medio-alto** porque «un preset que escriba en el sistema de archivos del usuario sin preguntar es un cambio de seguridad, no de comodidad», y porque «cualquier preset que escriba fuera del workspace sin preguntar **lo confirma Mario, no lo aprueba un test**». Este asiento se escribe con esa regla por delante.

- **① Medido antes de tocar.** El modelo de permisos era **un booleano**: `pcMode`, que significaba a la vez «el puente :5000 está disponible», «puedo escribir fuera del workspace» y «puedo ejecutar comandos». Y en la carpeta vinculada (`raices_extra`) la propia interfaz prometía que «el agente lee, escribe y ejecuta ahí **sin pedir permiso por archivo**». Un interruptor, tres consecuencias, ninguna nombrada.
- **② `src/engine/permisos.ts`, dos ejes.** `escritura` («solo-workspace» | «workspace-y-pc») × `ejecucion` («auto» | «preguntar» | «prohibida»), con los tres presets del plano: `lectura`, `escritura-workspace`, `acceso-total`. **La etiqueta no promete lo que los ejes no dan**, y hay una valla que lo comprueba: si un preset escribe fuera sin preguntar, su etiqueta tiene que decir cómo se consiguió ese permiso.
- **③ Lo que se niega se niega.** `resolver()` devuelve `{permitido, requiereConfirmacion, motivo}`: un permiso denegado sin causa se parece a un bug, y un permiso concedido en silencio es peor. Ejecutar **fuera** del workspace es otra categoría que dentro, y se resuelve aparte en vez de heredar el `auto` global.
- **④ El núcleo, como función y no como prosa.** `auditarNucleo()` formaliza «no existe un camino que escriba fuera del workspace sin pasar por confirmación»: hoy se sostiene por **equivalencia** —la confirmación ocurrió al vincular la carpeta, y escribir adentro es ejercer ese mismo permiso, no pedir uno nuevo— y esa equivalencia está escrita y es auditable. Un arreglo de seguridad que solo vive en un changelog no es un arreglo: es una costumbre.
- **⑤ Ni un candado aflojado ni apretado de refilón.** `presetDesdePcMode(pcMode)` reproduce la política **exacta** de hoy y la suite lo verifica caso por caso, en las dos direcciones. Si alguien suelta o aprieta un candado sin decirlo, la valla se pone roja. El cable actual es **informativo y no toca el enforcement**: la línea de capacidades del estado vivo pasó de `control de PC: SÍ` a `permisos: Acceso al PC (confirmado al vincular)`, que sí dice si escribir fuera pide confirmación.
- **⑥ La pregunta que el plano reserva para Mario queda en el código**, no en un chat: `DECISION_PENDIENTE` — ¿`acceso-total` debe confirmar **por archivo** al escribir fuera del workspace, o basta la confirmación dada al vincular?. Hoy rige la segunda. Las dos son defensables; elegir es cambio de seguridad.

**Lección que queda escrita:** la cuarta vez que el hallazgo de esta hoja de ruta no es un bug sino **la descripción** («hay un interruptor y significa tres cosas»). Modelar y nombrar un eje que existe pero no estaba declarable es, en seguridad, tan arreglar como cerrar un agujero.

**Vallas.** `permisos` **33/33** (nueva, registrada: catálogo 288). Sin regresiones en `conciencia`-adyacentes ni en el resto: ver `requiere_en_tu_maquina`.

### lo que este asiento NO dice

- **No cambió ningún comportamiento de ejecución.** El agente sigue ejecutando dentro del workspace sin preguntar y sigue escribiendo en la carpeta vinculada sin preguntar por archivo. Si algo de esto te parece mal, la palanca es `DECISION_PENDIENTE`, y tocarla es tu decisión.
- El selector de la interfaz (el switch de `Modo Agente PC`) **aún no ofrece los tres presets**: la política está modelada, resuelta y vallada; el control con nombre en la UI es un asiento aparte y requiere decidir qué se hace con el interruptor actual.
- FASES 15, 16, 17, 18 sin empezar; 7.1b sigue en `perfeccion.json`; FASE 10 la inicia Mario.

---
## v2.3.15 · 2026-11-06 · FASE 12: EL PERFIL DE PARCHES LLEGA AL USUARIO

Cierre de la **FASE 12** de `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md` («perfil de parches por `id«» = F8 real). Una fase por turno (§5).

- **① El motor ya estaba escrito; lo que no existía era el archivo ni el cable.** `src/engine/parchesSemilla.ts` (375 líneas) tenía `aplicarParches()`, atomicidad, tope de operaciones e invariante de 116 entradas, con su suite en **39/39 verde**. Y `grep -c parchesSemilla scripts/validar.mjs` devolvía **0**: **nunca corrió en `npm run validar`**. Tercera vez en tres turnos que el hallazgo no es un bug sino **la desconexión**.
- **② `src/engine/perfiles/perfilParches.ts`**: lee `<raíz de datos>/.cerebronico/perfil.patch.yaml`. **Interruptor honesto** (punto 4 del alcance): sin archivo la semilla sale **idéntica**; con YAML roto, `version` distinta de 1, `operaciones` que no es lista u `op` desconocida → **semilla limpia + causa en el acta**. Nunca arranque a medias. Los nombres del plano (`sobrescribir | deshabilitar | insertar`) se traducen a los del motor con un **mapa declarado**, no con un `if`. **No ejecuta código**: un archivo de usuario que pudiera ejecutar es una RCE con mejor cara.
- **③ Un único punto de cableado** (punto 3): `knowledgeBase` siembra con `semillaParcheada()` — packs, encima el perfil, y recién después las invariantes. Carga **perezosa**: importar la base de conocimiento no lee disco.
- **④ `server.ts` SIN TOCAR**, como exige el plano. El reflejo en `[ESTADO VIVO DEL TURNO]` viaja con `notaDeContexto()`: **sin perfil en disco esa función no crece un carácter** (`filter(Boolean)) y la valla lo verifica.
- **⑤ `_f8f9.md`, borrado** (§5.4: eliminarlo cuando F12 y F13 estén en código — ahora lo están). Contaba F8/F9 como abiertas; el documento que describe el problema no es el archivo que lo resuelve, y dejarlo abierto es cómo un problema se vuelve normal.
- **⑥ Suite `perfilParches.test.ts` 31/31** con los casos que el plano enumera: sobrescribir, deshabilitar, insertar, huérfano, **YAML roto** e **idempotencia doble** (`disable` repetido es no-op porque se valida contra la semilla ORIGINAL; si no, el segundo se rechazaría por «id inexistente» — la lección que ya costó un turno). Más 4 vallas ★ de **conexión**, que es lo único que impide que esto vuelva a ser código muerto. Y `parchesSemilla` queda **registrada** (catálogo 287).

**Lección que queda escrita:** «39/39 en verde» convivió con «0 registros en el catálogo». El verde de una suite que nadie corre es decoración, y la pregunta que falta nunca es «¿está hecho?» sino «¿cómo llega al usuario y quién lo vigila?».

**Sin regresión:** `parchesSemilla` 39 · `motor-datos` 96 · `motor-estructura` 41 · `contextoMedido` 71 · `derivaDocumental` 38 · `puertosArranque` 66 · `techoContexto` 115 · `superficieRutas` 52 · `entradaIntacta` 6 · `rutasSistema` 137 · `arranqueVentanas` 25 · `arranqueLimpio` 47.

### lo que este asiento NO dice

- El acta usa la redacción del motor («parches: N aplicadas (M desactivadas) · K entradas · semilla intacta»), no la literal del plano («perfil: N parches, M huérfanos»): **los números son los mismos**; los huérfanos, cuando los hay, provocan rechazo total con causa nombrada, que es más estricto que listarlos.
- No se añadió editor/validador de `perfil.patch.yaml` en la interfaz: hoy el perfil se escribe a mano y el acta explica qué está mal.
- FASES 14, 15, 16, 17, 18 sin empezar; 7.1b sigue en `perfeccion.json`; FASE 10 la inicia Mario.

---
## v2.3.14 · 2026-11-06 · FASE 13: EL MEDIDOR DEJA DE SER CÓDIGO MUERTO

Cierre de la **FASE 13** de `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md` (telemetría de
contexto = F9 real). Una fase por turno, como pide el §5.

- **① Lo que el plano sospechaba era peor de lo que decía.** Su nota: «el turno
  anterior escribió `src/engine/contextoMedido.ts` y su suite, con 54/54 verde».
  Medido en v2.3.13: el módulo existe (359 líneas, bien hecho, y **el bug de la
  clasificación L5 ya estaba corregido**), la suite existe… y
  · **ningún archivo de producción lo importaba** (0 importadores: sólo su propio
    test), y
  · **no estaba registrado en `scripts/validar.mjs`** (0 referencias) → nunca corrió
    en `npm run validar`, aunque su encabezado afirmaba «incluida en `npm run validar`».
  Verde decorativo dos veces: código que no se ejecuta, vigilancia que no se ejecuta.
- **② Umbrales a `constants.ts`**, que es donde el plano los quería:
  `UMBRAL_PRESION_AVISO 0.45`, `UMBRAL_PRESION_SUGERIR_COMPACTAR 0.65`,
  `UMBRAL_PRESION_FORZAR_COMPACTAR 0.8`. `contextoMedido.ts` los **reexporta** con
  nombre de dominio en vez de copiar el número, y la suite prohíbe que quede un
  `= 0.45;` duplicado adentro. Motivo de producto, no de estilo: 45/65/80 deciden
  cuánto ruido se tolera en la cara del usuario, y una decisión de producto enterrada
  en un módulo de ingeniería no se revisa nunca.
- **③ El cable.** `presionDeTexto({ texto, ventanaTokens, descartadas, volvioQuedar })`
  mide **el texto que se va a mandar** contra **la ventana real del modelo**
  (`numCtx`), y `server.ts` lo llama en el turno de los modelos con herramientas:
  si el aviso no es vacío, se agrega a la instrucción de sistema. Por debajo del 45 %
  el aviso es `""` — **callar cuesta cero caracteres**, que es la otra mitad de la
  regla del plano («debajo del umbral no se dice nada»).
  Se escribió una función nueva en vez de llamar a `medirHuellaContexto` porque esa
  pide el `ContextoEnsamblado` completo, y el server arma la instrucción por otro
  camino: así se explica que el módulo fuera correcto e inutilizable a la vez.
- **④ Al 80 % se nombra la consecuencia.** El aviso dice qué pieza se descartó
  (`L2, L5`) y cuánto volvió a quedar. Sin esas dos cifras el aviso describe un
  estado; con ellas describe una consecuencia, que es lo único que cambia una
  decisión del usuario.
- **⑤ Evidencia de cierre del plano, cumplida literal:** la suite arma un prompt de
  **exactamente N caracteres** y verifica que `tokens === ceil(N/4)` y que el
  porcentaje reportado es el real — no el declarado.
- **⑥ Las vallas anti-código-muerto son el fondo del asunto.** Cuatro comprobaciones
  ★ que no prueban aritmética sino **existencia**: que producción importe el
  medidor, que lo llame sobre el texto real, que el aviso llegue a la instrucción de
  sistema, y que la suite esté en el catálogo. Un módulo puede ser perfecto, estar
  verde y no existir para el usuario al mismo tiempo; eso es lo que pasó acá.
- **⑦ Trinquete intacto.** El cable entra en `server.ts` **sin agregar líneas**: el
  import comparte línea con el de `conciencia` y la llamada comparte línea con el
  `if (concienciaV8)` de arriba. `server.ts` sigue en **12 210** (`presupuesto_lineas`)
  y la suite lo verifica leyendo `contrato-rutas.json`, no de memoria.

**Lección que queda escrita:** «está escrito y verde» no es «está en el producto».
La pregunta que faltaba hacer no era *¿funciona el medidor?* sino *¿alguien lo llama?*.

**Vallas.** `contextoMedido` **71/0** (de 54 a 71: +17 entre la evidencia del plano y
las ★ de conexión) y **registrada** en `scripts/validar.mjs` (catálogo 285). Sin
regresión: `derivaDocumental` 38 · `puertosArranque` 66 · `techoContexto` 115 ·
`arranqueVentanas` 25 · `arranqueNoSecuestra` 19 · `arranqueLimpio` 47 ·
`rutasSistema` 137 · `telemetriaHonest` 19 · `superficieRutas` 52 · `entradaIntacta` 6.
`tsc --noEmit` 0 errores · `superficie --verificar` CONTRATO INTACTO (197 rutas) ·
`deriva-documental` SIN DERIVA (semilla 2.3.14 sincronizada con `--fijar`).

### lo que este asiento NO dice

- **No se tocó la conducta de descarte.** El contrato «el motor no descarta: muestra
  y pregunta» sigue sin resolverse; el §«descarta por su cuenta» del plano queda
  abierto y es una decisión de Mario, no un arreglo.
- La presión se mide sobre la **instrucción de sistema**. El historial de la
  conversación y la salida esperada no entran en esa cuenta: el número es real y
  parcial, y decir «presión del turno completo» sería otra mentira con mejor cara.
- FASES 12, 14, 15, 16, 17, 18 sin empezar; 7.1b sigue nombrada en `perfeccion.json`;
  FASE 10 la inicia Mario.

---
## v2.3.13 · 2026-11-06 · FASE 11: LA VERDAD DEL ESTADO DEJA DE SER UN SUPUESTO

Cierre de la **FASE 11** de `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md`, que es la que el
propio plano pone segunda «porque sin verdad de versión, todo lo demás se documenta
sobre arena». Una fase por turno, como pide el §5.

- **① El defecto estaba VIVO, no histórico.** Medido antes de escribir código:
  `node scripts/deriva-documental.mjs` sobre la v2.3.12 encontró **tres
  contradicciones**. `memoria.md:15` y `memoria.md:242` decían
  «**Fase de Desarrollo Activa:** … v1.51.0» mientras el disco decía 2.3.12 —
  **siete meses** de la memoria del propio IDE afirmando una versión que ya no
  existía, exactamente el caso que el plano describía («memoria dice v1.51.0, disco
  dice v2.3.8… cualquier implementación hecha sobre esa base nace torcida»). La
  tercera: `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md:15` «Versión instalada | v2.3.8».
- **② Vive `scripts/deriva-documental.mjs`.** Semilla = `VERSION_SEMVER`
  (`src/constants.ts`), el único literal que rige. Dos clases de afirmación, y la
  distinción **es** el diseño:
  · **Sitios de identidad** — `package.json`, `package-lock.json` (raíz y
    `packages[""]`), `index.html` (los cuatro literales) y el asiento más reciente
    de `CHANGELOG.md`: o dicen la semilla o es rojo.
  · **Declaraciones de presente** — rótulos que afirman estado actual («Fase de
    Desarrollo Activa», «Versión instalada», «Versión actual»…).
  · **La historia no es una afirmación.** «Último Hito Alcanzado: v1.49.0»,
    «Versión 1.48.1→1.49.0», «desde v2.1.2…» son registros fechados y son verdad
    aunque ya no rijan. Un verificador que los tratase como deriva se vuelve ruido,
    y al ruido el usuario lo apaga. La regla es **por rótulo, no por presencia del
    número**.
- **③ La exención se declara, no se recuerda.** Una hoja de ruta firmada
  «verificado contra el disco el 06/11/2026» es una instantánea legítima: se exime
  con el marcador `deriva:historico` en la línea, y **el acta muestra la exención**
  con archivo y línea. Una exención invisible es tan peligrosa como la deriva.
- **④ `--fijar` y se usó acá mismo.** Alinea **solo** la identidad desde la semilla
  (7 literales: `package.json`, `package-lock` ×2, `index.html` ×4). Los documentos
  los deja intactos a propósito: un script que reescribe la prosa del usuario para
  que concuerde no verifica la verdad, **fabrica consenso**. Esta versión se
  empacó con `--fijar`, no con un `split/join` a mano como en v2.3.12.
- **⑤ El verificador se construyó tres veces antes de funcionar, y las tres
  fallas son el hallazgo del turno.** Todas del mismo tipo — un regex que lee de
  más o de menos y devuelve verde igual:
  · `^ {2,6}"version"` sobre `package-lock.json` devolvió **371 versiones** (se
    llevaba puestas las de las dependencias). Ahora: `JSON.parse` y los dos sitios
    propios. Un `if (x < 0 || x > 999)` como validación, otra vez.
  · `V(\d+\.\d+\.\d+)` sobre `index.html` se tragaba un `V8.0.0` de la prosa. Ahora
    pide la marca pegada (`CerebróNico V…`).
  · **La peor: `/\b(\d+\.\d+\.\d+)\b/` no ve `v1.51.0`.** Entre la `v` y el `1` no
    hay frontera de palabra — son dos caracteres de palabra —, así que el patrón
    más natural para leer versiones **no ve la forma más común de escribirlas**.
    Con ese regex el verificador sentenció «SIN DERIVA» sobre un archivo que estaba
    derivado. Falso verde por silente: el peor defecto posible en una valla de
    verdad. Corregido a `(?<![\d.])(\d+\.\d+\.\d+)(?![\d.])` (y `10.2.6.1` no se
    parte en dos versiones).
- **⑥ Límite declarado del criterio.** Una fila de presente es compatible si
  **menciona** la semilla; no exige ser la única versión de la frase, porque «antes
  1.51.0, hoy 2.3.13» es prosa legítima. Si convive otra versión se muestra como
  aviso (`≈`), no como rojo. Es un criterio más débil a propósito y escrito está:
  un verificador que solo sabe decir sí/tampoco verifica.
- **⑦ Contratos heredados revalidados** (alcance 3 de la fase), medidos ahora:
  `LIMITE_CONTEXTO_CARACTERES = 6000` (`src/engine/motorContexto.ts:1011`) — sigue
  en 6000, el valor que la hoja de ruta sospechaba y no podía nombrar;
  `EJECUTORES` del creador = **32**; `server.ts` **12 210** líneas con
  `presupuesto_lineas` 12 210, techo 13 800 y **197** rutas en el contrato. De la
  semilla del motor **no** se revalidó el total: las suites solo afirman `>= 116`
  (`motor-estructura.test.ts:120`), así que acá no se inventa un número.

**Lección que queda escrita:** un verificador de verdad también puede mentir, y
miente del modo más caro posible — en silencio. Antes de confiar en una valla hay
que preguntarle por un caso que **debe** fallar; esta suite existe precisamente
para eso y se auto-ejecuta el caso del `v1.51.0`.

**Vallas.** `tests/derivaDocumental.test.ts` (nueva, registrada en `scripts/validar.mjs`)
cumple la evidencia de cierre que pedía el plano: **un run real donde inyectar una
versión falsa en `memoria.md` hace fallar el verificador**, sobre un árbol de
mentira en `/tmp` — nunca sobre el del usuario. Scripts nuevos: `npm run deriva`
(verificar) y `npm run deriva:fijar`.

---
## v2.3.12 · 2026-11-06 · EL ARRANQUE POR FIN CUENTA HASTA SIETE

Pedido de Mario, textual: **«el arranque no muestra los 7 puertos»**.

Medido antes de tocar nada — `tsx server.ts` levantado en el sandbox y `GET
/api/health/deep` real: **cinco filas, y sólo TRES nombraban un puerto**
(`Ollama :11434`, `Sandbox :3500`, `Puente PC :5000`). La barra de estado traía los
siete desde v2.3.9. O sea: el usuario miraba arriba y veía siete, miraba el telón y
veía tres. Dos verdades del mismo sistema, y la corta era la primera que se ve.

- **① La causa no es un olvido, es la FORMA de la lista.** El inventario estaba
  escrito A MANO en siete lugares y cada uno envejecía por su lado:
  `PORTS` (7, la semilla) · `PUERTOS_CLAVE` (7, vallado) · `Header.tsx` (7, v2.3.9) ·
  `telemetria.ts` (7, v2.3.9) · `MAPA_PUERTOS` (**6**, sin :5103) ·
  `arranque-diagnostico.mjs` (**6**, titulado «LOS SEIS PUERTOS») ·
  `/api/health/deep` (**3** filas con puerto). La casa ya tenía la lección escrita
  en `telemetria.ts`: «añadir un puerto obligaba a acordarse de las tres, y olvidar
  una no daba error de compilación: daba un `undefined` silencioso que la interfaz
  pintaba como OFF». Acá no dio `undefined`: dio un arranque corto.
- **② Vive `src/engine/puertosArranque.ts` (puro, sin fs ni red).** Los siete, con
  `nacimiento` (IDE / hijo del server / lanzador / bajo demanda / externo), `sonda`,
  `bloqueante` y `remedio`. Los números salen de `PORTS` y los nombres de
  `PUERTOS_CLAVE`: **no hay un solo literal de puerto en el archivo** (y la valla lo
  comprueba con regex, no de palabra). Lo recorren las tres superficies del arranque.
- **③ Los tres estados, aplicados a toda la tabla y no sólo al chip del :5103.**
  Verde = vive. **Gris** = no nació y es de los que nacen bajo demanda (sandbox,
  motor del cerebro). Rojo = debía estar y no está. Con dos colores había que elegir
  entre dos mentiras: pintar de rojo el sandbox a las nueve de la mañana —que nunca
  se abrió— o pintar de verde un puente caído. El tercer estado es lo que hace
  posible mostrar los siete sin ruido.
- **④ El arreglo no secuestra el telón.** Nueve filas no pueden significar nueve
  esperas. `/api/health/deep` marca cada fila con `bloqueante`, y `debeEntrar` sólo
  espera a las bloqueantes: un pack de Python apagado a propósito (`:5100`, `:5102`)
  se muestra rojo, con su motivo y su remedio, y **no** deja al usuario doce segundos
  mirando un spinner por algo que no le impide trabajar. `:3500` sigue pudiendo
  bloquear, pero sólo cuando HAY proceso y no contesta: su gris no bloquea nada.
  Viajan además `puertosMedidos` y `avisos` en la respuesta, para que nadie vuelva a
  contar a mano.
- **⑤ El banner de consola también declara el mapa**, al abrir el puerto. Declara el
  plano, no el estado: en ese instante el server todavía no sondeó nada y los packs
  pueden estar levantando en paralelo. Un «TODO OK» inventado en el log es justo lo
  que esta casa combate. Lo medido se ve en el telón, que es donde hay sondas.
- **⑥ `MAPA_PUERTOS` tenía seis líneas con `PORTS` en siete.** Es el texto que viaja
  a la memoria del IDE y al prompt: un modelo que leyera ese mapa y no
  `PUERTOS_CLAVE` decía «son seis puertos» con toda la confianza del mundo. Ya está
  el `:5103` del motor del cerebro.
- **⑦ `npm run arranque:diagnostico` pasó de seis a siete y ahora se auto-cruza**
  contra `PORTS` al ejecutarse: si la lista del script envejece, el propio informe
  dice `✗ LA LISTA DE ESTE SCRIPT ESTÁ VIEJA` con los que faltan y los que sobran.
- **⑧ La valla nueva se corrigió a sí misma, y eso vale más que el arreglo.**
  `lanzadorRepliegue.test.ts` exigía **SEIS** puertos y estaba bien escrita: copió la
  lista del script en vez de copiar la fuente. Una valla que copia la lista certifica
  la lista, no la verdad. Ahora lee `src/constants.ts`. Y el primer lector que escribió
  ese regex devolvía **ocho** puertos, porque el comentario del :5103 dice «es un órgano
  DISTINTO del daemon :5100» y el patrón `:\s*(\d{3,5})` se lo tragó: conteo inflado,
  verde inventado. El patrón final exige `CLAVE: número` de inicio a fin de línea.

**Lecciones que quedan escritas:** (a) un inventario que se escribe a mano en más de
un sitio es un inventario que ya está roto y todavía no se vio; (b) una valla que
copia la lista que vigila no vigila nada; (c) medir con ruido es peor que no medir,
porque da número y el número se cree.

**Vallas.** `tests/puertosArranque.test.ts` (**66**, registrada en `scripts/validar.mjs`
→ catálogo 283): no busca la palabra «siete» en el fuente — monta
`registrarDiagnostico` contra un `app` de juguete, pide `/api/health/deep` y **cuenta
las filas que la ruta produce**; siembra la lista literal de tres para que volver a
ella sea rojo. Actualizada `lanzadorRepliegue` (24→**27**). Verificadas sin regresión:
`arranqueVentanas` 25 · `arranqueNoSecuestra` 19 · `rutasSistema` 137 ·
`telemetriaHonest` 19 · `plazoApiStream` 13 · `superficieRutas` 52 · `entradaIntacta` 6.
**Trinquete:** `server.ts` **12 210 líneas, SIN crecer** (el import nuevo comparte
línea con `admisionRam`; el `console.log` del mapa es el mismo de siempre extendido) ·
`superficie --verificar` = CONTRATO INTACTO, 197 rutas. **En vivo:** banner con los
siete y `/api/health/deep` devolviendo 9 filas, 7 con puerto, `puertosMedidos: 7`,
`avisos: [Memoria :5100, Creador :5102]`.

### lo que este asiento NO dice

- **Tareas → Servicios sigue listando 5**, no 7. Esa lista sale de
  `SERVICIOS_VENTANA`, que es el plano de *ventanas* atado al contrato que Mario
  cuenta a ojo («2 CMD y 3 PY»). Ampliarla a 7 significa tocar ese contrato (el
  :3500 no es un proceso y el :5103 no tiene ventana): se decide aparte, no colado
  en este arreglo.
- `brain.ts` (núcleo del modelo *micro*) y la semilla `README.md` de `App.tsx` siguen
  nombrando cuatro puertos. Son texto de prompt/semilla: tocarlos mueve presupuesto
  de contexto y `entradaIntacta`. Queda declarado, no corregido a ciegas.
- **No se corrió `npm run validar` completo**: el sandbox del asistente no tiene
  `node_modules` de esta entrega. Las suites citadas se corrieron una por una con
  `tsx`. `npm run validar` y `npx tsc --noEmit` los lanzás vos.

---
## v2.3.11 · 2026-11-04 · EL CIERRE SE SEPARA DEL FISCAL (y la semilla deja de mentir)

Tres rojos medidos por `npm run validar` sobre la entrega anterior, los tres reales:

- **① El fiscal contaba 9 y 14 donde el contrato dice 7 y 12.** `evaluarLimpieza` y
  `evaluarAutoevaluacion` se habían metido dentro de `evaluarCasillas`, así que la
  tarea normal devolvía 9 casillas y la pesada 14. `tests/autovalido.test.ts` lo cazó
  con cuatro rojos (`tarea normal → 7 casillas`, `las 7 son las del §2`, `tarea pesada
  → 12 casillas`, `total = 7`). **No eran casillas del §2 ni del §8: son del CIERRE.**
  Se separan en `evaluarCierre(e)`, que corre siempre y no toca el conteo del fiscal.
  El fiscal vuelve a 7 + 5 = 12; el cierre sigue juzgando limpieza y autoevaluación.
- **② La semilla de versión iba un escalón por detrás del CHANGELOG.** `VERSION_SEMVER`
  decía 2.3.9 con el CHANGELOG ya en 2.3.10 — la valla de `techoContexto` compara las
  dos cifras y tenía razón. Sube a 2.3.11 en los cuatro sitios que la valla vigila:
  `src/constants.ts`, `package.json`, `package-lock.json` e `index.html` (sus cuatro
  literales: title, description, og:title, og:description).
- **③ `tests/autoevaluacion.test.ts` figuraba fuera del catálogo.** Falso positivo de
  una corrida anterior al registro: la entrada existe en `scripts/validar.mjs` con
  `id: "autoevaluacion"` y `archivo: "tests/autoevaluacion.test.ts"`, y el regex de
  `suitesRegistradas()` la encuentra. Censo medido: 282 en disco, 284 declaradas,
  0 fuera, 0 fantasma.

**Lección que queda escrita:** una casilla nueva del cierre NO se añade al array del
fiscal. El fiscal tiene un contrato contado (7 + 5) y una suite que lo mide; el cierre
tiene su propia función. Mezclarlos rompe el conteo aunque el código «funcione».

---
## v2.3.10 · 2026-11-04 · LA ADUANA DEL ADJUNTO (y la limpieza que se paga sola)

Pedido del usuario: «¿acepta exe también?». La respuesta era sí, y detrás había tres
agujeros. Además, dos conductas de método que el usuario exigió que quedaran escritas.

- **① El clip no tenía aduana.** `<input type="file" multiple className="hidden">`: sin
  `accept`, sin comprobación de `file.size` y sin lista de bloqueo. Un `.exe` de 200 MB
  entraba entero en memoria vía `FileReader` → base64 y colgaba la pestaña antes de poder
  cancelar; un `.env` o un `id_rsa` se leía, entraba al prompt y **salía hacia el
  proveedor del modelo**. El único número que existía («hasta 50 elementos») era texto del
  overlay: no había código que lo hiciera cumplir.
- **② Tres cláusulas, en orden que importa.** `motivoRechazo(nombre, bytes)` en
  `ChatCenter.tsx` (~1865) evalúa **tamaño (200 MB) → credenciales → ejecutables** y
  devuelve el primer motivo. El orden no es cosmético: invertirlo hace que un `.env` de
  300 MB dé el mensaje equivocado. Las listas viven en `EXT_CREDENCIALES` (~1849) y
  `EXT_EJECUTABLES` (~1858).
- **③ Una sola puerta, dos entradas.** `filtrarPorTamano` (~1879) es la única que decide,
  y la usan el botón del clip (~2975) y el arrastre (~1900). Antes eran dos bloques
  duplicados: dos copias de una regla divergen el día que alguien edita una sola.
- **④ El cartel deja de mentir.** El overlay de arrastre decía «hasta 50 elementos» (que
  no se aplicaba) y ahora declara el tope real y las cláusulas en ámbar.
- **⑤ El input conserva la ausencia de `accept`.** Es deliberado: un `accept` oculta
  archivos y el usuario no entiende por qué no aparecen. El rechazo ocurre al elegir, con
  nombre y motivo.
- **⑥ La conducta de limpieza, escrita y ejecutable.** Nuevo `src/engine/limpiezaTarea.ts`
  (criterio puro, sin `fs`: decide, no borra) con el orden **secreto → respaldo →
  temporal → preguntar**. Lo que no se reconoce **se pregunta**, nunca se borra por
  descarte. Documento: `LIMPIEZA-DE-TAREA.md`. Lección en `memoria.md` §3.
- **Vallas nuevas**: `tests/clausulasAdjunto.test.ts` (**79**, incluye anti-deriva: lee el
  fuente y verifica que cada extensión esté literalmente en el componente),
  `tests/topeAdjuntos.test.ts` (**16**, umbral exacto y paridad clip/arrastre),
  `tests/limpiezaTarea.test.ts` (**55**, sobre los 19 archivos reales que se dejaron el
  4/11, no ejemplos inventados). Las tres registradas en `scripts/validar.mjs`.
- **Documentación**: `CLAUSULAS-DE-ADJUNTO.md` (nuevo) y este asiento. Censo verificado:
  **277 suites en disco, 282 entradas en catálogo, 0 sin registrar**.

### lo que este asiento NO dice

El tope **total** (varios archivos a la vez) no está implementado: sólo hay tope por
archivo. Y `.js` figura entre los ejecutables por decisión explícita — es discutible,
porque un `.js` es código fuente que el modelo podría querer leer.

## v2.3.9 · 2026-11-04 · EL QUIRÓFANO RECUERDA, SE APAGA POR MITADES Y YA NO SE ENCIERRA

Pedidos del usuario (4/11), los cuatro cerrados con valla propia. Además se arregló lo que
las 5 fallas de la maestra estaban señalando — y **no** eran ruido: eran protección real.

- **① El interruptor tiene memoria.** Nuevo `src/engine/interruptorQuirofano.ts` (criterio
  puro) + `server/routers/quirofanoInterruptor.ts` (transporte). El estado vive en
  **`<raíz de datos>/.cerebronico/quirofano.json`** — la misma convención de
  `autoLlamado.json` — y **se lee al arrancar**, dentro de la construcción de la instancia:
  no existe un camino de arranque que se olvide de cargarlo. Un flag en RAM duraba menos que
  la operación por la que se apagó: el supervisor, el hot-reload o un build devolvían el juez
  encendido sin avisar. Escritura **atómica** (`tmp` + `rename`, con rescate para Windows):
  un corte de luz no deja un JSON a la mitad. Un JSON ilegible **no apaga** al juez: vuelve
  a ENCENDIDO y lo dice. Y el archivo se puede editar a mano, porque un juez que bloquea el
  gesto de prenderlo es un candado sin llave. Valla: `tests/interruptorQuirofano.test.ts`
  (59 comprobaciones) **apaga, tira la instancia —eso es un reinicio— y comprueba que sigue
  apagado, con su motivo y su autor**.
- **② Dos palancas, no una.** El Quirófano juzga dos cosas distintas. `escrituras` cubre
  `write_file`/`edit_file`/borrados/autosync y las puertas de cierre; `comandos` cubre la
  aduana del comando entrante en `run_command`, `run_tests` y `/api/exec`. Apagar una **no**
  desarma la otra, y cada apagado **enuncia qué deja de vigilar** (`dejaDeVigilar`) y qué
  ninguna palanca toca (`sigueVigilado`: `sandboxAuthorized` y las 11 puertas del sandbox, el
  guardián de sintaxis, la reversión de la tanda). El apagado se graba, se loguea con nombre
  de palanca y se ve en el panel.
- **③ El falso positivo queda fijado con test.** `server.ts` estaba bloqueado *para siempre*
  porque en sus comentarios explica qué frases busca el juez (medido: **44 archivos**
  contienen alguna). El arreglo de v2.3.9 —hacer ciego al escáner ante los comentarios—
  cerraba eso y **abría un agujero peor**: la firma nº 1 del modelo que se quedó sin contexto
  *es un comentario* (`// resto del código`). Las 3 fallas de `quirofano.test.ts` y la de
  `completitud.test.ts` eran exactamente esa protección. Se separa **medir** de **bloquear**:
  `marcadoresDeTruncado` mira todo el texto (escáner honesto) y `marcadoresBloqueantes`
  —que es la que juzga— sólo marca la línea cuyo mensaje **es** la marca. Una oración que la
  contiene (`se omite npm run build`, `Los valores null se omiten.`) es prosa: no bloquea.
  Un string que sólo dice `"resto del código"` es un placeholder: bloquea. Radio medido tras
  el cambio: de **16 archivos bloqueados a 1** (el propio juez, ver ④). Ningún umbral de
  líneas ni el chequeo de exportaciones se tocó.
- **④ El guardián no puede bloquearse a sí mismo.** `quirofano.ts` contiene las marcas que
  detecta (7) y `cerradura.ts` contiene los patrones que escanea (**5 hallazgos críticos**):
  editar al juez exigía escribir *por fuera* del juez. `RUTAS_DEL_GUARDIAN` +
  `esArchivoGuardian()` lo declaran explícito: para esos archivos el veredicto **nunca** es
  `peligroso`, baja a `revisar` con un `AVISO` que nombra lo que se habría bloqueado y se
  escribe en el log. No es un silencio, es un aviso con nombre — y lo que protege al juez son
  sus suites, no su propio ciego. La exención es por sufijo y acotada: `src/quirofano.ts` o
  `quirofanoUtils.ts` **no** la reciben.
- **La valla de forma, corregida.** `seguidorHilo.test.ts` exigía el literal
  `if (cuadroSeguidorRef.current !== null) return;`, y el arreglo «el chorro no espera al
  cuadro» puso una marca de pendiente antes del `return`. Se batea el **contrato**: un solo
  cuadro en vuelo *y* la gota no se pierde. Dos comprobaciones donde antes había una.
- **El trinquete se paga, no se levanta.** `server.ts`: **12215 → 12210 líneas**. El mensaje
  del bloqueo del Quirófano (40 líneas de prosa fija) se fue al motor
  (`mensajeBloqueoQf`), y el interruptor vive entero en su módulo. Contrato de superficie
  regenerado: 195 → **197 rutas** (2 nuevas, ambas con `sandboxAuthorized`); el POST sin
  autorización devuelve 401 y no apaga nada.
- **Panel**: tarjeta *interruptor* con las dos palancas, el inventario de qué se dejó de
  vigilar y el archivo donde queda grabado. Sin control visible, un interruptor es una API.

### defecto del proyecto descubierto al instalar (NO corregido a propósito)

`package-lock.json:6939` pinna `"version": "2.3.8"` de `tapable` pero su `"resolved"` apunta a
`tapable-2.3.4.tgz`, y **2.3.4 no existe** en el registry (máximo publicado: 2.3.3). Cualquier
`npm install`/`npm ci` desde cero muere en 404: el proyecto sólo se puede construir en máquinas
que ya tengan `node_modules` de antes. Se reporta en vez de parchear: tocar el lock sin `npm
install tapable@2.3.3 --package-lock-only` es cambiar una dependencia a mano.

## v2.3.8 · 2026-11-04 · EL LAZO SE AUTO-INVOCA (frente 3, segunda mitad)

- Cerrado el turno con la cola del usuario vacía, el cliente pregunta y **obedece**: si la
  respuesta es `llamar`, el mensaje entra por la **cola visible** del chat (se ve y se
  cancela). Nuevo `server/routers/autoLlamado.ts` con cuatro rutas y el libro en
  `<raízDatos>/.cerebronico/autoLlamado.json`, montado en `server.ts`.
- Antes de esto el criterio (v1.99.7) y la contabilidad (v2.3.4) tenían **cero llamantes**
  medidos: un criterio verde que nadie consulta no es una función, es una opinión.
- La fuente de «todavía hay trabajo» la lee el **server** desde el parte del turno
  (`REANUDAR.md`, asiento derecho). El navegador no decide: un solo dueño del criterio, sin
  dos versiones de la verdad en la misma pantalla.
- **La trampa vallada**: la línea «Trabajo pendiente: NINGUNO» **no** es una tarea. Un parser
  ingenuo arma el peor bucle posible — re-entrarse para no hacer nada, indefinidamente.
- Las tres fronteras mandan sobre el transporte (voluntad / costo / estancamiento) y **el
  fallo del server se traga en silencio**: un lazo que tumba el chat es peor que no tener lazo.
- Valla nueva `tests/autoLlamadoTransporte.test.ts` (16 comprobaciones), registrada en la
  maestra. Pendientes declarados: el botón de la ranura de voz y los frentes #8 / #9.

## v2.3.7 · 2026-11-04 · EL LANZADOR DEJA DE SER UN MISTERIO (#12)

Pedido: «he tenido problemas con el iniciar_todo_windows, se cae y tengo que usar
`npm run dev`». Dos defectos hacían eso inreportable, y los dos se cerraron:

- **Un `dist/` viejo ya no gobierna la apertura.** El lanzador elegía el modo rápido
  por *existencia* de `dist/`; ahora compara **antigüedad** contra `server.ts`
  (`dir /b /o-d`) y, si el código es más nuevo, **baja** a `dev:sin-vite` (que
  recompila) **diciendo por qué**. Con `dist/server.mjs` de otra era, el log contaba
  lo que hizo un binario viejo: imposible de diagnosticar. `CN_FORCAR_START=1` es la
  salida del que sabe que su `dist` está bien.
- **Repliegue de una sola vez.** Si el modo elegido falla, se reintenta **una** vez
  con `npm run dev` —el modo que no depende de nada compilado— anunciando el código
  con el que cayó, y el modo lento **nunca** se re-intenta a sí mismo (eso sería un
  lazo sobre `:3000` ocupado, el infierno que esta casa corta en cualquier otro lado).
- **`npm run arranque:diagnostico`** (nuevo): imprime versión de las dos fuentes y si
  coinciden, qué hay en `dist/` y si está a tiempo, **los seis puertos** con su rol
  (Front 3000, Backend 3500, puente 5000, memoria 5100, creador 5102, Ollama 11434) y
  **qué script elegiría el lanzador hoy**, con el motivo. No escribe nada en disco.
  Corre en esta máquina y sale, por ejemplo: `npm run dev ← no hay cliente ni server
  compilados`.
- Valla nueva `tests/lanzadorRepliegue.test.ts`, registrada en la maestra.
- Y la valla de CRLF hizo su trabajo sobre mi propio parche: al reescribir el `.bat` lo dejé en LF
  — que en Windows es literalmente *«el .bat se cierra enseguida»*, el síntoma que estábamos reportando.
  `bajoConsumo` lo agarró antes de embalar. Lección escrita: un `.bat` se toca con CRLF explícito, siempre.

## v2.3.6 · 2026-11-04 · LA RANURA DE VOZ: EL USUARIO ELIGE QUIÉN CONTESTA

- **Los modelos del enjambre ya se eligen** (pedido del 4/11: «una función parecida al
  favorito pero de ecléctico, y que sea elegido para una de las voces, así selecciono
  modelos que contesten»). Antes no había ranura: `server/routers/enjambre.ts` armaba las
  voces desde favoritos y el propio descarte lo decía («cargá modelos en ⭐ Favoritos…»).
- Una marca nueva **sobre el mismo registro del favorito** (`vozEclectica`), no una lista
  paralela: dos dueños de «qué modelo contesta» es cómo se discrepa un enjambre. Los marcados
  entran **delante** en la fila y ocupan las ranuras antes que el resto.
- Tres límites que no se negociaron: **NUNCA CERO VOCES** sigue mandando (una ranura vacía
  o mal cargada no apaga nada); **la aduana está por encima del capricho** (declarar un
  embedding o un proveedor sin clave se **descarta con motivo legible**, no se cuela); y
  **ranura vacía = comportamiento idéntico al de ayer**.
- El viaje está cableado y es de un solo dueño por tramo: `src/App.tsx` la llena,
  `src/utils/enjambreCliente.ts` la filtra con `vocesFijasDelUsuario` —que **reusa** el filtro
  de `vocesDelUsuario` en vez de duplicarlo—, `server/routers/enjambre.ts` la entrega al
  criterio, `armarEnjambre` la respeta. Valla nueva: `tests/ranuraVozEclectica.test.ts`.
- **Falta el botón**: la marca se lee y viaja, pero todavía no hay control en el selector
  para ponerla. Declarado, no escondido.

## v2.3.5 · 2026-11-04 · LA APERTURA ELIGE EL MEDIO · Y SEIS PUERTOS, NO CUATRO

- **El lanzador ya no abre siempre con Vite en el proceso** (pedido: «tarda muchísimo en
  abrir»; confirmado: con el 2.0 compilado arrancaba rápido). El log del 3/11 lo decía
  literal: `Cliente: Vite en modo DESARROLLO … Vite transforma y sirve /src/*`. La salida
  existía y estaba vallada (`dev:sin-vite`, suite `devSinVite`), **pero su `predev` corre
  `vite build` siempre: abrir «sin Vite» recompilando sale MÁS lento**. Orden nuevo, de más
  rápido a más lento: `dist/server.mjs` + `dist/index.html` → `npm run start` (node, sin
  tsx, sin Vite) · sólo `dist/index.html` → `npm run dev:sin-vite` · nada compilado →
  `npm run dev`. `CN_USAR_VITE=1` fuerza el modo viejo para desarrollar. El modo elegido
  se imprime, y **el mensaje de salida nombra el script que de verdad corrió** (antes
  informaba `"npm run dev" terminó…` incluso abriendo con `start`: un log falso enseña a
  diagnosticar sobre datos falsos).
- **Seis puertos, no cuatro** (corrección del usuario): los chips mostraban `:5000 :11434
  :5100 :5102` y ocultaban **`:3000` (el Front, la propia IDE)** y **`:3500` (el Backend de
  agentes)** — justo los dos que explican si la interfaz abrió o no. Las vallas
  `indicadorServicios` y `unaListaDePuertos` pasaron de exigir 4 chips a exigir **6**,
  todos por el criterio único (`chipPuerto`).

## v2.3.4 · 2026-11-04 · EL LIBRO DEL LAZO (frente 3, primera mitad)

`autoLlamado.ts` decidía si re-entrar, pero **no tenía dónde vivir el estado** que esa
decisión necesita: cero llamantes en todo el árbol (medido: `grep autoLlamado src
server` sólo lo encuentra a él). Sin libro, el "seguí automático" no es un lazo: es un
criterio huérfano.

- Nuevo `src/engine/colaAutoLlamado.ts`: interruptor persistido (apagado por default
  — nadie enciende un lazo que quema crédito), contador **por conversación** que sólo
  gasta cuando de verdad se encoló algo, huellas del estancamiento, cola visible y
  **cancelable sin perdonar el llamado** (si se perdonara, el tope se evade con un
  clic), presupuesto de tiempo por corrida (el precedente medido de `ouroboros`:
  15 minutos de CPU secuestrada), LRU de memoria y disco ida-y-vuelta donde la
  entrada hostil (`"llamados": "muchos"`) no contamina el libro.
- Estados puros: ningún `registrarCierre` muta el estado recibido — dos requests
  concurrentes ven fotos distintas y el contador no se pisa.
- Valla nueva `tests/colaAutoLlamado.test.ts` (29) registrada en `validar.mjs`.
- **Queda el transporte** (dicho, no escondido): el endpoint y el punto de llamada
  al cerrar el turno. El cable está del lado del estado; falta enchufarlo al `:3000`
  y a la cola visible del chat.

## v2.3.3 · 2026-11-04 · DOS SUPERFICIES PARA DOS PAPELES (frente 5)

- **Respuesta concreta y pensamiento en detalle ya se distinguen de un golpe de
  vista** (pedido del 4/11: «encontrar fácil el mensaje y la respuesta concreta y
  diferenciada del pensamiento en detalle»). Antes la respuesta iba suelta sobre el
  fondo de la burbuja y el pensamiento era un filete de 1 px con `opacity-90`:
  nada jerarquizaba lo que hay que leer sobre lo que se puede ignorar, y bajar la
  opacidad **restaba contraste** — un bloque pálido se lee peor, no se lee distinto.
- Ahora: la respuesta lleva costado propio en verde-agua apagado (`border-[#2f4d4a]`,
  cero neón, sobre el dark de siempre) y su aire; el pensamiento tiene superficie
  propia más hundida (`bg-[#0a1018]` + `border-[#1b2735]`) y **rótulo que dice qué es**
  («pensamiento en detalle · N caracteres»), con el texto a pleno contraste.
- Inventario sincronizado en la MISMA edición (la regla de la casa: `paleta.test.ts`
  bate clase por clase en las dos direcciones). Seis comprobaciones nuevas congelan la
  propiedad: los dos roles **no comparten color**, el rótulo nombra el bloque, y el
  pensamiento jamás vuelve a bajar la opacidad. `paleta`: **96 correctas · 0 fallos**.

## v2.3.2 · 2026-11-04 · LO QUE LA ADUANA NO PUEDE VER Y LA PANTALLA QUE VA POR DELANTE

Cuatro cosas que el usuario trajo medidas, todas con su valla:

- **«Algunos modelos no los reconoce»**: medido, no es la lista de familias — es que
  `L1_arctic`, `L1_arctic22m`, `bonsai-2` son **copias renombradas**: Ollama no anuncia
  el rol en `/api/tags`, así que la aduana clasifica por nombre y un alias no tiene
  nada que lo delate. La salida no es adivinar (el día que el alias sea un chat la
  aduana miente sola) sino **declarar**: `CN_EMBEDS_EXTRA` / `CN_CHAT_EXTRA` en
  `aduanaModelos.ts`, dueña única del rol, con la palabra del usuario por encima del
  regex y el motivo nombrando la variable. Sin declarar, el alias sigue sin entrar.
- **Embedder en segundo plano, no acampado**: `/api/tags` **siempre** mandó `size` y
  este server siempre lo tiraba. Ahora se guarda (`CandidatoEmbedder.mb`) y entra en
  la puntuación con `CN_EMBED_TECHO_MB` (default 200): en el equipo del usuario
  (i5, 16 GB, todo el chat a la nube) `snowflake-arctic-embed:33m` — 67 MB — le gana
  a `qwen3-embedding:0.6b` — 639 MB**, siendo los dos multilingües. Estar cargado
  sigue pesando más que el techo. No se usó `RAM_LIMITADA_GB`: esa palabra significa
  «equipo de 8 GB» y el de él tiene 16; acá lo que se acota son los MB del
  vectorizador, que es otra pregunta.
- **La pantalla va más lenta que el texto** (pedido textual): el hilo hacía
  `scrollIntoView({ behavior: streaming ? "auto" : "smooth" })`, o sea salto puro
  justo mientras llegaba el chorro y `smooth` reservado para cuando no pasaba nada.
  Nuevo `src/engine/seguidorHilo.ts`: persecución a velocidad finita (780 px/s,
  techo 52 px/cuadro, **reloj absoluto** — la lección medida de `goteo`) y un solo
  cuadro en vuelo. El mensaje del usuario sí salta; la respuesta se persigue.
- **El ⚙ de la barra del chat, jubilado**: la fase 4 (v1.83.0) plegaba Canal directo,
  Adjuntar y Encolar; en el uso real son la ruta más corta del programa y el pliegue
  les sumaba un clic. Los tres quedan fijos a la vista (`contratoSuperficie` y su
  fixture, actualizados en la misma edición: tres visibles no superan el umbral de la
  regla, como `chats-cola`).
- Ruido menos: el aviso `⚠ sin embedder…` se contaba **una vez por lectura** y en el
  log real del 3/11 aparecía ocho veces diciendo lo mismo. Ahora, una por estado.

## v2.3.1 · 2026-11-04 · EL REANIMADO QUE NO EXISTÍA Y EL PUERTO QUE NADIE MIDIÓ (el reanimado que no existía y el puerto que nadie midió (4/11/2026)

Tres frenos nuevos, todos con la evidencia nombrada:

- **`"v" no se reconoce` / código 9009** (log real del 3/11). El supervisor reanimaba
  con `spawn(linea, {shell:true})`; en Windows `cmd /s` solo limpia las comillas
  exteriores si la línea no trae comillas adentro, y las suyas siempre traían. El
  nombre del programa pasaba a ser el primer carácter citado (`vite` → `"v"`), el
  hijo moría en 9009 y se llevaba puesto el `call npm run dev` del .bat: eso era el
  «servidor local caído». Ahora el comando vive en un shim
  (`logs/arranque/reavivar-<id>.cmd`) y el shell recibe una sola ruta, con
  `shell:false` + `windowsVerbatimArguments`. Módulo puro nuevo:
  `src/engine/reavivarServicio.ts`; valla nueva: `tests/reavivarServicio.test.ts` (54).
  Y el reanimado escribe al log que el aviso siempre prometió.
- **El cuatriplicado de Puertos** (pedido del 4/11: «todos dicen indicativos
  distintos»). Cuatro superficies, tres criterios y dos defaults mentira: la semilla
  de `telemetry` afirmaba `port3000: true` sin haber medido, y
  `vivo: vivos.get(id) !== false` pintaba de VIVO lo nunca medido — contradiciéndose
  con el campo `interruptores` del mismo JSON. Nuevo `src/engine/indicadorServicios.ts`
  con UN criterio (`arriba`/`abajo`/`sin-medir`, el último con etiqueta `—`) y UNA
  sonda compartida (N consumidores = 1 request). Valla: `tests/indicadorServicios.test.ts` (27).
- **`alternarPantallaCompletaInteligente` y `minimizarVentana` ahora existen** en
  `src/engine/pantallaCompleta.ts`, con la firma exacta que `App.tsx` ya llamaba: los
  cuatro TS (2552/2304 + los dos TS7006 arrastrados) se resuelven con el archivo.
  `minimizarVentana` no finge: sin `preload` de Electron dice que el navegador no
  puede y cómo hacerlo a mano.
- Tipos: `FuenteResolucion` incorpora `"sin-medir"` (la rama de v2.2.8 sin ensanchar
  el tipo, 2 errores), `avisoCatalogo` estaba declarado dos veces en
  `ModelSelectorModal`, y el `resolve` de `presupuestoConn` necesitaba el angostamiento
  explícito. `npx tsc --noEmit`: 0 errores.
- embalaje: `_q.ts` (rascle de una corrida) había viajado en el ZIP de v2.3.0 y
  prendía rojo `resiliencia`. Salió del árbol.


 - Capturas 20:32 y 20:38: cabecera «servidor local caido» y espina «no contesta el
   SERVIDOR LOCAL» **junto a** «44 detectados en Ollama». Imposible si el 3000 estuviera
   muerto: los 44 los contesto el 3000. El servidor estaba sano; la interfaz mentia.
 - La medida (numeros del codigo, no hipotesis): App.tsx lanzaba en el arranque 10
   requests al MISMO origen sin AbortController (telemetria, modelos, zai, groq,
   cerebras, mistral, together, deepseek, fireworks, subagents). Chrome abre 6
   conexiones por origen; los sondeos que rebotan contra el proveedor externo
   mantienen el socket hasta el plazo del servidor (20 s, `plazoApi`) y el latido de
   `/api/coreo`, que caduca a los 2800 ms (`EspinaActividad.tsx:75`), hacia cola y
   moria. «Servidor caido» con el servidor perfecto.
 - `src/engine/presupuestoConn.ts`: semaforo FIFO con techo de 3 para lo NO critico
   (la mitad justa del presupuesto de Chrome), plazo de 8 s por sondeo de catalogo, y
   prioridad critica que **se salta el semaforo** para latido y telemetria. Un
   catalogo colgado ya no puede tapar el fonendo.
 - Un `senal` externo y un plazo vencido son cosas distintas: «cancelado» no se
   disfraza de «no respondio a tiempo».
 - `checkTelemetry` tenia `catch {}` y ningun plazo: ahora un sondeo a la vez con
   guarda en vuelo (el intervalo de 10 s ya no acumula fetches duplicados).
 - El modal deja de mentir por omision: con aviso de catalogo muestra «El catalogo no
   contesto: Z.ai…» en vez de «No se encontraron modelos con el filtro seleccionado»,
   que era indistinguible de un proveedor vacio (captura 2 con el chip «Z.ai (4+)»).
 - `tests/presupuestoConn.test.ts` (10) mide el techo, el orden de cola, que el
   latido pasa con 6 catalogos colgados, que el plazo libera el lugar, y que una
   senal ya abortada no deja salir el request.
 - En el camino: mi propia valla `ritualParsea` crasheaba dentro del ZIP en vez de
   informar que una suite no estaba (sin try/catch al leer la lista).

## v2.3.0 · 2026-11-03 · EL PRESUPUESTO DE CONEXIONES (servidor sano que parecia caido)
## v2.2.9 · 2026-11-03 · EL MARCADOR NO PUEDE MARCAR AL ENRUTADOR

 - Mario: «se me cambiaba solo de modelo al CEREBRO/AUTO o a otro que nunca contestaba».
   `colaDeMarcado()` filtraba ids internos, locales y embedders y exigia clave, pero NO
   exclua `provider:"cerebro"` / `cerebro/auto`, que no es un modelo de proveedor: es el
   enrutador (CerebroDialecto / el Eclctico). Entraba en la cola, no responda nadie, y
   ademais se comia uno de los 5 puestos con 12 min de cuarentena.
 - Segundo defecto: `PATRON_FALLO_COM` trataba igual un 429 de cuota que un "no lleg el
   primer byte". En nube gratuita el primer byte tarda; castigarlo con 12 min vaciaba la
   cola entera y dejaba el selector sobre el peor candidato.
 - Ahora: `categoriaFallo()` devuelve cuota | caida | lentitud | logica; `castigoDe()`
   cobra 12 min (cuota), 3 min (caida) y **nada** (lentitud = se reintenta). El default de
   `marcarComoNoContesto()` sigue siendo cuota para no cambiar a los llamadores viejos.
 - `motivoColaVacia()` explica por qu no queda nadie a quien marcar (pendiente: mostrarlo
   en el chat; vive en el util, la línea de App.tsx sigue quemando las 5 llamadas).
 - `tests/marcadorNoMarcaAuto.test.ts` (18) corre todo lo anterior y compara los dos
   literales de Cerebro/Auto sin crear un ciclo de importaciones.

## v2.2.8 · 2026-11-03 · LEER NO ES AFIRMAR

- Mario tenia **cinco** embedders instalados y el log afirmaba que no habia ninguno.
  `sondearTags()` devolvia `[]` igual con lista vacia que sin respuesta (`catch { return [] }`):
  el resolutor no podia distinguirlos y declaraba una ausencia que no habia medido.
- El sondeo ahora devuelve `{ modelos, leyenda }`. Con `fallo` se conserva la decision previa;
  si no la hay, `fuente: "sin-medir"` y un motivo que dice que NO se puede afirmar que falte.
  El cable pasa la leyenda al resolutor (`op.lectura`). Mismo aprendizaje que telemetriaHonest.
- Cerrados dos rojos mios de 2.2.7: un comentario dentro de `comprobar(` que se comio el `);`
  (embedderResidencia 55/0) y subir la version sin escribir esta entrada (techoContexto).

## v2.2.7 · 2026-11-03 · EL RITUAL LLEGÓ ROTO A TU MÁQUINA: ERA YO, Y AHORA SE VERIFICA SOLO

- **Ademas, en el mismo bulto (lo vio SU ritual, no el mio):** `diagnostico.ts:406`
  declaraba `plazoMs` dentro del `try` y lo usaba en el `catch`. Con un abort de Ollama
  (modelo frio) la ruta de modelos **morfa sin contestar**: el selector quedaba vacio y
  **el mensaje no salfa** -> el sintoma de la tercera queja. `tsc --noEmit` hoy: 0 errores.
  `plazoApi` dejo de asumir `res.once`. Restaurada la entrada v1.17.0 del CHANGELOG que yo
  habia perdido al reescribirlo. Y mis rotulos nuevos estaban en ingles (`Sandbox`), contra
  la valla de idioma de la hoja de ruta: ahora dicen <<Entorno de prueba>>. Leccion: el
  `npm run lint` (los tipos) entra a la Pre-entrega como paso obligatorio.

Mario instaló la 2.2.6, compiló perfecto (2093 módulos, `dist/` sano, Node 24.18) y al
correr `npm run validar` recibió:

```
scripts/validar.mjs:236   { id: "unaListaDePuertos", ... }   ^
SyntaxError: Unexpected token '{'
```

**Dos entradas que registré yo cerraban en `}` en vez de `},`.** No era tu entorno, no era
`npm install`, no era Ollama: era un archivo del paquete, y era justo **el verificador**, o
sea el único que no se puede romper. Me disculpo y lo trato como lo que es: un defecto de
entrega mío, no un ruido.

Por qué no lo agarró nadie: `censoSuites` verifica que las suites estén registradas, pero
vive **adentro** del ritual. Si el ritual no parsea, la valla que tendría que quejarse
tampoco corre. Un guardián que no puede hablar no guarda. La otra lección es mía y de
método: yo nunca ejecuté el ritual de este árbol después de registrar las vallas nuevas
(solo corría las vallas sueltas); el registro se probaba "leyendo" en vez de ejecutándose.

### La guarda nueva: `tests/ritualParsea.test.mjs` (5/5, corre de verdad)

- `node --check` sobre `scripts/validar.mjs`.
- Cada entrada de la lista de suites debe cerrar con `},` (detecta exactamente este error,
  con línea y nombre de suite).
- `node --check` sobre los **42 `.mjs`** de `scripts/` y `tests/`.
- Ningún `.mjs` con `require()` sin `createRequire` en un paquete `"type":"module"`.
- Presencia de los scripts críticos (`validar`, `empaquetar`, `manifiesto`, `superficie`,
  `sonda-arranque`).

Y pasó a la **Pre-entrega**: ahora todo paquete se envasa con `node --check scripts/validar.mjs`
*antes* de `empaquetar.mjs`, además de las 12 vallas dentro del ZIP. Los checks de `npm
install` que viste (16 moderadas, scripts bloqueados, avisos `deprecated`) siguen siendo
cadenas de desarrollo de `electron-builder`, no del motor: sigue en 0 la producción.

## v2.2.6 · 2026-11-03 · EL EMBEDDING TENIA EL MISMO CORTOCIRCUITO, Y LOS ESPEJOS UN CONTRATO AL REVÉS

Dos cosas que quedaban pedidas después del hallazgo de `plazoApi`, y las dos salieron de
comparar contra el paquete de la v1.99.0 que aportó Mario.

### Espejos: una valla invertida sostenía un dato falso

El pack de la 1.99.0 trae `tests/rutasEspejosDerivadas.test.ts`, y ahí la comparación es
incómoda: **la 1.99.0 exigía que el mapa del system prompt NOMBRA LA RAÍZ REAL derivada y
PROHIBÍA `~/.cerebronico/espejos`.** Hoy pedía exactamente lo contrario. En v2.1.2 se
invirtió el contrato (para ahorrar 67 caracteres del mapa, techo de 3000) y la valla se
editó para acompañar la inversión.

Consecuencia concreta en Windows: `~` no se expande, así que cada turno le estaba diciendo
al modelo que los espejos viven en `C:\Users\<usuario>\.cerebronico\espejos`, mientras el
cargador los lee de `PROJECT_ROOT\.cerebronico\espejos` (`server.ts:4995`). El espejo se
escribe en un lado y se busca en el otro: «no hay espejos», sin ningún rojo en ninguna parte.

**Cura:** `textoDeRutasSistema()` arma la línea con `raizEspejosPersonalizados(so, raízDeDatos)`
— la MISMA función del cable operativo, así no puede desincronizarse — y con SO desconocido
usa el relativo `.cerebronico/espejos`, que no adivina ninguna raíz. El mapa quedó en
**2975 de 3000 caracteres**: se restauró la verdad gastando 15 caracteres, no 67. La valla
volvió a su intención original (`rutasEspejosDerivadas` **6/6**) y `rutasSistema` quedó en
**137/0**.

### Embedding: `GET /api/cerebro/embedder` también corría contra la guillotina

La tarjeta del panel lee `deps.resolutor.estado()`, que pregunta al motor de embeddings qué
quedó residente. Con el modelo frío, eso **es** una carga desde disco (los 28 s del hallazgo
anterior), y la ruta no estaba en la tabla de plazos: cortada a los 20 s → la tarjeta dice
«sin embedder» y el botón «Calentar vectores ahora» parece no hacer nada.

- `/api/cerebro/embedder` pasó a tener 90 s propios. `/api/cerebro/embedder/calentar` conserva
  sus 300 s porque la coincidencia **más específica** gana (eso lo prueba `plazoApiStream`).
- La cura de la 1.99.0 sigue viva y verificada: `CN_EMBED_KEEP_ALIVE_MS=120000`, con su valla
  `embedderLocal` (**15/0**) que comprueba que el router le pasa la residencia al motor en vez
  de heredar el `OLLAMA_KEEP_ALIVE=5m` del chat. Ollama no admite dos modelos residentes a la
  vez: si el de chat pisa al de embeddings, el cerebro se queda sin vectores y el chat no.
- Dato honesto: `espejos` pasó de 663 menciones (1.99/2.1.2) a 628 hoy, y `embeddinggemma` de
  40 a 34. Antes de tocar cualquiera de los dos hace falta la salida de `ollama list` de tu
  máquina: la sonda ya la pide y ya distingue «no instalado» de «sin medir».

## v1.17.0 — HÍBRIDO CerebroNico × Hindsight: memoria que aprende + skills servidas bajo demanda (2026-09-28)

El motor deja de depender solo del contexto de la ventana. Se integra el ecosistema Hindsight (vectorize-io) sobre el árbol v1.16.6-EDITOR-V2-VALIDADO **sin tocar `server.ts` ni abrir una ruta nueva**: la capacidad entra por el contrato de packs externos que ya existía (`tools.config.json` → GET /tools + POST /tools/call).

- **PACK `memoria-hindsight` (`:5100`, `scripts/hindsight_daemon.py`)** — 11 herramientas para el bucle del agente: `memory_estado`, `memory_recall`, `memory_guardar_aprendizaje`, `memory_reflect`, `memory_ingest`, `memory_guardar_page`, `memory_leer_page`, `memory_listar_pages`, `memory_borrar_page` (destructiva, pide confirmación), `listar_skills`/`leer_skill`. **100 % biblioteca estándar** (http.server + urllib), coherente con `mcp_fetch.py`: arranca en cualquier Python 3.8+ sin `pip install`.
- **DOS CAPAS, UNA CARA**: con `HINDSITE_API_URL` puesto, cada herramienta se traduce a la API REST de Hindsight (retain/recall/reflect/mental-models → memoria biomimética con extracción de hechos y síntesis por LLM). Sin servidor, **modo espejo**: almacén local en `.cerebro-db/hindsight-mirror.json` con búsqueda por superposición de términos normalizada (acentos español-insensible) y la misma disciplina de `core-agent/agent_core/loader.py` — escritura atómica (`.tmp` + `os.replace`), snapshot previo en `hindsight-mirror_history/`, lock portable con caducidad. **La degradación es honesta**: `memory_estado` y el propio `reflect` declaran que en espejo no hay síntesis LLM.
- **AUTOCURACIÓN DEL ESPEJO (bug cazado por la propia suite)**: un almacén ilegible se archivaba como `.danado.*` en CADA lectura y jamás se dejaba reescribir — inundación de copias y memoria muerta para siempre. Ahora se archiva UNA vez y el activo se regenera con un almacén limpio; el corrupto queda preservado byte a byte.
- **WRAPPER NODE del SDK oficial (`:5101`, `scripts/hindsight_agent_server.mjs`)** — expone las 8 herramientas `agent_knowledge_*` de `@vectorize-io/hindsight-agent-sdk` (vendorizado en `vendor/hindsight-agent-sdk`, `dist/` precompilado incluido) más `hs_estado`. Viaja **`enabled: false`** a propósito: ofrecer 18 herramientas de memoria a la vez a un modelo ≤8B es exactamente lo que `selectToolsForModel` existe para evitar.
- **SKILLS COMO HERRAMIENTAS, no como relleno del prompt**: 6 skills instaladas en `skills/` (`hindsight-architect`, `hindsight-local`, `hindsight-cloud`, `hindsight-self-hosted`, `hindsight-docs` con sus `references/`, `code-review`) + `SKILLS.md` con el protocolo de uso. El modelo las carga con `leer_skill` solo cuando hacen falta. **Guarda anti-traversal probada**: `../` dentro de `skill` o `archivo` devuelve `ok:false`; solo se sirven `.md`/`.txt`/`.json` dentro de `skills/`.
- **ARRANQUE SIN RIESGO**: el demonio se levanta en `iniciar_todo_windows.bat` como subsistema opcional (si falta Python o el puerto está tomado, la IDE sigue igual) y los packs caídos se reintentan 12× cada 5 s y se recargan con `POST /api/tools/packs/recargar`. `server.ts` no se modificó: **la superficie sigue en 138 rutas**.
- **GOBERNANZA**: `cerebro.md` gana la §8 (capa opcional por construcción, reglas de recall-antes/aprender-después, y la norma de que el acta `memoria.md` manda sobre la memoria consultiva si contradicen). ADR en `memoria.md` → §2. Semilla de versión subida a **1.17.0** (`src/constants.ts` ↔ `package.json` ↔ `index.html`) con el ratchet de `tests/bajoConsumo.test.ts` subido conscientemente.
- **NUEVAS ÓRDENES**: `npm run memoria` / `memoria:linux` (demonio), `hindsight:server` / `hindsight:server:linux` (servidor Hindsight con su proveedor LLM), `memoria:node` (wrapper SDK), `vendor:sdk` (revendorizar), `test:hindsight`. Variables documentadas en `.env.example` (todas opcionales).
- **Suite nueva `tests/hindsightHibrido.test.ts`** (contrato de pack, modo espejo, corrupción/autocuración, guarda de skills, manifiesto Node en seco, coherencia de puertos y configuración, gobernanza) registrada en `scripts/validar.mjs`.

## v2.2.5 · 2026-11-03 · LA GUILLOTINA DE 20 s QUE MATABA EL CHAT (el hallazgo del zip de Mario)

Mario aportó `CN-cruce-de-datos.zip` con el `server.ts` de la **v1.99.0** — el servidor de
la versión que él recuerda andando. **El diff completo contra hoy son 17 líneas, y la única
con comportamiento es `app.use("/api", plazoApi())`** (v2.1.5). El monolito no cambió: lo
que cambió es que ahora todas las rutas tienen un plazo de 20 s.

Dos rutas no caben en 20 s **por diseño**:

* **`POST /api/ai/stream`** — el `.bat` lanza Ollama con `OLLAMA_KEEP_ALIVE=5m` (línea 140;
  la 22 aclara «el modelo NO queda residente», que es el modo bajo consumo que él pidió).
  A los cinco minutos el modelo se descarga y el mensaje siguiente paga la carga desde
  disco. Este proyecto **ya midió** ese costo: 28 s. Con 28 s > 20 s el reloj dispara con
  `headersSent === false` → **504 antes del primer token** → en pantalla «el mensaje no
  sale», sin rojo. En la 1.99.0 el usuario esperaba y entraba.
* **`GET /api/health/deep`** — corre los cinco chequeos con su sondeo de Ollama. Cortarlo
  deja el splash en «consultando el estado del motor…», **exactamente el síntoma que el
  middleware decía venir a curar**.

### La cura

`plazoDeRuta()` (puro): el reloj sigue en el camino común —una ruta olvidada no puede colgar
el navegador— pero hay tabla de **rutas lentas por diseño**, cada una con su `porque`
escrito (`/api/ai/stream` 300 s, `health/deep` 60 s, `warmup` y `calentar` 300 s, `brain/`
180 s, `tts/` 120 s, `sandbox/start` · `bridge/` · `arranque/interruptor` 90 s). Además:
si ya se estaban mandando bytes, el callback **no responde** (un stream con pausas no es una
ruta colgada) y el timeout del socket se **suelta** en `finish`/`close`, para que un reloj de
20 s no condene a la siguiente respuesta del mismo navegador keep-alive. El 504 ahora reporta
`plazoMs`.

`/api/ollama/models` **no** entró en la tabla a propósito: ya aborta sus sondas en
`CN_PLAZO_TAGS_MS`, así que suma excusas no suma diagnóstico.

Referencia guardada en `documentacion/referencia-v1990/DIF-SERVER-v1.99.0-vs-actual.md`, con
el SHA del paquete de la 1.99.0 para que cualquiera lo re-verifique.

**Corrección a lo que dije antes:** la trampa de `OLLAMA_HOST` (v2.2.2) **ya estaba en la
1.99.0**, o sea que no es la regresión de la serie 2.1.x sino un defecto latente que solo
muerde si la variable llega al entorno del server. La curo igual, pero no es "la línea que
rompió todo": esa es `plazoApi`.

Valla nueva `tests/plazoApiStream.test.ts` (**13/13**): corre `plazoDeRuta` y exige que el
plazo del stream supere los 28 s medidos, que ninguna excepción sea un comodín `/api`, que
la coincidencia más específica gane, y que `plazoApi` no existiera en el snapshot de la 1.99.0.

## v2.2.4 · 2026-11-03 · UNA SOLA LISTA DE SERVICIOS, Y LA PESTAÑA DE PUERTOS LIBRE

Mario, con la captura delante: «solo deberías dejar uno, quizás los de arriba con botón
de reinicio o de encendido y apagado, y esa pestaña usarla para otra cosa». Tenía razón,
y no era una cuestión estética: en la misma pantalla el sistema respondía **cuatro veces
con cuatro criterios distintos** (`:5000 OFF` arriba, `3000 SIN RESPUESTA` + 5 `STANDBY`
a la izquierda, `5/5 arriba` a la derecha, y `Modo Agente PC: ACTIVO` que no mide nada).

| antes | después |
|---|---|
| `Tab Puertos`: telemetría de 6 puertos | `Tab Puertos` → **Motor local**: residencia de Ollama, embedder y subagentes |
| `Tab Tareas · Servicios`: 5 interruptores con reset | **la lista canónica**, ahora con la edad de la muestra y el botón **Reconectar** (viajó con la lista) |
| dos listas, dos criterios | una lista, un criterio; los chips de la cabecera quedan como resumen de una línea |

- **`src/components/LeftSidebar.tsx`**: fuera el bloque de 6 tarjetas (líneas 649-791).
- **`src/components/PlanificationPanel.tsx`**: recibe `telemetry` / `onReconnectAll` /
  `isReconnecting`. El subtítulo ahora dice `5/5 arriba · hace 1 h 20 min · 2 sin responder
  ahora` — justo el caso que tenía la pantalla congelada desde las 15:44 con reloj 17:05.
  El punto verde sigue siendo la realidad medida y el botón la voluntad del usuario: son dos
  cosas distintas a propósito. Como la tabla de interruptores no trae el `:3500`, se lo
  menciona aparte (`sandbox :3500 en reposo` / `activo`) para que la información no se pierda.
- **`src/App.tsx`**: el cable de `telemetry` y `handleReconnectAll` hacia esa tarjeta.
- **Efecto lateral bueno**: el panel izquierdo tenía su propio `useLatido()`, es decir un
  **segundo** sondeo de `/api/coreo` cada 700 ms junto al de la espina. Dos consumidores del
  mismo latido son dos oportunidades de contradictorio. Quedó uno (`EspinaActividad`).
- **`src/engine/haceTexto.ts`** (nuevo): la edad en texto vive en `src/engine` porque la
  necesitan los dos lados. `server/estado/telemetria.ts` la **re-exporta** en vez de tener su
  propia copia: dos implementaciones de «hace 1 h 20 min» es la deriva de siempre.

Valla nueva `tests/unaListaDePuertos.test.ts` (**13/13**): exige que `LeftSidebar` no pinte
ningún `telemetry.port`, que la lista canónica conserve su `POST /api/arranque/interruptor`,
que el botón Reconectar esté y App se lo pase (leyendo el bloque JSX, no el orden de los
props), que `haceTexto` tenga una sola definición, que el `:3500` no se haya perdido, que
`useLatido` haya salido del panel, y que **nadie tocó `index.css`, `ChatCenter.tsx`,
`hormaChat.ts` ni `goteo.ts`**.


---
## v1.0.0 — 6 de noviembre de 2026 · LÍNEA BASE

**CerebróNico reinicia su numeración.** El producto que hasta ahora se llamaba
v2.3.23 pasa a ser **CerebróNico 1.0.0**: la primera versión con el árbol
coherente de punta a punta y una sola semilla de versión.

### Por qué 1.0.0 y no 2.3.24

El árbol arrastraba cuatro esquemas de numeración conviviendo (v0.9, v1.0.3,
v2.3.x, v8.0.x). Eso no era cosmético: producía discrepancias reales entre la
cabecera, el menú, el `title` y el `dist/` compilado, y cada auditoría encontraba
una distinta. Un solo número, una sola fuente (`VERSION_SEMVER` en
`src/constants.ts`), y todo lo visible derivado de ella.

### Qué cambia

- `src/constants.ts` → `VERSION_SEMVER = "1.0.0"` (única semilla).
- `package.json` → `"version": "1.0.0"`.
- `index.html` → `title`, `description`, `og:title` y `og:description` en `V1.0.0`.
- `dist/server.mjs` → recompilado en 1.0.0.
- `scripts/candado-lockfile.mjs` → verde: `sin contradicciones version↔resolved`.

### Qué NO cambia

- El nombre de la carpeta raíz (`CerebroNico-IDE-v2.3.8`) se conserva: renombrarla
  rompe accesos directos, rutas guardadas y el `PROJECT_DIR`.
- El histórico de este CHANGELOG (2.3.23 y anteriores) se conserva íntegro como
  archivo. Lo de arriba es la línea base nueva; lo de abajo es la historia real
  de cómo se llegó hasta aquí.
- `_respaldo-pre-2.3.9-*` se conserva: es una foto fechada, no documentación viva.

### Deuda conocida

- `EXPORT-CONTEXTO.md` es un artefacto **generado** que vuelca código fuente
  dentro. Su cabecera seguirá diciendo 2.3.23 hasta que se regenere con su
  script; no se edita a mano.

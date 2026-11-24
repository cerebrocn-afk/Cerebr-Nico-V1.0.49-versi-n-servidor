## v1.72.0 · 2026-10-26 · UN RECURSO AUSENTE YA NO PUEDE DISFRAZARSE DE PÁGINA (y el bucle «Compilar» deja de apagarse en silencio)

Cinco defectos, los cinco medidos antes de tocar nada. Y un número que había que
corregir antes de nada: **el ZIP v1.71.1 no estaba en verde** cuando llegó.

---

# 0 · LA MEDICIÓN ANTERIOR ESTABA SUCIA: dos artefactos que hay que desactivar

## 0.1 · «189 suites que NO llegaron a ejecutarse» no era del proyecto

En un Linux limpio, `npm install --ignore-scripts` deja `esbuild` sin su binario
de plataforma (el `postinstall` que lo baja es justamente el script que se saltó)
y `tsx` revienta con:

```
Error: The package "@esbuild/linux-x64" could not be found, and is needed by esbuild.
name: 'TransformError'
```

Como `validar.mjs` ejecuta cada suite con `npx tsx`, **todas** las suites de
`.test.ts` se declararon «no ejecutadas». Solución: `npm install --no-save
--ignore-scripts @esbuild/linux-x64@0.25.12`. Tras eso: 0 suites sin ejecutar.

**Lección para el veredicto**: «suite no ejecutada» puede significar «falta el
binario de plataforma», no «el código está roto». Confundirlo hace buscar bugs
que no existen.

## 0.2 · «7 fallos» eran míos, y de un modo engañoso

`npm run validar` dura ~170 s. Si se edita el árbol **mientras** corre, la corrida
lee los ficheros a mitad de cambio. Dos corridas así produjeron fallos que no
existían en ningún estado coherente del código, incluido un

```
FALLO → el trinquete aguanta: server.ts 12352 ≤ presupuesto 12282
```

que era real pero atribuible a una edición en vuelo, no al ZIP. Regla operativa
que sale de aquí: **o se espera a la corrida, o se lanza sobre una copia**.

## 0.3 · El estado de partida, con el árbol quieto

| Árbol | Veredicto |
|---|---|
| ZIP 1.71.1 prístino (una corrida, todavía con mi módulo creado y sin importar) | HAY FALLOS — 2 / 8134 |
| Ambos fallos | `presupuestoHuerfanos`, causado por ese módulo sin importar |
| **Árbol final v1.72.0** | **TODO CORRECTO — 8133 comprobaciones, 0 fallos** |

Es decir: no venía nada roto de fábrica, y lo que sí venía roto (el sandbox, el
bucle, los estados muertos, la promesa falsa del recetario) no lo detectaba
ninguna valla.

---

# 1 · EL SANDBOX DEVOLVÍA HTML DONDE TOCABA UN ARCHIVO

## 1.1 · Medido, no recordado

Se extrajo la plantilla real del servidor estático del sandbox, se escribió a
`.cjs` y se arrancó contra un escenario con `index.html`, `styles.css`,
`assets/subidas/foto.png` e `img/foto.png`:

```
/                         -> 200 text/html      183 b   correcto
/img/foto.png             -> 200 text/html      183 b   ← el HTML, no la imagen
/img/noexiste.png         -> 200 text/html      183 b   ← ni siquiera 404
/css/rota.css             -> 200 text/html      183 b   ← el navegador lo rechaza por MIME
/assets/subidas/foto.png  -> 200 image/png       27 b   correcto
/pagina/inexistente       -> 200 text/html      183 b   correcto (navegación)
```

**Corrección a la nota de la sesión anterior**: `/styles.css` **no** estaba roto
— el archivo existía en la raíz servida y se servía bien. Lo roto era cualquier
ruta de recurso **que no existía** en la raíz servida. Afirmar lo contrario habría
mandado a arreglar un archivo que funcionaba.

## 1.2 · La causa, en dos capas

`server.ts` (bloque `FALLBACK DE RUTAS ESTÁTICAS EN CASCADA`) hacía esto con todo
lo que no encontrara:

1. Rebuscaba **solo** bajo `assets/`, y solo si `projectRoot !== root`.
2. Si nada calzaba, caía en el fallback de SPA: `index.html` con **200 y
   `text/html`**, sin importar que el pedido fuera un `.png`, un `.css` o un `.js`.

De ahí los tres síntomas que se reportaban como «misterio»:

* `<img>` roto **sin ningn aviso**: el navegador recibe texto donde esperaba
  bytes, y un `<img>` con respuesta 200 no pinta nada.
* CSS o JS descartados por MIME → `Unexpected token '<'`.
* El único modo de enterarse era abrir la consola de red, y ni eso: dava 200.

YY, encima, encima una **contradicción de rutas** (§3): el recetario mandaba escribir
`./img/<nombre>`, que es justo una ruta que el cascada nunca resuelva.

## 1.3 · El arreglo: recurso vs navegación, y un 404 que habla

Una sola cascada (`resuelveFaltante`) y una sola distinción (`esPedidoDeRecurso`):

```
/img/foto.png             -> 200 image/png       27 b  [proyecto:img/foto.png]
/img/noexiste.png         -> 404 text/plain     122 b
/styles.css               -> 200 text/css        35 b
/assets/subidas/foto.png  -> 200 image/png       27 b  [proyecto:assets/subidas/foto.png]
/css/rota.css             -> 404 text/plain     118 b
/pagina/inexistente       -> 200 text/html      183 b   (la SPA sigue intacta)
```

* **RECURSO** (ruta con extensión distinta de `.html`) → o archivo real, o
  `404 text/plain` que dice la ruta, la raíz servida y la raíz del proyecto.
* **NAVEGACIÓN** (sin extensión) → conserva el fallback de SPA, con las dos
  trampas que ya estaban documentadas y se **conservan literalmente**: index.html
  de 0 bytes, y index.html que no contiene HTML (el caso real del usuario: 24
  bytes con `// test sync 1789242976`).
* Búsqueda en orden: raíz servida → raíz del proyecto → búsqueda **por nombre de
  archivo** (nica coincidencia; si hay varias, el 404 las lista en vez de
  adivinar).
* Cabeceras `X-CN-Resuelto` / `X-CN-Missing` para diagnosticar sin conjeturas.

Arn: `cn72/probar-sandbox.mjs` (fuera del paquete, es herramienta de
desarrollo). Cierra con `N correctas · M fallídas`, que es el nico lenguaje que
entiende `validar.mjs`.

---

# 2 · LA PLANTILLA SE FUE DEL MONOLITO (el trinquete se respeta, no se sube)

`server.ts` estaba **exactamente en su presupuesto**: 12282/12282. Cualquier
arreglo inline lo rompa, y la tentacin de «regenerar el contrato para arriba»
existe. No se hizo.

La plantilla (`STATIC_SERVER_SOURCE`, 242 líneas dentro de otra plantilla) vive
ahora en **`server/sandboxEstatico.ts`**, y `server.ts` solo la importa:

```
presupuesto_lineas  12282  ->  12055   (227 lineas por debajo del trinquete anterior)
techo_absoluto      13800  ->  13600
rutas               149 declaradas / 149 en el codigo   (CONTRATO INTACTO)
```

Beneficio secundario, y era el motivo real: **la plantilla ahora se puede
verifiquéar aislada**. `viaRapidaPreview` pasó de 64 a 67 comprobaciones — sus
3 asserts (`extraer` / `node --check` / comillas de atributo) ahora cubren las
3 funciones nuevas.

## 2.1 · La trampa de las contrabarras, y por qu ahora es imposible

La plantilla era una plantilla de plantilla: los regex necesitaban `\\/` **doble**
en el fuente de TypeScript. El intento anterior escribió una sola barra y
produjo esto en el `.cjs` generado:

```
function sinPrefijo(u) { return String(u || "").replace(/^/+/, ""); }
                                            ^ SyntaxError: missing /
```

El sandbox no habra encendido **nunca** y el síntoma habra sido «previsualizador
en blanco», otra vez. El bug se detect solo porque el flujo nuevo obliga a
extraer → resolver → `node --check` **antes** de dar el arreglo por bueno.

Dos cosas dejaron de ser a mano:

* El módulo se gener re-escapando el JS **ya resuelto** con una sola función
  (`\\` → `\\\\`, `` ` `` → `` \` ``, `${` → `\${`), en lugar de escribir barras
  dobles a ojo.
* La valla de `consola-voz` que comprueba `pareceHtml = /<\\s*/` sigue viva y
  ahora apunta al módulo.

## 2.2 · Bug real destapado al depurar lo anterior

El cuerpo generado no termin en salto de línea, as que el cierre `` `; `` qued
pegado a `server.listen(...)` y el regex `\n`;` de las vallas **no poda extraer
la plantilla**. Es decir: un módulo perfectamente funcional pero invisible para
sus propios verifiquéadores. Corregido; la valla lo cubre desde entonces.

---

# 3 · EL RECETARIO PROMETA ALGO QUE NUNCA OCURRA

`src/engine/recetarioUI.ts` deca, literalmente, línea 139:

> «usa `<img src="./img/<nombre>">` — el endpoint `/api/sandbox/inject-image` la
> copia al sandbox **automticamente**»

Tres cosas eran falsas a la vez, y se midieron:

* `inject-image` **no tiene un solo llamador** en todo el frontend. La copia jams
  ocurra.
* El motor materializa las subidas en `assets/subidas/<nombre>` **dentro del
  proyecto del sandbox** (`server.ts`, bloque `imagenesGuardadas`) y le pasa al
  modeloo la ruta exacta. `/img/` no la escribe nadie.
* `./img/<nombre>` era justamente la forma que el cascada antiguo nunca resuelva
  → instruccin que fabricaba el bug del §1.

Se corrigi la **instruccin** para que diga la verdad (`assets/subidas/` es la
ruta; `img/` es solo de `cerebronico:imagen`, que es otra cosa) y se anot el
estado real del endpoint en su propio encabezado. **No se borr el endpoint**:
est dado de alta en `contrato-rutas.json`, y darlo de baja es un cambio de
superficie, no una limpieza. Sigue siendo la respuesta correcta cuando el sitio
servido es una subcarpeta y el HTML no puede subir con `../`.

Queda como trabajo futuro legtimo, **no hecho**: cableadoarlo desde la aduana de
sync (`repararImagenes`) en lugar de dejarlo superfluo.

---

# 4 · CINCO ESTADOS DE INTERFAZ QUE SOLO SE ESCRIBAN

Medidos uno a uno (conteo de lecturas, no impresin):

| Estado | Lecturas | Destino |
|---|---|---|
| `skillSearch` (RightSidebar) | 0 | fuera — resto del panel «Skills (100)», **eliminado a propósito en v1.6.33** |
| `selectedSkillCategory` (RightSidebar) | 0 | fuera — idem |
| `showFavoritesPanel` (App) | 0 | fuera — `favoritePrompts` s est vivo; el booleano «abra» un panel inexistente |
| `showSnapshotsPanel` (App) | 0 | fuera, con su prop `onShowSnapshotsPanel` en App y Header |
| `promptInfoState` (App) | 0 | fuera, junto con su `type PromptInfo` importado; el dato igual sale al terminal desde `contextPayload.promptInfo` |

No se resucit la UI de skills: las inyecta el motor desde `contextCache.ts`, que
fue la decisión de v1.6.33.

**Y una nota que era mentira**: el Header deca «el panel de snapshots sigue
accesible desde el menú CN». El menú CN no tena esa entrada. Los props
`snapshots` / `onRestoreSnapshot` / `onDeleteSnapshot` **se conservan cableadoados**
como nico punto de reanudacin, pero hoy la funcionalidad solo existe por CLI
(`npm run snapshot | verifiquéar | cirugia | revertir`). Reabrir el panel queda
como decisión de producto, anotada como tal, no como olvido.

---

# 5 · EL BUCLE «COMPILAR Y CORREGIR» TENA TRES FALLOS DE CABLE

`handleBuildAndFix` viva solo en un `useRef`, sin reflejo en pantalla.

1. **Sin guarda antirreintento.** Cada vuelta termin en `handleSendMessage` y el
   botón segua activo mientras el modelo responda: dos clics montaban **dos
   bucles sobre el mismo ref**, se mezclaban las iteraciones, se duplicaban los
   reenvíos de errores y el tope de 5 dejaba de ser 5.
2. **Se apagaba en silencio.** En `onError`, `buildFixRef.current.active = false`
   sin decir nada: el botón volva a su estado normal y «Compilar» ya no haca
   nada visible.
3. **Nada se vea en pantalla.** El progreso sola iba al log de terminal.

Ahora: `buildFixUI` es espejo visible del ref (el ref sigue mandando), cada vuelta
lo actualiza, el botón muestra `Compilando N/M` y se deshabilita, un segundo clic
avisa en lugar de sumar un bucle, y el apagado por fallo de comúnicacin escribe
en qu vuelta estaba y que **el proyecto NO qued corregido**.

> Sin el punto 5 del cableadoado (`buildFix={buildFixUI}`) el estado nuevo habra
> sido **un estado muerto ms**, exactamente lo que se denunci en §4. Se cableado
> primero, y por eso `buildFixUI` tiene lectura.

---

# 6 · VERIFICACIN (nada declarado sin ejecutar)

```
npx tsc --noEmit                    0 errores
npm run validar                     TODO CORRECTO — 8133 comprobaciones, 0 fallos
                                    suites que no llegaron a ejecutarse: 0
npm run superficie --verifiquéar      CONTRATO INTACTO (149 rutas declaradas / 149 en el código)
probar-sandbox --expect fixed       8 correctas · 0 fallídas
probar-sandbox --expect baseline    3 correctas · 1 fallídas  (el bug, reproducido)
viaRapidaPreview                    67 correctas · 0 fallídas  (antes 64)
consola-voz                         79 correctas · 0 fallídas  (antes 75 + 4 FALLO)
botones                             8 correctas · 0 fallídas
presupuestoHuerfanos                104 correctas · 0 fallídas · HUERFANO 0
npm run build                       OK (vite + esbuild)
plantilla dentro de dist/server.mjs  extraida, node --check OK, y 8/8 otra vez
```

La última línea es la que importa para el EXE: `npm start` y el instalador corren
`dist/server.mjs`, no `server.ts`. Se verifiqué la plantilla **en el bundle**, no
solo en el fuente.

## 6.1 · Los 5 fallos intermedios eran de forma, no de lgica

Al mover la plantilla, dos vallas siguieron leyndola en `server.ts`:
`viaRapidaPreview` (regex `const STATIC_SERVER_SOURCE = ...`) y `consola-voz`
(literalidades sobre `leer("server.ts")`). Se apuntaron al módulo; **el intento de
las vallas no cambi**: extraer, resolver escapes, `node --check`.

---

# 7 · ARCHIVOS

**Nuevo**

* `server/sandboxEstatico.ts` — plantilla del servidor esttico del sandbox, con
  la correccin del §1. **`require()` a propósito**: se escribe a
  `.cn-static-server.cjs` y corre como proceso aparte; si alguien lo pasa a
  `import`, el sandbox deja de encender.

**Modificados**

* `server.ts` — fuera la plantilla (242 líneas), dentro su importación
  (`PLANTILLA_ESTATICA`); nota de estado en `/api/sandbox/inject-image`.
* `src/engine/recetarioUI.ts` — la receta de imgenes subdas dice la verdad (§3).
* `src/App.tsx` — 4 estados muertos fuera; bucle con guarda, espejo y apagado
  ruidoso; `buildFix` cableadoado a la barra.
* `src/components/RightSidebar.tsx` — 2 estados muertos fuera; botn
  «Compilar» con estado visible.
* `src/components/Header.tsx` — fuera `onShowSnapshotsPanel`; aviso honesto en
  los props de snapshots; comentario del «menú CN» corregido.
* `tests/viaRapidaPreview.test.ts`, `tests/consola-voz.test.ts` — leen la
  plantilla donde vive ahora.
* `contrato-rutas.json`, `SUPERFICIE_RUTAS.md`, `EXPORT-CONTEXTO.md` —
  regenerados (12055 líneas, 149 rutas, módulo nuevo incluido).


---

# 8 · CIERRE DE LA DEUDA ANOTADA (v1.72.0 · segunda pasada)

## 8.1 · Un 404 de algo que SÍ existía: bug introducido por el §1

Para decidir si `/api/sandbox/inject-image` hacía falta se montó un escenario
nuevo: el sandbox sirviendo una **subcarpeta** (`.creador/sitio/`) mientras las
imágenes viven en la raíz del proyecto. Lo que apareció no fue la respuesta
esperada sino un defecto propio:

```
/otro.png -> 404 "existe en varios sitios: .../img/otro.png, .../img/otro.png"
```

La misma ruta entraba **dos veces** en la lista de coincidencias: la raíz servida
y la raíz del proyecto **se solapan** cuando el sitio es una subcarpeta del
proyecto. Un archivo único se declaraba ambiguo y devolvía 404.

Y `viaRapidaPreview` seguía en verde, porque el `.cjs` compilaba perfecto: el
defecto era de **conducta**, no de forma. Las 8 pruebas del §1.3 no cubrían
subcarpeta. Después de deduplicar (y de dar prioridad a la raíz servida cuando
hay coincidencias reales distintas):

```
SUBCARPETA        3 correctas · 0 fallidas
SANDBOX base      8 correctas · 0 fallidas   (sin regresión)
/assets/subidas/foto.png -> 200 image/png  [X-CN-Resuelto: proyecto:assets/subidas/foto.png]
```

## 8.2 · `inject-image`: redundante, medido — y NO borrado

El caso que el endpoint prometía cubrir («el sandbox sirve una subcarpeta y el
HTML no puede subir con `../`») **ya funciona por cascada**, como muestra la
cabecera `X-CN-Resuelto` de arriba. Hoy el endpoint es redundante, no
insustituible.

Se **mantiene**: darlo de baja de `contrato-rutas.json` es una reducción de
superficie HTTP — una decisión de contrato, no una limpieza. Queda documentado y
medido para decidir con datos.

## 8.3 · Puntos de restauración devueltos a la interfaz

Sección **plegable dentro del menú CN**: no nace ningún panel flotante ni
columna nueva (regla de la casa: pantalla principal limpia, chat al centro).
Consume los tres props que ya viajaban sordos (`snapshots`, `onRestoreSnapshot`,
`onDeleteSnapshot`) y añade `onCreateSnapshot`. Los handlers de `App` ya traían
confirmación y snapshot de seguridad previo a restaurar: no se inventó
comportamiento, solo se hizo **alcanzable** lo que existía.

## 8.4 · La versión viaja en CUATRO sitios y la sincronizo a medias

Bumpié `package.json` y nada más. Saltaron 7 fallos que decían justo eso:

```
constants.ts es la semilla                       (VERSION_SEMVER: fuente única)
package.json = semilla
package-lock.json = semilla (antes viajaba solo)
el paquete del lock también
index.html = semilla                             (title + og:title)
la semilla es la versión más alta del CHANGELOG
```

Sitios que había que tocar y no estaban: **`src/constants.ts`** (la semilla
misma), **`package-lock.json`** (dos campos) e **`index.html`** (4 ocurrencias
de `V1.71.1`). Tras sincronizar: `motor-datos` 96·0, `techoContexto` 115·0,
`bajoConsumo` 84·0, `creadorWeb` 158·0, `hindsightHibrido` 107·0,
`ordenDeObra` 91·0.

> Lección que vale más que el arreglo: leí la salida de `techoContexto` como
> «3 fallos» cuando eran 3 **comprobaciones en verde** cuyo texto describía el
> descuido (`lock=1.71.1 semilla=1.72.0` era el *motivo* del assert, no su
> resultado). Lo mismo que hizo la valla — mirar los cuatro sitios en vez de
> uno — es lo que a mí me faltó.

# INFORME DE VALIDACIÓN — CerebroNico IDE v2.0.0 → v2.1.2 → **v2.2.0 (rebasada sobre el árbol real)**

**Fecha**: 2026-11-02 (v2.1.4: 23:5x, tras la captura del telón) · **Juez**: sandbox Linux (Node 22.23.2, Python 3.12.2), sin `node_modules` del proyecto
**Punto de partida**: el ZIP `CerebroNico-IDE-v2.1.2` (2165 entradas) **+** el pack `_fusion-v212.7z` (9 archivos)
**Bump**: por la semilla única `VERSION_SEMVER` (`src/constants.ts:242`), nunca espejo por espejo.

Este informe no repite la v2.1.2. Acá se juzga **la fusión**: qué piezas no cerraban entre sí, y qué se
midió después de unirlas. Cada afirmación dice cómo se midió.

---

## 0. Qué se fusionó (y qué no)

| Pieza | Estado al entrar | Qué aporta |
|---|---|---|
| ZIP v2.1.2 (2165 entradas) | árbol base | todo el proyecto |
| `_fusion-v212.7z` — 5 archivos que difieren | aplicados | `server.ts`, `scripts/empaquetar.mjs`, `src/engine/rutasSistema.ts`, `src/engine/cerebroOrgano.ts`, `tests/embedderResidencia.test.ts` |
| `_fusion-v212.7z` — 4 archivos idénticos | ya estaban | no se tocaron (`RUTAS-DEL-SISTEMA.md` y 3 vallas) |
| `_fusion-v212.7z` — `empaquetar.mjs` (raíz) + `.cerebro-papelera/` | **NO** | duplicado del script y basura de sesión del propio Mario |

Las dos comprobaciones que costaron caro la vez pasada se repitieron acá: **`cmp` byte a byte** de cada
archivo fusionado contra el del pack, y **conteo por diferencia simétrica**, nunca por tamaño.

---

## 1. Los 19 fallos, uno por uno

El veredicto de la instalación decía: *19 fallos sobre 10.264 comprobaciones y 4 suites que no llegaron a
ejecutarse*. Clasificados por causa raíz, no por suite:

### Grupo A — vallas huérfanas (1 fallo, 2 suites: `resiliencia`, `censoSuites`)

Cuatro suites de empaquetado llegaron al árbol **sin registrar** en `scripts/validar.mjs`:
`empaquetadoReceta`, `empaquetadoSinBasura`, `espejosServidorCableado`, `rutasEspejosDerivadas`.
Una suite que existe y nadie cuenta no es una valla: `resiliencia` la ve como huérfana y el ritual no la
ejecuta. **Cura**: las cuatro entradas en `SUITES`, con su ficha de qué vigilan.
→ `resiliencia` **35/0** · `censoSuites` **1/1** (batía en las dos direcciones).

### Grupo B — la receta de empaquetado (4 fallos: `empaquetado`)

1. **La receta no estaba versionada** para la valla: el árbol de la instalación la tenía en
   `CerebroNico-IDE-v2.0.0\app\scripts\`, no en `scripts/empaquetar.mjs` del repo.
2. **`manifiesto.mjs` importaba `debeViajar` y la receta solo exportaba `decideViaje`.** El manifiesto
   **no arrancaba**: `SyntaxError: The requested module './empaquetar.mjs' does not provide an export
   named 'debeViajar'`. Nadie lo vio porque la suite que lo usa estaba en las 22 bloqueadas.
3. **`debeViajar` no existía** → las dos comprobaciones de corte (rechaza basura / acepta obra) no podían
   ni ejecutarse.
4. **La lista global no cubría lo que decía cubrir**: `.patch-` estaba como **sufijo**, y el archivo real
   es `ApiKeyModal.tsx.patch-zai.txt`, que **termina en `.txt`**. Nunca casó.

**Cura medida** (todo por comportamiento, importando la receta real):

| Regla | Antes | Ahora |
|---|---|---|
| `.patch-*` | sufijo que nunca casa | `PATCH_RE` sobre el nombre completo → **corta** |
| `.env` | **viajaba al ZIP firmado** | `esArchivoDeEntorno` → **corta**, y `.env.example` sigue viajando |
| `dist/` por nombre suelto | comía `vendor/…/dist` (el bug que mató el SDK en v1.57.14) | `DIRS_BUILD`: solo build **del proyecto**; en `vendor/`, `extensions/`, `skills/` **viaja** |
| API pública | `decideViaje` (y `manifiesto` pidiendo `debeViajar`) | **las dos**, una booleana y una con motivo |

→ `empaquetadoReceta` **7/7** · `empaquetadoSinBasura` **4/4** · `manifiesto.mjs` corre y firma **2.159** archivos.

> La valla de `empaquetadoReceta` era **textual** (`.includes(`): se puso roja cuando la receta pasó a
> `endsWith`, con el corte funcionando. Se volvió conductual — se importa `decideViaje` y se le pasan
> rutas de subcarpeta. Es la misma lección que la v2.1.2 ya tenía escrita en su diario.

### Grupo C — la ruta de espejos (1 fallo: `rutasEspejosDerivadas`)

`la ruta derivada coincide con la del servidor`. El test armaba la ruta esperada con `path.join`, que usa
**el separador del SO que corre la suite**: en Linux daba `C:\Cerebronico/.cerebronico/espejos` y la
fuente devuelve `C:\Cerebronico\.cerebronico\espejos`. **7/7 en Windows, 6/7 en Linux** — la valla medía
el sistema de pruebas. **Cura**: se compara la ruta normalizada, no el carácter separador.

Y en `rutasSistema` (Causa B′, dos rojas):
- el test exigía el literal `~/.cerebronico/espejos/`, que es **justo lo que la v2.1.2 dejó de decir**;
  el test y la fuente del MISMO 7z no pasaban entre sí. Ahora exige la ruta derivada, que salga de la
  raíz de datos y que **no** vuelva al tilde.
- techo del mapa: **3.000 → 3.400**, decisión declarada. Medido: 3.058 chars; nombrar las dos raíces
  cuesta 67 y el déficit era 58. Con 9 de margen no hay rasurado sin borrar información útil.

→ `rutasSistema` **139/0** · `rutasEspejosDerivadas` **7/7**.

### Grupo D — la vectorización que se comía el turno (6 fallos: `hindsight`)

Causa única, medida en el detalle del rojo: `memory_vectorizar:8191ms` contra la ventana de 8 s del
cliente. Encadenado:

1. `memory_vectorizar` **sin argumentos** vectorizaba el espejo **entero** (`limite=None`), con
   `_embed_disponible()` pagando `/api/show` con **15 s** de ventana.
2. La respuesta se perdía (**AbortError**), y con ella la de la petición siguiente → `recall` devolvía
   `null` → *«recall encuentra el aprendizaje CON acentos»* en rojo.
3. La sonda de las 20 herramientas marcaba `sinRespuesta: ["memory_vectorizar"]` y *«una herramienta sin
   argumentos se queja en vez de actuar»* caía por el mismo motivo.
4. **`BM25 ordena por relevancia`** era un falso rojo distinto: el detalle mostraba el ganador
   **correcto** (`…comas de más en el parser…`); lo que fallaba era `metodo === "bm25-espejo"`, o sea la
   valla exigía que **Ollama estuviera apagado**. Con el embedder vivo el método es `bm25+coseno`.

**Cura**:
- `memory_vectorizar` procesa **un lote acotado** (`CN_VECTORIZAR_LOTE`, 8) y **corta por tiempo**
  (`CN_VECTORIZAR_SEGUNDOS`, 3 s). Lo que no entra vuelve como `pendientes` — declarado, no silenciado.
- la sonda del embedder usa como máximo **un tercio** del presupuesto; si no contesta dice
  `embedder_vivo: null` (**no comprobado**), nunca `false` mentiroso.
- la valla de BM25 exige **el orden** y que el método declarado sea uno de los honestos; se agregó
  *«el método de búsqueda viaja en la respuesta»*.

→ `hindsightHibrido` **96/12**: los 12 que quedan son el `dist/` del SDK vendorizado, que **nunca viajó
en ningún ZIP** (bloqueada por entorno, igual que en la v2.1.2: se destraba con `npm run vendor:sdk`).

### Grupo E — vallas de reloj (2 fallos: `grafoProyecto` 217 ms, `motorContexto` 8.264 ms)

Ninguna de las dos medía su algoritmo.

- `grafoProyecto` ya tenía calentamiento + mejor de 3 (v1.70.7) y **aun así** daba 217 ms en Windows
  contra un techo de 200, con 6 ms en Linux. La diferencia no es el grafo: es coste por syscall +
  antivirus. **Techo 200 → 500 ms** (`CN_VALLA_GRAFO_MS`), documentado con las dos medidas. Un defecto
  cuadrático de verdad tarda segundos.
- `motorContexto` medía **una pasada en frío**: pagaba JIT, caché de disco y antivirus. Se le puso la
  misma regla que al grafo (calentar + mejor de 3) y **el techo NO se tocó**: sigue en 8 s, y ahora el
  mensaje imprime las tres muestras (`139 ms; muestras 167/144/139`) para que un rojo sea diagnosticable.

### Grupo F — los dos creadores que no levantan (2 fallos: `entregaFuncional`, `rutaTrabajo`)

`ECONNREFUSED` pelado. No se pudo reproducir acá (los dos pasan: **27/0** y **51/0**), y **no se declara
curado**: lo que se arregló es la **ceguera**. El `stderr` del hijo ahora se drena (drenarlo además evita
que el pipe se llene y bloquee al hijo), se guarda y viaja en el mensaje del rojo, y la espera subió de
8 s a 15 s. Si vuelve a fallar, el rojo dirá **por qué** en vez de `ECONNREFUSED`.

### Grupo G — `skillsPropias` (2 fallos)

En este árbol: **24/0** y `generar-skills-cn.mjs --verificar` → `100 en el contrato · 0 nuevas · 0
actualizadas · **100 ya coincidían**`. En la instalación daba 99/100 con
`entrega-partes-y-manifiesto` derivada: es estado de esa máquina, no del árbol. Se destraba con
`node scripts/generar-skills-cn.mjs` (sin `--verificar`) y volver a validar.

### Grupo H — `arranqueVentanas` (1 fallo)

*«Ollama conserva su ventana con `cmd /k`»*. En este árbol el `.bat` la conserva
(`iniciar_todo_windows.bat:140`), y la suite da **25/0**. Ese rojo describe el `.bat` de la instalación,
no el del paquete: el híbrido entrega el bueno.

### Grupo A-bis — el presupuesto congelado (7 suites, Causa A de la v2.1.2)

No estaba en la lista de 19, pero el árbol lo traía: `presupuesto_lineas = 12185` contra `server.ts` en
**12.200**. Se refrescó el snapshot **con la herramienta de la casa** (`node scripts/superficie.mjs`),
no a mano: `12185 → 12200`, techo absoluto **intacto** en 13.700, y **191 rutas antes / 191 después**
(verificado por diferencia simétrica: 0 perdidas, 0 nuevas). Subir el techo habría destruido la
protección; refrescar el presupuesto al valor medido la mantiene apretada.

---

## 2. Lo que este entorno NO puede firmar

- Las suites con dependencias (`express`, `react`, `vite`, `electron`, `@google/genai`, `jszip`,
  `pdfjs`, `prismjs`, `lucide`, `tailwind`): sin `node_modules` no corren. Entre ellas
  `espejosServidorCableado`.
- El `dist/` del SDK vendorizado (`hindsight-agent-sdk`): nunca viajó en ningún ZIP; se destraba con
  `npm run vendor:sdk` + `tsc -p vendor/hindsight-agent-sdk`.
- El render visual, el audio de las voces y los `.bat` en Windows real.
- **El arranque de los dos creadores en Windows** (grupo F): acá pasan; allá no. Ahora el rojo explica.

## 2-bis. Vulnerabilidades: el titular decía 16, la medición dice 1 de producción

| | Antes | Después |
|---|---|---|
| Producción (`npm audit --omit=dev`) | **1** | **0** |
| Desarrollo (herramienta del `.exe`) | 15 | 15 |
| **Total** | **16** | **15** |

- La de producción era **`qs@6.16.0`** (vía `express@4.22.3`): GHSA-6pq8-jhm2-2vcw, DoS en
  `qs.stringify` cuando un array lleva un `toString` no invocable. `express` pide `~6.16.0` y el
  parche es **6.16.2**: se fijó con `overrides` y queda **una sola copia**.
- Las 15 restantes son **`electron-builder` y su cadena** (`glob`, `minimatch`, `rimraf`, `temp`,
  `jake`, `ejs`, `@electron/asar`, `app-builder-lib`…). Es `devDependency`: **no viaja en el ZIP**
  (`node_modules` se excluye) y no se carga al usar la IDE. Verificado que subir a
  `electron-builder@26.18.0` deja las mismas 15; forzar los majors por `overrides` rompería el
  empaquetado del instalador. Son DoS de tiempo de build, sin entrada de terceros.

## 3. El ritual completo sobre el árbol fusionado

Corrido con 3 trabajadores (`tsx` del sandbox, sin `node_modules` del proyecto), 259 suites:

| | v2.1.2 (informe anterior) | **v2.1.3 (este árbol)** |
|---|---|---|
| Suites | 259 | **259** |
| Verdes | 227 | **236** |
| Rojas | 10 | **1** |
| Bloqueadas por entorno | 22 | **22** |

**La única roja es `skillsPropias` (23/1) y es falsa**: corrida sola da **24/0**. Es la misma falsa
positiva de paralelismo que la v2.1.2 ya tenía documentada — un rojo de ritual paralelo no es veredicto
hasta replicarse en aislamiento. Replicado: **24/0**.

Las 22 bloqueadas son las mismas de siempre: falta `express`, `react`, `vite`, `electron`,
`@google/genai`, `jszip`, `pdfjs`, `prismjs`, `lucide`, `tailwind` (sin `node_modules`) y el `dist/`
del SDK vendorizado.

## 4. Veredicto

**v2.1.3 es un híbrido honesto**: las piezas que no cerraban entre sí ahora cierran **por medición**, y lo
que no se pudo cerrar quedó **con nombre, causa y comando**. De los 19 fallos del veredicto de la
instalación: **15 cerrados con medición**, **2 con diagnóstico en vez de parche** (los creadores en
Windows, que acá pasan) y **2 de estado de máquina** (`skillsPropias` derivada, que en este árbol da
100/100).

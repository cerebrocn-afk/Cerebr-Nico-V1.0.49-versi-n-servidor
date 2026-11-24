# INFORME DE VALIDACIÓN — CerebroNico IDE v2.1.1 → v2.1.2

**Fecha**: 2026-11-02 · **Juez externo**: sandbox Linux (Node 22.23.2), sin `node_modules` del proyecto
**Origen**: árbol de la v2.1.1 del sandbox + el cruce de 7 archivos de la instalación Windows (`CN-cruce-de-datos.zip`, 8 entradas, sha256 `1e204574e8727a9e…`)
**Bump**: por la semilla única `VERSION_SEMVER` (`src/constants.ts:242`), nunca espejo por espejo

Este informe no repite la v2.1.1: lo del embedder y la paleta vive ahí. Acá se juzga **lo que cambió
en el relevo**, y cada afirmación dice quién la midió.

---

## 1. La receta de empaquetado ya está en el repositorio

Hasta la v2.1.1 el `empaquetar.mjs` que producía el ZIP vivía en `Downloads\…\app\scripts\`: **el
comportamiento del paquete no estaba en el árbol que se entrega**. Ese es el origen de que la lista
de exclusiones se desacoplara sin que nadie lo viera.

`scripts/empaquetar.mjs` está versionado, con exclusiones **globales** (`BASURA_GLOBAL`,
`SUFIJOS_EXCLUIDOS`), y `tests/empaquetadoReceta.test.ts` lo corre **contra el script real**: **7/7**.

### El hallazgo del relevo: dos listas, el mismo conteo, conjuntos distintos

`scripts/manifiesto.mjs` y `scripts/empaquetar.mjs` contaron **2164 archivos cada uno y no eran el
mismo conjunto**: el manifiesto firmaba `scripts/verificar-artefactos.mjs.bak` y
`server/routers/telemetria.ts.bak` que el empaquetado retiraba, y el empaquetado llevaba
`scripts/_retirar.mjs` que el manifiesto no firmaba.

Un conteo idéntico tapando dos conjuntos distintos es **peor** que un conteo distinto: pasa la valla
de cantidad y miente en el contenido. La coherencia ahora se mide por **diferencia simétrica**
(`firmadas-que-no-viajan` y `viajan-sin-firmar`), nunca por tamaño.

**Cura aplicada**: una sola receta dueña del conjunto. `manifiesto.mjs` importa `debeViajar` de
`empaquetar.mjs` y conserva únicamente las dos reglas que la receta no puede conocer: no firmarse a
sí misma, y las carpetas que crea la plataforma donde se trabaja.

| Medida sobre el paquete final | Valor |
|---|---|
| Entradas del ZIP | **2166** — el conteo exacto y su sha256 van en `MANIFIESTO-PARTES.json` |
| Ficheros firmados | uno menos que el ZIP |
| Firmadas que no viajan | **0** |
| Viajan sin firmar | **1** — la propia firma, que no puede hashearse a sí misma |

## 2. Qué sigue viajando y no debería (medido dentro del ZIP, no en el árbol)

La v2.1.1 decía «exclusiones ampliadas y aplicadas». Con la receta auténtica ya versionada, el
`unzip -Z1` del paquete firmado muestra **5 fugas**:

| Archivo que viaja | Por qué escapa |
|---|---|
| `scripts/_retirar.mjs` | `BASURA_GLOBAL` no tiene `^_retirar` |
| `src/engine/rutasSistema.ts.bak2-20261101-181456` | `\.bak-/` no casa `.bak2-` — el dígito se interpone |
| `src/engine/rutasSistema.ts.bak3-20261101-181532` | idem |
| `src/engine/rutasSistema.ts.bak4-20261101-181636` | idem |
| `vendor/hindsight-agent-sdk/package.v1166.bak.json` | `\.bak$/` no casa `.bak.json` — no termina en `.bak` |

**La regla que falta es de patrón, no de nombres**: `.bak` va seguido de un dígito o de una
extensión, casi nunca de `-` directo. Y la lección de proceso pesa más que la fuga: medir «0 fugas»
con los mismos 13 patrones que definen la exclusión es una **valla circular**. La valla tiene que
nombrar los archivos históricos reales, no la clase abstracta.

Efecto secundario declarado de unificar la receta: el manifiesto ahora **firma** esa pelusa. Firmar
basura es coherente; limpiarla es trabajo de `BASURA_GLOBAL`.

Se agregó además `^parte\d+\.bin$` como recomendación (no aplicada): el guion de transporte escribe
sus partes **dentro del árbol versionado**, así que un flag mal pasado las mete en el próximo ZIP.

## 3. Ritual completo: 259 suites

Nunca se había corrido entero en ninguna de las dos máquinas: `tsc --noEmit` pasa de ~115 s y el
puente `:5000` corta a los 60 s. Se corrió con `tsx` de un directorio aparte, 4 trabajadores, sin
los `node_modules` del proyecto.

**Sobre este árbol v2.1.2: 227 OK · 8 rojas reales · 2 falsas positivas · 22 bloqueadas por entorno.**

Las 10 que el runner marcó rojas no son 10 defectos. Clasificadas, una por una:

| Suite | Causa | Clasificación |
|---|---|---|
| `androidProyecto` | `12200 / 12185` | **roja real · causa A** |
| `bajoConsumo` | «el trinquete aguanta: server.ts 12199 ≤ presupuesto 12185» | **roja real · causa A** |
| `rutasSistema` | espejos con ruta exacta + «el cable no rompe el techo» | **roja real · causas A y B** |
| `superficieRutas` | «MARGEN 12200/13700 … VEREDICTO: HAY ROTURAS» | **roja real · causa A** |
| `techoContexto` | «trinquete: server.ts NO creció más que su presupuesto :: 12199» | **roja real · causa A** |
| `v1661_buclesYReloj` | «el monolito respeta el presupuesto del contrato — 12199/12185» | **roja real · causa A** |
| `vallasVivas` | «server.ts respeta el trinquete de líneas» | **roja real · causa A** |
| `rutasEspejosDerivadas` | «falta la de unix» (5/7) | **roja real · causa B** |
| `skillsPropias` | 23/1 en paralelo, **24/0 corrida sola** | **falsa positiva del runner** |
| `validar-estres-bucle` | «tsx no está instalado» | **bloqueada por entorno** |

**Ocho vallas rojas, dos causas raíz, ninguna de ellas tocando comportamiento del IDE.**

### Causa A — el presupuesto congelado (tiñe 7 suites)

`contrato-rutas.json` tiene `presupuesto_lineas = 12185` y `techo_absoluto_lineas = 13700`. El
trinquete lee el **primero**. `server.ts` quedó en **12.199/12.200 líneas** tras el cableado del
punto 3 (import + despacho), o sea **14 líneas** por encima de un número congelado antes de ese
cableado y **1.500 por debajo del techo real**.

Es la clase de roja que no se cura rasurando texto: se cura refrescando el snapshot, y eso lo decide
quien sumó las líneas. **No lo toqué.** Ojo con el diagnóstico inverso: subir `techo_absoluto_lineas`
acá sería destruir una protección que todavía trabaja.

### Causa B — 2991 chars contra un techo de 3000 (tiñe 2 suites)

`CHARS_MAPA_RUTAS` mide **2991** y el techo es un **literal en el test**
(`tests/rutasSistema.test.ts:135`, `< 3000`): margen de **9 caracteres**. Nombrar las dos raíces de
espejos cuando el SO está sin determinar cuesta **~58 chars** (medido por la sesión de la
instalación), así que `rutasSistema.ts:192` fuerza la raíz de Windows y
`tests/rutasEspejosDerivadas.test.ts:93` lo denuncia. Con 9 de margen no hay rasurado posible: o sube
el techo deliberadamente, o se retira la exigencia de las dos raíces.

### Las 22 bloqueadas

Necesitan `react`, `express`, `vite`, `electron`, `@google/genai`, `jszip`, `pdfjs`, `prismjs`,
`lucide`, `tailwind`. Entre ellas `espejosServidorCableado` (la del punto 3, **33/33 verde en la
instalación**) y `hindsightHibrido`.

`hindsightHibrido` merece una línea porque parece roja y no lo es: falla `ERR_MODULE_NOT_FOUND` y
«el SDK vendorizado trae `dist/` precompilado». `vendor/hindsight-agent-sdk/package.json` declara
`main = dist/index.js`, y `dist/` **nunca viajó en ningún ZIP** — verificado en v1.57.0, v1.84.3 y
v1.84.4: cero entradas de `dist`. La receta hace bien en excluirlo; esa valla solo puede dar verde
después de `npm run vendor:sdk`.

## 4. Cambios de esta pasada (declarados)

**Recibidos de la instalación** (7 archivos, normalizados CRLF→LF al entrar; verificados idénticos
byte a byte contra el adjunto tras quitar `\r`): `server.ts` (punto 3), `src/engine/rutasSistema.ts`
(punto 2), `scripts/empaquetar.mjs` (punto 1), `tests/empaquetadoReceta.test.ts`,
`tests/espejosServidorCableado.test.ts`, `tests/rutasEspejosDerivadas.test.ts`,
`RUTAS-DEL-SISTEMA.md`.

**Hechos acá**

1. **Bump a 2.1.2 por la semilla.** `src/constants.ts` + `package.json` + `package-lock.json` +
   `index.html`. El lock tiene **5** ocurrencias de `2.1.1` y solo **2** son del proyecto: se tocaron
   esas dos y quedaron intactas `clsx`, `p-cancelable` y `require-directory`, que también valen
   2.1.1. Un reemplazo a ciegas hubiera mentido sobre dependencias ajenas.
2. **`scripts/manifiesto.mjs` delegado a la receta** (§1). Es el cambio de esta versión con más
   alcance: saca de servicio la segunda lista de exclusiones.
3. **Tres suites nuevas registradas en `scripts/validar.mjs`**: `empaquetadoReceta`,
   `rutasEspejosDerivadas`, `espejosServidorCableado`. Llegaron en el cruce **sin registrar**, y por
   eso `censoSuites` (0/1 → **1/1**) y `resiliencia` (34/1 → **35/0**) estaban rojas. Sin registro, la
   puerta las ejecuta igual pero el censo no las conoce: vallas que existen y nadie cuenta.
4. **`CHANGELOG.md` fusionado a mano**: una sola sección v2.1.2 con el punto 1, 2 y 3 de la
   instalación y el lado del sandbox, cada afirmación con su dueño. La sección v2.1.1 se conservó:
   2.1.1 se empaquetó y viajó, y borrarla hubiera sido falsificar el historial.
5. **`GUIA-EMPAQUETADO-Y-PARTES.md` corregida en dos afirmaciones falsas que tenía**: decía
   «cualquier nombre que contenga `.bak-`» (el patrón real es `\.bak-/` y `\.bak$/`, y no casan
   `.bak2-` ni `.bak.json`) y afirmaba que `_retirar.mjs` estaba excluido (viaja). Las desmintió el
   `unzip -Z1` del paquete firmado. Ahora tiene una tabla explícita de «lo que la receta deja pasar».

## 5. Cosas que esta pasada dejó vistas

- **El runner paralelo produce falsas positivas.** `skillsPropias` da 23/1 con 4 trabajadores y 24/0
  sola. Un rojo de ritual paralelo no es un veredicto hasta replicarse en aislamiento. Esto aplica a
  cualquiera que lea estos números, incluida esta casa.
- **`EXPORT-CONTEXTO.md` se reescribe al correr el ritual** (`ranuraUnificada.test.ts` vía
  `scripts/exportar-contexto.mjs`) y viaja en el ZIP. Pasó las dos veces que corrí el ritual: el hash
  pasó de `8177ed2268728821` a `cf5507728d62a92c` con separadores de Linux. Se restauró desde el ZIP
  firmado antes de reempaquetar. Es la segunda vez que se mide: la trampa no es hipotética.
- **La herramienta de transporte escribe dentro del árbol versionado.** `unir-partes.mjs --partir`
  sin `--salir` suelta `parte0X.bin` y `MANIFIESTO-PARTES.json` en la raíz del proyecto, y `.bin` no
  está en `EXTENSIONES_EXCLUIDAS`. Recuperado moviendo, no borrando; la identidad del manifiesto
  volvió a cerrar.
- **Diferencia sin explicar con el conteo de la instalación.** Su `--listar` dio **2193** y su paquete
  **2176**: 17 de distancia entre dos medidas del mismo árbol, que no deberían existir. Mi paquete
  contra sus 2193 son 29, y mi árbol solo conserva 27 `MANIFIESTO_SHA256_v*`, así que la explicación
  «manifiestos históricos» no cubre la distancia. Queda la lista plana de rutas para difear en vez de
  adivinar.
- **`server.ts` no estaba en CRLF.** La tabla de la instalación decía 652.088 → 639.688 al normalizar.
  El archivo recibido mide **652.088 con 0 `\r` y 12.199 `\n`**: quitar `\r` de un archivo sin `\r` no
  lo achica 12.400 bytes. Su `639.688` es otro `server.ts`. Para cerrarlo hace falta el `sha256` de su
  copy normalizada; el de la de este árbol es `7ba1eacc1c2346a1db939d7d6a5bd011e4b5e0421f198e28f6fcecba4298091f`.
- **Cuatro listas de exclusión conviven en el repo** y recién dos quedaron unificadas. Siguen sueltas
  `sandboxEntregable.ts` (`EXCLUIR_ENTREGABLE`) y `projectPorter.ts` (`IGNORAR`).
- **La colisión del embedder sigue abierta.** Su `cerebroOrgano.ts` con `precalentar`, su
  `embedderResidencia.test.ts` de 55 aserciones y los 4 `precalentar: false` no venían en el cruce.
  Este árbol corre la versión de 54 aserciones, que está verde. Si llegan, los tres van juntos: con
  dos de tres no compila o falla, y una tercera variante escrita acá sería repetir el error de las
  dos v2.1.1.

## 5-bis. Delta de la fusión `_fusion-v212` (medido después de todo lo de arriba)

Mario pasó 7 archivos (receta reescrita + los tres del embedder + `server.ts`,
`RUTAS-DEL-SISTEMA.md` y dos vallas). Se aplicaron sobre respaldo en `pre-fusion-orig/`, con CRLF
normalizado a LF al entrar.

**Firmas: no había colisión de bytes.** `cerebroOrgano.ts` 49.024 B → `fb38bde5b8dffbacc79eb06c166d2f65026ba1b8eb81f6bc7776d37d88f5a5d2`
y `embedderResidencia.test.ts` 17.721 B → `6e51956f8b8a08aea3f11b3206e29108329e891166cb17a24a8805eb3421f90c`,
los dos declarados por él, son **idénticos** a los de este árbol en LF. Y `server.ts`,
`RUTAS-DEL-SISTEMA.md` y `tests/espejosServidorCableado.test.ts` también.

**El 54 / 55 / 56 era método de conteo.** Estáticas `comprobar(` (descontando la definición): 55 mías,
56 suyas, 58 fusionada. Una de ellas (`el bloque del órgano no revienta`, dentro del `catch`) nunca se
ejecuta. **Vivas: 54 / 55 / 56**, y las tres corren verdes cruzadas — mi archivo de 54 contra su órgano
da `54 correctas, 0 fallos`. Las dos de diferencia son su regla de propiedad
`POR_LOTE_EN_TURNO <= POR_LOTE_POR_DEFECTO` (real, y mejor que mi literal `= 8`) y la guardia del
`catch` (que no es aserción).

**Mutación medida sobre `cerebroOrgano.ts`, que es lo que faltaba.** `opts.precalentar !== false` →
`true`: **51/5** (las cuatro `precalentar: false` suyas sí vigilan la pata apagada). La misma guarda →
`false`, o sea **el precalentamiento borrado**: **55 correctas y 0 fallos** con su archivo y con el
mío. La rama que corre en producción —la cura del v1.99.6 contra los 14 lotes caídos por ventana— no
la probaba nadie. La aserción agregada en el ON la mata: **55/1**.

**Receta nueva, por diferencia simétrica sobre el mismo árbol: 5 curas y 0 fugas.** Curó
`scripts/_retirar.mjs`, los tres `rutasSistema.ts.bakN-…` y `package.v1166.bak.json`. Introdujo tres
que la v2.1.1 no tenía (`verificar-artefactos.mjs.bak`, `telemetria.ts.bak` por el `.bak` seco que su
`RESPALDO_RE` no casaba, y `ApiKeyModal.tsx.patch-zai.txt` porque `.patch-` estaba en `SUFIJOS` con
`endsWith`); corregidas con dos líneas declaradas. Víajan **2161** archivos (eran 2166) y el corte no
se come obra (`backupHorario.ts`, `patch-notas.md`, `keys.ts` siguen).

**Dos archivos del paquete de fusión no pasaban entre sí.** `tests/empaquetadoReceta.test.ts` (espejo
textual) contra su propia receta daba 6/7 **por forma**; quedó conductual y da **5/5** con 19 rutas
basura y 9 legítimas. `tests/rutasEspejosDerivadas.test.ts` (idéntico al mío) contra su propio
`rutasSistema.ts` está **6/7**: el test espera `C:\Cerebronico/.cerebronico/espejos` y el código
devuelve `C:\Cerebronico\.cerebronico\espejos\`.

**Ritual después de la fusión: 259 suites · 227 OK · 10 en rojo · 22 bloqueadas.** Mismos números
globales que antes del relevo: **ninguna suite nueva cayó**, y las 2 rojas extra viven adentro de
`rutasSistema`, que ya estaba roja. Clasificación completa:

| suite(s) | clase | causa |
|---|---|---|
| `androidProyecto`, `bajoConsumo`, `superficieRutas`, `techoContexto`, `v1661_buclesYReloj`, `vallasVivas` (+1 roja de `rutasSistema`) | **roja real** | Causa A: la valla lee `presupuesto_lineas` 12185 y `server.ts` está en 12.199/12.200. Cura = refrescar el snapshot del punto 3, no subir `techo_absoluto_lineas` (13700) |
| `rutasSistema` (2 rojas) + `rutasEspejosDerivadas` (1) | **roja real, nueva, espera fallo** | Causa B′: el mapa pasó 2991 → **3058** (nombrar las dos raíces cuesta 67, déficit 58) y `RUTA_ESPEJOS_PERSONALIZADOS` ya no es la forma canónica que exige `rutasSistema.test.ts:134` |
| `skillsPropias` | **falsa roja de paralelismo** | 23/1 en corrida con 4 trabajadores, **24/0 sola** (medido otra vez en esta pasada) |
| `scripts/validar-estres-bucle.mjs` | **bloqueada por entorno** | pide el `tsx` del `node_modules` del proyecto; con `PATH` apuntando al tsx del sandbox sigue respondiendo «tsx no está instalado» |

**Un número que queda medido, no opinado:** el `server.ts` del 7z mide **652.088 B con `0` `\r`** y es
idéntico byte a byte al de este árbol. No existe normalización EOL que lo baje a 639.688 (Δ12.400).

## 6. Veredicto

**v2.1.2 no es una versión verde.** Es una versión **honesta**: 227 suites verdes sobre 259, ocho
rojas reales que son dos decisiones pendientes —ninguna de ellas de comportamiento del IDE—, y las
dos decisiones tienen dueño y números.

Lo que sí cerró: la receta de empaquetado entró al repositorio y quedó vigilada por ejecución; el
manifiesto dejó de ser una segunda verdad; las tres vallas nuevas están registradas; el bump salió de
la semilla; y dos afirmaciones falsas que esta casa tenía escritas en su propia guía de empaquetado
fueron corregidas por medición y no por lectura.

Lo que **este entorno no puede firmar**: las 22 suites con dependencias, el render visual, el audio de
las voces y el `.bat` de Windows. Eso es de la máquina local. Y ninguna de las dos decisiones
pendientes (refrescar `presupuesto_lineas`, techo del mapa contra las dos raíces) la puede tomar
quien no escribió el cableado que las provocó.

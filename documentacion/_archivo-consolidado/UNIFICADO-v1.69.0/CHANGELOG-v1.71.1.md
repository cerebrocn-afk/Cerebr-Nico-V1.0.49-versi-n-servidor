## v1.71.1 · 2026-10-25 · EL RECORRIDO DEL PROYECTO DEJA DE SER UN CUELLO: 16,2 s → 7,2 s (y 3,6 s por turno)

Dos rojos, los dos reales, los dos medidos antes de tocar nada.

---

# 1 · MOTOR DE CONTEXTO: `construcción del modelo contra el repo completa en menos de 8 s (16181 ms)`

El veredicto de `npm run validating` en el equipo de Mario (Windows 10, 8 GB,
proyecto bajo `C:\Users\...\Downloads\`) decía:

```
motorContexto
  ═══ MOTOR DE CONTEXTO: 43 correctas · 1 fallidas ═══
  FALLOS:
  · construcción del modelo contra el repo completa en menos de 8 s (16181 ms)
```

**Las otras 42 comprobaciones del motor estaban en verde**: el retrato era
correcto (>200 archivos, stack real, entradas, tests, puertos). Lo que fallaba
era el reloj. Y la historia del reloj ya tenía dos episodios: en v1.53.0 se subió
el tope de 5 s a 8 s «porque el repo creció», y en v1.56.8 se sacó `skills/` del
recorrido por rendimiento medido. Subir el tope otra vez habría sido pintar de
verde un problema que sigue ahí.

## 1.1 · La causa, medida y no adivinada

Instrumentando `statSync` / `readFileSync` / `readdirSync` durante un
`contextoProyecto(raíz)` del repo real:

| operación | llamadas | qué se paga
|---|---|---
| `readdirSync` (carpetas) | 81 | una por carpeta: inevitable
| `statSync` (archivos) | **911** | tamaño + mtime para la huella
| `readFileSync` (contenido) | **655** | 7,5 MB abiertos uno a uno
| **total** | **1 647** |

`16 181 ms / 1 647 ≈ 9,8 ms por operación`. Ahí está todo: el coste no son los
bytes (7,5 MB es nada), son las **APERTURAS**. Un filtro de archivos de Windows —
Defender y compañía— cobra cada apertura de cada archivo, y en un árbol de
900 archivos con disco lento eso son quince segundos. En un SSD local las mismas
llamadas vuelan: 220 ms. **Mismo código, mismo repo, 73× de diferencia: la valla
no medía la lógica, medía la latencia del sistema de archivos.**

Y había un segundo problema, peor porque afectaba a cada turno de chat:
`recorrer()` calculaba la huella **y leía todo el contenido antes de mirar la
cache**. O sea que `notaDeContexto(PROJECT_ROOT)` —que `server.ts` llama al
preparar cada turno— volvía a abrir los 655 archivos aunque el proyecto estuviera
intacto desde el turno anterior. El cache respondía, pero tarde y carísimo.

Tercer desperdicio, este de CPU: el mismo contenido se rastreaba con las mismas
cuatro expresiones regulares **tres veces** (una en `paquetesFaltantes`, otra en
`declaradosSinInstalar` y otra por archivo dentro de `construirGrafo`) y las
líneas se contaban con `match(/\n/g)`, que monta un array de 151 728 entradas
solo para leer su `.length`.

## 1.2 · Las cuatro correcciones

1. **Ni un `statSync` a lo que el modelo no lee.** De un `.md`, un `.png`, un
   `.pyd` o un lockfile el retrato solo necesita **la ruta**, y la ruta ya viene
   gratis en el listado de la carpeta. −256 llamadas.
2. **La huella se calcula sin abrir contenido, y con la huella intacta no se abre
   nada.** El cache corta antes de leer. Un turno de chat sobre un proyecto sin
   cambios ya no toca ni un archivo.
3. **Lo que sí hay que medir o abrir se abre EN PARALELO** con un grupo de
   `worker_threads` que reparte tareas por un cursor atómico y deja el contenido
   en `SharedArrayBuffer`. La latencia por operación no se puede quitar; sí se
   puede superponer.
4. **Un solo barrido de contenido** para el retrato y para el grafo
   (`paquetesExternosPorArchivo` + `auditoriaPaquetes` en
   `dependenciasProyecto`; `construirGrafo` acepta el mapa ya calculado). Las
   funciones públicas de siempre siguen ahí y sin cambios de contrato.

**El grupo no entra a ciegas.** Antes de repartir se toman muestras en el hilo
principal (24 medidas, 4 aperturas) y los hilos sólo se usan si la operación
unitaria pasa de ~1,2 ms. Medido: sin esa calibración, en un SSD local el retrato
subía de 220 ms a 345 ms — habría cambiado un rojo por una regresión silenciosa
en las máquinas rápidas. Con ella, en Linux decide solo y sigue en serie.

Y el grupo es **una optimización, nunca un requisito**: si no se pueden crear
hilos, si uno revienta o si una tarea se pasa de 30 s, se lee en el hilo principal
y el retrato sale igual. `CEREBRONICO_LECTOR_SECUENCIAL=1` fuerza el camino
serie; `CEREBRONICO_LECTOR_GRUPO=1` fuerza los hilos (para probarlos).

## 1.3 · Lo que daña: números

Simulación del perfil del equipo de Mario: misma máquina, latencia inyectada de
**10 ms por operación** en `statSync` y `readFileSync` (bloqueante, no quemando
CPU), y **sólo 2 núcleos** — el portátil de Mario tiene más.

| camino | construcción (frío) | turno siguiente |
|---|---|---|
| v1.71.0 | **16 273 ms** | 16 003 ms |
| v1.71.1 forzado en serie | 13 550 ms | 13 311 ms |
| **v1.71.1 calibrado** | **7 209 ms** | **3 588 ms** |
| v1.71.1 en SSD local (sin latencia) | 212 ms | ~2 ms (cache) |

La réplica del v1.71.0 dio 16 273 ms contra los 16 181 ms reales reportados: el
modelo de latencia describe bien el equipo. Con 2 núcleos se gana 2,3×; los hilos
escalan con núcleos, así que en un equipo de 4-8 hilos de verdad la construcción
queda por debajo de los 8 s con margen. El dato que más importa para el uso
diario es el de la segunda columna: **lo que cuesta cada turno de chat bajó de
16 s a 3,6 s**, y sobre proyecto intacto no abre ningún archivo.

## 1.4 · La prueba que lo vigila

Nueva sección 6 en `tests/motorContexto.test.ts` (44 → 52 comprobaciones):

- los **dos caminos** (serie e hilos) dan **retrato idéntico y huella idéntica**
  — comparados campo a campo, incluido el grafo completo;
- el camino de hilos **se usó de verdad** (contadores de `estadisticasDeLectura()`;
  si el entorno no permite hilos, lo dice en vez de colarse);
- **cache intacto = CERO aperturas de contenido** (antes reabría los 60 archivos);
- editar un archivo del árbol sigue invalidando la huella y recalculando.

Equivalencia verificada además contra la implementación v1.71.0 sobre este repo
(912 archivos): mismo `archivosTotales`, `lineasTotales`, `porExtension`, `stack`,
`servicios`, `puertos`, `tests`, `dependencias`, nodos y aristas del grafo. La
**huella** cambia de valor a propósito: los archivos que no se leen entran ahora
por ruta, no por tamaño+mtime. Se comprueba que no se pierde ninguna
invalidación que afecte al retrato (alta/baja/renombrado de archivos, cambio de
`package.json`, aparición de `node_modules`, edición de código).

**Honestidad sobre lo no verificado:** no hay Windows en este entorno. La ganancia
en el equipo real es la que medirá `npm run validar` ahí; lo que sí está
verificado aquí es que el camino de hilos existe, es determinista, da el mismo
retrato y se apaga solo si el entorno lo impide.

---

# 2 · PUENTE PC: `POST /tools/call` respondía 404 y las 6 herramientas eran inalcanzables

El reporte de sistema de la sesión (`cerebronico-ide-sesion-1792903069364.json`)
cerraba todos los rojos anteriores y dejaba uno vivo, con causa raíz exacta:

- `GET /tools` anunciaba 6 herramientas (`fs_read`, `fs_write`, `fs_list`,
  `fs_delete`, `fs_mkdir`, `exec`);
- `POST /tools/call` devolvía **404 «Ruta no encontrada»**;
- `server.ts` (ejecutor de packs remotos) llama exactamente a
  `fetch(`${rp.url}/tools/call}`, {name, arguments})`.

O sea: el puente se registra como PACK MCP, se anuncia, y **no tiene la puerta por
la que el motor llama**. El modelo leía «El pack remoto puente-mcp respondió
HTTP 404» y las herramientas del PC —leer, escribir, listar, ejecutar— eran
puro adorno.

La causa de fondo no es la ruta que falta: es que **la lista anunciada y la tabla
despachada eran dos cosas distintas escritas a mano**, y la de llamar no existía.
Es la misma clase de defecto que la casa ya tiene fijada como trampa en
`packDocumentos` («spec declarada != caso despachado»).

**El arreglo:** una única tabla `HERRAMIENTAS` (nombre → descripción, entradas y
operación). `GET /tools` se **genera** de ella y `POST /tools/call` **resuelve**
por ella. Cada operación vive en un `_op_*` que devuelve `(código, objeto)`, y las
rutas históricas `/api/fs/*` y `/api/exec` **delegan en ese mismo método** en vez
de conservar su copia. Por eso `subprocess.run` y `os.remove` aparecen una sola
vez en el archivo.

**Seguridad intacta:** el despacho está detrás de `_check_auth()` (origen +
token), cada `fs_*` pasa por `_resolver` (la cárcel de raíces) y `exec` sigue
validando contra la lista blanca y auditando permiso y rechazo. Herramienta
desconocida → 404 con las disponibles; `arguments` que no sea objeto → 400.

**Verificado en vivo** contra el puente Python real arrancado en 127.0.0.1:
15/15 — las 6 herramientas por `/tools/call`, `rm` rechazado 403, `../../etc/passwd`
rechazado 403, herramienta ignota 404, y las rutas antiguas `/api/fs/*` y
`/api/exec` respondiendo byte a byte lo mismo de antes.

**No hecho (necesita tu decisión):** el `agent_bridge_5000.py` que está corriendo
ahora mismo en tu PC (PID 2288) sigue siendo el viejo. Aplicar este arreglo al
proceso vivo exige matarlo y relanzarlo, y eso es acción destructiva sobre algo
que estás usando. Con relanzar el puente (`iniciar_todo_windows.bat` o el
`python.exe runtime\python-embed` que lo levanta) queda activo.

**Nueva suite** `tests/puenteToolsCall.test.ts` (42 comprobaciones, declarada en
el catálogo de `validar`) que fija el contrato: la tabla existe, cada herramienta
declarada apunta a una operación implementada, `/tools` se genera de la tabla,
`/tools/call` está autenticado y despacha, las puertas antiguas delegan, las
primitivas peligrosas no están duplicadas, y `server.ts` manda las claves que el
puente lee.

---

## Resumen de archivos tocados

| archivo | qué cambia
|---|---
| `src/engine/motorContexto.ts` | huella sin abrir contenido, lector con grupo de hilos calibrado, un solo paso de contenido, `estadisticasDeLectura()`
| `src/engine/dependenciasProyecto.ts` | `paquetesExternosPorArchivo` + `auditoriaPaquetes`; `extraerPaquetesExternos`/`paquetesFaltantes`/`declaradosSinInstalar` delegan (contrato intacto)
| `src/engine/grafoProyecto.ts` | `construirGrafo` acepta el mapa de paquetes ya barrido
| `agent_bridge_5000.py` | tabla `HERRAMIENTAS`, `POST /tools/call`, operaciones `_op_*` compartidas con `/api/*`
| `tests/motorContexto.test.ts` | sección 6 · los dos caminos y la valla de aperturas (44 → 52)
| `tests/puenteToolsCall.test.ts` | nueva · contrato de las herramientas del puente (42)
| `scripts/validar.mjs` | ficha de la suite nueva en el catálogo
| `package.json`, `src/constants.ts`, `index.html` | versión 1.71.1 sincronizada

# "Servidor local caído" — diagnosis medida y receta de recuperación

CerebroNico IDE · 4/11/2026 · base probada: v2.3.1 (última entrega: v2.3.0)

Todo lo de abajo está medido en dos lugares: tu log de arranque (`NUEVO LOG V2.json`,
349 líneas) y el código de la base. Donde hay inferencia, está dicho como inferencia.

---

## 1. Qué es el "servidor caído": no es un server que se cae, es un reanimado que nunca existió

Tres cosas distintas estaban pasando a la vez. El síntoma único ("caído") las tapaba.

### 1a. El golpe final: código 9009 (`"v" no se reconoce`)

Transcripto de tu log:

```
[supervisor] «front» (:3000) no contesta → reanimo, intento 1 de 3.   ← líneas 298 y 321
...
"v" no se reconoce como un comando interno o externo,                  ← línea 336
programa o archivo por lotes ejecutable.
[ERROR] "npm run dev" termino con codigo 9009.                         ← línea 339
```

`9009` en Windows significa **"no existe ese comando"**. Y el nombre que reporta es
`v`, que es lo que deja de ser `vite` cuando una línea con **comillas anidadas**
llega a `cmd /c`.

El mecanismo, en el código:

```ts
// server/routers/supervisorArranque.ts (v2.3.0 y anteriores)
spawn(linea, { shell: true, ... })
```

En Windows Node arma `cmd.exe /d /s /c "<linea>"`. La regla de `/s` de cmd dice que
las comillas exteriores **solo se limpian si la línea no trae comillas adentro**.
Y las líneas que este supervisor reanima siempre traen comillas adentro:

- `interpretar()` agrega `"scripts\hindsight_daemon.py"`;
- `comandoVentana()` envuelve todo el `cmd /k "…"`.

Con comillas anidadas cmd no limpia las exteriores: el nombre del programa pasa a
ser el primer carácter citado. `vite …` → `"v"` → 9009.

**Arreglado en v2.3.1**: el comando se escribe adentro de un shim
(`logs/arranque/reavivar-<id>.cmd`) y el shell recibe **una sola ruta**. Spawn con
`shell: false` + `windowsVerbatimArguments`. Módulo puro:
`src/engine/reavivarServicio.ts`. Valla: `tests/reavivarServicio.test.ts` (54
comprobaciones, verdes).

Efecto de arrastre: el aviso prometía *"El log está en logs/arranque/\<id\>.log"*
mientras `stdio: "ignore"` tiraba la salida a la nada. Ahora el shim redirige su
salida ahí. La promesa pasa a ser verdad, y la próxima vez hay evidencia.

### 1b. El supervisor se reanimaba a sí mismo (y por eso "no podías diagnosticarlo")

Tu log muestra `«front» (:3000) no contesta → reanimo`. **Front :3000 ES la propia
IDE que ejecuta al supervisor.** Reanimarse a sí mismo es un bucle por construcción:
el `npm run dev` nuevo no puede tomar el 3000 que el proceso actual ya tiene, nace
moribundo, y cada 30 s el sondeo lo vuelve a ver "caído".

En esta base `front` está marcado `vigilado: false` (v2.0.2) y la primera pasada del
supervisor **solo mide** sin tocar nada (v2.1.1), con 90 s de gracia de arranque.
Que tu log muestre lo contrario es la señal más limpia de que **el árbol que estás
corriendo no es esta entrega**: es una copia anterior mutada.

### 1c. El chip miente aunque el server esté sano (la trampa de las 6 conexiones)

Este ya estaba documentado con números en `src/engine/presupuestoConn.ts`: Chrome da
**6 conexiones por origen**; el arranque lanzaba **10 requests** simultáneos
(telemetría + modelos + 8 sondes de proveedores) sin `AbortController`. Los probes
de catálogo se comen los sockets, el latido —que el server contesta en ~1 ms— pasa
más de 2800 ms en la cola del navegador, y la cabecera declara "caído" con el server
sano. **Es la misma causa de "no carga los modelos" y "no lanza el mensaje": las tres
cosas son requests contra `127.0.0.1:3000` y las tres se hacen cola detrás de lo
mismo.**

En esta base los 10 sondeos pasan por `fetchCatalogo` (techo de 3 en vuelo, plazo de
8 s) y latido/telemetría por `fetchCritico` (no hace cola). Verificado: los 10
call sites están cableados en `src/App.tsx`.

---

## 2. El cuatriplicado de "Puertos": por qué cada copia dice otra cosa

No era una impresión tuya. Estaban (y en tu árbol siguen) **cuatro superficies**
mostrando el mismo dato con **tres criterios** y **dos valores por defecto mentira**:

| # | Dónde | De dónde sale el dato | El criterio |
|---|-------|----------------------|-------------|
| 1 | Cabecera, chips `:5000 / :11434 / :5100 / :5102` (`Header.tsx:788+`) | `telemetry` (`/api/telemetry/ports`) | `telemetry.portX ? "OK" : "OFF"` — y el `:11434` decía **"LOCAL"** cuando estaba caído: cuarta etiqueta para una sola pregunta |
| 2 | Pestaña **Puertos**, arriba (`LeftSidebar.tsx`) | `ollamaStats` (`/api/ps`, 5 s) | otro condicional propio |
| 3 | Pestaña **Puertos**, más abajo, al scrollear | otra fuente, con otro muestreo | otro condicional |
| 4 | **Hoja de ruta / Servicios** (`PlanificationPanel`) | `/api/arranque/estado` | `vivo: vivos.get(id) !== false` |

Los dos defectos de fondo, que son los que producen "indicativos distintos" y no un
simple rediseño estético:

1. **La semilla de `telemetry` afirmaba sin medir.** `src/App.tsx:2182` arrancaba con
   `port3000: true, port11434: true` y `false` en el resto. O sea: antes de la
   primera lectura la cabecera ya juraba que dos puertos estaban arriba y cuatro
   abajo. Mentiendo en los dos sentidos.

2. **`!== false` pintaba de VIVO lo que nunca se midió.** Sobre un mapa vacío,
   `vivos.get(id)` es `undefined` y `undefined !== false` es `true`. En el **mismo
   JSON de respuesta**, el campo `interruptores` usaba `=== true` y decía lo
   contrario. Un solo endpoint, dos respuestas distintas. Eso es exactamente "una
   arriba y otra abajo con indicativos de error distintos".

**Curado en v2.3.1** con un criterio único y una sola sonda:

- `src/engine/indicadorServicios.ts` (puro) — tres estados y nada más:
  `arriba` / `abajo` / **`sin-medir`**. La regla: *sin medición no hay afirmación*.
  El chip de "sin medir" es `—`, y no se puede pintar ni de verde ni de rojo.
- Los cuatro chips de la cabecera pasan por un solo `chipPuerto(...)`.
- `telemetry` arranca en `medido: false` (y `medido: true` recién con la respuesta).
- `/api/arranque/estado` responde `vivo: …=== true` **más** `medido: vivos.has(id)`.
- `crearSondaCompartida`: N componentes escuchan, **un solo request** se hace
  (single-flight + TTL). Esto es además lo que baja la presión sobre las 6 conexiones
  de Chrome, o sea el punto 1c.
- Valla: `tests/indicadorServicios.test.ts` (27 comprobaciones, verdes), que además
  verifica **el cable**, no solo el módulo: que los cuatro chips usen `chipPuerto`,
  que la semilla no afirme, y que el `!== false` haya desaparecido.

Sobre "en otra versión esa función está incluida en la ventana de hoja de ruta":
correcto, y así debe quedar. Desde v2.2.4 **la única lista con reinicio y
encendido/apagado es `Servicios`, en la pestaña Tareas/Hoja de ruta**. La pestaña
Puertos quedó solo para el motor local (RAM residente de Ollama, embedder,
subagentes). Si en tu copia siguen apareciendo dos listas de puertos en esa pestaña,
esa copia no tiene el cambio.

---

## 3. Los otros dos avisos de tu log (que no eran la causa, pero ensuciaban todo)

```
[O] 5100  Capa de memoria híbrida <- python.exe(4424)      ← línea 26
FALTA sanear: 5100                                          ← línea 28
[AVISO] autonomia puertos fallo; el arranque sigue igual.   ← línea 29
```

Un `python.exe` **de una sesión anterior** seguía dueño del :5100 y el limpiador no
pudo con él. Con el puerto tomado, el supervisor ve ":5100 contesta" o "no contesta"
según en qué momento del ciclo lo mire — otra fuente de contradicción entre paneles.

```
⚠ sin embedder: «snowflake-arctic-embed:33m» no está descargado…  ← línea 148
🧠 cerebro: el cerebro esta vacio [embedder: sin resolver]         ← 30+ veces
```

Falta el modelo de embeddings. **No tumba nada**: el cerebro enruta por palabra
(BM25), que es lo que siempre hizo. Es un aviso, no una caída. Pero se repetía 30
veces y ayuda a leer el log como "todo está roto".

---

## 4. Los 4 errores de tipos de TU árbol (`src/App.tsx:1860` y `:1877`)

```
src/App.tsx(1860,10): error TS2552: Cannot find name 'alternarPantallaCompletaInteligente'.
src/App.tsx(1860,88): error TS7006: Parameter 'r' implicitly has an 'any' type.
src/App.tsx(1877,10): error TS2304: Cannot find name 'minimizarVentana'.
src/App.tsx(1877,35): error TS7006: Parameter 'r' implicitly has an 'any' type.
```

Estos cuatro **no están en esta base** (`tsc` da 0 errores). Son de tu copia mutada:
alguien llamó a dos funciones que no existen en el archivo. La receta es una de dos:

- **Restaurar** `src/App.tsx` desde el zip de v2.3.8 (recomendado: es el archivo más
  grande del front y el más tocado a mano).
- O **definir** las dos funciones si de verdad las querés: `alternarPantallaCompletaInteligente`
  y `minimizarVentana` deben existir en el ámbito de `App.tsx` (probablemente en el
  bloque de efectos de Electron, junto a `window.electronAPI`). Y tipar el parámetro
  `r` de los dos callbacks (`(r: React.MouseEvent) => …` o el tipo real que reciban).

---

## 5. Receta de recuperación, en orden

1. **Confirmá qué árbol estás corriendo.** Si tu log dice `reanimo, intento 1 de 3`
   sobre `front`, no es esta entrega. Compará `package.json` → `version` con `2.3.8`.
2. **Restaurá `src/App.tsx`** desde el zip (los 4 errores de tipos desaparecen).
3. **Matá el `python.exe` huérfano** del :5100 antes de arrancar (o usá
   `parar_servicios.bat`, que ya lo hace).
4. **Descargá el embedder** si querés el cerebro vectorial:
   `ollama pull snowflake-arctic-embed:33m`. Sin él funciona por BM25; con él, mejor.
5. **Arrancá con `iniciar_todo_windows.bat`**, no con `npm run dev` a mano: el `.bat`
   es el que pasa por el shim de reavivado y escribe los logs.
6. **Verificá**: `npm run validar` debe dar `VEREDICTO: TODO CORRECTO`. Si da fallos,
   leé la sección del fallo — cada suite dice qué archivo y qué línea.

---

## 6. Lo que este documento NO dice

- No dice que el server "se caiga": dice que **se reanimaba mal** y que **el chip
  mentía**. Son tres causas distintas con un solo síntoma.
- No cubre el pendrive: eso está en `HEMISFERIOS-y-RAIZ.html` §3.
- Los números de línea (`298`, `321`, `336`, `339`) son de **tu** log, no de esta base.

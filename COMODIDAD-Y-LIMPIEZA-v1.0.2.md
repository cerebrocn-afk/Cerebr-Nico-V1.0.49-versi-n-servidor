# Comodidad, cableado y limpieza — v1.0.2 (2026-11-07)

Segunda pasada sobre el árbol de Mario, después de `CORRECCIONES-PUERTOS-v1.0.1.md`
(los siete puertos). Pedido: «implementa todo lo que veas en mi árbol, son cosas de
comodidad del usuario, con lógica, cableado, manifiestos, y haz limpieza; resume
todo y actualiza la documentación».

## 0. La pregunta que abrió todo: ¿los 7 puertos abren con un solo comando?

**Sí — y la cuenta exacta es 6 en el arranque + 1 a demanda.** Mario lo confirmó
(«claro, el otro es el 3500 que abre a demanda»):

| Puerto | Órgano | Quién lo enciende | ¿Está arriba con un solo `iniciar_todo_windows.bat`? |
|--------|--------|-------------------|------------------------------------------------------|
| :3000 | IDE (interfaz + `/api/*`) | el propio `.bat` (`npm run dev`) | **sí** |
| :5000 | Puente PC (`agent_bridge_5000.py`) | lo engendra `server.ts` al abrir | **sí** |
| :5100 | Memoria híbrida (`hindsight_daemon.py`) | `.bat` (pack) / `.exe` desde v1.0.1 | **sí** |
| :5102 | Creador de sitios (`creador_daemon.py`) | `.bat` / `.exe` | **sí** |
| :5103 | Motor del cerebro (`cerebro_motor.py`) | `.bat` / `.exe` (y el supervisor lo reaviva) | **sí** |
| :11434 | Ollama | el `.bat` si está instalado | **sí** |
| :3500 | Sandbox / preview del proyecto | **lo levanta el preview (Sync) al abrir el proyecto** | a demanda — apagado es el estado correcto |

Lo que **no** cuenta como un solo comando: prender sólo `npm run dev`. Ahí nacen
:3000 y :5000, y los tres packs quedan a merced del supervisor (tardan la gracia de
arranque, ~90 s, y sólo si el reavivado puede ejecutarlos — que es justamente el
bug de raíz que se curó en v1.0.1).

## 1. Comodidad (tres cosas, todas con valla)

### 1.a «Reconectar» ya no puede levantar dos puentes sobre el :5000
En el log de arranque de Mario se ve **un** pedido manual y **dos**
`Puente 5000 reiniciado y listo.`:
`restart()` no tenía guard de reentrancia y soltaba `userCancelled` a los 800 ms
**sin mirar si el proceso viejo había muerto**. Si el `exit` del SIGTERM llegaba
después, el manejador lo leía como una caída y spawniaba un segundo puente →
`EADDRINUSE`, cinco reinicios zombis y el panel en OFF justo después de decir
«listo». Ahora: se espera la salida real (hasta 2 s más), un solo reinicio vuela a
la vez y el segundo pedido **comparte** el primero en vez de pelearse por el puerto.
*(`server.ts`, cinco ediciones **sin sumar una línea**: el monolito está al tope del
contrato, 12.210.)*

### 1.b La muestra incompleta se ve
`server/routers/telemetria.ts` ya devolvía `incompleto`, `motivos`, `heredados` y
`presupuestoMs`, y `App.tsx` los guardaba con el `...data` — pero `PortTelemetry`
**no los declaraba**, así que la interfaz no podía leerlos sin un `as any`.
Resultado: con la máquina al 100 % de CPU se pierde una tanda de sondeos y el chip
pinta el último valor **heredado** como si fuera recién medido.
Ahora el tipo los declara y la cabecera muestra `MUESTRA PARCIAL (n)` con el detalle
en el `title` (qué puertos vienen de la medición anterior). Sin inventar una sonda
nueva: se cableó la que ya existía.

### 1.c Un solo lugar donde se fija la versión
El árbol tenía **ocho** .bat de un solo uso para cambiar el número
(`ACTUALIZAR-A-2.3.13/14/15/23`, `FIJAR-1.0.0`, `FIJAR-VERSION-1.0.0`,
`build-2.3.14`). Cada uno escribía espejos a mano; cuando alguno se olvidaba de un
archivo, `deriva-documental` cortaba la entrega y había que cazar cuál faltaba.
Quedan reemplazados por **`FIJAR-VERSION.BAT`**:
```
FIJAR-VERSION.BAT            :: lee la semilla y verifica espejos (no escribe)
FIJAR-VERSION.BAT 1.0.2      :: fija, propaga (deriva:fijar), verifica, manifiesto y superficie
```
La semilla sigue viviendo **sólo** en `src/constants.ts`; el resto es espejo del
derivador oficial. El trabajo fino está en `scripts/fijar-version.mjs` para que el
.bat no caiga en la trampa de las comillas anidadas que ya tiró el lanzador.

## 2. Limpieza (51 archivos, con manifiesto, nada borrado)

Ver `MANIFIESTO-LIMPIEZA.md` (raíz) y `.cerebro-papelera/limpieza-2026-11-07/_MANIFIESTO.json`.
- 32 residuos de sesión de la raíz (`_diag-*`, `_tmp_*`, `_suites*`, `_sonda_5102.py`,
  `_build.log`, `_parche_*`, `_respaldo-pre-2.3.9-…`), 8 sondas muertas en `tests/`
  (`_diag_horma3..9`, `_tmp_horma`), 8 .bat de versionado, `build-2.3.14.log` y dos
  temporales que el propio `scripts/empaquetar.mjs` declara «efímeros por definición»
  (`.tmp-test`, `.tmp-parches`).
- Borrado en serio: 3 `__pycache__/` (bytecode regenerable).

**Declarado intocable y por qué:** `_f8f9.md` (lo leen `tests/perfilParches.test.ts` y
`scripts/insertar_fases.mjs`), `_tc_out.txt` (lo referencia `scripts/empaquetar.mjs`),
`__init__.py` + `routers/` + `utils/` + `espejos_servidor/` (el espejo FastAPI del
puente: `tests/espejo.test.ts:62` **exige** `app/__init__.py`), y todo el estado real
del usuario (`.cerebro-db/`, `.proyectos/`, `.cerebronico/`, `.cerebro-papelera/`).

## 2-bis. Autollamado: por qué se callaba aunque quedara trabajo

Mario pregunta: «¿qué pasó con el autollamado cuando quedan tareas pendientes?». Medido:

| Eslabón | Estado encontrado |
|---|---|
| `src/App.tsx:3616` | **sí** pregunta al cerrar el turno (`POST /api/autoLlamado/cierre`) |
| `server/routers/autoLlamado.ts` | decide con `plan: []` (a propósito: el navegador no manda el plan) y `reanudar: REANUDAR.md` — **única** fuente de «hay trabajo» |
| `src/engine/hemisferios.ts:80` | contrato: *«iniciar_todo_windows.bat escribe REANUDAR.md; el motor lo lee»* |
| `iniciar_todo_windows.bat` | **no lo escribía nunca** |

Sin parte, `trabajoPendiente()` devolvía `origen: "nada"` → `accion: "callar"` en **todos** los turnos.
El lazo no estaba desactivado (esa es la nota que muestra el panel): estaba **ciego**, y el frente
silenciaba cualquier respuesta que no fuera «llamar», así que el síntoma era «no pasa nada».

Curas aplicadas: (1) el lanzador escribe el parte en la raíz de datos, con la sección que parsea
`parsearReanudar` y con `NINGUNO` explícito (el parseador reconoce la negación, así que no hay
re-entrada infinita sobre una frase vacía); (2) el frente **muestra el `motivo`** del `callar`, y
también la ausencia de respuesta del server.

**Deuda declarada, no resuelta a medias:** el plan abierto del turno todavía no alimenta el parte.
El dueño vivo del plan es `GestorPlanes`/`planes.json` (`src/engine/taskStoreFs.ts`) y un cable apurado
duplicaría la fuente de verdad que el archivo de transporte se empeñó — con razón — en no partir.
Hace falta un escritor del lado del gestor, con su valla.

## 3. Documentación y número

- `CHANGELOG.md`: entrada v1.0.2 arriba.
- `memoria.md`: bloque dinámico de estado actualizado (y el piso de `rutasSistema`
  reconocido con la razón escrita adentro del test, no bajado en silencio).
- `LEEME-PRIMERO.md`: este informe queda indexado.
- **Versión 1.0.1 → 1.0.2**, propagada con `npm run deriva:fijar`.

## 4. Estado de las vallas (corrido en este árbol)

Ver la tabla en el mensaje de entrega y, para reproducir:
```
npx tsx tests/puertosCableados.test.ts   :: el cable de los 7 + la comodidad de v1.0.2
npm run test:exe                         :: el .EXE enciende los packs
npm run test:puente                      :: autocura del :5000 con el fallo inyectado
npm run validar                          :: la valla maestra
```

## 5. Deuda declarada (no se arregló a medias)

1. `restart()` ya no duplica, pero el **puente adoptado** (`adoptado: true`) sigue sin
   poder reiniciarse: el botón lo dice explícitamente desde v1.97.0 y así queda.
2. `memoria.md` tiene **dos** bloques `BLOQUE-DINAMICO:ESTADO` (líneas 13 y 242). Los
   dos se mantienen al día, pero la duplicación es un riesgo de deriva: habría que
   dejar uno.
3. Si se corre `npm run dev` sin el .bat ni el .EXE, los packs tardan la gracia del
   arranque del supervisor. Se podría bajar esa gracia, pero está congelada por valla
   y su valor tiene una razón (no matar al lanzador que está por prenderlos).

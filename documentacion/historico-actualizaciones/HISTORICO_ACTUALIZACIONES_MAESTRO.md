# HISTORICO DE ACTUALIZACIONES — Notas ACTUALIZAR-a-vX unificadas

Archivo MAESTRO generado el 2026-10-05. Unifica 6 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [INFORME-V1.23.0.md](#informe-v1-23-0-md) — version 1.23.0
2. [ACTUALIZAR-a-v1.45.1.md](#actualizar-a-v1-45-1-md) — version 1.45.1
3. [ACTUALIZAR-a-v1.45.2.md](#actualizar-a-v1-45-2-md) — version 1.45.2
4. [ACTUALIZAR-a-v1.45.3.md](#actualizar-a-v1-45-3-md) — version 1.45.3
5. [ACTUALIZAR-a-v1.45.4.md](#actualizar-a-v1-45-4-md) — version 1.45.4
6. [ACTUALIZAR-a-v1.45.5.md](#actualizar-a-v1-45-5-md) — version 1.45.5


---

<a id="informe-v1-23-0-md"></a>
## (1/6) INFORME-V1.23.0.md

> **Fuente:** `historico-actualizaciones/INFORME-V1.23.0.md`  —  **version:** 1.23.0  —  **bytes:** 3673
# INFORME v1.23.0 — EL MOTOR CON MANOS (2026-09-29)

## Verdad primero
El ZIP anterior (`v1.22.2-REPARADO-EXE`) NO contenía las reparaciones que su
sesión de trabajo reportaba como «hechas y probadas»: `cerradura.ts`,
`completitud.ts`, el `HUESO_DE_OBRA`, las puertas encendidas por defecto y el
control de cierre dentro del turno **no existían en el paquete**. Esta versión
las implementa de verdad, medidas contra el código real. (Los JSON de reflejo
del paquete estaban válidos; los TS1005 de las capturas vinieron de una
regeneración local del modelo con JSON inválido.)

## Qué se arregló (mapeado a tus quejas)
| Queja | Causa medida | Reparación v1.23.0 |
|---|---|---|
| «siempre le faltan archivos» | el 7B tool-capable recibía 8 herramientas SIN `write_file` | HUESO DE OBRA: 11 herramientas de obra nunca se recortan, tope 8→14 |
| «nunca compila» | sin `run_command` en el recorte + puertas apagadas por defecto | `run_command`/`run_tests` al hueso + `puertaCompilacion` encendida (build inferido del package.json) |
| «sin poder volver atrás» | `deshacer_cambios` quedaba fuera del recorte | al hueso |
| «no sabe que ya tiene mcp» | los packs externos se registran últimos y el recorte los expulsaba | 4 huecos reservados para MCP + el recorte se avisa en log, nunca silencioso |
| «hace el código otra vez y no cambia nada» | la reescritura idéntica se absolvía con `ok:true` | REESCRITURA IDÉNTICA = fallo nombrado, con orden de cambiar a `edit_file` |
| «quedan rotas, no puede repararlas» | el acta fiaba un cierre diferido que corría DESPUÉS del «listo» | CONTROL DE CIERRE DENTRO DEL TURNO: puertas rojas → turno reabierto con orden concreta (2 rondas) |
| «se tranca con un log» | el prompt entrante no se recortaba + el parser secuestraba logs | `trimIncomingPrompt` por presupuesto del perfil + guarda de contenido pegado en acciones rápidas |
| «binario no permitido: «de»/«en»» | el captador pescaba prosa tras «comando/orden» y el puente la ejecutaba | el parser ya no pesca palabras del idioma; el puente rechaza prosa diciéndolo |
| «No existe: Desktop\validar.mjs» | leer sin carpeta de PC nombrada adivinaba `Desktop/` | sin Escritorio/Descargas/Documentos/ruta absoluta nombrada, la orden va al modelo; el «No existe» del puente ahora sugiere candidatas reales |
| «entrega 10-15 vulnerabilidades» | ninguna puerta miraba seguridad | CERRADURA: 19 reglas (XSS, eval, SQLi, secretos, RCE, traversal, CORS, CSP, cookies…); las críticas bloquean la tanda |
| «apps incompletas» | nadie contrastaba plan ↔ disco | COMPLETITUD: prometidos sin escribir, `src=`/`href=` al vacío, 0 bytes, truncados y hueco de arranque entran al acta |

## Cómo verificar (en 2 minutos)
```bash
npm install --ignore-scripts
npx tsc --noEmit            # 0 errores
npm run validar             # VEREDICTO: TODO CORRECTO — 4585 comprobaciones, 0 fallos
npx tsx tests/huesoObra.test.ts     # 30 — la sonda antes/después del recorte
npx tsx tests/cerradura.test.ts     # 52 — las 19 reglas
npx tsx tests/completitud.test.ts   # 35 — plan ↔ manifiesto ↔ disco
```
`dist/` de este paquete ya está reconstruido con el motor nuevo (`vite build` +
`esbuild`), y `node scripts/verificar-artefactos.mjs` dio verde: sin imports
huérfanos, el EXE arranca con estas hojas.

## Kill-switches (el usuario manda)
- `QUIROFANO_SIN_COMPILACION=1` / `QUIROFANO_SIN_CERRADURA=1` — apagar puertas nuevas.
- `QUIROFANO_GATES=tipos,humo` — encender además las caras por tiempo.

— Cerrado y empaquetado por el motor de verificación de la casa: nada de este
informe se afirma sin su suite en verde.


---

<a id="actualizar-a-v1-45-1-md"></a>
## (2/6) ACTUALIZAR-a-v1.45.1.md

> **Fuente:** `historico-actualizaciones/ACTUALIZAR-a-v1.45.1.md`  —  **version:** 1.45.1  —  **bytes:** 3063
# Cómo actualizar a CerebroNico V1.45.1

**Qué trae esta actualización:** arregla el error de comunicación con los
modelos Gemini (el cuadro rojo «Error de comunicación con
gemini-3.5-flash-lite»). Ya puedes volver a usar los modelos con normalidad.

No necesitas una clave API nueva: tu clave actual sigue siendo válida.

---

## Antes de empezar

- **Haz una copia de seguridad** de tu carpeta actual de CerebroNico (por si
  quieres volver atrás).
- Ten a mano el archivo **`Cerebronico-v1.45.1.zip`** que recibiste.
- Cierra la aplicación CerebroNico si la tienes abierta.

---

## Opción A — La más sencilla (recomendada): reemplazar la carpeta

Ideal si usas la app tal cual, sin compilarla tú.

1. Cierra CerebroNico por completo.
2. Descomprime `Cerebronico-v1.45.1.zip`. Obtendrás una carpeta llamada
   **`Cerebronico-v1.45.1`**.
3. Mueve o copia tus datos personales desde tu instalación anterior a la nueva
   carpeta, si los tienes fuera (por ejemplo, tu archivo de claves o tus
   proyectos). La configuración de las claves API se conserva normalmente al
   iniciar la nueva versión.
4. Abre la carpeta nueva y arranca la app como siempre (por ejemplo, con
   `iniciar_todo_windows.bat`).
5. Comprueba que arriba aparece **V1.45.1**.

> Ventaja: no te juegas nada de tu instalación vieja; la nueva queda aparte.

---

## Opción B — Actualización mínima (solo un archivo)

Si prefieres tocar lo menos posible y mantener tu carpeta actual:

1. Cierra CerebroNico.
2. Del ZIP nuevo, copia el archivo:
   `Cerebronico-v1.45.1/src/engine/herramientasNube.ts`
3. Pégalo en tu instalación actual, en la misma ruta
   (`src/engine/herramientasNube.ts`), **sobrescribiendo** el que ya tienes.
4. (Opcional, para que la app muestre el número nuevo) actualiza también:
   - `package.json` → cambia `"version": "1.45.0"` por `"version": "1.45.1"`.
   - `src/constants.ts` → cambia `VERSION_SEMVER = "1.45.0"` por `"1.45.1"`.
5. Vuelve a arrancar la app.

---

## Si compilas la app tú mismo (desarrolladores)

Desde la carpeta `Cerebronico-v1.45.1`:

```bash
npm install
npm run validar      # verificación / tests
```

En Windows puedes usar los scripts incluidos:

```
probar_todo_windows.bat     # pruebas
compilar_exe_windows.bat    # generar el ejecutable
```

---

## Cómo saber que quedó bien

1. Abre CerebroNico y confirma que en la parte superior dice **V1.45.1**.
2. En Config → Gemini, deja tu clave API como la tenías.
3. Selecciona un modelo Gemini (por ejemplo `gemini-3.5-flash-lite`) y envía un
   mensaje de prueba.
4. El modelo debe responder con normalidad, **sin** el cuadro rojo de «Error de
   comunicación».

---

## ¿Algo salió mal?

- **Sigue apareciendo el error rojo:** asegúrate de que realmente estás abriendo
  la carpeta/instalación nueva (que diga V1.45.1) y no la antigua.
- **Quiero volver atrás:** usa la copia de seguridad que hiciste al principio.
- **Dudas con las claves API:** no hace falta generar una nueva; tu clave de
  `aistudio.google.com/apikey` sigue sirviendo.


---

<a id="actualizar-a-v1-45-2-md"></a>
## (3/6) ACTUALIZAR-a-v1.45.2.md

> **Fuente:** `historico-actualizaciones/ACTUALIZAR-a-v1.45.2.md`  —  **version:** 1.45.2  —  **bytes:** 2483
# Cómo actualizar a CerebróNico v1.45.2

Esta versión hace que el chat **recuerde el contexto de tareas largas** y, al
mismo tiempo, **responda lo más rápido posible**. No hay que tocar tu clave de
API ni tus ajustes.

## Qué cambia para ti
- En conversaciones largas, el asistente ya no «se olvida» de lo que estaban
  haciendo: lo viejo se resume y se mantiene en contexto.
- El prompt sigue siendo pequeño, así que la primera palabra sigue saliendo
  rápido (y se evita el error «Prompt exceeds max length» de antes).
- El resumen se arma solo, sin gastar otra llamada al modelo: no suma espera.

---

## Antes de nada: copia de seguridad
Antes de reemplazar nada, guarda una copia de tu carpeta actual:

- Copia toda la carpeta `Cerebronico-v1.45.1` y renombra la copia a algo como
  `Cerebronico-v1.45.1-RESPALDO`.

Así, si algo no te gusta, vuelves a la copia y listo.

---

## Opción A (recomendada) — reemplazar la carpeta completa
1. Descomprime el ZIP nuevo (`Cerebronico-v1.45.2.zip`).
2. Usa esa carpeta nueva como tu proyecto.
3. Dentro de la carpeta, abre una consola y ejecuta:
   - `npm install`
   - `npm run dev` (o tu lanzador `iniciar_todo`).

## Opción B — actualización mínima (solo los archivos que cambiaron)
Si prefieres no reemplazar toda la carpeta, copia SOLO estos 4 archivos del ZIP
nuevo encima de tu carpeta actual:

- `server.ts`
- `src/engine/modelTiers.ts`
- `package.json`
- `src/constants.ts`

Luego, dentro de la carpeta: `npm install` y `npm run dev`.

---

## Cómo verificar que quedó aplicada
1. En la app, mira el número de versión: debe decir **V1.45.2**.
2. Ten una charla larga (varios mensajes) y luego pregunta algo que mencionaste
   al principio: debería recordarlo.
3. (Opcional, técnico) En la consola donde corre el servidor verás un aviso del
   tipo: «Los N más antiguos se CONDENSARON en un resumen (memoria de tareas
   largas), no se perdieron.» cuando el historial es largo.

## Cómo revertir si no te convence
- Borra la carpeta nueva y vuelve a usar tu `...-RESPALDO`, o
- Si usaste la Opción B, vuelve a copiar esos 4 archivos desde tu respaldo.
- En ambos casos: `npm install` y `npm run dev`.

---

## Nota honesta
No pude compilar ni probar el arranque en Windows desde mi entorno. El cambio es
de bajo riesgo (afecta cómo se recorta/condensa el historial, nada de tu clave
ni de la interfaz). Si al correr `npm run dev` ves cualquier error, avísame con
el texto exacto y lo ajusto.


---

<a id="actualizar-a-v1-45-3-md"></a>
## (4/6) ACTUALIZAR-a-v1.45.3.md

> **Fuente:** `historico-actualizaciones/ACTUALIZAR-a-v1.45.3.md`  —  **version:** 1.45.3  —  **bytes:** 2321
# Cómo actualizar a CerebróNico v1.45.3

Esta versión agrega un **sonido de ambiente** (misterio / investigación /
suspenso) que suena **en bucle indefinido** mientras trabajas, con un control
para encenderlo/apagarlo y bajarle el volumen.

## Qué verás
- Un botón flotante abajo a la izquierda: **Ambiente ON / OFF** y una barrita de
  volumen.
- Al pulsarlo, empieza a sonar y se repite solo, sin fin, hasta que lo apagues.
- La app recuerda si lo dejaste encendido y a qué volumen.

## Importante (no es un error)
Los navegadores y Electron NO dejan que un audio suene **antes** de que toques
la ventana. Por eso el sonido arranca cuando pulsas el botón (o, si lo dejaste
encendido, en tu primer clic/tecla al abrir la app). Es la regla del navegador,
no un fallo de la app.

---

## Antes de nada: copia de seguridad
Copia tu carpeta actual y renombra la copia a algo como `...-RESPALDO`. Así, si
no te gusta, vuelves a ella.

## Opción A (recomendada) — reemplazar la carpeta completa
1. Descomprime `Cerebronico-v1.45.3.zip`.
2. Usa esa carpeta como tu proyecto.
3. Dentro de la carpeta: `npm install` y luego `npm run dev` (o tu `iniciar_todo`).

## Opción B — actualización mínima (solo lo que cambió)
Copia del ZIP nuevo encima de tu carpeta actual:

- `src/components/AudioAmbiente.tsx`  (archivo nuevo)
- `src/App.tsx`
- `public/audio/misterio-loop.mp3`  (archivo nuevo — crea la carpeta `public/audio`)
- `package.json`
- `src/constants.ts`

Luego: `npm install` y `npm run dev`.

---

## Cómo cambiar el sonido por otro tuyo
¿Quieres otra pista? Solo reemplaza el archivo `public/audio/misterio-loop.mp3`
por tu propio MP3 con el MISMO nombre. No hay que tocar código.

## Cómo verificar
1. La versión en la app debe decir **V1.45.3**.
2. Abajo a la izquierda aparece el botón **Ambiente**. Púlsalo: debe sonar y
   repetirse solo.

## Cómo revertir
- Vuelve a tu carpeta `...-RESPALDO`, o
- Si usaste la Opción B: quita el montaje de `<AudioAmbiente />` de `src/App.tsx`
  y borra el componente y el MP3. Luego `npm run dev`.

---

## Nota honesta
No pude compilar ni arrancar en Windows desde mi entorno. El cambio es de bajo
riesgo y está aislado (un componente nuevo + un archivo de audio). Si al correr
`npm run dev` ves algún error, pásame el texto exacto y lo ajusto.


---

<a id="actualizar-a-v1-45-4-md"></a>
## (5/6) ACTUALIZAR-a-v1.45.4.md

> **Fuente:** `historico-actualizaciones/ACTUALIZAR-a-v1.45.4.md`  —  **version:** 1.45.4  —  **bytes:** 2878
# Como actualizar a la version 1.45.4

**Que trae esta version:** Gemini (y en general los modelos de nube rapidos:
flash / lite / mini / turbo / haiku...) responde mas rapido porque ahora recibe
un "prompt de sistema" mucho mas corto. El modelo **conserva todas sus
herramientas** y la capacidad de agente; solo se le quita texto fijo que lo
hacia esperar antes de la primera palabra.

> Nota honesta: la IDE siempre lleva algo mas de contexto que la version
> "ligera" (porque es un agente completo, no un chat pelado). Esto la deja
> **muy cerca** en velocidad, pero puede no quedar identica.

---

## 1) Antes de nada: copia de seguridad

Antes de tocar nada, guarda una copia de tu carpeta actual por si queres
volver atras:

1. Cerra la aplicacion.
2. Copia la carpeta entera de tu version actual (por ejemplo
   `Cerebronico-v1.45.3`) y pegala al lado con otro nombre, por ejemplo
   `Cerebronico-v1.45.3-RESPALDO`.

Asi, si algo no te gusta, borras la nueva y renombras el respaldo. Listo.

---

## 2) Dos formas de actualizar

### Opcion A - Reemplazar la carpeta completa (lo recomendado)

Es lo mas simple y seguro:

1. Descomprimi el ZIP nuevo (`Cerebronico-v1.45.4.zip`).
2. Usa esa carpeta nueva como tu aplicacion.
3. La primera vez, abri una terminal dentro de la carpeta y ejecuta:
   ```
   npm install
   npm run dev
   ```
   (o tu atajo de siempre, `iniciar_todo`).

Tus datos del cerebro/memoria viven en la carpeta de datos de la app, no dentro
del codigo, asi que no se pierden al cambiar de carpeta.

### Opcion B - Actualizacion minima (solo 2 archivos de codigo)

Si preferis tocar lo menos posible y ya tenes la 1.45.3 funcionando, basta con
reemplazar **dos archivos** por los de la version nueva:

- `server.ts`
- `src/engine/modelTiers.ts`

Y, para que la app muestre el numero correcto, actualiza la version en:

- `package.json` -> `"version": "1.45.4"`
- `src/constants.ts` -> `const VERSION_SEMVER = "1.45.4";`

Despues volve a arrancar con `npm run dev`.

---

## 3) Como verificar que quedo aplicada

1. Abri la app: en el titulo/pie deberia figurar **V1.45.4**.
2. Elegi un modelo Gemini rapido (por ejemplo `gemini-3.6-flash`) y escribi un
   mensaje corto. La **primera palabra** deberia aparecer antes que en la 1.45.3.
3. Comproba que el agente sigue funcionando: pedile algo que use herramientas
   (por ejemplo leer o escribir un archivo). Debe seguir haciendolo igual.

---

## 4) Como revertir (volver a la 1.45.3)

- Si usaste la **Opcion A**: borra la carpeta 1.45.4 y volve a usar tu
  `...-RESPALDO` (renombralo de nuevo a su nombre normal).
- Si usaste la **Opcion B**: volve a poner los dos archivos originales
  (`server.ts` y `src/engine/modelTiers.ts`) desde tu respaldo y deja la version
  en `1.45.3` en `package.json` y `src/constants.ts`.

En ambos casos no se toca ni el cerebro ni la memoria, asi que no perdes nada.


---

<a id="actualizar-a-v1-45-5-md"></a>
## (6/6) ACTUALIZAR-a-v1.45.5.md

> **Fuente:** `historico-actualizaciones/ACTUALIZAR-a-v1.45.5.md`  —  **version:** 1.45.5  —  **bytes:** 2393
# Como actualizar a la version 1.45.5

**Que trae esta version:**
1. El GIF pesado (50 MB) convertido a un **GIF liviano de ~1,2 MB**.
2. **6 fondos tuyos** incluidos dentro de la app para cambiar el fondo desde el
   menu, sin internet.
3. El **icono del .exe** ahora es el **cerebro dentro de un hexagono**.

---

## 1) Copia de seguridad (siempre primero)
1. Cerra la aplicacion.
2. Copia tu carpeta actual y pegala al lado con otro nombre (por ejemplo
   `Cerebronico-RESPALDO`). Si algo no te gusta, volves a esa.

---

## 2) Como actualizar

### Opcion A - Carpeta completa (recomendado)
1. Descomprimi el ZIP nuevo (`Cerebronico-v1.45.5.zip`).
2. Usa esa carpeta como tu app.
3. La primera vez:
   ```
   npm install
   npm run dev
   ```
   (o tu atajo `iniciar_todo`).

### Opcion B - Actualizacion minima
Si ya tenes la version anterior andando y solo queres los fondos y el icono,
copia desde el ZIP nuevo:
- La carpeta **`public/fondos/`** entera (los 6 fondos).
- `src/utils/proSettings.ts` (agrega los fondos al menu).
- Los iconos: `build/icon.ico`, `icon.ico`, `icon.png`, `public/favicon.ico`,
  `public/icono-cerebronico.png`.

Y actualiza la version en `package.json` (`1.45.5`) y en `src/constants.ts`
(`VERSION_SEMVER = "1.45.5"`).

---

## 3) Donde elegir el fondo
Abri la app y anda a **Configuracion PRO -> Fondo**. Vas a ver los fondos
nuevos:
- Cerebro - hexagono
- Cerebro - anillo
- Cerebro - explosion
- Cerebro - datos
- Entrada de informacion
- Cerebro - entrada (animado)  <- este es el GIF liviano

Elegilo y se aplica al instante.

---

## 4) IMPORTANTE sobre el icono del .exe
El icono del cerebro-hexagono se **incrusta al generar el instalador**, no se
cambia en un .exe ya hecho. Para verlo en el ejecutable tenes que **volver a
empaquetar**:
```
npm run dist
```
(o el script de build que uses para generar el instalador). Dentro de la app
(ventana y pestana) el icono nuevo se ve en cuanto arrancas con `npm run dev`.

> Nota honesta: no pude compilar ni arrancar la app aqui (es un entorno Linux
> sin Windows/Electron), asi que conviene que lo pruebes en tu equipo.

---

## 5) Como revertir
- Opcion A: borra la carpeta 1.45.5 y volve a tu `...-RESPALDO`.
- Opcion B: restaura los archivos originales (`public/fondos/` no existia antes,
  podes borrarla; `proSettings.ts` y los iconos vuelven del respaldo) y deja la
  version en el numero anterior.

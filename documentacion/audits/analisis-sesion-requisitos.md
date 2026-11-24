# Análisis de la sesión CerebroNico IDE — requisitos de evolución

**Fuentes analizadas (solo lectura, no se modificó ningún archivo de origen)**

| Archivo | Tamaño | Qué es |
|---|---|---|
| `/home/wuying/.accio/uploads/cerebronico-ide-sesion-1794120824912.json` | 4,2 MB | Export de la conversación: 136 mensajes (64 usuario / 72 asistente), `appVersion 1.0.9`, `exportedAt 2026-11-08T06:53:44Z`, `currentModel deepseek-v4-1-flash-1017`, `provider mistral`, `responseLanguage es`, `workspaceFiles: []` |
| `/home/wuying/.accio/uploads/log de secion.json` | 111 KB | Log de arranque + sesión del IDE (texto plano con CRLF, **no** es JSON válido pese a la extensión): 883 líneas, arranque del lanzador, mapa de puertos, quirófano, preview, bucle |

**Método.** Se parseó el JSON con Python, se volcó la conversación completa a texto indexado por mensaje (`[M000]`…`[M135]`, con rol, timestamp y modelo) y el log a texto normalizado (`[LOG:n]` = línea n). Se leyeron íntegras las zonas finales (M090–M135) y los tramos donde el modelo detalla requerimientos (M034, M092–M102, M110–M135), y se hizo grep insensible a mayúsculas sobre: `ruta, sandbox, previsualiz*, preview, confus*, relativa, absoluta, src/, dist, public, espejo, puente, modelos, timeout, autovalido*, automejora, MCP, gratuito`. Las referencias entre corchetes remiten al índice de mensaje del export (`[M116]`) o a la línea del log (`[LOG:110]`).

> Nota de alcance: la sesión es de **un solo hilo de trabajo** (un juego 3D de autos, "Ruta Turbo") pero los defectos que aparecen son **del IDE**: sandbox, quirófano, autoscroll del chat, marcador de modelos, validador. Eso es lo que se extrae aquí.

---

## Resumen ejecutivo

La sesión gastó ~20 de 136 turnos en un solo malentendido: **el sandbox `:3500` sirve una única carpeta (`C:\Cerebronico`, la raíz de datos) y no sus subcarpetas**. El agente escribía en `C:\Cerebronico\juego-autos\` mientras el navegador abría `C:\Cerebronico\index.html`, que además era el HTML de **otra app** (un quemador de CDs) y apuntaba a `./cn-preview.js`. A eso se sumaron tres mecanismos que **ocultan** el error en vez de exponerlo:

1. **El preview reescribe el `src` del `index.html` a `cn-preview.js`** cada vez que compila (13 bundles en el log, 8 de ellos rebundleando el bundle anterior). El agente lo "arregló" 6 veces y volvió a aparecer.
2. **El quirófano revierte la tanda entera y `write_file` igual reporta éxito.** En el log hay **49 reversiones**, casi todas por la puerta de seguridad `CERRADURA` marcando `innerHTML` como XSS crítico, más tandas caídas por imports no resueltos de scripts de diagnóstico.
3. **Un borrado con comodín (`del`) destruyó el proyecto entero** y el informe anterior lo había declarado "raíz limpia" sin haberlo comprobado.

El usuario, en la segunda mitad, pide explícitamente **memoria persistente de automejora** ("todo error se deja registro en md… al igual que los aciertos") y **que el IDE se autocorrija sin pedir permiso** ("se supone que tu sabes que es mal o bien, hazlo automatico, si esta mal corrije"). El modelo construyó el andamiaje (registro con evidencia, manual de rutas, consolidador del quirófano, validador) y cerró cinco defectos del motor, pero dejó abiertos los dos más caros: **la política de la puerta de seguridad** y **la reescritura del `index.html` por el preview**.

---

## A) Requerimientos para mejorar el funcionamiento (lista completa)

Se agrupan por subsistema. "Estado" = qué pasó en la sesión (cerrado / propuesto / abierto / detectado en log y no atendido).

### A.1 Quirófano (guardián de cambios) y validador de imports

| # | Requerimiento | Cita / contexto | Estado |
|---|---|---|---|
| A1.1 | **Los módulos nativos nunca son "imports faltantes"**. `findMissingImports` marcaba `node:fs` como roto porque no está en el inventario del proyecto. | `[M116]`: "**Corrección 2 — los módulos nativos nunca son «faltantes»**" (`esModuloNativo()`); verificado después: "`require("node:fs")`, `path`, `crypto` → **0** marcados como faltantes" y "`tests/quirofano.test.ts` → **127 pass · 0 fail**" | **Cerrado** (parche en `src/engine/importChecker.ts`) |
| A1.2 | **La puerta de imports debe evaluar por archivo, no por tanda.** Un `.md` no puede tener imports rotos, pero caía con el `.cjs` del mismo lote. | `[M116]`: "**Corrección 3 — la puerta debe evaluar por archivo, no por tanda.** Un `.md` no tiene imports: no puede tener imports rotos." | **Ya cubierto** por el filtro de extensión existente (`[M116]`: "`findMissingImports` ya filtra por extensión de código en su primera línea") — pero **el fallo real de tanda sigue**: ver A1.4 |
| A1.3 | **El inventario del proyecto debe incluir todo lo importable** (o justificar por qué no). | `[M116]`: "`QF_SKIP` **no incluye** `logs`, `cerebro`, `.cerebronico`…"; luego el propio modelo **se corrige**: "mi diagnóstico anterior decía que le faltaban… al leerlo, el `Set` real es `node_modules, .git, dist, dist_electron, .vite, venv, __pycache__, .cerebro-db, .cn-sync, .cn-quirofano, .quirofano-backup` — y **no necesita** esas carpetas" | Corregido el informe, sin cambio de código |
| A1.4 | **La reversión debe ser por archivo, no por lote.** Hoy una sola puerta roja tira todo lo válido. | `[M116]`: "La tanda entera se revierte, incluidos los archivos que sí eran válidos"; `[M116]`: "`ERRORES-Y-ACIERTOS.md` y `RUTAS.md` se fueron con él" | **Abierto** (solo se mitigó la causa de imports; el diseño de lote sigue) |
| A1.5 | **`write_file` no debe devolver "éxito" si el quirófano revirtió.** Debe devolver el veredicto y el motivo. | `[M112]`: "`write_file` decía «éxito» y el archivo no existía"; "el motor **no** escribe ninguna línea de reversión en su log. A4 es real" | **Parcial**: se agregó `registro-quirofano.cjs` (consolidador de `.cn-quirofano/ultima.json` → `logs/quirofano.log`), pero **no** se corrigió el contrato de la herramienta |
| A1.6 | **Log acumulativo y legible de reversiones** (una línea por reversión: archivo + motivo + puerta). | `[M110]` A4: "El guardián revierte sin decir qué ni por qué → log de una línea por reversión"; `[M112]`: "el quirófano revierte archivos que él mismo califica de «seguro»… `REVERTIDA · registro-quirofano.cjs (nuevo, seguro)`" | **Cerrado a medias**: existe el log, pero **la reversión sigue ocurriendo** |
| A1.7 | **La puerta de seguridad (`CERRADURA`) no puede tratar `innerHTML` inocente como XSS crítico y revertir todo.** En el log es la causa **dominante** de reversión: `main.js:137/611/634 [xss-innerhtml]` → "cambio REVERTIDO — seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S)", **49 veces**. | `[LOG:110]`, `[LOG:117]`, `[LOG:221]`, `[LOG:244]`, `[LOG:262]`… | **Detectado en log, NUNCA atendido en la conversación** (el modelo atribuyó las reversiones a imports y a "el guardián") |
| A1.8 | **El guardián no debe borrar los archivos que el agente acaba de escribir** (limpiaba `.mjs` sueltos: el verificador desaparecía). | `[M088]`: "solo desapareció mi verificador (el guardián limpia `.mjs` sueltos). Lo escribo como `.cjs`" | **Abierto** (workaround del agente, no arreglo) |
| A1.9 | **`force=true` no existe en `write_file`**: el agente lo asumió y perdió turnos. | `[M034]`: "El Quirófano no acepta `force=true` como argumento de `write_file` — ese parámetro no existe en la herramienta" | **Abierto** (documentar/implementar una vía de excepción con motivo) |
| A1.10 | **El agente no puede editar el motor del IDE desde dentro**: `edit_file` está confinado al sandbox y "el quirófano se revertiría a sí mismo". Hace falta una vía soportada (instalación/actualización firmada, `pc_write_file`, o modo mantenimiento). | `[M116]`: "No edité `quirofano.ts` ni `server.ts`… el quirófano se revertiría a sí mismo… o me digas que lo haga y lo hago con `fs_write` sobre la instalación"; `[M118]`: "`edit_file` está confinado al sandbox. Edito con `fs_write`" | **Abierto** (se usó `run_command`/`node`/`fs_write` como puente informal) |
| A1.11 | **Ninguna afirmación de estado sin el comando que la prueba.** | `[M106]`: "**Ningún informe de estado sin el comando que lo prueba pegado al lado**" (error #2: "Afirmé «raíz limpia: solo los 7 del juego» sin haberlo comprobado") | Regla escrita en `ERRORES-Y-ACIERTOS.md`; **violada de nuevo** en `[M102]` ("El juego ya no existe… Mi informe anterior afirmaba «raíz limpia» — **eso era falso**") |

### A.2 Sandbox, rutas y previsualización

| # | Requerimiento | Cita / contexto | Estado |
|---|---|---|---|
| A2.1 | **Un proyecto = una sola copia, y vive en la raíz servida**, no en subcarpeta. | `[M096]` §9: "la regla de oro «el proyecto va en la raíz servida, no en una subcarpeta»"; `[M094]`: "Yo estuve editando `juego-autos/` y el sandbox sirve la raíz" | **Cerrado** (se borró el duplicado y se documentó) |
| A2.2 | **Chequeo "paso 0": revisar el sandbox antes de servir** (si tiene restos de otra sesión). | `[M097]` usuario: "para ejecutar antes de servir la tarea revisar el sandbox si esta vacio"; `[M098]`: "**Un sandbox sucio no se nota: se sirve.** Antes de decir «listo, mirá el preview», comprobá que lo que hay dentro es TU proyecto y no el de la sesión anterior" | **Cerrado** como procedimiento (`RUTAS.md` §10 + paso 0 del checklist + `memoria.md`), **no** como código |
| A2.3 | **`/__cn_info` visible en la UI al arrancar el sandbox**: que la IDE diga en pantalla "sirviendo `C:\Cerebronico`". | `[M100]` mejora 1: "**`/__cn_info` en el arranque del sandbox**, no escondido en un endpoint. Que la IDE diga en pantalla «sirviendo `C:\Cerebronico`» antes de que el usuario pregunte por qué no ve nada" | **Propuesto** (hoy solo endpoint: `[M093]` `{"ok":true,"raizPedida":"C:\\Cerebronico","raizEfectiva":"C:\\Cerebronico","motivo":"index.html en la raiz servida","tieneIndex":true}`) |
| A2.4 | **Aviso de proyecto duplicado**: si existe `<raíz>/<nombre>/index.html` **y** `<raíz>/index.html`, avisar. | `[M100]` mejora 2: "Es el error más caro de esta sesión y es detectable en 3 líneas" | **Propuesto** |
| A2.5 | **Validar el `src` del `index.html` servido**: que cargue su propio JS y no otro (`cn-preview.js`, `app.js` del proyecto anterior). | `[M090]`: "`index.html` — línea 109 vuelve a `src="./main.js"`. **Estaba en `cn-preview.js` otra vez**: es la causa que reaparece y anulaba todos los arreglos"; `[M100]`: "`index.html` volvió a `cn-preview.js` tres veces" (en realidad ≥6: `[M054]`, `[M074]`, `[M078]`, `[M088]`, `[M090]`) | **Abierto**: se corrigió el archivo cada vez, **nunca el mecanismo que lo reescribe** |
| A2.6 | **El preview no debe persistir su bundle en el HTML fuente.** `Vía rápida: bundle listo (./main.js → cn-preview.js)` y `(./cn-preview.js → cn-preview.js)` ×8 ⇒ el pipeline se retroalimenta de su propia salida. | `[LOG:227]`, `[LOG:256]`, `[LOG:293]`, `[LOG:315]`, `[LOG:324]`, `[LOG:355]`, `[LOG:387]`, `[LOG:409]`, `[LOG:448]`, `[LOG:648]`, `[LOG:665]`, `[LOG:673]`, `[LOG:707]`; `[LOG:215]` "Preview por «estatico-compilado»: Hay 12 fuente(s) que transpilar…" | **Detectado por correlación log↔síntoma; no diagnosticado en la sesión** |
| A2.7 | **Rutas con `../` o absolutas ⇒ 403, no 404** (y hay que reportarlo como tal). | `[M092]` causa C: "**Rutas con `../` o absolutas** — 403, no 404 — L329 `if (!target.startsWith(raiz.dir))`" | Documentado en `INFORME-RUTAS-SANDBOX.md` (161 líneas) |
| A2.8 | **`index.html` vacío o sin HTML ⇒ pantalla blanca sin errores**: detectar (`pareceHtml` L283, longitud 0 L250). | `[M092]` causa D | Documentado |
| A2.9 | **Service worker viejo ⇒ se ve la versión anterior**: el servidor lo neutraliza (`sw.js` L317-325). | `[M092]` causa E | Ya implementado, documentado |
| A2.10 | **`crear_sitio` debe verificar al terminar** que el `index.html` generado carga su propio CSS/JS con rutas relativas correctas, y decirlo. | `[M102]`: "**Y una mejora de proceso, la que más te habría ahorrado hoy:** que `crear_sitio` **verifique al terminar** que el `index.html` generado carga su propio CSS y JS con rutas relativas correctas, y lo diga. Es el mismo error que nos comió la sesión, trasladado al creador" | **Propuesto** |
| A2.11 | **Aislar el sandbox por proyecto** (montar la carpeta del proyecto en vez de la raíz de datos). | Implícito en todo el bloque: `[M094]` "el sandbox sirve `C:\Cerebronico` — la raíz de datos, **no** la carpeta del proyecto"; `[M098]` "El sandbox `:3500` sirve **una sola carpeta**"; `[M100]` "El sandbox sirve UNA carpeta…, no subcarpetas" | **No propuesto explícitamente**; es la cura de fondo (ver §F) |
| A2.12 | **Calibración de ejes como utilidad** (`calibrarEje(camara)`): devolver qué dirección de pantalla corresponde a cada eje del mundo. | `[M100]` mejora 4: "Lo razoné mal dos veces" (caso `ndcX` vs `+x`) | **Propuesto** |
| A2.13 | **Antes de borrar: `dir /b <patrón>`; nunca `del` con comodines.** | `[M106]`: "**Nunca `del` con comodines.** Listar con `dir /b <patrón>` primero, borrar archivo por archivo con nombre exacto"; "Un `del` con comodín en la raíz servida es un borrado del proyecto, no una limpieza" | Regla escrita (`ERRORES-Y-ACIERTOS.md` §1) |
| A2.14 | **`cmd` + `echo` con comillas + `&&` crea archivos basura** (`!css.includes('.'+c))`, `x[1])`). | `[M096]`: "basura: `cmd` partió un `echo` con comillas"; `[M096]`: "la regla de `cmd` (nunca `echo` con comillas y `&&`: crea archivos basura)" | Registrado en `memoria.md` |
| A2.15 | **Los scripts de diagnóstico no contaminan el proyecto**: los `.mjs` de prueba (`_test_curva.mjs`, `test-pista.mjs`, `verificar-abordo.mjs`) quedan en la raíz servida y **rompen la puerta de imports**. | `[LOG:239]`: "Imports sin resolver: 3 · `test-pista.mjs` importa "./vendor/three/three.module.js" y NO existe · `verificar-abordo.mjs` importa "./node_modules/three/build/three.module.js" y NO existe · `_test_curva.mjs` importa…"; `[LOG:254]` idem 1 | **Abierto**: requiere carpeta temporal fuera del inventario (`_tmp/` excluida) o limpieza automática |

### A.3 Verificación, aceptación y auto-cierre

| # | Requerimiento | Cita / contexto | Estado |
|---|---|---|---|
| A3.1 | **Verificar por ejecución, no por lectura**: `node --check`, simulación sin navegador, criterios contados. | `[M090]`: "Verificado por ejecución en este turno (`node --check` en los 4 JS + verificador de 20 criterios)"; `[M106]` acierto 1: "**Verificar con simulación sin navegador** — la meta se probó con 260 frames y 520 frames, no «mirando si anda»" | Práctica establecida |
| A3.2 | **Un verificador con nombres inventados produce falsos fallos**: corregir el verificador, no el código. | `[M090]`: "usaba nombres inventados (`derrape`, `turbo`, `pausa`) cuando los reales son `actualizarDerrape`, `actualizarTurbo`, `pausaOn`/`pausaOff`. Corregida la lista → 20/20"; `[M106]` acierto 3: "**Corregir el verificador, no el código**, cuando el fallo está en el criterio de medida (el caso del volante y del `ndcX`)" | Registrado |
| A3.3 | **Reproducir el defecto antes de corregirlo** (A7). | `[M120]`: "**A7** (reproducir antes de corregir)" | Registrado como acierto |
| A3.4 | **Después de corregir una función, buscar sus copias inline** (A8). Un arreglo en un módulo que nadie llama no es un arreglo. | `[M120]`: "`ChatCenter.tsx` tenía **su propia copia inline** del conductor… El módulo corregido nunca se ejecutaba. Un arreglo en un módulo que nadie llama no es un arreglo" | Registrado como regla |
| A3.5 | **El contrato de las pruebas del proyecto manda sobre la intuición del agente** (52 px/cuadro). | `[M135]`: "La prueba es correcta y mi corrección la viola: `curvaDeSeguimiento` exige que **ningún cuadro mueva la barra más de `PASO_MAXIMO_PX` (52 px)**… Ese contrato existe por una razón buena: un salto brusco es un teletransporte visual, y ya rompió el chat antes" | **Cerrado** con 29/29 |
| A3.6 | **Registro de errores Y aciertos, persistente, en `.md`**, con causa raíz comprobada. | `[M105]` usuario: "dejar en md , todo error se deja registro en md para no volver a cometerlo, al igual que los aciertos para si volver a recordar como se hace, memoria persistente de automejora" | **Creado** (`ERRORES-Y-ACIERTOS.md`) aunque revertido y reescrito con `fs_write` |
| A3.7 | **Casillas de error abierto que solo se cierran con fecha + qué se hizo + cómo se verificó.** | `[M110]`: "Sin esos tres datos no se marca: una casilla marcada sin evidencia es peor que una abierta" | Formato documentado |
| A3.8 | **Autocorrección sin pedir permiso** cuando el agente sabe que está mal. | `[M111]` usuario: "se supone que tu sabes que es mal o bien, hazlo automatico, si esta mal corrije" → `[M112]` el modelo cierra A1–A4 en un turno | Cumplido en ese turno; el patrón no quedó como política |
| A3.9 | **Lo destructivo sigue requiriendo permiso.** | `[M094]`: "No la borro sin permiso — es destructivo"; `[M096]`: "No los borro sin permiso" | Práctica correcta, no contradictoria con A3.8 |
| A3.10 | **Persistencia real de lo escrito**: `write_file` puede ser revertido; lo que debe durar se escribe con `fs_write`. | `[M112]`: "la regla que evita repetirlo: **lo que debe persistir se escribe con `fs_write`, no con `write_file`**" | **Workaround**, no arreglo (ver A1.5) |

### A.4 Chat: autoscroll, primer turno y estabilidad

| # | Requerimiento | Cita / contexto | Estado |
|---|---|---|---|
| A4.1 | **El seguidor del hilo no puede ser más lento que el texto que persigue.** | `[M120]`: "el seguidor camina a **780 px/s** (12,48 px por cuadro a 16 ms) y el texto crece a **40 px por cuadro**. El texto gana la carrera por 27,5 px cada cuadro. En 180 cuadros son **6.114 px de atraso**"; regla: "el seguidor no puede ser más lento que lo que persigue" | **Cerrado** |
| A4.2 | **Con atraso crítico hay que acelerar, no teletransportar**: el techo de 52 px/cuadro es inviolable. | `[M135]`: "El atraso crítico **no salta: acelera hasta el techo**… **52 px × 62,5 cuadros/s = 3250 px/s**, más rápido que los ~2500 px/s a los que corre el texto. Alcanza sin sacudir" | **Cerrado** (29/29; atraso final 0 px; salto máx 52 px) |
| A4.3 | **El componente debe llamar al módulo, no tener su copia inline.** | `[M120]`: "el componente no llama a `conducirSeguidor` del módulo. Tiene su propia copia inline (L1748-1808)"; fix: importar `atrasoCritico` en `ChatCenter.tsx` | **Cerrado**, con riesgo residual declarado: "si el chat sigue trancándose… hay una tercera copia del conductor que no encontré" (`[M120]`) |
| A4.4 | **`stream()` no debe abortar un turno ya cerrado**; solo si hay uno vivo. | `[M129]`: "`stream()` llama a `this.abort()` en la línea 646 antes de crear el nuevo controller… Si algo invoca `stream()` dos veces al arrancar… el segundo aborta el primero"; fix: `if (this.isProcessing) this.abort()` | **Cerrado** en `src/utils/engine.ts` |
| A4.5 | **El `catch` no puede morir en silencio cuando la señal está abortada**: debe llamar a `onError`. | `[M131]`: "el `catch` de `engine.ts:1134` **retorna sin llamar a `onError`** si la señal está abortada… el turno muere **en silencio**: no hay `onError`, no hay marcador, no hay nada" | **Identificado, NO corregido** (solo se corrigió el abort condicional) |
| A4.6 | **Un solo criterio de fallo para decidir el cambio de modelo**; `aborted`/`timeout` no son caída. | `[M131]`: "`esFalloDeComunicacion` ahora usa **un solo criterio**… `return cat === "cuota" || cat === "caida"`… `PATRON_FALLO_COM` quedó eliminado" | **Cerrado** (13/13, 18/18, 9/9, 21/21) |
| A4.7 | **El cambio de modelo debe ser explicable y legible en el log** (cuota vs caída), no magia. | `[M131]`: "si el modelo se sigue cambiando solo, el motivo estará en el log de terminal y ahora será legible (cuota o caída, con nombre)" | **Parcial** (criterio corregido; logging explícito no verificado) |
| A4.8 | **No dar por bueno lo que el validador marca en rojo**; el validador debe correr completo. | `[M134]` usuario (salida de `validar`): "VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 11564 comprobaciones y 1 suite(s) que NO llegaron a ejecutarse… ★ «parches»: ningún cuadro mueve la barra más de 52 px — máximo=1000.0"; `[M135]`: "El `validar` lo cazó" | **Cerrado** tras corrección; falta **re-ejecutar `npm run validar`** al cierre (`[M135]` lo pide) |

### A.5 Modelos, proveedores y relevo automático

| # | Requerimiento | Cita / contexto | Estado |
|---|---|---|---|
| A5.1 | **Proveedores que aguanten trabajo intensivo**: el plan gratuito de Gemini es diario y "no sirve". | `[M042]`: "Se agotó la cuota del plan GRATUITO de Gemini… el límite es DIARIO… No sirve como motor de trabajo intensivo. Opciones que sí aguantan: · GLM-4.7-Flash (Z.ai) — gratis y sin tope diario publicado · Cualquier modelo LOCAL de Ollama — sin cuota de ningún tipo" | Informativo / recomendación al usuario |
| A5.2 | **Fusible de cuota**: no volver a tentar modelos con cuota 0 (no transitoria). | `[M042]`: "El fusible ya sabía (no se volvieron a tentar 4 modelo(s)): gemini-flash-latest: cuota diaria agotada · gemini-3.1-pro-preview: cuota 0 en este plan (no es transitorio)…" | Ya existe; correcto |
| A5.3 | **Cadena de relevo de 5 intentos con favoritos**, con reenvío del mismo mensaje. | `[M121]`–`[M123]`, `[M131]`: "`App.tsx:3748` `colaDeMarcado(...)` — arma la lista de favoritos con clave… `:3759-3760` `setProvider` + `setCurrentModel` — **cambia el modelo**… `:3766` `setTimeout(600)` → reenvía el mismo mensaje" | Existe; corregido el criterio (A4.6) |
| A5.4 | **Errores de proveedor deben ser diagnósticos, no genéricos.** | `[M038]`: "«Failed to fetch» lo firma el navegador cuando no llega a POST /api/ai/stream… Comprobación de diez segundos: abre http://localhost:3000/api/coreo"; `[M044]` (Ollama frío) y `[M046]` (sin texto) ya traen guía | Buena base |
| A5.5 | **Arranque en frío de Ollama**: `num_ctx` por pedido, paralelismo/contexto global no aplicado por el BAT. | `[LOG:9]`–`[LOG:14]`: "El motor no lo arranco este BAT, entonces `OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_LOADED_MODELS` y `OLLAMA_CONTEXT_LENGTH`… NO le llegaron… La IDE manda `num_ctx` en cada pedido, que si le llega; lo que no le llega es el default global del server" | Documentado en el lanzador; **no resuelto** |
| A5.6 | **Timeout de primera respuesta distinto del de régimen** (arranque en frío). | `[M127]` causa 3: "Un timeout de primera respuesta demasiado corto. El arranque en frío tarda más que un turno normal" | **Propuesto, no implementado** |

### A.6 Creador de sitios (`creador-web`, 32 herramientas)

`[M102]`: "Miré el creador de verdad (`estado_creador` + `plantillas_disponibles`). Tiene 15 bloques, 9 paletas, 3 tipografías y 11 recetas."

| # | Requerimiento | Cita |
|---|---|---|
| A6.1 | **Bloque `precios` con jerarquía visual** (plan destacado: borde, badge "recomendado", escala 1.04). | "Hoy los tres planes se pintan iguales… sube la conversión más que cualquier otro cambio de una línea" |
| A6.2 | **`faq` con `<details>` nativo y JSON-LD automático** (`FAQPage` cableado solo). | "Ya tenés `generar_schema_jsonld` con `FAQPage`, pero no se cablea solo" |
| A6.3 | **Formulario con destino real desde el brief** (`accion_formulario`) + campo miel. | "`formulario_destino` existe pero es un paso manual… Hoy se entrega un formulario que no envía a ningún lado y el usuario lo descubre tarde" |
| A6.4 | **Imágenes con `loading="lazy"` y `width`/`height` desde el generador** (evitar CLS de fábrica). | "`preflight_rendimiento` las detecta, pero detectar no es arreglar" |
| A6.5 | **Tipo de sitio `blog`/`articulo`** con fecha, autor, tiempo de lectura y schema `Article`. | "Es el hueco más grande del catálogo" |
| A6.6 | **Verificación de rutas al entregar** (`crear_sitio` comprueba su propio CSS/JS relativo). | Ver A2.10 |
| A6.7 | **NO agregar** más paletas, más tipos de sitio ni frameworks. | "El cuello de botella no es variedad, es que los bloques que convierten no están pulidos" |

### A.7 Memoria, manuales y contexto del agente

| # | Requerimiento | Cita / contexto |
|---|---|---|
| A7.1 | **Memoria persistente entre sesiones** (`memoria.md` leída por el motor al arrancar). | `[M106]`: "¿La registro también en `memoria.md` para que se cargue sola al arrancar?"; `[LOG:70]`: "CEREBRO cargado: cerebro.md 51661 chars · memoria.md 536 líneas · historial 60" |
| A7.2 | **Manual de rutas** como documento vivo, con caso real medido y checklist ejecutable. | `[M092]` (`INFORME-RUTAS-SANDBOX.md`, 161 líneas, 13 citas de línea verificadas), `[M098]` (`RUTAS.md` 347 líneas, §10/§11/§13) |
| A7.3 | **Traspaso de sesión**: lo que costó tiempo, no un resumen bonito. | `[M100]`: "`TRASPASO-SESION.md` — 6 lecciones con evidencia medida, 3 defectos abiertos del juego y 4 mejoras propuestas al motor" |
| A7.4 | **Cobertura de manuales de herramientas**: 80 de 104 sin manual, incluidas `revisar_cambios` y `deshacer_cambios`. | `[LOG:98]`: "CATÁLOGO: 104 herramientas · con manual 24 · sin manual 80"; `[LOG:101]`: "⚠ Herramientas del hueso de obra sin manual: revisar_cambios, deshacer_cambios" |
| A7.5 | **Presupuesto de prompt bajo control**: el "ABORDAJE" mete 9179 chars de 9190 y el índice de 104 herramientas mide 6230 chars cuando la sonda pedía 800 (7,8×). | `[LOG:96]`, `[LOG:100]`: "Exceder es la conducta elegida por la casa —recortar una herramienta cuesta más que el char que ahorra—" |
| A7.6 | **Recorte de historial agresivo**: 25 → 24 mensajes, tope 24 y 220 000 chars. Riesgo de perder el hilo (se ve en la sesión: repite diagnósticos). | `[LOG:102]`: "Historial recortado: 25 mensajes → 24… Se conservan los más recientes" (39 ocurrencias en el log) |
| A7.7 | **Aduana de salida**: enmascara rutas del usuario (`C:\Use…dBox`) y avisa. | `[LOG:103]`, `[LOG:114]`: "cuerpo saliente: ruta_usuario×1 (avisado, baja, C:\Use…dBox) · ×15 repetida(s) en silencio" |
| A7.8 | **Resguardo de obra antes de operaciones grandes**: 27 archivos a `.cerebro-db/rescate-obras/<timestamp>`. | `[LOG:882]`: "RESGUARDO DE OBRA: 27 archivo(s) → …\.cerebro-db\rescate-obras\2026-11-08T06-53-54-022Z" |

---

## B) Diagnóstico de la "confusión de rutas al crear algo y su previsualización"

### B.1 Qué rutas se confunden (son cuatro raíces distintas, no dos)

| Raíz | Quién la usa | Evidencia |
|---|---|---|
| `C:\Cerebronico` | **Raíz de datos** y, a la vez, **raíz servida por el sandbox `:3500`** | `[LOG:1]` "Raiz de datos: C:\Cerebronico"; `[LOG:69]` "Raíz de datos: C:\Cerebronico (la raíz no ha cambiado)"; `[M093]` `raizEfectiva: C:\Cerebronico` |
| `C:\Cerebronico\<proyecto>\` (p. ej. `juego-autos\`) | Donde el agente *creía* que debía escribir | `[M094]`: "Yo estuve editando `juego-autos/` y el sandbox sirve la raíz"; `[M034]`: "El juego está en `juego-autos/`" |
| `C:\Users\BirdBox\Downloads\v1.09\CerebroNico-IDE-v1.0.9\` | **Instalación del IDE**: `src/`, `dist/`, tests, `runtime\python-embed` | `[LOG:21]`, `[LOG:67]` "run node dist/server.mjs"; `[M116]`, `[M135]` editan `src/engine/...` ahí |
| `dist/` vs `/src/*` del propio IDE | `:3000` sirve `dist/` en modo producción y **Vite sirve `/src/*` en desarrollo** | `[LOG:66]` "Si cambiaste codigo, recompila el frente con npm run build - aca se sirve dist/"; `[LOG:76]` "Cliente: Vite en modo DESARROLLO (NODE_ENV=development). Vite transforma y sirve /src/*" |

Es decir: **no es principalmente "absolutas vs relativas"**. Es **raíz de datos vs subcarpeta del proyecto** (el sandbox no baja de nivel), y encima **confusión de nivel de profundidad en los `src`**: el mismo `index.html` es correcto con `../vendor/three/three.module.js` dentro de `juego-autos/` y **roto** al copiarlo a la raíz, donde debe ser `./vendor/three/three.module.js`. Las absolutas y los `../` que escapan de la raíz sí existen como causa, pero producen **403** (no 404) por el guardia de L329.

### B.2 Síntomas concretos reportados por Mario

1. `[M015]`: "**esta pasando que se equivocan de ruta , en el sandbox esta la tarea anterior que era una app de quemar discos , no es nuestro juego**, luego que lo resuelvas anota en md donde estan las rutas relativas correctas".
2. `[M035]`: "tenemos problemas no se ve bien y cuando arranca se para y dice ganastes y nunca arranco, **no se ve la calle**" (síntoma de que se servía el HTML del quemador + el JS de otro proyecto).
3. `[M049]` / `[M055]` / `[M057]` / `[M063]` / `[M065]` / `[M067]` / `[M069]`: "se maneja solo", "cuando giras a la derecha el auto gira a la izquierda", "parece un tren por una vía". **Todos los arreglos de física se aplicaban a un `main.js` que el navegador no ejecutaba.**
4. `[M071]`: "ahora si, pero te quedo invertido, al doblar a la derecha dobla a la izquierda" — el coche se movía "marcha atrás" porque el modelo 3D tenía el morro en `-z` (`[M074]`: "el coche circulaba **marcha atrás**").
5. `[M117]` (otro subsistema, mismo patrón de "no se ve"): "el movimiento acendente del chat no se ha corregido".
6. `[M126]`: "se corta cuando recien abre, tengo que esperar a que se reconecte".

### B.3 Cadena causal exacta (ordenada por coste)

**Causa 1 — El sandbox sirve una sola carpeta, la raíz de datos, y no entra en subcarpetas.**
`[M094]`: "El endpoint confirma que el sandbox sirve `C:\Cerebronico` — la raíz de datos, **no** la carpeta del proyecto. Eso explica todo lo que venías viendo"; `[M098]`: "El sandbox `:3500` sirve **una sola carpeta**: la raíz de datos… Cualquier proyecto en subcarpeta **no se sirve**, y sus ediciones no se ven aunque el código sea correcto".

**Causa 2 — Dos proyectos superpuestos en la raíz servida, con archivos mezclados.**
`[M034]`: "En la raíz hay DOS juegos superpuestos: `main.js` de la raíz → **Ruta Turbo**… `index.html` de la raíz → **Quemador de CD** (importa `./cn-preview.js`)… `estilo.css` de la raíz → pertenece al quemador". Resultado: HTML de una app + JS de otra + CSS de otra. "se ve la página pero no hace nada" / "no se ve la calle".

**Causa 3 — Dos copias del mismo proyecto (`raíz\` y `raíz\juego-autos\`), y el agente editaba la equivocada.**
`[M094]`: "**Hay dos copias del juego**: una en `C:\Cerebronico\` (la raíz, que es la que se sirve) y otra en `C:\Cerebronico\juego-autos\`"; números medidos: `main.js` **37.825 B** en la raíz vs **25.450 B** en `juego-autos\`; `sonido.js` 12.270 B solo en la raíz; "**la raíz tiene los 11 arreglos; `juego-autos/` no tiene ninguno**". Esto explica ~20 turnos de "mis cambios no se aplican". `[M094]`: "Los «arreglos que no se aplicaban» de toda la sesión no eran el guardián revirtiendo: era que yo editaba `juego-autos/` mientras el navegador abría `C:\Cerebronico\`".

**Causa 4 — Nivel de profundidad del `importmap`/`src` al mover un proyecto de subcarpeta a la raíz.**
`[M034]`: "El importmap se ajustó de `../vendor/three/` a `./vendor/three/` (sin subir nivel)"; `[M034]`: "el `index.html` del juego… `three` → `../vendor/three/three.module.js` (sube un nivel y entra a `vendor/`) ✓" — correcto *solo* dentro de `juego-autos/`. Es la "confusión relativa/absoluta" real: **el mismo texto de ruta es válido o inválido según la profundidad de la carpeta que se sirve**.

**Causa 5 — El preview reescribe el `src` del `index.html` a `cn-preview.js`, y se retroalimenta.**
Síntoma repetido: `[M054]` "el `index.html` carga `./cn-preview.js`… Ese es el bug de fondo — el juego nunca se ejecutaba"; `[M074]` "**el `index.html` volvió a cargar `./cn-preview.js`**"; `[M078]` "Otra vez `cn-preview.js`"; `[M088]` "línea 109 volvió a `cn-preview.js`"; `[M090]` "Estaba en `cn-preview.js` otra vez: es la causa que reaparece y anulaba todos los arreglos".
Mecanismo, según el log: `Preview por «estatico-compilado»: Hay N fuente(s) que transpilar… se compila UNA vez con el esbuild de la IDE y se sirve el resultado` (`[LOG:215]`, `[LOG:255]`, `[LOG:292]`, `[LOG:314]`, `[LOG:354]`, `[LOG:386]`, `[LOG:408]`), seguido de `Vía rápida: ✔ bundle listo (./main.js → cn-preview.js)` (`[LOG:256]`, `[LOG:387]`, `[LOG:448]`, `[LOG:648]`, `[LOG:707]`) **y también** `bundle listo (./cn-preview.js → cn-preview.js)` **8 veces** (`[LOG:227]`, `[LOG:293]`, `[LOG:315]`, `[LOG:324]`, `[LOG:355]`, `[LOG:409]`, `[LOG:665]`, `[LOG:673]`): el pipeline toma como entrada **su propia salida**. El agente arregló el HTML 6 veces y el preview lo volvió a escribir; nunca tocó el pipeline. El modelo solo dejó la observación: "`cn-preview.js` es el que históricamente secuestraba el `index.html` — mientras esté ahí, el riesgo sigue" (`[M096]`).

**Causa 6 — El quirófano revierte tandas enteras, en silencio, y `write_file` reporta éxito.**
49 reversiones en el log (`[LOG:110]`, `[LOG:117]`, `[LOG:122]`, `[LOG:127]`, `[LOG:132]`, `[LOG:138]`, `[LOG:143]`, `[LOG:148]`, `[LOG:160]`, `[LOG:165]`, `[LOG:171]`, `[LOG:178]`, `[LOG:183]`, `[LOG:221]`, `[LOG:228]`, `[LOG:244]`, `[LOG:262]`, `[LOG:268]`…), con la misma firma: `CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S): main.js:137/611/634 [xss-innerhtml]`. En el hilo esto se vivió como "el guardián revirtió la edición" (`[M070]`: "Confirmado: **las dos ediciones se revertieron**. El archivo volvió a su estado previo"; `[M080]`: "Todo revertido… El guardián de ediciones está deshaciendo la tanda"; `[M086]`: "el guardián revirtió la edición (el archivo volvió a 946 líneas)").

**Causa 7 — Imports no resueltos por scripts de diagnóstico que quedan en la raíz.**
`[LOG:239]`: "Imports sin resolver: 3 · stubs creados: 0 · `test-pista.mjs` importa "./vendor/three/three.module.js" y NO existe · `verificar-abordo.mjs` importa "./node_modules/three/build/three.module.js" y NO existe · `_test_curva.mjs` importa "./vendor/three/three.module.js" y NO existe"; `[LOG:254]` y `[LOG:291]`, `[LOG:313]`, `[LOG:322]` repiten 1. Estos `.mjs` son **del propio agente** y bloquean la puerta de la tanda siguiente.

**Causa 8 — El "espejo" / segunda fuente de verdad del chat no se sirve igual.**
El log confirma `:3000` con dos modos: `dist/` servido por el server y `/src/*` transformado por Vite (`[LOG:66]`, `[LOG:76]`). Un cambio en `src/` **no se ve** si la app corre con `npm start` (que sirve `dist/`): hay un "espejo" compilado. Toda la segunda mitad de la sesión edita `src/**` y pide "reiniciá la IDE" — si el build no se rehace, el cambio no se aplica. Es la misma clase de error que el sandbox, pero en el frente del IDE.

### B.4 Qué arreglo propuso / empezó el modelo

- **Copiar el proyecto a la raíz servida** y ajustar el `importmap` sin `../` (`[M034]`) — hecho con `run_command` porque el quirófano bloqueaba `write_file`.
- **Borrar el duplicado obsoleto** (`juego-autos/`) tras verificar que no tenía archivos únicos (`[M096]`).
- **Versionar el saber**: `INFORME-RUTAS-SANDBOX.md` con las 5 causas (A: dos copias · B: `index.html` carga otro JS · C: `../`/absolutas → 403 · D: HTML vacío · E: service worker viejo), `RUTAS.md` con §8-bis (caso de las dos copias, con `/__cn_info` y detección en 10 s), §9 (regla "el proyecto va en la raíz servida"), §10 ("revisar el sandbox ANTES de servir"), paso 0 del checklist, y `memoria.md`.
- **Lo que NO arregló**: el pipeline de preview que reescribe el `src`; la política de `CERRADURA` sobre `innerHTML`; el aislamiento por proyecto del sandbox; el contrato de `write_file` cuando hay reversión.

### B.5 Contraste con la realidad del log (hallazgo propio de este análisis)

El modelo cerró el caso como "era yo editando la carpeta equivocada" (`[M094]`) y luego como "el quirófano revierte archivos seguros por imports nativos" (`[M112]`, `[M116]`). Ambas son ciertas **pero incompletas**: el log demuestra que la causa **más frecuente** de reversión no fue imports, sino **`CERRADURA` / `xss-innerhtml`** (49 tandas, 3 hallazgos cada una, siempre las mismas líneas de `main.js`). Y el `cn-preview.js` que "volvía" no era un misterio: **es la salida del propio compilador del preview**, que se escribe en el HTML y luego se recompila a sí misma. Cualquier plan de evolución que ignore esos dos puntos volverá a repetir la sesión.

---

## C) Estado al final de la sesión

### C.1 Versión exacta

- **IDE: `v1.0.9`** — `appVersion: "1.0.9"` en el export; instalación en `C:\Users\BirdBox\Downloads\v1.09\CerebroNico-IDE-v1.0.9` (`[LOG:21]`, `[LOG:67]`, `[LOG:325]` prompt final: `C:\Users\BirdBox\Downloads\v1.09\CerebroNico-IDE-v1.0.9>`); `npm run cerebronico-ide@1.0.9` (`[LOG:67]`).
- **Componente de chat**: el modelo describe reescrituras del autoscroll en **v1.67.1, v2.3.2, v2.3.9, v2.3.12, v2.3.17** y un contrato roto en **v1.98.0** (`[M118]`: "El autoscroll ya se reescribió varias veces (v1.67.1, v2.3.2, v2.3.9, v2.3.12, v2.3.17) y **el defecto sigue**"; `[M135]`: "Ese contrato existe porque el teletransporte por gota **fue el defecto original de v1.98.0**"). Son **numeraciones internas del componente**, no del producto: conviven con `1.0.9`. **No hay una versión de release nueva al cierre**: los cinco parches quedaron en el árbol de `src/` sin bump ni build publicado.
- **Modelo activo al exportar**: `deepseek-v4-1-flash-1017` (provider `mistral`); durante la sesión hubo relevos automáticos a `openrouter/auto`, `mistral-code-latest`, `mistral-code-fim-latest`, `glm-4.5-flash` (`[M121]`–`[M123]`).
- **Export**: `2026-11-08T06:53:44Z`. Última actividad del resguardo: `06:53:54Z`, 27 archivos (`[LOG:882]`).

### C.2 TERMINADO y verificado (con la evidencia que consta)

| Área | Qué quedó | Evidencia citada |
|---|---|---|
| Juego "Ruta Turbo" reconstruido | `index.html`, `estilo.css`, `autos.js` (8 modelos), `pista.js` (3 paisajes, `MEDIA_PISTA`), `sonido.js` (22 exports, 0 archivos externos), `main.js`, `vendor/three/` r169 | `[M104]`: "`node --check` 4/4 OK · 18/18 símbolos · 30/30 ids · CSS 100/100 · arrancar sobre la línea → 0 vueltas · 260 frames → 1 vuelta · 520 → 2 vueltas" |
| Meta (cruce de línea) | Detectada en el **envolvente de `t`** (0.99→0.0), no en 0.5 | `[M104]`, `[M112]` (A2) |
| A1 rival colisiona | Ya existía empuje real | `[M112]`: `main.js:659-662` |
| A2 `MEDIA_PISTA` | Derivada por `calcularFraccionMinima(curva)`, acotada 0.35–0.5 | `[M112]`: 9 OK / 0 fallas |
| A3 turbo con coste | Ya consumía/recargaba | `[M112]`: `:414` consumo, `:416` recarga |
| A4 log del quirófano | `registro-quirofano.cjs` → `logs/quirofano.log`, idempotente | `[M112]`; probado: anotó `REVERTIDA · registro-quirofano.cjs (nuevo, seguro)` |
| Quirófano: módulos nativos | `esModuloNativo()` + filtro en `findMissingImports` (`src/engine/importChecker.ts`) | `[M116]`: 0 falsos faltantes, 1 import roto real detectado, `quirofano.test.ts` **127 pass · 0 fail** |
| A5 autoscroll | `atrasoCritico` exportada + cableada en `ChatCenter.tsx`; **acelera al techo de 52 px**, no salta | `[M135]`: `seguidorHilo` **29 correctas · 0 fallos**, salto máx **52,0 px**, atraso final **0 px**; `quirofano` 130·0 |
| A6/A9 primer turno | `stream()` aborta solo si `isProcessing` (`src/utils/engine.ts`) | `[M129]`: cerrado / vivo → `aborted` correcto en ambos casos |
| A9 cambio de modelo | `esFalloDeComunicacion` unificado a `categoriaFallo`; `PATRON_FALLO_COM` eliminado (`src/utils/marcador.ts`) | `[M131]`: 13/13 · 18/18 · 9/9 · 21/21 |
| Documentación | `RUTAS.md` (347 líneas, 13 secciones), `INFORME-RUTAS-SANDBOX.md` (161 líneas, 13 citas de línea verificadas), `ERRORES-Y-ACIERTOS.md` (4 errores, 6 aciertos, 9 reglas), `memoria.md`, `TRASPASO-SESION.md` | `[M092]`, `[M098]`, `[M100]`, `[M112]`, `[M120]` |
| Limpieza de la raíz servida | `juego-autos/` borrado + scripts `_verif*`/`_acept*`/`_verificar*` | `[M096]`, con la corrección honesta en `[M096]`: "No inventé la lista de 30 `_verificar_audioN.cjs`" |

### C.3 PENDIENTE o a medias

| # | Pendiente | Evidencia |
|---|---|---|
| P1 | **Re-ejecutar `npm run validar` completo** tras el último parche. El fallo de `seguidorHilo` se corrigió y se midió 29/29, pero el veredicto global no se volvió a ver en el hilo. | `[M134]` (fallo), `[M135]`: "→ Listo: corré `npm run validar` de nuevo. Si sigue en rojo, pasame la línea exacta" |
| P2 | **Nada de lo parcheado se verificó en vivo**: chat tras reinicio, primer mensaje, cambio de modelo. | `[M131]`: "**No probé el chat en vivo**"; `[M120]`, `[M129]`: "reiniciá la IDE y probá" |
| P3 | **Política `CERRADURA` / `innerHTML`** (49 reversiones). Nunca se abrió como defecto. | `[LOG:110]` y siguientes |
| P4 | **El preview reescribe `index.html` → `cn-preview.js`.** Sin diagnosticar; `cn-preview.js`, `app.js`, `mate-3d/`, `grabador-cd/`, `app/`, `montana-rusa-3d.zip` siguen en la raíz servida. | `[M096]`: "**`cn-preview.js` es el que históricamente secuestraba el `index.html`** — mientras esté ahí, el riesgo sigue"; `[M054]`, `[M074]`, `[M078]`, `[M088]`, `[M090]` |
| P5 | **`catch` de `engine.ts:1134` retorna sin `onError`** cuando la señal está abortada (muerte silenciosa). Identificado, no corregido. | `[M131]` |
| P6 | **A10 pendiente** (queda listado como abierto en el registro, sin definir en el hilo). | `[M129]`: "A9 cerrado y su evidencia, **A10 pendiente**" |
| P7 | **Tercera copia del conductor del chat** sin descartar. | `[M120]`: "Si el chat sigue trancándose después del reinicio… hay una tercera copia del conductor que no encontré" |
| P8 | **Aislamiento del sandbox por proyecto** y **aviso de duplicado** (`/__cn_info` en UI): solo propuestos. | `[M100]` mejoras 1 y 2 |
| P9 | **Los 5 archivos `.md` que debían persistir** fueron revertidos y reescritos con `fs_write`; el estado final en disco depende de que el quirófano no los haya vuelto a tocar. El propio modelo lo admite: "solo queda `perfeccion.md`" en un momento dado. | `[M112]`: "Confirmado: solo queda `perfeccion.md`. Todos los `.md` que creé con `write_file` fueron revertidos" |
| P10 | **Defectos abiertos del juego** (declarados fuera de alcance): rival sin respuesta física real, `MEDIA_PISTA` número mágico, turbo infinito — luego A1/A2/A3 se cerraron en `[M112]`, pero el usuario nunca confirmó jugando. | `[M100]`, `[M112]` |
| P11 | **Nada commiteado**: no hay `git commit` en toda la sesión; los cambios viven en el árbol de trabajo. | no aparece `git_commit` en el hilo |

### C.4 Lectura de conjunto

El final de la sesión es **un cierre técnico en verde y un cierre de producto en rojo**: los cinco parches del IDE están aplicados y con pruebas unitarias verdes, pero (a) el validador global no se volvió a pasar, (b) nada se probó en la app real, y (c) las dos causas estructurales del sufrimiento (seguridad que revierte tandas + preview que reescribe el HTML) siguen intactas. El usuario cierra pidiendo exportar el chat "para futuras mejoras": **este documento es ese insumo**.

---

## D) Evolución / perfección y automejora automática

### D.1 Lo que el usuario pidió, literal

- `[M099]`: "voy a exportar el chat para futuras mejoras ,**quieres dejar algo para mejorar?**"
- `[M101]`: "**que mas podemos mejorar para crear mejor y mas serter**" (certero).
- `[M105]`: "porque se te borro? , es una falla que no se debe cometer , **dejar en md , todo error se deja registro en md para no volver a cometerlo, al igual que los aciertos para si volver a recordar como se hace, memoria persistente de automejora**".
- `[M109]`: "eso me gusto" (aprueba el registro con casillas).
- `[M111]`: "**se supone que tu sabes que es mal o bien, hazlo automatico, si esta mal corrije**".
- `[M113]`: "bien algo mas para corregir del funcionamiento del ide?"
- `[M130]`: "estas seguro de lo que hisistes? aveces se cambia solo de modelo que puede ser?" — control de calidad sobre el propio agente.

### D.2 Lo que el modelo construyó para automatizarlo

1. **Registro de errores y aciertos con evidencia obligatoria** (`ERRORES-Y-ACIERTOS.md`). Formato de cierre: casilla `[x]` + texto tachado + **fecha + qué se hizo + cómo se verificó**. Regla dura: "una casilla marcada sin evidencia es peor que una abierta" (`[M110]`). Al final: 4 errores con causa raíz, 6 aciertos con método, 9 reglas (`[M120]`).
2. **Reglas derivadas de cada error** (no "lecciones" genéricas):
   - "**Nunca `del` con comodines.** Listar con `dir /b <patrón>` primero" (`[M106]`).
   - "**Ningún informe de estado sin el comando que lo prueba pegado al lado**" (`[M106]`).
   - "**Paso 0: `/__cn_info` antes de tocar un archivo**" (`[M106]`).
   - "**lo que debe persistir se escribe con `fs_write`, no con `write_file`**" (`[M112]`).
   - "**el seguidor no puede ser más lento que lo que persigue**" y "**después de corregir una función, buscá sus copias**" (`[M120]`).
   - "**Un sandbox sucio no se nota: se sirve**" (`[M098]`).
3. **Memoria persistente entre sesiones**: `memoria.md` (536 líneas cargadas al arrancar, `[LOG:70]`) + `cerebro.md` (51.661 chars) + pack `memoria-hindsight` con 20 herramientas (`memory_guardar_aprendizaje`, `memory_aprender_de_error`, `memory_reflect`, `memory_repasar`, `memory_conflictos`, `memory_indexar_proyecto`…) (`[LOG:75]`).
4. **Consolidador del quirófano** (`registro-quirofano.cjs`): convierte `.cn-quirofano/ultima.json` en `logs/quirofano.log` acumulativo e idempotente, porque "el registro vive en `.cn-quirofano/ultima.json` y nadie lo lee" (`[M112]`).
5. **Bucle de trabajo con puertas propias** (visto en el log, no descrito por el modelo): `[bucle] B3 entrega incremental activada`, `[bucle] gate certeza telemetria {…erroresCompilacion, archivosSinExport, exportacionesRotas, presupuestoExcedido…}`, `[bucle] ▶️ contrato de aceptación abierto — auto-pregunta 1/3`, `[bucle] anuncio sin acción (pidió permiso para seguir) — re-empuje 1/3`, `[bucle] anuncio sin acción (el texto se corta a mitad de frase) — re-empuje 1/3` (`[LOG:107]`, `[LOG:236]`, `[LOG:459]`, `[LOG:216]`, `[LOG:414]`).
6. **Orquestador con leyes curadas**: "30 leyes curadas + 0 aprendidas · salud de la flota: 8 espejos medidos · equipo activo «todos» (13)" (`[LOG:72]`) — es decir, ya existe un mecanismo de "leyes" que **aprende 0**: el hueco está en cerrar el ciclo (ver D.3).
7. **Validador con veredicto único**: "11.564 comprobaciones", suites por módulo, "No se da nada por bueno mientras esto esté en rojo" (`[M134]`).

### D.3 Lo que falta para que la automejora sea real (brechas explícitas)

| # | Brecha | Por qué (evidencia) |
|---|---|---|
| D1 | **El registro no se escribe donde sobrevive.** Se documentó el error… y el propio registro fue revertido tres veces. | `[M112]`: "`ERRORES-Y-ACIERTOS.md` tampoco existe: el quirófano lo revirtió igual" |
| D2 | **La lección no se convierte en regla ejecutable.** "Nunca `del` con comodines" es un texto en un `.md`; nada impide que el agente vuelva a ejecutar `del /q *`. | `[M106]` vs `[LOG:73]` (herramientas sin manual: `revisar_cambios`, `deshacer_cambios`) |
| D3 | **`0 leyes aprendidas`**: el orquestador mide pero no promueve errores a leyes. | `[LOG:72]` |
| D4 | **El agente afirma antes de verificar y luego se corrige** (3 veces en la sesión). | `[M102]`: "eso era falso"; `[M131]`: "No, no estaba seguro, y tenías razón en dudar"; `[M116]`→`[M112]` (QF_SKIP) |
| D5 | **Un fix en un módulo que nadie llama no es un fix**: falta verificación de "¿quién llama a esta función?" antes de declarar cerrado. | `[M120]` |
| D6 | **Dos criterios para el mismo hecho** (marcador): falta detector de duplicación de criterios/lógica. | `[M131]`: "dos criterios distintos para el mismo hecho" |
| D7 | **El bucle pide permiso cuando debería actuar, y actúa cuando debería pedirlo.** "anuncio sin acción (pidió permiso para seguir) — re-empuje" (`[LOG:216]`), frente a `del /q *` sin listar (`[M106]`). | `[M111]` (usuario pide automatismo) |
| D8 | **El contrato de aceptación se abre pero no siempre se cierra** ("auto-pregunta 1/3", "2/3"…). | `[LOG:459]`, `[LOG:697]` |
| D9 | **El validador no corre antes de declarar "listo"**: el fallo de 1000 px lo cazó el usuario, no el agente. | `[M134]`, `[M135]`: "El `validar` lo cazó" |
| D10 | **La métrica de "archivos sin export" marca HTML/CSS/`.md`** como sospechosos (`archivosSinExport: 1…9` en `[LOG:236]`, `[LOG:288]`, `[LOG:351]`): ruido que erosiona la confianza en la telemetría. | `[LOG:236]` |

### D.4 Propuesta de arquitectura de automejora (derivada de la sesión)

Ciclo cerrado de 6 pasos, cada uno con artefacto verificable:

1. **Detectar** (telemetría del bucle + validador + log del quirófano + errores del proveedor).
2. **Reproducir** (test que falle; sin test no hay fix — A3.3).
3. **Localizar todas las copias** (`grep` de la función y de su lógica; A3.4).
4. **Corregir respetando el contrato** de las suites existentes (A3.5).
5. **Validar completo** (`npm run validar`; prohibido declarar cierre sin verde; `[M134]`).
6. **Persistir** en tres sitios: `ERRORES-Y-ACIERTOS.md` (caso), `memoria.md` (regla), y **una ley ejecutable** en el orquestador (hoy 0 aprendidas).

Regla de oro que la sesión demuestra: **el sistema debe preferir exponer el estado real (raíz servida, archivo servido, veredicto del quirófano) antes que "arreglar" en silencio**. Las tres causas más caras fueron mecanismos que **ocultaban** información: `write_file` devolviendo éxito tras revertir, el preview reescribiendo el `src`, y el sandbox sirviendo otra carpeta sin decirlo.

---

## E) Otras necesidades de evolución mencionadas

### E.1 Proveedores y modelos

- **Catálogo real usado en la sesión** (por los mensajes de error): `glm-5-2`, `zai-glm-5-2`, `glm-4.5-flash` (Z.ai), `deepseek-v4-1-flash-1017`, `deepseek-v4-pro` (DeepSeek), `gemini-2.5-flash`, `gemini-3.5-flash`, `gemini-3.8-flash`, `google/gemma-3-27b-it` (OpenRouter), `openrouter/auto`, `mistral-code-latest`, `mistral-code-fim-latest`, `qwen2.5:0.5b` (Ollama local). **44 modelos locales** disponibles (`[LOG:19]`).
- **Fallos dominantes de la sesión**: `Insufficient Balance` (DeepSeek), `Rate limit exceeded` / `429` (Mistral/Z.ai), cuota diaria Gemini agotada, `ECONNRESET` / `Failed to fetch`, timeout de modelo local frío (`[M010]`–`[M046]`, `[M121]`–`[M123]`). **Casi la mitad de los turnos del primer tercio son errores de proveedor, no trabajo.** Requisito implícito: **resiliencia de proveedor** (relevo sin abortar el turno, estado legible, fusible persistente).
- **Proveedores gratuitos que aguantan** (recomendación explícita del IDE, `[M042]`): `GLM-4.7-Flash` (Z.ai) "gratis y sin tope diario publicado"; cualquier modelo **local de Ollama** "sin cuota de ningún tipo". El plan gratuito de Gemini se declara inservible para trabajo intensivo.
- **Contexto del motor local**: `num_ctx` por pedido sí llega; los defaults globales (`OLLAMA_NUM_PARALLEL`, `OLLAMA_MAX_LOADED_MODELS`, `OLLAMA_CONTEXT_LENGTH`) no, si el server no lo arrancó el BAT (`[LOG:9]`). Necesidad: **aplicar esos parámetros desde la IDE** (o reiniciar el server propio) y avisar en UI. Hay botón "Expulsar" en la pestaña Puertos como mitigación de RAM (`[LOG:15]`).

### E.2 MCP y packs externos

- Pack **`puente-mcp`** (7 herramientas: `exec, fs_delete, fs_list, fs_mkdir, fs_read, fs_write, fs_write_b64`), sobre `agent_bridge_5000.py` en `:5000`, 100 % stdlib (`[LOG:32]`, `[LOG:92]`). Arranque con **12 reintentos cada 5 s** (`[LOG:73]`, `[LOG:87]`).
- Pack **`creador-web`** (32 herramientas) en `:5102` y **`memoria-hindsight`** (20) en `:5100`/`:5103` (`[LOG:74]`, `[LOG:75]`).
- **Fricción detectada**: `[LOG:73]` "Pack «puente-mcp» aún no responde… normal si el servicio está arrancando" — el mensaje es correcto, pero **el primer turno ya se está enviando** mientras el pack no está listo (ver A5.6 / F6).
- **Duplicidad de vías de escritura**: `write_file` (sandbox, con quirófano) vs `fs_write` (puente real, sin quirófano) vs `run_command`/`node` (sin guardia). Esto **es** un agujero de seguridad y la causa de que el agente "rodee" el guardián. Requisito: **una sola vía de escritura, con puertas, y una vía explícita y auditada de excepción**.
- **`ingresar_archivo_workspace` / `promover_archivo_sandbox`** existen en el catálogo pero **sin manual** (`[LOG:98]`): son justo las herramientas que resuelven el paso workspace→sandbox, y nadie sabe usarlas. Eso alimenta la confusión de rutas.

### E.3 Puertos, procesos y arranque

Mapa de la casa (`[LOG:78]`–`[LOG:85]`), 7 puertos, fuente única `src/constants.ts`:

| Puerto | Servicio | Ciclo de vida |
|---|---|---|
| `:3000` | IDE (Express + cliente; `dist/` o Vite `/src/*`) | nace con el proceso |
| `:3500` | **Sandbox (preview)** | **bajo demanda**, "nace al abrir el preview" |
| `:5000` | Puente PC (Python) | hijo del server |
| `:5100` | Memoria híbrida | lo levanta el lanzador |
| `:5102` | Creador de sitios | lo levanta el lanzador |
| `:5103` | Motor del cerebro | bajo demanda |
| `:11434` | Ollama | proceso de la máquina |

Necesidades: **saneo de puertos** ya existe ("saneando puertos propios ocupados…"); `:3500` **apagado es normal**, lo que hace que el usuario no sepa si el preview está sirviendo o no. Requisito: **estado visible del sandbox en la UI** (arriba/abajo, raíz servida, archivo servido, hora del último bundle).

### E.4 Build y "espejo" del frente

`[LOG:65]`: "Abriendo RAPIDO: server y cliente ya compilados (npm run start)". `[LOG:66]`: "Si cambiaste codigo, recompila el frente con `npm run build` - aca se sirve `dist/`". `[LOG:76]`: "Vite en modo DESARROLLO… sirve `/src/*`". → **Dos modos conviven y no se distinguen en la UI**; parchear `src/` y reiniciar no basta si corre `npm start` sobre `dist/`. Es el mismo patrón "espejo" que el sandbox: **fuente vs artefacto**. Requisito: la IDE debe decir **qué build está sirviendo** y avisar si `src/` es más nuevo que `dist/` (detección por `mtime`, trivial).

### E.5 Producto / UX

- **Chat**: autoscroll (A4), primer turno (A4.4/A4.5), cambio de modelo silencioso (A4.6).
- **Planificador**: tareas que quedan sin tachar y el turno se corta por presupuesto de pasos (`[M003]`: "Quedaban acciones pendientes (`auditar_pagina`) cuando se agotó el presupuesto de pasos"; `[M036]`: "El plan no quedó cerrado — 4 etapa(s) sin tachar"). Requisito: **presupuesto de pasos visible y reanudable** (hoy depende de que el usuario escriba "sigue").
- **Mensajes de "MARCADOR AUTOMÁTICO"** aparecen como mensajes del asistente en el hilo (`[M010]`–`[M015]`, `[M121]`–`[M123]`): contaminan la conversación exportada y el contexto. Requisito: **evento de sistema, no burbuja de asistente**.
- **Aduana de salida**: enmascara rutas, pero repite el aviso hasta 15 veces (`[LOG:114]`): ruido.
- **Resguardo de obra** antes de operaciones grandes: buena práctica ya presente (`[LOG:882]`).

### E.6 Creador de sitios

Ver A6.1–A6.7 (jerarquía de precios, FAQ + schema, formulario real, imágenes lazy con dimensiones, tipo `blog`, verificación de rutas, y **no** sumar variedad).

---

## F) Lista priorizada de acciones concretas de código

Ordenadas por retorno esperado / coste. "AC" = criterio de aceptación verificable.

### P0 — Bloqueantes de confianza (sin esto, todo lo demás se repite)

**F1. Reversión por archivo + veredicto en la respuesta de escritura.**
- `src/engine/quirofano.ts` → `cerrarOperacion()`: en vez de revertir la tanda, revertir **solo los archivos con `veredicto.bloquea === true`**; devolver `{ archivos: [{path, ok, motivo, puerta}], revertidos: [...] }`.
- `write_file` (tool del server) debe devolver `ok:false` + `revertidos[]` cuando hubo reversión, y **nunca** "éxito" si el archivo no está en disco (verificar `fs.stat` después de escribir).
- AC: un lote con `.md` válido + `.cjs` que importa `node:fs` deja el `.md` en disco y reporta el `.cjs` como revertido con motivo. Test nuevo "lote mixto" en `tests/quirofano.test.ts`.

**F2. Política de `CERRADURA` para `innerHTML` (49 reversiones).**
- Puerta de seguridad (`CERRADURA`): `[xss-innerhtml]` debe ser **CRÍTICO solo si el dato es externo** (fetch, `location`, `localStorage`, input de usuario). Para plantillas locales constantes: **AVISO**, no bloqueo. Si no se puede inferir el origen, bloquear **solo el archivo**, nunca la tanda.
- Añadir `// cn-allow: xss-innerhtml <motivo>` con registro en el log del quirófano, y un `.cn-seguridad.json` por proyecto para allowlist de patrones.
- AC: `main.js` del juego (HUD con `innerHTML` de plantillas propias) pasa; un `innerHTML = location.hash` sigue bloqueado. Test con los dos casos.

**F3. El preview deja de reescribir el `index.html` fuente.**
- En el pipeline de `:3500` (`cn-static-server.cjs` + compilador "estatico-compilado"): **no** persistir el cambio de `src` en el archivo del usuario. Servir el bundle en una ruta virtual (`/__cn_bundle.js`) e **inyectar el `<script>` en tiempo de respuesta** (transform on serve), o generar `index.preview.html` aparte.
- Guarda: si `entrada === salida` (`./cn-preview.js → cn-preview.js`), **abortar con error explícito** en vez de rebundlear (ocurrió 8 veces, `[LOG:227]`…).
- AC: 10 previews consecutivos no modifican el `index.html` (md5 estable); el log nunca muestra `(./cn-preview.js → cn-preview.js)`.

**F4. Estado del sandbox visible + detección de duplicado.**
- `GET /__cn_info` ya existe → consumirlo en la **cabecera del preview**: `sirviendo C:\Cerebronico · index.html (hash) · bundle de 06:53`.
- Al arrancar el sandbox: si existe `<raíz>/<carpeta>/index.html` **y** `<raíz>/index.html`, mostrar banner ámbar "dos copias: editás X, se sirve Y" (3 líneas, `[M100]`).
- AC: el usuario ve la raíz efectiva sin abrir DevTools; el caso `juego-autos/` se detecta al instante.

**F5. Una sola vía de escritura.**
- Deprecar `run_command`/`node -e` como vía de parcheo y `fs_write` como "puente real": exponer **`pc_write_file` auditado** (ya está en el catálogo, sin manual) con las mismas puertas, y un modo `--mantenimiento` explícito para parchear el motor (backup + reinicio).
- AC: el agente no necesita rodear el guardián; toda escritura deja línea en `logs/quirofano.log`.

### P1 — Estabilidad del chat y del agente

**F6. `engine.ts`: no morir en silencio.**
```ts
catch (e) {
  const abortado = (e as any)?.name === "AbortError";
  this.isProcessing = false;                              // siempre, en finally
  if (abortado && this.abortReason === "usuario") return;  // cancelación pedida
  this.onError(e);                                        // cualquier otro abort SÍ se reporta
}
```
- AC: abort interno → `onError` una vez; cancelación del usuario → sin error visible.

**F7. `marcador.ts`: criterio único (ya hecho) + log.**
- Emitir `console.info("[marcador] relevo %s → %s motivo=%s", from, to, cat)`.
- AC: cada cambio de modelo tiene una línea con `cuota|caida`; ningún `aborted|timeout` dispara relevo.

**F8. Autoscroll: fuente única.**
- Borrar la copia inline de `ChatCenter.tsx` (L1748-1808) y usar **solo** `seguidorHilo.ts`; envolver el contenedor en `ResizeObserver` y llamar al seguidor en cada resize, no en cada token.
- Mantener `PASO_MAXIMO_PX = 52` como invariante y `atrasoCritico` acelerando al techo (`[M135]`).
- AC: `seguidorHilo` 29/29; atraso final 0 px con texto a 40 px/cuadro; salto máximo ≤ 52 px.

**F9. `importChecker`: no bloquear por archivos que no son del proyecto.**
- Ignorar por defecto: `_*.{mjs,cjs,js}`, `*.test.*`, `tests/**`, `_verif*`, `_acept*`, `verificar-*.{mjs,cjs}`, y cualquier archivo fuera de `src/` o de la carpeta de entrada declarada.
- AC: `_test_curva.mjs` en la raíz **no** aparece como "imports sin resolver" (`[LOG:239]`); un import roto en `src/` sigue detectándose.

**F10. Herramientas críticas con manual.**
- Manual de `revisar_cambios`, `deshacer_cambios`, `ingresar_archivo_workspace`, `promover_archivo_sandbox`, `abrir_previsualizador` (`[LOG:98]`, `[LOG:101]`). Son las que evitan el 80 % de los errores de ruta/estado.
- AC: "sin manual 80" → "sin manual ≤ 20"; el ABORDAJE no crece más de 200 chars.

**F11. Borrado seguro.**
- `fs_delete` y `exec`: bloquear comodines sobre la raíz servida; exigir `dry_run` que devuelva la lista de coincidencias y un `confirmToken` para ejecutar. (Coste real de no tenerlo: el proyecto entero, `[M106]`.)
- AC: un patrón con comodín en `C:\Cerebronico` devuelve la lista y no borra; el borrado por nombre exacto funciona.

### P2 — Perfección de producto

- **F12. Build/espejo visible**: mostrar si se sirve `dist/` o `/src/*` y avisar cuando `src/` es más nuevo que `dist/` (`mtime`). Evita el "reinicié y no cambió nada".
- **F13. Sandbox por proyecto**: `sandboxRoot = workspaceRoot/proyecto` con fallback a la raíz de datos; migrar `:3500` a montaje por sesión. Es la cura de fondo de B.1.
- **F14. Promoción de lecciones a leyes**: al cerrar un error en `ERRORES-Y-ACIERTOS.md`, el orquestador debe poder crear una ley ejecutable (hoy "30 curadas + **0 aprendidas**", `[LOG:72]`). Formato: `cuando <patrón de acción> entonces <guardia>`.
- **F15. Registro append-only fuera del alcance del quirófano**: `logs/aprendizaje/*.jsonl` escrito por el puente, para que un revert no borre la memoria (pasó 3 veces).
- **F16. Presupuesto de pasos reanudable**: que el plan sobreviva al corte sin exigir "sigue" del usuario (`[M003]`, `[M036]`).
- **F17. Mensajes de sistema fuera del hilo**: `MARCADOR AUTOMÁTICO` como evento, no burbuja (`[M010]`–`[M015]`).
- **F18. Creador**: precios con jerarquía, `faq` + JSON-LD, `accion_formulario` en el brief, `lazy` + dimensiones, tipo `blog`, verificación de rutas al entregar (`[M102]`).
- **F19. Historial**: resumir en vez de truncar a 24 mensajes (39 recortes en una sesión, `[LOG:102]`); el hilo perdió contexto varias veces.
- **F20. Ollama**: timeout de **primer byte** separado del de régimen; persistir el fusible de cuota; exponer "salud de la flota" (hoy 8 espejos medidos, `[LOG:72]`).

### Orden de ejecución sugerido

1. **F3 + F4** (elimina el bucle "no se ve") →
2. **F1 + F2** (elimina el "write_file miente") →
3. **F6 + F7 + F8** (chat estable) →
4. **F9 + F10 + F11** (higiene del agente) →
5. **F12 + F13** (aislamiento real) →
6. **F14…F20** (perfección).

Cada punto debe entrar con **test que falle primero** (regla A3.3) y **`npm run validar` en verde** antes de cerrar (regla `[M134]`).

---

## Anexo 1 — Índice de citas clave

| Ref | Rol | Contenido citado (extracto) |
|---|---|---|
| `[M015]` | usuario | "se equivocan de ruta , en el sandbox esta la tarea anterior que era una app de quemar discos , no es nuestro juego" |
| `[M034]` | asistente | "En la raíz hay DOS juegos superpuestos"; "El importmap se ajustó de `../vendor/three/` a `./vendor/three/` (sin subir nivel)" |
| `[M042]` | asistente | cuota gratuita Gemini; "GLM-4.7-Flash (Z.ai) — gratis y sin tope diario publicado"; Ollama local |
| `[M054]` | asistente | "el `index.html` carga `./cn-preview.js`… el juego nunca se ejecutaba" |
| `[M070]` | asistente | "las dos ediciones se revirtieron"; "el `index.html` de la raíz puede no ser el que sirve el :3500" |
| `[M090]` | asistente | "Estaba en `cn-preview.js` **otra vez**: es la causa que reaparece y anulaba todos los arreglos" |
| `[M092]` | asistente | las 5 causas (A dos copias · B otro JS · C `../`/absolutas→403 · D HTML vacío · E service worker) |
| `[M093]` | usuario | JSON de `/__cn_info`: `raizEfectiva: C:\Cerebronico` |
| `[M094]` | asistente | "el sandbox sirve `C:\Cerebronico` — la raíz de datos, **no** la carpeta del proyecto"; "11 arreglos vs 0" |
| `[M096]` | asistente | regla de oro de la raíz; "`cn-preview.js` es el que históricamente secuestraba el `index.html`" |
| `[M098]` | asistente | "Un sandbox sucio no se nota: se sirve" |
| `[M100]` | asistente | 4 mejoras al motor + 3 defectos abiertos del juego |
| `[M102]` | asistente | "El juego ya no existe"; 5 mejoras al creador; verificación de rutas al entregar |
| `[M105]` | usuario | "memoria persistente de automejora" |
| `[M106]` | asistente | "Nunca `del` con comodines"; "Ningún informe de estado sin el comando que lo prueba" |
| `[M110]` | asistente | A1–A4 abiertos; formato de cierre con evidencia |
| `[M111]` | usuario | "hazlo automatico, si esta mal corrije" |
| `[M112]` | asistente | "el quirófano revierte archivos que él mismo califica de «seguro»"; "se escribe con `fs_write`" |
| `[M116]` | asistente | cadena del quirófano; `esModuloNativo`; 127 pass; "el quirófano se revertiría a sí mismo" |
| `[M118]` | asistente | 3 causas del autoscroll; "la velocidad de seguimiento es menor que la de crecimiento del texto" |
| `[M120]` | asistente | copia inline en `ChatCenter.tsx`; 6114 px vs 771 px; reglas nuevas |
| `[M131]` | asistente | `PATRON_FALLO_COM` (`credits?`, `timed? ?out`); criterio único; `catch` sin `onError` |
| `[M134]` | usuario | `VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 11564 comprobaciones`; "ningún cuadro mueve la barra más de 52 px — máximo=1000.0" |
| `[M135]` | asistente | "acelera hasta el techo"; 29/29; atraso 0 px; "El `validar` lo cazó" |
| `[LOG:76]` | log | "Vite en modo DESARROLLO… sirve `/src/*`" |
| `[LOG:98]` | log | "104 herramientas · con manual 24 · sin manual 80" |
| `[LOG:110]` | log | primera de 49 reversiones por `CERRADURA` (`xss-innerhtml`) |
| `[LOG:215]` | log | "Preview por «estatico-compilado»" |
| `[LOG:227]` | log | "bundle listo (./cn-preview.js → cn-preview.js)" |
| `[LOG:239]` | log | "Imports sin resolver: 3 … `_test_curva.mjs` …" |
| `[LOG:882]` | log | "RESGUARDO DE OBRA: 27 archivo(s)" |

## Anexo 2 — Cobertura y límites del análisis

- **Leído íntegro**: M000–M015, M034–M042, M048–M050, M070, M090–M135; el volcado completo de los 136 mensajes quedó disponible para grep. Los mensajes M016–M089 se revisaron por índice, longitud y grep dirigido (son en su mayoría errores de proveedor y micro-arreglos de física del juego, no del IDE).
- **El log no es JSON**: se procesó como texto (CRLF→LF); sus 883 líneas se clasificaron por etiqueta (`QUIRÓFANO`, `aduana`, `bucle`, `Preview`, `Imports sin resolver`, `ABORDAJE`, `Historial recortado`).
- **Inferencias marcadas**: B.3 causa 5 (el preview reescribe el `src`) es una **correlación fuerte** entre el síntoma repetido 6 veces y 13 líneas de log del compilador; no hay en la sesión una lectura del código del sandbox que lo confirme línea a línea. Debe confirmarse en `cn-static-server.cjs` / pipeline de preview antes de dar por cerrada F3.
- **No se modificó ningún archivo de origen**; este informe es el único artefacto creado.

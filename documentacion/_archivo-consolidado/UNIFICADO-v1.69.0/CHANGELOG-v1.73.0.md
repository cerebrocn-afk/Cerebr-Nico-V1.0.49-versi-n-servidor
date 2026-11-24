# v1.73.0 · 2026-10-26 · LA BARRA DEL AGENTE TIENE CASA, EL CHAT TIENE CARPETA Y LA INTERFAZ RESPIRA

Entrega pedida con seis capturas y una sesión exportada (`cerebronico-ide-sesion-1792972925054.json`)
donde Zai empezó y **se cortó tres veces** sin poder tocar la interfaz. Todo lo que
esa sesión prometió "por comandos" hoy existe como botón, panel o default.

Regla de la casa respetada en cada línea: **server.ts no crece** (12.054 → 12.059:
solo `import` + registro); el dominio nuevo nace y vive en su suite.

---

## 1 · CANAL DIRECTO — carpeta o .ZIP de proyecto, desde el chat, sin restricciones

El hecho que motivó todo (sesión 1792972925054): el modelo respondió
*«No puedo acceder directamente a `C:\Users\...\cerebro fotos` debido a restricciones»*,
porque el puente :5000 solo escribe dentro de sus raíces y no existía ningún botón
para autorizar una carpeta. Zai improvisó un "protocolo de comandos": un parche, no una función.

**Ahora es una función, en tres piezas:**

- **Suite nueva** `server/routers/carpetaProyecto.ts` (335 líneas, fuera del monolito):
  - `GET /api/carpeta/estado` — la vinculación sobrevive recargas (estado en
    `.cerebro-db/carpeta-vinculada.json`, la convención de la casa).
  - `POST /api/carpeta/explorar` — navegador real de los discos del equipo (la IDE
    corre en localhost: el sistema de archivos del usuario ES el del server).
  - `POST /api/carpeta/vincular` — escanea **sin copiar un solo byte** (topes:
    20.000 archivos / 2 GB / 1.500 rutas de muestra), añade la ruta a
    `raices_extra` de `puente-permitidos.json` y la promueve a raíz de trabajo.
  - `POST /api/carpeta/vincular-zip` — el .zip viaja en base64 (límite JSON 128 MB),
    se materializa en `.vinculadas/<nombre>-<ts>/` con protección zip-slip y queda
    vinculado igual que una carpeta.
  - `POST /api/carpeta/desvincular` — devuelve `raices_extra` a su estado anterior.
  - **Guardas honestas**: raíz de unidad, `C:\Windows`, Program Files, `/etc`,
    `/usr` y el HOME suelto quedan VETADOS como "proyecto". No es desconfianza del
    usuario: es que vincular el disco entero es una autopsia.
- **Selector en el compositor** (`CarpetaProyectoModal.tsx`): botón verde
  **Carpeta+** junto al clip. Explora, doble clic para vincular, o sube el .zip.
  Al vincular pide `POST /api/bridge/restart` (el puente lee su config al nacer:
  sin reinicio, la raíz nueva no rige hasta el próximo arranque — hecho, no misterio).
- **Inyección en el system prompt** (App.tsx → `extraParts`): cada turno lleva la
  ruta como `CARPETA DE TRABAJO VINCULADA (CANAL DIRECTO)` con la instrucción
  explícita de NO pedir autorización, NO copiar al workspace y NO negar acceso.
  Chip verde con el nombre de la carpeta en la barra del chat, clic = gestionar.

## 2 · LA BARRA DEL AGENTE SE MUDÓ AL PANEL DE TAREAS (pedido con captura 2)

El bloque «ACCIONES EJECUTADAS (agente 5000) sin costo de LLM» ocupaba la columna
entera del chat en cada tanda. Pedido: *«que se abra abajo o a la derecha, en el
apartado de Tareas, como en la segunda imagen»*.

- El chat ya no pinta ese bloque (cero bytes en la columna).
- `PlanificationPanel` (Tareas / Hoja de Ruta Activa, arriba a la derecha) recibe
  `acciones` (el MISMO `actionLog` que veía el chat — una fuente, no dos) y muestra
  `⚡ ACCIONES (agente 5000)` con ✓/✗, herramienta y detalle truncado (últimas 14).
- **Autoapertura con anti-rebote de 6 s**: cuando el motor empieza una tanda nueva,
  la barra aparece sola; el usuario no persigue al agente, el agente se presenta.

## 3 · INTERRUPTORES OBSOLETOS: ACTIVADOS SIEMPRE, BOTÓN FUERA (captura `areglo.jpg`)

- **TURBO**: *«dejalo siempre activo y quita el botón»*. `TURBO_MOTOR` nace en
  `true` en el motor (`src/engine/reflejo/espejos.ts`); el botón, el localStorage
  `codigo0_turbo` y el POST `/api/consejo/turbo` desde la UI murieron. EndPoint
  conservado por compatibilidad/tests, sin llamadores.
- **Agente PC**: nace **ON** por defecto (default de la tecla guardada es `"1"`);
  quien lo apagó a propósito conserva su decisión. El interruptor queda solo como
  freno de emergencia dentro del menú «Ajustes» del chat.
- **Pensar**: default de fábrica `profundo` (antes `auto`). **Razonar Gemini**:
  default `alto` (antes `bajo`). Quien ya eligió conserva su valor guardado.

## 4 · LIMPIEZA DE INTERFAZ — la mayoría de opciones al menú desplegable

**Barra superior** quedó solo para: panel izquierdo, marca + **menú CN**, telemetría
de puertos, monitor IDE/PC, pantalla completa, Editor web y panel derecho.

Al **menú CN** (sección «Ajustes rápidos») se mudaron, con los MISMOS handlers:
tamaño de texto, memoria de conversación, modo 8 GB, Consejo Agéntico, asistente
Z.ai («esto es para la API, pero en el selector ya está») y el selector de voz (TTS).

**Barra del chat**: salió el chip duplicado del modelo («ya está aquí» — la píldora
del compositor); salió el cartel fijo «Historial Total Activo» (un estado permanente
no es una señal); Agente PC / Pensar / Razonar / Editor se plegaron en un único
**«Ajustes»** desplegable que resume el estado en una línea.

**Abajo-izquierda**: la barrita «Ambiente ON» + slider con la X roja desapareció.
El `AudioAmbiente` sigue montado y mudo; se enciende desde el menú CN por el evento
`cerebronico:ambiente-toggle`.

## 5 · VOLUMEN DEL AMBIENTE — recorte extra del mismo día

«BAJA BASTANTA MAS EL VOLUMEN DEL SONIDO AMBIENTE, ESTA MUY ALTO». Segundo recorte
del techo maestro: **0.45 → 0.12** (casi 4 veces menos que hoy, 7 menos que la
escala original). Como el techo se aplica después del slider guardado, alcanza a
todos sin borrar la perilla de nadie.

## 6 · VERIFICACIÓN

- `tsc --noEmit`: **0 errores** (exit 0).
- `server.ts`: **12.059 líneas** (≤ presupuesto 12.187; el trinquete histórico
  <12.287 también aguanta). Crecimiento: 6 líneas = 2 comentarios + import + registro.
- `npm run superficie`: contrato regenerado **154 rutas** (+5 nuevas de la suite).
- `npm run validar`: ver pie de esta entrega.

## 7 · ARCHIVOS TOCADOS

| Archivo | Qué |
|---|---|
| `server/routers/carpetaProyecto.ts` | **NUEVO** — suite Canal Directo (5 rutas) |
| `server.ts` | +2 líneas efectivas: import y `registrarCarpetaProyecto(...)` |
| `src/components/CarpetaProyectoModal.tsx` | **NUEVO** — selector carpeta/ZIP |
| `src/components/ChatCenter.tsx` | Canal Directo (botón+chip), menú Ajustes, fuera modelo duplicado, fuera ACCIONES inline, fuera cartel Historial |
| `src/components/Header.tsx` | Fuera Turbo/Z.ai/Consejo/selectores/TTS de la barra; sección «Ajustes rápidos» en menú CN |
| `src/components/PlanificationPanel.tsx` | Recibe `acciones`, feed del agente 5000, autoapertura |
| `src/components/AudioAmbiente.tsx` | `oculto` + evento de toggle + techo 0.12 |
| `src/engine/reflejo/espejos.ts` | `TURBO_MOTOR = true` |
| `src/utils/proSettings.ts` | Defaults: `profundo` / `alto` |
| `src/App.tsx` | Estado Canal Directo + inyección system prompt + Agente PC default ON + cableos |
| `src/constants.ts`, `package.json` | Versión 1.73.0 |
| `contrato-rutas.json`, `SUPERFICIE_RUTAS.md` | Regenerados (154 rutas) |

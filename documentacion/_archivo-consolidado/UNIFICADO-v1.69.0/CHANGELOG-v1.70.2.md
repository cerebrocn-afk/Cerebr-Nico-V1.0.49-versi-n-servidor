## v1.70.2 · 2026-10-25 · EL FONDO SE CALLA, EL CARTEL SE VA Y LOS ESPEJOS ENTRAN AL BUCLE

Entrega chica y quirúrgica sobre el feedback del 24/10 (capturas + log completo
de sesión + export `cerebronico-ide-sesion-1792857430187.json`).

### 1 · Sonido ambiente: techo maestro (pedido literal: «está muy alto, bajalo bastante»)

`AudioAmbiente` no tenía techo: un slider a 0.35 sobre una pista masterizada
cerca de full-scale tapaba la voz y el teclado. Ahora:

* `TOPE_MAESTRO_AMBIENTE = 0.45` — se aplica en `gananciaEfectiva`, o sea en
  TODAS las rutas (Web Audio, fallback `<audio>` y ducking). Con el valor que
  estaba guardado (0.35) el efecto inmediato es ~−10 dB.
* El default para config nueva baja de 0.35 a 0.2. Los valores guardados se
  respetan: lo que cambió para todos es el techo, no tu perilla.
* El ducking mientras la app habla sigue intacto (15 % del nuevo techo).

### 2 · TTS: el cartel fuera del chat; el selector dice lo que el cartel decía

El aviso «La voz «Google español» es natural (de nube)…» aparecía EN EL MEDIO
del chat cada vez que se hablaba con tono movido (y citaba voces —«Microsoft
Sabina/Pablo»— que no existen en Windows 10). Se sacaron las dos ramas
(manual y automática): el dato pasa al `console.info` para depuración y la
información vive donde se elige la voz:

* Cada voz del selector se etiqueta `· local` o `· nube` (dato real de
  `localService`; en la captura de Mario las «Google …» colgaban de «Voces del
  sistema» sin decir que son de nube).
* Orden nuevo dentro del idioma: **locales primero** — son las únicas que
  respetan el control de tono, así la lista empuja sola hacia la voz que
  obedece todos los mandos.
* El pie del desplegable pasó a dos líneas honestas sin nombres inventados.
* **Nuevo botón «probar esta voz»**: dice una muestra corta con la voz, tono y
  velocidad en curso, sin gastar un turno de chat (con voz Gemini elegida, la
  prueba la hace la voz del navegador; la Gemini se escucha con «Escuchar»).

### 3 · El BAT «se cerró solo»: la ruta de éxito también espera una tecla

Causa: `iniciar_todo_windows.bat` pausaba ante errores, pero si `npm run dev`
terminaba en orden (Ctrl+C, cierre del server, etc.) iba directo a `:fin` y la
ventana desaparecía sin dejar leer nada. Ahora la ruta buena pasa por la misma
`:pausa_final`. En modo EXE oculto (stdin=NUL) la pausa sigue pasando sola —
regla de la casa intacta, CRLF intacto, cero paréntesis.

### 4 · Capacidades avanzadas: el cartel decía «apagadas» con las siete encendidas

El encabezado del laboratorio estaba fijo en «(construidas, apagadas)» y
mentía desde que activaste las siete. Ahora dice `Capacidades avanzadas
(N/7 encendidas)`, en vivo.

Verificación de qué hay detrás de cada botón (código v1.70.1, revisado línea
por línea):

| capacidad | ¿está enchufada? | evidencia |
|---|---|---|
| Multi-cerebro por dominio | SÍ | `buildDomainBlock()` viaja en el turno (server.ts:9947), `ensureDomainTemplates()` al activar |
| Historial Git de la memoria | SÍ | `commitMemoria()` enganchado a cada incidencia de herramienta (server.ts:2214) |
| Índice profundo del código | SÍ | gate `isOn("deep_index")` en el endpoint de índice + `collectProjectSources` |
| Reordenado híbrido | NO — PENDIENTE (lo dice el propio panel) | sin consumidor de la flag: falta la fusión calibrada |
| Verificador en la nube | NO — PENDIENTE | idem: la bandera existe, el juez todavía no se llama |
| Trabajadores en paralelo | NO — PENDIENTE | además tu máquina tiene 4 núcleos de los 8 que pide: el aviso ⚠ es correcto |
| Auto-propuesta de parches | NO — PENDIENTE | falta el contador de fallos repetidos |

O sea: las tres primeras funcionan y se ve en el log; las cuatro marcadas
PENDIENTE encienden la bandera pero todavía no tienen motor detrás — el badge
es honesto y se queda.

### 5 · Espejos: de «existen pero no se usan» a nombrados en el re-empuje

El export de sesión lo dijo con todas las letras (mensaje 17): *«los espejos
(`consultar_espejo`) existen pero no se usan para planificación»*. El diagnóstico:

* La invitación a los espejos vive en el **system prompt**; un modelo que
  «anuncia y no ejecuta» es justamente el que deja de leer el prompt y mira
  solo el último mensaje. Por eso `notaEspejosDeEmpuje()` (nueva, en
  `src/engine/reflejo/espejos.ts`, fuente única) agrega al **re-empuje** —
  el mensaje que sí leen — el equipo activo y el primer espejo por nombre.
  Se activa solo si hay equipo elegido y el turno todavía no llamó a
  `consultar_espejo`; cableada en las dos ramas de nube (OpenAI-compat y
  Gemini).
* El arranque ahora dice la verdad en una línea: `[Orquestador] activo — … ·
  equipo activo «X» (N)` o `sin equipo activo: … elegí uno en Modelos →
  Espejos`. «1 espejos medidos» no era un bug de conteo: la tabla de salud
  mide USO real, y como casi nadie los llamaba, había uno solo medido.
* Recordatorio de uso: los espejos responden aunque no haya equipo (el modelo
  los llama por id), pero **sin equipo seleccionado la nota no viaja** y el
  modelo no tiene por qué saber que existen. Seleccioná `auto` o un grupo en
  Modelos → Espejos.

### 6 · Ollama Cloud: el 429 «Free usage limit» deja de reintentarse 4 veces

El tope de la cuenta gratis NO es un pico transitorio. El log del 24/10 lo
mostraba gastando 4 round-trips por modelo nublado (`gemma4:31b-cloud`,
`gpt-oss:120b-cloud`) para repetir el mismo cartel de `$20/month`. Ahora ese
429 corta el retry en el primer golpe y cae en la cuarentena normal del
proveedor. El retry de los 429 transitorios sigue igual.

### 7 · Diagnóstico: por qué «algunos modelos escriben mucho y hacen poco»

Del log y el export del 24/10, las cuatro causas medidas (no opinadas):

1. **glm-4.5-flash (activo) en modo narrador**: anunció 6 veces «voy a…» sin
   llamar herramienta. El re-empuje escalado ya existía; ahora además le da la
   salida concreta cuando hay espejos (§5) y el ultimátum de entrega sigue
   siendo el cierre.
2. **Los micro locales no tienen con qué ejecutar**: `qwen2.5:0.5b`,
   `gemma3:270m`, `L2_06_qwencoder0.5b` corren en Modo LIVIANO — a propósito,
   SIN herramientas, porque con tools se cuelgan. Escriben mucho y hacen poco
   porque *no pueden* hacer: no es un defecto, es el trato. Para obra real,
   un coder de ≥1.5–3B (o glm/cloud).
3. **La cadena Gemini barría 10 modelos por turno**: 503/429/404 en serie
   (gemini-2.5-flash ya está dado de baja para nuevas cuentas). El fusible
   v1.57.12 los enfría desde el primer fallo, pero el primer barrido de la
   sesión siempre paga el peaje: es el costo de darles una oportunidad real.
   Con la cuota free (5 rpm) el relevo local es el camino corto.
4. **Modelos inventados en el selector**: `Cerebronico:latest` devolvía 404
   «try pulling it first» en cada giro. El mensaje ya lo dice explícitamente;
   si no lo descargaste, sacalo del rotado.

### Pendientes declarados (no entran en esta)

* Fusible de red «Failed to fetch» consecutivo → diagnóstico de salida caída
  (anotado desde v1.70.1).
* Motor real para hybrid_rerank / cloud_verifier / parallel_workers /
  auto_propose (hoy: bandera con honestidad, sin motor).
* Juez de plan: que el planificador consulte espejos por su cuenta (antes el
  modelo; este paso les abre la puerta).

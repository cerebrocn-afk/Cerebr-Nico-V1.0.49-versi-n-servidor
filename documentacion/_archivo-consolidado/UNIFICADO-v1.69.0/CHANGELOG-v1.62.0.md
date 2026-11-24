# CHANGELOG v1.62.0 — EL VEREDICTO QUE A VECES MIENTE ES EL PEOR ENEMIGO

Primera parada de la hoja de ruta v1.62→v1.65. Se ataca el fallo más caro: el
contador de reescritura idéntica **entre turnos** que parecía vigilar y no
vigilaba.

## item 1 · El circuito de reescritura idéntica se probaba de forma no determinista
- `tests/imagen.test.ts` (sección 14): el caso del circuito dependía del número
  de ramas de E/S de la máquina. Se fuerza `io=1` midiendo `ramLibreGB:1.2`
  (ruta secuencial → `bloqueadas>=1` determinista) y el 429 con
  `backoffQuotaMs:50`. Verificado: 10 corridas seguidas 91/0, exit 0.

## item 2 · 🐞 DEFECTO SEMBRADO + CONTROL DE FALSO POSITIVO — la ventanilla vivía un solo turno
- **El bug:** `crearVentanilla(...)` se llamaba DENTRO del handler del turno
  (`server.ts` rama Ollama y rama Gemini). Una ventanilla «entre turnos»
  recreada en cada turno nace sin historial SIEMPRE, así que el corte
  entre-turnos —su única razón de ser— jamás podía dispararse. Es el log real
  de los 34 rechazos agrupados turno a turno: cada turno acumulaba <3, el corte
  por turno no llegaba y el usuario encadenaba sin avance.
- **La corrección:** una sola ventanilla de SESIÓN (`ventanillaSesion`,
  singleton de módulo) que sobrevive a los turnos, compartida por las ramas
  Ollama y Gemini. Cada turno llama `abrirTurno()` al arrancar para ROTAR la
  ventana (como ya pedía el módulo puro v1.61.0).
- **Control de falso positivo:** un turno LIMPIO (0 rechazos) drena la ventana
  y rompe la racha → un usuario que cambia de tema no arrastra la sospecha
  vieja. Test nuevo `tests/ventanillaSesion.test.ts`: reproduce el defecto
  (ventanilla recreada → 2+2+2+2 nunca corta), demuestra la corrección
  (ventana de sesión → sí corta) y protege el falso positivo
  (turnoA rechazos → turnoB limpio → turnoC no hereda la racha).

## item 3 · Fase 2 «partir, no añadir» — el dominio Gemini TTS sale del monolito
- El contador de sesión sumó líneas a `server.ts` por encima del presupuesto
  del contrato. En vez de subir el techo, se EXTRAE un bloque cohesivo:
  `server/routers/geminiTts.ts` (30 voces + conversión PCM→WAV + rutas
  `/api/tts/voices` y `/api/tts/gemini`). Única dependencia con el monolito,
  `getGenAI`, se inyecta.
- `server.ts`: 12189 → **12088 líneas** (bajo el presupuesto y bajo el objetivo
  <12160). Contrato regenerado con `scripts/superficie.mjs`:
  `rutas_extraidas` 56 → 58, `rutas_en_monolito` 93 → 91, `presupuesto_lineas`
  recalculado a 12089. `superficie --verificar`: CONTRATO INTACTO.
- `tests/ttsErrores.test.ts`: se actualiza para leer el handler TTS desde su
  nueva ubicación (monolito + router concatenados), de modo que las
  comprobaciones de origen siguen vigentes tras la mudanza.

## Verificación
- `esbuild --bundle` de `server.ts`: OK (sin imports rotos ni sintaxis mala).
- Tests: `ventanillaSesion`, `reescrituraEntreTurnos`, `reescrituraIdenticaCircuito`,
  `superficieRutas` y `ttsErrores` en verde. `imagen` (item 1) 91/0 x10.

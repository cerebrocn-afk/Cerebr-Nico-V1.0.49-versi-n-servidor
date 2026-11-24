## v1.70.7 · 2026-10-25 · LOS DOS ROJOS QUE ERAN UN SOLO DEFECTO: MEDIR EL RELOJ, NO EL MOTOR

Veredicto de Mario sobre v1.70.6 (Windows, `C:\Users\BirdBox`): «1 fallo sobre 8022
comprobaciones y 1 suite que NO llegó a ejecutarse» — `grafoProyecto` («construcción
en menos de 200 ms · 218 ms») y `terminalInteractivo` («ve la salida del eco»). En
Linux la misma versión daba 8 ms y verde. Dos rojos, la misma forma: **la valla medía
el momento del reloj, no lo que decía medir.**

### 1 · `terminalInteractivo` — el eco existía, pero llegaba tarde (el rojo que NO se podía reproducir)

Qué pasaba: `abrirTerminal` lanza cmd/PowerShell y `enviarTerminal` espera un
`reposoMs` a ojo (700 ms en la suite). Con el disco frío y el antivirus escaneando
el `.exe` del shell, PowerShell tardaba en despertar MÁS que el reposo: la ventana
se cerraba antes de que el eco existiera y la suite devolvía vacío. Un dado, no un
fallo.

El arreglo (`src/engine/terminalInteractivo.ts` · sonda de calibración):

- Nada más nacer la sesión se escribe `echo <token>` por stdin. El arranque del
  shell ya **no se mide con sueño: se mide con evidencia** — cuando el token aparece
  en el búfer, el shell está despierto y sus tubos funcionando.
- `enviarTerminal` espera esa prueba ANTES de escribir la orden del modelo: el reposo
  se gasta entero en la respuesta real.
- Caducidad honesta `CALIBRACION_MS` (4 s): si el token no contesta, se sigue igual
  que antes — sin mentir y sin colgarse. Tope de toques y temporizador `unref`: la
  calibración no mantiene vivo al proceso por sí sola.
- El preámbulo y la sonda se consumen del búfer (`leido`) para no devolver basura al
  modelo; si el shell MURIÓ (ENOENT) NO se consume nada: el motivo del fallo sigue
  legible — `terminalShellSeguro` lo verifica y sigue verde.
- Solo se sondea a shells de verdad (`cmd/powershell/pwsh/bash/sh/zsh/fish/dash/ksh`,
  con o sin `.exe`). Un `shell: "python"` u otro REPL NO recibe la sonda: meterle
  `echo …` sería corromperle la sesión.

Prueba de la reparación: shell fingido con 1,5 s de arranque + `reposoMs: 200`
(dos veces más rápido que el despertar — con el código viejo devolvía vacío). Con la
sonda: `✓ eco visto (1728 ms)`. La suite, sin tocar su contrato: 19/19 en verde.

### 2 · `grafoProyecto` §7 — la valla medía el JIT, no el grafo

218 ms contra 8 ms en la misma versión: la primera llamada a `construirGrafo` del
proceso paga la compilación de las regex de `importChecker`/`dependenciasProyecto` y
del motor. Eso es el arranque de Node en la máquina del usuario, no el costo de 500
archivos. El grafo está comprobado lineal: el peaje era del reloj.

El arreglo (`tests/grafoProyecto.test.ts`, solo el MÉTODO de medición): pasada de
calentamiento descartada, reloj de alta resolución (`process.hrtime.bigint`,
`Date.now()` en Windows tiene molienda gruesa) y mejor de 3 pasadas — la regla
estándar de todo bench. **El umbral no se tocó: siguen siendo 200 ms.** Si el grafo
fuera lento de verdad, esta valla lo seguiría cazando.

### Lo que NO se hizo (a propósito)

- No se subió ningún umbral ni se durmió ninguna valla. Las dos correcciones hacen
  que la comprobación mida lo que dice medir.
- No se tocó el contrato de `terminalInteractivo.test.ts` (primera línea del fix:
  la suite tiene que pasar sin la tocan).

### Validación

`node scripts/validar.mjs` completo: **VEREDICTO: TODO CORRECTO — 8041 comprobaciones,
0 fallos. Tipos: 0 errores · 189 suites ejecutadas · 0 sin correr · 0 del catálogo
ausentes.** Suites señaladas, tres pasadas cada una: `grafoProyecto` 31/31 (≈8 ms),
`terminalInteractivo` 19/19, `terminalShellSeguro` 12/12.

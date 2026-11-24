# CHANGELOG v1.65.0 — EL BUCLE QUE SOBREVIVE A LOS TURNOS

> **Continuación directa de la Fase 3 (v1.64.0).** La v1.64 hizo el bucle VISIBLE
> para el modelo DENTRO de un turno. Pero el detector nacía vacío en cada turno,
> así que un patrón que cruza turnos se le escapaba. Esta versión lo cierra.

Cada parada del proyecto = **DEFECTO SEMBRADO + CONTROL DE FALSO POSITIVO**.

## El síntoma

El modelo gira un ciclo `A → B → C → D`, se le corta el turno (bien), el usuario
escribe **«sigue»**… y el modelo **vuelve a girar EXACTAMENTE el mismo ciclo**
en el turno nuevo. Como el detector de v1.64 (`contextoBucleO/G`) se creaba
**dentro del handler** — uno nuevo por turno —, cada turno arrancaba con la cuenta
a cero y el ciclo cross-turno **nunca escalaba**. Es, letra por letra, el mismo
defecto que ya habíamos corregido en la **ventanilla de reescritura** entre
v1.61.0 (contador por turno que miente) y v1.62.0 (ventanilla de sesión).

## item único · 🐞 DEFECTO SEMBRADO + FALSO POSITIVO — el detector pasa a nivel de SESIÓN

- **Módulo** `src/engine/contextoBucle.ts` (sigue PURO):
  - El estado `EstadoContextoBucle` ahora lleva dos campos nuevos:
    `huboProgresoTurno` (¿este turno hizo alguna obra exitosa?) y `turnosEnBucle`
    (racha de turnos SEGUIDOS atrapados en el mismo bucle).
  - **Nueva API `abrirTurnoBucle(estado)`**, a llamar al ARRANCAR cada turno:
    - Si el turno anterior **avanzó** (hubo obra) o **no estaba en bucle**, se
      empieza en limpio: se vacía la secuencia y la racha vuelve a 0.
    - Si el turno anterior estaba **en bucle y no avanzó**, se **conserva la
      secuencia** (para que el ciclo repetido entre turnos siga acumulando) y
      sube `turnosEnBucle`.
  - `registrarPaso(…, esProgreso=true)` marca ahora además `huboProgresoTurno`.
  - `evaluarContextoBucle` **corta** cuando `turnosEnBucle >= TOPE_TURNOS_EN_BUCLE`
    (=2) aunque la repetición DENTRO del turno aún no llegue a `REPES_CORTE`.
  - El mensaje visible, cuando el bucle viene arrastrado, le dice al modelo que
    **NO es nuevo** («llevas N turnos seguidos en el MISMO ciclo; insistir tras
    «sigue» no lo reinicia»).

- **CONTROL DE FALSO POSITIVO (doble):**
  1. Un turno que **hace obra** rompe la racha y limpia la secuencia — el modelo
     que de verdad avanza nunca hereda la sospecha del turno anterior.
  2. **Preguntas distintas en turnos seguidos** (una lectura legítima por turno,
     sin ciclo) **no acumulan racha**: `abrirTurnoBucle` solo sube `turnosEnBucle`
     si el turno previo tenía un ciclo DETECTADO, no por la mera ausencia de obra.
     Tres turnos de consulta normal jamás se cortan.

- **Cableado en `server.ts` (patrón idéntico a la ventanilla de v1.62):**
  - `const contextoBucleSesion = nuevoContextoBucle()` como **singleton de
    módulo**, compartido por las ramas Ollama y Gemini (el usuario que insiste
    es el mismo cambie o no de motor).
  - Cada rama hace `const contextoBucleO/G = contextoBucleSesion;
    abrirTurnoBucle(…)` al arrancar el turno, en vez de crear uno nuevo.

## Pruebas — `tests/contextoBucle.test.ts` (14/14)

- Las 10 de v1.64 siguen en verde (no regresión) + 4 nuevas de cross-turno:
  - el MISMO ciclo repetido tras «sigue» escala hasta cortar;
  - FALSO POSITIVO: un turno con obra rompe la racha;
  - FALSO POSITIVO: preguntas distintas en turnos seguidos no cortan;
  - un turno sin bucle entre dos con bucle drena la racha.

## Verificación

- `esbuild` (bundle del server) OK · `tsc --noEmit` OK.
- superficie regenerada y `--verificar` → **CONTRATO INTACTO** (12.190 / 13.700).
- trinquete de `androidProyecto` (server.ts < 12.191 líneas) en verde: 157/0.
- suite `contextoBucle` 14/14.

## Versión

- `1.64.0 → 1.65.0` en `package.json`, `package-lock.json`, `src/constants.ts`
  (`VERSION_SEMVER`) e `index.html` (title + og).

# Hoja de ruta v1.62 → v1.65 — evolución post-1.61.0

> Continuación de `HOJA-DE-RUTA-PRO-v1.61.md`. Todo lo que sigue parte de lo
> que quedó pendiente en el changelog de 1.61.0 y de lo que la auditoría midió
> y no se cerró. Cada fase lleva su criterio de cierre: defecto sembrado +
> control de falso positivo, como en 1.60.17, 1.60.19 y 1.61.0.

Estado real al cerrar 1.61.0 (medido):

| Check | Resultado |
|---|---|
| `npm run validar` | 7527 comprobaciones, 0 fallos, 169 suites |
| `tsc --noEmit` | 0 errores |
| `server.ts` | 12189 / valla 12191 → **margen 2 líneas** |
| Suites nuevas | `degeneracionLineal` 15/0 · `reescrituraEntreTurnos` 21/0 |
| Test `imagen` | 91/0 en mi entorno; en el de Mario dio 2 fallos de timing |

Ese último punto es la puerta de entrada a esta hoja de ruta: **hay tests que
dependen del reloj**, y un test que a veces pierde es un rojo que ensucia el
veredicto y esconde los rojos de verdad.

---

## v1.62 · Determinismo del veredicto (prioridad máxima)

### 1 · El test `imagen` depende del timing (fallo visto en tu máquina)

**Síntoma:** en tu 1.60.20 el test dio 2 fallos
(`bloqueadas=0`, motivo sin «cortacircuito») y en mi árbol 91/0.

**Causa medida:** el bloqueo exige `esperasCircuito > maxEsperasCircuito` con
`esperaCircuitoMs` inyectado en 50 ms. El plan corre en rondas concurrentes;
si la última tarea cierra antes de que el plan haga otra ronda, no hay tarea
que llegue al umbral. Es una carrera contra el reloj: a veces gana el test,
a veces no.

**Cura:** hacer el test determinista, no cambiar el motor:
- inyectar un reloj controlado (el mismo patrón que ya usa `imagen` con
  `esperaCircuitoMs`), o
- reintentar la medición hasta N rondas con tope, o
- exponer un contador interno y afirmar sobre él, no sobre el estado final.

**Cierre:** el test pasa 10 corridas seguidas sin depender del scheduling.

### 2 · `abrirTurno()` está declarado pero sin cablear

El módulo de sesión lo necesita al arrancar cada turno para que un turno limpio
drene la ventana. En 1.61.0 el corte consulta la ventanilla, pero la rotación
de turnos limpios depende de que el handler llame a `abrirTurno`. Falta ese
cable en el arranque del turno (2 líneas en `server.ts`, que ya está al borde
de la valla: hay que compactar otro comentario).

**Cierre:** un test que simula turno A con rechazos → turno B limpio → turno C
con rechazos, y afirma que la racha no heredó.

### 3 · Margen de `server.ts` en rojo estructural

Quedan 2 líneas de la valla (12189/12191). Cada cable nuevo obliga a compactar
comentarios, que es como se rompió un import en 1.61.0 (se detectó con `tsc`,
pero pudo ser a mano).

**Cura:** extraer a `src/engine/` o `server/routers/` un bloque completo (p. ej.
el bloque de reescritura y su cierre), que baja ~40 líneas de una sola vez.
Eso reabre margen real para las fases siguientes.

**Cierre:** `node scripts/superficie.mjs` por debajo de 12160 y los tests de
contrato en verde.

---

### Actualización (24/10) — la sesión `1792793541672` reordena esta versión

Medido sobre esa sesión (detalle en `INFORME-SESION-1792793541672.md`):

- **`degeneracionLineal` de v1.61.0 NO cortó su bucle**: 102.088 caracteres, `hit: false`,
  0,0 % descartado. La repetición estaba estacionada (encabezados distintos, cuerpo idéntico,
  intervalo mediano de 340 líneas), así que la racha de 6 vecinas nunca se arma. Hay que sumar
  **`bloqueRepetido`** (unidad multilínea repetida + enumeración monótona de corroboración), con
  `server.ts`, `constants.ts` y un README legítimo como fixtures negativos fijos.
- **El filtro `fim` no alcanza**: esa sesión corrió con `mistral-code-latest` (id de chat, sin
  `fim`) y degeneró igual. El corte por forma es la única defensa real.
- **Ventanilla sin fuente de rechazos**: mensaje 21 vs 23 = semejanza 0,9987 con prefijo idéntico
  de sólo 53 %, y 0 rechazos registrados (es texto de chat, no escritura de archivos). El corte ya
  funciona —probado: corta en el 3er turno— falta alimentarlo.
- **El preview se cuelga sin avisar**: el iframe (`RightSidebar.tsx:1356-1363`) no tiene
  `onLoad`/`onError` y el re-key anti-caché sólo dispara en la *primera* transición a vivo. Si el
  arranque nunca devolvió `online:true`, la carga muerta no se reintenta nunca → coincide con
  «localhost:3500 muestra la página y el previsualizador no». Y el latido del vigía
  (`:899-902`) dice «instalando dependencias» aunque `elegirViaPreview` devolviera
  `requiereInstalar: false`.
- **El estado que el modelo muestra lo inventa**: afirmó «Motor v1.51.0 / 799 archivos indexados /
  97 herramientas operativas» con **0 lecturas** en el historial (2 bloques de plan, ninguna
  consulta). Real: `VERSION_SEMVER = 1.61.0` y **37** herramientas nativas en 7 packs.

Estos cuatro ítems entran en 1.62 con prioridad sobre los tres de arriba (el determinismo del
test `imagen` sigue siendo necesario, pero es el rojo menos importante de los cinco).

---

## v1.63 · Contexto de bucle visible para el modelo (Fase 3)

Hoy el motor corta y le explica al **usuario**. El modelo que estaba en bucle
nunca se entera: le llega un turno cerrado sin la información que le permitiría
cambiar de enfoque.

**Qué:**
1. Inyectar en el siguiente prompt un bloque del estilo del que ya existe en
   `conciencia.ts`: «estuviste N líneas casi idénticas / M reescrituras entre
   turnos; el corte fue por X; probá Y».
2. Conectarlo con `evaluarYFiltrarEstrategias` (motorCertezaX5): las estrategias
   ya vetadas por el motor deben entrar en el prompt como «ya probado».

**Por qué es Fase 3 y no antes:** sin las fases 1-2 el motor no detecta el bucle
de forma confiable, así que no hay nada honesto que decirle al modelo. Con el
detector y la ventanilla ya hay datos medidos que valen la pena inyectar.

**Cierre:** un test que fuerza un bucle y afirma que el siguiente prompt trae la
directiva con el motivo y la cantidad, sin inventar números.

---

## v1.64 · Certeza de tarea: criterios de aceptación reales (Fase 4)

El esquema de `set_plan` ya trae `criterios_aceptacion` (opcional, casi nunca
usado) y `memoriaArquitectura.ts` ya tiene el libro de ADR con
`conflictoCon()` para delatar decisiones contradictorias. Falta el cierre:

**Qué:**
1. Si una tarea declara criterios, el motor no la da por «completed» sin
   evidencia por criterio (no basta el «listo» del modelo).
2. Si una tarea no los declara y es de tipo `crear`/`reparar`, el plan pide
   declararlos (o marca la tarea como `sin-verificacion`, a la vista).
3. `conflictoCon()` pasa de biblioteca a guardián: si el modelo propone algo que
   contradice un ADR aceptado, el motor lo dice ANTES de escribir.

**Cierre:** tarea con criterio «el build pasa» no se cierra sin el output real
del build; propuesta contradictoria con un ADR se rechaza citando el id.

---

## v1.65 · Contrato de proyecto y semillas (la parte de base de datos)

Ya verificado en la auditoría: **no hace falta otro paquete**. Lo que falta es
un contrato de arranque que use lo que ya existe:

**Qué:**
1. **Semillas por tipo de proyecto** (web estática, SPA con API, app con DB)
   sobre el scaffolding que ya genera `cerebroReflejo.ts`, con `.env.example`
   y `README` con el comando de arranque.
2. **ADR inicial obligatorio**: crear proyecto = registrar la decisión de stack
   (incluida la base de datos) en el libro que ya existe.
3. **Health-check de arranque**: si el proyecto declara DB y no está conectada,
   el motor lo dice antes de escribir features encima.

**Qué NO es esto:** una integración real de base de datos (cliente de Postgres,
migraciones). Eso es alcance de producto aparte, con su propio costo de
mantenimiento. La semilla solo organiza el arranque y deja la decisión escrita.

**Cierre:** crear un proyecto de cada tipo deja `decisiones.md`, `.env.example`
y un `list_files` coherente sin que el modelo invente archivos.

---

## Fuera de alcance declarado

- **Techo global `num_predict`**: rechazado a propósito. Un tope por longitud
  corta respuestas largas legítimas; el corte por forma (fases 1-2) es el que
  corresponde.
- **Integración real de DB**: decisión de producto, no un parche. Si se quiere,
  va como pack externo con su propio contrato, no dentro del motor.
- **Cablear el manual del zip al motor**: hoy conviven dos fuentes de verdad
  (`manuals.ts` y `manual-motor/`). Ya corregidos los desajustes; unificarlos es
  un trabajo de consolidación aparte, no de evolución de bucle.

## Orden de ejecución y por qué

| Versión | Fase | Riesgo si no se hace |
|---|---|---|
| 1.62 | Determinismo del veredicto + `abrirTurno` + margen | rojos intermitentes que ocultan los reales |
| 1.63 | Contexto de bucle al modelo | el modelo repite el enfoque fallido |
| 1.64 | Certeza de tarea con evidencia | «listo» sin verificación |
| 1.65 | Contrato de proyecto | arrancar sin base declarada |

**1.62 va primero** porque un veredicto que a veces miente es el peor enemigo
de todo lo demás: si no podés confiar en el verde, no podés medir ninguna de las
fases siguientes.

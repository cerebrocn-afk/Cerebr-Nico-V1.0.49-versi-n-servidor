# AUTOVALIDO.md — EL FISCAL DEL ÚLTIMO METRO (v1.49.0)

> **Qué es.** El confirmador de validaciones FINAL del proceso. Antes de imprimir
> cualquier cierre de tarea («listo», entrega, respuesta final), actúa el
> `autovalido` como una AUDITORÍA que fiscaliza si el trabajo está realmente
> correcto para ejecutar la confirmación. Si está bien → confirma y recién ahí se
> imprime. Si está mal/incompleto → lo DEVUELVE al bucle con un log del error para
> reparar, y se vuelve a validar. Nada se da por «terminado» sin pasar por aquí.
>
> **Dónde encaja.** Es el paso 7 («CERRAR HONESTO») del automatismo de recepción
> de tarea — ver `cerebro.md` §16 — llevado a una compuerta explícita. No sustituye
> a las vallas por tema (`npm run validar`): las CORONA. El `validar` dice si el
> código está sano; el `autovalido` dice si la TAREA puede declararse hecha.

---

## 1. El contrato en una frase

**Ninguna salida se imprime como «completada» sin un veredicto `CONFIRMADO` del
autovalido.** Un veredicto `RECHAZADO` no es el final: es un regreso al bucle con
causa, para reparar y re-auditar.

```
   trabajo del turno ─▶ [ AUTOVALIDO: auditoría ] ─▶ CONFIRMADO ─▶ imprimir cierre
                                 │
                                 └─ RECHAZADO ─▶ log de error ─▶ bucle (reparar) ─▶ (re-auditar)
```

## 2. La lista de control (qué fiscaliza, en orden)

El autovalido corre estas comprobaciones. Cualquiera en rojo → `RECHAZADO`.

1. **Criterios cumplidos.** Cada criterio de aceptación declarado (set_plan /
   contrato) tiene su casilla cubierta. Un criterio sin cerrar = rechazo con la
   lista exacta de lo que falta (es la misma puerta de `directivaDeContratoAbierto`).
2. **Evidencia del tipo correcto.** Afirmar «hecho» exige evidencia tipada: leer
   concede `leido`; solo ejecutar (run_command / run_tests / pc_exec) concede
   `ejecutado`; escribir NO concede certeza por sí solo. «0 errores» no es prueba
   de éxito. Evidencia ausente o del tipo equivocado = rechazo.
3. **Sin fallos abiertos.** No hay `ultimoFallo` sin resolver ni una firma de
   error repitiéndose. Si la hay, no se cierra: o se reparó, o es BLOQUEO honesto
   (que también es un cierre válido, pero DECLARADO como bloqueo, no como «hecho»).
4. **Honestidad del texto.** El mensaje no dice «funciona»/«completado» sobre algo
   no verificado; separa prosa de código; está en el idioma del usuario; no inventa
   nombres de herramientas, rutas ni funciones puente.
5. **Nada prometido sin entregar.** Lo que el plan prometió crear existe en disco,
   no está vacío ni truncado, y los enlaces (src=/href=) no apuntan al vacío.
6. **Reversibilidad respetada.** Ninguna acción irreversible se ejecutó sin la
   confirmación previa del humano.

## 3. Qué pasa en cada veredicto

- **CONFIRMADO** — todas las casillas en verde. Se imprime el cierre y, si hubo
  algo reutilizable aprendido, se guarda en el cerebro (`cerebro_recordar`).
- **RECHAZADO** — al menos una casilla en rojo. El autovalido NO imprime «listo»;
  compone un **log de error** (qué casilla falló, por qué, y la directiva de
  reparación) y lo devuelve al bucle como un fallo más. El bucle sube el escalón
  de reparación normal: cambiar de camino → diagnosticar/retroceder → (si la misma
  casilla sigue roja tras varios intentos) BLOQUEO honesto que pide decisión humana.

## 4. El log de error (formato del regreso al bucle)

Cuando rechaza, el autovalido entrega una línea por casilla roja, lista para que
el bucle la trate como `ultimoFallo`:

```
[AUTOVALIDO/RECHAZADO] casilla=<criterios|evidencia|fallos|honestidad|promesas|reversibilidad>
   motivo=<qué faltó o qué estaba mal>
   directiva=<el siguiente paso concreto para repararlo>
```

Ejemplo real posible:
```
[AUTOVALIDO/RECHAZADO] casilla=evidencia
   motivo=la tarea «corre los tests» se declaró hecha pero solo hubo write_file (no concede «ejecutado»)
   directiva=ejecutar run_tests y adjuntar su salida antes de volver a cerrar
```

## 5. Invariantes (lo que el autovalido NUNCA hace)

- Nunca imprime «completado» con una casilla en rojo.
- Nunca inventa evidencia ni reclasifica un `write` como `ejecutado`.
- Nunca se cuelga reintentando: si la misma casilla sigue roja, escala a BLOQUEO.
- Nunca es decorativo: su veredicto DECIDE si se imprime o se vuelve al bucle.

## 6. La matriz de verificación (criterio × evidencia)

El corazón del autovalido es una MATRIZ que cruza cada CLASE de criterio con el
TIPO de evidencia que lo acredita. Una casilla sólo se pinta de verde con la
evidencia del tipo correcto: no cualquier prueba sirve para cualquier afirmación.

| Clase de criterio (lo que se afirma) | Evidencia que lo acredita | NO lo acredita |
|---|---|---|
| **Existe / se creó** (archivo, carpeta, recurso) | `leido`: lectura del disco que confirma que está y no está vacío/truncado; o artefacto listado | el `ok:true` de `write_file`/`edit_file` por sí solo |
| **Compila / sin errores de tipo** | `ejecutado`: `run_command` de `tsc`/build con su salida y código 0 | «debería compilar», o leer el código |
| **Funciona / corre** | `ejecutado`: `run_command`/`pc_exec` con la salida real | afirmar «funciona» sin corrida |
| **Los tests pasan** | `prueba`: `run_tests` con conteo; `[1-9]\d*` en «failed» lo tumba | un runner que dice `ok:true` con «3 failed» |
| **Reproducible / idéntico** | `hash`: sha256 que coincide entre corridas | «salió igual» sin hash |
| **Validación global sana** | `ejecutado`: `npm run validar` con código 0 | una suite suelta en verde |
| **No se rompió lo anterior** | `prueba`: las vallas viejas siguen en verde (no-regresión) | «no toqué eso» |

**Reglas de lectura de la matriz:**

1. **La evidencia tiene tipo.** `leido` acredita «existe», nunca «funciona». Solo
   una corrida acredita «funciona». Confundir los tipos es la mentira que la
   matriz existe para cazar (es el principio del acta de evidencia del turno).
2. **Escribir NO concede certeza.** `write_file`/`edit_file`/`delete_file`/
   `git_commit` se anotan pero no suben ningún escalón de verdad: hay que
   verificar su efecto con la evidencia de la fila.
3. **«0 errores» no es prueba de éxito.** Lo que acredita es la AUSENCIA de la
   marca de fallo (`[1-9]\d*` en failed/error), no la presencia de un cartel
   optimista. El marcador de fallo MANDA sobre el `ok`.
4. **Celda sin evidencia = casilla roja.** Una fila sin su evidencia del tipo
   correcto deja la tarea en `RECHAZADO`, con esa fila nombrada en el log de error.
5. **Cobertura honesta.** El autovalido reporta cuántas filas quedaron verdes vs
   cuántas sin probar; no promedia ni redondea hacia arriba. Si falta probar algo,
   lo dice — no lo da por hecho.

**Cómo se cablea:** esta matriz es exactamente `matrizVerificacion` (v1.34.0) +
el acta de `evidenciaTurno` (v1.46.0). El autovalido no la reinventa: la invoca
como último paso antes de imprimir, y traduce cada celda roja a una línea del log
de error del §4.

## 7. Cómo se cablea en el motor (mapa, no promesa)

> **v1.49.0 · FASE 2 — el fiscal YA tiene cuerpo.** Lo que hasta v1.48.0 era
> política legible repartida por el motor hoy es un módulo propio:
> `src/engine/autovalido.ts`. Este archivo deja de ser «la única sede del
> fiscal» para ser su CONTRATO legible: el código lo implementa, no lo sustituye.
> La suite vive en `tests/autovalido.test.ts`.

El módulo `autovalido.ts` expone el fiscal como una función pura — `fiscalizar(e)`
— que recibe el estado del turno y devuelve un `DictamenFiscal` (veredicto
`CONFIRMADO` / `RECHAZADO`, casillas con su `verde`/`roja`/`sinProbar`, cobertura
honesta y, si aplica, la casilla bloqueada). No lee nada en runtime ni toca disco:
es determinista y aditivo. Cada casilla de la lista de control (§2 y §8) tiene su
evaluador puro, y todos siguen alimentándose de las mismas piezas del motor que
ya existían:

- **Criterios y contrato de aceptación** — `evaluarCriterios` cruza el resumen de
  contrato de `planAdaptativo`; cerrar con criterios sin evidencia pinta la
  casilla en rojo (y `decidirBucle` sigue devolviendo `continuar` con lo que
  falta).
- **Evidencia tipada** — `evaluarEvidencia` lee el estado de `motorEvidencia` y
  el acta de `evidenciaTurno`: escribir no concede certeza; `[1-9]` en «failed»
  manda sobre el `ok`.
- **Fallos abiertos y bloqueo por repetición** — `evaluarFallos` + el umbral
  `UMBRAL_BLOQUEO_FISCAL`: la misma casilla roja sin ceder termina en
  `actaBloqueoFiscal` (la firma de error y la escalera de reparación siguen
  siendo del motor).
- **Cierre honesto** — `evaluarHonestidad` y `evaluarPromesas` sobre el texto de
  cierre y el veredicto de `completitud`; sigue conviviendo con la puerta de
  validación (`revisar_cambios` + `npm run validar`).
- **Casillas de tarea pesada** — `evaluarIdea` / `evaluarCoherencia` /
  `evaluarContratos` / `evaluarEstadosLimite` / `evaluarSeguridad` (§8), que solo
  entran cuando el turno se marcó pesado.

**Dónde se enchufa.** El servidor (`server.ts`) llama a `fiscalizar(...)` por
turno — marcando `tareaPesada` con `pareceTareaPesada(promptUsuario)` — y pasa el
`DictamenFiscal` a `decidirBucle` (`bucleAutonomo.ts`), que importa SOLO el tipo y
dos formateadores puros (`actaBloqueoFiscal`, `coberturaAParte`): el fiscal nunca
importa al bucle, el acople es en un solo sentido. El veredicto se refleja además
en la instantánea de conciencia (`conciencia.ts`), de modo que el modelo lo ve en
vivo en el [ESTADO VIVO DEL TURNO]: ni la prosa ni un plan vacío cierran si una
casilla sigue roja. Si `fiscalizar` fallara, el fiscal se omite y el bucle decide
como siempre (cero regresión).

---

## 8. Casillas EXTRA para software complejo (v1.49.0)

Cuando el turno es una **tarea pesada / de responsabilidad** —interpretar una
idea para un software complejo, no un retoque—, el autovalido añade a su lista de
control (§2) estas casillas. Son el reflejo, en el último metro, del CONTRATO DE
ARQUITECTO (`conciencia.ts`) y del pack `kbArquitectura`: lo que el modo arquitecto
pide pensar *antes* de teclear, el autovalido lo fiscaliza *antes* de cerrar.
Solo se activan si la tarea se marcó como pesada (`pareceTareaPesada`); en un
retoque pequeño no estorban.

7. **Idea interpretada y confirmada.** Para una tarea compleja, consta que la
   idea se reformuló y se confirmó (o que se avanzó con un supuesto DECLARADO),
   no que se saltó a teclear sobre una interpretación tácita. Interpretación sin
   confirmar ni declarar = rechazo con la directiva de reformular.
8. **Coherencia arquitectónica.** Lo entregado respeta las fronteras y
   responsabilidades de las piezas (no metió lógica donde no toca), sigue las
   convenciones del proyecto y no introdujo una dependencia nueva para algo que
   ya estaba resuelto. Incoherencia estructural = rechazo.
9. **Contratos entre piezas respetados.** Las interfaces/tipos en las fronteras
   que se tocaron siguen cumpliéndose; ninguna pieza quedó implementada contra la
   tripa del vecino en vez de contra su contrato. Un contrato roto en silencio es
   el peor daño: rechazo aunque «compile».
10. **Estados límite cubiertos.** No solo el camino feliz: hay respuesta para
    vacío, cargando, error, muchos, offline y sin permiso donde apliquen. Un flujo
    con un único estado = rechazo con la lista de bordes sin cubrir.
11. **Seguridad por defecto.** Entradas externas validadas, sin secretos
    incrustados, y ningún endpoint nuevo expuesto sin declarar quién puede
    llamarlo. Un servicio sin control de acceso es un agujero aunque «funcione».

Estas casillas usan la misma mecánica del §3–§5: cualquiera en rojo → `RECHAZADO`
con su línea de log (§4), y la misma escalera de reparación. No se promedian ni se
dan por hechas; si una no se pudo comprobar, se reporta como no probada, no como
verde (cobertura honesta, §6.5).

# PLAN — CAPACIDAD DE INTEGRACIÓN SIMULTÁNEA DE HABILIDADES DEL MOTOR
**Objetivo:** que las 70 habilidades del motor trabajen SOBRE EL MISMO HECHO, en el mismo instante, sin cables sueltos: un solo tablero compartido, un despachador determinista y un panel donde se vea la simultaneidad.
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)

**Anclas verificadas hoy sobre `work/app`:** `src/engine/` contiene **70 módulos** · `server.ts` tiene **56 líneas de import** desde `./src/engine/*` (coreo, bucleAutonomo, ejecutoresConsejo, hardwareGovernor, modelTiers, importChecker, quirofano, memoriaResiliente, metricasInferencia…) · **no existe** ningún bus/orquestador/blackboard (grep `orquestread|eventbus|blackboard` = 0; los únicos «director» son comentarios) · `coreo.ts` YA tiene taxonomía de eventos: `EventoCoreo { accion, detalle, n }` (línea 41) y `notificar(accion, detalle)` (línea 48) · `ejecutoresConsejo.ts` (líneas 68/80) ya distingue «ejecutor natural: el director neural» (el modelo) de lo determinista — la metáfora nerviosa es de la casa, este plan la completa.

---

## 1. El problema, en una frase verificable

Hoy el mismo hecho se procesa por separado y sin coordinarse: una salida de comando la leen `detalleDeSalida` (server), `clasificarAviso` (coreo) y `learnFromToolFailure` (bucle) — **tres lectores, tres interpretaciones, cero consenso**. Cada habilidad nueva (los planes F1-F6, arnés V, probabilidades B, bisturí D) añadiría más cables al monolito: 56 imports ya no caben en 11 495 líneas. La «integración simultánea» no es una feature extra: es la única forma de que los cuatro planes convivan.

## 2. Arquitectura: médula espinal, no cerebro

**Regla de diseño:** el modelo sigue siendo el *director neural* (término de la casa). Este sistema es la *médula*: **nunca piensa, solo conecta**. Puro, determinista, sin fetch ni fs — todo efecto queda en los ejecutores que ya existen.

### 2.1 `src/engine/tableroTurno.ts` (puro) — el hecho compartido
```ts
export interface EstadoDelTurno {
  turno: number;
  evento: EventoCoreo;                       // la espina dorsal YA EXISTE: los verbos del coreo
  hechos: {                                  // cada dominio, UN solo campo canónico
    error?: { crudo: string; lineaCausa: string; clase: string };   // ← detalleDeSalida + clasificarAviso se fusionan acá
    recursos?: { ramLibreMb: number; residenteMb: number; tier: Tier };
    hipotesis?: { cadena: CadenaCausal; candidatas: [string, number][] };  // ← plan bisturí
    plan?: TareaPlan[]; fase: FaseBucle; escalon: number;                  // ← plan bucle
    lecciones?: Leccion[];                                                 // ← plan F1
  };
  propuestas: Propuesta[];   // lo que cada habilidad QUIERE hacer
  decision?: AccionDirector; // lo que el director resolvió
}
```

### 2.2 `src/engine/directorHabilidades.ts` (puro) — la simultaneidad
```ts
export interface Habilidad {
  id: string;                                  // "bisturí", "arnés", "ledger", "governor"…
  escucha: EventoCoreo["accion"][];            // en qué eventos despierta
  aporta: (keyof EstadoDelTurno["hechos"])[];  // qué campos escribe
  propone: (t: EstadoDelTurno) => Propuesta[];  // función PURA: misma entrada, misma salida
  prioridad: "seguridad" | "usuario" | "protocolo" | "optimizacion";
  presupuesto: number;                          // máx propuestas por turno (anti-ruido)
}
export function registrarHabilidad(h: Habilidad): void
export function despachar(tablero: EstadoDelTurno, evento: EventoCoreo): AccionDirector
```
`despachar` ejecuta **en el mismo tick** a todas las habilidades que escuchan el evento (pureza = no hay carreras ni orden que temer: es simultaneidad real sin asincronía), recoge propuestas y resuelve conflictos con **regla fija de la casa**: `seguridad > usuario > protocolo > optimización`; empate dentro de nivel → mayor `pExito` (plan probabilidades B). Todo queda registrado en `tablero.propuestas` con `adoptada|rechazada(razón)` — la trazabilidad ES la UI.

### 2.3 La espina de eventos = coreo promovido
Los verbos del coreo (`actividad, pensar, escribir, ejecutar, probar, exito, bloqueado…`) pasan a ser el vocabulario oficial de eventos; `notificar()` (existe, línea 48) se convierte en el único punto de publicación. Eventos nuevos que piden los otros planes: `hipotesis`, `checkpoint`, `leccion`, `correccion-usuario` — todos entran por el mismo caño.

## 3. Migración de lo que ya existe (primera ola — sin conducta nueva)

| Habilidad actual | Rol en el bus |
|---|---|
| `coreo` | **emisor** de eventos (ya notifica) |
| fusión `detalleDeSalida`+`clasificarAviso`+`learnFromToolFailure` | un solo lector del error → `hechos.error` canónico (elimina los 3 interpretando distinto) |
| `bucleAutonomo` | consumidor/decisor registrado (fase/escalón leen y escriben el tablero) |
| `hardwareGovernor` + `modelTiers` | habilidad `recursos` (aporta `hechos.recursos`, propone degradación de modelo) |
| `quirofano` | habilidad `seguridad` (prioridad máxima: su veto gana a todo) |
| `aduanaArbol` | veto de seguridad sobre rutas (ya existe su criterio; entra al bus como propuesta `seguridad`) |
| planes F1/V/B/D | al implementarse, nacen COMO habilidades registradas — no como cables sueltos |

**Efecto en el trinquete:** cada migración REPLAZA imports y hooks del monolito por una línea de `despachar(...)` — server.ts debe **bajar** de 11 494 (meta: ≤ 11 470 al cerrar N3). Prohibido registrar sin extraer.

## 4. Contrato anti-degradación (suite `bus.test.ts`, estilo casa)
1. Toda habilidad registrada: `escucha ≥ 1`, `aporta ≥ 1`, `propone` pura (prohibido `fetch|fs|Date.now` sin inyectar clock — la casa ya inyecta relojes en tests).
2. Ninguna habilidad puede escribir fuera de sus campos `aporta` (chequeo de objeto devuelto).
3. `despachar` es determinista: mismo tablero + mismo evento → mismo `AccionDirector` (golden test).
4. Habilidad huérfana (registrada, nunca despierta con los eventos del catálogo) = rojo.
5. Profundidad de casacada = 1: una decisión del director puede emitir UN evento hijo; el bus se niega a sí mismo en cascada (anti-bucle infinito de habilidades parlándose entre sí).

## 5. UI: panel «Médula»
Vista viva del turno: columna de eventos → abanico de habilidades despiertas → propuestas adoptadas/rechazadas con la razón y la prioridad que ganó. Es la respuesta directa a «simultánea»: el usuario VE a 6 habilidades opinar del mismo error y por qué ganó una. (Bisturí, chips de probabilidad y lecciones del F1 se cuelgan de este panel en vez de tener cada uno su rincón.)

## 6. Fases y gates (gate casa: verificar 0 · contrato INTACTO · build · manifiesto)

| Fase | Contenido | Aceptación |
|---|---|---|
| N1 | `tableroTurno.ts` + `directorHabilidades.ts` + suite `bus.test.ts` con 2 habilidades juguete | despachar determinista; contrato de pureza verde |
| N2 | Fusión del lector de errores (única fuente de `hechos.error`) + coreo como emisor oficial | 3 consumidores viejos leen del tablero; `clasificarAviso` sin regressión (suite coreo 48/0 intacta) |
| N3 | Migración governor/quirofano/aduana/bucle como habilidades | server.ts ≤ 11 470 (el bus PAGA líneas, no las gasta) |
| N4 | Panel Médula + trazabilidad de rechazos | cada propuesta rechazada muestra prioridad ganadora |
| N5 | Los planes F/V/B/D se registran al implementarse (cada uno declara su fase del bus) | sin nuevos imports en server.ts por habilidad nueva |

## 7. Riesgos y mitigaciones
1. **Objeto dios** → el director no conoce a las habilidades: solo su contrato; registrar es añadir un módulo, nunca editar el bus.
2. **Latencia** → todo es puro y en memoria (µs); los efectos siguen en los ejecutores de siempre; `presupuesto` por habilidad limita ruido.
3. **Habilidades parlándose en bucle** → cascada profundidad 1 + golden test de determinismo.
4. **Romper lo vivo al migrar** → N2/N3 requieren suite específica por migración y el gate de la casa en cada fase; rollback por quirofano.
5. **Falsa simultaneidad** (que sea otro registro pasivo) → el criterio de aceptación N3 es duro: el orden de resultados cambia SOLO por prioridad/propuesta, y el panel muestra el porqué.

## 8. Límites honestos
- No es un sistema de plugins de terceros (eso lo ve `extensions.ts` por otro lado); es el bus interno del motor.
- «Simultáneo» = mismo tick, determinista, sin hilos: no hay paralelismo real (no hace falta: son funciones puras de microsegundos).
- El plan no toca la calidad del modelo; da estructura para que la estructura — no la memoria del modelo — sostenga la conducta.

# PLAN — EXPANSIÓN DE LA HABILIDAD DE RETROALIMENTACIÓN DEL BUCLE EN LA AUTOTAREA CONTINUA
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)
**Autor:** asistente, sobre el árbol real de esta entrega (líneas verificadas hoy)

---

## 0. Punto de partida (lo que el bucle YA sabe hacer hoy)

| Pieza | Archivo | Qué aporta |
|---|---|---|
| Juez puro del bucle | `src/engine/bucleAutonomo.ts` | `decidirBucle(SeñalBucle)` → continuar/cerrar; fases **crear→modificar→reparar**; escalera de reparación de 3 escalones; `techoDePasos` con presupuesto de reparación |
| Cable del bucle | `server.ts` · `runOllamaAgentLoop` (~3062) | `fallosPorHerramienta`, `historialBucle`, `learnFromToolFailure`, anti-repetición (repeat≥3) |
| Continuidad entre turnos | `server/continuidadPlan.ts` | plan sin terminar viaja al turno siguiente (30 min) |
| Herramientas de verificación | registro `core`/`pc`/`sistema` | `run_tests`, `revisar_cambios`, `deshacer_cambios`, `ollama_estado`, `recursos_maquina` |
| Vigía de arranque | `RightSidebar.tsx` | latido cada 20 s (el "se queda" ya se ve) |

**Laguna que ataca este plan:** el bucle recibe retroalimentación solo del RESULTADO INMEDIATO de cada herramienta. No aprende entre turnos, no verifica con evidencia sus propias promesas, no recibe corrección explícita del usuario y su presupuesto de pasos no conoce el historial. Eso es lo que el usuario percibe como «empieza otra vez», «contesta sin explicación» y «se tranca».

**Disciplina de presupuesto (trinquete):** el contrato fija server.ts en **11 495 líneas** (presupuesto actual). Todo lo nuevo vive en `src/engine/` y `server/` (módulos, fuera del ratchet); el cableado en server.ts tiene un tope de **+12 líneas por fase**, compensado con extracciones candidatas ya identificadas: bloque `learnFromToolFailure` (→ módulo), bloque anti-repetición `repeatCount` (→ función pura en bucleAutonomo), `StreamLike`+`emit` de quick-action.

---

## F1 · LIBRO DE LECCIONES (memoria de fallos entre turnos) — la base de todo
**Objetivo:** que la herramienta que falló 3 veces ayer no vuelva a intentarse hoy "a ciegas".

- **Nuevo módulo puro** `src/engine/ledgerRetroalimentacion.ts`:
  ```
  type Leccion = { clave: string; herramienta: string; claseError: string;
                   veces: number; ultimo: number; arregloQueFunciono?: string }
  registrarFallo(ledger, herramienta, error): ledger        // claseError = firma normalizada
  registrarExitoTrasCambio(ledger, herramienta, nota)       // cierra el ciclo: qué desvío funcionó
  leccionesPara(ledger, herramienta): string | null          // nota inyectable al turno
  ```
- **Persistencia:** `server/ledgerDisco.ts` — JSON en `CEREBRONICO_DATOS/ledger_bucle.json` (mismo patrón de `continuidadPlan` pero a disco; cap 200 lecciones, LRU por `ultimo`).
- **Cableado (≤4 líneas server.ts):** en `runOllamaAgentLoop`, junto a `learnFromToolFailure` → `registrarFallo`; cuando una herramienta tiene éxito tras ≥2 fallos de la misma → `registrarExitoTrasCambio`; y en la nota de `notaContinuidad()` → adjuntar `leccionesPara(...)` de las herramientas del plan.
- **Criterio de aceptación:** tras un ciclo fallido real, el turno nuevo lleva en su system-note «NO reintentes `run_command: npm x` así: falló 3× por EADDRINUSE; funcionó `Detener` primero». Prueba: suite nueva `retroalimentacion.test.ts` con disco simulado.

## F2 · VERIFICACIÓN DE PROMESAS (evidencia antes de decir «hecho»)
**Objetivo:** cerrar la laguna «sin explicación / dice listo y no lo está».

- **Nuevo módulo puro** `src/engine/verificadorBucle.ts`:
  ```
  type Promesa = { accion: "escribir"|"editar"|"comando"|"arranque-sandbox"|"imagen"; ruta?: string; objetivo?: string }
  extraerPromesas(turnoModelo, plan): Promesa[]                  // de los tool_calls del turno
  veredicto(p: Promesa, evidencia: Evidencia): "cumplida"|"parcial"|"incumplida"|"sin-evidencia"
  ```
- **Evidencias deterministas ya disponibles sin código nuevo:** `read_file` post-escritura, salida de `run_tests`, probe de puerto 3500 (existe en telemetría), existencia de archivo para `cerebronico:imagen` (la orden ya sabe qué archivo debe producir).
- **Ciclo:** al cerrar el turno (decisión `cerrar` de `decidirBucle`), si hay promesa `incumplida|sin-evidencia` → NO cierra con «listo»: una ronda extra (máx 2, contadas en el presupuesto de reparación) con directiva «verifica o corrige»; si persiste → `informeHonesto` lista cada promesa con su veredicto y la evidencia que falta.
- **Cableado (≤6 líneas):** hook en la rama `accion:"cerrar"` → `rondaDeVerificacion(decision, promesas)` (pura, en bucleAutonomo: extiende `Decision` con `verificaciones?`).
- **Aceptación:** el caso de la langosta (HTML con `<img>` a archivo inexistente) produce `incumplida` y el informe final lo dice con nombre y ruta. Suite: 12 casos mínimo.

## F3 · PRESUPUESTO ADAPTATIVO (el techo que aprende)
**Objetivo:** `techoDePasos` hoy es fórmula fija + +2 por fallo. Que conozca su propio historial.

- Extensión pura en `bucleAutonomo.ts`: `techoDePasos(tareas, base, tope, fallos, leccionVelocidad?)` donde `leccionVelocidad` = pasos medios reales que costaron tareas de este tamaño (llega del F1 ledger: `{tamanyoPlan: promedioPasos}`). Regla: `base = clamp(6, 20, promedio + 4)`; nunca supera `PASOS_TOPE`.
- Origen del dato: al cerrar turno con plan completo, registrar `pasosUsados/tareas` en el ledger (1 línea de cableado).
- **Aceptación:** plan de 3 tareas que históricamente cuesta 14 pasos no muere en `techo=8` (hoy PASOS_BASE=8+3·3=17 ok, pero un plan de 12 tareas con modelo lento sí se cortaba). Prueba con datos sintéticos de ledger.

## F4 · CANAL DE CORRECCIÓN DEL USUARIO (feedback explícito, el más humano)
**Objetivo:** que «no, eso no» y «✓ así sí» sean datos, no chat perdido.

- **UI (solo `src/`, sin ratchet):** dos chips diminutos bajo cada mensaje asistente terminado: `✓ sirvió` / `✗ no, corregir`. Estado en `App.tsx`, POST `nuevo router server/routers/feedbackTurno.ts` → `POST /api/feedback/turno {turnoId, veredicto, nota?}`.
- **Destino:** `✗` escribe Lección en F1 (`herramienta:"turno"`, `claseError:"corregido-por-usuario"`) y marca el `continuidadPlan` del turno con `rechazado:true` → la nota del siguiente turno empieza con «EL USUARIO CORREGIR el intento anterior: <nota>. No repitas ese enfoque; continúa el plan por otro camino.» `✓` sube contador de acierto a las herramientas del turno (F3 lo usa como velocidad buena).
- **Aceptación:** corregir un turno cambia el comportamiento del siguiente sin reiniciar la tarea (complementa B1.2).

## F5 · VIGÍA DEL BUCLE (retroalimentación desde el tiempo, anti-«se tranca»)
**Objetivo:** el bucle sabe cuándo está esperando a algo LENTO y lo dice/negocia, en vez de parecer colgado.

- `SeñalBucle` gana `cronos?: { msHerramientaActual, umbralEsperadoMs }` (puro). Umbral esperado viene del F1 (medias de duración por herramienta/proyecto).
- `decidirBucle`: si `msHerramientaActual > 2×umbral` y no hay respuesta → decisión nueva `{accion:"informar-espera"}` → el server emite un task-event «sigo esperando `npm install` (X min; la media aquí es Y) — puedo cancelar (Detener) o seguir». NO mata el proceso: informa. El usuario decide.
- Reutiliza el latido del VIGILA-ARRANQUE (ya existe en cliente) y el `run_tests`/`sandbox/status` del server.
- **Aceptación:** ningún turno del bucle pasa >45 s sin que el chat diga QUÉ espera y CON QUÉ historial.

## F6 · INFORME HONESTO v2 (consolidación)
`informeHonesto` pasa de lista de tareas a parte de cierre con: promesas→veredictos (F2), lecciones usadas (F1), pasos reales vs presupuesto (F3), correcciones del usuario pendientes (F4). Todo calculado en `bucleAutonomo.ts` (puro); el server solo renderiza.

---

## Orden de ejecución y esfuerzo (créditos ≈ pasos de agente)

| Fase | Riesgo | Esfuerzo | Depende de |
|---|---|---|---|
| F1 ledger | bajo (añaditivo) | 1 sesión | — |
| F2 verificación | MEDIO (toca el cierre del turno) | 1–2 sesiones | F1 (guardar evidencia) |
| F4 canal usuario | bajo | 1 sesión | F1 |
| F5 vigía | bajo | 1 sesión | F1 (umbrales) |
| F3 presupuesto | bajo | media sesión | F1, F2 |
| F6 informe v2 | bajo | media sesión | F2, F4 |

**Gate de cada fase (no negociable, estilo casa):** `node scripts/validar.mjs` 0 fallos · `superficie --verificar` CONTRATO INTACTO (server.ts ≤ presupuesto, con extracción compensatoria ANTES de regenerar contrato) · `npm run build` · manifiesto regenerado · suite `retroalimentacion.test.ts` en catálogo. Rollback: `quirofano-cli` (existe el flujo revertir).

**Riesgos y mitigaciones:**
1. *Ronda extra de F2 puede alargar turnos* → tope duro 2 rondas, contadas en el presupuesto de reparación (no sumadas al tope).
2. *Ledger envenenado por un fallo único* → una Lección solo se inyecta con `veces ≥ 2`; decae a los 30 días.
3. *El trinquete* → cada fase declara su extracción compensatoria ANTES de tocar server.ts (candidatas listadas arriba).
4. *F4 abre puerta a spam* → un veredicto por turno, sin contador global.

## Qué NO es este plan (límites honestos)
No toca la calidad del modelo nube que finge imágenes (F2 lo DETECTA y lo INFORMA; curarlo es asunto del proveedor). No persiste entre proyectos (el ledger es por raíz de datos). No añade paralelismo de herramientas (otra campaña).

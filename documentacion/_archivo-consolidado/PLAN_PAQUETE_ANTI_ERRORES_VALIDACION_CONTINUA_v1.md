# PLAN — PAQUETE ANTI-ERRORES EN TAREA: BUCLE DE VALIDACIÓN CONTINUA
**Lema: «aunque se demore un poco, mejor estar seguro».**
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)
Anclas verificadas hoy sobre `work/app`: server.ts **11 494 líneas** (presupuesto del contrato **11 495**, rutas **138**) · `scripts/quirofano-cli.mjs` con `iniciar`(snapshot)/`estado`/`revertir` · herramientas `run_tests`, `revisar_cambios`, `deshacer_cambios` en `src/engine/toolRegistry.ts` · preflight de arranque ya existente (`server.ts:1138, 7222, 8016`) · suites python en `tests/*.py` (`autonomia_test.py`, `comprehensive_e2e_test.py`, `mcp_puente_test.py`).

---

## 1. Qué es este paquete y con qué se come al plan F1–F6

Este documento define el **arnés de seguridad** de la autotarea: después de CADA paso del bucle, una validación determinista decide si se avanza, se repara o se retrocede. El plan `PLAN_EXPANSION_RETROALIMENTACION_BUCLE_v1.md` (F1–F6, aún no implementado) aporta el **aprendizaje** (memoria de fallos, umbrales, veredictos de promesas). Este paquete funciona sin F1–F6, pero con F1/F2 se vuelve mucho más barato (valida menos cosas porque recuerda las ya validadas). Dependencias: §V3 y §V5 usan F1 (ledger) y F2 (verificador) — marcadas como [requiere F#].

**Regla de oro:** un paso NO cuenta como hecho por decisión del modelo, sino por evidencia verificable. La latencia extra aceptada es el precio; el estado rojo NUNCA se propaga.

## 2. Arquitectura: el bucle de validación continua (5 anillos)

```
[PRETAREA] → [MICRO-PASO → VALIDO → avanza/repara] → [CHECKPOINT cada N pasos]
     ↓ no pasa                                    ↓ invariante roja
   NO ARRANCA                                   REVERTIR al checkpoint verde
     ↓ pasa                                     ↓ verde
[TRABAJO] → [GATE FINAL: verificar+build+contrato+manifiesto] → [LISTO con informe de evidencia]
```

### V1 · PRETAREA (pre-flight de la autotarea) — extiende el preflight existente
- **Entorno:** Ollama vivo y con RAM libre suficiente para el modelo del turno (ya medible con `ollama_estado`/`recursos_maquina` del pack sistema, v1.16.4) · puertos 3000/5000/3500 sanos · proyecto dentro de `CEREBRONICO_DATOS`.
- **Plan validado:** función pura nueva `validarPlan(plan)` en `src/engine/bucleAutonomo.ts`: toda tarea tiene verbo de acción + criterio de término observable (ruta, test, comando); sin ciclos; ≤ 20 tareas. Un `set_plan` inválido NO se ejecuta: devuelve al modelo la lista de defectos (una ronda de corrección del plan, barata).
- **Línea base:** `quirofano-cli iniciar "autotarea <turno>"` ANTES del primer paso de escritura (snapshots a `.revisiones/` ya es el mecanismo de la casa).
- Coste: ~3–5 s. Si algo falla: el bucle informa y no gasta ni un token en trabajar sobre terreno roto.

### V2 · MICRO-BUCLE POR PASO (el corazón: validar antes de avanzar)
Después de cada `tool_call`, validación determinista según el tipo (todo con funciones puras nuevas en `src/engine/validaPaso.ts`):

| Paso | Validación inmediata | Si falla |
|---|---|---|
| `write_file` / `edit_file` / `pc_write_file` | read-back byte a byte + parse por extensión: `tsc --noEmit` filtrado al archivo tocado, `python -m py_compile`, `node --check`, JSON parse | escalarón 1 de la escalera (cambiar de camino) |
| `run_command` / `pc_exec` | exit code + `detalleDeSalida()` (ya existe, v1.6.26) clasificado: éxito / fallo de código / fallo de entorno | entorno → avisar y parar; código → escalón 2 (diagnóstico) |
| `run_tests` | parsear salida: N pasaron / M fallaron con nombres | el plan no avanza hasta tests verdes o escalón 3 |
| arranque sandbox | probe de puerto 3500 + `hint`/`logTail` (ya devuelve el server v2.1) | no reintentar a ciegas: informar causa |
| `cerebronico:imagen` / entregables | existencia del archivo prometido + tamaño > 0 [requiere F2] | promesa `incumplida` en el informe |

**Regla de propagación:** un paso sin validar = tarea sigue `pending`. El modelo no puede marcar `update_task: hecha` si la evidencia no está en el historial del turno (chequeo puro `evidenciaSuficiente(historialBucle, tarea)`).

### V3 · CHECKPOINTS DE INVARIANTES (cada N pasos y tras cada tarea `hecha`)
- **Barato (cada 3–4 pasos o 1 tarea):** `tsc --noEmit` + `node scripts/superficie.mjs --verificar` (contrato 138 rutas + trinquete 11 495) — ambos ya existen y tardan segundos.
- **Medio (cada ~8 pasos):** `node scripts/validar.mjs` completo (75 suites / ~4 012 comprobaciones).
- **Al romper una invariante:** `quirofano-cli revertir` al último snapshot verde ANTES de seguir (el árbol vuelve a estado seguro; el trabajo del tramo rojo se rehace, no se propaga). Se registra la lección [requiere F1].
- Los checkpoints guardan su propio id de snapshot en el estado del turno (`server/continuidadPlan.ts` ya persiste estado entre turnos: añadir campo `checkpointVerde`).

### V4 · GATE FINAL (nada se dice «listo» sin pasar la puerta)
Secuencia obligatoria antes del `cerrar` de `decidirBucle`:
1. `validar.mjs` completo 0 fallos · 2. `build` OK · 3. `superficie --verificar` INTACTO · 4. `manifiesto --verificar` (o regenerar si tocó fuentes) · 5. veredicto de promesas [requiere F2].
Si alguno falla → el turno NO cierra con «listo»: cierra con `informeHonesto` ampliado (F6) listando qué puerta quedó roja y el checkpoint al que se puede revertir.

### V5 · EL VELADOR (meta-vigilante del propio bucle) [requiere F5]
Máquina de estados mínima por turno: `verde | rojo | esperando | gastado`.
- **esperando:** herramienta > 2× su umbral histórico → informa QUÉ espera (nunca mata solo).
- **gastado:** presupuesto de pasos agotado → cierre honesto con plan pendiente (ya existe) + el siguiente turno arranca OBLIGADO a continuar (nota de `continuidadPlan`, v1.16.5).
- **rojo persistente:** 2 checkpoints rojos seguidos → revertir + pedir una sola pregunta al usuario (único punto donde el arnés permite preguntar; el resto sigue solo).

## 3. Dónde vive cada pieza (disciplina de trinquete: server.ts ≤ 11 495)

| Pieza | Ubicación | Líneas en server.ts | Compensación |
|---|---|---|---|
| `validarPlan`, `evidenciaSuficiente` | `src/engine/bucleAutonomo.ts` (puro) | 0 | — |
| `validaPaso.ts` (read-back/parsers) | `src/engine/validaPaso.ts` nuevo | ~6 (hook post-tool) | extraer bloque `learnFromToolFailure` → módulo |
| checkpoints + revertir | `server/checkpointVerde.ts` nuevo (usa quirófano por API interna) | ~4 | extraer `StreamLike`+`emit` de quick-action |
| gate final | rama `cerrar` de `decidirBucle` + `server/gateFinal.ts` | ~3 | extracción de anti-repetición `repeatCount` a pura |
| Velador | `src/engine/velador.ts` (puro) + señal en `SeñalBucle` | ~2 | — |
| UI chips de evidencia (✓/✗ por paso en el tablero) | solo `src/components/*` | 0 | — |
**Tope duro: +15 líneas server.ts por fase, cada una con su extracción nombrada arriba; el contrato se regenera SOLO después de que `--verificar` dé INTACTO con las extracciones ya hechas.**

## 4. Coste (el «aunque se demore» cuantificado)
- Micro-validación por paso: +1 lectura o +1 proceso corto → ~0.5–3 s/paso; un turno de 12 pasos ≈ +20–40 s.
- Checkpoint barato cada 3–4 pasos: tsc ~3–6 s + superficie <1 s.
- `validar.mjs` por checkpoint medio: ~2–4 min — solo cada ~8 pasos y al cerrar (hoy se corre 1 vez por entrega; aquí 2–4 veces por turno grande).
- **Ahorro que lo paga:** el tiempo que hoy se pierde en «empezó otra vez», rehacer un turno rojo descubierto al final, o un sandbox colgado, es mayor que el arnés.

## 5. Fases de ejecución y gates

| Fase | Contenido | Criterio de aceptación (gate de la casa: verificar 0 fallos + contrato INTACTO + build + manifiesto) |
|---|---|---|
| A1 | `validarPlan` + `evidenciaSuficiente` (puras) + suite `antierrores.test.ts` | plan defectuoso rechazado con defectos legibles; 100 % pruebas puras |
| A2 | `validaPaso` + hook post-tool + read-back | escribir TS roto no marca la tarea hecha; se ve el escalón de reparación |
| A3 | `checkpointVerde` + revertir automático en invariante roja | romper tsc a mitad de turno → árbol vuelve verde solo; lección registrada |
| A4 | gate final en `cerrar` | es imposible cerrar con verificar rojo: el informe dice qué puerta falta |
| A5 | Velador + umbrales [F5] | ningún paso espera >2× umbral sin mensaje de QUÉ se espera |
| A6 (opcional) | paralelizar read-back con el siguiente paso (promesa en vuelo) | recupera ~30 % de latencia sin perder seguridad |

## 6. Riesgos y mitigaciones
1. **Falsos positivos del parser de tests** → la validación NUNCA borra trabajo, solo bloquea el avance; el humano puede forzar paso con «continúa de todos modos» (override registrado como lección).
2. **Turnos eternos por validación infinita** → topes: 2 re-validaciones por paso, 2 checkpoints rojos → revertir+preguntar (V5).
3. **Quirófano llenando `.revisiones/`** → cap de 10 snapshots por turno con limpieza LRU (la casa ya limita por tamaño en aduana).
4. **server.ts** → cada hook delega a módulo; prohibido crecer sin extracción nombrada en el mismo commit.

## 7. Límites honestos
- No elimina el error del modelo; lo CONTIENE: ningún error cruza un checkpoint.
- Las suites python (`autonomia_test.py`, `comprehensive_e2e_test.py`, `mcp_puente_test.py`) NO están hoy en `validar.mjs`; integrarlas al gate final es tarea aparte (requiere entorno python en el gate).
- F1/F2/F5 son prerequisitos declarados de V3-cierre-lecciones, V2-imagen y V5; este plan los referencia como el otro documento, no como código existente.

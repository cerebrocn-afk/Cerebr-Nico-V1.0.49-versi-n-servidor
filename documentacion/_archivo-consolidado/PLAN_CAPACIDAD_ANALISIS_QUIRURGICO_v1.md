# PLAN — CAPACIDAD DE ANÁLISIS QUIRÚRGICO DE INGENIERO DE SOFTWARE
**Objetivo:** que ante un bug, el agente NO «toque a ver si mejora»: que opere como un ingeniero senior — localiza, traza, encuentra la causa raíz, diseña el parche MÍNIMO, vacuna con test de regresión y cierra con evidencia.
**Base:** Cerebronico v1.16.5 · **Fecha:** 2026-09-27 · **Estado:** plan (sin código aplicado)

**Anclas verificadas hoy sobre `work/app`:** `src/engine/quirofano.ts` (versión 1.0.0; `UMBRAL_AMPUTACION=0.35`, `UMBRAL_AVISO=0.12`, `MIN_LINEAS_PARA_CIRUGIA=30`, `RUTAS_DE_RIESGO`, `normalizarRuta`) · `src/engine/importChecker.ts` (`extraerImportsRelativos`, `findMissingImports`, `buildStubs`) · `src/engine/dependenciasProyecto.ts` (`extraerPaquetesConOrigen`) · herramientas existentes: `search_in_files`, `find_symbol`, `read_file_range`, `run_tests`, `revisar_cambios`, `deshacer_cambios`, `git_diff` · `FaseBucle = "crear"|"modificar"|"reparar"` (`bucleAutonomo.ts:78`) · server.ts 11 494 l. / presupuesto 11 495 · **NO existe** ningún concepto de causa raíz, cadena causal ni radio afectado (la palabra `radio` solo vive en `tema.ts` como borde).

**Lo que hay y no basta:** el Quirófano actual es la MÁQUINA (snapshots, reversión, umbrales de amputación) pero el cirujano es la improvisación del modelo: no hay protocolo obligatorio, no hay evidencia de que el diagnóstico preceda al bisturí. Este plan pone el protocolo.

---

## 1. El protocolo: 7 estaciones (ninguna se salta, ninguna se firma sin evidencia)

```
Q1 SÍNTOMA → Q2 LOCALIZACIÓN → Q3 TRAZA (radio afectado) → Q4 CAUSA RAÍZ
     → Q5 DISEÑO DEL PARCHE MÍNIMO → Q6 VACUNA (test rojo primero) → Q7 CIERRE CON EVIDENCIA
```

- **Q1 Síntoma:** reproducir ANTES de opinar. Capturar error exacto (`detalleDeSalida` v1.6.26 ya elige la línea causa), comando que lo dispara, entorno (RAM/puertos del pack sistema). Salida: `Hallazgo.sintoma` con cita textual.
- **Q2 Localización:** `search_in_files` + `find_symbol` + `read_file_range` (existen). Salida: archivo:símbolo con **rango leído, no supuesto**.
- **Q3 Trazo:** grafo de importaciones estático (base: `extraerImportsRelativos` + `extraerPaquetesConOrigen`) en DOS direcciones: de dónde depende el sitio (corriente arriba) y **quién lo consume — radio afectado** (corriente abajo). Salida: `RadioAfectado { importa: [], consumidoPor: [], testsCercanos: [] }`.
- **Q4 Causa raíz:** cadena causal explícita `síntoma ← … ← causa` (máx 5 eslabones, cada uno con evidencia o marcado `hipótesis`). Discriminador duro: **la causa es el último eslabón que, arreglado, hace innecesario tocar los anteriores**. Si hay 2+ candidatas → `probar_causa` (test dirigido) antes de cortar.
- **Q5 Parche mínimo:** el menor diff que mata la causa (no el que calla el síntoma). Reglas duras del módulo: toca archivos ⊆ radio ∪ causa; si el diff supera `MIN_LINEAS_PARA_CIRUGIA` o roza `RUTAS_DE_RIESGO`, exige justificación explícita; si puede tocar >35 % del archivo → bandera de **amputación** (replantear, no coser). Snapshot `quirofano iniciar` OBLIGATORIO antes del primer `edit_file`.
- **Q6 Vacuna:** test de regresión PRIMERO, en rojo, con nombre de la causa; luego el parche lo pasa a verde. Sin test posible (código no testeable), el informe lo declara y propone el seam — nunca lo esconde.
- **Q7 Cierre:** `run_tests` del radio afectado completo (no solo el test nuevo) + `revisar_cambios` + checkpoint verde (arnés anti-errores V3) + `informeQuirurgico` (plantilla: 7 estaciones con su evidencia).

## 2. Núcleo puro: `src/engine/analisisQuirurgico.ts` (fuera del trinquete)

```ts
export type Estacion = "sintoma"|"localizacion"|"traza"|"causa"|"diseno"|"vacuna"|"cierre";
export interface Hallazgo   { estacion: Estacion; evidencia: string; fuente?: string; hipotesis?: boolean }
export interface CadenaCausal { sintomas: string[]; eslabones: string[]; causa: string; candidatas?: string[] }
export interface RadioAfectado { importa: string[]; consumidoPor: string[]; testsCercanos: string[] }
export interface ParcheMinimo  { diff: string; archivos: string[]; lineas: number; justificacion?: string }

export function registrarHallazgo(bitacora: Hallazgo[], h: Hallazgo): Hallazgo[]
export function estacionHabilitada(bitacora, estacion): { ok: boolean; falta?: string }   // Qn no abre sin Qn-1 firmada
export function cadenaValida(c: CadenaCausal): { ok: boolean; defectos: string[] }        // eslabones ≤5, causa con evidencia
export function parcheEsMinimo(p: ParcheMinimo, causa: string, radio: RadioAfectado):
  { ok: boolean; avisos: string[] }                                                        // ⊆ radio, umbrales de quirofano.ts
export function informeQuirurgico(bitacora, cadena, parche, tests): string                 // plantilla Q7, honesta con lo no-verificado
```

Reutiliza umbrales de `quirofano.ts` (misma metáfora, misma casa: `UMBRAL_AMPUTACION` ya existe — acá significa «demasiado tejido para coser»).

## 3. Tres herramientas nuevas — pack `cirugia` en `toolRegistry.ts`

| Herramienta | Qué hace (determinista) | Base reutilizada |
|---|---|---|
| `trazar_dependencias` | grafo estático de un archivo/símbolo, bidireccional, con profundidad ≤3 | `extraerImportsRelativos` + índice de archivos |
| `radio_afectado` | quién rompe si esto cambia + tests que lo cubren | grafo inverso + patrones `*.test.*` |
| `probar_causa` | ejecuta UN test/pedido acotado para discriminar hipótesis (con timeout y salida resumida) | `run_tests` + `detalleDeSalida` |

Las tres `cheap: true` (un flash-lite también merece diagnosticar antes de cortar) y sin sandbox cuando el grafo está en el workspace.

## 4. Integración con el bucle (don esto se vuelve conducta, no documentación)

- **Fase nueva `analizar`:** `FaseBucle = "analizar"|"crear"|"modificar"|"reparar"`. `faseDelTurno` la asigna cuando el turno abre con reporte de fallo/bug (señal: cita de error o petición de diagnóstico) — ANTES de cualquier mutación.
- **Escalón 0 de la escalera de reparación:** hoy el escalón 1 es «cambiar de camino»; pasa a ser **protocolo completo Q1→Q5** (diagnosticar antes de re-intentar). La escalera existente no se elimina: se le pone delantal.
- **Guardia estructural (la clave para modelos chicos):** el server NO confía en la disciplina del modelo — `write_file`/`edit_file` sobre un archivo con bitácora quirúrgica incompleta en turno de diagnóstico devuelve al modelo la estación que falta (`estacionHabilitada`). El protocolo lo sostiene el arnés, no la inteligencia.
- **Presupuesto anti-parálisis:** máx 12 llamadas de exploración por análisis; al exceder, `decidirBucle` fuerza «elige la mejor hipótesis y decídela como tal en el informe» (el Velador del plan anti-errores lo cronometra).
- **Conexión con los otros dos planes:** Q6/Q7 son el gate V2/V4 del arnés anti-errores; cada `probar_causa` alimenta `observar()` del plan de probabilidades (p de que la hipótesis sea la causa = tasa histórica de ese `claseError`).

## 5. Cableado y trinquete (server.ts ≤ 11 495, hoy 11 494)

Tope **+8 líneas**: 3 casos de herramienta (3), hook `estacionHabilitada` en el dispatcher de `write_file/edit_file` (2), fase `analizar` en la señal del bucle (2), registro del pack (1). **Compensación nominada:** extraer el bloque de `parseQuickAction` que ya quedó partido en v1.16.5 (el resto de `extractFilename`/`extractText` → `server/quickParser.ts`, −14 líneas). El contrato se regenera solo con `--verificar` INTACTO.

## 6. UI
- Panel «Bisturí» (tab junto a Planificador): las 7 estaciones con semáforo y evidencia de cada una; clic en un eslabón abre el archivo en el rango citado.
- El informe Q7 se renderiza con formato: síntoma → cadena → parche (diff) → tests (rojo→verde) → veredicto honesto.

## 7. Fases y gates

| Fase | Contenido | Aceptación (gate casa: verificar 0 · contrato INTACTO · build · manifiesto) |
|---|---|---|
| D1 | `analisisQuirurgico.ts` + suite `cirugia.test.ts` (~35 casos: estaciones, cadena, parche mínimo con fixtures de radio) | protocolo verificable 100 % puro |
| D2 | pack `cirugia` (3 herramientas) + extracción compensatoria | `trazar_dependencias` sobre este mismo server.ts da grafo correcto |
| D3 | fase `analizar` + escalón 0 + guardia estructural | bug sembrado en fixture: el agente NO puede editar sin Q1-Q4 firmadas (prueba de integración) |
| D4 | Q6 vacuna obligatoria + informe Q7 + Panel Bisturí | test rojo→verde exigido; informe con evidencia o palabra «sin verificar» |
| D5 | integración probabilidades (p de hipótesis) + Velador (anti-parálisis) | ranking de candidatas por tasa histórica |

## 8. Riesgos y mitigaciones
1. **Parálisis por análisis** → presupuesto de 12 exploraciones + forzar hipótesis razonada (documentada como hipótesis).
2. **Grafo estático ciego a imports dinámicos** (`require(variable)`, rutas construidas) → el radio se muestra con `confianza` explícita y `probar_causa` como red; límite declarado.
3. **Modelo que finge el protocolo** (escribe hallazgos vacíos) → `estacionHabilitada` exige evidencia con fuente citada (archivo:range que el propio server puede releer y comprobar que existe).
4. **Parches «mínimos» que matan la mosca a cañonazos** → `parcheEsMinimo` + umbrales de amputación de `quirofano.ts`; >35 % del archivo = replantear.

## 9. Límites honestos
- No es análisis semántico/AST completo: el grafo es de imports estáticos (TS/JS/Python por regex probada de `importChecker`); para cross-language se queda en el radio declarado.
- No reemplaza al ingeniero: impone la DISCIPLINA del ingeniero (orden + evidencia), que es justo lo que un flash-lite no trae de fábrica.
- Depende de los planes hermanos solo para sus extras (probabilidades, Velador); D1-D4 funcionan sin ellos.

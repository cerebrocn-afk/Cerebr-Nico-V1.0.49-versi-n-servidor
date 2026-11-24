# Comparativa: Especificación Maestra v3.0 vs. Proyecto CerebroNico IDE v1.56.7

> **Qué es este documento.** Revisa, punto por punto, si lo que pide la
> *Especificación Técnica Master v3.0* está realmente implementado en el
> código del IDE, y dónde la realidad se desvía (a propósito) de la
> especificación. Está escrito para leerse rápido: cada apartado dice
> **QUÉ PIDE la spec**, **QUÉ HAY en el proyecto (archivo real)** y un
> **VEREDICTO** (✅ cumple · 🟡 adaptado/parcial · ⚠️ diverge a propósito).
>
> Fecha de la revisión: 2026-10-11 · Autor del proyecto: Mario Nicolás Quintero.

---

## Resumen en una frase

El proyecto cumple el **espíritu** de la especificación de forma muy completa
(anti-alucinación, puertas deterministas, memoria viva, cascada local-nube),
**pero** la spec describe una arquitectura centrada en **Python + FastAPI** y el
producto real es un **IDE en TypeScript/Electron** con un lado Python auxiliar.
Por eso varios detalles *literales* están adaptados al stack real (y esos
cambios están documentados dentro del propio código).

| # | Protocolo de la spec | Veredicto | Dónde vive en el proyecto |
|---|----------------------|-----------|---------------------------|
| 2 | Cascada Local-Nube | 🟡 adaptado | `server.ts` + `src/engine/*`, `core-agent/`, `agent_bridge_5000.py` |
| 3.1 | Fragmentación <150 líneas + diff quirúrgico | 🟡 adaptado | `compactor.ts`, `quirofano.ts`, `inferenceBuffer.ts` |
| 3.2 | Bucle fantasma → validación por hash MD5 | 🟡 adaptado | `ejecucionFantasma.ts`, `capaTransaccion.ts`, `quirofano.ts` |
| 3.3 | Plantilla perezosa → firma AST (`ast.parse`) | 🟡 parcial (honesto) | `validadorAST.ts`, `aduanaArbol.ts` |
| 3.4 | Cortes/token death → timeout 15s + auto-continuación | ⚠️ diverge | `fetchCloud.ts` (120s), `continuidadPlan.ts` |
| 3.5 | Falso verde → wiring check (`include_router`) | 🟡 adaptado | `importChecker.ts`, `lib-cableado.mjs` |
| 4 | Bucle de aprendizaje en caliente (`memory.md`) | ✅ cumple | `memoria.md`, `hindsight_daemon.py`, `memoriaResiliente.ts` |
| 5 | Checklist de integridad (runtime) | ✅ cumple | `gatesObra.ts`, `cerradura.ts`, `manifiesto.mjs`, `superficie.mjs` |

---

## 2. Arquitectura de Enrutamiento Híbrido (Local-Cloud Cascade)

**QUÉ PIDE la spec:** un **orquestador en Python** (lógica determinista),
espejos AST + validación de hash, un **sandbox FastAPI en el puerto 5000**,
capa nube con **Gemini Flash** (código/arquitectura) y **Zai Flash**
(parcheo/diffs), y un **modelo local 1B** en segundo plano para logs y
vectorización.

**QUÉ HAY en el proyecto:**
- El **orquestador real está en TypeScript**, no en Python: `server.ts` +
  todo `src/engine/*` (más de 130 módulos deterministas). El lado Python
  existe pero es **auxiliar**: `core-agent/main.py`, `autonomia.py`,
  `scripts/hindsight_daemon.py` y el puente de PC `agent_bridge_5000.py`.
- **Nube Gemini + Z.ai (GLM):** sí implementado — `server/fetchCloud.ts`,
  `src/engine/herramientasNube.ts`, `enrutadorModelo.ts`, `modelTiers.ts`.
  Además soporta OpenRouter y Ollama local (más de lo que pedía la spec).
- **Modelo local 1B en segundo plano:** cubierto por Ollama en modo liviano
  (`ollamaBajoConsumo.ts`) + el demonio `hindsight_daemon.py` / `localRAG.ts`
  para analizar y vectorizar.
- **Espejos + hash:** `espejos_servidor/` + `src/engine/reflejo/*` con huella
  **SHA-256** (`reflejo/consejo.ts`, manifiesto del ZIP), no MD5.

**VEREDICTO 🟡 adaptado.** La idea de cascada local-nube está, y bien, pero el
«orquestador en Python» de la spec es en realidad TypeScript, y el **puerto
5000 NO es un sandbox FastAPI**: es el **puente de PC** (`agent_bridge_5000.py`,
un `http.server` con lista blanca de binarios, sin shell). El sandbox real es
el de Vite/preview del IDE. Hay un FastAPI de ejemplo aparte en `app/main.py`,
pero no es el núcleo que describe la spec.

---

## 3. Protocolos de Mitigación de Fallos (Anti-Alucinación)

### 3.1 Tamaño de código / errores SRC → fragmentación <150 líneas + diff quirúrgico

**QUÉ PIDE la spec:** dividir el código en bloques <150 líneas antes de
enviarlo a la nube y mandar solo el **diff quirúrgico** (bloque afectado + su
contrato), nunca el archivo entero.

**QUÉ HAY:** `compactor.ts` compacta contexto grande (archivos/logs) con
estrategias por tipo; `quirofano.ts` aplica el parcheo quirúrgico con puertas
(revierte si una tanda rompe la app); `inferenceBuffer.ts` gestiona el tamaño
de payload.

**VEREDICTO 🟡 adaptado.** La **intención** (no mandar archivos kilométricos,
parchear por bloque) está cubierta, pero **no existe la constante dura «150
líneas»**: la fragmentación es por estrategia/heurística, no por un corte fijo.

### 3.2 Bucle fantasma (falsa escritura física) → validación por hash MD5

**QUÉ PIDE la spec:** calcular el **hash MD5** del archivo antes y después de
la inyección; si no cambia, rechazar la escritura y exigir reenvío.

**QUÉ HAY:** el proyecto ataca el mismo defecto pero con **otra mecánica**:
`ejecucionFantasma.ts` (prohíbe inventar herramientas/puentes y corta el bucle
«hazlo/no puedo»), `capaTransaccion.ts` (clona el mundo, aplica y confirma solo
si la edición es válida) y las puertas del `quirofano.ts`. El hash SHA-256 se
usa para el **manifiesto/espejo del ZIP**, no como verificación de escritura
física por archivo.

**VEREDICTO 🟡 adaptado.** Mismo objetivo (que no haya escrituras fantasma),
**mecanismo distinto**: capa transaccional + espejos en vez de comparar MD5
antes/después. En la práctica es más fuerte que el MD5 (evita además las
«herramientas fantasma»), pero NO es literal a la spec.

### 3.3 Plantilla perezosa (clon estético) → firma estructural AST (`ast.parse`)

**QUÉ PIDE la spec:** extraer el árbol de funciones/rutas/decoradores con
`ast.parse` y bloquear si la firma estructural es idéntica a la plantilla base
pese a pedir funcionalidad nueva (plagio estructural).

**QUÉ HAY:** `validadorAST.ts` define la **interfaz** del analizador AST y, hoy,
un **fallback regex PROVISIONAL** que se marca a sí mismo como
`motor:"regex-provisional"` y `confiable:false` — caza roturas gruesas
(delimitadores sin cerrar, regresión de contrato entre archivos) pero **no es
un AST real**. El AST de verdad (`ts-morph`/`@babel`) está aislado tras esa
interfaz, pendiente de instalar deps en la máquina del usuario.
`aduanaArbol.ts` complementa el control del árbol.

**VEREDICTO 🟡 parcial (y honesto).** La detección de **plagio estructural por
AST** NO está completa: hoy es un sustituto regex que el propio código admite
que no es fiable. Es la divergencia más relevante respecto a la spec, pero está
declarada sin disfraz dentro del archivo.

### 3.4 Cortes abruptos / muerte del token → timeout 15s + auto-continuación

**QUÉ PIDE la spec:** cliente HTTP con `timeout=15s` y un validador de bloques
Markdown; si un bloque ```` ``` ```` queda abierto al cortarse, enviar
automáticamente un comando de continuación.

**QUÉ HAY:** `fetchCloud.ts` usa un techo de **primer byte de 120s** (NO 15s), y
el comentario del archivo explica por qué se subió: a 15–45s se cortaban
proveedores lentos-pero-vivos (Z.ai sobrecargado tarda 50–90s) y el usuario «no
veía nada». La auto-continuación del plan existe en `continuidadPlan.ts` (no
reinicia el plan en cada mensaje), y hay manejo de bloques Markdown/JSON
parcial (`jsonParcial.ts`, pruebas `bloquesMarkdown`).

**VEREDICTO ⚠️ diverge a propósito.** El concepto (no morir en el corte,
continuar) está, pero el **número de la spec (15s) está cambiado a 120s** de
forma deliberada y documentada. Si la spec v3.0 debe ser la ley, aquí hay que
decidir: o se actualiza la spec a 120s, o se baja el timeout (no recomendado
por la experiencia real registrada en el código).

### 3.5 Falso verde (desconexión de rutas) → wiring check (`import` + `include_router`)

**QUÉ PIDE la spec:** analizar `main.py` para asegurar que cada módulo nuevo
tenga su `import` y su `app.include_router()`.

**QUÉ HAY:** `importChecker.ts` verifica de forma determinista que los imports
**relativos** de cada archivo existan (y crea stubs para que compile), y
`scripts/lib-cableado.mjs` + `verificar-cableado.mjs` revisan el **«cableado»**
de los módulos del motor contra una línea base (`cableado-baseline.json`:
CABLEADO / INDIRECTO / HUÉRFANO).

**VEREDICTO 🟡 adaptado.** La idea de «no dar verde si algo no está conectado»
está bien cubierta, pero sobre el stack real (imports TS/Vite y wiring del
motor), **no sobre `app.include_router()` de FastAPI** como pide la spec.

---

## 4. Bucle de Aprendizaje en Caliente (`memory.md`)

**QUÉ PIDE la spec:** convertir cada incidente corregido en regla persistente —
extraer la traza crítica del puerto 5000, inyectar las últimas 15 lecciones de
`cerebro_memory.md` en los prompts de nube, y consolidar la regla si la prueba
de humo HTTP da `200 OK`.

**QUÉ HAY:** `memoria.md` es la «pizarra viva» (escritura atómica + copia en
`memoria_history/`, compresión cada 10 interacciones); `scripts/hindsight_daemon.py`
guarda lecciones estructuradas (página «lecciones-de-error») y cruza el espejo
con el acta (`memoria.md`/`cerebro.md`); `memoriaResiliente.ts` y
`memoriaNegativa.ts` gestionan la memoria por perfiles de RAM y los errores a no
repetir.

**VEREDICTO ✅ cumple (adaptado).** El bucle de aprendizaje está implementado y
es incluso más rico que el de la spec (perfiles de RAM, memoria negativa,
histórico). El detalle «15 lecciones» / «200 OK» es la versión conceptual; en
el proyecto la consolidación la lleva el demonio hindsight + las puertas.

---

## 5. Checklist de Integridad del Orquestador (Runtime)

| Punto de la spec | Dónde se verifica en el proyecto |
|------------------|----------------------------------|
| 1. Payload dentro del contrato SRC | `inferenceBuffer.ts`, `compactor.ts`, `contrato-rutas.json` (trinquete de `server.ts`) |
| 2. El archivo cambió físicamente | `capaTransaccion.ts` + `quirofano.ts` (en vez de MD5) |
| 3. La huella de funciones cambió si se pidió lógica nueva | `validadorAST.ts` (parcial, regex-provisional) |
| 4. Endpoint montado y verificado | `importChecker.ts`, `lib-cableado.mjs`, `verificar-cableado.mjs` |
| 5. El servidor responde 200 real tras la inyección | prueba de humo del sandbox + puertas de `gatesObra.ts` |

**VEREDICTO ✅ cumple.** Las cinco comprobaciones tienen un responsable real en
el código; la nº2 y la nº3 están **adaptadas** (ver 3.2 y 3.3).

---

## Conclusión y recomendaciones

1. **El espíritu de la spec está muy bien implementado** — anti-alucinación,
   puertas deterministas, memoria viva y cascada local-nube son reales y
   verificables en el código.
2. **Tres divergencias que conviene decidir conscientemente:**
   - *Timeout 15s vs 120s (3.4):* el código ganó la discusión por experiencia
     real. Recomendación: **actualizar la spec a 120s** (techo de primer byte)
     y añadir la nota del techo de inactividad pendiente.
   - *Firma AST real (3.3):* es la brecha más grande. Queda como interfaz +
     fallback regex honesto. Recomendación: instalar `ts-morph` en la máquina y
     cablear el adaptador real cuando haya node_modules.
   - *«Orquestador en Python» / «sandbox FastAPI :5000» (sección 2):* la spec y
     el producto describen stacks distintos. Recomendación: **reescribir la
     sección 2 de la spec** para que refleje el stack TypeScript/Electron real
     y aclarar que el :5000 es el puente de PC, no un sandbox FastAPI.
3. **MD5 (3.2):** no hace falta añadirlo; la capa transaccional + espejos cubre
   mejor el mismo riesgo. Basta con dejarlo escrito en la spec como «mecanismo
   equivalente».

> En resumen: la adaptación es **mayormente correcta y a menudo superior** a lo
> que pedía la spec; lo que falta de verdad es (a) la firma AST real y (b)
> poner la spec al día con el stack y los números reales del proyecto.

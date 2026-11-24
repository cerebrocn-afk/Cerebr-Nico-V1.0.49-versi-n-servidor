# CHANGELOG v1.63.0 — EL BUCLE QUE RELEÍA LO MISMO OCHO VECES Y LLENABA EL CHAT

> **Nota de hoja de ruta.** La v1.63 ORIGINAL de la hoja de ruta era la Fase 3
> «contexto de bucle VISIBLE para el modelo» (que el modelo sepa que está en
> bucle, no solo que se le corte). El usuario **redefinió** esta v1.63 — override
> explícito — para atacar primero dos defectos concretos observados en el chat
> exportado. La Fase 3 original queda pendiente para una versión posterior.

Cada parada del proyecto = **DEFECTO SEMBRADO + CONTROL DE FALSO POSITIVO**. Esta
versión trae dos defectos atados y su falso positivo correspondiente.

## El síntoma, con números reales del chat exportado

- **msg5 = 328.000 caracteres**, **msg7 = 91.000 caracteres**. El modelo repitió
  **ocho veces seguidas** el ciclo idéntico
  `memory_estado → memory_listar_pages → read_file → read_file`,
  **volcando cada vez el mismo JSON completo** a la conversación. Ni avanzaba la
  obra ni cambiaba nada en disco: puro ruido que llenaba la ventana.

## Por qué las guardas existentes NO lo cazaban

El lazo suave (`anotarRepeticion` / `UMBRAL_REPETICION`) solo cuenta la **misma
clave CONSECUTIVA**. Como el modelo **rotaba entre cuatro herramientas**, dos
llamadas idénticas jamás caían pegadas y el contador se reiniciaba en cada
vuelta. Las otras guardas (`esRechazoReescrituraIdentica`, ventanilla de
sesión) solo miran **obra/reescritura**, nunca **lecturas exitosas repetidas**.

---

## item 1 · 🐞 DEFECTO SEMBRADO + FALSO POSITIVO — guarda de repetición de SOLO-LECTURA

- **Módulo PURO nuevo:** `src/engine/repeticionLectura.ts` (sin red, sin disco,
  testeable en aislado). Lleva un **libro de firmas por turno**: la firma de una
  lectura es `(herramienta + argumentos + SALIDA cruda)`. Si la MISMA lectura con
  la MISMA salida reaparece — **aunque sea intercalada con otras** — se
  **deduplica** (deja de reinyectarse el volcado, se responde con una nota breve);
  si insiste hasta el **tope**, se **corta el turno** con cierre honesto.
  - `UMBRAL_LECTURA_REPETIDA = 2` (2ª lectura idéntica → ya no se reinyecta).
  - `TOPE_LECTURA_REPETIDA = 4` (4ª → se cierra el turno).
  - Cubre `read_file`, `read_file_range`, `list_files`, `search_in_files`,
    `find_symbol`, `git_status/diff`, `revisar_cambios`, `pc_read_file`,
    `pc_list_dir`, `pc_info` **y todo pack de diagnóstico** `memory_*`/`mem_*`/`h_*`.
- **CONTROL DE FALSO POSITIVO (relectura legítima tras escribir el mismo path):**
  releer un archivo **después de escribirlo** es correcto — su contenido cambió y
  el modelo DEBE confirmar su obra. Toda escritura a un `path` deja una marca
  (`registrarEscrituraLectura`); la siguiente lectura de **ese** path **no se
  penaliza** y **reinicia** su cuenta. Así se distingue «bucle estéril» de
  «verificación tras cambio». Escribir `b.ts` **no** perdona el bucle de `a.ts`.
- **Cableado en las DOS ramas del motor** (`server.ts`):
  - Rama **Ollama** (`cuerpoBucleAgente`): se evalúa sobre la salida cruda antes
    de empujar al transcript; al tope se cierra vía `lazoLecturaO`.
  - Rama **Gemini**: idéntico, vía `lectorG` / `lazoLecturaG`.

## item 2 · 🐞 DEFECTO SEMBRADO — el diagnóstico no se vuelca crudo al chat

- **El bug:** en `compactor.ts`, `list_files`, `git_status` y **todo pack externo
  de diagnóstico** (`memory_estado`, `memory_listar_pages`, …) caían a la
  estrategia `"text"`. Como su salida es **un único JSON de una sola línea**, el
  recorte head/tail no mordía **nada** y el volcado entero (decenas de miles de
  caracteres) entraba en la conversación. Peor: la **rama Gemini ni siquiera
  compactaba** — empujaba el `crudo` tal cual.
- **La corrección:**
  1. `compactToolResult` ahora, para toda herramienta sin estrategia fija,
     deja que el compactador **autodetecte** el tipo; un JSON se resume a su
     **estructura y tamaños** (nunca el volcado). Las de diagnóstico
     `memory_*`/`mem_*`/`h_*` se fuerzan a `"json"`.
  2. La **rama Gemini** ahora aplica `compactToolResult` (antes empujaba crudo).
  - Medido: `memory_listar_pages` **48.803 → 668** caracteres; `list_files`
    **5.011 → 224**. El volcado crudo ya no llega al chat.

---

## Verificación

| Check | Resultado |
|---|---|
| `tests/repeticionLectura.test.ts` (nuevo) | **8 pruebas ok** — incluye el defecto sembrado (ciclo rotado ×8) y el falso positivo (relectura tras escritura) |
| `tests/cicloHerramientasOpenAICompat.test.ts` | ok (sin regresión) |
| bundle esbuild (`--bundle --platform=node --format=esm`) | **OK**, 3.9 MB, 0 errores |
| compactor diagnóstico | `memory_listar_pages` 48803→668 · `list_files` 5011→224 |
| `superficie --verificar` | **CONTRATO INTACTO** (12143 líneas, contrato regenerado a propósito; margen 1557 hasta el techo) |

## Archivos tocados

- **nuevo** `src/engine/repeticionLectura.ts` — módulo puro de la guarda de lectura.
- **nuevo** `tests/repeticionLectura.test.ts` — defecto sembrado + falso positivo.
- `src/engine/compactor.ts` — autodetección de tipo para diagnóstico (item 2).
- `server.ts` — cableado en ramas Ollama y Gemini (import + `lectorO/G`, dedupe,
  corte `lazoLecturaO/G`, Gemini ahora compacta).
- Versión **1.63.0** sincronizada en `package.json`, `package-lock.json`,
  `src/constants.ts` e `index.html`. Contrato de superficie regenerado.

## Pendiente (no entra en este zip)

- Fase 3 ORIGINAL de la hoja de ruta: contexto de bucle **visible** para el
  modelo (que sepa que está en bucle, no solo que se le corte).
- Fase 4: criterios de aceptación obligatorios en `set_plan` antes de «listo».

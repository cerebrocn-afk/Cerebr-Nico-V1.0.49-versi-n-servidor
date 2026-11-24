# PLAN MAESTRO V2 PRO — Plan, anexos y tablero unificados

Archivo MAESTRO generado el 2026-10-05. Unifica 4 documentos.
Los originales se conservan en documentacion/_archivo-consolidado/ (reversible).

## Indice (orden cronologico/version)

1. [ANEXO_A_EVIDENCIA_VERIFICADA.md](#anexo-a-evidencia-verificada-md) — version s/v
2. [ANEXO_B_CRITERIOS_DE_ACEPTACION.md](#anexo-b-criterios-de-aceptacion-md) — version s/v
3. [ANEXO_C_MAPA_OBJETIVO_Y_CONTRATOS.md](#anexo-c-mapa-objetivo-y-contratos-md) — version s/v
4. [PLAN_MAESTRO_CEREBRONICO_V2_PRO.md](#plan-maestro-cerebronico-v2-pro-md) — version 2


---

<a id="anexo-a-evidencia-verificada-md"></a>
## (1/4) ANEXO_A_EVIDENCIA_VERIFICADA.md

> **Fuente:** `plan-maestro/ANEXO_A_EVIDENCIA_VERIFICADA.md`  —  **version:** s/v  —  **bytes:** 14665
# ANEXO A — EVIDENCIA VERIFICADA

**Base:** `Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA` (590 entradas, 10,6 MB, sin `node_modules`)
**Fecha de auditoría:** 24-sep-2026 · **Método:** ejecución + lectura con `ruta:línea`

Este anexo existe para que puedas **re-verificar sin repetir el trabajo**. Todo lo que está aquí se obtuvo de una de estas tres fuentes, y cada afirmación dice de cuál viene:

- **[E]** = **ejecutado** en esta auditoría (comando y resultado).
- **[C]** = **leído en código** (con `ruta:línea`).
- **[D]** = leído en documentación del proyecto (siempre marcado, y siempre contrastado con el código cuando era posible).

------------------------------------------------------------------------

## 1. La puerta, ejecutada de verdad

### 1.1 Procedimiento

```
descomprimir el ZIP en un árbol limpio
cd ide/backend
npm ci                      # dependencias de cero, sin tocar package-lock.json
npx tsc --noEmit            # tipos
npm run validar             # suites + tipos
sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt    # antes y después
```

### 1.2 Resultados

| Comprobación | Resultado | Veredicto |
|---|---|---|
| `npm ci` | `node_modules` con 345 directorios, sin error | OK |
| `npx tsc --noEmit` | **exit 0 · 0 errores** | OK |
| `npm run validar` | **«VEREDICTO: TODO CORRECTO — 3372 comprobaciones, 0 fallos.» · «Tipos: 0 errores · 63 suites ejecutadas · 0 sin correr»** | OK |
| `sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt` | **22/22 `: OK`**, antes y después del gate | OK (árbol intacto) |

**Conclusión [E]:** las cifras que declara `INFORME_SANDBOX_v1.6.33.md:5` («3372 comprobaciones, 0 fallos, 63 suites, 0 errores de tipos») son **exactas y reproducibles**. Es la primera vez en el historial del proyecto que la puerta declarada y la puerta real coinciden sin matices — y merece quedar escrito.

### 1.3 Muestra de suites verdes (salida real, extracto)

```
tipos         el comprobador de TypeScript (tsc --noEmit) … 0 errores
planner       grafo, dependencias, paralelismo, cancelación … 64 correctas
roundtrip     ida y vuelta de formatos, pérdidas silenciosas … 460 correctas
consejoVotacion v1.6.33 · D7: el consejo vota de verdad … 40 correctas
catalogoHonesto v1.6.33 · CATÁLOGO: cada capacidad activa apunta a código real … 32 correctas
metricas      v1.6.32 · D8: la métrica real de inferencia … 28 correctas
guardProfundo v1.6.32 · CALIDAD: el parser real (esbuild) … 23 correctas
quirfanoPuertas v1.6.32 · SEGURIDAD: revisar y deshacer … 10 correctas
… (63 suites en total)
```

------------------------------------------------------------------------

## 2. Hallazgos, uno por uno, con su evidencia

### H1 · CRÍTICO — El puente ejecuta con shell sin lista blanca **[C]**

```python
# agent_bridge_5000.py:590-605
def _run_command(self, command: str, timeout: int = 120) -> dict:
    ...
    use_shell = True                    # :595
    proc = subprocess.run(
        command,
        shell=use_shell,                # :599
```

- Límite de longitud del comando: 4.096 caracteres (`:369,390`). **No hay lista blanca de binarios.**
- Endpoints que lo usan: `/api/exec`, `/api/agent|generate`, `/api/python` (`:368,:389,:565`).

### H2 · CRÍTICO — Rutas fuera de contención **[C]**

```python
# agent_bridge_5000.py:131-162
def resolve_pc_path(p: str) -> str:
    ...
    return os.path.abspath(p)           # :162 — las rutas absolutas pasan tal cual
```

- La única barrera es `_bloqueado_sistema`, una blocklist «corta por prefijo» (`:99-105`) → `~/.ssh`, `~/Documents` y similares quedan alcanzables.
- Contraste justo: en el lado Node **sí** está bien resuelto — `resolveSafePath` confina a `PROJECT_ROOT` con `path.relative` (`server.ts:662-669`). Es decir, el patrón correcto ya existe en el proyecto; solo no se aplicó en el puente.

### H3 · ALTO — El guard del sandbox es fail-open **[C]**

```ts
// server.ts:511-518
function sandboxAuthorized(req: Request): boolean {
  const token = process.env.ACCESS_TOKEN;
  if (!token) return true;              // :513 — sin token definido, autoriza todo
```

- `HOST` por defecto `127.0.0.1` (`:506`) → coherente en localhost.
- Pero el mismo guard es el que protege el caso LAN, y el sandbox fuerza `HOST: "0.0.0.0"` para Vite/`:3500` (`:7496`).

### H4 · ALTO — Endpoints mutadores sin guard **[C]**

**Con guard (13):** `:2278`, `:2286`, `:6839`, `:8083`, `:8109`, `:8362`, `:8434`, `:8510`, `:8594`, `:8676`, `:8852`, `:9109`, `:9122`.

**Sin guard, escribiendo en disco o lanzando procesos:**

| Endpoint | Qué hace | Líneas |
|---|---|---|
| `/api/export/android/prepare` | escribe en `PROJECT_ROOT` | `:5193,5249,5255` |
| `/api/extensions/forjar` | crea extensión en disco | `:5969,5979` |
| `/api/espejos/instalar` | instala espejos | `:4829,4878,4885` |
| `/api/extensions/:id/{enable,disable,delete}` | muta y borra | `:6327,6338,6345` |
| `/api/boveda/preparar` | escribe en disco real vía puente | `:4585,4590,4596` |
| `/api/engine/sync` | persiste KB | `:5359` |
| `/api/sandbox/flatten-root` | mueve ficheros | `:5516` |
| `/api/fondo` POST/DELETE | escribe/borra | `:6004,6039` |
| `/api/contenedor/inspeccionar` | `spawnSync("ffmpeg")` | `:6198,6250` |
| `/api/puente/medir` | acepta socket arbitrario | `:6070,6161` |

### H5 · ALTO — Monolito **[C]**

- `server.ts` **11.461 líneas** · **126 rutas** · **53 imports** de `src/` (`:19-287`).
- Handlers gigantes: `/api/ai/stream` `:9468-11179` (**1.711 L**) · `/api/sandbox/start` `:6838-8082` (**1.244 L**) · `/api/fs/sync` `:8851-9108` (257 L) · `/api/fs/nuclear-wipe` `:8675-8851` (176 L).
- 19 singletons mutables de módulo (lista completa en el plan, §2.1), incluidos `operacionQf` y `sandboxProc`, que son **estado de sesión compartido por todos los handlers**.

### H6 · ALTO — Pérdida silenciosa del workspace **[C]**

```ts
// src/utils/storage.ts:11
const MAX_LOCALSTORAGE_BYTES = 5 * 1024 * 1024;
// :36-38 y :62-63 — al superarlo: no guarda y avisa solo por consola
```

- No hay camino a IndexedDB para el workspace: indexDB se usa solo para la imagen de fondo (`indexedDBStorage.ts:12-15`).

### H7 · MEDIO — El Consejo atribuye, no ejecuta **[C]**

- Reparto: `votacionConsejo.ts:53-82` (23 acciones) · votantes `:91-94` · no votantes declarados `:95-98`.
- `pensarConsejo` (`src/engine/reflejo/consejo.ts:425-435`) atribuye; el motor decide.
- Especialistas sin `ejecutar` (`consejo.ts:103-116`); `ejecutarEntidad` responde «es especialista: se usa vía frase» (`consejo.ts:409`).
- Ejecutores reales: 5 tipos (`planExecutors.ts:82`) — `convertir:150`, `leer_archivo:180`, `generar_imagen:202`, `modelo:134`, `reflejo:264-307`.
- 16 acciones genéricas emiten bloque (`cerebroReflejo.ts:704-734`) sin rama ejecutora por acción.
- La suite prueba atribución, no ejecución: `tests/consejoVotacion.test.ts:119-121`.

### H8 · MEDIO — Endpoint huérfano y lecciones que no llegan a la memoria **[C]**

- Vivo: `selfImprovement.reflectOnTurn` (`selfImprovement.ts:378-444` ← `App.tsx:1464`) → `App.tsx:1268-1275` → `POST /api/engine/kb/learn` (`server.ts:5319`) → `engineKb.learnFromLesson` (`:5322`) + `localStorage` (`selfImprovement.ts:96`).
- Muerto: `POST /api/brain/lesson` (`server.ts:3786`) → `brain.addLesson` (`brain.ts:270`, escribe en `memoria.md`). **Sin llamadores.**
- Conclusión: la lección entra en la KB y en el navegador, **nunca en `memoria.md`**.

### H9 · MEDIO — La puerta es eludible **[C]**

> **CORRECCIÓN POSTERIOR, verificada al implementar (v1.7.0).** Al ejecutar la Fase 0 comprobé
> una parte de este hallazgo **y otra no**:
> - **CIERTO:** la lista de suites estaba hardcodeada, y una suite nueva no registrada **no corría**.
>   Probado en vivo: al añadir `tests/seguridadPuente.test.ts`, el sistema anterior la habría ignorado.
> - **MATIZ IMPORTANTE (mi diagnóstico inicial era exagerado):** el «falso verde» del camino del
>   contador **no es alcanzable** en este proyecto, porque **las 62 suites hacen `process.exitCode = 1`
>   al fallar** y el runner exige `code === 0` (`validar.mjs:301`). Una roja real no se escapa por ahí.
> - **CIERTO, y distinto de lo que escribí:** lo que sí estaba en silencio eran las **marcas `✗`**
>   cuando el contador decía 0 fallos. Eso no es un falso verde: es un rastro perdido. Ahora se **avisa**.
> - Al intentar «arreglarlo» con la regla del caso peor (`mal = max(mal, marcas)`) apareció un **falso
>   rojo** en `planner`, que imprime `✗ #2 revienta [fallida · io]` como **contenido** del test.
>   Corregido: manda veredicto + código de salida; las marcas se avisan. Detalle en
>   [INFORME_SANDBOX_v1.7.0.md](../../INFORME_SANDBOX_v1.7.0.md) §2.2.

- `scripts/validar.mjs:24-92`: array `SUITES` **hardcodeado** → una suite nueva sin registrar no corre nunca.
- Parser `extraer` (`:137-164`): si una suite imprime recuento y además líneas `✗`, gana el recuento (`:143-144`) → **falso verde**. Fallback a marcas `✓/✗` solo si `ok===0 && mal===0` (`:157-161`).
- Suite con formato distinto → «no ejecutada» (`:248`) → **falso rojo** (el bug exacto de la v1.1-HD del Quirófano).
- `todoBien` depende de `erroresTipos===0 && totalMal===0 && suitesEnRojo===0` (`:264`).

### H10 · MEDIO — Canon divergente y cero git **[C/E]**

- No existe `.git` y no hay dependencia de git en `package.json` **[E]**.
- Divergencia canónico vs árbol: `espejos.ts` **668 vs 852** líneas; `fondo.ts` **102 vs 187**; `quirofano.ts` 883=883 y `coreo.ts` 143=143 en sync.

### H11 · MEDIO — Manifiesto incompleto **[C]**

- `MANIFIESTO_SHA256_v1.6.33.txt`: **22 entradas** — 1 informe, 17 fuentes, **3 tests de ~60**, 5 ficheros de `dist/`.
- **No cubre:** `dist/assets/pdf.worker.min-*.mjs`, `dist/fondo-predeterminado.jpg`, `dist/icono-cerebronico.png`, `favicon.ico`, `.proyectos/.cerebro-db/kb.json`.
- `kb.json` es especialmente relevante: es **estado que las pruebas de humo modifican** (la convención del proyecto exige restaurarlo byte a byte antes de empaquetar).

### H12 · MEDIO — Duplicación de RAG **[C]**

- Existen `src/engine/localRAG.ts` y `src/utils/localRAG.ts`.
- El recuperador activo trabaja por token/clave, no por embeddings (`localRAG.ts:131,134-162`), con índice en memoria no persistente (`:21`).

### H13 · BAJO — Secretos en claro (riesgo local) **[C]**

- `.env` en texto plano (`app/utils/env_manager.py:8,15,19`).
- Contrapeso verificado: solo viaja `.env.example`; `electron-builder` no incluye `.env` en `files`/`extraResources` (`package.json`). El riesgo es **de la máquina**, no del paquete.

### H14 · Corrección de un falso hallazgo (queda escrito) **[C]**

La primera pasada de auditoría concluyó que `catalogoHonesto` **no llegaba** al bundle. **Es falso**, y lo verifiqué antes de escribirlo en el plan:

- `src/utils/contextCache.ts:39` importa `catalogoHonesto`.
- `contextCache` es consumido por `src/App.tsx`, `src/components/Header.tsx` y `src/components/RightSidebar.tsx`.
- `contextCache.ts:109,112` exponen `DEFAULT_SKILLS_MD` / `DEFAULT_SKILLS_COMPACT` derivados del catálogo auditado.

Lo que **sí** es cierto: `server.ts` tiene **0 referencias** a `contextCache` **[E: `grep -c` = 0]**, y el sobre `hiddenFiles` que transporta `MEMORIA.md` y `skills.md` se ensambla en el **cliente** (tratado en `server.ts:9577,9672`). Es decir: el catálogo auditado viaja por un único portador, el navegador.

------------------------------------------------------------------------

## 3. Documentación contra código

| Documento (fuente) | Afirma | Código (evidencia) | Veredicto |
|---|---|---|---|
| `ROADMAP.md:20` | «el `dist/` que viaja en el ZIP es el viejo» | `dist/server.mjs:5799` = 1.6.33; contiene Quirófano (`:3041,:15041`) y `votacionConsejo` (`:10219`) | **desactualizado** |
| `ROADMAP.md:35` | D8 «cero referencias a `eval_count`/`ttft`» | `metricasInferencia.ts:77-102`; `server.ts:70,6174,11079-11095` | **desactualizado** |
| `ROADMAP.md:34` | D7 «SIN VERIFICAR» | `votacionConsejo.ts` + `consejoVotacion.test.ts` 40/40 | **desactualizado** |
| `ROADMAP.md:53` | D-P1 «código muerto» | `syntaxGuard` v3 con `transform` de esbuild (`server.ts:69` + 5 puertas) | **desactualizado** |
| `ROADMAP.md:56` | «convertir el catálogo a aspiracional» | `catalogoHonesto.ts` + `contextCache` cableado al cliente | **desactualizado** |
| `mejoras/cerebronico-quirofano-v1/aplicar-quirofano.mjs:8` | «server.ts (10.990 líneas)» | 11.461 líneas | **desactualizado** |
| `ide/SEGURIDAD_CREDENCIALES.md:19` | cita `MANIFIESTO_SHA256_v1.0.txt` | solo existe el de v1.6.33 | **referencia rota** |
| `ARQUITECTURA_CEREBRONICO_V8.md:108` | el puente original es «RCE documentado» y se descarta | el puente actual conserva `shell=True` sin lista blanca (`agent_bridge_5000.py:595-599`) | **el endurecimiento D3 quedó incompleto** |

------------------------------------------------------------------------

## 4. Qué método se usó para cada flanco

| Flanco | Cómo se auditó | Límite declarado |
|---|---|---|
| Núcleo y build | Inventario de rutas por `app.get/post/put/delete`, bloques por rango, singletons de módulo, bundle por búsqueda de cadenas | No se probó cada una de las ~90 anclas de parche una por una |
| Cerebro y memoria | Cruce `votacionConsejo` ↔ `planExecutors` ↔ `cerebroReflejo`; rastreo de llamadores de los endpoints de lección; lectura de `brain`/`localRAG` | No se revisaron los 10 espejos uno por uno |
| Producto y UX | Inventario de componentes por `wc -l`; montaje real por JSX de `App.tsx`; topes reales en `attachmentProcessor` y `storage` | Sin navegador: nada de esto es observación visual |
| Seguridad y entrega | Lectura de los guards y del puente; conteo de endpoints; `sha256sum -c` del manifiesto | **Sin pentest ejecutado** contra el puente en marcha |

------------------------------------------------------------------------

## 5. Reproducir esta auditoría en 5 comandos

```bash
unzip -q Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA.zip -d cerebro && cd cerebro
sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt          # 22/22 OK
cd ide/backend && npm ci
npx tsc --noEmit                                     # 0 errores
npm run validar                                      # 3372 · 0 fallos · 63 suites
```

Y para comprobar por tu cuenta los dos hallazgos críticos:

```bash
grep -n "use_shell = True" agent_bridge_5000.py                    # H1
grep -n "return os.path.abspath(p)" agent_bridge_5000.py           # H2
grep -n "if (!token) return true" server.ts                        # H3
```


---

<a id="anexo-b-criterios-de-aceptacion-md"></a>
## (2/4) ANEXO_B_CRITERIOS_DE_ACEPTACION.md

> **Fuente:** `plan-maestro/ANEXO_B_CRITERIOS_DE_ACEPTACION.md`  —  **version:** s/v  —  **bytes:** 12632
# ANEXO B — CRITERIOS DE ACEPTACIÓN

**Regla que gobierna este anexo:** una fase **no se declara cerrada** porque el trabajo esté hecho, sino porque **la puerta pasó**. Si una puerta no se puede ejecutar, la fase queda en «parcial» y se dice por qué — igual que el proyecto ya hace con el e2e de Python cuando no hay Python.

Los umbrales son los del [tablero](PLAN_MAESTRO_CEREBRONICO_V2_PRO.md) (§5). Ninguna fase puede empeorar una cifra anterior: **CONSERVA + delta**.

------------------------------------------------------------------------

## 0. La forma de una puerta

Toda puerta de fase se compone de los mismos cinco bloques. Si falta uno, la fase no está cerrada.

| Bloque | Qué exige | Cómo se comprueba |
|---|---|---|
| **Tipos** | 0 errores | `npx tsc --noEmit` |
| **Suites** | Igual o mejor que la fase anterior, 0 fallos, 0 sin correr | `npm run validar` |
| **Bundle** | El parche está **dentro** del bundle, no solo en el fuente | `npm run build` + búsqueda de la cadena de la feature en `dist/server.mjs` |
| **Integridad** | Todo lo entregado, verificado | `sha256sum -c MANIFIESTO_SHA256_<versión>.txt` |
| **Cifra nueva** | Solo las fases que introducen métrica nueva (F0, F1, F4, F5, F6) | Comando propio de la fase, indicado abajo |

------------------------------------------------------------------------

## FASE 0 — Verdad congelada

**Antes de empezar:** copia de seguridad del árbol (o commit, si ya hay git).

| Criterio | Comando | Umbral |
|---|---|---|
| Descubrimiento dinámico funciona | `npx tsx tests/<suite-nueva-de-prueba>.test.ts` + `npm run validar` | La suite de prueba aparece ejecutada **sin** haberla registrado a mano |
| Parser estricto | `npm run validar` | Una suite que imprima recuento **y** una línea `✗` cuenta como roja |
| Manifiesto completo | `sha256sum -c MANIFIESTO_SHA256_<versión>.txt` | 0 ficheros entregados fuera del manifiesto (verificable con el script de cobertura) |
| ROADMAP sin pendientes falsos | `grep -n "NO IMPLEMENTADO\|SIN VERIFICAR" ROADMAP.md` | 0 coincidencias sobre D7, D8, D-P1 y catálogo |
| Canon reconciliado | `diff -q` de cada `mejoras/<pkg>/src/**` contra el árbol | 0 diferencias, o `mejoras/` marcado explícitamente como histórico |
| **Nada roto** | `npx tsc --noEmit` + `npm run validar` | 0 errores · ≥3372 · 0 fallos · 0 sin correr |

**Definición de hecho:** una suite nueva que nadie registró **se ejecuta sola**; y el manifiesto cubre el 100 % de lo que viaja en el ZIP.

------------------------------------------------------------------------

## FASE 1 — Seguridad cerrada

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Sin shell en el puente | `grep -n "use_shell = True\|shell=True" agent_bridge_5000.py` | 0 coincidencias |
| Lista blanca activa | Suite nueva | Binario no listado → `ok:false` con `motivo` |
| Contención de rutas | Suite nueva | Ruta fuera de raíz permitida → rechazo con motivo (probado en el puente, no solo en Node) |
| CORS exige `Origin` | Suite nueva | Petición sin `Origin` → rechazo |
| Guard fail-closed | Suite nueva | Sin `ACCESS_TOKEN`, petición no-loopback → 401 |
| Endpoints mutadores cerrados | Suite nueva de superficie de seguridad | 0 endpoints que escriban o lancen procesos fuera del guard |
| Auditoría por acción | Inspección + suite | Cada ejecución del puente deja línea en `.cerebro-db/auditoria.jsonl` con hora, acción, ruta, resultado y motivo |
| Dependencias | `npm audit --audit-level=high` | 0 hallazgos altos |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F0 · 0 fallos |

**Prueba negativa obligatoria (se ejecuta y se guarda la salida):**

```
1) intento de leer un fichero fuera de las raíces permitidas → debe rechazar y decir por qué
2) intento de ejecutar un binario no listado                    → debe rechazar y decir por qué
3) petición sin token desde una IP no-loopback                  → debe rechazar
```

Estas tres pruebas **quedan como aserciones de suite**, no como una comprobación manual de una tarde.

**Definición de hecho:** el puente sigue haciendo lo que hacía (sigue siendo un agente de PC), pero **todo lo que hace está listado, contenido y registrado**.

------------------------------------------------------------------------

## FASE 2 — Partir el monolito

**Antes de empezar (obligatorio):** congelar el contrato de superficie. Sin esto, la fase no se empieza.

```bash
# 1. Inventario completo de rutas, ANTES de mover nada
grep -oE 'app\.(get|post|put|delete)\("[^"]+"' server.ts | sort | uniq -c > contrato_superficie_antes.txt
wc -l contrato_superficie_antes.txt        # referencia: 126 registros
```

| Criterio | Comando | Umbral |
|---|---|---|
| Rutas idénticas | `tests/superficieRutas.test.ts` + comparación del inventario | 126/126 con método y forma de respuesta equivalentes |
| Tamaño del bootstrap | `wc -l server/bootstrap.ts` | <200 líneas |
| Ningún fichero nuevo enorme | `find server -name "*.ts" -exec wc -l {} + \| sort -rn \| head` | 0 ficheros >600 líneas |
| Estado sin singletons sueltos | Test que prohíbe exportar `let`/`Map`/`Set` mutables desde `server/` | 0 violaciones |
| Suites intactas | `npm run validar` | Idénticas, **sin modificar una sola aserción** |
| Tipos | `npx tsc --noEmit` | 0 errores |
| Bundle | `npm run build` + `node --check dist/server.mjs` | Arranca y sirve |
| Humo real | Levantar y pedir una ruta representativa de cada dominio | 14/14 dominios responden |

**Regla dura de esta fase:** **en F2 no se mejora nada; se mueve.** Cada mejora que aparezca por el camino se anota en el tablero y espera a su fase. Sin esta disciplina, partir el monolito se convierte exactamente en el escenario que el proyecto ya documentó como su peor fallo (un modelo reescribiendo de memoria un fichero que no leyó).

**Definición de hecho:** `server.ts` es un plano legible; ninguna ruta cambió de comportamiento; ninguna aserción se tocó.

------------------------------------------------------------------------

## FASE 3 — Motor del chat

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Paridad de salida | 5 prompts de referencia, temperatura 0, modelo fijo | Salida equivalente antes/después del pipeline |
| Etapas separadas | Inspección + test | `armarContexto`, `elegirProveedor`, `transmitir`, `medir` existen y son llamables por separado |
| Un adaptador por proveedor | `grep` en el test | 0 ramas de proveedor fuera de `chat/proveedores/*` |
| Métricas por etapa | Respuesta del endpoint | TTFT, tokens/s, tiempo de armado y tamaño por bloque presentes por turno |
| `len/4` solo etiquetado | `grep -n "length / 4" src` | Toda aparición está declarada como estimación, ninguna sustituye una medida disponible |
| Tamaño del handler | `wc -l server/routers/ai.ts` | <300 líneas |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F2 · 0 fallos |

**Definición de hecho:** el camino más caliente del producto se puede leer de arriba abajo en una pantalla y se puede medir etapa por etapa.

------------------------------------------------------------------------

## FASE 4 — Cerebro ejecutor

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Cobertura del mapa | `tests/consejoEjecutores.test.ts` | 23/23 acciones: ejecutor real **o** declaración escrita con motivo |
| Ejecución real, no enrutado | Por acción con ejecutor, una llamada de prueba cuyo resultado se comprueba | 100 % de las acciones declaradas como ejecutables pasan su llamada |
| Endpoint sin llamador | Test nuevo | 0 endpoints declarados sin llamador (incluye `/api/brain/lesson` resuelto o retirado) |
| Lección llega a memoria | Prueba de extremo a extremo de un turno con error recuperado | `memoria.md` contiene la lección |
| Catálogo en el servidor | Suite | El servidor compone el bloque auditado sin depender del payload del cliente |
| RAG único | `find src -name "localRAG.ts"` | 1 solo módulo; el nombre que se use no dice «vectorial» si no hay embeddings |
| Votación intacta | `tests/consejoVotacion.test.ts` | 40/40 **sin tocar aserciones** |

**Definición de hecho:** el Consejo reparte trabajo, no solo nombres; y ninguna capacidad existe sin llamador.

------------------------------------------------------------------------

## FASE 5 — Producto y datos

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| App partida | `wc -l src/App.tsx` | ≤600 líneas |
| Componentes razonables | `find src/components -name "*.tsx" -exec wc -l {} + \| sort -rn \| head -5` | 0 componentes >900 líneas |
| Contextos | `grep -c "useContext\|createContext" src/contexts/*` | 5 contextos declarados y usados |
| Workspace seguro | Prueba de guardado con >5 MB | Aviso **visible** en la interfaz y datos conservados (no pérdida silenciosa) |
| Adjuntos honestos | Inspección + suite | El tope que se anuncia es el que se aplica |
| Preferencias con un dueño | Suite de migración | Migración desde claves antiguas probada; 0 claves huérfanas |
| Aspecto intacto | Revisión visual de las 4 superficies principales | Sin regresión visible |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F4 · 0 fallos |

**Definición de hecho:** ningún dato del usuario puede perderse en silencio, y la interfaz se puede mantener sin leer 4.000 líneas.

------------------------------------------------------------------------

## FASE 6 — Git nativo + enrutador de modelo

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Commit y rollback | Suite sobre un repo de prueba | Commit creado; rollback deja el árbol **byte-idéntico** (`sha256sum`) al commit elegido |
| Integración con el Quirófano | Prueba de una tanda rota | La tanda revertida **y** sin commit huérfano |
| `.cerebro-db/` fuera del repo | `git status` tras un turno normal | Sin ficheros de conocimiento vivo versionados |
| Enrutador: motivo visible | Panel de contexto por turno | El motivo del cambio de modelo aparece siempre |
| Enrutador: efecto medido | Comparación antes/después (TTFT, tokens/s) | Efecto **medido y publicado**; sin medida, no se declara |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F5 · 0 fallos |

------------------------------------------------------------------------

## FASE 7 — Visión y decisión del mapa

| Criterio | Comando / prueba | Umbral |
|---|---|---|
| Visión real | Imagen de prueba descrita por el sistema | Salida correcta y **tramo declarado** (MR3+) |
| Mapa sin decisiones pendientes | Revisión del registro | 0 entradas «sin decisión»: construir, aplazar con fecha, o retirar |
| Modo serie de imágenes | Prueba de un plan de N imágenes | Sin reintentos masivos por 429 |
| **Nada roto** | `tsc` + `validar` | 0 errores · ≥ cifra de F6 · 0 fallos |

------------------------------------------------------------------------

## Ritual de entrega (el mismo de siempre, ahora con dos pasos más)

Cuando una fase se empaqueta, este es el orden exacto — el orden importa:

```bash
cd ide/backend
npm ci                                  # 1. dependencias de cero
npx tsc --noEmit                        # 2. tipos: 0 errores
npm run validar                         # 3. suites: 0 fallos, 0 sin correr
npm run build                           # 4. bundle AL DÍA  ← el paso que ya falló una vez
node --check dist/server.mjs            # 5. el bundle es sintácticamente sano
grep -c "<cadena-de-la-feature>" dist/server.mjs   # 6. el parche está DENTRO del bundle
npm start                               # 7. humo real: responde y sirve
#    (detener el servidor)
```

Y antes de comprimir:

```bash
# 8. restaurar artefactos de runtime que las pruebas tocaron
#    (.proyectos/.cerebro-db/kb.json, logs del puente, package-lock.json si se tocó)
sha256sum -c MANIFIESTO_SHA256_<versión>.txt      # 9. integridad: 100 %
# 10. excluir node_modules y artefactos de runtime del ZIP
```

**Los dos pasos nuevos respecto al ritual histórico** son el 6 y el 9: **comprobar la feature dentro del bundle** (porque ya se entregó una vez un `dist/` sin el parche, y el ZIP lo declaraba «instalado y verificado») y **verificar el manifiesto completo** en lugar de las 22 entradas de hoy.

------------------------------------------------------------------------

## Definición de «hecho» (una sola frase, para todo el plan)

> Una capacidad está hecha cuando **tiene fichero, endpoint y prueba que la ejercita**, y su cifra está en el tablero.

Ni más, ni menos. Es la misma regla que ya usa el proyecto; aquí solo se extiende a la estructura.


---

<a id="anexo-c-mapa-objetivo-y-contratos-md"></a>
## (3/4) ANEXO_C_MAPA_OBJETIVO_Y_CONTRATOS.md

> **Fuente:** `plan-maestro/ANEXO_C_MAPA_OBJETIVO_Y_CONTRATOS.md`  —  **version:** s/v  —  **bytes:** 10291
# ANEXO C — MAPA OBJETIVO Y CONTRATOS

Este anexo es el que se usa **mientras se ejecuta la Fase 2**: dice a dónde va cada cosa, qué puede hacer cada módulo nuevo y en qué orden se mueve para no romper nada.

Todo el mapeo se apoya en los **rangos reales** de `server.ts` (11.461 líneas) inventariados en la auditoría. No hay estimaciones de líneas de origen: son los rangos medidos.

------------------------------------------------------------------------

## 1. Estructura destino

```
ide/backend/
├── server/
│   ├── bootstrap.ts            (<200 L) arranque, middleware, montaje, cierre ordenado
│   ├── routers/
│   │   ├── ai.ts               chat/stream (pipeline), TTS, modelos
│   │   ├── sandbox.ts          start/stop/status/logs, flatten-root, tregua
│   │   ├── fs.ts               read/tree/write/sync, clear-all, nuclear-wipe
│   │   ├── exec.ts             /api/exec
│   │   ├── engine.ts           kb, sync, tools, símbolos, guard, learn
│   │   ├── consejo.ts          estado de entidades, votación
│   │   ├── espejos.ts          grupos, salud, instalar
│   │   ├── boveda.ts           preparar, índice
│   │   ├── extensiones.ts      enable/disable/delete, forjar
│   │   ├── quirofano.ts        estado, revisar, deshacer
│   │   ├── export.ts           android/prepare, empaquetado
│   │   ├── telemetria.ts       hardware, pc, subagentes
│   │   ├── puente.ts           medir, bridge, estáticos
│   │   └── coreo.ts            fondo, contenedor
│   ├── chat/
│   │   ├── pipeline.ts         armarContexto → elegirProveedor → transmitir → medir
│   │   └── proveedores/        ollama.ts · gemini.ts · openrouter.ts · custom.ts · zai.ts
│   └── estado/
│       ├── quirfano.ts         operacionQf, temporizadorQf, cerrandoQf, ultimoCierreQf, avisosQf
│       ├── sandbox.ts          sandboxProc, sandboxLogStream
│       ├── engine.ts           engineKb, kbDirty, symbolMap, profileCache
│       ├── telemetria.ts       telemetryCache
│       ├── extensiones.ts      disabledExtensions, openExtensionPanels, pendingInvocations
│       ├── salud.ts            TABLA_SALUD
│       └── boveda.ts           BOVEDA
│
├── src/
│   ├── contexts/               5 contextos de React (Sesión, Chat, Workspace, Preferencias, Motor)
│   ├── engine/
│   │   └── ejecutoresConsejo.ts   registro acción → ejecutor (23 acciones)
│   └── utils/
│       ├── preferencias.ts     dueño único de las 6 claves dispersas + migración
│       └── almacen.ts          IndexedDB para datos; localStorage solo preferencias pequeñas
│
└── tests/
    ├── superficieRutas.test.ts        contrato de las 126 rutas (se escribe ANTES de F2)
    ├── seguridadPuente.test.ts        F1: shell, rutas, token, CORS, auditoría
    ├── pipelineChat.test.ts           F3: etapas + paridad de salida
    ├── consejoEjecutores.test.ts      F4: 23/23 cobertura
    ├── endpointSinLlamador.test.ts    F4: ningún endpoint huérfano
    ├── guardadoWorkspace.test.ts      F5: cuota real + error visible
    ├── migracionPreferencias.test.ts  F5: claves antiguas → dueño único
    └── gitNativo.test.ts              F6: commit + rollback byte-idéntico
```

------------------------------------------------------------------------

## 2. Mapeo: de dónde sale cada router (rangos medidos)

| Router destino | Origen en `server.ts` (líneas) | Rutas | Riesgo del movimiento |
|---|---|---|---|
| `telemetria.ts` | 6587–6838 | 3 | Bajo (empieza por aquí) |
| `puente.ts` | 11179–11360 | 4 | Bajo |
| `export.ts` | 5047–5308 | 3 | Bajo |
| `quirofano.ts` | 2251–2284 | 3 | Bajo (aislado, bien probado: 102 aserciones) |
| `boveda.ts` | dentro de 4234–5047 | — | Medio (comparte bloque con espejos) |
| `engine.ts` | 3564–3751 + 5308–5424 | 27 | Medio |
| `consejo.ts` | dentro de 4234–5047 | — | Medio |
| `espejos.ts` | 4829–5047 | — | Medio |
| `extensiones.ts` | 5969–6482 | 17 | Medio |
| `coreo.ts` | dentro de 5969–6482 (fondo, contenedor) | — | Medio |
| `fs.ts` | 8433–9108 (+ 8594–8851) | 7 | Alto (toca el workspace) |
| `exec.ts` | 8434 | 1 | Alto (ejecuta) |
| `sandbox.ts` | 5516–5969 + 6838–8433 | 7 | **Alto** (1.244 L en un handler) |
| `ai.ts` | 2998–3350 + **9468–11179** | 9 | **Alto** (1.711 L en un handler) |

**Orden recomendado, por riesgo creciente:** `telemetria` → `puente` → `export` → `quirofano` → `consejo` → `boveda` → `espejos` → `engine` → `extensiones` → `coreo` → `fs` → `exec` → `sandbox` → `ai`.

Los dos últimos (`sandbox`, `ai`) se mueven **al final y en ese orden**, porque son los que más estado comparten y los que más duele romper. `ai` ya tiene además su propia fase (F3) para convertirlo en pipeline: **el movimiento de F2 lo deja funcionando igual; el pipeline es F3.**

------------------------------------------------------------------------

## 3. Los 19 singletons y su dueño

| Singleton | Hoy | Dueño destino |
|---|---|---|
| `TABLA_SALUD` | `server.ts:529` | `estado/salud.ts` |
| `BOVEDA` | `:566` | `estado/boveda.ts` |
| `profileCache` | `:1589` | `estado/engine.ts` |
| `engineKb` | `:1675` | `estado/engine.ts` |
| `kbDirty` | `:1676` | `estado/engine.ts` |
| `symbolMap` | `:1843` | `estado/engine.ts` |
| `operacionQf` · `temporizadorQf` · `cerrandoQf` · `ultimoCierreQf` | `:2057-2060` | `estado/quirfano.ts` |
| `avisosQf` | `:2061` | `estado/quirfano.ts` |
| `genAIClient` · `genAIClientKey` | `:2910-2911` | `estado/engine.ts` (o `chat/proveedores/gemini.ts`) |
| `disabledExtensions` | `:3382` | `estado/extensiones.ts` |
| `openExtensionPanels` | `:3388` | `estado/extensiones.ts` |
| `pendingInvocations` | `:3518` | `estado/extensiones.ts` |
| `telemetryCache` | `:6583` | `estado/telemetria.ts` |
| `sandboxProc` · `sandboxLogStream` | `:6761-6762` | `estado/sandbox.ts` |

**Contrato del estado (obligatorio):** cada módulo de `estado/` exporta **funciones de acceso**, no la variable. Y expone un `reset()` para que las suites puedan probar en limpio.

```ts
// ejemplo de contrato, no de implementación
export function leerQuirfano(): Operacion | null
export function abrirOperacion(op: Operacion): void
export function cerrarOperacion(motivo: string): void
export function resetQuirfano(): void
```

**Test que lo protege:** `server/` no puede exportar `let`, `Map` ni `Set` mutables. Es una regla mecánica, comprobable con una suite de 10 líneas.

------------------------------------------------------------------------

## 4. Contratos de módulo (las reglas que hacen que esto no vuelva a ser un monolito)

| Regla | Por qué |
|---|---|
| **Un router no importa otro router.** Si dos necesitan lo mismo, eso vive en `estado/` o en un servicio. | Evita reconstruir el acoplamiento que estamos deshaciendo |
| **Ningún router >600 líneas.** Si crece, se parte por responsabilidad. | Es la cifra que hoy distingue «módulo» de «monolito» |
| **Toda ruta nueva se declara en el contrato de superficie** en el mismo cambio que la crea. | Sin esto, el contrato se vuelve decorativo |
| **Ningún endpoint se entrega sin llamador** (frontend, motor o subagente). | Cierra el caso `/api/brain/lesson` de raíz |
| **Toda escritura y toda ejecución pasan por el guardián** (Quirófano para escrituras, auditoría para ejecuciones). | Es el principio que hace que este proyecto sea distinto |
| **Toda cifra del tablero se mide en la puerta**, no se escribe a mano. | Un tablero manual vuelve a mentir en tres sesiones |

------------------------------------------------------------------------

## 5. Prohibiciones explícitas durante la Fase 2

1. **Prohibido mejorar.** Si al mover un router aparece una mejora obvia, se anota en el tablero y se implementa en su fase. F2 solo mueve.
2. **Prohibido tocar aserciones de suites existentes** para que pasen. Si una aserción falla, el movimiento está mal.
3. **Prohibido usar `write_file` sobre ficheros grandes sin `read` previo.** (Es la lección escrita del proyecto: la edición de `App.tsx` falló precisamente por saltarse ese paso.)
4. **Prohibido partir dos dominios en la misma tanda.** Una tanda = un dominio = una puerta.
5. **Prohibido declarar una tanda cerrada sin `tsc` + `validar` + contrato de superficie.** Sin los tres, la tanda no existe.

------------------------------------------------------------------------

## 6. Lo que NO se toca en v2 (y por qué)

| Pieza | Motivo |
|---|---|
| Los 10 espejos y los 22 poderes | Código determinista, con contratos y pruebas propias; ningún hallazgo los señala |
| La política conservadora del guardián de sintaxis | Ya evolucionada a parser real con esbuild; el diseño (equivocarse con datos, y si el parser falla, dejar pasar con aviso) es correcto |
| El planificador (`taskPlanner` + `planRunner`) | Tiene invariantes (io/cpu), semáforo global y pruebas; el diagnóstico lo confirma como lo mejor construido |
| `brain` / `memoria.md` | Escritura atómica, historial, rollback: ya está bien hecho |
| Los contratos «CONSERVA + delta» | Es la cultura que hace fiable este proyecto |
| La fuente única de versión (`constants.ts`) | Funciona; solo hay que mantenerla |
| Puertos 3000/3500/5000/11434 | Regla de oro inmutable |

------------------------------------------------------------------------

## 7. Cómo se sabe que la Fase 2 terminó bien

Tres señales, todas comprobables:

1. `wc -l server.ts` ya no existe como fichero (o es un reenvío de una línea al bootstrap).
2. `find server -name "*.ts" | xargs wc -l | sort -rn | head` no muestra **ningún** fichero por encima de 600 líneas.
3. Las 63 suites de hoy siguen verdes **con el mismo número de comprobaciones** — ni una más, ni una menos: exactamente las mismas, porque no se tocó ninguna.

Y una señal humana, que es la que de verdad importa: **puedes abrir el router que te interesa y trabajar en él sin leer 11.000 líneas.** Ese era el objetivo.


---

<a id="plan-maestro-cerebronico-v2-pro-md"></a>
## (4/4) PLAN_MAESTRO_CEREBRONICO_V2_PRO.md

> **Fuente:** `plan-maestro/PLAN_MAESTRO_CEREBRONICO_V2_PRO.md`  —  **version:** 2  —  **bytes:** 54992
# PLAN MAESTRO — CEREBRÓNICO v2 (PRO)

**Documento de replanteo integral · base auditada: `Cerebronico-CN-v1.6.33-CONSEJO-QUE-VOTA`**
**Propietario:** Mario Nicolas Quintero · **Fecha:** 24-sep-2026

> **ESTADO DE EJECUCIÓN (actualizado al entregar v1.13.0):**
> **Fase 2: LOS DOS BLOQUES DE ESTADO YA ESTÁN FUERA.** `server/estado/` tiene
> telemetría, CPU del proceso y **sandbox** (el último bloque grande: 35 sitios tocando
> una variable global). `server.ts` ya no es dueño de datos: solo tiene rutas y
> funciones. **6 de 127 rutas fuera.** Añadido fuera de fase por petición del usuario:
> la **ventana de voz** (el 429 de Gemini ya no pinta JSON en la interfaz) y el
> **sandbox al arrancar** (deja de salir en rojo cuando aún no ha arrancado).
> Puerta: **3724 · 0 fallos · 69 suites**, manifiesto **498/498**, humo `V1.13.0`.
> **Fase 2 EN CURSO — el paso que decide ya está hecho: EL ESTADO HA SALIDO DEL MONOLITO.**
> `server/estado/telemetria.ts` y `server/estado/proceso.ts` (API de funciones, **tiempo
> inyectado**, dependencias declaradas en vez de alcanzadas) + `server/routers/telemetria.ts`
> (3 rutas más). **6 de 127 rutas fuera · `server.ts`: 11.661 → 11.413 líneas (−248).**
> Comprobado en marcha: la caché sirve la segunda consulta y `refresh` la invalida.
> Puerta: **3670 · 0 fallos · 68 suites**, manifiesto **494/494**, humo `V1.12.0`.
> Siguiente: **estado del sandbox** (su API ya está escrita por lo que telemetría le pide).
> **Fase 2 EN CURSO — la extracción ha empezado.** Primer módulo creado:
> `server/routers/diagnostico.ts` con 3 rutas (`/api/health/deep`, `/api/ollama/perf`,
> `/api/ollama/models`). **`server.ts`: 11.661 → 11.518 líneas.** El contrato informa
> MOVIDAS (no pérdidas) y publica el progreso: **3 extraídas · 124 en el monolito**.
> Comprobado contra el servidor en marcha. Siguiente paso natural: dominios de lectura
> pequeños y, después, la **extracción del estado** (`server/estado/`), que es la que
> desbloquea mover `telemetry` y `sandbox`. Puerta: **3639 · 0 fallos · 67 suites**,
> manifiesto **489/489**, humo real sirviendo `CerebróNico V1.11.0`.
> **Fase 2 EN CURSO — primer paso hecho**: el **contrato de las 127 rutas**
> (`contrato-rutas.json`, generado desde el código), el **orden de trabajo** por 39
> dominios (`SUPERFICIE_RUTAS.md`) y `scripts/superficie.mjs` con modo seco. Tres
> candados verificados: ruta perdida → rojo · guard perdido → rojo · **`server.ts`
> (11.661 líneas) no puede crecer**. Suite `tests/superficieRutas.test.ts` (37).
> **La extracción de módulos no ha empezado**, y es deliberado: es la fase de 2-3
> semanas y medio servidor migrado es peor que nada. Ver §4 FASE 2.
> **v1.9.0 «ESTABILIDAD»** cierra las dos deudas de severidad ALTA/MEDIA que este plan
> listaba como abiertas: la **pérdida silenciosa del workspace** al pasar de 5 MB
> (ahora se rescata al almacén grande y todo fallo de guardado se dice) y el
> **endpoint huérfano `/api/brain/lesson`** (el aprendizaje ya llega al cerebro).
> Puerta sobre el estado entregado: **3590 comprobaciones · 0 fallos · 66 suites**,
> manifiesto **482/482**, humo real sirviendo `CerebróNico V1.9.0`.
> Lo que sigue abierto está abajo y sin adornos: **F2** (partir el monolito), **F3**,
> **F4** (21 de 23 acciones sin ejecutor), **F5**, **F6** y **F7**.

> **Fase 0 COMPLETA**, **Fase 1 COMPLETA** y **Fase 4 EN CURSO**, verificadas con la puerta real
> (`3548 comprobaciones · 0 fallos · 65 suites`, manifiesto `480/480`, humo en vivo con `:3000` sirviendo
> `CerebróNico V1.8.0` y el puente respondiendo `shell: false`).
> **Añadido transversalmente (v1.8.0 «VOZ»)**: la **certeza en el idioma** (`certeza.ts` + `vocabulario.ts`:
> ninguna palabra que afirme un resultado sin haberlo ejecutado), **una frase por artefacto**
> (`explicacionArtefacto.ts`) y la **facultad de hablar sin que pregunten** (`autoRespuesta.ts`, 4 reglas).
> Es material de la **Fase 3** (pipeline del chat) adelantado por petición: cuando esa fase llegue, el
> revisor de vocabulario ya está hecho y solo hay que ponerlo en el camino del texto del modelo.
> De la Fase 4 ya está el **registro de ejecutores** (`src/engine/ejecutoresConsejo.ts`): de las 23 acciones,
> **2 tienen ejecutor real y 21 están declaradas con motivo** — el hueco, medido en vez de supuesto.
> Añadido fuera de fase y a petición: el **fondo de pantalla admite 100 MB** (blob en IndexedDB, no base64).
> Fases 2, 3, 5, 6 y 7 pendientes.
> Informe de lo ejecutado: [INFORME_SANDBOX_v1.7.1.md](../INFORME_SANDBOX_v1.7.1.md).
> **Dos afirmaciones de este plan quedaron corregidas al ejecutar** (§1.4 H9 y §2.5): el «falso verde»
> del parser no era alcanzable —las 62 suites usan `process.exitCode`— y el intento de arreglarlo con
> «gana el caso peor» produjo un falso rojo real en `planner`. Detalle y corrección en
> [Anexo A](ANEXO_A_EVIDENCIA_VERIFICADA.md) §H9.

------------------------------------------------------------------------

## 0. Cómo leer este documento

Este plan se escribió bajo la regla de la casa, sin excepciones:

> **Creer solo lo verificado contra código.** Nada se declara «hecho» sin fichero, endpoint o prueba.

Por eso:

1. **Cada hallazgo lleva `ruta:línea`.** Si no tiene evidencia, no está aquí.
2. **Las cifras del estado actual se obtuvieron ejecutando**, no leyendo informes (§1.2).
3. **Las estimaciones de esfuerzo son estimaciones**, y van marcadas como tales. No son medidas.
4. **Un anexo aparte recoge la evidencia cruda** ([ANEXO A](ANEXO_A_EVIDENCIA_VERIFICADA.md)) para que puedas re-verificar sin repetir el trabajo.

Tres anexos acompañan a este documento:

| Anexo | Contenido | Para qué sirve |
|---|---|---|
| [A — Evidencia verificada](ANEXO_A_EVIDENCIA_VERIFICADA.md) | Gate ejecutado, hallazgos con `ruta:línea`, contradicciones doc↔código | Re-verificar sin repetir la auditoría |
| [B — Criterios de aceptación](ANEXO_B_CRITERIOS_DE_ACEPTACION.md) | Comandos copiables y umbrales por fase | Que una fase solo se declare cerrada si pasa la puerta |
| [C — Mapa objetivo y contratos](ANEXO_C_MAPA_OBJETIVO_Y_CONTRATOS.md) | Estructura destino, contratos de módulo, orden de migración | Ejecutar la Fase 2 sin romper nada |

Además: [tablero_pro_v2.csv](tablero_pro_v2.csv) — el mismo programa de trabajo en formato tabla (importable).

------------------------------------------------------------------------

## 1. Veredicto ejecutivo

### 1.1 La frase

**La v1.6.33 no tiene un problema de motor: tiene un problema de estructura y de promesas sin cerrar.**

El motor está sano y es verificable. Lo que impide que esto sea un producto «PRO» no es la falta de ideas ni de capacidades nuevas: es que **todo el sistema vive en dos ficheros gigantes**, que **la capa que puede ejecutar comandos en tu PC está abierta de par en par**, y que **varias cosas que el producto declara no las hace todavía** (el consejo atribuye pero no ejecuta; las lecciones no llegan a la memoria; el catálogo honesto no viaja por el servidor).

Ninguna de esas tres cosas se arregla añadiendo una función nueva. Se arregla **cerrando, ordenando y partiendo**. Ese es este plan.

### 1.2 El estado real, medido hoy (no citado de informes)

Ejecutado sobre el árbol que subiste, con dependencias instaladas de cero:

| Comprobación | Comando | Resultado real |
|---|---|---|
| Tipos | `npx tsc --noEmit` | **0 errores** (exit 0) |
| Suites | `npm run validar` | **3372 comprobaciones · 0 fallos · 63 suites · 0 sin correr** |
| Integridad del paquete | `sha256sum -c MANIFIESTO_SHA256_v1.6.33.txt` | **22/22 OK**, antes y después del gate (el árbol quedó byte-intacto) |
| Bundle de producción | `dist/server.mjs` | **Actual**: declara `VERSION_SEMVER = "1.6.33"` (`dist/server.mjs:5799`) y contiene Quirófano y votación |

Las tres cifras coinciden con lo que declara `INFORME_SANDBOX_v1.6.33.md`. **Este es el primer ZIP del proyecto que no miente en su propia puerta** — y eso hay que decirlo, porque cambia la naturaleza del problema: la deuda que sigue es de diseño, no de honestidad de la entrega.

### 1.3 Las tres cosas que sí están bien (y hay que proteger)

1. **La puerta existe y es real.** `validar.mjs` + `tsc` + manifiesto SHA256, con 63 suites que corren de verdad (no «declaradas»).
2. **La fuente única de versión funciona.** `src/constants.ts:194` es el único literal (`VERSION_SEMVER`), y la etiqueta visible se deriva (`:218`).
3. **El principio de honestidad está incorporado al código**, no solo al discurso: `catalogoHonesto.ts` audita cada capacidad activa contra ficheros reales con `fs.existsSync` (`tests/catalogoHonesto.test.ts:44-47`), y `votacionConsejo.ts:95-98` declara por escrito quién **no** vota en lugar de disfrazarlo.

Esa cultura es el activo más valioso del proyecto. El plan está diseñado para no romperla.

### 1.4 Los diez hallazgos que ordenan el plan

| # | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| 1 | **CRÍTICO** | El puente :5000 ejecuta con `shell=True` **sin lista blanca de binarios** | `agent_bridge_5000.py:595-599` |
| 2 | **CRÍTICO** | `/api/fs/*` del puente **no contiene la ruta**: acepta rutas absolutas fuera del sandbox | `agent_bridge_5000.py:131-162` |
| 3 | **ALTO** | El guard del sandbox es **fail-open**: sin `ACCESS_TOKEN`, autoriza todo | `server.ts:511-518` |
| 4 | **ALTO** | **Al menos 9 endpoints que escriben en disco o lanzan procesos sin guard** | `server.ts:5193, 5969, 4829, 6327, 4585, 6004, 6198, 6070, 5516` |
| 5 | **ALTO** | **Monolito**: 11.461 líneas, 126 rutas y 19 singletons en un solo fichero | `server.ts` · un handler de 1.711 líneas (`:9468-11179`) |
| 6 | **ALTO** | **Pérdida silenciosa del workspace** al superar 5 MB de `localStorage` | `src/utils/storage.ts:11,36-38,62-63` |
| 7 | **MEDIO** | El **Consejo vota pero no ejecuta**: 16 de 23 acciones sin ejecutor real | `votacionConsejo.ts:53-82` vs `planExecutors.ts:82` |
| 8 | **MEDIO** | **Endpoint huérfano**: `/api/brain/lesson` no tiene llamadores → la lección automática nunca llega a `memoria.md` | `server.ts:3786`, `brain.ts:270` |
| 9 | **MEDIO** | La puerta de suites es **eludible**: lista fija de suites y parser con camino de falso verde | `scripts/validar.mjs:24-92,137-164` |
| 10 | **MEDIO** | **Cero git** y **copias canónicas divergentes** entre `mejoras/` y el árbol | sin `.git`; `espejos.ts` 668 vs 852 líneas |

Los diez están desarrollados con su arreglo en §2 y §4.

### 1.5 El rumbo

```
Fase 0  Verdad congelada        → que la puerta no pueda mentir ni por accidente
Fase 1  Seguridad cerrada       → el puente deja de ser una puerta abierta a la PC
Fase 2  Partir el monolito      → server.ts deja de ser un fichero y pasa a ser un plano
Fase 3  Motor del chat          → /api/ai/stream: 1.711 líneas → pipeline por etapas
Fase 4  Cerebro ejecutor        → el consejo pasa de atribuir a hacer; se cierran D9 y el catálogo
Fase 5  Producto y datos        → App.tsx por contextos; el workspace deja de perderse
Fase 6  Git nativo + enrutador  → el hueco más grande declarado del proyecto
Fase 7  Visión y mapa           → OCR/visión, y decidir qué aspiracional se construye o se retira
```

El orden no es negociable: **0 y 1 antes que todo lo demás**, porque sin puerta fiable y sin PC segura, cada fase siguiente es trabajo sobre terreno movedizo.

------------------------------------------------------------------------

## 2. Diagnóstico por flanco

### 2.1 Núcleo y deuda estructural

`ide/backend/server.ts` = **11.461 líneas** · **126 rutas registradas** · **53 imports** de módulos de `src/` (`server.ts:19-287`).

Bloques funcionales (rangos reales):

| Rango | Bloque | Rutas |
|---|---|---|
| 2251–2284 | Quirófano | 3 |
| 2998–3350 | TTS / modelos cloud | 8 |
| 3564–3751 | Verifier / Governor / Features / RAG | 17 |
| 3757–4213 | Brain / planes / runner | 19 |
| 4234–5047 | Engine: imagen, reflejo, consejo, espejos, bóveda | 27 |
| 5047–5308 | Conductor / Export | 3 |
| 5308–5424 | KB / sync / tools / perf Ollama | 10 |
| 5516–5969 | Sandbox / salud | 3 |
| 5969–6482 | Extensiones / Fondo / Puente / Coreo | 17 |
| 6587–6838 | Telemetría / modelos Ollama / subagentes | 3 |
| 6838–8433 | Sandbox start/stop/status/logs | 4 |
| 8433–9468 | Exec / FS | 7 |
| **9468–11179** | **`POST /api/ai/stream`** | **1 (1.711 líneas)** |
| 11179–11360 | Bridge / estáticos | 4 |

**Los dos handlers que hay que partir sí o sí:**

- `POST /api/ai/stream` → `server.ts:9468-11179` — **1.711 líneas en un solo manejador**.
- `POST /api/sandbox/start` → `server.ts:6838-8082` — **1.244 líneas**.

**Estado mutable a nivel de módulo (19 singletons compartidos):** `TABLA_SALUD:529` · `BOVEDA:566` · `engineKb:1675` · `kbDirty:1676` · `symbolMap:1843` · `operacionQf/temporizadorQf/cerrandoQf/ultimoCierreQf:2057-2060` · `avisosQf:2061` · `genAIClient/genAIClientKey:2910-2911` · `disabledExtensions:3382` · `openExtensionPanels:3388` · `pendingInvocations:3518` · `profileCache:1589` · `telemetryCache:6583` · `sandboxProc/sandboxLogStream:6761-6762`.

**Por qué esto es el problema raíz y no una queja estética.** El estado es global y el servidor es uno solo: una operación del Quirófano en curso (`operacionQf`) y un plan en segundo plano comparten el mismo proceso y las mismas variables. Y como todo vive en un fichero, **cualquier mejora que toque el chat y cualquier mejora que toque el sandbox chocan en el mismo archivo**: es exactamente la razón por la que el proyecto ha acabado con 10 capas de parche (`mejoras/`) en vez de un flujo normal de cambios. La deuda estructural que ves en `mejoras/` es un síntoma, no la enfermedad.

### 2.2 Seguridad — aquí está lo único que no admite espera

**El puente :5000 es la puerta por la que un modelo puede llegar a tu PC.** Su diseño actual:

| Punto | Estado verificado | Fichero:línea |
|---|---|---|
| Ejecución de comandos | `use_shell = True` → `subprocess.run(..., shell=True)` | `agent_bridge_5000.py:595-599` |
| Lista blanca de binarios | **No existe** (solo límite de 4.096 caracteres) | `agent_bridge_5000.py:369,390` |
| Resolución de rutas | Devuelve la ruta absoluta **tal cual** si no empieza por atajo | `agent_bridge_5000.py:162` |
| Blocklist de sistema | Corta y por prefijo | `agent_bridge_5000.py:99-105` |
| CORS | `_origen_ok` **devuelve `True` si falta `Origin`** | `agent_bridge_5000.py:63-65` |
| Token | `_token_ok`, exigido en `/api/*` | `agent_bridge_5000.py:68-73,358-365` |

Traducido: con el token en la mano, `/api/fs/read|write|write_b64|delete` alcanzan cualquier ruta del usuario que no esté en una blocklist corta (por ejemplo `~/.ssh`, `~/Documents`), y `/api/exec` interpreta la cadena en un shell del sistema.

**Y en el lado Node:**

- `sandboxAuthorized` (`server.ts:511-518`): `if (!token) return true;` → **fail-open**. Si `ACCESS_TOKEN` no está definido, la puerta no existe. (Nota justa: en localhost el diseño es «sin token», y la decisión es deliberada; el problema es que el mismo guard protege el caso LAN, donde el diseño sí exige token.)
- **Sí tienen guard (13):** `:2278, :2286, :6839, :8083, :8109, :8362, :8434, :8510, :8594, :8676, :8852, :9109, :9122`.
- **Escriben o lanzan procesos SIN guard:** `/api/export/android/prepare` (`:5193,5249,5255`) · `/api/extensions/forjar` (`:5969,5979`) · `/api/espejos/instalar` (`:4829,4878,4885`) · `/api/extensions/:id/{enable,disable,delete}` (`:6327,6338,6345`) · `/api/boveda/preparar` (`:4585,4590,4596`) · `/api/engine/sync` (`:5359`) · `/api/sandbox/flatten-root` (`:5516`) · `/api/fondo` POST/DELETE (`:6004,6039`) · `/api/contenedor/inspeccionar` (`:6198,6250`, lanza `spawnSync("ffmpeg")`) · `/api/puente/medir` (`:6070,6161`, acepta un socket arbitrario).

**Secreto en reposo:** las claves viven en `.env` en texto plano (`app/utils/env_manager.py:8,15,19`). Lo bueno: solo viaja `.env.example` en el paquete y `electron-builder` no empaqueta `.env` (verificado contra `package.json` `files`/`extraResources`). Es decir, **el riesgo es local, no de distribución**.

Nada de esto es teórico: es la misma clase de hallazgo que el propio proyecto ya escribió como descarte en `ARQUITECTURA_CEREBRONICO_V8.md:108` («Puentes `uploads/agent_bridge_5000.py/.js` — RCE documentado»). **El endurecimiento D3 estaba planificado y quedó a medias.** Este plan lo cierra con prueba.

> Nota de encuadre, porque importa para decidir bien: el puente es *la* característica que hace que CerebróNico no sea un chat — sin él no hay agente de PC. No se trata de apagarlo, se trata de que **la lista blanca sea el camino normal** y que lo demás sea explícito y con confirmación.

### 2.3 Cerebro: la diferencia entre atribuir y hacer

**El Consejo.** El reparto está bien hecho y probado: `votacionConsejo.ts:53-82` (`REPARTO_VOTOS`, 23 acciones), `:91-94` (10 asientos con voz), `:95-98` (no votantes declarados). Pero conviene entender qué es lo que se votó:

- `pensarConsejo` (`src/engine/reflejo/consejo.ts:425-435`) **no vota: atribuye.** El motor decide y el consejo pone el nombre del especialista que corresponde.
- Los 12 especialistas **no tienen `ejecutar`** (`consejo.ts:103-116` solo declara `id/nombre/descripcion`); `ejecutarEntidad` responde literalmente que un especialista «se usa vía frase» (`consejo.ts:409`).
- Los ejecutores reales que existen son 5 tipos: `modelo, leer_archivo, convertir, generar_imagen, reflejo` (`planExecutors.ts:82`).
- Las **16 acciones genéricas** (`analizar, explicar, resumir, comparar, listar, ordenar, filtrar, contar, buscar, testear, documentar, refactorizar, optimizar, traducir, instalar, desplegar`) emiten su bloque `cerebronico:<accion>` (`cerebroReflejo.ts:704-734`) pero **no tienen rama ejecutora propia** en `planExecutors.ts`. De ellas, `traducir`, `instalar` y `desplegar` ya se declaran sin especialista (`votacionConsejo.ts:79-81`).

**Consecuencia honesta:** el paso de v1.6.33 fue un paso de verdad (antes 16 acciones caían todas en «ayuda»; ahora tienen dueño y motivo), pero el siguiente paso natural —**que el consejo haga, no solo diga**— es el que convierte esto en un producto. Y la suite actual no lo exige: `tests/consejoVotacion.test.ts:119-121` comprueba atribución, no ejecución.

**Las lecciones que no llegan a casa.** Hay dos caminos y solo uno está vivo:

- Vivo: `selfImprovement.reflectOnTurn` (`selfImprovement.ts:378-444`, llamado en `App.tsx:1464`) → `useEffect` (`App.tsx:1268-1275`) → `POST /api/engine/kb/learn` → `engineKb.learnFromLesson` (`server.ts:5319,5322`) **y** `localStorage` (`selfImprovement.ts:96`).
- Muerto: `POST /api/brain/lesson` (`server.ts:3786`) → `brain.addLesson` (`brain.ts:270`), que es quien escribiría en `memoria.md`. **No tiene un solo llamador.**

O sea: la lección entra en la KB del motor y en el navegador, pero **nunca en `memoria.md`**. Es el hallazgo clásico del proyecto (una capacidad construida y no cableada) y es barato de cerrar.

**La memoria y el RAG.**

- `memoria.md` está bien hecho: escritura atómica tmp+rename (`brain.ts:175-180`), lock (`:159`), snapshot cada 20 s con 60 copias (`:182-207`), historial (`:461-475`), rollback (`:477-495` + endpoint `server.ts:3815`).
- `localRAG` **no usa embeddings**: recupera por coincidencia de token/clave (`localRAG.ts:131,134-162`), con índice en memoria no persistente (`:21`). Está declarado como tal — coherente con el ADR 12 —, pero conviene que el producto no lo llame «vectorial».
- Existen **dos módulos RAG** (`src/engine/localRAG.ts` y `src/utils/localRAG.ts`): duplicación que hay que resolver antes de que alguien arregle el equivocado.

**El catálogo honesto: bien hecho, pero con una asimetría de transporte.** Corregí aquí un diagnóstico inicial erróneo de la auditoría (vale la pena contarlo, porque es la prueba de que la verificación por lectura falla): la primera pasada concluyó «`catalogoHonesto` no llega al bundle». **Es falso.** Lo verifiqué: `contextCache.ts:39` importa `catalogoHonesto`, y `contextCache` lo consumen `src/App.tsx`, `src/components/Header.tsx` y `src/components/RightSidebar.tsx`. El catálogo auditado **sí** llega al prompt.

Lo que sí es cierto y sí importa: **`server.ts` tiene 0 referencias a `contextCache`**, y `hiddenFiles` (el sobre que transporta `MEMORIA.md` y `skills.md`, tratado en `server.ts:9577,9672`) lo construye el **cliente**. Conclusión: la honestidad del catálogo depende hoy de un único portador — el navegador. Cualquier camino que componga prompt **sin** pasar por el cliente (subagentes, conductor, ejecutores de plan) no lleva el catálogo auditado. No es un bug de hoy; es una fragilidad de mañana.

### 2.4 Producto y UX

| Dato | Valor real | Fichero:línea |
|---|---|---|
| `App.tsx` | **4.064 líneas**, ~87 `useState`, 40 `useEffect`, **sin React Context** | `src/App.tsx:274-2016` |
| Componentes mayores | `RightSidebar` 1.666 · `ChatCenter` 1.532 · `ModelSelectorModal` 951 · `DedicatedWebEditorView` 808 · `LeftSidebar` 787 | `src/components/*` |
| Componentes huérfanos | **Ninguno** (los 31 se importan y montan) — buena señal | `App.tsx:3401-4036` |
| «Hasta 50 adjuntos» | **Es texto de interfaz**: no hay tope de 50 en el código | `ChatCenter.tsx:711` vs `App.tsx:2038` |
| Topes reales de adjuntos | ZIP 500 ficheros · texto 3,5 MB · 2 MB/fichero · binario >5 MB omitido · DOCX 50 KB | `attachmentProcessor.ts:580-655` |
| **Workspace** | `localStorage`, tope **5 MB**; al superarlo **no guarda y solo avisa por consola** | `src/utils/storage.ts:11,36-38,62-63` |

El último es el más caro de los cinco: **el usuario puede perder su workspace al recargar sin que nada se lo diga en la interfaz.** El fix del ROADMAP («Encolar ya no aborta la generación») está confirmado en `App.tsx:1031-1041` y `:2421`.

El reparto de `localStorage` está repartido y sin dueño único: ajustes en `cerebronico_settings` (`App.tsx:642,658`), tipografías en `codigo0_app_font_size` (`:1148`) y `codigo0_code_font_size` (`CodeEditor.tsx:46,53`), fondo en IndexedDB (`indexedDBStorage.ts:12-15`), espejos en `cn.espejos.seleccion` (`espejos.ts:195,213`), aspecto en `cn.aspecto.v1` (`aspecto.ts:256`), lecciones y métricas en `selfImprovement.ts:96-98`.

### 2.5 Verificación y entrega

**La puerta se puede eludir sin mala fe.** `scripts/validar.mjs` lleva la lista de suites **hardcodeada** (`:24-92`). Una suite nueva que no se registre **nunca corre**, y el veredicto seguirá saliendo verde. Peor: el parser (`:137-164`) tiene un camino de falso verde —si una suite imprime recuento **y además** líneas `✗`, se cuenta por recuento y las rojas se ignoran (`:143-144`)— y uno de falso rojo —si no usa el formato esperado, se cuenta «no ejecutada» (`:248`), que es exactamente el bug que costó la v1.1-HD del Quirófano.

**El manifiesto está bien pensado y es incompleto.** `MANIFIESTO_SHA256_v1.6.33.txt` cubre **22 entradas**: 1 informe, 17 fuentes, solo 3 tests de ~60, y 5 ficheros de `dist/`. **No cubre** `dist/assets/pdf.worker.min-*.mjs`, `fondo-predeterminado.jpg`, `icono-cerebronico.png`, `favicon.ico`, ni `.proyectos/.cerebro-db/kb.json`. Es decir: hay ficheros entregados que nadie puede verificar, y uno de ellos (`kb.json`) es **estado que las pruebas de humo modifican**.

**Las copias canónicas se han separado del árbol.** Comparación de líneas entre `mejoras/<pkg>/` y su equivalente vivo:

| Paquete | Canónico | Árbol | Veredicto |
|---|---|---|---|
| `quirofano.ts` | 883 | 883 | en sync |
| `coreo.ts` | 143 | 143 | en sync |
| `espejos.ts` | **668** | **852** | **divergen** |
| `fondo.ts` | **102** | **187** | **divergen** |

Esto choca de frente con la convención escrita en la propia memoria del proyecto («los fixes de ficheros parcheados se duplican SIEMPRE en `mejoras/<paquete>/`»). Si algún día hay que restaurar y re-aplicar una capa, la copia canónica reconstruiría una versión más pobre. **Un canon que diverge no es un canon: es una segunda verdad.**

**Cero git.** No hay `.git` ni dependencia de git en `package.json`. El ROADMAP ya lo marcó como «el hueco real más grande» y sigue siéndolo: sin git, el Quirófano puede deshacer **una tanda**, pero nadie puede deshacer **una semana**.

### 2.6 Documentación contra código — lo que ya no es verdad

| Documento dice | Código dice | Consecuencia |
|---|---|---|
| `ROADMAP.md:20` «el `dist/` que viaja en el ZIP es el viejo» | `dist/server.mjs:5799` declara 1.6.33 y contiene Quirófano | Trampa documental: te obliga a recompilar «por si acaso» |
| `ROADMAP.md:35` D8 «NO IMPLEMENTADO, cero referencias a `eval_count`» | `metricasInferencia.ts:77-102`, `server.ts:11079-11095` | Trabajo ya hecho que el roadmap te pide repetir |
| `ROADMAP.md:53` D-P1 «el balanceo TS/JSX es código muerto» | `syntaxGuard` v3 con `esbuild.transform` en 5 puertas | Idem |
| `ROADMAP.md:34` D7 «SIN VERIFICAR» | `votacionConsejo.ts` + suite 40/40 | Idem |
| `ROADMAP.md:56` «convertir el catálogo a aspiracional» | `catalogoHonesto.ts` existe y está cableado al cliente | Idem |
| `mejoras/cerebronico-quirofano-v1/aplicar-quirofano.mjs:8` «server.ts (10.990 líneas)» | 11.461 líneas | Las capas de parche se anclan a un fichero que ya no existe tal cual |

**El ROADMAP es el documento de continuidad entre sesiones** — el que leen las sesiones siguientes (esta incluida). Un ROADMAP desactualizado no es un documento inofensivo: **es un generador de trabajo duplicado**. Arreglarlo es la Fase 0.

------------------------------------------------------------------------

## 3. Arquitectura objetivo v2

### 3.1 Lo que NO cambia

Las cinco tesis fundacionales de `ARQUITECTURA_CEREBRONICO_V8.md:18-23` se conservan íntegras, porque el diagnóstico no las contradice en ningún punto:

1. El conocimiento vive en el motor, no en el modelo.
2. Determinismo primero; el neural solo cuando la confianza no alcanza.
3. 8 GB es la ley de diseño (tramos MR1–MR4).
4. Cero claves para empezar.
5. **Nada silencioso** — esta es la que el v2 lleva más lejos: deja de ser una regla del motor y pasa a ser una propiedad **comprobable por test**.

Puertos (regla de oro inmutable): **3000** IDE · **3500** sandbox · **5000** puente · **11434** Ollama externo.

### 3.2 Las nueve decisiones de v2

| # | Decisión | Por qué (hallazgo que cierra) |
|---|---|---|
| **A1** | **Un fichero = un dominio.** `server.ts` pasa a `server/bootstrap.ts` + `server/routers/<dominio>.ts`. Ningún router supera 600 líneas. | H5 (monolito), H10 (capas de parche que chocan) |
| **A2** | **El estado tiene dueño.** Los 19 singletons salen a módulos de estado explícitos (`server/estado/*.ts`) con ciclo de vida y sin exportar mutables sueltos. | H5 (`operacionQf`, `sandboxProc` compartidos) |
| **A3** | **`/api/ai/stream` deja de ser un manejador y pasa a ser un pipeline** (`contexto → proveedor → stream`), con un adaptador por proveedor. | H5 (1.711 líneas en un handler) |
| **A4** | **El puente PC se cierra por defecto:** sin `shell=True`, lista blanca de binarios, contención de rutas por raíz permitida, token obligatorio y registro de auditoría por acción. | H1, H2, H3, H4 (los dos CRÍTICOS y los dos ALTOS) |
| **A5** | **El Consejo ejecuta o confiesa.** Registro `acción → ejecutor` con test que exige, para cada una de las 23 acciones, o un ejecutor real o una declaración explícita. | H7 (16 acciones sin ejecutor) |
| **A6** | **Un solo almacén de cliente, con cuota y error visible.** Datos (workspace, chats) a IndexedDB; preferencias pequeñas en `localStorage`; nunca un guardado silenciosamente perdido. | H6 (pérdida del workspace >5 MB) |
| **A7** | **La puerta no se puede eludir.** Descubrimiento dinámico de suites, parser estricto (recuento **y** marcas), manifiesto completo de todo lo entregado. | H9 (suites hardcodeadas, falso verde) |
| **A8** | **Git nativo como cimiento, no como extra.** El Quirófano gana un segundo nivel de deshacer (commit por tanda); la copia canónica de `mejoras/` deja de ser necesaria como canon paralelo. | H10 (cero git, canon divergente) |
| **A9** | **Enrutador de modelo por complejidad** (local ↔ nube) con la heurística declarada y medida. | Cierre del hueco ya recomendado en `ide/CORROBORACION_Y_ROADMAP_REAL.md:70` |

### 3.3 El plano en capas de v2

```
┌──────────────────────────────────────────────────────────────────────────┐
│ L5  EMPAQUETADO   1 EXE Electron + NSIS. .env NUNCA empaquetado.          │
│                   Manifiesto SHA256 COMPLETO (todo lo entregado).         │
├──────────────────────────────────────────────────────────────────────────┤
│ L4  AGENTE PC     Puente :5000 · sin shell · lista blanca de binarios ·   │
│                   raíces permitidas · token obligatorio · auditoría por   │
│                   acción · modo lectura/escritura separado                │
├──────────────────────────────────────────────────────────────────────────┤
│ L3  IDE (shell)   server/bootstrap.ts + routers por dominio (<=600 L)     │
│                   + estado con dueño + pipeline de chat por etapas        │
│                   UI: App.tsx <=600 L, contextos, workspace en IndexedDB   │
├──────────────────────────────────────────────────────────────────────────┤
│ L2  NÚCLEO       50 entidades · espejos · REGISTRO acción->EJECUTOR       │
│    AGÉNTICO      (23/23 con ejecutor o declaración) · conductor ·         │
│                  planificador · Quirófano · extensiones · forja          │
├──────────────────────────────────────────────────────────────────────────┤
│ L1  MOTOR        KB (lesson auto-rellenada) · syntaxGuard v3 · symbolIndex│
│                  · compactor · brain (memoria + rollback) · métricas      │
│                  reales · RAG único y declarado (sin embeddings por       │
│                  defecto) · modelTiers · toolRegistry                     │
├──────────────────────────────────────────────────────────────────────────┤
│ L0  NÚCLEO BASE  puertos · constants (fuente única) · storage con cuota   │
│                  visible · postinstall · PUERTA: validar dinámico, tsc,   │
│                  e2e, audit, manifiesto completo                          │
└──────────────────────────────────────────────────────────────────────────┘
   Procesos: IDE :3000 · Sandbox :3500 · Puente :5000 · Ollama :11434
```

### 3.4 Qué cambia, pieza por pieza

| Pieza | Hoy | v2 | Puerta que lo demuestra |
|---|---|---|---|
| `server.ts` | 11.461 L, 126 rutas | `bootstrap.ts` (<200 L) + `routers/*` por dominio | 126 rutas del contrato de superficie responden igual |
| `POST /api/ai/stream` | 1.711 L | pipeline: `armarContexto()` → `elegirProveedor()` → `transmitir()` | suite `pipelineChat` + prueba de paridad de salida |
| Estado global | 19 singletons | `estado/` con dueño y ciclo de vida | test que prohíbe `let`/`Map` mutables exportados en `server/` |
| Puente :5000 | `shell=True`, rutas abiertas | lista blanca + contención + auditoría | `seguridadPuente.test.ts` falla si vuelve `shell=True` |
| Guard sandbox | fail-open | fail-closed fuera de loopback | test de arranque sin token |
| Consejo | atribuye | 23/23 con ejecutor o declaración | `consejoEjecutores.test.ts` |
| Lecciones | `brain/lesson` huérfano | un solo camino vivo, con llamador probado | test de cableado (no de existencia) |
| Workspace | `localStorage` 5 MB silencioso | IndexedDB + error visible | prueba de guardado con datos >5 MB |
| Suites | lista fija de 63 | descubrimiento dinámico | suite nueva sin registrar → aparece sola |
| Manifiesto | 22 entradas | todo lo entregado | `sha256sum -c` sobre el paquete final |
| `mejoras/` | canon divergente | canon = árbol + git; `mejoras/` solo histórico | `sha256sum -c` de cada manifiesto de capa |

------------------------------------------------------------------------

## 4. Programa por fases

Cada fase se declara cerrada **solo** si pasa su puerta (comandos exactos en el [ANEXO B](ANEXO_B_CRITERIOS_DE_ACEPTACION.md)). Los esfuerzos son **estimaciones**, no medidas.

### Resumen

| Fase | Nombre | Severidad que ataca | Esfuerzo estimado | Depende de |
|---|---|---|---|---|
| 0 | Verdad congelada | H9, H10, docs | 1–2 días | — |
| 1 | Seguridad cerrada | H1, H2, H3, H4 | 3–5 días | F0 |
| 2 | Partir el monolito | H5 | 2–3 semanas | F1 |
| 3 | Motor del chat | H5 (chat) | 1–2 semanas | F2 |
| 4 | Cerebro ejecutor | H7, H8, catálogo | 1–1,5 semanas | F2 |
| 5 | Producto y datos | H6 | 1,5–2 semanas | F2 |
| 6 | Git nativo + enrutador | H10, A9 | 2 semanas | F2 |
| 7 | Visión y decisión del mapa | deuda declarada | 1 mes+ | F4 |

Las fases 3, 4, 5 y 6 son **independientes entre sí** una vez partido el monolito: pueden ir en el orden que marque tu urgencia. La 1 no admite espera, la 2 no admite atajos.

---

### FASE 0 — Verdad congelada

**Objetivo:** que la puerta de verificación y la documentación de continuidad dejen de poder mentir por accidente.

**Entregables**

1. `validar.mjs` con **descubrimiento dinámico**: recorre `tests/*.test.ts`, y avisa en rojo si encuentra un fichero de test que no ejecutó.
2. Parser **estricto**: si una suite imprime recuento **y** marcas `✗`, gana el caso peor (hoy gana el recuento, `validar.mjs:143-144`).
3. **Manifiesto completo**: todo fichero entregado (incluidos `dist/assets/*`, `fondo-predeterminado.jpg`, `icono-cerebronico.png`, `favicon.ico`) y decisión explícita sobre `.proyectos/.cerebro-db/kb.json` (cubrirlo, o excluirlo del paquete y regenerarlo).
4. **ROADMAP regenerado desde código** (D7, D8, D-P1 y catálogo ya no están pendientes).
5. **Reconciliación del canon**: o `mejoras/*/src/**` se sincroniza con el árbol y se re-firman sus SHA256, o se declara `mejoras/` como **histórico** y se retira la pretensión de canon.

**Puerta:** `npm run validar` con descubrimiento dinámico (una suite nueva de prueba aparece sin registrarla) · `sha256sum -c` del manifiesto nuevo = 100 % · el ROADMAP no contiene ningún pendiente ya implementado.

**Riesgo:** bajo. Esta fase solo puede mejorar la verificación, nunca el producto.

**Por qué va primera:** es la fase que hace fiables todas las demás. Y es la que evita el fallo que ya ha ocurrido dos veces en este proyecto (v1.1-HD: la puerta dio falso rojo; v1.6.31: el bundle salió sin el parche).

---

### FASE 1 — Seguridad cerrada

**Objetivo:** que el agente de PC siga existiendo, pero que **la lista blanca sea el camino normal** y lo demás sea explícito, registrado y reversible.

**Entregables**

1. **Puente sin shell:** se retira `shell=True` (`agent_bridge_5000.py:595-599`). Los comandos se ejecutan con `subprocess` y **lista blanca de binarios** declarada en un fichero de configuración versionado. Un comando fuera de la lista devuelve `ok:false` con `motivo` (nada silencioso).
2. **Contención de rutas:** `resolve_pc_path` (`:131-162`) sustituye el «devuelve la absoluta tal cual» (`:162`) por validación contra **raíces permitidas** con `os.path.realpath` + `commonpath` (mismo patrón que ya usa Node en `resolveSafePath`, `server.ts:662-669`, que sí está bien hecho).
3. **Token obligatorio y CORS con `Origin` exigido** en el puente (`_origen_ok:63-65` deja de devolver `true` cuando falta `Origin`).
4. **Guard fail-closed fuera de loopback** en `sandboxAuthorized` (`server.ts:511-518`): sin token, solo `127.0.0.1`/`::1` pasan.
5. **Los 9 endpoints mutadores sin guard** entran en el guard (lista exacta y líneas en §2.2) o se declaran de solo lectura y se prueban como tales.
6. **Auditoría por acción:** cada ejecución del puente deja una línea en `.cerebro-db/auditoria.jsonl` (hora, acción, ruta, resultado, motivo) + panel que la muestra. Es el complemento natural del Quirófano: él juzga **escrituras**, esto juzga **ejecuciones**.
7. **Modo lectura/escritura separado:** el modo agente PC arranca en lectura; la escritura se habilita con las mismas confirmaciones explícitas que ya existen para el borrado.

**Puerta**

- `tests/seguridadPuente.test.ts` (nueva): falla si vuelve a existir `shell=True`; una ruta fuera de las raíces permitidas se rechaza en `/api/fs/read|write|delete`; sin `Origin` el puente rechaza; sin token, cualquier ruta no-loopback se rechaza.
- Prueba **negativa** ejecutada: intento de leer un fichero fuera de las raíces → rechazo con motivo; intento de ejecutar un binario no listado → rechazo con motivo. Los dos quedan como aserciones de la suite, no como prueba manual.
- `npm audit --audit-level=high` sin hallazgos altos.

**Riesgo:** medio de compatibilidad. Al cerrar el puente pueden romperse atajos que hoy funcionan «porque todo pasaba». Mitigación: la lista blanca **se construye desde el uso real** (primero se registra qué se ejecuta durante una sesión normal, y esa lista se declara), en lugar de inventarse una lista desde cero. Ese registro es el entregable 6, así que la fase se autoalimenta.

---

### FASE 2 — Partir el monolito

**Objetivo:** que `server.ts` deje de ser un fichero y pase a ser un **plano**. Cambio **sin cambio de comportamiento**: la salida debe ser idéntica.

**Entregables**

1. `server/bootstrap.ts` (<200 L): arranque, middleware, montaje de routers, cierre ordenado.
2. `server/routers/<dominio>.ts`, un fichero por dominio y ninguno >600 L: `ai`, `sandbox`, `fs`, `exec`, `engine`, `consejo`, `espejos`, `boveda`, `extensiones`, `quirofano`, `export`, `telemetria`, `puente`, `coreo`.
3. `server/estado/*.ts`: los 19 singletons con dueño, ciclo de vida y reset (necesario para los tests).
4. **Contrato de superficie** (`tests/superficieRutas.test.ts`): la lista completa de las 126 rutas con método y forma de respuesta, congelada **antes** de mover nada y verificada después. Esta es la red de seguridad que hace posible partir 11.461 líneas sin miedo.

**Método obligatorio (regla del proyecto: la puerta antes que el bisturí)**

1. Congelar el contrato de superficie.
2. Extraer **un dominio por tanda**, empezando por los de menos riesgo (`telemetria`, `coreo`, `export`, `boveda`).
3. Tras cada tanda: `tsc` 0 + `validar` igual o mejor + contrato de superficie intacto.
4. **Quirófano activo** durante todo el trabajo: es exactamente el caso de uso para el que se construyó (juzga cada escritura y revierte la tanda si rompe).

**Puerta:** 126/126 rutas con respuesta equivalente · 0 errores de tipos · las 63 suites verdes **sin cambiar una sola aserción** · ningún fichero nuevo >600 líneas.

**Riesgo:** alto por volumen, bajo por diseño (se extrae sin reescribir lógica; prohibido «aprovechar para mejorar» dentro de esta fase — cada mejora va en su fase). La regla es explícita: **en F2 no se mejora nada; se mueve.** Sin esa disciplina, partir el monolito se convierte en el escenario que el propio `LEEME_QUIROFANO_v1.txt:9-13` describe (un modelo reescribiendo de memoria).

---

### FASE 3 — Motor del chat

**Objetivo:** que el camino más caliente del producto (`/api/ai/stream`, 1.711 líneas) sea legible, medible y por etapas.

**Entregables**

1. `server/chat/pipeline.ts`: `armarContexto()` → `elegirProveedor()` → `transmitir()` → `medir()`.
2. `server/chat/proveedores/*.ts`: **un adaptador por proveedor** (Ollama, Gemini, OpenRouter, Custom, Z.ai), con el mismo contrato de entrada/salida. Hoy la composición del prompt está resuelta con ramas dentro del handler.
3. **Métricas por etapa**: TTFT, tokens/s, tiempo de armado de contexto y tamaño inyectado por bloque, expuestos por turno (hoy `metricasInferencia.ts:77-102` ya extrae todo esto de Ollama; el trabajo es que el pipeline lo reporte por etapa y que el panel lo muestre).
4. **Cierre del `len/4`**: `metricasInferencia.ts:118` y `App.tsx:1453` dejan de estimar cuando hay medida real disponible (la estimación se conserva solo etiquetada como estimación, que es lo correcto).

**Puerta:** salida byte-comparable contra el pipeline viejo en 5 prompts de referencia (mismo modelo, temperatura 0) · métricas por etapa presentes en la respuesta · ninguna rama de proveedor fuera de su adaptador (`grep` en el test).

**Riesgo:** medio. El chat es el corazón del producto; por eso la puerta es paridad de salida, no «parece que va».

---

### FASE 4 — Cerebro ejecutor

**Objetivo:** que el Consejo deje de ser un reparto de nombres y pase a ser un reparto de trabajo. Es el paso que convierte la v1.6.33 en un producto y no en un organigrama.

**Entregables**

1. **Registro `acción → ejecutor`** (`src/engine/ejecutoresConsejo.ts`): para cada una de las 23 acciones, o un ejecutor real, o una declaración explícita de que no existe (y **por qué**). Candidatos naturales, ya presentes en el código:
   - `contar`, `listar`, `filtrar`, `ordenar`, `buscar` → deterministas sobre el workspace (sin modelo; es el camino «0 llamadas LLM» que ya defiende el motor).
   - `explicar`, `resumir`, `comparar`, `analizar` → espejos/ruta determinista cuando hay datos, modelo cuando no.
   - `testear`, `documentar`, `refactorizar`, `optimizar` → `planExecutors` + Quirófano (toda escritura pasa por el guardián).
   - `traducir`, `instalar`, `desplegar` → ya declaradas sin especialista (`votacionConsejo.ts:79-81`); **se mantiene la declaración** y se documenta el camino manual. Prometer un instalador que no existe sería exactamente el defecto que este proyecto lleva 6 versiones corrigiendo.
2. **Cierre de D9:** o `/api/brain/lesson` gana su llamador (la lección recuperada escribe en `memoria.md`), o se retira el endpoint. **No puede quedar un endpoint sin llamador**: se añade un test que falla ante cualquier ruta declarada que nadie invoca.
3. **Catálogo honesto también en el servidor:** `contextCache`/`catalogoHonesto` dejan de depender del navegador como único portador (hoy `server.ts` tiene 0 referencias). El servidor compone el bloque auditado por sí mismo cuando no lo recibe.
4. **RAG único:** se decide cuál de los dos `localRAG` sobrevive (`src/engine/localRAG.ts` vs `src/utils/localRAG.ts`) y el otro se retira con su test. Y el producto deja de llamarlo «vectorial» mientras no haya embeddings: hoy recupera por token/clave (`localRAG.ts:131,134-162`).

**Puerta:** `tests/consejoEjecutores.test.ts` (nueva) exige 23/23 con ejecutor o declaración motivada · test de «endpoint sin llamador» en verde · la suite de votación sigue verde sin tocar sus 40 aserciones.

**Riesgo:** medio. El riesgo real no es técnico, es de honestidad: la tentación es declarar «ejecuta» lo que solo enruta. La puerta lo impide porque exige una llamada real por acción.

---

### FASE 5 — Producto y datos

**Objetivo:** que la interfaz deje de ser un fichero de 4.064 líneas y que el workspace deje de poder perderse.

**Entregables**

1. `App.tsx` ≤600 líneas, con contextos: `SesionContext`, `ChatContext`, `WorkspaceContext`, `PreferenciasContext`, `MotorContext` (hoy: 87 `useState` y 40 `useEffect` en un solo componente, sin un solo Context).
2. Partir los gigantes por responsabilidad, no por tamaño: `RightSidebar` (1.666 L) → explorador + editor + terminal; `ChatCenter` (1.532 L) → mensajes + adjuntos + TTS + cola; `ModelSelectorModal` (951 L) → lista + ficha + salud de espejos.
3. **Workspace a IndexedDB** con cuota real y **error visible** al superarla (hoy `storage.ts:36-38,62-63` falla en silencio por consola). Regla: **ningún guardado puede perderse sin que la interfaz lo diga.**
4. **Adjuntos: hacer verdad el «hasta 50».** O se implementa el tope (y se ve), o se cambia el texto de la interfaz (`ChatCenter.tsx:711`). Los topes reales ya existentes (`attachmentProcessor.ts:580-655`) se muestran al usuario en lugar de descubrirse al fallar.
5. **Preferencias con un solo dueño:** un módulo `preferencias.ts` que reúna las claves hoy dispersas (`cerebronico_settings`, `codigo0_app_font_size`, `codigo0_code_font_size`, `codigo0_wallpaper_preset`, `cn.espejos.seleccion`, `cn.aspecto.v1`), con migración desde las claves viejas y test de migración.

**Puerta:** `App.tsx` ≤600 L y 0 componentes >900 L · prueba de guardado con >5 MB que produce aviso visible y conserva los datos · test de migración de preferencias · las suites de UI existentes verdes.

**Riesgo:** medio-alto de regresión visual. Mitigación: la reorganización es de **propiedad de estado**, no de diseño; cada paso se prueba contra la misma suite y con el mismo aspecto en pantalla.

---

### FASE 6 — Git nativo + enrutador de modelo

**Objetivo:** cerrar el hueco que el propio proyecto lleva meses señalando como el más grande.

**Entregables**

1. **Git nativo** (`simple-git` o `isomorphic-git`, hoy 0 referencias en `package.json`): panel con estado, diff por fichero, commit por tanda con mensaje automático (frase del usuario + ficheros tocados), historial y **volver atrás**, todo dentro del workspace y sin depender de un git externo instalado.
2. **Integración con el Quirófano:** cada tanda juzgada por el Quirófano produce también un commit. Así se pasa de «deshacer una tanda» a «deshacer cualquier punto de la semana» — el segundo nivel de deshacer que hoy no existe.
3. **Enrutador de modelo por complejidad** (A9): heurística declarada (longitud + tipo de tarea + presencia de espejo aplicable) que decide local ↔ nube, con el motivo visible por turno y **medición** del efecto (TTFT y tokens/s antes/después). Sin medición, no se declara.

**Puerta:** commit y rollback probados por suite sobre un repositorio de prueba · el rollback deja el árbol byte-idéntico al commit elegido (`sha256sum`) · el enrutador muestra el motivo del cambio de modelo en el panel de contexto y su efecto está medido.

**Riesgo:** medio. `git init` sobre `.proyectos/` con estado vivo requiere cuidado con `.cerebro-db/` (que debe quedar **fuera** del repo o con ignore explícito, para no versionar conocimiento en cada commit).

---

### FASE 7 — Visión y decisión del mapa

**Objetivo:** decidir, con números, qué se construye y qué se retira del mapa aspiracional. **No se promete nada de esta fase**: se decide aquí.

**Entregables**

1. **Visión/OCR** (hoy no existe: `generar_imagen` es salida, no entrada — `ide/CORROBORACION_Y_ROADMAP_REAL.md:31`): cablear un modelo con visión en el tramo MR3+ y declararlo por tramo, con prueba de una imagen real descrita.
2. **Decisión escrita del mapa**: `catalogoHonesto` mantiene hoy 69 capacidades aspiracionales correctamente etiquetadas. Para cada una: **construir, aplazar con fecha, o retirar del registro**. Criterio de decisión: valor para tu uso real, coste en el tramo MR2 (la ley de diseño de 8 GB) y si hay pieza previa ya construida.
3. **Modo serie de imágenes** (recomendación de bajo coste ya escrita en el roadmap: elimina la mayor parte de los reintentos por 429).

**Puerta:** una imagen real descrita por el sistema, por tramo declarado · el registro del mapa sin ninguna entrada en estado «sin decisión» · `npm run validar` con las suites nuevas.

------------------------------------------------------------------------

## 5. El tablero: métricas que se miden solas

Un plan sin números que se midan es una opinión. Estas son las ocho cifras de v2, todas obtenibles por comando:

| Métrica | Hoy (medido) | Objetivo v2 | Cómo se mide |
|---|---|---|---|
| Líneas de `server.ts` | 11.461 | <200 (bootstrap) | `wc -l` |
| Ficheros de servidor >600 L | 1 (11.461) | 0 | `find` + `wc -l` |
| Handler más grande | 1.711 L | <300 L | inventario de rutas |
| Rutas del contrato de superficie | 126 | 126 (idénticas) | `tests/superficieRutas.test.ts` |
| Acciones con ejecutor o declaración | 7 con ejecutor / 16 sin | 23/23 | `tests/consejoEjecutores.test.ts` |
| Endpoints sin guard | 9 | 0 | test de superficie de seguridad |
| Suites registradas | 63 (lista fija) | == nº de ficheros de test | descubrimiento dinámico |
| Manifiesto | 22 entradas | 100 % de lo entregado | `sha256sum -c` |
| `App.tsx` | 4.064 L | ≤600 L | `wc -l` |
| Hallazgos CRÍTICOS abiertos | 2 | 0 | este documento, §1.4 |

**Regla de la casa aplicada al tablero:** cada fase publica «CONSERVA + delta» — las cifras anteriores no pueden empeorar. Es el mismo patrón que ya usan los informes («era 3291/61; +81 comprobaciones, cero regresiones»), ahora aplicado a la estructura y no solo a las pruebas.

------------------------------------------------------------------------

## 6. Riesgos y su manejo

| Riesgo | Por qué es real aquí | Manejo |
|---|---|---|
| **Un modelo reescribe de memoria y mutila** | Es *el* fallo histórico del proyecto (`LEEME_QUIROFANO_v1.txt:9-13`) | Quirófano activo en todas las fases + `read` antes de `edit` + contrato de superficie congelado antes de partir el monolito |
| **Partir el monolito introduce regresiones silenciosas** | 126 rutas, 19 singletons compartidos | Una tanda = un dominio; prohibido mejorar dentro de F2; contrato de superficie como puerta |
| **El bundle vuelve a quedarse sin el parche** | Ya pasó (`dist/server.mjs` viejo, v1.6.31) | La puerta exige `npm run build` y una búsqueda de cadenas de la feature **dentro** del bundle, no solo en el fuente |
| **La puerta da falso verde** | Ya pasó (suites hardcodeadas, parser laxo) | Fase 0 antes que nada |
| **Cerrar el puente rompe el uso diario** | El puente es el corazón del producto | La lista blanca se construye desde el registro de uso real (entregable 6 de F1), no desde una idea previa |
| **`git init` versiona conocimiento vivo** | `.cerebro-db/` cambia en cada turno | Ignore explícito + decisión escrita de qué entra en el repo |
| **Se pierde el canon de las capas de parche** | `mejoras/` ya diverge del árbol | F0: sincronizar o declarar histórico. Nunca dejarlo indefinido |
| **El plan se convierte en otro documento desactualizado** | Es el fallo que este plan denuncia | Tras cada fase, el ROADMAP se regenera desde código (no se edita a mano) |

------------------------------------------------------------------------

## 7. Descartado a propósito (con motivo, no por olvido)

| Descartes | Motivo |
|---|---|
| Docker/Podman, CRDT/Yjs, DAP, Wasm | Cada uno es una plataforma nueva, no una carencia del cerebro; chocan con la ley de 8 GB y con el tope del workspace (`ide/CORROBORACION_Y_ROADMAP_REAL.md:17-21`) |
| Empaquetar Ollama o Python dentro del EXE | Decisión de ligereza y seguridad ya tomada y sostenida (`ARQUITECTURA_CEREBRONICO_V8.md:296`) |
| «Instalador/despliegue» automático | Sin especialista declarado, y honestamente declarado (`votacionConsejo.ts:79-81`). Se mantiene así |
| Vault cifrado de claves (PBKDF2/AES-GCM) | Deseable, pero el riesgo real hoy es **local, no de distribución** (`.env` no se empaqueta). Sube a propuesta de Fase 6 solo si quieres endurecer el almacenamiento local |
| Reescribir el motor de espejos | Los 10 espejos y 22 poderes son código determinista, probado y con contratos: no hay diagnóstico que los señale |

------------------------------------------------------------------------

## 8. Límites de este plan (lo que no hice)

Por la regla de la casa, esto se dice en lugar de disfrazarse:

1. **No he modificado una sola línea de código.** Acordamos un documento; sigue siendo un documento.
2. **No he arrancado la aplicación ni la he visto en un navegador.** Todo lo de interfaz es lectura de código (`App.tsx`, `src/components/*`), con las líneas citadas.
3. **No he ejecutado el e2e con Python** (`npm run test:e2e` pide Python) ni he arrancado el puente :5000 ni un modelo de Ollama real. Las conclusiones sobre el puente son de lectura de su código, no de un pentest ejecutado.
4. **No he probado el EXE** ni la cadena de Electron/NSIS.
5. **Sí ejecuté el gate real** (install de dependencias de cero → `tsc` → `validar` → verificación de integridad) y ese resultado es la base de §1.2. Tras el gate, el árbol quedó **byte-idéntico**: `sha256sum -c` sigue dando 22/22.
6. **Los esfuerzos por fase son estimaciones** de orden de magnitud, no medidas. El volumen de código sí está medido (11.461 + 48.808 líneas).
7. **El diagnóstico se corrigió a sí mismo una vez durante la auditoría** (el «catálogo huérfano» era falso: lo verifiqué y lo dejé escrito en §2.3 con la corrección). Lo digo porque es la prueba de que la verificación por lectura falla — y es la razón por la que este plan se apoya en comandos ejecutados.

------------------------------------------------------------------------

## 9. El siguiente paso, si quieres empezar

**Fase 0 y Fase 1.** Ninguna otra cosa antes, por este orden:

1. **Fase 0 es barata y multiplica el valor de todo lo demás.** Sin ella, cada fase posterior se cierra con una puerta que puede estar mintiendo.
2. **Fase 1 es la única con severidad CRÍTICA.** Mientras el puente ejecute con `shell=True` y resuelva rutas sin contención, el resto del proyecto está construido sobre una puerta abierta a tu PC.

Y una decisión que solo es tuya, porque afecta a tu forma de trabajar: **¿la Fase 2 se hace de una vez (2–3 semanas de un tirón) o por dominios sueltos aprovechando las sesiones normales de mejora?** El plan está diseñado para las dos cosas: el contrato de superficie congelado permite parar y retomar sin perder el hilo, y cada dominio extraído es una mejora real por sí misma.

---

*Documento terminado. Todo hallazgo tiene `ruta:línea`; toda cifra del estado actual se obtuvo ejecutando. Lo que es estimación, está dicho como estimación.*

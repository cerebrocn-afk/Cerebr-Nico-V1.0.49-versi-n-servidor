# INFORME DE VALIDACIÓN — EDITOR-V2 consolidado y ciclo v1.16.6

**Fecha:** 2026-09-28 · **Árboles:** `Cerebronico-v1.16.5-EDITOR-V2-FINAL.zip` + `Cerebronico-mejoras-editor-v2.zip` → **entrega renombrada v1.16.6** (la cifra que coincide con lo que el código ya decía por dentro) · **Máquina:** Linux x64, Node v22.23.2

> Regla honrada: «Corroborar = ejecutar» — nada aquí se declara verificado sin
> install + tsc + validar + build + smoke real (convención de `documentacion/MEMORY.md`).

---

## 1. El parche ya estaba integrado — probado de tres formas

| Vía | Resultado |
|---|---|
| `node aplicar-editor-v2.mjs --raiz <árbol>` | `0 parches, 19 ya estaban` — las 19 anclas existen; el instalador no escribió nada (idempotencia confirmada) |
| SHA256 de los 4 ficheros del pack vs el árbol | quickParser.ts, DedicatedWebEditorView.tsx, accionesRapidas.test.ts y SANDBOX_CONFIG_Y_ARRANQUE_v1.md: **IDÉNTICOS** |
| Suite `accionesRapidas` dentro de `npm run validar` | **22 comprobaciones correctas** |

## 2. Integridad y manifiestos

- `sha256sum -c MANIFIESTO_SHA256_EDITOR-V2.txt` sobre el árbol del ZIP: **756/756 OK · 0 FAILED** (el smoke tocó `.proyectos/.bridge_5000.log`: restaurado byte a byte, convención de empaquetado limpio).
- El `MANIFIESTO_SHA256_v1.16.5.txt` de la raíz era **pre-integración** (de ahí sus 18 diferencias): regenerado por ciclo como `MANIFIESTO_SHA256_v1.16.6.txt` sobre el árbol final → `npm run manifiesto:verificar` VERDE. EDITOR-V2 y v1.16.5 quedan como firmas históricas.
- Build reproducible: el `npm run build` local produjo los MISMOS hashes de `dist` que el ZIP entregado (pre-renombrado).

## 3. Renombrado de cifra (pedido: «continua con la cifra que coincida»)

El árbol se rotulaba v1.16.5 pero el parche entero, sus tests y el informe del sandbox decían **v1.16.6**. Subida la semilla única `VERSION_SEMVER` + `package.json` + los 4 literales de `index.html` + el ratchet de `tests/bajoConsumo.test.ts`; estructura de staging `Cerebronico-v1.16.6/Cerebronico-v1.16.6/`. `motor-datos` y `bajoConsumo` verifican la derivación (0 errores). El `package-lock.json` queda intacto a propósito: ya viajaba desalineado por convención de la casa (1.16.3 en el entregado) y tocarlo rompería la firma EDITOR-V2 sin beneficio.

## 4. 🐞 BUG REAL ENCONTRADO Y CERRADO — el sandbox estático nacía roto

**Síntoma del usuario:** «el sandbox lo que le cuesta es encender».

**Causa raíz (demostrada en vivo):** la plantilla `STATIC_SERVER_SOURCE` de `server.ts` (la que escribe `.cn-static-server.cjs` al servir un proyecto HTML puro por la vía `estatico-directo`) construía su página de diagnóstico con cadenas delimitadas en `"` que contenían `\"`. Dentro de una plantilla de backticks, **el propio TypeScript consume esas contrabarras**: el fichero generado llegaba a disco con `lang="es"` sin escapar → `SyntaxError: missing ) after argument list` al cargar → el servidor hijo moría al instante y `/api/sandbox/start` respondía `online:false` con «Sandbox ESTÁTICO sin confirmar en :3500». **Afectaba a todo proyecto HTML/CSS/JS, en cualquier plataforma, también en el `dist` del ZIP entregado** (verificado contra el bundle original).

**Por qué no lo cazó nadie:** las suites de preview (`viaRapidaPreview`, 64 comprobaciones) DECIDÍAN la vía pero jamás COMPILABAN el código generado.

**Arreglo:** 10 cadenas de la plantilla corregidas (delimitadores de comilla simple donde el HTML lleva comillas; `\\n` donde el generado necesitaba el escape) + comentario-causa en el código. **Regresión §9 en `viaRapidaPreview.test.ts`**: extrae la plantilla real de `server.ts`, la evalúa con la misma semántica de escapes y pasa `node --check` contra el `.cjs` materializado — lo que no compila, no se entrega.

**Prueba en vivo (v1.16.6):** `POST /api/sandbox/start` → `{"ok":true,"static":true,"online":true}` · `node --check` OK · `GET http://127.0.0.1:3500/ → 200` sirviendo el index del proyecto · segundo start → `alreadyRunning:true` (idempotente). Con `.proyectos` vacío, el arranque responde con motivo y salida («no se encontró marcador… pulsa Sync») — cero fallos mudos, comportamiento correcto.

## 5. ✨ MODO DE PENSAMIENTO a la vista del chat (pedido directo)

- **Hallazgo previo:** `ai.executionMode` (Auto/Rápido/Ingeniero/Profundo) existía SOLO en el menú Pro y **no lo leía nadie** — regulador mudo, la misma clase de defecto que `systemExtra` (v1.16.5).
- **Hecho:** `src/engine/thinkingMode.ts` (fuente única: ciclo, etiquetas, ayuda, directriz) + chip **«Pensar: …»** siempre visible en el chat junto al de Agente PC (icono Brain; cielo/verde/violeta según modo). Un clic rota Auto → Rápido → Ingeniero → Profundo.
- **Cableado real:** el chip escribe en el MISMO `proSettings` que el menú Pro (una fuente, cero divergencia; el panel lo refleja en vivo) y `handleSendMessageWithRAG` inyecta la directriz del modo al system prompt de cada turno. «Ingeniero» reutiliza `buildExpertDirective("code")` que ya existía; «auto» no añade un byte.
- **Suite nueva `pensamientoChat`** (26 comprobaciones): ciclo completo, «ningún modo nombrado es decorativo», props cableadas, chip sin condición que lo esconda, y las dos puertas (chat + menú Pro) sobre un solo cerrojo.

## 6. Puertas finales del ciclo (ejecutadas todas sobre el árbol v1.16.6)

| Puerta | Resultado |
|---|---|
| `npm run validar` | **TODO CORRECTO — 4063 comprobaciones · 0 fallos · 77 suites · Tipos: 0 errores** (el aviso `planner: 1 ✗` es el fixture de t11: simula un plan que revienta para probar que el panel no miente) |
| `npm run build` | vite + esbuild OK; chip y directriz presentes en `dist/assets/*.js` |
| `npm run superficie:verificar` | CONTRATO INTACTO: 138 rutas declaradas · 138 en el código |
| `npm run manifiesto` + `--verificar` | 756 ficheros firmados · TODO COINCIDE |
| Smoke real | :3000 arriba · puente :5000 autarrancado (python3) · pack puente-mcp cargado · **sandbox estático :3500 sirviendo 200** · `/api/health/deep`: solo rojo Ollama :11434 (no instalado en esta máquina; afecta únicamente a modelos locales) |
| Hoja de ruta v1.16.5 B1–B4 | los cuatro fixes verificados en código (coreo citas / continuidadPlan / systemExtra / honestidad imagen / rutas Desktop-OneDrive) |

## 7. Documentación de problemas históricos (revisada de arriba a abajo)

`hoja-de-datos-errores-y-mejoras.md` (v0.9–v1.0), CHANGELOG completo (v1.6.22 doble copia de memoria; v1.6.23 el sandbox se comía a la IDE; v1.16.5 foco/BLOQUEADO/recursión), `HOJA_DE_RUTA_v1.16.5.md`, `SANDBOX_CONFIG_Y_ARRANQUE_v1.md` (§2: lo que «tarda» del arranque es npm install dentro del start — recetas §3; §5 aislamiento :5000), e `INFORME_SANDBOX_v1.6.*`. Los planes `PLAN_*_v1.md` (cinco) ya viven en `documentacion/` y firmados; `plan_pantalla_trabajo` como documento suelto NO está en el paquete (su contenido está implementado — suite `planTrabajo`, v1.16.3).

**Este árbol está sano: se puede seguir construyendo encima.**

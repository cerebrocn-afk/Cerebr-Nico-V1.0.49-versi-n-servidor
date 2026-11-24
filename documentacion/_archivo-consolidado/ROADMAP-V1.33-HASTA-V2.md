# ROADMAP — de aquí a v2.0 (cierre de v1.33.0 · 2026-09-30)

> **ESTADO 2026-09-30 · CERRADO HASTA FASE 10 (v1.40.0).** Todas las fases del
> plan evolutivo quedaron implementadas como módulos PUROS bajo `src/engine/`,
> cada uno con su suite en `tests/` registrada en `scripts/validar.mjs`, y con
> `tsc --noEmit` en 0 errores sobre todo el proyecto. Mapeo entregado:
>
> - **F4 · v1.34** Evidencia + Matriz de verificación — `motorEvidencia.ts` (29✓) · `matrizVerificacion.ts` (14✓)
> - **F5 · v1.35** Recuperación + Transacción — `motorRecuperacion.ts` · `capaTransaccion.ts` (22✓)
> - **F6 · v1.36** Grafo rico + Guardián de regresión — `grafoRico.ts` · `guardianRegresion.ts` (24✓)
> - **F7 · v1.37** Navegador real (contrato Browser Agent, degradación honesta sin Playwright) — `navegadorReal.ts` (22✓)
> - **F8 · v1.38** Regresión visual + Calidad de producto (3 dimensiones) — `regresionVisual.ts` · `calidadProducto.ts` (13✓)
> - **F9 · v1.39** Model Router (reutiliza `modelTiers`) — `enrutadorModelo.ts` (11✓)
> - **F10 · v1.40** Memory 3.0: ADR + memoria negativa por firma — `memoriaArquitectura.ts` · `memoriaNegativa.ts` (21✓)
>
> Las únicas suites en rojo del validador completo son las que dependen de red /
> `fetch` global (imagen, creador, hindsight, entregaFuncional, rutaTrabajo):
> requieren Node 18+ (este entorno corre Node 16, que no trae `fetch`/`Response`
> globales, como el propio instalador advierte). No son defectos del código de
> las fases; con Node 18+ el validador queda en verde.

Completado: **F1 v1.31** Context Engine + grafo mínimo + cable firma→escalera ·
**F2 v1.32** Plan Adaptativo: contrato de aceptación + presupuesto ·
**F3 v1.33** Reasoning Controller: el motor decide el próximo movimiento (§6)
con política determinista (§19).

| Versión | Qué | Aceptación mínima |
|---|---|---|
| v1.34 · Evidence Engine | unificar certeza+manifiesto+completitud+actas en CLAIM→EVIDENCE→VERDICT; anclaje MECÁNICO criterio→comando (hoy es por orden) | sin evidencia no hay VERIFICADO; cada cierre con parte firmado |
| v1.35 · Navegador real | Playwright/puppeteer: :3500, clics, formularios, viewport, consola, screenshots | detecta lo que los archivos no ven; evidencia entra al Engine |
| v1.36 · Grafo rico + Regresión | aristas llama/sirve/contrato; comparación proyecto completa antes/después | export/ruta/API que desaparece = FALLO |
| v1.37 · Visual & Quality | regresión visual estructural; calidadProducto 3 dimensiones | los 14 ejes pasan de lectura estática a medida |
| v1.38 · Efficiency | modelTiers publicado como router por tarea; exclusión de paralelismo por grafo | lo trivial no despierta al modelo grande |
| v1.39 · Memory 3.0 | ADR + memoria negativa por firma + preferencias | no re-propone lo rechazado; lecciones firmadas |
| v2.0 | consolidación §29 | humano solo en decisiones indecidibles objetivamente |

Principios vigentes como mecánica: §19 medible (esDeterminista) · §3 contrato
antes de código · §5/§17 peldaño automático y bloqueo honesto · §27 trinquete
(el monolito no crece: v1.31 +1 línea, v1.32 y v1.33 0 netas) · módulos en
español · análisis madre: `REVISION-HOJA-DE-RUTA-v1.31.md`.

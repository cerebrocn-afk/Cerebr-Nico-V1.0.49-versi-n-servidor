# HOJA DE RUTA — ANTI-TRANCADO v1.55.1
## «El modelo anuncia y frena» → re-empuje ESCALADO (nunca colgado)

**Versión:** 1.55.1 · **Fecha:** 2026-10-08 · **Para:** Mario Nicolas Quintero

---

## 1. Síntoma reportado (captura 4)

Con `glm-4.5-flash` y «Agente PC ON», el chat responde:

> «Voy a analizar… exploremos la estructura del proyecto»

… y **se queda ahí**: no ejecuta ninguna herramienta, el turno termina mostrando
esa promesa y hay que escribirle «¿qué pasa?» para que siga. Pedido de Mario:
**que siga/conteste solo, sin re-preguntar.**

## 2. Causa raíz

- El anti-trancado de **v1.46.4** ya detectaba el «anuncio sin acción»
  (`motivoDeParada` reconoce «voy a…», encabezados, «primero…») y re-empujaba…
  **pero una sola vez** (cartucho booleano).
- Un modelo flojo volvía a narrar en el 2.º intento → cartucho gastado → el turno
  cerraba igual, colgado de la promesa.
- `glm-4.5-flash` **SÍ** es tool-capable (familia `/glm-4/` en
  `CLOUD_TOOL_FAMILIES`). No era falta de capacidad: era falta de insistencia.

## 3. Fix (integrado)

`src/engine/bucleAutonomo.ts` — nueva `directivaDeReanudacion(intento)`:

| intento | tono |
|--------|------|
| 0 | directiva base de siempre (cero regresión) |
| intermedio | «SEGUNDO AVISO — basta de narrar»: próximo mensaje = herramienta real; arrastra la base |
| último | ULTIMÁTUM con **camino B**: si no vas a usar herramientas, **ENTREGÁ YA** la respuesta en texto —sin «voy a»—; prohibido volver a anunciar y frenar |

`server.ts` — los **dos** puntos de re-empuje de nube pasan de booleano a contador:
- rama OpenAI-compat / Z.ai (`let reempujes = 0`, `reempujes < MAX_REEMPUJES_ANUNCIO`, `directivaDeReanudacion(reempujes)`);
- rama **Gemini** (`let reempujesGemini = 0`, mismo patrón).

> El fix cubre AMBOS proveedores, no solo Z.ai.

## 4. Justificación del tope (escrita en código)

`MAX_REEMPUJES_ANUNCIO = 3`. Con 1 (v1.46.4) un modelo débil se escapaba narrando
dos veces; con **2 reintentos reales + 1 ultimátum de entrega** se cubre el caso
medido sin regalar latencia ni arriesgar un turno interminable. Acotado y
determinista: agotados los re-empujes, el turno cierra con lo que haya.

## 5. Contrato de superficie de rutas (regenerado, justificado)

- Venía **stale** del 2026-10-07: `presupuesto_lineas = 11826` vs `server.ts = 11843`
  real (17 líneas de desfase **pre-existente**, no causado por este fix).
- Regenerado con `node scripts/superficie.mjs`: **141 rutas = 141**,
  `presupuesto_lineas = 11844`, techo derivado 13400, margen 1556.
- **Superficie INTACTA** (141/141): solo creció el conteo de líneas; ninguna ruta
  nueva ni eliminada.

## 6. Pruebas

- `tests/bucleAutonomo.test.ts` → **sección 10** (re-empuje escalado) + aserciones
  de cableado (ambas ramas del `server.ts` usan `directivaDeReanudacion` + contador;
  el booleano viejo no volvió). Registrada en `scripts/validar.mjs` (sin pruebas huérfanas).
- `temp/harness_reanudacion.mjs` (Node v16, extraído del FUENTE): **13/13 verde**.

## 7. SIN VERIFICAR (honestidad)

La ruta de red real contra el proveedor (Z.ai/Gemini) no se ejercita en dev:
depende de Electron + claves + red. Lo probado es la lógica de escalada (unidad +
harness) y el cableado leído del fuente del `server.ts`.

## 8. Versión consistente (4 sitios)

`src/constants.ts` (`VERSION_SEMVER`), `package.json`, `index.html`
(title + description + og:title + og:description) y `CHANGELOG.md` → **1.55.1**.

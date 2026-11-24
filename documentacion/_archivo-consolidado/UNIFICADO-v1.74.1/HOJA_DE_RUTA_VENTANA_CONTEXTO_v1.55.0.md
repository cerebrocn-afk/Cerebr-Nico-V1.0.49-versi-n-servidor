# HOJA DE RUTA — AMPLIAR LA VENTANA DE CONTEXTO DE LOS MODELOS (v1.55.0)

> Pedido de Mario tras exportar el chat (sesión `1791453571902`): el chat se
> cortaba a mitad de la redacción y Z.ai devolvía **«Prompt exceeds max length
> (code 1261)»** con `glm-4.5-flash`. «Amplía la ventana de contexto de los
> modelos, te darás cuenta con el chat.»

---

## 1. DIAGNÓSTICO (causa raíz)

En `src/engine/modelTiers.ts`, la rama de nube **RÁPIDA** (flash/lite/mini/turbo/
haiku…) usaba un presupuesto **FIJO a ojo**: `contextCharBudget = 48000` chars y
`historyTurns = 12`. Era prudente para no desbordar, pero quedaba **>90 % por
debajo** de la ventana real del modelo:

| Familia                         | Ventana real (tokens) |
|---------------------------------|-----------------------|
| GLM-4.5 / 4.5-Flash / 4.5-Air   | 128K                  |
| GLM-4.6 / 4.7                   | 200K                  |
| Claude (sonnet/opus/haiku)      | 200K                  |
| GLM-4.5V y multimodales         | 64K                   |
| Gemini Flash/Pro, GPT-4.1/5     | 1M                    |
| gpt-oss, deepseek, qwen, grok   | 128K                  |

Pedir ~13K tokens a un modelo de 128K **desperdiciaba la ventana** y, a la vez,
cuando se adjuntaban capturas el prompt crecía de golpe y disparaba el 1261.

## 2. LA CURA (pura — NO toca `server.ts`, trinquete 11.842 líneas intacto)

El presupuesto deja de ser un literal y se **DERIVA de la ventana real**:

1. **Tabla nueva** `VENTANAS_CONTEXTO_NUBE` + función `ventanaContextoTokens()`
   (ambas exportadas). Lo específico gana el orden: `glm-4.5v` → 64K **antes** de
   que `glm-4.5` lo capture a 128K. Los alias (p. ej. `nemesis` =
   `gpt-oss:120b-cloud`) heredan la ventana de su canónico vía
   `resolverAliasDeModelo()`.
2. Fórmula: `presupuesto = ventana × fracción_entrada × chars_por_token`,
   acotada por un **TOPE DURO** y un **SUELO** (sin regresión posible).

Resultado medido:

| Modelo                 | Antes        | Después (v1.55.0)        |
|------------------------|--------------|--------------------------|
| `glm-4.5-flash`        | 48000 / 12   | **220000 / 40** (≈4.5×)  |
| `gemini-*-flash`       | 48000 / 12   | 220000 / 40 (tope)       |
| `glm-4.5v` (visión)    | 48000 / 12   | 145600 / ~36             |
| `gpt-oss:120b-cloud`   | 128000 / 20  | 322560 / 60              |

## 3. JUSTIFICACIONES ESCRITAS EN CÓDIGO (no ajustes silenciosos)

- `CARS_POR_TOKEN = 3.5` — prudente para ES + código + logs; subirlo a 4 acercaría
  el prompt al borde y reabriría el 1261. Deja ~12 % de colchón.
- `FRACCION_ENTRADA` **0.65** (rápida) / **0.72** (grande) — reserva margen para la
  salida y las imágenes (las capturas son lo que de verdad dispara el 1261).
- `TOPE_BUDGET` **220000** (rápida) / **400000** (grande) — aunque Gemini declare
  1M tokens, mandar 1M de chars por turno en un equipo de 8 GB dispara la latencia
  sin beneficio real.
- `SUELO_BUDGET` **48000** (rápida) / **128000** (grande) — nunca por debajo del
  comportamiento previo (garantía de no regresión).

## 4. SIN REGRESIÓN

- `numCtx` de nube sigue en **32768** (lo exige `tests/motor-datos.test.ts`).
- La salida no se trunca: `numPredict = -1` intacto.
- Los modelos **LOCALES no se tocan** (su ventana la fija Ollama).
- Las notas del perfil informan en el log de la IDE la ventana real y el
  presupuesto AMPLIADO.

## 5. VERIFICACIÓN

- **POR EJECUCIÓN** en Node v16 con un harness que porta la lógica nueva:
  **18/18 OK**.
- Suite paralela `tests/ventanaContexto.test.ts` **REGISTRADA** en
  `scripts/validar.mjs` (sin suites huérfanas: 127 en disco = 127 registradas).
- Versión unificada en **4 sitios**: `package.json` + `src/constants.ts`
  (`VERSION_SEMVER`) + `index.html` + `CHANGELOG.md` = **1.55.0**.
- **SIN VERIFICAR** en dev: la ventana REAL contra el proveedor (no hay claves/red
  aquí); la ejerce Mario al arrancar la IDE con sus credenciales.

## 6. ETAPAS

- [x] **Etapa 1 — Diagnóstico** desde el chat exportado (1261 con glm-4.5-flash).
- [x] **Etapa 2 — Tabla de ventanas + derivación** en `modelTiers.ts`.
- [x] **Etapa 3 — Justificaciones** escritas en código (topes/fracciones/suelos).
- [x] **Etapa 4 — Pruebas** nuevas registradas + harness 18/18 verde.
- [x] **Etapa 5 — Versión + CHANGELOG + este documento** dentro del ZIP.
- [ ] **Etapa 6 (futuro / EVOLUCIÓN)** — medición de tokens REAL por tokenizador
  del proveedor (ahora se estima con `CARS_POR_TOKEN`); compactación semántica del
  historial (resumir turnos viejos) en vez de recorte por ventana; y telemetría
  del uso real de ventana para auto-ajustar fracciones por familia.

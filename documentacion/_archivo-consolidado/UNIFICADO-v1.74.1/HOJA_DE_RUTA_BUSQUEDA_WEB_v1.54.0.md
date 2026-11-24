# HOJA DE RUTA — CerebróNico IDE · PASO 6 · «BÚSQUEDA WEB POR DEFECTO EN NUBE» (v1.53.9 → v1.54.0)

> Documento de la TAREA. Escrito contra el código **v1.53.9** el 2026-10-08.
> **Regla de la casa:** creer SOLO lo verificado contra código o por ejecución. Lo demás va marcado «SIN VERIFICAR».
> **Trinquete:** `server.ts` (11.842 líneas) NO crece ni cambia su contrato. Todo lo nuevo entra como módulo PURO en `src/engine/*`.
> **Entrega:** SIEMPRE el proyecto COMPLETO como ZIP (carpeta top `cereb_check`). NUNCA parches ni archivos sueltos.

---

## 1. El encargo (lo que pidió Mario)

> Por DEFECTO en el motor, cuando se use un modelo CLOUD, activar la BÚSQUEDA WEB para que el modelo consulte internet y confirme si lo que va a **validar / escribir / ejecutar ESE turno** es correcto; luego **ejecutar sólo sobre lo seguro**; y **CITAR fuentes** cuando haga falta.

Traducido a invariantes verificables:

1. **Nube ⇒ búsqueda ON por defecto.** Si el modelo del turno es de NUBE y el usuario no la ha apagado, la búsqueda web entra activada sin que nadie la pida.
2. **Local ⇒ OFF.** Un modelo local (Ollama) NO dispara búsqueda (no hay cliente ni cuota; sería ruido). Queda sólo la directiva de prudencia si el usuario la fuerza.
3. **El usuario manda.** Un apagado global (config) o una anulación explícita del turno (`anuladoPorUsuario`) GANA al valor por defecto, en ambos sentidos.
4. **Verificar ANTES de actuar.** La directiva de sistema ordena: consulta la web, **confirma**, ejecuta/escribe SOLO lo confirmado, y lo no confirmado se declara «SIN VERIFICAR» (no se ejecuta a ciegas).
5. **Citar cuando dependa de datos externos/volátiles.** Política de citas pura (URL + por qué), con tope configurable.

---

## 2. Honestidad primero: qué SÍ y qué NO se puede verificar aquí

- **NO existe hoy en el proyecto una herramienta de búsqueda web real** (ni serper, ni tavily, ni grounding cableado). El único rastro es una mención en `tests/huesoObra.test.ts`. Por tanto, **la red real NO se toca en este paso** y la ejecución contra internet queda **SIN VERIFICAR en dev** (entorno sin red/node_modules).
- Lo que SÍ es **puro y comprobable HOY**: la **POLÍTICA** (decidir cuándo la búsqueda está activa), la **DIRECTIVA de sistema** que se inyecta en el prompt, el **ensamblado del payload de grounding** por proveedor (fragmento de `tools` para Gemini; sufijo `:online` para OpenRouter; sólo-directiva para el resto) y la **política de citas**. Todo eso se verifica portando la lógica a `.mjs` y ejecutándola en Node v16.
- El soporte NATIVO de cada proveedor se declara sin maquillaje: `gemini` → `{ googleSearch: {} }` nativo; `openrouter` → sufijo `:online`; `openai`/compat de chat/completions → **sólo-directiva** (su `web_search` vive en la Responses API, que este motor no usa) → **SIN VERIFICAR**.

---

## 3. Diseño (RAÍZ, no parche)

Módulo PURO NUEVO: **`src/engine/busquedaWebNube.ts`**. Se apoya en la FUENTE ÚNICA de clasificación de modelos (`modelTiers.ts`: `getModelProfile`, `esFamiliaNubeConHerramientas`) — NO reimplementa la detección de nube. Patrón «dos capas + config `.cerebro-db`» heredado de `cloudVerifier.ts`.

Funciones PURAS exportadas:

| Función | Qué hace |
|---|---|
| `CONFIG_BUSQUEDA_DEFECTO` | Config por defecto: `porDefectoEnNube:true`, `desactivadaGlobal:false`, `modelosExcluidos:[]`, `maxCitas:5`. |
| `resolverSoporteGrounding(proveedor)` | Mapea proveedor → `gemini-nativo` / `openrouter-online` / `solo-directiva` / `ninguno`. |
| `decidirBusquedaWeb(entrada)` | **El corazón.** Cruza (es nube) × (por defecto ON) × (no excluido) × (anulación del usuario). Devuelve `{activa, esNube, soporte, motivo}`. |
| `payloadGeminiGrounding()` | Devuelve el fragmento `{ googleSearch: {} }` para añadir al array `tools` de Gemini. |
| `aplicarGroundingATools(tools, decision)` | Devuelve un array NUEVO con el fragmento de grounding añadido (sólo si `gemini-nativo`). No muta la entrada. |
| `modeloConSufijoOnline(modelo)` | Añade `:online` a un id de OpenRouter si falta (habilita su búsqueda web). |
| `directivaBusquedaWeb(decision, opts)` | Genera el texto de la directiva de sistema (verifica→ejecuta sobre lo seguro→cita). |
| `requiereCitas(decision, afirmacionExterna)` | Política: ¿hay que citar en esta afirmación? |
| `formatearCitas(fuentes, maxCitas)` | Formatea una lista de fuentes citadas (URL + motivo), recortada al tope. |
| `parteBusqueda(decision)` | Línea de parte legible para el log de la IDE. |
| `cargarConfigBusqueda(raiz)` | Lee `.cerebro-db/busquedaWeb.json` (fs; capa fina, **SIN VERIFICAR** pesado). |

**Cable MÍNIMO, DOCUMENTADO y NO insertado** (módulo HUÉRFANO a propósito):
- Rama Gemini (`server.ts` ~línea 10256): `toolsGemini = aplicarGroundingATools(toolsGemini ?? [], decision)` y `consolidatedSystemInstruction += directivaBusquedaWeb(decision, {...})`.
- Rama OpenAI/compat: anteponer la directiva al mensaje de sistema; para OpenRouter, pasar `modeloConSufijoOnline(model)`.
- La decisión se calcula una vez por turno: `decidirBusquedaWeb({ modelo, proveedor, config: cargarConfigBusqueda(RAIZ), anuladoPorUsuario })`.

El porqué exacto vive en la cabecera del módulo y en el CHANGELOG. **`server.ts` queda intacto.**

---

## 4. Plan de verificación (entorno dev: Node v16, sin red/node_modules)

1. Harness `temp/harness_busquedaweb.mjs`: EXTRAE byte a byte las funciones puras de `busquedaWebNube.ts`, stripea tipos de una lista CERRADA, y ejercita decisión/directiva/payload/citas. Objetivo: **verde**.
2. Suite tsx paralela `tests/busquedaWebNube.test.ts`, REGISTRADA en `scripts/validar.mjs` (paridad disco↔validar.mjs que exige `resiliencia.test.ts`: 125/125, cero huérfanos).
3. **SIN VERIFICAR:** la búsqueda web REAL contra internet (sin red en dev) y `tsc --noEmit` completo (sin node_modules). Lo corre Mario en Windows.

---

## 5. Entregables (v1.54.0)

- `src/engine/busquedaWebNube.ts` (módulo PURO nuevo).
- `tests/busquedaWebNube.test.ts` + registro en `scripts/validar.mjs`.
- `temp/harness_busquedaweb.mjs` (prueba por ejecución en Node v16).
- Bump de versión **1.53.9 → 1.54.0** sincronizado en todas las caras desde `VERSION_SEMVER`.
- `CHANGELOG.md` (entrada nueva) + esta hoja de ruta + apunte PASO 6 en `HOJA_DE_RUTA_v1.54.md`.
- ZIP COMPLETO `cerebronico-ide-v1.54.0-AMPLIADO.zip` (top `cereb_check`).

---

## 6. Lo que esta hoja de ruta NO promete (honestidad)

- NO afirma que la búsqueda web real funcione: en dev no hay red → **SIN VERIFICAR**; se verifica la POLÍTICA/DIRECTIVA/PAYLOAD, no la llamada a internet.
- NO cablea `server.ts`: el cable queda DOCUMENTADO; el módulo es HUÉRFANO a propósito.
- NO promete `tsc`/`validar.mjs` completos verdes sin node_modules.
- NO añade dependencias de pago ni de nube pesada: el grounding usa lo que el proveedor YA ofrece (Gemini nativo / OpenRouter `:online`).

---

*Siguiente decisión de Mario:* cablear al vivo en `server.ts` (PASO 6 → v1.54.x) tras validar en su máquina, y decidir si el `openai`/compat de chat merece migrar a Responses API para tener `web_search` nativo.

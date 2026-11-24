# CHANGELOG v1.64.0 — EL BUCLE, VISIBLE PARA EL MODELO (FASE 3)

> **Nota de hoja de ruta.** Esta es la **Fase 3 ORIGINAL** de la hoja de ruta,
> la que quedó pendiente cuando el usuario redefinió la v1.63 (override
> explícito) para atacar primero dos defectos concretos del chat exportado
> (relectura estéril + volcado de diagnóstico crudo). Aquellas guardas ya están
> entregadas; ahora se cierra el objetivo original: **que el modelo SEPA que
> está en bucle, no solo que se le corte el turno de golpe.**

Cada parada del proyecto = **DEFECTO SEMBRADO + CONTROL DE FALSO POSITIVO**.

## El síntoma, con la lección de v1.63

Las guardas duras existentes (`lazo suave`, `reescritura idéntica`, la **guarda
de relectura** de v1.63) **detectaban y CORTABAN** el bucle — pero el modelo
nunca se enteraba de POR QUÉ. Se le cortaba el turno de golpe. Un modelo que no
VE su propio patrón no puede corregirlo: vuelve a caer en la siguiente oportunidad.
El caso real de v1.63 — `memory_estado → memory_listar_pages → read_file →
read_file` repetido **ocho veces** — es exactamente el patrón ROTADO que esta
fase hace visible.

---

## item 1 · 🐞 DEFECTO SEMBRADO + FALSO POSITIVO — el contexto de bucle, inyectado en la conversación

- **Módulo PURO nuevo:** `src/engine/contextoBucle.ts` (sin red, sin disco, sin
  estado global — el llamador pasa y guarda el estado; testeable en aislado).
- **Qué detecta:** no solo una herramienta repetida (periodo 1, `AAAA`), sino un
  **CICLO ROTADO** de hasta **6 pasos** que reaparece — p. ej.
  `memory_estado → memory_listar_pages → read_file → read_file` ×N —, que es
  justo lo que el lazo suave NO cazaba porque las llamadas idénticas nunca caían
  pegadas. `detectarCiclo` busca, para cada periodo `L`, cuántas veces el bloque
  final de `L` tokens se repite hacia atrás sin romperse, y se queda con el que
  cubre MÁS pasos (a igualdad, el periodo más corto): así `AAAA` se lee como
  periodo 1 ×4 y `ABCD ABCD ABCD` como periodo 4 ×3.
- **Qué hace, y por qué es la Fase 3:** a la **2ª vuelta** (`REPES_AVISO = 2`)
  **INYECTA en la conversación** un mensaje VISIBLE que le dice al modelo
  EXACTAMENTE qué secuencia está repitiendo (`«A» → «B» → «C» → «D»`), que eso
  no avanza la tarea y le ofrece **tres salidas concretas** (resumir y responder
  ya; pedir el dato con OTRA herramienta o argumentos DISTINTOS; o decir con
  honestidad que no sabe seguir). El modelo tiene así la oportunidad de romper
  el bucle **por sí mismo ANTES** de que las guardas duras cierren el turno.
- **Respaldo duro:** si pese al aviso el ciclo persiste hasta la **4ª vuelta**
  (`REPES_CORTE = 4`), `debeCortar` se activa y el turno se cierra honesto
  (reutilizando `cierrePorLazoAgotado`), con el patrón nombrado y la obra ya
  hecha a la vista.
- **No spamea:** el aviso solo se emite cuando el ciclo **CRECE** respecto al
  último aviso (`avisadoEn`), no en cada paso.

- **CONTROL DE FALSO POSITIVO (progreso real NO es bucle):** una **OBRA exitosa**
  (escritura/edición con `esHerramientaDeObra && !isError`) **REINICIA la
  secuencia**: el turno avanzó, no está en bucle aunque haya repetido lecturas
  mientras tanto. Así, `editar A → probar → editar A → probar` **mientras el
  archivo cambia de verdad** cada vez nunca se marca como bucle. El detector solo
  acumula pasos **estériles**.

- **Privacidad del token:** el token de cada paso es `nombre\u0000hash-de-args`,
  así se distingue `read_file(a)` de `read_file(b)`; pero el mensaje que ve el
  modelo **solo muestra el nombre** (el separador `\u0000` y los argumentos
  nunca se filtran — verificado en test).

- **Ventana acotada:** `MAX_SECUENCIA = 48` pasos (ventana deslizante), para no
  crecer sin límite en turnos largos.

## Cableado en las DOS ramas del motor (`server.ts`)

- **Rama Ollama** (`cuerpoBucleAgente`): se llama a `registrarPaso` justo tras
  `historialBucle.push` (dentro del `for (const tc of toolCalls)`), y el aviso se
  empuja como `{ role: "user" }` **TRAS** el `for`, nunca dentro (inyectar un
  user-msg a mitad de la tanda rompe el transcript `assistant.tool_calls → tool`).
  El corte duro viaja por `lazoBucleO` hacia `avisoLazo`.
- **Rama Gemini**: `registrarPaso` dentro del `for (const l of llamadasTurno)`;
  el aviso se añade como `{ text: … }` a `partesRespuesta` **tras** el `for`; el
  corte duro por `lazoBucleG` completa una `functionResponse` por cada
  `functionCall` ya enviado (Gemini lo exige) y cierra honesto.

## Pruebas — `tests/contextoBucle.test.ts` (10/10)

- periodo 1 (`AAAA` ×4) y periodo 4 rotado (`A→B→C→D` ×3) detectados.
- aviso a la 2ª vuelta, corte a la 4ª; no repite el mismo aviso si el ciclo no crece.
- **falso positivo:** una obra exitosa reinicia la secuencia; `editar→probar`
  con cambios reales no corta.
- el mensaje muestra el nombre y **nunca** el hash de argumentos ni el separador.
- la ventana respeta `MAX_SECUENCIA`; `REPES_AVISO < REPES_CORTE`.
- Registrada en `scripts/validar.mjs` (SUITES).

## Verificación

- `esbuild` (bundle del server) OK · `tsc --noEmit` OK.
- superficie regenerada y `--verificar` → **CONTRATO INTACTO** (12.200 / 13.700
  líneas, 1.500 de margen).
- suite nueva 10/10 · `repeticionLectura` (v1.63) sigue en verde (no regresión).

## Versión

- `1.63.0 → 1.64.0` en `package.json`, `package-lock.json`, `src/constants.ts`
  (`VERSION_SEMVER`) e `index.html` (title + og).

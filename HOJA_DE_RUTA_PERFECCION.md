# HOJA DE RUTA COMPLETA PARA LA PERFECCIÓN DE LA EVOLUCIÓN — CerebroNico-IDE

> Documento vivo · nacida en v1.78.1 (26/10/2026), a pedido de Mario:
> «hoja de ruta completa para la perfección de evolución».
> La [HOJA_DE_RUTA_CerebroNico-IDE.md](HOJA_DE_RUTA_CerebroNico-IDE.md) es la
> CRÓNICA (qué pasó en cada versión); este documento es el PLANO (qué falta
> para la perfección, en qué orden, y con qué evidencia se certifica cada
> tramo).
>
> Regla de la casa que gobierna todo esto: **la perfección no se proclama, se
> mide.** Cada fase tiene una evidencia de salida — un comando, una suite, un
> hash. Sin evidencia, la fase no existe (lo que no se puede verificar no se
> declara hecho: directriz V8).

---

## 0 · Qué significa «perfección» para CerebroNico (estado objetivo, medible)

Ocho propiedades. No aspiraciones: propiedades que una versión o las cumple
o no. El marcador de estado se actualiza al cierre de cada fase.

| # | Propiedad | Estado v1.78.0 (medido) |
|---|-----------|--------------------------|
| P1 | Ninguna tarea termina en error sin que la IDE haya intentado relevo ella misma | **OK (v1.80.0)** — capacidad `auto_relay` del panel cableada al motor (capacidadesMotor), cascada con tope 2 e INFORME honesto al agotarlo (las dos puertas: onError y turno vacío), telemetría de sesión; suite `relevoPorDiseno` |
| P2 | El motor nunca marca un modelo que no existe (fantasma, embedder, sin clave) | **OK** — suites `marcadorFavoritos`, `aduanaModelos`, `relevoFavoritos` + plaga sembrada |
| P3 | Un modelo = un nombre = un proveedor (nunca dos nombres, nunca deducción por adivinanza) | **OK** — aduana única v1.77.0 + carpeta 🧩 Unificada v1.78.0 (el selector dice el motor al elegir) |
| P4 | El preview se levanta solo, se reinicia solo, y el usuario nunca ve un tablero de botones | **OK** (patrón) — piloto v1.78.0 + watchdog v3.2 + suite `sandboxContrato` (48 comprobaciones); el patrón todavía solo lo aplica el sandbox |
| P5 | Cada entrega se verifica a sí misma con UN solo comando | **PARCIAL** — manifiesto SHA256 + 4 partes + `validar` + `tsc` existen; pero el ritual es manual (6 pasos a mano) |
| P6 | La IDE recuerda: memoria de largo plazo con recuperación por sentido, no solo por palabra | **PARCIAL** — el órgano `.con-ciencia` (v1.48, `cerebroOrgano.ts`) funciona por tabla de ruteo por palabra; los embeddings (embeddinggemma, bge-, nomic-embed) existen y están etiquetados pero **aún no vectorizan nada** — X22 (V8 §7.3) sigue ⏳ pendiente de confirmación. Lo medible se parte en dos: **recuperación por sentido = FASE 2** (abierta) y **presión/desglose de contexto = FASE 9** (planificada, no implementada). P6 no pasa a OK hasta que la vectorización efectiva tenga archivo y suite |
| P7 | Todo lo que falta está documentado con versión y fase que lo paga (lista «por ahora» bajo auditoría) | **OK** — cada CHANGELOG registra sus «a propósito»; esta tabla §6 es el consolidado |
| P8 | Seguridad P0 inmutable: sin puentes RCE, sin `.env` en el paquete, con `server.ts` bajo presupuesto de líneas | **OK** — directrices V8 §8.1; `server.ts` 12.059 líneas ≤ 12.187 (declarado en CHANGELOG v1.76.0) |

**Perfección = P1…P8 en OK, sostenida en el tiempo.** Una versión es
«perfecta» cuando: `npm run validar` + `tsc --noEmit` en verde, manifiesto
`TODO COINCIDE`, cero «por ahora» NUEVOS, y al menos una queja real medida
cerrada. (Las quejas se miden como se midieron las de v1.78.0: texto de
Mario + captura + defecto localizado en línea, no «a mi parecer».)

---

## FASE 0 · EL MANUAL DE LA PERFECCIÓN (perfeccion.md) — v1.79.0 (HECHO)

El pedido de Mario 26/10 llegó antes que el resto del plano y se pagó como
FASE 0, porque el manual es el lugar donde TODAS las demás fases van a dejar
su evidencia:

1. **La ruta se fija al crear el plan** (`fijarRuta` en
   `manualPerfeccion.ts`, cableado en `POST /api/brain/plan`): objetivo +
   sus rutas relativas (las tareas). Idempotente por id.
2. **El bucle recorre sus rutas relativas en sincronía** (hook
   `onTareaTerminada` del `PlanRunner` — el mismo punto donde el plan termina
   cada tarea: plan y manual no pueden desincronizarse). Regla de la casa:
   `validada` SOLO con evidencia de ejecución (escribir no es probar);
   «hecha» sin evidencia se anota `cerrada_sin_evidencia`; fallida con causa.
3. **La auto-mejora escribe en `perfeccion.md`** cuando actúa: turno ok +
   lección reforzada → `POST /api/perfeccion` (`tipo: leccion`); la puerta
   `tipo: proceso` queda abierta para autovalido/ouroboros (veredicto verde
   con comando exacto + número).
4. **Cara a disco** en la raíz: `perfeccion.json` (máquina, cargador
   tolerante) + `perfeccion.md` (humana, re-render determinista, escritura
   atómica). El manual se siembra en la entrega y el motor lo completa solo.
5. **Suite** `manualPerfeccion.test.ts` (23 comprobaciones) con invariante
   global: ninguna ruta `validada` sin evidencia, en ningún manual.

- **Evidencia de salida (medida):** suite en verde · `npm run validar` y
  `tsc --noEmit` sobre el árbol resultante · `server.ts` sin tocar (12.059
  ≤ 12.187; el cable vive en el router `brain.ts` — trinquete v2).
- **Deuda que cierra:** la fila «bucles desincronizados con el plan; sin
  manual de rutas validadas» (§6) — pasa a cancelada.
- **Lo que deja a las demás fases:** el manual ES su carpeta de evidencia.
  Cada fase que cierre debe dejar sus rutas y procesos validados acá: el
  plano y el manual avanzan juntos, o no avanzan.

## FASE 1 · EL RELEVO POR DISEÑO — v1.80.0 (**HECHA** 27/10)

**Objetivo:** P1 completo. El relevo deja de ser un parche tras el error y
pasa a ser el diseño del flujo.

1. **El panel de capacidades enciende el relevo de verdad.** Hoy
   `PREF_RELEVO_KEY` (`cn_auto_relay`) solo se lee en `App.tsx` como un
   interruptor de localStorage. Se cablea al motor: la preferencia se pasa al
   `onError` del stream y al disparador de turnos vacíos, y la UI muestra el
   efecto (qué modelo relevó, cuándo, cuántas veces por sesión).
2. **Relevo en cascada con tope.** Si el favorito que relevó también falla,
   se prueba el siguiente de la cola (`siguienteMarcada` ya lo soporta) con
   un tope de 2 reintentos por mensaje — más allá de eso, informe honesto:
   «se intentó X, Y, Z; todos fallaron con [motivo]», nunca silencio.
3. **Certificación del relevo.** Suite `relevoPorDiseno.test.ts` con motor
   simulado: el modelo primario siempre falla → el relevo termina en éxito;
   todos fallan → se produce el informe y no se buclea.
4. **Telemetría mínima** (consola, no red): por sesión, cuántos releves, a
   qué proveedores, éxito/fallo. Es lo que después certifica que el sistema
   se cura solo.

**Evidencia de salida:** suite nueva en `validar.mjs` · `npm run validar`
verde · P1 pasa a OK en la tabla §0.
**Dependencias:** ninguna (usa `marcador.ts`, `relevoFavoritos.ts`,
`aduanaModelos.ts` ya curados).
**Presupuesto `server.ts`:** 0 líneas nuevas esperadas (todo en frontend y
utils; si crece, el CHANGELOG lo declara contra 12.187).

---

## FASE 2 · EL ÓRGANO VECTORIZADO — (**HECHA** 27/10 en v1.84.0) (X22) — v1.81.0

**Objetivo:** P6. Aquí es donde los modelos embedding que hoy solo se
etiquetan (`📎 embeddings`) por fin hacen lo que saben: convertir
conocimiento en vectores para recuperar por **sentido**.

1. **Vectorizar el órgano `.con-ciencia`.** En `cerebroOrgano.ts`, cada
   entrada de `cerebro/indice.json` (tema/título/palabras/resumen) pasa a
   cargar además un `vector` (embedding local vía Ollama:
   `embeddinggemma-2-240m`, `bge-small` o el que el hardware soporte; la
   aduana ya sabe cuáles son embedders). El ruteo por palabra clave NO se
   borra: sigue como fallback cuando el embedding no responde.
2. **Recuperación híbrida.** Ante una consulta: similitud coseno sobre
   `vector` + coincidencia de palabras, ponderado (0.7/0.3 inicial,
   ajustable en `advancedFeatures.ts`). Se abre el mismo trozo que hoy, pero
   la IDE lo elige entendiendo la consulta, no adivinándola.
3. **Disciplina de timeouts (lección 24/10, medida).** La llamada de
   embedding tiene timeout propio de 5 s y **nunca bloquea el turno**: si no
   llega, el motor rutea por palabra y registra «vector: sin respuesta,
   fallback palabra». Esto aplica la regla aprendida — ante discrepancias,
   primero timeouts y `num_ctx`, nunca «el modelo está roto».
4. **Sesiones como memoria vectorial.** Los JSON exportados
   (`cerebronico-ide-sesion-*.json`) se indexan al órgano: «buscá cómo
   resolvimos X la última vez» funciona por parecido, no por grep.

**Evidencia de salida:** suite `concienciaVector.test.ts` (un tema
recuperable con una PARRAFRASEO que no comparte palabras con el índice —
eso solo lo logra el vector) · suite de resiliencia (embedding caído → el
motor responde igual, sin latencia extra mayor a 5 s) · X22 en V8 §7.3 pasa
de ⏳ a HECHO.
**Dependencias:** FASE 1 (el relevo garantiza que un embedder caído no
deja el turno muerto).
**Presupuesto `server.ts`:** el endpoint de embedding vive en el motor —
declarar líneas nuevas contra 12.187 en el CHANGELOG.

---

## FASE 3 · EL GOBERNADOR EN TODAS PARTES — v1.82.0 (**HECHA** 27/10)

**Objetivo:** que la máquina mande, no el número fijo. (El «a propósito» de
v1.76.0: `parallel_workers` medía 4 en una máquina de 4 núcleos cuando el
valor esperaba 8.)

1. **Workers adaptativos reales.** `hardwareGovernor.ts` ya advierte («con
   N núcleos el reparto se queda sin núcleos»). Falta que la recomendación
   SE APLIQUE: `parallel_workers = clamp(2, cores-1, 8)` medido en runtime,
   no constante. Máquina nueva → sin tocar nada.
2. **`cloud_verifier` con cuota propia.** Hoy corre con su config (v1.76);
   se certifica que consume su propia ventana y no compite con el modelo de
   chat (suite que simula saturación del principal y verifica que el
   verificador sigue respondiendo).
3. **El planificador concurrente (V8 §6.4) visible.** Ya corre en segundo
   plano; su progreso se refleja en el panel «Hoja de Ruta Activa»
   (mismas piezas que hoy muestran el sandbox) para que «segundo plano»
   signifique lo mismo en todo el IDE: se ve, no se intuye.
4. **Presupuesto de RAM en el gobernante.** La máquina pasó de 8 a 16 GB
   (15/10/2026): el gobernante ya lee RAM (barra de estado). Se suma la
   regla: si el sandbox + motor + navegador superan el 70 % sostenido, se
   degrada a 1 worker y se avisa (no se muere).

**Evidencia de salida:** suite `gobernante.test.ts` (cores simulados 2/4/8/16
→ workers 2/3/7/8, sin tocar config) · la degradación por RAM probada con
métrica simulada · los dos «a propósito» de v1.76.0 cerrados y tachados en
la tabla §6.
**Dependencias:** ninguna dura; se apoya en `advancedFeatures.ts` existente.

---

## FASE 4 · SEGUNDO PLANO EN TODA LA SUPERFICIE — v1.83.0 (**HECHA** 27/10, junto a FASE 5 en v1.83.0)

**Objetivo:** generalizar el patrón que la v1.78.0 aplicó al sandbox
(«muchos botones ocupan mucho lugar y es antiestético» — queja medida
26/10).

1. **Regla de superficie (se escribe en V8 §7.2):** cada panel con más de 3
   acciones ⇒ 1 acción primaria visible + el resto plegado en «⚙ Avanzado»,
   plegado por defecto. La acción primaria SIEMPRE es la que «hace todo».
2. **Paneles a reformatear:** Explorador (Adjuntar/Borrar todo/Plantilla/.cn/Abrir), Chat (botoneras del input), Ajustes PC, Chats (cola). Misma tipografía de contrato que el sandbox: lo que se pliega no se borra.
3. **Modo limpio (toggle).** Un interruptor global (estado en
   `constants`-driven, no inventado) que ocuelve los paneles secundarios
   completo: chat + preview. Para las horas de solo-preguntar.
4. **Contrato anti-regresión de la superficie.** Suite que cuenta los
   botones visibles por panel en estado default y los compara contra un
   fixture: si un panel vuelve a gritar, el test rojo antes que Mario.

**Evidencia de salida:** fixture de superficie congelado + suite `superficie.test.ts` · captura de cada panel antes/después en el CHANGELOG (la evidencia dura que la casa pide).
**Dependencias:** ninguna (patrón probado en v1.78.0).

---

## FASE 5 · ENTREGA AUTOVERIFICADA — v1.84.0 (**HECHA** 27/10, fusionada en v1.83.0)

**Objetivo:** P5. El ritual de entrega (que hoy se hace a mano en 6 pasos)
se convierte en UN comando con la misma puerta que el código.

1. **`npm run entregar`** — un solo comando que ejecuta, en orden, con la
   misma disciplina que `validar.mjs`:
   `tsc --noEmit` → `npm run validar` → `npm run manifiesto` →
   `manifiesto:verificar` → `zip` (sin `node_modules`) → `split -n 4` →
   SHA256 del zip y de las 4 partes → **verificación de reensamblaje**
   (`cat part? > zip` debe dar el mismo hash que el zip completo; si no da,
   la entrega NO SALE).
2. **Receptor verificador.** En el destino, `npm run
   entregar:verificar <zip>` o `<parte0>`: si vino en 4 partes, reensambla y
   chequea el hash contra el manifiesto; si no coincide, se niega (el
   instalador nunca abre un paquete roto).
3. **Manifiesto dentro del paquete.** El zip lleva su propio
   `MANIFIESTO_SHA256_vX.Y.Z.txt` (ya lo hace) y el receptor puede auditar
   cada archivo sin desconfiar de nada.
4. **El CHANGELOG de cada entrega declara:** validaciones del turno,
   presupuesto `server.ts` consumido, y qué «por ahora» se cerró (tabla §6).

**Evidencia de salida:** el comando existe y sale verde en la máquina de
desarrollo · prueba que simula una parte corrupta (1 byte modificado) → el
receptor se niega y dice cuál · la entrega de esa MISMA versión se hace con
el comando (perros comen perros: v1.83.0 se empaqueta a sí misma).
**Dependencias:** ninguna dura.

---

## FASE 6 · EL NÚCLEO AGÉNTICO FUSIONADO (V8 L2) — v1.85.0 (**HECHA** 27/10)

**Objetivo:** cerrar ETAPA 12 («en curso»): la fusión de las **51** entidades
agénticas (12 + 28 + 11) con sus contratos «CONSERVA + delta» (V8 §6.1), sin
duplicar superficie. *Corrección al cerrar la fase: el plano decía «50 (12 + 38)» y
arrastraba la cifra pre-V8 — `espejo.generalista` nació en V8 y ya se contaban 51
en `tests/agentico.test.ts:34`.*)

1. **Inventario auditado de las 50.** Cada entidad con: nombre único (la
   fuente es una sola), contrato, y al menos 1 test. Lo que no tiene contrato
   no se fusiona (directriz V8: no prometer skills sin código — el catálogo
   de 75 es el ideal, no la deuda).
2. **El ciclo de decisión (V8 §6.2) con trazas.** De una frase a la acción,
   con la traza visible en «Hoja de Ruta Activa» (las piezas del panel ya
   existen desde v1.75: ok/fallos/ver/ocultar).
3. **Multiagente con relevo compartido.** Agentes especialistas (código,
   revisión, pruebas) como sesiones reales que comparten la cola de
   favoritos curada de v1.78.0: si el especialista falla, el relevo es el
   mismo, con las mismas reglas honestas. No es un panel que simula: son
   procesos con memoria común (el órgano de FASE 2 es su pizarra).
4. **Forja (capa caliente) con aduana.** Las extensiones dinámicas pasan por
   `aduanaModelos` antes de tocar el flujo: un espejo forjado no puede
   inventarse un proveedor ni un nombre duplicado.

**Evidencia de salida:** auditoría de las 50 (documento con ruta+línea por
entidad, como las auditorías de linaje) · suite por entidad · un flujo
multiagente real grabado (sesión exportada JSON, que la casa ya sabe
manejar).
**Dependencias:** FASE 2 (memoria compartida) y FASE 1 (relevo compartido).

---

## FASE 7 · EL SANDBOX CON SU PROPIO CEREBRO (el sueño, en tramos) — v1.86.0 (**HECHA** 27/10, con una deuda declarada en §6)

**Objetivo:** el último tramo del sueño medido: que el preview no sea un
espejo pasivo.

1. **`/api/conciencia` para la app generada.** El sandbox expone un endpoint
   mínimo para que la app que el usuario genere recuerde su propio contexto
   (su última acción, su estado) usando el MISMO órgano, con su propia
   carpeta `cerebro/` dentro del sandbox (nunca toca archivos del usuario:
   regla del órgano).
2. **Espejo de espejo auditable.** La información que el preview recibe del
   IDE se lista en un manifiesto (qué campos, a qué frecuencia, con qué
   presupuesto de tokens): el espejo es una fuente declarada, no un túnel.
3. **La IDE que se explica sola.** Un modo «¿por qué decidiste esto?» que
   responde citando traza (FASE 6) + trozos del órgano (FASE 2) con ruta y
   línea, como esta documentación.

**Evidencia de salida:** una app generada mínima que recuerda (demo
reproducible con comando) · manifiesto del espejo auditado · la respuesta
«¿por qué?» siempre cita artefacto real (test: ninguna cita sin ruta).
**Dependencias:** FASES 2, 5, 6.

---

## FASE 8 · EL PERFIL DE PARCHES POR `id` (vía de entrada al motor sin tocar la semilla) — v1.52.0

**Objetivo:** que activar, desactivar o reconfigurar un pack del motor deje de
exigir editar `SEMILLA_COMPLETA` y el ensamblado. Hoy añadir un pack es cirugía
sobre el código del motor; a partir de esta fase es **un archivo de datos del
usuario**.

**Origen (medido, no supuesto):** la arquitectura de capas de DeepSeek Harness
0.2.1-rc.3, leída de su perfil real en `C:\Users\BirdBox\.dsh\profiles\desktop`:
`cordis.yml` es una lista raíz **vacía a propósito** (`[]`), y el árbol se
compone aplicando, en orden, los bundles declarados en `package.json` →
`cordis.patch.yml` → overlays `--patch`. Cada entrada de parche se dirige por
`id` y puede **sobrescribir config, deshabilitar o insertar**. El usuario nunca
edita la base. Verificado el 06/11/2026 leyendo los tres archivos en disco.

**Alcance (5 puntos):**

1. **Formato del perfil.** `<raíz de datos>/.cerebronico/perfil.patch.yaml`:
   una lista de entradas `{ id, op: sobrescribir|deshabilitar|insertar, datos }`.
   `id` es el mismo identificador estable que ya usan las entradas de la semilla
   (`ba-*`, `bucle-*`, `coher-*`, `motor-*`). Sin `id` no se aplica: nada de
   coincidencias por nombre de título.
2. **Aplicador único y puro.** `src/engine/perfilParches.ts`: función
   `aplicarParches(semilla: EntradaSaber[], parches: Parche[]): ResultadoParches`
   sin efectos secundarios ni IO — recibe la semilla ya cargada y devuelve la
   semilla resultante + un **acta** con qué se sobrescribió, qué se deshabilitó,
   qué se insertó y **qué parche quedó huérfano** (id que no existe en la
   semilla). Un parche huérfano NO se ignora en silencio: se lista.
3. **Punto de cableado único.** El aplicador se llama en el sitio donde hoy se
   construye `SEMILLA_COMPLETA` (`knowledgeBase.ts`), **después** del cableado
   de packs y **antes** de la validación `length>=116` e ids únicos. Los
   invariantes del motor (`motor-estructura`) se siguen exigiendo sobre el
   resultado YA parcheado: un parche que rompa la estructura es rechazado y el
   motor vuelve a la semilla limpia declarándolo en el acta.
4. **Interruptor honesto.** Sin archivo de perfil, el comportamiento es
   exactamente el actual (`parches: []`): cero regresión. Con archivo inválido
   (YAML roto, `id` duplicado, `op` desconocida) el motor **arranca con la
   semilla limpia** y deja la causa en el acta y en el log — nunca un arranque a
   medias.
5. **Visible, no mágico.** El acta del perfil se refleja en
   `[ESTADO VIVO DEL TURNO]` (una línea: «perfil: N parches, M huérfanos»), igual
   que ya se hace con el veredicto fiscal. El usuario ve qué está activo sin
   abrir un archivo.

**Evidencia de salida (medida, obligatoria para cerrar):**
- Suite `perfilParches.test.ts` con, como mínimo: parche que sobrescribe un
  `id` existente → la semilla resultante tiene el valor nuevo y el mismo
  número de entradas; parche que deshabilita → entrada ausente y las demás
  conservadas intactas; parche que inserta → id nuevo presente; **parche con id
  inexistente → acta lo declara huérfano y la semilla no cambia**; YAML roto →
  semilla limpia + causa reportada; parche que rompe `length>=116` → rechazado
  y revertido, declarado.
- La suite entra en `npm run validar` y éste sale verde.
- `server.ts` **sin tocar** (el cableado vive en `knowledgeBase.ts` y
  `conciencia.ts`; si crece, se declara contra el techo vigente leído de
  `techo_absoluto_lineas`).
- Manifiesto `TODO COINCIDE` tras el cierre.

**Dependencias:** ninguna. Se apoya en `SEMILLA_COMPLETA`, `knowledgeBase.ts`,
`conciencia.ts` y las suites `motor-estructura` ya existentes.
**Reversibilidad:** total — es un archivo de datos que se deja de leer; borrarlo
devuelve el motor al estado actual.
**Lo que NO hace:** no habilita código nuevo desde un archivo (sería una puerta
RCE encubierta). Un parche solo configura o deshabilita entradas de saber que YA
existen en la semilla, o inserta una entrada con la misma forma. Nunca ejecuta.

---

## FASE 9 · LA TELEMETRÍA DE CONTEXTO (lo que se mide, se puede mejorar) — v1.53.0

**Objetivo:** cerrar la parte medible de **P6** y preparar el terreno de **P5**,
convirtiendo el gasto de contexto de intuición en números que se pueden leer y
comparar entre turnos.

**Origen (medido, no supuesto):** el registro de sesión de DeepSeek Harness
(`session-15cee9da-….json`, leído el 06/11/2026) guarda DOS campos que CerebroNico
no tiene: `contextBreakdown` — `{systemTokens: 2178, toolsTokens: 11534,
messageTokens: 35513}` sobre `surfaceTokens: 37691` — y `contextPressure`
(`{surfaceTokens, contextWindow: 128000, pressureTokens, sampledSurfaceTokens}`).
Y `sessionStats` separa `ttftMs` (175.327 ms en 31 pasos) de `decodeMs`
(82.755 ms). Nuestra propia lección registrada dice «el primer token tardó el
doble» sin medirlo: eso es opinión hasta que tiene un número.

**Alcance (4 puntos):**

1. **Desglose de contexto por categoría, medido.** `src/engine/contextoMedido.ts`:
   dado el prompt ensamblado del turno, devuelve
   `{ sistema, herramientas, mensajes, total }` en tokens estimados con el
   **mismo estimador** que ya usa el motor (no se introduce un tokenizer nuevo:
   dos medidores distintos son dos fuentes de verdad y eso es lo que la casa
   prohíbe). El desglose separa lo que rara vez cambia (ley del núcleo,
   catálogo de herramientas) de lo que cambia cada turno (historial).
2. **Presión declarada, no adivinada.** Regla publicada:
   `presion = total / ventana` con umbrales declarados en `constants.ts`
   (aviso al 45 %, compactación sugerida al 65 %, compactación forzada al 80 %).
   Al llegar a cada umbral, `conciencia.ts` lo dice en el estado vivo con el
   número exacto: «contexto 58.967/128.000 (46 %) — herramienta: sugerir
   compactar». Antes de este turno ese dato no existía.
3. **Latencia desdoblada.** Registrar por turno dos tiempos separados: tiempo al
   primer token y tiempo de decodificación (más pasos y modelo). Se guarda junto
   al turno y se muestra en una línea. Con esto, «va lento» pasa a «TTFT 4,2 s /
   decode 18 s, 3 pasos, provider X» — que es un diagnóstico, no una queja.
4. **Contrato de honestidad del número.** Si el proveedor no reporta uso de
   tokens, el campo se marca **`estimado`**, nunca se presenta como medido. Un
   dato inventado aquí sería peor que no tenerlo: es exactamente lo que la ley
   de veracidad prohíbe.

**Evidencia de salida (medida, obligatoria para cerrar):**
- Suite `contextoMedido.test.ts`: el desglose suma exactamente el total
  (invariante aritmético, sin tolerancia cuando no hay truncamiento); un prompt
  con 100 mensajes da `mensajes >> sistema`; un prompt vacío da ceros sin
  excepción; los tres umbrales disparan en el token exacto declarado.
- Verificación cruzada con `espejo.matematicos` (aritmética exacta a ~1 ms): los
  porcentajes de presión calculados por el motor coinciden dígito a dígito con
  los del espejo sobre los mismos números.
- Suite entra en `npm run validar`; verde.
- **P6 actualizado en §0**: pasa a declarar EXPLÍCITAMENTE qué parte de P6 queda
  en pie (recuperación por sentido con medidor propio = FASE 2; presión y
  desglose = esta fase) y cuál sigue abierta (vectorización efectiva de
  `cerebro/vectores.json`, cuyo archivo hoy NO existe en la raíz de datos).
- `server.ts` sin tocar: el módulo es puro y el cableado va en `conciencia.ts`.

**Dependencias:** FASE 3 (el gobernante ya lee la máquina; aquí se lee el
contexto). Independiente de FASE 8 — pueden salir en paralelo.
**Reversibilidad:** total — si la medición no aporta, se apaga el bloque de
estado y el motor sigue funcionando sin ella.
**Lo que NO hace:** no compacta ni resume el historial por sí sola. Mide y avisa;
compactar es una acción del bucle, y esa decisión se toma con el número delante,
no por esta fase.

---

## 5 · Anti-hoja (lo que NUNCA se repite — directrices V8 §3.2, inmutable)

- **Sin puentes RCE.** Nada que execute comando remoto «por conveniencia».
- **Sin `.env` en el paquete.** Las claves viven en la máquina, nunca en el
  zip (`.env.example` sí; `.env`, no).
- **Sin verificación irreproducible.** Si no existe un comando que lo
  reproduce, no se declara.
- **Sin skills prometidas sin código.** Lo no implementado se declara «ideal»
  o «por ahora», nunca «hecho».
- **Sin dos nombres para lo mismo.** Fuente única de versión
  (`constants.ts`) y fuente única de catálogo de modelos (aduana).
- **Sin tocar `server.ts` por estético.** Su presupuesto (12.187 líneas,
  contando comentarios) se declara en cada CHANGELOG que lo toca.

## 6 · Auditoría de deudas («por ahora» consolidado, con versión y fase que lo paga)

| Deuda (medida, con fuente) | Nace en | La paga |
|---|---|---|
| Los bucles no andaban en sincronía con el plan de ruta, y no existía manual de rutas validadas (pedido 26/10) | v1.79.0 | FASE 0 — **CANCElada en v1.79.0** |
| El relevo a favoritos se enciende solo por `localStorage`, no desde el panel de capacidades (v1.77.0, «A PROPOSITO») | v1.77.0 | FASE 1 — **CERRADA en v1.80.0** |
| Los embeddings solo se etiquetan; no vectorizan nada — X22 ⏳ pendiente (V8 §7.3) | V8 / v1.77.0 | FASE 2 |
| ~~`parallel_workers` fijo vs núcleos reales: medía 4 en máquina de 4 núcleos (v1.76.0, «a propósito»)~~ | v1.76.0 | FASE 3 — **CERRADA en v1.82.0** (gobernante.ts aplica clamp 2..n-1..8; suite `gobernante`) |
| ~~`cloud_verifier` corre con config propia pero sin cuota certificada (v1.76.0)~~ | v1.76.0 | FASE 3 — **CERRADA en v1.82.0** (timeout/fetch/ventana propios, sin cuarentena ni semáforo compartidos; congelado en `gobernante`) |
| El patrón «primario visible + resto en ⚙ Avanzado» solo existe en el sandbox (v1.78.0) | v1.78.0 | FASE 4 |
| La entrega se verifica a mano en 6 pasos (ritual SHA256 + 4 partes, sin comando) | ritual | FASE 5 |
| ~~Las 50 entidades agénticas de V8 aún no están fusionadas (ETAPA 12 «en curso»)~~ — son **51** (12+28+11, el plano arrastraba la cifra pre-V8) | V8 (20/09) | FASE 6 — **CERRADA en v1.85.0** (mapa 1:1 entidad↔suite, las 12 entidades que estaban sin prueba, ciclo con trazas, relevo compartido, aduana de forja) |
| ~~El sandbox es espejo pasivo; no tiene cerebro propio (sueño)~~ | v1.48 (conciencia) | FASE 7 — **CERRADA en v1.86.0** (`/api/conciencia` con guarda de aislamiento, manifiesto del espejo auditado, `/api/explicar` con «ninguna cita sin ruta») |
| La app generada aún no llama `/api/conciencia` **desde adentro** del preview: el endpoint vive en el servidor del IDE y el `.cn-static-server.cjs` del sandbox no lo proxya | v1.86.0 | FASE 7.1b — se paga al cablear el servidor estático del sandbox |
| Añadir o desactivar un pack de saber exige editar `SEMILLA_COMPLETA` / `knowledgeBase.ts` a mano: no hay capa de usuario, y cada alta toca el ensamblado del motor (fricción estructural, medida al leer el diseño de capas de `dsh` el 06/11/2026) | v1.51.0 | **FASE 8** — un archivo de parches por `id` (sobrescribe/deshabilita entradas existentes), validado contra `length>=116` y revertido con causa si rompe; nunca ejecuta código |
| La gestión de contexto es intuitiva: no hay desglose por categoría (sistema/herramientas/mensajes), ni presión declarada contra la ventana, ni latencia desdoblada (tiempo al primer token ≠ decodificación). P6 sigue PARCIAL y la lección «el primer token tardó el doble» es opinión sin número | v1.51.0 | **FASE 9** — `contextoMedido.ts` con el mismo estimador del motor, umbrales en `constants.ts`, TTFT y decode separados y campo marcado `estimado` cuando el proveedor no reporta uso |

> Regla: **ninguna versión sale sumando una fila a esta tabla sin decir en
> qué fase se paga.** Deuda sin fase es promesa rota.

## 7 · Orden de ejecución y por qué

```
F1 relevo → F2 vectorización → F3 gobernante → F4 superficie
     → F5 entrega → F6 núcleo agéntico → F7 sueño
     → F8 perfil de parches por id  ∥  F9 telemetría de contexto
```

- **F8 y F9 van último y en paralelo** porque no dependen de nada del sueño: F8
  hace la estructura del motor extensible por el usuario (sin tocar la semilla),
  F9 pone números donde hoy hay intuición (presión de contexto y latencia
  desdoblada, que es la deuda medible de P6). Son las dos que nacen del diseño
  leído en `~/.dsh` el 06/11/2026, no de comparar nombres de funciones: una es
  la composición por capas, la otra el instrumento de medida.
- **Regla de entrada para las dos:** no se abren hasta que F5 (entrega en un
  comando) esté cerrada. Sumar una capa de configuración o un medidor a un motor
  que todavía se empaqueta en seis pasos a mano es sumar deuda, no pagarla.

- **F1 primero** porque cada fase siguiente depende de que un error ya no
  mate el turno (el vector, el multiagente y el sandbox con cerebro fallan
  más por tener más piezas; el relevo es el seguro de vida).
- **F2 segunda** porque desbloquea la memoria compartida que F6 y F7
  necesitan, y usa los embedders que hoy duermen etiquetados.
- **F3 y F4** son independientes entre sí (máquina / superficie) y pueden
  salir en paralelo si la máquina lo pide.
- **F5 antes que F6** porque la fusión de 50 entidades multiplica la
  superficie de lo que se entrega: no se fusiona lo que no se sabe
  empaquetar solo.
- **F6 y F7** son el sueño, y el sueño no se corre: se construye sobre lo
  certificado.

## 8 · Qué pasa cuando todo cierra

P1…P8 en OK sostenidas + tabla §6 vacía = la IDE llega a su definición de
perfección. Lo que viene después **ya no es perfección, es producto nuevo**
(otro IDE, otro equipo, otro sueño) — y se decide como tal, con su propia
hoja, no como parche de esta.

---

*Documento vivo: se actualiza al cierre de cada fase (estado §0, tabla §6,
y una entrada en el CHANGELOG con las líneas exactas tocadas y las
validaciones del turno). Próxima revisión: **las siete fases del plano quedaron HECHAS** — F0 en 1.79, F1 en 1.80, F3 en 1.82, F4+F5 en 1.83→1.84, F2 en 1.84, **F6 en 1.85** y **F7 en 1.86** (el orden es el de Mario, no el del número). El 1.81.0 queda vacante: la numeración de versiones es cronológica, la de fases es del plano. En §6 quedan **tres filas vivas**: la 7.1b (que el preview llame a su propio `/api/conciencia`), **FASE 8** (perfil de parches por `id`) y **FASE 9** (telemetría de contexto). F8 y F9 no nacieron de leer el binario de DeepSeek Harness —que no es analizable— sino de su carpeta de usuario `C:\Users\BirdBox\.dsh`, que sí está en texto plano: el perfil `cordis.yml` vacío con parche por `id` y el `contextBreakdown`/`contextPressure` con `ttftMs` separado de `decodeMs`. Ambas quedan planificadas con evidencia de salida y **no implementadas**: no se declara hecho lo que no tiene suite en verde.*

# MEMORIA.md — Estado Dinámico y Persistencia de Sesión

> Archivo de escritura constante. Lo actualiza el motor en cada interacción
> (escritura atómica + copia en `memoria_history/`). Es la pizarra viva del
> proyecto: lo que un modelo ligero debe leer para no tener que recordar.
>
> Reglas de higiene: cada 10 interacciones el motor comprime esta memoria y purga
> el ruido, conservando decisiones arquitectónicas y lecciones. Si supera ~2.000
> líneas, el histórico se archiva en `memoria_history/`.

## 1. Estado Operativo Actual (Session State)

<!-- BLOQUE-DINAMICO:ESTADO -->
- **Timestamp de Última Actividad:** 2026-10-06 · v1.51.0: primera entrega de la evolución de contexto (sin tocar `server.ts`): +2 packs de saber en el motor (bucles `bucle-*` y coherencia `coher-*`, 6+6 entradas) + conciencia ampliada (`ba-conciencia-limites`, `ba-conciencia-memoria`); creador web diversificado (9 paletas / 11 tipos / 15 bloques, enlaces de acción adaptativos, 11 recetas con 0 errores) + nueva herramienta `insertar_imagen` (27→32 tools, paridad OK). Pedido por Mario tras el destrabe del techo
- **Fase de Desarrollo Activa:** v1.0.13 cerrada y EMPAQUETADA (09/11) — trilogía completa: v1.0.10 (preview transform-on-serve, reversión por archivo, rutas explícitas), v1.0.11 (barra en español, entregable limpio, cadena segura), v1.0.12 (obra visible automática + hilana reanudable), v1.0.13 (auditoría de interfaz: SUPERFICIE_UI.md 107/69/315/11 + PLAN-LIMPIEZA-UI con 4 candidatos esperando el «cuál» de Mario). Próxima decisión pendiente: qué recortes de UI aprueba Mario (ronda 2). <!-- deriva:historico -->
- **Último Hito Alcanzado:** v1.51.0 — `src/engine/conciencia.ts`: nuevos `export const BUCLES_KB_ENTRIES` (6, ids `bucle-*`) y `COHERENCIA_KB_ENTRIES` (6, ids `coher-*`) + 2 entradas de conciencia; cableados en `SEMILLA_COMPLETA` (`knowledgeBase.ts`) con ids únicos (`motor-estructura` lo exige, length>=116). Creador web (`scripts/creador_daemon.py`): PALETAS 5→9, TIPOS_SITIO 5→11, BLOQUES 12→15, hero con variante+imagen, helper `_ref_imagen()` seguro, enlaces CTA adaptativos (destino_cta/destino_sec, fin del `#contacto` a ciegas que rompía anclas en recetas sin contacto), nueva tool `insertar_imagen` (MANIFIESTO=32, EJECUTORES=32, paridad OK), import base64, CSS nuevo. `creadorWeb.test.ts` 31→32. Verificado con espejo Python (`/temp/verif_creador.py`): 11/11 recetas 0 errores + `insertar_imagen` end-to-end (base64/SVG saneado/url remota/escape rechazado). Versión 1.50.0→1.51.0 en `src/constants.ts`, `package.json`, `package-lock.json` (x2), `index.html` (título+meta, 27→32 tools). NO se tocó `server.ts`.
- **Último Hito Alcanzado:** v1.50.0 — `scripts/superficie.mjs` genera `techo_absoluto_lineas` (`calcularTecho = ceil((lineas+1500)/100)*100`); `tests/superficieRutas.test.ts` y `tests/certezaModelo.test.ts` LEEN el techo del contrato (cero literales `11800`); `comparar()` suma `superaTecho` y la herramienta informa el margen. Verificado por espejo JS (/temp/verify/techo.mjs: 12 correctas 0 fallidas) + `superficie:verificar` VERDE. Versión 1.49.0→1.50.0. v1.49.0 antes (FASE 2): el fiscal con cuerpo (`src/engine/autovalido.ts`).
- **Último Hito Alcanzado:** v1.49.0 — `src/engine/autovalido.ts` (módulo puro): `fiscalizar(e: EntradaFiscal): DictamenFiscal` evalúa la lista de control casilla por casilla con evaluadores puros (`evaluarCriterios`/`evaluarEvidencia`/`evaluarFallos`/`evaluarHonestidad`/`evaluarPromesas`/`evaluarReversibilidad` base + `evaluarIdea`/`evaluarCoherencia`/`evaluarContratos`/`evaluarEstadosLimite`/`evaluarSeguridad` en tarea pesada) y devuelve veredicto `CONFIRMADO`/`RECHAZADO` con cobertura honesta y casilla bloqueada (`UMBRAL_BLOQUEO_FISCAL`, `actaBloqueoFiscal`). CABLEADO EN UN SENTIDO: `server.ts` llama a `fiscalizar()` por turno marcando `tareaPesada` con `pareceTareaPesada()` y pasa el `DictamenFiscal` a `decidirBucle` (`bucleAutonomo.ts` importa SOLO el tipo + `actaBloqueoFiscal`/`coberturaAParte`); el fiscal nunca importa al bucle. VISIBLE EN VIVO: `conciencia.ts` refleja el veredicto en [ESTADO VIVO DEL TURNO]. Suite `tests/autovalido.test.ts` dentro de `npm run validar`. Docs al día: `autovalido.md` §7 (ya módulo, no promesa), `cerebro.md` §16.2/§17.C, `CHANGELOG.md`, `ACTUALIZAR-a-v1.49.0.md`, `LEEME-PRIMERO.txt`. Versión 1.48.1→1.49.0 con `VERSION_SEMVER` como única semilla. v1.48.0 antes: la «.con-ciencia» como órgano de redirección + previsualizador a voluntad.
- **Proveedores de modelo:** `zai` y `gemini` VALIDADOS y en uso. `ollama` (local :11434) queda OPCIONAL y apagado por defecto en esta máquina (satura la RAM / congela el equipo del usuario). No arrancar ni depender de Ollama.
- **MCP:** pack `web` (puente-mcp, 4 herramientas) VALIDADO. El «drama de autorización» era sólo el reintento mientras el puente :5000 arranca (hasta 12 reintentos cada 5 s); una vez arriba el token+origen autentican y las 4 herramientas cargan solas. No es un bug.
- **Bloqueos Actuales:** ninguno.
<!-- /BLOQUE-DINAMICO:ESTADO -->

## 1.b Puertos del Ecosistema (cómo acceder — recordatorio permanente)

| Servicio | URL | Nota |
|---|---|---|
| IDE (frontend + server) | `http://127.0.0.1:3000` | puerta principal, abrir aquí |
| Sandbox / Preview | `http://127.0.0.1:3500` | estático directo (HTML sin npm) |
| Puente PC (FastAPI/Python) | `http://127.0.0.1:5000` | auto-arranca desde server.ts |
| Memoria híbrida (Hindsight) | `http://127.0.0.1:5100` | opcional, modo espejo si falta |
| Creador web | `http://127.0.0.1:5102` | pack externo, 31 herramientas |
| Ollama local | `http://127.0.0.1:11434` | OPCIONAL — apagado en esta máquina |

> Si los puertos se desconectan: botón **Reconectar** en la pestaña Puertos. Para liberar RAM: botón **Expulsar** (no tocar la consola).

## 2. Historial de Decisiones Arquitectónicas (ADR Log)

- **2026-10-06 — v1.50.0: el techo de `server.ts` deja de ser un literal y se centraliza.**
  Mario pidió destrabar el techo de 11.800 líneas ANTES de empezar la evolución
  de contexto. Diagnóstico: el techo era un número mágico (`11800`) copiado A MANO
  en dos suites (`superficieRutas.test.ts`, `certezaModelo.test.ts`); cada alza
  (`11438→11520→11640→11740→11800`) obligaba a cazarlo en varios ficheros — esa
  fricción frenó el crecimiento. Decisiones: (a) UNA sola fuente de verdad en
  `contrato-rutas.json` — campo `techo_absoluto_lineas`, GENERADO por
  `scripts/superficie.mjs` como `presupuesto_de_hoy + MARGEN_TECHO_LINEAS (1500)`
  redondeado a la centena (hoy 13.300, ~1.588 de margen); (b) las suites LO LEEN
  del contrato, cero literales `11800`; (c) el trinquete REAL se conserva: es
  `presupuesto_lineas` (== tamaño de hoy), así que crecer sigue exigiendo
  regenerar el contrato A PROPÓSITO y verse en el diff; el techo pasa a marcar
  «ya no es subir margen, toca PARTIR»; (d) nota de alcance: el techo gobierna
  SOLO `server.ts`; la evolución de contexto vive en `src/engine/*`, packs de
  conocimiento y creador web, SIN techo de líneas. Verificado sin tsx por espejo
  JS (`/temp/verify/techo.mjs`, 12/0) + `superficie:verificar` VERDE. Invariantes
  intactas: 140 rutas, `VERSION_SEMVER` única semilla.

- **2026-10-06 — v1.49.0 (FASE 2): el fiscal del último metro pasa de prosa a código.**
  Mario pidió cerrar los pendientes doc/versión ANTES de seguir evolucionando;
  esta versión consolida la FASE 2 «el fiscal tiene cuerpo». Decisiones:
  (a) el autovalido deja de ser política legible repartida por el motor y nace
  como **módulo puro `src/engine/autovalido.ts`** — `fiscalizar()` determinista,
  sin red ni disco, con un evaluador por casilla y veredicto
  `CONFIRMADO`/`RECHAZADO` + cobertura honesta (lo no comprobable se reporta como
  «sin probar», nunca verde); (b) **acople en un solo sentido**: `server.ts` llama
  a `fiscalizar()` por turno y pasa el `DictamenFiscal` a `decidirBucle`, que
  importa SOLO el tipo y dos formateadores puros — el fiscal NUNCA importa al
  bucle; (c) **a prueba de fallos**: si `fiscalizar()` lanza, el fiscal se omite y
  el bucle decide como siempre (cero regresión); (d) **visible en vivo** en la
  instantánea de conciencia; (e) `autovalido.md` se reconvierte en el CONTRATO
  legible del módulo (no su sustituto). Invariantes preservadas: sin red/build,
  trinquete `server.ts` < 11.800 líneas, `VERSION_SEMVER` única semilla en
  `src/constants.ts`, contrato de superficie de 140 rutas intacto. Suite
  `tests/autovalido.test.ts` con el patrón «N correctas · 0 fallidas».

- **2026-10-04 — v1.46.5: el Agente PC trabaja SOLO; el único medio de negación es un interruptor.**
  El usuario pidió acabar con la fricción de confirmar cada tarea y de añadir
  carpetas a mano (el renombrado en el Escritorio exigió declarar la ruta y pedir
  confirmación). Decisiones: (a) nace **`acceso_absoluto`** en
  `puente-permitidos.json`: en true el puente llega a CUALQUIER carpeta del
  usuario sin tener que listarla en `raices_extra`; (b) nace **`agente_pc_activo`**
  como único medio de negación (el botón «Agente PC on/off»): en false el puente
  rechaza toda ejecución y escritura, en true el agente actúa sin pedir permiso
  por tarea; (c) **se mantienen intactas dos redes de seguridad**: las carpetas
  CRÍTICAS del SO (`_bloqueado_sistema`: C:/Windows, /etc, /usr…) siguen vetadas
  aunque el acceso sea absoluto, y la puerta real sigue siendo **token + loopback**;
  (d) `/api/seguridad/estado` ahora publica `agente_pc_activo` y `acceso_absoluto`
  para que la IDE refleje el interruptor. Config de fábrica si falta la clave:
  `agente_pc_activo=true`, `acceso_absoluto=false` (un fallo de config nunca
  degrada a «permitir todo» por sorpresa; el absoluto es una decisión escrita).

- **2026-10-04 — v1.46.5: proveedores validados y Ollama como opcional.**
  Validación de sesión real: **`zai` y `gemini` funcionan bien** y son los
  motores de trabajo. **Ollama queda opcional y apagado** en la máquina del
  usuario (le satura la RAM y le congela el equipo). El arranque ya trata a
  Ollama como no-bloqueante; aquí se consolida como preferencia: ni arrancarlo
  ni depender de él. El **sandbox** quedó OK y el **MCP** (pack `web`) validado:
  su «drama de autorización» era sólo el reintento mientras :5000 arranca.

- **2026-09-28 — v1.20.0: el creador se maneja en bucle, y el bucle para honesto.**
  Once herramientas nuevas sobre `creador-web` (22 en total). Decisiones:
  (a) la **parada del bucle se comunica con motivo** (`objetivo_alcanzado` /
  `sin_progreso` por hash repetido / `max_iteraciones` / `nada_que_corregir`) —
  iterar sin avanzar es la forma elegante de no terminar nunca;
  (b) `plan_de_construccion` habla el **contrato de `set_plan`/`update_task`** del
  motor, no prosa, para que un plan de sitio sea reanudable por el bucle autónomo;
  (c) **las paletas se auto-corrigieron** tras suspender su propia auditoría AA: la
  accesabilidad se garantiza en origen, no culpando al usuario;
  (d) schema y consentimiento **se niegan si faltan datos reales** (dirección,
  política de cookies): mejor negarse que publicar datos inventados;
  (e) el panel de Tareas deja de capturar punteros y publica el espacio que ocupa:
  una superposición de UI se arregla con geometría, no con z-index.

- **2026-09-28 — v1.19.0: la creación de aplicaciones web entra como PACK, no como
  núcleo.** Segundo demonio externo (`:5102`) con 11 herramientas para generar,
  auditar y corregir sitios. Decisiones: (a) **dos capas opcionales conviven**
  (memoria `:5100` + creador `:5102`) y cada una puede apagarse sin arrastrar a la
  otra ni al arranque; (b) el creador es **determinista y honesto**: no inventa
  copy, marca lo que falta y ese marcador bloquea el veredicto `publicable`;
  (c) nada destructivo sin bandera explícita (`sobrescribir`, `reemplazar`,
  `aplicar`) y todo escribe snapshot; (d) las rutas se rechazan, no se sanitizan a
  escondidas; (e) `server.ts` no se toca — la superficie sigue siendo el contrato.

- **2026-09-28 — v1.18.0: la memoria se ejercita, no solo se llena.** Recall pasa de
  superposición de términos a **BM25** (df/idf + longitud normalizada + stopwords ES/EN)
  y el pack crece de 11 a 19 herramientas con un ciclo cerrado: aprender del error,
  repasar en seco, conflictar contra el acta, exportar/importar y olvidar por id.
  Decisiones de diseño: (a) **nada destructivo se aplica solo** — `memory_repasar`
  propone y `aplicar`/`memory_olvidar` exigen intención explícita; (b) las tres
  herramientas que tocan disco heredan las raíces del puente; (c) `server.ts` sigue sin
  tocarse: la superficie es un contrato, y crecer por packs es el camino autorizado;
  (d) nacen 3 skills propias (`cerebronico-memoria`, `cerebronico-verificar`,
  `cerebronico-ecosistema`) para que el procedimiento viva en `skills/`, no en el
  system prompt.

- **2026-09-28 — HÍBRIDO v1.17.0: la memoria del proyecto pasa a dos capas.**
  Capa acta (esta `memoria.md` + `cerebro.md`) y capa consultiva (Hindsight, vía
  el pack externo `memoria-hindsight` :5100). El híbrido se montó sobre
  CerebroNico v1.16.6-EDITOR-V2-VALIDADO + `hindsight-agent-sdk` + el paquete
  `hindsight-all` (Python) + 6 skills. Consecuencias: (a) el motor recall/aprende
  sin depender del contexto de la ventana; (b) **sin Hindsight arriba el pack
  funciona en modo espejo** (almacén local + superposición de términos), así que
  la capacidad nunca es un requisito de arranque; (c) `leer_skill` sirve
  documentación bajo demanda en vez de inflar el system prompt; (d) el wrapper
  Node del SDK (:5101) queda `enabled: false` para no ofrecer 18 herramientas de
  memoria a un modelo ligero. Verificación: suite nueva `tests/hindsightHibrido.test.ts`.

- **2026-09-17 — El conocimiento vive en el MOTOR, no en el modelo.**
  Base persistente en `.cerebro-db/kb.json` + manuales inyectados en cada turno.
  Consecuencia: cualquier modelo (0,5 B, GLM, Gemini) recibe el mismo saber.
- **2026-09-17 — Blindaje de sintaxis con política conservadora.**
  Un guardián que rechaza archivos correctos es peor que no tener guardián:
  bloqueó 32 de 63 archivos válidos y dejó el preview en blanco. Ahora solo se
  bloquea lo que se puede afirmar sin duda (JSON, HTML documental, CSS,
  comentario/plantilla sin cerrar, marcador de truncado al final).
- **2026-09-17 — El guard se aplica en TODAS las puertas de escritura.**
  Faltaba en `/api/fs/sync` (volcado en bloque del piloto automático), que fue la
  puerta real por la que entró un `index.html` truncado.
- **2026-09-17 — Proyectos estáticos son proyectos válidos.**
  Si hay `index.html` y no `package.json`, el sandbox sirve el proyecto con un
  servidor estático en Node: sin npm, sin build.
- **2026-09-17 — Verificación de imports en el motor.**
  Un modelo puede escribir `App.tsx` importando componentes que nunca creó. El
  motor lo detecta, informa y crea un stub funcional para no dejar el preview en
  blanco.
- **2026-09-17 — Canal directo del editor web.**
  Orden del editor → motor → archivos → preview. Sin rodeo por el chat central;
  el chat queda limpio.

## 3. Buffer de Aprendizaje y Preferencias del Usuario

### Preferencias explícitas
- Idioma de trabajo: **español**.
- Interfaz: **vertical-only scrollbars**, sin barras horizontales.
- Transparencia del módulo y el chat **regulable** (el chat se veía rosado por la
  mezcla con la imagen de fondo).
- Visor móvil con proporción real de teléfono (390×844), escalado, no deformado.
- Rutas con espacios y paréntesis: **citar siempre** en scripts (p. ej.
  `...hibrido (1)`).
- Sin relleno: respuestas directas, al grano.
- **En el chat: solo español, SIN volcar código.** Explicar en lenguaje natural qué
  se hace; el código va a los archivos/editor, no al chat central.
- **Que la tarea se realice, no importa cuál.** El agente ejecuta y escribe por su
  cuenta (acceso absoluto); solo se detiene si el interruptor «Agente PC» está en OFF.
- **Empaquetado .exe:** la base funcional confirmada arranca en `backend/main.py`
  (+ `backend/requirements.txt`), primera versión realmente funcional para empaquetar.

### Lecciones aprendidas (evitar repetir)

- [lentitud] Tiempo de espera agotado con mistral-code-latest: reduce el contexto (menos historial y menos archivos abiertos) o usa un modelo más pequeño antes de reintentar.

- [lentitud] El primer token de deepseek-v4-1-flash-1017 tardó el doble de lo normal: el prompt iba cargado. Antes de repetir, recorta historial o cierra archivos abiertos.

- [modelo-inadecuado] Una tarea de herramientas con un modelo tiny (ministral-3b-2512) no sale: para escribir archivos usa un modelo ≥4B o la nube.

- [lentitud] Tiempo de espera agotado con deepseek-v4-1-flash-1017: reduce el contexto (menos historial y menos archivos abiertos) o usa un modelo más pequeño antes de reintentar.

- [lentitud] El primer token de gemini-3.5-flash-lite tardó el doble de lo normal: el prompt iba cargado. Antes de repetir, recorta historial o cierra archivos abiertos.

- [exito-metodo] Con gemini-3.5-flash-lite y contexto reducido la respuesta llegó rápido: mantén el contexto corto en este tipo de tarea.
- **Comentario JSX dentro de una expresión rompe la compilación.** Colocar
  `{/* … */}` después de `cond && (` o `cond ? (` es un error de sintaxis. Los
  comentarios van **antes** de la expresión o como `//` fuera del JSX.
- **No paralelizar ediciones sobre el mismo archivo** sin verificar después: una
  puede pisar a otra. Y **no validar con artefactos compilados viejos** — el
  primer diagnóstico del blindaje fue falso por eso.
- **Un archivo de estado debe cerrarse siempre**: si el modelo trunca, el motor
  devuelve el motivo y el archivo **no** se escribe.
- **Cortar el código a 100 KB al enviarlo al modelo produce archivos cortados** si
  el modelo lo devuelve tal cual. Nunca enviar contenido recortado como base de
  una reescritura.

- **[json] Un `edit_file` sobre un literal de versión puede CORROMPER el JSON.**
  Reemplazar `2.3.9` por `2.3.11` dentro de `"version": "2.3.9"` deja
  `"version": "2.3.112.3.9,` — sin comilla de cierre y con el valor duplicado.
  Un `package.json` inválido hace que `tsx` NO ARRANQUE: todas las suites mueren
  antes de ejecutar una sola comprobación y el validador reporta fallos que no
  existen. Antes de subir versión, editar la LÍNEA COMPLETA con `fs_write`, no el
  número suelto. Y tras editar, validar con `JSON.parse` los cuatro sitios:
  `package.json`, `package-lock.json` (x2), `src/constants.ts`, `index.html`.

- **[fiscal] Las casillas del fiscal son un CONTRATO CERRADO: 7 del §2 + 5 del §8.**
  Añadir un evaluador nuevo a `evaluarCasillas` sin declararlo en `CASILLAS_BASE`
  o `CASILLAS_PESADA` rompe el conteo (la suite cuenta 7 y el código devuelve 9).
  Lo que no es casilla del §2/§8 (limpieza, autoevaluación) va en una función de
  cierre PROPIA, no dentro de `evaluarCasillas`.

- **[verificacion] `edit_file` NO toca rutas absolutas: trabaja sobre el sandbox.**
  Reporta `savedChars` y `syntax: OK` aunque el archivo real no cambie. Toda
  escritura sobre `C:\...` va con `fs_write`, y se comprueba con `findstr`/`dir`
  ANTES de afirmar que se hizo. Este error se repitió cuatro veces en una sesión.

- **[puente] El puente :5000 rechaza metacaracteres de shell.** `&&`, `>`, `&`, `# MEMORIA.md — Estado Dinámico y Persistencia de Sesión

> Archivo de escritura constante. Lo actualiza el motor en cada interacción
> (escritura atómica + copia en `memoria_history/`). Es la pizarra viva del
> proyecto: lo que un modelo ligero debe leer para no tener que recordar.
>
> Reglas de higiene: cada 10 interacciones el motor comprime esta memoria y purga
> el ruido, conservando decisiones arquitectónicas y lecciones. Si supera ~2.000
> líneas, el histórico se archiva en `memoria_history/`.

## 1. Estado Operativo Actual (Session State)

<!-- BLOQUE-DINAMICO:ESTADO -->
- **Timestamp de Última Actividad:** 2026-10-06 · v1.51.0: primera entrega de la evolución de contexto (sin tocar `server.ts`): +2 packs de saber en el motor (bucles `bucle-*` y coherencia `coher-*`, 6+6 entradas) + conciencia ampliada (`ba-conciencia-limites`, `ba-conciencia-memoria`); creador web diversificado (9 paletas / 11 tipos / 15 bloques, enlaces de acción adaptativos, 11 recetas con 0 errores) + nueva herramienta `insertar_imagen` (27→32 tools, paridad OK). Pedido por Mario tras el destrabe del techo
- **Fase de Desarrollo Activa:** v1.0.13 cerrada y EMPAQUETADA (09/11) — trilogía completa: v1.0.10 (preview transform-on-serve, reversión por archivo, rutas explícitas), v1.0.11 (barra en español, entregable limpio, cadena segura), v1.0.12 (obra visible automática + hilana reanudable), v1.0.13 (auditoría de interfaz: SUPERFICIE_UI.md 107/69/315/11 + PLAN-LIMPIEZA-UI con 4 candidatos esperando el «cuál» de Mario). Próxima decisión pendiente: qué recortes de UI aprueba Mario (ronda 2). <!-- deriva:historico -->
- **Último Hito Alcanzado:** v1.51.0 — `src/engine/conciencia.ts`: nuevos `export const BUCLES_KB_ENTRIES` (6, ids `bucle-*`) y `COHERENCIA_KB_ENTRIES` (6, ids `coher-*`) + 2 entradas de conciencia; cableados en `SEMILLA_COMPLETA` (`knowledgeBase.ts`) con ids únicos (`motor-estructura` lo exige, length>=116). Creador web (`scripts/creador_daemon.py`): PALETAS 5→9, TIPOS_SITIO 5→11, BLOQUES 12→15, hero con variante+imagen, helper `_ref_imagen()` seguro, enlaces CTA adaptativos (destino_cta/destino_sec, fin del `#contacto` a ciegas que rompía anclas en recetas sin contacto), nueva tool `insertar_imagen` (MANIFIESTO=32, EJECUTORES=32, paridad OK), import base64, CSS nuevo. `creadorWeb.test.ts` 31→32. Verificado con espejo Python (`/temp/verif_creador.py`): 11/11 recetas 0 errores + `insertar_imagen` end-to-end (base64/SVG saneado/url remota/escape rechazado). Versión 1.50.0→1.51.0 en `src/constants.ts`, `package.json`, `package-lock.json` (x2), `index.html` (título+meta, 27→32 tools). NO se tocó `server.ts`.
- **Último Hito Alcanzado:** v1.50.0 — `scripts/superficie.mjs` genera `techo_absoluto_lineas` (`calcularTecho = ceil((lineas+1500)/100)*100`); `tests/superficieRutas.test.ts` y `tests/certezaModelo.test.ts` LEEN el techo del contrato (cero literales `11800`); `comparar()` suma `superaTecho` y la herramienta informa el margen. Verificado por espejo JS (/temp/verify/techo.mjs: 12 correctas 0 fallidas) + `superficie:verificar` VERDE. Versión 1.49.0→1.50.0. v1.49.0 antes (FASE 2): el fiscal con cuerpo (`src/engine/autovalido.ts`).
- **Último Hito Alcanzado:** v1.49.0 — `src/engine/autovalido.ts` (módulo puro): `fiscalizar(e: EntradaFiscal): DictamenFiscal` evalúa la lista de control casilla por casilla con evaluadores puros (`evaluarCriterios`/`evaluarEvidencia`/`evaluarFallos`/`evaluarHonestidad`/`evaluarPromesas`/`evaluarReversibilidad` base + `evaluarIdea`/`evaluarCoherencia`/`evaluarContratos`/`evaluarEstadosLimite`/`evaluarSeguridad` en tarea pesada) y devuelve veredicto `CONFIRMADO`/`RECHAZADO` con cobertura honesta y casilla bloqueada (`UMBRAL_BLOQUEO_FISCAL`, `actaBloqueoFiscal`). CABLEADO EN UN SENTIDO: `server.ts` llama a `fiscalizar()` por turno marcando `tareaPesada` con `pareceTareaPesada()` y pasa el `DictamenFiscal` a `decidirBucle` (`bucleAutonomo.ts` importa SOLO el tipo + `actaBloqueoFiscal`/`coberturaAParte`); el fiscal nunca importa al bucle. VISIBLE EN VIVO: `conciencia.ts` refleja el veredicto en [ESTADO VIVO DEL TURNO]. Suite `tests/autovalido.test.ts` dentro de `npm run validar`. Docs al día: `autovalido.md` §7 (ya módulo, no promesa), `cerebro.md` §16.2/§17.C, `CHANGELOG.md`, `ACTUALIZAR-a-v1.49.0.md`, `LEEME-PRIMERO.txt`. Versión 1.48.1→1.49.0 con `VERSION_SEMVER` como única semilla. v1.48.0 antes: la «.con-ciencia» como órgano de redirección + previsualizador a voluntad.
- **Proveedores de modelo:** `zai` y `gemini` VALIDADOS y en uso. `ollama` (local :11434) queda OPCIONAL y apagado por defecto en esta máquina (satura la RAM / congela el equipo del usuario). No arrancar ni depender de Ollama.
- **MCP:** pack `web` (puente-mcp, 4 herramientas) VALIDADO. El «drama de autorización» era sólo el reintento mientras el puente :5000 arranca (hasta 12 reintentos cada 5 s); una vez arriba el token+origen autentican y las 4 herramientas cargan solas. No es un bug.
- **Bloqueos Actuales:** ninguno.
<!-- /BLOQUE-DINAMICO:ESTADO -->

## 1.b Puertos del Ecosistema (cómo acceder — recordatorio permanente)

| Servicio | URL | Nota |
|---|---|---|
| IDE (frontend + server) | `http://127.0.0.1:3000` | puerta principal, abrir aquí |
| Sandbox / Preview | `http://127.0.0.1:3500` | estático directo (HTML sin npm) |
| Puente PC (FastAPI/Python) | `http://127.0.0.1:5000` | auto-arranca desde server.ts |
| Memoria híbrida (Hindsight) | `http://127.0.0.1:5100` | opcional, modo espejo si falta |
| Creador web | `http://127.0.0.1:5102` | pack externo, 31 herramientas |
| Ollama local | `http://127.0.0.1:11434` | OPCIONAL — apagado en esta máquina |

> Si los puertos se desconectan: botón **Reconectar** en la pestaña Puertos. Para liberar RAM: botón **Expulsar** (no tocar la consola).

## 2. Historial de Decisiones Arquitectónicas (ADR Log)

- **2026-10-06 — v1.50.0: el techo de `server.ts` deja de ser un literal y se centraliza.**
  Mario pidió destrabar el techo de 11.800 líneas ANTES de empezar la evolución
  de contexto. Diagnóstico: el techo era un número mágico (`11800`) copiado A MANO
  en dos suites (`superficieRutas.test.ts`, `certezaModelo.test.ts`); cada alza
  (`11438→11520→11640→11740→11800`) obligaba a cazarlo en varios ficheros — esa
  fricción frenó el crecimiento. Decisiones: (a) UNA sola fuente de verdad en
  `contrato-rutas.json` — campo `techo_absoluto_lineas`, GENERADO por
  `scripts/superficie.mjs` como `presupuesto_de_hoy + MARGEN_TECHO_LINEAS (1500)`
  redondeado a la centena (hoy 13.300, ~1.588 de margen); (b) las suites LO LEEN
  del contrato, cero literales `11800`; (c) el trinquete REAL se conserva: es
  `presupuesto_lineas` (== tamaño de hoy), así que crecer sigue exigiendo
  regenerar el contrato A PROPÓSITO y verse en el diff; el techo pasa a marcar
  «ya no es subir margen, toca PARTIR»; (d) nota de alcance: el techo gobierna
  SOLO `server.ts`; la evolución de contexto vive en `src/engine/*`, packs de
  conocimiento y creador web, SIN techo de líneas. Verificado sin tsx por espejo
  JS (`/temp/verify/techo.mjs`, 12/0) + `superficie:verificar` VERDE. Invariantes
  intactas: 140 rutas, `VERSION_SEMVER` única semilla.

- **2026-10-06 — v1.49.0 (FASE 2): el fiscal del último metro pasa de prosa a código.**
  Mario pidió cerrar los pendientes doc/versión ANTES de seguir evolucionando;
  esta versión consolida la FASE 2 «el fiscal tiene cuerpo». Decisiones:
  (a) el autovalido deja de ser política legible repartida por el motor y nace
  como **módulo puro `src/engine/autovalido.ts`** — `fiscalizar()` determinista,
  sin red ni disco, con un evaluador por casilla y veredicto
  `CONFIRMADO`/`RECHAZADO` + cobertura honesta (lo no comprobable se reporta como
  «sin probar», nunca verde); (b) **acople en un solo sentido**: `server.ts` llama
  a `fiscalizar()` por turno y pasa el `DictamenFiscal` a `decidirBucle`, que
  importa SOLO el tipo y dos formateadores puros — el fiscal NUNCA importa al
  bucle; (c) **a prueba de fallos**: si `fiscalizar()` lanza, el fiscal se omite y
  el bucle decide como siempre (cero regresión); (d) **visible en vivo** en la
  instantánea de conciencia; (e) `autovalido.md` se reconvierte en el CONTRATO
  legible del módulo (no su sustituto). Invariantes preservadas: sin red/build,
  trinquete `server.ts` < 11.800 líneas, `VERSION_SEMVER` única semilla en
  `src/constants.ts`, contrato de superficie de 140 rutas intacto. Suite
  `tests/autovalido.test.ts` con el patrón «N correctas · 0 fallidas».

- **2026-10-04 — v1.46.5: el Agente PC trabaja SOLO; el único medio de negación es un interruptor.**
  El usuario pidió acabar con la fricción de confirmar cada tarea y de añadir
  carpetas a mano (el renombrado en el Escritorio exigió declarar la ruta y pedir
  confirmación). Decisiones: (a) nace **`acceso_absoluto`** en
  `puente-permitidos.json`: en true el puente llega a CUALQUIER carpeta del
  usuario sin tener que listarla en `raices_extra`; (b) nace **`agente_pc_activo`**
  como único medio de negación (el botón «Agente PC on/off»): en false el puente
  rechaza toda ejecución y escritura, en true el agente actúa sin pedir permiso
  por tarea; (c) **se mantienen intactas dos redes de seguridad**: las carpetas
  CRÍTICAS del SO (`_bloqueado_sistema`: C:/Windows, /etc, /usr…) siguen vetadas
  aunque el acceso sea absoluto, y la puerta real sigue siendo **token + loopback**;
  (d) `/api/seguridad/estado` ahora publica `agente_pc_activo` y `acceso_absoluto`
  para que la IDE refleje el interruptor. Config de fábrica si falta la clave:
  `agente_pc_activo=true`, `acceso_absoluto=false` (un fallo de config nunca
  degrada a «permitir todo» por sorpresa; el absoluto es una decisión escrita).

- **2026-10-04 — v1.46.5: proveedores validados y Ollama como opcional.**
  Validación de sesión real: **`zai` y `gemini` funcionan bien** y son los
  motores de trabajo. **Ollama queda opcional y apagado** en la máquina del
  usuario (le satura la RAM y le congela el equipo). El arranque ya trata a
  Ollama como no-bloqueante; aquí se consolida como preferencia: ni arrancarlo
  ni depender de él. El **sandbox** quedó OK y el **MCP** (pack `web`) validado:
  su «drama de autorización» era sólo el reintento mientras :5000 arranca.

- **2026-09-28 — v1.20.0: el creador se maneja en bucle, y el bucle para honesto.**
  Once herramientas nuevas sobre `creador-web` (22 en total). Decisiones:
  (a) la **parada del bucle se comunica con motivo** (`objetivo_alcanzado` /
  `sin_progreso` por hash repetido / `max_iteraciones` / `nada_que_corregir`) —
  iterar sin avanzar es la forma elegante de no terminar nunca;
  (b) `plan_de_construccion` habla el **contrato de `set_plan`/`update_task`** del
  motor, no prosa, para que un plan de sitio sea reanudable por el bucle autónomo;
  (c) **las paletas se auto-corrigieron** tras suspender su propia auditoría AA: la
  accesabilidad se garantiza en origen, no culpando al usuario;
  (d) schema y consentimiento **se niegan si faltan datos reales** (dirección,
  política de cookies): mejor negarse que publicar datos inventados;
  (e) el panel de Tareas deja de capturar punteros y publica el espacio que ocupa:
  una superposición de UI se arregla con geometría, no con z-index.

- **2026-09-28 — v1.19.0: la creación de aplicaciones web entra como PACK, no como
  núcleo.** Segundo demonio externo (`:5102`) con 11 herramientas para generar,
  auditar y corregir sitios. Decisiones: (a) **dos capas opcionales conviven**
  (memoria `:5100` + creador `:5102`) y cada una puede apagarse sin arrastrar a la
  otra ni al arranque; (b) el creador es **determinista y honesto**: no inventa
  copy, marca lo que falta y ese marcador bloquea el veredicto `publicable`;
  (c) nada destructivo sin bandera explícita (`sobrescribir`, `reemplazar`,
  `aplicar`) y todo escribe snapshot; (d) las rutas se rechazan, no se sanitizan a
  escondidas; (e) `server.ts` no se toca — la superficie sigue siendo el contrato.

- **2026-09-28 — v1.18.0: la memoria se ejercita, no solo se llena.** Recall pasa de
  superposición de términos a **BM25** (df/idf + longitud normalizada + stopwords ES/EN)
  y el pack crece de 11 a 19 herramientas con un ciclo cerrado: aprender del error,
  repasar en seco, conflictar contra el acta, exportar/importar y olvidar por id.
  Decisiones de diseño: (a) **nada destructivo se aplica solo** — `memory_repasar`
  propone y `aplicar`/`memory_olvidar` exigen intención explícita; (b) las tres
  herramientas que tocan disco heredan las raíces del puente; (c) `server.ts` sigue sin
  tocarse: la superficie es un contrato, y crecer por packs es el camino autorizado;
  (d) nacen 3 skills propias (`cerebronico-memoria`, `cerebronico-verificar`,
  `cerebronico-ecosistema`) para que el procedimiento viva en `skills/`, no en el
  system prompt.

- **2026-09-28 — HÍBRIDO v1.17.0: la memoria del proyecto pasa a dos capas.**
  Capa acta (esta `memoria.md` + `cerebro.md`) y capa consultiva (Hindsight, vía
  el pack externo `memoria-hindsight` :5100). El híbrido se montó sobre
  CerebroNico v1.16.6-EDITOR-V2-VALIDADO + `hindsight-agent-sdk` + el paquete
  `hindsight-all` (Python) + 6 skills. Consecuencias: (a) el motor recall/aprende
  sin depender del contexto de la ventana; (b) **sin Hindsight arriba el pack
  funciona en modo espejo** (almacén local + superposición de términos), así que
  la capacidad nunca es un requisito de arranque; (c) `leer_skill` sirve
  documentación bajo demanda en vez de inflar el system prompt; (d) el wrapper
  Node del SDK (:5101) queda `enabled: false` para no ofrecer 18 herramientas de
  memoria a un modelo ligero. Verificación: suite nueva `tests/hindsightHibrido.test.ts`.

- **2026-09-17 — El conocimiento vive en el MOTOR, no en el modelo.**
  Base persistente en `.cerebro-db/kb.json` + manuales inyectados en cada turno.
  Consecuencia: cualquier modelo (0,5 B, GLM, Gemini) recibe el mismo saber.
- **2026-09-17 — Blindaje de sintaxis con política conservadora.**
  Un guardián que rechaza archivos correctos es peor que no tener guardián:
  bloqueó 32 de 63 archivos válidos y dejó el preview en blanco. Ahora solo se
  bloquea lo que se puede afirmar sin duda (JSON, HTML documental, CSS,
  comentario/plantilla sin cerrar, marcador de truncado al final).
- **2026-09-17 — El guard se aplica en TODAS las puertas de escritura.**
  Faltaba en `/api/fs/sync` (volcado en bloque del piloto automático), que fue la
  puerta real por la que entró un `index.html` truncado.
- **2026-09-17 — Proyectos estáticos son proyectos válidos.**
  Si hay `index.html` y no `package.json`, el sandbox sirve el proyecto con un
  servidor estático en Node: sin npm, sin build.
- **2026-09-17 — Verificación de imports en el motor.**
  Un modelo puede escribir `App.tsx` importando componentes que nunca creó. El
  motor lo detecta, informa y crea un stub funcional para no dejar el preview en
  blanco.
- **2026-09-17 — Canal directo del editor web.**
  Orden del editor → motor → archivos → preview. Sin rodeo por el chat central;
  el chat queda limpio.

## 3. Buffer de Aprendizaje y Preferencias del Usuario

### Preferencias explícitas
- Idioma de trabajo: **español**.
- Interfaz: **vertical-only scrollbars**, sin barras horizontales.
- Transparencia del módulo y el chat **regulable** (el chat se veía rosado por la
  mezcla con la imagen de fondo).
- Visor móvil con proporción real de teléfono (390×844), escalado, no deformado.
- Rutas con espacios y paréntesis: **citar siempre** en scripts (p. ej.
  `...hibrido (1)`).
- Sin relleno: respuestas directas, al grano.
- **En el chat: solo español, SIN volcar código.** Explicar en lenguaje natural qué
  se hace; el código va a los archivos/editor, no al chat central.
- **Que la tarea se realice, no importa cuál.** El agente ejecuta y escribe por su
  cuenta (acceso absoluto); solo se detiene si el interruptor «Agente PC» está en OFF.
- **Empaquetado .exe:** la base funcional confirmada arranca en `backend/main.py`
  (+ `backend/requirements.txt`), primera versión realmente funcional para empaquetar.

### Lecciones aprendidas (evitar repetir)

- [modelo-inadecuado] Una tarea de herramientas con un modelo tiny (ministral-3b-2512) no sale: para escribir archivos usa un modelo ≥4B o la nube.

- [lentitud] Tiempo de espera agotado con deepseek-v4-1-flash-1017: reduce el contexto (menos historial y menos archivos abiertos) o usa un modelo más pequeño antes de reintentar.

- [lentitud] El primer token de gemini-3.5-flash-lite tardó el doble de lo normal: el prompt iba cargado. Antes de repetir, recorta historial o cierra archivos abiertos.

- [exito-metodo] Con gemini-3.5-flash-lite y contexto reducido la respuesta llegó rápido: mantén el contexto corto en este tipo de tarea.
- **Comentario JSX dentro de una expresión rompe la compilación.** Colocar
  `{/* … */}` después de `cond && (` o `cond ? (` es un error de sintaxis. Los
  comentarios van **antes** de la expresión o como `//` fuera del JSX.
- **No paralelizar ediciones sobre el mismo archivo** sin verificar después: una
  puede pisar a otra. Y **no validar con artefactos compilados viejos** — el
  primer diagnóstico del blindaje fue falso por eso.
- **Un archivo de estado debe cerrarse siempre**: si el modelo trunca, el motor
  devuelve el motivo y el archivo **no** se escribe.
,
  `'` y `-e` con comillas anidadas devuelven HTTP 403 «redirección a fichero no
  permitida». Salida: escribir un `.cjs` a disco con `fs_write` y ejecutarlo por
  ruta absoluta con `node`. No reintentar el mismo comando.

- **[catalogo] El censo de suites se mide con el regex REAL del validador**
  (`/archivo:\s*"tests\/[^"]+"/g`), no buscando el nombre suelto en el archivo:
  una mención en un comentario da falso positivo y esconde la suite huérfana.

- **[autoevaluacion] El cierre evalúa y guarda solo, sin que se lo pidan.**
  Cinco ejes (verificación real, limpieza, documentación, registro, honestidad) →
  veredicto LIMPIO / CON_OBSERVACIONES / SUCIO → lección a `memoria.md` §3.

## 4. Cola de Tareas Pendientes (Backlog de Sesión)

- [ ] **Bug:** el botón "Abrir .cn" del explorador no responde.
- [ ] Interfaz: el control de tamaño de texto del explorador de código está topado
      en 12 px (el global ya llega a 25 px).
- [ ] Sandbox: mostrar en el log de la interfaz los archivos **rechazados** por el
      blindaje (hoy se rechazan en silencio).
- [ ] Motor: cerrar el canal directo del editor con su propio panel de respuesta.
- [ ] Memoria: vectorización opcional (embeddings locales) cuando `memoria.md`
      supere ~5.000 líneas.
- [ ] Multi-cerebro: `cerebro_backend.md` / `cerebro_frontend.md` alimentando una
      `memoria.md` central.

## 5. Incidencias Críticas (registro automático del motor)

<!-- BLOQUE-DINAMICO:INCIDENCIAS -->
- **2026-09-17 · Blindaje con falsos positivos.** 32 de 63 archivos válidos
- **2026-10-03 21:51** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n .creador/sandbox-test/js/counter.js:5 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá
- **2026-10-31 07:56** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n fix_manual_json.mjs:4 [deserializacion] Deserialización peligrosa (pickle/yaml.load/unserialize) → JSON con valida
- **2026-11-04 04:46** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/src/App.tsx:5516 [sqli-concat] SQLi: consulta armada por concatenación → Consultas parametrizadas: `WHERE id =
- **2026-11-04 04:46** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/src/App.tsx:5508 [sqli-concat] SQLi: consulta armada por concatenación → Consultas parametrizadas: `WHERE id =
- **2026-11-04 05:30** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 5 vulnerabilidad(es) CRÍTICA(S):\n app/src/engine/cerradura.ts:72 [xss-react] XSS en React: dangerouslySetInnerHTML → Renderizá nodos React en vez de
- **2026-11-04 05:31** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 5 vulnerabilidad(es) CRÍTICA(S):\n app/src/engine/cerradura.ts:72 [xss-react] XSS en React: dangerouslySetInnerHTML → Renderizá nodos React en vez de
- **2026-11-04 05:32** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 5 vulnerabilidad(es) CRÍTICA(S):\n app/src/engine/cerradura.ts:72 [xss-react] XSS en React: dangerouslySetInnerHTML → Renderizá nodos React en vez de
- **2026-11-04 05:33** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 5 vulnerabilidad(es) CRÍTICA(S):\n app/src/engine/cerradura.ts:72 [xss-react] XSS en React: dangerouslySetInnerHTML → Renderizá nodos React en vez de
- **2026-11-04 05:36** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/tests/aduanaForja.test.ts:94 [rce-eval] RCE: eval() sobre texto → Nada que se evalúa solo: parseá JSON con JSO
- **2026-11-04 05:38** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/tests/aduanaForja.test.ts:94 [rce-eval] RCE: eval() sobre texto → Nada que se evalúa solo: parseá JSON con JSO
- **2026-11-04 05:39** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/tests/aduanaForja.test.ts:94 [rce-eval] RCE: eval() sobre texto → Nada que se evalúa solo: parseá JSON con JSO
- **2026-11-04 05:47** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/src/App.tsx:5510 [sqli-concat] SQLi: consulta armada por concatenación → Consultas parametrizadas: `WHERE id =
- **2026-11-04 05:47** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/src/App.tsx:5508 [sqli-concat] SQLi: consulta armada por concatenación → Consultas parametrizadas: `WHERE id =
- **2026-11-04 05:47** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/src/App.tsx:5507 [sqli-concat] SQLi: consulta armada por concatenación → Consultas parametrizadas: `WHERE id =
- **2026-11-04 06:43** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 5 vulnerabilidad(es) CRÍTICA(S):\n app/src/engine/cerradura.ts:72 [xss-react] XSS en React: dangerouslySetInnerHTML → Renderizá nodos React en vez de
- **2026-11-04 11:16** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n C:/Users/BirdBox/Downloads/cerebronico 3-11-2026/CerebroNico-IDE-v2.3.8/app/src/constants.ts:304 [secret-duro] Se
- **2026-11-05 23:39** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n memoria.md:268 [rce-eval] RCE: eval() sobre texto → Nada que se evalúa solo: parseá JSON con JSON.parse o resolvé
- **2026-11-06 01:28** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 4 vulnerabilidad(es) CRÍTICA(S):\n app/memoria.md:471 [rce-eval] RCE: eval() sobre texto → Nada que se evalúa solo: parseá JSON con JSON.parse o reso
- **2026-11-06 01:33** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n app/memoria.md:469 [rce-eval] RCE: eval() sobre texto → Nada que se evalúa solo: parseá JSON con JSON.parse o reso
- **2026-11-06 02:36** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 15 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:244 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o sa
- **2026-11-06 02:39** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 15 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:244 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o sa
- **2026-11-06 02:40** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 15 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:244 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o sa
- **2026-11-06 04:08** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:08** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:244 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o san
- **2026-11-06 04:12** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:12** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 12 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:13** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 8 vulnerabilidad(es) CRÍTICA(S):\n app/EXPORT-CONTEXTO.md:126 [deserializacion] Deserialización peligrosa (pickle/yaml.load/unserialize) → JSON con v
- **2026-11-06 04:13** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 12 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:14** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:14** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:244 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o san
- **2026-11-06 04:15** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:23** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:24** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:54** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:54** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:244 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o san
- **2026-11-06 04:54** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:247 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o san
- **2026-11-06 04:55** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 10 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:343 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-06 04:55** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n app/index.html:247 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o san
- **2026-11-06 04:57** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 12 vulnerabilidad(es) CRÍTICA(S):\n app/src/constants.ts:338 [secret-duro] Secreto hardcodeado (clave/token/contraseña literal) → Sacá el valor a var
- **2026-11-08 01:39** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n grabador-cd/app.js:92 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o
- **2026-11-08 02:23** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:508 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:24** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:508 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:25** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:508 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:26** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:508 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:28** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:117 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:28** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:121 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:29** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:121 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:30** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:121 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:32** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 02:35** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n juego-autos/main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent,
- **2026-11-08 03:23** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 03:49** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 03:50** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 03:50** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 03:51** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:140 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 03:53** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:148 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:12** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:13** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:140 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:13** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:13** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:14** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:16** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:17** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:137 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:23** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:26** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:32** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:55** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 04:59** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:02** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:11** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:11** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:139 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:12** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:13** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:139 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:13** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:14** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:138 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:16** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:140 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:16** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 2 vulnerabilidad(es) CRÍTICA(S):\n _parche_ui.mjs:32 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o sane
- **2026-11-08 05:17** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:141 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:19** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:141 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:20** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:141 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:22** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 3 vulnerabilidad(es) CRÍTICA(S):\n main.js:141 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML → Usá textContent, o saneá con
- **2026-11-08 05:23** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n _verif_meta.mjs:20 [rce-eval] RCE: eval() sobre texto → Nada que se evalúa solo: parseá JSON con JSON.parse o reso
- **2026-11-08 05:27** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n _contrato.mjs:67 [rce-shell-node] RCE en Node: exec/execSync con cadena construida → Usá execFile/spawn con ARRAY
- **2026-11-08 05:28** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n _contrato.mjs:72 [rce-shell-node] RCE en Node: exec/execSync con cadena construida → Usá execFile/spawn con ARRAY
- **2026-11-08 05:29** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n _evidencia.mjs:61 [rce-shell-node] RCE en Node: exec/execSync con cadena construida → Usá execFile/spawn con ARRAY
- **2026-11-08 05:57** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n registro-quirofano.cjs:35 [deserializacion] Deserialización peligrosa (pickle/yaml.load/unserialize) → JSON con va
- **2026-11-09 23:55** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n index.html:81 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML · origen del dato no concluye
- **2026-11-10 00:01** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n carpeta-juego-autos-solo/index.html:40 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML · or
- **2026-11-10 00:01** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n carpeta-juego-autos-solo/index.html:41 [xss-innerhtml] XSS: asignación directa a innerHTML/insertAdjacentHTML · or
- **2026-11-10 01:56** Herramienta **quirofano** falló: {"ok":false,"error":"seguridad: CERRADURA encontró 1 vulnerabilidad(es) CRÍTICA(S):\n temp/verif_juego.mjs:17 [rce-function] RCE: constructor Function/new Function con string → Pasá una función real (
- **2026-11-08 05:04** Herramienta **fs_sync** falló: {"ok":false,"error":"_calibra.mjs importa \"./vendor/three/three.module.js\" y NO existe"}
- **2026-11-08 05:21** Herramienta **fs_sync** falló: {"ok":false,"error":"_calibra.mjs importa \"./vendor/three/three.module.js\" y NO existe"}
- **2026-11-08 05:23** Herramienta **fs_sync** falló: {"ok":false,"error":"_calibra.mjs importa \"./vendor/three/three.module.js\" y NO existe"}
- **2026-11-08 05:24** Herramienta **fs_sync** falló: {"ok":false,"error":"_calibra.mjs importa \"./vendor/three/three.module.js\" y NO existe"}
- **2026-11-10 05:28** Herramienta **gemini** falló: {"ok":false,"error":"{\"error\":{\"message\":\"{\\n \\\"error\\\": {\\n \\\"code\\\": 429,\\n \\\"message\\\": \\\"You exceeded your current quota, please check your plan and billing details. For more
- **2026-11-10 05:50** Herramienta **gemini** falló: {"ok":false,"error":"{\"error\":{\"message\":\"{\\n \\\"error\\\": {\\n \\\"code\\\": 429,\\n \\\"message\\\": \\\"You exceeded your current quota, please check your plan and billing details. For more
<!-- /BLOQUE-DINAMICO:INCIDENCIAS -->

## 6. Métricas de Eficiencia (lo mide el motor)

<!-- BLOQUE-DINAMICO:METRICAS -->
- Interacciones registradas: 1171
- Archivos rechazados por el blindaje: 0
- Imports sin resolver detectados: 0
- Propuestas de auto-mejora pendientes de aprobar: 0
- Incidentes registrados: 198
<!-- /BLOQUE-DINAMICO:METRICAS -->

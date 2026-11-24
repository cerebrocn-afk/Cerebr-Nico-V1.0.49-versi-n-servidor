## v1.70.3 · 2026-10-25 · EL NÚCLEO ENGALE, LOS ESPEJOS PIENSAN SOLOS, EL 503 APRENDE

Continuación directa de la revisión de arquitectura del 25/10 (los cuatro ítems
de Mario) sobre lo entregado en v1.70.2.

### 1 · Estructural: dos dominios más fuera del monolito — y el trinquete respira

* Nuevo `server/routers/calidad.ts`: los dominios **`verifier`** (3 rutas del
  juez en la nube) y **`governor`** (1 ruta del gobernador de hardware) salieron
  de `server.ts` **tal cual** (regla Fase 2: «se mueve, no se mejora»; la
  mudanza se verificó por diff programado: 4/4 rutas, 0 líneas de código sin
  reproducir). Registro por delegación con las MISMAS instancias vivas.
* `server.ts`: **12173 líneas** (venía de 12289). Contra el trinquete duro de
  `androidProyecto` (hay que quedar bajo las 12287 de v1.68.0) ahora hay
  **114 líneas de aire real**, no 1 como en v1.70.1.
* El presupuesto del contrato se regenera con la herramienta de la casa
  (`npm run superficie` → `scripts/superficie.mjs`), que es justamente la
  respuesta al «¿cómo se soluciona el presupuesto de líneas?»: **el número no
  se defiende a hachazos de comentario, se lo baja moviendo dominios completos
  a `server/routers/`** y el contrato se regenera solo. Con `features` (v1.70.2)
  + `calidad` (esta) son 11 rutas extraídas en dos versiones; la hoja de ruta
  vive en `SUPERFICIE_RUTAS.md` (90 adentro, 59 afuera).

### 2 · Bucles: el 503 de Google ahora paga alquiler creciente

* **Cuarentena exponencial del saturado** (`fusibleGemini.ts`): la primera
  vez que un Gemini tira 503 sigue enfriando los 5 min de siempre (el test
  viejo sigue mandando); cada golpe consecutivo DOBLA la ventana — 5 → 10 → 20
  → 40 min, tope 1 h — y el informe del fusible lo dice (`enfriamiento x2 por
  repetición`). Cualquier éxito limpia el contador. Esto es el ítem 2 de la
  revisión: «ventana de enfriamiento exponencial para no perder ciclos de
  reloj tentando modelos agotados».
* Lo demás del ítem ya estaba cableado y se deja documentado con evidencia:
  el token imperativo de re-empuje (`directivaDeReanudacion`: EJECUTÁ /
  ACCIÓN AHORA, con el ultimátum honesto al agotar el presupuesto), el corte
  del 429 «Free usage limit» de Ollama Cloud (v1.70.2 §6) y la cuarentena de
  proveedor que ya marcaba `⛔ EN CUARENTENA`.

### 3 · Espejos: de reactivos a deterministas por tarea

* `notaSeleccionEspejos()` acepta ahora el texto de la tarea. En modo **auto**,
  el motor corre `grupoPorTarea` (léxico, determinista, sin modelo, ~0 ms) y
  inyecta en el system prompt el equipo **ya resuelto**:
  `PARA ESTA TAREA EL MOTOR YA RESOLVIÓ EL EQUIPO: «codigo» (…) · señales: … ·
  confianza …%. Empezá la obra llamando consultar_espejo en lote…`. El modelo
  ya no decide el equipo: lo recibe decidido y con las señales que lo motivan —
  el «middleware de inyección determinista» del ítem 3, implementado sobre la
  `notaEspejosV8` que v1.66 ya mandaba a TODOS los proveedores. Sin tarea o sin
  señales claras, viaja la nota base de siempre (el piso probado no se toca).
  El call-site en `server.ts` cambió en la propia línea (costo: 0 líneas).
* Sobre la mesa sigue el siguiente paso natural (declarado, no hecho): que el
  orquestador llame a los espejos por su cuenta y pegue el RESULTADO en el
  prompt. Hoy se manda el equipo y las reglas; mandar hechos pre-calculados
  necesita decidir qué payload determinista se extrae del pedido — merece su
  propia versión con sus propios tests.

### 4 · Audio/TTS: los números exactos de la especificación

* Volumen ambiente de arranque: **0.15** (la spec textual de Mario: «0.15 en
  lugar de 0.35»), con el techo maestro del **45 %** ya vigente desde v1.70.2.
* Etiquetas de motor en el selector: `· local/SAPI` (voces Microsoft locales
  de Windows — las que obedecen el tono), `· local` (otros motores nativos) y
  `· nube` (Google: fijan su propio tono). Carteles, ninguno.

### Verificación

`npm run validar` completo + `tsc --noEmit` sobre el árbol final — el veredicto
se transcribe en el informe de entrega. Las suites vivas de esta versión:
`fusibleGemini` (exponencial), `grupo`/`espejos` (nota con y sin tarea —
retrocompatibles), `androidProyecto`/`bajoConsumo` (trinquete con aire),
`motor-datos`/`techoContexto` (semilla 1.70.3 sincronizada).

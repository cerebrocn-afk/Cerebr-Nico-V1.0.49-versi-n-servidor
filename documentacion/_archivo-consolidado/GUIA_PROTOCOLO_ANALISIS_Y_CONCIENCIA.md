# Guía de mejores prácticas — Protocolo de análisis y Conciencia en tiempo real

> **Qué es esto.** El motor de CerebroNico ya no deja que el modelo escriba a lo
> loco: le inyecta, en cada turno, (1) un **protocolo de análisis previo** y
> (2) un bloque de **conciencia en tiempo real** con el estado vivo del turno.
> Esta guía explica el porqué, el cómo y las reglas para que el agente «analice
> antes de hacer cagadas». Vive en el motor (no en la cabeza del modelo), así que
> funciona igual con GLM, Gemini o un modelo pequeño.

---

## 1. El bucle: de «cartel fijo» a «conciencia viva»

Un protocolo de análisis clásico se responde **una vez** al empezar y se olvida.
El problema real aparece a mitad de tarea: el modelo repite un paso que ya hizo,
da por bueno un archivo que no leyó, o reintenta la misma llamada que ya falló.

La solución es un **bucle**: las mismas 5 preguntas, pero re-respondidas en
**cada paso** con el estado real del turno.

```
   ┌────────────────┐
   │  1. ¿DÓNDE ESTOY?  │ ◀──────┐
   └───────┬───────┘        │
           ▼                 │
   2. ¿QUÉ CAMBIÓ?            │  el ESTADO VIVO
           ▼                 │  realimenta el bucle
   3. ¿QUÉ PUEDO hacer?       │  en cada paso
           ▼                 │
   4. PRÓXIMO PASO MÍNIMO     │
           ▼                 │
   5. ¿CÓMO lo VERIFICO? ─────┘
```

---

## 2. Las 5 preguntas (el contrato)

1. **¿DÓNDE ESTOY?** — Objetivo del turno + qué pasos ya di y cómo fueron. No
   repitas una acción ya hecha ni asumas un archivo que no leíste este turno.
2. **¿QUÉ CAMBIÓ por mi última acción?** — Si una herramienta falló, **lee el
   error antes de reintentar**. No repitas la misma llamada esperando otro
   resultado.
3. **¿QUÉ PUEDO hacer realmente ahora?** — Mira tus herramientas y tus límites
   reales. Sin control de PC o sin red, no prometas lo que no puedes: di qué
   activar.
4. **¿CUÁL es el próximo paso MÍNIMO útil?** — Uno, pequeño y verificable. Nada
   de saltos grandes a ciegas.
5. **¿CÓMO verifico que salió bien?** — Define la comprobación **antes** de
   actuar (releer, compilar, abrir el preview). Si no puedes verificar, dilo.

> **Regla de oro:** si el estado real contradice tu plan, **gana el estado
> real**. Ajusta el plan, no inventes la realidad.

---

## 3. Mejores prácticas por fase

### 3.1 MIRAR antes de tocar
- Nunca supongas el contenido de un archivo: `list_files` para ubicarlo,
  `read_file` / `read_file_range` para leer **solo el tramo** que vas a cambiar.
- Un archivo leído **este turno** es un hecho; uno recordado de hace rato puede
  estar desactualizado.
- Antes de crear algo que quizá ya existe, busçalo (`search_in_files`).

### 3.2 PLANIFICAR pequeño
- Tareas de >2 pasos → `set_plan` con tareas cortas (id + descripción
  accionable). Avanza de una en una y marca cada tarea al terminar.
- No anuncies un plan gigante para luego abandonarlo: pásalo por el espejo vivo
  para que quede en el estado del turno.

### 3.3 Medir el RIESGO (reversible vs irreversible)
| Tipo | Ejemplos | Cómo actuar |
|---|---|---|
| **Reversible** | crear, editar un tramo, borrar un elemento con deshacer | Hazlo y ofrece volver atrás |
| **Irreversible / impacto amplio** | vaciar todo, borrado masivo, reescribir un archivo entero, config de producción | **Avisa y confirma antes** |

- Prefiere `edit_file` a reescribir entero. Prefiere mover a borrar.
- En la **UI**: modal de confirmación **solo** para lo grave; para lo reversible,
  un *toast con Deshacer* (no abuses del modal — ver `ejemplos/flujo-confirmacion-modal.html`).

### 3.4 VERIFICAR y reconciliar
- Tras actuar: relee lo escrito, compila o abre el preview en `:3500`.
- Si una herramienta falló: lee el error, entiende la causa, cambia el enfoque.
- Si no pudiste verificar, dilo claro: *«aplicado, sin verificar»*.

---

## 4. Cómo lo implementa el motor

Todo se arma en el **punto único multi-proveedor** (`/api/ai/stream`), después
del manual de herramientas, así que **cualquier** conductor (GLM, Gemini,…)
recibe lo mismo:

| Pieza | Archivo | Qué inyecta | Cuándo |
|---|---|---|---|
| `PROTOCOLO_ANALISIS` | `src/engine/recetarioUI.ts` | las 5 preguntas (versión fija) | modelos con herramientas |
| `buildConcienciaTiempoReal()` | `src/engine/conciencia.ts` | **estado vivo**: objetivo, pasos ya dados (✔/✖), recuento del plan, capacidades reales (PC/red), retrato del proyecto | modelos con herramientas, cada turno |
| `CONCIENCIA_KB_ENTRIES` | `src/engine/conciencia.ts` | buenas prácticas como KB consultable | se siembran en `SEMILLA_COMPLETA` |
| `proc-analisis-previo`, `proc-ui-variada` | `src/engine/manuals.ts` | procedimientos | recuperables por palabra clave |

**Presupuesto por modelo.** La parte dinámica se recorta: ~600 car. en nube
rápida (flash/lite), ~1000 en modelo grande. Los modelos *micro/tiny* no
reciben estos bloques (no ejecutan herramientas y no caben).

El **estado vivo** sale del *espejo vivo* (`espejoVivo.ts`, vía
`hojaVivaParaPanel()`): objetivo del turno, pasos/herramientas ya ejecutados con
su resultado, y el recuento del plan (hechas / fallidas / sin hacer).

---

## 5. Ejemplo de bloque inyectado (lo que ve el modelo)

```
[CONCIENCIA EN TIEMPO REAL — recálcula esto en CADA paso, no solo al empezar]
1) ¿DÓNDE ESTOY? ...
...
Si el estado real contradice tu plan, GANA el estado real.

[ESTADO VIVO DEL TURNO]
• Objetivo del turno: añadir pantalla de ajustes con control de volumen
• Pasos ya dados este turno (3): ✔ list_files | ✔ read_file src/App.tsx | ✖ edit_file ajustes.tsx
• Plan vivo: 2 hechas, 1 fallidas, 2 sin hacer.
• Capacidades ahora: modelo glm-4.7-flash (zai) · control de PC: NO · red: sí.
• ÚLTIMO ERROR a tener en cuenta: edit_file: no se encontró el ancla «export default»
```

Con esto el modelo **sabe** que su última edición falló por un ancla mal puesta
y no vuelve a lanzar la misma llamada: primero relee el archivo.

---

## 6. Antipatrones (lo que ya NO debe pasar)

- ❌ Reescribir un archivo entero «por si acaso» en vez de editar el tramo.
- ❌ Reintentar la misma herramienta tres veces sin leer el error.
- ❌ Prometer «descargo e instalo» cuando no hay red o no hay control de PC.
- ❌ Abrir un modal de confirmación para cada clic (fatiga de confirmación).
- ❌ Dar por hecho un archivo que no se leyó en el turno actual.
- ❌ Entregar siempre la misma plantilla sin adaptarla al pedido.

---

*CerebroNico v1.47.2 — el conocimiento vive en el motor, no en el modelo.*

# Plan de mitigación del techo de contexto (v1.66.0)

> Pedido del usuario (2/4): el contexto está «al límite»; hace falta un plan de
> mitigación del techo. Este documento inventaria lo que YA existe en el motor,
> diagnostica dónde se gasta la ventana, y propone un plan por fases — sin tocar
> el contrato de rutas ni engordar `server.ts`.

## 0. TL;DR

El techo tiene dos caras que se confunden: (a) la **RAM/KV-cache** que cuesta la
ventana que se pide a Ollama (ya gestionada por `techoContexto.ts`), y (b) los
**tokens de conversación** que se acumulan turno a turno hasta rozar el límite del
modelo (gestionada parcialmente por `compactor.ts` + `motorContexto.ts`). El plan
ataca (b), que es el «al límite» reportado, apoyándose en piezas que ya existen.

## 1. Qué YA hay en el motor (inventario)

| Módulo | Rol frente al techo |
|---|---|
| `techoContexto.ts` | Convierte «qué `num_ctx` se pide» en «cuánta RAM vale» y recorta a lo pagable (KV-cache). Fórmula GGUF exacta con arquitectura; cota conservadora si no la hay. **Cara (a).** |
| `compactor.ts` | Compacta salidas de herramientas (`file`/`command`/`search`/`json`/`text`) antes de reinyectarlas. Evita volcar 328 KB de un `read_file`. **Cara (b).** |
| `motorContexto.ts` | Ensambla el contexto del proyecto por capas con techos por nivel (`TECHOS_NIVEL`) y `LIMITE_CONTEXTO_CARACTERES=6000`; recorta y reporta el recorte. **Cara (b).** |
| `repeticionLectura.ts` (v1.63) | Deduplica relecturas idénticas: no reinyecta el mismo volcado dos veces. **Cara (b).** |
| `contextoBucle.ts` (v1.64/65) | Corta el ciclo que repite y re-llena contexto sin avanzar. **Cara (b).** |

**Conclusión:** la cara (a) está resuelta. La cara (b) tiene buenas piezas pero
les falta un **presupuesto de ventana** único que las coordine y una **poda de
historial** cuando la conversación (no una sola salida) se acerca al límite.

## 2. Dónde se gasta la ventana (diagnóstico)

1. **Salidas de herramientas enormes** — `read_file` de archivos grandes, `list`
   de árboles, JSON de estado. Mitigado por `compactor.ts` **por salida**, pero
   no hay tope **acumulado** por turno.
2. **Historial que crece** — cada turno agrega su par usuario/asistente + los
   resultados de herramientas. Tras muchos turnos, el prefijo pesa más que la
   tarea actual. No hay poda de mensajes viejos.
3. **Contexto de proyecto reinyectado** — `motorContexto` lo recorta a 6000
   chars, pero se reenvía en cada turno; en tareas largas es coste fijo repetido.
4. **Volcados crudos** — cuando un parser falla (ver BUG A de v1.66.0) el turno
   se vuelca entero. Ya mitigado, pero es un sumidero clásico.

## 3. Plan por fases

### Fase 1 — Presupuesto de ventana único (módulo PURO nuevo propuesto)

`presupuestoVentana.ts`: dado `num_ctx` efectivo (el que dejó `techoContexto`),
reparte un **presupuesto en tokens** entre: system prompt, contexto de proyecto,
historial y salidas de herramientas del turno. Expone
`cabeEnVentana(piezas, numCtx)` y `recortarAlPresupuesto(piezas)` que decide qué
comprimir primero (salidas > historial viejo > contexto de proyecto), con el
motivo por escrito. Puro, testeable, sin red/fs. **No existe aún.**

### Fase 2 — Poda de historial con resumen (apoyada en `compactor`)

Cuando el historial supere su parte del presupuesto, resumir los turnos más
viejos (no los 2-3 últimos) en una nota compacta — reusando la lógica de
`compactToolResult` y el patrón de `motorContexto.resumenRecorteContexto`. Se
conserva: objetivo de la tarea, decisiones tomadas, archivos tocados. Se descarta
el detalle redundante. Clave: la poda debe ser **determinista y reversible en
log** (se anota qué se podo).

### Fase 3 — Tope acumulado de salidas por turno

Hoy `compactor` comprime cada salida por separado. Añadir un **acumulador por
turno**: si la suma de salidas ya compactadas supera su cuota, las siguientes se
compactan más agresivo o se sustituyen por «N resultados más, omitidos». Evita el
caso de 10 lecturas medianas que juntas revientan la ventana.

### Fase 4 — Señal visible de «ventana al 80 %»

Un aviso (como el de `contextoBucle`) que, al cruzar el 80 % del presupuesto,
inyecte al modelo: «la ventana está casi llena; cierra la tarea actual o pide
confirmación para compactar» — en vez de dejar que el truncado silencioso del
proveedor corte a mitad de una herramienta.

## 4. Qué NO hacer (trinquete)

- No cambiar el contrato de rutas ni meter esta lógica dentro de `server.ts`:
  todo va en módulos PUROS que el handler cablea con una llamada.
- No subir `num_ctx` para «ganar espacio»: eso lo paga la KV-cache en RAM y es
  justo lo que `techoContexto` recorta. Más ventana ≠ gratis.
- No podar los últimos turnos ni el objetivo de la tarea: la poda es de cola
  vieja, con resumen, nunca de la intención activa.

## 5. Prioridad sugerida

1. **Fase 1** (presupuesto único) — es el coordinador que hoy falta; sin él las
   otras fases no saben contra qué límite recortar.
2. **Fase 3** (tope acumulado) — barato, ataca el sumidero más común.
3. **Fase 2** (poda con resumen) — mayor impacto en sesiones largas, más trabajo.
4. **Fase 4** (señal 80 %) — pulido de UX, encaja con la línea de avisos visibles.

## 6. Estado en v1.66.0

Este documento es el **plan**. v1.66.0 entrega los arreglos de completitud,
disciplina de chat y continuidad de turno (pedidos 1 y 3). Las Fases 1-4 del
techo quedan especificadas aquí para implementarse como módulos PUROS con sus
tests sembrados, siguiendo la misma convención de la casa, en una próxima vuelta.

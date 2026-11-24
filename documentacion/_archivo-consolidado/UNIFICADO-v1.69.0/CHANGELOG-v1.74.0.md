# v1.74.0 · 2026-10-26 · EL CEREBRO ESCRIBE EN TINTA: AUTOAPRENDIZAJE EN TIEMPO REAL

Pedido: *«algo que nunca ha funcionado bien es el autoaprendizaje. Evolucionalo
a tiempo real, cuando aprenda algo que lo inyecte automaticamente a md para
aplicarlo luego»*.

## Medición del por-qué-nunca-funcionó (antes de tocar)

1. El motor sí aprendía de los fallos — pero **solo a la base interna**
   (`.cerebro-db/kb.json`): ningún `.md` lo reflejaba y el usuario no lo veía
   aplicado nunca.
2. `MEMORIA.md`/`skills.md` se inyectaban **«en el turno 1»**: una lección
   aprendida a mitad de sesión no regía hasta la próxima conversación. Aprender
   sin aplicar después es un diario íntimo, no aprendizaje.
3. Las correcciones del usuario («así no», «ya te lo dije») se evaporaban.
4. El éxito que llegaba DESPUÉS del fallo (la pareja causa→solución, que es la
   lección de verdad) no quedaba en ningún lado: el contador
   `fallosPorHerramienta` solo se reseteaba.

## La suite nueva: `server/aprendizajeVivo.ts` (314 líneas, fuera del monolito)

**Aprende AL INSTANTE de tres hechos, sin costo de LLM (patrones y hechos, no
prom):**
- **Fallo → éxito**: la misma herramienta falló N veces y después funcionó con
  argumentos distintos → se anota la PAREJA concreta («falló con X, resolvió
  con Y»), cableada en los dos lazos: local (`server.ts`) y nube
  (`cicloOpenAICompat.ts`, dentro de la suite en `espejarEnPlanificador`).
- **Corrección del usuario**: patrones conservadores (`así no`, `ya te lo dije`,
  `acordate que`, `más nunca`, `cuántas veces`…) capturan la FRASE TEXTUAL del
  usuario como lección (interpretar es inventar).
- **Enseñanza explícita**: `POST /api/aprender` + espejos de `cerebro_recordar`
  y `/api/engine/kb/learn`.

**Lo escribe en MD al instante**: `LECCIONES.md` en la raíz del proyecto
(`- **L#N** · fecha · fuente · título → texto`). Visible, editable a mano —
borrar una línea ES borrar la memoria. Techo honesto de 60 KB: se van las más
viejas.

**Lo inyecta en CADA turno ulterior** (el «aplicarlo luego»): las últimas 12
lecciones (≤1.400 car.) entran al system prompt en el punto único que comparten
TODOS los proveedores. Una lección a las 20:41 rige en el turno de las 20:42.

**Deduplica por firma** (hash normalizado persistido en
`.cerebro-db/lecciones-firmas.json`, tope 500): la lección repetida se
RECONFIRMA (`×N`), no se duplica. Un hecho que se repite merece peso, no ruido.

**Lo hace visible**: cada lección nueva pasa por el espejo vivo → la barra de
Tareas muestra `LECCIÓN L#N (fuente): título` en el momento exacto en que el
motor aprendió — que era justo lo que nunca se veía.

## server.ts (trinquete)

+43 líneas, todas de CABLEO (import, init con callbacks, 2 hooks de lazo,
corrección+inyección en el punto único, 2 espejos de rutas existentes). Ninguna
línea de lógica nueva: `12.102 ≤ 12.187` de presupuesto. Rutas nuevas: 2
(`POST /api/aprender`, `GET /api/aprender/estado`) → contrato regenerado a
**156 rutas**.

## Verificación

- `tsc --noEmit`: exit 0.
- **Smoke del suite** (raíz temporal, fuera del árbol): 13/13 — nueva,
  duplicada→reconfirmada ×2 sin duplicar, pareja fallo→éxito aprendida, éxito
  sin dolor previo NO aprende, corrección detectada, frase neutra NO detecta,
  3 avisos en vivo, 3 KB-upserts, MD contiene las tres entradas, bloque
  inyectable dentro del presupuesto, estado coherente.
- `npm run validar`: corrida completa de la entrega (ver veredicto abajo).

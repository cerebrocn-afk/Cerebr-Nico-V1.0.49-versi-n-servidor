---
name: cerebronico-rendimiento
description: Perfilar y optimizar rendimiento — medir antes y después, atacar el cuello de botella real, no el imaginado. Leer antes de "optimizar" código o cuando algo va lento.
user_invocable: true
---

# Rendimiento (medir, no adivinar)

Optimizar sin medir es superstición. Toda mejora de rendimiento empieza con un
número antes y termina con un número después; si no mejoró el número, no mejoró.

## Protocolo

1. **Medir la línea base**: tiempo, memoria o RAM/CPU real del caso lento. Usa el
   perfilador (o `console.time`, `performance.now`, medición de RSS) sobre datos
   representativos, no de juguete.
2. **Localizar el cuello de botella**: el 80% del tiempo suele estar en el 20%
   del código. Ataca ese punto; el resto es ruido.
3. **Un cambio, una medida**: aplica una optimización y vuelve a medir. Cambios
   en lote impiden saber cuál ayudó (o empeoró).
4. **Verificar que no rompiste nada**: la versión rápida debe dar el MISMO
   resultado. `npm run validar` + tests siguen en verde.
5. **Reportar honesto**: "de X ms a Y ms sobre N elementos", con el método de
   medida. Nada de "ahora es más rápido" sin cifra.

## Palancas por orden de impacto

- **Algoritmo/estructura**: O(n²)→O(n log n), índice/mapa en vez de búsqueda
  lineal. Casi siempre gana más que microoptimizar.
- **Trabajo evitado**: memoizar, cachear (con invalidación honesta), no recalcular
  lo que no cambió, cargar bajo demanda (lazy).
- **I/O y red**: lotear peticiones, streaming en vez de cargar todo en memoria,
  paginar. En este repo, mira `inferenceBuffer` y el modo bajo consumo.
- **Concurrencia**: paraleliza lo independiente; no bloquees el hilo principal.

## Trampas

- **Optimización prematura**: no compliques código por ganancias que nadie medirá.
- **Micro-benchmarks engañosos**: el JIT y la caché mienten en bucles vacíos;
  mide sobre carga real.
- **Memoria vs. velocidad**: cachear cambia RAM por CPU — di el trade-off, no lo
  escondas. En hardware modesto (modelos 1.5B/3B) la RAM manda.

## Analizador estático integrado (`src/engine/rendimiento.ts`)

El motor trae un escáner determinista de **16 reglas** — el gemelo de
`cerradura.ts`, pero para VELOCIDAD y MEMORIA en vez de seguridad. Entra texto,
salen pistas con archivo, línea, categoría y cómo mejorar. API:

- `analizarCodigo(archivo, codigo)` / `analizarProyecto([{path, content}])`
- `contarHallazgos(hallazgos)` → conteo por severidad y por categoría
- `informeRendimiento(hallazgos)` → informe legible y acotado

Qué caza (por categoría): **algoritmo** (`forEach` async, O(n²) por buscar dentro
de un recorrido, spread del acumulador en `reduce`, `iterrows`), **io** (`await`
en serie dentro de un bucle, I/O síncrono de Node, `SELECT *`, `LIKE '%x'`),
**memoria** (clon por `JSON.parse(JSON.stringify)`), **bundle** (import completo
de lodash/moment) y **micro** (`.length` recomputada en `for`, `setInterval`
agresivo, `range(len(...))`, `.apply(axis=1)`).

La regla de oro de esta skill está CABLEADA en el código: el análisis estático
**NUNCA bloquea** la tanda (`resumen.bloquea` es siempre `false`). Son PISTAS,
no medidas — la verdad la sigue dando un número antes/después. Por eso puede
correr en el acta de cierre junto a la CERRADURA sin frenar entregas por sospecha.

Suite: `tests/rendimiento.test.ts` (48 comprobaciones, cada regla con su caso
positivo y su «no debe marcar»). Corre con `npm run validar` (descubrimiento
dinámico) o `npx tsx tests/rendimiento.test.ts`.


# Resumen ejecutivo — Arquitectura de la «.con-ciencia»

> CerebroNico IDE · v1.48.0 · una página para decidir, el diseño completo en
> `DISENO_CONCIENCIA.md`.

## El problema

Un modelo pequeño, en una máquina de 8 GB, no puede «recordar» cargando un
documento de memoria entero en cada turno: llena la ventana de contexto y, en la
práctica, es la diferencia entre responder y colgarse. Hacía falta una memoria
de largo plazo que **no se lea completa**, sino que lleve al dato exacto.

## La solución en una frase

La `.con-ciencia` es un **órgano de redirección**: una base de datos local
pequeña que, ante una consulta, decide *qué* trozos de conocimiento abrir y abre
solo esos —nunca todo el cerebro.

## Cómo funciona (tres verbos)

| Verbo | Qué hace | Coste |
|---|---|---|
| **Enrutar** | Puntúa la consulta contra un índice (tema > título > cuerpo) y devuelve solo las entradas que ganan. No abre archivos. | Barato: trabaja sobre el índice en memoria. |
| **Aprender** | Cuando el agente cierra algo útil, escribe una entrada y extrae sus palabras clave solo. El cerebro se auto-indexa. | Una escritura atómica. |
| **Inyectar** | Abre únicamente las entradas ganadoras, las recorta a un presupuesto y las mete en el prompt. Si nada enruta, no gasta ni un token. | Acotado por presupuesto. |

## Qué aporta cada pieza

- **Base de datos, no un `.md` gigante.** `cerebro/indice.json` (la tabla de
  ruteo) + `cerebro/temas/*.md` (un archivo por entrada) + `CEREBRO.md` (cara
  humana legible). Solo el índice se lee para decidir.
- **Indexación en tiempo real (v1.48.0).** El índice se cachea en memoria y se
  valida con un `stat` barato (fecha + tamaño). Si no cambió, se sirve la copia
  (cero lectura/parseo); si cambió, se recarga al instante. Aprender se refleja
  en la siguiente consulta sin reiniciar.
- **Ligado al agente.** Herramientas `cerebro_recordar` y `cerebro_consultar`;
  el contexto enrutado se inyecta en cada turno de `/api/ai/stream`.
- **El agente abre el previsualizador a voluntad.** `abrir_previsualizador`
  emite una señal desde un punto común a todos los proveedores; la interfaz abre
  el editor web, arranca el sandbox y refresca la vista.

## Garantías de ingeniería

- **Puro y sin dependencias nuevas** (`fs`/`path`/`crypto`), cero red, cero
  Ollama.
- **Escritura atómica** (tmp + rename): un corte de luz no deja el índice a
  medias.
- **Aditivo y no destructivo**: cerebro vacío → todo responde vacío. No mueve ni
  toca archivos de la raíz referenciados por los tests (contrato de superficie
  intacto).
- **Verificable**: suite dedicada `tests/concienciaCache.test.ts` (corre con
  `npm run validar`).

## Riesgo residual y línea de evolución

El ruteo es léxico (solapamiento de palabras), no semántico puro: dos términos
sinónimos no se cruzan por sí solos. Es una decisión deliberada (cero coste,
cero dependencias). La evolución natural —si alguna vez hace falta— sería añadir
sinónimos/stemming ligero y, más adelante, embeddings locales; el
`ANALISIS_CUELLOS_INDEXADOR.md` detalla cuándo valdría la pena y cuándo no.

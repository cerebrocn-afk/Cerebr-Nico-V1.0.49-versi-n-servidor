# Análisis de cuellos de botella — el indexador de la .con-ciencia

> CerebroNico IDE · v1.48.0 · `src/engine/cerebroOrgano.ts`
> Método: lectura del código real (sin red ni build en este entorno). Las cifras
> de «crecimiento» son órdenes de magnitud, no mediciones; abajo se indica cómo
> medir cada punto en el equipo.

## Resumen

El indexador está **sano para el tamaño esperado** (decenas a pocos cientos de
entradas): el camino caliente ya no re-parsea el disco (caché v1.48.0) y el
ruteo trabaja en memoria. Los cuellos que siguen son **lineales con el número de
entradas (N)** y solo empiezan a notarse con un cerebro grande o con aprendizaje
muy frecuente. Ninguno es crítico hoy. Se listan por impacto para no «optimizar
a ciegas».

## Mapa de severidad

| # | Cuello | Dónde | Crece con | Impacto hoy |
|---|---|---|---|---|
| 1 | Re-normalización de tema/título en cada consulta | `puntuar()` | N×consultas | **Medio** |
| 2 | Escaneo lineal completo al enrutar (sin índice invertido) | `enrutar()` | N | Bajo-Medio |
| 3 | Reescritura del índice entero en cada aprendizaje | `guardarIndice()` | N×aprendizajes | Bajo-Medio |
| 4 | Clon del índice en cada carga (incluido golpe de caché) | `clonarIndice()` | N×consultas | Bajo |
| 5 | Lectura síncrona de archivos al inyectar | `leerEntrada()` | 1–4 archivos | Bajo |
| 6 | `statSync` por consulta | `cargarIndice()` | consultas | Muy bajo |
| 7 | `estadoCerebro` recorre y hace stat de cada archivo | `estadoCerebro()` | ficheros | Muy bajo (solo en reportes) |

---

## Detalle y recomendación

### 1. Re-normalización de tema/título en cada consulta  — **el más rentable de atacar**
`puntuar()` hace, para CADA entrada y en CADA consulta:
`new Set(normalizar(entrada.titulo))` y `new Set(normalizar(entrada.tema))`.
`normalizar()` corre un `.normalize("NFD")` + varias regex. Es decir: con N
entradas pagas N normalizaciones de título + N de tema por consulta, cuando esos
valores **no cambian entre consultas**.

- **Coste**: O(N) normalizaciones (regex + NFD) por consulta. Con N pequeño es
  invisible; con N en los miles y varias consultas por turno, es el primer gasto
  que se vería en un perfil.
- **Arreglo recomendado (barato y no disruptivo)**: precomputar y **guardar en
  la entrada** los tokens normalizados de tema y título al aprender
  (`palabrasTitulo`, `palabrasTema`), igual que ya se guarda `palabras`. En
  `puntuar()` se leerían directo, sin normalizar nada. Es aditivo: si faltan
  (entradas viejas), se cae a `normalizar()` como ahora.
- **Medir en el equipo**: `console.time`/`performance.now()` alrededor de
  `enrutar()` con un índice sembrado de ~2.000 entradas.

### 2. Escaneo lineal al enrutar (sin índice invertido)
`enrutar()` recorre las N entradas y puntúa todas, aunque la consulta solo toque
a unas pocas.

- **Coste**: O(N·M) con M = tokens de la consulta.
- **Cuándo importa**: a partir de varios miles de entradas.
- **Arreglo (cuando haga falta)**: un **índice invertido** palabra→entradas,
  construido junto al caché. El enrutado solo tocaría las entradas candidatas
  (las que comparten alguna palabra con la consulta). Convierte O(N) en
  ~O(candidatas). No vale la pena hoy: añade complejidad y memoria para un N que
  aún no existe.

### 3. Reescritura del índice entero en cada aprendizaje
`guardarIndice()` serializa TODO `indice.json` y regenera `CEREBRO.md` completo
en cada `aprender()`.

- **Coste**: O(N) de serialización + O(N log N) por el `sort` de `renderCerebroMd`.
- **Cuándo importa**: si el agente aprende muchas veces seguidas con un cerebro
  grande.
- **Mitigaciones posibles**: (a) regenerar `CEREBRO.md` de forma perezosa o a
  intervalos, no en cada escritura (ya es un «extra» envuelto en try/catch);
  (b) más adelante, un almacén append-only para el cuerpo. La escritura atómica
  del índice debe conservarse: es la que protege de un apagón.

### 4. Clon del índice en cada carga — **tradeoff introducido por el caché**
El caché v1.48.0 evita el `JSON.parse`, pero `cargarIndice()` entrega un **clon**
(`clonarIndice`) para que nadie mute la copia compartida. Ese clon recorre las N
entradas y copia sus arrays `palabras` en CADA carga, incluso en un golpe de
caché.

- **Honestidad**: el caché cambia «parsear+leer» por «clonar». El clon es mucho
  más barato que el parseo, pero no es gratis con N grande.
- **Opción futura**: entregar un objeto **de solo lectura** (congelado) y que
  los llamadores no muten, evitando el clon. Hoy el clon es la opción segura y
  su coste es bajo frente al parseo que elimina.

### 5. Lectura síncrona al inyectar
`buildCerebroContext()` llama a `leerEntrada()` (que hace `readFileSync`) por
cada entrada ganadora (máx. 4). Es I/O síncrono en el camino de la petición:
bloquea el event loop mientras lee.

- **Impacto**: bajo (4 archivos pequeños, recortados al presupuesto).
- **Si se quisiera pulir**: versión `async` con `fs.promises` para no bloquear.
  No urge; mantiene el módulo simple y síncrono como el resto del motor.

### 6. `statSync` por consulta
El caché hace un `fs.statSync` por carga para validar frescura. Es un syscall
muy barato, pero es el precio del «tiempo real» (detectar ediciones externas).
Si alguna vez molestara, se podría cachear el stat con una ventana de pocos ms;
no merece la pena ahora.

### 7. `estadoCerebro` recorre el directorio
Hace `readdirSync` + `statSync` por archivo para sumar bytes. Solo se usa en
reportes (`/estado`, logs), no en el camino caliente. Dejar como está.

---

## Veredicto y orden sugerido

1. **Si llega a hacer falta optimizar, empezar por el #1** (precomputar tokens
   de tema/título): es el de mejor relación beneficio/riesgo y es puramente
   aditivo.
2. **#2 (índice invertido) y #4 (evitar clon)** solo cuando el cerebro pase de
   varios miles de entradas y un perfil lo confirme.
3. **No tocar** #5–#7 salvo evidencia de medición: añadirían complejidad sin
   beneficio real al tamaño actual.

**Regla de oro**: medir antes de optimizar. Todos los puntos anteriores son
lineales y hoy están por debajo del umbral perceptible; el caché v1.48.0 ya
quitó el único coste que crecía en el camino más transitado (el re-parseo).

# CHANGELOG · v1.67.0 — LA VALLA Y EL ESTÁNDAR DE ACCIÓN

Ejecución de la `HOJA_DE_RUTA-HUERFANOS-v1.67` con el criterio pedido:
**simplificar la evolución, menos es más**. Ningún módulo nuevo de producción:
se jubila uno, se fusiona uno, se cablea uno y el resto se **decide y se nombra**.
Y se cierra la causa de «unos modelos sí y otros no saben usar el motor».

---

## Prioridad 0 · LA VALLA (ítems 0.1, 0.2 y 0.3)

**`scripts/lib-cableado.mjs` descubre el árbol; `FASES` pasa a ser etiqueta.**
El instrumento miraba 19 módulos de 275 durante doce versiones e informó
«11 HUÉRFANO» mientras la plaga real llegaba a 27. Ahora camina `src/` + `server/`
y resuelve el grafo de imports a ruta concreta (mismo censo que
`escanear_huerfanos.py`: **275 módulos / 27 huérfanos** al arrancar).

**`tests/presupuestoHuerfanos.test.mjs` — el trinquete (104 correctas).**
Es el patrón de `server_lineas`, que funciona porque **sí bloquea**. Verificado por
sabotaje, en las dos direcciones:

| Prueba | Resultado |
|---|---|
| Sembrar un huérfano nuevo | ✗ 2 fallos, `exit 1` |
| Cablear uno perdonado y no borrar su fila | ✗ exige borrarla, `exit 1` |
| Estado limpio | ✓ 104 correctas · 0 fallidas |

Incluye **control de falso positivo con fixture**: `import "./x"` de puro efecto
cuenta como cable (el punto ciego que hizo creer muerta toda la carpeta
`extensiones/`) y suelo de censo ≥ 250 para que un descubrimiento roto no se
disfrace de deuda pagada.

**Ítem 0.2, medido y no prometido.** «Importado ≠ usado» ya se calcula por export
de valor. La primera versión marcaba **248 falsos positivos** porque comparaba el
import *con* extensión y los especificadores del proyecto van sin ella; corregido,
queda **1 caso real** (`src/engine/extensiones/index.ts`, efecto puro) y por eso
se **informa** en vez de bloquear.

**Ítem 0.3.** Regla de la casa en el encabezado del módulo: un módulo nuevo que no
está cableado en su commit no entra, o entra con su fila, su motivo y su versión.

## Huérfanos: 27 → 24 (8,8 %), los 24 nombrados

| Acción | Módulo | Por qué |
|---|---|---|
| **JUBILADO** | `dobleArbol.ts` | Único huérfano total. El concepto vive en `gestorArboles` (cableado). Copia en `_jubilar-v1.67.0/` |
| **CABLEADO** | `plantillaDefecto` | Gate B4 de `server/cicloOpenAICompat.ts`, sólo sobre documentos HTML del creador web. El defecto «me entregas la web en plantilla» tenía el arreglo escrito y probado desde v1.66.0 |
| **FUNDIDO** | `jsonParcial` → `parsearArgsConEstado` | Recupera el JSON **completo pero mal formado** (coma colgante, clave a medias). **No** repara el truncado: reconstruir el `}` de un `write_file` a medias es escribir un archivo truncado y cantarlo hecho |

Las 24 restantes están en `PERMITIDOS_HUERFANOS` **una por una, con motivo y
destino** (v1.68 / v1.69). No es aplazar: es decidir, que es lo que la hoja de ruta
pide. Entre ellas `disciplinaChat`, última a propósito — necesita contrato de UI
nuevo, y sin destino real para los bloques cablearlo sería **esconder código que el
usuario pidió ver**.

---

## El estándar de acción (tu observación de arquitectura)

> «La interfaz no solo debe ser a gusto del usuario: las IAs también tienen su
> propia forma de interpretar. La clave está en escribir en standard.»

**Era cableado, y eran dos defectos:**

1. **Alimentación.** `getToolsForModel` devuelve `[]` si el perfil no es
   `toolCapable`, y el manual se inyectaba detrás de `if (herramientasV8.length > 0)`.
   Las **leyes viajan dentro del manual**: el modelo que actúa escribiendo la
   llamada en el texto no recibía ni manual ni leyes — incluida la que dice «si un
   nombre no está en el manual, esa herramienta NO existe». Y sin embargo el motor
   **sí** le ejecuta el texto (`extraerLlamadasEnTexto`, seis formas). Se le exigía
   actuar y no se le dijo ni el nombre ni las claves. La docencia llegaba en
   `construirDirectivaResultadosTextuales`: **después** de fallar.

2. **Coherencia.** El motor acepta seis formas y alias en español, pero **no enseña
   ninguna**. Seis formas posibles y ninguna dicha por delante es, literalmente,
   «cada IA interpreta a su manera».

**`CONTRATO_DE_ACCIÓN` + `buildContratoDeAccion()`** (`src/engine/manuals.ts`):
un solo estándar, **byte a byte idéntico** entre zai/groq/openrouter/custom. Sólo
cambia una línea de transporte (canal nativo / canal de texto), y **no se inyecta
nada** donde el turno no puede actuar (`ollama`/`gemini` sin tools): allí manda
`guardaSinHerramientas()`, y dos órdenes contradictorias en el mismo system prompt
es justo lo que produce modelos que dudan de todo.

**`tests/contratoAccion.test.ts` (56 correctas)** — la aserción dura es el **viaje
de ida y vuelta**: cada formato que el contrato enseña se parsea de verdad contra
`extraerLlamadasEnTexto` y sus claves llegan intactas. Un manual desincronizado de
su parser es peor que ningún manual. Ningún nombre ni alias prometido es un
fantasma (verificado contra `ALIAS_NOMBRE_HERRAMIENTA` y `normalizarArgsAlias`).

**Suelo del estándar (1450) y techo duro.** El presupuesto de 800 de la nube rápida
se dimensionó para el manual viejo. Aplicárselo al contrato cortaba la **cláusula 4**
(«si no recibiste resultado, NO la hiciste») a mitad de frase: justamente la que
impide el «✔ creado» inventado. Recortar la cláusula anti-mentira para ahorrar 600
caracteres (~200 tokens sobre una ventana de 220 000) es un cambio perdedor. Lo que
flexiona es el **inventario**, con aviso completo y nunca silencioso.

**Causa raíz de un desbordamiento que yo mismo introduje:** el acumulado del
inventario sumaba `texto.length + "\n"` — mezcla de número y string que hacía la
comparación inservible y llenaba sin parar (medido: 3349 caracteres con techo 1900).
Corregido el aritmético **y** dejado el corte de seguridad.

---

## Mistral: «ese modelo debería saber usar esas herramientas»

Medido, no supuesto. `devstral-small-latest` y `codestral-latest` — los dos modelos
más agénticos de Mistral, ambos con function-calling nativo — daban
`toolCapable=false` porque la allowlist casaba la subcadena literal **`mistral`**, y
«co-de-stral» / «de-v-stral» no la contienen. La cadena es la del comentario de
v1.44.0: `toolCapable=false` → `getToolsForModel()=[]` → **cero herramientas**, cero
manual y bucle «hazlo / no puedo». **No era el modelo: era una expresión regular
que no lo conocía.** Añadidos `devstral | codestral | magistral | voxtral`.

Comprobado además que la oferta **sí** es simétrica: las nueve ramas OpenAI-compat
pasan `herramientas` y `nombresHerramientas`. La asimetría estaba en la **docencia**
y en la **clasificación por nombre**, no en el cableado del pedido.

## Trinquete de `server.ts`

Estaba **rojo al entrar** (12 191 sobre un contrato de 12 190). El contrato entra
desde una sola llamada en el punto único multi-proveedor y el monolito queda en
**12 189**: `bajoConsumo` (84/0) y `androidProyecto` (157/0) vuelven a aguantar.

## Verificado por ejecución

`tsc --noEmit` 0 errores · `contratoAccion` 56/0 · `presupuestoHuerfanos` 104/0 ·
`resiliencia` 35/0 · `cableadoFases` 40/0 · `jsonParcial` 14/0 ·
`plantillaDefecto` 14/0 · `cicloHerramientasOpenAICompat` 50/0 · `bajoConsumo` 84/0 ·
`androidProyecto` 157/0. Suites nuevas registradas en `validar.mjs` (fue
`resiliencia` quien lo exigió: la guardia de «ninguna suite huérfana» funciona).

## Lo que NO se toca (para que quede claro, no por olvido)

- `manual-motor/*.md` sigue siendo material **humano**: 0 referencias en el código.
  El contenido ya vive en `manuals.ts`, que es lo que lee el motor. Decisión
  pendiente: borrar la carpeta o declararla export generado.
- Perfiles remotos marcados `remote=false` (`mistral-*`, `llama-3.3-70b-versatile`
  por Groq). Afecta a RAM/keep_alive y necesita criterio propio, no un parche suelto.
- F5–F10 (conflictos de autoridad), la isla especulativa y `disciplinaChat`:
  declarados en `PERMITIDOS_HUERFANOS` con destino v1.68/v1.69.

---

## v1.67.1 · EL CHAT DEJA DE SER LA MESA DE TRABAJO

*(Incluido en el paquete versionado como **1.67.0**: la semilla vive en cinco
sitios y su valla exige moverlos juntos más un ritual de ~5 min. Este arreglo es
un subconjunto estricto de la misma entrega, así que se manda sin bump para no
volver a entregar un paquete con la versión desincronizada — que es justo el
defecto que `techoContexto` ya castiga. Decí la palabra y sale como 1.67.1.)*

### La queja, con captura

> «Los modelos deben trabajar en el editor: contaminan todo el chat de código y
> comandos, y en el editor no escriben nada.»

La captura muestra el chat de `mistral-code-latest` con la valla
` ```cerebronico:search_in_files ` y sus argumentos escritos a la vista, turno
tras turno.

### La raíz: dos líneas del ciclo, y un recogedor que ya existía

| línea | qué hacía | consecuencia |
|---|---|---|
| `server/cicloOpenAICompat.ts:410` | tomaba `extra.llamadas` y tiraba `extra.textoLimpio` | el texto **ya limpio de vallas** se iba a la basura |

No alcanzaba con usar `textoLimpio`: lo que el SSE ya escupió está escrito en la
pantalla y no se des-escribe. La única cura honesta es **retener la valla mientras
se forma** y decidir al cerrarla.

### El arreglo: `crearFiltroDeVallas`

Prosa al instante; al abrir ` ``` ` se guarda hasta el cierre y **ahí** se pregunta
al parser oficial (`extraerLlamadasEnTexto`), nunca por apariencia. Si es llamada
que el motor va a ejecutar, no pisa el chat; si no, sale tal cual.

- **Control de falso positivo:** el ` ```html ` del sitio pedido y un ` ```json `
  de datos salen **byte a byte iguales**. Esconder código que el usuario pidió ver
  es peor que el defecto que se cura.
- **Promesa de seguridad:** al cerrar el turno, si **no** salió ninguna llamada se
  libera todo lo pendiente. Un corte por tokens no puede borrar el aviso.
- **Rinde cuentas:** `retenido()` reporta los caracteres escondidos.

### Dos defectos que encontré escribiéndolo

1. La primera versión resolvía **una** transición por llamada: con el stream entero
   se comía la prosa posterior a la valla. Lo agarró el test, no la lectura.
2. El ` ``` ` del opener llega **picado** entre pedacitos (` ``, ` `` `, luego
   `cerebronico:...`), así que los backticks sueltos se iban al chat antes de
   completarse y el filtro no servía nada en el stream real char por char.

### Verificado

`chatSinVallas` **12 correctas · 0 fallidas** · `cicloHerramientasOpenAICompat`
50✓/0✗ · `tsc --noEmit` 0 errores · ritual completo **7830 comprobaciones, 0
fallos, 180 suites ejecutadas, 0 sin correr, 0 del catálogo ausentes**, exit 0.

### Lo que NO hace esto (para que no se lea como más de lo que es)

No abre ni escribe en el editor: eso ya lo hacen `write_file`/`edit_file`. En la
captura el `index.html` del editor muestra **66 caracteres** y el modelo se
repetía «no se pudo encontrar la sección»: eso son `edit_file` fallando el `find`
y una escritura que quedó casi vacía, que es **otro defecto** y sigue abierto.
Tampoco emite los mensajes de progreso («ya va», «recopilando», «ya casi»,
«volveré a leer»): la función que los genera ya está escrita y esperando destino
(`disciplinaChat.guiaDeProgreso`), y ese es el paso siguiente.


## v1.70.0 · 2026-10-24 · EL BUCLE DE 102 KB Y EL PREVIEW COLGADO (reaplicado sobre 1.69.0)

> **Aviso de numeración, primero.** Las versiones 1.62.0 → 1.69.0 ya estaban
> ocupadas por tu propio trabajo. En una conversación anterior, partiendo del ZIP
> v1.60.19 que se había subido, se empaquetaron entregas con los números 1.60.20,
> 1.61.0 y 1.62.0 — o sea **colisionando con releases tuyas ya hechas**. Este
> trabajo va entonces como **v1.70.0**, aplicado sobre el árbol real v1.69.0.
> Nada de lo de abajo toca las 8 versiones intermedias.

**Qué se verificó antes de tocar:** de los cuatro hallazgos de la auditoría, **uno
ya estaba resuelto por vos** en tu v1.62.0 — la ventanilla de sesión hoy vive a
nivel de módulo (`ventanillaSesion`, `server.ts:3361`) y cada turno llama
`abrirTurno()` (`:3438` y `:10445`). No se re-aplicó ni se duplicó. Los otros tres
segían ausentes en 1.69.0 y entran acá.

### 1 · BUCLE POR POBREZA DE NOVEDAD (`src/engine/bucleDeBloques.ts`, nuevo)

Mensaje 17 de la sesión `1792793541672`: **102.088 caracteres**, 3.258 líneas de
las que sólo **313 son distintas**, 223 secciones numeradas, `app = FastAPI()`
85 veces, y las líneas repetidas ≥4 veces suman el **64,2 %** del texto. Medido
sobre ese texto exacto con `cortarDegeneracionLineal`: `hit:false`, **0,0 %
descartado** — la repetición está **estacionada** (mediana de 340 líneas entre
apariciones), así que no hay racha vecina ni igualdad exacta. Y el filtro de
nombre no ayudaba: el modelo era `mistral-code-latest`, id de chat **sin `fim`**.

Cura: módulo puro que mide novedad en una ventana de cola de 900 líneas con tinta
y exige **dos condiciones** (`distintas/total ≤ 0,35` **y** `masa top-20 ≥ 0,25`),
con la ventana **final** pobre. Umbrales medidos, no redondos:

| cuerpo | distintas/total | masa top-20 | veredicto |
|---|---|---|---|
| msg17 (real) | 0,296 | 0,303 | corta |
| FIM 262 KB | 0,016 | 1,000 | corta |
| server.ts | 0,720 | 0,237 | intacto |
| CHANGELOG.md | 0,976 | 0,047 | intacto |
| RightSidebar.tsx | 0,649 | 0,274 | intacto |
| lista de 1200 archivos | 1,000 | 0,022 | intacta |

Falso positivo evitado por medido: doblar las cifras a `#` colapsaba una **lista
legítima de archivos** a novedad 0,001 y la cortaba entera. Y el criterio «peor
tramo» habría cortado una respuesta que degenera en el medio y **recupera** al
final: por eso el juicio es la cola. No es un techo de longitud — `CHANGELOG.md`
tiene 5.293 líneas con tinta y pasa limpio.

### 2 · ECO DE RESPUESTA DE CHAT (`src/engine/ecoRespuestas.ts`, nuevo)

Mensajes 21 y 23: 10.646 y 10.619 caracteres respondiendo **preguntas distintas**
(«¿los 19 archivos son del proyecto?» / «el sandbox no arranca»). Semejanza de
líneas normalizadas **1,000**, prefijo idéntico sólo **53 %**. La ventanilla
contó **0 rechazos** porque sólo escucha escrituras de archivo: esto era texto de
chat. Ahora el handler compara contra la última respuesta del historial y
registra el rechazo. Umbral medido (1,000 / 0,722 / 0,000) → **0,85**, con largo
mínimo de 800 caracteres.

### 3 · HECHOS DEL ENTORNO LEÍDOS, NO INVENTADOS (`conciencia.ts`)

El mensaje 3 afirmó versión, «799 archivos indexados», puertos y «97
herramientas» con **0 lecturas** en el historial; y cerró con «la autovalidación
confirma que el puente está arriba». Ningún prompt inyectado del repo contiene la
cadena «archivos indexados»: donde el prompt calla, el modelo completa. Ahora
`[ESTADO VIVO DEL TURNO]` viene acompañado de `[HECHOS DEL ENTORNO — LEÍDOS, NO
SUPUESTOS]` (versión, herramientas, puerto medidos) y una regla que prohíbe
afirmar lo que no está en la lista.

### 4 · PREVIEW HONESTO (`src/components/RightSidebar.tsx`)

Síntoma textual del usuario: *«el previsualizador no termina de cargar pero en
localhost:3500 está la página»*. Causa en el código: el `<iframe>` no tenía
`onLoad`/`onError`; el único refresco de URL ocurría en la **primera** transición
a vivo; y el latido del arranque narraba «instalando dependencias» con texto
fijo, cuando la decisión real para ese proyecto era vía estática con
`requiereInstalar: false`, sin tope de espera. Entra `onLoad`/`onError`, un
vigila-carga de 12 s con reintento acotado (3) y aviso con enlace directo, y un
latido que describe el hecho real y se corta con causa a los 200 s.

### 5 · Documentación

`manual-motor/INFORME-SESION-1792793541672.md` (la auditoría con cada número y su
medición) y `manual-motor/HOJA-DE-RUTA-v1.62-1.65.md`. En el informe hay una
nota: el estado inventado incluía un número de versión (**v1.51.0**) que no
existe en ningún archivo del árbol.

### Pendiente

- El fix determinista del test `imagen` (falla en algunas máquinas Windows por
  timing del cortacircuito; en este árbol da verde).
- Contrato de proyecto / semillas: el proyecto que la propia sesión generó es un
  híbrido imposible (express en puerto **3000** contra un sandbox en **3500**,
  `start: live-server`, React con `ReactDOM.render` y `react-dom` fuera de
  `dependencies`, `styles.css` duplicado en `src/`, ningún `.py` pese a que la
  pregunta era de FastAPI).

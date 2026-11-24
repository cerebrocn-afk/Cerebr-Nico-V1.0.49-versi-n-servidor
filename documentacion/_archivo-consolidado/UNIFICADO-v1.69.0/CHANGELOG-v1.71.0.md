## v1.71.0 · 2026-10-25 · EL MOTOR POR FIN ESCRIBE DOCUMENTOS: PDF, WORD Y EXCEL DE VERDAD

Queja de Mario: «aun no se puede generar pdf o archivos word, texto etc, que sea
posible». Tenía razón y el motivo era de los que no se ven desde fuera: el motor
**sí** escribía archivos, pero solo por `write_file`, y `write_file` escribe texto
en UTF-8. Un PDF o un `.docx` son binarios; pasarlos por UTF-8 los corrompe. Así
que el modelo, cuando le pedían «haceme un PDF», terminaba entregando un `.txt`
con un título en mayúsculas que se llamaba `informe.pdf` — y lo entregaba contento.

Texto, Markdown y CSV ya estaban cubiertos (con `write_file` bastaba). Lo que
faltaba eran los tres formatos que la gente abre en Word, Excel y Acrobat.

### 1 · Un paquete nuevo, no un parche en el servidor

`src/engine/generadorDocumentos.ts` (847 líneas) son los constructores **puros**:
nada de Electron, nada de red, nada de `fs`. `src/engine/packDocumentos.ts` (218
líneas) es el paquete de herramientas que se monta por el sistema de packs
(`registerToolPack`) y `server.ts` solo aporta la llave de la caja: le pasa
`resolveSafePath` al contexto para que las rutas queden encarceladas en el
proyecto. Tres herramientas nuevas:

- **`generar_pdf`** — `path`, `contenido` (markdown simple), `titulo`.
- **`generar_docx`** — mismas entradas, sale `.docx` que abre Word.
- **`generar_xlsx`** — `path` y `hojas: [{ nombre, cabeceras, filas }]`.

Los packs se auto-declaran, así que el manual del creador (`manuals.ts`) tiene una
entrada por herramienta y el modelo las ve sin que nadie escriba prompts a mano.

### 2 · Cero dependencias nuevas (y por qué esto no es terquedad)

La casa no suma dependencias de runtime a la ligera: cada una es un riesgo de
cadena de suministro en un instalador que se baja en una PC de taller. Así que los
formatos se construyen **a mano**, con lo que ya estaba en `package.json`:

- **PDF 1.4 escrito a partir de cero.** Fuentes base de los 14 del estándar
  (Helvetica/Times/Courier, no hace falta incrustar tipografías), codificación
  `/WinAnsiEncoding`, anchos reales de glifo sacados del AFM para que el ajuste de
  línea sea de verdad y no «caracteres por línea». Paginación, márgenes, pies de
  página con numeración, negrita/cursiva, código, listas y tablas con reglas.
- **La tabla de offsets (`xref`) se recalcula byte a byte.** Aquí estuvo el defecto
  más caro: escribir el objeto 1 y mirar su offset con índice desplazado. Un `xref`
  mal puesto no tira un error bonito: abre en algunos lectores y en otros sale
  «archivo dañado». La valla lo fija con una mutación sembrada.
- **DOCX y XLSX son ZIP en modo STORE** (sin comprimir) hechos por uno mismo: CRC32
  calibrado contra un vector conocido (`0xCBF43926`), fecha DOS fija para que dos
  generaciones del mismo texto den **exactamente los mismos bytes**, y las partes
  OOXML escritas a mano. Word y Excel no comprueban el ZIP con piedad: un central
  directory mal ordenado es «no se puede abrir».

`JSZip` y `pdfjs-dist` ya eran dependencias del proyecto; acá entran **solo como
lectores de terceros en las pruebas**. La regla de la casa: el que escribe no es el
que certifica.

### 3 · Lo que dice la suite nueva (`tests/packDocumentos.test.ts`, 40 comprobaciones)

- pdf.js (lector tercero) abre el PDF generado y **lee** el título en la página 1;
  la tabla y la lista quedan maquetadas; el texto largo salta de página de verdad
  y la página 2 NO repite el título.
- El `.docx` se relee con JSZip: 5 partes, `Heading1` con `outlineLvl` (Word dibuja
  el mapa del documento), `<w:b/>` en la negrita, y los `&lt;b&gt;` del usuario
  salen como texto, no como XML inyectado. Determinismo byte a byte verificado.
- El `.xlsx` congela la fila de cabeceras (`state="frozen"`), los números salen en
  `<v>` (calculables) y el texto como `inlineStr`.
- **Anti inyección de fórmula:** una celda `=CMD|calc /S /C…` sale como texto y la
  etiqueta de fórmula **jamás** aparece en ninguna hoja. Excel ejecuta fórmulas al
  abrir; sin esto, un `generar_xlsx` sobre datos de un tercero era una puerta.
- Hostiles nombradas y rechazadas con causa: `../escape.pdf`, `notas.txt` pidiendo
  un PDF (extensión mintirosa), documento vacío, `contenido` sobre tope,
  `hojas: []`.
- **Defecto sembrado como contrato:** `terminal_leer` y `terminal_listar` estaban
  implementadas y despachadas pero **no declaradas** — dos manos muertas: el modelo
  no las veía en su lista y no podía llamarlas. La suite fija que
  `declaradas === despachadas` en este pack, para que la trampa no se repita.

### 4 · Dos manos muertas que ahora existen de punta a punta

`terminal_leer` (vaciar el búfer sin mandar nada) y `terminal_listar` (qué shells
hay abiertos) ya funcionaban en el despachador de `packTerminal.ts`. Se declararon
las dos `ToolSpec`. Ahora el modelo puede mirar una terminal larga sin volver a
escribir el comando.

### 5 · Límites honestos (esto NO hace, y está dicho en el manual)

- El PDF usa las fuentes base con WinAnsi: soporta acentos, eñe, symbols latinos.
  Emoji y CJK **no** se dibujan → se convierten a `?` y la herramienta **declara
  cuántos caracteres sustituyó** (`caracteresSustituidos`). Nada de callarse.
- `generar_docx` no incrusta imágenes ni estilos personalizados; las viñetas salen
  con el estilo de lista de Word, no con viñeta dibujada.
- `generar_xlsx` **no escribe fórmulas** (decisión de seguridad, no olvido) ni
  gráficos ni formatos de celda.
- Topes: 100 000 celdas y 1 000 columnas por hoja en XLSX; volumen de `contenido`
  acotado en PDF/DOCX. Pasado el tope, error en cristiano con el número dentro.

### 6 · Validación

`npm run superficie` regeneró `contrato-rutas.json` (149 rutas · 12282 líneas,
server.ts creció el montaje del pack). Semilla 1.71.0 sincronizada en los seis
sitios que vigila `techoContexto` §12. `node scripts/validar.mjs` cerrado en verde:
**8083 comprobaciones · 0 fallos · tipos 0 errores · 190 suites ejecutadas · 0 sin
correr · 0 del catálogo ausentes** (antes de esta entrega: 8041 · 189).

# Manual completo del motor CerebroNico (referencia canónica)

> **Versión del manual:** 2.1.7 · **Motor:** v2.1.7 · **Herramientas:** 104
> **Regla de lectura:** este documento es la ÚNICA fuente de verdad. Las otras
> copias (`manual-nativo.md`, `manual-texto-libre.md`, `manual-json.json`,
> `manual-xml.xml`, `manual-minimo.txt`) son derivados de éste. Si una copia
> contradice este archivo, manda este archivo.

Eres un modelo operando DENTRO de CerebroNico IDE. Tu trabajo se materializa
escribiendo archivos y ejecutando herramientas en un **sandbox** (proyecto
web/app en vivo). Este documento explica cómo funciona el motor por dentro y
cómo hablarle, sin importar qué tan fuerte o débil sea tu modelo.

---

## 1. Arquitectura y puertos

| Puerto | Órgano | Qué hace | Si está caído |
|---|---|---|---|
| `:3000` | IDE | editor + chat + árbol de archivos + planificador | no hay nada |
| `:3500` | Sandbox / previsualizador | sirve el proyecto que construyes | el preview sale en blanco |
| `:5000` | Puente PC (pack `pc`) | toca archivos REALES de la máquina | `pc_*` no responde |
| `:5100` | Memoria / Cerebro (hindsight) | memoria de largo plazo | `memory_*` no responde |
| `:5102` | Creador web | construcción de sitios | `crear_sitio` no responde |
| `:5103` | **Motor del cerebro** | hechos, páginas y consolidación (banco propio) | el daemon `:5100` cae a espejo local |
| `:11434` | Ollama | modelos locales | sólo afecta modelos locales |

**Regla de oro de puertos:** el sandbox es `:3500`, **jamás** `:3000`. Si algo
intenta servir en `:3000` pisa el IDE.

---

## 2. Rutas de trabajo variables (lo que más falla)

El motor **no tiene una ruta fija**. La raíz de datos se resuelve en este orden:

```
1. Variable de entorno PROJECT_DIR   (si existe y no está vacía)
2. Si no: <instalación del IDE>/.proyectos
```

Y dentro de la raíz de datos:

```
<raíz de datos>/
├── <nombre-del-proyecto>/     ← UN proyecto por carpeta, HIJA DIRECTA
│   ├── index.html
│   ├── styles.css
│   └── src/…
├── .cerebro-db/               ← estado que se migra (bóveda, salud de espejos)
├── .cerebronico/              ← estado del motor
├── cerebro/                   ← la .con-ciencia: indice.json + notas .md por tema
├── .creador/                  ← sitios generados por el creador web (:5102)
│   ├── <sitio>/
│   └── exportaciones/
└── .cerebro-papelera/         ← lo que se borra va acá (recuperable)
```

### Variables de entorno que cambian las rutas

| Variable | Quién la lee | Qué controla |
|---|---|---|
| `PROJECT_DIR` | motor (Node/TS) | raíz de datos del motor |
| `CN_PROJECT_DIR` | puente Python `:5000` | **la misma** raíz para el puente |
| `CN_CREADOR_ROOT` | creador web `:5102` | dónde guarda sus sitios |
| `CN_HINDSITE_MIRROR` | memoria `:5100` | archivo del espejo de memoria |
| `CN_BOVEDA_RAIZ` | bóveda de claves | `C:\CN` (Windows) · `~/CN` (resto) |
| `CN_EMBED_MODEL` | embedder del cerebro | modelo de embeddings (por defecto `snowflake-arctic-embed:33m`) |

> **Trampa real y verificada:** si `PROJECT_DIR` y `CN_PROJECT_DIR` **no
> coinciden**, el almacenamiento se parte en dos: el motor escribe en un lado y
> el puente lee del otro. Síntoma: `pc_list_dir` falla con una ruta que
> `pc_exec dir` sí lista. Arreglo: relanzar el puente con un `.bat` que fije
> **ambas** variables antes de invocar el Python embebido.

### Rutas de la instalación (NO son el proyecto del usuario)

```
<instalación>/app/
├── src/            motor y UI en TypeScript (lo que se transforma)
├── server/         rutas HTTP (server/routers/*.ts)
├── dist/           salida del build (dist/server.mjs) — NO se edita a mano
├── runtime/        python-embed: intérprete de los packs externos
├── scripts/        validar.mjs, daemon del creador, empaquetado
├── manual-motor/   ESTE manual
└── docs/           manuales para humanos (el modelo no escribe acá)
```

**Nunca escribas un archivo de trabajo en la raíz del IDE ni en la raíz del
disco.** Va a `<raíz de datos>/<nombre-del-proyecto>/`.

---

## 3. El ciclo de trabajo (siempre igual)

1. `set_plan` — escribí las ETAPAS antes de empezar: es el **contrato del turno**
   (sección 10), no un decorado.
2. Oriéntate SIN leer todo: `list_files`, `search_in_files`, `find_symbol`,
   `read_file_range` (barato) antes que `read_file` (caro).
3. Construye con `write_file` (archivo nuevo/completo) o, mejor, `edit_file` /
   `append_file` (cambios pequeños, más baratos y no rompen presupuestos).
4. `revisar_cambios` — el Quirófano juzga sintaxis, API perdida e imports rotos;
   si algo está rojo REVIERTE la tanda. ÚSALA antes de decir «terminado».
5. Si es web/app: `abrir_previsualizador` para dejarla a la vista.
6. `update_task` — TACHÁ cada etapa con evidencia, de a una. El turno se cierra
   cuando el plan está tachado, no cuando a vos te parece.

---

## 4. Dónde viven los archivos (lo que más falla)

- **Rutas RELATIVAS a la raíz del proyecto**: `index.html`, `styles.css`,
  `src/app.ts`. Nunca `C:\Users\...` ni `/home/...`.
- El motor mantiene un **cuadro interno de claves→rutas** con todas las rutas
  relativas del proyecto ya resueltas. Si dudas de una ruta, `list_files` o
  `search_in_files` antes de inventar.
- **Tu PC ≠ el sandbox.** Un archivo/imagen en `C:\...\Downloads\fotos\x.png`
  NO lo ve el previsualizador. Para que una imagen se VEA hay que meterla:

  - **Opción A (puente PC):** `pc_read_file` el binario → `write_file` dentro del
    proyecto (p. ej. `assets/subidas/x.png`).
  - **Opción B (ingesta):** `ingresar_archivo_workspace` (queda en el árbol de
    entrada, FUERA del runtime) y luego `promover_archivo_sandbox` (paso
    **OBLIGATORIO** para que el sandbox lo sirva).
  - **Opción C (creador web):** `insertar_imagen` con `origen`, `datos_base64`,
    `svg` o `url` — devuelve el `src` exacto ya dentro de `assets/subidas/`.

  Recién entonces referencia `assets/subidas/x.png` en tu HTML. Antes de eso, la
  etiqueta `<img>` SIEMPRE saldrá rota.

---

## 5. Catálogo de herramientas (103, por familia)

### 5.1 Núcleo — proyecto y sandbox (20)

| Herramienta | Args | Nota |
|---|---|---|
| `set_plan` | `tasks:[{id, description, criterios_aceptacion?, archivos?, tipo?, presupuesto_iteraciones?}]` | abre el contrato del turno |
| `update_task` | `task_id, status, evidencia?` | `completed` sin evidencia = sin verificar |
| `list_files` | — | listado del sandbox |
| `read_file` | `path` | caro: prefiere `read_file_range` |
| `read_file_range` | `path, start, end` | barato, 1-based |
| `write_file` | `path, content` | archivo completo; bloqueado si pierde ≥35 % de líneas |
| `edit_file` | `path, find, replace` | **PREFIÉRELA**: find&replace exacto |
| `append_file` | `path, content` | añade sin reescribir |
| `search_in_files` | `query, glob?, max_results?` | devuelve `ruta:línea` |
| `find_symbol` | `name, limit?` | firma real de funciones/clases existentes |
| `make_dir` | `path` | crea carpeta |
| `delete_file` | `path` | **DESTRUCTIVA** |
| `run_command` | `command` | terminal del sandbox (un tiro) |
| `run_tests` | `command?` | `npm test` por defecto |
| `revisar_cambios` | — | el Quirófano juzga y revierte |
| `deshacer_cambios` | — | deshace la última tanda |
| `ingresar_archivo_workspace` | `path, content, origen` | árbol de entrada |
| `promover_archivo_sandbox` | `path` | entrada → runtime |
| `abrir_previsualizador` | `motivo?` | arranca `:3500` y refresca |
| `forjar_complemento` | `receta` | crea un complemento instalado |

### 5.2 PC real — puente `:5000` (6)

| Herramienta | Args | Nota |
|---|---|---|
| `pc_info` | — | **ÚSALA antes de tocar archivos reales** |
| `pc_exec` | `command` | CMD/bash real; lista blanca de binarios |
| `pc_write_file` | `path, content` | texto |
| `pc_read_file` | `path` | lectura real |
| `pc_list_dir` | `path` | listado real |
| `pc_delete` | `path` | **DESTRUCTIVA** |

**Límites reales del puente (verificados, no teóricos):**

- Tiene **lista blanca de binarios**. `whoami`, `powershell`, `wmic`, `netstat`,
  `curl`, `taskkill`, `del`, `cd` **no** están permitidos. `dir`, `echo`,
  `findstr`, `tasklist`, `type` sí.
- El guardián **bloquea metacaracteres sueltos**: `&&`, `;`, `(`, `)`, `&`.
  Un comando por llamada.
- **Rutas con espacios**: `dir "C:\ruta con espacios"` puede fallar por el
  parser de comillas. Alternativa fiable: `pc_list_dir` (no pasa por el shell).
- Si `pc_list_dir` falla pero `pc_exec dir` funciona → `CN_PROJECT_DIR` no
  coincide con `PROJECT_DIR`. Ver sección 2.

### 5.3 Git (3)

`git_status()` · `git_diff(path?)` · `git_commit(message)`

### 5.4 Web y datos (2)

`fetch_url(url, max_chars?)` — baja texto de una URL pública, **no ejecuta
scripts**. `convertir_formato(texto, desde, hacia, …)` — JSON/YAML/TOML/CSV con
informe de pérdidas.

### 5.5 Sistema y modelos (3)

`ollama_estado()` — modelos residentes en RAM/VRAM · `ollama_expulsar(model?)` —
descarga de RAM (no borra disco) · `recursos_maquina()` — núcleos, RAM total y
libre.

### 5.6 Cerebro y espejos (2)

`cerebro_recordar(tema, titulo, texto, resumen?, palabras?)` ·
`cerebro_consultar(consulta, max?)` — enruta y devuelve SOLO lo pertinente.

`consultar_espejo(llamadas:[{espejo, datos}])` — **hasta 8 llamadas por golpe**,
deterministas, ~1 ms, sin gastar RAM del modelo. Poderes por espejo:

| Espejo | `accion` disponibles |
|---|---|
| `espejo.matematicos` | `estadistica` · `resolver` · `matrices` · `bases` · `mcd_mcm` · `interes` |
| `espejo.artes` | `contraste` (WCAG) · `daltonismo` · `gradiente` |
| `espejo.codigos` | `dependencias` · `firmas` · `duplicados` |
| `espejo.lenguajes` | `frecuencias` · `convertir` · `diff` |
| `espejo.planificadores` | `ordenar` (topológico) · `lotes` (paralelizables) |
| `espejo.disenios` | `escala` · `breakpoints` |
| `espejo.cientificos` | `tam_amostral` · `ic` |
| `espejo.cuantico` | `entrelazamiento` |

**Contratos exactos (los fallos vienen de aquí, no del sistema):**
`artes` usa `a` y `b` (no `base`/`frente`) · `codigos` usa `codigo` (no `ruta`) ·
`cientificos` usa `margen` en **decimal** (`0.05`, no `5`) · `fisicos` es
**evaluador de expresiones con constantes** (`c`, `g`), **no** conversor de
unidades: `"1 km"` falla, `"2+2"` funciona.

### 5.7 Creador web — pack `:5102` (32)

**Estado y plantillas:** `estado_creador()` · `plantillas_disponibles()` ·
`listar_sitios()` · `previsualizar_sitio(sitio)`

**Construcción:** `crear_sitio(nombre, tipo?, bloques?, paleta?, …)` ·
`crear_sitio_multipagina(nombre, paginas[], …)` · `crear_pagina(sitio, ruta, …)` ·
`crear_bloque(sitio, bloque, reemplazar?)` · `crear_archivo(sitio, ruta, contenido?)` ·
`insertar_imagen(sitio, origen|datos_base64|svg|url, nombre_archivo?)`

**Componentes:** `crear_pwa(sitio, …)` · `crear_og_image(sitio, …)` ·
`componente_modo_oscuro(sitio, paleta_alternativa?)` ·
`componente_consentimiento(sitio, politica_url, …)` ·
`formulario_destino(sitio, accion, metodo?)` · `generar_schema_jsonld(sitio, tipo, nombre, …)` ·
`generar_hreflang(sitio, idiomas[], base_url)`

**Auditoría y mejora:** `auditar_pagina(archivo)` · `auditar_sitio(sitio)` ·
`auditar_contraste(sitio?, pares?, objetivo?)` · `mejorar_pagina(archivo, aplicar?)` ·
`mejorar_hasta_estable(sitio, paginas?, max_iteraciones?)` ·
`preflight_rendimiento(sitio, presupuesto?)`

**Forja y entrega:** `forjar_desde_brief(brief)` · `forjar_y_entregar(brief, rondas?)` ·
`plan_de_construccion(nombre, …)` · `planificar_ruta_trabajo(orden, artefactos[])` ·
`ejecutar_ruta_paralelo(orden, artefactos[], …)` · `exportar_sitio_zip(sitio, salida?)` ·
`desplegar_carpeta(sitio, destino, aplicar?, limpiar?)` ·
`verificar_despliegue(sitio, destino)` · `listar_exportaciones()`

**Tipos de sitio:** agencia · evento · landing · negocio · onepage · portfolio ·
producto · restaurante · revista · sencillo · startup
**Paletas:** arena · bosque · calido · cereza · claro · noche · oceano · pizarra · violeta
**Bloques:** hero · caracteristicas · precios · testimonios · faq · contacto · cta ·
galeria · equipo · pasos · barra · pie · imagen · estadisticas · logos

### 5.8 Memoria — pack `:5100` (20)

`memory_estado()` · `memory_recall(query, fact_types?, max_tokens?)` ·
`memory_guardar_aprendizaje(contenido, tipo?, tags?)` · `memory_leer_page(page_id)` ·
`memory_listar_pages()` · `memory_guardar_page(page_id, name, source_query, content?)` ·
`memory_borrar_page(page_id)` · `memory_reflect(query, budget?, max_tokens?)` ·
`memory_ingest(title, content)` · `memory_aprender_de_error(contexto, error, causa, correccion, verificacion, tags?)` ·
`memory_repasar(aplicar?, sin_cita_dias?, tope_unidades?)` ·
`memory_indexar_proyecto(documento?, max_archivos?)` · `memory_conflictos(tema?, acta?, top_k?)` ·
`memory_exportar(formato?, nombre?)` · `memory_importar(nombre, sobrescribir_paginas?)` ·
`memory_olvidar(id|ids)` · `listar_skills(filtro?, limite?, desde?)` ·
`leer_skill(skill, archivo?)` · `skill_buscar(query, top_k?)`

### 5.9 Documentos (3)

`generar_pdf(path, contenido, titulo?)` · `generar_docx(path, contenido, titulo?)` ·
`generar_xlsx(path, hojas:[{nombre?, cabeceras?, filas[]}])`

> Límite honesto del PDF: tipografía Helvetica/Courier (latín-1). Emoji y CJK se
> sustituyen por `?` y el resultado lo declara en `caracteresSustituidos`.

### 5.10 Terminal persistente (5)

`terminal_abrir(cwd?, shell?)` → id · `terminal_enviar(id, data, reposo_ms?)` ·
`terminal_leer(id)` · `terminal_listar()` · `terminal_cerrar(id)`

> A diferencia de `run_command` (un solo tiro), esta sesión **mantiene estado**:
> `cd`, variables, un REPL o un proceso que pide entrada. **Cerrá siempre** al
> terminar para no dejar shells vivos.

---

## 6. Cómo LLAMAR a una herramienta (dos canales)

### Canal A — tool-calls NATIVAS (si tu API las tiene)

Emite la llamada por el campo `tool_calls` del protocolo (OpenAI/Gemini/Mistral/
Claude/Groq). El motor la ejecuta directo. Es lo preferible: no falla el parseo.

### Canal B — llamada COMO TEXTO (si NO tienes function-calling)

Muchos modelos *free* no tienen canal nativo: entonces escribes la llamada en el
texto del mensaje y el motor la detecta y la ejecuta igual. Formatos que el motor
SÍ reconoce (usa cualquiera, pero usa UNO limpio):

**B1 — valla con nombre de herramienta + JSON** (recomendado para escribir archivos):
````
```cerebronico:write_file
{"path":"index.html","content":"<!doctype html>…"}
```
````

**B2 — pseudo-XML**:
```
<dots_function_call>
<write_file>{"path":"styles.css","content":"body{…}"}</write_file>
</dots_function_call>
```

**B3 — nombre pelado + JSON** (una línea con el nombre, debajo el JSON):
```
write_file
{"path":"game.js","content":"…"}
```

**B4 — valla de código CON la ruta en la cabecera** (ideal para contenido de archivo):
````
```html file="index.html"
<!doctype html>…
```
````
Variantes equivalentes que también entran: ```` ```file="index.html" ````,
```` ```ts:src/x.ts` ````, ```` ```tsx path='src/x.tsx' ````,
```` ```filepath=src/x.ts ````, o la **ruta sola**: ```` ```src/x.ts ````.
También vale nombrar el archivo en la línea justo ANTES de la valla
(`**index.html**`, `Archivo: index.html:`) o como comentario en la 1ª línea
(`// file: index.html`).

> Envolturas toleradas: `<tool_call>…</tool_call>`,
> `<|tool_call_start|>…<|tool_call_end|>`, ```` ```tool_code ````. El motor saca
> el contenido real de dentro.

---

## 7. Alias (escribe en español si quieres; el motor traduce)

**Nombres**: `list_dir`/`ls`/`dir`/`listdir`/`list_directory` → `list_files` ·
`create_file`/`crear_archivo`/`escribir_archivo`/`writefile` → `write_file` ·
`borrar_archivo`/`eliminar_archivo` → `delete_file` · `leer_archivo` → `read_file` ·
`ejecutar`/`shell`/`bash`/`terminal` → `run_command`.

**Campos**: `ruta`/`archivo`/`fichero`/`ruta_archivo` → `path` ·
`contenido`/`texto`/`cuerpo` → `content` · `comando`/`cmd`/`instruccion` → `command` ·
`buscar` → `find` · `reemplazar` → `replace` · `consulta` → `query`.

Un alias que no esté en la lista NO se traduce: usa el nombre canónico si dudas.

---

## 8. Reglas de oro (romperlas = el turno se traba)

1. **No repitas sin cambiar.** Reescribir un archivo byte-a-byte IGUAL al de
   disco se rechaza; si insistes rotando entre 2–3 archivos iguales, el motor
   cuenta los rechazos del turno y lo CORTA. Si no sabes qué cambiar, pregunta,
   no gires.
2. **Un `.js` es JavaScript, no TypeScript.** Nada de `const x: number`, `as`,
   `interface`. Si necesitas tipos, usa `.ts`/`.tsx`.
3. **Actos, no discursos.** Si el usuario dice «no cambia nada», NO repitas el
   mismo párrafo de consejos: emite una tool-call que ARREGLE algo o pide el
   dato que te falta. Narrar en círculo sin tool-calls es el fallo #1.
4. **Verifica en disco.** `revisar_cambios` antes de «terminado»; para web,
   `abrir_previsualizador`.
5. **Cambios pequeños con `edit_file`/`append_file`**, no reescrituras enteras
   (más barato y no rompe presupuestos de líneas).
6. **Imagen que no se ve** = el archivo no está en el proyecto (sección 4), NO es
   la ruta del HTML. Mete el binario primero.
7. **No inventes herramientas ni rutas.** Si un nombre no está en la sección 5,
   NO existe. Si una ruta no la viste con `list_files`, no la escribas.
8. **Nunca afirmes haber ejecutado algo que no ejecutaste.** Si una herramienta
   falló, di el error tal cual. Inventar una ejecución es el peor error posible.

---

## 9. Diagnóstico rápido de síntomas

| Síntoma | Causa real | Arreglo |
|---|---|---|
| Preview en negro/blanco | el archivo no se escribió (formato no reconocido) o `.js` con tipos TS | usa B1/B4 y JS puro |
| Imágenes rotas | no están dentro del proyecto | sección 4 |
| «Límite de mensajes» / todo se traba | bucle sin cambios reales | corta y pide el dato que falta |
| El editor no muestra lo generado | escribiste código como prosa sin ruta | B4 con `file="ruta"` o B1 |
| `pc_list_dir` falla, `pc_exec dir` funciona | `CN_PROJECT_DIR` ≠ `PROJECT_DIR` | sección 2 |
| `pc_exec` dice «binario no está en la lista blanca» | el puente sólo permite un set fijo | usa `pc_list_dir`/`pc_read_file` |
| `consultar_espejo` falla | parámetros mal nombrados | sección 5.6, contratos exactos |
| `memory_*` no responde | pack `:5100` caído | verifica el proceso, no el código |

---

## 10. El Planificador y el contrato del turno (v1.69.0)

La pestaña **Planificador** es el primer plano de la IDE: ahí se ve el plan y ahí
se ejecuta el contrato. Vale para TODOS los proveedores — Ollama local, Gemini y
las once ramas de nube (OpenRouter, Z.ai, Groq, Cerebras, Together, Mistral,
DeepSeek, Fireworks, custom…) escriben en la misma hoja.

**Cómo funciona el contrato:**

- `set_plan` escribe las etapas en el panel y abre el **contrato de aceptación**:
  si declaraste `criterios_aceptacion` por etapa, cada criterio necesita su
  EVIDENCIA para considerarse probado.
- `update_task(task_id, "completed", evidencia:"…")` TACHA la etapa. Sin
  evidencia queda `cerrada_sin_verificar`: la puerta del cierre sigue roja.
- **El turno no se corta hasta terminar.** Si querés cerrar con etapas abiertas
  o criterios sin prueba, el motor se AUTO-PREGUNTA: te inyecta la lista exacta
  (`[x]` tachadas, `[ ]` abiertas, `[▶]` en curso) y te exige seguir en el mismo
  hilo. Tres exigencias y después el turno cierra solo — con la verdad: la
  entrega se marca **PARCIAL** y se lista qué etapas quedaron.
- El plan sobrevive al turno: si el usuario dice «seguí», retomás donde quedó
  (nota de sistema «PLAN ANTERIOR SIN TERMINAR»); si el pedido es otro,
  reemplazalo con un `set_plan` nuevo.
- Mientras hay etapas abiertas, el planificador muestra actividad (punto ámbar).
  Nace un plan → la pestaña salta al frente sola; llega la entrega → vuelve al
  chat para que se vea.

**Lo que esto te exige como modelo:** etapas chicas y verificables; tachar de a
una con su prueba; nunca cantar «listo» con el plan a medias; si una etapa es
imposible, `failed` con causa (eso también es cerrar honestamente).

---

## 11. Presupuesto de autonomía y acciones destructivas

- **Presupuesto por turno:** ~10 pasos de herramientas. Gástalos en ACCIONES, no
  en pedir permiso.
- **No preguntes lo obvio.** Si el pedido ya fija el destino (ruta, archivo,
  resultado), ejecutá el paso que sigue.
- **Sí preguntá** cuando la intención de diseño cambia el resultado visible, o
  cuando falta un dato IMPRESCINDIBLE que no podés deducir.
- **Acción destructiva = confirmación SIEMPRE:** `delete_file`, `pc_delete`,
  `git reset`, matar procesos, sobrescribir sin respaldo. Explicá qué se borra
  y por qué.
- **Si una herramienta falla, no la repitas igual.** Cambiá de ruta, de
  herramienta o de enfoque. Repetir el mismo fallo es el bucle que corta turnos.

---

## 12. ADUANA DEL ÁRBOL — qué NO se añade nunca

Aunque te lo pidan, **nunca** añadas al proyecto:

- **Secretos:** `.env`, `.pem`, `.key`, `.p12`, `id_rsa`, `.npmrc`, `.netrc`,
  `credentials.json`, `.aws/`, `.ssh/`, `terraform.tfstate`
- **Artefactos:** `node_modules/`, `.git/`, `dist/`, `build/`, `out/`,
  `coverage/`, `.venv/`, `__pycache__/`, `target/`, `.cache/`
- **Efímeros:** `.log`, `.tmp`, `.bak`, `.swp`, `.DS_Store`, `.pid`
- **El espejo del sandbox:** `.proyectos/` y `proyectos/` — duplican el árbol
  entero y confunden al restaurar

Y **pregunta antes de añadir** cualquier archivo que no sea código, configuración
o documentación del propio proyecto: material gráfico, datos (`.csv`, `.xlsx`,
`.pdf`, `.db`), o cualquier extensión que no reconozcas. Formula la pregunta con
la lista y el número («¿añado estos 3 o los dejo fuera?»).

**Si dudas de si un archivo pertenece al proyecto, no lo crees.** Es más barato
preguntar que limpiar.

---

## 13. Espejo del proyecto — escribe el conjunto completo

No es un error de sintaxis: es no saber cuántos archivos tiene un proyecto de ese
tipo, escribir los dos que tienes en la cabeza y darlo por terminado. Una web a
la que le falta un archivo **se ve en blanco**.

| Tipo | Archivos mínimos |
|---|---|
| Web estática (sin `package.json`) | `index.html` + `styles.css` + `app.js` |
| Vite / React | `package.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `vite.config.ts` |
| Node / Express | `package.json`, `server.js`, `.env.example` (nunca `.env`) |
| Python | `requirements.txt`, `main.py`, `README.md` |

Antes de decir «listo», recorre la tabla y confirma que **todos** existen.

### Familia PC real (puente :5000) — 7 herramientas

Estas van al puente Python y tocan el disco REAL del equipo, no el sandbox.

| Herramienta | Args | Qué hace |
|---|---|---|
| `fs_read` | `path` | Lee un archivo de la PC. Acepta absoluta o atajo (`Desktop/`, `Documents/`, `~`). |
| `fs_write` | `path`, `content` | Escribe TEXTO en la PC. Para binarios usa `fs_write_b64`. |
| `fs_write_b64` | `path`, `data_b64` | Escribe BINARIO decodificando base64 sin saltos de línea. Devuelve bytes reales. |
| `fs_list` | `path` | Lista un directorio de la PC. |
| `fs_delete` | `path` | Borra UN archivo. No destruye: lo mueve a `.cerebro-papelera/` y devuelve `recuperable:true`. |
| `fs_mkdir` | `path` | Crea un directorio en la PC. |
| `exec` | `command` | Ejecuta un comando permitido. Sujeto a lista blanca y al guardián de metacaracteres. |

**Límites reales del puente (verificados):**
- Lista blanca estricta: `dir`, `tasklist`, `findstr`, `node`, `python`… `whoami`, `powershell`, `wmic`, `netstat`, `curl`, `taskkill` NO están permitidos.
- El guardián bloquea `&&`, `;`, `(`, `)`, `>` y redirecciones.
- Rutas con espacios funcionan entrecomilladas; el binario NO debe ir entrecomillado.
- `pc_exec` lanza `cmd.exe` hijo y hereda el entorno; las herramientas `fs_*` resuelven contra `CN_PROJECT_DIR`.

---

## 14. El cerebro-motor (`:5103`) — arquitectura real verificada

El cerebro NO es una sola pieza. Son **dos órganos** con responsabilidades
separadas, y confundirlos es la causa de la mitad de los fallos de memoria.

| Órgano | Puerto | Qué guarda | Qué NO hace |
|---|---|---|---|
| **Motor** (`cerebro_motor.py`) | `:5103` | hechos, páginas consolidadas, contradicciones | no habla MCP, no atiende al modelo |
| **Daemon** (`hindsight_daemon.py`) | `:5100` | nada: es la puerta MCP | no consolida, no decide temas |

El daemon **lee del motor** cuando `HINDSITE_API_URL` apunta a `:5103`. Si el
motor no responde, cae a `espejo-local` y lo declara en `/health` con
`backend: espejo-local`. Ese cambio de backend es la primera cosa que hay que
mirar cuando `memory_*` devuelve menos de lo esperado.

### 14.1 Dónde vive el saber (fuera de la instalación)

```
C:\Cerebronico\.cerebro-db\
    cerebro-motor.json     hechos + páginas + contradicciones (el almacén real)
    alias-paginas.json     tabla de alias legibles por page_id
```

Está **fuera** de la carpeta del IDE a propósito: sobrevive a cualquier
actualización o reinstalación. Si se borra la instalación, el saber sigue ahí.

### 14.2 Endpoints reales del motor (verificados)

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/health` | versión, hechos, páginas, backend |
| `GET` | `/v1/default/banks/{banco}/mental-models` | lista de páginas |
| `GET` | `/v1/default/banks/{banco}/mental-models/{id}` | una página (`{"ok":true,"page":{...}}`) |
| `POST` | `/v1/default/banks/{banco}/memories` | ingesta: `{"items":[{"content","document_id","type","tags"}]}` |
| `POST` | `/v1/default/banks/{banco}/memories/recall` | búsqueda |
| `POST` | `/consolidar` | reconstruye las páginas desde los hechos |

**Trampa verificada:** el campo de la ingesta es `content`, **no** `texto`. Y el
cuerpo va envuelto en `items`, no en la raíz. Un `400` en la ingesta casi
siempre es una de esas dos cosas.

### 14.3 Consolidación: cómo se decide el tema de una página

`_temas_de()` agrupa los hechos por **bigrama más votado** de su texto, no por
los dos primeros tokens (eso producía ids basura como `si-una` o `mitad-ida`).
Filtra stopwords españolas **e inglesas**; si un hecho no produce bigrama
válido, se descarta del agrupamiento en vez de crear una página `sin-tema`.

El `source_query` de cada página es **solo el tema**, no la concatenación de los
bigramas de todos sus hechos. Antes acumulaba 60 bigramas y las páginas se
contaminaban entre sí.

Tope por página: **60 hechos** (`hechos[:60]`). Con `[:12]` todas las páginas
quedaban cortadas en ~40 líneas y parecían idénticas.

### 14.4 Alias de páginas (nombres legibles)

Los `page_id` generados por bigrama a veces son débiles (`skill-user`,
`raiz-dato`). En vez de forzar el filtro —que mataría temas legítimos— se
traducen en la capa de presentación:

```json
{ "alias": { "skill-user": "Skills del usuario", "raiz-dato": "Raiz de datos" } }
```

El daemon aplica la tabla en `h_listar_pages` y marca cada página con
`alias_de`. El motor no se toca: cero riesgo para la consolidación.

**Trampa verificada:** si `ALIAS_JSON` no está definida, el `NameError` lo traga
un `except` desnudo y la función devuelve `{}` en silencio. El parche «está» y
no hace nada. Toda lectura de la tabla debe declarar la constante con ruta
absoluta y respaldo por `PROJECT_DIR`.

### 14.5 Arranque automático (verificado tras reinicio)

El `.bat` de arranque lanza el motor con la variable `CN_CEREBRO_MOTOR` y
**sin** el argumento `--store` (ese argumento no existe en el motor y lo mataba
al instante, sin dejar log). Orden correcto:

1. arranca el motor `:5103` y espera a que responda `/health`;
2. arranca el daemon `:5100` con `HINDSITE_API_URL=http://127.0.0.1:5103`;
3. guarda `netstat` para no duplicar procesos si ya están vivos.

**Comprobación honesta:** que el motor esté arriba no prueba que el `.bat`
funcione. La prueba es reiniciar Windows sin tocar nada y ver los tres puertos
arriba y `motor.log` con fecha posterior al arranque.

### 14.6 Síntomas y causa raíz (todos vistos en vivo)

| Síntoma | Causa real | Arreglo |
|---|---|---|
| `memory_*` devuelve 0 páginas | daemon en `espejo-local` | revisar `HINDSITE_API_URL` |
| ingesta devuelve `400` | campo `texto` en vez de `content`, o falta `items` | corregir el cuerpo |
| ingesta se cuelga y expira | el embedder espera a Ollama `:11434`, apagado | ingestar directo al motor por HTTP |
| páginas con ids basura | `_temas_de` tomaba los 2 primeros tokens | bigrama más votado |
| páginas todas iguales | tope `hechos[:12]` | `[:60]` |
| alias no se aplican | `ALIAS_JSON` sin definir, `except` lo traga | declarar la constante |
| el reinicio «no aplica» el parche | el proceso viejo sigue con el puerto | matar por PID y verificar |

---

## LA HOJA DE RUTA DE LA INTERFAZ — tres cosas y nada más (v1.0.20)

El indicador **«Ruta»** (arriba a la derecha, debajo de la banda) abre la hoja de
ruta del trabajo. Tiene **tres bloques, en este orden**, y ningún otro:

1. **Reconexión de puertos** — sólo los puertos **caídos**, cada uno con qué
   servicio es y **qué se pierde** si sigue abajo. Botón «Reconectar» únicamente
   si hay alguno abajo; con todo arriba, una línea: «Todos los puertos contestan».
2. **Pasos de la tarea** — los pasos del plan **vigente**, desde el primero:
   ✓ hecho · ▶ en curso · ✗ roto (con su motivo) · · pendiente, y el contador
   `hechas/total`. Sin plan: «Sin tarea en marcha».
3. **Entregable final** — uno solo, con nombre, peso y archivos. El botón
   «⬇ Descargar» **sólo** aparece con la obra cerrada y el paquete empacado; a
   medias dice «todavía no hay entregable final: el trabajo no cerró».

Lo que **no** está en la hoja y sigue existiendo en el **Panel completo** (botón
del pie de la hoja): el inventario por grupos (Código / Avisos / Descripciones /
Datos / Entregables), la descarga por archivo suelto, el repartidor y los
interruptores de servicio. No pidas esos datos en la hoja: no se pintan ahí.

Reglas para el modelo: la hoja **no** es una fuente de verdad que puedas
inventar. Si necesitas el estado de los puertos, `GET /api/telemetry`; del plan,
`GET /api/brain/plans`; del paquete, `GET /api/sandbox/zip-info`.

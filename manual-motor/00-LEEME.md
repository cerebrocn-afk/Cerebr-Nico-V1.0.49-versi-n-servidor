# Manual interno del motor CerebroNico — índice de copias

> **Versión del manual:** 2.1.0 · **Motor:** v2.1.7 · **Herramientas:** 104
> **Qué es esto.** Un manual de las ENTRAÑAS del motor para que CUALQUIER modelo
> (fuerte o diminuto, con o sin tool-calls nativas) sepa operarlo: qué
> herramientas hay, cómo llamarlas, dónde viven los archivos y qué reglas no se
> pueden romper. Hay varias copias en distintos FORMATOS para que ningún modelo
> quede fuera: cada familia usa el formato que mejor entiende.

## Elige tu copia según el modelo

| Copia | Para qué modelo | Por qué |
|---|---|---|
| `manual-completo.md` | **Referencia canónica** (humanos + modelos fuertes) | Todo el detalle, una sola fuente de verdad. Si otra copia lo contradice, manda ésta. |
| `manual-nativo.md` | OpenAI, Gemini, Mistral, Claude, Groq (nativo) | Tienen canal `tool_calls` nativo; les basta el catálogo + reglas. |
| `manual-texto-libre.md` | Modelos *free* / OpenRouter / sin function-calling | Deben emitir las llamadas COMO TEXTO; aquí están las plantillas exactas que el motor sí parsea. |
| `manual-json.json` | Sistemas/modelos que ingieren esquema JSON | Registro completo de herramientas + rutas + formatos, legible por máquina. |
| `manual-xml.xml` | Modelos que prefieren etiquetas XML (estilo `dots_function_call`) | Mismo contenido en XML/pseudo-XML. |
| `manual-minimo.txt` | Modelos diminutos (0.5b–1.5b, locales) | Texto plano cortísimo: UN formato que funciona + las 10 reglas de oro. |

## Qué cambió en la versión 2.0.0

- **Catálogo completo: 103 herramientas** (antes decía 37 y omitía el creador
  web, la memoria, los documentos y la terminal persistente).
- **Rutas de trabajo variables documentadas** (sección nueva): `PROJECT_DIR`,
  `CN_PROJECT_DIR`, `.proyectos/<nombre>`, `.creador/`, `cerebro/`,
  `.cerebro-papelera/`. Antes no se mencionaban y era el fallo más caro.
- **Límites reales del puente `:5000`**: lista blanca de binarios, bloqueo de
  metacaracteres, rutas con espacios.
- **Contratos exactos de los espejos**: `artes` usa `a`/`b`, `codigos` usa
  `codigo`, `cientificos` usa `margen` decimal, `fisicos` no convierte unidades.
- **Aduana del árbol**: qué nunca se añade al proyecto y cuándo preguntar.
- **Espejo del proyecto**: archivos mínimos por tipo de proyecto.

## Qué cambió en la versión 2.1.0

- **El cerebro tiene motor propio en `:5103`** (`cerebro_motor.py`). El daemon
  `:5100` ya no guarda nada: consulta al motor y cae al espejo si no responde.
- **Endpoints reales documentados** en `RUTAS-DEL-SISTEMA.md` §7-bis. El listado
  de páginas es `/mental-models`, **no** `/pages` (ese endpoint no existe).
- **Ingesta**: `POST /v1/default/banks/{banco}/memories` con
  `{"items":[{"content","document_id","type","tags"}]}`. El campo es `content`;
  mandar `texto` en la raíz devuelve `400`.
- **La ingesta dispara la consolidación automática** y puede tardar >60 s. Un
  timeout del cliente NO significa que falló: comprobar `/health` antes de
  reintentar, o se duplica el contenido.
- **Alias de páginas**: `alias-paginas.json` traduce ids débiles (`skill-user`,
  `raiz-dato`) a nombres legibles. El daemon los aplica al listar.
- **Trampa de Windows**: reiniciar un proceso Python no siempre mata el viejo.
  Comprobar el PID real antes de creer que el reinicio funcionó.
- **Service worker del sandbox**: el preview `:3500` inyecta un `sw.js` que
  recarga con `?cn_fin_sw=1` y deja la página en blanco. Un proyecto servido
  ahí no debe registrar su propio SW, y conviene una guarda que desregistre.

## Regla de oro transversal (vale para TODOS)

1. **Rutas RELATIVAS a la raíz del proyecto** (`index.html`, `src/app.ts`), nunca
   absolutas de Windows (`C:\Users\...`).
2. **La raíz es VARIABLE.** Sale de `PROJECT_DIR`; si no existe,
   `<instalación>/.proyectos`. El puente Python usa `CN_PROJECT_DIR` y **debe
   apuntar a la misma raíz** — si no coinciden, el almacenamiento se parte en dos.
3. **Lo que está en tu PC NO está en el sandbox.** Un archivo o imagen que vive
   en `C:\...\Downloads` no lo ve el previsualizador. Hay que METERLO al
   proyecto primero (ver `ingresar_archivo_workspace` + `promover_archivo_sandbox`,
   `pc_read_file` → `write_file`, o `insertar_imagen`).
4. **No reescribas un archivo byte-a-byte IGUAL** al que ya existe: el motor lo
   rechaza y, si insistes, te corta el turno.
5. **Un `.js` lleva JavaScript, no TypeScript.** Sin `: tipo`, sin `as`. (El motor
   intenta sanearlo desde v1.60.18, pero no cuentes con ello.)
6. **Antes de decir «listo»:** `revisar_cambios` y, si es web, `abrir_previsualizador`.
7. **El plan es CONTRATO (v1.69.0).** `set_plan` escribe las etapas en la pestaña
   Planificador —primer plano, local y nube— y el turno **no cierra** con etapas
   sin tachar: el motor se auto-pregunta (tope 3) y después entrega como PARCIAL.
   Se tacha con `update_task` + `evidencia`; `failed` con causa también cierra.
8. **No inventes herramientas ni rutas.** Si un nombre no está en el catálogo, no
   existe. Si una ruta no la viste con `list_files`, no la escribas.
9. **Nunca afirmes haber ejecutado algo que no ejecutaste.** Si una herramienta
   falló, di el error tal cual.
10. **Destructivo = confirmación SIEMPRE** (`delete_file`, `pc_delete`, matar
    procesos, sobrescribir sin respaldo).

El detalle de cada punto está en `manual-completo.md`. Esta carpeta es el manual;
no hay otra copia fuera de aquí.

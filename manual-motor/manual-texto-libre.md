# Manual del motor — copia para modelos SIN tool-calls nativas
# (free / OpenRouter / Z.ai / Custom / modelos locales pequeños)
# Versión 2.0.0 · Motor v1.98.x · 103 herramientas

No tienes canal de funciones: escribe la llamada COMO TEXTO en tu respuesta y el
motor la detecta y la ejecuta. Elige UN formato y mantenlo limpio.

## Formato recomendado para ESCRIBIR archivos

**Opción 1 — valla con nombre + JSON:**
````
```cerebronico:write_file
{"path":"index.html","content":"<!doctype html><html>…</html>"}
```
````

**Opción 2 — valla de código con la ruta en la cabecera (más cómoda para HTML/CSS/JS):**
````
```html file="index.html"
<!doctype html>
<html lang="es">…</html>
```
````
Equivalentes: ```` ```file="index.html" ````, ```` ```css file="styles.css" ````,
```` ```js file="game.js" ````, ```` ```ts:src/app.ts` ````, o la ruta sola
```` ```index.html ````.

## Otras herramientas como texto (nombre + JSON)
```
list_files
{}
```
```
read_file
{"path":"index.html"}
```
```
edit_file
{"path":"styles.css","find":"color:#333","replace":"color:#06c"}
```
```
run_command
{"command":"npm run build"}
```
```
delete_file
{"path":"viejo.js"}
```

También se acepta pseudo-XML:
```
<dots_function_call>
<write_file>{"path":"a.js","content":"…"}</write_file>
</dots_function_call>
```

## Puedes escribir en español (el motor traduce)
Nombres: `crear_archivo`=`write_file`, `list_dir`/`ls`=`list_files`,
`borrar_archivo`=`delete_file`, `leer_archivo`=`read_file`, `ejecutar`=`run_command`.
Campos: `ruta`=`path`, `contenido`=`content`, `comando`=`command`,
`buscar`=`find`, `reemplazar`=`replace`.
Así también vale:
````
```cerebronico:crear_archivo
{"ruta":"index.html","contenido":"…"}
```
````

## Rutas de trabajo (variable, no fija)

La raíz de datos se resuelve así: `PROJECT_DIR` si existe; si no,
`<instalación>/.proyectos`. Dentro de ella, **un proyecto por carpeta hija
directa**. El puente Python `:5000` usa `CN_PROJECT_DIR` y **debe apuntar a la
misma raíz** — si no coinciden, el almacenamiento se parte en dos y `pc_list_dir`
falla aunque la ruta exista.

```
<raíz de datos>/
├── <proyecto>/        ← acá escribes (rutas RELATIVAS)
├── .cerebro-db/       ← estado migrable
├── cerebro/           ← .con-ciencia (indice.json + notas .md)
├── .creador/          ← sitios del creador web + exportaciones
└── .cerebro-papelera/ ← lo borrado (recuperable)
```

## Herramientas que existen (103 · las que más vas a usar)

**Núcleo:** `set_plan` · `update_task` · `list_files` · `read_file` ·
`read_file_range` · `write_file` · `edit_file` · `append_file` ·
`search_in_files` · `find_symbol` · `make_dir` · `delete_file` · `run_command` ·
`run_tests` · `revisar_cambios` · `deshacer_cambios` ·
`ingresar_archivo_workspace` · `promover_archivo_sandbox` ·
`abrir_previsualizador` · `forjar_complemento`

**PC real (:5000):** `pc_info` · `pc_exec` · `pc_write_file` · `pc_read_file` ·
`pc_list_dir` · `pc_delete`
> Lista blanca de binarios: `dir`, `echo`, `findstr`, `tasklist`, `type` sí;
> `whoami`, `powershell`, `wmic`, `netstat`, `curl`, `taskkill`, `del`, `cd` no.
> Bloquea `&&`, `;`, `(`, `)`, `&`. Un comando por llamada.

**Git:** `git_status` · `git_diff` · `git_commit`
**Web/datos:** `fetch_url` · `convertir_formato`
**Sistema:** `ollama_estado` · `ollama_expulsar` · `recursos_maquina`
**Cerebro:** `cerebro_recordar` · `cerebro_consultar` · `consultar_espejo`
**Creador web (:5102):** `crear_sitio` · `crear_sitio_multipagina` · `crear_pagina` ·
`crear_bloque` · `crear_archivo` · `insertar_imagen` · `crear_pwa` · `crear_og_image` ·
`componente_modo_oscuro` · `componente_consentimiento` · `formulario_destino` ·
`generar_schema_jsonld` · `generar_hreflang` · `auditar_pagina` · `auditar_sitio` ·
`auditar_contraste` · `mejorar_pagina` · `mejorar_hasta_estable` ·
`preflight_rendimiento` · `forjar_desde_brief` · `forjar_y_entregar` ·
`plan_de_construccion` · `planificar_ruta_trabajo` · `ejecutar_ruta_paralelo` ·
`exportar_sitio_zip` · `desplegar_carpeta` · `verificar_despliegue` ·
`listar_exportaciones` · `estado_creador` · `plantillas_disponibles` ·
`listar_sitios` · `previsualizar_sitio`
**Memoria (:5100):** `memory_estado` · `memory_recall` · `memory_guardar_aprendizaje` ·
`memory_leer_page` · `memory_listar_pages` · `memory_guardar_page` ·
`memory_borrar_page` · `memory_reflect` · `memory_ingest` · `memory_aprender_de_error` ·
`memory_repasar` · `memory_indexar_proyecto` · `memory_conflictos` ·
`memory_exportar` · `memory_importar` · `memory_olvidar` · `listar_skills` ·
`leer_skill` · `skill_buscar`
**Documentos:** `generar_pdf` · `generar_docx` · `generar_xlsx`
**Terminal persistente:** `terminal_abrir` · `terminal_enviar` · `terminal_leer` ·
`terminal_listar` · `terminal_cerrar`

## El plan como CONTRATO (v1.69.0) — también como texto
Si la tarea lleva más de 2 pasos, escribí el plan primero; se lo ve en la pestaña
**Planificador** y el turno NO cierra hasta tachar todas las etapas (el motor te
lo auto-pregunta hasta 3 veces y después entrega como PARCIAL con lo que falta):
```
set_plan
{"tasks":[{"id":"t1","description":"armar index.html","criterios_aceptacion":["el preview muestra el titulo"]},{"id":"t2","description":"styles.css","criterios_aceptacion":["se ve en pantalla"]}]}
```
Y TACHÁ de a una con la prueba:
```
update_task
{"task_id":"t1","status":"completed","evidencia":"escribi index.html y revise_cambios dio ok"}
```
Sin `evidencia`, «completed» queda **sin verificar** y la puerta del cierre sigue
roja. `status:"failed"` con causa también cierra la etapa (es honesto).

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

## Reglas que NO puedes romper
1. **Rutas RELATIVAS** (`index.html`, `src/x.js`), nunca `C:\Users\...`.
2. **`.js` = JavaScript puro**, SIN `: tipo` ni `as` (eso rompe el sandbox).
3. **No repitas el mismo archivo igual** una y otra vez: el motor te corta.
4. **Si el usuario dice «no cambia nada»**, no repitas el mismo consejo: emite
   una escritura real o pide el dato que falta.
5. **Imagen rota** = el archivo no está en el proyecto. Primero mételo
   (`pc_read_file` → `write_file`, o `insertar_imagen`) y luego referenciála relativa.
6. **El plan se TACHA, no se abandona**: no cantes «listo» con etapas abiertas;
   tachá con `update_task` + evidencia o declará la etapa imposible con causa.
7. **No inventes herramientas ni rutas.** Si un nombre no está arriba, no existe.
8. **Nunca afirmes haber ejecutado algo que no ejecutaste.** Si falló, di el error.
9. **Destructivo** (`delete_file`, `pc_delete`, matar procesos) = confirmación SIEMPRE.
10. **Si una herramienta falla, no la repitas igual**: cambia de ruta o de enfoque.

## Nunca añadas al proyecto
Secretos (`.env`, `.pem`, `.key`, `id_rsa`, `.npmrc`, `credentials.json`, `.ssh/`),
artefactos (`node_modules/`, `.git/`, `dist/`, `build/`, `.venv/`, `__pycache__/`),
efímeros (`.log`, `.tmp`, `.bak`, `.swp`, `.DS_Store`), ni el espejo del sandbox
(`.proyectos/`, `proyectos/`). Pregunta antes de añadir material gráfico, datos o
extensiones desconocidas.

Detalle completo: `manual-completo.md`.

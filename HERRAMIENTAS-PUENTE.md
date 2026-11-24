# HERRAMIENTAS-PUENTE.md — Catálogo de las 105 herramientas del motor

> **Aviso de fuente (v1.0.31).** Este documento es la ficha LEGIBLE, no la lista
> autoritativa. La lista autoritativa es el registro en ejecución
> (`toolRegistry` + packs: 46 herramientas en proceso) y, para las externas, los
> servicios del puente. El 11-nov se detectó que este catálogo decía 104 cuando
> había 105 (faltaba `abrir_red`, y `tests/catalogoHerramientas.test.ts` lo
> vigila). Si discrepancia: gana el registro, y este archivo se corrige.

> Cada herramienta: nombre exacto, qué hace, comando válido según el puente :5000,
> y estado (verificada / no verificada / bloqueada por el puente).
>
> **Convención de verificación:** "verificada" = se llamó al menos una vez y
> devolvió `ok: true` o un resultado útil. "no verificada" = no se llamó este turno.
> "bloqueada" = el puente rechaza el comando por metacaracteres o lista blanca.

---

## Familia 1 — Plan y tareas (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 1 | `set_plan` | Define la lista de tareas del turno | `set_plan({tasks:[{id,description}]})` | verificada |
| 2 | `update_task` | Actualiza estado de una tarea | `update_task({task_id,status})` | verificada |

## Familia 2 — Archivos del sandbox (8)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 3 | `list_files` | Lista archivos del sandbox | `list_files({})` | verificada |
| 4 | `read_file` | Lee un archivo completo | `read_file({path})` | verificada |
| 5 | `read_file_range` | Lee un rango de líneas | `read_file_range({path,start,end})` | verificada |
| 6 | `write_file` | Escribe/crea archivo completo | `write_file({path,content})` | verificada |
| 7 | `edit_file` | Reemplaza un fragmento exacto | `edit_file({path,find,replace})` | verificada |
| 8 | `append_file` | Añade contenido al final | `append_file({path,content})` | verificada |
| 9 | `search_in_files` | Busca texto en todos los archivos | `search_in_files({query})` | verificada |
| 10 | `make_dir` | Crea una carpeta | `make_dir({path})` | verificada |

## Familia 3 — Archivos del sandbox (destructiva) (1)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 11 | `delete_file` | Borra un archivo del sandbox | `delete_file({path})` — **destructiva: pedir confirmación** | no verificada |

## Familia 4 — Ejecución y tests (3)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 12 | `run_command` | Ejecuta un comando en el sandbox | `run_command({command})` | verificada |
| 13 | `run_tests` | Ejecuta las pruebas del proyecto | `run_tests({command?})` | verificada |
| 14 | `find_symbol` | Busca funciones/clases/interfaces | `find_symbol({name})` | verificada |

## Familia 5 — Revisión y deshacer (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 15 | `revisar_cambios` | Juzga la tanda de cambios | `revisar_cambios({})` | no verificada |
| 16 | `deshacer_cambios` | Deshace la última tanda | `deshacer_cambios({})` | no verificada |

## Familia 6 — Ingesta y promoción (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 17 | `ingresar_archivo_workspace` | Registra archivo en árbol de entrada | `ingresar_archivo_workspace({path,content,origen})` | no verificada |
| 18 | `promover_archivo_sandbox` | Promueve archivo al sandbox | `promover_archivo_sandbox({path})` | no verificada |

## Familia 7 — PC real (6)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 19 | `pc_info` | Info del sistema (OS, usuario, rutas) | `pc_info({})` | verificada |
| 20 | `pc_exec` | Ejecuta comando REAL en la PC | `pc_exec({command})` — **ver [puente] abajo** | verificada |
| 21 | `pc_write_file` | Crea/sobrescribe archivo REAL | `pc_write_file({path,content})` | verificada |
| 22 | `pc_read_file` | Lee archivo REAL | `pc_read_file({path})` | verificada |
| 23 | `pc_list_dir` | Lista carpeta REAL | `pc_list_dir({path})` | verificada |
| 24 | `pc_delete` | Borra archivo REAL | `pc_delete({path})` — **destructiva: pedir confirmación** | no verificada |

## Familia 8 — Git (3)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 25 | `git_status` | Estado del repositorio | `git_status({})` | no verificada |
| 26 | `git_diff` | Diff de cambios sin commitear | `git_diff({path?})` | no verificada |
| 27 | `git_commit` | Commit con mensaje | `git_commit({message})` | no verificada |

## Familia 9 — Red (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 28 | `fetch_url` | Descarga texto de URL pública | `fetch_url({url,max_chars?})` | no verificada |
| 105 | `abrir_red` | Varias preguntas de red en UNA petición firmada | `abrir_red({consultas:[…]})` | no verificada |

## Familia 10 — Complementos (1)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 29 | `forjar_complemento` | Crea extensión desde receta JSON | `forjar_complemento({receta})` | no verificada |

## Familia 11 — Espejos (1)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 30 | `consultar_espejo` | Llama espejos deterministas en lote | `consultar_espejo({llamadas:[{espejo,datos}]})` | no verificada |

## Familia 12 — Conversión de formatos (1)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 31 | `convertir_formato` | Convierte JSON/YAML/TOML/CSV | `convertir_formato({texto,desde,hacia})` | no verificada |

## Familia 13 — Ollama (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 32 | `ollama_estado` | Modelos residentes en RAM | `ollama_estado({})` | no verificada |
| 33 | `ollama_expulsar` | Descarga modelo de RAM | `ollama_expulsar({model?})` | no verificada |

## Familia 14 — Recursos (1)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 34 | `recursos_maquina` | Mide CPU, RAM, Ollama | `recursos_maquina({})` | no verificada |

## Familia 15 — Cerebro largo plazo (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 35 | `cerebro_recordar` | Guarda conocimiento en cerebro | `cerebro_recordar({tema,titulo,texto})` | no verificada |
| 36 | `cerebro_consultar` | Consulta el cerebro por tema | `cerebro_consultar({consulta})` | no verificada |

## Familia 16 — Previsualizador (1)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 37 | `abrir_previsualizador` | Abre el sandbox :3500 | `abrir_previsualizador({motivo?})` | no verificada |

## Familia 17 — Terminal persistente (5)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 38 | `terminal_abrir` | Abre shell persistente | `terminal_abrir({cwd?,shell?})` | no verificada |
| 39 | `terminal_enviar` | Envía línea a terminal abierta | `terminal_enviar({id,data})` | no verificada |
| 40 | `terminal_cerrar` | Cierra terminal persistente | `terminal_cerrar({id})` | no verificada |
| 41 | `terminal_leer` | Lee salida sin escribir | `terminal_leer({id})` | no verificada |
| 42 | `terminal_listar` | Lista terminales vivas | `terminal_listar({})` | no verificada |

## Familia 18 — Generación de documentos (3)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 43 | `generar_pdf` | Crea PDF desde markdown | `generar_pdf({path,contenido,titulo?})` | no verificada |
| 44 | `generar_docx` | Crea Word desde markdown | `generar_docx({path,contenido,titulo?})` | no verificada |
| 45 | `generar_xlsx` | Crea Excel desde datos tabulados | `generar_xlsx({path,hojas:[{nombre?,cabeceras?,filas}]})` | no verificada |

## Familia 19 — Creador web: estado y plantillas (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 46 | `estado_creador` | Estado del pack creador | `estado_creador({})` | no verificada |
| 47 | `plantillas_disponibles` | Lista bloques, paletas, tipos | `plantillas_disponibles({})` | no verificada |

## Familia 20 — Creador web: sitios (3)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 48 | `crear_sitio` | Genera sitio completo | `crear_sitio({nombre,...})` | no verificada |
| 49 | `crear_bloque` | Inserta/reemplaza un bloque | `crear_bloque({sitio,bloque,...})` | no verificada |
| 50 | `insertar_imagen` | Coloca imagen en sitio | `insertar_imagen({sitio,...})` | no verificada |

## Familia 21 — Creador web: auditoría (4)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 51 | `auditar_pagina` | Audita una página HTML | `auditar_pagina({archivo})` | no verificada |
| 52 | `auditar_sitio` | Audita todas las páginas | `auditar_sitio({sitio})` | no verificada |
| 53 | `mejorar_pagina` | Arregla lo seguro, informa lo humano | `mejorar_pagina({archivo,aplicar?})` | no verificada |
| 54 | `auditar_contraste` | Contraste WCAG real | `auditar_contraste({sitio?,pares?})` | no verificada |

## Familia 22 — Creador web: componentes (5)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 55 | `crear_pwa` | Genera manifest + service worker | `crear_pwa({sitio,...})` | no verificada |
| 56 | `crear_og_image` | Crea OG image SVG 1200x630 | `crear_og_image({sitio,...})` | no verificada |
| 57 | `componente_modo_oscuro` | Añade tema claro/oscuro | `componente_modo_oscuro({sitio,...})` | no verificada |
| 58 | `componente_consentimiento` | Banner de cookies | `componente_consentimiento({sitio,politica_url})` | no verificada |
| 59 | `formulario_destino` | Da destino real al formulario | `formulario_destino({sitio,accion,metodo?})` | no verificada |

## Familia 23 — Creador web: páginas y sitios (3)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 60 | `crear_pagina` | Añade página a sitio existente | `crear_pagina({sitio,ruta,...})` | no verificada |
| 61 | `crear_sitio_multipagina` | Genera sitio multipágina | `crear_sitio_multipagina({nombre,paginas,...})` | no verificada |
| 62 | `generar_schema_jsonld` | Inyecta JSON-LD | `generar_schema_jsonld({sitio,tipo,nombre,...})` | no verificada |

## Familia 24 — Creador web: rendimiento y bucles (4)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 63 | `preflight_rendimiento` | Presupuesto de bytes/peticiones | `preflight_rendimiento({sitio})` | no verificada |
| 64 | `mejorar_hasta_estable` | Bucle de mejora hasta converger | `mejorar_hasta_estable({sitio,...})` | no verificada |
| 65 | `forjar_desde_brief` | Forja sitio en una pasada | `forjar_desde_brief({brief})` | no verificada |
| 66 | `forjar_y_entregar` | Bucle a prueba de errores + ZIP | `forjar_y_entregar({brief,...})` | no verificada |

## Familia 25 — Creador web: planificación y ejecución (4)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 67 | `plan_de_construccion` | Traduce brief a contrato de bucle | `plan_de_construccion({nombre,...})` | no verificada |
| 68 | `crear_archivo` | Escribe un archivo en sitio | `crear_archivo({sitio,ruta,...})` | no verificada |
| 69 | `planificar_ruta_trabajo` | Valida artefactos antes de crear | `planificar_ruta_trabajo({orden,artefactos})` | no verificada |
| 70 | `ejecutar_ruta_paralelo` | Ejecuta artefactos en paralelo | `ejecutar_ruta_paralelo({orden,artefactos})` | no verificada |

## Familia 26 — Creador web: exportación y despliegue (4)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 71 | `exportar_sitio_zip` | Empaqueta sitio en ZIP | `exportar_sitio_zip({sitio,salida?})` | no verificada |
| 72 | `desplegar_carpeta` | Copia sitio a destino | `desplegar_carpeta({sitio,destino,...})` | no verificada |
| 73 | `verificar_despliegue` | Compara hash fuente vs destino | `verificar_despliegue({sitio,destino})` | no verificada |
| 74 | `listar_exportaciones` | Lista ZIPs de exportaciones | `listar_exportaciones({})` | no verificada |

## Familia 27 — Creador web: misc (2)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 75 | `listar_sitios` | Lista sitios generados | `listar_sitios({})` | no verificada |
| 76 | `previsualizar_sitio` | Dice cómo previsualizar | `previsualizar_sitio({sitio})` | no verificada |
| 77 | `generar_hreflang` | Declara alternates hreflang | `generar_hreflang({sitio,idiomas,base_url})` | no verificada |

## Familia 28 — Memoria híbrida: estado y recall (3)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 78 | `memory_estado` | Estado de la memoria híbrida | `memory_estado({})` | no verificada |
| 79 | `memory_recall` | Busca hechos concretos | `memory_recall({query})` | no verificada |
| 80 | `memory_guardar_aprendizaje` | Guarda aprendizaje corto | `memory_guardar_aprendizaje({contenido,...})` | no verificada |

## Familia 29 — Memoria híbrida: páginas (4)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 81 | `memory_leer_page` | Lee página de conocimiento | `memory_leer_page({page_id})` | no verificada |
| 82 | `memory_listar_pages` | Lista páginas existentes | `memory_listar_pages({})` | no verificada |
| 83 | `memory_guardar_page` | Crea/actualiza página | `memory_guardar_page({page_id,name,...})` | no verificada |
| 84 | `memory_borrar_page` | Borra página permanentemente | `memory_borrar_page({page_id})` — **destructiva** | no verificada |

## Familia 30 — Memoria híbrida: operaciones (5)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 85 | `memory_reflect` | Síntesis razonada | `memory_reflect({query,...})` | no verificada |
| 86 | `memory_ingest` | Ingiere documento completo | `memory_ingest({title,content})` | no verificada |
| 87 | `memory_aprender_de_error` | Registra lección de bug | `memory_aprender_de_error({contexto,error,causa,correccion,verificacion})` | no verificada |
| 88 | `memory_repasar` | Higiene del espejo | `memory_repasar({aplicar?})` | no verificada |
| 89 | `memory_olvidar` | Borra unidades por id | `memory_olvidar({id?,ids?})` — **destructiva** | no verificada |

## Familia 31 — Memoria híbrida: mantenimiento (4)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 90 | `memory_indexar_proyecto` | Ingiere docs del proyecto | `memory_indexar_proyecto({documento?})` | no verificada |
| 91 | `memory_conflictos` | Cruza memoria vs acta | `memory_conflictos({acta?})` | no verificada |
| 92 | `memory_exportar` | Exporta memoria a json/md | `memory_exportar({nombre,formato?})` | no verificada |
| 93 | `memory_importar` | Importa exportación previa | `memory_importar({nombre,...})` | no verificada |
| 94 | `memory_vectorizar` | Calcula embeddings | `memory_vectorizar({limite?})` | no verificada |

## Familia 32 — Skills (3)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 95 | `listar_skills` | Lista skills instaladas | `listar_skills({filtro?,limite?})` | no verificada |
| 96 | `leer_skill` | Carga contenido de skill | `leer_skill({skill,archivo?})` | no verificada |
| 97 | `skill_buscar` | Busca dentro de skills (BM25) | `skill_buscar({query,top_k?})` | no verificada |

## Familia 33 — FS del PC (6)

| # | Herramienta | Qué hace | Comando puente válido | Estado |
|---|---|---|---|---|
| 98 | `fs_read` | Lee archivo del PC | `fs_read({path})` | no verificada |
| 99 | `fs_write` | Escribe texto en PC | `fs_write({path,content})` | no verificada |
| 100 | `fs_write_b64` | Escribe binario en PC (base64) | `fs_write_b64({path,data_b64})` | no verificada |
| 101 | `fs_list` | Lista directorio del PC | `fs_list({path})` | no verificada |
| 102 | `fs_delete` | Elimina archivo (papeliza) | `fs_delete({path})` — **destructiva: papeliza** | no verificada |
| 103 | `fs_mkdir` | Crea directorio en PC | `fs_mkdir({path})` | no verificada |
| 104 | `exec` | Ejecuta comando permitido | `exec({command})` | no verificada |

---

## Lecciones del puente :5000 (comandos válidos y bloqueados)

### [puente] Metacaracteres rechazados

El puente :5000 (FastAPI/Python) **rechaza** los siguientes metacaracteres en
`pc_exec` y `exec`:

| Metacaracter | Error devuelto | Causa |
|---|---|---|
| `&&` | `separador «&» suelto no permitido` | composición de comandos |
| `\|` (pipe) | `redirección a fichero no permitida` | pipe interpretado como redirect |
| `>` | `redirección a fichero no permitida` | redirect literal |
| `2>nul` | `redirección a fichero no permitida` | supresión de stderr |
| `-e` con comillas anidadas | `binario «x» no está en la lista blanca` | parseo de argumentos |

**Ruta segura:** escribir un script `.cjs` o `.mjs` a disco con `pc_write_file`
y ejecutarlo por ruta absoluta con `pc_exec({command: "node C:\\ruta\\script.cjs"})`.
No reintentar el mismo comando con el metacaracter.

### [puente] Lista blanca de binarios

El puente solo ejecuta binarios en su lista blanca. Verificados en este turno:

| Binario | Estado | Nota |
|---|---|---|
| `node` | permitido | ejecutar scripts .cjs/.mjs por ruta absoluta |
| `dir` | permitido | listar archivos (sin redirect) |
| `findstr` | permitido | buscar texto en archivos (sin redirect) |
| `python` | no verificado | asumo permitido (FastAPI corre sobre Python) |

### [crlf] Finales de línea CRLF en Windows

Los archivos del IDE en Windows usan **CRLF** (`\r\n`). Los parches con
`edit_file` o scripts que buscan `\n` fallan silenciosamente porque el texto
real tiene `\r\n`. **Ruta segura:** escribir un script `.cjs` que:
1. Lee el archivo con `fs.readFileSync(path, 'utf8')`
2. Normaliza a `\n` (`content.replace(/\r\n/g, '\n')`)
3. Aplica el reemplazo
4. Devuelve a `\r\n` (`result.replace(/\n/g, '\r\n')`)
5. Escribe con `fs.writeFileSync(path, result, 'utf8')`

Este defecto se repitió en `arraigo.test.ts` y `poderes-espejos.ts`.

---

> **Total: 105 herramientas** en 33 familias (46 en proceso + 59 externas del puente).
> Actualizado: 2026-11-19 · v1.0.31 (añadida `abrir_red`; antes decía 104)

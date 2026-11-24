# INFORME DE AUDITORÍA — CerebroNico IDE (en desarrollo)

**Fecha:** 30 de octubre de 2026 · 17:xx (America/Montevideo)
**Versión del proyecto:** 1.97.3 (`CerebroNico-IDE-v1.97.3\app`, 2059 archivos)
**Método:** ejecución real de las herramientas disponibles en un turno de agente (canal de funciones + puente PC :5000 + packs MCP). Nada se da por bueno sin haber llamado a la herramienta y leído su resultado.

---

## 1. Entorno verificado

| Dato | Valor |
|---|---|
| SO | Windows (win32) |
| Usuario | BirdBox |
| Escritorio real | `C:\Users\BirdBox\Desktop` |
| CPU / RAM | 4 núcleos · 16 GB (9 GB libres) |
| Ollama :11434 | vivo, **0 modelos residentes** (apagado por defecto en esta máquina — esperado) |
| Puente PC :5000 | activo (bridge respondiendo) |
| Sandbox / preview | :3500 (no arrancado durante la prueba) |
| Memoria Hindsight :5100 | **modo espejo-local** (backend no configurado — esperado) |
| Creador web :5102 | activo, 0 sitios registrados |

---

## 2. Resumen ejecutivo

El IDE arranca y la gran mayoría de sus subsistemas responden. Se probaron ~40 herramientas de 103 y se encontraron **2 fallos reales que conviene corregir antes de la próxima entrega**, más 4 fricciones menores.

### 🔴 Fallo crítico nº 1 — La ejecución de comandos por el puente Python está ROTA

Herramientas afectadas: **`pc_exec`** y **`exec`** (ambas delegan en el puente :5000 → `/api/exec`).

Error exacto devuelto (HTTP 500 desde el pack remoto):

```
quote() got an unexpected keyword argument 'posix'
```

Reproducido con comandos triviales (`node --version`, `echo CWD=%CD%`): todos fallan con el mismo traceback, **antes** de ejecutar nada.

**Causa raíz (hipótesis de alta confianza):** el código Python del puente (`agent_bridge_5000.py`) invoca una función de la stdlib —`shlex.quote(...)` o similar— pasándole un argumento `posix` que la versión de Python instalada no admite. En la stdlib, `shlex.split(s, posix=...)` existe, pero `shlex.quote(s, posix=...)` NO. Si se escribió `shlex.quote(cmd, posix=True)` (o se le pasó `posix` a una función que no lo declara), falla exactamente con este mensaje.

**Importante:** la ejecución por Node **sí funciona**. `run_command` (sandbox, cmd.exe) y la terminal persistente (`terminal_abrir`/`terminal_enviar`) ejecutan comandos sin problema. El fallo está acotado al puente Python.

**Impacto:** el "Modo Agente PC" no puede ejecutar comandos reales en la máquina. Sí puede leer/escribir/listar archivos (fs_* / pc_read_file / pc_write_file / pc_list_dir funcionan), pero no ejecutar.

**Sugerencia de arreglo:** localizar en `agent_bridge_5000.py` la llamada a `shlex.quote` (o `subprocess` con `posix=`) y quitar/adaptar el argumento `posix` a la versión de Python del equipo.

---

### 🟠 Fallo medio nº 2 — `pc_write_file` con atajo `Desktop/` escribe en la carpeta de la app, NO en el escritorio real

Pedido: `Desktop/cerebronico_test_probe.txt`.

Resultado devuelto:

```
C:\Users\BirdBox\Downloads\accio v1.97.3\CerebroNico-IDE-v1.97.3\app\Desktop\cerebronico_test_probe.txt
```

El atajo `Desktop/` **no se resolvió contra el escritorio real** (`C:\Users\BirdBox\Desktop`, que `pc_info` sí reporta correctamente). En su lugar creó una carpeta espuria `Desktop\` **dentro de la carpeta de instalación de la app** y escribió ahí.

**Impacto:** un usuario que pida "guardame esto en el escritorio" ve el archivo en un lugar equivocado (dentro de la app), no en su escritorio.

**Nota:** con ruta **absoluta** (`C:\Users\BirdBox\Desktop\...`) la escritura sí apunta bien (este informe se escribió así). El bug es exclusivo de la resolución del atajo `Desktop/` (y probablemente de `Documents/`, `Downloads/`, `~`).

**Sugerencia de arreglo:** en el puente (o en el resolutor de atajos), mapear `Desktop`/`Documents`/`Downloads`/`~` contra los directorios reales del usuario (`%USERPROFILE%`) en lugar de resolverlos relativos al cwd del proceso.

---

## 3. Fricciones menores (no rompen nada, pero ensucian la experiencia)

### 3.1 — `list_files` / `find_symbol` / `search_in_files` no ven la carpeta vinculada

- `list_files` devolvió **solo 3 archivos** (`.bridge_5000.log`, `.cerebro-db/*`), mientras que `read_file("package.json")` **sí** resolvió al `package.json` real de la carpeta vinculada (2059 archivos).
- `find_symbol("decidirBucle")` → `0 archivo(s) indexado(s), 0 símbolo(s)`.
- `search_in_files("buildSuperPrompt")` → 0 coincidencias, **aunque `buildSuperPrompt` existe literalmente en `server.ts`** (verificado por lectura directa).

Hay una inconsistencia: la lectura resuelve contra la carpeta vinculada, pero el listado, el índice de símbolos y la búsqueda trabajan contra otra raíz (parece `PROJECT_ROOT`, que está vacía). El motor cree que el proyecto tiene 0 archivos indexados.

### 3.2 — Fricción de parámetros en los espejos (`consultar_espejo`)

Los espejos calculan bien (~1 ms, exactos), pero los nombres de parámetros no coinciden con lo que sugiere la ficha:

- `espejo.artes` acción `contraste` espera `a`/`b` (hex `#rrggbb`), no `fondo`/`frente`.
- `espejo.codigos` acción `firmas` espera `codigo`, no `texto`.

El feedback de error es claro y correctivo (dice qué campo falta), así que es tolerable, pero convendría alinear la documentación con la implementación.

### 3.3 — Separador `&` bloqueado en `pc_exec`

La aduana de seguridad rechaza un `&` suelto: `separador «&» suelto no permitido (puede componer en cmd.exe)`. Es una **medida de seguridad razonable**, pero impide encadenar comandos en una sola llamada. (Curiosamente, la terminal persistente sí admite `&`.)

### 3.4 — Hindsight en modo espejo-local

`memory_estado` → `backend_configurado: false`, `aviso: Sin HINDSITE_API_URL: MODO ESPEJO permanente`. No es un bug: es el estado correcto sin el daemon Hindsight. La síntesis LLM de memoria no está disponible; solo el espejo local. Documentado, no falla.

---

## 4. Herramientas verificadas OK (sin fallo)

| Familia | Herramientas | Estado |
|---|---|---|
| Lectura/escritura sandbox | `read_file`, `run_command` | ✔ |
| Canal PC (archivos) | `fs_list`, `fs_read`, `pc_list_dir`, `pc_read_file`, `pc_write_file` (ruta absoluta) | ✔ |
| Ejecución por Node | `run_command` (cmd), `terminal_abrir`/`terminal_enviar` | ✔ |
| Espejos | `consultar_espejo` (matemáticos, artes, códigos, planificadores) | ✔ (con §3.2) |
| Conversión | `convertir_formato` (JSON→YAML con informe de pérdidas) | ✔ |
| Documentos | `generar_pdf` (PDF real de 1 página) | ✔ |
| Memoria larga | `cerebro_recordar` / `cerebro_consultar` | ✔ |
| Memoria Hindsight | `memory_estado` / `memory_recall` (espejo-local) | ✔ |
| Creador web | `estado_creador`, `listar_sitios` (0 sitios, 15 bloques / 9 paletas / 11 tipos) | ✔ |
| Sistema | `pc_info`, `recursos_maquina`, `ollama_estado`, `ollama_expulsar` | ✔ |

---

## 5. Lo que NO se llegó a probar (dejado deliberadamente)

- Generación de imágenes (`generar_imagen`/cadena Pollinations) — requiere red con autorización previa.
- `fetch_url` — requiere autorización previa del usuario.
- `generar_docx` / `generar_xlsx` — análogos a `generar_pdf`, que sí funcionó.
- Los 15 bloques del creador web (`crear_sitio` etc.) — el pack responde, pero no se forjó un sitio completo.
- Git (`git_status`/`git_diff`/`git_commit`) — no se tocó el repositorio.
- Previsualizador :3500 — no se arrancó el sandbox durante la auditoría.

---

## 6. Prioridades sugeridas para la próxima entrega

1. **Arreglar la ejecución por puente** (`quote() ... posix`) — bloquea el "Modo Agente PC" completo.
2. **Arreglar la resolución de atajos** (`Desktop/`, `Documents/`, `~`) en `pc_write_file`/`pc_read_file`/`pc_list_dir`.
3. **Unificar la raíz de trabajo** entre `list_files` / `find_symbol` / `search_in_files` y `read_file`, para que el índice de símbolos y la búsqueda vean la carpeta vinculada.

*Informe generado por el propio CerebroNico ejecutando sus herramientas. Ningún resultado fue simulado: cada afirmación proviene de una llamada real con su salida.*

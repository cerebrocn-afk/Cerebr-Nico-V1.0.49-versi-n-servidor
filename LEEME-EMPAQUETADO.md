# LEEME — EMPAQUETADO AUTÓNOMO (v1.20.1)

Respuesta al «INFORME TÉCNICO — Configuración de CerebroNico IDE para
distribución como EXE autónomo en Windows» y a su PLAN EJECUTABLE.

**Condición fundamental del informe:** *«No alcanza con copiar los archivos
`.py` dentro del instalador.»* — resuelta con un **CPython de Windows
embebido, portable y verificado por SHA-256**, que viaja dentro del paquete.

---

## 1. Qué hace autónomo al instalador

Los tres servicios Python son **100 % biblioteca estándar** (verificado:
`agent_bridge_5000.py`, `scripts/hindsight_daemon.py`,
`scripts/creador_daemon.py` solo importan `http.server`, `json`, `os`, `re`,
`shutil`, `socket`, `subprocess`, `threading`, `time`, `unicodedata`, `urllib`,
`secrets`, `argparse`, `math`, `glob`, `io`, `codecs`, `queue`, `collections`).
Ninguno necesita `fastapi`/`uvicorn`/`pydantic` — esos son del agente
FastAPI (`app/`), que en producción se usa como EXE o no se usa.

Por eso basta con llevar un intérprete consigo:

| Pieza | Origen | Destino en el instalador |
|---|---|---|
| `runtime/python-embed/` (CPython 3.12.10 embed-amd64, 35 archivos) | `node scripts/preparar-python-embed.mjs` (descarga oficial de python.org + SHA-256; queda cacheado en `runtime/python-embed.zip` para builds offline) | `resources/python-embed/` |
| `agent_bridge_5000.py` + `app/` + `scripts/*.py` + `skills/` + configs | el propio proyecto | `resources/app/…` (asar=false) |
| `scripts/hindsight_daemon.py`, `scripts/creador_daemon.py` (copia de diagnóstico) | el propio proyecto | `resources/services/` |
| `dist/*.exe` (PyInstaller, **opcionales**) | `build_backend.bat` | `resources/dist/` |

En la máquina del usuario, `electron-main.cjs` (v3.5) **ante-pone
`resources/python-embed/` al PATH** del server forkeado y expone `CN_PYTHON`.
Cualquier `where python` / `spawn('python', …)` del backend resuelve primero
el intérprete embebido → `:5000`, `:5100` y `:5102` arrancan **sin Python,
sin pip, sin venv y sin PyPI** (informe §4, §15, §29).

Orden de prioridad en tiempo de ejecución (informe §14):

```text
1. resources/dist/*.exe        (si se compilaron con build_backend.bat)
2. resources/python-embed/     (SIEMPRE presente: lo garantiza verificar-artefactos.mjs)
3. Python del sistema          (solo en desarrollo; ya no es requisito)
```

## 2. Puertos y procesos (informe §17)

| Servicio | Puerto | Proceso en producción |
|---|---:|---|
| CerebroNico Server | 3000 | Node/Electron (`resources/app/dist/server.mjs`) |
| Puente PC | 5000 | `cerebronico_bridge.exe`/`CerebroNicoAgent.exe` o `python-embed` + `.py` |
| Hindsight (memoria) | 5100 | `hindsight_daemon.exe` o `python-embed` + `scripts/hindsight_daemon.py` |
| Creador Web (22 herramientas) | 5102 | `creador_daemon.exe` o `python-embed` + `scripts/creador_daemon.py` |
| Ollama | 11434 | externo al paquete (como siempre) |

Adopción sin duplicados (§16): el BAT de arranque ya comprobaba el puerto
antes de lanzar (`netstat … LISTENING → no se duplica`); el puente :5000 se
autocomprueba desde `server.ts`. En el EXE empaquetado los daemons viven
donde los ponga su `server.ts`/BAT con esa misma lógica, y ahora encuentran
intérprete garantizado.

## 3. Raíces de datos — nada del equipo desarrollador (informe §10, §26)

`electron-main.cjs` e `iniciar_todo_windows.bat` fijan ahora, para los
daemons:

```text
CN_CREADOR_ROOT     = C:\Cerebronico\.creador          (sitios generados + historial)
CN_HINDSITE_MIRROR  = C:\Cerebronico\hindsight-mirror.json
PYTHONDONTWRITEBYTECODE = 1     (ningún __pycache__ dentro de resources/)
```

Ningún archivo del paquete contiene rutas `C:\Users\…`: los `.spec` usan
rutas relativas al proyecto (`../scripts/…`, `pathex=['..']`), el script de
runtime descarga de `python.org` (URL fija + hash) y `verificar-artefactos.mjs`
aborta el build si falta algo (§22).

## 4. Cadena de compilación reproducible (informe §21)

En Windows, un solo comando:

```text
compilar_exe_windows.bat
  [1/5] npm install
  [2/5] node scripts\preparar-python-embed.mjs   ← Python embebido (caché offline)
  [3/5] npm run build                            ← vite + esbuild → dist/server.mjs
  [4/5] build_backend.bat                        ← 4 EXEs PyInstaller (OPCIONAL)
  [5/5] npm run dist                             ← verificar-artefactos.mjs && electron-builder
```

`npm run dist` **aborta** si falta alguno de los obligatorios:
`dist/server.mjs`, `dist/index.html`, `electron-main.cjs`, puente y dos
daemons `.py`, `tools.config.json`, `requirements.txt` y
`runtime/python-embed/python.exe`. Nunca se genera un instalador cojo.

Los `.spec` quedan **dentro del proyecto** (`build/*.spec`) y viajan con él:
reproducibilidad y auditoría (§11, §19, entregables 9 del informe).

## 5. Pruebas de aceptación (informe §23–§25, §29)

En una Windows **sin Python/pip/venv** (y sin el proyecto fuente):

1. Instalar `CerebróNico Setup.exe` (o abrir el portable) → Prueba A.
2. `curl http://127.0.0.1:3000` → 200 · `:5000/health` → OK ·
   `:5100/tools` → 200 · `:5102/tools` → 200 con las **22 herramientas** → Prueba E.
3. En el log del server no debe aparecer `python no encontrado` ni
   `ModuleNotFoundError` → Prueba B.
4. Cerrar y volver a abrir ×3 → sin huérfanos, sin EADDRINUSE → Prueba C.
5. Levantar a mano algo en :5100 antes de abrir → se adopta, no duplica → Prueba D.
6. Probar en `C:\Program Files\CerebróNico` y en `D:\CerebroNico` → mismo
   resultado → Prueba §25.
7. Los datos (`C:\Cerebronico`) sobreviven a la reinstalación: el instalador
   solo escribe en `resources/`.

## 6. Qué NO cambió

`server.ts` (usted lo adaptó), los daemons `.py` (intactos), el motor, la UI
de chat y la semilla de comportamiento. Los cambios viven en la capa de
empaquetado: `package.json → build`, `electron-main.cjs` (v3.5), los dos BAT,
`scripts/preparar-python-embed.mjs`, `scripts/verificar-artefactos.mjs`,
`build_backend.bat` y `build/*.spec`.

Arreglo de UI incluido en esta versión (captura del 29/09): el botón
«Tareas» ya no tapa los botones de la barra derecha (se ancla a la altura
REAL medida de la banda superior, no a `top-[54px]` fijo) y el compositor
volvió a centrarse (el despeje del panel se come como padding, no como
margen — véase `ChatCenter.tsx` v1.20.1).

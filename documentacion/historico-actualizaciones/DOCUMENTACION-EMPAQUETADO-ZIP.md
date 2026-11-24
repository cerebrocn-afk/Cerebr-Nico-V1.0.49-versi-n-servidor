# EMPAQUETADO DEL ÁRBOL EN ZIP — criterio verificado (v2.3.11)

Distinto de `LEEME-EMPAQUETADO.md`: aquél describe el **instalador EXE**
(PyInstaller + electron-builder + python-embed). Éste describe el **ZIP del
árbol de trabajo**, que es lo que se manda para restaurar el proyecto.

Las cifras de abajo están **medidas sobre disco** el 5/11/2026 sobre la raíz
`CerebroNico-IDE-v2.3.8` (nombre de carpeta viejo) con semilla
`VERSION_SEMVER = "2.3.11"`. No son estimaciones.

---

## 1. La regla

> **Se empaqueta lo que no se puede regenerar con un comando.**
> Si `npm install` o `npm run build` lo producen, NO va en el ZIP.

Corolario que costó varias vueltas entender: el tamaño del ZIP debe parecerse
al del **original de referencia** (el "virgen"), no al del disco. Si el ZIP
sale mucho más grande que el original, se colaron artefactos.

## 2. Qué NO va (regenerable o desechable)

| Ruta | Peso medido | Por qué |
|---|---:|---|
| `node_modules/` | **321,84 MB** (17.139 arch) | lo repone `npm install` |
| `dist/` | **21,62 MB** (14 arch) | lo repone `npm run build` |
| `_respaldo-pre-2.3.9-*` | ~2 MB | copia del propio árbol |
| `.cerebro-papelera/` | — | papelera del motor (recuperable, no fuente) |
| `.proyectos/`, `.cerebro-db/` | — | datos del usuario, no del proyecto |
| `.tmp-*`, `__pycache__/` | — | temporales de compilación |
| `*.log`, `*.bak`, `*.swp` | — | efímeros |

En una raíz de 441,60 MB crudos, `node_modules` + `dist` son
**343,46 MB (78 %)**. El proyecto real son ~98 MB.

## 3. Qué SÍ va

Incluido por el **original de referencia** (`CerebroNico-IDE-v2.3.9.zip`,
52,39 MB, 2.230 entradas) y por tanto obligatorio:

| Ruta | Peso medido | Nota |
|---|---:|---|
| `skills/` | **28,24 MB** (965 arch) | 229 skills, cuentan como contenido |
| `runtime/python-embed/` | **21,46 MB** (36 arch) | **no** se instala por npm: viaja dentro |
| `src/` | 9,96 MB | el motor y la UI |
| `public/` | 7,99 MB | assets de la UI |
| `documentacion/` | 5,35 MB | manuales |
| `tests/` | 3,23 MB | suites |
| `memoria_history/` | 2,35 MB | historial de memoria |
| `scripts/` | 1,27 MB | validadores, daemons, empaquetado |
| `server/` | 0,53 MB | routers HTTP |
| `extensions/`, `vendor/`, `prompts/`, `models/`, `tools/`, `ejemplos/`, `espejos_servidor/`, `manual-motor/` | menor | verificado en el original |
| `app/app.7z` | 870 KB | **también viene en el original**: es parte del paquete |
| `server.ts`, `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `.bat`, `*.md` de proyecto | menor | arranque y documentación |

Regla de discriminación útil: **`python-embed` sí se empaqueta** (no hay
comando del proyecto que lo regenere sin red) pero **`node_modules` no**
(`npm install` lo repone desde `package-lock.json`).

## 4. Qué queda FUERA aunque exista

`web-cerebronico/` — es la web publicada, no el IDE. **El original de
referencia no la incluye.** Si se quiere publicar por separado, va en su
propio paquete.

## 5. El manifiesto NO es una lista de inclusión

`CerebroNico-IDE-v2.3.8-MANIFIESTO.txt` (40.568 bytes) es un índice de
**hashes SHA-256 de entregables**, no un filtro del árbol. No sirve para
decidir qué archivo entra. La única fuente fiable de la lista de inclusión es
**el ZIP original comparado archivo a archivo**, que es como se derivó la
tabla del §3.

`build.files` **no existe** en el árbol pese a estar referenciado: los `.bat`
presentes (`build_backend.bat`, `compilar_exe_windows.bat`) compilan el backend
Python y el EXE, no empaquetan el árbol.

## 6. Verificación obligatoria antes de entregar

No se declara un paquete "hecho" sin pasar estas cuatro comprobaciones:

1. **`testzip()` sin fallos** — CRC de todas las entradas, no sólo la cabecera.
2. **Cero rutas prohibidas** — buscar `node_modules/`, `/dist/`,
   `_respaldo-`, `.cerebro-papelera/` dentro del listado del ZIP.
3. **Presencia de los archivos de arranque** — `app/package.json`,
   `app/index.html`, `app/server.ts`, `app/vite.config.ts`, `app/src/App.tsx`.
4. **Contraste de peso y conteo con el original** — si el ZIP pesa más que el
   virgen o tiene miles de entradas de más, algo se coló.

## 7. Resultado de la pasada válida (5/11/2026)

```
CerebroNico-IDE-v2.3.11.zip   52,87 MB   2.262 entradas   93,37 MB crudos
  CRC OK en las 2.262 · 0 node_modules · 0 dist
  vs. virgen v2.3.9           52,39 MB   2.230 entradas
  delta: +32 entradas = actualizaciones v2.3.11 (chat, estética, puertos, barra de tareas)
```

El delta de 32 entradas es la firma de que el paquete lleva **los cambios y
nada más**.

## 8. Trampa del puente PC (:5000) al comprimir

El puente corta a los **60 s**. `run_command` y `pc_exec` matan el proceso
Python al cortar, dejando ZIP truncados que **parecen válidos por cabecera**.
Lo que falló y no repetir:

- ZIP completo de 99 MB en una sola llamada → **truncado a 28,9 MB**.
- `start /b` y `pythonw` → **no permitidos** por la lista blanca.
- `copy` → **no permitido**; usar Python.

Lo que funciona: escribir un script `.py` en disco, lanzarlo con
compresslevel moderado (~6 sobre 95 MB entra en el límite) y **verificar el
resultado leyendo el ZIP desde disco**, nunca fiándose de la consola.

# Parche v1.0.23 · la caída de los servicios locales

## Qué se cura

**Causa raíz.** El reanimado levantaba los hijos con `process.cwd()` y `shell: true`.
El `cwd` del IDE empaquetado no es la raíz de instalación (un acceso directo con
«Iniciar en» vacío deja `System32`), así que `scripts\<x>.py` no existía y el hijo
moría con `ENOENT` en cada intento; `shell: true` convertía cualquier ruta con
espacios en un error de shell que se tragaba el código real. El `:3000` nunca se cayó:
sin `uncaughtException`/`unhandledRejection`; se caían los hijos.

**Cura 2.1 · raíz fijada y fallos con rastro**
- Nuevo `src/engine/raizInstalacion.ts`: `decidirRaizInstalacion()` resuelve la raíz
  desde `CN_INSTALL_ROOT` → ejecutable → directorio de trabajo, y `server.ts` la
  publica como `RAIZ_INSTALACION`. `electron-main.cjs` inyecta
  `CN_INSTALL_ROOT: __dirname`.
- `server/routers/supervisorArranque.ts` reescrito: `argv` con rutas absolutas,
  `shell: false` (cero `shell: true` en el código) y `cwd` = raíz de instalación.
- Nuevo `src/engine/evidenciaReavivado.ts`: cada intento escribe
  `logs/reavivar-<id>.intentos.log` (motivo, argv, cwd, código de salida, últimas
  líneas de stderr) y el evento `DeIntento` lleva el mismo dato al panel.

**Cura 2.2 · `requirements.txt` sin dependencias fantasma**
- `requirements.txt` de la raíz: **CERO** paquetes reales (fuera `fastapi`, `uvicorn`,
  `python-dotenv`, `pydantic`), con el porqué escrito en el fichero. Los tres daemons
  (`:5100/:5102/:5103`) y el puente son 100% biblioteca estándar y el `python-embed`
  del paquete no trae pip: pedirlos era un faltante imposible que desviaba el
  diagnóstico de arranque.
- `core-agent/requirements.txt` y `documentacion/ide/requirements.txt`: cabecera de
  **ÁMBITO: LEGACY**, versiones fijas con `==`, solo las usa `build_backend.bat`.

## Vallas (más estrictas, no más laxas)
- `tests/raizInstalacion.test.ts` (nueva, 53 comprobaciones): la raíz gana a `cwd`,
  el supervisor no usa `process.cwd()`, cero `shell: true`, evidencia por intento,
  cada `requirements.txt` declara ámbito, versiones fijas con `==`, y el puente sin
  un solo `import` de pip.
- `tests/reavivarServicio.test.ts` (55·0) y `tests/puertosCableados.test.ts` (96·0)
  reformuladas al diseño nuevo: exigen `RAIZ_INSTALACION` y prohíben `process.cwd()`
  y `shell: true`.
- `tests/autonomia_test.py` exige raíz con cero paquetes reales.

## Medido en esta máquina
raizInstalacion 53·0 · reavivarServicio 55·0 · puertosCableados 96·0 ·
derivaDocumental 38·0 · entregableZip 34·0 · interruptoresServicios 32·0 ·
arranqueVentanas 25·0 · resiliencia 38·0.

## Cómo aplicar
Descomprimir sobre la raíz del proyecto respetando rutas (son 19 archivos), luego
`npm install`, `npm run validar`, `npm run build`. Tras compilar, borrar `dist\` y
Ctrl+F5 si abres la ventana de Vite.

## Qué validar tú
1. `npm run validar` completo (los rojos de entorno de siempre —`fetch` en Node16,
   `pdfjs-dist`, `lucide-react`— no son de este parche).
2. `npm run build`.
3. Arrancar y mirar el panel de servicios: los tres daemons deben quedarse arriba.
4. Si algo se cae otra vez, existe `logs\reavivar-<id>.intentos.log`: mándamelo y
   ya no adivinamos.

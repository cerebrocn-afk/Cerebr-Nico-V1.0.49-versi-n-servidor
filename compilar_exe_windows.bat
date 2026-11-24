@echo off
REM ============================================================
REM   CerebroNico IDE - Compilar el EXE instalable (Windows)
REM   v1.20.1 (EMPAQUETADO) - cadena completa de compilacion:
REM     [1/5] npm install                     - dependencias Node
REM     [2/5] preparar-python-embed.mjs       - Python embebido Windows
REM                                             (descarga UNICA vez; luego
REM                                             usa la cache runtime\*.zip con
REM                                             SHA-256: build offline OK)
REM     [3/5] npm run build                   - vite (UI) + esbuild (server.mjs)
REM     [4/5] build_backend.bat               - EXEs PyInstaller (OPCIONAL:
REM                                             sin ellos cubre el embebido)
REM     [5/5] npm run dist                    - verificar-artefactos.mjs
REM                                             (ABORTA si falta algo) y
REM                                             electron-builder
REM
REM   Genera:
REM     dist_electron\CerebroNico IDE Setup (version).exe  - instalador
REM     dist_electron\win-unpacked\CerebroNico IDE.exe     - portable
REM     dist\CerebroNicoAgent.exe / cerebronico_bridge.exe /
REM     dist\hindsight_daemon.exe / creador_daemon.exe     - opcionales
REM
REM   Autonomia del instalador (informe del cliente, sec. 4 y sec. 30):
REM     resources\python-embed\  -> CPython portable que ejecuta los .py de
REM                                :5000, :5100 y :5102 SIN Python del usuario.
REM     resources\dist\*.exe     -> refuerzo PyInstaller si se compilaron.
REM   El usuario final NO necesita: Python, pip, venv, requirements.txt ni PyPI.
REM
REM   REGLAS DE ESTE ARCHIVO: CRLF, sin tildes, solo if/goto, pause real.
REM ============================================================
cd /d "%~dp0"
title CerebroNico IDE - Compilador del EXE
color 0B

echo ============================================================
echo   CerebroNico IDE - Compilacion completa del instalador
echo ============================================================
echo.

REM 0. Verificar npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm no esta en el PATH. Instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)

REM 1. node_modules
if not exist "node_modules" (
    echo [1/5] Instalando dependencias Node ^(npm install^)...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [ERROR] npm install fallo.
        pause
        exit /b 1
    )
) else (
    echo [1/5] node_modules ya presente - OK.
)

REM 2. Python embebido (OBLIGATORIO para el instalador autonomo)
echo.
echo [2/5] Preparando Python embebido de Windows ^(runtime\python-embed^)...
call node scripts\preparar-python-embed.mjs
if %errorlevel% neq 0 (
    echo [ERROR] Falto el Python embebido y no se pudo descargar.
    echo   El instalador NO puede generarse sin runtime\python-embed\python.exe:
    echo   es lo que hace funcionar :5000 :5100 y :5102 en maquinas sin Python.
    echo   Con internet en esta maquina, reintenta; o copia manualmente
    echo   python-3.12.10-embed-amd64.zip a runtime\ y vuelve a ejecutar.
    pause
    exit /b 1
)

REM 3. Build de la UI + server (vite + esbuild)
echo.
echo [3/5] Compilando interfaz y server ^(vite + esbuild^)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] El build de vite/esbuild fallo. Revisa los errores de arriba.
    pause
    exit /b 1
)

REM 4. EXEs Python con PyInstaller (OPCIONAL - refuerzo de arranque)
echo.
echo [4/5] Compilando EXEs Python opcionales ^(PyInstaller^)...
call build_backend.bat

REM 5. Verificacion + empaquetado electron
echo.
echo [5/5] Verificando artefactos y empaquetando con electron-builder...
echo       ^(si falta algo OBLIGATORIO, verificar-artefactos.mjs aborta aqui^)
call npm run dist
if %errorlevel% neq 0 (
    echo [ERROR] electron-builder fallo o falto algun artefacto obligatorio.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   LISTO. Compilacion completa:
echo.
echo   Instalador NSIS:
echo     dist_electron\CerebroNico IDE Setup ^(version^).exe
echo.
echo   Version portable:
echo     dist_electron\win-unpacked\CerebroNico IDE.exe
echo.
echo   Dentro del instalador viajan:
echo     resources\python-embed\   Python portable ^(autonomia total^)
echo     resources\app\scripts\    hindsight_daemon.py + creador_daemon.py
echo     resources\services\       copia de los daemons para diagnostico
echo     resources\dist\*.exe      los EXEs que hayan salido arriba
echo.
echo   PROBAR EN MAQUINA LIMPIA (sin Python): instalar, abrir, y
echo   verificar 3000 / 5000 / 5100 / 5102. Ver LEEME-EMPAQUETADO.md
echo ============================================================
echo.
pause

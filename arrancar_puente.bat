@echo off
setlocal EnableDelayedExpansion
title CerebroNico - Lanzador completo

rem ============================================================
rem  LANZADOR COMPLETO DE CEREBRONICO
rem  Arranca en orden: puente :5000 -> IDE :3000
rem  Comprueba cada puerto antes de seguir. No deja nada huerfano.
rem ============================================================

set "CN_PROJECT_DIR=C:\Cerebronico"
set "CN_BRIDGE_PORT=5000"
set "CN_IDE_PORT=3000"
set "APP=%~dp0"
if "%APP:~-1%"=="\" set "APP=%APP:~0,-1%"
set "PY=%APP%\runtime\python-embed\python.exe"

cd /d "%APP%"

echo.
echo ============================================================
echo   CEREBRONICO - ARRANQUE COMPLETO
echo   Raiz de datos : %CN_PROJECT_DIR%
echo   Instalacion   : %APP%
echo ============================================================
echo.

rem ---------- 0. Comprobaciones previas ----------
if not exist "%PY%" (
  echo [ERROR] No encuentro el interprete embebido:
  echo         %PY%
  echo         Revisa que la carpeta runtime\python-embed exista.
  goto :fallo
)
if not exist "%APP%\agent_bridge_5000.py" (
  echo [ERROR] No encuentro agent_bridge_5000.py en %APP%
  goto :fallo
)
if not exist "%CN_PROJECT_DIR%" (
  echo [AVISO] La raiz de datos no existe. La creo: %CN_PROJECT_DIR%
  mkdir "%CN_PROJECT_DIR%" >nul 2>&1
)

rem ---------- 1. Puente :5000 ----------
echo [1/2] Puente Python :%CN_BRIDGE_PORT%
call :puerto_vivo %CN_BRIDGE_PORT%
if "!VIVO!"=="1" (
  echo       Ya estaba escuchando. No lo relanzo.
) else (
  echo       Arrancando...
  start "CerebroNico - Puente :5000" /min "%PY%" "%APP%\agent_bridge_5000.py"
  call :esperar_puerto %CN_BRIDGE_PORT% 30
  if "!VIVO!"=="1" (
    echo       OK - puente escuchando en :%CN_BRIDGE_PORT%
  ) else (
    echo [ERROR] El puente no respondio en 30 s. Revisa la ventana "Puente :5000".
    goto :fallo
  )
)

rem ---------- 2. IDE :3000 ----------
echo [2/2] IDE :%CN_IDE_PORT%
call :puerto_vivo %CN_IDE_PORT%
if "!VIVO!"=="1" (
  echo       Ya estaba escuchando. No lo relanzo.
) else (
  if not exist "%APP%\node_modules" (
    echo [ERROR] Falta node_modules. Ejecuta primero:  npm install
    goto :fallo
  )
  echo       Arrancando servidor de desarrollo...
  start "CerebroNico - IDE :3000" /min cmd /c "npm run dev"
  call :esperar_puerto %CN_IDE_PORT% 60
  if "!VIVO!"=="1" (
    echo       OK - IDE escuchando en :%CN_IDE_PORT%
  ) else (
    echo [AVISO] El IDE aun no responde en 60 s. Puede seguir compilando.
    echo         Mira la ventana "IDE :3000".
  )
)

echo.
echo ============================================================
echo   LISTO
echo   IDE      : http://localhost:%CN_IDE_PORT%
echo   Puente   : http://localhost:%CN_BRIDGE_PORT%
echo   Sandbox  : http://localhost:3500  (se levanta desde la IDE)
echo ============================================================
echo.
echo Abriendo el navegador...
start "" "http://localhost:%CN_IDE_PORT%"
echo.
echo Esta ventana se puede cerrar. Los servicios siguen en segundo plano.
timeout /t 8 >nul
exit /b 0

rem ============================================================
rem  SUBRUTINAS
rem ============================================================

rem :puerto_vivo <puerto>  -> deja VIVO=1 si algo escucha, VIVO=0 si no
rem  La linea de netstat es:  TCP  127.0.0.1:5000  0.0.0.0:0  LISTENING  5688
rem  El PID es el ULTIMO campo, por eso se toma tokens=5 (no tokens=2).
:puerto_vivo
set "VIVO=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /r /c:":%~1 .*LISTENING"') do (
  if not "%%P"=="0" set "VIVO=1"
)
exit /b 0

rem :esperar_puerto <puerto> <segundos> -> sondea cada segundo
:esperar_puerto
set /a "_resta=%~2"
:esperar_bucle
call :puerto_vivo %~1
if "!VIVO!"=="1" exit /b 0
set /a "_resta-=1"
if !_resta! LEQ 0 exit /b 0
timeout /t 1 >nul
goto :esperar_bucle

:fallo
echo.
echo ============================================================
echo   ARRANQUE ABORTADO - revisa el mensaje de arriba
echo ============================================================
echo.
pause
exit /b 1

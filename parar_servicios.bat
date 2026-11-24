@echo off
setlocal EnableDelayedExpansion
title CerebroNico - Parar servicios

rem ============================================================
rem  PARADA ORDENADA DE CEREBRONICO
rem  Cierra el IDE :3000 y el puente :5000 por PID, sin tocar
rem  nada mas. Pide confirmacion antes de matar.
rem ============================================================

set "CN_BRIDGE_PORT=5000"
set "CN_IDE_PORT=3000"

echo.
echo ============================================================
echo   CEREBRONICO - PARADA DE SERVICIOS
echo ============================================================
echo.

set "HAY=0"
call :listar %CN_IDE_PORT% "IDE :3000"
call :listar %CN_BRIDGE_PORT% "Puente :5000"

if "!HAY!"=="0" (
  echo No hay nada escuchando en :%CN_IDE_PORT% ni en :%CN_BRIDGE_PORT%.
  echo Nada que parar.
  timeout /t 4 >nul
  exit /b 0
)

echo.
set /p "CONF=Parar estos procesos? (S/N): "
if /i not "!CONF!"=="S" (
  echo Cancelado. No se toco nada.
  timeout /t 3 >nul
  exit /b 0
)

call :matar %CN_IDE_PORT% "IDE :3000"
call :matar %CN_BRIDGE_PORT% "Puente :5000"

echo.
echo Parada completada.
timeout /t 4 >nul
exit /b 0

rem :listar <puerto> <etiqueta>
:listar
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /r /c:":%~1 .*LISTENING"') do (
  if not "%%P"=="0" (
    echo   %~2  PID %%P
    set "HAY=1"
  )
)
exit /b 0

rem :matar <puerto> <etiqueta>
:matar
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /r /c:":%~1 .*LISTENING"') do (
  if not "%%P"=="0" (
    taskkill /PID %%P /F >nul 2>&1
    if !errorlevel! EQU 0 (
      echo   %~2  PID %%P detenido.
    ) else (
      echo   %~2  PID %%P NO se pudo detener ^(permisos^).
    )
  )
)
exit /b 0

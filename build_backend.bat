@echo off
REM ============================================================
REM   build_backend.bat - v1.20.1 (EMPAQUETADO)
REM   Compila los CUATRO ejecutables Windows con PyInstaller, con
REM   los .spec que viven DENTRO del proyecto (build\*.spec):
REM     dist\CerebroNicoAgent.exe     (agente FastAPI - requiere deps)
REM     dist\cerebronico_bridge.exe   (puente :5000 - solo stdlib)
REM     dist\hindsight_daemon.exe     (memoria :5100 - solo stdlib)
REM     dist\creador_daemon.exe       (creador :5102 - solo stdlib)
REM
REM   Es OPCIONAL dentro de la cadena: si faltan Python o PyInstaller,
REM   este BAT avisa y sale con codigo 0. El instalador sigue siendo
REM   autonomo porque lleva el Python embebido (runtime\python-embed)
REM   y los .py de los tres servicios. Los EXE son un refuerzo.
REM
REM   Requisitos SOLO de esta ruta opcional (maquina de desarrollo):
REM     python 3.10+ en el PATH
REM     pip install pyinstaller
REM     pip install -r requirements.txt   (unica dependencia real: el agente)
REM
REM   REGLAS DE ESTE ARCHIVO (empaque EXE):
REM   * CRLF en cada linea. * Sin tildes. * Solo if / goto, sin bloques ( ).
REM ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title CerebroNico - build_backend.bat

where pyinstaller >nul 2>nul
if %errorlevel% equ 0 goto :pyi_ok
where python >nul 2>nul
if %errorlevel% neq 0 goto :sin_python
python -m PyInstaller --version >nul 2>nul
if %errorlevel% neq 0 goto :sin_pyi
set "PYI_CMD=python -m PyInstaller"
goto :pyi_ok

:sin_python
echo [AVISO] No hay Python en esta maquina: se omite la compilacion de EXEs.
echo   El instalador seguira siendo autonomo: lleva Python embebido en
echo   resources\python-embed y los .py de :5000 :5100 :5102.
exit /b 0

:sin_pyi
echo [AVISO] Python existe pero falta PyInstaller ^(pip install pyinstaller^).
echo   Se omite la compilacion de EXEs; el Python embebido cubre los servicios.
exit /b 0

:pyi_ok
if "%PYI_CMD%"=="" set "PYI_CMD=pyinstaller"
if not exist "dist" mkdir "dist"

echo [1/4] CerebroNicoAgent.exe (FastAPI - necesita requirements instalados)...
%PYI_CMD% --noconfirm --distpath dist --workpath build\pyi-agent build\CerebroNicoAgent.spec >nul 2>nul
if %errorlevel% neq 0 echo [AVISO] Fallo CerebroNicoAgent.spec - sigue sin el agente EXE.

echo [2/4] cerebronico_bridge.exe (puente :5000, solo stdlib)...
%PYI_CMD% --noconfirm --distpath dist --workpath build\pyi-bridge build\cerebronico_bridge.spec >nul 2>nul
if %errorlevel% neq 0 echo [AVISO] Fallo cerebronico_bridge.spec.

echo [3/4] hindsight_daemon.exe (memoria :5100, solo stdlib)...
%PYI_CMD% --noconfirm --distpath dist --workpath build\pyi-hindsight build\hindsight_daemon.spec >nul 2>nul
if %errorlevel% neq 0 echo [AVISO] Fallo hindsight_daemon.spec.

echo [4/4] creador_daemon.exe (creador :5102, solo stdlib)...
%PYI_CMD% --noconfirm --distpath dist --workpath build\pyi-creador build\creador_daemon.spec >nul 2>nul
if %errorlevel% neq 0 echo [AVISO] Fallo creador_daemon.spec.

echo.
echo [build_backend] Estado de dist\:
if exist "dist\CerebroNicoAgent.exe" (echo   OK   CerebroNicoAgent.exe) else (echo   --   CerebroNicoAgent.exe no generado)
if exist "dist\cerebronico_bridge.exe" (echo   OK   cerebronico_bridge.exe) else (echo   --   cerebronico_bridge.exe no generado)
if exist "dist\hindsight_daemon.exe" (echo   OK   hindsight_daemon.exe) else (echo   --   hindsight_daemon.exe no generado)
if exist "dist\creador_daemon.exe" (echo   OK   creador_daemon.exe) else (echo   --   creador_daemon.exe no generado)
echo   (los -- no rompen nada: el Python embebido ejecuta los .py equivalentes)
endlocal
exit /b 0

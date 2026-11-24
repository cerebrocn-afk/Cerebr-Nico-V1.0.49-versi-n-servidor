@echo off
REM ============================================================
REM   FIJAR-VERSION.BAT - UN CLIC, UN NUMERO (v1.0.2)
REM
REM   Reemplaza a los OCHO .bat de un solo uso que estaban en la raiz
REM   (ACTUALIZAR-A-2.3.13/14/15/23, FIJAR-1.0.0, FIJAR-VERSION-1.0.0 y
REM   build-2.3.14). Estan guardados en:
REM      .cerebro-papelera\limpieza-2026-11-07
REM
REM   LA REGLA DE LA CASA: el numero vive en UN solo lado,
REM   `src\constants.ts` (VERSION_SEMVER). package.json, package-lock,
REM   index.html, README, CHANGELOG y memoria.md son ESPEJOS y los propaga
REM   el derivador oficial. Por eso este .bat no escribe archivos a mano:
REM   llama al derivador.
REM
REM   USO
REM     FIJAR-VERSION.BAT              -> muestra la semilla y verifica
REM     FIJAR-VERSION.BAT 1.0.2        -> fija, propaga y verifica
REM   Con stdin=NUL (lo llama el EXE o el planificador) no queda esperando.
REM ============================================================
@echo on
setlocal EnableExtensions
cd /d "%~dp0"

set "NUEVA=%~1"

if not defined NUEVA goto :sin_numero

echo.
echo [1/4] Fijando la semilla a %NUEVA% ...
node scripts\fijar-version.mjs %NUEVA%
if errorlevel 1 goto :fallo

echo [2/4] Propagando los espejos (deriva:fijar) ...
call npm run deriva:fijar
if errorlevel 1 goto :fallo

echo [3/4] Verificando concordancia (deriva) ...
call npm run deriva
if errorlevel 1 goto :fallo

echo [4/4] Manifiesto y superficie ...
call npm run manifiesto
call npm run superficie
if errorlevel 1 goto :fallo

echo.
echo [OK] Version %NUEVA% fijada, propagada y verificada.
echo      Siguiente paso honesto: npm run validar
goto :fin

:sin_numero
echo.
echo [INFO] Sin numero no se escribe nada: solo se lee y se verifica.
node scripts\fijar-version.mjs
if errorlevel 1 goto :fallo
echo.
echo [INFO] Estado de los espejos (deriva) ...
call npm run deriva
if errorlevel 1 goto :fallo
echo.
echo [OK] Semilla y espejos concuerdan. Para cambiarla: FIJAR-VERSION.BAT 1.0.2
goto :fin

:fallo
echo.
echo [FALLO] El fijado no termino. Las lineas de arriba dicen cual espejo
echo         no concuerda: no se parchee a mano, arregle la semilla y vuelva.
echo.
endlocal
exit /b 1

:fin
endlocal
exit /b 0

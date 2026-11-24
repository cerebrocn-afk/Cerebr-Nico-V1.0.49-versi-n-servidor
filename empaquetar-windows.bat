@echo off
setlocal
cd /d "%~dp0"
echo ==================================================
echo  EMPAQUETAR CEREBRONICO IDE - instalador .exe
echo  (repara el binario de Electron y compila)
echo ==================================================
echo.

echo --- 1. Bajar el binario de Electron (npm 12 bloquea su postinstall) ---
call npm run electron:bin
if exist "node_modules\electron\dist\electron.exe" goto local_ok
call npm install-scripts approve electron
call npm rebuild electron --foreground-scripts
if exist "node_modules\electron\dist\electron.exe" goto local_ok

echo.
echo --- 2. No hay binario local: se usa C:\ELECTRON ---
if not exist "C:\ELECTRON\electron.exe" goto sin_electron
set ELECTRON_OVERRIDE_DIST_PATH=C:\ELECTRON
set EXTRA=-c.electronDist=C:\ELECTRON
echo Usare C:\ELECTRON como distribucion de Electron.
goto empaquetar

:local_ok
set EXTRA=
echo Electron local OK: node_modules\electron\dist\electron.exe
goto empaquetar

:sin_electron
echo.
echo No hay electron.exe ni en node_modules ni en C:\ELECTRON.
echo Descarga electron-v44.9.3-win32-x64.zip, descomprimelo en C:\ELECTRON
echo (debe quedar C:\ELECTRON\electron.exe) y vuelve a ejecutar este .bat.
echo.
pause
exit /b 1

:empaquetar
echo.
echo --- 3. Guardian previo (claves, artefactos, cerebro) ---
call node scripts\archivar-cerebro-db.mjs
call node scripts\sin-claves.mjs
call node scripts\verificar-artefactos.mjs
if errorlevel 1 goto fallo

echo.
echo --- 4. Compilar (vite + esbuild) ---
call npm run build
if errorlevel 1 goto fallo

echo.
echo --- 5. Instalador Windows ---
call npx --no-install electron-builder --win --x64 %EXTRA%
if errorlevel 1 goto fallo

echo.
echo === LISTO: instalador en dist_electron ===
dir /b dist_electron\*.exe
echo.
pause
exit /b 0

:fallo
echo.
echo *** ALGO FALLO: mira arriba la PRIMERA linea con error ***
echo *** Electron: si dice ETIMEDOUT o ECONNRESET, es la descarga del binario. ***
echo *** Prueba:  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/  ***
echo.
pause
exit /b 1

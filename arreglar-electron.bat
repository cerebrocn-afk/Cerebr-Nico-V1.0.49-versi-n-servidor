@echo off
setlocal
cd /d "%~dp0"
echo ==================================================
echo  BAJAR EL BINARIO DE ELECTRON (npm 12 lo bloquea)
echo ==================================================
echo.
echo --- antes ---
if exist "node_modules\electron\dist\electron.exe" echo OK      ya estaba
if not exist "node_modules\electron\dist\electron.exe" echo FALTA   electron.exe
if not exist "node_modules\electron\package.json" goto sin_paquete

echo.
echo --- ejecutando node_modules\electron\install.js ---
set ELECTRON_MIRROR=%ELECTRON_MIRROR%
call npm run electron:bin
if errorlevel 1 goto error_descarga

echo.
echo --- despues ---
if exist "node_modules\electron\dist\electron.exe" echo OK      node_modules\electron\dist\electron.exe
if not exist "node_modules\electron\dist\electron.exe" goto error_descarga
"node_modules\electron\dist\electron.exe" --version
if exist "node_modules\electron\path.txt" type "node_modules\electron\path.txt"
echo.
echo Listo. Ahora:  npm run build   y   npm run dist
pause
exit /b 0

:sin_paquete
echo.
echo No existe node_modules\electron. Ejecuta primero:  npm install
pause
exit /b 1

:error_descarga
echo.
echo *** No se pudo bajar el binario. ***
echo Si arriba hay ETIMEDOUT / ECONNRESET / 403, es red. Prueba el espejo:
echo    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
echo    arreglar-electron.bat
echo Si el antivirus bloqueo el .exe, pon C:\ELECTRON en la lista de exclusiones
echo o descomprime electron-v44.9.3-win32-x64.zip en C:\ELECTRON.
pause
exit /b 1

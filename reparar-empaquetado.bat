@echo off
setlocal
cd /d "%~dp0"
echo ==================================================
echo  REPARAR EMPAQUETADO - CerebroNico IDE
echo  (electron-builder + electron en node_modules)
echo ==================================================
echo.
echo --- versiones ---
node -v
call npm -v
echo.
echo --- ajustes de npm que PODAN las dependencias de desarrollo ---
echo omit:
call npm config get omit
echo production:
call npm config get production
echo ignore-scripts:
call npm config get ignore-scripts
echo NODE_ENV=%NODE_ENV%
echo.
echo --- estado actual ---
if exist "node_modules\electron-builder\cli.js" echo OK      node_modules\electron-builder\cli.js
if not exist "node_modules\electron-builder\cli.js" echo FALTA   node_modules\electron-builder\cli.js
if exist "node_modules\electron\dist\electron.exe" echo OK      node_modules\electron\dist\electron.exe
if not exist "node_modules\electron\dist\electron.exe" echo FALTA   node_modules\electron\dist\electron.exe
echo.
echo --- instalando (dev incluido, scripts a la vista) ---
set NODE_ENV=development
call npm install --include=dev --foreground-scripts --no-audit --no-fund --ignore-scripts=false
echo.
echo --- resultado ---
if exist "node_modules\electron-builder\cli.js" echo OK      electron-builder instalado
if not exist "node_modules\electron-builder\cli.js" echo FALTA   electron-builder
if exist "node_modules\electron\dist\electron.exe" echo OK      electron.exe presente
if not exist "node_modules\electron\dist\electron.exe" echo FALTA   electron.exe (descarga del binario)
echo.
echo --- version del empaquetador ---
call npx --no-install electron-builder --version
echo.
echo Si sigue FALTANDO electron.exe, el postinstall se salto o la descarga
echo no llego a github. Prueba el espejo y repite este .bat:
echo    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
echo.
echo Cuando los dos digan OK:  npm run build   y luego   npm run dist
echo.
pause

@echo off
REM ============================================================
REM   CerebroNico IDE - INSTALAR + BUILD + VALIDAR (un clic) (v1.97.3)
REM ============================================================
REM   El ciclo completo de la casa en una sola ventana:
REM     [1/5] Instalar dependencias (npm ci si falta node_modules,
REM           npm install si ya existe: sincroniza sin borrar).
REM           Si npm ci se niega (lockfile desincronizado con tu npm),
REM           se repara solo con npm install antes de detenerse.
REM     [2/5] Build de produccion (vite build + esbuild server -> dist/)
REM     [3/5] Suite completa de pruebas (npm run validar, unos 4-5 min)
REM     [4/5] Trinquete de superficie (server.ts dentro del presupuesto)
REM     [5/5] Veredicto: TODO VERDE o cual paso quedo en ROJO y por que
REM
REM   Un fallo de dependencias detiene el script (sin node_modules no hay
REM   build ni pruebas que correr). Un fallo de build/suite/superficie NO
REM   detiene: se cuenta, se sigue, y el veredicto final dice cuantos y
REM   cuales quedaron en rojo: que es lo unico que la casa necesita ver.
REM
REM   REGLAS DE ESTE ARCHIVO (mismas que iniciar_todo_windows.bat):
REM   * CRLF en cada linea: un BAT en LF "se cierra enseguida".
REM   * CERO bloques " ( ... ) " con echo/goto dentro: solo if / goto.
REM   * Texto sin tildes: la consola OEM devolveria basura los acentos.
REM   * PAUSA REAL al final: "pause" a secas (prohibido "pause <nul").
REM ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title CerebroNico v1.97.3 - Instalar + Build + Validar
color 0E

set "FALLOS=0"

echo ============================================================
echo   CEREBRONICO v1.97.3 - INSTALAR + BUILD + VALIDAR
echo   Al final, un veredicto. Nada se da por bueno en rojo.
echo ============================================================
echo.

echo [0/5] Comprobando herramientas...
where node >nul 2>nul
if %errorlevel% neq 0 goto :sin_node
where npm >nul 2>nul
if %errorlevel% neq 0 goto :sin_node
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo        node %%v
for /f "tokens=*" %%v in ('npm --version 2^>nul') do echo        npm  %%v
echo.

echo [1/5] Instalar dependencias...
if exist "node_modules\express" goto :deps_rapido
echo        node_modules no esta: npm ci (instala limpio desde el lockfile).
echo        Esto puede tardar unos minutos la primera vez.
call npm ci --no-audit --no-fund
set "RC=%errorlevel%"
if "%RC%"=="0" goto :deps_listo
echo        npm ci se nego (suele ser el lockfile frente a tu version de npm).
echo        Se repara con npm install, que ajusta el lockfile y sigue.
call npm install --no-audit --no-fund
set "RC=%errorlevel%"
if "%RC%"=="0" goto :deps_listo
set /a FALLOS+=1
echo        [ROJO] ni npm ci ni npm install pudieron con las dependencias.
echo        Mira arriba el error de npm: suele ser falta de red o Node < 18.
echo        Sin dependencias no hay build ni pruebas: el script se detiene.
goto :fin
:deps_rapido
echo        node_modules ya existe: npm install (sincroniza, rapido).
call npm install --no-audit --no-fund
set "RC=%errorlevel%"
if "%RC%"=="0" goto :deps_listo
set /a FALLOS+=1
echo        [ROJO] npm install fallo. Mira arriba el error de npm.
echo        Sin dependencias no hay build ni pruebas: el script se detiene.
goto :fin
:deps_listo
echo        [OK] Dependencias listas.

echo.
echo [2/5] Build de produccion (vite build + esbuild server)...
call npm run build
set "RC=%errorlevel%"
if "%RC%"=="0" goto :build_ok
set /a FALLOS+=1
echo        [ROJO] El build fallo. Mira arriba el primer error.
echo        (La suite sigue de todos modos: las pruebas corren desde la fuente.)
goto :paso_suite
:build_ok
echo        [OK] dist/ generado (cliente + dist/server.mjs).

:paso_suite
echo.
echo [3/5] Suite completa (npm run validar) - unos 4-5 minutos...
call npm run validar
set "RC=%errorlevel%"
if "%RC%"=="0" goto :suite_ok
set /a FALLOS+=1
echo        [ROJO] Alguna suite fallo. Arriba esta el nombre y la comprobacion.
goto :paso_superficie
:suite_ok
echo        [OK] Veredicto de la suite en verde.

:paso_superficie
echo.
echo [4/5] Trinquete de superficie (presupuesto de lineas de server.ts)...
call npm run superficie:verificar
set "RC=%errorlevel%"
if "%RC%"=="0" goto :superficie_ok
set /a FALLOS+=1
echo        [ROJO] El contrato de superficie cambio. Mira arriba el detalle.
goto :paso_resumen
:superficie_ok
echo        [OK] CONTRATO INTACTO.

:paso_resumen
echo.
echo [5/5] Veredicto
echo ------------------------------------------------------------
if %FALLOS% equ 0 goto :todo_verde
echo   HAY %FALLOS% PASO(S) EN ROJO. Arriba dice cual y por que.
echo   Nada se da por bueno mientras esto este en rojo.
goto :fin
:todo_verde
echo   TODO VERDE. Instalado, construido y validado: esta copia es sana.
echo.
echo   Para arrancar: doble clic en iniciar_todo_windows.bat
goto :fin

:sin_node
echo.
echo   [ROJO] No encuentro Node.js en el PATH.
echo          Instalalo desde https://nodejs.org (version LTS) y reintenta.
goto :fin

:fin
echo ------------------------------------------------------------
echo.
pause
endlocal
exit /b 0

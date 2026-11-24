@echo off
REM ============================================================
REM   CerebroNico IDE - Arranque completo en Windows (v1.99.11)
REM   Arranca en orden: 1) Ollama :11434 (keep-alive 5m, NO clavado)
REM   2) npm install solo si falta node_modules  3) capa de memoria
REM      hibrida :5100 (OPCIONAL)  3b) pack creador :5102 (OPCIONAL)
REM   4) npm run dev (:3000 + puente :5000).
REM
REM   v1.20.1 - INTERPRETE AUTONOMO: los packs :5100/:5102 (y el puente
REM   :5000 que arranca el server) usan, por orden:
REM     1) runtime\python-embed\python.exe  (Python embebido del paquete:
REM        node scripts\preparar-python-embed.mjs lo descarga y verifica;
REM        viaja dentro del instalador en resources\python-embed)
REM     2) python del PATH del sistema
REM     3) py -3 (lanzador oficial de Windows)
REM   Si no hay ninguno, la IDE arranca IGUAL y solo se omiten los packs
REM   opcionales: cero riesgo de arranque.
REM   Ademas CN_CREADOR_ROOT y CN_HINDSITE_MIRROR apuntan a la raiz de
REM   datos (C:\Cerebronico): los daemons ya no escriben dentro de la
REM   carpeta del proyecto ni de Program Files (informe del cliente, sec. 10/sec. 26).
REM
REM   MODO BAJO CONSUMO: OLLAMA_KEEP_ALIVE=5m - el modelo NO queda
REM   clavado en RAM; la pestana Puertos de la IDE trae el chip de RAM y
REM   el boton Expulsar.
REM
REM   v1.57.14 - LOS OTROS TRES NUMEROS (docs.ollama.com/faq, verificado 15/10):
REM   * OLLAMA_MAX_LOADED_MODELS=1 - el default es 3 por GPU (3 en CPU pura).
REM     En una maquina de 16 GB sin GPU Ollama puede tener TRES cerebros
REM     residentes a la vez, cada uno con su KV-cache propia: es la cuenta que
REM     nadie ve y que deja el equipo en swap. Con un solo usuario (la IDE) se
REM     queda un solo modelo arriba.
REM   * OLLAMA_NUM_PARALLEL=1 - el default ya es 1; se fija igual porque la RAM
REM     requerida escala con NUM_PARALLEL * CONTEXTO. Si otra app subio ese 1 a
REM     4, la ventana de 16k del bucle de agente pasa a costar 4 veces mas.
REM   * OLLAMA_CONTEXT_LENGTH=4096 - es el default documentado de la API; es lo
REM     que escribe el selector 'Context length' de la app de escritorio. Se
REM     topa a 4096 para que UN pedido sin num_ctx (curl, el CLI, otra app) no
REM     herede un 256k que vuelca la RAM. La IDE manda su propio num_ctx siempre
REM     (perfil + dial del panel Pro + techo de RAM), asi que esto no le cambia
REM     nada a ella: es el cinturon para los que llaman por otra puerta.
REM
REM
REM   AVISO HONESTO - SI EL MOTOR YA ESTABA ABIERTO, ESTO NO LE LLEGA:
REM   estas variables las lee `ollama serve` al NACER. Si el motor ya estaba
REM   corriendo (lo arranco la IDE, el instalador o un arranque anterior), este
REM   BAT NO lo reinicia: las tres variables NO le llegaron al proceso vivo y
REM   el motor sigue con los numeros viejos. Para aplicarlas de verdad: sali de
REM   la app (bandeja del sistema, Salir) o cerra la ventana 'Ollama Engine' y
REM   volve a abrir con este BAT. El puerto :11434 tiene que nacer de nuevo.
REM   v1.99.10 - COMILLAS ANIDADAS EN "start ... cmd /k":
REM   las tres lineas que abren ventana (Ollama, memoria, creador) tenian
REM   cmd /k "cd /d "%~dp0" && ..." y %~dp0 TERMINA EN BARRA INVERTIDA:
REM   "C:\...\app\" - esa barra escapaba la comilla de cierre, cmd recibia
REM   una linea truncada y el python del pack NUNCA se ejecutaba (la ventana
REM   se abria, imprimia "[memoria] se cerro" y ahi quedaba). Sintoma exacto
REM   reportado: memoria.log no existia y el supervisor reintentaba 12 veces
REM   contra un proceso que jamas nacio.
REM
REM   v2.3.24 (6/11) - EL ORDEN DE LOS PACKS Y LA VERIFICACION DE LOS SIETE.
REM   Tres defectos medidos, con el sintoma que dijo Mario ("no encienden todos
REM   los puertos", "el 5102 no arranca", "un py se abre y se cierra"):
REM   1) El motor :5103 se levantaba DESPUES de la memoria :5100, pero el
REM      `set HINDSITE_API_URL` se evaluaba ANTES: en un arranque frio :5100
REM      nunca veia al cerebro. Ahora :5103 nace primero y se espera su escucha.
REM   2) :5100 tenia bucle de verificacion; :5102 y :5103 ninguno. Si el creador
REM      moria, el lanzador seguia como si nada y el panel lo dejaba en STANDBY
REM      para siempre. Ahora los tres packs se ESPERAN y se REPORTAN con su log.
REM   3) PYTHONUNBUFFERED no estaba: al redireccionar, Python bufferiza y los
REM      logs de arranque salian VACIOS con el daemon vivo -> "se abrio y se
REM      cerro y no se ve nada".
REM   Ademas los `netstat` de los packs anclan el puerto con un espacio
REM   (":5102 ") para no leer como "ya esta arriba" la escucha de un :51020.
REM
REM   v1.99.11 (31/10/2026) - LA SOLUCION DEFINITIVA: cero comillas anidadas.
REM   pushd "%~dp0." seguia metiendo una comilla DENTRO de cmd /k "...".
REM   Ahora el directorio de trabajo lo fija la opcion /d de START, que
REM   acepta su propia comilla fuera del bloque:
REM       start "titulo" /min /d "%~dp0" cmd /k "orden && orden"
REM   Asi cmd /k recibe UN solo tramo entre comillas, sin anidar nada, y
REM   funciona aunque la ruta tenga espacios (no depende de %~dp0 sin
REM   comillas). Es la forma canonica de Windows y no vuelve a romperse.
REM
REM   REGLAS DE ESTE ARCHIVO (empaque EXE - electron-main.cjs lo
REM   ejecuta OCULTO con cmd /c, stdin=NUL):
REM   * CRLF en cada linea: un BAT en LF "se cierra enseguida".
REM   * CERO bloques "( ... )" con echo/goto dentro: solo if / goto.
REM   * Texto sin tildes: la consola OEM volveria basura los acentos.
REM   * PAUSA REAL ante cualquier error: "pause" a secas espera una
REM     tecla cuando hay consola (doble-clic) y pasa SOLO cuando el
REM     EXE lanza oculto con stdin=NUL (EOF inmediato). PROHIBIDO
REM     "pause <nul".
REM   * Ventana Ollama minimizada y con autoreinicio; salida en
REM     C:\Cerebronico\ollama_arranque.log.
REM ============================================================
setlocal EnableExtensions
cd /d "%~dp0"
title CerebroNico IDE - Arranque Completo
color 0B

REM ----- 0. Raiz de datos: todo a C:\Cerebronico -----
REM El motor Y el puente de :5000 leen LA MISMA variable, asi que
REM proyectos, boveda, espejos y conocimiento viven en un solo sitio
REM y no dentro de la carpeta extraida del ZIP. Si PROJECT_DIR ya
REM esta definido por el usuario o por el EXE, se respeta.
set "CEREBRONICO_DATOS=C:\Cerebronico"
if not exist "%CEREBRONICO_DATOS%" mkdir "%CEREBRONICO_DATOS%" >nul 2>nul
if not defined PROJECT_DIR set "PROJECT_DIR=%CEREBRONICO_DATOS%"
REM v1.98.8 - EL PUENTE :5000 LEE CN_PROJECT_DIR, NO PROJECT_DIR.
REM Sin esta linea el puente nacia con cwd=instalacion, buscaba ahi
REM puente-permitidos.json, no lo encontraba y caia a raices_permitidas=[]
REM (todo C:\Cerebronico daba Acceso denegado). Una variable, un solo sitio.
if not defined CN_PROJECT_DIR set "CN_PROJECT_DIR=C:\Cerebronico"
REM v1.99.0 - LOGS DE ARRANQUE: cada servicio escribe el SUYO, para que un corte a
REM mitad de arranque se pueda LEER DESPUES. Queja literal del 31/10: "SE CERRO OTRA
REM VEZ POR LA MITAD Y NO DA TIEMPO A COPIAR". El plano vive en
REM src/engine/arranqueVentanas.ts; este archivo solo lo instala.
if not defined CN_LOGS set "CN_LOGS=%PROJECT_DIR%\logs\arranque"
if not exist "%CN_LOGS%" mkdir "%CN_LOGS%" >nul 2>nul
if not exist "%CN_LOGS%" set "CN_LOGS=%TEMP%"
REM v1.0.27 - LA GRACIA ES UNA SOLA Y MANDA EL SUPERVISOR.
REM src/engine/arranqueVentanas.ts declara GRACIA_ARRANQUE_MS = 90000: durante
REM esos segundos un puerto que no contesta esta naciendo, no caido, y el
REM supervisor NO reanima. Este archivo mide con EL MISMO numero o se repite el
REM defecto del 17/11 (el BAT se rinde antes y aparece un segundo dueno del
REM puerto). Lo fija tests/sincroniaGraciaArranque.test.ts leyendo los dos.
if not defined CN_GRACIA_ARRANQUE_S set "CN_GRACIA_ARRANQUE_S=90"
set "GRACIA_ARRANQUE_S=%CN_GRACIA_ARRANQUE_S%"
echo [INFO] Raiz de datos: %PROJECT_DIR%
echo.

echo ============================================================
echo   CerebroNico IDE - Arranque completo - bajo consumo
echo ============================================================
echo.

REM ----- 1. Ollama instalado? -----
where ollama >nul 2>nul
if %errorlevel% equ 0 goto :ollama_check
echo [ADVERTENCIA] Ollama no esta instalado en el PATH.
echo   Descargalo desde https://ollama.com - el server arrancara
echo   igual, pero la inferencia local no funcionara.
echo   (Si abriste esto con doble-clic, la ventana espera una tecla.)
pause
:ollama_check

REM ----- 2. Ollama corriendo ya en :11434? -----
echo [INFO] Verificando si Ollama ya esta corriendo en :11434...
netstat -ano | findstr ":11434 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :ollama_arriba
goto :ollama_arrancar

REM ============================================================
REM v1.0.39 - LAS DOS ETIQUETAS QUE NO EXISTIAN.
REM El 20/11 Mario reporto: "el iniciar_todo_windows no abre, arranca y
REM se cierra" (con la 1.0.9 abria). Causa medida: estas dos ramas hacian
REM `goto :ollama_arriba` y `goto :ollama_arrancar`, y NINGUNA de las dos
REM etiquetas estaba escrita en el archivo. cmd no avisa con un error de
REM sintaxis: imprime "No se puede encontrar la etiqueta de lote
REM especificada" y TERMINA el archivo ahi mismo, con lo que el `pause`
REM final nunca se alcanza y la ventana se cierra sola. Pasaba SIEMPRE,
REM con Ollama arriba o abajo, en la linea 137: ni packs, ni puente, ni
REM IDE. La suite lanzadorEtiquetas.test.ts lo vigila: todo `goto :x` del
REM archivo tiene que tener su `:x` escrito.
REM ============================================================
:ollama_arriba
echo [OK] Ollama ya estaba escuchando en :11434 - no se duplica.
goto :start_server

:ollama_arrancar
REM ----- 3. Arrancar Ollama en SU PROPIA ventana minimizada (v1.0.36) -----
REM v1.0.36 - ESTO ES LO QUE SE ROMPIO Y SE VUELVE A LA FORMA QUE FUNCIONA.
REM v2.3.25 habia dejado `start "" /b ... cmd /c ollama serve`: el motor quedaba
REM colgado de ESTA consola. `/b` NO abre consola nueva y NO despega el hijo: al
REM cerrar esta ventana (o al llegar a :fin) Windows manda CTRL_CLOSE a todos los
REM hijos /b y Ollama muere con ella. Sintoma exacto: el .bat dice "listo en
REM :11434", la IDE abre, y a los segundos no hay motor, ni modelos, ni puente al
REM :11434. En v1.0.9 (la version que el usuario confirma que carga modelos) el
REM motor nacia en su PROPIA ventana minimizada con `cmd /k` y sobrevivia.
REM Se vuelve a esa forma, con las seis variables DENTRO del hijo (las lee al
REM nacer y solo entonces) y su salida al log de la casa. Un solo dueno: la
REM rama :ollama_arriba ya corto si el puerto estaba escuchando. La ventana es
REM UNA, minimizada y con titulo fijo: no es la ventana fantasma que se abria y
REM se cerraba sola (esa era el segundo `ollama serve` del supervisor).
REM v1.99.11 - /d "%~dp0" fija el cwd SIN comillas anidadas dentro de cmd /k.
echo [INFO] Arrancando Ollama con 1 modelo residente, 1 pedido a la vez y ventana default 4096...
echo [AVISO] Si el motor YA estaba abierto, estas variables NO le llegaron: sali de la app y volve a abrirla con este BAT.
start "Ollama Engine - Puerto 11434" /min /d "%~dp0" cmd /k "set OLLAMA_ORIGINS=* && set OLLAMA_HOST=0.0.0.0:11434 && set OLLAMA_KEEP_ALIVE=5m && set OLLAMA_NUM_PARALLEL=1 && set OLLAMA_MAX_LOADED_MODELS=1 && set OLLAMA_CONTEXT_LENGTH=4096 && echo ==== arranque %date% %time% ==== && ollama serve 1>> "%CN_LOGS%\ollama.log" 2>&1"

REM ----- 4. Esperar a que escuche :11434 (v1.0.27: la gracia del supervisor) -----
REM v1.0.27 - EL SONDEO ESPERA LO MISMO QUE EL SUPERVISOR.
REM
REM La raiz del arranque eterno medido el 17/11 en v1.0.26: este archivo se
REM rendia a los 20 s (WAIT_COUNT geq 20) mientras el supervisor del servidor da
REM GRACIA_ARRANQUE_MS = 90000 ms (src/engine/arranqueVentanas.ts). Ollama en
REM frio tarda ~50 s (124 blobs): el BAT declaraba "no respondio" a los 20, la
REM IDE abria creyendo el :11434 muerto y el supervisor, al acabarse su gracia,
REM abria un SEGUNDO `ollama serve` sobre un puerto que estaba naciendo. Ese era
REM el "otro CMD de ollama" y el "[supervisor] no contesta -> reanimo" repetido.
REM
REM La regla ahora: UN dueno por puerto y UNA sola paciencia, GRACIA_ARRANQUE_S
REM (90, el mismo numero). Se puede mover por entorno: CN_GRACIA_ARRANQUE_S.
REM ping -n en vez de timeout: timeout falla al instante cuando el
REM EXE lanza con stdin redirigido y el bucle giraria vacio.
echo [INFO] Esperando a que Ollama escuche en :11434 (gracia %GRACIA_ARRANQUE_S% s, la misma del supervisor)...
set WAIT_COUNT=0
:wait_ollama
ping /n 2 127.0.0.1 >nul 2>nul
set /a WAIT_COUNT+=1
netstat -ano | findstr ":11434 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :ollama_listo
if %WAIT_COUNT% geq %GRACIA_ARRANQUE_S% goto :ollama_tarde
if %WAIT_COUNT% equ 15 echo [INFO]   :11434 sigue naciendo (15/%GRACIA_ARRANQUE_S% s) - en frio tarda ~50 s: todavia no es un fallo.
if %WAIT_COUNT% equ 45 echo [INFO]   :11434 sigue naciendo (45/%GRACIA_ARRANQUE_S% s) - el supervisor espera igual que yo.
echo [INFO] Esperando Ollama... %WAIT_COUNT% s
goto :wait_ollama

:ollama_listo
echo [OK] Ollama listo en :11434 - espero %WAIT_COUNT% s
goto :start_server

:ollama_tarde
echo [ADVERTENCIA] Ollama no respondio en %GRACIA_ARRANQUE_S% s (la gracia del supervisor).
echo   NO se arranca una segunda vez: un solo dueno por puerto.
echo   Puede estar naciendo igual - su salida esta en: %CN_LOGS%\ollama.log
echo   El supervisor no lo reanima mientras dure su gracia: si de verdad murio,
echo   lo reaviva el y deja el motivo en logs\arranque. La inferencia local queda
echo   apagada hasta entonces y la pestana Puertos lo dice.

:start_server
echo.
REM v1.46.4 - LOG ORDENADO: el volcado completo de "ollama list" (40+ renglones)
REM ensuciaba el arranque y mezclaba la cabecera con el aviso de consola de
REM Ollama. Ahora se resume en UNA linea (el detalle vive en la pestana Modelos
REM de la IDE); stderr a nul para que no se cuele "failed to get console mode".
echo [INFO] Inventario de modelos locales (detalle en la pestana Modelos de la IDE):
set "OLLAMA_NMOD=0"
for /f "skip=1 delims=" %%A in ('ollama list 2^>nul') do set /a OLLAMA_NMOD+=1
echo [OK] %OLLAMA_NMOD% modelo(s) local(es) disponibles en :11434.
echo.

REM ----- 4b. Dependencias: instala solo si faltan (primer arranque del ZIP) -----
if exist "node_modules\" goto :deps_ok
if not exist "package.json" goto :deps_ok
echo [INFO] Primera vez: instalando dependencias de npm - puede tardar...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 goto :npm_fallo
:deps_ok

REM ----- 4c. Interprete Python (v1.20.1 EMPAQUETADO) -----
REM Orden: embebido del paquete ^> sistema ^> lanzador py. Con uno solo
REM resuelto, :5000, :5100 y :5102 quedan cubiertos SIN instalar Python.
REM CN_PY lleva comillas internas SOLO cuando es ruta (rutas con espacios);
REM CN_PYTHON + PATH antepuesto hacen que server.ts (startAgentBridge, que
REM sondea "where python") use el MISMO interprete que los packs.
set "CN_PY="
set "PYTHONDONTWRITEBYTECODE=1"
set "PYTHONUTF8=1"
REM v2.3.24 - sin esto, con la salida redireccionada, Python acumula el log en el
REM buffer y los archivos de logs\arranque\*.log aparecen VACIOS aunque el daemon
REM este contestando. "Se abrio y se cerro la ventana y no se ve nada" empieza a
REM explicarse aca: el log existia, pero estaba mudo.
set "PYTHONUNBUFFERED=1"
if exist "%~dp0runtime\python-embed\python.exe" goto :py_embebido
where python >nul 2>nul
if %errorlevel% equ 0 goto :py_sistema
where py >nul 2>nul
if %errorlevel% equ 0 goto :py_launcher
goto :py_listo
:py_embebido
set "CN_PY="%~dp0runtime\python-embed\python.exe""
set "CN_PYTHON=%~dp0runtime\python-embed\python.exe"
set "PATH=%~dp0runtime\python-embed;%PATH%"
goto :py_listo
:py_sistema
set "CN_PY=python"
REM v2.3.24 - CN_PYTHON es la variable que leen server.ts (startAgentBridge) y el
REM supervisor al reanimar. Solo se definia en la rama embebida: con Python del
REM sistema el puente :5000 volvia a sondear `where python` y el reanimado del
REM pack caia en la ASOCIACION DE ARCHIVOS de Windows (la ventana de py que se
REM abre y se cierra). Misma promesa, misma variable, en las tres ramas.
set "CN_PYTHON=python"
goto :py_listo
:py_launcher
set "CN_PY=py -3"
set "CN_PYTHON=py"
:py_listo
if defined CN_PY echo [INFO] Interprete Python para los packs: %CN_PY%
if not defined CN_PY echo [AVISO] No hay Python embebido ni del sistema: los packs :5100/:5102 se omiten.

REM v2.2.3 - CN_PYW se USABA en las tres ventanas de packs (:5100, :5102, :5103)
REM y NUNCA se definio. Vacio, el comando quedaba
REM   start "CerebroNico Memoria :5100" /b /d "..." scripts\hindsight_daemon.py
REM y Windows entregaba el .py a la ASOCIACION DE ARCHIVOS: si ahi no hay Python
REM registrado, el pack no nace y el panel de puertos lo muestra STANDBY para
REM siempre, con el server diciendo que lo intento. Se define con el MISMO
REM interprete que CN_PY (determinismo por encima de la autodeteccion). No se usa
REM pythonw: los tres `start` ya llevan /b, o sea que no habria consola que
REM esconder, y /b conserva la redireccion 1>> %CN_LOGS%\<pack>.log intacta.
set "CN_PYW=%CN_PY%"
if defined CN_PYW echo [INFO] Interprete de los packs con consola oculta: %CN_PYW%


REM ----- 4c2. Autonomia: sanear puertos propios y asegurar deps -----
REM Cadena de autonomia SIN HUMANO. Nunca tumba el arranque: cada paso
REM lleva "|| echo" para que un fallo de autonomia se avise y se siga.
if not defined CN_PY goto :autonomia_sin_python
echo [INFO] Autonomia: saneando puertos propios ocupados...
%CN_PY% autonomia.py puertos --matar || echo [AVISO] autonomia puertos fallo; el arranque sigue igual.
echo [INFO] Autonomia: verificando dependencias del puente...
%CN_PY% autonomia.py deps --auto || echo [AVISO] autonomia deps fallo; el arranque sigue igual.
goto :autonomia_ok
:autonomia_sin_python
echo [ADVERTENCIA] Sin interprete Python no corre la cadena de autonomia.
:autonomia_ok

REM ----- 4c3. Motor de memoria propio (:5103) - VA PRIMERO, Y SE VERIFICA -----
REM v1.71.0 - El backend de destilacion que el daemon :5100 espera en
REM HINDSITE_API_URL. Python puro, sin dependencias, contrato REST propio.
REM Persiste en %PROJECT_DIR%\.cerebro-db\cerebro-motor.json (sobrevive al
REM reinicio). Si no arranca, la IDE funciona igual: es un organo opcional.
REM
REM v2.3.24 - EL ORDEN ES EL ARREGLO. Este bloque estaba ABAJO del de memoria y
REM el `set HINDSITE_API_URL` de abajo se evaluaba antes de que :5103 existiera:
REM en un arranque frio la memoria nacia SIN cerebro y no lo veia hasta el
REM siguiente reinicio. Ahora el motor nace primero, se espera su escucha, y
REM :5100 se configura mirando un puerto que ya esta contestando.
set CN_MOTOR_PORT=5103
set "CN_MOTOR_STORE=%PROJECT_DIR%\.cerebro-db\cerebro-motor.json"
set "CN_CEREBRO_MOTOR=%CN_MOTOR_STORE%"
if not defined CN_PY goto :motor_sin_python
if not exist "%~dp0scripts\cerebro_motor.py" goto :motor_sin_archivo
netstat -ano | findstr ":%CN_MOTOR_PORT% " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :motor_ya_arriba
echo [INFO] Levantando el motor de memoria propio en :%CN_MOTOR_PORT%...
start "CerebroNico Motor :5103" /b /d "%~dp0" %CN_PYW% scripts\cerebro_motor.py --port %CN_MOTOR_PORT% 1>> "%CN_LOGS%\motor.log" 2>&1
REM ----- 4c3-bis. VERIFICAR que :5103 escucha (antes no se miraba) -----
REM v1.0.27 - MISMA PACIENCIA QUE EL SUPERVISOR EN :5103. Con 8 s este archivo se rendia
REM mientras el supervisor seguia dando 90 s de gracia: si el motor tardaba en
REM escuchar, el :5100 nacia sin cerebro y despues el supervisor reanimaba un
REM :5103 que ya estaba arriba (segundo dueno del mismo puerto).
set MOTOR_WAIT=0
:wait_motor
ping /n 2 127.0.0.1 >nul 2>nul
set /a MOTOR_WAIT+=1
netstat -ano | findstr ":%CN_MOTOR_PORT% " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :motor_verificado
if %MOTOR_WAIT% geq %GRACIA_ARRANQUE_S% goto :motor_tarde
echo [INFO] Esperando el motor propio en :%CN_MOTOR_PORT%... %MOTOR_WAIT% s
goto :wait_motor
:motor_verificado
echo [OK] Motor de memoria escuchando en :%CN_MOTOR_PORT% - espero %MOTOR_WAIT% s
goto :motor_ok
:motor_tarde
echo [ADVERTENCIA] El motor :%CN_MOTOR_PORT% no respondio en %GRACIA_ARRANQUE_S% s (la gracia del supervisor).
echo   El motivo esta en: %CN_LOGS%\motor.log
echo   NO se arranca un segundo motor (un solo dueno por puerto): la IDE abre
echo   igual y el supervisor lo reaviva al acabarse su gracia, diciendo el motivo.
goto :motor_ok
:motor_ya_arriba
echo [OK] El motor de memoria ya estaba arriba en :%CN_MOTOR_PORT% - no se duplica.
goto :motor_ok
:motor_sin_python
echo [AVISO] Sin interprete Python no hay motor de memoria propio (:5103).
goto :motor_ok
:motor_sin_archivo
echo [AVISO] Falta scripts\cerebro_motor.py: el motor :5103 se omite.
:motor_ok

REM ----- 4d. Capa de memoria del hibrido (OPCIONAL) -----
REM El demonio (scripts\hindsight_daemon.py) es un pack externo del motor,
REM 100 %% stdlib. Si no esta arriba, la IDE levanta igual y el modelo
REM simplemente no ve las herramientas de memoria: CERO riesgo de arranque.
REM El espejo vive en la raiz unificada (PROJECT_DIR = C:\Cerebronico),
REM no dentro de la carpeta extraida del ZIP, como pide la casa.
set CN_MEMORY_PORT=5100
set "CN_HINDSITE_MIRROR=%PROJECT_DIR%\hindsight-mirror.json"
if not defined CN_PY goto :memoria_sin_python
netstat -ano | findstr ":%CN_MEMORY_PORT% " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :memoria_ya_arriba
echo [INFO] Levantando la capa de memoria hibrida en :%CN_MEMORY_PORT%...
if not exist "%PROJECT_DIR%\" mkdir "%PROJECT_DIR%"
REM v2.1.0: el daemon usa el motor propio :5103 si esta arriba.
REM v2.3.24 - ahora esto corre DESPUES del bloque 4c3 (antes corria antes de que
REM :5103 existiera, o sea: siempre vacio en arranque frio) y el `2>&1` estaba
REM mal escrito: mandaba el stderr del netstat a la consola en vez de callarlo.
netstat -ano | findstr ":%CN_MOTOR_PORT% " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 set "HINDSITE_API_URL=http://127.0.0.1:%CN_MOTOR_PORT%"
start "CerebroNico Memoria :5100" /b /d "%~dp0" %CN_PYW% scripts\hindsight_daemon.py --port %CN_MEMORY_PORT% 1>> "%CN_LOGS%\memoria.log" 2>&1

REM ----- 4d2. VERIFICAR que :5100 responde antes de seguir -----
REM v1.99.12 - el BAT lanzaba el daemon y saltaba a :memoria_ok sin
REM comprobar NADA. Si el daemon moria (SyntaxError, puerto, python
REM equivocado), la ventana decia '[memoria] se cerro' y el usuario
REM veia :5100 apagado sin saber por que. Ahora se espera y se PREGUNTA.
set MEM_WAIT=0
:wait_memoria
ping /n 2 127.0.0.1 >nul 2>nul
set /a MEM_WAIT+=1
netstat -ano | findstr ":%CN_MEMORY_PORT% " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :memoria_verificada
if %MEM_WAIT% geq 12 goto :memoria_tarde
echo [INFO] Esperando la capa de memoria en :%CN_MEMORY_PORT%... %MEM_WAIT% s
goto :wait_memoria
:memoria_verificada
echo [OK] Capa de memoria escuchando en :%CN_MEMORY_PORT% - espero %MEM_WAIT% s
goto :memoria_ok
:memoria_tarde
echo [ADVERTENCIA] La capa de memoria no respondio en 12 s.
echo   La IDE arranca igual (el pack es opcional). El motivo exacto esta en:
echo   %CN_LOGS%\memoria.log
goto :memoria_ok
:memoria_ya_arriba
echo [OK] La capa de memoria ya estaba arriba en :%CN_MEMORY_PORT% - no se duplica.
goto :memoria_ok
:memoria_sin_python
echo [ADVERTENCIA] Sin interprete Python no hay capa de memoria hibrida.
echo   La IDE funciona igual: el pack es opcional. Para tenerla, ejecuta
echo   "node scripts\preparar-python-embed.mjs" (Python embebido dentro
echo   del proyecto, sin instalar nada en Windows) o instala Python 3.8+.
:memoria_ok

REM ----- 4e. Pack creador de sitios web (OPCIONAL) -----
REM Mismo contrato de pack externo que la memoria: si no esta arriba, la
REM IDE arranca igual y el modelo no ve las 22 herramientas de creacion.
REM CN_CREADOR_ROOT fija la raiz de datos FUERA de resources/ y del ZIP:
REM los sitios generados y su historial viven en C:\Cerebronico\.creador.
REM
REM v2.3.24 - QUEJA DIRECTA: "el 5102 no arranca". El lanzador lo prendia con
REM `start /b` y saltaba directo a :creador_ok SIN MIRAR NUNCA si habia nacido.
REM Un pack que muere al nacer (puerto tomado por un residuo, interprete
REM equivocado, .py sin registrar) no deja ventana que leer: el unico sitio con
REM la verdad es el log. Ahora :5102 se ESPERA y se REPORTA como :5100 y :5103.
set CN_CREATOR_PORT=5102
set "CN_CREADOR_ROOT=%PROJECT_DIR%\.creador"
if not defined CN_PY goto :creador_sin_python
netstat -ano | findstr ":%CN_CREATOR_PORT% " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :creador_ya_arriba
echo [INFO] Levantando el pack creador de sitios en :%CN_CREATOR_PORT%...
if not exist "%CN_CREADOR_ROOT%\" mkdir "%CN_CREADOR_ROOT%"
start "CerebroNico Creador :5102" /b /d "%~dp0" %CN_PYW% scripts\creador_daemon.py --port %CN_CREATOR_PORT% 1>> "%CN_LOGS%\creador.log" 2>&1
REM ----- 4e-bis. VERIFICAR que :5102 responde antes de seguir -----
set CREADOR_WAIT=0
:wait_creador
ping /n 2 127.0.0.1 >nul 2>nul
set /a CREADOR_WAIT+=1
netstat -ano | findstr ":%CN_CREATOR_PORT% " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 goto :creador_verificado
if %CREADOR_WAIT% geq 12 goto :creador_tarde
echo [INFO] Esperando el pack creador en :%CN_CREATOR_PORT%... %CREADOR_WAIT% s
goto :wait_creador
:creador_verificado
echo [OK] Pack creador escuchando en :%CN_CREATOR_PORT% - espero %CREADOR_WAIT% s
goto :creador_ok
:creador_tarde
echo [ADVERTENCIA] El pack creador (:5102) no respondio en 12 s.
echo   La IDE arranca igual: solo pierde la creacion de sitios web.
echo   El motivo exacto esta en: %CN_LOGS%\creador.log
echo   (Si dice "No se pudo abrir 127.0.0.1:5102" hay un residuo de otra sesion:
echo    parar_servicios.bat, o desde la IDE: Tareas - Servicios - encendido.)
goto :creador_ok
:creador_ya_arriba
echo [OK] El pack creador ya estaba arriba en :%CN_CREATOR_PORT% - no se duplica.
goto :creador_ok
:creador_sin_python
echo [ADVERTENCIA] Sin interprete Python no hay pack creador de sitios web.
echo   La IDE funciona igual: es un pack opcional.
:creador_ok

REM ----- 4f-cero. REANUDAR.md: el parte que lee el lazo de auto-llamado -----
REM v1.0.2 - EL CONTRATO QUE FALTA. `src/engine/hemisferios.ts:80` jura que
REM "iniciar_todo_windows.bat escribe REANUDAR.md y el motor lo lee al empezar",
REM y `server/routers/autoLlamado.ts` lee ESE archivo como UNICA fuente de
REM "todavia hay trabajo" (a proposito no acepta el plan del navegador, para que
REM no haya dos duenos). Medido: el lanzador nunca lo escribio. Resultado: el
REM lazo contesto "callar / no hay trabajo pendiente" en cada turno, incluso con
REM tareas abiertas - no estaba apagado, estaba CIEGO.
REM
REM La seccion `## Trabajo pendiente` es lo que parsea
REM `src/engine/autoLlamado.ts::parsearReanudar` (toma los renglones `- ...`,
REM hasta 8, y reconoce NINGUNO / no hay / sin como negacion: por eso el parte de
REM arranque dice NINGUNO en vez de mentir con una tarea inventada).
REM El parte vive en la raiz de DATOS: es estado de la sesion, no codigo.
echo.> "%PROJECT_DIR%\REANUDAR.md"
echo # REANUDAR.md - parte de arranque written by iniciar_todo_windows.bat>> "%PROJECT_DIR%\REANUDAR.md"
echo.>> "%PROJECT_DIR%\REANUDAR.md"
echo ## Estado de servicios>> "%PROJECT_DIR%\REANUDAR.md"
echo - Lanzado: %DATE% %TIME% >> "%PROJECT_DIR%\REANUDAR.md"
echo - Raiz de datos: %PROJECT_DIR%>> "%PROJECT_DIR%\REANUDAR.md"
echo - Interprete de packs: %CN_PY% >> "%PROJECT_DIR%\REANUDAR.md"
echo - Motor del cerebro en el puerto %CN_MOTOR_PORT% (el inventario de abajo dice si escucha)>> "%PROJECT_DIR%\REANUDAR.md"
echo.>> "%PROJECT_DIR%\REANUDAR.md"
echo ## Trabajo pendiente>> "%PROJECT_DIR%\REANUDAR.md"
echo - **Trabajo pendiente:** NINGUNO (el lanzador no ve el plan del turno; lo escribe la IDE al cerrar)>> "%PROJECT_DIR%\REANUDAR.md"
echo [INFO] Parte de arranque escrito en: %PROJECT_DIR%\REANUDAR.md

REM ----- 4f-tercer. Motor 3D del sandbox (three r169 vendorizado) -----
REM v1.0.6 - La skill `cn-web-escena-3d` arma escenas que importan "/vendor/three/...".
REM El preview resuelve contra la raiz de DATOS (server/sandboxEstatico.ts:203 usa
REM [raizEfectiva, projectRoot] y projectRoot = PROJECT_ROOT = C:\Cerebronico), asi
REM que el motor tiene que estar copiado ahi. Se prepara una vez por arranque:
REM es idempotente (compara sha256) y NO corta el arranque si falla - la IDE sigue
REM sirviendo proyectos 2D; lo que no va a funcionar es una escena 3D, y eso se avisa.
if not exist "%~dp0scripts\preparar-vendor-3d.mjs" goto :sin_vendor3d
echo [INFO] Preparando el motor 3D del sandbox (three r169)...
node scripts\preparar-vendor-3d.mjs
if errorlevel 1 echo [ADVERTENCIA] El motor 3D no quedo verificado: las escenas que importen
if errorlevel 1 echo   "/vendor/three/three.module.js" van a dar pantalla negra. Corre
if errorlevel 1 echo   "npm run vendor:3d" y mira el log: dice que archivo no verifico.
goto :despues_vendor3d
:sin_vendor3d
echo [AVISO] Falta scripts\preparar-vendor-3d.mjs: no hay motor 3D en esta instalacion.
:despues_vendor3d

REM ----- 4g-antes-del-server. Inventario medido de los SIETE puertos -----
REM v2.3.24 - "no encienden todos" deja de ser una impresion del usuario y pasa
REM a ser una linea por puerto, con el log donde esta el motivo. Se mide con el
REM mismo ancla de puerto exacto que los packs: mirar no es prometer.
echo [INFO] Inventario medido de los puertos de la casa:
call :chequeo 3000  "IDE - la levanta este mismo lanzador"
call :chequeo 3500  "Sandbox - nace al abrir el preview: apagado es normal"
call :chequeo 5000  "Puente PC - lo engendra el server al abrir el puerto"
call :chequeo 5100  "Memoria hibrida - log: %CN_LOGS%\memoria.log"
call :chequeo 5102  "Creador de sitios - log: %CN_LOGS%\creador.log"
call :chequeo 5103  "Motor del cerebro - log: %CN_LOGS%\motor.log"
call :chequeo 11434 "Ollama - inferencia local de la maquina"
:chequeo_fin

REM ----- 4f. Embedder del cerebro (.con-ciencia) -----
REM snowflake-arctic-embed:33m (67 MB, multilingue, dim 384) reemplaza a
REM embeddinggemma (621 MB, monolingue ingles, dim 768). El motor lee
REM CN_EMBED_MODEL en src/engine/embedderLocal.ts y cae a embeddinggemma
REM solo si esta variable NO esta definida. Requiere reiniciar el server
REM para que el proceso en memoria tome el valor nuevo.
set "CN_EMBED_MODEL=snowflake-arctic-embed:33m"

echo ============================================================
echo   Arrancando CerebroNico server en http://127.0.0.1:3000
echo   (el puente Python en :5000 se auto-inicia desde el server,
echo    con el MISMO interprete resuelto arriba via CN_PYTHON/PATH)
echo ============================================================
echo.
echo Abre tu navegador en:  http://127.0.0.1:3000
echo.
echo [TIP] Si los puertos se desconectan, usa el boton Reconectar de la
echo       pestana Puertos en el panel izquierdo de la UI.
echo.

REM ----- 5. Server -----
REM (CN_PYTHON y el PATH ya quedaron resueltos en el paso 4c: el puente
REM  :5000 usa el MISMO interprete que los packs, con prioridad embebido.)
REM
REM v2.3.5 - LA APERTURA ELIGE EL MEDIO, Y LO DICE EN EL LOG.
REM  `npm run dev` levanta el server CON Vite DENTRO del proceso: cada modulo del
REM  frente se transpila al primer pedido (App.tsx pasa de las 6000 lineas) y en un
REM  equipo modesto eso es, literalmente, el "tarda muchisimo en abrir" que reporto
REM  el usuario. El propio log del 3/11 lo delata: "Cliente: Vite en modo DESARROLLO
REM  (NODE_ENV=development). Vite transforma y sirve /src/*".
REM  La salida ya estaba escrita y vallada (suite devSinVite): `dev:sin-vite` corre
REM  la MISMA fuente con NODE_ENV=production y sirve dist/. PERO su predev corre
REM  `vite build` SIEMPRE: abrir "sin Vite" reconstruyendo el frente cada vez sale
REM  MAS LENTO, y ahi estaba la trampa. El eslabon que faltaba era este lanzador,
REM  que elegia `dev` sin preguntar si habia algo compilado.
REM  Orden, de mas rapido a mas lento:
REM    1  dist\server.mjs + dist\index.html -> npm run start       (node, sin tsx, sin Vite)
REM    2  dist\index.html nomas             -> npm run dev:sin-vite (compila una vez)
REM    3  nada compilado                    -> npm run dev          (Vite en el proceso)
REM  CN_USAR_VITE=1 fuerza el modo 3 para desarrollar con recarga en caliente.
REM  El modo elegido se IMPRIME: lo que no aparece en el log no se puede diagnosticar.
set "CN_ABRIR=dev"
set "CN_ABRIR_SCRIPT=dev"
REM v1.0.39 - `if ... set A & set B` NO es un bloque: el & corta la linea y
REM `set B` corre SIEMPRE, aunque el if sea falso. Con dist/ ausente, el log
REM imprimia "npm run dev:sin-vite" mientras abria "npm run dev". Cada rama
REM en su linea y sin &.
if not exist "%~dp0dist\index.html" goto :sin_dist_index
set "CN_ABRIR=sin-vite"
set "CN_ABRIR_SCRIPT=dev:sin-vite"
:sin_dist_index
if not exist "%~dp0dist\server.mjs" goto :sin_dist_server
if not exist "%~dp0dist\index.html" goto :sin_dist_server
set "CN_ABRIR=start"
set "CN_ABRIR_SCRIPT=start"
:sin_dist_server
REM
REM v2.3.7 - UN dist/ VIEJO NO PUEDE GANAR.
REM  La eleccion de arriba mira si EXISTE dist/, pero existir no es estar a tiempo:
REM  si server.ts es MAS NUEVO que dist/server.mjs, `npm run start` serviria un
REM  server de otra era. Ahi es donde "el .bat se cae" se vuelve inreportable,
REM  porque el log cuenta lo que hizo el binario viejo, no lo que dice el codigo.
REM  Se compara por fecha de escritura; si el codigo manda, se baja al modo que
REM  recompila (dev:sin-vite) y SE DICE por que se bajo. CN_FORCAR_START=1 es la
REM  salida del que sabe que su dist esta bien y no quiere recompilar.
set "CN_MAS_NUEVO="
for /f "delims=" %%F in ('dir /b /o-d "%~dp0dist\server.mjs" "%~dp0server.ts" 2^>nul') do if not defined CN_MAS_NUEVO set "CN_MAS_NUEVO=%%F"
if not "%CN_MAS_NUEVO%"=="server.ts" goto :dist_a_tiempo
if "%CN_FORCAR_START%"=="1" goto :dist_a_tiempo
if not "%CN_ABRIR%"=="start" goto :dist_a_tiempo
echo [AVISO] server.ts es mas nuevo que dist/server.mjs: el paquete rapido esta
echo         viejo. Se abre con npm run dev:sin-vite, que recompila antes de abrir.
echo [TIP] Dejar el rapido a tiempo, una vez: npm run build
set "CN_ABRIR=sin-vite"
set "CN_ABRIR_SCRIPT=dev:sin-vite"
:dist_a_tiempo
if not "%CN_USAR_VITE%"=="1" goto :sin_forzar_vite
set "CN_ABRIR=dev"
set "CN_ABRIR_SCRIPT=dev"
:sin_forzar_vite
if "%CN_ABRIR%"=="start" goto :abrir_start
if "%CN_ABRIR%"=="sin-vite" goto :abrir_sin_vite
echo [INFO] Abriendo CON Vite en el proceso - no hay cliente compilado en dist\.
echo [TIP] Para abrir rapido hace falta una sola vez: npm run build. Despues el
echo        lanzador usa dist/ por si solo y no vuelve a transpilar el frente.
call npm run dev
if %errorlevel% neq 0 goto :dev_fallo
goto :abrir_fin
:abrir_sin_vite
echo [INFO] Abriendo SIN Vite: hay cliente compilado en dist/ (npm run dev:sin-vite).
echo [INFO] Ojo: este modo recompila el frente antes de abrir (predev). Para no
echo        recompilar cada vez, deja que el lanzador tome `npm run start`.
call npm run dev:sin-vite
if %errorlevel% neq 0 goto :abrir_reintento
goto :abrir_fin
:abrir_start
echo [INFO] Abriendo RAPIDO: server y cliente ya compilados (npm run start).
echo [INFO] Si cambiaste codigo, recompila el frente con npm run build - aca se sirve dist/.
call npm run start
if %errorlevel% neq 0 goto :abrir_reintento

:abrir_reintento
REM v2.3.7 - EL REPLIEGUE: si el modo elegido fallo, se reintenta UNA vez con el
REM modo que no depende de nada compilado, y se dice en el log. No es un bucle: el
REM reintento fija CN_ABRIR=dev y, si aun asi falla, cae en el diagnostico de
REM siempre. Reintentar en lazo sobre un puerto ocupado es justo lo que hace que el
REM usuario cierre la ventana y termine abriendo la consola a mano.
if "%CN_ABRIR%"=="dev" goto :dev_fallo
echo [AVISO] npm run %CN_ABRIR_SCRIPT% fallo con codigo %errorlevel%.
echo [AVISO] Reintento UNA vez con npm run dev (no necesita dist/ ni cliente compilado).
set "CN_ABRIR=dev"
set "CN_ABRIR_SCRIPT=dev"
call npm run dev
if %errorlevel% neq 0 goto :dev_fallo
:abrir_fin
echo.
echo [INFO] "npm run %CN_ABRIR_SCRIPT%" termino sin errores.
REM v1.70.2 - LA VENTANA NO SE CIERRA SOLA NI EN LA RUTA DE EXITO.
REM Antes, un "npm run dev" que terminaba en orden (Ctrl+C, o el
REM server cerrando por cualquier motivo) iba directo a :fin y la
REM ventana desaparecia sin dejar leer nada: el clasico "el bat se
REM cerro solo". Ahora la ruta buena pasa por la misma pausa final;
REM con stdin=NUL (modo EXE oculto) la pausa pasa sola como siempre.
goto :pausa_final

:dev_fallo
echo.
echo [ERROR] "npm run %CN_ABRIR_SCRIPT%" termino con codigo %errorlevel%.
echo   Causas tipicas: puertos 3000 o 5000 ocupados, node_modules
echo   incompletos, o Node y npm fuera del PATH. Cierra la otra
echo   instancia de la IDE y reintenta.
goto :pausa_final

:npm_fallo
echo.
echo [ERROR] Falto "npm install" - revisa arriba el error de npm.
echo   Si estas offline, la primera vez necesita red para instalar.

:pausa_final
echo.
echo La ventana espera una tecla para cerrarse - lee el mensaje de arriba.
echo (Si el server corto de golpe, el motivo esta unas lineas mas arriba;
echo  el detalle de puertos y RAM vive en la pestana Puertos de la IDE.)
pause
goto :fin

REM ============================================================
REM   Subrutina: medir UN puerto exacto y decirlo (v2.3.24)
REM   Se llama:  call :chequeo 5102  "Creador de sitios"
REM   El ancla `":5102 "` (puerto + espacio) es la que evita el falso positivo:
REM   `findstr ":5102"` tambien lee :51020, :51021 y las conexiones salientes.
REM   Sin parentesis y sin echo dentro de bloques: son las reglas de este archivo.
REM ============================================================
:chequeo
set "CN_ARIBA=APAGADO"
netstat -ano | findstr ":%~1 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 set "CN_ARIBA=ARRIBA"
echo   [%CN_ARIBA%] :%~1  %~2
exit /b 0

:fin
endlocal
exit /b 0

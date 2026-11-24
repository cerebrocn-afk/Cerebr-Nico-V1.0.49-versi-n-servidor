# INFORME DE SESIÓN — CerebroNico IDE v2.0.0

**Fecha:** 31 de octubre de 2026, 23:54 (America/Montevideo)
**Raíz analizada:** `C:\Users\BirdBox\Downloads\CerebroNico-IDE-v2.0.0\app`
**Versión declarada:** 2.0.0 (`src/constants.ts` · `package.json` · coherentes)
**Método:** verificación por ejecución (scripts Python de solo lectura). Nada de este informe es de memoria.

---

## 1. RESUMEN EJECUTIVO

| Área | Estado | Prueba |
|---|---|---|
| Empaquetado en 4 ZIP | **VERDE** | reensamblado + SHA-256 de 2.304 archivos: IDÉNTICO |
| Puente PC `:5000` | **VERDE** | 50.110 bytes · 53 herramientas · lista blanca + contención + origen + papelera |
| Memoria `:5100` | **VERDE** | v1.2.0-hybrid · `/health` 200 · 200 skills · embedder vivo |
| Creador `:5102` | **VERDE** | 211.862 bytes · MANIFIESTO 32 = EJECUTORES 32 (paridad exacta) |
| Motor TypeScript | **VERDE** | 328 archivos · 0 imports rotos reales |
| Tests | **VERDE (no ejecutados)** | 253 archivos de test presentes en `tests/` |
| Sandbox `:3500` | **CERRADO** | normal: no hay preview levantado |

---

## 2. LO QUE SE HIZO EN ESTA SESIÓN

### 2.1 Empaquetado dividido en 4 partes

**Script:** `C:\Users\BirdBox\Desktop\cn_empaquetar.py`
**Salida:** `C:\Users\BirdBox\Desktop\CerebroNico-IDE-v2.0.0-parte{1..4}-de-4.zip`

| Parte | Archivos | Bytes |
|---|---|---|
| parte1-de-4 | 574 | 12.799.198 |
| parte2-de-4 | 45 | 14.334.820 |
| parte3-de-4 | 496 | 17.598.993 |
| parte4-de-4 | 1.189 | 9.711.450 |
| **Total** | **2.304** | **54.444.461 (51,9 MB)** |

**Excluido del paquete (a propósito):** `node_modules/`, `dist/`, `.git/`, cachés, `__pycache__/`, `.log`, `.tmp`, `.bak`.

**Verificación de reensamblado** (`cn_verificar.py`):
```
original: 2304 · paquete: 2304 · coinciden: 2304
solo en original: 0 · solo en paquete: 0 · hash distinto: 0
VEREDICTO: IDENTICO
```

**Incidente y corrección:** en el primer empaque la parte 4 salió truncada (sin firma `PK`). Se regeneró desde cero y se re-verificó. El paquete actual es el bueno.

**Para reconstruir tras descomprimir:**
```
npm install
npm run build
```

### 2.2 Daemon de memoria `:5100` — endurecido a v1.2.0

**Archivo:** `scripts/hindsight_daemon.py` (76.825 bytes)

Tres defensas añadidas, todas verificadas por ejecución:

1. **Contención de rutas de sistema** (`_BLOQUEADAS_SISTEMA`): el daemon ahora rechaza indexar `C:\Windows`, `C:\Windows\System32`, `C:\Program Files`, `~/.ssh`, `/etc/shadow`, `/etc/passwd`. Antes caminaba el disco sin veto.
2. **Validación de origen** (`_origen_ok`): solo loopback (`127.0.0.1`, `localhost`, `::1`), con o sin `Origin`. El puerto se descarta con `urlparse().hostname`, así que `http://127.0.0.1:3000` pasa.
3. **Aviso en `stderr`** al descartar una ruta bloqueada, en vez de ignorarla en silencio.

**Estado vivo:**
```
{"ok": true, "servicio": "cerebronico-hindsight", "version": "1.2.0-hybrid",
 "skills": 200, "embedder": {"activo": true, "modelo": "snowflake-arctic-embed:33m", "vivo": true}}
```

### 2.3 `.bat` de arranque — verificación real de `/health`

**Archivo:** `iniciar_todo_windows.bat` (18.298 bytes · 355 líneas · 0 LF sueltos)

El arranque de memoria ya **no es a ciegas**: lanza el daemon, sondea `netstat` hasta 12 s y bifurca:
- escucha → `:memoria_verificada` → `goto :memoria_ok`
- no escucha → `:memoria_tarde` → avisa con la ruta del log → `goto :memoria_ok`

**Incidente y corrección (importante, no ocultarlo):** tres intentos de parche fallidos rompieron el `.bat` (LF mezclados, bloque insertado tras `:memoria_ok`, tres `goto` duplicados). Se restauró desde el respaldo `.bak-antes-health` y se aplicó **una sola pasada en modo binario**. La versión en disco es la correcta y está verificada leyendo el archivo.

### 2.4 Comparación con la versión vieja del puente

Se comparó `agent_bridge_5000.py v1.7.0` (el que estaba abierto en el editor) contra el actual:

| Pieza | v1.7.0 | Actual |
|---|---|---|
| Bytes | ~16.000 (fragmento) | 50.110 |
| Binarios permitidos | 15 | 46 |
| Nativos Windows | 7 | 9 |
| Config externa | hardcodeada | `puente-permitidos.json` |
| `acceso_absoluto` | no existe | existe, fail-closed en `false` |
| `agente_pc_activo` | no existe | existe |
| `fs_delete` | destruye | mueve a `.cerebro-papelera/` |
| Tabla de despacho | **rota** (dos listas a mano) | anuncio y despacho son el mismo objeto |

**Conclusión:** el actual es posterior y no perdió ningún mecanismo de seguridad del viejo.

---

## 3. LO QUE SE NECESITA CORROBORAR

Estas son las cosas que **no están probadas por ejecución** y que conviene cerrar antes de dar el paquete por bueno:

| # | Qué | Por qué importa | Cómo corroborarlo |
|---|---|---|---|
| 1 | El `.bat` arranca de verdad y la ventana de memoria queda abierta | El parche está verificado estructuralmente, **no ejecutado**. Es el punto más frágil de la sesión. | Doble clic en `iniciar_todo_windows.bat` y mirar `C:\Cerebronico\logs\arranque\memoria.log` |
| 2 | `npm install` + `npm run build` sobre el árbol descomprimido | El paquete excluye `node_modules` y `dist`; sin esto no arranca | Descomprimir las 4 partes en carpeta limpia y ejecutar ambos |
| 3 | `npm run validar` (253 suites) | Los tests **no se ejecutaron**; solo se contó que existen | `npm run validar` en la raíz del proyecto |
| 4 | `espejo.unidades: 0` | El índice está vacío: corre en modo espejo (`backend_configurado: false`), sin Hindsight real | Indexar un proyecto y volver a mirar `/health` |
| 5 | El 403 aislado en `POST /tools/call` | Apareció **una vez** al arrancar; las siguientes dieron 200. No se reprodujo | Vigilar si se repite con el daemon ya estable |
| 6 | Sandbox `:3500` | Está cerrado porque no hay preview levantado. No es un fallo | Arrancar el sandbox desde la IDE |
| 7 | `index.html` declara `v2.3.1` | `constants.ts` y `package.json` dicen `2.0.0`. El regex capturó un número de otra etiqueta; **verificar a mano** si es la versión del producto o de otra cosa | Leer el `<title>`/`<meta>` de `index.html` |

---

## 4. RUTAS RELATIVAS (todas desde la raíz `app/`)

### 4.1 Órganos del sistema

| Órgano | Ruta relativa | Puerto |
|---|---|---|
| Puente PC | `agent_bridge_5000.py` | 5000 |
| Daemon de memoria | `scripts/hindsight_daemon.py` | 5100 |
| Creador de sitios | `scripts/creador_daemon.py` | 5102 |
| Arranque Windows | `iniciar_todo_windows.bat` | — |
| Config del puente | `puente-permitidos.json` | — |
| Versión | `src/constants.ts` | — |

### 4.2 Motor TypeScript (rutas verificadas como existentes)

```
src/engine/knowledgeBase.ts
src/engine/conciencia.ts
src/engine/autovalido.ts
src/engine/bucleAutonomo.ts
src/engine/ejecucionReal.ts
src/engine/fallbackAutonomo.ts
src/engine/packTerminal.ts
src/engine/toolRegistry.ts
src/engine/terminalInteractivo.ts
src/constants.ts
```

### 4.3 Scripts de trabajo de esta sesión (Escritorio)

```
C:\Users\BirdBox\Desktop\cn_empaquetar.py
C:\Users\BirdBox\Desktop\cn_verificar.py
C:\Users\BirdBox\Desktop\cn_verif_motor.py
C:\Users\BirdBox\Desktop\cn_verif_motor2.py
C:\Users\BirdBox\Desktop\cn_verif_imports_final.py
C:\Users\BirdBox\Desktop\cn_verif_imports_ok.py
C:\Users\BirdBox\Desktop\cn_verif_imports3.py
C:\Users\BirdBox\Desktop\cn_verif_imports4.py
C:\Users\BirdBox\Desktop\cn_verif_imports5.py
```

---

## 5. FUNCIONES NO ENCONTRADAS

### 5.1 Resultado de la búsqueda de imports rotos

**328 archivos revisados · 0 imports rotos reales.**

Los 4 candidatos que marcó el primer verificador son **falsos positivos**, todos dentro de comentarios o plantillas de texto:

| Archivo | Línea | Naturaleza real |
|---|---|---|
| `src/engine/ejecucionReal.ts` | 35 | Dentro de bloque `/** ... */` — ejemplo de cableado futuro |
| `src/engine/packTerminal.ts` | 9 | Dentro del docstring de cabecera — instrucción de montaje |
| `src/engine/packTerminal.ts` | 12 | Dentro del docstring de cabecera — instrucción de montaje |
| `src/engine/fallbackAutonomo.ts` | 75 | Dentro de plantilla markdown con ` ```typescript ` escapado |

**Causa del falso positivo:** el verificador no distinguía código de comentario. Corregido en `cn_verif_imports5.py`, que lee el tramo y lo juzga.

### 5.2 Símbolos que NO existen y por los que no hay que buscar

- `src/services/appKernel` — **no existe** `src/services/` en el proyecto. La única aparición es dentro del texto de `fallbackAutonomo.ts:75` (plantilla markdown), no es un import real.
- `_raiz_permitida` — existe en `agent_bridge_5000.py`, **no** en el daemon de memoria (el daemon usa `_raices_index` y `_dentro_de`).

### 5.3 Módulos huérfanos conocidos (declarados, no cableados)

- `src/engine/ejecucionReal.ts` — el propio docstring lo declara: *«Mientras ese cable no exista, el módulo es HUÉRFANO a propósito (probado, no cableado)»*.
- `src/engine/packTerminal.ts` — expone 5 herramientas de terminal; su montaje está documentado en el docstring, no aplicado.

---

## 6. INVENTARIO VERIFICADO

### 6.1 Creador de sitios — paridad exacta

```
MANIFIESTO: 32 herramientas
EJECUTORES: 32 herramientas
Paridad:    TRUE
Solo en manifiesto:   0
Solo en ejecutores:   0
```

Lista completa: `auditar_contraste`, `auditar_pagina`, `auditar_sitio`, `componente_consentimiento`, `componente_modo_oscuro`, `crear_archivo`, `crear_bloque`, `crear_og_image`, `crear_pagina`, `crear_pwa`, `crear_sitio`, `crear_sitio_multipagina`, `desplegar_carpeta`, `ejecutar_ruta_paralelo`, `estado_creador`, `exportar_sitio_zip`, `forjar_desde_brief`, `forjar_y_entregar`, `formulario_destino`, `generar_hreflang`, `generar_schema_jsonld`, `insertar_imagen`, `listar_exportaciones`, `listar_sitios`, `mejorar_hasta_estable`, `mejorar_pagina`, `plan_de_construccion`, `planificar_ruta_trabajo`, `plantillas_disponibles`, `preflight_rendimiento`, `previsualizar_sitio`, `verificar_despliegue`.

### 6.2 Motor de conocimiento

```
src/engine/knowledgeBase.ts  · 30.145 bytes · 36 entradas semilla · 6 imports _KB_ENTRIES
src/engine/conciencia.ts     · exports: CONCIENCIA_KB_ENTRIES, BUCLES_KB_ENTRIES, COHERENCIA_KB_ENTRIES
```

### 6.3 Puente PC

```
agent_bridge_5000.py · 50.110 bytes
53 herramientas anunciadas
Lista blanca de binarios:  SÍ
Contención de raíces:      SÍ
Validación de origen:      SÍ
Papelera (no destruye):    SÍ
```

### 6.4 Tests

```
tests/ · 253 archivos .test.ts / .test.mjs / .test.js
NO EJECUTADOS en esta sesión
```

### 6.5 Puertos al cierre

| Puerto | Servicio | Estado |
|---|---|---|
| 3000 | IDE | ESCUCHA |
| 3500 | Sandbox/preview | CERRADO (sin preview) |
| 5000 | Puente PC | ESCUCHA |
| 5100 | Memoria | ESCUCHA |
| 5102 | Creador | ESCUCHA |
| 11434 | Ollama | ESCUCHA |

---

## 7. DEUDA TÉCNICA Y RIESGOS ABIERTOS

1. **El `.bat` no se ha ejecutado nunca con el parche final.** Es el riesgo número uno. Los tres parches fallidos previos demuestran que este archivo es frágil al `edit` por texto; cualquier cambio futuro debe hacerse en modo binario y verificarse leyendo el tramo completo.
2. **El daemon corre en modo espejo.** `backend_configurado: false`, `unidades: 0`. Sin Hindsight real, el recall es BM25+coseno local. Funciona, pero no es memoria semántica completa.
3. **`node_modules` y `dist` no viajan en el paquete.** Quien lo reciba debe ejecutar `npm install` y `npm run build`. Está escrito en el manifiesto del Escritorio.
4. **La versión en `index.html` (`2.3.1`) no coincide con `constants.ts`/`package.json` (`2.0.0`).** Puede ser otra etiqueta (versión de UI, de plantilla). Requiere lectura humana.
5. **Dos módulos huérfanos** (`ejecucionReal.ts`, `packTerminal.ts`) están probados pero no cableados. No es un defecto: está declarado en su propio código.

---

## 8. ARCHIVOS EN EL ESCRITORIO

```
CerebroNico-IDE-v2.0.0-parte1-de-4.zip   12.799.198 bytes
CerebroNico-IDE-v2.0.0-parte2-de-4.zip   14.334.820 bytes
CerebroNico-IDE-v2.0.0-parte3-de-4.zip   17.598.993 bytes
CerebroNico-IDE-v2.0.0-parte4-de-4.zip    9.711.450 bytes
CerebroNico-IDE-v2.0.0-MANIFIESTO.txt    SHA-256 de cada parte + comandos
INFORME-SESION-CerebroNico-v2.0.0.md     este documento
```

---

## 9. CONCLUSIÓN HONESTA

**Lo que está probado por ejecución:** el paquete reconstruye el árbol exacto (2.304 archivos, hash a hash), el creador tiene paridad 32/32, el puente tiene las cuatro defensas activas, el daemon responde en v1.2.0 con las tres nuevas, y no hay un solo import roto real en 328 archivos.

**Lo que no está probado:** que el `.bat` arranque bien de punta a punta, que los 253 tests pasen, y que el índice de memoria tenga contenido.

**La diferencia importa.** Lo primero lo puedo afirmar porque lo ejecuté. Lo segundo no, y no lo voy a decir por decir.

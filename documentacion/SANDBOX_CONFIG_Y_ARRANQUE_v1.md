# SANDBOX — Opciones de configuración y por qué tarda en arrancar

**v1.16.6 · 2026-09-27** · Analizado sobre el código real de `server.ts` (ruta
`/api/sandbox/start`), `src/engine/viaRapidaPreview.ts`,
`src/components/ConfigModal.tsx`, `src/components/RightSidebar.tsx` y
`iniciar_todo_windows.bat`.

> El sandbox es el servidor del PROYECTO en :3500 (la IDE vive en :3000 y el
> puente PC en :5000). «Arrancar el sandbox» = decidir una vía de preview y,
> si hace falta, instalar dependencias y levantar `npm run dev`.

---

## 1. Dónde se configura hoy (3 casas distintas)

### 1.1 UI de la IDE

| Opción | Dónde | Qué hace |
|---|---|---|
| Puerto del preview | Menú CN → Configuración → pestaña **«Sandbox Web Preview»** (`ConfigModal.tsx`) | Solo documenta/fija 3500; el servidor lee `SANDBOX_PORT` del entorno, NO de este campo. Cambiarlo aquí sin la variable de entorno no mueve nada. |
| Piloto automático del sandbox | Panel derecho → pestaña **Sandbox** → interruptor «Auto» (`RightSidebar.tsx`, clave `codigo0_sandbox_auto` en localStorage) | Con OFF la IDE deja de arrancar/sincronizar el sandbox sola; el botón «Arrancar» manual sigue funcionando. |

### 1.2 Variables de entorno (las que de verdad mandan)

Se leen en `server.ts` al recibir `/api/sandbox/start`. En Windows se ponen
antes de `call npm run dev` en `iniciar_todo_windows.bat` (`set X=...`) o como
variables de sistema.

| Variable | Valor de fábrica | Efecto sobre el ARRANQUE |
|---|---|---|
| `SANDBOX_PORT` | `3500` | Puerto del preview. |
| `SANDBOX_AUTO_DEPS` | activada | **Preflight**: audita `node_modules` ANTES de spawn y corre `npm install` (timeout 600 s) si hay paquetes ausentes/rotos. `SANDBOX_AUTO_DEPS=0` → no instala antes de arrancar (más rápido, pero un árbol podado dará preview roto). |
| `AUTO_INSTALL_DEPS` | activada | **Escalera de reparación**: si el proceso muere sin abrir el puerto y el log queja módulos → `npm install` (600 s) + reintento; si sigue roto → **purga `node_modules` e instala de cero** (otros 600 s). `AUTO_INSTALL_DEPS=0` → se salta la escalera y el error se reporta con pista. |
| `SANDBOX_IDE_BUILD` | `0` | Solo afecta a la IDE-dentro-de-la-IDE: `1` fuerza `npm run build` (hasta 300 s) aunque `dist/` esté al día. Déjala en 0 salvo que sospeches un bundle viejo (trampa documentada en LEEME_QUIROFANO). |
| `OFFLINE_MODE` | no | Apaga la salida a internet del motor; no toca el sandbox directamente, pero evita esperas de red en máquinas sin internet. |
| `CEREBRONICO_DATOS` | `C:\Cerebronico` (la pone el BAT) | Raíz donde vive `.proyectos/` (el sandbox sirve de ahí). Moverla a un disco lento = arranque lento. |

### 1.3 localStorage del navegador (preferencias de UI, no del motor)

| Clave | Vista | Qué hace |
|---|---|---|
| `codigo0_sandbox_auto` | RightSidebar | Piloto automático ON/OFF (§1.1). |
| `codigo0_web_side_width` | Editor web | Ancho del panel de estado. |
| `codigo0_web_editor_mode` (nueva v1.16.6) | Chat central | Recuerda el chip «Editor ON». |
| ~~`codigo0_web_order_draft`~~ | — | Muerta v1.16.6: era el borrador del textarea eliminado del editor. |

---

## 2. La secuencia real de `/api/sandbox/start` y dónde se va el tiempo

```
1. GUARDA-ZOMBIE        isPortUp(:3500, 1.2 s) + killPortListeners   ~1-3 s
2. Guardas de recursión leer package.json, detectar IDE anidada       ~0 s
3. resolverRaizProyecto escaneo de niveles (marcadores de proyecto)   ~0-2 s
4. leerFicherosProyecto árbol hasta 800 archivos / profundidad 10     ~0-2 s
5. AUDITORÍA node_modules saludDePaquete por cada declarado           ~0-5 s
6. VÍA RÁPIDA (decide viaRapidaPreview):
   · estatico-directo   → sirve tal cual, CERO install                ~1 s   ← el rápido
   · estatico-compilado → UNA pasada de esbuild de la IDE (≤120 s)     ~1-10 s
   · npm-dev            → lo de abajo                                  ← el LENTO
7. PREFLIGHT npm install (si SANDBOX_AUTO_DEPS≠0 y hay ausentes/rotos) HASTA 10 MIN
8. spawn npm run dev (Vite arranca frío: optimiza deps, escanea)      ~3-30 s
9. waitPortOrDeath(45 s) sondeo cada 1.5 s
10. ESCALERA (si murió y AUTO_INSTALL_DEPS≠0): install(10 min) +
    reintento(60 s) + PURGA node_modules + install(10 min)            HASTA ~21 MIN
```

**Conclusión honesta:** un proyecto estático o con `node_modules` sano arranca
en segundos (vías 1-2 de §6). Lo que «tarda mucho» es casi siempre **npm
install dentro del arranque** (pasos 7 y 10), y eso dispara cuando el proyecto
importado llega **sin** `node_modules` (un ZIP limpio, como te gusta
empaquetar a ti) o con el árbol podado. El timeout de 600 s por install no es
un capricho: es para que un árbol grande termine; pero en red lenta cada
paso 7 es literalmente el arranque eterno.

### Cómo saber cuál es TU caso (sin adivinar)

- La respuesta de `/api/sandbox/start` trae `via` (`estatico-directo` |
  `estatico-compilado` | `npm-dev`) y `instalo` (¿instaló en este arranque?).
- La consola del server dice la vía elegida con motivo:
  `[CerebroNico] Preview por «npm-dev»: …` y luego los `npm install automático`.
- El panel Sandbox (derecha) muestra el log del proceso.

---

## 3. Recetas según lo que quieras

### 3.1 «Quiero el arranque más rápido y acepto instalar yo si hace falta»

En `iniciar_todo_windows.bat`, justo antes de `call npm run dev`:

```bat
set SANDBOX_AUTO_DEPS=0
set AUTO_INSTALL_DEPS=0
```

Efecto: el sandbox NUNCA instala durante el arranque; si faltan dependencias,
el preview falla con motivo explícito (y la pista dice el comando exacto).
Cuesta menos de 1 s por arranque, pero un proyecto recién importado sin
`node_modules` no levantará hasta que hagas `npm install` una vez a mano en
`.proyectos`.

### 3.2 «Quiero seguir reparándome solo pero sin el infierno de los 21 minutos»

No toques las dos variables. Lo que paga es **pre-instalar una vez**, fuera
del arranque:

```bat
cd /d C:\Cerebronico\.proyectos && npm install --no-audit --no-fund
```

Con el árbol sano, el paso 5 (auditoría) dice «ok», el 7 no dispara, y el
arranque vuelve a ser Vite frío (segundos). La escalera (§10) solo se paga
cuando algo está roto de verdad.

### 3.3 «Mi proyecto es HTML/CSS/JS puro»

No le pongas `package.json` vacío «por si acaso»: sin package.json la vía
decidida es `estatico-directo` (sirve tal cual, ~1 s). Con package.json y sin
marco con servidor, la vía es `estatico-compilado` (un esbuild, sigue siendo
rápido). El `npm-dev` lento es solo para marcos con su propio servidor o
config propia respetable.

### 3.4 «El preview tarda en aparecer aunque el puerto ya está»

Es el sondeo del iframe (`DedicatedWebEditorView`, reintento con backoff de
800 ms → 4 s, máx. 20 intentos) y el `waitPortOrDeath` de 1.5 s por vuelta.
Son deliberados (el puerto puede responder antes de que el index exista). Si
molestas, el botón «Refrescar preview» del editor salta la espera.

---

## 4. Lo que NO hay que tocar para «acelerar»

- **GUARDA-ZOMBIE** (§1): sin ella, un resto de sesión anterior en :3500 se
  confunde con tu app («sale igual pero no es la de ahora»). Cuesta 1.2 s.
- **Auditoría de `node_modules`** (§5): es lo que detecta el árbol podado por
  ZIP/instalación cortada; sin ella vuelven los previews en blanco con 200 OK.
- **Purga selectiva de paquetes rotos** (§7): borra solo las carpetas de los
  paquetes podados, nunca código tuyo.
- **`--ignore-scripts` en la IDE anidada**: evita el postinstall que siembra
  `.cerebro-db` y los ~100 MB de Electron del binario.

## 5. El sandbox y el puerto 5000 (aislado desde v1.16.6)

Dos capas, ambas activas en el código de esta versión:

1. **Arranque**: `spawnSandbox` marca el entorno del hijo con
   `CN_SANDBOX_CHILD=1` y `startAgentBridge` lo respeta — el sandbox NUNCA
   levanta su propio puente :5000 (ni se peleaba ya por el puerto).
2. **Sondeo (el hueco cerrado v1.16.6)**: el cargador de packs externos leía
   `tools.config.json` y, también dentro del hijo, hacía `GET
   http://127.0.0.1:5000/tools` al pack «puente-mcp» con escalera de 12
   reintentos cada 5 s. Eso es tráfico contra el puente DEL ANFITRIÓN
   —mientras el Agente PC habla con el modelo por ese mismo puente—: la
   interferencia reportada. Ahora `ES_HIJO_SANDBOX && apuntaAlPuente(url)`
   omite esos packs con aviso en el log (`Pack "puente-mcp" OMITIDO: este
   proceso corre DENTRO del sandbox`). Los packs externos que apunten a otros
   servicios (no al :5000) siguen cargándose igual.

Comprobación en la suite: `tests/accionesRapidas.test.ts` §6 (3 guardas
estáticas). Prueba de humo esperada en el log del hijo: la línea OMITIDO y
ningún `fetch failed` hacia `127.0.0.1:5000` en bucle.

## 6. Opciones que faltan (si se quieren, es un parche chico)

Hoy **no hay** interruptor en la UI para `SANDBOX_AUTO_DEPS` /
`AUTO_INSTALL_DEPS` (solo variable de entorno) y el campo «Puerto» del
ConfigModal es decorativo (no se conecta al server). Si quieres, en la v1.16.7
se puede: (a) añadir dos checkboxes en la pestaña Sandbox que escriban un
`cn-sandbox.json` junto a `puente-permitidos.json` (mismo patrón: fichero
versionado, decisión escrita, derechos de fábrica si falta la clave), y (b)
hacer `sandboxPort` real leyendo ese mismo fichero en el server.

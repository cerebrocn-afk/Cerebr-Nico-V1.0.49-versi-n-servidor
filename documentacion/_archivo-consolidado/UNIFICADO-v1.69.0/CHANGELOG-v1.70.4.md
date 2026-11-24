## v1.70.4 · 2026-10-25 · UNA SOLA PANTALLA DE ARRANQUE Y UN OLLAMA QUE POR FIN DA VERDE

Capturas del 25/10 sobre v1.70.3: Mario muestra (1) el cartel del vigilante
«La interfaz no terminó de cargar» y (2) el splash del motor con **Ollama
:11434 en rojo por timeout — «nunca da verde»**. Pide además: una sola
pantalla (esta segunda) durante toda la carga, y la pregunta honesta: «¿esto
solo pasa en dev o también en el EXE?».

### 1 · Una sola pantalla desde el primer milisegundo (index.html · BLANCO v2)

Antes, con caché de Vite fría, se veían hasta TRES pantallas distintas:
negro → tarjeta «está cargando» (12 s) → tarjeta «no terminó de cargar» (30 s)
→ y recién ahí el splash real del motor. Ahora:

* El propio `index.html` pinta AL INSTANTE (vanilla, sin React, sin
  dependencias) el **pre-arranque con la misma cara del BootSplash**: fondo
  `#03060c`, anillos girando, cerebro cian y el título «CerebroNico
  arrancando motor». Es LO ÚNICO que se ve hasta que React monta — la
  transición es invisible porque el diseño es hermano.
* El vigilante pasó a segundo plano: deja de pintar tarjetas propias y sigue
  registrando en silencio cada recurso que falla. Solo si a los **30 s** #root
  sigue vacío, muestra el diagnóstico y los pasos de rescate **dentro de la
  misma pantalla** (lista de fallos + los tres comandos + «Reintentar»), y
  todo desaparece solo cuando la interfaz monta.

### 2 · Ollama deja de mentir en rojo (server/routers/diagnostico.ts)

El «nunca da verde» tenía tres causas juntas, y las tres se arreglan:

* **Sonda en dos pasos**: `GET /api/version` (siempre instantáneo, no carga
  modelos) responde el «¿vive?»; `/api/tags` (que sí puede tardar cuando
  Ollama está metiendo un modelo en RAM) responde el «¿qué hay?» con 9 s de
  paciencia. Ollama vivo pero ocupado sale **en verde** con el detalle honesto
  («vivo (v…); la lista de modelos se hace de esperar»), no como avería. Rojo
  solo cuando no contesta ni la versión.
* **Sondas en paralelo** (antes: Ollama→sandbox→puente de una, hasta 10 s por
  pasada; el splash tardaba más en ver algo que lo que tardaba el chequeo).
* **Cache de 1,5 s** en `/api/health/deep`: el splash pregunta cada 1,2 s y la
  barra de estados también; re-sondear Ollama en cada lectura hacía que dos
  pasadas se pisaran justo cuando el motor está cargando — la receta del
  timeout eterno.

Y en el splash (`BootSplash.tsx`): la ventana para esperar verde pasó de 6 s a
**12 s** con polling continuo — mientras haya una pasada roja sigue sondeando;
a los 12 s aparece «Entrar de todos modos» sin bajar el telón. La pantalla
espera; no secuestra.

### 3 · ¿Esto pasa también en el EXE (dist)? — Respuesta corta: no, la parte fea es del dev

Las esperas largas y el cartel del vigilante son del modo `npm run dev`: Vite
transforma los 231 archivos «al vuelo» la primera vez (en el log de Mario:
«Vite en modo DESARROLLO»). Con `npm run build` (lo que entra al `dist/` del
EXE), los bundles salen **precompilados**: el pre-arranque dura un pestañeo y
el cartel de rescate no tiene nada que rescatar. El splash del motor SÍ sigue
ahí en producción (es parte de la app) y ahora es la única cara en los dos
mundos. Mismo `index.html`, mismos archivos: lo que se valida acá es lo que
empaquetás.

### Verificación

`tsc --noEmit` + `npm run validar` completo sobre el árbol final; suites vivas:
`superficieRutas` (health/deep sigue en `server/routers/diagnostico.ts`),
`esperaNube`/`pivotProveedores` (sondas), y el arranque real en la máquina de
Mario como test definitivo.

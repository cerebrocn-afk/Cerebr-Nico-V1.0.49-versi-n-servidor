# HOJA DE RUTA v1.16.5 → v1.16.5 — PLAN DETALLADO HASTA EL FINAL (VALIDADO CONTRA EL CÓDIGO REAL)
**Fecha:** 2026-09-27 · **Estado del árbol:** v1.16.5 en curso · **Créditos limitados: este documento es la entrega**

---

## A. YA CORREGIDO EN ESTE CICLO (v1.16.5, código aplicado)

| # | Queja del usuario | Causa raíz encontrada | Arreglo aplicado | Verificación |
|---|---|---|---|---|
| A1 | «Instrucciones extra del sistema»: **no deja ingresar/pegar** | `Row/Toggle/Slider/Num/Txt/Sel` estaban DEFINIDOS DENTRO del componente → cada tecla React los veía como componente nuevo → desmontaje/remontaje del panel → el textarea perdía el foco al primer carácter y el pegado caía sobre un nodo desprendido («no es editable») | Hoist de los 6 controles al ámbito del módulo (`src/components/ProConfigPanel.tsx`) | `tsc --noEmit` = 0 errores |
| A2 | «Le cuesta el arranque… se queda» con copia anidada de la IDE | El piloto detectaba la recursión pero el cliente **auto-continuaba con aviso** (`reintentando con confirmación…`): arrancaba DOS IDEs compartiendo RAM y el preview nunca mostraba la app del usuario | RECURSIÓN v2: el primer clic SOLO informa y NO arranca nada; el segundo clic confirma explícitamente (`recursionPendienteRef` en `RightSidebar.tsx`) | pendiente: verificar completo |
| A3 | «Se queda» sin señales | Silencio total mientras el servidor instalaba dependencias (minutos) antes de spawnear | VIGILA-ARRANQUE: latido cada 20 s («siguen trabajando (Xs)… no cierres la página») durante `/api/sandbox/start` | pendiente |
| A4 | «El sandbox debería tener un botón de reinicio» | Solo existía Detener + Arrancar (y «Reiniciar preview» que era un alias engañoso) | Botón **Reiniciar** (cielo, junto a Detener): stop → start completo en un clic (`handleSandboxReiniciar`) | pendiente |

## B. PENDIENTE — plan exacto para el siguiente ciclo (cada paso con archivo y línea de anclaje verificados hoy)

### B1 · «Le paso código o logs y CONTESTA BLOQUEADO» (máxima prioridad)
Diagnóstico hecho sobre el código: dos sospechosos, en este orden de ataque.

1. **Clasificador del coreo demasiado goloso** — `src/engine/coreo.ts`, `CLASIFICADOR[0]`:
   `/no se pudo|no se guard|NO se |no pasó|no tiene|se pierde|queda en la URL|rechaz|bloquea|BLOQUEO|ilegal/i → "bloqueado"`.
   Cuando el usuario pega un log, el agente NARRA líneas que CITAN ese log («no se pudo conectar», «connection refused»→«rechaz»…), y el chip ⛔ BLOQUEADO sacude aunque no haya fallo real.
   **Arreglo propuesto:** exigir que el aviso sea del EJECUTOR, no una cita:
   - descartar líneas que lleguen prefijadas como eco (`/^\s{2,}/`, `logTail`, o entre comillas « »);
   - quitar los genéricos `NO se `, `no tiene`, `rechaz`, `bloquea`, `ilegal` del regex 0 y dejarlos solo en anclajes largos (`El motor bloqueó`, `No se pudo`, `BLOQUEO:`);
   - mantener los literales que la suite `coreo` (22 comprobaciones) fija hoy: pasar la suite tras cada recorte.
2. **Reinicio de tarea al responder «lee»** — en `runOllamaAgentLoop` (server.ts ~10.900), cada mensaje nuevo construye el turno desde cero: si el turno anterior quedó «bloqueado» (B1.1), el bucle vuelve a planificar la tarea completa. Revisar `memoriaDeTurno`/`contextCache` (el cache existe: `src/utils/contextCache.ts`) y comprobar que el historial llega al request `/api/ai/stream` (`messages` se construye en `src/App.tsx` ~línea 2500; verificar que NO se poda a 1 mensaje cuando hay error).

**Criterio de aceptación:** pegar un log con «failed/refused/no se pudo» y preguntar «¿qué dice?» → el chip muestra `actividad`/`pensar`, NUNCA ⛔; decir «lee» continúa el plan sin recomenzarlo.

### B2 · `systemExtra` es un regulador mudo
`settings.ai.systemExtra` se guarda pero NADIE lo consume (grep: solo proSettings.ts:62/134 y ProConfigPanel).
**Arreglo:** en el cliente, donde se arma el system prompt del chat (buscar `system` en `src/utils/engine.ts` / payload de `/api/ai/stream`), añadir `+ "\n\nREGLAS DEL PROYECTO: " + settings.ai.systemExtra` si no está vacío. El server ya acepta el campo `system` en el body. **Prueba:** suite nueva o extensión de `esperaNube` comprobando que el texto viaja.

### B3 · «Le pedí una imagen y no salió nada» (gemini finge con HTML)
El mecanismo existe: orden ```cerebronico:imagen``` (`chatOrders.ts:561-570`) + plan `generar_imagen`. El modelo nube escribió `<img src="langosta.jpg">` + recarga en 3 s (farsa).
**Arreglo (2 líneas de prompt, sin riesgo):** en `instruccionesParaElModelo()` añadir: «PROHIBIDO escribir `<img>` que apunte a un archivo que no existe en el proyecto: si falta la imagen, EMITE PRIMERO la orden cerebronico:imagen y dile al usuario que la verás al revelarse. Si no puedes, dilo con palabras.»
**Mejora siguiente (ciclo aparte):** detector client-side en `extraerOrdenes`: si la respuesta HTML referencia `src="*.jpg|png|webp"` y ese archivo no está en el workspace → aviso honesto en el chat + botón «revelar ahora» que emite la orden con el prompt deducido del alt.

### B4 · «No pude borrar: No existe: Desktop/Cerebronico-v1.16.4»
`pc_delete`/herramientas PC resuelven rutas relativas contra el cwd del server, no contra el perfil del usuario.
**Arreglo:** en el resolvedor de las herramientas `pc_*` (server.ts, bloque `Herramientas de ACCESO PC REAL` ~1380-1436): si la ruta empieza por `Desktop/`, `Documents/`, `Downloads/` → prefijar `os.homedir()`. Motivo en el error cuando no exista (ya dice «No existe: X» — añadir «resuelta desde <base>»).

### B5 · Uso correcto del sandbox (documentar, no codear)
El ZIP de la IDE NO va al sandbox: `.proyectos` es para las APPS que se construyen. Para trabajar sobre el código de la propia IDE: `PROJECT_DIR=C:\Cerebronico` (o el BAT desde la carpeta descomprimida), y el Editor/Árbol para abrirla como proyecto. La A2 ya corta el camino erróneo con aviso claro.

## C. ORDEN DE EJECUCIÓN RECOMENDADO (con presupuesto)
1. B1.1 (regex del coreo) → suite `coreo` + suite nueva con 6 logs citados → 30 min.
2. B2 (systemExtra) → 15 min + prueba.
3. B3 (regla de honestidad de imagen) → 10 min.
4. B1.2 (reinicio de tarea) → requiere reproducir: pedir al usuario el log del server del turno «lee» → después.
5. B4 (rutas Desktop) → 15 min.
6. Cierre: `validar` + `build` + `superficie --verificar` + manifiesto + ZIP v1.16.5.

## D. Validación del presente ciclo (obligatorio antes de empaquetar)
`node scripts/validar.mjs` (75 suites + tipos) · `node scripts/superficie.mjs --verificar` · `npm run build` · manifiesto regenerado sobre el staging con la estructura doble de la casa.

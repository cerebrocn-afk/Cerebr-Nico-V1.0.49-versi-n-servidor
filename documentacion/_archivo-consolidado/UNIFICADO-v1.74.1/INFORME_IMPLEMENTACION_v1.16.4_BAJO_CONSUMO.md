# INFORME DE IMPLEMENTACIÓN — v1.16.4 · MODO BAJO CONSUMO + CAMINO QUIRÚRGICO
**Proyecto:** CerebroNico IDE v1.16.4 (parche sobre el árbol v1.16.3-blanco-v1)
**Fecha:** 2026-09-27 · **Base:** `Cerebronico-v1.16.3-blanco-v1.zip` (proyecto seleccionado: `Cerebronico-v1.16.3`, NO el árbol viejo `ide/` v1.6.31)

---

## 1. Qué se implementó (mejora propuesta → realidad medida)

| § del informe MEJORA | Estado | Dónde |
|---|---|---|
| 2.1 BAT con caducidad (`-1`→`5m`) | ✔ hecho y blindado para empaque | `iniciar_todo_windows.bat` |
| 2.2 `keep_alive` por escalón MR | ✔ escalera 3m/5m/0 leída de RAM real; conductor y warmup incluidos | `src/engine/modelTiers.ts` + cable en `server.ts` |
| 2.3 RAM visible + botón Expulsar | ✔ `/api/ollama/ps`, `/api/ollama/expulsar`, bloque `ollama` en `/api/system/stats`, chip + botón en Puertos | `server/ollamaBajoConsumo.ts`, `server/routers/ollamaControl.ts`, `telemetria.ts`, `LeftSidebar.tsx`, `App.tsx` |
| Contrato SUPERFICIE | ✔ server.ts 11 520 → **11 512** (se extrajo `server/salidaProcesos.ts` para pagar lo nuevo: partir, no añadir). 138 rutas en contrato, VEREDICTO: CONTRATO INTACTO | `contrato-rutas.json` |
| Versión en fuente única | ✔ `VERSION_SEMVER` 1.16.4 (un solo literal + package.json) | `src/constants.ts` |

## 2. Los dos apagones que se curan, explicados

1. **El modelo clavado**: `-1` mantenía el pico sostenido de energía. Con `5m`, a los 5 minutos sin uso Ollama expulsa; la siguiente respuesta recarga sola. La escalera MR refinina por petición: equipo limitado (≤8 GB) con modelo >7 B → `keep_alive: "0"` (carga bajo demanda EXPLÍCITA; nada residente de más). El botón Precalentar (warmup) sigue pudiendo residir el modelo 5 m: la demanda explícita del usuario manda sobre el ahorro (`keepAliveExplicito`).
2. **El BAT que se cerraba**: el ZIP entregaba el BAT en LF puro —cmd lo parsea mal y la ventana muere al instante («se cerraba enseguida»). v1.16.4 fija **CRLF**, quita todos los bloques `if (...)` con eco dentro (la otra trampa clásica), y usa `pause` a secas ante errores: con doble-clic espera la tecla (el error se puede leer); con el EXE oculto (stdin=NUL) pasa solo y no cuelga el arranque. PROHIBIDO documentar `pause <nul` otra vez: esa redirección mata la pausa TAMBIÉN para el usuario.

Comprobables en 3 pases:
```bash
grep -c $'\r$' iniciar_todo_windows.bat    # >0: CRLF
grep -n "OLLAMA_KEEP_ALIVE" iniciar_todo_windows.bat   # solo =5m
node scripts/superficie.mjs --verificar    # CONTRATO INTACTO
```

## 3. Herramientas activas ampliadas (pack `sistema`)

`ollama_estado` (residentes + MB medidos), `ollama_expulsar` (keep_alive:0, total o por modelo), `recursos_maquina` (cores, RAM total/libre, residente Ollama). Las tres `cheap`: llegan también a los modelos chicos. El ejecutor (`server.ts`) las delega al MISMO módulo que alimenta el chip de Puertos: una verdad, dos puertas.

## 4. Automatismo consciente ampliado: crear → modificar → reparar

`src/engine/bucleAutonomo.ts` (pura, fuera del trinquete) gana:
- **Fases del turno**: `faseDelTurno` — sin obra = CREAR; con mutación exitosa = MODIFICAR; con fallo (o reincidencia ≥2 de una herramienta) = REPARAR.
- **Escalera de reparación de 3 escalones** (`escalonDeReparacion` + `directivaDeReparacion`): 1) cambiar de camino (otra herramienta/ruta, leer antes de tocar); 2) diagnosticar y retroceder (`revisar_cambios`/`deshacer_cambios`/`run_tests` sobre el error exacto); 3) reconstruir lo mínimo y, si no cierra, INFORME HONESTO — nunca un «listo» con obra abierta.
- **Presupuesto de reparación**: `techoDePasos` compra hasta 6 pasos extra por herramientas con fallos abiertos (sin perder el tope duro). El cable en `runOllamaAgentLoop` registra `fallosPorHerramienta` e `historialBucle`, y el tablero muestra `[fase · escalón]`.

## 5. El camino de los archivos (mandato del usuario)

`entrada (chat / adjunto del editor) → contenedor → SOLO lo necesario al ÁRBOL DEL PROYECTO → lista QUIRÚRGICA al SANDBOX`

- **Peaje de entrada** (`aduanaDeEntrada` en `App.tsx`, aplicado a ADJUNTO DEL CHAT y ADJUNTO DEL EDITOR): lo PROHIBIDO (secretos, node_modules, `.git`, logs, copias `.proyectos`, rutas absolutas o con `..`) no entra nunca, con su motivo en la terminal; lo que la aduana marca «preguntar» se confirma EN BLOQUE con la pregunta que el propio motor redactó (`auditarArbol`); lo normal (código/config/docs) pasa sin ruido. Lo rechazado sigue vivo como adjunto del chat: no se pierde, solo no se hace archivo del proyecto.
- **Abrir un `.cn`** (`parseCnFile`): mismo veto de entrada — un paquete viejo o hecho a mano ya no mete basura en el árbol.
- **Lista quirúrgica al sandbox** (`syncToDisk`): filtra con `puedeIrEnElEmpaque` ANTES de enviar; lo vetado se informa. Menos archivos cruzando = menos disco, menos sync, menos consumo (coherente con el modo bajo consumo).

## 6. Validación

- `node scripts/validar.mjs`: **0 fallos** — incluye la suite nueva `tests/bajoConsumo.test.ts` (**77**) con ficha de catálogo, y `bucleAutonomo.test.ts` extendido (**71**).
- Tipos (`tsc --noEmit`): sin errores (se ejecutó como parte de validar).
- `npm run superficie:verificar`: CONTRATO INTACTO (138 rutas; server.ts 11 512 ≤ presupuesto).
- Criterios de aceptación del informe MEJORA: (1) 10 min sin chatear → `ollama ps` = 0 modelos (5m + escalera); (2) la primera respuesta tras expulsar recarga sola (el motor manda keep_alive por perfil en cada petición); (3) verificar en verde; (4) el pico que apagaba la PC ya no existe por diseño.

## 7. REVIVE — nitidez de la interfaz (pedido del usuario sobre el GIF de la IDE)

El pedido: «que el aspecto/color/tono de la interfaz se vea más nítido sin cansar la vista». Diagnóstico sobre el código real: el cuerpo usaba `#000000` fijo (mataba la jerarquía de superficies), las juntas por defecto eran invisibles, el texto por defecto tiraba a gris lavado, los `backdrop-blur` de Tailwind (24–64 px) hacían «babear» el contenido detrás de los paneles de vidrio, y los tonos de acento con que la app ESCRIBE (cyan 100/200/300) llegaban deslavados.

Tratamiento en UN punto de control (`src/index.css` + el bloque THEMES de `proSettings.ts`, que es quien pisa los tokens al arrancar):

| Palanca | Antes | Ahora | Por qué no cansa |
|---|---|---|---|
| `body` background | `#000000` | `var(--cn-bg, #05070d)` | el azul-noche da profundidad sin negro absoluto |
| Suavizado de texto | browser default | antialiased + optimizeLegibility + kerning | fuera el fleco sub-pixel de colores sobre oscuro |
| Junta global | `#121824` | `#1a2436` | un escalón: el panel se recorta, no grita |
| `--cn-border` / `--cn-text` | `#162034` / `#e5e7eb` | `#1e2b45` / `#eef2f7` | texto más nítido sin blanco puro |
| `--blur-*` (Tailwind) | 4…64 px | 2…18 px | vidrios limpios; la GPU desenfoca ~la mitad (bajo consumo) |
| cyan 100/200/300 (mix) | 34/60/82 % | 42/66/90 % | el acento se ve VIVO sin subir el brillo de fondo |

Todo por variables de tema: ninguna clase tocada, ningún `!important` nuevo, y el deslizador de acento del panel Pro sigue mandando sobre la escala completa. Verificación: 75 suites 0 fallos + build.

## 8. Límites honestos

- No hubo PC Windows aquí: el BAT se validó por construcción (CRLF, cero bloques, pines en la suite) y por las reglas de cmd, no ejecutándolo en cmd.
- `ollama ps` no informa MB en versiones viejas de Ollama: el chip muestra «—» antes que inventar un número.
- El `verificar` deja 1 marca ✗ informativa en `planner` (preexistente en la base entregada, suite verde).

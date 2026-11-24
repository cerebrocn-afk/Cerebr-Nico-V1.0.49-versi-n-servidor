# Cómo actualizar a CerebroNico v1.56.3

> **Qué arregla (en una frase):** los modelos LOCALES chicos (como
> `gemma3:270m`, `qwen2.5:0.5b` o `llama3.2:1b`) ahora responden rápido, como
> en tu terminal, porque la IDE les manda una instrucción corta y liviana en vez
> del “manual” gigante que los hacía tardar minutos (o colgar la PC).

Cambio chico y seguro: toca dos archivos de código (`server.ts` y
`server/streamContext.ts`). Elegí UNO de los dos caminos.

---

## 0) Antes que nada: copia de seguridad (1 minuto)

1. Cerrá CerebroNico del todo.
2. Copiá toda la carpeta del programa a otro lado (al Escritorio, por ejemplo)
   y llamala `CerebroNico_RESPALDO_1.56.2`.

Con eso podés volver cuando quieras.

---

## Camino A — Reemplazar la carpeta completa (lo más simple, recomendado)

1. Cerrá CerebroNico.
2. **Borrá la carpeta vieja** del programa (ya tenés el respaldo del paso 0).
   - Si vas a instalar encima, borrá también la subcarpeta `node_modules` vieja
     para que tome las versiones nuevas.
3. Descomprimí el ZIP nuevo (`CerebroNico_v1.56.3.zip`) donde tenías el
   programa.
4. En una ventana de comandos, dentro de esa carpeta:
   ```
   npm install
   ```
5. Arrancá como siempre (tu `iniciar_todo` o `npm run dev`).

---

## Camino B — Cambiar solo los archivos afectados (si no querés reinstalar)

Esta versión toca **dos archivos de código** y los números de versión. Copí del
ZIP nuevo ENCIMA de los tuyos (reemplazando):

- `server.ts`  ← el del arreglo (modo liviano local)
- `server/streamContext.ts`  ← tope de espera ajustable
- `package.json`, `src/constants.ts`, `index.html`  (solo cambia el número de versión)
- `CHANGELOG.md` y este `ACTUALIZACION_v1.56.3.md` (opcional, para tener la nota)

No hace falta `npm install` (no cambiaron dependencias). Arrancá como siempre.

---

## Cómo verificar que quedó bien

1. Abrí CerebroNico. En el título debería decir **V1.56.3**.
2. Prueba del arreglo:
   - Elegí un modelo LOCAL chico (p. ej. `gemma3:270m` o `qwen2.5:0.5b`).
   - Mandá un mensaje corto (“hola, ¿qué día es hoy?”).
   - **Antes** tardaba más de un minuto. **Ahora** debería empezar a contestar en
     pocos segundos.
3. Si querés confirmarlo por dentro: en la consola del servidor verás un aviso
   del tipo `🪨 Modo LIVIANO local para "gemma3:270m"… system corto, SIN
   herramientas y contexto mínimo`. Esa línea es la señal de que actuó.

### Sobre `llama3.2:1b` y los cuelgues

El 1B ya NO debería colgar con el modo liviano. Pero ojo: tu Dell tiene 8 GB y
sin placa de video, y la IDE levanta varias cosas a la vez (servidor, puente
Python, memoria, creador de sitios) más Ollama. Si notas que el 1B va muy al
límite:

- Usá el botón **Expulsar** (pestaña Puertos) para liberar RAM antes de pedirle.
- Cerrá el navegador pesado / otras apps mientras lo usás.
- Para lo chico y rápido, quedáte en `gemma3:270m` / `qwen2.5:0.5b`.
- Para trabajo intenso, lo cómodo sigue siendo Gemini o GLM-4.7-Flash (Z.ai).

---

## Cómo volver atrás (revertir)

- **Camino A:** borrá la carpeta nueva y volvé a poner `CerebroNico_RESPALDO_1.56.2`.
- **Camino B:** volvé a copiar `server.ts`, `server/streamContext.ts`,
  `package.json`, `src/constants.ts` e `index.html` desde tu respaldo.

---

## Perillas (opcional, para avanzados)

Nuevas en 1.56.3:

- `CN_LOCAL_LIVIANO=1` → fuerza el modo liviano local (`=0` para apagarlo y usar
  el prompt completo). Si no la tocás, se activa sola en modelos chicos
  (micro/tiny) o equipos de 8 GB o menos.
- `CN_WATCHDOG_IDLE_MS` → cuánto espera la app SIN recibir nada del modelo antes
  de cortar, en milisegundos (por defecto `180000` = 3 min; mínimo `10000`).
  Si tu máquina es muy justa y a veces corta justo cuando iba a contestar,
  subilo (p. ej. `240000`).

Siguen vigentes las de antes (para el relevo automático nube→local):
`CN_RELEVO_MODO_LIVIANO`, `CN_RELEVO_TIMEOUT_MS`, `CN_RELEVO_LOCAL`.

> Aclaración: cuando viste en el log cosas como `429 RESOURCE_EXHAUSTED` o
> `gemini-2.5-flash no longer available (404)`, eso NO es un bug: es la **cuota
> diaria del plan gratis de Gemini** agotada (son unas pocas decenas de
> pedidos por día) y un modelo viejo retirado por Google. Por eso conviene tener
> siempre a mano un local chico o GLM-4.7-Flash.

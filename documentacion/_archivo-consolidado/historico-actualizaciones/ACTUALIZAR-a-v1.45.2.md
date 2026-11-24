# Cómo actualizar a CerebróNico v1.45.2

Esta versión hace que el chat **recuerde el contexto de tareas largas** y, al
mismo tiempo, **responda lo más rápido posible**. No hay que tocar tu clave de
API ni tus ajustes.

## Qué cambia para ti
- En conversaciones largas, el asistente ya no «se olvida» de lo que estaban
  haciendo: lo viejo se resume y se mantiene en contexto.
- El prompt sigue siendo pequeño, así que la primera palabra sigue saliendo
  rápido (y se evita el error «Prompt exceeds max length» de antes).
- El resumen se arma solo, sin gastar otra llamada al modelo: no suma espera.

---

## Antes de nada: copia de seguridad
Antes de reemplazar nada, guarda una copia de tu carpeta actual:

- Copia toda la carpeta `Cerebronico-v1.45.1` y renombra la copia a algo como
  `Cerebronico-v1.45.1-RESPALDO`.

Así, si algo no te gusta, vuelves a la copia y listo.

---

## Opción A (recomendada) — reemplazar la carpeta completa
1. Descomprime el ZIP nuevo (`Cerebronico-v1.45.2.zip`).
2. Usa esa carpeta nueva como tu proyecto.
3. Dentro de la carpeta, abre una consola y ejecuta:
   - `npm install`
   - `npm run dev` (o tu lanzador `iniciar_todo`).

## Opción B — actualización mínima (solo los archivos que cambiaron)
Si prefieres no reemplazar toda la carpeta, copia SOLO estos 4 archivos del ZIP
nuevo encima de tu carpeta actual:

- `server.ts`
- `src/engine/modelTiers.ts`
- `package.json`
- `src/constants.ts`

Luego, dentro de la carpeta: `npm install` y `npm run dev`.

---

## Cómo verificar que quedó aplicada
1. En la app, mira el número de versión: debe decir **V1.45.2**.
2. Ten una charla larga (varios mensajes) y luego pregunta algo que mencionaste
   al principio: debería recordarlo.
3. (Opcional, técnico) En la consola donde corre el servidor verás un aviso del
   tipo: «Los N más antiguos se CONDENSARON en un resumen (memoria de tareas
   largas), no se perdieron.» cuando el historial es largo.

## Cómo revertir si no te convence
- Borra la carpeta nueva y vuelve a usar tu `...-RESPALDO`, o
- Si usaste la Opción B, vuelve a copiar esos 4 archivos desde tu respaldo.
- En ambos casos: `npm install` y `npm run dev`.

---

## Nota honesta
No pude compilar ni probar el arranque en Windows desde mi entorno. El cambio es
de bajo riesgo (afecta cómo se recorta/condensa el historial, nada de tu clave
ni de la interfaz). Si al correr `npm run dev` ves cualquier error, avísame con
el texto exacto y lo ajusto.

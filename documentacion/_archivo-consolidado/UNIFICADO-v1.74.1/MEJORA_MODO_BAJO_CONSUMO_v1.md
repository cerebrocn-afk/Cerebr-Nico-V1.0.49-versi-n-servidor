# MEJORA v1 — Modo bajo consumo en el arranque de Ollama
**Proyecto:** CerebroNico IDE v1.16.3 · **Fecha:** 2026-09-27
**Autor de la propuesta:** asistente (sobre el árbol con parche BLANCO v1)

---

## 1. Problema que resuelve

`iniciar_todo_windows.bat` fuerza `OLLAMA_KEEP_ALIVE=-1`: el modelo queda clavado
en RAM/VRAM **para siempre**, aunque el usuario no esté inferenciando. Ese es el
pico sostenido de energía que apaga el PC (síntoma reportado: "al levantar la app
se apagaba la pc"). La IDE y el puente :5000 no necesitan al modelo residente en
el arranque — solo cuando el usuario pide una respuesta.

Riesgo de NO arreglarlo: apagones → cortes bruscos → caché `.vite` corrupta →
pantalla blanca (el ciclo que ya se vivió esta semana). El BLANCO v1 hace el
síntoma visible; esta mejora ataca la causa.

## 2. Cambios propuestos (3, en orden de valor)

### 2.1 El BAT: keep-alive con caducidad
```bat
REM antes
set OLLAMA_KEEP_ALIVE=-1
REM después
set OLLAMA_KEEP_ALIVE=5m
```
Ollama expulsa el modelo tras 5 minutos sin uso. La IDE vuelve a cargarlo sola
en la siguiente petición. Coste: cero líneas en `server.ts`.

### 2.2 El motor: `keep_alive` por petición, según el modelo elegido
En las llamadas a `/api/generate` y `/api/chat` de `server.ts`, añadir:
```json
"options": { "keep_alive": "<según escalón MR>" }
```
- MR1/MR2 (equipos de 4–8 GB, modelos ≤1.7 B): `"3m"` — el modelo pequeño
  recalienta menos pero igual merece salir de RAM.
- MR3+ con modelo pesado (>7 B): `"0"` por defecto → **carga solo bajo demanda
  explícita**; la primera respuesta tarda, las siguientes 5 min van rápidas.
- La escalera ya existe en `scripts/gen-modelfile.ts` (MR1/MR2/MR3+) → no hay
  que inventar la clasificación, solo leerla desde el motor.

### 2.3 La interfaz: RAM de Ollama visible + botón "Expulsar modelo"
- `/api/system/stats` ya mide CPU real (v1.6.22); sumar `ollama_ps` (GET
  :11434/api/ps) → lista de modelos residentes con su RAM exacta.
- En la pestaña "Puertos" del panel izquierdo: chip `Ollama: 4.1 GB` + botón
  **Expulsar** → `POST /api/chat` con `keep_alive: 0` (descarga inmediata).
- Ganancia: el usuario ve por qué se apaga la máquina y tiene la salida sin
  abrir la consola.

## 3. Encaje con los contratos del proyecto

| Contrato | Impacto |
|---|---|
| SUPERFICIE (server.ts ≤ 11520 líneas) | 2.2 agrega ~10 líneas → hay que compensar extrayendo un helper al mismo tiempo (Fase 2 "partir, no añadir"). 2.1 y 2.3 no lo tocan casi. |
| QUIRÓFANO | Aplicar sobre snapshot nuevo; `npm run verificar` debe quedar en 0 fallos antes de entregar. |
| Fuente única de versión | Si se entrega, subir parche como v1.16.3.1 en `IDE_BRAND`, no en 4 literales. |

## 4. Plan de ejecución estimado

| Paso | Tarea | Tiempo |
|---|---|---|
| 1 | Cambiar el BAT (2.1) | 5 min |
| 2 | `keep_alive` por escalón en las 2 llamadas del motor (2.2) | 40 min |
| 3 | `/api/ollama/ps` en server.ts + botón en Puertos (2.3) | 1–2 h |
| 4 | Snapshot + `verificar` + `build` + prueba con modelo pesado | 30 min |

## 5. Criterios de aceptación

1. Con la app abierta 10 min sin chatear, `ollama ps` muestra 0 modelos y la RAM liberada.
2. La primera respuesta tras la expulsión vuelve sola (sin tocar nada) y llega.
3. `npm run verificar` → 3913+ comprobaciones, 0 fallos.
4. Ningún apagón reproduciéndose en la máquina del usuario durante la prueba larga.

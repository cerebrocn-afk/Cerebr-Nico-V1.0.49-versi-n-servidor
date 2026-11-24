# LA HOJA DE RUTA TIENE TRES COSAS — CerebroNico IDE v1.0.20

> Documento vivo. Reemplaza como **descripción de la hoja de ruta de la interfaz**
> a todo lo que se escribió sobre «la barra de tareas en formato de chat»
> (v2.0.1). Aquel pedido se cumplió y quedó **supersedido**: el 15/11 Mario miró
> la hoja en capturas y dijo qué sobraba.

---

## 1 · El pedido, textual

> «hoja de ruta en capturas — ▸ Código · 48 · 283 KB ▸ Avisos · 2 · 11 KB ▸
> Descripciones · 6514 · 41,8 MB ▸ Datos · 5 · 1,4 MB ▸ Entregables · 1 · 540 KB
> **TODO ESO QUITARLO**. La hoja de ruta está llena de cosas innecesarias.
> **QUÉ DEJAR: 1) LA RECONEXIÓN DE PUERTOS, 2) PASOS DE LA TAREA DEL AGENTE, LA
> HOJA DE RUTA CON LOS PASOS DE LA RUTA, Y 3) EL ENTREGABLE FINAL. NADA MÁS EN LA
> HOJA DE RUTA.**»

---

## 2 · Qué se ve ahora (y en qué orden)

| # | Bloque | Qué muestra | Cuándo aparece |
|---|---|---|---|
| 1 | **Reconexión de puertos** | Sólo los puertos **caídos**, con su número, quién es, para qué sirve y **qué se pierde**. Botón «Reconectar» sólo si hay alguno abajo. | Siempre. Con todo arriba, una sola línea en verde: «Todos los puertos contestan». |
| 2 | **Pasos de la tarea** | Los pasos **del plan vigente**, desde el primero: ✓ hecho · ▶ en curso · ✗ roto (con su motivo) · · pendiente. Contador `hechas/total`. | Siempre. Sin tarea: «Sin tarea en marcha». Si el plan ya cerró, lo dice. |
| 3 | **Entregable final** | **Uno solo**: nombre, peso y número de archivos. Botón «⬇ Descargar <nombre>» **sólo** si la obra cerró y el paquete está empacado. | Siempre. A medias dice «todavía no hay entregable final: el trabajo no cerró». |

Nada más. Ni inventario por grupos, ni repartidor, ni interruptores, ni ciclo
 de decisión, ni «Acciones en la PC», ni planes viejos, ni barra de progreso por
plan.

---

## 3 · Qué NO se borró (y no se va a borrar sin veredicto)

Quitar ruido de la cara **no** es borrar capacidad. Sigue todo igual:

| Capacidad | Dónde vive | Quién la usa ahora |
|---|---|---|
| `agruparEntregables()` · `clasificarArchivo()` · `pesoLegible()` | `src/engine/entregable.ts` | `/api/sandbox/zip-info` |
| Los cinco grupos (Código / Avisos / Descripciones / Datos / Entregables) | `zip-info` → `grupos` | **Panel completo** (el botón del pie de la hoja) |
| Descarga por archivo suelto (`/api/sandbox/zip?archivo=…`) | `server/sandboxEntregable.ts` | Panel completo |
| Repartidor, semáforo, hilos, interruptores de servicio | Panel completo del cerebro de tareas | `onOpenPanel` |
| `actionLog` del puente :5000 | `App.tsx` → `PlanificationPanel` | Se sigue pasando (la prop existe) pero **no se pinta** en la hoja |

---

## 4 · La reconexión de puertos no se duplicó

Ya existía: `App.tsx → handleReconnectAll()` (POST `/api/bridge/restart`,
POST `/api/telemetry/refresh`, `checkTelemetry`, `fetchInstalledModels`, con
`isReconnecting`). La hoja **consume** ese gesto (`onReconnectAll` +
`isReconnecting`); no hay una segunda copia del conectar.

Los seis puertos declarados, con su «para» y su «se pierde»:

| Puerto | Quién | Se pierde si está abajo |
|---|---|---|
| 3000 | IDE | el chat no puede hablar con el motor |
| 3500 | entorno de prueba | no hay vista previa del proyecto |
| 5000 | puente | no se puede leer ni escribir en la carpeta vinculada |
| 5100 | sandbox | el agente no puede ejecutar lo que escribe |
| 5102 | sandbox (respaldo) | el sandbox queda sin segunda vía |
| 11434 | inferencia local | los modelos de la casa (y los de pago manejados desde acá) van sin índice ni pre-chequeo |

---

## 5 · Dónde está el código

| Archivo | Papel | Puro |
|---|---|---|
| `src/engine/hojaDeRuta.ts` | Decide qué se ve: clase de estado, pasos, puertos caídos, entregable. Exporta `SECCIONES_DE_LA_HOJA`, `MARCA` (✓ ▶ ✗ ·) y `TONO`. | **Sí** — sin React, sin red, sin disco. |
| `src/components/HojaDeRutaViva.tsx` | Pinta los tres bloques. Nada de lógica. | No |
| `src/components/PlanificationPanel.tsx` | El indicador «Ruta», la sonda de planes y el pie («Panel completo»). | No |

---

## 6 · Las vallas que lo blindan

| Suite | Qué frena |
|---|---|
| `tests/hojaDeRuta.test.ts` | Ejecuta el motor puro de verdad: orden de secciones, puerto arriba que no ocupa la hoja, puerto abajo con qué se pierde, pasos desde el primero, entregable que no se ofrece antes de cerrar. |
| `tests/hojaRutaFormatoChat.test.ts` | El inventario salió de la cara y **sigue vivo en el motor**; sólo español; early-return después de los hooks; la suite está declarada en `npm run validar`. |
| `tests/entregableZip.test.ts` | `zip-info` sigue devolviendo los cinco grupos con nombre y peso (lo pinta el panel completo). |

---

## 7 · Licencia para volver a llenarla

Si alguien quiere meter un cuarto bloque en la hoja, primero lo pide. La regla es
literal: **tres cosas, en este orden**. Todo lo demás va al panel completo, que
para eso existe.

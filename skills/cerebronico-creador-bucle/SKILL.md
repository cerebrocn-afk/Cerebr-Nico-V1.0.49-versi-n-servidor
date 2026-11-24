---
name: cerebronico-creador-bucle
description: Cómo dejar la construcción de un sitio en manos del bucle autónomo del motor — plan_de_construccion, forjar_desde_brief y mejorar_hasta_estable, con sus condiciones de parada.
user_invocable: true
---

# El creador dentro del bucle automático

Tres herramientas, tres niveles de automatización. Se elige la más pequeña que
resuelva: no uses `forjar_desde_brief` para cambiar un botón.

| Herramienta | Qué hace | Cuándo |
|---|---|---|
| `plan_de_construccion` | Traduce el brief al contrato del motor: `set_plan({tasks:[{id,description}]})` + guion de llamadas por tarea | Cuando la construcción va a durar varios turnos y hay que poder reanudarla |
| `forjar_desde_brief` | Una pasada: sitio → tema → consentimiento → formulario → PWA → OG → schema → contraste → rendimiento → bucle → informe | Brief completo y objetivo claro |
| `mejorar_hasta_estable` | Auditúa → aplica lo seguro → re-auditúa, hasta agotar lo corregible | Siempre antes de decir "está listo" |

## Cómo se ejecuta el plan en el motor

1. `set_plan` con el objeto `set_plan` que devuelve `plan_de_construccion` **tal
   cual** (mismos ids `t1…t7`: son los que usa el checkpoint del bucle).
2. Por tarea: `update_task(t, "in_progress")` → ejecutar su tramo del `guion` →
   `update_task(t, "completed")`.
3. **`t7` no se cierra con veredicto `no publicable`.** Ahí el bucle para y devuelve
   la palabra al humano.

## Las cuatro paradas de `mejorar_hasta_estable`

| `parada` | Significa | Qué hacer |
|---|---|---|
| `objetivo_alcanzado` | 0 errores (y 0 marcadores si se pidió) | Revisar con lector de pantalla y Lighthouse |
| `sin_progreso` | dos pasadas producen el mismo hash: iterar es mover aire | Lo que queda exige criterio humano; está en `requiere_decision_humana` |
| `max_iteraciones` | se acabó el presupuesto (`CN_CREADOR_MAX_ITER`, tope 8) | Subir el techo solo si la traza aún muestra avance |
| `nada_que_corregir` | desde el principio no había arreglo seguro | No hay bucle que hacer: es trabajo de contenido |

## Lo que el bucle **no** va a resolver por ti

- `[Personaliza este texto]`: es contenido del negocio. Nadie lo escribe mejor que el
  dueño del sitio.
- Anclas rotas y archivos referenciados que no existen: o se crean o se quita el
  enlace.
- Contraste de texto sobre imagen, y cualquier cosa que dependa del render real.
- El envío del formulario: `formulario_destino` pone el destino, no el backend.

## Reglas de seguridad que ya trae

- Escribe solo dentro de `.creador/` (o `CN_CREADOR_ROOT`); un `nombre` con rutas se
  rechaza, no se sanitiza.
- Cada escritura deja snapshot en `.creador/historial/`; nada destructivo sin
  `sobrescribir` / `reemplazar` / `aplicar`.
- Nunca levanta servidores ni puertos: `previsualizar_sitio` solo dice cómo.

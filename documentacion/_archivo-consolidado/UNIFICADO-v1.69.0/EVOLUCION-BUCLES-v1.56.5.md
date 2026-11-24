# EVOLUCIÓN DEL BUCLE AUTÓNOMO — v1.56.5

> "Más contexto" + "perfeccionar los bucles". Esta nota explica QUÉ cambió en
> el motor autónomo, POR QUÉ, y cómo queda listo para el siguiente round.

## 1. Punto de partida (verificación de cableado)

Antes de tocar nada se corrió `scripts/verificar-cableado.mjs` y coincidió con
el baseline del proyecto (5 CABLEADO / 12 HUÉRFANO / 2 INDIRECTO). Es decir: el
proyecto estaba correcto y enganchado. Sobre esa base sólida se construye la
evolución, sin romper lo que ya funcionaba.

## 2. El problema de raíz

El re-empuje del turno (lo que el bucle le dice al modelo para que siga
trabajando en vez de frenar) le ordenaba "ACCIÓN AHORA" pero **no le recordaba
dónde estaba parado**:

- No sabía por qué paso iba ni cuántos le quedaban.
- No sabía qué herramientas ya había usado — así que volvía a leer lo mismo.
- No distinguía "llevo rato solo mirando" de "ya produje obra".

Resultado: turnos que daban vueltas, repetían lecturas y volvían a pedir lo que
ya tenían en contexto.

## 3. La solución — tres funciones puras

Todo vive en `src/engine/bucleAutonomo.ts` (el monolito `server.ts` NO creció):

| Función | Qué hace |
|---|---|
| `construirContextoProgreso(señal)` | Deriva el estado real del turno: paso/techo/restantes, plan cerrado, herramientas usadas y fallidas, y si **solo observó** (nada mutó el proyecto). Puro, sin efectos. |
| `resumenDeProgreso(ctx)` | Traduce ese estado a una línea `CONTEXTO DEL TURNO: …` que viaja dentro del re-empuje. Vacía si no hay nada que informar. |
| `señalDeEstancamiento(ctx, fase)` | Si lleva varios pasos (umbral = 3) solo leyendo sin producir obra, empuja a PRODUCIR en el próximo paso. No aplica a reparación. |

`directivaDeContinuacion` recibe un 5º parámetro opcional `contexto=""` e inserta
la línea **antes** de la fase del turno. El juez del bucle (`decidirBucle`) arma
el contexto una sola vez y lo pasa en las ramas de fallo y de parada.

## 4. Por qué es seguro (cero regresión)

- El 5º parámetro es puramente aditivo: `directivaDeContinuacion([], null)` sin
  contexto es **byte-idéntica** a la de v1.56.4. Hay un test que lo fija.
- El mensaje de estancamiento a propósito **no nombra los peldaños** de la
  escalera de reparación: no es un fallo, es un empujón a dejar de mirar y
  empezar a construir.
- Topes con justificación escrita en el código (umbral de estancamiento = 3).

## 5. Pruebas

Sección 11 añadida a `tests/bucleAutonomo.test.ts` (suite ya registrada en
`scripts/validar.mjs`): deriva de progreso, resumen, estancamiento en sus casos
de disparo y de silencio, señal vacía que no explota, y la regresión clave
"sin contexto === con contexto vacío". Sin pruebas huérfanas.

## 6. Validación pendiente en tu máquina (Windows, Node 20)

El entorno de generación solo tiene Node 16 sin dependencias, así que la suite
TS real no corre acá. En tu equipo:

```bat
npm run build
npm test
```

Meta: 0 errores de TypeScript antes de empaquetar.

## 7. Próximos pasos sugeridos

- Afinar el umbral de estancamiento según tus turnos reales (hoy = 3 pasos).
- Incluir en el contexto una pista del último error textual cuando haya fallos
  abiertos, para que el modelo cambie de método más rápido.

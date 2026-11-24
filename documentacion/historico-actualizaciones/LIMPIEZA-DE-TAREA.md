# LIMPIEZA-DE-TAREA.md — la conducta de limpiar después del trabajo

> **Origen:** pedido de Mario, 04/11/2026, textual: *«esa conducta de limpiar luego
> de la tarea va para md. al igual que todo este proceso, automejora»*.
>
> **Módulo que la ejecuta:** `src/engine/limpiezaTarea.ts` (criterio puro).
> **Suite que la prueba:** `tests/limpiezaTarea.test.ts` — **55 correctas · 0 fallidas**.
> **Estado:** verificada por ejecución el 04/11/2026, no «revisada de cabeza».

---

## 1. El hecho que la originó (no es teoría)

En la sesión del 04/11/2026 el agente fue a mirar dos ZIP en `Downloads` para
aplicar el parche de la v2.3.9. Para hacerlo dejó **ocho scripts suyos y una
carpeta con 18 archivos extraídos**:

```
_aplicar_parche.cjs   _estado_actual.cjs   _listar_parche.cjs
_listar_parche.ps1    _ls.cjs              _verif_parche.cjs
_verif_suites.cjs     _mv.cjs              _parche_tmp/ (18 archivos)
```

Y en `app/` dejó además:

```
_build_bg.cjs  _chk_build.cjs  _chk_interruptor.cjs  _espera.cjs  _l2.cjs
_leer_validar.cjs  _leer2.py  _limpiar2.py  _esperar_veredicto.py
_veredicto.py  _verif_horma/  __pycache__/  validar_out.txt
```

**Consecuencia medible:** la suite `peluza` —que barre la raíz buscando basura—
se puso **ROJA**. El fallo no era del código: era del agente. El usuario lo
detectó antes que el agente: *«solo por ir a ver los archivos dejaste basura»*.

Eso es exactamente lo que esta conducta existe para que no vuelva a pasar.

---

## 2. Las tres reglas, en orden de fuerza

### Regla 1 — NO DEJAR

El temporal se crea **dentro del proyecto**, en `.tmp-tarea/`. Nunca en
`Downloads`, `Desktop`, `Documents` ni la raíz del disco.

Si hay que leer un ZIP ajeno, **se lee desde su ruta sin extraerlo a otro sitio**.
Extraer 18 archivos a una carpeta nueva para copiarlos después es trabajo
duplicado y basura garantizada.

```ts
rutaDeTrabajoPermitida("Downloads/_parche_tmp/x.cjs")  // → { ok: false }
rutaDeTrabajoPermitida(".tmp-tarea/leer.cjs")          // → { ok: true }
```

### Regla 2 — BORRAR AL CERRAR

Todo lo que el agente creó para trabajar **se borra al terminar la tarea, ANTES
de decir «listo»**. Un temporal vivo es una tarea sin cerrar.

La convención que lo hace posible: **todo temporal propio empieza por guion bajo**
(`_algo.cjs`) o vive en una carpeta de trabajo conocida (`.tmp-tarea/`,
`_parche_tmp/`, `__pycache__/`). No es estética: es lo que permite distinguir
«esto lo dejé yo» de «esto es del usuario» sin adivinar por fecha.

### Regla 3 — RESPALDO NO ES BASURA

Lo que el usuario pidió conservar **no se borra solo**. Un respaldo previo a un
parche (`_respaldo-pre-2.3.9-…`) empieza por guion bajo, pero **no es temporal**:
es el estado anterior de algo que el usuario pidió cambiar.

Se **nombra** en el informe y se deja que el usuario decida. Borrar el respaldo
del usuario sería el error inverso y peor que dejar basura.

---

## 3. La clasificación, con el orden que importa

`clasificarRuta()` evalúa en este orden. **El orden es la regla**: si se
invirtiera, un `.env` con guion bajo se borraría «por limpieza».

| Orden | Categoría | Destino | Ejemplo |
|---|---|---|---|
| 1 | Secreto o artefacto | `prohibido` | `.env`, `id_rsa`, `node_modules/`, `dist/` |
| 2 | Respaldo o papelera | `conservar` | `_respaldo-pre-2.3.9-…`, `.cerebro-papelera/` |
| 3 | Temporal propio | `borrar` | `_verif_suites.cjs`, `.tmp-tarea/`, `validar_out.txt` |
| 4 | Cualquier otra cosa | `preguntar` | `CerebroNico-IDE-v2.3.9.zip`, `notas.txt` |

**La cuarta fila es la más importante:** lo que no se reconoce **se pregunta**,
nunca se borra por descarte. Si no lo creó el agente, no lo borra el agente.

---

## 4. El barrido de cierre

`barrerAlCerrar(rutasCreadas)` devuelve el plan y una frase para el chat:

```ts
barrerAlCerrar(["_verif_suites.cjs", "_respaldo-pre-2.3.9-…"])
// → {
//     borrar: ["_verif_suites.cjs"],
//     conservar: ["_respaldo-pre-2.3.9-…"],
//     preguntar: [], prohibido: [],
//     limpio: false,   // ← quedan pendientes de borrar
//     informe: "1 temporal(es) borrado(s) · 1 respaldo(s) conservado(s): …"
//   }
```

**`limpio` es la condición que se exige ANTES de decir «listo».** Es `true` sólo
cuando no queda nada por borrar ni por preguntar. Un turno que deja un temporal
**no está cerrado**, aunque el código funcione.

---

## 5. Lo que este módulo NO hace

**No borra nada.** Es criterio puro: clasifica y dice qué hacer. La ejecución
sigue en `fs_delete` / `delete_file`, que ya existen y ya mandan a papelera
(recuperable). Igual que `automejora.ts`: **criterio acá, manos allá**.

Esto es deliberado: un módulo que clasifica se puede probar sin riesgo de que una
prueba le borre archivos al usuario.

---

## 6. Cómo se comprueba

```bash
npx tsx tests/limpiezaTarea.test.ts
```

Salida esperada: `55 correctas · 0 fallidas`, código de salida 0.

La suite prueba **los 19 archivos reales** que el agente dejó el 04/11, no
ejemplos inventados. Si la conducta se rompe, la suite lo canta con el nombre del
archivo que falló.

---

## 7. Relación con `automejora.ts`

Son dos módulos distintos y complementarios:

| Módulo | Responde |
|---|---|
| `automejora.ts` | ¿**qué** puede hacer el lazo solo, y con qué confirmación? |
| `limpiezaTarea.ts` | ¿**qué deja atrás** cuando termina, y qué hace con eso? |

`automejora.ts` ya tenía el riesgo 2 («alucinaciones de arquitectura») y el
presupuesto de parche. Le faltaba el cierre: **un lazo que se mejora pero deja
basura no está mejorando, está acumulando deuda**. Este módulo cierra ese hueco.

---

## 8. Registro de la lección

Añadida a `memoria.md` §3 (Lecciones aprendidas):

> **[limpieza]** Ir a mirar archivos ajenos dejó 8 scripts y una carpeta de 18
> archivos en `Downloads`, y 13 más en `app/`. La suite `peluza` se puso roja con
> razón. Regla: el temporal va a `.tmp-tarea/` dentro del proyecto, se borra
> antes de decir «listo», y el respaldo del usuario se conserva y se nombra.
> Módulo: `src/engine/limpiezaTarea.ts` · Suite: `tests/limpiezaTarea.test.ts`.

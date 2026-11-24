# FASE 7 · CIERRE — el sandbox con su propio cerebro (v1.86.0)

> Complementa a [FASE7-DISENO-SANDBOX-CON-CEREBRO.md](FASE7-DISENO-SANDBOX-CON-CEREBRO.md),
> que era **diseño** y lo decía (la casa no permite llamar «hecho» a un plan). Este
> documento cuenta lo que quedó ejecutado sobre el código de v1.84.6 y con qué
> evidencia.

## Estado de partida (verificado, no recordado)

En v1.84.6 no existía **ninguna** de las tres piezas: cero resultados para «por qué
decidiste», ningún `/api/conciencia` orientado a la app generada, ningún manifiesto de
espejo. El diseño ancló cada punto a código real ya existente; acá se pagó.

Dependencias: FASE 2 (órgano con `rutaCerebro`/`aprender`/`enrutar`/`enrutarHibrido`) y
FASE 5 (entrega autoverificada) estaban hechas; FASE 6.2 (la traza que citar) se hizo en
v1.85.0 y **desbloqueó** el punto 3.

## Punto 1 · `/api/conciencia` para la app generada — **HECHO**

Piezas: `src/engine/concienciaSandbox.ts` + `server/routers/concienciaSandbox.ts`
(`GET/POST /api/conciencia`, `GET/POST /api/conciencia/manifiesto`).

Respeta el diseño y agrega una quinta guarda que el diseño no preveía:

| Guarda | Qué rechaza |
|---|---|
| raíz absoluta | sin camino absoluto no se puede auditar el encierro |
| dentro del workspace | raíz **fuera** del árbol del sandbox |
| no ancestro de la IDE | raíz que **contiene** a la propia IDE (tocaría archivos del usuario) |
| **no igual a la raíz de datos** | raíz que **coincide** con `PROJECT_ROOT`: ahí el `cerebro/` de la app sería **la misma carpeta** que la memoria del motor |
| rutas sanas por segmento | `..`, absolutos, backslashes, unidad de Windows en `tema`/`titulo` |

Y **fail-closed**: si no llega la referencia de workspace, no abre.

El órgano es el mismo módulo con otra raíz — cero lógica copiada, así que cuando el
órgano vectoriza (FASE 2) la app generada hereda el vector sin cable nuevo.

Comportamiento honesto medido:
- órgano vacío → `ultima: null` con aviso («todavía no recordó nada»), **no** una memoria fingida;
- consulta sin parecido → vacío **con aviso**, no «lo más cercano por las dudas»;
- texto fuera de presupuesto → se recorta **y se avisa** el recorte.

## Punto 2 · Espejo de espejo auditable — **HECHO**

Pieza: `src/engine/manifiestoEspejo.ts`. **9 campos declarados** (`objetivo`, `pasos`,
`resumen`, `modelo`, `proveedor`, `pcMode`, `red`, `tareaPesada`, `fiscal`) con
frecuencia y `max_chars` propios, bajo el techo de **900 tokens** que ya usaba
`buildConcienciaTiempoReal` (`conciencia.ts:128`) — no se inventó otro número.

Lo que **no cruza**, declarado con motivo (`LO_QUE_NO_CRUZA`):
- `retratoProyecto` — es el árbol del usuario (rutas y nombres de sus archivos);
- `ultimoError` — un error real cita rutas absolutas y a veces trozos de la respuesta del proveedor.

Que el espejo sea declarado y no tunel se comprueba **atacando**: la suite mete en la
instantánea una `clave_api` plantada además de los dos campos anteriores, y exige que
en el payload filtrado no aparezcan ni el usuario ni la clave. El filtro es
estructural (`filtrarInstantaneaPorManifiesto`), no una advertencia en un README.

La auditoría del propio manifiesto (`auditarManifiestoEspejo`) cae contra un campo
fantasma, un campo sin motivo, uno sin frecuencia o una suma de presupuestos que pase
el techo. La cara a disco sigue el molde de `espejos_servidor/`: `MANIFIESTO_ESPEJO.json`
en el `cerebro/` del sandbox, **regenerado**, no editado a mano; si no se puede
escribir, se declara el motivo.

## Punto 3 · Modo «¿por qué decidiste esto?» — **HECHO**

Pieza: `src/engine/explicarDecision.ts` + `GET /api/explicar?pasoId=N`.

La respuesta es la **traza del ciclo (FASE 6.2) re-leída**, con dos clases de fuente:
- **regla** — la línea del `.ts` donde vive el criterio (`cerebroReflejo.ts`,
  `votacionConsejo.ts`, `reflejo/consejo.ts`);
- **órgano** — la entrada de memoria que pesó, citada en `cerebro/temas/*.md` con su
  línea real: FASE 2 citada dentro de la explicación de FASE 6.

El contrato del plano («la respuesta «¿por qué?» siempre cita artefacto real») está
expuesto como función auditable, `auditarCitas`, y la suite lo prueba **por las dos
direcciones**:

- verde con fuentes sanas (cada `{archivo, linea}` resuelve releyendo el disco; el
  texto citado es el de esa línea);
- rojo sembrado: una cita a `src/engine/no-existe.ts:42`, una línea `9.999.999` y una
  cita sin ruta → **la auditoría falla nombrándolas**. Un contrato que no puede fallar
  no es un contrato.

Además: `pasoId` acepta id, número o `#N`; un paso inexistente **no se explica** (dice
por qué y lista los que sí existen); tras reiniciar, la explicación sale del JSONL; si
el archivo del órgano se borró, la cita **se baja** y la falta queda declarada en
`sinFuente`; y sin árbol de fuente (paquete sin código fuente) la respuesta **se niega**
antes que citar de memoria.

## Evidencia del plano, casilla por casilla

| Evidencia que pedía FASE 7 | Estado |
|---|---|
| «una app generada mínima que recuerda (demo reproducible con comando)» | **PARCIAL** — el recuerdo está probado sobre disco real (escribe → `cerebro/indice.json` en el sandbox → releé → enruta) con `npx tsx tests/concienciaSandbox.test.ts`, pero la app servida en el preview todavía no llama el endpoint desde su propio origen. Deuda declarada en §6 del plano como **FASE 7.1b** |
| «el manifiesto del espejo, auditado» | **HECHO** — `auditarManifiestoEspejo` + el ataque de la clave plantada |
| «la respuesta «¿por qué?» siempre cita artefacto real (test: ninguna cita sin ruta)» | **HECHO** — `auditarCitas` con plaga sembrada que rompe |

## Números del turno

- Suites nuevas: `concienciaSandbox` (61) + `explicarDecision` (34) = **95 comprobaciones**.
- `server.ts`: **12.178 líneas** ≤ presupuesto 12.187 (declarado contra el trinquete V8 §8.1).
- Rutas HTTP: **175** tras `node scripts/superficie.mjs`.
- `npx tsc --noEmit`: verde.

## Cómo probarlo a mano (reproducible)

```bash
# 1) El ciclo deja traza
curl -s -X POST localhost:3000/api/consejo/decidir -H 'content-type: application/json' \
     -d '{"frase":"convierte esto a yaml","datos":{"texto":"a: 1"}}'
# 2) La hoja muestra las trazas
curl -s localhost:3000/api/consejo/trazas?max=5
# 3) «¿Por qué decidiste esto?» — cita archivo:línea o declara sinFuente
curl -s 'localhost:3000/api/explicar?pasoId=1'
# 4) La app generada recuerda (con un proyecto activo en el sandbox)
curl -s -X POST localhost:3000/api/conciencia -H 'content-type: application/json' \
     -d '{"tipo":"estado","titulo":"player","texto":"pausado en 00:12"}'
curl -s 'localhost:3000/api/conciencia?consulta=estado%20del%20player'
# 5) Qué deja ver el IDE y qué corta
curl -s localhost:3000/api/conciencia/manifiesto
```

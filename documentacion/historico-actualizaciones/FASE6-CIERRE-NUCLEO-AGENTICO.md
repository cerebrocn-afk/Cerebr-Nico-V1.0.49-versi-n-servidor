# FASE 6 · CIERRE del núcleo agéntico fusionado (v1.85.0)

> Este documento **cierra** lo que [FASE6-INVENTARIO-51-ENTIDADES.md](FASE6-INVENTARIO-51-ENTIDADES.md)
> dejó abierto: ahí se verificó el punto 1 (parcial) y se declararon pendientes los
> puntos 2, 3 y 4. Acá están los tres, con la evidencia de ejecución que la regla de
> la casa (V8 §3.2) exige para decir «hecho».

## 0 · La corrección de cifra, ahora también en el plano

`HOJA_DE_RUTA_PERFECCION.md` decía «50 entidades (12 + 38)». El código dice **51**
(12 especialistas + 28 herramientas curadas + 11 espejos) desde que V8 sumó
`espejo.generalista`. Al cerrar la fase, el plano se corrigió a sí mismo: la fila de
deuda §6 ahora lee *«~~Las 50 entidades…~~ — son 51 (12+28+11, el plano arrastraba la
cifra pre-V8)»*.

Baten las tres fuentes: `ENTIDADES.length === 51`, `tests/agentico.test.ts:34`,
`estadoConsejo().total === 51` con `activas === 21` y `dormidas === 18`.

## 1 · Inventario auditado — **HECHO** (y encontró lo que el inventario no podía ver)

Comando de la evidencia:

```bash
npx tsx tests/inventarioEntidades.test.ts --mapa   # imprime el mapa 1:1
node scripts/validar.mjs                            # suite `inventarioEntidades` (53)
```

**Medida nueva, no declarada:** cruzando los 51 ids contra las **210 suites
registradas en el ritual** (no contra «a ver si aparece en algún archivo»), **doce
entidades no tenían ni una prueba que las nombrara**:

`texto.acentos` · `texto.mayus` · `texto.ordenar` · `texto.dif` · `datos.json-llaves` ·
`datos.csv-columnas` · `mate.porcentaje` · `mate.minmax` · `vis.hex2rgb` · `vis.rgb2hex` ·
`proyecto.stats` · `memorista.registrar`

Era el agujero que el inventario anterior señalaba como «cobertura por archivo, no
abierta línea por línea». Hoy cada una se **ejecuta** con valores reales contra un
resultado esperado escrito a mano, más su puerta de error con motivo. Resultado del
mapeo: **51/51 cubiertas, 145 aristas entidad↔suite**.

### Defecto cazado por auditar (no por leer)

`Number("")` es `0`. Así que `mate.promedio` sin números devolvía **«0»** y
`mate.minmax` devolvía `min=0 max=0 rango=0`: la calculadora inventaba un resultado.
Se filtra el vacío **antes** de convertir (helper `aNumeros` en
`src/engine/reflejo/consejo.ts`) y el motivo vuelve a ser la única salida.
`tests/agentico.test.ts` sigue verde: la cura no tocó lo que andaba.

Mapa completo (generado, no transcrito): ver `docs/FASE6-MAPA-ENTIDAD-SUITE.md` o el
comando de arriba.

## 2 · El ciclo de decisión con trazas — **HECHO**

Piezas: `src/engine/citaFuente.ts` (léeme el disco, no me fíes la línea) y
`src/engine/cicloDecision.ts`.

Las **7 etapas** del ciclo (V8 §6.2): `entrada → clasificación → voto → entidad →
órgano → ejecución → resultado`. Cada etapa trae `fuente = {archivo, linea, texto}`
resuelta **contra el disco en el momento**; si el patrón ya no está, `fuente: null` +
`aviso` que dice qué cambió. Nunca una línea supuesta.

Dónde vive la traza: anillo de 200 en memoria **y** `<raizDatos>/cerebro/trazas/decisiones.jsonl`
— junto al índice del órgano, porque la traza es memoria del motor, no log de depuración.
Sobrevive al reinicio (`cargarTrazas`) y nunca tumba un turno si el disco falla: lo declara.

Cobertura de comportamiento:
- herramienta **dormida** → traza con el motivo que ya devolvía `ejecutarEntidad` (incluido el botón exacto);
- frase **sin dueño declarado** (`traducir`) → `porVoto: false` con la razón del reparto, no un «no se enteró nadie»;
- frase vacía → traza completa que dice que llegó vacía;
- el **órgano (FASE 2) entra en cada decisión** como pizarra: lo que el motor ya sabía antes de decidir.

Cara visible: `GET /api/consejo/trazas` + bloque **«Ciclo de decisión»** en *Hoja de
Ruta Activa* (`PlanificationPanel.tsx`), `read-only` y plegado por defecto — la regla
de superficie V8 §7.2 dice que en esta fase no nace ningún botón.

Evidencia: `npx tsx tests/cicloDecision.test.ts` → **41 correctas · 0 fallidas**.

## 3 · Multiagente con relevo compartido — **HECHO**

Pieza: `src/engine/multiagenteRelevo.ts`. Importa el criterio de v1.80.0
(`decisionRelevoFavoritos` / `decisionRelevoPorFallo` / `informeHonestoRelevo`), **no lo copia**.

Lo que se romperia sin esto, medido: cada llamante con su propio `EstadoRelevo`
convierte el tope de 2 en **2 por agente**. Tres especialistas = seis llamadas a la
nube con la cuota de Mario, y ninguna sesión sabe que la otra ya quemó ese modelo.

Propiedades congeladas por la suite:
- **UN** `EstadoRelevo` por equipo (tope, `probados` e intentos son del equipo);
- la cascada prueba el siguiente favorito cuando el primero cae (2 relevos, no 1);
- el favorito que falló **no lo reintenta otro especialista**; la voz que respondió
  bien **no queda quemada** (no se castiga el acierto);
- agotado el tope llega el **informe honesto** nombrando a quién se llamó, y no se
  vuelve a llamar a nadie (cero bucle);
- con `auto_relay` apagado no releva ni una vez — el usuario manda;
- sesiones **reales**: estado, turnos, cierre (y una tarea sin sesión libre se declara, no se pierde);
- la memoria común es el **órgano de FASE 2** en disco, no un array del router.

Evidencia: `npx tsx tests/multiagenteRelevo.test.ts` → **41 correctas · 0 fallidas**.
Cara HTTP: `POST /api/multiagente/equipo` (voces reales por `llamarVoces`, el mismo
lazo del enjambre ecléctico) y `GET /api/multiagente/estado`.

## 4 · Forja con aduana — **HECHO**

Pieza: `src/engine/aduanaForja.ts`, cableada en **dos** puntos:
`src/engine/reflejo/cargadorEspejos.ts` y `POST /api/espejos/instalar` en `server.ts`.

**La lección del cable:** la aduana corre **antes** del `import()`. En v1.84.6 el
cargador validaba el manifest, hacía `import()` y *después* miraba; auditar después de
importar es auditar un espejo que **ya corrió** dentro del motor.

Cuatro puertas:
1. **identidad**: `espejo.<slug>` y único contra las 51 curadas **y** contra el pool;
   se rechaza también el *nombre legible* duplicado (dos nombres para lo mismo es la
   plaga que V8 §7.1 corta);
2. **proveedor/modelo**: solo los que existen, y el rol lo decide
   `aduanaModelos.clasificarModeloOllama` **importado** — un embedder no se hace pasar
   por voz de chat;
3. **aislamiento**: `child_process`, `eval`/`new Function`, `fs`, red cruda, `fetch`,
   `process.env`, `import()` dinámico → rechazo **citando el fragmento detectado**;
4. **contrato de forma**: `ejecutar` exportado; `motivo` en el `ok:false` se avisa.

Lo determinista-ruidoso (`Math.random`, la hora, `async`) **entra con aviso declarado**,
no se bloquea: la aduana distingue peligro de ruido.

Evidencia de cable, no de función suelta: en un directorio con un espejo legítimo, uno
con id de entidad curada y uno que importa `child_process`, **el cargador real monta uno
solo** y los otros dos quedan en `fallidos` con motivo.
`npx tsx tests/aduanaForja.test.ts` → **50 correctas · 0 fallidas**.

## 5 · Balance de la fase

| Punto del plano | Estado | Prueba |
|---|---|---|
| 1 Inventario auditado (51, contrato, ≥1 test) | **HECHO** (era parcial: 12 sin prueba) | `inventarioEntidades` (53) |
| 2 Ciclo de decisión con trazas visibles | **HECHO** (no existía) | `cicloDecision` (41) |
| 3 Multiagente con relevo compartido | **HECHO** (no existía) | `multiagenteRelevo` (41) |
| 4 Forja con aduana | **HECHO** (no existía) | `aduanaForja` (50) |

**185 comprobaciones nuevas**, todas registradas en el ritual (`censoSuites` no
encuentra huérfanas). Dependencias usadas, no duplicadas: FASE 1 (relevo) y FASE 2
(órgano) siguen siendo la única fuente de su criterio.

Con esto **queda abierta la carretera a FASE 7**: el punto 3 de esa fase estaba
bloqueado por el punto 2 de esta (la traza que citar), y en v1.86.0 se pagó.

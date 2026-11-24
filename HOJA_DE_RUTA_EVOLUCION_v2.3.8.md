# HOJA DE RUTA DE EVOLUCIÓN — CerebroNico IDE v2.3.8

> Documento de planificación. Todo lo que sigue está **verificado contra el disco**
> el 06/11/2026, no deducido del historial. Donde no pude verificar, lo declaro.
> Plano previo vigente: `HOJA_DE_RUTA_PERFECCION.md` (F0–F9). Este documento **no
> lo reemplaza**: lo ordena por riesgo y por retorno, y añade lo que la auditoría
> de DeepSeek Harness aportó.

---

## 0 · Punto de partida real (medido, no heredado)

| Dato | Valor verificado | Fuente |
|---|---|---|
| Versión instalada | **v2.3.8** <!-- deriva:historico: instantánea firmada «verificado contra el disco el 06/11/2026». No es una promesa vigente: el verificador de deriva (FASE 11) la exime PORQUE EL ARCHIVO LO DECLARA, no porque nadie lo recuerde. La versión viva se lee en `src/constants.ts`. --> | `app/MANIFIESTO_SHA256_v2.3.8`… (`CerebroNico-IDE-v2.3.8-MANIFIESTO.txt`) |
| Fase de perfección | F0–F7 cerradas | `HOJA_DE_RUTA_PERFECCION.md`, `perfeccion.json` |
| Procesos con evidencia | **9 procesos verdes** | `perfeccion.json` (proc-1 … proc-9) |
| F8 (perfil de parches) | **especificada, NO implementada** | `_f8f9.md` existe; `src/engine/perfilParches.ts` NO existe |
| F9 (telemetría de contexto) | **especificada, NO implementada** | `_f8f9.md` existe; `src/engine/contextoMedido.ts` NO existe |
| Skills instaladas | **229** (no 140) | `findstr /s` sobre `.agents/.zcode/skills` |
| Skills con frontmatter roto | **20** (13 `description: #`, 7 `description: ---`) | escaneo del turno |
| De esas, reparadas | 4 (`skillcreator`, `autonomia`, `capasidad`, `creator`) | verificado por `findstr /n` |
| De esas, pendientes | **16** | excluidas `zai` y `arquitectura` (fusión con otra skill) |
| Claves en claro | **4**: `GOOGLE_API_KEY`, `ZAI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` | `.dsh/.credentials.yaml`, leído en el hilo |
| Bóveda `C:\CN` | **fuera de las raíces del puente** | `pc_list_dir` → «Acceso denegado: fuera de las raíces permitidas» |

**Corrección de premisa importante:** trabajé varios turnos declarando v1.51.0. La
versión instalada es **v2.3.8**. Todo plan que asuma cifras v1.x (32 herramientas,
`LIMITE_CONTEXTO_CARACTERES = 6000`, semilla de 116) debe revalidarse antes de
usarse como contrato de salida.

---

## 1 · Lo que la auditoría de `dsh` dejó (y qué NO se copia)

Todo lo aprovechable ya está extraído de texto plano. El `.7z` es **asunto
cerrado**: los tres volúmenes no existen en disco, `7z` no está instalado, y la
app está descomprimida en `AppData\Local\Programs\DeepSeek Harness`. Nada más que
leer ahí.

### Se adopta
1. **Base vacía + capas de parche por `id`** (`cordis.yml` = `[]`, luego bundles,
   luego `cordis.patch.yml`). El usuario configura sin editar la semilla.
2. **Presets `sandbox × approval` desacoplados.** Son dos ejes, no uno:
   «leer todo» ≠ «escribir sin preguntar» ≠ «ejecutar sin preguntar».
3. **Row-versioning `{ver, seq, val}`** por campo en la sesión. Dos procesos
   (IDE y puente) sin pisarse; reanudable en cualquier `seq`.
4. **Desglose de contexto por categoría** (`system` / `tools` / `message`) y
   separación `ttftMs` / `decodeMs`.
5. **Skill de ruteo = índice de 14 líneas**, no manual. Divulgación progresiva de
   tres capas explícitas, con «cuándo NO bajar de nivel».
6. **Límite pegado a la instrucción que lo puede violar**, no en un capítulo
   aparte.
7. **`AGENTS.md` como fuente de verdad que el skill respeta** por encima de sí mismo.

### NO se copia
- `maxParallelToolCalls: 20` con `danger-full-access` (lanzador de errores).
- El `runtime` empaquetado de 280 MB con Node + pnpm (Python embebido ya cubre eso).
- `load_workspace_dependencies` (instala paquetes bajo demanda = superficie de ataque).
- Skills `godmode`, `obliteratus`, `osint-investigation`, `web-pentest`, `sherlock`,
  `dogfood`, `unbroker`: vigilancia y evasión, no productividad. En un agente con
  escritura y ejecución, degradan el sistema.
- Nombres `cordis` / `ralph` y todo lo atado a `@deepseek-ai/*`: idiosincrasia suya.

---

## 2 · FASES DE EVOLUCIÓN (ordenadas por riesgo, luego por retorno)

### FASE 10 · NEUTRALIZAR CREDENCIALES EN CLARO — **URGENTE, va primero**

**Por qué antes que nada:** hay 4 API keys legibles en
`C:\Users\BirdBox\.dsh\.credentials.yaml`, y desde que las vi se instaló y estuvo
accesible un segundo agente que corre con `danger-full-access` + `approval: never`.
No es hipótesis: es una credencial que ya viajó más sitios de los que controlás.

**Alcance:**
1. Rotar las cuatro claves en sus paneles (Google AI, Z.AI, Mistral, OpenRouter).
2. Guardarlas en la bóveda cifrada, **no** en un YAML plano.
3. Neutralizar el `browser-session` secret de `dsh` (token vivo: cambia de sesión).
4. Dejar `C:\CN` dentro de las raíces autorizadas del puente **o** declarar el
   procedimiento manual, para no volver a tener la bóveda inalcanzable.

**Requisito que hoy falla:** `pc_list_dir C:\CN` devuelve *fuera de las raíces
permitidas*. Sin resolver eso, el punto 2 no lo puede hacer el agente.

**Evidencia de cierre:** las cuatro claves rotadas (confirmación del panel), el
archivo plano sin claves válidas, y una lectura de la bóveda que devuelva 200.
**Reversibilidad:** ninguna una vez rotadas — es a propósito.
**Decisión humana obligatoria.** Este paso lo inicia Mario; el agente no rota claves
de terceros por su cuenta.

---

### FASE 11 · VERDAD DEL ESTADO (matar la deriva documental) — sin dependencias

**Problema medido:** memoria dice v1.51.0, disco dice v2.3.8. El documento de F8/F9
fija contratos sobre cifras v1.x. Cualquier implementación hecha sobre esa base
nace torcida. Esto es deuda de credibilidad, y la credibilidad es la propiedad que
más se rompe en silencio.

**Alcance:**
1. **Un solo origen de versión:** `VERSION_SEMVER` en `constants.ts` como semilla
   única; `package.json`, `index.html`, manifiestos y `joint` leen de ahí.
2. **Verificador de deriva:** script que compara la versión de disco con lo que
   declaran `memoria.md`, `CHANGELOG.md`, `HOJA_DE_RUTA_*.md` y `perfeccion.json`.
   Falla si hay contradicción. Se suma a `npm run validar`.
3. **Revalidar los contratos heredados** que este hilo citó de memoria y que
   pueden haber cambiado entre v1.5x → v2.3.8: número de herramientas, límite de
   contexto, ids de la semilla, techo de líneas.

**Evidencia de cierre:** suite `derivaDocumental.test.ts` verde; un run real donde
injectar una versión falsa en `memoria.md` haga fallar el verificador.
**Reversibilidad:** total (es un test + un `.json` de versión).
**Coste:** bajo. **Retorno:** alto. Va segunda porque sin esto las demás fases se
documentan mal.

---

### FASE 12 · PERFIL DE PARCHES POR `id` (la F8 real)

**Objetivo:** activar/desactivar/reconfigurar un pack del motor deja de ser cirugía
sobre `SEMILLA_COMPLETA` y pasa a ser un archivo de datos del usuario.

**Alcance** (lo de `_f8f9.md`, movido a código, con el alcance revalidado contra v2.3.8):
1. Formato `<raíz de datos>/.cerebronico/perfil.patch.yaml`: lista de
   `{ id, op: sobrescribir|deshabilitar|insertar, datos }`. Sin `id` no se aplica.
2. `src/engine/perfiles/` con `aplicarParches()` **puro**, sin IO: recibe semilla
   cargada y devuelve semilla resultante + acta (sobrescritos, deshabilitados,
   insertados y **huérfanos**: id inexistente se LISTA, no se ignora).
3. Un único punto de cableado, después de los packs y antes de los invariantes.
4. **Interruptor honesto:** sin archivo, comportamiento idéntico al actual. Con
   YAML roto o `op` desconocida → **semilla limpia** + causa en el acta. Nunca
   arranque a medias.
5. Reflejo en `[ESTADO VIVO DEL TURNO]`: «perfil: N parches, M huérfanos».

**Lección que ya me costó un turno:** el idempotente de `deshabilitar` debe
validarse **contra la semilla original**, no contra el conjunto vida; si no, el
segundo `deshabilitar` del mismo `id` se rechaza por «id inexistente» en vez de ser
no-op. Y la aserción de reversión debe comprobar la causa real, no `/REVERTIDO/`.

**Evidencia de cierre:** suite `perfilParches.test.ts` con sobreescribir,
deshabilitar, insertar, huérfano, YAML roto e idempotencia doble. Verde en
`npm run validar`. `server.ts` sin tocar.
**Reversibilidad:** total (borrar el archivo devuelve el motor al estado actual).
**Lo que NO hace:** no habilita código desde un archivo. Un parche configura,
deshabilita o inserta entradas de la MISMA forma. Nunca ejecuta. (Una vía de RCE
encubierta no se diseña ni «por flexibilidad».)

---

### FASE 13 · TELEMETRÍA DE CONTEXTO Y LATENCIA (la F9 real)

**Objetivo:** convertir «va lento» y «el contexto se llena» en números comparables.

**Alcance:**
1. Desglose por categoría (sistema / herramientas / mensajes) con el **mismo
   estimador** que ya usa el motor. Prohibido meter un segundo tokenizer: dos
   medidores son dos verdades.
2. **Presión declarada:** umbrales en `constants.ts` (45 % aviso, 65 % sugerir
   compactar, 80 % forzada) y una línea con el número exacto en el estado vivo.
3. **Latencia desdoblada:** tiempo al primer token vs. tiempo de decodificación,
   más pasos y proveedor. Con eso, «lento» pasa a diagnóstico.
4. **Contrato de honestidad:** si el proveedor no reporta uso, el campo se marca
   **`estimado`** y jamás se presenta como medido.

**Nota de implementación:** el turno anterior escribió `contextoMedido.ts` y su
suite, con 54/54 verde, y detectó un bug real de clasificación: `L5` (conocimiento
general) caía en «sistema» por un regex `/^L[25]\b/` que lo capturaba antes de
llegar a «herramientas». Si ese código sobrevive, arrastra el bug; si no está en
`src/`, se rehace con el bug ya conocido.

**Evidencia de cierre:** invariante aritmético (desglose suma exactamente el
total), verificación cruzada con `espejo.matematicos` sobre los mismos números,
tres umbrales disparando en el token exacto.
**Reversibilidad:** total (se apaga el bloque de estado).
**Lo que NO hace:** no compacta sola. Mide y avisa; compactar es decisión del bucle.

---

### FASE 14 · PRESETS DE PERMISOS EN DOS EJES (`sandbox × approval`)

**Problema:** hoy el permiso es binario. Eso obliga a elegir entre un agente inútil
y una puerta abierta. `dsh` demuestra que `never` sin memoria de lo autorizado es
una puerta abierta — comprobado: su perfil está en `danger-full-access` + `never`.

**Alcance:**
1. Dos ejes independientes: **sándbox** (qué rutas toca) × **aprobación** (si
   pregunta).
2. Tres presets mínimos: `solo-lectura`, `escritura-workspace`, `acceso-total`.
3. **Memoria de autorización por ruta y por herramienta**, con caducidad y acta:
   «autorizaste escribir en `X` el 06/11». Sin memoria, `never` no existe.
4. **Destructivos nunca heredan preset:** borrar, `git reset`, matar procesos y
   sobrescribir grande preguntan **siempre**, sea cual sea el preset.

**Evidencia de cierre:** suite `permisos.test.ts` — preset de escritura no autoriza
ejecución; memoria caducada vuelve a preguntar; destructivo con `acceso-total`
sigue preguntando; ruta fuera de sándbox se rechaza con causa nombrada.
**Reversibilidad:** total (los presets son config; el default sigue siendo el actual).
**Coste:** medio-alto. **Retorno:** alto, y es lo que hace honesto todo lo demás.

---

### FASE 15 · SANEAMIENTO DEL CONJUNTO DE SKILLS

**Problema medido:** 229 skills en carpeta plana, **16 con frontmatter roto aún
pendientes**, duplicados reales (`imagen`/`imagen2`/`apiimagen`;
`apiproxi`/`proxiapi` son el MISMO README chino de CLIProxyAPI, con publicidad y
hashes de afiliado), `neuro skills` con espacio, `run app` con espacio, `-skills .md`
con guion inicial. Un `description: #` comentado deja la descripción VACÍA: esa
skill **nunca dispara**. El conjunto entero se rutea peor por culpa de sus vecinos.

**Alcance, por orden de seguridad:**
1. **Reparar los 16 mecánicos:** `name` == carpeta, `description` no vacía, YAML
   único y cerrado. Sin tocar cuerpos.
2. **No reparar a ciegas `zai` ni `arquitectura`:** su frontmatter hereda la
   descripción de otra skill (`zai` dice «spreadsheet file»; `arquitectura` dice
   «Debug REST/GraphQL APIs»). Repararlos produciría dos fichas que MIENTEN. Se
   separan a mano o se retiran; no se parchean.
3. **Sacar del conjunto activo `apiproxi` / `proxiapi`:** no son skills, son un
   README abierto que además nunca cierra el `---`. Se marcan inactivos con
   frontmatter válido; borrarlos es decisión de Mario (el puente los mueve a
   papelera, recuperables).
4. **Deduplicar por contenido** (no por nombre): `hash` del cuerpo; a igualdad,
   se conserva el de nombre limpio.
5. **Renombrar los que rompen el descubrimiento:** espacios y guion inicial fuera.
6. **Añadir vigilante:** suite que recorre el conjunto y falla si aparece un
   `SKILL.md` con YAML roto, `name` != carpeta o descripción vacía/comentada. Esto
   evita que el defecto vuelva a generarse. Es la parte que más vale de la fase.

**Evidencia de cierre:** vigilante verde sobre las 229; recuento de duplicados
antes/después declarado en el acta; cero carpetas con espacio salvo decisión
explícita.
**Reversibilidad:** alta (papelera + snapshots).

---

### FASE 16 · SKILLS EN TRES CAPAS CON CRITERIO DE USO

**Origen medido:** `office/SKILL.md` de `dsh` — 14 líneas que dicen **qué skill
cargar** según la tarea, y siete skills de formato que llevan el contenido. Bajada
explícita a nivel 2 sólo cuando hace falta mirar el archivo, con una frase que dice
**cuándo NO bajar** («editar datos no exige renderizar sólo porque haya formato
incidental»). Y los límites pegados a la instrucción que los puede violar
(«escribir una fórmula no calcula su resultado»; «`data_only=True` devuelve valores
cacheados que pueden faltar o estar viejos»).

**Aplicado a casa — dos destinos:**

**A. Packs del motor (`conciencia.ts`).** Reestructurar las entradas `bucle-*` y
`coher-*` en tres capas: (i) índice de ruteo delgado con «si es X, carga el pack Y»;
(ii) cuerpo de la entrada; (iii) detalle bajo demanda. Añadir a cada entrada **cuándo
consultarla y cuándo consultarla sería desperdicio**. Reconciliación con
`LIMITE_CONTEXTO_CARACTERES`: revalidar antes (pasó a v2.3.8; no sé hoy su valor).

**B. `AGENTS.md` por proyecto y respeto del skill.** Una entrada del motor que diga
«sigue lo que el proyecto declare en `AGENTS.md` para su entorno y sus librerías».
El skill **cede** ante la declaración del usuario. Es la idea que más fricción real
te quita y ya está verificada como válida en `dsh`.

**Evidencia de cierre:** una entrada `bucle-*` reescrita en tres capas con sus
criterios de uso; lectura de prompt final medida ANTES y DESPUÉS con FASE 13 para
demostrar que el índice reduce superficie; suite que verifica que una entrada del
nivel 1 nunca contiene el cuerpo del nivel 3.
**Reversibilidad:** media (se conservan las entradas originales con id viejo
deshabilitadas por FASE 12).

---

### FASE 17 · SESIÓN RESISTENTE A CORTES (row-versioning)

**Problema:** `.cerebro-db` escribe documento entero. Un corte a mitad (y el puente
corta a los 60 s, lección L15) corrompe. `dsh` guarda `{ver, seq, val}` por campo y
puede reanudar en cualquier `seq`.

**Alcance:** versionado por campo con `seq` monótono; escritura append + compactación;
reanudación desde el último `seq` consistente; acta de lo recuperado. Dos procesos
(IDE y puente :5000) pueden tocar la misma sesión sin pisarse.

**Evidencia de cierre:** test que mata a mitad de escritura y reabre: cero pérdida
de lo anterior y `seq` correcto; dos escritores simultáneos no corrompen.
**Reversibilidad:** media (el formato viejo se lee; se migra una vez).
**Nota:** es la fase con más migration-cost del plan. No se hace antes de FASE 12 y 13
porque sin ellas no hay con qué verificar que la migración conservó todo.

---

### FASE 18 · CERRAR 7.1b (deuda heredada, una sola línea viva)

`perfeccion.json` la nombra: *«queda 7.1b: el preview llamando a `/api/conciencia`
desde su propio server estático»*. Es una costura semicerrada y oscurece el
inventario. Se cierra con el mismo criterio: evidencia + suite, o se retira del
plano declarándolo. No se deja abierta indefinidamente porque «es poquito».

---

## 3 · Orden de ejecución y por qué

```
FASE 10 (claves) ──► FASE 11 (verdad) ──► FASE 12 ──► FASE 13
                                              │            │
                                              └──► FASE 16 ◄┘
                     FASE 14 (permisos) ──► FASE 17 (sesión)
                     FASE 15 (skills)   ──► FASE 18 (7.1b)
```

- **10 primero**, sin discusión: es la única con riesgo activo y ajeno a la app.
- **11 segundo**: sin verdad de versión, todo lo demás se documenta sobre arena.
- **12 ∥ 13** en paralelo: ninguna depende de la otra y ambas cierran P5/P6.
- **16 después de 13**, porque la prueba de que el índice reduce superficie **es**
  la medición de 13.
- **14 antes de 17**: los permisos definen qué puede escribirse; la sesión
  resistente a cortes protege esa escritura.
- **15 ∥ 14**: son independientes.
- **17 al final**: es la de mayor coste y menor urgencia.

---

## 4 · Umbrales: cuándo para y cuándo rehace

Toda fase se entrega con `suite verde + manifiesto TODO COINCIDE`, o es no-op.
Se **rehace** (no se «pule» a medias) cuando:
- el test descubre que el diseño no sostiene el invariante (le pasó a F8 con el
  `deshabilitar` no idempotente);
- la reparación produce una descripción que **no corresponde** al archivo
  (le pasó a `zai` y `arquitectura`).

Y no se declara verde por fuera: **`npm run validar` lo lanza Mario**, siempre.
El agente compila lo que toca con tsconfig aislado y corre suites puntuales; no
simula el cierre. Es la diferencia entre «aplicado» y «verificado», y estas cinco
fases se escriben para que esa diferencia nunca deje de verse.

---

## 5 · Ciclo de vida

1. Implementar **una sola fase por turno**; nada de mezclar dos.
2. Evidencia en mano antes de tocar la siguiente; el acta se anota en `perfeccion.json`.
3. Al cerrar, actualizar **una sola vez** este documento, con la fecha de cierre
   y el comando de comprobación.
4. Borrar `_f8f9.md`, `_tc_out.txt` cuando F12/F13 estén en código: directorio
   limpio vale más que archivos temporales con número mágico.

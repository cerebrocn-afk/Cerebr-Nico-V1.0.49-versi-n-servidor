## v1.70.1 · 2026-10-24 · MI TEST SE COMPORTÓ COMO EL QUE CRITICABA

El veredicto en la máquina real del usuario dio:

> VEREDICTO: HAY FALLOS — 1 fallo(s) sobre 7990 comprobaciones.
> bucleDeBloques · cortó en la línea 21 · razón 0.298 · masa 0.298 · **543 ms**

El corte estaba **bien**: misma línea, misma razón, misma masa que acá. Lo que
falló fue la aserción `ms < 300`. En este entorno medí 38 ms; en el equipo del
usuario, 543 ms con Ollama con decenas de modelos, Electron y el motor cargando
la CPU. **Un veredicto que depende de qué proceso está usando la CPU en ese
instante no puede bloquear una entrega** — y yo acababa de escribir, sobre la
suite `imagen`, exactamente esta objeción. Dos veces el mismo error.

Cambio: el tiempo ahora **se reporta, no se condiciona** (se sacan las dos
aserciones de reloj: `ms < 300` sobre 102 KB y `msGrande < 400` sobre 621 KB). En
lugar de medir la corrida grande por relojes se comprueba el **trabajo**: en
código legítimo el detector sale con `lineaCorte === -1`, o sea que ni siquiera
recorre el archivo. El costo sigue acotado por `maxAtras`, que es una cota de
trabajo y no de tiempo.

### Dependencias: 5 vulnerabilidades cerradas (4 high + 1 moderate)

Medido con `npm audit` sobre `app/` del zip v1.70.0:

| paquete | antes | advisory | después |
|---|---|---|---|
| `body-parser` | <1.20.9 | high · parseo de URL-encoded | parche en rango |
| `vite` | ≤6.4.3 | high · `launch-editor` escapeCmdArgs() | parche en rango |
| `undici` (transitiva) | 6.x/7.x | high · DoS | parche en rango |
| `electron` | **44.3.0** | high · pointer-lock atribuido a otro frame, geometría de frame confiada a la GPU (x2), certificados eMudhra | **44.9.3** |

Las tres primeras las cerró `npm audit fix` dentro del rango declarado. Electron
NO: `44.9.3` está fuera del rango porque estaba fijado exacto (`44.3.0`), así que
npm no lo toca solo y hubo que subirlo a mano. Es un salto de **patch dentro de la
misma mayor**, sin cambios de API para el shell. `package-lock.json` regenerado.

Verificación: `npm audit` → **found 0 vulnerabilities**.

### Diagnóstico de la sesión `1792800971542` (36 mensajes, exportada 2026-10-24T00:16Z)

**«Se cortaron y no contestaba nadie» no es un corte del motor.** De los mensajes
19 al 35, ocho turnos seguidos, la cadena de provisión respondió con `Failed to
fetch` en **todos** los modelos intentados — `open-mistral-nemo`,
`mistral-code-latest`, `gemma4:31b-cloud`, `openrouter/free`, `gemini-3.5-flash`,
`glm-4.5-flash`. Un fallo de proveedor devuelve un error del proveedor; `Failed
to fetch` es la fetch que **no llegó a salir**, es decir la conectividad de
salida (o el servidor local que la hace) estaba caída. Que el usuario revisara
las claves y estuvieran bien es coherente: **nunca fue un problema de
credenciales** — con clave mala el proveedor contesta 401, no `Failed to fetch`.
El mensaje 5, además, trae otro error distinto («Error interno del motor») sobre
el mismo modelo, lo que refuerza que el problema estaba por debajo de la lista de
modelos.

Lo que sí quedó demostrado: el fusible rotó los modelos correctamente pero
**nunca dijo «la salida de red está caída, dejá de reintentar»**. Rotar ocho
turnos seguidos ante un fallo de red le hace creer al usuario que el modelo
responde mal. Esa guarda (umbral de `Failed to fetch` consecutivos → diagnóstico
de red, no de modelo) es el siguiente trabajo, y va anotada como pendiente.

**«Abriste el previsualizador como 70 veces» (mensaje 4):** esta sesión corre
sobre v1.69.0, anterior a este zip. El vigila-carga de v1.70.0 suma como máximo
**3** recargas por montaje de URL y después se rinde con aviso y enlace directo;
no puede producir 70 aperturas.

**«La repetiste, termina y comienza y no usaste las fotos que subí» (mensaje 14):**
queda abierto. El mensaje 15 responde que el archivo `assets/subidas/captura-…png`
existe pero no se usó — es el mismo frente de las imágenes duplicadas/ignotas que
viene de la auditoría anterior y sigue sin reproducir.

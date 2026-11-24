/**
 * reglasArquitecto.ts — el prompt de inicio del IDE, con UMBRALES (v2.3.9)
 *
 * ── POR QUÉ EXISTE ESTE MÓDULO ─────────────────────────────────────────────
 * El prompt de «Perfil de Arquitecto Senior» vivía SOLO como texto pegado a
 * mano en Configuración → IA → «Instrucciones extra del sistema»
 * (`proSettings.ai.systemExtra`). Eso tiene tres defectos medidos:
 *
 *   1. NO VIAJA CON LA APP. Un usuario nuevo abre la IDE con el campo vacío y
 *      el modelo no recibe ninguna de estas reglas. La capacidad existía y
 *      nadie la tenía.
 *   2. NO SE PUEDE PROBAR. Un texto en localStorage no tiene aserciones: nadie
 *      comprueba que siga diciendo lo que debe decir.
 *   3. CONTRADICE AL SISTEMA. El prompt original pedía «Gateway de proveedores»
 *      y «sandbox aislado», que el IDE YA implementa (`utils/engine.ts`,
 *      `engine/resilience.ts`, puente :5000). Pedirlos otra vez hace que el
 *      modelo re-explique la arquitectura propia en cada respuesta.
 *
 * ── LA DECISIÓN DE DISEÑO: TRES CAPAS, NO UNA LISTA PLANA ──────────────────
 * El defecto de fondo del prompt viejo era tratar igual un typo y un rediseño
 * de persistencia: exigía ADR + SPOF + trade-offs para todo, y el modelo
 * resolvía la contradicción ignorando una mitad (sin decir cuál). Aquí el
 * umbral es explícito:
 *
 *   CAPA 1 · SIEMPRE      identidad y honestidad (5 reglas, no 30)
 *   CAPA 2 · SEGÚN TAREA  local / feature / arquitectura, con umbral
 *   CAPA 3 · NUNCA        prohibiciones duras (secretos, destructivo, mentir)
 *
 * ── CÓMO SE USA (sin romper lo que el usuario ya escribió) ─────────────────
 * `componerReglasProyecto()` devuelve el texto que viaja al system prompt:
 *   · si el usuario NO tocó el campo  → las reglas de fábrica (este módulo);
 *   · si el usuario escribió algo     → SUS reglas, tal cual (manda el usuario);
 *   · si el usuario las desactivó     → cadena vacía (no se inyecta nada).
 * El interruptor vive en `proSettings.ai.reglasArquitecto` y su valor por
 * defecto es `true`: la casa ya tiene escrita la regla de que las funciones
 * nacen encendidas (v1.73.0), y una capacidad apagada por defecto es una
 * capacidad que nadie descubre.
 *
 * ── HONESTIDAD ─────────────────────────────────────────────────────────────
 * Este módulo NO promete que el modelo obedezca. Un prompt es una instrucción,
 * no un mecanismo. Lo que sí garantiza es que el texto llega, que es el mismo
 * para todos, y que se puede comprobar con `tests/reglasArquitecto.test.ts`.
 */

/** Las tres capas del perfil, en el orden en que se leen. */
export type CapaReglas = "siempre" | "segun-tarea" | "nunca";

/** Clasificación de un pedido según lo difícil que sea revertirlo. */
export type TipoTarea = "local" | "feature" | "arquitectura";

/**
 * Texto de fábrica. Se mantiene como constante exportada para que la suite
 * pueda afirmar sobre él sin depender de cómo se componga al final.
 */
export const REGLAS_ARQUITECTO_V2 = `# REGLAS DEL PROYECTO — Perfil de Arquitecto Senior (v2, con umbrales)

## CAPA 1 · SIEMPRE (identidad y honestidad)

1. **Rol:** arquitecto de software senior. Mentalidad de trade-offs: no hay
   solución perfecta, hay compromisos. Cada decisión técnica lleva su costo
   (latencia, complejidad, mantenibilidad) al lado.
2. **Veracidad:** no afirmes haber leído, ejecutado o creado algo que no
   hiciste con una herramienta. Si no pudiste verificar, escribe
   «aplicado, no verificado» y qué falta. Nunca inventes rutas, funciones ni
   nombres de herramientas.
3. **Cero relleno:** sin saludos, sin repetir la pregunta, sin resumen final de
   lo ya dicho. Primero la solución o el código.
4. **Idioma:** español técnico, directo. El código mantiene su sintaxis.
5. **Consistencia sobre preferencia:** si el proyecto ya tiene una convención,
   seguila aunque no sea la que elegirías. Un archivo que no encaja cuesta más
   que uno mediocre pero coherente.

## CAPA 2 · SEGÚN LA TAREA (se activa por umbral)

Antes de responder, clasificá el pedido:

| Tipo | Señal | Qué se exige |
|---|---|---|
| **Local** | typo, rename, ajuste de estilo, bug de una línea | Solución directa. SIN ADR, sin SPOF, sin tabla de trade-offs. |
| **Feature** | nueva función, endpoint, componente, migración pequeña | Contratos de entrada/salida + estados límite (vacío, cargando, error, muchos). |
| **Arquitectura** | esquema de datos, contrato de API pública, elección de tecnología, topología, algo difícil de revertir | ADR + trade-offs + SPOF y su mitigación. |

**Regla dura:** ADR, SPOF y comparativas de tecnología SÓLO en la fila
«Arquitectura». Aplicarlos a un typo es ceremonia, no rigor.

**Presupuesto de código proporcional.** El manejo de errores y el logging
escalan con el alcance: en un snippet, validá la entrada y devolvé el error; en
un módulo, añadí logging, tipado completo y separación de responsabilidades.
Nunca infles 5 líneas a 40.

**Alcance.** No refactorices lo que no te pidieron. Si ves un problema
adyacente, mencionalo en una línea y seguí.

**Reversibilidad.** Preferí el cambio que se deshace con un git revert sobre el
que exige migración de datos.

## CAPA 3 · NUNCA (prohibiciones duras)

- **Secretos en claro.** Ni en código, ni en logs, ni en mensajes de error, ni
  en archivos exportados. Si un error de proveedor rebota una credencial, se
  redacta antes de mostrarla.
- **Acción destructiva sin aviso.** Borrar, sobrescribir sin respaldo, git
  reset, matar procesos: se pregunta SIEMPRE, con la lista exacta de lo que se
  va a tocar.
- **Afirmar ejecución no realizada.** Es el peor error posible: hace perder
  tiempo y rompe la confianza.
- **Sesgo por hype.** No recomiendes una tecnología porque está de moda. Si un
  índice tradicional resuelve el problema, no propongas una base vectorial.

## Lo que este prompt NO repite (y por qué)

- **Gateway de proveedores y sandbox:** el IDE ya los implementa
  (src/utils/engine.ts, src/engine/resilience.ts, el puente :5000). Pedirlos
  otra vez hace que el modelo re-explique la arquitectura propia en cada
  respuesta. Se asume que existen y se usan.
- **Catálogo de estilos (microservicios, EDA, CQRS, Serverless):** un IDE local
  no es microservicios. La regla útil es «elegí el estilo por la carga real, no
  por catálogo», y ya está en la Capa 1.
- **Ejemplos de hype con nombre propio:** envejecen y meten opinión sobre el
  roadmap del usuario en un prompt que debería ser neutro.`;

/** Encabezado con el que el texto viaja al system prompt (lo lee App.tsx). */
export const ENCABEZADO_REGLAS =
  "REGLAS DEL PROYECTO (puestas por el usuario en Configuración → IA / Modelos; cúmplelas en toda la conversación):";

/**
 * Decide qué texto de reglas viaja al system prompt.
 *
 * @param systemExtra  lo que el usuario escribió en el panel (puede ser "").
 * @param activas      el interruptor `ai.reglasArquitecto` (default true).
 * @returns el texto a inyectar, o "" si no hay que inyectar nada.
 *
 * Regla de precedencia, en este orden:
 *   1. interruptor apagado            → "" (el usuario no quiere reglas)
 *   2. el usuario escribió algo       → SUS reglas (manda el usuario)
 *   3. campo vacío                    → las reglas de fábrica
 *
 * El caso 3 es el que arregla el defecto real: hoy un usuario nuevo no recibe
 * ninguna regla porque el campo nace vacío.
 */
export function componerReglasProyecto(systemExtra: string | null | undefined, activas: boolean): string {
  if (!activas) return "";
  const propio = String(systemExtra ?? "").trim();
  if (propio.length > 0) return propio;
  return REGLAS_ARQUITECTO_V2;
}

/**
 * Clasifica un pedido por su reversibilidad. Es la pieza que hace que el
 * umbral de la Capa 2 no sea una promesa: se puede probar.
 *
 * Criterio (deliberadamente conservador — ante la duda, sube de categoría):
 *   · arquitectura: toca esquema de datos, contrato público, topología o
 *     elección de tecnología;
 *   · feature: crea o cambia comportamiento observable;
 *   · local: el resto (typos, estilos, renombres, un bug de una línea).
 */
export function clasificarPedido(texto: string): TipoTarea {
  const t = String(texto || "").toLowerCase();
  if (!t.trim()) return "local";

  const senalesArquitectura = [
    "esquema", "schema", "migraci", "base de datos", "database", "postgres", "sqlite",
    "contrato de api", "api pública", "endpoint público", "topolog", "microservicio",
    "arquitectura", "elegir tecnolog", "cambiar de framework", "índice", "indice",
    "consistencia", "transacci", "saga", "particion", "sharding", "replicaci",
  ];
  if (senalesArquitectura.some((s) => t.includes(s))) return "arquitectura";

  const senalesFeature = [
    "crea", "crear", "añade", "añadir", "agrega", "agregar", "implementa",
    "nueva función", "nuevo componente", "nuevo endpoint", "feature", "módulo",
    "modulo", "pantalla", "formulario", "integra", "integrar",
  ];
  if (senalesFeature.some((s) => t.includes(s))) return "feature";

  return "local";
}

/**
 * Qué componentes de respuesta exige cada tipo. Es la tabla de la Capa 2 en
 * forma ejecutable: si `clasificarPedido` dice «local», aquí no hay ADR.
 */
export function exigePorTipo(tipo: TipoTarea): {
  adr: boolean;
  spof: boolean;
  tradeoffs: boolean;
  contratos: boolean;
  estadosLimite: boolean;
} {
  switch (tipo) {
    case "arquitectura":
      return { adr: true, spof: true, tradeoffs: true, contratos: true, estadosLimite: true };
    case "feature":
      return { adr: false, spof: false, tradeoffs: false, contratos: true, estadosLimite: true };
    case "local":
    default:
      return { adr: false, spof: false, tradeoffs: false, contratos: false, estadosLimite: false };
  }
}

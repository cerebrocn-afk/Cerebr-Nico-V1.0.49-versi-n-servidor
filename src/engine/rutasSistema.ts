/**
 * rutasSistema.ts — EL MAPA DE RUTAS QUE TODO MODELO RECIBE (v1.86.3)
 *
 * Por qué existe. Un modelo que opera el IDE sin saber DÓNDE vive cada cosa
 * escribe en el lugar equivocado, lee lo que no existe y —peor— cree que un
 * archivo no está cuando lo que está roto es el camino que usó para buscarlo.
 * Los dos rojos que Mario trajo de Windows (sesión 1793133418292) eran
 * exactamente eso: `new URL(import.meta.url).pathname` + `path.resolve`
 * fabrican `\C:\Users\…`, una ruta inexistente, y el resultado fue «el patrón no
 * aparece en el .ts» con el .ts perfecto. Eso no es un bug de lógica: es un mapa
 * que nadie escribió.
 *
 * Este módulo es ESE mapa, en un solo lugar, y `abordaje.ts` lo manda en el
 * system prompt de CADA turno (`MAPA_DE_RUTAS`). No es documentación para
 * humanos —para eso está `RUTAS-DEL-SISTEMA.md`, que se verifica contra este
 * texto en `tests/rutasSistema.test.ts`—: es la columna vertebral que permite a
 * cualquier modelo, de cualquier proveedor, manejar el IDE sin adivinar.
 *
 * REGLAS DE LA CASA
 * ─────────────────
 * 1) Función pura: mismas opciones → mismos bytes. `CHARS_MAPA_RUTAS` es el costo
 *    real y `abordaje.ts` lo suma a su presupuesto; si no lo sumara, el
 *    `excedido` que se reporta sería mentira.
 * 2) NADA se inventa acá. Cada afirmación tiene fuente, y está citada abajo:
 *      · puertos                 → `PORTS` (src/constants.ts)
 *      · estado que se migra     → `CARPETAS_DE_ESTADO` (src/engine/raizDatos.ts)
 *      · PROJECT_DIR / .proyectos / guarda-raíz → `resolverRaizDatos` + server.ts:682-690
 *      · el NIVEL del proyecto (hija directa, no .proyectos/<nombre>) →
 *        `resolverRaizProyecto` (projectPorter.ts:93) llamado en server.ts:1270
 *      · cerebro/ como órgano de redirección → `cerebroOrgano.ts:84`
 *      · C:\Cerebronico y CEREBRONICO_DATOS     → iniciar_todo_windows.bat:59-67
 *      · .creador / hindsight-mirror → scripts/creador_daemon.py:52-53, scripts/hindsight_daemon.py:64-68
 *      · bóveda C:\CN · ~/CN     → `raizBovedaPorDefecto` (src/engine/bovedaLocal.ts:26)
 *      · espejos personalizados  → `raizEspejosPersonalizados` (derivada de la
 *        raíz de datos, igual que la bóveda; el cargador operativo es
 *        server.ts:4995 con PROJECT_ROOT)
 *    Cambiar una de esas fuentes sin cambiar este texto pone el gate EN ROJO.
 * 3) Prohibido escribir acá una ruta que no se haya verificado en el árbol real.
 *    El test comprueba además que las carpetas nombradas existen.
 *
 * v2.1.2 — EL PROMPT DEJÓ DE MENTIR SOBRE LOS ESPEJOS
 * ───────────────────────────────────────────────────
 * La constante decía `~/.cerebronico/espejos/` (literal con `~`) mientras el
 * servidor leía `PROJECT_ROOT/.cerebronico/espejos` (server.ts:4995). En la
 * máquina de Mario coincidían por casualidad; en cualquier otra instalación el
 * modelo mandaba al usuario a la home, el cargador no miraba ahí nunca y el
 * síntoma era idéntico al ya visto: carpeta «vacía» y nadie se queja. Que la
 * constante no la importara nadie no la volvía inofensiva: la volvía
 * INVIJILABLE. Ahora deriva de la raíz de datos, como `raizBovedaDelSistema`.
 */
import { PORTS } from "../constants";
import { CARPETAS_DE_ESTADO } from "./raizDatos";
import { raizBovedaPorDefecto as raizBovedaCanonica } from "./bovedaLocal";

export type SistemaOperativo = "windows" | "unix" | "desconocido";

/**
 * Raíz de datos real según el SO. NO es una conjetura: en Windows la fija el
 * lanzador (`iniciar_todo_windows.bat` pone CEREBRONICO_DATOS=C:\Cerebronico y de
 * ahí PROJECT_DIR); en el resto no hay lanzador que la mueva, así que manda el
 * default del motor y vive dentro de la instalación.
 */
export function raizDatosPorDefecto(so: SistemaOperativo = "desconocido"): string {
  return so === "windows" ? "C:\\Cerebronico" : "<instalación>/.proyectos";
}

/** Raíz de la bóveda de claves por SO, leída de la fuente canónica. */
export function raizBovedaDelSistema(so: SistemaOperativo = "windows"): string {
  return raizBovedaCanonica(so === "windows" ? "win32" : "linux", "~");
}

/**
 * Dónde vive un espejo personalizado, DERIVADO de la raíz de datos.
 *
 * El cargador operativo es `server.ts:4995`:
 *   `path.join(PROJECT_ROOT, ".cerebronico", "espejos")`
 * Esta función reproduce esa misma derivación para que el mapa que recibe el
 * modelo diga la verdad. Con `raizDatos` explícita se usa esa; sin ella, la
 * raíz por defecto del SO.
 *
 * Antes era el literal `"~/.cerebronico/espejos/"`: en Windows `~` no se
 * expande solo, así que el modelo indicaba una ruta que el cargador nunca leía.
 */
export function raizEspejosPersonalizados(
  so: SistemaOperativo = "windows",
  raizDatos?: string,
): string {
  const base = raizDatos || raizDatosPorDefecto(so);
  const sep = so === "windows" || /^[A-Za-z]:/.test(base) ? "\\" : "/";
  return `${base.replace(/[\\/]+$/, "")}${sep}.cerebronico${sep}espejos${sep}`;
}

/**
 * Compatibilidad: la constante histórica, ahora derivada de la raíz de datos de
 * Windows (el caso del lanzador). Se conserva exportada porque hay textos y
 * tests que la nombran; su valor ya NO es el literal con `~`.
 */
export const RUTA_ESPEJOS_PERSONALIZADOS = raizEspejosPersonalizados("windows");

/**
 * v2.1.2 (opción b) · la forma CANÓNICA que viaja en el mapa.
 *
 * El mapa es el índice, no el manual: nombra la ruta en la forma que el modelo
 * entiende sin expandir (~), y el detalle de las dos raíces —Windows y resto—
 * vive en RUTAS-DEL-SISTEMA.md, junto a CN_CEREBRO_MOTOR, CN_CEREBRO_DB y
 * HINDSITE_API_URL, que ya siguen ese precedente.
 *
 * El CABLE no usa esto: server.ts:4995 sigue leyendo
 * path.join(PROJECT_ROOT, ".cerebronico", "espejos"), que es
 * raizEspejosPersonalizados(so, raizDatos). Que el mapa diga la forma canónica
 * no vuelve a mentir al cable: son dos cosas distintas y ahora está escrito
 * cuál es cuál.
 */
export const RUTA_ESPEJOS_CANONICA = "~/.cerebronico/espejos/";

/** Qué es cada carpeta del árbol de INSTALACIÓN, en una línea. */
// v1.92.0 · `generada: true` marca la carpeta que PRODUCE el build y por lo tanto
// NO puede exigirse en el árbol: `scripts/entregar.ts` excluye `dist/` del ZIP a
// propósito (empacar binarios viejos es peor que no empacar nada), así que exigir
// su existencia medía el empaque, no el mapa. La valla sigue sin fantasma: pide la
// carpeta, o el guion del `package.json` que la genera.
export const CARPETAS_CLAVE: ReadonlyArray<{ ruta: string; es: string; generada?: boolean }> = [
  { ruta: "src/", es: "motor y UI en TypeScript." },
  { ruta: "server/", es: "rutas HTTP del servidor (server/routers/*.ts)." },
  { ruta: "dist/", es: "salida del build (dist/server.mjs). Se regenera: no se edita a mano.", generada: true },
  { ruta: "runtime/", es: "python-embed de los packs externos." },
  { ruta: "scripts/", es: "validar.mjs, daemon del creador, empaquetado." },
  { ruta: "manual-motor/", es: "manual de cada herramienta, por familia." },
  { ruta: "docs/ y documentacion/", es: "manuales y fases (humanos)." },
];

/**
 * Lo que vive DENTRO de la raíz de datos: ahí sí se escribe.
 *
 * EL NIVEL ESTÁ VERIFICADO, no conjeturado: el sandbox resuelve el proyecto con
 * `resolverRaizProyecto(PROJECT_ROOT)` (projectPorter.ts:93, llamado en
 * server.ts:1270), que toma la propia raíz de datos o UNA SUBCARPETA SUYA. Por eso
 * un proyecto es `<raíz de datos>/<nombre>/`; el prefijo `.proyectos/` solo aparece
 * cuando rige el default (ahí la raíz MISMA ya es `<instalación>/.proyectos`).
 * Escribir `.proyectos/<nombre>` con PROJECT_DIR puesto crea un nivel de más, y el
 * resolutor nunca lo ve: es el «creé el archivo y no aparece» de las sesiones reales.
 */
export const CARPETAS_DE_DATOS: ReadonlyArray<{ ruta: string; es: string }> = [
  { ruta: "<nombre-del-proyecto>/", es: "un proyecto por carpeta, HIJA DIRECTA de la raíz de datos (con el default, .proyectos/<nombre>/)." },
  { ruta: `${CARPETAS_DE_ESTADO[0]}/ y ${CARPETAS_DE_ESTADO[1]}/`, es: "estado que se migra entre versiones (bóveda, espejos, conocimiento). NO es un proyecto." },
  { ruta: "cerebro/", es: "la .con-ciencia: indice.json y las notas .md por tema. No es un proyecto." },
  { ruta: ".creador/", es: "sitios generados por el creador web (:5102) y su historial." },
];

/** Variables de entorno que cambian las rutas. Verificadas en la fuente citada. */
export const ENTORNOS_CLAVE: ReadonlyArray<{ v: string; hace: string }> = [
  // v1.0.14 · «vacía o ausente» es el texto que el candado de §3 exige: un PROJECT_DIR
  // en blanco NO cuenta (raizDatos.ts compara `!== ""`) y el modelo tiene que saberlo.
  { v: "PROJECT_DIR", hace: "raíz de datos del motor (vacía o ausente = <instalación>/.proyectos)" },
  { v: "CN_PROJECT_DIR", hace: "la misma raíz para el puente :5000 (si no, el almacén se parte)" },
  { v: "CN_CREADOR_ROOT", hace: "dónde guarda sus sitios el creador web (:5102)" },
  { v: "CN_HINDSITE_MIRROR", hace: "archivo del espejo de memoria (:5100)" },
  { v: "CN_BOVEDA_RAIZ", hace: "dónde cae la bóveda de claves" },
];

/** Puertos propios, con su dueño. Vienen de `PORTS`: una sola verdad. */
export const PUERTOS_CLAVE: ReadonlyArray<{ puerto: number; servicio: string }> = [
  { puerto: PORTS.IDE, servicio: "IDE" },
  { puerto: PORTS.SANDBOX, servicio: "sandbox/preview (jamás 3000)" },
  { puerto: PORTS.BRIDGE, servicio: "puente Python a la PC" },
  { puerto: PORTS.MEMORY, servicio: "memoria (hindsight)" },
  { puerto: PORTS.CREATOR, servicio: "creador de sitios" },
  { puerto: PORTS.CEREBRO, servicio: "motor del cerebro (hechos, páginas)" },
  { puerto: PORTS.OLLAMA, servicio: "Ollama local" },
];

/** La lección de Windows, en la única forma que evita repetirla. */
export const REGLA_DE_RUTA =
  "RUTA ABSOLUTA: de un import.meta.url se pasa con fileURLToPath de node:url, NUNCA con " +
  "new URL(...).pathname (en Windows da /C:/... y path.resolve lo vuelve \\C:\\..., " +
  "un camino INEXISTENTE). Antes de decir «no existe», imprimí la ruta resuelta.";

/**
 * Cómo se muestra la raíz de la instalación dentro del bloque. Con un nombre
 * relativo (`app`, el default) se deja la `/` porque es un token de carpeta
 * relativa. Con un camino ABSOLUTO — el que llega desde `server.ts` — se imprime
 * tal cual: pegarle una `/` daría `C:\CN-IDE/` (separadores mezclados), y esa
 * mezcla es justo el tipo de camino que no existe y hace reportar «no está».
 */
function mostrarRaizApp(raiz: string): string {
  const absoluta = /^([A-Za-z]:[\\/]|[\\/])/.test(raiz);
  return absoluta ? raiz.replace(/[\\/]+$/, "") : `${raiz}/`;
}

/**
 * El bloque que viaja en el system prompt. Corto y denso a propósito: entra en el
 * presupuesto del abordaje y no se recorta — es P0, porque sin mapa todo lo demás
 * se ejecuta a ciegas.
 *
 * v2.2.7 · TECHO 3000: el mapa medía 3298 y se compactó a <3000 sin perder datos.
 * Las frases se acortaron; la información es la misma. El test del techo es la
 * valla que evita que vuelva a crecer.
 */
export function textoDeRutasSistema(
  opts: { so?: SistemaOperativo; raizDatos?: string; raizApp?: string } = {}
): string {
  const so: SistemaOperativo = opts.so || "desconocido";
  const datos =
    opts.raizDatos ||
    (so === "desconocido"
      ? `${raizDatosPorDefecto("windows")} (Windows) · ${raizDatosPorDefecto("unix")} (resto)`
      : raizDatosPorDefecto(so));
  const app = mostrarRaizApp(opts.raizApp || "app");
  const arbol = (lista: ReadonlyArray<{ ruta: string; es: string }>) =>
    lista.map((c) => `${c.ruta} ${c.es}`).join("\n    ");
  const espejos = so === "desconocido"
    ? ".cerebronico/espejos"
    : raizEspejosPersonalizados(so, String(datos)).replace(/[\\/]+$/, "");
  return [
    `RUTAS DEL SISTEMA (no las adivinés):`,
    `  Instalación del IDE: ${app} — package.json, server.ts, dist/. NUNCA es el proyecto del usuario.`,
    `  Raíz de datos (ahí se escribe): la fija PROJECT_DIR → ${datos}.`,
    `  Dentro de la raíz de datos:\n    ${arbol(CARPETAS_DE_DATOS)}`,
    `  Un archivo de trabajo NUNCA va en el IDE: va a <raíz de datos>/<nombre del proyecto>/ (default: .proyectos/<nombre>/).`,
    `  Árbol de la instalación:\n    ${arbol(CARPETAS_CLAVE)}`,
    `  Bóveda: ${raizBovedaDelSistema("windows")} (Windows) · ${raizBovedaDelSistema("unix")} (resto). Espejos: ${espejos}`,
    `  Entorno: ${ENTORNOS_CLAVE.map((e) => `${e.v} → ${e.hace}`).join(" · ")}.`,
    `  Puertos: ${PUERTOS_CLAVE.map((p) => `${p.puerto}=${p.servicio}`).join(" · ")}.`,
    `  Cerebro: motor :${PORTS.CEREBRO} guarda hechos/páginas en .cerebro-db/. Ingesta >60 s = timeout, no fallo.`,
    `  Alcance de las herramientas: las voces del enjambre reciben SOLO texto (sin tools); el disco lo toca el Modo Agente PC (fs_read, fs_write, fs_list, fs_delete, fs_mkdir, exec) contra el puente :${PORTS.BRIDGE}; la obra va al sandbox :${PORTS.SANDBOX}. No confundas los órganos. Si algo falla, di el error real — nunca «no tengo acceso».`,
    `  EL SANDBOX :${PORTS.SANDBOX} sirve UNA sola carpeta: si no ves lo escrito, pedí GET /__cn_info → raíz efectiva y duplicados.`,
    `  ENVÍO AL SANDBOX: write_file/edit_file/append_file sobre la carpeta vinculada ES la entrega; :${PORTS.SANDBOX} la sirve. No hay endpoint de subida. Preview: GET /api/sandbox/status → POST /api/sandbox/start {"destino":"<proyecto>"}`,
    `  Frente IDE: producción sirve dist/ (src/ no se ve → npm run build); dev sirve /src/.`,
    `  Puente :${PORTS.BRIDGE} mudo = agente PC apagado: escribí en sandbox o pedí iniciar_todo.`,
    `  ${REGLA_DE_RUTA}`,
  ].join("\n");
}

/** Cuánto cuesta el mapa en el presupuesto (para que el abordaje lo compute honesto). */
export const CHARS_MAPA_RUTAS = textoDeRutasSistema().length;

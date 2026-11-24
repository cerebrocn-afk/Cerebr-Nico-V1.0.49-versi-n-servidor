/**
 * puertosArranque.ts — LOS SIETE PUERTOS DE LA CASA, EN EL ARRANQUE (v2.3.12)
 * ==========================================================================
 * EL DEFECTO QUE ESTE MÓDULO CIERRA (queja de Mario, 6/11: «el arranque no
 * muestra los 7 puertos»).
 *
 * Medido en vivo sobre la entrega v2.3.11 (`tsx server.ts` + `GET /api/health/deep`):
 * el telón pintaba CINCO filas y sólo TRES nombraban un puerto
 * (`Ollama :11434`, `Sandbox :3500`, `Puente PC :5000`). Faltaban cuatro:
 * IDE :3000, Memoria :5100, Creador :5102 y Motor del cerebro :5103. La barra de
 * estado (Header) sí traía los siete desde v2.3.9. O sea: el usuario miraba la
 * barra y veía siete, miraba el arranque y veía tres. Dos verdades del mismo
 * sistema, y la que aparece primero es la que miente.
 *
 * LA CAUSA NO ES UN OLVIDO AISLADO, ES LA FORMA DE LA LISTA.
 * El inventario de puertos estaba escrito A MANO en seis lugares distintos, y cada
 * uno se actualizaba cuando alguien se acordaba:
 *   · `src/constants.ts` → `PORTS`                (7 — la semilla, la única verdad)
 *   · `src/engine/rutasSistema.ts` → `PUERTOS_CLAVE` (7 — vallado con `=== 7`)
 *   · `src/components/Header.tsx`                (7 — v2.3.9)
 *   · `server/routers/telemetria.ts` → `SONDAS`  (7 — v2.3.9)
 *   · `src/constants.ts` → `MAPA_PUERTOS`        (6 — sin :5103)
 *   · `scripts/arranque-diagnostico.mjs`         (6 — «LOS SEIS PUERTOS»)
 *   · `/api/health/deep`                         (3 en filas con puerto)
 * Una lista copiada seis veces siempre termina divergiendo: es el mismo defecto
 * que `telemetria.ts` ya persigue en su comentario de v2.3.9 («añadir un puerto
 * obligaba a acordarse de las tres, y olvidar una no daba error de compilación:
 * daba un `undefined` silencioso que la interfaz pintaba como OFF»).
 *
 * ACÁ VIVE EL PLANO, PURO. Este módulo no sondea ni lee disco: declara QUÉ puerto
 * es cada uno, QUIÉN lo levanta y si su rojo debe o no retrasar el telón. El
 * sondeo real vive en `server/routers/diagnostico.ts`, que recorre esta tabla —
 * así, añadir un octavo puerto es añadir una fila acá y una sonda allá, no cazar
 * strings en seis archivos.
 *
 * LA REGLA DE LOS TRES ESTADOS (la que Mario fijó el 4/11 para el :5103 y que acá
 * se aplica a toda la tabla, no sólo a ese chip):
 *   · vive y debe vivir          → VERDE
 *   · no nació y es de los que nacen bajo demanda → GRIS, informativo
 *   · debía estar y ya no está   → ROJO
 * Pintar de rojo un servicio que a esta hora NO existe es tan mentira como
 * pintar de verde uno que no está: las dos cosas hacen que el rojo deje de
 * significar nada. Ver `server/routers/telemetria.ts` (v2.3.9) y
 * `src/components/Header.tsx` (estado `bajo-demanda`).
 */
import { PORTS } from "../constants";
import { PUERTOS_CLAVE } from "./rutasSistema";

/** Quién levanta el puerto. Es lo que decide si su ausencia es roja o gris. */
export type NacimientoDePuerto =
  /** Nace con este mismo proceso: si no está, esta pantalla no existe. */
  | "ide"
  /** Lo engendra `server.ts` como hijo suyo (hereda token y raíz de datos). */
  | "hijo-del-server"
  /** Lo levanta `iniciar_todo_windows.bat` en su pasada de packs. */
  | "lanzador"
  /** No tiene ventana ni proceso fijo: aparece la primera vez que hace falta. */
  | "bajo-demanda"
  /** Es de la máquina, no de la app: la IDE lo usa pero no lo instala. */
  | "externo";

/** Marcador de la sonda propia: el que contesta es el que contesta. */
export const SONDA_PROPIA = "self";

export interface PuertoDeArranque {
  /** Clave de la muestra de telemetría: `port3000`, `port5103`… mismo nombre en toda la casa. */
  clave: string;
  /** El número. Sale de `PORTS`: nunca se escribe el literal acá. */
  puerto: number;
  /** Nombre corto de la fila (lo que se lee en el telón y en el log). */
  servicio: string;
  /** Qué es, en una línea, para quien no conoce la arquitectura. */
  detalle: string;
  nacimiento: NacimientoDePuerto;
  /**
   * Dónde se mide. `self` = este server; `OLLAMA` = la base configurable del
   * motor; cualquier otra cadena es una URL absoluta. La traducción vive en
   * `diagnostico.ts`/`telemetria.ts`, que son los que conocen las URLs reales.
   */
  sonda: string;
  /**
   * ¿Su rojo retrasa el telón y cuenta como «problema» en el resumen?
   * `false` = se pinta (con su motivo) pero no secuestra la entrada: es la
   * diferencia entre informar y chantajear. El plazo del vigilante (12 s) sigue
   * siendo el plazo del telón, no la suma de los packs de Python.
   */
  bloqueante: boolean;
  /** El remedio que se muestra en rojo. Vacío = no hay nada que el usuario pueda hacer. */
  remedio: string;
}

/**
 * El plano completo: los SIETE, en orden ascendente de puerto, cada uno con su
 * dueño y su criterio de color. Derivado de `PORTS` (los números) y de
 * `PUERTOS_CLAVE` (los nombres de servicio), que es la tabla que ya viaja en el
 * system prompt — así el arranque y el prompt no pueden contradecirle.
 */
export const PUERTOS_DE_ARRANQUE: ReadonlyArray<PuertoDeArranque> = [
  {
    clave: "port3000",
    puerto: PORTS.IDE,
    servicio: "IDE",
    detalle: "interfaz + API /api/* — este mismo proceso",
    nacimiento: "ide",
    sonda: SONDA_PROPIA,
    bloqueante: false,
    remedio: "",
  },
  {
    clave: "port3500",
    puerto: PORTS.SANDBOX,
    servicio: "Sandbox",
    detalle: "app exportada / previsualización en vivo (jamás el 3000)",
    nacimiento: "bajo-demanda",
    sonda: "SANDBOX",
    bloqueante: true,
    remedio: "Está arrancado pero no contesta: pulsa Sync para reiniciarlo.",
  },
  {
    clave: "port5000",
    puerto: PORTS.BRIDGE,
    servicio: "Puente PC",
    detalle: "puente Python hacia la PC (Modo Agente: archivos reales)",
    nacimiento: "hijo-del-server",
    sonda: "WORKER",
    bloqueante: true,
    remedio: "Sin el puente, el Modo Agente PC (archivos reales) no funciona.",
  },
  {
    clave: "port5100",
    puerto: PORTS.MEMORY,
    servicio: "Memoria",
    detalle: "hindsight — consulta, no guarda (quien guarda es el :5103)",
    nacimiento: "lanzador",
    sonda: "http://127.0.0.1:5100/health",
    bloqueante: false,
    remedio: "El pack de memoria no levantó. Se apaga desde Tareas → Servicios sin dañar el resto.",
  },
  {
    clave: "port5102",
    puerto: PORTS.CREATOR,
    servicio: "Creador",
    detalle: "creador de sitios web",
    nacimiento: "lanzador",
    sonda: "http://127.0.0.1:5102/health",
    bloqueante: false,
    remedio: "El pack creador no levantó. No afecta al chat: sólo a la creación de sitios.",
  },
  {
    clave: "port5103",
    puerto: PORTS.CEREBRO,
    servicio: "Motor del cerebro",
    detalle: "guarda hechos y páginas en <raíz de datos>/.cerebro-db/",
    nacimiento: "bajo-demanda",
    sonda: "http://127.0.0.1:5103/health",
    bloqueante: false,
    remedio: "Estaba vivo y dejó de responder: revisá el proceso cerebro_motor.py.",
  },
  {
    clave: "port11434",
    puerto: PORTS.OLLAMA,
    servicio: "Ollama",
    detalle: "inferencia local (proceso de la máquina, no de la app)",
    nacimiento: "externo",
    sonda: "OLLAMA",
    bloqueante: true,
    remedio: "Arranca Ollama. Sin él, los modelos locales no pueden responder.",
  },
];

/** Los siete números, en el orden del plano. */
export const puertosDeArranque = (
  lista: ReadonlyArray<PuertoDeArranque> = PUERTOS_DE_ARRANQUE,
): number[] => lista.map((p) => p.puerto);

/**
 * Qué puertos de `PUERTOS_CLAVE` (la tabla del system prompt) NO están en el
 * plano del arranque. Vacío = las dos verdades coinciden. Esta función existe
 * porque el día que alguien añada un puerto a `PORTS` y se olvide del arranque,
 * el defecto tiene que poder NOMBRARSE: «falta el 5104» es un arreglo de dos
 * minutos; «el arranque muestra menos de lo que dice el prompt» es una sesión.
 */
export function puertosFaltantesEnArranque(
  lista: ReadonlyArray<PuertoDeArranque> = PUERTOS_DE_ARRANQUE,
): number[] {
  const declarados = new Set(puertosDeArranque(lista));
  return PUERTOS_CLAVE.map((p) => p.puerto).filter((n) => !declarados.has(n));
}

/** Nombre de fila, con el puerto pegado al nombre (el formato de siempre del telón). */
export const nombreDeFila = (p: PuertoDeArranque): string => `${p.servicio} :${p.puerto}`;

/** Una línea legible del plano, para el log de arranque y para el diagnóstico. */
function lineaDePuerto(p: PuertoDeArranque, nacimiento: string): string {
  return `    :${String(p.puerto).padEnd(6)} ${p.servicio.padEnd(18)} ${nacimiento}`;
}

/** Cómo se dice el `nacimiento` en español de arranque. */
const FRASE_NACIMIENTO: Record<NacimientoDePuerto, string> = {
  "ide": "nace con este proceso",
  "hijo-del-server": "hijo de este server",
  "lanzador": "lo levanta el lanzador",
  "bajo-demanda": "nace bajo demanda",
  "externo": "proceso de la máquina",
};

/**
 * El mapa que imprime `server.ts` al abrir el puerto.
 *
 * Declara el plano y NO afirma estado: en este instante del arranque el server
 * todavía no sondeó nada, y los packs de Python pueden estar levantando en
 * paralelo (el `.bat` los lanza antes). Un «TODO OK» inventado en el log es justo
 * lo que este proyecto combate. Lo medido se ve en el telón (`/api/health/deep`),
 * que es donde hay sondas.
 */
export function textoDeMapaDePuertos(
  lista: ReadonlyArray<PuertoDeArranque> = PUERTOS_DE_ARRANQUE,
): string {
  return [
    `Mapa de puertos de la casa (${lista.length}, fuente única: src/constants.ts):`,
    ...lista.map((p) => lineaDePuerto(p, FRASE_NACIMIENTO[p.nacimiento])),
  ].join("\n");
}

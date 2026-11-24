/**
 * arranqueVentanas.ts — QUÉ VENTANAS TIENE QUE DEJAR UN CLIC (v1.99.0)
 * ====================================================================
 * El usuario lo dijo con una precisión que cualquier valla debería envidiar:
 * «EN TEORÍA TIENEN QUE QUEDAR ABIERTOS 2 CMD Y 3 PY, ANAIZALO». Y midió lo contrario:
 * «solo el cmd de arranque y 2 py», «fabrio 2 py, y hay 3 cmd, una vacía que dice
 * arranquecompleto, pero vacía, al rato se cerró sola», y lo peor de todo:
 * «SE CERRO OTRA VEZ POR LA MITAD Y NO DA TIEMPO A COPIAR».
 *
 * La última frase es la que manda el diseño. Un proceso que muere llevándose su
 * consola borra la única evidencia que sirve. Dos defectos medidos en
 * `iniciar_todo_windows.bat`:
 *
 *   1. `start "CerebroNico Memoria" /min %CN_PY% scripts\hindsight_daemon.py` — sin
 *      `cmd /k`, la ventana ES el proceso: el pack cae y la consola desaparece con él.
 *   2. Ningún servicio escribía su salida a un archivo. No había adónde volver.
 *
 * Este módulo es el DUEÑO PURO del inventario: qué servicios hay, de qué tipo son
 * (CMD o PY — el conteo que el usuario vigila a ojo en el Administrador de tareas),
 * en qué ventana tienen que quedar, y dónde deja cada uno su log. El .bat es la
 * instalación fina: ejecuta este plano, no lo decide.
 *
 * Sin fs, sin red, sin shell: para que la suite pueda congelar el plano y la forma
 * del comando sin encender una sola ventana.
 *
 * ── v2.0.2 · EL SUPERVISOR NO SE REANIMA A SÍ MISMO ──────────────────────────
 * Medido en el log de arranque real:
 *
 *   [supervisor] «ollama» (:11434) no contesta → reanimo, intento 1 de 3
 *   [supervisor] «front» (:3000) no contesta → reanimo, intento 1 de 3
 *   [supervisor] «memoria» (:5100) no contesta → reanimo, intento 1 de 3
 *
 * Tres CMD abiertos y cerrados en el arranque. Los tres puertos YA estaban
 * ocupados: el `ollama serve` nuevo chocó con el oficial, el `npm run dev` nuevo
 * chocó con el IDE que ya corría, y la memoria nueva chocó con la que ya
 * escuchaba. Murieron al no poder tomar el puerto — de ahí el parpadeo.
 *
 * Dos causas, las dos de diseño:
 *
 *   a) `front` (:3000) estaba en el plano con `dueño: "lanzador"`. Pero el front
 *      ES el IDE que ejecuta el supervisor: reanimarse a sí mismo es un bucle por
 *      construcción, porque el `npm run dev` nuevo no puede tomar el 3000 que el
 *      actual ya tiene. Se marca `vigilado: false`.
 *   b) El supervisor empezaba a vigilar ANTES de que los servicios terminaran de
 *      levantar. Ollama tarda ~50 s (124 blobs), la memoria tardó 7 s (lo dice el
 *      propio log), y el sondeo da 1.200 ms de gracia. Todos «caían» por llegar
 *      tarde, no por estar rotos. Se añade `GRACIA_ARRANQUE_MS`: durante los
 *      primeros segundos el supervisor OBSERVA pero no reanima.
 */

export type TipoVentana = "cmd" | "py" | "sin-ventana";

export interface ServicioVentana {
  /** Identificador estable: es el nombre del archivo de log. */
  id: string;
  /** Título literal de la ventana (`start "TÍTULO" …`), en español, legible. */
  titulo: string;
  rol: TipoVentana;
  /** Puerto que tiene que responder para contar como vivo (0 = sin puerto). */
  puerto: number;
  /** Comando que se ejecuta. SIN variables del .bat: el server no las tiene,
   *  y un `%CN_MEMORY_PORT%` sin expandir tira el pack que queríamos reanimar. */
  comando: string;
  /** Quién lo levanta: el plano del lanzador, o el server como hijo. */
  dueño: "lanzador" | "server";
  /**
   * ¿El supervisor debe reanimarlo si el puerto no contesta?
   * `false` para el propio IDE (:3000): no puede reanimarse a sí mismo.
   * Ausente = true (compatibilidad con el plano anterior).
   */
  vigilado?: boolean;
  /**
   * v2.3.24 · Con `vigilado: false`, la RAZÓN que ve el usuario. Sin este campo el
   * supervisor le prestaba al sandbox y al motor el aviso del IDE («es el propio
   * IDE: no se reanima a sí mismo»): una fila mintiendo sobre otra fila, que es
   * justo el defecto que `indicadorServicios.ts` persigue en toda la casa.
   */
  noVigilado?: string;
}

/** La carpeta de logs de arranque, colgada de la raíz de DATOS (no de la instalación). */
export const CARPETA_LOGS_ARRANQUE = ["logs", "arranque"].join("/");

/**
 * El plano. Exactamente 2 CMD + 3 PY, que es lo que el usuario cuenta.
 * `dueño: "server"` es el puente :5000: lo engendra `server.ts` (así hereda el token y
 * la raíz de datos que v1.98.7 corrigió), por eso NO gasta una ventana propia — pero sí
 * cuenta como PY en el inventario, que es lo que el usuario vigila.
 *
 * `vigilado: false` en `front`: el IDE no se reanima a sí mismo (v2.0.2).
 */
export const SERVICIOS_VENTANA: ServicioVentana[] = [
  { id: "ollama", titulo: "Ollama Engine - Puerto 11434", rol: "cmd", puerto: 11434, comando: "ollama serve", dueño: "lanzador" },
  { id: "front", titulo: "CerebroNico Front - Puerto 3000", rol: "cmd", puerto: 3000, comando: "npm run dev", dueño: "lanzador", vigilado: false, noVigilado: "es el propio IDE: no se reanima a sí mismo" },
  { id: "memoria", titulo: "CerebroNico Memoria :5100", rol: "py", puerto: 5100, comando: "scripts\\hindsight_daemon.py --port 5100", dueño: "lanzador" },
  { id: "creador", titulo: "CerebroNico Creador :5102", rol: "py", puerto: 5102, comando: "scripts\\creador_daemon.py --port 5102", dueño: "lanzador" },
  // v2.3.25 · EL SUPERVISOR NO SABIA EMPUJAR EL PUENTE. El comando era
  // `agent_bridge_5000.py` SIN `--port` y con ruta RELATIVA (el archivo vive en
  // `scripts\`): relanzado desde el server moria al nacer, y el supervisor lo
  // contaba como caido tres veces por arranque. Se declara el comando real y
  // relanzable. `dueño` sigue diciendo quien lo enciende primero.
  { id: "puente", titulo: "CerebroNico Puente :5000", rol: "py", puerto: 5000, comando: "scripts\\agent_bridge_5000.py --port 5000", dueño: "server" },
];

export const contarPorTipo = (rol: TipoVentana, lista: ServicioVentana[] = SERVICIOS_VENTANA) =>
  lista.filter((s) => s.rol === rol).length;

/**
 * v2.3.24 · LOS OTROS DOS ÓRGANOS DE LA CASA: NO SON VENTANAS, PERO EXISTEN.
 * ---------------------------------------------------------------------------
 * EL DEFECTO QUE CERRAMOS (queja de Mario, 6/11: «en el arranque no encienden
 * todos los puertos; fijate en la cabecera y en la hoja de ruta que los
 * indicadores estén bien cableados»).
 *
 * Medido en el árbol v2.3.23: la cabecera pintaba SIETE chips (`Header.tsx`), el
 * telón pintaba SIETE filas (`puertosArranque.ts`) y la hoja de ruta —la lista
 * «Servicios» de la barra de Tareas, que es la única con interruptor— pintaba
 * CINCO, porque sale de `SERVICIOS_VENTANA`. Faltaban exactamente dos: el motor
 * del cerebro (:5103) y el sandbox (:3500). Y no eran dos ausencias cosméticas:
 * :5103 lo levanta el `.bat` (línea 325) pero NADIE lo vigilaba, así que caído
 * quedaba caído para siempre; :5100 además se le apunta con `HINDSITE_API_URL` a
 * ese :5103 que nadie cuida.
 *
 * ¿POR QUÉ NO VAN EN `SERVICIOS_VENTANA`? Porque ese arreglo es el contrato
 * literal del usuario: «TIENEN QUE QUEDAR ABIERTOS 2 CMD Y 3 PY», congelado en
 * `tests/arranqueVentanas.test.ts:47,49`. El motor es un cuarto Python **sin
 * ventana propia** (el `.bat` lo lanza con `/b`) y el sandbox no es un proceso
 * de arranque. Sumarlos al plano rompería el conteo a ojo del Administrador de
 * tareas; sumarlos acá abajo pinta los siete en la hoja de ruta y deja el
 * conteo de ventanas intacto. Dos preguntas distintas, dos tablas distintas.
 */
export const SERVICIOS_ADICIONALES: ServicioVentana[] = [
  {
    id: "sandbox",
    titulo: "CerebroNico Sandbox :3500",
    rol: "sin-ventana",
    puerto: 3500,
    comando: "",
    dueño: "server",
    vigilado: false,
    noVigilado: "lo levanta y lo apaga el preview del proyecto (Sync), no el lanzador",
  },
  {
    id: "motor",
    titulo: "CerebroNico Motor :5103",
    rol: "py",
    puerto: 5103,
    // Sin `%` del .bat: el supervisor lo relanza desde el server (v1.99.0).
    comando: "scripts\\cerebro_motor.py --port 5103",
    dueño: "lanzador",
  },
];

/** El inventario completo de la casa: las cinco ventanas del plano + los dos órganos sin ventana. */
export const INVENTARIO_SERVICIOS: ServicioVentana[] = [...SERVICIOS_VENTANA, ...SERVICIOS_ADICIONALES];

/**
 * v2.3.25 · LOS QUE HACEN FALTA PARA ABRIR EL IDE. Los otros no son ruido: son
 * órganos que nacen bajo demanda (:3500) o que son de la máquina (:11434).
 * Esta lista es la que contesta «¿ya se puede abrir la pantalla?».
 */
export const PUERTOS_CRITICOS = [3000, 5000, 5100, 5102, 5103];

/** Igual que `INVENTARIO_SERVICIOS`, con la marca de «crítico» ya puesta. */
export const inventarioConCriticos = (lista: ServicioVentana[] = INVENTARIO_SERVICIOS) =>
  lista.map((s) => ({ ...s, critico: PUERTOS_CRITICOS.includes(s.puerto) }));

/**
 * v2.3.25 · LA DECISION DE ABRIR, en una función pura.
 *
 * Antes el .exe esperaba UNA cosa: que :3000 contestara. Y :3000 contesta 4 s
 * antes de que el puente y los packs Python estén arriba, así que la IDE se
 * abría «con el servidor caído» y la cabecera se llenaba de OFF. También hay un
 * caso honesto: si un pack opcional nunca levanta (sin Python, un modelo que no
 * se descargó), esperar para siempre sería peor que abrir avisando.
 *
 * `minimo` (por defecto 6 de 7) es el pacto: abrir cuando la casa está entera;
 * si no llega, abrir igual a los `pacienciaMs` y decir EN LA PANTALLA qué falta.
 */
export function decidirApertura(opts: {
  vivos: number[];
  total: number;
  transcurridoMs: number;
  pacienciaMs: number;
  minimo?: number;
}): { abrir: boolean; motivo: string } {
  const minimo = opts.minimo ?? Math.max(1, Math.min(opts.total, 6));
  const arriba = new Set(opts.vivos);
  const faltan = Math.max(0, opts.total - arriba.size);
  const criticosCaidos = PUERTOS_CRITICOS.filter((p) => !arriba.has(p));
  if (faltan === 0) return { abrir: true, motivo: `los ${opts.total} puertos de la casa están arriba` };
  if (criticosCaidos.length === 0 && arriba.size >= minimo) {
    const opcionales = opts.total - arriba.size;
    return { abrir: true, motivo: `arriba ${arriba.size}/${opts.total} (los críticos, todos); ${opcionales} opcional(es) fuera` };
  }
  if (opts.transcurridoMs >= opts.pacienciaMs) {
    return {
      abrir: true,
      motivo: `se acabó la paciencia (${Math.round(opts.pacienciaMs / 1000)} s): arriba ${arriba.size}/${opts.total}` +
        (criticosCaidos.length ? ` — falta(n) ${criticosCaidos.join(", ")}` : ""),
    };
  }
  return {
    abrir: false,
    motivo: `esperando: arriba ${arriba.size}/${opts.total}` +
      (criticosCaidos.length ? ` — falta(n) ${criticosCaidos.join(", ")}` : ""),
  };
}

/** Los puertos de los siete, en el orden del inventario (la hoja de ruta los pinta así). */
export const puertosDelInventario = (lista: ServicioVentana[] = INVENTARIO_SERVICIOS): number[] =>
  lista.map((s) => s.puerto);

/** Los que el supervisor SÍ puede reanimar: todos menos el IDE y menos el sandbox. */
export const serviciosVigilados = (lista: ServicioVentana[] = INVENTARIO_SERVICIOS) =>
  lista.filter((s) => s.vigilado !== false);

/** EL NÚCLEO DE LA CURA: una ventana que sobrevive a su proceso y deja rastro. */
export const VENTANA_QUE_SOBREVIVE = "cmd /k";

/** Dónde aterriza la salida de un servicio. `<raízDatos>/logs/arranque/<id>.log`. */
export function rutaDeLog(raízDatos: string, id: string, sep = "\\"): string {
  const base = String(raízDatos || "").replace(/[\\/]+$/, "");
  return `${base}${sep}logs${sep}arranque${sep}${id}.log`;
}

/**
 * El `start` exacto que hay que escribir en el .bat. Sale de acá y no de la prosa del
 * manual para que la suite pueda batir línea por línea contra el archivo real: una
 * forma que vive en dos lugares siempre termina divergiendo (es el defecto que
 * `arranqueLimpio` ya persigue en el arranque limpio).
 */
export function comandoVentana(s: ServicioVentana, opts: { raizProyecto: string; logs: string }): string {
  const log = `${opts.logs}\\${s.id}.log`;
  return (
    `start "${s.titulo}" /min cmd /k ` +
    `"cd /d "${opts.raizProyecto}" && echo ==== arranque ${s.id} %date% %time% ====` +
    ` && ${s.comando} 1>> "${log}" 2>&1 ` +
    `& echo. & echo [${s.id}] se cerro. La ventana sigue abierta a proposito: ` +
    `el log completo esta en ${log}"`
  );
}

/* ─────────── Reavivado: con memoria, con tope, con motivo ─────────── */

export const REAVIVADOS_MAXIMOS = 3;
export const VENTANA_REAVIVADO_MS = 10 * 60_000;
export const ESPERA_BASE_MS = 15_000;

/**
 * v2.0.2 · GRACIA DE ARRANQUE.
 * Durante los primeros 90 s desde que el supervisor empieza a vigilar, un puerto
 * que no contesta NO se reanima: se anota como «arrancando». Ollama tarda ~50 s en
 * abrir el 11434 (124 blobs), la memoria tardó 7 s en el log real, y el sondeo da
 * 1.200 ms. Sin esta gracia, los tres «caían» por llegar tarde y el supervisor
 * abría tres CMD que morían al chocar con el puerto ya ocupado.
 */
export const GRACIA_ARRANQUE_MS = 90_000;

export interface HistorialReavivado {
  id: string;
  veces: number;
  ultimoEn: number;
}

export type DecisiónReavivado =
  | { accion: "reavivar"; enMs: number; vez: number }
  | { accion: "esperar"; enMs: number; vez: number }
  | { accion: "arrancando"; enMs: number; vez: number }
  | { accion: "renunciar"; motivo: string; vez: number };

/**
 * Caído un servicio, ¿lo reavivo? Cuatro reglas, en este orden, y las cuatro con la
 * firma de la casa (reloj inyectado, nada de dormir, nada de repetir a ciegas):
 *   · si el supervisor lleva menos de GRACIA_ARRANQUE_MS vigilando, el servicio está
 *     ARRANCANDO: se espera sin gastar intento (v2.0.2, la cura del parpadeo);
 *   · si ya pasaron 10 minutos desde el último intento, la seguidad vieja no cuenta;
 *   · la espera DUPLICA por reincidencia (15 s, 30 s, 60 s) — reintentar de inmediato
 *     contra la misma causa es la definición de bucle que la casa corta con `decidirBucle`;
 *   · al 3º intento dentro de la ventana se RINDE con motivo legible, en vez de
 *     reanimar para siempre un pack que está roto.
 *
 * `inicioVigilanciaMs` es opcional: sin él se comporta como antes (gracia 0), así la
 * suite vieja sigue pasando y el llamador decide cuándo empieza a contar.
 */
export function decidirReavivado(
  h: HistorialReavivado | null,
  ahoraMs: number,
  inicioVigilanciaMs?: number
): DecisiónReavivado {
  const vezAnterior = !h || ahoraMs - h.ultimoEn > VENTANA_REAVIVADO_MS ? 0 : h.veces;

  // v2.0.2: gracia de arranque. No gasta intento, no abre ventana.
  if (typeof inicioVigilanciaMs === "number") {
    const transcurrido = ahoraMs - inicioVigilanciaMs;
    if (transcurrido >= 0 && transcurrido < GRACIA_ARRANQUE_MS) {
      return {
        accion: "arrancando",
        enMs: GRACIA_ARRANQUE_MS - transcurrido,
        vez: vezAnterior,
      };
    }
  }

  if (vezAnterior >= REAVIVADOS_MAXIMOS) {
    return {
      accion: "renunciar",
      vez: vezAnterior,
      motivo:
        `se reanimó ${vezAnterior} veces en menos de ${Math.round(VENTANA_REAVIVADO_MS / 60_000)} minutos y vuelve a caer: ` +
        `el problema es del servicio, no del lanzador. Leé el log antes de insistir.`,
    };
  }
  const enMs = ESPERA_BASE_MS * 2 ** vezAnterior;
  return { accion: vezAnterior === 0 ? "reavivar" : "esperar", enMs, vez: vezAnterior + 1 };
}

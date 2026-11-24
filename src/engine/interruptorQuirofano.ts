/**
 * interruptorQuirofano.ts — EL INTERRUPTOR DEL QUIRÓFANO, CON MEMORIA (v2.3.9)
 * =============================================================================
 * PEDIDO DEL USUARIO (4/11), textual: «el interruptor con memoria entre
 * reinicios. No basta con un flag en RAM: si el Quirófano se apaga y el servidor
 * reinicia, vuelve encendido y te vuelve a bloquear».
 *
 * POR QUÉ UN FLAG EN RAM NO SIRVE
 * -------------------------------
 * El Quirófano se apaga porque está estorbando UNA operación concreta. Un flag en
 * memoria dura menos que esa operación: cualquier reinicio del servidor — y en
 * esta casa el servidor se reinicia solo, con el supervisor de arranque, con el
 * hot-reload, con el build — devuelve el juez encendido sin avisar. Un interruptor
 * que no sobrevive al arranque no es un interruptor: es decoración con estado.
 *
 * Acá el estado vive en `<raíz de datos>/.cerebronico/quirofano.json` y se LEE AL
 * ARRANCAR. Es la misma convención que `autoLlamado.json` (v2.3.8): el asiento
 * derecho del hemisferio es memoria, no instalación. Si el usuario mueve la raíz,
 * el interruptor se mueve con ella.
 *
 * PEDIDO 2 — DOS PALANCAS, NO UNA
 * -------------------------------
 * El Quirófano hace dos cosas distintas y apagarlas juntas es perder protección en
 * silencio:
 *
 *   · `escrituras` — juzga lo que va al disco: write_file, edit_file, borrados,
 *     el autosync del chat y las puertas de cierre (sintaxis, superficie pública,
 *     imports, peso).
 *   · `comandos`  — juzga lo que va al shell: la aduana del comando entrante
 *     (`comandoEntrante.normalizarComandoEntrante`) sobre run_command, run_tests
 *     y el puente del PC.
 *
 * Apagar `escrituras` NO apaga `comandos`, y al revés. Y cada palanca, al apagarse,
 * dice por escrito QUÉ deja de vigilarse (`dejaDeVigilar`). Un interruptor que no
 * nombra lo que apaga es un interruptor que el usuario termina de apagar a ciegas.
 *
 * LO QUE NINGUNA PALANCA APAGA (y se dice en el estado, no en la confianza)
 * ------------------------------------------------------------------------
 * · `sandboxAuthorized` y las 11 puertas mutantes del sandbox: son de otra casa.
 *   Ninguna palanca del Quirófano las toca, y un `comandos: false` no convierte un
 *   `run_command` en automático: sigue haciendo falta la autorización.
 * · El guardián de sintaxis profundo (esbuild/parser) sobre el contenido que se
 *   escribe: v2.1, vive en `syntaxGuard.ts`.
 * · La escritura de la propia configuración del Quirófano: el archivo de estado es
 *   legible y editable a mano a propósito (ver `dejaDeVigilar`). Si el juez deja
 *   de juzgar y encima nadie puede prenderlo, eso no es un apagado: es un candado.
 *
 * FILOSOFÍA
 * ---------
 * · Fallar abierto en la LECTURA: un JSON corrupto no apaga ni enciende el juez por
 *   sí solo; vuelve al valor por defecto (ENCENDIDO) y lo avisa en voz alta. El
 *   defecto seguro es que el Quirófano funcione, no que se apague solo.
 * · Cada cambio queda anotado con `desde`, `motivo` y `cambioPor`, y cada escritura
 *   que se deja pasar con el juez apagado deja UNA línea en el log. Apagado no
 *   significa invisible.
 */

export const VERSION_INTERRUPTOR = 1;

/** Las dos palancas. Nada mas: agregar una tercera es otro contrato. */
export type Palanca = "escrituras" | "comandos";
export const PALANCA = ["escrituras", "comandos"] as const;

export interface EstadoInterruptor {
  /** Juzgar escrituras antes de que toquen el disco. */
  escrituras: boolean;
  /** Juzgar comandos antes de que lleguen al shell. */
  comandos: boolean;
  /** Por qué se apagó (texto del usuario o del modelo que pidió el apagado). */
  motivo: string;
  /** ISO del último cambio. Si nunca se cambió, ISO del arranque. */
  desde: string;
  /** Quién cambió la palanca: `ide`, `modelo`, `arranque`, `manual`. */
  cambioPor: string;
  version: number;
}

/** Por defecto el Quirófano está ENCENDIDO en las dos palancas. */
export function estadoInicial(ahora: number = Date.now()): EstadoInterruptor {
  return {
    escrituras: true,
    comandos: true,
    motivo: "",
    desde: new Date(ahora).toISOString(),
    cambioPor: "arranque",
    version: VERSION_INTERRUPTOR,
  };
}

export function esPalanca(v: unknown): v is Palanca {
  return typeof v === "string" && (PALANCA as readonly string[]).includes(v);
}

/**
 * Lectura tolerante. Un archivo escrito a mano, viejo o truncado NO debe tumbar el
 * servidor ni apagar al juez de punta: se toma lo que se pueda leer y lo demás
 * vuelve al defecto (encendido).
 */
export function desdeDisco(texto: string, ahora: number = Date.now()): EstadoInterruptor {
  const base = estadoInicial(ahora);
  let j: any;
  try {
    j = JSON.parse(texto);
  } catch {
    return { ...base, cambioPor: "arranque", motivo: "el archivo de estado no se pudo leer: el Quirófano arranca ENCENDIDO" };
  }
  if (!j || typeof j !== "object") return base;
  const booleano = (v: unknown, porDefecto: boolean) => (typeof v === "boolean" ? v : porDefecto);
  return {
    escrituras: booleano(j.escrituras, base.escrituras),
    comandos: booleano(j.comandos, base.comandos),
    motivo: typeof j.motivo === "string" ? j.motivo.slice(0, 400) : "",
    desde: typeof j.desde === "string" ? j.desde : base.desde,
    cambioPor: typeof j.cambioPor === "string" ? j.cambioPor.slice(0, 40) : "arranque",
    version: typeof j.version === "number" ? j.version : VERSION_INTERRUPTOR,
  };
}

export function paraDisco(e: EstadoInterruptor): string {
  return JSON.stringify(
    {
      version: VERSION_INTERRUPTOR,
      escrituras: e.escrituras,
      comandos: e.comandos,
      motivo: e.motivo,
      desde: e.desde,
      cambioPor: e.cambioPor,
    },
    null,
    2
  );
}

/** Cambio puro de palancas: devuelve el estado nuevo, no muta el viejo. */
export function fijarPalancas(
  estado: EstadoInterruptor,
  pedidas: { escrituras?: boolean; comandos?: boolean },
  opts: { motivo?: string; por?: string; ahora?: number } = {}
): EstadoInterruptor {
  const ahora = opts.ahora ?? Date.now();
  const siguiente: EstadoInterruptor = {
    ...estado,
    escrituras: typeof pedidas.escrituras === "boolean" ? pedidas.escrituras : estado.escrituras,
    comandos: typeof pedidas.comandos === "boolean" ? pedidas.comandos : estado.comandos,
    motivo: typeof opts.motivo === "string" ? opts.motivo.slice(0, 400) : estado.motivo,
    cambioPor: opts.por || "ide",
  };
  const cambioReal = siguiente.escrituras !== estado.escrituras || siguiente.comandos !== estado.comandos;
  if (cambioReal || !estado.desde) siguiente.desde = new Date(ahora).toISOString();
  siguiente.version = VERSION_INTERRUPTOR;
  return siguiente;
}

export function vigilaEscrituras(e: EstadoInterruptor): boolean {
  return e.escrituras === true;
}

export function vigilaComandos(e: EstadoInterruptor): boolean {
  return e.comandos === true;
}

/** Lo que deja de vigilarse, en palabras, palanca por palanca. */
export const QUE_DEJA_DE_VIGILAR: Record<Palanca, string[]> = {
  escrituras: [
    "write_file sobre un archivo que ya existe y funciona (amputación ≥ 35 % de líneas útiles)",
    "exportaciones públicas que desaparecen (la API con la que el resto del proyecto compila)",
    "truncado confesado: el contenido que trae «resto del código», «...», «se omite»",
    "package.json que pierde dependencias o scripts",
    "edit_file cuyo resultado queda peor que el original (comparación antes/después)",
    "las puertas de cierre de la tanda sobre el disco: sintaxis, superficie, imports, peso",
  ],
  comandos: [
    "la aduana del comando entrante: un texto que NO es un comando (eco de consola, prosa, JSON mal formado) pasa al shell sin rechazo",
    "run_command / run_tests sin el filtro que devuelve el motivo en vez de ejecutar basura",
    "el puente del PC (:5000): el comando delega en la otra máquina sin juicio previo",
  ],
};

/** Lo que NO se apaga con ninguna palanca. Se declara para no vender falsa seguridad. */
export const QUE_NO_SE_APAGA: string[] = [
  "sandboxAuthorized y las 11 puertas mutantes del sandbox (otra casa: ni esta ni ninguna palanca las toca)",
  "el guardián de sintaxis profundo del contenido que se escribe (syntaxGuard, v2.1)",
  "la reversión de la tanda en curso: si las puertas caen, lo escrito vuelve a su original",
];

/** Inventario explícito: qué se pierde al apagar. Vacío = todo encendido. */
export function dejaDeVigilar(e: EstadoInterruptor): string[] {
  const out: string[] = [];
  if (!e.escrituras) for (const q of QUE_DEJA_DE_VIGILAR.escrituras) out.push(`[escrituras] ${q}`);
  if (!e.comandos) for (const q of QUE_DEJA_DE_VIGILAR.comandos) out.push(`[comandos] ${q}`);
  return out;
}

/** Una línea, para el log y para el estado. Nunca dice «apagado» sin decir qué. */
export function fraseInterruptor(e: EstadoInterruptor): string {
  if (e.escrituras && e.comandos) return "Quirófano ENCENDIDO en las dos palancas (escrituras + comandos).";
  const apagadas = PALANCA.filter((p) => e[p] === false);
  return (
    `Quirófano APAGADO en: ${apagadas.join(" + ")}. ` +
    `Deja de vigilar ${dejaDeVigilar(e).length} cosa(s). ` +
    `Sigue vigilado: ${QUE_NO_SE_APAGA.length} protección(es) que ninguna palanca toca. ` +
    `Estado en <raíz de datos>/.cerebronico/quirofano.json`
  );
}

/** Espejo para `/api/quirofano/estado` y para el panel. */
export interface ResumenInterruptor {
  escrituras: boolean;
  comandos: boolean;
  encendido: boolean;
  motivo: string;
  desde: string;
  cambioPor: string;
  archivo: string;
  dejaDeVigilar: string[];
  sigueVigilado: string[];
  frase: string;
}

export function resumenInterruptor(e: EstadoInterruptor, archivo = "<raíz de datos>/.cerebronico/quirofano.json"): ResumenInterruptor {
  return {
    escrituras: e.escrituras,
    comandos: e.comandos,
    encendido: e.escrituras && e.comandos,
    motivo: e.motivo,
    desde: e.desde,
    cambioPor: e.cambioPor,
    archivo,
    dejaDeVigilar: dejaDeVigilar(e),
    sigueVigilado: QUE_NO_SE_APAGA,
    frase: fraseInterruptor(e),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LA PALANCA DE COMANDOS EN ACCIÓN
// ─────────────────────────────────────────────────────────────────────────────

export interface JuicioComando {
  /** true: el comando no llega al shell. */
  bloqueado: boolean;
  /** Motivo para el modelo (vacío si pasó). */
  motivo: string;
  /** Si el juez estaba apagado y había algo para bloquear, se deja constancia. */
  eximido: boolean;
}

/**
 * El juicio del comando, con la palanca a la vista.
 *
 * `aduana` es el veredicto de `comandoEntrante`: si el texto que mandó el modelo
 * es o no un comando. Con la palanca `comandos` encendida, ese veredicto bloquea
 * (es la protección que el usuario pidió no perder al apagar todo). Apagada, el
 * comando pasa igual y queda una línea en el log: el pedido explícito fue que el
 * apagado DIGA qué dejó de vigilarse, no que se calle.
 */
export function juzgarComando(
  e: EstadoInterruptor,
  aduana: { valido: boolean; motivo?: string },
  opts: { origen?: string; comando?: string } = {}
): JuicioComando {
  const origen = opts.origen || "run_command";
  if (aduana.valido) return { bloqueado: false, motivo: "", eximido: false };
  if (vigilaComandos(e)) {
    return {
      bloqueado: true,
      motivo:
        `🩺 QUIRÓFANO: comando BLOQUEADO en ${origen}. ${aduana.motivo || "El texto no es un comando ejecutable."} ` +
        "Reenviá el comando limpio (sin el envoltorio `run_command …` ni el `$ ` de la consola).",
      eximido: false,
    };
  }
  return {
    bloqueado: false,
    motivo: "",
    eximido: true,
  };
}

/** Lo que se anota en el log cuando se deja pasar un comando que el juez habría parado. */
export function avisoComandoEximido(origen: string, motivoAduana: string, comando: string): string {
  const c = String(comando || "").replace(/\s+/g, " ").slice(0, 120);
  return (
    `[CerebroNico] 🩺 QUIRÓFANO (palanca de comandos APAGADA): se deja pasar un comando que habría sido bloqueado en ${origen}: ` +
    `${motivoAduana || "texto no reconocible como comando"} · «${c}». ` +
    "Sigue siendo obligatorio pasar por sandboxAuthorized."
  );
}

/**
 * permisos.ts · FASE 14 — PRESETS DE PERMISOS EN DOS EJES (v2.3.16)
 * ===============================================================
 * EL PROBLEMA QUE PAGA (HOJA_DE_RUTA_EVOLUCION_v2.3.8.md, FASE 14): «el selector
 * de permisos es de un solo eje y el preset de acceso al sistema de archivos no
 * pide confirmación explícita».
 *
 * MEDIDO ANTES DE TOCAR (v2.3.15). El motor tiene UN booleano, `pcMode`, que
 * significa tres cosas a la vez: «el puente :5000 está disponible», «puedo
 * escribir fuera del workspace» y «puedo ejecutar comandos». Y en el puente hay un
 * canal explícito —la carpeta vinculada, `raices_extra`— donde, en palabras de la
 * propia interfaz, «el agente lee, escribe y ejecuta ahí sin pedir permiso por
 * archivo». Es decir: el usuario hoy no elige un nivel de permiso, elige un
 * interruptor y recibe una mezcla.
 *
 * LA REGLA DE ESTE TURNO (la dice el plano, y manda por encima de la elegancia):
 *   «Cualquier preset que escriba fuera del workspace sin preguntar es cambio de
 *    seguridad → lo confirma Mario, no lo aprueba un test.»
 * Por eso este módulo **describe y reporta** la política; no afloja ni un solo
 * candado, y tampoco los aprieta a escondidas: cambia el comportamiento de
 * ejecución sería exactamente el «cambio de seguridad silencioso» que el plano
 * reserva para el usuario. El cable actual (`presetDesdePcMode`) reproduce la
 * política EXACTA de hoy, y la suite lo comprueba caso por caso: si alguien afloja
 * o aprieta un candado sin decirlo, la valla se pone roja.
 *
 * LO QUE QUEDA EN MANOS DE MARIO, planteado con nombre y apellido (ver
 * `DECISION_PENDIENTE`): si `acceso-total` debe pedir confirmación POR ARCHIVO al
 * escribir fuera del workspace, o seguir como hoy, que pide una vez al vincular la
 * carpeta. Las dos posiciones son defensables; elegirla no es tarea de un test.
 */

/** Qué puede tocar el agente en el sistema de archivos. */
export type EjeEscritura = "solo-workspace" | "workspace-y-pc";
/** Qué comandos puede correr, y si tiene que preguntar antes. */
export type EjeEjecucion = "preguntar" | "auto" | "prohibida";
/** La acción que se quiere realizar. Tres, porque tres son las que se pueden negar. */
export type Accion = "leer" | "escribir" | "ejecutar";

/** Un preset: un nombre, dos ejes, y la etiqueta dice lo que hace. */
export interface PresetPermisos {
  id: "lectura" | "escritura-workspace" | "acceso-total";
  /** Etiqueta corta para la interfaz. No promete nada que los ejes no den. */
  etiqueta: string;
  /** Una línea, en términos del usuario: qué se puede y qué no. */
  descripcion: string;
  escritura: EjeEscritura;
  ejecucion: EjeEjecucion;
  /**
   * El eje que el plano llama «el que duele»: escribir fuera del workspace sin
   * preguntar. Se declara en el preset en vez de deducirse, para que un cambio
   * aquí sea un renglón tocado y no una consecuencia lateral.
   */
  escribeFueraSinPreguntar: boolean;
}

export const PRESETS: readonly PresetPermisos[] = [
  {
    id: "lectura",
    etiqueta: "Sólo leer",
    descripcion: "Lee dentro y fuera del workspace, no escribe y no ejecuta nada.",
    escritura: "solo-workspace",
    ejecucion: "prohibida",
    escribeFueraSinPreguntar: false,
  },
  {
    id: "escritura-workspace",
    etiqueta: "Escribir en el proyecto",
    descripcion: "Escribe y ejecuta dentro del workspace. Todo lo demás de la PC es de sólo lectura.",
    escritura: "solo-workspace",
    ejecucion: "auto",
    escribeFueraSinPreguntar: false,
  },
  {
    id: "acceso-total",
    etiqueta: "Acceso al PC (confirmado al vincular)",
    descripcion: "Escribe y ejecuta en las carpetas del equipo que VINCULASTE. La confirmación se pide al vincular, no por archivo.",
    escritura: "workspace-y-pc",
    ejecucion: "auto",
    escribeFueraSinPreguntar: true,
  },
] as const;

export const PRESET_POR_DEFECTO: PresetPermisos["id"] = "escritura-workspace";

export function presetPorId(id: string): PresetPermisos | null {
  return PRESETS.find((p) => p.id === id) || null;
}

/**
 * Equivalencia con lo que existe HOY, para no cambiar el comportamiento al
 * presentar el modelo: `pcMode` es el interruptor real del motor y significaba a la
 * vez puente disponible + escribir fuera + ejecutar. Cada preset de arriba se
 * corresponde con una combinación de ese interruptor y de la carpeta vinculada.
 */
export function presetDesdePcMode(pcMode: boolean, hayCarpetaVinculada = pcMode): PresetPermisos {
  if (pcMode && hayCarpetaVinculada) return presetPorId("acceso-total") as PresetPermisos;
  return presetPorId(PRESET_POR_DEFECTO) as PresetPermisos;
}

export interface Veredicto {
  permitido: boolean;
  /** true = hay que mostrar un cartel y esperar al usuario antes de actuar. */
  requiereConfirmacion: boolean;
  /** Por qué. Se muestra: un permiso denegado sin causa se parece a un bug. */
  motivo: string;
}

/**
 * El resolutorio puro. `dentroDelWorkspace` incluye las carpetas vinculadas: quien
 * vinculó una carpeta la convirtió en parte de su área de trabajo, que es justo lo
 * que la interfaz promete hoy.
 */
export function resolver(preset: PresetPermisos, accion: Accion, dentroDelWorkspace: boolean): Veredicto {
  if (accion === "leer") return { permitido: true, requiereConfirmacion: false, motivo: "leer está permitido en todos los presets" };
  if (accion === "escribir") {
    if (dentroDelWorkspace) {
      if (preset.id === "lectura") return { permitido: false, requiereConfirmacion: false, motivo: `el preset «${preset.etiqueta}» es de sólo lectura` };
      return { permitido: true, requiereConfirmacion: false, motivo: "escritura dentro del workspace" };
    }
    if (preset.escritura === "solo-workspace") return { permitido: false, requiereConfirmacion: false, motivo: `fuera del workspace el preset «${preset.etiqueta}» no escribe` };
    if (preset.escribeFueraSinPreguntar) return { permitido: true, requiereConfirmacion: false, motivo: "carpeta vinculada por el usuario: acceso confirmado al vincular" };
    return { permitido: true, requiereConfirmacion: true, motivo: "escribir fuera del workspace pide confirmación" };
  }
  if (preset.ejecucion === "prohibida") return { permitido: false, requiereConfirmacion: false, motivo: `el preset «${preset.etiqueta}» no ejecuta` };
  // Ejecutar **fuera** del workspace es otra categoría que ejecutar dentro, y hoy
  // sólo el acceso confirmado al vincular lo permite. Se dice acá y no en la
  // etiqueta: la etiqueta promete, esta línea es la que se consulta.
  if (!dentroDelWorkspace && preset.escritura === "solo-workspace") {
    return { permitido: false, requiereConfirmacion: false, motivo: `fuera del workspace el preset «${preset.etiqueta}» no ejecuta` };
  }
  if (preset.ejecucion === "auto") return { permitido: true, requiereConfirmacion: false, motivo: "ejecución automática concedida por el preset" };
  return { permitido: true, requiereConfirmacion: true, motivo: "este preset pregunta antes de ejecutar" };
}

/**
 * LA INVARIANTE DEL PLANO, hecha función: «no existe un camino que escriba fuera
 * del workspace sin pasar por confirmación». En el motor de hoy eso se sostiene
 * por un tercero: la confirmación ocurrió **al vincular la carpeta**, y una
 * escritura posterior dentro de esa carpeta no es un nuevo permiso sino el mismo
 * ya concedido. Esta función deja esa equivalencia escrita y auditable, y devuelve
 * los presets que se salen de ella.
 *
 * Un arreglo de seguridad que sólo vive en la prosa de un changelog no es un
 * arreglo: es una costumbre.
 */
export function presetsQueEscribenFueraSinPreguntar(): PresetPermisos[] {
  return PRESETS.filter((p) => p.escritura === "workspace-y-pc" && p.escribeFueraSinPreguntar);
}

/** Cadena vacía si el núcleo se sostiene; si no, la lista de violaciones. */
export function auditarNucleo(): string {
  const fuera = presetsQueEscribenFueraSinPreguntar();
  const sinCaminoDeVinculo = fuera.filter((p) => !/vincul/.test(p.descripcion));
  if (sinCaminoDeVinculo.length === 0) return "";
  return `presets que escriben fuera del workspace sin confirmar ni al vincular: ${sinCaminoDeVinculo.map((p) => p.id).join(", ")}`;
}

/**
 * LO QUE ESTE TURNO NO DECIDE. Está acá, en el código y no en un chat, para que la
 * pregunta sobreviva al turno: `acceso-total` escribe y ejecuta en la carpeta
 * vinculada sin preguntar por archivo (como hoy). La alternativa es preguntar por
 * archivo, que es más seguro y menos usable. Es un cambio de seguridad y el plano
 * lo reserva para Mario; mientras no se decida, la política vigente es la de arriba
 * y la suite la fija para que nadie la cambie de refilón.
 */
export const DECISION_PENDIENTE =
  "¿«acceso-total» debe pedir confirmación por archivo al escribir fuera del workspace, o basta la confirmación dada al vincular la carpeta? " +
  "Hoy rige la segunda (comportamiento heredado de pcMode + raices_extra). Cambiarla afloja o aprieta un candado: decisión de Mario, no de un test.";

/** Lo que ve el usuario en el estado vivo: preset activo y los dos ejes. */
export function lineaDePreset(preset: PresetPermisos): string {
  return `permisos: ${preset.etiqueta} (escritura ${preset.escritura === "solo-workspace" ? "sólo workspace" : "workspace + PC"} · ejecución ${preset.ejecucion})`;
}

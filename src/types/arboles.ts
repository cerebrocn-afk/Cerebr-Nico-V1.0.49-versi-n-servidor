/**
 * src/types/arboles.ts — v1.60.0 · SISTEMA DE DOBLE ÁRBOL DE ARCHIVOS
 * =============================================================================
 * Modela los archivos del workspace en DOS proyecciones de la MISMA fuente:
 *
 *   · Árbol de ENTRADA (ingesta): todo lo que el usuario arroja al chat,
 *     sube por el explorador o el motor adjunta como objetivo. Es el universo
 *     completo de lo que existe; el usuario lo manipula con libertad.
 *
 *   · Árbol de SANDBOX (runtime): el subconjunto que el motor de IA / la
 *     compilación tienen derecho a LEER y ESCRIBIR. Todo lo demás queda fuera
 *     de su contexto para no pagar tokens por ruido ni «filtrar» archivos que
 *     no pertenecen a la obra en curso.
 *
 * La separación es de PERTENENCIA, no de copia: hay un solo nodo por ruta y un
 * flag (`incluidoEnSandbox`) decide en qué proyección aparece. Así no hay dos
 * verdades del mismo archivo que puedan desincronizarse.
 */

/**
 * De dónde vino el archivo. `sandbox_target` marca un archivo que el motor
 * pidió explícitamente como objetivo de obra: se auto-promueve al sandbox al
 * registrarse (ver `GestorArboles.registrarArchivoEntrada`).
 */
export type OrigenArchivo = "chat_drop" | "explorador_manual" | "sandbox_target";

/** Un archivo del workspace, con los metadatos que separan origen y destino. */
export interface NodoArchivo {
  /** Ruta relativa canonizada (sin `./` ni `/` inicial, separador `/`). */
  pathRelativo: string;
  /** Nombre de hoja (último segmento de la ruta). */
  nombre: string;
  /** Contenido completo del archivo. */
  contenido: string;
  /** De dónde entró al árbol. */
  origen: OrigenArchivo;
  /** ¿Está dentro del sandbox que ve el motor? */
  incluidoEnSandbox: boolean;
  /** Huella determinista del contenido actual (para detectar cambios). */
  hashUltimaModificacion: string;
  /** Tamaño en bytes del contenido (UTF-8). */
  bytes: number;
  /** Marca de registro (epoch ms). Inyectable para pruebas deterministas. */
  registradoEn: number;
}

/** Estado observable de las dos proyecciones (entrada completa + sandbox). */
export interface EstadoArboles {
  /** Universo completo: todo lo registrado, esté o no en sandbox. */
  entrada: NodoArchivo[];
  /** Subconjunto que el motor/compilación pueden tocar. */
  sandbox: NodoArchivo[];
}

/** Veredicto del guardían de escritura del sandbox. */
export interface PermisoEscritura {
  /** ¿Puede el motor escribir esta ruta? */
  permitido: boolean;
  /** Motivo legible cuando se deniega (vacío cuando se permite). */
  motivo: string;
}

/** Datos mínimos para registrar un archivo en el árbol de entrada. */
export interface AltaArchivoEntrada {
  pathRelativo: string;
  contenido: string;
  origen: OrigenArchivo;
  /** Opcional: reloj inyectado para registros deterministas (epoch ms). */
  registradoEn?: number;
}

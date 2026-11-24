/**
 * apkUnClic.ts — «SOLO EXPORTAR APK Y LISTO» (v1.0.21)
 * ===================================================
 * DE DÓNDE SALE: el pedido de Mario — «revisar que la exportación de APK esté
 * bien definida y sea lo más automática posible: solo exportar apk y listo».
 *
 * LO QUE HABÍA (medido en el panel): cuatro botones en fila (1. Generar → 2.
 * Compilar → ⚙ Preparar → 3. Descargar) y, peor, un callejón: si la máquina no
 * tenía toolchain, «Compilar» devolvía 400, el panel lo decía y ESPERABA OTRO
 * CLIC. El pedido de un clic no se cumple con dos clics y un aviso.
 *
 * LO QUE HACE ESTE MÓDULO: decide la secuencia completa —generar proyecto,
 * compilar, pedir toolchain y reintentar— a partir de HECHOS, sin adivinar. Puro:
 * cero red, cero disco, cero spawn. El panel sólo obedece `siguienteAccion`.
 *
 * REGLAS QUE NO SE NEGOCIAN:
 *   · Un APK verificado SIEMPRE gana: si ya hay uno en disco, no se recompila ni
 *     se vuelve a bajar nada. Se ofrece descargar.
 *   · El toolchain se prepara como MÁXIMO UNA VEZ por intento. Si tras
 *     prepararlo vuelve a faltar, se para y se explica la causa real: bajar
 *     herramientas en bucle es cómo se rompe una máquina de 8 GB.
 *   · La descarga automática del APK sólo se dispara si el navegador la va a
 *     aceptar (gesto del usuario). Si no, se deja el enlace: un archivo pedido y
 *     bloqueado por el navegador parece un fallo de la IDE y no lo es.
 */

/** Lo que el servidor contó de la última compilación (o del último sondeo). */
export type EstadoCompilacion =
  | { tipo: "sin-trabajo" }
  | { tipo: "corriendo" }
  | { tipo: "exito"; apkBytes: number }
  | { tipo: "fallo"; causa: string; solucion?: string; faltaToolchain: boolean };

export interface HechosUnClic {
  /** Hay un APK verificado en disco (el servidor lo comprobó, no el log). */
  hayApkVerificado: boolean;
  /** ¿Existe ya la carpeta android/ con su proyecto? (null = no se sabe todavía) */
  proyectoGenerado: boolean | null;
  /** La última compilación, tal como la contó el servidor. */
  compilacion: EstadoCompilacion;
  /** ¿Ya se preparó (o se está preparando) el toolchain en este intento? */
  toolchainIntentado: boolean;
  /** ¿Hace falta el toolchain en esta máquina? (veredictoAndroid de la sonda) */
  faltaToolchainEnMaquina: boolean;
}

export type SiguienteAccion =
  | "descargar"
  | "generar"
  | "compilar"
  | "preparar-toolchain"
  | "esperar"
  | "parar";

export interface PasoUnClic {
  accion: SiguienteAccion;
  /** Se le muestra al usuario tal cual: qué está pasando y por qué. */
  motivo: string;
  /** Texto del único botón, cuando el paso lo necesita. */
  etiquetaBoton?: string;
}

/**
 * El corazón: qué hacer AHORA. Se llama después de cada respuesta del servidor,
 * así que un fallo intermedio (falta el toolchain) no rompe la cadena: la
 * devuelve al carril y sigue sola.
 */
export function siguienteAccion(d: HechosUnClic): PasoUnClic {
  // 1. Un APK verificado en disco es la única verdad que no se discute.
  if (d.hayApkVerificado) {
    return { accion: "descargar", motivo: "APK verificado en disco: no hace falta compilar de nuevo." };
  }
  // 2. Ya hay una compilación viva (la lanzó este botón, el chat o otra pestaña).
  if (d.compilacion.tipo === "corriendo") {
    return { accion: "esperar", motivo: "Hay una compilación en marcha: siguiendo esa, sin lanzar otra." };
  }
  // 3. Terminó bien pero el archivo no está verificado: no se finge éxito.
  if (d.compilacion.tipo === "exito") {
    return {
      accion: "descargar",
      motivo: `Gradle terminó y el servidor verificó el APK (${Math.round(d.compilacion.apkBytes / 1024)} KB).`,
    };
  }
  // 4. Falló por toolchain: prepararlo UNA vez y seguir; si ya se intentó, parar.
  if (d.compilacion.tipo === "fallo" && d.compilacion.faltaToolchain) {
    if (!d.toolchainIntentado) {
      return {
        accion: "preparar-toolchain",
        motivo: "Falta el toolchain (JDK 17 + Gradle + SDK). Lo bajo yo y reintento la compilación: no hace falta otro clic.",
      };
    }
    return {
      accion: "parar",
      motivo:
        "Ya se preparó el toolchain en este intento y sigue faltando. "
        + (d.compilacion.solucion || d.compilacion.causa)
        + " No lo reintento en bucle: eso no arregla la causa y castiga la máquina.",
    };
  }
  // 5. Fallo que NO es de toolchain: se explica y se deja un botón para reintentar.
  if (d.compilacion.tipo === "fallo") {
    return {
      accion: "parar",
      motivo: d.compilacion.causa + (d.compilacion.solucion ? ` → ${d.compilacion.solucion}` : ""),
      etiquetaBoton: "Reintentar",
    };
  }
  // 6. Sin trabajo previo: si ni el proyecto existe, generarlo; si existe, compilar.
  if (d.proyectoGenerado === false) {
    return { accion: "generar", motivo: "Generando el proyecto android/ del proyecto abierto…" };
  }
  if (d.faltaToolchainEnMaquina && !d.toolchainIntentado) {
    return {
      accion: "preparar-toolchain",
      motivo: "Esta máquina no tiene cómo compilar todavía: preparo JDK 17 + Gradle + SDK y sigo sola.",
    };
  }
  return { accion: "compilar", motivo: "Lanzando Gradle (assembleDebug) sobre el proyecto android/…" };
}

/**
 * ¿El navegador va a aceptar la descarga automática? Solo si nació de un gesto
 * del usuario en ESTA pestaña y ya hubo alguna interacción con la página.
 * (Un <a download> disparado desde un temporizador lo bloquean Chrome y Safari.)
 */
export function descargaAutomaticaPermitida(interaccionUsuario: boolean, gestoDelUsuario: boolean): boolean {
  return interaccionUsuario && gestoDelUsuario;
}

/** Un intento por toolchain y por sesión de clic: ni dos, ni bucle. */
export function cuentaToolchain(toolchainIntentado: boolean, accion: SiguienteAccion): boolean {
  return toolchainIntentado || accion === "preparar-toolchain";
}

/**
 * apkBuild.ts — CONSTRUIR EL APK SIN MENTIR (v1.56.9 · el botón exportar→APK)
 * ============================================================================
 * DE DÓNDE SALE: el pedido de Mario — «que la propia IDE haga esto sola (exportar →
 * APK con un clic)». El generador (`androidProyecto.ts`) ya escribe el proyecto y
 * el sondeo (`mobileExport.ts`) ya sabe qué herramientas hay. Lo que faltaba es la
 * parte que NO se puede improvisar: ejecutar Gradle y decir la verdad cuando falla.
 *
 * LA TRAMPA QUE ESTE MÓDULO CIERRA: el proyecto generado VIAJA SIN
 * `gradle-wrapper.jar` a propósito (el motor no emite binarios que no puede
 * verificar). Un botón que hiciera `gradlew assembleDebug` a ciegas daría, en
 * Windows, un críptico `ERROR: Could not find or load main class
 * org.gradle.wrapper.GradleWrapperMain` que el usuario no sabe leer. Así que aquí
 * primero se MIRÓ qué hay (wrapper completo, gradlew suelto, gradle del sistema) y
 * se ejecuta lo que existe, o se dice qué falta con la solución concreta.
 *
 * Puro: recibe hechos, devuelve decisiones y textos. Cero spawn, cero disco. Los
 * tests corren sin Android, sin Java y sin red — igual que el resto de la casa.
 */

// v1.0.14 · nueva ruta «gradle-local»: el Gradle que la PROPIA IDE bajó con
// «Preparar herramientas» (server/aprovisionarToolchain.ts). Es tan legítimo
// como el del sistema — la diferencia es quién lo puso en el disco.
export type RutaBuild = "wrapper" | "gradle-sistema" | "gradle-local" | "ninguna";

export interface HechosBuild {
  existeGradlew: boolean;      // el script (gradlew o gradlew.bat)
  existeWrapperJar: boolean;   // gradle/wrapper/gradle-wrapper.jar — sin esto, gradlew MIENTE
  tieneGradleSistema: boolean; // `gradle -v` respondió
  /** v1.0.14 · hay Gradle aprovisionado por la IDE (toolchainPlan). */
  gradleLocal?: { existe: boolean; ruta?: string };
}

export interface DecisionBuild {
  ruta: RutaBuild;
  /** Lo que se va a spawnear. Vacío si no hay forma legítima. */
  comando: string;
  argumentos: string[];
  /** Por qué esta ruta; se muestra tal cual en la UI. */
  explicacion: string;
}

/**
 * Elegir cómo invocar Gradle SEGÚN LO QUE HAY, no según lo que debería haber.
 *
 * El wrapper sin su jar es el caso que rompe ilusiones: `gradlew` existe, parece
 * listo, y falla con un mensaje de Java que no dice «te falta un archivo». Por eso
 * `existeGradlew` y `existeWrapperJar` son hechos SEPARADOS y el wrapper solo se
 * elige cuando ambos se cumplen.
 */
export function elegirRutaDeBuild(h: HechosBuild, platform: NodeJS.Platform = process.platform): DecisionBuild {
  const esWin = platform === "win32";
  if (h.existeGradlew && h.existeWrapperJar) {
    return {
      ruta: "wrapper",
      // En Windows un .bat no se puede spawnear directo (EINVAL desde los parches
      // de seguridad de Node): se pasa por cmd /c. Los argumentos son fijos — no
      // hay entrada del usuario en esta línea de comandos.
      comando: esWin ? "cmd" : "./gradlew",
      argumentos: esWin ? ["/c", "gradlew.bat", "assembleDebug"] : ["assembleDebug"],
      explicacion: "Usando el wrapper del proyecto (gradlew + jar verificados).",
    };
  }
  if (h.existeGradlew && !h.existeWrapperJar) {
    // gradlew existe pero su jar no: NO es una ruta ejecutable. Caer a gradle del
    // sistema si está; si no, decirlo con la causa real.
    if (h.tieneGradleSistema) {
      return {
        ruta: "gradle-sistema",
        // El guardián de resiliencia señaló el `esWin ? "gradle" : "gradle"` (ramas
        // idénticas = ternario decorativo) y tenía razón, pero la respuesta NO era
        // borrarlo: el router hace spawn con `shell: false`, y en Windows `gradle`
        // es un .bat que Node se niega a spawear directo (el mismo EINVAL del
        // wrapper). Las ramas ahora SÍ difieren, como difieren los sistemas.
        comando: esWin ? "cmd" : "gradle",
        argumentos: esWin ? ["/c", "gradle", "assembleDebug"] : ["assembleDebug"],
        explicacion:
          "El wrapper del proyecto no trae `gradle-wrapper.jar` (el motor no emite "
          + "binarios), así que se usa el Gradle instalado en el sistema.",
      };
    }
    return {
      ruta: "ninguna",
      comando: "",
      argumentos: [],
      explicacion:
        "No hay forma legítima de construir todavía: `gradlew` existe pero le falta "
        + "`gradle-wrapper.jar`, y no hay `gradle` en el PATH. Abrí la carpeta "
        + "`android/` una vez en Android Studio (sincronizar regenera el wrapper) o "
        + "instalá Gradle. Después de eso este botón funciona solo.",
    };
  }
  if (h.tieneGradleSistema) {
    return {
      ruta: "gradle-sistema",
      comando: esWin ? "cmd" : "gradle",
      argumentos: esWin ? ["/c", "gradle", "assembleDebug"] : ["assembleDebug"],
      explicacion: "Usando el Gradle del sistema (el proyecto aún no tiene wrapper).",
    };
  }
  // v1.0.14 · EL GRADLE DE LA PROPIA IDE. `gradle-local` viene del botón
  // «Preparar herramientas»: un binario verificado en disco bajo la raíz de
  // datos, con JAVA_HOME/ANDROID_HOME inyectados por la fábrica en el spawn.
  // En Windows el .bat también pasa por cmd (el mismo EINVAL de siempre).
  if (h.gradleLocal?.existe && h.gradleLocal.ruta) {
    return {
      ruta: "gradle-local",
      comando: esWin ? "cmd" : h.gradleLocal.ruta,
      argumentos: esWin ? ["/c", h.gradleLocal.ruta, "assembleDebug"] : ["assembleDebug"],
      explicacion: "Usando el Gradle que aprovisionó la propia IDE (Preparar herramientas).",
    };
  }
  return {
    ruta: "ninguna",
    comando: "",
    argumentos: [],
    explicacion:
      "No hay forma legítima de construir todavía: sin wrapper completo, sin Gradle "
      + "en el sistema y sin toolchain aprovisionado. La solución ya NO es buscar "
      + "Android Studio: pulsá «Preparar herramientas (una vez)» en este panel "
      + "(POST /api/export/android/provision) y la IDE baja JDK 17 + Gradle + SDK "
      + "a la carpeta de datos; después «Compilar APK» funciona solo.",
  };
}

export interface CausaFallo {
  id: "sdk" | "jdk" | "red" | "licencias" | "memoria" | "desconocido";
  causa: string;
  solucion: string;
}

/**
 * CLASIFICAR EL FALLO, no mostrar 400 líneas de stack.
 *
 * Orden importa: «SDK location not found» también menciona JAVA y «licen[cs]e»
 * aparece en textos ajenos; los patrones van de más específico a más general y el
 * primero que gana se muestra CON su solución concreta. Cada patrón es literal de
 * la salida real de Gradle 8/9 con AGP (probado al compilar el DEMO de esta casa).
 */
export function clasificarFalloBuild(salida: string): CausaFallo {
  const s = String(salida || "");
  if (/SDK location not found|ANDROID_HOME is not set|failed to find target with hash string|license accepted/i.test(s)) {
    return {
      id: "sdk",
      causa: "Gradle no encuentra el SDK de Android.",
      solucion:
        "Abrí Android Studio una vez (Configura → SDK) o exportá ANDROID_HOME apuntando "
        + "a la carpeta del SDK (en Windows suele ser C:\\Users\\TU\\AppData\\Local\\Android\\Sdk).",
    };
  }
  // `JAVA_COMPILER` es literal de la salida que NOS DIO el primer build real del
  // demo: un JRE sin javac pasa el sondeo de `java -version` y Gradle lo descubre
  // tarde. Clasificarlo aquí convierte 40 líneas de stack en una frase accionable.
  if (/JAVA_HOME is not set|Could not determine java version|invalid source release|Unsupported class file major version|JAVA_COMPILER|does not provide the required capabilities/i.test(s)) {
    return {
      id: "jdk",
      causa: "El JDK no está bien configurado: falta, es un JRE sin compilador, o es demasiado viejo para este AGP.",
      solucion:
        "Android Studio trae su propio JDK: Settings → Build Tools → Gradle → Gradle JDK, "
        + "y elegí el que termine en '-jbr' (JDK 17 o superior).",
    };
  }
  if (/could not resolve|no cached version|Connection refused|Read timed out|UnknownHostException|Could not GET/i.test(s)) {
    return {
      id: "red",
      causa: "Gradle no pudo descargar dependencias (red o repositorio).",
      solucion:
        "Revisá la conexión y reintentá. Si estás detrás de proxy: gradle.properties con "
        + "systemProp.http(s).proxyHost/proxyPort. La primera vez baja AGP y puede tardar.",
    };
  }
  if (/licen[cs]e|Accepting|android-sdk-license/i.test(s)) {
    return {
      id: "licencias",
      causa: "Faltan licencias del SDK sin aceptar.",
      solucion: "Ejecutá `sdkmanager --licenses` y aceptá todo (o dejá que Android Studio lo haga al instalar la plataforma).",
    };
  }
  if (/OutOfMemoryError|Daemon .* stopped|GC overhead/i.test(s)) {
    return {
      id: "memoria",
      causa: "Gradle se quedó sin memoria.",
      solucion: "En android/gradle.properties: org.gradle.jvmargs=-Xmx2g (bajalo a 1536m si la máquina tiene 8 GB).",
    };
  }
  return {
    id: "desconocido",
    causa: "Gradle falló y la salida no coincide con ninguna causa conocida.",
    solucion: "Copiá las últimas líneas del log al chat y lo vemos; no lo borres, es la única pista.",
  };
}

/** Dónde cae el APK, relativo a la carpeta del proyecto del usuario. Fijo, sin adivinar. */
export function rutaRelApkDebug(carpetaProyecto = "android"): string {
  return `${carpetaProyecto}/app/build/outputs/apk/debug/app-debug.apk`;
}

/** Verdad binaria: ¿terminó bien? (estado + archivo presente; el nombre NO se inventa) */
export function apkVerificado(existeEnDisco: boolean, bytes: number): { ok: boolean; mensaje: string } {
  if (!existeEnDisco) {
    return { ok: false, mensaje: "Gradle dijo éxito pero el APK no está en la ruta esperada: algo mintió arriba." };
  }
  if (bytes < 10_000) {
    return { ok: false, mensaje: `El APK pesa ${bytes} bytes: demasiado chico para ser real.` };
  }
  return { ok: true, mensaje: `APK construido y verificado en disco (${Math.round(bytes / 1024)} KB).` };
}

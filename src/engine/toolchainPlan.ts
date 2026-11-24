/**
 * toolchainPlan.ts — EL PLAN HONESTO DE LAS HERRAMIENTAS DEL APK (v1.0.14)
 * =========================================================================
 * RAÍZ (Mario, 10/11, capturas de la sesión 1794293050619): «Compilar APK»
 * respondía «No encuentro ni el wrapper del proyecto ni un Gradle en el
 * sistema… abrí Android Studio». En la máquina limpia de Mario eso es un callejón:
 * no hay JDK, no hay SDK, no hay Gradle. La fábrica se negaba (con razón) a
 * fingir un build — pero no tenía camino para CONSEGUIR las herramientas.
 *
 * Este módulo es la parte PURA de ese camino: el QUÉ hace falta, en qué ORDEN,
 * desde qué URL y dónde se guarda. Los efectos (bajar, descomprimir, correr
 * sdkmanager) viven en `server/aprovisionarToolchain.ts`. Ninguna decisión de
 * este archivo se toma «por optimismo»: todo se verifica contra disco con una
 * sonda inyectada, igual que el resto de la casa.
 *
 * REGLAS DE LA CASA
 *  1) El auto-aprovisionamiento baja cosas a `<raíz de datos>/.cerebronico/
 *     herramientas/` y NUNCA toca el PATH del sistema ni instala en `C:\Program
 *     Files`. Lo que se baja es propiedad de la IDE y se puede borrar sin dolor.
 *  2) Cada URL es pública y conocida (Adoptium, services.gradle.org,
 *     dl.google.com). Se puede forzar la contraria con CN_JDK_URL /
 *     CN_GRADLE_URL / CN_CMDLINE_URL (redes corporativas, proxies, espejos).
 *  3) La descarga no es un éxito hasta que la sonda ve el EJECUTABLE dentro de
 *     la carpeta descomprimida. Un zip a medias se anuncia como fallo.
 */
import { GRADLE_VERSION, SDK_COMPILACION } from "./androidProyecto";

export type So = "win32" | "darwin" | "linux";

/** Versión de JDK que pide AGP 9.x (Android Gradle Plugin ≥ 8 requiere JDK 17). */
export const JDK_FEATURE = "17";

/**
 * Builds conocidos de commandlinetools, en orden de intento. Google cambia el
 * número con cada release y NO publica un alias fijo por build; la lista es la
 * defensa razonable y el override por entorno (CN_CMDLINE_URL) es la salida
 * honesta cuando la máquina está en 2027 y estos dos quedaron viejos.
 */
export const CMDLINE_BUILDS = ["13114708", "11076708"] as const;

export interface RutasHerramientas {
  raiz: string;
  jdkDir: string;
  gradleHome: string;
  /** Ejecutable de Gradle para ESTE SO (win32: .bat). */
  gradleBin: string;
  cmdlineDir: string;
  sdkDir: string;
  sdkManagerBin: string;
}

export function nombreSo(so: So): "windows" | "linux" | "mac" {
  return so === "win32" ? "windows" : so === "linux" ? "linux" : "mac";
}

/** Extensión del paquete local por SO (zip donde el bsdtar de Windows alcanza). */
export function formatoPaquete(so: So): "zip" | "tar.gz" {
  return so === "win32" ? "zip" : "tar.gz";
}

/** Dónde caerá cada pieza UNA VEZ aprovisionada (el plano, no la realidad). */
export function rutasHerramientas(raizHerramientas: string, so: So): RutasHerramientas {
  const sep = so === "win32" ? "\\" : "/";
  const j = (...p: string[]) => p.join(sep);
  return {
    raiz: raizHerramientas,
    jdkDir: j(raizHerramientas, "jdk-" + JDK_FEATURE),
    gradleHome: j(raizHerramientas, "gradle-" + GRADLE_VERSION),
    gradleBin: so === "win32"
      ? j(raizHerramientas, "gradle-" + GRADLE_VERSION, "bin", "gradle.bat")
      : j(raizHerramientas, "gradle-" + GRADLE_VERSION, "bin", "gradle"),
    cmdlineDir: j(raizHerramientas, "cmdline-tools"),
    sdkDir: j(raizHerramientas, "android-sdk"),
    sdkManagerBin: so === "win32"
      ? j(raizHerramientas, "cmdline-tools", "cmdline-tools", "bin", "sdkmanager.bat")
      : j(raizHerramientas, "cmdline-tools", "cmdline-tools", "bin", "sdkmanager"),
  };
}

/** Qué pieza falta, medida con la sonda que traiga el llamante (fs en servidor, mapa en tests). */
export interface FaltanHerramientas {
  jdk: boolean;
  gradle: boolean;
  cmdline: boolean;
  sdkPlataforma: boolean;
}

export function faltanHerramientas(
  r: RutasHerramientas,
  so: So,
  existe: (p: string) => boolean,
  opciones: { sistemaJava?: boolean; sistemaGradle?: boolean } = {},
): FaltanHerramientas {
  const javaBin = so === "win32" ? `${r.jdkDir}\\bin\\java.exe` : `${r.jdkDir}/bin/java`;
  const plataforma = `${r.sdkDir}${so === "win32" ? "\\" : "/"}platforms${so === "win32" ? "\\" : "/"}android-${SDK_COMPILACION}`;
  return {
    jdk: !opciones.sistemaJava && !existe(javaBin),
    gradle: !opciones.sistemaGradle && !existe(r.gradleBin),
    cmdline: !existe(r.sdkManagerBin),
    sdkPlataforma: !existe(plataforma),
  };
}

export interface PasoPlan {
  id: "jdk" | "gradle" | "cmdline" | "sdk-paquetes";
  que: string;
  /** URL de descarga (los paquetes de sdkmanager se instalan por sdkmanager, sin URL propia). */
  url?: string;
  /**_BYTES aproximados del paquete, para el aviso honesto de cuánto se descarga. */
  pesoNota: string;
}

export function urlsDeDescarga(so: So, env: Record<string, string | undefined> = process.env as any): { jdk: string; gradle: string; cmdline: string[] } {
  const sO = nombreSo(so);
  // Adoptium redirige (302) al archivo real: zip en Windows, tar.gz en el resto.
  // `fetch` sigue la redirección sola; el nombre local se fija con formatoPaquete.
  const jdk = env.CN_JDK_URL || `https://api.adoptium.net/v3/binary/latest/${JDK_FEATURE}/hotspot/jdk/${sO}/x64`;
  const gradle = env.CN_GRADLE_URL || `https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`;
  if (env.CN_CMDLINE_URL) return { jdk, gradle, cmdline: [env.CN_CMDLINE_URL] };
  const plataforma = so === "win32" ? "win" : so === "linux" ? "linux" : "mac";
  const cmdline = CMDLINE_BUILDS.map((b) => `https://dl.google.com/android/repository/commandlinetools-${plataforma}-${b}_latest.zip`);
  return { jdk, gradle, cmdline };
}

/**
 * El plan EN ORDEN: sin JDK no hay sdkmanager ni Gradle útil, así que Java va
 * primero. Cada paso dice QUÉ hace y CUÁNTO pesa (más o menos), porque bajar
 * ~500 MB sin avisar es una grosería con la conexión del usuario.
 */
export function planDeAprovisionamiento(f: FaltanHerramientas, so: So, env?: Record<string, string | undefined>): PasoPlan[] {
  const u = urlsDeDescarga(so, env);
  const pasos: PasoPlan[] = [];
  if (f.jdk) pasos.push({ id: "jdk", que: `Bajar JDK ${JDK_FEATURE} (Adoptium Temurin)`, url: u.jdk, pesoNota: "~190 MB" });
  if (f.gradle) pasos.push({ id: "gradle", que: `Bajar Gradle ${GRADLE_VERSION}`, url: u.gradle, pesoNota: "~135 MB" });
  if (f.cmdline) pasos.push({ id: "cmdline", que: "Bajar Android command-line tools", url: u.cmdline[0], pesoNota: "~150 MB" });
  if (f.cmdline || f.sdkPlataforma) pasos.push({
    id: "sdk-paquetes",
    que: `Instalar platform-tools, platforms;android-${SDK_COMPILACION} y build-tools;${SDK_COMPILACION}.0.0 con sdkmanager (licencias aceptadas en el proceso)`,
    pesoNota: "~200 MB",
  });
  return pasos;
}

/** Cuánto se va a bajar, en palabras, para el aviso ANTES del clic. */
export function pesoTotal(pasos: PasoPlan[]): string {
  const mb = pasos.reduce((a, p) => a + (Number(String(p.pesoNota).replace(/[^0-9]/g, "")) || 0), 0);
  return mb ? `~${mb} MB en total (una sola vez; queda cacheado)` : "sin descargas";
}

/** Contenido de `android/local.properties` para que Gradle encuentre el SDK. */
export function localPropertiesContenido(sdkDir: string): string {
  const escapada = sdkDir.replace(/\\/g, "\\\\");
  return `# Generado por CerebroNico (v1.0.14) — toolchain aprovisionado por la propia IDE.\nsdk.dir=${escapada}\n`;
}

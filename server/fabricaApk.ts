// ============================================================
// FABRICA APK — v1.57.17 · EL MISMO MOTOR PARA EL BOTÓN Y PARA EL CHAT
// ============================================================
// Hasta hoy, exportar un APK era privilegio de la interfaz: las rutas
// /api/export/android/* vivían en exportacion.ts con su estado de trabajo en
// closures, y el AGENTE no tenía manos — en la sesión de la app de finanzas,
// ante «exportame en apk», recetó Capacitor por chat como si la fábrica no
// existiera. Este módulo extrae la fábrica SIN Duplicar el trabajo:
//
//   · UN solo trabajo vivo de Gradle (el botón y el chat pelean por el mismo
//     slot: dos compilaciones simultáneas en una máquina de 16 GB es una forma
//     creativa de tumbar la IDE del usuario — la regla nace de la ruta original);
//   · el sondeo de herramientas (java/SDK/wrapper) es UNA función, no dos copias
//     que se desincronizan;
//   · generar desde el chat pasa por los mismos guardes que la ruta: web
//     compilada, index.html presente, appId válido — el modelo no puede
//     atropellar los candados del humano.
//
// La lógica de DECISIÓN (qué ruta de build elegir, clasificar fallos, verificar
// el APK) ya era pura en src/engine/apkBuild; acá solo vive la orquestación con
// efectos, con `spawn` inyectable para poder probarla en seco.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "child_process";
import { elegirRutaDeBuild, clasificarFalloBuild, rutaRelApkDebug, apkVerificado } from "../src/engine/apkBuild";
// v1.0.14 · el Gradle que la propia IDE baja («Preparar herramientas») es una
// ruta legítima más de la fábrica: mismo spawn, mismos candados, mismo log.
import { rutasProvisionadas, herramientasDirActiva } from "./aprovisionarToolchain";
import { localPropertiesContenido } from "../src/engine/toolchainPlan";
import { analizarProyecto, veredictoAndroid, appIdValido, appIdDesdeNombre } from "../src/engine/mobileExport";
import {
  generarProyectoAndroid, escribirProyectoAndroid, leerWebParaAndroid,
  orientacionValida, AGP_VERSION, GRADLE_VERSION,
} from "../src/engine/androidProyecto";

// ── sondeo e inventario del sandbox ────────────────────────────────────────

/** Sondeo REAL de la máquina. Con pruebas, no con optimismo. */
export function sondearHerramientasAndroid(projectRoot: string) {
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  let javaVersion = "";
  try {
    const r = spawnSync("java", ["-version"], { encoding: "utf-8", timeout: 5000, windowsHide: true });
    // `java -version` escribe en stderr, no en stdout: esto no es un error.
    javaVersion = `${r.stderr || ""}${r.stdout || ""}`.split("\n")[0].trim();
  } catch { javaVersion = ""; }
  let plataformasSdk: string[] = [];
  if (androidHome) {
    try { plataformasSdk = fs.readdirSync(path.join(androidHome, "platforms")); } catch { plataformasSdk = []; }
  }
  const proyectoAndroid =
    fs.existsSync(path.join(projectRoot, "android", "gradlew")) ||
    fs.existsSync(path.join(projectRoot, "android", "gradlew.bat"));
  const adb = androidHome
    ? fs.existsSync(path.join(androidHome, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"))
    : false;
  return { nodeVersion: process.versions.node, javaVersion, androidHome, plataformasSdk, tieneGradle: proyectoAndroid, tieneAdb: adb };
}

/** Qué proyecto hay en el sandbox ahora mismo (la misma lectura que hace la ruta). */
export function leerProyectoSandbox(projectRoot: string) {
  let packageJson: string | null = null;
  try { packageJson = fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"); } catch { packageJson = null; }
  let archivosRaiz: string[] = [];
  try { archivosRaiz = fs.readdirSync(projectRoot); } catch {}
  return analizarProyecto({ packageJson, archivosRaiz });
}

// ── el trabajo de compilación: UNO vivo, cola acotada ──────────────────────

export interface TrabajoApk {
  id: string;
  estado: "corriendo" | "exito" | "fallido";
  inicio: number;
  fin?: number;
  lineas: string[];
  codigo?: number;
  fallo?: { causa: string; solucion: string };
  apk?: { ruta: string; bytes: number };
  explicacionRuta: string;
  rutaGradle: string;
}

const MAX_LINEAS = 400; // cola acotada por el final: el log puede ser kilométrico
const LIMITE_MS = 10 * 60 * 1000; // 10 min: si Gradle no terminó, algo está podrido

let trabajoVivo: TrabajoApk | null = null;
const TRABAJOS: TrabajoApk[] = [];
// El id lleva SECUIAL además del reloj: dos lanzamientos dentro del mismo
// milisegundo (test, doble clic nervioso) chocaban y buscar devolvía el trabajo
// viejo — la suite exportarApk lo cazó. Un id no puede ser una promesa ambigua.
let secuencialId = 0;

function empujarLinea(t: TrabajoApk, chunk: string) {
  for (const l of String(chunk).split(new RegExp("\\r?\\n"))) {
    if (!l.trim()) continue;
    t.lineas.push(l);
    if (t.lineas.length > MAX_LINEAS) t.lineas.splice(0, t.lineas.length - MAX_LINEAS);
  }
}

export function trabajoVivoApk(): TrabajoApk | null { return trabajoVivo; }
export function ultimoTrabajoApk(): TrabajoApk | null { return TRABAJOS.length ? TRABAJOS[TRABAJOS.length - 1] : null; }
export function buscarTrabajoApk(id: string): TrabajoApk | null { return TRABAJOS.find((x) => x.id === id) || null; }

export interface LanzamientoResultado {
  ok: boolean;
  yaEnMarcha?: boolean;
  error?: string;
  trabajo?: TrabajoApk;
  hechos?: { existeGradlew: boolean; existeWrapperJar: boolean; tieneGradleSistema: boolean; gradleLocalExiste?: boolean };
}

/**
 * Lanza la compilación Gradle (o devuelve la que ya está viva). `spawnFn` y
 * `probeGradle` son inyectables para probar el ciclo completo en seco.
 */
export function lanzarCompilacionApk(
  projectRoot: string,
  deps: { spawnFn?: typeof spawn; probeGradleSistema?: () => boolean; herramientasDir?: string } = {},
): LanzamientoResultado {
  if (trabajoVivo && trabajoVivo.estado === "corriendo") {
    return { ok: true, yaEnMarcha: true, trabajo: trabajoVivo };
  }
  const carpeta = path.join(projectRoot, "android");
  if (!fs.existsSync(path.join(carpeta, "app", "build.gradle"))) {
    return {
      ok: false,
      error:
        "No hay proyecto Android que compilar (falta android/app/build.gradle). " +
        "Pulsá antes «Generar proyecto» — sin eso, Gradle solo daría un error críptico.",
    };
  }
  // v1.0.14 · ANTES de rendirse, mirar la carpeta de datos: quizá el usuario ya
  // pulsó «Preparar herramientas» y el Gradle propio de la IDE está en disco.
  const dirHerr = deps.herramientasDir || herramientasDirActiva();
  const provision = dirHerr ? rutasProvisionadas(dirHerr) : null;
  const hechos = {
    existeGradlew: fs.existsSync(path.join(carpeta, "gradlew")) || fs.existsSync(path.join(carpeta, "gradlew.bat")),
    existeWrapperJar: fs.existsSync(path.join(carpeta, "gradle", "wrapper", "gradle-wrapper.jar")),
    tieneGradleSistema: deps.probeGradleSistema
      ? deps.probeGradleSistema()
      : (() => {
          try {
            const r = spawnSync("gradle", ["-v"], { encoding: "utf-8", timeout: 8000, windowsHide: true });
            return r.status === 0;
          } catch { return false; }
        })(),
    gradleLocal: { existe: !!provision?.gradle, ruta: provision?.gradle ? provision.rutas.gradleBin : undefined },
  };
  const decision = elegirRutaDeBuild(hechos);
  if (decision.ruta === "ninguna") {
    return { ok: false, error: decision.explicacion, hechos };
  }

  const trabajo: TrabajoApk = {
    id: `apk-${Date.now()}-${++secuencialId}`,
    estado: "corriendo",
    inicio: Date.now(),
    lineas: [],
    explicacionRuta: decision.explicacion,
    rutaGradle: decision.ruta,
  };
  trabajoVivo = trabajo;
  TRABAJOS.push(trabajo);
  if (TRABAJOS.length > 20) TRABAJOS.splice(0, TRABAJOS.length - 20);

  const cerrar = (extra: Partial<TrabajoApk>) => {
    trabajo.estado = extra.estado || "fallido";
    trabajo.fin = Date.now();
    Object.assign(trabajo, extra);
    if (trabajoVivo === trabajo) trabajoVivo = null;
  };

  const spawnFn = deps.spawnFn || spawn;
  // v1.0.14 · con `gradle-local` la máquina no tiene nada instalado: el spawn
  // tiene que llevarse su propio JAVA_HOME/ANDROID_HOME/PATH (el toolchain que
  // bajó la IDE) y `android/local.properties` para que AGP vea el SDK. Se
  // escribe el archivo SOLO cuando el SDK es el aprovisionado: si el usuario
  // tiene el suyo, manda el suyo — no pise config ajena.
  let entorno: NodeJS.ProcessEnv = { ...process.env };
  if (decision.ruta === "gradle-local" && provision) {
    const sep = process.platform === "win32" ? ";" : ":";
    if (provision.jdk) {
      entorno.JAVA_HOME = provision.rutas.jdkDir;
      entorno.PATH = `${path.join(provision.rutas.jdkDir, "bin")}${sep}${entorno.PATH || ""}`;
    }
    entorno.ANDROID_HOME = provision.androidHome;
    entorno.ANDROID_SDK_ROOT = provision.androidHome;
    try { fs.writeFileSync(path.join(carpeta, "local.properties"), localPropertiesContenido(provision.androidHome), "utf-8"); } catch { /* Gradle también lee ANDROID_HOME: no es fatal */ }
  }
  let child;
  try {
    child = spawnFn(decision.comando, decision.argumentos, {
      cwd: carpeta,
      env: entorno,
      shell: false, // argumentos FIJOS: no hay entrada del usuario en esta línea
      windowsHide: true,
    });
  } catch (e: any) {
    const f = clasificarFalloBuild(String(e?.message || e));
    cerrar({ estado: "fallido", codigo: -1, fallo: f });
    return { ok: false, error: `No se pudo lanzar Gradle: ${e?.message || e}`, trabajo };
  }

  child.stdout?.on("data", (d) => empujarLinea(trabajo, String(d)));
  child.stderr?.on("data", (d) => empujarLinea(trabajo, String(d)));
  child.on("error", (e: any) => {
    empujarLinea(trabajo, `⚠ ${e?.message || e}`);
    cerrar({ estado: "fallido", codigo: -1, fallo: clasificarFalloBuild(String(e?.message || e)) });
  });

  const matar = setTimeout(() => {
    if (trabajo.estado === "corriendo") {
      empujarLinea(trabajo, "⏱ 10 minutos: se cortó el proceso. Gradle colgado o máquina sin aire.");
      try { child.kill("SIGKILL"); } catch {}
      cerrar({
        estado: "fallido",
        fallo: {
          causa: "La compilación superó los 10 minutos y se cortó.",
          solucion: "Suele ser la primera vez: Gradle baja AGP y dependencias. Conectá bien y reintentá; si vuelve a colgarse, mirá android/.gradle.",
        },
      });
    }
  }, LIMITE_MS);
  if (typeof matar?.unref === "function") matar.unref();

  child.on("close", (code) => {
    clearTimeout(matar);
    // ÉXITO = código 0 Y archivo presente Y con tamaño creíble. Las tres cosas:
    // Gradle puede decir éxito y no dejar APK (config rara), y un APK de 3 KB es
    // un archivo corrupto anunciándose como verde.
    const rutaApk = path.join(projectRoot, rutaRelApkDebug("android"));
    let verif = { ok: false, mensaje: "sin APK" };
    try {
      const st = fs.statSync(rutaApk);
      verif = apkVerificado(true, st.size);
      if (verif.ok) trabajo.apk = { ruta: rutaApk, bytes: st.size };
    } catch {
      verif = apkVerificado(false, 0);
    }
    if (code === 0 && verif.ok) {
      cerrar({ estado: "exito", codigo: 0 });
    } else {
      const cola = trabajo.lineas.slice(-40).join("\n") + (verif.ok ? "" : `\n${verif.mensaje}`);
      cerrar({ estado: "fallido", codigo: code ?? -1, fallo: clasificarFalloBuild(cola) });
    }
  });

  return { ok: true, trabajo, hechos };
}

// ── generar el proyecto: los mismos candados de la ruta, sin HTTP ─────────

export interface CuerpoGenerar {
  appId?: string; nombreApp?: string; versionName?: string; versionCode?: number;
  colorPrimario?: string; orientacion?: string; necesitaRed?: boolean; forzar?: boolean;
}

export function generarAndroidDesdeChat(projectRoot: string, cuerpo: CuerpoGenerar = {}): { ok: boolean; error?: string; message?: string; [k: string]: any } {
  const proyecto = leerProyectoSandbox(projectRoot);
  if (!proyecto.exportableAAndroid) return { ok: false, error: proyecto.razon };

  const pedido = String(cuerpo.appId || "").trim();
  const appId = pedido || appIdDesdeNombre(proyecto.nombre);
  if (!appIdValido(appId)) {
    return {
      ok: false,
      error:
        `«${appId}» no sirve como appId de Android: dominio al revés, en minúsculas, sin empezar por número ` +
        `(ejemplo: com.tunombre.${proyecto.nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "app"}).`,
    };
  }

  // La web tiene que estar COMPILADA: generar con la web anterior daría un APK
  // verde que empaqueta cosas viejas.
  const leido = leerWebParaAndroid(path.join(projectRoot, proyecto.carpetaSalida));
  if (!leido.raiz) {
    return {
      ok: false,
      error:
        `No encontré la carpeta de salida «${proyecto.carpetaSalida}». Compila la web antes de exportar` +
        (proyecto.comandoBuild ? ` («${proyecto.comandoBuild}»)` : "") +
        `. Sin esto el APK saldría con una versión anterior o en blanco.`,
    };
  }
  if (!leido.texto.some((f) => f.ruta === "index.html")) {
    return { ok: false, error: `«${proyecto.carpetaSalida}» no tiene index.html: el WebView abriría en blanco. Revisa la carpeta de salida del build.` };
  }

  let gen;
  try {
    gen = generarProyectoAndroid({
      nombreApp: String(cuerpo.nombreApp || "").trim() || proyecto.nombre,
      appId,
      versionName: String(cuerpo.versionName || "").trim() || proyecto.version || "1.0.0",
      versionCode: Number.isInteger(Number(cuerpo.versionCode)) && Number(cuerpo.versionCode) > 0 ? Number(cuerpo.versionCode) : 1,
      colorPrimario: String(cuerpo.colorPrimario || "").trim() || undefined,
      orientacion: orientacionValida(cuerpo.orientacion) ?? "portrait",
      necesitaRed: cuerpo.necesitaRed === true,
      archivosWeb: leido.texto,
      binariosWeb: leido.binarios,
    });
  } catch (e: any) {
    return { ok: false, error: `El generador falló: ${e?.message || e}` };
  }
  const r = escribirProyectoAndroid(projectRoot, gen, { forzar: cuerpo.forzar === true });
  const android = veredictoAndroid(proyecto, sondearHerramientasAndroid(projectRoot));
  return {
    ok: true,
    appId: gen.appId,
    generados: r.escritos.length,
    omitidos: r.omitidos,
    conflictos: r.conflictos,
    puedeConstruir: android.puedeConstruir,
    faltan: android.faltan,
    message:
      `Proyecto Android generado en «${gen.carpeta}/» (${r.escritos.length} archivos, AGP ${AGP_VERSION} + Gradle ${GRADLE_VERSION}). ` +
      (r.conflictos.length ? `No se pisaron ${r.conflictos.length} archivos con tus ediciones (repite con forzar=true si querés reemplazarlos). ` : "") +
      (android.puedeConstruir
        ? "Esta máquina ya tiene lo necesario: accion=compilar lanza Gradle."
        : `Para COMPILAR todavía falta: ${android.faltan.join(" · ")}. Generar no es compilar.`),
  };
}

/** Resumen de estado para el chat: qué hay vivo, qué salió, dónde está el APK. */
export function estadoAndroidDesdeChat(projectRoot: string) {
  const t = trabajoVivoApk() || ultimoTrabajoApk();
  const rutaApk = path.join(projectRoot, rutaRelApkDebug("android"));
  let apkEnDisco: { bytes: number } | null = null;
  try {
    const st = fs.statSync(rutaApk);
    const v = apkVerificado(true, st.size);
    if (v.ok) apkEnDisco = { bytes: st.size };
  } catch {}
  if (!t) return { ok: true, hayTrabajo: false, apkEnDisco, message: "Sin trabajos de compilación en esta sesión. accion=generar primero, luego compilar." };
  return {
    ok: true, hayTrabajo: true, id: t.id, estado: t.estado,
    segundos: Math.round(((t.fin || Date.now()) - t.inicio) / 1000),
    fallo: t.fallo || null,
    apk: t.apk ? { bytes: t.apk.bytes } : null,
    apkEnDisco,
    lineaFinal: t.lineas.length ? t.lineas[t.lineas.length - 1] : "",
    message: t.estado === "corriendo"
      ? "Compilación en marcha: volvé a preguntar en unos segundos."
      : t.estado === "exito"
        ? `APK listo (${(t.apk?.bytes || 0).toLocaleString("es")} bytes): descargable desde la interfaz (GET /api/export/android/apk) o en ${t.apk?.ruta}.`
        : `La compilación falló: ${t.fallo?.causa || "sin diagnóstico"} — ${t.fallo?.solucion || "revisá el log."}`,
  };
}

/**
 * tests/apkBuild.test.ts — EL BOTÓN EXPORTAR→APK (v1.56.9)
 * =========================================================
 * Cada caso sale de una situación REAL de la compilación del demo de esta casa
 * (2026-10-12): el wrapper sin jar, el JRE sin javac que Gradle denunció con
 * «does not provide the required capabilities: [JAVA_COMPILER]», y la ruta fija
 * donde cayó el APK de 881 KB verificado con apksigner.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  elegirRutaDeBuild,
  clasificarFalloBuild,
  rutaRelApkDebug,
  apkVerificado,
} from "../src/engine/apkBuild";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf-8");

let correctas = 0;
const fallos: string[] = [];
function comprobar(titulo: string, condicion: boolean, detalle = "") {
  if (condicion) { correctas++; console.log(`  ✓ ${titulo}`); }
  else { fallos.push(`${titulo}${detalle ? ` :: ${detalle}` : ""}`); console.log(`  ✗ ${titulo}${detalle ? `  → ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

// ═══ 1. Elegir Gradle según lo que HAY ═════════════════════════════════════
seccion("1) elegirRutaDeBuild — el wrapper sin jar es la trampa que rompe ilusiones");
{
  const completo = elegirRutaDeBuild({ existeGradlew: true, existeWrapperJar: true, tieneGradleSistema: false }, "linux");
  comprobar("wrapper completo (linux): ./gradlew directo",
    completo.ruta === "wrapper" && completo.comando === "./gradlew" && completo.argumentos.join(" ") === "assembleDebug");

  const win = elegirRutaDeBuild({ existeGradlew: true, existeWrapperJar: true, tieneGradleSistema: false }, "win32");
  comprobar("★ wrapper en Windows: cmd /c gradlew.bat (spawn directo de .bat da EINVAL)",
    win.comando === "cmd" && win.argumentos[0] === "/c" && win.argumentos[1] === "gradlew.bat", win.argumentos.join(" "));

  const sinJar = elegirRutaDeBuild({ existeGradlew: true, existeWrapperJar: false, tieneGradleSistema: true }, "linux");
  comprobar("★ gradlew SIN jar + gradle del sistema: usa el del sistema, y lo EXPLICA",
    sinJar.ruta === "gradle-sistema" && /gradle-wrapper\.jar/.test(sinJar.explicacion), sinJar.explicacion);

  // El router spawea con `shell: false`, y en Windows `gradle` es un .bat que Node
  // no deja spawear directo (EINVAL). El guardián de resiliencia ya señaló una vez
  // el ternario decorativo (`"gradle" : "gradle"`); si alguien lo "simplifica" a
  // literal otra vez, esto atrapa la otra mitad: que las ramas DIFIERAN de verdad.
  const winSistema = elegirRutaDeBuild({ existeGradlew: true, existeWrapperJar: false, tieneGradleSistema: true }, "win32");
  comprobar("★ gradle del sistema en Windows va por `cmd /c` (el ternario no es decorativo)",
    winSistema.comando === "cmd" && winSistema.argumentos.join(" ") === "/c gradle assembleDebug",
    winSistema.comando + " " + winSistema.argumentos.join(" "));

  const nada = elegirRutaDeBuild({ existeGradlew: true, existeWrapperJar: false, tieneGradleSistema: false }, "win32");
  comprobar("gradlew sin jar y sin gradle: NINGUNA, con la solución Android Studio",
    nada.ruta === "ninguna" && /Android Studio/.test(nada.explicacion));

  const soloSistema = elegirRutaDeBuild({ existeGradlew: false, existeWrapperJar: false, tieneGradleSistema: true }, "linux");
  comprobar("sin wrapper pero con gradle del sistema: funciona igual",
    soloSistema.ruta === "gradle-sistema");

  const vacío = elegirRutaDeBuild({ existeGradlew: false, existeWrapperJar: false, tieneGradleSistema: false }, "linux");
  comprobar("sin nada: ninguna, y nunca comando vacío disfrazado de éxito",
    vacío.ruta === "ninguna" && vacío.comando === "");

  comprobar("★ ningún camino elegido devuelve shell:true implícito (args fijos)",
    [completo, win, sinJar, nada, soloSistema, vacío].every((d) => Array.isArray(d.argumentos) && !d.argumentos.some((a) => /&&|;|\|/.test(a))));
}

// ═══ 2. Clasificar fallos CON salidas reales ═══════════════════════════════
seccion("2) clasificarFalloBuild — 400 líneas de stack convertidas en una frase accionable");
{
  // Literal del build real del demo (2026-10-12): JRE sin javac.
  const real = `> Failed to calculate the value of task ':app:compileDebugJavaWithJavac' property 'javaCompiler'.
      > Toolchain installation '/usr/lib/jvm/java-21-openjdk-amd64' does not provide the required capabilities: [JAVA_COMPILER]`;
  const jdk = clasificarFalloBuild(real);
  comprobar("★ LA SALIDA REAL DEL DEMO clasifica como jdk", jdk.id === "jdk", `${jdk.id}: ${jdk.causa}`);
  comprobar("y su solución nombra Gradle JDK (donde se arregla)", /Gradle JDK/.test(jdk.solucion));

  comprobar("SDK location not found → sdk",
    clasificarFalloBuild("SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable").id === "sdk");
  comprobar("could not resolve → red",
    clasificarFalloBuild("Could not resolve com.android.tools.build:gradle:9.4.0").id === "red");
  comprobar("licencias sin aceptar → licencias",
    clasificarFalloBuild("You have not accepted the license agreements of the following SDK components").id === "licencias");
  comprobar("OutOfMemoryError → memoria",
    clasificarFalloBuild("java.lang.OutOfMemoryError: Java heap space").id === "memoria");
  comprobar("JAVA_HOME is not set → jdk (no 'desconocido')",
    clasificarFalloBuild("ERROR: JAVA_HOME is not set and no 'java' command could be found").id === "jdk");

  const ignoto = clasificarFalloBuild("wibble wobble algo nunca visto");
  comprobar("★ desconocido NO finge causa: dice que no la sabe y pide el log",
    ignoto.id === "desconocido" && /pegá|Copi/i.test(ignoto.solucion));
  comprobar("toda causa trae solución no vacía (ninguna ruta muerta en la UI)",
    ["sdk", "red", "licencias", "memoria", "desconocido", "jdk"].every((id) =>
      [real, "SDK location not found", "Could not resolve x", "accepted the license", "OutOfMemoryError", "zz", "JAVA_HOME is not set"]
        .map((s) => clasificarFalloBuild(s)).some((c) => c.id === id && c.solucion.length > 10)));
}

// ═══ 3. El APK: dónde está y cuándo es de verdad ═══════════════════════════
seccion("3) rutaRelApkDebug + apkVerificado — éxito = archivo presente y creíble");
{
  comprobar("ruta fija, sin adivinar: la que produjo el demo real",
    rutaRelApkDebug("android") === "android/app/build/outputs/apk/debug/app-debug.apk");

  comprobar("sin archivo: NO es éxito, aunque Gradle lo haya dicho",
    apkVerificado(false, 0).ok === false);
  comprobar("APK de 3 KB: demasiado chico para ser real",
    apkVerificado(true, 3_000).ok === false);
  comprobar("★ el tamaño del demo real (881 KB) pasa",
    apkVerificado(true, 881_327).ok === true);
}

// ═══ 4. El cable ════════════════════════════════════════════════════════════
seccion("4) el cable — router, panel y contrato");
{
  const router = leer(path.join("server", "routers", "exportacion.ts"));
  // v1.57.17 · la maquinaria del spawn/verificación se MUDÓ a server/fabricaApk.ts
  // (la comparten el botón y el chat). Las vallas de alambre siguen vivas: ahora
  // leen la fábrica, que es donde está el child_process de verdad.
  const fabrica = leer(path.join("server", "fabricaApk.ts"));
  const sidebar = leer(path.join("src", "components", "RightSidebar.tsx"));
  const panel = leer(path.join("src", "components", "PanelAndroid.tsx"));

  comprobar("★ RUTAS_EXPORTACION declara las tres rutas nuevas",
    /"POST \/api\/export\/android\/build"/.test(router) &&
    /"GET \/api\/export\/android\/build\/:id"/.test(router) &&
    /"GET \/api\/export\/android\/apk"/.test(router));
  comprobar("el router usa la decisión pura, no su propia adivinanza",
    /elegirRutaDeBuild\(hechos\)/.test(fabrica) && /clasificarFalloBuild\(/.test(fabrica));
  comprobar("★ spawn con shell:false y cwd en la carpeta android",
    /cwd: carpeta/.test(fabrica) && /shell: false/.test(fabrica));
  comprobar("un éxito de Gradle NO basta: hay que ver el APK en disco",
    /code === 0 && verif\.ok/.test(fabrica));
  comprobar("trabajo único: dos Gradle simultáneos no",
    /yaEnMarcha/.test(fabrica) && /estado === "corriendo"/.test(fabrica));
  comprobar("el endpoint de descarga dice que no si no hay archivo",
    /no entrego un archivo que no existe/i.test(router));

  comprobar("★ RightSidebar importa y monta el panel",
    /import \{ PanelAndroid \}/.test(sidebar) && /<PanelAndroid \/>/.test(sidebar));
  // v1.0.21 · el panel encadena; las rutas de proyecto y build viven ahora en
  // `generar()`/`compilar()`, que siguen llamando a las mismas tres rutas.
  comprobar("el panel habla con las tres rutas",
    /api\/export\/android\/proyecto/.test(panel) &&
    /api\/export\/android\/build/.test(panel) &&
    /api\/export\/android\/apk/.test(panel));
  comprobar("★ el enlace de descarga solo existe en fase listo",
    /estado\.fase === "listo"[\s\S]*href="\/api\/export\/android\/apk"/.test(panel));
  comprobar("el sondeo se corta al desmontar (no deja intervalos zombis)",
    /clearInterval\(pollRef\.current\)/.test(panel) && /useEffect\(\(\) =>/.test(panel));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ APK BUILD (v1.56.9): ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length > 0) {
  console.log("FALLOS:");
  for (const f of fallos) console.log(`  · ${f}`);
  process.exit(1);
}

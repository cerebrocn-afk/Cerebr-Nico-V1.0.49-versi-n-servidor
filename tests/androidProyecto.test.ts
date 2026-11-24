/**
 * tests/androidProyecto.test.ts — EL GENERADOR DE PROYECTO ANDROID (v1.56.8)
 * =========================================================================
 * Se ejecuta con:  npx tsx tests/androidProyecto.test.ts
 *
 * Por qué existe: `mobileExport.ts` dictaba si se podía y enumeraba pasos, pero
 * el paso 1 era «`npm install @capacitor/...`». O sea: la exportación a Android
 * se resolvía saliendo a buscar Capacitor por internet. Este módulo produce el
 * proyecto `android/` completo, y esta suite fija que lo que produce SEA
 * construible y NO mienta.
 *
 * Se prueba la mecánica PURA (sin red, sin SDK, sin node_modules) más la
 * escritura en un directorio temporario real. El BUILD REAL (APK/AAB) queda a
 * cargo de Android Studio: aquí no hay `javac` ni SDK, y decir «compila» sin
 * haberlo compilado sería exactamente el falso verde que la casa prohíbe.
 */
import {
  AGP_VERSION,
  GRADLE_VERSION,
  BUILD_TOOLS_VERSION,
  JDK_VERSION,
  SDK_OBJETIVO,
  SDK_COMPILACION,
  generarProyectoAndroid,
  huellaDelProyecto,
  escribirProyectoAndroid,
  leerWebParaAndroid,
  rutaWebSegura,
  type ArchivoGenerado,
} from "../src/engine/androidProyecto";
import { PISO_ANDROID } from "../src/engine/mobileExport";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);

const WEB = [
  { ruta: "index.html", contenido: "<!doctype html><html><body><h1>Hola</h1></body></html>" },
  { ruta: "assets/app.js", contenido: "console.log(1);" },
  { ruta: "assets/app.css", contenido: "body{margin:0}" },
];
const base = { nombreApp: "Mi App", archivosWeb: WEB };
const mapa = (archivos: ArchivoGenerado[]) => new Map(archivos.map((a) => [a.ruta, a]));
const buscar = (archivos: ArchivoGenerado[], sufijo: string) =>
  archivos.find((a) => a.ruta.endsWith(sufijo));

// ═══════════════════════════════════════════════════════════════════════════
seccion("1. Estructura: el proyecto sale COMPLETO, no un resumen de pasos");
{
  const g = generarProyectoAndroid(base);
  const m = mapa(g.archivos);
  comprobar("hay archivos y carpeta declarada", g.archivos.length >= 13 && g.carpeta === "android", String(g.archivos.length));
  for (const ruta of [
    "android/settings.gradle",
    "android/build.gradle",
    "android/gradle.properties",
    "android/gradle/wrapper/gradle-wrapper.properties",
    "android/app/build.gradle",
    "android/app/src/main/AndroidManifest.xml",
    "android/app/src/main/res/values/strings.xml",
    "android/app/src/main/res/drawable/ic_launcher.xml",
    "android/.gitignore",
    "android/README-CEREBRONICO.md",
  ]) {
    comprobar(`existe ${ruta}`, m.has(ruta));
  }
  comprobar("la web viaja dentro de los assets", m.has("android/app/src/main/assets/www/index.html"));
  comprobar("y también los subordinados de la web", m.has("android/app/src/main/assets/www/assets/app.js") && m.has("android/app/src/main/assets/www/assets/app.css"));
  comprobar("MainActivity.java existe", !!buscar(g.archivos, "MainActivity.java"));
  comprobar("el .java vive en el directorio del namespace (no es un falso verde de paquete)",
    !!buscar(g.archivos, `java/${g.appId.split(".").join("/")}/MainActivity.java`), g.appId);
  comprobar("nada cae fuera de la carpeta android/", g.archivos.every((a) => a.ruta.startsWith("android/")));
  comprobar("todo es TEXTO: ningún archivo binario se emite",
    g.archivos.every((a) => typeof a.contenido === "string" && !a.contenido.includes("\u0000")));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("2. Los números verificados, y el suelo leído de la fuente única");
{
  const g = generarProyectoAndroid(base);
  const app = buscar(g.archivos, "app/build.gradle")!.contenido;
  comprobar("AGP 9.4.0 (sept-2026) en el build raíz", buscar(g.archivos, "android/build.gradle")!.contenido.includes(`version '${AGP_VERSION}'`) && AGP_VERSION === "9.4.0");
  comprobar("Gradle 9.6.0 (mínimo de AGP 9.4) en el wrapper", buscar(g.archivos, "gradle-wrapper.properties")!.contenido.includes(`gradle-${GRADLE_VERSION}-bin.zip`) && GRADLE_VERSION === "9.6.0");
  comprobar("Build Tools 36.0.0 declaradas", app.includes(`buildToolsVersion '${BUILD_TOOLS_VERSION}'`));
  comprobar("JDK 17 en compileOptions", app.includes(`VERSION_${JDK_VERSION}`) && JDK_VERSION === 17);
  comprobar("compileSdk = 36", app.includes(`compileSdk ${SDK_COMPILACION}`));
  comprobar("targetSdk = 36 (Play lo exige desde el 31-ago-2026)", app.includes(`targetSdk ${SDK_OBJETIVO}`) && SDK_OBJETIVO === 36);
  comprobar("★ minSdk sale de PISO_ANDROID, no se reimplementa", app.includes(`minSdk ${PISO_ANDROID.api}`) && g.minSdk === PISO_ANDROID.api && PISO_ANDROID.api === 24);
  comprobar("el suelo se nombra con su versión de Android", g.minVersion.includes("Android 7.0"), g.minVersion);
  comprobar("targetSdk se nombra Android 16", g.targetVersion === "Android 16", g.targetVersion);
  comprobar("el README lleva la tabla de números (no se pierde en el código)", buscar(g.archivos, "README-CEREBRONICO.md")!.contenido.includes(AGP_VERSION) && buscar(g.archivos, "README-CEREBRONICO.md")!.contenido.includes(GRADLE_VERSION));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("3. Coherencia manifiesto ↔ código (el error clásico: namespace ≠ ruta del .java)");
{
  const g = generarProyectoAndroid({ ...base, appId: "com.ejemplo.miapp" });
  const manif = buscar(g.archivos, "AndroidManifest.xml")!.contenido;
  const app = buscar(g.archivos, "app/build.gradle")!.contenido;
  const java = buscar(g.archivos, "MainActivity.java")!.contenido;
  comprobar("namespace = applicationId = appId", app.includes(`namespace 'com.ejemplo.miapp'`) && app.includes(`applicationId "com.ejemplo.miapp"`));
  comprobar("el .java declara ESE paquete", java.includes("package com.ejemplo.miapp;"));
  comprobar("la activity se resuelve (.MainActivity)", manif.includes(`android:name=".MainActivity"`));
  comprobar("el icono apuntado existe como recurso", manif.includes(`@drawable/ic_launcher`) && mapa(g.archivos).has("android/app/src/main/res/drawable/ic_launcher.xml"));
  comprobar("etiqueta desde @string/app_name y el nombre escapa XML", manif.includes("@string/app_name") && buscar(g.archivos, "strings.xml")!.contenido.includes("Mi App"));
  comprobar("es LAUNCHER y está exported", manif.includes("android.intent.action.MAIN") && manif.includes("android.intent.category.LAUNCHER") && manif.includes(`android:exported="true"`));
  comprobar("configChanges para no reiniciar la activity al girar", manif.includes("orientation|screenSize"));
  comprobar("sin cleartext por defecto", manif.includes(`usesCleartextTraffic="false"`));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("4. El WebView carga LO QUE REALMENTE SE ESCRIBIÓ (nada de rutas inventadas)");
{
  const g = generarProyectoAndroid(base);
  const java = buscar(g.archivos, "MainActivity.java")!.contenido;
  const m = mapa(g.archivos);
  // v1.57.7 — la web ya NO se sirve por file://. WebViewAssetLoader la monta
  // sobre un origen https real, que es lo que permite Web Workers y
  // localStorage/IndexedDB estables. La ruta del asset sigue teniendo que
  // EXISTIR en el proyecto generado: eso no se negocia.
  const origen = /ORIGEN = "(https:\/\/appassets\.androidplatform\.net)"/.exec(java);
  const entrada = /ENTRADA = ORIGEN \+ "\/assets\/([^"]+)"/.exec(java);
  comprobar("el WebView apunta a un ORIGEN REAL (https de assets), no a file://",
    !!origen && !!entrada && entrada[1] === "www/index.html", entrada && entrada[1]);
  comprobar("★ y ESA ruta existe dentro del proyecto", entrada ? m.has(`android/app/src/main/assets/${entrada[1]}`) : false);
  comprobar("★ WebViewAssetLoader monta android_asset/ bajo /assets/",
    java.includes("WebViewAssetLoader.AssetsPathHandler") && java.includes('addPathHandler("/assets/"'));
  comprobar("★ y cada petición pasa por él antes que por la red",
    java.includes("shouldInterceptRequest") && java.includes("WebViewClientCompat"));
  comprobar("JavaScript y DOM storage activados (una web React sin eso es una pantalla en blanco)",
    java.includes("setJavaScriptEnabled(true)") && java.includes("setDomStorageEnabled(true)"));
  // Con origen https, dar acceso al sistema de archivos al WebView ya no sirve
  // de nada y es lo que Play marca. Se exige explícitamente en false.
  comprobar("★ allowFileAccess en FALSE (ya no se carga por file://; Play lo marca)",
    java.includes("setAllowFileAccess(false)") && !java.includes("setAllowFileAccess(true)"));
  comprobar("atrás = history del WebView antes que cerrar la app", java.includes("canGoBack()") && java.includes("goBack()"));
  comprobar("el estado se preserva al rotar (saveState/restoreState)", java.includes("saveState(outState)") && java.includes("restoreState(savedInstanceState)"));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("5. Red: decisión explícita, no un permiso regalado ni un bloqueo mudo");
{
  const sinRed = generarProyectoAndroid(base);
  const conRed = generarProyectoAndroid({ ...base, necesitaRed: true });
  const manifSin = buscar(sinRed.archivos, "AndroidManifest.xml")!.contenido;
  const manifCon = buscar(conRed.archivos, "AndroidManifest.xml")!.contenido;
  const javaSin = buscar(sinRed.archivos, "MainActivity.java")!.contenido;
  const javaCon = buscar(conRed.archivos, "MainActivity.java")!.contenido;
  comprobar("por defecto NO se pide INTERNET (mínimo privilegio)", !manifSin.includes("android.permission.INTERNET"));
  comprobar("...y se dice dónde se decide", manifSin.includes("necesitaRed=true"));
  comprobar("con necesitaRed=true el permiso aparece", manifCon.includes("uses-permission android:name=\"android.permission.INTERNET\""));
  comprobar("el interceptor de URLs también cambia (no queda un 'permitir' mudo)", !javaSin.includes("Red permitida") && javaCon.includes("Red permitida"));
  comprobar("sin red, el interceptor sale por arriba (return true = bloquear)", javaSin.includes("return true;"));
  // v1.57.4 · el interceptor usa el overload MODERNO (WebResourceRequest, API 21+):
  // el suelo es API 24, así que el deprecado (String) ya no se emite.
  comprobar("el interceptor usa WebResourceRequest, no el overload deprecado",
    javaSin.includes("WebResourceRequest request") && !javaSin.includes("shouldOverrideUrlLoading(WebView view, String url)"));
  comprobar("★ sin red, el enlace externo se abre en el navegador del dispositivo (no se traga mudo)",
    javaSin.includes("Intent.ACTION_VIEW") && javaSin.includes("startActivity("));
  // Ojo: `startActivity` aparece TAMBIÉN en el DownloadListener (v1.57.7), que
  // es idéntico en ambos casos. Lo que distingue es el destino del Intent: el
  // interceptor usa la variable `uri`; el listener, `Uri.parse(url)`.
  comprobar("con red, la URL se carga dentro del WebView (el interceptor no despacha a otra app)",
    javaCon.includes("Red permitida") && !javaCon.includes("ACTION_VIEW, uri)"));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("5b. EXPORTAR DE VERDAD (v1.57.7): el puente que escribe en disco");
{
  const g = generarProyectoAndroid(base);
  const java = buscar(g.archivos, "MainActivity.java")!.contenido;
  const gradle = buscar(g.archivos, "app/build.gradle")!.contenido;

  // El motivo de todo esto: `<a download>` con URL blob NO dispara el
  // DownloadListener en el WebView de Android. Un APK que sólo tenga listener
  // devuelve un "exportado" falso. El puente es el camino que sí escribe.
  comprobar("★ existe el puente window.CerebroNico.guardar(nombre, texto)",
    java.includes("@JavascriptInterface") && java.includes("public boolean guardar(String nombre, String contenido)"));
  comprobar("★ y está inyectado con ese nombre", java.includes('addJavascriptInterface(this, "CerebroNico")'));
  comprobar("el archivo se escribe en UTF-8 (si no, un resumen con tildes sale roto)",
    java.includes("StandardCharsets.UTF_8") && java.includes("OutputStreamWriter"));
  comprobar("★ se sanea el NOMBRE, no el contenido (un «../» sacaría la escritura de la app)",
    java.includes('replaceAll("[^A-Za-z0-9._-]", "_")') && java.includes('if (limpio.trim().isEmpty())'));
  comprobar("cae en el directorio de la app: sin permiso y sin pedir nada al usuario",
    java.includes("getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)") && !java.includes("WRITE_EXTERNAL_STORAGE"));
  comprobar("el flujo de escritura se cierra aunque lance (nada de manejadores fugados)",
    java.includes("finally") && java.includes("escritor.close()"));
  comprobar("y hay feedback visible de dónde quedó el archivo", java.includes("Toast.makeText"));

  // El listener sigue, pero como secundaria para URLs no-blob.
  comprobar("el DownloadListener no se queda con una pulsación muerta",
    java.includes("setDownloadListener") && java.includes("Uri.parse(url)"));

  // El README es parte del contrato: si el comportamiento cambia y la prosa no,
  // el que abre Android Studio se queda en blanco sin saber por qué.
  const readme = buscar(g.archivos, "README-CEREBRONICO.md")!.contenido;
  comprobar("★ el README exige base:\"./\" (la causa #1 de pantalla en blanco)",
    readme.includes('base: "./"') && /rutas\s+relativas/.test(readme));
  comprobar("el README documenta el puente y avisa de que blob: no dispara el listener",
    readme.includes("window.CerebroNico") && readme.includes("guardar(") && /no\s+dispara/.test(readme));
  comprobar("el README ya no promete 'cero dependencias' (sería mentira)",
    !/sin dependencias externas/.test(readme) && readme.includes("androidx.webkit"));

  // La dependencia que compra todo lo anterior.
  comprobar("★ build.gradle declara androidx.webkit (sin ella no hay origen https)",
    /implementation 'androidx\.webkit:webkit:\d+\.\d+\.\d+'/.test(gradle), gradle.slice(gradle.indexOf("dependencies")));
  comprobar("el Manifest no por eso pide más permisos de los acordados",
    !buscar(g.archivos, "AndroidManifest.xml")!.contenido.includes("android.permission."));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("6. La aduana de rutas: un asset no puede escribir fuera del proyecto");
{
  comprobar("ruta normal pasa", rutaWebSegura("index.html") === "index.html");
  comprobar("subcarpeta pasa", rutaWebSegura("assets/app.js") === "assets/app.js");
  comprobar("traversal rechazado", rutaWebSegura("../../AndroidManifest.xml") === null);
  comprobar("absoluto rechazado", rutaWebSegura("/etc/passwd") === null);
  comprobar("unidad de Windows rechazado", rutaWebSegura("C:/Windows/x.ini") === null);
  comprobar("barra invertida normalizada o rechazada", rutaWebSegura("..\\x.js") === null);
  comprobar("vacía rechazada", rutaWebSegura("") === null);

  const g = generarProyectoAndroid({
    nombreApp: "X",
    archivosWeb: [
      { ruta: "index.html", contenido: "ok" },
      { ruta: "../../pwned.txt", contenido: "no" },
      { ruta: "/abs.txt", contenido: "tampoco" },
    ],
  });
  comprobar("el proyecto rechaza la ruta hostil y lo CONFIESA", g.archivos.every((a) => !a.ruta.includes("pwned")) && g.avisos.some((v) => /rechazada/.test(v)), g.avisos.join(" | "));
  comprobar("...y el index legítimo sobrevive", mapa(g.archivos).has("android/app/src/main/assets/www/index.html"));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("7. Honestidad de entrada: valores inválidos se corrigen y se confiesan");
{
  const g = generarProyectoAndroid({
    nombreApp: "Mi App",
    archivosWeb: WEB,
    appId: "Com.Invalido!!",
    versionName: "borrador",
    versionCode: 0,
    colorPrimario: "rojo",
    orientacion: "boca-abajo" as any,
  });
  comprobar("appId inválido NO se cuela: se deriva del nombre", /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(g.appId), g.appId);
  comprobar("y queda confesado en avisos", g.avisos.some((v) => /appId/.test(v)), g.avisos.join(" | "));
  comprobar("versionName inválida cae a 1.0.0 y se avisa", g.versionName === "1.0.0" && g.avisos.some((v) => /versionName/.test(v)));
  comprobar("versionCode 0 cae a 1 y se avisa", g.versionCode === 1 && g.avisos.some((v) => /versionCode/.test(v)));
  comprobar("color inválido cae al de la casa y se avisa", buscar(g.archivos, "colors.xml")!.contenido.includes("#0B1220") && g.avisos.some((v) => /colorPrimario/.test(v)));
  comprobar("orientación desconocida cae a portrait y se avisa", buscar(g.archivos, "AndroidManifest.xml")!.contenido.includes(`android:screenOrientation="portrait"`) && g.avisos.some((v) => /orientaci/.test(v)));
  comprobar("★ orientación válida se respeta tal cual", buscar(generarProyectoAndroid({ ...base, orientacion: "landscape" }).archivos, "AndroidManifest.xml")!.contenido.includes(`android:screenOrientation="landscape"`));
  // Regresión propia: antes `String(undefined)` caía en la rama de «desconocida» y
  // el generador se quejaba de una orientación que nadie había dicho.
  comprobar("★ y si NO se especificó orientación, no hay aviso fantasma",
    generarProyectoAndroid(base).avisos.length === 0, generarProyectoAndroid(base).avisos.join(" | "));
  comprobar("color válido se respeta", buscar(generarProyectoAndroid({ ...base, colorPrimario: "#ff8800" }).archivos, "colors.xml")!.contenido.includes("#FF8800"));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("8. Cero verde regalado: si la web no trae index.html, se dice");
{
  const g = generarProyectoAndroid({ nombreApp: "Vacia", archivosWeb: [{ ruta: "otros.js", contenido: "//" }] });
  comprobar("avisa que abrirá en blanco (no lo vende como listo)", g.avisos.some((v) => /index\.html/.test(v) && /blanco/.test(v)), g.avisos.join(" | "));
  const vacio = generarProyectoAndroid({ nombreApp: "Sin web", archivosWeb: [] });
  comprobar("web vacía también se confiesa", vacio.avisos.some((v) => /index\.html/.test(v)));
  comprobar("el README advierte del wrapper binario que NO se emite", buscar(g.archivos, "README-CEREBRONICO.md")!.contenido.includes("gradle-wrapper.jar") && buscar(g.archivos, "README-CEREBRONICO.md")!.contenido.includes("binario"));
  comprobar("el AAB se declara SIN FIRMAR hasta crear keystore (no se promete listo)", buscar(g.archivos, "app/build.gradle")!.contenido.includes("SIN FIRMAR"));
  comprobar("las claves de firma quedan fuera del repo", buscar(g.archivos, "android/.gitignore")!.contenido.includes("*.keystore") && buscar(g.archivos, "android/.gitignore")!.contenido.includes("*.jks"));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("9. Determinismo: mismo insumo → misma huella (reproductible)");
{
  const a = generarProyectoAndroid(base);
  const b = generarProyectoAndroid({ ...base, archivosWeb: [...WEB].reverse() });
  comprobar("el orden de entrada no altera el proyecto", huellaDelProyecto(a) === huellaDelProyecto(b), `${huellaDelProyecto(a).slice(0, 12)} vs ${huellaDelProyecto(b).slice(0, 12)}`);
  const c = generarProyectoAndroid({ ...base, archivosWeb: [{ ruta: "index.html", contenido: "<html>distinto</html>" }, ...WEB.slice(1)] });
  comprobar("cambiar un asset cambia la huella", huellaDelProyecto(a) !== huellaDelProyecto(c));
  const d = generarProyectoAndroid({ ...base, versionCode: 2 });
  comprobar("cambiar versionCode cambia la huella", huellaDelProyecto(a) !== huellaDelProyecto(d));
  comprobar("la huella es sha256 (64 hex)", /^[0-9a-f]{64}$/.test(huellaDelProyecto(a)));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("10. Disco real: escribe, se lee igual, y la guarda anti-traversal funciona");
{
  const dir = mkdtempSync(join(tmpdir(), "cn-android-"));
  try {
    const g = generarProyectoAndroid(base);
    const r = escribirProyectoAndroid(dir, g);
    comprobar("escribe todos los archivos", r.escritos.length === g.archivos.length, `${r.escritos.length}/${g.archivos.length}`);
    comprobar("nada se omite en un camino normal", r.omitidos.length === 0, r.omitidos.join(","));
    const enDisco = readFileSync(join(dir, "android/app/src/main/assets/www/index.html"), "utf-8");
    comprobar("lo escrito en disco es idéntico al generado", enDisco === WEB[0].contenido);
    comprobar("el manifiesto existe en disco", existsSync(join(dir, "android/app/src/main/AndroidManifest.xml")));
    comprobar("re-ejecutar es idempotente (no duplica ni corrompe)", (() => {
      const r2 = escribirProyectoAndroid(dir, g);
      return r2.escritos.length === g.archivos.length && readFileSync(join(dir, "android/app/src/main/assets/www/index.html"), "utf-8") === WEB[0].contenido;
    })());

    // Guarda: una ruta maliciosa en el mapa NO debe escribir fuera de la raíz.
    const malicioso = { ...g, archivos: [...g.archivos, { ruta: "../../fuera.txt", contenido: "nope" } as ArchivoGenerado] };
    const r3 = escribirProyectoAndroid(dir, malicioso);
    comprobar("★ la guarda anti-traversal OMITE la ruta que escapa de la raíz", r3.omitidos.includes("../../fuera.txt"), r3.omitidos.join(","));
    comprobar("★ y el archivo hostil NO aparece en el disco de al lado", !existsSync(resolve(dir, "../../fuera.txt")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("11. PUREZA: cero red, cero dependencias, cero monolito");
{
  const fuente = readFileSync(new URL("../src/engine/androidProyecto.ts", import.meta.url), "utf-8");
  comprobar("no importa http/https/fetch (no sale a la red)", !/\b(fetch|axios|node:https?|got)\b/.test(fuente));
  // Se juzgan los IMPORTS y la SALIDA, no la prosa del encabezado: el módulo
  // explica que no usa Capacitor, así que la palabra aparece en sus comentarios.
  const imports = (fuente.match(/^[ \t]*import[\s\S]*?from\s*["'][^"']+["']/gm) || []).join("\n");
  comprobar("ningún import apunta al monolito", !/server/.test(imports), imports.replace(/\s+/g, " ").slice(0, 160));
  comprobar("los imports son solo node:fs/path/crypto y módulos hermanos", imports.split("\n").every((l) => /node:(fs|path|crypto)|from "\.\/|\{/.test(l)));
  const g = generarProyectoAndroid(base);
  const salida = g.archivos.map((a) => a.contenido).join("\n");
  comprobar("★ lo GENERADO no depende de Capacitor ni de un npm install", !/@capacitor|npx cap /.test(salida));
  comprobar("...y el README lo declara (no es un olvido, es una decisión)", /No usa Capacitor/.test(buscar(g.archivos, "README-CEREBRONICO.md")!.contenido));
  comprobar("declara AGP/Gradle como constantes con su fuente en el encabezado", /developer\.android\.com/.test(fuente));
  const pkgJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
  comprobar("el proyecto no añade ninguna dependencia para esto", !Object.keys(pkgJson.dependencies || {}).some((d) => /capacitor|gradle|android/i.test(d)));
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("12. Assets binarios: se COPIAN del disco, no se inventan (un APK sin imágenes es una app rota)");
{
  const web = mkdtempSync(join(tmpdir(), "cn-web-"));
  try {
    // una mini web real: texto + un binario de verdad + un sourcemap + algo enorme
    writeFileSync(join(web, "index.html"), "<html>hola</html>", "utf-8");
    writeFileSync(join(web, "app.css"), "body{}", "utf-8");
    mkdirSync(join(web, "img"), { recursive: true });
    writeFileSync(join(web, "img/logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
    writeFileSync(join(web, "app.js.map"), "sourcemap que no debe viajar", "utf-8");
    writeFileSync(join(web, "video.mp4"), Buffer.alloc(9_000_000, 7));

    const leido = leerWebParaAndroid(web);
    comprobar("el texto se separa del binario", leido.texto.length === 2 && leido.binarios.length === 1, `${leido.texto.length}/${leido.binarios.length}`);
    // `abs` lleva el separador de la plataforma: comparar contra "img/logo.png"
    // pasaba en Linux y caía en Windows. Se normaliza, no se cambia la aserción.
    comprobar("el png viaja como binario con su ruta absoluta y tamaño",
      leido.binarios[0]?.ruta === "img/logo.png" &&
        leido.binarios[0]?.abs.replace(/\\/g, "/").endsWith("/img/logo.png") &&
        leido.binarios[0]?.bytes === 8, JSON.stringify(leido.binarios[0]));
    comprobar("★ el sourcemap se OMITE y se dice por qué (no se calla)",
      leido.omitidos.some((o) => o.ruta === "app.js.map" && /sourcemap/i.test(o.motivo)), JSON.stringify(leido.omitidos));
    comprobar("★ el archivo fuera de tope se omite con su cifra",
      leido.omitidos.some((o) => o.ruta === "video.mp4" && /9000000/.test(o.motivo)), JSON.stringify(leido.omitidos));

    const g = generarProyectoAndroid({
      nombreApp: "Con imágenes",
      archivosWeb: leido.texto,
      binariosWeb: leido.binarios,
    });
    const assetBin = g.archivos.find((a) => a.ruta.endsWith("assets/www/img/logo.png"));
    comprobar("el binario entra al plano del proyecto", !!assetBin && assetBin.fuenteBinaria === leido.binarios[0].abs);
    comprobar("y NO viaja como texto disfrazado (contenido vacío, bytes anotados)",
      !!assetBin && assetBin.contenido === "" && assetBin.bytes === 8);
    comprobar("los assets quedan ordenados por ruta (determinismo con mezcla de tipos)",
      (() => {
        const r = g.archivos.filter((a) => a.ruta.includes("assets/www/")).map((a) => a.ruta);
        return r.every((v, i) => i === 0 || r[i - 1] <= v);
      })());
    comprobar("sin index.html entre el texto, se avisa igual",
      generarProyectoAndroid({ nombreApp: "x", archivosWeb: [{ ruta: "otro.css", contenido: "" }], binariosWeb: leido.binarios }).avisos.some((v) => /blanco/.test(v)));

    const inventado = generarProyectoAndroid({
      nombreApp: "x",
      archivosWeb: WEB,
      binariosWeb: [
        { ruta: "falta.png", abs: join(web, "no-existe.png"), bytes: 10 },
        { ruta: "../../escape.png", abs: join(web, "img/logo.png"), bytes: 10 },
        { ruta: "sinbytes.png", abs: join(web, "img/logo.png"), bytes: NaN },
      ],
    });
    comprobar("★ binario que NO está en disco se descarta y se confiesa (no se promete)",
      inventado.avisos.some((v) => /no está en disco/.test(v)) && !inventado.archivos.some((a) => a.ruta.includes("falta.png")));
    comprobar("★ binario con ruta hostil se rechaza", !inventado.archivos.some((a) => a.ruta.includes("escape.png")));
    comprobar("★ binario sin tamaño no entra (no se le inventa un byte count)",
      inventado.avisos.some((v) => /se descarta \(no se inventa/.test(v)));

    // Escritura PRIMERO, con el png todavía de 8 bytes: si se comprueba después
    // de mutarlo, el verde dependería del orden del test y no del código.
    const destino = mkdtempSync(join(tmpdir(), "cn-bin-out-"));
    try {
      const r = escribirProyectoAndroid(destino, g);
      const copiado = readFileSync(join(destino, "android/app/src/main/assets/www/img/logo.png"));
      comprobar("el binario se escribe en disco con sus bytes reales", copiado.length === 8 && copiado[0] === 0x89, `${copiado.length} bytes`);
      comprobar("y cuenta como escrito", r.escritos.some((e) => e.endsWith("img/logo.png")));
      const huerfano = { ...g, archivos: [...g.archivos, { ruta: "android/x.png", contenido: "", fuenteBinaria: join(web, "borrado.png"), bytes: 1 } as ArchivoGenerado] };
      const r2 = escribirProyectoAndroid(destino, huerfano);
      comprobar("★ si la fuente desapareció, se OMITE (no se rellena con basura)",
        r2.omitidos.includes("android/x.png") && !existsSync(join(destino, "android/x.png")));
    } finally {
      rmSync(destino, { recursive: true, force: true });
    }

    // La huella anota el binario por ruta+bytes, y eso se declara, no se esconde.
    writeFileSync(join(web, "img/logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 9, 9]));
    const leido2 = leerWebParaAndroid(web);
    const g2 = generarProyectoAndroid({ nombreApp: "Con imágenes", archivosWeb: leido2.texto, binariosWeb: leido2.binarios });
    comprobar("una web cambiada cambia la huella (el tamaño del asset se registra)",
      leido2.binarios[0].bytes === 10 && huellaDelProyecto(g) !== huellaDelProyecto(g2));
    comprobar("★ y el módulo dice que el binario se anota por tamaño, no por contenido (no es un verde ciego)",
      /no por su contenido/.test(readFileSync(new URL("../src/engine/androidProyecto.ts", import.meta.url), "utf-8")));

    const ausente = leerWebParaAndroid(join(web, "no-compactilado"));
    comprobar("carpeta de salida inexistente: lo DICE en vez de devolver un proyecto vacío",
      ausente.raiz === null && ausente.omitidos.some((o) => /falta compilar/.test(o.motivo)), JSON.stringify(ausente.omitidos));
  } finally {
    rmSync(web, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("13. NO PISA SIN SOBRESCRIBIR: una edición a mano vale más que un re-exporte cómodo");
{
  const dir = mkdtempSync(join(tmpdir(), "cn-conflicto-"));
  try {
    const g = generarProyectoAndroid(base);
    escribirProyectoAndroid(dir, g);
    // El usuario edita su MainActivity a mano.
    const rutaJava = join(dir, buscar(g.archivos, "MainActivity.java")!.ruta);
    writeFileSync(rutaJava, "package editado; // toqué esto a mano", "utf-8");

    const r2 = escribirProyectoAndroid(dir, g);
    comprobar("★ la edición a mano NO se pisa en un re-exporte normal",
      readFileSync(rutaJava, "utf-8").includes("toqué esto a mano"));
    comprobar("★ y el conflicto se DECLARA (no se omite en silencio)",
      r2.conflictos.length === 1 && r2.conflictos[0].endsWith("MainActivity.java"), r2.conflictos.join(","));
    comprobar("lo que sí coincide se cuenta como escrito sin reescribir",
      r2.escritos.length === g.archivos.length - 1);

    const r3 = escribirProyectoAndroid(dir, g, { forzar: true });
    comprobar("con forzar=true sí se reemplaza, porque se pidió",
      readFileSync(rutaJava, "utf-8").includes("class MainActivity"));
    comprobar("y ya no quedan conflictos declarados", r3.conflictos.length === 0);

    // Binario: un asset de otro tamaño en disco también es un conflicto.
    const gBin = generarProyectoAndroid({
      ...base,
      binariosWeb: [{ ruta: "img/p.png", abs: join(dir, "android/.gitignore"), bytes: 999 }],
    });
    escribirProyectoAndroid(dir, gBin, { forzar: true });
    const rb = escribirProyectoAndroid(dir, gBin);
    comprobar("★ un binario distinto en disco (otro tamaño) se declara en conflicto, no se sobreescribe",
      rb.conflictos.some((c) => c.endsWith("img/p.png")), rb.conflictos.join(","));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
seccion("14. ★ EL CABLE: un módulo verde pero incomunicado es una capacidad que no existe");
{
  const leerRel = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf-8");
  const router = leerRel("../server/routers/exportacion.ts");
  const monolito = leerRel("../server.ts");
  const contrato = JSON.parse(leerRel("../contrato-rutas.json"));

  comprobar("existe el router de exportación extraído", router.length > 1000);
  comprobar("★ el router importa el generador (no es un módulo huérfano)", /generarProyectoAndroid/.test(router) && /from "\.\.\/\.\.\/src\/engine\/androidProyecto"/.test(router));
  comprobar("★ y LO LLAMA dentro de la ruta (importar sin usar no cablea nada)",
    /app\.post\("\/api\/export\/android\/proyecto"/.test(router) &&
    /generarProyectoAndroid\(\{/.test(router) &&
    /escribirProyectoAndroid\(PROJECT_ROOT, gen/.test(router));
  comprobar("usa la web COMPILADA del proyecto, no un contenido de relleno", /leerWebParaAndroid\(path\.join\(PROJECT_ROOT, proyecto\.carpetaSalida\)\)/.test(router));
  comprobar("★ la ruta nueva nace CON GUARD (escribe en el proyecto del usuario)",
    /if \(!deps\.sandboxAuthorized\(req\)\) return res\.status\(401\)/.test(router));
  comprobar("declara sus 8 rutas en RUTAS_EXPORTACION (la lista se comprueba, no se decora)",
    /export const RUTAS_EXPORTACION = \[([\s\S]*?)\] as const/.test(router) &&
    (router.match(/"GET \/api\/export\/targets"|"POST \/api\/export\/android\/prepare"|"POST \/api\/export\/android\/proyecto"|"POST \/api\/export\/android\/build"|"GET \/api\/export\/android\/build\/:id"|"GET \/api\/export\/android\/apk"|"POST \/api\/export\/android\/provision"|"GET \/api\/export\/android\/provision"/g) || []).length === 8);

  const rutasContrato = contrato.rutas.filter((r: any) => String(r.ruta).includes("/api/export"));
  comprobar("★ el contrato registra las 8 rutas de exportación", rutasContrato.length === 8, String(rutasContrato.length));
  comprobar("...y dice que viven en el router extraído, no en el monolito",
    rutasContrato.every((r: any) => r.archivo === "server/routers/exportacion.ts"), rutasContrato.map((r: any) => r.archivo).join(","));
  comprobar("★ y el contrato confirma el guard de las cuatro que escriben o lanzan procesos",
    rutasContrato.filter((r: any) => r.guarda).length === 4, rutasContrato.map((r: any) => `${r.ruta}:${r.guarda}`).join(" "));
  comprobar("el monolito se quedó sin definir esas rutas a mano (no hay duplicado)",
    !/app\.get\("\/api\/export\/targets"/.test(monolito) && !/app\.post\("\/api\/export\/android\//.test(monolito));
  comprobar("★ y las registra por delegación", /registrarExportacion\(app, \{/.test(monolito));
  comprobar("el registro ocurre dentro de registerEngineRoutes (donde vivían: no se cambia el momento)",
    (() => {
      const iFn = monolito.indexOf("function registerEngineRoutes");
      const iLlamada = monolito.indexOf("registrarExportacion(app, {");
      return iFn > 0 && iLlamada > iFn;
    })());
  comprobar("★ la extracción no infló el monolito: sigue bajo su presupuesto",
    monolito.split("\n").length <= contrato.presupuesto_lineas,
    `${monolito.split("\n").length} / ${contrato.presupuesto_lineas}`);
  comprobar("★ y ADELGAZÓ (la Fase 2 es partir, no añadir): apenas por encima de las 12244 de v1.0.28",
    // 12191 (piso de v1.56.7) → 12286 (v1.68.0) → 12317 (v1.0.23, techo REAL del
    // veredicto de Mario: el contrato decía 12317 pero server.ts medía 12364, y por
    // eso la entrega volvió con «HAY FALLOS»). v1.0.25 lo baja a 12098 sacando dos
    // rutas ENTERAS a server/routers/ (subagentes, estadoSandbox) en vez de parchear
    // dentro. v1.0.28: +146 líneas legítimas (cliente MCP, despacho de servidores
    // por stdio y abrir_red) y se compensan sacando packs/estado a un router: el
    // trinquete se mueve con el generador, no con la mano.
    // v1.0.29/v1.0.30: el orden del prompt, la compactación por presión y el
    // arranque perezoso de MCP. La primera versión metía la lógica DENTRO del
    // monolito (+45 líneas y un comentario de 28); se sacó a
    // `prepararSistemaParaCache` y server.ts quedó en una llamada de 6 líneas.
    // Resultado: 12280, no 12360. El literal se APRIETA a lo medido: si un cambio
    // futuro vuelve a crecer, la suite cae aquí y no espera a que el contrato lo tape.
    contrato.server_lineas <= contrato.presupuesto_lineas && contrato.server_lineas <= 12280, String(contrato.server_lineas));
  comprobar("el router no importa server.ts (seguiría atado al monolito)", !/from "\.\.\/\.\.\/server"/.test(router));
}

// ═══════════════════════════════════════════════════════════════════════════
// La prueba en vivo necesita `express`. Donde no está instalada se DECLARA
// sin verificar: un huérfano verde no es peor que un rojo, pero un salto
// silencioso sí lo sería (la casa prohíbe el verde regalado).
seccion("15. PRUEBA EN VIVO: la ruta HTTP montada sobre express (no solo leer el fuente)");
let expressDisponible = true;
try {
  const mod: any = await import("express");
  const crear = mod.default || mod;
  const fs2 = await import("node:fs");
  const projRoot = mkdtempSync(join(tmpdir(), "cn-live-"));
  const { registrarExportacion } = await import("../server/routers/exportacion");
  try {
    mkdirSync(join(projRoot, "dist/assets"), { recursive: true });
    fs2.writeFileSync(
      join(projRoot, "package.json"),
      JSON.stringify({
        name: "mi-tienda",
        version: "2.1.0",
        scripts: { build: "vite build", dev: "vite" },
        dependencies: { react: "^18.3.2", "react-dom": "^18.3.2" },
        devDependencies: { vite: "^6.4.3" },
      }),
      "utf-8"
    );
    fs2.writeFileSync(join(projRoot, "dist/index.html"), "<!doctype html><title>Tienda</title>", "utf-8");
    fs2.writeFileSync(join(projRoot, "dist/assets/app.js"), "console.log(1)", "utf-8");
    fs2.writeFileSync(join(projRoot, "dist/assets/logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
    fs2.writeFileSync(join(projRoot, "dist/app.map"), "sourcemap", "utf-8");

    let autorizar = false;
    const app = crear();
    app.use((await import("express")).json());
    registrarExportacion(app, { projectRoot: projRoot, sandboxAuthorized: () => autorizar });
    const srv = app.listen(0);
    const base = `http://127.0.0.1:${(srv.address() as any).port}`;
    const post = async (cuerpo: any) => {
      const rr = await fetch(`${base}/api/export/android/proyecto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      return { status: rr.status, j: (await rr.json()) as any };
    };

    const sinLlave = await post({});
    comprobar("★ la ruta responde 401 sin autorización (el guard no es decorativo)", sinLlave.status === 401, String(sinLlave.status));
    autorizar = true;

    const rt = await fetch(`${base}/api/export/targets`);
    const tj: any = await rt.json();
    comprobar("GET /api/export/targets sigue viva tras la extracción", rt.status === 200 && tj.proyecto.tipo === "web-moderno" && tj.proyecto.exportableAAndroid);

    const ok = await post({});
    comprobar("★ POST /api/export/android/proyecto devuelve 200 con veredicto", ok.status === 200 && ok.j.ok === true, JSON.stringify(ok.j).slice(0, 120));
    comprobar("genera el proyecto y lo informa con número", typeof ok.j.generados === "number" && ok.j.generados >= 16, String(ok.j.generados));
    comprobar("★ huella sha256 en la respuesta (reproductible desde el cliente)", /^[0-9a-f]{64}$/.test(String(ok.j.huella || "")));
    comprobar("declara la misión APK y AAB (no deja el 'cómo' en el aire)", String(ok.j.mision?.apk).includes("assembleDebug") && String(ok.j.mision?.aab).includes("bundleRelease"));
    comprobar("dice qué FALTA para compilar en vez de fingir que está listo", ok.j.android && ok.j.android.puedeConstruir === false && Array.isArray(ok.j.android.faltan), JSON.stringify(ok.j.android));

    const enDisco = (r: string) => fs2.existsSync(join(projRoot, r));
    comprobar("★ los archivos existen REALMENTE en el proyecto del usuario",
      enDisco("android/app/build.gradle") && enDisco("android/app/src/main/AndroidManifest.xml") && enDisco("android/app/src/main/java/cerebronico/app/mitienda/MainActivity.java"));
    comprobar("la web compilada viajó a los assets", enDisco("android/app/src/main/assets/www/index.html") && enDisco("android/app/src/main/assets/www/assets/app.js"));
    const png = fs2.readFileSync(join(projRoot, "android/app/src/main/assets/www/assets/logo.png"));
    comprobar("★ el binario se copió byte a byte (no se inventó ni se perdió)", png.length === 8 && png[0] === 0x89);
    comprobar("★ el sourcemap NO viajó y se declaró como omisión",
      !enDisco("android/app/src/main/assets/www/app.map") && (ok.j.assetsOmitidos || []).some((o: any) => /map/.test(o.ruta)));

    fs2.writeFileSync(join(projRoot, "android/app/src/main/java/cerebronico/app/mitienda/MainActivity.java"), "// a mano");
    const conflicto = await post({});
    comprobar("★ una edición a mano NO se pisa y se DECLARA en la respuesta",
      fs2.readFileSync(join(projRoot, "android/app/src/main/java/cerebronico/app/mitienda/MainActivity.java"), "utf-8") === "// a mano" &&
        (conflicto.j.conflictos || []).some((c: string) => c.endsWith("MainActivity.java")), JSON.stringify(conflicto.j.conflictos));
    const forzado = await post({ forzar: true });
    comprobar("...y solo se reemplaza cuando el usuario pide forzar",
      fs2.readFileSync(join(projRoot, "android/app/src/main/java/cerebronico/app/mitienda/MainActivity.java"), "utf-8").includes("class MainActivity") && forzado.j.conflictos.length === 0);

    rmSync(join(projRoot, "dist"), { recursive: true, force: true });
    const sinBuild = await post({});
    comprobar("★ sin web compilada corta con 400 y dice el comando, no un 200 vacío",
      sinBuild.status === 400 && /npm run build|Compila la web/.test(String(sinBuild.j.error)), String(sinBuild.j.error).slice(0, 90));

    srv.close();
  } finally {
    rmSync(projRoot, { recursive: true, force: true });
  }
} catch (e: any) {
  if (e?.code === "ERR_MODULE_NOT_FOUND" || /Cannot find (package|dep) .*express/.test(String(e?.message))) {
    expressDisponible = false;
  } else {
    fallos.push(`prueba en vivo rompió por otro motivo — ${e?.message || e}`);
  }
}
if (!expressDisponible) {
  console.log("  · AVISO — prueba en vivo SIN VERIFICAR: `express` no está instalado en esta máquina (correlo tras `npm install`). No se cuenta como verde.");
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ ANDROID PROYECTO (v1.0 · v1.56.8): ${correctas} correctas · ${fallos.length} fallidas ═══`);
console.log("─".repeat(56));
if (fallos.length > 0) {
  console.log("FALLOS:");
  fallos.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}

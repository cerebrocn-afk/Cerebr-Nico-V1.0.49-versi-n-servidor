/**
 * androidProyecto.ts — EL GENERADOR DE PROYECTO ANDROID (v1.0 · v1.56.8)
 * ======================================================================
 * QUÉ ES: la pieza que a `mobileExport.ts` le faltaba. `mobileExport` **analiza**
 * (detecta el proyecto, sondea el SDK, dicta si se puede construir) y enumera
 * pasos; pero el paso 1 era «`npm install @capacitor/...`», o sea: el IDE te
 * explicaba cómo salir a buscar Capacitor por internet. En un Dell de 8 GB, sin
 * red o con la cuota gastada, eso es la exportación **sin hacer**.
 *
 * ESTE MÓDULO PRODUCE EL PROYECTO. De una web ya construida (`archivosWeb`) saca
 * el mapa completo de `android/` listo para abrir en Android Studio y pulsar
 * Build → APK o AAB. Sin Capacitor, sin `npm install`, sin dependencias
 * externas: un `Activity` de framework + un `WebView` que carga la web desde
 * `assets/www`. Menos piezas = menos formas de romperse.
 *
 * LOS NÚMEROS NO SE INVENTAN (verificados en developer.android.com, 2026-10-11):
 *   · AGP 9.4.0 (sept-2026) → Gradle mínimo y por defecto **9.6.0**,
 *     SDK Build Tools **36.0.0**, JDK **17**, API máxima soportada 37.
 *   · Google Play: desde el **31-ago-2026** las apps nuevas y sus actualizaciones
 *     deben targetear **Android 16 (API 36)**.
 *   · El SUELO (`minSdk`) no se reimplementa: se lee de `PISO_ANDROID` en
 *     `mobileExport.ts` (API 24 = Android 7.0), fuente única de la casa.
 *
 * HONESTIDAD ESTRUCTURAL: un `gradle-wrapper.jar` es un **binario** y este motor
 * no emite binarios que no puede verificar. Por eso el proyecto declara la
 * versión de Gradle en `gradle/wrapper/gradle-wrapper.properties` y AVISA de las
 * dos formas legítimas de obtener el wrapper (Android Studio lo regenera al
 * sincronizar, o `gradle wrapper --gradle-version 9.6.0`). El aviso viaja en
 * `avisos[]` y en el README generado: nada se promete en silencio.
 *
 * PUREZA: `generarProyectoAndroid(op)` es pura (recibe la web, devuelve el mapa
 * de rutas→contenido, orden determinista, misma entrada → misma huella). El disco
 * vive en `escribirProyectoAndroid`, con guarda anti-traversal.
 *
 * CABLEADO (v1.56.8, ya NO es huérfano): lo invoca
 * `POST /api/export/android/proyecto` en `server/routers/exportacion.ts`, que se
 * registra por delegación dentro de `registerEngineRoutes` (el mismo ámbito donde
 * vivían las rutas de exportación, para no cambiar el momento del registro). La
 * extracción del dominio `export` sacó 171 líneas del monolito: el trinquete de
 * `contrato-rutas.json` se regeneró con `node scripts/superficie.mjs` (no a mano)
 * y quedó `presupuesto_lineas = 12020`, `rutas_extraídas = 43`. La ruta nueva nace
 * con `guard = true`: escribe en el proyecto del usuario, así que exige la
 * autorización del puente igual que `/android/prepare`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { PISO_ANDROID, androidDesdeApi, appIdDesdeNombre, appIdValido } from "./mobileExport";

/** Pareja AGP↔Gradle↔BuildTools↔JDK verificada (AGP 9.4.0, sept-2026). */
export const AGP_VERSION = "9.4.0";
export const GRADLE_VERSION = "9.6.0";
export const BUILD_TOOLS_VERSION = "36.0.0";
export const JDK_VERSION = 17;
/** Objetivo de API exigido por Google Play desde el 31-ago-2026. */
export const SDK_OBJETIVO = 36;
export const SDK_COMPILACION = 36;
/**
 * Única dependencia externa del proyecto generado (v1.57.7). Aporta
 * `WebViewAssetLoader` y `WebViewClientCompat`, es decir: el origen `https://`
 * bajo el que la web puede usar Web Workers, localStorage e IndexedDB de forma
 * fiable. Vive en `google()`, ya declarado en settings.gradle.
 *
 * Es una ruptura deliberada del lema "cero dependencias": el coste es que
 * Gradle tiene que descargarla; el beneficio es que sin origen real el agente
 * en segundo plano de Pocket es literalmente imposible.
 */
export const WEBKIT_ARTIFACTO = "androidx.webkit:webkit:1.12.1";

/** Modos de orientación que el manifest sabe escribir. */
export const ORIENTACIONES = ["portrait", "landscape", "unspecified"] as const;
export type Orientacion = (typeof ORIENTACIONES)[number];

/**
 * Estrecha un valor que viene de fuera (el cuerpo de un POST) a una orientación
 * real. Devuelve `undefined` en vez de adivinar: quien llama decide el valor por
 * defecto, y así el generador distingue «no lo dijo» de «lo dijo mal» — mezclarlos
 * producía un aviso falso cada vez que el llamante simplemente no especificaba.
 */
export function orientacionValida(v: unknown): Orientacion | undefined {
  return (ORIENTACIONES as readonly unknown[]).includes(v) ? (v as Orientacion) : undefined;
}

export interface ArchivoGenerado {
  ruta: string;
  /** Contenido de texto. Vacío cuando `fuenteBinaria` trae los bytes desde disco. */
  contenido: string;
  /**
   * Ruta EN DISCO de un asset binario (png, jpg, woff2, mp3…) que se COPIA tal
   * cual. La regla «el motor no emite binarios» sigue en pie: aquí el binario no
   * lo inventa el modelo, es un archivo que YA existe en el proyecto del usuario.
   * Sin esto, un APK con imágenes saldría roto en silencio.
   */
  fuenteBinaria?: string;
  /** Bytes del binario (se anota para la huella, que no lee el binario entero). */
  bytes?: number;
}

export interface OpcionesProyectoAndroid {
  /** Nombre visible de la app (label del launcher). */
  nombreApp: string;
  /** La web YA construida que va dentro del APK. */
  archivosWeb: Array<{ ruta: string; contenido: string }>;
  /** Assets binarios de esa web, leídos con `leerWebParaAndroid` (se copian, no se inventan). */
  binariosWeb?: Array<{ ruta: string; abs: string; bytes: number }>;
  /** Id de aplicación Android (dominio al revés). Si falta, se deriva del nombre. */
  appId?: string;
  dominio?: string;
  versionName?: string;
  versionCode?: number;
  /** Carpeta donde se escribe el proyecto (relativa al proyecto del usuario). */
  carpeta?: string;
  /** Subcarpeta de assets que cargará el WebView. */
  carpetaWeb?: string;
  /** Color de la marca (hex #RRGGBB). Defecto: azul CerebroNico. */
  colorPrimario?: string;
  orientacion?: Orientacion;
  /**
   * `false` (por defecto) = la app es local y NO recibe permiso de red.
   * `true` = se añade `android.permission.INTERNET` para una web que llama a un
   * backend. Se decide aquí, no se descubra después.
   */
  necesitaRed?: boolean;
}

export interface ProyectoAndroidGenerado {
  appId: string;
  nombrePaquete: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  minVersion: string;
  targetSdk: number;
  targetVersion: string;
  compilacionSdk: number;
  carpeta: string;
  carpetaWeb: string;
  /** Ruta del `index.html` que abrirá el WebView, relativa a la raíz generada. */
  entradaWeb: string;
  archivos: ArchivoGenerado[];
  mision: {
    abrir: string;
    apk: string;
    aab: string;
    salidaApk: string;
    salidaAab: string;
  };
  avisos: string[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Color seguro: si el entrante no es hex válido, se usa el de la casa y se avisa. */
function colorSeguro(hex: string | undefined, avisos: string[]): string {
  if (!hex) return "#0B1220";
  if (HEX.test(hex)) return hex.toUpperCase();
  avisos.push(`colorPrimario «${hex}» no es #RRGGBB: se usa el azul de la casa (#0B1220).`);
  return "#0B1220";
}

/**
 * Aduana de rutas de la web: nada de `..`, NADA absoluto (ni unix ni Windows),
 * segments vacíos incluidos. Un `archivosWeb` con `../../AndroidManifest.xml`
 * escribiría fuera del proyecto; y un `/etc/passwd` que se aceptara disfrazado
 * de relativo también es una mentira — por eso se rechaza en vez de recortarlo.
 */
export function rutaWebSegura(r: string): string | null {
  const crudo = String(r || "").trim().replace(/\\/g, "/");
  if (!crudo) return null;
  if (crudo.startsWith("/")) return null;              // absoluto unix
  if (/^[a-zA-Z]:/.test(crudo)) return null;           // C:\... en Windows
  const limpio = crudo.replace(/^\.\//, "");
  if (!limpio) return null;
  if (limpio.split("/").some((p) => p === ".." || p === "")) return null;
  return limpio;
}

function escapadoXml(v: string): string {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS ARCHIVOS, UNO POR UNO (cada texto es determinista: mismo insumo, mismo byte)
// ─────────────────────────────────────────────────────────────────────────────

function settingsGradle(carpetaProyecto: string): string {
  return `// Generado por CerebroNico · androidProyecto v1.0 — NO edits a ciegas.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = ${JSON.stringify(carpetaProyecto)}
include ':app'
`;
}

function buildGradleRaiz(): string {
  return `// Generado por CerebroNico — AGP ${AGP_VERSION} (sept-2026) con Gradle ${GRADLE_VERSION}.
plugins {
    id 'com.android.application' version '${AGP_VERSION}' apply false
}
`;
}

function gradleProperties(): string {
  return `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.caching=true
android.useAndroidX=true
android.nonTransitiveRClass=true
`;
}

function wrapperProperties(): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

function appBuildGradle(o: {
  appId: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
}): string {
  return `plugins {
    id 'com.android.application'
}

android {
    namespace '${o.appId}'
    compileSdk ${SDK_COMPILACION}
    buildToolsVersion '${BUILD_TOOLS_VERSION}'

    defaultConfig {
        applicationId "${o.appId}"
        // SUELO: viene de PISO_ANDROID (mobileExport), fuente única de la casa.
        minSdk ${o.minSdk}
        // Play exige targetear Android 16 (API ${SDK_OBJETIVO}) desde el 31-ago-2026.
        targetSdk ${SDK_OBJETIVO}
        versionCode ${o.versionCode}
        versionName "${o.versionName}"
    }

    buildTypes {
        debug {
            // Firmado con la clave de debug: el APK se instala tal cual.
            minifyEnabled false
        }
        release {
            // minifyEnabled false a propósito: sin dependencias propias que ofuscar,
            // y R8 añade un punto de fallo a un envoltorio de 2 clases.
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            // Sin keystore propio configurado, 'assembleRelease' deja el APK SIN FIRMAR.
            // Para Play hay que firmar: ver README-CEREBRONICO.md (apartado AAB).
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_${JDK_VERSION}
        targetCompatibility JavaVersion.VERSION_${JDK_VERSION}
    }
}

// La ÚNICA dependencia del proyecto (v1.57.7): WebViewAssetLoader +
// WebViewClientCompat, es decir, el origen https:// que permite Web Workers y
// localStorage fiable. Sale de google(), ya declarado en settings.gradle. Sin
// ella la web vive en file://, y desde ese origen el navegador rechaza crear
// Workers: el agente en segundo plano es imposible.
dependencies {
    implementation '${WEBKIT_ARTIFACTO}'
}
`;
}

function proguardRules(): string {
  return `# Generado por CerebroNico. 'minifyEnabled' está en false, así que hoy no se aplica.
# Si algún día activas R8 para release, conserva el puente del WebView:
#-keepclassmembers class fqcn.de.su.App { public *; }
`;
}

function manifiesto(o: { appId: string; nombreApp: string; necesitaRed: boolean; orientacion: string }): string {
  const permisoRed = o.necesitaRed
    ? `\n    <!-- Pedida explícitamente: la web llama a un backend. -->\n    <uses-permission android:name="android.permission.INTERNET" />\n`
    : `\n    <!-- Sin permiso de salida: la app carga solo sus assets locales.\n         Si la web necesita llamar a un backend, exporta con necesitaRed=true.\n         (Se escribe así a propósito: un comentar que cite el permiso literal\n          haría que un grep de permisos diera rojo donde no lo hay.) -->\n`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por CerebroNico · androidProyecto v1.0 -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permisoRed}
    <application
        android:allowBackup="true"
        android:icon="@drawable/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar"
        android:usesCleartextTraffic="false">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|density"
            android:screenOrientation="${o.orientacion}"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
}

/**
 * El envoltorio. Nota de honestidad: `setAllowFileAccess(true)` es necesario para
 * `file:///android_asset/`, y en API 30+ viene en false por defecto. No es un
 * descuido: es lo que hace que la web local cargue.
 */
function mainActivity(o: { appId: string; carpetaWeb: string; necesitaRed: boolean }): string {
  // Interceptor de URLs con el overload MODERNO (WebResourceRequest, API 21+): el
  // suelo de la casa es API 24, así que el deprecado (String) no aporta nada aquí.
  // Sin red, un enlace externo NO se traga en silencio: se abre en el navegador del
  // dispositivo. La red la maneja una app ajena, así que el permiso INTERNET sigue
  // sin pedirse (mínimo privilegio intacto).
  const interceptar = o.necesitaRed
    ? `                // Red permitida por elección del autor de la exportación: se carga aquí.
                return false;`
    : `                // Sin necesitaRed=true, el WebView no sale a la red: el enlace se abre
                // en el navegador del dispositivo (una app externa maneja la red).
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignorada) {
                    // Sin app que maneje el esquema (mailto/tel sin cliente): se bloquea.
                }
                return true;`;
  return `package ${o.appId};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;

/**
 * Generado por CerebroNico · androidProyecto v1.0.
 *
 * WebView que carga la web del proyecto DESDE UN ORIGEN REAL, no desde file://.
 * No es un capricho: bajo \`file://\` el motor rechaza crear Web Workers y
 * localStorage/IndexedDB no tienen un origen donde anclarse. Sirviendo los
 * assets por https con WebViewAssetLoader la web puede usar workers (el agente
 * en segundo plano), almacenamiento fiable entre arranques y rutas relativas.
 *
 * Cuesta la única dependencia externa del proyecto (androidx.webkit).
 */
public class MainActivity extends Activity {

    /** Origen bajo el que WebViewAssetLoader sirve \`android_asset/\`. */
    private static final String ORIGEN = "https://appassets.androidplatform.net";

    private static final String ENTRADA = ORIGEN + "/assets/${o.carpetaWeb}/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader cargador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        // localStorage/IndexedDB: aquí viven los chats guardados y la clave de
        // la app. Sin esto no se recuerda nada entre arranques.
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setDatabaseEnabled(true);
        // En false a propósito: ya no se carga por file://, así que no hace
        // falta abrir el sistema de archivos al WebView (Play lo marca).
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);

        web.setWebViewClient(new WebViewClientCompat() {

            @Override
            protected WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                final WebResourceResponse servido = cargador.shouldInterceptRequest(request.getUrl());
                return servido != null ? servido : super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                final Uri uri = request.getUrl();
                if (uri == null) return false;
                // "Local" ya no es el esquema file: es NUESTRO propio origen.
                if (ORIGEN.equals("https://" + uri.getHost())) {
                    return false;
                }
                final String scheme = uri.getScheme();
                if ("data".equals(scheme) || "blob".equals(scheme)) {
                    return false; // contenido generado en memoria: lo resuelve el WebView
                }
${interceptar}
            }
        });

        web.setWebChromeClient(new WebChromeClient());

        // Exportación que de verdad escribe. Un <a download> con URL blob NO
        // dispara el DownloadListener en el WebView de Android: fiarse sólo del
        // listener deja un "exportar" que parece funcionar y no genera archivo.
        // Este puente recibe el texto ya compuesto y lo escribe en el directorio
        // de la app, que no requiere NINGÚN permiso.
        //
        // Sólo quedan expuestos los métodos anotados (API 17+), así que inyectar
        // la Activity no abre al JavaScript el resto de su superficie.
        web.addJavascriptInterface(this, "CerebroNico");

        // Para descargas que sí llegan por URL ordinaria (no blob): se cede a una
        // app externa en vez de dejar la pulsación muerta.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignorada) {
                // Sin app que la maneje: no se rompe la navegación por esto.
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(ENTRADA);
        }

        setContentView(web);
    }

    /** window.CerebroNico.guardar("resumen.md", texto) → true si quedó en disco. */
    @JavascriptInterface
    public boolean guardar(String nombre, String contenido) {
        return escribeArchivo(nombre, contenido);
    }

    private boolean escribeArchivo(String nombre, String contenido) {
        try {
            if (contenido == null) return false;
            // Se sanea el nombre, no el contenido: un "../" en el archivo sí
            // podría sacar la escritura del directorio de la app.
            String limpio = (nombre == null ? "" : nombre).replaceAll("[^A-Za-z0-9._-]", "_");
            if (limpio.trim().isEmpty()) limpio = "cerebronico.txt";
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
            if (dir == null) dir = getFilesDir();
            if (!dir.isDirectory()) dir.mkdirs();
            File destino = new File(dir, limpio);
            Writer escritor = new OutputStreamWriter(new FileOutputStream(destino), StandardCharsets.UTF_8);
            try {
                escritor.write(contenido);
            } finally {
                escritor.close();
            }
            avisa("Guardado en " + destino.getAbsolutePath());
            return true;
        } catch (Exception e) {
            avisa("No se pudo guardar: " + e);
            return false;
        }
    }

    private void avisa(final String mensaje) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, mensaje, Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
}

function stringsXml(nombreApp: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapadoXml(nombreApp)}</string>
</resources>
`;
}

function colorsXml(color: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimario">${color}</color>
</resources>
`;
}

/** Icono: vector en lugar de PNG. Evita emitir binarios que el motor no puede verificar. */
function iconoVector(color: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="${color}" android:pathData="M0,0h108v108h-108z" />
    <path android:fillColor="#FFFFFF" android:pathData="M54,26a28,28 0 1,0 0,56a28,28 0 1,0 0,-56zM54,38a16,16 0 1,1 0,32a16,16 0 1,1 0,-32z" />
</vector>
`;
}

function gitignoreAndroid(): string {
  return `# Generado por CerebroNico — artefactos de Gradle/Studio, nunca se versionan.
.gradle/
build/
local.properties
*.iml
.idea/
captures/
.externalNativeBuild/
.cxx/
# Claves de firma: fuera del repo por diseño (guardián sin-claves de la casa).
*.keystore
*.jks
`;
}

function readme(o: ProyectoAndroidGenerado): string {
  return `# ${o.mision.abrir}

Proyecto Android generado por **CerebroNico** (\`androidProyecto\` v1.0) desde la web ya
construida de tu proyecto. No usa Capacitor: es un \`Activity\` + \`WebView\` con
**una sola dependencia**, \`androidx.webkit\`, que aporta \`WebViewAssetLoader\` — el
origen \`https://\` bajo el que la web puede tener Web Workers y almacenamiento
fiable. A cambio, la primera compilación necesita red para bajar ese artefacto
(vive en \`google()\`, no en Maven Central).

## Números (verificados, no inventados)

| Cosa | Valor | De dónde sale |
|---|---|---|
| AGP | ${AGP_VERSION} | developer.android.com — AGP 9.4 (sept-2026) |
| Gradle | ${GRADLE_VERSION} | requisito mínimo y por defecto de AGP ${AGP_VERSION} |
| Build Tools | ${BUILD_TOOLS_VERSION} | por defecto de AGP ${AGP_VERSION} |
| JDK | ${JDK_VERSION} | por defecto de AGP ${AGP_VERSION} |
| compileSdk / targetSdk | ${o.compilacionSdk} / ${o.targetSdk} | Play exige target API ${SDK_OBJETIVO} (Android 16) desde el 31-ago-2026 |
| **minSdk** | **${o.minSdk}** | \`PISO_ANDROID\` de la casa — ${o.minVersion} |

## Abrir y construir

1. Android Studio → **Open** → selecciona la carpeta \`android/\`.
2. Deja que sincronice (usa Gradle ${GRADLE_VERSION} y JDK ${JDK_VERSION}).
3. **Build → Build Bundle(s)/APK(s) → Build APK(s)** → APK de debug firmado, listo
   para instalar.
4. Para publicar: **Build → Generate Signed Bundle / APK → Android App Bundle (AAB)**.

O por terminal, desde \`android/\`:

\`\`\`bat
gradlew assembleDebug     ::  APK   -> app\\build\\outputs\\apk\\debug\\
gradlew bundleRelease     ::  AAB   -> app\\build\\outputs\\bundle\\release\\
\`\`\`

## Cómo se sirve la web — lee esto antes de culpar al envoltorio

La app abre \`https://appassets.androidplatform.net/assets/${o.carpetaWeb}/index.html\`,
que \`WebViewAssetLoader\` resuelve contra \`android_asset/${o.carpetaWeb}/\`. **No** es
\`file://\`, y es deliberado: bajo \`file://\` el motor rechaza crear Web Workers y
localStorage/IndexedDB no tienen origen donde anclarse.

⚠️ **Consecuencia obligatoria:** tu web tiene que estar construida con **rutas
relativas**. En Vite, \`base: "./"\` en \`vite.config.ts\` (o \`vite build --base=./\`).
Si sale con \`/assets/...\` absolutos, el WebView pedirá
\`/assets/...\` y **verás una pantalla en blanco aunque el APK esté bien**. Ese es el
fallo más común y no es del envoltorio.

## Exportar un archivo desde la web

\`<a download>\` con una URL \`blob:\` **no dispara** el \`DownloadListener\` del WebView
de Android: parece que funciona y no aparece nada. Por eso el envoltorio expone un
puente directo:

\`\`\`js
// window.CerebroNico.guardar(nombre, texto) -> true si quedó en disco
const ok = window.CerebroNico?.guardar("resumen.md", markdown);
if (!ok) { /* aquí sí tiene sentido el <a download> como respaldo */ }
\`\`\`

Escribe en el directorio de la app (\`Android/data/…/files/Documents\`), **sin pedir
ningún permiso**. El nombre se sanea; el Toast dice la ruta exacta. En un navegador
normal \`window.CerebroNico\` no existe, de ahí el \`?.\` — la misma web sigue valiendo
en escritorio.

## Lo que este generador NO te da (y por qué se dice aquí)

- **No viaja \`gradle-wrapper.jar\`**: es un binario y el motor no emite binarios que
  no pueda verificar. Dos caminos legítimos:
  (a) Android Studio regenera el wrapper al sincronizar; o
  (b) con Gradle instalado: \`gradle wrapper --gradle-version ${GRADLE_VERSION}\`.
- **El AAB de release sale sin firmar** hasta que crees tu keystore:
  \`keytool -genkey -v -keystore mi-app.keystore -alias mi-app -keyalg RSA -keysize 2048 -validity 10000\`
  y lo declares en \`signingConfigs\`. \`*.keystore\` y \`*.jks\` están en
  \`android/.gitignore\`: la clave nunca viaja en el repo ni en el ZIP.
- **Sin permiso de red** salvo que la exportes con \`necesitaRed=true\`.

## Volver a exportar tras cambiar la web

La web vive en \`app/src/main/assets/${o.carpetaWeb}/\`. Al re-exportar desde el IDE se
sobrescribe esa carpeta; el resto del proyecto Android se conserva tal cual.
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL ENSAMBLADO PURO
// ─────────────────────────────────────────────────────────────────────────────

export function generarProyectoAndroid(op: OpcionesProyectoAndroid): ProyectoAndroidGenerado {
  const avisos: string[] = [];
  const nombreApp = String(op.nombreApp || "").trim() || "App CerebroNico";

  let appId = String(op.appId || "").trim();
  if (appId && !appIdValido(appId)) {
    avisos.push(`appId «${appId}» no es válido (dominio al revés, minúsculas y puntos): se deriva del nombre.`);
    appId = "";
  }
  if (!appId) appId = appIdDesdeNombre(nombreApp, op.dominio || "cerebronico.app");

  // «no lo dijo» y «lo dijo mal» son casos DISTINTOS: solo el segundo avisa. Avisar
  // por cada campo que nadie rellenó convierte los avisos en ruido de arranque y
  // tapa el aviso que sí importa (la misma clase de bug que se corrigió arriba con
  // la orientación, descubierto por la propia suite al escribirla).
  let versionName = "1.0.0";
  if (op.versionName !== undefined) {
    if (/^\d+(\.\d+){0,2}$/.test(String(op.versionName))) versionName = String(op.versionName);
    else avisos.push(`versionName «${op.versionName}» no es numérica: se usa "1.0.0".`);
  }
  let versionCode = 1;
  if (op.versionCode !== undefined) {
    if (Number.isInteger(op.versionCode) && op.versionCode > 0) versionCode = op.versionCode;
    else avisos.push(`versionCode «${op.versionCode}» no es un entero > 0: se usa 1.`);
  }

  const color = colorSeguro(op.colorPrimario, avisos);
  // «no la dijo» y «la dijo mal» son casos distintos: solo el segundo avisa.
  const orientacionElegida = orientacionValida(op.orientacion);
  if (op.orientacion !== undefined && orientacionElegida === undefined) {
    avisos.push(`orientación «${op.orientacion}» no reconocida: se usa "portrait" (válidas: ${ORIENTACIONES.join(", ")}).`);
  }
  const orientacion: Orientacion = orientacionElegida ?? "portrait";
  const necesitaRed = op.necesitaRed === true;
  const carpeta = rutaWebSegura(op.carpeta || "android") || "android";
  const carpetaWeb = rutaWebSegura(op.carpetaWeb || "www") || "www";

  // La web: se filtra ruta por ruta y se ordena (determinismo byte a byte).
  const web: Array<{ ruta: string; contenido: string }> = [];
  for (const f of op.archivosWeb || []) {
    const segura = rutaWebSegura(f.ruta);
    if (!segura) {
      avisos.push(`ruta de asset rechazada por insegura: «${f.ruta}»`);
      continue;
    }
    web.push({ ruta: segura, contenido: String(f.contenido ?? "") });
  }
  web.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));

  // Binarios de la web (png, jpg, woff2, mp3…): se COPIAN del disco del usuario,
  // no se generan. Pasan la misma aduana de ruta que el texto.
  const binarios: Array<{ ruta: string; abs: string; bytes: number }> = [];
  for (const b of op.binariosWeb || []) {
    const segura = rutaWebSegura(b.ruta);
    if (!segura) {
      avisos.push(`asset binario rechazado por ruta insegura: «${b.ruta}»`);
      continue;
    }
    if (!Number.isInteger(b.bytes) || b.bytes < 0) {
      avisos.push(`asset binario «${b.ruta}» declara ${b.bytes} bytes: se descarta (no se inventa un tamaño).`);
      continue;
    }
    if (!b.abs || !existsSync(b.abs)) {
      avisos.push(`asset binario «${b.ruta}» no está en disco (${b.abs || "sin ruta"}): se descarta en vez de prometerlo.`);
      continue;
    }
    binarios.push({ ruta: segura, abs: b.abs, bytes: b.bytes });
  }

  const hayIndice = web.some((f) => f.ruta === "index.html");
  if (!hayIndice) {
    avisos.push(`⚠ la web exportada no tiene «index.html»: el APK se construye pero abrirá en blanco. Compila la web (o revisa carpetaSalida) y vuelve a exportar.`);
  }

  const paq = appId.split(".").join("/");
  const pref = `${carpeta}/`;
  const archivos: ArchivoGenerado[] = [
    { ruta: `${pref}settings.gradle`, contenido: settingsGradle(nombreApp) },
    { ruta: `${pref}build.gradle`, contenido: buildGradleRaiz() },
    { ruta: `${pref}gradle.properties`, contenido: gradleProperties() },
    { ruta: `${pref}gradle/wrapper/gradle-wrapper.properties`, contenido: wrapperProperties() },
    { ruta: `${pref}app/build.gradle`, contenido: appBuildGradle({ appId, versionName, versionCode, minSdk: PISO_ANDROID.api }) },
    { ruta: `${pref}app/proguard-rules.pro`, contenido: proguardRules() },
    { ruta: `${pref}app/src/main/AndroidManifest.xml`, contenido: manifiesto({ appId, nombreApp, necesitaRed, orientacion }) },
    { ruta: `${pref}app/src/main/java/${paq}/MainActivity.java`, contenido: mainActivity({ appId, carpetaWeb, necesitaRed }) },
    { ruta: `${pref}app/src/main/res/values/strings.xml`, contenido: stringsXml(nombreApp) },
    { ruta: `${pref}app/src/main/res/values/colors.xml`, contenido: colorsXml(color) },
    { ruta: `${pref}app/src/main/res/drawable/ic_launcher.xml`, contenido: iconoVector(color) },
    { ruta: `${pref}.gitignore`, contenido: gitignoreAndroid() },
  ];
  // Los assets van TODOS ordenados por ruta: así la huella no depende del orden
  // en que el llamante los pasó (mismo insumo, mismo byte).
  const activos: ArchivoGenerado[] = [
    ...web.map((f) => ({ ruta: `${pref}app/src/main/assets/${carpetaWeb}/${f.ruta}`, contenido: f.contenido })),
    ...binarios.map((b) => ({
      ruta: `${pref}app/src/main/assets/${carpetaWeb}/${b.ruta}`,
      contenido: "",
      fuenteBinaria: b.abs,
      bytes: b.bytes,
    })),
  ].sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
  for (const a of activos) archivos.push(a);

  const generado: ProyectoAndroidGenerado = {
    appId,
    nombrePaquete: appId,
    versionName,
    versionCode,
    minSdk: PISO_ANDROID.api,
    minVersion: androidDesdeApi(PISO_ANDROID.api),
    targetSdk: SDK_OBJETIVO,
    targetVersion: androidDesdeApi(SDK_OBJETIVO),
    compilacionSdk: SDK_COMPILACION,
    carpeta,
    carpetaWeb,
    entradaWeb: `${pref}app/src/main/assets/${carpetaWeb}/index.html`,
    archivos,
    mision: {
      abrir: `App «${nombreApp}» — proyecto Android`,
      apk: "gradlew assembleDebug",
      aab: "gradlew bundleRelease",
      salidaApk: `${carpeta}/app/build/outputs/apk/debug/`,
      salidaAab: `${carpeta}/app/build/outputs/bundle/release/`,
    },
    avisos,
  };
  generado.archivos.unshift({ ruta: `${pref}README-CEREBRONICO.md`, contenido: readme(generado) });
  return generado;
}

/**
 * Huella sha256 del proyecto completo (ruta+contenido, en el orden emitido).
 * Los binarios se anotan por `ruta + bytes`, no por su contenido: el motor no
 * lee megas ajenos para firmar el plano, y se dice aquí en vez de fingir que la
 * huella cubre cada byte del asset.
 */
export function huellaDelProyecto(gen: { archivos: ArchivoGenerado[] }): string {
  const h = createHash("sha256");
  for (const a of gen.archivos) {
    h.update(a.ruta);
    h.update("\u0000");
    h.update(a.fuenteBinaria ? `bin:${a.bytes ?? 0}` : a.contenido);
    h.update("\u0000");
  }
  return h.digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// LEER LA WEB COMPILADA (para que el llamante no reimplemente esta aduana)
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que un APK puede llevar como texto; lo demás viaja como copia binaria. */
const EXT_TEXTO = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".svg", ".txt", ".xml", ".webmanifest"]);
/** Carpetas/archivos que no tienen sitio dentro de un APK. */
const SALTAR_EN_WEB = new Set(["node_modules", ".git", "Thumbs.db", ".DS_Store"]);

export interface LecturaWeb {
  texto: Array<{ ruta: string; contenido: string }>;
  binarios: Array<{ ruta: string; abs: string; bytes: number }>;
  /** Todo lo que NO entró, con el motivo. Una pérdida declarada no es un bug. */
  omitidos: Array<{ ruta: string; motivo: string }>;
  raiz: string | null;
}

/**
 * Lee la carpeta de salida de la web (`dist/`, `build/`, `www/`) partida en
 * texto y binarios. Si la carpeta no existe, lo dice: un APK hecho con la versión
 * anterior del proyecto es peor que una exportación que se detiene.
 */
export function leerWebParaAndroid(
  dir: string,
  tope: { archivos?: number; bytesPorArchivo?: number } = {}
): LecturaWeb {
  const maxArchivos = tope.archivos ?? 600;
  const maxBytes = tope.bytesPorArchivo ?? 8_000_000;
  const texto: LecturaWeb["texto"] = [];
  const binarios: LecturaWeb["binarios"] = [];
  const omitidos: LecturaWeb["omitidos"] = [];
  let abs = "";
  try {
    abs = resolve(dir);
  } catch {
    return { texto, binarios, omitidos: [{ ruta: dir, motivo: "ruta ilegible" }], raiz: null };
  }
  if (!existsSync(abs)) {
    return {
      texto,
      binarios,
      omitidos: [{ ruta: dir, motivo: "la carpeta de salida NO existe: falta compilar la web (npm run build)" }],
      raiz: null,
    };
  }

  const pila: string[] = [""];
  let contados = 0;
  while (pila.length > 0) {
    const sub = pila.pop() as string;
    let items: Array<{ nombre: string; dir: boolean; file: boolean }> = [];
    try {
      items = readdirSync(join(abs, sub), { withFileTypes: true })
        .map((d) => ({ nombre: d.name, dir: d.isDirectory(), file: d.isFile() }))
        .sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
    } catch {
      continue;
    }
    for (const it of items) {
      const rel = sub ? `${sub}/${it.nombre}` : it.nombre;
      if (it.dir) {
        if (it.nombre.startsWith(".") || SALTAR_EN_WEB.has(it.nombre)) continue;
        pila.push(rel);
        continue;
      }
      if (!it.file) continue;
      let st;
      try {
        st = statSync(join(abs, rel));
      } catch {
        omitidos.push({ ruta: rel, motivo: "no se pudo leer" });
        continue;
      }
      const ext = extname(it.nombre).toLowerCase();
      if (ext === ".map") {
        omitidos.push({ ruta: rel, motivo: "sourcemaps no viajan en el APK (pesan y no sirven en producción)" });
        continue;
      }
      if (st.size > maxBytes) {
        omitidos.push({ ruta: rel, motivo: `${st.size} bytes superan el tope por archivo (${maxBytes})` });
        continue;
      }
      if (contados >= maxArchivos) {
        omitidos.push({ ruta: rel, motivo: `tope de ${maxArchivos} archivos alcanzado` });
        continue;
      }
      contados++;
      if (EXT_TEXTO.has(ext)) {
        try {
          texto.push({ ruta: rel, contenido: readFileSync(join(abs, rel), "utf-8") });
        } catch {
          omitidos.push({ ruta: rel, motivo: "se lee como texto pero falló (¿codificación rara?)" });
        }
      } else {
        binarios.push({ ruta: rel, abs: join(abs, rel), bytes: st.size });
      }
    }
  }
  return { texto, binarios, omitidos, raiz: abs };
}

/**
 * ESCRITURA EN DISCO con guarda: nada se escribe fuera de `raiz`, y sin
 * sobrescribir a ciegas la web de un proyecto Android que ya exista se avisa.
 */
export function escribirProyectoAndroid(
  raiz: string,
  gen: ProyectoAndroidGenerado,
  opts: { forzar?: boolean } = {}
): { escritos: string[]; omitidos: string[]; conflictos: string[] } {
  const abs = resolve(raiz);
  const escritos: string[] = [];
  const omitidos: string[] = [];
  const conflictos: string[] = [];
  for (const a of gen.archivos) {
    const destino = resolve(abs, a.ruta);
    if (destino !== abs && !destino.startsWith(abs + sep)) {
      omitidos.push(a.ruta);
      continue;
    }
    // Binario: se copian los bytes de un archivo REAL. Si ya no está, se omite y
    // se dice — no se sustituye por un placeholder que haría un APK "verde" roto.
    if (a.fuenteBinaria) {
      if (!existsSync(a.fuenteBinaria)) {
        omitidos.push(a.ruta);
        continue;
      }
      if (!opts.forzar && existeYDistintoPorTamano(destino, a.bytes ?? -1)) {
        conflictos.push(a.ruta);
        continue;
      }
      mkdirSync(dirname(destino), { recursive: true });
      copyFileSync(a.fuenteBinaria, destino);
      escritos.push(a.ruta);
      continue;
    }
    if (existsSync(destino)) {
      let igual = false;
      try {
        igual = readFileSync(destino, "utf-8") === a.contenido;
      } catch {
        igual = false;
      }
      if (igual) {
        escritos.push(a.ruta); // idéntico: no se reescribe, pero cuenta como presente
        continue;
      }
      // NO PISA SIN SOBRESCRIBIR (la regla de la casa, la del pack Creador): un
      // `MainActivity.java` editado a mano vale más que un re-exporte cómodo.
      if (!opts.forzar) {
        conflictos.push(a.ruta);
        continue;
      }
    }
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, a.contenido, "utf-8");
    escritos.push(a.ruta);
  }
  return { escritos, omitidos, conflictos };
}

/**
 * ¿En disco hay ya un archivo de OTRO tamaño? Es la comparación barata para
 * binarios (leer megas para compararlos no tiene sentido): si el tamaño no
 * cuadra con el plano, alguien lo cambió y no se pisa sin avisar.
 */
function existeYDistintoPorTamano(ruta: string, bytes: number): boolean {
  try {
    return existsSync(ruta) && statSync(ruta).size !== bytes;
  } catch {
    return true; // no se pudo medir: se trata como distinto (falla cerrado)
  }
}

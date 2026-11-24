# GUÍA — INSTALADOR EXE (Windows) Y EXPORTACIÓN ANDROID (APK / AAB)

> El menú **Pro → Avanzado** cita este archivo. Si lees esto, ya existe: la
> referencia dejó de ser una promesa hueca. Fecha: 2026-10-11 · CerebroNico v1.56.8.

Hay que separar dos cosas que se confundían:

| | **QUÉ se empaqueta** | **Dónde vive la cadena** |
|---|---|---|
| **EXE** | el **CerebroNico IDE** (Electron + server + Python embebido) | `compilar_exe_windows.bat` |
| **APK / AAB** | **LA APP QUE EL MOTOR CREÓ** (web del proyecto del usuario) | `src/engine/mobileExport.ts` (analiza) + `src/engine/androidProyecto.ts` (produce) |

Un APK **no** es el IDE: el motor vive en el PC. Esto lo dice `mobileExport.ts`
desde su versión 2.2 y no es negociable.

---

## 1. EXE para Windows

```bat
compilar_exe_windows.bat
```

Cadena completa (5 pasos, con abort si falta algo):

1. `npm install` — dependencias Node.
2. `preparar-python-embed.mjs` — CPython portable para Windows. Se descarga **una
   sola vez** y luego usa la caché `runtime\*.zip` verificada por **SHA-256**, así
   que la compilación puede ser offline.
3. `npm run build` — Vite (UI) + esbuild (`server.mjs`).
4. `build_backend.bat` — EXEs de PyInstaller (**opcional**: sin ellos cubre el
   Python embebido).
5. `npm run dist` — `verificar-artefactos.mjs` (ABORTA si falta algo) y
   `electron-builder`.

Salida (`package.json → build.win` → `nsis` + `portable`, x64):

- `dist_electron\CerebroNico IDE Setup (versión).exe` — instalador NSIS.
- `dist_electron\win-unpacked\CerebroNico IDE.exe` — portable.
- `dist\CerebroNicoAgent.exe`, `cerebronico_bridge.exe`, `hindsight_daemon.exe`,
  `creador_daemon.exe` — refuerzo opcional.

El usuario final **no** necesita Python, pip, venv, `requirements.txt` ni PyPI:
`resources\python-embed\` ejecuta los `.py` de `:5000`, `:5100` y `:5102`.

Reglas de estos `.bat` (por algo están escritos así): **CRLF, sin tildes, solo
`if`/`goto`, `pause` real.**

---

## 2. Android: APK / AAB desde la app que creó el motor

### 2.1 El suelo, y por qué no se puede prometer Android 4.4.2 ni 6.0

`PISO_ANDROID` (`mobileExport.ts`) — **única fuente** de este número:

| API | Android | ¿Sirve? |
|---|---|---|
| 19 | 4.4 KitKat | ❌ por debajo |
| 23 | 6.0 Marshmallow | ❌ por debajo |
| **24** | **7.0 Nougat** | ✅ **mínimo real** |
| 36 | 16 | objetivo exigido por Play |

Por qué: el bundle que genera este IDE es JavaScript moderno (React + Vite) y el
WebView de 4.4.2 no lo ejecuta. `tests/export.test.ts` comprueba que API 23 y API
19 **no** pasan. El texto del menú Pro decía «Android 6+»: era falso contra tu
propio test, y en v1.56.8 se corrigió.

### 2.2 Los números del proyecto generado (verificados, no inventados)

De <https://developer.android.com/build/releases/agp-9-4-0-release-notes>
(AGP 9.4, sept-2026), consultado el 2026-10-11:

| | Valor |
|---|---|
| Android Gradle Plugin | **9.4.0** |
| Gradle (mínimo y por defecto) | **9.6.0** |
| SDK Build Tools | **36.0.0** |
| JDK | **17** |
| API máxima soportada por AGP 9.4 | 37 |

Y de la política de Google Play: desde el **31-ago-2026**, las apps nuevas y sus
actualizaciones deben targetear **Android 16 (API 36)**. Por eso
`compileSdk = targetSdk = 36`.

### 2.3 Generar el proyecto (lo que antes faltaba)

Antes, el paso 1 de la exportación era `npm install @capacitor/core ...`: la
exportación se resolvía **saliendo a internet**. En un Dell de 8 GB, sin red o
con la cuota gastada, eso es la exportación sin hacer.

`src/engine/androidProyecto.ts` produce el proyecto `android/` **completo** a
partir de la web ya construida: **sin Capacitor y sin dependencias externas** (un
`Activity` + `WebView` de framework que carga `file:///android_asset/www/index.html`).
Cero artefactos que descargar = abre aunque no haya red.

Invariants que fija `tests/androidProyecto.test.ts` (85 comprobaciones, dada de
alta en `npm run validar`): estructura completa, `namespace` ↔ ruta del `.java`
coherente, `minSdk` leído de `PISO_ANDROID` (no reescrito), aduana
anti-traversal de assets, permiso de red **solo** si `necesitaRed=true`,
determinismo sha256, y honestidad sobre lo que **no** se emite.

### 2.4 Abrir y construir en Android Studio

1. **File → Open** → selecciona la carpeta `android/` del proyecto exportado.
2. Deja sincronizar (Gradle 9.6.0, JDK 17).
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)** → APK de debug firmado, se
   instala tal cual.
4. Para publicar: **Build → Generate Signed Bundle / APK → Android App Bundle
   (AAB)**.

Por terminal, desde `android/`:

```bat
gradlew assembleDebug     ::  APK -> app\build\outputs\apk\debug\
gradlew bundleRelease     ::  AAB -> app\build\outputs\bundle\release\
```

### 2.5 Lo que el generador NO te da, dicho aquí en vez de escondido

- **`gradle-wrapper.jar` no viaja**: es un binario y el motor no emite binarios
  que no pueda verificar. Dos caminos legítimos: Android Studio regenera el
  wrapper al sincronizar, o con Gradle instalado
  `gradle wrapper --gradle-version 9.6.0`.
- **El `assembleRelease` / `bundleRelease` sale SIN FIRMAR** hasta que crees tu
  keystore:
  ```bat
  keytool -genkey -v -keystore mi-app.keystore -alias mi-app -keyalg RSA -keysize 2048 -validity 10000
  ```
  y lo declares en `signingConfigs`. `android/.gitignore` ya excluye `*.keystore`
  y `*.jks`: la clave de firma **nunca** viaja en el repo ni en el ZIP.
- **Sin permiso `INTERNET`** por defecto (mínimo privilegio). Si tu app llama a
  un backend, exporta con `necesitaRed=true`.
- **Sin `minifyEnabled`**: con dos clases propias y cero dependencias, R8 solo
  añade un punto de fallo. Está comentado en `app/build.gradle` para que nadie lo
  "active por costumbre".

### 2.6 La ruta alternativa con Capacitor (si tu app necesita APIs nativas)

Si la app necesita cámara, notificaciones, plugins nativos, etc., Capacitor es el
camino correcto y `mobileExport.pasosDeExportacion()` los sigue enumerando:

```bat
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init
npm run build
npx cap add android
npx cap sync android
cd android && gradlew.bat assembleDebug
```

Elección honesta: **envoltorio propio** = nada de red, todo controlado;
**Capacitor** = puente nativo, a cambio de npm y de su ciclo de versiones.

---

## 3. Volver a exportar tras cambiar la web

La web vive en `android/app/src/main/assets/www/`. Al re-exportar se sobrescribe
esa carpeta; el resto del proyecto Android se conserva. Cada vez que cambies la
web: `npm run build` y luego re-exporta (con Capacitor: `npx cap sync android`).

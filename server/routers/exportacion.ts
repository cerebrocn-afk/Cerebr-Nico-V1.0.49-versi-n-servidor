/**
 * exportacion.ts — ROUTER DE EXPORTACIÓN (Fase 2 · tanda de exportación, v1.56.8)
 * ==============================================================================
 * QUÉ ES: el dominio `export` sale del monolito `server.ts` y añade la ruta que
 * faltaba. Las dos rutas previas (`/api/export/targets` y
 * `/api/export/android/prepare`) se mueven **tal cual**: la regla de la Fase 2 es
 * «se mueve, no se mejora», para que un cambio de archivo no sea una ocasión de
 * romper una respuesta que ya estaba contratada.
 *
 * POR QUÉ AQUÍ Y NO EN server.ts: el trinquete de `contrato-rutas.json` dice que
 * el monolito no puede crecer (la Fase 2 es partir, no añadir). Registrar por
 * delegación añade una línea en el monolito y le quita ~180. El contrato se
 * REGENERA con `node scripts/superficie.mjs` — no se edita a mano, porque un
 * contrato editable es un trinquete que se afloja solo.
 *
 * LA RUTA NUEVA (`POST /api/export/android/proyecto`): hasta hoy, exportar a
 * Android escribía `capacitor.config.json` y una guía de pasos cuyo paso 1 era
 * `npm install @capacitor/...`. Es decir: el IDE te explicaba cómo salir a buscar
 * Capacitor por internet, y ahí terminaba su trabajo. Esta ruta PRODUCE el
 * proyecto `android/` completo (delegate en `src/engine/androidProyecto.ts`), así
 * que el usuario abre Android Studio y pulsa Build → APK / AAB.
 *
 * ESTATUS HONESTO: el proyecto se GENERA aquí. Desde v1.56.9 también se COMPILA
 * aquí (`POST /api/export/android/build`) CUANDO la máquina tiene cómo: el endpoint
 * sondea wrapper/jar/gradle-del-sistema y, si no hay ruta legítima, lo dice con la
 * solución concreta en vez de lanzar un `gradlew` a ciegas. Un `GET` del trabajo
 * devuelve el log real y el fallo clasificado; el APK se entrega solo si existe en
 * disco y pesa lo que debe (`apkVerificado`). Ninguna respuesta de esta familia
 * finge haber compilado nada.
 */
import fs from "node:fs";
import path from "node:path";
// v1.56.9 · el botón exportar→APK: qué Gradle usar y cómo leer sus fallos vive en
// un módulo puro y probado (apkBuild.ts), no en este archivo.
import {
  rutaRelApkDebug,
  apkVerificado,
} from "../../src/engine/apkBuild";
import {
  sondearHerramientasAndroid as sondearMaquina,
  leerProyectoSandbox,
  lanzarCompilacionApk,
  buscarTrabajoApk,
} from "../fabricaApk"; // v1.57.17 · la fábrica compartida botón/chat
// v1.0.14 · «Preparar herramientas (una vez)»: el toolchain del APK lo baja la
// propia IDE a <raíz de datos>/.cerebronico/herramientas. Plan puro en
// src/engine/toolchainPlan.ts; acá solo el cable HTTP.
import {
  lanzarAprovisionamiento,
  estadoProvisionParaCliente,
  trabajoProvisionVivo,
  herramientasDirPorDefecto,
} from "../aprovisionarToolchain";
import { planDeAprovisionamiento, faltanHerramientas, rutasHerramientas, pesoTotal } from "../../src/engine/toolchainPlan";
import { spawnSync } from "node:child_process";
import type express from "express";
import type { Request, Response } from "express";
import {
  analizarProyecto,
  veredictoAndroid,
  pasosDeExportacion,
  configCapacitor,
  appIdValido,
  appIdDesdeNombre,
  PISO_ANDROID,
} from "../../src/engine/mobileExport";
import {
  generarProyectoAndroid,
  escribirProyectoAndroid,
  leerWebParaAndroid,
  huellaDelProyecto,
  orientacionValida,
  AGP_VERSION,
  GRADLE_VERSION,
} from "../../src/engine/androidProyecto";

export interface DepsExportacion {
  /** Raíz del proyecto del usuario (la misma que ve el sandbox). */
  projectRoot: string;
  /** El guard v1.7.0: las rutas que escriben en disco exigen autorización. */
  sandboxAuthorized: (req: Request) => boolean;
}

/** Las rutas que registra este módulo: la lista se comprueba, no se decora. */
export const RUTAS_EXPORTACION = [
  "GET /api/export/targets",
  "POST /api/export/android/prepare",
  "POST /api/export/android/proyecto",
  "POST /api/export/android/build",
  "GET /api/export/android/build/:id",
  "GET /api/export/android/apk",
  // v1.0.14 · el clic que consigue el toolchain (antes el build morría en
  // «abrí Android Studio»; ahora la IDE baja JDK 17 + Gradle + SDK y reintenta).
  "POST /api/export/android/provision",
  "GET /api/export/android/provision",
] as const;

export function registrarExportacion(app: express.Express, deps: DepsExportacion): void {
  const PROJECT_ROOT = deps.projectRoot;

  // ─── movidos tal cual desde server.ts (v1.56.8, Fase 2) ────────────────────

  /** Sondeo REAL de la máquina: vive en server/fabricaApk.ts (v1.57.17) para que el botón y el chat midan con la misma cinta. */
  const sondearHerramientasAndroid = () => sondearMaquina(PROJECT_ROOT);

  /** Qué proyectos sabe leer el espacio de trabajo ahora mismo (misma lectura para rutas y herramienta). */
  const leerProyectoDelSandbox = () => leerProyectoSandbox(PROJECT_ROOT);

  app.get("/api/export/targets", (_req: Request, res: Response) => {
    const proyecto = leerProyectoDelSandbox();
    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    return res.json({
      ok: true,
      proyecto,
      maquina: herramientas,
      objetivos: [
        {
          id: "web",
          nombre: "Web (HTML+JS)",
          disponible: proyecto.comandoBuild !== null,
          detalle: `Se genera la carpeta «${proyecto.carpetaSalida}» con «${proyecto.comandoBuild || "—"}».`,
        },
        {
          id: "windows",
          nombre: "Windows x64 (instalador NSIS + portable)",
          disponible: true,
          detalle: "Se empaqueta el propio IDE con electron-builder: npm run dist.",
        },
        {
          id: "android",
          nombre: "Android — APK",
          disponible: android.puedeConstruir,
          detalle: android.puedeConstruir
            ? `Listo para construir. Mínimo admitido: ${PISO_ANDROID.version} (API ${PISO_ANDROID.api}).`
            : `No se puede todavía. Falta: ${android.faltan.join(" · ")}`,
        },
      ],
      android,
      piso: PISO_ANDROID,
    });
  });

  /**
   * Prepara el proyecto del sandbox para Android: escribe `capacitor.config.json`
   * y una guía con los pasos. NO ejecuta la instalación ni el build: eso son
   * comandos que cambian el proyecto del usuario y se hacen a la vista.
   */
  app.post("/api/export/android/prepare", (req: Request, res: Response) => {
    // v1.7.0 · SEGURIDAD: escribe en la raíz del proyecto.
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const proyecto = leerProyectoDelSandbox();
    if (!proyecto.exportableAAndroid) {
      return res.status(400).json({ ok: false, error: proyecto.razon, proyecto });
    }

    const pedido = typeof req.body?.appId === "string" ? req.body.appId.trim() : "";
    const appId = pedido || appIdDesdeNombre(proyecto.nombre);
    if (!appIdValido(appId)) {
      return res.status(400).json({
        ok: false,
        error:
          `«${appId}» no sirve como appId de Android. Tiene que ser un dominio al revés, en minúsculas y sin empezar por número ` +
          `(ejemplo: com.tunombre.${proyecto.nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "app"}).`,
      });
    }

    const config = configCapacitor({ appId, nombreApp: proyecto.nombre, webDir: proyecto.carpetaSalida });
    const pasos = pasosDeExportacion(proyecto);
    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    const guia = [
      `# Exportar «${proyecto.nombre}» a Android`,
      ``,
      `Generado por CerebroNico IDE. **Esto no es CerebroNico en Android**: es TU app`,
      `empaquetada como APK. CerebroNico es la herramienta que la construye.`,
      ``,
      `## Requisitos en esta máquina`,
      ``,
      ...android.requisitos.map((r) => `- [${r.ok ? "x" : " "}] ${r.nombre} — encontrado: ${r.encontrado}${r.ok ? "" : `\n      → ${r.comoResolver}`}`),
      ``,
      `## Versión mínima de Android`,
      ``,
      `**${PISO_ANDROID.version} (API ${PISO_ANDROID.api})**. Cerrado en el archivo \`capacitor.config.json\` y en`,
      `el proyecto Android que se genere.`,
      ``,
      `${PISO_ANDROID.nota}`,
      ``,
      `Fuente: ${PISO_ANDROID.fuente}.`,
      ``,
      `## Pasos`,
      ``,
      ...pasos.map((p) => `${p.orden}. **${p.titulo}**\n   \`\`\`\n   ${p.comando}\n   \`\`\`\n   ${p.queHace}`),
      ``,
      `## Después`,
      ``,
      `- El APK queda en \`android/app/build/outputs/apk/debug/\`.`,
      `- Para publicar: \`gradlew.bat assembleRelease\` y **firmar** el APK. Sin firma, Android avisa al instalar.`,
      `- Cada vez que cambies la web: \`npm run build\` y luego \`npx cap sync android\`.`,
      ``,
      `## ¿Y sin Capacitor?`,
      ``,
      `La ruta POST /api/export/android/proyecto genera el proyecto \`android/\` completo`,
      `sin dependencias externas, para abrirlo en Android Studio y sacar APK o AAB.`,
      ``,
    ].join("\n");

    const escritos: string[] = [];
    try {
      const rutaConfig = path.join(PROJECT_ROOT, "capacitor.config.json");
      fs.writeFileSync(rutaConfig, config, "utf-8");
      escritos.push("capacitor.config.json");
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: `No se pudo escribir capacitor.config.json: ${e?.message || e}` });
    }
    try {
      fs.writeFileSync(path.join(PROJECT_ROOT, "GUIA-ANDROID.md"), guia, "utf-8");
      escritos.push("GUIA-ANDROID.md");
    } catch {}

    return res.json({
      ok: true,
      appId,
      webDir: proyecto.carpetaSalida,
      escritos,
      pasos,
      puedeConstruir: android.puedeConstruir,
      faltan: android.faltan,
      message: android.puedeConstruir
        ? `Preparado. Escritos: ${escritos.join(", ")}. La máquina tiene todo lo necesario para construir el APK.`
        : `Preparado. Escritos: ${escritos.join(", ")}. Pero todavía NO se puede construir: falta ${android.faltan.join(" · ")}.`,
    });
  });

  // ─── LA RUTA NUEVA: producir el proyecto Android, no solo explicar cómo ─────

  /**
   * Genera `android/` a partir de la web YA COMPILADA del proyecto del usuario.
   * Escribe en disco, así que lleva el guard de v1.7.0. No ejecuta Gradle ni
   * descarga nada: compilar el APK es acción del usuario, a la vista.
   */
  app.post("/api/export/android/proyecto", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });

    const proyecto = leerProyectoDelSandbox();
    if (!proyecto.exportableAAndroid) {
      return res.status(400).json({ ok: false, error: proyecto.razon, proyecto });
    }

    const cuerpo = req.body || {};
    const b = (k: string) => (typeof cuerpo[k] === "string" ? cuerpo[k].trim() : "");
    const pedido = b("appId");
    const appId = pedido || appIdDesdeNombre(proyecto.nombre);
    if (!appIdValido(appId)) {
      return res.status(400).json({
        ok: false,
        error:
          `«${appId}» no sirve como appId de Android: dominio al revés, en minúsculas, sin empezar por número ` +
          `(ejemplo: com.tunombre.${proyecto.nombre.toLowerCase().replace(/[^a-z0-9]/g, "") || "app"}).`,
      });
    }

    // La web tiene que estar COMPILADA. Generar el proyecto con la web anterior
    // daría un APK verde que empaqueta cosas viejas: se corta y se dice.
    const leido = leerWebParaAndroid(path.join(PROJECT_ROOT, proyecto.carpetaSalida));
    if (!leido.raiz) {
      return res.status(400).json({
        ok: false,
        error:
          `No encontré la carpeta de salida «${proyecto.carpetaSalida}». Compila la web antes de exportar` +
          (proyecto.comandoBuild ? ` («${proyecto.comandoBuild}»)` : "") +
          `. Sin esto el APK saldría con una versión anterior o en blanco.`,
        pista: leido.omitidos[0]?.motivo,
      });
    }
    if (!leido.texto.some((f) => f.ruta === "index.html")) {
      return res.status(400).json({
        ok: false,
        error: `«${proyecto.carpetaSalida}» no tiene index.html: el WebView abriría en blanco. Revisa la carpeta de salida del build.`,
        archivosVistos: leido.texto.length + leido.binarios.length,
      });
    }

    let gen;
    try {
      gen = generarProyectoAndroid({
        nombreApp: b("nombreApp") || proyecto.nombre,
        appId,
        versionName: b("versionName") || proyecto.version || "1.0.0",
        versionCode: Number.isInteger(Number(cuerpo.versionCode)) && Number(cuerpo.versionCode) > 0 ? Number(cuerpo.versionCode) : 1,
        colorPrimario: b("colorPrimario") || undefined,
        // `b()` devuelve string ancho: hay que ESTRECHARLO al tipo, no colárselo
        // tal cual (TS2322) ni fingir que una cadena cualquiera es una orientación.
        orientacion: orientacionValida(cuerpo.orientacion) ?? "portrait",
        necesitaRed: cuerpo.necesitaRed === true,
        archivosWeb: leido.texto,
        binariosWeb: leido.binarios,
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: `El generador falló: ${e?.message || e}` });
    }

    const forzar = cuerpo.forzar === true;
    const r = escribirProyectoAndroid(PROJECT_ROOT, gen, { forzar });

    const herramientas = sondearHerramientasAndroid();
    const android = veredictoAndroid(proyecto, herramientas);

    return res.json({
      ok: true,
      appId: gen.appId,
      huella: huellaDelProyecto(gen),
      generados: r.escritos.length,
      omitidos: r.omitidos,
      // Un conflicto NO es un error: es una edición del usuario que no se pisó.
      conflictos: r.conflictos,
      assetsOmitidos: leido.omitidos,
      avisos: gen.avisos,
      mision: gen.mision,
      version: { agp: AGP_VERSION, gradle: GRADLE_VERSION },
      android: { puedeConstruir: android.puedeConstruir, faltan: android.faltan },
      message:
        `Proyecto Android generado en «${gen.carpeta}/» (${r.escritos.length} archivos, ` +
        `AGP ${AGP_VERSION} + Gradle ${GRADLE_VERSION}, minSdk ${gen.minSdk}). ` +
        `Ábrelo en Android Studio y construye el APK con ${gen.mision.apk} o el AAB con ${gen.mision.aab}. ` +
        (r.conflictos.length
          ? `NO se sobrescribieron ${r.conflictos.length} archivos que tenías editados (${r.conflictos.slice(0, 3).join(", ")}${r.conflictos.length > 3 ? "…" : ""}): repite con forzar=true si quieres reemplazarlos. `
          : "") +
        (leido.omitidos.length ? `Se dejaron fuera ${leido.omitidos.length} assets de la web (con su motivo). ` : "") +
        (android.puedeConstruir
          ? "Esta máquina ya tiene lo necesario para compilar: botón «Compilar APK»."
          : `Para COMPILAR todavía falta: ${android.faltan.join(" · ")}. Generar no es compilar: sin SDK, el APK se hace en tu Android Studio.`),
    });
  });

  // ─── v1.56.9 · COMPILAR EL APK DESDE LA IDE (el botón que faltaba) ──────────

  // v1.57.17 · el estado del trabajo de Gradle (interfaz TrabajoApk, UN trabajo vivo,
  // cola de 20, log acotado) se MUDÓ a server/fabricaApk.ts: el botón de la UI y la
  // herramienta del chat pelean ahora por el MISMO slot — dos Gradle simultáneos en una
  // máquina de 16 GB es una forma creativa de tumbar la IDE del usuario.

  // v1.0.14 · la carpeta de datos es la que fija server.ts; el router la deriva
  // con la MISMA convención que usa la fábrica (herramientasDirActiva).
  const dirHerramientas = () => herramientasDirPorDefecto(PROJECT_ROOT);

  /** Qué falta para compilar, MEDIDO (sondeos reales, no humo). */
  const faltanToolchainAhora = () => {
    const so = (process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux") as "win32" | "darwin" | "linux";
    const r = rutasHerramientas(dirHerramientas(), so);
    let java = false, gradleSistema = false;
    try { java = spawnSync("java", ["-version"], { encoding: "utf-8", timeout: 6000, windowsHide: true }).status === 0; } catch { java = false; }
    try { gradleSistema = spawnSync("gradle", ["-v"], { encoding: "utf-8", timeout: 6000, windowsHide: true }).status === 0; } catch { gradleSistema = false; }
    return faltanHerramientas(r, so, (p) => fs.existsSync(p), { sistemaJava: java, sistemaGradle: gradleSistema });
  };

  app.post("/api/export/android/build", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const r = lanzarCompilacionApk(PROJECT_ROOT, { herramientasDir: dirHerramientas() });
    if (r.yaEnMarcha && r.trabajo) {
      return res.json({
        ok: true, jobId: r.trabajo.id, yaEnMarcha: true,
        message: "Ya hay una compilación en marcha: este es su estado, no arranqué otra.",
      });
    }
    if (!r.ok) {
      // v1.0.14 · si no hay con qué compilar, el 400 ya NO manda a Android
      // Studio: ofrece el clic propio (`provision`) con el plan de pesos delante.
      const puedeAprovisionar = Object.values(faltanToolchainAhora()).some(Boolean);
      if (r.hechos) return res.status(400).json({ ok: false, error: r.error, hechos: r.hechos, puedeAprovisionar });
      return res.status(500).json({ ok: false, error: r.error, fallo: r.trabajo?.fallo, puedeAprovisionar });
    }
    return res.json({
      ok: true,
      jobId: r.trabajo!.id,
      rutaGradle: r.trabajo!.rutaGradle,
      message: `Compilación lanzada (${r.trabajo!.explicacionRuta}) La primera vez Gradle baja dependencias: entre 30 s y varios minutos según la conexión.`,
    });
  });

  // ─── v1.0.14 · PREPARAR HERRAMIENTAS (un clic, una vez) ────────────────────
  // POST lanza el plan (o devuelve el vivo); GET devuelve el progreso real.
  // El spawn de la descarga corre DENTRO del server con fs de la máquina del
  // usuario — como debe ser: el sandbox no tiene JDK ni red propia.
  app.post("/api/export/android/provision", (req: Request, res: Response) => {
    if (!deps.sandboxAuthorized(req)) return res.status(401).json({ error: "Acceso no autorizado." });
    const forzar = (req.body && (req.body as any).forzar === true) || false;
    const r = lanzarAprovisionamiento({ herramientasDir: dirHerramientas(), projectRoot: PROJECT_ROOT, forzar });
    const t = r.trabajo;
    return res.json({
      ok: r.ok,
      yaEnMarcha: !!r.yaEnMarcha,
      estado: t?.estado,
      paso: t?.pasoActual,
      totalNota: t?.totalNota,
      message: t?.estado === "fallido"
        ? (t.fallo?.causa || "El aprovisionamiento falló.")
        : r.yaEnMarcha
          ? "Ya había un aprovisionamiento en marcha: siguiendo ése."
          : t && t.estado === "exito"
            ? "La máquina ya estaba completa: nada que bajar."
            : `Aprovisionando: ${pesoTotal(planDeAprovisionamiento(faltanToolchainAhora(), (process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux") as "win32" | "darwin" | "linux"))}. Mirá el progreso con GET /api/export/android/provision.`,
    });
  });

  app.get("/api/export/android/provision", (_req: Request, res: Response) => {
    const e = estadoProvisionParaCliente();
    return res.json({ ...e, vivo: !!trabajoProvisionVivo() });
  });

  app.get("/api/export/android/build/:id", (req: Request, res: Response) => {
    const t = buscarTrabajoApk(String(req.params.id));
    if (!t) return res.status(404).json({ ok: false, error: "Ese trabajo de compilación no existe (¿reinició la IDE?). Volvé a lanzar." });
    return res.json({
      ok: true,
      id: t.id,
      estado: t.estado,
      segundos: Math.round(((t.fin || Date.now()) - t.inicio) / 1000),
      codigo: t.codigo,
      fallo: t.fallo || null,
      apk: t.apk ? { bytes: t.apk.bytes } : null,
      lineaFinal: t.lineas.length ? t.lineas[t.lineas.length - 1] : "",
      log: t.lineas.slice(-120),
    });
  });

  app.get("/api/export/android/apk", (_req: Request, res: Response) => {
    const rutaApk = path.join(PROJECT_ROOT, rutaRelApkDebug("android"));
    let st;
    try {
      st = fs.statSync(rutaApk);
    } catch {
      return res.status(404).json({
        ok: false,
        error: "Todavía no hay APK en android/app/build/outputs/apk/debug/. Compilá primero; no entrego un archivo que no existe.",
      });
    }
    const verif = apkVerificado(true, st.size);
    if (!verif.ok) return res.status(404).json({ ok: false, error: verif.mensaje });
    return res.download(rutaApk, "CerebroNico-app-debug.apk");
  });
}

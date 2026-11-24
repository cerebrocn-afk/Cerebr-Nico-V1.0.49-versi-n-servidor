// ============================================================
// APROVISIONAR TOOLCHAIN — v1.0.14 · «UN CLIC BAJA TODO» DE VERDAD
// ============================================================
// Este es el cable del plan puro `src/engine/toolchainPlan.ts`. La queja de
// Mario (capturas 10/11): «2. Compilar APK» decía «abrí Android Studio» y en su
// máquina limpia eso era un muro. Aquí la IDE CONSEGUÍ las herramientas que
// faltan — JDK 17 (Adoptium), Gradle y Android command-line tools + paquetes
// de plataforma — dentro de su propia carpeta de datos, sin tocar el PATH del
// sistema ni `Program Files`.
//
// Honestidad (las mismas reglas de la fábrica de APK):
//   · UN trabajo vivo: dos descargas simultáneas de ~500 MB pelean por el
//     mismo disco y el mismo módem. El segundo clic se sube al primero.
//   · Nada se declara instalado hasta que la sonda ve el EJECUTABLE en disco.
//   · Cada línea del log queda visible en el panel: progreso real de bytes,
//     URL usada, comando ejecutado. Si algo falla, el fallo trae la solución
//     concreta (incluidos los overrides CN_JDK_URL / CN_GRADLE_URL /
//     CN_CMDLINE_URL para redes corporativas).
//   · El estado se recalcula CONTRA DISCO en cada arranque: si la IDE se
//     reinició a mitad, lo que ya está bajado no se vuelve a bajar.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SDK_COMPILACION } from "../src/engine/androidProyecto";
import {
  rutasHerramientas,
  faltanHerramientas,
  planDeAprovisionamiento,
  formatoPaquete,
  pesoTotal,
  localPropertiesContenido,
  type So,
} from "../src/engine/toolchainPlan";

export interface TrabajoProvision {
  id: string;
  estado: "corriendo" | "exito" | "fallido";
  inicio: number;
  fin?: number;
  pasoActual: string;
  lineas: string[];
  bajadoBytes: number;
  totalNota: string;
  fallo?: { causa: string; solucion: string };
}

let vivo: TrabajoProvision | null = null;
const historial: TrabajoProvision[] = [];
let secuencial = 0;

function empujar(t: TrabajoProvision, linea: string) {
  for (const l of String(linea).split(/\r?\n/)) {
    if (!l.trim()) continue;
    t.lineas.push(l);
    if (t.lineas.length > 500) t.lineas.splice(0, t.lineas.length - 500);
  }
  console.log(`[aprovisionar] ${String(linea).split("\n")[0].slice(0, 160)}`);
}

export function trabajoProvisionVivo(): TrabajoProvision | null { return vivo; }
export function ultimoTrabajoProvision(): TrabajoProvision | null {
  return historial.length ? historial[historial.length - 1] : null;
}

/** Carpeta de herramientas POR DEFECTO: `<raíz de datos>/.cerebronico/herramientas`. */
export function herramientasDirPorDefecto(raizDatos: string, so: NodeJS.Platform = process.platform): string {
  const sep = so === "win32" ? "\\" : "/";
  return `${raizDatos.replace(/[\\/]+$/, "")}${sep}.cerebronico${sep}herramientas`;
}

// server.ts fija la raíz de datos UNA vez (tras resolver PROJECT_DIR). Con eso,
// la fábrica y el router encuentran el toolchain sin que cada llamante tenga
// que conocer la convención. Sin fija, `herramientasDirActiva()` devuelve null
// y las rutas siguen funcionando como antes de v1.0.14 (sin ruta local).
let raizDatosConfigurada: string | null = null;
export function fijarRaizDatosParaHerramientas(raiz: string): void { raizDatosConfigurada = raiz; }
export function herramientasDirActiva(): string | null {
  return raizDatosConfigurada ? herramientasDirPorDefecto(raizDatosConfigurada) : null;
}

const soBin = (so: NodeJS.Platform): So => (so === "win32" ? "win32" : so === "darwin" ? "darwin" : "linux");

/** ¿Qué hay ya aprovisionado? (lo consulta la fábrica ANTES de rendirse). */
export function rutasProvisionadas(raizHerramientas: string, so: NodeJS.Platform = process.platform) {
  const r = rutasHerramientas(raizHerramientas, soBin(so));
  const javaBin = so === "win32" ? path.join(r.jdkDir, "bin", "java.exe") : path.join(r.jdkDir, "bin", "java");
  return {
    rutas: r,
    jdk: fs.existsSync(javaBin),
    gradle: fs.existsSync(r.gradleBin),
    sdkManager: fs.existsSync(r.sdkManagerBin),
    androidHome: r.sdkDir,
  };
}

// ── primitivas con efectos ──────────────────────────────────────────────────

const MB = 1024 * 1024;

async function descargar(url: string, destino: string, t: TrabajoProvision): Promise<number> {
  // 20 min por archivo: una conexión lenta puede con 190 MB; un colgado no.
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal["timeout"] ? AbortSignal["timeout"](20 * 60 * 1000) : undefined });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status || "?"} al bajar ${url}`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  let bytes = 0;
  let ultimoReporte = 0;
  const ws = fs.createWriteStream ? fs.createWriteStream(destino) : null;
  if (!ws) throw new Error("sin fs.createWriteStream en este runtime");
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array | ArrayBuffer | string>) {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as ArrayBuffer);
      bytes += buf.length;
      ws.write(buf);
      if (bytes - ultimoReporte > 8 * MB) {
        ultimoReporte = bytes;
        empujar(t, `  … ${(bytes / MB).toFixed(0)} MB bajados`);
      }
    }
  } finally {
    ws.end();
    await new Promise<void>((ok) => ws.on("close", () => ok()));
  }
  if (bytes < 1 * MB) throw new Error(`El archivo bajado pesa ${(bytes / 1024).toFixed(0)} KB — es un error, no un paquete.`);
  return bytes;
}

function extraer(paquete: string, destino: string, t: TrabajoProvision, so: NodeJS.Platform) {
  fs.mkdirSync(destino, { recursive: true });
  const esZip = /\.(zip)$/i.test(paquete);
  const candidatos: string[][] = [];
  if (so === "win32") {
    candidatos.push(["C:\\Windows\\System32\\tar.exe", "-xf", paquete, "-C", destino]);
    candidatos.push(["powershell", "-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${paquete}' -DestinationPath '${destino}'`]);
  } else {
    if (esZip) candidatos.push(["unzip", "-q", "-o", paquete, "-d", destino]);
    candidatos.push(["tar", esZip ? "-xf" : "-zxf", paquete, "-C", destino]);
  }
  let ultimo = "";
  for (const cmd of candidatos) {
    try {
      const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8", timeout: 5 * 60 * 1000, windowsHide: true, maxBuffer: 8 * MB });
      if (r.status === 0) { empujar(t, `  descomprimido con ${cmd[0]}`); return true; }
      ultimo = `${cmd[0]}: ${String(r.stderr || r.stdout || "").slice(0, 200)}`;
    } catch (e: any) { ultimo = String(e?.message || e); }
  }
  throw new Error(`No se pudo descomprimir ${path.basename(paquete)} — ${ultimo}`);
}

function correr(bin: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number; t?: TrabajoProvision }): { code: number; salida: string } {
  const r = spawnSync(bin, args, {
    cwd: opts.cwd,
    env: opts.env || process.env,
    input: opts.input,
    encoding: "utf-8",
    timeout: opts.timeoutMs || 15 * 60 * 1000,
    maxBuffer: 32 * MB,
    windowsHide: true,
  });
  const salida = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (opts.t) for (const l of salida.split(/\r?\n/).slice(-12)) if (l.trim()) empujar(opts.t, `  ${l.trim().slice(0, 200)}`);
  return { code: r.error ? -1 : (r.status ?? -1), salida: salida || String(r.error?.message || "sin salida") };
}

function envConJdk(r: ReturnType<typeof rutasHerramientas>, so: NodeJS.Platform): NodeJS.ProcessEnv {
  const sep = so === "win32" ? ";" : ":";
  const bin = path.join(r.jdkDir, "bin");
  return {
    ...process.env,
    JAVA_HOME: r.jdkDir,
    PATH: `${bin}${sep}${process.env.PATH || ""}`,
  };
}

// ── el trabajo completo ────────────────────────────────────────────────────

export interface OpcionesAprovisionamiento {
  /** `<raíz de datos>/.cerebronico/herramientas` (exportacion.ts la fija). */
  herramientasDir: string;
  /** Proyecto con android/: se le escribe local.properties al terminar. */
  projectRoot?: string;
  /** Repite descargas aunque la sonda diga que ya están. */
  forzar?: boolean;
}

export function lanzarAprovisionamiento(o: OpcionesAprovisionamiento): { ok: boolean; yaEnMarcha?: boolean; error?: string; trabajo?: TrabajoProvision } {
  if (vivo && vivo.estado === "corriendo") return { ok: true, yaEnMarcha: true, trabajo: vivo };
  const so = process.platform;
  const r = rutasHerramientas(o.herramientasDir, soBin(so));
  const probeJava = spawnSyncSafe("java", ["-version"]);
  const probeGradle = spawnSyncSafe("gradle", ["-v"]);
  const faltan = faltanHerramientas(r, soBin(so), (p) => fs.existsSync(p), { sistemaJava: probeJava, sistemaGradle: probeGradle });
  if (o.forzar) { faltan.jdk = faltan.gradle = faltan.cmdline = faltan.sdkPlataforma = true; }
  const pasos = planDeAprovisionamiento(faltan, soBin(so));
  const t: TrabajoProvision = {
    id: `prov-${Date.now()}-${++secuencial}`,
    estado: "corriendo",
    inicio: Date.now(),
    pasoActual: pasos.length ? pasos[0].que : "nada que bajar",
    lineas: [],
    bajadoBytes: 0,
    totalNota: pesoTotal(pasos),
  };
  vivo = t;
  historial.push(t);
  if (historial.length > 10) historial.splice(0, historial.length - 10);

  if (pasos.length === 0) {
    empujar(t, "La máquina ya tiene todo: JDK, Gradle y SDK verificados en disco. Nada que bajar.");
    t.estado = "exito"; t.fin = Date.now(); vivo = null;
    return { ok: true, trabajo: t };
  }

  empujar(t, `Plan: ${pasos.map((p) => p.id).join(" → ")} · ${t.totalNota}`);
  const paquetesDir = path.join(o.herramientasDir, "_paquetes");

  (async () => {
    try {
      for (const paso of pasos) {
        t.pasoActual = paso.que;
        if (paso.id === "sdk-paquetes") {
          const env = envConJdk(r, so);
          empujar(t, `Aceptando licencias de Android SDK (sdkmanager --licenses)`);
          correr(r.sdkManagerBin, ["--sdk_root=" + r.sdkDir, "--licenses"], { env, input: "y\n".repeat(40), timeoutMs: 3 * 60 * 1000, t });
          const pkgs = ["platform-tools", `platforms;android-${SDK_COMPILACION}`, `build-tools;${SDK_COMPILACION}.0.0`];
          empujar(t, `Instalando ${pkgs.join(" ")} (pesa ~200 MB, Gradle lo pide igual)`);
          const inst = correr(r.sdkManagerBin, ["--sdk_root=" + r.sdkDir, ...pkgs], { env, input: "y\n".repeat(10), timeoutMs: 18 * 60 * 1000, t });
          if (inst.code !== 0) throw new Error(`sdkmanager falló (código ${inst.code}): ${inst.salida.slice(-400)}`);
          continue;
        }
        if (!paso.url) continue;
        const fmt: "zip" | "tar.gz" = paso.id === "jdk" ? formatoPaquete(soBin(so)) : "zip";
        const destino = path.join(paquetesDir, `${paso.id}.${fmt}`);
        const home = paso.id === "jdk" ? r.jdkDir : paso.id === "gradle" ? path.dirname(r.gradleHome) : r.cmdlineDir;
        if (!o.forzar && existeEjecutableDe(paso.id, r, so)) { empujar(t, `${paso.id}: ya en disco, se salta.`); continue; }
        empujar(t, `${paso.que} (${paso.pesoNota}) ← ${paso.url}`);
        const bytes = await descargar(paso.url, destino, t);
        t.bajadoBytes += bytes;
        extraer(destino, home, t, so);
        if (!existeEjecutableDe(paso.id, r, so)) {
          // El zip de Adoptium trae la carpeta dentro de la carpeta: una pasada
          // de reubicación antes de sentenciar el fallo.
          reubicarHijoUnico(home, paso.id, r);
        }
        if (!existeEjecutableDe(paso.id, r, so)) throw new Error(`${paso.id}: se descargó y descomprimió pero el ejecutable no aparece en ${home}. Revisá el antivirus o fijá CN_${paso.id.toUpperCase()}_URL.`);
      }
      // Verificación final CONTRA DISCO — no por optimismo.
      const quedan = faltanHerramientas(r, soBin(so), (p) => fs.existsSync(p), { sistemaJava: probeJava, sistemaGradle: probeGradle });
      const rojos = Object.entries(quedan).filter(([, v]) => v).map(([k]) => k);
      if (rojos.length) throw new Error(`Terminó pero siguen sin verificarse: ${rojos.join(", ")}`);
      if (o.projectRoot) {
        const lp = path.join(o.projectRoot, "android", "local.properties");
        if (fs.existsSync(path.join(o.projectRoot, "android"))) {
          fs.writeFileSync(lp, localPropertiesContenido(r.sdkDir), "utf-8");
          empujar(t, `android/local.properties escrito con sdk.dir=${r.sdkDir}`);
        }
      }
      t.estado = "exito";
      empujar(t, "Toolchain completo y verificado en disco. «2. Compilar APK» ya tiene con qué.");
    } catch (e: any) {
      t.estado = "fallido";
      t.fallo = {
        causa: String(e?.message || e).slice(0, 400),
        solucion: "Red corporativa o disco lleno: fijá CN_JDK_URL / CN_GRADLE_URL / CN_CMDLINE_URL apuntando a espejos accesibles y volvé a pulsar. La descarga retoma: lo que ya está en disco se salta.",
      };
      empujar(t, `FALLO: ${t.fallo.causa}`);
    } finally {
      t.fin = Date.now();
      vivo = null;
    }
  })();

  return { ok: true, trabajo: t };
}

function spawnSyncSafe(bin: string, args: string[]): boolean {
  try { const r = spawnSync(bin, args, { encoding: "utf-8", timeout: 8000, windowsHide: true }); return r.status === 0; } catch { return false; }
}

function existeEjecutableDe(id: string, r: ReturnType<typeof rutasHerramientas>, so: NodeJS.Platform): boolean {
  if (id === "jdk") return fs.existsSync(so === "win32" ? path.join(r.jdkDir, "bin", "java.exe") : path.join(r.jdkDir, "bin", "java"));
  if (id === "gradle") return fs.existsSync(r.gradleBin);
  if (id === "cmdline") return fs.existsSync(r.sdkManagerBin);
  return false;
}

/**
 * Los zips oficiales meten UNA carpeta raíz (`jdk-17.0.x+y`, `gradle-9.6.0`,
 * `cmdline-tools`). Si la extracción quedó anidada un nivel y el destino esperado
 * está vacío, se promueve el hijo único. Determinista: solo actúa cuando hay
 * exactamente un directorio y el nombre coincide con la familia esperada.
 */
function reubicarHijoUnico(home: string, id: string, r: ReturnType<typeof rutasHerramientas>) {
  try {
    const objetivo = id === "jdk" ? r.jdkDir : id === "gradle" ? r.gradleHome : path.join(r.cmdlineDir, "cmdline-tools");
    if (fs.existsSync(objetivo)) return;
    const hijos = fs.existsSync(home) ? fs.readdirSync(home, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
    if (hijos.length !== 1) return;
    const origen = path.join(home, hijos[0].name);
    const prefijoOk = id === "jdk" ? /^jdk/.test(hijos[0].name) : id === "gradle" ? /^gradle/.test(hijos[0].name) : /^cmdline/.test(hijos[0].name);
    if (!prefijoOk) return;
    fs.renameSync(origen, objetivo);
  } catch { /* que lo reporte la verificación de abajo, con nombres */ }
}

/** Estado en la forma que come el panel (GET /api/export/android/provision). */
export function estadoProvisionParaCliente() {
  const t = vivo || ultimoTrabajoProvision();
  if (!t) return { ok: true, hayTrabajo: false, message: "Sin aprovisionamiento en esta sesión. POST /api/export/android/provision para empezar." };
  return {
    ok: true, hayTrabajo: true, id: t.id, estado: t.estado,
    paso: t.pasoActual, bajadoMB: Math.round(t.bajadoBytes / MB), totalNota: t.totalNota,
    segundos: Math.round(((t.fin || Date.now()) - t.inicio) / 1000),
    fallo: t.fallo || null,
    lineas: t.lineas.slice(-60),
  };
}

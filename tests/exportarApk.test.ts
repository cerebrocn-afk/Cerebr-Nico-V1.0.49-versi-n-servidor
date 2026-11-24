/**
 * exportarApk.test.ts — v1.57.17 · SUITE: LA FÁBRICA TIENE MANOS EN EL CHAT
 * ===========================================================================
 * Hasta hoy el AGENTE no podía exportar APK: las rutas existían (botón), pero el
 * chat recetaba Capacitor porque no tenía la herramienta. Esta suite prueba la
 * herramienta `exportar_apk` EN SECO: sin Gradle real, sin java, sin tocar la red
 * — `spawnFn` y sondas inyectables, proyecto en carpeta temporal. Y una valla de
 * diseño que importa más que todo lo demás: el botón y el chat pelean por el
 * MISMO trabajo vivo (dos Gradle simultáneos en 16 GB es tumbar la IDE).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let correctas = 0;
const fallos: string[] = [];
function comprobar(que: string, cond: unknown, detalle?: string) {
  if (cond) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
}

const fab = await import("../server/fabricaApk");

function sandbox(): string {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "apk-chat-"));
  fs.writeFileSync(path.join(raiz, "package.json"), JSON.stringify({ name: "fin", version: "1.2.0", scripts: { build: "vite build" }, dependencies: { vite: "^5" } }));
  fs.mkdirSync(path.join(raiz, "dist"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "dist", "index.html"), '<!doctype html><html lang="es"><head><title>f</title></head><body><div id="app"></div></body></html>');
  return raiz;
}

console.log("\n1) generar: los mismos candados de la ruta, sin HTTP");
{
  const raiz = sandbox();
  const r = fab.generarAndroidDesdeChat(raiz, {});
  comprobar("generar produce android/ con build.gradle", r.ok === true && fs.existsSync(path.join(raiz, "android", "app", "build.gradle")), JSON.stringify(r).slice(0, 200));
  comprobar("appId derivado del proyecto (formato de la casa, válido para Android)", typeof r.appId === "string" && /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(r.appId), r.appId);
  // La protección real: un archivo QUE EL USUARIO EDITÓ no se pisa sin permiso.
  const rutaGradleApp = path.join(raiz, "android", "app", "build.gradle");
  fs.writeFileSync(rutaGradleApp, "// MI EDICIÓN del usuario\ndependencies { }\n");
  const r2 = fab.generarAndroidDesdeChat(raiz, {});
  comprobar("re-generar NO pisa la edición del usuario: la reporta en conflictos",
    r2.ok === true && (r2.conflictos || []).length > 0 && fs.readFileSync(rutaGradleApp, "utf8").includes("MI EDICIÓN"), JSON.stringify(r2.conflictos || []).slice(0, 120));
  const r3 = fab.generarAndroidDesdeChat(raiz, { forzar: true });
  comprobar("forzar=true reescribe (permiso explícito del usuario)", r3.ok === true && !fs.readFileSync(rutaGradleApp, "utf8").includes("MI EDICIÓN"));
  const vacia = fs.mkdtempSync(path.join(os.tmpdir(), "apk-vacia-"));
  const rv = fab.generarAndroidDesdeChat(vacia, {});
  comprobar("sin proyecto exportable: corte honesto (no APK de aire)", rv.ok === false && typeof rv.error === "string" && rv.error.length > 10, rv.error);
  const rbad = fab.generarAndroidDesdeChat(raiz, { appId: "1nope!" });
  comprobar("appId inválido: rechazado con ejemplo de formato", rbad.ok === false && /com\.tunombre/.test(String(rbad.error)), rbad.error);
}

console.log("\n2) compilar: UN trabajo vivo, spawn inyectado, éxito verificado en disco");
{
  const raiz = sandbox();
  fab.generarAndroidDesdeChat(raiz, {});
  const sinHerramientas = fab.lanzarCompilacionApk(raiz, { probeGradleSistema: () => false });
  comprobar("wrapper sin jar + sin gradle = ruta 'ninguna' con explicación", sinHerramientas.ok === false && typeof sinHerramientas.error === "string" && !!sinHerramientas.hechos, JSON.stringify(sinHerramientas).slice(0, 160));

  // Simular wrapper COMPLETO (jar presente) para que elegirRutaDeBuild diga gradlew.
  fs.mkdirSync(path.join(raiz, "android", "gradle", "wrapper"), { recursive: true });
  fs.writeFileSync(path.join(raiz, "android", "gradle", "wrapper", "gradle-wrapper.jar"), "PK\x03\x04fake-jar-para-el-hecho-de-existencia");
  if (!fs.existsSync(path.join(raiz, "android", "gradlew.bat"))) fs.writeFileSync(path.join(raiz, "android", "gradlew.bat"), "@echo off\n");

  let hijo: any = new EventEmitter();
  hijo.stdout = new EventEmitter();
  hijo.stderr = new EventEmitter();
  const spawnFn = (() => hijo) as any;
  const L1 = fab.lanzarCompilacionApk(raiz, { spawnFn, probeGradleSistema: () => false });
  comprobar("lanzamiento por gradlew con jar presente", L1.ok === true && L1.trabajo?.estado === "corriendo", JSON.stringify(L1).slice(0, 160));
  const L2 = fab.lanzarCompilacionApk(raiz, { spawnFn, probeGradleSistema: () => false });
  comprobar("SEGUNDO lanzamiento NO arranca otro Gradle: devuelve el vivo", L2.yaEnMarcha === true && L2.trabajo?.id === L1.trabajo?.id);
  hijo.stdout.emit("data", Buffer.from("> Task :app:assembleDebug\nBUILD SUCCESSFUL\n"));
  const apkDir = path.join(raiz, "android", "app", "build", "outputs", "apk", "debug");
  fs.mkdirSync(apkDir, { recursive: true });
  fs.writeFileSync(path.join(apkDir, "app-debug.apk"), Buffer.alloc(120_000, 7));
  hijo.emit("close", 0);
  const t = fab.buscarTrabajoApk(L1.trabajo!.id)!;
  comprobar("éxito = código 0 + APK presente + tamaño creíble (las tres)", t.estado === "exito" && (t.apk?.bytes || 0) === 120_000, `${t.estado} ${JSON.stringify(t.apk)}`);
  const est = fab.estadoAndroidDesdeChat(raiz);
  comprobar("estado lo cuenta y señala el APK en disco", est.hayTrabajo === true && est.estado === "exito" && !!est.apkEnDisco, JSON.stringify(est).slice(0, 160));
  let hijo3: any = new EventEmitter(); hijo3.stdout = new EventEmitter(); hijo3.stderr = new EventEmitter();
  const L3 = fab.lanzarCompilacionApk(raiz, { spawnFn: (() => hijo3) as any, probeGradleSistema: () => false });
  hijo3.emit("close", 0);
  comprobar("terminado el trabajo, hay cupo para otro", L3.ok === true && !L3.yaEnMarcha && L3.trabajo?.id !== L1.trabajo?.id && L3.trabajo?.estado === "exito", JSON.stringify(L3.trabajo?.estado));
  // fracaso: código 0 pero APK de 3 KB → no es éxito
  let hijo2: any = new EventEmitter(); hijo2.stdout = new EventEmitter(); hijo2.stderr = new EventEmitter();
  const L4 = fab.lanzarCompilacionApk(raiz, { spawnFn: (() => hijo2) as any, probeGradleSistema: () => false });
  fs.writeFileSync(path.join(apkDir, "app-debug.apk"), Buffer.alloc(3_000, 1));
  hijo2.emit("close", 0);
  const t4 = fab.buscarTrabajoApk(L4.trabajo!.id)!;
  comprobar("APK de 3 KB NO es éxito aunque Gradle diga 0 (tamaño creíble)", t4.estado === "fallido", t4.estado);
}

console.log("\n3) la herramienta existe, es honesta y NO duplica la fábrica (cables)");
{
  const server = readFileSync(path.join(__dirname, "../server.ts"), "utf8");
  comprobar("exportar_apk está en AGENT_TOOLS con enum de acciones", /name: "exportar_apk"/.test(server) && /enum: \["generar", "compilar", "estado"\]/.test(server));
  comprobar("el dispatch case existe y llama a la f\u00e1brica compartida", /case "exportar_apk": \{/.test(server) && /generarAndroidDesdeChat\(PROJECT_ROOT/.test(server) && /lanzarCompilacionApk\(PROJECT_ROOT/.test(server));
  comprobar("la descripción proh\u00edbe la receta: produce o dice qu\u00e9 falta", /no recetas de Capacitor/i.test(server) && /UN solo trabajo vivo|trabajo vivo/.test(server));
  const ruta = readFileSync(path.join(__dirname, "../server/routers/exportacion.ts"), "utf8");
  comprobar("la ruta del botón delega en la MISMA fábrica (un solo estado de trabajo)", /from "\.\.\/fabricaApk"/.test(ruta) && !/let trabajoVivo: TrabajoApk \| null = null;/.test(ruta));
  comprobar("la ruta ya no duplica el sondeo de herramientas", !/const javaVersion = "";\s*\n\s*try \{/.test(ruta));
}

console.log(`\n${"─".repeat(56)}`);
console.log(`exportarApk: ${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) { for (const f of fallos) console.log(`  · ${f}`); process.exitCode = 1; }

/**
 * tests/rutaTrabajo.test.ts — RUTA DE TRABAJO: PLAN + PARALELO (v1.24.0)
 * =====================================================================
 * Se ejecuta con:  npx tsx tests/rutaTrabajo.test.ts   (o `npm run validar`)
 *
 * Custodia la capa nueva «ruta de trabajo»: PRIMERO el plan (documenta y VALIDA
 * todos los archivos antes de crear nada), LUEGO el paralelo (crea 4-6 a la vez
 * en segundo plano, cada uno en su bucle de autocorrección). Qué vigila y por qué:
 *
 *   1. CONTRATO: las tres herramientas (crear_archivo, planificar_ruta_trabajo,
 *      ejecutar_ruta_paralelo) están declaradas, tienen ejecutor y viajan en el
 *      manifiesto. Una capacidad sin herramienta visible no existe para el agente.
 *   2. PLAN QUE VALIDA ANTES DE CREAR: rutas con `..`, absolutas, duplicadas o de
 *      tipo desconocido se BLOQUEAN con su motivo y NO se escribe ni un byte en
 *      esta fase. La lista requerida empieza incompleta a propósito.
 *   3. HONESTIDAD DEL SEMÁFORO: con pendientes o bloqueados, listo_para_lanzar es
 *      false y el ejecutor se NIEGA a lanzar (salvo forzar:true). Primero la ruta.
 *   4. PARALELO REAL MEDIDO: al crear un lote, varios artefactos se solapan en el
 *      tiempo y el solape se MIDE (no se promete). Verdicto completado.
 *   5. BUCLE DE AUTOCORRECCIÓN HONESTO: un JSON roto es `fallido`, un archivo
 *      vacío es `valido_con_reservas`, y el veredicto global lo refleja sin
 *      inventar el contenido que falta.
 *   6. NADA FUERA DE LA RAÍZ: crear_archivo rechaza `..`, rutas absolutas y tipos
 *      no reconocidos, y escribe de verdad lo que sí pasa.
 *
 * Todo corre contra un demonio real en un puerto efímero con CN_CREADOR_ROOT en
 * un temporal: `.creador/` del proyecto no se toca.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leRuta = (rel: string) => path.join(RAIZ, rel);

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  \u2713 ${que}`);
  } else {
    fallos.push(que + (detalle ? ` \u2014 ${detalle}` : ""));
    console.log(`  \u2717 ${que}${detalle ? ` \u2014 ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PYTHON = process.platform === "win32" ? "python" : "python3";
const CREADOR = leRuta("scripts/creador_daemon.py");

function pythonVivo(): boolean {
  const r = spawnSync(PYTHON, ["--version"], { encoding: "utf8", timeout: 8000 });
  return r.status === 0;
}
function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as any).port;
      srv.close(() => resolve(p));
    });
  });
}
/**
 * v2.1.3 — El rojo «el creador levanta y responde /health — ECONNREFUSED» no
 * decía NADA del hijo. Un python que no resuelve, un módulo que falta y un
 * puerto tomado se veían igual. Se guarda su stderr (drenado, que además evita
 * que el pipe se llene y bloquee al hijo) y se adjunta al mensaje.
 */
const stderrHijo = new Map<number, string>();
function recordarSalida(proc: ChildProcess) {
  const buf: string[] = [];
  stderrHijo.set(proc.pid || 0, "");
  proc.stderr?.on("data", (d) => {
    buf.push(String(d));
    if (buf.length > 40) buf.shift();
    stderrHijo.set(proc.pid || 0, buf.join(""));
  });
  proc.stdout?.on("data", () => {});
  proc.on("exit", (code) => {
    const previo = stderrHijo.get(proc.pid || 0) || "";
    stderrHijo.set(proc.pid || 0, previo + `\n[el hijo terminó con código ${code}]`);
  });
}
function porQueNoLevanto(proc: ChildProcess | null): string {
  if (!proc) return "no se lanzó el proceso";
  const salida = (stderrHijo.get(proc.pid || 0) || "").trim();
  return salida ? salida.slice(-600) : "sin salida del hijo (no escribió stderr)";
}

async function esperarVivo(base: string, maxIntentos = 60) {
  for (let i = 0; i < maxIntentos; i++) {
    try {
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {
      /* a\u00fan levantando */
    }
    await esperar(200);
  }
  return false;
}
async function llamar(base: string, nombre: string, args: Record<string, unknown>) {
  const r = await fetch(`${base}/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nombre, arguments: args }),
    signal: AbortSignal.timeout(60000),
  });
  return { status: r.status, cuerpo: await r.json() as any };
}

const DIR = mkdtempSync(path.join(tmpdir(), "cn-ruta-"));
let procesor: ChildProcess | null = null;
let BASE = "";

try {
  seccion("0 · Requisitos");
  comprobar("el daemon del creador existe", existsSync(CREADOR));
  comprobar("Python disponible para el pack", pythonVivo(), `${PYTHON} no responde`);

  if (pythonVivo()) {
    const ROOT = path.join(DIR, "creador");
    mkdirSync(ROOT, { recursive: true });
    const puerto = await puertoLibre();
    BASE = `http://127.0.0.1:${puerto}`;
    procesor = spawn(PYTHON, [CREADOR, "--port", String(puerto)], {
      cwd: RAIZ,
      env: { ...process.env, CN_CREADOR_ROOT: ROOT },
      stdio: ["ignore", "pipe", "pipe"],
    });
    recordarSalida(procesor);
    comprobar("el creador levanta y responde /health", await esperarVivo(BASE), BASE + " · " + porQueNoLevanto(procesor));

    seccion("1 · Contrato de las tres herramientas nuevas");
    const manifiesto = await (await fetch(`${BASE}/tools`, { signal: AbortSignal.timeout(8000) })).json();
    const lista = (manifiesto?.tools || []) as any[];
    const nombres = lista.map((t) => t.name);
    for (const nom of ["crear_archivo", "planificar_ruta_trabajo", "ejecutar_ruta_paralelo"]) {
      comprobar(`${nom} está declarada en el manifiesto`, nombres.includes(nom));
      const spec = lista.find((t) => t.name === nom);
      comprobar(`${nom}: spec válido (description + parameters.object)`,
        !!spec && typeof spec.description === "string" && spec.parameters?.type === "object",
        JSON.stringify(spec)?.slice(0, 120));
      const eco = await llamar(BASE, nom, {});
      comprobar(`${nom}: tiene ejecutor real (no «Herramienta desconocida»)`,
        !/Herramienta desconocida/.test(String(eco.cuerpo?.error || "")));
    }
    const specPlan = lista.find((t) => t.name === "planificar_ruta_trabajo");
    comprobar("planificar exige orden + artefactos",
      Array.isArray(specPlan?.parameters?.required) &&
      specPlan.parameters.required.includes("orden") && specPlan.parameters.required.includes("artefactos"));
    comprobar("la descripción del plan promete lo esencial (valida antes, lotes, honesto)",
      /valida/i.test(specPlan?.description || "") && /lote/i.test(specPlan?.description || "") &&
      /(honest|no se escribe|listo_para_lanzar)/i.test(specPlan?.description || ""));

    seccion("2 · El PLAN valida ANTES de crear (no escribe ni un byte)");
    const plan = (await llamar(BASE, "planificar_ruta_trabajo", {
      orden: "App de notas: documentar requisitos y todos los archivos",
      nombre: "mis-notas",
      requisitos: ["Estilo base", "Lógica JS", "Config"],
      tamano_lote: 4,
      artefactos: [
        { ruta: "css/tema.css", contenido: "body{color:#111}" },
        { ruta: "js/app.js", contenido: "console.log(1)" },
        { ruta: "data/config.json", contenido: '{"a":1}' },
        { ruta: "notas.html", tool: "crear_pagina" },
        { ruta: "../fuga.txt" },
        { ruta: "css/tema.css" },
        { ruta: "binario.exe" },
      ],
    })).cuerpo;
    comprobar("el plan responde ok y se declara capa ruta_de_trabajo:plan",
      plan?.ok === true && plan?.capa === "ruta_de_trabajo:plan", JSON.stringify(plan)?.slice(0, 120));
    const validadas = (plan?.artefactos_validados || []).map((a: any) => a.ruta);
    comprobar("valida los seguros (css/js/json/html)",
      validadas.includes("css/tema.css") && validadas.includes("js/app.js") &&
      validadas.includes("data/config.json") && validadas.includes("notas.html"), JSON.stringify(validadas));
    const bloq = plan?.artefactos_bloqueados || [];
    const motivosDe = (r: string) => (bloq.find((b: any) => b.ruta === r)?.motivos || []).join(" ");
    comprobar("bloquea la fuga con `..` por ruta insegura", /insegura/.test(motivosDe("../fuga.txt")), motivosDe("../fuga.txt"));
    comprobar("bloquea el duplicado por ruta repetida", bloq.some((b: any) => /duplicada/.test((b.motivos || []).join(" "))));
    comprobar("bloquea el tipo desconocido (.exe)", /no reconocido/.test(motivosDe("binario.exe")), motivosDe("binario.exe"));
    comprobar("NO da luz verde con bloqueados (listo_para_lanzar=false)", plan?.listo_para_lanzar === false);
    comprobar("nombra el motivo pendiente de los bloqueados",
      Array.isArray(plan?.pendientes_de_aclarar) && plan.pendientes_de_aclarar.some((s: string) => /bloqueados/.test(s)));
    comprobar("agrupa lo validado en lotes de 4-6 (aquí 4 => 1 lote)", plan?.tamano_lote === 4 && plan?.lotes === 1);
    comprobar("entrega set_plan del motor con una tarea por lote + validación final",
      Array.isArray(plan?.set_plan?.tasks) && plan.set_plan.tasks.some((t: any) => t.id === "validacion_final"));
    comprobar("la lista requerida empieza incompleta a propósito",
      Array.isArray(plan?.lista_requerida) && plan.lista_requerida.every((x: any) => x.completo === false));
    const estadoSitio = (await llamar(BASE, "previsualizar_sitio", { sitio: "mis-notas" })).cuerpo;
    comprobar("el plan NO creó el sitio (validar no es escribir)", estadoSitio?.ok !== true, JSON.stringify(estadoSitio)?.slice(0, 100));
    comprobar("tamaño de lote se acota al rango 4-6 (pido 99 => 6)",
      ((await llamar(BASE, "planificar_ruta_trabajo", { orden: "x", tamano_lote: 99, artefactos: [{ ruta: "a.css" }] })).cuerpo?.tamano_lote) === 6);

    seccion("3 · crear_archivo: escritura segura, race-free, honesta");
    await llamar(BASE, "crear_sitio", { nombre: "lienzo", tipo: "landing", titulo: "Lienzo Demo Sitio" });
    const okArch = (await llamar(BASE, "crear_archivo", { sitio: "lienzo", ruta: "js/util.js", contenido: "export const x=1;" })).cuerpo;
    comprobar("crea un archivo con contenido y devuelve sha256", okArch?.ok === true && typeof okArch?.sha256 === "string" && okArch.sha256.length === 64);
    const fuga = (await llamar(BASE, "crear_archivo", { sitio: "lienzo", ruta: "../escapar.js", contenido: "x" })).cuerpo;
    comprobar("rechaza `..` (no escribe fuera de la raíz)", fuga?.ok !== true && /insegura|escapa/.test(String(fuga?.error)));
    const abs = (await llamar(BASE, "crear_archivo", { sitio: "lienzo", ruta: "/etc/passwd", contenido: "x" })).cuerpo;
    comprobar("rechaza rutas absolutas", abs?.ok !== true);
    const raro = (await llamar(BASE, "crear_archivo", { sitio: "lienzo", ruta: "virus.exe", contenido: "x" })).cuerpo;
    comprobar("rechaza tipos no reconocidos", raro?.ok !== true && /no reconocido/.test(String(raro?.error)));
    const marcador = (await llamar(BASE, "crear_archivo", { sitio: "lienzo", ruta: "docs/pendiente.md" })).cuerpo;
    comprobar("sin contenido deja [Personaliza este texto] (no inventa)", marcador?.ok === true && /Personaliza/.test(String(marcador?.aviso)));

    seccion("4 · El ejecutor se NIEGA a lanzar si el plan no está listo (primero la ruta)");
    const rehuso = (await llamar(BASE, "ejecutar_ruta_paralelo", {
      orden: "crear con un bloqueado dentro",
      nombre: "bloqueo",
      artefactos: [
        { ruta: "css/ok.css", contenido: "a{color:red}" },
        { ruta: "../fuga.js", contenido: "x" },
      ],
    })).cuerpo;
    comprobar("sin forzar y con bloqueados: ok=false y veredicto no_ejecutable",
      rehuso?.ok !== true && rehuso?.veredicto === "no_ejecutable", JSON.stringify(rehuso)?.slice(0, 140));
    comprobar("explica el porqué (pendientes / bloqueados / sugerencia de forzar)",
      /forzar/.test(String(rehuso?.sugerencia)) &&
      (Array.isArray(rehuso?.artefactos_bloqueados) && rehuso.artefactos_bloqueados.length > 0));
    const forzado = (await llamar(BASE, "ejecutar_ruta_paralelo", {
      orden: "crear con un bloqueado dentro",
      nombre: "bloqueo",
      forzar: true,
      artefactos: [
        { ruta: "css/ok.css", contenido: "a{color:red}" },
        { ruta: "../fuga.js", contenido: "x" },
      ],
    })).cuerpo;
    comprobar("con forzar:true procede omitiendo el bloqueado y crea lo válido",
      forzado?.ok === true && forzado?.artefactos === 1 && forzado?.validos === 1, JSON.stringify(forzado)?.slice(0, 160));

    seccion("5 · PARALELO REAL: varios artefactos se solapan y el solape se MIDE");
    const paralelo = (await llamar(BASE, "ejecutar_ruta_paralelo", {
      orden: "crear en paralelo un lote de estilos y lógica",
      nombre: "notas-par",
      tamano_lote: 6,
      artefactos: [
        { ruta: "css/a.css", contenido: ".a{color:#111}" },
        { ruta: "css/b.css", contenido: ".b{color:#222}" },
        { ruta: "css/c.css", contenido: ".c{color:#333}" },
        { ruta: "js/a.js", contenido: "export const a=1;" },
        { ruta: "js/b.js", contenido: "export const b=2;" },
        { ruta: "data/ok.json", contenido: '{"ok":true}' },
      ],
    })).cuerpo;
    comprobar("veredicto completado (todo válido y la lista requerida cerrada)",
      paralelo?.ok === true && paralelo?.veredicto === "completado", JSON.stringify(paralelo)?.slice(0, 160));
    comprobar("declara la capa ruta_de_trabajo:ejecucion y 6 artefactos válidos",
      paralelo?.capa === "ruta_de_trabajo:ejecucion" && paralelo?.artefactos === 6 && paralelo?.validos === 6);
    // ── v1.86.2 · LA MEDICIÓN SE PRUEBA; EL Nº DE HILOS SIMULTÁNEOS NO ──────
    // Esta comprobación decía `paralelismo_maximo_medido >= 2` y se ponía ROJA
    // en una máquina con la CPU competida. Medido acá, 2 núcleos con carga:
    // 12 de 12 corridas con solape = 1. Y no era el paralelo roto -- los hilos
    // estaban, el SO los hizo pasar de uno en uno. Exigirle al planificador una
    // coincidencia temporal es una APUESTA, no una garantía, y una suite que
    // apuesta te manda a arreglar algo que ya funciona. Se prueba lo que sí es
    // determinista: que el número es medido (no una constante), que no supera la
    // capacidad del pool, que cada artefacto trae su ventana real de tiempo, y
    // que la declaración «hay paralelo» coincide con lo medido (si alguien la
    // hardcodea, esto se prende rojo). Que el contador acierta se comprueba en
    // 5b con una barrera: ahí la simultaneidad no se espera, se fuerza.
    const medido = Number(paralelo?.paralelismo_maximo_medido);
    const capacidad = Number(paralelo?.capacidad_de_solape);
    comprobar("mide el solape como número real (no 0, no inventado, no constante)",
      Number.isInteger(medido) && medido >= 1, `medido=${paralelo?.paralelismo_maximo_medido}`);
    comprobar("la capacidad del pool fue el lote completo (6 hilos ofrecidos)",
      capacidad === 6, `capacidad=${paralelo?.capacidad_de_solape}`);
    comprobar("lo medido nunca excede la capacidad (si empata, está inflado)",
      medido >= 1 && medido <= capacidad, `medido=${medido} capacidad=${capacidad}`);
    const ventanas = (paralelo?.resultados || []).filter((x: any) => Number.isFinite(x.t_ini) && Number.isFinite(x.t_fin) && x.t_fin >= x.t_ini);
    comprobar("cada artefacto trae su ventana real de tiempo (auditable)",
      ventanas.length === 6, `${ventanas.length}/6`);
    comprobar("HONESTIDAD: dice «sí hay paralelo» solo si lo midió (y si no, declara por qué)",
      medido >= 2
        ? /^si: \d+ artefactos se solaparon/.test(String(paralelo?.conciencias_en_paralelo))
        : /^no se observo solape/.test(String(paralelo?.conciencias_en_paralelo)),
      `medido=${medido} → ${paralelo?.conciencias_en_paralelo}`);
    comprobar("la lista requerida queda completa", paralelo?.lista_completa === true);

    seccion("5b · EL MEDIDOR SE PRUEBA FORZANDO LA SIMULTANEIDAD (barrera, no suerte)");
    {
      const rutaSonda = path.join(DIR, "sonda_solape.py");
      writeFileSync(rutaSonda, `
import importlib.util as iu, os, threading, sys
os.environ["CN_CREADOR_ROOT"] = ${JSON.stringify(DIR)}
spec = iu.spec_from_file_location("creador_daemon", ${JSON.stringify(CREADOR)})
mod = iu.module_from_spec(spec)
spec.loader.exec_module(mod)

def pico_forzado(n):
    """N hilos entran y NO SALGEN hasta que los N estén adentro: la simultaneidad
    la garantiza la barrera, no el scheduling. Si el medidor funciona, pico == n."""
    m = mod.MedidorSolape()
    barrera = threading.Barrier(n)
    def trabajo():
        m.entrar()
        try:
            barrera.wait(5)
        finally:
            m.salir()
    hilos = [threading.Thread(target=trabajo) for _ in range(n)]
    for h in hilos: h.start()
    for h in hilos: h.join(10)
    return m.pico

print("%d %d %d" % (pico_forzado(6), pico_forzado(2), pico_forzado(1)))
`);
      const sonda = spawnSync(PYTHON, [path.join(DIR, "sonda_solape.py")], {
        encoding: "utf8", timeout: 30000,
      });
      const salida = String(sonda?.stdout || "").trim().split(/\s+/);
      comprobar("6 hilos en barrera → el medidor cuenta 6 (no se queda corto)",
        Number(salida[0]) === 6, `stdout=${sonda?.stdout?.trim()?.slice(0, 80)} err=${String(sonda?.stderr || "").slice(0, 160)}`);
      comprobar("2 hilos en barrera → cuenta 2 (tampoco infla de más)", Number(salida[1]) === 2, `stdout=${salida?.[1]}`);
      comprobar("1 solo hilo → cuenta 1 (no regala solape donde no lo hay)", Number(salida[2]) === 1, `stdout=${salida?.[2]}`);
      const fuente = readFileSync(CREADOR, "utf8");
      comprobar("nadie volvió a deducir el solape ordenando timestamps",
        !/eventos\.sort\(\)/.test(fuente) && /pool\.submit\(_forjar_midiendo, medidor/.test(fuente),
        "el conteo en vuelo es la única fuente del número");
    }

    seccion("6 · BUCLE DE AUTOCORRECCIÓN HONESTO: JSON roto=fallido, vacío=reservas");
    const honesto = (await llamar(BASE, "ejecutar_ruta_paralelo", {
      orden: "crear un lote con un JSON roto y un archivo vacío",
      nombre: "honesto",
      tamano_lote: 4,
      artefactos: [
        { ruta: "css/bien.css", contenido: ".x{color:#000}" },
        { ruta: "data/malo.json", contenido: "{ esto no es json" },
        { ruta: "docs/vacio.txt", contenido: "" },
      ],
    })).cuerpo;
    comprobar("veredicto incompleto (hay al menos un fallido, no se maquilla)",
      honesto?.ok === true && honesto?.veredicto === "incompleto", JSON.stringify(honesto)?.slice(0, 160));
    const resDe = (r: string) => (honesto?.resultados || []).find((x: any) => x.ruta === r);
    comprobar("el JSON roto es `fallido` (con motivo JSON inválido en reservas)",
      resDe("data/malo.json")?.veredicto === "fallido" ||
      (resDe("data/malo.json")?.errores > 0), JSON.stringify(resDe("data/malo.json"))?.slice(0, 140));
    comprobar("el archivo vacío es `valido_con_reservas` (no inventa contenido)",
      resDe("docs/vacio.txt")?.veredicto === "valido_con_reservas" &&
      (resDe("docs/vacio.txt")?.reservas || []).some((s: string) => /vacío|vacio/.test(s)), JSON.stringify(resDe("docs/vacio.txt"))?.slice(0, 140));
    comprobar("el CSS bueno sí queda `valido`", resDe("css/bien.css")?.veredicto === "valido");
    comprobar("la lista requerida NO se cierra con fallidos (honestidad del cierre)", honesto?.lista_completa === false);
  }
} catch (e) {
  fallos.push("excepción inesperada durante la suite: " + (e as Error)?.message);
  console.error(e);
} finally {
  try { procesor?.kill("SIGKILL"); } catch { /* ya muerto */ }
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temporal efímero */ }
}

// ---------------------------------------------------------------------------
// Recuento final: honesto y verde/rojo sin adornos. El código de salida deja
// que `npm run validar` decida; una capacidad sin test en verde no se entrega.
// ---------------------------------------------------------------------------
seccion(`\n─── Resultado rutaTrabajo: ${correctas} correctas, ${fallos.length} fallos ───`);
if (fallos.length) {
  console.log("Fallos:");
  for (const f of fallos) console.log("  · " + f);
  process.exit(1);
} else {
  console.log("✓ La capa «ruta de trabajo» (plan + paralelo) valida antes de crear, mide el solape y es honesta.");
}

/**
 * tests/entregaFuncional.test.ts — FORJAR Y ENTREGAR (v1.24.0)
 * ==========================================================
 * Se ejecuta con:  npx tsx tests/entregaFuncional.test.ts   (o `npm run validar`)
 *
 * Custodia la capacidad nueva `forjar_y_entregar`: el BUCLE A PRUEBA DE ERRORES
 * que va de un brief a un ZIP FUNCIONAL en una sola orden. Qué vigila y por qué:
 *
 *   1. CONTRATO: la herramienta está declarada, tiene ejecutor y viaja en el
 *      manifiesto. Una capacidad sin herramienta visible es una capacidad que
 *      el agente no puede usar (la lección de v1.18.0).
 *   2. A PRUEBA DE ERRORES DE VERDAD: un brief vacío o basura NO tumba el
 *      servicio ni lanza excepción — responde 200 con un veredicto honesto. Cada
 *      paso corre en su red y los fallos van a la bitácora, no al vacío.
 *   3. ENTREGA PROBADA, NO PROMETIDA: el ZIP no se da por bueno sin ABRIRLO. Se
 *      exige firma PK real en disco, integridad CRC, index.html dentro y cotejo
 *      hash a hash contra el sitio. Un .zip corrupto o incompleto es
 *      no_entregable, no «hecho».
 *   4. HONESTIDAD: donde el usuario no dio datos quedan [Personaliza este texto]
 *      y el veredicto baja a entregable_con_reservas con la reserva nombrada.
 *      El bucle NUNCA inventa contenido para simular que terminó.
 *   5. DETERMINISMO: mismo brief -> mismo sha256. Si el hash no es estable, la
 *      promesa de «mismo contenido, mismo artefacto» es mentira.
 *   6. BUCLE HONESTO: la parada es una de las declaradas (publicable /
 *      convergio / max_rondas) y el techo de rondas se respeta.
 *
 * Todo corre contra un demonio real en un puerto efímero con CN_CREADOR_ROOT en
 * un temporal: `.creador/` del proyecto no se toca.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
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
 * v2.1.3 — Levantar un hijo y esperar /health tiene que poder DECIR POR QUÉ no
 * levantó. En la instalación el rojo era «segundo creador vivo — ECONNREFUSED»
 * y no había una línea del hijo que dijera nada: un fallo de arranque (python
 * que no resuelve, módulo que falta, puerto ocupado) quedaba indistinguible de
 * un timeout de red. Ahora el stderr del hijo viaja en el mensaje y la espera
 * es más larga (Windows arranca python en frío en varios segundos).
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
      /* aún levantando */
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

const PARADAS_VALIDAS = ["publicable", "convergio", "max_rondas"];
const VEREDICTOS_VALIDOS = ["entregable", "entregable_con_reservas", "no_entregable"];

const briefCompleto = {
  nombre: "Aurora Bici", tipo: "landing", paleta: "noche", idioma: "es",
  titulo: "Reparación de bicicletas en el barrio",
  subtitulo: "Recogemos, reparamos y devolvemos tu bici en 48 horas laborables",
  cta: "Reservar cita", contacto: "hola@aurora.example",
  descripcion: "Taller de bicicletas de barrio: reparación en 48 horas, recogida a domicilio y presupuesto cerrado por escrito.",
  url_canonica: "https://aurora.example/",
  caracteristicas: [
    { titulo: "Presupuesto cerrado", texto: "Sabes el precio antes de que toquemos nada" },
    { titulo: "Recogida a domicilio", texto: "Vamos a buscarla y te la devolvemos arreglada" },
  ],
};

const DIR = mkdtempSync(path.join(tmpdir(), "cn-entrega-"));
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

    seccion("1 · Contrato de la herramienta nueva");
    const manifiesto = await (await fetch(`${BASE}/tools`, { signal: AbortSignal.timeout(8000) })).json();
    const lista = (manifiesto?.tools || []) as any[];
    const nombres = lista.map((t) => t.name);
    comprobar("forjar_y_entregar está declarada en el manifiesto", nombres.includes("forjar_y_entregar"));
    const spec = lista.find((t) => t.name === "forjar_y_entregar");
    comprobar("su spec es válido (description + parameters.object + brief requerido)",
      !!spec && typeof spec.description === "string" && spec.parameters?.type === "object" &&
      Array.isArray(spec.parameters?.required) && spec.parameters.required.includes("brief"),
      JSON.stringify(spec)?.slice(0, 140));
    comprobar("la descripción promete lo esencial (bucle, ZIP verificado, no inventa)",
      /bucle/i.test(spec?.description || "") && /zip/i.test(spec?.description || "") &&
      /(verific|coincide|CRC)/i.test(spec?.description || "") && /(no inventa|reserva|honest)/i.test(spec?.description || ""));
    const eco = await llamar(BASE, "forjar_y_entregar", {});
    comprobar("tiene ejecutor real (no responde «Herramienta desconocida»)",
      !/Herramienta desconocida/.test(String(eco.cuerpo?.error || "")));

    seccion("2 · A prueba de errores: la basura no tumba la línea");
    const vacio = await llamar(BASE, "forjar_y_entregar", { brief: {} });
    comprobar("un brief vacío responde 200 (no 500, no cuelga)", vacio.status === 200, String(vacio.status));
    comprobar("y devuelve un veredicto honesto, sin excepción cruda",
      typeof vacio.cuerpo?.veredicto === "string" && VEREDICTOS_VALIDOS.includes(vacio.cuerpo.veredicto),
      JSON.stringify(vacio.cuerpo)?.slice(0, 160));
    const basura = await llamar(BASE, "forjar_y_entregar", { brief: { nombre: "../escapar", tipo: 12345 } as any });
    comprobar("un nombre con ../ NO se sanea a escondidas: se niega con veredicto",
      basura.status === 200 && basura.cuerpo?.ok === false && basura.cuerpo?.veredicto === "no_entregable",
      JSON.stringify(basura.cuerpo)?.slice(0, 160));

    seccion("3 · Forja completa: brief → sitio → bucle → ZIP funcional");
    const r = (await llamar(BASE, "forjar_y_entregar", { brief: briefCompleto, rondas: 3 })).cuerpo;
    comprobar("responde ok con veredicto de entrega",
      r?.ok === true && ["entregable", "entregable_con_reservas"].includes(r?.veredicto),
      JSON.stringify(r)?.slice(0, 200));
    comprobar("la parada del bucle es una de las honestas declaradas",
      PARADAS_VALIDAS.includes(r?.parada_bucle), String(r?.parada_bucle));
    comprobar("respetó el techo de rondas (<= pedido)", (r?.rondas_corridas ?? 99) <= 3, String(r?.rondas_corridas));
    comprobar("la traza por ronda trae errores/marcadores medidos",
      Array.isArray(r?.rondas) && r.rondas.length >= 1 &&
      r.rondas.every((x: any) => typeof x.errores === "number" || x.errores === 0 || x.errores === null),
      JSON.stringify(r?.rondas)?.slice(0, 160));

    seccion("4 · El ZIP es FUNCIONAL, no solo existe");
    const zip = r?.zip as string;
    comprobar("el ZIP se escribió en disco", !!zip && existsSync(zip), zip);
    if (zip && existsSync(zip)) {
      const bytes = readFileSync(zip);
      comprobar("tiene firma PK real de un .zip (0x50 0x4B)", bytes[0] === 0x50 && bytes[1] === 0x4b);
      comprobar("pesa lo que dice el informe", bytes.length === r?.bytes, `${bytes.length} vs ${r?.bytes}`);
    }
    const v = r?.verificacion_zip;
    comprobar("la verificación del ZIP pasó (abrir + CRC + cotejo)", v?.ok === true, JSON.stringify(v)?.slice(0, 160));
    comprobar("el ZIP trae index.html dentro", v?.index_html === true);
    comprobar("el contenido coincide hash a hash con el disco", v?.cotejo_hash === "identico");
    comprobar("tiene sha256 de artefacto", typeof r?.sha256 === "string" && r.sha256.length === 64, String(r?.sha256));
    const listado = (await llamar(BASE, "listar_exportaciones", {})).cuerpo;
    comprobar("el ZIP aparece en listar_exportaciones con su sha256",
      Array.isArray(listado?.exportaciones) && listado.exportaciones.some((e: any) => e.sha256 === r?.sha256),
      JSON.stringify(listado?.exportaciones)?.slice(0, 160));

    seccion("5 · Honestidad: los datos que faltan quedan como reserva");
    const parco = (await llamar(BASE, "forjar_y_entregar", {
      brief: { nombre: "Sitio Parco", tipo: "onepage", titulo: "Título", descripcion: "Una descripción suficiente para el sitio." },
    })).cuerpo;
    comprobar("un brief incompleto entrega CON RESERVAS (no miente «listo»)",
      parco?.veredicto === "entregable_con_reservas", String(parco?.veredicto));
    comprobar("nombra los [Personaliza este texto] pendientes",
      Array.isArray(parco?.reservas) && parco.reservas.some((s: string) => /Personaliza/.test(s)),
      JSON.stringify(parco?.reservas));
    comprobar("aun con reservas, el ZIP entregado es íntegro",
      parco?.verificacion_zip?.ok === true && !!parco?.zip && existsSync(parco.zip));

    seccion("6 · Determinismo: mismo brief → mismo sha256");
    const ROOT2 = path.join(DIR, "creador2");
    mkdirSync(ROOT2, { recursive: true });
    const puerto2 = await puertoLibre();
    const BASE2 = `http://127.0.0.1:${puerto2}`;
    const proc2 = spawn(PYTHON, [CREADOR, "--port", String(puerto2)], {
      cwd: RAIZ, env: { ...process.env, CN_CREADOR_ROOT: ROOT2 }, stdio: ["ignore", "pipe", "pipe"],
    });
    recordarSalida(proc2);
    try {
      comprobar("segundo creador vivo", await esperarVivo(BASE2), BASE2 + " · " + porQueNoLevanto(proc2));
      const otra = (await llamar(BASE2, "forjar_y_entregar", { brief: briefCompleto, rondas: 3 })).cuerpo;
      comprobar("un ROOT distinto con el MISMO brief produce el MISMO sha256",
        typeof otra?.sha256 === "string" && otra.sha256 === r?.sha256,
        `${otra?.sha256} vs ${r?.sha256}`);
    } finally {
      proc2.kill("SIGTERM");
    }
  }
} finally {
  procesor?.kill("SIGTERM");
  await esperar(200);
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temporal */ }
}

console.log(`\n${fallos.length === 0 ? "\u2713 TODO EN VERDE" : "\u2717 HAY ROJOS"}`);
console.log(`${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) {
  for (const f of fallos) console.log(`  \u00b7 ${f}`);
  process.exitCode = 1;
}

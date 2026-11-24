/**
 * tests/sondaUnica.test.ts — UN JUEGO DE SONDAS, AUNQUE LA PIDAN TRES (v1.0.35)
 * =========================================================================
 * Se ejecuta con:  npx tsx tests/sondaUnica.test.ts
 *
 * LA PRUEBA SON LOS NÚMEROS DEL LOG DE MARIO (20/11)
 * --------------------------------------------------
 *   [estabilidad] /api sin respuesta en 45000 ms: GET /api/telemetry/ports
 *   [supervisor] «memoria» (:5100) no contesta → reanimo, intento 1 de 3
 *   [supervisor] «motor» (:5103) no contesta → reanimo, intento 2 de 3
 *   CPU al 100 %, panel de puertos en OFF, cartel «servidor local caído».
 *
 * Con el panel pidiendo cada 10 s y una muestra que puede tardar 30 s (Ollama
 * al 100 % de CPU tarda 35 s en `/api/tags`), la ruta sin vuelo único apilaba
 * TRES juegos de seis sondas: el sondeo era la causa del atasco que informaba.
 * Y el supervisor, al ver que un puerto vivo no aceptaba la conexión en 3 s,
 * abría un SEGUNDO dueño del mismo puerto — que choca, muere y deja CPU y RAM
 * tomadas. Los dos defectos se prueban acá, con reloj y sondas inyectados.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearSondaUnica, ESPERA_COMPARTIDA_MS, TECHO_DUENIO_MS } from "../src/engine/sondaUnica";
import { montarSupervisorArranque } from "../server/routers/supervisorArranque";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf-8");

let ok = 0;
const fallos: string[] = [];
function check(nombre: string, cond: boolean, detalle = "") {
  if (cond) { ok++; console.log(`  \u2713 ${nombre}`); }
  else { fallos.push(`${nombre}${detalle ? " \u2192 " + detalle : ""}`); console.log(`  \u2717 ${nombre}${detalle ? " \u2014 " + detalle : ""}`); }
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  console.log("\n1. VUELO ÚNICO: cinco clientes, un solo juego de sondas\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    let mediciones = 0;
    let soltar: (v: string) => void = () => {};
    const sonda = crearSondaUnica<string>({
      medir: () => { mediciones++; return new Promise<string>((r) => { soltar = r; }); },
      esperaMaximaMs: 5000,
    });
    const peticiones = [sonda.pedir(), sonda.pedir(), sonda.pedir(), sonda.pedir(), sonda.pedir()];
    check("cinco peticiones simultáneas abren UNA sola medición", mediciones === 1, `abrió ${mediciones}`);
    check("el que llega con la medición en vuelo la ve en curso", sonda.enVuelo() === true);
    soltar("muestra");
    const res = await Promise.all(peticiones);
    check("las cinco reciben la misma muestra", res.every((r) => r.muestra === "muestra"));
    check("una sola se declara dueña («nueva»); el resto la comparte", res.filter((r) => r.origen === "nueva").length === 1 && res.filter((r) => r.origen === "compartida").length === 4, res.map((r) => r.origen).join(","));
    check("al terminar no queda nada en vuelo", sonda.enVuelo() === false && sonda.mediciones() === 1);
  }

  console.log("\n2. CACHÉ: si hay muestra vigente, no se mide\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    const sonda = crearSondaUnica<number>({ medir: async () => 99, cache: () => 7 });
    const r = await sonda.pedir();
    check("con caché vigente se sirve la caché", r.muestra === 7 && r.origen === "cache");
    check("y no se gastó ni una sonda", sonda.mediciones() === 0);
  }

  console.log("\n3. LA MEDICIÓN LENTA NO CUELGA A LOS QUE LLEGAN TARDE\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    let mediciones = 0;
    let soltar: (v: string) => void = () => {};
    const sonda = crearSondaUnica<string>({
      medir: () => { mediciones++; return new Promise<string>((r) => { soltar = r; }); },
      conocida: () => "lectura vieja",
      esperaMaximaMs: 40,
    });
    const duenio = sonda.pedir();
    await dormir(10);
    const t0 = Date.now();
    const tarde = await sonda.pedir();
    const espero = Date.now() - t0;
    check("★ el que llega tarde contesta con la última lectura, sin esperar 30 s", tarde.muestra === "lectura vieja" && tarde.origen === "heredada", `origen=${tarde.origen}`);
    check("★ y la marca como heredada, no como medida ahora", tarde.enVuelo === true);
    check("★ esperó a lo sumo la espera corta (no el presupuesto entero)", espero < 1000, `${espero} ms`);
    check("★ la medición sigue siendo UNA (no se abrió la segunda)", mediciones === 1);
    soltar("fresca");
    const r = await duenio;
    check("el dueño recibe la muestra fresca", r.muestra === "fresca" && r.origen === "nueva");
  }

  console.log("\n3-bis. EL DUEÑO NO SE QUEDA COLGADO DE LA MEDICIÓN\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    let soltar: (v: string) => void = () => {};
    let mediciones = 0;
    const sonda = crearSondaUnica<string>({
      medir: () => { mediciones++; return new Promise<string>((r) => { soltar = r; }); },
      conocida: () => "lectura vieja",
      esperaMaximaMs: 40,
      techoDuenioMs: 40,
    });
    const t0 = Date.now();
    const r = await sonda.pedir();
    const espero = Date.now() - t0;
    check("★ el dueño suelta en su techo, no en los 35 s de Ollama", espero < 1000, `${espero} ms`);
    check("★ y contesta con la última lectura, marcada como heredada", r.muestra === "lectura vieja" && r.origen === "heredada", `origen=${r.origen}`);
    check("★ la medición NO se cancela: sigue en vuelo para el siguiente pedido", sonda.enVuelo() === true && mediciones === 1);
    soltar("fresca");
    await dormir(20);
    check("y al terminar deja la muestra lista (no queda nada colgado)", sonda.enVuelo() === false);
  }

  console.log("\n4. UN SONDEO QUE ESTALLA NO DEJA LA PUERTA CERRADA\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    let intentos = 0;
    const sonda = crearSondaUnica<string>({
      medir: async () => { intentos++; if (intentos === 1) throw new Error("ECONNRESET"); return "buena"; },
      conocida: () => null,
      esperaMaximaMs: 500,
    });
    const r1 = await sonda.pedir();
    check("el fallo se devuelve como «vacía», no como excepción", r1.muestra === null && r1.origen === "vacia");
    const r2 = await sonda.pedir();
    check("★ la siguiente petición vuelve a medir y sana", r2.muestra === "buena" && intentos === 2, `intentos=${intentos}`);
    check("sin nada en vuelo después del fallo", sonda.enVuelo() === false);
  }

  console.log("\n5. EL CABLE: la ruta de puertos ya no apila sondeos\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    const ruta = leer("server/routers/telemetria.ts");
    check("la ruta usa el guardián de vuelo único", /crearSondaUnica</.test(ruta) && /const sonda = crearSondaUnica/.test(ruta));
    check("la espera del que llega tarde es la corta, no el presupuesto", /esperaMaximaMs: ESPERA_COMPARTIDA_MS/.test(ruta));
    const i0 = ruta.indexOf('app.get("/api/telemetry/ports"');
    const i1 = ruta.indexOf('app.post("/api/telemetry/refresh"');
    const cuerpo = ruta.slice(i0, i1 > i0 ? i1 : ruta.length);
    check("la ruta pide la muestra por el guardián", /await sonda\.pedir\(\)/.test(cuerpo));
    check("★ la ruta NO abre sondas propias (el sondeo vive en medirMuestra)", !/fetch\(/.test(cuerpo) && !/SONDAS\.map/.test(cuerpo));
    check("la muestra heredada se declara incompleta, no se disimula", /heredadaPorSondeoEnCurso: true/.test(cuerpo) && /motivoMuestra/.test(cuerpo));
    check("sin ninguna lectura tampoco se inventa un «caído»: se dice sinMuestra", /sinMuestra: true/.test(cuerpo));

    // v1.0.38 · EL DUEÑO TAMBIÉN SUELTA LA CONEXIÓN
    check("★ la ruta le pone techo al dueño (no lo deja esperar 35 s de Ollama)", /techoDuenioMs: TECHO_DUENIO_MS/.test(ruta));
    const lat = leer("src/engine/latido.ts");
    const int = Number(lat.match(/INTERVALO_LATIDO_MS = (\d+)/)![1]);
    const cad = Number(lat.match(/CADUCIA_LATIDO = (\d+)/)![1]);
    check("★ y el techo es MENOR que el latido (si no, el remedio repite la enfermedad)", TECHO_DUENIO_MS < int * cad, `${TECHO_DUENIO_MS} ms vs latido ${int * cad} ms`);
    check("y la espera del que llega tarde tampoco llega al latido", ESPERA_COMPARTIDA_MS < int * cad, `${ESPERA_COMPARTIDA_MS} ms`);
    check("medirMuestra está definida antes de la ruta que la usa", ruta.indexOf("const medirMuestra") > -1 && ruta.indexOf("const medirMuestra") < ruta.indexOf('app.get("/api/telemetry/ports"'));
    check("se conserva el tope del presupuesto y la segunda escritura", /await Promise\.race\(\[terminan, tope\]\)/.test(ruta) && /void terminan\.then\(/.test(ruta));
  }

  console.log("\n6. EL SUPERVISOR NO ABRE UN SEGUNDO DUEÑO DEL PUERTO\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    const fuente = leer("server/routers/supervisorArranque.ts");
    check("el plano declara quién escucha el puerto (netstat/ss)", /duenioDelPuerto\?:/.test(fuente) && /deps\.duenioDelPuerto \|\| duenosDelPuerto/.test(fuente));
    check("★ la pregunta por el dueño va ANTES de reanimar", fuente.indexOf("await hayDuenio(s.puerto)") > -1 && fuente.indexOf("await hayDuenio(s.puerto)") < fuente.indexOf("reanimar(s.comando, s.id)"));
    check("un «no contesta» con dueño no gasta intento ni abre proceso", /no abro un segundo/.test(fuente) && /NO reanimo \(evito el segundo proceso\)/.test(fuente));
  }

  // ── en seco: el supervisor con un puerto ocupado y otro libre ──────────
  {
    const reloj = { v: 5_000_000 };
    const reanimados: string[] = [];
    const silencio = { log() {}, warn() {} };
    const datos = fs.mkdtempSync(path.join(os.tmpdir(), "cn-sonda-"));
    const sup = montarSupervisorArranque({
      raizProyecto: RAIZ,
      raizDatos: datos,
      ahora: () => reloj.v,
      consola: silencio,
      sondear: async () => false, // ningún puerto contesta a tiempo (CPU al 100 %)
      duenioDelPuerto: async (puerto) => (puerto === 5100 ? [4242] : []), // solo :5100 tiene dueño
      reanimar: (_cmd, id) => { reanimados.push(String(id)); },
    });
    await sup.pasar(); // reconocimiento: solo mide
    check("la primera pasada no reanima a nadie", reanimados.length === 0, reanimados.join(","));
    for (let i = 0; i < 5; i++) { reloj.v += 40_000; await sup.pasar(); }
    const memoria = sup.estado().servicios.find((s) => s.puerto === 5100)!;
    check("★ :5100 escucha pero no contesta → NO se reanima (segundo dueño evitado)", !reanimados.includes("memoria"), reanimados.join(","));
    check("se pinta vivo (hay dueño), no caído", memoria.vivo === true);
    check("y el aviso lo explica con el puerto y el plazo", /escucha en :5100/.test(memoria.aviso), memoria.aviso);
    check("★ un :5103 LIBRE sí se reanima (el guardián no paraliza al supervisor)", reanimados.includes("motor"), reanimados.join(","));
    fs.rmSync(datos, { recursive: true, force: true });
  }

  console.log("\n7. EN VIVO: LA RUTA DE VERDAD, CON TRES PETICIONES A LA VEZ\n");
  // ══════════════════════════════════════════════════════════════════════
  {
    // Se registra la ruta real y se le cambia el `fetch` por uno que tarda
    // 300 ms (lo que tarda un /api/tags con la CPU ocupada). Si la ruta no
    // tuviera vuelo único, tres peticiones abrirían 18 sondas.
    const original = globalThis.fetch;
    let llamadas = 0;
    (globalThis as any).fetch = async (url: any) => {
      llamadas++;
      await dormir(300);
      return { ok: true, json: async () => (String(url).includes("/api/tags") ? { models: [{ name: "a" }, { name: "b" }] } : {}) };
    };
    try {
      const { registrarTelemetria } = await import("../server/routers/telemetria");
      const rutas: Record<string, any> = {};
      registrarTelemetria({ get: (p: string, h: any) => { rutas[p] = h; }, post: () => {} } as any, {
        ollamaUrl: "http://127.0.0.1:11434", workerPort: 5000, sandboxPort: 3500,
        sandboxVivo: () => true, sandboxPid: () => 1,
      });
      const handler = rutas["/api/telemetry/ports"];
      const pedir = () => new Promise<any>((res) => {
        const r: any = {
          headersSent: false, headers: {} as any, status() { return r; }, end() {}, on() {},
          setHeader(k: string, v: any) { r.headers[k] = v; },
          getHeader(k: string) { return r.headers[k]; },
          json(b: any) { r.headersSent = true; res(b); },
        };
        handler({}, r);
      });
      const t0 = Date.now();
      const tres = await Promise.all([pedir(), pedir(), pedir()]);
      const ms = Date.now() - t0;
      check("★ tres peticiones simultáneas = SEIS sondas (un solo juego), no 18", llamadas === 6, `fueron ${llamadas}`);
      check("★ y contestan en lo que tarda UNA medición, no en tres", ms < 1500, `${ms} ms`);
      check("las tres traen la misma lectura completa", tres.every((x) => x.port11434 === true && x.incompleto === false));
      check("el catálogo de modelos no se pierde por el camino", tres.every((x) => x.ollamaModelCount === 2), tres.map((x) => x.ollamaModelCount).join(","));
      const cuarta = await pedir();
      check("★ la cuarta sale de la caché: no toca el puerto", llamadas === 6 && cuarta.lastChecked > 0, `sondas=${llamadas}`);
    } finally {
      (globalThis as any).fetch = original;
    }
  }

  console.log(`\n—— sondaUnica: ${ok} correctas · ${fallos.length} fallidas ——`);
  if (fallos.length) { console.log("\nFALLOS:"); for (const f of fallos) console.log(`  · ${f}`); }
  process.exitCode = fallos.length ? 1 : 0;
}

void principal();

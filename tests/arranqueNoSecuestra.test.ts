/**
 * tests/arranqueNoSecuestra.test.ts — EL TELÓN NO PUEDE QUEDARSE CERRADO (v2.1.4)
 * ============================================================================
 * EL BUG QUE ESTO VIGILA (captura de Mario, 02/11/2026 23:31)
 * ----------------------------------------------------------
 * La IDE se quedaba en «CerebroNico arrancando motor · consultando el estado del
 * motor…» y no abría. El comentario del componente prometía «nunca se deja al
 * usuario atrapado en la pantalla», y el código lo cumplía **dentro** del `then`
 * del `fetch`: si `/api/health/deep` no contestaba —motor cargando un modelo,
 * bucle de eventos ocupado—, ni el `then` ni el `catch` corrían, y la única
 * salida era cerrar la pestaña.
 *
 * Estas comprobaciones son sobre el guion puro (`src/arranque/guionArranque.ts`)
 * porque una promesa que no se resuelve no se puede probar esperándola: se
 * prueba la regla del reloj, que es la que decide.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plazoApi, plazoDeRuta } from "../server/middleware/plazoApi.ts";
import {
  PLAZO_ERROR_MS,
  PLAZO_MAXIMO_MS,
  PLAZO_SONDA_MS,
  debeEntrar,
  porQueSeAbrio,
} from "../src/arranque/guionArranque.ts";

let ok = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void) {
  try {
    fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e: any) {
    fallos.push(`${nombre} → ${e?.message || e}`);
    console.log(`  ✗ ${nombre} — ${e?.message || e}`);
  }
}

const inicio = 1_000_000;
const en = (ms: number) => ({ ahora: inicio + ms, inicio });

console.log("\n── 1. El caso que rompió: el motor no contesta NUNCA ──");

prueba("sin una sola respuesta, a los 3 s todavía espera (no abre a lo loco)", () => {
  const d = debeEntrar({ ...en(3_000), checks: [], ultimoError: "" });
  assert.equal(d.entrar, false);
  assert.equal(d.motivo, "esperando");
});

prueba("★ sin una sola respuesta, a los 12 s ABRE (antes: para siempre)", () => {
  const d = debeEntrar({ ...en(PLAZO_MAXIMO_MS), checks: [], ultimoError: "" });
  assert.equal(d.entrar, true, "el telón seguiría cerrado: es el bug de la captura");
  assert.equal(d.motivo, "plazo");
});

prueba("sigue abriendo a los 60 s y a los 10 min (no es un borde de un solo uso)", () => {
  for (const ms of [60_000, 600_000]) {
    assert.equal(debeEntrar({ ...en(ms), checks: [], ultimoError: "" }).entrar, true);
  }
});

prueba("el watchdog abre ANTES de que el usuario se rinda: 12 s y no más de 20", () => {
  assert.ok(PLAZO_MAXIMO_MS <= 20_000, `plazo ${PLAZO_MAXIMO_MS} ms es demasiado largo`);
  assert.ok(PLAZO_MAXIMO_MS >= 6_000, `plazo ${PLAZO_MAXIMO_MS} ms no deja ver las filas`);
});

console.log("\n── 2. Los otros dos caminos ──");

prueba("error de transporte: abre a los 3 s, con su motivo", () => {
  assert.equal(debeEntrar({ ...en(PLAZO_ERROR_MS - 1), checks: [], ultimoError: "ECONNREFUSED" }).entrar, false);
  const d = debeEntrar({ ...en(PLAZO_ERROR_MS), checks: [], ultimoError: "ECONNREFUSED" });
  assert.equal(d.entrar, true);
  assert.equal(d.motivo, "error");
});

prueba("todo en verde: abre al instante, sin esperar el plazo", () => {
  const d = debeEntrar({ ...en(120), checks: [{ ok: true }, { ok: true }], ultimoError: "" });
  assert.equal(d.entrar, true);
  assert.equal(d.motivo, "completo");
});

prueba("una fila roja NO abre al instante: se ve el rojo y se decide", () => {
  const d = debeEntrar({ ...en(1_000), checks: [{ ok: true }, { ok: false }], ultimoError: "" });
  assert.equal(d.entrar, false, "abriría sin dejar leer el rojo");
});

prueba("una fila roja SÍ abre al vencer el plazo (no secuestra por un rojo)", () => {
  const d = debeEntrar({ ...en(PLAZO_MAXIMO_MS), checks: [{ ok: false }], ultimoError: "" });
  assert.equal(d.entrar, true);
  assert.equal(d.motivo, "plazo");
});

prueba("el motivo se puede explicar en una línea (para el informe y la consola)", () => {
  const t = porQueSeAbrio({ entrar: true, motivo: "plazo", transcurrido: 12_000 });
  assert.match(t, /12\.000 ms|12000 ms/);
  assert.match(t, /plazo/i);
});

console.log("\n── 3. Que el componente no vuelva a atarse a la promesa ──");

const splash = readFileSync(new URL("../src/components/BootSplash.tsx", import.meta.url), "utf8");
const diag = readFileSync(new URL("../server/routers/diagnostico.ts", import.meta.url), "utf8");

prueba("el splash importa la regla pura (no un `if` suelto)", () => {
  assert.match(splash, /from "\.\.\/arranque\/guionArranque"/);
  assert.match(splash, /debeEntrar\(/);
});

prueba("el splash no lanza un fetch sin plazo (AbortController o signal)", () => {
  const fetchs = splash.match(/fetch\([^)]*\)/g) || [];
  assert.ok(fetchs.length > 0, "no hay fetch: la prueba dejó de mirar lo que cree");
  for (const f of fetchs) assert.match(f, /signal/, `fetch sin signal: ${f}`);
});

prueba("hay un vigilante por reloj, aparte del sondeo", () => {
  assert.match(splash, /setInterval\(evaluar/, "no hay vigilante: la salida vuelve a depender del fetch");
});

prueba("el sondeo no apila peticiones (bandera enCurso)", () => {
  assert.match(splash, /if \(enCurso \|\| cerrado\) return;/);
});

prueba("el servidor libera `enVuelo` con finally (una excepción no envenena la ruta)", () => {
  assert.match(diag, /finally \{\s*\n\s*enVuelo = null;/);
});

prueba("el servidor tiene plazo duro por pasada", () => {
  assert.match(diag, /PLAZO_PASADA_MS/);
  assert.match(diag, /conPlazo\(/);
});

prueba("la peor pasada del servidor cabe en el plazo del cliente", () => {
  const m = diag.match(/AbortSignal\.timeout\((\d+)\)/g) || [];
  const plazos = m.map((x) => Number(x.match(/\((\d+)\)/)![1]));
  const peor = Math.min(PLAZO_MAXIMO_MS, Math.max(...plazos) + Math.max(...plazos.filter((p) => p < Math.max(...plazos))));
  assert.ok(
    Math.max(...plazos) <= PLAZO_MAXIMO_MS,
    `una sonda sola (${Math.max(...plazos)} ms) ya no cabe en el telón (${PLAZO_MAXIMO_MS} ms)`,
  );
  assert.ok(PLAZO_SONDA_MS >= 2_000, "el plazo por intento es demasiado corto para una máquina con Ollama cargando");
  assert.ok(peor > 0);
});


console.log("\n── 4. El reloj de /api (Express 4 no contesta un rechazo) ──");

prueba("★ una ruta /api que nadie contesta recibe 504 al vencer, no queda muda", () => {
  let plazo = 0;
  let enviado: any = null;
  const res: any = {
    headersSent: false,
    setTimeout(ms: number, cb: () => void) {
      plazo = ms;
      // el reloj vence en el acto: así se observa sin esperar 20 s
      cb();
      return this;
    },
    status(code: number) {
      this.codigo = code;
      return this;
    },
    json(cuerpo: any) {
      enviado = { codigo: this.codigo, cuerpo };
      return this;
    },
  };
  const req: any = { method: "GET", originalUrl: "/api/health/deep" };
  let siguiente = false;
  plazoApi()(req, res, () => (siguiente = true));
  assert.equal(siguiente, true, "el middleware tiene que dejar pasar la petición");
  // v2.2.7 · esta valla usaba `/api/health/deep` de ejemplo y esperaba 20000. Desde
  // la tabla de plazos, health/deep tiene 60000 a propósito (corre los cinco
  // chequeos y uno de ellos es Ollama con modelo frío). Lo que se verifica acá es
  // que HAY 504, no qué número tiene cada ruta: eso lo cuida plazoApiStream.
  assert.equal(plazo, plazoDeRuta(req.originalUrl).ms, `plazo inesperado: ${plazo}`);
  assert.ok(enviado, "no contestó nada: la petición quedaría colgada");
  assert.equal(enviado.codigo, 504);
  assert.equal(enviado.cuerpo.ruta, "/api/health/deep", "el rojo tiene que decir QUÉ ruta se calló");
});

prueba("si la ruta ya contestó, el reloj no la pisa", () => {
  let enviado = false;
  const res: any = {
    headersSent: true,
    setTimeout(_ms: number, cb: () => void) {
      setTimeout(cb, 0);
      return this;
    },
    status() { return this; },
    json() { enviado = true; return this; },
  };
  plazoApi()({ method: "GET", originalUrl: "/api/x" } as any, res, () => {});
});

prueba("server.ts monta el reloj antes de las rutas", () => {
  const srv = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(srv, /app\.use\("\/api", plazoApi\(\)\)/);
  const posReloj = srv.indexOf('app.use("/api", plazoApi())');
  const posRutas = srv.indexOf("registrarDiagnostico(app");
  assert.ok(posReloj > 0 && posRutas > 0 && posReloj < posRutas, "el reloj quedó después de las rutas");
});

console.log(`\n═══ arranqueNoSecuestra: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}

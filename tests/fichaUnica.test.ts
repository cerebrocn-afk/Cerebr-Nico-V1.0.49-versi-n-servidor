/**
 * tests/fichaUnica.test.ts — UNA SOLA RESPUESTA POR PETICIÓN (v1.0.24)
 * =====================================================================
 * DE DÓNDE SALE ESTA VALLA
 * -----------------------
 * El log de arranque real de Mario (v1.0.23) traía CUATRO trazas con una sola
 * forma:
 *
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/subagents
 *     → Error [ERR_HTTP_HEADERS_SENT]          (server.ts:6704)
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/telemetry/ports
 *     → Error [ERR_HTTP_HEADERS_SENT]          (telemetria.ts:215)
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/sandbox/status
 *     → Error [ERR_HTTP_HEADERS_SENT]          (server.ts:8219)
 *   [estabilidad] /api sin respuesta en 20000 ms: GET /api/system/stats
 *     → Error [ERR_HTTP_HEADERS_SENT]          (telemetria.ts:294)
 *
 * El plazo NO cancela el handler: contesta 504 y la ruta termina un segundo
 * después llamando `res.json()` sobre el mismo socket. Eso estalla dentro de
 * una promesa que nadie espera → unhandledRejection, y el cliente acumula 504
 * en cadena hasta pintar «servidor local caído» con el proceso VIVO.
 *
 * QUÉ FIJA ESTA VALLA (y por qué es más estricta que un try/catch por ruta)
 * ------------------------------------------------------------------------
 *   1. Doble escritura ⇒ UNA sola escritura. No «no rompe»: escribe una vez.
 *   2. Llegar tarde ⇒ NO se escribe y se anota con nombre de ruta.
 *   3. `headersSent` es la verdad del socket, no una cortesía.
 *   4. La aritmética del corte: 1 y 2 colgadas ⇒ 504; 3 ⇒ solo-anotar (un
 *      proceso ocupado no es un proceso caído).
 *   5. Las CUATRO rutas del log están en la tabla de rutas lentas por diseño,
 *      y las cuatro tienen su ficha puesta en la fuente. Si alguien quita una
 *      ficha «porque ya no hace falta», esto se pone rojo con el nombre del
 *      archivo y la ruta.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { puedeContestar, descartarSiTarde, abrirFicha } from "../src/engine/fichaUnica";
import { plazoDeRuta, decidirCorte, CORTES_SIMULTANEOS, PLAZO_API_POR_DEFECTO_MS } from "../server/middleware/plazoApi";

const leer = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

let ok = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
  catch (e: any) { fallos.push(`${nombre} → ${e?.message || e}`); console.log(`  ✗ ${nombre} — ${e?.message || e}`); }
}

/** Respuesta de mentira que se comporta como un socket ya escrito. */
function respuestaFalsa(inicial: { headersSent?: boolean } = {}) {
  const estado = { headersSent: inicial.headersSent === true, writableEnded: false };
  const escrituras: any[] = [];
  const res = {
    get headersSent() { return estado.headersSent; },
    get writableEnded() { return estado.writableEnded; },
    json(cuerpo: any) {
      if (estado.headersSent) {
        // Esto es EXACTAMENTE lo que hacía Express: lanzar.
        const e: any = new Error("Cannot set headers after they are sent to the client");
        e.code = "ERR_HTTP_HEADERS_SENT";
        throw e;
      }
      estado.headersSent = true;
      escrituras.push(cuerpo);
      return res;
    },
    _escrituras: escrituras,
    _estado: estado,
  };
  return res;
}

const avisos: string[] = [];
const anotar = (l: string) => avisos.push(l);

console.log("\n── 1. La ficha: una sola escritura por petición ──");

prueba("★ dos escrituras ⇒ UNA escribe y la segunda se ignora (era ERR_HTTP_HEADERS_SENT)", () => {
  const res = respuestaFalsa();
  const ficha = abrirFicha(res, "/api/subagents", anotar);
  assert.equal(ficha.json({ a: 1 }), true, "la primera tiene que escribir");
  assert.equal(ficha.json({ a: 2 }), false, "la segunda NO escribe");
  assert.equal(res._escrituras.length, 1, "el cliente recibe un solo cuerpo");
  assert.deepEqual(res._escrituras[0], { a: 1 });
  assert.ok(avisos.some((a) => a.includes("DOS veces") && a.includes("/api/subagents")), "la segunda escritura se anota con su ruta");
});

prueba("★ la ficha NO estalla cuando el socket ya respondió: descarta y anota", () => {
  avisos.length = 0;
  const res = respuestaFalsa({ headersSent: true }); // el 504 del plazo ya salió
  const ficha = abrirFicha(res, "/api/sandbox/status", anotar);
  assert.doesNotThrow(() => ficha.json({ online: true }), "llegar tarde no puede tirar una excepción");
  assert.equal(ficha.json({ online: true }), false, "y tampoco escribe en el segundo intento");
  assert.equal(res._escrituras.length, 0, "cero escrituras sobre un socket respondido");
  assert.ok(avisos.some((a) => a.includes("/api/sandbox/status")), "el descarte deja la ruta en el log");
});

prueba("★ fuera del plazo: `abrirFicha` cuenta como NO disponible y no escribe", () => {
  assert.equal(puedeContestar({ headersSent: true }), false);
  assert.equal(puedeContestar({ headersSent: false }), true);
  assert.equal(puedeContestar({}), true, "sin la marca, se asume disponible (Express normal)");
  assert.equal(puedeContestar(null), false, "sin respuesta, no hay nada que escribir");
});

prueba("`descartarSiTarde` devuelve true SOLO cuando hay que descartar", () => {
  const avisos2: string[] = [];
  assert.equal(descartarSiTarde({ headersSent: false }, "/api/x", (l) => avisos2.push(l)), false);
  assert.equal(descartarSiTarde({ headersSent: true }, "/api/x", (l) => avisos2.push(l)), true);
  assert.equal(avisos2.length, 1);
  assert.ok(avisos2[0].includes("ERR_HTTP_HEADERS_SENT"), "el aviso nombra el error que evita");
});

console.log("\n── 2. El corte: ahogo no es caída ──");

prueba("★ 1 y 2 rutas colgadas ⇒ 504 (es una ruta lenta, se puede cortar)", () => {
  assert.equal(decidirCorte(1), "contestar-504");
  assert.equal(decidirCorte(2), "contestar-504");
  assert.ok(CORTES_SIMULTANEOS >= 2, "el umbral no puede ser 1: una sola ruta lenta es normal");
});

prueba("★ 3 o más ⇒ solo-anotar (el proceso está ocupado, no caído)", () => {
  assert.equal(decidirCorte(3), "solo-anotar");
  assert.equal(decidirCorte(9), "solo-anotar");
});

console.log("\n── 3. Las cuatro rutas del log tienen permiso de tardar ──");

const RUTAS_DEL_LOG = ["/api/subagents", "/api/telemetry/ports", "/api/sandbox/status", "/api/system/stats"];
for (const ruta of RUTAS_DEL_LOG) {
  prueba(`★ ${ruta} tiene plazo propio mayor que el común` , () => {
    const p = plazoDeRuta(ruta);
    assert.equal(p.excepcion, true, `${ruta} tiene que estar en la tabla`);
    assert.ok(p.ms > PLAZO_API_POR_DEFECTO_MS, `${ruta}: ${p.ms} ms no supera el plazo común`);
    assert.ok(p.porque && p.porque.length > 20, "una excepción sin evidencia es una excusa");
  });
}

prueba("★ la tabla no se comió la excepción más específica de /api/ai/stream", () => {
  assert.ok(plazoDeRuta("/api/ai/stream").ms >= 300000, "el chat largo sigue teniendo su plazo");
});

console.log("\n── 4. Y las cuatro rutas contestan POR FICHA en la fuente ──");

prueba("★ v1.0.25: las dos rutas EXTRAÍDAS abren ficha en su módulo, y el monolito solo delega", () => {
  // Antes esto buscaba `abrirFicha(res, "/api/subagents")` DENTRO de server.ts.
  // v1.0.25 sacó las rutas enteras a server/routers/ porque el monolito estaba
  // sobre su techo (12364 real contra 12317 declarado). La valla se reformula al
  // diseño nuevo y queda MÁS estricta: la ficha debe estar en el módulo Y el
  // monolito no puede recuperar el cuerpo de ninguna de las dos rutas.
  const sub = leer("server/routers/subagentes.ts");
  const est = leer("server/routers/estadoSandbox.ts");
  assert.ok(/abrirFicha\(res, "\/api\/subagents"/.test(sub), "falta la ficha de /api/subagents en su router");
  assert.ok(/abrirFicha\(res,\s*"\/api\/sandbox\/status"/.test(est), "falta la ficha de /api/sandbox/status en su router");
  const s = leer("server.ts");
  assert.ok(/registrarSubagentes\(app, \{/.test(s), "el monolito dejó de delegar /api/subagents");
  assert.ok(/registrarEstadoSandbox\(app, \{/.test(s), "el monolito dejó de delegar /api/sandbox/status");
  assert.ok(!/app\.get\("\/api\/subagents"/.test(s), "el cuerpo de /api/subagents volvió al monolito");
  assert.ok(!/app\.get\("\/api\/sandbox\/status"/.test(s), "el cuerpo de /api/sandbox/status volvió al monolito");
  assert.ok(!/\n\s+return res\.json\(/.test(sub), "subagentes sigue con res.json crudo");
  assert.ok(!/\n\s+return res\.json\(/.test(est), "estadoSandbox sigue con res.json crudo");
});

prueba("★ telemetria.ts: /api/telemetry/ports y /api/system/stats responden por ficha", () => {
  const t = leer("server/routers/telemetria.ts");
  assert.ok(/abrirFicha\(res, "\/api\/telemetry\/ports"/.test(t), "falta la ficha de /api/telemetry/ports");
  assert.ok(/abrirFicha\(res, "\/api\/system\/stats"/.test(t), "falta la ficha de /api/system/stats");
  // Y ninguna de las dos puede volver a escribir por la puerta vieja.
  assert.ok(!/\n\s+res\.json\(data\);/.test(t), "telemetry/ports sigue con res.json(data) crudo");
  assert.ok(!/\n\s+return res\.json\(\{\s*\n\s*ok: true,/.test(t), "system/stats sigue con res.json crudo");
});

console.log(`\n${ok} correctas · ${fallos.length} fallidas`);
if (fallos.length) { console.log(fallos.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }

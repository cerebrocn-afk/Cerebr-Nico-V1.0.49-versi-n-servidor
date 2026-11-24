/**
 * tests/presupuestoConn.test.ts — EL PRESUPUESTO DE CONEXIONES (v2.3.0)
 * =====================================================================
 * Mide lo que las capturas del 03/11 mostraron sin poder explicarlo:
 * «servidor local caído» junto a «44 detectados en Ollama».
 *
 * Acá no se levanta servidor: entra un `fetch` falso que se queda colgado, y se
 * afirma el comportamiento del semáforo y del plazo. Si esto pasa, el ahogo del
 * latido está imposibilitado por construcción.
 */
import assert from "node:assert/strict";
import {
  crearSemaphore,
  fetchConPresupuesto,
  semaforoCatalogo,
  TOPE_NO_CRITICOS,
  PLAZO_CATALOGO_MS,
  FalloDePresupuesto,
  TEXTO_SIN_RESPUESTA,
} from "../src/engine/presupuestoConn";

let ok = 0;
const fallos: string[] = [];
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try { await fn(); process.stdout.write("  \u2713 " + nombre + "\n"); ok++; }
  catch (e: any) { fallos.push(nombre + " \u2192 " + (e?.message || e)); process.stdout?.write?.(""); process.stdout.write("  \u2717 " + nombre + "\n"); }
}
const dormir = (ms: number) => new Promise((d) => setTimeout(d, ms));

process.stdout.write("\n\u2550\u2550 presupuestoConn (v2.3.0) \u2550\u2550\n\n");

process.stdout.write("-- 1. El techo es real, no decorativo --\n");
await prueba("\u2605 10 requests de catálogo nunca superan " + TOPE_NO_CRITICOS + " en vuelo", async () => {
  const sem = crearSemaphore();
  let enVuelo = 0, pico = 0;
  const semLocal = crearSemaphore();
  const fetchFalso = async () => {
    enVuelo++; pico = Math.max(pico, enVuelo);
    await dormir(12);
    enVuelo--;
    return { ok: true };
  };
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      fetchConPresupuesto("/api/proveedor-" + i + "/models", {}, { prioridad: "catalogo", fetchImpl: fetchFalso, plazoMs: 0, semaforo: semLocal })
    )
  );
  assert.ok(pico <= TOPE_NO_CRITICOS, "pico de " + pico + " superó el techo de " + TOPE_NO_CRITICOS);
  assert.ok(pico >= 2, "el semáforo no está ejerciendo presión: pico " + pico);
});
await prueba("\u2605 un catálogo colgado NO bloquea el latido (crítica salta el semáforo)", async () => {
  const colgado = () => new Promise(() => {}); // nunca resuelve: el peor proveedor
  // Plazo acotado ACÁ también: si el request no muere nunca, el semáforo queda
  // ocupado para siempre y la prueba se cuelga (que es, literalmente, el bug).
  const colas = Array.from({ length: 6 }, (_, i) =>
    fetchConPresupuesto("/api/zai/models?n=" + i, {}, { prioridad: "catalogo", fetchImpl: colgado, plazoMs: 120, semaforo: crearSemaphore() }).catch(() => null)
  );
  await dormir(5); // que los 3 primeros ocupen el semáforo y los otros 4 queden en cola
  let latidoSalió = false;
  const latido = await Promise.race([
    fetchConPresupuesto("/api/coreo", {}, {
      prioridad: "critica", plazoMs: 0,
      fetchImpl: async () => { latidoSalió = true; return { ok: true }; },
    }).then(() => true),
    dormir(50).then(() => false),
  ]);
  assert.ok(latido && latidoSalió, "el latido se quedó esperando detrás de los catálogos: esto es el «servidor caído» falso");
  void colas;
});
await prueba("los 3 sockets libres son para quien llegó primero (orden de cola)", async () => {
  const sem = crearSemaphore();
  const orden: string[] = [];
  const lenta = (nombre: string) =>
    fetchConPresupuesto("/x", {}, { fetchImpl: async () => { orden.push(nombre); await dormir(10); return {}; }, plazoMs: 3000, semaforo: sem });
  const ps = [lenta("a"), lenta("b"), lenta("c"), lenta("d"), lenta("e")];
  await dormir(2);
  assert.equal(orden.length, 3, "los 3 primeros debieron salir ya");
  await Promise.all(ps);
  assert.deepEqual(orden.slice(3), ["d", "e"], "la cola no respeta el orden de llegada");
});

process.stdout.write("\n-- 2. El plazo del navegador, no el del servidor --\n");
await prueba("\u2605 un proveedor colgado corta a los " + PLAZO_CATALOGO_MS + " ms y lo dice", async () => {
  const t0 = Date.now();
  let err: any = null;
  await fetchConPresupuesto("/api/cerebras/models", {}, {
    fetchImpl: (_u: string, init: any) =>
      new Promise((_r, rej) => { init?.signal?.addEventListener?.("abort", () => rej(new Error("AbortError"))); }),
    plazoMs: 40, semaforo: crearSemaphore(),
  }).catch((e) => { err = e; });
  const ms = Date.now() - t0;
  assert.ok(err instanceof FalloDePresupuesto, "no se lanzó FalloDePresupuesto: " + err?.message);
  assert.match(err.message, new RegExp(TEXTO_SIN_RESPUESTA));
  assert.ok(ms >= 30 && ms < 400, "el plazo no se respetó: " + ms + " ms");
});
await prueba("\u2605 al vencer, el lugar se LIBERA (no queda un socket zombi)", async () => {
  const semLocal = crearSemaphore();
  const antes = semLocal.enVuelo();
  const colgado = (_u: string, init: any) =>
    new Promise((_r, rej) => { init?.signal?.addEventListener?.("abort", () => rej(new Error("AbortError"))); });
  await Promise.all([0, 1, 2, 3].map((i) =>
    fetchConPresupuesto("/api/x" + i, {}, { fetchImpl: colgado, plazoMs: 30, semaforo: semLocal }).catch(() => null)));
  assert.equal(semLocal.enVuelo(), antes, "quedaron requests contando como en vuelo");
  assert.equal(semLocal.esperando(), 0, "quedó alguien en la cola");
});
await prueba("plazoMs 0 = sin plazo propio (el chat y el stream no se cortan solos)", async () => {
  let visto = 0;
  const r = await fetchConPresupuesto("/api/ai/stream", {}, {
    prioridad: "critica", plazoMs: 0, fetchImpl: async (_u, init) => { visto = init?.signal ? 1 : 0; return { ok: true }; },
  });
  assert.ok(r.ok);
  assert.equal(visto, 1, "hay que pasar el signal igual (por si el llamador trae uno)");
});
await prueba("un `senal` externa aborta y NO se disfraza de plazo", async () => {
  let abortado: any = null;
  const senal = { aborted: false, addEventListener: (_t: string, fn: () => void) => { abortado = fn; }, removeEventListener: () => {} };
  const p = fetchConPresupuesto("/api/zai/models", {}, {
    plazoMs: 5000, senal, semaforo: crearSemaphore(),
    fetchImpl: (_u: string, init: any) => new Promise((_r, rej) => { init?.signal?.addEventListener?.("abort", () => rej(new Error("AbortError"))); }),
  });
  await dormir(5);
  abortado?.();
  const e = await p.catch((x) => x);
  assert.ok(e instanceof Error, "no rechazó al abortar por fuera");
  assert.ok(!(e instanceof FalloDePresupuesto), "el abort del usuario no es un plazo vencido");
});
await prueba("una señal ya abortada no deja salir el request", async () => {
  const e = await fetchConPresupuesto("/api/zai/models", {}, {
    plazoMs: 500, senal: { aborted: true }, semaforo: crearSemaphore(),
    fetchImpl: (_u: string, init: any) => new Promise((_r, rej) => { init?.signal?.addEventListener?.("abort", () => rej(new Error("AbortError"))); }),
  }).catch((x) => x);
  assert.ok(e instanceof Error, "salió con la señal abortada");
});

process.stdout.write("\n-- 3. El presupuesto declarado con números --\n");
await prueba("Chrome corta en 6 por origen: nuestro techo es la mitad", () => {
  assert.ok(TOPE_NO_CRITICOS <= 3, "el techo debe dejar sockets libres para lo crítico");
  assert.ok(PLAZO_CATALOGO_MS < 20000, "el plazo del navegador debe ser más corto que el del servidor (20 s)");
  assert.ok(PLAZO_CATALOGO_MS > 2800, "y más largo que el latido, para no competir con él");
});
await prueba("el texto del plazo se puede mostrar tal cual", () => {
  assert.match(TEXTO_SIN_RESPUESTA, /no respondi/);
});

process.stdout.write("\n\u2550\u2550\u2550 presupuestoConn: " + ok + " correctas \u00b7 " + fallos.length + " fallidas \u2550\u2550\u2550\n");
if (fallos.length) { process.stdout.write("\nFALLOS:\n"); for (const f of fallos) process.stdout.write("  \u00b7 " + f + "\n"); process.exit(1); }

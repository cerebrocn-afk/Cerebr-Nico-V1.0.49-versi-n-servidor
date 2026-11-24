/**
 * tests/catalogoSinFusibles.test.ts — LISTAR MODELOS NO ES GENERAR (v1.0.37)
 * ======================================================================
 * LA QUEJA (Mario, 20/11): «puse la clave de un modelo pago y ni cargaron los
 * modelos». En v1.0.9 la misma clave, en la misma máquina, listaba bien.
 *
 * LO QUE SE MIDIÓ
 * ---------------
 * El catálogo viaja por `fetchCloud`, el guardián de la GENERACIÓN, y ese
 * guardián cobra peaje antes de gastar un byte: `puedeLlamar(anfitrión)` (la
 * espera que declaró el proveedor) y `guardiaDeCuarentena(modelo)` (el fusible
 * de fallos, 15 min y 30 al reincidir). Y cobra peaje también al volver: un
 * fallo del listado abría cuarentena del ANFITRIÓN, y un 429 del listado
 * bloqueaba al anfitrión durante toda la espera declarada.
 *
 * Resultado concreto: el primer `/models` que tarda o falla deja al proveedor
 * en pausa; el reintento del usuario —que es exactamente lo que hace cuando
 * «no cargan»— se come el aviso de cuarentena sin tocar la red; y así hasta
 * media hora. v1.0.9 no tenía fusibles en ese camino, y por eso cargaba.
 *
 * LO QUE ESTA VALLA EXIGE (comportamiento, no texto)
 * --------------------------------------------------
 * 1. Dos catálogos fallidos seguidos: los DOS llegan a la red y NINGUNO abre
 *    cuarentena ni suma fallo al anfitrión.
 * 2. Un 429 en la lista NO deja al anfitrión en espera para generar.
 * 3. La generación sigue protegida como siempre (el fusible no se aflojó: sin
 *    la marca de catálogo, el mismo fallo SÍ abre cuarentena).
 * 4. El plazo del catálogo sigue en pie (no se arregló desactivando el techo).
 * 5. El navegador espera MÁS que el servidor, para que el catálogo estático
 *    con su motivo llegue antes de que la interfaz se rinda.
 *
 * `npx tsx tests/catalogoSinFusibles.test.ts`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { fetchCloud } from "../server/fetchCloud";
import { enCuarentena, fallosRecientes, reiniciarCuarentenasParaPruebas } from "../src/engine/fusibleProveedores";
import { puedeLlamar, reiniciarCuotasParaPruebas } from "../src/engine/cuotaProveedor";

let ok = 0;
const fallos: string[] = [];
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e: any) {
    fallos.push(`${nombre} → ${e?.message || e}`);
    console.log(`  ✗ ${nombre} — ${e?.message || e}`);
  }
}

const leer = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/** Respuesta mínima: el catálogo sólo mira `status` y devuelve el objeto tal cual. */
function respuesta(status: number, cabeceras: Record<string, string> = {}, cuerpo: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => cabeceras[k.toLowerCase()] ?? null },
    json: async () => cuerpo,
    text: async () => JSON.stringify(cuerpo),
  } as any;
}

const ANFITRION = "api.proveedor-de-prueba.test";
const URL_CATALOGO = `https://${ANFITRION}/models`;

// ════════════════════════════════════════════════════════════════════════
console.log("\n── 1. El catálogo que falla no envenena al anfitrión ──");

await prueba("★ dos catálogos caídos seguidos: los DOS llegan a la red (no hay cerrojo)", async () => {
  reiniciarCuarentenasParaPruebas();
  reiniciarCuotasParaPruebas();
  const original = (globalThis as any).fetch;
  let llamadas = 0;
  (globalThis as any).fetch = async () => {
    llamadas++;
    throw new Error("getaddrinfo ENOTFOUND " + ANFITRION);
  };
  try {
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        () => fetchCloud(URL_CATALOGO, {}, { plazoMs: 3000, catalogo: true }),
        (e: any) => !/cuarentena/i.test(String(e?.message || e)),
        "el reintento se comió la cuarentena en vez de salir a la red",
      );
    }
    assert.equal(llamadas, 2, `salió a la red ${llamadas} de 2 veces: el reintento quedó bloqueado`);
  } finally {
    (globalThis as any).fetch = original;
  }
  assert.equal(enCuarentena(ANFITRION), null, "un listado fallido abrió cuarentena del anfitrión");
  assert.equal(fallosRecientes(ANFITRION), 0, "un listado fallido sumó fallo al anfitrión");
});

await prueba("★ el fusible siguió siendo fusible: sin la marca de catálogo, el mismo fallo SÍ abre cuarentena", async () => {
  reiniciarCuarentenasParaPruebas();
  reiniciarCuotasParaPruebas();
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => {
    throw new Error("getaddrinfo ENOTFOUND " + ANFITRION);
  };
  try {
    await assert.rejects(() => fetchCloud(URL_CATALOGO, { method: "POST", body: JSON.stringify({ model: "m-prueba" }) }, { plazoMs: 3000 }));
  } finally {
    (globalThis as any).fetch = original;
  }
  assert.notEqual(enCuarentena("m-prueba"), null, "la generación perdió su fusible: aflojar el catálogo no puede aflojar el chat");
  reiniciarCuarentenasParaPruebas();
});

// ════════════════════════════════════════════════════════════════════════
console.log("\n── 2. Un 429 en la lista no deja al proveedor en pausa ──");

await prueba("★ catálogo 429 → el chat con ese proveedor sigue permitido", async () => {
  reiniciarCuarentenasParaPruebas();
  reiniciarCuotasParaPruebas();
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => respuesta(429, { "retry-after": "600" });
  try {
    const r = await fetchCloud(URL_CATALOGO, {}, { plazoMs: 3000, catalogo: true });
    assert.equal(r.status, 429, "el catálogo debe devolver la respuesta real, no tragársela");
  } finally {
    (globalThis as any).fetch = original;
  }
  const estado = puedeLlamar(ANFITRION, Date.now());
  assert.equal(estado.permitido, true, "un 429 del listado bloqueó la generación del anfitrión entero");
});

await prueba("…y la cuota sigue midiéndose en la generación (no se desactivó el aviso)", async () => {
  reiniciarCuotasParaPruebas();
  reiniciarCuarentenasParaPruebas();
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => respuesta(429, { "retry-after": "600" });
  try {
    await fetchCloud(URL_CATALOGO, { method: "POST", body: JSON.stringify({ model: "m-cuota" }) }, { plazoMs: 3000 });
  } finally {
    (globalThis as any).fetch = original;
  }
  assert.equal(puedeLlamar(ANFITRION, Date.now()).permitido, false, "la generación dejó de respetar el retry-after del proveedor");
  reiniciarCuotasParaPruebas();
});

// ════════════════════════════════════════════════════════════════════════
console.log("\n── 3. El techo del catálogo sigue en pie ──");

await prueba("★ un catálogo colgado corta con su plazo y NO abre cuarentena", async () => {
  reiniciarCuarentenasParaPruebas();
  reiniciarCuotasParaPruebas();
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = (_u: string, init: any) =>
    new Promise((_res, rej) => {
      init?.signal?.addEventListener?.("abort", () => {
        const e: any = new Error("aborted");
        e.name = "AbortError";
        rej(e);
      });
    });
  const t0 = Date.now();
  try {
    await assert.rejects(() => fetchCloud(URL_CATALOGO, {}, { plazoMs: 250, catalogo: true }), /PRIMER BYTE/);
  } finally {
    (globalThis as any).fetch = original;
  }
  const gastado = Date.now() - t0;
  assert.ok(gastado < 3000, `el catálogo colgado tardó ${gastado} ms en cortar`);
  assert.equal(enCuarentena(ANFITRION), null, "el vencimiento de un listado abrió cuarentena");
});

// ════════════════════════════════════════════════════════════════════════
console.log("\n── 4. El cable: ningún catálogo queda sin la marca ──");

const modelos = leer("server/routers/modelos.ts");
const nube = leer("server/fetchCloud.ts");
const presupuesto = leer("src/engine/presupuestoConn.ts");

await prueba("★ los 5 catálogos del router llevan `catalogo: true`", () => {
  const llamadas = modelos.split("fetchCloud(").slice(1);
  assert.ok(llamadas.length >= 5, `se esperaban los catálogos de siempre, hay ${llamadas.length}`);
  const sinMarca = llamadas.filter((t) => {
    const fin = t.indexOf(");");
    const args = fin >= 0 ? t.slice(0, fin) : t;
    return !/catalogo: true/.test(args);
  });
  assert.equal(sinMarca.length, 0, `${sinMarca.length} de ${llamadas.length} catálogo(s) siguen pasando por los fusibles de la generación`);
});

await prueba("el guardián acepta la marca y la respeta en las cuatro puertas", () => {
  assert.match(nube, /catalogo\?: boolean;/, "la opción no está declarada");
  assert.match(nube, /if \(!esCatalogo\) \{\s*\/\/ v1\.87\.0 · antes de gastar un byte/, "puedeLlamar no está detrás de la marca");
  assert.match(nube, /if \(!esCatalogo\) guardiaDeCuarentena\(modelo\)/, "la cuarentena no está detrás de la marca");
  assert.match(nube, /if \(!esCatalogo\) registrarFalloProveedor\(modelo, fallo\)/, "el vencimiento no está detrás de la marca");
  assert.match(nube, /if \(!esCatalogo\) \{\s*\/\/ v1\.87\.0 · y acá se guarda lo que el proveedor dijo sobre su cuota/, "la cuota no está detrás de la marca");
});

await prueba("★ el navegador espera MÁS que el servidor: el motivo llega antes de rendirse", () => {
  const srv = Number(modelos.match(/const PLAZO_CATALOGO_MS = (\d+);/)![1]);
  const nav = Number(presupuesto.match(/export const PLAZO_CATALOGO_MS = (\d+);/)![1]);
  assert.ok(nav > srv, `navegador ${nav} ms vs servidor ${srv} ms: la interfaz se rinde antes del catálogo estático`);
  assert.ok(nav < 20000, `navegador ${nav} ms: demasiado, el usuario cree que no carga`);
});

console.log(`\n═══ catalogoSinFusibles: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}

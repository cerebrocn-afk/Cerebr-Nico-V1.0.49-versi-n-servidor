/**
 * tests/catalogoNoCuelga.test.ts — UN CATÁLOGO NO PUEDE TENER EL PLAZO DE UNA GENERACIÓN (v2.1.6)
 * ============================================================================================
 * EL SÍNTOMA (captura de Mario, 02/11 12:05)
 * -----------------------------------------
 * La cabecera decía «servidor local caído» y la espina «no contesta el SERVIDOR
 * LOCAL (:3000 /api/coreo)», mientras el log del arranque mostraba TODO cargado:
 * servidor escuchando en :3000, puente :5000 listo, packs 7 + 32 + 20
 * herramientas, 44 modelos. El servidor estaba sano: la pantalla no podía
 * alcanzarlo.
 *
 * LA CADENA, PIEZA POR PIEZA
 * --------------------------
 * 1. `Redetectar` lanzaba DOCE sondeos en paralelo (`Promise.allSettled`) al
 *    mismo origen :3000.
 * 2. El navegador abre 6 conexiones por origen: seis en vuelo, seis en cola.
 * 3. Cada sondeo de catálogo pasaba por `fetchCloud`, cuyo techo es el de
 *    PRIMER BYTE de una generación: **120 s**. Una lista de modelos no tarda
 *    120 s: o contesta en segundos o está muerta.
 * 4. Con las seis conexiones ocupadas, `/api/coreo` —que caduca a los 2,8 s—
 *    no conseguía ni un socket. De ahí el «caído» con el servidor perfecto.
 * 5. Y el botón no volvía nunca: `allSettled` espera a los doce.
 *
 * LO QUE ESTA VALLA EXIGE
 * -----------------------
 * Que ningún catálogo use el plazo de generación, que el techo propio nunca
 * ALARGUE el de la casa, y que la redetección no vuelva a saturar el origen.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

const leer = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const modelos = leer("server/routers/modelos.ts");
const nube = leer("server/fetchCloud.ts");
const app = leer("src/App.tsx");

console.log("\n── 1. El techo de un catálogo ──");

prueba("★ todos los catálogos piden su propio plazo (ninguno queda con 120 s)", () => {
  // v1.0.35 · La cuenta era global (`plazoMs:` en todo el archivo contra el
  // número de llamadas) y por eso contaba de más: el `plazoMs` que v1.0.34 le
  // pasa a `diagnosticoCatalogo` para poder decir «sin respuesta en X s» no es
  // una llamada de catálogo. Se mide donde importa — dentro de los argumentos
  // de CADA `fetchCloud(` — y se sigue exigiendo que ninguno quede sin plazo.
  const llamadas = modelos.split("fetchCloud(").slice(1);
  assert.ok(llamadas.length >= 4, `se esperaban los catálogos de siempre, hay ${llamadas.length}: la prueba dejó de mirar lo que cree`);
  const sinPlazo = llamadas.filter((t) => {
    const fin = t.indexOf(");");
    const args = fin >= 0 ? t.slice(0, fin) : t;
    return !/plazoMs: PLAZO_CATALOGO_MS/.test(args);
  });
  assert.equal(
    sinPlazo.length,
    0,
    `${sinPlazo.length} de ${llamadas.length} catálogo(s) siguen con el techo de generación (120 s)`,
  );
});

prueba("el plazo del catálogo es corto de verdad (≤ 10 s)", () => {
  const m = modelos.match(/const PLAZO_CATALOGO_MS = (\d+);/);
  assert.ok(m, "no está declarado PLAZO_CATALOGO_MS");
  const ms = Number(m![1]);
  assert.ok(ms > 0 && ms <= 10000, `PLAZO_CATALOGO_MS = ${ms} ms`);
});

prueba("★ el plazo propio NUNCA alarga el de la casa (sólo puede bajar)", () => {
  assert.match(
    nube,
    /Math\.min\(opciones\.plazoMs, Math\.max\(CLOUD_FIRST_BYTE_TIMEOUT_MS, presupuesto\.ms\)\)/,
    "sin Math.min, un catálogo podría pedir MÁS que el techo de generación",
  );
});

prueba("sin opciones, el comportamiento de siempre queda intacto", () => {
  assert.match(nube, /opciones: OpcionesFetchCloud = \{\}/, "la firma cambió: los llamadores de generación se rompen");
  assert.match(nube, /\? Math\.min\(/, "el plazo propio tiene que ser opcional");
});

console.log("\n── 2. Que la redetección no vuelva a saturar el origen ──");

prueba("★ la redetección ya no lanza los doce de una", () => {
  const m = app.match(/const enParalelo = (\d+);/);
  assert.ok(m, "no hay tope de concurrencia en redetectAllModels");
  const n = Number(m![1]);
  assert.ok(n >= 1 && n <= 4, `enParalelo = ${n}: el navegador sólo abre 6 conexiones por origen`);
});

prueba("★ hay un techo total: el botón se libera aunque un sondeo se atore", () => {
  assert.match(app, /Promise\.race\(\[/, "sin Promise.race, allSettled espera al que no contesta");
  assert.match(app, /setTimeout\(listo, 20000\)/, "falta el techo total de 20 s");
});

prueba("lo que no contesta se dice con nombre (no un «detectando» mudo)", () => {
  assert.match(app, /sinRespuesta\.push\(/, "los fallos no se acumulan para informarlos");
  assert.match(app, /Redetección con avisos/, "no hay aviso de cierre con lo que faltó");
});

console.log("\n── 3. El latido sigue siendo el que decide «caído» ──");

prueba("el latido caduca antes de que el usuario note el ahogo (< 5 s)", () => {
  const lat = leer("src/engine/latido.ts");
  const m = lat.match(/export const PLAZO_LATIDO_MS = INTERVALO_LATIDO_MS \* CADUCIA_LATIDO;/);
  assert.ok(m, "el plazo del latido dejó de derivarse de sus constantes");
  const int = Number(lat.match(/INTERVALO_LATIDO_MS = (\d+)/)![1]);
  const cad = Number(lat.match(/CADUCIA_LATIDO = (\d+)/)![1]);
  assert.ok(int * cad < 5000, `caduca a ${int * cad} ms`);
});

console.log(`\n═══ catalogoNoCuelga: ${ok} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:");
  for (const f of fallos) console.log(" ·", f);
  process.exit(1);
}

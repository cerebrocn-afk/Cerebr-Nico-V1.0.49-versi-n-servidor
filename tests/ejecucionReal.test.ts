/**
 * ejecucionReal.test.ts — SUITE DEL CICLO REAL (instalar→construir→probar→previsualizar)
 * =================================================================================
 * PASO 3 de la HOJA DE RUTA v1.54. Se ejecuta con tsx (como el resto del motor).
 * Comprueba la LÓGICA PURA del ciclo con un LANZADOR SIMULADO — sin spawnear nada:
 *   1. detectarGestor / comandoDeGestor / esTestPlaceholder,
 *   2. derivarOrdenes LEE el package.json real (no inventa scripts; omite lo que falta),
 *   3. ejecutarCiclo encadena, CORTA en la primera fase bloqueante, OMITE el resto,
 *      respeta las no bloqueantes y trata preview como SERVIDOR VIVO,
 *   4. helpers puros (recortarSalida, silencio, listo).
 * La capa con SO (lanzadorReal/ejecutarCicloReal/detenerServidores) NO se ejercita
 * aquí a propósito: queda SIN VERIFICAR en el entorno dev (sin red/node_modules/
 * proyecto real) y debe correrla Mario en su máquina.
 *
 * Registrar en scripts/validar.mjs como:
 *   { id: "ejecucionReal", archivo: "tests/ejecucionReal.test.ts", que: "v1.53.7 · ..." }
 */
import assert from "node:assert";
import {
  detectarGestor, comandoDeGestor, esTestPlaceholder, derivarOrdenes,
  ejecutarCiclo, recortarSalida, debeAbortarPorSilencio, debeDeclararListo,
  LIMITES, LISTO_POR_DEFECTO,
} from "../src/engine/ejecucionReal";
import type { OrdenFase, ResultadoFase, LanzadorFase, Fase } from "../src/engine/ejecucionReal";

let pasadas = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); pasadas++; }
const J = (x: unknown) => JSON.stringify(x);

// Lanzador SIMULADO: scripteo el código de salida por fase; servidor → viva/fallo.
type Plan = Partial<Record<Fase, { codigo?: number; falla?: boolean; salida?: string }>>;
const sim = (plan: Plan): LanzadorFase => async (orden: OrdenFase): Promise<ResultadoFase> => {
  const p = plan[orden.fase] || { codigo: 0 };
  if (orden.servidor) {
    if (p.falla) return { fase: orden.fase, cmd: orden.cmd, codigo: null, ok: false, estado: "fallo", salida: p.salida || "", ms: 5, motivo: "sim: servidor no arrancó" };
    return { fase: orden.fase, cmd: orden.cmd, codigo: null, ok: true, estado: "viva", salida: p.salida || "ready", ms: 5, motivo: "sim: viva" };
  }
  const code = typeof p.codigo === "number" ? p.codigo : 0;
  const bien = code === 0;
  return { fase: orden.fase, cmd: orden.cmd, codigo: code, ok: bien, estado: bien ? "ok" : "fallo", salida: p.salida || "", ms: 5 };
};
const fasesDe = (r: { fases: ResultadoFase[] }) => r.fases.map((f) => `${f.fase}:${f.estado}`);

// ── 1. GESTOR ──
ok(detectarGestor(["package-lock.json"]) === "npm", "npm por defecto");
ok(detectarGestor(["pnpm-lock.yaml"]) === "pnpm", "pnpm");
ok(detectarGestor(["yarn.lock"]) === "yarn", "yarn");
ok(detectarGestor(["bun.lockb"]) === "bun", "bun");
ok(detectarGestor([]) === "npm", "vacío → npm");
ok(detectarGestor(["package-lock.json", "pnpm-lock.yaml"]) === "pnpm", "pnpm gana a package-lock");

// ── 2. COMANDO DE GESTOR ──
ok(J(comandoDeGestor("npm", "instalar")) === J({ cmd: "npm", args: ["install"] }), "npm install");
ok(J(comandoDeGestor("pnpm", "script", "build")) === J({ cmd: "pnpm", args: ["run", "build"] }), "pnpm run build");
ok(J(comandoDeGestor("yarn", "script", "build")) === J({ cmd: "yarn", args: ["build"] }), "yarn build (sin run)");
ok(J(comandoDeGestor("npm", "script", "test")) === J({ cmd: "npm", args: ["test"] }), "npm test");
ok(J(comandoDeGestor("bun", "script", "dev")) === J({ cmd: "bun", args: ["run", "dev"] }), "bun run dev");

// ── 3. TEST PLACEHOLDER (honestidad: el test vacío de npm init NO cuenta) ──
ok(esTestPlaceholder('echo "Error: no test specified" && exit 1') === true, "placeholder npm init");
ok(esTestPlaceholder("vitest run") === false, "test real");
ok(esTestPlaceholder(undefined) === false, "no-string");

// ── 4. DERIVAR ÓRDENES: proyecto completo ──
{
  const o = derivarOrdenes({ scripts: { build: "vite build", test: "vitest run", preview: "vite preview" } }, { gestor: "npm" });
  ok(J(o.map((x) => x.fase)) === J(["instalar", "construir", "probar", "previsualizar"]), "4 fases en orden");
  ok(J(o[2].args) === J(["test"]), "probar = npm test");
  ok(o[3].servidor === true && o[3].listoCuando instanceof RegExp, "preview es servidor con listoCuando");
}
// test placeholder → se OMITE; preview cae a 'start'
{
  const o = derivarOrdenes({ scripts: { build: "tsc", test: 'echo "Error: no test specified" && exit 1', start: "node s.js" } }, { gestor: "npm" });
  ok(!o.some((x) => x.fase === "probar"), "sin probar (placeholder)");
  const prev = o.find((x) => x.fase === "previsualizar");
  ok(!!prev && J(prev.args) === J(["run", "start"]), "preview usa start");
}
// sin scripts → sólo instalar
ok(J(derivarOrdenes({}, { gestor: "npm" }).map((x) => x.fase)) === J(["instalar"]), "sólo instalar");
// saltar + incluirPreview:false + preview por 'dev'
{
  const pkg = { scripts: { build: "vite build", dev: "vite" } };
  const o1 = derivarOrdenes(pkg, { gestor: "pnpm", saltar: ["instalar"] });
  ok(!o1.some((x) => x.fase === "instalar"), "saltar instalar");
  ok(J(o1.find((x) => x.fase === "previsualizar")!.args) === J(["run", "dev"]), "preview cae a dev");
  const o2 = derivarOrdenes(pkg, { gestor: "npm", incluirPreview: false });
  ok(!o2.some((x) => x.fase === "previsualizar"), "incluirPreview:false quita preview");
}

// ── 5. EJECUTAR CICLO (lanzador simulado) ──
async function ciclos() {
  const pkg = { scripts: { build: "b", test: "vitest", preview: "p" } };
  // todo OK → preview VIVA, sin aborto
  {
    const r = await ejecutarCiclo(derivarOrdenes(pkg, { gestor: "npm" }), sim({}));
    ok(r.ok === true, "ciclo ok");
    ok(J(fasesDe(r)) === J(["instalar:ok", "construir:ok", "probar:ok", "previsualizar:viva"]), "fases ok+viva");
    ok(r.abortadaEn === undefined, "sin abortadaEn");
  }
  // install falla → corta, el resto OMITIDO (no fingido)
  {
    const r = await ejecutarCiclo(derivarOrdenes(pkg, { gestor: "npm" }), sim({ instalar: { codigo: 1 } }));
    ok(r.ok === false && r.abortadaEn === "instalar", "corta en instalar");
    ok(J(fasesDe(r)) === J(["instalar:fallo", "construir:omitida", "probar:omitida", "previsualizar:omitida"]), "resto omitido");
  }
  // build falla (install ok) → corta en construir
  {
    const r = await ejecutarCiclo(derivarOrdenes(pkg, { gestor: "npm" }), sim({ construir: { codigo: 2 } }));
    ok(r.abortadaEn === "construir" && r.fases[0].estado === "ok", "corta en construir, install ok");
    ok(r.fases[2].estado === "omitida" && r.fases[3].estado === "omitida", "test+preview omitidos");
  }
  // test NO bloqueante → falla pero sigue a preview
  {
    const r = await ejecutarCiclo(derivarOrdenes(pkg, { gestor: "npm", continuarSiFalla: ["probar"] }), sim({ probar: { codigo: 1 } }));
    ok(r.abortadaEn === undefined && r.ok === true, "no bloqueante no corta");
    ok(J(fasesDe(r)) === J(["instalar:ok", "construir:ok", "probar:fallo", "previsualizar:viva"]), "test falló pero preview viva");
    ok(/no bloqueantes/.test(r.resumen), "el resumen confiesa el fallo no bloqueante");
  }
  // el servidor no arranca → fallo en previsualizar
  {
    const r = await ejecutarCiclo(derivarOrdenes({ scripts: { preview: "p" } }, { gestor: "npm" }), sim({ previsualizar: { falla: true } }));
    ok(r.abortadaEn === "previsualizar" && r.ok === false, "servidor que no arranca corta");
  }
}

// ── 6. HELPERS PUROS ──
ok(recortarSalida("", "x".repeat(10), 4).startsWith("…[salida anterior truncada]…"), "recortarSalida marca el truncado");
ok(recortarSalida("", "ABCDE", 3).endsWith("CDE"), "recortarSalida conserva la cola");
ok(recortarSalida("ab", "cd", 100) === "abcd", "recortarSalida concatena cuando cabe");
ok(debeAbortarPorSilencio(0, LIMITES.SILENCIO_MS, LIMITES.SILENCIO_MS) === true, "silencio: en el umbral aborta");
ok(debeAbortarPorSilencio(0, LIMITES.SILENCIO_MS - 1, LIMITES.SILENCIO_MS) === false, "silencio: por debajo no aborta");
ok(debeDeclararListo("  Local:   http://localhost:5173/") === true, "listo: detecta localhost");
ok(debeDeclararListo("compilando módulos...") === false, "listo: ruido no dispara");
ok(debeDeclararListo("VITE v5  ready in 320 ms", LISTO_POR_DEFECTO) === true, "listo: 'ready in' dispara");

ciclos().then(() => {
  console.log(`\u2705 ejecucionReal: ${pasadas} comprobaciones OK`);
}).catch((e) => {
  console.error("\u274c ejecucionReal FALLÓ:", e);
  process.exit(1);
});

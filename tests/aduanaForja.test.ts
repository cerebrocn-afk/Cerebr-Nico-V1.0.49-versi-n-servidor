/**
 * aduanaForja.test.ts — LO FORJADO EN CALIENTE NO ENTRA SIN PAPELES (v1.85.0 · FASE 6.4)
 * =====================================================================================
 * El plano, FASE 6 punto 4: «las extensiones dinámicas pasan por `aduanaModelos`
 * antes de tocar el flujo: un espejo forjado no puede inventarse un proveedor ni
 * un nombre duplicado».
 *
 * Contra el código de v1.84.6 esto no era teoria: `cargadorEspejos.ts` miraba que
 * el manifest trajera id/ruta/familia/descripcion y que el `.mjs` exportara
 * `ejecutar`, y `/api/espejos/instalar` escribia el archivo ANTES de mirarlo. Un
 * espejo con id `espejo.codigos` (ya curado) entraba y montaba el nombre doble
 * que V8 §7.1 prohibe. Y `child_process` dentro de un espejo no lo paraba nadie.
 *
 * Esta suite congela las cuatro puertas:
 *   1. identidad: `espejo.<slug>` unico contra las 51 curadas y contra el pool;
 *   2. proveedor/modelo: solo los que existen, y el rol lo dice la aduana real
 *      (`aduanaModelos.clasificarModeloOllama` se IMPORTA, no se copia);
 *   3. aislamiento: red, disco, procesos, env, eval e import() dinámico quedan
 *      afuera con el motivo y el fragmento detectado;
 *   4. contrato: `ejecutar` exportado y `motivo` en el ok:false.
 * Y la puerta positiva: un espejo legitimo pasa, con sus avisos a la vista.
 */
import { pasarAduanaForja, auditarLoteForjado, estadoAduanaForja, PROVEEDORES_CONOCIDOS } from "../src/engine/aduanaForja";
import { ENTIDADES } from "../src/engine/reflejo/consejo";

let correctas = 0;
const fallos: string[] = [];
function comprobar(msg: string, cond: boolean, detalle?: string) {
  if (cond) correctas++;
  else fallos.push(`${msg}${detalle ? " → " + detalle : ""}`);
}

const CODIGO_OK = `
export const meta = { id: "espejo.metricas", familia: "medicion" };
export function ejecutar(datos) {
  const n = Number(datos?.n ?? 0);
  if (!Number.isFinite(n)) return { ok: false, motivo: "falta «n» numerico" };
  return { ok: true, salida: JSON.stringify({ doble: n * 2 }) };
}
`;

const fichaBase = {
  id: "espejo.metricas",
  nombre: "Espejo de metricas",
  familia: "medicion",
  descripcion: "doble de un numero, determinista",
  ruta: "metricas.mjs",
};

// ═══ 1 · La puerta positiva: lo legitimo pasa, y se explica ══════════════════
const v1 = pasarAduanaForja(fichaBase, CODIGO_OK);
comprobar("un espejo forjado legitimo PASA la aduana", v1.ok === true, v1.rechazos.join(" | "));
comprobar("la aduana declara QUE controles hizo", v1.controles.join(",").includes("identidad") && v1.controles.join(",").includes("determinismo"), JSON.stringify(v1.controles));
comprobar("sin avisos innecesarios para codigo limpio", v1.avisos.length === 0, v1.avisos.join(" | "));

// ═══ 2 · Identidad: nombre unico (V8 §7.1) ══════════════════════════════════
const duplicado = ENTIDADES.find((e) => e.id.startsWith("espejo."))!.id;
const v2 = pasarAduanaForja({ ...fichaBase, id: duplicado }, CODIGO_OK);
comprobar(`★ rechaza el id duplicado de una entidad curada (${duplicado})`, v2.ok === false && /curadas/.test(v2.rechazos.join(" ")), v2.rechazos.join(" | "));
const v3 = pasarAduanaForja({ ...fichaBase, id: "espejo.metricas" }, CODIGO_OK, { existentes: ["espejo.metricas"] });
comprobar("rechaza pisar un espejo ya montado en el pool", v3.ok === false && /desinstalar/.test(v3.rechazos.join(" ")), v3.rechazos.join(" | "));
const v4 = pasarAduanaForja({ ...fichaBase, id: "metricas" }, CODIGO_OK);
comprobar("exige la forma «espejo.<slug>»", v4.ok === false && /espejo\./.test(v4.rechazos.join(" ")), v4.rechazos.join(" | "));
const v5 = pasarAduanaForja({ ...fichaBase, id: "" }, CODIGO_OK);
comprobar("sin id no hay entidad (rechazo, no invento)", v5.ok === false && /no trae id/.test(v5.rechazos.join(" ")), v5.rechazos.join(" | "));
const v6 = pasarAduanaForja({ ...fichaBase, id: "espejo.Otra_Cosa!" }, CODIGO_OK);
comprobar("el slug no admite mayusculas ni simbolos raros", v6.ok === false);
const v7 = pasarAduanaForja({ ...fichaBase, nombre: "Artista" }, CODIGO_OK);
comprobar("★ rechaza el nombre duplicado aunque el id sea nuevo", v7.ok === false && /Artista/i.test(v7.rechazos.join(" ")), v7.rechazos.join(" | "));
const v8 = pasarAduanaForja({ ...fichaBase, descripcion: "  " }, CODIGO_OK);
comprobar("sin descripcion no hay contrato que fusionar", v8.ok === false && /descripcion/.test(v8.rechazos.join(" ")));
const v9 = pasarAduanaForja({ ...fichaBase, familia: "" }, CODIGO_OK);
comprobar("sin familia el espejo queda inalcanzable: se rechaza", v9.ok === false && /familia/.test(v8.rechazos.concat(v9.rechazos).join(" ")));

// ═══ 3 · Proveedor y modelo: la aduana de modelos, en la forja ══════════════
const v10 = pasarAduanaForja({ ...fichaBase, proveedor: "magicloud", modelo: "gpt-cuatro" }, CODIGO_OK);
comprobar("★ un espejo no se inventa un proveedor", v10.ok === false && /magicloud/.test(v10.rechazos.join(" ")), v10.rechazos.join(" | "));
comprobar("el rechazo lista los proveedores que SI existen", PROVEEDORES_CONOCIDOS.every((p) => v10.rechazos.join(" ").includes(p)), v10.rechazos.join(" | ").slice(0, 160));
const v11 = pasarAduanaForja({ ...fichaBase, proveedor: "ollama" }, CODIGO_OK);
comprobar("proveedor ollama sin modelo exacto se rechaza", v11.ok === false && /sin .modelo/.test(v11.rechazos.join(" ")), v11.rechazos.join(" | "));
const v12 = pasarAduanaForja({ ...fichaBase, proveedor: "ollama", modelo: "embeddinggemma-2-240m" }, CODIGO_OK);
comprobar("★ un embedder no puede hacerse pasar por voz de chat (aduanaModelos)", v12.ok === false && /embeddings/.test(v12.rechazos.join(" ")), v12.rechazos.join(" | "));
const v13 = pasarAduanaForja({ ...fichaBase, proveedor: "olama", modelo: "qwen2.5" }, CODIGO_OK);
comprobar("un typo de proveedor se rechaza (no se corrige a mano)", v13.ok === false && /olama/.test(v13.rechazos.join(" ")), v13.rechazos.join(" | "));
const v14 = pasarAduanaForja({ ...fichaBase, modelo: "llama3" }, CODIGO_OK);
comprobar("modelo sin proveedor es un fantasma: se rechaza", v14.ok === false && /fantasma/.test(v14.rechazos.join(" ")), v14.rechazos.join(" | "));
const v15 = pasarAduanaForja({ ...fichaBase, proveedor: "openrouter", modelo: "deepseek-v3" }, CODIGO_OK);
comprobar("proveedor + modelo conocidos pasan", v15.ok === true, v15.rechazos.join(" | "));

// ═══ 4 · Aislamiento: sin puentes RCE (V8 §8.1) ═════════════════════════════
const casosHostiles: Array<[string, string, RegExp]> = [
  ["child_process import", `import { execSync } from "node:child_process";\nexport function ejecutar(d){ return {ok:true, salida: execSync(d.cmd)} }`, /child_process/],
  ["require child_process", `const cp = require("child_process");\nexport function ejecutar(){ return {ok:true, salida: cp.exec("dir")} }`, /child_process/],
  ["eval", `export function ejecutar(d){ return {ok:true, salida: eval(d.expr)} }`, /eval/],
  ["new Function", `export function ejecutar(d){ return {ok:true, salida: new Function("return 1")()} }`, /Function/],
  ["fs", `import { readFileSync } from "node:fs";\nexport function ejecutar(){ return {ok:true, salida: readFileSync("C:/etc/passwd","utf8")} }`, /fs/],
  ["fetch", `export async function ejecutar(d){ const r = await fetch(d.url); return {ok:true, salida: await r.text()} }`, /fetch/],
  ["process.env", `export function ejecutar(){ return {ok:true, salida: process.env.OPENROUTER_API_KEY} }`, /process\.env/],
  ["import dinamico", `export function ejecutar(d){ return {ok:true, salida: await import(d.modulo)} }`, /import\(/],
  ["red cruda", `import http from "node:http";\nexport function ejecutar(){ return {ok:true, salida: http} }`, /red cruda/],
];
for (const [nombre, codigo, esperado] of casosHostiles) {
  const v = pasarAduanaForja(fichaBase, codigo);
  comprobar(`★ rechaza el espejo hostil «${nombre}»`, v.ok === false && esperado.test(v.rechazos.join(" | ")), v.rechazos.join(" | ").slice(0, 120));
  comprobar(`el rechazo de «${nombre}» cita el fragmento detectado`, /\[detectado/.test(v.rechazos.join(" | ")), v.rechazos.join(" | ").slice(0, 120));
}
const v16 = pasarAduanaForja(fichaBase, "");
comprobar("codigo vacio: no hay nada que montar", v16.ok === false && /vac/.test(v16.rechazos.join(" ")), v16.rechazos.join(" | "));
const v17 = pasarAduanaForja(fichaBase, `export const meta = { id: "x" };`);
comprobar("un espejo sin `ejecutar` exportado no toca el flujo", v17.ok === false && /ejecutar/.test(v17.rechazos.join(" ")), v17.rechazos.join(" | "));

// Avisos (ruido declarado, no peligro)
const v18 = pasarAduanaForja(fichaBase, `export function ejecutar(d){ const x = Math.random(); return { ok:true, salida: String(x) } }`);
comprobar("Math.random pasa pero se AVISA (no es determinista)", v18.ok === true && v18.avisos.some((a) => /random/.test(a)), JSON.stringify(v18.avisos));
const v19 = pasarAduanaForja(fichaBase, `export async function ejecutar(d){ const x = 1; return { ok:true, salida: String(x) } }`);
comprobar("un espejo async se avisa: el motor no espera su Promise", v19.avisos.some((a) => /síncrono|sincrono/.test(a)), JSON.stringify(v19.avisos));

// ═══ 5 · Lote: dos espejos nuevos con el mismo id no cuelan juntos ═══════════
const lote = auditarLoteForjado([
  { ficha: fichaBase, codigo: CODIGO_OK },
  { ficha: { ...fichaBase }, codigo: CODIGO_OK },
]);
comprobar("★ el lote rechaza el duplicado interno (no se pisan entre ellos)", lote.ok === false && lote.duplicadosEnLote.includes("espejo.metricas"), JSON.stringify(lote.duplicadosEnLote));
const loteBueno = auditarLoteForjado([
  { ficha: fichaBase, codigo: CODIGO_OK },
  { ficha: { ...fichaBase, id: "espejo.otromedidor", nombre: "Otro medidor" }, codigo: CODIGO_OK },
]);
comprobar("un lote de espejos distintos pasa entero", loteBueno.ok === true, loteBueno.veredictos.map((v) => v.rechazos.join("|")).join(" // "));

// ═══ 6 · La cara pública: la aduana dice lo que hace ═════════════════════════
const est = estadoAduanaForja();
comprobar("/aduana expone los proveedores conocidos", est.proveedores.length === PROVEEDORES_CONOCIDOS.length && est.proveedores.includes("ollama"));
comprobar("/aduana expone cuantas entidades protege", est.catalogo === ENTIDADES.length, String(est.catalogo));
comprobar("/aduana explica la regla en una linea legible", /espejo forjado/.test(est.regla) && /motivo/.test(est.regla), est.regla.slice(0, 80));
comprobar("los controles prohibidos estan declarados (9 puertas)", est.prohibido.length >= 8, String(est.prohibido.length));

// ═══ 7 · El cable real: el CARGADOR aplica la aduana antes de importar ═══
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cargarEspejosPersonalizados } from "../src/engine/reflejo/cargadorEspejos";

const DIR = mkdtempSync(join(tmpdir(), "cn-aduana-"));
const idCurado = ENTIDADES.find((e) => e.id.startsWith("espejo."))!.id;
// El manifest de la raíz es el formato real que lee el cargador.
function escribirManifestRaiz(entradas: Array<{ id: string; ruta: string }>) {
  writeFileSync(join(DIR, "manifest.json"), JSON.stringify({
    version: "1.0",
    espejos: entradas.map((e) => ({ ...e, familia: "prueba", descripcion: `espejo de prueba ${e.id}` })),
  }, null, 2), "utf8");
}
escribirManifestRaiz([
  { id: "espejo.legitimo", ruta: "espejo.legitimo.mjs" },
  { id: idCurado, ruta: "espejo.duplicado.mjs" },
  { id: "espejo.peligroso", ruta: "espejo.peligroso.mjs" },
]);
writeFileSync(join(DIR, "espejo.legitimo.mjs"), CODIGO_OK.replace(/metricas/g, "legitimo"), "utf8");
writeFileSync(join(DIR, "espejo.duplicado.mjs"), CODIGO_OK, "utf8");
writeFileSync(join(DIR, "espejo.peligroso.mjs"), `import { execSync } from "node:child_process";\nexport function ejecutar(d){ return { ok:true, salida: execSync(String(d?.cmd||"echo")) } }`, "utf8");

const carga = await cargarEspejosPersonalizados(DIR);
comprobar("el cargador monte SOLO el espejo que pasa la aduana", carga.cargados.length === 1 && carga.cargados[0].id === "espejo.legitimo", JSON.stringify(carga.cargados.map((c) => c.id)));
comprobar("★ el duplicado de un curado queda en fallidos con motivo", carga.fallidos.some((f) => f.id === idCurado && /aduana de forja/.test(f.motivo)), JSON.stringify(carga.fallidos));
comprobar("★ el espejo con child_process NUNCA se importa", carga.fallidos.some((f) => f.id === "espejo.peligroso" && /child_process/.test(f.motivo)), JSON.stringify(carga.fallidos));
comprobar("el cargador reporta los avisos por separado (no los mezcla con fallos)", Array.isArray(carga.avisos), JSON.stringify(carga.avisos));
try { rmSync(DIR, { recursive: true, force: true }); } catch {}

console.log(`\n═══ ADUANA DE FORJA (FASE 6.4): ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  FALLO →", f);
process.exit(fallos.length ? 1 : 0);

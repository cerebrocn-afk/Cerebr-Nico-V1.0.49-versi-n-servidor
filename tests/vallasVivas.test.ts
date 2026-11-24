/**
 * vallasVivas.test.ts — v1.57.15 · LAS VALLAS TIENEN QUE PODER FALLAR
 * ====================================================================
 * LA ENFERMEDAD. `guard.test.ts` cuenta en su propio encabezado cómo el guardián
 * de escritura filtraba `issue.severity`, un campo que `SyntaxIssue` NO tiene:
 * devolvía lista vacía siempre y «la protección se ejecutaba y no protegía». El
 * panel Pro llegó más lejos: cinco diales que se guardaban y nadie leía, con 144
 * suites verdes. En los dos casos el problema no fue falta de verificación, sino
 * verificaciones INCAPACES de ponerse rojas.
 *
 * ESTA SUITE es la regla hecha comprobación, sobre las tres vallas nuevas:
 *   1. todo auditador de reguladores se prueba SEMBRANDO un dial mudo y exigiendo
 *      que lo nombre (y que no rompa con lectura opcional `?.`, que daría falso
 *      positivo y enseñaría a ignorarlo);
 *   2. el comparador de empaque se prueba PERDIENDO un archivo a propósito y
 *      exigiendo que lo cace — más la regla exacta que causó el bug de 1.57.14
 *      (`proj/vendor/.../dist` viaja, `proj/dist` no);
 *   3. las escrituras crudas del monolito quedan en RATCHET: el techo se declara
 *      con el número medido hoy (36) y solo se permite bajarlo. Un techo que sube
 *      sin discusión es exactamente cómo se normaliza el desastre.
 *   4. y la valla de la valla: cada suite nueva de esta tanda tiene que contener
 *      un defecto sembrado. Sin esa comprobación, "100% verde" puede significar
 *      "nadie miró".
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditar, clavesDelPanel } from "../scripts/audita-reguladores.mjs";
import { autoprueba, debeViajar, comparar, crc32 } from "../scripts/verificar-empaque.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (n: string, c: unknown, d?: string) => { if (c) correctas++; else fallos.push(n + (d ? " :: " + d : "")); };
const seccion = (t: string) => console.log("\n" + t + "\n");

// ════════════════════════════════════════════════════════════════════════════
seccion("1 · Auditador de reguladores: extracción y MUTACIÓN sembrada");
const panelReal = leer("src/components/ProConfigPanel.tsx");
const claves = clavesDelPanel(panelReal);
comprobar("lee las claves del panel real (65 en 1.57.14)", claves.length >= 60, `=${claves.length}`);
comprobar("no duplica clave/grupo", new Set(claves.map((k: any) => k.ruta)).size === claves.length);
comprobar("todas tienen forma settings.grupo.clave", claves.every((k: any) => /^settings\.[a-zA-Z]+\.[a-zA-Z][\w]*$/.test(k.ruta)));

// DEFECTO SEMBRADO: un panel con un dial que ningún fuente lee.
const PANEL_SEMBRADO = `
  <Row label="Dial vivo"><Num onChange={(v) => up("ai", { topP: v })} /></Row>
  <Row label="Dial mudo"><Num onChange={(v) => up("ai", { dialFantasma: v })} /></Row>`;
const sinSemaforo = auditar({
  panelTexto: PANEL_SEMBRADO,
  storeTexto: "export const proSettings = { ai: { topP: 0.9, dialFantasma: 1 } };",
  archivos: ["src/engine/x.ts"] as any,
  textos: { "src/engine/x.ts": "const t = settings.ai.topP; payload = { topP: t };" } as any,
});
comprobar("MUTACIÓN: encuentra el dial sembrado", sinSemaforo.mudos.length === 1, `mudos=${sinSemaforo.mudos.map((m: any) => m.ruta)}`);
comprobar("lo nombra con la ruta completa", sinSemaforo.mudos[0]?.ruta === "settings.ai.dialFantasma");
comprobar("el dial que sí tiene lector NO se marca", !sinSemaforo.mudos.some((m: any) => m.ruta.endsWith("topP")));

// FALSO POSITIVO: lectura con encadenado opcional (así se lee en App.tsx real).
const conOpcional = auditar({
  panelTexto: `up("wallpaper", { moduleOpacity: v })`,
  storeTexto: "const defaults = { wallpaper: { moduleOpacity: 0.55 } };",
  archivos: ["src/App.tsx"] as any,
  textos: { "src/App.tsx": "const v = (proSettings as any)?.wallpaper?.moduleOpacity;" } as any,
});
comprobar("no da falso positivo con `?.` (el error que se corrigió hoy)", conOpcional.mudos.length === 0, JSON.stringify(conOpcional.mudos));

// El INVARIANTE del repo: hoy no hay ningún dial mudo.
const reales = auditar({});
comprobar("repositorio real: CERO reguladores mudos", reales.mudos.length === 0, reales.mudos.map((m: any) => m.ruta).join(","));
comprobar("y revisó las 65 claves, no un puñado", reales.revisadas >= 60, `=${reales.revisadas}`);

// ════════════════════════════════════════════════════════════════════════════
seccion("2 · Comparador de empaque: la regla que causó el bug de 1.57.14");
const auto = autoprueba();
comprobar("todas las auto-pruebas pasan", auto.every((r: any) => r[1]), auto.filter((r: any) => !r[1]).map((r: any) => r[0]).join("|"));
comprobar("son 9 reglas, no 2", auto.length === 9, `=${auto.length}`);
comprobar("`proj/dist` (build de raíz) se excluye", debeViajar("proj/dist/index.js") === false);
comprobar("`vendor/.../dist` VIAJA — el bug que comió el SDK", debeViajar("proj/vendor/hindsight-agent-sdk/dist/index.js") === true);
comprobar("`extensions/.../dist` viaja", debeViajar("proj/extensions/x/dist/y.js") === true);
comprobar("node_modules de raíz se excluye", debeViajar("proj/node_modules/react/index.js") === false);
comprobar("el .pyc es transitorio, no perdido", debeViajar("proj/__pycache__/a.cpython-312.pyc") === false);
comprobar("el log de una corrida es transitorio", debeViajar("proj/.vigilante/roto.log") === false);

// DEFECTO SEMBRADO: desaparece un archivo real => TIENE que romper.
const ref = [
  { nombre: "proj/server.ts", crc: 111, esDirectorio: false },
  { nombre: "proj/vendor/hindsight-agent-sdk/dist/index.js", crc: 222, esDirectorio: false },
  { nombre: "proj/a/__pycache__/z.pyc", crc: 333, esDirectorio: false },
];
const perdido = comparar(ref, [{ nombre: "proj/server.ts", crc: 111, esDirectorio: false }]);
comprobar("MUTACIÓN: detecta el SDK perdido", perdido.faltantes.length === 1 && /vendor/.test(perdido.faltantes[0]), JSON.stringify(perdido.faltantes));
comprobar("lo marca como CRÍTICO", perdido.faltantesCriticos.length === 1);
comprobar("no confunde transitorios con pérdidas", !perdido.faltantes.some((f: string) => f.includes("__pycache__")));
const intacto = comparar(ref, ref);
comprobar("con todo presente, no rompe", intacto.faltantes.length === 0);
const mutado = comparar(ref, [
  { nombre: "proj/server.ts", crc: 999, esDirectorio: false },
  { nombre: "proj/vendor/hindsight-agent-sdk/dist/index.js", crc: 222, esDirectorio: false },
  { nombre: "proj/a/__pycache__/z.pyc", crc: 333, esDirectorio: false },
]);
comprobar("avisa cuando un contenido cambió", mutado.cambian === 1);

seccion("3 · crc32: sin dependencias, comparando de verdad");
comprobar("crc32('hola') es estable", crc32(Buffer.from("hola")) === crc32(Buffer.from("hola")));
comprobar("distingue un byte de diferencia", crc32(Buffer.from("hola")) !== crc32(Buffer.from("hola1")));
comprobar("el vacío tiene su propio valor", typeof crc32(Buffer.alloc(0)) === "number");
comprobar("coincide con el valor estándar (\"123456789\" → 0xCBF43926)", crc32(Buffer.from("123456789")) === 0xcbf43926, crc32(Buffer.from("123456789")).toString(16));

// ════════════════════════════════════════════════════════════════════════════
seccion("4 · RATCHET de escrituras crudas en el monolito");
const srv = leer("server.ts");
const crudas = (srv.match(/writeFileSync\(/g) || []).length + (srv.match(/promises\.writeFile/g) || []).length + (srv.match(/appendFileSync\(/g) || []).length;
const TECHO_DECLARADO = 36; // 33 writeFileSync + 2 promises.writeFile + 1 appendFileSync, medidos v1.57.15
comprobar(`las escrituras crudas no suben de ${TECHO_DECLARADO}`, crudas <= TECHO_DECLARADO, `hay ${crudas}`);
comprobar("el techo coincide con lo medido (no es un número anywhere)", crudas === TECHO_DECLARADO, `=${crudas}`);
comprobar("server.ts respeta el trinquete de líneas", srv.split("\n").length - 1 <= JSON.parse(leer("contrato-rutas.json")).presupuesto_lineas); // v1.57.17 · fuente única: el contrato, no un número duplicado
for (const puro of ["src/engine/ouroboros.ts", "src/engine/parcheRango.ts", "src/engine/techoContexto.ts"]) {
  const t = leer(puro);
  comprobar(`${path.basename(puro)} no escribe en disco (es criterio)`, !/writeFileSync|promises\.writeFile/.test(t));
}

seccion("5 · La valla de la valla: toda suite nueva tiene que poder fallar");
const nuevas = ["tests/vallasVivas.test.ts", "tests/parcheRango.test.ts", "tests/techoContexto.test.ts", "tests/ouroboros.test.ts", "tests/packDocumentos.test.ts"];
for (const f of nuevas) {
  const t = leer(f);
  comprobar(`${path.basename(f)} tiene defecto sembrado o entrada hostil`, /MUTACI[NÓ]N|sembrad|hostil|inv[áa]lido|rechaza/i.test(t), f);
  const n = (t.match(/\bcomprobar\(/g) || []).length;
  comprobar(`${path.basename(f)} comprueba algo concreto (>= 15)`, n >= 15, `${n} comprobaciones`);
}
comprobar("los scripts de valla no se auto-validan con 'return true'", !/return true;?\s*$/m.test(leer("scripts/audita-reguladores.mjs")));
comprobar("el auditor no tiene allowlist silenciosa de mudos", !/MUDOS_PERMITIDOS|allowlist/i.test(leer("scripts/audita-reguladores.mjs")));

console.log(`\n═══ VALLAS VIVAS: ${correctas} correctas · ${fallos.length} fallidas ═══`);
for (const f of fallos) console.log("  · " + f);
if (fallos.length) process.exit(1);

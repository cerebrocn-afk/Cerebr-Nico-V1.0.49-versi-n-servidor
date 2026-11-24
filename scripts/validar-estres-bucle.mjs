/**
 * validar-estres-bucle.mjs — EL FISCAL DE LA PRUEBA DE ESTRÉS DEL BUCLE
 * ====================================================================
 * Corre la sección 9 (prueba de estrés) de `tests/bucleAutonomo.test.ts` y dice,
 * sin que haya que leer la salida a mano, si el juez del bucle aguanta carga sin
 * contradecirse. No reemplaza a `npm run validar` (que corre TODAS las suites):
 * es el enfoque quirúrgico para cuando se toca el motor del bucle y se quiere ver
 * SOLO el estrés, con sus invariantes nombradas una por una.
 *
 *     npm run validar:estres
 *
 * Por qué existe: una prueba de estrés mezclada entre otras 70 vallas se vuelve
 * invisible. Si alguien afloja una invariante bajo carga, aquí sale con nombre.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

const VERDE = "\x1b[32m";
const ROJO = "\x1b[31m";
const GRIS = "\x1b[90m";
const AMARILLO = "\x1b[33m";
const FIN = "\x1b[0m";

/** Las invariantes que la prueba de estrés DEBE sostener. El texto es un trozo
 *  estable de la etiqueta impresa por cada `comprobar(...)` de la sección 9. */
const INVARIANTES = [
  { clave: "sin una sola excepci\u00f3n",            que: "4000 decisiones sin que el juez explote nunca" },
  { clave: "escalera de reparaci\u00f3n",            que: "la fase CREAR jam\u00e1s se contradice con escalera de reparaci\u00f3n" },
  { clave: "declara su FASE DEL TURNO",             que: "toda continuaci\u00f3n declara su fase" },
  { clave: "dentro de [BASE, TOPE]",                que: "el techo de pasos nunca se sale de la frontera dura" },
  { clave: "la carga se resuelve r\u00e1pido",        que: "4000 iteraciones por debajo del presupuesto de tiempo" },
  { clave: "se BLOQUEA (no se cuelga)",             que: "el mismo error repetido termina en bloqueo honesto, no en bucle" },
];

/** Localiza el CLI de tsx sin depender de `npx`. */
function cliDeTsx() {
  const candidatos = [
    path.join(RAIZ, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(RAIZ, "node_modules", ".bin", "tsx"),
  ];
  return candidatos.find((c) => existsSync(c)) || null;
}

function limpiar(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const SUITE = "tests/bucleAutonomo.test.ts";

console.log(`${GRIS}─── PRUEBA DE ESTRÉS DEL BUCLE ───${FIN}`);

if (!existsSync(path.join(RAIZ, SUITE))) {
  console.log(`${ROJO}✗ No encuentro ${SUITE} — ¿se movi\u00f3 o renombr\u00f3?${FIN}`);
  process.exit(1);
}

const tsx = cliDeTsx();
if (!tsx) {
  console.log(`${AMARILLO}⚠ tsx no est\u00e1 instalado. Corre \`npm install\` y vuelve a intentar.${FIN}`);
  process.exit(1);
}

const r = spawnSync(process.execPath, [tsx, path.join(RAIZ, SUITE)], {
  cwd: RAIZ,
  encoding: "utf-8",
  env: { ...process.env, FORCE_COLOR: "1" },
});
const salida = limpiar(`${r.stdout || ""}\n${r.stderr || ""}`);
const code = r.status === null ? 1 : r.status;

/** Aisla el bloque de la secci\u00f3n 9 para no confundirlo con otras vallas. */
const desde = salida.indexOf("9 · Prueba de estr\u00e9s");
const bloque = desde === -1 ? salida : salida.slice(desde);

/** El tiempo real medido por la propia prueba (para informarlo). */
const ms = (bloque.match(/\((\d+) ms para/) || [])[1];

let rojos = 0;
for (const inv of INVARIANTES) {
  const verde = new RegExp(`✓[^\\n]*${inv.clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(bloque);
  const roja = new RegExp(`✗[^\\n]*${inv.clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(bloque);
  if (verde && !roja) {
    console.log(`  ${VERDE}✓${FIN} ${inv.que}`);
  } else if (roja) {
    console.log(`  ${ROJO}✗${FIN} ${inv.que} ${GRIS}(la prueba la marc\u00f3 en rojo)${FIN}`);
    rojos++;
  } else {
    console.log(`  ${ROJO}✗${FIN} ${inv.que} ${GRIS}(no apareci\u00f3 en la salida — ¿se quit\u00f3 la secci\u00f3n 9?)${FIN}`);
    rojos++;
  }
}

console.log(`${GRIS}${"─".repeat(56)}${FIN}`);
if (rojos === 0 && code === 0) {
  console.log(`${VERDE}✓ ESTRÉS EN VERDE${FIN} — ${INVARIANTES.length} invariantes sostenidas` + (ms ? ` (${ms} ms la carga de 4000)` : ""));
  process.exit(0);
}
console.log(`${ROJO}✗ ESTRÉS EN ROJO${FIN} — ${rojos} invariante(s) sin verde y la suite sali\u00f3 con c\u00f3digo ${code}.`);
console.log(`${GRIS}Pista: corre \`npx tsx ${SUITE}\` para ver el detalle completo.${FIN}`);
process.exit(1);

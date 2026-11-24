/**
 * tests/autoLlamadoTransporte.test.ts — EL LAZO SE AUTO-INVOCA (v2.3.8)
 * ====================================================================
 * Se ejecuta con:  npx tsx tests/autoLlamadoTransporte.test.ts
 *
 * `autoLlamado.test.ts` prueba el criterio y `autoLlamadoLibro.test.ts` prueba el
 * libro. Esta prueba lo que faltaba para que el "seguí" exista: **que alguien los
 * consulte al cerrar el turno**, y que la trampa del parte no se trague el lazo.
 */
import {
  decidirAutoLlamado, trabajoPendiente, TOPE_AUTO_LLAMADOS,
} from "../src/engine/autoLlamado";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (p) => (existsSync(path.join(RAIZ, p)) ? readFileSync(path.join(RAIZ, p), "utf-8") : "");

let correctas = 0;
const fallos = [];
const c = (que, ok, detalle) => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

const PENDIENTE = "**Trabajo pendiente:**\n- escribir la valla del transporte\n- embalar la version\n";
const NINGUNO = "**Trabajo pendiente:** NINGUNO\n";
const base = { activado: true, plan: [], llamadosHechos: 0, sellosPrevios: [], turnoFallo: false, conclusion: "liste una parte" };

console.log("\n1) La fuente de trabajo: el parte del turno, leido por el server\n");
c("hay trabajo cuando el parte nombra tareas", trabajoPendiente([], PENDIENTE).items.length === 2);
c("\u2605 la trampa vallada: `Trabajo pendiente: NINGUNO` NO es una tarea",
  trabajoPendiente([], NINGUNO).items.length === 0);
c("y ese caso produce `callar`, no una re-entrada para no hacer nada",
  decidirAutoLlamado({ ...base, reanudar: NINGUNO }).accion === "callar");
c("con trabajo real y el lazo prendido, la accion es `llamar` con mensaje",
  decidirAutoLlamado({ ...base, reanudar: PENDIENTE }).accion === "llamar");

console.log("\n2) Las tres fronteras siguen mandando sobre el transporte\n");
c("voluntad: apagado = callar y decir por que",
  decidirAutoLlamado({ ...base, activado: false, reanudar: PENDIENTE }).accion === "callar");
c("costo: en el tope se agota y se rinde con informe, no se sigue",
  decidirAutoLlamado({ ...base, reanudar: PENDIENTE, llamadosHechos: TOPE_AUTO_LLAMADOS }).accion === "agotar");
c("estancamiento: la misma huella que el llamado anterior corta el lazo",
  (() => {
    const uno = decidirAutoLlamado({ ...base, reanudar: PENDIENTE });
    const dos = decidirAutoLlamado({ ...base, reanudar: PENDIENTE, sellosPrevios: [uno.sello], llamadosHechos: 1 });
    return dos.accion !== "llamar";
  })());
c("el turno que cerro mal no lo re-entra el lazo: esa palabra la tiene la escalera",
  decidirAutoLlamado({ ...base, reanudar: PENDIENTE, turnoFallo: true }).accion === "callar");

console.log("\n3) El cable existe y es de un solo dueño\n");
const router = leer("server/routers/autoLlamado.ts");
const srv = leer("server.ts");
const app = leer("src/App.tsx");
c("el router existe y declara sus cuatro rutas", /export const RUTAS_AUTO_LLAMADO/.test(router) && (router.match(/api\/autoLlamado/g) || []).length >= 4);
c("\u2605 esta montado en el server (antes: cero llamantes medidos)", /registrarAutoLlamado\(app, \{ raizDatos: PROJECT_ROOT \}\)/.test(srv));
c("el libro vive en el asiento derecho, no en la instalacion", /\.cerebronico.*autoLlamado\.json|path\.join\(raizDatos, "\.cerebronico"/.test(router));
c("el cliente reporta el cierre y OBEDECE: encola en la cola visible",
  /api\/autoLlamado\/cierre/.test(app) && /setMessageQueue\(\(q\) => \[\.\.\.q, \{ text: texto/.test(app));
c("\u2605 el lazo no puede tumbar el turno: el fallo se traga en silencio", /\.catch\(\(\) => \{\}\);\n          \}/.test(app));
c("el navegador no decide: no manda plan ni conclusion inventada", !/accion === "llamar"[\s\S]{0,80}setMessageQueue\(q =>/.test(app));
c("la fuente de trabajo la lee el server, no el cliente", /reanudar: textoReanudar\(\)/.test(router) && !/reanudar:/.test(app));
c("la suite esta registrada en la valla maestra", leer("scripts/validar.mjs").includes("autoLlamadoTransporte.test.ts"));

console.log("\n" + "\u2500".repeat(56));
console.log(`AUTO-LLAMADO · TRANSPORTE (v2.3.8): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { for (const f of fallos) console.log("  FALLO \u2192 " + f); process.exit(1); }

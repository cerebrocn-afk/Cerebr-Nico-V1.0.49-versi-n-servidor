// _f18-emitir.cjs — emite el .cjs REAL como lo hace server.ts (evaluando la
// plantilla) y comprueba que ese archivo compila. Es la prueba de verdad: el
// texto crudo del fuente lleva los escapes de la plantilla, el emitido no.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.resolve(__dirname, "..");
const F = path.join(APP, "server", "sandboxEstatico.ts");
const src = fs.readFileSync(F, "utf8");

// Extraer el cuerpo de la plantilla y EVALUARLO como template literal, que es
// exactamente lo que hace TypeScript al compilar: los \\ pasan a \.
const ini = src.indexOf("export const STATIC_SERVER_SOURCE = `");
const cuerpo = src.slice(ini + "export const STATIC_SERVER_SOURCE = `".length);
const fin = cuerpo.lastIndexOf("`;");
const plantilla = cuerpo.slice(0, fin);

let emitido;
try {
  // Se evalúa como template literal: resuelve \\ -> \ y \` -> `
  emitido = vm.runInNewContext("`" + plantilla + "`", {});
} catch (e) {
  console.log("FALLO al evaluar la plantilla:", e.message);
  process.exit(1);
}

console.log("emitido:", emitido.length, "chars");

let ok = 0, fallos = 0;
function chk(n, c, x) {
  if (c) { ok++; console.log("OK   " + n + (x ? " :: " + x : "")); }
  else { fallos++; console.log("FALLA " + n + (x ? " :: " + x : "")); }
}

// El .cjs emitido debe compilar
let compila = true, err = "";
try { new vm.Script(emitido, { filename: "cn-static-server.cjs" }); }
catch (e) { compila = false; err = e.message; }
chk("el .cjs EMITIDO compila", compila, err);

// Y debe tener el proxy
chk("proxy en el emitido", emitido.includes("/api/conciencia"));
chk("proxy reenvia al IDE", emitido.includes("cnPuertoIde"));
chk("conserva __cn_info", emitido.includes("/__cn_info"));
chk("conserva CN_SW_KILL", emitido.includes("CN_SW_KILL"));
chk("conserva server.listen", emitido.includes("server.listen"));

// Escribirlo a disco para inspección y prueba real
const destino = path.join(APP, ".cn-static-server.cjs");
fs.writeFileSync(destino, emitido, "utf8");
chk("escrito a disco", fs.existsSync(destino), destino + " (" + fs.statSync(destino).size + " bytes)");

console.log("---");
console.log(fallos === 0 ? "VEREDICTO: " + ok + "/" + ok + " OK" : "VEREDICTO: " + fallos + " FALLAS de " + (ok + fallos));
process.exit(fallos === 0 ? 0 : 1);

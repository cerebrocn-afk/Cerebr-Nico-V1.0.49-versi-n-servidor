// _f18-verif.cjs — verifica que la plantilla emite un .cjs válido y que el
// proxy /api/conciencia quedó dentro del texto emitido (no solo en el fuente).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.resolve(__dirname, "..");
const F = path.join(APP, "server", "sandboxEstatico.ts");
const src = fs.readFileSync(F, "utf8");

let ok = 0, fallos = 0;
function chk(nombre, cond, extra) {
  if (cond) { ok++; console.log("OK   " + nombre + (extra ? " :: " + extra : "")); }
  else { fallos++; console.log("FALLA " + nombre + (extra ? " :: " + extra : "")); }
}

// 1) El fuente TS declara la plantilla
chk("plantilla exportada", /export const STATIC_SERVER_SOURCE\s*=\s*`/.test(src));

// 2) Extraer el texto emitido: entre el backtick de apertura y el de cierre final
const ini = src.indexOf("export const STATIC_SERVER_SOURCE = `");
const cuerpo = src.slice(ini + "export const STATIC_SERVER_SOURCE = `".length);
const fin = cuerpo.lastIndexOf("`;");
const emitido = cuerpo.slice(0, fin);

chk("texto emitido extraido", emitido.length > 5000, emitido.length + " chars");

// 3) El proxy está DENTRO del texto emitido
chk("proxy en el texto emitido", emitido.includes("/api/conciencia"));
chk("proxy reenvia al IDE", emitido.includes("cnPuertoIde"));
chk("proxy nombra el 503", emitido.includes("503"));
chk("proxy nombra el 504", emitido.includes("504"));
chk("cabecera X-CN-Proxy", emitido.includes("X-CN-Proxy"));

// 4) El texto emitido es JavaScript válido (se compila, no se ejecuta)
let compila = true, errCompila = "";
try {
  new vm.Script(emitido, { filename: "cn-static-server.cjs" });
} catch (e) {
  compila = false;
  errCompila = e.message;
}
chk("el .cjs emitido COMPILA", compila, errCompila);

// 5) No se perdió nada de lo que ya estaba
chk("conserva __cn_info", emitido.includes("/__cn_info"));
chk("conserva CN_SW_KILL", emitido.includes("CN_SW_KILL"));
chk("conserva raizEfectiva", emitido.includes("raizEfectiva"));
chk("conserva paginaDiagnostico", emitido.includes("paginaDiagnostico"));
chk("conserva resuelveFaltante", emitido.includes("resuelveFaltante"));
chk("conserva respondeSPA", emitido.includes("respondeSPA"));
chk("conserva respondeSinArchivo", emitido.includes("respondeSinArchivo"));
chk("conserva server.listen", emitido.includes("server.listen"));

// 6) El proxy va ANTES del bloque del service worker (orden de rutas)
const posProxy = emitido.indexOf("/api/conciencia");
const posSw = emitido.indexOf("urlPath === \"/sw.js\"");
chk("proxy antes del sw.js", posProxy > 0 && posSw > 0 && posProxy < posSw,
  "proxy@" + posProxy + " sw@" + posSw);

console.log("---");
console.log((fallos === 0 ? "VEREDICTO: " + ok + "/" + ok + " OK" : "VEREDICTO: " + fallos + " FALLAS de " + (ok + fallos)));
process.exit(fallos === 0 ? 0 : 1);

// _f18-verif-final.cjs — verificación completa de F18 (7.1b).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP = path.resolve(__dirname, "..");
let ok = 0, fallos = 0;
const chk = (n, c, x) => {
  if (c) { ok++; console.log("OK   " + n + (x ? " :: " + x : "")); }
  else { fallos++; console.log("FALLA " + n + (x ? " :: " + x : "")); }
};

// 1) La plantilla tiene el proxy
const F = path.join(APP, "server", "sandboxEstatico.ts");
const src = fs.readFileSync(F, "utf8");
chk("plantilla: proxy /api/conciencia", src.includes("/api/conciencia"));
chk("plantilla: reenvia al IDE", src.includes("cnPuertoIde"));
chk("plantilla: 5o argumento", src.includes("process.argv[5]"));

// 2) El .cjs emitido compila
const ini = src.indexOf("export const STATIC_SERVER_SOURCE = `");
const cuerpo = src.slice(ini + "export const STATIC_SERVER_SOURCE = `".length);
const fin = cuerpo.lastIndexOf("`;");
let emitido = "";
try {
  emitido = vm.runInNewContext("`" + cuerpo.slice(0, fin) + "`", {});
} catch (e) {
  chk("emitir plantilla", false, e.message);
}
let compila = true, err = "";
try { new vm.Script(emitido, { filename: "cn-static-server.cjs" }); }
catch (e) { compila = false; err = e.message; }
chk("el .cjs emitido compila", compila, err);
chk("emitido: proxy presente", emitido.includes("/api/conciencia"));
chk("emitido: conserva __cn_info", emitido.includes("/__cn_info"));
chk("emitido: conserva CN_SW_KILL", emitido.includes("CN_SW_KILL"));
chk("emitido: conserva server.listen", emitido.includes("server.listen"));

// 3) server.ts pasa el puerto del IDE
const S = fs.readFileSync(path.join(APP, "server.ts"), "utf8");
chk("server.ts: pasa String(PORT)", /staticScript, raizProyecto, String\(SANDBOX_PORT\), PROJECT_ROOT, String\(PORT\)/.test(S));
chk("server.ts: trinquete 12210", S.split("\n").length === 12210, S.split("\n").length + " lineas");

// 4) Versión
const C = fs.readFileSync(path.join(APP, "src", "constants.ts"), "utf8");
const m = C.match(/VERSION_SEMVER\s*=\s*"([^"]+)"/);
chk("version en constants", !!m, m && m[1]);

console.log("---");
console.log(fallos === 0 ? "VEREDICTO: " + ok + "/" + ok + " OK" : "VEREDICTO: " + fallos + " FALLAS de " + (ok + fallos));
process.exit(fallos === 0 ? 0 : 1);

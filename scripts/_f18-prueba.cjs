// _f18-prueba.cjs — prueba REAL del proxy: levanta el .cjs emitido en un puerto
// libre y le pide /api/conciencia. Sin IDE arriba debe dar 503 con causa
// nombrada (no una lista vacia disfrazada de exito).
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const APP = path.resolve(__dirname, "..");
const SERVER = path.join(APP, ".cn-static-server.cjs");
const PUERTO = 3599;
const PUERTO_IDE_FALSO = 3598;

function pedir(puerto, ruta, metodo) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port: puerto, path: ruta, method: metodo || "GET", timeout: 8000 },
      (res) => {
        let d = "";
        res.on("data", (t) => (d += t));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      }
    );
    req.on("error", (e) => resolve({ status: 0, error: e.code || String(e) }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    req.end();
  });
}

(async () => {
  let ok = 0, fallos = 0;
  const chk = (n, c, x) => {
    if (c) { ok++; console.log("OK   " + n + (x ? " :: " + x : "")); }
    else { fallos++; console.log("FALLA " + n + (x ? " :: " + x : "")); }
  };

  // --- Caso A: IDE APAGADO (puerto 3598 sin nada) -> 503 con causa
  const hijo = spawn(process.execPath, [SERVER, APP, String(PUERTO), APP, String(PUERTO_IDE_FALSO)], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let salida = "";
  hijo.stdout.on("data", (t) => (salida += t));
  hijo.stderr.on("data", (t) => (salida += t));

  // esperar a que escuche
  let arriba = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const r = await pedir(PUERTO, "/__cn_info");
    if (r.status === 200) { arriba = true; break; }
  }
  chk("el server estatico arranca", arriba, salida.trim().split("\n")[0] || "");

  if (arriba) {
    const r = await pedir(PUERTO, "/api/conciencia");
    chk("IDE apagado -> 503", r.status === 503, "status=" + r.status);
    let j = null;
    try { j = JSON.parse(r.body); } catch (e) {}
    chk("503 trae JSON parseable", !!j);
    chk("503 dice ok:false", j && j.ok === false);
    chk("503 NOMBRA la causa", j && typeof j.error === "string" && j.error.length > 10, j && j.error);
    chk("503 dice el puerto del IDE", j && j.puerto === PUERTO_IDE_FALSO, j && String(j.puerto));
    chk("503 trae pista", j && typeof j.pista === "string" && j.pista.length > 10);

    // --- Caso B: IDE FALSO arriba -> el proxy reenvia y devuelve lo del IDE
    const ideFalso = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, eco: req.url, metodo: req.method, quien: "ide-falso" }));
    });
    await new Promise((r) => ideFalso.listen(PUERTO_IDE_FALSO, "127.0.0.1", r));

    const r2 = await pedir(PUERTO, "/api/conciencia?tema=prueba");
    chk("IDE arriba -> 200", r2.status === 200, "status=" + r2.status);
    let j2 = null;
    try { j2 = JSON.parse(r2.body); } catch (e) {}
    chk("reenvia la respuesta del IDE", j2 && j2.quien === "ide-falso");
    chk("conserva la query", j2 && j2.eco === "/api/conciencia?tema=prueba", j2 && j2.eco);
    chk("cabecera X-CN-Proxy", r2.headers["x-cn-proxy"] === "ide:" + PUERTO_IDE_FALSO,
      r2.headers["x-cn-proxy"]);

    // --- Caso C: una ruta normal sigue sirviendo el sitio
    const r3 = await pedir(PUERTO, "/__cn_info");
    chk("las rutas normales siguen vivas", r3.status === 200);

    await new Promise((r) => ideFalso.close(r));
  }

  hijo.kill();
  await new Promise((r) => setTimeout(r, 300));
  try { fs.unlinkSync(SERVER); } catch (e) {}

  console.log("---");
  console.log(fallos === 0 ? "VEREDICTO: " + ok + "/" + ok + " OK" : "VEREDICTO: " + fallos + " FALLAS de " + (ok + fallos));
  process.exit(fallos === 0 ? 0 : 1);
})();

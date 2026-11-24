// _f18-proxy.cjs — FASE 18 / 7.1b: el preview :3500 llama a /api/conciencia.
// El server estático es una PLANTILLA de texto que corre con node aislado y no
// puede importar TypeScript. La lógica y la guarda viven en el IDE (:3000), así
// que el preview REENVÍA en vez de duplicar: una sola verdad.
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..");
const F = path.join(APP, "server", "sandboxEstatico.ts");

let s = fs.readFileSync(F, "utf8");

if (s.includes("/api/conciencia")) {
  console.log("YA-ESTA: la plantilla ya tiene /api/conciencia");
  process.exit(0);
}

// Ancla única: el bloque del service worker, que va justo antes de raizEfectiva.
const ANCLA = `  // v1.95.1 · el worker se neutraliza SIEMPRE, exista o no el archivo en disco:`;

if (!s.includes(ANCLA)) {
  console.log("FALLO: no encuentro el ancla del service worker");
  process.exit(1);
}

// El proxy va DENTRO de la plantilla (texto emitido), así que las contrabarras
// y los backticks van escapados para que sobrevivan a la interpolación.
const PROXY = [
  "  // ============================================================",
  "  // v2.3.21 · FASE 18 / 7.1b — EL PREVIEW LLAMA A /api/conciencia",
  "  // ------------------------------------------------------------",
  "  // Hasta hoy la .con-ciencia solo se podia consultar desde el IDE (:3000).",
  "  // El preview (:3500) es otro proceso, con su propio server estatico, y no",
  "  // tenia forma de preguntarle nada: el codigo de concienciaSandbox.ts existia",
  "  // y nadie lo llamaba desde aqui.",
  "  //",
  "  // Se REENVIA al IDE en vez de duplicar la logica: la guarda y el estado",
  "  // viven en un solo sitio (:3000). Duplicarlos serian dos verdades que se",
  "  // separan en cuanto una cambie.",
  "  //",
  "  // Si el IDE no esta arriba, se responde 503 con la causa nombrada: un",
  "  // preview que dice «no pude preguntar» es infinitamente mejor que uno que",
  "  // devuelve una lista vacia y parece que no hay nada que saber.",
  "  // ============================================================",
  "  if (urlPath === \"/api/conciencia\" || urlPath.indexOf(\"/api/conciencia/\") === 0) {",
  "    var cnPuertoIde = Number(process.argv[5] || 3000);",
  "    var cnCuerpo = [];",
  "    req.on(\"data\", function (t) { cnCuerpo.push(t); });",
  "    req.on(\"end\", function () {",
  "      var cnDatos = cnCuerpo.length ? Buffer.concat(cnCuerpo) : null;",
  "      var cnCabeceras = { \"Content-Type\": req.headers[\"content-type\"] || \"application/json\" };",
  "      if (req.headers[\"authorization\"]) cnCabeceras[\"Authorization\"] = req.headers[\"authorization\"];",
  "      if (cnDatos) cnCabeceras[\"Content-Length\"] = cnDatos.length;",
  "      var cnPeticion = http.request({",
  "        host: \"127.0.0.1\",",
  "        port: cnPuertoIde,",
  "        path: req.url,",
  "        method: req.method,",
  "        headers: cnCabeceras,",
  "        timeout: 15000",
  "      }, function (cnResp) {",
  "        res.writeHead(cnResp.statusCode || 502, {",
  "          \"Content-Type\": cnResp.headers[\"content-type\"] || \"application/json; charset=utf-8\",",
  "          \"Cache-Control\": \"no-store\",",
  "          \"X-CN-Proxy\": \"ide:\" + cnPuertoIde",
  "        });",
  "        cnResp.pipe(res);",
  "      });",
  "      cnPeticion.on(\"timeout\", function () {",
  "        cnPeticion.destroy();",
  "        res.writeHead(504, { \"Content-Type\": \"application/json; charset=utf-8\", \"Cache-Control\": \"no-store\" });",
  "        res.end(JSON.stringify({ ok: false, error: \"el IDE no respondio en 15 s\", puerto: cnPuertoIde }));",
  "      });",
  "      cnPeticion.on(\"error\", function (e) {",
  "        res.writeHead(503, { \"Content-Type\": \"application/json; charset=utf-8\", \"Cache-Control\": \"no-store\" });",
  "        res.end(JSON.stringify({",
  "          ok: false,",
  "          error: \"no pude preguntar al IDE: \" + (e && e.code ? e.code : String(e)),",
  "          puerto: cnPuertoIde,",
  "          pista: \"el preview reenvia /api/conciencia al IDE; si el IDE no esta arriba, esto es lo que hay\"",
  "        }));",
  "      });",
  "      if (cnDatos) cnPeticion.write(cnDatos);",
  "      cnPeticion.end();",
  "    });",
  "    return;",
  "  }",
  "",
  ANCLA
].join("\n");

s = s.replace(ANCLA, PROXY);
fs.writeFileSync(F, s, "utf8");

console.log("OK: proxy /api/conciencia insertado en la plantilla");
console.log("lineas ahora:", s.split("\n").length);

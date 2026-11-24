// _f18-cable.cjs — FASE 18 / 7.1b: pasar el puerto del IDE como 5º argumento
// al server estático del sandbox, para que su proxy /api/conciencia sepa a quién
// preguntar. Sin esto el proxy existe pero apunta al 3000 por defecto: funciona,
// pero no respeta un PORT distinto. Una línea, ancla única.
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..");
const F = path.join(APP, "server.ts");

let s = fs.readFileSync(F, "utf8");
const antes = s.split("\n").length;

const ANCLA = `const procEstatico = spawn(process.execPath, [staticScript, raizProyecto, String(SANDBOX_PORT), PROJECT_ROOT], {`;

if (!s.includes(ANCLA)) {
  console.log("FALLO: no encuentro el spawn del server estatico");
  process.exit(1);
}

if (s.includes("String(PORT)]")) {
  console.log("YA-ESTA: el puerto del IDE ya se pasa");
  process.exit(0);
}

const NUEVO = `const procEstatico = spawn(process.execPath, [staticScript, raizProyecto, String(SANDBOX_PORT), PROJECT_ROOT, String(PORT)], {`;

s = s.replace(ANCLA, NUEVO);
fs.writeFileSync(F, s, "utf8");

const despues = s.split("\n").length;
console.log("OK: puerto del IDE pasado al server estatico");
console.log("lineas antes:", antes, "· despues:", despues, "· delta:", despues - antes);

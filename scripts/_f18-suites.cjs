// _f18-suites.cjs — corre las suites con el runner real (tsx).
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const APP = path.resolve(__dirname, "..");
const SUITES = [
  "contextoMedido", "parchesSemilla", "seguidorHilo", "goteo",
  "capasSkills", "auditoriaSkills", "sesionWrite", "censoSuites",
];

let verdes = 0, rojas = 0;
for (const s of SUITES) {
  const f = path.join(APP, "tests", s + ".test.ts");
  if (!fs.existsSync(f)) { console.log("FALTA  " + s + " (no existe el archivo)"); rojas++; continue; }
  const r = spawnSync(process.execPath, [
    path.join(APP, "node_modules", "tsx", "dist", "cli.mjs"), f,
  ], { cwd: APP, encoding: "utf8", timeout: 180000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const ok = r.status === 0;
  const linea = out.split("\n").filter((l) => /OK|VERDE|FALLA|FALLOS|comprobacion/i.test(l)).slice(-1)[0] || "";
  if (ok) { verdes++; console.log("VERDE  " + s + " :: " + linea.trim().slice(0, 90)); }
  else { rojas++; console.log("ROJA   " + s + " :: " + (linea.trim() || out.slice(-200)).slice(0, 160)); }
}
console.log("---");
console.log("VEREDICTO: " + verdes + "/" + SUITES.length + " VERDES" + (rojas ? " · " + rojas + " ROJAS" : ""));
process.exit(rojas === 0 ? 0 : 1);

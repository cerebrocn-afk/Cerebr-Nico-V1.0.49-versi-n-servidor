// _f18-diag.cjs — corre sesionWrite y muestra el error completo.
const { spawnSync } = require("child_process");
const path = require("path");
const APP = path.resolve(__dirname, "..");
const r = spawnSync(process.execPath, [
  path.join(APP, "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(APP, "tests", "sesionWrite.test.ts"),
], { cwd: APP, encoding: "utf8", timeout: 180000 });
console.log("exit:", r.status);
console.log("--- STDOUT ---");
console.log((r.stdout || "").slice(-4000));
console.log("--- STDERR ---");
console.log((r.stderr || "").slice(-2000));

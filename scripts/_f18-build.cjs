// _f18-build.cjs — recompila dist/server.mjs con la API de esbuild.
const path = require("path");
const fs = require("fs");

const APP = path.resolve(__dirname, "..");

(async () => {
  const esbuild = await import("esbuild");
  const t0 = Date.now();
  const r = await esbuild.build({
    entryPoints: [path.join(APP, "server.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: path.join(APP, "dist", "server.mjs"),
    packages: "external",
    logLevel: "error",
    metafile: true,
  });
  const ms = Date.now() - t0;
  const st = fs.statSync(path.join(APP, "dist", "server.mjs"));
  const modulos = Object.keys(r.metafile.inputs).length;
  console.log("OK build:", st.size, "bytes ·", modulos, "modulos ·", ms, "ms");
  const bundle = fs.readFileSync(path.join(APP, "dist", "server.mjs"), "utf8");
  console.log("version en bundle:", /2\.3\.20/.test(bundle) ? "2.3.20" : "NO ENCONTRADA");
  console.log("proxy en bundle:", bundle.includes("/api/conciencia") ? "SI" : "NO");
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });

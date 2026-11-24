/**
 * tests/candadoLockfile.test.ts — EL LOCK NO PUEDE CONTRADECIRSE (v2.3.23)
 * ======================================================================
 * La deuda estaba declarada desde hacía versiones como «`tapable` pinea 2.3.8 con
 * `resolved` inexistente». **Medido con el candado, la declaración era corta:** no era
 * una entrada, son **siete**, y el patrón es el mismo en las siete — alguien subió el
 * campo `version` a mano y dejó la `resolved` y la `integrity` del tarball viejo:
 *
 *   @jridgewell/remapping 2.3.8→2.3.5 · fsevents 2.3.8→2.3.4 · lightningcss 1.33.0→1.32.0
 *   lightningcss-linux-x64-gnu · lightningcss-linux-x64-musl · prismjs 1.33.0→1.30.0 ·
 *   tapable 2.3.8→2.3.4
 *
 * Un lock que se contradice a sí mismo es un `npm install` que no entra en la máquina
 * de otro: 404 buscando la versión declarada, o `integrity checksum mismatch` porque
 * el hash es del tarball viejo. Se repara **bajando `version` a la del tarball**, que
 * es el par que la `integrity` valida; subir la URL dejaría un hash huérfano.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entradasEnConflicto, reparar, versionDeResolved } from "../scripts/candado-lockfile.mjs";

// v1.0.9 — `decodeURIComponent(new URL("..", import.meta.url).pathname)` devolvia
// `/C:/Users/.../app` en Windows y `path.resolve` le anteponia la unidad actual
// -> `C:\C:\Users\...`: el `package-lock.json` real nunca se encontraba (ENOENT)
// y la seccion 2 moria con «package-lock.json existe» en rojo. `fileURLToPath`
// resuelve la ruta nativa correcta en los tres sistemas.
const RAIZ = fileURLToPath(new URL("..", import.meta.url));

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

console.log("\n1) El detector, con un lock inventado que se contradice\n");

{
  c("saca la version del nombre del tarball", versionDeResolved("https://r.npmjs.org/x/-/x-1.22.33.tgz") === "1.22.33");
  c("una URL sin tarball no produce version", versionDeResolved("https://r.npmjs.org/x/-/x-1.0.0.tar.gz") === null);
  const doc: any = {
    packages: {
      "": { name: "p", version: "9.9.9" },
      "node_modules/buena": { version: "1.0.0", resolved: "https://r/buena/-/buena-1.0.0.tgz", integrity: "sha512-AAA" },
      "node_modules/mala": { version: "2.0.0", resolved: "https://r/mala/-/mala-1.9.0.tgz", integrity: "sha512-BBB" },
      "node_modules/sin-url": { version: "3.0.0" },
    },
  };
  const conf = entradasEnConflicto(doc.packages);
  c("\u2605 detecta la entrada que se contradice, y solo esa", conf.length === 1 && conf[0].clave === "node_modules/mala", JSON.stringify(conf));
  c("el conflicto reporta ambas versiones (para el acta)", conf[0]?.declarada === "2.0.0" && conf[0]?.enUrl === "1.9.0");
  const r = reparar(doc);
  c("\u2605 repara BAJANDO version a la del tarball", r.documento.packages["node_modules/mala"].version === "1.9.0");
  c("\u2605 y NO toca la integrity, que es el par que valida el tarball",
    r.documento.packages["node_modules/mala"].integrity === "sha512-BBB");
  c("las sanas quedan intactas", r.documento.packages["node_modules/buena"].version === "1.0.0");
  c("un lock reparado ya no reporta nada (idempotente)", entradasEnConflicto(reparar(r.documento).documento.packages).length === 0);
}

console.log("\n2) El lock del repo: la deuda real, medida\n");

{
  const ruta = path.join(RAIZ, "package-lock.json");
  c("\u2605 package-lock.json existe", existsSync(ruta));
  const j = JSON.parse(readFileSync(ruta, "utf8"));
  const conf = entradasEnConflicto(j.packages);
  c("\u2605 el lock publicado NO se contradice a si mismo", conf.length === 0, conf.map((x: any) => `${x.clave} ${x.declarada}\u2260${x.enUrl}`).join(" | "));
  console.log("     medido: " + Object.keys(j.packages).length + " entradas; antes de v2.3.23 eran 7 las que mentian (tapable, fsevents, prismjs, lightningcss x3, @jridgewell/remapping)");
  c("la version de la app sigue en la raiz y en packages[\u0022\u0022]", typeof j.version === "string" && j.packages[""].version === j.version, j.version);
  c("el lock sigue siendo lockfileVersion 3", j.lockfileVersion === 3);
}

console.log("\n3) Conexi\u00f3n\n");

{
  const validar = readFileSync(path.join(RAIZ, "scripts/validar.mjs"), "utf8");
  const pkg = readFileSync(path.join(RAIZ, "package.json".replace("package.json", "package.json")), "utf8");
  c("\u2605 el candado esta registrado en npm run validar", validar.includes("candadoLockfile.test.ts"));
  c("\u2605 hay comando npm run lock:candado", /"lock:candado"/.test(pkg));
  c("el script por defecto NO escribe (dry-run)", /process\.argv\.slice\(2\)\.includes\("--aplicar"\)/.test(readFileSync(path.join(RAIZ, "scripts/candado-lockfile.mjs"), "utf8")));
}

console.log("\n" + "─".repeat(56));
console.log(`CANDADO DEL LOCKFILE (v2.3.23): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }

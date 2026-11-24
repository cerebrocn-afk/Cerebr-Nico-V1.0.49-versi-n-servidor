#!/usr/bin/env node
/**
 * scripts/electron-bin.mjs — baja el binario de Electron sin depender de la
 * política allowScripts de npm 12 (que bloquea el postinstall del paquete).
 *
 * Uso:  npm run electron:bin
 *
 * Reporte de Mario (22/11, v1.0.46): `npm install` avisa «install scripts
 * blocked because they are not covered by allowScripts» y el paquete `electron`
 * queda sin `dist/electron.exe`. Aquí se lanza su instalador directamente con
 * node, así que la política de npm no interviene.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paquete = path.join(RAIZ, "node_modules", "electron");
const instalador = path.join(paquete, "install.js");
const exe = path.join(paquete, "dist", process.platform === "win32" ? "electron.exe" : "electron");

if (existsSync(exe)) {
  console.log(`[electron:bin] ya está: ${path.relative(RAIZ, exe)}`);
  process.exit(0);
}

if (!existsSync(instalador)) {
  console.error("[electron:bin] falta node_modules/electron.");
  console.error("  Ejecuta primero:  npm install");
  process.exit(1);
}

console.log("[electron:bin] bajando el binario de Electron (npm no lo hace por allowScripts)…");
const r = spawnSync(process.execPath, [instalador], { cwd: RAIZ, stdio: "inherit", env: process.env });

if (r.error) {
  console.error(`[electron:bin] no se pudo lanzar el instalador: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) {
  console.error("[electron:bin] el instalador falló. Si arriba hay ETIMEDOUT, ECONNRESET o 403, es red:");
  console.error("  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/");
  console.error("  npm run electron:bin");
  process.exit(r.status ?? 1);
}

if (!existsSync(exe)) {
  console.error(`[electron:bin] el instalador terminó pero no está ${path.relative(RAIZ, exe)}`);
  console.error("  Revisa la lista de exclusiones del antivirus o descomprime");
  console.error("  electron-v44.9.3-win32-x64.zip en C:\\ELECTRON y usa ELECTRON_OVERRIDE_DIST_PATH.");
  process.exit(1);
}

console.log(`[electron:bin] OK: ${path.relative(RAIZ, exe)}`);

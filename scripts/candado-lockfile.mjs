#!/usr/bin/env node
/**
 * scripts/candado-lockfile.mjs — EL LOCK NO PUEDE CONTRADECIRSE (v2.3.23)
 * =====================================================================
 * LO QUE ESTÁ ROTO, medido (no repetido del plano):
 *
 *   node_modules/@jridgewell/remapping   version 2.3.8  → resolved .../remapping-2.3.5.tgz
 *   node_modules/fsevents                version 2.3.8  → resolved .../fsevents-2.3.4.tgz
 *   node_modules/lightningcss            version 1.33.0 → resolved .../lightningcss-1.32.0.tgz
 *   node_modules/tapable                 version 2.3.8  → resolved .../tapable-2.3.4.tgz
 *   … (7 entradas en total)
 *
 * Alguien subió el campo `version` a mano y dejó la `resolved` y la `integrity` de la
 * versión vieja. El resultado es un archivo que **se contradice a sí mismo**: npm
 * puede dar 404 (buscando la versión declarada) o `integrity checksum mismatch`
 * (porque el hash es del tarball viejo). Es un `npm install` que no entra, y el
 * síntoma llega a la máquina de otro.
 *
 * POR QUÉ SE ARREGLA BAJANDO `version` Y NO SUBIENDO LA URL: `resolved` + `integrity`
 * son un par que se valida contra el tarball real. Reescribir la URL deja un hash que
 * no corresponde. Alinear `version` a la URL deja un lock **coherente y verificable**
 * con lo que efectivamente se va a bajar, que es lo que se le pide a un lockfile.
 *
 * Por defecto este script **no escribe**: imprime la tabla. `--aplicar` repara, es
 * idempotente, y no toca ninguna otra clave. Sin esa regla, un «arreglador de
 * lockfiles» es un generador de diffs incomprensibles.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** La versión que aparece en el nombre del tarball de `resolved`. */
export function versionDeResolved(resolved) {
  const m = /\/([^/]+)-(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\.tgz$/.exec(String(resolved || ""));
  return m ? m[2] : null;
}

/** Entradas del lock whose `version` contradicts its own `resolved`. */
export function entradasEnConflicto(bloquePaquetes) {
  const conflictos = [];
  for (const [clave, val] of Object.entries(bloquePaquetes || {})) {
    if (!clave.startsWith("node_modules/") || !val || typeof val !== "object") continue;
    const enUrl = versionDeResolved(val.resolved);
    if (!enUrl) continue;
    if (val.version && val.version !== enUrl) conflictos.push({ clave, declarada: val.version, enUrl, integrity: !!val.integrity });
  }
  return conflictos;
}

/**
 * Repara bajando `version` a la versión del tarball. Idempotente: una segunda pasada
 * no encuentra nada que cambiar. Cambia SÓLO esa clave de esas entradas.
 */
export function reparar(documento) {
  const paquetes = documento.packages || {};
  const conflictos = entradasEnConflicto(paquetes);
  const antes = JSON.stringify(documento);
  for (const cf of conflictos) paquetes[cf.clave] = { ...paquetes[cf.clave], version: cf.enUrl };
  return { documento, conflictos, modifico: JSON.stringify(documento) !== antes };
}

if (process.argv[1] && process.argv[1].endsWith("candado-lockfile.mjs")) {
  const aplicar = process.argv.slice(2).includes("--aplicar");
  const ruta = path.resolve("package-lock.json");
  const original = readFileSync(ruta, "utf8");
  const r = reparar(JSON.parse(original));
  if (!r.conflictos.length) {
    process.stdout.write("candado-lockfile: sin contradicciones version↔resolved\n");
    process.exit(0);
  }
  process.stdout.write(`candado-lockfile: ${r.conflictos.length} entrada(s) se contradicen\n`);
  for (const cf of r.conflictos) process.stdout.write(`  ${cf.clave}: version ${cf.declarada} ≠ tarball ${cf.enUrl}${cf.integrity ? " (con integrity de la del tarball)" : ""}\n`);
  if (!aplicar) {
    process.stdout.write("  (seco: pasar --aplicar; alineando version a la URL, que es el par que valida la integrity)\n");
    process.exit(1);
  }
  writeFileSync(ruta, JSON.stringify(r.documento, null, 2) + "\n");
  process.stdout.write("  reparadas: alineadas version→resolved, integrity intacta\n");
  process.exit(0);
}

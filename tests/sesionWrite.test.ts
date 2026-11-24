/**
 * tests/sesionWrite.test.ts — FASE 17: CORTAR A MITAD NO CUESTA NADA (v2.3.20)
 * =========================================================================
 * Evidencia de cierre del plano, literal: «test que **mata a mitad de escritura y
 * reabre**: cero pérdida de lo anterior y `seq` correcto; **dos escritores
 * simultáneos no corrompen**».
 *
 * Las dos cosas se prueban acá de las dos maneras posibles, porque una sola no
 * alcanza: el corte se reproduce de forma determinista (una línea truncada escrita a
 * mano, que es exactamente lo que deja un `SIGKILL` a mitad de `write`) y con un
 * **proceso real matado de verdad**, para que la prueba no dependa de mi idea de lo
 * que un corte escribe.
 *
 * Se trabaja sobre `mkdtemp` y se destruye: `.cerebro-db` del usuario no se toca.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LINES_PARA_COMPACTAR,
  VER_LOG,
  actaDeReapertura,
  adjuntar,
  compactar,
  leerSesion,
  migrarDocumentoViejo,
  registrarEnLog,
  recuperarDesdeLog,
  rutaLog,
} from "../src/engine/sesionEscribir";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leerFuente = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log("  \u2713 " + que); }
  else { fallos.push(que + (detalle ? " \u2192 " + detalle : "")); console.log("  \u2717 " + que + (detalle ? " \u2014 " + detalle : "")); }
};

function dir(): string {
  const d = mkdtempSync(path.join(os.tmpdir(), "cn-sesion-"));
  mkdirSync(path.join(d, ".cerebro-db"), { recursive: true });
  return path.join(d, ".cerebro-db", "planes.json");
}

console.log("\n1) seq monótono y reanudación\n");

{
  const doc = dir();
  const a = adjuntar(doc, { campo: "sesion_actual", val: "s-1", escritor: "ide" });
  const b = adjuntar(doc, { campo: "sesion_actual", val: "s-2", escritor: "puente-5000" });
  const leido = leerSesion(doc);
  c("\u2605 el seq avanza de a uno, quienquiera que escriba", a.seq === 1 && b.seq === 2, `${a.seq}/${b.seq}`);
  c("el último valor gana por seq, no por orden de llegada del sistema de archivos", leido.campos.sesion_actual === "s-2");
  c("reabrir releé exactamente las mutaciones", leido.aplicadas === 2 && leido.seq === 2, `aplicadas=${leido.aplicadas} seq=${leido.seq}`);
  c("el acta de reapertura nombra el seq recuperado", /seq 2/.test(actaDeReapertura(leido)), actaDeReapertura(leido));
}

console.log("\n2) MATAR A MITAD DE ESCRITURA (la evidencia del plano)\n");

{
  const doc = dir();
  for (let i = 1; i <= 5; i++) adjuntar(doc, { campo: `c${i}`, val: i, escritor: "ide" });
  // Esto es, byte a byte, lo que deja un SIGKILL a mitad de la última línea.
  writeFileSync(rutaLog(doc), JSON.stringify({ ver: VER_LOG, seq: 6, campo: "c6", val: { largo: "x".repeat(80) }, escritor: "ide" }).slice(0, 40), { flag: "a" });
  const leido = leerSesion(doc);
  c("\u2605 cero pérdida de lo anterior: las cinco mutaciones intactas", leido.aplicadas === 5, JSON.stringify(leido.descartadas));
  c("y el seq queda en el último consistente (5), no en el truncado", leido.seq === 5, String(leido.seq));
  c("la línea rota se NOMBRA, no se descarta en silencio", leido.descartadas.length === 1 && /corte a mitad|truncado/.test(leido.descartadas[0].motivo), JSON.stringify(leido.descartadas));
  // Y el mismo corte, con un proceso REAL matándose de verdad a mitad del append.
  // Sin esto la prueba depende de mi idea de lo que un corte escribe; con esto, no.
  // `.cjs` y no `.mjs`: el hijo usa `require`, y en un `.mjs` no existe — error de
  // sintaxis, cero escrituras y una prueba que «pasaba» sin matar nada.
  const zombie = path.join(path.dirname(doc), "zombie.cjs");
  const logZombie = rutaLog(path.join(path.dirname(doc), "zombie.json"));
  writeFileSync(
    zombie,
    [
      'const fs = require("node:fs");',
      `const log = ${JSON.stringify(logZombie)};`,
      "for (let i = 1; i <= 400; i++) {",
      '  const linea = JSON.stringify({ ver: 1, seq: i, campo: "c" + i, val: "y".repeat(400), escritor: "zombie", ts: Date.now() }) + "\\n";',
      "  fs.appendFileSync(log, linea);",
      "  if (i === 37) { fs.appendFileSync(log, linea.slice(0, 30)); process.kill(process.pid, \"SIGKILL\"); }",
      "}",
    ].join("\n"),
  );
  const r = spawnSync(process.execPath, [zombie], { encoding: "utf8" });
  const leidoZombie = leerSesion(path.join(path.dirname(doc), "zombie.json"));
  // La cuenta exacta depende de dónde corte el kernel: lo que NO puede cambiar es la
  // invariante. (La primera versión de esta valla fijaba 36 y estaba mal: el hijo
  // terminó 37. Asertar la invariante en vez del número es la diferencia entre una
  // prueba y una fotografía.)
  // v1.0.9 — EL SIGKILL NO SE REPORTA IGUAL EN TODAS LAS PLATAFORMAS.
  // En POSIX, matar con SIGKILL deja `signal === "SIGKILL"` y `status === null`.
  // En Windows, `process.kill(pid, "SIGKILL")` se traduce a TerminateProcess y
  // Node devuelve `signal === null` con un `status` distinto de 0 (el proceso
  // SÍ murió por la señal, pero el SO no la nombra). Exigir "SIGKILL" en Windows
  // convertía una prueba correcta en un rojo permanente que no señalaba ningún
  // defecto del código. La invariante que importa —murió de forma abrupta y el
  // log sobrevivió íntegro— se comprueba en las dos plataformas.
  const murioPorSenal =
    process.platform === "win32"
      ? r.signal === null && r.status !== 0
      : r.signal === "SIGKILL";
  c("\u2605 proceso matado con SIGKILL: sobrevive TODO lo completo y nada a medias",
    murioPorSenal && leidoZombie.aplicadas === leidoZombie.seq && leidoZombie.seq >= 30 && leidoZombie.descartadas.length === 1,
    `aplicadas=${leidoZombie.aplicadas} seq=${leidoZombie.seq} descartadas=${leidoZombie.descartadas.length} signal=${r.signal} status=${r.status} plataforma=${process.platform}`);
  c("y el corte quedó en UNA línea truncada nombrada en el acta",
    leidoZombie.descartadas.length === 1 && /corte a mitad|truncado/.test(leidoZombie.descartadas[0].motivo), JSON.stringify(leidoZombie.descartadas));
}

console.log("\n3) Dos escritores simultáneos no se pisan\n");

{
  const doc = dir();
  adjuntar(doc, { campo: "sesion_actual", val: "s-0", escritor: "ide" });
  const base = leerSesion(doc).seq; // ambas partes leen el mismo estado
  const ide = adjuntar(doc, { campo: "sesion_actual", val: "s-ide", escritor: "ide", esperadoSeq: base });
  const puente = adjuntar(doc, { campo: "sesion_actual", val: "s-puente", escritor: "puente-5000", esperadoSeq: base });
  c("\u2605 el primer escritor entra", ide.ok === true && ide.seq === base + 1);
  c("\u2605 el segundo se RECHAZA con causa en vez de pisar",
    puente.ok === false && /conflicto/.test(String(puente.motivo)), String(puente.motivo));
  c("el documento no quedó a medias: manda el que entró", leerSesion(doc).campos.sesion_actual === "s-ide");
  const reintent = adjuntar(doc, { campo: "sesion_actual", val: "s-puente", escritor: "puente-5000", esperadoSeq: ide.seq });
  c("y el rechazado reintentá sobre el seq nuevo y gana", reintent.ok === true && leerSesion(doc).campos.sesion_actual === "s-puente");
  c("sin CAS (sin esperadoSeq) el comportamiento heredado no cambia", adjuntar(doc, { campo: "x", val: 1, escritor: "ide" }).ok === true);
}

console.log("\n4) Compactación, migración y el cable al almacén real\n");

{
  const doc = dir();
  for (let i = 1; i <= 40; i++) adjuntar(doc, { campo: `c${i}`, val: i, escritor: "ide" });
  const antes = leerSesion(doc);
  compactar(doc);
  const despues = leerSesion(doc);
  c("\u2605 compactar no cambia el estado: mismos campos, mismo seq",
    despues.seq === antes.seq && Object.keys(despues.campos).length === Object.keys(antes.campos).length);
  c("y el log pasa a una línea", readFileSync(rutaLog(doc), "utf8").split("\n").filter(Boolean).length === 1);
  c("el umbral de compactación está declarado", LINES_PARA_COMPACTAR > 8, String(LINES_PARA_COMPACTAR));
}

{
  const doc = dir();
  writeFileSync(doc, JSON.stringify({ version: 1, planes: [{ id: "p1", estado: "en_curso" }] }));
  const m = migrarDocumentoViejo(doc);
  const m2 = migrarDocumentoViejo(doc);
  const leido = leerSesion(doc);
  c("\u2605 el formato viejo se lee sin migrar (reversibilidad media del plano)",
    migrarDocumentoViejo(dir()).migrado === false);
  c("la migración ocurrió una vez y conservó los campos",
    m.migrado === true && Array.isArray(leido.campos.planes) && leido.campos.version === 1);
  c("\u2605 relanzarla NO duplica el estado (idempotente)", m2.migrado === false && leido.seq === m.seq);
  c("el documento original quedó guardado como .v0.json", existsSync(`${doc}.v0.json`));
}

{
  const doc = dir();
  registrarEnLog(doc, JSON.stringify({ version: 1, planes: [{ id: "a" }] }));
  registrarEnLog(doc, JSON.stringify({ version: 1, planes: [{ id: "a" }, { id: "b" }] }));
  const a = registrarEnLog(doc, JSON.stringify({ version: 1, planes: [{ id: "a" }, { id: "b" }, { id: "c" }] }));
  c("\u2605 registrarEnLog sólo apunta lo que cambió", a.campos.join(",") === "planes", a.campos.join(","));
  if (existsSync(doc)) unlinkSync(doc); // el documento desaparece: el log es el último recurso
  writeFileSync(doc, "{ truncado a");
  const rescate = recuperarDesdeLog(doc);
  c("\u2605 con el documento corrupto, el log rescata el último estado consistente",
    rescate !== null && JSON.parse(rescate.texto).planes.length === 3, rescate ? rescate.acta : "null");
  c("y si tampoco hay log, devuelve null: no inventa", recuperarDesdeLog(path.join(path.dirname(doc), "no-hay.json")) === null);
}

console.log("\n5) Conexión: que no vuelva a ser un módulo hermoso y sin cable\n");

{
  const ts = leerFuente("src/engine/taskStoreFs.ts");
  const validar = leerFuente("scripts/validar.mjs");
  c("\u2605 el almacén real importa el registro", /from "\.\/sesionEscribir"/.test(ts));
  c("\u2605 escribe el log DESPUÉS de la escritura atómica (no la reemplaza)",
    /registrarEnLog\(destino, texto\)/.test(ts));
  c("\u2605 y lo lee como TERCER recurso, después del respaldo", /recuperarDesdeLog\(destino\)/.test(ts));
  c("el registro está envuelto en try/catch: un seguro no puede tumbar el vuelo",
    /try \{\s*\n?\s*registrarEnLog/.test(ts) || /registrarEnLog\(destino, texto\);\s*\n\s*\} catch/.test(ts));
  c("\u2605 la suite está registrada en npm run validar", validar.includes("sesionWrite.test.ts"));
  c("sesionEscribir no abre la red ni levanta procesos", !/node:net|node:http|child_process/.test(leerFuente("src/engine/sesionEscribir.ts")));
}

console.log("\n" + "─".repeat(56));
console.log(`SESIÓN RESISTENTE A CORTES (v2.3.20): ${correctas} correctas · ${fallos.length} fallos`);
if (fallos.length) { console.log("FALLOS:"); for (const f of fallos) console.log("  FALLO → " + f); process.exit(1); }

/**
 * tests/entregaAutoverificada.test.ts - FASE 5: EL RITUAL QUE NO NECESITA FE (v1.83.0)
 * ====================================================================================
 * El plano pide prueba explicita: «simula una parte corrupta (1 byte modificado)
 * -> el receptor se niega y dice cual». Se prueba en las dos capas: la funcion
 * pura (decidirRecepcion) y EL SCRIPT REAL, ejecutado contra un paquete chico
 * en un directorio temporario. Si el ritual se corrompe, esto se prende rojo
 * sin que nadie tenga que embalar nada para enterarse.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as assert from "node:assert";
import { execSync } from "node:child_process";
import { planSplit, renderManifiesto, sha256hex, decidirRecepcion, zipReensambladoBate } from "../src/engine/entregaRitual";

const casos: Array<{ nombre: string; fn: () => void }> = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });
const lee = (r: string) => fs.readFileSync(new URL("../" + r, import.meta.url), "utf8");

prueba("planSplit: 10 bytes en 4 -> 3/3/3/1, contiguo y sin huecos", () => {
  const p = planSplit(10, 4);
  assert.deepStrictEqual(p.map((x) => x.hasta - x.desde), [3, 3, 3, 1]);
  assert.strictEqual(p[0].desde, 0);
  for (let i = 1; i < p.length; i++) assert.strictEqual(p[i].desde, p[i - 1].hasta);
  assert.strictEqual(p[p.length - 1].hasta, 10);
  assert.deepStrictEqual(planSplit(0, 4), []);
});

const ARMA = () => {
  const zip = Buffer.from("contenido-del-zip-falso-para-la-prueba");
  const partes = planSplit(zip.length, 4).map((s) => zip.subarray(s.desde, s.hasta));
  const piezas = partes.map((b, i) => ({ nombre: `CerebroNico-IDE-v9.9.9-parte-${i + 1}de4.zip`, bytes: b.length, sha256: sha256hex(b) }));
  const man = renderManifiesto({ version: "9.9.9", zip: { nombre: "CerebroNico-IDE-v9.9.9.zip", bytes: zip.length, sha256: sha256hex(zip) }, partes: piezas, validaciones: ["prueba"] });
  return { zip, partes, piezas, man };
};

prueba("receptor puro: con todo conforme reune; con 1 byte podrido SE NIEGA y nombra la parte", () => {
  const { piezas, man } = ARMA();
  const ok = decidirRecepcion(man, piezas.map((p) => ({ nombre: p.nombre, sha256: p.sha256 })));
  assert.strictEqual(ok.ok, true, JSON.stringify(ok));
  const podrida = piezas.map((p, i) => ({ nombre: p.nombre, sha256: i === 1 ? p.sha256.slice(0, -1) + (p.sha256.endsWith("a") ? "b" : "a") : p.sha256 }));
  const mala = decidirRecepcion(man, podrida);
  assert.strictEqual(mala.accion, "rechazar");
  assert.strictEqual(mala.parteMala, "CerebroNico-IDE-v9.9.9-parte-2de4.zip", "el rechazo tiene que decir CUAL: " + JSON.stringify(mala));
});

prueba("REGRESION MEDIDA: manifiesto con separador de miles (U+00A0) que el receptor tambien conoce", () => {
  // El bug real de la primera corrida contra el paquete vivo: toLocaleString("de-AT")
  // escribe 12\u00a0350\u00a0588 y el regex del receptor solo aceptaba digitos.
  const zip = Buffer.from("x".repeat(40));
  const piezas = [1, 2, 3, 4].map((i) => ({ nombre: `CerebroNico-IDE-v9.9.9-parte-${i}de4.zip`, bytes: 12350588, sha256: sha256hex(Buffer.from(String(i))) }));
  const man = renderManifiesto({ version: "9.9.9", zip: { nombre: "CerebroNico-IDE-v9.9.9.zip", bytes: zip.length, sha256: sha256hex(zip) }, partes: piezas, validaciones: ["p"] });
  assert.ok(man.includes("\u00a0") || man.includes(","), "el fixture debe traer separador de miles");
  const v = decidirRecepcion(man, piezas.map((p) => ({ nombre: p.nombre, sha256: p.sha256 })));
  assert.strictEqual(v.ok, true, "con millones de bytes el receptor no puede quedarse ciego: " + JSON.stringify(v));
});

prueba("zipReensambladoBate: mismo hash o no es el mismo paquete", () => {
  const { zip } = ARMA();
  assert.strictEqual(zipReensambladoBate(sha256hex(zip), sha256hex(Buffer.from(zip))), true);
  assert.strictEqual(zipReensambladoBate(sha256hex(zip), sha256hex(Buffer.from("otra cosa"))), false);
});

prueba("EL SCRIPT REAL: paquete sano lo reensambla; con 1 byte modificado se niega nombrando la parte", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-entrega-"));
  const raiz = path.resolve(".");
  try {
    const { zip, partes, man } = ARMA();
    fs.writeFileSync(path.join(dir, "MANIFIESTO-CHECKSUMS-v9.9.9.txt"), man);
    partes.forEach((b, i) => fs.writeFileSync(path.join(dir, `CerebroNico-IDE-v9.9.9-parte-${i + 1}de4.zip`), b));
    const cmd = `npx tsx scripts/entregar-verificar.ts "${dir}"`;
    const salida = execSync(cmd, { cwd: raiz, encoding: "utf8", timeout: 120000 });
    assert.ok(salida.includes("Reensamblado y verificado"), salida.slice(0, 200));
    assert.ok(fs.existsSync(path.join(dir, "CerebroNico-IDE-v9.9.9.zip")), "el receptor escribe el zip reensamblado");
    const p3 = path.join(dir, "CerebroNico-IDE-v9.9.9-parte-3de4.zip");
    const buf = fs.readFileSync(p3);
    buf[0] = buf[0] ^ 0xff;
    fs.writeFileSync(p3, buf);
    fs.rmSync(path.join(dir, "CerebroNico-IDE-v9.9.9.zip"));
    let msg = "";
    let code = 0;
    try {
      execSync(cmd, { cwd: raiz, encoding: "utf8", stdio: "pipe", timeout: 120000 });
    } catch (e: any) {
      code = e?.status || 0;
      msg = String(e?.stderr || "") + String(e?.stdout || "");
    }
    assert.strictEqual(code, 1, "el receptor debe NEGARSE con exit 1 (salió: " + code + " " + msg.slice(0, 120) + ")");
    assert.ok(msg.includes("parte-3de4"), "y debe DECIR cual parte: " + msg.slice(0, 200));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

prueba("cables: los comandos existen y el ritual se niega solo", () => {
  const pkg = JSON.parse(lee("package.json"));
  assert.ok(pkg.scripts.entregar && pkg.scripts["entregar:verificar"], "npm run entregar y entregar:verificar existen");
  const e = lee("scripts/entregar.ts");
  assert.ok(e.includes("NO SALE") && e.includes("faltantes"), "el embalador se niega solo: faltantes y reensamblaje son puerta");
  assert.ok(e.includes("CLAVE_RUINA"), "adentro del ritual: escaneo de claves reales del zip");
});

let fallos = 0;
for (const c of casos) {
  try { c.fn(); console.log("  \u2713 " + c.nombre); }
  catch (e: any) { fallos++; console.log("  \u2717 " + c.nombre); console.log("    " + String(e?.message).split("\n").slice(0, 4).join("\n")); }
}
console.log(`\nentregaAutoverificada: ${casos.length - fallos}/${casos.length} OK`);
if (fallos) process.exit(1);

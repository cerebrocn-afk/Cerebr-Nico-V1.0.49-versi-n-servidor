/**
 * scripts/entregar-verificar.ts — EL RECEPTOR QUE SE NIEGA (v1.83.0 · FASE 5)
 * ===========================================================================
 * `npm run entregar:verificar -- <carpeta-con-partes> [--manifiesto ARCHIVO]`
 * Bate cada parte contra el manifiesto ANTES de reensamblar; con una parte
 * corrupta (aunque sea UN byte) se niega y DICE CUAL — el instalador nunca abre
 * un paquete roto. Con todo conforme, reensambla el zip, verifica su hash y
 * muestra el tamano final. Logica pura en src/engine/entregaRitual.decidirRecepcion.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { decidirRecepcion, sha256hex } from "../src/engine/entregaRitual";

const args = process.argv.slice(2);
const carpeta = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
const iMan = args.indexOf("--manifiesto");
const manRuta = iMan > -1 && args[iMan + 1] ? path.resolve(args[iMan + 1]) : null;
const manFinal =
  manRuta ||
  fs.readdirSync(carpeta).filter((f) => /^MANIFIESTO-.*\.txt$/.test(f)).map((f) => path.join(carpeta, f))[0];
if (!manFinal || !fs.existsSync(manFinal)) {
  console.error(`✖ no encuentro manifiesto en ${carpeta}`);
  process.exit(1);
}
const manifiesto = fs.readFileSync(manFinal, "utf8");
// El manifiesto declara su zip; SOLO sus partes se batén. Una carpeta con
// paquetes de varias versiones conviviendo ya no lo confunde (rechazo medido
// en la primerísima corrida real: conocía su manifiesto pero veía partes ajenas).
const mZip = manifiesto.match(/Zip:\s*(CerebroNico-IDE-v[\d.]+)\.zip/);
const baseDelManifiesto = mZip ? mZip[1] : null;
const partes = fs
  .readdirSync(carpeta)
  .filter((f) => /-parte-\d+de4\.zip$/.test(f) && (!baseDelManifiesto || f.startsWith(baseDelManifiesto + "-parte-")))
  .sort()
  .map((f) => ({ nombre: f, sha256: sha256hex(fs.readFileSync(path.join(carpeta, f))) }));

const veredicto = decidirRecepcion(manifiesto, partes);
if (!veredicto.ok) {
  console.error(`✖ ENTREGA RECHAZADA: ${veredicto.motivo}${veredicto.parteMala ? ` (parte: ${veredicto.parteMala})` : ""}`);
  process.exit(1);
}
const base = partes[0].nombre.replace(/-parte-\d+de4\.zip$/, "");
const zipNombre = `${base}.zip`;
for (const p of partes) {
  const buf = fs.readFileSync(path.join(carpeta, p.nombre));
  fs.appendFileSync(path.join(carpeta, `.reensamblado-${zipNombre}`), buf);
}
const reunido = fs.readFileSync(path.join(carpeta, `.reensamblado-${zipNombre}`));
const shaReunido = sha256hex(reunido);
const shaZip = (manifiesto.match(/Zip:\s*CerebroNico-IDE-v[\d.]+\.zip\s+[\d., ]+ bytes\n  SHA256  ([0-9a-f]{64})/) || [])[1];
if (shaZip && shaZip !== shaReunido) {
  console.error(`✖ EL ZIP REENSAMBLADO NO BATE: manifiesto dice ${shaZip.slice(0, 16)}..., reensamblado da ${shaReunido.slice(0, 16)}...`);
  fs.rmSync(path.join(carpeta, `.reensamblado-${zipNombre}`));
  process.exit(1);
}
fs.renameSync(path.join(carpeta, `.reensamblado-${zipNombre}`), path.join(carpeta, zipNombre));
console.log(`✔ Reensamblado y verificado: ${zipNombre} (${reunido.length} bytes, SHA256 bate con el manifiesto)`);

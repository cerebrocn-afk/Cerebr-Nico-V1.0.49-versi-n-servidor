// Empaqueta el paquete de conocimiento en un ZIP verificado (EOCD + sha256).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const SRC = "C:/Users/BirdBox/Downloads/CN-cerebro-vacio";
const ZIP = "C:/Users/BirdBox/Downloads/CN-cerebro-vacio.zip";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const archivos = fs.readdirSync(SRC).sort();
const locales = [];
const central = [];
let offset = 0;

for (const nombre of archivos) {
  const datos = fs.readFileSync(path.join(SRC, nombre));
  const comp = zlib.deflateRawSync(datos, { level: 9 });
  const crc = crc32(datos);
  const nom = Buffer.from(nombre, "utf8");

  const lf = Buffer.alloc(30);
  lf.writeUInt32LE(0x04034b50, 0);
  lf.writeUInt16LE(20, 4);
  lf.writeUInt16LE(0x0800, 6);
  lf.writeUInt16LE(8, 8);
  lf.writeUInt16LE(0, 10);
  lf.writeUInt16LE(0, 12);
  lf.writeUInt32LE(crc, 14);
  lf.writeUInt32LE(comp.length, 18);
  lf.writeUInt32LE(datos.length, 22);
  lf.writeUInt16LE(nom.length, 26);
  lf.writeUInt16LE(0, 28);
  locales.push(lf, nom, comp);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(datos.length, 24);
  cd.writeUInt16LE(nom.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nom);

  offset += lf.length + nom.length + comp.length;
}

const cdBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(archivos.length, 8);
eocd.writeUInt16LE(archivos.length, 10);
eocd.writeUInt32LE(cdBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const zip = Buffer.concat([...locales, cdBuf, eocd]);
fs.writeFileSync(ZIP, zip);

const sha = crypto.createHash("sha256").update(zip).digest("hex");
const leido = fs.readFileSync(ZIP);
const eocdOk = leido.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) >= 0;

console.log("ZIP: " + ZIP);
console.log("bytes: " + zip.length);
console.log("entradas: " + archivos.length + " -> " + archivos.join(", "));
console.log("EOCD presente: " + eocdOk);
console.log("sha256: " + sha);

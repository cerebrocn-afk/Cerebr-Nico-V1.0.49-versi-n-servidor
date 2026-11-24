// Repara el lock (tapable 2.3.4 -> 2.3.8) y la deriva documental de memoria.md.
const fs = require('fs');
const path = require('path');

const APP = 'C:\\Users\\BirdBox\\Downloads\\cerebronico 3-11-2026\\CerebroNico-IDE-v2.3.8\\app';
const lockPath = path.join(APP, 'package-lock.json');
const memPath = path.join(APP, 'memoria.md');

// --- 1. LOCK ---
let lock = fs.readFileSync(lockPath, 'utf8');
const antes = lock;
lock = lock.replace(/"tapable":\s*"\^?2\.3\.4"/g, '"tapable": "^2.3.8"');
lock = lock.replace(/"tapable":\s*"\^?2\.3\.4"/g, '"tapable": "^2.3.8"');
lock = lock.replace(/tapable-2\.3\.4\.tgz/g, 'tapable-2.3.8.tgz');
lock = lock.replace(/"resolved":\s*"([^"]*)\/tapable\/-\/tapable-2\.3\.4\.tgz"/g, '"resolved": "$1/tapable/-/tapable-2.3.8.tgz"');
lock = lock.replace(/"version":\s*"2\.3\.4"(\s*,\s*\n\s*"resolved":\s*"[^"]*tapable)/g, '"version": "2.3.8"$1');

if (lock !== antes) {
  JSON.parse(lock); // valida antes de escribir
  fs.writeFileSync(lockPath, lock, 'utf8');
  console.log('lock: reparado y escrito');
} else {
  console.log('lock: sin cambios necesarios');
}

// --- 2. DERIVA ---
let mem = fs.readFileSync(memPath, 'utf8');
const lineas = mem.split(/\r?\n/);
let tocadas = 0;
for (let i = 0; i < lineas.length; i++) {
  if (!lineas[i].includes('v1.51.0')) continue;
  if (!/Fase de Desarrollo Activa|Fase Activa/i.test(lineas[i])) continue;
  lineas[i] = lineas[i].replace(/v1\.51\.0/g, 'v2.3.20');
  tocadas++;
}
if (tocadas > 0) {
  fs.writeFileSync(memPath, lineas.join('\n'), 'utf8');
  console.log('memoria.md: ' + tocadas + ' linea(s) corregidas a v2.3.20');
} else {
  console.log('memoria.md: sin deriva en fase activa');
}

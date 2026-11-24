// Verifica el sha256 del parche 2.3.20 contra el hash declarado en su manifiesto.
const fs = require('fs');
const crypto = require('crypto');

const zip = process.argv[2];
const manifiesto = process.argv[3];

if (!zip || !manifiesto) {
  console.error('uso: node _hash2320.cjs <zip> <manifiesto>');
  process.exit(2);
}

const buf = fs.readFileSync(zip);
const sha = crypto.createHash('sha256').update(buf).digest('hex');
const txt = fs.readFileSync(manifiesto, 'utf8');

// El manifiesto declara el hash en una línea tipo: sha256: <hex>  o  "sha256": "<hex>"
const m = txt.match(/sha256["'\s:]+([0-9a-fA-F]{64})/);
const esperado = m ? m[1].toLowerCase() : null;

console.log('archivo : ' + zip.split('\\').pop());
console.log('bytes   : ' + buf.length);
console.log('sha256  : ' + sha);
console.log('esperado: ' + (esperado || '(no encontrado en el manifiesto)'));

if (!esperado) {
  console.log('VEREDICTO: NO SE PUDO COMPARAR (sin hash en el manifiesto)');
  process.exit(3);
}

if (sha === esperado) {
  console.log('VEREDICTO: HASH COINCIDE');
  process.exit(0);
} else {
  console.log('VEREDICTO: HASH NO COINCIDE');
  process.exit(1);
}

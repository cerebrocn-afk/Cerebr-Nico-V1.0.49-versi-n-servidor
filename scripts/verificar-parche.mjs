// Verifica el sha256 de un parche contra el que declara su manifiesto.
// Uso: node scripts/verificar-parche.mjs <ruta-del-zip> <sha256-esperado>
// Sin argumentos, comprueba el parche 2.3.14 contra el hash de su manifiesto.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const ESPERADO_POR_DEFECTO = '994ed106846109a175fda81834a0e1123c53fd12e57204aee61ce96031216750';
const ZIP_POR_DEFECTO = 'C:/Users/BirdBox/Downloads/CerebroNico-IDE-v2.3.14-PARCHE.zip';

const zip = process.argv[2] || ZIP_POR_DEFECTO;
const esperado = (process.argv[3] || ESPERADO_POR_DEFECTO).toLowerCase();

if (!existsSync(zip)) {
  console.error(`NO EXISTE: ${zip}`);
  process.exit(2);
}

const bytes = readFileSync(zip);
const real = createHash('sha256').update(bytes).digest('hex');

console.log(`archivo : ${zip}`);
console.log(`bytes   : ${bytes.length}`);
console.log(`sha256  : ${real}`);
console.log(`esperado: ${esperado}`);

if (real === esperado) {
  console.log('VEREDICTO: HASH COINCIDE — el parche es el que declara el manifiesto.');
  process.exit(0);
}

console.error('VEREDICTO: HASH NO COINCIDE — NO extraer este parche.');
process.exit(1);

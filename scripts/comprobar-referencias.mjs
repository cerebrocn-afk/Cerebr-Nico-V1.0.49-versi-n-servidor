// Comprueba que TODA referencia local del index.html existe en disco.
// Uso: node scripts/comprobar-referencias.mjs
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(raiz, 'index.html'), 'utf8');

const externa = (u) => /^(https?:|#|data:|mailto:|javascript:|\/\/)/i.test(u);
const refs = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
  .map((m) => m[1].trim())
  .filter((u) => u && !externa(u));

const unicas = [...new Set(refs)];
const faltan = unicas.filter((u) => !existsSync(resolve(raiz, u.replace(/^\//, '').split('?')[0])));

console.log(`Referencias locales en index.html: ${unicas.length}`);
for (const u of unicas) {
  console.log(`  ${faltan.includes(u) ? 'FALTA' : 'ok   '}  ${u}`);
}
console.log(faltan.length === 0
  ? 'Resultado: todas las referencias locales existen.'
  : `Resultado: ${faltan.length} referencia(s) rota(s).`);
process.exit(faltan.length === 0 ? 0 : 1);

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'C:\\Users\\BirdBox\\Downloads\\cerebronico 3-11-2026\\CerebroNico-IDE-v2.3.8\\app';
const HOJA = join(APP, 'HOJA_DE_RUTA_PERFECCION.md');
const INSERTO = join(APP, '_f8f9.md');

if (!existsSync(HOJA)) { console.error('no existe la hoja'); process.exit(1); }
if (!existsSync(INSERTO)) { console.error('no existe el inserto'); process.exit(1); }

const hoja = readFileSync(HOJA, 'utf8');
const inserto = readFileSync(INSERTO, 'utf8');

if (hoja.includes('## FASE 8 ·')) {
  console.log('YA INSERTADO: la hoja ya contiene FASE 8, no se toca');
  process.exit(0);
}

const ANCLA = '## 5 · Anti-hoja';
const pos = hoja.indexOf(ANCLA);
if (pos < 0) { console.error('ancla no encontrada: ' + ANCLA); process.exit(2); }

const antes = hoja.slice(0, pos);
const despues = hoja.slice(pos);
const resultado = antes + inserto + despues;

writeFileSync(HOJA, resultado, 'utf8');
console.log('OK insertado');
console.log('lineas antes: ' + hoja.split('\n').length);
console.log('lineas despues: ' + resultado.split('\n').length);
console.log('FASE 8 presente: ' + resultado.includes('## FASE 8 ·'));
console.log('FASE 9 presente: ' + resultado.includes('## FASE 9 ·'));
console.log('FASE 7 intacta: ' + resultado.includes('## FASE 7 · EL SANDBOX CON SU PROPIO CEREBRO'));
console.log('Anti-hoja intacta: ' + resultado.includes(ANCLA));

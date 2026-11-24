// cableadoFases.test.mjs — GUARDIÁN DE CABLEADO F4–F10, CABLEADO AL VEREDICTO (v1.53.5).
//
// No basta con DIAGNOSTICAR el cableado una vez: un diagnóstico que nadie vuelve
// a correr envejece. Esta suite congela el estado REAL de hoy en
// `scripts/cableado-baseline.json` y falla si un módulo de fase cambia de estado
// sin actualizar la línea base. Así, cuando se CABLEE un huérfano (el trabajo que
// viene), el guardián obliga a declarar el cambio en vez de que pase inadvertido.
//
// Honestidad: imprime «N correctas · M fallidas» y pone process.exitCode = 1 si
// algo driftó, para que `npm run validar` lo lea igual que a las demás suites.
// Node v16, sin deps, sin red. Ejecutable directo: `node tests/cableadoFases.test.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analizar } from '../scripts/lib-cableado.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const BASE = path.join(RAIZ, 'scripts', 'cableado-baseline.json');

const ESTADOS_VALIDOS = new Set(['CABLEADO', 'IMPORTADO-SIN-USO', 'INDIRECTO', 'HUÉRFANO', 'NO-EXISTE']);

let ok = 0, mal = 0;
const fallos = [];
function afirmar(cond, desc) {
  if (cond) { ok++; } else { mal++; fallos.push(desc); }
}

const { filas } = analizar(RAIZ);
const actual = {};
for (const f of filas) actual[f.mod] = f.estado;

// 1) La línea base existe y es JSON válido.
let base = null;
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch { /* base = null */ }
afirmar(base && typeof base === 'object', 'La línea base scripts/cableado-baseline.json existe y es JSON válido');

// 2) Todo estado reportado es de la enumeración conocida.
for (const f of filas) {
  afirmar(ESTADOS_VALIDOS.has(f.estado), `Estado conocido para ${f.mod}: ${f.estado}`);
}

// 3) El conjunto de módulos analizados coincide con la línea base (ni más ni menos).
if (base) {
  const kActual = Object.keys(actual).sort();
  const kBase = Object.keys(base).sort();
  afirmar(kActual.length === kBase.length && kActual.every((k, i) => k === kBase[i]),
    `Conjunto de módulos F4–F10 == línea base (${kActual.length} vs ${kBase.length})`);

  // 4) Cada módulo mantiene el estado de la línea base (regresión de cableado).
  for (const k of kBase) {
    afirmar(actual[k] === base[k],
      `${k}: estado == línea base (base=${base[k]} · actual=${actual[k] ?? 'AUSENTE'})`);
  }
}

// --- Veredicto ---
if (fallos.length) {
  console.log('\nDETALLE DE FALLOS:');
  for (const d of fallos) console.log('  ✗ ' + d);
  console.log('\nSi el cambio es INTENCIONAL (cableaste un módulo), regenera la línea base:');
  console.log('  node scripts/verificar-cableado.mjs   # revisa el nuevo estado');
  console.log('  (y actualiza scripts/cableado-baseline.json a conciencia)');
}
console.log(`\nCABLEADO F4–F10: ${ok} correctas · ${mal} fallidas`);
if (mal > 0) process.exitCode = 1;

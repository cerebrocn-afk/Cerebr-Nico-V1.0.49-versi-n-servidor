#!/usr/bin/env node
// verificar-cableado.mjs — INFORME de la MATRIZ DE CABLEADO F4–F10 (PASO 1, HOJA DE RUTA v1.54).
// Diagnóstico PURO: NO modifica código. Clasifica cada módulo de fase como
//   CABLEADO / IMPORTADO-SIN-USO / INDIRECTO / HUÉRFANO / NO-EXISTE.
// Compatible Node v16 (sin deps, sin red).
//   node scripts/verificar-cableado.mjs        → informe de consola
//   node scripts/verificar-cableado.mjs --md    → markdown (para documentacion/MATRIZ_CABLEADO_F4-F10.md)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analizar } from './lib-cableado.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const MD = process.argv.includes('--md');

const { filas, resumen } = analizar(RAIZ);

if (MD) {
  const L = [];
  L.push('# MATRIZ DE CABLEADO F4–F10 — CerebróNico IDE');
  L.push('');
  L.push('> Generado por `scripts/verificar-cableado.mjs --md` (diagnóstico PURO, Node v16, sin red).');
  L.push('> VERIFICADO POR EJECUCIÓN. No modifica código. Fecha: ' + new Date().toISOString().slice(0, 10) + '.');
  L.push('');
  L.push('**Leyenda:** CABLEADO = importado y usado en `server.ts` · IMPORTADO-SIN-USO = importado pero sus exports no se referencian en el cuerpo · INDIRECTO = no lo toca `server.ts` pero sí otro módulo de `src/` · HUÉRFANO = ningún código de producción lo importa (puede tener test) · NO-EXISTE = archivo ausente.');
  L.push('> «Probado (test)» = alguna suite de `tests/` lo importa. **Probado ≠ cableado:** un módulo puede estar verde en tests y no invocarse NUNCA en vivo.');
  L.push('');
  L.push('| Fase | Módulo | Estado | En server.ts | Refs en cuerpo | Probado (test) | Importadores (fuera de server) |');
  L.push('|---|---|---|---|---|---|---|');
  for (const f of filas) {
    const imps = f.importadores.length ? f.importadores.join('<br>') : '—';
    L.push(`| ${f.fase} | \`${f.mod}\` | **${f.estado}** | ${f.importadoEnServer ? 'Sí' : 'No'} | ${f.refsServer} | ${f.probadoPor.length ? 'Sí' : 'No'} | ${imps} |`);
  }
  L.push('');
  L.push('## Resumen');
  L.push('');
  for (const [k, v] of Object.entries(resumen)) L.push(`- **${k}**: ${v}`);
  L.push('');
  L.push('## Símbolos usados en server.ts (por módulo CABLEADO)');
  L.push('');
  for (const f of filas) {
    if (f.estado === 'CABLEADO') L.push(`- \`${f.mod}\`: ${f.simbolosUsados.join(', ')}`);
  }
  L.push('');
  L.push('## Suites que cubren cada módulo (tests/)');
  L.push('');
  for (const f of filas) {
    if (f.probadoPor.length) L.push(`- \`${f.mod}\`: ${f.probadoPor.join(', ')}`);
  }
  console.log(L.join('\n'));
} else {
  for (const f of filas) {
    console.log(`[${f.estado.padEnd(18)}] ${f.fase.padEnd(24)} ${f.mod.padEnd(24)} server=${f.importadoEnServer ? 'S' : 'N'} refs=${String(f.refsServer).padStart(3)} test=${f.probadoPor.length ? 'S' : 'N'} importadores=${f.importadores.length}`);
  }
  console.log('\nRESUMEN:', JSON.stringify(resumen));
}

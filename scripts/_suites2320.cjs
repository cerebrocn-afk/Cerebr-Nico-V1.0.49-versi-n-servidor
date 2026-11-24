// Corre las suites del 2.3.20 con el runner real del proyecto (tsx).
const { spawnSync } = require('child_process');
const path = require('path');

const APP = 'C:\\Users\\BirdBox\\Downloads\\cerebronico 3-11-2026\\CerebroNico-IDE-v2.3.8\\app';
const TSX = path.join(APP, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const suites = [
  'tests/sesionWrite.test.ts',
  'tests/planEscrituraCableada.test.ts',
  'tests/capasSkills.test.ts',
  'tests/auditoriaSkills.test.ts',
  'tests/contextoMedido.test.ts',
  'tests/parchesSemilla.test.ts',
  'tests/seguidorHilo.test.ts',
  'tests/goteo.test.ts',
];

let verdes = 0, rojas = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, [TSX, s], {
    cwd: APP,
    encoding: 'utf8',
    timeout: 180000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0;
  const resumen = out.split(/\r?\n/).filter(l => /OK|VERDE|FALL|comprobacion|comprobaciones/i.test(l)).slice(-2).join(' | ');
  console.log((ok ? 'VERDE  ' : 'ROJA   ') + s + '  ' + resumen.slice(0, 160));
  ok ? verdes++ : rojas++;
}
console.log('---');
console.log(verdes + '/' + suites.length + ' VERDES · ' + rojas + ' rojas');
process.exit(rojas === 0 ? 0 : 1);

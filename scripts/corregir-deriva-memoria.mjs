// Corrige la deriva documental de memoria.md: las líneas «Fase de Desarrollo Activa»
// que quedaron en v1.51.0 tras el parche 2.3.14. Respeta el resto del archivo.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const RUTA = 'C:/Users/BirdBox/Downloads/cerebronico 3-11-2026/CerebroNico-IDE-v2.3.8/app/memoria.md';
const VIEJO = 'primera entrega v1.51.0 cerrada';
const NUEVO = 'v2.3.14 · FASE 13 (telemetría de contexto) cerrada';

const original = readFileSync(RUTA, 'utf8');
const lineas = original.split(/\r?\n/);
let tocadas = 0;

const nuevas = lineas.map((l) => {
  if (l.includes('Fase de Desarrollo Activa') && l.includes(VIEJO)) {
    tocadas++;
    return l.replace(VIEJO, NUEVO);
  }
  return l;
});

if (tocadas === 0) {
  console.log('NADA QUE CORREGIR: no hay líneas con «' + VIEJO + '».');
  process.exit(0);
}

copyFileSync(RUTA, RUTA + '.bak');
writeFileSync(RUTA, nuevas.join('\n'), 'utf8');
console.log(`CORREGIDAS: ${tocadas} línea(s). Respaldo en memoria.md.bak`);

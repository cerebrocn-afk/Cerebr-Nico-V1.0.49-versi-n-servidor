// presupuestoHuerfanos.test.mjs — ★ LA VALLA (HOJA DE RUTA v1.67 · PRIORIDAD 0).
//
// ============================================================================
// POR QUÉ EXISTE ESTE TEST Y NO OTRO DIAGNÓSTICO MÁS
// ============================================================================
// La plaga ya apareció TRES veces. HOJA_DE_RUTA tiene una entrada llamada
// literalmente «v1.59.1 — CABLEADO DEL MOTOR DE CERTEZA (fin de los huérfanos)».
// No fue el fin: v1.66.0 sembró tres más y el conteo llegó a 27 (9,8 % del árbol).
//
// La causa no es falta de intención, es que NADA BLOQUEABA. La casa ya tiene el
// remedio probado: el trinquete de `server_lineas` funciona porque sí bloquea.
// Este test es ese mismo trinquete aplicado a los huérfanos.
//
// Regla que instala: un módulo nuevo que no está cableado en su propio commit NO
// entra, o entra con su fila en PERMITIDOS_HUERFANOS — nombre, motivo y versión
// de destino. Y esa lista, como todo presupuesto, sólo puede achicarse.
//
// Un huérfano no es cosmética: es un defecto que el usuario sigue sufriendo
// mientras el arreglo está en el repo, escrito y EN VERDE, y nadie lo nota porque
// el test pasa. `continuidadTurno` estuvo SEIS versiones describiendo en su propio
// comentario la queja exacta del usuario, sin que nadie lo llamara.
//
// Diagnóstico PURO: no toca código. Node v16, sin deps, sin red.
//   node tests/presupuestoHuerfanos.test.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  descubrir,
  PRESUPUESTO_HUERFANOS,
  PERMITIDOS_HUERFANOS,
} from '../scripts/lib-cableado.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');

let ok = 0;
const fallos = [];
function afirmar(cond, desc) {
  if (cond) ok++;
  else fallos.push(desc);
}

// ─── 1 · El censo se DESCUBRE, no se lista a mano ─────────────────────
// Si el descubrimiento se rompe (una ruta mal puesta, un `re` que deja de casar),
// el número de huérfanos cae a 0 y el presupuesto se cumple «solo». Ese es el
// fallo del propio instrumento, y es el único que podría dejar la valla en
// decorativa. Se corta con un suelo de censo.
const { filas, huerfanos, resumen, totalAnalizados } = descubrir(RAIZ);
afirmar(
  totalAnalizados >= 250,
  'El censo descubre el árbol entero (>=250 modulos) — medido: ' + totalAnalizados +
  '. Si esto baja de golpe se rompió el DESCUBRIMIENTO, no el cableado.',
);
afirmar(
  filas.every((f) => f.ruta.startsWith('src/') || f.ruta.startsWith('server/')),
  'El censo sólo contiene código del motor (src/ y server/)',
);
afirmar(
  filas.every((f) => !f.ruta.startsWith('tests/')),
  'Los tests no se censan como módulos del motor',
);

// ─── 2 · Control de falso positivo del escáner (el fallo de v1.66.0) ────
// La primera versión del instrumento NO veía `import "./x"` — efecto puro, sin
// `from` — y reportaba como muerto todo el subsistema `src/engine/extensiones/`.
// Se fija acá, con un fixture, para que ese punto ciego no pueda volver a
// disfrazarse de «bajamos la deuda».
function fixture(nombre, arbol) {
  const dir = path.join(os.tmpdir(), 'cn-valla-' + nombre + '-' + Date.now() + '-' + process.pid);
  for (const [p, contenido] of Object.entries(arbol)) {
    const abs = path.join(dir, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contenido, 'utf8');
  }
  return dir;
}
try {
  const dir = fixture('efecto-puro', {
    'server.ts': 'import "./src/efecto";\nexport const x = 1;\n',
    'src/efecto.ts': 'export const y = 2;\n',
    'src/solo.ts': 'export const z = 3;\n',
    'src/porTest.ts': 'export const w = 4;\n',
    'tests/porTest.test.ts': 'import { w } from "../src/porTest";\n',
  });
  const f = descubrir(dir);
  const vidaDe = (b) => (f.filas.find((r) => r.modBase === b) || {}).vida;
  afirmar(vidaDe('src/efecto') === 'VIVO',
    'CONTROL DE FALSO POSITIVO: import "./x" (efecto puro, sin from) cuenta como cable — medido: ' + vidaDe('src/efecto'));
  afirmar(vidaDe('src/solo') === 'HUÉRFANO',
    'Un módulo que nadie importa es HUÉRFANO — medido: ' + vidaDe('src/solo'));
  afirmar(vidaDe('src/porTest') === 'SOLO-TEST',
    'Lo que sólo importa su test es SOLO-TEST (la plaga) — medido: ' + vidaDe('src/porTest'));
  fs.rmSync(dir, { recursive: true, force: true });
} catch (e) {
  afirmar(false, 'El fixture de control de falso positivo corrió: ' + (e && e.message));
}

// ─── 3 · LA VALLA · el techo ──────────────────────────────────────────
// Esta es la aserción que IMPORTA. Si alguien escribe un módulo y no lo enchufa,
// `npm run validar` se pone rojo acá y no dentro de doce versiones.
afirmar(
  huerfanos.length <= PRESUPUESTO_HUERFANOS,
  'Huérfanos (' + huerfanos.length + ') <= PRESUPUESTO_HUERFANOS (' + PRESUPUESTO_HUERFANOS +
  '). Para subir el techo hay que JUSTIFICARLO en PERMITIDOS_HUERFANOS (motivo + version)' +
  ' y, si de verdad no se puede evitar, bajarlo en otro item de la hoja de ruta.',
);

// ─── 4 · Ningún huérfano anónimo: todos nombrados y con destino ───────
// v1.0.20 · LA VALLA SE COMPROBABA A SÍ MISMA EN FALSO por dos motivos, los dos
// de nombre y no de criterio:
//
//   a) Buscaba por `modBase` (el nombre corto) mientras la lista se escribe por
//      RUTA. El bucle de las filas moría en falso… y el de «fila aún necesaria»
//      (abajo) se salvaba por PREFIJO: `PERMITIDOS_HUERFANOS['busquedaWebNube']`
//      también casa con `busquedaWebNubeV2`. Hoy no hay colisión, pero el día que
//      la haya la fila perdonaría al módulo equivocado sin que nadie lo note.
//   b) `PRESUPUESTO_HUERFANOS` (26) y el número de filas coincidían, así que el
//      techo «se cumplía» sin que ninguna fila cubriera a los huérfanos reales:
//      32 huérfanos, 26 perdones.
//
// Se resuelve con UNA sola mirada, `perdonDe(ruta)`: ruta exacta primero, nombre
// corto sólo como compatibilidad. Y se exige que cada fila perdone a UN módulo.
const rutasDeLaLista = new Set(Object.keys(PERMITIDOS_HUERFANOS));
const perdonesPorNombre = {};
for (const k of rutasDeLaLista) {
  const corto = k.split('/').pop();
  (perdonesPorNombre[corto.replace(/\.tsx?$/, '')] = perdonesPorNombre[corto.replace(/\.tsx?$/, '')] || []).push(k);
}
function perdonDe(ruta) {
  if (rutasDeLaLista.has(ruta)) return PERMITIDOS_HUERFANOS[ruta];
  const corto = ruta.split('/').pop().replace(/\.tsx?$/, '');
  const porNombre = perdonesPorNombre[corto] || [];
  if (porNombre.length === 1) return PERMITIDOS_HUERFANOS[porNombre[0]];
  // `src/resumidorContexto.ts` está en la lista como `src/resumidorContexto`
  // (sin `src/engine/`): el nombre corto sigue sirviendo, pero si hay más de un
  // candidato NO se perdona a nadie — adivinar aquí es exactamente cómo la valla
  // se perdonaba a sí misma.
  return null;
}
afirmar(
  Object.values(perdonesPorNombre).every((v) => v.length === 1),
  'Cada nombre corto de PERMITIDOS_HUERFANOS apunta a UNA sola ruta (sin prefijos ambiguos): ' +
  Object.entries(perdonesPorNombre).filter(([, v]) => v.length > 1).map(([k]) => k).join(', '),
);
for (const h of huerfanos) {
  const p = perdonDe(h.ruta);
  afirmar(!!p, 'Huérfano declarado en PERMITIDOS_HUERFANOS: ' + h.ruta);
  if (p) {
    afirmar(typeof p.motivo === 'string' && p.motivo.length >= 12,
      h.modBase + ' tiene MOTIVO (no «por si acaso»): «' + p.motivo + '»');
    afirmar(/^v\d+\.\d+/.test(String(p.destino || '')),
      h.modBase + ' tiene VERSIÓN DE DESTINO (v1.68 / v1.69…): «' + p.destino + '»');
  }
}

// ─── 5 · La lista sólo puede ACHICARSE (trinquete en ambos sentidos) ───
// Una fila cuyo módulo ya está cableado es una fila MUERTA, y una lista con filas
// muertas vuelve a ser el adorno que era FASES durante doce versiones.
// v1.0.20 · por RUTA exacta, no por prefijo del nombre corto.
const huerfanoDeRuta = new Set(huerfanos.map((h) => h.ruta));
const huerfanoDeNombre = new Set(huerfanos.map((h) => h.modBase.replace(/\.tsx?$/, '')));
for (const key of Object.keys(PERMITIDOS_HUERFANOS)) {
  const clave = key;
  const corto = clave.split('/').pop().replace(/\.tsx?$/, '');
  // `huerfanoDeNombre` guarda `modBase` COMPLETO (`src/engine/x`), no el nombre
  // pelado: comparar con el pelado daba SIEMPRE falso y esta comprobación
  // —pensada para que la lista no se podra— gritaba «bórrala» sobre filas vivas.
  const existe = huerfanoDeRuta.has(clave) || huerfanoDeNombre.has(clave) || huerfanoDeRuta.has(clave + '.ts') || huerfanoDeRuta.has(clave + '.tsx');
  afirmar(existe,
    'Fila de PERMITIDOS_HUERFANOS aún necesaria: ' + key + ' — YA NO ESTÁ HUÉRFANO, bórrala.');
}
afirmar(
  Object.keys(PERMITIDOS_HUERFANOS).length === PRESUPUESTO_HUERFANOS,
  'PRESUPUESTO_HUERFANOS (' + PRESUPUESTO_HUERFANOS + ') == filas en PERMITIDOS_HUERFANOS (' +
  Object.keys(PERMITIDOS_HUERFANOS).length + '): las dos cifras son la misma decisión dicha una vez.',
);

// ─── 6 · ÍTEM 0.2 · aviso, NO fallo ─────────────────────────────────────
// «Importado» != «usado»: evidenciaTurno daba CABLEADO con refs=4 mientras su
// setEvidencia() nunca se llamaba. Pero un `import "./x"` de puro efecto es
// legítimo (así se montan las extensiones), así que esto se INFORMA y no se
// bloquea: sería una valla que exige marcar casillas en vez de detectar nada.
const importadoSinUso = filas.filter(
  (f) => f.vida === 'VIVO' && f.exportadores > 0 && f.refsReales === 0,
);

// ─── Veredicto ────────────────────────────────────────────────────────
const pct = totalAnalizados ? ((huerfanos.length / totalAnalizados) * 100).toFixed(1) : '?';
console.log('CENSO: ' + totalAnalizados + ' módulos · VIVO ' + (resumen.VIVO || 0) +
  ' · SOLO-TEST ' + (resumen['SOLO-TEST'] || 0) +
  ' · CLUSTER ' + (resumen.CLUSTER || 0) +
  ' · HUÉRFANO ' + (resumen['HUÉRFANO'] || 0));
console.log('HUÉRFANOS: ' + huerfanos.length + ' / ' + totalAnalizados + ' (' + pct + ' %) — techo ' + PRESUPUESTO_HUERFANOS);
if (huerfanos.length) {
  console.log('\nHuérfanos perdonados (cada uno es una decisión, no un olvido):');
  for (const h of huerfanos) {
    const p = PERMITIDOS_HUERFANOS[h.modBase] || {};
    console.log('  ' + h.modBase.padEnd(38) + ' ' + String(h.vida).padEnd(10) +
      ' → ' + (p.destino || 'SIN DESTINO') + ' · ' + (p.motivo || 'SIN MOTIVO'));
  }
}
if (importadoSinUso.length) {
  console.log('\nAVISO (ítem 0.2, no bloquea) — ' + importadoSinUso.length +
    ' módulo(s) importado(s) cuyos exports no se referencian fuera del import:')
  for (const f of importadoSinUso) {
    console.log('  ' + f.ruta + ' (' + f.importadores.length + ' importador(es)) — puede ser import de puro efecto');
  }
}

if (fallos.length) {
  console.log('\nDETALLE DE FALLOS:');
  for (const d of fallos) console.log('  ✗ ' + d);
  console.log('\nLa deuda NO se paga borrando el test ni subiendo el techo sin motivo.');
  console.log('Se paga con una de las tres decisiones de la hoja de ruta, por módulo:');
  console.log('  CABLEAR  → enchufarlo y borrar su fila de PERMITIDOS_HUERFANOS');
  console.log('  FUSIONAR → fundirlo con el que ya hace la mitad (jsonParcial -> parsearArgsConEstado)');
  console.log('  JUBILAR  → borrarlo con su test (dobleArbol.ts, Prioridad 4 de v1.67)');
}
console.log('\nVALLA DE HUÉRFANOS: ' + ok + ' correctas · ' + fallos.length + ' fallidas');
if (fallos.length) process.exitCode = 1;

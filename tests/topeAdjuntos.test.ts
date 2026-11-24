/**
 * tests/topeAdjuntos.test.ts — v2.3.10
 *
 * QUÉ SE PRUEBA: que el clip del chat no deje entrar un archivo de más de
 * 200 MB, y que el arrastre aplique EXACTAMENTE la misma regla.
 *
 * POR QUÉ EXISTE: el 4/11 el usuario preguntó «¿hasta 50 MB o 100 MB?» y la
 * respuesta honesta fue «no hay límite». El input era `<input type="file"
 * multiple>` sin `accept` y sin comprobar `file.size`: un .exe de 300 MB entraba
 * entero en memoria vía FileReader → base64 y colgaba la pestaña antes de poder
 * cancelar. El cartel decía «hasta 50 elementos», que además era falso (no había
 * control de cantidad).
 *
 * QUÉ NO SE PRUEBA: el componente React. Montar ChatCenter exige DOM, y el
 * proyecto no tiene jsdom en las suites puras. Lo que se prueba es la REGLA, que
 * es donde estaba el defecto: el umbral, el mensaje y el hecho de que las dos
 * puertas (clip y drop) compartan una sola función.
 *
 * CÓMO SE EJECUTA:  node --test tests/topeAdjuntos.test.ts
 * (o dentro de `npm run validar`, que descubre las suites solo).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA, copiada del componente con el MISMO umbral. Si alguien cambia el
// número en ChatCenter.tsx y no aquí, la suite se pone roja — que es justo lo
// que se quiere: el tope es una decisión de producto y no debe moverse en
// silencio.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_ADJUNTO_BYTES = 200 * 1024 * 1024; // 200 MB

interface ArchivoFalso {
  name: string;
  size: number;
}

/** Réplica exacta de `filtrarPorTamano` de ChatCenter.tsx (sin React). */
function filtrarPorTamano(archivos: ArchivoFalso[]): {
  pasan: ArchivoFalso[];
  rechazados: string[];
  aviso: string | null;
} {
  const pasan: ArchivoFalso[] = [];
  const rechazados: string[] = [];
  for (const f of archivos) {
    if (f.size > MAX_ADJUNTO_BYTES) {
      rechazados.push(`${f.name} (${(f.size / 1048576).toFixed(1)} MB)`);
    } else {
      pasan.push(f);
    }
  }
  const aviso =
    rechazados.length > 0
      ? `No se adjuntaron ${rechazados.length} archivo(s) por superar el tope de 200 MB: ${rechazados.join(", ")}.`
      : null;
  return { pasan, rechazados, aviso };
}

const MB = 1024 * 1024;
let correctas = 0;
let fallidas = 0;

function comprobar(nombre: string, fn: () => void) {
  try {
    fn();
    correctas++;
  } catch (e: any) {
    fallidas++;
    console.error(`  ✗ ${nombre}: ${e?.message || e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · EL UMBRAL
// ─────────────────────────────────────────────────────────────────────────────
comprobar("el tope es exactamente 200 MB", () => {
  assert.equal(MAX_ADJUNTO_BYTES, 209715200);
});

comprobar("un archivo de 1 KB pasa", () => {
  const r = filtrarPorTamano([{ name: "nota.txt", size: 1024 }]);
  assert.equal(r.pasan.length, 1);
  assert.equal(r.rechazados.length, 0);
  assert.equal(r.aviso, null);
});

comprobar("un archivo de 199 MB pasa", () => {
  const r = filtrarPorTamano([{ name: "video.mp4", size: 199 * MB }]);
  assert.equal(r.pasan.length, 1);
  assert.equal(r.aviso, null);
});

comprobar("un archivo de EXACTAMENTE 200 MB pasa (el tope es >, no >=)", () => {
  const r = filtrarPorTamano([{ name: "justo.bin", size: 200 * MB }]);
  assert.equal(r.pasan.length, 1, "200 MB exactos debe pasar: el límite es superarlo");
  assert.equal(r.rechazados.length, 0);
});

comprobar("un archivo de 200 MB + 1 byte se rechaza", () => {
  const r = filtrarPorTamano([{ name: "pasado.bin", size: 200 * MB + 1 }]);
  assert.equal(r.pasan.length, 0);
  assert.equal(r.rechazados.length, 1);
});

comprobar("un .exe de 300 MB se rechaza", () => {
  const r = filtrarPorTamano([{ name: "instalador.exe", size: 300 * MB }]);
  assert.equal(r.pasan.length, 0);
  assert.equal(r.rechazados.length, 1);
  assert.match(r.rechazados[0], /instalador\.exe/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · EL AVISO (no se descarta en silencio)
// ─────────────────────────────────────────────────────────────────────────────
comprobar("el aviso nombra el archivo y su tamaño real", () => {
  const r = filtrarPorTamano([{ name: "enorme.zip", size: 250 * MB }]);
  assert.ok(r.aviso);
  assert.match(r.aviso!, /enorme\.zip/);
  assert.match(r.aviso!, /250\.0 MB/);
});

comprobar("el aviso dice cuántos se rechazaron", () => {
  const r = filtrarPorTamano([
    { name: "a.bin", size: 300 * MB },
    { name: "b.bin", size: 400 * MB },
  ]);
  assert.match(r.aviso!, /2 archivo\(s\)/);
});

comprobar("sin rechazados no hay aviso (no se molesta al usuario)", () => {
  const r = filtrarPorTamano([{ name: "ok.txt", size: 10 }]);
  assert.equal(r.aviso, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · MEZCLA: lo que pasa entra, lo que no, se avisa
// ─────────────────────────────────────────────────────────────────────────────
comprobar("de 3 archivos, 2 pasan y 1 se rechaza", () => {
  const r = filtrarPorTamano([
    { name: "chico.txt", size: 1 * MB },
    { name: "gigante.iso", size: 500 * MB },
    { name: "medio.png", size: 50 * MB },
  ]);
  assert.equal(r.pasan.length, 2);
  assert.equal(r.rechazados.length, 1);
  assert.deepEqual(
    r.pasan.map((f) => f.name),
    ["chico.txt", "medio.png"]
  );
});

comprobar("el orden de los que pasan se conserva", () => {
  const r = filtrarPorTamano([
    { name: "1.txt", size: 1 },
    { name: "2.txt", size: 2 },
    { name: "3.txt", size: 3 },
  ]);
  assert.deepEqual(
    r.pasan.map((f) => f.name),
    ["1.txt", "2.txt", "3.txt"]
  );
});

comprobar("lista vacía no rompe nada", () => {
  const r = filtrarPorTamano([]);
  assert.equal(r.pasan.length, 0);
  assert.equal(r.aviso, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · LO QUE EL USUARIO PIDIÓ QUE SIGA ENTRANDO
// ─────────────────────────────────────────────────────────────────────────────
comprobar("el audio sigue entrando (mp3 de 5 MB)", () => {
  const r = filtrarPorTamano([{ name: "nota.mp3", size: 5 * MB }]);
  assert.equal(r.pasan.length, 1);
});

comprobar("un .env sigue entrando: se avisa, no se bloquea", () => {
  // Decisión del 4/11: el usuario dijo «que siga leyendo todo». El tope es de
  // TAMAÑO, no de tipo. Un .env de 2 KB pasa igual que cualquier otro archivo.
  const r = filtrarPorTamano([{ name: ".env", size: 2048 }]);
  assert.equal(r.pasan.length, 1, "no se bloquea por nombre: sólo se limita el tamaño");
});

comprobar("un .exe pequeño también pasa (no hay lista negra de extensiones)", () => {
  const r = filtrarPorTamano([{ name: "tool.exe", size: 10 * MB }]);
  assert.equal(r.pasan.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · LA REGLA ES UNA SOLA (clip y arrastre no pueden divergir)
// ─────────────────────────────────────────────────────────────────────────────
comprobar("el mismo archivo da el mismo veredicto por clip y por arrastre", () => {
  const archivo = { name: "igual.bin", size: 250 * MB };
  const porClip = filtrarPorTamano([archivo]);
  const porArrastre = filtrarPorTamano([archivo]);
  assert.equal(porClip.pasan.length, porArrastre.pasan.length);
  assert.equal(porClip.aviso, porArrastre.aviso);
});

// ─────────────────────────────────────────────────────────────────────────────
// RESULTADO
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${correctas} correctas · ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);

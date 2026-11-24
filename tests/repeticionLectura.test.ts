/**
 * repeticionLectura.test.ts — v1.63.0
 * ====================================
 * Cada fase del proyecto = DEFECTO SEMBRADO + CONTROL DE FALSO POSITIVO.
 *
 *  (1) DEFECTO SEMBRADO: el bucle real del chat exportado — memory_estado →
 *      memory_listar_pages → read_file → read_file repetido N veces con la
 *      MISMA salida. El lazo suave consecutivo NO lo caza (rota entre
 *      herramientas). Esta guarda SÍ: deduplica y, al tope, corta.
 *
 *  (2) CONTROL DE FALSO POSITIVO: releer un archivo DESPUÉS de escribirlo es
 *      legítimo — NO se debe penalizar. Verificamos que una escritura resetea
 *      la cuenta de ese path.
 */
import { strict as assert } from "node:assert";
import {
  nuevoEstadoLectura,
  evaluarLectura,
  registrarEscrituraLectura,
  esHerramientaLectura,
  UMBRAL_LECTURA_REPETIDA,
  TOPE_LECTURA_REPETIDA,
} from "../src/engine/repeticionLectura";

let pasados = 0;
function prueba(nombre: string, fn: () => void): void {
  try { fn(); pasados++; console.log(`  ✓ ${nombre}`); }
  catch (e) { console.error(`  ✗ ${nombre}`); throw e; }
}

console.log("repeticionLectura — guarda de relectura idéntica (v1.63.0)");

prueba("clasifica herramientas de lectura (incl. packs memory_*)", () => {
  assert.equal(esHerramientaLectura("read_file"), true);
  assert.equal(esHerramientaLectura("memory_estado"), true);
  assert.equal(esHerramientaLectura("memory_listar_pages"), true);
  assert.equal(esHerramientaLectura("list_files"), true);
  // las herramientas de obra NO son de lectura: tienen su propio circuito.
  assert.equal(esHerramientaLectura("write_file"), false);
  assert.equal(esHerramientaLectura("edit_file"), false);
});

prueba("la 1ª lectura pasa intacta (no deduplica)", () => {
  const e = nuevoEstadoLectura();
  const v = evaluarLectura(e, "read_file", '{"path":"a.ts"}', "CONTENIDO", "a.ts");
  assert.equal(v.veces, 1);
  assert.equal(v.deduplicar, false);
  assert.equal(v.cortar, false);
});

prueba("DEFECTO SEMBRADO: ciclo rotado memory→memory→read→read repetido se deduplica y luego corta", () => {
  const e = nuevoEstadoLectura();
  const ciclo = [
    { n: "memory_estado", a: "{}", s: '{"ok":true,"paginas":42,"bytes":99999}', p: undefined as string | undefined },
    { n: "memory_listar_pages", a: "{}", s: '{"ok":true,"pages":["p1","p2","p3"]}', p: undefined },
    { n: "read_file", a: '{"path":"x.ts"}', s: "export const X = 1;", p: "x.ts" },
    { n: "read_file", a: '{"path":"y.ts"}', s: "export const Y = 2;", p: "y.ts" },
  ];
  const vistosCorte = new Set<string>();
  // 8 vueltas idénticas, como en el chat real.
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    for (const paso of ciclo) {
      const v = evaluarLectura(e, paso.n, paso.a, paso.s, paso.p);
      // la 1ª vuelta pasa; a partir de la repetición idéntica se deduplica.
      if (vuelta >= UMBRAL_LECTURA_REPETIDA - 1 && v.veces >= UMBRAL_LECTURA_REPETIDA) {
        assert.equal(v.deduplicar, true, `${paso.n} debería deduplicar en la vuelta ${vuelta}`);
        assert.ok(v.nota && v.nota.length > 0);
      }
      if (v.cortar) vistosCorte.add(paso.n);
    }
  }
  // al tope, el ciclo se corta (no sigue hasta el infinito).
  assert.ok(vistosCorte.size > 0, "el bucle de relectura debió cortarse al llegar al tope");
});

prueba("umbral exacto: deduplica en la 2ª, corta en la 4ª (misma firma)", () => {
  const e = nuevoEstadoLectura();
  const leer = () => evaluarLectura(e, "memory_estado", "{}", '{"ok":true,"n":1}');
  assert.equal(leer().veces, 1);           // 1ª
  assert.equal(leer().deduplicar, true);   // 2ª == UMBRAL(2)
  const tercera = leer();                  // 3ª
  assert.equal(tercera.deduplicar, true);
  assert.equal(tercera.cortar, false);
  const cuarta = leer();                   // 4ª == TOPE(4)
  assert.equal(cuarta.cortar, true);
  assert.equal(UMBRAL_LECTURA_REPETIDA, 2);
  assert.equal(TOPE_LECTURA_REPETIDA, 4);
});

prueba("salida DISTINTA no se deduplica (no es el mismo contenido)", () => {
  const e = nuevoEstadoLectura();
  const a = evaluarLectura(e, "read_file", '{"path":"log.txt"}', "linea 1", "log.txt");
  const b = evaluarLectura(e, "read_file", '{"path":"log.txt"}', "linea 1\nlinea 2", "log.txt");
  assert.equal(a.deduplicar, false);
  assert.equal(b.deduplicar, false); // cambió la salida → firma distinta → legítimo
});

prueba("CONTROL DE FALSO POSITIVO: releer TRAS escribir el mismo path NO se penaliza", () => {
  const e = nuevoEstadoLectura();
  // el modelo lee el archivo un par de veces mientras piensa (se acumula firma).
  evaluarLectura(e, "read_file", '{"path":"main.ts"}', "v1", "main.ts");
  const dup = evaluarLectura(e, "read_file", '{"path":"main.ts"}', "v1", "main.ts");
  assert.equal(dup.deduplicar, true); // 2ª lectura idéntica → ya deduplica
  // ahora ESCRIBE el archivo (obra) → su contenido cambió.
  registrarEscrituraLectura(e, true, "main.ts");
  // la relectura de verificación tras la escritura es LEGÍTIMA: no se penaliza
  // aunque la salida resulte ser todavía idéntica (p. ej. el editor no cambió nada).
  const reVerif = evaluarLectura(e, "read_file", '{"path":"main.ts"}', "v1", "main.ts");
  assert.equal(reVerif.deduplicar, false, "la relectura tras escritura NO debe deduplicar");
  assert.equal(reVerif.veces, 0, "la escritura reinició la cuenta de ese path (relectura perdonada)");
  // y tras perdonar, la cuenta arranca de cero: una nueva lectura idéntica es la 1ª.
  const siguiente = evaluarLectura(e, "read_file", '{"path":"main.ts"}', "v1", "main.ts");
  assert.equal(siguiente.veces, 1);
  assert.equal(siguiente.deduplicar, false);
});

prueba("la escritura de un path NO afecta la cuenta de OTRO path", () => {
  const e = nuevoEstadoLectura();
  evaluarLectura(e, "read_file", '{"path":"a.ts"}', "A", "a.ts");
  evaluarLectura(e, "read_file", '{"path":"a.ts"}', "A", "a.ts"); // dedup de a.ts
  registrarEscrituraLectura(e, true, "b.ts"); // escribimos OTRO archivo
  const v = evaluarLectura(e, "read_file", '{"path":"a.ts"}', "A", "a.ts");
  assert.equal(v.deduplicar, true, "escribir b.ts no debe perdonar el bucle de a.ts");
});

prueba("una herramienta NO-lectura nunca dispara la guarda", () => {
  const e = nuevoEstadoLectura();
  for (let i = 0; i < 10; i++) {
    const v = evaluarLectura(e, "write_file", '{"path":"z.ts"}', "igual", "z.ts");
    assert.equal(v.deduplicar, false);
    assert.equal(v.cortar, false);
  }
});

console.log(`\n✓ repeticionLectura: ${pasados} pruebas pasadas`);

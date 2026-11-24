/**
 * tests/recalceHibrido.test.ts — REORDENADO HÍBRIDO (v1.76.0)
 * ===========================================================
 * Congela la fusión RRF (palabra + vector) del laboratorio `hybrid_rerank`:
 *   - una sola lista replica su orden EXACTO (no reordena lo que no puede
 *     medir — el falso positivo base del reranking);
 *   - estar en las dos listas mejora el puesto; desaparecer de la otra no
 *     alcanza para subir desde abajo;
 *   - el empate de fusión se resuelve por orden canónico de id — determinismo
 *     byte a byte entre corridas y neutralidad (el consenso léxico no pierde
 *     contra la magnitud bruta del coseno);
 *   - la normalización léxica ignora acentos/mayúsculas y no traga stopwords;
 *   - DEFECTO SEMBRADO (lectura de fuente): el cable del modo híbrido vive en
 *     LocalRAG (`fusionarListas` importado y la opción `híbrido` aplicada en
 *     `search`) — si alguien lo desconecta, la suite se pone roja.
 */
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  K_RRF,
  tokenizarRecalce,
  puntajeLexico,
  fusionarPorPuesto,
  fusionarListas,
} from "../src/engine/recalceHibrido";

type Caso = { nombre: string; fn: () => void };
const casos: Caso[] = [];
const prueba = (nombre: string, fn: () => void) => casos.push({ nombre, fn });

const cand = (id: string, texto: string, score: number) => ({
  id,
  source: `${id}.md`,
  text: texto,
  score,
});
// La lista léxica del mundo real trae SU puntuación cruda (la que usará el
// desempate cuando dos candidatos sumen el mismo RRF): se simula con un
// decaimiento por puesto, no con ceros que borrarían la señal.
const lex = (id: string, texto: string, sl: number) => ({ id, source: `${id}.md`, text: texto, score: sl });

// —— FALSO POSITIVO base: una sola lista = orden intacto ——
prueba("RRF con una sola lista replica su orden EXACTO", () => {
  const v = [cand("a", "sanda", 0.91), cand("b", "naranja", 0.8), cand("c", "mandarina", 0.7)];
  const out = fusionarPorPuesto(v, []);
  assert.deepStrictEqual(out.map((r) => r.candidato.id), ["a", "b", "c"]);
});

prueba("lista vector vacía → manda la léxica en su orden", () => {
  const l = [cand("m", "x", 0), cand("n", "y", 0)];
  const out = fusionarPorPuesto([], l);
  assert.deepStrictEqual(out.map((r) => r.candidato.id), ["m", "n"]);
});

// —— la propiedad que se compra con RRF ——
prueba("estar en las DOS listas sube por encima del líder de una sola", () => {
  // vector: a b c …   léxica: d (puesto 1), a (puesto 2)
  const v = [cand("a", "alfa", 0.9), cand("b", "bravo", 0.8), cand("c", "charly", 0.7)];
  const l = [lex("d", "delta", 0.8), lex("a", "alfa", 0.5)];
  const out = fusionarPorPuesto(v, l);
  // a: 1/61 + 1/62 ; d: solo 1/61 → a gana
  assert.strictEqual(out[0].candidato.id, "a");
  assert.strictEqual(out[1].candidato.id, "d");
  assert.ok(out[0].puestoVector === 1 && out[0].puestoLexico === 2);
});

prueba("el consenso siempre paga: 2+2 supera a 1+0, y el empate exacto se resuelve por id (determinismo)", () => {
  // Aritmética RRF medida: 1/62+1/63 (consenso bajo) > 1/61 (líster solo de
  // una fuente) — el consenso entre dos recuperadores NUNCA queda por debajo
  // del líder solitario. Y con RRF idéntico (1+2 vs 2+1) gana el id canónico:
  // estable entre corridas y neutral entre fuentes.
  const v2 = [cand("x", "uno", 0.9), cand("y", "dos", 0.8), cand("z", "tres", 0.7)];
  const l2 = [lex("y", "dos", 0.6), lex("z", "tres", 0.4)];
  const out2 = fusionarPorPuesto(v2, l2);
  // y(1+1) gana solo; x(1+0) y z(3+2) empatan en RRF y el desempate canónico
  // pone a z delante — el consenso bajo alcanza al líder solitario y el
  // desempate NO premia la magnitud bruta del vector.
  assert.deepStrictEqual(out2.map((r) => r.candidato.id), ["y", "z", "x"]);
  const v = [cand("b", "bravo", 0.9), cand("a", "alfa", 0.8), cand("c", "charly", 0.7)];
  const l = [lex("a", "alfa", 0.6), lex("b", "bravo", 0.4)];
  const out = fusionarPorPuesto(v, l);
  assert.strictEqual(out[0].candidato.id, "a", "empate 1/61+1/62: gana id 'a' por orden canónico");
  assert.strictEqual(out[1].candidato.id, "b");
});

prueba("K_RRF es 60 — constante pública del método, no dial inventado", () => {
  assert.strictEqual(K_RRF, 60);
});

// —— determinismo ——
prueba("determinismo: la misma entrada produce exactamente la misma salida ×50", () => {
  const v = [cand("a", "alfa", 0.9), cand("b", "bravo", 0.85), cand("c", "charly", 0.8), cand("d", "delta", 0.7)];
  const query = "bravo charly";
  const primera = JSON.stringify(fusionarListas(query, v, 4));
  for (let i = 0; i < 50; i++) assert.strictEqual(JSON.stringify(fusionarListas(query, v, 4)), primera);
});

// —— capa léxica ——
prueba("tokeniza sin acentos y en minúsculas; descarta stopwords", () => {
  const t = tokenizarRecalce("¿Cómo se configura la Memoria? de la Cerebro");
  assert.ok(t.includes("como"));
  assert.ok(t.includes("memoria"));
  assert.ok(!t.includes("de") && !t.includes("la"));
});

prueba("puntaje léxico: recubrimiento proporcional + frase exacta premia", () => {
  const s1 = puntajeLexico("vectorizacion memoria local", "la vectorizacion de la memoria es local y rapida");
  const s2 = puntajeLexico("vectorizacion memoria local", "hoy hace buen clima en la ciudad");
  assert.ok(s1 > s2);
  assert.strictEqual(s2, 0);
  const exacta = puntajeLexico("presupuesto de tokens", "el presupuesto de tokens del nodo se agoto");
  const parcial = puntajeLexico("presupuesto tokens", "el presupuesto de tokens del nodo se agoto");
  assert.ok(exacta > parcial, "la frase exacta debe sumar más que tokens sueltos");
});

// —— API de un paso sobre lista vectorial ——
prueba("fusionarListas sube el fragmento con el vocablo completo que el vector tenía en cola", () => {
  const v = [
    // a: el vecino semántico — le falta «estatico» del vocablo de la consulta
    cand("a", "regla de despliegue del sandbox", 0.9),
    cand("b", "la memoria vectorial ocupa float32", 0.85),
    // c: tiene TODAS las palabras exactas y el vector lo tenía dormido en cola
    cand("c", "sandbox estatico: regla de despliegue exacta del sandbox", 0.6),
  ];
  const out = fusionarListas("sandbox estatico regla despliegue", v, 3);
  assert.strictEqual(out.length, 3);
  const ids = out.map((r) => r.candidato.id);
  // a(1+2)=c(3+1) empatan en RRF y el desempate canónico los deja a,c; lo que
  // de verdad prueba el caso es que c SALIÓ de la cola del vector (pv=3) y
  // quedó colado con el líder pese a que el coseno lo tenía dormido.
  assert.ok(ids.indexOf("c") === 1 || ids.indexOf("c") === 0, `c debía pelear el frente, salió ${ids.join(",")}`);
  assert.ok(ids.indexOf("c") < ids.indexOf("b"), "c (consenso léxico total) pasa a b (solo vector o solo léxico, ninguno)");
  assert.strictEqual(out.find((r) => r.candidato.id === "c")!.puestoVector, 3, "el vector lo tenía tercero: el rerank lo subió");
  assert.ok(out.every((r) => !["d", "e"].includes(r.candidato.id)));
});

prueba("FALSO POSITIVO: consulta sin tokens útiles deja el orden vectorial intacto", () => {
  const v = [cand("a", "alfa", 0.9), cand("b", "bravo", 0.8), cand("c", "charly", 0.7)];
  const out = fusionarListas("de la el", v, 3);
  assert.deepStrictEqual(out.map((r) => r.candidato.id), ["a", "b", "c"]);
});

// —— DEFECTO SEMBRADO: el cable tiene que existir en LocalRAG ——
prueba("cable en LocalRAG: importa fusionarListas y honra la opcion hibrido", () => {
  const fuente = fs.readFileSync(path.join(process.cwd(), "src", "engine", "localRAG.ts"), "utf-8");
  assert.ok(/import\s*{[^}]*fusionarListas[^}]*}\s*from\s*["']\.\/recalceHibrido["']/.test(fuente), "localRAG debe importar fusionarListas de recalceHibrido");
  assert.ok(/h[íi]brido/.test(fuente), "search() debe admitir la opción híbrido");
  assert.ok(/fusionarListas\s*\(/.test(fuente), "search() debe LLAMAR a fusionarListas (no solo importarla)");
  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf-8");
  assert.ok(/isOn\("hybrid_rerank"\)/.test(server), "server.ts debe pasar la bandera hybrid_rerank al RAG");
});

// —— runner ——
let pasados = 0;
const fallos: string[] = [];
for (const c of casos) {
  try { c.fn(); pasados++; console.log?.(`  ✓ ${c.nombre}`); }
  catch (e) { fallos.push(c.nombre); console.error?.(`  ✗ ${c.nombre}\n    ${(e as Error).message}`); }
}
console.log(`\nrecalceHibrido: ${pasados}/${casos.length} OK`);
if (fallos.length) { console.error(`FALLOS: ${fallos.join(", ")}`); process.exit(1); }
